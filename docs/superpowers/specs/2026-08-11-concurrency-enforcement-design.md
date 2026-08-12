# Concurrency enforcement: metering concurrent agent tasks

Date: 2026-08-11
Status: approved, ready for planning
Scope: Phase 1 — server-side reservation, release, and sweep, plus the harness tagging
its gateway calls. The "what is using my slots" UI is Phase 2 and is out of scope here.

Companion: `prompd-web/docs/pricing-and-packaging.md`, which establishes concurrency as
the paid axis and explains why.

## Why concurrency

Under BYOK the customer's tokens are the customer's cost, so metering usage would be
both dishonest and strategically wasteful — the surprise-bill problem is the loudest
complaint about the competitive set, and avoiding it is the one structural pricing
advantage this product has. What we do supply is compute, orchestration and session
storage, and what a customer actually buys is the ability to have more work in flight at
once. That is also the category's own maturity yardstick (operator leverage: concurrent
agent tasks per human), so pricing and positioning end up speaking one language.

The consequence that shapes this design: enforcement must sit **outside** the own-key
short-circuit in `validateAiQuota` / `reserveAiExecution`. Those return `unlimited: true`
the moment a user has their own key, which is correct for tokens and exactly wrong here.
BYOK users are the ones this axis charges.

## The unit: one logical run

One reserved slot is one **logical run** — an agent turn, a workflow run, an eval run, a
single prompt execution. A strategy that fans out to five subagents is **one** task, not
five.

Rejected alternatives:

- *One in-flight gateway request.* Airtight and needs nothing from the client, but a
  five-way fanout instantly reads as five concurrent. Free-at-1 could not run a single
  strategy and Pro-at-3 would choke on ordinary work. It meters the wrong thing and taxes
  the orchestration the product exists to sell.
- *One leaf LLM call with fanout discounted.* Closer to true resource use, impossible to
  explain on a pricing page.

The chosen unit requires the client to declare a run id, so enforcement is advisory
rather than airtight. See "The honest gap" below.

## Ownership: user now, org later

Slots key on an opaque `ownerId`, which in v1 is always the user id.

Pooling at the organization for Team was considered and deferred: prompd-app does not
know org membership (organizations live in Clerk and the registry; the app's `User` model
has no org field), building that lookup is a feature in itself, and there are zero Team
customers today. Keying on an opaque owner means switching to an org id later is a data
change, not a redesign.

## Data model

Embedded on the user document beside the quota counters it sits next to:

```js
aiFeatures.activeRuns: [
  { runId, kind, label, startedAt, lastSeenAt }
]
```

- `runId` — client-generated, unique per logical run
- `kind` — `agent | workflow | eval | prompt`
- `label` — display text, for Phase 2 and for the refusal payload
- `startedAt` / `lastSeenAt` — server-assigned `Date`s. Client timestamps are never
  trusted, which also removes clock skew between Cloud Run instances as a concern.

### Reserve is two operations

Mirroring `middleware/aiReserve.js`, which already solved the harder version of this
problem: it collapsed a check-then-act race into one conditional `$inc` guarded by
`used < limit`, so the database enforces the ceiling. Concurrency is the same discipline
with a counter that also goes down.

1. **Sweep** — `$pull` every slot whose `lastSeenAt` is older than the TTL.
   Unconditional and idempotent. This is what stops a crashed client from costing a slot
   permanently.
2. **Guarded push** — a `findOneAndUpdate` that `$push`es only when
   `$expr: { $lt: [ { $size: { $ifNull: ['$aiFeatures.activeRuns', []] } }, limit ] }`
   holds. No match means the user is at the ceiling; the write simply does not happen.

Two operations rather than one because MongoDB cannot `$pull` and `$push` the same array
in a single update. The window between them is benign: the worst case counts a slot that
is about to expire, which is over-strict for one attempt and self-corrects on the next.

**Release** is a `$pull` by `runId` — idempotent, so a double release is a no-op.

## Lifecycle

Hybrid: the work itself claims the slot, an explicit call frees it, and a TTL reclaims
what neither covers.

| Trigger | Effect |
| --- | --- |
| Gateway call carrying `X-Prompd-Run` (+ `X-Prompd-Run-Kind`) | First sighting reserves; later calls refresh `lastSeenAt` |
| `POST /api/v1/runs/:id/heartbeat` | Refreshes `lastSeenAt` for a run with no gateway traffic |
| `DELETE /api/v1/runs/:id` | Releases immediately |
| `GET /api/v1/runs` | Lists active slots (refusal payload, Phase 2 UI) |
| `GET /api/v1/entitlements?feature=concurrency` | Pre-check for client guards |
| TTL lapse | Swept on the next reserve for that owner |

The heartbeat exists because a run can legitimately go quiet: blocked on a tool, or
parked waiting for a `propose_edit` verdict. Inferring liveness from gateway traffic
alone would kill exactly the runs that are waiting on the user. The harness heartbeats
roughly every 60 seconds while a run is open.

**TTL: 5 minutes** since `lastSeenAt` — comfortably longer than the heartbeat interval,
short enough that a stranded slot self-heals before it reads as a bug.

Rejected alternatives:

- *TTL-only release.* No new endpoints, but a finished run holds its slot until the TTL
  lapses. At Free-of-1 that is a minute of "you already have a run in progress" after
  finishing.
- *Reserve-before-work via an explicit endpoint only.* Precise, but it requires the
  harness to get a reservation call right before any work happens on every path
  including error and cancel, and a missed release strands a slot with nothing else
  claiming it.

## Limits and refusal

Read from the canonical plan via `normalizePlan` (see `config/plans.js`):

| Plan | Concurrent runs |
| --- | --- |
| free | 1 |
| pro | 3 |
| team | 5 |
| enterprise | unlimited (`-1`) |
| admin | unlimited (`-1`) |

Unlimited plans skip reservation entirely — no document growth, no sweep cost.

Note a deliberate divergence from the pricing doc, which describes Team as "pooled per
org." Since org pooling is deferred, Team in v1 is a flat 5 per user. That is more
generous per head than the pooled intent, which is the safe direction to be wrong in
while there are no Team customers to disappoint.

Refusal is **429** with the active-run list, so the client can say which run is holding
the slot rather than presenting a dead end:

```json
{
  "error": {
    "code": "CONCURRENCY_LIMIT",
    "message": "You already have 1 run in progress.",
    "limit": 1,
    "active": [
      { "runId": "r_123", "kind": "agent", "label": "Editor run", "startedAt": "2026-08-11T12:00:00.000Z" }
    ],
    "upgrade_required": "pro"
  }
}
```

`429` rather than the `402` the quota path uses: this is a rate condition that resolves
on its own, not a payment condition.

Refusal deliberately does **not** queue. Queueing is a scheduler — fairness, depth,
timeouts, ordering, and a UI for "you are third in line" — and it is strange to build the
thing customers are paying to skip. A queued run at Free-of-1 behind a long agent turn
also feels broken in a way an honest refusal does not.

## Failure modes

| Case | Behavior |
| --- | --- |
| Browser closed mid-run | Slot reclaimed after the TTL |
| Release never sent (crash, network loss) | Same |
| Double release | No-op |
| Reserve retried with the same `runId` | Refreshes `lastSeenAt`; never double-counts |
| Clock skew across instances | Server-assigned dates only |
| Unlimited plan | Reservation skipped entirely |
| Client omits `X-Prompd-Run` | Unmetered in v1 — see below |

### The honest gap

A client that omits the run header bypasses the limit, and one that reuses a single id
across genuinely separate runs under-declares. Closing this means refusing untagged
gateway calls, which breaks any client version that has not shipped the header — an
availability risk during a deploy, in exchange for closing a hole whose exploitation
costs us orchestration capacity rather than model spend.

v1 therefore ships **permissive**: untagged calls proceed and are logged with a counter.
Once telemetry shows the harness tagging effectively everything, a follow-up flips the
policy to strict. This is a deliberate sequencing decision, recorded here so it is not
rediscovered as a surprise.

Two things make the gap narrower than it sounds: prompd-web is closed-source, and BYOK
users are spending their own tokens, so what an under-declaring client gains is
orchestration capacity rather than free inference.

## Testing

`middleware/aiReserve.test.js` is the model — inject the Mongoose model, no live database.

- reserve succeeds below the limit
- reserve refuses at the limit, and the refusal carries the active-run list
- a slot past its TTL is swept, after which reserve succeeds
- concurrent reserves resolve to exactly `limit` winners (the guarded update is the
  point of the design; this is the test that proves it)
- release is idempotent; releasing an unknown `runId` is a no-op
- re-reserving an existing `runId` refreshes rather than duplicating
- unlimited plans never touch the array
- a legacy stored plan id (`team_plan`) still resolves to the right limit through
  `normalizePlan`

## Out of scope

- The Phase 2 UI: active-run list, stop button, and the operator-leverage metric.
- Org-pooled slots (deferred above).
- Queueing (rejected above).
- Strict rejection of untagged calls (sequenced after v1).
- Any change to token quotas — `aiQuota` and `aiReserve` are untouched by this work.

# Concurrency Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limit how many logical runs a user can have in flight at once, enforced server-side, as the paid axis of the pricing model.

**Architecture:** A new `runSlots` module in `prompd-app/backend` holds the reserve / release / sweep logic, modeled on `middleware/aiReserve.js`'s guarded-update discipline: the database enforces the ceiling so racing requests cannot both win. Slots live in an array on the user document. The gateway claims a slot when it sees a tagged request, the client releases explicitly, and a TTL reclaims anything neither covers. The harness tags its gateway calls with a run id and heartbeats while a run is open.

**Tech Stack:** Node/Express (ESM), Mongoose, jest (`node --experimental-vm-modules`), TypeScript on the harness side.

**Spec:** `docs/superpowers/specs/2026-08-11-concurrency-enforcement-design.md` — read it before Task 1, especially the "Two separate gates" section.

## Global Constraints

- **Two gates, not one.** `reserveAiExecution` / `validateAiQuota` return early for own-key users (`if (hasOwnKey || isUnmeteredPlan(user)) return ...`). The concurrency check must NOT live below that line in those functions — every serious user would skip it. It is a separate call in the route, evaluated FIRST. Only a plan limit of `-1` (enterprise, admin) exempts a user; having an API key never does.
- **Reserve the slot before the token reservation** so a concurrency refusal never has to refund a token unit.
- `aiQuota.js` and `aiReserve.js` are NOT modified by this plan. New code sits beside them.
- Plan values are read through `normalizePlan` from `config/plans.js`. Never compare raw registry ids.
- Server-assigned dates only. Client timestamps are never trusted.
- ESM with `.js` extensions on relative imports. No emoji in code or log output.
- v1 is **permissive**: a gateway call with no run header proceeds unmetered and increments a counter in the log. Do not refuse untagged calls.
- Tests follow `middleware/aiReserve.test.js`: inject the model (`opts.model`), no live database.
- Test commands from `prompd-app/backend`: `npm test` (whole suite), `npm test -- src/path/file.test.js` (one file).
- Repo state: `prompd-app` is on branch `feat/images-generation-gateway` with other work on it. Stage only the files each task names; never `git add -A`. Do not switch branches.

---

### Task 1: The runSlots module

**Files:**
- Create: `backend/src/middleware/runSlots.js`
- Test: `backend/src/middleware/runSlots.test.js`

**Interfaces:**
- Consumes: `PLANS`, `normalizePlan` from `../config/plans.js`; the `User` model as an injectable default (`opts.model`), exactly as `aiReserve.js` does.
- Produces:
  - `RUN_SLOT_TTL_MS` — `5 * 60 * 1000`
  - `concurrencyLimitFor(plan): number` — `-1` means unlimited
  - `reserveRunSlot(user, { runId, kind, label }, opts?): Promise<{ allowed, unlimited?, refreshed?, status?, limit?, active?, upgradeRequired? }>`
  - `releaseRunSlot(user, runId, opts?): Promise<void>`
  - `listRunSlots(user, opts?): Promise<Array<{ runId, kind, label, startedAt }>>`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect, jest } from '@jest/globals'
import { reserveRunSlot, releaseRunSlot, listRunSlots, concurrencyLimitFor, RUN_SLOT_TTL_MS } from './runSlots.js'
import { PLANS } from '../config/plans.js'

const OWNER = 'u1'
const now = () => new Date()
const ago = (ms) => new Date(Date.now() - ms)

/** In-memory stand-in for the Mongoose model, mirroring aiReserve.test.js's injection.
 * updateOne applies a $pull/$push against a single stored doc and reports modifiedCount,
 * which is what the guarded write depends on. */
function fakeModel(activeRuns = []) {
  const doc = { _id: OWNER, aiFeatures: { activeRuns: [...activeRuns] } }
  return {
    doc,
    async updateOne(filter, update) {
      const runs = doc.aiFeatures.activeRuns
      if (update.$pull?.['aiFeatures.activeRuns']?.runId) {
        const before = runs.length
        doc.aiFeatures.activeRuns = runs.filter((r) => r.runId !== update.$pull['aiFeatures.activeRuns'].runId)
        return { modifiedCount: before === doc.aiFeatures.activeRuns.length ? 0 : 1 }
      }
      if (update.$pull?.['aiFeatures.activeRuns']?.lastSeenAt) {
        const cutoff = update.$pull['aiFeatures.activeRuns'].lastSeenAt.$lt
        const before = runs.length
        doc.aiFeatures.activeRuns = runs.filter((r) => r.lastSeenAt >= cutoff)
        return { modifiedCount: before === doc.aiFeatures.activeRuns.length ? 0 : 1 }
      }
      if (update.$set) { // refresh lastSeenAt for an existing run
        const r = runs.find((x) => x.runId === filter['aiFeatures.activeRuns.runId'])
        if (!r) return { modifiedCount: 0 }
        r.lastSeenAt = now()
        return { modifiedCount: 1 }
      }
      if (update.$push) {
        // honor the $expr size guard the real query carries
        const limit = filter.$expr?.$lt?.[1]
        if (typeof limit === 'number' && runs.length >= limit) return { modifiedCount: 0 }
        runs.push(update.$push['aiFeatures.activeRuns'])
        return { modifiedCount: 1 }
      }
      return { modifiedCount: 0 }
    },
    async findById() { return doc },
  }
}

const user = (plan = PLANS.FREE) => ({ _id: OWNER, subscription: { plan } })

describe('concurrencyLimitFor', () => {
  it('maps each canonical plan to its ceiling', () => {
    expect(concurrencyLimitFor(PLANS.FREE)).toBe(1)
    expect(concurrencyLimitFor(PLANS.PRO)).toBe(3)
    expect(concurrencyLimitFor(PLANS.TEAM)).toBe(5)
    expect(concurrencyLimitFor(PLANS.ENTERPRISE)).toBe(-1)
    expect(concurrencyLimitFor(PLANS.ADMIN)).toBe(-1)
  })

  it('resolves a legacy stored registry id through normalizePlan', () => {
    expect(concurrencyLimitFor('team_plan')).toBe(5)
    expect(concurrencyLimitFor('enterprise_plan')).toBe(-1)
  })
})

describe('reserveRunSlot', () => {
  it('reserves below the limit', async () => {
    const model = fakeModel()
    const r = await reserveRunSlot(user(PLANS.PRO), { runId: 'r1', kind: 'agent' }, { model })
    expect(r.allowed).toBe(true)
    expect(model.doc.aiFeatures.activeRuns).toHaveLength(1)
  })

  it('refuses at the limit and reports what is holding the slot', async () => {
    const model = fakeModel([{ runId: 'r1', kind: 'agent', label: 'Editor run', startedAt: now(), lastSeenAt: now() }])
    const r = await reserveRunSlot(user(PLANS.FREE), { runId: 'r2', kind: 'agent' }, { model })
    expect(r.allowed).toBe(false)
    expect(r.status).toBe(429)
    expect(r.limit).toBe(1)
    expect(r.active).toHaveLength(1)
    expect(r.active[0]).toMatchObject({ runId: 'r1', kind: 'agent', label: 'Editor run' })
    expect(r.upgradeRequired).toBe(PLANS.PRO)
    expect(model.doc.aiFeatures.activeRuns).toHaveLength(1) // unchanged
  })

  it('sweeps a slot past the TTL, then succeeds', async () => {
    const stale = { runId: 'old', kind: 'agent', startedAt: ago(RUN_SLOT_TTL_MS * 2), lastSeenAt: ago(RUN_SLOT_TTL_MS + 1000) }
    const model = fakeModel([stale])
    const r = await reserveRunSlot(user(PLANS.FREE), { runId: 'new', kind: 'agent' }, { model })
    expect(r.allowed).toBe(true)
    expect(model.doc.aiFeatures.activeRuns.map((x) => x.runId)).toEqual(['new'])
  })

  it('re-reserving the same runId refreshes instead of duplicating', async () => {
    const model = fakeModel([{ runId: 'r1', kind: 'agent', startedAt: ago(60_000), lastSeenAt: ago(60_000) }])
    const r = await reserveRunSlot(user(PLANS.FREE), { runId: 'r1', kind: 'agent' }, { model })
    expect(r.allowed).toBe(true)
    expect(r.refreshed).toBe(true)
    expect(model.doc.aiFeatures.activeRuns).toHaveLength(1)
    expect(model.doc.aiFeatures.activeRuns[0].lastSeenAt.getTime()).toBeGreaterThan(Date.now() - 5_000)
  })

  it('never touches the array for an unlimited plan', async () => {
    const model = fakeModel()
    const r = await reserveRunSlot(user(PLANS.ENTERPRISE), { runId: 'r1', kind: 'agent' }, { model })
    expect(r.allowed).toBe(true)
    expect(r.unlimited).toBe(true)
    expect(model.doc.aiFeatures.activeRuns).toHaveLength(0)
  })

  it('an own API key does NOT exempt a user from the slot limit', async () => {
    // The whole point of the two-gate design: BYOK is exempt from TOKEN quota, never
    // from concurrency.
    const byok = { _id: OWNER, subscription: { plan: PLANS.FREE }, aiFeatures: { llmProviders: { openai: { hasKey: true } } } }
    const model = fakeModel([{ runId: 'r1', kind: 'agent', startedAt: now(), lastSeenAt: now() }])
    const r = await reserveRunSlot(byok, { runId: 'r2', kind: 'agent' }, { model })
    expect(r.allowed).toBe(false)
  })

  it('concurrent reserves resolve to exactly `limit` winners', async () => {
    const model = fakeModel()
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => reserveRunSlot(user(PLANS.PRO), { runId: `r${i}`, kind: 'agent' }, { model })),
    )
    expect(results.filter((r) => r.allowed)).toHaveLength(3)
    expect(model.doc.aiFeatures.activeRuns).toHaveLength(3)
  })
})

describe('releaseRunSlot', () => {
  it('removes the slot and is idempotent', async () => {
    const model = fakeModel([{ runId: 'r1', kind: 'agent', startedAt: now(), lastSeenAt: now() }])
    await releaseRunSlot(user(), 'r1', { model })
    expect(model.doc.aiFeatures.activeRuns).toHaveLength(0)
    await expect(releaseRunSlot(user(), 'r1', { model })).resolves.toBeUndefined()
    await expect(releaseRunSlot(user(), 'unknown', { model })).resolves.toBeUndefined()
  })
})

describe('listRunSlots', () => {
  it('returns only live slots, without lastSeenAt', async () => {
    const model = fakeModel([
      { runId: 'live', kind: 'agent', label: 'A', startedAt: now(), lastSeenAt: now() },
      { runId: 'stale', kind: 'eval', label: 'B', startedAt: ago(RUN_SLOT_TTL_MS * 2), lastSeenAt: ago(RUN_SLOT_TTL_MS + 1000) },
    ])
    const list = await listRunSlots(user(), { model })
    expect(list.map((r) => r.runId)).toEqual(['live'])
    expect(list[0].lastSeenAt).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- src/middleware/runSlots.test.js`
Expected: FAIL — `Cannot find module './runSlots.js'`.

- [ ] **Step 3: Implement `backend/src/middleware/runSlots.js`**

```js
/* Concurrent-run slots — the PAID axis.
 *
 * One slot is one LOGICAL run (an agent turn, a workflow run, an eval run, a single
 * prompt execution). A strategy that fans out to five subagents is ONE task: metering
 * in-flight requests instead would tax exactly the orchestration this product sells.
 *
 * This is a SEPARATE GATE from the token quota. reserveAiExecution returns early for
 * own-key users -- correct for tokens, since they pay their provider directly -- and
 * putting this check below that line would exempt effectively every serious user. Only
 * an unlimited plan (-1) skips a slot; having an API key never does. See the "Two
 * separate gates" section of the design doc.
 *
 * The guarded write mirrors aiReserve.js: the $expr size check lives in the FILTER, so
 * two racing reserves cannot both match when one slot remains -- the database enforces
 * the ceiling, not application logic. */
import { User as DefaultUser } from '../models/User.js'
import { PLANS, normalizePlan } from '../config/plans.js'

/** A slot older than this is reclaimed. Longer than the client heartbeat (~60s) so a
 * run parked on a tool or a propose_edit verdict survives; short enough that a slot
 * stranded by a closed browser self-heals before it reads as a bug. */
export const RUN_SLOT_TTL_MS = 5 * 60 * 1000

const ARRAY = 'aiFeatures.activeRuns'

const LIMITS = {
  [PLANS.FREE]: 1,
  [PLANS.PRO]: 3,
  [PLANS.TEAM]: 5,
  [PLANS.ENTERPRISE]: -1,
  [PLANS.ADMIN]: -1,
}

/** Concurrent runs allowed for a plan. -1 means unlimited. */
export function concurrencyLimitFor(plan) {
  return LIMITS[normalizePlan(plan)] ?? LIMITS[PLANS.FREE]
}

const cutoff = () => new Date(Date.now() - RUN_SLOT_TTL_MS)

/** Drop expired slots. Unconditional and idempotent -- this is what stops a crashed
 * client from costing a slot permanently. Separate from the push because MongoDB
 * cannot $pull and $push the same array in one update; the window between them is
 * benign (worst case one attempt is over-strict and the next succeeds). */
async function sweep(Model, userId) {
  await Model.updateOne(
    { _id: userId },
    { $pull: { [ARRAY]: { lastSeenAt: { $lt: cutoff() } } } },
  )
}

/**
 * Claim a slot for a logical run.
 * @returns {Promise<object>} `{ allowed: true }` (with `unlimited` or `refreshed` when
 *   they apply), or `{ allowed: false, status: 429, limit, active, upgradeRequired }`.
 */
export async function reserveRunSlot(user, run, opts = {}) {
  const Model = opts.model || DefaultUser
  const plan = normalizePlan(user.subscription?.plan)
  const limit = concurrencyLimitFor(plan)
  if (limit === -1) return { allowed: true, unlimited: true }

  const { runId, kind = 'prompt', label = '' } = run
  if (!runId) return { allowed: true, untagged: true } // v1 is permissive; the route logs it

  await sweep(Model, user._id)

  // Same run already holds a slot: refresh rather than double-count. Covers retries and
  // every subsequent gateway call within one run.
  const refresh = await Model.updateOne(
    { _id: user._id, [`${ARRAY}.runId`]: runId },
    { $set: { [`${ARRAY}.$.lastSeenAt`]: new Date() } },
  )
  if (refresh.modifiedCount === 1) return { allowed: true, refreshed: true }

  const now = new Date()
  const guarded = await Model.updateOne(
    {
      _id: user._id,
      $expr: { $lt: [{ $size: { $ifNull: [`$${ARRAY}`, []] } }, limit] },
    },
    { $push: { [ARRAY]: { runId, kind, label, startedAt: now, lastSeenAt: now } } },
  )
  if (guarded.modifiedCount === 1) return { allowed: true }

  return {
    allowed: false,
    status: 429,
    limit,
    active: await listRunSlots(user, opts),
    upgradeRequired: plan === PLANS.FREE ? PLANS.PRO : plan === PLANS.PRO ? PLANS.TEAM : null,
  }
}

/** Free a slot. Idempotent: a double release, or one for an unknown id, is a no-op. */
export async function releaseRunSlot(user, runId, opts = {}) {
  if (!runId) return
  const Model = opts.model || DefaultUser
  try {
    await Model.updateOne({ _id: user._id }, { $pull: { [ARRAY]: { runId } } })
  } catch (e) {
    console.error('[runSlots] release failed:', e.message)
  }
}

/** Live slots for this user, newest last. `lastSeenAt` is internal and not returned. */
export async function listRunSlots(user, opts = {}) {
  const Model = opts.model || DefaultUser
  const doc = await Model.findById(user._id)
  const runs = doc?.aiFeatures?.activeRuns || []
  const min = cutoff()
  return runs
    .filter((r) => r.lastSeenAt >= min)
    .map(({ runId, kind, label, startedAt }) => ({ runId, kind, label, startedAt }))
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -- src/middleware/runSlots.test.js`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
cd C:/git/github/Prompd/prompd-app
git add backend/src/middleware/runSlots.js backend/src/middleware/runSlots.test.js
git commit -m "feat(concurrency): run-slot reserve/release/sweep with a guarded write"
```

---

### Task 2: Persist slots on the user document

**Files:**
- Modify: `backend/src/models/User.js` — the `aiFeatures` block (around `:318-341`, after `executions`)
- Test: covered by Task 1's suite plus a schema assertion here

**Interfaces:**
- Consumes: nothing.
- Produces: `aiFeatures.activeRuns` as a real schema path, so Mongoose does not strip it on write.

Without this the array is silently discarded — Mongoose drops paths not in the schema, and every reserve would appear to succeed while persisting nothing.

- [ ] **Step 1: Write the failing test**

Add to `backend/src/middleware/runSlots.test.js`:

```js
import { User } from '../models/User.js'

describe('User schema', () => {
  it('declares aiFeatures.activeRuns so slots actually persist', () => {
    const path = User.schema.path('aiFeatures.activeRuns')
    expect(path).toBeDefined()
    const child = path.schema
    expect(child.path('runId')).toBeDefined()
    expect(child.path('kind')).toBeDefined()
    expect(child.path('label')).toBeDefined()
    expect(child.path('startedAt')).toBeDefined()
    expect(child.path('lastSeenAt')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/middleware/runSlots.test.js -t "activeRuns"`
Expected: FAIL — the path is undefined.

- [ ] **Step 3: Add the schema path**

In `backend/src/models/User.js`, inside `aiFeatures`, immediately after the `executions` block:

```js
    // Concurrent run slots (the paid concurrency axis). One entry per LOGICAL run.
    // Reclaimed by TTL sweep in middleware/runSlots.js when a client dies without
    // releasing, so a stale entry can never permanently cost a user a slot.
    activeRuns: [{
      runId: { type: String, required: true },
      kind: { type: String, enum: ['agent', 'workflow', 'eval', 'prompt'], default: 'prompt' },
      label: { type: String, default: '' },
      startedAt: { type: Date, default: Date.now },
      lastSeenAt: { type: Date, default: Date.now }
    }],
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- src/middleware/runSlots.test.js`
Expected: PASS, including every Task 1 case.

- [ ] **Step 5: Commit**

```bash
cd C:/git/github/Prompd/prompd-app
git add backend/src/models/User.js backend/src/middleware/runSlots.test.js
git commit -m "feat(concurrency): persist activeRuns on the user document"
```

---

### Task 3: Gate the gateway

**Files:**
- Modify: `backend/src/routes/chatCompletions.js` — before the `reserveAiExecution` call (around `:109-125`)
- Test: `backend/src/routes/chatCompletions.concurrency.test.js`

**Interfaces:**
- Consumes: `reserveRunSlot` from Task 1.
- Produces: the `429` refusal contract, and `req.runId` for downstream use.

**Ordering is a requirement, not a preference:** reserve the slot BEFORE `reserveAiExecution`, so a refused request never consumes a token unit it would then have to refund.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, jest } from '@jest/globals'
import { readRunTag } from './chatCompletions.js'

describe('readRunTag', () => {
  it('reads the run id and kind from headers', () => {
    const req = { headers: { 'x-prompd-run': 'r_1', 'x-prompd-run-kind': 'agent', 'x-prompd-run-label': 'Editor run' } }
    expect(readRunTag(req)).toEqual({ runId: 'r_1', kind: 'agent', label: 'Editor run' })
  })

  it('returns null when untagged (v1 is permissive)', () => {
    expect(readRunTag({ headers: {} })).toBeNull()
  })

  it('rejects a kind it does not recognize rather than trusting the client', () => {
    const t = readRunTag({ headers: { 'x-prompd-run': 'r_1', 'x-prompd-run-kind': 'nonsense' } })
    expect(t.kind).toBe('prompt')
  })

  it('truncates an oversized label instead of storing it', () => {
    const t = readRunTag({ headers: { 'x-prompd-run': 'r_1', 'x-prompd-run-label': 'x'.repeat(500) } })
    expect(t.label.length).toBeLessThanOrEqual(80)
  })

  it('ignores an oversized run id', () => {
    expect(readRunTag({ headers: { 'x-prompd-run': 'r'.repeat(200) } })).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/routes/chatCompletions.concurrency.test.js`
Expected: FAIL — `readRunTag` is not exported.

- [ ] **Step 3: Add the header reader and the gate**

Export from `chatCompletions.js`:

```js
const RUN_KINDS = new Set(['agent', 'workflow', 'eval', 'prompt'])

/** Read the client's run tag. Untagged is legal in v1 (permissive) and returns null.
 * Values are client-supplied, so the id is length-checked, the kind is allowlisted, and
 * the label is truncated before any of it reaches the database. */
export function readRunTag(req) {
  const runId = String(req.headers['x-prompd-run'] || '').trim()
  if (!runId || runId.length > 128) return null
  const rawKind = String(req.headers['x-prompd-run-kind'] || '').trim()
  const kind = RUN_KINDS.has(rawKind) ? rawKind : 'prompt'
  const label = String(req.headers['x-prompd-run-label'] || '').trim().slice(0, 80)
  return { runId, kind, label }
}
```

Then, immediately BEFORE the `reserveAiExecution` block:

```js
  // Gate 1 of 2: concurrency. Applies to EVERY user including own-key -- see the
  // "Two separate gates" section of the design doc. Runs before the token
  // reservation so a refusal never has to refund a unit.
  const runTag = readRunTag(req)
  if (!runTag) {
    console.warn('[runSlots] untagged gateway call - unmetered (v1 permissive)')
  } else {
    const slot = await reserveRunSlot(req.user, runTag)
    if (!slot.allowed) {
      return res.status(slot.status || 429).json({
        error: {
          message: `You already have ${slot.limit} run${slot.limit === 1 ? '' : 's'} in progress.`,
          type: 'concurrency_limit',
          code: 'CONCURRENCY_LIMIT',
          limit: slot.limit,
          active: slot.active,
          upgrade_required: slot.upgradeRequired || null,
        },
      })
    }
    req.runId = runTag.runId
  }
```

Note this sits OUTSIDE the `if (!ownKey)` branch that guards the server-key path — the whole point is that own-key users pass through it.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- src/routes/chatCompletions.concurrency.test.js && npm test`
Expected: PASS, and the existing 69 tests stay green.

- [ ] **Step 5: Commit**

```bash
cd C:/git/github/Prompd/prompd-app
git add backend/src/routes/chatCompletions.js backend/src/routes/chatCompletions.concurrency.test.js
git commit -m "feat(concurrency): gate the chat gateway on a run slot"
```

---

### Task 4: The runs endpoints

**Files:**
- Create: `backend/src/routes/runs.js`
- Modify: `backend/src/server.js` — mount beside the other `/api/v1` routes (around `:126-128`)
- Modify: `backend/src/routes/entitlements.js` — add the `concurrency` feature
- Test: `backend/src/routes/runs.test.js`

**Interfaces:**
- Consumes: `reserveRunSlot`, `releaseRunSlot`, `listRunSlots`, `concurrencyLimitFor` (Task 1); `clerkAuth`.
- Produces:
  - `GET /api/v1/runs` -> `{ active: [...], limit }`
  - `POST /api/v1/runs/:runId/heartbeat` -> `{ ok: true }`
  - `DELETE /api/v1/runs/:runId` -> `{ ok: true }`
  - `GET /api/v1/entitlements?feature=concurrency` -> the existing entitlement contract

The heartbeat exists because a run can legitimately go quiet — blocked on a tool, or parked on a `propose_edit` verdict. Inferring liveness from gateway traffic alone would kill exactly the runs waiting on the user.

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect, jest } from '@jest/globals'
import { buildRunsRouter } from './runs.js'

const res = () => {
  const r = { code: 200, body: null }
  r.status = (c) => { r.code = c; return r }
  r.json = (b) => { r.body = b; return r }
  return r
}

describe('runs endpoints', () => {
  it('GET / lists active slots with the plan limit', async () => {
    const deps = { listRunSlots: async () => [{ runId: 'r1', kind: 'agent', label: 'A', startedAt: new Date() }], concurrencyLimitFor: () => 3 }
    const router = buildRunsRouter(deps)
    const r = res()
    await router.list({ user: { subscription: { plan: 'pro' } } }, r)
    expect(r.body.limit).toBe(3)
    expect(r.body.active).toHaveLength(1)
  })

  it('heartbeat refreshes an existing slot', async () => {
    const calls = []
    const deps = { reserveRunSlot: async (_u, run) => { calls.push(run); return { allowed: true, refreshed: true } } }
    const r = res()
    await buildRunsRouter(deps).heartbeat({ user: {}, params: { runId: 'r1' } }, r)
    expect(calls[0].runId).toBe('r1')
    expect(r.body).toEqual({ ok: true })
  })

  it('heartbeat for a slot that no longer exists reports gone, not ok', async () => {
    const deps = { reserveRunSlot: async () => ({ allowed: false, status: 429, limit: 1, active: [] }) }
    const r = res()
    await buildRunsRouter(deps).heartbeat({ user: {}, params: { runId: 'r1' } }, r)
    expect(r.code).toBe(429)
  })

  it('DELETE releases and is idempotent', async () => {
    const released = []
    const deps = { releaseRunSlot: async (_u, id) => { released.push(id) } }
    const r = res()
    await buildRunsRouter(deps).release({ user: {}, params: { runId: 'r1' } }, r)
    await buildRunsRouter(deps).release({ user: {}, params: { runId: 'r1' } }, r)
    expect(released).toEqual(['r1', 'r1'])
    expect(r.body).toEqual({ ok: true })
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- src/routes/runs.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the router**

Structure it as `buildRunsRouter(deps)` returning the three handlers, with a thin Express wrapper underneath — that is what makes the handlers testable without a live app, mirroring how the entitlements route stays simple. Default `deps` to the real `runSlots` functions.

Mount in `server.js` beside the neighbouring v1 routes:

```js
app.use('/api/v1/runs', runsRoutes)
```

- [ ] **Step 4: Extend entitlements**

In `routes/entitlements.js`, the existing map is:

```js
const FEATURE_OPERATION = { 'llm-execution': 'execute' }
```

`concurrency` is not a quota operation, so handle it before that lookup: return
`{ allowed: false, reason, action: { kind: 'upgrade' } }` when the user is already at
their ceiling, `{ allowed: true }` otherwise. Reuse `listRunSlots` and
`concurrencyLimitFor` rather than duplicating the comparison.

- [ ] **Step 5: Run tests and commit**

Run: `npm test`
Expected: PASS, whole suite.

```bash
cd C:/git/github/Prompd/prompd-app
git add backend/src/routes/runs.js backend/src/routes/runs.test.js backend/src/routes/entitlements.js backend/src/server.js
git commit -m "feat(concurrency): runs endpoints (list, heartbeat, release) + entitlement"
```

---

### Task 5: Tag and release from the harness

**Files:**
- Modify: `prompd-web/packages/harness/providers/gateway.ts` — the header block (around `:153-162`, where `X-Prompd-Origin` is already set)
- Modify: the run entry points that own a logical run — `prompd-web/packages/harness/core/loop.ts` and the workflow/eval runners
- Test: `prompd-web/packages/harness/providers/gateway.request.test.ts` (exists)

**Interfaces:**
- Consumes: the header contract from Task 3 and the endpoints from Task 4.
- Produces: `X-Prompd-Run` / `X-Prompd-Run-Kind` / `X-Prompd-Run-Label` on gateway calls, a heartbeat while a run is open, and a release when it ends.

This is the client half. **Note the repo change:** Tasks 1-4 are in `prompd-app`; this task is in `prompd-web`, whose tree may hold another session's work — stage only what you touch.

- [ ] **Step 1: Write the failing test**

In `gateway.request.test.ts`, assert that a request carries the run headers when a run context is supplied, and carries none when it is not (v1 permissive).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test packages/harness/providers/gateway.request.test.ts`
Expected: FAIL — no run headers are set.

- [ ] **Step 3: Thread a run context through**

`X-Prompd-Origin` at `:162` shows the pattern: an optional field on the provider options becomes a header. Add an optional `run?: { id, kind, label }` alongside `origin`, and set the three headers when present.

Then set it where a logical run begins — the agent loop, the workflow runner, the eval runner — reusing the ids those layers already generate (`runToken`, the recordings and executions ledger ids) rather than minting new ones.

- [ ] **Step 4: Heartbeat and release**

While a run is open, `POST /api/v1/runs/:id/heartbeat` about every 60 seconds. On completion, cancellation, or error, `DELETE /api/v1/runs/:id`. The release must be in a `finally`-equivalent path: a release skipped on the error branch is a slot stranded until the TTL, which at Free-of-1 is the difference between a limit and an outage.

- [ ] **Step 5: Verify and commit**

Run: `pnpm test packages/harness && pnpm typecheck`
Expected: PASS.

```bash
cd C:/git/github/Prompd/prompd-web
git add packages/harness/providers/gateway.ts packages/harness/providers/gateway.request.test.ts <the run entry points you touched>
git commit -m "feat(concurrency): tag gateway calls with a run id; heartbeat and release"
```

---

## Manual verification (owner)

Automated tests cannot cover the two-service path. With `prompd-app` running locally and a free-plan account:

1. Start an agent run. `GET /api/v1/runs` shows one slot.
2. Start a second run in another tab. It is refused with `429`, and the payload names the first run.
3. Finish the first run. The second starts.
4. Start a run, close the tab. Within ~5 minutes the slot clears and a new run works.
5. **Add your own OpenAI key and repeat step 2.** It must still be refused — this is the two-gate property, and the one most likely to be broken by a well-meaning edit.
6. A strategy that fans out to several subagents consumes exactly one slot.

## Known deviation from the spec

The spec says slots key on an opaque `ownerId` so that switching to org pooling later is
"a data change, not a redesign." This plan stores the array **on the user document**,
which is the right call for v1 — it sits beside the quota counters, needs no new
collection, and reuses the injection pattern the tests already know. But it means org
pooling later is a storage move (array to its own collection keyed by owner), not just a
different key. That is a deliberate trade: a separate collection today would add a
collection, an index, and a lookup for a feature with no customers. Recorded so the cost
is visible when Team arrives.

## Sequencing note

Tasks 1-4 ship independently of Task 5: with a permissive v1, an untagged client simply
goes unmetered, so the backend can deploy first without breaking anything. Task 5 turns
enforcement on in practice.

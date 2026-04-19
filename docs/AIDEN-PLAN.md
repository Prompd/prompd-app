# AIDEN — AI Dev EN

On-device AI assistant bundled alongside Prompd for internal generative features
(workflow scaffolding, file generation, explain/fix/rewrite, frontmatter suggestions).

Name is tentative: AIDEN = "AI Dev EN". Previously referred to as "AI Fox."

---

## Status

- **Phase:** 0 — Planning (this document)
- **Last updated:** 2026-04-19
- **Blockers:** none
- **Next action:** confirm plan with Stephen, pick prototype platform, start Phase 1

---

## Objective

Ship a local inference runtime that Prompd owns end-to-end, so AIDEN features
work with zero per-user cloud cost, zero required API keys, and offline-capable.
Runtime is shared across the Prompd ecosystem (desktop app, CLI, future VS Code
extension) via a local OpenAI-compatible HTTP endpoint.

---

## Non-goals

- **Not** a substitute for cloud providers (OpenAI / Anthropic / Groq) on
  user-authored prmd executions. Those continue to use the existing provider
  abstraction in `@prompd/core` with the user's own keys.
- **Not** a general-purpose LLM host. AIDEN is scoped to Prompd's internal
  generative features only (scaffolding, explain, fix, generate, rewrite).
- **Not** a managed cloud service. Vertex AI path was evaluated and rejected
  (cost: ~$3,780/mo/replica at the Model Garden one-click default).
- **Not** a required install. Fully opt-in; Prompd's base install and cloud-
  provider features work without AIDEN.

---

## Architecture — Prompd-wide local daemon

```
~/.prompd/aiden/
├── bin/              runtime binary (llama-server, platform-specific)
├── models/           weight files (content-addressed by SHA)
├── adapters/         LoRA adapters (prmd-tuned variants)
├── config.json       port, default model, mem limits, auth token
├── aiden.pid         running daemon PID
└── aiden.lock        discovery file (port, pid, model, started-at)
```

- **Runtime:** vendored `llama-server` from llama.cpp (~15MB per platform).
  Already speaks OpenAI-compatible HTTP — drops into `@prompd/core`'s provider
  abstraction as just another endpoint.
- **Lifecycle owner:** `prompd-cli` — five-verb CLI surface:
  - `prompd aiden install` — hardware probe, download binary, download weights,
    write config. Idempotent. Re-runs handle model swaps and updates via
    `--model <name>` (e.g., `--model e4b`, `--model prompd/aiden-prmd@0.2.0`).
  - `prompd aiden uninstall` — wipe `~/.prompd/aiden/` entirely.
  - `prompd aiden start` — launch daemon on local port.
  - `prompd aiden stop` — graceful shutdown.
  - `prompd aiden status` — running state, model loaded, version, memory, port,
    installed models list.
  - Interactive by default in a terminal; `-y` / `--yes` for headless/scripted
    runs (also used by the desktop app when it triggers lifecycle via IPC).
- **Transport:** HTTP on `127.0.0.1:<port>` only (never binds to a public
  interface). Optional bearer token in `config.json` to prevent other local
  apps from snooping.
- **Discovery:** fixed default port with `aiden.lock` fallback so consumers
  (desktop app, CLI, extension) find the running daemon reliably even if the
  port was overridden.
- **Process model:** auto-start with desktop app, stop on app quit. CLI users
  control explicitly via `prompd aiden start/stop`.

---

## Component map (cross-repo)

| Repo | What it owns |
|---|---|
| `prompd-cli` (typescript) | `aiden` subcommand, lifecycle, model catalog, download/verify, hardware probe, `aiden.lock` management |
| `prompd-app` (this repo) | Settings → AI panel, enable/disable flow, status bar indicator, IPC to CLI for lifecycle, AI feature call sites |
| `@prompd/core` | New `aiden` provider that targets `127.0.0.1:<port>` using existing OpenAI-compat client |
| `registry.prompdhub.ai` | Hosts AIDEN weight manifests + prmd-tuned adapter releases (CDN-backed) |

---

## UX flows

### Opt-in

1. User clicks **Enable AIDEN** (Settings → AI, or CTA on first AI-feature click).
2. Modal: value prop + disk/RAM requirements.
3. Hardware probe: RAM ≥ 6GB free, disk ≥ 3GB, GPU detected (Metal / CUDA / CPU).
4. Pick model variant (defaulted by hardware): E2B Q4 for low-spec, E4B Q4 recommended.
5. Download binary + weights with progress, pause/resume.
6. `prompd aiden start` fires; daemon binds `127.0.0.1:<port>`.
7. Status bar shows "AIDEN ready." AI features now work locally.

### Opt-out

- Base install stays ~200MB.
- No background process, no GPU, no extra RAM.
- AI features either hidden or show the Enable CTA (decision deferred).
- Cloud providers still work via the user's own keys.

### Uninstall

- Settings → AI → **Remove AIDEN** wipes `~/.prompd/aiden/`.
- Uninstalling Prompd itself prompts to keep or delete the directory (user may
  reinstall and want tuned adapters preserved).

---

## Size & runtime targets

| Platform | Opt-in download | Runtime RAM (E4B Q4, idle) |
|---|---|---|
| macOS Apple Silicon | ~2.5GB (weights + 15MB binary, Metal built in) | ~4–6GB |
| Linux/Windows CPU-only | ~2.5GB | ~4–6GB |
| Linux/Windows + NVIDIA | ~2.7GB (+CUDA runtime ~150MB) | ~4–6GB VRAM preferred |
| Prompd-tuned variant | +100–200MB LoRA on top of base | negligible added |

Runtime is 0 RAM when app is closed or AIDEN is explicitly stopped.

---

## Phases

### Phase 1 — Prototype (1–2 weeks)

Goal: prove the runtime + CLI wrapper feel right on one platform.

- Vendor `llama-server` for macOS Apple Silicon first
- Implement the five-verb CLI surface (`install / uninstall / start / stop /
  status`) in `prompd-cli`, with `-y` headless flag
- Hardcode Gemma 4 E4B Q4 manifest for `install` in Phase 1
- Smoke-test from the desktop app via an `aiden` provider in `@prompd/core`
- Decision gate: does the boot + first-token feel acceptable?

### Phase 2 — Platform coverage (1–2 weeks)

- Add Linux (CPU + CUDA) and Windows (CPU + CUDA) binary bundles
- Hardware probe (RAM / disk / GPU detection) cross-platform
- Graceful shutdown, PID management, port discovery via `aiden.lock`
- Download progress, resume, integrity verification (SHA manifest)

### Phase 3 — Desktop UX (1 week)

- Settings → AI panel with enable/disable, model switcher, disk usage, remove
- Status bar indicator
- First-time enable modal with hardware check
- CTA states for disabled AI features

### Phase 4 — Fine-tuning pipeline (1 week)

- Assemble prmd corpus (public prmd files, docs, format spec, examples)
- LoRA-tune Gemma 4 E4B on one-off rented L4 (~$20 one-time)
- Publish adapter to registry, wire `prompd aiden model pull prompd/aiden-prmd`

### Phase 5 — Polish & release

- Telemetry (opt-in): model boot time, token/sec, crash reports
- Release notes, docs page, blog post
- Enterprise story: offline mode, private deployment guidance

---

## Decisions log

All decisions below are **resolved** unless marked open.

- **2026-04-19 — Vertex AI rejected for this use case.** Model Garden one-click
  default costs $3,780/mo/replica (g4-standard-48 + RTX PRO 6000). Even
  minReplicaCount: 0 doesn't give real scale-to-zero on dedicated endpoints in
  a way that fits a product feature. The existing `gemma-4-e2b-it-test` endpoint
  on `prompd-io` has been undeployed and deleted.
- **2026-04-19 — Vertex serverless pay-per-token rejected.** Only Gemma 4 26B is
  on the managed list; E2B/E4B aren't. Fine-tuning a serverless model isn't
  possible either (tuned variants require dedicated endpoints), which kills the
  "train it on prmd material" requirement.
- **2026-04-19 — Use case is AIDEN internal only.** Not for executing user-
  authored prompts. That path continues to use cloud providers via the existing
  abstraction.
- **2026-04-19 — Scope is Prompd-wide, not desktop-only.** Runtime lives in
  `~/.prompd/aiden/` and is managed by `prompd-cli`. Desktop app, CLI, and
  future consumers all connect to the same local endpoint.
- **2026-04-19 — Engine: vendor `llama-server`, not Ollama, not custom.**
  `llama-server` is ~15MB, speaks OpenAI-compat natively, rides llama.cpp
  upstream improvements for free. Ollama was rejected for bundle size and
  "powered by" branding. A custom daemon was rejected as a 2–4 week + ongoing
  maintenance trap when `llama-server` already does 90% of what's needed.
- **2026-04-19 — Transport: OpenAI-compatible HTTP on 127.0.0.1.** Drops into
  the existing provider abstraction in `@prompd/core` with minimal code.
- **2026-04-19 — Default model: Gemma 4 E4B Q4 (recommended) / E2B Q4 (low-
  spec).** Effective 4B is the sweet spot for structured codegen on prmd's
  known schema. 26B unnecessary for this use case.
- **2026-04-19 — Opt-in only, never forced.** Base install stays lean;
  AIDEN-dependent features are CTA'd, not hidden vs. shown TBD.
- **2026-04-19 — CLI surface locked at five verbs.** `install / uninstall /
  start / stop / status`. No separate `model pull` / `update` verbs — `install`
  is idempotent and handles model swaps / updates via `--model <name>`.
  Interactive by default; `-y` / `--yes` for headless.

---

## Open questions

- **UX for disabled AI features** — hidden vs. visible-with-CTA? Leaning
  CTA for discoverability, but that puts a "locked" icon all over the UI.
- **Default port number** — pick a stable Prompd-reserved port (like Ollama's
  11434). Needs to be unused, documented, and overridable.
- **Windows service vs. app-lifecycle daemon only** — Windows users might want
  AIDEN always-on for CLI/VS Code extension usage. Systemd/launchd/service
  installation is out of scope for Phase 1.
- **Weight hosting location** — registry CDN, HuggingFace Hub, or GCS? Leaning
  registry-hosted for brand and control, with HuggingFace mirror for community
  discovery.
- **Telemetry defaults** — opt-in only, definitely. Minimal envelope: boot time,
  crash, token/sec aggregate. No prompt content ever.
- **prmd corpus for fine-tuning** — source of truth? Format spec, public
  packages, docs? Need curation guidelines.

---

## Risks

- **User hardware variance.** Some users on 8GB RAM laptops will have a poor
  experience even with E2B. Clear hardware gates + "CPU mode will be slow"
  warnings are mandatory.
- **llama.cpp upstream churn.** New model archs land often and binary formats
  occasionally break. Pin vendored versions, test before updating.
- **Weight-download bandwidth cost.** 2.5GB × N users can add up. CDN + resume
  is mandatory. Consider torrent-style distribution later if scale warrants.
- **Windows + NVIDIA install pain.** CUDA driver version mismatches are a
  support headache. Ship with a clear "CPU fallback if GPU init fails" path.
- **Branding: "AIDEN"** name collision search not done yet. Needs a quick IP
  check before any public mention.

---

## Progress tracker

Update this as phases complete. Keep entries short.

- [ ] Phase 1 — Prototype on macOS Apple Silicon
- [ ] Phase 2 — Platform coverage (Linux, Windows, CUDA)
- [ ] Phase 3 — Desktop UX (Settings panel, status bar, first-run modal)
- [ ] Phase 4 — prmd corpus LoRA fine-tune + registry adapter release
- [ ] Phase 5 — Polish, telemetry, release

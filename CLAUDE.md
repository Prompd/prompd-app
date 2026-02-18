# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Prompd** - A local-first Electron desktop application for creating and executing AI workflows with `.prmd` (Prompd format) files, featuring visual workflow canvas, Monaco code editor, and package-based inheritance.

**Tech Stack:**
- Frontend: React 18 + TypeScript + Vite + Monaco Editor + Zustand
- Backend: Node.js 18+ ESM + Express + MongoDB (optional - for cloud features)
- Desktop: Electron 40 with File System Access API and IPC bridge
- Workflow Canvas: XYFlow (React Flow)
- Monorepo: Local `@prompd/react` + `@prompd/scheduler` packages + npm `@prompd/cli`

## Development Commands

### Prerequisites

- **Node.js >= 18.0.0** (no `.nvmrc` — check `backend/package.json` engines field)

### Initial Setup

**IMPORTANT - Monorepo Build Order:**
```bash
# 1. Build @prompd/scheduler first
cd packages/scheduler && npm install && npm run build

# 2. Build @prompd/react (required by frontend)
cd ../react && npm install && npm run build

# 3. Install and run frontend
cd ../../frontend && npm install

# 4. Backend (optional - for provider list updates, analytics)
cd ../backend && npm install
```

### Root-Level Commands
```bash
npm run dev                   # Start frontend Vite dev server (:5173)
npm run dev:backend           # Start backend API server (:3010)
npm run build                 # Build scheduler + react + frontend (production)
npm run build:react           # Build only @prompd/react package
npm run build:scheduler       # Build only @prompd/scheduler package
npm run electron:dev          # Launch Electron app (auto-starts Vite via concurrently)
npm run electron:build:win    # Windows installer (NSIS + portable)
```

### Frontend Commands
```bash
cd frontend
npm run dev                    # Vite dev server on :5173
npm run electron:dev           # Electron with hot reload (auto-starts Vite via concurrently + wait-on)
npm run build                  # Production build (license generation + tsc + vite)
npx tsc --noEmit               # TypeScript validation only
npm run clean                  # Remove dist/ and dist-electron/
npm run electron:build:win     # Windows (NSIS installer + portable .exe)
npm run electron:build:mac     # macOS (DMG + zip)
npm run electron:build:linux   # Linux (AppImage + deb package)
```

### Backend Commands
```bash
cd backend
npm run dev                    # Development with nodemon on :3010
npm test                       # Run all Jest tests (requires MongoDB)
npm test -- packages.test.js   # Run specific test file
npm test -- --testNamePattern="should create"  # Run tests matching pattern
```

### Package Development
```bash
# @prompd/react - Chat UI component library
cd packages/react
npm run dev                    # Watch mode (auto-rebuild on changes)
npm run build                  # Production build (ESM + CJS + types)
npm test                       # Run Vitest tests
npm run lint                   # ESLint
npm run typecheck              # TypeScript type checking

# @prompd/scheduler - Workflow deployment and trigger management
cd packages/scheduler
npm run build                  # TypeScript compilation (CommonJS output)
npm run dev                    # Watch mode
npm run typecheck              # TypeScript type checking
npm run clean                  # Remove dist/
```

## Architecture

### Monorepo Structure

```
prompd.app/
├── frontend/               # Electron + React app (main application)
│   ├── src/modules/        # All application code (components, services, editor)
│   ├── src/stores/         # Zustand state management (4 stores)
│   ├── electron/           # Main process (main.js, preload.js, tray.js)
│   │   └── services/       # Electron services (fileWatch, webhook, packageWorkflow)
│   └── public/             # Static assets
├── packages/
│   ├── react/              # @prompd/react - Chat UI component library
│   └── scheduler/          # @prompd/scheduler - Deployment & trigger management (SQLite, node-cron)
├── backend/                # Optional REST API (Express + MongoDB)
├── prompd-service/         # Standalone workflow scheduler service (runs independently of Electron)
├── scheduler-shared/       # Legacy shared scheduler logic (being replaced by packages/scheduler)
├── deployment/             # Cloud deployment configs (Cloud Build YAML, secret setup scripts)
└── docs/                   # Documentation and guides
```

### Critical Dependencies

- **`@prompd/cli`** - Prompt compiler (Node.js only). Local dev uses `file:` symlink to `../../../Logikbug/prompd-cli/cli/npm` (see frontend and backend package.json). Cloud Run deployment uses `@prompd/cli@^0.4.9` from npm (lockfile must be in sync before deploying).
  - **Main export** (`@prompd/cli`): Node.js only — accessed via Electron IPC bridge, excluded from Vite bundling, unpacked from asar at runtime
  - **Subpath exports** (`@prompd/cli/parser`, `/types`, `/validator`): Browser-compatible, can be bundled by Vite if needed
- **`@prompd/react@0.2.0`** - Chat UI (local via `file:../packages/react`) - must build before frontend. Dual ESM + CJS output.
- **`@prompd/scheduler@0.1.0`** - Deployment service (local via `file:../packages/scheduler`). **CommonJS output only** — consumers must use `require()` or Node.js CJS interop.
- **Database drivers** - Bundled in `frontend/` for the DatabaseQuery workflow node. All drivers are loaded at runtime via `require()` in Electron main process (`main.js`). Includes: `mongodb`, `pg` (PostgreSQL), `mysql2` (MySQL/MariaDB), `better-sqlite3` (SQLite), `ioredis` (Redis). These are bundled with the app so end users don't need to install them separately.

### Execution Model - Local-First

All core operations execute locally via Electron IPC:

```
User Action -> executionRouter -> localExecutor -> Direct HTTPS to LLM APIs
                               -> localCompiler -> Electron IPC -> @prompd/cli
```

**Runs locally (Electron main process):** LLM API calls, prompt compilation, workflow execution/scheduling (node-cron), file operations, Git operations (whitelisted), config management (`~/.prompd/config.yaml`), deployment management (SQLite).

**Uses backend API (optional):** Provider/model list updates, registry package search, usage analytics, cloud project sync.

**API Key Resolution (priority order):**
1. Workspace `.env` file (current working directory)
2. User config (`~/.prompd/config.yaml`)
3. System environment variables

### State Management (Zustand)

Four stores with Immer middleware in `frontend/src/stores/`:

| Store | Purpose | Persisted |
|-------|---------|-----------|
| `editorStore` | Editor state, tabs, file explorer, build output | Yes |
| `uiStore` | UI state, theme, LLM provider/model selection | Yes |
| `wizardStore` | Transient onboarding wizard flow | No |
| `workflowStore` | Workflow canvas, nodes, execution state, undo/redo history | Yes |

Shared types for all stores are in `stores/types.ts`.

**CRITICAL PATTERN - Selective Subscriptions:**
```typescript
// GOOD - Only re-renders when text changes
const text = useEditorStore(state => state.text)

// BAD - Re-renders on ANY store change
const store = useEditorStore()
```

### Workflow Canvas System

Visual workflow editing with `.pdflow` files using XYFlow (React Flow). Supports 25+ node types across categories: Core (trigger, prompt, agent, chatAgent, tool, mcpTool), Execution (command, code, claudeCode, workflow), Flow Control (condition, loop, parallel variants, merge, errorHandler, guardrail), Data (transform, memory, callback, provider), UI (userInput, output), and Routing (toolCallParser, toolCallRouter, container).

For the complete node type registry and deep architectural details, see [CLAUDE-ARCHITECTURE.md](CLAUDE-ARCHITECTURE.md).

**Key workflow files:**
- `stores/workflowStore.ts` - State management (~85KB, very complex)
- `modules/services/workflowTypes.ts` - TypeScript interfaces (~71KB)
- `modules/services/workflowParser.ts` - Parse/serialize `.pdflow` files
- `modules/services/workflowExecutor.ts` - Execution engine
- `modules/services/workflowValidator.ts` - Validation rules
- `modules/editor/WorkflowCanvas.tsx` - Canvas component (~67KB)
- `modules/components/workflow/nodes/` - All node components + properties panels

### Deployment System

Workflows can be packaged and deployed as persistent background services via `@prompd/scheduler`.

**Pipeline:**
```
UI DeploymentModal -> IPC deployment:deploy -> packageWorkflow() -> CLI createPackageFromPrompdJson
  -> DeploymentService.deploy() -> extract .pdpkg -> resolveDependencies -> installPackages
```

**Key files:**
- `frontend/electron/services/packageWorkflow.js` - Packages workflows into .pdpkg
- `packages/scheduler/src/DeploymentService.ts` - Deploys and manages deployments
- `packages/scheduler/src/DeploymentDependencyResolver.ts` - Resolves .prmd dependencies post-extraction
- `frontend/src/modules/components/deployment/DeploymentModal.tsx` - UI
- `frontend/src/modules/components/deployment/DeployWorkflowModal.tsx` - Deploy workflow UI

**Deployment statuses:** `enabled` | `disabled` | `deleted` | `failed`

### Electron IPC Bridge

All native operations go through `window.electronAPI` defined in `frontend/electron/preload.js`. Always check `window.electronAPI?.isElectron` before using IPC methods.

**IPC Namespaces:**

| Namespace | Methods | Purpose |
|-----------|---------|---------|
| File system | `readFile`, `writeFile`, `openFolder`, etc. | File operations |
| `compiler.*` | `compile`, `validate` | Prompt compilation via @prompd/cli |
| `workflow.*` | `execute`, `stop`, `onEvent` | Workflow execution |
| `deployment:*` | `deploy`, `undeploy`, `list`, `getStatus`, `toggleStatus`, `execute`, `getHistory`, `getAllExecutions`, `getParameters`, `clearAllHistory`, `purgeDeleted`, `getVersionHistory` | Deployment management |
| `scheduler:*` | `getSchedules`, `addSchedule`, `updateSchedule`, `deleteSchedule`, `executeNow`, `getHistory`, `getNextRunTimes` | Schedule/cron management |
| `trigger:*` | `register`, `unregister`, `setEnabled`, `list`, `status`, `history`, `webhookServerInfo`, `trayState`, `updateSettings` | Trigger management |
| `service:*` | `getStatus`, `install`, `uninstall`, `start`, `stop` | System service management |
| Git | `runGitCommand` | Whitelisted git operations |
| HTTP | `makeRequest` | HTTP proxy requests |

### Monaco Editor Integration

Centralized config in `modules/lib/monacoConfig.ts`, initialized once in `App.tsx`. Provides IntelliSense for package completions (`@namespace/package@^1.0.0`), variable decoration (`{variable}` syntax highlighting), and real-time YAML/Markdown validation.

Monaco must be pre-bundled via Vite (`optimizeDeps.include`) while `@prompd/cli` must be excluded (requires Node.js IPC).

## Security Constraints

### Git Command Whitelist
- **Allowed:** `status`, `log`, `diff`, `show`, `branch`, `remote`, `fetch`, `add`, `commit`, `push`, `pull`, `checkout`, `merge`, `rebase`, `clone`, `init`, `config`
- **Blocked:** `gc`, `reflog`, `filter-branch`, `update-ref`, `daemon`, `http-backend`, `shell`, any command with `--exec` or `--upload-pack`
- Implementation: `frontend/electron/main.js` - `runGitCommand()`

### Path Traversal Protection
All file system operations reject paths containing `..`, normalize paths before operations, and scope access to workspace directory or user home.

## Configuration

**Frontend `.env`** (optional cloud features): `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_API_BASE_URL`, `VITE_REGISTRY_URL`

**Backend `.env`**: `MONGODB_URI`, `JWT_SECRET`, `PORT`

**User config** (`~/.prompd/config.yaml`): API keys, default provider/model, registry URL

## Port Allocation

| Port | Service | Required |
|------|---------|----------|
| 5173 | Frontend Vite dev server | Yes (dev) |
| 3010 | Backend API | Optional |
| 4000 | Local registry (dev) | Optional |

Vite dev server binds to `127.0.0.1` (IPv4 only) for Electron compatibility. Frontend proxies `/api` requests to `http://localhost:3010` via Vite config.

## TypeScript

- Strict mode enabled, `noEmit` (Vite handles bundling)
- Path alias: `@/*` maps to `src/*` - configured in both `tsconfig.json` AND `vite.config.ts`
- Target: ES2020, Module: ESNext, JSX: react-jsx, moduleResolution: Bundler
- NEVER use `any` - always use proper types

## File Formats

- `.prmd` - Prompt files (YAML frontmatter + Markdown)
- `.pdflow` - Workflow definitions (YAML with XYFlow nodes/edges)
- `.pdproj` - Project files (workspace configuration)
- `.pdpkg` - Package bundles (ZIP archives with manifest.json)

**Path resolution:** ALL file references in `.prmd` and `.pdflow` files (`inherits:`, `context:`, `contexts:`, `files:`, `override:`, `{% include %}`) are **relative to the containing file's directory**, not the workspace root.

## Code Style

No linter/formatter config - follow existing patterns. See [AGENTS.md](AGENTS.md) for detailed coding guidelines including import organization, component patterns, error handling, and naming conventions. Note: AGENTS.md largely duplicates this file's content — when updating build commands, architecture, or gotchas, update CLAUDE.md (the canonical source) and keep AGENTS.md for agent-specific coding patterns only.

Key rules:
- 2-space indentation for TypeScript/JSX
- Functional components with hooks only (no classes)
- Props interfaces defined above component
- Selective Zustand subscriptions (never subscribe to entire store)
- `BuildError` interface for compilation errors, `Toast` for user notifications

## Build Artifacts

**Electron build pipeline:** clean -> generate-icons -> tsc -> vite build -> license generation -> electron-builder -> afterPack (`scripts/afterPack.cjs`)

**Output:** `frontend/dist/` (web), `frontend/dist-electron/` (desktop + installers)

**Asar:** `@prompd/cli` is excluded from asar (asarUnpack) for runtime Node.js execution. Icon files are copied to resources via extraResources.

## Known Gotchas

- **`@prompd/react` not found**: Build `packages/react` first
- **`@prompd/cli` compilation failing**: It's Node.js only - uses IPC in Electron, excluded from Vite bundling
- **Import `@/...` resolution errors**: Ensure `vite.config.ts` has the `@` path alias configured
- **Electron not starting**: Use `npm run electron:dev` from frontend/ (auto-starts Vite). If running Electron manually, Vite must already be serving on `:5173`.
- **IPC not available**: Guard with `window.electronAPI?.isElectron` check
- **Icons not showing in build**: Run `npm run generate-icons` before `electron:build`
- **Windows CRLF breaks regex parsing**: When parsing `.prmd` frontmatter with regex (e.g., `/^---\n([\s\S]*?)\n---/`), always normalize first: `content.replace(/\r\n/g, '\n')`. The `PrompdParser.parse()` from `@prompd/cli` handles this, but manual regex does not.
- **node-cron step notation silently fails**: `react-cron-generator` outputs `0/N` and `N/1` patterns that `node-cron` validates but never fires. Normalize `0/N` to `*/N` and `N/1` to `*` before registering with node-cron. Applied in `TriggerManager.ts` at registration time.
- **.prmd field variants**: `context:` (singular) AND `contexts:` (plural) are both valid; can be string or array. `override:` is an object with file path values.

## Documentation

- [CLAUDE-ARCHITECTURE.md](CLAUDE-ARCHITECTURE.md) - Deep architectural details (node types, state management, execution model)
- [AGENTS.md](AGENTS.md) - Coding guidelines and patterns
- [backend/CLAUDE.md](backend/CLAUDE.md) - Backend-specific architecture, routes, and MongoDB models
- [frontend/ELECTRON.md](frontend/ELECTRON.md) - Electron build and distribution
- [frontend/MONACO-CONFIG.md](frontend/MONACO-CONFIG.md) - Monaco editor configuration
- [docs/editor.md](docs/editor.md) - Editor features and usage

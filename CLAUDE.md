# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Prompd** - A local-first Electron desktop application for creating and executing AI workflows with `.prmd` (Prompd format) files, featuring visual workflow canvas, Monaco code editor, and package-based inheritance.

**Tech Stack:**
- Frontend: React 18 + TypeScript + Vite + Monaco Editor + Zustand
- Backend: Node.js 18+ ESM + Express + MongoDB (optional - for cloud features)
- Desktop: Electron with File System Access API and IPC bridge
- Workflow Canvas: XYFlow (React Flow)
- Monorepo: Local `@prompd/react` package + linked `@prompd/cli`

## Development Commands

### Initial Setup

**IMPORTANT - Monorepo Build Order:**
```bash
# 1. Build @prompd/react first (required dependency)
cd packages/react && npm install && npm run build

# 2. Then install frontend
cd ../../frontend && npm install

# 3. Backend (optional)
cd ../backend && npm install
```

### Root-Level Commands
```bash
npm run dev                   # Start frontend Vite dev server (:5173)
npm run dev:backend           # Start backend API server (:3010)
npm run build                 # Build @prompd/react + frontend (production)
npm run build:react           # Build only @prompd/react package
npm run electron:dev          # Launch Electron app
npm run electron:build:win    # Windows installer (NSIS + portable)
```

### Frontend Development
```bash
cd frontend

# Development
npm run dev                    # Vite dev server on :5173
npm run electron:dev           # Electron with hot reload (Vite must be running)

# Build
npm run build                  # Production build (includes license generation)
npm run electron:build         # Build for current platform
npm run electron:build:win     # Windows (NSIS + portable)
npm run electron:build:mac     # macOS (DMG + zip)
npm run electron:build:linux   # Linux (AppImage + deb)

# Utilities
npx tsc --noEmit               # TypeScript validation (no emit)
npm run clean                  # Remove dist/ and dist-electron/
npm run generate-icons         # Generate app icons from source PNG
npm run generate-licenses      # Generate licenses.json for About dialog
npm run preview                # Preview production build
```

### Backend Development
```bash
cd backend

npm run dev                    # Development with nodemon on :3010
npm start                      # Production mode
npm test                       # Run all Jest tests (requires MongoDB)
npm test -- packages.test.js   # Run specific test file
npm test -- --testNamePattern="should create"  # Run tests matching pattern
```

### Monorepo Package Development
```bash
cd packages/react

npm run dev                    # Watch mode (auto-rebuild on changes)
npm run build                  # Production build (ESM + CJS + types)
npm run typecheck              # TypeScript validation
```

## Architecture

### Monorepo Structure

```
prompd.app/
├── packages/
│   └── react/              # @prompd/react - Chat UI component library
│       ├── src/            # React components, hooks, stores
│       ├── dist/           # Built output (ESM + CJS + .d.ts)
│       └── package.json    # Exports: CJS, ESM, types, CSS
├── frontend/               # Electron + React app
│   ├── src/modules/        # All application code
│   ├── electron/           # Main process, preload, IPC bridge
│   ├── public/             # Static assets
│   └── package.json        # Links: @prompd/react (local), @prompd/cli (symlink)
├── backend/                # Optional backend API
│   ├── src/routes/         # Express routes
│   └── src/server.js       # Entry point
└── package.json            # Root scripts (delegates to workspace)
```

**Critical Dependencies:**
- `@prompd/cli` - Prompt compiler (symlinked from `../../Logikbug/prompd-cli/cli/npm`)
- `@prompd/react@^0.2.0` - Chat UI (local package via `file:../packages/react`)

**Note:** `@prompd/cli` is a symlink to the local Logikbug monorepo, not a versioned npm package.

### Execution Model - Local-First

All core operations execute locally via Electron IPC:

```
User Action → executionRouter → localExecutor → Direct HTTPS to LLM APIs
                              ↘ localCompiler → Electron IPC → @prompd/cli
```

**What Runs Locally (Electron Main Process):**
- LLM API calls (direct to OpenAI, Anthropic, Google, etc.)
- Prompt compilation via `@prompd/cli` (Node.js only, not browser-compatible)
- Workflow execution and scheduling (node-cron)
- File operations (fs, path traversal protection)
- Git operations (whitelisted commands only - see Security)
- Config management (~/.prompd/config.yaml)

**What Uses Backend API (Optional):**
- Provider/model list updates (`/api/llm-providers`) - cached locally for offline
- Registry package search (`registry.prompdhub.ai`)
- Usage analytics (`/api/usage/sync`)
- Cloud project sync (`/api/projects`)

**API Key Resolution (priority order):**
1. Workspace `.env` file (current working directory)
2. User config (`~/.prompd/config.yaml`)
3. System environment variables

### State Management (Zustand)

Four stores with Immer middleware in [frontend/src/stores/](frontend/src/stores/):

| Store | Purpose | Persisted | Size |
|-------|---------|-----------|------|
| [editorStore](frontend/src/stores/editorStore.ts) | Editor state, tabs, file explorer, build output | Yes | ~18KB |
| [uiStore](frontend/src/stores/uiStore.ts) | UI state, theme, LLM provider/model selection | Yes | ~35KB |
| [wizardStore](frontend/src/stores/wizardStore.ts) | Transient wizard flow state | No | ~3KB |
| [workflowStore](frontend/src/stores/workflowStore.ts) | Workflow canvas, nodes, history, execution state | Yes | ~85KB |

**Note:** workflowStore is complex due to workflow execution tracking (executionResult, checkpoints, promptsSent, executionHistory), undo/redo system, and 25+ node type support.

**CRITICAL PATTERN - Selective Subscriptions:**
```typescript
// GOOD - Only re-renders when text changes
const text = useEditorStore(state => state.text)

// BAD - Re-renders on ANY store change
const store = useEditorStore()
```

### Workflow Canvas System

Visual workflow editing with `.pdflow` files using XYFlow (React Flow).

**Key Features:**
- **25+ Node Types:**
  - **Core:** trigger, prompt, agent, chatAgent, tool, mcpTool
  - **Execution:** command, code, claudeCode, workflow
  - **Flow Control:** condition, loop, parallel (parallelBroadcast, parallelFork), merge, errorHandler, guardrail
  - **Data:** transform, memory, callback, provider
  - **UI:** userInput, output
  - **Routing:** toolCallParser, toolCallRouter, container
- Undo/redo history (50 snapshots, 300ms debounce)
- Real-time validation with visual feedback
- Compound nodes (loop, parallel) with parent/child relationships
- Scheduled workflows (cron expressions + interval)
- Webhook triggers with proxy support
- Node execution states: idle, running, completed, error, paused, waiting, skipped

**Scheduler Implementation:**
- Uses `node-cron@^3.0.3` in Electron main process
- Persistent storage of scheduled workflows
- IPC bridge: `window.electronAPI.scheduler.addJob({ workflowId, type, cron })`
- Located in [frontend/electron/main.js](frontend/electron/main.js#L250-L350)

**Core Files:**
- [stores/workflowStore.ts](frontend/src/stores/workflowStore.ts) - State management
- [services/workflowTypes.ts](frontend/src/modules/services/workflowTypes.ts) - TypeScript interfaces
- [services/workflowParser.ts](frontend/src/modules/services/workflowParser.ts) - Parse/serialize workflows
- [services/workflowExecutor.ts](frontend/src/modules/services/workflowExecutor.ts) - Execution engine
- [services/workflowValidator.ts](frontend/src/modules/services/workflowValidator.ts) - Validation rules
- [editor/WorkflowCanvas.tsx](frontend/src/modules/editor/WorkflowCanvas.tsx) - Canvas component
- [components/workflow/nodes/](frontend/src/modules/components/workflow/nodes/) - Node components

### Monaco Editor Integration

**Global Configuration:**
- Centralized in [lib/monacoConfig.ts](frontend/src/modules/lib/monacoConfig.ts)
- Initialized once in [App.tsx](frontend/src/modules/App.tsx)
- Presets: `defaultEditorOptions`, `yamlEditorOptions`, `markdownEditorOptions`, `readOnlyEditorOptions`
- Theme helper: `getMonacoTheme(isDark)` returns `'vs-dark' | 'light'`

**IntelliSense System:**
- Package completions: `@namespace/package-name@^1.0.0`
- Variable decorations: Highlights `{variable}` syntax
- Auto-fix: Converts `@package` to `@namespace/package@latest`
- Cross-reference: Cmd/Ctrl+Click on package imports
- Validation: Real-time YAML/Markdown linting

**Monaco Optimization (vite.config.ts):**
```javascript
optimizeDeps: {
  include: ['monaco-editor/esm/vs/editor/editor.api'],
  exclude: ['@prompd/cli']  // Main export requires Node.js (uses IPC)
}
```

### Electron IPC Bridge

All native operations via `window.electronAPI` ([frontend/electron/preload.js](frontend/electron/preload.js)):

```typescript
// File System
window.electronAPI.readFile(path)
window.electronAPI.writeFile(path, content)
window.electronAPI.openFolder()
window.electronAPI.selectFile(filters)

// Compilation
window.electronAPI.compiler.compile(content, options)
window.electronAPI.compiler.validate(content)

// Workflow Execution
window.electronAPI.workflow.execute(workflow)
window.electronAPI.workflow.stop(workflowId)

// Git Operations (whitelisted - see Security)
window.electronAPI.runGitCommand(args, cwd)

// Scheduler
window.electronAPI.scheduler.addJob({ workflowId, type: 'cron', cron: '*/5 * * * *' })
window.electronAPI.scheduler.removeJob(jobId)
window.electronAPI.scheduler.listJobs()

// System
window.electronAPI.isElectron  // Boolean flag
window.electronAPI.platform    // 'win32' | 'darwin' | 'linux'
```

## Security Constraints

### Git Command Whitelist

Git operations are restricted to safe, read-only or user-initiated commands:

**Allowed:**
- `status`, `log`, `diff`, `show`, `branch`, `remote`, `fetch`
- `add`, `commit`, `push`, `pull`, `checkout`, `merge`, `rebase`
- `clone`, `init`, `config` (scoped to repo only)

**Blocked:**
- `gc`, `reflog`, `filter-branch`, `update-ref` (destructive)
- `daemon`, `http-backend`, `shell` (server/remote execution)
- Any command with `--exec` or `--upload-pack` flags

Implementation: [frontend/electron/main.js](frontend/electron/main.js) - `runGitCommand()`

### Path Traversal Protection

All file system operations validate paths to prevent directory traversal:
- Rejects paths containing `..`
- Normalizes paths before operations
- Scoped to workspace directory or user home

## Configuration

### Frontend (.env)
```bash
# Optional - for cloud features
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_API_BASE_URL=/api
VITE_REGISTRY_URL=http://localhost:4000
```

### Backend (.env)
```bash
MONGODB_URI=mongodb://localhost:27017/prompd-editor
JWT_SECRET=your-secret-key-here
PORT=3010
```

### User Config (~/.prompd/config.yaml)
```yaml
apiKeys:
  openai: sk-...
  anthropic: sk-ant-...
  google: ...
defaultProvider: openai
defaultModel: gpt-4
registryUrl: https://registry.prompdhub.ai
```

## Port Allocation

| Port | Service | Required |
|------|---------|----------|
| 5173 | Frontend Vite dev server | Yes (dev) |
| 3010 | Backend API | Optional |
| 4000 | Local registry (dev) | Optional |

## File Formats

- `.prmd` - Prompt files (YAML frontmatter + Markdown)
- `.pdflow` - Workflow definitions (YAML with XYFlow nodes/edges)
- `.pdproj` - Project files (workspace configuration)
- `.pdpkg` - Package bundles (ZIP archives with manifest.json)

## TypeScript

**Configuration ([frontend/tsconfig.json](frontend/tsconfig.json)):**
- Strict mode enabled
- Path alias: `@/*` maps to `src/modules/*` (not `src/*` - note the `/modules` subdirectory)
- Target: ES2020
- Module: ESNext (Vite handles bundling)

**Frontend Source Structure:**
```
frontend/src/
├── modules/          # Main application code (components, services, editor, etc.)
│   ├── App.tsx       # Main application component
│   ├── components/   # React components
│   ├── editor/       # Editor-specific components
│   ├── services/     # Business logic
│   └── ...
├── stores/           # Zustand state management
├── constants/        # App constants
├── styles/           # Global CSS
└── main.tsx          # Application entry point
```

**Best Practices:**
- NEVER use `any` - always use proper types
- All components use functional + hooks (no classes)
- Props must have TypeScript interfaces
- Import organization: React core → third-party → local (`@/*`)

## Common Issues

### Build Issues
- **TypeScript errors**: Run `npx tsc --noEmit` in frontend directory
- **Monaco not loading**: Verify `optimizeDeps` in [vite.config.ts](frontend/vite.config.ts)
- **@prompd/react not found**: Build `packages/react` first (`cd packages/react && npm run build`)
- **@prompd/cli not found**: Verify symlink at `frontend/node_modules/@prompd/cli`

### Development Issues
- **Port 5173 in use**: Kill Vite process or change port in [vite.config.ts](frontend/vite.config.ts)
- **Electron not starting**: Ensure Vite dev server runs first (`npm run dev`)
- **Too many re-renders**: Use selective Zustand subscriptions (see State Management)
- **Backend connection refused**: Verify MongoDB is running (only needed for backend)
- **Hot reload not working**: Check HMR settings in [vite.config.ts](frontend/vite.config.ts)

### Electron-Specific
- **OAuth callback not received**: Verify `prompd://` protocol registered (check [frontend/package.json](frontend/package.json) → build.protocols)
- **Icons not showing**: Run `npm run generate-icons` before build
- **IPC not available**: Check `window.electronAPI?.isElectron` before using IPC methods
- **Compilation failing**: Ensure `@prompd/cli` is properly installed (not bundled with Vite)

## Code Style

**NO LINTER CONFIG** - Follow existing patterns in codebase:
- 2-space indentation for TypeScript/JSX
- Functional components with hooks
- Props interfaces defined above component
- Selective Zustand subscriptions
- Consistent import organization

**Error Handling:**
- Use `BuildError` interface for compilation errors
- Use `Toast` interface for user notifications
- Always wrap async/await in try/catch
- React error boundaries for component errors

**File Naming:**
- Components: PascalCase (e.g., `PrompdEditor.tsx`)
- Services: camelCase (e.g., `executionRouter.ts`)
- Types: camelCase with `.types.ts` suffix
- Utilities: camelCase

## Documentation

- [AGENTS.md](AGENTS.md) - Coding guidelines and patterns (for agentic coding tools)
- [README.md](README.md) - Project overview and quick start
- [frontend/ELECTRON.md](frontend/ELECTRON.md) - Electron build and distribution
- [frontend/MONACO-CONFIG.md](frontend/MONACO-CONFIG.md) - Monaco editor configuration
- [docs/editor.md](docs/editor.md) - Editor features and usage

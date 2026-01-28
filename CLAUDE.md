# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Prompd** - A Monaco-based web editor and Electron desktop app for `.prmd` (Prompd format) files with guided wizard interface, package-based inheritance, and registry integration.

**Tech Stack:**
- Frontend: React 18 + TypeScript + Vite + Monaco Editor + Zustand
- Backend: Node.js 18+ ESM + Express + MongoDB + Socket.IO
- Desktop: Electron with File System Access API
- Registry: https://registry.prompdhub.ai

## Quick Start

```bash
# Frontend only (recommended for UI development)
cd frontend && npm install && npm run dev    # http://localhost:5173

# Electron desktop app
cd frontend && npm run electron:dev          # Vite + Electron with hot reload

# Backend (requires MongoDB, enables AI generation, compilation, WebSocket)
cd backend && npm install && npm run dev     # http://localhost:3010
```

**Dependencies:**
- `@prompd/cli@^0.3.3` - Published npm package (both frontend and backend use this)
- `@prompd/react` - Local monorepo package at `./packages/react` (chat UI components)

### @prompd/react Package

Located at `packages/react/` - A React component library for AI interfaces with chat UI and intent classification.

**Important:** Build this package first before building the frontend (the frontend depends on it).

```bash
cd packages/react
npm install
npm run build        # Build the library
npm run dev          # Watch mode for development
npm test             # Run Vitest tests
npm test -- --watch  # Run tests in watch mode
npm run typecheck    # TypeScript validation without emit
```

This package is linked locally via `file:../packages/react` and provides reusable chat components used by the frontend.

## Coding Guidelines

For detailed coding standards, import organization, TypeScript patterns, and security guidelines, see [AGENTS.md](AGENTS.md).

**Key Principles**:
- Strict TypeScript (no `any` types)
- ESM modules throughout
- Selective Zustand subscriptions to prevent re-renders
- Functional components only
- Path aliases: Use `@/*` for frontend imports

## Development Commands

### Root-Level (Convenience Scripts)
```bash
npm run dev                   # Start frontend only
npm run dev:backend          # Start backend only
npm run build                # Build @prompd/react + frontend
npm run build:react          # Build @prompd/react only
npm run electron:dev         # Launch Electron desktop app
npm run electron:build:win   # Build Windows installer
```

### Frontend
```bash
cd frontend
npm run dev                    # Vite dev server on :5173
npm run build                  # tsc + vite build (production)
npm run electron:dev           # Electron with hot reload
npm run electron:build:win     # Windows installer (NSIS + portable)
npm run electron:build:mac     # macOS (DMG + zip)
npm run electron:build:linux   # Linux (AppImage + deb)
npx tsc --noEmit               # TypeScript validation (no emit)
npm run generate-icons         # Generate app icons from source
npm run clean                  # Remove dist and dist-electron folders
```

### Backend
```bash
cd backend
npm run dev                    # Development with nodemon on :3010
npm start                      # Production mode
npm test                       # Run all Jest tests (requires MongoDB)
npm test -- packages.test.js   # Specific test file
npm test -- --testNamePattern="should create"  # Test name pattern
```

**Note:** Backend tests use Jest with default configuration (no jest.config file). Tests require MongoDB connection.

## Architecture

### State Management (Zustand)

Three stores with Immer middleware in `frontend/src/stores/`:

| Store | Persisted | Purpose |
|-------|-----------|---------|
| `editorStore` | tabs, activeTabId, currentProjectId | All editor state, tabs, parsing, file explorer, build output |
| `uiStore` | theme, sidebarWidth, llmProvider, llmModel | UI state, modals, theme, LLM provider/model selection |
| `wizardStore` | no | Transient wizard flow state |

Shared types in `frontend/src/stores/types.ts` define Tab, Toast, BuildError, BuildOutput interfaces.

**Critical Pattern - Selective Subscriptions:**
```typescript
// GOOD - Only re-renders when text changes
const text = useEditorStore(state => state.text)

// BAD - Re-renders on ANY store change
const store = useEditorStore()
```

### Tab System

Tab types: `file`, `execution`, `chat`. View modes: `wizard`, `design`, `code`.

Key properties: `savedText` for dirty detection, `handle` for File System Access API, `packageSource` for read-only package files, `chatConfig` for AI conversation state.

### Workflow Canvas System

The app supports visual workflow editing with `.pdflow` files using XYFlow (React Flow).

**Store**: `workflowStore.ts` with Immer middleware and undo/redo history (max 50 snapshots, 300ms debounce)

**Key Features**:
- **Node Types**: 20+ node types including trigger, prompt, provider, agent, chat-agent, tool, tool-call-router, condition, loop, transformer, api, callback, user-input, error-handler, command, claude-code, workflow, mcp-tool, code, memory, output
- **Undo/Redo**: Full history tracking with 300ms debounce for drag operations
- **Compound Nodes**: Container nodes (loop, parallel) with child node support via `parentId` and `extent`
- **Docked Previews**: Collapsible node previews with quick actions (in development)
- **File Format**: `.pdflow` files with YAML-compatible structure
- **Validation**: Real-time error and warning detection with visual feedback

**Architecture Files**:
- [frontend/src/stores/workflowStore.ts](frontend/src/stores/workflowStore.ts) - State management with history
- [frontend/src/modules/services/workflowTypes.ts](frontend/src/modules/services/workflowTypes.ts) - TypeScript interfaces
- [frontend/src/modules/services/workflowParser.ts](frontend/src/modules/services/workflowParser.ts) - Parse/serialize workflows
- [frontend/src/modules/editor/WorkflowCanvas.tsx](frontend/src/modules/editor/WorkflowCanvas.tsx) - Main canvas component
- [frontend/src/modules/components/workflow/nodes/](frontend/src/modules/components/workflow/nodes/) - Node components (AgentNode, LoopNode, ChatAgentNode, etc.)
- [frontend/src/modules/components/workflow/PropertiesPanel.tsx](frontend/src/modules/components/workflow/PropertiesPanel.tsx) - Dynamic properties editor

**Node Execution States**: idle, running, completed, error, paused, waiting, skipped

**Quick Actions System** (in development):
- Dockable node previews with collapse/expand
- Context-aware action buttons per node type
- Visual indicators for node status and validation
- Properties panel integration with dynamic forms

### Local-First Execution Architecture

The app supports two execution paths determined by `executionRouter.ts`:

**Local Execution (Electron with API keys):**
```
User → executionRouter → localExecutor → Direct LLM API call
                       ↘ localCompiler (via Electron IPC to @prompd/cli)
```

**Remote Execution (Web or Electron without local keys):**
```
User → executionRouter → Backend API → AiGenerationService → LLM API
```

The router checks `configService.getApiKey(provider)` - if a key exists locally, execution stays client-side for lower latency and privacy.

**API Key Sources (priority order):**
1. Workspace `.env` file (selected via `EnvFileSelector.tsx`)
2. User config stored in `configService`
3. Environment variables (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.)

### Electron IPC Bridge

Desktop app uses IPC for native filesystem access via `window.electronAPI`:

```typescript
// File system operations
window.electronAPI.openFolder()              // Dialog to select folder
window.electronAPI.readFile(path)            // Read file contents
window.electronAPI.writeFile(path, content)  // Write file
window.electronAPI.readDir(dirPath)          // List directory
window.electronAPI.getWorkspacePath()        // Current workspace

// Git operations (whitelisted: status, branch, add, restore, commit, log, init, diff)
window.electronAPI.runGitCommand(args, cwd)

// Local compilation (uses @prompd/cli ESM module)
window.electronAPI.compiler.compile(content, options)  // Compile .prmd content
window.electronAPI.compiler.getInfo()                   // Get compiler version

// Authentication
window.electronAPI.startOAuth()              // Initiate Clerk OAuth flow

// Agent/command execution
window.electronAPI.runCommand(command, cwd)  // Execute shell commands (whitelisted)
```

Check `window.electronAPI?.isElectron` to detect Electron context. Full IPC API in `frontend/electron/preload.js`.

**Security Notes:**
- Git commands are whitelisted to prevent command injection
- Path traversal (`..`, `~`) and shell metacharacters are blocked
- OAuth uses PKCE flow for secure desktop authentication

### Backend API Routes

All routes mounted in `backend/src/server.js`.

**Core Endpoints:**
- `/api/projects` - Project CRUD operations
- `/api/packages` - Package management
- `/api/compilation/execute` - LLM execution (POST)
- `/api/files` - File operations
- `/api/registry` - Registry proxy
- `/api/chat` - Chat with AI (preferred)
- `/api/chat-modes` - Chat mode configuration (GET)
- `/api/llm-providers` - Provider/model listing
- `/api/pricing` - Token pricing info
- `/api/auth` - Authentication endpoints
- `/api/usage` - Usage tracking
- `/api/startup` - Startup/onboarding API
- `/api/errors` - Error reporting endpoints

**Endpoint Consolidation Notes:**
- **Chat**: Use `/api/chat` (newer). Legacy: `/api/ai/chat`, `/api/conversational-ai/chat`
- **Providers**: Use `/api/llm-providers` (newer). Legacy: `/api/v1/providers`

### Compilation

Backend uses `@prompd/cli@^0.3.3` TypeScript library from npm:

```javascript
import { PrompdCompiler, MemoryFileSystem } from '@prompd/cli'

const memFS = new MemoryFileSystem({ '/main.prmd': content })
const result = await compiler.compile('/main.prmd', {
  outputFormat: 'markdown',
  parameters: { key: 'value' },
  fileSystem: memFS
})
```

The CLI is also used in Electron via IPC for local compilation (see Electron IPC Bridge section).

### Package Cache

```
./.prompd/cache/
└── @namespace/package-name@1.0.0/
    ├── metadata.json    # Web editor cache index (NOT from CLI)
    ├── manifest.json    # From .pdpkg package
    └── prompts/         # From .pdpkg package
```

Uses File System Access API with IndexedDB fallback.

## Port Allocation

| Port | Service |
|------|---------|
| 5173 | Frontend dev server (Vite) |
| 3010 | Backend API (Vite proxies `/api` here) |
| 4000 | Registry API (local dev) |
| 4050 | Prmd.ai API (AI chat) |

## Configuration

### Frontend (frontend/.env)
```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_API_BASE_URL=/api           # Uses Vite proxy to backend
VITE_REGISTRY_URL=http://localhost:4000
ELECTRON_START_URL=http://127.0.0.1:5173
```

### Backend (backend/.env)
```bash
# Required
MONGODB_URI=mongodb://localhost:27017/prompd-editor
JWT_SECRET=your-secret-key-here

# Optional
PORT=3010
CLERK_SECRET_KEY=sk_test_...
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

### IntelliSense System

Located in `frontend/src/modules/lib/intellisense/`:

| File | Purpose |
|------|---------|
| `completions.ts` | Package completions from registry, parameter suggestions |
| `validation.ts` | Real-time error detection and diagnostics |
| `hover.ts` | Package metadata and parameter info on hover |
| `context.ts` | Document context analysis (YAML frontmatter, parameters) |
| `codeActions.ts` | Quick fixes and refactoring suggestions |
| `filters.ts` | Completion filtering and ranking |
| `utils.ts` | Shared utilities for IntelliSense providers |
| `index.ts` | Module exports and initialization |

**Key Features:**
- Live registry package search (triggered by `@` or in `using:` sections)
- Parameter reference suggestions (triggered by `{`)
- 5-minute TTL cache for registry responses via `envCache.ts`
- Fallback to offline mode when registry unavailable

## Chat Modes

Five conversation modes with dynamic backend configuration (served via `GET /api/chat-modes`):

| Mode | Purpose | Behavior |
|------|---------|----------|
| Generate | Create new .prmd files | Generate immediately if detailed, ask 1-3 questions if vague. NO registry search. |
| Explore | Discover registry packages | ALWAYS search registry first with 3-5 keywords |
| Edit | Modify existing files | Requires open file, proposes changes via `edit-file` JSON before applying |
| Discuss | Brainstorm ideas | Conversational, suggests modes when ready to build |
| Agent | Autonomous task execution | Multi-step workflows with tool use, file operations, and plan approval |

Config files: `backend/src/prompts/modes/*.json` (updates take effect without frontend rebuild)

**Agent Mode Details:**
- Uses `useAgentMode.ts` hook for state management
- Supports plan approval workflow via `PlanApprovalDialog.tsx`
- Parses agent XML responses via `agentXmlParser.ts`
- See [docs/AGENT-INTEGRATION-PLAN.md](docs/AGENT-INTEGRATION-PLAN.md) for full architecture

## Key Files

**Frontend Entry Points:**
- [frontend/src/main.tsx](frontend/src/main.tsx) - React app bootstrap
- [frontend/src/modules/App.tsx](frontend/src/modules/App.tsx) - Main app component with layout
- [frontend/electron/main.js](frontend/electron/main.js) - Electron main process
- [frontend/electron/preload.js](frontend/electron/preload.js) - IPC bridge exposed to renderer

**Backend Entry Point:**
- [backend/src/server.js](backend/src/server.js) - Express server with all route mounting

**Configuration:**
- [frontend/vite.config.ts](frontend/vite.config.ts) - Vite config with API proxy to :3010
- [frontend/package.json](frontend/package.json) - Electron builder config in `build` section

**Key UI Components** (in `frontend/src/modules/`):
- `editor/PrompdEditor.tsx` - Monaco editor wrapper with IntelliSense
- `editor/PrompdJsonEditor.tsx` - Structured JSON editor for .prmd metadata
- `editor/AiChatPanel.tsx` - AI assistant with mode switching
- `editor/FileExplorer.tsx` - Workspace file tree
- `editor/DesignView.tsx` - Visual prompt designer
- `components/PlanApprovalDialog.tsx` - Agent mode plan confirmation
- `components/BuildOutputPanel.tsx` - Compilation output display
- `components/EnvFileSelector.tsx` - Environment file picker for local API keys

**Key Services** (in `frontend/src/modules/services/`):
- `executionRouter.ts` - Routes execution between local and remote
- `localExecutor.ts` - Direct LLM API calls when API keys available locally
- `localCompiler.ts` - Compilation via Electron IPC to @prompd/cli
- `configService.ts` - API key storage and retrieval
- `agentXmlParser.ts` - Parses agent mode XML responses
- `packageService.ts` - Package installation and cache management
- `registryApi.ts` - Registry search and package metadata

## Data Flow Architecture

### Editor → Backend Execution Flow
1. User opens `.prmd` file → `editorStore.setText()` → Monaco renders
2. User clicks Execute → `executionService.executePrompt()` with provider/model from `uiStore`
3. Backend compiles via `@prompd/cli` → Calls LLM API → Streams response via Socket.IO
4. Response renders in execution tab → Stored in `ExecutionHistory` model

### Package Installation Flow
1. User searches → `registryApi.searchPackages()` → Registry API
2. User installs → `packageService.installPackage()` downloads `.pdpkg`
3. Package cached to `.prompd/cache/` via File System Access API or IndexedDB
4. `inherits:` references resolved during compilation

### Authentication Flow (Electron)
1. User clicks Sign In → `auth.startOAuth()` → Opens browser with PKCE challenge
2. Clerk handles OAuth → Redirects to `prompd://oauth/callback`
3. Electron intercepts protocol → `auth:exchangeCode` → Tokens stored locally
4. API calls include Bearer token → Backend validates via Clerk SDK

### Workflow Execution Flow
1. User creates workflow → `workflowStore.setWorkflowFile()` → Nodes/edges rendered on canvas
2. User modifies nodes → History snapshot created → Undo/redo available
3. User clicks Execute → Workflow validated → Execution state tracked per node
4. Nodes execute sequentially/parallel based on connections and node types
5. Results stored in node execution status → Visual feedback on canvas
6. Completion/errors displayed with status indicators

### Workflow Validation

The workflow system includes real-time validation:

**Validation Types**:
- **Errors**: Missing required fields, invalid references, circular dependencies, disconnected nodes
- **Warnings**: Performance concerns, best practice suggestions, deprecated patterns
- **Connection Status**: Visual feedback for edge connections (valid, invalid, warning)

Validation runs automatically on node changes and displays in BuildOutputPanel.

## Common Issues

### Build Issues
- **TypeScript errors**: Run `npx tsc --noEmit` in frontend directory
- **Monaco not loading**: Check `optimizeDeps` in vite.config.ts includes monaco-editor paths
- **@prompd/react not found**: Ensure `./packages/react` is built first (`cd packages/react && npm install && npm run build`)
- **@prompd/cli version mismatch**: Run `npm install` to get latest version from npm registry

### Development Issues
- **Port 5173 in use**: Kill existing Vite process or change port in vite.config.ts
- **CORS errors**: Check Vite proxy config or verify backend CORS middleware
- **Electron not starting**: Ensure Vite dev server is running first (electron:dev uses wait-on)
- **Too many re-renders**: Use selective Zustand subscriptions (see State Management section)
- **Backend connection refused**: Verify MongoDB is running and MONGODB_URI is correct

### Electron-specific
- **File associations not working**: Rebuild with `npm run electron:build:win` after package.json changes
- **OAuth callback not received**: Ensure `prompd://` protocol is registered (auto on first run)
- **Icons not showing**: Run `npm run generate-icons` before build
- **Blank screen on launch**: Check if Vite dev server is running on port 5173

## Electron Build Size Optimization

The `frontend/package.json` build config includes file exclusions to reduce app size:

```json
"files": [
  "dist/**/*",
  "electron/**/*",
  "public/**/*",
  "!**/*.map",
  "!**/node_modules/**/*.md",
  "!**/node_modules/**/*.ts",
  "!**/node_modules/**/*.tsx",
  "!**/node_modules/**/test/**",
  "!**/node_modules/**/tests/**",
  "!**/node_modules/**/__tests__/**",
  "!**/node_modules/**/docs/**",
  "!**/node_modules/**/examples/**",
  "!**/node_modules/**/.github/**"
]
```

**Size reduction results (v0.1.0):**

| Component | Before | After | Savings |
|-----------|--------|-------|---------|
| app.asar | 265 MB | 165 MB | 100 MB (38%) |
| win-unpacked | 628 MB | 534 MB | 94 MB (15%) |
| Installer | ~140 MB | 129 MB | ~11 MB |

**Further optimization opportunities:**
- Remove unused Monaco language workers (ts.worker alone is 7MB)
- Use `npm prune --production` in `beforeBuild` hook
- Configure Monaco to load only needed language syntaxes

## Assets

**Logo files in `frontend/public/`:**
- `logo.png` - Full color logo (source for icon generation)
- `logo.ico` - Windows icon (generated)
- `logo.icns` - macOS icon (generated)
- `logo-icon.svg` - Monochrome SVG with `currentColor` for dynamic theming (used in ActivityBar)

The `logo-icon.svg` uses `fill="currentColor"` so it inherits text color and can be styled via CSS filters.

## Variable Reference System ({{ }} Syntax)

The workflow editor supports `{{ variable }}` template syntax for data interpolation. This system provides both visual pills and Monaco editor decorations.

### Key Files
- [components/common/VariableReference.tsx](frontend/src/modules/components/common/VariableReference.tsx) - Reusable components
- [lib/monacoVariableDecorations.ts](frontend/src/modules/lib/monacoVariableDecorations.ts) - Monaco editor highlighting

### Usage in Components

**1. Import what you need:**
```typescript
import {
  VariablePill,           // Single pill display
  VariablePreview,        // Renders text with inline pills (read-only)
  VariableInput,          // Input with live preview below
  hasVariables,           // Check if text contains {{ }}
  parseVariables,         // Parse {{ }} and return VariableInfo[]
  getUniqueVariablePaths  // Get unique variable paths from text
} from '../common/VariableReference'
```

**2. Show variable preview below a Monaco editor:**
```tsx
// In your properties component:
const hasVars = hasVariables(data.template || '')

// After the Monaco editor:
{hasVars && (
  <div style={{
    marginTop: '8px',
    padding: '8px 10px',
    background: 'var(--panel-2)',
    borderRadius: '4px',
    fontSize: '11px',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--muted)', marginBottom: '4px' }}>
      <Braces style={{ width: 10, height: 10 }} />
      Variables used:
    </div>
    <VariablePreview text={data.template || ''} size="sm" />
  </div>
)}
```

**3. Display a single variable pill:**
```tsx
<VariablePill
  path="user.name"
  sourceNodeId="prompt-1"
  sourceNodeLabel="Generate Outline"
  size="sm"  // or "md"
  variant="default"  // "success", "warning", "error"
/>
```

### Currently Implemented In
- **TransformerNodeProperties** - Shows variable preview for template mode
- **CodeNodeProperties** - Shows variable preview when code contains `{{ }}`
- **TransformNode** (canvas node) - Shows variable count badge

### Adding to New Node Types
When creating a new node type that supports `{{ }}` syntax:

1. Import `hasVariables` and `VariablePreview` from `../common/VariableReference`
2. Add `const hasVars = hasVariables(data.yourField || '')`
3. Add the variable preview section after your Monaco editor (see pattern above)
4. For the canvas node, optionally show variable count using `getUniqueVariablePaths(content).length`

## Documentation

- [AGENTS.md](AGENTS.md) - **Coding guidelines, style guide, and architecture patterns** (essential reading)
- [docs/editor.md](docs/editor.md) - IntelliSense, snippets, canvas features
- [docs/CHAT-MODES.md](docs/CHAT-MODES.md) - Chat modes configuration and architecture
- [docs/AGENT-INTEGRATION-PLAN.md](docs/AGENT-INTEGRATION-PLAN.md) - Agent mode implementation details
- [frontend/ELECTRON.md](frontend/ELECTRON.md) - Electron build and distribution guide
- [frontend/MONACO-CONFIG.md](frontend/MONACO-CONFIG.md) - Monaco editor configuration

# AGENTS.md

This file provides guidance for agentic coding agents working in the Prompd repository. Prompd is a local-first Electron desktop application for creating and executing AI workflows with `.prmd` (Prompd format) files.

## Project Overview

**Prompd** is a local-first AI prompt editor and workflow orchestrator with the following key characteristics:

- **Architecture**: Local-first execution with optional cloud backend
- **Platform**: Electron desktop app (Windows, macOS, Linux) with web fallback
- **Core Features**:
  - Visual workflow canvas with 25+ node types (React Flow/XYFlow)
  - Monaco code editor with IntelliSense and Prompd syntax support
  - Package-based prompt inheritance and composition
  - Workflow scheduling and deployment
  - Direct LLM API execution (OpenAI, Anthropic, Google, etc.)

### Repository Structure

```
prompd.app/
├── frontend/               # Electron + React application (main entry point)
│   ├── src/
│   │   ├── modules/        # Components, services, editor, workflow
│   │   ├── stores/         # Zustand state management (4 stores)
│   │   └── styles/         # Global CSS styles
│   ├── electron/           # Main process (main.js, preload.js, tray.js)
│   └── public/             # Static assets and icons
├── packages/
│   ├── react/              # @prompd/react - Chat UI component library
│   └── scheduler/          # @prompd/scheduler - Deployment & triggers
├── backend/                # Optional REST API (Express + MongoDB)
│   ├── src/
│   │   ├── routes/         # API route handlers
│   │   ├── models/         # Mongoose schemas
│   │   ├── services/       # Business logic
│   │   └── middleware/     # Auth, rate limiting, validation
├── prompd-service/         # Standalone workflow scheduler service
└── deployment/             # Cloud deployment configurations
```

### Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + TypeScript + Vite |
| State Management | Zustand + Immer middleware |
| Desktop | Electron 40 with IPC bridge |
| Code Editor | Monaco Editor with custom Prompd grammar |
| Workflow Canvas | XYFlow (React Flow) |
| Backend | Node.js 18+ ESM + Express |
| Database | MongoDB (backend), SQLite (scheduler) |
| Authentication | Clerk |

## Build Commands

### Prerequisites
- **Node.js >= 18.0.0** (specified in backend/package.json engines)

### Initial Setup (Monorepo Build Order)

**IMPORTANT**: Packages must be built in this order:

```bash
# 1. Build @prompd/scheduler first (required by prompd-service)
cd packages/scheduler && npm install && npm run build

# 2. Build @prompd/react (required by frontend)
cd ../react && npm install && npm run build

# 3. Install frontend dependencies
cd ../../frontend && npm install

# 4. Backend (optional - for provider updates, analytics)
cd ../backend && npm install
```

### Root-Level Commands

```bash
npm run dev                   # Start frontend Vite dev server (:5173)
npm run dev:backend           # Start backend API server (:3010)
npm run build                 # Build scheduler + react + frontend
npm run build:react           # Build only @prompd/react package
npm run build:scheduler       # Build only @prompd/scheduler package
npm run electron:dev          # Launch Electron app (auto-starts Vite)
npm run electron:build:win    # Windows installer (NSIS + portable)
```

### Frontend Commands

```bash
cd frontend

# Development
npm run dev                    # Vite dev server on :5173
npm run electron:dev           # Electron with hot reload

# Build
npm run build                  # Production build (tsc + vite + licenses)
npm run preview                # Preview production build
npm run clean                  # Remove dist/ and dist-electron/

# Electron Distribution
npm run electron:build         # Build for current platform
npm run electron:build:win     # Windows (NSIS installer + portable)
npm run electron:build:mac     # macOS (DMG + zip)
npm run electron:build:linux   # Linux (AppImage + deb)

# Utilities
npm run generate-icons         # Generate app icons from source
npm run generate-licenses      # Generate third-party licenses JSON

# TypeScript
npx tsc --noEmit               # Type checking without emit
```

### Backend Commands

```bash
cd backend

# Development
npm run dev                    # Development with nodemon on :3010
npm start                      # Production mode

# Testing
npm test                       # Run all Jest tests (requires MongoDB)
npm test -- packages.test.js   # Run specific test file
npm test -- --testNamePattern="should create"  # Run tests matching pattern
```

### Package Development Commands

```bash
# @prompd/react
cd packages/react
npm run dev                    # Watch mode (auto-rebuild)
npm run build                  # Production build (ESM + CJS + types)
npm test                       # Run Vitest tests
npm run lint                   # ESLint
npm run typecheck              # TypeScript checking

# @prompd/scheduler
cd packages/scheduler
npm run build                  # TypeScript compilation
npm run dev                    # Watch mode
npm run typecheck              # TypeScript checking
npm run clean                  # Remove dist/
```

## Code Style Guidelines

### TypeScript/JavaScript
- **Strict TypeScript**: All files use strict mode (`"strict": true` in tsconfig.json)
- **No `any` types**: Always use proper TypeScript interfaces/types
- **ESM modules**: Use ES6 import/export syntax (backend uses `"type": "module"`)
- **Path aliases**: Use `@/*` for frontend imports (configured in tsconfig.json and vite.config.ts)

### Import Organization

```typescript
// 1. React/Node.js core imports
import { useCallback, useEffect } from 'react'
import express from 'express'

// 2. Third-party libraries
import { create } from 'zustand'
import { debounce } from 'lodash-es'

// 3. Local imports (use path aliases)
import { useEditorStore } from '@/stores/editorStore'
import { parsePrompd } from '@/modules/lib/prompdParser'
import type { Tab, Metadata } from '@/stores/types'
```

### Component Patterns
- **Functional components only**: No class components
- **Props interfaces**: Always define interfaces for props
- **Custom hooks**: Extract complex logic into custom hooks
- **Zustand subscriptions**: Use selective subscriptions to prevent re-renders

```typescript
// GOOD - Only re-renders when text changes
const text = useEditorStore(state => state.text)

// BAD - Subscribes to all store changes
const store = useEditorStore()
```

### State Management (Zustand)

Four stores with Immer middleware in `frontend/src/stores/`:

| Store | Purpose | Persisted |
|-------|---------|-----------|
| `editorStore` | Editor state, tabs, file explorer, build output | Yes |
| `uiStore` | UI state, theme, LLM provider/model selection | Yes |
| `wizardStore` | Transient onboarding wizard flow | No |
| `workflowStore` | Workflow canvas, nodes, execution state | Yes |

Shared types are in `stores/types.ts`.

### File Naming Conventions
- **Components**: PascalCase (e.g., `PrompdEditor.tsx`, `StatusBar.tsx`)
- **Services**: camelCase (e.g., `executionRouter.ts`, `configService.ts`)
- **Types**: camelCase with `.types.ts` suffix (e.g., `wizard.types.ts`)
- **Utilities**: camelCase (e.g., `prompdParser.ts`, `monacoVariableDecorations.ts`)

### Error Handling
- **Structured errors**: Use `BuildError` interface for compilation errors
- **Toast notifications**: Use `Toast` interface for user notifications
- **Async/await**: Always handle promise rejections with try/catch
- **Error boundaries**: Use React error boundaries for component errors

### API/Service Patterns
- **Service classes**: Use service objects for complex operations
- **Type definitions**: Export interfaces for all API request/response types
- **Error responses**: Use consistent error format with status codes
- **Environment variables**: Use `.env` files, never hardcode secrets

### Code Formatting
- **No linter config**: This project doesn't use ESLint/Prettier configs
- **Manual formatting**: Follow established patterns in existing code
- **Consistent indentation**: Use 2 spaces for TypeScript/JSX
- **Line length**: Keep lines under 100 characters when practical

## Testing Strategy

### Frontend
- **No test suite currently configured**: The frontend doesn't have a test framework set up
- **Manual testing**: Use `npm run electron:dev` for interactive testing
- **Type checking**: Use `npx tsc --noEmit` for static analysis

### Backend
- **Jest for testing**: Uses Jest with default configuration
- **MongoDB required**: Tests require MongoDB connection
- **Test files**: Use `.test.js` suffix for test files
- **Running tests**:
  ```bash
  cd backend
  npm test                           # Run all tests
  npm test -- packages.test.js       # Run specific file
  npm test -- --testNamePattern="x"  # Filter by pattern
  ```

### @prompd/react Package
- **Vitest**: Uses Vitest for testing
- **Run tests**: `npm test` or `npm run test:watch`

## Security Considerations

### Git Command Whitelist
All git operations go through a whitelisted command system in `frontend/electron/main.js`:

**Allowed**: `status`, `log`, `diff`, `show`, `branch`, `remote`, `fetch`, `add`, `commit`, `push`, `pull`, `checkout`, `merge`, `rebase`, `clone`, `init`, `config`

**Blocked**: `gc`, `reflog`, `filter-branch`, `update-ref`, `daemon`, `http-backend`, `shell`, any command with `--exec` or `--upload-pack`

### Path Traversal Protection
All file system operations reject paths containing `..`, normalize paths before operations, and scope access to workspace directory or user home.

### API Key Resolution (Priority Order)
1. Workspace `.env` file (current working directory)
2. User config (`~/.prompd/config.yaml`)
3. System environment variables

### Security Middleware (Backend)
- **Helmet**: Security headers
- **CORS**: Configured for specific origins
- **Rate limiting**: 1000 requests per 15 minutes per IP
- **Input validation**: Joi validation on all inputs

## Deployment Process

### Electron Desktop App

**Build pipeline:**
```
clean -> generate-icons -> tsc -> vite build -> license generation -> electron-builder -> afterPack
```

**Output:**
- `frontend/dist/` - Web build
- `frontend/dist-electron/` - Desktop installers

**Platform targets:**
- **Windows**: NSIS installer + portable executable
- **macOS**: DMG + ZIP
- **Linux**: AppImage + DEB package

### Backend Deployment

**Google Cloud Run** (configured in `deployment/`):
```bash
cd deployment
gcloud builds submit --config backend.cloudbuild.yaml
```

**Environment variables required:**
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - JWT signing secret
- `PORT` - Server port (default: 3010)

### File Associations (Electron)
The app registers file associations for:
- `.prmd` - Prompd prompt files
- `.pdflow` - Prompd workflow files
- `.pdpkg` - Prompd package archives

## Architecture Notes

### Critical Dependencies

| Package | Purpose | Notes |
|---------|---------|-------|
| `@prompd/cli` | Prompt compiler | Node.js only - uses IPC in Electron |
| `@prompd/react` | Chat UI library | Must build before frontend |
| `@prompd/scheduler` | Deployment service | CommonJS output only |

### Execution Model - Local-First

All core operations execute locally via Electron IPC:

```
User Action -> executionRouter -> localExecutor -> Direct HTTPS to LLM APIs
                               -> localCompiler -> Electron IPC -> @prompd/cli
```

**Runs locally**: LLM API calls, prompt compilation, workflow execution, file operations, Git operations, scheduling (node-cron).

**Uses backend (optional)**: Provider/model list updates, registry package search, usage analytics.

### Electron IPC Bridge

All native operations go through `window.electronAPI`:

| Namespace | Methods | Purpose |
|-----------|---------|---------|
| File system | `readFile`, `writeFile`, `openFolder` | File operations |
| `compiler.*` | `compile`, `validate` | Prompt compilation |
| `workflow.*` | `execute`, `stop`, `onEvent` | Workflow execution |
| `deployment:*` | `deploy`, `undeploy`, `list`, `getStatus` | Deployment management |
| `scheduler:*` | `getSchedules`, `addSchedule`, `executeNow` | Schedule/cron management |

Always check `window.electronAPI?.isElectron` before using IPC methods.

## File Formats

- **`.prmd`** - Prompt files (YAML frontmatter + Markdown)
- **`.pdflow`** - Workflow definitions (YAML with XYFlow nodes/edges)
- **`.pdproj`** - Project files (workspace configuration)
- **`.pdpkg`** - Package bundles (ZIP archives with manifest.json)

**Path resolution**: ALL file references in `.prmd` and `.pdflow` files are **relative to the containing file's directory**, not the workspace root.

## Port Allocation

| Port | Service | Required |
|------|---------|----------|
| 5173 | Frontend Vite dev server | Yes (dev) |
| 3010 | Backend API | Optional |
| 4000 | Local registry (dev) | Optional |

## Known Gotchas

1. **`@prompd/react` not found**: Build `packages/react` first
2. **`@prompd/cli` compilation failing**: It's Node.js only - uses IPC in Electron, excluded from Vite bundling
3. **Import `@/...` resolution errors**: Ensure `vite.config.ts` has the `@` path alias configured
4. **Windows CRLF breaks regex parsing**: Always normalize content: `content.replace(/\r\n/g, '\n')`
5. **node-cron step notation**: Normalize `0/N` to `*/N` and `N/1` to `*` before registering

## Documentation References

- [CLAUDE.md](CLAUDE.md) - Developer guide and architecture overview
- [CLAUDE-ARCHITECTURE.md](CLAUDE-ARCHITECTURE.md) - Deep architectural details (node types, state management)
- [backend/CLAUDE.md](backend/CLAUDE.md) - Backend-specific architecture
- [frontend/ELECTRON.md](frontend/ELECTRON.md) - Electron build and distribution
- [frontend/MONACO-CONFIG.md](frontend/MONACO-CONFIG.md) - Monaco editor configuration
- [docs/editor.md](docs/editor.md) - Editor features and usage

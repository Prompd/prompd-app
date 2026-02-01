# Prompd Desktop

A local-first Electron application for creating and executing AI workflows with visual canvas editing, Monaco code editor, and composable prompt architecture.

## Architecture

**Local-First Execution** - All core operations run locally in Electron:
- Direct LLM API calls (OpenAI, Anthropic, Google, etc.)
- Prompt compilation via `@prompd/cli`
- Workflow execution with 20+ node types
- File operations and Git integration
- Configuration and API key management

**Optional Backend Services** - Used only for:
- Provider/model list updates (cached locally for offline mode)
- Registry package search (prompdhub.ai)
- Cloud project sync and analytics

## Features

- **Visual Workflow Canvas**: Drag-and-drop workflow designer with 20+ node types (React Flow/XYFlow)
- **Monaco Code Editor**: Professional editing with IntelliSense, syntax highlighting, and package completions
- **Local Execution**: Direct HTTPS calls to LLM providers - no proxy, no latency
- **Registry Integration**: Search and install packages from prompdhub.ai
- **Offline Support**: Full functionality without internet (after initial provider list cache)
- **Project System**: `.pdproj` files with workspace organization
- **File Formats**: `.prmd` (prompts), `.pdflow` (workflows), `.pdpkg` (packages)

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Monaco Editor + Zustand
- **Desktop**: Electron with File System Access API and IPC bridge
- **Compilation**: `@prompd/cli@^0.3.3` (npm package)
- **Backend** (optional): Node.js ESM + Express + MongoDB

## Quick Start

```bash
# Frontend development
cd frontend && npm install && npm run dev

# Electron desktop app
cd frontend && npm run electron:dev

# Backend (optional - for provider list updates, analytics)
cd backend && npm install && npm run dev
```

## Documentation

- [CLAUDE.md](CLAUDE.md) - Developer guide and architecture
- [AGENTS.md](AGENTS.md) - Coding guidelines and patterns
- [docs/editor.md](docs/editor.md) - Editor features and usage
- [frontend/ELECTRON.md](frontend/ELECTRON.md) - Build and distribution

## File Formats

- `.prmd` - Prompt files (YAML frontmatter + Markdown)
- `.pdflow` - Workflow definitions (YAML-compatible with React Flow nodes/edges)
- `.pdproj` - Project files (workspace configuration)
- `.pdpkg` - Package bundles (ZIP archives with manifest.json)

## Development

```bash
# Build @prompd/react package (required first)
cd packages/react && npm install && npm run build

# Frontend
cd frontend
npm install
npm run dev              # Vite dev server on :5173
npm run electron:dev     # Electron with hot reload
npm run build            # Production build

# Backend (optional)
cd backend
npm install
npm run dev              # Development with nodemon on :3010
npm test                 # Run tests (requires MongoDB)
```

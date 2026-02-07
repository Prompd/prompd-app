# AGENTS.md

This file provides guidance for agentic coding agents working in this repository.

## Build/Lint/Test Commands

### Frontend (React + TypeScript + Vite)
```bash
cd frontend

# Development
npm run dev                    # Vite dev server on :5173
npm run build                  # TypeScript + Vite build
npm run preview                # Preview production build

# Electron Desktop App
npm run electron:dev           # Electron with hot reload (requires Vite running)
npm run electron:build         # Build Electron app
npm run electron:build:win     # Windows installer
npm run electron:build:mac     # macOS DMG
npm run electron:build:linux   # Linux AppImage

# Utilities
npm run clean                  # Remove dist and dist-electron folders
npm run generate-icons         # Generate app icons from source
npm run generate-licenses      # Generate third-party licenses JSON

# TypeScript Validation
npx tsc --noEmit               # Type checking without emit
```

### Backend (Node.js + Express + MongoDB)
```bash
cd backend

# Development
npm run dev                    # Development with nodemon on :3010
npm start                      # Production mode

# Testing
npm test                       # Run all Jest tests (requires MongoDB)
npm test -- packages.test.js   # Run specific test file
npm test -- --testNamePattern="should create"  # Run tests matching pattern

# Build (no-op for Node.js)
npm run build                  # Echo message - no build step required
```

## Code Style Guidelines

### TypeScript/JavaScript
- **Strict TypeScript**: All files use strict mode (`"strict": true` in tsconfig.json)
- **No `any` types**: Always use proper TypeScript interfaces/types
- **ESM modules**: Use ES6 import/export syntax (backend uses `"type": "module"`)
- **Path aliases**: Use `@/*` for frontend imports (configured in tsconfig.json)

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
// GOOD - Selective subscription
const text = useEditorStore(state => state.text)

// BAD - Subscribes to all store changes
const store = useEditorStore()
```

### State Management (Zustand)
- **Four stores**: `editorStore`, `uiStore`, `wizardStore`, `workflowStore`
- **Immer middleware**: Use for immutable updates
- **Persist middleware**: Use for persistence (except wizardStore)
- **Shared types**: All store types in `stores/types.ts`

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

### Security Guidelines
- **No secrets in code**: Never commit API keys or credentials
- **Input validation**: Validate all user inputs on both client and server
- **Path traversal protection**: Use proper path validation for file operations
- **CORS configuration**: Use configured CORS settings for API routes

### Testing
- **Jest for backend**: Use Jest with default configuration
- **MongoDB required**: Tests require MongoDB connection
- **Test files**: Use `.test.js` suffix for test files
- **No frontend tests**: Frontend doesn't have test configuration currently

### Electron-Specific
- **IPC bridge**: Use `window.electronAPI` for native operations
- **Context detection**: Check `window.electronAPI?.isElectron` before using
- **File System Access API**: Use for file operations in web context
- **Security**: Git commands are whitelisted, paths are validated

### Package Dependencies
- **Local packages**: `@prompd/cli` and `@prompd/react` are linked locally
- **Monaco Editor**: Optimized via Vite config, chunked separately
- **React 18**: Uses concurrent features and hooks
- **Node.js 18+**: Minimum required version for backend

## Architecture Notes

### Execution Router
- **Local-first**: Uses local API keys when available
- **Fallback**: Routes to backend when no local keys
- **Unified interface**: Single API for UI regardless of execution mode

### Tab System
- **Tab types**: `file`, `execution`, `chat`
- **View modes**: `wizard`, `design`, `code`
- **Persistence**: Tabs and workspace state persisted via Zustand

### File Structure
- **Frontend modules**: All UI code in `frontend/src/modules/`
- **Services**: Business logic in `services/` subdirectories
- **Stores**: State management in `stores/` directory
- **Types**: Shared types in respective `types.ts` files

Remember: This is a production codebase. Always validate your work and ensure the application builds and runs correctly before considering tasks complete.
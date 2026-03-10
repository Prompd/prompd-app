# Contributing to Prompd

Thanks for your interest in contributing to Prompd! This guide will help you get set up and productive.

## Getting Started

### Prerequisites

- **Node.js 18+**
- **npm** (comes with Node.js)
- **Git**

### Setup

The project is a monorepo with local packages that must be built in order:

```bash
# 1. Clone the repo
git clone https://github.com/prompd/prompd-app.git
cd prompd-app

# 2. Build @prompd/scheduler (required by frontend)
cd packages/scheduler && npm install && npm run build

# 3. Build @prompd/react (required by frontend)
cd ../react && npm install && npm run build

# 4. Install and run the frontend
cd ../../frontend && npm install
npm run electron:dev    # Desktop app with hot reload

# 5. Backend (optional - only needed for cloud features)
cd ../backend && npm install
cp .env.example .env    # Fill in your values
npm run dev
```

### Environment Variables

Copy the `.env.example` files and fill in your values:

- `backend/.env.example` - Backend API configuration
- `frontend/.env.example` - Frontend/Electron configuration

At minimum, you need one LLM provider API key (Anthropic or OpenAI) to execute prompts locally.

## Development Workflow

### Branch Strategy

- `main` - Stable release branch
- `feature/*` - New features
- `fix/*` - Bug fixes

### Making Changes

1. Create a feature branch from `main`
2. Make your changes following the code style below
3. Verify TypeScript compiles: `cd frontend && npx tsc --noEmit`
4. Test the Electron app: `cd frontend && npm run electron:dev`
5. Open a pull request against `main`

### Code Style

- **TypeScript** - Strict mode, no `any` types
- **2-space indentation** for TypeScript/JSX
- **Functional components** with hooks (no class components)
- **Selective Zustand subscriptions** - always subscribe to specific fields, never the entire store
- Follow existing patterns in the codebase

### Commit Messages

Keep them concise and descriptive. Focus on *why*, not *what*.

```
Add workflow parallel node support
Fix CRLF parsing in .prmd frontmatter on Windows
Update provider model list for Anthropic Claude 4
```

## Project Structure

```
prompd.app/
├── frontend/               # Electron + React app
│   ├── src/modules/        # Components, services, editor
│   ├── src/stores/         # Zustand state management
│   └── electron/           # Main process (main.js, preload.js)
├── packages/
│   ├── react/              # @prompd/react - Chat UI components
│   └── scheduler/          # @prompd/scheduler - Deployment management
├── backend/                # Optional REST API (Express + MongoDB)
└── docs/                   # Documentation
```

For detailed architecture, see [CLAUDE.md](CLAUDE.md).

## Reporting Issues

- Use [GitHub Issues](https://github.com/prompd/prompd-app/issues)
- Include steps to reproduce, expected vs actual behavior
- For security vulnerabilities, email security@prompd.app instead of opening a public issue

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.

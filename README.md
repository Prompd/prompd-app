# prompd/app

A comprehensive Monaco-based web editor for prompd (`.prmd`) and prompdflow (`.pdflow`) files with advanced IntelliSense, visual canvas editing, and registry integration.

## Features
- **Advanced IntelliSense**: Context-aware completions with live registry search
- **Monaco Editor**: Professional code editor with Prompd syntax highlighting (TextMate grammar)
- **Visual Canvas Editor**: Drag-and-drop workflow designer with 15+ node types
- **Registry Integration**: Real-time package search and metadata from prompdhub.ai
- **Code Snippets**: Template expansion system for rapid development
- **File Management**: Project-based organization with drag-and-drop support
- **Offline Support**: Graceful fallback when registry is unavailable

## IntelliSense Capabilities
- **Package Search**: Live suggestions from registry as you type `@` or in `using:` sections
- **Parameter References**: Smart completion for `{{parameter}}` references with validation
- **Context Awareness**: Field suggestions for YAML frontmatter (provider, model, etc.)
- **Hover Information**: Package metadata, versions, and descriptions on hover
- **Code Snippets**: Template expansion with `!snippet-name` syntax

## Documentation

For comprehensive documentation including IntelliSense features, canvas editor usage, and API integration, see:
- **[Editor Documentation](./docs/editor.md)** - Complete feature guide and usage instructions

## Roadmap
- ✅ Advanced IntelliSense with registry integration
- ✅ Visual canvas editor with node palette
- ✅ Code snippets and template expansion
- ✅ Package search and metadata display
- ✅ Run/Compile prompds locally. Running prompds agains almost all major providers and any openai compatable api.
- ✅ Auth + registry integration
- ✅ Parameter sidebar with type-aware editing (now apart of the designer)
- 📋 Package workflow execution in a Docker image and execute them anywhere with a cli


The current UI ships with a stub client in `src/modules/services/api.ts` so wiring to an existing API won’t require UI changes.

## Dev

```bash
cd editor.prompdhub.ai/web
npm install
npm run dev
```

Build:
```bash
npm run build && npm run preview
```

No servers are launched automatically by this repo; use your local Node for dev server only.

### Static assets
- Public assets are served from `editor.prompdhub.ai/public` (configured via Vite `publicDir`).
- Example: place `logo.svg` there and reference it in the UI as `/logo.svg`.

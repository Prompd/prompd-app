# Prompd Web Editor

A comprehensive Monaco-based code editor for .prompd files with advanced IntelliSense, visual canvas editing, and registry integration.

## Features Overview

### Core Editor
- **Monaco Editor Integration**: Professional code editor with syntax highlighting
- **Advanced IntelliSense**: Context-aware completions with live registry search
- **Prompd Language Support**: Custom language definition with TextMate grammar
- **Real-time Validation**: Live error detection and feedback
- **File Management**: Project-based organization with drag-and-drop support

### Visual Canvas Editor
- **Flow-based Editing**: Visual workflow designer with 15+ node types
- **Drag-and-Drop Interface**: Node palette with categorized components
- **Dynamic Node Inspector**: Context-aware property editors for each node type
- **Connection System**: Visual linking between workflow components

### Registry Integration
- **Live Package Search**: Real-time suggestions from prompdhub.ai registry
- **Package Information**: Detailed metadata, versions, and documentation
- **Offline Fallback**: Graceful degradation when registry is unavailable
- **Custom Registry Support**: Configurable registry URLs

## IntelliSense System

### Package Completions

The editor provides intelligent package suggestions through registry integration:

#### Triggers
- Type `@` anywhere in the document
- Work in `using:` sections of YAML frontmatter
- Use package import contexts

#### Features
- **Live Search**: Real-time package search as you type
- **Package Metadata**: Hover over packages to see descriptions, versions, authors
- **Smart Caching**: 5-minute TTL cache for performance
- **Scope Support**: Built-in suggestions for common package scopes

#### Example
```yaml
---
using:
  - @prompd.io/core-patterns  # IntelliSense suggests from registry
  - @acme/custom-components   # Shows package info on hover
---
```

### Context-Aware Suggestions

The IntelliSense engine understands document context and provides relevant completions:

#### YAML Frontmatter
- **Metadata Fields**: `id`, `name`, `description`, `version`
- **Configuration**: `provider`, `model`, `temperature`, `max_tokens`
- **Composition**: `using`, `inherits`, `parameters`

#### Parameter Management
- **Type Suggestions**: `string`, `number`, `boolean`, `object`, `array`, `file`
- **Validation Properties**: `required`, `default`, `enum`, `description`
- **Smart Detection**: Automatically discovers defined parameters

#### Example
```yaml
parameters:
  input:
    type: string     # IntelliSense suggests parameter types
    required: true   # Boolean completion
    description: "User input"
  model:
    type: string
    enum: [gpt-4o, claude-3-sonnet]  # Array completion
```

### Variable References

The editor intelligently tracks and suggests parameter references:

#### Parameter Detection
- Scans YAML frontmatter for defined parameters
- Tracks parameter usage throughout the document
- Validates parameter references

#### Smart Completion
- Type `{` to trigger parameter suggestions
- Shows available parameters with descriptions
- Validates parameter names and types

#### Example
```yaml
parameters:
  user_input:
    type: string
    required: true
    description: "Primary user input"
---

# User
{user_input}  # IntelliSense suggests 'user_input' parameter
```

### Built-in AI Providers and Models

The editor includes comprehensive suggestions for AI configuration:

#### Supported Providers
- `openai` - OpenAI GPT models
- `anthropic` - Claude models
- `azure` - Azure OpenAI Service
- `ollama` - Local model inference
- `custom` - Custom provider configuration

#### Model Suggestions
- **GPT Models**: `gpt-4o`, `gpt-4o-mini`, `gpt-4`, `gpt-3.5-turbo`
- **Claude Models**: `claude-3-5-sonnet-20241022`, `claude-3-opus-20240229`, `claude-3-haiku-20240307`
- **Legacy Models**: `text-davinci-003`, `text-curie-001`

## Code Snippets

The editor includes a comprehensive snippet system for rapid development:

### Template Snippets

#### Basic Template (`!prompd-basic`)
```yaml
---
id: prompt-id
name: Prompt Name
description: Description
version: 1.0.0
parameters:
  input:
    type: string
    required: true
    description: Input parameter
---

# System
You are a helpful assistant.

# User
{input}
```

#### Advanced Template (`!prompd-advanced`)
```yaml
---
id: advanced-prompt
name: Advanced Prompt
description: Advanced prompt with multiple features
version: 1.0.0
using:
  - @prompd.io/core-patterns
provider: openai
model: gpt-4o-mini
temperature: 0.7
max_tokens: 1000
parameters:
  input:
    type: string
    required: true
    description: Primary input
  context:
    type: string
    required: false
    description: Additional context
  format:
    type: string
    enum: [json, text, markdown]
    default: text
---

# System
You are an expert assistant. Use the provided context to give accurate responses.

# Context
{context}

# User
{input}

# Response
Format: {format}
```

### Quick Insertions

- `!using` - Package import structure
- `!param` - Parameter definition
- `!system` - System section header
- `!context` - Context section header
- `!user` - User section header
- `!inherits` - Template inheritance

### Snippet Usage

1. Type `!` followed by the snippet name
2. Press `Tab` or `Enter` to expand
3. Use `Tab` to navigate between placeholders
4. Fill in the template parameters

## Canvas Editor

### Node Palette

The visual editor includes a comprehensive node library organized into categories:

#### Core Nodes
- **LLM Call**: AI model invocations
- **Prompt Template**: Reusable prompt structures
- **Input**: User input collection
- **Output**: Response formatting

#### AI & Processing
- **Text Processing**: String manipulation and analysis
- **JSON Parser**: Structured data handling
- **Image Analysis**: Vision model integration
- **Audio Processing**: Speech and audio analysis

#### Integration
- **API Request**: External service calls
- **Database Query**: Data retrieval operations
- **File Operation**: File system interactions
- **Webhook**: Event-driven integrations

#### Logic & Control
- **Conditional**: Branching logic
- **Loop**: Iteration control
- **Switch**: Multi-path decisions
- **Delay**: Timing control

### Node Inspector

Each node type includes a specialized property editor:

#### Dynamic Forms
- Context-aware field rendering
- Type validation and constraints
- Collapsible sections for organization
- JSON editing for complex structures

#### Field Types
- Text inputs for strings and descriptions
- Number inputs with validation
- Boolean toggles for flags
- Dropdown selects for enumerations
- Code editors for JSON and scripts

### Canvas Operations

#### Node Management
- **Drag and Drop**: Add nodes from palette to canvas
- **Selection**: Click nodes to select and edit properties
- **Moving**: Drag nodes to reposition on canvas
- **Deletion**: Select and delete unwanted nodes

#### Connection System
- **Visual Links**: Connect node outputs to inputs
- **Data Flow**: Visual representation of workflow logic
- **Validation**: Type checking for connections
- **Path Highlighting**: Visual flow indication

## Configuration

### Registry Settings

Configure the registry URL in the editor header:

1. **Default Registry**: `https://registry.prompdhub.ai`
2. **Custom Registry**: Enter your private registry URL
3. **Local Development**: Use `http://localhost:4000` for local testing
4. **Storage**: Configuration is saved to localStorage

### Editor Preferences

The editor supports various customization options:

#### Theme Configuration
- **Light Theme**: Clean, professional appearance
- **Dark Theme**: Optimized for low-light environments
- **Custom Colors**: Synchronized with registry themes

#### Editor Settings
- **Font Size**: Configurable text size (default: 14px)
- **Word Wrap**: Automatic line wrapping
- **Minimap**: Code overview navigation
- **Tab Size**: Indentation settings (default: 2 spaces)

## API Integration

### Registry Client

The editor includes a robust registry API client:

#### Search Operations
```javascript
// Search for packages
const results = await registryApi.searchPackages('prompt-utils', 10)

// Get package information
const packageInfo = await registryApi.getPackageInfo('@prompd.io/core')

// List package versions
const versions = await registryApi.getPackageVersions('my-package')
```

#### Caching System
- **TTL**: 5-minute time-to-live for cached responses
- **Smart Invalidation**: Automatic cache refresh
- **Performance**: Reduced API calls and faster responses
- **Offline Support**: Graceful fallback to cached data

### Error Handling

The editor implements comprehensive error handling:

#### Registry Errors
- **Network Failures**: Graceful degradation to offline mode
- **Invalid Responses**: User-friendly error messages
- **Rate Limiting**: Automatic retry with backoff
- **Authentication**: Clear auth failure indicators

#### Validation Errors
- **Syntax Errors**: Real-time highlighting and messages
- **Type Errors**: Parameter validation and suggestions
- **Reference Errors**: Invalid parameter reference detection
- **Format Errors**: YAML and Markdown structure validation

## Development

### Setup

```bash
cd editor.prompdhub.ai/web
npm install
npm run dev
```

### Build Process

```bash
# Development build
npm run build

# Preview production build
npm run preview

# Type checking
npm run type-check
```

### File Structure

```
editor.prompdhub.ai/web/
├── src/
│   ├── modules/
│   │   ├── components/          # React components
│   │   │   ├── EditorHeader.tsx # Top navigation bar
│   │   │   ├── FileExplorer.tsx # File management
│   │   │   └── PrompdEditor.tsx # Monaco editor wrapper
│   │   ├── canvas/             # Visual editor components
│   │   │   ├── CanvasView.tsx  # Main canvas interface
│   │   │   ├── NodePalette.tsx # Node library sidebar
│   │   │   └── NodeInspector.tsx # Property editor
│   │   ├── lib/                # Core libraries
│   │   │   ├── intellisense.ts # IntelliSense engine
│   │   │   ├── snippets.ts     # Code snippets
│   │   │   └── textmate.ts     # Language support
│   │   └── services/           # API clients
│   │       └── registryApi.ts  # Registry integration
│   ├── App.tsx                 # Main application
│   └── main.tsx               # Entry point
└── public/                    # Static assets
```

## Troubleshooting

### Common Issues

#### IntelliSense Not Working
1. **Check Registry URL**: Ensure valid registry configuration
2. **Network Connection**: Verify internet connectivity
3. **CORS Issues**: Registry must support cross-origin requests
4. **Cache Issues**: Clear browser cache or use Ctrl+F5

#### Package Search Failures
1. **Registry Status**: Check if registry is accessible
2. **Authentication**: Verify API token if required
3. **Rate Limits**: Wait if hitting rate limits
4. **Fallback Mode**: Editor should work offline with cached data

#### Canvas Issues
1. **Browser Compatibility**: Ensure modern browser with HTML5 Canvas support
2. **Performance**: Large workflows may impact performance
3. **Memory Usage**: Close unused tabs to free memory
4. **Zoom Issues**: Use browser zoom controls carefully

### Performance Optimization

#### Large Documents
- **Incremental Parsing**: Large files are processed in chunks
- **Lazy Loading**: Components load on demand
- **Debounced Updates**: Input changes are batched for performance

#### Registry Performance
- **Caching Strategy**: Aggressive caching with smart invalidation
- **Request Batching**: Multiple requests are combined when possible
- **Background Updates**: Cache refreshes happen in background

## Advanced Features

### Custom Language Extensions

The editor supports extensible language features:

#### Grammar Extensions
- **TextMate Grammar**: Full syntax highlighting support
- **Monarch Tokenizer**: Fallback tokenization system
- **Custom Themes**: Editor theme customization

#### IntelliSense Extensions
- **Provider API**: Pluggable completion providers
- **Hover Information**: Custom hover content providers
- **Signature Help**: Parameter hint extensions

### Integration APIs

#### External Tool Integration
- **CLI Integration**: Direct CLI command execution
- **Version Control**: Git integration support
- **Build Systems**: Automated compilation workflows

#### Extension Points
- **Custom Nodes**: Add new canvas node types
- **Registry Providers**: Support additional registries
- **Export Formats**: Custom compilation targets

This documentation covers the comprehensive IntelliSense and editing capabilities of the Prompd Web Editor. The system provides professional-grade development tools for creating and managing .prompd files with full registry integration and visual workflow support.
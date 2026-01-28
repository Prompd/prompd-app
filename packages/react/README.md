# @prompd/react

React component library for building Prompd-powered AI interfaces with intelligent intent classification and pluggable architecture.

**Version 0.2.0** - Now with intelligent routing that automatically detects user intent!

## What's New in 0.2.0

🆕 **Intelligent Intent Classification** - The new `usePrompdIntelligentChat` hook automatically detects what users are trying to do:
- 🔍 Package search - "Find me a code reviewer"
- 📁 File assistance - "Help me understand this file"
- 💡 Code explanation - "What does this function do?"
- ⚡ Code generation - "Write a function to..."
- 🐛 Debugging - "Why am I getting this error?"
- ❓ General questions - "How do I deploy to AWS?"

## Installation

```bash
npm install @prompd/react
# or
yarn add @prompd/react
# or
pnpm add @prompd/react
```

## Quick Start

```tsx
import { PrompdProvider, PrompdChat } from '@prompd/react'
import '@prompd/react/styles.css'

function App() {
  return (
    <PrompdProvider apiBaseUrl="http://localhost:4050">
      <PrompdChat />
    </PrompdProvider>
  )
}
```

## Core Concepts

### Pluggable Architecture

@prompd/react is built with extensibility in mind. Two key interfaces enable complete customization:

#### 1. IPrompdLLMClient - Custom LLM Integration

Implement this interface to use custom LLM providers (local models, custom APIs, etc.):

```typescript
import { IPrompdLLMClient, PrompdLLMRequest, PrompdLLMResponse } from '@prompd/react'

class MyCustomLLMClient implements IPrompdLLMClient {
  async send(request: PrompdLLMRequest): Promise<PrompdLLMResponse> {
    // Your custom implementation
    const response = await fetch('https://my-api.com/chat', {
      method: 'POST',
      body: JSON.stringify(request)
    })

    return await response.json()
  }
}

// Use it
<PrompdProvider defaultLLMClient={new MyCustomLLMClient()}>
  <PrompdChat />
</PrompdProvider>
```

#### 2. IPrompdResultDisplay - Custom Result Rendering

Implement this interface to control how execution results are displayed:

```typescript
import { IPrompdResultDisplay, PrompdExecutionResult } from '@prompd/react'

class CodeEditorResultDisplay implements IPrompdResultDisplay {
  show(result: PrompdExecutionResult): void {
    // Open in VS Code-like editor
    openInCodeEditor(result)
  }
}

// Use it
<PrompdProvider defaultResultDisplay={new CodeEditorResultDisplay()}>
  <PrompdChat />
</PrompdProvider>
```

## Components

### PrompdProvider

Root provider component that sets up context for all Prompd components.

```tsx
<PrompdProvider
  apiBaseUrl="http://localhost:4050"
  defaultLLMClient={myLLMClient}
  defaultResultDisplay={myResultDisplay}
  theme="dark" // or "light" or "auto"
>
  {children}
</PrompdProvider>
```

**Props:**
- `apiBaseUrl` (optional): Backend API URL (default: `http://localhost:4050`)
- `defaultLLMClient` (optional): Custom LLM client instance
- `defaultResultDisplay` (optional): Custom result display instance
- `theme` (optional): Color scheme (`'light' | 'dark' | 'auto'`)

### PrompdChat

Complete chat interface with AI orchestration.

```tsx
<PrompdChat
  sessionId="my-session-123"
  llmClient={customClient}
  resultDisplay={customDisplay}
  onMessage={(message) => console.log(message)}
  onExecute={(result) => console.log(result)}
/>
```

**Props:**
- `sessionId` (optional): Session identifier for persistence
- `llmClient` (optional): Override default LLM client
- `resultDisplay` (optional): Override default result display
- `onMessage` (optional): Callback for each message
- `onExecute` (optional): Callback for each execution
- `className` (optional): Additional CSS classes

### PrompdContextArea

File upload area with sectioned organization (context/user/system).

```tsx
const sections = [
  {
    name: 'context',
    label: 'Context Files',
    files: [],
    allowMultiple: true,
    description: 'Background information and documentation'
  },
  {
    name: 'user',
    label: 'Files to Process',
    files: [],
    allowMultiple: true,
    description: 'Primary files for the task'
  },
  {
    name: 'system',
    label: 'System Overrides',
    files: [],
    allowMultiple: false,
    description: 'Configuration and system prompts'
  }
]

<PrompdContextArea
  sections={sections}
  value={fileSections}
  onChange={setFileSections}
  onFileUpload={handleUpload}
/>
```

### PrompdPackageSelector

AI-powered package recommendation and selection UI.

```tsx
<PrompdPackageSelector
  recommendations={packages}
  selectedPackage={selected}
  onSelect={setSelected}
  onSearch={searchPackages}
/>
```

### PrompdResultModal

Tabbed modal for viewing execution results, compiled prompts, and metadata.

```tsx
<PrompdResultModal
  result={executionResult}
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  onRerun={(params) => executeAgain(params)}
/>
```

### PrompdChatInput

Multi-line auto-expanding input with keyboard shortcuts.

```tsx
<PrompdChatInput
  value={input}
  onChange={setInput}
  onSubmit={handleSubmit}
  isLoading={isLoading}
  placeholder="Ask me anything..."
  maxLines={10}
/>
```

### PrompdMessages

Message list display with metadata badges and expand buttons.

```tsx
<PrompdMessages
  messages={messages}
  onExpandResult={(id) => viewResult(id)}
/>
```

### PrompdProviderSelector

🆕 **Provider and model selection component** with multiple layout options.

```tsx
import { PrompdProviderSelector, defaultProviders } from '@prompd/react'

function ModelSelector() {
  const [provider, setProvider] = useState('openai')
  const [model, setModel] = useState('gpt-4o')

  return (
    <PrompdProviderSelector
      providers={defaultProviders}
      selectedProvider={provider}
      selectedModel={model}
      onProviderChange={setProvider}
      onModelChange={setModel}
      layout="vertical"
    />
  )
}
```

**Props:**
- `providers` (required): Array of provider configurations
- `selectedProvider` (optional): Currently selected provider ID
- `selectedModel` (optional): Currently selected model
- `onProviderChange` (required): Callback when provider changes
- `onModelChange` (required): Callback when model changes
- `layout` (optional): Display layout (`'vertical' | 'horizontal' | 'table'`)
- `className` (optional): Additional CSS classes

**Layout Options:**

1. **Vertical (default)** - Single dropdown button with provider name and model stacked vertically:
```tsx
<PrompdProviderSelector
  providers={providers}
  selectedProvider={provider}
  selectedModel={model}
  onProviderChange={setProvider}
  onModelChange={setModel}
  layout="vertical"
/>
```

2. **Horizontal** - Single button showing provider and model side-by-side:
```tsx
<PrompdProviderSelector
  providers={providers}
  selectedProvider={provider}
  selectedModel={model}
  onProviderChange={setProvider}
  onModelChange={setModel}
  layout="horizontal"
/>
```

3. **Table** - Grid layout showing all providers and their models in a table:
```tsx
<PrompdProviderSelector
  providers={providers}
  selectedProvider={provider}
  selectedModel={model}
  onProviderChange={setProvider}
  onModelChange={setModel}
  layout="table"
/>
```

**Default Providers:**

The library includes a `defaultProviders` configuration with popular LLM providers:

```typescript
import { defaultProviders, LLMProviderOption } from '@prompd/react'

// Included providers:
// - OpenAI (gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo)
// - Anthropic (claude-3-5-sonnet, claude-3-opus, claude-3-sonnet, claude-3-haiku)
// - Ollama (llama3.2, qwen2.5, mistral, codellama)
// - Groq (llama-3.1-8b-instant, mixtral-8x7b-32768, gemma-7b-it)
```

**Custom Providers:**

```tsx
const customProviders: LLMProviderOption[] = [
  {
    id: 'my-provider',
    name: 'My Custom Provider',
    icon: '🚀',
    models: ['model-1', 'model-2'],
    enabled: true
  }
]

<PrompdProviderSelector
  providers={customProviders}
  selectedProvider={provider}
  selectedModel={model}
  onProviderChange={setProvider}
  onModelChange={setModel}
/>
```

**CSS Classes:**

The component uses the following CSS classes for styling and customization:

```css
/* Root Container */
.prompd-provider-selector          /* Main wrapper */

/* Table Layout */
.prompd-provider-selector .rounded-lg          /* Rounded container */
.prompd-provider-selector .grid.grid-cols-2    /* Two-column grid */
.prompd-provider-selector .text-xs             /* Small text (headers) */
.prompd-provider-selector .font-semibold       /* Bold headers */
.prompd-provider-selector .text-sm             /* Regular text size */
.prompd-provider-selector .transition-colors   /* Smooth color transitions */

/* Vertical/Horizontal Layouts */
.prompd-provider-selector button               /* All buttons */
.prompd-provider-selector .flex                /* Flex containers */
.prompd-provider-selector .items-center        /* Vertical centering */
.prompd-provider-selector .gap-2               /* Spacing between elements */
.prompd-provider-selector .px-3.py-2           /* Trigger button padding */
.prompd-provider-selector .rounded-lg          /* Rounded trigger button */

/* Dropdown Menu */
.prompd-provider-selector .absolute            /* Positioned dropdown */
.prompd-provider-selector .z-50                /* High z-index */
.prompd-provider-selector .min-w-[280px]       /* Minimum width */
.prompd-provider-selector .shadow-xl           /* Large shadow */

/* Selected State */
.prompd-provider-selector .bg-blue-500\/10     /* Selected background (10% blue) */

/* Disabled State */
.prompd-provider-selector .opacity-50          /* Reduced opacity */
.prompd-provider-selector .cursor-not-allowed  /* Disabled cursor */

/* Icons */
.prompd-provider-selector .w-4.h-4             /* Standard icon size */
.prompd-provider-selector .text-lg             /* Provider icon size */
.prompd-provider-selector .rotate-180          /* Dropdown arrow rotation */

/* Backdrop */
.prompd-provider-selector + .fixed.inset-0     /* Click-outside overlay */
```

**CSS Custom Properties (Theme Variables):**

```css
:root {
  --prompd-panel: #ffffff;           /* Background color (light mode) */
  --prompd-border: #e5e7eb;          /* Border color */
  --prompd-text: #111827;            /* Primary text color */
  --prompd-muted: #6b7280;           /* Muted text (headers, labels) */
  --prompd-accent: #3b82f6;          /* Accent color (selected items) */
  --prompd-accent-bg: #dbeafe;       /* Accent background */
}

.dark {
  --prompd-panel: #1f2937;           /* Background color (dark mode) */
  --prompd-border: #374151;          /* Border color */
  --prompd-text: #f9fafb;            /* Primary text color */
  --prompd-muted: #9ca3af;           /* Muted text */
  --prompd-accent: #60a5fa;          /* Accent color */
  --prompd-accent-bg: #1e3a8a;       /* Accent background */
}
```

**Custom Styling:**

Override the component's appearance using the `className` prop and CSS variables:

```tsx
<PrompdProviderSelector
  providers={defaultProviders}
  selectedProvider={provider}
  selectedModel={model}
  onProviderChange={setProvider}
  onModelChange={setModel}
  className="custom-provider-selector"
  layout="vertical"
/>
```

```css
/* Custom theme colors */
.custom-provider-selector {
  --prompd-accent: #8b5cf6;         /* Purple accent */
  --prompd-panel: #fafafa;           /* Light gray background */
}

/* Custom font */
.custom-provider-selector button {
  font-family: 'Inter', sans-serif;
}

/* Custom selected state */
.custom-provider-selector .bg-blue-500\/10 {
  background: rgba(139, 92, 246, 0.15) !important; /* Purple selected state */
}
```

## Hooks

### usePrompdIntelligentChat (New in 0.2.0)

🆕 **Intelligent chat with automatic intent detection** - Routes requests to the right handler automatically.

```tsx
import { usePrompdIntelligentChat } from '@prompd/react'

function IntelligentChat() {
  const {
    messages,
    isLoading,
    sendMessage,
    currentIntent
  } = usePrompdIntelligentChat(undefined, {
    apiBaseUrl: 'http://localhost:4050/api',
    onIntentDetected: (intent, confidence) => {
      console.log(`Intent: ${intent} (${confidence * 100}% confident)`)
    }
  })

  return (
    <div>
      {/* Show current intent */}
      {currentIntent && <div>Mode: {currentIntent}</div>}

      {/* Messages with intent metadata */}
      {messages.map(msg => (
        <div key={msg.id}>
          {msg.content}
          {msg.metadata?.intent && (
            <span className="badge">{msg.metadata.intent}</span>
          )}
        </div>
      ))}

      {/* Send message (with optional files) */}
      <button onClick={() => sendMessage('Help me understand this file', [
        { path: 'main.ts', content: fileContents }
      ])}>
        Analyze File
      </button>
    </div>
  )
}
```

**Supported Intent Types:**
- `package_search` - Finding packages
- `file_assistance` - File analysis and understanding
- `code_explanation` - Explaining code snippets
- `code_generation` - Writing new code
- `debugging` - Error fixing
- `general_question` - Programming Q&A
- `custom_prompt` - Creating .prmd files
- `workflow_creation` - Building workflows

### usePrompdChat

Complete chat functionality with message management.

```tsx
const {
  messages,
  sessionId,
  isLoading,
  sendMessage,
  clearMessages
} = usePrompdChat('optional-session-id')

// Send a message
await sendMessage('Analyze my code for security issues')
```

### usePrompdOrchestration

AI orchestration for package recommendations, role extraction, and parameter extraction.

```tsx
const {
  state,
  recommendPackages,
  selectPackage,
  extractRole,
  extractParameters,
  updateFileSections,
  executePrompt,
  reset
} = usePrompdOrchestration()

// Get package recommendations
await recommendPackages('I want to analyze code for security')

// Select a package
selectPackage(state.recommendedPackages[0].package)

// Extract role from user message
await extractRole('As a security expert, review this code')

// Extract parameters
await extractParameters(userMessage, selectedPackage)

// Execute the prompt
const result = await executePrompt()
```

### usePrompdSession

Session management with persistence.

```tsx
const {
  session,
  isLoading,
  saveSession,
  loadSession,
  updateContext
} = usePrompdSession('session-123')

// Load existing session
await loadSession('session-456')

// Update session context
updateContext({
  pinnedPackages: [pkg1, pkg2],
  context: new Map([['context', ['file1.ts']]])
})

// Save session
await saveSession()
```

### usePrompdPackage

Package search and retrieval.

```tsx
const {
  packages,
  isLoading,
  search,
  getPackage
} = usePrompdPackage()

// Search for packages
const results = await search('code reviewer')

// Get specific package
const pkg = await getPackage('@prompd.io/code-reviewer', '1.0.0')
```

### Context Hooks

```tsx
// Access Prompd context
const { apiBaseUrl, llmClient, resultDisplay, theme, setTheme } = usePrompd()

// Access LLM client
const llmClient = usePrompdLLMClient()

// Access result display
const resultDisplay = usePrompdResultDisplay()

// Theme control
const { theme, setTheme, toggleTheme } = usePrompdTheme()
```

## TypeScript

Full TypeScript support with comprehensive type definitions.

```typescript
import type {
  // Core interfaces
  IPrompdLLMClient,
  IPrompdResultDisplay,

  // LLM types
  LLMProvider,
  LLMMessage,
  LLMUsage,
  PrompdLLMRequest,
  PrompdLLMResponse,

  // Package types
  PrompdParameter,
  PrompdPackageMetadata,
  PrompdPackageRecommendation,

  // File section types
  PrompdFileSection,
  PrompdFileSections,

  // Execution types
  PrompdExecutionRequest,
  PrompdCompiledPrompt,
  PrompdExecutionResult,

  // Chat types
  PrompdChatMessage,
  PrompdSession,

  // Orchestration types
  PrompdRoleExtractionResult,
  PrompdParameterExtractionResult,
  PrompdOrchestrationState,

  // Component props
  PrompdProviderProps,
  PrompdChatProps,
  PrompdContextAreaProps,
  PrompdPackageSelectorProps,
  PrompdResultModalProps,
  PrompdChatInputProps,
  PrompdProviderSelectorProps,
  LLMProviderOption,

  // Hook return types
  UsePrompdChatReturn,
  UsePrompdOrchestrationReturn,
  UsePrompdSessionReturn,
  UsePrompdPackageReturn
} from '@prompd/react'
```

## Styling

The library uses Tailwind CSS. Import the styles in your app:

```tsx
import '@prompd/react/styles.css'
```

### Dark Mode

Dark mode is automatically applied based on the `theme` prop in `PrompdProvider` or by using the `usePrompdTheme` hook:

```tsx
const { theme, toggleTheme } = usePrompdTheme()

<button onClick={toggleTheme}>
  Current theme: {theme}
</button>
```

## Examples

### Basic Chat Interface

```tsx
import { PrompdProvider, PrompdChat } from '@prompd/react'
import '@prompd/react/styles.css'

function App() {
  return (
    <PrompdProvider apiBaseUrl="http://localhost:4050">
      <div className="h-screen">
        <PrompdChat onMessage={(msg) => console.log('Message:', msg)} />
      </div>
    </PrompdProvider>
  )
}
```

### Complete Orchestration Workflow

```tsx
import {
  PrompdProvider,
  PrompdPackageSelector,
  PrompdContextArea,
  usePrompdOrchestration
} from '@prompd/react'

function OrchestrationDemo() {
  const {
    state,
    recommendPackages,
    selectPackage,
    updateFileSections,
    executePrompt
  } = usePrompdOrchestration()

  const handleSearch = async (query: string) => {
    await recommendPackages(query)
  }

  const handleExecute = async () => {
    const result = await executePrompt()
    console.log('Result:', result)
  }

  return (
    <div>
      <PrompdPackageSelector
        recommendations={state.recommendedPackages}
        selectedPackage={state.selectedPackage}
        onSelect={selectPackage}
        onSearch={handleSearch}
      />

      <PrompdContextArea
        sections={fileSections}
        value={state.fileSections}
        onChange={updateFileSections}
      />

      <button onClick={handleExecute} disabled={!state.selectedPackage}>
        Execute
      </button>
    </div>
  )
}
```

### Custom LLM Client for Ollama

```tsx
import { IPrompdLLMClient, PrompdLLMRequest, PrompdLLMResponse } from '@prompd/react'

class OllamaLLMClient implements IPrompdLLMClient {
  private baseUrl = 'http://localhost:11434'

  async send(request: PrompdLLMRequest): Promise<PrompdLLMResponse> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model || 'llama3.2',
        messages: request.messages,
        stream: false
      })
    })

    const data = await response.json()

    return {
      content: data.message.content,
      provider: 'custom',
      model: data.model,
      usage: {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
      }
    }
  }
}

// Use it
<PrompdProvider defaultLLMClient={new OllamaLLMClient()}>
  <PrompdChat />
</PrompdProvider>
```

## License

MIT

## Contributing

Contributions are welcome! This library is part of the Prompd ecosystem.

## Links

- [Prompd Documentation](https://docs.prompd.io)
- [GitHub Repository](https://github.com/prompd/prmd.ai)
- [Package Registry](https://registry.prompdhub.ai)

# Monaco Editor Global Configuration

## Overview

Global Monaco editor settings have been centralized in [`src/modules/lib/monacoConfig.ts`](src/modules/lib/monacoConfig.ts) to provide consistent behavior across all Monaco editor instances in the application.

## Features

### Language Support
- **YAML** syntax highlighting and IntelliSense
- **Markdown** syntax highlighting and formatting
- Extensible for additional languages

### Configuration Presets

#### `defaultEditorOptions`
Base configuration used by all editors:
- Font size: 13px
- Line numbers enabled
- Word wrap enabled
- Automatic layout (responsive sizing)
- Minimap disabled by default
- IntelliSense and suggestions enabled
- Bracket pair colorization
- Smooth scrolling

#### `yamlEditorOptions`
YAML-specific settings:
- Inherits from `defaultEditorOptions`
- Tab size: 2 spaces
- Indent detection disabled
- Language: `yaml`

#### `markdownEditorOptions`
Markdown-specific settings:
- Inherits from `defaultEditorOptions`
- Word wrap enabled
- Wrapping indent preserved
- Language: `markdown`

#### `readOnlyEditorOptions`
For read-only editors:
- Inherits from `defaultEditorOptions`
- Read-only mode enabled
- Line highlighting disabled
- Thin cursor style

#### `maximizedEditorOptions`
For maximized/fullscreen editors:
- Inherits from `defaultEditorOptions`
- Minimap enabled for better navigation

## Usage

### Initialization

Monaco is initialized once at application startup in [`App.tsx`](src/modules/App.tsx):

```typescript
import { initializeMonaco } from './lib/monacoConfig'

useEffect(() => {
  initializeMonaco()
  console.log('Monaco editor initialized with YAML and Markdown support')
}, [])
```

### Using in Components

#### Example: Markdown Editor with Auto-Sizing

```typescript
import Editor from '@monaco-editor/react'
import { markdownEditorOptions, getMonacoTheme } from '../lib/monacoConfig'

<Editor
  value={content}
  onChange={handleChange}
  language="markdown"
  theme={getMonacoTheme(document.documentElement.classList.contains('dark'))}
  options={markdownEditorOptions}
/>
```

#### Example: YAML Editor (Read-Only)

```typescript
import Editor from '@monaco-editor/react'
import { yamlEditorOptions, readOnlyEditorOptions, getMonacoTheme } from '../lib/monacoConfig'

<Editor
  value={yamlContent}
  language="yaml"
  theme={getMonacoTheme(theme === 'vs-dark')}
  options={{
    ...yamlEditorOptions,
    ...readOnlyEditorOptions
  }}
/>
```

#### Example: Maximized Editor with Minimap

```typescript
import Editor from '@monaco-editor/react'
import { markdownEditorOptions, getMonacoTheme } from '../lib/monacoConfig'

<Editor
  value={content}
  onChange={handleChange}
  language="markdown"
  theme={getMonacoTheme(isDark)}
  options={
    isMaximized
      ? { ...markdownEditorOptions, minimap: { enabled: true } }
      : markdownEditorOptions
  }
/>
```

### Custom Options

Use `mergeEditorOptions()` to extend defaults with custom settings:

```typescript
import { mergeEditorOptions } from '../lib/monacoConfig'

const customOptions = mergeEditorOptions({
  fontSize: 16,
  lineHeight: 24,
  // Custom overrides
})
```

## Implementation Details

### Files Using Global Config

1. **[DesignView.tsx](src/modules/editor/DesignView.tsx)**
   - Section editors use `markdownEditorOptions`
   - Maximized sections enable minimap
   - Theme switches via `getMonacoTheme()`

2. **[PrompdExecutionTab.tsx](src/modules/editor/PrompdExecutionTab.tsx)**
   - Pinned Prompd section uses `yamlEditorOptions` + `readOnlyEditorOptions`
   - Read-only YAML preview of compiled prompts

3. **[PrompdEditor.tsx](src/modules/editor/PrompdEditor.tsx)**
   - **Note:** Uses custom theme and IntelliSense setup
   - Not using global config (intentional - specialized for .prompd files)

### Theme Integration

The `getMonacoTheme()` helper returns the appropriate Monaco theme based on app theme:

```typescript
getMonacoTheme(isDark: boolean): 'vs-dark' | 'light'
```

## Benefits

1. **Consistency** - All editors have the same base behavior
2. **Maintainability** - Single source of truth for editor settings
3. **Extensibility** - Easy to add new language-specific presets
4. **Performance** - Language support registered once at startup
5. **Type Safety** - TypeScript ensures correct option usage

## Future Enhancements

- Add JSON schema support for parameter validation
- Custom color themes (prompd-dark, prompd-light)
- Context-aware IntelliSense (parameter suggestions)
- Collaborative editing support
- Custom language for `.prompd` format (already done in PrompdEditor)

## Related Files

- [`src/modules/lib/monacoConfig.ts`](src/modules/lib/monacoConfig.ts) - Global configuration
- [`src/modules/App.tsx`](src/modules/App.tsx) - Initialization
- [`vite.config.ts`](../vite.config.ts) - Monaco dependencies optimization

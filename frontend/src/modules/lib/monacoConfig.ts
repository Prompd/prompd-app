import * as monaco from 'monaco-editor'

/**
 * Global Monaco Editor Configuration
 * Centralized settings for consistent editor behavior across the application
 */

// Track if themes have been registered to avoid duplicate registration
let themesRegistered = false

// Register language support
export function registerLanguages() {
  // YAML language support
  monaco.languages.register({ id: 'yaml' })

  // Markdown language support
  monaco.languages.register({ id: 'markdown' })

  // Additional language configurations can be added here
}

/**
 * Register Prompd custom themes (dark and light)
 * Call this before mounting any Monaco editor that uses prompd themes
 * Safe to call multiple times - only registers once
 */
export function registerPrompdThemes(monacoInstance: typeof monaco) {
  if (themesRegistered) return

  // Enhanced dark theme with semantic colors for Prompd
  monacoInstance.editor.defineTheme('prompd-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      // YAML frontmatter
      { token: 'keyword.yaml', foreground: '#82aaff', fontStyle: 'bold' },
      { token: 'keyword', foreground: '#82aaff', fontStyle: 'bold' },
      { token: 'key.yaml', foreground: '#82aaff', fontStyle: 'bold' },
      { token: 'entity.name.tag.yaml', foreground: '#82aaff', fontStyle: 'bold' },

      // Punctuation
      { token: 'punctuation.separator.key-value.yaml', foreground: '#89ddff' },
      { token: 'punctuation.definition.list.yaml', foreground: '#89ddff' },
      { token: 'punctuation.bracket.yaml', foreground: '#89ddff' },
      { token: 'punctuation.separator.yaml', foreground: '#89ddff' },
      { token: 'punctuation.definition.frontmatter', foreground: '#89ddff', fontStyle: 'bold' },

      // Strings (YAML)
      { token: 'string.quoted.double.yaml', foreground: '#c3e88d' },
      { token: 'string.quoted.single.yaml', foreground: '#c3e88d' },
      { token: 'string.unquoted.yaml', foreground: '#c3e88d' },
      { token: 'string.yaml', foreground: '#c3e88d' },
      { token: 'string.quoted.double', foreground: '#c3e88d' },
      { token: 'string.quoted.single', foreground: '#c3e88d' },

      // Numbers and constants (YAML)
      { token: 'constant.numeric.yaml', foreground: '#f78c6c' },
      { token: 'constant.numeric.integer.yaml', foreground: '#f78c6c' },
      { token: 'constant.numeric.float.yaml', foreground: '#f78c6c' },
      { token: 'constant.numeric.version.yaml', foreground: '#f78c6c' },
      { token: 'constant.language.boolean.yaml', foreground: '#f78c6c' },
      { token: 'constant.language.null.yaml', foreground: '#f78c6c' },
      { token: 'constant.character.escape.yaml', foreground: '#f78c6c' },
      { token: 'number.float.yaml', foreground: '#f78c6c' },
      { token: 'number.yaml', foreground: '#f78c6c' },

      // Comments
      { token: 'comment.yaml', foreground: '#546e7a', fontStyle: 'italic' },
      { token: 'comment', foreground: '#546e7a', fontStyle: 'italic' },

      // Generic delimiters
      { token: 'delimiter', foreground: '#89ddff' },
      { token: 'operator', foreground: '#89ddff' },

      // Section headers
      { token: 'type.identifier', foreground: '#ffcb6b', fontStyle: 'bold' },
      { token: 'type', foreground: '#ffcb6b', fontStyle: 'bold' },
      { token: 'entity.name.section.prompd', foreground: '#ffcb6b', fontStyle: 'bold' },
      { token: 'entity.name.heading.prompd', foreground: '#82aaff', fontStyle: 'bold' },
      { token: 'punctuation.definition.heading.prompd', foreground: '#546e7a' },
      { token: 'punctuation.definition.heading.markdown', foreground: '#546e7a' },
      { token: 'markup.heading.markdown', foreground: '#82aaff', fontStyle: 'bold' },

      // Package references
      { token: 'variable.other.package', foreground: '#c792ea', fontStyle: 'italic' },
      { token: 'support.class.package', foreground: '#c792ea', fontStyle: 'italic' },

      // Parameter references
      { token: 'variable.parameter', foreground: '#ff9800', fontStyle: 'bold' },
      { token: 'variable.handlebars', foreground: '#ff9800', fontStyle: 'bold' },
      { token: 'variable', foreground: '#ff9800' },
      { token: 'variable.name.prompd', foreground: '#ff9800' },
      { token: 'variable.other.template.prompd', foreground: '#ff9800' },
      { token: 'variable.other.simple.prompd', foreground: '#ff9800' },

      // Markdown formatting
      { token: 'strong', foreground: '#ffffff', fontStyle: 'bold' },
      { token: 'markup.bold.prompd', foreground: '#ffffff', fontStyle: 'bold' },
      { token: 'markup.bold.markdown', foreground: '#ffffff', fontStyle: 'bold' },
      { token: 'emphasis', foreground: '#82aaff', fontStyle: 'italic' },
      { token: 'markup.italic.prompd', foreground: '#82aaff', fontStyle: 'italic' },
      { token: 'markup.italic.markdown', foreground: '#82aaff', fontStyle: 'italic' },
      { token: 'markup.strikethrough.markdown', foreground: '#546e7a', fontStyle: 'strikethrough' },

      // Code blocks
      { token: 'string.quoted', foreground: '#c3e88d' },
      { token: 'string', foreground: '#c3e88d' },
      { token: 'markup.inline.raw.prompd', foreground: '#c3e88d' },
      { token: 'markup.inline.raw.markdown', foreground: '#c3e88d' },
      { token: 'markup.fenced_code.block.prompd', foreground: '#e0e0e0' },
      { token: 'markup.raw.block.markdown', foreground: '#e0e0e0' },
      { token: 'punctuation.definition.code.fenced', foreground: '#546e7a' },
      { token: 'fenced_code.block.language.prompd', foreground: '#82aaff', fontStyle: 'italic' },

      // Lists
      { token: 'markup.list.unnumbered.prompd', foreground: '#89ddff' },
      { token: 'markup.list.numbered.prompd', foreground: '#89ddff' },
      { token: 'punctuation.definition.list_item.prompd', foreground: '#89ddff', fontStyle: 'bold' },
      { token: 'punctuation.definition.list.markdown', foreground: '#89ddff' },

      // Links
      { token: 'string.link', foreground: '#82aaff', fontStyle: 'underline' },
      { token: 'string.reference', foreground: '#c792ea' },
      { token: 'markup.underline.link.markdown', foreground: '#82aaff', fontStyle: 'underline' },
      { token: 'markup.underline.link.image.markdown', foreground: '#82aaff' },

      // Blockquotes and horizontal rules
      { token: 'punctuation.definition.quote.markdown', foreground: '#546e7a' },
      { token: 'punctuation.definition.hr.markdown', foreground: '#546e7a' },

      // Jinja/template
      { token: 'keyword.control.jinja.prompd', foreground: '#ff5370', fontStyle: 'bold' },
      { token: 'meta.embedded.jinja.prompd', foreground: '#ff5370' },
      { token: 'comment.block.jinja.prompd', foreground: '#546e7a', fontStyle: 'italic' },
      { token: 'punctuation.definition.tag.jinja', foreground: '#ff5370', fontStyle: 'bold' },
      { token: 'keyword.control.jinja', foreground: '#c792ea', fontStyle: 'bold' },
      { token: 'keyword.operator.jinja', foreground: '#89ddff' },
      { token: 'comment.block.jinja', foreground: '#546e7a', fontStyle: 'italic' },
      { token: 'string.quoted.double.jinja', foreground: '#c3e88d' },
      { token: 'string.quoted.single.jinja', foreground: '#c3e88d' },
      { token: 'constant.numeric.jinja', foreground: '#f78c6c' },
      { token: 'variable.other.jinja', foreground: '#82aaff' },
      { token: 'support.variable.jinja', foreground: '#c792ea', fontStyle: 'italic' },
      { token: 'punctuation.definition.expression.jinja', foreground: '#ff5370', fontStyle: 'bold' },
      { token: 'punctuation.bracket.jinja', foreground: '#89ddff' },
      { token: 'punctuation.separator.jinja', foreground: '#89ddff' },

      // Errors
      { token: 'invalid', foreground: '#ff5370', fontStyle: 'bold underline' },
      { token: 'comment.warning', foreground: '#ffcb6b' },
      { token: 'keyword.control.prompd', foreground: '#c792ea', fontStyle: 'bold' },
      { token: 'punctuation.definition.frontmatter.begin.prompd', foreground: '#89ddff', fontStyle: 'bold' },
      { token: 'punctuation.definition.frontmatter.end.prompd', foreground: '#89ddff', fontStyle: 'bold' },
      { token: 'meta.frontmatter.prompd', background: '#1a1f2e' },
    ],
    colors: {
      // Use darkest bg (#0b1220) to match var(--bg) in dark mode
      'editor.background': '#0b1220',
      'editor.foreground': '#e0e0e0',
      // Line numbers gutter - darker with subtle border
      'editorLineNumber.foreground': '#3b4252',
      'editorLineNumber.activeForeground': '#64748b',
      'editorGutter.background': '#0b1220',
      'editorGutter.modifiedBackground': '#3b82f6',
      'editorGutter.addedBackground': '#10b981',
      'editorGutter.deletedBackground': '#ef4444',
      'editor.lineHighlightBackground': '#1a1f2e',
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': '#2c4f76',
      'editor.selectionHighlightBackground': '#2c4f7640',
      'editor.inactiveSelectionBackground': '#2c4f7630',
      'editor.findMatchBackground': '#515c6a80',
      'editor.findMatchHighlightBackground': '#515c6a40',
      'editorSuggestWidget.background': '#1a1f2e',
      'editorSuggestWidget.border': '#2c3e50',
      'editorSuggestWidget.selectedBackground': '#2c4f76',
      'editorSuggestWidget.foreground': '#e0e0e0',
      'editorSuggestWidget.highlightForeground': '#82aaff',
      'editorHoverWidget.background': '#1a1f2e',
      'editorHoverWidget.border': '#2c3e50',
      'editorHoverWidget.foreground': '#e0e0e0',
      'editorError.foreground': '#ff5370',
      'editorWarning.foreground': '#ffcb6b',
      'editorInfo.foreground': '#82aaff',
      'editorCursor.foreground': '#ffcb6b',
      'editorWhitespace.foreground': '#3b4048',
      'minimap.background': '#0f172a',
      'minimapSlider.background': '#2c3e5033',
      'minimapSlider.hoverBackground': '#2c3e5055',
      'minimapSlider.activeBackground': '#82aaff55',
      'scrollbarSlider.background': '#2c3e5099',
      'scrollbarSlider.hoverBackground': '#82aaffaa',
      'scrollbarSlider.activeBackground': '#82aaff',
      'editorBracketMatch.background': '#2c4f7640',
      'editorBracketMatch.border': '#82aaff',
    }
  })

  // Enhanced light theme
  monacoInstance.editor.defineTheme('prompd-light', {
    base: 'vs',
    inherit: true,
    rules: [
      // YAML frontmatter
      { token: 'keyword.yaml', foreground: '#0071bc', fontStyle: 'bold' },
      { token: 'keyword', foreground: '#0071bc', fontStyle: 'bold' },
      { token: 'key.yaml', foreground: '#0071bc', fontStyle: 'bold' },
      { token: 'entity.name.tag.yaml', foreground: '#0071bc', fontStyle: 'bold' },

      // Punctuation
      { token: 'punctuation.separator.key-value.yaml', foreground: '#005cc5' },
      { token: 'punctuation.definition.list.yaml', foreground: '#005cc5' },
      { token: 'punctuation.bracket.yaml', foreground: '#005cc5' },
      { token: 'punctuation.separator.yaml', foreground: '#005cc5' },
      { token: 'punctuation.definition.frontmatter', foreground: '#005cc5', fontStyle: 'bold' },

      // Strings (YAML)
      { token: 'string.quoted.double.yaml', foreground: '#22863a' },
      { token: 'string.quoted.single.yaml', foreground: '#22863a' },
      { token: 'string.unquoted.yaml', foreground: '#22863a' },
      { token: 'string.yaml', foreground: '#22863a' },
      { token: 'string.quoted.double', foreground: '#22863a' },
      { token: 'string.quoted.single', foreground: '#22863a' },

      // Numbers and constants (YAML)
      { token: 'constant.numeric.yaml', foreground: '#d73a49' },
      { token: 'constant.numeric.integer.yaml', foreground: '#d73a49' },
      { token: 'constant.numeric.float.yaml', foreground: '#d73a49' },
      { token: 'constant.numeric.version.yaml', foreground: '#d73a49' },
      { token: 'constant.language.boolean.yaml', foreground: '#d73a49' },
      { token: 'constant.language.null.yaml', foreground: '#d73a49' },
      { token: 'constant.character.escape.yaml', foreground: '#d73a49' },
      { token: 'number.float.yaml', foreground: '#d73a49' },
      { token: 'number.yaml', foreground: '#d73a49' },

      // Comments
      { token: 'comment.yaml', foreground: '#6a737d', fontStyle: 'italic' },
      { token: 'comment', foreground: '#6a737d', fontStyle: 'italic' },

      // Generic delimiters
      { token: 'delimiter', foreground: '#005cc5' },
      { token: 'operator', foreground: '#005cc5' },

      // Section headers
      { token: 'type.identifier', foreground: '#b08800', fontStyle: 'bold' },
      { token: 'type', foreground: '#b08800', fontStyle: 'bold' },
      { token: 'entity.name.section.prompd', foreground: '#b08800', fontStyle: 'bold' },
      { token: 'entity.name.heading.prompd', foreground: '#0071bc', fontStyle: 'bold' },
      { token: 'punctuation.definition.heading.prompd', foreground: '#6a737d' },
      { token: 'punctuation.definition.heading.markdown', foreground: '#6a737d' },
      { token: 'markup.heading.markdown', foreground: '#0071bc', fontStyle: 'bold' },

      // Package references
      { token: 'variable.other.package', foreground: '#6f42c1', fontStyle: 'italic' },
      { token: 'support.class.package', foreground: '#6f42c1', fontStyle: 'italic' },

      // Parameter references
      { token: 'variable.parameter', foreground: '#e36209', fontStyle: 'bold' },
      { token: 'variable.handlebars', foreground: '#e36209', fontStyle: 'bold' },
      { token: 'variable', foreground: '#e36209' },
      { token: 'variable.name.prompd', foreground: '#e36209' },
      { token: 'variable.other.template.prompd', foreground: '#e36209' },
      { token: 'variable.other.simple.prompd', foreground: '#e36209' },

      // Markdown formatting
      { token: 'strong', foreground: '#24292e', fontStyle: 'bold' },
      { token: 'markup.bold.prompd', foreground: '#24292e', fontStyle: 'bold' },
      { token: 'markup.bold.markdown', foreground: '#24292e', fontStyle: 'bold' },
      { token: 'emphasis', foreground: '#0071bc', fontStyle: 'italic' },
      { token: 'markup.italic.prompd', foreground: '#0071bc', fontStyle: 'italic' },
      { token: 'markup.italic.markdown', foreground: '#0071bc', fontStyle: 'italic' },
      { token: 'markup.strikethrough.markdown', foreground: '#6a737d', fontStyle: 'strikethrough' },

      // Code blocks
      { token: 'string.quoted', foreground: '#22863a' },
      { token: 'string', foreground: '#22863a' },
      { token: 'markup.inline.raw.prompd', foreground: '#032f62', background: '#f6f8fa' },
      { token: 'markup.inline.raw.markdown', foreground: '#032f62', background: '#f6f8fa' },
      { token: 'markup.fenced_code.block.prompd', foreground: '#24292e' },
      { token: 'markup.raw.block.markdown', foreground: '#24292e' },
      { token: 'punctuation.definition.code.fenced', foreground: '#6a737d' },
      { token: 'fenced_code.block.language.prompd', foreground: '#0071bc', fontStyle: 'italic' },

      // Lists
      { token: 'markup.list.unnumbered.prompd', foreground: '#005cc5' },
      { token: 'markup.list.numbered.prompd', foreground: '#005cc5' },
      { token: 'punctuation.definition.list_item.prompd', foreground: '#005cc5', fontStyle: 'bold' },
      { token: 'punctuation.definition.list.markdown', foreground: '#005cc5' },

      // Links
      { token: 'string.link', foreground: '#0366d6', fontStyle: 'underline' },
      { token: 'string.reference', foreground: '#6f42c1' },
      { token: 'markup.underline.link.markdown', foreground: '#0366d6', fontStyle: 'underline' },
      { token: 'markup.underline.link.image.markdown', foreground: '#0366d6' },

      // Blockquotes and horizontal rules
      { token: 'punctuation.definition.quote.markdown', foreground: '#6a737d' },
      { token: 'punctuation.definition.hr.markdown', foreground: '#6a737d' },

      // Jinja/template
      { token: 'keyword.control.jinja.prompd', foreground: '#d73a49', fontStyle: 'bold' },
      { token: 'meta.embedded.jinja.prompd', foreground: '#d73a49' },
      { token: 'comment.block.jinja.prompd', foreground: '#6a737d', fontStyle: 'italic' },
      { token: 'punctuation.definition.tag.jinja', foreground: '#d73a49', fontStyle: 'bold' },
      { token: 'keyword.control.jinja', foreground: '#6f42c1', fontStyle: 'bold' },
      { token: 'keyword.operator.jinja', foreground: '#005cc5' },
      { token: 'comment.block.jinja', foreground: '#6a737d', fontStyle: 'italic' },
      { token: 'string.quoted.double.jinja', foreground: '#22863a' },
      { token: 'string.quoted.single.jinja', foreground: '#22863a' },
      { token: 'constant.numeric.jinja', foreground: '#d73a49' },
      { token: 'variable.other.jinja', foreground: '#0071bc' },
      { token: 'support.variable.jinja', foreground: '#6f42c1', fontStyle: 'italic' },
      { token: 'punctuation.definition.expression.jinja', foreground: '#d73a49', fontStyle: 'bold' },
      { token: 'punctuation.bracket.jinja', foreground: '#005cc5' },
      { token: 'punctuation.separator.jinja', foreground: '#005cc5' },

      // Errors
      { token: 'invalid', foreground: '#b31d28', fontStyle: 'bold underline' },
      { token: 'comment.warning', foreground: '#b08800' },
      { token: 'keyword.control.prompd', foreground: '#6f42c1', fontStyle: 'bold' },
      { token: 'punctuation.definition.frontmatter.begin.prompd', foreground: '#005cc5', fontStyle: 'bold' },
      { token: 'punctuation.definition.frontmatter.end.prompd', foreground: '#005cc5', fontStyle: 'bold' },
      { token: 'meta.frontmatter.prompd', background: '#f6f8fa' },
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#24292e',
      'editor.lineHighlightBackground': '#f6f8fa',
      'editor.lineHighlightBorder': '#00000000',
      'editor.selectionBackground': '#c8e1ff',
      'editor.selectionHighlightBackground': '#c8e1ff60',
      'editor.inactiveSelectionBackground': '#c8e1ff40',
      'editor.findMatchBackground': '#ffdf5d80',
      'editor.findMatchHighlightBackground': '#ffdf5d40',
      'editorSuggestWidget.background': '#f6f8fa',
      'editorSuggestWidget.border': '#d1d5da',
      'editorSuggestWidget.selectedBackground': '#c8e1ff',
      'editorSuggestWidget.foreground': '#24292e',
      'editorSuggestWidget.highlightForeground': '#0071bc',
      'editorHoverWidget.background': '#f6f8fa',
      'editorHoverWidget.border': '#d1d5da',
      'editorHoverWidget.foreground': '#24292e',
      'editorError.foreground': '#d73a49',
      'editorWarning.foreground': '#b08800',
      'editorInfo.foreground': '#0071bc',
      'editorCursor.foreground': '#044289',
      'editorWhitespace.foreground': '#d1d5da',
      'minimap.background': '#ffffff',
      'minimapSlider.background': '#d1d5da33',
      'minimapSlider.hoverBackground': '#d1d5da55',
      'minimapSlider.activeBackground': '#0071bc55',
      'scrollbarSlider.background': '#d1d5da99',
      'scrollbarSlider.hoverBackground': '#959da5aa',
      'scrollbarSlider.activeBackground': '#6a737d',
      'editorBracketMatch.background': '#c8e1ff40',
      'editorBracketMatch.border': '#0071bc',
    }
  })

  themesRegistered = true
}

/**
 * Default editor options for consistent behavior
 */
export const defaultEditorOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
  // Basic settings
  fontSize: 13,
  lineNumbers: 'on',
  wordWrap: 'on',
  automaticLayout: true,
  scrollBeyondLastLine: false,

  // Minimap (can be overridden per editor)
  minimap: { enabled: false },

  // Padding for better readability
  padding: { top: 8, bottom: 8 },

  // Suggestions and IntelliSense
  quickSuggestions: true,
  suggestOnTriggerCharacters: true,
  acceptSuggestionOnEnter: 'on',
  tabCompletion: 'on',

  // Bracket matching
  matchBrackets: 'always',
  bracketPairColorization: {
    enabled: true
  },

  // Formatting
  formatOnPaste: true,
  formatOnType: false,

  // Scrolling
  smoothScrolling: true,
  mouseWheelZoom: false,

  // Accessibility
  ariaLabel: 'Code Editor'
}

/**
 * YAML-specific editor options
 */
export const yamlEditorOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
  ...defaultEditorOptions,
  language: 'yaml',
  tabSize: 2,
  insertSpaces: true,
  detectIndentation: false
}

/**
 * Markdown-specific editor options
 */
export const markdownEditorOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
  ...defaultEditorOptions,
  language: 'markdown',
  wordWrap: 'on',
  wrappingIndent: 'same'
}

/**
 * Read-only editor options
 */
export const readOnlyEditorOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
  ...defaultEditorOptions,
  readOnly: true,
  domReadOnly: true,
  cursorStyle: 'line-thin',
  renderLineHighlight: 'none'
}

/**
 * Maximized editor options (with minimap)
 */
export const maximizedEditorOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
  ...defaultEditorOptions,
  minimap: { enabled: true }
}

/**
 * Initialize Monaco editor with global settings
 * Call this once at application startup
 * Note: Prompd themes with syntax highlighting rules are defined in textmate.ts
 * and registered when setupPrompdLanguage is called
 */
export function initializeMonaco() {
  // Register languages
  registerLanguages()

  // Additional global Monaco configurations can be added here
  // Theme definitions are now centralized in textmate.ts for Prompd syntax highlighting
}

/**
 * Get theme name based on current app theme
 * Uses prompd-dark/prompd-light for full syntax highlighting support
 */
export function getMonacoTheme(isDark: boolean): string {
  return isDark ? 'prompd-dark' : 'prompd-light'
}

/**
 * Helper to merge custom options with defaults
 */
export function mergeEditorOptions(
  custom: monaco.editor.IStandaloneEditorConstructionOptions = {}
): monaco.editor.IStandaloneEditorConstructionOptions {
  return { ...defaultEditorOptions, ...custom }
}

/**
 * Get all Monaco editor markers (errors, warnings, info)
 * Returns markers from all sources (JSON, YAML, TypeScript validation, etc.)
 */
export function getMonacoMarkers(): monaco.editor.IMarker[] {
  // Get all markers without filtering by owner to catch all validation sources
  // (JSON, TypeScript, prompd intellisense, etc.)
  const markers = monaco.editor.getModelMarkers({})

  // Debug: log marker count and sources
  if (markers.length > 0) {
    const owners = [...new Set(markers.map(m => m.owner))]
    console.log('[monacoConfig] Found', markers.length, 'markers from owners:', owners)
  }

  return markers
}

/**
 * Get Monaco markers for the current active model
 * Filters by model URI if provided
 */
export function getMonacoMarkersForModel(modelUri?: string): monaco.editor.IMarker[] {
  const allMarkers = monaco.editor.getModelMarkers({})
  if (!modelUri) return allMarkers
  return allMarkers.filter(m => m.resource.toString() === modelUri)
}

/**
 * Count Monaco markers by severity
 */
export function countMonacoMarkers(): { errors: number; warnings: number; info: number; total: number } {
  const markers = monaco.editor.getModelMarkers({})
  let errors = 0
  let warnings = 0
  let info = 0

  for (const marker of markers) {
    switch (marker.severity) {
      case monaco.MarkerSeverity.Error:
        errors++
        break
      case monaco.MarkerSeverity.Warning:
        warnings++
        break
      case monaco.MarkerSeverity.Info:
      case monaco.MarkerSeverity.Hint:
        info++
        break
    }
  }

  return { errors, warnings, info, total: markers.length }
}

/**
 * Monaco Variable Decorations - Highlight {{ variable }} syntax in Monaco editors
 *
 * This module provides utilities to add visual decorations for template variables
 * in Monaco editor instances. Variables appear with a distinct background color
 * and can show hover information.
 *
 * Usage:
 * ```typescript
 * import { setupVariableDecorations } from './monacoVariableDecorations'
 *
 * // In your Monaco onMount handler:
 * const handleEditorMount = (editor: monaco.editor.IStandaloneCodeEditor, monaco: Monaco) => {
 *   const cleanup = setupVariableDecorations(editor, monaco, {
 *     nodeLabels: { 'prompt-1': 'Generate Outline' }
 *   })
 *   // Call cleanup() when component unmounts
 * }
 * ```
 */

import type * as Monaco from 'monaco-editor'

// ============================================================================
// Types
// ============================================================================

export interface VariableDecorationOptions {
  /** Map of node IDs to their labels for hover info */
  nodeLabels?: Record<string, string>
  /** Custom CSS class for decoration (optional, uses inline styles by default) */
  className?: string
  /** Whether to show hover information */
  showHover?: boolean
  /** Debounce delay in ms for updating decorations */
  debounceMs?: number
}

interface VariableMatch {
  path: string
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
  sourceNodeId?: string
}

// ============================================================================
// CSS Injection for Decorations
// ============================================================================

let stylesInjected = false

function injectStyles() {
  if (stylesInjected) return
  stylesInjected = true

  const style = document.createElement('style')
  style.id = 'monaco-variable-decorations'
  style.textContent = `
    .monaco-variable-decoration {
      background-color: color-mix(in srgb, var(--accent, #6366f1) 20%, transparent);
      border-radius: 3px;
      padding: 0 2px;
      margin: 0 -2px;
    }

    .monaco-variable-decoration-dark {
      background-color: rgba(99, 102, 241, 0.25);
    }

    .monaco-variable-decoration-light {
      background-color: rgba(99, 102, 241, 0.15);
    }

    /* Hover state */
    .monaco-variable-decoration:hover {
      background-color: color-mix(in srgb, var(--accent, #6366f1) 30%, transparent);
    }

    /* Error state for unresolved variables */
    .monaco-variable-decoration-error {
      background-color: color-mix(in srgb, var(--error, #ef4444) 20%, transparent);
      text-decoration: wavy underline;
      text-decoration-color: var(--error, #ef4444);
    }
  `
  document.head.appendChild(style)
}

// ============================================================================
// Variable Parsing
// ============================================================================

const VARIABLE_REGEX = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*|\[\d+\]|\['[^']+'\]|\["[^"]+"\])*)\s*\}\}/g

function findVariablesInText(text: string): VariableMatch[] {
  const matches: VariableMatch[] = []
  const lines = text.split('\n')

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]
    let match: RegExpExecArray | null

    VARIABLE_REGEX.lastIndex = 0
    while ((match = VARIABLE_REGEX.exec(line)) !== null) {
      const path = match[1].trim()
      const parts = path.split('.')

      // Check if first part looks like a node ID
      let sourceNodeId: string | undefined
      if (parts.length > 1 && (parts[0].includes('-') || parts[0].includes('_'))) {
        sourceNodeId = parts[0]
      }

      matches.push({
        path,
        startLine: lineIndex + 1, // Monaco is 1-indexed
        startColumn: match.index + 1,
        endLine: lineIndex + 1,
        endColumn: match.index + match[0].length + 1,
        sourceNodeId,
      })
    }
  }

  return matches
}

// ============================================================================
// Decoration Setup
// ============================================================================

/**
 * Setup variable decorations for a Monaco editor instance
 *
 * @param editor - Monaco editor instance
 * @param monaco - Monaco namespace
 * @param options - Configuration options
 * @returns Cleanup function to remove decorations and listeners
 */
export function setupVariableDecorations(
  editor: Monaco.editor.IStandaloneCodeEditor,
  monaco: typeof Monaco,
  options: VariableDecorationOptions = {}
): () => void {
  const { nodeLabels = {}, showHover = true, debounceMs = 100 } = options

  // Inject CSS styles
  injectStyles()

  // Track decoration IDs
  let decorationIds: string[] = []
  let hoverProvider: Monaco.IDisposable | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  // Update decorations
  const updateDecorations = () => {
    const model = editor.getModel()
    if (!model) return

    const text = model.getValue()
    const variables = findVariablesInText(text)

    // Create decoration options
    const decorations: Monaco.editor.IModelDeltaDecoration[] = variables.map((variable) => ({
      range: new monaco.Range(
        variable.startLine,
        variable.startColumn,
        variable.endLine,
        variable.endColumn
      ),
      options: {
        inlineClassName: 'monaco-variable-decoration',
        hoverMessage: showHover
          ? {
              value: buildHoverMessage(variable, nodeLabels),
              isTrusted: true,
            }
          : undefined,
      },
    }))

    // Apply decorations
    decorationIds = editor.deltaDecorations(decorationIds, decorations)
  }

  // Debounced update
  const debouncedUpdate = () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(updateDecorations, debounceMs)
  }

  // Setup hover provider for rich hover content
  if (showHover) {
    const model = editor.getModel()
    if (model) {
      hoverProvider = monaco.languages.registerHoverProvider(model.getLanguageId(), {
        provideHover: (model, position) => {
          const text = model.getValue()
          const variables = findVariablesInText(text)

          for (const variable of variables) {
            const range = new monaco.Range(
              variable.startLine,
              variable.startColumn,
              variable.endLine,
              variable.endColumn
            )

            if (range.containsPosition(position)) {
              return {
                range,
                contents: [
                  {
                    value: buildHoverMarkdown(variable, nodeLabels),
                    isTrusted: true,
                  },
                ],
              }
            }
          }

          return null
        },
      })
    }
  }

  // Listen for content changes
  const changeListener = editor.onDidChangeModelContent(debouncedUpdate)

  // Initial update
  updateDecorations()

  // Return cleanup function
  return () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    changeListener.dispose()
    if (hoverProvider) hoverProvider.dispose()
    editor.deltaDecorations(decorationIds, [])
  }
}

// ============================================================================
// Hover Content Builders
// ============================================================================

function buildHoverMessage(
  variable: VariableMatch,
  nodeLabels: Record<string, string>
): string {
  const parts: string[] = [`**Variable:** \`${variable.path}\``]

  if (variable.sourceNodeId) {
    const label = nodeLabels[variable.sourceNodeId]
    if (label) {
      parts.push(`**From:** ${label}`)
    } else {
      parts.push(`**From node:** \`${variable.sourceNodeId}\``)
    }
  }

  return parts.join('\n\n')
}

function buildHoverMarkdown(
  variable: VariableMatch,
  nodeLabels: Record<string, string>
): string {
  let markdown = `### Template Variable\n\n`
  markdown += `**Path:** \`${variable.path}\`\n\n`

  if (variable.sourceNodeId) {
    const label = nodeLabels[variable.sourceNodeId]
    if (label) {
      markdown += `**Source:** ${label} (\`${variable.sourceNodeId}\`)\n\n`
    } else {
      markdown += `**Source Node:** \`${variable.sourceNodeId}\`\n\n`
    }

    const propertyPath = variable.path.split('.').slice(1).join('.')
    if (propertyPath) {
      markdown += `**Property:** \`${propertyPath}\`\n\n`
    }
  }

  markdown += `---\n*Use \`{{ }}\` syntax to reference values from other nodes or workflow parameters.*`

  return markdown
}

// ============================================================================
// Exports
// ============================================================================

export { findVariablesInText }
export type { VariableMatch }

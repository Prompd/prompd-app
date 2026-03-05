/**
 * Code action providers for quick fixes
 */
import type * as monacoEditor from 'monaco-editor'
import { fixObjectParamsToArray } from './utils'
import { getCurrentFilePath, setCurrentFilePath } from './validation'
import { logger } from '../logger'

// Scoped logger for code actions (can be disabled in production)
const log = logger.scope('CodeActions')

/**
 * Code action command IDs for Prompd quick fixes
 */
export const CODE_ACTION_IDS = {
  // Brace conversion
  CONVERT_SINGLE_TO_DOUBLE_BRACE: 'prompd.convert-single-to-double-brace',
  CONVERT_DOUBLE_TO_SINGLE_BRACE: 'prompd.convert-double-to-single-brace',
  CONVERT_ALL_SINGLE_TO_DOUBLE: 'prompd.convert-all-single-to-double-brace',
  CONVERT_ALL_DOUBLE_TO_SINGLE: 'prompd.convert-all-double-to-single-brace',
  // Frontmatter fixes
  ADD_FRONTMATTER: 'prompd.add-frontmatter',
  ADD_REQUIRED_FIELD: 'prompd.add-required-field',
  CONVERT_TO_KEBAB_CASE: 'prompd.convert-to-kebab-case',
  FIX_ID_TO_MATCH_FILENAME: 'prompd.fix-id-to-match-filename',
  RENAME_FILE_TO_MATCH_ID: 'prompd.rename-file-to-match-id',
  ADD_PACKAGE_VERSION: 'prompd.add-package-version',
  // Parameter fixes
  DEFINE_PARAMETER: 'prompd.define-parameter',
  REMOVE_UNDEFINED_REFERENCE: 'prompd.remove-undefined-reference',
  FIX_SEMANTIC_VERSION: 'prompd.fix-semantic-version',
  CONVERT_PARAMS_TO_ARRAY: 'prompd.convert-params-to-array',
  // YAML value formatting
  WRAP_IN_QUOTES: 'prompd.wrap-in-quotes',
  REMOVE_QUOTES: 'prompd.remove-quotes',
  SWITCH_QUOTE_TYPE: 'prompd.switch-quote-type',
} as const

/**
 * Find variable references at or near a position
 * Returns info about single-brace {var} or double-brace {{var}} references
 */
function findVariableAtPosition(
  model: monacoEditor.editor.ITextModel,
  position: monacoEditor.Position
): {
  type: 'single' | 'double'
  varName: string
  range: monacoEditor.IRange
  fullMatch: string
} | null {
  const lineContent = model.getLineContent(position.lineNumber)
  const column = position.column

  // Regex patterns for both formats
  // Double brace: {{ var_name }} or {{var_name}}
  const doubleBraceRegex = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g
  // Single brace: {var_name} (but not {{)
  const singleBraceRegex = /(?<!\{)\{([a-zA-Z_][a-zA-Z0-9_]*)\}(?!\})/g

  // Check double brace first
  let match: RegExpExecArray | null
  while ((match = doubleBraceRegex.exec(lineContent)) !== null) {
    const start = match.index + 1 // +1 for 1-based column
    const end = start + match[0].length
    if (column >= start && column <= end) {
      return {
        type: 'double',
        varName: match[1],
        range: {
          startLineNumber: position.lineNumber,
          startColumn: start,
          endLineNumber: position.lineNumber,
          endColumn: end
        },
        fullMatch: match[0]
      }
    }
  }

  // Check single brace
  while ((match = singleBraceRegex.exec(lineContent)) !== null) {
    const start = match.index + 1 // +1 for 1-based column
    const end = start + match[0].length
    if (column >= start && column <= end) {
      return {
        type: 'single',
        varName: match[1],
        range: {
          startLineNumber: position.lineNumber,
          startColumn: start,
          endLineNumber: position.lineNumber,
          endColumn: end
        },
        fullMatch: match[0]
      }
    }
  }

  return null
}

/**
 * Find the line number where frontmatter ends (the closing ---)
 */
function findFrontmatterEnd(content: string): number {
  const lines = content.split('\n')
  let inFrontmatter = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line === '---') {
      if (!inFrontmatter) {
        inFrontmatter = true
      } else {
        return i + 1 // Return 1-based line number
      }
    }
  }
  return 0 // No frontmatter found
}

/**
 * Find all variable references in the document
 */
function findAllVariables(content: string): Array<{
  type: 'single' | 'double'
  varName: string
  lineNumber: number
  startColumn: number
  endColumn: number
  fullMatch: string
}> {
  const results: Array<{
    type: 'single' | 'double'
    varName: string
    lineNumber: number
    startColumn: number
    endColumn: number
    fullMatch: string
  }> = []

  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNumber = i + 1

    // Find double braces
    const doubleBraceRegex = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g
    let match: RegExpExecArray | null
    while ((match = doubleBraceRegex.exec(line)) !== null) {
      results.push({
        type: 'double',
        varName: match[1],
        lineNumber,
        startColumn: match.index + 1,
        endColumn: match.index + 1 + match[0].length,
        fullMatch: match[0]
      })
    }

    // Find single braces (not part of double braces)
    const singleBraceRegex = /(?<!\{)\{([a-zA-Z_][a-zA-Z0-9_]*)\}(?!\})/g
    while ((match = singleBraceRegex.exec(line)) !== null) {
      results.push({
        type: 'single',
        varName: match[1],
        lineNumber,
        startColumn: match.index + 1,
        endColumn: match.index + 1 + match[0].length,
        fullMatch: match[0]
      })
    }
  }

  return results
}

/**
 * Check if cursor is on a YAML field value that can be wrapped/unwrapped with quotes
 * Returns info about the value if found
 */
function findYamlValueAtPosition(
  model: monacoEditor.editor.ITextModel,
  position: monacoEditor.Position,
  content: string
): {
  key: string
  value: string
  isQuoted: boolean
  quoteChar: '"' | "'"
  valueRange: monacoEditor.IRange
} | null {
  const lineNumber = position.lineNumber
  const lineContent = model.getLineContent(lineNumber)

  // Only check lines in frontmatter
  const frontmatterEnd = findFrontmatterEnd(content)
  if (lineNumber >= frontmatterEnd || lineNumber <= 1) {
    return null
  }

  // Match YAML key-value pattern: "key: value" or "key: 'value'" or 'key: "value"'
  // Also handles array items like "  - name: value"
  const yamlMatch = lineContent.match(/^(\s*(?:-\s+)?)([\w-]+):\s*(.*)$/)
  if (!yamlMatch) {
    return null
  }

  const indent = yamlMatch[1]
  const key = yamlMatch[2]
  const rawValue = yamlMatch[3]

  // Skip empty values, multi-line indicators, or comments
  if (!rawValue || rawValue.startsWith('|') || rawValue.startsWith('>') || rawValue.startsWith('#')) {
    return null
  }

  // Calculate value start column (after "key: ")
  const valueStartCol = indent.length + key.length + 2 + 1 // +2 for ": ", +1 for 1-based

  // Check if cursor is within or near the value
  const column = position.column
  if (column < valueStartCol) {
    return null
  }

  // Determine if value is already quoted and with what character
  const doubleQuoteMatch = rawValue.match(/^"((?:[^"\\]|\\.)*)"(.*)$/)
  const singleQuoteMatch = rawValue.match(/^'((?:[^'\\]|\\.)*)'(.*)$/)

  if (doubleQuoteMatch) {
    // Value is double-quoted
    const innerValue = doubleQuoteMatch[1]
    const trailing = doubleQuoteMatch[2].trim()
    // Skip if there's meaningful content after the closing quote (likely a comment is fine)
    if (trailing && !trailing.startsWith('#')) {
      return null
    }
    return {
      key,
      value: innerValue,
      isQuoted: true,
      quoteChar: '"',
      valueRange: {
        startLineNumber: lineNumber,
        startColumn: valueStartCol,
        endLineNumber: lineNumber,
        endColumn: valueStartCol + rawValue.length - (trailing ? trailing.length : 0)
      }
    }
  } else if (singleQuoteMatch) {
    // Value is single-quoted
    const innerValue = singleQuoteMatch[1]
    const trailing = singleQuoteMatch[2].trim()
    if (trailing && !trailing.startsWith('#')) {
      return null
    }
    return {
      key,
      value: innerValue,
      isQuoted: true,
      quoteChar: "'",
      valueRange: {
        startLineNumber: lineNumber,
        startColumn: valueStartCol,
        endLineNumber: lineNumber,
        endColumn: valueStartCol + rawValue.length - (trailing ? trailing.length : 0)
      }
    }
  } else {
    // Value is unquoted - trim any trailing comment
    const commentIdx = rawValue.indexOf('#')
    const cleanValue = commentIdx >= 0 ? rawValue.substring(0, commentIdx).trim() : rawValue.trim()

    if (!cleanValue) {
      return null
    }

    return {
      key,
      value: cleanValue,
      isQuoted: false,
      quoteChar: '"', // Default to double quotes when adding
      valueRange: {
        startLineNumber: lineNumber,
        startColumn: valueStartCol,
        endLineNumber: lineNumber,
        endColumn: valueStartCol + cleanValue.length
      }
    }
  }
}

/**
 * Register the code action provider
 */
export function registerCodeActionProvider(
  monaco: typeof monacoEditor,
  languageId: string
): monacoEditor.IDisposable {
  log.log('Registering code action provider for language:', languageId)

  // Register command: rename file to match id
  // Guard against duplicate fires (code actions can trigger multiple times)
  let renameInProgress = false
  monaco.editor.registerCommand(CODE_ACTION_IDS.RENAME_FILE_TO_MATCH_ID, async (_accessor, filePath: string, newId: string) => {
    if (renameInProgress) return
    renameInProgress = true
    try {
      const electronAPI = (window as { electronAPI?: {
        rename: (oldPath: string, newPath: string) => Promise<{ success: boolean; error?: string }>
        readFile: (path: string) => Promise<{ success: boolean; content?: string }>
      } }).electronAPI
      if (!electronAPI?.rename) {
        log.log('Electron rename API not available')
        return
      }
      const normalized = filePath.replace(/\\/g, '/')
      const dir = normalized.substring(0, normalized.lastIndexOf('/'))
      const newPath = `${dir}/${newId}.prmd`
      const newFileName = `${newId}.prmd`
      log.log('Renaming file:', normalized, '->', newPath)

      // Dispatch rename event BEFORE the disk rename so TabManager updates
      // the tab before the file watcher can invalidate it
      window.dispatchEvent(new CustomEvent('prompd-file-renamed', {
        detail: { oldPath: normalized, newPath, newFileName }
      }))

      const result = await electronAPI.rename(normalized, newPath)
      if (!result.success) {
        log.log('Rename failed:', result.error)
        // Revert: dispatch back so tab name is restored
        window.dispatchEvent(new CustomEvent('prompd-file-renamed', {
          detail: { oldPath: newPath, newPath: normalized }
        }))
      } else {
        // Update intellisense file path to the new location
        setCurrentFilePath(newPath)
      }
    } finally {
      renameInProgress = false
    }
  })

  return monaco.languages.registerCodeActionProvider(
    languageId,
    {
      provideCodeActions(model, range, context) {
      log.log('provideCodeActions called:', {
        range,
        markersCount: context.markers.length,
        markers: context.markers.map(m => ({ message: m.message, code: m.code })),
        only: context.only,
        trigger: context.trigger
      })

      const actions: monacoEditor.languages.CodeAction[] = []
      const content = model.getValue()

      // Get cursor position (use start of range)
      const position = { lineNumber: range.startLineNumber, column: range.startColumn } as monacoEditor.Position

      // Check if cursor is on a variable reference - offer conversion
      // Note: Single brace → double brace conversion is handled by marker-based quick fixes
      // Only offer double brace → single brace here (no diagnostic for that)
      const varAtCursor = findVariableAtPosition(model, position)
      if (varAtCursor && varAtCursor.type === 'double') {
        // Offer to convert {{var}} to {var}
        actions.push({
          title: `Convert to single brace: {${varAtCursor.varName}}`,
          kind: 'quickfix',
          isPreferred: false,
          edit: {
            edits: [{
              resource: model.uri,
              textEdit: {
                range: varAtCursor.range,
                text: `{${varAtCursor.varName}}`
              },
              versionId: model.getVersionId()
            }]
          }
        })
      }

      // Check if cursor is on a YAML value - offer quote wrapping/unwrapping
      const yamlValue = findYamlValueAtPosition(model, position, content)
      if (yamlValue) {
        if (yamlValue.isQuoted) {
          // Offer to remove quotes
          actions.push({
            title: `Remove quotes from ${yamlValue.key}`,
            kind: 'quickfix',
            isPreferred: false,
            edit: {
              edits: [{
                resource: model.uri,
                textEdit: {
                  range: yamlValue.valueRange,
                  text: yamlValue.value
                },
                versionId: model.getVersionId()
              }]
            }
          })
          // Offer to switch quote type
          const otherQuote = yamlValue.quoteChar === '"' ? "'" : '"'
          actions.push({
            title: `Switch to ${otherQuote === '"' ? 'double' : 'single'} quotes`,
            kind: 'quickfix',
            isPreferred: false,
            edit: {
              edits: [{
                resource: model.uri,
                textEdit: {
                  range: yamlValue.valueRange,
                  text: `${otherQuote}${yamlValue.value}${otherQuote}`
                },
                versionId: model.getVersionId()
              }]
            }
          })
        } else {
          // Offer to add double quotes
          actions.push({
            title: `Wrap "${yamlValue.value}" in double quotes`,
            kind: 'quickfix',
            isPreferred: false,
            edit: {
              edits: [{
                resource: model.uri,
                textEdit: {
                  range: yamlValue.valueRange,
                  text: `"${yamlValue.value}"`
                },
                versionId: model.getVersionId()
              }]
            }
          })
          // Offer to add single quotes
          actions.push({
            title: `Wrap '${yamlValue.value}' in single quotes`,
            kind: 'quickfix',
            isPreferred: false,
            edit: {
              edits: [{
                resource: model.uri,
                textEdit: {
                  range: yamlValue.valueRange,
                  text: `'${yamlValue.value}'`
                },
                versionId: model.getVersionId()
              }]
            }
          })
        }
      }

      // Check if document has any variables - offer bulk conversion
      const allVars = findAllVariables(content)
      const singleBraceVars = allVars.filter(v => v.type === 'single')
      const doubleBraceVars = allVars.filter(v => v.type === 'double')

      // Only show bulk actions if there are variables to convert and cursor is in body (after frontmatter)
      const frontmatterEndLine = findFrontmatterEnd(content)
      const isInBody = position.lineNumber > frontmatterEndLine

      if (isInBody && singleBraceVars.length > 1) {
        // Offer to convert all single braces to double (only if more than 1)
        const edits = singleBraceVars.map(v => ({
          resource: model.uri,
          textEdit: {
            range: {
              startLineNumber: v.lineNumber,
              startColumn: v.startColumn,
              endLineNumber: v.lineNumber,
              endColumn: v.endColumn
            },
            text: `{{ ${v.varName} }}`
          },
          versionId: model.getVersionId()
        }))

        actions.push({
          title: `Convert all ${singleBraceVars.length} to {{ }}`,
          kind: 'quickfix',
          edit: { edits }
        })
      }

      if (isInBody && doubleBraceVars.length > 1) {
        // Offer to convert all double braces to single (only if more than 1)
        const edits = doubleBraceVars.map(v => ({
          resource: model.uri,
          textEdit: {
            range: {
              startLineNumber: v.lineNumber,
              startColumn: v.startColumn,
              endLineNumber: v.lineNumber,
              endColumn: v.endColumn
            },
            text: `{${v.varName}}`
          },
          versionId: model.getVersionId()
        }))

        actions.push({
          title: `Convert all ${doubleBraceVars.length} to { }`,
          kind: 'quickfix',
          edit: { edits }
        })
      }

      // Get markers (diagnostics) for the current range
      const markers = context.markers

      for (const marker of markers) {
        // Quick-fix: Add missing frontmatter delimiters
        if (marker.message.includes('Missing YAML frontmatter') || marker.message.includes('Missing frontmatter')) {
          actions.push({
            title: 'Add frontmatter delimiters (---)',
            kind: 'quickfix',
            diagnostics: [marker],
            isPreferred: true,
            edit: {
              edits: [{
                resource: model.uri,
                textEdit: {
                  range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
                  text: '---\nid: my-prompt\nname: "My Prompt"\nversion: 1.0.0\n---\n\n'
                },
                versionId: model.getVersionId()
              }]
            }
          })
        }

        // Quick-fix: Add missing required field
        if (marker.message.includes("Required field '")) {
          const fieldMatch = marker.message.match(/Required field '(\w+)'/)
          if (fieldMatch) {
            const field = fieldMatch[1]
            const defaultValues: Record<string, string> = {
              id: 'id: my-prompt',
              name: 'name: "My Prompt"',
              version: 'version: 1.0.0'
            }
            const insertText = defaultValues[field] || `${field}: `

            // Find insertion point (after opening ---)
            const lines = content.split('\n')
            let insertLine = 2
            if (lines[0]?.trim() === '---') {
              insertLine = 2
            }

            actions.push({
              title: `Add missing '${field}' field`,
              kind: 'quickfix',
              diagnostics: [marker],
              isPreferred: true,
              edit: {
                edits: [{
                  resource: model.uri,
                  textEdit: {
                    range: { startLineNumber: insertLine, startColumn: 1, endLineNumber: insertLine, endColumn: 1 },
                    text: insertText + '\n'
                  },
                  versionId: model.getVersionId()
                }]
              }
            })
          }
        }

        // Quick-fix: Convert non-kebab-case ID
        if (marker.message.includes('kebab-case')) {
          const idMatch = content.match(/^\s*id:\s*["']?([^"'\n]+)["']?/m)
          if (idMatch) {
            const currentId = idMatch[1].trim()
            const kebabId = currentId
              .toLowerCase()
              .replace(/[_\s]+/g, '-')
              .replace(/[^a-z0-9-]/g, '')
              .replace(/--+/g, '-')
              .replace(/^-|-$/g, '')

            if (kebabId !== currentId) {
              actions.push({
                title: `Convert to kebab-case: '${kebabId}'`,
                kind: 'quickfix',
                diagnostics: [marker],
                isPreferred: true,
                edit: {
                  edits: [{
                    resource: model.uri,
                    textEdit: {
                      range: {
                        startLineNumber: marker.startLineNumber,
                        startColumn: marker.startColumn,
                        endLineNumber: marker.endLineNumber,
                        endColumn: marker.endColumn
                      },
                      text: kebabId
                    },
                    versionId: model.getVersionId()
                  }]
                }
              })
            }
          }
        }

        // Quick-fix: ID/filename mismatch — offer both directions
        if (marker.code === 'id-filename-mismatch') {
          // Extract id and filename from message: "ID 'xxx' does not match filename 'yyy'."
          const mismatchMatch = marker.message.match(/ID '([^']+)' does not match filename '([^']+)'/)
          if (mismatchMatch) {
            const currentId = mismatchMatch[1]
            const fileBaseName = mismatchMatch[2]

            // Option 1: Rename id to match filename (text edit)
            actions.push({
              title: `Change id to '${fileBaseName}'`,
              kind: 'quickfix',
              diagnostics: [marker],
              isPreferred: true,
              edit: {
                edits: [{
                  resource: model.uri,
                  textEdit: {
                    range: {
                      startLineNumber: marker.startLineNumber,
                      startColumn: marker.startColumn,
                      endLineNumber: marker.endLineNumber,
                      endColumn: marker.endColumn
                    },
                    text: fileBaseName
                  },
                  versionId: model.getVersionId()
                }]
              }
            })

            // Option 2: Rename file to match id (command)
            const filePath = getCurrentFilePath()
            if (filePath) {
              actions.push({
                title: `Rename file to '${currentId}.prmd'`,
                kind: 'quickfix',
                diagnostics: [marker],
                isPreferred: false,
                command: {
                  id: CODE_ACTION_IDS.RENAME_FILE_TO_MATCH_ID,
                  title: `Rename file to '${currentId}.prmd'`,
                  arguments: [filePath, currentId]
                }
              })
            }
          }
        }

        // Quick-fix: Add version to package reference
        if (marker.message.includes('should include version')) {
          const pkgMatch = marker.message.match(/Package reference '([^']+)'/)
          if (pkgMatch) {
            const pkgName = pkgMatch[1]
            actions.push({
              title: `Add version: ${pkgName}@1.0.0`,
              kind: 'quickfix',
              diagnostics: [marker],
              isPreferred: true,
              edit: {
                edits: [{
                  resource: model.uri,
                  textEdit: {
                    range: {
                      startLineNumber: marker.startLineNumber,
                      startColumn: marker.startColumn,
                      endLineNumber: marker.endLineNumber,
                      endColumn: marker.endColumn
                    },
                    text: `${pkgName}@1.0.0`
                  },
                  versionId: model.getVersionId()
                }]
              }
            })
          }
        }

        // Quick-fix: Define undefined parameter
        // Matches both validation.ts ("Undefined parameter '{foo}'") and
        // crossReference.ts ("Parameter 'foo' is not defined") message formats
        if (
          marker.message.includes('Undefined parameter') ||
          marker.message.includes('is not defined') ||
          (marker as { code?: string }).code === 'undefined-parameter'
        ) {
          // Extract parameter name from either message format
          const paramMatch = marker.message.match(/Undefined parameter '\{(\w+)\}'/) ||
            marker.message.match(/Parameter '(\w+)' is not defined/)
          if (paramMatch) {
            const paramName = paramMatch[1]
            const lines = content.split('\n')

            // Find the parameters section and determine where to insert
            const paramsSectionLine = lines.findIndex(l => /^\s*parameters:\s*$/.test(l))

            if (paramsSectionLine >= 0) {
              // Find the end of the parameters block (last line that's indented under parameters:)
              let insertAfterLine = paramsSectionLine
              for (let i = paramsSectionLine + 1; i < lines.length; i++) {
                const line = lines[i]
                // Stop at blank lines, non-indented lines, or frontmatter end
                if (line.trim() === '---' || (line.trim() !== '' && !line.startsWith(' ') && !line.startsWith('\t'))) {
                  break
                }
                if (line.trim() !== '') {
                  insertAfterLine = i
                }
              }

              actions.push({
                title: `Define parameter '${paramName}'`,
                kind: 'quickfix',
                diagnostics: [marker],
                isPreferred: true,
                edit: {
                  edits: [{
                    resource: model.uri,
                    textEdit: {
                      range: { startLineNumber: insertAfterLine + 2, startColumn: 1, endLineNumber: insertAfterLine + 2, endColumn: 1 },
                      text: `  - name: ${paramName}\n    type: string\n    description: ""\n`
                    },
                    versionId: model.getVersionId()
                  }]
                }
              })
            } else {
              // No parameters section — create one before the closing ---
              const frontmatterEnd = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
              if (frontmatterEnd > 0) {
                actions.push({
                  title: `Define parameter '${paramName}'`,
                  kind: 'quickfix',
                  diagnostics: [marker],
                  isPreferred: true,
                  edit: {
                    edits: [{
                      resource: model.uri,
                      textEdit: {
                        range: { startLineNumber: frontmatterEnd + 1, startColumn: 1, endLineNumber: frontmatterEnd + 1, endColumn: 1 },
                        text: `parameters:\n  - name: ${paramName}\n    type: string\n    description: ""\n`
                      },
                      versionId: model.getVersionId()
                    }]
                  }
                })
              }
            }

            // Also offer to remove the undefined reference
            actions.push({
              title: `Remove reference '${paramName}'`,
              kind: 'quickfix',
              diagnostics: [marker],
              edit: {
                edits: [{
                  resource: model.uri,
                  textEdit: {
                    range: {
                      startLineNumber: marker.startLineNumber,
                      startColumn: marker.startColumn,
                      endLineNumber: marker.endLineNumber,
                      endColumn: marker.endColumn
                    },
                    text: ''
                  },
                  versionId: model.getVersionId()
                }]
              }
            })
          }
        }

        // Quick-fix: Invalid semantic version
        if (marker.message.includes('Invalid semantic version')) {
          actions.push({
            title: 'Set version to 1.0.0',
            kind: 'quickfix',
            diagnostics: [marker],
            isPreferred: true,
            edit: {
              edits: [{
                resource: model.uri,
                textEdit: {
                  range: {
                    startLineNumber: marker.startLineNumber,
                    startColumn: marker.startColumn,
                    endLineNumber: marker.endLineNumber,
                    endColumn: marker.endColumn
                  },
                  text: '1.0.0'
                },
                versionId: model.getVersionId()
              }]
            }
          })
        }

        // Quick-fix: Convert single brace to double brace (hint)
        if (marker.message.includes('Consider using double braces') || marker.code === 'single-brace-hint') {
          // Extract variable name from the marker range
          const lineContent = model.getLineContent(marker.startLineNumber)
          const varMatch = lineContent.substring(marker.startColumn - 1, marker.endColumn - 1).match(/\{(\w+)\}/)
          if (varMatch) {
            const varName = varMatch[1]
            actions.push({
              title: `Convert to {{ ${varName} }}`,
              kind: 'quickfix',
              diagnostics: [marker],
              isPreferred: true,
              edit: {
                edits: [{
                  resource: model.uri,
                  textEdit: {
                    range: {
                      startLineNumber: marker.startLineNumber,
                      startColumn: marker.startColumn,
                      endLineNumber: marker.endLineNumber,
                      endColumn: marker.endColumn
                    },
                    text: `{{ ${varName} }}`
                  },
                  versionId: model.getVersionId()
                }]
              }
            })
          }
        }
      }

      // Global action: Auto-fix all syntax issues
      if (markers.length > 0) {
        // Check if content has fixable issues (object-format params)
        // Look for any parameter defined with object format (param_name: followed by type:, etc.)
        const lines = content.split('\n')
        const paramsLineIdx = lines.findIndex(l => l.match(/^\s*parameters:\s*$/))
        let needsParamFix = false

        if (paramsLineIdx >= 0) {
          // Check the line after "parameters:" for object format
          const nextLineIdx = paramsLineIdx + 1
          if (nextLineIdx < lines.length) {
            const nextLine = lines[nextLineIdx]
            // Object format: "  param_name:" (indented identifier followed by colon, no "- name:")
            needsParamFix = !!nextLine.match(/^[ \t]+[a-zA-Z_][a-zA-Z0-9_]*:\s*$/) && !nextLine.includes('- name:')
          }
        }

        if (needsParamFix) {
          actions.push({
            title: 'Convert parameters to array format (fix LLM syntax)',
            kind: 'quickfix',
            diagnostics: markers,
            edit: {
              edits: [{
                resource: model.uri,
                textEdit: {
                  range: { startLineNumber: 1, startColumn: 1, endLineNumber: model.getLineCount(), endColumn: model.getLineMaxColumn(model.getLineCount()) },
                  text: fixObjectParamsToArray(content)
                },
                versionId: model.getVersionId()
              }]
            }
          })
        }
      }

      // Deduplicate actions by title (Monaco may call provideCodeActions multiple times)
      const seenTitles = new Set<string>()
      const uniqueActions = actions.filter(action => {
        if (seenTitles.has(action.title)) {
          return false
        }
        seenTitles.add(action.title)
        return true
      })

      log.log('Returning', uniqueActions.length, 'actions:', uniqueActions.map(a => a.title))

      // CRITICAL FIX: Return the actions object with EXACT typing Monaco expects
      return {
        actions: uniqueActions as ReadonlyArray<monacoEditor.languages.CodeAction>,
        dispose() {}
      }
    }
    }
    // REMOVED providedCodeActionKinds - testing if this is causing filtering
    // {
    //   providedCodeActionKinds: ['quickfix', 'refactor', 'source']
    // }
  )
}

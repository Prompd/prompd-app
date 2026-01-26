/**
 * Cross-Reference Analysis for IntelliSense
 *
 * Analyzes parameter usage within .prmd files to detect:
 * - Unused parameters (defined but never referenced)
 * - Missing parameters (referenced but not defined)
 * - Orphaned variables (defined in templates but not in frontmatter)
 */

import type * as monacoEditor from 'monaco-editor'
import { parse as parseYAML } from 'yaml'

export interface ParameterUsageDiagnostic {
  severity: monacoEditor.MarkerSeverity
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
  message: string
  code?: string
  tags?: monacoEditor.MarkerTag[]
}

export interface ParameterDefinition {
  name: string
  type?: string
  description?: string
  required?: boolean
  default?: unknown
  lineNumber: number
  column: number
}

export interface ParameterReference {
  name: string
  lineNumber: number
  column: number
  context: string // The surrounding text for context
}

/**
 * Extract parameter definitions from YAML frontmatter
 */
export function extractParameterDefinitions(
  yamlContent: string,
  fullContent: string
): ParameterDefinition[] {
  const definitions: ParameterDefinition[] = []
  const lines = yamlContent.split(/\r?\n/)

  let inParametersSection = false
  let parametersIndent = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Check if we're entering parameters section
    if (line.match(/^\s*parameters:\s*$/)) {
      inParametersSection = true
      parametersIndent = line.search(/\S/)
      continue
    }

    // Check if we've left parameters section (new key at same or lower indent)
    if (inParametersSection && line.trim() !== '') {
      const currentIndent = line.search(/\S/)
      if (currentIndent !== -1 && currentIndent <= parametersIndent && !line.match(/^\s*-/)) {
        inParametersSection = false
      }
    }

    if (inParametersSection) {
      // Array format: "  - name: paramName"
      const arrayMatch = line.match(/^\s*-\s*name:\s*["']?(\w+)["']?/)
      if (arrayMatch) {
        const name = arrayMatch[1]
        const lineNumber = fullContent.split('\n').findIndex(l => l.includes(line)) + 1
        const column = line.indexOf(name) + 1

        definitions.push({
          name,
          lineNumber,
          column,
          type: undefined,
          description: undefined,
          required: false
        })
        continue
      }

      // Object format (multiline): "  paramName:" on its own line
      const objectMultilineMatch = line.match(/^\s+([a-zA-Z_][a-zA-Z0-9_]*):\s*$/)
      if (objectMultilineMatch) {
        const name = objectMultilineMatch[1]
        const lineNumber = fullContent.split('\n').findIndex(l => l.includes(line)) + 1
        const column = line.indexOf(name) + 1

        definitions.push({
          name,
          lineNumber,
          column,
          type: undefined,
          description: undefined,
          required: false
        })
        continue
      }

      // Inline object format: "  paramName: { type: string }"
      const inlineObjectMatch = line.match(/^\s+([a-zA-Z_][a-zA-Z0-9_]*):\s*\{/)
      if (inlineObjectMatch) {
        const name = inlineObjectMatch[1]
        const lineNumber = fullContent.split('\n').findIndex(l => l.includes(line)) + 1
        const column = line.indexOf(name) + 1

        definitions.push({
          name,
          lineNumber,
          column,
          type: undefined,
          description: undefined,
          required: false
        })
        continue
      }
    }
  }

  return definitions
}

/**
 * Extract parameter references from body content
 */
export function extractParameterReferences(
  bodyContent: string,
  bodyStartLine: number
): ParameterReference[] {
  const references: ParameterReference[] = []
  const lines = bodyContent.split(/\r?\n/)

  // Find {{ var }} style references
  const templateVarRegex = /\{\{\s*(\w+(?:\.\w+)*)\s*(?:\|[^}]*)?\}\}/g

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    let match: RegExpExecArray | null

    while ((match = templateVarRegex.exec(line)) !== null) {
      const fullRef = match[1] // e.g., "user.name" or "count"
      const rootVar = fullRef.split('.')[0] // e.g., "user" or "count"

      references.push({
        name: rootVar,
        lineNumber: bodyStartLine + i,
        column: match.index + 1,
        context: line.trim()
      })
    }
  }

  // Also find {% set var = ... %} and {% for var in ... %} declarations
  // These create implicit parameter-like variables
  const setVarRegex = /\{%-?\s*set\s+(\w+)\s*=/g
  const forLoopRegex = /\{%-?\s*for\s+(\w+)\s+in\s+/g

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Check for set variables
    let setMatch: RegExpExecArray | null
    while ((setMatch = setVarRegex.exec(line)) !== null) {
      references.push({
        name: setMatch[1],
        lineNumber: bodyStartLine + i,
        column: setMatch.index + 1,
        context: line.trim()
      })
    }

    // Check for loop variables
    let forMatch: RegExpExecArray | null
    while ((forMatch = forLoopRegex.exec(line)) !== null) {
      references.push({
        name: forMatch[1],
        lineNumber: bodyStartLine + i,
        column: forMatch.index + 1,
        context: line.trim()
      })
    }
  }

  return references
}

/**
 * Analyze parameter usage and return diagnostics
 */
export function analyzeParameterUsage(
  document: string,
  monaco: typeof monacoEditor
): ParameterUsageDiagnostic[] {
  const diagnostics: ParameterUsageDiagnostic[] = []

  // Parse frontmatter
  const frontmatterMatch = document.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!frontmatterMatch) {
    return diagnostics // No frontmatter, no analysis
  }

  const yamlContent = frontmatterMatch[1]
  const bodyMatch = document.match(/---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/)
  const bodyContent = bodyMatch ? bodyMatch[1] : ''
  const bodyStartLine = document.substring(0, document.indexOf(bodyContent)).split('\n').length

  // Extract definitions and references
  const definitions = extractParameterDefinitions(yamlContent, document)
  const references = extractParameterReferences(bodyContent, bodyStartLine)

  // Create sets for quick lookup
  const definedParams = new Set(definitions.map(d => d.name))
  const referencedParams = new Set(references.map(r => r.name))

  // Built-in variables that shouldn't be flagged as undefined
  const builtInVars = new Set([
    'env',      // Environment variables ({{ env.VAR }})
    'loop',     // Nunjucks loop variable
    'range',    // Nunjucks range function
    'joiner',   // Nunjucks joiner function
    'cycler'    // Nunjucks cycler function
  ])

  // Template-defined variables (from {% set %} and {% for %})
  const templateDefined = new Set<string>()
  const setVarPattern = /\{%-?\s*set\s+(\w+)\s*=/g
  const forLoopPattern = /\{%-?\s*for\s+(\w+)\s+in\s+/g

  for (const match of bodyContent.matchAll(setVarPattern)) {
    templateDefined.add(match[1])
  }
  for (const match of bodyContent.matchAll(forLoopPattern)) {
    templateDefined.add(match[1])
    templateDefined.add('loop') // Loop helpers
  }

  // Find unused parameters (defined but never referenced)
  for (const def of definitions) {
    // Check if parameter is used in body
    const isUsed = references.some(ref => ref.name === def.name)

    if (!isUsed) {
      diagnostics.push({
        severity: monaco.MarkerSeverity.Hint,
        startLineNumber: def.lineNumber,
        startColumn: def.column,
        endLineNumber: def.lineNumber,
        endColumn: def.column + def.name.length,
        message: `Parameter '${def.name}' is defined but never used in the prompt body`,
        code: 'unused-parameter',
        tags: [monaco.MarkerTag.Unnecessary]
      })
    }
  }

  // Find missing parameters (referenced but not defined)
  const seenUndefined = new Set<string>()

  for (const ref of references) {
    // Skip if:
    // - Already defined in parameters
    // - Built-in variable
    // - Template-defined variable ({% set %} or {% for %})
    // - Already reported
    if (
      definedParams.has(ref.name) ||
      builtInVars.has(ref.name) ||
      templateDefined.has(ref.name) ||
      seenUndefined.has(ref.name)
    ) {
      continue
    }

    seenUndefined.add(ref.name)

    diagnostics.push({
      severity: monaco.MarkerSeverity.Error,
      startLineNumber: ref.lineNumber,
      startColumn: ref.column,
      endLineNumber: ref.lineNumber,
      endColumn: ref.column + ref.name.length + 4, // Include {{ }}
      message: `Parameter '${ref.name}' is not defined in frontmatter parameters section. Add it to the parameters list.`,
      code: 'undefined-parameter'
    })
  }

  return diagnostics
}

/**
 * Get parameter usage statistics
 */
export function getParameterUsageStats(document: string): {
  totalDefined: number
  totalReferenced: number
  unusedCount: number
  undefinedCount: number
  definitions: ParameterDefinition[]
  references: ParameterReference[]
} {
  const frontmatterMatch = document.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!frontmatterMatch) {
    return {
      totalDefined: 0,
      totalReferenced: 0,
      unusedCount: 0,
      undefinedCount: 0,
      definitions: [],
      references: []
    }
  }

  const yamlContent = frontmatterMatch[1]
  const bodyMatch = document.match(/---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/)
  const bodyContent = bodyMatch ? bodyMatch[1] : ''
  const bodyStartLine = document.substring(0, document.indexOf(bodyContent)).split('\n').length

  const definitions = extractParameterDefinitions(yamlContent, document)
  const references = extractParameterReferences(bodyContent, bodyStartLine)

  const definedParams = new Set(definitions.map(d => d.name))
  const referencedParams = new Set(references.map(r => r.name))

  const unusedCount = definitions.filter(def => !referencedParams.has(def.name)).length
  const undefinedCount = Array.from(referencedParams).filter(ref => !definedParams.has(ref)).length

  return {
    totalDefined: definitions.length,
    totalReferenced: referencedParams.size,
    unusedCount,
    undefinedCount,
    definitions,
    references
  }
}

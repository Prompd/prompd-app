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
  let parameterLevelIndent = -1 // Track the indentation level for parameter names

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Check if we're entering parameters section
    if (line.match(/^\s*parameters:\s*$/)) {
      inParametersSection = true
      parametersIndent = line.search(/\S/)
      parameterLevelIndent = -1 // Reset parameter level
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
      const currentIndent = line.search(/\S/)

      // Set parameter level indent on first parameter encountered
      if (parameterLevelIndent === -1 && currentIndent > parametersIndent && line.trim() !== '') {
        parameterLevelIndent = currentIndent
      }

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

      // Known parameter property names that should never be detected as parameters
      // Currently supported in .prmd format:
      const parameterProperties = new Set([
        'name', 'type', 'required', 'description',
        'items', 'enum', 'default', 'properties'
        // Future/common JSON Schema properties (not yet supported):
        // 'min', 'max', 'minLength', 'maxLength', 'pattern', 'format',
        // 'additionalProperties', 'examples'
      ])

      // Object format - only match at parameter level indent, not nested properties
      // This prevents matching "default:", "type:", "description:" etc. as parameter names
      if (parameterLevelIndent !== -1 && currentIndent === parameterLevelIndent) {
        // Object format (multiline): "  paramName:" on its own line
        const objectMultilineMatch = line.match(/^\s+([a-zA-Z_][a-zA-Z0-9_]*):\s*$/)
        if (objectMultilineMatch) {
          const name = objectMultilineMatch[1]

          // Skip if this is a known parameter property name
          if (parameterProperties.has(name)) {
            continue
          }

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

          // Skip if this is a known parameter property name
          if (parameterProperties.has(name)) {
            continue
          }

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

  // Find variables used in control structures
  // {% for item in collection %} - collection is used (item is defined by loop)
  // {% set var = expression %} - variables in expression are used (var is defined)
  // {% if condition %} - variables in condition are used
  const forLoopRegex = /\{%-?\s*for\s+(\w+)\s+in\s+(\w+(?:\.\w+)*)/g
  const setVarRegex = /\{%-?\s*set\s+\w+\s*=\s*(.+?)\s*%\}/g
  const ifRegex = /\{%-?\s*(?:if|elif)\s+(.+?)\s*%\}/g

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Find for loops - extract the COLLECTION being iterated over (not the loop variable)
    let forMatch: RegExpExecArray | null
    while ((forMatch = forLoopRegex.exec(line)) !== null) {
      const collection = forMatch[2] // e.g., "items" or "stakeholders"
      const rootVar = collection.split('.')[0] // Handle nested like "config.items"

      references.push({
        name: rootVar,
        lineNumber: bodyStartLine + i,
        column: line.indexOf(collection) + 1,
        context: line.trim()
      })
    }

    // Find set statements - extract variables from the right-hand side expression
    let setMatch: RegExpExecArray | null
    while ((setMatch = setVarRegex.exec(line)) !== null) {
      const expression = setMatch[1]
      // Find all {{ var }} references in the expression
      const varMatches = expression.matchAll(/\{\{\s*(\w+(?:\.\w+)*)\s*(?:\|[^}]*)?\}\}/g)
      for (const varMatch of varMatches) {
        const fullRef = varMatch[1]
        const rootVar = fullRef.split('.')[0]
        references.push({
          name: rootVar,
          lineNumber: bodyStartLine + i,
          column: line.indexOf(varMatch[0]) + 1,
          context: line.trim()
        })
      }
      // Also check for plain variable references (without {{ }})
      // Use negative lookbehind to avoid matching property names after dots
      const plainVarMatches = expression.matchAll(/(?<!\.)\b([a-zA-Z_]\w*)(?:\.\w+)*/g)
      for (const plainMatch of plainVarMatches) {
        const varName = plainMatch[1]
        // Skip keywords and built-ins
        if (!['true', 'false', 'null', 'none', 'True', 'False', 'None'].includes(varName)) {
          references.push({
            name: varName,
            lineNumber: bodyStartLine + i,
            column: line.indexOf(plainMatch[0]) + 1,
            context: line.trim()
          })
        }
      }
    }

    // Find if/elif statements - extract variables from the condition
    let ifMatch: RegExpExecArray | null
    while ((ifMatch = ifRegex.exec(line)) !== null) {
      const condition = ifMatch[1]

      // Remove quoted strings from condition to avoid matching string literals
      const conditionWithoutStrings = condition.replace(/"[^"]*"|'[^']*'/g, '""')

      // Find all variable references in the condition
      // Use negative lookbehind (?<!\.) to avoid matching property names after dots
      // This ensures "team_roles.developer" only matches "team_roles", not "developer"
      const varMatches = conditionWithoutStrings.matchAll(/(?<!\.)\b([a-zA-Z_]\w*)(?:\.\w+)*/g)
      for (const varMatch of varMatches) {
        const varName = varMatch[1]
        // Skip keywords and operators
        if (!['and', 'or', 'not', 'in', 'is', 'true', 'false', 'null', 'none', 'True', 'False', 'None'].includes(varName)) {
          references.push({
            name: varName,
            lineNumber: bodyStartLine + i,
            column: line.indexOf(varMatch[0]) + 1,
            context: line.trim()
          })
        }
      }
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

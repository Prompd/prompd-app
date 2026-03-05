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
    // Skip comment lines — they shouldn't trigger section exit
    if (inParametersSection && line.trim() !== '' && !line.trim().startsWith('#')) {
      const currentIndent = line.search(/\S/)
      if (currentIndent !== -1 && currentIndent <= parametersIndent && !line.match(/^\s*-/)) {
        inParametersSection = false
      }
    }

    if (inParametersSection) {
      // Skip comment lines inside parameters section
      if (line.trim().startsWith('#')) continue

      const currentIndent = line.search(/\S/)

      // Set parameter level indent on first parameter encountered
      if (parameterLevelIndent === -1 && currentIndent > parametersIndent && line.trim() !== '') {
        parameterLevelIndent = currentIndent
      }

      // Array format: "  - name: paramName"
      // Only match at the parameter level indent to avoid matching nested
      // "- name:" entries inside complex default values
      const arrayMatch = line.match(/^\s*-\s*name:\s*["']?(\w+)["']?/)
      if (arrayMatch && (parameterLevelIndent === -1 || currentIndent === parameterLevelIndent)) {
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
 * Extract parameter references from YAML frontmatter string values.
 * Fields like system:, user:, task: can contain {{ param }} template content.
 */
function extractFrontmatterParameterReferences(
  yamlContent: string,
  fullContent: string
): ParameterReference[] {
  const references: ParameterReference[] = []

  // Parse YAML to find string values containing {{ param }} references
  try {
    const parsed = parseYAML(yamlContent)
    if (!parsed || typeof parsed !== 'object') return references

    // Collect all string values from the YAML (excluding the parameters section itself)
    const stringValues: Array<{ value: string; key: string }> = []

    const collectStrings = (obj: Record<string, unknown>, parentKey = '') => {
      for (const [key, value] of Object.entries(obj)) {
        if (key === 'parameters') continue // Skip parameter definitions
        const fullKey = parentKey ? `${parentKey}.${key}` : key
        if (typeof value === 'string') {
          stringValues.push({ value, key: fullKey })
        } else if (Array.isArray(value)) {
          for (const item of value) {
            if (typeof item === 'string') {
              stringValues.push({ value: item, key: fullKey })
            } else if (item && typeof item === 'object') {
              collectStrings(item as Record<string, unknown>, fullKey)
            }
          }
        } else if (value && typeof value === 'object') {
          collectStrings(value as Record<string, unknown>, fullKey)
        }
      }
    }
    collectStrings(parsed)

    // Scan each string value for {{ param }} references
    const templateVarRegex = /\{\{\s*(\w+(?:\.\w+)*)\s*(?:\|[^}]*)?\}\}/g
    for (const { value } of stringValues) {
      let match: RegExpExecArray | null
      while ((match = templateVarRegex.exec(value)) !== null) {
        const fullRef = match[1]
        const parts = fullRef.split('.')
        const rootVar = parts[0]

        // Find approximate line number in the full content
        const lineNumber = fullContent.split('\n').findIndex(l => l.includes(match![0])) + 1

        references.push({
          name: rootVar,
          lineNumber: lineNumber > 0 ? lineNumber : 1,
          column: 1,
          context: `frontmatter: ${value.substring(0, 60)}`
        })

        // workflow.paramName proxies to the parameter
        if (rootVar === 'workflow' && parts.length > 1) {
          references.push({
            name: parts[1],
            lineNumber: lineNumber > 0 ? lineNumber : 1,
            column: 1,
            context: `frontmatter: ${value.substring(0, 60)}`
          })
        }
      }
    }
  } catch {
    // YAML parse error — skip frontmatter scanning
  }

  return references
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
      const parts = fullRef.split('.')
      const rootVar = parts[0] // e.g., "user" or "count"

      references.push({
        name: rootVar,
        lineNumber: bodyStartLine + i,
        column: match.index + 1,
        context: line.trim()
      })

      // workflow.paramName proxies to the parameter — count paramName as used
      if (rootVar === 'workflow' && parts.length > 1) {
        references.push({
          name: parts[1],
          lineNumber: bodyStartLine + i,
          column: match.index + 1,
          context: line.trim()
        })
      }
    }
  }

  // Find variables used in control structures
  // {% for item in collection %} - collection is used (item is defined by loop)
  // {% set var = expression %} - variables in expression are used (var is defined)
  // {% if condition %} - variables in condition are used
  // Matches single var and tuple unpacking: {% for key, value in dict %}
  const forLoopRegex = /\{%-?\s*for\s+[\w,\s]+?\s+in\s+\[?\s*(\w+(?:\.\w+)*)\s*\]?/g
  const setVarRegex = /\{%-?\s*set\s+\w+\s*=\s*(.+?)\s*%\}/g
  const ifRegex = /\{%-?\s*(?:if|elif)\s+(.+?)\s*%\}/g

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Find for loops - extract the COLLECTION being iterated over (not the loop variable)
    let forMatch: RegExpExecArray | null
    while ((forMatch = forLoopRegex.exec(line)) !== null) {
      const collection = forMatch[1] // e.g., "items" or "stakeholders"
      const parts = collection.split('.')
      const rootVar = parts[0] // Handle nested like "config.items"

      references.push({
        name: rootVar,
        lineNumber: bodyStartLine + i,
        column: line.indexOf(collection) + 1,
        context: line.trim()
      })

      // workflow.paramName proxies to the parameter
      if (rootVar === 'workflow' && parts.length > 1) {
        references.push({
          name: parts[1],
          lineNumber: bodyStartLine + i,
          column: line.indexOf(collection) + 1,
          context: line.trim()
        })
      }
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
      // Also skip words after pipe (|) — those are Nunjucks filters, not variables
      const conditionNoFilters = conditionWithoutStrings.replace(/\|\s*\w+/g, '')
      const varMatches = conditionNoFilters.matchAll(/(?<!\.)\b([a-zA-Z_]\w*)(?:\.\w+)*/g)
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
 * Analyze parameter usage and return diagnostics.
 * When inheritedDefinitions are provided (resolved from the parent file),
 * inherited parameters are treated as defined — just like public members
 * in an OOP inheritance chain.
 */
export function analyzeParameterUsage(
  document: string,
  monaco: typeof monacoEditor,
  inheritedDefinitions?: ParameterDefinition[]
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

  // Check if file inherits from another
  const inheritsMatch = yamlContent.match(/^\s*inherits:\s*["']?(.+?)["']?\s*$/m)
  const hasInherits = !!inheritsMatch
  const hasResolvedInherited = inheritedDefinitions && inheritedDefinitions.length > 0

  // Also scan YAML frontmatter string values for {{ param }} references
  // Fields like system:, user:, task: can contain template content
  const yamlParamRefs = extractFrontmatterParameterReferences(yamlContent, document)

  // Extract definitions and references
  const definitions = extractParameterDefinitions(yamlContent, document)
  const bodyReferences = extractParameterReferences(bodyContent, bodyStartLine)
  const references = [...bodyReferences, ...yamlParamRefs]

  // Build the full set of known parameters: local + inherited
  const definedParams = new Set(definitions.map(d => d.name))
  const inheritedParams = new Set(inheritedDefinitions?.map(d => d.name) ?? [])
  const allKnownParams = new Set([...definedParams, ...inheritedParams])
  const referencedParams = new Set(references.map(r => r.name))

  // Built-in variables that shouldn't be flagged as undefined
  const builtInVars = new Set([
    'env',              // Environment variables ({{ env.VAR }})
    'loop',             // Nunjucks loop variable
    'range',            // Nunjucks range function
    'joiner',           // Nunjucks joiner function
    'cycler',           // Nunjucks cycler function
    // Workflow runtime variables (injected by workflowExecutor.ts when .prmd runs in a workflow)
    'workflow',         // Workflow parameters ({{ workflow.param_name }})
    'previous_output',  // Output from connected upstream node
    'previous_step',    // Alias for previous_output
    'input',            // Alias for previous_output in code/transform nodes
  ])

  // Template-defined variables (from {% set %} and {% for %})
  const templateDefined = new Set<string>()
  const setVarPattern = /\{%-?\s*set\s+(\w+)\s*=/g
  // Matches both single var: {% for item in list %} and tuple unpacking: {% for key, value in dict %}
  const forLoopPattern = /\{%-?\s*for\s+([\w,\s]+?)\s+in\s+/g

  for (const match of bodyContent.matchAll(setVarPattern)) {
    templateDefined.add(match[1])
  }
  for (const match of bodyContent.matchAll(forLoopPattern)) {
    // Split on comma to handle tuple unpacking (e.g., "service, owner")
    const vars = match[1].split(',').map(v => v.trim()).filter(Boolean)
    for (const v of vars) {
      templateDefined.add(v)
    }
    templateDefined.add('loop') // Loop helpers
  }

  // Find unused parameters (defined but never referenced)
  // Skip when file inherits — child params are passed to the parent template
  // during compilation and we can't validate usage without the full chain
  if (!hasInherits) {
    for (const def of definitions) {
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
  }

  // Find missing parameters (referenced but not defined — locally or inherited)
  const seenUndefined = new Set<string>()

  for (const ref of references) {
    if (
      allKnownParams.has(ref.name) ||
      builtInVars.has(ref.name) ||
      templateDefined.has(ref.name) ||
      seenUndefined.has(ref.name)
    ) {
      continue
    }

    seenUndefined.add(ref.name)

    if (hasInherits && !hasResolvedInherited) {
      // Inherits but we couldn't resolve the parent file — suppress entirely.
      // We can't verify whether the param exists in the parent, so trust the
      // inheritance declaration rather than showing noisy false-positive hints.
      continue
    } else if (hasInherits && hasResolvedInherited) {
      // We resolved the parent but this param isn't in local or inherited
      diagnostics.push({
        severity: monaco.MarkerSeverity.Warning,
        startLineNumber: ref.lineNumber,
        startColumn: ref.column,
        endLineNumber: ref.lineNumber,
        endColumn: ref.column + ref.name.length + 4,
        message: `Parameter '${ref.name}' is not defined locally or in inherited '${inheritsMatch![1]}'.`,
        code: 'undefined-parameter'
      })
    } else {
      diagnostics.push({
        severity: monaco.MarkerSeverity.Warning,
        startLineNumber: ref.lineNumber,
        startColumn: ref.column,
        endLineNumber: ref.lineNumber,
        endColumn: ref.column + ref.name.length + 4,
        message: `Parameter '${ref.name}' is not defined in frontmatter parameters section. Add it to the parameters list.`,
        code: 'undefined-parameter'
      })
    }
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

  const yamlParamRefs = extractFrontmatterParameterReferences(yamlContent, document)
  const definitions = extractParameterDefinitions(yamlContent, document)
  const bodyReferences = extractParameterReferences(bodyContent, bodyStartLine)
  const references = [...bodyReferences, ...yamlParamRefs]

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

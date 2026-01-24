/**
 * Context detection for IntelliSense
 */
import type * as monacoEditor from 'monaco-editor'
import type { Context, HoverContext } from './types'

/**
 * Detect the current editing context for completion suggestions
 */
export function detectContext(text: string, lineNumber: number, column: number): Context {
  const lines = text.split('\n')
  const currentLine = lines[lineNumber - 1] || ''
  const beforeCursor = currentLine.substring(0, column - 1)

  // Strip YAML comments from current line for better detection
  const lineWithoutComment = currentLine.split('#')[0]
  const beforeCursorClean = lineWithoutComment.substring(0, Math.min(column - 1, lineWithoutComment.length))

  // Check if we're in YAML frontmatter (between first two ---)
  let inFrontmatter = false
  let frontmatterStartLine = -1
  let frontmatterEndLine = -1

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      if (frontmatterStartLine === -1) {
        frontmatterStartLine = i + 1
      } else {
        frontmatterEndLine = i + 1
        break
      }
    }
  }

  inFrontmatter = lineNumber > frontmatterStartLine && lineNumber < frontmatterEndLine

  if (inFrontmatter) {
    // Remove quotes to handle both quoted and unquoted values
    const cleanLine = beforeCursorClean.replace(/["']/g, '')

    // Check for specific fields with improved detection
    if (cleanLine.match(/^\s*provider:\s*\w*$/)) {
      return { type: 'frontmatter', field: 'provider' }
    }
    if (cleanLine.match(/^\s*model:\s*\w*$/)) {
      return { type: 'frontmatter', field: 'model' }
    }

    // Detect 'using:' array context more accurately
    if (cleanLine.match(/^\s*using:\s*$/)) {
      return { type: 'frontmatter', field: 'using' }
    }

    // In using array - detect list items
    const usingMatch = beforeCursorClean.match(/^\s*-\s*["']?(@[\w/-]*@?[\w.-]*)["']?$/)
    if (usingMatch || (currentLine.match(/^\s*-\s/) && !currentLine.includes(':'))) {
      // Look back to find if we're in a 'using:' section
      for (let i = lineNumber - 2; i >= frontmatterStartLine - 1; i--) {
        if (lines[i].match(/^\s*using:\s*$/)) {
          const match = beforeCursorClean.match(/@([\w/-]*)$/)
          return { type: 'using', query: match?.[1] || '' }
        }
        // Stop if we hit another top-level key
        if (lines[i].match(/^\w+:/)) break
      }
    }

    // Inherits field
    if (cleanLine.match(/inherits:\s*/)) {
      const match = cleanLine.match(/inherits:\s*["']?(@[\w/-@.-]*)["']?$/)
      return { type: 'inherits', query: match?.[1]?.replace('@', '') || '' }
    }

    // Context field - file paths
    if (cleanLine.match(/context:\s*$/)) {
      return { type: 'frontmatter', field: 'context' }
    }

    // In context array - detect file path list items
    if (currentLine.match(/^\s*-\s/) && !currentLine.includes(':')) {
      // Look back to find if we're in a 'context:' section
      for (let i = lineNumber - 2; i >= frontmatterStartLine - 1; i--) {
        if (lines[i].match(/^\s*context:\s*$/)) {
          const match = beforeCursorClean.match(/["']?([\w./-]*)["']?$/)
          return { type: 'filepath', query: match?.[1] || '' }
        }
        // Stop if we hit another top-level key
        if (lines[i].match(/^\w+:/)) break
      }
    }

    // Detect parameter type field (for type value suggestions like string, integer, etc.)
    // Matches lines like "    type: " or "    type: str" within a parameter definition
    if (cleanLine.match(/^\s+type:\s*\w*$/)) {
      // Check if we're in parameters section - look for either:
      // 1. Array format: "parameters:" followed by "  - name: ..."
      // 2. Object format: "parameters:" followed by "  paramName:"
      for (let i = lineNumber - 2; i >= frontmatterStartLine - 1; i--) {
        const checkLine = lines[i]

        // Found parameters section header
        if (checkLine.match(/^\s*parameters:\s*$/)) {
          const query = cleanLine.match(/type:\s*(\w*)$/)?.[1] || ''
          return { type: 'paramtype', query }
        }

        // Hit a different top-level key - not in parameters
        if (checkLine.match(/^\w+:/) && !checkLine.match(/^\s/)) {
          break
        }
      }
    }

    // Detect if we're inside a parameter definition (for property suggestions)
    // This handles lines like "    description: " or "    required: " within a parameter item
    // Skip if we already matched 'type:' for paramtype context (handled above)
    const isIndentedProperty = cleanLine.match(/^(\s+)(\w*):\s*/)
    const isStartingProperty = cleanLine.match(/^(\s+)(\w*)$/) // Just started typing a property name

    // Don't trigger paramprop if we're on a 'type:' line (that's handled by paramtype)
    const isTypeLine = cleanLine.match(/^\s+type:\s*/)

    if ((isIndentedProperty || isStartingProperty) && !isTypeLine) {
      const indentLevel = (isIndentedProperty?.[1] || isStartingProperty?.[1] || '').length

      // Only consider if we're at proper indentation (4+ spaces typically for param properties)
      if (indentLevel >= 4) {
        // Look back to find if we're in a parameter item within parameters section
        let foundParamItem = false
        let paramItemStartLine = -1
        const existingProps: string[] = []

        for (let i = lineNumber - 2; i >= frontmatterStartLine - 1; i--) {
          const checkLine = lines[i]

          // Found parameters section header - we're definitely in parameters
          if (checkLine.match(/^\s*parameters:\s*$/)) {
            // For object format (paramName: {...}), the param starts at next indented key
            foundParamItem = true
            paramItemStartLine = i + 1
            break
          }

          // Found a parameter list item (- name: ...) - array format
          if (checkLine.match(/^\s+-\s+name:\s*/)) {
            foundParamItem = true
            paramItemStartLine = i
            break
          }

          // Found an object-style parameter definition (  paramName:) - object format
          if (checkLine.match(/^\s{2}\w+:\s*$/)) {
            foundParamItem = true
            paramItemStartLine = i
            break
          }

          // Hit a different top-level key - not in parameters
          if (checkLine.match(/^\w+:/) && !checkLine.match(/^\s/)) {
            break
          }
        }

        if (foundParamItem) {
          // Collect existing properties in this parameter item
          for (let i = paramItemStartLine; i < lineNumber - 1; i++) {
            const propMatch = lines[i].match(/^\s+(\w+):/)
            if (propMatch && propMatch[1] !== 'name') {
              existingProps.push(propMatch[1])
            }
          }

          // Also check the current line if it has a property
          const currentPropMatch = currentLine.match(/^\s+(\w+):/)
          if (currentPropMatch) {
            existingProps.push(currentPropMatch[1])
          }

          const query = isStartingProperty?.[2] || ''
          return { type: 'paramprop', query, existingProps }
        }
      }
    }

    // Check for version completion: @namespace/package@<version>
    if (beforeCursorClean.match(/@[\w/-]+@[\w.-]*$/)) {
      const match = beforeCursorClean.match(/"?@([\w-]+)\/([\w-]+)@([\w.-]*)"?$/)
      if (match) {
        const packageName = `@${match[1]}/${match[2]}`
        return { type: 'version', packageName, query: match[3] || '' }
      }
    }

    // Check for @ symbol (package reference)
    if (beforeCursorClean.match(/@[\w/-]*$/)) {
      const match = beforeCursorClean.match(/@([\w/-]*)$/)
      return { type: 'using', query: match?.[1] || '' }
    }

    return { type: 'frontmatter' }
  }

  // Check for include directive context: {% include "..." %}
  // Provides file path completions for included templates
  // Pattern: {% include " or {% include "./path
  const includeMatch = beforeCursor.match(/\{%\s*include\s+["']([^"']*)$/)
  if (includeMatch) {
    return { type: 'include', query: includeMatch[1] || '' }
  }

  // Check for env var context: {{ env. or {{ env.VAR
  // This provides intellisense for environment variables loaded from .env files
  // Jinja2/Nunjucks syntax: {{ env.VAR_NAME }}
  const envVarMatch = beforeCursor.match(/\{\{\s*env\.(\w*)$/)
  if (envVarMatch) {
    return { type: 'envvar', query: envVarMatch[1] || '' }
  }

  // Check for filter context (after | in template expressions)
  // Pattern: {{ variable | or {% for x in y |
  const filterMatch = beforeCursor.match(/\{\{[^}]*\|\s*(\w*)$/) ||
                      beforeCursor.match(/\{%[^%]*\|\s*(\w*)$/) ||
                      beforeCursor.match(/\|\s*(\w*)$/)
  if (filterMatch) {
    return { type: 'filter', query: filterMatch[1] || '' }
  }

  // Check for section headers (markdown body)
  if (beforeCursor.match(/^#+\s*\w*$/)) {
    return { type: 'section' }
  }

  // Check for variable references - match text after { or {{
  const braceMatch = beforeCursor.match(/\{+(\w*)$/)
  if (braceMatch) {
    return { type: 'variable', query: braceMatch[1] || '' }
  }

  // Check for @ symbol outside frontmatter (less common but possible)
  if (beforeCursor.match(/@[\w/-]*@[\w.-]*$/)) {
    // Version completion: @namespace/package@<version>
    const match = beforeCursor.match(/@([\w/-]+\/)?([\w-]+)@([\w.-]*)$/)
    if (match) {
      const packageName = `@${match[1] || ''}${match[2]}`
      return { type: 'version', packageName, query: match[3] || '' }
    }
  }

  if (beforeCursor.endsWith('@') || beforeCursor.match(/@[\w/-]*$/)) {
    const match = beforeCursor.match(/@([\w/-]*)$/)
    return { type: 'using', query: match?.[1] || '' }
  }

  return { type: 'none' }
}

/**
 * Detect context for hover information
 */
export function detectHoverContext(line: string, word: monacoEditor.editor.IWordAtPosition): HoverContext {
  // Check if word is part of a package reference
  // Pattern: "@scope/package@version" or "@scope/package"
  // Capture both package name and optional version
  const packageRefMatch = line.match(/"(@[a-z0-9-]+\/[a-z0-9-]+)(@[^"/]+)?(?:\/[^"]+)?"/i)
  if (packageRefMatch) {
    // Extract the full package reference with version if present
    const packageName = packageRefMatch[1]
    const version = packageRefMatch[2] // e.g., "@1.1.3" or undefined
    const fullRef = version ? `${packageName}${version}` : packageName
    // Check if the current word is part of this package reference
    if (line.substring(word.startColumn - 1, word.endColumn).includes(word.word)) {
      return { type: 'package', value: fullRef }
    }
  }

  // Fallback: Check if word itself contains @ (legacy behavior)
  if (word.word.includes('@')) {
    return { type: 'package', value: word.word }
  }

  // Check if word is in a filter context (after |)
  const filterMatch = line.match(new RegExp(`\\|\\s*${word.word}\\b`))
  if (filterMatch) {
    return { type: 'filter', value: word.word }
  }

  // Check if hovering over 'env' in {{ env.VAR }}
  if (word.word === 'env' && line.match(/\{\{[-~]?\s*env\./)) {
    return { type: 'envvar', value: 'env' }
  }

  // Check if word is an environment variable reference ({{ env.VAR }})
  // Pattern matches: {{ env.VAR }}, {{env.VAR}}, {{ env.VAR | filter }}, etc.
  // Look for env. followed by the word we're hovering over
  const envVarPattern = new RegExp(`\\{\\{[-~]?\\s*env\\.(${word.word})(?:\\s|\\||\\})`);
  if (envVarPattern.test(line)) {
    return { type: 'envvar', value: word.word }
  }

  // Check if word is inside a Jinja2 expression block {{ ... }}
  // This handles variables like {{ _local }}, {{ my_var }}, etc.
  // Find all {{ ... }} blocks and check if the word appears inside one
  const jinjaExprPattern = /\{\{[-~]?\s*([^}]+?)\s*[-~]?\}\}/g
  let match
  while ((match = jinjaExprPattern.exec(line)) !== null) {
    const exprContent = match[1]
    // Check if the word appears as a standalone identifier in the expression
    // Match word boundaries to avoid partial matches
    const wordPattern = new RegExp(`\\b${word.word}\\b`)
    if (wordPattern.test(exprContent)) {
      // It's a variable inside {{ }}, treat as parameter
      return { type: 'parameter', value: word.word }
    }
  }

  // Check if word is inside a Jinja2/Nunjucks statement block {% ... %}
  // This handles variables in if, for, elif, set, etc.
  // Examples: {% if length == "brief" %}, {% for item in items %}, {% elif style == "bullets" %}
  const jinjaStmtPattern = /\{%[-~]?\s*([^%]+?)\s*[-~]?%\}/g
  while ((match = jinjaStmtPattern.exec(line)) !== null) {
    const stmtContent = match[1]
    // Check if the word appears as a standalone identifier in the statement
    // Match word boundaries to avoid partial matches (don't match keywords like 'if', 'for', etc.)
    const wordPattern = new RegExp(`\\b${word.word}\\b`)
    if (wordPattern.test(stmtContent)) {
      // Skip Nunjucks keywords - they're not variables
      const nunjucksKeywords = new Set([
        'if', 'else', 'elif', 'endif', 'for', 'endfor', 'in', 'set', 'endset',
        'block', 'endblock', 'extends', 'include', 'import', 'from', 'macro',
        'endmacro', 'call', 'endcall', 'filter', 'endfilter', 'raw', 'endraw',
        'autoescape', 'endautoescape', 'with', 'endwith', 'and', 'or', 'not',
        'is', 'as', 'true', 'false', 'none', 'null', 'async'
      ])
      if (!nunjucksKeywords.has(word.word.toLowerCase())) {
        // It's a variable inside {% %}, treat as parameter
        return { type: 'parameter', value: word.word }
      }
    }
  }

  // Check if word is in a simple parameter context {param}
  if (line.includes(`{${word.word}}`)) {
    return { type: 'parameter', value: word.word }
  }

  return { type: 'none', value: word.word }
}

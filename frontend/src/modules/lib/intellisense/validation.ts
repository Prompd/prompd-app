/**
 * Validation and diagnostics for IntelliSense
 */
import type * as monacoEditor from 'monaco-editor'
import { parse as parseYAML } from 'yaml'
import type { CompilationDiagnostic } from '../../../electron.d'
import { getRegistrySync } from './registrySync'
import { analyzeParameterUsage, extractParameterDefinitions } from './crossReference'
import type { ParameterDefinition } from './crossReference'

const LANGUAGE_ID = 'prompd'

// Store file path for compiler diagnostics (set by editor when opening files)
let currentFilePath: string | null = null
// Map of model URI string → file path (for multi-tab support)
const modelFilePathMap = new Map<string, string>()
// Store workspace path for resolving package cache locations
let currentWorkspacePath: string | null = null

// Flag to defer expensive compiler diagnostics on initial load
// This prevents the UI from freezing when opening a file
let deferCompilerDiagnostics = true

/**
 * Set the current file path for compiler diagnostics.
 * This should be called when the editor opens a file from disk.
 */
export function setCurrentFilePath(filePath: string | null) {
  currentFilePath = filePath
  console.log('[intellisense] Current file path set to:', filePath)
}

/**
 * Get the current file path (used by hover provider for resolving relative references)
 */
export function getCurrentFilePath(): string | null {
  return currentFilePath
}

/**
 * Associate a Monaco model URI with a file path (for multi-tab support).
 * This allows validation and code actions to resolve the correct file path
 * per-model rather than relying on the singleton currentFilePath.
 */
export function setModelFilePath(modelUri: string, filePath: string | null) {
  if (filePath) {
    modelFilePathMap.set(modelUri, filePath)
  } else {
    modelFilePathMap.delete(modelUri)
  }
}

/**
 * Get the file path associated with a specific model URI.
 * Falls back to the singleton currentFilePath if no mapping exists.
 */
export function getModelFilePath(modelUri: string): string | null {
  return modelFilePathMap.get(modelUri) ?? currentFilePath
}

/**
 * Set the workspace path for package cache resolution.
 */
export function setWorkspacePath(path: string | null) {
  currentWorkspacePath = path
}

/**
 * Get the current workspace path (used by hover provider for package cache resolution)
 */
export function getWorkspacePath(): string | null {
  return currentWorkspacePath
}

/**
 * Enable compiler diagnostics after initial load is complete.
 * This should be called after Monaco has fully initialized.
 */
export function enableCompilerDiagnostics() {
  deferCompilerDiagnostics = false
  console.log('[intellisense] Compiler diagnostics enabled')
}

/**
 * Resolve inherited parameter definitions from the parent .prmd file.
 * Handles three path formats:
 *   1. Relative paths: ./base.prmd, ../shared/base.prmd
 *   2. Direct package refs: @namespace/package@version/path/to/file.prmd
 *   3. Prefix aliases: @core/prompts/base.prmd (resolved via using: section)
 */
async function resolveInheritedParameters(
  yamlContent: string
): Promise<ParameterDefinition[]> {
  const electronAPI = (window as unknown as Record<string, unknown>).electronAPI as {
    isElectron?: boolean
    readFile?: (path: string) => Promise<{ success: boolean; content?: string; error?: string }>
    readDir?: (path: string) => Promise<{ success: boolean; files?: { name: string; isDirectory: boolean }[] }>
    getHomePath?: () => Promise<string>
  } | undefined

  if (!electronAPI?.readFile) return []

  // Extract inherits: value
  const inheritsMatch = yamlContent.match(/^\s*inherits:\s*["']?(.+?)["']?\s*$/m)
  if (!inheritsMatch) return []
  const inheritsRef = inheritsMatch[1].trim()

  // Build prefix map from using: section
  const prefixMap = new Map<string, string>()
  const usingEntries = Array.from(yamlContent.matchAll(
    /(?:^|\n)\s*-\s*(?:name:\s*["']?(@[\w./@^~*-]+)["']?\s+prefix:\s*["']?(@[\w-]+)["']?|prefix:\s*["']?(@[\w-]+)["']?\s+name:\s*["']?(@[\w./@^~*-]+)["']?)/g
  ))
  for (const entry of usingEntries) {
    const pkg = entry[1] || entry[4]
    const prefix = entry[2] || entry[3]
    if (pkg && prefix) {
      prefixMap.set(prefix, pkg)
    }
  }

  let resolvedFilePath: string | null = null

  // 1. Prefix alias reference (e.g., @core/prompts/base.prmd)
  const prefixMatch = inheritsRef.match(/^(@[\w-]+)\/(.+)$/)
  if (prefixMatch && prefixMap.has(prefixMatch[1])) {
    const pkgRef = prefixMap.get(prefixMatch[1])!
    const subPath = prefixMatch[2]
    resolvedFilePath = await resolvePackagePath(pkgRef, subPath, electronAPI)
  }
  // 2. Direct package reference with version (e.g., @namespace/package@version/path.prmd)
  else if (inheritsRef.startsWith('@') && !prefixMap.has(inheritsRef.split('/')[0])) {
    const versionAt = inheritsRef.indexOf('@', 1)
    if (versionAt > 0) {
      const packageRef = inheritsRef.substring(0, versionAt)
      const rest = inheritsRef.substring(versionAt + 1)
      const slashIdx = rest.indexOf('/')
      const version = slashIdx >= 0 ? rest.substring(0, slashIdx) : rest
      const subPath = slashIdx >= 0 ? rest.substring(slashIdx + 1) : ''
      const fullRef = `${packageRef}@${version}`
      resolvedFilePath = await resolvePackagePath(fullRef, subPath, electronAPI)
    } else {
      // No version specifier: @scope/name/path/to/file.prmd
      // Parse as @scope/name package with remaining path as subpath
      const parts = inheritsRef.split('/')
      if (parts.length >= 3) {
        const packageName = `${parts[0]}/${parts[1]}` // @scope/name
        const subPath = parts.slice(2).join('/')
        resolvedFilePath = await resolvePackagePath(packageName, subPath, electronAPI)
      }
    }
  }
  // 3. Relative path (e.g., ./base.prmd, ../shared/base.prmd)
  else if (currentFilePath) {
    const sep = currentFilePath.includes('\\') ? '\\' : '/'
    const dir = currentFilePath.substring(0, currentFilePath.lastIndexOf(sep))
    resolvedFilePath = `${dir}${sep}${inheritsRef.replace(/\//g, sep)}`
  }

  if (!resolvedFilePath) return []

  // Read the parent file and extract its parameter definitions
  try {
    const result = await electronAPI.readFile(resolvedFilePath)
    if (!result.success || !result.content) return []

    const normalized = result.content.replace(/\r\n/g, '\n')
    const fmMatch = normalized.match(/^---\n([\s\S]*?)\n---/)
    if (!fmMatch) return []

    return extractParameterDefinitions(fmMatch[1], normalized)
  } catch {
    return []
  }
}

/**
 * Resolve a package reference to a file path in the .prompd/cache/ directory.
 * Checks workspace cache first, then global ~/.prompd/cache/.
 */
async function resolvePackagePath(
  pkgRef: string,
  subPath: string,
  electronAPI: {
    readFile?: (path: string) => Promise<{ success: boolean; content?: string; error?: string }>
    readDir?: (path: string) => Promise<{ success: boolean; files?: { name: string; isDirectory: boolean }[] }>
    getHomePath?: () => Promise<string>
  }
): Promise<string | null> {
  // Parse @namespace/name@version
  const versionAt = pkgRef.lastIndexOf('@')
  let packageName: string
  let packageVersion: string
  if (versionAt > 0 && pkgRef[0] === '@') {
    packageName = pkgRef.substring(0, versionAt)
    packageVersion = pkgRef.substring(versionAt + 1)
  } else {
    packageName = pkgRef
    packageVersion = ''
  }

  const nsSlash = packageName.indexOf('/')
  if (nsSlash < 0) return null
  const ns = packageName.substring(1, nsSlash) // strip @
  const name = packageName.substring(nsSlash + 1)

  // Helper: try to find a file inside a cache base path (e.g., .prompd/cache/@ns/name)
  const tryResolveInCache = async (cacheBase: string, sep: string): Promise<string | null> => {
    const pkgDir = [cacheBase, `@${ns}`, name].join(sep)

    if (packageVersion) {
      // Specific version requested — try directly
      const filePath = [pkgDir, packageVersion, subPath].join(sep)
      if (electronAPI.readFile) {
        const check = await electronAPI.readFile(filePath)
        if (check.success) return filePath
      }
    }

    // No version or version not found — scan for available versions
    if (electronAPI.readDir) {
      try {
        const result = await electronAPI.readDir(pkgDir)
        if (!result.success || !result.files) return null
        const versionDirs = result.files
          .filter(e => e.isDirectory)
          .map(e => e.name)
          .sort()
          .reverse() // latest version first (lexicographic approximation)

        for (const ver of versionDirs) {
          const filePath = [pkgDir, ver, subPath].join(sep)
          if (electronAPI.readFile) {
            const check = await electronAPI.readFile(filePath)
            if (check.success) return filePath
          }
        }
      } catch {
        // Directory doesn't exist or can't be read
      }
    }

    return null
  }

  // Try workspace .prompd/cache/ first
  if (currentWorkspacePath) {
    const sep = currentWorkspacePath.includes('\\') ? '\\' : '/'
    const wsCache = [currentWorkspacePath, '.prompd', 'cache'].join(sep)
    const result = await tryResolveInCache(wsCache, sep)
    if (result) return result

    // Also try .prompd/packages/ (installed packages directory)
    const wsPkgs = [currentWorkspacePath, '.prompd', 'packages'].join(sep)
    const pkgResult = await tryResolveInCache(wsPkgs, sep)
    if (pkgResult) return pkgResult
  }

  // Fall back to global ~/.prompd/cache/ and ~/.prompd/packages/
  try {
    if (electronAPI.getHomePath) {
      const homePath = await electronAPI.getHomePath()
      const sep = homePath.includes('\\') ? '\\' : '/'

      const globalCache = [homePath, '.prompd', 'cache'].join(sep)
      const result = await tryResolveInCache(globalCache, sep)
      if (result) return result

      const globalPkgs = [homePath, '.prompd', 'packages'].join(sep)
      const pkgResult = await tryResolveInCache(globalPkgs, sep)
      if (pkgResult) return pkgResult
    }
  } catch {
    // Can't resolve home path
  }

  return null
}

/**
 * Common YAML error patterns and their user-friendly messages
 */
const YAML_ERROR_PATTERNS: Array<{
  pattern: RegExp
  getMessage: (match: RegExpMatchArray, line: string) => string
}> = [
  {
    // Tabs instead of spaces
    pattern: /bad indentation.*tab/i,
    getMessage: () => 'YAML does not allow tabs for indentation. Use spaces instead.'
  },
  {
    // Inconsistent indentation
    pattern: /bad indentation/i,
    getMessage: () => 'Inconsistent indentation. Use consistent spacing (2 or 4 spaces) for nested items.'
  },
  {
    // Missing colon after key
    pattern: /expected.*:/i,
    getMessage: (_, line) => `Missing colon after key. Format should be "key: value". Found: "${line.trim()}"`
  },
  {
    // Unquoted special characters
    pattern: /can not read a block mapping entry/i,
    getMessage: () => 'Value contains special characters that need quoting. Wrap the value in quotes: "value"'
  },
  {
    // Duplicate keys
    pattern: /duplicate.*key/i,
    getMessage: (match) => `Duplicate key found. Each key must be unique within the same level.`
  },
  {
    // Invalid escape sequence
    pattern: /unknown escape/i,
    getMessage: () => 'Invalid escape sequence in string. Use double backslash \\\\ or switch to single quotes.'
  },
  {
    // Unclosed quote
    pattern: /unterminated|unclosed.*quote|unexpected end.*string/i,
    getMessage: () => 'Unclosed quote. Make sure all quotes are properly closed.'
  },
  {
    // Invalid anchor/alias
    pattern: /anchor|alias/i,
    getMessage: () => 'Invalid YAML anchor or alias syntax.'
  },
  {
    // Flow sequence/mapping issues
    pattern: /expected.*\]|\[|flow/i,
    getMessage: () => 'Invalid inline array/object syntax. Check brackets [] or braces {} are balanced.'
  }
]

/**
 * Validate YAML content and return detailed, user-friendly error markers
 */
function validateYamlContent(
  yamlContent: string,
  fullContent: string,
  model: monacoEditor.editor.ITextModel,
  monaco: typeof monacoEditor
): monacoEditor.editor.IMarkerData[] {
  const markers: monacoEditor.editor.IMarkerData[] = []
  const lines = yamlContent.split('\n')

  // Pre-parse checks for common issues (before running the YAML parser)

  // Check for tabs (YAML doesn't allow tabs for indentation)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const tabIndex = line.indexOf('\t')
    if (tabIndex !== -1 && line.substring(0, tabIndex).trim() === '') {
      // Tab is being used for indentation
      markers.push({
        severity: monaco.MarkerSeverity.Error,
        startLineNumber: i + 2, // +2 for 1-indexed and skip opening ---
        startColumn: tabIndex + 1,
        endLineNumber: i + 2,
        endColumn: tabIndex + 2,
        message: 'Tab character found. YAML requires spaces for indentation, not tabs.',
        code: 'yaml-tab-indent'
      })
    }
  }

  // Check for missing colons in key-value pairs
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Skip empty lines, comments, and array items
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue

    // Check if line looks like a key but has no colon
    if (/^[a-zA-Z_][a-zA-Z0-9_]*\s*[^:]/.test(trimmed) && !trimmed.includes(':')) {
      // Looks like a key without colon
      const keyMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/)
      if (keyMatch) {
        markers.push({
          severity: monaco.MarkerSeverity.Warning,
          startLineNumber: i + 2,
          startColumn: line.indexOf(keyMatch[1]) + 1,
          endLineNumber: i + 2,
          endColumn: line.indexOf(keyMatch[1]) + keyMatch[1].length + 1,
          message: `'${keyMatch[1]}' looks like a key but is missing a colon. Did you mean '${keyMatch[1]}:'?`,
          code: 'yaml-missing-colon'
        })
      }
    }
  }

  // Check for unquoted special values that might cause issues
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) continue

    const value = line.substring(colonIndex + 1).trim()

    // Skip if already quoted or empty
    if (!value || value.startsWith('"') || value.startsWith("'") || value.startsWith('|') || value.startsWith('>')) continue

    // Check if value is a valid inline JSON object/array (YAML flow syntax)
    const isValidFlowSyntax =
      (value.startsWith('{') && value.endsWith('}')) ||  // JSON object: {"key": "value"}
      (value.startsWith('[') && value.endsWith(']'))     // JSON array: ["item1", "item2"]

    // Check for values that might need quoting
    const needsQuoting = [
      // Values starting with special characters
      /^[@!&*#%`]/.test(value),
      // Values containing colons (except in URLs or inside flow syntax)
      value.includes(':') && !value.match(/^https?:/) && !isValidFlowSyntax,
      // Values with braces or brackets that aren't valid flow syntax
      (/[\[{}\]]/.test(value) && !isValidFlowSyntax),
      // Values that look like booleans but might not be intended as such
      /^(yes|no|on|off|y|n)$/i.test(value)
    ].some(Boolean)

    if (needsQuoting) {
      markers.push({
        severity: monaco.MarkerSeverity.Info,
        startLineNumber: i + 2,
        startColumn: colonIndex + 2,
        endLineNumber: i + 2,
        endColumn: line.length + 1,
        message: `Value "${value.substring(0, 30)}${value.length > 30 ? '...' : ''}" contains special characters. Consider wrapping in quotes to avoid parsing issues.`,
        code: 'yaml-unquoted-special'
      })
    }
  }

  // Now try to parse with the YAML library to catch syntax errors
  try {
    parseYAML(yamlContent)
  } catch (e: unknown) {
    const error = e as Error
    const errorMessage = error?.message ?? String(e)

    // Try to extract line/column from the error
    let errorLine = 2 // Default to line 2 (first line after opening ---)
    let errorColumn = 1

    // yaml library format: "at line X, column Y"
    const lineMatch = errorMessage.match(/at line (\d+)(?:,?\s*column (\d+))?/i)
    if (lineMatch) {
      errorLine = parseInt(lineMatch[1], 10) + 1 // +1 for opening ---
      if (lineMatch[2]) {
        errorColumn = parseInt(lineMatch[2], 10)
      }
    }

    // Get the offending line for context
    const offendingLine = lines[errorLine - 2] || '' // -2 to account for offset

    // Try to provide a more user-friendly message
    let friendlyMessage = errorMessage

    for (const { pattern, getMessage } of YAML_ERROR_PATTERNS) {
      if (pattern.test(errorMessage)) {
        friendlyMessage = getMessage(errorMessage.match(pattern)!, offendingLine)
        break
      }
    }

    // Clean up the error message (remove file path references, etc.)
    friendlyMessage = friendlyMessage
      .replace(/at position \d+/g, '')
      .replace(/\s+/g, ' ')
      .trim()

    markers.push({
      severity: monaco.MarkerSeverity.Error,
      startLineNumber: errorLine,
      startColumn: errorColumn,
      endLineNumber: errorLine,
      endColumn: model.getLineMaxColumn(errorLine) || errorColumn + 1,
      message: `YAML: ${friendlyMessage}`,
      code: 'yaml-syntax-error'
    })
  }

  return markers
}

/**
 * Validate code blocks in the body content for basic syntax errors.
 * Checks for common issues in TypeScript/JavaScript, Python, JSON, and other languages.
 */
function validateCodeBlocks(
  body: string,
  bodyStartOffset: number,
  fullContent: string,
  markers: monacoEditor.editor.IMarkerData[],
  monaco: typeof monacoEditor
) {
  // Find all fenced code blocks
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g
  let match: RegExpExecArray | null

  while ((match = codeBlockRegex.exec(body)) !== null) {
    const language = match[1].toLowerCase()
    const code = match[2]
    const blockStartIndex = bodyStartOffset + match.index
    const codeStartIndex = blockStartIndex + 4 + match[1].length // After ```lang\n

    // Calculate starting line of code content
    const codeStartLine = fullContent.substring(0, codeStartIndex).split('\n').length

    // Validate based on language
    if (['typescript', 'ts', 'javascript', 'js', 'jsx', 'tsx'].includes(language)) {
      validateJavaScriptSyntax(code, codeStartLine, markers, monaco, language)
    } else if (['json', 'jsonc'].includes(language)) {
      validateJsonSyntax(code, codeStartLine, markers, monaco)
    } else if (['python', 'py'].includes(language)) {
      validatePythonSyntax(code, codeStartLine, markers, monaco)
    } else if (['yaml', 'yml'].includes(language)) {
      validateYamlBlockSyntax(code, codeStartLine, markers, monaco)
    }
  }
}

/**
 * Basic JavaScript/TypeScript syntax validation
 */
function validateJavaScriptSyntax(
  code: string,
  startLine: number,
  markers: monacoEditor.editor.IMarkerData[],
  monaco: typeof monacoEditor,
  language: string
) {
  const lines = code.split('\n')

  // Track bracket/brace/paren balance
  let braces = 0
  let brackets = 0
  let parens = 0
  let inString: string | null = null
  let inTemplate = false
  let inMultiLineComment = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNumber = startLine + i

    for (let j = 0; j < line.length; j++) {
      const char = line[j]
      const prev = j > 0 ? line[j - 1] : ''
      const next = j < line.length - 1 ? line[j + 1] : ''

      // Handle multi-line comments
      if (!inString && !inTemplate) {
        if (char === '/' && next === '*' && !inMultiLineComment) {
          inMultiLineComment = true
          j++
          continue
        }
        if (char === '*' && next === '/' && inMultiLineComment) {
          inMultiLineComment = false
          j++
          continue
        }
      }

      if (inMultiLineComment) continue

      // Handle single-line comments
      if (!inString && !inTemplate && char === '/' && next === '/') {
        break // Rest of line is comment
      }

      // Handle strings
      if (!inString && !inTemplate) {
        if (char === '"' || char === "'") {
          inString = char
          continue
        }
        if (char === '`') {
          inTemplate = true
          continue
        }
      } else if (inString && char === inString && prev !== '\\') {
        inString = null
        continue
      } else if (inTemplate && char === '`' && prev !== '\\') {
        inTemplate = false
        continue
      }

      if (inString || inTemplate) continue

      // Count brackets
      if (char === '{') braces++
      else if (char === '}') braces--
      else if (char === '[') brackets++
      else if (char === ']') brackets--
      else if (char === '(') parens++
      else if (char === ')') parens--

      // Check for negative balance (closing without opening)
      if (braces < 0) {
        markers.push({
          severity: monaco.MarkerSeverity.Error,
          startLineNumber: lineNumber,
          startColumn: j + 1,
          endLineNumber: lineNumber,
          endColumn: j + 2,
          message: `Unexpected closing brace '}'. No matching opening brace.`,
          code: 'js-unmatched-brace'
        })
        braces = 0
      }
      if (brackets < 0) {
        markers.push({
          severity: monaco.MarkerSeverity.Error,
          startLineNumber: lineNumber,
          startColumn: j + 1,
          endLineNumber: lineNumber,
          endColumn: j + 2,
          message: `Unexpected closing bracket ']'. No matching opening bracket.`,
          code: 'js-unmatched-bracket'
        })
        brackets = 0
      }
      if (parens < 0) {
        markers.push({
          severity: monaco.MarkerSeverity.Error,
          startLineNumber: lineNumber,
          startColumn: j + 1,
          endLineNumber: lineNumber,
          endColumn: j + 2,
          message: `Unexpected closing parenthesis ')'. No matching opening parenthesis.`,
          code: 'js-unmatched-paren'
        })
        parens = 0
      }
    }

    // Check for unclosed string at end of line (single/double quotes only)
    if (inString) {
      markers.push({
        severity: monaco.MarkerSeverity.Error,
        startLineNumber: lineNumber,
        startColumn: 1,
        endLineNumber: lineNumber,
        endColumn: line.length + 1,
        message: `Unclosed string. Missing closing ${inString === '"' ? 'double' : 'single'} quote.`,
        code: 'js-unclosed-string'
      })
      inString = null
    }
  }

  // Check for unclosed brackets at end
  if (braces > 0) {
    markers.push({
      severity: monaco.MarkerSeverity.Warning,
      startLineNumber: startLine,
      startColumn: 1,
      endLineNumber: startLine + lines.length - 1,
      endColumn: 1,
      message: `${braces} unclosed brace(s) '{'. Add matching closing brace(s) '}'.`,
      code: 'js-unclosed-braces'
    })
  }
  if (brackets > 0) {
    markers.push({
      severity: monaco.MarkerSeverity.Warning,
      startLineNumber: startLine,
      startColumn: 1,
      endLineNumber: startLine + lines.length - 1,
      endColumn: 1,
      message: `${brackets} unclosed bracket(s) '['. Add matching closing bracket(s) ']'.`,
      code: 'js-unclosed-brackets'
    })
  }
  if (parens > 0) {
    markers.push({
      severity: monaco.MarkerSeverity.Warning,
      startLineNumber: startLine,
      startColumn: 1,
      endLineNumber: startLine + lines.length - 1,
      endColumn: 1,
      message: `${parens} unclosed parenthesis '('. Add matching closing parenthesis ')'.`,
      code: 'js-unclosed-parens'
    })
  }
}

/**
 * JSON syntax validation
 */
function validateJsonSyntax(
  code: string,
  startLine: number,
  markers: monacoEditor.editor.IMarkerData[],
  monaco: typeof monacoEditor
) {
  // Skip validation if the code contains Jinja2 template syntax
  // This allows JSON code blocks with {{ }} or {% %} to pass without errors
  if (code.includes('{{') || code.includes('{%')) {
    return // Skip validation for templated JSON
  }

  try {
    JSON.parse(code)
  } catch (e: unknown) {
    const error = e as SyntaxError
    const message = error.message || 'Invalid JSON'

    // Try to extract position from error message
    let errorLine = startLine
    let errorColumn = 1

    const posMatch = message.match(/position (\d+)/)
    if (posMatch) {
      const pos = parseInt(posMatch[1], 10)
      let charCount = 0
      const lines = code.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (charCount + lines[i].length + 1 > pos) {
          errorLine = startLine + i
          errorColumn = pos - charCount + 1
          break
        }
        charCount += lines[i].length + 1
      }
    }

    // Make error message more user-friendly
    let friendlyMessage = message
    if (message.includes('Unexpected token')) {
      friendlyMessage = message.replace('Unexpected token', 'Unexpected character')
    }
    if (message.includes('Unexpected end')) {
      friendlyMessage = 'JSON is incomplete. Check for missing closing brackets or braces.'
    }

    markers.push({
      severity: monaco.MarkerSeverity.Warning,
      startLineNumber: errorLine,
      startColumn: errorColumn,
      endLineNumber: errorLine,
      endColumn: errorColumn + 1,
      message: `JSON: ${friendlyMessage}`,
      code: 'json-syntax-error'
    })
  }
}

/**
 * Basic Python syntax validation (indentation and common issues)
 */
function validatePythonSyntax(
  code: string,
  startLine: number,
  markers: monacoEditor.editor.IMarkerData[],
  monaco: typeof monacoEditor
) {
  const lines = code.split('\n')
  let expectedIndent = 0
  const indentStack: number[] = [0]

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNumber = startLine + i
    const trimmed = line.trim()

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue

    // Check for tabs mixed with spaces
    if (/^\s*\t/.test(line) && /^\s* /.test(line)) {
      markers.push({
        severity: monaco.MarkerSeverity.Warning,
        startLineNumber: lineNumber,
        startColumn: 1,
        endLineNumber: lineNumber,
        endColumn: line.search(/\S/) + 1,
        message: 'Mixed tabs and spaces in indentation. Use consistent indentation.',
        code: 'python-mixed-indent'
      })
    }

    // Check for unclosed strings
    let inString: string | null = null
    let inTriple = false
    for (let j = 0; j < line.length; j++) {
      const char = line[j]
      const next2 = line.substring(j, j + 3)

      if (!inString) {
        if (next2 === '"""' || next2 === "'''") {
          inString = next2[0]
          inTriple = true
          j += 2
        } else if (char === '"' || char === "'") {
          inString = char
        }
      } else if (inTriple) {
        if (next2 === inString + inString + inString) {
          inString = null
          inTriple = false
          j += 2
        }
      } else if (char === inString && line[j - 1] !== '\\') {
        inString = null
      }
    }

    if (inString && !inTriple) {
      markers.push({
        severity: monaco.MarkerSeverity.Error,
        startLineNumber: lineNumber,
        startColumn: 1,
        endLineNumber: lineNumber,
        endColumn: line.length + 1,
        message: 'Unclosed string literal.',
        code: 'python-unclosed-string'
      })
    }

    // Check for colon at end of control flow statements
    if (/^(if|elif|else|for|while|def|class|try|except|finally|with)\b/.test(trimmed)) {
      if (!trimmed.endsWith(':') && !trimmed.includes('#')) {
        markers.push({
          severity: monaco.MarkerSeverity.Warning,
          startLineNumber: lineNumber,
          startColumn: line.length,
          endLineNumber: lineNumber,
          endColumn: line.length + 1,
          message: 'Control flow statement should end with a colon (:).',
          code: 'python-missing-colon'
        })
      }
    }
  }
}

/**
 * YAML block validation (for YAML code blocks, not frontmatter)
 */
function validateYamlBlockSyntax(
  code: string,
  startLine: number,
  markers: monacoEditor.editor.IMarkerData[],
  monaco: typeof monacoEditor
) {
  try {
    parseYAML(code)
  } catch (e: unknown) {
    const error = e as Error
    const message = error.message || 'Invalid YAML'

    let errorLine = startLine
    const lineMatch = message.match(/at line (\d+)/i)
    if (lineMatch) {
      errorLine = startLine + parseInt(lineMatch[1], 10) - 1
    }

    markers.push({
      severity: monaco.MarkerSeverity.Error,
      startLineNumber: errorLine,
      startColumn: 1,
      endLineNumber: errorLine,
      endColumn: 100,
      message: `YAML: ${message.replace(/at line \d+,?\s*/i, '')}`,
      code: 'yaml-block-error'
    })
  }
}

/**
 * Known Nunjucks/Jinja2 filters - both built-in and our custom ones
 * Keep in sync with filters.ts for completions
 */
const KNOWN_FILTERS = new Set([
  // Nunjucks built-in filters (from Nunjucks documentation)
  'abs', 'batch', 'capitalize', 'center', 'default', 'd', 'dictsort',
  'dump', 'escape', 'e', 'first', 'float', 'forceescape', 'groupby',
  'indent', 'int', 'join', 'last', 'length', 'list', 'lower', 'nl2br',
  'random', 'reject', 'rejectattr', 'replace', 'reverse', 'round',
  'safe', 'select', 'selectattr', 'slice', 'sort', 'split', 'string', 'striptags',
  'sum', 'title', 'trim', 'truncate', 'upper', 'urlencode', 'urlize',
  'wordcount', 'wordwrap',
  // Our custom Prompd filters (from filters.ts)
  'fromcsv', 'fromjson', 'tojson', 'lines', 'dedent', 'codeblock',
  'unique', 'pluck', 'where', 'groupby', 'shuffle', 'sample', 'bulletlist', 'numberedlist'
])

/**
 * Validate Nunjucks template syntax in the body content.
 * Checks for:
 * - Unclosed block tags ({% if %} without {% endif %})
 * - Unknown filters
 * - Malformed template expressions
 */
function validateNunjucksTemplates(
  body: string,
  bodyStartOffset: number,
  fullContent: string,
  markers: monacoEditor.editor.IMarkerData[],
  monaco: typeof monacoEditor
) {
  // Track block tags for matching
  const blockStack: Array<{ tag: string; lineNumber: number; column: number }> = []

  // Block tag pairs
  const blockPairs: Record<string, string> = {
    'if': 'endif',
    'for': 'endfor',
    'block': 'endblock',
    'macro': 'endmacro',
    'call': 'endcall',
    'filter': 'endfilter',
    'set': 'endset', // for {% set x %}...{% endset %} block form
    'raw': 'endraw'
  }

  const endTags = new Set(Object.values(blockPairs))

  // Find all block tags {% tag %}
  const blockTagRegex = /\{%-?\s*(\w+)(?:\s+[^%]*)?\s*-?%\}/g
  let match: RegExpExecArray | null

  while ((match = blockTagRegex.exec(body)) !== null) {
    const tag = match[1].toLowerCase()
    const matchIndex = bodyStartOffset + match.index
    const lineNumber = fullContent.substring(0, matchIndex).split('\n').length
    const column = fullContent.substring(0, matchIndex).split('\n').pop()!.length + 1

    // Skip non-block tags (elif, else are part of if blocks, not standalone)
    if (tag === 'elif' || tag === 'else') {
      continue
    }

    // Check if it's an opening block tag
    if (blockPairs[tag]) {
      // Special handling for 'set' - check if it's self-closing (has '=') or block form
      if (tag === 'set') {
        const fullMatch = match[0]
        // If it contains '=' it's a self-closing assignment, don't push to stack
        if (fullMatch.includes('=')) {
          continue // Self-closing, skip
        }
      }
      blockStack.push({ tag, lineNumber, column })
    }
    // Check if it's a closing tag
    else if (endTags.has(tag)) {
      const expectedOpen = Object.entries(blockPairs).find(([, end]) => end === tag)?.[0]

      if (blockStack.length === 0) {
        // Closing tag without opening
        markers.push({
          severity: monaco.MarkerSeverity.Error,
          startLineNumber: lineNumber,
          startColumn: column,
          endLineNumber: lineNumber,
          endColumn: column + match[0].length,
          message: `Unexpected {% ${tag} %} - no matching opening tag found.`,
          code: 'nunjucks-unmatched-end-tag'
        })
      } else {
        const lastOpen = blockStack[blockStack.length - 1]
        if (blockPairs[lastOpen.tag] === tag) {
          // Properly matched
          blockStack.pop()
        } else {
          // Mismatched closing tag
          markers.push({
            severity: monaco.MarkerSeverity.Error,
            startLineNumber: lineNumber,
            startColumn: column,
            endLineNumber: lineNumber,
            endColumn: column + match[0].length,
            message: `Mismatched {% ${tag} %} - expected {% ${blockPairs[lastOpen.tag]} %} to close {% ${lastOpen.tag} %} on line ${lastOpen.lineNumber}.`,
            code: 'nunjucks-mismatched-tag'
          })
        }
      }
    }
  }

  // Report unclosed opening tags
  for (const unclosed of blockStack) {
    markers.push({
      severity: monaco.MarkerSeverity.Error,
      startLineNumber: unclosed.lineNumber,
      startColumn: unclosed.column,
      endLineNumber: unclosed.lineNumber,
      endColumn: unclosed.column + 10, // Approximate width
      message: `Unclosed {% ${unclosed.tag} %} - add {% ${blockPairs[unclosed.tag]} %} to close it.`,
      code: 'nunjucks-unclosed-tag'
    })
  }

  // Check for unknown filters in {{ var | filter }} expressions
  const filterExprRegex = /\{\{[^}]*\|\s*(\w+)(?:\([^)]*\))?/g
  while ((match = filterExprRegex.exec(body)) !== null) {
    const filterName = match[1].toLowerCase()

    if (!KNOWN_FILTERS.has(filterName)) {
      const matchIndex = bodyStartOffset + match.index
      // Find the position of the filter name within the match
      const filterPosInMatch = match[0].lastIndexOf(match[1])
      const filterIndex = matchIndex + filterPosInMatch
      const lineNumber = fullContent.substring(0, filterIndex).split('\n').length
      const column = fullContent.substring(0, filterIndex).split('\n').pop()!.length + 1

      markers.push({
        severity: monaco.MarkerSeverity.Warning,
        startLineNumber: lineNumber,
        startColumn: column,
        endLineNumber: lineNumber,
        endColumn: column + match[1].length,
        message: `Unknown filter '${match[1]}'. Available filters: trim, lower, upper, capitalize, replace, tojson, fromjson, fromcsv, lines, dedent, and more.`,
        code: 'nunjucks-unknown-filter'
      })
    }
  }

  // Check for unclosed {{ without }}
  const openDoubleBraces = (body.match(/\{\{/g) || []).length
  const closeDoubleBraces = (body.match(/\}\}/g) || []).length
  if (openDoubleBraces !== closeDoubleBraces) {
    // Find the first unmatched {{
    let depth = 0
    let searchStart = 0
    while (searchStart < body.length) {
      const openIdx = body.indexOf('{{', searchStart)
      const closeIdx = body.indexOf('}}', searchStart)

      if (openIdx === -1 && closeIdx === -1) break

      if (openIdx !== -1 && (closeIdx === -1 || openIdx < closeIdx)) {
        depth++
        searchStart = openIdx + 2
        if (depth > closeDoubleBraces - (body.substring(0, openIdx).match(/\}\}/g) || []).length + 1) {
          // This is likely the unmatched one
          const matchIndex = bodyStartOffset + openIdx
          const lineNumber = fullContent.substring(0, matchIndex).split('\n').length
          const column = fullContent.substring(0, matchIndex).split('\n').pop()!.length + 1

          markers.push({
            severity: monaco.MarkerSeverity.Error,
            startLineNumber: lineNumber,
            startColumn: column,
            endLineNumber: lineNumber,
            endColumn: column + 2,
            message: `Unclosed {{ - add }} to close the expression.`,
            code: 'nunjucks-unclosed-expression'
          })
          break
        }
      } else if (closeIdx !== -1) {
        depth--
        searchStart = closeIdx + 2
      }
    }
  }

  // Check for unclosed {% without %}
  const openBlockBraces = (body.match(/\{%/g) || []).length
  const closeBlockBraces = (body.match(/%\}/g) || []).length
  if (openBlockBraces !== closeBlockBraces) {
    // Find unmatched {%
    const openPos = body.lastIndexOf('{%')
    const closeAfterOpen = body.indexOf('%}', openPos)
    if (closeAfterOpen === -1 && openPos !== -1) {
      const matchIndex = bodyStartOffset + openPos
      const lineNumber = fullContent.substring(0, matchIndex).split('\n').length
      const column = fullContent.substring(0, matchIndex).split('\n').pop()!.length + 1

      markers.push({
        severity: monaco.MarkerSeverity.Error,
        startLineNumber: lineNumber,
        startColumn: column,
        endLineNumber: lineNumber,
        endColumn: column + 2,
        message: `Unclosed {% - add %} to close the block tag.`,
        code: 'nunjucks-unclosed-block'
      })
    }
  }
}

/**
 * Validate package references exist in registry
 * Checks inherits: and using: package references
 * Also checks for deprecated packages and shows warnings
 */
async function validatePackageReferences(
  yamlContent: string,
  fullContent: string,
  monaco: typeof monacoEditor
): Promise<monacoEditor.editor.IMarkerData[]> {
  const markers: monacoEditor.editor.IMarkerData[] = []
  const registrySync = getRegistrySync()

  // Helper to parse package reference into namespace and name
  // Format: @namespace/package-name@version or @namespace/package-name
  const parsePackageRef = (pkgRef: string): { namespace: string; name: string; version?: string } | null => {
    // Use lastIndexOf('@') to find the version separator (first '@' is namespace prefix)
    const versionAt = pkgRef.lastIndexOf('@')
    if (versionAt <= 0) return null // must have at least @namespace

    let refPart: string
    let version: string | undefined

    // If lastIndexOf('@') > 0 and isn't the leading '@', it's the version separator
    if (versionAt > 1 && pkgRef[0] === '@') {
      refPart = pkgRef.substring(0, versionAt)
      version = pkgRef.substring(versionAt + 1)
      if (!version) version = undefined
    } else {
      refPart = pkgRef
    }

    // refPart should be @namespace/package-name
    const slashIdx = refPart.indexOf('/')
    if (slashIdx < 0) return null
    const namespace = refPart.substring(0, slashIdx)
    const name = refPart.substring(slashIdx + 1)
    if (!namespace || !name) return null
    // Namespace must start with @
    if (!namespace.startsWith('@')) return null

    return { namespace, name, version }
  }

  // Collect prefixes defined in the using: block so we can recognize alias paths
  // using: entries can be objects with name/prefix or bare strings
  const definedPrefixes = new Set<string>()
  const usingNameMatches = Array.from(yamlContent.matchAll(/name:\s*["']?(@[\w./-]+@?[\w.^~*-]*)["']?/g))
  const usingPrefixMatches = Array.from(yamlContent.matchAll(/prefix:\s*["']?(@[\w-]+)["']?/g))
  for (const m of usingPrefixMatches) {
    definedPrefixes.add(m[1])
  }

  // Extract inherits reference
  const inheritsMatch = yamlContent.match(/^\s*inherits:\s*["']?(@[\w./-]+@?[\w.^~*-]*)["']?/m)
  if (inheritsMatch) {
    const pkgRef = inheritsMatch[1]
    const lineNumber = fullContent.substring(0, fullContent.indexOf(inheritsMatch[0])).split('\n').length

    // Check if the inherits value uses a defined prefix alias (e.g. @core/prompts/base.prmd)
    const refPrefix = pkgRef.match(/^(@[\w-]+)\//)?.[1]
    const usesAlias = refPrefix ? definedPrefixes.has(refPrefix) : false

    if (!usesAlias) {
      // It's a direct package reference — validate it
      const parsed = parsePackageRef(pkgRef)
      if (!parsed) {
        markers.push({
          severity: monaco.MarkerSeverity.Error,
          startLineNumber: lineNumber,
          startColumn: inheritsMatch[0].indexOf(pkgRef) + 1,
          endLineNumber: lineNumber,
          endColumn: inheritsMatch[0].indexOf(pkgRef) + pkgRef.length + 1,
          message: `Invalid package reference format. Use @namespace/package-name@version`,
          code: 'invalid-package-reference'
        })
      } else {
        if (!parsed.version) {
          markers.push({
            severity: monaco.MarkerSeverity.Error,
            startLineNumber: lineNumber,
            startColumn: inheritsMatch[0].indexOf(pkgRef) + 1,
            endLineNumber: lineNumber,
            endColumn: inheritsMatch[0].indexOf(pkgRef) + pkgRef.length + 1,
            message: `Package '${pkgRef}' must include version (e.g., ${pkgRef}@1.0.0)`,
            code: 'missing-package-version'
          })
        }
        if (registrySync.isDeprecated(parsed.namespace, parsed.name)) {
          const deprecationMsg = registrySync.getDeprecationMessage(parsed.namespace, parsed.name)
          markers.push({
            severity: monaco.MarkerSeverity.Warning,
            startLineNumber: lineNumber,
            startColumn: inheritsMatch[0].indexOf(pkgRef) + 1,
            endLineNumber: lineNumber,
            endColumn: inheritsMatch[0].indexOf(pkgRef) + pkgRef.length + 1,
            message: deprecationMsg || `Package '${pkgRef}' is deprecated`,
            code: 'deprecated-package',
            tags: [monaco.MarkerTag.Deprecated]
          })
        }
      }
    }
    // else: alias path like @core/prompts/base.prmd — skip package validation
  }

  // Extract using references
  // Supports both object format (name: "@ns/pkg@ver") and bare list format (- "@ns/pkg@ver")
  const usingRefs: { ref: string; index: number }[] = []
  // Object format: name: "@prompd/core@0.0.1"
  for (const m of usingNameMatches) {
    usingRefs.push({ ref: m[1], index: m.index! })
  }
  // Bare list format: - "@prompd/core@0.0.1"  (only if not already inside a name: key)
  const bareMatches = Array.from(yamlContent.matchAll(/-\s*["'](@[\w./-]+@?[\w.^~*-]*)["']\s*$/gm))
  for (const m of bareMatches) {
    usingRefs.push({ ref: m[1], index: m.index! })
  }

  for (const { ref: pkgRef, index } of usingRefs) {
    const lineNumber = fullContent.substring(0, fullContent.indexOf(pkgRef, index)).split('\n').length
    const parsed = parsePackageRef(pkgRef)

    if (!parsed) {
      markers.push({
        severity: monaco.MarkerSeverity.Error,
        startLineNumber: lineNumber,
        startColumn: 1,
        endLineNumber: lineNumber,
        endColumn: 1000,
        message: `Invalid package reference format. Use @namespace/package-name@version`,
        code: 'invalid-package-reference'
      })
      continue
    }

    if (!parsed.version) {
      markers.push({
        severity: monaco.MarkerSeverity.Warning,
        startLineNumber: lineNumber,
        startColumn: 1,
        endLineNumber: lineNumber,
        endColumn: 1000,
        message: `Package '${pkgRef}' should include version (e.g., ${pkgRef}@1.0.0)`,
        code: 'missing-package-version'
      })
    }

    if (registrySync.isDeprecated(parsed.namespace, parsed.name)) {
      const deprecationMsg = registrySync.getDeprecationMessage(parsed.namespace, parsed.name)
      markers.push({
        severity: monaco.MarkerSeverity.Warning,
        startLineNumber: lineNumber,
        startColumn: 1,
        endLineNumber: lineNumber,
        endColumn: 1000,
        message: deprecationMsg || `Package '${pkgRef}' is deprecated`,
        code: 'deprecated-package',
        tags: [monaco.MarkerTag.Deprecated]
      })
    }
  }

  return markers
}

/**
 * Fetch compiler diagnostics using Electron IPC.
 * Falls back gracefully in web mode.
 * Skipped during initial load to prevent UI freezing.
 */
async function fetchCompilerDiagnostics(content: string): Promise<CompilationDiagnostic[]> {
  // Skip compiler diagnostics during initial load to prevent UI freeze
  if (deferCompilerDiagnostics) {
    console.log('[intellisense] Compiler diagnostics deferred (initial load)')
    return []
  }

  if (!window.electronAPI?.compiler?.getDiagnostics) {
    console.log('[intellisense] Compiler diagnostics not available (not in Electron or method missing)')
    return []
  }

  try {
    const result = await window.electronAPI.compiler.getDiagnostics(content, {
      filePath: currentFilePath || undefined,
      workspaceRoot: currentWorkspacePath || undefined
    })

    if (result.success && result.diagnostics) {
      console.log('[intellisense] Received', result.diagnostics.length, 'diagnostics from compiler')
      return result.diagnostics
    } else if (result.error) {
      console.warn('[intellisense] Compiler diagnostics error:', result.error)
    }
    return []
  } catch (error) {
    console.warn('[intellisense] Failed to fetch compiler diagnostics:', error)
    return []
  }
}

/**
 * Validate a model and set markers
 */
export async function validateModel(
  monaco: typeof monacoEditor,
  model: monacoEditor.editor.ITextModel
): Promise<void> {
  console.log('[intellisense] validateModel called for:', model.uri.toString())

  // Safety check: don't validate disposed models
  if (model.isDisposed()) {
    console.log('[intellisense] Model is disposed, skipping validation')
    return
  }

  const content = model.getValue()

  // Safety check: skip validation if content is empty or too short
  // This prevents false positives during model initialization or content sync
  if (!content || content.length < 4) {
    console.log('[intellisense] Content too short, skipping validation:', content.length)
    return
  }
  const markers: monacoEditor.editor.IMarkerData[] = []

  // Check if this is a .prmd file - only .prmd files require frontmatter
  const uri = model.uri.toString().toLowerCase()
  const languageId = model.getLanguageId()
  const hasFrontmatter = /^---\r?\n/.test(content)
  const isPrompdFile = uri.endsWith('.prmd') || languageId === 'prompd' || hasFrontmatter

  console.log('[intellisense] File URI:', uri, 'languageId:', languageId, 'hasFrontmatter:', hasFrontmatter, 'isPrompdFile:', isPrompdFile)

  // Parse frontmatter (handle both LF and CRLF line endings)
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  console.log('[intellisense] Frontmatter match:', frontmatterMatch ? 'found' : 'not found')

  // Inherited params resolved during validation, shared by both single-brace and cross-ref validators
  let resolvedInheritedParams: ParameterDefinition[] = []

  if (!frontmatterMatch) {
    // Missing frontmatter - only warn for .prmd files
    if (isPrompdFile) {
      markers.push({
        severity: monaco.MarkerSeverity.Warning,
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 1,
        message: 'Missing YAML frontmatter. Add --- at the start and end of metadata.'
      })
    }
  } else {
    const yamlContent = frontmatterMatch[1]

    // Comprehensive YAML validation with user-friendly error messages
    const yamlMarkers = validateYamlContent(yamlContent, content, model, monaco)
    markers.push(...yamlMarkers)

    console.log('[intellisense] YAML content first 200 chars:', yamlContent.substring(0, 200))
    const frontmatterStartLine = 2 // Line after first ---

    // Only validate .prmd-specific fields for .prmd files
    if (isPrompdFile) {
      // Validate required fields
      const requiredFields = ['id', 'name', 'version']
      requiredFields.forEach(field => {
        const fieldRegex = new RegExp(`^\\s*${field}:\\s*.+`, 'm')
        const fieldMatch = yamlContent.match(fieldRegex)
        console.log(`[intellisense] Checking field '${field}':`, fieldMatch ? `found: "${fieldMatch[0].substring(0, 50)}"` : 'NOT FOUND')
        if (!fieldMatch) {
          markers.push({
            severity: monaco.MarkerSeverity.Error,
            startLineNumber: frontmatterStartLine,
            startColumn: 1,
            endLineNumber: frontmatterStartLine,
            endColumn: 10,
            message: `Required field '${field}' is missing in frontmatter.`
          })
        }
      })

      // Validate semantic version format
      const versionMatch = yamlContent.match(/^\s*version:\s*(.+)$/m)
      if (versionMatch) {
        const version = versionMatch[1].trim().replace(/['"]/g, '')
        const lineNumber = content.substring(0, content.indexOf(versionMatch[0])).split('\n').length

        if (!/^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/.test(version)) {
          markers.push({
            severity: monaco.MarkerSeverity.Error,
            startLineNumber: lineNumber,
            startColumn: versionMatch[0].indexOf(version) + 1,
            endLineNumber: lineNumber,
            endColumn: versionMatch[0].indexOf(version) + version.length + 1,
            message: `Invalid semantic version '${version}'. Use format: MAJOR.MINOR.PATCH (e.g., 1.0.0)`
          })
        }
      }

      // Validate kebab-case for id
      const idMatch = yamlContent.match(/^\s*id:\s*(.+)$/m)
      if (idMatch) {
        const id = idMatch[1].trim().replace(/['"]/g, '')
        const lineNumber = content.substring(0, content.indexOf(idMatch[0])).split('\n').length

        if (!/^[a-z0-9-]+$/.test(id)) {
          markers.push({
            severity: monaco.MarkerSeverity.Warning,
            startLineNumber: lineNumber,
            startColumn: idMatch[0].indexOf(id) + 1,
            endLineNumber: lineNumber,
            endColumn: idMatch[0].indexOf(id) + id.length + 1,
            message: `ID should use kebab-case format (lowercase letters, numbers, hyphens only): '${id}'`
          })
        }

        // Check if id matches the filename (without extension)
        // Derive filename from model-specific file path map, falling back to singleton
        const modelFilePath = getModelFilePath(model.uri.toString())
        if (modelFilePath) {
          const fileName = modelFilePath.replace(/\\/g, '/').split('/').pop() || ''
          const fileBaseName = fileName.replace(/\.prmd$/i, '')
          if (fileBaseName && id !== fileBaseName) {
            markers.push({
              severity: monaco.MarkerSeverity.Warning,
              startLineNumber: lineNumber,
              startColumn: idMatch[0].indexOf(id) + 1,
              endLineNumber: lineNumber,
              endColumn: idMatch[0].indexOf(id) + id.length + 1,
              message: `ID '${id}' does not match filename '${fileBaseName}'.`,
              code: 'id-filename-mismatch'
            })
          }
        }
      }

      // Validate package references (inherits + using)
      const pkgRefMarkers = await validatePackageReferences(yamlContent, content, monaco)
      markers.push(...pkgRefMarkers)

      // Validate parameters format (should be array, not object)
      const contentLines = content.split(/\r?\n/)
      const paramsLineIdx = contentLines.findIndex(l => l.match(/^\s*parameters:\s*$/))
      console.log('[intellisense] Validating parameters, paramsLineIdx:', paramsLineIdx)

      if (paramsLineIdx >= 0) {
        const lines = contentLines
        const nextLineIdx = paramsLineIdx + 1
        if (nextLineIdx < lines.length) {
          const nextLine = lines[nextLineIdx]
          console.log('[intellisense] Checking line after parameters:', JSON.stringify(nextLine))
          const objectMatch = nextLine.match(/^[ \t]+[a-zA-Z_][a-zA-Z0-9_]*:\s*$/)
          const hasNamePrefix = nextLine.includes('- name:')
          console.log('[intellisense] objectMatch:', !!objectMatch, 'hasNamePrefix:', hasNamePrefix)
          const isObjectFormat = objectMatch && !hasNamePrefix
          if (isObjectFormat) {
            console.log('[intellisense] Adding object-format marker at line', nextLineIdx + 1)
            markers.push({
              severity: monaco.MarkerSeverity.Error,
              startLineNumber: nextLineIdx + 1, // Monaco is 1-indexed
              startColumn: 1,
              endLineNumber: nextLineIdx + 1,
              endColumn: nextLine.length + 1,
              message: 'Parameters should use array format with "- name:" syntax. Click the lightbulb to auto-fix.'
            })
          }
        }
      }

      // Check if file inherits from another (parent parameters are expected but not visible)
      const inheritsMatch = yamlContent.match(/^\s*inherits:\s*["']?(.+?)["']?\s*$/m)
      const hasInherits = !!inheritsMatch

      // Resolve inherited parameters once — shared by both single-brace and cross-ref validators
      if (hasInherits) {
        try {
          resolvedInheritedParams = await resolveInheritedParameters(yamlContent)
        } catch {
          // Resolution failed — will be handled gracefully below
        }
      }

      // Validate undefined parameter references
      const definedParams = new Set<string>()

      // Extract defined parameters from frontmatter
      const lines = yamlContent.split(/\r?\n/)
      let inParametersSection = false
      let parametersIndent = -1
      let parameterLevelIndent = -1
      let foundTopLevelParameters = false

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        // Check if we're entering the top-level parameters section
        // Only match the FIRST parameters: at indent 0 to avoid nested parameters:
        // keys inside JSON default values being treated as .prmd parameter sections
        if (!foundTopLevelParameters && line.match(/^parameters:\s*$/)) {
          inParametersSection = true
          foundTopLevelParameters = true
          parametersIndent = 0
          parameterLevelIndent = -1
          console.log('[intellisense] Found top-level parameters section')
          continue
        }

        // Check if we've left parameters section (new key at same or lower indent)
        // Skip comment lines — they shouldn't trigger section exit
        if (inParametersSection && line.trim() !== '' && !line.trim().startsWith('#')) {
          const currentIndent = line.search(/\S/)
          if (currentIndent !== -1 && currentIndent <= parametersIndent && !line.match(/^\s*-/)) {
            inParametersSection = false
            console.log('[intellisense] Exiting parameters section at line', i)
          }
        }

        if (inParametersSection) {
          // Skip comment lines inside parameters section
          if (line.trim().startsWith('#')) continue

          const currentIndent = line.search(/\S/)

          // Array format: "- name: paramName"
          // Set parameterLevelIndent from the FIRST "- name:" match so that
          // nested "- name:" entries inside default values (at deeper indent) are ignored
          const arrayMatch = line.match(/^\s*-\s*name:\s*["']?(\w+)["']?/)
          if (arrayMatch) {
            if (parameterLevelIndent === -1) {
              parameterLevelIndent = currentIndent
            }
            if (currentIndent === parameterLevelIndent) {
              console.log('[intellisense] Found array-format param:', arrayMatch[1])
              definedParams.add(arrayMatch[1])
              continue
            }
          }

          // Object format — only match at parameter level indent
          if (parameterLevelIndent !== -1 && currentIndent === parameterLevelIndent) {
            // Object format (multiline): "  paramName:" on its own line
            const objectMultilineMatch = line.match(/^\s+([a-zA-Z_][a-zA-Z0-9_]*):\s*$/)
            if (objectMultilineMatch) {
              console.log('[intellisense] Found object-format param:', objectMultilineMatch[1])
              definedParams.add(objectMultilineMatch[1])
              continue
            }

            // Inline object format: "  paramName: { type: string }"
            const inlineObjectMatch = line.match(/^\s+([a-zA-Z_][a-zA-Z0-9_]*):\s*\{/)
            if (inlineObjectMatch) {
              console.log('[intellisense] Found inline-object param:', inlineObjectMatch[1])
              definedParams.add(inlineObjectMatch[1])
              continue
            }
          }
        }
      }

      console.log('[intellisense] Defined params:', Array.from(definedParams))

      // Extract loop variables from {% for VAR in COLLECTION %} or {%- for VAR in COLLECTION %} blocks
      // Also handles tuple unpacking: {% for key, value in dict %} and [COLLECTION] bracket syntax
      const forLoopPattern = /\{%-?\s*for\s+([\w,\s]+?)\s+in\s+\[?\s*(\w+)/g
      console.log('[intellisense] Searching for loop patterns in content length:', content.length)
      const loopMatchArray = Array.from(content.matchAll(forLoopPattern))
      console.log('[intellisense] Found', loopMatchArray.length, 'for loop matches')
      for (const match of loopMatchArray) {
        // Split on comma to handle tuple unpacking (e.g., "service, owner")
        const vars = match[1].split(',').map(v => v.trim()).filter(Boolean)
        const collectionVar = match[2]
        for (const loopVar of vars) {
          console.log('[intellisense] Found loop variable:', loopVar, 'iterating over:', collectionVar, 'at index:', match.index)
          definedParams.add(loopVar)
        }
        // Also add 'loop' helper variable (Nunjucks built-in)
        definedParams.add('loop')
      }

      // Extract set variables from {% set VAR = VALUE %} or {%- set VAR = VALUE %}
      const setVarPattern = /\{%-?\s*set\s+(\w+)\s*=/g
      const setMatchArray = Array.from(content.matchAll(setVarPattern))
      console.log('[intellisense] Found', setMatchArray.length, 'set variable matches')
      for (const match of setMatchArray) {
        const setVar = match[1]
        console.log('[intellisense] Found set variable:', setVar, 'at index:', match.index)
        definedParams.add(setVar)
      }

      // Add built-in namespaces that don't need to be declared in parameters
      definedParams.add('env')              // Environment variables ({{ env.VAR }})
      // Workflow runtime variables (injected by workflowExecutor.ts when .prmd runs in a workflow)
      definedParams.add('workflow')         // Workflow parameters ({{ workflow.param_name }})
      definedParams.add('previous_output')  // Output from connected upstream node
      definedParams.add('previous_step')    // Alias for previous_output
      definedParams.add('input')            // Alias for previous_output in code/transform nodes

      // Add inherited parameters so they're recognized as defined
      for (const inheritedParam of resolvedInheritedParams) {
        definedParams.add(inheritedParam.name)
      }

      console.log('[intellisense] After loop/set/inherited extraction, definedParams:', Array.from(definedParams))

      // Check body for parameter references (handle CRLF)
      const bodyMatch = content.match(/---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/)
      if (bodyMatch) {
        const body = bodyMatch[1]
        const bodyStartOffset = frontmatterMatch[0].length

        // Build a set of line numbers that are inside fenced code blocks
        // so we can skip single-brace references inside code blocks (e.g., JSON keys)
        const codeBlockLines = new Set<number>()
        const bodyLines = body.split(/\r?\n/)
        let inCodeBlock = false
        for (let i = 0; i < bodyLines.length; i++) {
          if (/^\s*```/.test(bodyLines[i])) {
            if (inCodeBlock) {
              codeBlockLines.add(i) // closing fence
              inCodeBlock = false
            } else {
              codeBlockLines.add(i) // opening fence
              inCodeBlock = true
            }
          } else if (inCodeBlock) {
            codeBlockLines.add(i)
          }
        }

        // Find single-brace references {var} that are NOT part of double braces {{var}}
        // Use negative lookbehind/lookahead to exclude {{ and }}
        const singleBraceRegex = /(?<!\{)\{([a-zA-Z_][a-zA-Z0-9_]*)\}(?!\})/g
        const singleBraceRefs = Array.from(body.matchAll(singleBraceRegex))
        console.log('[intellisense] Found', singleBraceRefs.length, 'single-brace references in body')

        for (const match of singleBraceRefs) {
          const paramName = match[1]
          const isDefined = definedParams.has(paramName)
          console.log('[intellisense] Checking single-brace param reference:', paramName, 'isDefined:', isDefined)

          const fullContent = content
          const matchIndex = fullContent.indexOf(match[0], bodyStartOffset)
          if (matchIndex === -1) continue

          const lineNumber = fullContent.substring(0, matchIndex).split('\n').length
          const column = fullContent.substring(0, matchIndex).split('\n').pop()!.length + 1

          // Skip references inside fenced code blocks (e.g., {length} in JSON)
          const bodyLineIndex = lineNumber - fullContent.substring(0, bodyStartOffset).split('\n').length
          if (codeBlockLines.has(bodyLineIndex)) continue

          if (!isDefined) {
            if (hasInherits && resolvedInheritedParams.length === 0) {
              // Inherits but couldn't resolve parent — suppress entirely,
              // we can't verify so trust the inheritance declaration
              continue
            } else if (hasInherits) {
              // Resolved parent but param not found in local or inherited
              markers.push({
                severity: monaco.MarkerSeverity.Warning,
                startLineNumber: lineNumber,
                startColumn: column,
                endLineNumber: lineNumber,
                endColumn: column + match[0].length,
                message: `Parameter '{${paramName}}' is not defined locally or in inherited '${inheritsMatch![1]}'.`,
              })
            } else {
              // Undefined parameter
              markers.push({
                severity: monaco.MarkerSeverity.Warning,
                startLineNumber: lineNumber,
                startColumn: column,
                endLineNumber: lineNumber,
                endColumn: column + match[0].length,
                message: `Undefined parameter '{${paramName}}'. Define it in frontmatter parameters section.`,
                tags: [monaco.MarkerTag.Unnecessary]
              })
            }
          } else {
            // Defined parameter but using single braces - show info hint to use double braces
            markers.push({
              severity: monaco.MarkerSeverity.Hint,
              startLineNumber: lineNumber,
              startColumn: column,
              endLineNumber: lineNumber,
              endColumn: column + match[0].length,
              message: `Consider using double braces {{ ${paramName} }} for Nunjucks template syntax.`,
              code: 'single-brace-hint'
            })
          }
        }

        // Check for single-brace references with filters { var | filter } - this is invalid syntax
        // Filters only work with double braces {{ var | filter }}
        const singleBraceWithFilterRegex = /(?<!\{)\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\|\s*([a-zA-Z_][a-zA-Z0-9_]*(?:\([^)]*\))?)\s*\}(?!\})/g
        const singleBraceFilterRefs = Array.from(body.matchAll(singleBraceWithFilterRegex))
        console.log('[intellisense] Found', singleBraceFilterRefs.length, 'single-brace filter references in body')

        for (const match of singleBraceFilterRefs) {
          const paramName = match[1]
          const filterName = match[2]

          const fullContent = content
          const matchIndex = fullContent.indexOf(match[0], bodyStartOffset)
          if (matchIndex === -1) continue

          const lineNumber = fullContent.substring(0, matchIndex).split('\n').length
          const column = fullContent.substring(0, matchIndex).split('\n').pop()!.length + 1

          // Show error - filters don't work with single braces
          markers.push({
            severity: monaco.MarkerSeverity.Error,
            startLineNumber: lineNumber,
            startColumn: column,
            endLineNumber: lineNumber,
            endColumn: column + match[0].length,
            message: `Filters require double braces. Use {{ ${paramName} | ${filterName} }} instead of { ${paramName} | ${filterName} }.`,
            code: 'single-brace-filter-error'
          })
        }

        // Nunjucks template validation
        validateNunjucksTemplates(body, bodyStartOffset, content, markers, monaco)

        // Code block syntax validation (JS/TS, Python, JSON, YAML)
        validateCodeBlocks(body, bodyStartOffset, content, markers, monaco)
      }
    } // End of isPrompdFile check
  }

  // Cross-reference analysis for parameter usage (unused/undefined parameters)
  // Reuses the inherited parameters already resolved above for the single-brace validator
  if (isPrompdFile) {
    try {
      // Reuse inherited params resolved earlier in the single-brace validation block
      const inheritedDefs = resolvedInheritedParams.length > 0 ? resolvedInheritedParams : undefined
      const crossRefDiagnostics = analyzeParameterUsage(content, monaco, inheritedDefs)
      markers.push(...crossRefDiagnostics)
    } catch (error) {
      console.warn('[intellisense] Error during cross-reference analysis:', error)
    }
  }

  // Fetch compiler diagnostics (inheritance errors, dependency resolution, etc.)
  if (isPrompdFile) {
    try {
      const compilerDiagnostics = await fetchCompilerDiagnostics(content)

      for (const diag of compilerDiagnostics) {
        // Convert severity
        let severity: monacoEditor.MarkerSeverity
        switch (diag.severity) {
          case 'error':
            severity = monaco.MarkerSeverity.Error
            break
          case 'warning':
            severity = monaco.MarkerSeverity.Warning
            break
          case 'info':
            severity = monaco.MarkerSeverity.Info
            break
          default:
            severity = monaco.MarkerSeverity.Warning
        }

        // Use line numbers from compiler or default to line 1
        const line = diag.line || 1
        const column = diag.column || 1
        const endLine = diag.endLine || line
        const endColumn = diag.endColumn || (model.getLineMaxColumn(line) || column + 1)

        // Add code to message if available (helps with quick fixes)
        let message = diag.message
        if (diag.source) {
          message = `[${diag.source}] ${message}`
        }

        markers.push({
          severity,
          startLineNumber: line,
          startColumn: column,
          endLineNumber: endLine,
          endColumn: endColumn,
          message,
          code: diag.code || undefined
        })
      }
    } catch (error) {
      console.warn('[intellisense] Error fetching compiler diagnostics:', error)
    }
  }

  // Set markers (always call to clear stale markers when errors are fixed)
  console.log('[intellisense] Setting', markers.length, 'markers for', model.uri.toString())
  if (markers.length > 0) {
    console.log('[intellisense] Markers:', markers.map(m => ({ line: m.startLineNumber, msg: m.message.substring(0, 50) })))
  }
  monaco.editor.setModelMarkers(model, LANGUAGE_ID, markers)
}

/**
 * Setup model validation with change listeners
 */
export function setupModelValidation(
  monaco: typeof monacoEditor,
  model: monacoEditor.editor.ITextModel,
  modelValidationDisposables: Map<string, monacoEditor.IDisposable>
): void {
  const modelUri = model.uri.toString()
  console.log('[intellisense] Setting up validation for model:', modelUri, 'language:', model.getLanguageId())

  // Clean up any existing disposable for this model
  const existing = modelValidationDisposables.get(modelUri)
  if (existing) {
    existing.dispose()
  }

  // Initial validation
  validateModel(monaco, model)

  let validationTimeout: ReturnType<typeof setTimeout> | null = null

  // Set up change listener
  const changeDisposable = model.onDidChangeContent(() => {
    // Debounce validation
    if (validationTimeout) clearTimeout(validationTimeout)
    validationTimeout = setTimeout(() => {
      if (!model.isDisposed()) {
        validateModel(monaco, model)
      }
    }, 500)
  })

  modelValidationDisposables.set(modelUri, changeDisposable)

  // Clean up when model is disposed
  model.onWillDispose(() => {
    if (validationTimeout) clearTimeout(validationTimeout)
    const disposable = modelValidationDisposables.get(modelUri)
    if (disposable) {
      disposable.dispose()
      modelValidationDisposables.delete(modelUri)
    }
  })
}

/**
 * Register validation listeners for all models
 */
export function registerValidationListeners(
  monaco: typeof monacoEditor,
  languageId: string,
  modelValidationDisposables: Map<string, monacoEditor.IDisposable>
): void {
  // Validate models created AFTER this registration
  monaco.editor.onDidCreateModel((model) => {
    console.log('[intellisense] onDidCreateModel fired for:', model.uri.toString(), 'language:', model.getLanguageId())
    if (model.getLanguageId() === languageId) {
      setupModelValidation(monaco, model, modelValidationDisposables)
    }
  })

  // Listen for language changes on any model (model might be created with 'plaintext' then changed to 'prompd')
  monaco.editor.onDidChangeModelLanguage?.((e) => {
    console.log('[intellisense] onDidChangeModelLanguage fired:', e.model.uri.toString(), 'new language:', e.model.getLanguageId())
    if (e.model.getLanguageId() === languageId) {
      setupModelValidation(monaco, e.model, modelValidationDisposables)
    } else {
      // Clear markers when switching away from prompd language
      monaco.editor.setModelMarkers(e.model, languageId, [])
      // Clean up any existing validation listener
      const modelUri = e.model.uri.toString()
      const disposable = modelValidationDisposables.get(modelUri)
      if (disposable) {
        disposable.dispose()
        modelValidationDisposables.delete(modelUri)
      }
    }
  })

  // CRITICAL: Also validate EXISTING models that were created before registration
  const existingModels = monaco.editor.getModels()
  console.log('[intellisense] Found', existingModels.length, 'existing models to check')
  existingModels.forEach(model => {
    console.log('[intellisense] Checking existing model:', model.uri.toString(), 'language:', model.getLanguageId())
    if (model.getLanguageId() === languageId) {
      console.log('[intellisense] Setting up validation for existing model:', model.uri.toString())
      setupModelValidation(monaco, model, modelValidationDisposables)
    }
  })

  // Re-check models after a short delay (for HMR and late language changes)
  setTimeout(() => {
    const laterModels = monaco.editor.getModels()
    console.log('[intellisense] Delayed check: Found', laterModels.length, 'models')
    laterModels.forEach(model => {
      const lang = model.getLanguageId()
      console.log('[intellisense] Delayed check model:', model.uri.toString(), 'language:', lang)
      if (lang === languageId && !modelValidationDisposables.has(model.uri.toString())) {
        console.log('[intellisense] Setting up validation for late model:', model.uri.toString())
        setupModelValidation(monaco, model, modelValidationDisposables)
      }
    })
  }, 1000)
}

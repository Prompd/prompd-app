/**
 * EditorConfig Parser and Monaco Integration
 *
 * Parses .editorconfig files and applies settings to Monaco editor.
 * Follows the EditorConfig specification: https://editorconfig.org/
 */

/**
 * Monaco editor options subset that EditorConfig can set
 */
export interface MonacoEditorOptions {
  insertSpaces?: boolean
  tabSize?: number
  wordWrap?: 'off' | 'on' | 'wordWrapColumn' | 'bounded'
  wordWrapColumn?: number
}

export interface EditorConfigSettings {
  /** Set to tab or space to use hard tabs or soft tabs respectively */
  indent_style?: 'tab' | 'space'
  /** Number of columns used for each indentation level */
  indent_size?: number | 'tab'
  /** Number of columns used to represent a tab character */
  tab_width?: number
  /** Set to lf, cr, or crlf to control line endings */
  end_of_line?: 'lf' | 'cr' | 'crlf'
  /** Set to latin1, utf-8, utf-8-bom, utf-16be or utf-16le */
  charset?: 'latin1' | 'utf-8' | 'utf-8-bom' | 'utf-16be' | 'utf-16le'
  /** Set to true to remove any whitespace characters preceding newline characters */
  trim_trailing_whitespace?: boolean
  /** Set to true to ensure file ends with a newline */
  insert_final_newline?: boolean
  /** Maximum number of columns per line */
  max_line_length?: number | 'off'
}

interface EditorConfigSection {
  pattern: string
  settings: EditorConfigSettings
}

interface ParsedEditorConfig {
  root: boolean
  sections: EditorConfigSection[]
}

/**
 * Parse an .editorconfig file content
 */
export function parseEditorConfig(content: string): ParsedEditorConfig {
  const lines = content.split(/\r?\n/)
  const result: ParsedEditorConfig = {
    root: false,
    sections: []
  }

  let currentSection: EditorConfigSection | null = null

  for (const rawLine of lines) {
    // Remove comments and trim
    const commentIndex = rawLine.indexOf('#')
    const semicolonIndex = rawLine.indexOf(';')
    let line = rawLine

    if (commentIndex !== -1 && (semicolonIndex === -1 || commentIndex < semicolonIndex)) {
      line = rawLine.substring(0, commentIndex)
    } else if (semicolonIndex !== -1) {
      line = rawLine.substring(0, semicolonIndex)
    }

    line = line.trim()

    if (!line) continue

    // Check for section header [pattern]
    const sectionMatch = line.match(/^\[(.+)\]$/)
    if (sectionMatch) {
      if (currentSection) {
        result.sections.push(currentSection)
      }
      currentSection = {
        pattern: sectionMatch[1],
        settings: {}
      }
      continue
    }

    // Parse key=value pairs
    const eqIndex = line.indexOf('=')
    if (eqIndex === -1) continue

    const key = line.substring(0, eqIndex).trim().toLowerCase()
    const value = line.substring(eqIndex + 1).trim().toLowerCase()

    // Handle root directive (before any section)
    if (key === 'root' && !currentSection) {
      result.root = value === 'true'
      continue
    }

    // Apply setting to current section
    if (currentSection) {
      switch (key) {
        case 'indent_style':
          if (value === 'tab' || value === 'space') {
            currentSection.settings.indent_style = value
          }
          break
        case 'indent_size':
          if (value === 'tab') {
            currentSection.settings.indent_size = 'tab'
          } else {
            const size = parseInt(value, 10)
            if (!isNaN(size) && size > 0) {
              currentSection.settings.indent_size = size
            }
          }
          break
        case 'tab_width':
          const tabWidth = parseInt(value, 10)
          if (!isNaN(tabWidth) && tabWidth > 0) {
            currentSection.settings.tab_width = tabWidth
          }
          break
        case 'end_of_line':
          if (value === 'lf' || value === 'cr' || value === 'crlf') {
            currentSection.settings.end_of_line = value
          }
          break
        case 'charset':
          if (['latin1', 'utf-8', 'utf-8-bom', 'utf-16be', 'utf-16le'].includes(value)) {
            currentSection.settings.charset = value as EditorConfigSettings['charset']
          }
          break
        case 'trim_trailing_whitespace':
          currentSection.settings.trim_trailing_whitespace = value === 'true'
          break
        case 'insert_final_newline':
          currentSection.settings.insert_final_newline = value === 'true'
          break
        case 'max_line_length':
          if (value === 'off') {
            currentSection.settings.max_line_length = 'off'
          } else {
            const maxLen = parseInt(value, 10)
            if (!isNaN(maxLen) && maxLen > 0) {
              currentSection.settings.max_line_length = maxLen
            }
          }
          break
      }
    }
  }

  // Push last section
  if (currentSection) {
    result.sections.push(currentSection)
  }

  return result
}

/**
 * Convert glob pattern to regex
 * Supports: *, **, ?, [name], [!name], {s1,s2,s3}, {num1..num2}
 */
function globToRegex(pattern: string): RegExp {
  let regex = ''
  let i = 0

  while (i < pattern.length) {
    const char = pattern[i]

    switch (char) {
      case '*':
        if (pattern[i + 1] === '*') {
          // ** matches any path
          regex += '.*'
          i += 2
          // Skip trailing slash after **
          if (pattern[i] === '/') i++
        } else {
          // * matches any characters except /
          regex += '[^/]*'
          i++
        }
        break

      case '?':
        // ? matches any single character
        regex += '[^/]'
        i++
        break

      case '[':
        // Character class
        const closeIndex = pattern.indexOf(']', i)
        if (closeIndex !== -1) {
          let charClass = pattern.substring(i + 1, closeIndex)
          if (charClass.startsWith('!')) {
            charClass = '^' + charClass.substring(1)
          }
          regex += '[' + charClass + ']'
          i = closeIndex + 1
        } else {
          regex += '\\['
          i++
        }
        break

      case '{':
        // Brace expansion
        const braceClose = pattern.indexOf('}', i)
        if (braceClose !== -1) {
          const braceContent = pattern.substring(i + 1, braceClose)
          // Check for range {num..num}
          const rangeMatch = braceContent.match(/^(-?\d+)\.\.(-?\d+)$/)
          if (rangeMatch) {
            // Numeric range - just use alternation for simplicity
            const start = parseInt(rangeMatch[1], 10)
            const end = parseInt(rangeMatch[2], 10)
            const nums: string[] = []
            for (let n = Math.min(start, end); n <= Math.max(start, end); n++) {
              nums.push(n.toString())
            }
            regex += '(?:' + nums.join('|') + ')'
          } else {
            // Comma-separated alternatives
            const alternatives = braceContent.split(',').map(s => escapeRegex(s)).join('|')
            regex += '(?:' + alternatives + ')'
          }
          i = braceClose + 1
        } else {
          regex += '\\{'
          i++
        }
        break

      case '.':
      case '+':
      case '^':
      case '$':
      case '(':
      case ')':
      case '|':
      case '\\':
        // Escape regex special characters
        regex += '\\' + char
        i++
        break

      default:
        regex += char
        i++
    }
  }

  return new RegExp('^' + regex + '$', 'i')
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Get effective settings for a file path
 */
export function getSettingsForFile(
  configs: { path: string; config: ParsedEditorConfig }[],
  filePath: string
): EditorConfigSettings {
  const settings: EditorConfigSettings = {}

  // Normalize path separators
  const normalizedPath = filePath.replace(/\\/g, '/')

  // Extract just the filename for patterns that don't include path separators
  const fileName = normalizedPath.split('/').pop() || normalizedPath

  // Process configs from root to file location
  // Configs closer to the file take precedence
  for (const { config } of configs) {
    for (const section of config.sections) {
      const pattern = section.pattern

      // Determine which path to match against
      const pathToMatch = pattern.includes('/') ? normalizedPath : fileName

      // Check if pattern matches
      const regex = globToRegex(pattern)
      if (regex.test(pathToMatch)) {
        // Merge settings (later settings override earlier ones)
        Object.assign(settings, section.settings)
      }
    }

    // If this config has root=true, don't look at parent configs
    if (config.root) break
  }

  // Handle indent_size = tab
  if (settings.indent_size === 'tab') {
    settings.indent_size = settings.tab_width || 4
  }

  // If tab_width not set but indent_size is, use indent_size for tab_width
  if (settings.tab_width === undefined && typeof settings.indent_size === 'number') {
    settings.tab_width = settings.indent_size
  }

  return settings
}

/**
 * Convert EditorConfig settings to Monaco editor options
 */
export function toMonacoOptions(settings: EditorConfigSettings): MonacoEditorOptions {
  const options: MonacoEditorOptions = {}

  // Indentation
  if (settings.indent_style !== undefined) {
    options.insertSpaces = settings.indent_style === 'space'
  }

  if (typeof settings.indent_size === 'number') {
    options.tabSize = settings.indent_size
  }

  if (settings.tab_width !== undefined) {
    // Monaco uses tabSize for both display and indentation
    // If tab_width differs from indent_size, prefer indent_size for editing
    if (options.tabSize === undefined) {
      options.tabSize = settings.tab_width
    }
  }

  // Line endings - Monaco handles this through the model, not editor options
  // This would need to be handled separately when creating/loading models

  // Word wrap / max line length
  if (settings.max_line_length !== undefined && settings.max_line_length !== 'off') {
    options.wordWrapColumn = settings.max_line_length
    options.wordWrap = 'wordWrapColumn'
  }

  // Trim trailing whitespace is typically handled on save, not as an editor option
  // insert_final_newline is also handled on save

  return options
}

/**
 * EditorConfig manager for a workspace
 */
export class EditorConfigManager {
  private cache = new Map<string, ParsedEditorConfig>()
  private workspacePath: string | null = null

  setWorkspacePath(path: string | null) {
    this.workspacePath = path
    this.cache.clear()
  }

  /**
   * Load .editorconfig files from workspace root to file location
   */
  async loadConfigsForFile(
    filePath: string,
    readFile: (path: string) => Promise<string | null>
  ): Promise<{ path: string; config: ParsedEditorConfig }[]> {
    if (!this.workspacePath) return []

    const configs: { path: string; config: ParsedEditorConfig }[] = []
    const normalizedFilePath = filePath.replace(/\\/g, '/')
    const normalizedWorkspace = this.workspacePath.replace(/\\/g, '/')

    // Build list of directories from file to workspace root
    const dirs: string[] = []
    let currentDir = normalizedFilePath.substring(0, normalizedFilePath.lastIndexOf('/'))

    while (currentDir.startsWith(normalizedWorkspace)) {
      dirs.unshift(currentDir) // Add to beginning (root first)
      const parentDir = currentDir.substring(0, currentDir.lastIndexOf('/'))
      if (parentDir === currentDir) break // Reached root
      currentDir = parentDir
    }

    // Include workspace root
    if (!dirs.includes(normalizedWorkspace)) {
      dirs.unshift(normalizedWorkspace)
    }

    // Load .editorconfig from each directory
    for (const dir of dirs) {
      const configPath = `${dir}/.editorconfig`

      // Check cache first
      if (this.cache.has(configPath)) {
        const config = this.cache.get(configPath)!
        configs.push({ path: configPath, config })
        if (config.root) break // Stop if root=true
        continue
      }

      // Try to load the file
      try {
        const content = await readFile(configPath)
        if (content !== null) {
          const config = parseEditorConfig(content)
          this.cache.set(configPath, config)
          configs.push({ path: configPath, config })
          if (config.root) break // Stop if root=true
        }
      } catch {
        // File doesn't exist or can't be read, continue
      }
    }

    return configs
  }

  /**
   * Get Monaco options for a file
   */
  async getMonacoOptionsForFile(
    filePath: string,
    readFile: (path: string) => Promise<string | null>
  ): Promise<MonacoEditorOptions> {
    const configs = await this.loadConfigsForFile(filePath, readFile)
    const settings = getSettingsForFile(configs, filePath)
    return toMonacoOptions(settings)
  }

  /**
   * Get raw EditorConfig settings for a file (useful for save operations)
   */
  async getSettingsForFile(
    filePath: string,
    readFile: (path: string) => Promise<string | null>
  ): Promise<EditorConfigSettings> {
    const configs = await this.loadConfigsForFile(filePath, readFile)
    return getSettingsForFile(configs, filePath)
  }

  /**
   * Clear the cache (call when .editorconfig files change)
   */
  clearCache() {
    this.cache.clear()
  }
}

// Singleton instance
export const editorConfigManager = new EditorConfigManager()

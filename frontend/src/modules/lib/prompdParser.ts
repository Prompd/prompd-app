import YAML from 'yaml'

export type Issue = {
  severity: 'error' | 'warning' | 'info'
  message: string
  line?: number
  column?: number
  code?: string
}

export type ParamsSchema = Record<string, {
  type: 'string' | 'boolean' | 'integer' | 'float' | 'array' | 'object'
  description?: string
  enum?: any[]
  default?: any
  required?: boolean
  pattern?: string
  min?: number
  max?: number
}>

export type ParsedPrompd = {
  frontmatter: any
  body: string
  issues: Issue[]
  paramsSchema: ParamsSchema
}

const isKebab = (s: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)

export function parsePrompd(text: string): ParsedPrompd {
  const issues: Issue[] = []
  let frontmatter: any = {}
  let body = text

  const lines = text.split(/\r?\n/)
  if (lines[0]?.trim() === '---') {
    // frontmatter block
    const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
    if (end > 0) {
      const yamlText = lines.slice(1, end).join('\n')
      try {
        frontmatter = YAML.parse(yamlText) ?? {}
      } catch (e: any) {
        // Try to extract actual line/column from YAML error message
        // Common formats: "at line 6, column 5" or "Implicit keys need to be on a single line at line 6"
        const errorMessage = e?.message ?? String(e)
        let errorLine = 2 // Default to line 2 (first line after opening ---)
        let errorColumn: number | undefined

        const lineMatch = errorMessage.match(/at line (\d+)(?:,? column (\d+))?/)
        if (lineMatch) {
          // YAML error lines are relative to the YAML content, add 1 for the opening ---
          errorLine = parseInt(lineMatch[1], 10) + 1
          if (lineMatch[2]) {
            errorColumn = parseInt(lineMatch[2], 10)
          }
        }

        issues.push({ severity: 'error', message: `YAML parse error: ${errorMessage}`, line: errorLine, column: errorColumn })
      }
      body = lines.slice(end + 1).join('\n')
    } else {
      issues.push({ severity: 'error', message: 'Unterminated frontmatter (missing closing ---)', line: 1 })
    }
  } else {
    issues.push({ severity: 'warning', message: 'Missing frontmatter --- block at top', line: 1 })
  }

  // Basic validations
  if (frontmatter) {
    // Either id or name is required
    if (!frontmatter.id && !frontmatter.name) {
      issues.push({ severity: 'error', message: 'Missing required id or name in frontmatter', line: 2 })
    } else if (frontmatter.id && !isKebab(String(frontmatter.id))) {
      issues.push({ severity: 'error', message: 'id must be kebab-case', line: findLine(lines, /^id\s*:/) ?? 2 })
    }
  }

  // Params schema (lightweight). Support both legacy `params` object map and spec `parameters` array
  const paramsSchema: ParamsSchema = {}
  const paramsRaw = (frontmatter?.params ?? {}) as Record<string, any>
  const parametersRaw = frontmatter?.parameters as any

  if (Array.isArray(parametersRaw)) {
    parametersRaw.forEach((item: any) => {
      if (!item || typeof item !== 'object') return
      const key = String(item.name || '').trim()
      if (!key) return
      let type: any = item.type ?? 'string'
      if (!['string', 'boolean', 'integer', 'float', 'array', 'object'].includes(type)) type = 'string'
      paramsSchema[key] = {
        type,
        description: item.description,
        enum: item.enum,
        default: item.default,
        required: item.required,
        pattern: item.pattern,
        min: item.min_value ?? item.min ?? undefined,
        max: item.max_value ?? item.max ?? undefined,
      }
    })
  } else {
    Object.entries(paramsRaw).forEach(([key, spec]) => {
      let type: any = (typeof spec === 'string' ? spec : spec?.type) ?? 'string'
      if (!['string', 'boolean', 'integer', 'float', 'array', 'object'].includes(type)) type = 'string'
      paramsSchema[key] = { type, description: typeof spec === 'object' ? spec?.description : undefined }
    })
  }

  return { frontmatter, body, issues, paramsSchema }
}

function findLine(lines: string[], re: RegExp): number | undefined {
  const idx = lines.findIndex(l => re.test(l))
  return idx >= 0 ? idx + 1 : undefined
}

// Section parsing helpers
export type Section = { name: string; start: number; end: number; content: string }

const KNOWN_SECTIONS = ['System', 'Context', 'User', 'Response', 'Assistant']

export function splitFrontmatter(text: string): { frontmatterText: string; bodyText: string } {
  const lines = text.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return { frontmatterText: '', bodyText: text }
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
  if (end > 0) {
    const fm = lines.slice(0, end + 1).join('\n')
    const body = lines.slice(end + 1).join('\n')
    return { frontmatterText: fm + '\n', bodyText: body }
  }
  return { frontmatterText: '', bodyText: text }
}

export function parseSections(bodyText: string): Section[] {
  const lines = bodyText.split(/\r?\n/)
  const sections: Section[] = []
  let current: { name: string; start: number } | null = null
  const pushCurrent = (endIdx: number) => {
    if (!current) return
    const start = current.start
    const end = endIdx
    const content = lines.slice(start + 1, end).join('\n').replace(/^\n+|\n+$/g, '')
    sections.push({ name: current.name, start, end, content })
  }
  for (let i = 0; i < lines.length; i++) {
    const m = /^#\s+(.+?)\s*$/.exec(lines[i])
    if (m) {
      const name = m[1].trim()
      if (current) pushCurrent(i)
      if (KNOWN_SECTIONS.includes(name)) {
        current = { name, start: i }
      } else {
        // treat unknown top-level headers as generic sections too
        current = { name, start: i }
      }
    }
  }
  if (current) pushCurrent(lines.length)
  if (sections.length === 0) {
    // Fallback single section
    return [{ name: 'Body', start: 0, end: lines.length, content: bodyText.trim() }]
  }
  return sections
}

export function buildBodyFromSections(sections: Pick<Section, 'name' | 'content'>[]): string {
  return sections
    .map(s => `# ${s.name}\n\n${(s.content || '').replace(/^\n+|\n+$/g, '')}`)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n') + '\n'
}

/**
 * Strip prompd content file frontmatter if present.
 * This is used for packaged code files (.ts, .js, etc.) that have frontmatter
 * added for security (makes them non-executable).
 *
 * Only strips frontmatter that contains `prompd_content_file: true`.
 * Regular .prmd frontmatter is NOT stripped.
 */
export function stripContentFrontmatter(content: string): string {
  // Must start with frontmatter delimiter (handle both Unix and Windows line endings)
  const startsWithUnix = content.startsWith('---\n')
  const startsWithWindows = content.startsWith('---\r\n')
  if (!startsWithUnix && !startsWithWindows) return content

  // Normalize to find the closing delimiter
  const startOffset = startsWithWindows ? 5 : 4  // '---\r\n' = 5, '---\n' = 4

  // Find closing delimiter (check both line ending styles)
  let endIndex = content.indexOf('\n---\n', startOffset)
  let endDelimiterLength = 5  // '\n---\n' = 5

  if (endIndex === -1) {
    endIndex = content.indexOf('\r\n---\r\n', startOffset)
    endDelimiterLength = 7  // '\r\n---\r\n' = 7
  }
  if (endIndex === -1) {
    // Mixed: Unix start, Windows end or vice versa
    endIndex = content.indexOf('\n---\r\n', startOffset)
    endDelimiterLength = 6
  }
  if (endIndex === -1) {
    endIndex = content.indexOf('\r\n---\n', startOffset)
    endDelimiterLength = 6
  }

  if (endIndex === -1) return content

  // Check for prompd content file marker
  const frontmatter = content.slice(startOffset, endIndex)
  if (!frontmatter.includes('prompd_content_file: true')) {
    return content // Regular frontmatter, don't strip
  }

  // Strip the prompd content frontmatter
  return content.slice(endIndex + endDelimiterLength)
}

/**
 * Comprehensive validation for .prmd files including Jinja2 template syntax
 * Used during package builds to catch all validation errors
 */
export function validatePrompdComprehensive(text: string): ParsedPrompd {
  // Start with basic parsing
  const result = parsePrompd(text)

  // Add Jinja2 template syntax validation to the body
  if (result.body) {
    const bodyStartLine = text.split(/\r?\n/).findIndex((line, i) => {
      if (i === 0) return false
      const lines = text.split(/\r?\n/)
      return lines[i - 1]?.trim() === '---' && i > 1
    }) + 1

    const jinjaIssues = validateJinja2Syntax(result.body, bodyStartLine)
    result.issues.push(...jinjaIssues)
  }

  return result
}

/**
 * Validate Jinja2 template syntax ({% %} and {{ }})
 * Matches the validation logic from validation.ts but standalone
 */
function validateJinja2Syntax(body: string, bodyStartLine: number): Issue[] {
  const issues: Issue[] = []

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
    const matchIndex = match.index
    const lineNumber = body.substring(0, matchIndex).split('\n').length + bodyStartLine
    const column = body.substring(0, matchIndex).split('\n').pop()!.length + 1

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
        issues.push({
          severity: 'error',
          message: `Unexpected {% ${tag} %} - no matching opening tag found.`,
          line: lineNumber,
          column,
          code: 'jinja-unmatched-end-tag'
        })
      } else {
        const lastOpen = blockStack[blockStack.length - 1]
        if (blockPairs[lastOpen.tag] === tag) {
          // Properly matched
          blockStack.pop()
        } else {
          // Mismatched closing tag
          issues.push({
            severity: 'error',
            message: `Mismatched {% ${tag} %} - expected {% ${blockPairs[lastOpen.tag]} %} to close {% ${lastOpen.tag} %} on line ${lastOpen.lineNumber}.`,
            line: lineNumber,
            column,
            code: 'jinja-mismatched-tag'
          })
        }
      }
    }
  }

  // Report unclosed opening tags
  for (const unclosed of blockStack) {
    issues.push({
      severity: 'error',
      message: `Unclosed {% ${unclosed.tag} %} - add {% ${blockPairs[unclosed.tag]} %} to close it.`,
      line: unclosed.lineNumber,
      column: unclosed.column,
      code: 'jinja-unclosed-tag'
    })
  }

  return issues
}

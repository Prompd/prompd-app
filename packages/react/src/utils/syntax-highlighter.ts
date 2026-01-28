/**
 * Syntax highlighter for .prmd files (YAML + Markdown)
 */

/**
 * Escape HTML special characters
 */
function escape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Highlight .prmd file content with syntax colors
 * Supports YAML frontmatter and Markdown content
 */
export function highlightPrompd(content: string): string {
  // Normalize line endings (handle Windows CRLF \r\n)
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n')
  const highlighted: string[] = []
  let inFrontmatter = false

  lines.forEach((line, idx) => {
    // Detect frontmatter boundaries
    if (line.trim() === '---') {
      if (!inFrontmatter && idx < 10) { // First --- within first 10 lines
        inFrontmatter = true
        highlighted.push('<span style="color: #64748b; font-weight: 500;">---</span>')
        return
      } else if (inFrontmatter) {
        inFrontmatter = false
        highlighted.push('<span style="color: #64748b; font-weight: 500;">---</span>')
        return
      }
    }

    // YAML frontmatter highlighting
    if (inFrontmatter) {
      // Empty lines
      if (line.trim() === '') {
        highlighted.push('')
        return
      }

      // List items starting with "-"
      if (line.match(/^(\s*)-\s+(.*)$/)) {
        const match = line.match(/^(\s*)-(\s+)(.*)$/)!
        const [, indent, spacing, rest] = match

        // Check if this is a key-value pair after the dash
        const kvMatch = rest.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)(\s*:\s*)(.*)$/)
        if (kvMatch) {
          const [, key, colon, value] = kvMatch
          highlighted.push(
            escape(indent) +
            '<span style="color: #64748b;">-</span>' +
            escape(spacing) +
            `<span style="color: #0891b2; font-weight: 500;">${escape(key)}</span>` +
            `<span style="color: #64748b;">${escape(colon)}</span>` +
            highlightYamlValue(value)
          )
        } else {
          // Just a list item
          highlighted.push(
            escape(indent) +
            '<span style="color: #64748b;">-</span>' +
            escape(spacing) +
            highlightYamlValue(rest)
          )
        }
        return
      }

      // Key-value pairs
      const keyValueMatch = line.match(/^(\s*)([a-zA-Z_][a-zA-Z0-9_-]*)(\s*:\s*)(.*)$/)
      if (keyValueMatch) {
        const [, indent, key, colon, value] = keyValueMatch
        highlighted.push(
          escape(indent) +
          `<span style="color: #0891b2; font-weight: 500;">${escape(key)}</span>` +
          `<span style="color: #64748b;">${escape(colon)}</span>` +
          highlightYamlValue(value)
        )
        return
      }

      // Fallback for other lines
      highlighted.push(`<span style="color: #475569;">${escape(line)}</span>`)
    }
    // Markdown highlighting
    else {
      // Headers
      if (line.match(/^#{1,6}\s/)) {
        highlighted.push(`<span style="color: #2563eb; font-weight: 600;">${escape(line)}</span>`)
      }
      // Code blocks ```
      else if (line.trim().startsWith('```')) {
        highlighted.push(`<span style="color: #64748b; font-style: italic;">${escape(line)}</span>`)
      }
      // Bold **text**
      else if (line.includes('**')) {
        highlighted.push(
          escape(line).replace(/\*\*([^*]+)\*\*/g, '<span style="font-weight: 600; color: #1e293b;">**$1**</span>')
        )
      }
      // Control statements {%- if ... %} or {% ... %}
      else if (line.includes('{%')) {
        highlighted.push(
          escape(line)
            .replace(/\{%-?\s*([^%]+?)\s*-?%\}/g, '<span class="prompd-control">{$1}</span>')
            .replace(/\{([^}%]+)\}/g, '<span class="prompd-param">{$1}</span>')
        )
      }
      // Parameters {param}
      else if (line.includes('{')) {
        highlighted.push(
          escape(line).replace(/\{([^}]+)\}/g, '<span class="prompd-param">{$1}</span>')
        )
      }
      // Lists
      else if (line.match(/^(\s*)[-*+]\s/)) {
        highlighted.push(`<span style="color: #475569;">${escape(line)}</span>`)
      }
      else {
        highlighted.push(escape(line))
      }
    }
  })

  return highlighted.join('<br>')
}

/**
 * Highlight YAML values with proper type coloring
 */
function highlightYamlValue(value: string): string {
  const trimmed = value.trim()

  // Boolean values
  if (trimmed === 'true' || trimmed === 'false') {
    return `<span style="color: #7c3aed; font-weight: 500;">${escape(value)}</span>`
  }

  // Numbers
  if (trimmed.match(/^-?\d+(\.\d+)?$/)) {
    return `<span style="color: #059669; font-weight: 500;">${escape(value)}</span>`
  }

  // Quoted strings
  if (trimmed.match(/^["'].*["']$/)) {
    return `<span style="color: #ea580c;">${escape(value)}</span>`
  }

  // Arrays [...]
  if (trimmed.match(/^\[.*\]$/)) {
    return `<span style="color: #475569;">${escape(value)}</span>`
  }

  // Empty value (just the colon)
  if (trimmed === '') {
    return ''
  }

  // Default string value
  return `<span style="color: #ea580c;">${escape(value)}</span>`
}

/**
 * Color scheme for syntax highlighting
 */
export const SYNTAX_COLORS = {
  yamlKey: '#0891b2',      // cyan-600 - YAML keys (more readable)
  yamlString: '#ea580c',   // orange-600 - String values
  yamlNumber: '#059669',   // emerald-600 - Number values
  yamlBoolean: '#7c3aed',  // violet-600 - Boolean values
  separator: '#64748b',    // slate-500 - Separators, lists, delimiters
  header: '#2563eb',       // blue-600 - Markdown headers
  parameter: '#7c3aed',    // violet-600 - Template parameters
  comment: '#94a3b8',      // slate-400 - Comments
  text: '#475569',         // slate-600 - Default text
} as const

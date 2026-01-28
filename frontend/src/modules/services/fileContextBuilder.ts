/**
 * File Context Builder
 *
 * Builds context messages for LLM conversations based on file content and type.
 * Provides consistent file context across ChatTab and AiChatPanel.
 */

import { parsePrompd } from '../lib/prompdParser'

export interface FileContext {
  fileName: string | null
  content: string
  cursorPosition?: { line: number; column: number }
}

export interface ContextMessage {
  role: 'system'
  content: string
}

/**
 * Build context messages for a file to send to the LLM.
 * Provides rich metadata extraction for .prmd files and appropriate
 * syntax hints for other file types.
 */
export function buildFileContextMessages(context: FileContext): ContextMessage[] {
  const { fileName, content, cursorPosition } = context

  if (!content || typeof content !== 'string') {
    return []
  }

  const messages: ContextMessage[] = []

  // Include line numbers for better edit references
  const numberedContent = content
    .split('\n')
    .map((line, i) => `${String(i + 1).padStart(3, ' ')} | ${line}`)
    .join('\n')

  // Include cursor position if available
  const cursorInfo = cursorPosition
    ? `\n\n**User's cursor is at line ${cursorPosition.line}, column ${cursorPosition.column}**`
    : ''

  // Determine file type and build metadata context
  const isPrompdFile = fileName?.endsWith('.prmd') || fileName?.endsWith('.prompd')
  let metadataContext = ''
  let syntaxHint = 'text'
  let fileTypeInstructions = ''

  if (isPrompdFile) {
    // Parse .prmd file to extract rich metadata
    const parsed = parsePrompd(content)
    const fm = parsed.frontmatter || {}

    syntaxHint = 'yaml'
    fileTypeInstructions = `This is a Prompd prompt file (.prmd) with YAML frontmatter and markdown body.
When modifying this file:
- Maintain valid YAML frontmatter between --- delimiters
- Ensure id, name, and version fields are present
- Parameters must use array format with "- name:" syntax
- Keep markdown sections (## System, ## Instructions, etc.) well-structured`

    // Build metadata context
    const metadataParts: string[] = []

    if (fm.id) metadataParts.push(`- **ID**: ${fm.id}`)
    if (fm.name) metadataParts.push(`- **Name**: ${fm.name}`)
    if (fm.version) metadataParts.push(`- **Version**: ${fm.version}`)
    if (fm.description) metadataParts.push(`- **Description**: ${fm.description}`)

    // Inheritance info - critical for the agent to know
    if (fm.inherits) {
      metadataParts.push(`- **Inherits from**: \`${fm.inherits}\``)
    }

    // Using declarations - helps resolve package aliases
    if (fm.using && Array.isArray(fm.using) && fm.using.length > 0) {
      metadataParts.push(`- **Using declarations**:`)
      fm.using.forEach((u: { name?: string; prefix?: string }) => {
        if (u.name && u.prefix) {
          metadataParts.push(`  - \`${u.prefix}\` = \`${u.name}\``)
        }
      })
    }

    // Parameters - the agent often needs to know these
    if (Object.keys(parsed.paramsSchema).length > 0) {
      metadataParts.push(`- **Parameters** (${Object.keys(parsed.paramsSchema).length} defined):`)
      Object.entries(parsed.paramsSchema).forEach(([name, schema]) => {
        const required = schema.required ? ' (required)' : ''
        metadataParts.push(`  - \`${name}\`: ${schema.type}${required}`)
      })
    }

    if (metadataParts.length > 0) {
      metadataContext = `\n\n### File Metadata\n${metadataParts.join('\n')}`

      // Add inheritance resolution help
      if (fm.inherits && fm.using) {
        // Check if inherits uses an alias
        const aliasMatch = fm.inherits.match(/^@(\w+)\/(.+)$/)
        if (aliasMatch) {
          const alias = `@${aliasMatch[1]}`
          const filePath = aliasMatch[2]
          const usingDecl = fm.using.find((u: { prefix?: string }) => u.prefix === alias)
          if (usingDecl && usingDecl.name) {
            // Parse the package name (format: @namespace/package@version)
            const pkgMatch = usingDecl.name.match(/^(@[^@]+)@(.+)$/)
            if (pkgMatch) {
              metadataContext += `\n\n**Resolved inheritance**: \`${fm.inherits}\` resolves to package \`${pkgMatch[1]}\` version \`${pkgMatch[2]}\`, file path \`${filePath}\``
              metadataContext += `\n- Use \`read_package_file\` with package_name=\`${pkgMatch[1]}\`, version=\`${pkgMatch[2]}\`, file_path=\`${filePath}\` to read the base template`
            }
          }
        }
      }
    }
  } else if (fileName) {
    // Get file-type specific instructions for non-prmd files
    const { language, instructions } = getFileTypeContextInstructions(fileName)
    syntaxHint = language
    fileTypeInstructions = instructions
  }

  // Build the file path instruction
  const filePath = fileName || 'untitled'
  const pathInstructions = fileName
    ? `\n\n**IMPORTANT**: When using edit_file or write_file for this file, use path: \`${filePath}\``
    : ''

  // Build final context message
  const contextContent = fileTypeInstructions
    ? `## Context File: ${filePath}${pathInstructions}${cursorInfo}\n\n${fileTypeInstructions}${metadataContext}\n\n\`\`\`${syntaxHint}\n${numberedContent}\n\`\`\``
    : `## Current File: ${filePath}${pathInstructions}${cursorInfo}${metadataContext}\n\n\`\`\`${syntaxHint}\n${numberedContent}\n\`\`\``

  messages.push({
    role: 'system' as const,
    content: contextContent
  })

  return messages
}

/**
 * Get file-type-aware context instructions based on file extension.
 */
function getFileTypeContextInstructions(filename: string): { language: string; instructions: string } {
  const lower = filename.toLowerCase()

  // JSON files
  if (lower.endsWith('.json')) {
    return {
      language: 'json',
      instructions: `This is a JSON file. Ensure any modifications maintain valid JSON syntax with proper quoting and comma placement.`
    }
  }

  // YAML files
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) {
    return {
      language: 'yaml',
      instructions: `This is a YAML file. Maintain proper indentation (spaces, not tabs) and valid YAML syntax.`
    }
  }

  // TypeScript/JavaScript
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) {
    return {
      language: 'typescript',
      instructions: `This is a TypeScript file. Maintain type safety and follow existing code patterns.`
    }
  }
  if (lower.endsWith('.js') || lower.endsWith('.jsx') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) {
    return {
      language: 'javascript',
      instructions: `This is a JavaScript file. Follow existing code patterns and conventions.`
    }
  }

  // Python
  if (lower.endsWith('.py') || lower.endsWith('.pyw') || lower.endsWith('.pyi')) {
    return {
      language: 'python',
      instructions: `This is a Python file. Follow PEP 8 style guidelines and maintain proper indentation.`
    }
  }

  // Markdown
  if (lower.endsWith('.md') || lower.endsWith('.mdx')) {
    return {
      language: 'markdown',
      instructions: `This is a Markdown file. Use proper heading hierarchy and formatting.`
    }
  }

  // CSS/SCSS
  if (lower.endsWith('.css') || lower.endsWith('.scss') || lower.endsWith('.sass') || lower.endsWith('.less')) {
    return {
      language: lower.endsWith('.css') ? 'css' : 'scss',
      instructions: `This is a stylesheet. Follow existing naming conventions and maintain consistent formatting.`
    }
  }

  // HTML
  if (lower.endsWith('.html') || lower.endsWith('.htm')) {
    return {
      language: 'html',
      instructions: `This is an HTML file. Maintain valid HTML structure and proper indentation.`
    }
  }

  // Shell scripts
  if (lower.endsWith('.sh') || lower.endsWith('.bash') || lower.endsWith('.zsh')) {
    return {
      language: 'bash',
      instructions: `This is a shell script. Use proper quoting and error handling.`
    }
  }

  // SQL
  if (lower.endsWith('.sql')) {
    return {
      language: 'sql',
      instructions: `This is a SQL file. Use consistent casing for keywords and proper formatting.`
    }
  }

  // Go
  if (lower.endsWith('.go')) {
    return {
      language: 'go',
      instructions: `This is a Go file. Follow Go conventions and use gofmt-style formatting.`
    }
  }

  // Rust
  if (lower.endsWith('.rs')) {
    return {
      language: 'rust',
      instructions: `This is a Rust file. Follow Rust conventions and ensure proper ownership/borrowing.`
    }
  }

  // Default for other text files
  const ext = lower.split('.').pop() || ''
  return {
    language: ext || 'text',
    instructions: `Reference this file when relevant to the user's request.`
  }
}

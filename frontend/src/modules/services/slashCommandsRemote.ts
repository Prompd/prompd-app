/**
 * Slash Commands - Remote (Browser) Implementation
 *
 * Executes slash commands via backend API endpoints.
 * Used when running in a browser without Electron.
 */

import type { SlashCommandResult, SlashCommandContext } from './slashCommands'
import { SLASH_COMMANDS } from './slashCommands'
import { getBackendHost } from './apiConfig'
import { parsePrompd } from '../lib/prompdParser'

/**
 * Execute a slash command via backend API
 */
export async function executeSlashCommandRemote(
  commandId: string,
  args: string,
  context: SlashCommandContext
): Promise<SlashCommandResult> {
  switch (commandId) {
    case 'validate':
      return executeValidate(context.fileContent!, context.fileName, context.getToken)

    case 'explain':
      // Explain can run client-side using the parser
      return executeExplain(context.fileContent!, context.fileName)

    case 'compile':
      return executeCompile(context.fileContent!, context.fileName, context.getToken)

    case 'deps':
      // Deps can run client-side using the parser
      return executeDeps(context.fileContent!, context.fileName)

    case 'search':
      return executeSearch(args, context.getToken)

    case 'install':
      return executeInstall(args, context.workspacePath, context.getToken)

    case 'list':
      return executeList(context.workspacePath!)

    case 'new':
      return executeNew(args)

    case 'help':
      return executeHelp()

    default:
      return {
        success: false,
        output: '',
        error: `Command /${commandId} not implemented`
      }
  }
}

// API-based implementations

async function executeValidate(
  content: string,
  fileName?: string,
  getToken?: () => Promise<string>
): Promise<SlashCommandResult> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }

    if (getToken) {
      try {
        const token = await getToken()
        if (token) headers['Authorization'] = `Bearer ${token}`
      } catch {
        // Continue without auth - use client-side validation
      }
    }

    // Try backend validation first
    try {
      const response = await fetch(`${getBackendHost()}/api/compilation/validate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ content, context: { fileName } })
      })

      if (response.ok) {
        const result = await response.json()
        const data = result.data || result

        if (data.isValid) {
          return {
            success: true,
            output: `**Validation passed** for ${fileName || 'file'}\n\nNo issues found.`,
            data
          }
        } else {
          const issues = (data.errors || []).concat(data.warnings || [])
            .map((i: { message: string; line?: number }) =>
              `- ${i.message}${i.line ? ` (line ${i.line})` : ''}`
            ).join('\n') || 'Unknown error'

          return {
            success: false,
            output: `**Validation failed** for ${fileName || 'file'}\n\n${issues}`,
            data
          }
        }
      }
    } catch {
      // Backend unavailable, fall through to client-side
    }

    // Fallback to client-side validation
    return executeValidateClientSide(content, fileName)
  } catch (err) {
    return {
      success: false,
      output: '',
      error: err instanceof Error ? err.message : 'Validation failed'
    }
  }
}

function executeValidateClientSide(content: string, fileName?: string): SlashCommandResult {
  const parsed = parsePrompd(content)

  if (parsed.issues.length === 0) {
    return {
      success: true,
      output: `**Validation passed** for ${fileName || 'file'}\n\nNo issues found.`,
      data: { valid: true, parsed }
    }
  }

  const issuesList = parsed.issues.map(issue => {
    const location = issue.line ? ` (line ${issue.line}${issue.column ? `:${issue.column}` : ''})` : ''
    return `- **${issue.severity}**: ${issue.message}${location}`
  }).join('\n')

  const hasErrors = parsed.issues.some(i => i.severity === 'error')

  return {
    success: !hasErrors,
    output: `**Validation ${hasErrors ? 'failed' : 'warnings'}** for ${fileName || 'file'}\n\n${issuesList}`,
    data: { valid: !hasErrors, issues: parsed.issues }
  }
}

function executeExplain(content: string, fileName?: string): SlashCommandResult {
  const parsed = parsePrompd(content)

  if (parsed.issues.some(i => i.severity === 'error' && i.message.includes('frontmatter'))) {
    return {
      success: false,
      output: '',
      error: 'Could not parse file - missing or invalid YAML frontmatter'
    }
  }

  const fm = parsed.frontmatter || {}
  const sectionMatches = parsed.body.match(/^#+\s+.+$/gm) || []
  const sections = sectionMatches.map(s => s.replace(/^#+\s+/, ''))
  const paramCount = Object.keys(parsed.paramsSchema).length

  const output = `## ${fileName || 'File'} Structure

**Metadata:**
- ID: \`${fm.id || 'not set'}\`
- Name: ${fm.name || 'not set'}
- Version: ${fm.version || '1.0.0'}
${fm.description ? `- Description: ${fm.description}` : ''}
${fm.inherits ? `- Inherits: \`${fm.inherits}\`` : ''}

**Sections:** ${sections.length > 0 ? sections.join(', ') : 'None defined'}

**Parameters:** ${paramCount} defined
${paramCount > 0 ? '\n' + Object.entries(parsed.paramsSchema).map(([key, spec]) =>
    `- \`${key}\`: ${spec.type}${spec.required ? ' (required)' : ''}${spec.description ? ` - ${spec.description}` : ''}`
  ).join('\n') : ''}`

  return {
    success: true,
    output,
    data: { frontmatter: fm, sections, paramCount, paramsSchema: parsed.paramsSchema }
  }
}

async function executeCompile(
  content: string,
  fileName?: string,
  getToken?: () => Promise<string>
): Promise<SlashCommandResult> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }

    if (getToken) {
      try {
        const token = await getToken()
        if (token) headers['Authorization'] = `Bearer ${token}`
      } catch {
        // Continue without auth
      }
    }

    const response = await fetch(`${getBackendHost()}/api/compilation/compile`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content,
        format: 'markdown',
        parameters: {}
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Compilation failed: ${response.status} ${errorText}`)
    }

    const result = await response.json()
    const output = result.data?.output || result.output || result.compiled || ''

    return {
      success: true,
      output: `**Compiled output:**\n\n\`\`\`markdown\n${output}\n\`\`\``,
      data: result.data || result
    }
  } catch (err) {
    return {
      success: false,
      output: '',
      error: err instanceof Error ? err.message : 'Compilation failed'
    }
  }
}

function executeDeps(content: string, fileName?: string): SlashCommandResult {
  const parsed = parsePrompd(content)
  const fm = parsed.frontmatter || {}

  const inherits = fm.inherits || null
  const using = fm.using || []
  const packages: string[] = []

  if (Array.isArray(using)) {
    for (const item of using) {
      if (typeof item === 'string') {
        packages.push(item)
      } else if (item && typeof item === 'object' && item.name) {
        packages.push(item.name)
      }
    }
  }

  if (!inherits && packages.length === 0) {
    return { success: true, output: `**${fileName || 'File'}** has no dependencies.` }
  }

  let output = `## Dependencies for ${fileName || 'file'}\n\n`

  if (inherits) {
    output += `**Inherits from:** \`${inherits}\`\n\n`
  }

  if (packages.length > 0) {
    output += `**Using packages:**\n${packages.map(p => `- \`${p}\``).join('\n')}\n`
  }

  return { success: true, output, data: { inherits, packages } }
}

async function executeSearch(
  query: string,
  getToken?: () => Promise<string>
): Promise<SlashCommandResult> {
  if (!query.trim()) {
    return { success: false, output: '', error: 'Please provide a search query: /search <query>' }
  }

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }

    if (getToken) {
      try {
        const token = await getToken()
        if (token) headers['Authorization'] = `Bearer ${token}`
      } catch {
        // Continue without auth
      }
    }

    const response = await fetch(
      `${getBackendHost()}/api/registry/search?q=${encodeURIComponent(query)}`,
      { headers }
    )

    if (!response.ok) {
      throw new Error('Search failed')
    }

    const result = await response.json()
    const packages = result.data?.packages || result.packages || result.results || []

    if (packages.length === 0) {
      return { success: true, output: `No packages found for "${query}"` }
    }

    const output = `## Search results for "${query}"\n\n` +
      packages.slice(0, 5).map((pkg: { name: string; description?: string; version?: string }) =>
        `- **${pkg.name}**${pkg.version ? ` v${pkg.version}` : ''}\n  ${pkg.description || 'No description'}`
      ).join('\n\n') +
      (packages.length > 5 ? `\n\n...and ${packages.length - 5} more` : '')

    return { success: true, output, data: packages }
  } catch (err) {
    return {
      success: false,
      output: '',
      error: 'Failed to search registry. Make sure the backend is running.'
    }
  }
}

async function executeInstall(
  packageRef: string,
  workspacePath?: string,
  getToken?: () => Promise<string>
): Promise<SlashCommandResult> {
  if (!packageRef.trim()) {
    return { success: false, output: '', error: 'Please provide a package: /install <package@version>' }
  }

  // In browser mode, we can't directly install packages
  // Return instructions for manual installation
  return {
    success: true,
    output: `To install **${packageRef}**:\n\n1. Use the **Package Browser** panel to search and install\n2. Or run \`prompd install ${packageRef}\` in your terminal\n\nWorkspace: \`${workspacePath || 'not set'}\``,
    data: { packageRef }
  }
}

function executeList(workspacePath: string): SlashCommandResult {
  // In browser mode, we can't list local files
  return {
    success: true,
    output: `To see all .prmd files, use the **Explorer** panel (Ctrl+B).\n\nWorkspace: \`${workspacePath}\``
  }
}

function executeNew(name?: string): SlashCommandResult {
  const filename = name?.trim() || 'new-prompt'
  const safeName = filename.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase()

  return {
    success: true,
    output: `To create a new prompt, click the **New Prompt** button in the header, or use **Ctrl+N**.\n\nSuggested name: \`${safeName}.prmd\``,
    data: { suggestedName: safeName }
  }
}

function executeHelp(): SlashCommandResult {
  const categories = {
    file: 'File Commands',
    registry: 'Registry Commands',
    workspace: 'Workspace Commands',
    help: 'Help'
  }

  let output = '## Available Slash Commands\n\n'

  for (const [category, title] of Object.entries(categories)) {
    const commands = SLASH_COMMANDS.filter(c => c.category === category)
    if (commands.length === 0) continue

    output += `### ${title}\n`
    for (const cmd of commands) {
      output += `- \`/${cmd.name}${cmd.args ? ' ' + cmd.args : ''}\` - ${cmd.description}\n`
    }
    output += '\n'
  }

  output += `Type \`/\` to see the command menu, or type the full command and press Enter.`

  return { success: true, output }
}

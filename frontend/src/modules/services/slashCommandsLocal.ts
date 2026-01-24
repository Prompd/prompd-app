/**
 * Slash Commands - Local (Electron) Implementation
 *
 * Executes slash commands locally using Electron IPC to call @prompd/cli
 * in the main process. This provides offline capability and faster execution.
 */

import type { SlashCommandResult, SlashCommandContext } from './slashCommands'
import { SLASH_COMMANDS } from './slashCommands'
import { parsePrompd } from '../lib/prompdParser'

// ElectronAPI is declared in src/electron.d.ts

/**
 * Execute a slash command locally in Electron
 */
export async function executeSlashCommandLocal(
  commandId: string,
  args: string,
  context: SlashCommandContext
): Promise<SlashCommandResult> {
  // Commands that can run entirely in the renderer process
  switch (commandId) {
    case 'help':
      return executeHelp()

    case 'new':
      return executeNew(args)

    case 'explain':
      return executeExplain(context.fileContent!, context.fileName)

    case 'deps':
      return executeDeps(context.fileContent!, context.fileName)

    case 'validate':
      return await executeValidate(context.fileContent!, context.fileName)

    case 'build':
      return executeBuild()

    case 'publish':
      return executePublish()

    case 'install':
      return await executeInstall(args, context.workspacePath)
  }

  // Commands that need IPC to main process (use @prompd/cli)
  if (window.electronAPI?.executeSlashCommand) {
    try {
      return await window.electronAPI.executeSlashCommand(commandId, args, {
        fileContent: context.fileContent,
        fileName: context.fileName,
        workspacePath: context.workspacePath,
        registryUrl: context.registryUrl
      })
    } catch (err) {
      return {
        success: false,
        output: '',
        error: err instanceof Error ? err.message : 'IPC command failed'
      }
    }
  }

  // Fallback for commands not yet implemented in IPC
  switch (commandId) {
    case 'compile':
      return {
        success: false,
        output: '',
        error: 'Compile command requires @prompd/cli IPC handler (not yet implemented)'
      }

    case 'search':
      return {
        success: false,
        output: '',
        error: 'Search command requires registry connection'
      }

    case 'list':
      return executeList(context.workspacePath!)

    default:
      return {
        success: false,
        output: '',
        error: `Command /${commandId} not implemented for Electron`
      }
  }
}

// Local implementations (no IPC needed)

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

function executeNew(name?: string): SlashCommandResult {
  const filename = name?.trim() || 'new-prompt'
  const safeName = filename.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase()

  return {
    success: true,
    output: `To create a new prompt, click the **New Prompt** button in the header, or use **Ctrl+N**.\n\nSuggested name: \`${safeName}.prmd\``,
    data: { suggestedName: safeName }
  }
}

async function executeValidate(content: string, fileName?: string): Promise<SlashCommandResult> {
  // Use the existing prompdParser for basic validation
  const parsed = parsePrompd(content)
  const allIssues = [...parsed.issues]

  // Also fetch compiler diagnostics for deeper validation (inheritance, semantic checks)
  if (window.electronAPI?.compiler?.getDiagnostics) {
    try {
      const result = await window.electronAPI.compiler.getDiagnostics(content, {
        filePath: fileName || undefined
      })

      if (result.success && result.diagnostics) {
        // Add compiler diagnostics to issues list
        for (const diag of result.diagnostics) {
          // Avoid duplicates by checking message similarity
          const isDuplicate = allIssues.some(existing =>
            existing.message.includes(diag.message) ||
            diag.message.includes(existing.message)
          )
          if (!isDuplicate) {
            allIssues.push({
              severity: diag.severity,
              message: diag.source ? `[${diag.source}] ${diag.message}` : diag.message,
              line: diag.line,
              column: diag.column
            })
          }
        }
      }
    } catch (error) {
      console.warn('[validate] Failed to fetch compiler diagnostics:', error)
    }
  }

  if (allIssues.length === 0) {
    return {
      success: true,
      output: `**Validation passed** for ${fileName || 'file'}\n\nNo issues found.`,
      data: { valid: true, parsed }
    }
  }

  const issuesList = allIssues.map(issue => {
    const location = issue.line ? ` (line ${issue.line}${issue.column ? `:${issue.column}` : ''})` : ''
    return `- **${issue.severity}**: ${issue.message}${location}`
  }).join('\n')

  const hasErrors = allIssues.some(i => i.severity === 'error')

  return {
    success: !hasErrors,
    output: `**Validation ${hasErrors ? 'failed' : 'warnings'}** for ${fileName || 'file'}\n\n${issuesList}`,
    data: { valid: !hasErrors, issues: allIssues }
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

  // Extract sections from body
  const sectionMatches = parsed.body.match(/^#+\s+.+$/gm) || []
  const sections = sectionMatches.map(s => s.replace(/^#+\s+/, ''))

  // Count parameters
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

function executeBuild(): SlashCommandResult {
  // Trigger the build package action via custom event
  // App.tsx listens for this and calls handleBuildPackage
  window.dispatchEvent(new CustomEvent('prompd-build-package'))

  return {
    success: true,
    output: 'Building package... Check the Output panel for status.',
    data: { triggered: true }
  }
}

function executePublish(): SlashCommandResult {
  // Trigger the publish modal via custom event
  // App.tsx listens for this and opens the publish modal
  window.dispatchEvent(new CustomEvent('prompd-publish'))

  return {
    success: true,
    output: 'Opening publish dialog...',
    data: { triggered: true }
  }
}

async function executeInstall(args: string, workspacePath?: string): Promise<SlashCommandResult> {
  const packageRef = args.trim()

  // If no package specified, install all dependencies from prompd.json
  if (!packageRef) {
    if (!workspacePath) {
      return {
        success: false,
        output: '',
        error: 'No workspace open. Open a folder first to install dependencies.'
      }
    }

    // Use the Electron IPC to install all dependencies
    if (!window.electronAPI?.package?.installAll) {
      return {
        success: false,
        output: '',
        error: 'Install requires Electron environment'
      }
    }

    try {
      const result = await window.electronAPI.package.installAll(workspacePath)

      if (!result.success) {
        return {
          success: false,
          output: '',
          error: result.error || result.message || 'Failed to install dependencies'
        }
      }

      // Format output
      let output = `**${result.message}**\n\n`

      if (result.installed && result.installed.length > 0) {
        output += '**Installed:**\n'
        for (const pkg of result.installed) {
          const statusIcon = pkg.status === 'installed' ? '+' : pkg.status === 'cached' ? '=' : '?'
          output += `- [${statusIcon}] \`${pkg.name}@${pkg.version}\` (${pkg.status})\n`
        }
      }

      if (result.failed && result.failed.length > 0) {
        output += '\n**Failed:**\n'
        for (const pkg of result.failed) {
          output += `- \`${pkg.name}@${pkg.version}\`: ${pkg.error}\n`
        }
      }

      return {
        success: true,
        output,
        data: result
      }
    } catch (err) {
      return {
        success: false,
        output: '',
        error: err instanceof Error ? err.message : 'Failed to install dependencies'
      }
    }
  }

  // Specific package installation - for now, return instructions
  // TODO: Implement single package install via IPC when available
  return {
    success: true,
    output: `To install **${packageRef}**:\n\n1. Add it to your \`prompd.json\` dependencies\n2. Run \`/install\` to install all dependencies\n\nOr run \`prompd install ${packageRef}\` in your terminal.`,
    data: { packageRef }
  }
}

async function executeList(workspacePath: string): Promise<SlashCommandResult> {
  // Try to use Electron IPC to list files
  if (window.electronAPI?.listPrmdFiles) {
    try {
      const result = await window.electronAPI.listPrmdFiles(workspacePath)
      if (!result.success) {
        return {
          success: false,
          output: '',
          error: result.error || 'Failed to list files'
        }
      }

      const files = result.files
      if (files.length === 0) {
        return {
          success: true,
          output: `No .prmd files found in workspace.\n\nWorkspace: \`${workspacePath}\``
        }
      }

      const output = `## .prmd files in workspace\n\n${files.map((f: string) => `- \`${f}\``).join('\n')}\n\nWorkspace: \`${workspacePath}\``
      return { success: true, output, data: { files } }
    } catch (err) {
      return {
        success: false,
        output: '',
        error: err instanceof Error ? err.message : 'Failed to list files'
      }
    }
  }

  // Fallback message
  return {
    success: true,
    output: `To see all .prmd files, use the **Explorer** panel (Ctrl+B).\n\nWorkspace: \`${workspacePath}\``
  }
}

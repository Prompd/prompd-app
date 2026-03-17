/**
 * Slash Command Service
 *
 * Shared types and definitions for slash commands.
 * Execution is delegated to local (Electron) or remote (Browser) implementations.
 */

import { executeSlashCommandLocal } from './slashCommandsLocal'
import { executeSlashCommandRemote } from './slashCommandsRemote'

export interface SlashCommand {
  id: string
  name: string
  description: string
  icon: string  // Lucide icon name
  args?: string  // e.g., "<file>" or "[query]"
  category: 'file' | 'registry' | 'workspace' | 'help'
  requiresFile?: boolean  // Requires an open .prmd file
  requiresWorkspace?: boolean  // Requires open workspace
}

export interface SlashCommandResult {
  success: boolean
  output: string
  data?: unknown
  error?: string
}

export interface SlashCommandContext {
  fileContent?: string
  fileName?: string
  workspacePath?: string
  registryUrl?: string
  getToken?: () => Promise<string>
}

// Available slash commands
export const SLASH_COMMANDS: SlashCommand[] = [
  // File operations (require active .prmd file)
  {
    id: 'validate',
    name: 'validate',
    description: 'Validate the current .prmd file for errors',
    icon: 'FileCheck',
    category: 'file',
    requiresFile: true
  },
  {
    id: 'explain',
    name: 'explain',
    description: 'Explain the structure and purpose of this file',
    icon: 'FileText',
    category: 'file',
    requiresFile: true
  },
  {
    id: 'compile',
    name: 'compile',
    description: 'Compile to markdown format',
    icon: 'FileCode',
    category: 'file',
    requiresFile: true
  },
  {
    id: 'deps',
    name: 'deps',
    description: 'Show package dependencies and inherits chain',
    icon: 'GitBranch',
    category: 'file',
    requiresFile: true
  },
  // Registry operations
  {
    id: 'search',
    name: 'search',
    description: 'Search the package registry',
    icon: 'Search',
    args: '<query>',
    category: 'registry'
  },
  {
    id: 'install',
    name: 'install',
    description: 'Install dependencies or a package. Use --global/-g for global install',
    icon: 'Package',
    args: '[package@version] [--global]',
    category: 'registry'
  },
  // Workspace operations
  {
    id: 'build',
    name: 'build',
    description: 'Build package from workspace (.pdpkg)',
    icon: 'Package',
    category: 'workspace',
    requiresWorkspace: true
  },
  {
    id: 'publish',
    name: 'publish',
    description: 'Publish package to registry',
    icon: 'Package',
    category: 'workspace',
    requiresWorkspace: true
  },
  {
    id: 'list',
    name: 'list',
    description: 'List all .prmd files in workspace',
    icon: 'FolderTree',
    category: 'workspace',
    requiresWorkspace: true
  },
  {
    id: 'new',
    name: 'new',
    description: 'Create a new .prmd file',
    icon: 'FilePlus',
    args: '[name]',
    category: 'workspace'
  },
  // Help
  {
    id: 'help',
    name: 'help',
    description: 'Show available commands and usage',
    icon: 'HelpCircle',
    category: 'help'
  }
]

/**
 * Parse a slash command from input text
 */
export function parseSlashCommand(input: string): { command: string; args: string } | null {
  if (!input.startsWith('/')) return null

  const trimmed = input.trim()
  const spaceIndex = trimmed.indexOf(' ')

  if (spaceIndex === -1) {
    return { command: trimmed.slice(1), args: '' }
  }

  return {
    command: trimmed.slice(1, spaceIndex),
    args: trimmed.slice(spaceIndex + 1).trim()
  }
}

/**
 * Check if running in Electron
 */
function isElectron(): boolean {
  return !!(window as any).electronAPI?.isElectron
}

/**
 * Execute a slash command
 * Routes to local (Electron) or remote (Browser) implementation
 */
export async function executeSlashCommand(
  commandId: string,
  args: string,
  context: SlashCommandContext
): Promise<SlashCommandResult> {
  console.log('[SlashCommands] Executing command:', commandId, {
    hasFileContent: !!context.fileContent,
    fileContentLength: context.fileContent?.length,
    fileName: context.fileName,
    args,
    isElectron: isElectron()
  })

  const command = SLASH_COMMANDS.find(c => c.id === commandId)
  if (!command) {
    return { success: false, output: '', error: `Unknown command: /${commandId}` }
  }

  // Check requirements
  if (command.requiresFile && !context.fileContent) {
    return { success: false, output: '', error: 'This command requires an open .prmd file' }
  }
  if (command.requiresWorkspace && !context.workspacePath) {
    return { success: false, output: '', error: 'This command requires an open workspace' }
  }

  try {
    // Route to appropriate implementation
    const result = isElectron()
      ? await executeSlashCommandLocal(commandId, args, context)
      : await executeSlashCommandRemote(commandId, args, context)

    console.log('[SlashCommands] Command result:', commandId, {
      success: result.success,
      outputLength: result.output?.length,
      error: result.error
    })

    return result
  } catch (err) {
    console.error('[SlashCommands] Command error:', commandId, err)
    return {
      success: false,
      output: '',
      error: err instanceof Error ? err.message : 'Command failed'
    }
  }
}

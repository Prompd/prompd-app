/**
 * Environment Variable Loader for Prompd
 *
 * Loads environment variables from multiple sources for compile-time template substitution.
 * Variables are available in templates as {{ env.VAR_NAME }}.
 *
 * Priority order (later overrides earlier):
 * 1. System environment variables (PROMPD_* prefix only, for security)
 * 2. User-selected .env file (ALL vars - project-specific, user controls content)
 *
 * Security:
 * - System env vars are filtered to PROMPD_* only to prevent leaking OPENAI_API_KEY, etc.
 * - Project .env files read ALL vars since user explicitly controls their content
 * - Env values are compile-time substituted, not sent to registry or logs
 */

import { setEnvVarsCache } from '../lib/intellisense'

const SYSTEM_PREFIX = 'PROMPD_'

/**
 * Load environment variables from system and optional .env file
 *
 * @param workspacePath - Root path of the workspace/project
 * @param selectedEnvFile - Optional user-selected .env file name or path
 * @returns Merged env vars object for template substitution
 */
export async function loadEnvVars(
  workspacePath: string,
  selectedEnvFile?: string | null
): Promise<Record<string, string>> {
  let merged: Record<string, string> = {}

  // 1. System env vars - PROMPD_* only (security filter)
  // The prefix is stripped, so PROMPD_API_KEY becomes env.API_KEY in templates
  if (window.electronAPI?.getSystemEnvVars) {
    try {
      const sysEnv = await window.electronAPI.getSystemEnvVars(SYSTEM_PREFIX)
      merged = { ...merged, ...sysEnv }
    } catch (err) {
      console.warn('[envLoader] Failed to load system env vars:', err)
    }
  }

  // 2. User-selected .env file - ALL vars (project-specific)
  if (selectedEnvFile && window.electronAPI?.readFile) {
    try {
      // Handle both absolute paths and relative paths
      const envPath = selectedEnvFile.startsWith('/') || selectedEnvFile.includes(':')
        ? selectedEnvFile
        : `${workspacePath}/${selectedEnvFile}`

      const envResult = await window.electronAPI.readFile(envPath)
      if (envResult?.success && envResult.content) {
        const parsed = parseEnvContent(envResult.content)
        merged = { ...merged, ...parsed }
      }
    } catch (err) {
      console.warn('[envLoader] Failed to load .env file:', selectedEnvFile, err)
    }
  }

  // Update intellisense cache so autocomplete can suggest these env vars
  setEnvVarsCache(merged)

  return merged
}

/**
 * Find all .env files in the workspace root
 *
 * @param workspacePath - Root path of the workspace/project
 * @returns Array of .env file names found in workspace
 */
export async function findEnvFiles(workspacePath: string): Promise<string[]> {
  if (!workspacePath || !window.electronAPI?.readDir) {
    return []
  }

  try {
    const result = await window.electronAPI.readDir(workspacePath)
    if (!result?.success || !result.files) {
      return []
    }

    // Match files starting with .env or ending with .env
    // Examples: .env, .env.local, .env.development, production.env
    return result.files
      .filter(f => !f.isDirectory && (
        f.name.startsWith('.env') ||
        f.name.endsWith('.env')
      ))
      .map(f => f.name)
      .sort((a, b) => {
        // Sort .env first, then alphabetically
        if (a === '.env') return -1
        if (b === '.env') return 1
        return a.localeCompare(b)
      })
  } catch (err) {
    console.warn('[envLoader] Failed to find .env files:', err)
    return []
  }
}

/**
 * Parse .env file content into key-value pairs
 *
 * Supports:
 * - KEY=value
 * - KEY="quoted value"
 * - KEY='single quoted'
 * - # comments
 * - Empty lines
 * - Inline comments: KEY=value # comment (NOT supported for safety)
 *
 * @param content - Raw .env file content
 * @returns Parsed key-value pairs
 */
function parseEnvContent(content: string): Record<string, string> {
  const vars: Record<string, string> = {}

  for (const line of content.split('\n')) {
    const trimmed = line.trim()

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    // Match KEY=value pattern
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) {
      continue
    }

    const key = match[1]
    let value = match[2]

    // Remove surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    // Handle escaped characters in double-quoted strings
    if (match[2].startsWith('"')) {
      value = value
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\\\/g, '\\')
        .replace(/\\"/g, '"')
    }

    vars[key] = value
  }

  return vars
}

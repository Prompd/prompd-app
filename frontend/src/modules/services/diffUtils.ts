/**
 * Diff Utilities
 *
 * Functions for computing diffs and applying edit operations
 * Used by approval dialogs to show Monaco side-by-side diffs
 */

import type { EditOperation } from './toolExecutor'

// ============================================================================
// Types
// ============================================================================

export interface ApplyEditsResult {
  success: boolean
  modifiedContent: string
  error?: string
  appliedCount: number
  failedEdits: Array<{ index: number; search: string; reason: string }>
}

export interface DiffRegion {
  startLine: number
  endLine: number
  originalContent: string
  modifiedContent: string
  type: 'changed' | 'added' | 'removed'
}

// ============================================================================
// Edit Application
// ============================================================================

/**
 * Apply a series of search/replace edits to content
 * Returns the modified content and information about which edits succeeded/failed
 */
export function applyEdits(originalContent: string, edits: EditOperation[]): ApplyEditsResult {
  if (!edits || !Array.isArray(edits) || edits.length === 0) {
    return {
      success: false,
      modifiedContent: originalContent,
      appliedCount: 0,
      failedEdits: [],
      error: 'No edits provided'
    }
  }

  let content = originalContent
  let appliedCount = 0
  const failedEdits: ApplyEditsResult['failedEdits'] = []

  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i]

    if (!edit.search) {
      failedEdits.push({ index: i, search: '', reason: 'Empty search string' })
      continue
    }

    if (!content.includes(edit.search)) {
      failedEdits.push({
        index: i,
        search: edit.search.slice(0, 50) + (edit.search.length > 50 ? '...' : ''),
        reason: 'Search string not found'
      })
      continue
    }

    // Apply the edit (replace first occurrence only)
    content = content.replace(edit.search, edit.replace)
    appliedCount++
  }

  return {
    success: failedEdits.length === 0,
    modifiedContent: content,
    appliedCount,
    failedEdits,
    error: failedEdits.length > 0
      ? `${failedEdits.length} edit(s) failed to apply`
      : undefined
  }
}

// ============================================================================
// Language Detection
// ============================================================================

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  // Web
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.json': 'json',

  // Prompd
  '.prmd': 'yaml',
  '.prompd': 'yaml',
  '.pdproj': 'yaml',
  '.pdflow': 'yaml',

  // Config
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'ini',
  '.ini': 'ini',
  '.env': 'ini',

  // Markdown
  '.md': 'markdown',
  '.mdx': 'markdown',

  // Programming
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',

  // Shell
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.ps1': 'powershell',
  '.bat': 'bat',
  '.cmd': 'bat',

  // Data
  '.xml': 'xml',
  '.sql': 'sql',
  '.graphql': 'graphql',
  '.gql': 'graphql',
}

/**
 * Detect Monaco language from file path
 */
export function detectLanguage(filePath: string): string {
  if (!filePath) return 'plaintext'

  const lastDot = filePath.lastIndexOf('.')
  if (lastDot === -1) return 'plaintext'

  const ext = filePath.slice(lastDot).toLowerCase()
  return EXTENSION_TO_LANGUAGE[ext] || 'plaintext'
}

// ============================================================================
// Size Detection
// ============================================================================

const DEFAULT_LINE_THRESHOLD = 200

/**
 * Check if content is considered "large" for diff display purposes
 */
export function isLargeFile(content: string, threshold: number = DEFAULT_LINE_THRESHOLD): boolean {
  const lineCount = content.split('\n').length
  return lineCount > threshold
}

/**
 * Check if file might be binary (contains null bytes or non-printable characters)
 */
export function isBinaryContent(content: string): boolean {
  // Check for null bytes
  if (content.includes('\0')) return true

  // Check for high ratio of non-printable characters
  let nonPrintable = 0
  const sampleSize = Math.min(content.length, 8192) // Check first 8KB

  for (let i = 0; i < sampleSize; i++) {
    const code = content.charCodeAt(i)
    // Allow common whitespace (tab, newline, carriage return) and printable ASCII
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      nonPrintable++
    }
  }

  // If more than 10% non-printable, likely binary
  return nonPrintable / sampleSize > 0.1
}

// ============================================================================
// Region Extraction
// ============================================================================

/**
 * Extract changed regions from a diff for display
 * Used for large files where showing the full content would be unwieldy
 */
export function extractChangedRegions(
  originalContent: string,
  modifiedContent: string,
  contextLines: number = 5
): DiffRegion[] {
  const originalLines = originalContent.split('\n')
  const modifiedLines = modifiedContent.split('\n')
  const regions: DiffRegion[] = []

  // Find common prefix length
  let commonPrefixLen = 0
  const minLen = Math.min(originalLines.length, modifiedLines.length)
  while (commonPrefixLen < minLen && originalLines[commonPrefixLen] === modifiedLines[commonPrefixLen]) {
    commonPrefixLen++
  }

  // Find common suffix length
  let commonSuffixLen = 0
  while (
    commonSuffixLen < minLen - commonPrefixLen &&
    originalLines[originalLines.length - 1 - commonSuffixLen] === modifiedLines[modifiedLines.length - 1 - commonSuffixLen]
  ) {
    commonSuffixLen++
  }

  // Calculate the changed section bounds
  const originalChangeStart = commonPrefixLen
  const originalChangeEnd = originalLines.length - commonSuffixLen
  const modifiedChangeStart = commonPrefixLen
  const modifiedChangeEnd = modifiedLines.length - commonSuffixLen

  // No changes detected
  if (originalChangeStart === originalChangeEnd && modifiedChangeStart === modifiedChangeEnd) {
    return []
  }

  // Calculate region bounds with context
  const regionStartLine = Math.max(0, originalChangeStart - contextLines)
  const originalRegionEnd = Math.min(originalLines.length, originalChangeEnd + contextLines)
  const modifiedRegionEnd = Math.min(modifiedLines.length, modifiedChangeEnd + contextLines)

  // Build original region content
  const originalRegionLines: string[] = []
  for (let i = regionStartLine; i < originalRegionEnd; i++) {
    originalRegionLines.push(originalLines[i] || '')
  }

  // Build modified region content
  const modifiedRegionLines: string[] = []
  // Context before (same as original)
  for (let i = regionStartLine; i < originalChangeStart; i++) {
    modifiedRegionLines.push(modifiedLines[i] || '')
  }
  // Changed section from modified
  for (let i = modifiedChangeStart; i < modifiedChangeEnd; i++) {
    modifiedRegionLines.push(modifiedLines[i] || '')
  }
  // Context after
  const modifiedContextAfterStart = modifiedChangeEnd
  const contextAfterCount = originalRegionEnd - originalChangeEnd
  for (let i = 0; i < contextAfterCount && modifiedContextAfterStart + i < modifiedLines.length; i++) {
    modifiedRegionLines.push(modifiedLines[modifiedContextAfterStart + i] || '')
  }

  // Determine region type
  let type: DiffRegion['type'] = 'changed'
  if (originalChangeStart === originalChangeEnd) {
    type = 'added'
  } else if (modifiedChangeStart === modifiedChangeEnd) {
    type = 'removed'
  }

  regions.push({
    startLine: regionStartLine + 1, // Convert to 1-indexed
    endLine: originalRegionEnd,
    originalContent: originalRegionLines.join('\n'),
    modifiedContent: modifiedRegionLines.join('\n'),
    type
  })

  return regions
}

// ============================================================================
// File Reading Helpers
// ============================================================================

/**
 * Attempt to read file content from various sources
 * Priority: open tab > Electron IPC > null
 */
export async function getFileContent(
  filePath: string,
  options: {
    getTabContent?: (path: string) => string | null
    electronAPI?: {
      readFile: (path: string) => Promise<{ success: boolean; content?: string; error?: string }>
    }
    workspacePath?: string
  }
): Promise<{ success: boolean; content: string; source: 'tab' | 'filesystem' | 'none'; error?: string }> {
  const { getTabContent, electronAPI, workspacePath } = options

  // Try open tab first (fastest, already in memory)
  if (getTabContent) {
    const tabContent = getTabContent(filePath)
    if (tabContent !== null) {
      return { success: true, content: tabContent, source: 'tab' }
    }
  }

  // Try Electron IPC
  if (electronAPI?.readFile) {
    try {
      // Resolve path relative to workspace
      const fullPath = workspacePath
        ? `${workspacePath}/${filePath}`.replace(/\/+/g, '/')
        : filePath

      const result = await electronAPI.readFile(fullPath)
      if (result.success && result.content !== undefined) {
        return { success: true, content: result.content, source: 'filesystem' }
      }
      return {
        success: false,
        content: '',
        source: 'none',
        error: result.error || 'Failed to read file'
      }
    } catch (err) {
      return {
        success: false,
        content: '',
        source: 'none',
        error: err instanceof Error ? err.message : 'Unknown error reading file'
      }
    }
  }

  return {
    success: false,
    content: '',
    source: 'none',
    error: 'No file access method available'
  }
}

/**
 * Workspace Files Service
 *
 * Centralized service for managing workspace file information.
 * Used by IntelliSense, file pickers, and other components that need
 * access to workspace file listings.
 */

export interface WorkspaceFileEntry {
  name: string
  path: string
  kind: 'file' | 'folder'
}

// Cache for workspace files
let workspaceFilesCache: WorkspaceFileEntry[] = []

/**
 * Update the workspace files cache
 * Call this when the file explorer entries are updated
 */
export function setWorkspaceFiles(entries: WorkspaceFileEntry[]): void {
  workspaceFilesCache = [...entries]
  console.log('[workspaceService] Updated workspace files cache with', entries.length, 'entries')
}

/**
 * Get all workspace file entries
 */
export function getWorkspaceFiles(): WorkspaceFileEntry[] {
  return workspaceFilesCache
}

/**
 * Clear the workspace files cache
 */
export function clearWorkspaceFiles(): void {
  workspaceFilesCache = []
}

// Always excluded directory patterns (system directories)
const EXCLUDE_DIR_PATTERNS = [
  /^\.git(\/|$)/,
  /^node_modules(\/|$)/,
  /^\.prompd(\/|$)/,
  /^dist(\/|$)/,
  /^build(\/|$)/,
  /^\.vscode(\/|$)/
]

/**
 * Check if a file path matches any system exclude pattern
 */
function isExcludedPath(filePath: string): boolean {
  return EXCLUDE_DIR_PATTERNS.some(p => p.test(filePath))
}

/**
 * Extract file extension from filename
 */
function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1) return ''
  return filename.substring(lastDot).toLowerCase()
}

/**
 * Normalize path to use ./ prefix for relative paths
 */
function normalizePath(path: string): string {
  return path.startsWith('./') ? path : `./${path}`
}

/**
 * Get workspace files filtered by extension
 * @param extensions Array of extensions to filter by (e.g., ['.prmd', '.md'])
 * @returns Array of relative file paths
 */
export function getFilesByExtension(extensions: string[]): string[] {
  const files: string[] = []
  const extensionSet = new Set(extensions.map(ext => ext.toLowerCase()))

  for (const entry of workspaceFilesCache) {
    if (entry.kind !== 'file') continue
    if (isExcludedPath(entry.path)) continue

    const ext = getExtension(entry.name)
    if (extensionSet.has(ext)) {
      files.push(normalizePath(entry.path))
    }
  }

  return files.sort()
}

/**
 * Get workspace folders (excluding system directories)
 * @returns Array of folder paths with trailing /
 */
export function getFolders(): string[] {
  const folders: string[] = []

  for (const entry of workspaceFilesCache) {
    if (entry.kind !== 'folder') continue
    if (isExcludedPath(entry.path)) continue

    const relativePath = normalizePath(entry.path)
    const folderPath = relativePath.endsWith('/') ? relativePath : `${relativePath}/`
    folders.push(folderPath)
  }

  return folders.sort()
}

/**
 * Get all includable files for {% include %} directive
 * Prioritizes .prmd files, also includes .md and .txt
 */
export function getIncludableFiles(): { prmd: string[]; text: string[] } {
  const prmd = getFilesByExtension(['.prmd'])
  const text = getFilesByExtension(['.md', '.txt', '.markdown'])

  return { prmd, text }
}

/**
 * Get all context files for context: field
 * Includes markdown, text, json, yaml, csv, etc.
 */
export function getContextFiles(): string[] {
  return getFilesByExtension([
    '.md', '.txt', '.markdown',
    '.json', '.yaml', '.yml',
    '.csv', '.xml'
  ])
}

/**
 * Get all .prmd files in workspace
 */
export function getPrompdFiles(): string[] {
  return getFilesByExtension(['.prmd'])
}

/**
 * Check if workspace has any files loaded
 */
export function hasWorkspaceFiles(): boolean {
  return workspaceFilesCache.length > 0
}

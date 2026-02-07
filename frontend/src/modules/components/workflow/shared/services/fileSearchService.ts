/**
 * File search utilities for workflow property editors
 * Supports both Electron filesystem access and browser File System Access API
 *
 * Applies the same ignore rules as @prompd/cli:
 * - DEFAULT_EXCLUDE_DIRS: node_modules, .git, dist, build, etc.
 * - DEFAULT_EXCLUDE_PATTERNS: .env, *.log, *.lock, etc.
 * - prompd.json > ignore[]: user-defined ignore patterns per workspace
 */

/** Directories to always exclude (matches @prompd/cli DEFAULT_EXCLUDE_DIRS) */
const DEFAULT_EXCLUDE_DIRS = [
  'node_modules', '.git', '.prompd', '__pycache__', '.venv', 'venv',
  'dist', 'build', 'out', '.next', '.nuxt', 'coverage', '.nyc_output',
  '.idea', '.vscode', '.vs',
]

/** Patterns to always exclude (matches @prompd/cli DEFAULT_EXCLUDE_PATTERNS) */
const DEFAULT_EXCLUDE_PATTERNS = [
  '.env', '.env.*', '*.log', '*.tmp', '*.cache', '*.lock',
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  '.DS_Store', 'Thumbs.db', '*.pdpkg', '*.pdproj',
  'dist/**', '.prompd/**',
  'prompd.json',
]

/**
 * Check if a file/directory path matches any ignore patterns.
 * Supports simple glob syntax: * (any non-slash chars), ** (any path), ? (single char)
 */
function matchesIgnorePattern(filePath: string, patterns: string[]): boolean {
  const fileName = filePath.split('/').pop() || ''
  const normalizedPath = filePath.replace(/\\/g, '/')

  for (const pattern of patterns) {
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '<<<GLOBSTAR>>>')
      .replace(/\*/g, '[^/]*')
      .replace(/<<<GLOBSTAR>>>/g, '.*')
      .replace(/\?/g, '.')

    const regex = new RegExp(`^${regexPattern}$|/${regexPattern}$|^${regexPattern}/|/${regexPattern}/`)

    if (regex.test(normalizedPath) || regex.test(fileName)) {
      return true
    }

    if (fileName === pattern || normalizedPath === pattern || normalizedPath.endsWith('/' + pattern)) {
      return true
    }
  }

  return false
}

/** Cache for workspace ignore patterns (avoid re-reading prompd.json on every keystroke) */
let cachedIgnorePatterns: { workspacePath: string; patterns: string[]; timestamp: number } | null = null
const CACHE_TTL = 30000 // 30 seconds

/**
 * Load ignore patterns from workspace prompd.json > ignore[]
 */
async function loadWorkspaceIgnorePatterns(workspacePath: string | null): Promise<string[]> {
  if (!workspacePath) return []

  // Return cached if fresh
  if (cachedIgnorePatterns &&
      cachedIgnorePatterns.workspacePath === workspacePath &&
      Date.now() - cachedIgnorePatterns.timestamp < CACHE_TTL) {
    return cachedIgnorePatterns.patterns
  }

  try {
    const electronAPI = (window as Window & {
      electronAPI?: { readFile: (path: string) => Promise<{ success: boolean; content?: string }> }
    }).electronAPI

    if (!electronAPI?.readFile) return []

    const result = await electronAPI.readFile(`${workspacePath}/prompd.json`)
    if (result.success && result.content) {
      const prompdJson = JSON.parse(result.content)
      const patterns = Array.isArray(prompdJson.ignore) ? prompdJson.ignore : []
      cachedIgnorePatterns = { workspacePath, patterns, timestamp: Date.now() }
      return patterns
    }
  } catch {
    // No prompd.json or invalid - that's fine
  }

  cachedIgnorePatterns = { workspacePath, patterns: [], timestamp: Date.now() }
  return []
}

/**
 * Check if a directory name should be excluded
 */
function isExcludedDir(dirName: string, relativePath: string, allIgnorePatterns: string[]): boolean {
  if (DEFAULT_EXCLUDE_DIRS.includes(dirName)) return true
  if (dirName.startsWith('.')) return true
  if (matchesIgnorePattern(relativePath, allIgnorePatterns)) return true
  return false
}

/**
 * Check if a file should be excluded
 */
function isExcludedFile(relativePath: string, allIgnorePatterns: string[]): boolean {
  return matchesIgnorePattern(relativePath, [...DEFAULT_EXCLUDE_PATTERNS, ...allIgnorePatterns])
}

/**
 * Search for files by extension in the workspace
 * @param workspaceHandle - FileSystemDirectoryHandle for browser mode
 * @param workspacePath - Path string for Electron mode
 * @param query - Search term to filter results
 * @param extension - File extension to search for (e.g., '.pdflow')
 * @returns Array of file paths matching the search, limited to 20 results
 */
export async function searchLocalFilesByExtension(
  workspaceHandle: FileSystemDirectoryHandle | null,
  workspacePath: string | null,
  query: string,
  extension: string
): Promise<string[]> {
  const results: string[] = []
  const searchTerm = query.toLowerCase().replace(/^\.+\/?/, '').trim()

  const electronPath = (workspaceHandle as unknown as { _electronPath?: string })?._electronPath || workspacePath
  const isElectron = electronPath && (window as Window & { electronAPI?: { readDir: (path: string) => Promise<{ success: boolean; files?: Array<{ name: string; isDirectory: boolean }> }> } }).electronAPI?.readDir

  // Load workspace-specific ignore patterns
  const userIgnorePatterns = await loadWorkspaceIgnorePatterns(electronPath || workspacePath)

  const matchesSearch = (filePath: string): boolean => {
    if (searchTerm === '') return true
    return filePath.toLowerCase().includes(searchTerm)
  }

  if (isElectron) {
    const searchDir = async (dirPath: string, currentPath: string = '') => {
      try {
        const result = await (window as Window & { electronAPI?: { readDir: (path: string) => Promise<{ success: boolean; files?: Array<{ name: string; isDirectory: boolean }> }> } }).electronAPI!.readDir(dirPath)
        if (!result.success || !result.files) return

        for (const entry of result.files) {
          const relativePath = currentPath ? `${currentPath}/${entry.name}` : entry.name

          if (entry.isDirectory) {
            if (!isExcludedDir(entry.name, relativePath, userIgnorePatterns)) {
              await searchDir(`${dirPath}/${entry.name}`, relativePath)
            }
          } else if (entry.name.endsWith(extension)) {
            if (!isExcludedFile(relativePath, userIgnorePatterns)) {
              const fullRelativePath = `./${relativePath}`
              if (matchesSearch(fullRelativePath)) {
                results.push(fullRelativePath)
              }
            }
          }
        }
      } catch (err) {
        console.warn('Failed to search directory:', dirPath, err)
      }
    }

    await searchDir(electronPath)
  } else {
    const searchDir = async (handle: FileSystemDirectoryHandle, currentPath: string = '') => {
      try {
        for await (const [name, entry] of (handle as unknown as Iterable<[string, FileSystemHandle]>)) {
          const relativePath = currentPath ? `${currentPath}/${name}` : name

          if (entry.kind === 'directory') {
            if (!isExcludedDir(name, relativePath, userIgnorePatterns)) {
              await searchDir(entry as FileSystemDirectoryHandle, relativePath)
            }
          } else if (entry.kind === 'file' && name.endsWith(extension)) {
            if (!isExcludedFile(relativePath, userIgnorePatterns)) {
              const fullRelativePath = `./${relativePath}`
              if (matchesSearch(fullRelativePath)) {
                results.push(fullRelativePath)
              }
            }
          }
        }
      } catch (err) {
        console.warn('Failed to search directory:', currentPath, err)
      }
    }

    if (workspaceHandle) {
      await searchDir(workspaceHandle)
    }
  }

  return results.sort().slice(0, 20)
}

/**
 * Search for .prmd files in the workspace
 * @param workspaceHandle - FileSystemDirectoryHandle for browser mode
 * @param workspacePath - Path string for Electron mode
 * @param query - Search term to filter results
 * @returns Array of .prmd file paths matching the search, limited to 20 results
 */
export async function searchLocalFiles(
  workspaceHandle: FileSystemDirectoryHandle | null,
  workspacePath: string | null,
  query: string
): Promise<string[]> {
  const results: string[] = []
  const searchTerm = query.toLowerCase().replace(/^\.+\/?/, '').trim()

  const electronPath = (workspaceHandle as unknown as { _electronPath?: string })?._electronPath || workspacePath
  const isElectron = electronPath && (window as Window & { electronAPI?: { readDir: (path: string) => Promise<{ success: boolean; files?: Array<{ name: string; isDirectory: boolean }> }> } }).electronAPI?.readDir

  // Load workspace-specific ignore patterns
  const userIgnorePatterns = await loadWorkspaceIgnorePatterns(electronPath || workspacePath)

  const matchesSearch = (filePath: string): boolean => {
    if (searchTerm === '') return true
    return filePath.toLowerCase().includes(searchTerm)
  }

  if (isElectron) {
    const searchDir = async (dirPath: string, currentPath: string = '') => {
      try {
        const result = await (window as Window & { electronAPI?: { readDir: (path: string) => Promise<{ success: boolean; files?: Array<{ name: string; isDirectory: boolean }> }> } }).electronAPI!.readDir(dirPath)
        if (!result.success || !result.files) return

        for (const entry of result.files) {
          const relativePath = currentPath ? `${currentPath}/${entry.name}` : entry.name

          if (entry.isDirectory) {
            if (!isExcludedDir(entry.name, relativePath, userIgnorePatterns)) {
              await searchDir(`${dirPath}/${entry.name}`, relativePath)
            }
          } else if (entry.name.endsWith('.prmd')) {
            if (!isExcludedFile(relativePath, userIgnorePatterns)) {
              const fullRelativePath = `./${relativePath}`
              if (matchesSearch(fullRelativePath)) {
                results.push(fullRelativePath)
              }
            }
          }
        }
      } catch (err) {
        console.warn('Failed to search directory:', dirPath, err)
      }
    }

    await searchDir(electronPath)
  } else {
    const searchDir = async (handle: FileSystemDirectoryHandle, currentPath: string = '') => {
      try {
        for await (const [name, entry] of (handle as unknown as Iterable<[string, FileSystemHandle]>)) {
          const relativePath = currentPath ? `${currentPath}/${name}` : name

          if (entry.kind === 'directory') {
            if (!isExcludedDir(name, relativePath, userIgnorePatterns)) {
              await searchDir(entry as FileSystemDirectoryHandle, relativePath)
            }
          } else if (entry.kind === 'file' && name.endsWith('.prmd')) {
            if (!isExcludedFile(relativePath, userIgnorePatterns)) {
              const fullRelativePath = `./${relativePath}`
              if (matchesSearch(fullRelativePath)) {
                results.push(fullRelativePath)
              }
            }
          }
        }
      } catch (err) {
        console.warn('Failed to search directory:', currentPath, err)
      }
    }

    if (workspaceHandle) {
      await searchDir(workspaceHandle)
    }
  }

  return results.sort().slice(0, 20)
}

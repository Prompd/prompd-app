/**
 * File search utilities for workflow property editors
 * Supports both Electron filesystem access and browser File System Access API
 */

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
  // Strip leading ./ or . and get the actual search term
  const searchTerm = query.toLowerCase().replace(/^\.+\/?/, '').trim()

  const electronPath = (workspaceHandle as unknown as { _electronPath?: string })?._electronPath || workspacePath
  const isElectron = electronPath && (window as Window & { electronAPI?: { readDir: (path: string) => Promise<{ success: boolean; files?: Array<{ name: string; isDirectory: boolean }> }> } }).electronAPI?.readDir

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

          if (entry.isDirectory && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await searchDir(`${dirPath}/${entry.name}`, relativePath)
          } else if (!entry.isDirectory && entry.name.endsWith(extension)) {
            const fullRelativePath = `./${relativePath}`
            if (matchesSearch(fullRelativePath)) {
              results.push(fullRelativePath)
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

          if (entry.kind === 'directory' && !name.startsWith('.') && name !== 'node_modules') {
            await searchDir(entry as FileSystemDirectoryHandle, relativePath)
          } else if (entry.kind === 'file' && name.endsWith(extension)) {
            const fullRelativePath = `./${relativePath}`
            if (matchesSearch(fullRelativePath)) {
              results.push(fullRelativePath)
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
  // Strip leading ./ or . and get the actual search term
  // If query is just "." or "./", searchTerm will be empty (show all files)
  const searchTerm = query.toLowerCase().replace(/^\.+\/?/, '').trim()

  // Check if Electron mode - either via handle with _electronPath or direct workspacePath
  const electronPath = (workspaceHandle as unknown as { _electronPath?: string })?._electronPath || workspacePath
  const isElectron = electronPath && (window as Window & { electronAPI?: { readDir: (path: string) => Promise<{ success: boolean; files?: Array<{ name: string; isDirectory: boolean }> }> } }).electronAPI?.readDir

  console.log('[searchLocalFiles] Starting search:', {
    query,
    searchTerm,
    electronPath,
    isElectron,
    hasHandle: !!workspaceHandle,
    handleElectronPath: (workspaceHandle as unknown as { _electronPath?: string })?._electronPath,
    workspacePath
  })

  // Helper to check if file matches search term
  const matchesSearch = (filePath: string): boolean => {
    if (searchTerm === '') return true // Show all files when query is just "." or "./"
    return filePath.toLowerCase().includes(searchTerm)
  }

  if (isElectron) {
    const searchDir = async (dirPath: string, currentPath: string = '') => {
      try {
        const result = await (window as Window & { electronAPI?: { readDir: (path: string) => Promise<{ success: boolean; files?: Array<{ name: string; isDirectory: boolean }> }> } }).electronAPI!.readDir(dirPath)
        if (!result.success || !result.files) return

        for (const entry of result.files) {
          const relativePath = currentPath ? `${currentPath}/${entry.name}` : entry.name

          if (entry.isDirectory && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await searchDir(`${dirPath}/${entry.name}`, relativePath)
          } else if (!entry.isDirectory && entry.name.endsWith('.prmd')) {
            const fullRelativePath = `./${relativePath}`
            if (matchesSearch(fullRelativePath)) {
              results.push(fullRelativePath)
            }
          }
        }
      } catch (err) {
        console.warn('Failed to search directory:', dirPath, err)
      }
    }

    await searchDir(electronPath)
  } else {
    // Browser File System Access API
    const searchDir = async (handle: FileSystemDirectoryHandle, currentPath: string = '') => {
      try {
        for await (const [name, entry] of (handle as unknown as Iterable<[string, FileSystemHandle]>)) {
          const relativePath = currentPath ? `${currentPath}/${name}` : name

          if (entry.kind === 'directory' && !name.startsWith('.') && name !== 'node_modules') {
            await searchDir(entry as FileSystemDirectoryHandle, relativePath)
          } else if (entry.kind === 'file' && name.endsWith('.prmd')) {
            const fullRelativePath = `./${relativePath}`
            if (matchesSearch(fullRelativePath)) {
              results.push(fullRelativePath)
            }
          }
        }
      } catch (err) {
        console.warn('Failed to search directory:', currentPath, err)
      }
    }

    if (workspaceHandle) {
      await searchDir(workspaceHandle)
    } else {
      console.log('[searchLocalFiles] No workspace handle for browser mode')
    }
  }

  console.log('[searchLocalFiles] Search complete, found:', results.length, 'files')
  return results.sort().slice(0, 20) // Limit results
}

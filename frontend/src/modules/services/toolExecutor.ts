/**
 * Tool Executor Interface
 *
 * Unified interface for executing agent tools across platforms.
 * - ElectronToolExecutor: Uses IPC to access local filesystem
 * - BrowserToolExecutor: Limited to in-memory/open files
 */

import { registryApi } from './registryApi'
import { packageCache } from './packageCache'
import { useEditorStore } from '../../stores/editorStore'
import { BUILTIN_COMMAND_EXECUTABLES } from './workflowTypes'

/**
 * Sync file content with any open tabs that match the file path.
 * Called after write_file or edit_file to update the editor UI.
 */
function syncFileWithOpenTabs(filePath: string, content: string, workspacePath?: string): void {
  const store = useEditorStore.getState()
  const tabs = store.tabs

  // Normalize the file path for comparison
  const normalizedPath = filePath.replace(/\\/g, '/')

  // Find tabs that match this file path
  for (const tab of tabs) {
    if (!tab.filePath) continue

    // Normalize tab's file path
    const tabPath = tab.filePath.replace(/\\/g, '/')

    // Check for exact match or relative path match
    const matches =
      tabPath === normalizedPath ||
      tabPath.endsWith('/' + normalizedPath) ||
      normalizedPath.endsWith('/' + tabPath) ||
      (workspacePath && tabPath === `${workspacePath.replace(/\\/g, '/')}/${normalizedPath}`)

    if (matches) {
      console.log(`[ToolExecutor] Syncing file content to open tab: ${tab.name}`)
      // Update the tab's text and savedText to reflect the new content
      store.updateTab(tab.id, {
        text: content,
        savedText: content,  // Mark as saved since we just wrote to disk
        dirty: false
      })
    }
  }
}

// ============================================================================
// Types
// ============================================================================

export interface ToolCall {
  id: string
  tool: string
  params: Record<string, unknown>
}

export interface ToolResult {
  success: boolean
  output?: unknown
  error?: string
}

export interface FileInfo {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
}

export interface SearchMatch {
  file: string
  line: number
  content: string
}

export interface CommandResult {
  exitCode: number
  stdout: string
  stderr: string
}

// Undo stack entry for file operations
export interface UndoEntry {
  id: string
  timestamp: number
  tool: 'write_file' | 'edit_file'
  path: string
  originalContent: string
  newContent: string
  description: string
}

// ============================================================================
// Undo Stack - Global singleton to track file changes
// ============================================================================

class UndoStack {
  private stack: UndoEntry[] = []
  private redoStack: UndoEntry[] = []
  private maxSize = 50 // Keep last 50 operations
  private listeners: Set<() => void> = new Set()

  push(entry: Omit<UndoEntry, 'id' | 'timestamp'>): void {
    const fullEntry: UndoEntry = {
      ...entry,
      id: `undo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now()
    }
    this.stack.push(fullEntry)

    // Clear redo stack on new action
    this.redoStack = []

    // Trim if over max size
    if (this.stack.length > this.maxSize) {
      this.stack = this.stack.slice(-this.maxSize)
    }

    console.log('[UndoStack] Pushed entry:', fullEntry.path, fullEntry.tool)
    this.notifyListeners()
  }

  pop(): UndoEntry | undefined {
    const entry = this.stack.pop()
    if (entry) {
      console.log('[UndoStack] Popped entry:', entry.path, entry.tool)
      this.notifyListeners()
    }
    return entry
  }

  /**
   * Pop from undo stack and push to redo stack
   */
  popForRedo(): UndoEntry | undefined {
    const entry = this.stack.pop()
    if (entry) {
      this.redoStack.push(entry)
      console.log('[UndoStack] Moved to redo:', entry.path, entry.tool)
      this.notifyListeners()
    }
    return entry
  }

  /**
   * Pop from redo stack and push to undo stack
   */
  popFromRedo(): UndoEntry | undefined {
    const entry = this.redoStack.pop()
    if (entry) {
      this.stack.push(entry)
      console.log('[UndoStack] Restored from redo:', entry.path, entry.tool)
      this.notifyListeners()
    }
    return entry
  }

  peek(): UndoEntry | undefined {
    return this.stack[this.stack.length - 1]
  }

  getAll(): UndoEntry[] {
    return [...this.stack]
  }

  getForPath(path: string): UndoEntry[] {
    return this.stack.filter(e => e.path === path)
  }

  clear(): void {
    this.stack = []
    this.redoStack = []
    console.log('[UndoStack] Cleared')
    this.notifyListeners()
  }

  size(): number {
    return this.stack.length
  }

  redoSize(): number {
    return this.redoStack.length
  }

  canUndo(): boolean {
    return this.stack.length > 0
  }

  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  // Subscribe to changes
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notifyListeners(): void {
    this.listeners.forEach(l => l())
  }
}

// Global undo stack instance
export const undoStack = new UndoStack()

// ============================================================================
// Tool Executor Interface
// ============================================================================

export interface EditOperation {
  search: string      // Text to find
  replace: string     // Text to replace with
}

export interface IToolExecutor {
  /** Platform identifier */
  readonly platform: 'electron' | 'browser'

  /** Check if a tool is available on this platform */
  isToolAvailable(tool: string): boolean

  /** Execute a tool and return result */
  execute(call: ToolCall): Promise<ToolResult>

  // Individual tool methods for type safety
  readFile(path: string): Promise<ToolResult>
  writeFile(path: string, content: string): Promise<ToolResult>
  editFile(path: string, edits: EditOperation[]): Promise<ToolResult>
  renameFile(oldPath: string, newPath: string): Promise<ToolResult>
  listFiles(path: string, recursive?: boolean): Promise<ToolResult>
  searchFiles(pattern: string, glob?: string): Promise<ToolResult>
  runCommand(command: string, cwd?: string): Promise<ToolResult>

  /** Undo the last file operation */
  undo(): Promise<ToolResult>

  /** Redo the last undone operation */
  redo(): Promise<ToolResult>
}

// ============================================================================
// Electron Tool Executor
// ============================================================================

export class ElectronToolExecutor implements IToolExecutor {
  readonly platform = 'electron' as const
  private workspacePath: string
  private homePath: string | null = null
  private homePathPromise: Promise<void> | null = null

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath
    // Get home directory for package cache resolution (async)
    this.homePathPromise = this.initHomePath()
  }

  private async initHomePath(): Promise<void> {
    const api = (window as unknown as { electronAPI?: { getHomePath?: () => Promise<string> } }).electronAPI
    if (api?.getHomePath) {
      try {
        // getHomePath is now async (IPC call to main process)
        this.homePath = await api.getHomePath()
        console.log('[ToolExecutor] Home path:', this.homePath)
      } catch (error) {
        console.error('[ToolExecutor] Failed to get home path:', error)
      }
    }
  }

  // Ensure homePath is initialized before using it
  private async ensureHomePath(): Promise<string | null> {
    if (this.homePathPromise) {
      await this.homePathPromise
    }
    return this.homePath
  }

  isToolAvailable(tool: string): boolean {
    // All tools available in Electron
    return ['read_file', 'write_file', 'edit_file', 'rename_file', 'list_files', 'search_files', 'search_registry', 'read_package_file', 'list_package_files', 'run_command', 'ask_user'].includes(tool)
  }

  async execute(call: ToolCall): Promise<ToolResult> {
    const startTime = Date.now()
    console.log(`[ToolExecutor:Electron] Executing ${call.tool}`, call.params)

    try {
      let result: ToolResult

      switch (call.tool) {
        case 'read_file':
          result = await this.readFile(call.params.path as string)
          break
        case 'write_file':
          result = await this.writeFile(call.params.path as string, call.params.content as string)
          break
        case 'edit_file':
          result = await this.editFile(call.params.path as string, call.params.edits as EditOperation[])
          break
        case 'rename_file':
          result = await this.renameFile(call.params.old_path as string, call.params.new_path as string)
          break
        case 'list_files':
          result = await this.listFiles(call.params.path as string || '.', call.params.recursive as boolean)
          break
        case 'search_files':
          result = await this.searchFiles(call.params.pattern as string, call.params.glob as string)
          break
        case 'search_registry':
          result = await this.searchRegistry(call.params.query as string, call.params.tags as string[])
          break
        case 'read_package_file':
          result = await this.readPackageFile(
            call.params.package_name as string,
            call.params.version as string,
            call.params.file_path as string
          )
          break
        case 'list_package_files':
          result = await this.listPackageFiles(
            call.params.package_name as string,
            call.params.version as string
          )
          break
        case 'run_command':
          result = await this.runCommand(call.params.command as string, call.params.cwd as string)
          break
        case 'ask_user':
          // ask_user doesn't execute - it's handled by the UI
          result = { success: true, output: { type: 'ask_user', question: call.params.question } }
          break
        default:
          result = { success: false, error: `Unknown tool: ${call.tool}` }
      }

      console.log(`[ToolExecutor:Electron] ${call.tool} completed in ${Date.now() - startTime}ms`, result.success)
      return result
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[ToolExecutor:Electron] ${call.tool} failed:`, error)
      return { success: false, error: errorMsg }
    }
  }

  async readFile(path: string): Promise<ToolResult> {
    const validation = this.validatePath(path)
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    // Use package-aware resolution for all reads
    return this.readFileWithPackageResolution(path)
  }

  async writeFile(path: string, content: string): Promise<ToolResult> {
    const validation = this.validatePath(path)
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    const api = (window as any).electronAPI
    if (!api?.writeFile) {
      return { success: false, error: 'Electron API not available' }
    }

    try {
      const fullPath = this.resolvePath(path)

      // Read original content for undo stack (if file exists)
      let originalContent = ''
      try {
        const existingResult = await api.readFile(fullPath)
        if (existingResult.success) {
          originalContent = existingResult.content
        }
      } catch {
        // File doesn't exist yet - that's fine
      }

      const result = await api.writeFile(fullPath, content)

      if (result.success) {
        // Save to undo stack
        undoStack.push({
          tool: 'write_file',
          path,
          originalContent,
          newContent: content,
          description: originalContent ? `Overwrote ${path}` : `Created ${path}`
        })

        // Sync with any open tabs that have this file
        syncFileWithOpenTabs(fullPath, content, this.workspacePath)

        return {
          success: true,
          output: {
            path,
            bytesWritten: content.length,
            // Include the written content so LLM knows the current state
            updatedContent: content,
            canUndo: true
          }
        }
      } else {
        return { success: false, error: result.error || 'Failed to write file' }
      }
    } catch (error) {
      return { success: false, error: `Write failed: ${error}` }
    }
  }

  async editFile(path: string, edits: EditOperation[]): Promise<ToolResult> {
    const validation = this.validatePath(path)
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    if (!edits || edits.length === 0) {
      return { success: false, error: 'No edits provided' }
    }

    const api = (window as any).electronAPI
    if (!api?.writeFile || !api?.readFile) {
      return { success: false, error: 'Electron API not available' }
    }

    const fullPath = this.resolvePath(path)
    const appliedEdits: Array<{ search: string; found: boolean; index: number }> = []
    let originalContent: string | null = null  // Store for undo

    // Apply each edit one at a time, writing and re-reading after each
    // This ensures each edit sees the actual file content after previous edits
    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i]
      if (!edit.search) {
        return { success: false, error: `Edit ${i + 1} missing "search" field` }
      }

      // Read fresh content from disk for each edit
      const readResult = await this.readFile(path)
      if (!readResult.success) {
        return { success: false, error: `Cannot read file for edit ${i + 1}: ${readResult.error}` }
      }

      const currentContent = (readResult.output as { content: string }).content

      // Save original content on first iteration for undo
      if (i === 0) {
        originalContent = currentContent
      }

      // Normalize line endings for search/replace (Windows CRLF vs Unix LF)
      // LLM always sends \n but files on Windows may have \r\n
      const hasCRLF = currentContent.includes('\r\n')
      const normalizedContent = hasCRLF ? currentContent.replace(/\r\n/g, '\n') : currentContent
      const normalizedSearch = edit.search.replace(/\r\n/g, '\n')
      const normalizedReplace = edit.replace.replace(/\r\n/g, '\n')

      const found = normalizedContent.includes(normalizedSearch)
      appliedEdits.push({
        search: edit.search.substring(0, 50) + (edit.search.length > 50 ? '...' : ''),
        found,
        index: i + 1
      })

      if (!found) {
        // Edit failed - return error with context about what's in the file
        console.error(`[ToolExecutor:Electron] Edit ${i + 1} failed - search string not found`)
        console.log('[ToolExecutor:Electron] Current content first 500 chars:', currentContent.substring(0, 500))
        return {
          success: false,
          error: `Edit ${i + 1} of ${edits.length} failed - search string not found in file. Previous ${i} edit(s) were applied successfully. Re-read the file to see current content before retrying.`,
          output: {
            appliedEdits,
            failedAtIndex: i + 1,
            successfulCount: i,
            contentPreview: currentContent.substring(0, 500) + (currentContent.length > 500 ? '...' : '')
          }
        }
      }

      // Apply the edit on normalized content, then restore original line endings
      let newContent = normalizedContent.replace(normalizedSearch, normalizedReplace)
      if (hasCRLF) {
        newContent = newContent.replace(/\n/g, '\r\n')
      }

      // Validate .prmd format before writing this edit
      if (path.endsWith('.prmd') || path.endsWith('.prompd')) {
        console.log(`[ToolExecutor:Electron] Validating .prmd format for edit ${i + 1}`)
        const formatValidation = this.validatePrompdFormat(newContent)
        if (!formatValidation.valid) {
          console.error('[ToolExecutor:Electron] REJECTING edit - invalid .prmd format:', formatValidation.error)
          return {
            success: false,
            error: `EDIT ${i + 1} REJECTED - INVALID .prmd FORMAT: ${formatValidation.error}

CORRECT .prmd structure (you MUST follow this):
---
id: example
version: 1.0.0
inherits: "@p/template.prmd"
---

# Markdown Title (goes AFTER the closing ---)

## Section
Content here.

TO ADD MARKDOWN: Search for the LAST line of YAML + closing --- together, then add markdown AFTER:
<search>inherits: "@p/template.prmd"
---</search>
<replace>inherits: "@p/template.prmd"
---

# New Section

Content here.</replace>

NEVER put markdown headers (# Title) BETWEEN the opening --- and closing ---. That area is ONLY for YAML.`,
            output: { appliedEdits, rejectedReason: 'format_validation', failedAtIndex: i + 1 }
          }
        }
      }

      // Write the edit to disk immediately
      const writeResult = await api.writeFile(fullPath, newContent)
      if (!writeResult.success) {
        return { success: false, error: `Failed to write edit ${i + 1}: ${writeResult.error}` }
      }

      console.log(`[ToolExecutor:Electron] Edit ${i + 1} of ${edits.length} applied successfully`)
    }

    // All edits succeeded - read final content for undo stack
    const finalReadResult = await this.readFile(path)
    const finalContent = finalReadResult.success
      ? (finalReadResult.output as { content: string }).content
      : ''

    // Save to undo stack with all edits as one operation
    if (originalContent !== null) {
      undoStack.push({
        tool: 'edit_file',
        path,
        originalContent,
        newContent: finalContent,
        description: `Edited ${path} (${edits.length} change${edits.length > 1 ? 's' : ''})`
      })
    }

    // Sync with any open tabs that have this file
    syncFileWithOpenTabs(fullPath, finalContent, this.workspacePath)

    return {
      success: true,
      output: {
        path,
        editsApplied: edits.length,
        totalEdits: edits.length,
        appliedEdits,
        // Include the updated file content so LLM knows the current state
        updatedContent: finalContent,
        canUndo: true
      }
    }
  }

  async renameFile(oldPath: string, newPath: string): Promise<ToolResult> {
    const oldValidation = this.validatePath(oldPath)
    if (!oldValidation.valid) {
      return { success: false, error: `Invalid source path: ${oldValidation.error}` }
    }
    const newValidation = this.validatePath(newPath)
    if (!newValidation.valid) {
      return { success: false, error: `Invalid destination path: ${newValidation.error}` }
    }

    const api = (window as unknown as { electronAPI?: { rename?: (old: string, next: string) => Promise<{ success: boolean; error?: string }> } }).electronAPI
    if (!api?.rename) {
      return { success: false, error: 'Electron API not available' }
    }

    try {
      const fullOldPath = this.resolvePath(oldPath)
      const fullNewPath = this.resolvePath(newPath)

      const result = await api.rename(fullOldPath, fullNewPath)

      if (result.success) {
        const normalizedOld = fullOldPath.replace(/\\/g, '/')
        const normalizedNew = fullNewPath.replace(/\\/g, '/')
        const newFileName = normalizedNew.split('/').pop() || newPath

        // Dispatch rename event so App.tsx handler can update tab name,
        // filePath, and pseudo-handle in one place (same pattern as codeActions.ts).
        // The event must fire BEFORE any direct tab updates so the handler
        // can still find the tab by its old name.
        window.dispatchEvent(new CustomEvent('prompd-file-renamed', {
          detail: { oldPath: normalizedOld, newPath: normalizedNew, newFileName }
        }))

        return {
          success: true,
          output: {
            old_path: oldPath,
            new_path: newPath,
            message: `Renamed ${oldPath} to ${newPath}`
          }
        }
      } else {
        return { success: false, error: result.error || 'Failed to rename file' }
      }
    } catch (error) {
      return { success: false, error: `Rename failed: ${error}` }
    }
  }

  /**
   * Validate .prmd file format
   * A valid .prmd file must:
   * 1. Start with --- on line 1
   * 2. Have valid YAML frontmatter
   * 3. Have a closing --- to end frontmatter
   * 4. Optionally have markdown content AFTER the closing ---
   */
  private validatePrompdFormat(content: string): { valid: boolean; error?: string } {
    const trimmed = content.trim()

    // Must start with ---
    if (!trimmed.startsWith('---')) {
      // Check if there's markdown before the ---
      const firstDashIndex = trimmed.indexOf('---')
      if (firstDashIndex > 0) {
        const contentBefore = trimmed.substring(0, firstDashIndex).trim()
        if (contentBefore.startsWith('#') || contentBefore.includes('\n#')) {
          return {
            valid: false,
            error: 'Markdown content was added BEFORE the opening ---. Markdown must come AFTER the closing ---'
          }
        }
        return {
          valid: false,
          error: 'File must start with --- on line 1 (found content before the opening ---)'
        }
      }
      return {
        valid: false,
        error: 'File must start with --- on line 1'
      }
    }

    // Find the closing ---
    const afterOpening = trimmed.substring(3) // Skip opening ---
    const closingIndex = afterOpening.indexOf('\n---')

    if (closingIndex === -1) {
      return {
        valid: false,
        error: 'Missing closing --- after YAML frontmatter'
      }
    }

    // Check that YAML section doesn't contain markdown headers
    // Markdown headers (# Title, ## Section) should NEVER be inside frontmatter
    const yamlSection = afterOpening.substring(0, closingIndex)
    const yamlLines = yamlSection.split('\n')
    for (let i = 0; i < yamlLines.length; i++) {
      const line = yamlLines[i].trim()

      // Skip empty lines
      if (!line) continue

      // Detect markdown headers: lines starting with # followed by space and text
      // YAML comments are just # followed by text, but we need to be careful
      // Markdown headers: "# Title", "## Section", "### Subsection"
      // YAML comments: "# this is a comment" (usually after YAML content or as standalone comment)

      // If line starts with # and looks like a markdown header (# + space + capital letter or # + # for ##)
      if (line.match(/^#{1,6}\s+[A-Z]/)) {
        return {
          valid: false,
          error: `Markdown header "${line.substring(0, 40)}${line.length > 40 ? '...' : ''}" found inside YAML frontmatter. Markdown content must come AFTER the closing ---`
        }
      }

      // Also catch ## headers which are clearly markdown
      if (line.startsWith('## ') || line.startsWith('### ')) {
        return {
          valid: false,
          error: `Markdown header "${line.substring(0, 40)}${line.length > 40 ? '...' : ''}" found inside YAML frontmatter. Markdown content must come AFTER the closing ---`
        }
      }
    }

    return { valid: true }
  }

  async listFiles(path: string, recursive: boolean = false): Promise<ToolResult> {
    const validation = this.validatePath(path)
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    const api = (window as any).electronAPI
    if (!api?.readDir) {
      return { success: false, error: 'Electron API not available' }
    }

    try {
      const fullPath = this.resolvePath(path)
      const files: FileInfo[] = []

      const listDir = async (dirPath: string, prefix: string = '') => {
        const result = await api.readDir(dirPath)
        if (!result.success) return

        for (const entry of result.files || []) {
          const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name

          files.push({
            name: entry.name,
            path: relativePath,
            type: entry.isDirectory ? 'directory' : 'file',
            size: entry.size
          })

          if (recursive && entry.isDirectory) {
            // Skip common ignored directories
            if (!['node_modules', '.git', 'dist', 'build', '.next'].includes(entry.name)) {
              await listDir(`${dirPath}/${entry.name}`, relativePath)
            }
          }
        }
      }

      await listDir(fullPath)
      return { success: true, output: { files, count: files.length } }
    } catch (error) {
      return { success: false, error: `List failed: ${error}` }
    }
  }

  async searchFiles(pattern: string, glob: string = '**/*'): Promise<ToolResult> {
    // For now, implement basic search by listing and reading files
    // TODO: Use ripgrep via Electron IPC for better performance
    const api = (window as any).electronAPI
    if (!api?.searchFiles) {
      // Fallback: manual search (slower but works)
      return this.manualSearch(pattern, glob)
    }

    try {
      const result = await api.searchFiles({ pattern, glob, cwd: this.workspacePath })
      if (result.success) {
        return { success: true, output: { matches: result.matches, count: result.matches?.length || 0 } }
      } else {
        return { success: false, error: result.error || 'Search failed' }
      }
    } catch (error) {
      return { success: false, error: `Search failed: ${error}` }
    }
  }

  private async manualSearch(pattern: string, glob: string): Promise<ToolResult> {
    // Basic implementation - list files and search content
    const listResult = await this.listFiles('.', true)
    if (!listResult.success) return listResult

    const files = (listResult.output as any).files as FileInfo[]
    const matches: SearchMatch[] = []
    const regex = new RegExp(pattern, 'gi')
    const maxMatches = 100

    for (const file of files) {
      if (matches.length >= maxMatches) break
      if (file.type !== 'file') continue

      // Basic glob matching (simplified)
      if (glob !== '**/*' && !this.matchGlob(file.path, glob)) continue

      const readResult = await this.readFile(file.path)
      if (!readResult.success) continue

      const content = (readResult.output as any).content as string
      const lines = content.split('\n')

      for (let i = 0; i < lines.length && matches.length < maxMatches; i++) {
        if (regex.test(lines[i])) {
          matches.push({
            file: file.path,
            line: i + 1,
            content: lines[i].trim().substring(0, 200)
          })
        }
        regex.lastIndex = 0
      }
    }

    return { success: true, output: { matches, count: matches.length, truncated: matches.length >= maxMatches } }
  }

  private matchGlob(path: string, glob: string): boolean {
    // Very basic glob matching
    if (glob.startsWith('*.')) {
      const ext = glob.substring(1)
      return path.endsWith(ext)
    }
    if (glob.includes('**')) {
      const parts = glob.split('**')
      return parts.every(part => part === '' || path.includes(part.replace(/\*/g, '')))
    }
    return true
  }

  /**
   * Read a file from an installed package (cache) or download from registry
   */
  async readPackageFile(packageName: string, version: string, filePath: string): Promise<ToolResult> {
    try {
      const packageId = `${packageName}@${version}`
      console.log(`[ToolExecutor] Reading package file: ${packageId}/${filePath}`)

      // First check if package is already cached
      let cached = await packageCache.getCachedPackage(packageId)

      // If not cached, try to download it
      if (!cached) {
        console.log(`[ToolExecutor] Package not cached, downloading: ${packageId}`)
        try {
          cached = await packageCache.downloadAndCache(packageName, version)
        } catch (downloadError) {
          // If download fails, try to get file content directly from registry
          console.log(`[ToolExecutor] Download failed, trying direct registry fetch`)
          const packageInfo = await registryApi.getPackageInfo(packageName)
          if (!packageInfo) {
            return {
              success: false,
              error: `Package not found: ${packageName}. Try searching the registry first with search_registry.`
            }
          }
          return {
            success: false,
            error: `Package ${packageId} could not be downloaded. The package exists but download failed: ${downloadError}`
          }
        }
      }

      // Read the file from cache
      const content = await packageCache.getFileContent(packageId, filePath)

      if (content === null) {
        // File not found - list available files to help the user
        const fileTree = cached?.fileTree || []
        const availableFiles = this.flattenFileTree(fileTree)

        return {
          success: false,
          error: `File not found in package: ${filePath}. Available files: ${availableFiles.slice(0, 10).join(', ')}${availableFiles.length > 10 ? '...' : ''}`
        }
      }

      return {
        success: true,
        output: {
          content,
          packageName,
          version,
          filePath,
          packageId
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error('[ToolExecutor] readPackageFile failed:', error)
      return { success: false, error: `Failed to read package file: ${errorMsg}` }
    }
  }

  /**
   * List files in an installed package
   */
  async listPackageFiles(packageName: string, version: string): Promise<ToolResult> {
    try {
      const packageId = `${packageName}@${version}`
      console.log(`[ToolExecutor] Listing package files: ${packageId}`)

      // First check if package is already cached
      let cached = await packageCache.getCachedPackage(packageId)

      // If not cached, try to download it
      if (!cached) {
        console.log(`[ToolExecutor] Package not cached, downloading: ${packageId}`)
        try {
          cached = await packageCache.downloadAndCache(packageName, version)
        } catch (downloadError) {
          // If download fails, try to get package info from registry
          const packageInfo = await registryApi.getPackageInfo(packageName)
          if (!packageInfo) {
            return {
              success: false,
              error: `Package not found: ${packageName}. Try searching the registry first with search_registry.`
            }
          }

          // Return files from package info if available
          if (packageInfo.files && packageInfo.files.length > 0) {
            return {
              success: true,
              output: {
                packageName,
                version: packageInfo.version,
                files: packageInfo.files,
                count: packageInfo.files.length,
                note: 'File list from registry (package not cached locally)'
              }
            }
          }

          return {
            success: false,
            error: `Package ${packageId} could not be downloaded: ${downloadError}`
          }
        }
      }

      // Build flat file list from tree
      const files = this.flattenFileTree(cached.fileTree)

      return {
        success: true,
        output: {
          packageName,
          version,
          packageId,
          files,
          count: files.length,
          fileTree: cached.fileTree
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error('[ToolExecutor] listPackageFiles failed:', error)
      return { success: false, error: `Failed to list package files: ${errorMsg}` }
    }
  }

  /**
   * Helper to flatten file tree into path list
   */
  private flattenFileTree(nodes: Array<{ name: string; path: string; kind: string; children?: unknown[] }>, _prefix: string = ''): string[] {
    const files: string[] = []

    for (const node of nodes) {
      if (node.kind === 'file') {
        files.push(node.path)
      } else if (node.kind === 'folder' && node.children) {
        files.push(...this.flattenFileTree(node.children as Array<{ name: string; path: string; kind: string; children?: unknown[] }>, node.path))
      }
    }

    return files
  }

  async searchRegistry(query: string, tags?: string[]): Promise<ToolResult> {
    try {
      // Build search query - combine text query with tags
      let searchQuery = query || ''
      if (tags && tags.length > 0) {
        // Append tags to the query for better search results
        searchQuery = `${searchQuery} ${tags.join(' ')}`.trim()
      }

      console.log(`[ToolExecutor] Searching registry for: "${searchQuery}"`)

      const result = await registryApi.searchPackages(searchQuery, 20)

      if (!result || result.packages.length === 0) {
        return {
          success: true,
          output: {
            packages: [],
            total: 0,
            message: `No packages found for "${searchQuery}"`
          }
        }
      }

      // Format results for the agent
      const packages = result.packages.map(pkg => ({
        name: pkg.name,
        version: pkg.version,
        description: pkg.description,
        keywords: pkg.keywords || [],
        downloads: pkg.downloads,
        author: pkg.author
      }))

      return {
        success: true,
        output: {
          packages,
          total: result.total,
          query: searchQuery
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error('[ToolExecutor] Registry search failed:', error)
      return { success: false, error: `Registry search failed: ${errorMsg}` }
    }
  }

  async runCommand(command: string, cwd?: string): Promise<ToolResult> {
    // AIChat uses only the built-in command whitelist (workflow custom commands are separate)
    const allowedCommands = BUILTIN_COMMAND_EXECUTABLES.map(cmd => cmd.executable.toLowerCase())

    const firstWord = command.split(' ')[0].toLowerCase()

    if (!allowedCommands.includes(firstWord)) {
      return {
        success: false,
        error: `Command '${firstWord}' not allowed. Allowed: ${allowedCommands.join(', ')}`
      }
    }

    const api = (window as any).electronAPI
    if (!api?.runCommand) {
      return { success: false, error: 'Command execution not available in this environment' }
    }

    try {
      // If cwd is provided, resolve it. Otherwise use workspace path.
      // Pass undefined (not empty string) to let main.js use its fallback (process.cwd())
      const workingDir = cwd ? this.resolvePath(cwd) : (this.workspacePath || undefined)
      const result = await api.runCommand(command, workingDir)

      // main.js returns { success, stdout, stderr, exitCode }
      if (!result.success) {
        return {
          success: false,
          error: result.stderr || 'Command failed',
          output: {
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr
          } as CommandResult
        }
      }

      return {
        success: true,
        output: {
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr
        } as CommandResult
      }
    } catch (error) {
      return { success: false, error: `Command failed: ${error}` }
    }
  }

  private validatePath(path: string): { valid: boolean; error?: string } {
    if (!path || typeof path !== 'string') {
      return { valid: false, error: 'Invalid path' }
    }

    // Check for directory traversal
    if (path.includes('..')) {
      return { valid: false, error: 'Path traversal (..) not allowed' }
    }

    // Allow absolute paths for package cache resolution
    // but still check for shell metacharacters
    const dangerous = ['|', '>', '<', '&', ';', '`', '$', '(', ')']
    for (const char of dangerous) {
      if (path.includes(char)) {
        return { valid: false, error: `Invalid character in path: ${char}` }
      }
    }

    return { valid: true }
  }

  /**
   * Resolve a path, handling package references like:
   * - node_modules/@namespace/package/... -> check cache locations
   * - @namespace/package/... -> check cache locations
   * - Regular relative paths -> workspace relative
   */
  private resolvePath(relativePath: string): string {
    // Normalize path separators
    const normalized = relativePath.replace(/\\/g, '/')
    if (normalized === '.' || normalized === '') {
      return this.workspacePath
    }
    return `${this.workspacePath}/${normalized}`
  }

  /**
   * Try to resolve package paths to cache locations
   * Returns array of possible paths to try
   */
  private async resolvePackagePath(path: string): Promise<string[]> {
    const normalized = path.replace(/\\/g, '/')
    const pathsToTry: string[] = []

    // Ensure homePath is loaded before using it
    const homePath = await this.ensureHomePath()

    // Check if this looks like a package reference
    // Patterns:
    // 1. node_modules/@namespace/package/...
    // 2. @namespace/package/... (direct reference)
    // 3. Paths with @p/ prefix (alias from using directive)

    const nodeModulesMatch = normalized.match(/^node_modules\/@([^/]+)\/([^/]+)\/(.+)$/)
    const directPackageMatch = normalized.match(/^@([^/]+)\/([^/]+)\/(.+)$/)

    if (nodeModulesMatch || directPackageMatch) {
      const match = nodeModulesMatch || directPackageMatch
      const namespace = match![1]
      const packageName = match![2]
      const filePath = match![3]

      // Add cache locations to try
      // 1. Local project cache: ./.prompd/cache/@namespace/package/version/
      // 2. Global user cache: ~/.prompd/cache/@namespace/package/version/

      // Try to find package in cache - need to look for version directories
      const cacheLocations = [
        `${this.workspacePath}/.prompd/cache/@${namespace}/${packageName}`,
        homePath ? `${homePath}/.prompd/cache/@${namespace}/${packageName}` : null
      ].filter((loc): loc is string => loc !== null && !loc.includes('null'))

      // For each cache location, we'll need to find the latest version
      for (const cacheBase of cacheLocations) {
        // Try common version patterns
        const versions = ['1.1.0', '1.0.0', '2.0.0', '0.1.0', 'latest']
        for (const version of versions) {
          pathsToTry.push(`${cacheBase}/${version}/${filePath}`)
        }
      }
    }

    // Also try the path as-is in workspace
    pathsToTry.push(`${this.workspacePath}/${normalized}`)

    return pathsToTry
  }

  /**
   * Check if a path looks like a package reference
   */
  private isPackageReference(path: string): boolean {
    const normalized = path.replace(/\\/g, '/')
    return (
      normalized.includes('node_modules/@') ||
      normalized.startsWith('@') ||
      normalized.includes('@prompd/') ||
      normalized.includes('@p/')
    )
  }

  /**
   * Read file with package resolution - tries multiple cache locations
   */
  async readFileWithPackageResolution(path: string): Promise<ToolResult> {
    const api = (window as any).electronAPI
    if (!api?.readFile) {
      return { success: false, error: 'Electron API not available' }
    }

    // If this looks like a package reference, try multiple locations
    if (this.isPackageReference(path)) {
      const pathsToTry = await this.resolvePackagePath(path)
      console.log(`[ToolExecutor] Package reference detected, trying ${pathsToTry.length} locations`)

      for (const tryPath of pathsToTry) {
        try {
          const result = await api.readFile(tryPath)
          if (result.success) {
            console.log(`[ToolExecutor] Found package file at: ${tryPath}`)
            // Normalize CRLF to LF so LLM sees consistent line endings
            const content = typeof result.content === 'string'
              ? result.content.replace(/\r\n/g, '\n')
              : result.content
            return {
              success: true,
              output: {
                content,
                path,
                resolvedPath: tryPath
              }
            }
          }
        } catch (e) {
          // Continue to next path
        }
      }

      return {
        success: false,
        error: `Package file not found. Tried cache locations for: ${path}. Install the package with 'prompd install' or check ~/.prompd/cache/`
      }
    }

    // Regular file - use standard resolution
    const fullPath = this.resolvePath(path)
    try {
      const result = await api.readFile(fullPath)
      if (result.success) {
        // Normalize CRLF to LF so LLM sees consistent line endings
        const content = typeof result.content === 'string'
          ? result.content.replace(/\r\n/g, '\n')
          : result.content
        return { success: true, output: { content, path } }
      } else {
        return { success: false, error: result.error || 'Failed to read file' }
      }
    } catch (error) {
      return { success: false, error: `Read failed: ${error}` }
    }
  }

  /**
   * Undo the last file operation
   */
  async undo(): Promise<ToolResult> {
    const entry = undoStack.popForRedo()
    if (!entry) {
      return { success: false, error: 'Nothing to undo' }
    }

    const api = (window as any).electronAPI
    if (!api?.writeFile) {
      // Push entry back since we couldn't undo
      undoStack.push(entry)
      return { success: false, error: 'Electron API not available' }
    }

    try {
      const fullPath = this.resolvePath(entry.path)

      // If original content was empty string, it means the file didn't exist before
      // In that case, we should delete the file (or leave it empty)
      if (entry.originalContent === '') {
        // For now, write empty content - file deletion could be added later
        console.log(`[ToolExecutor] Undo: restoring ${entry.path} (file was new, clearing content)`)
      } else {
        console.log(`[ToolExecutor] Undo: restoring ${entry.path} to previous state`)
      }

      const result = await api.writeFile(fullPath, entry.originalContent)

      if (result.success) {
        // Sync with any open tabs that have this file
        syncFileWithOpenTabs(fullPath, entry.originalContent, this.workspacePath)

        return {
          success: true,
          output: {
            path: entry.path,
            description: entry.description,
            restoredContent: entry.originalContent,
            message: `Undid: ${entry.description}`
          }
        }
      } else {
        // Push entry back since undo failed
        undoStack.push(entry)
        return { success: false, error: result.error || 'Failed to restore file' }
      }
    } catch (error) {
      // Push entry back since undo failed
      undoStack.push(entry)
      return { success: false, error: `Undo failed: ${error}` }
    }
  }

  async redo(): Promise<ToolResult> {
    const entry = undoStack.popFromRedo()
    if (!entry) {
      return { success: false, error: 'Nothing to redo' }
    }

    const api = (window as any).electronAPI
    if (!api?.writeFile) {
      // Push entry back since we couldn't redo
      undoStack.popForRedo() // Move it back to redo stack
      return { success: false, error: 'Electron API not available' }
    }

    try {
      const fullPath = this.resolvePath(entry.path)

      console.log(`[ToolExecutor] Redo: applying ${entry.path}`)

      const result = await api.writeFile(fullPath, entry.newContent)

      if (result.success) {
        // Sync with any open tabs that have this file
        syncFileWithOpenTabs(fullPath, entry.newContent, this.workspacePath)

        return {
          success: true,
          output: {
            path: entry.path,
            content: entry.newContent,
            description: entry.description,
            message: `Redid: ${entry.description}`
          }
        }
      } else {
        // Push entry back to redo stack since redo failed
        undoStack.popForRedo()
        return { success: false, error: result.error || 'Failed to restore file' }
      }
    } catch (error) {
      // Push entry back to redo stack since redo failed
      undoStack.popForRedo()
      return { success: false, error: `Redo failed: ${error}` }
    }
  }
}

// ============================================================================
// Browser Tool Executor (Limited)
// ============================================================================

export class BrowserToolExecutor implements IToolExecutor {
  readonly platform = 'browser' as const
  private openFiles: Map<string, string> // path -> content

  constructor(openFiles?: Map<string, string>) {
    this.openFiles = openFiles || new Map()
  }

  /** Update the set of open files the executor can access */
  setOpenFiles(files: Map<string, string>) {
    this.openFiles = files
  }

  /** Add a file to the accessible set */
  addFile(path: string, content: string) {
    this.openFiles.set(path, content)
  }

  isToolAvailable(tool: string): boolean {
    // Limited tools in browser - but search_registry and package tools work via network
    const available = ['read_file', 'write_file', 'edit_file', 'list_files', 'search_registry', 'read_package_file', 'list_package_files', 'ask_user']
    return available.includes(tool)
  }

  async execute(call: ToolCall): Promise<ToolResult> {
    console.log(`[ToolExecutor:Browser] Executing ${call.tool}`, call.params)

    switch (call.tool) {
      case 'read_file':
        return this.readFile(call.params.path as string)
      case 'write_file':
        return this.writeFile(call.params.path as string, call.params.content as string)
      case 'edit_file':
        return this.editFile(call.params.path as string, call.params.edits as EditOperation[])
      case 'list_files':
        return this.listFiles(call.params.path as string || '.')
      case 'search_files':
        return { success: false, error: 'File search not available in browser mode. Open files first.' }
      case 'search_registry':
        return this.searchRegistry(call.params.query as string, call.params.tags as string[])
      case 'read_package_file':
        return this.readPackageFile(
          call.params.package_name as string,
          call.params.version as string,
          call.params.file_path as string
        )
      case 'list_package_files':
        return this.listPackageFiles(
          call.params.package_name as string,
          call.params.version as string
        )
      case 'rename_file':
        return { success: false, error: 'File rename not available in browser mode.' }
      case 'run_command':
        return { success: false, error: 'Command execution not available in browser mode.' }
      case 'ask_user':
        return { success: true, output: { type: 'ask_user', question: call.params.question } }
      default:
        return { success: false, error: `Unknown tool: ${call.tool}` }
    }
  }

  async readFile(path: string): Promise<ToolResult> {
    const content = this.openFiles.get(path)
    if (content !== undefined) {
      return { success: true, output: { content, path } }
    }
    return {
      success: false,
      error: `File not open: ${path}. In browser mode, only open files can be read.`
    }
  }

  async writeFile(path: string, content: string): Promise<ToolResult> {
    // Get original content for undo stack
    const originalContent = this.openFiles.get(path) || ''

    // In browser, we can only "write" to the in-memory map
    // The actual file save would need to be handled by the editor
    this.openFiles.set(path, content)

    // Save to undo stack
    undoStack.push({
      tool: 'write_file',
      path,
      originalContent,
      newContent: content,
      description: originalContent ? `Overwrote ${path}` : `Created ${path}`
    })

    // Sync with any open tabs that have this file
    syncFileWithOpenTabs(path, content)

    return {
      success: true,
      output: {
        path,
        bytesWritten: content.length,
        note: 'File updated in memory. Save to persist.',
        // Include the written content so LLM knows the current state
        updatedContent: content,
        canUndo: true
      }
    }
  }

  async editFile(path: string, edits: EditOperation[]): Promise<ToolResult> {
    if (!edits || edits.length === 0) {
      return { success: false, error: 'No edits provided' }
    }

    const appliedEdits: Array<{ search: string; found: boolean; index: number }> = []
    let originalContent: string | null = null  // Store for undo

    // Apply each edit one at a time, writing and re-reading after each
    // This ensures each edit sees the actual file content after previous edits
    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i]
      if (!edit.search) {
        return { success: false, error: `Edit ${i + 1} missing "search" field` }
      }

      // Read fresh content from in-memory store for each edit
      const readResult = await this.readFile(path)
      if (!readResult.success) {
        return { success: false, error: `Cannot read file for edit ${i + 1}: ${readResult.error}` }
      }

      const currentContent = (readResult.output as { content: string }).content

      // Save original content on first iteration for undo
      if (i === 0) {
        originalContent = currentContent
      }

      const found = currentContent.includes(edit.search)
      appliedEdits.push({
        search: edit.search.substring(0, 50) + (edit.search.length > 50 ? '...' : ''),
        found,
        index: i + 1
      })

      if (!found) {
        // Edit failed - return error with context about what's in the file
        console.error(`[ToolExecutor:Browser] Edit ${i + 1} failed - search string not found`)
        return {
          success: false,
          error: `Edit ${i + 1} of ${edits.length} failed - search string not found in file. Previous ${i} edit(s) were applied successfully. Re-read the file to see current content before retrying.`,
          output: {
            appliedEdits,
            failedAtIndex: i + 1,
            successfulCount: i,
            contentPreview: currentContent.substring(0, 500) + (currentContent.length > 500 ? '...' : '')
          }
        }
      }

      // Apply the edit
      const newContent = currentContent.replace(edit.search, edit.replace)

      // Validate .prmd format before writing this edit
      if (path.endsWith('.prmd') || path.endsWith('.prompd')) {
        console.log(`[ToolExecutor:Browser] Validating .prmd format for edit ${i + 1}`)
        const formatValidation = this.validatePrompdFormat(newContent)
        if (!formatValidation.valid) {
          console.error('[ToolExecutor:Browser] REJECTING edit - invalid .prmd format:', formatValidation.error)
          return {
            success: false,
            error: `EDIT ${i + 1} REJECTED - INVALID .prmd FORMAT: ${formatValidation.error}

CORRECT .prmd structure (you MUST follow this):
---
id: example
version: 1.0.0
inherits: "@p/template.prmd"
---

# Markdown Title (goes AFTER the closing ---)

## Section
Content here.

TO ADD MARKDOWN: Search for the LAST line of YAML + closing --- together, then add markdown AFTER:
<search>inherits: "@p/template.prmd"
---</search>
<replace>inherits: "@p/template.prmd"
---

# New Section

Content here.</replace>

NEVER put markdown headers (# Title) BETWEEN the opening --- and closing ---. That area is ONLY for YAML.`,
            output: { appliedEdits, rejectedReason: 'format_validation', failedAtIndex: i + 1 }
          }
        }
      }

      // Write the edit to in-memory store immediately
      this.openFiles.set(path, newContent)

      console.log(`[ToolExecutor:Browser] Edit ${i + 1} of ${edits.length} applied successfully`)
    }

    // All edits succeeded - read final content for undo stack
    const finalContent = this.openFiles.get(path) || ''

    // Save to undo stack with all edits as one operation
    if (originalContent !== null) {
      undoStack.push({
        tool: 'edit_file',
        path,
        originalContent,
        newContent: finalContent,
        description: `Edited ${path} (${edits.length} change${edits.length > 1 ? 's' : ''})`
      })
    }

    // Sync with any open tabs that have this file
    syncFileWithOpenTabs(path, finalContent)

    return {
      success: true,
      output: {
        path,
        editsApplied: edits.length,
        totalEdits: edits.length,
        appliedEdits,
        note: 'File updated in memory. Save to persist.',
        // Include the updated file content so LLM knows the current state
        updatedContent: finalContent,
        canUndo: true
      }
    }
  }

  async renameFile(_oldPath: string, _newPath: string): Promise<ToolResult> {
    return { success: false, error: 'File rename not available in browser mode.' }
  }

  /**
   * Validate .prmd file format (same as ElectronToolExecutor)
   */
  private validatePrompdFormat(content: string): { valid: boolean; error?: string } {
    const trimmed = content.trim()

    // Must start with ---
    if (!trimmed.startsWith('---')) {
      const firstDashIndex = trimmed.indexOf('---')
      if (firstDashIndex > 0) {
        const contentBefore = trimmed.substring(0, firstDashIndex).trim()
        if (contentBefore.startsWith('#') || contentBefore.includes('\n#')) {
          return {
            valid: false,
            error: 'Markdown content was added BEFORE the opening ---. Markdown must come AFTER the closing ---'
          }
        }
        return {
          valid: false,
          error: 'File must start with --- on line 1 (found content before the opening ---)'
        }
      }
      return {
        valid: false,
        error: 'File must start with --- on line 1'
      }
    }

    // Find the closing ---
    const afterOpening = trimmed.substring(3)
    const closingIndex = afterOpening.indexOf('\n---')

    if (closingIndex === -1) {
      return {
        valid: false,
        error: 'Missing closing --- after YAML frontmatter'
      }
    }

    // Check that YAML section doesn't contain markdown headers
    // Markdown headers (# Title, ## Section) should NEVER be inside frontmatter
    const yamlSection = afterOpening.substring(0, closingIndex)
    const yamlLines = yamlSection.split('\n')
    for (const line of yamlLines) {
      const trimmedLine = line.trim()

      // Skip empty lines
      if (!trimmedLine) continue

      // Detect markdown headers: lines starting with # followed by space and capital letter
      if (trimmedLine.match(/^#{1,6}\s+[A-Z]/)) {
        return {
          valid: false,
          error: `Markdown header "${trimmedLine.substring(0, 40)}${trimmedLine.length > 40 ? '...' : ''}" found inside YAML frontmatter. Markdown content must come AFTER the closing ---`
        }
      }

      // Also catch ## headers which are clearly markdown
      if (trimmedLine.startsWith('## ') || trimmedLine.startsWith('### ')) {
        return {
          valid: false,
          error: `Markdown header "${trimmedLine.substring(0, 40)}${trimmedLine.length > 40 ? '...' : ''}" found inside YAML frontmatter. Markdown content must come AFTER the closing ---`
        }
      }
    }

    return { valid: true }
  }

  async listFiles(path: string, recursive?: boolean): Promise<ToolResult> {
    // List only open files
    const files: FileInfo[] = Array.from(this.openFiles.keys()).map(p => ({
      name: p.split('/').pop() || p,
      path: p,
      type: 'file' as const
    }))

    return {
      success: true,
      output: {
        files,
        count: files.length,
        note: 'Browser mode: only showing open files'
      }
    }
  }

  async searchFiles(pattern: string, glob?: string): Promise<ToolResult> {
    return { success: false, error: 'File search not available in browser mode' }
  }

  /**
   * Read a file from an installed package (cache) or download from registry
   * Works in browser mode via IndexedDB cache
   */
  async readPackageFile(packageName: string, version: string, filePath: string): Promise<ToolResult> {
    try {
      const packageId = `${packageName}@${version}`
      console.log(`[ToolExecutor:Browser] Reading package file: ${packageId}/${filePath}`)

      // First check if package is already cached
      let cached = await packageCache.getCachedPackage(packageId)

      // If not cached, try to download it
      if (!cached) {
        console.log(`[ToolExecutor:Browser] Package not cached, downloading: ${packageId}`)
        try {
          cached = await packageCache.downloadAndCache(packageName, version)
        } catch (downloadError) {
          const packageInfo = await registryApi.getPackageInfo(packageName)
          if (!packageInfo) {
            return {
              success: false,
              error: `Package not found: ${packageName}. Try searching the registry first with search_registry.`
            }
          }
          return {
            success: false,
            error: `Package ${packageId} could not be downloaded: ${downloadError}`
          }
        }
      }

      // Read the file from cache
      const content = await packageCache.getFileContent(packageId, filePath)

      if (content === null) {
        const fileTree = cached?.fileTree || []
        const availableFiles = this.flattenFileTree(fileTree)

        return {
          success: false,
          error: `File not found in package: ${filePath}. Available files: ${availableFiles.slice(0, 10).join(', ')}${availableFiles.length > 10 ? '...' : ''}`
        }
      }

      return {
        success: true,
        output: {
          content,
          packageName,
          version,
          filePath,
          packageId
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error('[ToolExecutor:Browser] readPackageFile failed:', error)
      return { success: false, error: `Failed to read package file: ${errorMsg}` }
    }
  }

  /**
   * List files in an installed package
   */
  async listPackageFiles(packageName: string, version: string): Promise<ToolResult> {
    try {
      const packageId = `${packageName}@${version}`
      console.log(`[ToolExecutor:Browser] Listing package files: ${packageId}`)

      let cached = await packageCache.getCachedPackage(packageId)

      if (!cached) {
        console.log(`[ToolExecutor:Browser] Package not cached, downloading: ${packageId}`)
        try {
          cached = await packageCache.downloadAndCache(packageName, version)
        } catch (downloadError) {
          const packageInfo = await registryApi.getPackageInfo(packageName)
          if (!packageInfo) {
            return {
              success: false,
              error: `Package not found: ${packageName}. Try searching the registry first with search_registry.`
            }
          }

          if (packageInfo.files && packageInfo.files.length > 0) {
            return {
              success: true,
              output: {
                packageName,
                version: packageInfo.version,
                files: packageInfo.files,
                count: packageInfo.files.length,
                note: 'File list from registry (package not cached locally)'
              }
            }
          }

          return {
            success: false,
            error: `Package ${packageId} could not be downloaded: ${downloadError}`
          }
        }
      }

      const files = this.flattenFileTree(cached.fileTree)

      return {
        success: true,
        output: {
          packageName,
          version,
          packageId,
          files,
          count: files.length,
          fileTree: cached.fileTree
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error('[ToolExecutor:Browser] listPackageFiles failed:', error)
      return { success: false, error: `Failed to list package files: ${errorMsg}` }
    }
  }

  /**
   * Helper to flatten file tree into path list
   */
  private flattenFileTree(nodes: Array<{ name: string; path: string; kind: string; children?: unknown[] }>, _prefix: string = ''): string[] {
    const files: string[] = []

    for (const node of nodes) {
      if (node.kind === 'file') {
        files.push(node.path)
      } else if (node.kind === 'folder' && node.children) {
        files.push(...this.flattenFileTree(node.children as Array<{ name: string; path: string; kind: string; children?: unknown[] }>, node.path))
      }
    }

    return files
  }

  async searchRegistry(query: string, tags?: string[]): Promise<ToolResult> {
    try {
      // Build search query - combine text query with tags
      let searchQuery = query || ''
      if (tags && tags.length > 0) {
        searchQuery = `${searchQuery} ${tags.join(' ')}`.trim()
      }

      console.log(`[ToolExecutor:Browser] Searching registry for: "${searchQuery}"`)

      const result = await registryApi.searchPackages(searchQuery, 20)

      if (!result || result.packages.length === 0) {
        return {
          success: true,
          output: {
            packages: [],
            total: 0,
            message: `No packages found for "${searchQuery}"`
          }
        }
      }

      const packages = result.packages.map(pkg => ({
        name: pkg.name,
        version: pkg.version,
        description: pkg.description,
        keywords: pkg.keywords || [],
        downloads: pkg.downloads,
        author: pkg.author
      }))

      return {
        success: true,
        output: {
          packages,
          total: result.total,
          query: searchQuery
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error('[ToolExecutor:Browser] Registry search failed:', error)
      return { success: false, error: `Registry search failed: ${errorMsg}` }
    }
  }

  async runCommand(command: string, cwd?: string): Promise<ToolResult> {
    return { success: false, error: 'Command execution not available in browser mode' }
  }

  /**
   * Undo the last file operation
   */
  async undo(): Promise<ToolResult> {
    const entry = undoStack.popForRedo()
    if (!entry) {
      return { success: false, error: 'Nothing to undo' }
    }

    // Restore original content in memory
    if (entry.originalContent === '') {
      // File was newly created - remove it from openFiles
      this.openFiles.delete(entry.path)
      console.log(`[ToolExecutor:Browser] Undo: removed new file ${entry.path}`)
    } else {
      // Restore previous content
      this.openFiles.set(entry.path, entry.originalContent)
      console.log(`[ToolExecutor:Browser] Undo: restored ${entry.path} to previous state`)
    }

    return {
      success: true,
      output: {
        path: entry.path,
        description: entry.description,
        restoredContent: entry.originalContent,
        message: `Undid: ${entry.description}`,
        note: 'File restored in memory. Changes reflected in editor.'
      }
    }
  }

  async redo(): Promise<ToolResult> {
    const entry = undoStack.popFromRedo()
    if (!entry) {
      return { success: false, error: 'Nothing to redo' }
    }

    // Re-apply the change in memory
    this.openFiles.set(entry.path, entry.newContent)
    console.log(`[ToolExecutor:Browser] Redo: re-applied changes to ${entry.path}`)

    return {
      success: true,
      output: {
        path: entry.path,
        content: entry.newContent,
        description: entry.description,
        message: `Redid: ${entry.description}`,
        note: 'File updated in memory. Changes reflected in editor.'
      }
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createToolExecutor(workspacePath?: string, openFiles?: Map<string, string>): IToolExecutor {
  const api = (window as unknown as { electronAPI?: { isElectron?: boolean } }).electronAPI
  const isElectron = !!api?.isElectron

  if (isElectron) {
    // In Electron, create ElectronToolExecutor even without workspace
    // Commands will use the main.js fallback (currentWorkspacePath || process.cwd())
    // File operations still require workspace for relative path resolution
    const effectivePath = workspacePath || ''
    console.log('[ToolExecutor] Creating ElectronToolExecutor for workspace:', effectivePath || '(none - using cwd for commands)')
    return new ElectronToolExecutor(effectivePath)
  } else {
    console.log('[ToolExecutor] Creating BrowserToolExecutor (limited mode)')
    return new BrowserToolExecutor(openFiles)
  }
}

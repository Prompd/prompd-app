/**
 * Local project storage service using localStorage
 * Stores entire project directories with all files
 */

export interface ProjectFile {
  path: string
  content: string
}

export interface TabState {
  name: string
  path: string
  viewMode: 'wizard' | 'design' | 'code'
}

export interface LocalProject {
  id: string
  name: string
  files: ProjectFile[]
  lastAccessed: string
  created: string
  size: number
  uploadedToCloud: boolean
  cloudProjectId?: string
  // New: Store which tabs were open
  openTabs?: TabState[]
  activeTabPath?: string
  // Electron: Store actual filesystem path for git operations
  workspacePath?: string
}

const STORAGE_KEY_PREFIX = 'prompd.local.projects'
const LEGACY_STORAGE_KEY = 'prompd.local.projects' // For migrating old unscoped data
const INDEXEDDB_NAME = 'prompd-file-handles'
const INDEXEDDB_STORE = 'directoryHandles'
const MAX_PROJECTS = 50 // Limit to prevent localStorage overflow
const MAX_PROJECT_SIZE = 10 * 1024 * 1024 // 10MB per project

class LocalProjectStorage {
  private db: IDBDatabase | null = null
  private currentUserId: string | null = null

  constructor() {
    this.initIndexedDB()
  }

  /**
   * Set the current user ID for user-scoped storage
   * Call this when user signs in
   */
  setCurrentUser(userId: string | null): void {
    console.log('[LocalProjectStorage] Setting current user:', userId ? userId.slice(0, 8) + '...' : 'none')
    this.currentUserId = userId

    // Migrate legacy unscoped projects to the new user if they exist
    if (userId) {
      this.migrateLegacyProjects(userId)
    }
  }

  /**
   * Get the current user ID
   */
  getCurrentUser(): string | null {
    return this.currentUserId
  }

  /**
   * Get the storage key for the current user
   */
  private getStorageKey(): string {
    if (this.currentUserId) {
      return `${STORAGE_KEY_PREFIX}.${this.currentUserId}`
    }
    // Fallback to legacy key if no user set (shouldn't happen in practice)
    return LEGACY_STORAGE_KEY
  }

  /**
   * Migrate legacy unscoped projects to a user's storage
   */
  private migrateLegacyProjects(userId: string): void {
    try {
      const legacyData = localStorage.getItem(LEGACY_STORAGE_KEY)
      if (!legacyData) return

      const legacyProjects = JSON.parse(legacyData)
      if (!Array.isArray(legacyProjects) || legacyProjects.length === 0) return

      console.log(`[LocalProjectStorage] Migrating ${legacyProjects.length} legacy projects to user ${userId.slice(0, 8)}...`)

      // Get existing user projects
      const userKey = `${STORAGE_KEY_PREFIX}.${userId}`
      const existingData = localStorage.getItem(userKey)
      const existingProjects = existingData ? JSON.parse(existingData) : []

      // Merge legacy projects with existing (legacy first, then dedupe by id)
      const mergedProjects = [...legacyProjects]
      for (const existing of existingProjects) {
        if (!mergedProjects.some(p => p.id === existing.id)) {
          mergedProjects.push(existing)
        }
      }

      // Save merged projects to user storage
      localStorage.setItem(userKey, JSON.stringify(mergedProjects))
      console.log(`[LocalProjectStorage] Migrated projects saved to ${userKey}`)

      // Remove legacy storage to prevent re-migration
      localStorage.removeItem(LEGACY_STORAGE_KEY)
      console.log('[LocalProjectStorage] Legacy storage key removed')
    } catch (error) {
      console.warn('[LocalProjectStorage] Failed to migrate legacy projects:', error)
    }
  }

  /**
   * Initialize IndexedDB for storing File System Access API handles
   */
  private async initIndexedDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(INDEXEDDB_NAME, 1)

      request.onerror = () => {
        console.warn('IndexedDB not available - directory handles will not persist')
        resolve()
      }

      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(INDEXEDDB_STORE)) {
          db.createObjectStore(INDEXEDDB_STORE)
        }
      }
    })
  }
  /**
   * Get all stored projects sorted by most recently accessed
   */
  getAll(): LocalProject[] {
    try {
      const storageKey = this.getStorageKey()
      const data = localStorage.getItem(storageKey)
      console.log('[LocalProjectStorage] Using storage key:', storageKey)
      console.log('[LocalProjectStorage] Raw localStorage data length:', data?.length || 0)
      if (!data) return []

      let projects: any[] = JSON.parse(data)

      console.log('[LocalProjectStorage] Raw projects from storage:', projects.length)
      console.log('[LocalProjectStorage] Project IDs:', projects.map(p => ({ id: p.id, name: p.name })))

      // Migrate old format to new format
      projects = projects.map(project => {
        // Check if old format (has 'content' instead of 'files')
        if (project.content && !project.files) {
          console.log('[LocalProjectStorage] Migrating old format project:', project.name)
          return {
            ...project,
            files: [{ path: project.name, content: project.content }],
            uploadedToCloud: false,
            cloudProjectId: undefined
          }
        }
        return project
      })

      // Filter out any invalid projects and log filtered ones
      // Note: Allow projects with 0 files (they might have been saved from empty dirs or with permission issues)
      const validProjects: LocalProject[] = projects.filter(p => {
        const isValid = p.id && p.name && Array.isArray(p.files)
        if (!isValid) {
          console.log('[LocalProjectStorage] Filtering out invalid project:', {
            id: p.id,
            name: p.name,
            hasFiles: Array.isArray(p.files),
            filesLength: p.files?.length
          })
        }
        return isValid
      })

      console.log('[LocalProjectStorage] Valid projects after filter:', validProjects.length)

      return validProjects.sort((a, b) =>
        new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime()
      )
    } catch (error) {
      console.error('Failed to load projects from localStorage:', error)
      return []
    }
  }

  /**
   * Get a single project by ID
   */
  get(id: string): LocalProject | null {
    const projects = this.getAll()
    return projects.find(p => p.id === id) || null
  }

  /**
   * Save entire project directory to localStorage
   * @param workspacePath - Optional filesystem path (Electron only) for git operations
   */
  async saveProject(name: string, dirHandle: any, id?: string, workspacePath?: string): Promise<LocalProject> {
    const files: ProjectFile[] = []

    console.log('[LocalProjectStorage] saveProject called:', {
      name,
      hasElectronPath: !!dirHandle?._electronPath,
      electronPath: dirHandle?._electronPath,
      workspacePath
    })

    // Recursively read all files from directory
    await this.readDirectory(dirHandle, '', files)

    console.log('[LocalProjectStorage] Files collected:', files.length, files.map(f => f.path))

    // Calculate total size
    const totalSize = files.reduce((sum, f) => sum + new Blob([f.content]).size, 0)

    // Check size limit
    if (totalSize > MAX_PROJECT_SIZE) {
      throw new Error(`Project exceeds maximum size of ${this.formatBytes(MAX_PROJECT_SIZE)}. Current size: ${this.formatBytes(totalSize)}`)
    }

    const projects = this.getAll()
    const now = new Date().toISOString()

    // Check if updating existing project
    const existingIndex = id ? projects.findIndex(p => p.id === id) : -1
    const existing = existingIndex >= 0 ? projects[existingIndex] : null

    const project: LocalProject = {
      id: id || this.generateId(),
      name,
      files,
      lastAccessed: now,
      created: existing?.created || now,
      size: totalSize,
      uploadedToCloud: existing?.uploadedToCloud || false,
      cloudProjectId: existing?.cloudProjectId,
      openTabs: existing?.openTabs,
      activeTabPath: existing?.activeTabPath,
      workspacePath: workspacePath || existing?.workspacePath
    }

    if (existingIndex >= 0) {
      console.log('[LocalProjectStorage] Updating existing project at index:', existingIndex)
      projects[existingIndex] = project
    } else {
      console.log('[LocalProjectStorage] Adding new project to list')
      projects.unshift(project)
    }

    console.log('[LocalProjectStorage] Total projects before save:', projects.length)
    console.log('[LocalProjectStorage] Project IDs being saved:', projects.map(p => ({ id: p.id, name: p.name })))

    // Limit total projects
    if (projects.length > MAX_PROJECTS) {
      projects.splice(MAX_PROJECTS)
    }

    try {
      const storageKey = this.getStorageKey()
      const jsonData = JSON.stringify(projects)
      console.log('[LocalProjectStorage] Saving JSON data length:', jsonData.length)
      console.log('[LocalProjectStorage] Saving to key:', storageKey)
      localStorage.setItem(storageKey, jsonData)

      // Also save directory handle to IndexedDB
      if (dirHandle && typeof dirHandle === 'object' && 'kind' in dirHandle) {
        await this.saveDirectoryHandle(project.id, dirHandle)
      }

      return project
    } catch (error) {
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        // Try removing oldest projects to make space
        const reducedProjects = projects.slice(0, Math.floor(MAX_PROJECTS / 2))
        localStorage.setItem(this.getStorageKey(), JSON.stringify(reducedProjects))
        throw new Error('Storage quota exceeded. Removed oldest projects to make space. Please try again.')
      }
      throw error
    }
  }

  /**
   * Recursively read directory contents
   * Handles both File System Access API handles and Electron mode
   */
  private async readDirectory(dirHandle: any, basePath: string, files: ProjectFile[]): Promise<void> {
    // Electron mode: use IPC to read directory
    if (dirHandle._electronPath && (window as any).electronAPI?.readDir) {
      const electronPath = basePath
        ? `${dirHandle._electronPath}/${basePath}`.replace(/\\/g, '/')
        : dirHandle._electronPath

      console.log('[LocalProjectStorage] Reading directory (Electron):', electronPath)

      const result = await (window as any).electronAPI.readDir(electronPath)
      if (!result.success) {
        console.warn(`[LocalProjectStorage] Failed to read directory ${electronPath}:`, result.error)
        return
      }

      console.log(`[LocalProjectStorage] Found ${result.files?.length || 0} items in ${electronPath}`)

      for (const item of result.files) {
        const relativePath = basePath ? `${basePath}/${item.name}` : item.name

        if (item.isDirectory) {
          // Recursively read subdirectory
          await this.readDirectory(dirHandle, relativePath, files)
        } else {
          // Read file content
          try {
            const fileResult = await (window as any).electronAPI.readFile(item.path)
            if (fileResult.success) {
              files.push({ path: relativePath, content: fileResult.content })
              console.log(`[LocalProjectStorage] Read file: ${relativePath}`)
            } else {
              console.warn(`[LocalProjectStorage] Failed to read file content for ${relativePath}:`, fileResult.error)
            }
          } catch (error) {
            console.warn(`[LocalProjectStorage] Error reading file ${relativePath}:`, error)
          }
        }
      }
      return
    }

    // File System Access API mode
    for await (const [name, handle] of dirHandle.entries()) {
      const path = basePath ? `${basePath}/${name}` : name

      if (handle.kind === 'directory') {
        await this.readDirectory(handle, path, files)
      } else if (handle.kind === 'file') {
        try {
          const file = await handle.getFile()
          const content = await file.text()
          files.push({ path, content })
        } catch (error) {
          console.warn(`Failed to read file ${path}:`, error)
        }
      }
    }
  }

  /**
   * Update last accessed time for a project
   */
  updateLastAccessed(id: string): void {
    const projects = this.getAll()
    const project = projects.find(p => p.id === id)

    if (project) {
      project.lastAccessed = new Date().toISOString()
      localStorage.setItem(this.getStorageKey(), JSON.stringify(projects))
    }
  }

  /**
   * Mark project as uploaded to cloud
   */
  markAsUploaded(id: string, cloudProjectId: string): void {
    const projects = this.getAll()
    const project = projects.find(p => p.id === id)

    if (project) {
      project.uploadedToCloud = true
      project.cloudProjectId = cloudProjectId
      localStorage.setItem(this.getStorageKey(), JSON.stringify(projects))
    }
  }

  /**
   * Delete a project by ID
   */
  delete(id: string): void {
    const projects = this.getAll()
    const filtered = projects.filter(p => p.id !== id)
    localStorage.setItem(this.getStorageKey(), JSON.stringify(filtered))
  }

  /**
   * Delete all projects for current user
   */
  clear(): void {
    localStorage.removeItem(this.getStorageKey())
  }

  /**
   * Get total storage usage for current user
   */
  getStorageSize(): { bytes: number; formatted: string } {
    const data = localStorage.getItem(this.getStorageKey())
    const bytes = data ? new Blob([data]).size : 0
    return { bytes, formatted: this.formatBytes(bytes) }
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  /**
   * Generate a unique ID for a project
   */
  private generateId(): string {
    return `proj_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }

  /**
   * Export projects as JSON for backup (current user only)
   */
  exportAll(): string {
    return localStorage.getItem(this.getStorageKey()) || '[]'
  }

  /**
   * Import projects from JSON backup (for current user)
   */
  importAll(jsonData: string): void {
    try {
      const projects: LocalProject[] = JSON.parse(jsonData)
      // Validate structure
      if (!Array.isArray(projects)) {
        throw new Error('Invalid backup format')
      }
      localStorage.setItem(this.getStorageKey(), jsonData)
    } catch (error) {
      throw new Error('Failed to import backup: Invalid JSON format')
    }
  }

  /**
   * Get maximum project size
   */
  getMaxProjectSize(): number {
    return MAX_PROJECT_SIZE
  }

  /**
   * Save directory handle to IndexedDB
   */
  async saveDirectoryHandle(projectId: string, dirHandle: FileSystemDirectoryHandle): Promise<void> {
    if (!this.db) {
      console.warn('IndexedDB not available - directory handle will not persist')
      return
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([INDEXEDDB_STORE], 'readwrite')
      const store = transaction.objectStore(INDEXEDDB_STORE)
      const request = store.put(dirHandle, projectId)

      request.onsuccess = () => resolve()
      request.onerror = () => {
        console.error('Failed to save directory handle')
        resolve() // Don't reject - it's not critical
      }
    })
  }

  /**
   * Get directory handle from IndexedDB
   */
  async getDirectoryHandle(projectId: string): Promise<FileSystemDirectoryHandle | null> {
    if (!this.db) {
      return null
    }

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([INDEXEDDB_STORE], 'readonly')
      const store = transaction.objectStore(INDEXEDDB_STORE)
      const request = store.get(projectId)

      request.onsuccess = () => {
        const handle = request.result as FileSystemDirectoryHandle | undefined
        resolve(handle || null)
      }
      request.onerror = () => {
        console.error('Failed to retrieve directory handle')
        resolve(null)
      }
    })
  }

  /**
   * Verify and request permission for directory handle
   */
  async verifyPermission(dirHandle: FileSystemDirectoryHandle): Promise<boolean> {
    try {
      // Check if we already have permission (using optional chaining for non-standard API)
      if (dirHandle.queryPermission) {
        const permission = await dirHandle.queryPermission({ mode: 'readwrite' })
        if (permission === 'granted') {
          return true
        }
      }

      // Request permission if available (using optional chaining for non-standard API)
      if (dirHandle.requestPermission) {
        const newPermission = await dirHandle.requestPermission({ mode: 'readwrite' })
        return newPermission === 'granted'
      }

      // If permission APIs not available, assume we have permission
      return true
    } catch (error) {
      console.error('Failed to verify directory permission:', error)
      return false
    }
  }

  /**
   * Update tab state for a project
   */
  updateTabState(projectId: string, openTabs: TabState[], activeTabPath?: string): void {
    const projects = this.getAll()
    const project = projects.find(p => p.id === projectId)

    if (project) {
      project.openTabs = openTabs
      project.activeTabPath = activeTabPath
      project.lastAccessed = new Date().toISOString()
      localStorage.setItem(this.getStorageKey(), JSON.stringify(projects))
    }
  }
}

export const localProjectStorage = new LocalProjectStorage()

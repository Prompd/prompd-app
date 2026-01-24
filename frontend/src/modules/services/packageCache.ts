import JSZip from 'jszip'
import { registryApi } from './registryApi'
import { registryDiscovery } from './registryDiscovery'

/**
 * Package Cache Service
 *
 * Manages caching of downloaded packages in:
 * 1. File System Access API: ./.prompd/cache/ (preferred)
 * 2. IndexedDB: Fallback for browsers without FS API
 *
 * Aligned with Python CLI cache structure
 */

export interface FileNode {
  name: string
  path: string
  kind: 'file' | 'folder'
  children?: FileNode[]
}

export interface CachedPackage {
  packageId: string
  name: string
  version: string
  downloadedAt: number
  fileTree: FileNode[]
  zipBlob?: Blob
}

class PackageCacheService {
  private workspaceHandle: FileSystemDirectoryHandle | null = null
  private cacheHandle: FileSystemDirectoryHandle | null = null
  private db: IDBDatabase | null = null
  private readonly DB_NAME = 'prompd-package-cache'
  private readonly DB_VERSION = 1
  private readonly STORE_NAME = 'packages'

  constructor() {
    this.initIndexedDB()
  }

  /**
   * Initialize IndexedDB (fallback storage)
   */
  private async initIndexedDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION)

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error)
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'packageId' })
          store.createIndex('downloadedAt', 'downloadedAt', { unique: false })
        }
      }
    })
  }

  /**
   * Set workspace directory handle
   * Should be called when user opens a folder via File Explorer
   */
  setWorkspaceHandle(handle: FileSystemDirectoryHandle): void {
    this.workspaceHandle = handle
    this.cacheHandle = null // Reset cache handle, will be created on next access
  }

  /**
   * Get or create cache directory handle
   * Creates: ./.prompd/cache/
   * Note: In Electron, this will fail because we use IPC not File System Access API.
   * The IndexedDB fallback handles caching in that case.
   */
  private async getCacheDirectory(): Promise<FileSystemDirectoryHandle | null> {
    if (!this.workspaceHandle) {
      // This is expected in Electron mode - silently use IndexedDB
      return null
    }

    try {
      // Get or create .prompd directory
      const prompd = await this.workspaceHandle.getDirectoryHandle('.prompd', { create: true })

      // Get or create cache directory
      const cache = await prompd.getDirectoryHandle('cache', { create: true })

      this.cacheHandle = cache
      return cache
    } catch (err) {
      // Expected in Electron - getDirectoryHandle doesn't exist on our handle type
      // Silently fall back to IndexedDB
      return null
    }
  }

  /**
   * Download and cache a package
   * Uses registry discovery service for proper endpoint resolution
   */
  async downloadAndCache(packageName: string, version: string): Promise<CachedPackage> {
    const packageId = `${packageName}@${version}`

    // Check if already cached
    const cached = await this.getCachedPackage(packageId)
    if (cached) {
      console.log('[PackageCache] Using cached package:', packageId)
      console.log('[PackageCache] Cached file tree:', cached.fileTree)
      return cached
    }

    console.log('[PackageCache] Downloading package:', packageId)

    // Get download URL from discovery service (handles scoped packages correctly)
    let blob: Blob | null = null
    try {
      const downloadUrl = await registryDiscovery.getDownloadUrl(packageName, version)
      console.log('[PackageCache] Download URL from discovery:', downloadUrl)

      const response = await fetch(downloadUrl)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      blob = await response.blob()
    } catch (error) {
      console.warn('[PackageCache] Direct download failed, falling back to registryApi:', error)
      // Fallback to registryApi (handles auth tokens)
      blob = await registryApi.downloadPackage(packageName, version)
    }

    if (!blob) {
      throw new Error('Failed to download package from registry')
    }

    console.log('[PackageCache] Downloaded blob size:', blob.size, 'bytes')

    // Extract file tree
    const zip = await JSZip.loadAsync(blob)
    const fileTree = this.buildFileTree(zip)

    console.log('[PackageCache] Final file tree to be cached:', fileTree)

    const cachedPackage: CachedPackage = {
      packageId,
      name: packageName,
      version,
      downloadedAt: Date.now(),
      fileTree,
      zipBlob: blob
    }

    // Save to cache (File System or IndexedDB)
    await this.saveToCache(cachedPackage, zip)

    return cachedPackage
  }

  /**
   * Get cached package metadata
   */
  async getCachedPackage(packageId: string): Promise<CachedPackage | null> {
    // Try File System Access API first
    const cacheDir = await this.getCacheDirectory()
    if (cacheDir) {
      try {
        const pkgDir = await cacheDir.getDirectoryHandle(packageId, { create: false })
        const metaFile = await pkgDir.getFileHandle('metadata.json', { create: false })
        const file = await metaFile.getFile()
        const text = await file.text()
        const metadata = JSON.parse(text) as CachedPackage

        console.log('PackageCache: Found in File System:', packageId)
        return metadata
      } catch (err) {
        // Not found in file system, continue to IndexedDB
      }
    }

    // Fallback to IndexedDB
    if (!this.db) {
      await this.initIndexedDB()
    }

    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve(null)
        return
      }

      const transaction = this.db.transaction([this.STORE_NAME], 'readonly')
      const store = transaction.objectStore(this.STORE_NAME)
      const request = store.get(packageId)

      request.onsuccess = () => {
        if (request.result) {
          console.log('PackageCache: Found in IndexedDB:', packageId)
        }
        resolve(request.result || null)
      }

      request.onerror = () => {
        console.error('Failed to get from IndexedDB:', request.error)
        reject(request.error)
      }
    })
  }

  /**
   * Get file content from cached package
   */
  async getFileContent(packageId: string, filePath: string): Promise<string | null> {
    // Try File System Access API first
    const cacheDir = await this.getCacheDirectory()
    if (cacheDir) {
      try {
        const pkgDir = await cacheDir.getDirectoryHandle(packageId, { create: false })

        // Navigate to the file using path parts
        const parts = filePath.split('/')
        let current: FileSystemDirectoryHandle = pkgDir

        for (let i = 0; i < parts.length - 1; i++) {
          current = await current.getDirectoryHandle(parts[i], { create: false })
        }

        const fileName = parts[parts.length - 1]
        const fileHandle = await current.getFileHandle(fileName, { create: false })
        const file = await fileHandle.getFile()
        return await file.text()
      } catch (err) {
        // Expected in Electron - silently fall back to IndexedDB
      }
    }

    // Fallback to IndexedDB - extract from cached ZIP
    const cached = await this.getCachedPackage(packageId)
    if (cached && cached.zipBlob) {
      try {
        const zip = await JSZip.loadAsync(cached.zipBlob)
        const file = zip.file(filePath)
        if (file) {
          return await file.async('string')
        }
      } catch (err) {
        console.error('Failed to extract file from ZIP:', err)
      }
    }

    return null
  }

  /**
   * Get package file with metadata
   */
  async getPackageFile(packageId: string, filePath: string): Promise<{ content: string; path: string } | null> {
    const content = await this.getFileContent(packageId, filePath)
    if (content === null) {
      return null
    }
    return {
      content,
      path: filePath
    }
  }

  /**
   * Check if package is cached
   */
  async isPackageCached(packageId: string): Promise<boolean> {
    const cached = await this.getCachedPackage(packageId)
    return cached !== null
  }

  /**
   * Save package to cache
   */
  private async saveToCache(pkg: CachedPackage, zip: JSZip): Promise<void> {
    // Try File System Access API first (works in web browser with user permission)
    const cacheDir = await this.getCacheDirectory()
    if (cacheDir) {
      try {
        await this.saveToFileSystem(pkg, zip, cacheDir)
        console.log('[PackageCache] Saved to File System:', pkg.packageId)
        return
      } catch (err) {
        // Expected in Electron - silently fall back to IndexedDB
      }
    }

    // Fallback to IndexedDB (always works, used in Electron)
    await this.saveToIndexedDB(pkg)
    console.log('[PackageCache] Saved to IndexedDB:', pkg.packageId)
  }

  /**
   * Save to File System Access API
   * Structure: ./.prompd/cache/packages/{packageId}/
   */
  private async saveToFileSystem(pkg: CachedPackage, zip: JSZip, cacheDir: FileSystemDirectoryHandle): Promise<void> {
    // Create package directory
    const pkgDir = await cacheDir.getDirectoryHandle(pkg.packageId, { create: true })

    // Save metadata.json
    const metaFile = await pkgDir.getFileHandle('metadata.json', { create: true })
    const metaWritable = await metaFile.createWritable()
    await metaWritable.write(JSON.stringify({
      packageId: pkg.packageId,
      name: pkg.name,
      version: pkg.version,
      downloadedAt: pkg.downloadedAt,
      fileTree: pkg.fileTree
    }, null, 2))
    await metaWritable.close()

    // Extract all files from ZIP
    const filePromises: Promise<void>[] = []

    zip.forEach((relativePath, file) => {
      if (file.dir) return // Skip directories

      const promise = (async () => {
        const parts = relativePath.split('/')
        let current: FileSystemDirectoryHandle = pkgDir

        // Create nested directories
        for (let i = 0; i < parts.length - 1; i++) {
          current = await current.getDirectoryHandle(parts[i], { create: true })
        }

        // Write file
        const fileName = parts[parts.length - 1]
        const fileHandle = await current.getFileHandle(fileName, { create: true })
        const writable = await fileHandle.createWritable()
        const content = await file.async('blob')
        await writable.write(content)
        await writable.close()
      })()

      filePromises.push(promise)
    })

    await Promise.all(filePromises)
  }

  /**
   * Save to IndexedDB
   */
  private async saveToIndexedDB(pkg: CachedPackage): Promise<void> {
    if (!this.db) {
      await this.initIndexedDB()
    }

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('IndexedDB not available'))
        return
      }

      const transaction = this.db.transaction([this.STORE_NAME], 'readwrite')
      const store = transaction.objectStore(this.STORE_NAME)
      const request = store.put(pkg)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Build file tree from ZIP
   */
  private buildFileTree(zip: JSZip): FileNode[] {
    const root: Record<string, any> = {}
    const zipFiles = Object.keys(zip.files)

    console.log('PackageCache: Building file tree from ZIP with', zipFiles.length, 'entries:', zipFiles)

    if (zipFiles.length === 0) {
      console.warn('PackageCache: ZIP contains no files!')
      return []
    }

    // Build tree structure using nested objects
    Object.keys(zip.files).forEach(path => {
      if (zip.files[path].dir) return

      const parts = path.split('/')
      let current = root

      parts.forEach((part, index) => {
        const isLast = index === parts.length - 1

        if (isLast) {
          // Leaf node - file
          current[part] = {
            _kind: 'file',
            _path: path
          }
        } else {
          // Intermediate node - folder
          if (!current[part] || current[part]._kind === 'file') {
            current[part] = {}
          }
          current = current[part]
        }
      })
    })

    // Convert nested object to FileNode array
    const convertToNodes = (obj: Record<string, any>, parentPath: string = ''): FileNode[] => {
      return Object.entries(obj)
        .map(([name, value]) => {
          if (value._kind === 'file') {
            return {
              name,
              path: value._path,
              kind: 'file' as const
            }
          } else {
            const folderPath = parentPath ? `${parentPath}/${name}` : name
            return {
              name,
              path: folderPath,
              kind: 'folder' as const,
              children: convertToNodes(value, folderPath)
            }
          }
        })
        .sort((a, b) => {
          // Folders first, then alphabetically
          if (a.kind !== b.kind) {
            return a.kind === 'folder' ? -1 : 1
          }
          return a.name.localeCompare(b.name)
        })
    }

    const tree = convertToNodes(root)
    console.log('PackageCache: Built file tree with', tree.length, 'root nodes:', tree)
    return tree
  }

  /**
   * Clear all cached packages
   */
  async clearCache(): Promise<void> {
    // Clear File System cache
    const cacheDir = await this.getCacheDirectory()
    if (cacheDir) {
      try {
        // Remove all package directories
        for await (const entry of (cacheDir as any).values()) {
          await cacheDir.removeEntry(entry.name, { recursive: true })
        }
        console.log('PackageCache: Cleared File System cache')
      } catch (err) {
        console.error('Failed to clear File System cache:', err)
      }
    }

    // Clear IndexedDB cache
    if (this.db) {
      return new Promise((resolve, reject) => {
        if (!this.db) {
          resolve()
          return
        }

        const transaction = this.db.transaction([this.STORE_NAME], 'readwrite')
        const store = transaction.objectStore(this.STORE_NAME)
        const request = store.clear()

        request.onsuccess = () => {
          console.log('PackageCache: Cleared IndexedDB cache')
          resolve()
        }
        request.onerror = () => reject(request.error)
      })
    }
  }

  /**
   * List all cached packages
   */
  async listCachedPackages(): Promise<string[]> {
    const packages: string[] = []

    // Check File System cache
    const cacheDir = await this.getCacheDirectory()
    if (cacheDir) {
      try {
        for await (const entry of (cacheDir as any).values()) {
          if (entry.kind === 'directory') {
            packages.push(entry.name)
          }
        }
      } catch (err) {
        console.error('Failed to list File System cache:', err)
      }
    }

    // Check IndexedDB cache (if File System didn't work)
    if (packages.length === 0 && this.db) {
      const dbPackages = await new Promise<string[]>((resolve, reject) => {
        if (!this.db) {
          resolve([])
          return
        }

        const transaction = this.db.transaction([this.STORE_NAME], 'readonly')
        const store = transaction.objectStore(this.STORE_NAME)
        const request = store.getAllKeys()

        request.onsuccess = () => resolve(request.result as string[])
        request.onerror = () => reject(request.error)
      })

      packages.push(...dbPackages)
    }

    return packages
  }

  /**
   * Load a local .pdpkg file from a Blob or File
   * Returns the parsed package info including manifest and file tree
   */
  async loadLocalPackage(blob: Blob): Promise<{
    manifest: {
      name: string
      version: string
      description?: string
      author?: string
      main?: string
      files?: string[]
    } | null
    fileTree: FileNode[]
    getFileContent: (filePath: string) => Promise<string | null>
  }> {
    console.log('PackageCache: Loading local package, size:', blob.size, 'bytes')

    const zip = await JSZip.loadAsync(blob)
    const fileTree = this.buildFileTree(zip)

    // Try to read prompd.json (or legacy manifest.json for backwards compatibility)
    let manifest = null
    const manifestFile = zip.file('prompd.json') || zip.file('manifest.json')
    if (manifestFile) {
      try {
        const manifestText = await manifestFile.async('string')
        manifest = JSON.parse(manifestText)
        console.log('PackageCache: Found prompd.json:', manifest)
      } catch (err) {
        console.error('PackageCache: Failed to parse prompd.json:', err)
      }
    } else {
      console.warn('PackageCache: No prompd.json found in package')
    }

    // Return a function to get file content from the loaded zip
    const getFileContent = async (filePath: string): Promise<string | null> => {
      const file = zip.file(filePath)
      if (!file) {
        console.warn('PackageCache: File not found in local package:', filePath)
        return null
      }
      return await file.async('string')
    }

    return {
      manifest,
      fileTree,
      getFileContent
    }
  }
}

// Export singleton instance
export const packageCache = new PackageCacheService()

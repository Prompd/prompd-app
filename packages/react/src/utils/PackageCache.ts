import JSZip from 'jszip'

/**
 * Client-side package cache configuration
 */
export interface PackageCacheOptions {
  maxPackages?: number // Default: 10
  maxSizeMB?: number // Default: 50
  storage?: 'session' | 'local' | 'auto' // Default: 'auto'
}

/**
 * Prompt file metadata extracted from package
 */
export interface Prompt {
  name: string // Display name (filename without path)
  path: string // Full path within package (e.g., "prompts/scan.prmd")
  description?: string // From .prmd frontmatter (if parseable)
  size?: number // File size in bytes
}

/**
 * Generic file metadata from package
 */
export interface PackageFile {
  name: string // Filename only
  path: string // Full path within package
  type: 'file' | 'directory'
  size?: number // Size in bytes (files only)
}

/**
 * Package metadata stored with cache
 */
interface CachedPackage {
  name: string
  version: string
  blob: string // Base64 encoded blob
  timestamp: number // Unix timestamp
  size: number // Size in bytes
  sha256?: string // SHA256 hash for validation
}

/**
 * Client-side package cache using browser storage
 * Implements LRU eviction and security measures
 */
export class PackageCache {
  private readonly MAX_PACKAGES: number
  private readonly MAX_SIZE_MB: number
  private readonly MAX_SIZE_BYTES: number
  private readonly storageMode: 'session' | 'local' | 'auto'

  constructor(options: PackageCacheOptions = {}) {
    this.MAX_PACKAGES = options.maxPackages ?? 10
    this.MAX_SIZE_MB = options.maxSizeMB ?? 50
    this.MAX_SIZE_BYTES = this.MAX_SIZE_MB * 1024 * 1024
    this.storageMode = options.storage ?? 'auto'
  }

  /**
   * Get cache key for package
   */
  private getCacheKey(name: string, version: string): string {
    return `prompd:pkg:${name}@${version}`
  }

  /**
   * Get list of all cached package keys sorted by access time (oldest first)
   */
  private getCachedKeys(): string[] {
    const keys: Array<{ key: string; timestamp: number }> = []

    // Check both storages
    const storages = [sessionStorage, localStorage]

    for (const storage of storages) {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)
        if (key?.startsWith('prompd:pkg:')) {
          try {
            const data = storage.getItem(key)
            if (data) {
              const parsed = JSON.parse(data) as CachedPackage
              keys.push({ key, timestamp: parsed.timestamp })
            }
          } catch {
            // Invalid cache entry, skip
          }
        }
      }
    }

    // Sort by timestamp (oldest first for LRU eviction)
    return keys.sort((a, b) => a.timestamp - b.timestamp).map(k => k.key)
  }

  /**
   * Calculate total cache size in bytes
   */
  private getCacheSize(): number {
    let totalSize = 0
    const storages = [sessionStorage, localStorage]

    for (const storage of storages) {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)
        if (key?.startsWith('prompd:pkg:')) {
          try {
            const data = storage.getItem(key)
            if (data) {
              const parsed = JSON.parse(data) as CachedPackage
              totalSize += parsed.size
            }
          } catch {
            // Invalid cache entry, skip
          }
        }
      }
    }

    return totalSize
  }

  /**
   * Evict oldest packages until size/count limits are met
   */
  private evictIfNeeded(newPackageSize: number): void {
    const keys = this.getCachedKeys()

    // Check count limit
    while (keys.length >= this.MAX_PACKAGES) {
      const oldestKey = keys.shift()
      if (oldestKey) {
        sessionStorage.removeItem(oldestKey)
        localStorage.removeItem(oldestKey)
      }
    }

    // Check size limit
    let currentSize = this.getCacheSize()
    while (currentSize + newPackageSize > this.MAX_SIZE_BYTES && keys.length > 0) {
      const oldestKey = keys.shift()
      if (oldestKey) {
        sessionStorage.removeItem(oldestKey)
        localStorage.removeItem(oldestKey)
        currentSize = this.getCacheSize()
      }
    }
  }

  /**
   * Get storage to use based on mode
   */
  private getStorage(): Storage {
    if (this.storageMode === 'session') return sessionStorage
    if (this.storageMode === 'local') return localStorage

    // Auto mode: prefer sessionStorage, fallback to localStorage
    try {
      sessionStorage.setItem('test', 'test')
      sessionStorage.removeItem('test')
      return sessionStorage
    } catch {
      return localStorage
    }
  }

  /**
   * Get cached package blob
   * @param name Package name (e.g., "@prompd.io/core")
   * @param version Package version (e.g., "1.0.0")
   * @returns Blob if cached, null otherwise
   */
  async getPackage(name: string, version: string): Promise<Blob | null> {
    const key = this.getCacheKey(name, version)

    // Try sessionStorage first, then localStorage
    const storages = [sessionStorage, localStorage]

    for (const storage of storages) {
      try {
        const data = storage.getItem(key)
        if (data) {
          const cached = JSON.parse(data) as CachedPackage

          // Update timestamp (LRU)
          cached.timestamp = Date.now()
          storage.setItem(key, JSON.stringify(cached))

          // Decode base64 to blob
          const binaryString = atob(cached.blob)
          const bytes = new Uint8Array(binaryString.length)
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i)
          }

          return new Blob([bytes], { type: 'application/zip' })
        }
      } catch (error) {
        console.error(`Failed to retrieve package from cache: ${error}`)
      }
    }

    return null
  }

  /**
   * Download package from registry
   * @param registryUrl Registry base URL
   * @param name Package name
   * @param version Package version
   * @returns Package blob
   * @throws Error if download fails or package is too large
   */
  async downloadPackage(
    registryUrl: string,
    name: string,
    version: string
  ): Promise<Blob> {
    // Construct download URL (registry format: /packages/:name/download/:version or /packages/:name/download)
    const encodedName = encodeURIComponent(name)
    const url = version === 'latest'
      ? `${registryUrl}/packages/${encodedName}/download`
      : `${registryUrl}/packages/${encodedName}/download/${version}`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/zip'
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to download package: ${response.status} ${response.statusText}`)
    }

    // Check content length before downloading
    const contentLength = response.headers.get('Content-Length')
    if (contentLength) {
      const sizeMB = parseInt(contentLength, 10) / (1024 * 1024)
      if (sizeMB > this.MAX_SIZE_MB) {
        throw new Error(`Package too large: ${sizeMB.toFixed(2)}MB exceeds ${this.MAX_SIZE_MB}MB limit`)
      }
    }

    const blob = await response.blob()

    // Validate size
    if (blob.size > this.MAX_SIZE_BYTES) {
      throw new Error(`Package too large: ${(blob.size / (1024 * 1024)).toFixed(2)}MB exceeds ${this.MAX_SIZE_MB}MB limit`)
    }

    return blob
  }

  /**
   * Cache package blob in browser storage
   * @param name Package name
   * @param version Package version
   * @param blob Package blob
   * @param sha256 Optional SHA256 hash for validation
   */
  async cachePackage(
    name: string,
    version: string,
    blob: Blob,
    sha256?: string
  ): Promise<void> {
    const key = this.getCacheKey(name, version)

    // Evict old packages if needed
    this.evictIfNeeded(blob.size)

    // Convert blob to base64
    const arrayBuffer = await blob.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    let binaryString = ''
    for (let i = 0; i < bytes.length; i++) {
      binaryString += String.fromCharCode(bytes[i])
    }
    const base64 = btoa(binaryString)

    const cached: CachedPackage = {
      name,
      version,
      blob: base64,
      timestamp: Date.now(),
      size: blob.size,
      sha256
    }

    const storage = this.getStorage()

    try {
      storage.setItem(key, JSON.stringify(cached))
    } catch (error) {
      // Storage quota exceeded - try evicting more packages
      this.evictIfNeeded(blob.size)

      try {
        storage.setItem(key, JSON.stringify(cached))
      } catch {
        throw new Error('Failed to cache package: storage quota exceeded')
      }
    }
  }

  /**
   * Extract a single file from package blob
   * @param blob Package blob
   * @param filePath File path within package (e.g., "prompts/scan.prmd")
   * @returns File content as string
   * @throws Error if file not found or path is invalid
   */
  async extractFile(blob: Blob, filePath: string): Promise<string> {
    // Security: Prevent zip slip attacks
    const normalizedPath = filePath.replace(/\\/g, '/').replace(/^\/+/, '')

    if (
      normalizedPath.includes('../') ||
      normalizedPath.includes('..\\') ||
      normalizedPath.startsWith('/') ||
      normalizedPath.includes(':')
    ) {
      throw new Error(`Invalid file path: ${filePath}`)
    }

    const zip = await JSZip.loadAsync(blob)
    const file = zip.file(normalizedPath)

    if (!file) {
      throw new Error(`File not found in package: ${filePath}`)
    }

    return await file.async('string')
  }

  /**
   * List all .prmd prompt files in package
   * @param blob Package blob
   * @returns Array of prompt metadata
   */
  async listPrompts(blob: Blob): Promise<Prompt[]> {
    const zip = await JSZip.loadAsync(blob)
    const prompts: Prompt[] = []

    // Iterate through all files
    zip.forEach((relativePath, file) => {
      // Security: Skip files outside package structure
      if (
        relativePath.includes('../') ||
        relativePath.includes('..\\') ||
        relativePath.startsWith('/')
      ) {
        return
      }

      // Only include .prmd files
      if (!file.dir && relativePath.endsWith('.prmd')) {
        const pathParts = relativePath.split('/')
        const name = pathParts[pathParts.length - 1]

        prompts.push({
          name,
          path: relativePath
        })
      }
    })

    // Sort by path for consistent ordering
    prompts.sort((a, b) => a.path.localeCompare(b.path))

    return prompts
  }

  /**
   * List all files in package (not just .prmd files)
   * @param blob Package blob
   * @returns Array of all files and directories
   */
  async listAllFiles(blob: Blob): Promise<PackageFile[]> {
    const zip = await JSZip.loadAsync(blob)
    const files: PackageFile[] = []

    // Iterate through all files
    zip.forEach((relativePath, file) => {
      // Security: Skip files outside package structure
      if (
        relativePath.includes('../') ||
        relativePath.includes('..\\') ||
        relativePath.startsWith('/')
      ) {
        return
      }

      const pathParts = relativePath.split('/')
      const name = file.dir ? pathParts[pathParts.length - 2] : pathParts[pathParts.length - 1]

      files.push({
        name,
        path: relativePath,
        type: file.dir ? 'directory' : 'file'
      })
    })

    // Sort by path for consistent ordering
    files.sort((a, b) => a.path.localeCompare(b.path))

    return files
  }

  /**
   * Extract manifest.json from package
   * @param blob Package blob
   * @returns Parsed manifest object
   */
  async extractManifest(blob: Blob): Promise<Record<string, unknown>> {
    const manifestContent = await this.extractFile(blob, 'manifest.json')
    return JSON.parse(manifestContent)
  }

  /**
   * Clear all cached packages
   */
  clear(): void {
    const keys = this.getCachedKeys()
    for (const key of keys) {
      sessionStorage.removeItem(key)
      localStorage.removeItem(key)
    }
  }

  /**
   * Remove specific package from cache
   * @param name Package name
   * @param version Package version
   */
  remove(name: string, version: string): void {
    const key = this.getCacheKey(name, version)
    sessionStorage.removeItem(key)
    localStorage.removeItem(key)
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    count: number
    sizeMB: number
    packages: Array<{ name: string; version: string; sizeMB: number }>
  } {
    const keys = this.getCachedKeys()
    const packages: Array<{ name: string; version: string; sizeMB: number }> = []
    let totalSize = 0

    const storages = [sessionStorage, localStorage]

    for (const storage of storages) {
      for (const key of keys) {
        try {
          const data = storage.getItem(key)
          if (data) {
            const cached = JSON.parse(data) as CachedPackage
            packages.push({
              name: cached.name,
              version: cached.version,
              sizeMB: cached.size / (1024 * 1024)
            })
            totalSize += cached.size
          }
        } catch {
          // Invalid cache entry
        }
      }
    }

    return {
      count: packages.length,
      sizeMB: totalSize / (1024 * 1024),
      packages
    }
  }
}

/**
 * Global singleton instance
 */
export const packageCache = new PackageCache()

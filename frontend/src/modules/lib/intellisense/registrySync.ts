/**
 * Registry Package Sync System
 *
 * Maintains a local cache of package metadata from the registry with background sync.
 * Provides deprecation warnings and package status information for IntelliSense.
 */

import { registryApi } from '../../services/registryApi'

export interface PackageStatus {
  namespace: string
  name: string
  version: string
  deprecated?: boolean
  deprecationMessage?: string
  replacedBy?: string
  lastModified: string
  tags?: string[]
  warning?: string
}

export interface RegistrySyncOptions {
  syncInterval?: number  // Sync interval in milliseconds (default: 15 minutes)
  autoStart?: boolean    // Auto-start background sync (default: true)
  retryDelay?: number    // Retry delay on failure (default: 5 minutes)
}

/**
 * Registry sync service - maintains package metadata cache with background updates
 */
export class RegistrySync {
  private packageCache = new Map<string, PackageStatus>()
  private syncInterval: NodeJS.Timeout | null = null
  private lastSyncTime: number = 0
  private isSyncing: boolean = false
  private options: Required<RegistrySyncOptions>
  private syncPromise: Promise<void> | null = null

  constructor(options: RegistrySyncOptions = {}) {
    this.options = {
      syncInterval: options.syncInterval ?? 15 * 60 * 1000, // 15 minutes default
      autoStart: options.autoStart ?? true,
      retryDelay: options.retryDelay ?? 5 * 60 * 1000, // 5 minutes default
    }

    if (this.options.autoStart) {
      this.start()
    }
  }

  /**
   * Start background sync
   */
  start(): void {
    if (this.syncInterval) {
      return // Already running
    }

    // Initial sync
    void this.syncPackages()

    // Start periodic sync
    this.syncInterval = setInterval(() => {
      void this.syncPackages()
    }, this.options.syncInterval)
  }

  /**
   * Stop background sync
   */
  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }
  }

  /**
   * Sync packages from registry
   */
  async syncPackages(): Promise<void> {
    if (this.isSyncing) {
      // Return existing sync promise if sync is in progress
      return this.syncPromise ?? Promise.resolve()
    }

    this.isSyncing = true
    this.syncPromise = this._doSync()

    try {
      await this.syncPromise
    } finally {
      this.isSyncing = false
      this.syncPromise = null
    }
  }

  private async _doSync(): Promise<void> {
    try {
      // Fetch package list from registry
      const packages = await this._fetchPackageStatuses()

      // Update cache
      this.packageCache.clear()
      for (const pkg of packages) {
        const key = `${pkg.namespace}/${pkg.name}`
        this.packageCache.set(key, pkg)
      }

      this.lastSyncTime = Date.now()

      // Notify listeners
      window.dispatchEvent(new CustomEvent('registry-sync-complete', {
        detail: {
          packageCount: packages.length,
          timestamp: this.lastSyncTime
        }
      }))

      console.log(`[RegistrySync] Synced ${packages.length} packages from registry`)
    } catch (error) {
      console.error('[RegistrySync] Sync failed:', error)

      // Notify listeners of failure
      window.dispatchEvent(new CustomEvent('registry-sync-error', {
        detail: { error }
      }))

      // Schedule retry with backoff
      if (this.syncInterval) {
        clearInterval(this.syncInterval)
        this.syncInterval = setTimeout(() => {
          this.syncInterval = setInterval(() => {
            void this.syncPackages()
          }, this.options.syncInterval)
          void this.syncPackages()
        }, this.options.retryDelay)
      }
    }
  }

  /**
   * Fetch package statuses from registry
   */
  private async _fetchPackageStatuses(): Promise<PackageStatus[]> {
    try {
      // Use registryApi to search packages (limit to 100 to avoid 400 error)
      const searchResults = await registryApi.searchPackages('', 100)

      // Map registry packages to PackageStatus format
      return searchResults.packages.map(pkg => ({
        namespace: pkg.namespace?.name || pkg.scope || '@unknown',
        name: pkg.name,
        version: pkg.version || 'latest',
        deprecated: false, // TODO: Add to registry API response when available
        deprecationMessage: undefined,
        replacedBy: undefined,
        lastModified: pkg.updatedAt || new Date().toISOString(),
        tags: pkg.keywords || [],
        warning: undefined
      }))
    } catch (error) {
      // Fail silently - registry may be offline during development
      console.log('[RegistrySync] Package sync unavailable:', error instanceof Error ? error.message : 'Unknown error')
      return []
    }
  }

  /**
   * Get package status from cache
   */
  getPackageStatus(namespace: string, name: string): PackageStatus | undefined {
    return this.packageCache.get(`${namespace}/${name}`)
  }

  /**
   * Check if a package is deprecated
   */
  isDeprecated(namespace: string, name: string): boolean {
    const status = this.getPackageStatus(namespace, name)
    return status?.deprecated ?? false
  }

  /**
   * Get deprecation message for a package
   */
  getDeprecationMessage(namespace: string, name: string): string | undefined {
    const status = this.getPackageStatus(namespace, name)
    if (!status?.deprecated) {
      return undefined
    }

    let message = status.deprecationMessage || `Package ${namespace}/${name} is deprecated`

    if (status.replacedBy) {
      message += `. Use ${status.replacedBy} instead`
    }

    return message
  }

  /**
   * Get all cached package statuses
   */
  getAllPackages(): PackageStatus[] {
    return Array.from(this.packageCache.values())
  }

  /**
   * Get last sync timestamp
   */
  getLastSyncTime(): number {
    return this.lastSyncTime
  }

  /**
   * Check if sync is in progress
   */
  isSyncInProgress(): boolean {
    return this.isSyncing
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return this.packageCache.size
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.packageCache.clear()
    this.lastSyncTime = 0
  }

  /**
   * Force immediate sync (bypasses debouncing)
   */
  async forceSyncNow(): Promise<void> {
    // Stop existing interval
    this.stop()

    // Do immediate sync
    await this.syncPackages()

    // Restart interval
    this.start()
  }
}

// Singleton instance
let registrySyncInstance: RegistrySync | null = null

/**
 * Get or create the global registry sync instance
 */
export function getRegistrySync(options?: RegistrySyncOptions): RegistrySync {
  if (!registrySyncInstance) {
    registrySyncInstance = new RegistrySync(options)
  }
  return registrySyncInstance
}

/**
 * Initialize registry sync (call this on app startup)
 */
export function initializeRegistrySync(options?: RegistrySyncOptions): RegistrySync {
  if (registrySyncInstance) {
    registrySyncInstance.stop()
  }
  registrySyncInstance = new RegistrySync(options)
  return registrySyncInstance
}

/**
 * Stop and cleanup registry sync
 */
export function cleanupRegistrySync(): void {
  if (registrySyncInstance) {
    registrySyncInstance.stop()
    registrySyncInstance.clearCache()
    registrySyncInstance = null
  }
}

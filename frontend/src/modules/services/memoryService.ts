/**
 * Memory Service Abstraction Layer
 *
 * Provides unified interface for memory operations across different storage backends:
 * - SQLite (service mode) - Persistent storage via HTTP API to background service
 * - SQLite (tray mode) - Persistent storage via Electron IPC (while app running)
 * - IndexedDB (fallback) - Browser-based persistent storage when neither service nor tray available
 *
 * Memory Scopes:
 * - execution: In-memory only (fast, temporary) - handled separately
 * - workflow: Persists across executions of the same workflow
 * - global: Shared across all workflows
 */

/**
 * Backend interface that all storage implementations must follow
 */
export interface MemoryBackend {
  get(scope: string, namespace: string, key: string): Promise<unknown>
  set(scope: string, namespace: string, key: string, value: unknown, ttl?: number): Promise<void>
  delete(scope: string, namespace: string, key: string): Promise<void>
  list(scope: string, namespace: string): Promise<string[]>
  clear(scope: string, namespace: string): Promise<void>
}

/**
 * SQLite backend for service mode (HTTP API) and tray mode (Electron IPC)
 */
class SQLiteBackend implements MemoryBackend {
  private mode: 'service' | 'tray'

  constructor(mode: 'service' | 'tray') {
    this.mode = mode
  }

  async get(scope: string, namespace: string, key: string): Promise<unknown> {
    if (this.mode === 'service') {
      // HTTP API call to background service
      const response = await fetch(`http://localhost:9876/api/memory/${scope}/${namespace}/${key}`)
      if (!response.ok) {
        if (response.status === 404) return null
        throw new Error(`Failed to get memory value: ${response.statusText}`)
      }
      const data = await response.json()
      return data.value
    } else {
      // Electron IPC call
      if (!window.electronAPI?.memory) {
        throw new Error('Electron memory API not available')
      }
      return await window.electronAPI.memory.get(scope, namespace, key)
    }
  }

  async set(scope: string, namespace: string, key: string, value: unknown, ttl?: number): Promise<void> {
    if (this.mode === 'service') {
      // HTTP API call to background service
      const response = await fetch(`http://localhost:9876/api/memory/${scope}/${namespace}/${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value, ttl })
      })
      if (!response.ok) {
        throw new Error(`Failed to set memory value: ${response.statusText}`)
      }
    } else {
      // Electron IPC call
      if (!window.electronAPI?.memory) {
        throw new Error('Electron memory API not available')
      }
      await window.electronAPI.memory.set(scope, namespace, key, value, ttl)
    }
  }

  async delete(scope: string, namespace: string, key: string): Promise<void> {
    if (this.mode === 'service') {
      // HTTP API call to background service
      const response = await fetch(`http://localhost:9876/api/memory/${scope}/${namespace}/${key}`, {
        method: 'DELETE'
      })
      if (!response.ok && response.status !== 404) {
        throw new Error(`Failed to delete memory value: ${response.statusText}`)
      }
    } else {
      // Electron IPC call
      if (!window.electronAPI?.memory) {
        throw new Error('Electron memory API not available')
      }
      await window.electronAPI.memory.delete(scope, namespace, key)
    }
  }

  async list(scope: string, namespace: string): Promise<string[]> {
    if (this.mode === 'service') {
      // HTTP API call to background service
      const response = await fetch(`http://localhost:9876/api/memory/${scope}/${namespace}`)
      if (!response.ok) {
        throw new Error(`Failed to list memory keys: ${response.statusText}`)
      }
      const data = await response.json()
      return data.keys || []
    } else {
      // Electron IPC call
      if (!window.electronAPI?.memory) {
        throw new Error('Electron memory API not available')
      }
      // Note: Electron IPC doesn't have a list method yet, will need to be added
      throw new Error('List operation not yet implemented for tray mode')
    }
  }

  async clear(scope: string, namespace: string): Promise<void> {
    if (this.mode === 'service') {
      // HTTP API call to background service
      const response = await fetch(`http://localhost:9876/api/memory/${scope}/${namespace}`, {
        method: 'DELETE'
      })
      if (!response.ok) {
        throw new Error(`Failed to clear memory namespace: ${response.statusText}`)
      }
    } else {
      // Electron IPC call - clear by deleting all keys
      const keys = await this.list(scope, namespace)
      for (const key of keys) {
        await this.delete(scope, namespace, key)
      }
    }
  }
}

/**
 * IndexedDB backend for browser fallback
 */
class IndexedDBBackend implements MemoryBackend {
  private dbName = 'prompd-memory'
  private version = 1

  private async openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Create object stores for each scope
        if (!db.objectStoreNames.contains('workflow')) {
          db.createObjectStore('workflow', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('global')) {
          db.createObjectStore('global', { keyPath: 'id' })
        }
      }
    })
  }

  private getStoreKey(namespace: string, key: string): string {
    return `${namespace}:${key}`
  }

  async get(scope: string, namespace: string, key: string): Promise<unknown> {
    const db = await this.openDB()
    const storeKey = this.getStoreKey(namespace, key)

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(scope, 'readonly')
      const store = transaction.objectStore(scope)
      const request = store.get(storeKey)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const result = request.result
        if (!result) {
          resolve(null)
          return
        }

        // Check TTL expiration
        if (result.expiresAt && Date.now() > result.expiresAt) {
          // Expired, delete and return null
          this.delete(scope, namespace, key).catch(() => {})
          resolve(null)
          return
        }

        resolve(result.value)
      }
    })
  }

  async set(scope: string, namespace: string, key: string, value: unknown, ttl?: number): Promise<void> {
    const db = await this.openDB()
    const storeKey = this.getStoreKey(namespace, key)

    const record = {
      id: storeKey,
      namespace,
      key,
      value,
      expiresAt: ttl ? Date.now() + (ttl * 1000) : null,
      updatedAt: Date.now()
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(scope, 'readwrite')
      const store = transaction.objectStore(scope)
      const request = store.put(record)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async delete(scope: string, namespace: string, key: string): Promise<void> {
    const db = await this.openDB()
    const storeKey = this.getStoreKey(namespace, key)

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(scope, 'readwrite')
      const store = transaction.objectStore(scope)
      const request = store.delete(storeKey)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  async list(scope: string, namespace: string): Promise<string[]> {
    const db = await this.openDB()

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(scope, 'readonly')
      const store = transaction.objectStore(scope)
      const request = store.getAllKeys()

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const allKeys = request.result as string[]
        const prefix = `${namespace}:`
        const keys = allKeys
          .filter(k => k.startsWith(prefix))
          .map(k => k.substring(prefix.length))
        resolve(keys)
      }
    })
  }

  async clear(scope: string, namespace: string): Promise<void> {
    const keys = await this.list(scope, namespace)
    for (const key of keys) {
      await this.delete(scope, namespace, key)
    }
  }
}

/**
 * Memory service router - auto-detects available backend and routes requests
 */
class MemoryServiceRouter {
  private backend: MemoryBackend | null = null
  private backendType: 'service' | 'tray' | 'indexeddb' | 'none' = 'none'
  private initPromise: Promise<void> | null = null

  constructor() {
    // Initialize asynchronously
    this.initPromise = this.detectBackend()
  }

  private async isServiceAvailable(): Promise<boolean> {
    try {
      const response = await fetch('http://localhost:9876/health', {
        method: 'GET',
        signal: AbortSignal.timeout(3000) // 3 second timeout
      })
      return response.ok
    } catch {
      return false
    }
  }

  private async detectBackend(): Promise<void> {
    // 1. Check if service is running (http://localhost:9876/health)
    if (await this.isServiceAvailable()) {
      this.backend = new SQLiteBackend('service')
      this.backendType = 'service'
      console.log('[MemoryService] Using SQLite backend via service mode (HTTP API)')
      return
    }

    // 2. Check if Electron tray mode with IPC
    if (window.electronAPI?.memory) {
      this.backend = new SQLiteBackend('tray')
      this.backendType = 'tray'
      console.log('[MemoryService] Using SQLite backend via tray mode (Electron IPC)')
      return
    }

    // 3. Fallback to IndexedDB
    this.backend = new IndexedDBBackend()
    this.backendType = 'indexeddb'
    console.log('[MemoryService] Using IndexedDB fallback backend')
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise
      this.initPromise = null
    }
  }

  async get(scope: string, namespace: string, key: string): Promise<unknown> {
    await this.ensureInitialized()

    if (!this.backend) {
      throw new Error('Memory backend not initialized')
    }

    // Execution scope is handled separately (in-memory only)
    if (scope === 'execution') {
      throw new Error('Execution scope should be handled by workflowExecutor in-memory store')
    }

    return this.backend.get(scope, namespace, key)
  }

  async set(scope: string, namespace: string, key: string, value: unknown, ttl?: number): Promise<void> {
    await this.ensureInitialized()

    if (!this.backend) {
      throw new Error('Memory backend not initialized')
    }

    // Execution scope is handled separately (in-memory only)
    if (scope === 'execution') {
      throw new Error('Execution scope should be handled by workflowExecutor in-memory store')
    }

    return this.backend.set(scope, namespace, key, value, ttl)
  }

  async delete(scope: string, namespace: string, key: string): Promise<void> {
    await this.ensureInitialized()

    if (!this.backend) {
      throw new Error('Memory backend not initialized')
    }

    if (scope === 'execution') {
      throw new Error('Execution scope should be handled by workflowExecutor in-memory store')
    }

    return this.backend.delete(scope, namespace, key)
  }

  async list(scope: string, namespace: string): Promise<string[]> {
    await this.ensureInitialized()

    if (!this.backend) {
      throw new Error('Memory backend not initialized')
    }

    if (scope === 'execution') {
      throw new Error('Execution scope should be handled by workflowExecutor in-memory store')
    }

    return this.backend.list(scope, namespace)
  }

  async clear(scope: string, namespace: string): Promise<void> {
    await this.ensureInitialized()

    if (!this.backend) {
      throw new Error('Memory backend not initialized')
    }

    if (scope === 'execution') {
      throw new Error('Execution scope should be handled by workflowExecutor in-memory store')
    }

    return this.backend.clear(scope, namespace)
  }

  getBackendType(): 'service' | 'tray' | 'indexeddb' | 'none' {
    return this.backendType
  }
}

// Export singleton instance
export const memoryService = new MemoryServiceRouter()

// Registry API client for IntelliSense and package search
import { prompdSettings } from './prompdSettings'
import { registryDiscovery } from './registryDiscovery'
import { configService } from './configService'

export interface RegistryPackage {
  id?: string
  name: string
  version: string
  description: string
  author?: string
  license?: string
  keywords?: string[]
  main?: string
  exports?: Record<string, string>
  parameters?: Parameter[]
  downloads?: number
  stars?: number
  repository?: {
    type: string
    url: string
  }
  homepage?: string
  examples?: string[]
  files?: string[]
  fileCount?: number
  readme?: string
  publishedAt?: string
  updatedAt?: string
  owner?: {
    handle: string
  }
  namespace?: {
    id: string
    name: string
    type: string
    verified: boolean
  }
  scope?: string
  type?: string
}

export interface RegistryError {
  code: 'NETWORK_ERROR' | 'AUTH_ERROR' | 'SERVER_ERROR' | 'NOT_FOUND' | 'RATE_LIMITED' | 'TIMEOUT'
  message: string
  originalError?: Error
  retryAfter?: number
}

interface CacheEntry {
  data: any
  timestamp: number
  etag?: string
  expires?: number
}

interface PendingRequest {
  promise: Promise<any>
  resolve: (value: any) => void
  reject: (error: RegistryError) => void
}

export interface Parameter {
  name: string
  type: string
  required?: boolean
  description?: string
  default?: any
  enum?: string[]
}

export interface SearchResult {
  total: number
  packages: RegistryPackage[]
}

class RegistryApiClient {
  private baseUrl: string
  private cache = new Map<string, CacheEntry>()
  private pendingRequests = new Map<string, PendingRequest>()
  private readonly CACHE_TTL = 5 * 60 * 1000 // 5 minutes
  private readonly CACHE_REFRESH_THRESHOLD = 2 * 60 * 1000 // 2 minutes - refresh in background when cache is this old
  private readonly MAX_RETRIES = 3
  private readonly RETRY_DELAYS = [1000, 2000, 4000] // Exponential backoff
  private readonly REQUEST_TIMEOUT = 10000 // 10 seconds
  private getAuthToken?: () => Promise<string | null>
  private isOnline = navigator.onLine
  private errorCallbacks = new Set<(error: RegistryError) => void>()
  private baseUrlInitialized = false

  constructor() {
    // Start with prompdSettings URL, will update from configService
    this.baseUrl = prompdSettings.getRegistryUrl()
    console.log('[RegistryAPI] Initialized with registry URL:', this.baseUrl)

    // Initialize from configService (async)
    this.initializeFromConfig()

    // Subscribe to registry URL changes from prompdSettings (legacy support)
    prompdSettings.onRegistryUrlChange((newUrl) => {
      this.baseUrl = newUrl
      this.clearCache()
      registryDiscovery.clearCache() // Also clear discovery cache
      console.log('[RegistryAPI] Registry URL changed to:', newUrl)
    })

    // Monitor network status
    this.setupNetworkMonitoring()

    // Load cached data from localStorage on initialization
    this.loadCacheFromStorage()

    // Periodically clean up expired cache entries
    this.setupCacheCleanup()
  }

  private async initializeFromConfig(): Promise<void> {
    try {
      // Try to get registry URL from config (Electron IPC)
      const configUrl = await configService.getRegistryUrl()
      if (configUrl && configUrl !== this.baseUrl) {
        this.baseUrl = configUrl
        console.log('[RegistryAPI] Updated URL from config:', configUrl)
      }
      this.baseUrlInitialized = true
    } catch (error) {
      console.warn('[RegistryAPI] Failed to get URL from config:', error)
      this.baseUrlInitialized = true
    }
  }

  // Ensure we have the latest base URL
  private async ensureBaseUrl(): Promise<string> {
    if (!this.baseUrlInitialized) {
      await this.initializeFromConfig()
    }
    return this.baseUrl
  }

  // Set the auth token getter (called from Clerk wrapper)
  setAuthTokenGetter(tokenGetter: () => Promise<string | null>): void {
    this.getAuthToken = tokenGetter
  }

  private setupNetworkMonitoring() {
    window.addEventListener('online', () => {
      this.isOnline = true
      console.log('Registry: Network connection restored')
    })
    
    window.addEventListener('offline', () => {
      this.isOnline = false
      console.warn('Registry: Network connection lost, using cached data')
    })
  }

  private loadCacheFromStorage() {
    try {
      const storedCache = localStorage.getItem('prompd.registry.cache')
      if (storedCache) {
        const cacheData = JSON.parse(storedCache)
        Object.entries(cacheData).forEach(([key, entry]: [string, any]) => {
          // Only load non-expired entries
          if (entry.timestamp && Date.now() - entry.timestamp < this.CACHE_TTL) {
            this.cache.set(key, entry)
          }
        })
        console.log(`Registry: Loaded ${this.cache.size} cached entries from storage`)
      }
    } catch (error) {
      console.warn('Registry: Failed to load cache from storage:', error)
    }
  }

  private saveCacheToStorage() {
    try {
      const cacheData: Record<string, CacheEntry> = {}
      this.cache.forEach((entry, key) => {
        // Only save non-expired entries
        if (Date.now() - entry.timestamp < this.CACHE_TTL) {
          cacheData[key] = entry
        }
      })
      localStorage.setItem('prompd.registry.cache', JSON.stringify(cacheData))
    } catch (error) {
      console.warn('Registry: Failed to save cache to storage:', error)
    }
  }

  private setupCacheCleanup() {
    // Clean up expired cache entries every 5 minutes
    setInterval(() => {
      const now = Date.now()
      let removedCount = 0
      
      this.cache.forEach((entry, key) => {
        if (now - entry.timestamp > this.CACHE_TTL) {
          this.cache.delete(key)
          removedCount++
        }
      })
      
      if (removedCount > 0) {
        console.log(`Registry: Cleaned up ${removedCount} expired cache entries`)
        this.saveCacheToStorage()
      }
    }, 5 * 60 * 1000)
  }

  // Add error callback for external error handling
  onError(callback: (error: RegistryError) => void): () => void {
    this.errorCallbacks.add(callback)
    return () => this.errorCallbacks.delete(callback)
  }

  private notifyError(error: RegistryError) {
    this.errorCallbacks.forEach(callback => {
      try {
        callback(error)
      } catch (e) {
        console.error('Registry: Error in error callback:', e)
      }
    })
  }

  private getCacheKey(endpoint: string, params?: Record<string, string>): string {
    const paramStr = params ? '?' + new URLSearchParams(params).toString() : ''
    return `${endpoint}${paramStr}`
  }

  private async fetchWithCache<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const cacheKey = this.getCacheKey(endpoint, params)
    
    // Check for pending request to avoid duplicate calls
    const pendingRequest = this.pendingRequests.get(cacheKey)
    if (pendingRequest) {
      return pendingRequest.promise
    }

    const cached = this.cache.get(cacheKey)
    const now = Date.now()
    
    // Return cached data if still valid
    if (cached && now - cached.timestamp < this.CACHE_TTL) {
      // If cache is getting old but still valid, refresh in background
      if (now - cached.timestamp > this.CACHE_REFRESH_THRESHOLD && this.isOnline) {
        this.refreshInBackground(endpoint, params, cacheKey)
      }
      return cached.data
    }

    // If offline, return stale cache if available
    if (!this.isOnline && cached) {
      console.warn('Registry: Offline, returning stale cache for:', endpoint)
      return cached.data
    }

    // Create promise for this request
    let resolve: (value: T) => void
    let reject: (error: RegistryError) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })

    this.pendingRequests.set(cacheKey, { promise, resolve: resolve!, reject: reject! })

    try {
      const data = await this.fetchWithRetry<T>(endpoint, params, cached?.etag)
      
      // Cache the successful result
      const newCacheEntry: CacheEntry = {
        data,
        timestamp: now,
        expires: now + this.CACHE_TTL
      }
      this.cache.set(cacheKey, newCacheEntry)
      this.saveCacheToStorage()
      
      resolve!(data)
      return data
    } catch (error) {
      const registryError = this.createRegistryError(error)
      this.notifyError(registryError)
      
      // Try to return cached data as fallback
      if (cached) {
        console.warn('Registry: Using stale cache due to error:', registryError.message)
        resolve!(cached.data)
        return cached.data
      }
      
      reject!(registryError)
      throw registryError
    } finally {
      this.pendingRequests.delete(cacheKey)
    }
  }

  private async fetchWithRetry<T>(endpoint: string, params?: Record<string, string>, etag?: string): Promise<T> {
    let lastError: Error | null = null
    
    for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const result = await this.performRequest<T>(endpoint, params, etag)
        return result
      } catch (error) {
        lastError = error as Error
        
        // Don't retry certain errors
        if (error instanceof Error) {
          if (error.message.includes('404') || error.message.includes('401') || error.message.includes('403')) {
            throw error
          }
        }
        
        // Don't retry if it's the last attempt
        if (attempt === this.MAX_RETRIES) {
          throw error
        }
        
        // Wait before retrying
        const delay = this.RETRY_DELAYS[attempt] || this.RETRY_DELAYS[this.RETRY_DELAYS.length - 1]
        console.warn(`Registry: Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error)
        await this.delay(delay)
      }
    }
    
    throw lastError
  }

  private async performRequest<T>(endpoint: string, params?: Record<string, string>, etag?: string): Promise<T> {
    const baseUrl = await this.ensureBaseUrl()
    const url = new URL(endpoint, baseUrl)
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value)
      })
    }

    // Get auth token if available
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    if (etag) {
      headers['If-None-Match'] = etag
    }

    if (this.getAuthToken) {
      try {
        const token = await this.getAuthToken()
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }
      } catch (error) {
        console.warn('Failed to get auth token:', error)
      }
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT)

    try {
      const response = await fetch(url.toString(), { 
        headers,
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      if (response.status === 304) {
        // Not modified, return null to indicate cache should be used
        return null as any
      }
      
      if (!response.ok) {
        throw new Error(`Registry API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      return data
    } catch (error) {
      clearTimeout(timeoutId)
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Registry request timeout')
      }
      
      throw error
    }
  }

  private async refreshInBackground(endpoint: string, params?: Record<string, string>, cacheKey?: string) {
    try {
      const data = await this.fetchWithRetry(endpoint, params)
      if (data && cacheKey) {
        const newCacheEntry: CacheEntry = {
          data,
          timestamp: Date.now(),
          expires: Date.now() + this.CACHE_TTL
        }
        this.cache.set(cacheKey, newCacheEntry)
        this.saveCacheToStorage()
        console.log('Registry: Background refresh completed for:', endpoint)
      }
    } catch (error) {
      console.warn('Registry: Background refresh failed for:', endpoint, error)
    }
  }

  private createRegistryError(error: any): RegistryError {
    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        return {
          code: 'TIMEOUT',
          message: 'Registry request timed out',
          originalError: error
        }
      }
      
      if (error.message.includes('401') || error.message.includes('403')) {
        return {
          code: 'AUTH_ERROR',
          message: 'Registry authentication failed',
          originalError: error
        }
      }
      
      if (error.message.includes('404')) {
        return {
          code: 'NOT_FOUND',
          message: 'Registry resource not found',
          originalError: error
        }
      }
      
      if (error.message.includes('429')) {
        return {
          code: 'RATE_LIMITED',
          message: 'Registry rate limit exceeded',
          originalError: error
        }
      }
      
      if (error.message.includes('5')) {
        return {
          code: 'SERVER_ERROR',
          message: 'Registry server error',
          originalError: error
        }
      }
    }
    
    return {
      code: 'NETWORK_ERROR',
      message: error?.message || 'Unknown registry error',
      originalError: error
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async searchPackages(query: string, limit = 20): Promise<SearchResult> {
    const params: Record<string, string> = {
      limit: limit.toString()
    }

    // Add search query if provided
    if (query.trim()) {
      params.search = query.trim()
    }

    const result = await this.fetchWithCache<any>('/packages', params)

    if (!result) {
      return { total: 0, packages: [] }
    }

    const packages: RegistryPackage[] = (result.packages || []).map((pkg: any) => ({
      name: pkg.name || '',
      version: pkg.version || '1.0.0',
      description: pkg.description || '',
      author: pkg.author,
      keywords: pkg.tags || pkg.keywords || [],
      exports: pkg.exports || {},
      parameters: this.extractParameters(pkg),
      downloads: pkg.downloads,
      stars: pkg.stars
    }))

    return {
      total: result.pagination?.total || packages.length,
      packages
    }
  }

  async getPackageInfo(packageName: string): Promise<RegistryPackage | null> {
    try {
      // Use discovery service to get the correct endpoint URL
      const url = await registryDiscovery.getPackageUrl(packageName)
      // Extract path from full URL for fetchWithCache
      const baseUrl = await this.ensureBaseUrl()
      const path = url.replace(baseUrl, '')

      const result = await this.fetchWithCache<any>(path)

      if (!result) return null

      // Backend returns single package object with full metadata
      return {
        name: result.name,
        version: result.version || '1.0.0',
        description: result.description || '',
        author: result.author,
        keywords: result.tags || result.keywords || [],
        exports: result.exports || {},
        parameters: this.extractParameters(result),
        downloads: result.downloads,
        stars: result.stars,
        files: result.files || [],
        fileCount: result.fileCount,
        repository: result.repository,
        homepage: result.homepage,
        readme: result.readme,
        publishedAt: result.publishedAt,
        updatedAt: result.updatedAt,
        owner: result.owner,
        namespace: result.namespace,
        scope: result.scope,
        type: result.type
      }
    } catch (error) {
      console.error('[RegistryAPI] Error getting package info:', error)
      return null
    }
  }

  async getPackageFiles(packageName: string, version?: string): Promise<string[]> {
    try {
      // Get package info which includes the files array
      const packageInfo = await this.getPackageInfo(packageName)
      if (!packageInfo) return []

      // Return the files list from package metadata
      return packageInfo.files || []
    } catch (error) {
      console.error('[RegistryAPI] Error getting package files:', error)
      return []
    }
  }

  async getPackageVersions(packageName: string, forceRefresh = false): Promise<string[]> {
    // Use discovery service to get the correct endpoint URL
    try {
      const url = await registryDiscovery.getVersionsUrl(packageName)
      // Extract path from full URL for fetchWithCache
      const baseUrl = await this.ensureBaseUrl()
      const path = url.replace(baseUrl, '')

      // Clear cache for this endpoint if force refresh requested
      if (forceRefresh) {
        const cacheKey = this.getCacheKey(path)
        this.cache.delete(cacheKey)
      }

      const result = await this.fetchWithCache<any>(path)

      if (!result || !Array.isArray(result)) return []

      // Extract version strings from version objects
      return result.map((v: any) => v.version || v).sort((a: string, b: string) => {
        // Simple version sort - latest first
        return b.localeCompare(a, undefined, { numeric: true })
      })
    } catch (error) {
      console.error('[RegistryAPI] Error getting package versions:', error)
      return []
    }
  }

  async downloadPackage(packageName: string, version?: string): Promise<Blob | null> {
    try {
      // Use discovery service to get the correct download URL
      const url = await registryDiscovery.getDownloadUrl(packageName, version)

      // Get auth token if available
      const headers: Record<string, string> = {}
      if (this.getAuthToken) {
        try {
          const token = await this.getAuthToken()
          if (token) {
            headers['Authorization'] = `Bearer ${token}`
          }
        } catch (error) {
          console.warn('Failed to get auth token:', error)
        }
      }

      const response = await fetch(url, { headers })

      if (!response.ok) {
        throw new Error(`Failed to download package: ${response.status} ${response.statusText}`)
      }

      return await response.blob()
    } catch (error) {
      console.error('Error downloading package:', error)
      return null
    }
  }

  async getUserPackages(): Promise<RegistryPackage[]> {
    // Requires authentication - will use token from getAuthToken
    // Don't use cache for user-specific data to ensure fresh results
    const result = await this.performRequest<any>('/user/packages')

    console.log('[RegistryAPI] getUserPackages raw result:', result)

    if (!result) return []

    // Registry returns { packages: [...], pagination: {...} }
    const packages = result.packages || result
    console.log('[RegistryAPI] getUserPackages extracted packages:', packages?.length || 0)

    if (!Array.isArray(packages)) return []

    return packages.map((pkg: any) => ({
      id: pkg._id || pkg.id,
      name: pkg.name || '',
      version: pkg.version || '1.0.0',
      description: pkg.description || '',
      author: pkg.author,
      keywords: pkg.tags || pkg.keywords || [],
      exports: pkg.exports || {},
      parameters: this.extractParameters(pkg),
      downloads: pkg.downloads,
      stars: pkg.stars,
      files: pkg.files || [],
      fileCount: pkg.fileCount
    }))
  }

  async getSuggestions(query: string, context: 'package' | 'parameter' | 'export' = 'package'): Promise<string[]> {
    if (context === 'package') {
      const results = await this.searchPackages(query, 10)
      return results.packages.map(p => p.name)
    }

    // For parameter/export context, we'd need additional registry endpoints
    // For now, return basic suggestions based on common patterns
    if (context === 'parameter') {
      const commonParams = ['input', 'prompt', 'context', 'model', 'temperature', 'max_tokens', 'system_prompt']
      return commonParams.filter(p => p.toLowerCase().includes(query.toLowerCase()))
    }

    if (context === 'export') {
      return ['default', 'main', 'prompt', 'template', 'config']
    }

    return []
  }

  private extractParameters(packageData: any): Parameter[] {
    // Extract parameters from package manifest
    const params: Parameter[] = []
    
    if (packageData?.prompd?.parameters) {
      Object.entries(packageData.prompd.parameters).forEach(([name, config]: [string, any]) => {
        params.push({
          name,
          type: config.type || 'string',
          required: config.required || false,
          description: config.description,
          default: config.default,
          enum: config.enum
        })
      })
    }

    return params
  }

  // Clear cache manually if needed
  clearCache(): void {
    this.cache.clear()
    this.saveCacheToStorage()
    registryDiscovery.clearCache() // Also clear discovery cache
  }

  // Get registry discovery info (capabilities, stats, etc.)
  async getRegistryInfo(): Promise<{
    name: string
    version: string
    capabilities: { formats: string[]; features: string[]; authentication: string[] }
    stats: { packages: number; versions: number; lastUpdated: string }
  } | null> {
    try {
      const discovery = await registryDiscovery.discover()
      return {
        name: discovery.name,
        version: discovery.version,
        capabilities: discovery.capabilities,
        stats: discovery.stats
      }
    } catch (error) {
      console.error('[RegistryAPI] Error getting registry info:', error)
      return null
    }
  }

  // Check if registry supports a feature
  async supportsFeature(feature: string): Promise<boolean> {
    return registryDiscovery.hasFeature(feature)
  }
}

// Export singleton instance
export const registryApi = new RegistryApiClient()

// Built-in suggestions for common patterns
export const BUILTIN_SUGGESTIONS = {
  sections: ['System', 'Context', 'User', 'Response', 'Assistant'],
  packagePrefixes: ['@prompd.io/', '@', ''],
  parameterTypes: ['string', 'number', 'boolean', 'object', 'array', 'file'],
  providers: ['openai', 'anthropic', 'azure', 'ollama', 'custom'],
  models: [
    'gpt-4o', 'gpt-4o-mini', 'gpt-4', 'gpt-3.5-turbo',
    'claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307',
    'text-davinci-003', 'text-curie-001'
  ]
}
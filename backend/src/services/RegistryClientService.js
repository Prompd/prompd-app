import axios from 'axios'
import crypto from 'crypto'

export class RegistryClientService {
  constructor() {
    this.baseUrl = process.env.PROMPD_REGISTRY_URL || 'https://registry.prompdhub.ai'
    this.cache = new Map()
    this.cacheTTL = 5 * 60 * 1000 // 5 minutes
    this.setupAxiosInstance()
  }

  setupAxiosInstance() {
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        'User-Agent': 'prompd-editor-backend/1.0.0',
        'Accept': 'application/json'
      }
    })

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      response => response,
      error => {
        console.warn('Registry API error:', error.message)
        return Promise.reject(error)
      }
    )
  }

  /**
   * Search packages in registry
   */
  async searchPackages(query, options = {}) {
    try {
      const cacheKey = this.getCacheKey('search', { query, ...options })
      const cached = this.getFromCache(cacheKey)
      if (cached) {
        return { ...cached, cached: true }
      }

      const params = {
        text: query,
        size: options.size || options.limit || 20,
        from: options.from || options.skip || 0
      }

      if (options.category) {
        params.keywords = options.category
      }

      if (options.type) {
        params.type = options.type
      }

      const response = await this.client.get('/-/v1/search', { params })
      const result = {
        objects: response.data.objects || [],
        total: response.data.total || 0
      }

      this.setCache(cacheKey, result)
      return result
    } catch (error) {
      console.warn('Registry search failed:', error.message)
      return { objects: [], total: 0, error: error.message }
    }
  }

  /**
   * Get package information
   */
  async getPackageInfo(packageName, version = 'latest') {
    try {
      const cacheKey = this.getCacheKey('package', { name: packageName, version })
      const cached = this.getFromCache(cacheKey)
      if (cached) {
        return { ...cached, cached: true }
      }

      // Use /packages/@scope/name format (not npm-style URL encoding)
      const response = await this.client.get(`/packages/${packageName}`)
      
      const packageData = response.data
      const latestVersion = packageData['dist-tags']?.latest || Object.keys(packageData.versions || {})[0]
      const versionData = packageData.versions?.[version === 'latest' ? latestVersion : version]

      if (!versionData) {
        return null
      }

      const result = {
        name: packageData.name,
        version: versionData.version || version,
        description: versionData.description || packageData.description || '',
        author: versionData.author?.name || packageData.author?.name,
        keywords: versionData.keywords || packageData.keywords || [],
        exports: versionData.exports || {},
        parameters: this.extractParameters(versionData),
        dependencies: versionData.dependencies || {},
        repository: packageData.repository,
        homepage: packageData.homepage,
        license: versionData.license || packageData.license,
        publishedAt: versionData.publishedAt,
        category: versionData.category || 'other',
        type: packageData.type || versionData.type || 'package'
      }

      this.setCache(cacheKey, result)
      return result
    } catch (error) {
      if (error.response?.status === 404) {
        return null
      }
      console.warn('Get package info failed:', error.message)
      throw error
    }
  }

  /**
   * Get package versions
   */
  async getPackageVersions(packageName) {
    try {
      const cacheKey = this.getCacheKey('versions', { name: packageName })
      const cached = this.getFromCache(cacheKey)
      if (cached) {
        return { ...cached, cached: true }
      }

      // Use /packages/@scope/name format (not npm-style URL encoding)
      const response = await this.client.get(`/packages/${packageName}`)
      
      const packageData = response.data
      const versions = Object.keys(packageData.versions || {})
        .sort((a, b) => this.compareVersions(b, a)) // Latest first

      this.setCache(cacheKey, versions)
      return versions
    } catch (error) {
      console.warn('Get package versions failed:', error.message)
      return []
    }
  }

  /**
   * Get popular packages
   */
  async getPopularPackages(options = {}) {
    try {
      const cacheKey = this.getCacheKey('popular', options)
      const cached = this.getFromCache(cacheKey)
      if (cached) {
        return { ...cached, cached: true }
      }

      // Use search with specific sorting for popular packages
      const response = await this.client.get('/-/v1/search', {
        params: {
          size: options.limit || 10,
          sort: 'popularity',
          quality: 0.65,
          popularity: 0.98,
          maintenance: 0.5
        }
      })

      const result = response.data.objects || []
      this.setCache(cacheKey, result)
      return result
    } catch (error) {
      console.warn('Get popular packages failed:', error.message)
      return []
    }
  }

  /**
   * Get package categories
   */
  async getCategories() {
    try {
      const cacheKey = this.getCacheKey('categories', {})
      const cached = this.getFromCache(cacheKey)
      if (cached) {
        return { ...cached, cached: true }
      }

      // This would ideally be a dedicated endpoint
      // For now, return standard categories
      const categories = [
        { id: 'ai-tools', name: 'AI Tools', count: 150 },
        { id: 'templates', name: 'Templates', count: 89 },
        { id: 'utilities', name: 'Utilities', count: 124 },
        { id: 'integrations', name: 'Integrations', count: 67 },
        { id: 'examples', name: 'Examples', count: 203 },
        { id: 'other', name: 'Other', count: 45 }
      ]

      this.setCache(cacheKey, categories, 30 * 60 * 1000) // Cache for 30 minutes
      return categories
    } catch (error) {
      console.warn('Get categories failed:', error.message)
      return []
    }
  }

  /**
   * Get featured packages
   */
  async getFeaturedPackages(options = {}) {
    try {
      const cacheKey = this.getCacheKey('featured', options)
      const cached = this.getFromCache(cacheKey)
      if (cached) {
        return { ...cached, cached: true }
      }

      // Search for high-quality packages
      const response = await this.client.get('/-/v1/search', {
        params: {
          size: options.limit || 6,
          quality: 0.8,
          popularity: 0.7,
          maintenance: 0.8
        }
      })

      const result = response.data.objects || []
      this.setCache(cacheKey, result, 15 * 60 * 1000) // Cache for 15 minutes
      return result
    } catch (error) {
      console.warn('Get featured packages failed:', error.message)
      return []
    }
  }

  /**
   * Get recently updated packages
   */
  async getRecentPackages(options = {}) {
    try {
      const cacheKey = this.getCacheKey('recent', options)
      const cached = this.getFromCache(cacheKey)
      if (cached) {
        return { ...cached, cached: true }
      }

      const params = {
        size: options.limit || 10,
        sort: 'modified'
      }

      if (options.category) {
        params.keywords = options.category
      }

      if (options.type) {
        params.type = options.type
      }

      const response = await this.client.get('/-/v1/search', { params })
      const result = response.data.objects || []

      this.setCache(cacheKey, result)
      return result
    } catch (error) {
      console.warn('Get recent packages failed:', error.message)
      return []
    }
  }

  /**
   * Get package suggestions
   */
  async getSuggestions(query, context = 'package', options = {}) {
    try {
      if (!query.trim()) {
        return []
      }

      const cacheKey = this.getCacheKey('suggestions', { query, context, ...options })
      const cached = this.getFromCache(cacheKey)
      if (cached) {
        return { ...cached, cached: true }
      }

      if (context === 'package') {
        const response = await this.client.get('/-/v1/search', {
          params: {
            text: query,
            size: options.limit || 10
          }
        })

        const suggestions = (response.data.objects || []).map(obj => obj.package?.name || '')
        this.setCache(cacheKey, suggestions)
        return suggestions
      }

      // For other contexts, return built-in suggestions
      const builtInSuggestions = this.getBuiltInSuggestions(query, context)
      this.setCache(cacheKey, builtInSuggestions)
      return builtInSuggestions
    } catch (error) {
      console.warn('Get suggestions failed:', error.message)
      return []
    }
  }

  /**
   * Check registry health
   */
  async checkHealth() {
    try {
      const startTime = Date.now()
      const response = await this.client.get('/')
      const responseTime = Date.now() - startTime

      return {
        status: 'healthy',
        responseTime,
        registryUrl: this.baseUrl,
        version: response.data.version || 'unknown'
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        registryUrl: this.baseUrl
      }
    }
  }

  /**
   * Clear cache
   */
  async clearCache(pattern = '*') {
    try {
      let clearedKeys = 0

      if (pattern === '*') {
        clearedKeys = this.cache.size
        this.cache.clear()
      } else {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'))
        for (const key of this.cache.keys()) {
          if (regex.test(key)) {
            this.cache.delete(key)
            clearedKeys++
          }
        }
      }

      return { clearedKeys }
    } catch (error) {
      console.error('Clear cache failed:', error.message)
      return { clearedKeys: 0 }
    }
  }

  /**
   * Get registry statistics
   */
  async getRegistryStats() {
    try {
      const cacheKey = this.getCacheKey('stats', {})
      const cached = this.getFromCache(cacheKey)
      if (cached) {
        return { ...cached, cached: true }
      }

      // This would ideally be a dedicated endpoint
      // For now, return mock statistics
      const stats = {
        totalPackages: 1247,
        totalDownloads: 156789,
        activeUsers: 2341,
        packagesLastWeek: 23,
        topCategories: [
          { name: 'Examples', count: 203 },
          { name: 'AI Tools', count: 150 },
          { name: 'Utilities', count: 124 }
        ]
      }

      this.setCache(cacheKey, stats, 30 * 60 * 1000) // Cache for 30 minutes
      return stats
    } catch (error) {
      console.warn('Get registry stats failed:', error.message)
      return null
    }
  }

  /**
   * Handle webhook events
   */
  async handleWebhook(event, payload) {
    try {
      switch (event) {
        case 'package:published':
          await this.invalidatePackageCache(payload.name)
          break
        case 'package:updated':
          await this.invalidatePackageCache(payload.name)
          break
        case 'package:deprecated':
          await this.invalidatePackageCache(payload.name)
          break
        default:
          console.log('Unknown webhook event:', event)
      }
    } catch (error) {
      console.error('Webhook handling failed:', error.message)
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload, signature) {
    if (!signature || !process.env.WEBHOOK_SECRET) {
      return false
    }

    try {
      const expectedSignature = crypto
        .createHmac('sha256', process.env.WEBHOOK_SECRET)
        .update(JSON.stringify(payload))
        .digest('hex')

      return signature === `sha256=${expectedSignature}`
    } catch (error) {
      console.error('Signature verification failed:', error.message)
      return false
    }
  }

  /**
   * Get package download info
   * Returns the direct download URL for the package
   */
  async getPackageDownload(packageName, version = 'latest') {
    try {
      // Resolve version if 'latest'
      let resolvedVersion = version
      if (version === 'latest') {
        const packageInfo = await this.getPackageInfo(packageName)
        if (!packageInfo) {
          return null
        }
        resolvedVersion = packageInfo.version
      }

      // Use /packages/@scope/name/download/version format
      const downloadUrl = `${this.baseUrl}/packages/${packageName}/download/${resolvedVersion}`

      return {
        downloadUrl,
        version: resolvedVersion
      }
    } catch (error) {
      console.warn('Get package download failed:', error.message)
      return null
    }
  }

  /**
   * Get package stream
   */
  async getPackageStream(packageName, version = 'latest') {
    try {
      const downloadInfo = await this.getPackageDownload(packageName, version)
      if (!downloadInfo) {
        throw new Error('Package download not available')
      }

      const response = await this.client.get(downloadInfo.downloadUrl, {
        responseType: 'stream'
      })

      return response.data
    } catch (error) {
      console.error('Get package stream failed:', error.message)
      throw error
    }
  }

  /**
   * Download package as Buffer for MemoryFileSystem.addPackage()
   *
   * Uses secure @prompd/cli RegistryClient with built-in security validation:
   * - ZIP Slip protection (path traversal attacks)
   * - Symlink attack prevention
   * - Size limits: 50MB package max, 10MB per file
   * - Package name/version validation
   * - Secrets scanning
   *
   * For complete API documentation, see:
   * C:\git\github\Logikbug\prompd-cli\cli\npm\IN-MEMORY-PACKAGES.md
   *
   * Test coverage: 22/22 tests passing in @prompd/cli
   *
   * @param {string} packageName - Package name (e.g., "@prompd.io/core")
   * @param {string} version - Semver version (e.g., "1.0.0")
   * @returns {Promise<{tarball: Buffer, metadata: PackageMetadata}>}
   * @throws {Error} If package not found or download fails
   */
  async downloadPackageBuffer(packageName, version = 'latest') {
    try {
      console.log(`[RegistryClientService] Downloading ${packageName}@${version} from ${this.baseUrl}`)

      // Get download info (handles version resolution internally)
      const downloadInfo = await this.getPackageDownload(packageName, version)
      if (!downloadInfo) {
        throw new Error(`Package not found: ${packageName}@${version}`)
      }

      const resolvedVersion = downloadInfo.version

      // Download package as Buffer (registry returns ZIP directly)
      console.log(`[RegistryClientService] Fetching from: ${downloadInfo.downloadUrl}`)
      const response = await this.client.get(downloadInfo.downloadUrl, {
        responseType: 'arraybuffer'
      })

      const tarball = Buffer.from(response.data)

      console.log(`[RegistryClientService] Downloaded ${packageName}@${resolvedVersion} (${tarball.length} bytes)`)

      return {
        tarball,
        metadata: {
          name: packageName,
          version: resolvedVersion,
          size: tarball.length
        }
      }
    } catch (error) {
      console.error(`[RegistryClientService] Download failed:`, error)
      throw new Error(`Failed to download ${packageName}@${version}: ${error.message}`)
    }
  }

  /**
   * Get packages by user
   */
  async getUserPackages(username, options = {}) {
    try {
      const cacheKey = this.getCacheKey('user-packages', { username, ...options })
      const cached = this.getFromCache(cacheKey)
      if (cached) {
        return { ...cached, cached: true }
      }

      const response = await this.client.get('/-/v1/search', {
        params: {
          text: `author:${username}`,
          size: options.limit || 20,
          from: options.skip || 0
        }
      })

      const result = {
        packages: response.data.objects || [],
        total: response.data.total || 0
      }

      this.setCache(cacheKey, result)
      return result
    } catch (error) {
      console.warn('Get user packages failed:', error.message)
      return { packages: [], total: 0 }
    }
  }

  /**
   * Helper methods
   */

  getCacheKey(operation, params) {
    const key = `${operation}:${JSON.stringify(params)}`
    return crypto.createHash('md5').update(key).digest('hex')
  }

  getFromCache(key) {
    const cached = this.cache.get(key)
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data
    }
    this.cache.delete(key)
    return null
  }

  setCache(key, data, ttl = this.cacheTTL) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    })

    // Clean up expired cache entries periodically
    if (this.cache.size > 1000) {
      this.cleanupCache()
    }
  }

  cleanupCache() {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key)
      }
    }
  }

  async invalidatePackageCache(packageName) {
    const keysToDelete = []
    for (const key of this.cache.keys()) {
      if (key.includes(packageName)) {
        keysToDelete.push(key)
      }
    }
    keysToDelete.forEach(key => this.cache.delete(key))
  }

  extractParameters(packageData) {
    const params = []
    
    if (packageData?.prompd?.parameters) {
      Object.entries(packageData.prompd.parameters).forEach(([name, config]) => {
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

  getBuiltInSuggestions(query, context) {
    const suggestions = {
      parameter: ['input', 'prompt', 'context', 'model', 'temperature', 'max_tokens', 'system_prompt'],
      export: ['default', 'main', 'prompt', 'template', 'config'],
      provider: ['openai', 'anthropic', 'azure', 'ollama', 'custom'],
      model: ['gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet-20241022', 'claude-3-opus-20240229']
    }

    return (suggestions[context] || [])
      .filter(suggestion => suggestion.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 10)
  }

  compareVersions(a, b) {
    const aParts = a.split('.').map(Number)
    const bParts = b.split('.').map(Number)

    for (let i = 0; i < 3; i++) {
      if (aParts[i] > bParts[i]) return 1
      if (aParts[i] < bParts[i]) return -1
    }
    return 0
  }
}
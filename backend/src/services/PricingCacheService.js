/**
 * In-memory cache service for pricing data
 * Provides per-provider configurable TTL and automatic invalidation
 */

// Default TTL: 12 hours in milliseconds
const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000

class PricingCacheService {
  constructor() {
    // Main cache: Map<string, { data: any, expiresAt: Date }>
    this.cache = new Map()

    // Per-provider TTL configuration: Map<string, number>
    this.providerTTLs = new Map()

    // Statistics
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      invalidations: 0
    }
  }

  /**
   * Generate cache key
   */
  _generateKey(type, provider, model = null) {
    if (model) {
      return `pricing:${provider}:${model}`
    }
    return `pricing:${provider}:${type}`
  }

  /**
   * Set TTL for a specific provider
   */
  setProviderTTL(provider, ttlMs) {
    this.providerTTLs.set(provider.toLowerCase(), ttlMs)
  }

  /**
   * Get TTL for a provider (falls back to default)
   */
  getProviderTTL(provider) {
    return this.providerTTLs.get(provider.toLowerCase()) || DEFAULT_TTL_MS
  }

  /**
   * Get cached value
   */
  get(key) {
    const entry = this.cache.get(key)

    if (!entry) {
      this.stats.misses++
      return null
    }

    // Check if expired
    if (entry.expiresAt && new Date() > entry.expiresAt) {
      this.cache.delete(key)
      this.stats.misses++
      return null
    }

    this.stats.hits++
    return entry.data
  }

  /**
   * Get pricing for a specific model
   */
  getModelPricing(provider, model) {
    const key = this._generateKey('model', provider, model)
    return this.get(key)
  }

  /**
   * Get all pricing for a provider
   */
  getProviderPricing(provider) {
    const key = this._generateKey('all', provider)
    return this.get(key)
  }

  /**
   * Set cached value with TTL
   */
  set(key, data, ttlMs = null) {
    const effectiveTTL = ttlMs || DEFAULT_TTL_MS
    const expiresAt = new Date(Date.now() + effectiveTTL)

    this.cache.set(key, {
      data,
      expiresAt,
      cachedAt: new Date()
    })

    this.stats.sets++
    return true
  }

  /**
   * Set pricing for a specific model
   */
  setModelPricing(provider, model, data) {
    const key = this._generateKey('model', provider, model)
    const ttl = this.getProviderTTL(provider)
    return this.set(key, data, ttl)
  }

  /**
   * Set all pricing for a provider
   */
  setProviderPricing(provider, data) {
    const key = this._generateKey('all', provider)
    const ttl = this.getProviderTTL(provider)
    return this.set(key, data, ttl)
  }

  /**
   * Invalidate a specific cache entry
   */
  invalidate(key) {
    const deleted = this.cache.delete(key)
    if (deleted) {
      this.stats.invalidations++
    }
    return deleted
  }

  /**
   * Invalidate all pricing for a provider
   */
  invalidateProvider(provider) {
    const providerLower = provider.toLowerCase()
    let count = 0

    for (const key of this.cache.keys()) {
      if (key.startsWith(`pricing:${providerLower}:`)) {
        this.cache.delete(key)
        count++
      }
    }

    this.stats.invalidations += count
    return count
  }

  /**
   * Invalidate all cached pricing
   */
  invalidateAll() {
    const count = this.cache.size
    this.cache.clear()
    this.stats.invalidations += count
    return count
  }

  /**
   * Clear expired entries (garbage collection)
   */
  clearExpired() {
    const now = new Date()
    let count = 0

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.cache.delete(key)
        count++
      }
    }

    return count
  }

  /**
   * Check if cache entry exists and is valid
   */
  has(key) {
    const entry = this.cache.get(key)
    if (!entry) return false
    if (entry.expiresAt && new Date() > entry.expiresAt) {
      this.cache.delete(key)
      return false
    }
    return true
  }

  /**
   * Check if provider pricing is cached
   */
  hasProviderPricing(provider) {
    const key = this._generateKey('all', provider)
    return this.has(key)
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
      : 0

    return {
      ...this.stats,
      size: this.cache.size,
      hitRate: `${hitRate}%`
    }
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      invalidations: 0
    }
  }

  /**
   * Get all cached keys (for debugging)
   */
  getKeys() {
    return Array.from(this.cache.keys())
  }

  /**
   * Get cache entry metadata (for debugging)
   */
  getEntryMeta(key) {
    const entry = this.cache.get(key)
    if (!entry) return null

    return {
      cachedAt: entry.cachedAt,
      expiresAt: entry.expiresAt,
      ttlRemaining: entry.expiresAt
        ? Math.max(0, entry.expiresAt.getTime() - Date.now())
        : null
    }
  }
}

// Singleton instance
export const pricingCacheService = new PricingCacheService()

// Also export class for testing
export { PricingCacheService }

import { ModelPricing } from '../models/ModelPricing.js'
import { ProviderPricingConfig } from '../models/ProviderPricingConfig.js'
import { pricingCacheService } from './PricingCacheService.js'
import { pricingFetcherFactory } from './pricing/PricingFetcherFactory.js'

/**
 * Main pricing service for managing LLM model pricing
 * Provides cache-first lookups, auto-refresh, and cost calculation
 */
class PricingService {
  constructor() {
    this.initialized = false
    this.refreshTimers = new Map()
    this._refreshInProgress = false
  }

  /**
   * Initialize the pricing service
   * - Load provider configs
   * - Set up cache TTLs
   * - Start auto-refresh timers
   */
  async initialize() {
    if (this.initialized) return

    try {
      // Ensure provider configs exist
      await ProviderPricingConfig.seedDefaults()

      // Load all provider configs and set cache TTLs
      const configs = await ProviderPricingConfig.getActiveProviders()
      for (const config of configs) {
        pricingCacheService.setProviderTTL(config.provider, config.cache.ttlMs)
      }

      this.initialized = true
      console.log(`PricingService initialized with ${configs.length} providers`)
    } catch (error) {
      console.error('Failed to initialize PricingService:', error)
      throw error
    }
  }

  /**
   * Seed initial pricing data for all providers
   */
  async seedPricing() {
    const fetchers = pricingFetcherFactory.getAllFetchers()
    const results = {
      seeded: 0,
      skipped: 0,
      errors: []
    }

    for (const [provider, fetcher] of fetchers) {
      try {
        // Get default pricing from fetcher
        const { data: pricingData, source } = await fetcher.getPricing()

        for (const modelData of pricingData) {
          // Check if pricing already exists
          const existing = await ModelPricing.getCurrentPricing(provider, modelData.model)
          if (existing) {
            results.skipped++
            continue
          }

          // Create new pricing record
          await ModelPricing.create({
            provider,
            model: modelData.model,
            displayName: modelData.displayName,
            pricing: modelData.pricing,
            capabilities: modelData.capabilities || {},
            source,
            createdBy: 'system'
          })

          results.seeded++
        }

        // Update provider config
        const config = await ProviderPricingConfig.getProvider(provider)
        if (config) {
          await config.markRefreshed()
        }
      } catch (error) {
        results.errors.push({ provider, error: error.message })
      }
    }

    // Invalidate all cache after seeding
    pricingCacheService.invalidateAll()

    console.log(`Pricing seeded: ${results.seeded} new, ${results.skipped} existing, ${results.errors.length} errors`)
    return results
  }

  /**
   * Reseed pricing - syncs DB with provider APIs
   * - Expires any DB models NOT in provider API valid list
   * - Adds any new models from provider API not in DB
   * - Syncs capabilities on existing models when fetcher data differs (self-healing)
   * This is the "sync" operation that deprecates old models and adds new ones
   */
  async reseedPricing() {
    const fetchers = pricingFetcherFactory.getAllFetchers()
    const results = {
      totalExpired: 0,
      totalAdded: 0,
      totalUpdated: 0,
      totalUnchanged: 0,
      providers: {},
      errors: []
    }

    console.log(`[Pricing Sync] Processing ${fetchers.size} providers: ${Array.from(fetchers.keys()).join(', ')}`)

    for (const [provider, fetcher] of fetchers) {
      try {
        // Fetch valid models from provider API
        const { data: validModels, source } = await fetcher.getPricing()
        const validModelIds = new Set(validModels.map(p => p.model))
        const validModelsMap = new Map(validModels.map(p => [p.model, p]))

        // Get ALL active (non-expired) models for this provider from DB
        const activeDbModels = await ModelPricing.find({
          provider,
          expiredAt: null
        })
        const activeDbModelIds = new Set(activeDbModels.map(p => p.model))

        let expired = 0
        let added = 0
        let updated = 0
        let unchanged = 0

        // 1. Expire any DB model that is NOT in the valid models list
        for (const dbModel of activeDbModels) {
          if (!validModelIds.has(dbModel.model)) {
            try {
              await dbModel.expire()
              expired++
              console.log(`[Pricing Reseed] Deprecated: ${provider}/${dbModel.model}`)
            } catch (expireError) {
              console.error(`[Pricing Reseed] Failed to expire ${provider}/${dbModel.model}:`, expireError.message)
            }
          } else {
            unchanged++
          }
        }

        // 2. Add any new models from API that aren't in DB yet
        for (const [modelId, modelData] of validModelsMap) {
          if (!activeDbModelIds.has(modelId)) {
            try {
              await ModelPricing.createPricing({
                provider,
                model: modelData.model,
                displayName: modelData.displayName,
                pricing: modelData.pricing,
                capabilities: modelData.capabilities || {},
                source,
                createdBy: 'system'
              })
              added++
              console.log(`[Pricing Reseed] Added: ${provider}/${modelId}`)
            } catch (addError) {
              console.error(`[Pricing Reseed] Failed to add ${provider}/${modelId}:`, addError.message)
            }
          }
        }

        // 3. Sync capabilities on existing models (self-healing)
        // Updates DB records when fetcher-inferred capabilities differ
        for (const dbModel of activeDbModels) {
          const fetcherData = validModelsMap.get(dbModel.model)
          if (!fetcherData?.capabilities) continue

          const dbCaps = dbModel.capabilities || {}
          const fetcherCaps = fetcherData.capabilities
          let needsUpdate = false
          const capUpdates = {}

          for (const key of Object.keys(fetcherCaps)) {
            if (dbCaps[key] !== fetcherCaps[key]) {
              capUpdates[`capabilities.${key}`] = fetcherCaps[key]
              needsUpdate = true
            }
          }

          if (needsUpdate) {
            try {
              await ModelPricing.updateOne({ _id: dbModel._id }, { $set: capUpdates })
              updated++
              console.log(`[Pricing Reseed] Updated capabilities: ${provider}/${dbModel.model}`)
            } catch (updateError) {
              console.error(`[Pricing Reseed] Failed to update ${provider}/${dbModel.model}:`, updateError.message)
            }
          }
        }

        results.providers[provider] = { expired, added, updated, unchanged, source }
        results.totalExpired += expired
        results.totalAdded += added
        results.totalUpdated += updated
        results.totalUnchanged += unchanged
      } catch (error) {
        console.error(`[Pricing Sync] Error processing ${provider}:`, error.message)
        results.errors.push({ provider, error: error.message })
      }
    }

    // Invalidate all cache after reseeding
    pricingCacheService.invalidateAll()

    console.log(`[Pricing Sync] Complete: ${results.totalAdded} added, ${results.totalUpdated} updated, ${results.totalExpired} deprecated, ${results.totalUnchanged} unchanged`)
    return results
  }

  /**
   * Get current pricing for a specific model (cache-first)
   */
  async getCurrentPricing(provider, model) {
    // Check cache first
    const cached = pricingCacheService.getModelPricing(provider, model)
    if (cached) {
      return cached
    }

    // Load from database
    const pricing = await ModelPricing.getCurrentPricing(provider, model)
    if (pricing) {
      pricingCacheService.setModelPricing(provider, model, pricing)
    }

    return pricing
  }

  /**
   * Get all pricing for a provider (cache-first)
   * Triggers lazy background refresh if any provider cache has expired
   */
  async getProviderPricing(provider) {
    // Fire-and-forget: check if any providers need refreshing
    if (!this._refreshInProgress) {
      this._lazyRefresh()
    }

    // Check cache first
    const cached = pricingCacheService.getProviderPricing(provider)
    if (cached) {
      return cached
    }

    // Load from database
    const pricing = await ModelPricing.getProviderPricing(provider)
    if (pricing.length > 0) {
      pricingCacheService.setProviderPricing(provider, pricing)
    }

    return pricing
  }

  /**
   * Get all current pricing for all providers
   * Lazily triggers a background reseed if any provider's cache has expired
   */
  async getAllCurrentPricing() {
    // Fire-and-forget: check if any providers need refreshing
    // This runs in the background so the current request isn't delayed
    if (!this._refreshInProgress) {
      this._lazyRefresh()
    }

    const pricing = await ModelPricing.getAllCurrentPricing()

    // Group by provider
    const byProvider = {}
    for (const p of pricing) {
      if (!byProvider[p.provider]) {
        byProvider[p.provider] = []
      }
      byProvider[p.provider].push(p)
    }

    return byProvider
  }

  /**
   * Lazy background refresh - checks if any provider pricing has expired
   * and reseeds if so. Debounced so concurrent requests don't trigger multiple reseeds.
   */
  _lazyRefresh() {
    this._refreshInProgress = true
    this.checkAndRefreshExpired()
      .then(results => {
        if (results.length > 0) {
          const refreshed = results.filter(r => r.status === 'refreshed')
          if (refreshed.length > 0) {
            console.log(`[pricing] Lazy refresh updated ${refreshed.length} provider(s): ${refreshed.map(r => r.provider).join(', ')}`)
          }
        }
      })
      .catch(error => {
        console.error('[pricing] Lazy refresh failed:', error.message)
      })
      .finally(() => {
        this._refreshInProgress = false
      })
  }

  /**
   * Get pricing at a specific point in time (for historical cost calculation)
   */
  async getPricingAtTime(provider, model, timestamp) {
    return ModelPricing.getPricingAtTime(provider, model, timestamp)
  }

  /**
   * Get pricing history for a model
   */
  async getPricingHistory(provider, model, limit = 10) {
    return ModelPricing.getPricingHistory(provider, model, limit)
  }

  /**
   * Calculate cost for an LLM execution
   * @returns {{ inputCost: number, outputCost: number, totalCost: number, pricingId: string, pricingEffectiveFrom: Date }}
   */
  async calculateCost(provider, model, inputTokens, outputTokens, executionTime = null) {
    // Get pricing (either current or at execution time)
    const pricing = executionTime
      ? await this.getPricingAtTime(provider, model, executionTime)
      : await this.getCurrentPricing(provider, model)

    if (!pricing) {
      console.warn(`No pricing found for ${provider}/${model}`)
      return null
    }

    // Calculate costs (pricing is per 1M tokens)
    const inputCost = (inputTokens / 1_000_000) * pricing.pricing.inputTokens
    const outputCost = (outputTokens / 1_000_000) * pricing.pricing.outputTokens
    const totalCost = inputCost + outputCost

    return {
      inputCost: Math.round(inputCost * 1_000_000) / 1_000_000, // Round to 6 decimal places
      outputCost: Math.round(outputCost * 1_000_000) / 1_000_000,
      totalCost: Math.round(totalCost * 1_000_000) / 1_000_000,
      pricingId: pricing.pricingId,
      pricingEffectiveFrom: pricing.effectiveFrom,
      inputRate: pricing.pricing.inputTokens,
      outputRate: pricing.pricing.outputTokens
    }
  }

  /**
   * Update pricing for a model (creates new immutable record)
   */
  async updatePricing(provider, model, data, options = {}) {
    const { source = 'manual', createdBy = 'system', notes = null } = options

    // Use createPricing which handles expiring the old record
    const newPricing = await ModelPricing.createPricing({
      provider,
      model,
      displayName: data.displayName,
      pricing: data.pricing,
      capabilities: data.capabilities,
      source,
      createdBy,
      notes
    })

    // Invalidate cache for this provider
    pricingCacheService.invalidateProvider(provider)

    return newPricing
  }

  /**
   * Refresh pricing for a provider (from fetcher defaults)
   */
  async refreshProviderPricing(provider) {
    const fetcher = pricingFetcherFactory.getFetcher(provider)
    if (!fetcher) {
      throw new Error(`No pricing fetcher found for provider: ${provider}`)
    }

    const config = await ProviderPricingConfig.getProvider(provider)

    try {
      const { data: pricingData, source } = await fetcher.getPricing()
      let updated = 0
      let unchanged = 0

      for (const modelData of pricingData) {
        const current = await ModelPricing.getCurrentPricing(provider, modelData.model)

        // Check if pricing changed
        const pricingChanged = !current ||
          current.pricing.inputTokens !== modelData.pricing.inputTokens ||
          current.pricing.outputTokens !== modelData.pricing.outputTokens

        if (pricingChanged) {
          await this.updatePricing(provider, modelData.model, modelData, { source })
          updated++
        } else {
          unchanged++
        }
      }

      // Update config
      if (config) {
        await config.markRefreshed()
      }

      // Invalidate cache
      pricingCacheService.invalidateProvider(provider)

      return { provider, updated, unchanged, source }
    } catch (error) {
      // Mark refresh as failed
      if (config) {
        await config.markRefreshFailed(error.message)
      }
      throw error
    }
  }

  /**
   * Check and refresh expired provider pricing
   */
  async checkAndRefreshExpired() {
    const configs = await ProviderPricingConfig.getActiveProviders()
    const results = []

    for (const config of configs) {
      if (!config.apiConfig.autoFetchEnabled) continue

      const isExpired = await ProviderPricingConfig.isCacheExpired(config.provider)
      if (isExpired) {
        try {
          const result = await this.refreshProviderPricing(config.provider)
          results.push({ ...result, status: 'refreshed' })
        } catch (error) {
          results.push({
            provider: config.provider,
            status: 'failed',
            error: error.message
          })
        }
      }
    }

    return results
  }

  /**
   * Get pricing for user's configured providers
   * @param {Map} userProviders - User's configured providers from User.aiFeatures.llmProviders
   */
  async getUserProvidersPricing(userProviders) {
    const result = {}

    for (const [provider, config] of Object.entries(userProviders || {})) {
      if (config.hasKey) {
        const pricing = await this.getProviderPricing(provider)
        if (pricing.length > 0) {
          result[provider] = pricing.map(p => ({
            model: p.model,
            displayName: p.displayName,
            pricing: {
              inputTokens: p.pricing.inputTokens,
              outputTokens: p.pricing.outputTokens
            },
            capabilities: p.capabilities
          }))
        }
      }
    }

    return result
  }

  /**
   * Get all provider configurations (for UI)
   */
  async getProviderConfigs() {
    const configs = await ProviderPricingConfig.getActiveProviders()
    return configs.map(c => ({
      provider: c.provider,
      displayName: c.displayName,
      baseUrl: c.baseUrl,
      consoleUrl: c.metadata?.consoleUrl,
      keyPrefix: c.metadata?.keyPrefix,
      isLocal: c.metadata?.isLocal || false,
      sortOrder: c.sortOrder
    }))
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return pricingCacheService.getStats()
  }
}

// Export singleton instance
export const pricingService = new PricingService()

// Also export class for testing
export { PricingService }

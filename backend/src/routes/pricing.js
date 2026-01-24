import express from 'express'
import { pricingService } from '../services/PricingService.js'
import { requireAuth } from '../middleware/auth.js'

const router = express.Router()

/**
 * GET /api/pricing
 * Get all current pricing for all providers
 * Requires authentication
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const pricing = await pricingService.getAllCurrentPricing()
    res.json({
      success: true,
      data: pricing
    })
  } catch (error) {
    console.error('Error fetching all pricing:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pricing data'
    })
  }
})

/**
 * GET /api/pricing/providers
 * Get all provider configurations (for UI dropdown)
 * Requires authentication
 */
router.get('/providers', requireAuth, async (req, res) => {
  try {
    const providers = await pricingService.getProviderConfigs()
    res.json({
      success: true,
      data: providers
    })
  } catch (error) {
    console.error('Error fetching provider configs:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch provider configurations'
    })
  }
})

/**
 * GET /api/pricing/user-providers
 * Get pricing for user's configured providers only
 * Requires authentication
 */
router.get('/user-providers', requireAuth, async (req, res) => {
  try {
    const userProviders = req.user.aiFeatures?.llmProviders || {}
    const pricing = await pricingService.getUserProvidersPricing(userProviders)

    res.json({
      success: true,
      data: pricing
    })
  } catch (error) {
    console.error('Error fetching user provider pricing:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user provider pricing'
    })
  }
})

/**
 * GET /api/pricing/cache-stats
 * Get cache statistics (for debugging)
 * Requires authentication
 */
router.get('/cache-stats', requireAuth, async (req, res) => {
  try {
    const stats = pricingService.getCacheStats()
    res.json({
      success: true,
      data: stats
    })
  } catch (error) {
    console.error('Error fetching cache stats:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch cache statistics'
    })
  }
})

/**
 * GET /api/pricing/:provider
 * Get all pricing for a specific provider
 * Requires authentication
 */
router.get('/:provider', requireAuth, async (req, res) => {
  try {
    const { provider } = req.params
    const pricing = await pricingService.getProviderPricing(provider)

    if (pricing.length === 0) {
      return res.status(404).json({
        success: false,
        error: `No pricing found for provider: ${provider}`
      })
    }

    res.json({
      success: true,
      data: pricing
    })
  } catch (error) {
    console.error(`Error fetching pricing for provider ${req.params.provider}:`, error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch provider pricing'
    })
  }
})

/**
 * GET /api/pricing/:provider/:model
 * Get pricing for a specific model
 * Requires authentication
 */
router.get('/:provider/:model', requireAuth, async (req, res) => {
  try {
    const { provider, model } = req.params
    const pricing = await pricingService.getCurrentPricing(provider, model)

    if (!pricing) {
      return res.status(404).json({
        success: false,
        error: `No pricing found for ${provider}/${model}`
      })
    }

    res.json({
      success: true,
      data: pricing
    })
  } catch (error) {
    console.error(`Error fetching pricing for ${req.params.provider}/${req.params.model}:`, error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch model pricing'
    })
  }
})

/**
 * GET /api/pricing/:provider/:model/history
 * Get pricing history for a model
 * Requires authentication
 */
router.get('/:provider/:model/history', requireAuth, async (req, res) => {
  try {
    const { provider, model } = req.params
    const limit = parseInt(req.query.limit) || 10

    const history = await pricingService.getPricingHistory(provider, model, limit)

    res.json({
      success: true,
      data: history
    })
  } catch (error) {
    console.error(`Error fetching pricing history for ${req.params.provider}/${req.params.model}:`, error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pricing history'
    })
  }
})

/**
 * POST /api/pricing/calculate
 * Calculate cost for an execution
 * Requires authentication
 */
router.post('/calculate', requireAuth, async (req, res) => {
  try {
    const { provider, model, inputTokens, outputTokens, executionTime } = req.body

    if (!provider || !model || inputTokens === undefined || outputTokens === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: provider, model, inputTokens, outputTokens'
      })
    }

    const cost = await pricingService.calculateCost(
      provider,
      model,
      inputTokens,
      outputTokens,
      executionTime ? new Date(executionTime) : null
    )

    if (!cost) {
      return res.status(404).json({
        success: false,
        error: `No pricing found for ${provider}/${model}`
      })
    }

    res.json({
      success: true,
      data: cost
    })
  } catch (error) {
    console.error('Error calculating cost:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to calculate cost'
    })
  }
})

/**
 * POST /api/pricing/reseed/:provider
 * Sync models with provider API
 * - Fetches current valid models from provider API
 * - Expires any DB models NOT in that list (marks as deprecated)
 * - Adds any new models from API that aren't in DB yet
 * Requires authentication
 */
router.post('/reseed/:provider', requireAuth, async (req, res) => {
  try {
    const { provider } = req.params
    const providerLower = provider.toLowerCase()

    // Import ModelPricing and fetcher factory
    const { ModelPricing } = await import('../models/ModelPricing.js')
    const { pricingFetcherFactory } = await import('../services/pricing/PricingFetcherFactory.js')

    // Get fetcher for this provider
    const fetcher = pricingFetcherFactory.getFetcher(providerLower)
    if (!fetcher) {
      return res.status(404).json({
        success: false,
        error: `No pricing fetcher found for provider: ${provider}`
      })
    }

    // Fetch valid models from provider API
    const { data: validModels, source } = await fetcher.getPricing()
    const validModelIds = new Set(validModels.map(p => p.model))
    const validModelsMap = new Map(validModels.map(p => [p.model, p]))

    console.log(`[Pricing Reseed] Fetched ${validModels.length} valid models for ${provider} (source: ${source})`)

    // Get ALL active (non-expired) models for this provider from DB
    const activeDbModels = await ModelPricing.find({
      provider: providerLower,
      expiredAt: null
    })
    const activeDbModelIds = new Set(activeDbModels.map(p => p.model))

    console.log(`[Pricing Reseed] Active DB models for ${provider}:`, Array.from(activeDbModelIds))

    let expired = 0
    let stillValid = 0
    let added = 0

    // 1. Expire any DB model that is NOT in the valid models list
    for (const dbModel of activeDbModels) {
      if (!validModelIds.has(dbModel.model)) {
        try {
          await dbModel.expire()
          expired++
          console.log(`[Pricing Reseed] Deprecated model: ${dbModel.model}`)
        } catch (expireError) {
          console.error(`[Pricing Reseed] Failed to expire ${dbModel.model}:`, expireError.message)
        }
      } else {
        stillValid++
      }
    }

    // 2. Add any new models from API that aren't in DB yet
    for (const [modelId, modelData] of validModelsMap) {
      if (!activeDbModelIds.has(modelId)) {
        try {
          await ModelPricing.createPricing({
            provider: providerLower,
            model: modelData.model,
            displayName: modelData.displayName,
            pricing: modelData.pricing,
            capabilities: modelData.capabilities || {},
            source,
            createdBy: 'system'
          })
          added++
          console.log(`[Pricing Reseed] Added new model: ${modelId}`)
        } catch (addError) {
          console.error(`[Pricing Reseed] Failed to add ${modelId}:`, addError.message)
        }
      }
    }

    // Invalidate cache
    const { pricingCacheService } = await import('../services/PricingCacheService.js')
    pricingCacheService.invalidateProvider(providerLower)

    res.json({
      success: true,
      data: {
        provider: providerLower,
        source,
        expired,
        added,
        stillValid,
        totalValidFromApi: validModels.length,
        message: `${provider}: ${expired} deprecated, ${added} added, ${stillValid} unchanged`
      }
    })
  } catch (error) {
    console.error(`Error reseeding pricing for ${req.params.provider}:`, error)
    res.status(500).json({
      success: false,
      error: 'Failed to reseed pricing'
    })
  }
})

/**
 * POST /api/pricing/reseed-all
 * Sync models with ALL provider APIs
 * - Fetches current valid models from each provider API
 * - Expires any DB models NOT in valid list (marks as deprecated)
 * - Adds any new models from API that aren't in DB yet
 * Requires authentication
 */
router.post('/reseed-all', requireAuth, async (req, res) => {
  try {
    // Import dependencies
    const { ModelPricing } = await import('../models/ModelPricing.js')
    const { pricingFetcherFactory } = await import('../services/pricing/PricingFetcherFactory.js')
    const { pricingCacheService } = await import('../services/PricingCacheService.js')

    const fetchers = pricingFetcherFactory.getAllFetchers()
    const results = {
      providers: {},
      totalExpired: 0,
      totalAdded: 0,
      totalStillValid: 0,
      errors: []
    }

    for (const [provider, fetcher] of fetchers) {
      try {
        // Fetch valid models from provider API
        const { data: validModels, source } = await fetcher.getPricing()
        const validModelIds = new Set(validModels.map(p => p.model))
        const validModelsMap = new Map(validModels.map(p => [p.model, p]))

        console.log(`[Pricing Reseed All] Fetched ${validModels.length} valid models for ${provider} (source: ${source})`)

        // Get ALL active (non-expired) models for this provider from DB
        const activeDbModels = await ModelPricing.find({
          provider,
          expiredAt: null
        })
        const activeDbModelIds = new Set(activeDbModels.map(p => p.model))

        let expired = 0
        let added = 0
        let stillValid = 0

        // 1. Expire any DB model that is NOT in the valid models list
        for (const dbModel of activeDbModels) {
          if (!validModelIds.has(dbModel.model)) {
            try {
              await dbModel.expire()
              expired++
              console.log(`[Pricing Reseed All] Deprecated model: ${provider}/${dbModel.model}`)
            } catch (expireError) {
              console.error(`[Pricing Reseed All] Failed to expire ${provider}/${dbModel.model}:`, expireError.message)
            }
          } else {
            stillValid++
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
              console.log(`[Pricing Reseed All] Added new model: ${provider}/${modelId}`)
            } catch (addError) {
              console.error(`[Pricing Reseed All] Failed to add ${provider}/${modelId}:`, addError.message)
            }
          }
        }

        results.providers[provider] = { expired, added, stillValid, source, totalValidFromApi: validModels.length }
        results.totalExpired += expired
        results.totalAdded += added
        results.totalStillValid += stillValid
      } catch (error) {
        results.errors.push({ provider, error: error.message })
      }
    }

    // Invalidate all cache
    pricingCacheService.invalidateAll()

    res.json({
      success: true,
      data: {
        ...results,
        message: `All providers: ${results.totalExpired} deprecated, ${results.totalAdded} added, ${results.totalStillValid} unchanged`
      }
    })
  } catch (error) {
    console.error('Error reseeding all pricing:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to reseed pricing'
    })
  }
})

export default router

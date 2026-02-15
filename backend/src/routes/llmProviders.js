import express from 'express'
import { User } from '../models/User.js'
import { encryptApiKey } from '../services/EncryptionService.js'
import { clerkAuth } from '../middleware/clerkAuth.js'
import { ProviderPricingConfig } from '../models/ProviderPricingConfig.js'
import { pricingService } from '../services/PricingService.js'

const router = express.Router()

// Known provider key prefixes for validation
const PROVIDER_KEY_PREFIXES = {
  anthropic: 'sk-ant-',
  openai: 'sk-',
  groq: 'gsk_',
  google: '', // Google uses different auth
  mistral: '',
  cohere: '',
  together: '',
  perplexity: 'pplx-',
  deepseek: 'sk-',
  ollama: '' // Local, may not need key
}

/**
 * Helper to get provider config from Map or plain object
 */
const getUserProviderConfig = (providers, providerId) => {
  if (!providers) return null
  if (typeof providers.get === 'function') {
    return providers.get(providerId)
  }
  return providers[providerId]
}

/**
 * GET /api/llm-providers
 * List all available providers and user's configured keys
 */
router.get('/', clerkAuth, async (req, res) => {
  try {
    // Get all available providers from config
    // Note: Schema uses 'sortOrder', not 'displayOrder'
    const availableProviders = await ProviderPricingConfig.find({ isActive: true })
      .sort({ sortOrder: 1, displayName: 1 })
      .lean()

    // Build response with user's key status for each provider
    const providers = {}
    const userProviders = req.user.aiFeatures?.llmProviders

    for (const config of availableProviders) {
      // Note: Schema field is 'provider', but we expose as 'providerId' in API
      const providerId = config.provider
      const userConfig = getUserProviderConfig(userProviders, providerId)
      providers[providerId] = {
        providerId: providerId,
        displayName: config.displayName,
        hasKey: userConfig?.hasKey || false,
        addedAt: userConfig?.addedAt || null,
        isCustom: false,
        keyPrefix: config.metadata?.keyPrefix,
        consoleUrl: config.metadata?.consoleUrl,
        isLocal: config.metadata?.isLocal || false
      }
    }

    // Also include any custom providers the user has configured
    if (userProviders) {
      const entries = typeof userProviders.entries === 'function'
        ? Array.from(userProviders.entries())
        : Object.entries(userProviders)

      for (const [providerId, config] of entries) {
        if (!providers[providerId] && config.isCustom && config.hasKey) {
          providers[providerId] = {
            providerId,
            displayName: config.customConfig?.displayName || providerId,
            hasKey: true,
            addedAt: config.addedAt,
            isCustom: true,
            baseUrl: config.customConfig?.baseUrl,
            models: config.customConfig?.models || []
          }
        }
      }
    }

    // Get user's default provider preference
    const defaultProvider = req.user.aiFeatures?.defaultProvider || null

    res.json({
      providers,
      defaultProvider,
      totalConfigured: Object.values(providers).filter(p => p.hasKey).length
    })
  } catch (error) {
    console.error('Error fetching LLM providers:', error)
    res.status(500).json({ error: 'Failed to fetch providers' })
  }
})

/**
 * GET /api/llm-providers/available
 * List all available providers with their pricing
 */
router.get('/available', clerkAuth, async (req, res) => {
  try {
    // Get all available providers
    // Note: Schema uses 'sortOrder', not 'displayOrder'
    const providerConfigs = await ProviderPricingConfig.find({ isActive: true })
      .sort({ sortOrder: 1, displayName: 1 })
      .lean()

    // Get pricing for each provider
    const providersWithPricing = await Promise.all(
      providerConfigs.map(async (config) => {
        // Note: Schema field is 'provider', but we expose as 'providerId' in API
        const providerId = config.provider
        const pricing = await pricingService.getProviderPricing(providerId)
        return {
          providerId: providerId,
          displayName: config.displayName,
          keyPrefix: config.metadata?.keyPrefix,
          consoleUrl: config.metadata?.consoleUrl,
          isLocal: config.metadata?.isLocal || false,
          models: pricing.map(p => ({
            model: p.model,
            displayName: p.displayName,
            inputPrice: p.pricing?.inputTokens,
            outputPrice: p.pricing?.outputTokens,
            contextWindow: p.capabilities?.contextWindow,
            supportsVision: p.capabilities?.supportsVision,
            supportsTools: p.capabilities?.supportsTools,
            supportsImageGeneration: p.capabilities?.supportsImageGeneration || false
          }))
        }
      })
    )

    res.json({ providers: providersWithPricing })
  } catch (error) {
    console.error('Error fetching available providers:', error)
    res.status(500).json({ error: 'Failed to fetch available providers' })
  }
})

/**
 * POST /api/llm-providers/:provider
 * Add or update encrypted API key for an LLM provider
 */
router.post('/:provider', clerkAuth, async (req, res) => {
  try {
    const { provider } = req.params
    const { apiKey, customConfig } = req.body

    // Check if it's a known provider or custom
    // Note: Schema field is 'provider', not 'providerId'
    const knownProvider = await ProviderPricingConfig.findOne({ provider: provider })
    const isCustom = !knownProvider && customConfig

    // Validate API key
    if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 10) {
      return res.status(400).json({ error: 'Invalid API key format' })
    }

    // Validate key prefix for known providers
    const keyPrefix = knownProvider?.metadata?.keyPrefix
    if (knownProvider && keyPrefix) {
      if (!apiKey.startsWith(keyPrefix)) {
        return res.status(400).json({
          error: `Invalid ${knownProvider.displayName} API key format (must start with ${keyPrefix})`
        })
      }
    }

    // For custom providers, validate customConfig
    if (isCustom) {
      if (!customConfig?.displayName || !customConfig?.baseUrl) {
        return res.status(400).json({
          error: 'Custom providers require displayName and baseUrl in customConfig'
        })
      }
    }

    // Encrypt and store using User model helper method
    const { encryptedKey, iv } = encryptApiKey(apiKey)

    // Use the User model's setProviderKey method
    req.user.setProviderKey(provider, encryptedKey, iv, isCustom ? customConfig : null)

    await req.user.save()

    res.json({
      message: `${knownProvider?.displayName || customConfig?.displayName || provider} API key added successfully`,
      hasKey: true,
      isCustom,
      unlockedFeatures: ['unlimited AI generations', 'unlimited executions']
    })
  } catch (error) {
    console.error('Error adding LLM provider key:', error)
    res.status(500).json({ error: 'Failed to add API key', message: error.message })
  }
})

/**
 * DELETE /api/llm-providers/:provider
 * Remove API key for an LLM provider
 */
router.delete('/:provider', clerkAuth, async (req, res) => {
  try {
    const { provider } = req.params

    // Check if key exists using helper
    const userConfig = getUserProviderConfig(req.user.aiFeatures?.llmProviders, provider)
    if (!userConfig?.hasKey) {
      return res.status(404).json({ error: 'No API key found for this provider' })
    }

    // Remove key using User model helper method
    req.user.removeProviderKey(provider)

    // If this was the default provider, clear it
    if (req.user.aiFeatures?.defaultProvider === provider) {
      req.user.aiFeatures.defaultProvider = null
    }

    await req.user.save()

    res.json({
      message: `${provider} API key removed successfully`,
      note: 'You will now use plan-based quotas for AI features'
    })
  } catch (error) {
    console.error('Error removing LLM provider key:', error)
    res.status(500).json({ error: 'Failed to remove API key', message: error.message })
  }
})

/**
 * PUT /api/llm-providers/default
 * Set the user's default provider
 */
router.put('/default', clerkAuth, async (req, res) => {
  try {
    const { provider } = req.body

    if (!provider) {
      return res.status(400).json({ error: 'Provider ID is required' })
    }

    // Verify user has this provider configured
    const userConfig = getUserProviderConfig(req.user.aiFeatures?.llmProviders, provider)
    if (!userConfig?.hasKey) {
      return res.status(400).json({ error: 'You must configure this provider before setting it as default' })
    }

    // Initialize aiFeatures if needed
    if (!req.user.aiFeatures) {
      req.user.aiFeatures = {}
    }

    req.user.aiFeatures.defaultProvider = provider
    await req.user.save()

    res.json({
      message: `Default provider set to ${provider}`,
      defaultProvider: provider
    })
  } catch (error) {
    console.error('Error setting default provider:', error)
    res.status(500).json({ error: 'Failed to set default provider' })
  }
})

/**
 * GET /api/llm-providers/:provider/models
 * Get available models and pricing for a specific provider
 */
router.get('/:provider/models', clerkAuth, async (req, res) => {
  try {
    const { provider } = req.params

    // Check if it's a custom provider with user-defined models
    const userConfig = getUserProviderConfig(req.user.aiFeatures?.llmProviders, provider)
    if (userConfig?.isCustom && userConfig?.customConfig?.models) {
      return res.json({
        providerId: provider,
        displayName: userConfig.customConfig.displayName,
        isCustom: true,
        models: userConfig.customConfig.models.map(model => ({
          model,
          displayName: model,
          inputPrice: null, // Custom providers don't have pricing info
          outputPrice: null
        }))
      })
    }

    // Get pricing for known provider
    const pricing = await pricingService.getProviderPricing(provider)

    if (!pricing || pricing.length === 0) {
      return res.status(404).json({ error: 'Provider not found or has no models configured' })
    }

    // Note: Schema field is 'provider', not 'providerId'
    const providerConfig = await ProviderPricingConfig.findOne({ provider: provider }).lean()

    res.json({
      providerId: provider,
      displayName: providerConfig?.displayName || provider,
      isCustom: false,
      models: pricing.map(p => ({
        model: p.model,
        displayName: p.displayName || p.model,
        inputPrice: p.pricing?.inputTokens,
        outputPrice: p.pricing?.outputTokens,
        contextWindow: p.capabilities?.contextWindow,
        maxOutputTokens: p.capabilities?.maxOutputTokens,
        supportsVision: p.capabilities?.supportsVision,
        supportsTools: p.capabilities?.supportsTools,
        supportsStreaming: p.capabilities?.supportsStreaming,
        supportsImageGeneration: p.capabilities?.supportsImageGeneration || false
      }))
    })
  } catch (error) {
    console.error('Error fetching provider models:', error)
    res.status(500).json({ error: 'Failed to fetch provider models' })
  }
})

export default router

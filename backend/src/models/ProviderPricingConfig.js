import mongoose from 'mongoose'

/**
 * ProviderPricingConfig Model
 *
 * Stores configuration for LLM providers including cache settings, API endpoints,
 * and metadata for the pricing system.
 *
 * ============================================================================
 * REFACTORING NOTES (Future Improvements)
 * ============================================================================
 *
 * 1. PRICING API INTEGRATION
 *    - Currently using static default pricing from fetchers
 *    - TODO: Implement actual API fetching for providers that expose pricing endpoints
 *    - OpenAI has no public pricing API, Anthropic has no public pricing API
 *    - Consider scraping or using third-party aggregators like LiteLLM pricing data
 *    - Ref: https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json
 *
 * 2. PROVIDER CONFIGURATION SYNC
 *    - TODO: Add webhook/callback support for providers that notify pricing changes
 *    - TODO: Implement scheduled refresh jobs (cron) instead of on-demand refresh
 *    - TODO: Add alerting when prices change significantly
 *
 * 3. SCHEMA IMPROVEMENTS
 *    - TODO: Add `supportedFeatures` array (vision, tools, json_mode, streaming, etc.)
 *    - TODO: Add `rateLimits` object (requests/min, tokens/min, requests/day)
 *    - TODO: Add `deprecationDate` for models being sunset
 *    - TODO: Add `region` field for regional pricing differences
 *
 * 4. FRONTEND INTEGRATION
 *    - Provider selector in PrompdExecutionTab.tsx needs:
 *      - Pricing display format: "gpt-4o-mini ($0.15/1M in, $0.60/1M out)"
 *      - Dropdown vs tabs based on count (<=3 = tabs, >3 = dropdown)
 *    - AiChatPanel.tsx needs model selector with pricing info
 *
 * 5. CACHING STRATEGY
 *    - Current: In-memory cache with per-provider TTL
 *    - TODO: Consider Redis for multi-instance deployments
 *    - TODO: Add cache warming on server startup
 *    - TODO: Implement cache invalidation webhooks
 *
 * 6. CUSTOM PROVIDERS
 *    - Currently supports custom OpenAI-compatible providers
 *    - TODO: Support for different API formats (Azure OpenAI, AWS Bedrock)
 *    - TODO: Add provider "type" field (openai-compatible, anthropic-compatible, etc.)
 *    - TODO: Add connection testing endpoint
 *
 * 7. PRICING ACCURACY
 *    - TODO: Add "lastVerifiedAt" timestamp for manual verification
 *    - TODO: Add "source" field (official, community, estimated)
 *    - TODO: Add confidence score for pricing data
 *
 * 8. ADMIN FEATURES (Phase 2)
 *    - TODO: Admin endpoints for managing providers
 *    - TODO: Manual pricing override capability
 *    - TODO: Provider enable/disable without deletion
 *    - TODO: Usage analytics per provider
 *
 * ============================================================================
 */

// Default TTL: 24 hours in milliseconds
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000

const ProviderPricingConfigSchema = new mongoose.Schema({
  // Provider identifier (unique per provider)
  provider: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },

  // Human-readable display name
  displayName: {
    type: String,
    required: true,
    trim: true
  },

  // Base URL for the provider's API
  baseUrl: {
    type: String,
    trim: true
  },

  // Cache configuration
  cache: {
    // Time-to-live for cached pricing data
    ttlMs: {
      type: Number,
      default: DEFAULT_TTL_MS,
      min: 60000 // Minimum 1 minute
    },
    // When the pricing was last successfully refreshed
    lastRefreshedAt: {
      type: Date,
      default: null
    },
    // When the last refresh attempt was made
    lastAttemptAt: {
      type: Date,
      default: null
    },
    // Error message from last failed attempt
    lastError: {
      type: String,
      default: null
    }
  },

  // API configuration
  apiConfig: {
    // Whether auto-fetch on cache expiration is enabled
    autoFetchEnabled: {
      type: Boolean,
      default: true
    },
    // Whether this provider has a pricing API we can fetch from
    pricingAvailableViaApi: {
      type: Boolean,
      default: false
    },
    // Endpoint for pricing API (if available)
    pricingEndpoint: {
      type: String,
      trim: true
    }
  },

  // Provider metadata
  metadata: {
    // Link to get API key
    consoleUrl: {
      type: String,
      trim: true
    },
    // API key prefix for validation (e.g., 'sk-ant-' for Anthropic)
    keyPrefix: {
      type: String,
      trim: true
    },
    // Whether this is a local provider (e.g., Ollama)
    isLocal: {
      type: Boolean,
      default: false
    },
    // Default port for local providers
    defaultPort: {
      type: Number
    }
  },

  // Whether this provider is active
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },

  // Sort order for display
  sortOrder: {
    type: Number,
    default: 100
  }
}, {
  timestamps: true
})

// Static method: Get all active providers
ProviderPricingConfigSchema.statics.getActiveProviders = function() {
  return this.find({ isActive: true }).sort({ sortOrder: 1, displayName: 1 })
}

// Static method: Get provider config by ID
ProviderPricingConfigSchema.statics.getProvider = function(provider) {
  return this.findOne({ provider: provider.toLowerCase() })
}

// Static method: Check if cache is expired for a provider
ProviderPricingConfigSchema.statics.isCacheExpired = async function(provider) {
  const config = await this.getProvider(provider)
  if (!config) return true

  const { lastRefreshedAt, ttlMs } = config.cache
  if (!lastRefreshedAt) return true

  const expiresAt = new Date(lastRefreshedAt.getTime() + ttlMs)
  return new Date() > expiresAt
}

// Instance method: Mark cache as refreshed
ProviderPricingConfigSchema.methods.markRefreshed = function() {
  this.cache.lastRefreshedAt = new Date()
  this.cache.lastAttemptAt = new Date()
  this.cache.lastError = null
  return this.save()
}

// Instance method: Mark refresh attempt failed
ProviderPricingConfigSchema.methods.markRefreshFailed = function(errorMessage) {
  this.cache.lastAttemptAt = new Date()
  this.cache.lastError = errorMessage
  return this.save()
}

// Instance method: Get time until cache expires
ProviderPricingConfigSchema.methods.getTimeUntilExpiry = function() {
  const { lastRefreshedAt, ttlMs } = this.cache
  if (!lastRefreshedAt) return 0

  const expiresAt = new Date(lastRefreshedAt.getTime() + ttlMs)
  const remaining = expiresAt.getTime() - Date.now()
  return Math.max(0, remaining)
}

// Static method: Seed default provider configs
ProviderPricingConfigSchema.statics.seedDefaults = async function() {
  const defaults = [
    {
      provider: 'openai',
      displayName: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      metadata: {
        consoleUrl: 'https://platform.openai.com/api-keys',
        keyPrefix: 'sk-'
      },
      sortOrder: 1
    },
    {
      provider: 'anthropic',
      displayName: 'Anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      metadata: {
        consoleUrl: 'https://console.anthropic.com/settings/keys',
        keyPrefix: 'sk-ant-'
      },
      sortOrder: 2
    },
    {
      provider: 'google',
      displayName: 'Google (Gemini)',
      baseUrl: 'https://generativelanguage.googleapis.com',
      metadata: {
        consoleUrl: 'https://aistudio.google.com/apikey'
      },
      sortOrder: 3
    },
    {
      provider: 'groq',
      displayName: 'Groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      metadata: {
        consoleUrl: 'https://console.groq.com/keys',
        keyPrefix: 'gsk_'
      },
      sortOrder: 4
    },
    {
      provider: 'mistral',
      displayName: 'Mistral AI',
      baseUrl: 'https://api.mistral.ai/v1',
      metadata: {
        consoleUrl: 'https://console.mistral.ai/api-keys'
      },
      sortOrder: 5
    },
    {
      provider: 'cohere',
      displayName: 'Cohere',
      baseUrl: 'https://api.cohere.ai/v1',
      metadata: {
        consoleUrl: 'https://dashboard.cohere.com/api-keys'
      },
      sortOrder: 6
    },
    {
      provider: 'together',
      displayName: 'Together AI',
      baseUrl: 'https://api.together.xyz/v1',
      metadata: {
        consoleUrl: 'https://api.together.xyz/settings/api-keys'
      },
      sortOrder: 7
    },
    {
      provider: 'perplexity',
      displayName: 'Perplexity',
      baseUrl: 'https://api.perplexity.ai',
      metadata: {
        consoleUrl: 'https://www.perplexity.ai/settings/api'
      },
      sortOrder: 8
    },
    {
      provider: 'deepseek',
      displayName: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com',
      metadata: {
        consoleUrl: 'https://platform.deepseek.com/api_keys'
      },
      sortOrder: 9
    }
  ]

  const results = []
  for (const config of defaults) {
    const existing = await this.findOne({ provider: config.provider })
    if (!existing) {
      results.push(await this.create(config))
    } else {
      results.push(existing)
    }
  }

  return results
}

export const ProviderPricingConfig = mongoose.model('ProviderPricingConfig', ProviderPricingConfigSchema, 'providerPricingConfig')

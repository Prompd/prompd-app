import { BasePricingFetcher } from './BasePricingFetcher.js'

/**
 * Anthropic pricing fetcher
 * Fetches active models from Anthropic's /v1/models API when key is available
 * Falls back to static defaults
 *
 * API Reference: https://docs.anthropic.com/en/api/models-list
 * Pricing: https://platform.claude.com/docs/en/about-claude/pricing
 * Updated: February 2026
 */
export class AnthropicPricingFetcher extends BasePricingFetcher {
  constructor() {
    super('anthropic')
    this.modelsEndpoint = 'https://api.anthropic.com/v1/models'
  }

  supportsPricingApi() {
    return !!process.env.ANTHROPIC_API_KEY
  }

  /**
   * Fetch active models from Anthropic's API
   * Filters default pricing to only include currently active models
   */
  async fetchPricing() {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      console.warn('[AnthropicPricingFetcher] No API key available, using defaults')
      return this.getDefaultPricing()
    }

    try {
      const response = await fetch(this.modelsEndpoint, {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        console.warn(`[AnthropicPricingFetcher] API request failed: ${response.status}`)
        return this.getDefaultPricing()
      }

      const data = await response.json()
      const activeModels = data.data?.map(m => m.id) || []
      console.log(`[AnthropicPricingFetcher] Fetched ${activeModels.length} models from Anthropic API`)

      // Filter to only claude chat models
      const chatModels = activeModels.filter(m => m.startsWith('claude-'))
      console.log(`[AnthropicPricingFetcher] Filtered to ${chatModels.length} Claude models`)

      // Filter our default pricing to only include active models
      const defaultPricing = this.getDefaultPricing()
      const activePricing = defaultPricing.filter(p => chatModels.includes(p.model))

      const removedModels = defaultPricing.filter(p => !chatModels.includes(p.model))
      if (removedModels.length > 0) {
        console.warn(`[AnthropicPricingFetcher] Deprecated models filtered out: ${removedModels.map(m => m.model).join(', ')}`)
      }

      return activePricing
    } catch (error) {
      console.error('[AnthropicPricingFetcher] Error fetching from API:', error.message)
      return this.getDefaultPricing()
    }
  }

  /**
   * Anthropic: No Claude models currently support native image generation.
   * Base class default (false) applies.
   */

  getDefaultPricing() {
    // Pricing as of February 2026 - https://platform.claude.com/docs/en/about-claude/pricing
    return [
      // --- Latest generation ---
      {
        model: 'claude-opus-4-6',
        displayName: 'Claude Opus 4.6',
        pricing: {
          inputTokens: 5.00,       // $5.00 per 1M input tokens
          outputTokens: 25.00,     // $25.00 per 1M output tokens
          cachedInputTokens: 0.50  // $0.50 per 1M cache reads
        },
        capabilities: {
          contextWindow: 200000,
          maxOutputTokens: 128000,
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'claude-sonnet-4-5-20250929',
        displayName: 'Claude Sonnet 4.5',
        pricing: {
          inputTokens: 3.00,
          outputTokens: 15.00,
          cachedInputTokens: 0.30
        },
        capabilities: {
          contextWindow: 200000,
          maxOutputTokens: 64000,
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'claude-haiku-4-5-20251001',
        displayName: 'Claude Haiku 4.5',
        pricing: {
          inputTokens: 1.00,
          outputTokens: 5.00,
          cachedInputTokens: 0.10
        },
        capabilities: {
          contextWindow: 200000,
          maxOutputTokens: 64000,
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      // --- Legacy (still available) ---
      {
        model: 'claude-opus-4-5-20251101',
        displayName: 'Claude Opus 4.5',
        pricing: {
          inputTokens: 5.00,
          outputTokens: 25.00,
          cachedInputTokens: 0.50
        },
        capabilities: {
          contextWindow: 200000,
          maxOutputTokens: 64000,
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'claude-sonnet-4-20250514',
        displayName: 'Claude Sonnet 4',
        pricing: {
          inputTokens: 3.00,
          outputTokens: 15.00,
          cachedInputTokens: 0.30
        },
        capabilities: {
          contextWindow: 200000,
          maxOutputTokens: 64000,
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'claude-3-haiku-20240307',
        displayName: 'Claude 3 Haiku',
        pricing: {
          inputTokens: 0.25,
          outputTokens: 1.25,
          cachedInputTokens: 0.03
        },
        capabilities: {
          contextWindow: 200000,
          maxOutputTokens: 4096,
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true
        }
      }
    ]
  }
}

import { BasePricingFetcher } from './BasePricingFetcher.js'

/**
 * OpenAI pricing fetcher
 * Fetches active models from OpenAI's API, filters deprecated models
 * Falls back to static pricing since OpenAI doesn't expose pricing info via API
 *
 * API Reference: https://platform.openai.com/docs/api-reference/models
 * Note: Requires OPENAI_API_KEY environment variable
 */
export class OpenAIPricingFetcher extends BasePricingFetcher {
  constructor() {
    super('openai')
    this.modelsEndpoint = 'https://api.openai.com/v1/models'
  }

  supportsPricingApi() {
    // We can fetch models dynamically if API key is available
    return !!process.env.OPENAI_API_KEY
  }

  /**
   * Fetch active models from OpenAI's API
   * Filters our default pricing to only include currently active models
   */
  async fetchPricing() {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      console.warn('[OpenAIPricingFetcher] No API key available, using defaults')
      return this.getDefaultPricing()
    }

    try {
      const response = await fetch(this.modelsEndpoint, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        console.warn(`[OpenAIPricingFetcher] API request failed: ${response.status}`)
        return this.getDefaultPricing()
      }

      const data = await response.json()
      const activeModels = data.data?.map(m => m.id) || []
      console.log(`[OpenAIPricingFetcher] Fetched ${activeModels.length} models from OpenAI API`)

      // Filter to only chat/completion models (exclude embeddings, whisper, dall-e, etc.)
      const chatModels = activeModels.filter(m =>
        m.startsWith('gpt-') || m.startsWith('o1') || m.startsWith('o3') ||
        m.startsWith('o4') || m.startsWith('chatgpt-')
      )
      console.log(`[OpenAIPricingFetcher] Filtered to ${chatModels.length} chat models`)

      // Filter our default pricing to only include active models
      const defaultPricing = this.getDefaultPricing()
      const activePricing = defaultPricing.filter(p => chatModels.includes(p.model))

      // Log any models in our defaults that are no longer active
      const removedModels = defaultPricing.filter(p => !chatModels.includes(p.model))
      if (removedModels.length > 0) {
        console.warn(`[OpenAIPricingFetcher] Deprecated models filtered out: ${removedModels.map(m => m.model).join(', ')}`)
      }

      return activePricing
    } catch (error) {
      console.error('[OpenAIPricingFetcher] Error fetching from API:', error.message)
      return this.getDefaultPricing()
    }
  }

  getDefaultPricing() {
    // Pricing as of February 2026 - https://openai.com/api/pricing/
    return [
      // --- Reasoning models ---
      {
        model: 'o3',
        displayName: 'o3',
        pricing: {
          inputTokens: 2.00,       // $2.00 per 1M input tokens
          outputTokens: 8.00,      // $8.00 per 1M output tokens
          cachedInputTokens: 1.00
        },
        capabilities: {
          contextWindow: 200000,
          maxOutputTokens: 100000,
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'o3-mini',
        displayName: 'o3 Mini',
        pricing: {
          inputTokens: 1.10,
          outputTokens: 4.40,
          cachedInputTokens: 0.55
        },
        capabilities: {
          contextWindow: 200000,
          maxOutputTokens: 100000,
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'o4-mini',
        displayName: 'o4 Mini',
        pricing: {
          inputTokens: 1.10,
          outputTokens: 4.40,
          cachedInputTokens: 0.55
        },
        capabilities: {
          contextWindow: 200000,
          maxOutputTokens: 100000,
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'o1',
        displayName: 'o1',
        pricing: {
          inputTokens: 15.00,
          outputTokens: 60.00,
          cachedInputTokens: 7.50
        },
        capabilities: {
          contextWindow: 200000,
          maxOutputTokens: 100000,
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      // --- GPT models ---
      {
        model: 'gpt-4.1',
        displayName: 'GPT-4.1',
        pricing: {
          inputTokens: 2.00,       // $2.00 per 1M input tokens
          outputTokens: 8.00,      // $8.00 per 1M output tokens
          cachedInputTokens: 0.50
        },
        capabilities: {
          contextWindow: 1047576,
          maxOutputTokens: 32768,
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'gpt-4.1-mini',
        displayName: 'GPT-4.1 Mini',
        pricing: {
          inputTokens: 0.40,
          outputTokens: 1.60,
          cachedInputTokens: 0.10
        },
        capabilities: {
          contextWindow: 1047576,
          maxOutputTokens: 32768,
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'gpt-4.1-nano',
        displayName: 'GPT-4.1 Nano',
        pricing: {
          inputTokens: 0.10,
          outputTokens: 0.40,
          cachedInputTokens: 0.025
        },
        capabilities: {
          contextWindow: 1047576,
          maxOutputTokens: 32768,
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'gpt-4o',
        displayName: 'GPT-4o',
        pricing: {
          inputTokens: 2.50,
          outputTokens: 10.00,
          cachedInputTokens: 1.25
        },
        capabilities: {
          contextWindow: 128000,
          maxOutputTokens: 16384,
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'gpt-4o-mini',
        displayName: 'GPT-4o Mini',
        pricing: {
          inputTokens: 0.15,
          outputTokens: 0.60,
          cachedInputTokens: 0.075
        },
        capabilities: {
          contextWindow: 128000,
          maxOutputTokens: 16384,
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true
        }
      }
    ]
  }
}

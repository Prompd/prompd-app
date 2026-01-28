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
        m.startsWith('gpt-') || m.startsWith('o1') || m.startsWith('chatgpt-')
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
    // Pricing as of December 2024 - https://openai.com/pricing
    return [
      {
        model: 'gpt-4o',
        displayName: 'GPT-4o',
        pricing: {
          inputTokens: 2.50,      // $2.50 per 1M input tokens
          outputTokens: 10.00,    // $10.00 per 1M output tokens
          cachedInputTokens: 1.25 // $1.25 for cached prompts
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
          inputTokens: 0.15,      // $0.15 per 1M input tokens
          outputTokens: 0.60,     // $0.60 per 1M output tokens
          cachedInputTokens: 0.075
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
        model: 'gpt-4-turbo',
        displayName: 'GPT-4 Turbo',
        pricing: {
          inputTokens: 10.00,
          outputTokens: 30.00
        },
        capabilities: {
          contextWindow: 128000,
          maxOutputTokens: 4096,
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'gpt-4',
        displayName: 'GPT-4',
        pricing: {
          inputTokens: 30.00,
          outputTokens: 60.00
        },
        capabilities: {
          contextWindow: 8192,
          maxOutputTokens: 8192,
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'gpt-3.5-turbo',
        displayName: 'GPT-3.5 Turbo',
        pricing: {
          inputTokens: 0.50,
          outputTokens: 1.50
        },
        capabilities: {
          contextWindow: 16385,
          maxOutputTokens: 4096,
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'o1',
        displayName: 'o1',
        pricing: {
          inputTokens: 15.00,
          outputTokens: 60.00
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
        model: 'o1-mini',
        displayName: 'o1 Mini',
        pricing: {
          inputTokens: 3.00,
          outputTokens: 12.00
        },
        capabilities: {
          contextWindow: 128000,
          maxOutputTokens: 65536,
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true
        }
      }
    ]
  }
}

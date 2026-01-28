import { BasePricingFetcher } from './BasePricingFetcher.js'

/**
 * Groq pricing fetcher
 * Fetches active models from Groq's OpenAI-compatible API
 * Falls back to static pricing since Groq doesn't expose pricing info
 *
 * API Reference: https://console.groq.com/docs/api-reference
 * Model Deprecations: https://console.groq.com/docs/deprecations
 */
export class GroqPricingFetcher extends BasePricingFetcher {
  constructor() {
    super('groq')
    this.modelsEndpoint = 'https://api.groq.com/openai/v1/models'
  }

  supportsPricingApi() {
    // We can fetch models dynamically if API key is available
    return !!process.env.GROQ_API_KEY
  }

  /**
   * Fetch active models from Groq's API
   * This ensures we only show models that are currently available
   * Called by BasePricingFetcher.getPricing() when supportsPricingApi() returns true
   *
   * Note: Requires GROQ_API_KEY environment variable
   */
  async fetchPricing() {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
      console.warn('[GroqPricingFetcher] No API key available, using defaults')
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
        console.warn(`[GroqPricingFetcher] API request failed: ${response.status}`)
        return this.getDefaultPricing()
      }

      const data = await response.json()
      const activeModels = data.data?.map(m => m.id) || []
      console.log(`[GroqPricingFetcher] Fetched ${activeModels.length} active models from Groq API`)

      // Filter our default pricing to only include active models
      const defaultPricing = this.getDefaultPricing()
      const activePricing = defaultPricing.filter(p => activeModels.includes(p.model))

      // Log any models in our defaults that are no longer active
      const removedModels = defaultPricing.filter(p => !activeModels.includes(p.model))
      if (removedModels.length > 0) {
        console.warn(`[GroqPricingFetcher] Deprecated models filtered out: ${removedModels.map(m => m.model).join(', ')}`)
      }

      // Add any new models from the API that aren't in our pricing list
      // (they'll have estimated/unknown pricing)
      const knownModels = new Set(defaultPricing.map(p => p.model))
      const newModels = activeModels.filter(m => !knownModels.has(m) && !m.includes('whisper'))
      for (const modelId of newModels) {
        console.log(`[GroqPricingFetcher] New model discovered: ${modelId}`)
        activePricing.push({
          model: modelId,
          displayName: this.formatModelName(modelId),
          pricing: {
            inputTokens: 0.10, // Estimated default pricing
            outputTokens: 0.10
          },
          capabilities: {
            contextWindow: 8192,
            supportsVision: modelId.includes('vision'),
            supportsTools: true,
            supportsStreaming: true
          }
        })
      }

      return activePricing
    } catch (error) {
      console.error('[GroqPricingFetcher] Error fetching from API:', error.message)
      return this.getDefaultPricing()
    }
  }

  /**
   * Format a model ID into a display name
   */
  formatModelName(modelId) {
    return modelId
      .split('-')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  }

  getDefaultPricing() {
    // Pricing as of December 2024
    // Note: Check https://console.groq.com/docs/deprecations for deprecated models
    return [
      {
        model: 'llama-3.3-70b-versatile',
        displayName: 'Llama 3.3 70B Versatile',
        pricing: {
          inputTokens: 0.59,
          outputTokens: 0.79
        },
        capabilities: {
          contextWindow: 128000,
          maxOutputTokens: 32768,
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'llama-3.1-70b-versatile',
        displayName: 'Llama 3.1 70B Versatile',
        pricing: {
          inputTokens: 0.59,
          outputTokens: 0.79
        },
        capabilities: {
          contextWindow: 131072,
          maxOutputTokens: 8192,
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'llama-3.1-8b-instant',
        displayName: 'Llama 3.1 8B Instant',
        pricing: {
          inputTokens: 0.05,
          outputTokens: 0.08
        },
        capabilities: {
          contextWindow: 131072,
          maxOutputTokens: 8192,
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'llama-3.2-90b-vision-preview',
        displayName: 'Llama 3.2 90B Vision',
        pricing: {
          inputTokens: 0.90,
          outputTokens: 0.90
        },
        capabilities: {
          contextWindow: 128000,
          maxOutputTokens: 8192,
          supportsVision: true,
          supportsTools: false,
          supportsStreaming: true
        }
      },
      {
        model: 'llama-3.2-11b-vision-preview',
        displayName: 'Llama 3.2 11B Vision',
        pricing: {
          inputTokens: 0.18,
          outputTokens: 0.18
        },
        capabilities: {
          contextWindow: 128000,
          maxOutputTokens: 8192,
          supportsVision: true,
          supportsTools: false,
          supportsStreaming: true
        }
      },
      {
        model: 'mixtral-8x7b-32768',
        displayName: 'Mixtral 8x7B',
        pricing: {
          inputTokens: 0.24,
          outputTokens: 0.24
        },
        capabilities: {
          contextWindow: 32768,
          maxOutputTokens: 32768,
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      // Note: gemma2-9b-it, llama-3.2-3b-preview, llama-3.2-1b-preview were deprecated
      // See: https://console.groq.com/docs/deprecations
      // These are now dynamically filtered via fetchPricing() when GROQ_API_KEY is set
    ]
  }
}

import { BasePricingFetcher } from './BasePricingFetcher.js'

/**
 * Mistral AI pricing fetcher
 * Fetches active models from Mistral's OpenAI-compatible API
 * Falls back to static pricing since Mistral doesn't expose pricing info via API
 *
 * API Reference: https://docs.mistral.ai/api/
 * Note: Requires MISTRAL_API_KEY environment variable
 */
export class MistralPricingFetcher extends BasePricingFetcher {
  constructor() {
    super('mistral')
    this.modelsEndpoint = 'https://api.mistral.ai/v1/models'
  }

  supportsPricingApi() {
    // We can fetch models dynamically if API key is available
    return !!process.env.MISTRAL_API_KEY
  }

  /**
   * Fetch active models from Mistral's API
   * Filters our default pricing to only include currently active models
   */
  async fetchPricing() {
    const apiKey = process.env.MISTRAL_API_KEY
    if (!apiKey) {
      console.warn('[MistralPricingFetcher] No API key available, using defaults')
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
        console.warn(`[MistralPricingFetcher] API request failed: ${response.status}`)
        return this.getDefaultPricing()
      }

      const data = await response.json()
      const activeModels = data.data?.map(m => m.id) || []
      console.log(`[MistralPricingFetcher] Fetched ${activeModels.length} models from Mistral API`)

      // Filter our default pricing to only include active models
      const defaultPricing = this.getDefaultPricing()
      const activePricing = defaultPricing.filter(p => activeModels.includes(p.model))

      // Log any models in our defaults that are no longer active
      const removedModels = defaultPricing.filter(p => !activeModels.includes(p.model))
      if (removedModels.length > 0) {
        console.warn(`[MistralPricingFetcher] Deprecated models filtered out: ${removedModels.map(m => m.model).join(', ')}`)
      }

      // Add new models discovered from API with estimated pricing
      const knownModels = new Set(defaultPricing.map(p => p.model))
      const newModels = activeModels.filter(m =>
        !knownModels.has(m) &&
        !m.includes('embed') &&
        !m.includes('moderation')
      )
      for (const modelId of newModels) {
        console.log(`[MistralPricingFetcher] New model discovered: ${modelId}`)
        activePricing.push({
          model: modelId,
          displayName: this.formatModelName(modelId),
          pricing: {
            inputTokens: 0.50, // Estimated default
            outputTokens: 1.50
          },
          capabilities: {
            contextWindow: 32000,
            supportsVision: modelId.includes('pixtral'),
            supportsTools: true,
            supportsStreaming: true
          }
        })
      }

      return activePricing
    } catch (error) {
      console.error('[MistralPricingFetcher] Error fetching from API:', error.message)
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
      .replace('Latest', '')
      .trim()
  }

  getDefaultPricing() {
    // Pricing as of February 2026 - https://mistral.ai/pricing / https://docs.mistral.ai/deployment/ai-studio/pricing
    return [
      {
        model: 'mistral-large-latest',
        displayName: 'Mistral Large',
        pricing: {
          inputTokens: 2.00,
          outputTokens: 6.00
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
        model: 'mistral-medium-latest',
        displayName: 'Mistral Medium 3',
        pricing: {
          inputTokens: 0.40,      // Updated: $0.40 per 1M input
          outputTokens: 2.00      // Updated: $2.00 per 1M output
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
        model: 'mistral-small-latest',
        displayName: 'Mistral Small 3',
        pricing: {
          inputTokens: 0.10,      // Updated: $0.10 per 1M input
          outputTokens: 0.30      // Updated: $0.30 per 1M output
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
        model: 'pixtral-large-latest',
        displayName: 'Pixtral Large',
        pricing: {
          inputTokens: 2.00,
          outputTokens: 6.00
        },
        capabilities: {
          contextWindow: 131072,
          maxOutputTokens: 8192,
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'codestral-latest',
        displayName: 'Codestral',
        pricing: {
          inputTokens: 0.30,      // Updated: $0.30 per 1M input
          outputTokens: 0.90      // Updated: $0.90 per 1M output
        },
        capabilities: {
          contextWindow: 256000,
          maxOutputTokens: 8192,
          supportsVision: false,
          supportsTools: false,
          supportsStreaming: true
        }
      },
      {
        model: 'open-mistral-nemo',
        displayName: 'Mistral Nemo',
        pricing: {
          inputTokens: 0.02,      // Updated: $0.02 per 1M input
          outputTokens: 0.04      // Updated: $0.04 per 1M output
        },
        capabilities: {
          contextWindow: 131072,
          maxOutputTokens: 8192,
          supportsVision: false,
          supportsTools: true,
          supportsStreaming: true
        }
      }
    ]
  }
}

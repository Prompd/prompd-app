import { BasePricingFetcher } from './BasePricingFetcher.js'

/**
 * Google (Gemini) pricing fetcher
 * Uses Google's models API to fetch available models when key is available
 *
 * API Reference: https://ai.google.dev/gemini-api/docs/models
 * Pricing: https://ai.google.dev/gemini-api/docs/pricing
 * Updated: February 2026
 */
export class GooglePricingFetcher extends BasePricingFetcher {
  constructor() {
    super('google')
  }

  supportsPricingApi() {
    return !!process.env.GOOGLE_API_KEY
  }

  /**
   * Fetch models from Google's Gemini API
   */
  async fetchPricing() {
    const apiKey = process.env.GOOGLE_API_KEY
    if (!apiKey) {
      console.warn('[GooglePricingFetcher] No API key available, using defaults')
      return this.getDefaultPricing()
    }

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        { headers: { 'Content-Type': 'application/json' } }
      )

      if (!response.ok) {
        console.warn(`[GooglePricingFetcher] API request failed: ${response.status}`)
        return this.getDefaultPricing()
      }

      const data = await response.json()
      const activeModels = (data.models || [])
        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        .map(m => m.name?.replace('models/', ''))
        .filter(Boolean)
      console.log(`[GooglePricingFetcher] Fetched ${activeModels.length} generative models from Google API`)

      // Filter our default pricing to only include active models
      const defaultPricing = this.getDefaultPricing()
      const activePricing = defaultPricing.filter(p => activeModels.includes(p.model))

      const removedModels = defaultPricing.filter(p => !activeModels.includes(p.model))
      if (removedModels.length > 0) {
        console.warn(`[GooglePricingFetcher] Deprecated models filtered out: ${removedModels.map(m => m.model).join(', ')}`)
      }

      return activePricing
    } catch (error) {
      console.error('[GooglePricingFetcher] Error fetching from API:', error.message)
      return this.getDefaultPricing()
    }
  }

  /**
   * Google: Gemini 2.0+ models support native image generation,
   * except "lite" variants which are text-only output.
   * Gemini 1.x models do not support image generation.
   */
  inferImageGenerationSupport(modelId) {
    if (modelId.includes('lite')) return false
    if (modelId.startsWith('gemini-2') || modelId.startsWith('gemini-3')) return true
    return false
  }

  getDefaultPricing() {
    // Pricing as of February 2026 - https://ai.google.dev/gemini-api/docs/pricing
    return [
      // --- Latest generation ---
      {
        model: 'gemini-3-pro-preview',
        displayName: 'Gemini 3 Pro (Preview)',
        pricing: {
          inputTokens: 2.00,       // $2.00 per 1M input
          outputTokens: 12.00      // $12.00 per 1M output
        },
        capabilities: {
          contextWindow: 1048576,
          maxOutputTokens: 65536,
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'gemini-3-flash-preview',
        displayName: 'Gemini 3 Flash (Preview)',
        pricing: {
          inputTokens: 0.15,       // Estimated (same tier as 2.5 Flash)
          outputTokens: 0.60
        },
        capabilities: {
          contextWindow: 1048576,
          maxOutputTokens: 65536,
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'gemini-2.5-pro',
        displayName: 'Gemini 2.5 Pro',
        pricing: {
          inputTokens: 1.25,       // $1.25 per 1M input
          outputTokens: 10.00      // $10.00 per 1M output
        },
        capabilities: {
          contextWindow: 1048576,
          maxOutputTokens: 65536,
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'gemini-2.5-flash',
        displayName: 'Gemini 2.5 Flash',
        pricing: {
          inputTokens: 0.15,       // $0.15 per 1M input
          outputTokens: 0.60       // $0.60 per 1M output
        },
        capabilities: {
          contextWindow: 1048576,
          maxOutputTokens: 65536,
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'gemini-2.5-flash-lite',
        displayName: 'Gemini 2.5 Flash Lite',
        pricing: {
          inputTokens: 0.10,       // $0.10 per 1M input
          outputTokens: 0.40       // $0.40 per 1M output
        },
        capabilities: {
          contextWindow: 1048576,
          maxOutputTokens: 65536,
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      // --- Legacy (deprecated March 2026) ---
      {
        model: 'gemini-2.0-flash',
        displayName: 'Gemini 2.0 Flash',
        pricing: {
          inputTokens: 0.10,
          outputTokens: 0.40
        },
        capabilities: {
          contextWindow: 1048576,
          maxOutputTokens: 8192,
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true
        }
      }
    ]
  }
}

import { BasePricingFetcher } from './BasePricingFetcher.js'

/**
 * Google (Gemini) pricing fetcher
 * Pricing as of November 2024
 */
export class GooglePricingFetcher extends BasePricingFetcher {
  constructor() {
    super('google')
  }

  supportsPricingApi() {
    return false
  }

  getDefaultPricing() {
    // Pricing as of December 2024 - https://ai.google.dev/pricing
    return [
      {
        model: 'gemini-2.0-flash',
        displayName: 'Gemini 2.0 Flash',
        pricing: {
          inputTokens: 0.10,      // $0.10 per 1M input
          outputTokens: 0.40      // $0.40 per 1M output
        },
        capabilities: {
          contextWindow: 1000000,
          maxOutputTokens: 8192,
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'gemini-2.0-flash-lite',
        displayName: 'Gemini 2.0 Flash Lite',
        pricing: {
          inputTokens: 0.075,     // $0.075 per 1M input
          outputTokens: 0.30      // $0.30 per 1M output
        },
        capabilities: {
          contextWindow: 1000000,
          maxOutputTokens: 8192,
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'gemini-2.5-flash',
        displayName: 'Gemini 2.5 Flash',
        pricing: {
          inputTokens: 0.15,      // $0.15 per 1M input
          outputTokens: 0.60      // $0.60 per 1M output
        },
        capabilities: {
          contextWindow: 1000000,
          maxOutputTokens: 8192,
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'gemini-2.5-pro',
        displayName: 'Gemini 2.5 Pro',
        pricing: {
          inputTokens: 1.25,      // $1.25 per 1M input
          outputTokens: 5.00      // $5.00 per 1M output
        },
        capabilities: {
          contextWindow: 1000000,
          maxOutputTokens: 8192,
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'gemini-2.0-flash-exp',
        displayName: 'Gemini 2.0 Flash (Exp)',
        pricing: {
          inputTokens: 0.00,      // Free during preview
          outputTokens: 0.00
        },
        capabilities: {
          contextWindow: 1000000,
          maxOutputTokens: 8192,
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true
        }
      }
    ]
  }
}

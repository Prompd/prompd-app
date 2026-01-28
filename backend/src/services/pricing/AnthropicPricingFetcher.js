import { BasePricingFetcher } from './BasePricingFetcher.js'

/**
 * Anthropic pricing fetcher
 * Anthropic doesn't have a pricing API, so we use default values
 * Pricing as of November 2024
 */
export class AnthropicPricingFetcher extends BasePricingFetcher {
  constructor() {
    super('anthropic')
  }

  supportsPricingApi() {
    return false
  }

  getDefaultPricing() {
    return [
      {
        model: 'claude-sonnet-4-20250514',
        displayName: 'Claude Sonnet 4',
        pricing: {
          inputTokens: 3.00,      // $3.00 per 1M input tokens
          outputTokens: 15.00     // $15.00 per 1M output tokens
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
        model: 'claude-3-5-sonnet-20241022',
        displayName: 'Claude 3.5 Sonnet',
        pricing: {
          inputTokens: 3.00,
          outputTokens: 15.00
        },
        capabilities: {
          contextWindow: 200000,
          maxOutputTokens: 8192,
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'claude-3-5-haiku-20241022',
        displayName: 'Claude 3.5 Haiku',
        pricing: {
          inputTokens: 0.80,
          outputTokens: 4.00
        },
        capabilities: {
          contextWindow: 200000,
          maxOutputTokens: 8192,
          supportsVision: true,
          supportsTools: true,
          supportsStreaming: true
        }
      },
      {
        model: 'claude-3-opus-20240229',
        displayName: 'Claude 3 Opus',
        pricing: {
          inputTokens: 15.00,
          outputTokens: 75.00
        },
        capabilities: {
          contextWindow: 200000,
          maxOutputTokens: 4096,
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
          outputTokens: 1.25
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

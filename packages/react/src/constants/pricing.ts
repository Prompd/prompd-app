/**
 * LLM Model Pricing Constants - Updated November 2025
 * Prices are per million tokens (input/output)
 */

export interface ModelPricing {
  inputPerMillion: number   // USD per million input tokens
  outputPerMillion: number  // USD per million output tokens
}

export interface ModelPricingEntry extends ModelPricing {
  name: string
  provider: string
  tier: 'cheap' | 'standard' | 'premium' | 'flagship'
}

/**
 * Model pricing lookup - prices in USD per million tokens
 * Updated November 2025
 */
export const MODEL_PRICING: Record<string, ModelPricingEntry> = {
  // OpenAI Models
  'gpt-4.1-nano': {
    name: 'GPT-4.1 Nano',
    provider: 'openai',
    tier: 'cheap',
    inputPerMillion: 0.10,
    outputPerMillion: 0.40
  },
  'gpt-4.1-mini': {
    name: 'GPT-4.1 Mini',
    provider: 'openai',
    tier: 'standard',
    inputPerMillion: 0.40,
    outputPerMillion: 1.60
  },
  'gpt-4.1': {
    name: 'GPT-4.1',
    provider: 'openai',
    tier: 'premium',
    inputPerMillion: 2.00,
    outputPerMillion: 8.00
  },
  'gpt-4o-mini': {
    name: 'GPT-4o Mini',
    provider: 'openai',
    tier: 'cheap',
    inputPerMillion: 0.15,
    outputPerMillion: 0.60
  },
  'gpt-4o': {
    name: 'GPT-4o',
    provider: 'openai',
    tier: 'premium',
    inputPerMillion: 2.50,
    outputPerMillion: 10.00
  },
  'o3-mini': {
    name: 'O3 Mini',
    provider: 'openai',
    tier: 'standard',
    inputPerMillion: 1.10,
    outputPerMillion: 4.40
  },

  // Anthropic Models
  'claude-haiku-4-5-20251015': {
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    tier: 'cheap',
    inputPerMillion: 1.00,
    outputPerMillion: 5.00
  },
  'claude-sonnet-4-5-20250929': {
    name: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    tier: 'standard',
    inputPerMillion: 3.00,
    outputPerMillion: 15.00
  },
  'claude-sonnet-4-20250514': {
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    tier: 'standard',
    inputPerMillion: 3.00,
    outputPerMillion: 15.00
  },
  'claude-opus-4-5-20251101': {
    name: 'Claude Opus 4.5',
    provider: 'anthropic',
    tier: 'flagship',
    inputPerMillion: 15.00,
    outputPerMillion: 75.00
  },
  'claude-opus-4-20250514': {
    name: 'Claude Opus 4',
    provider: 'anthropic',
    tier: 'flagship',
    inputPerMillion: 15.00,
    outputPerMillion: 75.00
  }
}

/**
 * Get pricing for a model
 */
export function getModelPricing(model: string): ModelPricingEntry | null {
  return MODEL_PRICING[model] || null
}

/**
 * Calculate cost for a given usage
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = MODEL_PRICING[model]
  if (!pricing) return 0

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion

  return inputCost + outputCost
}

/**
 * Format cost for display
 */
export function formatCost(cost: number): string {
  if (cost === 0) return 'Free'
  if (cost < 0.0001) return '< $0.0001'
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  if (cost < 1) return `$${cost.toFixed(3)}`
  return `$${cost.toFixed(2)}`
}

/**
 * Format token count for display
 */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return tokens.toString()
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}K`
  return `${(tokens / 1_000_000).toFixed(2)}M`
}
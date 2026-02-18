/**
 * Context Window Resolver
 *
 * Resolves the context window size for a given provider/model combination.
 * Checks dynamic provider data (from API/uiStore) first, falls back to
 * KNOWN_PROVIDERS static data, then to a conservative default.
 */

import { KNOWN_PROVIDERS } from './providers/types'
import type { ProviderWithPricing } from '../../stores/uiStore'

/** Conservative fallback when no context window data is available */
const DEFAULT_CONTEXT_WINDOW = 128000

/**
 * Resolve context window size for the current provider/model.
 *
 * @param provider - Provider ID (e.g., 'anthropic', 'openai')
 * @param model    - Model ID (e.g., 'claude-3-5-sonnet-20241022')
 * @param configuredProviders - Dynamic provider data from uiStore (optional)
 * @returns Context window size in tokens
 */
export function resolveContextWindowSize(
  provider: string,
  model: string,
  configuredProviders?: ProviderWithPricing[] | null
): number {
  // 1. Check dynamic provider data (from API / uiStore)
  if (configuredProviders) {
    const providerEntry = configuredProviders.find(p => p.providerId === provider)
    if (providerEntry) {
      const modelEntry = providerEntry.models.find(m => m.model === model)
      if (modelEntry?.contextWindow) {
        return modelEntry.contextWindow
      }
    }
  }

  // 2. Check KNOWN_PROVIDERS static data
  const knownProvider = KNOWN_PROVIDERS[provider]
  if (knownProvider) {
    const knownModel = knownProvider.models.find(m => m.id === model)
    if (knownModel?.contextWindow) {
      return knownModel.contextWindow
    }
  }

  // 3. Fallback
  return DEFAULT_CONTEXT_WINDOW
}

/**
 * Format a context window size for display.
 * @example formatContextWindow(200000) => "200K"
 * @example formatContextWindow(2097152) => "2.1M"
 */
export function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000
    return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`
  }
  return `${Math.round(tokens / 1000)}K`
}

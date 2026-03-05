/**
 * Context Window Resolver
 *
 * Resolves the context window size for a given provider/model combination.
 * Checks dynamic provider data (from API/uiStore) first, falls back to
 * KNOWN_PROVIDERS static data, then to a conservative default.
 *
 * Also provides `resolveEffectiveContextWindow` which caps the context
 * window at a practical limit for compaction and UI display. Even models
 * with 1M+ token windows see degraded response quality at extreme lengths,
 * and showing "1% of 1M" is not useful to users.
 */

import { KNOWN_PROVIDERS } from './providers/types'
import type { ProviderWithPricing } from '../../stores/uiStore'

/** Conservative fallback when no context window data is available */
const DEFAULT_CONTEXT_WINDOW = 128000

/**
 * Maximum effective context window for compaction and UI display.
 * Models with 1M+ token windows technically support huge contexts, but
 * response quality degrades and compaction would never trigger.
 * Cap at 128K to keep compaction and the % display meaningful.
 */
const MAX_EFFECTIVE_CONTEXT_WINDOW = 128000

/**
 * Resolve the raw context window size for the current provider/model.
 * Returns the actual model limit without any capping.
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
 * Resolve an effective context window capped at a practical limit.
 * Used for compaction thresholds and UI percentage display.
 *
 * Models like GPT-4.1 Nano (1M tokens) or Gemini (2M tokens) have massive
 * windows that make percentage-based compaction useless — the 75% threshold
 * would require 750K+ tokens. This function caps at 128K so compaction
 * triggers at a reasonable conversation length.
 */
export function resolveEffectiveContextWindow(
  provider: string,
  model: string,
  configuredProviders?: ProviderWithPricing[] | null
): number {
  const raw = resolveContextWindowSize(provider, model, configuredProviders)
  return Math.min(raw, MAX_EFFECTIVE_CONTEXT_WINDOW)
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

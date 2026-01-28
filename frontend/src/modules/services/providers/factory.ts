/**
 * Provider Factory
 *
 * Creates provider instances based on provider name.
 * Supports both known providers and custom OpenAI-compatible endpoints.
 */

import type { IExecutionProvider, ProviderEntry } from './types'
import { KNOWN_PROVIDERS } from './types'
import {
  OpenAICompatibleProvider,
  AnthropicProvider,
  GoogleGeminiProvider,
  CohereProvider
} from './base'

/**
 * Custom provider configuration for user-defined providers
 */
export interface CustomProviderOptions {
  name: string
  displayName: string
  baseUrl: string
  models?: string[]
}

/**
 * Create a provider instance by name
 *
 * @param providerName - The provider identifier (e.g., 'openai', 'anthropic')
 * @param customConfig - Optional custom provider configuration
 * @returns An IExecutionProvider instance
 */
export function createProvider(
  providerName: string,
  customConfig?: CustomProviderOptions
): IExecutionProvider {
  // Check for custom provider config
  if (customConfig) {
    const config: ProviderEntry = {
      name: customConfig.name,
      displayName: customConfig.displayName,
      baseUrl: customConfig.baseUrl,
      isOpenAICompatible: true,
      models: (customConfig.models || []).map(m => ({ id: m, name: m }))
    }
    return new OpenAICompatibleProvider(config, customConfig.baseUrl)
  }

  // Look up known provider
  const knownConfig = KNOWN_PROVIDERS[providerName.toLowerCase()]
  if (!knownConfig) {
    throw new Error(`Unknown provider: ${providerName}. Available: ${Object.keys(KNOWN_PROVIDERS).join(', ')}`)
  }

  // Create appropriate provider instance based on type
  switch (providerName.toLowerCase()) {
    case 'anthropic':
      return new AnthropicProvider(knownConfig)

    case 'google':
      return new GoogleGeminiProvider(knownConfig)

    case 'cohere':
      return new CohereProvider(knownConfig)

    // All OpenAI-compatible providers
    case 'openai':
    case 'groq':
    case 'mistral':
    case 'together':
    case 'perplexity':
    case 'deepseek':
    case 'ollama':
      return new OpenAICompatibleProvider(knownConfig)

    default:
      // Fallback: if isOpenAICompatible, use that provider
      if (knownConfig.isOpenAICompatible) {
        return new OpenAICompatibleProvider(knownConfig)
      }
      throw new Error(`No provider implementation for: ${providerName}`)
  }
}

/**
 * Get provider configuration by name
 */
export function getProviderConfig(providerName: string): ProviderEntry | undefined {
  return KNOWN_PROVIDERS[providerName.toLowerCase()]
}

/**
 * List all known provider names
 */
export function listKnownProviders(): string[] {
  return Object.keys(KNOWN_PROVIDERS)
}

/**
 * Check if a provider is known
 */
export function isKnownProvider(providerName: string): boolean {
  return providerName.toLowerCase() in KNOWN_PROVIDERS
}

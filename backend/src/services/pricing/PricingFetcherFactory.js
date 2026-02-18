import { OpenAIPricingFetcher } from './OpenAIPricingFetcher.js'
import { AnthropicPricingFetcher } from './AnthropicPricingFetcher.js'
import { GroqPricingFetcher } from './GroqPricingFetcher.js'
import { GooglePricingFetcher } from './GooglePricingFetcher.js'
import { MistralPricingFetcher } from './MistralPricingFetcher.js'
import {
  CoherePricingFetcher,
  TogetherPricingFetcher,
  PerplexityPricingFetcher,
  DeepSeekPricingFetcher
} from './OtherProvidersFetcher.js'

/**
 * Factory for getting provider-specific pricing fetchers
 */
class PricingFetcherFactory {
  constructor() {
    // Map of provider ID to fetcher class
    this.fetchers = new Map([
      ['openai', OpenAIPricingFetcher],
      ['anthropic', AnthropicPricingFetcher],
      ['groq', GroqPricingFetcher],
      ['google', GooglePricingFetcher],
      ['mistral', MistralPricingFetcher],
      ['cohere', CoherePricingFetcher],
      ['together', TogetherPricingFetcher],
      ['perplexity', PerplexityPricingFetcher],
      ['deepseek', DeepSeekPricingFetcher]
    ])

    // Cache fetcher instances
    this.instances = new Map()
  }

  /**
   * Get fetcher for a specific provider
   * @param {string} provider - Provider identifier
   * @returns {BasePricingFetcher|null}
   */
  getFetcher(provider) {
    const providerLower = provider.toLowerCase()

    // Return cached instance if exists
    if (this.instances.has(providerLower)) {
      return this.instances.get(providerLower)
    }

    // Get fetcher class
    const FetcherClass = this.fetchers.get(providerLower)
    if (!FetcherClass) {
      return null
    }

    // Create and cache instance
    const instance = new FetcherClass()
    this.instances.set(providerLower, instance)
    return instance
  }

  /**
   * Get list of all supported providers
   * @returns {string[]}
   */
  getSupportedProviders() {
    return Array.from(this.fetchers.keys())
  }

  /**
   * Check if a provider is supported
   * @param {string} provider
   * @returns {boolean}
   */
  isProviderSupported(provider) {
    return this.fetchers.has(provider.toLowerCase())
  }

  /**
   * Register a custom fetcher for a provider
   * @param {string} provider
   * @param {typeof BasePricingFetcher} FetcherClass
   */
  registerFetcher(provider, FetcherClass) {
    const providerLower = provider.toLowerCase()
    this.fetchers.set(providerLower, FetcherClass)
    // Clear cached instance if exists
    this.instances.delete(providerLower)
  }

  /**
   * Get all fetchers (for seeding all providers)
   * @returns {Map<string, BasePricingFetcher>}
   */
  getAllFetchers() {
    const result = new Map()
    for (const provider of this.fetchers.keys()) {
      result.set(provider, this.getFetcher(provider))
    }
    return result
  }
}

// Export singleton instance
export const pricingFetcherFactory = new PricingFetcherFactory()

// Also export class for testing
export { PricingFetcherFactory }

/**
 * Base class for provider-specific pricing fetchers
 * Each provider implements their own fetcher extending this class
 */

export class BasePricingFetcher {
  constructor(provider) {
    this.provider = provider
  }

  /**
   * Get provider identifier
   */
  getProvider() {
    return this.provider
  }

  /**
   * Fetch current pricing from the provider
   * Must be implemented by subclasses
   * @returns {Promise<Array<{model: string, displayName: string, pricing: {inputTokens: number, outputTokens: number}, capabilities: object}>>}
   */
  async fetchPricing() {
    throw new Error('fetchPricing() must be implemented by subclass')
  }

  /**
   * Get default/fallback pricing data
   * Used when API fetch fails or is unavailable
   * Must be implemented by subclasses
   * @returns {Array<{model: string, displayName: string, pricing: {inputTokens: number, outputTokens: number}, capabilities: object}>}
   */
  getDefaultPricing() {
    throw new Error('getDefaultPricing() must be implemented by subclass')
  }

  /**
   * Whether this provider supports fetching pricing via API
   * Most providers don't have a pricing API, so we use defaults
   */
  supportsPricingApi() {
    return false
  }

  /**
   * Validate pricing data structure
   */
  validatePricingData(data) {
    if (!Array.isArray(data)) {
      throw new Error('Pricing data must be an array')
    }

    for (const item of data) {
      if (!item.model || typeof item.model !== 'string') {
        throw new Error('Each pricing item must have a model string')
      }
      if (!item.pricing || typeof item.pricing.inputTokens !== 'number' || typeof item.pricing.outputTokens !== 'number') {
        throw new Error(`Invalid pricing for model ${item.model}`)
      }
    }

    return true
  }

  /**
   * Get pricing - tries API first, falls back to defaults
   */
  async getPricing() {
    if (this.supportsPricingApi()) {
      try {
        const apiPricing = await this.fetchPricing()
        this.validatePricingData(apiPricing)
        console.log(`[${this.provider}] Fetched ${apiPricing.length} models from API`)
        return {
          source: 'api',
          data: apiPricing
        }
      } catch (error) {
        console.warn(`[${this.provider}] API fetch failed: ${error.message}. Using defaults.`)
      }
    }

    const defaults = this.getDefaultPricing()
    this.validatePricingData(defaults)
    console.log(`[${this.provider}] Using ${defaults.length} models from defaults`)
    return {
      source: 'seed',
      data: defaults
    }
  }
}

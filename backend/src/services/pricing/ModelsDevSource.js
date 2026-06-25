/**
 * models.dev live catalog source.
 *
 * models.dev publishes a single api.json with up-to-date pricing, context
 * limits, and capability flags for models across every provider. We fetch it
 * once (cached ~24h, stale-on-error) and overlay its values onto each provider
 * fetcher's data in BasePricingFetcher.getPricing(). Provider seeds remain the
 * fallback for any model models.dev doesn't list; OpenAI's /v1/models still
 * gates which models are actually available.
 *
 * Disable with MODELS_DEV_DISABLED=1.
 */

const CATALOG_URL = 'https://models.dev/api.json'
const TTL_MS = 24 * 60 * 60 * 1000

// Our provider id -> models.dev provider key (most are identical).
const PROVIDER_ALIAS = {
  together: 'togetherai'
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** Map a models.dev model entry to our fetcher shape (overlay fragment). */
function mapEntry(e) {
  const pricing = {}
  if (num(e?.cost?.input) !== undefined) pricing.inputTokens = e.cost.input
  if (num(e?.cost?.output) !== undefined) pricing.outputTokens = e.cost.output
  if (num(e?.cost?.cache_read) !== undefined) pricing.cachedInputTokens = e.cost.cache_read

  const capabilities = {}
  if (num(e?.limit?.context) !== undefined) capabilities.contextWindow = e.limit.context
  if (num(e?.limit?.output) !== undefined) capabilities.maxOutputTokens = e.limit.output
  if (Array.isArray(e?.modalities?.input)) capabilities.supportsVision = e.modalities.input.includes('image')
  if (typeof e?.tool_call === 'boolean') capabilities.supportsTools = e.tool_call
  if (typeof e?.reasoning === 'boolean') capabilities.supportsReasoning = e.reasoning
  capabilities.supportsStreaming = true

  return { displayName: e?.name, pricing, capabilities }
}

class ModelsDevSource {
  constructor() {
    this.catalog = null
    this.fetchedAt = 0
    this.loading = null
  }

  enabled() {
    return process.env.MODELS_DEV_DISABLED !== '1'
  }

  /** Load (and cache) the catalog. Returns null on failure with no prior cache. */
  async load() {
    if (!this.enabled()) return null
    const fresh = this.catalog && Date.now() - this.fetchedAt < TTL_MS
    if (fresh) return this.catalog
    if (this.loading) return this.loading

    this.loading = (async () => {
      try {
        const res = await fetch(CATALOG_URL, { headers: { Accept: 'application/json' } })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        this.catalog = json
        this.fetchedAt = Date.now()
        console.log(`[models.dev] catalog loaded (${Object.keys(json).length} providers)`)
        return json
      } catch (error) {
        console.warn(`[models.dev] catalog fetch failed: ${error.message}.` + (this.catalog ? ' Using stale cache.' : ' No overlay applied.'))
        return this.catalog // stale (or null)
      } finally {
        this.loading = null
      }
    })()
    return this.loading
  }

  /**
   * Overlay live pricing/capabilities onto a fetcher's model list, in place.
   * Only fields models.dev provides are written, so provider seeds remain the
   * fallback. Never throws — pricing must still resolve if models.dev is down.
   */
  async overlay(provider, models) {
    try {
      const catalog = await this.load()
      if (!catalog) return models
      const key = PROVIDER_ALIAS[provider] || provider
      const prov = catalog[key]
      if (!prov || !prov.models) return models

      let hits = 0
      for (const m of models) {
        const entry = prov.models[m.model]
        if (!entry) continue
        const o = mapEntry(entry)
        m.pricing = m.pricing || {}
        if (o.pricing.inputTokens !== undefined) m.pricing.inputTokens = o.pricing.inputTokens
        if (o.pricing.outputTokens !== undefined) m.pricing.outputTokens = o.pricing.outputTokens
        if (o.pricing.cachedInputTokens !== undefined) m.pricing.cachedInputTokens = o.pricing.cachedInputTokens
        m.capabilities = { ...(m.capabilities || {}), ...o.capabilities }
        if (!m.displayName && o.displayName) m.displayName = o.displayName
        hits++
      }
      if (hits) console.log(`[models.dev] overlaid ${hits}/${models.length} ${provider} models`)
      return models
    } catch (error) {
      console.warn(`[models.dev] overlay error for ${provider}: ${error.message}`)
      return models
    }
  }

  /**
   * The full model list models.dev publishes for a provider, mapped to our
   * fetcher shape. Filtered to billable text/chat models (has input pricing and
   * accepts text input) so embeddings / image- or audio-only models don't leak
   * in. Returns [] when models.dev is unavailable or lists nothing for the
   * provider — callers union this onto their seed/API list as the dynamic source
   * of new models (gpt-5, future releases) without re-seeding.
   */
  async listForProvider(provider) {
    try {
      const catalog = await this.load()
      if (!catalog) return []
      const key = PROVIDER_ALIAS[provider] || provider
      const prov = catalog[key]
      if (!prov || !prov.models) return []
      const out = []
      for (const [id, entry] of Object.entries(prov.models)) {
        if (num(entry?.cost?.input) === undefined) continue // not a billable text model
        const inputs = entry?.modalities?.input
        if (Array.isArray(inputs) && !inputs.includes('text')) continue // image/audio-only
        const mapped = mapEntry(entry)
        out.push({
          model: id,
          displayName: mapped.displayName || id,
          pricing: mapped.pricing,
          capabilities: mapped.capabilities,
        })
      }
      return out
    } catch (error) {
      console.warn(`[models.dev] listForProvider error for ${provider}: ${error.message}`)
      return []
    }
  }
}

export const modelsDevSource = new ModelsDevSource()
export { ModelsDevSource }

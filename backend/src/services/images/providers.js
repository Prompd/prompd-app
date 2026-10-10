/**
 * The image providers this API forwards to, and the one function that turns a
 * request body into something safe to forward. Pure (no I/O), so every rule
 * here is unit-tested without a server, a key or a network.
 *
 * The allowlists are INPUT VALIDATION at the route boundary: the caller's
 * strings reach a paid provider endpoint, and an arbitrary string there is an
 * unbounded surface whoever's key pays for it. Anything unknown is replaced by
 * the default, never forwarded.
 */
import { openaiProvider } from './openai.js'
import { googleProvider } from './google.js'
import { DEFAULT_SHAPE, DEFAULT_QUALITY, sizeToShape } from './catalog.js'

export const PROVIDERS = [openaiProvider, googleProvider]
const DEFAULT_PROVIDER = 'openai'

export function findProvider(id) {
  return PROVIDERS.find((p) => p.id === id) ?? null
}

export function defaultModel(provider) {
  return provider.models.find((m) => m.default) ?? provider.models[0]
}

const bad = (message) => ({ error: { status: 400, body: { error: { message, type: 'invalid_request_error' } } } })

export function resolveImageRequest(body) {
  const b = body || {}
  const prompt = typeof b.prompt === 'string' ? b.prompt.trim() : ''
  if (!prompt) return bad('prompt is required')
  const provider = findProvider(b.provider) ?? findProvider(DEFAULT_PROVIDER)
  const spec = provider.models.find((m) => m.id === b.model) ?? defaultModel(provider)
  if (prompt.length > spec.maxPrompt) return bad(`prompt too long (max ${spec.maxPrompt} chars)`)
  const shapeKeys = Object.keys(spec.shapes)
  let shape = DEFAULT_SHAPE
  if (shapeKeys.includes(b.shape)) shape = b.shape
  else if (b.shape === undefined && b.size !== undefined) shape = sizeToShape(b.size, shapeKeys)
  const quality = spec.qualities.includes(b.quality) ? b.quality : DEFAULT_QUALITY
  const n = Math.min(Math.max(parseInt(b.n, 10) || 1, 1), spec.maxN)
  return { request: { provider: provider.id, model: spec.id, prompt, shape, quality, n } }
}

function publicModel(m, price) {
  return {
    id: m.id,
    label: m.label,
    description: m.description,
    shapes: Object.keys(m.shapes),
    qualities: [...m.qualities],
    maxPrompt: m.maxPrompt,
    maxN: m.maxN,
    default: Boolean(m.default),
    price,
  }
}

/** Every provider's models, each provider marked available when `hasKey(id)`.
 * `priceOf(provider, model)` gives the list price in USD per 1M tokens
 * (`{ input, output }`) or null when none is published; null is never shown
 * as free. The web caches the list for the session. */
export function listImageModels(hasKey, priceOf = () => null) {
  return {
    providers: PROVIDERS.map((p) => {
      const available = Boolean(hasKey(p.id))
      return {
        id: p.id,
        label: p.label,
        available,
        ...(available ? {} : { reason: `Add a ${p.label} key in provider settings.` }),
        models: p.models.map((m) => publicModel(m, priceOf(p.id, m.id) ?? null)),
      }
    }),
  }
}

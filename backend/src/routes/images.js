/**
 * Image generation gateway, every provider behind one route.
 *
 *   POST /api/v1/images/generations   (Clerk Bearer)
 *     body: { prompt, provider?, model?, shape?, quality?, n?, size? }
 *     -> { data: [{ b64_json, mime }], provider, model, usage? }
 *        usage: { input_tokens, output_tokens } when the provider reports it
 *   GET  /api/v1/images/models        (Clerk Bearer)
 *     -> { providers: [{ id, label, available, reason?, models: [...] }] }
 *        each model's `price` is models.dev's { input, output } USD per 1M
 *        tokens, or null when it lists none
 *
 * BYOK: there is no server-key path, for any provider. Every image is billed
 * to the caller's own key for the provider they chose (402 otherwise).
 * History: the route began in 44d017c; see git log for later changes.
 *
 * The rules (allowlists, defaults, the old `size` mapping) live in
 * services/images/providers.js, which is pure and tested there. This file is
 * the I/O: the key lookup, the provider call, and the reply.
 */
import express from 'express'
import { clerkAuth } from '../middleware/clerkAuth.js'
import { getProviderKey } from '../services/userOpenAiKey.js'
import { redactSecrets } from '../utils/redactSecrets.js'
import { resolveImageRequest, findProvider, listImageModels } from '../services/images/providers.js'
import { modelsDevSource } from '../services/pricing/ModelsDevSource.js'

/** The whole response for one generation request, as data. `getKey(id)`
 * returns the user's key for a provider or null. Exported for tests. */
export async function generateResponse(body, getKey, opts = {}) {
  const resolved = resolveImageRequest(body)
  if (resolved.error) return { status: resolved.error.status, json: resolved.error.body }
  const req = resolved.request
  const provider = findProvider(req.provider)

  const key = getKey(provider.id)
  if (!key) {
    return {
      status: 402,
      json: {
        error: {
          message: `Image generation with ${provider.label} requires your own ${provider.label} API key. Add one in provider settings.`,
          type: 'no_api_key',
          code: 'NO_API_KEY',
          provider: provider.id,
          can_add_api_key: true,
        },
      },
    }
  }

  const out = await provider.generate(req, key, opts)
  if (!out.ok) {
    /* A relayed ERROR body can quote the key back, so it is redacted. The
     * success body is never touched: redacting base64 would corrupt it. */
    if (typeof out.body === 'string') return { status: out.status, text: redactSecrets(out.body), contentType: out.contentType }
    return { status: out.status, json: { error: { message: redactSecrets(out.message), type: 'upstream_error' } } }
  }
  if (out.images.length === 0) return { status: 502, json: { error: { message: `${provider.label} returned no image.`, type: 'upstream_error' } } }
  return {
    status: 200,
    json: {
      data: out.images.map((i) => ({ b64_json: i.b64, mime: i.mime })),
      provider: provider.id,
      model: req.model,
      ...(out.usage ? { usage: { input_tokens: out.usage.input, output_tokens: out.usage.output } } : {}),
    },
  }
}

/** The model list for one user: availability and list price; never a key. */
export function modelsResponse(getKey, priceOf = () => null) {
  return listImageModels((id) => getKey(id) !== null, priceOf)
}

const router = express.Router()

router.post('/', clerkAuth, async (req, res) => {
  const out = await generateResponse(req.body, (id) => getProviderKey(req.user, id))
  res.status(out.status)
  if (out.text !== undefined) {
    res.setHeader('Content-Type', out.contentType || 'application/json')
    return res.send(out.text)
  }
  return res.json(out.json)
})

export const modelsRouter = express.Router()
modelsRouter.get('/', clerkAuth, async (req, res) => {
  /* load() is cached for a day and never throws. It has no timeout of its own,
   * so a slow models.dev is given 3s; after that, or when it is down with
   * nothing cached, every price is null and the list still answers. */
  await Promise.race([modelsDevSource.load(), new Promise((resolve) => setTimeout(resolve, 3000).unref())])
  res.json(modelsResponse((id) => getProviderKey(req.user, id), (p, m) => modelsDevSource.priceOf(p, m)))
})

export default router

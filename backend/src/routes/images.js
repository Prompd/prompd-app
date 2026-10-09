/**
 * OpenAI image-generation gateway.
 *
 * The web has no client-side provider access (CORS/keys), so image generation — which
 * desktop did client-side via the Responses API — runs through this endpoint:
 * Clerk auth -> the user's own OpenAI key -> OpenAI's Images API -> base64 back.
 *
 *   POST /api/v1/images/generations   (Clerk Bearer)
 *     body: { prompt, model?, size?, quality?, n? }
 *     -> OpenAI { data: [{ b64_json }], ... } forwarded as-is
 *
 * Image generation is EXPENSIVE, so unlike the chat gateway there is NO free
 * server-key path — an own OpenAI key is required (402 otherwise). The client builds
 * a `data:image/png;base64,<b64_json>` URL from the result.
 */
import express from 'express'
import { clerkAuth } from '../middleware/clerkAuth.js'
import { getOpenAIKey } from '../services/userOpenAiKey.js'
import { redactSecrets } from '../utils/redactSecrets.js'

const router = express.Router()

const OPENAI_IMAGES_URL = 'https://api.openai.com/v1/images/generations'
/* The models this route forwards to, and what each accepts. OpenAI's
 * deprecations page (checked 2026-10-08): dall-e-2 and dall-e-3 retired on
 * 2026-05-12; gpt-image-1 shuts down 2026-10-23; gpt-image-1-mini and
 * gpt-image-1.5 on 2026-12-01, all with gpt-image-2.5-flare or
 * gpt-image-2.5-sunburst as the replacement. gpt-image-2 is current.
 * A retired or unknown model name falls back to the default rather than
 * being forwarded. Every model here returns base64 and rejects
 * response_format, so none is sent. */
const DEFAULT_MODEL = 'gpt-image-2.5-flare'
const QUALITY_25 = new Set(['auto', 'low', 'medium', 'high', 'xhigh', 'max'])
const MODELS = new Map([
  // Fast, high-quality everyday generation: the default.
  ['gpt-image-2.5-flare', { qualities: QUALITY_25, customSizes: true }],
  // The larger 2.5 model: detail and editing precision.
  ['gpt-image-2.5-sunburst', { qualities: QUALITY_25, customSizes: true }],
  ['gpt-image-2', { qualities: new Set(['auto', 'low', 'medium', 'high']), customSizes: false }],
])
// Square, landscape, portrait: accepted by every model above.
const STANDARD_SIZES = new Set(['auto', '1024x1024', '1536x1024', '1024x1536'])
const DEFAULT_SIZE = '1024x1024'
const MAX_PROMPT = 4000
const MAX_N = 4

/* OpenAI's custom-size rules for the 2.5 models (image generation guide):
 * both edges multiples of 16, aspect ratio within 1:3..3:1, neither edge over
 * 3840, total pixels 655,360..8,294,400. Checked here so a size that cannot
 * work is replaced by the default instead of billed and refused upstream. */
export function isValidCustomSize(size) {
  const m = /^(\d{2,4})x(\d{2,4})$/.exec(typeof size === 'string' ? size : '')
  if (!m) return false
  const w = Number(m[1])
  const h = Number(m[2])
  if (w % 16 !== 0 || h % 16 !== 0) return false
  if (w > 3840 || h > 3840) return false
  if (w > 3 * h || h > 3 * w) return false
  const px = w * h
  return px >= 655360 && px <= 8294400
}

/**
 * Validate + normalize the request into the OpenAI Images API body. Pure (no I/O) so
 * it's unit-testable. Returns { error: { status, body } } on a bad request, else
 * { upstreamBody }.
 */
export function buildImageRequest(body) {
  const b = body || {}
  const prompt = typeof b.prompt === 'string' ? b.prompt.trim() : ''
  if (!prompt) {
    return { error: { status: 400, body: { error: { message: 'prompt is required', type: 'invalid_request_error' } } } }
  }
  if (prompt.length > MAX_PROMPT) {
    return { error: { status: 400, body: { error: { message: `prompt too long (max ${MAX_PROMPT} chars)`, type: 'invalid_request_error' } } } }
  }
  const model = MODELS.has(b.model) ? b.model : DEFAULT_MODEL
  const spec = MODELS.get(model)
  const size = STANDARD_SIZES.has(b.size) || (spec.customSizes && isValidCustomSize(b.size)) ? b.size : DEFAULT_SIZE
  const n = Math.min(Math.max(parseInt(b.n, 10) || 1, 1), MAX_N)
  const upstreamBody = { model, prompt, size, n }
  // A quality this model takes is forwarded; anything else is left to the
  // provider's default (auto) rather than refused upstream.
  if (typeof b.quality === 'string' && spec.qualities.has(b.quality)) upstreamBody.quality = b.quality
  return { upstreamBody }
}

router.post('/', clerkAuth, async (req, res) => {
  const built = buildImageRequest(req.body)
  if (built.error) return res.status(built.error.status).json(built.error.body)
  const { upstreamBody } = built

  // No free server-key path for images (cost). Own OpenAI key required.
  const apiKey = getOpenAIKey(req.user)
  if (!apiKey) {
    return res.status(402).json({
      error: {
        message: 'Image generation requires your own OpenAI API key. Add one in provider settings.',
        type: 'no_api_key',
        code: 'NO_API_KEY',
        can_add_api_key: true,
      },
    })
  }

  let upstream
  try {
    upstream = await fetch(OPENAI_IMAGES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(upstreamBody),
    })
  } catch (error) {
    return res.status(502).json({ error: { message: `Upstream request failed: ${redactSecrets(error.message)}`, type: 'upstream_error' } })
  }

  // A relayed ERROR body can quote the key back (see utils/redactSecrets).
  const text = upstream.ok ? await upstream.text() : redactSecrets(await upstream.text())
  res.status(upstream.status)
  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
  return res.send(text)
})

export default router

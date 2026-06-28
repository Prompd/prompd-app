/**
 * OpenAI image-generation gateway.
 *
 * The web has no client-side provider access (CORS/keys), so image generation — which
 * desktop did client-side via the Responses API — runs through this endpoint:
 * Clerk auth -> the user's own OpenAI key -> OpenAI's Images API -> base64 back.
 *
 *   POST /api/v1/images/generations   (Clerk Bearer)
 *     body: { prompt, model?, size?, n? }
 *     -> OpenAI { data: [{ b64_json }], ... } forwarded as-is
 *
 * Image generation is EXPENSIVE, so unlike the chat gateway there is NO free
 * server-key path — an own OpenAI key is required (402 otherwise). The client builds
 * a `data:image/png;base64,<b64_json>` URL from the result.
 */
import express from 'express'
import { clerkAuth } from '../middleware/clerkAuth.js'
import { getOpenAIKey } from '../services/userOpenAiKey.js'

const router = express.Router()

const OPENAI_IMAGES_URL = 'https://api.openai.com/v1/images/generations'
const DEFAULT_MODEL = 'gpt-image-1'
const ALLOWED_MODELS = new Set(['gpt-image-1', 'dall-e-3', 'dall-e-2'])
// Union of valid sizes across the allowed models; OpenAI rejects a size a given model
// doesn't support, and that error is forwarded as-is.
const ALLOWED_SIZES = new Set(['auto', '256x256', '512x512', '1024x1024', '1536x1024', '1024x1536', '1792x1024', '1024x1792'])
const MAX_PROMPT = 4000
const MAX_N = 4

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
  const model = ALLOWED_MODELS.has(b.model) ? b.model : DEFAULT_MODEL
  const size = ALLOWED_SIZES.has(b.size) ? b.size : '1024x1024'
  // dall-e-3 only ever returns a single image; clamp so we don't 400 upstream.
  const n = model === 'dall-e-3' ? 1 : Math.min(Math.max(parseInt(b.n, 10) || 1, 1), MAX_N)
  const upstreamBody = { model, prompt, size, n }
  // gpt-image-1 always returns b64_json and rejects response_format; the dall-e models
  // need it set explicitly so we get base64 (not a short-lived URL).
  if (model.startsWith('dall-e')) upstreamBody.response_format = 'b64_json'
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
    return res.status(502).json({ error: { message: `Upstream request failed: ${error.message}`, type: 'upstream_error' } })
  }

  const text = await upstream.text()
  res.status(upstream.status)
  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
  return res.send(text)
})

export default router

/**
 * OpenAI-compatible chat-completions gateway.
 *
 * The browser agent harness speaks the OpenAI Chat Completions spec; this
 * endpoint is a THIN passthrough: Clerk auth guard -> look up the user's
 * configured OpenAI key -> forward the request straight to OpenAI (server-side
 * key, never exposed to the browser). Supports streaming (stream: true) by
 * piping OpenAI's SSE response through unchanged.
 *
 *   POST /api/v1/chat/completions   (Clerk Bearer)
 *     body: standard OpenAI ChatCompletion request { model, messages, tools, stream, ... }
 *
 * For now OpenAI only; a multi-provider impl (or a LiteLLM sidecar) can slot in
 * behind this same endpoint later without the harness changing.
 */
import express from 'express'
import { Readable } from 'node:stream'
import { clerkAuth } from '../middleware/clerkAuth.js'
import { reserveAiExecution, refundAiExecution } from '../middleware/aiReserve.js'
import { getOpenAIKey } from '../services/userOpenAiKey.js'
import { ALLOWED_GATEWAY_MODELS } from '../config/freeTier.js'

const router = express.Router()

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
const MAX_MESSAGES = 200
const MAX_BODY_BYTES = 8 * 1024 * 1024 // 8MB request cap (headroom for long context + base64 vision images; well under the 50mb app parser)
export const MAX_OUTPUT_TOKENS = 8192

/** Clamp the output-token ceiling for the FREE server-key path. Covers BOTH the
 * legacy `max_tokens` and the current `max_completion_tokens` (the only field
 * o-series / newer models honor), and applies the ceiling as a DEFAULT when the
 * caller omits both — otherwise an omitted field means uncapped output on our key.
 * Mutates `body` in place. Own-key users pay OpenAI directly, so this is only
 * applied on the server-key branch, never to their requests. */
export function clampServerOutputTokens(body) {
  const clamp = (v) => Math.min(typeof v === 'number' ? v : MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS)
  const hasLegacy = typeof body.max_tokens === 'number'
  const hasCurrent = typeof body.max_completion_tokens === 'number'
  if (hasLegacy) body.max_tokens = clamp(body.max_tokens)
  if (hasCurrent) body.max_completion_tokens = clamp(body.max_completion_tokens)
  // Neither present -> impose a default ceiling so output can't run unbounded.
  if (!hasLegacy && !hasCurrent) body.max_completion_tokens = MAX_OUTPUT_TOKENS
}
// Free server-key model allowlist lives in one place (config/freeTier.js), shared
// with the compilation/execute seam so both gateways enforce the SAME list.
const ALLOWED_MODELS = ALLOWED_GATEWAY_MODELS

router.post('/', clerkAuth, async (req, res) => {
  const body = req.body || {}

  // Light guards — it's the user's own key/quota, but stop runaway loops. The model
  // ALLOWLIST is enforced below for the server-key path only (own-key = any model).
  if (typeof body.model !== 'string' || !body.model) {
    return res.status(400).json({ error: { message: 'model is required', type: 'invalid_request_error' } })
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return res.status(400).json({ error: { message: 'messages[] is required', type: 'invalid_request_error' } })
  }
  if (body.messages.length > MAX_MESSAGES) {
    return res.status(400).json({ error: { message: `too many messages (max ${MAX_MESSAGES})`, type: 'invalid_request_error' } })
  }
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) {
    return res.status(413).json({ error: { message: 'request too large', type: 'invalid_request_error' } })
  }

  // Key + quota resolution (the server-side guard).
  //  - Bring-your-own key  -> UNLIMITED (the user pays OpenAI directly, nothing of
  //    ours to meter), and quota is never touched.
  //  - No own key          -> fall back to the SERVER key, but gated by the account's
  //    execution quota (free tier) so server-key usage can't be run unbounded. This
  //    is the real enforcement point: the browser guard is only a CTA, this 402 is
  //    the boundary that actually blocks (validateAiQuota also frees enterprise/admin
  //    and any own-key user). NOTE: one POST = one agent turn, so a multi-turn agent
  //    run consumes several executions against the lifetime quota.
  let apiKey = getOpenAIKey(req.user)
  let meterQuota = false
  if (!apiKey) {
    const serverKey = process.env.OPENAI_API_KEY
    if (!serverKey) {
      return res.status(402).json({
        error: { message: 'No OpenAI API key configured for your account. Add one in provider settings.', type: 'no_api_key' },
      })
    }
    // Free server-key path: only the allowlisted cheap models may run on OUR key.
    if (!ALLOWED_MODELS.has(body.model)) {
      return res.status(403).json({
        error: {
          message: `Model "${body.model}" isn't available on the free tier. Add your own OpenAI key in provider settings for full access, or choose one of: ${[...ALLOWED_MODELS].join(', ')}.`,
          type: 'model_not_allowed',
          code: 'MODEL_NOT_ALLOWED',
          allowed_models: [...ALLOWED_MODELS],
          can_add_api_key: true,
        },
      })
    }
    // ATOMICALLY reserve one execution up front (serverProvider:'openai' scopes the
    // own-key exemption to OpenAI, so an Anthropic-only key doesn't ride free). The
    // guarded $inc closes the check-then-increment race that let concurrent requests
    // blow past the free cap. Refunded below if the call fails / yields no output.
    const resv = await reserveAiExecution(req.user, { serverProvider: 'openai' })
    if (!resv.allowed) {
      return res.status(resv.status || 402).json({
        error: {
          message: `Free execution limit reached (${resv.reason}). Add your own OpenAI key in provider settings for unlimited use${resv.upgradeRequired ? `, or upgrade to ${resv.upgradeRequired}` : ''}.`,
          type: 'quota_exceeded',
          code: 'QUOTA_EXCEEDED',
          upgrade_required: resv.upgradeRequired || null,
          can_add_api_key: true,
        },
      })
    }
    apiKey = serverKey
    meterQuota = resv.metered // true only when a unit was actually reserved
    // Free server-key path only: cap output tokens (both max_tokens and
    // max_completion_tokens, plus a default when omitted) so a single call can't
    // run unbounded output on our key. Own-key users are never clamped.
    clampServerOutputTokens(body)
  }

  // Give back the reserved unit when the run fails or yields no usable output —
  // so a failed request isn't charged. Idempotent (refunds at most once).
  let reserved = meterQuota
  const refund = async () => {
    if (!reserved) return
    reserved = false
    await refundAiExecution(req.user, {})
  }

  const wantStream = body.stream === true

  let upstream
  try {
    upstream = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    })
  } catch (error) {
    await refund() // never reached OpenAI — don't charge
    return res.status(502).json({ error: { message: `Upstream request failed: ${error.message}`, type: 'upstream_error' } })
  }

  // Non-streaming: forward status + JSON as-is. Refund on a non-2xx (no usable output).
  if (!wantStream) {
    const text = await upstream.text()
    if (!upstream.ok) await refund()
    res.status(upstream.status)
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
    return res.send(text)
  }

  // Streaming: pipe OpenAI's SSE response straight through.
  if (!upstream.ok || !upstream.body) {
    await refund() // upstream rejected before streaming — no output
    const text = await upstream.text().catch(() => '')
    res.status(upstream.status)
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
    return res.send(text)
  }
  // The unit is already reserved; refund it if the stream produces NO output (a
  // 200 that immediately errors). Any real output keeps the charge.
  res.status(200)
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()
  let gotData = false
  try {
    await new Promise((resolve, reject) => {
      const nodeStream = Readable.fromWeb(upstream.body)
      nodeStream.once('data', () => { gotData = true }) // proof of real output
      nodeStream.on('error', reject)
      res.on('close', () => nodeStream.destroy())
      nodeStream.pipe(res).on('finish', resolve).on('error', reject)
    })
    if (!gotData) await refund() // 200 but produced nothing
  } catch (error) {
    if (!gotData) await refund() // errored before ANY usable output — don't charge
    if (!res.writableEnded) res.end()
    console.error('[chatCompletions] stream pipe error:', error.message)
  }
})

export default router

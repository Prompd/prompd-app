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
import crypto from 'node:crypto'
import { Readable } from 'node:stream'
import { clerkAuth } from '../middleware/clerkAuth.js'
import { validateAiQuota, incrementAiUsage } from '../middleware/aiQuota.js'

const router = express.Router()

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
const MAX_MESSAGES = 200
const MAX_BODY_BYTES = 1 * 1024 * 1024 // 1MB request cap
const MAX_OUTPUT_TOKENS = 8192
// Models the FREE server key is allowed to run — the server-side ENFORCEMENT of the
// cost tier. Own-key users are UNRESTRICTED (their key, any model). The client picker
// allowlist (prompd-web src/lib/models.ts ALLOWED_GATEWAY_MODELS) is only UX; this is
// the real gate. Widen both together.
const ALLOWED_MODELS = new Set(['gpt-4.1-mini', 'gpt-4o-mini'])

/** Read a provider config from the user's aiFeatures.llmProviders (Map or object). */
function getUserProviderConfig(providers, providerId) {
  if (!providers) return null
  if (typeof providers.get === 'function') return providers.get(providerId)
  return providers[providerId]
}

/** Decrypt an AES-256-GCM key the same way EncryptionService stores it. */
function decryptApiKey(encryptedKeyHex, ivHex) {
  if (!encryptedKeyHex || !ivHex) return null
  try {
    const secret = process.env.ENCRYPTION_SECRET || process.env.JWT_SECRET
    if (!secret) return null
    const KEY = crypto.scryptSync(secret, 'prompd-salt', 32)
    const ivBuffer = Buffer.from(ivHex, 'hex')
    const encryptedText = encryptedKeyHex.slice(0, -32)
    const authTag = Buffer.from(encryptedKeyHex.slice(-32), 'hex')
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, ivBuffer)
    decipher.setAuthTag(authTag)
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (error) {
    console.error('[chatCompletions] Failed to decrypt user OpenAI key:', error.message)
    return null
  }
}

function getOpenAIKey(user) {
  const cfg = getUserProviderConfig(user?.aiFeatures?.llmProviders, 'openai')
  if (!cfg?.hasKey) return null
  return decryptApiKey(cfg.encryptedKey, cfg.iv)
}

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
  if (typeof body.max_tokens === 'number') {
    body.max_tokens = Math.min(body.max_tokens, MAX_OUTPUT_TOKENS)
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
    const quota = await validateAiQuota(req.user, 'execute')
    if (!quota.allowed) {
      return res.status(402).json({
        error: {
          message: `Free execution limit reached (${quota.reason}). Add your own OpenAI key in provider settings for unlimited use${quota.upgradeRequired ? `, or upgrade to ${quota.upgradeRequired}` : ''}.`,
          type: 'quota_exceeded',
          code: 'QUOTA_EXCEEDED',
          upgrade_required: quota.upgradeRequired || null,
          can_add_api_key: quota.canAddApiKey ?? true,
        },
      })
    }
    apiKey = serverKey
    meterQuota = true
  }

  // Count one execution against quota only when the SERVER key was used and OpenAI
  // accepted the request. Best-effort: a save failure must not break the response.
  const meter = async () => {
    if (!meterQuota) return
    try { await incrementAiUsage(req.user, 'execute') }
    catch (e) { console.error('[chatCompletions] usage increment failed:', e.message) }
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
    return res.status(502).json({ error: { message: `Upstream request failed: ${error.message}`, type: 'upstream_error' } })
  }

  // Non-streaming: forward status + JSON as-is.
  if (!wantStream) {
    const text = await upstream.text()
    if (upstream.ok) await meter()
    res.status(upstream.status)
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
    return res.send(text)
  }

  // Streaming: pipe OpenAI's SSE response straight through.
  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => '')
    res.status(upstream.status)
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
    return res.send(text)
  }
  // upstream accepted the request and is streaming — count one execution.
  await meter()
  res.status(200)
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()
  try {
    await new Promise((resolve, reject) => {
      const nodeStream = Readable.fromWeb(upstream.body)
      nodeStream.on('error', reject)
      res.on('close', () => nodeStream.destroy())
      nodeStream.pipe(res).on('finish', resolve).on('error', reject)
    })
  } catch (error) {
    if (!res.writableEnded) res.end()
    console.error('[chatCompletions] stream pipe error:', error.message)
  }
})

export default router

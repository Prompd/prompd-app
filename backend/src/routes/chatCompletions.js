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

const router = express.Router()

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
const MAX_MESSAGES = 200
const MAX_BODY_BYTES = 1 * 1024 * 1024 // 1MB request cap
const MAX_OUTPUT_TOKENS = 8192

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

  // Light guards — it's the user's own key/quota, but stop runaway loops.
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

  const apiKey = getOpenAIKey(req.user)
  if (!apiKey) {
    return res.status(402).json({
      error: { message: 'No OpenAI API key configured for your account. Add one in provider settings.', type: 'no_api_key' },
    })
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

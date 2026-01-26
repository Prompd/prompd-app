/**
 * Webhook Proxy Routes - Forward webhooks to local services
 *
 * This proxy enables workflows running on local machines (via Electron app or prompd-service)
 * to receive webhooks from external systems (GitHub, Stripe, etc.).
 *
 * Architecture:
 *   External System → api.prompd.app/webhook-proxy/:userId/:workflowId
 *                   → [Webhook Queue (in-memory)]
 *                   → WebSocket (real-time via existing Socket.IO) OR Polling (fallback)
 *                   → Local Service (localhost:9876 or Electron app)
 *                   → Workflow Execution
 *
 * Authentication:
 *   - Uses existing registry API tokens (no separate auth system)
 *   - Validates tokens via registry's /auth/me endpoint
 *   - Long-lived tokens (don't expire like JWTs)
 *
 * WebSocket forwarding handled by socket.js (existing infrastructure)
 *
 * Endpoints:
 *   POST /api/webhook-proxy/:userId/:workflowId - Receive webhook from external system
 *   GET  /api/webhook-proxy/pending - Poll for pending webhooks (fallback)
 *   POST /api/webhook-proxy/ack/:webhookId - Acknowledge webhook received
 */

import express from 'express'
import crypto from 'crypto'
import fetch from 'node-fetch'
import { forwardWebhookToClient } from '../config/socket.js'

const router = express.Router()

/**
 * Webhook queue (in-memory, should use MongoDB in production)
 * Structure: { id, userId, workflowId, timestamp, headers, body, query }
 */
const webhookQueue = new Map() // webhookId → webhook data
const userQueues = new Map()   // userId → webhookId[]

/**
 * Webhook TTL: 5 minutes
 */
const WEBHOOK_TTL = 5 * 60 * 1000

/**
 * Validate registry token by calling registry's /auth/me endpoint
 */
async function validateRegistryToken(token, registryUrl = 'https://registry.prompdhub.ai') {
  try {
    const response = await fetch(`${registryUrl}/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` },
      timeout: 3000
    })

    if (!response.ok) {
      return null
    }

    return await response.json()
  } catch (error) {
    console.error('[WebhookProxy] Token validation failed:', error.message)
    return null
  }
}

/**
 * Middleware to authenticate requests via registry tokens
 */
async function authenticateRegistryToken(req, res, next) {
  const authHeader = req.headers['authorization']

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' })
  }

  const token = authHeader.substring(7)
  const user = await validateRegistryToken(token)

  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  req.user = user
  next()
}

/**
 * Clean up expired webhooks (TTL: 5 minutes)
 */
function cleanupExpiredWebhooks() {
  const now = Date.now()
  const expired = []

  for (const [webhookId, webhook] of webhookQueue.entries()) {
    if (now - webhook.timestamp > WEBHOOK_TTL) {
      expired.push(webhookId)

      const userQueue = userQueues.get(webhook.userId) || []
      const idx = userQueue.indexOf(webhookId)
      if (idx >= 0) {
        userQueue.splice(idx, 1)
      }
    }
  }

  for (const id of expired) {
    webhookQueue.delete(id)
  }

  if (expired.length > 0) {
    console.log(`[WebhookProxy] Cleaned up ${expired.length} expired webhooks`)
  }
}

// Run cleanup every minute
setInterval(cleanupExpiredWebhooks, 60 * 1000)

/**
 * POST /api/webhook-proxy/:userId/:workflowId
 * Receive webhook from external system and forward to local service
 *
 * This is the public endpoint that external systems (GitHub, Stripe, etc.) POST to.
 */
router.post('/:userId/:workflowId', express.json(), async (req, res) => {
  const { userId, workflowId } = req.params
  const webhookId = crypto.randomUUID()

  try {
    const webhook = {
      id: webhookId,
      userId,
      workflowId,
      timestamp: Date.now(),
      headers: req.headers,
      body: req.body,
      query: req.query
    }

    webhookQueue.set(webhookId, webhook)

    if (!userQueues.has(userId)) {
      userQueues.set(userId, [])
    }
    userQueues.get(userId).push(webhookId)

    // Try to forward via WebSocket (uses existing Socket.IO infrastructure)
    const delivered = await forwardWebhookToClient(userId, webhook)

    if (delivered) {
      // Clean up immediately on ack
      webhookQueue.delete(webhookId)
      const userQueue = userQueues.get(userId) || []
      const idx = userQueue.indexOf(webhookId)
      if (idx >= 0) {
        userQueue.splice(idx, 1)
      }

      return res.json({ status: 'delivered', webhookId })
    }

    // WebSocket not connected or no ack - queue for polling
    res.json({ status: 'queued', webhookId })

  } catch (error) {
    console.error('[WebhookProxy] Error receiving webhook:', error)
    res.status(500).json({ error: 'Failed to receive webhook' })
  }
})

/**
 * GET /api/webhook-proxy/pending
 * Poll for pending webhooks (fallback when WebSocket unavailable)
 */
router.get('/pending', authenticateRegistryToken, async (req, res) => {
  const userId = req.user.userId || req.user.id

  try {
    const userQueue = userQueues.get(userId) || []
    const webhooks = []

    // Get up to 10 webhooks at once
    const webhookIds = userQueue.slice(0, 10)

    for (const webhookId of webhookIds) {
      const webhook = webhookQueue.get(webhookId)
      if (webhook) {
        webhooks.push(webhook)
      }
    }

    res.json({ webhooks })

  } catch (error) {
    console.error('[WebhookProxy] Error fetching pending webhooks:', error)
    res.status(500).json({ error: 'Failed to fetch pending webhooks' })
  }
})

/**
 * POST /api/webhook-proxy/ack/:webhookId
 * Acknowledge webhook received (polling mode)
 */
router.post('/ack/:webhookId', authenticateRegistryToken, async (req, res) => {
  const { webhookId } = req.params
  const userId = req.user.userId || req.user.id

  try {
    const webhook = webhookQueue.get(webhookId)

    if (!webhook || webhook.userId !== userId) {
      return res.status(404).json({ error: 'Webhook not found' })
    }

    // Remove from queue
    webhookQueue.delete(webhookId)

    const userQueue = userQueues.get(userId) || []
    const idx = userQueue.indexOf(webhookId)
    if (idx >= 0) {
      userQueue.splice(idx, 1)
    }

    res.json({ status: 'acknowledged' })

  } catch (error) {
    console.error('[WebhookProxy] Error acknowledging webhook:', error)
    res.status(500).json({ error: 'Failed to acknowledge webhook' })
  }
})

/**
 * Export function to remove webhook from queue (called from socket.js)
 */
export function removeWebhookFromQueue(webhookId, userId) {
  const webhook = webhookQueue.get(webhookId)
  if (webhook && webhook.userId === userId) {
    webhookQueue.delete(webhookId)
    const userQueue = userQueues.get(userId) || []
    const idx = userQueue.indexOf(webhookId)
    if (idx >= 0) {
      userQueue.splice(idx, 1)
    }
  }
}

export default router

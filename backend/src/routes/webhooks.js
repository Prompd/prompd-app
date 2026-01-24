/**
 * Webhook Routes - Trigger workflow execution via HTTP POST
 *
 * These endpoints enable workflows to be triggered externally via webhooks.
 * Security is enforced via HMAC signature validation using workflow-specific secrets.
 *
 * Endpoints:
 *   POST /api/webhooks/:workflowId - Trigger workflow execution
 *   GET  /api/webhooks/:workflowId/status - Check webhook configuration status
 */

import express from 'express'
import crypto from 'crypto'

const router = express.Router()

/**
 * In-memory storage for workflow webhook configurations.
 * In production, this would be stored in MongoDB.
 */
const webhookConfigs = new Map()

/**
 * In-memory storage for execution results.
 * In production, this would be stored in MongoDB with proper indexing.
 */
const executionResults = new Map()

/**
 * Verify HMAC signature for webhook security
 * @param {string} payload - Raw request body
 * @param {string} signature - Signature from X-Webhook-Signature header
 * @param {string} secret - Workflow webhook secret
 * @returns {boolean} - Whether signature is valid
 */
function verifySignature(payload, signature, secret) {
  if (!signature || !secret) {
    return false
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex')

  // Use timing-safe comparison to prevent timing attacks
  const signatureBuffer = Buffer.from(signature, 'hex')
  const expectedBuffer = Buffer.from(expectedSignature, 'hex')

  if (signatureBuffer.length !== expectedBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
}

/**
 * Generate a secure webhook secret
 * @returns {string} - 32-byte hex string
 */
function generateWebhookSecret() {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * POST /api/webhooks/:workflowId
 * Trigger workflow execution via webhook
 *
 * Headers:
 *   X-Webhook-Signature: HMAC-SHA256 signature of the request body
 *   Content-Type: application/json
 *
 * Body:
 *   { parameters: { ... } } - Parameters to pass to the workflow
 *
 * Response:
 *   202: { executionId, status: 'queued', message }
 *   400: Invalid request body
 *   401: Invalid or missing signature
 *   404: Workflow not found or webhooks not enabled
 */
router.post('/:workflowId', express.raw({ type: 'application/json' }), async (req, res) => {
  const { workflowId } = req.params
  const signature = req.headers['x-webhook-signature']

  try {
    // Get webhook config for this workflow
    const config = webhookConfigs.get(workflowId)

    if (!config || !config.enabled) {
      return res.status(404).json({
        error: 'Webhook not found',
        message: `Workflow '${workflowId}' does not have webhooks enabled`
      })
    }

    // Verify signature if secret is configured
    if (config.secret) {
      const rawBody = req.body.toString('utf8')

      if (!verifySignature(rawBody, signature, config.secret)) {
        return res.status(401).json({
          error: 'Invalid signature',
          message: 'The X-Webhook-Signature header is missing or invalid'
        })
      }
    }

    // Parse the JSON body
    let payload
    try {
      payload = JSON.parse(req.body.toString('utf8'))
    } catch {
      return res.status(400).json({
        error: 'Invalid JSON',
        message: 'Request body must be valid JSON'
      })
    }

    // Validate payload structure
    const parameters = payload.parameters || {}

    // Generate execution ID
    const executionId = `exec-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`

    // Store execution request (in production, this would be queued for async processing)
    executionResults.set(executionId, {
      workflowId,
      executionId,
      status: 'queued',
      parameters,
      createdAt: new Date().toISOString(),
      triggeredBy: 'webhook',
      sourceIp: req.ip
    })

    // TODO: In production, emit to Socket.IO or message queue for async execution
    // io.to(`workflow:${workflowId}`).emit('execution:start', { executionId, parameters })

    // Return accepted response
    res.status(202).json({
      executionId,
      status: 'queued',
      message: 'Workflow execution has been queued',
      workflowId,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error(`[webhooks] Error triggering workflow ${workflowId}:`, error)
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to trigger workflow execution'
    })
  }
})

/**
 * GET /api/webhooks/:workflowId/status
 * Check webhook configuration status for a workflow
 *
 * Response:
 *   200: { enabled, hasSecret, webhookUrl }
 *   404: Workflow not found
 */
router.get('/:workflowId/status', async (req, res) => {
  const { workflowId } = req.params

  try {
    const config = webhookConfigs.get(workflowId)

    if (!config) {
      return res.status(404).json({
        error: 'Not found',
        message: `No webhook configuration found for workflow '${workflowId}'`
      })
    }

    // Return status without exposing the secret
    res.json({
      workflowId,
      enabled: config.enabled,
      hasSecret: !!config.secret,
      webhookUrl: `/api/webhooks/${workflowId}`,
      createdAt: config.createdAt,
      lastTriggered: config.lastTriggered || null
    })

  } catch (error) {
    console.error(`[webhooks] Error getting status for ${workflowId}:`, error)
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get webhook status'
    })
  }
})

/**
 * PUT /api/webhooks/:workflowId
 * Configure webhook for a workflow (create or update)
 *
 * Body:
 *   { enabled: boolean, regenerateSecret?: boolean }
 *
 * Response:
 *   200: { workflowId, enabled, secret (only on create/regenerate), webhookUrl }
 */
router.put('/:workflowId', async (req, res) => {
  const { workflowId } = req.params
  const { enabled = true, regenerateSecret = false } = req.body

  try {
    let config = webhookConfigs.get(workflowId)
    const isNew = !config

    if (isNew) {
      config = {
        workflowId,
        enabled,
        secret: generateWebhookSecret(),
        createdAt: new Date().toISOString()
      }
    } else {
      config.enabled = enabled
      if (regenerateSecret) {
        config.secret = generateWebhookSecret()
      }
    }

    webhookConfigs.set(workflowId, config)

    // Return response with secret only on create or regenerate
    const response = {
      workflowId,
      enabled: config.enabled,
      webhookUrl: `/api/webhooks/${workflowId}`,
      createdAt: config.createdAt
    }

    // Only include secret on initial creation or regeneration (security best practice)
    if (isNew || regenerateSecret) {
      response.secret = config.secret
      response.message = isNew
        ? 'Webhook created. Save the secret - it will not be shown again.'
        : 'Secret regenerated. Save the new secret - it will not be shown again.'
    }

    res.json(response)

  } catch (error) {
    console.error(`[webhooks] Error configuring webhook for ${workflowId}:`, error)
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to configure webhook'
    })
  }
})

/**
 * DELETE /api/webhooks/:workflowId
 * Disable and remove webhook configuration for a workflow
 *
 * Response:
 *   200: { message }
 *   404: Webhook not found
 */
router.delete('/:workflowId', async (req, res) => {
  const { workflowId } = req.params

  try {
    if (!webhookConfigs.has(workflowId)) {
      return res.status(404).json({
        error: 'Not found',
        message: `No webhook configuration found for workflow '${workflowId}'`
      })
    }

    webhookConfigs.delete(workflowId)

    res.json({
      message: `Webhook for workflow '${workflowId}' has been deleted`
    })

  } catch (error) {
    console.error(`[webhooks] Error deleting webhook for ${workflowId}:`, error)
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to delete webhook'
    })
  }
})

/**
 * GET /api/webhooks/:workflowId/executions/:executionId
 * Get execution status and result
 *
 * Response:
 *   200: { executionId, status, result?, error? }
 *   404: Execution not found
 */
router.get('/:workflowId/executions/:executionId', async (req, res) => {
  const { workflowId, executionId } = req.params

  try {
    const execution = executionResults.get(executionId)

    if (!execution || execution.workflowId !== workflowId) {
      return res.status(404).json({
        error: 'Not found',
        message: `Execution '${executionId}' not found for workflow '${workflowId}'`
      })
    }

    res.json(execution)

  } catch (error) {
    console.error(`[webhooks] Error getting execution ${executionId}:`, error)
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get execution status'
    })
  }
})

export default router

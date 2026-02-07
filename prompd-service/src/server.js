/**
 * Prompd Service - Standalone workflow scheduler
 *
 * A lightweight HTTP server that runs 24/7 for scheduled workflow execution
 * Uses DeploymentService for package-based workflow deployment and trigger management
 * Configuration via environment variables, no complex setup required
 */

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { DeploymentService } from '@prompd/scheduler'
import { getDefaultDbPath } from '@prompd/scheduler'
import { executeDeployedWorkflow } from './workflowExecutor.js'
import { WebhookClient } from './webhookClient.js'

// Configuration from environment variables
const PORT = parseInt(process.env.PROMPD_SERVICE_PORT || '9876', 10)
const HOST = process.env.PROMPD_SERVICE_HOST || '127.0.0.1'
const DB_PATH = process.env.PROMPD_DB_PATH || getDefaultDbPath()
const ENABLE_WEBHOOKS = process.env.ENABLE_WEBHOOKS !== 'false' // Enabled by default

// Simple logger
function log(level, message, data = null) {
  const timestamp = new Date().toISOString()
  const logLine = data
    ? `[${timestamp}] [${level.toUpperCase()}] ${message} ${JSON.stringify(data)}`
    : `[${timestamp}] [${level.toUpperCase()}] ${message}`
  console.log(logLine)
}

// Create Express app
const app = express()

// Middleware
app.use(helmet())
app.use(cors())
app.use(express.json())

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many requests'
})
app.use(limiter)

// Initialize deployment service
let deploymentService = null
try {
  deploymentService = new DeploymentService({
    dbPath: DB_PATH,
    executeWorkflow: executeDeployedWorkflow
  })
  log('info', 'DeploymentService initialized', { dbPath: DB_PATH })
} catch (error) {
  log('error', 'Failed to initialize DeploymentService', { error: error.message })
  process.exit(1)
}

// Initialize webhook client (optional, enabled by default)
let webhookClient = null
if (ENABLE_WEBHOOKS) {
  try {
    webhookClient = new WebhookClient({
      onWebhook: async (webhook) => {
        log('info', 'Webhook received', {
          webhookId: webhook.id,
          workflowId: webhook.workflowId
        })

        // Find deployment with matching workflowId
        const deployments = deploymentService.listDeployments({ status: 'enabled' })
        const deployment = deployments.find(d => d.workflowId === webhook.workflowId)

        if (!deployment) {
          log('warn', 'Webhook received for unknown workflow', { workflowId: webhook.workflowId })
          return
        }

        // Find webhook trigger for this deployment
        const triggers = deploymentService.db.triggers.getByDeployment(deployment.id)
        const webhookTrigger = triggers.find(t => t.triggerType === 'webhook' && t.enabled)

        if (!webhookTrigger) {
          log('warn', 'No active webhook trigger found for deployment', { deploymentId: deployment.id })
          return
        }

        // Execute workflow with webhook data as parameters
        try {
          await deploymentService.execute(deployment.id, {
            webhook_body: webhook.body,
            webhook_headers: webhook.headers,
            webhook_query: webhook.query,
            webhook_id: webhook.id
          })
          log('info', 'Webhook workflow executed successfully', {
            webhookId: webhook.id,
            deploymentId: deployment.id
          })
        } catch (error) {
          log('error', 'Webhook workflow execution failed', {
            webhookId: webhook.id,
            deploymentId: deployment.id,
            error: error.message
          })
        }
      }
    })

    webhookClient.start().then(started => {
      if (started) {
        log('info', 'Webhook client started', { mode: webhookClient.getMode() })
      } else {
        log('warn', 'Webhook client failed to start (no registry token)')
      }
    })
  } catch (error) {
    log('error', 'Failed to initialize webhook client', { error: error.message })
    log('info', 'Service will run without webhook support')
  }
} else {
  log('info', 'Webhook support disabled via ENABLE_WEBHOOKS=false')
}

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  const deployments = deploymentService.listDeployments({ status: 'enabled' })
  const allTriggers = deploymentService.db.triggers.getAll({ enabled: 1 })

  res.json({
    status: 'ok',
    uptime: process.uptime(),
    activeDeployments: deployments.length,
    enabledTriggers: allTriggers.length,
    webhooks: {
      enabled: ENABLE_WEBHOOKS,
      active: webhookClient?.isActive() || false,
      mode: webhookClient?.getMode() || 'disabled'
    },
    timestamp: new Date().toISOString()
  })
})

/**
 * Get all deployments
 */
app.get('/api/deployments', (req, res) => {
  try {
    const filters = {}
    if (req.query.status) {
      filters.status = req.query.status
    }
    if (req.query.workflowId) {
      filters.workflowId = req.query.workflowId
    }

    const deployments = deploymentService.listDeployments(filters)
    res.json({ success: true, deployments })
  } catch (error) {
    log('error', 'Failed to get deployments', { error: error.message })
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * Deploy a package
 */
app.post('/api/deployments', async (req, res) => {
  try {
    const { packagePath, name } = req.body

    if (!packagePath) {
      return res.status(400).json({ success: false, error: 'packagePath is required' })
    }

    const deploymentId = await deploymentService.deploy(packagePath, { name })
    log('info', 'Package deployed', { deploymentId, packagePath })
    res.json({ success: true, deploymentId })
  } catch (error) {
    log('error', 'Failed to deploy package', { error: error.message })
    res.status(400).json({ success: false, error: error.message })
  }
})

/**
 * Get deployment status (includes triggers and recent executions)
 */
app.get('/api/deployments/:id', (req, res) => {
  try {
    const status = deploymentService.getDeploymentStatus(req.params.id)

    if (!status.deployment) {
      return res.status(404).json({ success: false, error: 'Deployment not found' })
    }

    res.json({ success: true, ...status })
  } catch (error) {
    log('error', 'Failed to get deployment status', { error: error.message })
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * Undeploy a package
 */
app.delete('/api/deployments/:id', async (req, res) => {
  try {
    const deleteFiles = req.query.deleteFiles === 'true'
    await deploymentService.delete(req.params.id, { deleteFiles })
    log('info', 'Deployment deleted', { deploymentId: req.params.id, deleteFiles })
    res.json({ success: true })
  } catch (error) {
    log('error', 'Failed to delete deployment', { error: error.message })
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * Execute deployment manually
 */
app.post('/api/deployments/:id/execute', async (req, res) => {
  try {
    const parameters = req.body.parameters || {}
    const result = await deploymentService.execute(req.params.id, parameters)
    log('info', 'Manual execution triggered', { deploymentId: req.params.id })
    res.json({ success: true, result })
  } catch (error) {
    log('error', 'Failed to execute deployment', { error: error.message })
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * Get workflow parameters for a deployment
 */
app.get('/api/deployments/:id/parameters', (req, res) => {
  try {
    const result = deploymentService.getParameters(req.params.id)
    if (!result.success) {
      return res.status(404).json(result)
    }
    res.json(result)
  } catch (error) {
    log('error', 'Failed to get parameters', { error: error.message })
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * Get all triggers
 */
app.get('/api/triggers', (req, res) => {
  try {
    const filters = {}
    if (req.query.deploymentId) {
      filters.deploymentId = req.query.deploymentId
    }
    if (req.query.triggerType) {
      filters.triggerType = req.query.triggerType
    }
    if (req.query.enabled !== undefined) {
      filters.enabled = req.query.enabled === 'true' ? 1 : 0
    }

    const triggers = filters.deploymentId
      ? deploymentService.db.triggers.getByDeployment(filters.deploymentId)
      : deploymentService.db.triggers.getAll(filters)

    res.json({ success: true, triggers })
  } catch (error) {
    log('error', 'Failed to get triggers', { error: error.message })
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * Toggle trigger enabled state
 */
app.put('/api/triggers/:id/toggle', async (req, res) => {
  try {
    const { enabled } = req.body
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'enabled must be a boolean' })
    }

    await deploymentService.toggleTrigger(req.params.id, enabled)
    log('info', 'Trigger toggled', { triggerId: req.params.id, enabled })
    res.json({ success: true })
  } catch (error) {
    log('error', 'Failed to toggle trigger', { error: error.message })
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * Get execution history (all deployments, paginated)
 */
app.get('/api/executions', (req, res) => {
  try {
    const options = {
      limit: parseInt(req.query.limit || '50', 10),
      offset: parseInt(req.query.offset || '0', 10)
    }

    const result = deploymentService.getAllExecutions(options)
    res.json({ success: true, ...result })
  } catch (error) {
    log('error', 'Failed to get execution history', { error: error.message })
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * Get execution history for a specific deployment
 */
app.get('/api/deployments/:id/executions', (req, res) => {
  try {
    const options = {
      limit: parseInt(req.query.limit || '50', 10),
      offset: parseInt(req.query.offset || '0', 10)
    }

    const executions = deploymentService.getHistory(req.params.id, options)
    res.json({ success: true, executions })
  } catch (error) {
    log('error', 'Failed to get deployment execution history', { error: error.message })
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * Clear all execution history
 */
app.delete('/api/executions', (req, res) => {
  try {
    const deletedCount = deploymentService.clearAllHistory()
    log('info', 'Execution history cleared', { deletedCount })
    res.json({ success: true, deletedCount })
  } catch (error) {
    log('error', 'Failed to clear execution history', { error: error.message })
    res.status(500).json({ success: false, error: error.message })
  }
})

// Error handler
app.use((err, req, res, next) => {
  log('error', 'Unhandled error', { error: err.message, stack: err.stack })
  res.status(500).json({ success: false, error: 'Internal server error' })
})

// Graceful shutdown
function shutdown() {
  log('info', 'Shutting down...')
  if (deploymentService) {
    deploymentService.close()
  }
  if (webhookClient) {
    webhookClient.stop()
  }
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

// Start server
app.listen(PORT, HOST, () => {
  log('info', `Prompd Service running`, { host: HOST, port: PORT })
  log('info', `Health check: http://${HOST}:${PORT}/health`)
  log('info', `API base: http://${HOST}:${PORT}/api`)
  log('info', `Database: ${DB_PATH}`)
  log('info', 'Press Ctrl+C to stop')
})

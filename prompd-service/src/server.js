/**
 * Prompd Service - Standalone workflow scheduler
 *
 * A lightweight HTTP server that runs 24/7 for scheduled workflow execution
 * Configuration via environment variables, no complex setup required
 */

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { Scheduler } from '@prompd/scheduler-shared'
import { getDefaultDbPath } from '@prompd/scheduler-shared/models/scheduleDB.js'
import { executeWorkflow } from './workflowExecutor.js'
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

// Workflow executor is imported from workflowExecutor.js

// Initialize scheduler
let scheduler = null
try {
  scheduler = new Scheduler({
    dbPath: DB_PATH,
    executeWorkflow
  })
  scheduler.start()
  log('info', 'Scheduler initialized', { dbPath: DB_PATH })
} catch (error) {
  log('error', 'Failed to initialize scheduler', { error: error.message })
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

        // Find workflow by ID from scheduler
        const schedules = scheduler.getSchedules({ workflowId: webhook.workflowId })
        const schedule = schedules[0]

        if (!schedule) {
          log('warn', 'Webhook received for unknown workflow', { workflowId: webhook.workflowId })
          return
        }

        // Execute workflow with webhook data as parameters
        try {
          await executeWorkflow({
            ...schedule,
            parameters: {
              ...schedule.parameters,
              webhook_body: webhook.body,
              webhook_headers: webhook.headers,
              webhook_query: webhook.query,
              webhook_id: webhook.id
            }
          })
          log('info', 'Webhook workflow executed successfully', {
            webhookId: webhook.id,
            workflowId: webhook.workflowId
          })
        } catch (error) {
          log('error', 'Webhook workflow execution failed', {
            webhookId: webhook.id,
            workflowId: webhook.workflowId,
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
  const activeSchedules = scheduler.getActiveSchedules()
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    activeSchedules: activeSchedules.length,
    webhooks: {
      enabled: ENABLE_WEBHOOKS,
      active: webhookClient?.isActive() || false,
      mode: webhookClient?.getMode() || 'disabled'
    },
    timestamp: new Date().toISOString()
  })
})

/**
 * Get all schedules
 */
app.get('/api/schedules', (req, res) => {
  try {
    const filters = {}
    if (req.query.enabled !== undefined) {
      filters.enabled = req.query.enabled === 'true'
    }
    if (req.query.workflowId) {
      filters.workflowId = req.query.workflowId
    }

    const schedules = scheduler.getSchedules(filters)
    res.json({ success: true, schedules })
  } catch (error) {
    log('error', 'Failed to get schedules', { error: error.message })
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * Create new schedule
 */
app.post('/api/schedules', (req, res) => {
  try {
    const config = req.body
    const scheduleId = scheduler.addSchedule(config)
    log('info', 'Schedule created', { scheduleId, name: config.name })
    res.json({ success: true, scheduleId })
  } catch (error) {
    log('error', 'Failed to create schedule', { error: error.message })
    res.status(400).json({ success: false, error: error.message })
  }
})

/**
 * Get schedule by ID
 */
app.get('/api/schedules/:id', (req, res) => {
  try {
    const schedules = scheduler.getSchedules()
    const schedule = schedules.find(s => s.id === req.params.id)

    if (!schedule) {
      return res.status(404).json({ success: false, error: 'Schedule not found' })
    }

    res.json({ success: true, schedule })
  } catch (error) {
    log('error', 'Failed to get schedule', { error: error.message })
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * Update schedule
 */
app.put('/api/schedules/:id', (req, res) => {
  try {
    const success = scheduler.updateSchedule(req.params.id, req.body)
    if (!success) {
      return res.status(404).json({ success: false, error: 'Schedule not found' })
    }
    log('info', 'Schedule updated', { scheduleId: req.params.id })
    res.json({ success: true })
  } catch (error) {
    log('error', 'Failed to update schedule', { error: error.message })
    res.status(400).json({ success: false, error: error.message })
  }
})

/**
 * Delete schedule
 */
app.delete('/api/schedules/:id', (req, res) => {
  try {
    const success = scheduler.deleteSchedule(req.params.id)
    if (!success) {
      return res.status(404).json({ success: false, error: 'Schedule not found' })
    }
    log('info', 'Schedule deleted', { scheduleId: req.params.id })
    res.json({ success: true })
  } catch (error) {
    log('error', 'Failed to delete schedule', { error: error.message })
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * Execute schedule immediately (manual trigger)
 */
app.post('/api/schedules/:id/execute', async (req, res) => {
  try {
    const result = await scheduler.executeScheduleNow(req.params.id)
    log('info', 'Manual execution triggered', { scheduleId: req.params.id })
    res.json({ success: true, result })
  } catch (error) {
    log('error', 'Failed to execute schedule', { error: error.message })
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * Get execution history
 */
app.get('/api/executions', (req, res) => {
  try {
    const workflowId = req.query.workflowId || null
    const options = {
      limit: parseInt(req.query.limit || '50', 10),
      offset: parseInt(req.query.offset || '0', 10)
    }

    const history = scheduler.getExecutionHistory(workflowId, options)
    res.json({ success: true, history })
  } catch (error) {
    log('error', 'Failed to get execution history', { error: error.message })
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * Get next run times for a schedule
 */
app.get('/api/schedules/:id/next-runs', (req, res) => {
  try {
    const count = parseInt(req.query.count || '5', 10)
    const times = scheduler.getNextRunTimes(req.params.id, count)
    res.json({ success: true, times })
  } catch (error) {
    log('error', 'Failed to get next run times', { error: error.message })
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
  if (scheduler) {
    scheduler.close()
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
  log('info', `Database: ${DB_PATH}`)
  log('info', 'Press Ctrl+C to stop')
})

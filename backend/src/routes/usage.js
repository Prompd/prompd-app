/**
 * Usage Tracking Routes
 *
 * Endpoints for syncing local usage data to the server for analytics.
 * Designed to work with offline-first client that batches uploads.
 */

import { Router } from 'express'

const router = Router()

/**
 * POST /api/usage/sync
 * Sync execution records from client
 *
 * Body: { executions: ExecutionRecord[] }
 * Response: { success: boolean, synced: number, errors?: string[] }
 */
router.post('/sync', async (req, res) => {
  try {
    const { executions = [] } = req.body

    if (!Array.isArray(executions)) {
      return res.status(400).json({
        success: false,
        error: 'executions must be an array'
      })
    }

    // Validate and sanitize records
    const validRecords = []
    const errors = []

    for (const exec of executions) {
      // Basic validation
      if (!exec.id || !exec.provider || !exec.model) {
        errors.push(`Invalid record: missing required fields`)
        continue
      }

      // Sanitize - don't store full prompts/responses on server
      // Only store metadata for analytics
      validRecords.push({
        clientId: exec.id,
        timestamp: exec.timestamp || Date.now(),
        provider: exec.provider,
        model: exec.model,
        promptTokens: exec.promptTokens || 0,
        completionTokens: exec.completionTokens || 0,
        totalTokens: exec.totalTokens || 0,
        duration: exec.duration || 0,
        success: !!exec.success,
        executionMode: exec.executionMode || 'local',
        // Don't store: compiledPrompt, response (privacy)
        hasCompiledPrompt: !!exec.compiledPrompt,
        hasResponse: !!exec.response
      })
    }

    // TODO: Store in database when we have a Usage model
    // For now, just log and acknowledge
    console.log(`[Usage] Received ${validRecords.length} execution records`)

    // In production, you'd insert into MongoDB here:
    // await UsageModel.insertMany(validRecords)

    res.json({
      success: true,
      synced: validRecords.length,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (error) {
    console.error('[Usage] Sync error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to sync usage data'
    })
  }
})

/**
 * GET /api/usage/summary
 * Get usage summary for the authenticated user
 *
 * Query: startDate, endDate (optional, ISO strings)
 * Response: UsageSummary
 */
router.get('/summary', async (req, res) => {
  try {
    // TODO: Implement when we have authentication and Usage model
    // For now, return empty summary

    res.json({
      success: true,
      summary: {
        totalExecutions: 0,
        totalTokens: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        successCount: 0,
        errorCount: 0,
        byProvider: {},
        byDay: {}
      }
    })
  } catch (error) {
    console.error('[Usage] Summary error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get usage summary'
    })
  }
})

/**
 * GET /api/usage/stats
 * Get quick stats (for dashboard)
 */
router.get('/stats', async (req, res) => {
  try {
    // TODO: Implement when we have Usage model

    res.json({
      success: true,
      stats: {
        today: { executions: 0, tokens: 0 },
        thisWeek: { executions: 0, tokens: 0 },
        thisMonth: { executions: 0, tokens: 0 }
      }
    })
  } catch (error) {
    console.error('[Usage] Stats error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get usage stats'
    })
  }
})

export default router

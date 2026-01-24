import { Router } from 'express'
import { ErrorReport } from '../models/ErrorReport.js'
import { optionalAuth, requireAdmin } from '../middleware/auth.js'

const router = Router()

/**
 * POST /api/errors
 * Receive error reports from frontend clients
 * Uses optional auth - captures userId if authenticated, but doesn't require it
 */
router.post('/', optionalAuth, async (req, res) => {
  try {
    const { level, message, timestamp, error, context } = req.body

    if (!level || !message) {
      return res.status(400).json({ error: 'Missing required fields: level, message' })
    }

    // Create fingerprint for deduplication
    const fingerprint = ErrorReport.createFingerprint(
      message,
      error?.name,
      error?.stack
    )

    // Check for existing error with same fingerprint (last 24 hours)
    const existingError = await ErrorReport.findOne({
      fingerprint,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    })

    if (existingError) {
      // Increment occurrence count instead of creating duplicate
      existingError.occurrences += 1
      existingError.lastSeen = new Date()
      // Update status back to new if it was resolved
      if (existingError.status === 'resolved') {
        existingError.status = 'new'
      }
      await existingError.save()

      return res.status(200).json({
        success: true,
        deduplicated: true,
        errorId: existingError._id,
        occurrences: existingError.occurrences
      })
    }

    // Create new error report
    // Prefer authenticated user ID over client-provided context
    const errorReport = new ErrorReport({
      level,
      message,
      errorName: error?.name,
      errorMessage: error?.message,
      stack: error?.stack,
      userId: req.user?.clerkUserId || req.auth?.userId || context?.userId,
      sessionId: context?.sessionId,
      appVersion: context?.appVersion,
      platform: context?.platform,
      url: context?.url,
      userAgent: context?.userAgent,
      extra: context?.extra,
      clientTimestamp: timestamp ? new Date(timestamp) : undefined,
      fingerprint,
      firstSeen: new Date(),
      lastSeen: new Date()
    })

    await errorReport.save()

    // Log to console for immediate visibility during development
    console.log(`[ErrorReport] ${level.toUpperCase()}: ${message}`)
    if (error?.stack) {
      console.log(`  Stack: ${error.stack.split('\n')[0]}`)
    }

    res.status(201).json({
      success: true,
      errorId: errorReport._id
    })
  } catch (err) {
    // Don't fail loudly - error reporting should be resilient
    console.error('[ErrorReport] Failed to save error:', err.message)
    res.status(500).json({ error: 'Failed to save error report' })
  }
})

/**
 * GET /api/errors
 * List error reports (admin only)
 */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const {
      status = 'new',
      level,
      platform,
      limit = 50,
      offset = 0
    } = req.query

    const query = {}
    if (status && status !== 'all') query.status = status
    if (level) query.level = level
    if (platform) query.platform = platform

    const [errors, total] = await Promise.all([
      ErrorReport.find(query)
        .sort({ lastSeen: -1 })
        .skip(parseInt(offset))
        .limit(parseInt(limit))
        .lean(),
      ErrorReport.countDocuments(query)
    ])

    res.json({
      errors,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    })
  } catch (err) {
    console.error('[ErrorReport] Failed to list errors:', err.message)
    res.status(500).json({ error: 'Failed to list errors' })
  }
})

/**
 * GET /api/errors/stats
 * Error statistics for dashboard (admin only)
 */
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const now = new Date()
    const last24h = new Date(now - 24 * 60 * 60 * 1000)
    const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000)

    const [
      totalNew,
      totalErrors24h,
      totalWarnings24h,
      byPlatform,
      byVersion,
      recentErrors
    ] = await Promise.all([
      ErrorReport.countDocuments({ status: 'new' }),
      ErrorReport.countDocuments({ level: 'error', createdAt: { $gte: last24h } }),
      ErrorReport.countDocuments({ level: 'warn', createdAt: { $gte: last24h } }),
      ErrorReport.aggregate([
        { $match: { createdAt: { $gte: last7d } } },
        { $group: { _id: '$platform', count: { $sum: 1 } } }
      ]),
      ErrorReport.aggregate([
        { $match: { createdAt: { $gte: last7d } } },
        { $group: { _id: '$appVersion', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]),
      ErrorReport.find({ status: 'new' })
        .sort({ lastSeen: -1 })
        .limit(10)
        .select('level message occurrences lastSeen platform appVersion')
        .lean()
    ])

    res.json({
      totalNew,
      last24h: {
        errors: totalErrors24h,
        warnings: totalWarnings24h
      },
      byPlatform: Object.fromEntries(byPlatform.map(p => [p._id || 'unknown', p.count])),
      byVersion: byVersion.map(v => ({ version: v._id || 'unknown', count: v.count })),
      recentErrors
    })
  } catch (err) {
    console.error('[ErrorReport] Failed to get stats:', err.message)
    res.status(500).json({ error: 'Failed to get error stats' })
  }
})

/**
 * PATCH /api/errors/:id
 * Update error status (mark as seen, resolved, ignored) - admin only
 */
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    const { status, notes } = req.body
    const update = {}

    if (status) {
      update.status = status
      if (status === 'resolved') {
        update.resolvedAt = new Date()
      }
    }
    if (notes !== undefined) {
      update.notes = notes
    }

    const error = await ErrorReport.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true }
    )

    if (!error) {
      return res.status(404).json({ error: 'Error not found' })
    }

    res.json(error)
  } catch (err) {
    console.error('[ErrorReport] Failed to update error:', err.message)
    res.status(500).json({ error: 'Failed to update error' })
  }
})

export default router

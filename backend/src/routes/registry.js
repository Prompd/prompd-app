import express from 'express'
import Joi from 'joi'
import { RegistryClientService } from '../services/RegistryClientService.js'
import { optionalAuth } from '../middleware/auth.js'
import { validateQuery } from '../middleware/validation.js'
import { rateLimit } from '../middleware/rateLimit.js'

const router = express.Router()
const registryClient = new RegistryClientService()

// Rate limiting for registry operations
const registryRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many registry requests'
})

const searchRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 60 searches per minute
  message: 'Too many search requests'
})

// Validation schemas
const searchQuerySchema = Joi.object({
  q: Joi.string().min(1).max(100).optional(),
  query: Joi.string().min(1).max(100).optional(),
  size: Joi.number().integer().min(1).max(50).default(20),
  from: Joi.number().integer().min(0).default(0),
  category: Joi.string().max(50).optional(),
  sortBy: Joi.string().valid('relevance', 'downloads', 'updated', 'created', 'name').default('relevance')
})

// Apply rate limiting
router.use(registryRateLimit)

/**
 * GET /api/registry/search
 * Proxy search requests to external registry with caching
 */
router.get('/search', searchRateLimit, optionalAuth, validateQuery(searchQuerySchema), async (req, res, next) => {
  try {
    const { q, query, size, from, category, sortBy } = req.query
    const searchQuery = q || query || ''

    const options = {
      size: parseInt(size),
      from: parseInt(from),
      category,
      sortBy
    }

    const result = await registryClient.searchPackages(searchQuery, options)

    res.json({
      success: true,
      data: {
        packages: result.objects || [],
        total: result.total || 0,
        pagination: {
          size: options.size,
          from: options.from,
          hasMore: (result.objects?.length || 0) === options.size
        }
      },
      cached: result.cached || false
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/registry/package/:name
 * Get package information with caching
 */
router.get('/package/:name', optionalAuth, async (req, res, next) => {
  try {
    const packageName = decodeURIComponent(req.params.name)
    const version = req.query.version

    const packageInfo = await registryClient.getPackageInfo(packageName, version)

    if (!packageInfo) {
      return res.status(404).json({
        success: false,
        error: 'Package not found in registry',
        code: 'PACKAGE_NOT_FOUND'
      })
    }

    res.json({
      success: true,
      data: packageInfo,
      cached: packageInfo.cached || false
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/registry/package/:name/versions
 * Get package versions
 */
router.get('/package/:name/versions', optionalAuth, async (req, res, next) => {
  try {
    const packageName = decodeURIComponent(req.params.name)

    const versions = await registryClient.getPackageVersions(packageName)

    res.json({
      success: true,
      data: versions,
      cached: versions.cached || false
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/registry/popular
 * Get popular packages with caching
 */
router.get('/popular', optionalAuth, async (req, res, next) => {
  try {
    const timeframe = req.query.timeframe || 'week'
    const limit = Math.min(parseInt(req.query.limit) || 10, 50)

    const packages = await registryClient.getPopularPackages({
      timeframe,
      limit
    })

    res.json({
      success: true,
      data: packages,
      cached: packages.cached || false
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/registry/categories
 * Get package categories with counts
 */
router.get('/categories', optionalAuth, async (req, res, next) => {
  try {
    const categories = await registryClient.getCategories()

    res.json({
      success: true,
      data: categories,
      cached: categories.cached || false
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/registry/featured
 * Get featured packages
 */
router.get('/featured', optionalAuth, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 6, 20)

    const packages = await registryClient.getFeaturedPackages({ limit })

    res.json({
      success: true,
      data: packages,
      cached: packages.cached || false
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/registry/recent
 * Get recently updated packages
 */
router.get('/recent', optionalAuth, async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50)
    const category = req.query.category

    const packages = await registryClient.getRecentPackages({
      limit,
      category
    })

    res.json({
      success: true,
      data: packages,
      cached: packages.cached || false
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/registry/suggestions
 * Get package suggestions based on query context
 */
router.get('/suggestions', optionalAuth, async (req, res, next) => {
  try {
    const query = req.query.q || req.query.query || ''
    const context = req.query.context || 'package'
    const limit = Math.min(parseInt(req.query.limit) || 10, 20)

    const suggestions = await registryClient.getSuggestions(query, context, { limit })

    res.json({
      success: true,
      data: suggestions,
      cached: suggestions.cached || false
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/registry/health
 * Check registry connectivity and status
 */
router.get('/health', async (req, res, next) => {
  try {
    const health = await registryClient.checkHealth()

    res.json({
      success: true,
      data: {
        status: health.status,
        responseTime: health.responseTime,
        timestamp: new Date().toISOString(),
        registryUrl: health.registryUrl
      }
    })
  } catch (error) {
    res.json({
      success: false,
      data: {
        status: 'unavailable',
        error: error.message,
        timestamp: new Date().toISOString()
      }
    })
  }
})

/**
 * POST /api/registry/cache/clear
 * Clear registry cache
 */
router.post('/cache/clear', optionalAuth, async (req, res, next) => {
  try {
    const pattern = req.body.pattern || '*'
    const result = await registryClient.clearCache(pattern)

    res.json({
      success: true,
      data: {
        clearedKeys: result.clearedKeys,
        message: `Cleared ${result.clearedKeys} cache entries`
      }
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/registry/stats
 * Get registry statistics
 */
router.get('/stats', optionalAuth, async (req, res, next) => {
  try {
    const stats = await registryClient.getRegistryStats()

    res.json({
      success: true,
      data: stats,
      cached: stats.cached || false
    })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/registry/webhook
 * Handle registry webhooks (package updates, etc.)
 */
router.post('/webhook', async (req, res, next) => {
  try {
    const event = req.body.event
    const payload = req.body.payload

    // Verify webhook signature if configured
    const signature = req.headers['x-registry-signature']
    if (!registryClient.verifyWebhookSignature(req.body, signature)) {
      return res.status(401).json({
        success: false,
        error: 'Invalid webhook signature',
        code: 'INVALID_SIGNATURE'
      })
    }

    await registryClient.handleWebhook(event, payload)

    res.json({
      success: true,
      message: 'Webhook processed successfully'
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/registry/package/:name/download
 * Proxy package download requests
 */
router.get('/package/:name/download', optionalAuth, async (req, res, next) => {
  try {
    const packageName = decodeURIComponent(req.params.name)
    const version = req.query.version || 'latest'

    const downloadInfo = await registryClient.getPackageDownload(packageName, version)

    if (!downloadInfo) {
      return res.status(404).json({
        success: false,
        error: 'Package download not available',
        code: 'DOWNLOAD_NOT_FOUND'
      })
    }

    // Redirect to actual download URL or proxy the download
    if (downloadInfo.redirectUrl) {
      res.redirect(302, downloadInfo.redirectUrl)
    } else {
      // Stream the package content
      res.setHeader('Content-Type', 'application/octet-stream')
      res.setHeader('Content-Disposition', `attachment; filename="${packageName}-${version}.pdpkg"`)
      
      const stream = await registryClient.getPackageStream(packageName, version)
      stream.pipe(res)
    }
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/registry/user/:username/packages
 * Get packages by user/organization
 */
router.get('/user/:username/packages', optionalAuth, async (req, res, next) => {
  try {
    const username = req.params.username
    const options = {
      limit: Math.min(parseInt(req.query.limit) || 20, 50),
      skip: parseInt(req.query.skip) || 0,
      sortBy: req.query.sortBy || 'updated'
    }

    const packages = await registryClient.getUserPackages(username, options)

    res.json({
      success: true,
      data: {
        packages: packages.packages || [],
        total: packages.total || 0,
        pagination: {
          limit: options.limit,
          skip: options.skip,
          hasMore: (packages.packages?.length || 0) === options.limit
        }
      },
      cached: packages.cached || false
    })
  } catch (error) {
    next(error)
  }
})

export default router
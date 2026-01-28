/**
 * Startup API Route
 * Public endpoint that provides news, platform info, and registry status
 * for the Prompd editor on startup
 */

import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const router = express.Router()

/**
 * Load news items from static config file
 * @returns {Array} News items array
 */
function getNewsItems() {
  try {
    const newsPath = path.join(__dirname, '../config/news.json')
    const data = fs.readFileSync(newsPath, 'utf-8')
    const items = JSON.parse(data)

    // Filter out expired items and sort by priority (desc) then date (desc)
    const now = new Date()
    return items
      .filter(item => !item.expiresAt || new Date(item.expiresAt) > now)
      .sort((a, b) => {
        const priorityDiff = (b.priority || 0) - (a.priority || 0)
        if (priorityDiff !== 0) return priorityDiff
        return new Date(b.date).getTime() - new Date(a.date).getTime()
      })
  } catch (error) {
    console.warn('Failed to load news config:', error.message)
    return []
  }
}

/**
 * GET /api/startup
 * Public endpoint - no authentication required
 * Returns platform info, registry status, and news items
 */
router.get('/', async (req, res) => {
  try {
    const news = getNewsItems()

    res.json({
      success: true,
      data: {
        platform: {
          latestVersion: process.env.PROMPD_VERSION || '1.0.0',
          downloadUrl: 'https://prompdhub.ai/download'
        },
        registry: {
          status: 'online',
          packageCount: 0, // Could query DB for real count
          featuredPackages: ['@prompd/examples']
        },
        news
      },
      timestamp: new Date().toISOString(),
      cacheUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour
    })
  } catch (error) {
    console.error('Startup endpoint error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch startup data'
    })
  }
})

export default router

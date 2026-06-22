/* External agent tools: web search (Tavily) + per-user tool key management. Keys
 * are encrypted server-side; calls use the user's key, else a Prompd-paid env key. */
import express from 'express'
import Joi from 'joi'
import { clerkAuth } from '../middleware/clerkAuth.js'
import { validate } from '../middleware/validation.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { encryptApiKey } from '../services/EncryptionService.js'
import { getToolKey, tavilySearch } from '../services/ToolsService.js'

const router = express.Router()

const toolsRateLimit = rateLimit({ windowMs: 60 * 1000, max: 60, message: 'Too many tool requests, slow down.' })

// Tools that support a Prompd-paid fallback, mapped to their env var.
const PAID_ENV = { tavily: 'TAVILY_API_KEY' }

const searchSchema = Joi.object({ query: Joi.string().min(1).max(2000).required() })
const keySchema = Joi.object({ apiKey: Joi.string().min(8).max(400).required() })

/** GET /api/tools — which tool keys the user has set + whether a paid fallback exists. */
router.get('/', clerkAuth, async (req, res) => {
  const tools = {}
  for (const [tool, env] of Object.entries(PAID_ENV)) {
    tools[tool] = {
      hasKey: !!req.user.getToolKeyData?.(tool)?.hasKey,
      paidFallback: !!process.env[env],
    }
  }
  res.json({ success: true, tools })
})

/** POST /api/tools/keys/:tool — store the user's key for a tool (encrypted). */
router.post('/keys/:tool', clerkAuth, validate(keySchema), async (req, res, next) => {
  try {
    const { tool } = req.params
    if (!(tool in PAID_ENV)) return res.status(400).json({ error: `Unknown tool: ${tool}` })
    const { encryptedKey, iv } = encryptApiKey(req.body.apiKey)
    req.user.setToolKey(tool, encryptedKey, iv)
    await req.user.save()
    res.json({ success: true, hasKey: true })
  } catch (error) { next(error) }
})

/** DELETE /api/tools/keys/:tool — remove the user's key for a tool. */
router.delete('/keys/:tool', clerkAuth, async (req, res, next) => {
  try {
    req.user.removeToolKey(req.params.tool)
    await req.user.save()
    res.json({ success: true, hasKey: false })
  } catch (error) { next(error) }
})

/** POST /api/tools/web-search — Tavily search via the user's key or the paid key. */
router.post('/web-search', toolsRateLimit, clerkAuth, validate(searchSchema), async (req, res, next) => {
  try {
    const got = getToolKey(req.user, 'tavily', 'TAVILY_API_KEY')
    if (!got) {
      return res.status(400).json({ error: 'No web-search key. Add a Tavily key in Settings → Tools.' })
    }
    const data = await tavilySearch(req.body.query, got.key)
    res.json({ success: true, data })
  } catch (error) { next(error) }
})

export default router

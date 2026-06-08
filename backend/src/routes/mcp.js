/* Remote MCP servers: per-user registration + a proxy for tools/list & tools/call.
 * Server bearer keys are encrypted server-side; the agent never holds them. */
import express from 'express'
import Joi from 'joi'
import crypto from 'crypto'
import { clerkAuth } from '../middleware/clerkAuth.js'
import { validate } from '../middleware/validation.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { encryptApiKey } from '../services/EncryptionService.js'
import * as mcp from '../services/McpProxyService.js'

const router = express.Router()
const mcpRateLimit = rateLimit({ windowMs: 60 * 1000, max: 120, message: 'Too many MCP requests, slow down.' })

/* In-memory per-user cache of the aggregated tools/list, so we don't re-handshake
 * every MCP server on every agent run. Invalidated when the user edits servers;
 * a short TTL backstops external changes. Pass ?fresh=1 to bypass. */
const TOOLS_TTL_MS = 60 * 1000
const toolsCache = new Map() // userId -> { ts, tools }
const cacheKey = (req) => String(req.user._id)
const invalidateTools = (req) => toolsCache.delete(cacheKey(req))

const addSchema = Joi.object({
  label: Joi.string().min(1).max(80).required(),
  url: Joi.string().uri({ scheme: ['http', 'https'] }).required(),
  apiKey: Joi.string().max(400).allow('').optional(),
})
const callSchema = Joi.object({
  serverId: Joi.string().required(),
  name: Joi.string().required(),
  args: Joi.object().unknown(true).default({}),
})

/** Strip secrets before returning a server to the client. */
const publicServer = (s) => ({ id: s.id, label: s.label, url: s.url, hasKey: !!s.encryptedKey })

/** Normalize a stored server (Mongoose subdoc or plain) to a plain object. */
const plain = (s) => (s && typeof s.toObject === 'function' ? s.toObject() : s)

router.get('/servers', clerkAuth, async (req, res) => {
  res.json({ success: true, servers: req.user.listMcpServers().map(publicServer) })
})

router.post('/servers', clerkAuth, validate(addSchema), async (req, res, next) => {
  try {
    const { label, url, apiKey } = req.body
    const id = crypto.randomUUID()
    const server = { label, url }
    if (apiKey) {
      const { encryptedKey, iv } = encryptApiKey(apiKey)
      server.encryptedKey = encryptedKey
      server.iv = iv
    }
    req.user.setMcpServer(id, server)
    await req.user.save()
    invalidateTools(req)
    res.json({ success: true, server: publicServer({ id, ...server }) })
  } catch (error) { next(error) }
})

router.delete('/servers/:id', clerkAuth, async (req, res, next) => {
  try {
    req.user.removeMcpServer(req.params.id)
    await req.user.save()
    invalidateTools(req)
    res.json({ success: true })
  } catch (error) { next(error) }
})

/** GET /api/mcp/tools — aggregate tools/list across the user's servers. Per-server
 * failures are reported inline (as {error}) so one bad server can't break the set. */
router.get('/tools', mcpRateLimit, clerkAuth, async (req, res) => {
  const fresh = req.query.fresh === '1' || req.query.fresh === 'true'
  const cached = toolsCache.get(cacheKey(req))
  if (!fresh && cached && Date.now() - cached.ts < TOOLS_TTL_MS) {
    return res.json({ success: true, tools: cached.tools, cached: true })
  }
  const servers = req.user.listMcpServers()
  const tools = []
  for (const s of servers) {
    try {
      const list = await mcp.listTools(s)
      for (const t of list) tools.push({ serverId: s.id, serverLabel: s.label, ...t })
    } catch (error) {
      tools.push({ serverId: s.id, serverLabel: s.label, error: String(error?.message || error) })
    }
  }
  toolsCache.set(cacheKey(req), { ts: Date.now(), tools })
  res.json({ success: true, tools })
})

/** POST /api/mcp/call — proxy a single tools/call to one of the user's servers. */
router.post('/call', mcpRateLimit, clerkAuth, validate(callSchema), async (req, res, next) => {
  try {
    const { serverId, name, args } = req.body
    const server = req.user.getMcpServer(serverId)
    if (!server) return res.status(404).json({ error: 'MCP server not found' })
    const data = await mcp.callTool({ id: serverId, ...plain(server) }, name, args)
    res.json({ success: true, data })
  } catch (error) { next(error) }
})

export default router

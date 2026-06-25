/**
 * Feature entitlements — the AUTHORITATIVE check the web app's feature guards call.
 *
 *   GET /api/v1/entitlements?feature=<id>   (Clerk Bearer)
 *     -> { allowed: boolean, reason?: string,
 *          action?: { kind: 'sign-in' | 'upgrade', label?: string } }
 *
 * Reuses the same quota logic as /api/ai/quota (validateAiQuota) so there's one
 * source of truth for "can this user run an LLM action". Unknown features are
 * allowed (the web app gates those elsewhere); errors fail open.
 */
import express from 'express'
import { clerkAuth } from '../middleware/clerkAuth.js'
import { validateAiQuota } from '../middleware/aiQuota.js'

const router = express.Router()

// Map a web-app feature id to a quota operation. 'llm-execution' = running a prompt.
const FEATURE_OPERATION = {
  'llm-execution': 'execute',
}

router.get('/', clerkAuth, async (req, res) => {
  try {
    const feature = String(req.query.feature || '')
    const operation = FEATURE_OPERATION[feature]

    // Not a quota-gated feature here — let the client's own guards decide.
    if (!operation) return res.json({ allowed: true })

    const verdict = await validateAiQuota(req.user, operation)
    if (verdict.allowed) return res.json({ allowed: true })

    return res.json({
      allowed: false,
      reason: verdict.reason || 'Not available on your current plan.',
      action: {
        kind: 'upgrade',
        label: verdict.canAddApiKey ? 'Add your API key or upgrade' : 'Upgrade',
      },
    })
  } catch (error) {
    console.error('Entitlements check failed:', error)
    return res.json({ allowed: true }) // fail open — never block on a check error
  }
})

export default router

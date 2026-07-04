/* Shared server-key access gate for execution paths that may fall back to OUR
 * provider env keys (the compilation/execute seam). Pure decision logic so every
 * caller enforces the SAME free-tier allowlist + quota instead of re-deciding
 * per route (the chat gateway's inline block was the only enforcement before). */
import { validateAiQuota } from '../middleware/aiQuota.js'
import { isFreeAllowedModel, isUnmeteredPlan, ALLOWED_GATEWAY_MODELS } from '../config/freeTier.js'

/**
 * Decide whether `user` may run `model` on the server env key for `provider`.
 * Returns { allowed:true, meter:boolean } when permitted (meter=true means the
 * caller must incrementAiUsage after a successful run), or
 * { allowed:false, status, code, message } to surface as an HTTP error.
 *
 * @param {object} args
 * @param {object} args.user
 * @param {string} args.provider
 * @param {string} args.model
 */
export async function resolveServerKeyAccess({ user, provider, model }) {
  // Enterprise/admin: unmetered server key, any model.
  if (isUnmeteredPlan(user)) return { allowed: true, meter: false }

  // Free server-key path: only the allowlisted cheap models may run on our key.
  if (!isFreeAllowedModel(model)) {
    return {
      allowed: false,
      status: 403,
      code: 'MODEL_NOT_ALLOWED',
      message: `Model "${model}" isn't available on the free tier. Add your own ${provider} API key in provider settings for full access, or choose one of: ${[...ALLOWED_GATEWAY_MODELS].join(', ')}.`,
    }
  }

  // Metered by the account's execution quota. serverProvider scopes the own-key
  // unlimited exemption to the provider whose server key we're about to spend.
  const quota = await validateAiQuota(user, 'execute', { serverProvider: provider })
  if (!quota.allowed) {
    return {
      allowed: false,
      status: 402,
      code: 'QUOTA_EXCEEDED',
      message: `Free execution limit reached (${quota.reason}). Add your own ${provider} API key in provider settings for unlimited use${quota.upgradeRequired ? `, or upgrade to ${quota.upgradeRequired}` : ''}.`,
    }
  }
  return { allowed: true, meter: true }
}

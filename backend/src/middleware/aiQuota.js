/**
 * AI Quota Management Middleware
 * Handles quota validation and tracking for AI generation and execution features
 */
import { PLANS, normalizePlan } from '../config/plans.js'

/**
 * Get AI quota configuration for a subscription plan.
 * @param {string} plan - a CANONICAL plan name (see config/plans.js). Raw registry
 *   ids (`team_plan`) must be passed through normalizePlan first.
 * @returns {object} Quota configuration
 */
export function getAiQuotaForPlan(plan) {
  // Metered allowance on OUR server key. Own-key users are unlimited on every plan
  // (see validateAiQuota), so these ceilings only bind users spending our tokens.
  const metered = {
    generations: { limit: 5, resetType: 'lifetime' },
    executions: { limit: 10, resetType: 'lifetime' }
  }
  const unlimited = {
    generations: { limit: -1, resetType: 'unlimited' },
    executions: { limit: -1, resetType: 'unlimited' }
  }

  // Every canonical plan appears here. A plan missing from this table is exactly how
  // a paying Team subscriber silently received the free tier.
  const quotas = {
    [PLANS.FREE]: metered,
    [PLANS.PRO]: metered, // same as free - unlimited only with own key
    [PLANS.TEAM]: metered,
    [PLANS.ENTERPRISE]: unlimited,
    [PLANS.ADMIN]: unlimited
  }

  const quota = quotas[plan]
  if (quota) return quota

  // Reaching here means a value bypassed normalizePlan (e.g. a raw registry id) or
  // the registry shipped a plan this table does not know. Both silently downgrade a
  // paying user, so neither may be quiet.
  console.warn(
    `[plans] no AI quota for plan "${plan}" - serving the metered tier. ` +
    `Normalize with normalizePlan() and add new plans to getAiQuotaForPlan.`
  )
  return metered
}

/**
 * Helper to get provider config from Map or plain object
 */
const getUserProviderConfig = (providers, providerId) => {
  if (!providers) return null
  if (typeof providers.get === 'function') {
    return providers.get(providerId)
  }
  return providers[providerId]
}

/**
 * Validate if user can perform an AI operation
 * @param {object} user - User document from database
 * @param {string} operation - Operation type ('generate' or 'execute')
 * @param {object} [opts]
 * @param {string} [opts.serverProvider] - When the operation runs on OUR server key
 *   for a SPECIFIC provider (e.g. the chat gateway uses the server OpenAI key),
 *   only that provider's OWN key grants unlimited — a key for a different provider
 *   does NOT, since it wouldn't pay for this request. Omit for provider-agnostic
 *   paths (any own key = unlimited), preserving the original behavior.
 * @returns {Promise<object>} Validation result
 */
export async function validateAiQuota(user, operation, opts = {}) {
  const field = operation === 'generate' ? 'generations' : 'executions'
  const { serverProvider } = opts

  // If user has own API key, unlimited (they pay the provider directly). When the
  // request would run on OUR server key for a specific provider, the own key must
  // be for THAT provider — otherwise an Anthropic-only user would ride the server
  // OpenAI key unmetered forever.
  const providers = user.aiFeatures?.llmProviders
  const hasKeyFor = (id) => !!getUserProviderConfig(providers, id)?.hasKey
  const hasOwnKey = serverProvider
    ? hasKeyFor(serverProvider)
    : (hasKeyFor('anthropic') || hasKeyFor('openai'))

  if (hasOwnKey) {
    return { allowed: true, unlimited: true }
  }

  // Enterprise and admin plans get unlimited with server key. Normalize at READ:
  // boundary normalization only runs when a record is created, so documents written
  // earlier still hold raw registry ids (enterprise_plan) and would be mis-tiered.
  const plan = normalizePlan(user.subscription?.plan)
  if (plan === PLANS.ENTERPRISE || plan === PLANS.ADMIN) {
    return { allowed: true, unlimited: true }
  }

  // Check quota
  const used = user.aiFeatures?.[field]?.used || 0
  const limit = user.aiFeatures?.[field]?.limit || (operation === 'generate' ? 5 : 10)

  if (used >= limit) {
    return {
      allowed: false,
      reason: `${operation} quota exceeded (${used}/${limit})`,
      upgradeRequired: plan === PLANS.FREE ? PLANS.PRO : null,
      canAddApiKey: true
    }
  }

  return {
    allowed: true,
    remaining: limit - used
  }
}

/**
 * Increment AI usage counter for user
 * @param {object} user - User document from database
 * @param {string} operation - Operation type ('generate' or 'execute')
 */
export async function incrementAiUsage(user, operation) {
  const field = operation === 'generate' ? 'generations' : 'executions'

  // Initialize aiFeatures if not exists
  if (!user.aiFeatures) {
    user.aiFeatures = {
      generations: { used: 0, limit: 5 },
      executions: { used: 0, limit: 10 },
      llmProviders: { anthropic: {}, openai: {} },
      history: { totalGenerations: 0, totalExecutions: 0 }
    }
  }

  // Initialize field if not exists
  if (!user.aiFeatures[field]) {
    user.aiFeatures[field] = {
      used: 0,
      limit: operation === 'generate' ? 5 : 10
    }
  }

  // Initialize history if not exists
  if (!user.aiFeatures.history) {
    user.aiFeatures.history = {
      totalGenerations: 0,
      totalExecutions: 0
    }
  }

  // Increment counters
  user.aiFeatures[field].used += 1

  if (operation === 'generate') {
    user.aiFeatures.history.totalGenerations += 1
    user.aiFeatures.history.lastGeneratedAt = new Date()
  } else {
    user.aiFeatures.history.totalExecutions += 1
    user.aiFeatures.history.lastExecutedAt = new Date()
  }

  await user.save()
}

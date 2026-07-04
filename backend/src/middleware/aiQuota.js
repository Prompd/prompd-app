/**
 * AI Quota Management Middleware
 * Handles quota validation and tracking for AI generation and execution features
 */

/**
 * Get AI quota configuration for a subscription plan
 * @param {string} plan - Subscription plan (free, pro, enterprise)
 * @returns {object} Quota configuration
 */
export function getAiQuotaForPlan(plan) {
  const quotas = {
    free: {
      generations: { limit: 5, resetType: 'lifetime' },
      executions: { limit: 10, resetType: 'lifetime' }
    },
    pro: {
      // Same as free - unlimited only with own key
      generations: { limit: 5, resetType: 'lifetime' },
      executions: { limit: 10, resetType: 'lifetime' }
    },
    enterprise: {
      // Unlimited regardless of key
      generations: { limit: -1, resetType: 'unlimited' },
      executions: { limit: -1, resetType: 'unlimited' }
    }
  }
  return quotas[plan] || quotas.free
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

  // Enterprise and admin plans get unlimited with server key
  if (user.subscription?.plan === 'enterprise' || user.subscription?.plan === 'admin') {
    return { allowed: true, unlimited: true }
  }

  // Check quota
  const used = user.aiFeatures?.[field]?.used || 0
  const limit = user.aiFeatures?.[field]?.limit || (operation === 'generate' ? 5 : 10)

  if (used >= limit) {
    return {
      allowed: false,
      reason: `${operation} quota exceeded (${used}/${limit})`,
      upgradeRequired: user.subscription?.plan === 'free' ? 'pro' : null,
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

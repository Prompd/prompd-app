/* Atomic AI-execution quota reservation. The old flow was check-then-act:
 * validateAiQuota() read `used`, then incrementAiUsage() wrote `used+1` later —
 * so N concurrent requests all passed the read before any write and blew past the
 * free cap. reserveAiExecution() collapses that into ONE conditional $inc guarded
 * by `used < limit`, so the database itself enforces the ceiling under concurrency.
 *
 * Unlimited users (own key for the server provider, or enterprise/admin) reserve
 * nothing. On upstream failure the caller refunds with refundAiExecution(). */
import { User as DefaultUser } from '../models/User.js'
import { isUnmeteredPlan } from '../config/freeTier.js'

const providerConfig = (providers, id) => {
  if (!providers) return null
  return typeof providers.get === 'function' ? providers.get(id) : providers[id]
}

const FIELD = { generate: 'generations', execute: 'executions' }
const DEFAULT_LIMIT = { generate: 5, execute: 10 }

/**
 * Atomically reserve one unit of the operation's quota.
 * @param {object} user
 * @param {object} opts
 * @param {string} [opts.operation='execute']
 * @param {string} [opts.serverProvider] - own key for THIS provider grants unlimited
 * @param {object} [opts.model] - injectable Mongoose model (tests); defaults to User
 * @returns {Promise<{allowed:boolean, metered:boolean, status?:number, reason?:string, upgradeRequired?:string|null}>}
 */
export async function reserveAiExecution(user, opts = {}) {
  const operation = opts.operation || 'execute'
  const Model = opts.model || DefaultUser
  const field = FIELD[operation] || 'executions'

  // Unlimited paths reserve nothing (they don't consume the metered counter).
  const hasKey = opts.serverProvider
    ? !!providerConfig(user.aiFeatures?.llmProviders, opts.serverProvider)?.hasKey
    : (!!providerConfig(user.aiFeatures?.llmProviders, 'openai')?.hasKey || !!providerConfig(user.aiFeatures?.llmProviders, 'anthropic')?.hasKey)
  if (hasKey || isUnmeteredPlan(user)) return { allowed: true, metered: false }

  const limit = user.aiFeatures?.[field]?.limit ?? DEFAULT_LIMIT[operation]
  const usedPath = `aiFeatures.${field}.used`
  const totalPath = operation === 'generate' ? 'aiFeatures.history.totalGenerations' : 'aiFeatures.history.totalExecutions'
  const stampPath = operation === 'generate' ? 'aiFeatures.history.lastGeneratedAt' : 'aiFeatures.history.lastExecutedAt'

  // The filter's `used < limit` guard is what makes this atomic: two racing calls
  // can't both match when only one slot remains.
  const { modifiedCount } = await Model.updateOne(
    { _id: user._id, [usedPath]: { $lt: limit } },
    { $inc: { [usedPath]: 1, [totalPath]: 1 }, $set: { [stampPath]: new Date() } },
  )

  if (modifiedCount === 1) return { allowed: true, metered: true }
  return {
    allowed: false,
    metered: false,
    status: 402,
    reason: `${operation} quota exceeded (${limit}/${limit})`,
    upgradeRequired: user.subscription?.plan === 'free' ? 'pro' : null,
  }
}

/** Give back a reserved unit when the run failed after reserving. Never drops below 0. */
export async function refundAiExecution(user, opts = {}) {
  const operation = opts.operation || 'execute'
  const Model = opts.model || DefaultUser
  const field = FIELD[operation] || 'executions'
  const usedPath = `aiFeatures.${field}.used`
  try {
    await Model.updateOne(
      { _id: user._id, [usedPath]: { $gt: 0 } },
      { $inc: { [usedPath]: -1 } },
    )
  } catch (e) {
    console.error('[aiReserve] refund failed:', e.message)
  }
}

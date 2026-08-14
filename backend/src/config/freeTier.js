/* Free-tier server-key policy — the ONE place the backend decides which models a
 * user with no own key may run on OUR provider keys. Both the chat-completions
 * gateway and the compilation/execute seam import this, so a new execution route
 * can't silently ship a different (or absent) allowlist.
 *
 * NOTE: the web client mirrors this list for its picker UX
 * (prompd-web src/lib/models.ts ALLOWED_GATEWAY_MODELS) — that copy is only a
 * hint; THIS is the enforced gate. Widen both together. */

import { PLANS, normalizePlan } from './plans.js'

/** Models the free server key is allowed to run. Own-key users are unrestricted. */
export const ALLOWED_GATEWAY_MODELS = new Set(['gpt-4.1-mini', 'gpt-4o-mini'])

export function isFreeAllowedModel(model) {
  return ALLOWED_GATEWAY_MODELS.has(model)
}

/** True for plans that get the server key unmetered regardless of own-key status. */
export function isUnmeteredPlan(user) {
  // Normalized at read: records created before boundary normalization still hold raw
  // registry ids (enterprise_plan), which would otherwise read as metered.
  const plan = normalizePlan(user?.subscription?.plan)
  return plan === PLANS.ENTERPRISE || plan === PLANS.ADMIN
}

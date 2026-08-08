/* The ONE plan vocabulary this backend speaks.
 *
 * The registry (registry.prompdhub.ai) is the source of truth for plan identity:
 * `GET /user/plan` returns `currentPlan.name = <plan id>` -- `free_plan`, `pro_plan`,
 * `team_plan`, `enterprise_plan`, `admin` -- and the auth middleware stores that
 * string on `user.subscription.plan`.
 *
 * Everything downstream (aiQuota, aiReserve, freeTier) compares against the SHORT
 * names below. Before this module those two vocabularies were never reconciled, so
 * `team_plan` matched no quota key and fell through to free -- silently. A paying
 * Team subscriber got the free tier and nothing logged it.
 *
 * normalizePlan() is the single boundary that translates. Call it wherever a plan
 * value ENTERS the system (the auth middlewares); never compare raw registry ids
 * downstream. */

/** Canonical plan names. The only values that should ever be stored or compared. */
export const PLANS = Object.freeze({
  FREE: 'free',
  PRO: 'pro',
  TEAM: 'team',
  ENTERPRISE: 'enterprise',
  ADMIN: 'admin',
})

/** Registry plan id -> canonical name. Canonical names map to themselves so the
 * function is idempotent and safe to apply to an already-normalized value. */
const FROM_REGISTRY = Object.freeze({
  free_plan: PLANS.FREE,
  pro_plan: PLANS.PRO,
  team_plan: PLANS.TEAM,
  enterprise_plan: PLANS.ENTERPRISE,
  admin: PLANS.ADMIN,
  free: PLANS.FREE,
  pro: PLANS.PRO,
  team: PLANS.TEAM,
  enterprise: PLANS.ENTERPRISE,
})

/**
 * Translate any inbound plan value to a canonical name.
 *
 * An absent value is normal (unauthenticated, or a user record created before the
 * plan was known) and resolves quietly to free. An UNRECOGNIZED value is not normal:
 * it means the registry shipped a plan this app does not know about, and the user is
 * about to be silently downgraded. That warns, because silence is what let the
 * original mismatch survive.
 *
 * @param {string|null|undefined} raw
 * @returns {string} one of PLANS
 */
export function normalizePlan(raw) {
  if (raw === null || raw === undefined || raw === '') return PLANS.FREE

  const key = String(raw).trim().toLowerCase()
  if (key === '') return PLANS.FREE

  const canonical = FROM_REGISTRY[key]
  if (canonical) return canonical

  console.warn(
    `[plans] unrecognized plan "${raw}" -- treating as ${PLANS.FREE}. ` +
    `If the registry added a plan, add it to FROM_REGISTRY in config/plans.js.`
  )
  return PLANS.FREE
}

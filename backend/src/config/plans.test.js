import { describe, it, expect, jest } from '@jest/globals'
import { PLANS, normalizePlan } from './plans.js'

/* The registry is the source of truth for plan identity: /user/plan returns
 * `currentPlan.name = <plan id>` (free_plan, pro_plan, team_plan, enterprise_plan,
 * admin) and this app stored that string verbatim, then compared it against its own
 * short vocabulary ('free', 'pro', 'enterprise'). Nothing matched for team, and the
 * fallback was SILENT -- a Team subscriber received free quotas. normalizePlan is the
 * single boundary that translates, so every consumer downstream sees one vocabulary. */
describe('normalizePlan', () => {
  it('maps every registry plan id to its canonical name', () => {
    expect(normalizePlan('free_plan')).toBe(PLANS.FREE)
    expect(normalizePlan('pro_plan')).toBe(PLANS.PRO)
    expect(normalizePlan('team_plan')).toBe(PLANS.TEAM)
    expect(normalizePlan('enterprise_plan')).toBe(PLANS.ENTERPRISE)
    expect(normalizePlan('admin')).toBe(PLANS.ADMIN)
  })

  it('passes canonical names through unchanged (idempotent)', () => {
    for (const p of Object.values(PLANS)) {
      expect(normalizePlan(p)).toBe(p)
      expect(normalizePlan(normalizePlan(p))).toBe(p)
    }
  })

  it('tolerates casing and surrounding whitespace', () => {
    expect(normalizePlan(' Team_Plan ')).toBe(PLANS.TEAM)
    expect(normalizePlan('PRO')).toBe(PLANS.PRO)
  })

  it('falls back to free for null/undefined WITHOUT warning (an unauthenticated or new user is normal)', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    expect(normalizePlan(undefined)).toBe(PLANS.FREE)
    expect(normalizePlan(null)).toBe(PLANS.FREE)
    expect(normalizePlan('')).toBe(PLANS.FREE)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('falls back to free for an UNKNOWN plan but warns loudly', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    expect(normalizePlan('platinum_plan')).toBe(PLANS.FREE)
    expect(warn).toHaveBeenCalled()
    expect(String(warn.mock.calls[0][0])).toMatch(/platinum_plan/)
    warn.mockRestore()
  })
})

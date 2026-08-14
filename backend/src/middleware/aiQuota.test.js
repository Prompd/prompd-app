import { describe, it, expect, jest } from '@jest/globals'
import { validateAiQuota, getAiQuotaForPlan } from './aiQuota.js'
import { PLANS } from '../config/plans.js'

/* Every canonical plan must have a quota entry. The old table had only free/pro/
 * enterprise, so `quotas[plan] || quotas.free` silently served free limits to a
 * paying Team subscriber -- and logged nothing. */
describe('getAiQuotaForPlan covers every canonical plan', () => {
  it('returns an entry for each plan without falling back', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    for (const plan of Object.values(PLANS)) {
      const q = getAiQuotaForPlan(plan)
      // jest's expect takes no message argument, so name the plan in the value.
      expect({ plan, defined: q !== undefined }).toEqual({ plan, defined: true })
      expect(typeof q.executions.limit).toBe('number')
      expect(typeof q.generations.limit).toBe('number')
    }
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('gives enterprise and admin unlimited, and team the metered server-key allowance', () => {
    expect(getAiQuotaForPlan(PLANS.ENTERPRISE).executions.limit).toBe(-1)
    expect(getAiQuotaForPlan(PLANS.ADMIN).executions.limit).toBe(-1)
    expect(getAiQuotaForPlan(PLANS.TEAM).executions.limit).toBe(10)
  })

  it('warns loudly instead of silently downgrading an unrecognized plan', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const q = getAiQuotaForPlan('platinum') // never normalized, unknown to both systems
    expect(q.executions.limit).toBe(10)
    expect(warn).toHaveBeenCalled()
    expect(String(warn.mock.calls[0][0])).toMatch(/platinum/)
    warn.mockRestore()
  })
})

/* Boundary normalization only runs when a user record is CREATED. Records written
 * before it existed still hold raw registry ids, so every consumer must normalize
 * what it reads or those users stay mis-tiered forever. */
describe('legacy stored plan ids are honored at read time', () => {
  it('treats a stored enterprise_plan as unmetered', async () => {
    const legacy = {
      aiFeatures: { executions: { used: 99, limit: 10 }, generations: { used: 99, limit: 5 }, llmProviders: {} },
      subscription: { plan: 'enterprise_plan' },
    }
    const v = await validateAiQuota(legacy, 'execute')
    expect(v.allowed).toBe(true)
    expect(v.unlimited).toBe(true)
  })

  it('offers a free upgrade hint to a stored free_plan user who is out of quota', async () => {
    const legacy = {
      aiFeatures: { executions: { used: 10, limit: 10 }, generations: { used: 0, limit: 5 }, llmProviders: {} },
      subscription: { plan: 'free_plan' },
    }
    const v = await validateAiQuota(legacy, 'execute')
    expect(v.allowed).toBe(false)
    expect(v.upgradeRequired).toBe('pro') // was null: 'free_plan' !== 'free'
  })
})

// Minimal user doc shape validateAiQuota reads.
const user = (over = {}) => ({
  aiFeatures: { executions: { used: 0, limit: 10 }, generations: { used: 0, limit: 5 }, llmProviders: {} },
  subscription: { plan: 'free' },
  ...over,
})
const withKey = (provider) => user({ aiFeatures: { executions: { used: 20, limit: 10 }, llmProviders: { [provider]: { hasKey: true } } } })

describe('validateAiQuota — provider-scoped own-key unlimited', () => {
  it('an OpenAI own-key user is unlimited for an OpenAI-server-key operation', async () => {
    const v = await validateAiQuota(withKey('openai'), 'execute', { serverProvider: 'openai' })
    expect(v.allowed).toBe(true)
    expect(v.unlimited).toBe(true)
  })

  it('an ANTHROPIC-only-key user is NOT unlimited when the op runs on the OpenAI server key', async () => {
    // The bug: getOpenAIKey returns null (no OpenAI key) so the request falls to the
    // server OpenAI key, but the old check treated ANY provider key as unlimited.
    const v = await validateAiQuota(withKey('anthropic'), 'execute', { serverProvider: 'openai' })
    expect(v.allowed).toBe(false)
    expect(v.reason).toMatch(/quota/i)
  })

  it('without serverProvider, any own key is unlimited (back-compat for generate)', async () => {
    expect((await validateAiQuota(withKey('anthropic'), 'generate')).unlimited).toBe(true)
    expect((await validateAiQuota(withKey('openai'), 'generate')).unlimited).toBe(true)
  })

  it('enterprise stays unlimited on the server key regardless of provider', async () => {
    const u = user({ subscription: { plan: 'enterprise' }, aiFeatures: { executions: { used: 99, limit: 10 }, llmProviders: {} } })
    expect((await validateAiQuota(u, 'execute', { serverProvider: 'openai' })).unlimited).toBe(true)
  })

  it('a keyless free user under the cap is allowed, over the cap is blocked', async () => {
    expect((await validateAiQuota(user(), 'execute', { serverProvider: 'openai' })).allowed).toBe(true)
    const over = user({ aiFeatures: { executions: { used: 10, limit: 10 }, llmProviders: {} } })
    expect((await validateAiQuota(over, 'execute', { serverProvider: 'openai' })).allowed).toBe(false)
  })
})

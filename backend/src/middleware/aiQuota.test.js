import { describe, it, expect } from '@jest/globals'
import { validateAiQuota } from './aiQuota.js'

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

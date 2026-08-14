import { describe, it, expect } from '@jest/globals'
import { resolveServerKeyAccess } from './serverKeyAccess.js'

const freeUser = (over = {}) => ({
  aiFeatures: { executions: { used: 0, limit: 10 }, llmProviders: {} },
  subscription: { plan: 'free' },
  ...over,
})

describe('resolveServerKeyAccess', () => {
  it('allows an allowlisted model for a free user under quota, and marks it metered', async () => {
    const r = await resolveServerKeyAccess({ user: freeUser(), provider: 'openai', model: 'gpt-4o-mini' })
    expect(r).toEqual({ allowed: true, meter: true })
  })

  it('403s a non-allowlisted model on the free server key', async () => {
    const r = await resolveServerKeyAccess({ user: freeUser(), provider: 'openai', model: 'gpt-4o' })
    expect(r.allowed).toBe(false)
    expect(r.status).toBe(403)
    expect(r.code).toBe('MODEL_NOT_ALLOWED')
  })

  it('402s an allowlisted model when the free quota is exhausted', async () => {
    const over = freeUser({ aiFeatures: { executions: { used: 10, limit: 10 }, llmProviders: {} } })
    const r = await resolveServerKeyAccess({ user: over, provider: 'openai', model: 'gpt-4o-mini' })
    expect(r.allowed).toBe(false)
    expect(r.status).toBe(402)
    expect(r.code).toBe('QUOTA_EXCEEDED')
  })

  it('does NOT exempt an anthropic-only-key user from the OpenAI server-key quota', async () => {
    const u = freeUser({ aiFeatures: { executions: { used: 10, limit: 10 }, llmProviders: { anthropic: { hasKey: true } } } })
    const r = await resolveServerKeyAccess({ user: u, provider: 'openai', model: 'gpt-4o-mini' })
    expect(r.allowed).toBe(false)
    expect(r.status).toBe(402)
  })

  it('enterprise runs any model on the server key, unmetered', async () => {
    const ent = freeUser({ subscription: { plan: 'enterprise' } })
    const r = await resolveServerKeyAccess({ user: ent, provider: 'openai', model: 'gpt-4o' })
    expect(r).toEqual({ allowed: true, meter: false })
  })
})

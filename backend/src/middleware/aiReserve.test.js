import { describe, it, expect } from '@jest/globals'
import { reserveAiExecution, refundAiExecution } from './aiReserve.js'

// Fake User model capturing the atomic updateOne filter/update.
function fakeModel(modifiedCount) {
  const calls = []
  return {
    calls,
    updateOne: async (filter, update) => { calls.push({ filter, update }); return { modifiedCount } },
  }
}

const meteredUser = (over = {}) => ({
  _id: 'u1',
  aiFeatures: { executions: { used: 0, limit: 10 }, llmProviders: {} },
  subscription: { plan: 'free' },
  ...over,
})

describe('reserveAiExecution — atomic reserve, no check-then-act race', () => {
  it('own-key user for the same provider is unlimited and reserves nothing', async () => {
    const model = fakeModel(0)
    const u = meteredUser({ aiFeatures: { executions: { used: 0, limit: 10 }, llmProviders: { openai: { hasKey: true } } } })
    const r = await reserveAiExecution(u, { serverProvider: 'openai', model })
    expect(r.allowed).toBe(true)
    expect(r.metered).toBe(false)
    expect(model.calls).toHaveLength(0) // no DB write for unlimited users
  })

  it('enterprise is unlimited and reserves nothing', async () => {
    const model = fakeModel(0)
    const r = await reserveAiExecution(meteredUser({ subscription: { plan: 'enterprise' } }), { serverProvider: 'openai', model })
    expect(r).toMatchObject({ allowed: true, metered: false })
    expect(model.calls).toHaveLength(0)
  })

  it('metered user under the cap: the guarded $inc modifies one doc -> allowed', async () => {
    const model = fakeModel(1)
    const r = await reserveAiExecution(meteredUser(), { serverProvider: 'openai', model })
    expect(r).toMatchObject({ allowed: true, metered: true })
    // The reservation is a single conditional update (filter carries the used<limit guard).
    expect(model.calls).toHaveLength(1)
    expect(JSON.stringify(model.calls[0].update)).toMatch(/\$inc/)
  })

  it('metered user at the cap: the guarded $inc matches nothing -> denied', async () => {
    const model = fakeModel(0)
    const r = await reserveAiExecution(meteredUser({ aiFeatures: { executions: { used: 10, limit: 10 }, llmProviders: {} } }), { serverProvider: 'openai', model })
    expect(r.allowed).toBe(false)
    expect(r.status).toBe(402)
  })

  it('two concurrent reservations near the cap: only as many as the DB allows succeed', async () => {
    // Simulate the DB granting exactly one reservation (the second guarded update
    // matches nothing because used already hit the limit).
    let remaining = 1
    const model = {
      updateOne: async () => ({ modifiedCount: remaining-- > 0 ? 1 : 0 }),
    }
    const u = meteredUser({ aiFeatures: { executions: { used: 9, limit: 10 }, llmProviders: {} } })
    const [a, b] = await Promise.all([
      reserveAiExecution(u, { serverProvider: 'openai', model }),
      reserveAiExecution(u, { serverProvider: 'openai', model }),
    ])
    const allowed = [a, b].filter((r) => r.allowed).length
    expect(allowed).toBe(1) // the cap held under concurrency
  })
})

describe('refundAiExecution', () => {
  it('decrements used (never below zero) on a failed run', async () => {
    const model = fakeModel(1)
    await refundAiExecution({ _id: 'u1' }, { model })
    expect(model.calls).toHaveLength(1)
    expect(JSON.stringify(model.calls[0].update)).toMatch(/\$inc/)
  })
})

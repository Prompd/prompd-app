import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { CompilationService } from './CompilationService.js'
import { encryptApiKey } from './EncryptionService.js'

// A free user with no own key: the execute() env-key fallback must gate them.
const freeUser = (over = {}) => ({
  _id: 'u1',
  aiFeatures: { executions: { used: 0, limit: 10 }, llmProviders: {} },
  subscription: { plan: 'free' },
  save: async () => {},
  ...over,
})

let svc
const prevKey = process.env.OPENAI_API_KEY
const prevSecret = process.env.ENCRYPTION_SECRET
beforeAll(() => {
  process.env.OPENAI_API_KEY = 'sk-test-server-key'
  process.env.ENCRYPTION_SECRET = 'test-encryption-secret'
  svc = new CompilationService()
})
afterAll(() => {
  if (prevKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = prevKey
  if (prevSecret === undefined) delete process.env.ENCRYPTION_SECRET; else process.env.ENCRYPTION_SECRET = prevSecret
})

describe('CompilationService.execute — server-key gate', () => {
  it('403s a free user on a non-allowlisted model before any provider call', async () => {
    await expect(
      svc.execute('rendered prompt', 'openai', 'gpt-4o', {}, null, null, freeUser(), null, null, null, true),
    ).rejects.toMatchObject({ statusCode: 403, code: 'MODEL_NOT_ALLOWED' })
  })

  it('402s a free user who is out of quota, even on an allowlisted model', async () => {
    const over = freeUser({ aiFeatures: { executions: { used: 10, limit: 10 }, llmProviders: {} } })
    await expect(
      svc.execute('rendered prompt', 'openai', 'gpt-4o-mini', {}, null, null, over, null, null, null, true),
    ).rejects.toMatchObject({ statusCode: 402, code: 'QUOTA_EXCEEDED' })
  })

  it('does not gate an own-key user (they never reach the env-key fallback)', async () => {
    // An own-key user resolves providerConfig from aiFeatures, so the gate is skipped.
    // We only assert the gate did NOT throw a 402/403 — the downstream provider call
    // will fail on the fake key, which is a different (non-gate) error.
    const { encryptedKey, iv } = encryptApiKey('sk-user-own-key')
    const encd = { hasKey: true, encryptedKey, iv }
    const owner = freeUser({ aiFeatures: { executions: { used: 10, limit: 10 }, llmProviders: { openai: encd } } })
    const err = await svc
      .execute('rendered prompt', 'openai', 'gpt-4o', {}, null, null, owner, null, null, null, true)
      .then(() => null, (e) => e)
    // Whatever happened, it must NOT be the free-tier gate.
    expect(err?.code).not.toBe('MODEL_NOT_ALLOWED')
    expect(err?.code).not.toBe('QUOTA_EXCEEDED')
  })
})

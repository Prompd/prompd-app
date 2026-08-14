import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { getOpenAIKey } from './userOpenAiKey.js'
import { encryptApiKey } from './EncryptionService.js'

const prev = process.env.ENCRYPTION_SECRET
beforeAll(() => { process.env.ENCRYPTION_SECRET = 'unit-test-secret' })
afterAll(() => { if (prev === undefined) delete process.env.ENCRYPTION_SECRET; else process.env.ENCRYPTION_SECRET = prev })

const userWith = (cfg) => ({ aiFeatures: { llmProviders: { openai: cfg } } })

describe('getOpenAIKey', () => {
  it('decrypts a key stored by EncryptionService (shared crypto, not a private copy)', () => {
    const { encryptedKey, iv } = encryptApiKey('sk-user-openai')
    expect(getOpenAIKey(userWith({ hasKey: true, encryptedKey, iv }))).toBe('sk-user-openai')
  })

  it('returns null when the user has no OpenAI key', () => {
    expect(getOpenAIKey(userWith({ hasKey: false }))).toBeNull()
    expect(getOpenAIKey({})).toBeNull()
    expect(getOpenAIKey(undefined)).toBeNull()
  })

  it('supports a Mongoose Map llmProviders', () => {
    const { encryptedKey, iv } = encryptApiKey('sk-map')
    const user = { aiFeatures: { llmProviders: new Map([['openai', { hasKey: true, encryptedKey, iv }]]) } }
    expect(getOpenAIKey(user)).toBe('sk-map')
  })
})

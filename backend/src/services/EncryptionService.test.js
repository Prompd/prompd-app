import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { encryptApiKey, decryptApiKey, __getEncryptionKeyForTest } from './EncryptionService.js'

const prev = process.env.ENCRYPTION_SECRET
beforeAll(() => { process.env.ENCRYPTION_SECRET = 'unit-test-secret' })
afterAll(() => { if (prev === undefined) delete process.env.ENCRYPTION_SECRET; else process.env.ENCRYPTION_SECRET = prev })

describe('EncryptionService', () => {
  it('round-trips an API key', () => {
    const { encryptedKey, iv } = encryptApiKey('sk-secret-value-123')
    expect(decryptApiKey(encryptedKey, iv)).toBe('sk-secret-value-123')
  })

  it('memoizes the derived key (same Buffer identity across calls, no re-scrypt)', () => {
    const a = __getEncryptionKeyForTest()
    const b = __getEncryptionKeyForTest()
    expect(a).toBe(b) // same reference -> derived once, not per call
  })

  it('re-derives when the secret changes', () => {
    const a = __getEncryptionKeyForTest()
    process.env.ENCRYPTION_SECRET = 'a-different-secret'
    const b = __getEncryptionKeyForTest()
    expect(a).not.toBe(b)
    process.env.ENCRYPTION_SECRET = 'unit-test-secret'
    // still round-trips after the change back
    const { encryptedKey, iv } = encryptApiKey('x')
    expect(decryptApiKey(encryptedKey, iv)).toBe('x')
  })
})

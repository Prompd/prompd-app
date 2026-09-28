import { describe, it, expect } from '@jest/globals'
import jwt from 'jsonwebtoken'
import { generateKeyPairSync } from 'node:crypto'
import { verifyClerkStrict, verifyClerkToken, setSigningKeyResolverForTests } from './strictClerk.js'
import { clerkIssuer, authorizedParties } from '../config/identity.js'

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const getKey = (_h, cb) => cb(null, publicKey.export({ type: 'spki', format: 'pem' }))
const tok = (claims, opts = {}) => jwt.sign(claims, privateKey, { algorithm: 'RS256', expiresIn: 60, ...opts })
const ISS = 'https://clerk.test'

describe('verifyClerkStrict', () => {
  it('accepts the right issuer and returns the payload', async () => {
    await expect(verifyClerkStrict(tok({ sub: 'user_a', iss: ISS }), { issuer: ISS, getKey })).resolves.toMatchObject({ sub: 'user_a' })
  })
  it('rejects another issuer (a token from another Clerk instance)', async () => {
    await expect(verifyClerkStrict(tok({ sub: 'user_a', iss: 'https://other.clerk.test' }), { issuer: ISS, getKey })).rejects.toThrow()
  })
  it('rejects a token with no issuer', async () => {
    await expect(verifyClerkStrict(tok({ sub: 'user_a' }), { issuer: ISS, getKey })).rejects.toThrow()
  })
  it('rejects HS256 when the key resolver hands back a shared secret', async () => {
    // Only the algorithm pin stops this: the secret matches the signature.
    const hs = jwt.sign({ sub: 'x', iss: ISS }, 'shared-secret')
    await expect(verifyClerkStrict(hs, { issuer: ISS, getKey: (_h, cb) => cb(null, 'shared-secret') })).rejects.toThrow()
  })
  it('rejects expired tokens beyond 5 s of skew, accepts within it', async () => {
    await expect(verifyClerkStrict(tok({ sub: 'x', iss: ISS }, { expiresIn: -3 }), { issuer: ISS, getKey })).resolves.toMatchObject({ sub: 'x' })
    await expect(verifyClerkStrict(tok({ sub: 'x', iss: ISS }, { expiresIn: -10 }), { issuer: ISS, getKey })).rejects.toThrow()
  })
  it('rejects an unsigned alg:none token', async () => {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const now = Math.floor(Date.now() / 1000)
    const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'x', iss: ISS, iat: now, exp: now + 60 })}.`
    await expect(verifyClerkStrict(unsigned, { issuer: ISS, getKey })).rejects.toThrow()
  })
  it('rejects a token with no subject, and a missing token', async () => {
    await expect(verifyClerkStrict(tok({ iss: ISS }), { issuer: ISS, getKey })).rejects.toThrow()
    await expect(verifyClerkStrict('', { issuer: ISS, getKey })).rejects.toThrow()
  })

  describe('azp allowlist', () => {
    const parties = ['https://prompd.app', 'https://127.0.0.1:5173']
    it('accepts a listed azp', async () => {
      await expect(verifyClerkStrict(tok({ sub: 'x', iss: ISS, azp: 'https://prompd.app' }), { issuer: ISS, getKey, authorizedParties: parties })).resolves.toMatchObject({ sub: 'x' })
    })
    it('rejects an unlisted azp', async () => {
      await expect(verifyClerkStrict(tok({ sub: 'x', iss: ISS, azp: 'https://evil.example' }), { issuer: ISS, getKey, authorizedParties: parties })).rejects.toThrow(/azp/)
    })
    it('rejects a non-string azp', async () => {
      await expect(verifyClerkStrict(tok({ sub: 'x', iss: ISS, azp: 42 }), { issuer: ISS, getKey, authorizedParties: parties })).rejects.toThrow(/azp/)
    })
    it('accepts a token without azp (Clerk stamps azp only for a browser Origin)', async () => {
      await expect(verifyClerkStrict(tok({ sub: 'x', iss: ISS }), { issuer: ISS, getKey, authorizedParties: parties })).resolves.toMatchObject({ sub: 'x' })
    })
    it('does not check azp when no allowlist is configured', async () => {
      await expect(verifyClerkStrict(tok({ sub: 'x', iss: ISS, azp: 'https://anything.example' }), { issuer: ISS, getKey })).resolves.toMatchObject({ sub: 'x' })
    })
  })
})

describe('identity config', () => {
  it('builds the issuer from CLERK_FRONTEND_API, tolerating a scheme or trailing slash', () => {
    expect(clerkIssuer({ CLERK_FRONTEND_API: 'clerk.example.com' })).toBe('https://clerk.example.com')
    expect(clerkIssuer({ CLERK_FRONTEND_API: 'https://clerk.example.com/' })).toBe('https://clerk.example.com')
  })
  it('parses CLERK_AUTHORIZED_PARTIES as a trimmed comma list', () => {
    expect(authorizedParties({ CLERK_AUTHORIZED_PARTIES: ' https://prompd.app/ , https://www.prompd.app,, ' })).toEqual(['https://prompd.app', 'https://www.prompd.app'])
    expect(authorizedParties({})).toEqual([])
  })
})

describe('verifyClerkToken (env-configured)', () => {
  const env = { CLERK_FRONTEND_API: 'clerk.test', CLERK_AUTHORIZED_PARTIES: 'https://prompd.app' }
  it('enforces the configured issuer and azp', async () => {
    setSigningKeyResolverForTests(getKey)
    try {
      await expect(verifyClerkToken(tok({ sub: 'u', iss: ISS, azp: 'https://prompd.app' }), env)).resolves.toMatchObject({ sub: 'u' })
      await expect(verifyClerkToken(tok({ sub: 'u', iss: 'https://other.test', azp: 'https://prompd.app' }), env)).rejects.toThrow()
      await expect(verifyClerkToken(tok({ sub: 'u', iss: ISS, azp: 'https://evil.example' }), env)).rejects.toThrow()
    } finally {
      setSigningKeyResolverForTests(null)
    }
  })
})

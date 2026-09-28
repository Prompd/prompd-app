/* The shared auth middlewares (auth, optionalAuth, clerkAuth) must verify with
 * the strict Clerk verifier: issuer pinned, RS256 only, azp allowlisted. A
 * token that is correctly signed but minted for another issuer or origin must
 * be refused before any user lookup. */
import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals'
import jwt from 'jsonwebtoken'
import { generateKeyPairSync } from 'node:crypto'
import { setSigningKeyResolverForTests } from '../services/strictClerk.js'
import { User } from '../models/User.js'
import { auth, optionalAuth } from './auth.js'
import { clerkAuth } from './clerkAuth.js'

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const getKey = (_h, cb) => cb(null, publicKey.export({ type: 'spki', format: 'pem' }))
const tok = (claims) => jwt.sign(claims, privateKey, { algorithm: 'RS256', expiresIn: 60 })
const ISS = 'https://clerk.strict.test'

const fakeUser = { clerkUserId: 'user_ok', isActive: true, isSuspended: false, save: async () => {} }

function run(mw, token) {
  return new Promise((resolve) => {
    const req = { headers: token ? { authorization: `Bearer ${token}` } : {}, query: {} }
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this },
      json(body) { resolve({ req, status: this.statusCode, body, nextCalled: false }) },
    }
    mw(req, res, () => resolve({ req, status: res.statusCode, nextCalled: true }))
  })
}

const saved = {}
beforeAll(() => {
  saved.api = process.env.CLERK_FRONTEND_API
  saved.parties = process.env.CLERK_AUTHORIZED_PARTIES
  process.env.CLERK_FRONTEND_API = 'clerk.strict.test'
  process.env.CLERK_AUTHORIZED_PARTIES = 'https://prompd.app'
  setSigningKeyResolverForTests(getKey)
  saved.findOne = User.findOne
  User.findOne = jest.fn(async () => fakeUser)
})
afterAll(() => {
  setSigningKeyResolverForTests(null)
  User.findOne = saved.findOne
  for (const [k, v] of [['CLERK_FRONTEND_API', saved.api], ['CLERK_AUTHORIZED_PARTIES', saved.parties]]) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v
  }
})

for (const [name, mw] of [['auth', auth], ['clerkAuth', clerkAuth]]) {
  describe(`${name} middleware`, () => {
    it('admits a token from our issuer and an allowed azp; identity is the verified sub', async () => {
      const out = await run(mw, tok({ sub: 'user_ok', iss: ISS, azp: 'https://prompd.app' }))
      expect(out.nextCalled).toBe(true)
      expect(out.req.auth).toEqual({ userId: 'user_ok' })
    })
    it('refuses a correctly signed token from another issuer', async () => {
      const out = await run(mw, tok({ sub: 'user_ok', iss: 'https://other-clerk.test' }))
      expect(out.nextCalled).toBe(false)
      expect(out.status).toBe(401)
    })
    it('refuses a correctly signed token with an unlisted azp', async () => {
      const out = await run(mw, tok({ sub: 'user_ok', iss: ISS, azp: 'https://evil.example' }))
      expect(out.nextCalled).toBe(false)
      expect(out.status).toBe(401)
    })
    it('refuses an HS256 token', async () => {
      const out = await run(mw, jwt.sign({ sub: 'user_ok', iss: ISS }, 'secret'))
      expect(out.nextCalled).toBe(false)
      expect(out.status).toBe(401)
    })
    it('answers 500, not a process crash, when the user lookup throws', async () => {
      User.findOne.mockImplementationOnce(async () => { throw new Error('db down') })
      const out = await run(mw, tok({ sub: 'user_ok', iss: ISS }))
      expect(out.nextCalled).toBe(false)
      expect(out.status).toBe(500)
    })
  })
}

describe('optionalAuth', () => {
  it('attaches identity for a strict-valid token', async () => {
    const out = await run(optionalAuth, tok({ sub: 'user_ok', iss: ISS }))
    expect(out.nextCalled).toBe(true)
    expect(out.req.auth).toEqual({ userId: 'user_ok' })
  })
  it('continues anonymously for a wrong-issuer token', async () => {
    const out = await run(optionalAuth, tok({ sub: 'user_ok', iss: 'https://other-clerk.test' }))
    expect(out.nextCalled).toBe(true)
    expect(out.req.auth).toBeUndefined()
  })
})

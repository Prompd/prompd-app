/* /api/pricing/reseed* rewrite the shared pricing catalog (deprecating
 * models) and hit every provider's API: operator-only, not any signed-in user. */
import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals'
import express from 'express'
import request from 'supertest'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { setSigningKeyResolverForTests } from '../services/strictClerk.js'
import { User } from '../models/User.js'
import pricingRoutes from './pricing.js'

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const tok = (sub) => jwt.sign({ sub, iss: 'https://clerk.pricing.test' }, privateKey, { algorithm: 'RS256', expiresIn: 300 })
const saved = {}

beforeAll(() => {
  saved.api = process.env.CLERK_FRONTEND_API
  saved.admins = process.env.ADMIN_USER_IDS
  process.env.CLERK_FRONTEND_API = 'clerk.pricing.test'
  process.env.ADMIN_USER_IDS = 'user_admin'
  setSigningKeyResolverForTests((_h, cb) => cb(null, publicKey.export({ type: 'spki', format: 'pem' })))
  saved.findOne = User.findOne
  User.findOne = jest.fn(async (q) => ({ clerkUserId: q.clerkUserId, isActive: true, isSuspended: false, subscription: { plan: 'enterprise' }, save: async () => {} }))
  // No provider API is ever reached from this test, whatever the handler does.
  saved.fetch = globalThis.fetch
  globalThis.fetch = jest.fn(async () => { throw new Error('network disabled in test') })
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterAll(() => {
  setSigningKeyResolverForTests(null)
  User.findOne = saved.findOne
  globalThis.fetch = saved.fetch
  for (const [k, v] of [['CLERK_FRONTEND_API', saved.api], ['ADMIN_USER_IDS', saved.admins]]) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v
  }
  jest.restoreAllMocks()
})

function app() {
  const a = express()
  a.use(express.json())
  a.use('/api/pricing', pricingRoutes)
  return a
}

describe('pricing reseed routes', () => {
  it('refuse a signed-in non-admin (even enterprise) with 403', async () => {
    const a = app()
    // An unknown provider makes the handler answer 404 on its own, so 403 here
    // can only come from the admin gate.
    expect((await request(a).post('/api/pricing/reseed/no-such-provider').set('Authorization', `Bearer ${tok('user_ent')}`)).status).toBe(403)
    expect((await request(a).post('/api/pricing/reseed-all').set('Authorization', `Bearer ${tok('user_ent')}`)).status).toBe(403)
  }, 20000)
  it('refuse anonymous callers with 401', async () => {
    expect((await request(app()).post('/api/pricing/reseed-all')).status).toBe(401)
  })
  it('let an admin through to the handler', async () => {
    // Unknown provider: the handler answers 404 itself, with no provider fetch.
    const res = await request(app()).post('/api/pricing/reseed/no-such-provider').set('Authorization', `Bearer ${tok('user_admin')}`)
    expect(res.status).toBe(404)
  })
})

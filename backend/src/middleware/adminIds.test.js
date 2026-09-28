/* Who counts as an operator.
 *
 * The rule this replaces made every ENTERPRISE-plan customer an admin, and
 * otherwise matched email.includes('@prompd.io') / '@logikbug.com'. Admin here
 * means "can read everyone's error reports, stack traces and URLs", which is
 * not something a billing plan or an email substring should grant.
 */
import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals'
import jwt from 'jsonwebtoken'
import { generateKeyPairSync } from 'node:crypto'
import { isAdminUserId } from './adminIds.js'
import { setSigningKeyResolverForTests } from '../services/strictClerk.js'
import { User } from '../models/User.js'
import { requireAdmin } from './auth.js'

const env = { ADMIN_USER_IDS: 'user_admin1, user_second ' }

describe('isAdminUserId', () => {
  it('admits an id on the list, ignoring surrounding whitespace', () => {
    expect(isAdminUserId('user_admin1', env)).toBe(true)
    expect(isAdminUserId('user_second', env)).toBe(true)
  })
  it('refuses anyone else, and a missing id', () => {
    expect(isAdminUserId('user_other', env)).toBe(false)
    expect(isAdminUserId(undefined, env)).toBe(false)
    expect(isAdminUserId('', env)).toBe(false)
  })
  it('matches exactly, never by prefix or substring', () => {
    expect(isAdminUserId('user_admin', env)).toBe(false)
    expect(isAdminUserId('xuser_second', env)).toBe(false)
  })
  it('admits nobody when the list is unset or empty', () => {
    expect(isAdminUserId('user_second', {})).toBe(false)
    expect(isAdminUserId('user_second', { ADMIN_USER_IDS: '   ' })).toBe(false)
  })
})

describe('requireAdmin', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const getKey = (_h, cb) => cb(null, publicKey.export({ type: 'spki', format: 'pem' }))
  const tok = (sub) => jwt.sign({ sub, iss: 'https://clerk.admin.test' }, privateKey, { algorithm: 'RS256', expiresIn: 60 })
  let current = null
  const saved = {}

  beforeAll(() => {
    saved.api = process.env.CLERK_FRONTEND_API
    saved.admins = process.env.ADMIN_USER_IDS
    process.env.CLERK_FRONTEND_API = 'clerk.admin.test'
    process.env.ADMIN_USER_IDS = 'user_admin1'
    setSigningKeyResolverForTests(getKey)
    saved.findOne = User.findOne
    User.findOne = jest.fn(async () => current)
  })
  afterAll(() => {
    setSigningKeyResolverForTests(null)
    User.findOne = saved.findOne
    for (const [k, v] of [['CLERK_FRONTEND_API', saved.api], ['ADMIN_USER_IDS', saved.admins]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v
    }
  })

  const run = (token) => new Promise((resolve) => {
    const req = { headers: { authorization: `Bearer ${token}` }, query: {} }
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this },
      json(body) { resolve({ status: this.statusCode, body, nextCalled: false }) },
    }
    requireAdmin(req, res, () => resolve({ status: 200, nextCalled: true }))
  })
  const user = (sub, over = {}) => ({ clerkUserId: sub, isActive: true, isSuspended: false, save: async () => {}, ...over })

  it('refuses an enterprise-plan user who is not on the allowlist', async () => {
    current = user('user_ent', { subscription: { plan: 'enterprise' }, email: 'boss@corp.example' })
    const out = await run(tok('user_ent'))
    expect(out.nextCalled).toBe(false)
    expect(out.status).toBe(403)
  })
  it('refuses a user whose email merely contains a staff domain', async () => {
    current = user('user_spoof', { subscription: { plan: 'free' }, email: 'x@prompd.io.evil.example' })
    const out = await run(tok('user_spoof'))
    expect(out.status).toBe(403)
    current = user('user_lb', { subscription: { plan: 'free' }, email: 'someone@logikbug.com' })
    expect((await run(tok('user_lb'))).status).toBe(403)
  })
  it('refuses a plan named admin that is not on the allowlist', async () => {
    current = user('user_planadmin', { subscription: { plan: 'admin' } })
    expect((await run(tok('user_planadmin'))).status).toBe(403)
  })
  it('admits the verified sub on ADMIN_USER_IDS', async () => {
    current = user('user_admin1', { subscription: { plan: 'free' } })
    const out = await run(tok('user_admin1'))
    expect(out.nextCalled).toBe(true)
  })
})

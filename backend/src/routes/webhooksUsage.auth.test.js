/* F11: webhook configuration (which hands out the HMAC secret) and usage sync
 * accepted anonymous requests, and any caller could read, replace or delete
 * any workflow's webhook config. They now need a verified user, and a config
 * belongs to the user who created it. The trigger endpoint stays open: it is
 * authenticated by the HMAC signature. */
import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals'
import express from 'express'
import request from 'supertest'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { setSigningKeyResolverForTests } from '../services/strictClerk.js'
import { User } from '../models/User.js'
import webhookRoutes from './webhooks.js'
import usageRoutes from './usage.js'

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const tok = (sub) => jwt.sign({ sub, iss: 'https://clerk.f11.test' }, privateKey, { algorithm: 'RS256', expiresIn: 300 })
const saved = {}

beforeAll(() => {
  saved.api = process.env.CLERK_FRONTEND_API
  process.env.CLERK_FRONTEND_API = 'clerk.f11.test'
  setSigningKeyResolverForTests((_h, cb) => cb(null, publicKey.export({ type: 'spki', format: 'pem' })))
  saved.findOne = User.findOne
  User.findOne = jest.fn(async (q) => ({ clerkUserId: q.clerkUserId, isActive: true, isSuspended: false, save: async () => {} }))
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterAll(() => {
  setSigningKeyResolverForTests(null)
  User.findOne = saved.findOne
  if (saved.api === undefined) delete process.env.CLERK_FRONTEND_API; else process.env.CLERK_FRONTEND_API = saved.api
  jest.restoreAllMocks()
})

function app() {
  const a = express()
  a.use(express.json())
  a.use('/api/webhooks', webhookRoutes)
  a.use('/api/usage', usageRoutes)
  return a
}

describe('webhook config routes', () => {
  const A = () => `Bearer ${tok('user_a')}`
  const B = () => `Bearer ${tok('user_b')}`

  it('refuse anonymous create, status, delete and execution reads', async () => {
    const a = app()
    expect((await request(a).put('/api/webhooks/wf-anon').send({ enabled: true })).status).toBe(401)
    expect((await request(a).get('/api/webhooks/wf-anon/status')).status).toBe(401)
    expect((await request(a).delete('/api/webhooks/wf-anon')).status).toBe(401)
    expect((await request(a).get('/api/webhooks/wf-anon/executions/x')).status).toBe(401)
  })

  it('bind a config to its creator; another user cannot see, take over or delete it', async () => {
    const a = app()
    const created = await request(a).put('/api/webhooks/wf-own').set('Authorization', A()).send({ enabled: true })
    expect(created.status).toBe(200)
    expect(typeof created.body.secret).toBe('string')

    expect((await request(a).get('/api/webhooks/wf-own/status').set('Authorization', B())).status).toBe(404)
    const takeover = await request(a).put('/api/webhooks/wf-own').set('Authorization', B()).send({ enabled: true, regenerateSecret: true })
    expect(takeover.status).toBe(404)
    expect(takeover.body.secret).toBeUndefined()
    expect((await request(a).delete('/api/webhooks/wf-own').set('Authorization', B())).status).toBe(404)

    expect((await request(a).get('/api/webhooks/wf-own/status').set('Authorization', A())).status).toBe(200)
  })
})

describe('usage sync', () => {
  it('refuses anonymous sync', async () => {
    expect((await request(app()).post('/api/usage/sync').send({ executions: [] })).status).toBe(401)
  })
  it('accepts an authenticated sync', async () => {
    const res = await request(app()).post('/api/usage/sync').set('Authorization', `Bearer ${tok('user_a')}`).send({ executions: [{ id: '1', provider: 'openai', model: 'm' }] })
    expect(res.status).toBe(200)
    expect(res.body.synced).toBe(1)
  })
})

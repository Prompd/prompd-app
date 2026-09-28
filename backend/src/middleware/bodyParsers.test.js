/* Body-size ceilings on the unauthenticated routes, and the raw body the
 * webhook trigger's HMAC needs. Built from the same installBodyParsers the
 * server uses, with the real routers and error handler. */
import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals'
import express from 'express'
import request from 'supertest'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { installBodyParsers, publicBodyRoute } from './bodyParsers.js'
import { errorHandler } from './errorHandler.js'
import { setSigningKeyResolverForTests } from '../services/strictClerk.js'
import { User } from '../models/User.js'
import webhookRoutes from '../routes/webhooks.js'
import webhookProxyRoutes from '../routes/webhookProxy.js'
import errorReportRoutes from '../routes/errors.js'

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const tok = (sub) => jwt.sign({ sub, iss: 'https://clerk.body.test' }, privateKey, { algorithm: 'RS256', expiresIn: 300 })
const saved = {}

beforeAll(() => {
  saved.api = process.env.CLERK_FRONTEND_API
  process.env.CLERK_FRONTEND_API = 'clerk.body.test'
  setSigningKeyResolverForTests((_h, cb) => cb(null, publicKey.export({ type: 'spki', format: 'pem' })))
  saved.findOne = User.findOne
  User.findOne = jest.fn(async (q) => ({ clerkUserId: q.clerkUserId, isActive: true, isSuspended: false, save: async () => {} }))
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterAll(() => {
  setSigningKeyResolverForTests(null)
  User.findOne = saved.findOne
  if (saved.api === undefined) delete process.env.CLERK_FRONTEND_API; else process.env.CLERK_FRONTEND_API = saved.api
  jest.restoreAllMocks()
})

function app() {
  const a = express()
  installBodyParsers(a)
  a.use('/api/webhooks', webhookRoutes)
  a.use('/api/webhook-proxy', webhookProxyRoutes)
  a.use('/api/errors', errorReportRoutes)
  // An authenticated-route stand-in: must keep the large ceiling.
  a.post('/api/compilation/compile', (req, res) => res.json({ bytes: JSON.stringify(req.body).length }))
  a.use(errorHandler)
  return a
}
const big = (bytes) => JSON.stringify({ parameters: { blob: 'x'.repeat(bytes) } })

describe('publicBodyRoute', () => {
  it('matches the public routes only', () => {
    expect(publicBodyRoute('/api/compilation/preview-public')).not.toBeNull()
    expect(publicBodyRoute('/api/webhook-proxy/u/w')).not.toBeNull()
    expect(publicBodyRoute('/api/webhooks/wf')).not.toBeNull()
    expect(publicBodyRoute('/api/errors')).not.toBeNull()
    expect(publicBodyRoute('/api/compilation/compile')).toBeNull()
    expect(publicBodyRoute('/api/v1/chat/completions')).toBeNull()
  })
})

describe('ceilings', () => {
  it('refuses a 2 MB webhook trigger body with 413', async () => {
    const res = await request(app()).post('/api/webhooks/wf').set('Content-Type', 'application/json').send(big(2 * 1024 * 1024))
    expect(res.status).toBe(413)
  })
  it('refuses a 2 MB webhook-proxy intake body with 413', async () => {
    const res = await request(app()).post('/api/webhook-proxy/user_x/wf').set('Content-Type', 'application/json').send(big(2 * 1024 * 1024))
    expect(res.status).toBe(413)
  })
  it('refuses a 2 MB urlencoded webhook-proxy body with 413 (both parsers skip)', async () => {
    const res = await request(app()).post('/api/webhook-proxy/user_x/wf').set('Content-Type', 'application/x-www-form-urlencoded').send(`a=${'x'.repeat(2 * 1024 * 1024)}`)
    expect(res.status).toBe(413)
  })
  it('refuses a 512 KB error report with 413', async () => {
    const res = await request(app()).post('/api/errors').set('Content-Type', 'application/json').send(big(512 * 1024))
    expect(res.status).toBe(413)
  })
  it('keeps the large ceiling for other routes', async () => {
    const res = await request(app()).post('/api/compilation/compile').set('Content-Type', 'application/json').send(big(3 * 1024 * 1024))
    expect(res.status).toBe(200)
  })
  it('still accepts a normal webhook-proxy intake', async () => {
    const res = await request(app()).post('/api/webhook-proxy/user_x/wf').set('Content-Type', 'application/json').send({ ok: true })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('queued')
  })
})

describe('webhook trigger HMAC over the raw body', () => {
  it('accepts a correctly signed trigger and rejects an unsigned one', async () => {
    const a = app()
    const created = await request(a).put('/api/webhooks/wf-hmac').set('Authorization', `Bearer ${tok('user_a')}`).send({ enabled: true })
    expect(created.status).toBe(200)
    const body = JSON.stringify({ parameters: { x: 1 } })
    const sig = crypto.createHmac('sha256', created.body.secret).update(body, 'utf8').digest('hex')
    const good = await request(a).post('/api/webhooks/wf-hmac').set('Content-Type', 'application/json').set('X-Webhook-Signature', sig).send(body)
    expect(good.status).toBe(202)
    const bad = await request(a).post('/api/webhooks/wf-hmac').set('Content-Type', 'application/json').send(body)
    expect(bad.status).toBe(401)
  })
})

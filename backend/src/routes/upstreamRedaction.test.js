/* F7: upstream provider errors are relayed to the browser, and a provider
 * answers a bad key by quoting it back. The relay must survive; the key must
 * not. fetch is stubbed -- nothing reaches a provider. */
import { describe, it, expect, jest, beforeAll, afterAll, afterEach } from '@jest/globals'
import express from 'express'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { generateKeyPairSync } from 'node:crypto'
import { setSigningKeyResolverForTests } from '../services/strictClerk.js'
import { encryptApiKey } from '../services/EncryptionService.js'
import { User } from '../models/User.js'
import chatRouter from './chatCompletions.js'
import imagesRouter from './images.js'
import { CompilationService } from '../services/CompilationService.js'
import { pricingService } from '../services/PricingService.js'

const LEAKED = 'sk-proj-abcdefghijklmnop1234567890'
const openAi401 = JSON.stringify({ error: { message: `Incorrect API key provided: ${LEAKED}. You can find your API key at https://platform.openai.com/account/api-keys.`, type: 'invalid_request_error', code: 'invalid_api_key' } })

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const saved = {}
let token
let user

beforeAll(() => {
  saved.api = process.env.CLERK_FRONTEND_API
  saved.secret = process.env.ENCRYPTION_SECRET
  process.env.CLERK_FRONTEND_API = 'clerk.redact.test'
  process.env.ENCRYPTION_SECRET = 'test-encryption-secret'
  setSigningKeyResolverForTests((_h, cb) => cb(null, publicKey.export({ type: 'spki', format: 'pem' })))
  token = jwt.sign({ sub: 'user_r', iss: 'https://clerk.redact.test' }, privateKey, { algorithm: 'RS256', expiresIn: 300 })
  const { encryptedKey, iv } = encryptApiKey(LEAKED)
  user = {
    clerkUserId: 'user_r', isActive: true, isSuspended: false, save: async () => {},
    subscription: { plan: 'free' },
    aiFeatures: { executions: { used: 0, limit: 10 }, llmProviders: { openai: { hasKey: true, encryptedKey, iv } } },
  }
  saved.findOne = User.findOne
  User.findOne = jest.fn(async () => user)
  jest.spyOn(pricingService, 'calculateCost').mockImplementation(async () => null)
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterAll(() => {
  setSigningKeyResolverForTests(null)
  User.findOne = saved.findOne
  for (const [k, v] of [['CLERK_FRONTEND_API', saved.api], ['ENCRYPTION_SECRET', saved.secret]]) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v
  }
  jest.restoreAllMocks()
})
let fetchSpy
afterEach(() => { fetchSpy?.mockRestore(); fetchSpy = null })

function app() {
  const a = express()
  a.use(express.json())
  a.use('/api/v1/chat/completions', chatRouter)
  a.use('/api/v1/images/generations', imagesRouter)
  return a
}
const chatBody = (stream) => ({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }], stream })

describe('chat-completions error relay', () => {
  it('redacts the key from a non-streaming upstream error body, keeps the error', async () => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(openAi401, { status: 401, headers: { 'content-type': 'application/json' } }))
    const res = await request(app()).post('/api/v1/chat/completions').set('Authorization', `Bearer ${token}`).send(chatBody(false))
    expect(res.status).toBe(401)
    expect(res.text).not.toContain('abcdefghijklmnop')
    expect(res.text).toContain('invalid_api_key')
  })
  it('redacts the key from a streaming-request upstream error body', async () => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(openAi401, { status: 401, headers: { 'content-type': 'application/json' } }))
    const res = await request(app()).post('/api/v1/chat/completions').set('Authorization', `Bearer ${token}`).send(chatBody(true))
    expect(res.status).toBe(401)
    expect(res.text).not.toContain('abcdefghijklmnop')
  })
  it('redacts a key quoted in a transport error message', async () => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => { throw new Error(`connect failed with Bearer ${LEAKED}`) })
    const res = await request(app()).post('/api/v1/chat/completions').set('Authorization', `Bearer ${token}`).send(chatBody(false))
    expect(res.status).toBe(502)
    expect(res.text).not.toContain('abcdefghijklmnop')
  })
})

describe('images error relay', () => {
  it('redacts the key from the upstream error body', async () => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(openAi401, { status: 401, headers: { 'content-type': 'application/json' } }))
    const res = await request(app()).post('/api/v1/images/generations').set('Authorization', `Bearer ${token}`).send({ prompt: 'a cat', model: 'gpt-image-1' })
    expect(res.status).toBe(401)
    expect(res.text).not.toContain('abcdefghijklmnop')
    expect(res.text).toContain('invalid_api_key')
  })
})

describe('compilation execute error relay', () => {
  it('redacts the key from a provider SDK error returned to the client', async () => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(openAi401, { status: 401, headers: { 'content-type': 'application/json' } }))
    const svc = new CompilationService()
    const out = await svc.execute('hello', 'openai', 'gpt-4o', {}, null, null, user, null, null, null, true)
    expect(out.success).toBe(false)
    expect(JSON.stringify(out)).not.toContain('abcdefghijklmnop')
  })
})

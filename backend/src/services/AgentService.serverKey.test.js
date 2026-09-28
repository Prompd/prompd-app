/* F4: AgentService fell back to the SERVER's provider keys for anyone -- no
 * user, or any user, any model, no quota. The server key is now only for a
 * known user, and only through the same free-tier gate the HTTP gateway uses.
 * fetch is stubbed: a refused call must never reach a provider. */
import { describe, it, expect, jest, beforeAll, afterAll, beforeEach } from '@jest/globals'
import { AgentService } from './AgentService.js'
import { User } from '../models/User.js'

const freeUser = (over = {}) => ({
  clerkUserId: 'user_free',
  aiFeatures: { executions: { used: 0, limit: 10 }, llmProviders: {} },
  subscription: { plan: 'free' },
  save: async () => {},
  ...over,
})

let current = null
const saved = {}
let fetchCalls = 0

beforeAll(() => {
  saved.openai = process.env.OPENAI_API_KEY
  saved.anthropic = process.env.ANTHROPIC_API_KEY
  process.env.OPENAI_API_KEY = 'sk-test-server-openai'
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test-server'
  saved.findOne = User.findOne
  User.findOne = jest.fn(async () => current)
  saved.fetch = globalThis.fetch
  globalThis.fetch = jest.fn(async () => {
    fetchCalls++
    return new Response(JSON.stringify({
      id: 'x', object: 'chat.completion', created: 0, model: 'gpt-4o-mini',
      choices: [{ index: 0, message: { role: 'assistant', content: '{"message":"hi","toolCalls":[],"done":true}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  })
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterAll(() => {
  User.findOne = saved.findOne
  globalThis.fetch = saved.fetch
  for (const [k, v] of [['OPENAI_API_KEY', saved.openai], ['ANTHROPIC_API_KEY', saved.anthropic]]) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v
  }
  jest.restoreAllMocks()
})
beforeEach(() => { fetchCalls = 0; current = null })

describe('AgentService server-key fallback', () => {
  it('refuses when there is no user (no userId)', async () => {
    const svc = new AgentService()
    const out = await svc.chat(null, 's', { provider: 'openai', model: 'gpt-4o-mini', messages: [] })
    expect(out.success).toBe(false)
    expect(fetchCalls).toBe(0)
  })

  it('refuses a session_ pseudo-id that names no user', async () => {
    const svc = new AgentService()
    const out = await svc.chat('session_abc', 's', { provider: 'anthropic', model: 'claude-sonnet-4-20250514', messages: [] })
    expect(out.success).toBe(false)
    expect(fetchCalls).toBe(0)
  })

  it('refuses a free user on a model outside the free allowlist', async () => {
    current = freeUser()
    const svc = new AgentService()
    const out = await svc.chat('user_free', 's', { provider: 'openai', model: 'gpt-4o', messages: [] })
    expect(out.success).toBe(false)
    expect(out.code).toBe('MODEL_NOT_ALLOWED')
    expect(fetchCalls).toBe(0)
  })

  it('refuses a free user who is out of quota', async () => {
    current = freeUser({ aiFeatures: { executions: { used: 10, limit: 10 }, llmProviders: {} } })
    const svc = new AgentService()
    const out = await svc.chat('user_free', 's', { provider: 'openai', model: 'gpt-4o-mini', messages: [] })
    expect(out.success).toBe(false)
    expect(out.code).toBe('QUOTA_EXCEEDED')
    expect(fetchCalls).toBe(0)
  })

  it('runs an allowlisted model for a free user and counts it', async () => {
    const u = freeUser()
    current = u
    const svc = new AgentService()
    const out = await svc.chat('user_free', 's', { provider: 'openai', model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] })
    expect(out.success).toBe(true)
    expect(fetchCalls).toBe(1)
    expect(u.aiFeatures.executions.used).toBe(1)
  })
})

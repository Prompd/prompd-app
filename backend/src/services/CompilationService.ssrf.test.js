/* F6: a user-configured Ollama/custom base URL is fetched server-side by
 * execute(). It must go through the SSRF guard (DNS-resolved, redirects
 * checked); the old code pointed an OpenAI client at any URL, and defaulted
 * to the container's own localhost. fetch and DNS are stubbed. */
import { describe, it, expect, jest, beforeAll, afterAll, afterEach } from '@jest/globals'
import { CompilationService } from './CompilationService.js'
import { encryptApiKey } from './EncryptionService.js'
import { setLookupForTests } from '../utils/ssrfGuard.js'
import { pricingService } from './PricingService.js'

const prevSecret = process.env.ENCRYPTION_SECRET
let svc
beforeAll(() => {
  process.env.ENCRYPTION_SECRET = 'test-encryption-secret'
  svc = new CompilationService()
  jest.spyOn(pricingService, 'calculateCost').mockImplementation(async () => null)
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterAll(() => {
  if (prevSecret === undefined) delete process.env.ENCRYPTION_SECRET; else process.env.ENCRYPTION_SECRET = prevSecret
  jest.restoreAllMocks()
})
afterEach(() => { setLookupForTests(null) })

const ollamaUser = (baseUrl) => {
  const { encryptedKey, iv } = encryptApiKey('ollama-key')
  return {
    _id: 'u1',
    subscription: { plan: 'free' },
    aiFeatures: { executions: { used: 0, limit: 10 }, llmProviders: { ollama: { hasKey: true, encryptedKey, iv, isCustom: true, customConfig: { baseUrl } } } },
    save: async () => {},
  }
}
const run = (user) => svc.execute('hello', 'ollama', 'llama3', {}, null, null, user, null, null, null, true)

describe('execute() ollama base URL', () => {
  it.each([
    'http://169.254.169.254/v1',
    'http://metadata.google.internal/computeMetadata/v1',
    'http://[::ffff:7f00:1]:11434/v1',
    'http://10.0.0.5:11434/v1',
  ])('refuses %s without any fetch', async (baseUrl) => {
    const spy = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}'))
    const out = await run(ollamaUser(baseUrl))
    expect(out.success).toBe(false)
    expect(String(out.error)).toMatch(/not allowed/)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('refuses a public name that resolves to a private address', async () => {
    setLookupForTests(async () => [{ address: '10.9.8.7', family: 4 }])
    const spy = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}'))
    const out = await run(ollamaUser('https://rebind.example.com/v1'))
    expect(out.success).toBe(false)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('refuses when no base URL is configured (no server-localhost default)', async () => {
    const spy = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}'))
    const out = await run(ollamaUser(undefined))
    expect(out.success).toBe(false)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('does not follow a redirect from a public host to the metadata server', async () => {
    setLookupForTests(async () => [{ address: '93.184.216.34', family: 4 }])
    const spy = jest.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response('', { status: 302, headers: { location: 'http://169.254.169.254/computeMetadata/v1/' } }))
    const out = await run(ollamaUser('https://ollama.example.com/v1'))
    expect(out.success).toBe(false)
    // The SDK may retry, but every request went to the public host only.
    expect(spy).toHaveBeenCalled()
    for (const [url] of spy.mock.calls) expect(String(url)).toMatch(/^https:\/\/ollama\.example\.com\//)
    spy.mockRestore()
  }, 30000)

  it('reaches a public base URL', async () => {
    setLookupForTests(async () => [{ address: '93.184.216.34', family: 4 }])
    const spy = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
      id: 'x', object: 'chat.completion', created: 0, model: 'llama3',
      choices: [{ index: 0, message: { role: 'assistant', content: 'pong' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const out = await run(ollamaUser('https://ollama.example.com/v1'))
    expect(out.success).toBe(true)
    expect(out.response).toBe('pong')
    expect(String(spy.mock.calls[0][0])).toContain('https://ollama.example.com/v1/chat/completions')
    spy.mockRestore()
  })
})

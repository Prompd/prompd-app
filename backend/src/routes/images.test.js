import { describe, it, expect } from '@jest/globals'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateResponse, modelsResponse } from './images.js'

const server = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'server.js'), 'utf8')

describe('the routes are mounted', () => {
  // Source-level: importing server.js starts a server, connects to Mongo and reads Clerk secrets.
  it('serves generations', () => {
    expect(server).toMatch(/import imagesRoutes, \{ modelsRouter as imageModelsRoutes \} from '\.\/routes\/images\.js'/)
    expect(server).toMatch(/app\.use\('\/api\/v1\/images\/generations', imagesRoutes\)/)
  })
  it('serves the model list', () => {
    expect(server).toMatch(/app\.use\('\/api\/v1\/images\/models', imageModelsRoutes\)/)
  })
})

const json = (status, body) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('generateResponse', () => {
  it('refuses a bad request before looking for a key', async () => {
    let asked = false
    const out = await generateResponse({}, () => { asked = true; return 'sk' })
    expect(out.status).toBe(400)
    expect(asked).toBe(false)
  })

  it('is 402 naming the provider when the user has no key for it', async () => {
    const out = await generateResponse({ prompt: 'a', provider: 'google' }, () => null)
    expect(out.status).toBe(402)
    expect(out.json.error.message).toBe('Image generation with Google requires your own Google API key. Add one in provider settings.')
    expect(out.json.error.provider).toBe('google')
    expect(out.json.error.code).toBe('NO_API_KEY')
  })

  it('asks for the key of the resolved provider only', async () => {
    const asked = []
    await generateResponse({ prompt: 'a', provider: 'nope' }, (id) => { asked.push(id); return null })
    expect(asked).toEqual(['openai'])
  })

  it('replies in the old shape plus mime, provider and model', async () => {
    const out = await generateResponse({ prompt: 'a' }, () => 'sk-x', { fetchImpl: json(200, { data: [{ b64_json: 'QUJD' }] }) })
    expect(out).toEqual({ status: 200, json: { data: [{ b64_json: 'QUJD', mime: 'image/png' }], provider: 'openai', model: 'gpt-image-2.5-flare' } })
  })

  it("relays the provider's token counts when it reports them", async () => {
    const fetchImpl = json(200, { data: [{ b64_json: 'QUJD' }], usage: { input_tokens: 38, output_tokens: 1272 } })
    const out = await generateResponse({ prompt: 'a' }, () => 'sk-x', { fetchImpl })
    expect(out.json.usage).toEqual({ input_tokens: 38, output_tokens: 1272 })
  })

  it('relays a provider error with secrets redacted', async () => {
    const fetchImpl = json(401, { error: { message: 'Incorrect API key provided: sk-proj-abcdefghijklmnopqrstuvwxyz123456' } })
    const out = await generateResponse({ prompt: 'a' }, () => 'sk-x', { fetchImpl })
    expect(out.status).toBe(401)
    expect(out.text).not.toMatch(/abcdefghijklmnopqrstuvwxyz123456/)
    expect(out.contentType).toBe('application/json')
  })

  it('is 502 when the provider returns no image', async () => {
    const out = await generateResponse({ prompt: 'a' }, () => 'sk-x', { fetchImpl: json(200, { data: [] }) })
    expect(out.status).toBe(502)
    expect(out.json.error.message).toBe('OpenAI returned no image.')
  })

  it('redacts a network failure message too', async () => {
    const fetchImpl = async () => { throw new Error('failed with key sk-proj-abcdefghijklmnopqrstuvwxyz123456') }
    const out = await generateResponse({ prompt: 'a' }, () => 'sk-x', { fetchImpl })
    expect(out.status).toBe(502)
    expect(JSON.stringify(out.json)).not.toMatch(/abcdefghijklmnopqrstuvwxyz123456/)
  })
})

describe('modelsResponse', () => {
  it('marks availability from the user\'s keys and returns no key', () => {
    const out = modelsResponse((id) => (id === 'openai' ? 'sk-secret-value' : null))
    expect(out.providers.map((p) => [p.id, p.available])).toEqual([['openai', true], ['google', false]])
    expect(JSON.stringify(out)).not.toMatch(/sk-secret-value/)
  })
  it("passes each model's price through", () => {
    const out = modelsResponse(() => null, (p, m) => (m === 'gemini-3-pro-image' ? { input: 2, output: 120 } : null))
    const pro = out.providers.find((p) => p.id === 'google').models.find((m) => m.id === 'gemini-3-pro-image')
    expect(pro.price).toEqual({ input: 2, output: 120 })
  })
})

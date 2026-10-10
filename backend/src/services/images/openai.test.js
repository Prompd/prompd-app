import { describe, it, expect } from '@jest/globals'
import { openaiProvider, usageFromImages } from './openai.js'

const req = (over = {}) => ({ provider: 'openai', model: 'gpt-image-2.5-flare', prompt: 'a cat', shape: 'square', quality: 'auto', n: 1, ...over })
const spec = (id) => openaiProvider.models.find((m) => m.id === id)

describe('openai models', () => {
  it('offers exactly the current models, Flare as the default', () => {
    expect(openaiProvider.models.map((m) => m.id)).toEqual(['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst', 'gpt-image-2'])
    expect(openaiProvider.models.filter((m) => m.default).map((m) => m.id)).toEqual(['gpt-image-2.5-flare'])
  })

  it('gives the 2K shapes to the 2.5 models only', () => {
    expect(Object.keys(spec('gpt-image-2.5-flare').shapes)).toContain('wide-2k')
    expect(Object.keys(spec('gpt-image-2').shapes)).toEqual(['square', 'wide', 'tall'])
  })
})

describe('openai buildBody', () => {
  it('maps shapes to OpenAI sizes', () => {
    const s = spec('gpt-image-2.5-flare')
    expect(openaiProvider.buildBody(req({ shape: 'square' }), s).size).toBe('1024x1024')
    expect(openaiProvider.buildBody(req({ shape: 'wide' }), s).size).toBe('1536x1024')
    expect(openaiProvider.buildBody(req({ shape: 'tall' }), s).size).toBe('1024x1536')
    expect(openaiProvider.buildBody(req({ shape: 'square-2k' }), s).size).toBe('2048x2048')
    expect(openaiProvider.buildBody(req({ shape: 'wide-2k' }), s).size).toBe('2048x1152')
    expect(openaiProvider.buildBody(req({ shape: 'tall-2k' }), s).size).toBe('1152x2048')
  })

  it('sends model, prompt, n and quality, and never response_format', () => {
    const body = openaiProvider.buildBody(req({ quality: 'high', n: 2 }), spec('gpt-image-2.5-flare'))
    expect(body).toEqual({ model: 'gpt-image-2.5-flare', prompt: 'a cat', size: '1024x1024', n: 2, quality: 'high' })
  })
})

describe('openai generate', () => {
  const okFetch = (json) => async () => new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } })

  it('returns base64 images as png', async () => {
    const out = await openaiProvider.generate(req(), 'sk-x', { fetchImpl: okFetch({ data: [{ b64_json: 'QUJD' }] }) })
    expect(out).toEqual({ ok: true, images: [{ b64: 'QUJD', mime: 'image/png' }], usage: null })
  })

  it('sends the key as a Bearer token to the images endpoint', async () => {
    let seen
    const fetchImpl = async (url, init) => { seen = { url, init }; return new Response('{"data":[]}', { status: 200 }) }
    await openaiProvider.generate(req(), 'sk-x', { fetchImpl })
    expect(seen.url).toBe('https://api.openai.com/v1/images/generations')
    expect(seen.init.headers.Authorization).toBe('Bearer sk-x')
  })

  it('hands an error reply back unparsed, with its status', async () => {
    const fetchImpl = async () => new Response('{"error":{"message":"bad"}}', { status: 400, headers: { 'content-type': 'application/json' } })
    const out = await openaiProvider.generate(req(), 'sk-x', { fetchImpl })
    expect(out).toEqual({ ok: false, status: 400, body: '{"error":{"message":"bad"}}', contentType: 'application/json' })
  })

  it('reports a network failure as 502 with a message', async () => {
    const fetchImpl = async () => { throw new Error('ECONNRESET') }
    const out = await openaiProvider.generate(req(), 'sk-x', { fetchImpl })
    expect(out).toEqual({ ok: false, status: 502, message: 'Upstream request failed: ECONNRESET' })
  })

  it('reports a body that fails to read after headers as 502, never rejecting', async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, headers: new Headers(), text: async () => { throw new Error('ECONNRESET') } })
    const out = await openaiProvider.generate(req(), 'sk-x', { fetchImpl })
    expect(out).toEqual({ ok: false, status: 502, message: 'Upstream request failed: ECONNRESET' })
  })
})

describe('openai usage', () => {
  it('reads input and output tokens from the reply', async () => {
    const body = { data: [{ b64_json: 'QUJD' }], usage: { total_tokens: 1310, input_tokens: 38, output_tokens: 1272, input_tokens_details: { text_tokens: 38 } } }
    const fetchImpl = async () => new Response(JSON.stringify(body), { status: 200 })
    expect((await openaiProvider.generate(req(), 'sk-x', { fetchImpl })).usage).toEqual({ input: 38, output: 1272 })
  })
  it('is null when either count is missing or not a whole number', () => {
    expect(usageFromImages({})).toBeNull()
    expect(usageFromImages({ usage: { input_tokens: 5 } })).toBeNull()
    expect(usageFromImages({ usage: { input_tokens: 5, output_tokens: -1 } })).toBeNull()
    expect(usageFromImages({ usage: { input_tokens: '5', output_tokens: 9 } })).toBeNull()
  })
})

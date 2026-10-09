import { describe, it, expect } from '@jest/globals'
import { googleProvider, imagesFromInteraction } from './google.js'

const req = (over = {}) => ({ provider: 'google', model: 'gemini-nano-banana-2.1', prompt: 'a cat', shape: 'square', quality: 'auto', n: 1, ...over })
const spec = (id) => googleProvider.models.find((m) => m.id === id)

describe('google buildBody', () => {
  it('asks for one PNG at the shape\'s aspect ratio and size, and not to store it', () => {
    expect(googleProvider.buildBody(req({ shape: 'wide-2k' }), spec('gemini-nano-banana-2.1'))).toEqual({
      model: 'gemini-nano-banana-2.1',
      input: 'a cat',
      response_format: { type: 'image', mime_type: 'image/png', aspect_ratio: '16:9', image_size: '2K' },
      store: false,
    })
  })
  it('maps tall to 9:16 at 1K', () => {
    const body = googleProvider.buildBody(req({ shape: 'tall' }), spec('gemini-3.1-flash-lite-image'))
    expect(body.response_format).toMatchObject({ aspect_ratio: '9:16', image_size: '1K' })
  })
  it('gives Lite no 2K shapes', () => {
    expect(Object.keys(spec('gemini-3.1-flash-lite-image').shapes)).toEqual(['square', 'wide', 'tall'])
  })
})

describe('imagesFromInteraction', () => {
  it('reads the output_image convenience field', () => {
    expect(imagesFromInteraction({ status: 'completed', output_image: { data: 'QUJD', mime_type: 'image/png' } })).toEqual([{ b64: 'QUJD', mime: 'image/png' }])
  })
  it('falls back to model_output steps', () => {
    const json = { status: 'completed', steps: [
      { type: 'thought', content: [{ type: 'image', data: 'VEhJTks=', mime_type: 'image/png' }] },
      { type: 'model_output', content: [{ type: 'text', text: 'here' }, { type: 'image', data: 'QUJD', mime_type: 'image/jpeg' }] },
    ] }
    expect(imagesFromInteraction(json)).toEqual([{ b64: 'QUJD', mime: 'image/jpeg' }])
  })
  it('returns nothing for a reply with no image', () => {
    expect(imagesFromInteraction({ status: 'completed', steps: [] })).toEqual([])
  })
})

describe('google generate', () => {
  it('sends the key in x-goog-api-key, never in the URL', async () => {
    let seen
    const fetchImpl = async (url, init) => { seen = { url, init }; return new Response(JSON.stringify({ status: 'completed', output_image: { data: 'QUJD', mime_type: 'image/png' } }), { status: 200 }) }
    const out = await googleProvider.generate(req(), 'AIza-test', { fetchImpl })
    expect(seen.url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions')
    expect(seen.url).not.toMatch(/AIza/)
    expect(seen.init.headers['x-goog-api-key']).toBe('AIza-test')
    expect(out).toEqual({ ok: true, images: [{ b64: 'QUJD', mime: 'image/png' }] })
  })
  it('reports an interaction that did not complete, with Google\'s reason', async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ status: 'failed', errors: [{ code: 'x', message: 'Safety filter' }] }), { status: 200 })
    expect(await googleProvider.generate(req(), 'k', { fetchImpl })).toEqual({ ok: false, status: 502, message: 'Google did not finish the image (failed): Safety filter' })
  })
  it('hands an error reply back unparsed, with its status', async () => {
    const fetchImpl = async () => new Response('{"error":{"message":"API key not valid"}}', { status: 400, headers: { 'content-type': 'application/json' } })
    expect(await googleProvider.generate(req(), 'k', { fetchImpl })).toEqual({ ok: false, status: 400, body: '{"error":{"message":"API key not valid"}}', contentType: 'application/json' })
  })
  it('reports a network failure as 502', async () => {
    const fetchImpl = async () => { throw new Error('ETIMEDOUT') }
    expect(await googleProvider.generate(req(), 'k', { fetchImpl })).toEqual({ ok: false, status: 502, message: 'Upstream request failed: ETIMEDOUT' })
  })
  it('reports a body that fails to read after headers as 502, never rejecting', async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, headers: new Headers(), text: async () => { throw new Error('ECONNRESET') } })
    expect(await googleProvider.generate(req(), 'k', { fetchImpl })).toEqual({ ok: false, status: 502, message: 'Upstream request failed: ECONNRESET' })
  })
})

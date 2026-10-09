import { describe, it, expect } from '@jest/globals'
import { resolveImageRequest, listImageModels, findProvider } from './providers.js'
import { sizeToShape } from './catalog.js'

const ok = (body) => resolveImageRequest(body).request

describe('the prompt', () => {
  it('is required, and more than whitespace', () => {
    expect(resolveImageRequest({}).error?.status).toBe(400)
    expect(resolveImageRequest({ prompt: '   ' }).error?.status).toBe(400)
  })
  it('is trimmed', () => { expect(ok({ prompt: '  a cat ' }).prompt).toBe('a cat') })
  it('is refused over the model limit, accepted at it', () => {
    expect(resolveImageRequest({ prompt: 'x'.repeat(4001) }).error.body.error.message).toMatch(/too long \(max 4000/)
    expect(ok({ prompt: 'x'.repeat(4000) })).toBeDefined()
  })
})

describe('provider and model', () => {
  it('defaults to OpenAI Flare, so an older client sending only a prompt still works', () => {
    expect(ok({ prompt: 'a cat' })).toEqual({ provider: 'openai', model: 'gpt-image-2.5-flare', prompt: 'a cat', shape: 'square', quality: 'auto', n: 1 })
  })
  it('replaces an unknown provider with OpenAI', () => {
    expect(ok({ prompt: 'a', provider: 'midjourney' }).provider).toBe('openai')
  })
  it('replaces an unknown or retired model with the provider default', () => {
    for (const model of ['dall-e-3', 'gpt-image-1', 'gpt-image-1.5', 'nonsense']) {
      expect(ok({ prompt: 'a', model }).model).toBe('gpt-image-2.5-flare')
    }
    expect(ok({ prompt: 'a', provider: 'google', model: 'imagen-4.0-generate-001' }).model).toBe('gemini-nano-banana-2.1')
  })
  it('never pairs a model with the wrong provider', () => {
    expect(ok({ prompt: 'a', provider: 'google', model: 'gpt-image-2' }).model).toBe('gemini-nano-banana-2.1')
  })
})

describe('shape and quality', () => {
  it('keeps a shape the model takes and replaces one it does not', () => {
    expect(ok({ prompt: 'a', shape: 'wide-2k' }).shape).toBe('wide-2k')
    expect(ok({ prompt: 'a', model: 'gpt-image-2', shape: 'wide-2k' }).shape).toBe('square')
    expect(ok({ prompt: 'a', shape: 'panorama' }).shape).toBe('square')
  })
  it('keeps a quality the model takes and replaces one it does not', () => {
    expect(ok({ prompt: 'a', quality: 'max' }).quality).toBe('max')
    expect(ok({ prompt: 'a', model: 'gpt-image-2', quality: 'max' }).quality).toBe('auto')
    expect(ok({ prompt: 'a', provider: 'google', quality: 'high' }).quality).toBe('auto')
  })
  it('maps an old size to the nearest shape', () => {
    expect(ok({ prompt: 'a', size: '1536x1024' }).shape).toBe('wide')
    expect(ok({ prompt: 'a', size: '1024x1536' }).shape).toBe('tall')
    expect(ok({ prompt: 'a', size: '2048x2048' }).shape).toBe('square-2k')
    expect(ok({ prompt: 'a', model: 'gpt-image-2', size: '2048x1152' }).shape).toBe('wide')
    expect(ok({ prompt: 'a', size: 'auto' }).shape).toBe('square')
  })
  it('prefers shape over size when both are sent', () => {
    expect(ok({ prompt: 'a', shape: 'tall', size: '1536x1024' }).shape).toBe('tall')
  })
  it('sizeToShape treats near-square as square', () => {
    expect(sizeToShape('1040x1024', ['square', 'wide', 'tall'])).toBe('square')
  })
})

describe('n', () => {
  it('is clamped to 1..maxN for the model', () => {
    expect(ok({ prompt: 'a', n: 0 }).n).toBe(1)
    expect(ok({ prompt: 'a', n: 9 }).n).toBe(4)
    expect(ok({ prompt: 'a', provider: 'google', n: 3 }).n).toBe(1)
  })
})

describe('listImageModels', () => {
  it('marks each provider available or not, with a reason when not', () => {
    const list = listImageModels((id) => id === 'openai')
    const openai = list.providers.find((p) => p.id === 'openai')
    const google = list.providers.find((p) => p.id === 'google')
    expect(openai.available).toBe(true)
    expect(openai.reason).toBeUndefined()
    expect(google.available).toBe(false)
    expect(google.reason).toBe('Add a Google key in provider settings.')
  })
  it('lists shapes as names and no provider-internal values', () => {
    const flare = listImageModels(() => true).providers[0].models[0]
    expect(flare).toEqual({
      id: 'gpt-image-2.5-flare', label: 'Fast', description: 'Everyday images, quickly.',
      shapes: ['square', 'wide', 'tall', 'square-2k', 'wide-2k', 'tall-2k'],
      qualities: ['auto', 'low', 'medium', 'high', 'xhigh', 'max'],
      maxPrompt: 4000, maxN: 4, default: true,
    })
  })
  it('never carries anything that looks like a key', () => {
    expect(JSON.stringify(listImageModels(() => true))).not.toMatch(/sk-|key"/i)
  })
  it('finds providers by id only', () => {
    expect(findProvider('openai').label).toBe('OpenAI')
    expect(findProvider('OPENAI')).toBeNull()
  })
})

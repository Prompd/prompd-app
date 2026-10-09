/**
 * buildImageRequest: validation and normalization for prompd.app's image
 * gateway. The same rules as corenel-api's copy of this route (kept in step:
 * both forward to OpenAI's Images API with the user's own key).
 */
import { describe, it, expect } from '@jest/globals'
import { buildImageRequest } from './images.js'


describe('the prompt', () => {
  it('is required', () => {
    expect(buildImageRequest({}).error?.status).toBe(400)
    expect(buildImageRequest({ prompt: '' }).error?.status).toBe(400)
  })

  it('is required to be more than whitespace', () => {
    // A prompt of spaces reaches OpenAI as a paid request for nothing.
    expect(buildImageRequest({ prompt: '   ' }).error?.status).toBe(400)
  })

  it('is trimmed before it is forwarded', () => {
    expect(buildImageRequest({ prompt: '  a cat  ' }).upstreamBody.prompt).toBe('a cat')
  })

  it('is refused when too long, rather than forwarded to be rejected upstream', () => {
    // Caught here so the caller gets a clear 400 instead of an opaque
    // provider error, and so an oversized body is never paid for.
    const built = buildImageRequest({ prompt: 'x'.repeat(4001) })
    expect(built.error?.status).toBe(400)
    expect(built.error.body.error.message).toMatch(/too long/)
  })

  it('accepts one right at the limit', () => {
    expect(buildImageRequest({ prompt: 'x'.repeat(4000) }).upstreamBody).toBeDefined()
  })
})

describe('the model', () => {
  it('defaults to gpt-image-2.5-flare', () => {
    expect(buildImageRequest({ prompt: 'a cat' }).upstreamBody.model).toBe('gpt-image-2.5-flare')
  })

  it('accepts the current models', () => {
    for (const model of ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst', 'gpt-image-2']) {
      expect(buildImageRequest({ prompt: 'a cat', model }).upstreamBody.model).toBe(model)
    }
  })

  it('replaces a retired or shutting-down model with the default rather than forwarding it', () => {
    /* dall-e-2 and dall-e-3 were retired on 2026-05-12 and gpt-image-1 shuts
     * down on 2026-10-23 (OpenAI deprecations page): forwarding them would be
     * a paid request that fails. */
    for (const model of ['gpt-image-1', 'dall-e-3', 'dall-e-2']) {
      expect(buildImageRequest({ prompt: 'a cat', model }).upstreamBody.model).toBe('gpt-image-2.5-flare')
    }
  })

  it('falls back to the default for anything else, rather than forwarding it', () => {
    /* An allowlist, not a passthrough: the caller's `model` reaches a paid
     * provider endpoint, and forwarding an arbitrary string there is both an
     * upstream error and an unbounded surface. */
    expect(buildImageRequest({ prompt: 'a cat', model: 'gpt-4o' }).upstreamBody.model).toBe('gpt-image-2.5-flare')
    expect(buildImageRequest({ prompt: 'a cat', model: 'anything-at-all' }).upstreamBody.model).toBe('gpt-image-2.5-flare')
  })
})

describe('response_format', () => {
  /* Every model left on the list returns base64 and REJECTS response_format
   * outright, so it is never sent. */
  it('is never sent', () => {
    for (const model of ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst', 'gpt-image-2']) {
      expect(buildImageRequest({ prompt: 'a cat', model }).upstreamBody.response_format).toBeUndefined()
    }
  })
})

describe('size', () => {
  it('defaults to 1024x1024', () => {
    expect(buildImageRequest({ prompt: 'a cat' }).upstreamBody.size).toBe('1024x1024')
  })

  it('passes the standard square, landscape and portrait sizes through for every model', () => {
    for (const model of ['gpt-image-2.5-flare', 'gpt-image-2']) {
      for (const size of ['1024x1024', '1536x1024', '1024x1536', 'auto']) {
        expect(buildImageRequest({ prompt: 'a cat', model, size }).upstreamBody.size).toBe(size)
      }
    }
  })

  it('takes a valid custom size on the 2.5 models, up to 4K', () => {
    for (const size of ['2048x2048', '2048x1152', '3840x2160', '2160x3840', '1536x864']) {
      expect(buildImageRequest({ prompt: 'a cat', size }).upstreamBody.size).toBe(size)
    }
  })

  it('refuses a custom size that breaks the rules, using the default instead', () => {
    for (const size of [
      '1000x1000', // not multiples of 16
      '4096x2048', // an edge over 3840
      '2400x768', // wider than 3:1
      '512x512', // under 655,360 pixels
      '99x99', 'big', '1024x1024x2',
    ]) {
      expect(buildImageRequest({ prompt: 'a cat', size }).upstreamBody.size).toBe('1024x1024')
    }
  })

  it('takes no custom size on gpt-image-2', () => {
    expect(buildImageRequest({ prompt: 'a cat', model: 'gpt-image-2', size: '2048x2048' }).upstreamBody.size).toBe('1024x1024')
  })
})

describe('quality', () => {
  it('is left to the provider default when not asked for', () => {
    expect(buildImageRequest({ prompt: 'a cat' }).upstreamBody.quality).toBeUndefined()
  })

  it('passes every 2.5 level through, including xhigh and max', () => {
    for (const quality of ['auto', 'low', 'medium', 'high', 'xhigh', 'max']) {
      expect(buildImageRequest({ prompt: 'a cat', model: 'gpt-image-2.5-sunburst', quality }).upstreamBody.quality).toBe(quality)
    }
  })

  it('drops a level the model does not take, rather than forwarding it to be refused', () => {
    expect(buildImageRequest({ prompt: 'a cat', model: 'gpt-image-2', quality: 'max' }).upstreamBody.quality).toBeUndefined()
    expect(buildImageRequest({ prompt: 'a cat', quality: 'ultra' }).upstreamBody.quality).toBeUndefined()
  })
})

describe('n — how many images', () => {
  it('defaults to one', () => {
    expect(buildImageRequest({ prompt: 'a cat' }).upstreamBody.n).toBe(1)
  })

  it('is clamped to at most four, because each one is a separate charge', () => {
    expect(buildImageRequest({ prompt: 'a cat', n: 50 }).upstreamBody.n).toBe(4)
  })

  it('is at least one, whatever nonsense arrives', () => {
    expect(buildImageRequest({ prompt: 'a cat', n: 0 }).upstreamBody.n).toBe(1)
    expect(buildImageRequest({ prompt: 'a cat', n: -3 }).upstreamBody.n).toBe(1)
    expect(buildImageRequest({ prompt: 'a cat', n: 'many' }).upstreamBody.n).toBe(1)
  })
})

describe('a missing body', () => {
  it('is a 400, not a crash', () => {
    // req.body can be undefined when no JSON was sent at all.
    expect(buildImageRequest(undefined).error?.status).toBe(400)
    expect(buildImageRequest(null).error?.status).toBe(400)
  })
})

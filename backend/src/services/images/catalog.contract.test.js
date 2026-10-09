/**
 * The image catalogue exists in TWO repos (corenel-api and prompd-app), and
 * this file is identical in both. A change to one repo's catalogue fails this
 * test there until the other is changed to match, which is the only thing
 * keeping the two in step until they share a package.
 */
import { describe, it, expect } from '@jest/globals'
import { SHAPES, QUALITIES } from './catalog.js'
import { listImageModels } from './providers.js'

const EXPECTED = {
  openai: {
    'gpt-image-2.5-flare': { shapes: SHAPES, qualities: QUALITIES, maxN: 4, default: true },
    'gpt-image-2.5-sunburst': { shapes: SHAPES, qualities: QUALITIES, maxN: 4, default: false },
    'gpt-image-2': { shapes: ['square', 'wide', 'tall'], qualities: ['auto', 'low', 'medium', 'high'], maxN: 4, default: false },
  },
  google: {
    'gemini-nano-banana-2.1': { shapes: SHAPES, qualities: ['auto'], maxN: 1, default: true },
    'gemini-3-pro-image': { shapes: SHAPES, qualities: ['auto'], maxN: 1, default: false },
    'gemini-3.1-flash-lite-image': { shapes: ['square', 'wide', 'tall'], qualities: ['auto'], maxN: 1, default: false },
  },
}

describe('image catalogue contract (identical in corenel-api and prompd-app)', () => {
  it('names the same shapes and qualities', () => {
    expect(SHAPES).toEqual(['square', 'wide', 'tall', 'square-2k', 'wide-2k', 'tall-2k'])
    expect(QUALITIES).toEqual(['auto', 'low', 'medium', 'high', 'xhigh', 'max'])
  })
  it('lists the same providers, models, shapes, qualities and limits', () => {
    const got = {}
    for (const p of listImageModels(() => true).providers) {
      got[p.id] = {}
      for (const m of p.models) got[p.id][m.id] = { shapes: m.shapes, qualities: m.qualities, maxN: m.maxN, default: m.default }
    }
    expect(got).toEqual(EXPECTED)
  })
  it('gives every model a 4000-character prompt limit', () => {
    for (const p of listImageModels(() => true).providers) for (const m of p.models) expect(m.maxPrompt).toBe(4000)
  })
})

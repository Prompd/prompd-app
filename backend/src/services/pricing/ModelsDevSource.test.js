import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals'
import { ModelsDevSource } from './ModelsDevSource.js'

afterEach(() => { jest.restoreAllMocks() })

// A catalog with three openai models: one complete, one input-only (no output
// price), one a normal chat model. listForProvider must only surface complete-
// priced text models — an input-only entry would make ModelPricing.create throw
// (outputTokens is required) and abort the whole provider's seed.
const catalog = () => ({
  openai: {
    models: {
      'gpt-4o-mini': { name: 'GPT-4o mini', cost: { input: 0.15, output: 0.6 }, modalities: { input: ['text', 'image'] }, tool_call: true },
      'text-embedding-3': { name: 'Embed', cost: { input: 0.02 }, modalities: { input: ['text'] } }, // input-only -> must be dropped
      'gpt-5': { name: 'GPT-5', cost: { input: 1.0, output: 8.0 }, modalities: { input: ['text'] } },
    },
  },
})

let src
beforeEach(() => {
  src = new ModelsDevSource()
  src.catalog = catalog()
  src.fetchedAt = Date.now() // fresh -> load() serves the injected catalog, no network
})

describe('ModelsDevSource.listForProvider — only complete-priced text models', () => {
  it('drops an input-only entry (no output price) so seeding cannot throw', async () => {
    const list = await src.listForProvider('openai')
    const ids = list.map((m) => m.model)
    expect(ids).toContain('gpt-4o-mini')
    expect(ids).toContain('gpt-5')
    expect(ids).not.toContain('text-embedding-3')
  })

  it('every returned entry has both input and output token pricing', async () => {
    for (const m of await src.listForProvider('openai')) {
      expect(typeof m.pricing.inputTokens).toBe('number')
      expect(typeof m.pricing.outputTokens).toBe('number')
    }
  })
})

describe('ModelsDevSource.load — reachability signal', () => {
  it('wasReachable() is true after a successful (cached) load', async () => {
    await src.listForProvider('openai')
    expect(src.wasReachable()).toBe(true)
  })

  it('wasReachable() is false when there is no catalog and fetch fails', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))
    const cold = new ModelsDevSource()
    cold.catalog = null
    cold.fetchedAt = 0
    const result = await cold.load()
    expect(result).toBeNull()
    expect(cold.wasReachable()).toBe(false)
  })
})

describe('ModelsDevSource.overlay — reject implausible unit slips', () => {
  it('ignores a models.dev price that is >100x the seed (a per-1K vs per-1M slip)', async () => {
    src.catalog = { openai: { models: { 'gpt-4o-mini': { name: 'x', cost: { input: 150, output: 600 } } } } }
    src.fetchedAt = Date.now()
    const models = [{ model: 'gpt-4o-mini', pricing: { inputTokens: 0.15, outputTokens: 0.6 }, capabilities: {} }]
    await src.overlay('openai', models)
    // The 1000x values must be rejected; the seed price stands.
    expect(models[0].pricing.inputTokens).toBe(0.15)
    expect(models[0].pricing.outputTokens).toBe(0.6)
  })

  it('applies a normal in-range correction', async () => {
    src.catalog = { openai: { models: { 'gpt-4o-mini': { name: 'x', cost: { input: 0.2, output: 0.7 } } } } }
    src.fetchedAt = Date.now()
    const models = [{ model: 'gpt-4o-mini', pricing: { inputTokens: 0.15, outputTokens: 0.6 }, capabilities: {} }]
    await src.overlay('openai', models)
    expect(models[0].pricing.inputTokens).toBe(0.2)
    expect(models[0].pricing.outputTokens).toBe(0.7)
  })
})

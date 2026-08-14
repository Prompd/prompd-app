import { describe, it, expect } from '@jest/globals'
import { clampServerOutputTokens, MAX_OUTPUT_TOKENS, isReasoningEffortToolsError } from './chatCompletions.js'

describe('isReasoningEffortToolsError — reasoning-model tool-call retry signal', () => {
  it('matches OpenAI\'s reasoning_effort + function tools rejection', () => {
    const text = JSON.stringify({
      error: {
        message: "Function tools with reasoning_effort are not supported for gpt-5.6-luna in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.",
        type: 'invalid_request_error',
      },
    })
    expect(isReasoningEffortToolsError(text)).toBe(true)
  })

  it('does not match unrelated upstream errors or empty input', () => {
    expect(isReasoningEffortToolsError(JSON.stringify({ error: { message: 'Rate limit reached', type: 'rate_limit_error' } }))).toBe(false)
    expect(isReasoningEffortToolsError(JSON.stringify({ error: { message: 'Unsupported tool type' } }))).toBe(false)
    expect(isReasoningEffortToolsError('')).toBe(false)
    expect(isReasoningEffortToolsError(null)).toBe(false)
  })
})

describe('clampServerOutputTokens — free server-key output ceiling', () => {
  it('clamps max_tokens above the ceiling', () => {
    const b = { max_tokens: 100000 }
    clampServerOutputTokens(b)
    expect(b.max_tokens).toBe(MAX_OUTPUT_TOKENS)
  })

  it('clamps max_completion_tokens (the field o-series / newer models honor)', () => {
    const b = { max_completion_tokens: 32768 }
    clampServerOutputTokens(b)
    expect(b.max_completion_tokens).toBe(MAX_OUTPUT_TOKENS)
  })

  it('applies a default ceiling when NEITHER field is present', () => {
    const b = { model: 'gpt-4o-mini' }
    clampServerOutputTokens(b)
    // whichever field it sets, the effective cap must be the ceiling
    const eff = b.max_completion_tokens ?? b.max_tokens
    expect(eff).toBe(MAX_OUTPUT_TOKENS)
  })

  it('leaves a small explicit value untouched', () => {
    const b = { max_tokens: 256 }
    clampServerOutputTokens(b)
    expect(b.max_tokens).toBe(256)
  })

  it('clamps BOTH fields when both are oversized', () => {
    const b = { max_tokens: 99999, max_completion_tokens: 99999 }
    clampServerOutputTokens(b)
    expect(b.max_tokens).toBe(MAX_OUTPUT_TOKENS)
    expect(b.max_completion_tokens).toBe(MAX_OUTPUT_TOKENS)
  })
})

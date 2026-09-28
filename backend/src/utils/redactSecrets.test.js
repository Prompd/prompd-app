/* This service relays upstream provider errors verbatim, and a provider answers
 * a bad key by quoting it back. These pin that the credential is removed while
 * the error stays diagnostic — the relay is worth keeping, only the key is not.
 */
import { describe, it, expect } from '@jest/globals'
import { redactSecrets } from './redactSecrets.js'

describe('redactSecrets', () => {
  it('removes the key from the real OpenAI 401 body', () => {
    const body = JSON.stringify({
      error: {
        message: 'Incorrect API key provided: sk-svcac*********************************pwMA. '
          + 'You can find your API key at https://platform.openai.com/account/api-keys.',
        type: 'invalid_request_error',
        code: 'invalid_api_key',
      },
    })
    const out = redactSecrets(body)
    expect(out).not.toContain('sk-svcac')
    expect(out).not.toContain('pwMA')
    expect(out).toContain('[redacted]')
    // Still valid JSON, and still says what went wrong.
    expect(JSON.parse(out).error.code).toBe('invalid_api_key')
    expect(JSON.parse(out).error.message).toContain('Incorrect API key provided')
  })

  it('removes an unmasked key, which is the worse case', () => {
    expect(redactSecrets('auth failed for sk-proj-abcdef1234567890abcdef'))
      .toBe('auth failed for [redacted]')
  })

  it('covers the providers this service forwards to', () => {
    expect(redactSecrets('key sk-ant-api03-XXXXXXXXXXXX bad')).toBe('key [redacted] bad')
    expect(redactSecrets('key gsk_ABCDEFGHIJKLMNOP bad')).toBe('key [redacted] bad')
    // Clerk's shape, which reaches this function through the identity resolver.
    expect(redactSecrets('key sk_test_ABCDEFGHIJKLMNOP bad')).toBe('key [redacted] bad')
    expect(redactSecrets('key sk_live_ABCDEFGHIJKLMNOP bad')).toBe('key [redacted] bad')
    expect(redactSecrets('key AIzaSyABCDEFGHIJKLMNOP bad')).toBe('key [redacted] bad')
    expect(redactSecrets('key xai-ABCDEFGHIJKLMNOP bad')).toBe('key [redacted] bad')
  })

  it('removes a bearer token whatever its shape', () => {
    expect(redactSecrets('sent Bearer eyJhbGciOiJIUzI1NiIs.abc-_123 upstream'))
      .toBe('sent Bearer [redacted] upstream')
  })

  it('leaves an ordinary upstream error alone', () => {
    const body = '{"error":{"message":"model gpt-5 is overloaded","type":"server_error"}}'
    expect(redactSecrets(body)).toBe(body)
  })

  it('KEEPS a request id — the thing needed to file a provider ticket', () => {
    const body = '{"error":{"message":"rate limited","request_id":"req_9f8e7d6c5b4a3210fedcba98"}}'
    expect(redactSecrets(body)).toBe(body)
  })

  it('redacts every occurrence, not just the first', () => {
    expect(redactSecrets('tried sk-aaaaaaaaaaaa then sk-bbbbbbbbbbbb'))
      .toBe('tried [redacted] then [redacted]')
  })

  it('passes through a non-string or empty body without a guard at the call site', () => {
    expect(redactSecrets('')).toBe('')
    expect(redactSecrets(null)).toBe(null)
    expect(redactSecrets(undefined)).toBe(undefined)
  })
})

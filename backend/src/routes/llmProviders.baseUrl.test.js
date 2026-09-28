import { describe, it, expect } from '@jest/globals'
import { customBaseUrlError } from './llmProviders.js'

describe('customBaseUrlError (F6 write-time check)', () => {
  it('refuses internal targets', () => {
    for (const u of ['http://169.254.169.254/v1', 'http://localhost:11434/v1', 'http://[::ffff:7f00:1]/v1', 'http://metadata.google.internal/', 'file:///etc/passwd', 'http://10.0.0.1/']) {
      expect(customBaseUrlError(u)).toMatch(/rejected/)
    }
  })
  it('requires a value', () => {
    expect(customBaseUrlError(undefined)).toMatch(/required/)
  })
  it('accepts a public https base URL', () => {
    expect(customBaseUrlError('https://api.example.com/v1')).toBeNull()
  })
})

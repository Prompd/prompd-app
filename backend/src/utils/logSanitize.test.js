/* F10: what reaches Cloud Logging. Redaction by key NAME alone let a key sent
 * under an unexpected name (or pasted into a prompt) through, and prompt text
 * (potential PHI) was logged on every 4xx. Values are now redacted by pattern
 * and content-bearing fields are not logged at all. */
import { describe, it, expect, jest, afterEach } from '@jest/globals'
import { sanitizeLogData, redactUrl } from './logSanitize.js'
import { requestLogger } from '../middleware/logger.js'
import { errorHandler } from '../middleware/errorHandler.js'

const KEY = 'sk-proj-abcdefghijklmnop1234567890'

describe('sanitizeLogData', () => {
  it('redacts a secret by VALUE under a key name no list would guess', () => {
    const out = JSON.stringify(sanitizeLogData({ providerCfg: { baseUrl: 'https://x', whatever: KEY }, note: `Bearer ${KEY}` }))
    expect(out).not.toContain('abcdefghijklmnop')
    expect(out).toContain('https://x')
  })
  it('still redacts by key name, case-insensitively', () => {
    const out = sanitizeLogData({ apiKey: 'plain-value-1', Authorization: 'x', clientSecret: 'y', key: 'z' })
    expect(Object.values(out).every((v) => v === '[REDACTED]')).toBe(true)
  })
  it('does not log prompt / message content, only its size', () => {
    const out = JSON.stringify(sanitizeLogData({ content: 'patient John Doe DOB 1970-01-01', messages: [{ role: 'user', content: 'secret history' }], prompt: 'p', compiledPrompt: 'c', parameters: { name: 'John' } }))
    expect(out).not.toContain('John')
    expect(out).not.toContain('secret history')
    expect(out).toContain('omitted')
  })
  it('handles arrays, depth and non-objects', () => {
    expect(sanitizeLogData(null)).toBeNull()
    expect(sanitizeLogData('x')).toBe('x')
    expect(JSON.stringify(sanitizeLogData([{ a: KEY }]))).not.toContain('abcdefghijklmnop')
    let deep = {}; const root = deep
    for (let i = 0; i < 20; i++) { deep.n = {}; deep = deep.n }
    expect(() => sanitizeLogData(root)).not.toThrow()
  })
})

describe('redactUrl', () => {
  it('redacts credential query parameters', () => {
    const u = redactUrl(`/api/x?token=${KEY}&page=2&api_key=abc123456789`)
    expect(u).not.toContain('abcdefghijklmnop')
    expect(u).not.toContain('abc123456789')
    expect(u).toContain('page=2')
  })
})

describe('the loggers use it', () => {
  afterEach(() => jest.restoreAllMocks())

  it('requestLogger 4xx log carries no key and no prompt text', () => {
    const lines = []
    jest.spyOn(console, 'error').mockImplementation((...a) => lines.push(JSON.stringify(a)))
    jest.spyOn(console, 'log').mockImplementation((...a) => lines.push(JSON.stringify(a)))
    const req = { method: 'POST', url: `/api/compilation/execute?token=${KEY}`, body: { prompt: 'patient Jane Roe', config: { k: KEY } }, query: { token: KEY }, get: () => 'ua', ip: '1.2.3.4' }
    const res = { statusCode: 400, setHeader() {}, getHeader() { return 0 }, end() {} }
    requestLogger(req, res, () => {})
    res.end()
    const all = lines.join('\n')
    expect(all).not.toContain('abcdefghijklmnop')
    expect(all).not.toContain('Jane Roe')
  })

  it('errorHandler log carries no key and no prompt text', () => {
    const lines = []
    jest.spyOn(console, 'error').mockImplementation((...a) => lines.push(JSON.stringify(a)))
    jest.spyOn(console, 'log').mockImplementation(() => {})
    const req = { method: 'POST', url: `/x?api_key=${KEY}`, body: { content: 'patient Jane Roe', misc: KEY }, query: {}, params: {}, get: () => 'ua', ip: '1.2.3.4' }
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this }, json() { return this } }
    errorHandler(new Error(`boom ${KEY}`), req, res, () => {})
    const all = lines.join('\n')
    expect(all).not.toContain('abcdefghijklmnop')
    expect(all).not.toContain('Jane Roe')
  })
})

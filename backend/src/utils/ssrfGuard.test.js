import { describe, it, expect } from '@jest/globals'
import { assertPublicHttpUrl, isBlockedHost } from './ssrfGuard.js'

describe('isBlockedHost', () => {
  it('blocks loopback and localhost', () => {
    expect(isBlockedHost('localhost')).toBe(true)
    expect(isBlockedHost('127.0.0.1')).toBe(true)
    expect(isBlockedHost('127.9.9.9')).toBe(true)
    expect(isBlockedHost('::1')).toBe(true)
    expect(isBlockedHost('[::1]')).toBe(true)
  })
  it('blocks the cloud metadata address', () => {
    expect(isBlockedHost('169.254.169.254')).toBe(true) // link-local / IMDS
    expect(isBlockedHost('169.254.0.1')).toBe(true)
  })
  it('blocks RFC1918 private ranges', () => {
    expect(isBlockedHost('10.0.0.5')).toBe(true)
    expect(isBlockedHost('172.16.0.1')).toBe(true)
    expect(isBlockedHost('172.31.255.255')).toBe(true)
    expect(isBlockedHost('192.168.1.1')).toBe(true)
  })
  it('does not block public ranges just outside the private blocks', () => {
    expect(isBlockedHost('172.15.0.1')).toBe(false)
    expect(isBlockedHost('172.32.0.1')).toBe(false)
    expect(isBlockedHost('11.0.0.1')).toBe(false)
    expect(isBlockedHost('8.8.8.8')).toBe(false)
  })
  it('blocks unique-local and link-local IPv6', () => {
    expect(isBlockedHost('fd00::1')).toBe(true)
    expect(isBlockedHost('fe80::1')).toBe(true)
    expect(isBlockedHost('[fd12:3456::1]')).toBe(true)
  })
  it('blocks bare hostnames with no dot (internal service names)', () => {
    expect(isBlockedHost('mongodb')).toBe(true)
    expect(isBlockedHost('redis')).toBe(true)
  })
  it('allows normal public hostnames', () => {
    expect(isBlockedHost('api.example.com')).toBe(false)
    expect(isBlockedHost('mcp.acme.io')).toBe(false)
  })
})

describe('assertPublicHttpUrl', () => {
  it('accepts a public https URL and returns it', () => {
    expect(assertPublicHttpUrl('https://mcp.acme.io/rpc')).toBe('https://mcp.acme.io/rpc')
  })
  it('rejects non-http(s) schemes', () => {
    expect(() => assertPublicHttpUrl('file:///etc/passwd')).toThrow(/scheme/i)
    expect(() => assertPublicHttpUrl('gopher://x')).toThrow(/scheme/i)
  })
  it('rejects a metadata / private / loopback target', () => {
    expect(() => assertPublicHttpUrl('http://169.254.169.254/latest/meta-data/')).toThrow(/not allowed|private|blocked/i)
    expect(() => assertPublicHttpUrl('http://localhost:27017')).toThrow(/not allowed|private|blocked/i)
    expect(() => assertPublicHttpUrl('http://10.1.2.3:8080/admin')).toThrow(/not allowed|private|blocked/i)
  })
  it('rejects garbage that is not a URL', () => {
    expect(() => assertPublicHttpUrl('not a url')).toThrow()
    expect(() => assertPublicHttpUrl('')).toThrow()
  })
  it('rejects a URL whose host is an IP in a private range with a port', () => {
    expect(() => assertPublicHttpUrl('http://192.168.0.1:9200')).toThrow(/not allowed|private|blocked/i)
  })
})

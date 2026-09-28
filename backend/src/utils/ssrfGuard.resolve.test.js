/* F6: the SSRF guard must hold against the forms that slipped past a
 * literal-host check -- IPv6-mapped IPv4, trailing-dot hostnames, the GCP
 * metadata name, a public name that RESOLVES to a private address, and a
 * redirect that lands on a blocked host. DNS is stubbed; nothing leaves the
 * process. */
import { describe, it, expect, jest, afterEach } from '@jest/globals'
import { isBlockedHost, isBlockedAddress, assertPublicHttpUrlResolved, safeFetch, setLookupForTests } from './ssrfGuard.js'

afterEach(() => { setLookupForTests(null) })

const lookupTable = (table) => async (host) => {
  const addrs = table[host]
  if (!addrs) { const e = new Error(`ENOTFOUND ${host}`); e.code = 'ENOTFOUND'; throw e }
  return addrs.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }))
}

describe('isBlockedHost: shapes that used to pass', () => {
  it('blocks IPv6-mapped IPv4 loopback / metadata / private, in URL-normalized hex form too', () => {
    expect(isBlockedHost('::ffff:127.0.0.1')).toBe(true)
    expect(isBlockedHost('[::ffff:7f00:1]')).toBe(true)          // what new URL() produces
    expect(isBlockedHost('::ffff:a9fe:a9fe')).toBe(true)          // 169.254.169.254
    expect(isBlockedHost('::ffff:10.0.0.1')).toBe(true)
    expect(isBlockedHost('0:0:0:0:0:ffff:c0a8:0101')).toBe(true)  // 192.168.1.1
  })
  it('blocks NAT64 and IPv4-compatible embeddings of private addresses', () => {
    expect(isBlockedHost('64:ff9b::a9fe:a9fe')).toBe(true)
    expect(isBlockedHost('::127.0.0.1')).toBe(true)
  })
  it('allows an IPv6-mapped PUBLIC address', () => {
    expect(isBlockedHost('::ffff:8.8.8.8')).toBe(false)
    expect(isBlockedHost('2606:4700:4700::1111')).toBe(false)
  })
  it('blocks IPv6 multicast and the fd00::/8 GCP metadata address', () => {
    expect(isBlockedHost('ff02::1')).toBe(true)
    expect(isBlockedHost('fd20:ce::254')).toBe(true)
  })
  it('blocks trailing-dot forms of blocked names', () => {
    expect(isBlockedHost('localhost.')).toBe(true)
    expect(isBlockedHost('metadata.google.internal.')).toBe(true)
    expect(isBlockedHost('127.0.0.1.')).toBe(true)
  })
  it('blocks the cloud metadata names and internal suffixes', () => {
    expect(isBlockedHost('metadata.google.internal')).toBe(true)
    expect(isBlockedHost('metadata')).toBe(true)
    expect(isBlockedHost('foo.localhost')).toBe(true)
    expect(isBlockedHost('db.c.project.internal')).toBe(true)
  })
  it('blocks carrier-grade NAT, benchmark, multicast and reserved IPv4', () => {
    expect(isBlockedHost('100.64.0.1')).toBe(true)
    expect(isBlockedHost('198.18.0.1')).toBe(true)
    expect(isBlockedHost('224.0.0.1')).toBe(true)
    expect(isBlockedHost('255.255.255.255')).toBe(true)
    expect(isBlockedHost('100.63.255.255')).toBe(false)
  })
})

describe('isBlockedAddress', () => {
  it('judges resolved addresses by value', () => {
    expect(isBlockedAddress('10.1.2.3')).toBe(true)
    expect(isBlockedAddress('::ffff:169.254.169.254')).toBe(true)
    expect(isBlockedAddress('93.184.216.34')).toBe(false)
  })
})

describe('assertPublicHttpUrlResolved', () => {
  it('refuses a public-looking name that resolves to a private address', async () => {
    setLookupForTests(lookupTable({ 'evil.example.com': ['10.0.0.7'] }))
    await expect(assertPublicHttpUrlResolved('http://evil.example.com/v1')).rejects.toThrow(/not allowed/)
  })
  it('refuses when ANY resolved address is private', async () => {
    setLookupForTests(lookupTable({ 'mixed.example.com': ['93.184.216.34', '::ffff:127.0.0.1'] }))
    await expect(assertPublicHttpUrlResolved('https://mixed.example.com')).rejects.toThrow(/not allowed/)
  })
  it('refuses a name that does not resolve', async () => {
    setLookupForTests(lookupTable({}))
    await expect(assertPublicHttpUrlResolved('https://nowhere.example.com')).rejects.toThrow()
  })
  it('accepts a name that resolves only to public addresses', async () => {
    setLookupForTests(lookupTable({ 'ollama.example.com': ['93.184.216.34'] }))
    await expect(assertPublicHttpUrlResolved('https://ollama.example.com/v1')).resolves.toBe('https://ollama.example.com/v1')
  })
  it('still refuses literal blocked hosts without a lookup', async () => {
    const lookup = jest.fn()
    setLookupForTests(lookup)
    await expect(assertPublicHttpUrlResolved('http://[::ffff:a9fe:a9fe]/latest')).rejects.toThrow(/not allowed/)
    expect(lookup).not.toHaveBeenCalled()
  })
})

describe('safeFetch', () => {
  it('does not follow a redirect to a blocked host', async () => {
    setLookupForTests(lookupTable({ 'ollama.example.com': ['93.184.216.34'] }))
    const fetchImpl = jest.fn(async () => new Response('', { status: 302, headers: { location: 'http://169.254.169.254/computeMetadata/v1/' } }))
    await expect(safeFetch('https://ollama.example.com/v1/chat/completions', { method: 'POST', body: '{}' }, { fetchImpl })).rejects.toThrow(/not allowed/)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0][1].redirect).toBe('manual')
  })
  it('does not follow a redirect to a name that resolves privately', async () => {
    setLookupForTests(lookupTable({ 'a.example.com': ['93.184.216.34'], 'b.example.com': ['192.168.0.10'] }))
    const fetchImpl = jest.fn(async () => new Response('', { status: 307, headers: { location: 'https://b.example.com/x' } }))
    await expect(safeFetch('https://a.example.com/x', {}, { fetchImpl })).rejects.toThrow(/not allowed/)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
  it('follows a redirect between public hosts and returns the final response', async () => {
    setLookupForTests(lookupTable({ 'a.example.com': ['93.184.216.34'], 'b.example.com': ['93.184.216.35'] }))
    const fetchImpl = jest.fn()
      .mockImplementationOnce(async () => new Response('', { status: 301, headers: { location: 'https://b.example.com/y' } }))
      .mockImplementationOnce(async () => new Response('ok', { status: 200 }))
    const res = await safeFetch('https://a.example.com/x', { method: 'GET' }, { fetchImpl })
    expect(await res.text()).toBe('ok')
    expect(fetchImpl.mock.calls[1][0]).toBe('https://b.example.com/y')
  })
  it('gives up after too many redirects', async () => {
    setLookupForTests(lookupTable({ 'a.example.com': ['93.184.216.34'] }))
    const fetchImpl = jest.fn(async () => new Response('', { status: 302, headers: { location: 'https://a.example.com/again' } }))
    await expect(safeFetch('https://a.example.com/x', {}, { fetchImpl })).rejects.toThrow(/redirect/i)
  })
  it('refuses the first hop without fetching when the target is blocked', async () => {
    const fetchImpl = jest.fn()
    await expect(safeFetch('http://localhost:11434/v1', {}, { fetchImpl })).rejects.toThrow(/not allowed/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

/* SSRF guard for user-supplied outbound URLs (remote MCP servers, custom /
 * Ollama provider base URLs). The backend fetches these server-side, so an
 * unrestricted host lets an authenticated user point us at the cloud metadata
 * endpoint (169.254.169.254, metadata.google.internal), loopback, or any
 * internal VPC service and read the reflected response.
 *
 * Three layers:
 *   isBlockedHost        - the literal host: private/loopback/link-local/
 *                          multicast/reserved IPs in every spelling the URL
 *                          parser can produce (IPv6-mapped, NAT64, trailing
 *                          dot), plus metadata and internal names.
 *   assertPublicHttpUrlResolved
 *                        - resolves the name and refuses it if ANY address
 *                          is blocked (a public name pointing at 10.x).
 *   safeFetch            - fetches with redirect:'manual' and re-checks every
 *                          hop, so a public host cannot bounce us to a
 *                          blocked one.
 *
 * Residual, stated plainly: resolution and connection are separate steps, so
 * a DNS server that answers public for the check and private for the connect
 * (rebinding with a ~0 TTL) is not stopped here. Closing that needs the
 * connection itself pinned to the checked address. */
import dns from 'node:dns'
import net from 'node:net'

/** Parse "a.b.c.d" into four octets, or null if not a dotted-quad IPv4. */
function ipv4Octets(host) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!m) return null
  const o = m.slice(1).map(Number)
  if (o.some((n) => n > 255)) return null
  return o
}

function isBlockedIpv4([a, b, c]) {
  if (a === 0) return true                           // 0.0.0.0/8 "this host"
  if (a === 10) return true                          // private 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true  // carrier-grade NAT 100.64.0.0/10
  if (a === 127) return true                         // loopback 127.0.0.0/8
  if (a === 169 && b === 254) return true            // link-local / IMDS 169.254.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true   // private 172.16.0.0/12
  if (a === 192 && b === 0 && c === 0) return true   // IETF protocol assignments 192.0.0.0/24
  if (a === 192 && b === 168) return true            // private 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true // benchmarking 198.18.0.0/15
  if (a >= 224) return true                          // multicast 224/4, reserved 240/4, broadcast
  return false
}

/** Expand an IPv6 literal (optionally with a trailing dotted IPv4) into eight
 * 16-bit groups, or null if it is not a valid IPv6 address. */
function ipv6Groups(host) {
  if (!net.isIPv6(host)) return null
  let h = host
  const zone = h.indexOf('%')
  if (zone !== -1) h = h.slice(0, zone)
  // Trailing dotted IPv4 -> two hex groups.
  const lastColon = h.lastIndexOf(':')
  const tail = h.slice(lastColon + 1)
  if (tail.includes('.')) {
    const o = ipv4Octets(tail)
    if (!o) return null
    h = `${h.slice(0, lastColon + 1)}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`
  }
  const halves = h.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - head.length - rest.length
  if (halves.length === 1 && missing !== 0) return null
  if (missing < 0) return null
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...rest].map((g) => parseInt(g, 16))
  if (groups.length !== 8 || groups.some((g) => Number.isNaN(g) || g < 0 || g > 0xffff)) return null
  return groups
}

function embeddedIpv4(hi, lo) {
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff]
}

function isBlockedIpv6(g) {
  const zeroUpTo = (n) => g.slice(0, n).every((x) => x === 0)
  if (g.every((x) => x === 0)) return true                            // :: unspecified
  if (zeroUpTo(7) && g[7] === 1) return true                          // ::1 loopback
  if (zeroUpTo(5) && g[5] === 0xffff) return isBlockedIpv4(embeddedIpv4(g[6], g[7]))              // ::ffff:a.b.c.d mapped
  if (zeroUpTo(4) && g[4] === 0xffff && g[5] === 0) return isBlockedIpv4(embeddedIpv4(g[6], g[7])) // ::ffff:0:a.b.c.d translated
  if (zeroUpTo(6)) return isBlockedIpv4(embeddedIpv4(g[6], g[7]))     // ::a.b.c.d IPv4-compatible (deprecated)
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    return isBlockedIpv4(embeddedIpv4(g[6], g[7]))                    // 64:ff9b::/96 NAT64
  }
  if (g[0] === 0x2002) return isBlockedIpv4(embeddedIpv4(g[1], g[2])) // 2002::/16 6to4
  if ((g[0] & 0xffc0) === 0xfe80) return true                         // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true                         // fec0::/10 site-local (deprecated)
  if ((g[0] & 0xfe00) === 0xfc00) return true                         // fc00::/7 unique-local (incl. GCP fd20:ce::254)
  if ((g[0] & 0xff00) === 0xff00) return true                         // ff00::/8 multicast
  return false
}

/** True when a resolved IP address (v4 or v6 string) must not be connected to. */
export function isBlockedAddress(address) {
  if (typeof address !== 'string' || !address) return true
  const v4 = ipv4Octets(address)
  if (v4) return isBlockedIpv4(v4)
  const v6 = ipv6Groups(address)
  if (v6) return isBlockedIpv6(v6)
  return true // not an address we can judge: refuse
}

/* Names that are internal by definition, whatever they resolve to. */
const BLOCKED_NAMES = new Set(['localhost', 'metadata', 'metadata.google.internal', 'instance-data', 'instance-data.ec2.internal'])
const BLOCKED_SUFFIXES = ['.localhost', '.internal', '.local', '.localdomain', '.home.arpa']

/** True when `host` (a hostname or IP literal, brackets optional for IPv6) must
 * not be fetched server-side. Judges the literal only; see
 * assertPublicHttpUrlResolved for the resolved addresses. */
export function isBlockedHost(host) {
  if (!host) return true
  let h = String(host).trim().toLowerCase()
  // Strip IPv6 brackets: [::1] -> ::1
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1)
  // A fully-qualified name may end in dots: "localhost." is localhost.
  h = h.replace(/\.+$/, '')
  if (!h) return true

  const octets = ipv4Octets(h)
  if (octets) return isBlockedIpv4(octets)

  if (h.includes(':')) {
    const groups = ipv6Groups(h)
    return groups ? isBlockedIpv6(groups) : true
  }

  if (BLOCKED_NAMES.has(h)) return true
  if (BLOCKED_SUFFIXES.some((s) => h.endsWith(s))) return true

  // A bare hostname with no dot is an internal service name (mongodb, redis,
  // an in-cluster DNS short name) -- never a legitimate public endpoint.
  if (!h.includes('.')) return true

  return false
}

/** Validate a user-supplied URL's shape for server-side fetching (no DNS).
 * Returns the URL string on success; throws an Error whose message is safe to
 * surface to the caller. Use at write time (schema validation); at fetch time
 * use safeFetch / assertPublicHttpUrlResolved. */
export function assertPublicHttpUrl(raw) {
  let u
  try {
    u = new URL(raw)
  } catch {
    throw new Error('Invalid URL')
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`URL scheme "${u.protocol}" is not allowed (use http or https)`)
  }
  if (isBlockedHost(u.hostname)) {
    throw new Error(`Host "${u.hostname}" is not allowed (private, loopback, or internal address)`)
  }
  return raw
}

/* Test seam for DNS. Production uses dns.promises.lookup. */
let lookupOverride = null
export function setLookupForTests(fn) {
  lookupOverride = typeof fn === 'function' ? fn : null
}

async function resolveAll(hostname) {
  if (lookupOverride) return lookupOverride(hostname)
  return dns.promises.lookup(hostname, { all: true, verbatim: true })
}

/** assertPublicHttpUrl, then resolve the host and refuse it if any address is
 * blocked or it does not resolve. Resolves to the URL string. */
export async function assertPublicHttpUrlResolved(raw) {
  assertPublicHttpUrl(raw)
  const u = new URL(raw)
  let host = u.hostname
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)
  if (net.isIP(host)) return raw // literal already judged above
  let addrs
  try {
    addrs = await resolveAll(host.replace(/\.+$/, ''))
  } catch {
    throw new Error(`Host "${u.hostname}" could not be resolved`)
  }
  const list = Array.isArray(addrs) ? addrs : [addrs]
  if (list.length === 0 || list.some((a) => isBlockedAddress(typeof a === 'string' ? a : a?.address))) {
    throw new Error(`Host "${u.hostname}" is not allowed (private, loopback, or internal address)`)
  }
  return raw
}

const MAX_REDIRECTS = 5

/**
 * fetch() for user-supplied URLs: every hop (the first and each redirect) is
 * checked with assertPublicHttpUrlResolved before it is requested, and
 * redirects are followed by hand (redirect: 'manual'). Takes the same
 * (input, init) as fetch so it can be handed to an SDK as its fetch.
 *
 * @param {string|URL|Request} input
 * @param {RequestInit} [init]
 * @param {{ fetchImpl?: typeof fetch, maxRedirects?: number }} [opts]
 */
export async function safeFetch(input, init = {}, { fetchImpl, maxRedirects = MAX_REDIRECTS } = {}) {
  const doFetch = fetchImpl || ((...args) => globalThis.fetch(...args))
  let url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url
  let reqInit = { ...(init || {}) }
  for (let hop = 0; ; hop++) {
    await assertPublicHttpUrlResolved(url)
    const res = await doFetch(url, { ...reqInit, redirect: 'manual' })
    const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null
    if (!location) return res
    if (hop >= maxRedirects) throw new Error('Too many redirects')
    url = new URL(location, url).href
    const method = String(reqInit.method || 'GET').toUpperCase()
    if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === 'POST')) {
      const { body: _body, ...rest } = reqInit
      reqInit = { ...rest, method: 'GET' }
    }
  }
}

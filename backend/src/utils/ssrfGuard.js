/* SSRF guard for user-supplied outbound URLs (remote MCP servers). The backend
 * fetches these server-side, so an unrestricted host lets an authenticated user
 * point us at the cloud metadata endpoint (169.254.169.254), loopback, or any
 * internal VPC service and read the reflected response — a classic SSRF pivot.
 *
 * This is a host-shape allowlist, not a DNS-resolsolving guard: it blocks literal
 * private/loopback/link-local IPs and obviously-internal bare hostnames. A
 * determined attacker can still use a public DNS name that resolves to a private
 * IP (DNS rebinding); defense-in-depth for that belongs at the fetch layer
 * (pin/resolve then connect). For our threat model — stop the trivial
 * metadata/loopback/RFC1918 grab — literal-host blocking is the high-value fix. */

/** Parse "a.b.c.d" into four octets, or null if not a dotted-quad IPv4. */
function ipv4Octets(host) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!m) return null
  const o = m.slice(1).map(Number)
  if (o.some((n) => n > 255)) return null
  return o
}

/** True when `host` (a hostname or IP literal, brackets optional for IPv6) must
 * not be fetched server-side. */
export function isBlockedHost(host) {
  if (!host) return true
  let h = String(host).trim().toLowerCase()
  // Strip IPv6 brackets: [::1] -> ::1
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1)

  if (h === 'localhost') return true

  const octets = ipv4Octets(h)
  if (octets) {
    const [a, b] = octets
    if (a === 127) return true                         // loopback 127.0.0.0/8
    if (a === 10) return true                          // private 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true   // private 172.16.0.0/12
    if (a === 192 && b === 168) return true            // private 192.168.0.0/16
    if (a === 169 && b === 254) return true            // link-local / IMDS 169.254.0.0/16
    if (a === 0) return true                           // 0.0.0.0/8 "this host"
    return false
  }

  // IPv6 literals
  if (h.includes(':')) {
    if (h === '::1' || h === '::') return true          // loopback / unspecified
    if (h.startsWith('fe80')) return true               // link-local
    if (h.startsWith('fc') || h.startsWith('fd')) return true // unique-local fc00::/7
    return false
  }

  // A bare hostname with no dot is an internal service name (mongodb, redis,
  // an in-cluster DNS short name) — never a legitimate public MCP endpoint.
  if (!h.includes('.')) return true

  return false
}

/** Validate a user-supplied URL for server-side fetching. Returns the URL string
 * on success; throws an Error whose message is safe to surface to the caller. */
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

/* Socket.IO authentication.
 *
 * The socket used to accept any connection, and its `execute`, `agent:chat`
 * and `compilation:start` events ran real work for whoever connected --
 * `agent:chat` even took the user id from the payload and fell back to the
 * server's own provider keys. Two rules close that:
 *
 * 1. Handshake (io.use): a Clerk session token in `handshake.auth.token` (or an
 *    `Authorization: Bearer` header) is verified with the same strict verifier
 *    the HTTP routes use. Verified -> socket.data.userId = the token's sub.
 *    Present but invalid -> the connection is refused. Absent -> the socket
 *    connects with NO identity.
 *
 * 2. Per event (socket.use): a socket with no verified identity may only use
 *    the webhook-proxy events, which authenticate themselves with a registry
 *    token, plus ping. Everything else is refused before any handler runs.
 *
 * Why an identity-less connection is allowed at all: the local webhook client
 * (prompd-service/src/webhookClient.js, also bundled into the desktop app)
 * connects without a Clerk token and registers with a registry token. Refusing
 * it at the handshake would break every installed copy.
 *
 * Identity only ever comes from the verified token -- never from an event
 * payload. */
import { verifyClerkToken } from '../services/strictClerk.js'

/** Events a socket may use without a verified Clerk identity. */
export const UNAUTHENTICATED_SOCKET_EVENTS = new Set([
  'webhook-proxy:register',
  'webhook-proxy:ack',
  'ping',
])

/** Pull a bearer token from the handshake: auth payload first, then header. */
export function handshakeToken(handshake) {
  const fromAuth = handshake?.auth?.token
  if (typeof fromAuth === 'string' && fromAuth) {
    return fromAuth.startsWith('Bearer ') ? fromAuth.slice(7) : fromAuth
  }
  const header = handshake?.headers?.authorization
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7)
  }
  return null
}

/** io.use middleware: verify the handshake token when one is offered. */
export function socketAuthMiddleware({ verify = verifyClerkToken } = {}) {
  return async (socket, next) => {
    socket.data = socket.data || {}
    socket.data.userId = null
    const token = handshakeToken(socket.handshake)
    if (!token) return next()
    try {
      const decoded = await verify(token)
      socket.data.userId = decoded.sub
      return next()
    } catch (err) {
      console.warn('[Socket] Handshake token rejected:', err?.name || 'Error')
      const refusal = new Error('unauthorized')
      refusal.data = { code: 'INVALID_TOKEN' }
      return next(refusal)
    }
  }
}

/** socket.use middleware: refuse identity-requiring events on an anonymous socket. */
export function socketEventGate(socket) {
  return (packet, next) => {
    const event = Array.isArray(packet) ? packet[0] : undefined
    if (UNAUTHENTICATED_SOCKET_EVENTS.has(event)) return next()
    if (socket.data?.userId) return next()
    const refusal = new Error('unauthorized')
    refusal.data = { code: 'AUTH_REQUIRED', event: typeof event === 'string' ? event : null }
    return next(refusal)
  }
}

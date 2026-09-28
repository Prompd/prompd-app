/* Keep provider credentials out of anything we relay to a client.
 *
 * This service forwards a user's own key to an upstream provider, and a
 * provider answers a bad key by quoting it back: OpenAI's 401 body reads
 * "Incorrect API key provided: sk-svcac***...pwMA". Both error paths in
 * chatCompletions relay that body verbatim (`res.send(text)`), so the key
 * travelled to the browser, was thrown as an Error there, and was written to
 * the client's agent log. The provider's own masking is not enough: prefix,
 * suffix and exact length all survive, which is enough to identify the key.
 *
 * The relay itself is worth keeping — an upstream error is exactly what a
 * caller needs to see. Only the credential has to go.
 *
 * PREFIX-DRIVEN, DELIBERATELY. The tempting rule — "redact any long opaque
 * token" — would eat request ids, which are ~30 opaque characters and are the
 * one thing worth having when filing a ticket with a provider. Matching known
 * key shapes keeps the relayed error diagnostic.
 *
 * The cost, stated plainly: a provider whose key format is not listed here will
 * not be redacted. Add its prefix when a provider is added.
 *
 * DUPLICATED ON PURPOSE. prompd-web carries the same function at
 * packages/harness/redact.ts, and redacts again on receipt — this service and
 * that client ship separately with no shared package, and a single function is
 * not worth one. Defence in depth is the point: this stops the key crossing the
 * network, the client's copy protects it from every OTHER backend it can be
 * pointed at. Change one, change the other.
 */

const MASK = '[redacted]'

/* `*` is in the body class so a provider's OWN masked form (sk-svcac***...pwMA)
 * is taken as one token rather than left in pieces. The {8,} floor keeps a bare
 * prefix mentioned in prose readable. */
const KEY_PATTERNS = [
  /\bsk-[A-Za-z0-9_*-]{8,}/g,   // OpenAI + Anthropic: sk-, sk-proj-, sk-svcacct-, sk-ant-
  /\bsk_[A-Za-z0-9_*-]{8,}/g,   // Clerk: sk_live_, sk_test_ (underscore, not the dash above)
  /\bgsk_[A-Za-z0-9_*-]{8,}/g,  // Groq
  /\bAIza[A-Za-z0-9_*-]{8,}/g,  // Google
  /\bxai-[A-Za-z0-9_*-]{8,}/g,  // xAI
]

/* Any credential presented as a bearer token — the surrounding word says it is
 * a secret, so no prefix guess is needed. Dots included so a JWT goes whole. */
const BEARER = /\bBearer\s+[A-Za-z0-9._*-]+/gi

/**
 * Replace credential-shaped tokens in `text` with `[redacted]`.
 *
 * Accepts anything; a non-string is returned untouched so a caller can pipe a
 * possibly-empty body through without a guard. An ordinary error passes through
 * byte-for-byte.
 *
 * @param {unknown} text
 * @returns {unknown} the redacted string, or the input unchanged if not a string
 */
export function redactSecrets(text) {
  if (typeof text !== 'string' || text === '') return text
  let out = text
  for (const re of KEY_PATTERNS) out = out.replace(re, MASK)
  return out.replace(BEARER, `Bearer ${MASK}`)
}

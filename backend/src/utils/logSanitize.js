/* What request data may reach the logs (Cloud Logging is readable by anyone
 * with project log access).
 *
 * Three rules, applied recursively:
 *   1. A field whose NAME looks like a credential is replaced with [REDACTED].
 *   2. A field that carries prompt/message content is not logged at all, only
 *      its size: prompts can hold PHI, and no pattern can recognise that.
 *   3. Every remaining string is run through redactSecrets, so a key sent
 *      under a name rule 1 does not know (or pasted into free text) is still
 *      removed by its VALUE shape; strings are also truncated.
 *
 * redactUrl does the same for credential query parameters in a logged URL
 * (the auth middleware still accepts ?token= for legacy clients). */
import { redactSecrets } from './redactSecrets.js'

const SENSITIVE_NAME_PARTS = [
  'password', 'passwd', 'token', 'apikey', 'api_key', 'api-key', 'secret',
  'authorization', 'cookie', 'session', 'credential', 'privatekey', 'private_key',
  'encryptedkey', 'creditcard', 'ssn',
]
const SENSITIVE_EXACT = new Set(['key', 'iv', 'auth', 'email'])

const CONTENT_NAMES = new Set([
  'content', 'prompt', 'prompts', 'messages', 'message', 'compiledprompt', 'response',
  'text', 'system', 'input', 'inputs', 'parameters', 'params', 'files', 'file',
  'body', 'rawbody', 'history', 'context', 'contents', 'completion', 'output',
])

const MAX_STRING = 200
const MAX_DEPTH = 6
const MAX_KEYS = 50

function isSensitiveName(name) {
  const n = String(name).toLowerCase()
  if (SENSITIVE_EXACT.has(n)) return true
  return SENSITIVE_NAME_PARTS.some((p) => n.includes(p))
}

function sizeOf(value) {
  try {
    if (typeof value === 'string') return value.length
    return JSON.stringify(value)?.length ?? 0
  } catch {
    return 0
  }
}

function cleanString(s) {
  const r = redactSecrets(s)
  return r.length > MAX_STRING ? `${r.slice(0, MAX_STRING)}...[${r.length - MAX_STRING} more chars]` : r
}

function walk(value, depth) {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return cleanString(value)
  if (typeof value !== 'object') return value
  if (depth >= MAX_DEPTH) return '[depth limit]'
  if (Array.isArray(value)) {
    return value.slice(0, MAX_KEYS).map((v) => walk(v, depth + 1))
  }
  const out = {}
  let n = 0
  for (const [k, v] of Object.entries(value)) {
    if (n++ >= MAX_KEYS) { out['[truncated]'] = true; break }
    if (isSensitiveName(k)) out[k] = '[REDACTED]'
    else if (CONTENT_NAMES.has(k.toLowerCase())) out[k] = `[omitted: ${sizeOf(v)} chars]`
    else out[k] = walk(v, depth + 1)
  }
  return out
}

/** Sanitize request data (body, query, params, details) for logging. */
export function sanitizeLogData(data) {
  if (!data || typeof data !== 'object') {
    return typeof data === 'string' ? cleanString(data) : data
  }
  return walk(data, 0)
}

const CREDENTIAL_QUERY = /([?&](?:token|access_token|id_token|api[_-]?key|key|secret|password|auth|signature)=)[^&#]*/gi

/** Redact credential query parameters (and key-shaped values) in a URL. */
export function redactUrl(url) {
  if (typeof url !== 'string') return url
  return redactSecrets(url.replace(CREDENTIAL_QUERY, '$1[REDACTED]'))
}

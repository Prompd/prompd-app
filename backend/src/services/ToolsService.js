/* External agent tools proxied through the backend so secrets stay server-side.
 * Key model: use the user's own key, else fall back to a Prompd-paid env key. */
import { decryptApiKey } from './EncryptionService.js'

/**
 * Resolve a tool's API key: the user's stored (encrypted) key first, else the
 * Prompd-paid env key. Returns { key, source } or null when neither exists.
 */
export function getToolKey(user, tool, envVar) {
  const data = user?.getToolKeyData?.(tool)
  if (data?.encryptedKey && data?.iv) {
    try {
      return { key: decryptApiKey(data.encryptedKey, data.iv), source: 'user' }
    } catch {
      /* corrupt/rotated key — fall through to the paid key */
    }
  }
  const envKey = process.env[envVar]
  if (envKey) return { key: envKey, source: 'prompd' }
  return null
}

/** Tavily web search over raw HTTP (no SDK). Returns a normalized result set. */
export async function tavilySearch(query, key, opts = {}) {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      query,
      max_results: Math.min(opts.maxResults ?? 5, 10),
      search_depth: opts.depth === 'advanced' ? 'advanced' : 'basic',
      include_answer: true,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Tavily HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`)
  }
  const data = await res.json()
  return {
    answer: data.answer || '',
    results: (data.results || []).map((r) => ({ title: r.title, url: r.url, content: r.content })),
  }
}

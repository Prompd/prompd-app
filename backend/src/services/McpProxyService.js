/* Minimal MCP client over the Streamable-HTTP transport (JSON-RPC). Proxies
 * tools/list + tools/call to a user's remote MCP server, decrypting its optional
 * bearer key. Stateless: each call does the initialize handshake, which is fine
 * for a proxy. Handles both JSON and SSE (event:/data:) responses. */
import { decryptApiKey } from './EncryptionService.js'

function authHeader(server) {
  if (server?.encryptedKey && server?.iv) {
    try { return `Bearer ${decryptApiKey(server.encryptedKey, server.iv)}` } catch { return null }
  }
  return null
}

/** Parse a JSON or SSE (last `data:` line) MCP response body. */
function parseBody(text) {
  const t = (text || '').trim()
  if (!t) return null
  if (t.startsWith('{') || t.startsWith('[')) {
    try { return JSON.parse(t) } catch { return null }
  }
  const dataLines = t.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim())
  for (let i = dataLines.length - 1; i >= 0; i--) {
    try { return JSON.parse(dataLines[i]) } catch { /* keep looking */ }
  }
  return null
}

async function rpc(url, body, headers) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify(body),
  })
  const sessionId = res.headers.get('mcp-session-id') || undefined
  const text = await res.text()
  if (!res.ok) throw new Error(`MCP HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`)
  const json = parseBody(text)
  if (json?.error) throw new Error(`MCP error ${json.error.code ?? ''}: ${json.error.message || 'unknown'}`)
  return { result: json?.result, sessionId }
}

/** initialize + initialized; returns the headers (incl. any session id) for follow-ups. */
async function handshake(server) {
  const auth = authHeader(server)
  const base = auth ? { Authorization: auth } : {}
  const init = await rpc(server.url, {
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'prompd-web', version: '1.0.0' } },
  }, base)
  const headers = { ...base }
  if (init.sessionId) headers['Mcp-Session-Id'] = init.sessionId
  // Best-effort initialized notification (some servers require it before tools/*).
  try {
    await fetch(server.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    })
  } catch { /* ignore */ }
  return headers
}

export async function listTools(server) {
  const headers = await handshake(server)
  const { result } = await rpc(server.url, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, headers)
  return (result?.tools || []).map((t) => ({
    name: t.name,
    description: t.description || '',
    inputSchema: t.inputSchema || { type: 'object', properties: {} },
    // Behaviour hints (MCP tool annotations) so the client can decide whether a
    // call needs a permission prompt. readOnlyHint=true => safe to run freely.
    annotations: t.annotations || {},
  }))
}

export async function callTool(server, name, args) {
  const headers = await handshake(server)
  const { result } = await rpc(server.url, {
    jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name, arguments: args || {} },
  }, headers)
  const content = result?.content || []
  const text = content
    .map((c) => (c.type === 'text' ? c.text : c.type === 'json' ? JSON.stringify(c.json) : `[${c.type} content]`))
    .join('\n')
  return { text: text || JSON.stringify(result ?? {}), isError: !!result?.isError }
}

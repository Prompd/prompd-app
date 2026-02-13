/**
 * Connection Storage Service
 *
 * Persists workflow connections with two tiers:
 *   - Global (user-level):    ~/.prompd/connections.json
 *   - Workspace-level:        .prompd/connections.json (in workspace root)
 *
 * On load, both tiers are merged (workspace overrides global by connection name).
 * Each connection carries a `scope` field ('global' | 'workspace') so the UI
 * can show where it came from and the save logic writes to the correct file.
 *
 * Sensitive fields (connection strings, API keys) are encrypted at rest via
 * Electron safeStorage (OS credential store: DPAPI on Windows, Keychain on macOS,
 * libsecret on Linux).
 */

const path = require('path')
const fs = require('fs')
const os = require('os')
const { safeStorage } = require('electron')

// ---------------------------------------------------------------------------
// Sensitive field registry — fields that must be encrypted before writing
// ---------------------------------------------------------------------------

const SENSITIVE_FIELDS = {
  'database': ['connectionString'],
  'http-api': ['headers'],
  'web-search': ['apiKey'],
  'websocket': ['headers'],
  'ssh': [],
  'slack': [],
  'github': [],
  'mcp-server': [],
  'custom': [],
}

const ENCRYPTED_PREFIX = 'enc:v1:'

// ---------------------------------------------------------------------------
// Encryption helpers
// ---------------------------------------------------------------------------

function canEncrypt() {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

/**
 * Encrypt a string value using safeStorage.
 * Returns the enc:v1:<base64> prefixed string, or the original value if
 * encryption is unavailable.
 */
function encryptValue(value) {
  if (!value || typeof value !== 'string' || value.startsWith(ENCRYPTED_PREFIX)) {
    return value
  }
  if (!canEncrypt()) {
    console.warn('[ConnectionStorage] safeStorage not available - saving plaintext')
    return value
  }
  const encrypted = safeStorage.encryptString(value)
  return ENCRYPTED_PREFIX + encrypted.toString('base64')
}

/**
 * Decrypt an enc:v1:<base64> value using safeStorage.
 * Returns the plaintext string, or the original value if not encrypted
 * or decryption fails.
 */
function decryptValue(value) {
  if (!value || typeof value !== 'string' || !value.startsWith(ENCRYPTED_PREFIX)) {
    return value
  }
  if (!canEncrypt()) {
    console.warn('[ConnectionStorage] safeStorage not available - cannot decrypt')
    return value
  }
  try {
    const base64 = value.slice(ENCRYPTED_PREFIX.length)
    const buffer = Buffer.from(base64, 'base64')
    return safeStorage.decryptString(buffer)
  } catch (err) {
    console.error('[ConnectionStorage] Decryption failed:', err.message)
    return value
  }
}

// ---------------------------------------------------------------------------
// Config field encryption/decryption
// ---------------------------------------------------------------------------

/**
 * Encrypt sensitive fields in a connection config before saving to disk.
 */
function encryptConfig(connectionType, config) {
  const fields = SENSITIVE_FIELDS[connectionType] || []
  if (fields.length === 0 || !config) return config

  const result = { ...config }
  for (const field of fields) {
    if (result[field] === undefined || result[field] === null || result[field] === '') {
      continue
    }
    // For object fields (like headers), JSON.stringify before encrypting
    const raw = typeof result[field] === 'object'
      ? JSON.stringify(result[field])
      : String(result[field])
    result[field] = encryptValue(raw)
  }
  return result
}

/**
 * Decrypt sensitive fields in a connection config after loading from disk.
 */
function decryptConfig(connectionType, config) {
  const fields = SENSITIVE_FIELDS[connectionType] || []
  if (fields.length === 0 || !config) return config

  const result = { ...config }
  for (const field of fields) {
    if (result[field] === undefined || result[field] === null || result[field] === '') {
      continue
    }
    const decrypted = decryptValue(String(result[field]))
    // For object fields (headers), parse back from JSON
    if (field === 'headers' && decrypted && !decrypted.startsWith(ENCRYPTED_PREFIX)) {
      try {
        result[field] = JSON.parse(decrypted)
      } catch {
        result[field] = decrypted
      }
    } else {
      result[field] = decrypted
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// File I/O paths
// ---------------------------------------------------------------------------

function getGlobalConnectionsPath() {
  return path.join(os.homedir(), '.prompd', 'connections.json')
}

function getWorkspaceConnectionsPath(workspacePath) {
  return path.join(workspacePath, '.prompd', 'connections.json')
}

/**
 * Generate a stable connection ID derived from the connection name.
 * This ensures nodes referencing a connectionId survive app reloads —
 * the same connection name always produces the same ID.
 * Uses a simple hash that matches the renderer-side implementation in workflowStore.ts.
 */
function generateId(name) {
  const str = name || ''
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return `conn-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

// ---------------------------------------------------------------------------
// Internal: read a single connections file
// ---------------------------------------------------------------------------

/**
 * Read and decrypt a connections.json file. Returns the raw connection array
 * (without runtime IDs) or an empty array if the file doesn't exist.
 */
async function readConnectionsFile(filePath) {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8')
    const parsed = JSON.parse(content)
    if (parsed && Array.isArray(parsed.connections)) {
      return parsed.connections
    }
    return []
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`[ConnectionStorage] Error reading ${filePath}:`, err.message)
    }
    return []
  }
}

/**
 * Write an array of connection records to a connections.json file.
 */
async function writeConnectionsFile(filePath, connections) {
  const dirPath = path.dirname(filePath)
  const persistable = connections.map(conn => ({
    name: conn.name,
    type: conn.type,
    config: encryptConfig(conn.type, conn.config || {}),
  }))

  const fileData = {
    version: 1,
    connections: persistable,
  }

  await fs.promises.mkdir(dirPath, { recursive: true })
  await fs.promises.writeFile(filePath, JSON.stringify(fileData, null, 2), 'utf-8')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load connections from both global (~/.prompd) and workspace (.prompd) files.
 * Merges them: workspace connections override global ones with the same name.
 * Each connection gets a runtime `scope` field ('global' | 'workspace').
 */
async function loadConnections(workspacePath) {
  const globalPath = getGlobalConnectionsPath()
  const globalRaw = await readConnectionsFile(globalPath)

  let workspaceRaw = []
  let workspaceFilePath = null
  if (workspacePath) {
    workspaceFilePath = getWorkspaceConnectionsPath(workspacePath)
    workspaceRaw = await readConnectionsFile(workspaceFilePath)
  }

  // Build merged list: global first, then workspace overrides by name
  const byName = new Map()

  for (const conn of globalRaw) {
    byName.set(conn.name, {
      id: generateId(conn.name),
      name: conn.name || '',
      type: conn.type || 'custom',
      status: 'disconnected',
      scope: 'global',
      config: decryptConfig(conn.type, conn.config || {}),
    })
  }

  for (const conn of workspaceRaw) {
    byName.set(conn.name, {
      id: generateId(conn.name),
      name: conn.name || '',
      type: conn.type || 'custom',
      status: 'disconnected',
      scope: 'workspace',
      config: decryptConfig(conn.type, conn.config || {}),
    })
  }

  const connections = Array.from(byName.values())

  return {
    success: true,
    connections,
    sources: {
      globalPath,
      workspacePath: workspaceFilePath,
    },
  }
}

/**
 * Save connections to the appropriate file(s) based on each connection's scope.
 * Global-scoped connections go to ~/.prompd/connections.json,
 * workspace-scoped connections go to .prompd/connections.json in the workspace.
 */
async function saveConnections(connections, workspacePath) {
  if (!Array.isArray(connections)) {
    return { success: false, error: 'Connections must be an array' }
  }

  const globalConns = []
  const workspaceConns = []

  for (const conn of connections) {
    if (conn.scope === 'global') {
      globalConns.push(conn)
    } else {
      workspaceConns.push(conn)
    }
  }

  const results = { global: null, workspace: null }

  // Save global connections
  try {
    const globalPath = getGlobalConnectionsPath()
    await writeConnectionsFile(globalPath, globalConns)
    results.global = { success: true, path: globalPath }
  } catch (err) {
    console.error('[ConnectionStorage] Error writing global connections:', err.message)
    results.global = { success: false, error: err.message }
  }

  // Save workspace connections
  if (workspacePath) {
    try {
      const wsPath = getWorkspaceConnectionsPath(workspacePath)
      await writeConnectionsFile(wsPath, workspaceConns)
      results.workspace = { success: true, path: wsPath }
    } catch (err) {
      console.error('[ConnectionStorage] Error writing workspace connections:', err.message)
      results.workspace = { success: false, error: err.message }
    }
  } else if (workspaceConns.length > 0) {
    console.warn('[ConnectionStorage] Workspace-scoped connections exist but no workspace path provided')
  }

  const anyFailed = (results.global && !results.global.success) ||
    (results.workspace && !results.workspace.success)

  return {
    success: !anyFailed,
    results,
  }
}

module.exports = {
  loadConnections,
  saveConnections,
  SENSITIVE_FIELDS,
}

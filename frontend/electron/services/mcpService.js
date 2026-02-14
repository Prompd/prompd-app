/**
 * MCP Service
 *
 * Manages MCP (Model Context Protocol) server connections for the Electron main process.
 *
 * Responsibilities:
 *   - Config management: ~/.prompd/mcp-config.json (encrypted env values via safeStorage)
 *   - Connection pool: stdio + HTTP transports via @modelcontextprotocol/sdk
 *   - Tool discovery: cached tool lists per connected server
 *   - Registry search: query registry.modelcontextprotocol.io for available MCP servers
 *   - Idle cleanup: disconnect servers unused for 15 min (paused during workflow execution)
 *   - Startup reconciliation: sync mcp-config.json with connections.json to prevent drift
 *
 * Config format (matches Claude Desktop / VS Code standard):
 * {
 *   "mcpServers": {
 *     "server-name": {
 *       "command": "npx",
 *       "args": ["-y", "@package/mcp-server"],
 *       "env": { "API_KEY": "enc:v1:..." },
 *       "transport": "stdio",
 *       "serverUrl": "http://...",
 *       "registryRef": "official-name"
 *     }
 *   }
 * }
 */

const path = require('path')
const fs = require('fs')
const os = require('os')
const { safeStorage, net } = require('electron')

// MCP SDK — CommonJS require paths (wildcard export requires .js extension)
const { Client } = require('@modelcontextprotocol/sdk/client')
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js')

// Lazy-load HTTP transport (only needed for non-stdio servers)
let _StreamableHTTPClientTransport = null
function getStreamableHTTPTransport() {
  if (!_StreamableHTTPClientTransport) {
    const mod = require('@modelcontextprotocol/sdk/client/streamableHttp.js')
    _StreamableHTTPClientTransport = mod.StreamableHTTPClientTransport
  }
  return _StreamableHTTPClientTransport
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENCRYPTED_PREFIX = 'enc:v1:'
const IDLE_TIMEOUT_MS = 15 * 60 * 1000
const IDLE_CHECK_INTERVAL_MS = 60 * 1000
const MCP_REGISTRY_BASE_URL = 'https://registry.modelcontextprotocol.io/v0.1'

// ---------------------------------------------------------------------------
// Config path
// ---------------------------------------------------------------------------

function getMcpConfigPath() {
  return path.join(os.homedir(), '.prompd', 'mcp-config.json')
}

// ---------------------------------------------------------------------------
// Encryption helpers (mirrors connectionStorage.js pattern)
// ---------------------------------------------------------------------------

function canEncrypt() {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function encryptValue(value) {
  if (!value || typeof value !== 'string' || value.startsWith(ENCRYPTED_PREFIX)) {
    return value
  }
  if (!canEncrypt()) return value
  try {
    const encrypted = safeStorage.encryptString(value)
    return ENCRYPTED_PREFIX + encrypted.toString('base64')
  } catch (err) {
    console.error('[MCP] Encryption failed:', err.message)
    return value
  }
}

function decryptValue(value) {
  if (!value || typeof value !== 'string' || !value.startsWith(ENCRYPTED_PREFIX)) {
    return value
  }
  if (!canEncrypt()) return value
  try {
    const buffer = Buffer.from(value.slice(ENCRYPTED_PREFIX.length), 'base64')
    return safeStorage.decryptString(buffer)
  } catch (err) {
    console.error('[MCP] Decryption failed:', err.message)
    return value
  }
}

/**
 * Encrypt sensitive values in a record (env vars, headers).
 * @param {Record<string, string>} record
 * @returns {Record<string, string>}
 */
function encryptRecord(record) {
  if (!record || typeof record !== 'object') return record
  const encrypted = {}
  for (const [key, val] of Object.entries(record)) {
    encrypted[key] = typeof val === 'string' ? encryptValue(val) : val
  }
  return encrypted
}

/**
 * Decrypt sensitive values in a record (env vars, headers).
 * @param {Record<string, string>} record
 * @returns {Record<string, string>}
 */
function decryptRecord(record) {
  if (!record || typeof record !== 'object') return record
  const decrypted = {}
  for (const [key, val] of Object.entries(record)) {
    decrypted[key] = typeof val === 'string' ? decryptValue(val) : val
  }
  return decrypted
}

/**
 * Encrypt env values and headers in a server config object (for writing to disk).
 */
function encryptEnvValues(serverConfig) {
  const result = { ...serverConfig }
  if (serverConfig.env && typeof serverConfig.env === 'object') {
    result.env = encryptRecord(serverConfig.env)
  }
  if (serverConfig.headers && typeof serverConfig.headers === 'object') {
    result.headers = encryptRecord(serverConfig.headers)
  }
  return result
}

/**
 * Decrypt env values and headers in a server config object (after reading from disk).
 */
function decryptEnvValues(serverConfig) {
  const result = { ...serverConfig }
  if (serverConfig.env && typeof serverConfig.env === 'object') {
    result.env = decryptRecord(serverConfig.env)
  }
  if (serverConfig.headers && typeof serverConfig.headers === 'object') {
    result.headers = decryptRecord(serverConfig.headers)
  }
  return result
}

// ---------------------------------------------------------------------------
// Config management (~/.prompd/mcp-config.json)
// ---------------------------------------------------------------------------

function ensureConfigDir() {
  const dir = path.dirname(getMcpConfigPath())
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

/**
 * Load MCP config from disk. Decrypts env values.
 * @returns {{ mcpServers: Record<string, object> }}
 */
function loadMcpConfig() {
  const configPath = getMcpConfigPath()
  try {
    if (!fs.existsSync(configPath)) {
      return { mcpServers: {} }
    }
    const raw = fs.readFileSync(configPath, 'utf-8')
    const config = JSON.parse(raw)
    const decrypted = { mcpServers: {} }
    for (const [name, serverConfig] of Object.entries(config.mcpServers || {})) {
      decrypted.mcpServers[name] = decryptEnvValues(serverConfig)
    }
    return decrypted
  } catch (err) {
    console.error('[MCP] Failed to load config:', err.message)
    return { mcpServers: {} }
  }
}

/**
 * Save MCP config to disk. Encrypts env values.
 * @param {{ mcpServers: Record<string, object> }} config
 */
function saveMcpConfig(config) {
  ensureConfigDir()
  const configPath = getMcpConfigPath()
  const encrypted = { mcpServers: {} }
  for (const [name, serverConfig] of Object.entries(config.mcpServers || {})) {
    encrypted.mcpServers[name] = encryptEnvValues(serverConfig)
  }
  fs.writeFileSync(configPath, JSON.stringify(encrypted, null, 2), 'utf-8')
}

/**
 * Add a server to the config.
 * @param {string} name - Server name (key in mcpServers)
 * @param {object} serverConfig - { command?, args?, env?, serverUrl?, transport?, registryRef? }
 */
function addServer(name, serverConfig) {
  if (!name || typeof name !== 'string') {
    throw new Error('Server name is required')
  }
  const config = loadMcpConfig()
  config.mcpServers[name] = {
    ...serverConfig,
    transport: serverConfig.transport ||
      (serverConfig.command ? 'stdio' : serverConfig.serverUrl ? 'streamable-http' : 'stdio'),
  }
  saveMcpConfig(config)
  console.log(`[MCP] Server "${name}" added to config`)
}

/**
 * Remove a server from the config and disconnect if active.
 * @param {string} name
 */
async function removeServer(name) {
  if (activeConnections.has(name)) {
    await safeDisconnect(name)
  }
  const config = loadMcpConfig()
  delete config.mcpServers[name]
  saveMcpConfig(config)
  console.log(`[MCP] Server "${name}" removed from config`)
}

/**
 * List all configured servers with their connection status.
 * @returns {Array<{ name: string, config: object, status: string, toolCount: number }>}
 */
function listServers() {
  const config = loadMcpConfig()
  const servers = []
  for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
    const conn = activeConnections.get(name)
    servers.push({
      name,
      config: serverConfig,
      status: conn ? conn.status : 'disconnected',
      toolCount: conn ? conn.tools.length : 0,
    })
  }
  return servers
}

// ---------------------------------------------------------------------------
// Connection pool
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ActiveConnection
 * @property {object} client - MCP Client instance
 * @property {object} transport - Transport instance
 * @property {Array<{ name: string, description: string, inputSchema: object }>} tools
 * @property {number} lastUsed - Timestamp of last usage
 * @property {'connected'|'connecting'|'error'} status
 * @property {string} [errorMessage]
 */

/** @type {Map<string, ActiveConnection>} */
const activeConnections = new Map()

let idleCheckTimer = null
let executionActive = false

/**
 * Set whether a workflow execution is currently active.
 * While active, idle cleanup is paused to avoid dropping connections mid-run.
 * @param {boolean} active
 */
function setExecutionActive(active) {
  executionActive = !!active
}

/**
 * Start the idle cleanup timer.
 */
function startIdleCleanup() {
  if (idleCheckTimer) return
  idleCheckTimer = setInterval(async () => {
    if (executionActive) return
    const now = Date.now()
    for (const [name, conn] of activeConnections.entries()) {
      if (conn.status === 'connected' && (now - conn.lastUsed) > IDLE_TIMEOUT_MS) {
        console.log(`[MCP] Idle timeout for "${name}", disconnecting`)
        await safeDisconnect(name)
      }
    }
  }, IDLE_CHECK_INTERVAL_MS)
}

/**
 * Stop the idle cleanup timer.
 */
function stopIdleCleanup() {
  if (idleCheckTimer) {
    clearInterval(idleCheckTimer)
    idleCheckTimer = null
  }
}

/**
 * Create the appropriate transport for a server config.
 * @param {object} serverConfig
 * @returns {object} transport instance
 */
function createTransport(serverConfig) {
  const transport = serverConfig.transport || (serverConfig.command ? 'stdio' : 'streamable-http')

  if (transport === 'stdio') {
    if (!serverConfig.command) {
      throw new Error('stdio transport requires a "command" field')
    }
    return new StdioClientTransport({
      command: serverConfig.command,
      args: serverConfig.args || [],
      env: {
        ...process.env,
        ...(serverConfig.env || {}),
      },
    })
  }

  if (transport === 'http' || transport === 'streamable-http') {
    if (!serverConfig.serverUrl) {
      throw new Error('HTTP transport requires a "serverUrl" field')
    }
    const HttpTransport = getStreamableHTTPTransport()
    const url = new URL(serverConfig.serverUrl)

    // Pass custom headers if configured (e.g., Authorization for Smithery)
    if (serverConfig.headers && typeof serverConfig.headers === 'object') {
      const headerEntries = Object.entries(serverConfig.headers).filter(([, v]) => v)
      if (headerEntries.length > 0) {
        const headerRecord = Object.fromEntries(headerEntries)
        return new HttpTransport(url, {
          requestInit: { headers: headerRecord },
        })
      }
    }
    return new HttpTransport(url)
  }

  throw new Error(`Unsupported transport: ${transport}`)
}

/**
 * Safely disconnect a server, ignoring errors during cleanup.
 * @param {string} serverName
 */
async function safeDisconnect(serverName) {
  const conn = activeConnections.get(serverName)
  if (!conn) return

  try {
    if (conn.client && typeof conn.client.close === 'function') {
      await conn.client.close()
    }
  } catch (err) {
    console.warn(`[MCP] Error closing client for "${serverName}":`, err.message)
  }

  try {
    if (conn.transport && typeof conn.transport.close === 'function') {
      await conn.transport.close()
    }
  } catch (err) {
    console.warn(`[MCP] Error closing transport for "${serverName}":`, err.message)
  }

  activeConnections.delete(serverName)

  if (activeConnections.size === 0) {
    stopIdleCleanup()
  }
}

/**
 * Connect to an MCP server by name. If already connected, refresh lastUsed and return.
 * @param {string} serverName
 * @returns {Promise<{ tools: Array }>}
 */
async function connect(serverName) {
  // Return existing connection if healthy
  const existing = activeConnections.get(serverName)
  if (existing && existing.status === 'connected') {
    existing.lastUsed = Date.now()
    return { tools: existing.tools }
  }

  // Clean up any failed previous connection
  if (existing) {
    await safeDisconnect(serverName)
  }

  const config = loadMcpConfig()
  const serverConfig = config.mcpServers[serverName]
  if (!serverConfig) {
    throw new Error(`Server "${serverName}" not found in MCP config`)
  }

  console.log(`[MCP] Connecting to "${serverName}"...`)

  // Mark as connecting
  activeConnections.set(serverName, {
    client: null,
    transport: null,
    tools: [],
    lastUsed: Date.now(),
    status: 'connecting',
  })

  try {
    const transport = createTransport(serverConfig)
    const client = new Client(
      { name: 'prompd', version: '0.1.0' },
      { capabilities: {} }
    )

    await client.connect(transport)

    // Discover tools
    let tools = []
    try {
      const result = await client.listTools()
      tools = (result.tools || []).map(t => ({
        name: t.name,
        description: t.description || '',
        inputSchema: t.inputSchema || {},
      }))
      console.log(`[MCP] Connected to "${serverName}" - ${tools.length} tools available`)
    } catch (err) {
      console.warn(`[MCP] Connected to "${serverName}" but tool listing failed:`, err.message)
    }

    activeConnections.set(serverName, {
      client,
      transport,
      tools,
      lastUsed: Date.now(),
      status: 'connected',
    })

    startIdleCleanup()
    return { tools }
  } catch (err) {
    activeConnections.set(serverName, {
      client: null,
      transport: null,
      tools: [],
      lastUsed: Date.now(),
      status: 'error',
      errorMessage: err.message,
    })
    throw new Error(`Failed to connect to "${serverName}": ${err.message}`)
  }
}

/**
 * Disconnect from an MCP server.
 * @param {string} serverName
 */
async function disconnect(serverName) {
  await safeDisconnect(serverName)
  console.log(`[MCP] Disconnected from "${serverName}"`)
}

/**
 * Disconnect all active MCP connections. Called on app quit.
 */
async function disconnectAll() {
  stopIdleCleanup()
  const names = [...activeConnections.keys()]
  for (const name of names) {
    await safeDisconnect(name)
  }
  console.log('[MCP] All connections closed')
}

/**
 * Get the list of tools for a server (connects if needed).
 * @param {string} serverName
 * @returns {Promise<Array<{ name: string, description: string, inputSchema: object }>>}
 */
async function listTools(serverName) {
  const conn = activeConnections.get(serverName)
  if (conn && conn.status === 'connected') {
    conn.lastUsed = Date.now()
    return conn.tools
  }
  const result = await connect(serverName)
  return result.tools
}

/**
 * Call a tool on an MCP server.
 * @param {string} serverName
 * @param {string} toolName
 * @param {object} args - Tool arguments
 * @returns {Promise<object>} Tool result
 */
async function callTool(serverName, toolName, args) {
  // Ensure connected
  if (!activeConnections.has(serverName) || activeConnections.get(serverName).status !== 'connected') {
    await connect(serverName)
  }

  const conn = activeConnections.get(serverName)
  if (!conn || conn.status !== 'connected') {
    throw new Error(`Failed to connect to "${serverName}"`)
  }

  conn.lastUsed = Date.now()

  console.log(`[MCP] Calling tool "${toolName}" on "${serverName}"`)
  const result = await conn.client.callTool({
    name: toolName,
    arguments: args || {},
  })

  return result
}

/**
 * Get connection status for a server.
 * @param {string} serverName
 * @returns {'connected'|'disconnected'|'connecting'|'error'}
 */
function getConnectionStatus(serverName) {
  const conn = activeConnections.get(serverName)
  return conn ? conn.status : 'disconnected'
}

// ---------------------------------------------------------------------------
// Registry search (registry.modelcontextprotocol.io)
// ---------------------------------------------------------------------------

/**
 * Search the official MCP registry for servers.
 * Uses Electron net.request to bypass CORS.
 * @param {string} query - Search query
 * @param {number} [limit=20] - Max results
 * @returns {Promise<{ success: boolean, servers?: Array, error?: string }>}
 */
function searchRegistry(query, limit = 20) {
  return new Promise((resolve) => {
    if (!query || typeof query !== 'string') {
      resolve({ success: false, error: 'Search query is required' })
      return
    }

    const url = `${MCP_REGISTRY_BASE_URL}/servers?search=${encodeURIComponent(query)}&limit=${limit}`

    try {
      const request = net.request({ method: 'GET', url })

      const timeout = setTimeout(() => {
        request.abort()
        resolve({ success: false, error: 'Registry search timed out' })
      }, 10000)

      let responseData = ''

      request.on('response', (response) => {
        response.on('data', (chunk) => {
          responseData += chunk.toString()
        })

        response.on('end', () => {
          clearTimeout(timeout)

          if (response.statusCode !== 200) {
            resolve({
              success: false,
              error: `Registry returned HTTP ${response.statusCode}`,
            })
            return
          }

          try {
            const data = JSON.parse(responseData)
            // Registry API returns { servers: [{ server: {...}, _meta: {...} }] }
            // Unwrap the .server property so the frontend gets flat server objects
            const rawServers = Array.isArray(data) ? data : (data.servers || [])
            const servers = rawServers.map(entry => {
              // Each entry may be { server: { name, description, packages, ... }, _meta }
              const s = entry.server || entry
              // Normalize package field names from camelCase to our interface
              if (s.packages) {
                s.packages = s.packages.map(pkg => ({
                  registry_name: pkg.registryType || pkg.registry_name || '',
                  name: pkg.identifier || pkg.name || '',
                  version: pkg.version,
                  runtime: pkg.runtime || (pkg.registryType === 'npm' ? 'node' : pkg.registryType),
                  environment_variables: (pkg.environmentVariables || pkg.environment_variables || []).map(ev => ({
                    name: ev.name,
                    description: ev.description || '',
                    required: ev.required ?? !!(ev.isSecret),
                  })),
                  transport_type: pkg.transport?.type,
                }))
              }
              // Pass through remotes (streamable-http endpoints like Smithery)
              // Already in correct format: [{ type, url, headers: [{ name, value, ... }] }]
              return s
            })
            resolve({ success: true, servers })
          } catch (parseErr) {
            resolve({
              success: false,
              error: `Failed to parse registry response: ${parseErr.message}`,
            })
          }
        })
      })

      request.on('error', (err) => {
        clearTimeout(timeout)
        resolve({ success: false, error: `Registry search failed: ${err.message}` })
      })

      request.end()
    } catch (err) {
      resolve({ success: false, error: `Registry search error: ${err.message}` })
    }
  })
}

// ---------------------------------------------------------------------------
// Startup reconciliation
// ---------------------------------------------------------------------------

/**
 * Sync mcp-config.json entries with connections.json MCP connections.
 * mcp-config.json is the source of truth for MCP server definitions.
 * If a connection of type 'mcp-server' exists in connections.json but not
 * in mcp-config.json, we add it.
 *
 * @param {string} [workspacePath] - Current workspace path
 */
async function reconcileOnStartup(workspacePath) {
  try {
    const { loadConnections } = require('./connectionStorage')
    const result = await loadConnections(workspacePath)
    if (!result.success || !result.connections) return

    const config = loadMcpConfig()
    let configChanged = false

    for (const conn of result.connections) {
      if (conn.type !== 'mcp-server') continue
      const connConfig = conn.config || {}
      const serverName = connConfig.serverName || conn.name

      if (serverName && !config.mcpServers[serverName]) {
        const entry = {}
        if (connConfig.command) entry.command = connConfig.command
        if (connConfig.args) entry.args = connConfig.args
        if (connConfig.env) entry.env = connConfig.env
        if (connConfig.serverUrl) entry.serverUrl = connConfig.serverUrl
        if (connConfig.transport) entry.transport = connConfig.transport
        if (connConfig.registryRef) entry.registryRef = connConfig.registryRef

        if (entry.command || entry.serverUrl) {
          config.mcpServers[serverName] = {
            transport: entry.command ? 'stdio' : 'streamable-http',
            ...entry,
          }
          configChanged = true
          console.log(`[MCP] Reconciled: added "${serverName}" from connections.json`)
        }
      }
    }

    if (configChanged) {
      saveMcpConfig(config)
    }
  } catch (err) {
    console.warn('[MCP] Reconciliation error (non-fatal):', err.message)
  }
}

// ---------------------------------------------------------------------------
// Initialize
// ---------------------------------------------------------------------------

/**
 * Initialize the MCP service. Call once after app is ready.
 * @param {string} [workspacePath]
 */
async function initialize(workspacePath) {
  await reconcileOnStartup(workspacePath)
  console.log('[MCP] Service initialized')
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Lifecycle
  initialize,
  disconnectAll,
  // Config
  getMcpConfigPath,
  loadMcpConfig,
  saveMcpConfig,
  addServer,
  removeServer,
  listServers,
  // Connection pool
  connect,
  disconnect,
  listTools,
  callTool,
  getConnectionStatus,
  setExecutionActive,
  // Registry
  searchRegistry,
}

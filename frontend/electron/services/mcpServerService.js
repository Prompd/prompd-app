/**
 * MCP Server Service - Hosts an MCP HTTP endpoint in the Electron main process.
 *
 * Exposes Prompd workspace capabilities (compile, list files, deployments,
 * connections) as MCP tools that external agents (OpenClaw, Claude Desktop, etc.)
 * can discover and call via the Streamable HTTP transport.
 *
 * Architecture:
 *   External MCP Client  --HTTP-->  localhost:{port}/mcp  -->  MCP SDK  -->  tool handlers
 *   tool handlers call into existing Electron main process functions
 */

const http = require('http')
const crypto = require('crypto')
const { URL } = require('url')
const EventEmitter = require('events')
const path = require('path')
const fs = require('fs')
const { glob } = require('glob')

// --------------------------------------------------------------------------
// Tool definitions (schema only — handlers are methods on McpServerService)
// --------------------------------------------------------------------------

const DESKTOP_TOOLS = [
  {
    name: 'workspace_list_files',
    description: 'List .prmd and .pdflow files in the currently open Prompd workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Glob pattern filter (default: all .prmd and .pdflow files)',
        },
      },
      required: [],
    },
  },
  {
    name: 'workspace_compile',
    description:
      'Compile a .prmd file from the current workspace. Returns the rendered prompt with parameters substituted and templates processed.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the .prmd file — relative to workspace root (e.g., prompts/my-prompt.prmd) or absolute',
        },
        format: {
          type: 'string',
          description: 'Output format: markdown | openai | anthropic',
          default: 'markdown',
        },
        parameters: {
          type: 'object',
          description: 'Key-value parameters to substitute',
          additionalProperties: true,
        },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'workspace_read_file',
    description: 'Read the raw contents of a file in the workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the file — relative to workspace root (e.g., prompts/my-prompt.prmd) or absolute',
        },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'deployment_list',
    description: 'List all workflow deployments managed by this Prompd instance, with their status.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'deployment_execute',
    description: 'Trigger execution of a deployed workflow by its deployment ID.',
    inputSchema: {
      type: 'object',
      properties: {
        deploymentId: {
          type: 'string',
          description: 'The deployment ID to execute',
        },
        parameters: {
          type: 'object',
          description: 'Runtime parameters for the workflow',
          additionalProperties: true,
        },
      },
      required: ['deploymentId'],
    },
  },
  {
    name: 'deployment_status',
    description: 'Get the current status and recent execution history of a deployment.',
    inputSchema: {
      type: 'object',
      properties: {
        deploymentId: {
          type: 'string',
          description: 'The deployment ID to query',
        },
      },
      required: ['deploymentId'],
    },
  },
  {
    name: 'connections_list',
    description: 'List all configured connections (databases, SSH, HTTP APIs, MCP servers) in this Prompd workspace.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
]

// --------------------------------------------------------------------------
// Service
// --------------------------------------------------------------------------

class McpServerService extends EventEmitter {
  constructor() {
    super()
    /** @type {http.Server | null} */
    this.httpServer = null
    this.port = 18791
    this.isRunning = false
    /** @type {string} */
    this.apiKey = ''
    /** @type {string | null} current workspace path */
    this.workspacePath = null

    // References to main-process services (injected via init())
    this._compilePrompt = null
    this._getPrompdCli = null
    this._deploymentService = null
    this._connectionStorage = null

    /** @type {Map<string, { ip: string, userAgent: string, lastSeen: string, requestCount: number }>} */
    this._recentClients = new Map()
  }

  /**
   * Inject references to main-process services so tool handlers can call them.
   * Called once from main.js during app setup.
   */
  init({
    compilePrompt,
    getPrompdCli,
    deploymentService,
    connectionStorage,
    workspacePath,
  }) {
    this._compilePrompt = compilePrompt
    this._getPrompdCli = getPrompdCli
    this._deploymentService = deploymentService
    this._connectionStorage = connectionStorage
    this.workspacePath = workspacePath || null
  }

  /**
   * Update the current workspace path (called when user opens a new folder).
   */
  setWorkspacePath(wsPath) {
    this.workspacePath = wsPath
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Start the MCP HTTP server.
   * @param {{ port?: number, apiKey?: string }} opts
   */
  async start(opts = {}) {
    if (this.isRunning) {
      console.log('[MCP-Server] Already running')
      return
    }

    this.port = opts.port || this.port
    this.apiKey = opts.apiKey || crypto.randomBytes(24).toString('hex')

    return new Promise((resolve, reject) => {
      this.httpServer = http.createServer((req, res) => {
        this._handleHttp(req, res)
      })

      this.httpServer.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`[MCP-Server] Port ${this.port} is already in use`)
          reject(new Error(`Port ${this.port} is already in use`))
        } else {
          console.error('[MCP-Server] Server error:', error.message)
          reject(error)
        }
      })

      this.httpServer.listen(this.port, '127.0.0.1', () => {
        this.isRunning = true
        console.log(`[MCP-Server] MCP HTTP server started on http://127.0.0.1:${this.port}/mcp`)
        this.emit('started', { port: this.port })
        resolve()
      })
    })
  }

  /**
   * Stop the server.
   */
  async stop() {
    if (!this.isRunning || !this.httpServer) return

    return new Promise((resolve) => {
      this.httpServer.close(() => {
        this.isRunning = false
        this._recentClients.clear()
        console.log('[MCP-Server] Server stopped')
        this.emit('stopped')
        resolve()
      })
    })
  }

  /**
   * Get current server info.
   */
  getInfo() {
    return {
      running: this.isRunning,
      port: this.port,
      url: this.isRunning ? `http://127.0.0.1:${this.port}/mcp` : null,
      apiKey: this.apiKey,
      workspacePath: this.workspacePath,
      toolCount: DESKTOP_TOOLS.length,
    }
  }

  /**
   * Get recently connected MCP clients (seen in last 5 minutes).
   * @returns {Array<{ ip: string, userAgent: string, lastSeen: string, requestCount: number }>}
   */
  getRecentClients() {
    const cutoff = Date.now() - 5 * 60 * 1000
    const clients = []
    for (const [key, client] of this._recentClients) {
      if (new Date(client.lastSeen).getTime() > cutoff) {
        clients.push(client)
      } else {
        this._recentClients.delete(key)
      }
    }
    return clients
  }

  // -----------------------------------------------------------------------
  // HTTP handling — implements MCP Streamable HTTP transport manually
  // because we use Node http module, not Express.
  //
  // MCP Streamable HTTP uses JSON-RPC 2.0 over POST /mcp.
  // We handle ListTools and CallTool directly without the full SDK server
  // since we're stateless and don't need SSE or sessions.
  // -----------------------------------------------------------------------

  /**
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   */
  async _handleHttp(req, res) {
    const url = new URL(req.url, `http://127.0.0.1:${this.port}`)
    const pathname = url.pathname

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    // Health check
    if (pathname === '/health' || pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        status: 'ok',
        service: 'prompd-mcp-server',
        tools: DESKTOP_TOOLS.length,
        workspace: this.workspacePath || null,
      }))
      return
    }

    // MCP endpoint
    if (pathname === '/mcp') {
      // Auth check
      if (this.apiKey) {
        const authHeader = req.headers['authorization'] || ''
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
        if (token !== this.apiKey) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Unauthorized' },
            id: null,
          }))
          return
        }
      }

      // Track client
      const clientIp = req.socket.remoteAddress || 'unknown'
      const userAgent = req.headers['user-agent'] || 'unknown'
      const clientKey = `${clientIp}::${userAgent}`
      const existing = this._recentClients.get(clientKey)
      this._recentClients.set(clientKey, {
        ip: clientIp,
        userAgent,
        lastSeen: new Date().toISOString(),
        requestCount: (existing?.requestCount || 0) + 1,
      })

      if (req.method === 'POST') {
        return this._handleMcpPost(req, res)
      }

      // GET on /mcp — not supported in stateless mode
      res.writeHead(405, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed. Use POST.' },
        id: null,
      }))
      return
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found', path: pathname }))
  }

  /**
   * Handle POST /mcp (JSON-RPC 2.0)
   */
  async _handleMcpPost(req, res) {
    const body = await this._readBody(req)
    let rpcRequest
    try {
      rpcRequest = JSON.parse(body)
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32700, message: 'Parse error' },
        id: null,
      }))
      return
    }

    const { id, method, params } = rpcRequest

    try {
      let result

      switch (method) {
        case 'initialize':
          result = {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: {
              name: 'prompd-desktop',
              version: '0.0.1',
            },
          }
          break

        case 'tools/list':
          result = {
            tools: DESKTOP_TOOLS.map((t) => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
            })),
          }
          break

        case 'tools/call':
          result = await this._handleToolCall(params)
          break

        case 'notifications/initialized':
          // Client acknowledges init — no response needed for notifications
          res.writeHead(204)
          res.end()
          return

        case 'ping':
          result = {}
          break

        default:
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32601, message: `Method not found: ${method}` },
            id,
          }))
          return
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ jsonrpc: '2.0', result, id }))
    } catch (err) {
      console.error(`[MCP-Server] Error handling ${method}:`, err)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: err.message || 'Internal error',
        },
        id,
      }))
    }
  }

  // -----------------------------------------------------------------------
  // Tool dispatch
  // -----------------------------------------------------------------------

  async _handleToolCall(params) {
    const { name, arguments: args } = params || {}

    switch (name) {
      case 'workspace_list_files':
        return this._toolListFiles(args || {})
      case 'workspace_compile':
        return this._toolCompile(args || {})
      case 'workspace_read_file':
        return this._toolReadFile(args || {})
      case 'deployment_list':
        return this._toolDeploymentList()
      case 'deployment_execute':
        return this._toolDeploymentExecute(args || {})
      case 'deployment_status':
        return this._toolDeploymentStatus(args || {})
      case 'connections_list':
        return this._toolConnectionsList()
      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  }

  _textResult(text) {
    return { content: [{ type: 'text', text }] }
  }

  // -----------------------------------------------------------------------
  // Tool implementations
  // -----------------------------------------------------------------------

  async _toolListFiles(args) {
    if (!this.workspacePath) {
      return this._textResult('No workspace is currently open.')
    }

    const patterns = args.pattern
      ? [args.pattern]
      : ['**/*.prmd', '**/*.pdflow', '**/*.prmdflow']

    const allFiles = []
    for (const pat of patterns) {
      const fullPattern = path.join(this.workspacePath, pat).replace(/\\/g, '/')
      const files = glob.sync(fullPattern, { ignore: '**/node_modules/**' })
      allFiles.push(...files)
    }

    // Deduplicate
    const unique = [...new Set(allFiles)].map((f) =>
      path.relative(this.workspacePath, f).replace(/\\/g, '/')
    )

    if (unique.length === 0) {
      return this._textResult(`No matching files found in ${this.workspacePath}`)
    }

    return this._textResult(
      `Found ${unique.length} file(s) in workspace:\n` +
        unique.map((f) => `  ${f}`).join('\n')
    )
  }

  async _toolCompile(args) {
    const { filePath, format, parameters } = args
    if (!filePath) throw new Error('filePath is required')

    // Resolve relative paths against workspace root
    const resolved = this.workspacePath
      ? path.resolve(this.workspacePath, filePath)
      : path.resolve(filePath)

    // Security: ensure the file is within the workspace
    if (this.workspacePath) {
      const wsResolved = path.resolve(this.workspacePath)
      if (!resolved.startsWith(wsResolved)) {
        throw new Error('File path must be within the current workspace')
      }
    }

    if (!fs.existsSync(resolved)) {
      throw new Error(`File not found: ${resolved}`)
    }

    const content = fs.readFileSync(resolved, 'utf-8')

    if (this._compilePrompt) {
      const result = await this._compilePrompt(content, {
        filePath: resolved,
        format: format || 'markdown',
        parameters: parameters || {},
        workspaceRoot: this.workspacePath,
      })
      if (result.success) {
        return this._textResult(result.output)
      }
      throw new Error(result.error || 'Compilation failed')
    }

    // Fallback: return raw content
    return this._textResult(content)
  }

  async _toolReadFile(args) {
    const { filePath } = args
    if (!filePath) throw new Error('filePath is required')

    // Resolve relative paths against workspace root
    const resolved = this.workspacePath
      ? path.resolve(this.workspacePath, filePath)
      : path.resolve(filePath)

    // Security: ensure the file is within the workspace
    if (this.workspacePath) {
      const wsResolved = path.resolve(this.workspacePath)
      if (!resolved.startsWith(wsResolved)) {
        throw new Error('File path must be within the current workspace')
      }
    }

    if (!fs.existsSync(resolved)) {
      throw new Error(`File not found: ${resolved}`)
    }

    const content = fs.readFileSync(resolved, 'utf-8')
    return this._textResult(content)
  }

  async _toolDeploymentList() {
    if (!this._deploymentService) {
      return this._textResult('Deployment service not available.')
    }

    try {
      const deployments = await this._deploymentService.listDeployments()
      if (!deployments || deployments.length === 0) {
        return this._textResult('No deployments found.')
      }

      const lines = [`${deployments.length} deployment(s):\n`]
      for (const d of deployments) {
        lines.push(`  ${d.name || d.id} (${d.status})`)
        if (d.version) lines.push(`    Version: ${d.version}`)
        if (d.workflowId) lines.push(`    Workflow: ${d.workflowId}`)
      }

      return this._textResult(lines.join('\n'))
    } catch (err) {
      throw new Error(`Failed to list deployments: ${err.message}`)
    }
  }

  async _toolDeploymentExecute(args) {
    const { deploymentId, parameters } = args
    if (!deploymentId) throw new Error('deploymentId is required')

    if (!this._deploymentService) {
      throw new Error('Deployment service not available.')
    }

    try {
      const result = await this._deploymentService.execute(
        deploymentId,
        parameters || {}
      )
      return this._textResult(
        JSON.stringify(
          {
            status: result.status || 'success',
            executionId: result.id,
            output: result.result,
          },
          null,
          2
        )
      )
    } catch (err) {
      throw new Error(`Deployment execution failed: ${err.message}`)
    }
  }

  async _toolDeploymentStatus(args) {
    const { deploymentId } = args
    if (!deploymentId) throw new Error('deploymentId is required')

    if (!this._deploymentService) {
      throw new Error('Deployment service not available.')
    }

    try {
      const status = await this._deploymentService.getDeploymentStatus(deploymentId)
      const history = this._deploymentService.getHistory(deploymentId, {
        limit: 5,
      })

      const lines = []
      lines.push(`Deployment: ${status.name || deploymentId}`)
      lines.push(`Status: ${status.status}`)
      if (status.version) lines.push(`Version: ${status.version}`)

      if (history && history.length > 0) {
        lines.push(`\nRecent executions (${history.length}):`)
        for (const exec of history) {
          const ts = new Date(exec.startedAt || exec.completedAt).toISOString()
          lines.push(`  [${ts}] ${exec.status}`)
        }
      }

      return this._textResult(lines.join('\n'))
    } catch (err) {
      throw new Error(`Failed to get deployment status: ${err.message}`)
    }
  }

  async _toolConnectionsList() {
    if (!this._connectionStorage) {
      return this._textResult('Connection storage not available.')
    }

    try {
      const result = await this._connectionStorage.loadConnections()
      const connections = result?.connections || result || []
      const connList = Array.isArray(connections) ? connections : []
      if (connList.length === 0) {
        return this._textResult('No connections configured.')
      }

      const lines = [`${connList.length} connection(s):\n`]
      for (const conn of connList) {
        // Don't expose secrets — only names and types
        lines.push(`  ${conn.name} (${conn.type})`)
        if (conn.description) lines.push(`    ${conn.description}`)
      }

      return this._textResult(lines.join('\n'))
    } catch (err) {
      throw new Error(`Failed to list connections: ${err.message}`)
    }
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  _readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = []
      req.on('data', (chunk) => chunks.push(chunk))
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
      req.on('error', reject)
    })
  }
}

// Export singleton
const mcpServerService = new McpServerService()

module.exports = {
  mcpServerService,
  McpServerService,
}

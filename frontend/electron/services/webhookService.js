/**
 * Webhook Service - HTTP server for webhook-triggered workflows
 *
 * Provides a local HTTP server that can receive webhook requests
 * to trigger workflow executions with:
 * - HMAC signature validation (optional)
 * - Path-based routing to workflows
 * - Async execution (immediate 202 response)
 * - Request body passed as workflow input
 */

const http = require('http')
const crypto = require('crypto')
const { URL } = require('url')
const EventEmitter = require('events')

/**
 * @typedef {Object} WebhookEndpoint
 * @property {string} workflowId - Workflow this endpoint triggers
 * @property {string} path - URL path (e.g., '/my-workflow')
 * @property {string} [secret] - HMAC secret for signature validation
 * @property {string[]} [allowedMethods] - HTTP methods to accept (default: ['POST'])
 * @property {boolean} [validateSignature] - Whether to require signature (default: false)
 */

/**
 * @typedef {Object} WebhookRequest
 * @property {string} method - HTTP method
 * @property {string} path - Request path
 * @property {Record<string, string>} headers - Request headers
 * @property {string} body - Request body (raw string)
 * @property {unknown} [parsedBody] - Parsed JSON body if applicable
 * @property {Record<string, string>} query - Query parameters
 */

class WebhookService extends EventEmitter {
  constructor() {
    super()
    /** @type {http.Server | null} */
    this.server = null
    /** @type {Map<string, WebhookEndpoint>} */
    this.endpoints = new Map() // path -> endpoint
    /** @type {Map<string, string>} */
    this.workflowPaths = new Map() // workflowId -> path
    this.port = 9876
    this.isRunning = false
  }

  /**
   * Start the webhook server
   * @param {number} [port=9876]
   */
  async start(port = 9876) {
    if (this.isRunning) {
      console.log('[Webhook] Server already running')
      return
    }

    this.port = port

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res)
      })

      this.server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`[Webhook] Port ${this.port} is already in use`)
          reject(new Error(`Port ${this.port} is already in use`))
        } else {
          console.error('[Webhook] Server error:', error.message)
          reject(error)
        }
      })

      this.server.listen(this.port, '127.0.0.1', () => {
        this.isRunning = true
        console.log(`[Webhook] Server started on http://127.0.0.1:${this.port}`)
        this.emit('started', { port: this.port })
        resolve()
      })
    })
  }

  /**
   * Stop the webhook server
   */
  async stop() {
    if (!this.isRunning || !this.server) {
      return
    }

    return new Promise((resolve) => {
      this.server.close(() => {
        this.isRunning = false
        console.log('[Webhook] Server stopped')
        this.emit('stopped')
        resolve()
      })
    })
  }

  /**
   * Register a webhook endpoint for a workflow
   * @param {WebhookEndpoint} endpoint
   */
  registerEndpoint(endpoint) {
    const { workflowId, path } = endpoint

    // Normalize path
    const normalizedPath = path.startsWith('/') ? path : `/${path}`

    // Remove existing endpoint for this workflow
    const existingPath = this.workflowPaths.get(workflowId)
    if (existingPath) {
      this.endpoints.delete(existingPath)
    }

    // Store the endpoint
    const fullEndpoint = {
      ...endpoint,
      path: normalizedPath,
      allowedMethods: endpoint.allowedMethods || ['POST'],
    }

    this.endpoints.set(normalizedPath, fullEndpoint)
    this.workflowPaths.set(workflowId, normalizedPath)

    console.log(`[Webhook] Registered endpoint ${normalizedPath} for workflow ${workflowId}`)

    return {
      path: normalizedPath,
      url: `http://localhost:${this.port}${normalizedPath}`,
    }
  }

  /**
   * Unregister a webhook endpoint
   * @param {string} workflowId
   */
  unregisterEndpoint(workflowId) {
    const path = this.workflowPaths.get(workflowId)
    if (!path) return false

    this.endpoints.delete(path)
    this.workflowPaths.delete(workflowId)

    console.log(`[Webhook] Unregistered endpoint for workflow ${workflowId}`)
    return true
  }

  /**
   * Handle incoming HTTP request
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   * @private
   */
  async handleRequest(req, res) {
    // Parse URL
    const url = new URL(req.url, `http://localhost:${this.port}`)
    const path = url.pathname

    // Set CORS headers for local development
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Signature, X-Hub-Signature-256')

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    // Health check endpoint
    if (path === '/health' || path === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          status: 'ok',
          service: 'prompd-webhook',
          endpoints: this.endpoints.size,
          timestamp: new Date().toISOString(),
        })
      )
      return
    }

    // List endpoints (for debugging)
    if (path === '/endpoints') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          endpoints: Array.from(this.endpoints.entries()).map(([p, e]) => ({
            path: p,
            workflowId: e.workflowId,
            methods: e.allowedMethods,
            requiresSignature: e.validateSignature || false,
          })),
        })
      )
      return
    }

    // Find matching endpoint
    const endpoint = this.endpoints.get(path)
    if (!endpoint) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Endpoint not found', path }))
      return
    }

    // Check method
    if (!endpoint.allowedMethods.includes(req.method)) {
      res.writeHead(405, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          error: 'Method not allowed',
          allowed: endpoint.allowedMethods,
        })
      )
      return
    }

    // Read request body
    const body = await this.readBody(req)

    // Validate signature if required
    if (endpoint.validateSignature && endpoint.secret) {
      const isValid = this.validateSignature(req, body, endpoint.secret)
      if (!isValid) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid signature' }))
        return
      }
    }

    // Parse JSON body if Content-Type is application/json
    let parsedBody = body
    const contentType = req.headers['content-type'] || ''
    if (contentType.includes('application/json') && body && body.trim() !== '') {
      try {
        parsedBody = JSON.parse(body)
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON body' }))
        return
      }
    }

    // Parse query parameters
    const query = Object.fromEntries(url.searchParams.entries())

    // Build webhook request object
    /** @type {WebhookRequest} */
    const webhookRequest = {
      method: req.method,
      path,
      headers: Object.fromEntries(
        Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v])
      ),
      body,
      parsedBody,
      query,
    }

    // Emit trigger event (async execution)
    const executionId = crypto.randomUUID()

    // Respond immediately with 202 Accepted
    res.writeHead(202, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        status: 'accepted',
        executionId,
        workflowId: endpoint.workflowId,
        message: 'Workflow execution started',
      })
    )

    // Emit trigger event after response
    this.emit('trigger', {
      workflowId: endpoint.workflowId,
      type: 'webhook',
      executionId,
      timestamp: Date.now(),
      request: webhookRequest,
    })
  }

  /**
   * Read request body as string
   * @param {http.IncomingMessage} req
   * @returns {Promise<string>}
   * @private
   */
  readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = []
      req.on('data', (chunk) => chunks.push(chunk))
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
      req.on('error', reject)
    })
  }

  /**
   * Validate HMAC signature
   * @param {http.IncomingMessage} req
   * @param {string} body
   * @param {string} secret
   * @returns {boolean}
   * @private
   */
  validateSignature(req, body, secret) {
    // Support multiple signature header formats
    const signature =
      req.headers['x-signature'] ||
      req.headers['x-hub-signature-256'] ||
      req.headers['x-webhook-signature']

    if (!signature) {
      console.log('[Webhook] No signature header found')
      return false
    }

    // Parse signature (handles both "sha256=xxx" and plain "xxx" formats)
    let algorithm = 'sha256'
    let providedSignature = signature

    if (signature.includes('=')) {
      const parts = signature.split('=')
      algorithm = parts[0]
      providedSignature = parts[1]
    }

    // Calculate expected signature
    const hmac = crypto.createHmac(algorithm, secret)
    hmac.update(body)
    const expectedSignature = hmac.digest('hex')

    // Timing-safe comparison
    try {
      const a = Buffer.from(providedSignature, 'hex')
      const b = Buffer.from(expectedSignature, 'hex')
      return crypto.timingSafeEqual(a, b)
    } catch (e) {
      // If buffers have different lengths or invalid hex, comparison fails
      return false
    }
  }

  /**
   * Get server info
   */
  getInfo() {
    return {
      running: this.isRunning,
      port: this.port,
      endpoints: Array.from(this.endpoints.entries()).map(([path, e]) => ({
        path,
        workflowId: e.workflowId,
        url: `http://localhost:${this.port}${path}`,
      })),
    }
  }

  /**
   * Get count of registered endpoints
   */
  getEndpointCount() {
    return this.endpoints.size
  }
}

// Export singleton instance
const webhookService = new WebhookService()

module.exports = {
  webhookService,
  WebhookService,
}

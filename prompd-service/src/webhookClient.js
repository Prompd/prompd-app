/**
 * Webhook Client for Prompd Service
 *
 * Connects to the cloud webhook proxy (api.prompd.app) to receive webhooks
 * forwarded from external systems (GitHub, Stripe, etc.).
 *
 * Modes:
 *   - WebSocket (preferred): Real-time webhook delivery via Socket.IO
 *   - Polling (fallback): Polls for webhooks every 15 seconds when WebSocket unavailable
 *
 * Authentication:
 *   - Uses existing registry API token from ~/.prompd/config.yaml
 *   - No separate authentication system needed
 */

import { io } from 'socket.io-client'
import fs from 'fs'
import yaml from 'yaml'
import os from 'os'
import path from 'path'

/**
 * Load registry token from config.yaml
 * @returns {string|null} - Registry API token
 */
function loadRegistryToken() {
  try {
    const configPath = path.join(os.homedir(), '.prompd', 'config.yaml')

    if (!fs.existsSync(configPath)) {
      console.warn('[WebhookClient] Config file not found at:', configPath)
      return null
    }

    const configContent = fs.readFileSync(configPath, 'utf8')
    const config = yaml.parse(configContent)

    // Get token from registry configuration
    const registryConfig = config.registry?.registries?.prompdhub
    const token = registryConfig?.api_key

    if (!token) {
      console.warn('[WebhookClient] No registry token found in config.yaml')
      console.warn('[WebhookClient] Run `prompd registry login` to generate a token')
      return null
    }

    return token
  } catch (error) {
    console.error('[WebhookClient] Failed to load registry token:', error.message)
    return null
  }
}

export class WebhookClient {
  constructor(options = {}) {
    this.proxyUrl = options.proxyUrl || process.env.WEBHOOK_PROXY_URL || 'https://api.prompd.app'
    this.onWebhook = options.onWebhook || (() => {})
    this.pollingInterval = options.pollingInterval || 15000 // 15 seconds
    this.socket = null
    this.connected = false
    this.polling = false
    this.pollingTimer = null
    this.token = loadRegistryToken()
  }

  /**
   * Start webhook client (WebSocket with polling fallback)
   */
  async start() {
    if (!this.token) {
      console.error('[WebhookClient] Cannot start: No registry token found')
      console.error('[WebhookClient] Run `prompd registry login` to authenticate')
      return false
    }

    console.log('[WebhookClient] Starting webhook client...')
    console.log('[WebhookClient] Proxy URL:', this.proxyUrl)

    // Try WebSocket connection first
    const wsConnected = await this.connectWebSocket()

    if (!wsConnected) {
      // Fallback to polling
      console.log('[WebhookClient] WebSocket unavailable, starting polling mode')
      this.startPolling()
    }

    return true
  }

  /**
   * Connect via WebSocket (Socket.IO)
   * @returns {Promise<boolean>} - True if connected
   */
  async connectWebSocket() {
    return new Promise((resolve) => {
      try {
        this.socket = io(this.proxyUrl, {
          transports: ['websocket', 'polling'], // Prefer WebSocket, fallback to long-polling
          reconnection: true,
          reconnectionDelay: 5000,
          reconnectionAttempts: 3,
          timeout: 10000
        })

        // Register with webhook proxy
        this.socket.on('connect', () => {
          console.log('[WebhookClient] WebSocket connected')
          this.socket.emit('webhook-proxy:register', { token: this.token })
        })

        // Registration confirmed
        this.socket.on('webhook-proxy:registered', (data) => {
          console.log('[WebhookClient] Registered with webhook proxy:', data.userId)
          this.connected = true
          this.stopPolling() // Stop polling if it was running
          resolve(true)
        })

        // Registration failed
        this.socket.on('webhook-proxy:error', (data) => {
          console.error('[WebhookClient] Registration failed:', data.error)
          this.socket.disconnect()
          this.connected = false
          resolve(false)
        })

        // Receive webhook
        this.socket.on('webhook', async (webhook) => {
          console.log(`[WebhookClient] Received webhook: ${webhook.id}`)
          await this.handleWebhook(webhook)

          // Acknowledge receipt
          this.socket.emit('webhook-proxy:ack', { webhookId: webhook.id })
        })

        // Disconnected
        this.socket.on('disconnect', (reason) => {
          console.log(`[WebhookClient] WebSocket disconnected: ${reason}`)
          this.connected = false

          // Start polling if disconnected
          if (reason !== 'io client disconnect') {
            console.log('[WebhookClient] Starting polling mode as fallback')
            this.startPolling()
          }
        })

        // Connection error
        this.socket.on('connect_error', (error) => {
          console.error('[WebhookClient] WebSocket connection error:', error.message)
          this.connected = false
          resolve(false)
        })

        // Timeout if not connected within 10 seconds
        setTimeout(() => {
          if (!this.connected) {
            console.log('[WebhookClient] WebSocket connection timeout')
            this.socket?.disconnect()
            resolve(false)
          }
        }, 10000)

      } catch (error) {
        console.error('[WebhookClient] Failed to create WebSocket connection:', error.message)
        resolve(false)
      }
    })
  }

  /**
   * Start polling mode (fallback when WebSocket unavailable)
   */
  startPolling() {
    if (this.polling || this.connected) {
      return
    }

    this.polling = true
    console.log(`[WebhookClient] Polling mode started (interval: ${this.pollingInterval}ms)`)

    this.pollingTimer = setInterval(async () => {
      await this.pollWebhooks()
    }, this.pollingInterval)
  }

  /**
   * Stop polling mode
   */
  stopPolling() {
    if (!this.polling) {
      return
    }

    this.polling = false
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer)
      this.pollingTimer = null
    }

    console.log('[WebhookClient] Polling mode stopped')
  }

  /**
   * Poll for pending webhooks (polling mode)
   */
  async pollWebhooks() {
    try {
      const response = await fetch(`${this.proxyUrl}/api/webhook-proxy/pending`, {
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      })

      if (!response.ok) {
        if (response.status === 401) {
          console.error('[WebhookClient] Authentication failed - token may be invalid')
          this.stopPolling()
        }
        return
      }

      const { webhooks } = await response.json()

      if (webhooks.length === 0) {
        return
      }

      console.log(`[WebhookClient] Polled ${webhooks.length} pending webhook(s)`)

      // Process each webhook
      for (const webhook of webhooks) {
        await this.handleWebhook(webhook)

        // Acknowledge receipt
        await fetch(`${this.proxyUrl}/api/webhook-proxy/ack/${webhook.id}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.token}`
          }
        })
      }

    } catch (error) {
      console.error('[WebhookClient] Polling error:', error.message)
    }
  }

  /**
   * Handle incoming webhook
   * @param {object} webhook - Webhook data
   */
  async handleWebhook(webhook) {
    try {
      console.log(`[WebhookClient] Processing webhook for workflow: ${webhook.workflowId}`)

      // Call user-provided webhook handler
      await this.onWebhook(webhook)

    } catch (error) {
      console.error(`[WebhookClient] Failed to handle webhook ${webhook.id}:`, error.message)
    }
  }

  /**
   * Stop webhook client
   */
  stop() {
    console.log('[WebhookClient] Stopping webhook client...')

    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }

    this.stopPolling()
    this.connected = false

    console.log('[WebhookClient] Webhook client stopped')
  }

  /**
   * Check if webhook client is active (either connected or polling)
   * @returns {boolean}
   */
  isActive() {
    return this.connected || this.polling
  }

  /**
   * Get current mode
   * @returns {string} - 'websocket', 'polling', or 'disabled'
   */
  getMode() {
    if (this.connected) return 'websocket'
    if (this.polling) return 'polling'
    return 'disabled'
  }
}

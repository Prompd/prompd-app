/**
 * Trigger Service - Orchestrates workflow trigger management
 *
 * Central service for managing all trigger types:
 * - Schedule triggers (cron/interval)
 * - Webhook triggers (HTTP endpoints)
 * - File watch triggers (filesystem events)
 * - Event triggers (inter-workflow communication)
 *
 * Handles:
 * - Configuration persistence (~/.prompd/triggers.json)
 * - Execution history tracking
 * - Service lifecycle management
 * - IPC communication with renderer
 */

const { app } = require('electron')
const fs = require('fs')
const path = require('path')
const EventEmitter = require('events')
const crypto = require('crypto')

/**
 * @typedef {'manual' | 'webhook' | 'schedule' | 'file-watch' | 'event'} TriggerType
 *
 * @typedef {Object} TriggerConfig
 * @property {string} workflowId
 * @property {string} workflowPath - Absolute path to .pdflow file
 * @property {boolean} enabled
 * @property {TriggerType} triggerType
 * @property {string} [workflowName] - Display name
 * @property {'cron' | 'interval'} [scheduleType]
 * @property {string} [scheduleCron]
 * @property {number} [scheduleIntervalMs]
 * @property {string} [scheduleTimezone]
 * @property {string} [webhookPath]
 * @property {string} [webhookSecret]
 * @property {string[]} [webhookMethods]
 * @property {string[]} [fileWatchPaths]
 * @property {string[]} [fileWatchEvents]
 * @property {number} [fileWatchDebounceMs]
 * @property {boolean} [fileWatchRecursive]
 * @property {string} [eventName]
 * @property {string} [eventFilter]
 * @property {number} createdAt
 * @property {number} [lastTriggered]
 * @property {'success' | 'failed'} [lastStatus]
 * @property {string} [lastError]
 *
 * @typedef {Object} ExecutionResult
 * @property {string} executionId
 * @property {string} workflowId
 * @property {TriggerType} triggeredBy
 * @property {number} triggeredAt
 * @property {number} [completedAt]
 * @property {'running' | 'completed' | 'failed'} status
 * @property {*} [output]
 * @property {string} [error]
 * @property {Object} [context]
 *
 * @typedef {Object} TriggerSettings
 * @property {number} webhookPort
 * @property {number} maxConcurrentExecutions
 * @property {boolean} notificationsEnabled
 * @property {boolean} minimizeToTray
 */

class TriggerService extends EventEmitter {
  constructor() {
    super()

    /** @type {Map<string, TriggerConfig>} */
    this.triggers = new Map()

    /** @type {ExecutionResult[]} */
    this.executionHistory = []

    /** @type {Map<string, ExecutionResult>} */
    this.activeExecutions = new Map()

    /** @type {TriggerSettings} */
    this.settings = {
      webhookPort: 9876,
      maxConcurrentExecutions: 3,
      notificationsEnabled: true,
      minimizeToTray: true,
    }

    // Service references (set during init)
    this.schedulerService = null
    this.webhookService = null
    this.fileWatchService = null
    this.trayManager = null
    this.mainWindow = null

    // Config paths
    this.configDir = path.join(app.getPath('home'), '.prompd')
    this.configPath = path.join(this.configDir, 'triggers.json')
    this.historyPath = path.join(this.configDir, 'execution-history.json')

    // History limits
    this.maxHistoryEntries = 100
  }

  /**
   * Initialize the trigger service
   * @param {Object} deps - Dependencies
   * @param {Object} deps.trayManager - Tray manager instance
   * @param {Electron.BrowserWindow} deps.mainWindow - Main window
   */
  async init({ trayManager, mainWindow }) {
    this.trayManager = trayManager
    this.mainWindow = mainWindow

    // Ensure config directory exists
    await this.ensureConfigDir()

    // Load saved configuration
    await this.loadConfig()
    await this.loadHistory()

    // Initialize sub-services (lazy-loaded)
    await this.initSubServices()

    // Register triggers
    await this.registerAllTriggers()

    // Update tray state
    this.updateTrayState()

    console.log('[TriggerService] Initialized with', this.triggers.size, 'triggers')
  }

  /**
   * Ensure config directory exists
   */
  async ensureConfigDir() {
    try {
      await fs.promises.mkdir(this.configDir, { recursive: true })
    } catch (err) {
      if (err.code !== 'EEXIST') {
        console.error('[TriggerService] Failed to create config dir:', err)
      }
    }
  }

  /**
   * Initialize sub-services
   */
  async initSubServices() {
    // Load sub-services
    const { schedulerService } = require('./schedulerService')
    const { webhookService } = require('./webhookService')
    const { fileWatchService } = require('./fileWatchService')

    this.schedulerService = schedulerService
    this.webhookService = webhookService
    this.fileWatchService = fileWatchService

    // Wire up scheduler trigger events
    this.schedulerService.on('trigger', (data) => {
      this.executeWorkflow(data.workflowId, {
        triggeredBy: 'schedule',
        scheduleType: data.scheduleType,
      })
    })

    // Wire up webhook trigger events
    this.webhookService.on('trigger', (data) => {
      this.executeWorkflow(data.workflowId, {
        triggeredBy: 'webhook',
        executionId: data.executionId,
        payload: data.request.parsedBody || data.request.body,
        headers: data.request.headers,
        query: data.request.query,
      })
    })

    // Wire up file watch trigger events
    this.fileWatchService.on('trigger', (data) => {
      this.executeWorkflow(data.workflowId, {
        triggeredBy: 'file-watch',
        files: data.files,
      })
    })

    // Start webhook server if there are webhook triggers
    const hasWebhookTriggers = Array.from(this.triggers.values()).some(
      (t) => t.triggerType === 'webhook' && t.enabled
    )
    if (hasWebhookTriggers) {
      try {
        await this.webhookService.start(this.settings.webhookPort)
      } catch (err) {
        console.error('[TriggerService] Failed to start webhook server:', err.message)
      }
    }

    console.log('[TriggerService] Sub-services initialized')
  }

  /**
   * Load configuration from disk
   */
  async loadConfig() {
    try {
      const data = await fs.promises.readFile(this.configPath, 'utf-8')

      // If file is empty, treat as new object
      if (!data || data.trim() === '') {
        console.log('[TriggerService] Config file is empty, starting fresh')
        return
      }

      const config = JSON.parse(data)

      if (config.version === 1) {
        // Load triggers
        for (const [id, triggerConfig] of Object.entries(config.triggers || {})) {
          this.triggers.set(id, triggerConfig)
        }

        // Load settings
        if (config.settings) {
          this.settings = { ...this.settings, ...config.settings }
        }

        console.log('[TriggerService] Loaded', this.triggers.size, 'triggers from config')
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error('[TriggerService] Failed to load config:', err)
      }
      // Config doesn't exist yet - that's fine
    }
  }

  /**
   * Save configuration to disk
   */
  async saveConfig() {
    try {
      const config = {
        version: 1,
        triggers: Object.fromEntries(this.triggers),
        settings: this.settings,
      }

      await fs.promises.writeFile(
        this.configPath,
        JSON.stringify(config, null, 2),
        'utf-8'
      )

      console.log('[TriggerService] Config saved')
    } catch (err) {
      console.error('[TriggerService] Failed to save config:', err)
    }
  }

  /**
   * Load execution history from disk
   */
  async loadHistory() {
    try {
      const data = await fs.promises.readFile(this.historyPath, 'utf-8')

      // If file is empty, treat as new object
      if (!data || data.trim() === '') {
        console.log('[TriggerService] History file is empty, starting fresh')
        this.executionHistory = []
        return
      }

      const history = JSON.parse(data)

      if (history.version === 1) {
        this.executionHistory = history.executions || []
        console.log('[TriggerService] Loaded', this.executionHistory.length, 'history entries')
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error('[TriggerService] Failed to load history:', err)
      }
    }
  }

  /**
   * Save execution history to disk
   */
  async saveHistory() {
    try {
      // Trim to max entries
      if (this.executionHistory.length > this.maxHistoryEntries) {
        this.executionHistory = this.executionHistory.slice(-this.maxHistoryEntries)
      }

      const history = {
        version: 1,
        maxEntries: this.maxHistoryEntries,
        executions: this.executionHistory,
      }

      await fs.promises.writeFile(
        this.historyPath,
        JSON.stringify(history, null, 2),
        'utf-8'
      )
    } catch (err) {
      console.error('[TriggerService] Failed to save history:', err)
    }
  }

  /**
   * Register all loaded triggers with their respective services
   */
  async registerAllTriggers() {
    for (const [, config] of this.triggers) {
      if (config.enabled) {
        await this.activateTrigger(config)
      }
    }
  }

  /**
   * Activate a trigger (register with appropriate service)
   * @param {TriggerConfig} config
   */
  async activateTrigger(config) {
    try {
      switch (config.triggerType) {
        case 'schedule':
          if (this.schedulerService) {
            // Transform to scheduler service format
            const scheduleConfig = {
              workflowId: config.workflowId,
              type: config.scheduleType || 'cron',
              cron: config.scheduleCron,
              intervalMs: config.scheduleIntervalMs,
              timezone: config.scheduleTimezone,
              runOnStart: false,
            }
            this.schedulerService.addJob(scheduleConfig)
          }
          break

        case 'webhook':
          if (this.webhookService) {
            // Ensure webhook server is running
            if (!this.webhookService.isRunning) {
              await this.webhookService.start(this.settings.webhookPort)
            }

            // Transform to webhook service format
            const webhookConfig = {
              workflowId: config.workflowId,
              path: config.webhookPath || `/workflow/${config.workflowId}`,
              secret: config.webhookSecret,
              allowedMethods: config.webhookMethods || ['POST'],
              validateSignature: !!config.webhookSecret,
            }
            this.webhookService.registerEndpoint(webhookConfig)
          }
          break

        case 'file-watch':
          if (this.fileWatchService) {
            // Transform to file watch service format
            const fileWatchConfig = {
              workflowId: config.workflowId,
              paths: config.fileWatchPaths || [],
              events: config.fileWatchEvents || ['create', 'modify', 'delete'],
              debounceMs: config.fileWatchDebounceMs || 500,
              recursive: config.fileWatchRecursive !== false,
            }
            this.fileWatchService.addWatcher(fileWatchConfig)
          }
          break

        case 'event':
          // Event triggers are handled via internal EventEmitter
          this.on(`event:${config.eventName}`, (data) => {
            this.executeWorkflow(config.workflowId, {
              triggeredBy: 'event',
              eventData: data,
            })
          })
          break

        // 'manual' triggers don't need activation
      }

      console.log('[TriggerService] Activated trigger:', config.workflowId, config.triggerType)
    } catch (err) {
      console.error('[TriggerService] Failed to activate trigger:', config.workflowId, err)
    }
  }

  /**
   * Deactivate a trigger (unregister from appropriate service)
   * @param {TriggerConfig} config
   */
  async deactivateTrigger(config) {
    try {
      switch (config.triggerType) {
        case 'schedule':
          if (this.schedulerService) {
            this.schedulerService.removeJob(config.workflowId)
          }
          break
        case 'webhook':
          if (this.webhookService) {
            this.webhookService.unregisterEndpoint(config.workflowId)
          }
          break
        case 'file-watch':
          if (this.fileWatchService) {
            this.fileWatchService.removeWatcher(config.workflowId)
          }
          break
        case 'event':
          this.removeAllListeners(`event:${config.eventName}`)
          break
      }

      console.log('[TriggerService] Deactivated trigger:', config.workflowId)
    } catch (err) {
      console.error('[TriggerService] Failed to deactivate trigger:', config.workflowId, err)
    }
  }

  // ============================================================================
  // Public API (called from IPC handlers)
  // ============================================================================

  /**
   * Register a workflow trigger
   * @param {TriggerConfig} config
   * @returns {{ success: boolean, error?: string }}
   */
  async register(config) {
    try {
      // Validate config
      if (!config.workflowId || !config.workflowPath || !config.triggerType) {
        return { success: false, error: 'Missing required fields' }
      }

      // Check if workflow file exists
      try {
        await fs.promises.access(config.workflowPath, fs.constants.R_OK)
      } catch {
        return { success: false, error: 'Workflow file not found' }
      }

      // Add timestamp
      config.createdAt = config.createdAt || Date.now()

      // Generate webhook secret if needed
      if (config.triggerType === 'webhook' && !config.webhookSecret) {
        config.webhookSecret = crypto.randomBytes(32).toString('hex')
      }

      // Deactivate existing trigger if any
      const existing = this.triggers.get(config.workflowId)
      if (existing) {
        await this.deactivateTrigger(existing)
      }

      // Store config
      this.triggers.set(config.workflowId, config)

      // Activate if enabled
      if (config.enabled) {
        await this.activateTrigger(config)
      }

      // Persist
      await this.saveConfig()

      // Update tray
      this.updateTrayState()

      // Notify renderer
      this.notifyRenderer('trigger:registered', config)

      return { success: true }
    } catch (err) {
      console.error('[TriggerService] Register failed:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * Unregister a workflow trigger
   * @param {string} workflowId
   * @returns {{ success: boolean, error?: string }}
   */
  async unregister(workflowId) {
    try {
      const config = this.triggers.get(workflowId)
      if (!config) {
        return { success: false, error: 'Trigger not found' }
      }

      // Deactivate
      await this.deactivateTrigger(config)

      // Remove from map
      this.triggers.delete(workflowId)

      // Persist
      await this.saveConfig()

      // Update tray
      this.updateTrayState()

      // Notify renderer
      this.notifyRenderer('trigger:unregistered', { workflowId })

      return { success: true }
    } catch (err) {
      console.error('[TriggerService] Unregister failed:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * Enable or disable a trigger
   * @param {string} workflowId
   * @param {boolean} enabled
   * @returns {{ success: boolean, error?: string }}
   */
  async setEnabled(workflowId, enabled) {
    try {
      const config = this.triggers.get(workflowId)
      if (!config) {
        return { success: false, error: 'Trigger not found' }
      }

      if (config.enabled === enabled) {
        return { success: true } // No change needed
      }

      config.enabled = enabled

      if (enabled) {
        await this.activateTrigger(config)
      } else {
        await this.deactivateTrigger(config)
      }

      // Persist
      await this.saveConfig()

      // Update tray
      this.updateTrayState()

      // Notify renderer
      this.notifyRenderer('trigger:status-change', { workflowId, enabled })

      return { success: true }
    } catch (err) {
      console.error('[TriggerService] SetEnabled failed:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * Get all registered triggers
   * @returns {{ success: boolean, triggers: TriggerConfig[] }}
   */
  list() {
    return {
      success: true,
      triggers: Array.from(this.triggers.values()),
    }
  }

  /**
   * Get trigger status
   * @param {string} workflowId
   * @returns {{ success: boolean, status?: Object, error?: string }}
   */
  getStatus(workflowId) {
    const config = this.triggers.get(workflowId)
    if (!config) {
      return { success: false, error: 'Trigger not found' }
    }

    let nextRun = undefined
    if (config.triggerType === 'schedule' && config.enabled && this.schedulerService) {
      const jobStatus = this.schedulerService.getJobStatus(workflowId)
      nextRun = jobStatus?.nextRun ? new Date(jobStatus.nextRun).toISOString() : undefined
    }

    return {
      success: true,
      status: {
        workflowId,
        enabled: config.enabled,
        triggerType: config.triggerType,
        lastTriggered: config.lastTriggered,
        lastStatus: config.lastStatus,
        lastError: config.lastError,
        nextRun,
      },
    }
  }

  /**
   * Get execution history
   * @param {string} [workflowId] - Filter by workflow
   * @param {number} [limit=50] - Max entries
   * @returns {{ success: boolean, executions: ExecutionResult[] }}
   */
  getHistory(workflowId, limit = 50) {
    let executions = this.executionHistory

    if (workflowId) {
      executions = executions.filter((e) => e.workflowId === workflowId)
    }

    return {
      success: true,
      executions: executions.slice(-limit).reverse(),
    }
  }

  /**
   * Get webhook server info
   * @returns {{ success: boolean, port?: number, running: boolean, endpoints: Object[] }}
   */
  getWebhookServerInfo() {
    if (!this.webhookService) {
      return {
        success: true,
        running: false,
        endpoints: [],
      }
    }

    const info = this.webhookService.getInfo()
    return {
      success: true,
      port: info.port,
      running: info.running,
      endpoints: info.endpoints,
    }
  }

  /**
   * Get tray state summary
   * @returns {Object}
   */
  getTrayState() {
    return {
      activeWorkflows: this.activeExecutions.size,
      scheduledTriggers: this.countTriggersByType('schedule'),
      fileWatchers: this.countTriggersByType('file-watch'),
      webhookServerRunning: this.webhookService?.isRunning || false,
      webhookPort: this.settings.webhookPort,
      nextScheduledRun: this.getNextScheduledRun(),
    }
  }

  // ============================================================================
  // Workflow Execution
  // ============================================================================

  /**
   * Execute a workflow (called by trigger services)
   * @param {string} workflowId
   * @param {Object} context
   * @param {TriggerType} context.triggeredBy
   * @param {*} [context.payload] - Webhook payload
   * @param {Object} [context.file] - File event info
   * @param {*} [context.eventData] - Event trigger data
   * @returns {Promise<ExecutionResult>}
   */
  async executeWorkflow(workflowId, context) {
    const config = this.triggers.get(workflowId)
    if (!config) {
      throw new Error('Trigger not found')
    }

    // Check concurrent execution limit
    if (this.activeExecutions.size >= this.settings.maxConcurrentExecutions) {
      console.warn('[TriggerService] Max concurrent executions reached, queuing...')
      // TODO: Implement queue
    }

    // Create execution record
    const executionId = `exec-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
    const execution = {
      executionId,
      workflowId,
      triggeredBy: context.triggeredBy,
      triggeredAt: Date.now(),
      status: 'running',
      context,
    }

    // Track active execution
    this.activeExecutions.set(executionId, execution)

    // Update tray
    this.updateTrayState()

    // Notify renderer
    this.notifyRenderer('trigger:execution-start', execution)

    // Show notification
    if (this.settings.notificationsEnabled && this.trayManager) {
      this.trayManager.showNotification({
        title: 'Workflow Started',
        body: `${config.workflowName || config.workflowId} triggered by ${context.triggeredBy}`,
        type: 'info',
        executionId,
      })
    }

    try {
      // Execute the workflow
      // For now, we'll emit an event that the main process can handle
      // In the future, this could use a worker thread
      const result = await this.runWorkflow(config, context)

      // Update execution record
      execution.status = 'completed'
      execution.completedAt = Date.now()
      execution.output = result

      // Update trigger stats
      config.lastTriggered = execution.triggeredAt
      config.lastStatus = 'success'
      config.lastError = undefined

      // Show success notification
      if (this.settings.notificationsEnabled && this.trayManager) {
        this.trayManager.showNotification({
          title: 'Workflow Completed',
          body: `${config.workflowName || config.workflowId} completed successfully`,
          type: 'success',
          executionId,
        })
      }
    } catch (err) {
      // Update execution record
      execution.status = 'failed'
      execution.completedAt = Date.now()
      execution.error = err.message

      // Update trigger stats
      config.lastTriggered = execution.triggeredAt
      config.lastStatus = 'failed'
      config.lastError = err.message

      // Show error notification
      if (this.settings.notificationsEnabled && this.trayManager) {
        this.trayManager.showNotification({
          title: 'Workflow Failed',
          body: `${config.workflowName || config.workflowId}: ${err.message}`,
          type: 'error',
          executionId,
        })
      }
    }

    // Remove from active
    this.activeExecutions.delete(executionId)

    // Add to history
    this.executionHistory.push(execution)

    // Persist
    await this.saveConfig()
    await this.saveHistory()

    // Update tray
    this.updateTrayState()

    // Notify renderer
    this.notifyRenderer('trigger:execution-complete', execution)

    return execution
  }

  /**
   * Actually run the workflow
   * @param {TriggerConfig} config
   * @param {Object} context
   * @returns {Promise<*>}
   */
  async runWorkflow(config, context) {
    // Read workflow file
    const workflowContent = await fs.promises.readFile(config.workflowPath, 'utf-8')

    // Check if workflow file is empty
    if (!workflowContent || workflowContent.trim() === '') {
      throw new Error(`Workflow file is empty: ${config.workflowPath}`)
    }

    const workflow = JSON.parse(workflowContent)

    // For now, emit event to renderer to execute
    // The renderer has access to the full WorkflowExecutor
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Workflow execution timeout'))
      }, 300000) // 5 minute timeout

      const responseChannel = `workflow:execute-response:${Date.now()}`

      // Listen for response
      const { ipcMain } = require('electron')
      ipcMain.once(responseChannel, (_event, result) => {
        clearTimeout(timeout)
        if (result.success) {
          resolve(result.output)
        } else {
          reject(new Error(result.error))
        }
      })

      // Request execution from renderer
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('workflow:execute-request', {
          workflow,
          context,
          responseChannel,
        })
      } else {
        clearTimeout(timeout)
        reject(new Error('Main window not available'))
      }
    })
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Count triggers by type
   * @param {TriggerType} type
   * @returns {number}
   */
  countTriggersByType(type) {
    let count = 0
    for (const config of this.triggers.values()) {
      if (config.triggerType === type && config.enabled) {
        count++
      }
    }
    return count
  }

  /**
   * Get next scheduled run time
   * @returns {string | undefined}
   */
  getNextScheduledRun() {
    if (!this.schedulerService) return undefined

    // Use the scheduler service's built-in method
    return this.schedulerService.getNextScheduledRun()
  }

  /**
   * Update tray state
   */
  updateTrayState() {
    if (this.trayManager) {
      this.trayManager.setState(this.getTrayState())
    }
  }

  /**
   * Notify renderer process
   * @param {string} channel
   * @param {*} data
   */
  notifyRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data)
    }
  }

  /**
   * Update settings
   * @param {Partial<TriggerSettings>} newSettings
   */
  async updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings }
    await this.saveConfig()
  }

  /**
   * Shutdown the service
   */
  async shutdown() {
    console.log('[TriggerService] Shutting down...')

    // Deactivate all triggers
    for (const config of this.triggers.values()) {
      await this.deactivateTrigger(config)
    }

    // Stop sub-services
    if (this.schedulerService) {
      this.schedulerService.shutdown()
    }
    if (this.webhookService) {
      await this.webhookService.stop()
    }
    if (this.fileWatchService) {
      this.fileWatchService.shutdown()
    }

    // Save state
    await this.saveConfig()
    await this.saveHistory()

    console.log('[TriggerService] Shutdown complete')
  }
}

// Export singleton instance
const triggerService = new TriggerService()

module.exports = {
  triggerService,
  TriggerService,
}

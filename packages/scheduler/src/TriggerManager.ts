/**
 * TriggerManager - Multi-trigger registration and management
 *
 * Handles registration of all trigger types:
 * - schedule: Cron-based scheduling (node-cron)
 * - webhook: HTTP endpoint triggers
 * - file-watch: File system change triggers (chokidar)
 * - event: Custom event triggers
 * - manual: User-initiated (no registration needed)
 */

import * as cron from 'node-cron'
import * as chokidar from 'chokidar'
import { EventEmitter } from 'events'
import type {
  TriggerConfiguration,
  TriggerContext,
  TriggerEventContext,
  TriggerManagerOptions,
  TriggerStats,
  WebhookData,
  CloudWebhookContext
} from './types'

// Dynamic import for WebhookClient (ESM module)
interface WebhookClientInterface {
  start(): Promise<boolean>
  stop(): void
  isActive(): boolean
  getMode(): string
}

interface WebhookClientConstructor {
  new (options: { onWebhook: (webhook: WebhookData) => void }): WebhookClientInterface
}

let WebhookClient: WebhookClientConstructor | null = null

async function loadWebhookClient(): Promise<WebhookClientConstructor | null> {
  if (!WebhookClient) {
    try {
      // Try to load webhookClient from prompd-service (may not exist in all contexts)
      // Using Function constructor to bypass TypeScript module resolution
      const dynamicImport = new Function('path', 'return import(path)')
      const module = await dynamicImport('../../prompd-service/src/webhookClient.js') as { WebhookClient: WebhookClientConstructor }
      WebhookClient = module.WebhookClient
    } catch (error) {
      console.warn('[TriggerManager] WebhookClient module not available:', error instanceof Error ? error.message : String(error))
      return null
    }
  }
  return WebhookClient
}

interface WebhookConfig {
  triggerId: string
  workflowId: string
  context: TriggerContext
}

export class TriggerManager extends EventEmitter {
  private onTrigger: (triggerId: string, context: TriggerEventContext) => void | Promise<void | unknown>

  // Trigger storage maps
  private cronJobs: Map<string, cron.ScheduledTask> = new Map()
  private webhooks: Map<string, WebhookConfig> = new Map()
  private fileWatchers: Map<string, chokidar.FSWatcher> = new Map()
  private eventListeners: Map<string, Set<string>> = new Map()

  // Webhook client for cloud-based webhook proxy
  private webhookClient: WebhookClientInterface | null = null

  constructor(options: TriggerManagerOptions = {}) {
    super()
    this.onTrigger = options.onTrigger || (() => {})
    console.log('[TriggerManager] Initialized')
  }

  /**
   * Register a trigger based on type
   */
  async register(triggerId: string, triggerData: TriggerConfiguration, context: TriggerContext = {}): Promise<void> {
    const { triggerType } = triggerData

    console.log(`[TriggerManager] Registering ${triggerType} trigger: ${triggerId}`)

    switch (triggerType) {
      case 'schedule':
        return this.registerSchedule(triggerId, triggerData, context)

      case 'webhook':
        return this.registerWebhook(triggerId, triggerData, context)

      case 'file-watch':
        return this.registerFileWatch(triggerId, triggerData, context)

      case 'event':
        return this.registerEvent(triggerId, triggerData, context)

      case 'manual':
        // Manual triggers don't need registration
        console.log(`[TriggerManager] Manual trigger (no registration needed)`)
        return

      default:
        throw new Error(`Unknown trigger type: ${triggerType}`)
    }
  }

  /**
   * Register schedule trigger (cron)
   */
  private registerSchedule(triggerId: string, triggerData: TriggerConfiguration, context: TriggerContext): void {
    const { scheduleTimezone } = triggerData

    // Normalize step notation that node-cron validates but silently never fires:
    // - 0/N → */N (react-cron-generator outputs this)
    // - N/1 → * (stepping by 1 from any start = every value)
    const scheduleCron = (triggerData.scheduleCron || '').split(/\s+/)
      .map(f => {
        if (/^\d+\/1$/.test(f)) return '*'
        if (/^0\/\d+$/.test(f)) return f.replace('0/', '*/')
        return f
      }).join(' ')

    if (!scheduleCron) {
      throw new Error('Schedule cron expression is required')
    }

    // Validate cron expression
    if (!cron.validate(scheduleCron)) {
      throw new Error(`Invalid cron expression: ${scheduleCron}`)
    }

    // Stop existing job if present
    if (this.cronJobs.has(triggerId)) {
      this.cronJobs.get(triggerId)?.stop()
      this.cronJobs.delete(triggerId)
    }

    // Create cron job
    const task = cron.schedule(
      scheduleCron,
      () => {
        console.log(`[TriggerManager] Cron triggered: ${triggerId}`)
        this.onTrigger(triggerId, {
          triggerType: 'schedule',
          triggeredAt: Date.now()
        })
      },
      {
        timezone: scheduleTimezone || 'UTC',
        scheduled: true
      }
    )

    this.cronJobs.set(triggerId, task)
    console.log(`[TriggerManager] Registered cron: ${scheduleCron} (${scheduleTimezone || 'UTC'})`)
  }

  /**
   * Register webhook trigger (cloud-based via api.prompd.app)
   */
  private async registerWebhook(triggerId: string, triggerData: TriggerConfiguration, context: TriggerContext): Promise<void> {
    const { workflowId } = context

    if (!workflowId) {
      throw new Error('workflowId is required in context for webhook triggers')
    }

    // Check if webhook already registered for this workflow
    if (this.webhooks.has(workflowId)) {
      console.log(`[TriggerManager] Webhook already registered for workflow: ${workflowId}`)
      return
    }

    // Register webhook mapping
    this.webhooks.set(workflowId, {
      triggerId,
      workflowId,
      context
    })

    console.log(`[TriggerManager] Registered webhook trigger for workflow: ${workflowId}`)

    // Start webhook client if not already running
    await this.startWebhookClient()
  }

  /**
   * Start webhook client to poll api.prompd.app
   */
  private async startWebhookClient(): Promise<void> {
    if (this.webhookClient?.isActive()) {
      console.log('[TriggerManager] Webhook client already running')
      return
    }

    try {
      const WebhookClientClass = await loadWebhookClient()

      if (!WebhookClientClass) {
        console.warn('[TriggerManager] WebhookClient not available - webhook triggers will not function')
        return
      }

      this.webhookClient = new WebhookClientClass({
        onWebhook: (webhook) => this.handleCloudWebhook(webhook)
      })

      const started = await this.webhookClient.start()

      if (started) {
        console.log(`[TriggerManager] Webhook client started (mode: ${this.webhookClient.getMode()})`)
      } else {
        console.error('[TriggerManager] Failed to start webhook client')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('[TriggerManager] Error starting webhook client:', errorMessage)
    }
  }

  /**
   * Handle webhook from cloud proxy
   */
  private handleCloudWebhook(webhook: WebhookData): void {
    const { workflowId, payload } = webhook

    const webhookConfig = this.webhooks.get(workflowId)

    if (!webhookConfig) {
      console.log(`[TriggerManager] No webhook trigger registered for workflow: ${workflowId}`)
      return
    }

    console.log(`[TriggerManager] Cloud webhook triggered for workflow: ${workflowId}`)

    // Fire trigger
    this.onTrigger(webhookConfig.triggerId, {
      triggerType: 'webhook',
      workflowId,
      payload,
      triggeredAt: Date.now()
    })
  }

  /**
   * Register file watch trigger
   */
  private registerFileWatch(triggerId: string, triggerData: TriggerConfiguration, context: TriggerContext): void {
    const {
      fileWatchPaths,
      fileWatchEvents,
      fileWatchDebounceMs,
      fileWatchIgnoreInitial
    } = triggerData

    if (!fileWatchPaths || fileWatchPaths.length === 0) {
      throw new Error('File watch paths are required')
    }

    // Parse paths (may be JSON string from database)
    const paths = typeof fileWatchPaths === 'string'
      ? JSON.parse(fileWatchPaths)
      : fileWatchPaths

    // Events to watch (default: all)
    const events = fileWatchEvents || ['add', 'change', 'unlink']

    // Create file watcher
    const watcher = chokidar.watch(paths, {
      persistent: true,
      ignoreInitial: fileWatchIgnoreInitial !== false,
      awaitWriteFinish: {
        stabilityThreshold: fileWatchDebounceMs || 2000,
        pollInterval: 100
      }
    })

    // Listen for events
    watcher.on('all', (event, filePath) => {
      if (events.includes(event)) {
        console.log(`[TriggerManager] File ${event}: ${filePath}`)
        this.onTrigger(triggerId, {
          triggerType: 'file-watch',
          event,
          filePath,
          triggeredAt: Date.now()
        })
      }
    })

    // Handle errors
    watcher.on('error', (error) => {
      console.error(`[TriggerManager] File watcher error (${triggerId}):`, error)
    })

    this.fileWatchers.set(triggerId, watcher)
    console.log(`[TriggerManager] Registered file watch: ${paths.join(', ')}`)
  }

  /**
   * Register event trigger
   */
  private registerEvent(triggerId: string, triggerData: TriggerConfiguration, context: TriggerContext): void {
    const { eventName } = triggerData

    if (!eventName) {
      throw new Error('Event name is required')
    }

    // Initialize event listener set if needed
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, new Set())
    }

    // Add trigger to listeners
    this.eventListeners.get(eventName)?.add(triggerId)

    console.log(`[TriggerManager] Registered event listener: ${eventName}`)
  }

  /**
   * Emit an event (for event-type triggers)
   */
  emitEvent(eventName: string, data: Record<string, unknown> = {}): void {
    const listeners = this.eventListeners.get(eventName)
    if (!listeners || listeners.size === 0) {
      console.log(`[TriggerManager] No listeners for event: ${eventName}`)
      return
    }

    console.log(`[TriggerManager] Emitting event: ${eventName} (${listeners.size} listeners)`)

    for (const triggerId of listeners) {
      this.onTrigger(triggerId, {
        triggerType: 'event',
        eventName,
        eventData: data,
        triggeredAt: Date.now()
      })
    }
  }

  /**
   * Unregister a trigger
   */
  async unregister(triggerId: string): Promise<void> {
    console.log(`[TriggerManager] Unregistering trigger: ${triggerId}`)

    // Stop cron job
    if (this.cronJobs.has(triggerId)) {
      this.cronJobs.get(triggerId)?.stop()
      this.cronJobs.delete(triggerId)
      console.log(`[TriggerManager] Stopped cron job: ${triggerId}`)
    }

    // Remove webhook
    for (const [workflowId, webhook] of this.webhooks.entries()) {
      if (webhook.triggerId === triggerId) {
        this.webhooks.delete(workflowId)
        console.log(`[TriggerManager] Removed webhook for workflow: ${workflowId}`)

        // Stop webhook client if no more webhooks
        if (this.webhooks.size === 0 && this.webhookClient) {
          this.webhookClient.stop()
          this.webhookClient = null
          console.log('[TriggerManager] Stopped webhook client (no more webhooks)')
        }
      }
    }

    // Stop file watcher
    if (this.fileWatchers.has(triggerId)) {
      await this.fileWatchers.get(triggerId)?.close()
      this.fileWatchers.delete(triggerId)
      console.log(`[TriggerManager] Stopped file watcher: ${triggerId}`)
    }

    // Remove event listener
    for (const [eventName, listeners] of this.eventListeners.entries()) {
      if (listeners.has(triggerId)) {
        listeners.delete(triggerId)
        console.log(`[TriggerManager] Removed event listener: ${eventName}`)
      }
    }
  }

  /**
   * Get status of all registered triggers
   */
  getStatus(): TriggerStats {
    return {
      cronJobs: this.cronJobs.size,
      webhooks: this.webhooks.size,
      webhookClientActive: this.webhookClient?.isActive() || false,
      webhookClientMode: this.webhookClient?.getMode() || 'disabled',
      fileWatchers: this.fileWatchers.size,
      eventListeners: Array.from(this.eventListeners.values())
        .reduce((total, set) => total + set.size, 0)
    }
  }

  /**
   * Get all registered webhooks
   */
  getWebhooks(): Array<{ workflowId: string; triggerId: string }> {
    return Array.from(this.webhooks.entries()).map(([workflowId, webhook]) => ({
      workflowId,
      triggerId: webhook.triggerId
    }))
  }

  /**
   * Stop all triggers
   */
  async stopAll(): Promise<void> {
    console.log('[TriggerManager] Stopping all triggers...')

    // Stop all cron jobs
    for (const [triggerId, task] of this.cronJobs.entries()) {
      task.stop()
    }
    this.cronJobs.clear()

    // Close all file watchers
    for (const [triggerId, watcher] of this.fileWatchers.entries()) {
      await watcher.close()
    }
    this.fileWatchers.clear()

    // Stop webhook client
    if (this.webhookClient) {
      this.webhookClient.stop()
      this.webhookClient = null
      console.log('[TriggerManager] Stopped webhook client')
    }

    // Clear webhooks
    this.webhooks.clear()

    // Clear event listeners
    this.eventListeners.clear()

    console.log('[TriggerManager] All triggers stopped')
  }

  /**
   * Close trigger manager
   */
  async close(): Promise<void> {
    await this.stopAll()
    this.removeAllListeners()
  }
}

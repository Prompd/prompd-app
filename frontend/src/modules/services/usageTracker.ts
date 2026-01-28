/**
 * Usage Tracker Service
 *
 * Tracks LLM usage locally with offline-first storage.
 * Syncs to backend when online for analytics.
 *
 * Storage: IndexedDB for persistence
 * Sync: Batched uploads when online
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb'

/**
 * Execution record for tracking
 */
export interface ExecutionRecord {
  id: string
  timestamp: number
  provider: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  duration: number
  success: boolean
  error?: string
  executionMode: 'local' | 'remote'
  /** The compiled prompt (if storage enabled) */
  compiledPrompt?: string
  /** The response (if storage enabled) */
  response?: string
  /** File path or context */
  context?: string
  /** Synced to backend */
  synced: boolean
}

/**
 * Chat message record for tracking
 */
export interface ChatMessageRecord {
  id: string
  conversationId: string
  timestamp: number
  role: 'user' | 'assistant' | 'system'
  content: string
  provider?: string
  model?: string
  tokens?: number
  /** Synced to backend */
  synced: boolean
}

/**
 * Usage summary for a time period
 */
export interface UsageSummary {
  totalExecutions: number
  totalTokens: number
  totalPromptTokens: number
  totalCompletionTokens: number
  successCount: number
  errorCount: number
  byProvider: Record<string, {
    executions: number
    tokens: number
    models: Record<string, number>
  }>
  byDay: Record<string, {
    executions: number
    tokens: number
  }>
}

/**
 * Storage settings
 */
export interface UsageStorageSettings {
  /** Store compiled prompts with executions */
  storeCompiledPrompts: boolean
  /** Store LLM responses with executions */
  storeResponses: boolean
  /** Store chat messages */
  storeChatMessages: boolean
  /** Max records to keep (0 = unlimited) */
  maxRecords: number
  /** Auto-sync to backend when online */
  autoSync: boolean
}

const DEFAULT_STORAGE_SETTINGS: UsageStorageSettings = {
  storeCompiledPrompts: true,  // Store compiled prompts for history comparison
  storeResponses: true,         // Store responses for history comparison
  storeChatMessages: true,
  maxRecords: 10000,
  autoSync: true
}

/**
 * IndexedDB Schema
 */
interface UsageDBSchema extends DBSchema {
  executions: {
    key: string
    value: ExecutionRecord
    indexes: {
      'by-timestamp': number
      'by-synced': number
      'by-provider': string
    }
  }
  chatMessages: {
    key: string
    value: ChatMessageRecord
    indexes: {
      'by-timestamp': number
      'by-conversation': string
      'by-synced': number
    }
  }
  settings: {
    key: string
    value: UsageStorageSettings
  }
  syncQueue: {
    key: string
    value: {
      id: string
      type: 'execution' | 'chat'
      recordId: string
      attempts: number
      lastAttempt: number
    }
  }
}

const DB_NAME = 'prompd-usage'
const DB_VERSION = 1

/**
 * Usage Tracker Service
 */
class UsageTrackerService {
  private static instance: UsageTrackerService
  private db: IDBPDatabase<UsageDBSchema> | null = null
  private settings: UsageStorageSettings = DEFAULT_STORAGE_SETTINGS
  private syncInProgress = false
  private onlineHandler: (() => void) | null = null

  private constructor() {}

  static getInstance(): UsageTrackerService {
    if (!UsageTrackerService.instance) {
      UsageTrackerService.instance = new UsageTrackerService()
    }
    return UsageTrackerService.instance
  }

  /**
   * Initialize the database
   */
  async initialize(): Promise<void> {
    if (this.db) return

    try {
      this.db = await openDB<UsageDBSchema>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          // Executions store
          if (!db.objectStoreNames.contains('executions')) {
            const execStore = db.createObjectStore('executions', { keyPath: 'id' })
            execStore.createIndex('by-timestamp', 'timestamp')
            execStore.createIndex('by-synced', 'synced')
            execStore.createIndex('by-provider', 'provider')
          }

          // Chat messages store
          if (!db.objectStoreNames.contains('chatMessages')) {
            const chatStore = db.createObjectStore('chatMessages', { keyPath: 'id' })
            chatStore.createIndex('by-timestamp', 'timestamp')
            chatStore.createIndex('by-conversation', 'conversationId')
            chatStore.createIndex('by-synced', 'synced')
          }

          // Settings store
          if (!db.objectStoreNames.contains('settings')) {
            db.createObjectStore('settings')
          }

          // Sync queue
          if (!db.objectStoreNames.contains('syncQueue')) {
            db.createObjectStore('syncQueue', { keyPath: 'id' })
          }
        }
      })

      // Load settings
      const stored = await this.db.get('settings', 'storage')
      if (stored) {
        this.settings = { ...DEFAULT_STORAGE_SETTINGS, ...stored }
      }

      // Setup online sync listener
      if (this.settings.autoSync) {
        this.setupOnlineSync()
      }

      console.log('[UsageTracker] Initialized')
    } catch (error) {
      console.error('[UsageTracker] Failed to initialize:', error)
    }
  }

  /**
   * Get current storage settings
   */
  getSettings(): UsageStorageSettings {
    return { ...this.settings }
  }

  /**
   * Update storage settings
   */
  async updateSettings(settings: Partial<UsageStorageSettings>): Promise<void> {
    this.settings = { ...this.settings, ...settings }

    if (this.db) {
      await this.db.put('settings', this.settings, 'storage')
    }

    // Update sync listener
    if (settings.autoSync !== undefined) {
      if (settings.autoSync) {
        this.setupOnlineSync()
      } else {
        this.removeOnlineSync()
      }
    }
  }

  /**
   * Record an execution
   */
  async recordExecution(data: Omit<ExecutionRecord, 'id' | 'timestamp' | 'synced'>): Promise<string> {
    await this.initialize()

    const record: ExecutionRecord = {
      ...data,
      id: this.generateId(),
      timestamp: Date.now(),
      synced: false,
      // Only include content if settings allow
      compiledPrompt: this.settings.storeCompiledPrompts ? data.compiledPrompt : undefined,
      response: this.settings.storeResponses ? data.response : undefined
    }

    if (this.db) {
      await this.db.put('executions', record)
      await this.enforceMaxRecords('executions')

      // Queue for sync if online
      if (this.settings.autoSync && navigator.onLine) {
        this.syncToBackend()
      }
    }

    return record.id
  }

  /**
   * Record a chat message
   */
  async recordChatMessage(data: Omit<ChatMessageRecord, 'id' | 'timestamp' | 'synced'>): Promise<string> {
    if (!this.settings.storeChatMessages) {
      return ''
    }

    await this.initialize()

    const record: ChatMessageRecord = {
      ...data,
      id: this.generateId(),
      timestamp: Date.now(),
      synced: false
    }

    if (this.db) {
      await this.db.put('chatMessages', record)
      await this.enforceMaxRecords('chatMessages')
    }

    return record.id
  }

  /**
   * Get execution history
   */
  async getExecutions(options: {
    limit?: number
    offset?: number
    provider?: string
    startDate?: number
    endDate?: number
  } = {}): Promise<ExecutionRecord[]> {
    await this.initialize()
    if (!this.db) return []

    const { limit = 100, offset = 0, provider, startDate, endDate } = options

    let records: ExecutionRecord[]

    if (provider) {
      records = await this.db.getAllFromIndex('executions', 'by-provider', provider)
    } else {
      records = await this.db.getAll('executions')
    }

    // Filter by date range
    if (startDate || endDate) {
      records = records.filter(r => {
        if (startDate && r.timestamp < startDate) return false
        if (endDate && r.timestamp > endDate) return false
        return true
      })
    }

    // Sort by timestamp descending
    records.sort((a, b) => b.timestamp - a.timestamp)

    // Apply pagination
    return records.slice(offset, offset + limit)
  }

  /**
   * Get chat messages for a conversation
   */
  async getChatMessages(conversationId: string): Promise<ChatMessageRecord[]> {
    await this.initialize()
    if (!this.db) return []

    const records = await this.db.getAllFromIndex('chatMessages', 'by-conversation', conversationId)
    return records.sort((a, b) => a.timestamp - b.timestamp)
  }

  /**
   * Get usage summary
   */
  async getSummary(options: {
    startDate?: number
    endDate?: number
  } = {}): Promise<UsageSummary> {
    const executions = await this.getExecutions({
      limit: 100000,
      startDate: options.startDate,
      endDate: options.endDate
    })

    const summary: UsageSummary = {
      totalExecutions: executions.length,
      totalTokens: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      successCount: 0,
      errorCount: 0,
      byProvider: {},
      byDay: {}
    }

    for (const exec of executions) {
      summary.totalTokens += exec.totalTokens
      summary.totalPromptTokens += exec.promptTokens
      summary.totalCompletionTokens += exec.completionTokens

      if (exec.success) {
        summary.successCount++
      } else {
        summary.errorCount++
      }

      // By provider
      if (!summary.byProvider[exec.provider]) {
        summary.byProvider[exec.provider] = { executions: 0, tokens: 0, models: {} }
      }
      summary.byProvider[exec.provider].executions++
      summary.byProvider[exec.provider].tokens += exec.totalTokens
      summary.byProvider[exec.provider].models[exec.model] =
        (summary.byProvider[exec.provider].models[exec.model] || 0) + 1

      // By day
      const day = new Date(exec.timestamp).toISOString().split('T')[0]
      if (!summary.byDay[day]) {
        summary.byDay[day] = { executions: 0, tokens: 0 }
      }
      summary.byDay[day].executions++
      summary.byDay[day].tokens += exec.totalTokens
    }

    return summary
  }

  /**
   * Clear all data
   */
  async clearAll(): Promise<void> {
    await this.initialize()
    if (!this.db) return

    await this.db.clear('executions')
    await this.db.clear('chatMessages')
    await this.db.clear('syncQueue')
  }

  /**
   * Clear old data
   */
  async clearOlderThan(days: number): Promise<number> {
    await this.initialize()
    if (!this.db) return 0

    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000)
    let deleted = 0

    // Clear old executions
    const executions = await this.db.getAll('executions')
    for (const exec of executions) {
      if (exec.timestamp < cutoff) {
        await this.db.delete('executions', exec.id)
        deleted++
      }
    }

    // Clear old chat messages
    const messages = await this.db.getAll('chatMessages')
    for (const msg of messages) {
      if (msg.timestamp < cutoff) {
        await this.db.delete('chatMessages', msg.id)
        deleted++
      }
    }

    return deleted
  }

  /**
   * Get unsynced records count
   */
  async getUnsyncedCount(): Promise<number> {
    await this.initialize()
    if (!this.db) return 0

    const executions = await this.db.getAllFromIndex('executions', 'by-synced', 0)
    const messages = await this.db.getAllFromIndex('chatMessages', 'by-synced', 0)
    return executions.length + messages.length
  }

  /**
   * Manually trigger sync
   */
  async syncToBackend(): Promise<{ synced: number; failed: number }> {
    if (this.syncInProgress || !navigator.onLine) {
      return { synced: 0, failed: 0 }
    }

    this.syncInProgress = true
    let synced = 0
    let failed = 0

    try {
      await this.initialize()
      if (!this.db) return { synced: 0, failed: 0 }

      // Get unsynced executions (synced = false = 0 in index)
      const unsyncedExecs = await this.db.getAllFromIndex('executions', 'by-synced', 0)

      // Batch upload (max 50 at a time)
      const batch = unsyncedExecs.slice(0, 50)

      if (batch.length > 0) {
        try {
          const response = await fetch('/api/usage/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ executions: batch })
          })

          if (response.ok) {
            // Mark as synced
            for (const record of batch) {
              record.synced = true
              await this.db.put('executions', record)
              synced++
            }
          } else {
            failed = batch.length
          }
        } catch {
          // Network error - will retry later
          failed = batch.length
        }
      }
    } finally {
      this.syncInProgress = false
    }

    return { synced, failed }
  }

  /**
   * Export data for backup
   */
  async exportData(): Promise<{
    executions: ExecutionRecord[]
    chatMessages: ChatMessageRecord[]
    settings: UsageStorageSettings
  }> {
    await this.initialize()

    return {
      executions: this.db ? await this.db.getAll('executions') : [],
      chatMessages: this.db ? await this.db.getAll('chatMessages') : [],
      settings: this.settings
    }
  }

  /**
   * Import data from backup
   */
  async importData(data: {
    executions?: ExecutionRecord[]
    chatMessages?: ChatMessageRecord[]
  }): Promise<void> {
    await this.initialize()
    if (!this.db) return

    if (data.executions) {
      for (const record of data.executions) {
        await this.db.put('executions', record)
      }
    }

    if (data.chatMessages) {
      for (const record of data.chatMessages) {
        await this.db.put('chatMessages', record)
      }
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
  }

  private async enforceMaxRecords(store: 'executions' | 'chatMessages'): Promise<void> {
    if (this.settings.maxRecords <= 0 || !this.db) return

    const records = await this.db.getAll(store)
    if (records.length <= this.settings.maxRecords) return

    // Sort by timestamp and delete oldest
    records.sort((a, b) => a.timestamp - b.timestamp)
    const toDelete = records.slice(0, records.length - this.settings.maxRecords)

    for (const record of toDelete) {
      await this.db.delete(store, record.id)
    }
  }

  private setupOnlineSync(): void {
    if (this.onlineHandler) return

    this.onlineHandler = () => {
      if (navigator.onLine) {
        this.syncToBackend()
      }
    }

    window.addEventListener('online', this.onlineHandler)
  }

  private removeOnlineSync(): void {
    if (this.onlineHandler) {
      window.removeEventListener('online', this.onlineHandler)
      this.onlineHandler = null
    }
  }
}

// Export singleton
export const usageTracker = UsageTrackerService.getInstance()

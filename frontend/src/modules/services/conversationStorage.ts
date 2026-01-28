/**
 * Conversation Storage Service
 *
 * Hybrid storage strategy:
 * - IndexedDB: Full conversation data (messages, metadata)
 * - LocalStorage: Quick access metadata for list view
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb'

// ============================================================================
// Types
// ============================================================================

export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  metadata?: Record<string, unknown>
}

// Permission levels for agent mode
export type AgentPermissionLevel = 'auto' | 'confirm' | 'plan'

export interface Conversation {
  id: string
  title: string
  mode: 'agent'  // Unified agent mode (handles create, edit, explore, discuss intents)
  permissionLevel?: AgentPermissionLevel  // User's permission preference for this conversation
  messages: ConversationMessage[]
  createdAt: string
  updatedAt: string
  isPinned: boolean
}

export interface ConversationMeta {
  id: string
  title: string
  mode: 'agent'  // Unified agent mode
  permissionLevel?: AgentPermissionLevel
  createdAt: string
  updatedAt: string
  isPinned: boolean
  messageCount: number
}

interface ConversationDB extends DBSchema {
  conversations: {
    key: string
    value: Conversation
    indexes: {
      'by-updated': string
      'by-created': string
      'by-pinned': number
    }
  }
}

// ============================================================================
// Constants
// ============================================================================

const DB_NAME = 'prompd-conversations'
const DB_VERSION = 1
const STORE_NAME = 'conversations'
const MAX_CONVERSATIONS = 100
const METADATA_STORAGE_KEY = 'prompd:conversation-metadata'

// ============================================================================
// Database Initialization
// ============================================================================

let dbPromise: Promise<IDBPDatabase<ConversationDB>> | null = null

function getDB(): Promise<IDBPDatabase<ConversationDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ConversationDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('by-updated', 'updatedAt')
        store.createIndex('by-created', 'createdAt')
        store.createIndex('by-pinned', 'isPinned')
      }
    })
  }
  return dbPromise
}

// ============================================================================
// Metadata Sync (LocalStorage)
// ============================================================================

function saveMetadata(metadata: ConversationMeta[]): void {
  try {
    localStorage.setItem(METADATA_STORAGE_KEY, JSON.stringify(metadata))
  } catch (error) {
    console.error('Failed to save conversation metadata:', error)
  }
}

function loadMetadata(): ConversationMeta[] {
  try {
    const data = localStorage.getItem(METADATA_STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch (error) {
    console.error('Failed to load conversation metadata:', error)
    return []
  }
}

function updateMetadataEntry(conversation: Conversation): void {
  const metadata = loadMetadata()
  const index = metadata.findIndex(m => m.id === conversation.id)

  const entry: ConversationMeta = {
    id: conversation.id,
    title: conversation.title,
    mode: conversation.mode,
    permissionLevel: conversation.permissionLevel,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    isPinned: conversation.isPinned,
    messageCount: conversation.messages.length
  }

  if (index >= 0) {
    metadata[index] = entry
  } else {
    metadata.push(entry)
  }

  // Sort by pinned first, then by updated date
  metadata.sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })

  saveMetadata(metadata)
}

function removeMetadataEntry(id: string): void {
  const metadata = loadMetadata()
  const filtered = metadata.filter(m => m.id !== id)
  saveMetadata(filtered)
}

// ============================================================================
// Auto-title Generation
// ============================================================================

function generateTitle(firstMessage: string): string {
  // Take first 50 chars of first user message
  const truncated = firstMessage.slice(0, 50).trim()
  return truncated.length < firstMessage.length ? `${truncated}...` : truncated
}

// ============================================================================
// Public API
// ============================================================================

export const conversationStorage = {
  /**
   * Save or update a conversation
   */
  async save(conversation: Conversation): Promise<void> {
    const db = await getDB()
    await db.put(STORE_NAME, conversation)
    updateMetadataEntry(conversation)
  },

  /**
   * Load a conversation by ID
   */
  async load(id: string): Promise<Conversation | null> {
    const db = await getDB()
    const conversation = await db.get(STORE_NAME, id)
    return conversation || null
  },

  /**
   * List all conversations (from localStorage metadata for speed)
   */
  list(): ConversationMeta[] {
    return loadMetadata()
  },

  /**
   * Delete a conversation
   */
  async delete(id: string): Promise<void> {
    const db = await getDB()
    await db.delete(STORE_NAME, id)
    removeMetadataEntry(id)
  },

  /**
   * Update conversation fields
   */
  async update(id: string, updates: Partial<Conversation>): Promise<void> {
    const conversation = await this.load(id)
    if (!conversation) {
      throw new Error(`Conversation ${id} not found`)
    }

    const updated: Conversation = {
      ...conversation,
      ...updates,
      updatedAt: new Date().toISOString()
    }

    await this.save(updated)
  },

  /**
   * Pin or unpin a conversation
   */
  async pin(id: string, isPinned: boolean): Promise<void> {
    await this.update(id, { isPinned })
  },

  /**
   * Rename a conversation
   */
  async rename(id: string, title: string): Promise<void> {
    await this.update(id, { title })
  },

  /**
   * Export conversation to JSON or Markdown
   */
  async export(id: string, format: 'json' | 'markdown'): Promise<string> {
    const conversation = await this.load(id)
    if (!conversation) {
      throw new Error(`Conversation ${id} not found`)
    }

    if (format === 'json') {
      return JSON.stringify(conversation, null, 2)
    }

    // Markdown format
    let markdown = `# ${conversation.title}\n\n`
    markdown += `**Mode:** ${conversation.mode}\n`
    markdown += `**Created:** ${new Date(conversation.createdAt).toLocaleString()}\n`
    markdown += `**Updated:** ${new Date(conversation.updatedAt).toLocaleString()}\n\n`
    markdown += `---\n\n`

    for (const msg of conversation.messages) {
      const roleLabel = msg.role === 'user' ? '👤 User' : msg.role === 'assistant' ? '🤖 Assistant' : '💭 System'
      markdown += `## ${roleLabel}\n\n`
      markdown += `${msg.content}\n\n`
      markdown += `*${new Date(msg.timestamp).toLocaleString()}*\n\n`
      markdown += `---\n\n`
    }

    return markdown
  },

  /**
   * Search conversations by content
   */
  async searchByContent(query: string): Promise<ConversationMeta[]> {
    const db = await getDB()
    const allConversations = await db.getAll(STORE_NAME)
    const lowerQuery = query.toLowerCase()

    const matches = allConversations.filter(conv => {
      // Search in title
      if (conv.title.toLowerCase().includes(lowerQuery)) {
        return true
      }

      // Search in message content
      return conv.messages.some(msg =>
        msg.content.toLowerCase().includes(lowerQuery)
      )
    })

    return matches.map(conv => ({
      id: conv.id,
      title: conv.title,
      mode: conv.mode,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      isPinned: conv.isPinned,
      messageCount: conv.messages.length
    }))
  },

  /**
   * Cleanup old conversations (keep only MAX_CONVERSATIONS)
   */
  async cleanup(): Promise<number> {
    const db = await getDB()
    const allConversations = await db.getAll(STORE_NAME)

    // Sort by pinned (keep pinned), then by updatedAt (oldest first)
    const sorted = allConversations.sort((a, b) => {
      if (a.isPinned !== b.isPinned) {
        return a.isPinned ? -1 : 1
      }
      return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
    })

    // Delete excess conversations (unpinned, oldest first)
    const toDelete = sorted.slice(MAX_CONVERSATIONS)
    let deletedCount = 0

    for (const conv of toDelete) {
      if (!conv.isPinned) {
        await this.delete(conv.id)
        deletedCount++
      }
    }

    return deletedCount
  },

  /**
   * Create a new conversation
   */
  createConversation(
    permissionLevel: AgentPermissionLevel = 'confirm',
    firstMessage?: ConversationMessage
  ): Conversation {
    const now = new Date().toISOString()
    const id = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

    const conversation: Conversation = {
      id,
      title: firstMessage ? generateTitle(firstMessage.content) : 'New Conversation',
      mode: 'agent',  // Always agent mode now
      permissionLevel,
      messages: firstMessage ? [firstMessage] : [],
      createdAt: now,
      updatedAt: now,
      isPinned: false
    }

    return conversation
  },

  /**
   * Add a message to a conversation and save
   */
  async addMessage(
    conversationId: string,
    message: ConversationMessage
  ): Promise<void> {
    const conversation = await this.load(conversationId)
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`)
    }

    conversation.messages.push(message)
    conversation.updatedAt = new Date().toISOString()

    // Auto-update title if it's the first user message
    if (conversation.messages.length === 1 && message.role === 'user') {
      conversation.title = generateTitle(message.content)
    }

    await this.save(conversation)
  }
}

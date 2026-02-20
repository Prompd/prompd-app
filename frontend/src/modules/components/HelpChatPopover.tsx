/**
 * HelpChatPopover
 *
 * Floating popover chat for in-app help, anchored to the bottom-left
 * of the activity bar. Uses the user's configured LLM provider with
 * the help-chat system prompt from the backend.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { X, RotateCcw } from 'lucide-react'
import {
  PrompdProvider,
  PrompdChat,
  type PrompdChatMessage,
  type PrompdChatHandle,
  type IPrompdLLMClient,
  type PrompdLLMRequest,
  type PrompdLLMResponse
} from '@prompd/react'
import { LLMClientRouter } from '../services/llmClientRouter'
import { conversationStorage, type Conversation } from '../services/conversationStorage'
import { useAuthenticatedUser } from '../auth/ClerkWrapper'
import { useUIStore } from '../../stores'
import { logger } from '../lib/logger'
import { getApiBaseUrl } from '../services/apiConfig'

const log = logger.scope('HelpChat')

interface HelpChatPopoverProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * LLM client wrapper that prepends the help-chat system prompt
 */
class HelpChatLLMClient implements IPrompdLLMClient {
  private inner: IPrompdLLMClient
  private systemPrompt: string

  constructor(inner: IPrompdLLMClient, systemPrompt: string) {
    this.inner = inner
    this.systemPrompt = systemPrompt
  }

  async send(request: PrompdLLMRequest): Promise<PrompdLLMResponse> {
    const messages = [
      { role: 'system' as const, content: this.systemPrompt },
      ...request.messages.filter(m => m.role !== 'system')
    ]
    return this.inner.send({ ...request, messages })
  }
}

export function HelpChatPopover({ isOpen, onClose }: HelpChatPopoverProps) {
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null)
  const [promptError, setPromptError] = useState(false)
  const [conversationId, setConversationId] = useState(() => `help-chat-${Date.now()}`)
  const [initialMessages, setInitialMessages] = useState<PrompdChatMessage[]>([])
  const chatRef = useRef<PrompdChatHandle>(null)

  const { getToken } = useAuthenticatedUser()
  const provider = useUIStore(state => state.llmProvider.provider)
  const model = useUIStore(state => state.llmProvider.model)
  const providersWithPricing = useUIStore(state => state.llmProvider.providersWithPricing)
  const theme = useUIStore(state => state.theme)

  // Check if any provider is configured
  const hasProvider = useMemo(() => {
    if (!providersWithPricing) return false
    return providersWithPricing.some(p => p.hasKey)
  }, [providersWithPricing])

  // Fetch the help-chat system prompt from the backend
  useEffect(() => {
    if (!isOpen || systemPrompt !== null) return

    const fetchPrompt = async () => {
      try {
        const rawBase = getApiBaseUrl()
        const base = rawBase === '/api' ? '' : rawBase.replace(/\/api$/, '')
        const res = await fetch(`${base}/api/chat-modes/help-chat`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setSystemPrompt(data.systemPrompt || '')
        log.log('System prompt loaded')
      } catch (err) {
        log.error('Failed to fetch help-chat mode:', err)
        setPromptError(true)
      }
    }
    fetchPrompt()
  }, [isOpen, systemPrompt])

  // Load conversation from storage when ID changes
  useEffect(() => {
    if (!isOpen) return

    const loadConversation = async () => {
      try {
        const existing = await conversationStorage.load(conversationId)
        if (existing?.messages) {
          setInitialMessages(existing.messages.map(m => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
            metadata: m.metadata as PrompdChatMessage['metadata']
          })))
        } else {
          setInitialMessages([])
        }
      } catch {
        setInitialMessages([])
      }
    }
    loadConversation()
  }, [isOpen, conversationId])

  // Build the LLM client with system prompt prepended
  const helpClient = useMemo(() => {
    if (!systemPrompt) return null

    const baseClient = new LLMClientRouter({
      provider,
      model,
      getAuthToken: async () => {
        try {
          return await getToken()
        } catch {
          return null
        }
      }
    })

    return new HelpChatLLMClient(baseClient, systemPrompt)
  }, [systemPrompt, provider, model, getToken])

  // Save messages to conversation storage
  const handleMessage = useCallback(async (message: PrompdChatMessage) => {
    try {
      const existing = await conversationStorage.load(conversationId)
      if (existing) {
        const messages = [...existing.messages, {
          id: message.id,
          role: message.role,
          content: message.content,
          timestamp: message.timestamp,
          metadata: message.metadata as Record<string, unknown> | undefined
        }]
        await conversationStorage.update(conversationId, { messages })
      } else {
        const conversation: Conversation = {
          id: conversationId,
          title: 'Help Chat',
          mode: 'agent',
          messages: [{
            id: message.id,
            role: message.role,
            content: message.content,
            timestamp: message.timestamp,
            metadata: message.metadata as Record<string, unknown> | undefined
          }],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isPinned: false
        }
        await conversationStorage.save(conversation)
      }
    } catch (err) {
      log.error('Failed to save message:', err)
    }
  }, [conversationId])

  // Start a new conversation
  const handleNewChat = useCallback(() => {
    setConversationId(`help-chat-${Date.now()}`)
    setInitialMessages([])
  }, [])

  if (!isOpen) return null

  // No provider configured
  if (!hasProvider) {
    return (
      <>
        <div className="help-chat-backdrop" onClick={onClose} />
        <div className="help-chat-popover">
          <div className="help-chat-popover-header">
            <h3>Ask Prompd</h3>
            <button className="ab-item" style={{ width: 28, height: 28 }} onClick={onClose} title="Close">
              <X size={14} color="var(--muted)" />
            </button>
          </div>
          <div className="help-chat-popover-body" style={{ alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
            <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.6 }}>
              Configure an API key in Settings to use the help chat.
            </p>
          </div>
        </div>
      </>
    )
  }

  // Still loading system prompt
  if (!helpClient) {
    return (
      <>
        <div className="help-chat-backdrop" onClick={onClose} />
        <div className="help-chat-popover">
          <div className="help-chat-popover-header">
            <h3>Ask Prompd</h3>
            <button className="ab-item" style={{ width: 28, height: 28 }} onClick={onClose} title="Close">
              <X size={14} color="var(--muted)" />
            </button>
          </div>
          <div className="help-chat-popover-body" style={{ alignItems: 'center', justifyContent: 'center' }}>
            {promptError ? (
              <p style={{ color: 'var(--error)', fontSize: 13, padding: 24, textAlign: 'center' }}>
                Failed to load help chat configuration.
              </p>
            ) : (
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading...</p>
            )}
          </div>
        </div>
      </>
    )
  }

  const emptyStateContent = (
    <div style={{ textAlign: 'center', padding: '24px 16px' }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', margin: '0 0 8px' }}>
        How can I help?
      </p>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
        Ask me about workflows, .prmd files, the editor, deployment, or anything else in Prompd.
      </p>
    </div>
  )

  return (
    <>
      <div className="help-chat-backdrop" onClick={onClose} />
      <div className="help-chat-popover">
        <div className="help-chat-popover-header">
          <h3>Ask Prompd</h3>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              className="ab-item"
              style={{ width: 28, height: 28 }}
              onClick={handleNewChat}
              title="New Chat"
            >
              <RotateCcw size={13} color="var(--muted)" />
            </button>
            <button
              className="ab-item"
              style={{ width: 28, height: 28 }}
              onClick={onClose}
              title="Close"
            >
              <X size={14} color="var(--muted)" />
            </button>
          </div>
        </div>
        <div className="help-chat-popover-body">
          <PrompdProvider
            apiBaseUrl=""
            defaultLLMClient={helpClient}
            mode="consumer"
            theme={theme}
          >
            <PrompdChat
              ref={chatRef}
              sessionId={conversationId}
              initialMessages={initialMessages}
              emptyStateContent={emptyStateContent}
              modes={[]}
              onMessage={handleMessage}
            />
          </PrompdProvider>
        </div>
      </div>
    </>
  )
}

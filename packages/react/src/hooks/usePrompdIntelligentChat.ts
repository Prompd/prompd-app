import { useState, useCallback } from 'react'
import type {
  PrompdChatMessage
} from '../types'

export interface IntelligentChatMessage extends PrompdChatMessage {
  intent?: string
  confidence?: number
  metadata?: {
    intent?: string
    confidence?: number
    action?: any
    [key: string]: any
  }
}

export interface IntelligentChatFile {
  path: string
  content?: string
}

export interface UsePrompdIntelligentChatOptions {
  apiBaseUrl?: string
  onIntentDetected?: (intent: string, confidence: number) => void
  onError?: (error: Error) => void
}

export interface UsePrompdIntelligentChatReturn {
  messages: IntelligentChatMessage[]
  sessionId: string
  isLoading: boolean
  sendMessage: (content: string, files?: IntelligentChatFile[]) => Promise<void>
  clearMessages: () => void
  currentIntent: string | null
}

export function usePrompdIntelligentChat(
  initialSessionId?: string,
  options: UsePrompdIntelligentChatOptions = {}
): UsePrompdIntelligentChatReturn {
  const {
    apiBaseUrl = '/api',
    onIntentDetected,
    onError
  } = options

  const [messages, setMessages] = useState<IntelligentChatMessage[]>([])
  const [sessionId] = useState(initialSessionId || generateSessionId())
  const [isLoading, setIsLoading] = useState(false)
  const [currentIntent, setCurrentIntent] = useState<string | null>(null)

  const sendMessage = useCallback(async (content: string, files?: IntelligentChatFile[]) => {
    if (!content.trim() || isLoading) return

    const userMessage: IntelligentChatMessage = {
      id: generateMessageId(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date().toISOString()
    }

    setMessages(prev => [...prev, userMessage])
    setIsLoading(true)

    try {
      // Build conversation history
      const conversationHistory = messages.map(m => ({
        role: m.role,
        content: m.content
      }))

      // Call intelligent chat API
      const response = await fetch(`${apiBaseUrl}/intelligent-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: content.trim(),
          sessionId,
          conversationHistory,
          files
        })
      })

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`)
      }

      const data = await response.json()

      // Update current intent
      if (data.intent) {
        setCurrentIntent(data.intent)
        if (onIntentDetected) {
          onIntentDetected(data.intent, data.confidence || 0)
        }
      }

      const assistantMessage: IntelligentChatMessage = {
        id: generateMessageId(),
        role: 'assistant',
        content: data.message,
        timestamp: new Date().toISOString(),
        intent: data.intent,
        confidence: data.confidence,
        metadata: {
          intent: data.intent,
          confidence: data.confidence,
          action: data.action,
          ...data.metadata
        }
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('Failed to send message:', error)

      if (onError && error instanceof Error) {
        onError(error)
      }

      const errorMessage: IntelligentChatMessage = {
        id: generateMessageId(),
        role: 'system',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to send message'}`,
        timestamp: new Date().toISOString()
      }

      setMessages(prev => [...prev, errorMessage])
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [messages, isLoading, sessionId, apiBaseUrl, onIntentDetected, onError])

  const clearMessages = useCallback(() => {
    setMessages([])
    setCurrentIntent(null)
  }, [])

  return {
    messages,
    sessionId,
    isLoading,
    sendMessage,
    clearMessages,
    currentIntent
  }
}

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

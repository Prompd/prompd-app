import { useState, useCallback } from 'react'
import type {
  UsePrompdChatReturn,
  PrompdChatMessage,
  LLMMessage
} from '../types'
import { usePrompdLLMClient } from '../context/PrompdContext'

export function usePrompdChat(initialSessionId?: string): UsePrompdChatReturn {
  const llmClient = usePrompdLLMClient()
  const [messages, setMessages] = useState<PrompdChatMessage[]>([])
  const [sessionId] = useState(initialSessionId || generateSessionId())
  const [isLoading, setIsLoading] = useState(false)

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return

    const userMessage: PrompdChatMessage = {
      id: generateMessageId(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date().toISOString()
    }

    setMessages(prev => [...prev, userMessage])
    setIsLoading(true)

    try {
      // Build conversation history
      const llmMessages: LLMMessage[] = [
        ...messages.map(m => ({
          role: m.role === 'system' ? ('system' as const) : m.role === 'user' ? ('user' as const) : ('assistant' as const),
          content: m.content
        })),
        {
          role: 'user' as const,
          content: userMessage.content
        }
      ]

      // Send to LLM
      const response = await llmClient.send({
        messages: llmMessages
      })

      const assistantMessage: PrompdChatMessage = {
        id: generateMessageId(),
        role: 'assistant',
        content: response.content,
        timestamp: new Date().toISOString(),
        metadata: {
          provider: response.provider,
          model: response.model,
          usage: response.usage
        }
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('Failed to send message:', error)

      const errorMessage: PrompdChatMessage = {
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
  }, [llmClient, messages, isLoading])

  const clearMessages = useCallback(() => {
    setMessages([])
  }, [])

  return {
    messages,
    sessionId,
    isLoading,
    sendMessage,
    clearMessages
  }
}

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

import { useState, useRef, useEffect } from 'react'
import { SendHorizontal, Loader2, RefreshCw, CheckCircle } from 'lucide-react'
import { streamConversation, extractPrompd, clearConversation, Message } from '../services/conversationalAi'
import { usePrompdUsage } from '@prompd/react'

interface ConversationalChatProps {
  getToken: () => Promise<string>
  onPrompdGenerated: (prompd: string) => void
  provider?: 'anthropic' | 'openai'
  model?: string
}

export function ConversationalChat({ getToken, onPrompdGenerated, provider = 'anthropic', model }: ConversationalChatProps) {
  const { trackUsage } = usePrompdUsage()
  const [messages, setMessages] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [generatedPrompd, setGeneratedPrompd] = useState<string | null>(null)
  const [conversationStats, setConversationStats] = useState({
    totalTokens: 0,
    totalCost: 0,
    turns: 0
  })
  const [lastTurnMetadata, setLastTurnMetadata] = useState<any>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const currentStreamRef = useRef<string>('')

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Start with a greeting
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: "Hi! I'm here to help you create a Prompd file. What kind of prompt would you like to build today?"
      }])
    }
  }, [])

  const handleSend = async () => {
    if (!inputMessage.trim() || isStreaming) return

    const userMessage = inputMessage.trim()
    setInputMessage('')
    setIsStreaming(true)

    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])

    // Prepare for assistant response
    currentStreamRef.current = ''
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    try {
      await streamConversation(
        userMessage,
        conversationId,
        getToken,
        { provider, model },
        (event) => {
          if (event.type === 'conversation_id') {
            setConversationId(event.conversationId!)
          }

          if (event.type === 'content') {
            currentStreamRef.current += event.content
            // Update the last message with streaming content
            setMessages(prev => {
              const newMessages = [...prev]
              const lastIndex = newMessages.length - 1
              if (newMessages[lastIndex]?.role === 'assistant') {
                newMessages[lastIndex] = {
                  role: 'assistant',
                  content: currentStreamRef.current
                }
              }
              return newMessages
            })
          }

          if (event.type === 'done') {
            // Save metadata from this turn
            if (event.metadata) {
              setLastTurnMetadata(event.metadata)

              // Update conversation stats
              setConversationStats(prev => ({
                totalTokens: prev.totalTokens + (event.metadata?.tokensUsed?.total || 0),
                totalCost: prev.totalCost + (event.metadata?.estimatedCost || 0),
                turns: prev.turns + 1
              }))

              // Track usage for global stats
              if (event.metadata.tokensUsed) {
                trackUsage(
                  'generation',
                  provider,
                  event.metadata.model || model || 'unknown',
                  event.metadata.tokensUsed.input || 0,
                  event.metadata.tokensUsed.output || 0,
                  { source: 'conversational-chat' }
                )
              }
            }

            // Check for generated prompd
            if (event.hasGeneratedPrompd) {
              const prompd = extractPrompd(event.fullResponse || currentStreamRef.current)
              if (prompd) {
                setGeneratedPrompd(prompd)
              }
            }
          }

          if (event.type === 'error') {
            setMessages(prev => {
              const newMessages = [...prev]
              const lastIndex = newMessages.length - 1
              if (newMessages[lastIndex]?.role === 'assistant') {
                newMessages[lastIndex] = {
                  role: 'assistant',
                  content: `❌ Error: ${event.error}`
                }
              }
              return newMessages
            })
          }
        }
      )
    } catch (error) {
      console.error('Send message error:', error)
      setMessages(prev => {
        const newMessages = [...prev]
        const lastIndex = newMessages.length - 1
        if (newMessages[lastIndex]?.role === 'assistant') {
          newMessages[lastIndex] = {
            role: 'assistant',
            content: `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        }
        return newMessages
      })
    } finally {
      setIsStreaming(false)
    }
  }

  const handleReset = async () => {
    if (conversationId) {
      await clearConversation(conversationId, getToken)
    }
    setMessages([{
      role: 'assistant',
      content: "Conversation reset. What kind of prompt would you like to build?"
    }])
    setConversationId(null)
    setGeneratedPrompd(null)
    setConversationStats({ totalTokens: 0, totalCost: 0, turns: 0 })
    currentStreamRef.current = ''
  }

  const handleUseGenerated = () => {
    if (generatedPrompd) {
      // Note: Metadata tracking happens in stats display below, callback only receives prompd content
      onPrompdGenerated(generatedPrompd)
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '500px',
      backgroundColor: 'var(--bg)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'var(--bg-secondary)'
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>AI Conversation</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
            Chat to create your .prmd file
          </p>
        </div>
        <button
          onClick={handleReset}
          disabled={isStreaming}
          title="Start new conversation"
          style={{
            padding: '6px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            backgroundColor: 'var(--bg)',
            color: 'var(--text)',
            cursor: isStreaming ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            opacity: isStreaming ? 0.5 : 1
          }}
        >
          <RefreshCw size={14} />
          Reset
        </button>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        {messages.map((msg, index) => (
          <div
            key={index}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start'
            }}
          >
            <div style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              marginBottom: '4px'
            }}>
              {msg.role === 'user' ? 'You' : 'AI Assistant'}
            </div>
            <div style={{
              maxWidth: '80%',
              padding: '10px 14px',
              borderRadius: '12px',
              backgroundColor: msg.role === 'user' ? 'var(--primary)' : 'var(--bg-secondary)',
              color: msg.role === 'user' ? 'white' : 'var(--text)',
              fontSize: '14px',
              lineHeight: '1.5',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}>
              {msg.content || (
                <span style={{ opacity: 0.5 }}>...</span>
              )}
            </div>
          </div>
        ))}

        {isStreaming && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: 'var(--text-secondary)',
            fontSize: '14px'
          }}>
            <Loader2 size={16} className="animate-spin" />
            <span>AI is typing...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Generated Prompd Banner */}
      {generatedPrompd && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: 'var(--success-bg)',
          borderTop: '1px solid var(--border)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--success)' }}>
            <CheckCircle size={16} />
            <span style={{ fontSize: '14px', fontWeight: 600 }}>
              .prmd file generated!
            </span>
          </div>
          <button
            onClick={handleUseGenerated}
            style={{
              padding: '6px 12px',
              backgroundColor: 'var(--success)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Use This File
          </button>
        </div>
      )}

      {/* Conversation Stats */}
      {conversationStats.turns > 0 && (
        <div style={{
          padding: '8px 16px',
          borderTop: '1px solid var(--border)',
          backgroundColor: 'rgba(59, 130, 246, 0.05)',
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '12px',
          color: 'var(--text-secondary)'
        }}>
          <span>{conversationStats.turns} {conversationStats.turns === 1 ? 'exchange' : 'exchanges'}</span>
          <span>{conversationStats.totalTokens.toLocaleString()} tokens</span>
          <span>${conversationStats.totalCost.toFixed(4)}</span>
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: '16px',
        borderTop: '1px solid var(--border)',
        backgroundColor: 'var(--bg)',
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-end'
      }}>
        <div style={{
          flex: 1,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Ask me to create a prompt... (Shift+Enter for new line)"
            disabled={isStreaming}
            rows={1}
            style={{
              width: '100%',
              minHeight: '44px',
              maxHeight: '210px',
              padding: '12px 16px',
              border: '2px solid var(--border)',
              borderRadius: '12px',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text)',
              fontSize: '14px',
              fontFamily: 'inherit',
              outline: 'none',
              transition: 'all 0.2s ease',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
              resize: 'none',
              overflow: 'auto',
              lineHeight: '1.5'
            }}
            onInput={(e) => {
              const target = e.currentTarget
              target.style.height = 'auto'
              target.style.height = Math.min(target.scrollHeight, 210) + 'px'
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent)'
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}
          />
          <div style={{
            position: 'absolute',
            bottom: '-20px',
            left: '4px',
            fontSize: '11px',
            color: 'var(--text-secondary)',
            fontStyle: 'italic',
            opacity: 0.7
          }}>
            Press Enter to send
          </div>
        </div>
        <button
          onClick={handleSend}
          disabled={!inputMessage.trim() || isStreaming}
          style={{
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            backgroundColor: inputMessage.trim() && !isStreaming ? 'var(--accent)' : 'var(--bg-secondary)',
            color: inputMessage.trim() && !isStreaming ? 'white' : 'var(--text-secondary)',
            border: '2px solid',
            borderColor: inputMessage.trim() && !isStreaming ? 'var(--accent)' : 'var(--border)',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: (!inputMessage.trim() || isStreaming) ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: inputMessage.trim() && !isStreaming ? '0 2px 8px rgba(59, 130, 246, 0.3)' : 'none',
            minWidth: '80px'
          }}
          onMouseEnter={(e) => {
            if (inputMessage.trim() && !isStreaming) {
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.4)'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = inputMessage.trim() && !isStreaming ? '0 2px 8px rgba(59, 130, 246, 0.3)' : 'none'
          }}
        >
          {isStreaming ? <Loader2 size={16} className="animate-spin" /> : <SendHorizontal size={16} />}
          {!isStreaming && 'Send'}
        </button>
      </div>
    </div>
  )
}

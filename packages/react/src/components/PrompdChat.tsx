import { useState, useRef, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react'
import type {
  PrompdChatProps,
  PrompdChatMessage,
  PrompdChatHandle
} from '../types'
import { usePrompd } from '../context/PrompdContext'
import { PrompdMessages } from './PrompdMessages'
import { PrompdChatInput } from './PrompdChatInput'
import { PrompdModeDropdown } from './PrompdModeDropdown'
import { clsx } from 'clsx'

export const PrompdChat = forwardRef<PrompdChatHandle, PrompdChatProps>(function PrompdChat({
  sessionId: initialSessionId,
  llmClient: customLLMClient,
  resultDisplay: customResultDisplay,
  onMessage,
  className,
  emptyStateContent,
  currentMode,
  modes,
  onModeChange,
  initialMessages,
  inputValue: controlledInputValue,
  onInputChange: controlledOnInputChange,
  leftControls: customLeftControls,
  onBeforeSubmit,
  aboveInput,
  inputTheme = 'default',
  generationMode,
  waitingForUserInput = false,
  onStop,
  hideModeSelector = false
}, ref) {
  const { llmClient: defaultLLMClient } = usePrompd()

  const [messages, setMessages] = useState<PrompdChatMessage[]>(initialMessages || [])
  const [uncontrolledInput, setUncontrolledInput] = useState('')

  // History of sent prompts for up/down arrow navigation
  const [inputHistory, setInputHistory] = useState<string[]>([])
  const MAX_HISTORY_SIZE = 50

  // Support both controlled and uncontrolled input modes
  const isControlled = controlledInputValue !== undefined
  const input = isControlled ? controlledInputValue : uncontrolledInput
  const setInput = isControlled ? (controlledOnInputChange || (() => {})) : setUncontrolledInput
  const [isLoading, setIsLoading] = useState(false)
  const isLoadingRef = useRef(false) // Ref for imperative handle
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const previousSessionIdRef = useRef<string | undefined>(initialSessionId)

  const llmClient = customLLMClient || defaultLLMClient

  // Keep isLoadingRef in sync
  useEffect(() => {
    isLoadingRef.current = isLoading
  }, [isLoading])


  // Sync messages when sessionId changes OR when initialMessages becomes available for the first time
  // This handles both loading different conversations and initial async load
  useEffect(() => {
    const sessionChanged = initialSessionId !== previousSessionIdRef.current
    const hasInitialMessages = initialMessages && initialMessages.length > 0
    const currentlyEmpty = messages.length === 0

    if (sessionChanged) {
      console.log('[PrompdChat] Session changed from', previousSessionIdRef.current, 'to', initialSessionId)
      previousSessionIdRef.current = initialSessionId
      // Load new messages or clear for new session
      setMessages(initialMessages || [])
    } else if (hasInitialMessages && currentlyEmpty) {
      // Initial async load - messages just became available while we're still on same session
      console.log('[PrompdChat] Loading initial messages for session', initialSessionId)
      setMessages(initialMessages)
    }
  }, [initialSessionId, initialMessages, messages.length])

  // Suppress unused variable warnings for optional props
  void customResultDisplay

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Core message sending logic - used by both handleSubmit and imperative sendMessage
  // showUserMessage: if true, shows user bubble; if false, sends as hidden context (for tool results)
  const sendMessageInternal = useCallback(async (content: string, showUserMessage: boolean = true) => {
    if (!content.trim() || isLoadingRef.current) return

    // Add to input history for up/down arrow navigation (only for visible user messages)
    if (showUserMessage) {
      setInputHistory(prev => {
        const trimmed = content.trim()
        // Don't add duplicates of the most recent entry
        if (prev.length > 0 && prev[prev.length - 1] === trimmed) {
          return prev
        }
        const newHistory = [...prev, trimmed]
        // Limit history size
        if (newHistory.length > MAX_HISTORY_SIZE) {
          return newHistory.slice(-MAX_HISTORY_SIZE)
        }
        return newHistory
      })
    }

    const userMessage: PrompdChatMessage = {
      id: generateMessageId(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date().toISOString()
    }

    // Add thinking message
    const thinkingMessageId = 'thinking-' + Date.now()
    const thinkingMessage: PrompdChatMessage = {
      id: thinkingMessageId,
      role: 'assistant',
      content: 'Thinking...',
      timestamp: new Date().toISOString(),
      metadata: { isThinking: true, icon: '...' }
    }

    // Only show user message bubble if showUserMessage is true
    if (showUserMessage) {
      setMessages(prev => [...prev, userMessage, thinkingMessage])
      if (onMessage) {
        onMessage(userMessage)
      }
    } else {
      // Hidden context (tool results from agent loop) — persist in state
      // so subsequent LLM calls include the full conversation history.
      // Marked hidden so the UI doesn't render them as chat bubbles.
      const hiddenMessage: PrompdChatMessage = { ...userMessage, metadata: { hidden: true } }
      setMessages(prev => [...prev, hiddenMessage, thinkingMessage])
    }

    setIsLoading(true)
    isLoadingRef.current = true

    try {
      // Send to LLM - get current messages from state
      const currentMessages = await new Promise<PrompdChatMessage[]>(resolve => {
        setMessages(prev => {
          resolve(prev.filter(m => m.id !== thinkingMessageId))
          return prev
        })
      })

      // Build messages array for LLM.
      // Both visible and hidden messages are already in state,
      // so currentMessages contains the full conversation history
      // including the message we just added above.
      const llmMessages = currentMessages
        .filter(m => !(m.metadata && 'isThinking' in m.metadata && m.metadata.isThinking))
        .filter(m => m.metadata?.type !== 'thinking-content')
        .map(m => ({
          role: m.role,
          content: m.content
        }))

      // Pre-allocate IDs for streaming messages
      const streamingThinkingMsgId = generateMessageId()
      const streamingAssistantMsgId = generateMessageId()
      let thinkingStarted = false
      let contentStarted = false

      // Character-drip streaming buffer.
      // HTTP data arrives in large infrequent bursts from the IPC layer, so simple
      // frame-rate coalescing still looks choppy. Instead, we queue all incoming text
      // and release a fixed number of characters per animation frame, creating a
      // smooth, consistent typewriter effect regardless of network burst patterns.
      const textQueue = { thinking: '', content: '' }
      let dripFrameId: number | null = null
      const CHARS_PER_FRAME = 8 // ~480 chars/sec at 60fps — matches typical LLM output speed

      const applyThinking = (text: string) => {
        if (!thinkingStarted) {
          thinkingStarted = true
          setMessages(prev => {
            const filtered = prev.filter(m => m.id !== thinkingMessageId)
            return [...filtered, {
              id: streamingThinkingMsgId,
              role: 'assistant' as const,
              content: text,
              timestamp: new Date().toISOString(),
              metadata: { type: 'thinking-content' },
              isStreaming: true
            }]
          })
        } else {
          setMessages(prev => prev.map(m =>
            m.id === streamingThinkingMsgId
              ? { ...m, content: m.content + text }
              : m
          ))
        }
      }

      const applyContent = (text: string) => {
        if (!contentStarted) {
          contentStarted = true
          setMessages(prev => {
            const filtered = !thinkingStarted
              ? prev.filter(m => m.id !== thinkingMessageId)
              : prev
            return [...filtered, {
              id: streamingAssistantMsgId,
              role: 'assistant' as const,
              content: text,
              timestamp: new Date().toISOString(),
              isStreaming: true
            }]
          })
        } else {
          setMessages(prev => prev.map(m =>
            m.id === streamingAssistantMsgId
              ? { ...m, content: m.content + text }
              : m
          ))
        }
      }

      const dripLoop = () => {
        const bufferSize = textQueue.thinking.length + textQueue.content.length
        // Adaptive speed: ramp up linearly as buffer grows to prevent falling behind
        const speed = CHARS_PER_FRAME * (1 + Math.floor(bufferSize / 200))

        if (textQueue.thinking.length > 0) {
          const n = Math.min(textQueue.thinking.length, speed)
          const released = textQueue.thinking.slice(0, n)
          textQueue.thinking = textQueue.thinking.slice(n)
          applyThinking(released)
        }

        if (textQueue.content.length > 0) {
          const n = Math.min(textQueue.content.length, speed)
          const released = textQueue.content.slice(0, n)
          textQueue.content = textQueue.content.slice(n)
          applyContent(released)
        }

        // Keep dripping while there's text in the queue
        if (textQueue.thinking.length > 0 || textQueue.content.length > 0) {
          dripFrameId = requestAnimationFrame(dripLoop)
        } else {
          dripFrameId = null
        }
      }

      const onChunk = (chunk: { content?: string; thinking?: string; done: boolean }) => {
        if (chunk.done) {
          // Flush ALL remaining text immediately on done
          if (dripFrameId !== null) {
            cancelAnimationFrame(dripFrameId)
            dripFrameId = null
          }
          if (textQueue.thinking) { applyThinking(textQueue.thinking); textQueue.thinking = '' }
          if (textQueue.content) { applyContent(textQueue.content); textQueue.content = '' }
          return
        }

        if (chunk.thinking) textQueue.thinking += chunk.thinking
        if (chunk.content) textQueue.content += chunk.content

        // Start the drip loop if not already running
        if (dripFrameId === null) {
          dripFrameId = requestAnimationFrame(dripLoop)
        }
      }

      const response = await llmClient.send({
        messages: llmMessages,
        ...(generationMode ? { mode: generationMode } : {}),
        onChunk
      })

      if (contentStarted || thinkingStarted) {
        // Streaming was active — finalize messages with metadata
        setMessages(prev => {
          let result = prev.filter(m => m.id !== thinkingMessageId)
          return result.map(m => {
            if (m.id === streamingAssistantMsgId) {
              return {
                ...m,
                isStreaming: false,
                content: response.content,
                metadata: {
                  ...response.metadata,
                  provider: response.provider,
                  model: response.model,
                  usage: response.usage
                }
              }
            }
            if (m.id === streamingThinkingMsgId) {
              return { ...m, isStreaming: false }
            }
            return m
          })
        })

        if (onMessage) {
          onMessage({
            id: streamingAssistantMsgId,
            role: 'assistant',
            content: response.content,
            timestamp: new Date().toISOString(),
            metadata: {
              ...response.metadata,
              provider: response.provider,
              model: response.model,
              usage: response.usage
            }
          })
        }
      } else {
        // Non-streaming fallback — onChunk was never called
        const thinking = response.thinking || (response.metadata?.thinking as string | undefined)
        const assistantMessage: PrompdChatMessage = {
          id: generateMessageId(),
          role: 'assistant',
          content: response.content,
          timestamp: new Date().toISOString(),
          metadata: {
            ...response.metadata,
            provider: response.provider,
            model: response.model,
            usage: response.usage,
          }
        }

        const newMessages: PrompdChatMessage[] = []
        if (thinking) {
          newMessages.push({
            id: generateMessageId(),
            role: 'assistant',
            content: thinking,
            timestamp: new Date().toISOString(),
            metadata: { type: 'thinking-content' }
          })
        }
        newMessages.push(assistantMessage)

        if (response.metadata?.messageAlreadyRendered) {
          setMessages(prev => prev.filter(m => m.id !== thinkingMessageId))
        } else {
          setMessages(prev => prev.filter(m => m.id !== thinkingMessageId).concat(newMessages))
        }

        if (onMessage) {
          onMessage(assistantMessage)
        }
      }

      // If the agent is waiting for user input (ask_user tool call), stop loading to allow input
      if (response.metadata?.waitingForInput ||
          (Array.isArray(response.metadata?.toolCalls) && response.metadata.toolCalls.some((tc: any) => tc.name === 'ask_user'))) {
        console.log('[PrompdChat] Agent waiting for input - enabling chat input')
        setIsLoading(false)
        isLoadingRef.current = false
      }
    } catch (error) {
      console.error('Failed to send message:', error)

      const errorMessage: PrompdChatMessage = {
        id: generateMessageId(),
        role: 'system',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to send message'}`,
        timestamp: new Date().toISOString()
      }

      // Remove thinking message and add error
      setMessages(prev => prev.filter(m => m.id !== thinkingMessageId).concat(errorMessage))
    } finally {
      setIsLoading(false)
      isLoadingRef.current = false
    }
  }, [llmClient, onMessage, generationMode])

  const handleSubmit = async () => {
    console.log('[PrompdChat] handleSubmit called - isLoading:', isLoading, 'waitingForUserInput:', waitingForUserInput, 'input:', input.slice(0, 30))
    // Allow submission when waiting for user input (ask_user tool) even if isLoading is true
    const effectivelyLoading = isLoading && !waitingForUserInput
    if (!input.trim() || effectivelyLoading) {
      console.log('[PrompdChat] handleSubmit early return - effectivelyLoading:', effectivelyLoading, 'hasInput:', !!input.trim())
      return
    }
    const content = input.trim()

    // Allow parent to intercept (e.g., for slash commands or ask_user responses)
    if (onBeforeSubmit) {
      console.log('[PrompdChat] Calling onBeforeSubmit with:', content.slice(0, 30))
      const consumed = await onBeforeSubmit(content)
      console.log('[PrompdChat] onBeforeSubmit returned:', consumed)
      if (consumed) {
        // Parent handled it, don't send to LLM
        setInput('') // Clear input since parent consumed it
        return
      }
    }

    setInput('')
    await sendMessageInternal(content)
  }

  // Ref for focusing the input (exposed via inputRef prop on PrompdChatInput)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Expose imperative handle for programmatic control
  useImperativeHandle(ref, () => ({
    sendMessage: async (content: string) => {
      console.log('[PrompdChat] sendMessage called programmatically:', content)
      await sendMessageInternal(content, true)
    },
    continueWithContext: async (context: string) => {
      console.log('[PrompdChat] continueWithContext called - hidden context for LLM')
      await sendMessageInternal(context, false)
    },
    clearMessages: () => {
      setMessages([])
    },
    isLoading: () => isLoadingRef.current,
    addMessage: (message: PrompdChatMessage) => {
      console.log('[PrompdChat] addMessage called:', message.id, message.role, message.metadata && 'type' in message.metadata ? message.metadata.type : 'no-type')
      setMessages(prev => [...prev, message])
    },
    updateMessage: (messageId: string, updates: Partial<PrompdChatMessage>) => {
      console.log('[PrompdChat] updateMessage called:', messageId, updates)
      setMessages(prev => prev.map(msg =>
        msg.id === messageId ? { ...msg, ...updates } : msg
      ))
    },
    focusInput: () => {
      console.log('[PrompdChat] focusInput called')
      inputRef.current?.focus()
    }
  }), [sendMessageInternal])

  const handleExpandResult = (executionId: string) => {
    // TODO: Fetch execution result and display using resultDisplay
    console.log('Expand result:', executionId)
  }

  return (
    <div className={clsx('prompd-chat flex flex-col h-full', className)}>
      {/* Messages Container - Centered with max width */}
      <div className="prompd-messages flex-1 overflow-y-auto px-4 py-6" style={messages.length === 0 ? { height: '100%' } : undefined}>
        <div className="prompd-messages-inner mx-auto" style={{ maxWidth: '800px', ...(messages.length === 0 ? { height: '100%' } : {}) }}>
          {messages.length === 0 ? (
            emptyStateContent ? (
              <div className="prompd-custom-empty-state" style={{ height: '100%' }}>{emptyStateContent}</div>
            ) : (
              <EmptyState />
            )
          ) : (
            <PrompdMessages
              messages={messages}
              onExpandResult={handleExpandResult}
            />
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Above Input - Custom content slot between messages and input */}
      {aboveInput && (
        <div className="prompd-above-input">
          {aboveInput}
        </div>
      )}

      {/* Input Container - Centered with max width */}
      <div className="prompd-input-container" style={{
        borderTop: '1px solid var(--prompd-border)',
        padding: '1.5rem',
        background: 'var(--prompd-panel)',
        backdropFilter: 'blur(4px)'
      }}>
        <div className="prompd-input-wrapper mx-auto" style={{ maxWidth: '800px' }}>
          <PrompdChatInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            isLoading={isLoading && !waitingForUserInput}
            onStop={onStop}
            inputRef={inputRef}
            inputTheme={inputTheme}
            history={inputHistory}
            leftControls={
              customLeftControls ?? (
                !hideModeSelector && currentMode && modes && modes.length > 0 && onModeChange ? (
                  <PrompdModeDropdown
                    currentMode={currentMode}
                    modes={modes}
                    onModeChange={onModeChange}
                  />
                ) : undefined
              )
            }
          />
        </div>
      </div>
    </div>
  )
})

function EmptyState() {
  return (
    <div className="prompd-empty-state flex flex-col items-center justify-center h-full text-center px-4">
      <div className="mb-6">
        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-500 via-purple-600 to-pink-600 animate-gradient-shift flex items-center justify-center">
          <span className="text-4xl">✨</span>
        </div>
        <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--prompd-text)' }}>
          Welcome to Prompd
        </h2>
        <p className="max-w-md mx-auto" style={{ color: 'var(--prompd-muted)' }}>
          Start a conversation or describe what you'd like to accomplish
        </p>
      </div>

      {/* Suggested Prompts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl w-full">
        {suggestedPrompts.map((prompt, index) => (
          <button
            key={index}
            className="prompd-suggested-prompt p-4 rounded-xl text-left transition-all transform hover:scale-105 hover:shadow-lg"
            style={{
              background: 'var(--prompd-panel)',
              border: '2px solid var(--prompd-border)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--prompd-accent)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--prompd-border)'
            }}
          >
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--prompd-text)' }}>
              {prompt.title}
            </p>
            <p className="text-xs" style={{ color: 'var(--prompd-muted)' }}>
              {prompt.description}
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}

const suggestedPrompts = [
  {
    title: 'Analyze code for security',
    description: 'Find vulnerabilities in your codebase'
  },
  {
    title: 'Generate documentation',
    description: 'Create comprehensive docs from code'
  },
  {
    title: 'Review pull request',
    description: 'Get AI-powered code review feedback'
  },
  {
    title: 'Explain complex code',
    description: 'Understand difficult code sections'
  }
]

function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
}

/**
 * useAgentChat Hook
 *
 * Shared hook for agent chat functionality used by both AiChatPanel and ChatTab.
 * Handles:
 * - XML response parsing
 * - Agent loop with tool execution
 * - Plan mode batch approvals
 * - ask_user tool handling
 * - Permission level enforcement
 * - Retry logic for malformed responses
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { type PrompdLLMRequest, type PrompdLLMResponse, type PrompdChatHandle, type UsageEventType } from '@prompd/react'
import { createToolExecutor, type IToolExecutor, type ToolCall, type ToolResult } from '../services/toolExecutor'
import { parseAgentResponse, serializeToolResults, XML_FORMAT_REMINDER } from '../services/agentXmlParser'
import type { AgentPermissionLevel } from '../services/conversationStorage'
import type { ChatModeConfig } from '../services/chatModesApi'

// ============================================================================
// Types
// ============================================================================

// Interface for LLM clients that can be wrapped by the agent
export interface AgentCompatibleLLMClient {
  send: (request: PrompdLLMRequest) => Promise<PrompdLLMResponse>
  configure: (config: Record<string, unknown>) => void
  getConfig: () => object
}

export interface UseAgentChatOptions {
  workspacePath?: string | null
  permissionLevel: AgentPermissionLevel
  chatModes: Record<string, ChatModeConfig> | null
  chatMode: string
  getToken: () => Promise<string | null>
  trackUsage?: (
    type: UsageEventType,
    provider: string,
    model: string,
    promptTokens: number,
    completionTokens: number,
    metadata?: Record<string, unknown>
  ) => void
  showNotification?: (message: string, type?: 'info' | 'warning' | 'error') => void
  onFileWritten?: (path: string, content: string) => void
}

export interface AgentChatState {
  pendingAskUser: {
    question: string
    resolve: (answer: string) => void
  } | null
  pendingPlanApproval: {
    toolCalls: Array<{ tool: string; params: Record<string, unknown> }>
    agentMessage: string
    resolve: (approved: boolean, reason?: string) => void
  } | null
  isAgentLoopActive: boolean
}

export interface AgentChatActions {
  // Create an LLM client wrapper that handles agent logic
  createAgentLLMClient: (
    baseClient: AgentCompatibleLLMClient,
    chatRef: React.RefObject<PrompdChatHandle>,
    contextMessages?: Array<{ role: 'system'; content: string }>
  ) => AgentCompatibleLLMClient
  // Cancel pending ask_user
  cancelAskUser: () => void
  // Get tool executor
  getToolExecutor: () => IToolExecutor | null
}

// ============================================================================
// Hook
// ============================================================================

export function useAgentChat(options: UseAgentChatOptions): [AgentChatState, AgentChatActions] {
  const {
    workspacePath,
    permissionLevel,
    chatModes,
    chatMode,
    getToken,
    trackUsage,
    showNotification,
    onFileWritten
  } = options

  // Refs
  const toolExecutorRef = useRef<IToolExecutor | null>(null)
  const agentLoopActiveRef = useRef(false)
  const agentLoopRetryCountRef = useRef(0)
  const lastToolResultsXmlRef = useRef<string | null>(null)
  const permissionLevelRef = useRef<AgentPermissionLevel>(permissionLevel)
  const chatModesRef = useRef<Record<string, ChatModeConfig> | null>(chatModes)

  const MAX_AGENT_LOOP_RETRIES = 2

  // State
  const [pendingAskUser, setPendingAskUser] = useState<{
    question: string
    resolve: (answer: string) => void
  } | null>(null)

  const [pendingPlanApproval, setPendingPlanApproval] = useState<{
    toolCalls: Array<{ tool: string; params: Record<string, unknown> }>
    agentMessage: string
    resolve: (approved: boolean, reason?: string) => void
  } | null>(null)

  // Sync refs
  useEffect(() => {
    permissionLevelRef.current = permissionLevel
  }, [permissionLevel])

  useEffect(() => {
    chatModesRef.current = chatModes
  }, [chatModes])

  // Initialize tool executor
  useEffect(() => {
    toolExecutorRef.current = createToolExecutor(workspacePath || undefined)
    console.log('[useAgentChat] Tool executor initialized:', toolExecutorRef.current?.platform)
  }, [workspacePath])

  // Cancel ask_user
  const cancelAskUser = useCallback(() => {
    if (pendingAskUser) {
      pendingAskUser.resolve('[User cancelled the request]')
      setPendingAskUser(null)
    }
  }, [pendingAskUser])

  // Get tool executor
  const getToolExecutor = useCallback(() => toolExecutorRef.current, [])

  // Create agent LLM client wrapper
  const createAgentLLMClient = useCallback((
    baseClient: AgentCompatibleLLMClient,
    chatRef: React.RefObject<PrompdChatHandle>,
    contextMessages?: Array<{ role: 'system'; content: string }>
  ): AgentCompatibleLLMClient => {
    const send = async (request: PrompdLLMRequest): Promise<PrompdLLMResponse> => {
      // Build messages with system prompt
      const systemMessages: Array<{ role: 'system'; content: string }> = []

      // Get mode-specific system prompt from backend config
      const modes = chatModesRef.current
      const modeConfig = modes?.[chatMode]
      if (modeConfig?.systemPrompt) {
        systemMessages.push({
          role: 'system' as const,
          content: modeConfig.systemPrompt
        })
      }

      // Add any context messages (file content, etc.)
      if (contextMessages) {
        systemMessages.push(...contextMessages)
      }

      // Combine with request messages
      const messagesWithContext = [...systemMessages, ...request.messages]

      console.log('[useAgentChat] Sending to LLM')

      const response = await baseClient.send({
        ...request,
        messages: messagesWithContext
      })

      // Track usage
      if (trackUsage && response.usage) {
        trackUsage(
          'chat',
          response.provider,
          response.model,
          response.usage.promptTokens,
          response.usage.completionTokens,
          { mode: chatMode }
        )
      }

      console.log('[useAgentChat] Raw response:', response.content.slice(0, 200))

      // Parse XML response
      const parseResult = parseAgentResponse(response.content)

      if (!parseResult.success) {
        // Check if we're in an agent loop and LLM broke format
        if (agentLoopActiveRef.current && parseResult.isPlainText) {
          console.log('[useAgentChat] LLM broke XML format during agent loop! Attempting retry...')

          if (agentLoopRetryCountRef.current < MAX_AGENT_LOOP_RETRIES) {
            agentLoopRetryCountRef.current++
            console.log(`[useAgentChat] Agent loop retry ${agentLoopRetryCountRef.current}/${MAX_AGENT_LOOP_RETRIES}`)

            // Add a message indicating we're retrying
            chatRef.current?.addMessage({
              id: `retry_${Date.now()}`,
              role: 'assistant',
              content: 'Retrying... (LLM format correction)',
              timestamp: new Date().toISOString(),
              metadata: { type: 'system-retry' }
            })

            // Retry with format reminder
            const retryMessages = [
              ...messagesWithContext,
              { role: 'user' as const, content: lastToolResultsXmlRef.current || '' },
              { role: 'user' as const, content: XML_FORMAT_REMINDER }
            ]

            const retryResponse = await baseClient.send({
              ...request,
              messages: retryMessages
            })

            // Try parsing the retry response
            const retryParseResult = parseAgentResponse(retryResponse.content)
            if (retryParseResult.success && retryParseResult.data) {
              // Success! Process the parsed response
              return await processAgentResponse(retryResponse, retryParseResult.data, chatRef)
            }
          }

          // Exhausted retries - fall through to plain text handling
          console.log('[useAgentChat] Exhausted retries, returning as conversational response')
          agentLoopActiveRef.current = false
          agentLoopRetryCountRef.current = 0
        }

        // Plain text response - return as-is
        return response
      }

      // Successfully parsed XML
      const parsed = parseResult.data!
      return await processAgentResponse(response, parsed, chatRef)
    }

    // Process parsed agent response
    const processAgentResponse = async (
      response: PrompdLLMResponse,
      parsed: {
        message: string
        toolCalls: Array<{ tool: string; params: Record<string, unknown> }>
        done: boolean
        suggestion?: { type: string; content?: string; filename?: string }
      },
      chatRef: React.RefObject<PrompdChatHandle>
    ): Promise<PrompdLLMResponse> => {
      console.log('[useAgentChat] Parsed response:', {
        message: parsed.message.slice(0, 100),
        toolCalls: parsed.toolCalls.length,
        done: parsed.done
      })

      // Check if done
      if (parsed.done) {
        console.log('[useAgentChat] Agent signaled done - resetting state')
        agentLoopActiveRef.current = false
        agentLoopRetryCountRef.current = 0

        return {
          ...response,
          content: parsed.message,
          metadata: {
            ...response.metadata,
            suggestion: parsed.suggestion || null,
            toolCalls: [],
            done: true
          }
        }
      }

      // Handle tool calls
      if (parsed.toolCalls.length > 0) {
        agentLoopActiveRef.current = true
        agentLoopRetryCountRef.current = 0

        // Check permission level for tool execution
        const currentPermLevel = permissionLevelRef.current
        const needsApproval = parsed.toolCalls.some(tc =>
          ['write_file', 'edit_file', 'run_command'].includes(tc.tool)
        )

        if (needsApproval && currentPermLevel !== 'auto') {
          // Wait for plan approval
          console.log(`[useAgentChat] Plan mode: requesting approval for ${parsed.toolCalls.length} tool(s)`)

          const approvalResult = await new Promise<{ approved: boolean; reason?: string }>((resolve) => {
            setPendingPlanApproval({
              toolCalls: parsed.toolCalls,
              agentMessage: parsed.message,
              resolve: (approved, reason) => {
                setPendingPlanApproval(null)
                resolve({ approved, reason })
              }
            })
          })

          if (!approvalResult.approved) {
            // User rejected - if they provided feedback, continue the loop with their feedback
            console.log('[useAgentChat] Plan rejected by user:', approvalResult.reason)

            if (approvalResult.reason) {
              // Add rejection notice as system message
              chatRef.current?.addMessage({
                id: `plan_rejected_${Date.now()}`,
                role: 'system',
                content: '',
                timestamp: new Date().toISOString(),
                metadata: {
                  type: 'tool-execution',
                  toolName: 'plan',
                  toolParams: { actions: parsed.toolCalls.length },
                  status: 'rejected',
                  error: approvalResult.reason
                }
              })

              // Continue agent loop by sending user's feedback as the next message
              // This allows the LLM to revise its plan based on user feedback
              console.log('[useAgentChat] Continuing agent loop with user feedback')
              setTimeout(() => {
                chatRef.current?.continueWithContext(
                  `<plan_rejected>\n<reason>${approvalResult.reason}</reason>\n<instruction>Revise your plan based on this feedback and try again.</instruction>\n</plan_rejected>`
                )
              }, 100)

              // Return the original message - the loop will continue with the feedback
              return {
                ...response,
                content: parsed.message,
                metadata: {
                  ...response.metadata,
                  toolCalls: parsed.toolCalls,
                  rejected: true,
                  rejectionReason: approvalResult.reason
                }
              }
            }

            // No feedback provided - just stop
            return {
              ...response,
              content: parsed.message + '\n\n*Plan was rejected by user.*',
              metadata: {
                ...response.metadata,
                toolCalls: parsed.toolCalls,
                rejected: true
              }
            }
          }

          console.log('[useAgentChat] Plan approved - executing tools')
        }

        // Execute tool calls
        const toolResults: Array<{ id: string; tool: string; result: ToolResult }> = []

        for (let i = 0; i < parsed.toolCalls.length; i++) {
          const tc = parsed.toolCalls[i]
          const toolId = `tool_${Date.now()}_${i}`
          const startTime = Date.now()

          console.log(`[useAgentChat] Executing tool ${i + 1}/${parsed.toolCalls.length}: ${tc.tool}`)

          // Add running message
          chatRef.current?.addMessage({
            id: toolId,
            role: 'system',
            content: '',
            timestamp: new Date().toISOString(),
            metadata: {
              type: 'tool-execution',
              toolName: tc.tool,
              toolParams: tc.params,
              status: 'running'
            }
          })

          // Handle ask_user specially
          if (tc.tool === 'ask_user') {
            const question = tc.params.question as string
            console.log('[useAgentChat] ask_user - pausing for user input:', question)

            // Wait for user response
            const answer = await new Promise<string>((resolve) => {
              setPendingAskUser({ question, resolve })
            })
            setPendingAskUser(null)

            chatRef.current?.updateMessage(toolId, {
              metadata: {
                type: 'tool-execution',
                toolName: tc.tool,
                toolParams: tc.params,
                status: 'success',
                result: answer,
                duration: Date.now() - startTime
              }
            })

            toolResults.push({
              id: toolId,
              tool: tc.tool,
              result: { success: true, output: answer }
            })
            continue
          }

          // Execute other tools
          try {
            const executor = toolExecutorRef.current
            if (!executor) {
              throw new Error('Tool executor not initialized')
            }

            const toolCall: ToolCall = {
              id: toolId,
              tool: tc.tool,
              params: tc.params
            }

            const result = await executor.execute(toolCall)

            // Update message with result
            chatRef.current?.updateMessage(toolId, {
              metadata: {
                type: 'tool-execution',
                toolName: tc.tool,
                toolParams: tc.params,
                status: result.success ? 'success' : 'error',
                result: result.success ? JSON.stringify(result.output, null, 2) : undefined,
                error: result.error,
                duration: Date.now() - startTime
              }
            })

            toolResults.push({ id: toolId, tool: tc.tool, result })

            // Handle file writes
            if (result.success && (tc.tool === 'write_file' || tc.tool === 'edit_file')) {
              const filePath = tc.params.path as string
              if (onFileWritten) {
                // Read the updated content
                const readResult = await executor.execute({
                  id: `read_${Date.now()}`,
                  tool: 'read_file',
                  params: { path: filePath }
                })
                if (readResult.success && readResult.output) {
                  // read_file returns { content, path } - extract the content string
                  const fileContent = (readResult.output as { content: string }).content
                  onFileWritten(filePath, fileContent)
                }
              }
            }
          } catch (error) {
            chatRef.current?.updateMessage(toolId, {
              metadata: {
                type: 'tool-execution',
                toolName: tc.tool,
                toolParams: tc.params,
                status: 'error',
                error: error instanceof Error ? error.message : 'Unknown error',
                duration: Date.now() - startTime
              }
            })

            toolResults.push({
              id: toolId,
              tool: tc.tool,
              result: {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
              }
            })
          }
        }

        // Store tool results for potential retry
        const toolResultsXml = serializeToolResults(toolResults.map(tr => ({
          id: tr.id,
          tool: tr.tool,
          success: tr.result.success,
          output: tr.result.output,
          error: tr.result.error
        })))
        lastToolResultsXmlRef.current = toolResultsXml

        // Continue agent loop by sending tool results back
        setTimeout(() => {
          chatRef.current?.continueWithContext(toolResultsXml)
        }, 100)

        // Return the message part of the response
        return {
          ...response,
          content: parsed.message,
          metadata: {
            ...response.metadata,
            suggestion: parsed.suggestion || null,
            toolCalls: parsed.toolCalls
          }
        }
      }

      // No tool calls - return as conversational response
      return {
        ...response,
        content: parsed.message,
        metadata: {
          ...response.metadata,
          suggestion: parsed.suggestion || null
        }
      }
    }

    return {
      send,
      configure: baseClient.configure.bind(baseClient),
      getConfig: baseClient.getConfig.bind(baseClient)
    }
  }, [chatMode, trackUsage, onFileWritten])

  const state: AgentChatState = {
    pendingAskUser,
    pendingPlanApproval,
    isAgentLoopActive: agentLoopActiveRef.current
  }

  const actions: AgentChatActions = {
    createAgentLLMClient,
    cancelAskUser,
    getToolExecutor
  }

  return [state, actions]
}

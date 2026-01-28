/**
 * useAgentMode Hook
 *
 * Agent hook for tool execution:
 * 1. User sends message
 * 2. Backend returns LLM response (may include tool calls)
 * 3. Frontend executes tools locally via toolExecutor
 * 4. Tool results sent back to continue the loop
 * 5. Loop until done or max iterations
 *
 * Provides same interface as useAgentChat for component compatibility.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { type PrompdLLMRequest, type PrompdLLMResponse, type PrompdChatHandle, type UsageEventType } from '@prompd/react'
import {
  createToolExecutor,
  type IToolExecutor,
  type ToolCall,
  type ToolResult
} from '../services/toolExecutor'
import {
  parseAgentResponse,
  serializeToolResults,
  XML_FORMAT_REMINDER,
  type ParsedAgentResponse
} from '../services/agentXmlParser'
import type { AgentPermissionLevel } from '../services/conversationStorage'
import type { ChatModeConfig } from '../services/chatModesApi'

// ============================================================================
// Types
// ============================================================================

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  toolCalls?: ToolCall[]
  toolResults?: Array<{ id: string; result: ToolResult }>
}

// Interface for LLM clients that can be wrapped by the agent
export interface AgentCompatibleLLMClient {
  send: (request: PrompdLLMRequest) => Promise<PrompdLLMResponse>
  configure: (config: Record<string, unknown>) => void
  getConfig: () => object
}

export interface AgentState {
  isRunning: boolean
  isPaused: boolean
  iteration: number
  pendingApproval: ToolCall | null
  /** All pending tool calls when in plan mode - allows batched approval */
  pendingApprovals: ToolCall[]
  /** Pending ask_user question waiting for user input */
  pendingAskUser: {
    question: string
    resolve: (answer: string) => void
  } | null
  /** Pending plan approval waiting for user decision */
  pendingPlanApproval: {
    toolCalls: Array<{ tool: string; params: Record<string, unknown> }>
    agentMessage: string
    resolve: (approved: boolean, reason?: string, filteredToolCalls?: Array<{ tool: string; params: Record<string, unknown> }>) => void
  } | null
  /** Whether agent loop is currently active */
  isAgentLoopActive: boolean
  error: string | null
}

export interface UseAgentModeOptions {
  userId?: string
  sessionId?: string
  provider?: string
  model?: string
  workspacePath?: string | null
  permissionLevel: AgentPermissionLevel
  chatModes?: Record<string, ChatModeConfig> | null
  chatMode?: string
  maxIterations?: number
  getToken?: () => Promise<string | null>
  trackUsage?: (
    type: UsageEventType,
    provider: string,
    model: string,
    promptTokens: number,
    completionTokens: number,
    metadata?: Record<string, unknown>
  ) => void
  showNotification?: (message: string, type?: 'info' | 'warning' | 'error') => void
  onMessage?: (message: AgentMessage) => void
  onToolExecution?: (tool: string, params: Record<string, unknown>) => void
  onComplete?: () => void
  onError?: (error: string) => void
  onFileWritten?: (path: string, content: string) => void
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
  // Undo last file operation
  undo: () => Promise<{ success: boolean; message: string; path?: string; content?: string }>
  // Legacy methods for direct control
  start: (userMessage: string) => void
  approve: () => Promise<void>
  reject: (reason?: string) => void
  stop: () => void
}

// ============================================================================
// Hook
// ============================================================================

export function useAgentMode(options: UseAgentModeOptions): [AgentState, AgentChatActions] {
  const {
    workspacePath,
    permissionLevel,
    chatModes,
    chatMode = 'agent',
    trackUsage,
    onToolExecution,
    onFileWritten
  } = options

  // State
  const [state, setState] = useState<AgentState>({
    isRunning: false,
    isPaused: false,
    iteration: 0,
    pendingApproval: null,
    pendingApprovals: [],
    pendingAskUser: null,
    pendingPlanApproval: null,
    isAgentLoopActive: false,
    error: null
  })

  // Constants
  const MAX_AGENT_LOOP_RETRIES = 2

  // Refs
  const toolExecutorRef = useRef<IToolExecutor | null>(null)
  const abortRef = useRef(false)
  const agentLoopActiveRef = useRef(false)
  const agentLoopRetryCountRef = useRef(0)
  const lastToolResultsXmlRef = useRef<string | null>(null)
  const permissionLevelRef = useRef<AgentPermissionLevel>(permissionLevel)
  const chatModesRef = useRef<Record<string, ChatModeConfig> | null>(chatModes || null)
  // Ref to store results from auto-executed reads while waiting for write approval
  const pendingAutoResultsRef = useRef<Array<{ id: string; tool: string; result: ToolResult }>>([])
  // Ref to track onFileWritten callback to avoid stale closures
  const onFileWrittenRef = useRef(onFileWritten)

  // Sync refs with props
  useEffect(() => {
    permissionLevelRef.current = permissionLevel
  }, [permissionLevel])

  useEffect(() => {
    chatModesRef.current = chatModes || null
  }, [chatModes])

  useEffect(() => {
    onFileWrittenRef.current = onFileWritten
  }, [onFileWritten])

  // Initialize tool executor
  useEffect(() => {
    toolExecutorRef.current = createToolExecutor(workspacePath || undefined)
    console.log('[useAgentMode] Tool executor initialized:', toolExecutorRef.current?.platform)
  }, [workspacePath])

  // Get tools that require approval based on permission level
  const getApprovalRequiredTools = useCallback((): string[] => {
    const level = permissionLevelRef.current
    switch (level) {
      case 'auto':
        return [] // No approval needed
      case 'confirm':
      case 'plan':
        // Both confirm and plan: approve writes and commands, auto-execute reads
        return ['write_file', 'edit_file', 'run_command']
      default:
        // Default case: be safe and require approval for all write operations
        return ['write_file', 'edit_file', 'run_command']
    }
  }, [])

  // Check if tool requires approval
  const requiresApproval = useCallback((toolName: string): boolean => {
    return getApprovalRequiredTools().includes(toolName)
  }, [getApprovalRequiredTools])

  // Cancel ask_user
  const cancelAskUser = useCallback(() => {
    setState(s => {
      if (s.pendingAskUser) {
        s.pendingAskUser.resolve('[User cancelled the request]')
      }
      return { ...s, pendingAskUser: null }
    })
  }, [])

  // Get tool executor
  const getToolExecutor = useCallback(() => toolExecutorRef.current, [])

  // Execute tool calls
  const executeToolCalls = useCallback(async (
    toolCalls: Array<{ tool: string; params: Record<string, unknown> }>,
    chatRef: React.RefObject<PrompdChatHandle>
  ): Promise<Array<{ id: string; tool: string; result: ToolResult }>> => {
    if (!toolExecutorRef.current) {
      console.error('[useAgentMode] Tool executor not initialized')
      return []
    }

    // Reset abort flag at start of execution
    abortRef.current = false

    const autoResults: Array<{ id: string; tool: string; result: ToolResult }> = []
    const writeResults: Array<{ id: string; tool: string; result: ToolResult }> = []

    // Separate tools into those needing approval and those that don't
    const needsApproval: Array<{ tool: string; params: Record<string, unknown> }> = []
    const autoExecute: Array<{ tool: string; params: Record<string, unknown> }> = []

    for (const call of toolCalls) {
      if (requiresApproval(call.tool)) {
        needsApproval.push(call)
      } else {
        autoExecute.push(call)
      }
    }

    // Execute auto-approved tools first (reads)
    for (let i = 0; i < autoExecute.length; i++) {
      if (abortRef.current) break

      const call = autoExecute[i]
      const toolId = `tool_${Date.now()}_${i}`
      const startTime = Date.now()

      onToolExecution?.(call.tool, call.params)
      console.log(`[useAgentMode] Auto-executing tool: ${call.tool}`, call.params)

      // Handle ask_user specially
      if (call.tool === 'ask_user') {
        const question = call.params.question as string
        console.log('[useAgentMode] ask_user - pausing for user input:', question)

        // Add a message showing the ask_user request
        chatRef.current?.addMessage({
          id: toolId,
          role: 'system',
          content: '',
          timestamp: new Date().toISOString(),
          metadata: {
            type: 'tool-execution',
            toolName: call.tool,
            toolParams: call.params,
            status: 'running'
          }
        })

        // Wait for user response via Promise that will be resolved by the UI
        const answer = await new Promise<string>((resolve) => {
          setState(s => ({ ...s, pendingAskUser: { question, resolve } }))
        })
        setState(s => ({ ...s, pendingAskUser: null }))

        chatRef.current?.updateMessage(toolId, {
          metadata: {
            type: 'tool-execution',
            toolName: call.tool,
            toolParams: call.params,
            status: 'success',
            result: answer,
            duration: Date.now() - startTime
          }
        })

        autoResults.push({
          id: toolId,
          tool: call.tool,
          result: { success: true, output: answer }
        })
        continue
      }

      // Add running message
      chatRef.current?.addMessage({
        id: toolId,
        role: 'system',
        content: '',
        timestamp: new Date().toISOString(),
        metadata: {
          type: 'tool-execution',
          toolName: call.tool,
          toolParams: call.params,
          status: 'running'
        }
      })

      try {
        const toolCall: ToolCall = {
          id: toolId,
          tool: call.tool,
          params: call.params
        }

        const result = await toolExecutorRef.current.execute(toolCall)

        // Update message with result
        chatRef.current?.updateMessage(toolId, {
          metadata: {
            type: 'tool-execution',
            toolName: call.tool,
            toolParams: call.params,
            status: result.success ? 'success' : 'error',
            result: result.success ? JSON.stringify(result.output, null, 2) : undefined,
            error: result.error,
            duration: Date.now() - startTime
          }
        })

        autoResults.push({ id: toolId, tool: call.tool, result })
      } catch (error) {
        chatRef.current?.updateMessage(toolId, {
          metadata: {
            type: 'tool-execution',
            toolName: call.tool,
            toolParams: call.params,
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
            duration: Date.now() - startTime
          }
        })

        autoResults.push({
          id: toolId,
          tool: call.tool,
          result: {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        })
      }
    }

    // If any tools need approval, wait for plan approval
    if (needsApproval.length > 0) {
      console.log(`[useAgentMode] ${needsApproval.length} tool(s) require approval:`, needsApproval.map(t => t.tool))
      pendingAutoResultsRef.current = autoResults // Store read results

      const approvalResult = await new Promise<{
        approved: boolean
        reason?: string
        filteredToolCalls?: Array<{ tool: string; params: Record<string, unknown> }>
      }>((resolve) => {
        // Create proper ToolCall objects with generated IDs for UI display
        const toolCallsWithIds: ToolCall[] = needsApproval.map((tc, idx) => ({
          id: `pending_${Date.now()}_${idx}`,
          tool: tc.tool,
          params: tc.params
        }))

        setState(s => ({
          ...s,
          isPaused: true,
          pendingApproval: toolCallsWithIds[0],
          pendingApprovals: toolCallsWithIds,
          pendingPlanApproval: {
            toolCalls: needsApproval,
            agentMessage: '', // Will be set by caller if needed
            resolve: (approved, reason, filteredToolCalls) => {
              setState(s => ({
                ...s,
                isPaused: false,
                pendingApproval: null,
                pendingApprovals: [],
                pendingPlanApproval: null
              }))
              resolve({ approved, reason, filteredToolCalls })
            }
          }
        }))
      })

      if (!approvalResult.approved) {
        // User rejected
        console.log('[useAgentMode] Plan rejected by user:', approvalResult.reason)

        // Include results from auto-executed reads
        const allResults = [...pendingAutoResultsRef.current]
        pendingAutoResultsRef.current = []

        // Add rejection results for write tools
        for (let i = 0; i < needsApproval.length; i++) {
          const call = needsApproval[i]
          const toolId = `rejected_${Date.now()}_${i}`
          const rejectionResult: ToolResult = {
            success: false,
            error: approvalResult.reason
              ? `User rejected: ${approvalResult.reason}`
              : 'User rejected the operation'
          }

          // Add rejection message
          chatRef.current?.addMessage({
            id: toolId,
            role: 'system',
            content: '',
            timestamp: new Date().toISOString(),
            metadata: {
              type: 'tool-execution',
              toolName: call.tool,
              toolParams: call.params,
              status: 'rejected',
              error: rejectionResult.error
            }
          })

          allResults.push({ id: toolId, tool: call.tool, result: rejectionResult })
        }

        return allResults
      }

      // Approved - execute write tools (use filtered list if provided)
      const toolsToExecute = approvalResult.filteredToolCalls || needsApproval
      console.log(`[useAgentMode] Plan approved - executing ${toolsToExecute.length} write tools`)

      for (let i = 0; i < toolsToExecute.length; i++) {
        if (abortRef.current) break

        const call = toolsToExecute[i]
        const toolId = `write_${Date.now()}_${i}`
        const startTime = Date.now()

        onToolExecution?.(call.tool, call.params)
        console.log(`[useAgentMode] Executing approved tool: ${call.tool}`, call.params)

        // Add running message
        chatRef.current?.addMessage({
          id: toolId,
          role: 'system',
          content: '',
          timestamp: new Date().toISOString(),
          metadata: {
            type: 'tool-execution',
            toolName: call.tool,
            toolParams: call.params,
            status: 'running'
          }
        })

        try {
          const toolCall: ToolCall = {
            id: toolId,
            tool: call.tool,
            params: call.params
          }

          const result = await toolExecutorRef.current!.execute(toolCall)

          // Update message with result
          chatRef.current?.updateMessage(toolId, {
            metadata: {
              type: 'tool-execution',
              toolName: call.tool,
              toolParams: call.params,
              status: result.success ? 'success' : 'error',
              result: result.success ? JSON.stringify(result.output, null, 2) : undefined,
              error: result.error,
              duration: Date.now() - startTime
            }
          })

          writeResults.push({ id: toolId, tool: call.tool, result })

          // Handle file writes - notify parent to update tabs
          if (result.success && (call.tool === 'write_file' || call.tool === 'edit_file')) {
            const filePath = call.params.path as string
            console.log('[useAgentMode] File written, notifying parent:', filePath)
            const fileWrittenCallback = onFileWrittenRef.current
            if (fileWrittenCallback) {
              try {
                // Read the updated content
                const readResult = await toolExecutorRef.current!.execute({
                  id: `read_${Date.now()}`,
                  tool: 'read_file',
                  params: { path: filePath }
                })
                if (readResult.success && readResult.output) {
                  // read_file returns { content, path } - extract the content string
                  const fileContent = (readResult.output as { content: string }).content
                  console.log('[useAgentMode] Calling onFileWritten callback with path:', filePath, 'content length:', fileContent.length)
                  fileWrittenCallback(filePath, fileContent)
                } else {
                  console.warn('[useAgentMode] Failed to read file after write:', readResult.error)
                }
              } catch (readError) {
                console.error('[useAgentMode] Failed to read file after write:', readError)
                // Don't fail the whole operation if read-back fails
              }
            } else {
              console.warn('[useAgentMode] No onFileWritten callback registered')
            }
          }
        } catch (error) {
          chatRef.current?.updateMessage(toolId, {
            metadata: {
              type: 'tool-execution',
              toolName: call.tool,
              toolParams: call.params,
              status: 'error',
              error: error instanceof Error ? error.message : 'Unknown error',
              duration: Date.now() - startTime
            }
          })

          writeResults.push({
            id: toolId,
            tool: call.tool,
            result: {
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error'
            }
          })
        }
      }

      // Combine auto-executed results with write results
      const allResults = [...pendingAutoResultsRef.current, ...writeResults]
      pendingAutoResultsRef.current = []
      return allResults
    }

    return autoResults
  }, [requiresApproval, onToolExecution])

  // Create agent LLM client wrapper - this wraps the base client to add agent functionality
  const createAgentLLMClient = useCallback((
    baseClient: AgentCompatibleLLMClient,
    chatRef: React.RefObject<PrompdChatHandle>,
    contextMessages?: Array<{ role: 'system'; content: string }>
  ): AgentCompatibleLLMClient => {
    // Helper to process a parsed agent response
    const processAgentResponse = async (
      response: PrompdLLMResponse,
      parsed: ParsedAgentResponse
    ): Promise<PrompdLLMResponse> => {
      console.log('[useAgentMode] Parsed response:', {
        message: parsed.message.slice(0, 100),
        toolCalls: parsed.toolCalls.length,
        done: parsed.done
      })

      // Check if done
      if (parsed.done) {
        console.log('[useAgentMode] Agent signaled done - resetting state')
        agentLoopActiveRef.current = false
        agentLoopRetryCountRef.current = 0
        setState(s => ({ ...s, isAgentLoopActive: false }))

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
        setState(s => ({ ...s, isAgentLoopActive: true }))

        // Execute tool calls
        console.log('[useAgentMode] Processing', parsed.toolCalls.length, 'tool calls')
        const toolResults = await executeToolCalls(parsed.toolCalls, chatRef)

        // Check if any were rejected
        const hasRejection = toolResults.some(r => !r.result.success && r.result.error?.includes('rejected'))

        if (hasRejection) {
          // Find the rejection reason
          const rejection = toolResults.find(r => r.result.error?.includes('rejected'))
          const reason = rejection?.result.error?.replace('User rejected: ', '') || ''

          if (reason && reason !== 'User rejected the operation') {
            // User provided feedback - continue the loop with feedback
            console.log('[useAgentMode] Continuing agent loop with user feedback')

            // Serialize tool results as XML
            const toolResultsXml = serializeToolResults(toolResults.map(tr => ({
              tool: tr.tool,
              success: tr.result.success,
              output: tr.result.output,
              error: tr.result.error
            })))
            lastToolResultsXmlRef.current = toolResultsXml

            // Continue the conversation with rejection feedback
            setTimeout(() => {
              chatRef.current?.continueWithContext(
                `${toolResultsXml}\n\n<plan_rejected>\n<reason>${reason}</reason>\n<instruction>Revise your plan based on this feedback and try again.</instruction>\n</plan_rejected>`
              )
            }, 100)

            return {
              ...response,
              content: parsed.message,
              metadata: {
                ...response.metadata,
                toolCalls: parsed.toolCalls,
                rejected: true,
                rejectionReason: reason
              }
            }
          }

          // No feedback - stop the loop and ask user for more information
          agentLoopActiveRef.current = false
          setState(s => ({ ...s, isAgentLoopActive: false }))

          return {
            ...response,
            content: parsed.message + '\n\n*Plan was rejected. Please provide feedback to help me revise the plan, or make a new request.*',
            metadata: {
              ...response.metadata,
              toolCalls: parsed.toolCalls,
              rejected: true
            }
          }
        }

        // Serialize tool results as XML for sending back to LLM
        const toolResultsXml = serializeToolResults(toolResults.map(tr => ({
          tool: tr.tool,
          success: tr.result.success,
          output: tr.result.output,
          error: tr.result.error
        })))
        lastToolResultsXmlRef.current = toolResultsXml

        // Continue the agent loop by sending tool results back
        console.log('[useAgentMode] Continuing agent loop with tool results')
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

    const send = async (request: PrompdLLMRequest): Promise<PrompdLLMResponse> => {
      // Build messages with system prompt
      const systemMessages: Array<{ role: 'system'; content: string }> = []

      // Get mode-specific system prompt from backend config (use ref for fresh value)
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

      console.log('[useAgentMode] Sending to LLM via base client')

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

      console.log('[useAgentMode] Raw response:', response.content.slice(0, 200))

      // Parse XML response
      const parseResult = parseAgentResponse(response.content)

      if (!parseResult.success) {
        // Check if we're in an agent loop and LLM broke XML format
        if (agentLoopActiveRef.current && parseResult.isPlainText) {
          console.log('[useAgentMode] LLM broke XML format during agent loop! Attempting retry...')

          if (agentLoopRetryCountRef.current < MAX_AGENT_LOOP_RETRIES) {
            agentLoopRetryCountRef.current++
            console.log(`[useAgentMode] Agent loop retry ${agentLoopRetryCountRef.current}/${MAX_AGENT_LOOP_RETRIES}`)

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
              return await processAgentResponse(retryResponse, retryParseResult.data)
            }
          }

          // Exhausted retries - fall through to plain text handling
          console.log('[useAgentMode] Exhausted retries, returning as conversational response')
          agentLoopActiveRef.current = false
          agentLoopRetryCountRef.current = 0
          setState(s => ({ ...s, isAgentLoopActive: false }))
        }

        // Check for fallback message when XML parsing failed but we could extract the message
        if (parseResult.fallbackMessage) {
          console.log('[useAgentMode] XML parse failed but extracted fallback message:', parseResult.fallbackMessage.slice(0, 100))
          // Return the fallback message instead of raw XML
          return {
            ...response,
            content: parseResult.fallbackMessage + '\n\n*Note: Response format was malformed. Some actions may not have been parsed correctly.*'
          }
        }

        // Plain text response - return as-is
        console.log('[useAgentMode] Plain text response (not XML) - returning as-is')
        return response
      }

      // Successfully parsed XML - process the response
      return await processAgentResponse(response, parseResult.data!)
    }

    return {
      send,
      configure: baseClient.configure.bind(baseClient),
      getConfig: baseClient.getConfig.bind(baseClient)
    }
  }, [chatMode, trackUsage, executeToolCalls])

  // Legacy start method (for direct control)
  const start = useCallback((userMessage: string) => {
    // Reset abort flag when starting
    abortRef.current = false
    console.log('[useAgentMode] start() called - agent loop will be initiated via LLM client')
  }, [])

  // Approve pending tool calls
  const approve = useCallback(async () => {
    if (state.pendingPlanApproval) {
      state.pendingPlanApproval.resolve(true)
    }
  }, [state.pendingPlanApproval])

  // Reject pending tool calls
  const reject = useCallback((reason?: string) => {
    if (state.pendingPlanApproval) {
      state.pendingPlanApproval.resolve(false, reason)
    }
  }, [state.pendingPlanApproval])

  // Stop the agent
  const stop = useCallback(() => {
    abortRef.current = true
    agentLoopActiveRef.current = false
    setState(s => ({
      ...s,
      isRunning: false,
      isPaused: false,
      isAgentLoopActive: false,
      pendingAskUser: null,
      pendingPlanApproval: null
    }))
  }, [])

  // Undo last file operation
  const undo = useCallback(async (): Promise<{ success: boolean; message: string; path?: string; content?: string }> => {
    if (!toolExecutorRef.current) {
      return { success: false, message: 'Tool executor not initialized' }
    }

    try {
      const result = await toolExecutorRef.current.undo()
      if (result.success) {
        const output = result.output as { path: string; message: string; restoredContent: string }
        // Notify parent to update tabs with restored content
        if (onFileWrittenRef.current && output.path && output.restoredContent !== undefined) {
          onFileWrittenRef.current(output.path, output.restoredContent)
        }
        return {
          success: true,
          message: output.message || 'Undo successful',
          path: output.path,
          content: output.restoredContent
        }
      } else {
        return {
          success: false,
          message: result.error || 'Undo failed'
        }
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Undo failed'
      }
    }
  }, [])

  const actions: AgentChatActions = {
    createAgentLLMClient,
    cancelAskUser,
    getToolExecutor,
    undo,
    start,
    approve,
    reject,
    stop
  }

  return [state, actions]
}

// Re-export types for compatibility
export type { ToolCall, ToolResult } from '../services/toolExecutor'

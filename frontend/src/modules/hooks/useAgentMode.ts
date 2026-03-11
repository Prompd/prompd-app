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

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
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

// Tools allowed in planner mode (read-only + plan presentation)
const PLANNER_ALLOWED_TOOLS = new Set([
  'read_file', 'list_files', 'search_files',
  'read_package_file', 'list_package_files', 'search_registry',
  'ask_user', 'present_plan'
])

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
    options?: Array<{ label: string; description?: string } | string>
    resolve: (answer: string) => void
  } | null
  /** Pending plan approval waiting for user decision */
  pendingPlanApproval: {
    toolCalls: Array<{ tool: string; params: Record<string, unknown> }>
    agentMessage: string
    resolve: (approved: boolean, reason?: string, filteredToolCalls?: Array<{ tool: string; params: Record<string, unknown> }>) => void
  } | null
  /** Pending present_plan review waiting for user decision */
  pendingPlanReview: {
    content: string
    resolve: (result: { action: 'refine' | 'apply'; feedback?: string; mode?: 'confirm' | 'auto' }) => void
  } | null
  /** Whether agent loop is currently active */
  isAgentLoopActive: boolean
  error: string | null
  /** Running token usage totals for this chat session */
  tokenUsage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  /** Prompt tokens from the most recent LLM call (for context % display) */
  lastPromptTokens: number
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
  // Called when a tool execution message is created or updated (for conversation persistence)
  onToolMessage?: (message: { id: string; role: 'system'; content: string; timestamp: string; metadata: Record<string, unknown> }) => void
}

export interface AgentChatActions {
  // Create an LLM client wrapper that handles agent logic
  createAgentLLMClient: (
    baseClient: AgentCompatibleLLMClient,
    chatRef: React.RefObject<PrompdChatHandle>,
    contextMessages?: Array<{ role: 'system'; content: string }> | (() => Array<{ role: 'system'; content: string }>)
  ) => AgentCompatibleLLMClient
  // Cancel pending ask_user
  cancelAskUser: () => void
  cancelPlanReview: () => void
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

// Simple string hash for duplicate-write detection (djb2)
function hashString(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return hash
}

/** Max consecutive duplicate writes before the loop is stopped */
const MAX_DUPLICATE_WRITES = 2

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
    onFileWritten,
    onToolMessage
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
    pendingPlanReview: null,
    isAgentLoopActive: false,
    error: null,
    tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    lastPromptTokens: 0
  })

  // Constants
  const MAX_AGENT_LOOP_RETRIES = 2

  // Refs
  const toolExecutorRef = useRef<IToolExecutor | null>(null)
  const abortRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const agentLoopActiveRef = useRef(false)
  const agentLoopRetryCountRef = useRef(0)
  const lastToolResultsXmlRef = useRef<string | null>(null)
  const permissionLevelRef = useRef<AgentPermissionLevel>(permissionLevel)
  const chatModesRef = useRef<Record<string, ChatModeConfig> | null>(chatModes || null)
  // Ref to store results from auto-executed reads while waiting for write approval
  const pendingAutoResultsRef = useRef<Array<{ id: string; tool: string; result: ToolResult }>>([])
  // Ref to track onFileWritten callback to avoid stale closures
  const onFileWrittenRef = useRef(onFileWritten)
  const onToolMessageRef = useRef(onToolMessage)
  // Ref to store original permission level when present_plan overrides it
  const planOverrideRef = useRef<AgentPermissionLevel | null>(null)
  // Ref to allow mid-conversation chatMode switching (planner -> agent)
  const chatModeRef = useRef(chatMode)
  // Ref to store original chatMode when present_plan switches to agent
  const chatModeOverrideRef = useRef<string | null>(null)
  // Ref to track repeated tool failures on the same file (loop detection)
  const lastFailedToolRef = useRef<{ tool: string; path: string; count: number } | null>(null)
  // Total iteration counter for current agent loop (enforces maxIterations)
  const agentLoopIterationRef = useRef(0)
  // Track last write_file content to detect duplicate-write loops
  const lastWriteContentRef = useRef<{ path: string; hash: number } | null>(null)
  const duplicateWriteCountRef = useRef(0)
  // Track total writes per file path to detect thrashing (different content, same file)
  const fileWriteCountRef = useRef<Map<string, number>>(new Map())
  /** Max writes to the same file before the loop is stopped (regardless of content) */
  const MAX_FILE_WRITES = 4
  // Ref for per-session token accumulation (avoids stale closures in send())
  const tokenUsageRef = useRef({ promptTokens: 0, completionTokens: 0, totalTokens: 0 })
  // Sync refs with props — skip when an override is active (plan execution in progress)
  useEffect(() => {
    if (planOverrideRef.current === null) {
      permissionLevelRef.current = permissionLevel
    }
  }, [permissionLevel])

  useEffect(() => {
    if (chatModeOverrideRef.current === null) {
      chatModeRef.current = chatMode
    }
  }, [chatMode])

  useEffect(() => {
    chatModesRef.current = chatModes || null
  }, [chatModes])

  useEffect(() => {
    onFileWrittenRef.current = onFileWritten
  }, [onFileWritten])

  useEffect(() => {
    onToolMessageRef.current = onToolMessage
  }, [onToolMessage])

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
        return ['write_file', 'edit_file', 'rename_file', 'run_command']
      default:
        // Default case: be safe and require approval for all write operations
        return ['write_file', 'edit_file', 'rename_file', 'run_command']
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

  const cancelPlanReview = useCallback(() => {
    setState(s => {
      if (s.pendingPlanReview) {
        s.pendingPlanReview.resolve({ action: 'refine', feedback: '[User cancelled the plan review]' })
      }
      return { ...s, pendingPlanReview: null }
    })
  }, [])

  // Get tool executor
  const getToolExecutor = useCallback(() => toolExecutorRef.current, [])

  // Execute tool calls
  const executeToolCalls = useCallback(async (
    toolCalls: Array<{ tool: string; params: Record<string, unknown> }>,
    chatRef: React.RefObject<PrompdChatHandle>
  ): Promise<Array<{ id: string; tool: string; result: ToolResult }>> => {
    // Helper to notify consumers of tool messages for conversation persistence
    const notifyToolMessage = (id: string, metadata: Record<string, unknown>) => {
      onToolMessageRef.current?.({
        id,
        role: 'system',
        content: '',
        timestamp: new Date().toISOString(),
        metadata
      })
    }

    if (!toolExecutorRef.current) {
      console.error('[useAgentMode] Tool executor not initialized')
      return []
    }

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

      // Planner mode tool enforcement - only allow read-only tools
      if (chatModeRef.current === 'planner' && !PLANNER_ALLOWED_TOOLS.has(call.tool)) {
        console.log(`[useAgentMode] Planner mode - rejecting tool: ${call.tool}`)
        const rejectMeta = {
          type: 'tool-execution' as const,
          toolName: call.tool,
          toolParams: call.params,
          status: 'error' as const,
          result: `Tool "${call.tool}" is not available in planning mode.`,
          duration: Date.now() - startTime
        }
        chatRef.current?.addMessage({
          id: toolId,
          role: 'system',
          content: '',
          timestamp: new Date().toISOString(),
          metadata: { ...rejectMeta, status: 'error' }
        })
        notifyToolMessage(toolId, rejectMeta)
        autoResults.push({
          id: toolId,
          tool: call.tool,
          result: {
            success: false,
            error: `Tool "${call.tool}" is not available in planning mode. Use present_plan to present your plan, then it will be executed after approval.`
          }
        })
        continue
      }

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
        const askOptions = call.params.options as Array<{ label: string; description?: string } | string> | undefined
        const answer = await new Promise<string>((resolve) => {
          setState(s => ({ ...s, pendingAskUser: { question, options: askOptions, resolve } }))
        })
        setState(s => ({ ...s, pendingAskUser: null }))

        const askUserMeta = {
          type: 'tool-execution' as const,
          toolName: call.tool,
          toolParams: call.params,
          status: 'success' as const,
          result: answer,
          duration: Date.now() - startTime
        }
        chatRef.current?.updateMessage(toolId, { metadata: askUserMeta })
        notifyToolMessage(toolId, askUserMeta)

        autoResults.push({
          id: toolId,
          tool: call.tool,
          result: { success: true, output: answer }
        })
        continue
      }

      // Handle present_plan specially
      if (call.tool === 'present_plan') {
        const planContent = call.params.content as string

        // Reject empty/blank plans - tell model to try again with actual content
        if (!planContent || !planContent.trim()) {
          console.warn('[useAgentMode] present_plan called with empty content - rejecting')
          autoResults.push({
            id: toolId,
            tool: call.tool,
            result: {
              success: false,
              error: 'Plan content is empty. You MUST provide a detailed plan inside the <content> parameter using CDATA. Include specific files, changes, and steps. Do NOT put the plan in the <message> tag - it MUST go in <content><![CDATA[...plan...]]></content>.'
            }
          })
          continue
        }

        console.log('[useAgentMode] present_plan - showing plan review modal')

        // Add a running message
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

        // Wait for user decision via Promise
        const decision = await new Promise<{ action: 'refine' | 'apply'; feedback?: string; mode?: 'confirm' | 'auto' }>((resolve) => {
          setState(s => ({ ...s, pendingPlanReview: { content: planContent, resolve } }))
        })
        setState(s => ({ ...s, pendingPlanReview: null }))

        // If "apply" — switch to agent mode and override permission level for execution
        if (decision.action === 'apply' && decision.mode) {
          planOverrideRef.current = permissionLevelRef.current
          chatModeOverrideRef.current = chatModeRef.current  // Save original (e.g. 'planner')
          permissionLevelRef.current = decision.mode
          chatModeRef.current = 'agent'  // Switch to agent mode for execution
          console.log(`[useAgentMode] present_plan - switched to agent mode, permission '${decision.mode}' (was '${planOverrideRef.current}', mode was '${chatModeOverrideRef.current}')`)
        }

        // Update message with result
        const planMeta = {
          type: 'tool-execution' as const,
          toolName: call.tool,
          toolParams: { content: planContent.substring(0, 200) + (planContent.length > 200 ? '...' : '') },
          status: 'success' as const,
          result: JSON.stringify(decision),
          duration: Date.now() - startTime
        }
        chatRef.current?.updateMessage(toolId, { metadata: planMeta })
        notifyToolMessage(toolId, planMeta)

        // Build a descriptive result so the LLM knows to actually execute
        const resultOutput = decision.action === 'apply'
          ? `The user APPROVED your plan (mode: ${decision.mode}). You are now in AGENT mode with FULL tool access: read_file, write_file, edit_file, run_command, rename_file. EXECUTE your plan NOW - perform each step using the appropriate tools. Start with Step 1 immediately. Do NOT describe what you would do - actually call the tools.`
          : decision.action === 'refine'
            ? `The user wants you to REFINE the plan. Feedback: "${decision.feedback || 'No specific feedback'}". Please revise your plan based on this feedback and present it again using present_plan.`
            : JSON.stringify(decision)

        autoResults.push({
          id: toolId,
          tool: call.tool,
          result: { success: true, output: resultOutput }
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
        const resultMeta = {
          type: 'tool-execution' as const,
          toolName: call.tool,
          toolParams: call.params,
          status: (result.success ? 'success' : 'error') as 'success' | 'error',
          result: result.success ? JSON.stringify(result.output, null, 2) : undefined,
          error: result.error,
          duration: Date.now() - startTime
        }
        chatRef.current?.updateMessage(toolId, { metadata: resultMeta })
        notifyToolMessage(toolId, resultMeta)

        autoResults.push({ id: toolId, tool: call.tool, result })

        // Track repeated failures for loop detection
        if (!result.success) {
          const toolPath = (call.params.path as string) || ''
          const lastFail = lastFailedToolRef.current
          if (lastFail && lastFail.tool === call.tool && lastFail.path === toolPath) {
            lastFail.count++
          } else {
            lastFailedToolRef.current = { tool: call.tool, path: toolPath, count: 1 }
          }
        } else {
          lastFailedToolRef.current = null
        }
      } catch (error) {
        const errorMeta = {
          type: 'tool-execution' as const,
          toolName: call.tool,
          toolParams: call.params,
          status: 'error' as const,
          error: error instanceof Error ? error.message : 'Unknown error',
          duration: Date.now() - startTime
        }
        chatRef.current?.updateMessage(toolId, { metadata: errorMeta })
        notifyToolMessage(toolId, errorMeta)

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

    // In planner mode, reject any write tools that slipped through to needsApproval
    let filteredNeedsApproval = needsApproval
    if (chatModeRef.current === 'planner' && needsApproval.length > 0) {
      console.log(`[useAgentMode] Planner mode - rejecting ${needsApproval.length} write tool(s)`)
      for (let i = 0; i < needsApproval.length; i++) {
        const call = needsApproval[i]
        const toolId = `planner_reject_${Date.now()}_${i}`
        const rejectMeta = {
          type: 'tool-execution' as const,
          toolName: call.tool,
          toolParams: call.params,
          status: 'error' as const,
          result: `Tool "${call.tool}" is not available in planning mode.`,
          duration: 0
        }
        chatRef.current?.addMessage({
          id: toolId,
          role: 'system',
          content: '',
          timestamp: new Date().toISOString(),
          metadata: { ...rejectMeta, status: 'error' }
        })
        notifyToolMessage(toolId, rejectMeta)
        autoResults.push({
          id: toolId,
          tool: call.tool,
          result: {
            success: false,
            error: `Tool "${call.tool}" is not available in planning mode. Use present_plan to present your plan, then it will be executed after approval.`
          }
        })
      }
      filteredNeedsApproval = [] // Clear so we skip the approval dialog
    }

    // If any tools need approval, wait for plan approval
    if (filteredNeedsApproval.length > 0) {
      console.log(`[useAgentMode] ${filteredNeedsApproval.length} tool(s) require approval:`, filteredNeedsApproval.map(t => t.tool))
      pendingAutoResultsRef.current = autoResults // Store read results

      const approvalResult = await new Promise<{
        approved: boolean
        reason?: string
        filteredToolCalls?: Array<{ tool: string; params: Record<string, unknown> }>
      }>((resolve) => {
        // Create proper ToolCall objects with generated IDs for UI display
        const toolCallsWithIds: ToolCall[] = filteredNeedsApproval.map((tc, idx) => ({
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
            toolCalls: filteredNeedsApproval,
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
        for (let i = 0; i < filteredNeedsApproval.length; i++) {
          const call = filteredNeedsApproval[i]
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
      const toolsToExecute = approvalResult.filteredToolCalls || filteredNeedsApproval
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
          const writeResultMeta = {
            type: 'tool-execution' as const,
            toolName: call.tool,
            toolParams: call.params,
            status: (result.success ? 'success' : 'error') as 'success' | 'error',
            result: result.success ? JSON.stringify(result.output, null, 2) : undefined,
            error: result.error,
            duration: Date.now() - startTime
          }
          chatRef.current?.updateMessage(toolId, { metadata: writeResultMeta })
          notifyToolMessage(toolId, writeResultMeta)

          writeResults.push({ id: toolId, tool: call.tool, result })

          // Track repeated failures for loop detection
          if (!result.success) {
            const toolPath = (call.params.path as string) || ''
            const lastFail = lastFailedToolRef.current
            if (lastFail && lastFail.tool === call.tool && lastFail.path === toolPath) {
              lastFail.count++
            } else {
              lastFailedToolRef.current = { tool: call.tool, path: toolPath, count: 1 }
            }
          } else {
            lastFailedToolRef.current = null
          }

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
          const writeErrorMeta = {
            type: 'tool-execution' as const,
            toolName: call.tool,
            toolParams: call.params,
            status: 'error' as const,
            error: error instanceof Error ? error.message : 'Unknown error',
            duration: Date.now() - startTime
          }
          chatRef.current?.updateMessage(toolId, { metadata: writeErrorMeta })
          notifyToolMessage(toolId, writeErrorMeta)

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
    contextMessages?: Array<{ role: 'system'; content: string }> | (() => Array<{ role: 'system'; content: string }>)
  ): AgentCompatibleLLMClient => {
    // Helper to restore overrides and clean up agent loop state
    const restoreOverridesAndCleanup = () => {
      agentLoopActiveRef.current = false
      agentLoopRetryCountRef.current = 0
      if (planOverrideRef.current !== null) {
        console.log(`[useAgentMode] Restoring permission level to '${planOverrideRef.current}'`)
        permissionLevelRef.current = planOverrideRef.current
        planOverrideRef.current = null
      }
      if (chatModeOverrideRef.current !== null) {
        console.log(`[useAgentMode] Restoring chatMode to '${chatModeOverrideRef.current}'`)
        chatModeRef.current = chatModeOverrideRef.current
        chatModeOverrideRef.current = null
      }
      lastFailedToolRef.current = null
      agentLoopIterationRef.current = 0
      lastWriteContentRef.current = null
      duplicateWriteCountRef.current = 0
      fileWriteCountRef.current.clear()
      setState(s => ({ ...s, isAgentLoopActive: false, iteration: 0 }))
    }

    // Get maxIterations from current mode config (default 15)
    const getMaxIterations = (): number => {
      const modes = chatModesRef.current
      const modeConfig = modes?.[chatModeRef.current]
      return modeConfig?.settings?.maxIterations ?? 15
    }

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

      // Check if user requested stop before processing
      if (abortRef.current) {
        console.log('[useAgentMode] Abort detected in processAgentResponse - stopping')
        restoreOverridesAndCleanup()
        return {
          ...response,
          content: parsed.message || '*Stopped by user.*',
          metadata: {
            ...response.metadata,
            done: true
          }
        }
      }

      // Handle tool calls first — if the LLM returned tool calls, execute them
      // regardless of the done flag (LLMs sometimes incorrectly set done=true
      // alongside tool calls, which would short-circuit execution)
      if (parsed.toolCalls.length > 0) {
        agentLoopActiveRef.current = true
        agentLoopRetryCountRef.current = 0

        // Enforce maxIterations — stop the loop before it runs away
        agentLoopIterationRef.current++
        const maxIter = getMaxIterations()
        setState(s => ({ ...s, isAgentLoopActive: true, iteration: agentLoopIterationRef.current }))

        if (agentLoopIterationRef.current > maxIter) {
          console.log(`[useAgentMode] Max iterations reached (${agentLoopIterationRef.current}/${maxIter}) - stopping agent loop`)
          restoreOverridesAndCleanup()

          const stopMsg = parsed.message
            ? parsed.message + '\n\n*Reached maximum iterations. Stopping to avoid an infinite loop.*'
            : '*Reached maximum iterations. Stopping to avoid an infinite loop.*'

          chatRef.current?.addMessage({
            id: `max_iter_${Date.now()}`,
            role: 'assistant',
            content: stopMsg,
            timestamp: new Date().toISOString(),
            metadata: { type: 'system-stop' }
          })

          return {
            ...response,
            content: stopMsg,
            metadata: { ...response.metadata, done: true, messageAlreadyRendered: true }
          }
        }

        // Detect write loops — two checks:
        // 1. Identical content hash (duplicate writes)
        // 2. Too many writes to same file regardless of content (thrashing)
        const writeCall = parsed.toolCalls.find(tc => tc.tool === 'write_file' || tc.tool === 'edit_file')
        if (writeCall) {
          const writePath = String(writeCall.params?.path || '')

          // Per-file write count — catches thrashing with different content
          const prevCount = fileWriteCountRef.current.get(writePath) || 0
          const newCount = prevCount + 1
          fileWriteCountRef.current.set(writePath, newCount)

          if (newCount > MAX_FILE_WRITES) {
            console.log(`[useAgentMode] File write thrashing detected: ${newCount} writes to "${writePath}" - stopping loop`)
            restoreOverridesAndCleanup()

            const stopMsg = (parsed.message || '') +
              `\n\n*Stopped: wrote to "${writePath}" ${newCount} times in this loop. This suggests the approach isn't working. Please re-read the file and try a different strategy.*`

            chatRef.current?.addMessage({
              id: `thrash_write_${Date.now()}`,
              role: 'assistant',
              content: stopMsg,
              timestamp: new Date().toISOString(),
              metadata: { type: 'system-stop' }
            })

            return {
              ...response,
              content: stopMsg,
              metadata: { ...response.metadata, done: true, messageAlreadyRendered: true }
            }
          }

          // Identical content hash detection (only for write_file which sends full content)
          if (writeCall.tool === 'write_file') {
            const writeContent = String(writeCall.params?.content || '')
            const contentHash = hashString(writeContent)
            const last = lastWriteContentRef.current

            if (last && last.path === writePath && last.hash === contentHash) {
              duplicateWriteCountRef.current++
              if (duplicateWriteCountRef.current >= MAX_DUPLICATE_WRITES) {
                console.log(`[useAgentMode] Duplicate write detected ${duplicateWriteCountRef.current}x to "${writePath}" - stopping loop`)
                restoreOverridesAndCleanup()

                const stopMsg = (parsed.message || '') +
                  '\n\n*Stopped: repeated identical writes detected. The same content was being written multiple times.*'

                chatRef.current?.addMessage({
                  id: `dup_write_${Date.now()}`,
                  role: 'assistant',
                  content: stopMsg,
                  timestamp: new Date().toISOString(),
                  metadata: { type: 'system-stop' }
                })

                return {
                  ...response,
                  content: stopMsg,
                  metadata: { ...response.metadata, done: true, messageAlreadyRendered: true }
                }
              }
            } else {
              duplicateWriteCountRef.current = 0
            }
            lastWriteContentRef.current = { path: writePath, hash: contentHash }
          }
        }

        // Add agent's message to chat BEFORE tool execution so it appears first in the UI
        if (parsed.message) {
          chatRef.current?.addMessage({
            id: `agent_msg_${Date.now()}`,
            role: 'assistant',
            content: parsed.message,
            timestamp: new Date().toISOString(),
            metadata: {
              suggestion: parsed.suggestion || null
            }
          })
        }

        // Execute tool calls
        console.log(`[useAgentMode] Processing ${parsed.toolCalls.length} tool calls (iteration ${agentLoopIterationRef.current}/${maxIter})`)
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

            // Continue the conversation with rejection feedback (unless aborted)
            setTimeout(() => {
              if (abortRef.current) {
                console.log('[useAgentMode] Abort detected before rejection continuation - stopping')
                restoreOverridesAndCleanup()
                return
              }
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
                messageAlreadyRendered: true,
                rejected: true,
                rejectionReason: reason
              }
            }
          }

          // No feedback - stop the loop and ask user for more information
          restoreOverridesAndCleanup()

          return {
            ...response,
            content: parsed.message + '\n\n*Plan was rejected. Please provide feedback to help me revise the plan, or make a new request.*',
            metadata: {
              ...response.metadata,
              toolCalls: parsed.toolCalls,
              messageAlreadyRendered: true,
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

        // Detect tool failure loops — hint at 3, hard stop at 5
        let contextXml = toolResultsXml
        const failTracker = lastFailedToolRef.current
        if (failTracker && failTracker.count >= 5) {
          // Hard stop — the LLM is stuck in a failure loop
          console.log(`[useAgentMode] Consecutive failure limit reached: ${failTracker.tool} failed ${failTracker.count}x on ${failTracker.path} - stopping loop`)
          restoreOverridesAndCleanup()

          const stopMsg = (parsed.message || '') +
            `\n\n*Stopped: "${failTracker.tool}" failed ${failTracker.count} consecutive times on "${failTracker.path}". Please re-read the file and try a different approach.*`

          chatRef.current?.addMessage({
            id: `fail_loop_${Date.now()}`,
            role: 'assistant',
            content: stopMsg,
            timestamp: new Date().toISOString(),
            metadata: { type: 'system-stop' }
          })

          return {
            ...response,
            content: stopMsg,
            metadata: { ...response.metadata, done: true, messageAlreadyRendered: true }
          }
        } else if (failTracker && failTracker.count >= 3) {
          contextXml += `\n<system_hint>WARNING: Tool "${failTracker.tool}" has failed ${failTracker.count} times on "${failTracker.path}". Your search string likely does not match the file contents exactly. Try a different approach: re-read the file first, use a smaller/different search string, or use write_file instead of edit_file.</system_hint>`
          console.log(`[useAgentMode] Loop detection: ${failTracker.tool} failed ${failTracker.count}x on ${failTracker.path}`)
        }

        // Continue the agent loop by sending tool results back (unless aborted)
        console.log('[useAgentMode] Continuing agent loop with tool results')
        setTimeout(() => {
          if (abortRef.current) {
            console.log('[useAgentMode] Abort detected before continuation - stopping agent loop')
            restoreOverridesAndCleanup()
            return
          }
          chatRef.current?.continueWithContext(contextXml)
        }, 100)

        // Return the message part of the response
        // messageAlreadyRendered: agent message was added before tool execution
        return {
          ...response,
          content: parsed.message,
          metadata: {
            ...response.metadata,
            suggestion: parsed.suggestion || null,
            toolCalls: parsed.toolCalls,
            messageAlreadyRendered: true
          }
        }
      }

      // No tool calls — check if agent signaled done and clean up
      if (parsed.done) {
        console.log('[useAgentMode] Agent signaled done (no tool calls) - resetting state')
        restoreOverridesAndCleanup()
      }

      return {
        ...response,
        content: parsed.message,
        metadata: {
          ...response.metadata,
          suggestion: parsed.suggestion || null,
          done: parsed.done || undefined
        }
      }
    }

    const send = async (request: PrompdLLMRequest): Promise<PrompdLLMResponse> => {
      // Reset abort flag and iteration counter for fresh user messages (not agent loop continuations)
      if (!agentLoopActiveRef.current) {
        abortRef.current = false
        agentLoopIterationRef.current = 0
        lastWriteContentRef.current = null
        duplicateWriteCountRef.current = 0
        fileWriteCountRef.current.clear()
      }

      // Check if abort was requested (by stop())
      if (abortRef.current) {
        console.log('[useAgentMode] Abort detected at send() - returning empty response')
        restoreOverridesAndCleanup()
        return {
          content: '*Stopped by user.*',
          provider: '',
          model: '',
          metadata: { done: true }
        } as PrompdLLMResponse
      }

      // Build messages with system prompt
      const systemMessages: Array<{ role: 'system'; content: string }> = []

      // Get mode-specific system prompt from backend config (use refs for fresh value)
      const modes = chatModesRef.current
      const modeConfig = modes?.[chatModeRef.current]
      if (modeConfig?.systemPrompt) {
        systemMessages.push({
          role: 'system' as const,
          content: modeConfig.systemPrompt
        })
      }

      // Add any context messages (file content, etc.)
      // When a getter function is provided, call it to get fresh content each iteration
      const resolvedContext = typeof contextMessages === 'function'
        ? contextMessages()
        : contextMessages
      if (resolvedContext && resolvedContext.length > 0) {
        systemMessages.push(...resolvedContext)
      }

      // Combine with request messages
      const messagesWithContext = [...systemMessages, ...request.messages]

      console.log('[useAgentMode] Sending to LLM via base client')

      // Create an AbortController so stop() can cancel the in-flight request
      const controller = new AbortController()
      abortControllerRef.current = controller

      // Race the LLM request against the abort signal so stop() works
      // for both local (IPC) and remote (fetch) execution paths
      const abortPromise = new Promise<never>((_, reject) => {
        if (controller.signal.aborted) {
          reject(new DOMException('The operation was aborted.', 'AbortError'))
          return
        }
        controller.signal.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        }, { once: true })
      })

      let response: PrompdLLMResponse
      try {
        response = await Promise.race([
          baseClient.send({
            ...request,
            messages: messagesWithContext,
            signal: controller.signal
          }),
          abortPromise
        ])
      } catch (err) {
        // If the request was aborted by stop(), return a stopped response
        if (err instanceof DOMException && err.name === 'AbortError') {
          console.log('[useAgentMode] Request aborted by user')
          restoreOverridesAndCleanup()
          return {
            content: '*Stopped by user.*',
            provider: '',
            model: '',
            metadata: { done: true }
          } as PrompdLLMResponse
        }
        throw err
      } finally {
        abortControllerRef.current = null
      }

      // Track usage (global + per-session accumulation)
      if (response.usage) {
        const { promptTokens, completionTokens, totalTokens } = response.usage
        tokenUsageRef.current = {
          promptTokens: tokenUsageRef.current.promptTokens + promptTokens,
          completionTokens: tokenUsageRef.current.completionTokens + completionTokens,
          totalTokens: tokenUsageRef.current.totalTokens + totalTokens
        }
        setState(s => ({ ...s, tokenUsage: { ...tokenUsageRef.current }, lastPromptTokens: promptTokens }))
        if (trackUsage) {
          trackUsage(
            'chat',
            response.provider,
            response.model,
            promptTokens,
            completionTokens,
            { mode: chatModeRef.current }
          )
        }
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

            // Create a new AbortController for the retry request
            const retryController = new AbortController()
            abortControllerRef.current = retryController

            const retryAbortPromise = new Promise<never>((_, reject) => {
              if (retryController.signal.aborted) {
                reject(new DOMException('The operation was aborted.', 'AbortError'))
                return
              }
              retryController.signal.addEventListener('abort', () => {
                reject(new DOMException('The operation was aborted.', 'AbortError'))
              }, { once: true })
            })

            let retryResponse: PrompdLLMResponse
            try {
              retryResponse = await Promise.race([
                baseClient.send({
                  ...request,
                  messages: retryMessages,
                  signal: retryController.signal
                }),
                retryAbortPromise
              ])
            } catch (retryErr) {
              if (retryErr instanceof DOMException && retryErr.name === 'AbortError') {
                console.log('[useAgentMode] Retry request aborted by user')
                restoreOverridesAndCleanup()
                return {
                  content: '*Stopped by user.*',
                  provider: '',
                  model: '',
                  metadata: { done: true }
                } as PrompdLLMResponse
              }
              throw retryErr
            } finally {
              abortControllerRef.current = null
            }

            // Track retry token usage
            if (retryResponse.usage) {
              const { promptTokens: retryPrompt, completionTokens: retryCompletion, totalTokens: retryTotal } = retryResponse.usage
              tokenUsageRef.current = {
                promptTokens: tokenUsageRef.current.promptTokens + retryPrompt,
                completionTokens: tokenUsageRef.current.completionTokens + retryCompletion,
                totalTokens: tokenUsageRef.current.totalTokens + retryTotal
              }
              setState(s => ({ ...s, tokenUsage: { ...tokenUsageRef.current }, lastPromptTokens: retryPrompt }))
            }

            // Try parsing the retry response
            const retryParseResult = parseAgentResponse(retryResponse.content)
            if (retryParseResult.success && retryParseResult.data) {
              // Success! Process the parsed response
              return await processAgentResponse(retryResponse, retryParseResult.data)
            }
          }

          // Exhausted retries - fall through to plain text handling
          console.log('[useAgentMode] Exhausted retries, returning as conversational response')
          restoreOverridesAndCleanup()
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
  }, [trackUsage, executeToolCalls])

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
    console.log('[useAgentMode] stop() called - aborting agent loop')
    abortRef.current = true
    agentLoopActiveRef.current = false
    // Abort any in-flight LLM request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    // Restore permission level and chatMode if overridden by present_plan
    if (planOverrideRef.current !== null) {
      console.log(`[useAgentMode] stop() - restoring permission level to '${planOverrideRef.current}'`)
      permissionLevelRef.current = planOverrideRef.current
      planOverrideRef.current = null
    }
    if (chatModeOverrideRef.current !== null) {
      console.log(`[useAgentMode] stop() - restoring chatMode to '${chatModeOverrideRef.current}'`)
      chatModeRef.current = chatModeOverrideRef.current
      chatModeOverrideRef.current = null
    }
    lastFailedToolRef.current = null
    agentLoopIterationRef.current = 0
    lastWriteContentRef.current = null
    duplicateWriteCountRef.current = 0
    fileWriteCountRef.current.clear()
    setState(s => ({
      ...s,
      isRunning: false,
      isPaused: false,
      isAgentLoopActive: false,
      iteration: 0,
      pendingAskUser: null,
      pendingPlanApproval: null,
      pendingPlanReview: null
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

  // Memoize actions to prevent unnecessary downstream recreation (e.g. editorLLMClient useMemo)
  const actions: AgentChatActions = useMemo(() => ({
    createAgentLLMClient,
    cancelAskUser,
    cancelPlanReview,
    getToolExecutor,
    undo,
    start,
    approve,
    reject,
    stop
  }), [createAgentLLMClient, cancelAskUser, cancelPlanReview, getToolExecutor, undo, start, approve, reject, stop])

  return [state, actions]
}

// Re-export types for compatibility
export type { ToolCall, ToolResult } from '../services/toolExecutor'

/**
 * WorkflowExecutor - Execute workflow graphs with sequential, conditional, and parallel support
 * Includes comprehensive execution tracing, debugging, and step-through capabilities
 */

import type {
  WorkflowFile,
  WorkflowNode,
  WorkflowResult,
  WorkflowExecutionState,
  WorkflowExecutionError,
  PromptNodeData,
  ConditionNodeData,
  LoopNodeData,
  ParallelNodeData,
  MergeNodeData,
  TransformerNodeData,
  CallbackNodeData,
  UserInputNodeData,
  ToolNodeData,
  ToolCallParserNodeData,
  AgentNodeData,
  ChatAgentNodeData,
  ChatAgentCheckpointConfig,
  AgentTool,
  AgentIterationRecord,
  AgentCheckpointEvent,
  AgentCheckpointEventType,
  ToolCallEventData,
  IterationEventData,
  ThinkingEventData,
  ErrorEventData,
  CompleteEventData,
  ErrorHandlerNodeData,
  GuardrailNodeData,
  CommandNodeData,
  ClaudeCodeNodeData,
  WorkflowNodeData,
  McpToolNodeData,
  MemoryNodeData,
  BaseNodeData,
} from './workflowTypes'
import { getExecutionOrder, type ParsedWorkflow } from './workflowParser'

type ExecutionCallback = (state: WorkflowExecutionState) => void

/** Execution mode determines how callback nodes behave */
export type ExecutionMode = 'automated' | 'debug' | 'step'

/** Event emitted when a callback node is reached */
export interface CheckpointEvent {
  nodeId: string
  checkpointName?: string
  message?: string
  previousOutput?: unknown
  nextNodeInfo?: { id: string; type: string; label: string } | null
  timestamp: number
  /** Toggle-based behaviors */
  behaviors: {
    logToConsole: boolean
    logToHistory: boolean
    pauseInDebug: boolean
    requireApproval: boolean
    sendWebhook: boolean
  }
  /** Approval settings when requireApproval is true */
  approval?: {
    title?: string
    instructions?: string
    timeoutMs?: number
    timeoutAction?: 'continue' | 'fail' | 'skip'
  }
  /** Webhook settings when sendWebhook is true */
  webhook?: {
    url?: string
    waitForAck?: boolean
    ackTimeoutMs?: number
  }
}

/** Request for user input during workflow execution */
export interface UserInputRequest {
  nodeId: string
  nodeLabel: string
  prompt: string
  inputType: 'text' | 'textarea' | 'choice' | 'confirm' | 'number'
  choices?: string[]
  placeholder?: string
  defaultValue?: string
  required?: boolean
  showContext?: boolean
  contextTemplate?: string
  context: {
    previousOutput: unknown
    variables: Record<string, unknown>
  }
}

/** Response from user input */
export interface UserInputResponse {
  value: unknown
  cancelled?: boolean
}

/** Single entry in the execution trace log */
export interface TraceEntry {
  timestamp: number
  type: 'node_start' | 'node_complete' | 'node_error' | 'checkpoint' | 'variable_change' | 'expression_eval' | 'debug_step' | 'prompt_sent'
  nodeId?: string
  nodeName?: string
  nodeType?: string
  message: string
  data?: unknown
  duration?: number
}

/** Complete execution trace for debugging and export */
export interface ExecutionTrace {
  id: string
  workflowId: string
  workflowName: string
  startTime: number
  endTime?: number
  status: 'running' | 'completed' | 'failed' | 'paused' | 'cancelled'
  mode: ExecutionMode
  parameters: Record<string, unknown>
  entries: TraceEntry[]
  nodeOutputs: Record<string, unknown>
  finalOutput?: unknown
  errors: WorkflowExecutionError[]
}

/** Debug state for step-through execution */
export interface DebugState {
  isPaused: boolean
  currentNodeId: string | null
  breakpoints: Set<string>
  watchedVariables: string[]
  stepPromise?: {
    resolve: (continueExecution: boolean) => void
    reject: (reason: unknown) => void
  }
}

/** Tool call request for external tool execution */
export interface ToolCallRequest {
  nodeId: string
  toolName: string
  toolType: 'function' | 'mcp' | 'http' | 'command' | 'code'
  parameters: Record<string, unknown>
  /** For HTTP tools */
  httpConfig?: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
    url: string
    headers?: Record<string, string>
    body?: string
  }
  /** For MCP tools */
  mcpConfig?: {
    serverUrl?: string
    serverName?: string
  }
  /** For command tools */
  commandConfig?: {
    executable: string
    action?: string
    args?: string
    cwd?: string
    requiresApproval?: boolean
  }
  /** For code tools */
  codeConfig?: {
    language: 'typescript' | 'javascript' | 'python' | 'csharp'
    code: string
    inputVariable?: string
    executionContext?: 'isolated' | 'main'
  }
  timeout?: number
}

/** Tool call result from external execution */
export interface ToolCallResult {
  success: boolean
  result?: unknown
  error?: string
}

/** Request for executing LLM prompt (used by agent nodes) */
export interface PromptExecuteRequest {
  nodeId: string
  prompt: string  // System prompt
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  provider?: string
  model?: string
  temperature?: number
  tools?: unknown[]  // Tool definitions for function calling
}

/** Result from LLM prompt execution */
export interface PromptExecuteResult {
  success: boolean
  response?: unknown  // Can be string or structured response with tool_calls
  error?: string
}

interface ExecutorOptions {
  /** Execution mode: automated (callbacks pass-through), debug (pause on callbacks), step (pause after each node) */
  executionMode?: ExecutionMode
  /** Set of node IDs where execution should pause (debug mode) */
  breakpoints?: Set<string>
  onProgress?: ExecutionCallback
  onNodeStart?: (nodeId: string) => void
  onNodeComplete?: (nodeId: string, output: unknown) => void
  onNodeError?: (nodeId: string, error: string) => void
  /** Called when a callback/checkpoint node is reached */
  onCheckpoint?: (event: CheckpointEvent) => Promise<boolean>
  /** Called when a user-input node is reached - must return user's response */
  onUserInput?: (request: UserInputRequest) => Promise<UserInputResponse>
  /** Called when a tool node needs to execute a tool */
  onToolCall?: (request: ToolCallRequest) => Promise<ToolCallResult>
  /** Called when execution pauses (debug/step mode) - return true to continue, false to stop */
  onDebugPause?: (debugState: DebugState, trace: ExecutionTrace) => Promise<boolean>
  /** Called on each trace entry for real-time logging */
  onTraceEntry?: (entry: TraceEntry) => void
  /** Called for streaming output from prompt nodes */
  onStream?: (nodeId: string, chunk: string) => void
  executePrompt?: (source: string, params: Record<string, unknown>, provider?: string, model?: string) => Promise<string>
  /** Called by agent nodes to execute LLM prompts with conversation history */
  onPromptExecute?: (request: PromptExecuteRequest) => Promise<PromptExecuteResult>
  /** Called when an agent node emits a checkpoint event (tool calls, iterations, etc.) */
  onAgentCheckpoint?: (event: AgentCheckpointEvent) => Promise<boolean> | boolean
}

// ============================================================================
// Error Handler Routing
// ============================================================================

/**
 * Context passed to error handlers for processing
 */
interface ErrorContext {
  error: {
    message: string
    code?: string
    stack?: string
  }
  node: {
    id: string
    type: string
    label: string
  }
  input: unknown
  attempt: number
  workflow: {
    id: string
    executionId: string
  }
}

/**
 * Result from error handler processing
 */
interface ErrorHandlerResult {
  handled: boolean
  shouldContinue: boolean
  fallbackValue?: unknown
  retryRequested: boolean
}

/**
 * Send error notification to webhook endpoint
 * This is fire-and-forget - errors are logged but don't affect execution
 */
async function sendErrorNotification(
  notifyConfig: NonNullable<ErrorHandlerNodeData['notify']>,
  errorContext: ErrorContext
): Promise<void> {
  const { webhookUrl, includeStack, includeContext } = notifyConfig

  if (!webhookUrl) return

  const payload: Record<string, unknown> = {
    type: 'workflow_error',
    timestamp: new Date().toISOString(),
    error: {
      message: errorContext.error.message,
      code: errorContext.error.code,
    },
    node: {
      id: errorContext.node.id,
      type: errorContext.node.type,
      label: errorContext.node.label,
    },
    workflow: errorContext.workflow,
    attempt: errorContext.attempt,
  }

  // Optionally include stack trace
  if (includeStack && errorContext.error.stack) {
    payload.stack = errorContext.error.stack
  }

  // Optionally include input context
  if (includeContext && errorContext.input !== undefined) {
    try {
      // Truncate large inputs to prevent payload bloat
      const inputStr = JSON.stringify(errorContext.input)
      payload.context = inputStr.length > 10000
        ? { truncated: true, preview: inputStr.slice(0, 10000) }
        : errorContext.input
    } catch {
      payload.context = { error: 'Unable to serialize input context' }
    }
  }

  console.log(`[WorkflowExecutor] Sending error notification to ${webhookUrl}`)

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      console.warn(`[WorkflowExecutor] Webhook responded with status ${response.status}`)
    } else {
      console.log(`[WorkflowExecutor] Error notification sent successfully`)
    }
  } catch (err) {
    console.error(`[WorkflowExecutor] Failed to send webhook notification:`, err)
    throw err
  }
}

/**
 * Find and process error through referenced ErrorHandler node
 * @param nodeId - The node that errored
 * @param error - The error that occurred
 * @param workflowFile - The workflow file
 * @param context - Error context for the handler
 * @param attempt - Current retry attempt (1-based)
 * @returns Error handler result with action to take
 */
function processErrorHandler(
  nodeId: string,
  error: Error | string,
  workflowFile: WorkflowFile,
  input: unknown,
  attempt: number
): ErrorHandlerResult {
  // Find the node that errored
  const node = workflowFile.nodes.find(n => n.id === nodeId)
  if (!node) {
    return { handled: false, shouldContinue: false, retryRequested: false }
  }

  // Check if node has failFast override
  const nodeData = node.data as BaseNodeData
  if (nodeData.failFast) {
    return { handled: false, shouldContinue: false, retryRequested: false }
  }

  // Check if node references an error handler
  const errorHandlerNodeId = nodeData.errorHandlerNodeId
  if (!errorHandlerNodeId) {
    return { handled: false, shouldContinue: false, retryRequested: false }
  }

  // Find the error handler node
  const errorHandlerNode = workflowFile.nodes.find(n => n.id === errorHandlerNodeId)
  if (!errorHandlerNode || errorHandlerNode.type !== 'error-handler') {
    console.warn(`[WorkflowExecutor] ErrorHandler node '${errorHandlerNodeId}' not found or invalid type`)
    return { handled: false, shouldContinue: false, retryRequested: false }
  }

  const handlerData = errorHandlerNode.data as ErrorHandlerNodeData
  const errorMessage = error instanceof Error ? error.message : String(error)

  console.log(`[WorkflowExecutor] Processing error through handler '${handlerData.label}' (strategy: ${handlerData.strategy})`)

  // Build error context
  const errorContext: ErrorContext = {
    error: {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    },
    node: {
      id: nodeId,
      type: node.type || 'unknown',
      label: nodeData.label || nodeId,
    },
    input,
    attempt,
    workflow: {
      id: workflowFile.metadata?.id || 'unknown',
      executionId: `exec-${Date.now()}`, // Would be passed from execution context in real impl
    },
  }

  // Process based on strategy
  switch (handlerData.strategy) {
    case 'retry': {
      const retryConfig = handlerData.retry
      if (retryConfig && attempt <= (retryConfig.maxAttempts || 3)) {
        // Check if this error should be retried
        if (retryConfig.retryOn && retryConfig.retryOn.length > 0) {
          const shouldRetry = retryConfig.retryOn.some(pattern =>
            errorMessage.toLowerCase().includes(pattern.toLowerCase())
          )
          if (!shouldRetry) {
            console.log(`[WorkflowExecutor] Error does not match retry patterns, not retrying`)
            return { handled: true, shouldContinue: false, retryRequested: false }
          }
        }

        // Calculate backoff delay
        const backoffMs = retryConfig.backoffMs || 1000
        const multiplier = retryConfig.backoffMultiplier || 2
        const delay = backoffMs * Math.pow(multiplier, attempt - 1)

        console.log(`[WorkflowExecutor] Retry ${attempt}/${retryConfig.maxAttempts}, waiting ${delay}ms`)

        // Note: Actual delay/retry would be handled by caller
        return { handled: true, shouldContinue: true, retryRequested: true }
      }

      // Max retries exceeded, fall through to fallback if configured
      if (handlerData.fallback) {
        return processFallback(handlerData, errorContext)
      }

      return { handled: true, shouldContinue: false, retryRequested: false }
    }

    case 'fallback':
      return processFallback(handlerData, errorContext)

    case 'ignore':
      console.log(`[WorkflowExecutor] Ignoring error per handler strategy`)
      return { handled: true, shouldContinue: true, retryRequested: false }

    case 'notify':
      // Send webhook notification asynchronously (fire and forget)
      if (handlerData.notify?.webhookUrl) {
        sendErrorNotification(handlerData.notify, errorContext).catch(err => {
          console.error(`[WorkflowExecutor] Failed to send error notification:`, err)
        })
      }
      return { handled: true, shouldContinue: false, retryRequested: false }

    case 'rethrow':
    default:
      return { handled: false, shouldContinue: false, retryRequested: false }
  }
}

/**
 * Process fallback strategy from error handler
 */
function processFallback(
  handlerData: ErrorHandlerNodeData,
  errorContext: ErrorContext
): ErrorHandlerResult {
  const fallback = handlerData.fallback
  if (!fallback) {
    return { handled: true, shouldContinue: false, retryRequested: false }
  }

  switch (fallback.type) {
    case 'value':
      console.log(`[WorkflowExecutor] Using fallback value`)
      return {
        handled: true,
        shouldContinue: true,
        fallbackValue: fallback.value,
        retryRequested: false,
      }

    case 'template':
      // Simple template substitution
      if (fallback.template) {
        let result = fallback.template
        result = result.replace('{{ error.message }}', errorContext.error.message)
        result = result.replace('{{ node.label }}', errorContext.node.label)
        console.log(`[WorkflowExecutor] Using fallback template result`)
        return {
          handled: true,
          shouldContinue: true,
          fallbackValue: result,
          retryRequested: false,
        }
      }
      return { handled: true, shouldContinue: false, retryRequested: false }

    case 'node':
      // Fallback to another node - would need to trigger execution
      console.log(`[WorkflowExecutor] Fallback node execution not yet implemented`)
      return { handled: true, shouldContinue: false, retryRequested: false }

    default:
      return { handled: true, shouldContinue: false, retryRequested: false }
  }
}

/**
 * Evaluate a template expression like {{ node.output }} or {{ workflow.param }}
 */
function evaluateExpression(
  expression: string,
  context: {
    nodeOutputs: Record<string, unknown>
    variables: Record<string, unknown>
    workflow: Record<string, unknown>
    previous_output?: unknown
  }
): unknown {
  // Remove {{ }} wrapper
  const trimmed = expression.trim()
  if (!trimmed.startsWith('{{') || !trimmed.endsWith('}}')) {
    return expression // Not a template, return as-is
  }

  const inner = trimmed.slice(2, -2).trim()

  // Handle comparison expressions
  if (inner.includes('<') || inner.includes('>') || inner.includes('==') || inner.includes('&&') || inner.includes('||')) {
    try {
      // Build context for eval
      // "input" and "previous_output" are both aliases for the output of the previous node
      const evalContext = {
        ...context.nodeOutputs,
        ...context.variables,
        workflow: context.workflow,
        previous_output: context.previous_output,
        input: context.previous_output,
      }

      // Replace dot notation with bracket notation for safety
      let evalExpr = inner
      for (const [key, value] of Object.entries(evalContext)) {
        // Replace simple references like "node.field" with actual values
        const regex = new RegExp(`\\b${key}\\b`, 'g')
        if (typeof value === 'object' && value !== null) {
          // For objects, we need to handle nested access
          evalExpr = evalExpr.replace(regex, JSON.stringify(value))
        } else if (typeof value === 'string') {
          evalExpr = evalExpr.replace(regex, `"${value}"`)
        } else {
          evalExpr = evalExpr.replace(regex, String(value))
        }
      }

      // Safe evaluation using Function constructor
      // eslint-disable-next-line no-new-func
      const result = new Function(`return (${evalExpr})`)()
      return result
    } catch (e) {
      console.warn(`Failed to evaluate expression: ${inner}`, e)
      return false
    }
  }

  // Handle simple property access: node.output or workflow.param
  const parts = inner.split('.')
  if (parts.length === 1) {
    // Single variable - check for common aliases first
    const varName = parts[0]

    // "input" and "previous_output" are aliases for the output of the previous node
    // This is the most common pattern for passing data through a workflow
    if (varName === 'input' || varName === 'previous_output') {
      return context.previous_output
    }

    return context.nodeOutputs[varName] ?? context.variables[varName] ?? context.workflow[varName]
  }

  const [source, ...path] = parts

  let value: unknown
  if (source === 'workflow') {
    value = context.workflow
  } else if (source === 'previous_output' || source === 'input') {
    // Both are aliases for the previous node's output
    value = context.previous_output
  } else if (context.nodeOutputs[source] !== undefined) {
    value = context.nodeOutputs[source]
  } else if (context.variables[source] !== undefined) {
    value = context.variables[source]
  } else {
    return undefined
  }

  // Navigate the path
  for (const key of path) {
    if (value === null || value === undefined) return undefined

    // If value is a string, try parsing it as JSON to access nested properties
    // This handles cases where previous_output is a JSON string from an LLM response
    if (typeof value === 'string') {
      // Try to extract JSON from markdown code blocks (```json ... ```)
      const jsonMatch = value.match(/```(?:json)?\s*([\s\S]*?)```/)
      const jsonString = jsonMatch ? jsonMatch[1].trim() : value.trim()

      try {
        const parsed = JSON.parse(jsonString)
        if (typeof parsed === 'object' && parsed !== null) {
          value = parsed
        }
      } catch {
        // Not valid JSON, continue with string (will likely return undefined)
      }
    }

    value = (value as Record<string, unknown>)[key]
  }

  return value
}

/**
 * Resolve parameters by evaluating template expressions
 */
function resolveParameters(
  params: Record<string, string> | undefined,
  context: {
    nodeOutputs: Record<string, unknown>
    variables: Record<string, unknown>
    workflow: Record<string, unknown>
    previous_output?: unknown
  }
): Record<string, unknown> {
  if (!params) return {}

  const resolved: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(params)) {
    resolved[key] = evaluateExpression(value, context)
  }
  return resolved
}

/** Generate a unique trace ID */
function generateTraceId(): string {
  return `trace-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Add an entry to the execution trace
 */
function addTraceEntry(
  trace: ExecutionTrace,
  entry: Omit<TraceEntry, 'timestamp'>,
  options: ExecutorOptions
): void {
  const fullEntry: TraceEntry = {
    ...entry,
    timestamp: Date.now(),
  }
  trace.entries.push(fullEntry)
  options.onTraceEntry?.(fullEntry)
}

/**
 * Deep clone an object to avoid Immer frozen object issues
 */
function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }
  return JSON.parse(JSON.stringify(obj)) as T
}

/**
 * Get child node IDs for a container node (loop/parallel)
 * Uses parentId relationship - finds all nodes that have this node as parent
 * Orders nodes based on internal edges (topological sort) for proper execution order
 *
 * Internal start/end handles:
 * - loop-start, parallel-start: Internal source handles where child nodes connect FROM
 * - loop-end, parallel-end: Internal target handles where child nodes connect TO
 *
 * Falls back to data.body or data.branches for backwards compatibility
 */
function getChildNodeIds(
  containerNodeId: string,
  workflowFile: WorkflowFile,
  nodeData: { body?: string[]; branches?: Array<{ id: string; nodes: string[] }> }
): string[] {
  // Find nodes with parentId pointing to this container
  const childNodes = workflowFile.nodes.filter(
    (n: WorkflowNode) => n.parentId === containerNodeId
  )

  if (childNodes.length > 0) {
    const childNodeIds = new Set(childNodes.map(n => n.id))

    // Find edges from container's internal start handle to child nodes
    // These edges have source = containerNodeId and sourceHandle = 'loop-start' or 'parallel-start'
    const startEdges = workflowFile.edges.filter(
      edge => edge.source === containerNodeId &&
              (edge.sourceHandle === 'loop-start' || edge.sourceHandle === 'parallel-start') &&
              childNodeIds.has(edge.target)
    )

    // Find edges from child nodes to container's internal end handle
    // These edges have target = containerNodeId and targetHandle = 'loop-end' or 'parallel-end'
    const endEdges = workflowFile.edges.filter(
      edge => edge.target === containerNodeId &&
              (edge.targetHandle === 'loop-end' || edge.targetHandle === 'parallel-end') &&
              childNodeIds.has(edge.source)
    )

    // Find internal edges (edges where both source and target are child nodes)
    const internalEdges = workflowFile.edges.filter(
      edge => childNodeIds.has(edge.source) && childNodeIds.has(edge.target)
    )

    // Check if we have any edge-based ordering information
    const hasStartEndEdges = startEdges.length > 0 || endEdges.length > 0
    const hasInternalEdges = internalEdges.length > 0

    if (hasInternalEdges) {
      // Full topological sort with internal edges between child nodes
      return topologicalSortNodes(childNodes, internalEdges)
    } else if (hasStartEndEdges) {
      // No internal edges between children, but we have start/end connections
      // Nodes connected from start handle should come first
      const startNodeIds = new Set(startEdges.map(e => e.target))
      // Nodes connected to end handle should come last
      const endNodeIds = new Set(endEdges.map(e => e.source))

      // Order: start-connected nodes first, then others, then end-connected nodes
      const startNodes: WorkflowNode[] = []
      const middleNodes: WorkflowNode[] = []
      const endOnlyNodes: WorkflowNode[] = []

      for (const node of childNodes) {
        const isStart = startNodeIds.has(node.id)
        const isEnd = endNodeIds.has(node.id)

        if (isStart) {
          startNodes.push(node)
        } else if (isEnd && !isStart) {
          endOnlyNodes.push(node)
        } else {
          middleNodes.push(node)
        }
      }

      // Sort each group by x position
      const byX = (a: WorkflowNode, b: WorkflowNode) => a.position.x - b.position.x
      startNodes.sort(byX)
      middleNodes.sort(byX)
      endOnlyNodes.sort(byX)

      return [...startNodes, ...middleNodes, ...endOnlyNodes].map(n => n.id)
    }

    // Fallback: sort by x position for left-to-right execution order
    childNodes.sort((a, b) => a.position.x - b.position.x)
    return childNodes.map(n => n.id)
  }

  // Fallback to explicit body array (backwards compatibility)
  if (nodeData.body && nodeData.body.length > 0) {
    return nodeData.body
  }

  // Fallback for parallel branches (collect all node IDs from branches)
  if (nodeData.branches && nodeData.branches.length > 0) {
    const allBranchNodes: string[] = []
    for (const branch of nodeData.branches) {
      if (branch.nodes) {
        allBranchNodes.push(...branch.nodes)
      }
    }
    return allBranchNodes
  }

  return []
}

/**
 * Topological sort of nodes based on edges
 * Returns node IDs in execution order (start nodes first, then following edges)
 */
function topologicalSortNodes(
  nodes: WorkflowNode[],
  edges: { source: string; target: string }[]
): string[] {
  const nodeIds = nodes.map(n => n.id)
  const nodeIdSet = new Set(nodeIds)

  // Build in-degree map and adjacency list
  const inDegree = new Map<string, number>()
  const adjacencyList = new Map<string, string[]>()

  // Initialize
  for (const nodeId of nodeIds) {
    inDegree.set(nodeId, 0)
    adjacencyList.set(nodeId, [])
  }

  // Build graph from edges
  for (const edge of edges) {
    if (nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target)) {
      adjacencyList.get(edge.source)!.push(edge.target)
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1)
    }
  }

  // Find start nodes (in-degree 0)
  const queue: string[] = []
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(nodeId)
    }
  }

  // Sort start nodes by x position for consistent ordering when multiple start points
  const nodePositions = new Map(nodes.map(n => [n.id, n.position.x]))
  queue.sort((a, b) => (nodePositions.get(a) || 0) - (nodePositions.get(b) || 0))

  // Kahn's algorithm for topological sort
  const result: string[] = []
  while (queue.length > 0) {
    const current = queue.shift()!
    result.push(current)

    const neighbors = adjacencyList.get(current) || []
    // Sort neighbors by x position for consistent ordering
    neighbors.sort((a, b) => (nodePositions.get(a) || 0) - (nodePositions.get(b) || 0))

    for (const neighbor of neighbors) {
      const newDegree = (inDegree.get(neighbor) || 0) - 1
      inDegree.set(neighbor, newDegree)
      if (newDegree === 0) {
        queue.push(neighbor)
        // Re-sort queue to maintain position-based ordering
        queue.sort((a, b) => (nodePositions.get(a) || 0) - (nodePositions.get(b) || 0))
      }
    }
  }

  // If some nodes weren't reached (disconnected or cycle), add them at the end
  // sorted by x position
  const unvisited = nodeIds.filter(id => !result.includes(id))
  if (unvisited.length > 0) {
    console.warn('[workflowExecutor] Some child nodes are not connected by edges:', unvisited)
    unvisited.sort((a, b) => (nodePositions.get(a) || 0) - (nodePositions.get(b) || 0))
    result.push(...unvisited)
  }

  return result
}

/**
 * Build a map of branching node IDs to their possible target node IDs
 * This is used to determine which nodes to skip when a branch is not selected
 * Works for: condition nodes, tool-call-parser nodes
 */
function buildBranchingTargetMap(workflowFile: WorkflowFile): Map<string, {
  allTargets: Set<string>
  edgeTargets: Map<string, string>  // handleId -> targetNodeId
}> {
  const map = new Map<string, { allTargets: Set<string>; edgeTargets: Map<string, string> }>()

  for (const node of workflowFile.nodes) {
    // Include both condition nodes and tool-call-parser nodes (they both branch)
    if (node.type === 'condition' || node.type === 'tool-call-parser') {
      const allTargets = new Set<string>()
      const edgeTargets = new Map<string, string>()

      // Find all edges from this branching node
      for (const edge of workflowFile.edges) {
        if (edge.source === node.id && edge.sourceHandle) {
          allTargets.add(edge.target)
          edgeTargets.set(edge.sourceHandle, edge.target)
        }
      }

      map.set(node.id, { allTargets, edgeTargets })
    }
  }

  return map
}

/**
 * Get all downstream nodes reachable from a starting node
 * Used to determine which nodes to skip when a condition branch is not taken
 */
function getDownstreamNodes(
  startNodeId: string,
  workflowFile: WorkflowFile,
  stopAtNodes: Set<string> = new Set()
): Set<string> {
  const downstream = new Set<string>()
  const visited = new Set<string>()
  const queue = [startNodeId]

  while (queue.length > 0) {
    const nodeId = queue.shift()!
    if (visited.has(nodeId)) continue
    visited.add(nodeId)

    // Don't traverse past stop nodes (e.g., merge nodes where branches converge)
    if (stopAtNodes.has(nodeId) && nodeId !== startNodeId) {
      continue
    }

    downstream.add(nodeId)

    // Find all edges from this node
    for (const edge of workflowFile.edges) {
      if (edge.source === nodeId && !visited.has(edge.target)) {
        queue.push(edge.target)
      }
    }
  }

  return downstream
}

/**
 * Find merge nodes that are downstream of a condition node
 * Merge nodes act as convergence points where branches rejoin
 */
function findMergeNodesDownstream(
  conditionNodeId: string,
  workflowFile: WorkflowFile
): Set<string> {
  const mergeNodes = new Set<string>()
  const visited = new Set<string>()
  const queue = [conditionNodeId]

  while (queue.length > 0) {
    const nodeId = queue.shift()!
    if (visited.has(nodeId)) continue
    visited.add(nodeId)

    const node = workflowFile.nodes.find(n => n.id === nodeId)
    if (node?.type === 'merge') {
      mergeNodes.add(nodeId)
      // Don't traverse past merge nodes
      continue
    }

    // Find all edges from this node
    for (const edge of workflowFile.edges) {
      if (edge.source === nodeId && !visited.has(edge.target)) {
        queue.push(edge.target)
      }
    }
  }

  return mergeNodes
}

/**
 * Execute a workflow with full tracing and debug support
 */
export async function executeWorkflow(
  workflow: ParsedWorkflow,
  params: Record<string, unknown>,
  options: ExecutorOptions = {}
): Promise<WorkflowResult & { trace: ExecutionTrace }> {
  const startTime = Date.now()
  const errors: WorkflowExecutionError[] = []
  const executionMode = options.executionMode || 'automated'

  // Deep clone the workflow file to avoid Immer frozen object issues
  // The workflow comes from Zustand store which uses Immer and freezes objects
  const workflowFile = deepClone(workflow.file)

  // Initialize execution trace
  const trace: ExecutionTrace = {
    id: generateTraceId(),
    workflowId: workflowFile.metadata.id,
    workflowName: workflowFile.metadata.name,
    startTime,
    status: 'running',
    mode: executionMode,
    parameters: { ...params },
    entries: [],
    nodeOutputs: {},
    errors: [],
  }

  // Initialize debug state
  const debugState: DebugState = {
    isPaused: false,
    currentNodeId: null,
    breakpoints: options.breakpoints || new Set(),
    watchedVariables: [],
  }

  // Initialize execution state
  const state: WorkflowExecutionState = {
    workflowId: workflowFile.metadata.id,
    status: 'running',
    nodeStates: {},
    nodeOutputs: {},
    variables: {},
    errors: [],
    startTime,
  }

  // Initialize variables from workflow definition
  for (const variable of workflowFile.variables || []) {
    state.variables[variable.name] = variable.default
    addTraceEntry(trace, {
      type: 'variable_change',
      message: `Initialized variable '${variable.name}'`,
      data: { name: variable.name, value: variable.default },
    }, options)
  }

  // Get execution order (topological sort)
  const executionOrder = getExecutionOrder(workflow)

  // Debug: Log all nodes, edges, and execution analysis
  const rootNodes = workflowFile.nodes.filter(n => !n.parentId)
  const childNodes = workflowFile.nodes.filter(n => n.parentId)
  console.log('[WorkflowExecutor] Total nodes:', workflowFile.nodes.length, '| Root nodes:', rootNodes.length, '| Child nodes:', childNodes.length)
  console.log('[WorkflowExecutor] Root nodes:', rootNodes.map(n => ({ id: n.id, type: n.type, label: n.data?.label })))
  console.log('[WorkflowExecutor] Child nodes:', childNodes.map(n => ({ id: n.id, type: n.type, label: n.data?.label, parentId: n.parentId })))
  console.log('[WorkflowExecutor] All edges:', workflowFile.edges.map(e => ({ source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle })))
  console.log('[WorkflowExecutor] Execution order (root nodes only):', executionOrder, '| Mode:', executionMode)

  addTraceEntry(trace, {
    type: 'debug_step',
    message: `Starting workflow execution with ${executionOrder.length} nodes`,
    data: { executionOrder, mode: executionMode },
  }, options)

  // Track previous output for auto-inject
  let previousOutput: unknown = undefined

  // Track which nodes should be skipped due to condition branching
  // When a condition node evaluates, only the target branch should execute
  const skippedNodes = new Set<string>()

  // Build a map of branching nodes (condition, tool-call-parser) to their possible targets for skip tracking
  const branchingTargetMap = buildBranchingTargetMap(workflowFile)

  // Execute nodes in order
  for (const nodeId of executionOrder) {
    // Skip nodes that were not selected by a condition branch
    if (skippedNodes.has(nodeId)) {
      addTraceEntry(trace, {
        type: 'debug_step',
        nodeId,
        message: `Skipping node '${nodeId}' - not on selected condition branch`,
      }, options)
      continue
    }

    const node = workflowFile.nodes.find((n: WorkflowNode) => n.id === nodeId)
    if (!node) continue

    // Skip disabled nodes
    const nodeData = node.data as BaseNodeData
    if (nodeData.disabled) {
      // Initialize node state as skipped
      if (!state.nodeStates[nodeId]) {
        state.nodeStates[nodeId] = {
          nodeId,
          status: 'skipped',
          retryCount: 0,
        }
      } else {
        state.nodeStates[nodeId].status = 'skipped'
      }

      addTraceEntry(trace, {
        type: 'debug_step',
        nodeId,
        nodeName: nodeData.label,
        nodeType: node.type,
        message: `Skipping disabled node '${nodeData.label}'`,
      }, options)

      options.onProgress?.(deepClone(state))
      continue
    }

    // Initialize node state early so we can set it to 'paused' in debug/step mode
    if (!state.nodeStates[nodeId]) {
      state.nodeStates[nodeId] = {
        nodeId,
        status: 'pending',
        retryCount: 0,
      }
    }

    // Check for breakpoint in debug mode
    if (executionMode === 'debug' && debugState.breakpoints.has(nodeId)) {
      debugState.isPaused = true
      debugState.currentNodeId = nodeId
      trace.status = 'paused'
      state.status = 'paused'
      state.currentNodeId = nodeId
      state.nodeStates[nodeId].status = 'paused'
      options.onProgress?.(deepClone(state))

      addTraceEntry(trace, {
        type: 'debug_step',
        nodeId,
        nodeName: node.data.label,
        nodeType: node.type,
        message: `Breakpoint hit at node '${node.data.label}'`,
      }, options)

      if (options.onDebugPause) {
        const shouldContinue = await options.onDebugPause(debugState, trace)
        if (!shouldContinue) {
          trace.status = 'cancelled'
          state.status = 'failed'
          state.nodeStates[nodeId].status = 'failed'
          break
        }
      }
      debugState.isPaused = false
      trace.status = 'running'
      state.status = 'running'
      state.nodeStates[nodeId].status = 'pending'
      options.onProgress?.(deepClone(state))
    }

    // Step mode - pause before each node
    if (executionMode === 'step') {
      debugState.isPaused = true
      debugState.currentNodeId = nodeId
      trace.status = 'paused'
      state.status = 'paused'
      state.currentNodeId = nodeId
      state.nodeStates[nodeId].status = 'paused'
      options.onProgress?.(deepClone(state))

      addTraceEntry(trace, {
        type: 'debug_step',
        nodeId,
        nodeName: node.data.label,
        nodeType: node.type,
        message: `Step pause before node '${node.data.label}'`,
        data: { previousOutput },
      }, options)

      if (options.onDebugPause) {
        const shouldContinue = await options.onDebugPause(debugState, trace)
        if (!shouldContinue) {
          trace.status = 'cancelled'
          state.status = 'failed'
          state.nodeStates[nodeId].status = 'failed'
          break
        }
      }
      debugState.isPaused = false
      trace.status = 'running'
      state.status = 'running'
      state.nodeStates[nodeId].status = 'pending'
      options.onProgress?.(deepClone(state))
    }

    state.currentNodeId = nodeId
    options.onProgress?.(deepClone(state))
    options.onNodeStart?.(nodeId)

    const nodeStartTime = Date.now()

    addTraceEntry(trace, {
      type: 'node_start',
      nodeId,
      nodeName: node.data.label,
      nodeType: node.type,
      message: `Starting node '${node.data.label}' (${node.type})`,
      data: { nodeData: node.data },
    }, options)

    try {
      state.nodeStates[nodeId].status = 'running'
      state.nodeStates[nodeId].startTime = nodeStartTime
      options.onProgress?.(deepClone(state))

      // Build context for expression evaluation
      const context = {
        nodeOutputs: state.nodeOutputs,
        variables: state.variables,
        workflow: params,
        previous_output: previousOutput,
      }

      // Execute based on node type
      let output: unknown

      switch (node.type) {
        case 'prompt':
          output = await executePromptNode(node, context, options, trace, state, workflowFile)
          break

        case 'condition': {
          output = executeConditionNode(node, context)

          // Handle condition branching - mark non-selected branches as skipped
          const conditionOutput = output as { branch: string; target: string }
          const conditionInfo = branchingTargetMap.get(nodeId)

          if (conditionInfo) {
            // Determine which handle was selected
            // The branch ID maps to the handle ID: 'condition-{branchId}' or 'default'
            const selectedHandle = conditionOutput.branch === 'default'
              ? 'default'
              : `condition-${conditionOutput.branch}`

            // Get the selected target from edges
            const selectedTarget = conditionInfo.edgeTargets.get(selectedHandle)

            // Find merge nodes that act as convergence points
            const mergeNodes = findMergeNodesDownstream(nodeId, workflowFile)

            // For each non-selected branch, mark downstream nodes as skipped
            for (const [handleId, targetNodeId] of conditionInfo.edgeTargets) {
              if (handleId !== selectedHandle) {
                // Get all nodes downstream of this non-selected branch
                // Stop at merge nodes since those are where branches converge
                const downstreamNodes = getDownstreamNodes(targetNodeId, workflowFile, mergeNodes)

                for (const skipNodeId of downstreamNodes) {
                  // Don't skip merge nodes - they may receive input from the selected branch
                  if (!mergeNodes.has(skipNodeId)) {
                    skippedNodes.add(skipNodeId)
                  }
                }

                addTraceEntry(trace, {
                  type: 'debug_step',
                  nodeId,
                  message: `Skipping branch '${handleId}' (not selected), marking ${downstreamNodes.size} downstream nodes`,
                  data: { handleId, targetNodeId, skippedCount: downstreamNodes.size },
                }, options)
              }
            }

            addTraceEntry(trace, {
              type: 'expression_eval',
              nodeId,
              nodeName: node.data.label,
              message: `Condition selected branch '${conditionOutput.branch}' -> target '${selectedTarget || 'none'}'`,
              data: { branch: conditionOutput.branch, target: selectedTarget, handle: selectedHandle },
            }, options)
          }
          break
        }

        case 'loop':
          output = await executeLoopNode(node, context, options, state, workflowFile, trace)
          break

        case 'parallel':
          output = await executeParallelNode(node, context, options, state, workflowFile, trace)
          break

        case 'merge': {
          const mergeResult = executeMergeNode(node, context, workflowFile, skippedNodes)

          // Check if merge is waiting for more inputs
          if (mergeResult && typeof mergeResult === 'object' && 'waiting' in mergeResult && mergeResult.waiting) {
            // In wait mode, the merge node needs more inputs
            // This shouldn't happen with proper topological ordering, but handle it gracefully
            addTraceEntry(trace, {
              type: 'debug_step',
              nodeId,
              nodeName: node.data.label,
              message: `Merge node waiting for inputs: ${(mergeResult as { missingInputs: string[] }).missingInputs.join(', ')}`,
              data: { missingInputs: (mergeResult as { missingInputs: string[] }).missingInputs },
            }, options)

            // For now, proceed with empty result - proper handling would require reordering execution
            output = {}
          } else {
            output = mergeResult
          }
          break
        }

        case 'transformer':
          output = executeTransformerNode(node, context)
          break

        case 'memory':
          output = executeMemoryNode(node, context, state)
          break

        case 'callback':
        case 'checkpoint':  // Alias for callback
          output = await executeCallbackNode(node, context, options, state, workflowFile, executionOrder, trace)
          break

        case 'user-input':
          output = await executeUserInputNode(node, context, options, trace)
          break

        case 'tool':
          output = await executeToolNode(node, context, options, trace)
          break

        case 'tool-call-parser': {
          output = executeToolCallParserNode(node, context, trace, options)

          // Handle branching based on whether a tool call was found
          const parserOutput = output as { hasToolCall: boolean; toolName: string | null }
          const parserInfo = branchingTargetMap.get(nodeId)

          if (parserInfo) {
            // Select handle based on hasToolCall result
            const selectedHandle = parserOutput.hasToolCall ? 'found' : 'not-found'
            const selectedTarget = parserInfo.edgeTargets.get(selectedHandle)

            // Find merge nodes that act as convergence points
            const mergeNodes = findMergeNodesDownstream(nodeId, workflowFile)

            // For the non-selected branch, mark downstream nodes as skipped
            for (const [handleId, targetNodeId] of parserInfo.edgeTargets) {
              if (handleId !== selectedHandle) {
                const downstreamNodes = getDownstreamNodes(targetNodeId, workflowFile, mergeNodes)

                for (const skipNodeId of downstreamNodes) {
                  if (!mergeNodes.has(skipNodeId)) {
                    skippedNodes.add(skipNodeId)
                  }
                }

                addTraceEntry(trace, {
                  type: 'debug_step',
                  nodeId,
                  message: `Skipping branch '${handleId}' (tool call ${parserOutput.hasToolCall ? 'found' : 'not found'}), marking ${downstreamNodes.size} downstream nodes`,
                  data: { handleId, targetNodeId, skippedCount: downstreamNodes.size },
                }, options)
              }
            }

            addTraceEntry(trace, {
              type: 'expression_eval',
              nodeId,
              nodeName: node.data.label,
              message: `Tool call parser: ${parserOutput.hasToolCall ? `found '${parserOutput.toolName}'` : 'no tool call'} -> ${selectedHandle}`,
              data: { hasToolCall: parserOutput.hasToolCall, toolName: parserOutput.toolName, selectedHandle, selectedTarget },
            }, options)
          }
          break
        }

        case 'agent':
          output = await executeAgentNode(node, context, options, trace, state, workflowFile)
          break

        case 'chat-agent': {
          output = await executeChatAgentNode(node, context, options, trace, state, workflowFile, branchingTargetMap, skippedNodes)

          // Handle branching based on guardrail rejection (if guardrail is enabled)
          const chatAgentOutput = output as { rejected?: boolean } | undefined
          const chatAgentInfo = branchingTargetMap.get(nodeId)

          if (chatAgentInfo && chatAgentOutput?.rejected !== undefined) {
            const selectedHandle = chatAgentOutput.rejected ? 'rejected' : 'output'
            const mergeNodes = findMergeNodesDownstream(nodeId, workflowFile)

            for (const [handleId, targetNodeId] of chatAgentInfo.edgeTargets) {
              if (handleId !== selectedHandle) {
                const downstreamNodes = getDownstreamNodes(targetNodeId, workflowFile, mergeNodes)
                for (const skipNodeId of downstreamNodes) {
                  if (!mergeNodes.has(skipNodeId)) {
                    skippedNodes.add(skipNodeId)
                  }
                }
              }
            }
          }
          break
        }

        case 'guardrail': {
          output = await executeGuardrailNode(node, context, options, trace, workflowFile)

          // Handle branching based on pass/reject result
          const guardrailOutput = output as { rejected: boolean; score?: number; input?: unknown }
          const guardrailInfo = branchingTargetMap.get(nodeId)

          if (guardrailInfo) {
            // Select handle based on rejected result
            // If rejected, use 'rejected' handle; otherwise use 'output' handle
            const selectedHandle = guardrailOutput.rejected ? 'rejected' : 'output'
            const selectedTarget = guardrailInfo.edgeTargets.get(selectedHandle)

            // Find merge nodes that act as convergence points
            const mergeNodes = findMergeNodesDownstream(nodeId, workflowFile)

            // For the non-selected branch, mark downstream nodes as skipped
            for (const [handleId, targetNodeId] of guardrailInfo.edgeTargets) {
              if (handleId !== selectedHandle) {
                const downstreamNodes = getDownstreamNodes(targetNodeId, workflowFile, mergeNodes)

                for (const skipNodeId of downstreamNodes) {
                  if (!mergeNodes.has(skipNodeId)) {
                    skippedNodes.add(skipNodeId)
                  }
                }

                addTraceEntry(trace, {
                  type: 'debug_step',
                  nodeId,
                  message: `Skipping branch '${handleId}' (input ${guardrailOutput.rejected ? 'rejected' : 'passed'}), marking ${downstreamNodes.size} downstream nodes`,
                  data: { handleId, targetNodeId, skippedCount: downstreamNodes.size },
                }, options)
              }
            }

            addTraceEntry(trace, {
              type: 'expression_eval',
              nodeId,
              nodeName: node.data.label,
              message: `Guardrail: input ${guardrailOutput.rejected ? 'rejected' : 'passed'}${guardrailOutput.score !== undefined ? ` (score: ${guardrailOutput.score})` : ''} -> ${selectedHandle}`,
              data: { rejected: guardrailOutput.rejected, score: guardrailOutput.score, selectedHandle, selectedTarget },
            }, options)
          }
          break
        }

        case 'command':
          output = await executeCommandNode(node, context, options, trace)
          break

        case 'claude-code':
          // Claude Code node - requires Electron for SSH support
          addTraceEntry(trace, {
            type: 'debug_step',
            nodeId,
            nodeName: node.data.label,
            message: 'Claude Code node execution not yet implemented (requires Electron SSH)',
          }, options)
          output = previousOutput
          break

        case 'workflow':
          // Sub-workflow node - recursive workflow execution
          addTraceEntry(trace, {
            type: 'debug_step',
            nodeId,
            nodeName: node.data.label,
            message: 'Sub-workflow node execution not yet implemented',
          }, options)
          output = previousOutput
          break

        case 'mcp-tool':
          output = await executeMcpToolNode(node, context, options, trace)
          break

        case 'output':
          // Output node just passes through the previous output
          output = previousOutput
          break

        default:
          output = previousOutput
      }

      const nodeDuration = Date.now() - nodeStartTime

      // Store output
      state.nodeOutputs[nodeId] = output
      trace.nodeOutputs[nodeId] = output
      previousOutput = output

      state.nodeStates[nodeId].status = 'completed'
      state.nodeStates[nodeId].endTime = Date.now()
      state.nodeStates[nodeId].output = output

      addTraceEntry(trace, {
        type: 'node_complete',
        nodeId,
        nodeName: node.data.label,
        nodeType: node.type,
        message: `Completed node '${node.data.label}'`,
        data: { output },
        duration: nodeDuration,
      }, options)

      options.onProgress?.(deepClone(state))
      options.onNodeComplete?.(nodeId, output)

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const nodeDuration = Date.now() - nodeStartTime

      // Try to process through referenced ErrorHandler node first
      const errorHandlerResult = processErrorHandler(
        nodeId,
        error instanceof Error ? error : new Error(errorMessage),
        workflowFile,
        previousOutput,
        1 // Initial attempt
      )

      if (errorHandlerResult.handled) {
        addTraceEntry(trace, {
          type: 'node_error',
          nodeId,
          nodeName: node.data.label,
          nodeType: node.type,
          message: `Error in node '${node.data.label}' handled by ErrorHandler: ${errorMessage}`,
          data: {
            error: errorMessage,
            stack: error instanceof Error ? error.stack : undefined,
            handlerResult: {
              shouldContinue: errorHandlerResult.shouldContinue,
              hasFallback: errorHandlerResult.fallbackValue !== undefined,
            },
          },
          duration: nodeDuration,
        }, options)

        if (errorHandlerResult.shouldContinue) {
          // Use fallback value if provided, otherwise mark as recovered
          if (errorHandlerResult.fallbackValue !== undefined) {
            state.nodeOutputs[nodeId] = errorHandlerResult.fallbackValue
            trace.nodeOutputs[nodeId] = errorHandlerResult.fallbackValue
            previousOutput = errorHandlerResult.fallbackValue
            state.nodeStates[nodeId].status = 'completed'
            state.nodeStates[nodeId].output = errorHandlerResult.fallbackValue
          } else {
            state.nodeStates[nodeId].status = 'completed'
          }
          state.nodeStates[nodeId].endTime = Date.now()
          options.onProgress?.(deepClone(state))
          continue // Continue to next node
        }
      }

      // ErrorHandler didn't handle it or said don't continue - use default behavior
      state.nodeStates[nodeId].status = 'failed'
      state.nodeStates[nodeId].error = errorMessage
      state.nodeStates[nodeId].endTime = Date.now()

      const errorEntry: WorkflowExecutionError = {
        nodeId,
        message: errorMessage,
        timestamp: Date.now(),
      }
      errors.push(errorEntry)
      trace.errors.push(errorEntry)

      addTraceEntry(trace, {
        type: 'node_error',
        nodeId,
        nodeName: node.data.label,
        nodeType: node.type,
        message: `Error in node '${node.data.label}': ${errorMessage}`,
        data: { error: errorMessage, stack: error instanceof Error ? error.stack : undefined },
        duration: nodeDuration,
      }, options)

      options.onProgress?.(deepClone(state))
      options.onNodeError?.(nodeId, errorMessage)

      // Check error handling policy (workflow-level fallback)
      const errorPolicy = workflowFile.errorHandling?.onError || 'stop'
      if (errorPolicy === 'stop') {
        state.status = 'failed'
        trace.status = 'failed'
        break
      }
      // 'continue' - keep going
    }
  }

  // Finalize
  console.log('[WorkflowExecutor] Finalizing execution, state.status:', state.status, 'trace.status:', trace.status)
  state.endTime = Date.now()
  trace.endTime = Date.now()
  trace.finalOutput = previousOutput

  if (state.status !== 'failed' && trace.status !== 'cancelled') {
    state.status = 'completed'
    trace.status = 'completed'
  }
  state.errors = errors
  console.log('[WorkflowExecutor] Execution complete, returning result')

  addTraceEntry(trace, {
    type: 'debug_step',
    message: `Workflow execution ${trace.status}`,
    data: {
      totalDuration: trace.endTime - trace.startTime,
      nodesExecuted: Object.keys(state.nodeStates).length,
      errors: errors.length,
    },
  }, options)

  options.onProgress?.(deepClone(state))

  // Build result
  const nodeMetrics: Record<string, { duration: number; tokens?: number }> = {}
  for (const [nodeId, nodeState] of Object.entries(state.nodeStates)) {
    if (nodeState.startTime && nodeState.endTime) {
      nodeMetrics[nodeId] = {
        duration: nodeState.endTime - nodeState.startTime,
      }
    }
  }

  return {
    success: state.status === 'completed',
    output: previousOutput,
    nodeOutputs: state.nodeOutputs,
    errors,
    metrics: {
      totalDuration: (state.endTime || Date.now()) - startTime,
      nodeMetrics,
    },
    trace,
  }
}

/**
 * Execute a prompt node
 */
async function executePromptNode(
  node: WorkflowNode,
  context: {
    nodeOutputs: Record<string, unknown>
    variables: Record<string, unknown>
    workflow: Record<string, unknown>
    previous_output?: unknown
  },
  options: ExecutorOptions,
  trace: ExecutionTrace,
  state: WorkflowExecutionState,
  workflowFile: WorkflowFile
): Promise<unknown> {
  const data = node.data as PromptNodeData
  const startTime = Date.now()

  // Resolve node-specific parameters (explicit mappings in the node config)
  const resolvedParams = resolveParameters(data.parameters, context)

  // Include workflow parameters so prompts can access {{ workflow.topic }} etc.
  // Node-specific parameters take precedence over workflow parameters
  const allParams: Record<string, unknown> = {
    workflow: context.workflow,  // Make workflow params accessible as {{ workflow.* }}
    ...context.workflow,         // Also flatten workflow params for direct access
    ...resolvedParams,           // Node-specific mappings override
  }

  // Handle auto-inject of previous output
  if (data.context?.previous_output === 'auto' && context.previous_output !== undefined) {
    allParams['previous_output'] = context.previous_output
    // Also provide as previous_step for step2.prmd style references
    allParams['previous_step'] = context.previous_output
  }

  // Determine the source - either a file path or raw prompt text
  // For raw mode, we pass the raw text prefixed with "raw:" so the executor knows to use it directly
  const sourceToExecute = data.sourceType === 'raw' && data.rawPrompt
    ? `raw:${data.rawPrompt}`
    : data.source

  // Emit beforeExecution checkpoint event
  const beforeEvent: AgentCheckpointEvent = {
    type: 'iteration',
    timestamp: Date.now(),
    iteration: 1,
    agentNodeId: node.id,
    data: {
      iterationNumber: 1,
      llmInput: {
        systemPrompt: data.sourceType === 'raw' ? (data.rawPrompt || '') : `File: ${data.source || 'unknown'}`,
        messages: [{ role: 'user', content: JSON.stringify(allParams, null, 2) }]
      },
      llmOutput: {
        response: '',
        hasToolCall: false,
      },
      durationMs: 0,
    } as IterationEventData,
  }
  const shouldContinueBefore = await emitAgentCheckpoint(beforeEvent, options, workflowFile)
  if (!shouldContinueBefore) {
    throw new Error('Checkpoint cancelled execution')
  }

  // Execute the prompt
  if (!options.executePrompt) {
    throw new Error('No executePrompt function provided')
  }

  let result: unknown
  try {
    result = await options.executePrompt(
      sourceToExecute,
      allParams,
      data.provider,
      data.model
    )
  } catch (error) {
    // Emit error checkpoint event
    const errorEvent: AgentCheckpointEvent = {
      type: 'error',
      timestamp: Date.now(),
      iteration: 1,
      agentNodeId: node.id,
      data: {
        message: error instanceof Error ? error.message : String(error),
        code: 'PROMPT_EXECUTION_ERROR',
        stack: error instanceof Error ? error.stack : undefined,
        recoverable: false,
      } as ErrorEventData,
    }
    await emitAgentCheckpoint(errorEvent, options, workflowFile)
    throw error
  }

  // Emit afterExecution checkpoint event
  const afterEvent: AgentCheckpointEvent = {
    type: 'complete',
    timestamp: Date.now(),
    iteration: 1,
    agentNodeId: node.id,
    data: {
      finalResponse: typeof result === 'string' ? result : JSON.stringify(result),
      totalIterations: 1,
      totalDurationMs: Date.now() - startTime,
      stopReason: 'completed',
    } as CompleteEventData,
  }
  await emitAgentCheckpoint(afterEvent, options, workflowFile)

  // Apply output mapping if defined
  if (data.outputMapping) {
    const mapped: Record<string, unknown> = {}
    for (const [key, expr] of Object.entries(data.outputMapping)) {
      if (expr === '{{ response }}') {
        mapped[key] = result
      } else {
        mapped[key] = evaluateExpression(expr, {
          ...context,
          nodeOutputs: { ...context.nodeOutputs, response: result },
        })
      }
    }
    return mapped
  }

  return result
}

/**
 * Execute a guardrail node - validates input and routes to success/rejected paths
 *
 * The guardrail node:
 * 1. Takes the previous_output as input to validate
 * 2. Sends it to an LLM with a validation system prompt
 * 3. Parses the LLM response for pass/fail determination
 * 4. Routes to either 'output' (success) or 'rejected' (fail) handles
 *
 * Pass/fail is determined by:
 * - passExpression: A template expression evaluated against the LLM response
 * - scoreThreshold: If response has a 'score' field, compare against threshold
 * - Default: If response has 'rejected' field, use its boolean value
 */
async function executeGuardrailNode(
  node: WorkflowNode,
  context: {
    nodeOutputs: Record<string, unknown>
    variables: Record<string, unknown>
    workflow: Record<string, unknown>
    previous_output?: unknown
  },
  options: ExecutorOptions,
  trace: ExecutionTrace,
  workflowFile: WorkflowFile
): Promise<{ rejected: boolean; score?: number; input?: unknown; analysis?: string; response?: unknown }> {
  const data = node.data as GuardrailNodeData
  const startTime = Date.now()

  // The input to validate is the previous output
  const inputToValidate = context.previous_output

  addTraceEntry(trace, {
    type: 'debug_step',
    nodeId: node.id,
    nodeName: data.label,
    message: `Guardrail validating input`,
    data: { input: inputToValidate, systemPrompt: data.systemPrompt?.substring(0, 100) },
  }, options)

  // If no system prompt configured, pass through
  if (!data.systemPrompt) {
    addTraceEntry(trace, {
      type: 'debug_step',
      nodeId: node.id,
      nodeName: data.label,
      message: 'No system prompt configured, passing input through',
    }, options)
    return { rejected: false, input: inputToValidate }
  }

  // Resolve provider from providerNodeId or inline config
  let provider = data.provider
  let model = data.model

  if (data.providerNodeId) {
    const providerNode = workflowFile.nodes.find(n => n.id === data.providerNodeId)
    if (providerNode && providerNode.type === 'provider') {
      const providerData = providerNode.data as { providerId: string; model: string }
      provider = providerData.providerId
      model = providerData.model
    }
  }

  // Build the validation prompt - inject the input into the system prompt
  const inputStr = typeof inputToValidate === 'string'
    ? inputToValidate
    : JSON.stringify(inputToValidate, null, 2)

  // Create a raw prompt that validates the input
  // The system prompt should instruct the LLM to analyze and return a structured response
  const validationPrompt = `---
id: guardrail-validation
name: Guardrail Validation
version: 1.0.0
description: Validates input against guardrail criteria
---

# System
${data.systemPrompt}

# Input to Validate
\`\`\`
${inputStr}
\`\`\`

# Instructions
Analyze the input above according to the system criteria. Return your analysis as a JSON object with the following structure:
\`\`\`json
{
  "analysis": "Your analysis of the input",
  "score": 0.0 to 1.0,
  "rejected": true or false
}
\`\`\`
`

  // Emit beforeValidation checkpoint event
  const beforeEvent: AgentCheckpointEvent = {
    type: 'iteration',
    timestamp: Date.now(),
    iteration: 1,
    agentNodeId: node.id,
    data: {
      iterationNumber: 1,
      llmInput: {
        systemPrompt: data.systemPrompt,
        messages: [{ role: 'user', content: `Validating: ${inputStr.substring(0, 200)}${inputStr.length > 200 ? '...' : ''}` }]
      },
      llmOutput: {
        response: '',
        hasToolCall: false,
      },
      durationMs: 0,
    } as IterationEventData,
  }
  const shouldContinueBefore = await emitAgentCheckpoint(beforeEvent, options, workflowFile)
  if (!shouldContinueBefore) {
    return { rejected: true, input: inputToValidate }
  }

  // Execute the validation prompt
  if (!options.executePrompt) {
    throw new Error('No executePrompt function provided for guardrail validation')
  }

  let llmResponse: unknown
  try {
    llmResponse = await options.executePrompt(
      `raw:${validationPrompt}`,
      { previous_output: inputToValidate },
      provider,
      model
    )
  } catch (error) {
    addTraceEntry(trace, {
      type: 'node_error',
      nodeId: node.id,
      nodeName: data.label,
      message: `Guardrail LLM call failed: ${error instanceof Error ? error.message : String(error)}`,
    }, options)

    // Emit error checkpoint event
    const errorEvent: AgentCheckpointEvent = {
      type: 'error',
      timestamp: Date.now(),
      iteration: 1,
      agentNodeId: node.id,
      data: {
        message: error instanceof Error ? error.message : String(error),
        code: 'GUARDRAIL_EXECUTION_ERROR',
        stack: error instanceof Error ? error.stack : undefined,
        recoverable: false,
      } as ErrorEventData,
    }
    await emitAgentCheckpoint(errorEvent, options, workflowFile)

    // On error, reject by default for safety
    return { rejected: true, input: inputToValidate }
  }

  addTraceEntry(trace, {
    type: 'debug_step',
    nodeId: node.id,
    nodeName: data.label,
    message: `Guardrail LLM response received`,
    data: { response: llmResponse },
  }, options)

  // Parse the LLM response
  let parsedResponse: { analysis?: string; score?: number; rejected?: boolean } = {}

  if (typeof llmResponse === 'string') {
    // Try to extract JSON from the response (may be wrapped in markdown code blocks)
    const jsonMatch = llmResponse.match(/```(?:json)?\s*([\s\S]*?)```/)
    const jsonString = jsonMatch ? jsonMatch[1].trim() : llmResponse.trim()

    try {
      parsedResponse = JSON.parse(jsonString)
    } catch {
      // If we can't parse JSON, treat it as a text response
      // Look for keywords to determine pass/fail
      const lowerResponse = llmResponse.toLowerCase()
      parsedResponse = {
        analysis: llmResponse,
        rejected: lowerResponse.includes('reject') || lowerResponse.includes('fail') || lowerResponse.includes('invalid'),
      }
    }
  } else if (typeof llmResponse === 'object' && llmResponse !== null) {
    parsedResponse = llmResponse as typeof parsedResponse
  }

  // Determine pass/fail
  let rejected = false

  // Method 1: Use passExpression if provided
  if (data.passExpression) {
    const expressionContext = {
      ...context,
      nodeOutputs: { ...context.nodeOutputs, response: parsedResponse },
      // Make response fields directly accessible
      score: parsedResponse.score,
      rejected: parsedResponse.rejected,
      analysis: parsedResponse.analysis,
    }
    const passResult = evaluateExpression(data.passExpression, expressionContext)
    rejected = !passResult

    addTraceEntry(trace, {
      type: 'expression_eval',
      nodeId: node.id,
      nodeName: data.label,
      message: `Guardrail passExpression '${data.passExpression}' evaluated to ${passResult}`,
      data: { expression: data.passExpression, result: passResult, rejected },
    }, options)
  }
  // Method 2: Use scoreThreshold if provided and response has score
  else if (data.scoreThreshold !== undefined && parsedResponse.score !== undefined) {
    rejected = parsedResponse.score < data.scoreThreshold

    addTraceEntry(trace, {
      type: 'expression_eval',
      nodeId: node.id,
      nodeName: data.label,
      message: `Guardrail score ${parsedResponse.score} ${rejected ? '<' : '>='} threshold ${data.scoreThreshold}`,
      data: { score: parsedResponse.score, threshold: data.scoreThreshold, rejected },
    }, options)
  }
  // Method 3: Use the 'rejected' field from the response
  else if (parsedResponse.rejected !== undefined) {
    rejected = parsedResponse.rejected

    addTraceEntry(trace, {
      type: 'expression_eval',
      nodeId: node.id,
      nodeName: data.label,
      message: `Guardrail using response.rejected = ${rejected}`,
      data: { rejected },
    }, options)
  }

  // Emit completion checkpoint event with full validation results
  const completeEvent: AgentCheckpointEvent = {
    type: 'complete',
    timestamp: Date.now(),
    iteration: 1,
    agentNodeId: node.id,
    data: {
      finalResponse: JSON.stringify({
        rejected,
        score: parsedResponse.score,
        analysis: parsedResponse.analysis,
        input: inputToValidate,
        validationMethod: data.passExpression ? 'expression' : data.scoreThreshold !== undefined ? 'threshold' : 'response_field',
      }),
      totalIterations: 1,
      totalDurationMs: Date.now() - startTime,
      stopReason: 'no-tool-call', // Guardrails don't use tool calls - validation completed
    } as CompleteEventData,
  }
  await emitAgentCheckpoint(completeEvent, options, workflowFile)

  return {
    rejected,
    score: parsedResponse.score,
    input: inputToValidate,
    analysis: parsedResponse.analysis,
    response: parsedResponse,
  }
}

/**
 * Execute a condition node
 */
function executeConditionNode(
  node: WorkflowNode,
  context: {
    nodeOutputs: Record<string, unknown>
    variables: Record<string, unknown>
    workflow: Record<string, unknown>
    previous_output?: unknown
  }
): { branch: string; target: string } {
  const data = node.data as ConditionNodeData

  // Evaluate conditions in order
  for (const condition of data.conditions || []) {
    const result = evaluateExpression(condition.expression, context)
    if (result) {
      return { branch: condition.id, target: condition.target }
    }
  }

  // Return default
  return { branch: 'default', target: data.default || '' }
}

/**
 * Execute a subset of nodes (used by loop and parallel nodes)
 * Returns the output of the last executed node
 */
async function executeNodeSubset(
  nodeIds: string[],
  workflowFile: WorkflowFile,
  context: {
    nodeOutputs: Record<string, unknown>
    variables: Record<string, unknown>
    workflow: Record<string, unknown>
    previous_output?: unknown
  },
  options: ExecutorOptions,
  state: WorkflowExecutionState,
  trace: ExecutionTrace
): Promise<unknown> {
  let lastOutput: unknown = context.previous_output

  for (const nodeId of nodeIds) {
    const node = workflowFile.nodes.find((n: WorkflowNode) => n.id === nodeId)
    if (!node) {
      console.warn(`[executeNodeSubset] Node not found: ${nodeId}`)
      continue
    }

    // Skip disabled nodes
    const nodeData = node.data as BaseNodeData
    if (nodeData.disabled) {
      // Initialize node state as skipped
      if (!state.nodeStates[nodeId]) {
        state.nodeStates[nodeId] = {
          nodeId,
          status: 'skipped',
          retryCount: 0,
        }
      } else {
        state.nodeStates[nodeId].status = 'skipped'
      }

      addTraceEntry(trace, {
        type: 'debug_step',
        nodeId,
        nodeName: nodeData.label,
        nodeType: node.type,
        message: `Skipping disabled node '${nodeData.label}' in subset execution`,
      }, options)

      options.onProgress?.(deepClone(state))
      continue
    }

    const nodeStartTime = Date.now()

    // Initialize node state if needed
    if (!state.nodeStates[nodeId]) {
      state.nodeStates[nodeId] = {
        nodeId,
        status: 'pending',
        retryCount: 0,
      }
    }

    state.nodeStates[nodeId].status = 'running'
    state.nodeStates[nodeId].startTime = nodeStartTime
    options.onNodeStart?.(nodeId)

    addTraceEntry(trace, {
      type: 'node_start',
      nodeId,
      nodeName: node.data.label,
      nodeType: node.type,
      message: `Starting node '${node.data.label}' (${node.type}) in subset execution`,
      data: { nodeData: node.data },
    }, options)

    try {
      // Build context for this node
      const nodeContext = {
        nodeOutputs: state.nodeOutputs,
        variables: state.variables,
        workflow: context.workflow,
        previous_output: lastOutput,
      }

      // Execute based on node type
      let output: unknown

      switch (node.type) {
        case 'prompt':
          output = await executePromptNode(node, nodeContext, options, trace, state, workflowFile)
          break

        case 'condition':
          output = executeConditionNode(node, nodeContext)
          break

        case 'transformer':
          output = executeTransformerNode(node, nodeContext)
          break

        case 'memory':
          output = executeMemoryNode(node, nodeContext, state)
          break

        case 'merge':
          output = executeMergeNode(node, nodeContext)
          break

        case 'callback':
        case 'checkpoint':
          // Execute callback node with full checkpoint support (pause, report, etc.)
          // Need to pass execution order for next node info - use nodeIds as the subset order
          output = await executeCallbackNode(node, nodeContext, options, state, workflowFile, nodeIds, trace)
          break

        case 'user-input':
          output = await executeUserInputNode(node, nodeContext, options, trace)
          break

        case 'command':
          output = await executeCommandNode(node, nodeContext, options, trace)
          break

        case 'mcp-tool':
          output = await executeMcpToolNode(node, nodeContext, options, trace)
          break

        case 'agent':
          output = await executeAgentNode(node, nodeContext, options, trace, state, workflowFile)
          break

        case 'chat-agent':
          // Chat Agent uses a simplified context since branching is handled internally
          output = await executeChatAgentNode(
            node,
            nodeContext,
            options,
            trace,
            state,
            workflowFile,
            new Map(), // branchingTargetMap - not used in parallel execution
            new Set()  // skippedNodes - not used in parallel execution
          )
          break

        case 'guardrail':
          output = await executeGuardrailNode(node, nodeContext, options, trace, workflowFile)
          break

        case 'output':
          output = lastOutput
          break

        default:
          output = lastOutput
      }

      const nodeDuration = Date.now() - nodeStartTime

      // Store output
      state.nodeOutputs[nodeId] = output
      trace.nodeOutputs[nodeId] = output
      lastOutput = output

      state.nodeStates[nodeId].status = 'completed'
      state.nodeStates[nodeId].endTime = Date.now()
      state.nodeStates[nodeId].output = output

      addTraceEntry(trace, {
        type: 'node_complete',
        nodeId,
        nodeName: node.data.label,
        nodeType: node.type,
        message: `Completed node '${node.data.label}' in subset execution`,
        data: { output },
        duration: nodeDuration,
      }, options)

      options.onNodeComplete?.(nodeId, output)
      options.onProgress?.(deepClone(state))

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      state.nodeStates[nodeId].status = 'failed'
      state.nodeStates[nodeId].error = errorMessage
      state.nodeStates[nodeId].endTime = Date.now()

      addTraceEntry(trace, {
        type: 'node_error',
        nodeId,
        nodeName: node.data.label,
        nodeType: node.type,
        message: `Error in node '${node.data.label}': ${errorMessage}`,
        data: { error: errorMessage },
      }, options)

      options.onNodeError?.(nodeId, errorMessage)
      throw error // Re-throw to let caller handle
    }
  }

  return lastOutput
}

/**
 * Execute a loop node - executes body nodes on each iteration
 */
async function executeLoopNode(
  node: WorkflowNode,
  context: {
    nodeOutputs: Record<string, unknown>
    variables: Record<string, unknown>
    workflow: Record<string, unknown>
    previous_output?: unknown
  },
  options: ExecutorOptions,
  state: WorkflowExecutionState,
  workflowFile: WorkflowFile,
  trace: ExecutionTrace
): Promise<{ iterations: number; results: unknown[]; lastOutput: unknown }> {
  const data = node.data as LoopNodeData
  const results: unknown[] = []
  let iteration = 0
  let lastOutput: unknown = context.previous_output

  // For for-each loops, evaluate the items expression
  let items: unknown[] = []
  if (data.loopType === 'for-each' && data.items) {
    const evaluated = evaluateExpression(data.items, context)
    if (Array.isArray(evaluated)) {
      items = evaluated
    } else {
      console.warn(`[LoopNode] items expression did not evaluate to array:`, evaluated)
    }
  }

  // Get body nodes from parentId relationship or fallback to data.body
  const bodyNodeIds = getChildNodeIds(node.id, workflowFile, data)

  addTraceEntry(trace, {
    type: 'debug_step',
    nodeId: node.id,
    nodeName: node.data.label,
    nodeType: 'loop',
    message: `Starting loop (${data.loopType}) with max ${data.maxIterations} iterations`,
    data: { loopType: data.loopType, bodyNodes: bodyNodeIds, itemCount: items.length },
  }, options)

  while (iteration < data.maxIterations) {
    // Update iteration variables
    state.variables['iteration_count'] = iteration
    state.variables['iteration_index'] = iteration

    // Handle different loop types
    if (data.loopType === 'while' && data.condition) {
      const shouldContinue = evaluateExpression(data.condition, {
        ...context,
        variables: state.variables,
        nodeOutputs: state.nodeOutputs,
      })
      if (!shouldContinue) {
        addTraceEntry(trace, {
          type: 'debug_step',
          nodeId: node.id,
          message: `While condition evaluated to false, exiting loop`,
          data: { condition: data.condition, iteration },
        }, options)
        break
      }
    }

    if (data.loopType === 'count') {
      if (iteration >= (data.count || 0)) {
        break
      }
    }

    if (data.loopType === 'for-each') {
      if (iteration >= items.length) {
        break
      }
      // Set the current item variable
      const itemVarName = data.itemVariable || 'item'
      state.variables[itemVarName] = items[iteration]
      state.variables['current_item'] = items[iteration]
    }

    addTraceEntry(trace, {
      type: 'debug_step',
      nodeId: node.id,
      message: `Loop iteration ${iteration + 1}`,
      data: { iteration, variables: { ...state.variables } },
    }, options)

    // Execute body nodes
    if (bodyNodeIds.length > 0) {
      try {
        const iterationOutput = await executeNodeSubset(
          bodyNodeIds,
          workflowFile,
          {
            ...context,
            nodeOutputs: state.nodeOutputs,
            variables: state.variables,
            previous_output: lastOutput,
          },
          options,
          state,
          trace
        )
        results.push(iterationOutput)
        lastOutput = iterationOutput
      } catch (error) {
        // Log error but continue to next iteration based on error handling policy
        const errorMessage = error instanceof Error ? error.message : String(error)
        addTraceEntry(trace, {
          type: 'node_error',
          nodeId: node.id,
          message: `Loop iteration ${iteration} failed: ${errorMessage}`,
          data: { iteration, error: errorMessage },
        }, options)

        // Re-throw if we should stop on error
        const errorPolicy = workflowFile.errorHandling?.onError || 'stop'
        if (errorPolicy === 'stop') {
          throw error
        }
        results.push({ error: errorMessage, iteration })
      }
    } else {
      // No body nodes, just track iteration
      results.push({ iteration, noBody: true })
    }

    iteration++
  }

  addTraceEntry(trace, {
    type: 'debug_step',
    nodeId: node.id,
    nodeName: node.data.label,
    message: `Loop completed after ${iteration} iterations`,
    data: { totalIterations: iteration, resultsCount: results.length },
  }, options)

  return { iterations: iteration, results, lastOutput }
}

/**
 * Execute a parallel node - executes all branches concurrently
 */
async function executeParallelNode(
  node: WorkflowNode,
  context: {
    nodeOutputs: Record<string, unknown>
    variables: Record<string, unknown>
    workflow: Record<string, unknown>
    previous_output?: unknown
  },
  options: ExecutorOptions,
  state: WorkflowExecutionState,
  workflowFile: WorkflowFile,
  trace: ExecutionTrace
): Promise<Record<string, unknown> | unknown[]> {
  const data = node.data as ParallelNodeData

  // Get child nodes from parentId relationship
  // Each child node becomes its own parallel "branch"
  const childNodeIds = getChildNodeIds(node.id, workflowFile, data)

  // If using parentId, each child is a separate parallel execution
  // If using explicit branches, use those
  const hasBranches = data.branches && data.branches.length > 0
  const hasChildNodes = childNodeIds.length > 0 && !hasBranches

  addTraceEntry(trace, {
    type: 'debug_step',
    nodeId: node.id,
    nodeName: node.data.label,
    nodeType: 'parallel',
    message: `Starting parallel execution with ${hasChildNodes ? childNodeIds.length : (data.branches?.length || 0)} branches (waitFor: ${data.waitFor})`,
    data: {
      branches: hasChildNodes
        ? childNodeIds.map(id => ({ id, nodeCount: 1 }))
        : data.branches?.map(b => ({ id: b.id, nodeCount: b.nodes.length }))
    },
  }, options)

  // Build branch promises - either from explicit branches or from child nodes
  let branchPromises: Promise<{ branchId: string; result: unknown; success: boolean; error?: string }>[]

  if (hasChildNodes) {
    // Each child node runs in parallel as its own branch
    branchPromises = childNodeIds.map(async (childId) => {
      const childNode = workflowFile.nodes.find(n => n.id === childId)
      const branchLabel = childNode?.data?.label || childId

      addTraceEntry(trace, {
        type: 'debug_step',
        nodeId: node.id,
        message: `Starting parallel branch '${branchLabel}'`,
        data: { branchId: childId },
      }, options)

      try {
        const branchOutput = await executeNodeSubset(
          [childId],
          workflowFile,
          {
            ...context,
            previous_output: context.previous_output,
          },
          options,
          state,
          trace
        )

        addTraceEntry(trace, {
          type: 'debug_step',
          nodeId: node.id,
          message: `Branch '${branchLabel}' completed successfully`,
          data: { branchId: childId, output: branchOutput },
        }, options)

        return { branchId: childId, result: branchOutput, success: true }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        addTraceEntry(trace, {
          type: 'node_error',
          nodeId: node.id,
          message: `Branch '${branchLabel}' failed: ${errorMessage}`,
          data: { branchId: childId, error: errorMessage },
        }, options)

        return { branchId: childId, result: null, success: false, error: errorMessage }
      }
    })
  } else {
    // Use explicit branches configuration
    branchPromises = (data.branches || []).map(async (branch) => {
      addTraceEntry(trace, {
        type: 'debug_step',
        nodeId: node.id,
        message: `Starting branch '${branch.id}' with ${branch.nodes.length} nodes`,
        data: { branchId: branch.id, nodes: branch.nodes },
      }, options)

      try {
        const branchOutput = await executeNodeSubset(
          branch.nodes,
          workflowFile,
          {
            ...context,
            previous_output: context.previous_output,
          },
          options,
          state,
          trace
        )

        addTraceEntry(trace, {
          type: 'debug_step',
          nodeId: node.id,
          message: `Branch '${branch.id}' completed successfully`,
          data: { branchId: branch.id, output: branchOutput },
        }, options)

        return { branchId: branch.id, result: branchOutput, success: true }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        addTraceEntry(trace, {
          type: 'node_error',
          nodeId: node.id,
          message: `Branch '${branch.id}' failed: ${errorMessage}`,
          data: { branchId: branch.id, error: errorMessage },
        }, options)

        return { branchId: branch.id, result: null, success: false, error: errorMessage }
      }
    })
  }

  // Wait based on waitFor strategy
  let results: Array<{ branchId: string; result: unknown; success: boolean; error?: string }>

  if (data.waitFor === 'race') {
    // Return first completed (successful or not)
    const first = await Promise.race(branchPromises)
    results = [first]
  } else if (data.waitFor === 'any') {
    // Wait for first successful completion using a custom implementation
    // (Promise.any requires ES2021+ target)
    const allResults = await Promise.all(branchPromises)
    const firstSuccess = allResults.find(r => r.success)
    if (firstSuccess) {
      results = [firstSuccess]
    } else {
      // All branches failed, return all results
      results = allResults
    }
  } else {
    // 'all' - wait for all branches
    results = await Promise.all(branchPromises)
  }

  addTraceEntry(trace, {
    type: 'debug_step',
    nodeId: node.id,
    nodeName: node.data.label,
    message: `Parallel execution completed with ${results.length} results`,
    data: { results: results.map(r => ({ branchId: r.branchId, success: r.success })) },
  }, options)

  // Merge based on strategy
  if (data.mergeStrategy === 'object') {
    const merged: Record<string, unknown> = {}
    for (const result of results) {
      merged[result.branchId] = result.result
    }
    return merged
  }

  if (data.mergeStrategy === 'first') {
    const firstSuccess = results.find(r => r.success)
    return firstSuccess ? { result: firstSuccess.result } : { error: 'All branches failed' }
  }

  // 'array' strategy - return array of results
  return results.map(r => r.result)
}

/**
 * Execute a merge node - combines multiple inputs into a single output
 *
 * The merge node has two modes:
 * - 'wait' (default): Only executes when ALL connected inputs have outputs available.
 *   If some inputs are missing (e.g., skipped by condition branching), those are excluded.
 * - 'transform': Executes immediately with whatever inputs are available (router/passthrough).
 *
 * Input sources (in priority order):
 * 1. Connected edges (source nodes that feed into merge node's input handles)
 * 2. Explicit input expressions in data.inputs array
 * 3. previous_output as fallback
 */
function executeMergeNode(
  node: WorkflowNode,
  context: {
    nodeOutputs: Record<string, unknown>
    variables: Record<string, unknown>
    workflow: Record<string, unknown>
    previous_output?: unknown
  },
  workflowFile?: WorkflowFile,
  skippedNodes?: Set<string>
): Record<string, unknown> | unknown[] | { waiting: true; missingInputs: string[] } {
  const data = node.data as MergeNodeData
  const mode = data.mode || 'wait' // Default to wait mode
  const evaluatedInputs: Array<{ key: string; value: unknown }> = []
  const missingInputs: string[] = []
  const expectedInputs: string[] = []

  // First, collect inputs from connected edges if workflow file is provided
  if (workflowFile) {
    // Find all edges targeting this merge node
    const incomingEdges = workflowFile.edges.filter(
      edge => edge.target === node.id && edge.targetHandle?.startsWith('input-')
    )

    // Sort edges by their handle index for consistent ordering
    incomingEdges.sort((a, b) => {
      const aIndex = parseInt(a.targetHandle?.replace('input-', '') || '0', 10)
      const bIndex = parseInt(b.targetHandle?.replace('input-', '') || '0', 10)
      return aIndex - bIndex
    })

    for (const edge of incomingEdges) {
      const sourceNode = workflowFile.nodes.find(n => n.id === edge.source)
      const sourceId = edge.source
      const key = sourceNode?.data?.label || sourceId

      // Check if source node was skipped (e.g., by condition branching)
      const wasSkipped = skippedNodes?.has(sourceId)

      if (wasSkipped) {
        // Node was skipped, don't wait for it
        continue
      }

      expectedInputs.push(key)
      const sourceOutput = context.nodeOutputs[sourceId]

      if (sourceOutput !== undefined) {
        evaluatedInputs.push({ key, value: sourceOutput })
      } else {
        missingInputs.push(key)
      }
    }
  }

  // In wait mode, check if we have all expected inputs
  if (mode === 'wait' && missingInputs.length > 0) {
    // Return a waiting signal - the executor should handle this
    return { waiting: true, missingInputs }
  }

  // If no edge inputs, fall back to explicit input expressions
  if (evaluatedInputs.length === 0 && data.inputs && data.inputs.length > 0) {
    for (let i = 0; i < data.inputs.length; i++) {
      const inputExpr = data.inputs[i]
      const value = evaluateExpression(inputExpr, context)
      // Extract a key from the expression or use index
      const key = inputExpr.replace(/\{\{|\}\}/g, '').trim().split('.')[0] || `input${i}`
      evaluatedInputs.push({ key, value })
    }
  }

  // If still no inputs, use previous_output as single input
  if (evaluatedInputs.length === 0 && context.previous_output !== undefined) {
    evaluatedInputs.push({ key: 'previous', value: context.previous_output })
  }

  // Merge based on strategy
  if (data.mergeAs === 'array') {
    return evaluatedInputs.map(input => input.value)
  }

  // 'object' strategy - create keyed object
  const merged: Record<string, unknown> = {}
  for (const input of evaluatedInputs) {
    // If the value is an object, either merge its properties or use the key
    if (typeof input.value === 'object' && input.value !== null && !Array.isArray(input.value)) {
      // Use the input key as a namespace to avoid collisions
      merged[input.key] = input.value
    } else {
      merged[input.key] = input.value
    }
  }
  return merged
}

/**
 * Execute a transformer node - applies JSON template transformation
 */
function executeTransformerNode(
  node: WorkflowNode,
  context: {
    nodeOutputs: Record<string, unknown>
    variables: Record<string, unknown>
    workflow: Record<string, unknown>
    previous_output?: unknown
  }
): unknown {
  const data = node.data as TransformerNodeData

  if (!data.transform) {
    return context.previous_output
  }

  // The transform is a JSON template string with {{ }} expressions
  // We need to parse it and evaluate all expressions
  try {
    // First, try to parse as JSON with template replacements
    let transformTemplate = data.transform

    // Find all {{ }} expressions and evaluate them
    const expressionRegex = /\{\{([^}]+)\}\}/g
    const evaluatedTemplate = transformTemplate.replace(expressionRegex, (match) => {
      const value = evaluateExpression(match, context)
      // Convert to JSON-safe string representation
      if (value === undefined || value === null) {
        return 'null'
      }
      if (typeof value === 'string') {
        // Escape for JSON string context - but we might be inside a JSON string already
        // For safety, return the raw value and let JSON.parse handle it
        return JSON.stringify(value).slice(1, -1) // Remove surrounding quotes
      }
      if (typeof value === 'object') {
        return JSON.stringify(value)
      }
      return String(value)
    })

    // Try to parse the result as JSON
    try {
      return JSON.parse(evaluatedTemplate)
    } catch {
      // If not valid JSON, return as string
      return evaluatedTemplate
    }
  } catch (error) {
    console.warn(`[TransformerNode] Transform error:`, error)
    return context.previous_output
  }
}

/**
 * Execute a memory node - KV store, conversation history, or cache operations
 *
 * Memory is stored in the workflow execution state and persists according
 * to the configured scope:
 * - 'execution': Cleared when workflow execution completes (default)
 * - 'workflow': Persists across executions (stored in state.variables)
 * - 'global': Shared across all workflows (would need external storage)
 */
function executeMemoryNode(
  node: WorkflowNode,
  context: {
    nodeOutputs: Record<string, unknown>
    variables: Record<string, unknown>
    workflow: Record<string, unknown>
    previous_output?: unknown
  },
  state: WorkflowExecutionState
): unknown {
  const data = node.data as MemoryNodeData
  const mode = data.mode || 'kv'

  // Support both old 'operation' (single) and new 'operations' (array)
  const operations: string[] = data.operations ||
    ((data as { operation?: string }).operation ? [(data as { operation?: string }).operation!] : ['get'])

  // Determine which operation to execute:
  // 1. If only one operation is enabled, use it
  // 2. If multiple operations and input has an 'operation' field, use that
  // 3. Default to the first enabled operation
  let operation: string
  if (operations.length === 1) {
    operation = operations[0]
  } else {
    const inputData = context.previous_output as { operation?: string } | undefined
    if (inputData?.operation && operations.includes(inputData.operation)) {
      operation = inputData.operation
    } else {
      operation = operations[0]
    }
  }

  const scope = data.scope || 'execution'
  const namespace = data.namespace || ''
  const outputMode = data.outputMode || 'value'

  // Initialize memory storage in state if not present
  if (!state.memory) {
    state.memory = {
      kv: {},
      conversation: {},
      cache: {},
    }
  }

  // Helper to get namespaced storage
  const getStorage = (type: 'kv' | 'conversation' | 'cache') => {
    const storage = state.memory![type]
    if (namespace) {
      if (!storage[namespace]) {
        storage[namespace] = type === 'conversation' ? [] : {}
      }
      return storage[namespace]
    }
    return storage
  }

  // Helper to resolve template expressions in strings
  const resolveTemplate = (template: string | undefined): string | undefined => {
    if (!template) return undefined
    if (!template.includes('{{')) return template

    const result = evaluateExpression(template, context)
    return typeof result === 'string' ? result : String(result)
  }

  // Helper to format output based on outputMode
  const formatOutput = (value: unknown, success: boolean, metadata?: Record<string, unknown>) => {
    switch (outputMode) {
      case 'value':
        return value
      case 'success':
        return success
      case 'metadata':
        return { value, success, timestamp: Date.now(), ...metadata }
      case 'passthrough':
        return context.previous_output
      default:
        return value
    }
  }

  try {
    switch (mode) {
      case 'kv': {
        const storage = getStorage('kv') as Record<string, unknown>
        const key = resolveTemplate(data.key)

        switch (operation) {
          case 'get': {
            if (!key) {
              console.warn('[MemoryNode] KV get requires a key')
              return formatOutput(data.defaultValue, false)
            }
            const value = storage[key]
            if (value === undefined) {
              return formatOutput(data.defaultValue, false, { key, found: false })
            }
            return formatOutput(value, true, { key, found: true })
          }
          case 'set': {
            if (!key) {
              console.warn('[MemoryNode] KV set requires a key')
              return formatOutput(undefined, false)
            }
            const valueToStore = data.value
              ? resolveTemplate(data.value)
              : context.previous_output
            storage[key] = valueToStore
            return formatOutput(valueToStore, true, { key })
          }
          case 'delete': {
            if (!key) {
              console.warn('[MemoryNode] KV delete requires a key')
              return formatOutput(undefined, false)
            }
            const existed = key in storage
            delete storage[key]
            return formatOutput(undefined, existed, { key, deleted: existed })
          }
          case 'list': {
            const keys = Object.keys(storage)
            return formatOutput(keys, true, { count: keys.length })
          }
          case 'clear': {
            const count = Object.keys(storage).length
            for (const k of Object.keys(storage)) {
              delete storage[k]
            }
            return formatOutput(undefined, true, { clearedCount: count })
          }
          default:
            console.warn(`[MemoryNode] Unknown KV operation: ${operation}`)
            return formatOutput(undefined, false)
        }
      }

      case 'conversation': {
        const conversationId = resolveTemplate(data.conversationId) || 'default'
        const conversationStorage = state.memory!.conversation

        if (!conversationStorage[conversationId]) {
          conversationStorage[conversationId] = []
        }
        const messages = conversationStorage[conversationId] as Array<{
          role: string
          content: string
          timestamp: number
        }>

        switch (operation) {
          case 'get': {
            // Return the conversation history
            return formatOutput(messages, true, {
              conversationId,
              messageCount: messages.length,
            })
          }
          case 'append': {
            const role = data.messageRole || 'user'
            const content = typeof context.previous_output === 'string'
              ? context.previous_output
              : JSON.stringify(context.previous_output)

            const message = {
              role,
              content,
              timestamp: Date.now(),
            }

            messages.push(message)

            // Apply sliding window if configured
            const maxMessages = data.maxMessages ?? 0
            if (maxMessages > 0) {
              const includeSystem = data.includeSystemInWindow ?? true

              if (includeSystem) {
                // Simple case: just trim to max
                while (messages.length > maxMessages) {
                  messages.shift()
                }
              } else {
                // Keep system messages, trim others
                const systemMessages = messages.filter(m => m.role === 'system')
                const nonSystemMessages = messages.filter(m => m.role !== 'system')

                while (nonSystemMessages.length > maxMessages) {
                  nonSystemMessages.shift()
                }

                // Rebuild array preserving original order
                conversationStorage[conversationId] = messages.filter(m =>
                  m.role === 'system' || nonSystemMessages.includes(m)
                )
              }
            }

            return formatOutput(message, true, {
              conversationId,
              messageCount: messages.length,
            })
          }
          case 'clear': {
            const count = messages.length
            conversationStorage[conversationId] = []
            return formatOutput(undefined, true, {
              conversationId,
              clearedCount: count,
            })
          }
          default:
            console.warn(`[MemoryNode] Unknown conversation operation: ${operation}`)
            return formatOutput(undefined, false)
        }
      }

      case 'cache': {
        const cacheStorage = getStorage('cache') as Record<string, {
          value: unknown
          timestamp: number
          ttl: number
        }>
        const key = resolveTemplate(data.key)

        switch (operation) {
          case 'get': {
            if (!key) {
              console.warn('[MemoryNode] Cache get requires a key')
              return formatOutput(data.defaultValue, false)
            }

            const cached = cacheStorage[key]
            if (!cached) {
              return formatOutput(data.defaultValue, false, { key, hit: false })
            }

            // Check if expired
            const now = Date.now()
            if (cached.ttl > 0 && now - cached.timestamp > cached.ttl * 1000) {
              // Expired - remove and return default
              delete cacheStorage[key]
              return formatOutput(data.defaultValue, false, { key, hit: false, expired: true })
            }

            // Refresh TTL on read if configured
            if (data.refreshOnRead && cached.ttl > 0) {
              cached.timestamp = now
            }

            return formatOutput(cached.value, true, {
              key,
              hit: true,
              age: now - cached.timestamp,
              ttl: cached.ttl,
            })
          }
          case 'set': {
            if (!key) {
              console.warn('[MemoryNode] Cache set requires a key')
              return formatOutput(undefined, false)
            }

            const valueToCache = data.value
              ? resolveTemplate(data.value)
              : context.previous_output
            const ttl = data.ttlSeconds ?? 0

            cacheStorage[key] = {
              value: valueToCache,
              timestamp: Date.now(),
              ttl,
            }

            return formatOutput(valueToCache, true, { key, ttl })
          }
          case 'delete': {
            if (!key) {
              console.warn('[MemoryNode] Cache delete requires a key')
              return formatOutput(undefined, false)
            }
            const existed = key in cacheStorage
            delete cacheStorage[key]
            return formatOutput(undefined, existed, { key, invalidated: existed })
          }
          case 'clear': {
            const count = Object.keys(cacheStorage).length
            for (const k of Object.keys(cacheStorage)) {
              delete cacheStorage[k]
            }
            return formatOutput(undefined, true, { clearedCount: count })
          }
          default:
            console.warn(`[MemoryNode] Unknown cache operation: ${operation}`)
            return formatOutput(undefined, false)
        }
      }

      default:
        console.warn(`[MemoryNode] Unknown mode: ${mode}`)
        return formatOutput(undefined, false)
    }
  } catch (error) {
    console.error('[MemoryNode] Execution error:', error)
    return formatOutput(undefined, false, {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Execute a user-input node - pauses execution and waits for user input
 */
async function executeUserInputNode(
  node: WorkflowNode,
  context: {
    nodeOutputs: Record<string, unknown>
    variables: Record<string, unknown>
    workflow: Record<string, unknown>
    previous_output?: unknown
  },
  options: ExecutorOptions,
  trace: ExecutionTrace
): Promise<unknown> {
  const data = node.data as UserInputNodeData

  // Resolve the prompt template if it contains expressions
  let resolvedPrompt = data.prompt || 'Enter your input'
  if (resolvedPrompt.includes('{{')) {
    const result = evaluateExpression(resolvedPrompt, context)
    resolvedPrompt = typeof result === 'string' ? result : String(result)
  }

  // Build the user input request
  const request: UserInputRequest = {
    nodeId: node.id,
    nodeLabel: data.label || 'User Input',
    prompt: resolvedPrompt,
    inputType: data.inputType || 'text',
    choices: data.choices,
    placeholder: data.placeholder,
    defaultValue: data.defaultValue,
    required: data.required,
    showContext: data.showContext,
    contextTemplate: data.contextTemplate,
    context: {
      previousOutput: context.previous_output,
      variables: { ...context.variables },
    },
  }

  addTraceEntry(trace, {
    type: 'checkpoint',
    nodeId: node.id,
    nodeName: node.data.label,
    nodeType: 'user-input',
    message: `Waiting for user input: "${resolvedPrompt}"`,
    data: { request },
  }, options)

  // If no callback is provided, pass through with undefined
  if (!options.onUserInput) {
    addTraceEntry(trace, {
      type: 'debug_step',
      nodeId: node.id,
      message: 'No onUserInput callback provided, passing through with undefined',
    }, options)
    return undefined
  }

  // Wait for user input
  const response = await options.onUserInput(request)

  // Check if cancelled
  if (response.cancelled) {
    addTraceEntry(trace, {
      type: 'debug_step',
      nodeId: node.id,
      nodeName: node.data.label,
      message: 'User cancelled input',
      data: { cancelled: true },
    }, options)
    throw new Error(`User cancelled input at node: ${data.label || node.id}`)
  }

  addTraceEntry(trace, {
    type: 'node_complete',
    nodeId: node.id,
    nodeName: node.data.label,
    nodeType: 'user-input',
    message: `User provided input`,
    data: {
      value: response.value,
      valueType: typeof response.value,
      valueLength: typeof response.value === 'string' ? response.value.length : undefined,
    },
  }, options)

  return response.value
}

/**
 * Execute a command node - runs shell commands via Electron IPC
 *
 * Security: Commands are executed via whitelisted Electron IPC handlers.
 * If requiresApproval is true, the command requires user confirmation before execution.
 */
async function executeCommandNode(
  node: WorkflowNode,
  context: {
    nodeOutputs: Record<string, unknown>
    variables: Record<string, unknown>
    workflow: Record<string, unknown>
    previous_output?: unknown
  },
  options: ExecutorOptions,
  trace: ExecutionTrace
): Promise<unknown> {
  const data = node.data as CommandNodeData

  // Resolve command template if it contains expressions
  let resolvedCommand = data.command || ''
  if (resolvedCommand.includes('{{')) {
    const result = evaluateExpression(resolvedCommand, context)
    resolvedCommand = typeof result === 'string' ? result : String(result)
  }

  // Resolve args if they contain expressions
  const resolvedArgs: string[] = []
  if (data.args && Array.isArray(data.args)) {
    for (const arg of data.args) {
      if (typeof arg === 'string' && arg.includes('{{')) {
        const result = evaluateExpression(arg, context)
        resolvedArgs.push(typeof result === 'string' ? result : String(result))
      } else {
        resolvedArgs.push(String(arg))
      }
    }
  }

  // Resolve environment variables
  const resolvedEnv: Record<string, string> = {}
  if (data.env && typeof data.env === 'object') {
    for (const [key, value] of Object.entries(data.env)) {
      if (typeof value === 'string' && value.includes('{{')) {
        const result = evaluateExpression(value, context)
        resolvedEnv[key] = typeof result === 'string' ? result : String(result)
      } else {
        resolvedEnv[key] = String(value)
      }
    }
  }

  // Build full command with args
  const fullCommand = resolvedArgs.length > 0
    ? `${resolvedCommand} ${resolvedArgs.join(' ')}`
    : resolvedCommand

  addTraceEntry(trace, {
    type: 'debug_step',
    nodeId: node.id,
    nodeName: node.data.label,
    nodeType: 'command',
    message: `Executing command: ${fullCommand}`,
    data: {
      command: resolvedCommand,
      args: resolvedArgs,
      cwd: data.cwd,
      env: resolvedEnv,
      requiresApproval: data.requiresApproval,
    },
  }, options)

  // Check if we're in Electron and have access to runCommand
  if (typeof window !== 'undefined' && window.electronAPI?.runCommand) {
    // If approval is required, we need to ask the user
    if (data.requiresApproval && options.onUserInput) {
      const approvalRequest: UserInputRequest = {
        nodeId: node.id,
        nodeLabel: data.label || 'Command',
        prompt: data.approvalMessage || `Approve command execution?\n\n${fullCommand}`,
        inputType: 'confirm',
        required: true,
        showContext: false,
        context: {
          previousOutput: context.previous_output,
          variables: { ...context.variables },
        },
      }

      const response = await options.onUserInput(approvalRequest)
      if (response.cancelled || response.value !== true) {
        addTraceEntry(trace, {
          type: 'debug_step',
          nodeId: node.id,
          nodeName: node.data.label,
          message: 'Command execution cancelled by user',
        }, options)
        return { cancelled: true, command: fullCommand }
      }
    }

    try {
      const result = await window.electronAPI.runCommand(fullCommand, data.cwd || undefined)

      addTraceEntry(trace, {
        type: 'debug_step',
        nodeId: node.id,
        nodeName: node.data.label,
        nodeType: 'command',
        message: result.success ? 'Command executed successfully' : 'Command failed',
        data: {
          success: result.success,
          output: result.output,
          exitCode: result.exitCode,
        },
      }, options)

      // Return based on output format
      if (data.outputFormat === 'json') {
        try {
          return JSON.parse(result.output)
        } catch {
          return { raw: result.output, parseError: 'Failed to parse output as JSON' }
        }
      } else if (data.outputFormat === 'lines') {
        return result.output.split('\n').filter((line: string) => line.trim())
      }

      return result.output
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      addTraceEntry(trace, {
        type: 'node_error',
        nodeId: node.id,
        nodeName: node.data.label,
        nodeType: 'command',
        message: `Command execution error: ${errorMessage}`,
        data: { error: errorMessage },
      }, options)
      throw error
    }
  } else {
    // Not in Electron - log and pass through
    addTraceEntry(trace, {
      type: 'debug_step',
      nodeId: node.id,
      nodeName: node.data.label,
      nodeType: 'command',
      message: 'Command execution requires Electron environment (runCommand not available)',
      data: { command: fullCommand },
    }, options)

    // Return the command that would have been executed
    return {
      skipped: true,
      reason: 'Electron environment required',
      command: fullCommand,
      args: resolvedArgs,
      cwd: data.cwd,
    }
  }
}

/**
 * Execute an MCP tool node - calls external MCP server tools
 */
async function executeMcpToolNode(
  node: WorkflowNode,
  context: {
    nodeOutputs: Record<string, unknown>
    variables: Record<string, unknown>
    workflow: Record<string, unknown>
    previous_output?: unknown
  },
  options: ExecutorOptions,
  trace: ExecutionTrace
): Promise<unknown> {
  const data = node.data as McpToolNodeData

  // Resolve parameters with template expressions
  const resolvedParams: Record<string, unknown> = {}
  if (data.parameters && typeof data.parameters === 'object') {
    for (const [key, value] of Object.entries(data.parameters)) {
      if (typeof value === 'string' && value.includes('{{')) {
        resolvedParams[key] = evaluateExpression(value, context)
      } else {
        resolvedParams[key] = value
      }
    }
  }

  // Get server config from connectionId or inline config
  const serverUrl = data.serverConfig?.serverUrl || ''
  const toolName = data.toolName || ''
  const toolNameDisplay = toolName || '(unnamed)'

  addTraceEntry(trace, {
    type: 'debug_step',
    nodeId: node.id,
    nodeName: node.data.label,
    nodeType: 'mcp-tool',
    message: `Executing MCP tool: ${toolNameDisplay}`,
    data: {
      toolName,
      toolNameDisplay,
      nodeLabel: node.data.label,
      serverUrl,
      parameters: resolvedParams,
      connectionId: data.connectionId,
    },
  }, options)

  // Build MCP tool call request
  const request: ToolCallRequest = {
    nodeId: node.id,
    toolName: toolName,
    toolType: 'mcp',
    parameters: resolvedParams,
    mcpConfig: {
      serverUrl,
      serverName: data.serverConfig?.serverName,
    },
    timeout: data.timeoutMs,
  }

  // Execute via tool callback if available
  if (options.onToolCall) {
    try {
      const result = await options.onToolCall(request)

      if (!result.success) {
        throw new Error(
          `MCP tool '${toolNameDisplay}' execution failed: ${result.error || 'Unknown error'}\n` +
          `Node: "${node.data.label}" (${node.id})`
        )
      }

      addTraceEntry(trace, {
        type: 'debug_step',
        nodeId: node.id,
        nodeName: node.data.label,
        nodeType: 'mcp-tool',
        message: `MCP tool '${toolNameDisplay}' executed successfully`,
        data: {
          toolName,
          toolNameDisplay,
          nodeLabel: node.data.label,
          result: result.result
        },
      }, options)

      return result.result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      addTraceEntry(trace, {
        type: 'node_error',
        nodeId: node.id,
        nodeName: node.data.label,
        nodeType: 'mcp-tool',
        message: `MCP tool '${toolNameDisplay}' error: ${errorMessage}`,
        data: {
          toolName,
          toolNameDisplay,
          nodeLabel: node.data.label,
          error: errorMessage
        },
      }, options)
      throw error
    }
  } else {
    addTraceEntry(trace, {
      type: 'debug_step',
      nodeId: node.id,
      nodeName: node.data.label,
      nodeType: 'mcp-tool',
      message: `MCP tool '${toolNameDisplay}' execution skipped - no onToolCall handler`,
      data: {
        toolName,
        toolNameDisplay,
        nodeLabel: node.data.label,
        parameters: resolvedParams
      },
    }, options)

    return {
      skipped: true,
      reason: 'No onToolCall handler available',
      toolName,
      parameters: resolvedParams,
    }
  }
}

/**
 * Execute a tool node - invokes function, MCP, or HTTP tools
 */
async function executeToolNode(
  node: WorkflowNode,
  context: {
    nodeOutputs: Record<string, unknown>
    variables: Record<string, unknown>
    workflow: Record<string, unknown>
    previous_output?: unknown
  },
  options: ExecutorOptions,
  trace: ExecutionTrace
): Promise<unknown> {
  const data = node.data as ToolNodeData

  // Resolve parameters with template expressions
  const resolvedParams: Record<string, unknown> = {}
  if (data.parameters) {
    for (const [key, value] of Object.entries(data.parameters)) {
      if (typeof value === 'string' && value.includes('{{')) {
        resolvedParams[key] = evaluateExpression(value, context)
      } else {
        resolvedParams[key] = value
      }
    }
  }

  const toolNameDisplay = data.toolName || '(unnamed)'
  addTraceEntry(trace, {
    type: 'debug_step',
    nodeId: node.id,
    nodeName: node.data.label,
    nodeType: 'tool',
    message: `Executing ${data.toolType} tool: ${toolNameDisplay}`,
    data: {
      toolType: data.toolType,
      toolName: data.toolName || '',
      toolNameDisplay,
      nodeLabel: node.data.label,
      parameters: resolvedParams
    },
  }, options)

  // Build tool call request
  const request: ToolCallRequest = {
    nodeId: node.id,
    toolName: data.toolName,
    toolType: data.toolType,
    parameters: resolvedParams,
    timeout: data.timeout,
  }

  // Add HTTP-specific config
  if (data.toolType === 'http' && data.httpUrl) {
    // Resolve URL template
    let resolvedUrl = data.httpUrl
    if (resolvedUrl.includes('{{')) {
      const result = evaluateExpression(resolvedUrl, context)
      resolvedUrl = typeof result === 'string' ? result : String(result)
    }

    // Resolve body template
    let resolvedBody = data.httpBody
    if (resolvedBody && resolvedBody.includes('{{')) {
      const result = evaluateExpression(resolvedBody, context)
      resolvedBody = typeof result === 'string' ? result : JSON.stringify(result)
    }

    // Resolve headers
    const resolvedHeaders: Record<string, string> = {}
    if (data.httpHeaders) {
      for (const [key, value] of Object.entries(data.httpHeaders)) {
        if (value.includes('{{')) {
          const result = evaluateExpression(value, context)
          resolvedHeaders[key] = typeof result === 'string' ? result : String(result)
        } else {
          resolvedHeaders[key] = value
        }
      }
    }

    request.httpConfig = {
      method: data.httpMethod || 'GET',
      url: resolvedUrl,
      headers: Object.keys(resolvedHeaders).length > 0 ? resolvedHeaders : undefined,
      body: resolvedBody,
    }
  }

  // Add MCP-specific config
  if (data.toolType === 'mcp') {
    request.mcpConfig = {
      serverUrl: data.mcpServerUrl,
      serverName: data.mcpServerName,
    }
  }

  // If no callback is provided, we can't execute the tool
  if (!options.onToolCall) {
    // For HTTP tools, we can execute directly
    if (data.toolType === 'http' && request.httpConfig) {
      try {
        const response = await fetch(request.httpConfig.url, {
          method: request.httpConfig.method,
          headers: request.httpConfig.headers,
          body: request.httpConfig.method !== 'GET' ? request.httpConfig.body : undefined,
        })

        const contentType = response.headers.get('content-type')
        let result: unknown
        if (contentType?.includes('application/json')) {
          result = await response.json()
        } else {
          result = await response.text()
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${typeof result === 'string' ? result : JSON.stringify(result)}`)
        }

        const toolNameDisplay = data.toolName || '(unnamed)'
        addTraceEntry(trace, {
          type: 'node_complete',
          nodeId: node.id,
          nodeName: node.data.label,
          nodeType: 'tool',
          message: `HTTP tool completed: ${toolNameDisplay}`,
          data: {
            toolName: data.toolName || '',
            toolNameDisplay,
            toolType: 'http',
            nodeLabel: node.data.label,
            status: response.status,
            result
          },
        }, options)

        // Apply output transform if defined
        if (data.outputTransform) {
          const transformedResult = evaluateExpression(data.outputTransform, {
            ...context,
            nodeOutputs: { ...context.nodeOutputs, result },
          })
          return transformedResult
        }

        return result
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        const toolNameDisplay = data.toolName || '(unnamed)'
        throw new Error(
          `HTTP tool '${toolNameDisplay}' failed: ${errorMessage}\n` +
          `Node: "${node.data.label}" (${node.id})`
        )
      }
    }

    const toolNameDisplay = data.toolName || '(unnamed)'
    throw new Error(
      `No onToolCall callback provided for ${data.toolType} tool: ${toolNameDisplay}\n` +
      `Node: "${node.data.label}" (${node.id})`
    )
  }

  // Execute via callback
  const result = await options.onToolCall(request)

  if (!result.success) {
    const toolNameDisplay = data.toolName || '(unnamed)'
    throw new Error(
      `Tool '${toolNameDisplay}' failed: ${result.error || 'Unknown error'}\n` +
      `Node: "${node.data.label}" (${node.id})`
    )
  }

  // toolNameDisplay already declared at top of function
  addTraceEntry(trace, {
    type: 'node_complete',
    nodeId: node.id,
    nodeName: node.data.label,
    nodeType: 'tool',
    message: `Tool completed: ${toolNameDisplay}`,
    data: {
      toolName: data.toolName || '',
      toolNameDisplay,
      toolType: data.toolType,
      nodeLabel: node.data.label,
      result: result.result
    },
  }, options)

  // Apply output transform if defined
  if (data.outputTransform) {
    const transformedResult = evaluateExpression(data.outputTransform, {
      ...context,
      nodeOutputs: { ...context.nodeOutputs, result: result.result },
    })
    return transformedResult
  }

  return result.result
}

/**
 * Emit an AgentCheckpointEvent to connected callback nodes and the onAgentCheckpoint handler
 *
 * @param event - The checkpoint event to emit
 * @param options - Executor options containing the callback handler
 * @param workflowFile - Workflow file for finding connected callback nodes
 * @returns Promise<boolean> - true to continue, false to stop
 */
async function emitAgentCheckpoint(
  event: AgentCheckpointEvent,
  options: ExecutorOptions,
  workflowFile?: WorkflowFile
): Promise<boolean> {
  // Call the onAgentCheckpoint handler if provided
  if (options.onAgentCheckpoint) {
    const result = options.onAgentCheckpoint(event)
    const shouldContinue = result instanceof Promise ? await result : result
    if (!shouldContinue) {
      return false
    }
  }

  // If workflow file provided, find connected Callback nodes via onCheckpoint edges
  if (workflowFile) {
    // Find edges originating from the agent's onCheckpoint handle
    const checkpointEdges = workflowFile.edges.filter(
      e => e.source === event.agentNodeId && e.sourceHandle === 'onCheckpoint'
    )

    // For each connected callback node, check if it should receive this event
    for (const edge of checkpointEdges) {
      const callbackNode = workflowFile.nodes.find(
        n => n.id === edge.target && (n.type === 'callback' || n.type === 'checkpoint')
      )
      if (callbackNode) {
        const callbackData = callbackNode.data as CallbackNodeData

        // Check if callback has event filtering enabled
        if (callbackData.listenTo && callbackData.listenTo.length > 0) {
          // Filter: only emit if event type is in listenTo list
          if (!callbackData.listenTo.includes(event.type)) {
            continue // Skip this callback, event type not in filter
          }
        }

        // Emit to the callback's onCheckpoint handler
        // The callback node will be executed during normal workflow execution
        // This is mainly for real-time event streaming
      }
    }
  }

  return true
}

/**
 * Execute an agent node - autonomous AI agent with ReAct-style tool-use loop
 *
 * The agent loop:
 * 1. Send prompt + tool definitions to LLM
 * 2. Parse response for tool calls
 * 3. If tool call found, execute tool and feed result back to LLM
 * 4. Repeat until LLM provides final answer (no tool call) or max iterations reached
 *
 * Debug Mode:
 * When the workflow execution mode is 'debug' or 'step', detailed iteration
 * history is captured and included in the output for downstream analysis.
 * Use a Checkpoint node connected to the agent output to inspect agent state.
 */
async function executeAgentNode(
  node: WorkflowNode,
  context: {
    nodeOutputs: Record<string, unknown>
    variables: Record<string, unknown>
    workflow: Record<string, unknown>
    previous_output?: unknown
  },
  options: ExecutorOptions,
  trace: ExecutionTrace,
  state: WorkflowExecutionState,
  workflowFile?: WorkflowFile
): Promise<unknown> {
  const data = node.data as AgentNodeData

  // Check if workflow is in debug mode (from execution options)
  const isDebugMode = options.executionMode === 'debug' || options.executionMode === 'step'

  // Resolve provider from providerNodeId if set
  let resolvedProvider = data.provider
  let resolvedModel = data.model
  if (data.providerNodeId && workflowFile) {
    const providerNode = workflowFile.nodes.find(n => n.id === data.providerNodeId && n.type === 'provider')
    if (providerNode) {
      const providerData = providerNode.data as { providerId?: string; model?: string }
      resolvedProvider = providerData.providerId || data.provider
      resolvedModel = providerData.model || data.model
    }
  }

  // Collect tools from connected Tool Router nodes
  let collectedTools: AgentTool[] = [...(data.tools || [])]
  let connectedToolRouterNodeId: string | undefined

  if (workflowFile) {
    // Find edges from this agent's 'tools' handle to tool-call-router
    const toolsEdge = workflowFile.edges.find(
      e => e.source === node.id && e.sourceHandle === 'tools'
    )

    if (toolsEdge) {
      const toolRouterNode = workflowFile.nodes.find(
        n => n.id === toolsEdge.target && n.type === 'tool-call-router'
      )

      if (toolRouterNode) {
        connectedToolRouterNodeId = toolRouterNode.id

        // Find all Tool nodes that are children of this Tool Router
        const childToolNodes = workflowFile.nodes.filter(
          n => n.parentId === toolRouterNode.id && n.type === 'tool'
        )

        // Convert Tool nodes to AgentTool format
        for (const toolNode of childToolNodes) {
          const toolData = toolNode.data as ToolNodeData

          // Map toolType: command -> function (we'll handle it specially during execution)
          // Map toolType: code -> function (same handling)
          const agentToolType: AgentTool['toolType'] =
            toolData.toolType === 'http' ? 'http' :
            toolData.toolType === 'mcp' ? 'mcp' :
            'function'  // command, code, and function all map to 'function'

          const agentTool: AgentTool = {
            name: toolData.toolName,
            description: toolData.description || `Tool: ${toolData.toolName}`,
            toolType: agentToolType,
            parameters: toolData.parameterSchema,
            // Store original data for execution routing
            httpConfig: toolData.toolType === 'http' ? {
              method: toolData.httpMethod || 'GET',
              url: toolData.httpUrl || '',
              headers: toolData.httpHeaders,
              bodyTemplate: toolData.httpBody,
            } : undefined,
            mcpConfig: toolData.toolType === 'mcp' ? {
              serverUrl: toolData.mcpServerUrl,
              serverName: toolData.mcpServerName,
            } : undefined,
          }

          // Store tool node ID and original type for routing during execution
          // We'll use this in executeAgentTool to route to the actual Tool node
          ;(agentTool as AgentTool & { _toolNodeId?: string; _originalToolType?: string }).
            _toolNodeId = toolNode.id
          ;(agentTool as AgentTool & { _toolNodeId?: string; _originalToolType?: string }).
            _originalToolType = toolData.toolType

          collectedTools.push(agentTool)
        }

        addTraceEntry(trace, {
          type: 'debug_step',
          nodeId: node.id,
          nodeName: node.data.label,
          nodeType: 'agent',
          message: `Collected ${childToolNodes.length} tools from Tool Router '${toolRouterNode.data.label}'`,
          data: {
            toolRouterNodeId: toolRouterNode.id,
            collectedToolNames: childToolNodes.map(n => (n.data as ToolNodeData).toolName),
          },
        }, options)
      }
    }
  }

  // Resolve user prompt with template expressions
  let userPrompt = data.userPrompt || '{{ input }}'
  if (userPrompt.includes('{{')) {
    const result = evaluateExpression(userPrompt, context)
    userPrompt = typeof result === 'string' ? result : JSON.stringify(result)
  }

  // Build tool definitions for the LLM (use collected tools)
  const toolDefinitions = buildToolDefinitions(collectedTools)

  // Build system prompt with tool definitions (use collected tools)
  const systemPromptWithTools = buildSystemPromptWithTools(
    data.systemPrompt || 'You are a helpful AI assistant.',
    collectedTools,
    data.toolCallFormat || 'auto'
  )

  addTraceEntry(trace, {
    type: 'debug_step',
    nodeId: node.id,
    nodeName: node.data.label,
    nodeType: 'agent',
    message: `Starting agent with ${collectedTools.length} tools, max ${data.maxIterations} iterations${isDebugMode ? ' (DEBUG MODE)' : ''}`,
    data: {
      toolCount: collectedTools.length,
      toolNames: collectedTools.map(t => t.name),
      connectedToolRouterNodeId,
      maxIterations: data.maxIterations,
      debugMode: isDebugMode,
      userPromptTemplate: data.userPrompt || '{{ input }}',
      resolvedUserPrompt: userPrompt,
      previousOutput: context.previous_output,
      previousOutputType: typeof context.previous_output,
    },
  }, options)

  // Conversation history for the agent loop
  const conversationHistory: Array<{ role: 'user' | 'assistant' | 'tool'; content: string; toolName?: string }> = []
  conversationHistory.push({ role: 'user', content: userPrompt })

  // Iteration history for debugging (stores detailed records of each iteration)
  const iterationHistory: AgentIterationRecord[] = []

  let iteration = 0
  let finalResponse: string | null = null
  let lastToolResult: unknown = null
  let totalToolCalls = 0
  const agentStartTime = Date.now()
  let stopReason: 'max-iterations' | 'stop-phrase' | 'no-tool-call' | 'error' | 'cancelled' = 'no-tool-call'

  // Update node state with iteration info
  const updateIterationState = () => {
    if (state.nodeStates[node.id]) {
      state.nodeStates[node.id].output = {
        currentIteration: iteration,
        totalToolCalls,
        iterationHistory: isDebugMode ? iterationHistory : undefined,
      }
      options.onProgress?.(deepClone(state))
    }
  }

  while (iteration < (data.maxIterations || 10)) {
    iteration++
    const iterationStartTime = Date.now()

    // Create iteration record for debugging
    const currentIterationRecord: Partial<AgentIterationRecord> = {
      iteration,
      timestamp: iterationStartTime,
      llmInput: {
        systemPrompt: systemPromptWithTools,
        conversationHistory: deepClone(conversationHistory),
      },
    }

    updateIterationState()

    addTraceEntry(trace, {
      type: 'debug_step',
      nodeId: node.id,
      nodeName: node.data.label,
      nodeType: 'agent',
      message: `Agent iteration ${iteration}/${data.maxIterations}`,
      data: { iteration, conversationLength: conversationHistory.length },
    }, options)

    // Call LLM with conversation history
    const llmResponse = await callAgentLLM(
      systemPromptWithTools,
      conversationHistory,
      resolvedProvider,
      resolvedModel,
      toolDefinitions,
      options,
      node.id,
      trace,
      data.temperature,
      data.llmTimeout
    )

    // Check for stop phrases
    if (data.stopPhrases && data.stopPhrases.length > 0) {
      const responseText = typeof llmResponse === 'string' ? llmResponse : JSON.stringify(llmResponse)
      const hasStopPhrase = data.stopPhrases.some(phrase => responseText.includes(phrase))
      if (hasStopPhrase) {
        addTraceEntry(trace, {
          type: 'debug_step',
          nodeId: node.id,
          nodeName: node.data.label,
          nodeType: 'agent',
          message: 'Agent stopped: stop phrase detected',
          data: { stopPhrases: data.stopPhrases },
        }, options)
        finalResponse = responseText
        stopReason = 'stop-phrase'
        break
      }
    }

    // Parse for tool calls (use collected tools)
    const toolCallResult = parseToolCall(llmResponse, data.toolCallFormat || 'auto', collectedTools)

    // Update iteration record with LLM output
    currentIterationRecord.llmOutput = {
      response: typeof llmResponse === 'string' ? llmResponse : JSON.stringify(llmResponse),
      hasToolCall: toolCallResult.hasToolCall,
      toolName: toolCallResult.toolName ?? undefined,
      toolParams: toolCallResult.toolParameters ?? undefined,
    }

    // Emit iteration checkpoint event
    const iterationDurationMs = Date.now() - iterationStartTime
    const iterationEvent: AgentCheckpointEvent = {
      type: 'iteration',
      timestamp: Date.now(),
      iteration,
      agentNodeId: node.id,
      data: {
        iterationNumber: iteration,
        llmInput: {
          systemPrompt: systemPromptWithTools,
          messages: deepClone(conversationHistory),
        },
        llmOutput: {
          response: typeof llmResponse === 'string' ? llmResponse : JSON.stringify(llmResponse),
          hasToolCall: toolCallResult.hasToolCall,
          toolName: toolCallResult.toolName ?? undefined,
          toolParams: toolCallResult.toolParameters ?? undefined,
        },
        durationMs: iterationDurationMs,
      } as IterationEventData,
    }
    const shouldContinueAfterIteration = await emitAgentCheckpoint(iterationEvent, options, workflowFile)
    if (!shouldContinueAfterIteration) {
      // Checkpoint handler requested stop
      finalResponse = typeof llmResponse === 'string' ? llmResponse : JSON.stringify(llmResponse)
      stopReason = 'cancelled'
      break
    }

    if (!toolCallResult.hasToolCall) {
      // No tool call - this is the final response
      finalResponse = typeof llmResponse === 'string' ? llmResponse : JSON.stringify(llmResponse)
      conversationHistory.push({ role: 'assistant', content: finalResponse })

      // Finalize iteration record
      currentIterationRecord.durationMs = Date.now() - iterationStartTime
      iterationHistory.push(currentIterationRecord as AgentIterationRecord)

      addTraceEntry(trace, {
        type: 'debug_step',
        nodeId: node.id,
        nodeName: node.data.label,
        nodeType: 'agent',
        message: `Agent completed: no tool call in response (iteration ${iteration})`,
        data: { finalResponse: finalResponse.substring(0, 200) + (finalResponse.length > 200 ? '...' : '') },
      }, options)
      break
    }

    // Tool call found - execute it
    totalToolCalls++
    const toolName = toolCallResult.toolName!
    const toolParams = toolCallResult.toolParameters || {}

    // Add assistant message with tool call to history
    conversationHistory.push({
      role: 'assistant',
      content: typeof llmResponse === 'string' ? llmResponse : JSON.stringify(llmResponse),
    })

    addTraceEntry(trace, {
      type: 'debug_step',
      nodeId: node.id,
      nodeName: node.data.label,
      nodeType: 'agent',
      message: `Agent calling tool: ${toolName}`,
      data: { toolName, toolParams, iteration },
    }, options)

    // Emit toolCall checkpoint event before execution
    const toolCallEvent: AgentCheckpointEvent = {
      type: 'toolCall',
      timestamp: Date.now(),
      iteration,
      agentNodeId: node.id,
      data: {
        toolName,
        parameters: toolParams,
        schema: (data.tools || []).find(t => t.name === toolName)?.parameters,
      } as ToolCallEventData,
    }
    const shouldContinueAfterToolCall = await emitAgentCheckpoint(toolCallEvent, options, workflowFile)
    if (!shouldContinueAfterToolCall) {
      // Checkpoint handler requested stop
      finalResponse = `Tool call '${toolName}' was cancelled by checkpoint handler.`
      stopReason = 'cancelled'
      break
    }

    // Find the tool definition (use collected tools)
    const toolDef = collectedTools.find(t => t.name === toolName)
    if (!toolDef) {
      // Tool not found - send error back to LLM
      const errorMessage = `Error: Tool '${toolName}' not found. Available tools: ${collectedTools.map(t => t.name).join(', ')}`
      conversationHistory.push({ role: 'tool', content: errorMessage, toolName })

      // Record tool execution failure
      currentIterationRecord.toolExecution = {
        toolName,
        parameters: toolParams,
        result: null,
        error: errorMessage,
        durationMs: 0,
      }

      addTraceEntry(trace, {
        type: 'debug_step',
        nodeId: node.id,
        nodeName: node.data.label,
        nodeType: 'agent',
        message: `Tool not found: ${toolName}`,
        data: { toolName, availableTools: collectedTools.map(t => t.name) },
      }, options)

      // Finalize iteration record
      currentIterationRecord.durationMs = Date.now() - iterationStartTime
      iterationHistory.push(currentIterationRecord as AgentIterationRecord)
      continue
    }

    // Execute the tool
    const toolStartTime = Date.now()
    let toolExecutionSuccess = false
    let toolExecutionResult: unknown = null
    let toolExecutionError: string | undefined

    try {
      const toolResult = await executeAgentTool(toolDef, toolParams, context, options, node.id, trace, workflowFile)
      lastToolResult = toolResult
      toolExecutionSuccess = true
      toolExecutionResult = toolResult

      // Add tool result to conversation
      const toolResultStr = typeof toolResult === 'string' ? toolResult : (toolResult !== undefined && toolResult !== null ? JSON.stringify(toolResult) : '')
      conversationHistory.push({ role: 'tool', content: toolResultStr, toolName })

      addTraceEntry(trace, {
        type: 'debug_step',
        nodeId: node.id,
        nodeName: node.data.label,
        nodeType: 'agent',
        message: `Tool '${toolName}' completed`,
        data: { toolName, result: toolResultStr ? (toolResultStr.substring(0, 500) + (toolResultStr.length > 500 ? '...' : '')) : '(empty result)' },
      }, options)
    } catch (error) {
      // Tool execution failed - send error back to LLM
      const errorMessage = `Error executing tool '${toolName}': ${error instanceof Error ? error.message : String(error)}`
      toolExecutionError = errorMessage
      conversationHistory.push({ role: 'tool', content: errorMessage, toolName })

      addTraceEntry(trace, {
        type: 'debug_step',
        nodeId: node.id,
        nodeName: node.data.label,
        nodeType: 'agent',
        message: `Tool '${toolName}' failed`,
        data: { toolName, error: errorMessage },
      }, options)

      // Emit error checkpoint event
      const errorEvent: AgentCheckpointEvent = {
        type: 'error',
        timestamp: Date.now(),
        iteration,
        agentNodeId: node.id,
        data: {
          message: errorMessage,
          code: 'TOOL_EXECUTION_ERROR',
          stack: error instanceof Error ? error.stack : undefined,
          recoverable: true, // Agent will continue with error message to LLM
        } as ErrorEventData,
      }
      await emitAgentCheckpoint(errorEvent, options, workflowFile)
    }

    // Record tool execution
    currentIterationRecord.toolExecution = {
      toolName,
      parameters: toolParams,
      result: toolExecutionResult,
      error: toolExecutionError,
      durationMs: Date.now() - toolStartTime,
    }

    // Finalize iteration record
    currentIterationRecord.durationMs = Date.now() - iterationStartTime
    iterationHistory.push(currentIterationRecord as AgentIterationRecord)
  }

  // Max iterations reached without final response
  if (finalResponse === null) {
    stopReason = 'max-iterations'
    addTraceEntry(trace, {
      type: 'debug_step',
      nodeId: node.id,
      nodeName: node.data.label,
      nodeType: 'agent',
      message: `Agent reached max iterations (${data.maxIterations})`,
      data: { iterations: iteration, totalToolCalls },
    }, options)

    // Use last assistant message as final response
    const lastAssistantMessage = conversationHistory.filter(m => m.role === 'assistant').pop()
    finalResponse = lastAssistantMessage?.content || 'Agent reached maximum iterations without completing.'
  }

  // Determine output based on outputMode
  let output: unknown
  switch (data.outputMode) {
    case 'full-conversation':
      output = {
        finalResponse,
        conversationHistory,
        iterations: iteration,
        totalToolCalls,
        // Include iteration history when debug mode is enabled
        iterationHistory: isDebugMode ? iterationHistory : undefined,
      }
      break
    case 'last-tool-result':
      output = lastToolResult !== null ? lastToolResult : finalResponse
      break
    case 'final-response':
    default:
      output = finalResponse
      break
  }

  addTraceEntry(trace, {
    type: 'node_complete',
    nodeId: node.id,
    nodeName: node.data.label,
    nodeType: 'agent',
    message: `Agent completed after ${iteration} iterations, ${totalToolCalls} tool calls`,
    data: { iterations: iteration, totalToolCalls, outputMode: data.outputMode, debugMode: isDebugMode },
  }, options)

  // Emit complete checkpoint event
  const completeEvent: AgentCheckpointEvent = {
    type: 'complete',
    timestamp: Date.now(),
    iteration,
    agentNodeId: node.id,
    data: {
      finalResponse: finalResponse || '',
      totalIterations: iteration,
      totalDurationMs: Date.now() - agentStartTime,
      stopReason,
    } as CompleteEventData,
  }
  await emitAgentCheckpoint(completeEvent, options, workflowFile)

  return output
}

/**
 * Execute a ChatAgentNode - composite container for conversational AI agent pattern
 *
 * Bundles: User Input -> Guardrail -> AI Agent <-> Tool Router
 * into a single execution with configurable checkpoints at each stage.
 */
async function executeChatAgentNode(
  node: WorkflowNode,
  context: {
    nodeOutputs: Record<string, unknown>
    variables: Record<string, unknown>
    workflow: Record<string, unknown>
    previous_output?: unknown
  },
  options: ExecutorOptions,
  trace: ExecutionTrace,
  state: WorkflowExecutionState,
  workflowFile: WorkflowFile,
  branchingTargetMap: Map<string, { edgeTargets: Map<string, string> }>,
  skippedNodes: Set<string>
): Promise<unknown> {
  const data = node.data as ChatAgentNodeData
  const isDebugMode = options.executionMode === 'debug' || options.executionMode === 'step'

  addTraceEntry(trace, {
    type: 'node_start',
    nodeId: node.id,
    nodeName: data.label || 'Chat Agent',
    nodeType: 'chat-agent',
    message: 'Starting Chat Agent composite node',
    data: {
      userInputEnabled: data.userInputEnabled !== false,
      guardrailEnabled: data.guardrailEnabled,
      maxIterations: data.maxIterations || 10,
      toolCount: data.tools?.length || 0,
    },
  }, options)

  // Helper to emit chat agent checkpoints
  const emitChatAgentCheckpoint = async (
    checkpointName: keyof NonNullable<ChatAgentNodeData['checkpoints']>,
    checkpointData: unknown,
    iteration: number = 1
  ): Promise<boolean> => {
    const config = data.checkpoints?.[checkpointName]
    if (!config?.enabled) return true // Continue if not enabled

    addTraceEntry(trace, {
      type: 'debug_step',
      nodeId: node.id,
      nodeName: data.label,
      message: `Chat Agent checkpoint: ${checkpointName}`,
      data: { checkpointData: config.includeFullContext ? checkpointData : undefined },
    }, options)

    // Map checkpoint name to AgentCheckpointEvent type and build rich event data
    let agentEvent: AgentCheckpointEvent
    const checkpointDataObj = checkpointData as Record<string, unknown>

    switch (checkpointName) {
      case 'onUserInput':
      case 'beforeGuardrail': {
        // User input or pre-guardrail checkpoint
        const input = checkpointDataObj?.input
        agentEvent = {
          type: 'iteration',
          timestamp: Date.now(),
          iteration,
          agentNodeId: node.id,
          data: {
            iterationNumber: iteration,
            llmInput: {
              systemPrompt: checkpointName === 'beforeGuardrail' ? (data.guardrailSystemPrompt || '') : '',
              messages: [{ role: 'user', content: typeof input === 'string' ? input : JSON.stringify(input) }]
            },
            llmOutput: {
              response: '',
              hasToolCall: false,
            },
            durationMs: 0,
          } as IterationEventData,
        }
        break
      }

      case 'afterGuardrail': {
        // Post-guardrail checkpoint with validation results
        const input = checkpointDataObj?.input
        const guardrailResult = checkpointDataObj?.guardrailResult as { rejected?: boolean; score?: number; analysis?: string } | undefined
        agentEvent = {
          type: 'iteration',
          timestamp: Date.now(),
          iteration,
          agentNodeId: node.id,
          data: {
            iterationNumber: iteration,
            llmInput: {
              systemPrompt: data.guardrailSystemPrompt || '',
              messages: [{ role: 'user', content: `Input: ${typeof input === 'string' ? input : JSON.stringify(input)}` }]
            },
            llmOutput: {
              response: JSON.stringify({
                status: guardrailResult?.rejected ? 'rejected' : 'passed',
                score: guardrailResult?.score,
                analysis: guardrailResult?.analysis,
              }),
              hasToolCall: false,
            },
            durationMs: 0,
          } as IterationEventData,
        }
        break
      }

      case 'onIterationStart': {
        // Start of agent iteration with conversation history
        const conversationHistory = checkpointDataObj?.conversationHistory as Array<{ role: string; content: string }> | undefined
        agentEvent = {
          type: 'iteration',
          timestamp: Date.now(),
          iteration: checkpointDataObj?.iteration as number || iteration,
          agentNodeId: node.id,
          data: {
            iterationNumber: checkpointDataObj?.iteration as number || iteration,
            llmInput: {
              systemPrompt: data.agentSystemPrompt || 'You are a helpful AI assistant.',
              messages: conversationHistory || []
            },
            llmOutput: {
              response: '',
              hasToolCall: false,
            },
            durationMs: 0,
          } as IterationEventData,
        }
        break
      }

      case 'onIterationEnd': {
        // End of agent iteration with LLM response and tool call info
        const llmResponse = checkpointDataObj?.llmResponse
        const hasToolCall = checkpointDataObj?.hasToolCall as boolean || false
        const toolName = checkpointDataObj?.toolName as string | undefined
        agentEvent = {
          type: hasToolCall ? 'toolCall' : 'iteration',
          timestamp: Date.now(),
          iteration: checkpointDataObj?.iteration as number || iteration,
          agentNodeId: node.id,
          data: hasToolCall ? {
            toolName: toolName || 'unknown',
            parameters: {},
            result: typeof llmResponse === 'string' ? llmResponse : JSON.stringify(llmResponse),
          } as ToolCallEventData : {
            iterationNumber: checkpointDataObj?.iteration as number || iteration,
            llmInput: {
              systemPrompt: data.agentSystemPrompt || '',
              messages: []
            },
            llmOutput: {
              response: typeof llmResponse === 'string' ? llmResponse : JSON.stringify(llmResponse),
              hasToolCall,
            },
            durationMs: 0,
          } as IterationEventData,
        }
        break
      }

      case 'onAgentComplete': {
        // Final completion checkpoint
        agentEvent = {
          type: 'complete',
          timestamp: Date.now(),
          iteration,
          agentNodeId: node.id,
          data: {
            finalResponse: typeof checkpointData === 'string' ? checkpointData : JSON.stringify(checkpointData),
            totalIterations: iteration,
            totalDurationMs: 0,
            stopReason: 'no-tool-call',
          } as CompleteEventData,
        }
        break
      }

      case 'onToolCall':
      case 'onToolResult': {
        // Tool execution checkpoints
        const toolName = checkpointDataObj?.toolName as string | undefined
        const toolParams = checkpointDataObj?.toolParams
        const toolResult = checkpointDataObj?.toolResult
        agentEvent = {
          type: 'toolCall',
          timestamp: Date.now(),
          iteration: checkpointDataObj?.iteration as number || iteration,
          agentNodeId: node.id,
          data: {
            toolName: toolName || 'unknown',
            parameters: (toolParams || {}) as Record<string, unknown>,
            result: toolResult !== undefined ? (typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)) : undefined,
          } as ToolCallEventData,
        }
        break
      }

      default: {
        // Fallback for any other checkpoint types
        agentEvent = {
          type: 'iteration',
          timestamp: Date.now(),
          iteration,
          agentNodeId: node.id,
          data: {
            iterationNumber: iteration,
            llmInput: {
              systemPrompt: '',
              messages: []
            },
            llmOutput: {
              response: typeof checkpointData === 'string' ? checkpointData : JSON.stringify(checkpointData),
              hasToolCall: false,
            },
            durationMs: 0,
          } as IterationEventData,
        }
      }
    }

    // Emit to connected callback nodes via onCheckpoint handle
    const shouldContinueFromAgentCheckpoint = await emitAgentCheckpoint(agentEvent, options, workflowFile)
    if (!shouldContinueFromAgentCheckpoint) return false

    // Also emit to legacy onCheckpoint handler for backward compatibility
    if (config.pause && (options.executionMode === 'debug' || options.executionMode === 'step')) {
      if (options.onCheckpoint) {
        const legacyCheckpointEvent: CheckpointEvent = {
          nodeId: node.id,
          checkpointName,
          message: config.message || `Chat Agent checkpoint: ${checkpointName}`,
          previousOutput: checkpointData,
          timestamp: Date.now(),
          behaviors: {
            logToConsole: config.logToConsole ?? false,
            logToHistory: config.logToHistory ?? false,
            pauseInDebug: config.pause ?? false,
            requireApproval: config.requireApproval ?? false,
            sendWebhook: config.sendWebhook ?? false,
          },
          webhook: config.sendWebhook ? { url: config.webhookUrl } : undefined,
        }
        const result = await options.onCheckpoint(legacyCheckpointEvent)
        if (result === false) return false
      }
    }

    // Handle approval requirement via checkpoint callback
    if (config.requireApproval && options.onCheckpoint) {
      const approvalEvent: CheckpointEvent = {
        nodeId: node.id,
        checkpointName: `${checkpointName}-approval`,
        message: config.message || `Approval required to continue past ${checkpointName}`,
        previousOutput: checkpointData,
        timestamp: Date.now(),
        behaviors: {
          logToConsole: false,
          logToHistory: true,
          pauseInDebug: true,
          requireApproval: true,
          sendWebhook: false,
        },
        approval: {
          title: `Approval Required: ${checkpointName}`,
          instructions: config.message || `Approve to continue past ${checkpointName}`,
        },
      }
      const approved = await options.onCheckpoint(approvalEvent)
      if (!approved) return false
    }

    return true
  }

  let currentInput = context.previous_output

  // ========== STAGE 1: User Input ==========
  if (data.userInputEnabled !== false) {
    // Emit onUserInput checkpoint before requesting input
    const shouldContinue = await emitChatAgentCheckpoint('onUserInput', { input: currentInput })
    if (!shouldContinue) {
      return { cancelled: true, stage: 'onUserInput' }
    }

    // Request user input if handler available
    if (options.onUserInput) {
      const userInputConfig: UserInputRequest = {
        nodeId: node.id,
        nodeLabel: data.label || 'Chat Agent',
        prompt: data.userInputPrompt || 'Please provide your input:',
        inputType: data.userInputType || 'textarea',
        placeholder: data.userInputPlaceholder,
        showContext: data.userInputShowContext ?? true,
        context: {
          previousOutput: currentInput,
          variables: context.variables,
        },
      }

      addTraceEntry(trace, {
        type: 'debug_step',
        nodeId: node.id,
        nodeName: data.label,
        message: 'Requesting user input',
        data: { prompt: userInputConfig.prompt, inputType: userInputConfig.inputType },
      }, options)

      const userResponse = await options.onUserInput(userInputConfig)
      if (userResponse.cancelled) {
        addTraceEntry(trace, {
          type: 'debug_step',
          nodeId: node.id,
          nodeName: data.label,
          message: 'User input cancelled',
        }, options)
        return { cancelled: true, stage: 'userInput' }
      }

      currentInput = userResponse.value
    }
  }

  // ========== STAGE 2: Guardrail ==========
  if (data.guardrailEnabled && data.guardrailSystemPrompt) {
    // Emit beforeGuardrail checkpoint
    const shouldContinueBefore = await emitChatAgentCheckpoint('beforeGuardrail', { input: currentInput })
    if (!shouldContinueBefore) {
      return { cancelled: true, stage: 'beforeGuardrail' }
    }

    addTraceEntry(trace, {
      type: 'debug_step',
      nodeId: node.id,
      nodeName: data.label,
      message: 'Running guardrail validation',
      data: { systemPrompt: data.guardrailSystemPrompt?.substring(0, 100) },
    }, options)

    // Resolve provider for guardrail (use guardrail-specific config, fallback to agent config)
    let guardrailProvider = data.guardrailProvider || data.provider
    let guardrailModel = data.guardrailModel || data.model
    const guardrailTemperature = data.guardrailTemperature ?? 0 // Default to 0 for deterministic guardrails

    // First try guardrail-specific provider node, then fall back to agent's provider node
    const guardrailProviderNodeId = data.guardrailProviderNodeId || data.providerNodeId
    if (guardrailProviderNodeId && workflowFile) {
      const providerNode = workflowFile.nodes.find(n => n.id === guardrailProviderNodeId && n.type === 'provider')
      if (providerNode) {
        const providerData = providerNode.data as { providerId?: string; model?: string }
        guardrailProvider = providerData.providerId || guardrailProvider
        guardrailModel = providerData.model || guardrailModel
      }
    }

    // Build guardrail validation prompt
    const inputStr = typeof currentInput === 'string' ? currentInput : JSON.stringify(currentInput, null, 2)
    const validationPrompt = `---
id: chat-agent-guardrail
name: Chat Agent Guardrail
version: 1.0.0
---

# System
${data.guardrailSystemPrompt}

# Input to Validate
\`\`\`
${inputStr}
\`\`\`

# Instructions
Analyze the input above. Return a JSON object:
\`\`\`json
{
  "analysis": "Your analysis",
  "score": 0.0 to 1.0,
  "rejected": true or false
}
\`\`\`
`

    if (!options.executePrompt) {
      throw new Error('No executePrompt function provided for guardrail validation')
    }

    try {
      const llmResponse = await options.executePrompt(
        `raw:${validationPrompt}`,
        { previous_output: currentInput },
        guardrailProvider,
        guardrailModel
      )

      // Parse guardrail response
      let guardrailResult: { rejected: boolean; score?: number; analysis?: string } = { rejected: false }
      const responseStr = typeof llmResponse === 'string' ? llmResponse : JSON.stringify(llmResponse)

      const jsonMatch = responseStr.match(/```json\s*([\s\S]*?)\s*```/) ||
                        responseStr.match(/\{[\s\S]*"rejected"[\s\S]*\}/)
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0])

          // If guardrailPassExpression is configured, use it to evaluate the result
          if (data.guardrailPassExpression) {
            const exprContext = { ...context, previous_output: parsed, input: parsed }
            const exprResult = evaluateExpression(data.guardrailPassExpression, exprContext)
            guardrailResult = {
              rejected: !exprResult, // Expression returns true for PASS, so negate for rejected
              score: typeof parsed.score === 'number' ? parsed.score : undefined,
              analysis: parsed.analysis,
            }
          } else {
            // Fallback to checking parsed.rejected field
            guardrailResult = {
              rejected: parsed.rejected === true,
              score: typeof parsed.score === 'number' ? parsed.score : undefined,
              analysis: parsed.analysis,
            }
          }
        } catch {
          // If JSON parsing fails, try expression evaluation with raw response
          if (data.guardrailPassExpression) {
            const exprContext = { ...context, guardrail_response: responseStr }
            const exprResult = evaluateExpression(data.guardrailPassExpression, exprContext)
            guardrailResult.rejected = !exprResult
          }
        }
      }

      // Apply score threshold ONLY if no passExpression is configured
      // This ensures passExpression takes precedence when both are set
      if (!data.guardrailPassExpression && data.guardrailScoreThreshold !== undefined && guardrailResult.score !== undefined) {
        guardrailResult.rejected = guardrailResult.score < data.guardrailScoreThreshold
      }

      // Emit afterGuardrail checkpoint
      const shouldContinueAfter = await emitChatAgentCheckpoint('afterGuardrail', {
        input: currentInput,
        guardrailResult,
      })
      if (!shouldContinueAfter) {
        return { cancelled: true, stage: 'afterGuardrail', guardrailResult }
      }

      if (guardrailResult.rejected) {
        addTraceEntry(trace, {
          type: 'debug_step',
          nodeId: node.id,
          nodeName: data.label,
          message: 'Guardrail rejected input',
          data: { guardrailResult },
        }, options)

        return {
          rejected: true,
          guardrailResult,
          input: currentInput,
        }
      }

      addTraceEntry(trace, {
        type: 'debug_step',
        nodeId: node.id,
        nodeName: data.label,
        message: 'Guardrail passed',
        data: { score: guardrailResult.score },
      }, options)
    } catch (error) {
      addTraceEntry(trace, {
        type: 'debug_step',
        nodeId: node.id,
        nodeName: data.label,
        message: 'Guardrail validation failed',
        data: { error: error instanceof Error ? error.message : String(error) },
      }, options)
      // On guardrail error, continue execution but log the failure
    }
  }

  // ========== STAGE 3: Agent Loop ==========
  // Resolve provider
  let resolvedProvider = data.provider
  let resolvedModel = data.model
  if (data.providerNodeId && workflowFile) {
    const providerNode = workflowFile.nodes.find(n => n.id === data.providerNodeId && n.type === 'provider')
    if (providerNode) {
      const providerData = providerNode.data as { providerId?: string; model?: string }
      resolvedProvider = providerData.providerId || data.provider
      resolvedModel = providerData.model || data.model
    }
  }

  // Collect tools from child nodes or inline tools
  let collectedTools: AgentTool[] = [...(data.tools || [])]

  // Find tool nodes that are children of this chat-agent node
  if (workflowFile) {
    const childToolNodes = workflowFile.nodes.filter(
      n => n.parentId === node.id && n.type === 'tool'
    )

    for (const toolNode of childToolNodes) {
      const toolData = toolNode.data as ToolNodeData
      const agentToolType: AgentTool['toolType'] =
        toolData.toolType === 'http' ? 'http' :
        toolData.toolType === 'mcp' ? 'mcp' : 'function'

      const agentTool: AgentTool = {
        name: toolData.toolName,
        description: toolData.description || `Tool: ${toolData.toolName}`,
        toolType: agentToolType,
        parameters: toolData.parameterSchema,
        httpConfig: toolData.toolType === 'http' ? {
          method: toolData.httpMethod || 'GET',
          url: toolData.httpUrl || '',
          headers: toolData.httpHeaders,
          bodyTemplate: toolData.httpBody,
        } : undefined,
        mcpConfig: toolData.toolType === 'mcp' ? {
          serverUrl: toolData.mcpServerUrl,
          serverName: toolData.mcpServerName,
        } : undefined,
      }

      ;(agentTool as AgentTool & { _toolNodeId?: string; _originalToolType?: string })._toolNodeId = toolNode.id
      ;(agentTool as AgentTool & { _toolNodeId?: string; _originalToolType?: string })._originalToolType = toolData.toolType

      collectedTools.push(agentTool)
    }

    // Also check for connected tool-call-router
    if (data.toolRouterNodeId) {
      const toolRouterNode = workflowFile.nodes.find(n => n.id === data.toolRouterNodeId && n.type === 'tool-call-router')
      if (toolRouterNode) {
        const routerChildTools = workflowFile.nodes.filter(
          n => n.parentId === toolRouterNode.id && n.type === 'tool'
        )
        for (const toolNode of routerChildTools) {
          const toolData = toolNode.data as ToolNodeData
          const agentToolType: AgentTool['toolType'] =
            toolData.toolType === 'http' ? 'http' :
            toolData.toolType === 'mcp' ? 'mcp' : 'function'

          const agentTool: AgentTool = {
            name: toolData.toolName,
            description: toolData.description || `Tool: ${toolData.toolName}`,
            toolType: agentToolType,
            parameters: toolData.parameterSchema,
          }
          ;(agentTool as AgentTool & { _toolNodeId?: string })._toolNodeId = toolNode.id
          collectedTools.push(agentTool)
        }
      }
    }
  }

  // Debug: log collected tools
  console.log(`[ChatAgentNode ${node.id}] Collected ${collectedTools.length} tools:`, collectedTools.map(t => t.name))

  // Build prompts
  const systemPromptWithTools = buildSystemPromptWithTools(
    data.agentSystemPrompt || 'You are a helpful AI assistant.',
    collectedTools,
    data.toolCallFormat || 'auto'
  )
  const toolDefinitions = buildToolDefinitions(collectedTools)

  // Resolve user prompt with template expressions
  let userPrompt = data.agentUserPrompt || '{{ input }}'
  const agentContext = { ...context, input: currentInput, previous_output: currentInput }

  // Replace all {{ variable }} patterns in the user prompt
  if (userPrompt.includes('{{')) {
    // First, replace common patterns
    userPrompt = userPrompt.replace(/\{\{\s*input\s*\}\}/g, String(currentInput))
    userPrompt = userPrompt.replace(/\{\{\s*previous_output\s*\}\}/g, String(currentInput))

    // Then replace any node outputs or variables
    for (const [key, value] of Object.entries(context.nodeOutputs)) {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g')
      userPrompt = userPrompt.replace(regex, typeof value === 'string' ? value : JSON.stringify(value))
    }
    for (const [key, value] of Object.entries(context.variables)) {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g')
      userPrompt = userPrompt.replace(regex, typeof value === 'string' ? value : JSON.stringify(value))
    }
  }

  addTraceEntry(trace, {
    type: 'debug_step',
    nodeId: node.id,
    nodeName: data.label,
    nodeType: 'chat-agent',
    message: `Starting agent loop with ${collectedTools.length} tools, max ${data.maxIterations || 10} iterations`,
    data: { toolCount: collectedTools.length, toolNames: collectedTools.map(t => t.name) },
  }, options)

  // Conversation history
  const conversationHistory: Array<{ role: 'user' | 'assistant' | 'tool'; content: string; toolName?: string }> = []
  conversationHistory.push({ role: 'user', content: userPrompt })

  const iterationHistory: AgentIterationRecord[] = []
  let iteration = 0
  let finalResponse: string | null = null
  let lastToolResult: unknown = null
  let totalToolCalls = 0
  const agentStartTime = Date.now()
  let stopReason: 'max-iterations' | 'stop-phrase' | 'no-tool-call' | 'error' | 'cancelled' | 'loop-condition' | 'single-turn' = 'no-tool-call'

  // Loop configuration
  const loopMode = data.loopMode || 'multi-turn'
  const maxIterations = data.maxIterations || 10
  const minIterations = data.minIterations || 0
  const stopPhrases = data.stopPhrases || []
  const iterationDelayMs = data.iterationDelayMs || 0

  // Helper function to check if response contains stop phrases
  const containsStopPhrase = (response: string): boolean => {
    if (stopPhrases.length === 0) return false
    const normalizedResponse = response.toLowerCase()
    return stopPhrases.some(phrase => normalizedResponse.includes(phrase.toLowerCase()))
  }

  // Helper function to evaluate loop condition
  const evaluateLoopCondition = (response: string): boolean => {
    if (!data.loopCondition) return true // Continue if no condition set
    const loopContext = {
      ...agentContext,
      iteration,
      response,
      tools_used: totalToolCalls,
      previous_output: lastToolResult,
    }
    try {
      const result = evaluateExpression(data.loopCondition, loopContext)
      return Boolean(result)
    } catch {
      // On evaluation error, default to continue
      return true
    }
  }

  // Single-turn mode: only run once
  if (loopMode === 'single-turn') {
    // For single-turn, set maxIterations to 1
    addTraceEntry(trace, {
      type: 'debug_step',
      nodeId: node.id,
      nodeName: data.label,
      nodeType: 'chat-agent',
      message: 'Single-turn mode: running one iteration only',
    }, options)
  }

  const effectiveMaxIterations = loopMode === 'single-turn' ? 1 : maxIterations

  // Agent iteration loop
  while (iteration < effectiveMaxIterations) {
    iteration++
    const iterationStartTime = Date.now()

    // Apply iteration delay (except for first iteration)
    if (iteration > 1 && iterationDelayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, iterationDelayMs))
    }

    // Emit onIterationStart checkpoint
    const shouldContinueIterStart = await emitChatAgentCheckpoint('onIterationStart', {
      iteration,
      conversationHistory: deepClone(conversationHistory),
    })
    if (!shouldContinueIterStart) {
      stopReason = 'cancelled'
      break
    }

    addTraceEntry(trace, {
      type: 'debug_step',
      nodeId: node.id,
      nodeName: data.label,
      nodeType: 'chat-agent',
      message: `Agent iteration ${iteration}/${data.maxIterations || 10}`,
      data: { iteration, conversationLength: conversationHistory.length },
    }, options)

    // Call LLM
    const llmResponse = await callAgentLLM(
      systemPromptWithTools,
      conversationHistory,
      resolvedProvider,
      resolvedModel,
      toolDefinitions,
      options,
      node.id,
      trace,
      data.temperature,
      undefined // llmTimeout
    )

    // Parse for tool calls
    const toolCallResult = parseToolCall(llmResponse, data.toolCallFormat || 'auto', collectedTools)

    // Emit onIterationEnd checkpoint
    const shouldContinueIterEnd = await emitChatAgentCheckpoint('onIterationEnd', {
      iteration,
      llmResponse,
      hasToolCall: toolCallResult.hasToolCall,
      toolName: toolCallResult.toolName,
    })
    if (!shouldContinueIterEnd) {
      stopReason = 'cancelled'
      break
    }

    if (!toolCallResult.hasToolCall) {
      // No tool call - check if we should stop or continue
      finalResponse = typeof llmResponse === 'string' ? llmResponse : JSON.stringify(llmResponse)
      conversationHistory.push({ role: 'assistant', content: finalResponse })

      // Check for stop phrases (only after minIterations)
      if (iteration >= minIterations && containsStopPhrase(finalResponse)) {
        stopReason = 'stop-phrase'
        addTraceEntry(trace, {
          type: 'debug_step',
          nodeId: node.id,
          nodeName: data.label,
          nodeType: 'chat-agent',
          message: `Agent completed: stop phrase detected (iteration ${iteration})`,
        }, options)
        break
      }

      // Check loop condition for multi-turn mode (only after minIterations)
      if (loopMode === 'multi-turn' && iteration >= minIterations && data.loopCondition) {
        const shouldContinue = evaluateLoopCondition(finalResponse)
        if (!shouldContinue) {
          stopReason = 'loop-condition'
          addTraceEntry(trace, {
            type: 'debug_step',
            nodeId: node.id,
            nodeName: data.label,
            nodeType: 'chat-agent',
            message: `Agent completed: loop condition evaluated to false (iteration ${iteration})`,
          }, options)
          break
        }
      }

      // For until-complete mode without stop phrase, keep checking
      if (loopMode === 'until-complete') {
        // Continue looping until stop phrase detected (handled above) or max iterations
        addTraceEntry(trace, {
          type: 'debug_step',
          nodeId: node.id,
          nodeName: data.label,
          nodeType: 'chat-agent',
          message: `Agent continuing: no stop phrase detected (until-complete mode, iteration ${iteration})`,
        }, options)

        // Prompt again for next iteration (re-ask with the response as context)
        conversationHistory.push({ role: 'user', content: 'Continue with the task.' })
        continue
      }

      // For user-driven mode, request user input before continuing
      if (loopMode === 'user-driven' && data.loopOnUserInput !== false && options.onUserInput) {
        const userInputConfig: UserInputRequest = {
          nodeId: node.id,
          nodeLabel: data.label || 'Chat Agent',
          prompt: data.userInputPrompt || 'Agent responded. Enter your next message or leave empty to end:',
          inputType: data.userInputType || 'textarea',
          placeholder: data.userInputPlaceholder || 'Type to continue or leave empty to finish...',
          showContext: true,
          context: {
            previousOutput: finalResponse,
            variables: context.variables,
          },
        }

        addTraceEntry(trace, {
          type: 'debug_step',
          nodeId: node.id,
          nodeName: data.label,
          nodeType: 'chat-agent',
          message: `User-driven mode: requesting user input (iteration ${iteration})`,
        }, options)

        const userResponse = await options.onUserInput(userInputConfig)
        if (userResponse.cancelled || !userResponse.value || String(userResponse.value).trim() === '') {
          // User cancelled or provided empty input - stop the loop
          stopReason = 'no-tool-call'
          addTraceEntry(trace, {
            type: 'debug_step',
            nodeId: node.id,
            nodeName: data.label,
            nodeType: 'chat-agent',
            message: `Agent completed: user ended conversation (iteration ${iteration})`,
          }, options)
          break
        }

        // Add user input to conversation and continue
        conversationHistory.push({ role: 'user', content: String(userResponse.value) })
        continue
      }

      // Default: no tool call means completion for single-turn and standard multi-turn
      addTraceEntry(trace, {
        type: 'debug_step',
        nodeId: node.id,
        nodeName: data.label,
        nodeType: 'chat-agent',
        message: `Agent completed: no tool call (iteration ${iteration})`,
      }, options)
      break
    }

    // Tool call found
    totalToolCalls++
    const toolName = toolCallResult.toolName!
    const toolParams = toolCallResult.toolParameters || {}

    // Log the tool call with parameters
    addTraceEntry(trace, {
      type: 'debug_step',
      nodeId: node.id,
      nodeName: data.label,
      nodeType: 'chat-agent',
      message: `LLM requesting tool call: ${toolName}`,
      data: {
        toolName,
        parameters: toolParams,
        rawResponse: typeof llmResponse === 'string' ? llmResponse.substring(0, 500) : llmResponse,
      },
    }, options)

    conversationHistory.push({
      role: 'assistant',
      content: typeof llmResponse === 'string' ? llmResponse : JSON.stringify(llmResponse),
    })

    // Emit onToolCall checkpoint
    const shouldContinueToolCall = await emitChatAgentCheckpoint('onToolCall', {
      iteration,
      toolName,
      toolParams,
    })
    if (!shouldContinueToolCall) {
      stopReason = 'cancelled'
      break
    }

    // Find and execute tool
    const toolDef = collectedTools.find(t => t.name === toolName)
    if (!toolDef) {
      const errorMessage = `Tool '${toolName}' not found. Available: ${collectedTools.map(t => t.name).join(', ')}`
      conversationHistory.push({ role: 'tool', content: errorMessage, toolName })
      continue
    }

    try {
      const toolResult = await executeAgentTool(toolDef, toolParams, agentContext, options, node.id, trace, workflowFile)
      lastToolResult = toolResult

      const toolResultStr = typeof toolResult === 'string' ? toolResult : (toolResult !== undefined && toolResult !== null ? JSON.stringify(toolResult) : '')
      conversationHistory.push({ role: 'tool', content: toolResultStr, toolName })

      // Emit onToolResult checkpoint
      const shouldContinueToolResult = await emitChatAgentCheckpoint('onToolResult', {
        iteration,
        toolName,
        toolResult,
      })
      if (!shouldContinueToolResult) {
        stopReason = 'cancelled'
        break
      }

      addTraceEntry(trace, {
        type: 'debug_step',
        nodeId: node.id,
        nodeName: data.label,
        nodeType: 'chat-agent',
        message: `Tool '${toolName}' completed`,
        data: { toolResult: toolResultStr ? (toolResultStr.substring(0, 200) + (toolResultStr.length > 200 ? '...' : '')) : '(empty result)' },
      }, options)
    } catch (error) {
      const errorMessage = `Error executing tool '${toolName}': ${error instanceof Error ? error.message : String(error)}`
      conversationHistory.push({ role: 'tool', content: errorMessage, toolName })

      addTraceEntry(trace, {
        type: 'debug_step',
        nodeId: node.id,
        nodeName: data.label,
        nodeType: 'chat-agent',
        message: `Tool '${toolName}' failed`,
        data: { error: errorMessage },
      }, options)
    }
  }

  // Max iterations check
  if (finalResponse === null) {
    stopReason = 'max-iterations'
    const lastAssistantMessage = conversationHistory.filter(m => m.role === 'assistant').pop()
    finalResponse = lastAssistantMessage?.content || 'Agent reached maximum iterations.'
  }

  // Emit onAgentComplete checkpoint
  await emitChatAgentCheckpoint('onAgentComplete', {
    finalResponse,
    iterations: iteration,
    totalToolCalls,
    stopReason,
  })

  // Determine output based on outputMode
  let output: unknown
  switch (data.outputMode) {
    case 'full-conversation':
      output = {
        finalResponse,
        conversationHistory,
        iterations: iteration,
        totalToolCalls,
        iterationHistory: isDebugMode ? iterationHistory : undefined,
      }
      break
    case 'last-tool-result':
      output = lastToolResult !== null ? lastToolResult : finalResponse
      break
    case 'final-response':
    default:
      output = finalResponse
      break
  }

  addTraceEntry(trace, {
    type: 'node_complete',
    nodeId: node.id,
    nodeName: data.label,
    nodeType: 'chat-agent',
    message: `Chat Agent completed after ${iteration} iterations, ${totalToolCalls} tool calls`,
    data: { iterations: iteration, totalToolCalls, stopReason },
  }, options)

  return output
}

/**
 * Build tool definitions for the LLM prompt
 */
function buildToolDefinitions(tools: AgentTool[]): unknown[] {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters || { type: 'object', properties: {} },
  }))
}

/**
 * Build system prompt with tool definitions included
 */
function buildSystemPromptWithTools(
  systemPrompt: string,
  tools: AgentTool[],
  format: string
): string {
  if (tools.length === 0) {
    return systemPrompt
  }

  const toolDescriptions = tools.map(t =>
    `- ${t.name}: ${t.description}${t.parameters?.properties ? ` (params: ${Object.keys(t.parameters.properties).join(', ')})` : ''}`
  ).join('\n')

  let formatInstructions = ''
  if (format === 'xml' || format === 'auto') {
    formatInstructions = `

To use a tool, respond with XML in this format:
<tool_call>
<name>tool_name</name>
<params>{"param1": "value1"}</params>
</tool_call>

When you have the final answer and don't need any more tools, respond normally without XML tags.`
  } else if (format === 'json') {
    formatInstructions = `

To use a tool, respond with JSON in this format:
{"tool": "tool_name", "parameters": {"param1": "value1"}}

When you have the final answer and don't need any more tools, respond with plain text (no JSON).`
  }

  return `${systemPrompt}

You have access to the following tools:
${toolDescriptions}
${formatInstructions}`
}

/**
 * Parse tool call from LLM response
 */
function parseToolCall(
  response: unknown,
  format: string,
  allowedTools: AgentTool[]
): {
  hasToolCall: boolean
  toolName: string | null
  toolParameters: Record<string, unknown> | null
} {
  const result = {
    hasToolCall: false,
    toolName: null as string | null,
    toolParameters: null as Record<string, unknown> | null,
  }

  const responseText = typeof response === 'string' ? response : JSON.stringify(response)

  // Try XML format
  if (format === 'auto' || format === 'xml') {
    const xmlMatch = responseText.match(/<tool_call>\s*<name>([^<]+)<\/name>\s*<params>([\s\S]*?)<\/params>\s*<\/tool_call>/i)
    if (xmlMatch) {
      result.hasToolCall = true
      result.toolName = xmlMatch[1].trim()
      try {
        result.toolParameters = JSON.parse(xmlMatch[2].trim())
      } catch {
        result.toolParameters = { raw: xmlMatch[2].trim() }
      }
      return result
    }
  }

  // Try JSON format
  if (format === 'auto' || format === 'json') {
    try {
      // Look for JSON object with tool field
      const jsonMatch = responseText.match(/\{[^{}]*"tool"\s*:\s*"[^"]+"/s)
      if (jsonMatch) {
        // Extract the full JSON object
        let depth = 0
        let start = responseText.indexOf(jsonMatch[0])
        let end = start
        for (let i = start; i < responseText.length; i++) {
          if (responseText[i] === '{') depth++
          else if (responseText[i] === '}') depth--
          if (depth === 0) {
            end = i + 1
            break
          }
        }
        const jsonStr = responseText.substring(start, end)
        const parsed = JSON.parse(jsonStr)
        if (parsed.tool) {
          result.hasToolCall = true
          result.toolName = parsed.tool
          result.toolParameters = parsed.parameters || parsed.params || {}
          return result
        }
      }
    } catch {
      // JSON parse failed, continue to other formats
    }
  }

  // Try OpenAI function calling format (from structured response)
  if (typeof response === 'object' && response !== null) {
    const obj = response as Record<string, unknown>
    const toolCalls = obj.tool_calls as Array<{ function?: { name?: string; arguments?: string } }> | undefined
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      const firstCall = toolCalls[0]
      if (firstCall.function?.name) {
        result.hasToolCall = true
        result.toolName = firstCall.function.name
        try {
          result.toolParameters = firstCall.function.arguments
            ? JSON.parse(firstCall.function.arguments)
            : {}
        } catch {
          result.toolParameters = { raw: firstCall.function.arguments }
        }
        return result
      }
    }
  }

  // Validate against allowed tools
  if (result.hasToolCall && result.toolName) {
    const isAllowed = allowedTools.some(t => t.name === result.toolName)
    if (!isAllowed) {
      result.hasToolCall = false
      result.toolName = null
      result.toolParameters = null
    }
  }

  return result
}

/**
 * Call LLM for agent iteration
 */
async function callAgentLLM(
  systemPrompt: string,
  conversationHistory: Array<{ role: 'user' | 'assistant' | 'tool'; content: string; toolName?: string }>,
  provider: string | undefined,
  model: string | undefined,
  toolDefinitions: unknown[],
  options: ExecutorOptions,
  nodeId: string,
  _trace: ExecutionTrace,
  temperature?: number,
  _timeout?: number
): Promise<unknown> {
  // Build messages array
  const messages = conversationHistory.map(msg => {
    if (msg.role === 'tool') {
      return { role: 'user' as const, content: `[Tool Result from ${msg.toolName}]: ${msg.content}` }
    }
    return { role: msg.role, content: msg.content }
  })

  // Use the onPromptExecute callback if available
  if (options.onPromptExecute) {
    const result = await options.onPromptExecute({
      nodeId,
      prompt: systemPrompt,
      messages,
      provider: provider || undefined,
      model: model || undefined,
      temperature,
      tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
    })

    if (!result.success) {
      throw new Error(`LLM call failed: ${result.error || 'Unknown error'}`)
    }

    return result.response
  }

  // Fallback: return a message asking for onPromptExecute callback
  throw new Error('Agent node requires onPromptExecute callback to call LLM')
}

/**
 * Execute a tool within the agent loop
 *
 * For tools collected from Tool Router, this will route execution to the
 * actual Tool node using the stored _toolNodeId and _originalToolType.
 */
async function executeAgentTool(
  tool: AgentTool & { _toolNodeId?: string; _originalToolType?: string },
  params: Record<string, unknown>,
  context: {
    nodeOutputs: Record<string, unknown>
    variables: Record<string, unknown>
    workflow: Record<string, unknown>
    previous_output?: unknown
  },
  options: ExecutorOptions,
  nodeId: string,
  trace: ExecutionTrace,
  workflowFile?: WorkflowFile
): Promise<unknown> {
  // Helper function to apply output transform if configured
  const applyOutputTransform = (result: unknown, toolNodeId?: string): unknown => {
    if (!toolNodeId || !workflowFile) return result

    const toolNode = workflowFile.nodes.find(n => n.id === toolNodeId)
    if (!toolNode) return result

    const toolData = toolNode.data as ToolNodeData
    if (!toolData.outputTransform) return result

    // Apply the transform using evaluateExpression
    // Make the raw result available as 'result' variable
    // If result is an object, also spread its properties for convenience
    const transformContext = {
      ...context,
      nodeOutputs: {
        ...context.nodeOutputs,
        result,
        // If result is an object, also include its properties for direct access
        ...(typeof result === 'object' && result !== null ? result : {})
      },
      result, // Also available directly
      // If result is an object, spread its properties for template access like {{ output }}
      ...(typeof result === 'object' && result !== null ? result : {}),
    }

    addTraceEntry(trace, {
      type: 'debug_step',
      nodeId,
      nodeName: tool.name,
      nodeType: 'agent',
      message: `Applying output transform for tool '${tool.name}'`,
      data: { transform: toolData.outputTransform },
    }, options)

    const transformed = evaluateExpression(toolData.outputTransform, transformContext)
    return transformed !== undefined ? transformed : result
  }

  // Check if this tool came from a Tool Router (has _originalToolType)
  const originalToolType = tool._originalToolType

  // Handle command tools from Tool Router
  if (originalToolType === 'command' && tool._toolNodeId && workflowFile) {
    const toolNode = workflowFile.nodes.find(n => n.id === tool._toolNodeId)
    if (!toolNode) {
      throw new Error(`Tool node '${tool._toolNodeId}' not found for command tool '${tool.name}'`)
    }

    const toolData = toolNode.data as ToolNodeData

    // Build the command with parameters
    let commandArgs = toolData.commandArgs || ''

    // Debug: log received parameters
    console.log(`[executeAgentTool] Tool '${tool.name}' received params:`, params)
    console.log(`[executeAgentTool] Command args template: "${commandArgs}"`)

    for (const [key, value] of Object.entries(params)) {
      // Replace {{ key }} patterns with parameter values
      commandArgs = commandArgs.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), String(value))
    }

    // Also support direct parameter substitution (for when params is the input)
    if (commandArgs.includes('{{ input }}') && params.input !== undefined) {
      commandArgs = commandArgs.replace(/\{\{\s*input\s*\}\}/g, String(params.input))
    }

    // If {{ input }} still remains and we have a single parameter, use that
    if (commandArgs.includes('{{ input }}')) {
      const paramValues = Object.values(params)
      if (paramValues.length === 1) {
        commandArgs = commandArgs.replace(/\{\{\s*input\s*\}\}/g, String(paramValues[0]))
      } else if (paramValues.length > 1) {
        // Multiple params - stringify the whole object
        commandArgs = commandArgs.replace(/\{\{\s*input\s*\}\}/g, JSON.stringify(params))
      }
    }

    console.log(`[executeAgentTool] Command args after substitution: "${commandArgs}"`)

    const fullCommand = `${toolData.commandExecutable || ''} ${commandArgs}`.trim()

    addTraceEntry(trace, {
      type: 'debug_step',
      nodeId,
      nodeName: tool.name,
      nodeType: 'agent',
      message: `Executing command tool '${tool.name}': ${fullCommand}`,
      data: { command: fullCommand, params, toolNodeId: tool._toolNodeId },
    }, options)

    // Check if we're in Electron and have access to runCommand
    if (typeof window !== 'undefined' && window.electronAPI?.runCommand) {
      // If approval is required, we need to ask the user
      if (toolData.commandRequiresApproval && options.onUserInput) {
        const approvalRequest: UserInputRequest = {
          nodeId: tool._toolNodeId,
          nodeLabel: toolData.label || tool.name,
          prompt: `Approve command execution?\n\n${fullCommand}`,
          inputType: 'confirm',
          required: true,
          showContext: false,
          context: {
            previousOutput: context.previous_output,
            variables: { ...context.variables },
          },
        }

        const response = await options.onUserInput(approvalRequest)
        if (response.cancelled || response.value !== true) {
          return { cancelled: true, command: fullCommand, message: 'Command execution cancelled by user' }
        }
      }

      try {
        const result = await window.electronAPI.runCommand(fullCommand, toolData.commandCwd || undefined)

        addTraceEntry(trace, {
          type: 'debug_step',
          nodeId,
          nodeName: tool.name,
          nodeType: 'agent',
          message: result.success ? `Command tool '${tool.name}' completed` : `Command tool '${tool.name}' failed`,
          data: { success: result.success, output: result.output, exitCode: result.exitCode },
        }, options)

        return applyOutputTransform(result.output, tool._toolNodeId)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        throw new Error(`Command tool '${tool.name}' failed: ${errorMessage}`)
      }
    } else {
      // Not in Electron - return info about what would have been executed
      return {
        skipped: true,
        reason: 'Electron environment required for command execution',
        command: fullCommand,
      }
    }
  }

  // Handle code tools from Tool Router
  if (originalToolType === 'code' && tool._toolNodeId && workflowFile) {
    const toolNode = workflowFile.nodes.find(n => n.id === tool._toolNodeId)
    if (!toolNode) {
      throw new Error(`Tool node '${tool._toolNodeId}' not found for code tool '${tool.name}'`)
    }

    const toolData = toolNode.data as ToolNodeData

    // For code tools, we need to execute the code with params as input
    // This would typically use a code execution service
    addTraceEntry(trace, {
      type: 'debug_step',
      nodeId,
      nodeName: tool.name,
      nodeType: 'agent',
      message: `Code tool '${tool.name}' execution not yet implemented`,
      data: { language: toolData.codeLanguage, params },
    }, options)

    // TODO: Implement code execution via onToolCall or direct evaluation
    throw new Error(`Code tool execution not yet implemented for tool: ${tool.name}`)
  }

  switch (tool.toolType) {
    case 'http': {
      if (!tool.httpConfig) {
        throw new Error(`HTTP tool '${tool.name}' missing httpConfig`)
      }

      // Resolve URL with params
      let url = tool.httpConfig.url
      for (const [key, value] of Object.entries(params)) {
        url = url.replace(`{${key}}`, encodeURIComponent(String(value)))
      }

      // Build body
      let body: string | undefined
      if (tool.httpConfig.method !== 'GET') {
        if (tool.httpConfig.bodyTemplate) {
          body = tool.httpConfig.bodyTemplate
          for (const [key, value] of Object.entries(params)) {
            body = body.replace(`{{${key}}}`, JSON.stringify(value))
          }
        } else {
          body = JSON.stringify(params)
        }
      }

      addTraceEntry(trace, {
        type: 'debug_step',
        nodeId,
        nodeName: tool.name,
        nodeType: 'agent',
        message: `HTTP ${tool.httpConfig.method} request to ${url}`,
        data: { url, method: tool.httpConfig.method, hasBody: !!body },
      }, options)

      try {
        // Use Electron IPC handler if available to bypass CORS restrictions
        const isElectron = typeof window !== 'undefined' && (window as any).electronAPI?.apiRequest

        if (isElectron) {
          // Use Electron IPC for HTTP requests (bypasses CORS)
          const ipcResponse = await (window as any).electronAPI.apiRequest(url, {
            method: tool.httpConfig.method,
            headers: {
              'Content-Type': 'application/json',
              ...tool.httpConfig.headers,
            },
            body,
          })

          // Handle IPC error response
          if (!ipcResponse.success) {
            throw new Error(ipcResponse.error || 'Unknown IPC request error')
          }

          // Check if HTTP response is ok (status 200-299)
          if (!ipcResponse.ok) {
            throw new Error(`HTTP ${ipcResponse.status} ${ipcResponse.statusText}: ${ipcResponse.body || '(no response body)'}`)
          }

          const contentType = ipcResponse.headers['content-type'] || ''
          let httpResult: unknown
          if (contentType.includes('application/json')) {
            try {
              httpResult = JSON.parse(ipcResponse.body)
            } catch {
              httpResult = ipcResponse.body
            }
          } else {
            httpResult = ipcResponse.body
          }

          addTraceEntry(trace, {
            type: 'debug_step',
            nodeId,
            nodeName: tool.name,
            nodeType: 'agent',
            message: `HTTP request successful (via Electron IPC)`,
            data: {
              status: ipcResponse.status,
              contentType,
              resultPreview: typeof httpResult === 'string' ? httpResult.substring(0, 200) : JSON.stringify(httpResult).substring(0, 200)
            },
          }, options)

          return applyOutputTransform(httpResult, tool._toolNodeId)
        } else {
          // Use standard fetch for web environment
          const response = await fetch(url, {
            method: tool.httpConfig.method,
            headers: {
              'Content-Type': 'application/json',
              ...tool.httpConfig.headers,
            },
            body,
          })

          // Check if response is ok (status 200-299)
          if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`HTTP ${response.status} ${response.statusText}: ${errorText || '(no response body)'}`)
          }

          const contentType = response.headers.get('content-type')
          let httpResult: unknown
          if (contentType?.includes('application/json')) {
            httpResult = await response.json()
          } else {
            httpResult = await response.text()
          }

          addTraceEntry(trace, {
            type: 'debug_step',
            nodeId,
            nodeName: tool.name,
            nodeType: 'agent',
            message: `HTTP request successful`,
            data: {
              status: response.status,
              contentType,
              resultPreview: typeof httpResult === 'string' ? httpResult.substring(0, 200) : JSON.stringify(httpResult).substring(0, 200)
            },
          }, options)

          return applyOutputTransform(httpResult, tool._toolNodeId)
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        addTraceEntry(trace, {
          type: 'debug_step',
          nodeId,
          nodeName: tool.name,
          nodeType: 'agent',
          message: `HTTP request failed: ${errorMessage}`,
          data: { error: errorMessage, url },
        }, options)
        throw new Error(`HTTP request failed: ${errorMessage}`)
      }
    }

    case 'function': {
      // Use onToolCall callback
      if (!options.onToolCall) {
        throw new Error(`Function tool '${tool.name}' requires onToolCall callback`)
      }

      const result = await options.onToolCall({
        nodeId,
        toolName: tool.name,
        toolType: 'function',
        parameters: params,
      })

      if (!result.success) {
        throw new Error(result.error || 'Tool execution failed')
      }

      return applyOutputTransform(result.result, tool._toolNodeId)
    }

    case 'mcp': {
      // Use onToolCall callback for MCP
      if (!options.onToolCall) {
        throw new Error(`MCP tool '${tool.name}' requires onToolCall callback`)
      }

      const result = await options.onToolCall({
        nodeId,
        toolName: tool.name,
        toolType: 'mcp',
        parameters: params,
        mcpConfig: tool.mcpConfig,
      })

      if (!result.success) {
        throw new Error(result.error || 'MCP tool execution failed')
      }

      return applyOutputTransform(result.result, tool._toolNodeId)
    }

    case 'workflow': {
      // Workflow tools are not yet supported in agent context
      throw new Error(`Workflow tools are not yet supported in agent nodes. Tool: ${tool.name}`)
    }

    default:
      throw new Error(`Unknown tool type: ${tool.toolType}`)
  }
}

/**
 * Execute a tool-call-parser node - parses LLM output for tool calls
 *
 * Supports: OpenAI, Anthropic, XML, JSON, and auto-detect formats
 */
function executeToolCallParserNode(
  node: WorkflowNode,
  context: {
    nodeOutputs: Record<string, unknown>
    variables: Record<string, unknown>
    workflow: Record<string, unknown>
    previous_output?: unknown
  },
  trace: ExecutionTrace,
  options: ExecutorOptions
): {
  hasToolCall: boolean
  toolName: string | null
  toolParameters: Record<string, unknown> | null
  remainingText: string
  rawToolCall: unknown
  format: string
} {
  const data = node.data as ToolCallParserNodeData
  const input = context.previous_output

  // Default result structure
  const result = {
    hasToolCall: false,
    toolName: null as string | null,
    toolParameters: null as Record<string, unknown> | null,
    remainingText: '',
    rawToolCall: null as unknown,
    format: 'none',
  }

  // Handle different input types
  let inputText = ''
  let inputObject: unknown = null

  if (typeof input === 'string') {
    inputText = input
  } else if (typeof input === 'object' && input !== null) {
    inputObject = input
    // Also stringify for text-based parsing
    inputText = JSON.stringify(input)
  } else {
    // No parseable input
    addTraceEntry(trace, {
      type: 'debug_step',
      nodeId: node.id,
      nodeName: node.data.label,
      nodeType: 'tool-call-parser',
      message: 'No parseable input provided',
      data: { inputType: typeof input },
    }, options)
    return handleNoToolCall(result, data, node, trace, options)
  }

  const format = data.format || 'auto'

  // Try parsing based on format
  let parsed = false

  if (format === 'auto' || format === 'openai') {
    parsed = tryParseOpenAI(inputObject, result)
    if (parsed) result.format = 'openai'
  }

  if (!parsed && (format === 'auto' || format === 'anthropic')) {
    parsed = tryParseAnthropic(inputObject, result)
    if (parsed) result.format = 'anthropic'
  }

  if (!parsed && (format === 'auto' || format === 'xml')) {
    parsed = tryParseXML(inputText, result, data.xmlTagName)
    if (parsed) result.format = 'xml'
  }

  if (!parsed && (format === 'auto' || format === 'json')) {
    parsed = tryParseJSON(inputText, result, data.jsonToolNameField, data.jsonParametersField)
    if (parsed) result.format = 'json'
  }

  // Validate against allowed tools if specified
  if (result.hasToolCall && data.allowedTools && data.allowedTools.length > 0) {
    if (result.toolName && !data.allowedTools.includes(result.toolName)) {
      addTraceEntry(trace, {
        type: 'debug_step',
        nodeId: node.id,
        nodeName: node.data.label,
        nodeType: 'tool-call-parser',
        message: `Tool '${result.toolName}' not in allowed tools list`,
        data: { toolName: result.toolName, allowedTools: data.allowedTools },
      }, options)
      // Treat as no tool call since it's not allowed
      result.hasToolCall = false
      result.toolName = null
      result.toolParameters = null
    }
  }

  if (!result.hasToolCall) {
    return handleNoToolCall(result, data, node, trace, options)
  }

  addTraceEntry(trace, {
    type: 'debug_step',
    nodeId: node.id,
    nodeName: node.data.label,
    nodeType: 'tool-call-parser',
    message: `Parsed tool call: ${result.toolName} (${result.format} format)`,
    data: { toolName: result.toolName, parameters: result.toolParameters, format: result.format },
  }, options)

  return result
}

/**
 * Handle the case where no tool call was found
 */
function handleNoToolCall(
  result: {
    hasToolCall: boolean
    toolName: string | null
    toolParameters: Record<string, unknown> | null
    remainingText: string
    rawToolCall: unknown
    format: string
  },
  data: ToolCallParserNodeData,
  node: WorkflowNode,
  trace: ExecutionTrace,
  options: ExecutorOptions
): typeof result {
  const behavior = data.noToolCallBehavior || 'passthrough'

  if (behavior === 'error') {
    throw new Error(`No tool call found in input at node: ${node.data.label}`)
  }

  if (behavior === 'default' && data.defaultTool) {
    result.hasToolCall = true
    result.toolName = data.defaultTool
    result.toolParameters = data.defaultParameters || {}
    result.format = 'default'

    addTraceEntry(trace, {
      type: 'debug_step',
      nodeId: node.id,
      nodeName: node.data.label,
      nodeType: 'tool-call-parser',
      message: `No tool call found, using default: ${data.defaultTool}`,
      data: { defaultTool: data.defaultTool, defaultParameters: data.defaultParameters },
    }, options)
  } else {
    addTraceEntry(trace, {
      type: 'debug_step',
      nodeId: node.id,
      nodeName: node.data.label,
      nodeType: 'tool-call-parser',
      message: 'No tool call found, passing through',
    }, options)
  }

  return result
}

/**
 * Try to parse OpenAI function calling format
 * Looks for: { tool_calls: [{ function: { name, arguments } }] }
 */
function tryParseOpenAI(
  input: unknown,
  result: {
    hasToolCall: boolean
    toolName: string | null
    toolParameters: Record<string, unknown> | null
    remainingText: string
    rawToolCall: unknown
  }
): boolean {
  if (!input || typeof input !== 'object') return false

  const obj = input as Record<string, unknown>

  // Check for tool_calls array (OpenAI response format)
  const toolCalls = obj.tool_calls || (obj.choices as Array<{ message?: { tool_calls?: unknown[] } }>)?.[0]?.message?.tool_calls

  if (Array.isArray(toolCalls) && toolCalls.length > 0) {
    const firstCall = toolCalls[0] as { function?: { name?: string; arguments?: string } }
    if (firstCall.function?.name) {
      result.hasToolCall = true
      result.toolName = firstCall.function.name
      result.rawToolCall = firstCall

      // Parse arguments (they're typically a JSON string)
      if (firstCall.function.arguments) {
        try {
          result.toolParameters = typeof firstCall.function.arguments === 'string'
            ? JSON.parse(firstCall.function.arguments)
            : firstCall.function.arguments as Record<string, unknown>
        } catch {
          result.toolParameters = { raw: firstCall.function.arguments }
        }
      }

      // Extract remaining text content if present
      const content = obj.content || (obj.choices as Array<{ message?: { content?: string } }>)?.[0]?.message?.content
      if (typeof content === 'string') {
        result.remainingText = content
      }

      return true
    }
  }

  return false
}

/**
 * Try to parse Anthropic tool_use format
 * Looks for: { content: [{ type: 'tool_use', name, input }] }
 */
function tryParseAnthropic(
  input: unknown,
  result: {
    hasToolCall: boolean
    toolName: string | null
    toolParameters: Record<string, unknown> | null
    remainingText: string
    rawToolCall: unknown
  }
): boolean {
  if (!input || typeof input !== 'object') return false

  const obj = input as Record<string, unknown>

  // Check for content array with tool_use blocks
  const content = obj.content
  if (Array.isArray(content)) {
    const toolUse = content.find((block: unknown) =>
      block && typeof block === 'object' && (block as Record<string, unknown>).type === 'tool_use'
    ) as { type: string; name?: string; id?: string; input?: Record<string, unknown> } | undefined

    if (toolUse?.name) {
      result.hasToolCall = true
      result.toolName = toolUse.name
      result.toolParameters = toolUse.input || {}
      result.rawToolCall = toolUse

      // Extract remaining text content
      const textBlocks = content.filter((block: unknown) =>
        block && typeof block === 'object' && (block as Record<string, unknown>).type === 'text'
      )
      result.remainingText = textBlocks
        .map((block: unknown) => (block as { text?: string }).text || '')
        .join('\n')

      return true
    }
  }

  return false
}

/**
 * Try to parse XML-style tool calls
 * Looks for: <tool_call>...</tool_call> or custom tag
 */
function tryParseXML(
  input: string,
  result: {
    hasToolCall: boolean
    toolName: string | null
    toolParameters: Record<string, unknown> | null
    remainingText: string
    rawToolCall: unknown
  },
  customTagName?: string
): boolean {
  const tagName = customTagName || 'tool_call'
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i')
  const match = input.match(regex)

  if (match) {
    const toolContent = match[1].trim()
    result.rawToolCall = toolContent

    // Try to parse the content as JSON
    try {
      const parsed = JSON.parse(toolContent)
      if (parsed.name || parsed.tool || parsed.function) {
        result.hasToolCall = true
        result.toolName = parsed.name || parsed.tool || parsed.function
        result.toolParameters = parsed.parameters || parsed.arguments || parsed.input || {}
      }
    } catch {
      // Try to extract name and parameters from XML-like structure
      const nameMatch = toolContent.match(/<name>([^<]+)<\/name>/i)
      const paramsMatch = toolContent.match(/<(?:parameters|arguments|input)>([\s\S]*?)<\/(?:parameters|arguments|input)>/i)

      if (nameMatch) {
        result.hasToolCall = true
        result.toolName = nameMatch[1].trim()

        if (paramsMatch) {
          try {
            result.toolParameters = JSON.parse(paramsMatch[1].trim())
          } catch {
            // Try to parse as simple key-value pairs
            const params: Record<string, string> = {}
            const paramRegex = /<(\w+)>([^<]*)<\/\1>/g
            let paramMatch
            while ((paramMatch = paramRegex.exec(paramsMatch[1])) !== null) {
              params[paramMatch[1]] = paramMatch[2]
            }
            result.toolParameters = Object.keys(params).length > 0 ? params : { raw: paramsMatch[1] }
          }
        }
      }
    }

    // Extract remaining text (everything outside the tool_call tags)
    result.remainingText = input.replace(regex, '').trim()

    return result.hasToolCall
  }

  return false
}

/**
 * Try to parse generic JSON with configurable field names
 */
function tryParseJSON(
  input: string,
  result: {
    hasToolCall: boolean
    toolName: string | null
    toolParameters: Record<string, unknown> | null
    remainingText: string
    rawToolCall: unknown
  },
  toolNameField?: string,
  parametersField?: string
): boolean {
  // Try to find and parse JSON in the input
  const jsonMatch = input.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return false

  try {
    const parsed = JSON.parse(jsonMatch[0])
    result.rawToolCall = parsed

    // Look for tool name in common field names
    const nameFields = [toolNameField, 'name', 'tool', 'function', 'action', 'command'].filter(Boolean) as string[]
    const paramsFields = [parametersField, 'parameters', 'arguments', 'args', 'input', 'params'].filter(Boolean) as string[]

    for (const field of nameFields) {
      if (parsed[field] && typeof parsed[field] === 'string') {
        result.hasToolCall = true
        result.toolName = parsed[field]
        break
      }
    }

    if (result.hasToolCall) {
      for (const field of paramsFields) {
        if (parsed[field] && typeof parsed[field] === 'object') {
          result.toolParameters = parsed[field]
          break
        }
      }
      result.toolParameters = result.toolParameters || {}
    }

    // Extract remaining text
    result.remainingText = input.replace(jsonMatch[0], '').trim()

    return result.hasToolCall
  } catch {
    return false
  }
}

/**
 * Execute a callback/checkpoint node
 */
async function executeCallbackNode(
  node: WorkflowNode,
  context: {
    nodeOutputs: Record<string, unknown>
    variables: Record<string, unknown>
    workflow: Record<string, unknown>
    previous_output?: unknown
  },
  options: ExecutorOptions,
  state: WorkflowExecutionState,
  workflowFile: WorkflowFile,
  executionOrder: string[],
  trace: ExecutionTrace
): Promise<unknown> {
  const data = node.data as CallbackNodeData
  const executionMode = options.executionMode || 'automated'

  // Extract behaviors with defaults
  const behaviors = {
    logToConsole: data.logToConsole ?? false,
    logToHistory: data.logToHistory ?? true,
    pauseInDebug: data.pauseInDebug ?? true,
    requireApproval: data.requireApproval ?? false,
    sendWebhook: data.sendWebhook ?? false,
  }

  // Check if this is effectively a passthrough (no behaviors enabled)
  const isPassthrough = !behaviors.logToConsole && !behaviors.logToHistory &&
    !behaviors.pauseInDebug && !behaviors.requireApproval && !behaviors.sendWebhook

  // In automated mode, passthrough checkpoints are no-ops
  if (executionMode === 'automated' && isPassthrough) {
    return context.previous_output
  }

  // Find the next node in execution order
  const currentIndex = executionOrder.indexOf(node.id)
  const nextNodeId = currentIndex < executionOrder.length - 1 ? executionOrder[currentIndex + 1] : null
  const nextNode = nextNodeId ? workflowFile.nodes.find(n => n.id === nextNodeId) : null

  // Resolve message template if present
  let resolvedMessage: string | undefined
  if (data.message) {
    const result = evaluateExpression(data.message, context)
    resolvedMessage = typeof result === 'string' ? result : JSON.stringify(result)
  }

  // Build checkpoint event
  const checkpointEvent: CheckpointEvent = {
    nodeId: node.id,
    checkpointName: data.checkpointName,
    message: resolvedMessage,
    previousOutput: data.capturePreviousOutput ? context.previous_output : undefined,
    nextNodeInfo: nextNode ? {
      id: nextNode.id,
      type: nextNode.type,
      label: nextNode.data.label,
    } : null,
    timestamp: Date.now(),
    behaviors,
    approval: behaviors.requireApproval ? {
      title: data.approvalTitle,
      instructions: data.approvalInstructions,
      timeoutMs: data.approvalTimeoutMs,
      timeoutAction: data.approvalTimeoutAction,
    } : undefined,
    webhook: behaviors.sendWebhook ? {
      url: data.webhookUrl,
      waitForAck: data.webhookWaitForAck,
      ackTimeoutMs: data.webhookAckTimeoutMs,
    } : undefined,
  }

  // Log to console if enabled
  if (behaviors.logToConsole) {
    console.log(`[Checkpoint: ${data.checkpointName || node.id}]`, checkpointEvent)
  }

  // Add checkpoint to trace (log to history)
  if (behaviors.logToHistory) {
    const activeBehaviors = Object.entries(behaviors)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(', ')
    addTraceEntry(trace, {
      type: 'checkpoint',
      nodeId: node.id,
      nodeName: node.data.label,
      nodeType: node.type,
      message: `Checkpoint '${data.checkpointName || node.id}' [${activeBehaviors || 'passthrough'}]`,
      data: checkpointEvent,
    }, options)
  }

  // Handle approval gate (always pauses, regardless of execution mode)
  if (behaviors.requireApproval) {
    if (options.onCheckpoint) {
      const shouldContinue = await options.onCheckpoint(checkpointEvent)
      if (!shouldContinue) {
        throw new Error(`Execution stopped at checkpoint: ${data.checkpointName || node.id}`)
      }
    }
  }
  // Handle debug pause (only pauses in debug mode)
  else if (behaviors.pauseInDebug && executionMode === 'debug') {
    if (options.onCheckpoint) {
      const shouldContinue = await options.onCheckpoint(checkpointEvent)
      if (!shouldContinue) {
        throw new Error(`Execution stopped at checkpoint: ${data.checkpointName || node.id}`)
      }
    }
  }

  // Send webhook if enabled
  if (behaviors.sendWebhook && data.webhookUrl) {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(data.webhookHeaders || {}),
      }
      const response = await fetch(data.webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(checkpointEvent),
      })

      // If waiting for acknowledgment, check response
      if (data.webhookWaitForAck && !response.ok) {
        console.warn(`Webhook acknowledgment failed: ${response.status} ${response.statusText}`)
      }
    } catch (e) {
      console.warn(`Failed to send webhook to ${data.webhookUrl}:`, e)
    }
  }

  // Emit checkpoint event for UI updates (when not already emitted via approval/pause)
  if (options.onCheckpoint && !behaviors.requireApproval && !(behaviors.pauseInDebug && executionMode === 'debug')) {
    await options.onCheckpoint(checkpointEvent)
  }

  // Pass through the previous output
  return context.previous_output
}

/**
 * Create a simple prompt executor that uses the existing execution service
 */
export function createPromptExecutor(
  executeFunc: (source: string, params: Record<string, unknown>, provider?: string, model?: string) => Promise<string>
): ExecutorOptions['executePrompt'] {
  return executeFunc
}

/**
 * Create a workflow executor with cancellation support and debug capabilities
 */
export function createWorkflowExecutor(
  workflow: ParsedWorkflow,
  params: Record<string, unknown>,
  options: ExecutorOptions = {}
) {
  let cancelled = false
  let currentTrace: ExecutionTrace | null = null
  let debugResolve: ((continueExecution: boolean) => void) | null = null

  const execute = async (): Promise<WorkflowResult & { trace: ExecutionTrace }> => {
    const wrappedOptions: ExecutorOptions = {
      ...options,
      onNodeStart: (nodeId) => {
        if (cancelled) throw new Error('Execution cancelled')
        options.onNodeStart?.(nodeId)
      },
      onDebugPause: async (debugState, trace) => {
        currentTrace = trace
        // If a custom handler is provided, use it
        if (options.onDebugPause) {
          return options.onDebugPause(debugState, trace)
        }
        // Otherwise, create a promise that can be resolved externally
        return new Promise((resolve) => {
          debugResolve = resolve
        })
      },
    }

    const result = await executeWorkflow(workflow, params, wrappedOptions)
    currentTrace = result.trace
    return result
  }

  const cancel = () => {
    cancelled = true
    // If paused, reject the debug promise to stop execution
    if (debugResolve) {
      debugResolve(false)
      debugResolve = null
    }
  }

  /** Resume execution from a debug pause */
  const resume = () => {
    if (debugResolve) {
      debugResolve(true)
      debugResolve = null
    }
  }

  /** Stop execution from a debug pause */
  const stop = () => {
    if (debugResolve) {
      debugResolve(false)
      debugResolve = null
    }
    cancelled = true
  }

  /** Get the current execution trace */
  const getTrace = () => currentTrace

  return { execute, cancel, resume, stop, getTrace }
}

/**
 * Export execution trace as JSON string
 */
export function exportTraceAsJson(trace: ExecutionTrace): string {
  return JSON.stringify(trace, null, 2)
}

/**
 * Export execution trace as downloadable file
 */
export function downloadTrace(trace: ExecutionTrace, filename?: string): void {
  const json = exportTraceAsJson(trace)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || `workflow-trace-${trace.id}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Format trace entry for display
 */
export function formatTraceEntry(entry: TraceEntry): string {
  const time = new Date(entry.timestamp).toISOString().split('T')[1].slice(0, -1)
  const duration = entry.duration ? ` (${entry.duration}ms)` : ''
  const node = entry.nodeName ? `[${entry.nodeName}]` : ''
  return `${time} ${entry.type.toUpperCase()} ${node} ${entry.message}${duration}`
}

/**
 * Get trace summary statistics
 */
export function getTraceSummary(trace: ExecutionTrace): {
  totalDuration: number
  nodesExecuted: number
  nodesSucceeded: number
  nodesFailed: number
  checkpointsHit: number
  averageNodeDuration: number
} {
  const nodeEntries = trace.entries.filter(e => e.type === 'node_complete' || e.type === 'node_error')
  const completedNodes = trace.entries.filter(e => e.type === 'node_complete')
  const failedNodes = trace.entries.filter(e => e.type === 'node_error')
  const checkpoints = trace.entries.filter(e => e.type === 'checkpoint')

  const totalNodeDuration = completedNodes.reduce((sum, e) => sum + (e.duration || 0), 0)

  return {
    totalDuration: (trace.endTime || Date.now()) - trace.startTime,
    nodesExecuted: nodeEntries.length,
    nodesSucceeded: completedNodes.length,
    nodesFailed: failedNodes.length,
    checkpointsHit: checkpoints.length,
    averageNodeDuration: completedNodes.length > 0 ? totalNodeDuration / completedNodes.length : 0,
  }
}

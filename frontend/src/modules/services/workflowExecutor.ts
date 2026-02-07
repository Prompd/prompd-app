/**
 * Frontend Workflow Executor Wrapper
 *
 * Thin IPC wrapper that proxies to @prompd/cli's executeWorkflow in Electron main process.
 * Provides React-specific functionality:
 * - Cancellation support (local, via cancelled flag)
 * - Debug state tracking (local)
 * - Execution trace retrieval (from returned result)
 *
 * Architecture:
 * Renderer Process (this file) → IPC call → Main Process → @prompd/cli.executeWorkflow()
 *
 * **Important Limitations (IPC Serialization):**
 * - Callback functions (onNodeStart, onProgress, etc.) cannot be passed via IPC
 * - Execution happens without live callbacks - result is returned at the end
 * - For live progress updates, would need IPC event system (future enhancement)
 *
 * **Future Enhancement Path:**
 * Could implement bidirectional IPC events for live updates:
 * - Main emits: 'workflow:node-start', 'workflow:progress', etc.
 * - Renderer listens and updates UI in real-time
 * - Renderer can send control commands: 'workflow:pause', 'workflow:resume'
 *
 * Note: This file only contains type-only imports from @prompd/cli.
 * Actual execution happens in main process which has access to Node.js modules.
 */

import { memoryService } from './memoryService'
import { useEditorStore } from '@/stores/editorStore'

// Import workflow file format types from frontend (what gets passed around in UI)
import type { ParsedWorkflow } from './workflowParser'
import type { WorkflowResult, WorkflowExecutionState } from './workflowTypes'

// Import execution engine types from CLI (these are execution-specific, not file format)
import type {
  ExecutionTrace,
  TraceEntry,
  CheckpointEvent,
  UserInputRequest,
  UserInputResponse,
  ExecutionMode,
  ToolCallRequest,
  ToolCallResult,
  PromptExecuteRequest,
  PromptExecuteResult
} from '@prompd/cli'

// Frontend-specific debug state interface
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

// Frontend executor options with React callbacks
// Matches CLI's ExecutorOptions interface
export interface ExecutorOptions {
  executionMode?: ExecutionMode
  breakpoints?: Set<string>
  onProgress?: (state: WorkflowExecutionState) => void
  onNodeStart?: (nodeId: string) => void
  onNodeComplete?: (nodeId: string, output: unknown) => void
  onNodeError?: (nodeId: string, error: string) => void
  onCheckpoint?: (event: CheckpointEvent) => Promise<boolean>
  onUserInput?: (request: UserInputRequest) => Promise<UserInputResponse>
  onDebugPause?: (debugState: DebugState, trace: ExecutionTrace) => Promise<boolean>
  executePrompt?: (source: string, params: Record<string, unknown>, provider?: string, model?: string) => Promise<string>
  onPromptExecute?: (request: PromptExecuteRequest) => Promise<PromptExecuteResult>
  onToolCall?: (request: ToolCallRequest) => Promise<ToolCallResult>
  onTraceEntry?: (entry: TraceEntry) => void
  onStream?: (nodeId: string, chunk: string) => void
}

/**
 * Creates a workflow executor with cancellation support and live event updates
 * Frontend-specific wrapper around CLI's executeWorkflow via IPC events
 */
export function createWorkflowExecutor(
  workflow: ParsedWorkflow,
  params: Record<string, unknown>,
  options: ExecutorOptions = {}
) {
  let executionId: string | null = null
  let currentTrace: ExecutionTrace | null = null
  let eventCleanup: (() => void) | null = null
  let completeResolve: ((result: WorkflowResult & { trace: ExecutionTrace }) => void) | null = null
  let completeReject: ((error: Error) => void) | null = null

  const execute = async (): Promise<WorkflowResult & { trace: ExecutionTrace }> => {
    // Check if we're in Electron environment
    const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron

    if (!isElectron || !window.electronAPI?.workflow) {
      throw new Error(
        'Workflow execution requires Electron environment. ' +
        'This should only be called from Electron renderer process.'
      )
    }

    // Get workspace path and workflow file path from editor store
    const workspacePath = useEditorStore.getState().explorerDirPath
    const tabs = useEditorStore.getState().tabs
    const activeTabId = useEditorStore.getState().activeTabId
    const activeTab = tabs.find((t: { id: string }) => t.id === activeTabId)
    const workflowFilePath = (activeTab as { filePath?: string } | undefined)?.filePath || undefined

    // Create serializable options (strip out functions and non-serializable objects)
    const serializableOptions = {
      executionMode: options.executionMode,
      breakpoints: options.breakpoints ? Array.from(options.breakpoints) : undefined,
      workingDirectory: workspacePath || undefined,
      workflowFilePath
    }

    // Start execution (returns immediately with executionId)
    const { executionId: newExecutionId } = await window.electronAPI.workflow.execute(
      workflow,
      params,
      serializableOptions
    )

    executionId = newExecutionId
    console.log(`[WorkflowExecutor] Started execution: ${executionId}`)

    // Set up event listener for live updates (single event loop with type-based routing)
    eventCleanup = window.electronAPI.workflow.onEvent((event) => {
      // Only process events for this execution
      if (event.executionId !== executionId) return

      console.log(`[WorkflowExecutor] Event: ${event.type}`, event)

      // Route based on event type
      // TypeScript narrows event.data type based on event.type (discriminated union)
      switch (event.type) {
        case 'node-start':
          options.onNodeStart?.(event.nodeId)
          break

        case 'node-complete':
          options.onNodeComplete?.(event.nodeId, event.data.output)
          break

        case 'node-error':
          options.onNodeError?.(event.nodeId, event.data.error)
          break

        case 'progress':
          options.onProgress?.(event.data as WorkflowExecutionState)
          break

        case 'trace-entry':
          options.onTraceEntry?.(event.data as TraceEntry)
          break

        case 'complete':
          // Execution finished successfully
          const result = event.data as WorkflowResult & { trace: ExecutionTrace }
          currentTrace = result.trace || null

          // Clean up event listener
          eventCleanup?.()
          eventCleanup = null

          // Resolve promise
          completeResolve?.(result)
          break

        case 'error':
          // Execution failed
          const error = new Error(event.data.error || 'Workflow execution failed')
          if (event.data.stack) {
            error.stack = event.data.stack
          }

          // Clean up event listener
          eventCleanup?.()
          eventCleanup = null

          // Reject promise
          completeReject?.(error)
          break

        case 'user-input-request':
          // Bidirectional: Main process needs user input
          if (options.onUserInput) {
            options.onUserInput(event.data as UserInputRequest)
              .then((response) => {
                // Send response back to main process
                window.electronAPI?.workflow?.respondToUserInput(event.requestId, response)
              })
              .catch((err) => {
                console.error('[WorkflowExecutor] User input error:', err)
                // Send empty response to unblock execution
                window.electronAPI?.workflow?.respondToUserInput(event.requestId, { cancelled: true })
              })
          } else {
            // No handler - send empty response
            window.electronAPI?.workflow?.respondToUserInput(event.requestId, { cancelled: true })
          }
          break

        case 'checkpoint-request':
          // Bidirectional: Main process needs checkpoint confirmation
          if (options.onCheckpoint) {
            options.onCheckpoint(event.data as CheckpointEvent)
              .then((shouldContinue) => {
                // Send response back to main process
                window.electronAPI?.workflow?.respondToCheckpoint(event.requestId, shouldContinue)
              })
              .catch((err) => {
                console.error('[WorkflowExecutor] Checkpoint error:', err)
                // Default to continuing execution
                window.electronAPI?.workflow?.respondToCheckpoint(event.requestId, true)
              })
          } else {
            // No handler - default to continuing
            window.electronAPI?.workflow?.respondToCheckpoint(event.requestId, true)
          }
          break
      }
    })

    // Return a promise that resolves when execution completes
    return new Promise((resolve, reject) => {
      completeResolve = resolve
      completeReject = reject
    })
  }

  return {
    execute,
    cancel: () => {
      if (executionId && window.electronAPI?.workflow) {
        console.log(`[WorkflowExecutor] Cancelling execution: ${executionId}`)
        window.electronAPI.workflow.cancel(executionId)

        // Clean up event listener
        eventCleanup?.()
        eventCleanup = null
      }
    },
    stop: () => {
      if (executionId && window.electronAPI?.workflow) {
        window.electronAPI.workflow.cancel(executionId)
        eventCleanup?.()
        eventCleanup = null
      }
    },
    getTrace: () => currentTrace,
    continueExecution: () => {
      // Future: could send IPC command to resume paused execution
      console.warn('[WorkflowExecutor] continueExecution not yet implemented')
    },
    resume: () => {
      console.warn('[WorkflowExecutor] resume not yet implemented')
    },
    abortExecution: () => {
      if (executionId && window.electronAPI?.workflow) {
        window.electronAPI.workflow.cancel(executionId)
        eventCleanup?.()
        eventCleanup = null
      }
    }
  }
}

// Re-export utility functions via IPC
export async function downloadTrace(trace: ExecutionTrace, filename?: string): Promise<{ success: boolean; filePath?: string; cancelled?: boolean }> {
  const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron

  if (!isElectron || !window.electronAPI?.workflow) {
    throw new Error('downloadTrace requires Electron environment')
  }

  const result = await window.electronAPI.workflow.downloadTrace(trace, filename)
  return result
}

export function getTraceSummary(trace: ExecutionTrace): {
  totalNodes: number
  completedNodes: number
  errorNodes: number
  totalDuration: number
} {
  // Simple client-side implementation to avoid async overhead
  const entries = trace.entries || []
  const nodeSet = new Set<string>()
  const errorNodes = new Set<string>()
  let totalDuration = 0

  entries.forEach(entry => {
    if (entry.nodeId) {
      nodeSet.add(entry.nodeId)
      if (entry.type === 'node_error') {
        errorNodes.add(entry.nodeId)
      }
    }
    if (entry.duration) {
      totalDuration += entry.duration
    }
  })

  return {
    totalNodes: nodeSet.size,
    completedNodes: nodeSet.size - errorNodes.size,
    errorNodes: errorNodes.size,
    totalDuration
  }
}

// Re-export types from CLI for convenience
export type {
  ParsedWorkflow,
  WorkflowResult,
  WorkflowExecutionState,
  ExecutionTrace,
  TraceEntry,
  CheckpointEvent,
  UserInputRequest,
  UserInputResponse,
  ExecutionMode,
  ToolCallRequest,
  ToolCallResult,
  PromptExecuteRequest,
  PromptExecuteResult
}

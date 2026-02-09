/**
 * executionUtils.ts - Shared execution debugging utilities
 *
 * Used by NodeExecutionFooter and WorkflowExecutionPanel to display
 * timing, execution order, and other debug information.
 */

import type { NodeExecutionState } from '../services/workflowTypes'

/**
 * Format duration in milliseconds to a compact human-readable string.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

/**
 * Calculate duration for a node — elapsed while running, final when done.
 * Returns null if the node hasn't started.
 */
export function getNodeDuration(nodeState: NodeExecutionState | undefined): number | null {
  if (!nodeState?.startTime) return null

  if (nodeState.endTime) {
    return nodeState.endTime - nodeState.startTime
  }

  if (nodeState.status === 'running') {
    return Date.now() - nodeState.startTime
  }

  return null
}

/**
 * Calculate execution order from node states based on startTime.
 * Returns a Map of nodeId to 1-indexed execution order.
 */
export function calculateExecutionOrder(
  nodeStates: Record<string, NodeExecutionState> | undefined
): Map<string, number> {
  const orderMap = new Map<string, number>()
  if (!nodeStates) return orderMap

  const startedNodes = Object.entries(nodeStates)
    .filter(([, state]) => state.startTime !== undefined)
    .sort(([, a], [, b]) => a.startTime! - b.startTime!)

  startedNodes.forEach(([nodeId], index) => {
    orderMap.set(nodeId, index + 1)
  })

  return orderMap
}

/**
 * Truncate text to a max length, appending ellipsis if needed.
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

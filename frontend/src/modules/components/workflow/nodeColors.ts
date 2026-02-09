/**
 * Central node color definitions for the workflow canvas
 *
 * Derives all node-type colors from the single-source-of-truth registry.
 * Re-exports `getNodeColor` for backward compatibility with node components.
 */

import type { WorkflowNodeType } from '../../services/workflowTypes'
import {
  NODE_TYPE_REGISTRY,
  getNodeColor as registryGetNodeColor,
} from '../../services/nodeTypeRegistry'

/**
 * Node type to color mapping — derived from the registry.
 * Prefer `getNodeColor()` for single lookups.
 */
export const NODE_TYPE_COLORS: Record<WorkflowNodeType, string> =
  Object.fromEntries(
    Object.entries(NODE_TYPE_REGISTRY).map(([k, v]) => [k, v.color])
  ) as Record<WorkflowNodeType, string>

/**
 * Get the color for a specific node type (delegates to registry)
 */
export const getNodeColor = registryGetNodeColor

/**
 * Handle colors by semantic purpose
 * These colors represent data flow categories
 */
export const HANDLE_COLORS = {
  // Tools & Actions (Yellow)
  tools: 'var(--node-yellow)',
  toolOutput: 'var(--node-yellow)',

  // Memory & Data (Emerald)
  memory: 'var(--node-emerald)',
  data: 'var(--node-emerald)',

  // Monitoring & Events (Violet/Amber)
  checkpoint: 'var(--node-violet)',
  callback: 'var(--node-violet)',
  event: 'var(--node-amber)',

  // Default/Generic
  default: 'var(--node-slate)',
} as const

/**
 * Central node color definitions for the workflow canvas
 *
 * Organized by functional category to maintain visual consistency
 * across all node types, docked previews, and handles.
 */

import type { WorkflowNodeType } from '../../services/workflowTypes'

/**
 * Node type to color mapping (organized by category)
 */
export const NODE_TYPE_COLORS: Record<WorkflowNodeType, string> = {
  // AI/Agent Category (Purple/Indigo)
  'agent': 'var(--node-purple)',
  'chat-agent': 'var(--node-purple)',
  'claude-code': 'var(--node-indigo)',

  // Content/Prompts (Blue)
  'prompt': 'var(--node-blue)',
  'trigger': 'var(--node-sky)',

  // Tools (Yellow/Orange)
  'tool': 'var(--node-yellow)',
  'tool-call-parser': 'var(--node-yellow)',
  'tool-call-router': 'var(--node-teal)',
  'mcp-tool': 'var(--node-orange)',

  // Code/Transform (Cyan/Teal)
  'code': 'var(--node-cyan)',
  'transformer': 'var(--node-cyan)',
  'command': 'var(--node-teal)',

  // Control Flow (Amber/Lime)
  'condition': 'var(--node-amber)',
  'loop': 'var(--node-lime)',
  'parallel': 'var(--node-lime)',
  'merge': 'var(--node-lime)',

  // Integration/API (Green)
  'provider': 'var(--node-green)',
  'api': 'var(--node-green)',
  'workflow': 'var(--node-green)',

  // Output/Data (Emerald)
  'output': 'var(--node-emerald)',
  'memory': 'var(--node-emerald)',

  // Monitoring/Control (Violet/Pink)
  'callback': 'var(--node-violet)',
  'checkpoint': 'var(--node-violet)',
  'guardrail': 'var(--node-pink)',

  // User Interaction (Sky)
  'user-input': 'var(--node-sky)',

  // Error Handling (Red)
  'error-handler': 'var(--node-red)',
}

/**
 * Get the color for a specific node type
 */
export function getNodeColor(nodeType: WorkflowNodeType): string {
  return NODE_TYPE_COLORS[nodeType] || 'var(--node-slate)'
}

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

/**
 * Node Template Types
 *
 * TypeScript interfaces for saving and restoring workflow node templates.
 * Templates are packaged as .pdpkg archives stored in .prompd/templates/.
 */

import type { WorkflowNodeType } from './workflowTypes'

/** A child node within a container template */
export interface NodeTemplateChild {
  type: WorkflowNodeType
  data: Record<string, unknown>
  relativePosition: { x: number; y: number }
  dimensions?: { width: number; height: number }
  originalId: string // used for edge remapping during insert, NOT persisted as actual ID
}

/** An edge between children within a container template */
export interface NodeTemplateEdge {
  source: string // originalId of source node
  target: string // originalId of target node
  sourceHandle?: string
  targetHandle?: string
}

/** Node-specific data within a template (the actual node configuration) */
export interface NodeTemplateNodeData {
  nodeType: WorkflowNodeType
  nodeData: Record<string, unknown>
  originalId: string // root node's original ID -- used for edge remapping during insert
  dimensions?: { width: number; height: number }
  children?: NodeTemplateChild[]
  edges?: NodeTemplateEdge[]
}

/** Full node template manifest stored in prompd.json inside .pdpkg */
export interface NodeTemplate {
  version: '1.0'
  type: 'node-template'
  name: string
  description?: string
  nodeTypeLabel: string
  createdAt: string
  files?: string[]     // workspace-relative file paths bundled in the .pdpkg
  packages?: string[]  // package references (@ns/package@version) that need to be installed
  node: NodeTemplateNodeData
}

/** List item returned by template:list IPC */
export interface TemplateListItem {
  fileName: string
  name: string
  description?: string
  nodeType: WorkflowNodeType
  nodeTypeLabel: string
  scope: 'workspace' | 'user'
  createdAt: string
}

/** Scope for template storage */
export type TemplateScope = 'workspace' | 'user'

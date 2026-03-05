/**
 * Canvas View - Type definitions for the collaborative block-based editor.
 *
 * The block registry pattern allows new block types to be added without
 * modifying existing Canvas components.
 */

import type { ComponentType } from 'react'
import type { ParsedPrompd } from '../lib/prompdParser'

// ── Block Types ──────────────────────────────────────────────────────────────

/** Built-in block types. Extend via the registry for custom types. */
export type BuiltinBlockType = 'metadata' | 'parameters' | 'specialty' | 'content'

/** Any registered block type (built-in or custom string) */
export type CanvasBlockType = BuiltinBlockType | (string & Record<never, never>)

/** A single block extracted from a parsed .prmd document */
export interface CanvasBlock<T = Record<string, unknown>> {
  id: string
  type: CanvasBlockType
  label: string
  data: T
  collapsed?: boolean
}

// ── Proposals ────────────────────────────────────────────────────────────────

/** A single block-level change proposed by the agent */
export interface BlockProposalItem {
  blockId: string
  type: CanvasBlockType
  label: string
  description?: string
  proposedData: Record<string, unknown>
  currentData: Record<string, unknown>
}

/** A proposal from the agent targeting one or more blocks */
export interface BlockProposal {
  id: string
  toolCallId: string
  blocks: BlockProposalItem[]
  status: 'pending' | 'partial' | 'accepted' | 'rejected'
  /** Per-block decisions when partially accepted */
  decisions?: Record<string, 'accepted' | 'rejected'>
  timestamp: number
}

/** Result sent back to the agent after user acts on a proposal */
export interface ProposalResult {
  accepted: string[]
  rejected: string[]
}

// ── Block Registry ───────────────────────────────────────────────────────────

/** Props passed to every block renderer */
export interface BlockRendererProps<T = Record<string, unknown>> {
  block: CanvasBlock<T>
  onEdit: () => void
  proposal?: BlockProposalItem
  onAcceptProposal?: () => void
  onRejectProposal?: () => void
  theme: 'light' | 'dark'
}

/** Props passed to every block editor */
export interface BlockEditorProps<T = Record<string, unknown>> {
  block: CanvasBlock<T>
  onSave: (data: T) => void
  onCancel: () => void
  theme: 'light' | 'dark'
}

/** Props passed to block diff renderers (for proposal visualization) */
export interface BlockDiffProps<T = Record<string, unknown>> {
  currentData: T
  proposedData: T
  description?: string
  theme: 'light' | 'dark'
}

/** Registration entry for a block type in the registry */
export interface BlockRegistration<T = Record<string, unknown>> {
  type: CanvasBlockType
  label: string
  icon?: ComponentType<{ size?: number | string }>
  /** Renders the block in read mode */
  renderer: ComponentType<BlockRendererProps<T>>
  /** Renders the block in edit mode */
  editor: ComponentType<BlockEditorProps<T>>
  /** Optional diff renderer for proposal visualization */
  diffRenderer?: ComponentType<BlockDiffProps<T>>
  /** Extract block data from a parsed .prmd document */
  extract: (parsed: ParsedPrompd) => T | null
  /** Apply block data changes back to the raw document string */
  apply: (data: T, document: string, parsed: ParsedPrompd) => string
  /** Display order (lower = higher in the canvas) */
  order: number
}

// ── Brainstorm Tab Props ─────────────────────────────────────────────────────

export interface BrainstormTabProps {
  tab: import('../../stores/types').Tab
  theme: 'light' | 'dark'
  workspacePath?: string | null
  /** Commit working copy back to the source file */
  onApply: (newText: string) => void
  onChatGenerated?: (prompd: string, filename: string, metadata: Record<string, unknown>) => void
}

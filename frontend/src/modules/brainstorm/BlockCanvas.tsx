/**
 * BlockCanvas - Renders .prmd content as a list of registry-driven blocks.
 *
 * Handles block extraction from parsed .prmd, edit mode toggling,
 * proposal overlays, and writing changes back via onChange.
 */

import { useMemo, useState, useCallback } from 'react'
import { parsePrompd } from '../lib/prompdParser'
import { getAllBlocks, getBlock } from './blockRegistry'
import type { CanvasBlock, BlockProposal, BlockProposalItem, ProposalResult } from './types'

// Import block registrations (side-effect: registers blocks)
import './blocks/MetadataBlock'
import './blocks/ParametersBlock'
import './blocks/ContentBlock'

interface BlockCanvasProps {
  value: string
  onChange: (text: string) => void
  theme: 'light' | 'dark'
  readOnly?: boolean
  /** Block types to exclude from rendering (e.g. ['content'] when using a separate content editor) */
  excludeBlocks?: string[]
  /** Active proposal from the agent, if any */
  proposal?: BlockProposal | null
  /** Called when user acts on a proposal */
  onProposalAction?: (result: ProposalResult) => void
}

export function BlockCanvas({ value, onChange, theme, readOnly, excludeBlocks, proposal, onProposalAction }: BlockCanvasProps) {
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)

  // Parse the .prmd document
  const parsed = useMemo(() => parsePrompd(value), [value])

  // Extract blocks from all registered block types
  const blocks = useMemo(() => {
    const registrations = getAllBlocks()
    const result: CanvasBlock[] = []

    for (const reg of registrations) {
      if (excludeBlocks?.includes(reg.type)) continue
      const data = reg.extract(parsed)
      if (data !== null) {
        result.push({
          id: `block-${reg.type}`,
          type: reg.type,
          label: reg.label,
          data: data as Record<string, unknown>
        })
      }
    }

    return result
  }, [parsed, excludeBlocks])

  // Find proposal items targeting specific blocks
  const getProposalForBlock = useCallback((blockId: string): BlockProposalItem | undefined => {
    if (!proposal || proposal.status !== 'pending') return undefined
    return proposal.blocks.find(b => b.blockId === blockId)
  }, [proposal])

  // Handle block edit save
  const handleBlockSave = useCallback((blockType: string, data: Record<string, unknown>) => {
    const reg = getBlock(blockType)
    if (!reg) return

    const newDocument = reg.apply(data, value, parsed)
    onChange(newDocument)
    setEditingBlockId(null)
  }, [value, parsed, onChange])

  // Handle proposal accept for a specific block
  const handleAcceptBlock = useCallback((blockId: string) => {
    if (!proposal) return

    const item = proposal.blocks.find(b => b.blockId === blockId)
    if (!item) return

    const reg = getBlock(item.type)
    if (!reg) return

    // Apply the proposed data
    const newDocument = reg.apply(item.proposedData, value, parsed)
    onChange(newDocument)

    // Track decisions
    const accepted = [...(proposal.decisions ? Object.entries(proposal.decisions).filter(([, v]) => v === 'accepted').map(([k]) => k) : []), item.label]
    const rejected = proposal.decisions ? Object.entries(proposal.decisions).filter(([, v]) => v === 'rejected').map(([k]) => k) : []

    // If all blocks have been decided, resolve the proposal
    const decidedCount = accepted.length + rejected.length
    if (decidedCount >= proposal.blocks.length) {
      onProposalAction?.({ accepted, rejected })
    }
  }, [proposal, value, parsed, onChange, onProposalAction])

  // Handle proposal reject for a specific block
  const handleRejectBlock = useCallback((blockId: string) => {
    if (!proposal) return

    const item = proposal.blocks.find(b => b.blockId === blockId)
    if (!item) return

    const accepted = proposal.decisions ? Object.entries(proposal.decisions).filter(([, v]) => v === 'accepted').map(([k]) => k) : []
    const rejected = [...(proposal.decisions ? Object.entries(proposal.decisions).filter(([, v]) => v === 'rejected').map(([k]) => k) : []), item.label]

    const decidedCount = accepted.length + rejected.length
    if (decidedCount >= proposal.blocks.length) {
      onProposalAction?.({ accepted, rejected })
    }
  }, [proposal, onProposalAction])

  // Accept all proposals at once
  const handleAcceptAll = useCallback(() => {
    if (!proposal) return

    // Apply all proposed changes in order
    let doc = value
    let currentParsed = parsed

    for (const item of proposal.blocks) {
      const reg = getBlock(item.type)
      if (reg) {
        doc = reg.apply(item.proposedData, doc, currentParsed)
        currentParsed = parsePrompd(doc)
      }
    }

    onChange(doc)
    onProposalAction?.({
      accepted: proposal.blocks.map(b => b.label),
      rejected: []
    })
  }, [proposal, value, parsed, onChange, onProposalAction])

  // Reject all proposals
  const handleRejectAll = useCallback(() => {
    if (!proposal) return
    onProposalAction?.({
      accepted: [],
      rejected: proposal.blocks.map(b => b.label)
    })
  }, [proposal, onProposalAction])

  return (
    <div style={{
      background: 'var(--panel)',
      padding: '24px'
    }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
            <h2 style={{ margin: 0, fontSize: '18px', color: 'var(--text)', fontWeight: 600 }}>
              Canvas
            </h2>
            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
              {blocks.length} block{blocks.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Proposal banner */}
        {proposal && proposal.status === 'pending' && (
          <div style={{
            padding: '10px 16px',
            marginBottom: '16px',
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '13px'
          }}>
            <span style={{ color: 'var(--accent)', fontWeight: 500 }}>
              Agent proposes {proposal.blocks.length} change{proposal.blocks.length !== 1 ? 's' : ''}
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
              <button onClick={handleAcceptAll} style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '4px 12px', fontSize: '12px', fontWeight: 500,
                background: 'var(--success)', color: 'white', border: 'none',
                borderRadius: '4px', cursor: 'pointer'
              }}>
                Accept All
              </button>
              <button onClick={handleRejectAll} style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '4px 12px', fontSize: '12px', fontWeight: 500,
                background: 'var(--error)', color: 'white', border: 'none',
                borderRadius: '4px', cursor: 'pointer'
              }}>
                Reject All
              </button>
            </div>
          </div>
        )}

        {/* Blocks */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {blocks.map(block => {
            const reg = getBlock(block.type)
            if (!reg) return null

            const blockProposal = getProposalForBlock(block.id)
            const isEditing = editingBlockId === block.id && !readOnly

            if (isEditing) {
              const Editor = reg.editor
              return (
                <Editor
                  key={block.id}
                  block={block}
                  onSave={(data) => handleBlockSave(block.type, data as Record<string, unknown>)}
                  onCancel={() => setEditingBlockId(null)}
                  theme={theme}
                />
              )
            }

            const Renderer = reg.renderer
            return (
              <Renderer
                key={block.id}
                block={block}
                onEdit={() => !readOnly && setEditingBlockId(block.id)}
                proposal={blockProposal}
                onAcceptProposal={() => handleAcceptBlock(block.id)}
                onRejectProposal={() => handleRejectBlock(block.id)}
                theme={theme}
              />
            )
          })}

          {blocks.length === 0 && (
            <div style={{
              textAlign: 'center',
              padding: '48px 24px',
              color: 'var(--text-muted)',
              fontSize: '13px'
            }}>
              <p style={{ marginBottom: '8px' }}>No content to display.</p>
              <p>Start typing in the Code view, or ask the agent to create a prompt for you.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

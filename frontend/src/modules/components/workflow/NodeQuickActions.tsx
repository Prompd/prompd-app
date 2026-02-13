/**
 * NodeQuickActions - Floating toolbar that appears above selected nodes
 *
 * Provides quick access to common node operations:
 * - Lock/Unlock (freeze position)
 * - Delete
 * - Duplicate
 * - Copy/Paste
 */

import { memo, useCallback, useEffect, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { Copy, Clipboard, Trash2, CopyPlus, Lock, Unlock } from 'lucide-react'
import { useWorkflowStore } from '../../../stores/workflowStore'
import type { BaseNodeData } from '../../services/workflowTypes'

interface NodeQuickActionsProps {
  /** ID of the selected node */
  nodeId: string
  /** Position to render the toolbar (above the node) */
  position: { x: number; y: number }
  /** Whether the canvas is in read-only mode */
  readOnly?: boolean
}

export const NodeQuickActions = memo(({ nodeId, position, readOnly = false }: NodeQuickActionsProps) => {
  const reactFlow = useReactFlow()
  const deleteNode = useWorkflowStore(state => state.deleteNode)
  const duplicateNode = useWorkflowStore(state => state.duplicateNode)
  const copyNode = useWorkflowStore(state => state.copyNode)
  const pasteNode = useWorkflowStore(state => state.pasteNode)
  const clipboard = useWorkflowStore(state => state.clipboard)
  const updateNodeData = useWorkflowStore(state => state.updateNodeData)
  const nodes = useWorkflowStore(state => state.nodes)

  // Get current locked state
  const currentNode = nodes.find(n => n.id === nodeId)
  const isLocked = (currentNode?.data as BaseNodeData)?.locked ?? false

  const [isVisible, setIsVisible] = useState(false)

  // Fade in animation
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50)
    return () => clearTimeout(timer)
  }, [])

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    deleteNode(nodeId)
  }, [nodeId, deleteNode])

  const handleDuplicate = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    duplicateNode(nodeId)
  }, [nodeId, duplicateNode])

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    copyNode(nodeId)
  }, [nodeId, copyNode])

  const handlePaste = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    // Get the current node's position to paste nearby
    const node = reactFlow.getNode(nodeId)
    if (node) {
      pasteNode({ x: node.position.x + 50, y: node.position.y + 50 })
    }
  }, [nodeId, pasteNode, reactFlow])

  const handleToggleLock = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    updateNodeData(nodeId, { locked: !isLocked })
  }, [nodeId, isLocked, updateNodeData])

  if (readOnly) return null

  const buttonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    border: 'none',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  }

  const buttonHoverStyle = (color: string) => ({
    background: `color-mix(in srgb, ${color} 15%, transparent)`,
    color: color,
  })

  return (
    <div
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y - 44,
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: '4px 6px',
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 1000,
        opacity: isVisible ? 1 : 0,
        transition: 'opacity 0.15s ease',
        pointerEvents: 'auto',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Lock/Unlock */}
      <button
        onClick={handleToggleLock}
        style={{
          ...buttonStyle,
          ...(isLocked ? {
            color: 'var(--warning)',
            background: 'color-mix(in srgb, var(--warning) 18%, transparent)',
            boxShadow: 'inset 0 0 0 1.5px color-mix(in srgb, var(--warning) 35%, transparent)',
          } : {}),
        }}
        title={isLocked ? 'Unlock position (Ctrl+L)' : 'Lock position (Ctrl+L)'}
        onMouseEnter={(e) => {
          Object.assign(e.currentTarget.style, buttonHoverStyle('var(--warning)'))
          e.currentTarget.style.boxShadow = isLocked
            ? 'inset 0 0 0 1.5px color-mix(in srgb, var(--warning) 50%, transparent)'
            : 'none'
        }}
        onMouseLeave={(e) => Object.assign(e.currentTarget.style, isLocked ? {
          background: 'color-mix(in srgb, var(--warning) 18%, transparent)',
          color: 'var(--warning)',
          boxShadow: 'inset 0 0 0 1.5px color-mix(in srgb, var(--warning) 35%, transparent)',
        } : {
          background: 'transparent',
          color: 'var(--text-secondary)',
          boxShadow: 'none',
        })}
      >
        {isLocked ? <Lock style={{ width: 14, height: 14 }} /> : <Unlock style={{ width: 14, height: 14 }} />}
      </button>

      {/* Divider */}
      <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />

      {/* Copy */}
      <button
        onClick={handleCopy}
        style={buttonStyle}
        title="Copy (Ctrl+C)"
        onMouseEnter={(e) => Object.assign(e.currentTarget.style, buttonHoverStyle('var(--accent)'))}
        onMouseLeave={(e) => Object.assign(e.currentTarget.style, { background: 'transparent', color: 'var(--text-secondary)' })}
      >
        <Copy style={{ width: 14, height: 14 }} />
      </button>

      {/* Paste */}
      <button
        onClick={handlePaste}
        style={{
          ...buttonStyle,
          opacity: clipboard ? 1 : 0.4,
          cursor: clipboard ? 'pointer' : 'not-allowed',
        }}
        title="Paste (Ctrl+V)"
        disabled={!clipboard}
        onMouseEnter={(e) => clipboard && Object.assign(e.currentTarget.style, buttonHoverStyle('var(--accent)'))}
        onMouseLeave={(e) => Object.assign(e.currentTarget.style, { background: 'transparent', color: 'var(--text-secondary)' })}
      >
        <Clipboard style={{ width: 14, height: 14 }} />
      </button>

      {/* Divider */}
      <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />

      {/* Duplicate */}
      <button
        onClick={handleDuplicate}
        style={buttonStyle}
        title="Duplicate (Ctrl+D)"
        onMouseEnter={(e) => Object.assign(e.currentTarget.style, buttonHoverStyle('var(--node-blue)'))}
        onMouseLeave={(e) => Object.assign(e.currentTarget.style, { background: 'transparent', color: 'var(--text-secondary)' })}
      >
        <CopyPlus style={{ width: 14, height: 14 }} />
      </button>

      {/* Divider */}
      <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />

      {/* Delete */}
      <button
        onClick={handleDelete}
        style={buttonStyle}
        title="Delete (Del)"
        onMouseEnter={(e) => Object.assign(e.currentTarget.style, buttonHoverStyle('var(--error)'))}
        onMouseLeave={(e) => Object.assign(e.currentTarget.style, { background: 'transparent', color: 'var(--text-secondary)' })}
      >
        <Trash2 style={{ width: 14, height: 14 }} />
      </button>
    </div>
  )
})

NodeQuickActions.displayName = 'NodeQuickActions'

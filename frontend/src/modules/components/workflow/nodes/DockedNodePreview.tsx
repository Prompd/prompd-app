/**
 * DockedNodePreview - Mini node preview for nodes docked to handles
 *
 * Renders a 24px circular preview of a docked node attached to a host node's handle.
 * Clicking the preview opens the properties panel for the docked node.
 *
 * Based on the MiniNodePreview pattern from ContainerNode.tsx
 */

import React, { memo, useCallback } from 'react'
import { X, Unlink, Trash2 } from 'lucide-react'
import {
  MessageSquare,
  Bot,
  GitBranch,
  Repeat,
  Layers,
  Merge,
  Wrench,
  Code,
  Globe,
  Eye,
  User,
  AlertTriangle,
  Terminal,
  Workflow,
  Server,
  Zap,
  FileOutput,
  Play,
  ShieldCheck,
  MessagesSquare,
  Database,
} from 'lucide-react'
import type { WorkflowNodeType, BaseNodeData } from '../../../services/workflowTypes'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import { NODE_TYPE_COLORS } from '../nodeColors'

// ============================================================================
// Node Type Icon Mapping (same as ContainerNode)
// ============================================================================

const NODE_TYPE_ICONS: Record<WorkflowNodeType, React.ComponentType<{ style?: React.CSSProperties }>> = {
  trigger: Play,
  prompt: MessageSquare,
  provider: Server,
  condition: GitBranch,
  loop: Repeat,
  parallel: Layers,
  merge: Merge,
  transformer: Code,
  api: Globe,
  tool: Wrench,
  'tool-call-parser': Code,
  'tool-call-router': Wrench,
  agent: Bot,
  'chat-agent': MessagesSquare,
  guardrail: ShieldCheck,
  callback: Eye,
  checkpoint: Eye,
  'user-input': User,
  'error-handler': AlertTriangle,
  command: Terminal,
  'claude-code': Bot,
  workflow: Workflow,
  'mcp-tool': Server,
  code: Code,
  memory: Database,
  output: FileOutput,
}

// ============================================================================
// Docked Node Preview Component
// ============================================================================

interface DockedNodePreviewProps {
  /** The docked node's ID */
  dockedNodeId: string
  /** The docked node's type */
  dockedNodeType: WorkflowNodeType
  /** The docked node's label */
  dockedNodeLabel: string
  /** Whether the target node is collapsed */
  targetNodeCollapsed?: boolean
  /** Handle configuration for positioning */
  handleConfig: {
    side: 'left' | 'right' | 'bottom'
    topPercent: number
    handleId?: string
  }
  /** Index of this docked node (for stacking multiple docks) */
  index?: number
}

export const DockedNodePreview = memo(({
  dockedNodeId,
  dockedNodeType,
  dockedNodeLabel,
  handleConfig,
  targetNodeCollapsed = false,
  index = 0,
}: DockedNodePreviewProps) => {
  const selectNode = useWorkflowStore(state => state.selectNode)
  const undockNode = useWorkflowStore(state => state.undockNode)
  const selectedNodeId = useWorkflowStore(state => state.selectedNodeId)
  const [isHovered, setIsHovered] = React.useState(false)

  const Icon = NODE_TYPE_ICONS[dockedNodeType] || Zap
  const nodeColor = NODE_TYPE_COLORS[dockedNodeType] || 'var(--muted)'

  // Show menu when hovered OR when this docked node is selected
  const isSelected = selectedNodeId === dockedNodeId
  const showMenu = isHovered || isSelected

  // Calculate position based on side
  const isBottom = handleConfig.side === 'bottom'
  const isLeft = handleConfig.side === 'left'

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    selectNode(dockedNodeId)
  }, [dockedNodeId, selectNode])

  const deleteNode = useWorkflowStore(state => state.deleteNode)

  const handleUndock = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    undockNode(dockedNodeId)
  }, [dockedNodeId, undockNode])

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    deleteNode(dockedNodeId)
  }, [dockedNodeId, deleteNode])

  const previewSize = targetNodeCollapsed ? 20 : 30

  // For bottom handle, position at the bottom edge of the node, overlapping the handle
  if (isBottom) {
    return (
      <div
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          position: 'absolute',
          left: `calc(50% + ${(index) * (targetNodeCollapsed ? 21 : 36)}px - ${targetNodeCollapsed ? '10px' : '15px'})`,
          bottom: targetNodeCollapsed ? -10 : -15, // Half of circle overlaps node edge
          zIndex: isSelected ? 20 : 15,
          cursor: 'pointer',
        }}
        title={`${dockedNodeLabel} (click to edit)`}
      >
        {/* Mini node circle at node edge */}
        <div style={{ position: 'relative' }}>
          {getPreviewNode(previewSize, nodeColor, targetNodeCollapsed ? 2 : 3, isSelected, showMenu, handleConfig.handleId || 'target', Icon)}
          {getMenu(showMenu, handleUndock, handleDelete)}
        </div>
      </div>
    )
  }

  // For left/right handles, position at the edge of the node, overlapping the handle
  // The circle sits right at the node border, covering the handle
  const topOffset = `calc(${handleConfig.topPercent}% + ${index * (targetNodeCollapsed ? 21 : 42)}px - ${targetNodeCollapsed ? '15px' : '15px)'}` // Center on handle

  // Position so circle overlaps the node edge (half inside, half outside)
  // Circle is 30px, so -15px puts center at edge
  const sideOffset = targetNodeCollapsed ? -10 : -15

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'absolute',
        left: isLeft ? sideOffset : undefined,
        right: !isLeft ? sideOffset : undefined,
        top: topOffset,
        zIndex: isSelected ? 20 : 15, // Higher z-index when selected
        cursor: 'pointer',
      }}
      title={`${dockedNodeLabel} (click to edit)`}
    >
      {/* Mini node circle positioned at node edge */}
      <div style={{ position: 'relative' }}>
        {getPreviewNode(previewSize, nodeColor, targetNodeCollapsed ? 2 : 3, isSelected, showMenu, handleConfig.handleId || 'target', Icon)}
        {getMenu(showMenu, handleUndock, handleDelete)}
      </div>
    </div>
  )
})

DockedNodePreview.displayName = 'DockedNodePreview'

// Re-export the hook from its dedicated file for backwards compatibility
export { useDockedNodes } from '../hooks/useDocking'

// ============================================================================
// Helper to render the preview node circle
// ============================================================================
function getPreviewNode(previewSize: number, nodeColor: string, borderSize = 2, isSelected: boolean, showMenu: boolean, handleId: string, Icon: React.ComponentType<{ style?: React.CSSProperties }>) {
  return (
    <>
      { /* Preview node circle */ }
      {<div
        style={{
          width: previewSize,
          height: previewSize,
          borderRadius: '50%',
          background: `color-mix(in srgb, ${nodeColor} 25%, var(--panel))`,
          border: isSelected
            ? `${borderSize}px solid ${handleId === 'rejected' ? 'var(--node-red)' : nodeColor}`
            : `${borderSize}px solid ${handleId === 'rejected' ? 'var(--node-red)' : nodeColor}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: isSelected
            ? `0 0 0 2px color-mix(in srgb, ${nodeColor} 40%, transparent), 0 2px 8px rgba(0,0,0,0.4)`
            : `0 1px 4px rgba(0,0,0,0.3)`,
          transition: 'transform 0.15s, box-shadow 0.15s, border 0.15s',
          transform: showMenu ? 'scale(1.15)' : 'scale(1)',
        }}
      >
        <Icon style={{ width: previewSize / 2.5, height: previewSize / 2.5, color: nodeColor }} />
      </div>}
    </>
  )
}

// ============================================================================
// Helper to render the action menu
// ============================================================================
function getMenu(showMenu: boolean, handleUndock: (e: React.MouseEvent) => void, handleDelete: (e: React.MouseEvent) => void) {
  return (
    <>
      {/* Action buttons - appear on hover or when selected */}
      {showMenu && (
        <div style={{
          position: 'absolute',
          top: -36,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 4,
          background: 'var(--panel)',
          borderRadius: 6,
          padding: 4,
          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
        }}>
          <button
            onClick={handleUndock}
            style={{
              width: 28,
              height: 28,
              borderRadius: 5,
              background: 'var(--panel-2)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: 0,
            }}
            title="Undock node"
          >
            <Unlink style={{ width: 16, height: 16, color: 'var(--muted)' }} />
          </button>
          <button
            onClick={handleDelete}
            style={{
              width: 28,
              height: 28,
              borderRadius: 5,
              background: 'var(--panel-2)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: 0,
            }}
            title="Delete node"
          >
            <Trash2 style={{ width: 16, height: 16, color: 'var(--muted)' }} />
          </button>
        </div>
      )}
    </>
  )
}
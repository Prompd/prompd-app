/**
 * ToolRouterDockPreview - Expandable preview for ToolCallRouter nodes docked to Agent
 *
 * Renders a rectangular preview spanning both ai-output and toolResult handles
 * on the Agent node. Clicking expands/collapses the docked ToolCallRouter.
 */

import React, { memo, useCallback, useState } from 'react'
import { ChevronRight, ChevronDown, Unlink, Trash2, Route } from 'lucide-react'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import { getNodeColor } from '../nodeColors'

interface ToolRouterDockPreviewProps {
  /** The docked ToolCallRouter node's ID */
  dockedNodeId: string
  /** The docked node's label */
  dockedNodeLabel: string
  /** Whether the target Agent node is collapsed */
  targetNodeCollapsed?: boolean
}

export const ToolRouterDockPreview = memo(({
  dockedNodeId,
  dockedNodeLabel,
  targetNodeCollapsed = false,
}: ToolRouterDockPreviewProps) => {
  const selectNode = useWorkflowStore(state => state.selectNode)
  const undockNode = useWorkflowStore(state => state.undockNode)
  const deleteNode = useWorkflowStore(state => state.deleteNode)
  const updateNodeData = useWorkflowStore(state => state.updateNodeData)
  const selectedNodeId = useWorkflowStore(state => state.selectedNodeId)
  const nodes = useWorkflowStore(state => state.nodes)

  const [isHovered, setIsHovered] = useState(false)

  // Get the docked node to check its collapsed state
  const dockedNode = nodes.find(n => n.id === dockedNodeId)
  const isCollapsed = (dockedNode?.data as any)?.collapsed ?? false

  // Get child tool count
  const childTools = nodes.filter(n => n.parentId === dockedNodeId)
  const toolCount = childTools.length

  const isSelected = selectedNodeId === dockedNodeId
  const showMenu = isHovered || isSelected

  const nodeColor = getNodeColor('tool-call-router')
  const accentColor = 'var(--node-amber)'

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    selectNode(dockedNodeId)
  }, [dockedNodeId, selectNode])

  const handleToggleExpand = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()

    // Get the current collapsed state
    const dockedNode = nodes.find(n => n.id === dockedNodeId)
    const currentCollapsed = (dockedNode?.data as any)?.collapsed ?? false

    // Just toggle collapsed state, node stays docked
    updateNodeData(dockedNodeId, { collapsed: !currentCollapsed })
  }, [dockedNodeId, updateNodeData, nodes])

  const handleUndock = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    undockNode(dockedNodeId)
  }, [dockedNodeId, undockNode])

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    deleteNode(dockedNodeId)
  }, [dockedNodeId, deleteNode])

  // Position on the right side, spanning from ~50% (ai-output) to ~50% (toolResult)
  const topPosition = targetNodeCollapsed ? '50%' : '50%'
  const width = 30
  const height = 80

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'absolute',
        right: -15,
        top: topPosition,
        width: width,
        height: height,
        zIndex: isSelected ? 20 : 15,
      }}
      title={`${dockedNodeLabel} (${toolCount} tools)`}
    >
      {/* Main preview card - compact vertical layout */}
      <div style={{
        width: '100%',
        height: '100%',
        background: `color-mix(in srgb, ${nodeColor} 12%, var(--panel))`,
        border: `2px solid ${nodeColor}`,
        borderLeft: `3px solid ${nodeColor}`,
        borderRadius: '6px',
        boxShadow: isSelected
          ? `0 0 0 2px color-mix(in srgb, ${nodeColor} 30%, transparent), 0 4px 12px rgba(0,0,0,0.3)`
          : '0 2px 8px rgba(0,0,0,0.25)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        overflow: 'hidden',
        transition: 'transform 0.15s, box-shadow 0.15s',
        transform: showMenu ? 'scale(1.05)' : 'scale(1)',
        cursor: 'pointer',
      }}
      onClick={handleClick}
      >
        {/* Icon */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2px 0',
        }}>
          <Route style={{ width: 13, height: 13, color: nodeColor }} />
        </div>
        
        {/* Expand/collapse button */}
        <button
          onClick={handleToggleExpand}
          style={{
            background: 'none',
            border: 'none',
            padding: '6px 0',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: nodeColor,
            width: '100%',
            borderBottom: `1px solid color-mix(in srgb, ${nodeColor} 20%, transparent)`,
          }}
          title={isCollapsed ? "Expand router" : "Collapse router"}
        >
          {isCollapsed ? (
            <ChevronRight style={{ width: 13, height: 13 }} />
          ) : (
            <ChevronDown style={{ width: 13, height: 13 }} />
          )}
        </button>

        {/* Tool count */}
        <div style={{
          padding: '2px 0',
          borderTop: `1px solid color-mix(in srgb, ${nodeColor} 20%, transparent)`,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1px',
        }}>
          <span style={{
            fontSize: '10px',
            fontWeight: 600,
            color: nodeColor,
            lineHeight: 1,
          }}>
            {toolCount}
          </span>
          <span style={{
            fontSize: '7px',
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.3px',
          }}>
            {toolCount === 1 ? 'tool' : 'tools'}
          </span>
        </div>

        {/* Dual handle indicator - vertical bar on left */}
        <div style={{
          position: 'absolute',
          left: -3,
          top: 10,
          bottom: 10,
          width: 3,
          background: `linear-gradient(to bottom, ${accentColor}, ${accentColor}50, ${accentColor})`,
          borderRadius: '2px 0 0 2px',
          pointerEvents: 'none',
        }} />
      </div>

      {/* Action menu */}
      {showMenu && (
        <div style={{
          position: 'absolute',
          top: -36,
          right: -17,
          display: 'flex',
          gap: 4,
          background: 'var(--panel)',
          borderRadius: 6,
          padding: 4,
          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
          zIndex: 30,
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
            title="Undock router"
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
            title="Delete router"
          >
            <Trash2 style={{ width: 16, height: 16, color: 'var(--muted)' }} />
          </button>
        </div>
      )}
    </div>
  )
})

ToolRouterDockPreview.displayName = 'ToolRouterDockPreview'

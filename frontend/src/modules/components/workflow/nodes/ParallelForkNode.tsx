/**
 * ParallelForkNode - Compact node for fork-based parallel execution
 *
 * Multiple output handles connect to different branch paths.
 * Each connected path runs in parallel.
 */

import { memo, useCallback, useEffect, useRef } from 'react'
import { Handle, Position, useUpdateNodeInternals, useReactFlow } from '@xyflow/react'
import { Split, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import type { ParallelNodeData, BaseNodeData } from '../../../services/workflowTypes'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import { NodeExecutionFooter } from './NodeExecutionFooter'

interface ParallelForkNodeProps {
  id: string
  data: BaseNodeData
  selected?: boolean
}

// Fork mode dimensions (compact node)
const FORK_WIDTH = 180
// Fork mode layout constants for precise height calculation
const FORK_HEADER_HEIGHT = 35  // padding (8+8) + content + border
const FORK_BODY_PADDING = 8    // 4px top + 4px bottom
const FORK_ROW_HEIGHT = 16     // each branch row
const FORK_FOOTER_HEIGHT = 25  // padding (4+4) + badge height

export const ParallelForkNode = memo(({ id, data, selected }: ParallelForkNodeProps) => {
  const nodeData = data as ParallelNodeData
  const reactFlow = useReactFlow()
  const updateNodeInternals = useUpdateNodeInternals()
  const executionState = useWorkflowStore(state => state.executionState)
  const nodeState = executionState?.nodeStates[id]

  const forkCount = nodeData.forkCount || 2

  // Track previous fork count to detect changes
  const prevForkCountRef = useRef(forkCount)
  const initializedRef = useRef(false)

  // Calculate node dimensions
  const forkNodeHeight = FORK_HEADER_HEIGHT + FORK_BODY_PADDING + (forkCount * FORK_ROW_HEIGHT) + FORK_FOOTER_HEIGHT
  const forkNodeWidth = FORK_WIDTH

  // Initial update of node internals on mount
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true
      requestAnimationFrame(() => {
        updateNodeInternals(id)
      })
    }
  }, [id, updateNodeInternals])

  // Update node dimensions when fork count changes
  useEffect(() => {
    if (prevForkCountRef.current !== forkCount) {
      prevForkCountRef.current = forkCount

      reactFlow.setNodes(nodes => nodes.map(node => {
        if (node.id !== id) return node
        return {
          ...node,
          width: forkNodeWidth,
          height: forkNodeHeight,
          style: { ...node.style, width: forkNodeWidth, height: forkNodeHeight },
        }
      }))

      requestAnimationFrame(() => {
        updateNodeInternals(id)
      })
    }
  }, [forkCount, id, updateNodeInternals, reactFlow, forkNodeWidth, forkNodeHeight])

  // Stop propagation for clicks within node to prevent node selection issues
  const stopPropagation = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
  }, [])

  const getStatusIcon = () => {
    if (!nodeState) return null

    switch (nodeState.status) {
      case 'running':
        return <Loader2 style={{ width: 14, height: 14, color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
      case 'completed':
        return <CheckCircle style={{ width: 14, height: 14, color: 'var(--success)' }} />
      case 'failed':
        return <XCircle style={{ width: 14, height: 14, color: 'var(--error)' }} />
      default:
        return null
    }
  }

  const getWaitLabel = () => {
    switch (nodeData.waitFor) {
      case 'all': return 'All'
      case 'any': return 'Any'
      case 'race': return 'Race'
      default: return 'All'
    }
  }

  // Calculate Y position for each fork handle to align with branch rows
  const getForkHandleTop = (index: number) => {
    // Start after header, add half body padding, then position at center of each row
    return FORK_HEADER_HEIGHT + (FORK_BODY_PADDING / 2) + (index * FORK_ROW_HEIGHT) + (FORK_ROW_HEIGHT / 2)
  }

  return (
    <div
      className={[nodeData.disabled && 'workflow-node-disabled', nodeData.locked && 'workflow-node-locked'].filter(Boolean).join(' ')}
      style={{
        width: forkNodeWidth,
        minHeight: forkNodeHeight,
        borderRadius: '8px',
        background: 'var(--panel)',
        border: `2px solid ${selected ? 'var(--node-indigo)' : 'var(--border)'}`,
        boxShadow: selected ? '0 0 0 2px color-mix(in srgb, var(--node-indigo) 20%, transparent)' : '0 2px 4px rgba(0,0,0,0.1)',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
      onMouseDown={stopPropagation}
    >
      {/* Input Handle - centered vertically */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        style={{
          width: 12,
          height: 12,
          background: 'var(--node-indigo)',
          border: '2px solid var(--panel)',
          top: forkNodeHeight / 2,
        }}
      />

      {/* Fork output handles - positioned at node edge, aligned with branch rows */}
      {Array.from({ length: forkCount }, (_, i) => (
        <Handle
          key={`fork-${i}`}
          type="source"
          position={Position.Right}
          id={`fork-${i}`}
          style={{
            width: 12,
            height: 12,
            background: 'var(--node-indigo)',
            border: '2px solid var(--panel)',
            top: getForkHandleTop(i),
          }}
        />
      ))}

      {/* Header */}
      <div style={{
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        borderBottom: '1px solid var(--border)',
      }}>
        <Split style={{ width: 14, height: 14, color: 'var(--node-indigo)', flexShrink: 0 }} />
        <span style={{ fontWeight: 500, fontSize: '12px', color: 'var(--text)', flex: 1 }}>
          {nodeData.label || 'Fork'}
        </span>
        {getStatusIcon()}
      </div>

      {/* Body with branch indicators */}
      <div style={{
        flex: 1,
        padding: '4px 12px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        gap: '0px',
      }}>
        {Array.from({ length: forkCount }, (_, i) => (
          <div
            key={i}
            style={{
              height: FORK_ROW_HEIGHT,
              fontSize: '10px',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <div style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--node-indigo)',
              opacity: 0.7,
              flexShrink: 0,
            }} />
            <span style={{ lineHeight: 1 }}>{nodeData.forkLabels?.[i] || `Branch ${i + 1}`}</span>
          </div>
        ))}
      </div>

      {/* Footer with wait strategy badge */}
      <div style={{
        height: FORK_FOOTER_HEIGHT,
        padding: '0 3px 0 10px',
        display: 'flex',
        gap: '6px',
        justifyContent: 'flex-end',
        alignItems: 'center',
        borderTop: '1px solid var(--border)',
      }}>
        <span style={{
          fontSize: '10px',
          color: 'var(--text-secondary)',
          lineHeight: 1,
        }}>
          Wait:
        </span>
        <div style={{
          padding: '3px 8px',
          borderRadius: '4px',
          fontSize: '10px',
          lineHeight: 1,
          background: 'var(--node-indigo)',
          color: 'var(--panel)',
          fontWeight: 600,
        }}>
          {getWaitLabel()}
        </div>
      </div>

      {/* Execution debug footer — renders below the fixed layout, grows node height */}
      <div style={{ padding: '0 8px 4px' }}>
        <NodeExecutionFooter
          nodeState={nodeState}
          allNodeStates={executionState?.nodeStates}
        />
      </div>
    </div>
  )
})

ParallelForkNode.displayName = 'ParallelForkNode'

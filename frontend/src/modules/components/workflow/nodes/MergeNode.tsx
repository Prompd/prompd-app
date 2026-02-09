/**
 * MergeNode - Combines outputs from multiple parallel branches
 *
 * Takes multiple inputs and merges them into a single output,
 * either as an object (keyed by input names) or as an array.
 */

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Combine, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import type { MergeNodeData, BaseNodeData } from '../../../services/workflowTypes'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import { NodeExecutionFooter } from './NodeExecutionFooter'

interface MergeNodeProps {
  id: string
  data: BaseNodeData
  selected?: boolean
}

// Node dimensions
const NODE_WIDTH = 200
const NODE_MIN_HEIGHT = 100

// Layout constants
const HEADER_HEIGHT = 35
const INPUT_ROW_HEIGHT = 20
const FOOTER_HEIGHT = 30
const BODY_PADDING = 8

export const MergeNode = memo(({ id, data, selected }: MergeNodeProps) => {
  const nodeData = data as MergeNodeData
  const executionState = useWorkflowStore(state => state.executionState)
  const nodeState = executionState?.nodeStates[id]

  const inputs = nodeData.inputs || []
  const mergeAs = nodeData.mergeAs || 'object'
  const mode = nodeData.mode || 'wait'

  // Calculate node height based on number of inputs
  const nodeHeight = HEADER_HEIGHT + BODY_PADDING + Math.max(inputs.length, 2) * INPUT_ROW_HEIGHT + FOOTER_HEIGHT

  // Calculate Y position for each input handle
  const getInputHandleTop = (index: number) => {
    return HEADER_HEIGHT + (BODY_PADDING / 2) + (index * INPUT_ROW_HEIGHT) + (INPUT_ROW_HEIGHT / 2)
  }

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

  return (
    <div
      className={nodeData.disabled ? 'workflow-node-disabled' : ''}
      style={{
        width: NODE_WIDTH,
        height: nodeHeight,
        borderRadius: '8px',
        background: 'var(--panel)',
        border: `2px solid ${selected ? 'var(--node-emerald)' : 'var(--border)'}`,
        boxShadow: selected ? '0 0 0 2px color-mix(in srgb, var(--node-emerald) 20%, transparent)' : '0 2px 4px rgba(0,0,0,0.1)',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      {/* Input Handles - one for each input */}
      {inputs.length > 0 ? (
        inputs.map((_, i) => (
          <Handle
            key={`input-${i}`}
            type="target"
            position={Position.Left}
            id={`input-${i}`}
            style={{
              width: 12,
              height: 12,
              background: 'var(--node-emerald)',
              border: '2px solid var(--panel)',
              top: getInputHandleTop(i),
            }}
          />
        ))
      ) : (
        // Default: two input handles when no inputs defined
        <>
          <Handle
            type="target"
            position={Position.Left}
            id="input-0"
            style={{
              width: 12,
              height: 12,
              background: 'var(--node-emerald)',
              border: '2px solid var(--panel)',
              top: getInputHandleTop(0),
            }}
          />
          <Handle
            type="target"
            position={Position.Left}
            id="input-1"
            style={{
              width: 12,
              height: 12,
              background: 'var(--node-emerald)',
              border: '2px solid var(--panel)',
              top: getInputHandleTop(1),
            }}
          />
        </>
      )}

      {/* Execution debug footer */}
      <NodeExecutionFooter
        nodeState={nodeState}
        allNodeStates={executionState?.nodeStates}
      />

      {/* Output Handle - single merged output */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        style={{
          width: 12,
          height: 12,
          background: 'var(--node-emerald)',
          border: '2px solid var(--panel)',
          top: nodeHeight / 2,
        }}
      />

      {/* Header */}
      <div style={{
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        borderBottom: '1px solid var(--border)',
      }}>
        <Combine style={{ width: 14, height: 14, color: 'var(--node-emerald)', flexShrink: 0 }} />
        <span style={{ fontWeight: 500, fontSize: '12px', color: 'var(--text)', flex: 1 }}>
          {nodeData.label || 'Merge'}
        </span>
        {getStatusIcon()}
      </div>

      {/* Body with input indicators */}
      <div style={{
        flex: 1,
        padding: '4px 12px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        gap: '0px',
      }}>
        {(inputs.length > 0 ? inputs : ['Input 1', 'Input 2']).map((input, i) => (
          <div
            key={i}
            style={{
              height: INPUT_ROW_HEIGHT,
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
              background: 'var(--node-emerald)',
              opacity: 0.7,
              flexShrink: 0,
            }} />
            <span style={{
              lineHeight: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {typeof input === 'string' && input.startsWith('{{')
                ? input.replace(/\{\{|\}\}/g, '').trim()
                : input || `Input ${i + 1}`}
            </span>
          </div>
        ))}
      </div>

      {/* Footer with mode and merge strategy badges */}
      <div style={{
        height: FOOTER_HEIGHT,
        padding: '0 10px',
        display: 'flex',
        gap: '6px',
        justifyContent: 'flex-end',
        alignItems: 'center',
        borderTop: '1px solid var(--border)',
      }}>
        {/* Mode badge */}
        <div style={{
          padding: '3px 6px',
          borderRadius: '4px',
          fontSize: '9px',
          lineHeight: 1,
          background: mode === 'wait' ? 'var(--accent)' : 'var(--muted)',
          color: 'var(--panel)',
          fontWeight: 500,
          textTransform: 'capitalize',
        }}>
          {mode}
        </div>
        <span style={{
          fontSize: '10px',
          color: 'var(--text-secondary)',
          lineHeight: 1,
        }}>
          As:
        </span>
        <div style={{
          padding: '3px 8px',
          borderRadius: '4px',
          fontSize: '10px',
          lineHeight: 1,
          background: 'var(--node-emerald)',
          color: 'var(--panel)',
          fontWeight: 600,
          textTransform: 'capitalize',
        }}>
          {mergeAs}
        </div>
      </div>
    </div>
  )
})

MergeNode.displayName = 'MergeNode'

// Export properties component
export { MergeNodeProperties } from './MergeNodeProperties'

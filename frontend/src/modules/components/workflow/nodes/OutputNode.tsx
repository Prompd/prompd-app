/**
 * OutputNode - Custom React Flow node for workflow output
 */

import { memo, useState } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Flag, CheckCircle, Loader2, XCircle, Maximize2 } from 'lucide-react'
import type { OutputNodeData, BaseNodeData } from '../../../services/workflowTypes'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import { OutputViewDialog } from '../OutputViewDialog'
import { NodeExecutionFooter } from './NodeExecutionFooter'

interface OutputNodeProps {
  id: string
  data: BaseNodeData
  selected?: boolean
}

export const OutputNode = memo(({ id, data, selected }: OutputNodeProps) => {
  const nodeData = data as OutputNodeData
  const executionState = useWorkflowStore(state => state.executionState)
  const nodeState = executionState?.nodeStates[id]
  const output = executionState?.nodeOutputs[id]
  const [showOutputDialog, setShowOutputDialog] = useState(false)

  const isRunning = nodeState?.status === 'running'
  const isCompleted = nodeState?.status === 'completed'
  const isFailed = nodeState?.status === 'failed'

  const getStatusIcon = () => {
    if (!nodeState) return null

    switch (nodeState.status) {
      case 'running':
        return <Loader2 style={{ width: 16, height: 16, color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
      case 'completed':
        return <CheckCircle style={{ width: 16, height: 16, color: 'var(--success)' }} />
      case 'failed':
        return <XCircle style={{ width: 16, height: 16, color: 'var(--error)' }} />
      default:
        return null
    }
  }

  // Determine border color based on state
  const getBorderColor = () => {
    if (isRunning) return 'var(--accent)'
    if (isCompleted) return 'var(--success)'
    if (isFailed) return 'var(--error)'
    if (selected) return 'var(--node-green)'
    return 'var(--border)'
  }

  return (
    <div
      className={nodeData.disabled ? 'workflow-node-disabled' : ''}
      style={{
        padding: '12px 16px',
        borderRadius: '8px',
        minWidth: '160px',
        background: 'var(--panel)',
        border: `2px solid ${getBorderColor()}`,
        boxShadow: isRunning
          ? `0 0 0 2px ${getBorderColor()}, 0 0 12px ${getBorderColor()}`
          : selected
          ? '0 0 0 2px color-mix(in srgb, var(--node-green) 30%, transparent)'
          : '0 2px 4px rgba(0,0,0,0.1)',
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        style={{
          width: 12,
          height: 12,
          background: 'var(--node-green)',
          border: '2px solid var(--panel)',
        }}
      />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Flag style={{ width: 16, height: 16, color: 'var(--node-green)' }} />
        <span style={{ fontWeight: 500, fontSize: '13px', color: 'var(--text)' }}>
          {nodeData.label || 'Output'}
        </span>
        {getStatusIcon()}
      </div>

      {/* Output preview */}
      {output !== undefined && output !== null && (
        <>
          <div
            onClick={() => setShowOutputDialog(true)}
            style={{
              marginTop: '8px',
              padding: '8px',
              background: 'var(--panel-2)',
              borderRadius: '4px',
              fontSize: '11px',
              maxHeight: '80px',
              overflow: 'auto',
              cursor: 'pointer',
              border: '1px solid transparent',
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.background = 'var(--hover)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'transparent'
              e.currentTarget.style.background = 'var(--panel-2)'
            }}
            title="Click to view full output"
          >
            <pre style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0,
              fontFamily: 'monospace',
              color: 'var(--text)',
            }}>
              {(() => {
                const outputStr = typeof output === 'string' ? output : JSON.stringify(output, null, 2)
                const truncated = outputStr.slice(0, 200)
                return truncated + (outputStr.length > 200 ? '...' : '')
              })()}
            </pre>
          </div>
          <button
            onClick={() => setShowOutputDialog(true)}
            style={{
              marginTop: '6px',
              padding: '4px 8px',
              background: 'var(--input-bg)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '10px',
              fontWeight: 500,
              color: 'var(--text)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              width: '100%',
              justifyContent: 'center',
            }}
          >
            <Maximize2 style={{ width: 11, height: 11 }} />
            View Full Output
          </button>
        </>
      )}

      {/* Schema indicator */}
      {nodeData.outputSchema && (
        <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          Schema: {nodeData.outputSchema.type}
        </div>
      )}

      {/* Output View Dialog */}
      {showOutputDialog && output !== undefined && output !== null && (
        <OutputViewDialog
          output={output}
          nodeLabel={nodeData.label || 'Output'}
          nodeId={id}
          onClose={() => setShowOutputDialog(false)}
        />
      )}

      {/* Execution debug footer */}
      <NodeExecutionFooter
        nodeState={nodeState}
        allNodeStates={executionState?.nodeStates}
        showOutput={false}
      />
    </div>
  )
})

OutputNode.displayName = 'OutputNode'

// Export properties component
export { OutputNodeProperties } from './OutputNodeProperties'

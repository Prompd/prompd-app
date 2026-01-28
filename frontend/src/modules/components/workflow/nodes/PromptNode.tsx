/**
 * PromptNode - Custom React Flow node for executing .prmd prompts
 */

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { MessageSquare, CheckCircle, XCircle, Loader2, FileText, AlignLeft } from 'lucide-react'
import type { PromptNodeData, BaseNodeData, WorkflowNodeType } from '../../../services/workflowTypes'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import { DockedNodePreview, useDockedNodes } from './DockedNodePreview'
import { DOCKABLE_HANDLES } from '../../../services/workflowTypes'

interface PromptNodeProps {
  id: string
  data: BaseNodeData
  selected?: boolean
}

export const PromptNode = memo(({ id, data, selected }: PromptNodeProps) => {
  const nodeData = data as PromptNodeData
  const executionState = useWorkflowStore(state => state.executionState)
  const nodeState = executionState?.nodeStates[id]

  // Get nodes docked to the output handle
  const dockedToOutput = useDockedNodes(id, 'output')
  const outputHandleConfig = DOCKABLE_HANDLES.find(
    h => h.nodeType === 'prompt' && h.handleId === 'output'
  )

  // Get nodes docked to the onCheckpoint handle
  const dockedToCheckpoint = useDockedNodes(id, 'onCheckpoint')
  const checkpointHandleConfig = DOCKABLE_HANDLES.find(
    h => h.nodeType === 'prompt' && h.handleId === 'onCheckpoint'
  )

  // Check if this handle is being targeted for docking
  const dockingState = useWorkflowStore(state => state.dockingState)
  const isOutputDockTarget = dockingState?.hoveredDockTarget?.nodeId === id &&
    dockingState?.hoveredDockTarget?.handleId === 'output'
  const isCheckpointDockTarget = dockingState?.hoveredDockTarget?.nodeId === id &&
    dockingState?.hoveredDockTarget?.handleId === 'onCheckpoint'

  const getStatusIcon = () => {
    if (!nodeState) return null

    switch (nodeState.status) {
      case 'running':
        return <Loader2 style={{ width: 16, height: 16, color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
      case 'paused':
        return <Loader2 style={{ width: 16, height: 16, color: 'var(--warning)', animation: 'spin 2s linear infinite' }} />
      case 'completed':
        return <CheckCircle style={{ width: 16, height: 16, color: 'var(--success)' }} />
      case 'failed':
        return <XCircle style={{ width: 16, height: 16, color: 'var(--error)' }} />
      default:
        return null
    }
  }

  const isRunning = nodeState?.status === 'running'
  const isPaused = nodeState?.status === 'paused'
  const isCompleted = nodeState?.status === 'completed'
  const isFailed = nodeState?.status === 'failed'

  return (
    <div
      className={nodeData.disabled ? 'workflow-node-disabled' : ''}
      style={{
        padding: '12px 16px',
        borderRadius: '8px',
        minWidth: '180px',
        background: 'var(--panel)',
        border: `2px solid ${selected ? 'var(--node-purple)' : isPaused ? 'var(--warning)' : isRunning ? 'var(--accent)' : isCompleted ? 'var(--success)' : isFailed ? 'var(--error)' : 'var(--border)'}`,
        boxShadow: selected ? '0 0 0 2px color-mix(in srgb, var(--node-purple) 30%, transparent)' : '0 2px 4px rgba(0,0,0,0.1)',
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
          background: 'var(--node-purple)',
          border: '2px solid var(--panel)',
        }}
      />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <MessageSquare style={{ width: 16, height: 16, color: 'var(--node-purple)' }} />
        <span style={{ fontWeight: 500, fontSize: '13px', color: 'var(--text)' }}>
          {nodeData.label || 'Prompt'}
        </span>
        {getStatusIcon()}
      </div>

      {/* Source - show differently based on source type */}
      <div style={{
        fontSize: '11px',
        color: 'var(--muted)',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
      }}>
        {nodeData.sourceType === 'raw' ? (
          <>
            <AlignLeft style={{ width: 10, height: 10, flexShrink: 0 }} />
            <span style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '140px',
            }}>
              {nodeData.rawPrompt
                ? `${nodeData.rawPrompt.substring(0, 30).replace(/\n/g, ' ')}${nodeData.rawPrompt.length > 30 ? '...' : ''}`
                : 'Raw text (empty)'}
            </span>
          </>
        ) : (
          <>
            <FileText style={{ width: 10, height: 10, flexShrink: 0 }} />
            <span style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '140px',
            }}>
              {nodeData.source || 'No source configured'}
            </span>
          </>
        )}
      </div>

      {/* Provider/Model */}
      {(nodeData.provider || nodeData.model) && (
        <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          {nodeData.provider && <span>{nodeData.provider}</span>}
          {nodeData.provider && nodeData.model && <span> / </span>}
          {nodeData.model && <span>{nodeData.model}</span>}
        </div>
      )}

      {/* Streaming content preview */}
      {nodeState?.streamingContent && (
        <div style={{
          marginTop: '8px',
          padding: '8px',
          background: 'var(--panel-2)',
          borderRadius: '4px',
          fontSize: '11px',
          maxHeight: '60px',
          overflow: 'hidden',
          color: 'var(--text)',
        }}>
          {nodeState.streamingContent.slice(0, 100)}
          {nodeState.streamingContent.length > 100 && '...'}
        </div>
      )}

      {/* Output Handle - with dock target highlight */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        style={{
          width: isOutputDockTarget ? 16 : 12,
          height: isOutputDockTarget ? 16 : 12,
          background: 'var(--node-purple)',
          border: '2px solid var(--panel)',
          boxShadow: isOutputDockTarget ? '0 0 0 4px color-mix(in srgb, var(--node-purple) 50%, transparent), 0 0 12px var(--node-purple)' : undefined,
          transition: 'width 0.15s, height 0.15s, box-shadow 0.15s',
        }}
        title="Output (accepts Memory, Callback nodes)"
      />

      {/* Render docked nodes near output handle */}
      {outputHandleConfig && dockedToOutput.map((dockedNode, index) => (
        <DockedNodePreview
          key={dockedNode.id}
          dockedNodeId={dockedNode.id}
          dockedNodeType={dockedNode.type as WorkflowNodeType}
          dockedNodeLabel={(dockedNode.data as BaseNodeData).label}
          handleConfig={outputHandleConfig.position}
          targetNodeCollapsed={true}
          index={index}
        />
      ))}

      {/* onCheckpoint Handle - for checkpoint events (bottom) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="onCheckpoint"
        style={{
          width: isCheckpointDockTarget ? 16 : 12,
          height: isCheckpointDockTarget ? 16 : 12,
          background: 'var(--node-amber, #f59e0b)',
          border: '2px solid var(--panel)',
          left: '50%',
          boxShadow: isCheckpointDockTarget ? '0 0 0 4px color-mix(in srgb, var(--node-amber) 50%, transparent), 0 0 12px var(--node-amber)' : undefined,
          transition: 'width 0.15s, height 0.15s, box-shadow 0.15s',
        }}
        title="Checkpoint events (connect to Callback node)"
      />

      {/* Render docked nodes near checkpoint handle */}
      {checkpointHandleConfig && dockedToCheckpoint.map((dockedNode, index) => (
        <DockedNodePreview
          key={dockedNode.id}
          dockedNodeId={dockedNode.id}
          dockedNodeType={dockedNode.type as WorkflowNodeType}
          dockedNodeLabel={(dockedNode.data as BaseNodeData).label}
          handleConfig={{ side: 'bottom', topPercent: 50 }}
          targetNodeCollapsed={true}
          index={index}
        />
      ))}
    </div>
  )
})

PromptNode.displayName = 'PromptNode'

export { PromptNodeProperties } from './PromptNodeProperties'

/**
 * GuardrailNode - Input validation node with success/rejected branching
 *
 * Validates input against a system prompt and routes to success or rejected paths.
 *
 * Handles:
 * - input (left) - Data to validate
 * - rejected (left, below input) - Connection back to source when input is rejected
 *
 * Outputs:
 * - output (right) - Validated input passes through on success
 */

import { memo, useMemo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { ShieldCheck, CheckCircle, XCircle, Loader2, Cpu, Zap } from 'lucide-react'
import type { GuardrailNodeData, BaseNodeData, WorkflowNodeType, ProviderNodeData } from '../../../services/workflowTypes'
import { DOCKABLE_HANDLES } from '../../../services/workflowTypes'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import { DockedNodePreview, useDockedNodes } from './DockedNodePreview'

/** Get provider info from providerNodeId reference */
function useProviderReference(providerNodeId: string | undefined): {
  hasProvider: boolean
  providerLabel?: string
  model?: string
} {
  const nodes = useWorkflowStore(state => state.nodes)

  return useMemo(() => {
    if (!providerNodeId) return { hasProvider: false }

    const providerNode = nodes.find(n => n.id === providerNodeId && n.type === 'provider')
    if (!providerNode) return { hasProvider: false }

    const data = providerNode.data as ProviderNodeData
    return {
      hasProvider: true,
      providerLabel: data.label || data.providerId || 'Provider',
      model: data.model
    }
  }, [nodes, providerNodeId])
}

interface GuardrailNodeProps {
  id: string
  data: BaseNodeData
  selected?: boolean
}

export const GuardrailNode = memo(({ id, data, selected }: GuardrailNodeProps) => {
  const nodeData = data as GuardrailNodeData
  const executionState = useWorkflowStore(state => state.executionState)
  const nodeState = executionState?.nodeStates[id]

  // Get provider info from providerNodeId reference
  const { hasProvider, providerLabel, model: providerModel } = useProviderReference(nodeData.providerNodeId)

  // Get nodes docked to the rejected handle
  const dockedToRejected = useDockedNodes(id, 'rejected')
  const rejectedHandleConfig = DOCKABLE_HANDLES.find(
    h => h.nodeType === 'guardrail' && h.handleId === 'rejected'
  )

  // Get nodes docked to the onCheckpoint handle
  const dockedToCheckpoint = useDockedNodes(id, 'onCheckpoint')
  const checkpointHandleConfig = DOCKABLE_HANDLES.find(
    h => h.nodeType === 'guardrail' && h.handleId === 'onCheckpoint'
  )

  // Check if this handle is being targeted for docking
  const dockingState = useWorkflowStore(state => state.dockingState)
  const isRejectedDockTarget = dockingState?.hoveredDockTarget?.nodeId === id &&
    dockingState?.hoveredDockTarget?.handleId === 'rejected'
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

  // Get last result if available
  const lastResult = nodeState?.output as { rejected?: boolean; score?: number } | undefined

  return (
    <div
      className={nodeData.disabled ? 'workflow-node-disabled' : ''}
      style={{
        padding: '12px 16px',
        borderRadius: '8px',
        minWidth: '200px',
        background: 'var(--panel)',
        border: `2px solid ${selected ? 'var(--node-amber)' : isPaused ? 'var(--warning)' : isRunning ? 'var(--accent)' : isCompleted ? 'var(--success)' : isFailed ? 'var(--error)' : 'var(--border)'}`,
        boxShadow: selected ? '0 0 0 2px color-mix(in srgb, var(--node-amber) 30%, transparent)' : '0 2px 4px rgba(0,0,0,0.1)',
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}
    >
      {/* Input Handle (left, top) */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        style={{
          width: 12,
          height: 12,
          background: 'var(--node-amber)',
          border: '2px solid var(--panel)',
          top: '30%',
        }}
        title="Input to validate"
      />

      {/* Rejected Handle (left, bottom) - for routing rejected input back */}
      <Handle
        type="source"
        position={Position.Left}
        id="rejected"
        style={{
          width: isRejectedDockTarget ? 16 : 12,
          height: isRejectedDockTarget ? 16 : 12,
          background: 'var(--error)',
          border: '2px solid var(--panel)',
          top: '70%',
          boxShadow: isRejectedDockTarget ? '0 0 0 4px color-mix(in srgb, var(--error) 50%, transparent), 0 0 12px var(--error)' : undefined,
          transition: 'width 0.15s, height 0.15s, box-shadow 0.15s',
        }}
        title="Rejected output"
      />

      {/* Render docked nodes near rejected handle */}
      {rejectedHandleConfig && dockedToRejected.map((dockedNode, index) => (
        <DockedNodePreview
          key={dockedNode.id}
          dockedNodeId={dockedNode.id}
          dockedNodeType={dockedNode.type as WorkflowNodeType}
          dockedNodeLabel={(dockedNode.data as BaseNodeData).label}
          handleConfig={rejectedHandleConfig.position}
          index={index}
        />
      ))}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <ShieldCheck style={{ width: 16, height: 16, color: 'var(--node-amber)' }} />
        <span style={{ fontWeight: 500, fontSize: '13px', color: 'var(--text)' }}>
          {nodeData.label || 'Guardrail'}
        </span>
        {getStatusIcon()}
      </div>

      {/* Provider/Model info row */}
      {(hasProvider || nodeData.provider) && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          background: 'var(--panel-2)',
          borderRadius: 4,
          marginBottom: 6,
        }}>
          <Cpu style={{ width: 11, height: 11, color: 'var(--node-rose)' }} />
          <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
            {nodeData.provider || (hasProvider ? providerLabel : 'No provider')}
            {(nodeData.model || providerModel) && (
              <span style={{ color: 'var(--muted)' }}> / {nodeData.model || providerModel}</span>
            )}
          </span>
        </div>
      )}

      {/* Validation method indicator */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginBottom: 6,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 6px',
          background: nodeData.passExpression
            ? 'color-mix(in srgb, var(--node-violet) 15%, transparent)'
            : 'color-mix(in srgb, var(--node-amber) 15%, transparent)',
          borderRadius: 4,
        }}>
          <Zap style={{ width: 10, height: 10, color: nodeData.passExpression ? 'var(--node-violet)' : 'var(--node-amber)' }} />
          <span style={{ fontSize: 10, color: nodeData.passExpression ? 'var(--node-violet)' : 'var(--node-amber)', fontWeight: 500 }}>
            {nodeData.passExpression ? 'Expression' : 'Threshold'}
          </span>
        </div>
        {!nodeData.passExpression && nodeData.scoreThreshold !== undefined && (
          <span style={{ fontSize: 10, color: 'var(--muted)' }}>
            ≥ {nodeData.scoreThreshold}
          </span>
        )}
        {nodeData.temperature !== undefined && (
          <span style={{ fontSize: 10, color: 'var(--muted)' }}>
            T: {nodeData.temperature}
          </span>
        )}
      </div>

      {/* System prompt preview */}
      <div style={{
        fontSize: 11,
        color: 'var(--muted)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: '170px',
        marginBottom: 6,
      }}>
        {nodeData.systemPrompt
          ? `${nodeData.systemPrompt.substring(0, 40).replace(/\n/g, ' ')}${nodeData.systemPrompt.length > 40 ? '...' : ''}`
          : 'No validation prompt'}
      </div>

      {/* Last result indicator */}
      {lastResult !== undefined && (
        <div style={{
          marginTop: '8px',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '10px',
          fontWeight: 500,
          background: lastResult.rejected
            ? 'color-mix(in srgb, var(--error) 15%, transparent)'
            : 'color-mix(in srgb, var(--success) 15%, transparent)',
          color: lastResult.rejected ? 'var(--error)' : 'var(--success)',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}>
          {lastResult.rejected ? (
            <>
              <XCircle style={{ width: 10, height: 10 }} />
              Rejected
            </>
          ) : (
            <>
              <CheckCircle style={{ width: 10, height: 10 }} />
              Passed
            </>
          )}
          {lastResult.score !== undefined && (
            <span style={{ marginLeft: 'auto', opacity: 0.8 }}>
              Score: {lastResult.score.toFixed(2)}
            </span>
          )}
        </div>
      )}

      {/* Output Handle (right) - success path */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        style={{
          width: 12,
          height: 12,
          background: 'var(--success)',
          border: '2px solid var(--panel)',
        }}
        title="Success output"
      />

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
          index={index}
        />
      ))}
    </div>
  )
})

GuardrailNode.displayName = 'GuardrailNode'

/**
 * ConditionNode - Custom React Flow node for conditional branching
 *
 * Each condition branch has its own output handle that can be connected
 * to target nodes. When connected, the edge's target node ID is stored
 * in the condition's `target` property.
 */

import { memo, useMemo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { GitBranch, CheckCircle, XCircle, Loader2, ArrowRight } from 'lucide-react'
import type { ConditionNodeData, ConditionBranch, BaseNodeData, WorkflowNodeType } from '../../../services/workflowTypes'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import { DockedNodePreview, useDockedNodes } from './DockedNodePreview'
import { DOCKABLE_HANDLES } from '../../../services/workflowTypes'
import { NodeExecutionFooter } from './NodeExecutionFooter'

interface ConditionNodeProps {
  id: string
  data: BaseNodeData
  selected?: boolean
}

export const ConditionNode = memo(({ id, data, selected }: ConditionNodeProps) => {
  const nodeData = data as ConditionNodeData
  const executionState = useWorkflowStore(state => state.executionState)
  const nodeState = executionState?.nodeStates[id]
  const output = executionState?.nodeOutputs[id] as { branch?: string } | undefined

  // Get edges to determine which conditions are connected
  const edges = useWorkflowStore(state => state.edges)
  const nodes = useWorkflowStore(state => state.nodes)

  // Get nodes docked to the onEvaluate handle
  const dockedToEvaluate = useDockedNodes(id, 'onEvaluate')
  const evaluateHandleConfig = DOCKABLE_HANDLES.find(
    h => h.nodeType === 'condition' && h.handleId === 'onEvaluate'
  )

  // Check if this handle is being targeted for docking
  const dockingState = useWorkflowStore(state => state.dockingState)
  const isEvaluateDockTarget = dockingState?.hoveredDockTarget?.nodeId === id &&
    dockingState?.hoveredDockTarget?.handleId === 'onEvaluate'

  // Build a map of handle IDs to connected target node labels
  const connectedTargets = useMemo(() => {
    const targets: Record<string, string> = {}
    for (const edge of edges) {
      if (edge.source === id && edge.sourceHandle) {
        const targetNode = nodes.find(n => n.id === edge.target)
        if (targetNode) {
          targets[edge.sourceHandle] = targetNode.data.label || targetNode.id
        }
      }
    }
    return targets
  }, [edges, nodes, id])

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

  const conditions = nodeData.conditions || []

  return (
    <div
      className={[nodeData.disabled && 'workflow-node-disabled', nodeData.locked && 'workflow-node-locked'].filter(Boolean).join(' ')}
      style={{
        padding: '12px 16px',
        paddingRight: '24px', // Extra padding for output handles
        borderRadius: '8px',
        minWidth: '200px',
        background: 'var(--panel)',
        border: `2px solid ${selected ? 'var(--node-amber)' : 'var(--border)'}`,
        boxShadow: selected ? '0 0 0 2px color-mix(in srgb, var(--node-amber) 30%, transparent)' : '0 2px 4px rgba(0,0,0,0.1)',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        position: 'relative',
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
          background: 'var(--node-amber)',
          border: '2px solid var(--panel)',
        }}
      />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <GitBranch style={{ width: 16, height: 16, color: 'var(--node-amber)' }} />
        <span style={{ fontWeight: 500, fontSize: '13px', color: 'var(--text)' }}>
          {nodeData.label || 'Condition'}
        </span>
        {getStatusIcon()}
      </div>

      {/* Conditions list with output handles */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {conditions.map((condition: ConditionBranch) => {
          const handleId = `condition-${condition.id}`
          const isConnected = !!connectedTargets[handleId]
          const isTaken = output?.branch === condition.id

          return (
            <div
              key={condition.id}
              style={{
                fontSize: '11px',
                padding: '4px 8px',
                borderRadius: '4px',
                background: isTaken ? 'color-mix(in srgb, var(--node-amber) 20%, transparent)' : 'var(--panel-2)',
                color: 'var(--text)',
                fontWeight: isTaken ? 500 : 400,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                position: 'relative',
              }}
            >
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {condition.id}: {condition.expression.slice(0, 25)}
                {condition.expression.length > 25 && '...'}
              </span>
              {isConnected && (
                <span style={{
                  fontSize: '9px',
                  color: 'var(--success)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px',
                }}>
                  <ArrowRight style={{ width: 10, height: 10 }} />
                </span>
              )}
              {/* Output handle for this condition */}
              <Handle
                type="source"
                position={Position.Right}
                id={handleId}
                style={{
                  position: 'absolute',
                  right: -20,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 10,
                  height: 10,
                  background: isConnected ? 'var(--success)' : 'var(--node-amber)',
                  border: '2px solid var(--panel)',
                }}
              />
            </div>
          )
        })}

        {/* Default branch - always show it for connection */}
        <div
          style={{
            fontSize: '11px',
            padding: '4px 8px',
            borderRadius: '4px',
            background: output?.branch === 'default' ? 'color-mix(in srgb, var(--muted) 20%, transparent)' : 'var(--panel-2)',
            color: 'var(--muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            position: 'relative',
            borderStyle: 'dashed',
            borderWidth: '1px',
            borderColor: 'var(--border)',
          }}
        >
          <span>default</span>
          {connectedTargets['default'] && (
            <span style={{
              fontSize: '9px',
              color: 'var(--success)',
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
            }}>
              <ArrowRight style={{ width: 10, height: 10 }} />
            </span>
          )}
          {/* Output handle for default branch */}
          <Handle
            type="source"
            position={Position.Right}
            id="default"
            style={{
              position: 'absolute',
              right: -20,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 10,
              height: 10,
              background: connectedTargets['default'] ? 'var(--success)' : 'var(--muted)',
              border: '2px solid var(--panel)',
            }}
          />
        </div>
      </div>

      {/* Execution debug footer */}
      <NodeExecutionFooter
        nodeState={nodeState}
        allNodeStates={executionState?.nodeStates}
      />

      {/* Evaluate event handle (bottom) - for docking Callback nodes */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="onEvaluate"
        style={{
          width: isEvaluateDockTarget ? 16 : 12,
          height: isEvaluateDockTarget ? 16 : 12,
          background: 'var(--node-amber)',
          border: '2px solid var(--panel)',
          left: '50%',
          boxShadow: isEvaluateDockTarget ? '0 0 0 4px color-mix(in srgb, var(--node-amber) 50%, transparent), 0 0 12px var(--node-amber)' : undefined,
          transition: 'width 0.15s, height 0.15s, box-shadow 0.15s',
        }}
        title="Evaluate events (accepts Callback)"
      />

      {/* Render docked nodes near onEvaluate handle */}
      {evaluateHandleConfig && dockedToEvaluate.map((dockedNode, index) => (
        <DockedNodePreview
          key={dockedNode.id}
          dockedNodeId={dockedNode.id}
          dockedNodeType={dockedNode.type as WorkflowNodeType}
          dockedNodeLabel={(dockedNode.data as BaseNodeData).label}
          handleConfig={evaluateHandleConfig.position}
          index={index}
        />
      ))}
    </div>
  )
})

ConditionNode.displayName = 'ConditionNode'

// Export properties component
export { ConditionNodeProperties } from './ConditionNodeProperties'

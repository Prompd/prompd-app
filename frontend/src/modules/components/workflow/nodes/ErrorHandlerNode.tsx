/**
 * ErrorHandlerNode - Workflow-level error handling configuration
 *
 * This is a "config node" - it doesn't participate in the main data flow.
 * Instead, other nodes reference it by ID via `errorHandlerNodeId`.
 * When an error occurs, the executor routes it to the referenced handler.
 *
 * Visual indicators:
 * - Rose/red color theme
 * - Dashed border to indicate "config node" vs "flow node"
 * - No input/output handles (referenced by ID, not edges)
 * - Shows which nodes reference this handler
 */

import { memo, useMemo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { AlertTriangle, RefreshCw, ArrowRight, Bell, XCircle, RotateCcw } from 'lucide-react'
import type { ErrorHandlerNodeData, BaseNodeData, WorkflowNodeType } from '../../../services/workflowTypes'
import { DOCKABLE_HANDLES } from '../../../services/workflowTypes'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import { getNodeColor } from '../nodeColors'
import { DockedNodePreview, useDockedNodes } from './DockedNodePreview'
import { NodeExecutionFooter } from './NodeExecutionFooter'

// Handle style constants
const handleSize = 12
const handleBorder = '2px solid var(--panel)'

interface ErrorHandlerNodeProps {
  id: string
  data: BaseNodeData
  selected?: boolean
}

export const ErrorHandlerNode = memo(({ id, data, selected }: ErrorHandlerNodeProps) => {
  const nodeData = data as ErrorHandlerNodeData
  const executionState = useWorkflowStore(state => state.executionState)
  const nodes = useWorkflowStore(state => state.nodes)
  const nodeState = executionState?.nodeStates[id]

  // Node color from central definition
  const nodeColor = getNodeColor('error-handler')

  // Get nodes docked to the onError handle
  const dockedToOnError = useDockedNodes(id, 'onError')
  const onErrorHandleConfig = DOCKABLE_HANDLES.find(
    h => h.nodeType === 'error-handler' && h.handleId === 'onError'
  )

  // Check if this handle is being targeted for docking
  const dockingState = useWorkflowStore(state => state.dockingState)
  const isOnErrorDockTarget = dockingState?.hoveredDockTarget?.nodeId === id &&
    dockingState?.hoveredDockTarget?.handleId === 'onError'

  // Count nodes that reference this error handler
  const referencingNodes = useMemo(() => {
    return nodes.filter(n => {
      const d = n.data as BaseNodeData
      return d.errorHandlerNodeId === id
    })
  }, [nodes, id])

  const refCount = referencingNodes.length

  // Strategy display
  const strategyConfig = {
    'retry': { icon: RefreshCw, label: 'Retry', description: 'Retry with backoff' },
    'fallback': { icon: ArrowRight, label: 'Fallback', description: 'Use fallback value' },
    'notify': { icon: Bell, label: 'Notify', description: 'Notify and continue' },
    'ignore': { icon: XCircle, label: 'Ignore', description: 'Swallow error' },
    'rethrow': { icon: RotateCcw, label: 'Rethrow', description: 'Stop execution' },
  }

  const strategy = nodeData.strategy || 'retry'
  const config = strategyConfig[strategy] || strategyConfig.retry
  const StrategyIcon = config.icon

  // Format retry info
  const retryInfo = useMemo(() => {
    if (strategy !== 'retry' || !nodeData.retry) return null
    const { maxAttempts, backoffMs, backoffMultiplier } = nodeData.retry
    const parts = [`${maxAttempts} attempts`]
    if (backoffMs) {
      parts.push(`${backoffMs}ms`)
      if (backoffMultiplier && backoffMultiplier > 1) {
        parts.push(`x${backoffMultiplier}`)
      }
    }
    return parts.join(', ')
  }, [strategy, nodeData.retry])

  // Format fallback info
  const fallbackInfo = useMemo(() => {
    if (!nodeData.fallback) return null
    switch (nodeData.fallback.type) {
      case 'value':
        return 'Static value'
      case 'template':
        return 'Template'
      case 'node':
        return 'Fallback node'
      default:
        return null
    }
  }, [nodeData.fallback])

  // Status-based styling
  const getStatusBorderColor = (): string | null => {
    if (!nodeState) return null
    switch (nodeState.status) {
      case 'running':
        return nodeColor
      case 'completed':
        return 'var(--success)'
      case 'failed':
        return 'var(--error)'
      default:
        return null
    }
  }

  const statusBorderColor = getStatusBorderColor()
  const borderColor = statusBorderColor || (selected ? nodeColor : 'var(--border)')

  return (
    <div
      className={[nodeData.disabled && 'workflow-node-disabled', nodeData.locked && 'workflow-node-locked'].filter(Boolean).join(' ')}
      style={{
        minWidth: 180,
        padding: '12px',
        background: 'var(--panel)',
        borderWidth: '2px',
        borderStyle: 'dashed', // Dashed to indicate config node
        borderColor: borderColor,
        borderRadius: '8px',
        boxShadow: selected
          ? `0 0 0 2px color-mix(in srgb, ${nodeColor} 30%, transparent)`
          : '0 2px 4px rgba(0,0,0,0.1)',
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: '6px',
            background: `color-mix(in srgb, ${nodeColor} 20%, transparent)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: nodeColor,
          }}
        >
          <AlertTriangle style={{ width: 14, height: 14 }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
            {nodeData.label || 'Error Handler'}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
            Config Node
          </div>
        </div>
      </div>

      {/* Strategy badge */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 8px',
          background: `color-mix(in srgb, ${nodeColor} 15%, transparent)`,
          borderRadius: '4px',
          fontSize: '10px',
          color: nodeColor,
          fontWeight: 500,
          marginBottom: '8px',
        }}
      >
        <StrategyIcon style={{ width: 12, height: 12 }} />
        {config.label}
      </div>

      {/* Strategy description */}
      <div
        style={{
          fontSize: '10px',
          color: 'var(--text-secondary)',
          marginBottom: '8px',
        }}
      >
        {config.description}
      </div>

      {/* Retry info */}
      {retryInfo && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 8px',
            background: 'color-mix(in srgb, var(--muted) 10%, transparent)',
            borderRadius: '4px',
            fontSize: '10px',
            color: 'var(--text)',
            marginBottom: '6px',
          }}
        >
          <RefreshCw style={{ width: 10, height: 10 }} />
          {retryInfo}
        </div>
      )}

      {/* Fallback info */}
      {fallbackInfo && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 8px',
            background: 'color-mix(in srgb, var(--muted) 10%, transparent)',
            borderRadius: '4px',
            fontSize: '10px',
            color: 'var(--text)',
            marginBottom: '6px',
          }}
        >
          <ArrowRight style={{ width: 10, height: 10 }} />
          {fallbackInfo}
        </div>
      )}

      {/* Notification indicator */}
      {nodeData.notify?.webhookUrl && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 8px',
            background: 'color-mix(in srgb, var(--muted) 10%, transparent)',
            borderRadius: '4px',
            fontSize: '10px',
            color: 'var(--text)',
            marginBottom: '6px',
          }}
        >
          <Bell style={{ width: 10, height: 10 }} />
          Webhook configured
        </div>
      )}

      {/* Referenced by count */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 8px',
          background: 'color-mix(in srgb, var(--muted) 10%, transparent)',
          borderRadius: '4px',
          fontSize: '10px',
          color: refCount > 0 ? 'var(--text)' : 'var(--muted)',
        }}
      >
        {refCount} {refCount === 1 ? 'node' : 'nodes'} using this handler
      </div>

      {/* Referencing nodes preview */}
      {refCount > 0 && (
        <div
          style={{
            marginTop: '6px',
            fontSize: '9px',
            color: 'var(--text-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {referencingNodes.slice(0, 3).map(n => (n.data as BaseNodeData).label).join(', ')}
          {refCount > 3 && ` +${refCount - 3}`}
        </div>
      )}

      {/* Empty state hint */}
      {refCount === 0 && (
        <div
          style={{
            marginTop: '8px',
            fontSize: '9px',
            color: 'var(--muted)',
            fontStyle: 'italic',
          }}
        >
          Set errorHandlerNodeId on nodes
        </div>
      )}

      {/* Description */}
      {nodeData.description && (
        <div
          style={{
            marginTop: '8px',
            fontSize: '10px',
            color: 'var(--text-secondary)',
            fontStyle: 'italic',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {nodeData.description}
        </div>
      )}

      {/* Execution debug footer */}
      <NodeExecutionFooter
        nodeState={nodeState}
        allNodeStates={executionState?.nodeStates}
      />

      {/* onError Output Handle (bottom) - connect to Checkpoint for error events */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="onError"
        style={{
          width: isOnErrorDockTarget ? 16 : handleSize,
          height: isOnErrorDockTarget ? 16 : handleSize,
          background: 'var(--node-amber, #f59e0b)',
          border: handleBorder,
          left: '50%',
          boxShadow: isOnErrorDockTarget ? '0 0 0 4px color-mix(in srgb, var(--node-amber) 50%, transparent), 0 0 12px var(--node-amber)' : undefined,
          transition: 'width 0.15s, height 0.15s, box-shadow 0.15s',
        }}
        title="Error events (connect to Checkpoint node)"
      />

      {/* Render docked nodes near onError handle */}
      {onErrorHandleConfig && dockedToOnError.map((dockedNode, index) => (
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

ErrorHandlerNode.displayName = 'ErrorHandlerNode'

// Export properties component
export { ErrorHandlerNodeProperties } from './ErrorHandlerNodeProperties'

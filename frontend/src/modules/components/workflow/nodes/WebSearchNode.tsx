/**
 * WebSearchNode - Search the web via configurable provider
 *
 * Uses the connection system to reference a web-search connection
 * that configures the provider (LangSearch, Brave, Tavily) and credentials.
 * Returns structured JSON search results to downstream nodes.
 */

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Search, CheckCircle, XCircle, Loader2, Link2 } from 'lucide-react'
import type { WebSearchNodeData, BaseNodeData, WorkflowNodeType } from '../../../services/workflowTypes'
import { DOCKABLE_HANDLES } from '../../../services/workflowTypes'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import { DockedNodePreview, useDockedNodes } from './DockedNodePreview'
import { getNodeColor } from '../nodeColors'
import { NodeExecutionFooter } from './NodeExecutionFooter'

// Handle style constants
const handleSize = 12
const handleBorder = '2px solid var(--panel)'

interface WebSearchNodeProps {
  id: string
  data: BaseNodeData
  selected?: boolean
}

export const WebSearchNode = memo(({ id, data, selected }: WebSearchNodeProps) => {
  const executionState = useWorkflowStore(state => state.executionState)
  const connections = useWorkflowStore(state => state.connections)
  const nodeState = executionState?.nodeStates[id]
  const nodeData = data as WebSearchNodeData

  // Docking support for checkpoint handle
  const dockedToCheckpoint = useDockedNodes(id, 'onCheckpoint')
  const checkpointHandleConfig = DOCKABLE_HANDLES.find(
    h => h.nodeType === 'web-search' && h.handleId === 'onCheckpoint'
  )
  const dockingState = useWorkflowStore(state => state.dockingState)
  const isCheckpointDockTarget = dockingState?.hoveredDockTarget?.nodeId === id &&
    dockingState?.hoveredDockTarget?.handleId === 'onCheckpoint'

  // Node color from central definition
  const nodeColor = getNodeColor('web-search')

  // Check if a connection is configured
  const hasConnection = !!nodeData.connectionId
  const connection = hasConnection
    ? connections.find(c => c.id === nodeData.connectionId)
    : undefined

  // Status-based styling
  const getStatusIcon = () => {
    if (!nodeState) return null

    switch (nodeState.status) {
      case 'running':
        return (
          <Loader2
            style={{
              width: 14,
              height: 14,
              color: nodeColor,
              animation: 'spin 1s linear infinite',
            }}
          />
        )
      case 'completed':
        return <CheckCircle style={{ width: 14, height: 14, color: 'var(--success)' }} />
      case 'failed':
        return <XCircle style={{ width: 14, height: 14, color: 'var(--error)' }} />
      default:
        return null
    }
  }

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
  const boxShadow = selected
    ? `0 0 0 2px color-mix(in srgb, ${nodeColor} 30%, transparent)`
    : '0 2px 4px rgba(0,0,0,0.1)'

  // Format query for display (truncate if too long)
  const queryStr = String(nodeData.query ?? '')
  const displayQuery: string = queryStr.length > 40
    ? queryStr.slice(0, 40) + '...'
    : queryStr || 'No query set'

  const resultCount = nodeData.resultCount ?? 5

  // Provider label for badge
  const providerLabels: Record<string, string> = {
    langsearch: 'LangSearch',
    brave: 'Brave',
    tavily: 'Tavily',
  }
  const providerLabel = providerLabels[nodeData.provider || 'langsearch'] || 'LangSearch'

  return (
    <div
      className={nodeData.disabled ? 'workflow-node-disabled' : ''}
      style={{
        minWidth: 200,
        padding: '12px',
        background: 'var(--panel)',
        borderWidth: '2px',
        borderStyle: 'solid',
        borderColor: borderColor,
        borderRadius: '8px',
        boxShadow: boxShadow,
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        style={{
          width: handleSize,
          height: handleSize,
          background: nodeColor,
          border: handleBorder,
          top: '50%',
        }}
      />

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
          <Search style={{ width: 14, height: 14 }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
            {String(nodeData.label ?? 'Web Search')}
          </div>
        </div>
        {getStatusIcon()}
      </div>

      {/* Query preview */}
      <div
        style={{
          padding: '6px 8px',
          background: 'var(--bg)',
          borderRadius: '4px',
          fontSize: '11px',
          color: 'var(--text)',
          marginBottom: '8px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {displayQuery}
      </div>

      {/* Metadata row */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {/* Provider badge */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 6px',
            background: `color-mix(in srgb, ${nodeColor} 15%, transparent)`,
            borderRadius: '4px',
            fontSize: '10px',
            color: nodeColor,
            fontWeight: 600,
          }}
        >
          {providerLabel}
        </div>

        {/* Result count badge */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 6px',
            background: `color-mix(in srgb, ${nodeColor} 10%, transparent)`,
            borderRadius: '4px',
            fontSize: '10px',
            color: nodeColor,
            fontWeight: 500,
          }}
        >
          {String(resultCount)} results
        </div>

        {/* Connection status indicator */}
        {hasConnection && connection && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 6px',
              background: 'color-mix(in srgb, var(--node-cyan) 10%, transparent)',
              borderRadius: '4px',
              fontSize: '10px',
              color: 'var(--node-cyan)',
            }}
          >
            <Link2 style={{ width: 10, height: 10 }} />
            {connection.name}
          </div>
        )}
      </div>

      {/* Execution result preview */}
      {nodeState?.status === 'completed' && nodeState.output !== undefined && (
        <div
          style={{
            marginTop: '8px',
            padding: '6px 8px',
            background: 'color-mix(in srgb, var(--success) 10%, transparent)',
            borderRadius: '4px',
            fontSize: '10px',
            color: 'var(--success)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {'Results: '}{(() => {
            const outputStr = typeof nodeState.output === 'string'
              ? nodeState.output
              : JSON.stringify(nodeState.output)
            return outputStr.length > 50 ? outputStr.slice(0, 50) + '...' : outputStr
          })()}
        </div>
      )}

      {/* Error display */}
      {nodeState?.status === 'failed' && nodeState.error && (
        <div
          style={{
            marginTop: '8px',
            padding: '6px 8px',
            background: 'color-mix(in srgb, var(--error) 10%, transparent)',
            borderRadius: '4px',
            fontSize: '10px',
            color: 'var(--error)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {String(nodeState.error)}
        </div>
      )}

      {/* Execution debug footer */}
      <NodeExecutionFooter
        nodeState={nodeState}
        allNodeStates={executionState?.nodeStates}
        showOutput={false}
        showError={false}
      />

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        style={{
          width: handleSize,
          height: handleSize,
          background: nodeColor,
          border: handleBorder,
          top: '50%',
        }}
      />

      {/* onCheckpoint Handle - yellow, for checkpoint/callback docking (bottom) */}
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
        title="Checkpoint events (connect to Checkpoint or Callback node)"
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

WebSearchNode.displayName = 'WebSearchNode'

// Export properties component
export { WebSearchNodeProperties } from './WebSearchNodeProperties'

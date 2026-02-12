/**
 * DatabaseQueryNode - Execute queries against a database connection
 *
 * Supports SQL (PostgreSQL, MySQL, SQLite), MongoDB JSON queries, and Redis commands.
 * Uses the connection system to select which database to query.
 */

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { TableProperties, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import type { DatabaseQueryNodeData, BaseNodeData, WorkflowNodeType, DatabaseConnectionConfig } from '../../../services/workflowTypes'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import { DockedNodePreview, useDockedNodes } from './DockedNodePreview'
import { DOCKABLE_HANDLES } from '../../../services/workflowTypes'
import { getNodeColor } from '../nodeColors'
import { NodeExecutionFooter } from './NodeExecutionFooter'
import { useConnection } from '../shared/hooks/useNodeConnections'

// Handle style constants
const handleSize = 12
const handleBorder = '2px solid var(--panel)'

interface DatabaseQueryNodeProps {
  id: string
  data: BaseNodeData
  selected?: boolean
}

// Query type display configuration
const QUERY_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  select: { label: 'SELECT', color: '#3178c6' },
  insert: { label: 'INSERT', color: '#239120' },
  update: { label: 'UPDATE', color: '#f7a928' },
  delete: { label: 'DELETE', color: '#e53e3e' },
  raw: { label: 'RAW', color: '#6b7280' },
  aggregate: { label: 'AGGREGATE', color: '#8b5cf6' },
}

// Database type labels for display
const DB_TYPE_LABELS: Record<string, string> = {
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  mongodb: 'MongoDB',
  redis: 'Redis',
  sqlite: 'SQLite',
}

export const DatabaseQueryNode = memo(({ id, data, selected }: DatabaseQueryNodeProps) => {
  const executionState = useWorkflowStore(state => state.executionState)
  const nodeState = executionState?.nodeStates[id]
  const nodeData = data as DatabaseQueryNodeData

  // Get nodes docked to the onExecute handle
  const dockedToExecute = useDockedNodes(id, 'onExecute')
  const executeHandleConfig = DOCKABLE_HANDLES.find(
    h => h.nodeType === 'database-query' && h.handleId === 'onExecute'
  )

  // Check if this handle is being targeted for docking
  const dockingState = useWorkflowStore(state => state.dockingState)
  const isExecuteDockTarget = dockingState?.hoveredDockTarget?.nodeId === id &&
    dockingState?.hoveredDockTarget?.handleId === 'onExecute'

  // Node color from central definition
  const nodeColor = getNodeColor('database-query')

  // Look up the connected database type for display
  const connection = useConnection(nodeData.connectionId)
  const dbType = connection?.type === 'database'
    ? (connection.config as DatabaseConnectionConfig).dbType
    : undefined

  const queryType = nodeData.queryType || 'select'
  const queryConfig = QUERY_TYPE_CONFIG[queryType] || QUERY_TYPE_CONFIG.select

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

  // Format query preview (first line or truncated)
  const queryStr = String(nodeData.query ?? '')
  const firstLine = queryStr.split('\n')[0] || ''
  const displayQuery: string = firstLine.length > 35
    ? firstLine.slice(0, 35) + '...'
    : firstLine || 'No query'

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
          <TableProperties style={{ width: 14, height: 14 }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
            {String(nodeData.label ?? 'DB Query')}
          </div>
        </div>
        {getStatusIcon()}
      </div>

      {/* Badges row: connection name + query type */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
        {/* Connection / DB type badge */}
        {connection ? (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              background: `color-mix(in srgb, ${nodeColor} 15%, transparent)`,
              borderRadius: '4px',
              fontSize: '10px',
              color: nodeColor,
              fontWeight: 500,
            }}
          >
            {dbType ? DB_TYPE_LABELS[dbType] || dbType : connection.name}
          </div>
        ) : (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '2px 8px',
              background: 'color-mix(in srgb, var(--warning) 15%, transparent)',
              borderRadius: '4px',
              fontSize: '10px',
              color: 'var(--warning)',
              fontWeight: 500,
            }}
          >
            No connection
          </div>
        )}

        {/* Query type badge */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px 8px',
            background: `${queryConfig.color}20`,
            borderRadius: '4px',
            fontSize: '10px',
            color: queryConfig.color,
            fontWeight: 600,
          }}
        >
          {queryConfig.label}
        </div>

        {/* MongoDB collection badge */}
        {dbType === 'mongodb' && nodeData.collection && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '2px 8px',
              background: 'color-mix(in srgb, var(--muted) 10%, transparent)',
              borderRadius: '4px',
              fontSize: '10px',
              color: 'var(--muted)',
              fontFamily: 'monospace',
            }}
          >
            {nodeData.collection}
          </div>
        )}
      </div>

      {/* Query preview */}
      <div
        style={{
          padding: '6px 8px',
          background: 'var(--bg)',
          borderRadius: '4px',
          fontFamily: 'monospace',
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

      {/* Description */}
      {nodeData.description && (
        <div
          style={{
            fontSize: '10px',
            color: 'var(--text-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginBottom: '4px',
          }}
        >
          {String(nodeData.description)}
        </div>
      )}

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
          {'Result: '}{(() => {
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

      {/* Execute event handle (bottom) - for docking Memory and Callback nodes */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="onExecute"
        style={{
          width: isExecuteDockTarget ? 16 : handleSize,
          height: isExecuteDockTarget ? 16 : handleSize,
          background: 'var(--node-amber)',
          border: handleBorder,
          left: '50%',
          boxShadow: isExecuteDockTarget ? '0 0 0 4px color-mix(in srgb, var(--node-amber) 50%, transparent), 0 0 12px var(--node-amber)' : undefined,
          transition: 'width 0.15s, height 0.15s, box-shadow 0.15s',
        }}
        title="Execute events (accepts Memory, Callback)"
      />

      {/* Render docked nodes near onExecute handle */}
      {executeHandleConfig && dockedToExecute.map((dockedNode, index) => (
        <DockedNodePreview
          key={dockedNode.id}
          dockedNodeId={dockedNode.id}
          dockedNodeType={dockedNode.type as WorkflowNodeType}
          dockedNodeLabel={(dockedNode.data as BaseNodeData).label}
          handleConfig={executeHandleConfig.position}
          index={index}
        />
      ))}
    </div>
  )
})

DatabaseQueryNode.displayName = 'DatabaseQueryNode'

// Export properties component
export { DatabaseQueryNodeProperties } from './DatabaseQueryNodeProperties'

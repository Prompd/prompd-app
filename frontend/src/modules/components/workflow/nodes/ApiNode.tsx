/**
 * ApiNode - HTTP API request node
 *
 * Executes HTTP requests (GET, POST, PUT, DELETE, PATCH) against APIs.
 * Supports connection-based auth, custom headers, and request body.
 */

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Globe, CheckCircle, XCircle, Loader2, Link2 } from 'lucide-react'
import type { BaseNodeData } from '../../../services/workflowTypes'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import { getNodeColor } from '../nodeColors'
import { NodeExecutionFooter } from './NodeExecutionFooter'

interface ApiNodeData extends BaseNodeData {
  toolName?: string
  description?: string
  method?: string
  url?: string
  connectionId?: string
}

interface ApiNodeProps {
  id: string
  data: BaseNodeData
  selected?: boolean
}

export const ApiNode = memo(({ id, data, selected }: ApiNodeProps) => {
  const executionState = useWorkflowStore(state => state.executionState)
  const connections = useWorkflowStore(state => state.connections)
  const nodeState = executionState?.nodeStates[id]
  const nodeData = data as ApiNodeData

  const nodeColor = getNodeColor('api')

  const hasConnection = !!nodeData.connectionId
  const connection = hasConnection
    ? connections.find(c => c.id === nodeData.connectionId)
    : undefined

  // Status-based styling
  const getStatusIcon = () => {
    if (!nodeState) return null
    switch (nodeState.status) {
      case 'running':
        return <Loader2 style={{ width: 14, height: 14, color: nodeColor, animation: 'spin 1s linear infinite' }} />
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
      case 'running': return nodeColor
      case 'completed': return 'var(--success)'
      case 'failed': return 'var(--error)'
      default: return null
    }
  }

  const statusBorderColor = getStatusBorderColor()
  const borderColor = statusBorderColor || (selected ? nodeColor : 'var(--border)')
  const boxShadow = selected
    ? `0 0 0 2px color-mix(in srgb, ${nodeColor} 30%, transparent)`
    : '0 2px 4px rgba(0,0,0,0.1)'

  const method = nodeData.method || 'GET'
  const url = nodeData.url || ''
  const displayUrl = url.length > 30 ? url.slice(0, 30) + '...' : url || 'No URL set'

  // Method color coding
  const methodColors: Record<string, string> = {
    GET: 'var(--node-emerald, #10b981)',
    POST: 'var(--node-blue, #3b82f6)',
    PUT: 'var(--node-amber, #f59e0b)',
    PATCH: 'var(--node-amber, #f59e0b)',
    DELETE: 'var(--error, #ef4444)',
  }
  const methodColor = methodColors[method] || nodeColor

  return (
    <div
      className={[nodeData.disabled && 'workflow-node-disabled', nodeData.locked && 'workflow-node-locked'].filter(Boolean).join(' ')}
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
          width: 12,
          height: 12,
          background: nodeColor,
          border: '2px solid var(--panel)',
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
          <Globe style={{ width: 14, height: 14 }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
            {String(nodeData.label ?? 'API Call')}
          </div>
        </div>
        {getStatusIcon()}
      </div>

      {/* Method + URL */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 8px',
          background: 'var(--bg)',
          borderRadius: '4px',
          fontSize: '11px',
          marginBottom: '8px',
          overflow: 'hidden',
        }}
      >
        <span style={{ fontWeight: 700, color: methodColor, flexShrink: 0, fontSize: '10px' }}>
          {method}
        </span>
        <span style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayUrl}
        </span>
      </div>

      {/* Metadata row */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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

      {/* Description */}
      {nodeData.description && (
        <div
          style={{
            marginTop: '6px',
            fontSize: '10px',
            color: 'var(--text-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {nodeData.description}
        </div>
      )}

      {/* Execution result */}
      {nodeState?.status === 'completed' && nodeState.output !== undefined && (
        <div
          style={{
            marginTop: '8px',
            padding: '6px 8px',
            background: 'color-mix(in srgb, var(--success) 10%, transparent)',
            borderRadius: '4px',
            fontSize: '10px',
            color: 'var(--success)',
          }}
        >
          Result received
        </div>
      )}

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
          width: 12,
          height: 12,
          background: nodeColor,
          border: '2px solid var(--panel)',
          top: '50%',
        }}
      />
    </div>
  )
})

ApiNode.displayName = 'ApiNode'

export { ApiNodeProperties } from './ApiNodeProperties'

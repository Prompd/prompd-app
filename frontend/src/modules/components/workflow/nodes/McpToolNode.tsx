/**
 * McpToolNode - Execute tools from external MCP servers
 *
 * This node connects to external MCP servers and executes their tools.
 * Unlike the generic Tool node, this is specifically for MCP protocol
 * and supports MCP-specific features like resources and prompts.
 */

import { memo, useMemo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Plug, CheckCircle, XCircle, Loader2, Clock, Link2 } from 'lucide-react'
import type { McpToolNodeData, BaseNodeData, WorkflowConnection } from '../../../services/workflowTypes'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import { getNodeColor } from '../nodeColors'

// Handle style constants
const handleSize = 12
const handleBorder = '2px solid var(--panel)'

/** Get MCP connection info from connectionId reference */
function useMcpConnectionReference(connectionId: string | undefined): {
  hasConnection: boolean
  connectionName?: string
  serverUrl?: string
  status?: WorkflowConnection['status']
} {
  const connections = useWorkflowStore(state => state.connections)

  return useMemo(() => {
    if (!connectionId) return { hasConnection: false }

    const connection = connections.find(c => c.id === connectionId && c.type === 'mcp-server')
    if (!connection) return { hasConnection: false }

    return {
      hasConnection: true,
      connectionName: connection.name,
      serverUrl: (connection.config as { serverUrl?: string })?.serverUrl,
      status: connection.status
    }
  }, [connections, connectionId])
}

interface McpToolNodeProps {
  id: string
  data: BaseNodeData
  selected?: boolean
}

export const McpToolNode = memo(({ id, data, selected }: McpToolNodeProps) => {
  const executionState = useWorkflowStore(state => state.executionState)
  const nodeState = executionState?.nodeStates[id]
  const nodeData = data as McpToolNodeData

  // Get MCP connection info if using connectionId
  const connectionIdStr = String(nodeData.connectionId ?? '')
  const { hasConnection, connectionName, serverUrl, status: connectionStatus } = useMcpConnectionReference(connectionIdStr || undefined)

  // Node color from central definition
  const nodeColor = getNodeColor('mcp-tool')

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

  // Get server info (from connection or inline config)
  const serverConfigName = nodeData.serverConfig && typeof nodeData.serverConfig === 'object'
    ? String((nodeData.serverConfig as { serverName?: unknown }).serverName ?? '')
    : ''
  const serverConfigUrl = nodeData.serverConfig && typeof nodeData.serverConfig === 'object'
    ? String((nodeData.serverConfig as { serverUrl?: unknown }).serverUrl ?? '')
    : ''

  const serverName: string = hasConnection
    ? (connectionName ?? 'MCP Server')
    : (serverConfigName || 'MCP Server')

  const serverUrlDisplay: string = hasConnection
    ? (serverUrl ?? '')
    : serverConfigUrl

  // Tool name
  const toolName: string = String(nodeData.toolName ?? 'No tool selected')

  // Count parameters
  const params = (nodeData.parameters && typeof nodeData.parameters === 'object') ? nodeData.parameters as Record<string, unknown> : {}
  const paramCount = Object.keys(params).length

  // Timeout
  const timeoutMs = typeof nodeData.timeoutMs === 'number' ? nodeData.timeoutMs : undefined

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
          <Plug style={{ width: 14, height: 14 }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
            {String(nodeData.label ?? 'MCP Tool')}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
            {'MCP Protocol'}
          </div>
        </div>
        {getStatusIcon()}
      </div>

      {/* Server connection */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 8px',
          background: `color-mix(in srgb, ${nodeColor} 10%, transparent)`,
          borderRadius: '4px',
          marginBottom: '8px',
        }}
      >
        <Link2 style={{ width: 12, height: 12, color: nodeColor, flexShrink: 0 }} />
        <span
          style={{
            fontSize: '10px',
            color: nodeColor,
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {serverName}
        </span>
        {connectionStatus && (
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: connectionStatus === 'connected'
                ? 'var(--success)'
                : connectionStatus === 'error'
                  ? 'var(--error)'
                  : 'var(--muted)',
              flexShrink: 0,
            }}
            title={connectionStatus}
          />
        )}
      </div>

      {/* Tool name */}
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
        {toolName}
      </div>

      {/* Metadata row */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {/* Parameter count */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 6px',
            background: 'color-mix(in srgb, var(--muted) 10%, transparent)',
            borderRadius: '4px',
            fontSize: '10px',
            color: 'var(--muted)',
          }}
        >
          {String(paramCount)}{' param'}{paramCount !== 1 ? 's' : ''}
        </div>

        {/* Timeout indicator */}
        {timeoutMs !== undefined && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 6px',
              background: 'color-mix(in srgb, var(--muted) 10%, transparent)',
              borderRadius: '4px',
              fontSize: '10px',
              color: 'var(--muted)',
            }}
          >
            <Clock style={{ width: 10, height: 10 }} />
            {String(timeoutMs / 1000)}{'s'}
          </div>
        )}

        {/* Include in context */}
        {nodeData.includeInContext && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 6px',
              background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
              borderRadius: '4px',
              fontSize: '10px',
              color: 'var(--accent)',
            }}
          >
            {'In context'}
          </div>
        )}
      </div>

      {/* Server URL (if shown) */}
      {serverUrlDisplay && (
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
          {serverUrlDisplay}
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
            return outputStr.length > 40 ? outputStr.slice(0, 40) + '...' : outputStr
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
    </div>
  )
})

McpToolNode.displayName = 'McpToolNode'

export { McpToolNodeProperties } from './McpToolNodeProperties'

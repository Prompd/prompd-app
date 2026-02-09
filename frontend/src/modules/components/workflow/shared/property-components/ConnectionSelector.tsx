/**
 * ConnectionSelector - Dropdown to select an external connection for this node
 * Used for nodes that need to connect to external services (SSH, Database, HTTP API, etc.)
 */

import { Link2 } from 'lucide-react'
import { useFilteredConnections, useConnection } from '../hooks/useNodeConnections'
import type { WorkflowConnectionType } from '../../../../services/workflowTypes'
import { labelStyle, selectStyle } from '../styles/propertyStyles'

export interface ConnectionSelectorProps {
  connectionId?: string
  onConnectionChange: (connectionId: string | undefined) => void
  /** Optional filter to only show connections of certain types */
  connectionTypes?: WorkflowConnectionType[]
  /** Label override */
  label?: string
}

export function ConnectionSelector({
  connectionId,
  onConnectionChange,
  connectionTypes,
  label = 'Connection',
}: ConnectionSelectorProps) {
  const filteredConnections = useFilteredConnections(connectionTypes)
  const selectedConnection = useConnection(connectionId)

  if (filteredConnections.length === 0) {
    return null // Don't show if no connections exist
  }

  // Status indicator colors
  const statusColors: Record<string, string> = {
    disconnected: 'var(--muted)',
    connecting: 'var(--warning)',
    connected: 'var(--success)',
    error: 'var(--error)',
  }

  // Type labels
  const typeLabels: Record<string, string> = {
    ssh: 'SSH',
    database: 'Database',
    'http-api': 'HTTP API',
    slack: 'Slack',
    github: 'GitHub',
    'mcp-server': 'MCP Server',
    websocket: 'WebSocket',
    'web-search': 'Web Search',
    custom: 'Custom',
  }

  return (
    <div>
      <label style={labelStyle}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Link2 size={12} style={{ color: 'var(--node-cyan)' }} />
          {label}
        </span>
      </label>
      <select
        value={connectionId || ''}
        onChange={(e) => onConnectionChange(e.target.value || undefined)}
        style={selectStyle}
      >
        <option value="">None</option>
        {filteredConnections.map(conn => (
          <option key={conn.id} value={conn.id}>
            {conn.name} ({typeLabels[conn.type] || conn.type})
          </option>
        ))}
      </select>
      {selectedConnection && (
        <div style={{
          marginTop: '8px',
          padding: '8px',
          background: 'color-mix(in srgb, var(--node-cyan) 10%, transparent)',
          borderRadius: '6px',
          fontSize: '11px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: statusColors[selectedConnection.status] || 'var(--muted)',
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{ fontWeight: 500, color: 'var(--text)' }}>
              {typeLabels[selectedConnection.type] || selectedConnection.type}
            </div>
            <div style={{ color: 'var(--text-secondary)' }}>
              {selectedConnection.status.charAt(0).toUpperCase() + selectedConnection.status.slice(1)}
              {selectedConnection.lastError && selectedConnection.status === 'error' && (
                <span style={{ color: 'var(--error)' }}> - {selectedConnection.lastError}</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

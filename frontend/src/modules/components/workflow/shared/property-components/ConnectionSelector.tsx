/**
 * ConnectionSelector - Dropdown to select an external connection for this node
 *
 * Supports two modes:
 * 1. Explicit: Pass `connectionTypes` to filter by specific types
 * 2. Auto: Pass `nodeType` and the component maps it to relevant connection types
 *
 * Returns null when no matching connections exist (no UI pollution).
 */

import { Link2, Settings } from 'lucide-react'
import { useFilteredConnections, useConnection } from '../hooks/useNodeConnections'
import { useUIStore } from '../../../../../stores/uiStore'
import type { WorkflowConnectionType } from '../../../../services/workflowTypes'
import { labelStyle, selectStyle } from '../styles/propertyStyles'

/** Maps workflow node types to their relevant connection types */
const NODE_CONNECTION_MAP: Record<string, WorkflowConnectionType[]> = {
  'api':            ['http-api'],
  'web-search':     ['web-search'],
  'database-query': ['database'],
  'command':        ['ssh'],
  'claude-code':    ['ssh'],
  'tool':           ['http-api', 'mcp-server'],
  'mcp-tool':       ['mcp-server'],
  'agent':          ['http-api'],
  'websocket':      ['websocket'],
}

/** Contextual labels based on node type */
const NODE_CONNECTION_LABELS: Record<string, string> = {
  'api':            'HTTP Connection',
  'web-search':     'Search Connection',
  'database-query': 'Database Connection',
  'command':        'SSH Connection',
  'claude-code':    'SSH Connection',
  'tool':           'Connection',
  'mcp-tool':       'MCP Connection',
  'agent':          'HTTP Connection',
  'websocket':      'WebSocket Connection',
}

export interface ConnectionSelectorProps {
  connectionId?: string
  onConnectionChange: (connectionId: string | undefined) => void
  /** Explicit filter to only show connections of certain types (takes precedence over nodeType) */
  connectionTypes?: WorkflowConnectionType[]
  /** Workflow node type - auto-determines connectionTypes and label from internal mapping */
  nodeType?: string
  /** Label override (highest precedence) */
  label?: string
}

export function ConnectionSelector({
  connectionId,
  onConnectionChange,
  connectionTypes,
  nodeType,
  label,
}: ConnectionSelectorProps) {
  // Resolve connection types: explicit > nodeType mapping > undefined (show all)
  const resolvedTypes = connectionTypes ?? (nodeType ? NODE_CONNECTION_MAP[nodeType] : undefined)

  // Resolve label: explicit > nodeType mapping > default
  const resolvedLabel = label ?? (nodeType ? NODE_CONNECTION_LABELS[nodeType] : undefined) ?? 'Connection'

  // ALL hooks must be called unconditionally (React rules of hooks)
  const filteredConnections = useFilteredConnections(resolvedTypes)
  const selectedConnection = useConnection(connectionId)
  const setShowConnectionsPanel = useUIStore(state => state.setShowConnectionsPanel)

  // If nodeType was provided but has no mapping, don't render
  if (nodeType && !connectionTypes && !NODE_CONNECTION_MAP[nodeType]) {
    return null
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
      <label style={{
        ...labelStyle,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Link2 size={12} style={{ color: 'var(--node-cyan)' }} />
          {resolvedLabel}
        </span>
        <button
          onClick={() => setShowConnectionsPanel(true)}
          title="Manage connections"
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '2px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--muted)',
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--muted)' }}
        >
          <Settings size={12} />
        </button>
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

/**
 * ConnectionsPanel - Sidebar panel for managing external connections and commands
 *
 * Redesigned with a segmented control to switch between:
 * - Connections: External services (SSH, Database, HTTP API, etc.)
 * - Commands: Shell executables (built-in and custom)
 *
 * Features:
 * - Segmented tab interface for clear separation
 * - Search/filter within each section
 * - Grouped lists with expand/collapse
 * - Live status indicators
 * - Quick actions (test, edit, delete)
 */

import { useState, useMemo, useCallback } from 'react'
import {
  X,
  Plus,
  Search,
  Server,
  Database,
  Globe,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Settings,
  RefreshCw,
  Link2,
  Terminal,
  Trash2,
  Shield,
  Edit2,
  Play,
  CheckCircle,
  AlertCircle,
  Zap,
} from 'lucide-react'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import type {
  WorkflowConnection,
  WorkflowConnectionType,
  WorkflowConnectionStatus,
  CustomCommandConfig,
} from '../../../services/workflowTypes'
import { BUILTIN_COMMAND_EXECUTABLES } from '../../../services/workflowTypes'
import { AddConnectionDialog } from './AddConnectionDialog'
import { ConnectionSettingsDialog } from './ConnectionSettingsDialog'

// Re-export types for convenience
export type { WorkflowConnection, WorkflowConnectionType, WorkflowConnectionStatus }

// ============================================================================
// Types
// ============================================================================

type PanelTab = 'connections' | 'commands'

// ============================================================================
// Connection Type Metadata
// ============================================================================

const CONNECTION_TYPE_INFO: Record<WorkflowConnectionType, {
  label: string
  icon: typeof Server
  color: string
  description: string
}> = {
  ssh: {
    label: 'SSH',
    icon: Server,
    color: 'var(--node-purple, #a855f7)',
    description: 'SSH connection to remote server',
  },
  database: {
    label: 'Database',
    icon: Database,
    color: 'var(--node-blue, #3b82f6)',
    description: 'Database connection (PostgreSQL, MySQL, MongoDB, etc.)',
  },
  'http-api': {
    label: 'HTTP API',
    icon: Globe,
    color: 'var(--node-emerald, #10b981)',
    description: 'REST API with authentication',
  },
  slack: {
    label: 'Slack',
    icon: MessageSquare,
    color: 'var(--node-purple, #a855f7)',
    description: 'Slack workspace connection',
  },
  github: {
    label: 'GitHub',
    icon: Globe,
    color: 'var(--node-gray, #6b7280)',
    description: 'GitHub API connection',
  },
  'mcp-server': {
    label: 'MCP Server',
    icon: Link2,
    color: 'var(--node-cyan, #06b6d4)',
    description: 'External MCP server',
  },
  websocket: {
    label: 'WebSocket',
    icon: RefreshCw,
    color: 'var(--node-orange, #f97316)',
    description: 'WebSocket connection',
  },
  'web-search': {
    label: 'Web Search',
    icon: Search,
    color: 'var(--node-sky, #0ea5e9)',
    description: 'Web search provider',
  },
  custom: {
    label: 'Custom',
    icon: Settings,
    color: 'var(--muted)',
    description: 'Custom connection type',
  },
}

const STATUS_COLORS: Record<WorkflowConnectionStatus, string> = {
  disconnected: 'var(--muted)',
  connecting: 'var(--warning, #f59e0b)',
  connected: 'var(--success)',
  error: 'var(--error)',
}

// ============================================================================
// Shared Styles
// ============================================================================

const panelStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--panel)',
  borderLeft: '1px solid var(--border)',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px',
  borderBottom: '1px solid var(--border)',
}

const segmentedControlStyle: React.CSSProperties = {
  display: 'flex',
  padding: '4px',
  margin: '12px 12px 0',
  background: 'var(--bg)',
  borderRadius: '8px',
  gap: '4px',
}

const segmentButtonStyle = (isActive: boolean): React.CSSProperties => ({
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '8px 12px',
  border: 'none',
  borderRadius: '6px',
  background: isActive ? 'var(--panel)' : 'transparent',
  color: isActive ? 'var(--text)' : 'var(--text-secondary)',
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
})

const searchContainerStyle: React.CSSProperties = {
  padding: '12px',
}

const searchInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px 8px 32px',
  border: '1px solid var(--input-border)',
  borderRadius: '6px',
  background: 'var(--input-bg)',
  color: 'var(--text)',
  fontSize: '13px',
}

const listContainerStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '0 8px 8px',
}

const groupHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 12px',
  cursor: 'pointer',
  borderRadius: '6px',
  marginBottom: '4px',
}

const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '10px 12px',
  borderRadius: '6px',
  cursor: 'pointer',
  marginBottom: '4px',
  marginLeft: '12px',
  transition: 'background 0.1s ease',
}

const buttonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '6px 12px',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 500,
}

const iconButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: '4px',
  cursor: 'pointer',
  color: 'var(--muted)',
  opacity: 0.6,
  borderRadius: '4px',
  transition: 'all 0.1s ease',
}

// ============================================================================
// Status Indicator Component
// ============================================================================

interface StatusIndicatorProps {
  status: WorkflowConnectionStatus
  size?: number
}

function StatusIndicator({ status, size = 8 }: StatusIndicatorProps) {
  const color = STATUS_COLORS[status]
  const isAnimating = status === 'connecting'

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
        animation: isAnimating ? 'pulse 1.5s ease-in-out infinite' : undefined,
      }}
      title={status.charAt(0).toUpperCase() + status.slice(1)}
    />
  )
}

// ============================================================================
// Connection Group Component
// ============================================================================

interface ConnectionGroupProps {
  type: WorkflowConnectionType
  connections: WorkflowConnection[]
  isExpanded: boolean
  onToggle: () => void
  onSelect: (connection: WorkflowConnection) => void
  onSettings: (connection: WorkflowConnection) => void
  selectedId?: string
}

function ConnectionGroup({
  type,
  connections,
  isExpanded,
  onToggle,
  onSelect,
  onSettings,
  selectedId,
}: ConnectionGroupProps) {
  const typeInfo = CONNECTION_TYPE_INFO[type]
  const Icon = typeInfo.icon

  return (
    <div style={{ marginBottom: '4px' }}>
      {/* Group Header */}
      <div
        style={{
          ...groupHeaderStyle,
          background: isExpanded
            ? `color-mix(in srgb, ${typeInfo.color} 8%, transparent)`
            : 'transparent',
        }}
        onClick={onToggle}
        onMouseEnter={(e) => {
          if (!isExpanded) e.currentTarget.style.background = 'var(--hover)'
        }}
        onMouseLeave={(e) => {
          if (!isExpanded) e.currentTarget.style.background = 'transparent'
        }}
      >
        {isExpanded ? (
          <ChevronDown style={{ width: 14, height: 14, color: 'var(--muted)' }} />
        ) : (
          <ChevronRight style={{ width: 14, height: 14, color: 'var(--muted)' }} />
        )}
        <Icon style={{ width: 14, height: 14, color: typeInfo.color }} />
        <span style={{ flex: 1, fontSize: '12px', fontWeight: 500, color: 'var(--text)' }}>
          {typeInfo.label}
        </span>
        <span
          style={{
            fontSize: '11px',
            color: 'var(--text-secondary)',
            background: 'var(--bg)',
            padding: '2px 6px',
            borderRadius: '4px',
            minWidth: '20px',
            textAlign: 'center',
          }}
        >
          {connections.length}
        </span>
      </div>

      {/* Connection Items */}
      {isExpanded && connections.map(conn => (
        <div
          key={conn.id}
          style={{
            ...itemStyle,
            background: selectedId === conn.id
              ? `color-mix(in srgb, ${typeInfo.color} 12%, transparent)`
              : 'transparent',
            border: selectedId === conn.id
              ? `1px solid ${typeInfo.color}`
              : '1px solid transparent',
          }}
          onClick={() => onSelect(conn)}
          onMouseEnter={(e) => {
            if (selectedId !== conn.id) e.currentTarget.style.background = 'var(--hover)'
          }}
          onMouseLeave={(e) => {
            if (selectedId !== conn.id) e.currentTarget.style.background = 'transparent'
          }}
        >
          <StatusIndicator status={conn.status} />
          <span style={{ flex: 1, fontSize: '12px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {conn.name}
            <span
              style={{
                fontSize: '9px',
                padding: '1px 5px',
                borderRadius: '3px',
                fontWeight: 500,
                background: conn.scope === 'global'
                  ? 'color-mix(in srgb, var(--node-amber, #f59e0b) 15%, transparent)'
                  : 'color-mix(in srgb, var(--accent) 15%, transparent)',
                color: conn.scope === 'global'
                  ? 'var(--node-amber, #f59e0b)'
                  : 'var(--accent)',
              }}
              title={conn.scope === 'global' ? 'Saved in ~/.prompd/connections.json' : 'Saved in .prompd/connections.json'}
            >
              {conn.scope === 'global' ? 'Global' : 'Workspace'}
            </span>
          </span>
          <button
            style={iconButtonStyle}
            onClick={(e) => {
              e.stopPropagation()
              onSettings(conn)
            }}
            title="Settings"
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '1'
              e.currentTarget.style.background = 'var(--hover)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '0.6'
              e.currentTarget.style.background = 'none'
            }}
          >
            <Settings style={{ width: 12, height: 12 }} />
          </button>
        </div>
      ))}

      {/* Empty State */}
      {isExpanded && connections.length === 0 && (
        <div
          style={{
            padding: '12px 12px 12px 36px',
            fontSize: '11px',
            color: 'var(--muted)',
            fontStyle: 'italic',
          }}
        >
          No {typeInfo.label.toLowerCase()} connections
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Connections Tab Content
// ============================================================================

interface ConnectionsTabProps {
  searchQuery: string
  onAddConnection: () => void
}

function ConnectionsTab({ searchQuery, onAddConnection }: ConnectionsTabProps) {
  const [expandedTypes, setExpandedTypes] = useState<Set<WorkflowConnectionType>>(
    new Set(['ssh', 'database', 'http-api'])
  )
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | undefined>()
  const [settingsConnection, setSettingsConnection] = useState<WorkflowConnection | null>(null)

  const connections = useWorkflowStore(state => state.connections ?? [])

  // Group connections by type
  const connectionsByType = useMemo(() => {
    const groups: Record<WorkflowConnectionType, WorkflowConnection[]> = {
      ssh: [],
      database: [],
      'http-api': [],
      slack: [],
      github: [],
      'mcp-server': [],
      websocket: [],
      'web-search': [],
      custom: [],
    }

    const query = searchQuery.toLowerCase()
    for (const conn of connections) {
      if (query && !conn.name.toLowerCase().includes(query)) {
        continue
      }
      groups[conn.type].push(conn)
    }

    return groups
  }, [connections, searchQuery])

  // Order types by those with connections first
  const orderedTypes = useMemo(() => {
    const types = Object.keys(connectionsByType) as WorkflowConnectionType[]
    return types.sort((a, b) => {
      const aCount = connectionsByType[a].length
      const bCount = connectionsByType[b].length
      if (aCount > 0 && bCount === 0) return -1
      if (aCount === 0 && bCount > 0) return 1
      return 0
    })
  }, [connectionsByType])

  const toggleExpanded = useCallback((type: WorkflowConnectionType) => {
    setExpandedTypes(prev => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }, [])

  const totalConnections = connections.length
  const hasResults = Object.values(connectionsByType).some(arr => arr.length > 0)

  return (
    <>
      {orderedTypes.map(type => (
        <ConnectionGroup
          key={type}
          type={type}
          connections={connectionsByType[type]}
          isExpanded={expandedTypes.has(type)}
          onToggle={() => toggleExpanded(type)}
          onSelect={(conn) => setSelectedConnectionId(conn.id)}
          onSettings={(conn) => setSettingsConnection(conn)}
          selectedId={selectedConnectionId}
        />
      ))}

      {/* Empty State */}
      {totalConnections === 0 && !searchQuery && (
        <div
          style={{
            textAlign: 'center',
            padding: '40px 16px',
            color: 'var(--muted)',
          }}
        >
          <Link2 style={{ width: 32, height: 32, marginBottom: '12px', opacity: 0.4 }} />
          <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '8px', color: 'var(--text-secondary)' }}>
            No connections yet
          </div>
          <div style={{ fontSize: '12px', marginBottom: '16px', lineHeight: 1.5 }}>
            Add connections to SSH servers,<br />databases, and external APIs.
          </div>
          <button
            style={{
              ...buttonStyle,
              background: 'var(--accent)',
              color: 'white',
            }}
            onClick={onAddConnection}
          >
            <Plus style={{ width: 14, height: 14 }} />
            Add Connection
          </button>
        </div>
      )}

      {/* No Results */}
      {totalConnections > 0 && searchQuery && !hasResults && (
        <div
          style={{
            textAlign: 'center',
            padding: '32px 16px',
            color: 'var(--muted)',
          }}
        >
          <Search style={{ width: 24, height: 24, marginBottom: '8px', opacity: 0.4 }} />
          <div style={{ fontSize: '12px' }}>
            No connections matching "{searchQuery}"
          </div>
        </div>
      )}

      {/* Settings Dialog */}
      {settingsConnection && (
        <ConnectionSettingsDialog
          connection={settingsConnection}
          onClose={() => setSettingsConnection(null)}
        />
      )}
    </>
  )
}

// ============================================================================
// Commands Tab Content
// ============================================================================

interface CommandsTabProps {
  searchQuery: string
  onAddCommand: () => void
}

function CommandsTab({ searchQuery, onAddCommand }: CommandsTabProps) {
  const customCommands = useWorkflowStore(state => state.customCommands ?? [])
  const deleteCustomCommand = useWorkflowStore(state => state.deleteCustomCommand)
  const [builtinExpanded, setBuiltinExpanded] = useState(true)
  const [customExpanded, setCustomExpanded] = useState(true)
  const [editingCommand, setEditingCommand] = useState<CustomCommandConfig | null>(null)

  const query = searchQuery.toLowerCase()

  // Filter built-in commands
  const filteredBuiltin = useMemo(() => {
    if (!query) return BUILTIN_COMMAND_EXECUTABLES
    return BUILTIN_COMMAND_EXECUTABLES.filter(
      cmd => cmd.executable.toLowerCase().includes(query) ||
             cmd.description?.toLowerCase().includes(query)
    )
  }, [query])

  // Filter custom commands
  const filteredCustom = useMemo(() => {
    if (!query) return customCommands
    return customCommands.filter(
      cmd => cmd.executable.toLowerCase().includes(query) ||
             cmd.description?.toLowerCase().includes(query)
    )
  }, [customCommands, query])

  const builtinColor = 'var(--node-slate, #64748b)'
  const customColor = 'var(--node-amber, #f59e0b)'

  return (
    <>
      {/* Built-in Commands Section */}
      <div style={{ marginBottom: '4px' }}>
        <div
          style={{
            ...groupHeaderStyle,
            background: builtinExpanded
              ? `color-mix(in srgb, ${builtinColor} 8%, transparent)`
              : 'transparent',
          }}
          onClick={() => setBuiltinExpanded(!builtinExpanded)}
          onMouseEnter={(e) => {
            if (!builtinExpanded) e.currentTarget.style.background = 'var(--hover)'
          }}
          onMouseLeave={(e) => {
            if (!builtinExpanded) e.currentTarget.style.background = 'transparent'
          }}
        >
          {builtinExpanded ? (
            <ChevronDown style={{ width: 14, height: 14, color: 'var(--muted)' }} />
          ) : (
            <ChevronRight style={{ width: 14, height: 14, color: 'var(--muted)' }} />
          )}
          <Terminal style={{ width: 14, height: 14, color: builtinColor }} />
          <span style={{ flex: 1, fontSize: '12px', fontWeight: 500, color: 'var(--text)' }}>
            Built-in
          </span>
          <span
            style={{
              fontSize: '11px',
              color: 'var(--text-secondary)',
              background: 'var(--bg)',
              padding: '2px 6px',
              borderRadius: '4px',
              minWidth: '20px',
              textAlign: 'center',
            }}
          >
            {filteredBuiltin.length}
          </span>
        </div>

        {builtinExpanded && filteredBuiltin.map(cmd => (
          <div
            key={cmd.executable}
            style={{
              ...itemStyle,
              cursor: 'default',
            }}
          >
            <CheckCircle style={{ width: 12, height: 12, color: 'var(--success)', opacity: 0.7 }} />
            <code
              style={{
                fontSize: '12px',
                color: 'var(--text)',
                fontFamily: 'var(--font-mono)',
                background: 'var(--bg)',
                padding: '2px 6px',
                borderRadius: '4px',
              }}
            >
              {cmd.executable}
            </code>
            <span
              style={{
                flex: 1,
                fontSize: '11px',
                color: 'var(--text-secondary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={cmd.description}
            >
              {cmd.description}
            </span>
          </div>
        ))}

        {builtinExpanded && filteredBuiltin.length === 0 && (
          <div
            style={{
              padding: '12px 12px 12px 36px',
              fontSize: '11px',
              color: 'var(--muted)',
              fontStyle: 'italic',
            }}
          >
            No built-in commands match "{searchQuery}"
          </div>
        )}
      </div>

      {/* Custom Commands Section */}
      <div style={{ marginBottom: '4px' }}>
        <div
          style={{
            ...groupHeaderStyle,
            background: customExpanded
              ? `color-mix(in srgb, ${customColor} 8%, transparent)`
              : 'transparent',
          }}
          onClick={() => setCustomExpanded(!customExpanded)}
          onMouseEnter={(e) => {
            if (!customExpanded) e.currentTarget.style.background = 'var(--hover)'
          }}
          onMouseLeave={(e) => {
            if (!customExpanded) e.currentTarget.style.background = 'transparent'
          }}
        >
          {customExpanded ? (
            <ChevronDown style={{ width: 14, height: 14, color: 'var(--muted)' }} />
          ) : (
            <ChevronRight style={{ width: 14, height: 14, color: 'var(--muted)' }} />
          )}
          <Zap style={{ width: 14, height: 14, color: customColor }} />
          <span style={{ flex: 1, fontSize: '12px', fontWeight: 500, color: 'var(--text)' }}>
            Custom
          </span>
          <button
            style={{
              ...buttonStyle,
              padding: '2px 8px',
              background: `color-mix(in srgb, ${customColor} 15%, transparent)`,
              color: customColor,
              fontSize: '11px',
            }}
            onClick={(e) => {
              e.stopPropagation()
              onAddCommand()
            }}
          >
            <Plus style={{ width: 10, height: 10 }} />
            Add
          </button>
        </div>

        {customExpanded && filteredCustom.map(cmd => (
          <div
            key={cmd.id}
            style={{
              ...itemStyle,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--hover)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <Terminal style={{ width: 12, height: 12, color: customColor }} />
            <code
              style={{
                fontSize: '12px',
                color: 'var(--text)',
                fontFamily: 'var(--font-mono)',
                background: `color-mix(in srgb, ${customColor} 10%, var(--bg))`,
                padding: '2px 6px',
                borderRadius: '4px',
              }}
            >
              {cmd.executable}
            </code>
            <span
              style={{
                flex: 1,
                fontSize: '11px',
                color: 'var(--text-secondary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={cmd.description}
            >
              {cmd.description || 'No description'}
            </span>
            {cmd.requiresApproval && (
              <span title="Requires approval before execution">
                <Shield style={{ width: 12, height: 12, color: 'var(--warning)' }} />
              </span>
            )}
            <button
              style={iconButtonStyle}
              onClick={() => setEditingCommand(cmd)}
              title="Edit"
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '1'
                e.currentTarget.style.background = 'var(--hover)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '0.6'
                e.currentTarget.style.background = 'none'
              }}
            >
              <Edit2 style={{ width: 12, height: 12 }} />
            </button>
            <button
              style={{ ...iconButtonStyle, color: 'var(--error)' }}
              onClick={() => deleteCustomCommand(cmd.id)}
              title="Delete"
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '1'
                e.currentTarget.style.background = 'color-mix(in srgb, var(--error) 10%, transparent)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '0.6'
                e.currentTarget.style.background = 'none'
              }}
            >
              <Trash2 style={{ width: 12, height: 12 }} />
            </button>
          </div>
        ))}

        {customExpanded && filteredCustom.length === 0 && !searchQuery && (
          <div
            style={{
              textAlign: 'center',
              padding: '24px 16px',
              marginLeft: '12px',
            }}
          >
            <Terminal style={{ width: 24, height: 24, marginBottom: '8px', opacity: 0.3, color: 'var(--muted)' }} />
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>
              Define custom executables for<br />your workflow automation
            </div>
            <button
              style={{
                ...buttonStyle,
                background: `color-mix(in srgb, ${customColor} 15%, transparent)`,
                color: customColor,
                fontSize: '11px',
              }}
              onClick={onAddCommand}
            >
              <Plus style={{ width: 12, height: 12 }} />
              Add Command
            </button>
          </div>
        )}

        {customExpanded && filteredCustom.length === 0 && searchQuery && (
          <div
            style={{
              padding: '12px 12px 12px 36px',
              fontSize: '11px',
              color: 'var(--muted)',
              fontStyle: 'italic',
            }}
          >
            No custom commands match "{searchQuery}"
          </div>
        )}
      </div>

      {/* Edit Command Dialog */}
      {editingCommand && (
        <AddCommandDialog
          editCommand={editingCommand}
          onClose={() => setEditingCommand(null)}
        />
      )}
    </>
  )
}

// ============================================================================
// Add Command Dialog
// ============================================================================

interface AddCommandDialogProps {
  onClose: () => void
  editCommand?: CustomCommandConfig | null
}

function AddCommandDialog({ onClose, editCommand }: AddCommandDialogProps) {
  const addCustomCommand = useWorkflowStore(state => state.addCustomCommand)
  const updateCustomCommand = useWorkflowStore(state => state.updateCustomCommand)

  const [executable, setExecutable] = useState(editCommand?.executable ?? '')
  const [description, setDescription] = useState(editCommand?.description ?? '')
  const [allowedActions, setAllowedActions] = useState(
    editCommand?.allowedActions?.join(', ') ?? ''
  )
  const [requiresApproval, setRequiresApproval] = useState(
    editCommand?.requiresApproval ?? true
  )

  const handleSave = () => {
    if (!executable.trim()) return

    const commandData = {
      executable: executable.trim(),
      description: description.trim() || undefined,
      allowedActions: allowedActions
        ? allowedActions.split(',').map(s => s.trim()).filter(Boolean)
        : undefined,
      requiresApproval,
    }

    if (editCommand) {
      updateCustomCommand(editCommand.id, commandData)
    } else {
      addCustomCommand(commandData)
    }
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: 'var(--panel)',
          borderRadius: '12px',
          padding: '24px',
          width: '420px',
          maxWidth: '90vw',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '8px',
              background: 'color-mix(in srgb, var(--node-amber) 15%, transparent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Terminal style={{ width: 16, height: 16, color: 'var(--node-amber)' }} />
          </div>
          <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text)' }}>
            {editCommand ? 'Edit Command' : 'Add Custom Command'}
          </h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Executable */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--text-secondary)',
                marginBottom: '6px',
              }}
            >
              Executable *
            </label>
            <input
              type="text"
              value={executable}
              onChange={(e) => setExecutable(e.target.value)}
              placeholder="e.g., cargo, terraform, kubectl"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid var(--input-border)',
                borderRadius: '6px',
                background: 'var(--input-bg)',
                color: 'var(--text)',
                fontSize: '13px',
                fontFamily: 'var(--font-mono)',
              }}
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--text-secondary)',
                marginBottom: '6px',
              }}
            >
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this command do?"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid var(--input-border)',
                borderRadius: '6px',
                background: 'var(--input-bg)',
                color: 'var(--text)',
                fontSize: '13px',
              }}
            />
          </div>

          {/* Allowed Actions */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--text-secondary)',
                marginBottom: '6px',
              }}
            >
              Allowed Subcommands
            </label>
            <input
              type="text"
              value={allowedActions}
              onChange={(e) => setAllowedActions(e.target.value)}
              placeholder="e.g., build, test, run (comma-separated)"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid var(--input-border)',
                borderRadius: '6px',
                background: 'var(--input-bg)',
                color: 'var(--text)',
                fontSize: '13px',
              }}
            />
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
              Leave empty to allow any subcommand
            </div>
          </div>

          {/* Requires Approval */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px',
              background: 'var(--bg)',
              borderRadius: '6px',
            }}
          >
            <input
              type="checkbox"
              id="requiresApproval"
              checked={requiresApproval}
              onChange={(e) => setRequiresApproval(e.target.checked)}
              style={{ width: '16px', height: '16px', accentColor: 'var(--warning)' }}
            />
            <label
              htmlFor="requiresApproval"
              style={{ fontSize: '12px', color: 'var(--text)', cursor: 'pointer' }}
            >
              <Shield style={{ width: 12, height: 12, color: 'var(--warning)', marginRight: '6px', verticalAlign: 'middle' }} />
              Require approval before execution
            </label>
          </div>
        </div>

        {/* Buttons */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
            marginTop: '24px',
          }}
        >
          <button
            style={{
              ...buttonStyle,
              background: 'transparent',
              color: 'var(--muted)',
              border: '1px solid var(--border)',
              padding: '8px 16px',
            }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            style={{
              ...buttonStyle,
              background: executable.trim() ? 'var(--accent)' : 'var(--muted)',
              color: 'white',
              padding: '8px 16px',
              opacity: executable.trim() ? 1 : 0.5,
              cursor: executable.trim() ? 'pointer' : 'not-allowed',
            }}
            onClick={handleSave}
            disabled={!executable.trim()}
          >
            {editCommand ? 'Save Changes' : 'Add Command'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

interface ConnectionsPanelProps {
  onClose?: () => void
}

export function ConnectionsPanel({ onClose }: ConnectionsPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>('connections')
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showAddCommandDialog, setShowAddCommandDialog] = useState(false)

  // Get counts for tab badges
  const connections = useWorkflowStore(state => state.connections ?? [])
  const customCommands = useWorkflowStore(state => state.customCommands ?? [])

  const connectionCount = connections.length
  const commandCount = BUILTIN_COMMAND_EXECUTABLES.length + customCommands.length

  const handleAdd = useCallback(() => {
    if (activeTab === 'connections') {
      setShowAddDialog(true)
    } else {
      setShowAddCommandDialog(true)
    }
  }, [activeTab])

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
            Resources
          </h3>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Connections & Commands
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            style={{
              ...buttonStyle,
              background: 'var(--accent)',
              color: 'white',
            }}
            onClick={handleAdd}
            title={activeTab === 'connections' ? 'Add Connection' : 'Add Command'}
          >
            <Plus style={{ width: 14, height: 14 }} />
            New
          </button>
          {onClose && (
            <button
              style={{
                ...buttonStyle,
                background: 'transparent',
                color: 'var(--muted)',
                padding: '6px',
              }}
              onClick={onClose}
            >
              <X style={{ width: 16, height: 16 }} />
            </button>
          )}
        </div>
      </div>

      {/* Segmented Control */}
      <div style={segmentedControlStyle}>
        <button
          style={segmentButtonStyle(activeTab === 'connections')}
          onClick={() => setActiveTab('connections')}
        >
          <Link2 style={{ width: 14, height: 14 }} />
          Connections
          <span
            style={{
              fontSize: '10px',
              background: activeTab === 'connections' ? 'var(--bg)' : 'transparent',
              padding: '1px 5px',
              borderRadius: '4px',
              color: 'var(--text-secondary)',
            }}
          >
            {connectionCount}
          </span>
        </button>
        <button
          style={segmentButtonStyle(activeTab === 'commands')}
          onClick={() => setActiveTab('commands')}
        >
          <Terminal style={{ width: 14, height: 14 }} />
          Commands
          <span
            style={{
              fontSize: '10px',
              background: activeTab === 'commands' ? 'var(--bg)' : 'transparent',
              padding: '1px 5px',
              borderRadius: '4px',
              color: 'var(--text-secondary)',
            }}
          >
            {commandCount}
          </span>
        </button>
      </div>

      {/* Search */}
      <div style={searchContainerStyle}>
        <div style={{ position: 'relative' }}>
          <Search
            style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: 14,
              height: 14,
              color: 'var(--muted)',
            }}
          />
          <input
            type="text"
            placeholder={activeTab === 'connections' ? 'Search connections...' : 'Search commands...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={searchInputStyle}
          />
        </div>
      </div>

      {/* Content */}
      <div style={listContainerStyle}>
        {activeTab === 'connections' ? (
          <ConnectionsTab
            searchQuery={searchQuery}
            onAddConnection={() => setShowAddDialog(true)}
          />
        ) : (
          <CommandsTab
            searchQuery={searchQuery}
            onAddCommand={() => setShowAddCommandDialog(true)}
          />
        )}
      </div>

      {/* Add Connection Dialog */}
      {showAddDialog && (
        <AddConnectionDialog onClose={() => setShowAddDialog(false)} />
      )}

      {/* Add Command Dialog */}
      {showAddCommandDialog && (
        <AddCommandDialog onClose={() => setShowAddCommandDialog(false)} />
      )}
    </div>
  )
}

export default ConnectionsPanel

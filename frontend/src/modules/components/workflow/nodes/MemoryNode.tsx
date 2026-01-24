/**
 * MemoryNode - Configurable memory storage node
 *
 * Supports multiple memory patterns:
 * - 'kv': Key-value store for passing state between nodes
 * - 'conversation': Message history with sliding window for chat context
 * - 'cache': Time-based caching for expensive operations
 */

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Database, CheckCircle, XCircle, Loader2, Key, MessageSquare, Clock } from 'lucide-react'
import type { MemoryNodeData, BaseNodeData } from '../../../services/workflowTypes'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import { getNodeColor } from '../nodeColors'

interface MemoryNodeProps {
  id: string
  data: BaseNodeData
  selected?: boolean
}

const MODE_CONFIG = {
  kv: {
    label: 'Key-Value',
    description: 'Dictionary storage',
    icon: Key,
    color: 'var(--node-emerald, #10b981)',
  },
  conversation: {
    label: 'Conversation',
    description: 'Message history',
    icon: MessageSquare,
    color: 'var(--node-violet, #8b5cf6)',
  },
  cache: {
    label: 'Cache',
    description: 'TTL-based storage',
    icon: Clock,
    color: 'var(--node-amber, #f59e0b)',
  },
}

const OPERATION_LABELS: Record<string, string> = {
  get: 'Get',
  set: 'Set',
  delete: 'Delete',
  clear: 'Clear',
  list: 'List Keys',
  append: 'Append',
}

export const MemoryNode = memo(({ id, data, selected }: MemoryNodeProps) => {
  const executionState = useWorkflowStore(state => state.executionState)
  const nodeState = executionState?.nodeStates[id]
  const nodeData = data as MemoryNodeData

  // Node color from central definition
  const nodeColor = getNodeColor('memory')

  const mode = nodeData.mode || 'kv'
  // Support both old 'operation' (single) and new 'operations' (array) for backward compatibility
  const operations: string[] = nodeData.operations || (nodeData as { operation?: string }).operation ? [(nodeData as { operation?: string }).operation!] : ['get']
  const modeConfig = MODE_CONFIG[mode] || MODE_CONFIG.kv
  const ModeIcon = modeConfig.icon

  // Status-based styling
  const getStatusIcon = () => {
    if (!nodeState) return null

    switch (nodeState.status) {
      case 'running':
        return <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} />
      case 'completed':
        return <CheckCircle style={{ width: 12, height: 12, color: 'var(--success)' }} />
      case 'failed':
        return <XCircle style={{ width: 12, height: 12, color: 'var(--error)' }} />
      default:
        return null
    }
  }

  const getStatusBorderColor = () => {
    if (!nodeState) return null
    switch (nodeState.status) {
      case 'running':
        return 'var(--warning)'
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

  // Get descriptive preview based on mode and operations
  const getPreview = (): string => {
    // For multiple operations, show a summary
    if (operations.length > 1) {
      return operations.map(op => OPERATION_LABELS[op] || op).join(', ')
    }

    // For single operation, show detailed preview
    const operation = operations[0]
    switch (mode) {
      case 'kv':
        if (operation === 'get') return nodeData.key ? `Get "${nodeData.key}"` : 'Get value by key'
        if (operation === 'set') return nodeData.key ? `Set "${nodeData.key}"` : 'Set key-value'
        if (operation === 'delete') return nodeData.key ? `Delete "${nodeData.key}"` : 'Delete key'
        if (operation === 'list') return 'List all keys'
        if (operation === 'clear') return 'Clear all data'
        break
      case 'conversation':
        if (operation === 'get') return nodeData.conversationId ? `Get "${nodeData.conversationId}"` : 'Get conversation'
        if (operation === 'append') return `Append ${nodeData.messageRole || 'message'}`
        if (operation === 'clear') return 'Clear conversation'
        break
      case 'cache':
        if (operation === 'get') return nodeData.key ? `Get "${nodeData.key}"` : 'Get cached value'
        if (operation === 'set') {
          const ttl = nodeData.ttlSeconds ? ` (${nodeData.ttlSeconds}s)` : ''
          return nodeData.key ? `Cache "${nodeData.key}"${ttl}` : `Cache value${ttl}`
        }
        if (operation === 'delete') return nodeData.key ? `Invalidate "${nodeData.key}"` : 'Invalidate cache'
        break
    }
    return OPERATION_LABELS[operation] || 'Memory operation'
  }

  // Get scope badge
  const getScopeBadge = () => {
    const scope = nodeData.scope || 'execution'
    const colors: Record<string, string> = {
      execution: 'var(--muted)',
      workflow: 'var(--node-blue)',
      global: 'var(--node-rose)',
    }
    return { label: scope, color: colors[scope] || 'var(--muted)' }
  }

  const scopeBadge = getScopeBadge()

  return (
    <div
      className={nodeData.disabled ? 'workflow-node-disabled' : ''}
      style={{
        minWidth: '180px',
        maxWidth: '260px',
        background: 'var(--panel)',
        borderRadius: '8px',
        border: `2px solid ${borderColor}`,
        boxShadow,
        overflow: 'hidden',
      }}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        style={{
          width: 10,
          height: 10,
          background: nodeColor,
          border: '2px solid var(--panel)',
        }}
      />

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        style={{
          width: 10,
          height: 10,
          background: nodeColor,
          border: '2px solid var(--panel)',
        }}
      />

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          borderBottom: '1px solid var(--border)',
          background: `color-mix(in srgb, ${nodeColor} 8%, transparent)`,
        }}
      >
        <Database style={{ width: 14, height: 14, color: nodeColor }} />
        <span
          style={{
            flex: 1,
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {nodeData.label || 'Memory'}
        </span>
        {getStatusIcon()}
      </div>

      {/* Body */}
      <div style={{ padding: '10px 12px' }}>
        {/* Mode and Operation Badges */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
          {/* Mode Badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              background: `color-mix(in srgb, ${modeConfig.color} 15%, transparent)`,
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: 500,
              color: modeConfig.color,
            }}
          >
            <ModeIcon style={{ width: 10, height: 10 }} />
            {modeConfig.label}
          </div>

          {/* Operation Badges - show all enabled operations */}
          {operations.map((op) => (
            <div
              key={op}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 8px',
                background: 'var(--panel-2)',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 500,
                color: 'var(--text-secondary)',
              }}
            >
              {OPERATION_LABELS[op] || op}
            </div>
          ))}
        </div>

        {/* Preview */}
        <div
          style={{
            padding: '6px 8px',
            background: 'var(--input-bg)',
            borderRadius: '4px',
            fontSize: '11px',
            fontFamily: 'var(--font-mono, monospace)',
            color: 'var(--text-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {getPreview()}
        </div>

        {/* Additional Info Row */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
          {/* Scope Badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '2px 6px',
              background: `color-mix(in srgb, ${scopeBadge.color} 12%, transparent)`,
              borderRadius: '4px',
              fontSize: '9px',
              color: scopeBadge.color,
              textTransform: 'capitalize',
            }}
          >
            {scopeBadge.label}
          </div>

          {/* Namespace */}
          {nodeData.namespace && (
            <span
              style={{
                fontSize: '10px',
                color: 'var(--muted)',
                fontFamily: 'monospace',
              }}
            >
              ns:{nodeData.namespace}
            </span>
          )}

          {/* TTL for cache mode */}
          {mode === 'cache' && nodeData.ttlSeconds && (
            <span
              style={{
                fontSize: '10px',
                color: 'var(--muted)',
              }}
            >
              TTL: {nodeData.ttlSeconds}s
            </span>
          )}

          {/* Max messages for conversation mode */}
          {mode === 'conversation' && nodeData.maxMessages && (
            <span
              style={{
                fontSize: '10px',
                color: 'var(--muted)',
              }}
            >
              max: {nodeData.maxMessages}
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      {(nodeData as { description?: string }).description && (
        <div
          style={{
            padding: '6px 12px 10px',
            fontSize: '11px',
            color: 'var(--text-secondary)',
            borderTop: '1px solid var(--border)',
          }}
        >
          {(nodeData as { description?: string }).description}
        </div>
      )}
    </div>
  )
})

MemoryNode.displayName = 'MemoryNode'

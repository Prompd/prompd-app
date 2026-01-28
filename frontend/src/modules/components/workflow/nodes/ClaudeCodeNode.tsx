/**
 * ClaudeCodeNode - Claude Code agent with SSH support for remote development
 *
 * This node encapsulates a full Claude Code agent that can:
 * - Connect to local or remote systems via SSH
 * - Execute multi-turn development tasks
 * - Use file editing, command execution, and web tools
 * - Stream progress back to the workflow
 *
 * Requires Electron for SSH functionality.
 */

import { memo, useMemo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Bot, Server, Monitor, CheckCircle, XCircle, Loader2, RotateCcw, Shield, FileCode } from 'lucide-react'
import type { ClaudeCodeNodeData, BaseNodeData, WorkflowConnection } from '../../../services/workflowTypes'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import { getNodeColor } from '../nodeColors'

// Handle style constants
const handleSize = 12
const handleBorder = '2px solid var(--panel)'

/** Get connection info from connectionId reference */
function useConnectionReference(connectionId: string | undefined): {
  hasConnection: boolean
  connectionName?: string
  connectionType?: 'local' | 'ssh'
  status?: WorkflowConnection['status']
} {
  const connections = useWorkflowStore(state => state.connections)

  return useMemo(() => {
    if (!connectionId) return { hasConnection: false }

    const connection = connections.find(c => c.id === connectionId)
    if (!connection) return { hasConnection: false }

    return {
      hasConnection: true,
      connectionName: connection.name,
      connectionType: connection.type === 'ssh' ? 'ssh' : 'local',
      status: connection.status
    }
  }, [connections, connectionId])
}

interface ClaudeCodeNodeProps {
  id: string
  data: BaseNodeData
  selected?: boolean
}

export const ClaudeCodeNode = memo(({ id, data, selected }: ClaudeCodeNodeProps) => {
  const executionState = useWorkflowStore(state => state.executionState)
  const nodeState = executionState?.nodeStates[id]
  const nodeData = data as ClaudeCodeNodeData

  // Get SSH connection info if using connectionId
  const sshConnectionId = nodeData.connection?.ssh?.connectionId
  const { hasConnection, connectionName, status: connectionStatus } = useConnectionReference(sshConnectionId)

  // Node color from central definition
  const nodeColor = getNodeColor('claude-code')

  // Determine connection type
  const connectionType = nodeData.connection?.type || 'local'
  const isRemote = connectionType === 'ssh'

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

  // Format task prompt for display
  const displayPrompt = nodeData.task?.prompt?.length > 60
    ? nodeData.task.prompt.slice(0, 60) + '...'
    : nodeData.task?.prompt || 'No task defined'

  // Get allowed tools info
  const allowedTools = nodeData.constraints?.allowedTools || ['read', 'write', 'execute', 'web']
  const maxTurns = nodeData.constraints?.maxTurns || 50

  // Get execution progress from state
  const executionProgress = nodeState?.output as {
    currentTurn?: number
    filesChanged?: number
    status?: string
  } | undefined

  return (
    <div
      className={nodeData.disabled ? 'workflow-node-disabled' : ''}
      style={{
        minWidth: 220,
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

      {/* Checkpoint Output Handle (bottom) - for streaming progress */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="onProgress"
        style={{
          width: handleSize,
          height: handleSize,
          background: 'var(--node-amber, #f59e0b)',
          border: handleBorder,
          left: '50%',
        }}
        title="Progress events (connect to Callback node)"
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
          <Bot style={{ width: 14, height: 14 }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
            {nodeData.label || 'Claude Code'}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
            {isRemote ? 'Remote Agent' : 'Local Agent'}
          </div>
        </div>
        {getStatusIcon()}
      </div>

      {/* Connection indicator */}
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
        {isRemote ? (
          <Server style={{ width: 12, height: 12, color: nodeColor }} />
        ) : (
          <Monitor style={{ width: 12, height: 12, color: nodeColor }} />
        )}
        <span style={{ fontSize: '10px', color: nodeColor, fontWeight: 500 }}>
          {isRemote ? (
            hasConnection ? connectionName : (nodeData.connection?.ssh?.host || 'SSH')
          ) : 'Local'}
        </span>
        {isRemote && connectionStatus && (
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
              marginLeft: 'auto',
            }}
            title={connectionStatus}
          />
        )}
      </div>

      {/* Task preview */}
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
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          lineHeight: '1.4',
        }}
      >
        {displayPrompt}
      </div>

      {/* Constraints row */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
        {/* Max turns */}
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
          <RotateCcw style={{ width: 10, height: 10 }} />
          {maxTurns} turns
        </div>

        {/* Approval required */}
        {nodeData.constraints?.requireApprovalForWrites && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 6px',
              background: 'color-mix(in srgb, var(--warning) 10%, transparent)',
              borderRadius: '4px',
              fontSize: '10px',
              color: 'var(--warning)',
            }}
          >
            <Shield style={{ width: 10, height: 10 }} />
            Approval
          </div>
        )}
      </div>

      {/* Allowed tools */}
      <div
        style={{
          fontSize: '9px',
          color: 'var(--text-secondary)',
          marginBottom: '4px',
        }}
      >
        Tools: {allowedTools.join(', ')}
      </div>

      {/* Running progress */}
      {nodeState?.status === 'running' && executionProgress?.currentTurn !== undefined && (
        <div
          style={{
            marginTop: '8px',
            padding: '6px 8px',
            background: `color-mix(in srgb, ${nodeColor} 10%, transparent)`,
            borderRadius: '4px',
            fontSize: '10px',
            color: nodeColor,
          }}
        >
          Turn {executionProgress.currentTurn}/{maxTurns}
          {executionProgress.status && ` - ${executionProgress.status}`}
        </div>
      )}

      {/* Completed status */}
      {nodeState?.status === 'completed' && (
        <div
          style={{
            marginTop: '8px',
            padding: '6px 8px',
            background: 'color-mix(in srgb, var(--success) 10%, transparent)',
            borderRadius: '4px',
            fontSize: '10px',
            color: 'var(--success)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <CheckCircle style={{ width: 12, height: 12 }} />
          Task completed
          {executionProgress?.filesChanged !== undefined && (
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <FileCode style={{ width: 10, height: 10 }} />
              {executionProgress.filesChanged} files
            </span>
          )}
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
          {nodeState.error}
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

ClaudeCodeNode.displayName = 'ClaudeCodeNode'

// Export properties component
export { ClaudeCodeNodeProperties } from './ClaudeCodeNodeProperties'

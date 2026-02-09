/**
 * CheckpointNode (CallbackNode) - Configurable observation point
 *
 * A flexible checkpoint that can:
 * - Log to console/history (observability)
 * - Pause in debug mode (breakpoint)
 * - Require human approval (gate)
 * - Send webhook notifications (integration)
 *
 * Pre-Node Aware: Detects the upstream node type and shows relevant options
 * for capturing node-specific data (e.g., Agent iterations, Loop index).
 */

import { memo, useMemo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  Eye,
  Pause,
  ShieldCheck,
  Webhook,
  Bot,
  MessageSquare,
  Cpu,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  FileText,
} from 'lucide-react'
import type { CallbackNodeData, WorkflowNodeType } from '../../../services/workflowTypes'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import { NodeExecutionFooter } from './NodeExecutionFooter'

interface CallbackNodeProps extends NodeProps {
  data: CallbackNodeData
}

/** Get the type of node that is connected to this node's input */
function useSourceNodeType(nodeId: string): WorkflowNodeType | null {
  const edges = useWorkflowStore(state => state.edges)
  const nodes = useWorkflowStore(state => state.nodes)

  return useMemo(() => {
    const incomingEdge = edges.find(e => e.target === nodeId)
    if (!incomingEdge) return null
    const sourceNode = nodes.find(n => n.id === incomingEdge.source)
    if (!sourceNode) return null
    return sourceNode.type as WorkflowNodeType
  }, [edges, nodes, nodeId])
}

/** Get icon for source node type */
function getSourceNodeIcon(type: WorkflowNodeType | null) {
  const style = { width: 10, height: 10 }
  switch (type) {
    case 'agent':
      return <Bot style={style} />
    case 'prompt':
      return <MessageSquare style={style} />
    case 'provider':
      return <Cpu style={style} />
    case 'loop':
      return <RotateCw style={style} />
    default:
      return null
  }
}

/** Get friendly label for source node type */
function getSourceNodeLabel(type: WorkflowNodeType | null): string | null {
  const labels: Record<string, string> = {
    agent: 'Agent',
    prompt: 'Prompt',
    provider: 'Provider',
    condition: 'Condition',
    loop: 'Loop',
    parallel: 'Parallel',
    tool: 'Tool',
    'tool-call-parser': 'Parser',
    'tool-call-router': 'Router',
  }
  return type ? labels[type] || null : null
}

/** Determine active behaviors from node data */
function getActiveBehaviors(data: CallbackNodeData) {
  const behaviors: Array<{ key: string; label: string; icon: React.ReactNode; color: string }> = []

  // Check for logging
  if (data.logToConsole || data.logToHistory) {
    behaviors.push({
      key: 'log',
      label: data.logToConsole && data.logToHistory ? 'Log' : data.logToConsole ? 'Console' : 'History',
      icon: <FileText style={{ width: 10, height: 10 }} />,
      color: 'var(--accent)',
    })
  }

  // Pause in debug mode
  if (data.pauseInDebug) {
    behaviors.push({
      key: 'pause',
      label: 'Debug',
      icon: <Pause style={{ width: 10, height: 10 }} />,
      color: 'var(--node-amber)',
    })
  }

  // Require approval (gate)
  if (data.requireApproval) {
    behaviors.push({
      key: 'approve',
      label: 'Approval',
      icon: <ShieldCheck style={{ width: 10, height: 10 }} />,
      color: 'var(--node-orange)',
    })
  }

  // Send webhook
  if (data.sendWebhook) {
    behaviors.push({
      key: 'webhook',
      label: 'Webhook',
      icon: <Webhook style={{ width: 10, height: 10 }} />,
      color: 'var(--node-teal)',
    })
  }

  // Legacy mode support
  if (behaviors.length === 0 && data.mode) {
    switch (data.mode) {
      case 'pause':
        behaviors.push({
          key: 'pause',
          label: 'Pause',
          icon: <Pause style={{ width: 10, height: 10 }} />,
          color: 'var(--node-amber)',
        })
        break
      case 'report':
        behaviors.push({
          key: 'webhook',
          label: 'Report',
          icon: <Webhook style={{ width: 10, height: 10 }} />,
          color: 'var(--node-teal)',
        })
        break
      default:
        // passthrough - no badge
        break
    }
  }

  return behaviors
}

/** Get the primary color based on highest-priority active behavior */
function getPrimaryColor(data: CallbackNodeData): string {
  // Priority: approval > pause > webhook > log > passthrough
  if (data.requireApproval) return 'var(--node-orange)'
  if (data.pauseInDebug) return 'var(--node-amber)'
  if (data.sendWebhook) return 'var(--node-teal)'
  if (data.logToConsole || data.logToHistory) return 'var(--accent)'

  // Legacy mode support
  if (data.mode === 'pause') return 'var(--node-amber)'
  if (data.mode === 'report') return 'var(--node-teal)'

  return 'var(--muted)'
}

/** Check if checkpoint is effectively a passthrough (no active behaviors) */
function isPassthrough(data: CallbackNodeData): boolean {
  const hasAnyBehavior =
    data.logToConsole ||
    data.logToHistory ||
    data.pauseInDebug ||
    data.requireApproval ||
    data.sendWebhook

  if (hasAnyBehavior) return false

  // Legacy mode check
  if (data.mode && data.mode !== 'passthrough') return false

  return true
}

export const CallbackNode = memo(({ id, data, selected }: CallbackNodeProps) => {
  const executionState = useWorkflowStore(state => state.executionState)
  const nodeState = executionState?.nodeStates[id]
  const nodeData = data as CallbackNodeData
  const sourceNodeType = useSourceNodeType(id)

  const behaviors = getActiveBehaviors(nodeData)
  const primaryColor = getPrimaryColor(nodeData)
  const passthrough = isPassthrough(nodeData)

  // Status indicator
  const getStatusBorderColor = (): string | null => {
    if (!nodeState) return null
    switch (nodeState.status) {
      case 'completed':
        return 'var(--success)'
      case 'failed':
        return 'var(--error)'
      case 'running':
        return primaryColor
      default:
        return null
    }
  }

  const getStatusBoxShadow = (): string | undefined => {
    if (!nodeState) return undefined
    if (nodeState.status === 'running') {
      return `0 0 0 2px ${primaryColor}, 0 0 12px ${primaryColor}`
    }
    return undefined
  }

  const statusBorderColor = getStatusBorderColor()
  const statusBoxShadow = getStatusBoxShadow()
  const borderColor = statusBorderColor || (selected ? primaryColor : 'var(--border)')
  const boxShadow =
    statusBoxShadow ||
    (selected ? `0 0 0 2px color-mix(in srgb, ${primaryColor} 30%, transparent)` : '0 2px 4px rgba(0,0,0,0.1)')

  // Get primary icon based on highest priority behavior
  const getPrimaryIcon = () => {
    if (nodeData.requireApproval) return <ShieldCheck style={{ width: 14, height: 14 }} />
    if (nodeData.pauseInDebug) return <Pause style={{ width: 14, height: 14 }} />
    if (nodeData.sendWebhook) return <Webhook style={{ width: 14, height: 14 }} />
    if (nodeData.logToConsole || nodeData.logToHistory) return <FileText style={{ width: 14, height: 14 }} />
    // Legacy
    if (nodeData.mode === 'pause') return <Pause style={{ width: 14, height: 14 }} />
    if (nodeData.mode === 'report') return <Webhook style={{ width: 14, height: 14 }} />
    return <Eye style={{ width: 14, height: 14 }} />
  }

  return (
    <div
      className={nodeData.disabled ? 'workflow-node-disabled' : ''}
      style={{
        minWidth: 180,
        padding: '12px',
        background: 'var(--panel)',
        borderWidth: '2px',
        borderStyle: passthrough ? 'dashed' : 'solid',
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
          background: primaryColor,
          border: '2px solid var(--panel)',
        }}
      />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '6px',
            background: `color-mix(in srgb, ${primaryColor} 20%, transparent)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: primaryColor,
          }}
        >
          {getPrimaryIcon()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {nodeData.label || 'Checkpoint'}
          </div>
          {nodeData.checkpointName && (
            <div
              style={{
                fontSize: '10px',
                color: 'var(--text-secondary)',
                fontFamily: 'monospace',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {nodeData.checkpointName}
            </div>
          )}
        </div>
      </div>

      {/* Active Behaviors - show as tags */}
      {behaviors.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '4px',
            marginBottom: sourceNodeType || nodeData.message ? '8px' : 0,
          }}
        >
          {behaviors.map(behavior => (
            <div
              key={behavior.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 6px',
                background: `color-mix(in srgb, ${behavior.color} 15%, transparent)`,
                borderRadius: '4px',
                fontSize: '9px',
                color: behavior.color,
                fontWeight: 500,
              }}
            >
              {behavior.icon}
              {behavior.label}
            </div>
          ))}
        </div>
      )}

      {/* Passthrough indicator when no behaviors */}
      {passthrough && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 6px',
            background: 'var(--panel-2)',
            borderRadius: '4px',
            fontSize: '9px',
            color: 'var(--muted)',
            fontWeight: 500,
            marginBottom: sourceNodeType || nodeData.message ? '8px' : 0,
          }}
        >
          <Eye style={{ width: 10, height: 10 }} />
          Pass-through
        </div>
      )}

      {/* Source node context indicator */}
      {sourceNodeType && getSourceNodeLabel(sourceNodeType) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 6px',
            background: 'var(--panel-2)',
            borderRadius: '4px',
            fontSize: '9px',
            color: 'var(--text-secondary)',
            marginBottom: nodeData.message ? '8px' : 0,
          }}
        >
          {getSourceNodeIcon(sourceNodeType)}
          <span>from {getSourceNodeLabel(sourceNodeType)}</span>
          {/* Show event filter if listening to specific events */}
          {nodeData.listenTo && nodeData.listenTo.length > 0 && (
            <span style={{ marginLeft: 'auto', opacity: 0.7 }}>
              {nodeData.listenTo.length} event{nodeData.listenTo.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* Message preview */}
      {nodeData.message && (
        <div
          style={{
            padding: '6px 8px',
            background: 'var(--panel-2)',
            borderRadius: '4px',
            fontSize: '10px',
            color: 'var(--text-secondary)',
            fontStyle: 'italic',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          "{nodeData.message}"
        </div>
      )}

      {/* Execution status */}
      {nodeState && (
        <div
          style={{
            marginTop: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '10px',
            color:
              nodeState.status === 'completed'
                ? 'var(--success)'
                : nodeState.status === 'failed'
                  ? 'var(--error)'
                  : nodeState.status === 'running'
                    ? primaryColor
                    : 'var(--muted)',
          }}
        >
          {nodeState.status === 'completed' && (
            <>
              <CheckCircle2 style={{ width: 12, height: 12 }} />
              Checkpoint passed
            </>
          )}
          {nodeState.status === 'failed' && (
            <>
              <AlertCircle style={{ width: 12, height: 12 }} />
              Failed
            </>
          )}
          {nodeState.status === 'running' && nodeData.requireApproval && (
            <>
              <Clock style={{ width: 12, height: 12 }} />
              Waiting for approval...
            </>
          )}
          {nodeState.status === 'running' && nodeData.pauseInDebug && !nodeData.requireApproval && (
            <>
              <Pause style={{ width: 12, height: 12 }} />
              Paused (debug)
            </>
          )}
        </div>
      )}

      {/* Execution debug footer */}
      <NodeExecutionFooter
        nodeState={nodeState}
        allNodeStates={executionState?.nodeStates}
        showOutput={false}
      />

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        style={{
          width: 12,
          height: 12,
          background: primaryColor,
          border: '2px solid var(--panel)',
        }}
      />
    </div>
  )
})

CallbackNode.displayName = 'CallbackNode'

export { CallbackNodeProperties } from './CallbackNodeProperties'

/**
 * TriggerNode - Workflow entry point node
 *
 * This node defines how a workflow is triggered:
 * - manual: User clicks "Run" (default)
 * - webhook: HTTP POST to generated endpoint
 * - schedule: Cron or interval-based execution
 * - file-watch: File system changes (Electron only)
 * - event: Internal event from another workflow
 *
 * The TriggerNode has no inputs and one output that starts the workflow.
 */

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Play, Webhook, Clock, FolderSync, Zap, CheckCircle2 } from 'lucide-react'
import type { TriggerNodeData } from '../../../services/workflowTypes'
import { useWorkflowStore } from '../../../../stores/workflowStore'

interface TriggerNodeProps extends NodeProps {
  data: TriggerNodeData
}

/** Get icon for trigger type */
function getTriggerIcon(type: TriggerNodeData['triggerType']) {
  const iconStyle = { width: 14, height: 14 }
  switch (type) {
    case 'manual':
      return <Play style={iconStyle} />
    case 'webhook':
      return <Webhook style={iconStyle} />
    case 'schedule':
      return <Clock style={iconStyle} />
    case 'file-watch':
      return <FolderSync style={iconStyle} />
    case 'event':
      return <Zap style={iconStyle} />
    default:
      return <Play style={iconStyle} />
  }
}

/** Get color for trigger type */
function getTriggerColor(type: TriggerNodeData['triggerType']): string {
  switch (type) {
    case 'manual':
      return 'var(--node-green, #22c55e)'
    case 'webhook':
      return 'var(--node-blue, #3b82f6)'
    case 'schedule':
      return 'var(--node-purple, #a855f7)'
    case 'file-watch':
      return 'var(--node-orange, #f97316)'
    case 'event':
      return 'var(--node-cyan, #06b6d4)'
    default:
      return 'var(--node-green, #22c55e)'
  }
}

/** Get human-readable label for trigger type */
function getTriggerLabel(type: TriggerNodeData['triggerType']): string {
  switch (type) {
    case 'manual':
      return 'Manual'
    case 'webhook':
      return 'Webhook'
    case 'schedule':
      return 'Scheduled'
    case 'file-watch':
      return 'File Watch'
    case 'event':
      return 'Event'
    default:
      return 'Manual'
  }
}

/** Format schedule info for display */
function formatScheduleInfo(data: TriggerNodeData): string | null {
  if (data.triggerType !== 'schedule') return null

  if (data.scheduleType === 'cron' && data.scheduleCron) {
    return `Cron: ${data.scheduleCron}`
  }
  if (data.scheduleType === 'interval' && data.scheduleIntervalMs) {
    const seconds = Math.floor(data.scheduleIntervalMs / 1000)
    if (seconds < 60) return `Every ${seconds}s`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `Every ${minutes}m`
    const hours = Math.floor(minutes / 60)
    return `Every ${hours}h`
  }
  return null
}

/** Format webhook info for display */
function formatWebhookInfo(data: TriggerNodeData): string | null {
  if (data.triggerType !== 'webhook') return null
  if (data.webhookPath) {
    return `POST ${data.webhookPath}`
  }
  return 'Configure path...'
}

/** Format file watch info for display */
function formatFileWatchInfo(data: TriggerNodeData): string | null {
  if (data.triggerType !== 'file-watch') return null
  if (data.fileWatchPaths && data.fileWatchPaths.length > 0) {
    const firstPath = data.fileWatchPaths[0]
    if (data.fileWatchPaths.length > 1) {
      return `${firstPath} +${data.fileWatchPaths.length - 1}`
    }
    return firstPath
  }
  return 'Configure paths...'
}

export const TriggerNode = memo(({ id, data, selected }: TriggerNodeProps) => {
  const executionState = useWorkflowStore(state => state.executionState)
  const nodeState = executionState?.nodeStates[id]
  const nodeData = data as TriggerNodeData

  const triggerType = nodeData.triggerType || 'manual'
  const color = getTriggerColor(triggerType)

  // Get status-based styling
  const getStatusBorderColor = (): string | null => {
    if (!nodeState) return null
    switch (nodeState.status) {
      case 'completed':
        return 'var(--success)'
      case 'failed':
        return 'var(--error)'
      case 'running':
        return color
      default:
        return null
    }
  }

  const getStatusBoxShadow = (): string | undefined => {
    if (!nodeState) return undefined
    if (nodeState.status === 'running') {
      return `0 0 0 2px ${color}, 0 0 12px ${color}`
    }
    return undefined
  }

  const statusBorderColor = getStatusBorderColor()
  const statusBoxShadow = getStatusBoxShadow()
  const borderColor = statusBorderColor || (selected ? color : 'var(--border)')
  const boxShadow = statusBoxShadow || (selected ? `0 0 0 2px color-mix(in srgb, ${color} 30%, transparent)` : '0 2px 4px rgba(0,0,0,0.1)')

  // Get trigger-specific info
  const scheduleInfo = formatScheduleInfo(nodeData)
  const webhookInfo = formatWebhookInfo(nodeData)
  const fileWatchInfo = formatFileWatchInfo(nodeData)

  return (
    <div
      className={nodeData.disabled ? 'workflow-node-disabled' : ''}
      style={{
        minWidth: 180,
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
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: `color-mix(in srgb, ${color} 20%, transparent)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: color,
          }}
        >
          {getTriggerIcon(triggerType)}
        </div>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
            {nodeData.label || 'Start'}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
            {getTriggerLabel(triggerType)} Trigger
          </div>
        </div>
      </div>

      {/* Trigger type badge */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 8px',
          background: `color-mix(in srgb, ${color} 15%, transparent)`,
          borderRadius: '4px',
          fontSize: '10px',
          color: color,
          fontWeight: 500,
        }}
      >
        {getTriggerIcon(triggerType)}
        {getTriggerLabel(triggerType)}
        {nodeData.scheduleEnabled === false && triggerType === 'schedule' && (
          <span style={{ opacity: 0.6 }}>(disabled)</span>
        )}
      </div>

      {/* Trigger-specific info */}
      {scheduleInfo && (
        <div
          style={{
            marginTop: '8px',
            padding: '6px 8px',
            background: 'var(--panel-2)',
            borderRadius: '4px',
            fontSize: '10px',
            color: 'var(--text-secondary)',
            fontFamily: 'monospace',
          }}
        >
          {scheduleInfo}
        </div>
      )}

      {webhookInfo && (
        <div
          style={{
            marginTop: '8px',
            padding: '6px 8px',
            background: 'var(--panel-2)',
            borderRadius: '4px',
            fontSize: '10px',
            color: 'var(--text-secondary)',
            fontFamily: 'monospace',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {webhookInfo}
        </div>
      )}

      {fileWatchInfo && (
        <div
          style={{
            marginTop: '8px',
            padding: '6px 8px',
            background: 'var(--panel-2)',
            borderRadius: '4px',
            fontSize: '10px',
            color: 'var(--text-secondary)',
            fontFamily: 'monospace',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {fileWatchInfo}
        </div>
      )}

      {/* Event name for event triggers */}
      {triggerType === 'event' && nodeData.eventName && (
        <div
          style={{
            marginTop: '8px',
            padding: '6px 8px',
            background: 'var(--panel-2)',
            borderRadius: '4px',
            fontSize: '10px',
            color: 'var(--text-secondary)',
          }}
        >
          Event: <span style={{ fontFamily: 'monospace' }}>{nodeData.eventName}</span>
        </div>
      )}

      {/* Description */}
      {nodeData.description && (
        <div
          style={{
            marginTop: '8px',
            fontSize: '10px',
            color: 'var(--text-secondary)',
            fontStyle: 'italic',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {nodeData.description}
        </div>
      )}

      {/* Execution status */}
      {nodeState?.status === 'completed' && (
        <div
          style={{
            marginTop: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '10px',
            color: 'var(--success)',
          }}
        >
          <CheckCircle2 style={{ width: 12, height: 12 }} />
          Triggered
        </div>
      )}

      {/* Output Handle - starts the workflow */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        style={{
          width: 12,
          height: 12,
          background: color,
          border: '2px solid var(--panel)',
        }}
        title="Connect to first workflow node"
      />
    </div>
  )
})

TriggerNode.displayName = 'TriggerNode'

/**
 * UserInputNode - Pause workflow and collect user input
 *
 * This node pauses execution and waits for user input. Use cases:
 * - Interactive chat loops (user message -> LLM -> user message -> ...)
 * - Human-in-the-loop approval workflows
 * - Data collection mid-workflow
 * - Debugging with manual input injection
 */

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { MessageSquare, Type, ListChecks, HelpCircle, Hash, Loader2, CheckCircle2 } from 'lucide-react'
import type { UserInputNodeData, BaseNodeData } from '../../../services/workflowTypes'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import { getNodeColor } from '../nodeColors'

interface UserInputNodeProps {
  id: string
  data: BaseNodeData
  selected?: boolean
}

export const UserInputNode = memo(({ id, data, selected }: UserInputNodeProps) => {
  const executionState = useWorkflowStore(state => state.executionState)
  const nodeState = executionState?.nodeStates[id]
  const nodeData = data as UserInputNodeData

  const inputType = nodeData.inputType || 'text'

  // Get icon based on input type
  const getInputTypeIcon = () => {
    switch (inputType) {
      case 'text':
        return <Type style={{ width: 14, height: 14 }} />
      case 'textarea':
        return <MessageSquare style={{ width: 14, height: 14 }} />
      case 'choice':
        return <ListChecks style={{ width: 14, height: 14 }} />
      case 'confirm':
        return <HelpCircle style={{ width: 14, height: 14 }} />
      case 'number':
        return <Hash style={{ width: 14, height: 14 }} />
      default:
        return <Type style={{ width: 14, height: 14 }} />
    }
  }

  const getInputTypeLabel = () => {
    switch (inputType) {
      case 'text':
        return 'Text'
      case 'textarea':
        return 'Multi-line'
      case 'choice':
        return 'Choice'
      case 'confirm':
        return 'Confirm'
      case 'number':
        return 'Number'
      default:
        return 'Text'
    }
  }

  // Node color from central definition
  const nodeColor = getNodeColor('user-input')

  // Status-based styling
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

  const getStatusBoxShadow = (): string | undefined => {
    if (!nodeState) return undefined

    if (nodeState.status === 'running') {
      return `0 0 0 2px ${nodeColor}, 0 0 12px ${nodeColor}`
    }
    return undefined
  }

  const statusBorderColor = getStatusBorderColor()
  const statusBoxShadow = getStatusBoxShadow()

  const borderColor = statusBorderColor || (selected ? nodeColor : 'var(--border)')
  const boxShadow = statusBoxShadow || (selected ? `0 0 0 2px color-mix(in srgb, ${nodeColor} 30%, transparent)` : '0 2px 4px rgba(0,0,0,0.1)')

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
          <MessageSquare style={{ width: 14, height: 14 }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
            {nodeData.label || 'User Input'}
          </div>
        </div>
        {/* Running indicator */}
        {nodeState?.status === 'running' && (
          <Loader2
            style={{
              width: 14,
              height: 14,
              color: nodeColor,
              animation: 'spin 1s linear infinite',
            }}
          />
        )}
      </div>

      {/* Prompt preview */}
      {nodeData.prompt && (
        <div
          style={{
            padding: '6px 8px',
            background: `color-mix(in srgb, ${nodeColor} 8%, transparent)`,
            borderRadius: '4px',
            fontSize: '11px',
            color: 'var(--text)',
            marginBottom: '8px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {nodeData.prompt}
        </div>
      )}

      {/* Input type indicator */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 8px',
          background: `color-mix(in srgb, ${nodeColor} 10%, transparent)`,
          borderRadius: '4px',
          fontSize: '10px',
          color: nodeColor,
          fontWeight: 500,
        }}
      >
        {getInputTypeIcon()}
        {getInputTypeLabel()}
        {nodeData.required && (
          <span style={{ marginLeft: 'auto', opacity: 0.7 }}>required</span>
        )}
      </div>

      {/* Choices preview for choice type */}
      {inputType === 'choice' && nodeData.choices && nodeData.choices.length > 0 && (
        <div
          style={{
            marginTop: '6px',
            fontSize: '9px',
            color: 'var(--text-secondary)',
          }}
        >
          {nodeData.choices.slice(0, 3).join(', ')}
          {nodeData.choices.length > 3 && ` +${nodeData.choices.length - 3} more`}
        </div>
      )}

      {/* Show context indicator */}
      {nodeData.showContext && (
        <div
          style={{
            marginTop: '6px',
            fontSize: '9px',
            color: 'var(--text-secondary)',
            fontStyle: 'italic',
          }}
        >
          Shows previous output
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
          Input received
        </div>
      )}

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
        }}
      />
    </div>
  )
})

UserInputNode.displayName = 'UserInputNode'

// Export properties component
export { UserInputNodeProperties } from './UserInputNodeProperties'

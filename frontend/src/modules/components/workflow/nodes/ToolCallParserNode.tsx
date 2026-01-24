/**
 * ToolCallParserNode - Parse LLM output for tool call requests
 *
 * This node detects and extracts tool calls from LLM responses, enabling
 * agentic workflows where the LLM decides which tools to call.
 *
 * Two outputs:
 * - "found" (top, green): Tool call was detected → outputs { toolName, toolParameters, ... }
 * - "not-found" (bottom, gray): No tool call → outputs original text
 *
 * Supports: OpenAI, Anthropic, XML, and generic JSON formats.
 */

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { ScanSearch, CheckCircle, XCircle, Loader2, Braces, Check, Minus } from 'lucide-react'
import type { ToolCallParserNodeData, BaseNodeData } from '../../../services/workflowTypes'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import { getNodeColor } from '../nodeColors'

interface ToolCallParserNodeProps {
  id: string
  data: BaseNodeData
  selected?: boolean
}

export const ToolCallParserNode = memo(({ id, data, selected }: ToolCallParserNodeProps) => {
  console.log('[ToolCallParserNode] Rendering with updated UI - two outputs: found/not-found')
  const executionState = useWorkflowStore(state => state.executionState)
  const nodeState = executionState?.nodeStates[id]
  const nodeData = data as ToolCallParserNodeData

  const format = nodeData.format || 'auto'

  // Get format label
  const getFormatLabel = () => {
    switch (format) {
      case 'auto':
        return 'Auto-detect'
      case 'openai':
        return 'OpenAI'
      case 'anthropic':
        return 'Anthropic'
      case 'xml':
        return 'XML'
      case 'json':
        return 'JSON'
      default:
        return format
    }
  }

  // Node color from central definition
  const nodeColor = getNodeColor('tool-call-parser')
  const successColor = 'var(--success, #22c55e)'
  const mutedColor = 'var(--muted, #6b7280)'

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

  // Get output info if completed
  const outputInfo = nodeState?.output as {
    hasToolCall?: boolean
    toolName?: string
    format?: string
  } | undefined

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
          <ScanSearch style={{ width: 14, height: 14 }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
            {nodeData.label || 'Tool Call Parser'}
          </div>
        </div>
        {getStatusIcon()}
      </div>

      {/* Format indicator */}
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
          marginBottom: '8px',
        }}
      >
        <Braces style={{ width: 12, height: 12 }} />
        {getFormatLabel()} format
      </div>

      {/* Allowed tools preview */}
      {nodeData.allowedTools && nodeData.allowedTools.length > 0 && (
        <div
          style={{
            fontSize: '10px',
            color: 'var(--text-secondary)',
            marginBottom: '6px',
          }}
        >
          Tools: {nodeData.allowedTools.slice(0, 3).join(', ')}
          {nodeData.allowedTools.length > 3 && ` +${nodeData.allowedTools.length - 3}`}
        </div>
      )}

      {/* Output labels - shows which output goes where */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        marginTop: '8px',
        paddingTop: '8px',
        borderTop: '1px solid var(--border)',
      }}>
        {/* Found output label */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '4px',
          fontSize: '9px',
          color: successColor,
          fontWeight: 500,
        }}>
          <Check style={{ width: 10, height: 10 }} />
          <span>Found</span>
        </div>
        {/* Not found output label */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '4px',
          fontSize: '9px',
          color: mutedColor,
        }}>
          <Minus style={{ width: 10, height: 10 }} />
          <span>Not Found</span>
        </div>
      </div>

      {/* Execution result info */}
      {nodeState?.status === 'completed' && outputInfo && (
        <div
          style={{
            marginTop: '8px',
            padding: '6px 8px',
            background: outputInfo.hasToolCall
              ? 'color-mix(in srgb, var(--success) 10%, transparent)'
              : 'color-mix(in srgb, var(--muted) 10%, transparent)',
            borderRadius: '4px',
            fontSize: '10px',
            color: outputInfo.hasToolCall ? 'var(--success)' : 'var(--muted)',
          }}
        >
          {outputInfo.hasToolCall
            ? `Found: ${outputInfo.toolName} (${outputInfo.format})`
            : 'No tool call found'}
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
          {nodeState.error}
        </div>
      )}

      {/* Output Handle - "Found" (tool call detected) */}
      <Handle
        type="source"
        position={Position.Right}
        id="found"
        style={{
          width: 12,
          height: 12,
          background: successColor,
          border: '2px solid var(--panel)',
          top: 'calc(50% + 10px)',
        }}
      />

      {/* Output Handle - "Not Found" (no tool call) */}
      <Handle
        type="source"
        position={Position.Right}
        id="not-found"
        style={{
          width: 10,
          height: 10,
          background: mutedColor,
          border: '2px solid var(--panel)',
          top: 'calc(50% + 30px)',
        }}
      />
    </div>
  )
})

ToolCallParserNode.displayName = 'ToolCallParserNode'

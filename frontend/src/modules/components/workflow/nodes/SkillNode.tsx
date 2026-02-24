/**
 * SkillNode - Execute an installed skill package
 *
 * Skills are AI agent tasks: a .prmd prompt that orchestrates tool usage,
 * optionally bundled with executable scripts. Installed to .prompd/skills/.
 * Displays skill name, version, scope, parameter count, and execution state.
 */

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Sparkles, CheckCircle, XCircle, Loader2, Clock, Globe, FolderOpen } from 'lucide-react'
import type { SkillNodeData, BaseNodeData } from '../../../services/workflowTypes'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import { getNodeColor } from '../nodeColors'
import { NodeExecutionFooter } from './NodeExecutionFooter'

// Handle style constants
const handleSize = 12
const handleBorder = '2px solid var(--panel)'

interface SkillNodeProps {
  id: string
  data: BaseNodeData
  selected?: boolean
}

export const SkillNode = memo(({ id, data, selected }: SkillNodeProps) => {
  const executionState = useWorkflowStore(state => state.executionState)
  const nodeState = executionState?.nodeStates[id]
  const nodeData = data as SkillNodeData

  // Node color from central definition
  const nodeColor = getNodeColor('skill')

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

  // Skill info
  const skillName = String(nodeData.skillName || 'No skill selected')
  const skillVersion = nodeData.skillVersion ? String(nodeData.skillVersion) : undefined
  const skillScope = nodeData.skillScope as 'workspace' | 'user' | undefined

  // Count parameters
  const params = (nodeData.parameters && typeof nodeData.parameters === 'object') ? nodeData.parameters as Record<string, unknown> : {}
  const paramCount = Object.keys(params).length

  // Timeout
  const timeoutMs = typeof nodeData.timeoutMs === 'number' ? nodeData.timeoutMs : undefined

  return (
    <div
      className={[nodeData.disabled && 'workflow-node-disabled', nodeData.locked && 'workflow-node-locked'].filter(Boolean).join(' ')}
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
          <Sparkles style={{ width: 14, height: 14 }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
            {String(nodeData.label ?? 'Skill')}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
            {'Skill Package'}
          </div>
        </div>
        {getStatusIcon()}
      </div>

      {/* Skill name */}
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
        {skillName}
      </div>

      {/* Metadata row */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {/* Version chip */}
        {skillVersion && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 6px',
              background: `color-mix(in srgb, ${nodeColor} 10%, transparent)`,
              borderRadius: '4px',
              fontSize: '10px',
              color: nodeColor,
              fontWeight: 500,
            }}
          >
            {'v'}{skillVersion}
          </div>
        )}

        {/* Scope badge */}
        {skillScope && (
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
            {skillScope === 'user'
              ? <Globe style={{ width: 10, height: 10 }} />
              : <FolderOpen style={{ width: 10, height: 10 }} />
            }
            {skillScope}
          </div>
        )}

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
      </div>

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

      {/* Execution debug footer */}
      <NodeExecutionFooter
        nodeState={nodeState}
        allNodeStates={executionState?.nodeStates}
        showOutput={false}
        showError={false}
      />

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

SkillNode.displayName = 'SkillNode'

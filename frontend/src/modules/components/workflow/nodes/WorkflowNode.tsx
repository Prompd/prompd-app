/**
 * WorkflowNode - Invoke another .pdflow as a sub-workflow
 *
 * This enables workflow composition:
 * - Call reusable workflow modules
 * - Pass parameters and receive outputs
 * - Support for recursive workflows (with depth limit)
 */

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { GitBranch, CheckCircle, XCircle, Loader2, Package, ArrowRight, AlertTriangle } from 'lucide-react'
import type { WorkflowNodeData, BaseNodeData } from '../../../services/workflowTypes'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import { getNodeColor } from '../nodeColors'
import { NodeExecutionFooter } from './NodeExecutionFooter'

// Handle style constants
const handleSize = 12
const handleBorder = '2px solid var(--panel)'

interface WorkflowNodeProps {
  id: string
  data: BaseNodeData
  selected?: boolean
}

export const WorkflowNode = memo(({ id, data, selected }: WorkflowNodeProps) => {
  const executionState = useWorkflowStore(state => state.executionState)
  const nodeState = executionState?.nodeStates[id]
  const nodeData = data as WorkflowNodeData

  // Node color from central definition
  const nodeColor = getNodeColor('workflow')

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

  // Parse source to determine if it's a local file or package reference
  const source = nodeData.source || ''
  const isPackageRef = source.startsWith('@')
  const isLocalFile = source.startsWith('./') || source.startsWith('../')

  // Format source for display
  const displaySource = source.length > 35
    ? '...' + source.slice(-32)
    : source || 'No source'

  // Count parameters being passed
  const paramCount = Object.keys(nodeData.parameters || {}).length
  const outputMappingCount = Object.keys(nodeData.outputMapping || {}).length

  // Get execution progress
  const executionProgress = nodeState?.output as {
    currentNodeId?: string
    currentNodeLabel?: string
    nodesCompleted?: number
    totalNodes?: number
  } | undefined

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
          <GitBranch style={{ width: 14, height: 14 }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
            {nodeData.label || 'Sub-Workflow'}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
            {isPackageRef ? 'Package' : isLocalFile ? 'Local File' : 'Workflow'}
          </div>
        </div>
        {getStatusIcon()}
      </div>

      {/* Source reference */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 8px',
          background: 'var(--bg)',
          borderRadius: '4px',
          marginBottom: '8px',
        }}
      >
        {isPackageRef ? (
          <Package style={{ width: 12, height: 12, color: nodeColor, flexShrink: 0 }} />
        ) : (
          <ArrowRight style={{ width: 12, height: 12, color: 'var(--muted)', flexShrink: 0 }} />
        )}
        <span
          style={{
            fontSize: '11px',
            fontFamily: 'monospace',
            color: isPackageRef ? nodeColor : 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {displaySource}
        </span>
      </div>

      {/* Parameter mapping info */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
        {/* Input parameters */}
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
          }}
        >
          {paramCount} param{paramCount !== 1 ? 's' : ''} in
        </div>

        {/* Output mapping */}
        {outputMappingCount > 0 && (
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
            {outputMappingCount} output{outputMappingCount !== 1 ? 's' : ''}
          </div>
        )}

        {/* Inherit variables */}
        {nodeData.inheritVariables && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 6px',
              background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
              borderRadius: '4px',
              fontSize: '10px',
              color: 'var(--accent)',
            }}
          >
            Inherit vars
          </div>
        )}
      </div>

      {/* Max depth warning */}
      {nodeData.maxDepth !== undefined && nodeData.maxDepth < 5 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '9px',
            color: 'var(--warning)',
            marginBottom: '4px',
          }}
        >
          <AlertTriangle style={{ width: 10, height: 10 }} />
          Max depth: {nodeData.maxDepth}
        </div>
      )}

      {/* Running progress */}
      {nodeState?.status === 'running' && executionProgress && (
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
          {executionProgress.currentNodeLabel || executionProgress.currentNodeId || 'Running...'}
          {executionProgress.nodesCompleted !== undefined && executionProgress.totalNodes !== undefined && (
            <span style={{ marginLeft: '8px', opacity: 0.8 }}>
              ({executionProgress.nodesCompleted}/{executionProgress.totalNodes})
            </span>
          )}
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
          }}
        >
          Sub-workflow completed
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

      {/* Execution debug footer */}
      <NodeExecutionFooter
        nodeState={nodeState}
        allNodeStates={executionState?.nodeStates}
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

WorkflowNode.displayName = 'WorkflowNode'

// Export properties component
export { WorkflowNodeProperties } from './WorkflowNodeProperties'

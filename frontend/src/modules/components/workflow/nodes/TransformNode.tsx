/**
 * TransformNode - Data transformation node for reshaping workflow data
 *
 * Transform, filter, or reshape data flowing through the workflow using
 * templates with {{ variable }} syntax, JQ expressions, or JavaScript.
 */

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Wand2, CheckCircle, XCircle, Loader2, Braces } from 'lucide-react'
import type { TransformerNodeData, BaseNodeData, WorkflowNodeType } from '../../../services/workflowTypes'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import { hasVariables, getUniqueVariablePaths } from '../../common/VariableReference'
import { DockedNodePreview, useDockedNodes } from './DockedNodePreview'
import { DOCKABLE_HANDLES } from '../../../services/workflowTypes'
import { getNodeColor } from '../nodeColors'
import { NodeExecutionFooter } from './NodeExecutionFooter'

interface TransformNodeProps {
  id: string
  data: BaseNodeData
  selected?: boolean
}

const MODE_CONFIG = {
  template: {
    label: 'Template',
    description: 'JSON with {{ variables }}',
    color: 'var(--node-orange, #f97316)',
  },
  jq: {
    label: 'JQ',
    description: 'JQ query expression',
    color: 'var(--node-cyan, #06b6d4)',
  },
  expression: {
    label: 'JS',
    description: 'JavaScript expression',
    color: 'var(--node-yellow, #eab308)',
  },
}

export const TransformNode = memo(({ id, data, selected }: TransformNodeProps) => {
  const executionState = useWorkflowStore(state => state.executionState)
  const nodeState = executionState?.nodeStates[id]
  const nodeData = data as TransformerNodeData

  // Get nodes docked to the onTransform handle
  const dockedToTransform = useDockedNodes(id, 'onTransform')
  const transformHandleConfig = DOCKABLE_HANDLES.find(
    h => h.nodeType === 'transformer' && h.handleId === 'onTransform'
  )

  // Check if this handle is being targeted for docking
  const dockingState = useWorkflowStore(state => state.dockingState)
  const isTransformDockTarget = dockingState?.hoveredDockTarget?.nodeId === id &&
    dockingState?.hoveredDockTarget?.handleId === 'onTransform'

  // Node color from central definition
  const nodeColor = getNodeColor('transformer')

  const mode = nodeData.mode || 'template'
  const modeConfig = MODE_CONFIG[mode] || MODE_CONFIG.template

  // Get the active template/expression content
  const getContent = (): string => {
    switch (mode) {
      case 'template':
        return nodeData.template || nodeData.transform || ''
      case 'jq':
        return nodeData.jqExpression || ''
      case 'expression':
        return nodeData.expression || ''
      default:
        return ''
    }
  }

  const content = getContent()

  // Count variables in template
  const variableCount = mode === 'template' ? getUniqueVariablePaths(content).length : 0

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

  // Preview content (first line, truncated)
  const contentPreview = content
    ? content.split('\n')[0].slice(0, 40) + (content.length > 40 ? '...' : '')
    : 'No transform configured'

  return (
    <div
      className={[nodeData.disabled && 'workflow-node-disabled', nodeData.locked && 'workflow-node-locked'].filter(Boolean).join(' ')}
      style={{
        minWidth: '180px',
        maxWidth: '280px',
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
        <Wand2 style={{ width: 14, height: 14, color: nodeColor }} />
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
          {nodeData.label || 'Transform'}
        </span>
        {getStatusIcon()}
      </div>

      {/* Body */}
      <div style={{ padding: '10px 12px' }}>
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
            marginBottom: '8px',
          }}
        >
          {modeConfig.label}
        </div>

        {/* Content Preview */}
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
          {contentPreview}
        </div>

        {/* Variable Count (for template mode) */}
        {mode === 'template' && variableCount > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              marginTop: '8px',
              fontSize: '10px',
              color: 'var(--accent)',
            }}
          >
            <Braces style={{ width: 10, height: 10 }} />
            {variableCount} variable{variableCount !== 1 ? 's' : ''}
          </div>
        )}

        {/* Input Variable */}
        {nodeData.inputVariable && nodeData.inputVariable !== 'input' && (
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
              fontFamily: 'monospace',
              marginTop: '6px',
            }}
          >
            {nodeData.inputVariable}
          </div>
        )}
      </div>

      {/* Description */}
      {nodeData.description && (
        <div
          style={{
            padding: '6px 12px 10px',
            fontSize: '11px',
            color: 'var(--text-secondary)',
            borderTop: '1px solid var(--border)',
          }}
        >
          {nodeData.description}
        </div>
      )}

      {/* Transform event handle (bottom) - for docking Callback nodes */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="onTransform"
        style={{
          width: isTransformDockTarget ? 16 : 10,
          height: isTransformDockTarget ? 16 : 10,
          background: 'var(--node-amber)',
          border: '2px solid var(--panel)',
          left: '50%',
          boxShadow: isTransformDockTarget ? '0 0 0 4px color-mix(in srgb, var(--node-amber) 50%, transparent), 0 0 12px var(--node-amber)' : undefined,
          transition: 'width 0.15s, height 0.15s, box-shadow 0.15s',
        }}
        title="Transform events (accepts Callback)"
      />

      {/* Render docked nodes near onTransform handle */}
      {transformHandleConfig && dockedToTransform.map((dockedNode, index) => (
        <DockedNodePreview
          key={dockedNode.id}
          dockedNodeId={dockedNode.id}
          dockedNodeType={dockedNode.type as WorkflowNodeType}
          dockedNodeLabel={(dockedNode.data as BaseNodeData).label}
          handleConfig={transformHandleConfig.position}
          targetNodeCollapsed={true}
          index={index}
        />
      ))}

      {/* Execution debug footer */}
      <NodeExecutionFooter
        nodeState={nodeState}
        allNodeStates={executionState?.nodeStates}
      />
    </div>
  )
})

TransformNode.displayName = 'TransformNode'

// Export properties component
export { TransformerNodeProperties } from './TransformerNodeProperties'

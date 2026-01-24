/**
 * CodeNode - Execute code snippets (TypeScript, JavaScript, Python, C#)
 *
 * This node executes code snippets with proper security controls:
 * - TypeScript/JavaScript: Runs in isolated vm context (Node.js vm module)
 * - Python: Executes via python -c command
 * - C#: Executes via dotnet-script
 *
 * Only available in Electron (desktop) mode.
 */

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { FileCode, CheckCircle, XCircle, Loader2, Shield, Box } from 'lucide-react'
import type { CodeNodeData, BaseNodeData, WorkflowNodeType } from '../../../services/workflowTypes'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import { DockedNodePreview, useDockedNodes } from './DockedNodePreview'
import { DOCKABLE_HANDLES } from '../../../services/workflowTypes'
import { getNodeColor } from '../nodeColors'

// Handle style constants
const handleSize = 12
const handleBorder = '2px solid var(--panel)'

interface CodeNodeProps {
  id: string
  data: BaseNodeData
  selected?: boolean
}

// Language display configuration
const LANGUAGE_CONFIG: Record<string, { label: string; color: string }> = {
  typescript: { label: 'TypeScript', color: '#3178c6' },
  javascript: { label: 'JavaScript', color: '#f7df1e' },
  python: { label: 'Python', color: '#3776ab' },
  csharp: { label: 'C#', color: '#239120' },
}

export const CodeNode = memo(({ id, data, selected }: CodeNodeProps) => {
  const executionState = useWorkflowStore(state => state.executionState)
  const nodeState = executionState?.nodeStates[id]
  const nodeData = data as CodeNodeData

  // Get nodes docked to the onExecute handle
  const dockedToExecute = useDockedNodes(id, 'onExecute')
  const executeHandleConfig = DOCKABLE_HANDLES.find(
    h => h.nodeType === 'code' && h.handleId === 'onExecute'
  )

  // Check if this handle is being targeted for docking
  const dockingState = useWorkflowStore(state => state.dockingState)
  const isExecuteDockTarget = dockingState?.hoveredDockTarget?.nodeId === id &&
    dockingState?.hoveredDockTarget?.handleId === 'onExecute'

  // Node color from central definition
  const nodeColor = getNodeColor('code')

  const language = nodeData.language || 'typescript'
  const langConfig = LANGUAGE_CONFIG[language] || LANGUAGE_CONFIG.typescript

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

  // Format code preview (first line or truncated)
  const codeSnippet = String(nodeData.code ?? '')
  const firstLine = codeSnippet.split('\n')[0] || ''
  const displayCode: string = firstLine.length > 35
    ? firstLine.slice(0, 35) + '...'
    : firstLine || 'No code'

  // Count lines
  const lineCount = codeSnippet ? codeSnippet.split('\n').length : 0

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
          <FileCode style={{ width: 14, height: 14 }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
            {String(nodeData.label ?? 'Code')}
          </div>
        </div>
        {getStatusIcon()}
      </div>

      {/* Language badge */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 8px',
          background: `${langConfig.color}20`,
          borderRadius: '4px',
          fontSize: '10px',
          color: langConfig.color,
          fontWeight: 600,
          marginBottom: '8px',
        }}
      >
        {langConfig.label}
      </div>

      {/* Code preview */}
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
        {displayCode}
      </div>

      {/* Metadata row */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {/* Line count */}
        {lineCount > 0 && (
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
            {lineCount} {lineCount === 1 ? 'line' : 'lines'}
          </div>
        )}

        {/* Execution context indicator (for TS/JS) */}
        {(language === 'typescript' || language === 'javascript') && nodeData.executionContext && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 6px',
              background: nodeData.executionContext === 'isolated'
                ? 'color-mix(in srgb, var(--success) 10%, transparent)'
                : 'color-mix(in srgb, var(--warning) 10%, transparent)',
              borderRadius: '4px',
              fontSize: '10px',
              color: nodeData.executionContext === 'isolated'
                ? 'var(--success)'
                : 'var(--warning)',
            }}
          >
            {nodeData.executionContext === 'isolated' ? (
              <>
                <Shield style={{ width: 10, height: 10 }} />
                {'Isolated'}
              </>
            ) : (
              <>
                <Box style={{ width: 10, height: 10 }} />
                {'Main'}
              </>
            )}
          </div>
        )}

        {/* Input variable indicator */}
        {nodeData.inputVariable && (
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
            marginTop: '6px',
            fontSize: '10px',
            color: 'var(--text-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {String(nodeData.description)}
        </div>
      )}

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
            return outputStr.length > 50 ? outputStr.slice(0, 50) + '...' : outputStr
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

      {/* Execute event handle (bottom) - for docking Memory and Callback nodes */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="onExecute"
        style={{
          width: isExecuteDockTarget ? 16 : handleSize,
          height: isExecuteDockTarget ? 16 : handleSize,
          background: 'var(--node-amber)',
          border: handleBorder,
          left: '50%',
          boxShadow: isExecuteDockTarget ? '0 0 0 4px color-mix(in srgb, var(--node-amber) 50%, transparent), 0 0 12px var(--node-amber)' : undefined,
          transition: 'width 0.15s, height 0.15s, box-shadow 0.15s',
        }}
        title="Execute events (accepts Memory, Callback)"
      />

      {/* Render docked nodes near onExecute handle */}
      {executeHandleConfig && dockedToExecute.map((dockedNode, index) => (
        <DockedNodePreview
          key={dockedNode.id}
          dockedNodeId={dockedNode.id}
          dockedNodeType={dockedNode.type as WorkflowNodeType}
          dockedNodeLabel={(dockedNode.data as BaseNodeData).label}
          handleConfig={executeHandleConfig.position}
          index={index}
        />
      ))}
    </div>
  )
})

CodeNode.displayName = 'CodeNode'

/**
 * ToolNode - Unified tool execution node for functions, MCP, HTTP, commands, and code
 *
 * Execute external tools, APIs, MCP server capabilities, shell commands, or code snippets
 * and use the result in your workflow. Connect to any tool - from simple HTTP calls to
 * MCP-compatible AI tools, shell commands, or code execution.
 */

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Wrench, Globe, Server, Code, CheckCircle, XCircle, Loader2, Terminal, FileCode } from 'lucide-react'
import type { ToolNodeData, BaseNodeData } from '../../../services/workflowTypes'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import { getNodeColor } from '../nodeColors'
import { NodeExecutionFooter } from './NodeExecutionFooter'

interface ToolNodeProps {
  id: string
  data: BaseNodeData
  selected?: boolean
}

export const ToolNode = memo(({ id, data, selected }: ToolNodeProps) => {
  const executionState = useWorkflowStore(state => state.executionState)
  const nodeState = executionState?.nodeStates[id]
  const nodeData = data as ToolNodeData

  const toolType = nodeData.toolType || 'function'

  // Get icon based on tool type
  const getToolTypeIcon = () => {
    switch (toolType) {
      case 'function':
        return <Code style={{ width: 14, height: 14 }} />
      case 'mcp':
        return <Server style={{ width: 14, height: 14 }} />
      case 'http':
        return <Globe style={{ width: 14, height: 14 }} />
      case 'command':
        return <Terminal style={{ width: 14, height: 14 }} />
      case 'code':
        return <FileCode style={{ width: 14, height: 14 }} />
      default:
        return <Wrench style={{ width: 14, height: 14 }} />
    }
  }

  const getToolTypeLabel = () => {
    switch (toolType) {
      case 'function':
        return 'Function'
      case 'mcp':
        return 'MCP'
      case 'http':
        return 'HTTP'
      case 'command':
        return 'Command'
      case 'code':
        return nodeData.codeLanguage ? nodeData.codeLanguage.toUpperCase() : 'Code'
      default:
        return 'Tool'
    }
  }

  // Get secondary info based on type
  const getSecondaryInfo = () => {
    switch (toolType) {
      case 'function':
        return nodeData.toolName || 'No function'
      case 'mcp':
        return nodeData.mcpServerName || nodeData.toolName || 'No MCP tool'
      case 'http':
        return nodeData.httpUrl
          ? `${nodeData.httpMethod || 'GET'} ${truncateUrl(nodeData.httpUrl)}`
          : 'No URL'
      case 'command': {
        const exec = nodeData.commandExecutable || ''
        const action = nodeData.commandAction || ''
        const args = nodeData.commandArgs || ''
        if (!exec) return 'No command configured'
        return `${exec}${action ? ' ' + action : ''}${args ? ' ' + truncateUrl(args, 15) : ''}`
      }
      case 'code': {
        const lang = nodeData.codeLanguage || 'typescript'
        const hasCode = nodeData.codeSnippet && nodeData.codeSnippet.trim()
        return hasCode ? `${lang} snippet` : 'No code'
      }
      default:
        return 'Not configured'
    }
  }

  // Node color from central definition
  const nodeColor = getNodeColor('tool')

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
          <Wrench style={{ width: 14, height: 14 }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
            {nodeData.label || 'Tool'}
          </div>
        </div>
        {getStatusIcon()}
      </div>

      {/* Tool type indicator */}
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
          marginBottom: '6px',
        }}
      >
        {getToolTypeIcon()}
        {getToolTypeLabel()}
      </div>

      {/* Secondary info (function name, URL, etc.) */}
      <div
        style={{
          fontSize: '11px',
          color: 'var(--muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {getSecondaryInfo()}
      </div>

      {/* Description if present */}
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
          {nodeData.description}
        </div>
      )}

      {/* Execution status message */}
      {nodeState?.status === 'completed' && nodeState.output !== undefined && (
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
          Result received
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
          width: 12,
          height: 12,
          background: nodeColor,
          border: '2px solid var(--panel)',
        }}
      />
    </div>
  )
})

ToolNode.displayName = 'ToolNode'

export { ToolNodeProperties } from './ToolNodeProperties'

// Helper function to truncate long URLs
function truncateUrl(url: string, maxLength = 25): string {
  if (url.length <= maxLength) return url
  // Try to show the domain and end of path
  try {
    const parsed = new URL(url)
    const domain = parsed.hostname
    const path = parsed.pathname
    if (domain.length + 3 >= maxLength) {
      return domain.substring(0, maxLength - 3) + '...'
    }
    const remainingLength = maxLength - domain.length - 3
    if (path.length > remainingLength) {
      return domain + '/...' + path.slice(-remainingLength + 4)
    }
    return domain + path
  } catch {
    return url.substring(0, maxLength - 3) + '...'
  }
}

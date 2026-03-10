/**
 * ToolCallRouterNodeProperties - Property editor for Tool Call Router nodes
 */

import { useMemo } from 'react'
import { Wrench } from 'lucide-react'
import type { ToolCallRouterNodeData, BaseToolNodeData } from '../../../services/workflowTypes'
import { TOOL_CONTAINER_CHILD_TYPES } from '../../../services/workflowTypes'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import { labelStyle, selectStyle } from '../shared/styles/propertyStyles'

export interface ToolCallRouterNodePropertiesProps {
  data: ToolCallRouterNodeData
  onChange: (field: string, value: unknown) => void
  nodeId?: string
}

export function ToolCallRouterNodeProperties({ data, onChange, nodeId }: ToolCallRouterNodePropertiesProps) {
  const nodes = useWorkflowStore(state => state.nodes)

  // Get child tool-like nodes for fallback dropdown
  const toolContainerTypes = useMemo(() => new Set<string>(TOOL_CONTAINER_CHILD_TYPES), [])
  const childToolNodes = useMemo(() => {
    if (!nodeId) return []
    return nodes.filter(n => n.parentId === nodeId && toolContainerTypes.has(n.type || ''))
  }, [nodes, nodeId, toolContainerTypes])

  return (
    <>
      {/* Description */}
      <div style={{
        padding: '12px',
        background: 'var(--panel-2)',
        borderRadius: '6px',
        marginBottom: '16px',
      }}>
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Routes tool calls from AI agents to the appropriate Tool node inside this container.
          Drag Tool nodes inside this container to make them available for routing.
        </div>
      </div>

      {/* Routing Mode */}
      <div>
        <label style={labelStyle}>Routing Mode</label>
        <select
          value={data.routingMode || 'name-match'}
          onChange={(e) => onChange('routingMode', e.target.value as 'name-match' | 'pattern' | 'fallback')}
          style={selectStyle}
        >
          <option value="name-match">Name Match</option>
          <option value="pattern">Pattern Match</option>
          <option value="fallback">Fallback Only</option>
        </select>
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          {data.routingMode === 'name-match' && 'Match tool calls by exact tool name.'}
          {data.routingMode === 'pattern' && 'Match tool calls using regex patterns defined in Tool nodes.'}
          {data.routingMode === 'fallback' && 'All tool calls route to the fallback tool.'}
        </p>
      </div>

      {/* No Match Behavior */}
      <div>
        <label style={labelStyle}>When No Tool Matches</label>
        <select
          value={data.onNoMatch || 'error'}
          onChange={(e) => onChange('onNoMatch', e.target.value as 'error' | 'passthrough' | 'fallback-tool')}
          style={selectStyle}
        >
          <option value="error">Error</option>
          <option value="passthrough">Pass Through</option>
          <option value="fallback-tool">Use Fallback Tool</option>
        </select>
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          {data.onNoMatch === 'error' && 'Return an error if no Tool node matches the requested tool name.'}
          {data.onNoMatch === 'passthrough' && 'Pass the tool call through unchanged (useful for debugging).'}
          {data.onNoMatch === 'fallback-tool' && 'Route to a designated fallback Tool node.'}
        </p>
      </div>

      {/* Fallback Tool Selection */}
      {data.onNoMatch === 'fallback-tool' && (
        <div>
          <label style={labelStyle}>Fallback Tool</label>
          <select
            value={data.fallbackToolId || ''}
            onChange={(e) => onChange('fallbackToolId', e.target.value || undefined)}
            style={selectStyle}
          >
            <option value="">Select a tool...</option>
            {childToolNodes.map(node => (
              <option key={node.id} value={node.id}>
                {(node.data as BaseToolNodeData).toolName || node.data.label}
              </option>
            ))}
          </select>
          {childToolNodes.length === 0 && (
            <p style={{ fontSize: '11px', color: 'var(--warning)', marginTop: '4px' }}>
              No Tool nodes found inside this container. Drag Tool nodes into this container to make them available.
            </p>
          )}
        </div>
      )}

      {/* Tool Count Display */}
      <div style={{
        padding: '12px',
        background: 'var(--panel-2)',
        borderRadius: '6px',
        marginTop: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Wrench style={{ width: 16, height: 16, color: 'var(--node-emerald)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)' }}>
              Tools Available
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
              {childToolNodes.length} tool{childToolNodes.length !== 1 ? 's' : ''} in this router
            </div>
          </div>
          <div style={{
            fontSize: '18px',
            fontWeight: 700,
            color: 'var(--node-emerald)',
          }}>
            {childToolNodes.length}
          </div>
        </div>
      </div>
    </>
  )
}

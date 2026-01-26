/**
 * ConditionNodeProperties - Property editor for Condition nodes
 */

import { useMemo } from 'react'
import { ArrowRight } from 'lucide-react'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import type { ConditionNodeData } from '../../../services/workflowTypes'
import { labelStyle, inputStyle } from '../shared/styles/propertyStyles'

export interface ConditionNodePropertiesProps {
  data: ConditionNodeData
  onChange: (field: string, value: unknown) => void
  nodeId?: string
}

export function ConditionNodeProperties({ data, onChange, nodeId }: ConditionNodePropertiesProps) {
  // Get edges to determine connected targets
  // We need to be careful here - subscribing to edges/nodes can cause re-renders
  // Use a memoized selector to only re-render when relevant edges change
  const edges = useWorkflowStore(state => state.edges)
  const nodes = useWorkflowStore(state => state.nodes)

  // Build map of connected targets - memoize to avoid recalculating on every render
  const connectedTargets = useMemo(() => {
    if (!nodeId) return {} as Record<string, { id: string; label: string }>
    const targets: Record<string, { id: string; label: string }> = {}
    for (const edge of edges) {
      if (edge.source === nodeId && edge.sourceHandle) {
        const targetNode = nodes.find(n => n.id === edge.target)
        if (targetNode) {
          targets[edge.sourceHandle] = {
            id: edge.target,
            label: targetNode.data.label || edge.target,
          }
        }
      }
    }
    return targets
  }, [edges, nodes, nodeId])

  const addCondition = () => {
    const newConditions = [
      ...(data.conditions || []),
      {
        id: `branch-${Date.now()}`,
        expression: '',
        target: '',
      },
    ]
    onChange('conditions', newConditions)
  }

  const updateCondition = (index: number, field: string, value: string) => {
    const newConditions = [...(data.conditions || [])]
    newConditions[index] = { ...newConditions[index], [field]: value }
    onChange('conditions', newConditions)
  }

  const removeCondition = (index: number) => {
    const newConditions = (data.conditions || []).filter((_, i) => i !== index)
    onChange('conditions', newConditions)
  }

  return (
    <>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>Conditions</label>
          <button
            onClick={addCondition}
            style={{
              fontSize: '12px',
              color: 'var(--accent)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            + Add
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {data.conditions?.map((condition, index) => {
            const handleId = `condition-${condition.id}`
            const connected = connectedTargets[handleId]

            return (
              <div
                key={index}  // Use index as key since condition.id changes while typing
                style={{
                  padding: '12px',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--input-border)',
                  borderRadius: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <input
                    type="text"
                    value={condition.id}
                    onChange={(e) => updateCondition(index, 'id', e.target.value)}
                    placeholder="Branch ID"
                    style={{
                      fontSize: '13px',
                      fontWeight: 500,
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '1px solid var(--input-border)',
                      color: 'var(--text)',
                      padding: '2px 0',
                    }}
                  />
                  <button
                    onClick={() => removeCondition(index)}
                    style={{
                      color: 'var(--error)',
                      fontSize: '11px',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    Remove
                  </button>
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <label style={{ ...labelStyle, fontSize: '10px', color: 'var(--muted)' }}>Expression</label>
                  <input
                    type="text"
                    value={condition.expression}
                    onChange={(e) => updateCondition(index, 'expression', e.target.value)}
                    placeholder="{{ score >= 0.8 }}"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: '10px', color: 'var(--muted)' }}>Target</label>
                  {connected ? (
                    <div style={{
                      padding: '8px 12px',
                      background: 'color-mix(in srgb, var(--success) 10%, var(--panel))',
                      border: '1px solid var(--success)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: 'var(--success)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}>
                      <ArrowRight style={{ width: 12, height: 12 }} />
                      <span>{connected.label}</span>
                    </div>
                  ) : (
                    <div style={{
                      padding: '8px 12px',
                      background: 'var(--panel-2)',
                      border: '1px dashed var(--border)',
                      borderRadius: '6px',
                      fontSize: '11px',
                      color: 'var(--muted)',
                      fontStyle: 'italic',
                    }}>
                      Drag edge from condition handle to target node
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <label style={labelStyle}>Default Target</label>
        {connectedTargets['default'] ? (
          <div style={{
            padding: '8px 12px',
            background: 'color-mix(in srgb, var(--success) 10%, var(--panel))',
            border: '1px solid var(--success)',
            borderRadius: '6px',
            fontSize: '12px',
            color: 'var(--success)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <ArrowRight style={{ width: 12, height: 12 }} />
            <span>{connectedTargets['default'].label}</span>
          </div>
        ) : (
          <div style={{
            padding: '8px 12px',
            background: 'var(--panel-2)',
            border: '1px dashed var(--border)',
            borderRadius: '6px',
            fontSize: '11px',
            color: 'var(--muted)',
            fontStyle: 'italic',
          }}>
            Drag edge from default handle to target node
          </div>
        )}
      </div>
    </>
  )
}

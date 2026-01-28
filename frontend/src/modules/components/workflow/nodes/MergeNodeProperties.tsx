/**
 * MergeNodeProperties - Property editor for Merge nodes
 */

import type { MergeNodeData } from '../../../services/workflowTypes'
import { labelStyle, inputStyle, selectStyle } from '../shared/styles/propertyStyles'

export interface MergeNodePropertiesProps {
  data: MergeNodeData
  onChange: (field: string, value: unknown) => void
  nodeId?: string
}

export function MergeNodeProperties({ data, onChange }: MergeNodePropertiesProps) {
  const inputs = data.inputs || []
  const inputCount = Math.max(inputs.length, 2)

  const updateInputCount = (count: number) => {
    const newInputs = Array.from({ length: count }, (_, i) => inputs[i] || '')
    onChange('inputs', newInputs)
  }

  const updateInputExpression = (index: number, value: string) => {
    const newInputs = [...inputs]
    // Ensure array is long enough
    while (newInputs.length <= index) {
      newInputs.push('')
    }
    newInputs[index] = value
    onChange('inputs', newInputs)
  }

  return (
    <>
      {/* Number of Inputs */}
      <div>
        <label style={labelStyle}>Number of Inputs</label>
        <input
          type="number"
          value={inputCount}
          onChange={(e) => updateInputCount(Math.max(2, Math.min(10, parseInt(e.target.value, 10) || 2)))}
          min={2}
          max={10}
          style={inputStyle}
        />
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          Number of input connections to merge (2-10)
        </p>
      </div>

      {/* Input Expressions */}
      <div>
        <label style={labelStyle}>Input Mappings</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {Array.from({ length: inputCount }, (_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                fontSize: '11px',
                color: 'var(--text-secondary)',
                minWidth: '16px',
              }}>
                {i + 1}.
              </span>
              <input
                type="text"
                value={inputs[i] || ''}
                onChange={(e) => updateInputExpression(i, e.target.value)}
                placeholder={`{{ input_${i + 1} }}`}
                style={{
                  ...inputStyle,
                  flex: 1,
                  padding: '4px 8px',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                }}
              />
            </div>
          ))}
        </div>
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          Template expressions to extract from each input (optional)
        </p>
      </div>

      {/* Mode */}
      <div>
        <label style={labelStyle}>Mode</label>
        <select
          value={data.mode || 'wait'}
          onChange={(e) => onChange('mode', e.target.value)}
          style={selectStyle}
        >
          <option value="wait">Wait (collect all inputs)</option>
          <option value="transform">Transform (passthrough)</option>
        </select>
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          {(!data.mode || data.mode === 'wait') && 'Waits for all connected inputs before executing. Skipped branches are excluded.'}
          {data.mode === 'transform' && 'Executes immediately with whatever inputs are available (router/passthrough).'}
        </p>
      </div>

      {/* Merge Strategy */}
      <div>
        <label style={labelStyle}>Merge As</label>
        <select
          value={data.mergeAs || 'object'}
          onChange={(e) => onChange('mergeAs', e.target.value)}
          style={selectStyle}
        >
          <option value="object">Object (keyed by input)</option>
          <option value="array">Array (list of values)</option>
        </select>
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          {data.mergeAs === 'object' && 'Outputs an object with input keys as property names.'}
          {data.mergeAs === 'array' && 'Outputs an array of all input values in order.'}
        </p>
      </div>

      {/* Usage hint */}
      <div style={{
        marginTop: '8px',
        padding: '12px',
        background: 'var(--panel-2)',
        borderRadius: '6px',
        fontSize: '11px',
        color: 'var(--text-secondary)',
      }}>
        <strong style={{ color: 'var(--text)' }}>How to use:</strong>
        <p style={{ margin: '8px 0 0' }}>
          Connect multiple nodes to this merge node to combine their outputs into a single result.
          Use with Parallel to collect results from parallel branches.
        </p>
        <p style={{ margin: '8px 0 0' }}>
          <strong>Wait mode:</strong> Waits until all non-skipped inputs have produced output.
        </p>
        <p style={{ margin: '4px 0 0' }}>
          <strong>Transform mode:</strong> Passes through immediately, useful for routing/aggregation.
        </p>
      </div>
    </>
  )
}

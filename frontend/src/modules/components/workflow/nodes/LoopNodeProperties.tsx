/**
 * LoopNodeProperties - Property editor for Loop nodes
 */

import type { LoopNodeData } from '../../../services/workflowTypes'
import { labelStyle, inputStyle, selectStyle } from '../shared/styles/propertyStyles'

export interface LoopNodePropertiesProps {
  data: LoopNodeData
  onChange: (field: string, value: unknown) => void
  nodeId?: string
}

export function LoopNodeProperties({ data, onChange }: LoopNodePropertiesProps) {
  return (
    <>
      <div>
        <label style={labelStyle}>Loop Type</label>
        <select
          value={data.loopType || 'while'}
          onChange={(e) => onChange('loopType', e.target.value)}
          style={selectStyle}
        >
          <option value="while">While (condition)</option>
          <option value="for-each">For Each (items)</option>
          <option value="count">Count (fixed)</option>
        </select>
      </div>

      {data.loopType === 'while' && (
        <div>
          <label style={labelStyle}>Condition</label>
          <input
            type="text"
            value={data.condition || ''}
            onChange={(e) => onChange('condition', e.target.value)}
            placeholder="{{ iteration < 5 }}"
            style={inputStyle}
          />
        </div>
      )}

      {data.loopType === 'for-each' && (
        <>
          <div>
            <label style={labelStyle}>Items Expression</label>
            <input
              type="text"
              value={data.items || ''}
              onChange={(e) => onChange('items', e.target.value)}
              placeholder="{{ previous_output.items }}"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Item Variable Name</label>
            <input
              type="text"
              value={data.itemVariable || 'item'}
              onChange={(e) => onChange('itemVariable', e.target.value)}
              placeholder="item"
              style={inputStyle}
            />
          </div>
        </>
      )}

      {data.loopType === 'count' && (
        <div>
          <label style={labelStyle}>Count</label>
          <input
            type="number"
            value={data.count || 5}
            onChange={(e) => onChange('count', parseInt(e.target.value, 10))}
            min={1}
            style={inputStyle}
          />
        </div>
      )}

      <div>
        <label style={labelStyle}>Max Iterations (safety limit)</label>
        <input
          type="number"
          value={data.maxIterations || 10}
          onChange={(e) => onChange('maxIterations', parseInt(e.target.value, 10))}
          min={1}
          max={100}
          style={inputStyle}
        />
      </div>
    </>
  )
}

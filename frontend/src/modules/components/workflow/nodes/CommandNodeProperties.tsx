/**
 * CommandNodeProperties - Property editor for Command nodes
 */

import type { CommandNodeData } from '../../../services/workflowTypes'
import { labelStyle, inputStyle, selectStyle } from '../shared/styles/propertyStyles'

export interface CommandNodePropertiesProps {
  data: CommandNodeData
  onChange: (field: string, value: unknown) => void
  nodeId?: string
}

export function CommandNodeProperties({ data, onChange }: CommandNodePropertiesProps) {
  const outputFormatOptions = [
    { value: 'text', label: 'Plain Text', description: 'Raw command output as string' },
    { value: 'json', label: 'JSON', description: 'Parse output as JSON object' },
    { value: 'lines', label: 'Lines', description: 'Split output into array of lines' },
  ]

  return (
    <>
      {/* Command */}
      <div>
        <label style={labelStyle}>Command</label>
        <textarea
          value={data.command || ''}
          onChange={(e) => onChange('command', e.target.value)}
          style={{ ...inputStyle, minHeight: '60px', fontFamily: 'monospace', fontSize: '12px' }}
          placeholder='npm run build'
        />
        <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          Supports {'{{ }}'} expressions for dynamic values
        </div>
      </div>

      {/* Working Directory */}
      <div>
        <label style={labelStyle}>Working Directory</label>
        <input
          type="text"
          value={data.cwd || ''}
          onChange={(e) => onChange('cwd', e.target.value)}
          style={inputStyle}
          placeholder='./src (relative to workspace)'
        />
      </div>

      {/* Output Format */}
      <div>
        <label style={labelStyle}>Output Format</label>
        <select
          value={data.outputFormat || 'text'}
          onChange={(e) => onChange('outputFormat', e.target.value)}
          style={selectStyle}
        >
          {outputFormatOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          {outputFormatOptions.find(o => o.value === data.outputFormat)?.description || outputFormatOptions[0].description}
        </div>
      </div>

      {/* Timeout */}
      <div>
        <label style={labelStyle}>Timeout (ms)</label>
        <input
          type="number"
          min={0}
          step={1000}
          value={data.timeoutMs ?? 30000}
          onChange={(e) => onChange('timeoutMs', parseInt(e.target.value) || 30000)}
          style={inputStyle}
          placeholder='30000'
        />
      </div>

      {/* Requires Approval */}
      <div>
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12px',
          color: 'var(--text)',
          cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={data.requiresApproval ?? false}
            onChange={(e) => onChange('requiresApproval', e.target.checked)}
          />
          Require approval before execution
        </label>
      </div>

      {data.requiresApproval && (
        <div>
          <label style={labelStyle}>Approval Message</label>
          <input
            type="text"
            value={data.approvalMessage || ''}
            onChange={(e) => onChange('approvalMessage', e.target.value)}
            style={inputStyle}
            placeholder='This command will modify files...'
          />
        </div>
      )}
    </>
  )
}

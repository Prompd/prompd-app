/**
 * ClaudeCodeNodeProperties - Property editor for Claude Code nodes
 */

import type { ClaudeCodeNodeData } from '../../../services/workflowTypes'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import { labelStyle, inputStyle, selectStyle } from '../shared/styles/propertyStyles'


export interface ClaudeCodeNodePropertiesProps {
  data: ClaudeCodeNodeData
  onChange: (field: string, value: unknown) => void
  nodeId?: string
}

export function ClaudeCodeNodeProperties({ data, onChange }: ClaudeCodeNodePropertiesProps) {
  const connections = useWorkflowStore(state => state.connections)
  const sshConnections = connections.filter(c => c.type === 'ssh')

  const connectionType = data.connection?.type || 'local'

  const handleConnectionTypeChange = (type: 'local' | 'ssh') => {
    onChange('connection', {
      ...data.connection,
      type,
    })
  }

  const handleTaskChange = (field: string, value: unknown) => {
    onChange('task', {
      ...data.task,
      [field]: value,
    })
  }

  const handleConstraintsChange = (field: string, value: unknown) => {
    onChange('constraints', {
      ...data.constraints,
      [field]: value,
    })
  }

  const handleOutputChange = (field: string, value: unknown) => {
    onChange('output', {
      ...data.output,
      [field]: value,
    })
  }

  return (
    <>
      {/* Connection Type */}
      <div>
        <label style={labelStyle}>Connection Type</label>
        <div style={{
          display: 'flex',
          gap: '4px',
          padding: '4px',
          background: 'var(--panel-2)',
          borderRadius: '6px',
        }}>
          <button
            onClick={() => handleConnectionTypeChange('local')}
            style={{
              flex: 1,
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: 500,
              border: 'none',
              borderRadius: '4px',
              background: connectionType === 'local' ? 'var(--accent)' : 'transparent',
              color: connectionType === 'local' ? 'white' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            Local
          </button>
          <button
            onClick={() => handleConnectionTypeChange('ssh')}
            style={{
              flex: 1,
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: 500,
              border: 'none',
              borderRadius: '4px',
              background: connectionType === 'ssh' ? 'var(--accent)' : 'transparent',
              color: connectionType === 'ssh' ? 'white' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            SSH
          </button>
        </div>
      </div>

      {/* SSH Connection Selector */}
      {connectionType === 'ssh' && (
        <div>
          <label style={labelStyle}>SSH Connection</label>
          <select
            value={data.connection?.ssh?.connectionId || ''}
            onChange={(e) => onChange('connection', {
              ...data.connection,
              ssh: { ...data.connection?.ssh, connectionId: e.target.value || undefined },
            })}
            style={selectStyle}
          >
            <option value="">Select connection...</option>
            {sshConnections.map(conn => (
              <option key={conn.id} value={conn.id}>
                {conn.name}
              </option>
            ))}
          </select>
          {sshConnections.length === 0 && (
            <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--warning)' }}>
              No SSH connections configured. Add one in Connections panel.
            </div>
          )}
        </div>
      )}

      {/* Task Prompt */}
      <div>
        <label style={labelStyle}>Task Prompt</label>
        <textarea
          value={data.task?.prompt || ''}
          onChange={(e) => handleTaskChange('prompt', e.target.value)}
          style={{ ...inputStyle, minHeight: '100px' }}
          placeholder='Describe what Claude Code should do...'
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
          value={data.task?.workingDirectory || ''}
          onChange={(e) => handleTaskChange('workingDirectory', e.target.value)}
          style={inputStyle}
          placeholder='/path/to/project'
        />
      </div>

      {/* Max Turns */}
      <div>
        <label style={labelStyle}>Max Turns</label>
        <input
          type="number"
          min={1}
          max={200}
          value={data.constraints?.maxTurns ?? 50}
          onChange={(e) => handleConstraintsChange('maxTurns', parseInt(e.target.value) || 50)}
          style={inputStyle}
        />
        <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          Maximum agent iterations before forcing completion
        </div>
      </div>

      {/* Output Format */}
      <div>
        <label style={labelStyle}>Output Format</label>
        <select
          value={data.output?.format || 'final-response'}
          onChange={(e) => handleOutputChange('format', e.target.value)}
          style={selectStyle}
        >
          <option value="final-response">Final Response</option>
          <option value="full-conversation">Full Conversation</option>
          <option value="files-changed">Files Changed</option>
          <option value="structured">Structured (JSON Schema)</option>
        </select>
      </div>

      {/* Require Approval for Writes */}
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
            checked={data.constraints?.requireApprovalForWrites ?? false}
            onChange={(e) => handleConstraintsChange('requireApprovalForWrites', e.target.checked)}
          />
          Require approval for file writes
        </label>
      </div>
    </>
  )
}

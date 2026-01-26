/**
 * MemoryNodeProperties - Property editor for Memory nodes
 */

import { Key } from 'lucide-react'
import type { MemoryNodeData } from '../../../services/workflowTypes'
import { labelStyle, inputStyle, selectStyle } from '../shared/styles/propertyStyles'

export interface MemoryNodePropertiesProps {
  data: MemoryNodeData
  onChange: (field: string, value: unknown) => void
  nodeId?: string
}

export function MemoryNodeProperties({ data, onChange }: MemoryNodePropertiesProps) {
  const modeOptions = [
    { value: 'kv', label: 'Key-Value', description: 'Dictionary storage for passing state between nodes' },
    { value: 'conversation', label: 'Conversation', description: 'Message history with sliding window for chat context' },
    { value: 'cache', label: 'Cache', description: 'TTL-based storage for caching expensive operations' },
  ]

  const operationOptions: Record<string, { value: string; label: string; description: string }[]> = {
    kv: [
      { value: 'get', label: 'Get', description: 'Retrieve a value by key' },
      { value: 'set', label: 'Set', description: 'Store a value with a key' },
      { value: 'delete', label: 'Delete', description: 'Remove a key-value pair' },
      { value: 'list', label: 'List Keys', description: 'Get all stored keys' },
      { value: 'clear', label: 'Clear', description: 'Remove all stored data' },
    ],
    conversation: [
      { value: 'get', label: 'Get', description: 'Retrieve conversation history' },
      { value: 'append', label: 'Append', description: 'Add a message to conversation' },
      { value: 'clear', label: 'Clear', description: 'Clear conversation history' },
    ],
    cache: [
      { value: 'get', label: 'Get', description: 'Retrieve cached value' },
      { value: 'set', label: 'Set', description: 'Cache a value with TTL' },
      { value: 'delete', label: 'Delete', description: 'Invalidate cached entry' },
      { value: 'clear', label: 'Clear', description: 'Clear entire cache' },
    ],
  }

  const scopeOptions = [
    { value: 'execution', label: 'Execution', description: 'Cleared when workflow execution completes' },
    { value: 'workflow', label: 'Workflow', description: 'Persists across executions of this workflow' },
    { value: 'global', label: 'Global', description: 'Shared across all workflows (use with caution)' },
  ]

  const outputModeOptions = [
    { value: 'value', label: 'Value', description: 'Output the retrieved/stored value' },
    { value: 'success', label: 'Success', description: 'Output boolean success indicator' },
    { value: 'metadata', label: 'Metadata', description: 'Output object with value, timestamp, ttl info' },
    { value: 'passthrough', label: 'Passthrough', description: 'Pass input through unchanged' },
  ]

  const roleOptions = [
    { value: 'user', label: 'User' },
    { value: 'assistant', label: 'Assistant' },
    { value: 'system', label: 'System' },
  ]

  const mode = data.mode || 'kv'
  // Support both old 'operation' (single) and new 'operations' (array)
  const operations: string[] = data.operations || ((data as { operation?: string }).operation ? [(data as { operation?: string }).operation!] : ['get'])
  const ops = operationOptions[mode] || operationOptions.kv

  // Toggle an operation on/off
  const toggleOperation = (opValue: string) => {
    const current = operations || []
    const isActive = current.includes(opValue)
    let updated: string[]

    if (isActive) {
      // Remove operation (but keep at least one)
      updated = current.filter(o => o !== opValue)
      if (updated.length === 0) {
        updated = [opValue] // Keep at least one operation
        return
      }
    } else {
      // Add operation
      updated = [...current, opValue]
    }

    onChange('operations', updated)
  }

  return (
    <>
      {/* Mode Selection */}
      <div>
        <label style={labelStyle}>Memory Mode</label>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          {modeOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => {
                onChange('mode', opt.value)
                // Reset operations when mode changes to first operation of new mode
                const firstOp = operationOptions[opt.value]?.[0]?.value || 'get'
                onChange('operations', [firstOp])
              }}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: mode === opt.value ? 'var(--accent)' : 'var(--input-bg)',
                color: mode === opt.value ? 'white' : 'var(--text)',
                border: '1px solid var(--input-border)',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
          {modeOptions.find(o => o.value === mode)?.description}
        </div>
      </div>

      {/* Operations Selection - Multi-select toggles */}
      <div>
        <label style={labelStyle}>Operations</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
          {ops.map(opt => {
            const isActive = operations.includes(opt.value)
            return (
              <button
                key={opt.value}
                onClick={() => toggleOperation(opt.value)}
                title={opt.description}
                style={{
                  padding: '6px 12px',
                  background: isActive ? 'var(--accent)' : 'var(--input-bg)',
                  color: isActive ? 'white' : 'var(--text)',
                  border: `1px solid ${isActive ? 'var(--accent)' : 'var(--input-border)'}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 500,
                  transition: 'all 0.15s ease',
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
          {operations.length === 1
            ? ops.find(o => o.value === operations[0])?.description || 'Select operations this node can perform'
            : `${operations.length} operations enabled - input data determines which to execute`}
        </div>
      </div>

      {/* Key-Value Mode Fields */}
      {mode === 'kv' && (operations.includes('get') || operations.includes('set') || operations.includes('delete')) && (
        <div>
          <label style={labelStyle}>
            <Key style={{ width: 12, height: 12, display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
            Key
          </label>
          <input
            type="text"
            value={data.key || ''}
            onChange={(e) => onChange('key', e.target.value)}
            style={{ ...inputStyle, fontFamily: 'monospace' }}
            placeholder="my_key or {{ node_id.field }}"
          />
          <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
            Supports {'{{ }}'} template expressions
          </div>
        </div>
      )}

      {mode === 'kv' && operations.includes('set') && (
        <div>
          <label style={labelStyle}>Value</label>
          <input
            type="text"
            value={data.value || ''}
            onChange={(e) => onChange('value', e.target.value)}
            style={{ ...inputStyle, fontFamily: 'monospace' }}
            placeholder="Leave empty to use input data"
          />
          <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
            If empty, stores the input data from the previous node
          </div>
        </div>
      )}

      {mode === 'kv' && operations.includes('get') && (
        <div>
          <label style={labelStyle}>Default Value</label>
          <input
            type="text"
            value={data.defaultValue || ''}
            onChange={(e) => onChange('defaultValue', e.target.value)}
            style={{ ...inputStyle, fontFamily: 'monospace' }}
            placeholder="Value if key not found"
          />
        </div>
      )}

      {/* Conversation Mode Fields */}
      {mode === 'conversation' && (
        <>
          <div>
            <label style={labelStyle}>Conversation ID</label>
            <input
              type="text"
              value={data.conversationId || ''}
              onChange={(e) => onChange('conversationId', e.target.value)}
              style={{ ...inputStyle, fontFamily: 'monospace' }}
              placeholder="default or {{ user_id }}"
            />
            <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
              Identifier for separate conversation threads
            </div>
          </div>

          {operations.includes('append') && (
            <div>
              <label style={labelStyle}>Message Role</label>
              <select
                value={data.messageRole || 'user'}
                onChange={(e) => onChange('messageRole', e.target.value)}
                style={selectStyle}
              >
                {roleOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label style={labelStyle}>Max Messages (Sliding Window)</label>
            <input
              type="number"
              value={data.maxMessages ?? ''}
              onChange={(e) => onChange('maxMessages', e.target.value ? parseInt(e.target.value) : undefined)}
              style={inputStyle}
              placeholder="0 = unlimited"
              min={0}
            />
            <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
              Older messages removed when limit exceeded. 0 or empty = unlimited.
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
            <input
              type="checkbox"
              id="includeSystemInWindow"
              checked={data.includeSystemInWindow ?? true}
              onChange={(e) => onChange('includeSystemInWindow', e.target.checked)}
            />
            <label htmlFor="includeSystemInWindow" style={{ fontSize: '12px' }}>
              Include system messages in window count
            </label>
          </div>
        </>
      )}

      {/* Cache Mode Fields */}
      {mode === 'cache' && (operations.includes('get') || operations.includes('set') || operations.includes('delete')) && (
        <div>
          <label style={labelStyle}>
            <Key style={{ width: 12, height: 12, display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
            Cache Key
          </label>
          <input
            type="text"
            value={data.key || ''}
            onChange={(e) => onChange('key', e.target.value)}
            style={{ ...inputStyle, fontFamily: 'monospace' }}
            placeholder="cache_key or {{ node_id.field }}"
          />
        </div>
      )}

      {mode === 'cache' && operations.includes('set') && (
        <>
          <div>
            <label style={labelStyle}>Value</label>
            <input
              type="text"
              value={data.value || ''}
              onChange={(e) => onChange('value', e.target.value)}
              style={{ ...inputStyle, fontFamily: 'monospace' }}
              placeholder="Leave empty to cache input data"
            />
          </div>

          <div>
            <label style={labelStyle}>TTL (seconds)</label>
            <input
              type="number"
              value={data.ttlSeconds ?? ''}
              onChange={(e) => onChange('ttlSeconds', e.target.value ? parseInt(e.target.value) : undefined)}
              style={inputStyle}
              placeholder="0 = no expiration"
              min={0}
            />
            <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
              Time-to-live in seconds. 0 or empty = never expires.
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
            <input
              type="checkbox"
              id="refreshOnRead"
              checked={data.refreshOnRead ?? false}
              onChange={(e) => onChange('refreshOnRead', e.target.checked)}
            />
            <label htmlFor="refreshOnRead" style={{ fontSize: '12px' }}>
              Refresh TTL on read (sliding expiration)
            </label>
          </div>
        </>
      )}

      {mode === 'cache' && operations.includes('get') && (
        <div>
          <label style={labelStyle}>Default Value</label>
          <input
            type="text"
            value={data.defaultValue || ''}
            onChange={(e) => onChange('defaultValue', e.target.value)}
            style={{ ...inputStyle, fontFamily: 'monospace' }}
            placeholder="Value if cache miss or expired"
          />
        </div>
      )}

      {/* Scope & Namespace (all modes) */}
      <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
        <label style={{ ...labelStyle, fontSize: '13px', marginBottom: '12px' }}>Storage Scope</label>

        <div>
          <label style={labelStyle}>Scope</label>
          <select
            value={data.scope || 'execution'}
            onChange={(e) => onChange('scope', e.target.value)}
            style={selectStyle}
          >
            {scopeOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
            {scopeOptions.find(o => o.value === (data.scope || 'execution'))?.description}
          </div>
        </div>

        <div style={{ marginTop: '12px' }}>
          <label style={labelStyle}>Namespace</label>
          <input
            type="text"
            value={data.namespace || ''}
            onChange={(e) => onChange('namespace', e.target.value)}
            style={{ ...inputStyle, fontFamily: 'monospace' }}
            placeholder="Optional namespace for isolation"
          />
          <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
            Prevents key collisions, especially in global scope
          </div>
        </div>
      </div>

      {/* Output Mode */}
      <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
        <label style={labelStyle}>Output Mode</label>
        <select
          value={data.outputMode || 'value'}
          onChange={(e) => onChange('outputMode', e.target.value)}
          style={selectStyle}
        >
          {outputModeOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          {outputModeOptions.find(o => o.value === (data.outputMode || 'value'))?.description}
        </div>
      </div>
    </>
  )
}

/**
 * ErrorHandlerNodeProperties - Property editor for Error Handler nodes
 */

import type { ErrorHandlerNodeData } from '../../../services/workflowTypes'
import { labelStyle, inputStyle, selectStyle } from '../shared/styles/propertyStyles'

export interface ErrorHandlerNodePropertiesProps {
  data: ErrorHandlerNodeData
  onChange: (field: string, value: unknown) => void
  nodeId?: string
}

export function ErrorHandlerNodeProperties({ data, onChange }: ErrorHandlerNodePropertiesProps) {
  const strategyOptions = [
    { value: 'retry', label: 'Retry', description: 'Retry the operation with exponential backoff' },
    { value: 'fallback', label: 'Fallback', description: 'Return a fallback value or execute fallback node' },
    { value: 'notify', label: 'Notify', description: 'Send notification and continue' },
    { value: 'ignore', label: 'Ignore', description: 'Swallow the error and continue with null' },
    { value: 'rethrow', label: 'Rethrow', description: 'Re-throw the error to stop execution' },
  ]

  return (
    <>
      {/* Strategy Selection */}
      <div>
        <label style={labelStyle}>Strategy</label>
        <select
          value={data.strategy || 'retry'}
          onChange={(e) => onChange('strategy', e.target.value)}
          style={selectStyle}
        >
          {strategyOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <div style={{
          marginTop: '4px',
          fontSize: '11px',
          color: 'var(--text-secondary)',
        }}>
          {strategyOptions.find(o => o.value === data.strategy)?.description}
        </div>
      </div>

      {/* Retry Configuration */}
      {data.strategy === 'retry' && (
        <>
          <div>
            <label style={labelStyle}>Max Attempts</label>
            <input
              type="number"
              min={1}
              max={10}
              value={data.retry?.maxAttempts ?? 3}
              onChange={(e) => onChange('retry', {
                ...data.retry,
                maxAttempts: parseInt(e.target.value) || 3,
              })}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Initial Backoff (ms)</label>
            <input
              type="number"
              min={100}
              step={100}
              value={data.retry?.backoffMs ?? 1000}
              onChange={(e) => onChange('retry', {
                ...data.retry,
                backoffMs: parseInt(e.target.value) || 1000,
              })}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Backoff Multiplier</label>
            <input
              type="number"
              min={1}
              max={5}
              step={0.5}
              value={data.retry?.backoffMultiplier ?? 2}
              onChange={(e) => onChange('retry', {
                ...data.retry,
                backoffMultiplier: parseFloat(e.target.value) || 2,
              })}
              style={inputStyle}
            />
            <div style={{
              marginTop: '4px',
              fontSize: '11px',
              color: 'var(--text-secondary)',
            }}>
              Each retry waits {data.retry?.backoffMultiplier || 2}x longer than the previous
            </div>
          </div>
        </>
      )}

      {/* Fallback Configuration */}
      {data.strategy === 'fallback' && (
        <>
          <div>
            <label style={labelStyle}>Fallback Type</label>
            <select
              value={data.fallback?.type || 'value'}
              onChange={(e) => onChange('fallback', {
                ...data.fallback,
                type: e.target.value as 'value' | 'template' | 'node',
              })}
              style={selectStyle}
            >
              <option value="value">Static Value</option>
              <option value="template">Template Expression</option>
              <option value="node">Fallback Node</option>
            </select>
          </div>

          {data.fallback?.type === 'value' && (
            <div>
              <label style={labelStyle}>Fallback Value (JSON)</label>
              <textarea
                value={typeof data.fallback?.value === 'string'
                  ? data.fallback.value
                  : JSON.stringify(data.fallback?.value ?? null, null, 2)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value)
                    onChange('fallback', { ...data.fallback, value: parsed })
                  } catch {
                    onChange('fallback', { ...data.fallback, value: e.target.value })
                  }
                }}
                style={{ ...inputStyle, minHeight: '80px', fontFamily: 'monospace', fontSize: '11px' }}
                placeholder='null'
              />
            </div>
          )}

          {data.fallback?.type === 'template' && (
            <div>
              <label style={labelStyle}>Template Expression</label>
              <input
                type="text"
                value={data.fallback?.template || ''}
                onChange={(e) => onChange('fallback', {
                  ...data.fallback,
                  template: e.target.value,
                })}
                style={inputStyle}
                placeholder='{{ error.message }}'
              />
            </div>
          )}
        </>
      )}

      {/* Notification Configuration */}
      {(data.strategy === 'notify' || data.notify?.webhookUrl) && (
        <>
          <div>
            <label style={labelStyle}>Webhook URL</label>
            <input
              type="url"
              value={data.notify?.webhookUrl || ''}
              onChange={(e) => onChange('notify', {
                ...data.notify,
                webhookUrl: e.target.value,
              })}
              style={inputStyle}
              placeholder='https://hooks.slack.com/...'
            />
          </div>

          <div style={{ display: 'flex', gap: '16px' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: 'var(--text)',
              cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={data.notify?.includeStack ?? false}
                onChange={(e) => onChange('notify', {
                  ...data.notify,
                  includeStack: e.target.checked,
                })}
              />
              Include stack trace
            </label>

            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: 'var(--text)',
              cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={data.notify?.includeContext ?? false}
                onChange={(e) => onChange('notify', {
                  ...data.notify,
                  includeContext: e.target.checked,
                })}
              />
              Include context
            </label>
          </div>
        </>
      )}

      {/* Description */}
      <div>
        <label style={labelStyle}>Description</label>
        <textarea
          value={data.description || ''}
          onChange={(e) => onChange('description', e.target.value)}
          style={{ ...inputStyle, minHeight: '60px' }}
          placeholder='Describe when this error handler should be used...'
        />
      </div>

      {/* Info box */}
      <div style={{
        marginTop: '8px',
        padding: '12px',
        background: 'color-mix(in srgb, var(--node-rose) 10%, transparent)',
        borderRadius: '6px',
        fontSize: '11px',
        color: 'var(--text-secondary)',
      }}>
        <strong style={{ color: 'var(--node-rose)' }}>Config Node:</strong>
        <div style={{ marginTop: '4px' }}>
          This node doesn't participate in data flow. Other nodes reference it via the Error Handler dropdown.
        </div>
      </div>
    </>
  )
}

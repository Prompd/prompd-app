/**
 * GuardrailNodeProperties - Property editor for Guardrail nodes
 */

import { Cpu } from 'lucide-react'
import type { GuardrailNodeData } from '../../../services/workflowTypes'
import { labelStyle, inputStyle, selectStyle } from '../shared/styles/propertyStyles'
import { LLMProviderConfig } from '../shared/property-components/LLMProviderConfig'

export interface GuardrailNodePropertiesProps {
  data: GuardrailNodeData
  onChange: (field: string, value: unknown) => void
  nodeId?: string
}

export function GuardrailNodeProperties({ data, onChange }: GuardrailNodePropertiesProps) {
  return (
    <>
      {/* System Prompt */}
      <div>
        <label style={labelStyle}>Validation System Prompt</label>
        <textarea
          value={data.systemPrompt || ''}
          onChange={(e) => onChange('systemPrompt', e.target.value)}
          placeholder="Define validation criteria..."
          rows={6}
          style={{
            ...inputStyle,
            resize: 'vertical',
            minHeight: '120px',
            fontFamily: 'monospace',
            fontSize: '12px',
          }}
        />
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          LLM will evaluate input against these criteria.
        </p>
      </div>

      {/* Guardrail LLM Provider Config */}
      <div style={{
        padding: '12px',
        background: 'var(--panel-2)',
        borderRadius: '6px',
        border: '1px solid var(--border)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginBottom: '12px',
          fontSize: '12px',
          fontWeight: 500,
          color: 'var(--text-secondary)',
        }}>
          <Cpu style={{ width: 12, height: 12 }} />
          LLM Provider
        </div>
        <LLMProviderConfig
          providerNodeId={data.providerNodeId}
          provider={data.provider}
          model={data.model}
          onProviderNodeChange={(nodeId) => onChange('providerNodeId', nodeId)}
          onProviderChange={(providerId) => onChange('provider', providerId)}
          onModelChange={(model) => onChange('model', model)}
        />
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '8px' }}>
          Tip: Use a fast, cheap model for guardrails (e.g., gpt-4o-mini, claude-3-haiku).
        </p>
      </div>

      {/* Temperature */}
      <div>
        <label style={labelStyle}>Temperature</label>
        <input
          type="number"
          value={data.temperature ?? 0}
          onChange={(e) => onChange('temperature', parseFloat(e.target.value) || 0)}
          min={0}
          max={2}
          step={0.1}
          style={{ ...inputStyle, width: '80px' }}
        />
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          Lower temperatures (0-0.3) recommended for consistent validation.
        </p>
      </div>

      {/* Validation Method Selection */}
      <div>
        <label style={labelStyle}>Validation Method</label>
        <select
          value={data.passExpression ? 'expression' : 'threshold'}
          onChange={(e) => {
            if (e.target.value === 'expression' && !data.passExpression) {
              onChange('passExpression', '{{ input.valid == true }}')
            } else if (e.target.value === 'threshold') {
              onChange('passExpression', '')
            }
          }}
          style={inputStyle}
        >
          <option value="expression">Pass Expression</option>
          <option value="threshold">Score Threshold</option>
        </select>

        {/* Conditional input based on selection */}
        <div style={{ marginTop: '8px' }}>
          {data.passExpression ? (
            <>
              <input
                type="text"
                value={data.passExpression}
                onChange={(e) => onChange('passExpression', e.target.value)}
                placeholder="{{ input.valid == true }}"
                style={{
                  ...inputStyle,
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  width: '100%',
                }}
              />
              <p style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px', marginBottom: 0 }}>
                Evaluate LLM response with template expressions
              </p>
            </>
          ) : (
            <>
              <input
                type="number"
                value={data.scoreThreshold ?? 0.8}
                onChange={(e) => onChange('scoreThreshold', parseFloat(e.target.value) || 0.8)}
                min={0}
                max={1}
                step={0.05}
                style={{ ...inputStyle, width: '80px' }}
              />
              <p style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px', marginBottom: 0 }}>
                Minimum score (0-1) required to pass
              </p>
            </>
          )}
        </div>
      </div>
    </>
  )
}

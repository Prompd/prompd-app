/**
 * ProviderNodeProperties - Property editor for Provider nodes
 */

import { useUIStore } from '../../../../stores/uiStore'
import { ProviderModelSelector } from '../../ProviderModelSelector'
import type { ProviderNodeData } from '../../../services/workflowTypes'
import { labelStyle, inputStyle } from '../shared/styles/propertyStyles'

export interface ProviderNodePropertiesProps {
  data: ProviderNodeData
  onChange: (field: string, value: unknown) => void
  nodeId?: string
}

export function ProviderNodeProperties({ data, onChange }: ProviderNodePropertiesProps) {
  const providersWithPricing = useUIStore(state => state.llmProvider.providersWithPricing)

  return (
    <>
      {/* Description */}
      <div>
        <label style={labelStyle}>Description (optional)</label>
        <input
          type="text"
          value={data.description || ''}
          onChange={(e) => onChange('description', e.target.value)}
          placeholder="e.g., Fast model for quick tasks"
          style={inputStyle}
        />
      </div>

      {/* Provider & Model Selector */}
      <div>
        <label style={labelStyle}>Provider & Model</label>
        <ProviderModelSelector
          providers={providersWithPricing || []}
          selectedProvider={data.providerId || ''}
          selectedModel={data.model || ''}
          onProviderChange={(providerId) => onChange('providerId', providerId)}
          onModelChange={(model) => onChange('model', model)}
          layout="vertical"
          forceDropdown={true}
        />
      </div>

      {/* Advanced options */}
      <div style={{ paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
        <h4 style={{
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          marginBottom: '12px',
        }}>
          Advanced Options
        </h4>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Temperature</label>
            <input
              type="number"
              value={data.temperature ?? ''}
              onChange={(e) => onChange('temperature', e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="Default"
              min={0}
              max={2}
              step={0.1}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Max Tokens</label>
            <input
              type="number"
              value={data.maxTokens ?? ''}
              onChange={(e) => onChange('maxTokens', e.target.value ? parseInt(e.target.value, 10) : undefined)}
              placeholder="Default"
              min={1}
              style={inputStyle}
            />
          </div>
        </div>
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
          Connect this provider node to Prompt nodes via the properties panel.
          All connected prompts will use this provider configuration.
        </p>
      </div>
    </>
  )
}

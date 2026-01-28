/**
 * LLMProviderConfig - Wrapper component for Node/Inline provider selection
 * Combines toggle for Node vs Inline mode with the appropriate UI for each:
 * - Node mode: Provider node dropdown selector
 * - Inline mode: ProviderModelSelector component
 */

import { Link2, Cpu } from 'lucide-react'
import { useUIStore } from '../../../../../stores/uiStore'
import { ProviderModelSelector } from '../../../ProviderModelSelector'
import { useProviderNodes } from '../hooks/useProviderNodes'
import { labelStyle, selectStyle } from '../styles/propertyStyles'

export interface LLMProviderConfigProps {
  /** Reference to a Provider node by ID (when using Node mode) */
  providerNodeId?: string
  /** Provider ID (when using Inline mode) */
  provider?: string
  /** Model ID (when using Inline mode) */
  model?: string
  /** Called when providerNodeId changes */
  onProviderNodeChange: (nodeId: string | undefined) => void
  /** Called when inline provider changes */
  onProviderChange: (providerId: string | undefined) => void
  /** Called when inline model changes */
  onModelChange: (model: string | undefined) => void
  /** Optional label for the section */
  label?: string
}

export function LLMProviderConfig({
  providerNodeId,
  provider,
  model,
  onProviderNodeChange,
  onProviderChange,
  onModelChange,
  label = 'LLM Provider',
}: LLMProviderConfigProps) {
  const providerNodes = useProviderNodes()
  const providersWithPricing = useUIStore(state => state.llmProvider.providersWithPricing)

  const useProviderNode = !!providerNodeId
  const selectedProviderNode = providerNodes.find(p => p.node.id === providerNodeId)
  const selectedProviderData = selectedProviderNode?.data

  // Get available providers for inline mode
  const availableProviders = (providersWithPricing || []).filter(p => p.hasKey)

  const handleProviderModeChange = (useNode: boolean) => {
    if (useNode) {
      // Switch to Node mode
      onProviderChange(undefined)
      onModelChange(undefined)
      if (providerNodes.length > 0) {
        onProviderNodeChange(providerNodes[0].node.id)
      }
    } else {
      // Switch to Inline mode
      onProviderNodeChange(undefined)
      if (availableProviders.length > 0) {
        onProviderChange(availableProviders[0].providerId)
        onModelChange(availableProviders[0].models[0]?.model || '')
      } else {
        onProviderChange('openai')
      }
    }
  }

  return (
    <>
      {/* Provider Mode Toggle */}
      <div>
        <label style={labelStyle}>{label}</label>
        <div style={{
          display: 'flex',
          gap: '4px',
          padding: '4px',
          background: 'var(--panel-2)',
          borderRadius: '6px',
          marginBottom: '8px',
        }}>
          <button
            onClick={() => handleProviderModeChange(true)}
            disabled={providerNodes.length === 0}
            style={{
              flex: 1,
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: 500,
              border: 'none',
              borderRadius: '4px',
              background: useProviderNode ? 'var(--accent)' : 'transparent',
              color: useProviderNode ? 'white' : providerNodes.length === 0 ? 'var(--muted)' : 'var(--text-secondary)',
              cursor: providerNodes.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              opacity: providerNodes.length === 0 ? 0.5 : 1,
            }}
            title={providerNodes.length === 0 ? 'Add a Provider node first' : 'Use a Provider node'}
          >
            <Link2 size={12} />
            Node
          </button>
          <button
            onClick={() => handleProviderModeChange(false)}
            style={{
              flex: 1,
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: 500,
              border: 'none',
              borderRadius: '4px',
              background: !useProviderNode ? 'var(--accent)' : 'transparent',
              color: !useProviderNode ? 'white' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            Inline
          </button>
        </div>
      </div>

      {/* Provider Node Selector */}
      {useProviderNode && (
        <div>
          <label style={labelStyle}>Provider Node</label>
          {providerNodes.length === 0 ? (
            <div style={{
              padding: '10px',
              background: 'var(--panel-2)',
              borderRadius: '6px',
              fontSize: '11px',
              color: 'var(--text-secondary)',
              fontStyle: 'italic',
            }}>
              No Provider nodes in workflow. Add one from the palette.
            </div>
          ) : (
            <>
              <select
                value={providerNodeId || ''}
                onChange={(e) => onProviderNodeChange(e.target.value)}
                style={selectStyle}
              >
                <option value="">Select a provider node...</option>
                {providerNodes.map(({ node, data }) => (
                  <option key={node.id} value={node.id}>
                    {data.label || node.id} ({data.providerId}/{data.model})
                  </option>
                ))}
              </select>
              {selectedProviderData && (
                <div style={{
                  marginTop: '8px',
                  padding: '8px',
                  background: 'color-mix(in srgb, var(--node-rose) 10%, transparent)',
                  borderRadius: '6px',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}>
                  <Cpu size={14} style={{ color: 'var(--node-rose)' }} />
                  <div>
                    <div style={{ fontWeight: 500, color: 'var(--text)' }}>
                      {selectedProviderData.providerId}
                    </div>
                    <div style={{ color: 'var(--text-secondary)' }}>
                      {selectedProviderData.model}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Inline Provider/Model - uses ProviderModelSelector component */}
      {!useProviderNode && (
        <div style={{
          border: '1px solid var(--border)',
          borderRadius: '6px',
          overflow: 'hidden',
        }}>
          <ProviderModelSelector
            providers={providersWithPricing || []}
            selectedProvider={provider || ''}
            selectedModel={model || ''}
            onProviderChange={(providerId) => onProviderChange(providerId)}
            onModelChange={(m) => onModelChange(m)}
            layout="vertical"
            forceDropdown={true}
            shrinkModel={true}
          />
        </div>
      )}
    </>
  )
}

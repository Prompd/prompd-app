/**
 * ProviderNode - Custom React Flow node for LLM provider configuration
 *
 * This node centralizes provider/model selection so multiple prompt nodes
 * can reference the same configuration. Changes to this node automatically
 * affect all prompt nodes that reference it.
 */

import { memo, useCallback, useState } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Cpu, ChevronDown, Check } from 'lucide-react'
import type { ProviderNodeData, BaseNodeData } from '../../../services/workflowTypes'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import { useUIStore } from '../../../../stores/uiStore'
import type { ProviderWithPricing, ModelWithPricing } from '../../../../stores/uiStore'
import { formatPricePerMillion } from '../../../lib/formatters'

interface ProviderNodeProps {
  id: string
  data: BaseNodeData
  selected?: boolean
}

// Shared styles
const containerStyle = (selected: boolean, minWidth: number): React.CSSProperties => ({
  padding: '12px 16px',
  borderRadius: '8px',
  minWidth,
  background: 'var(--panel)',
  border: `2px ${selected ? 'solid var(--node-rose)' : 'dashed var(--node-rose)'}`,
  boxShadow: selected ? '0 0 0 2px color-mix(in srgb, var(--node-rose) 30%, transparent)' : '0 2px 4px rgba(0,0,0,0.1)',
  transition: 'border-color 0.2s, box-shadow 0.2s',
})

const handleStyle: React.CSSProperties = {
  width: 12,
  height: 12,
  background: 'var(--node-green)',
  border: '2px solid var(--rose)',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '10px',
}

// Shared header component
function ProviderHeader({ label }: { label: string }) {
  return (
    <div style={headerStyle}>
      <Cpu style={{ width: 16, height: 16, color: 'var(--node-rose)' }} />
      <span style={{ fontWeight: 500, fontSize: '13px', color: 'var(--text)' }}>
        {label || 'Provider'}
      </span>
    </div>
  )
}

// Shared handle component
function ProviderHandle() {
  return (
    <Handle
      type="source"
      position={Position.Right}
      id="provider-config"
      style={handleStyle}
    />
  )
}

export const ProviderNode = memo(({ id, data, selected }: ProviderNodeProps) => {
  const nodeData = data as ProviderNodeData
  const updateNodeData = useWorkflowStore(state => state.updateNodeData)

  // Get providers from UI store (initialized at app level)
  const providersWithPricing = useUIStore(state => state.llmProvider.providersWithPricing)

  // Filter to available providers (those with API keys)
  const availableProviders = (providersWithPricing || []).filter(p => p.hasKey)

  // Current provider and model
  const currentProvider = availableProviders.find(p => p.providerId === nodeData.providerId)
    || availableProviders[0]
  const currentModels = currentProvider?.models || []
  const currentModel = currentModels.find(m => m.model === nodeData.model)
    || currentModels[0]

  // Dropdown states
  const [showProviderDropdown, setShowProviderDropdown] = useState(false)
  const [showModelDropdown, setShowModelDropdown] = useState(false)

  // Update provider
  const handleProviderChange = useCallback((providerId: string) => {
    const provider = availableProviders.find(p => p.providerId === providerId)
    if (provider) {
      // Find cheapest model in this provider
      const cheapestModel = provider.models.reduce((cheapest, model) => {
        const modelCost = (model.inputPrice ?? Infinity) + (model.outputPrice ?? Infinity)
        const cheapestCost = (cheapest.inputPrice ?? Infinity) + (cheapest.outputPrice ?? Infinity)
        return modelCost < cheapestCost ? model : cheapest
      }, provider.models[0])

      updateNodeData(id, {
        providerId,
        model: cheapestModel?.model || provider.models[0]?.model || ''
      })
    }
    setShowProviderDropdown(false)
  }, [id, updateNodeData, availableProviders])

  // Update model
  const handleModelChange = useCallback((model: string) => {
    updateNodeData(id, { model })
    setShowModelDropdown(false)
  }, [id, updateNodeData])

  // Stop propagation for clicks within node to prevent node selection issues
  const stopPropagation = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
  }, [])

  // No providers available - show empty state
  if (availableProviders.length === 0) {
    return (
      <div style={containerStyle(selected ?? false, 200)}>
        <ProviderHandle />
        <ProviderHeader label={nodeData.label} />
        <div style={{ fontSize: '11px', color: 'var(--error)' }}>
          No API keys configured
        </div>
      </div>
    )
  }

  return (
    <div
      className={nodeData.disabled ? 'workflow-node-disabled' : ''}
      style={containerStyle(selected ?? false, 220)}
      onMouseDown={stopPropagation}
    >
      <ProviderHandle />
      <ProviderHeader label={nodeData.label} />

      {/* Provider Selector */}
      <div style={{ marginBottom: '8px', position: 'relative' }}>
        <button
          onClick={(e) => {
            e.stopPropagation()
            setShowProviderDropdown(!showProviderDropdown)
            setShowModelDropdown(false)
          }}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            padding: '6px 10px',
            fontSize: '12px',
            fontWeight: 500,
            border: '1px solid var(--border)',
            borderRadius: '6px',
            background: 'var(--panel-2)',
            color: 'var(--text)',
            cursor: 'pointer',
          }}
        >
          <span>{currentProvider?.displayName || 'Select Provider'}</span>
          <ChevronDown size={14} />
        </button>

        {/* Provider Dropdown */}
        {showProviderDropdown && (
          <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
              onClick={() => setShowProviderDropdown(false)}
            />
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '4px',
              background: 'var(--panel-2)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              zIndex: 9999,
              overflow: 'hidden',
            }}>
              {availableProviders.map(provider => (
                <button
                  key={provider.providerId}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleProviderChange(provider.providerId)
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: nodeData.providerId === provider.providerId
                      ? 'color-mix(in srgb, var(--accent) 20%, transparent)'
                      : 'transparent',
                    border: 'none',
                    color: 'var(--text)',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  <span>{provider.displayName}</span>
                  {nodeData.providerId === provider.providerId && (
                    <Check size={14} style={{ color: 'var(--accent)' }} />
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Model Selector */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={(e) => {
            e.stopPropagation()
            setShowModelDropdown(!showModelDropdown)
            setShowProviderDropdown(false)
          }}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            padding: '6px 10px',
            fontSize: '11px',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            background: 'var(--panel-2)',
            color: 'var(--text)',
            cursor: 'pointer',
          }}
        >
          <span style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {currentModel?.displayName || currentModel?.model || 'Select Model'}
          </span>
          <ChevronDown size={12} />
        </button>

        {/* Model Dropdown */}
        {showModelDropdown && (
          <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
              onClick={() => setShowModelDropdown(false)}
            />
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '4px',
              background: 'var(--panel-2)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              zIndex: 9999,
              maxHeight: '200px',
              overflowY: 'auto',
            }}>
              {currentModels.map(model => (
                <button
                  key={model.model}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleModelChange(model.model)
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: '2px',
                    background: nodeData.model === model.model
                      ? 'color-mix(in srgb, var(--accent) 20%, transparent)'
                      : 'transparent',
                    border: 'none',
                    color: 'var(--text)',
                    fontSize: '11px',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <span style={{ fontWeight: 500 }}>{model.displayName || model.model}</span>
                    {nodeData.model === model.model && (
                      <Check size={12} style={{ color: 'var(--accent)' }} />
                    )}
                  </div>
                  {model.inputPrice !== null && model.outputPrice !== null && (
                    <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                      {formatPricePerMillion(model.inputPrice)}/1M in, {formatPricePerMillion(model.outputPrice)}/1M out
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Price indicator */}
      {currentModel && currentModel.inputPrice !== null && (
        <div style={{
          marginTop: '8px',
          fontSize: '10px',
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}>
          <span style={{
            padding: '2px 6px',
            background: 'color-mix(in srgb, var(--node-rose) 15%, transparent)',
            borderRadius: '4px',
            color: 'var(--node-rose)',
          }}>
            {formatPricePerMillion(currentModel.inputPrice)}/1M in
          </span>
        </div>
      )}
    </div>
  )
})

ProviderNode.displayName = 'ProviderNode'

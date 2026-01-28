/**
 * ProviderModelSelector Component
 *
 * A reusable component for selecting LLM providers and models with pricing display.
 * - If <= 3 providers: Shows tabs/pills for provider selection
 * - If > 3 providers: Shows dropdown for provider selection
 * - Model selector always shows dropdown with pricing info
 *
 * Pricing format: "gpt-4o-mini ($0.15/1M in, $0.60/1M out)"
 */

import { useState, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check, Zap, DollarSign } from 'lucide-react'
import type { ProviderWithPricing, ModelWithPricing } from '../../stores/uiStore'
import { formatPricePerMillion } from '../lib/formatters'

interface ProviderModelSelectorProps {
  providers: ProviderWithPricing[]
  selectedProvider: string
  selectedModel: string
  onProviderChange: (providerId: string) => void
  onModelChange: (modelId: string) => void
  layout?: 'horizontal' | 'vertical' | 'compact'
  showPricing?: boolean
  disabled?: boolean
  forceDropdown?: boolean  // Force provider selector to use dropdown even with <= 3 providers
  shrinkModel?: boolean    // Use a more compact model selector
}

/**
 * Get model display with pricing
 */
function getModelDisplayWithPricing(model: ModelWithPricing): string {
  const baseDisplay = model.displayName || model.model
  if (model.inputPrice !== null && model.outputPrice !== null) {
    return `${baseDisplay} (${formatPricePerMillion(model.inputPrice)}/1M in, ${formatPricePerMillion(model.outputPrice)}/1M out)`
  }
  return baseDisplay
}

/**
 * Find the cheapest model from a list (by combined input + output price)
 */
function findCheapestModel(models: ModelWithPricing[]): ModelWithPricing | undefined {
  if (models.length === 0) return undefined
  if (models.length === 1) return models[0]

  return models.reduce((cheapest, model) => {
    // If model has no pricing, treat as expensive (put it last)
    const modelCost = (model.inputPrice ?? Infinity) + (model.outputPrice ?? Infinity)
    const cheapestCost = (cheapest.inputPrice ?? Infinity) + (cheapest.outputPrice ?? Infinity)
    return modelCost < cheapestCost ? model : cheapest
  }, models[0])
}

export function ProviderModelSelector({
  providers,
  selectedProvider,
  selectedModel,
  onProviderChange,
  onModelChange,
  layout = 'horizontal',
  showPricing = true,
  disabled = false,
  forceDropdown = false,
  shrinkModel = false
}: ProviderModelSelectorProps) {
  const [showProviderDropdown, setShowProviderDropdown] = useState(false)
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const [providerDropdownPos, setProviderDropdownPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)
  const [modelDropdownPos, setModelDropdownPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)
  const providerButtonRef = useRef<HTMLButtonElement>(null)
  const modelButtonRef = useRef<HTMLButtonElement>(null)

  // Filter to providers with keys configured only
  const availableProviders = useMemo(() => {
    return providers.filter(p => p.hasKey)
  }, [providers])

  // Use tabs if <= 3 providers and not forced to dropdown, otherwise dropdown
  const useTabsForProvider = !forceDropdown && availableProviders.length <= 3

  // Get current provider and its models - prioritize available providers
  const currentProvider = availableProviders.find(p => p.providerId === selectedProvider)
    || availableProviders[0]
    || providers[0]
  const currentModels = currentProvider?.models || []
  const currentModel = currentModels.find(m => m.model === selectedModel) || currentModels[0]

  // Sync provider selection on load and when selection is not in available providers
  useEffect(() => {
    if (availableProviders.length > 0 && !disabled) {
      const selectedProviderAvailable = selectedProvider && availableProviders.some(p => p.providerId === selectedProvider)
      if (!selectedProviderAvailable) {
        // Auto-select the first available provider and its cheapest model
        const firstProvider = availableProviders[0]
        onProviderChange(firstProvider.providerId)
        const cheapest = findCheapestModel(firstProvider.models)
        if (cheapest) {
          onModelChange(cheapest.model)
        }
      } else {
        // Provider is valid, but check if model is valid
        const providerData = availableProviders.find(p => p.providerId === selectedProvider)
        if (providerData && (!selectedModel || !providerData.models.some(m => m.model === selectedModel))) {
          // Model not found in provider or no model selected - select cheapest model
          const cheapest = findCheapestModel(providerData.models)
          if (cheapest) {
            onModelChange(cheapest.model)
          }
        }
      }
    }
  }, [availableProviders, selectedProvider, selectedModel, onProviderChange, onModelChange, disabled])

  // Calculate dropdown position when opening (provider)
  const openProviderDropdown = () => {
    if (providerButtonRef.current) {
      const rect = providerButtonRef.current.getBoundingClientRect()
      const dropdownHeight = Math.min(300, availableProviders.length * 44 + 8) // Estimate: 44px per item + padding
      const spaceBelow = window.innerHeight - rect.bottom - 10
      const spaceAbove = rect.top - 10

      // Position above if not enough space below
      const shouldPositionAbove = spaceBelow < dropdownHeight && spaceAbove > spaceBelow

      setProviderDropdownPos({
        top: shouldPositionAbove ? rect.top - dropdownHeight - 4 : rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 200),
        maxHeight: shouldPositionAbove ? spaceAbove : spaceBelow
      })
    }
    setShowProviderDropdown(true)
  }

  const closeProviderDropdown = () => {
    setShowProviderDropdown(false)
    setProviderDropdownPos(null)
  }

  // Calculate dropdown position when opening (model)
  const openModelDropdown = () => {
    if (modelButtonRef.current) {
      const rect = modelButtonRef.current.getBoundingClientRect()
      const dropdownHeight = Math.min(300, currentModels.length * 50 + 8) // Estimate: 50px per item + padding
      const spaceBelow = window.innerHeight - rect.bottom - 10
      const spaceAbove = rect.top - 10

      // Position above if not enough space below
      const shouldPositionAbove = spaceBelow < dropdownHeight && spaceAbove > spaceBelow

      setModelDropdownPos({
        top: shouldPositionAbove ? rect.top - dropdownHeight - 4 : rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 300),
        maxHeight: shouldPositionAbove ? spaceAbove : spaceBelow
      })
    }
    setShowModelDropdown(true)
  }

  const closeModelDropdown = () => {
    setShowModelDropdown(false)
    setModelDropdownPos(null)
  }

  // Calculate estimated cost for selected model (per 1K tokens total)
  const estimatedCostPer1K = useMemo(() => {
    if (!currentModel?.inputPrice || !currentModel?.outputPrice) return null
    // Assume 50% input, 50% output for rough estimate
    return ((currentModel.inputPrice + currentModel.outputPrice) / 2) / 1000
  }, [currentModel])

  // Show message if no providers have API keys configured
  if (availableProviders.length === 0) {
    return (
      <div style={{
        padding: layout === 'compact' ? '6px 12px' : '12px',
        fontSize: '12px',
        color: 'var(--text-secondary)',
        background: 'var(--panel-2)',
        borderRadius: '6px',
        border: '1px solid var(--border)'
      }}>
        No API keys configured
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: layout === 'vertical' ? 'column' : 'row',
      gap: shrinkModel ? '6px' : (layout === 'compact' ? '8px' : '12px'),
      alignItems: layout === 'vertical' ? 'stretch' : 'center',
      padding: shrinkModel ? '4px' : (layout === 'compact' ? '8px' : '12px')
    }}>
      {/* Provider Selection */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexShrink: 0
      }}>
        {layout !== 'compact' && (
          <span style={{
            fontSize: '12px',
            color: 'var(--text-secondary)',
            fontWeight: 500
          }}>
            Provider:
          </span>
        )}

        {useTabsForProvider ? (
          // Tab/Pill style for <= 3 providers
          <div style={{
            display: 'flex',
            background: 'var(--panel-2)',
            borderRadius: '6px',
            padding: '2px',
            border: '1px solid var(--border)'
          }}>
            {availableProviders.map(provider => (
              <button
                key={provider.providerId}
                onClick={() => {
                  if (!disabled) {
                    onProviderChange(provider.providerId)
                    // Auto-select cheapest model when provider changes
                    const cheapest = findCheapestModel(provider.models)
                    if (cheapest) {
                      onModelChange(cheapest.model)
                    }
                  }
                }}
                disabled={disabled}
                style={{
                  padding: '4px 12px',
                  fontSize: '12px',
                  fontWeight: 500,
                  border: 'none',
                  borderRadius: '4px',
                  background: selectedProvider === provider.providerId ? 'var(--accent)' : 'transparent',
                  color: selectedProvider === provider.providerId ? 'white' : 'var(--text-secondary)',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  opacity: disabled ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                {provider.displayName}
                {!provider.hasKey && (
                  <span style={{
                    fontSize: '10px',
                    opacity: 0.7,
                    background: 'rgba(239, 68, 68, 0.2)',
                    padding: '1px 4px',
                    borderRadius: '3px',
                    color: '#ef4444'
                  }}>
                    No Key
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : (
          // Dropdown for > 3 providers or when forced - uses fixed positioning to escape overflow:hidden
          <div>
            <button
              ref={providerButtonRef}
              onClick={() => {
                if (!disabled) {
                  if (showProviderDropdown) {
                    closeProviderDropdown()
                  } else {
                    openProviderDropdown()
                  }
                }
              }}
              disabled={disabled}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: shrinkModel ? '4px' : '8px',
                padding: shrinkModel ? '4px 8px' : '6px 12px',
                fontSize: shrinkModel ? '11px' : '13px',
                fontWeight: 500,
                border: '1px solid var(--border)',
                borderRadius: '6px',
                background: 'var(--panel-2)',
                color: 'var(--text)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                minWidth: shrinkModel ? '100px' : '140px',
                justifyContent: 'space-between',
                opacity: disabled ? 0.6 : 1
              }}
            >
              <span>{currentProvider?.displayName || 'Select Provider'}</span>
              <ChevronDown size={shrinkModel ? 12 : 14} />
            </button>

            {showProviderDropdown && providerDropdownPos && createPortal(
              <>
                <div
                  style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 9998
                  }}
                  onClick={closeProviderDropdown}
                />
                <div style={{
                  position: 'fixed',
                  top: providerDropdownPos.top,
                  left: providerDropdownPos.left,
                  minWidth: providerDropdownPos.width,
                  maxHeight: providerDropdownPos.maxHeight,
                  background: 'var(--panel-2)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
                  zIndex: 9999,
                  overflow: 'auto'
                }}>
                  {availableProviders.map(provider => (
                    <button
                      key={provider.providerId}
                      onClick={() => {
                        onProviderChange(provider.providerId)
                        // Auto-select cheapest model when provider changes
                        const cheapest = findCheapestModel(provider.models)
                        if (cheapest) {
                          onModelChange(cheapest.model)
                        }
                        closeProviderDropdown()
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: selectedProvider === provider.providerId ? 'var(--accent-muted, rgba(59, 130, 246, 0.15))' : 'transparent',
                        border: 'none',
                        color: 'var(--text)',
                        fontSize: '13px',
                        cursor: 'pointer',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={(e) => {
                        if (selectedProvider !== provider.providerId) {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedProvider !== provider.providerId) {
                          e.currentTarget.style.background = 'transparent'
                        }
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {provider.displayName}
                        {!provider.hasKey && (
                          <span style={{
                            fontSize: '10px',
                            background: 'rgba(239, 68, 68, 0.2)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            color: '#ef4444'
                          }}>
                            No Key
                          </span>
                        )}
                        {provider.isLocal && (
                          <span style={{
                            fontSize: '10px',
                            background: 'rgba(34, 197, 94, 0.2)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            color: '#22c55e'
                          }}>
                            Local
                          </span>
                        )}
                      </span>
                      {selectedProvider === provider.providerId && (
                        <Check size={14} style={{ color: 'var(--accent)' }} />
                      )}
                    </button>
                  ))}
                </div>
              </>,
              document.body
            )}
          </div>
        )}
      </div>

      {/* Model Selection - Always dropdown */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flex: layout === 'vertical' ? 'none' : 1,
        minWidth: 0
      }}>
        {layout !== 'compact' && (
          <span style={{
            fontSize: '12px',
            color: 'var(--text-secondary)',
            fontWeight: 500,
            flexShrink: 0
          }}>
            Model:
          </span>
        )}

        <div style={{ position: 'relative', minWidth: shrinkModel ? '120px' : '180px', maxWidth: shrinkModel ? '180px' : '280px' }}>
          <button
            ref={modelButtonRef}
            onClick={() => {
              if (!disabled && currentModels.length > 0) {
                if (showModelDropdown) {
                  closeModelDropdown()
                } else {
                  openModelDropdown()
                }
              }
            }}
            disabled={disabled || currentModels.length === 0}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: shrinkModel ? '4px' : '8px',
              padding: shrinkModel ? '4px 8px' : '6px 12px',
              fontSize: shrinkModel ? '11px' : '12px',
              fontWeight: 500,
              border: '1px solid var(--border)',
              borderRadius: '6px',
              background: 'var(--panel-2)',
              color: 'var(--text)',
              cursor: disabled || currentModels.length === 0 ? 'not-allowed' : 'pointer',
              justifyContent: 'space-between',
              opacity: disabled ? 0.6 : 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            <span style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              {showPricing && currentModel && !shrinkModel ? (
                <>
                  <span>{currentModel.displayName || currentModel.model}</span>
                  {currentModel.inputPrice !== null && currentModel.outputPrice !== null && (
                    <span style={{
                      fontSize: '10px',
                      color: 'var(--text-secondary)',
                      background: 'var(--panel)',
                      padding: '2px 6px',
                      borderRadius: '4px'
                    }}>
                      {formatPricePerMillion(currentModel.inputPrice)}/1M in
                    </span>
                  )}
                </>
              ) : (
                currentModel?.displayName || currentModel?.model || 'Select Model'
              )}
            </span>
            <ChevronDown size={shrinkModel ? 12 : 14} style={{ flexShrink: 0 }} />
          </button>

          {showModelDropdown && currentModels.length > 0 && modelDropdownPos && createPortal(
            <>
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 9998
                }}
                onClick={closeModelDropdown}
              />
              <div style={{
                position: 'fixed',
                top: modelDropdownPos.top,
                left: modelDropdownPos.left,
                width: modelDropdownPos.width,
                minWidth: '300px',
                maxHeight: modelDropdownPos.maxHeight,
                overflow: 'auto',
                background: 'var(--panel-2)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
                zIndex: 9999
              }}>
                {currentModels.map(model => (
                  <button
                    key={model.model}
                    onClick={() => {
                      onModelChange(model.model)
                      closeModelDropdown()
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: selectedModel === model.model ? 'var(--accent-muted, rgba(59, 130, 246, 0.15))' : 'transparent',
                      border: 'none',
                      color: 'var(--text)',
                      fontSize: '13px',
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                      textAlign: 'left'
                    }}
                    onMouseEnter={(e) => {
                      if (selectedModel !== model.model) {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedModel !== model.model) {
                        e.currentTarget.style.background = 'transparent'
                      }
                    }}
                  >
                    {/* Checkmark on the left */}
                    <div style={{ width: '20px', flexShrink: 0 }}>
                      {selectedModel === model.model && (
                        <Check size={14} style={{ color: 'var(--accent)' }} />
                      )}
                    </div>
                    {/* Model name and pricing */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 500 }}>{model.displayName || model.model}</span>
                      {showPricing && model.inputPrice !== null && model.outputPrice !== null && (
                        <span style={{
                          fontSize: '11px',
                          color: 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <DollarSign size={10} />
                            {formatPricePerMillion(model.inputPrice)}/1M in
                          </span>
                          <span>|</span>
                          <span>{formatPricePerMillion(model.outputPrice)}/1M out</span>
                        </span>
                      )}
                    </div>
                    {/* Feature badges on the right */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      {model.supportsVision && (
                        <span style={{
                          fontSize: '9px',
                          background: 'rgba(139, 92, 246, 0.2)',
                          color: '#8b5cf6',
                          padding: '2px 5px',
                          borderRadius: '3px'
                        }}>
                          Vision
                        </span>
                      )}
                      {model.supportsTools && (
                        <span style={{
                          fontSize: '9px',
                          background: 'rgba(59, 130, 246, 0.2)',
                          color: '#3b82f6',
                          padding: '2px 5px',
                          borderRadius: '3px'
                        }}>
                          Tools
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </>,
            document.body
          )}
        </div>
      </div>

      {/* Cost estimate badge (compact layout only) */}
      {layout === 'compact' && showPricing && estimatedCostPer1K !== null && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 8px',
          background: 'var(--panel)',
          borderRadius: '4px',
          fontSize: '10px',
          color: 'var(--text-secondary)'
        }}>
          <Zap size={10} style={{ color: '#f59e0b' }} />
          ~${estimatedCostPer1K.toFixed(4)}/1K
        </div>
      )}
    </div>
  )
}

export default ProviderModelSelector

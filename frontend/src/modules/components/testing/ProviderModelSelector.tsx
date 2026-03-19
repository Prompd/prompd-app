/**
 * ProviderModelSelector - Two-step provider/model selector for test execution.
 * Step 1: Select providers (checkboxes)
 * Step 2: Select models within those providers (checkboxes, grouped)
 *
 * Uses configured providers from uiStore (only shows providers with API keys).
 */

import { useMemo } from 'react'
import { CheckSquare, Square, ChevronDown, ChevronRight } from 'lucide-react'
import { useUIStore, type ProviderWithPricing, type ModelWithPricing } from '@/stores/uiStore'

export interface SelectedModel {
  providerId: string
  providerName: string
  modelId: string
  modelName: string
}

interface ProviderModelSelectorProps {
  selectedModels: SelectedModel[]
  onSelectionChange: (models: SelectedModel[]) => void
  maxSelection?: number
}

export function ProviderModelSelector({
  selectedModels,
  onSelectionChange,
  maxSelection = 10,
}: ProviderModelSelectorProps) {
  const providersWithPricing = useUIStore(state => state.llmProvider.providersWithPricing)

  // Only show providers that have API keys configured
  const configuredProviders = useMemo(() => {
    if (!providersWithPricing) return []
    return providersWithPricing.filter(p => p.hasKey)
  }, [providersWithPricing])

  // Which provider IDs have at least one model selected
  const activeProviderIds = useMemo(() => {
    const ids = new Set<string>()
    for (const m of selectedModels) {
      ids.add(m.providerId)
    }
    return ids
  }, [selectedModels])

  const isModelSelected = (providerId: string, modelId: string) => {
    return selectedModels.some(m => m.providerId === providerId && m.modelId === modelId)
  }

  const toggleModel = (provider: ProviderWithPricing, model: ModelWithPricing) => {
    const existing = selectedModels.find(
      m => m.providerId === provider.providerId && m.modelId === model.model
    )
    if (existing) {
      onSelectionChange(selectedModels.filter(m => m !== existing))
    } else {
      if (selectedModels.length >= maxSelection) return
      onSelectionChange([...selectedModels, {
        providerId: provider.providerId,
        providerName: provider.displayName,
        modelId: model.model,
        modelName: model.displayName,
      }])
    }
  }

  const toggleAllModels = (provider: ProviderWithPricing) => {
    const providerModels = selectedModels.filter(m => m.providerId === provider.providerId)
    if (providerModels.length === provider.models.length) {
      // Deselect all models for this provider
      onSelectionChange(selectedModels.filter(m => m.providerId !== provider.providerId))
    } else {
      // Select all models for this provider (up to max)
      const others = selectedModels.filter(m => m.providerId !== provider.providerId)
      const allForProvider = provider.models.map(model => ({
        providerId: provider.providerId,
        providerName: provider.displayName,
        modelId: model.model,
        modelName: model.displayName,
      }))
      const combined = [...others, ...allForProvider].slice(0, maxSelection)
      onSelectionChange(combined)
    }
  }

  if (configuredProviders.length === 0) {
    return (
      <div style={{
        fontSize: '12px',
        color: 'var(--muted)',
        textAlign: 'center',
        padding: '8px',
      }}>
        No providers configured. Add API keys in Settings.
      </div>
    )
  }

  return (
    <div className="pms-container">
      {/* Selected count */}
      {selectedModels.length > 0 && (
        <div className="pms-summary">
          {selectedModels.length} model{selectedModels.length !== 1 ? 's' : ''} selected
          <button
            className="pms-clear"
            onClick={() => onSelectionChange([])}
          >
            Clear
          </button>
        </div>
      )}

      {/* Provider list with nested models */}
      <div className="pms-providers">
        {configuredProviders.map(provider => {
          const isActive = activeProviderIds.has(provider.providerId)
          const selectedCount = selectedModels.filter(m => m.providerId === provider.providerId).length
          const allSelected = selectedCount === provider.models.length

          return (
            <div key={provider.providerId} className="pms-provider-group">
              {/* Provider row */}
              <div
                className="pms-provider-row"
                onClick={() => toggleAllModels(provider)}
              >
                <span className="pms-check">
                  {allSelected ? (
                    <CheckSquare size={14} color="var(--accent)" />
                  ) : selectedCount > 0 ? (
                    <CheckSquare size={14} color="var(--muted)" style={{ opacity: 0.5 }} />
                  ) : (
                    <Square size={14} color="var(--muted)" />
                  )}
                </span>
                <span className="pms-provider-name">{provider.displayName}</span>
                {selectedCount > 0 && (
                  <span className="pms-provider-count">{selectedCount}/{provider.models.length}</span>
                )}
                <span className="pms-chevron">
                  {isActive || selectedCount > 0 ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </span>
              </div>

              {/* Model rows (show when provider has selections or is expanded) */}
              {(isActive || selectedCount > 0 || true) && (
                <div className="pms-models">
                  {provider.models.map(model => {
                    const selected = isModelSelected(provider.providerId, model.model)
                    const atLimit = !selected && selectedModels.length >= maxSelection

                    return (
                      <div
                        key={model.model}
                        className={`pms-model-row ${selected ? 'pms-model-selected' : ''} ${atLimit ? 'pms-model-disabled' : ''}`}
                        onClick={() => !atLimit && toggleModel(provider, model)}
                      >
                        <span className="pms-check">
                          {selected ? (
                            <CheckSquare size={12} color="var(--accent)" />
                          ) : (
                            <Square size={12} color="var(--muted)" style={{ opacity: atLimit ? 0.2 : 0.5 }} />
                          )}
                        </span>
                        <span className="pms-model-name">{model.displayName}</span>
                        {model.inputPrice !== null && model.inputPrice !== undefined && (
                          <span className="pms-model-price">
                            ${model.inputPrice.toFixed(2)}/M
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

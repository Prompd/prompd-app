// Multi-Provider Selector with Checkboxes for Comparison
import { useState } from 'react'
import { clsx } from 'clsx'

export interface ProviderOption {
  id: string
  name: string
  model: string
  pricePerMillionTokens: number
  averageLatencyMs?: number
  icon?: string
}

export interface PrompdMultiProviderSelectorProps {
  providers: ProviderOption[]
  selectedProviders: string[]
  onSelectionChange: (selectedIds: string[]) => void
  estimatedTokens?: number
  className?: string
  maxSelection?: number
}

export function PrompdMultiProviderSelector({
  providers,
  selectedProviders,
  onSelectionChange,
  estimatedTokens = 500,
  className,
  maxSelection = 10
}: PrompdMultiProviderSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const handleToggleProvider = (providerId: string) => {
    if (selectedProviders.includes(providerId)) {
      onSelectionChange(selectedProviders.filter(id => id !== providerId))
    } else {
      if (selectedProviders.length >= maxSelection) {
        return // Don't allow more than max
      }
      onSelectionChange([...selectedProviders, providerId])
    }
  }

  const handleSelectAll = () => {
    const allIds = providers.slice(0, maxSelection).map(p => p.id)
    onSelectionChange(allIds)
  }

  const handleClearAll = () => {
    onSelectionChange([])
  }

  // Calculate total estimated cost
  const totalEstimatedCost = selectedProviders.reduce((sum, id) => {
    const provider = providers.find(p => p.id === id)
    if (!provider) return sum
    return sum + ((estimatedTokens / 1_000_000) * provider.pricePerMillionTokens)
  }, 0)

  return (
    <div className={clsx('prompd-multi-provider-selector', className)}>
      {/* Header / Collapsed View */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors text-sm font-medium"
          style={{
            background: 'var(--prompd-panel)',
            border: '1px solid var(--prompd-border)',
            color: 'var(--prompd-text)'
          }}
        >
          <span>
            {selectedProviders.length === 0
              ? 'Select Providers'
              : `${selectedProviders.length} Provider${selectedProviders.length === 1 ? '' : 's'} Selected`}
          </span>
          <svg
            className={clsx('w-4 h-4 transition-transform', isExpanded && 'rotate-180')}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {selectedProviders.length > 0 && (
          <div className="text-xs px-3 py-1.5 rounded-lg" style={{ color: 'var(--prompd-muted)' }}>
            Est. Cost: <span className="font-mono font-semibold">${totalEstimatedCost.toFixed(4)}</span>
          </div>
        )}
      </div>

      {/* Expanded Provider List */}
      {isExpanded && (
        <div
          className="rounded-lg p-3"
          style={{
            background: 'var(--prompd-panel)',
            border: '1px solid var(--prompd-border)'
          }}
        >
          {/* Controls */}
          <div className="flex items-center justify-between mb-3 pb-3" style={{ borderBottom: '1px solid var(--prompd-border)' }}>
            <div className="text-xs font-semibold" style={{ color: 'var(--prompd-muted)' }}>
              SELECT PROVIDERS TO COMPARE
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSelectAll}
                className="text-xs px-2 py-1 rounded transition-colors"
                style={{
                  background: 'var(--prompd-panel-hover)',
                  color: 'var(--prompd-accent)'
                }}
              >
                Select All
              </button>
              {selectedProviders.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="text-xs px-2 py-1 rounded transition-colors"
                  style={{
                    background: 'var(--prompd-panel-hover)',
                    color: 'var(--prompd-muted)'
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Provider Grid */}
          <div className="space-y-1">
            {providers.map(provider => {
              const isSelected = selectedProviders.includes(provider.id)
              const estimatedCost = (estimatedTokens / 1_000_000) * provider.pricePerMillionTokens

              return (
                <label
                  key={provider.id}
                  className={clsx(
                    'flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors',
                    isSelected && 'bg-blue-500/10'
                  )}
                  style={{
                    background: isSelected ? 'var(--prompd-accent-bg)' : 'transparent'
                  }}
                >
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleToggleProvider(provider.id)}
                    className="w-4 h-4 rounded"
                    style={{
                      accentColor: 'var(--prompd-accent)'
                    }}
                  />

                  {/* Provider Info */}
                  <div className="flex-1 grid grid-cols-[1fr_auto_auto] gap-4 items-center">
                    {/* Name */}
                    <div className="flex items-center gap-2">
                      {provider.icon && <span className="text-base">{provider.icon}</span>}
                      <div>
                        <div className="text-sm font-medium" style={{ color: 'var(--prompd-text)' }}>
                          {provider.name}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--prompd-muted)' }}>
                          {provider.model}
                        </div>
                      </div>
                    </div>

                    {/* Cost */}
                    <div className="text-right">
                      <div className="text-xs font-mono" style={{ color: 'var(--prompd-text)' }}>
                        ${estimatedCost.toFixed(4)}
                      </div>
                      <div className="text-xs" style={{ color: 'var(--prompd-muted)' }}>
                        est. cost
                      </div>
                    </div>

                    {/* Latency */}
                    {provider.averageLatencyMs && (
                      <div className="text-right">
                        <div className="text-xs font-mono" style={{ color: 'var(--prompd-text)' }}>
                          ~{provider.averageLatencyMs}ms
                        </div>
                        <div className="text-xs" style={{ color: 'var(--prompd-muted)' }}>
                          avg. latency
                        </div>
                      </div>
                    )}
                  </div>
                </label>
              )
            })}
          </div>

          {/* Summary Footer */}
          {selectedProviders.length > 0 && (
            <div className="mt-3 pt-3 flex items-center justify-between text-sm" style={{ borderTop: '1px solid var(--prompd-border)' }}>
              <div style={{ color: 'var(--prompd-muted)' }}>
                {selectedProviders.length} provider{selectedProviders.length === 1 ? '' : 's'} • ~{estimatedTokens} tokens
              </div>
              <div className="font-semibold" style={{ color: 'var(--prompd-text)' }}>
                Total: <span className="font-mono">${totalEstimatedCost.toFixed(4)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Default provider configurations
export const defaultMultiProviders: ProviderOption[] = [
  {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat',
    model: 'deepseek-chat',
    pricePerMillionTokens: 0.14,
    averageLatencyMs: 1200,
    icon: '🧠',
  },
  {
    id: 'gemini-2.0-flash-exp',
    name: 'Gemini 2.0 Flash',
    model: 'gemini-2.0-flash-exp',
    pricePerMillionTokens: 0,
    averageLatencyMs: 2100,
    icon: '✨',
  },
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    model: 'gemini-1.5-flash',
    pricePerMillionTokens: 0.075,
    averageLatencyMs: 1800,
    icon: '⚡',
  },
  {
    id: 'groq-mixtral-8x7b-32768',
    name: 'Groq Mixtral',
    model: 'mixtral-8x7b-32768',
    pricePerMillionTokens: 0.24,
    averageLatencyMs: 800,
    icon: '🚀',
  },
  {
    id: 'groq-llama-3.1-70b-versatile',
    name: 'Groq Llama 3.1',
    model: 'llama-3.1-70b-versatile',
    pricePerMillionTokens: 0.59,
    averageLatencyMs: 900,
    icon: '🦙',
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    model: 'gpt-4o-mini',
    pricePerMillionTokens: 0.15,
    averageLatencyMs: 1500,
    icon: '🤖',
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    model: 'gpt-4o',
    pricePerMillionTokens: 2.5,
    averageLatencyMs: 2000,
    icon: '🤖',
  },
  {
    id: 'claude-3-5-sonnet-20240620',
    name: 'Claude 3.5 Sonnet',
    model: 'claude-3-5-sonnet-20240620',
    pricePerMillionTokens: 3.0,
    averageLatencyMs: 2500,
    icon: '🧠',
  },
  {
    id: 'claude-3-haiku-20240307',
    name: 'Claude 3 Haiku',
    model: 'claude-3-haiku-20240307',
    pricePerMillionTokens: 0.25,
    averageLatencyMs: 1000,
    icon: '🧠',
  },
]

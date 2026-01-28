import { useState, useRef, useEffect } from 'react'
import { clsx } from 'clsx'

export interface LLMProviderOption {
  id: string
  name: string
  models: string[]
  icon?: string
  enabled?: boolean
}

export interface PrompdProviderSelectorProps {
  providers: LLMProviderOption[]
  selectedProvider?: string
  selectedModel?: string
  onProviderChange: (providerId: string) => void
  onModelChange: (model: string) => void
  layout?: 'vertical' | 'horizontal' | 'table'
  className?: string
}

export function PrompdProviderSelector({
  providers,
  selectedProvider,
  selectedModel,
  onProviderChange,
  onModelChange,
  layout = 'vertical',
  className
}: PrompdProviderSelectorProps) {
  const [isProviderOpen, setIsProviderOpen] = useState(false)
  const [dropdownDirection, setDropdownDirection] = useState<'down' | 'up'>('down')
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const currentProvider = providers.find(p => p.id === selectedProvider)
  const availableModels = currentProvider?.models || []

  // Check dropdown position when it opens
  useEffect(() => {
    if (isProviderOpen && buttonRef.current && dropdownRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect()
      const dropdownHeight = dropdownRef.current.offsetHeight
      const viewportHeight = window.innerHeight
      const spaceBelow = viewportHeight - buttonRect.bottom
      const spaceAbove = buttonRect.top

      // If not enough space below and more space above, flip it up
      if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
        setDropdownDirection('up')
      } else {
        setDropdownDirection('down')
      }
    }
  }, [isProviderOpen])

  // Table layout (grid showing all providers and their models)
  if (layout === 'table') {
    return (
      <div className={clsx('prompd-provider-selector', className)}>
        <div
          className="rounded-lg overflow-hidden"
          style={{
            border: '1px solid var(--prompd-border)'
          }}
        >
          {/* Header */}
          <div
            className="grid grid-cols-2 px-4 py-2 text-xs font-semibold"
            style={{
              background: 'var(--prompd-panel)',
              borderBottom: '1px solid var(--prompd-border)',
              color: 'var(--prompd-muted)'
            }}
          >
            <div>PROVIDER</div>
            <div>MODEL</div>
          </div>

          {/* Rows */}
          {providers.map((provider, providerIndex) => (
            <div key={provider.id}>
              {provider.models.map((model, modelIndex) => (
                <button
                  key={`${provider.id}-${model}`}
                  onClick={() => {
                    onProviderChange(provider.id)
                    onModelChange(model)
                  }}
                  disabled={provider.enabled === false}
                  className={clsx(
                    'w-full grid grid-cols-2 px-4 py-2.5 text-left text-sm transition-colors',
                    selectedProvider === provider.id && selectedModel === model && 'bg-blue-500/10',
                    provider.enabled === false && 'opacity-50 cursor-not-allowed'
                  )}
                  style={{
                    background: selectedProvider === provider.id && selectedModel === model
                      ? 'var(--prompd-accent-bg)'
                      : 'var(--prompd-panel)',
                    borderBottom: providerIndex < providers.length - 1 || modelIndex < provider.models.length - 1
                      ? '1px solid var(--prompd-border)'
                      : 'none',
                    color: selectedProvider === provider.id && selectedModel === model
                      ? 'var(--prompd-accent)'
                      : 'var(--prompd-text)'
                  }}
                >
                  {/* Provider Column */}
                  <div className="flex items-center gap-2">
                    {modelIndex === 0 && (
                      <>
                        {provider.icon && <span className="text-base">{provider.icon}</span>}
                        <span className="font-medium">{provider.name}</span>
                      </>
                    )}
                  </div>

                  {/* Model Column */}
                  <div className="flex items-center justify-between">
                    <span>{model}</span>
                    {selectedProvider === provider.id && selectedModel === model && (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Horizontal layout (collapsed button shows provider and model side-by-side)
  if (layout === 'horizontal') {
    return (
      <div className={clsx('prompd-provider-selector relative', className)}>
        {/* Trigger Button - Horizontal Layout */}
        <button
          ref={buttonRef}
          onClick={() => setIsProviderOpen(!isProviderOpen)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors"
          style={{
            background: 'var(--prompd-panel)',
            border: '1px solid var(--prompd-border)',
            color: 'var(--prompd-text)'
          }}
        >
          {/* Provider */}
          <div className="flex items-center gap-1.5">
            {currentProvider?.icon && (
              <span className="text-base">{currentProvider.icon}</span>
            )}
            <span className="text-sm font-medium">
              {currentProvider?.name || 'Select Provider'}
            </span>
          </div>

          {/* Separator */}
          {selectedModel && (
            <div className="h-4 w-px opacity-30" style={{ background: 'var(--prompd-border)' }} />
          )}

          {/* Model */}
          {selectedModel && (
            <span className="text-sm">{selectedModel}</span>
          )}

          {/* Dropdown Icon */}
          <svg
            className={clsx('w-4 h-4 transition-transform ml-1', isProviderOpen && 'rotate-180')}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Same dropdown menu as vertical */}
        {isProviderOpen && (
          <div
            ref={dropdownRef}
            className={clsx(
              'absolute left-0 z-50 min-w-[280px] rounded-lg shadow-xl',
              dropdownDirection === 'down' ? 'top-full mt-2' : 'bottom-full mb-2'
            )}
            style={{
              background: 'var(--prompd-panel)',
              border: '1px solid var(--prompd-border)'
            }}
          >
            {/* Providers List */}
            <div className="p-2">
              <div className="text-xs font-semibold px-2 py-1 mb-1" style={{ color: 'var(--prompd-muted)' }}>
                PROVIDERS
              </div>
              {providers.map(provider => (
                <button
                  key={provider.id}
                  onClick={() => {
                    onProviderChange(provider.id)
                    if (provider.models.length > 0 && !provider.models.includes(selectedModel || '')) {
                      onModelChange(provider.models[0])
                    }
                  }}
                  disabled={provider.enabled === false}
                  className={clsx(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-md transition-colors',
                    selectedProvider === provider.id && 'bg-blue-500/10',
                    provider.enabled === false && 'opacity-50 cursor-not-allowed'
                  )}
                  style={{
                    color: selectedProvider === provider.id ? 'var(--prompd-accent)' : 'var(--prompd-text)'
                  }}
                >
                  {provider.icon && <span className="text-lg">{provider.icon}</span>}
                  <span className="text-sm font-medium">{provider.name}</span>
                  {selectedProvider === provider.id && (
                    <svg className="w-4 h-4 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>

            {/* Models List */}
            {availableModels.length > 0 && (
              <>
                <div className="border-t" style={{ borderColor: 'var(--prompd-border)' }} />
                <div className="p-2">
                  <div className="text-xs font-semibold px-2 py-1 mb-1" style={{ color: 'var(--prompd-muted)' }}>
                    MODELS
                  </div>
                  {availableModels.map(model => (
                    <button
                      key={model}
                      onClick={() => {
                        onModelChange(model)
                        setIsProviderOpen(false)
                      }}
                      className={clsx(
                        'w-full text-left px-3 py-2 rounded-md transition-colors text-sm',
                        selectedModel === model && 'bg-blue-500/10'
                      )}
                      style={{
                        color: selectedModel === model ? 'var(--prompd-accent)' : 'var(--prompd-text)'
                      }}
                    >
                      {model}
                      {selectedModel === model && (
                        <svg className="w-4 h-4 inline ml-2" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Click outside to close */}
        {isProviderOpen && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsProviderOpen(false)}
          />
        )}
      </div>
    )
  }

  // Vertical layout (original single dropdown with sections)
  return (
    <div className={clsx('prompd-provider-selector relative', className)}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsProviderOpen(!isProviderOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors"
        style={{
          background: 'var(--prompd-panel)',
          border: '1px solid var(--prompd-border)',
          color: 'var(--prompd-text)'
        }}
      >
        {currentProvider?.icon && (
          <span className="text-lg">{currentProvider.icon}</span>
        )}
        <div className="flex flex-col items-start">
          <span className="text-sm font-medium">
            {currentProvider?.name || 'Select Provider'}
          </span>
          {selectedModel && (
            <span className="text-xs opacity-70">{selectedModel}</span>
          )}
        </div>
        <svg
          className={clsx('w-4 h-4 transition-transform', isProviderOpen && 'rotate-180')}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isProviderOpen && (
        <div
          className="absolute top-full mt-2 left-0 z-50 min-w-[280px] rounded-lg shadow-xl"
          style={{
            background: 'var(--prompd-panel)',
            border: '1px solid var(--prompd-border)'
          }}
        >
          {/* Providers List */}
          <div className="p-2">
            <div className="text-xs font-semibold px-2 py-1 mb-1" style={{ color: 'var(--prompd-muted)' }}>
              PROVIDERS
            </div>
            {providers.map(provider => (
              <button
                key={provider.id}
                onClick={() => {
                  onProviderChange(provider.id)
                  if (provider.models.length > 0 && !provider.models.includes(selectedModel || '')) {
                    onModelChange(provider.models[0])
                  }
                }}
                disabled={provider.enabled === false}
                className={clsx(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-md transition-colors',
                  selectedProvider === provider.id && 'bg-blue-500/10',
                  provider.enabled === false && 'opacity-50 cursor-not-allowed'
                )}
                style={{
                  color: selectedProvider === provider.id ? 'var(--prompd-accent)' : 'var(--prompd-text)'
                }}
              >
                {provider.icon && <span className="text-lg">{provider.icon}</span>}
                <span className="text-sm font-medium">{provider.name}</span>
                {selectedProvider === provider.id && (
                  <svg className="w-4 h-4 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            ))}
          </div>

          {/* Models List */}
          {availableModels.length > 0 && (
            <>
              <div className="border-t" style={{ borderColor: 'var(--prompd-border)' }} />
              <div className="p-2">
                <div className="text-xs font-semibold px-2 py-1 mb-1" style={{ color: 'var(--prompd-muted)' }}>
                  MODELS
                </div>
                {availableModels.map(model => (
                  <button
                    key={model}
                    onClick={() => {
                      onModelChange(model)
                      setIsProviderOpen(false)
                    }}
                    className={clsx(
                      'w-full text-left px-3 py-2 rounded-md transition-colors text-sm',
                      selectedModel === model && 'bg-blue-500/10'
                    )}
                    style={{
                      color: selectedModel === model ? 'var(--prompd-accent)' : 'var(--prompd-text)'
                    }}
                  >
                    {model}
                    {selectedModel === model && (
                      <svg className="w-4 h-4 inline ml-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Click outside to close */}
      {isProviderOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsProviderOpen(false)}
        />
      )}
    </div>
  )
}

// Default providers configuration - Updated November 2025
// Models are ordered by cost (cheapest first, most powerful last)
export const defaultProviders: LLMProviderOption[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    icon: '🤖',
    models: [
      'gpt-4.1-nano',    // Cheapest, fast
      'gpt-4.1-mini',    // Good balance
      'gpt-4o-mini',     // Legacy mini
      'gpt-4.1',         // Full capability
      'gpt-4o',          // Legacy flagship
      'o3-mini'          // Reasoning model
    ]
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    icon: '🧠',
    models: [
      'claude-haiku-4-5-20251015',     // $1/$5 - Cheapest, fast
      'claude-sonnet-4-5-20250929',    // $3/$15 - Best value for coding
      'claude-sonnet-4-20250514',      // Sonnet 4
      'claude-opus-4-5-20251101',      // $15/$75 - Latest flagship
      'claude-opus-4-20250514'         // Opus 4
    ]
  }
]

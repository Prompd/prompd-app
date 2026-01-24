import { useState } from 'react'
import { X, Zap, DollarSign, Clock, Layers, ChevronDown, ChevronRight, Check } from 'lucide-react'

export interface ModelOption {
  id: string
  displayName: string
  pricePerMillionTokens: number
  averageLatencyMs: number
  features?: string[]
}

export interface ProviderGroup {
  id: string
  displayName: string
  description: string
  envVar?: string
  models: ModelOption[]
  color: string
}

export const providerGroups: ProviderGroup[] = [
  {
    id: 'openai',
    displayName: 'OpenAI',
    description: 'Industry-leading models with strong reasoning capabilities',
    envVar: 'OPENAI_API_KEY',
    color: 'emerald',
    models: [
      {
        id: 'gpt-4o',
        displayName: 'GPT-4o',
        pricePerMillionTokens: 2.5,
        averageLatencyMs: 3500,
        features: ['Multimodal', 'Code', 'Analysis']
      },
      {
        id: 'gpt-4o-mini',
        displayName: 'GPT-4o Mini',
        pricePerMillionTokens: 0.15,
        averageLatencyMs: 2000,
        features: ['Fast', 'Cost-effective']
      },
      {
        id: 'o1',
        displayName: 'o1 (Reasoning)',
        pricePerMillionTokens: 15.0,
        averageLatencyMs: 8000,
        features: ['Advanced reasoning', 'Complex problems']
      },
      {
        id: 'o1-mini',
        displayName: 'o1 Mini',
        pricePerMillionTokens: 3.0,
        averageLatencyMs: 4000,
        features: ['Reasoning', 'Cost-effective']
      }
    ]
  },
  {
    id: 'anthropic',
    displayName: 'Anthropic',
    description: 'Claude models with extended context and strong safety',
    envVar: 'ANTHROPIC_API_KEY',
    color: 'orange',
    models: [
      {
        id: 'claude-sonnet-4-5-20250929',
        displayName: 'Claude Sonnet 4.5',
        pricePerMillionTokens: 3.0,
        averageLatencyMs: 4200,
        features: ['Latest', 'Multimodal', 'Code']
      },
      {
        id: 'claude-3-7-sonnet-20250219',
        displayName: 'Claude 3.7 Sonnet',
        pricePerMillionTokens: 3.0,
        averageLatencyMs: 4000,
        features: ['Hybrid reasoning', 'Code']
      },
      {
        id: 'claude-3-5-haiku-20241022',
        displayName: 'Claude 3.5 Haiku',
        pricePerMillionTokens: 0.8,
        averageLatencyMs: 2500,
        features: ['Fast', 'Cost-effective']
      }
    ]
  },
  {
    id: 'deepseek',
    displayName: 'DeepSeek',
    description: 'Open and affordable models with strong coding abilities',
    envVar: 'DEEPSEEK_API_KEY',
    color: 'blue',
    models: [
      {
        id: 'deepseek-chat',
        displayName: 'DeepSeek Chat (V3.2)',
        pricePerMillionTokens: 0.14,
        averageLatencyMs: 1200,
        features: ['Latest', 'Affordable', 'Code']
      },
      {
        id: 'deepseek-reasoner',
        displayName: 'DeepSeek Reasoner (V3.2)',
        pricePerMillionTokens: 0.55,
        averageLatencyMs: 2000,
        features: ['Thinking mode', 'Reasoning']
      }
    ]
  },
  {
    id: 'groq',
    displayName: 'Groq',
    description: 'Ultra-fast inference with custom LPU hardware',
    envVar: 'GROQ_API_KEY',
    color: 'purple',
    models: [
      {
        id: 'llama-3.3-70b-versatile',
        displayName: 'Llama 3.3 70b',
        pricePerMillionTokens: 0.59,
        averageLatencyMs: 800,
        features: ['Latest', 'Ultra-fast', 'Versatile']
      },
      {
        id: 'llama-3.1-8b-instant',
        displayName: 'Llama 3.1 8b Instant',
        pricePerMillionTokens: 0.05,
        averageLatencyMs: 400,
        features: ['Ultra-fast', 'Instant', 'Cheap']
      },
      {
        id: 'gemma2-9b-it',
        displayName: 'Gemma 2 9b',
        pricePerMillionTokens: 0.20,
        averageLatencyMs: 600,
        features: ['Fast', 'Efficient']
      }
    ]
  },
  {
    id: 'gemini',
    displayName: 'Google Gemini',
    description: 'Google\'s multimodal AI with native code execution',
    envVar: 'GEMINI_API_KEY',
    color: 'sky',
    models: [
      {
        id: 'gemini-2.5-flash',
        displayName: 'Gemini 2.5 Flash',
        pricePerMillionTokens: 0.075,
        averageLatencyMs: 1800,
        features: ['Latest', 'Fast', 'Multimodal']
      },
      {
        id: 'gemini-2.5-pro',
        displayName: 'Gemini 2.5 Pro',
        pricePerMillionTokens: 1.25,
        averageLatencyMs: 3000,
        features: ['Most capable', 'Thinking', 'Multimodal']
      },
      {
        id: 'gemini-2.0-flash',
        displayName: 'Gemini 2.0 Flash',
        pricePerMillionTokens: 0,
        averageLatencyMs: 2000,
        features: ['Free', 'Multimodal', '1M context']
      }
    ]
  }
]

export interface ProviderSelectionDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (selectedModels: string[], compareMode: boolean) => void
  defaultModel?: string
  estimatedTokens?: number
}

export function ProviderSelectionDialog({
  isOpen,
  onClose,
  onConfirm,
  defaultModel = 'gpt-4o-mini',
  estimatedTokens = 1000
}: ProviderSelectionDialogProps) {
  const [compareMode, setCompareMode] = useState(false)
  const [selectedModels, setSelectedModels] = useState<string[]>([defaultModel])
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set(['openai']))

  if (!isOpen) return null

  const toggleProvider = (providerId: string) => {
    setExpandedProviders(prev => {
      const next = new Set(prev)
      if (next.has(providerId)) {
        next.delete(providerId)
      } else {
        next.add(providerId)
      }
      return next
    })
  }

  const handleModelToggle = (modelId: string) => {
    if (!compareMode) {
      setSelectedModels([modelId])
    } else {
      setSelectedModels(prev =>
        prev.includes(modelId)
          ? prev.filter(id => id !== modelId)
          : [...prev, modelId]
      )
    }
  }

  const handleConfirm = () => {
    onConfirm(selectedModels, compareMode)
  }

  const calculateCost = (pricePerMillion: number): string => {
    const cost = (pricePerMillion * estimatedTokens) / 1_000_000
    return cost === 0 ? 'FREE' : `$${cost.toFixed(4)}`
  }

  const getColorClasses = (color: string, variant: 'bg' | 'border' | 'text') => {
    const colors: Record<string, Record<string, string>> = {
      emerald: {
        bg: 'bg-emerald-500',
        border: 'border-emerald-500',
        text: 'text-emerald-600 dark:text-emerald-400'
      },
      orange: {
        bg: 'bg-orange-500',
        border: 'border-orange-500',
        text: 'text-orange-600 dark:text-orange-400'
      },
      blue: {
        bg: 'bg-blue-500',
        border: 'border-blue-500',
        text: 'text-blue-600 dark:text-blue-400'
      },
      purple: {
        bg: 'bg-purple-500',
        border: 'border-purple-500',
        text: 'text-purple-600 dark:text-purple-400'
      },
      sky: {
        bg: 'bg-sky-500',
        border: 'border-sky-500',
        text: 'text-sky-600 dark:text-sky-400'
      }
    }
    return colors[color]?.[variant] || colors.blue[variant]
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] overflow-hidden bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                Select Model{compareMode ? 's' : ''}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Choose AI providers and models to execute this prompt
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex gap-3">
            <button
              onClick={() => {
                setCompareMode(false)
                setSelectedModels([defaultModel])
              }}
              className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all ${
                !compareMode
                  ? 'border-2 border-blue-500 bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500'
              }`}
            >
              Single Model
            </button>
            <button
              onClick={() => {
                setCompareMode(true)
                if (selectedModels.length === 1) {
                  setSelectedModels(['gpt-4o-mini', 'claude-sonnet-4-5-20250929', 'deepseek-chat'])
                }
              }}
              className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                compareMode
                  ? 'border-2 border-blue-500 bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500'
              }`}
            >
              <Zap className="w-4 h-4" />
              Compare Multiple
            </button>
          </div>
        </div>

        {/* Provider Groups */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-3">
            {providerGroups.map((provider) => {
              const isExpanded = expandedProviders.has(provider.id)

              return (
                <div key={provider.id} className="border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden bg-white dark:bg-slate-800/80">
                  {/* Provider Header */}
                  <button
                    onClick={() => toggleProvider(provider.id)}
                    className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg ${getColorClasses(provider.color, 'bg')} flex items-center justify-center text-white font-bold text-sm`}>
                        {provider.displayName.charAt(0)}
                      </div>
                      <div className="text-left">
                        <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                          {provider.displayName}
                          {provider.envVar && (
                            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-300 font-mono">
                              {provider.envVar}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-slate-600 dark:text-slate-300">
                          {provider.description}
                        </div>
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-slate-400 dark:text-slate-300" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-slate-400 dark:text-slate-300" />
                    )}
                  </button>

                  {/* Models List */}
                  {isExpanded && (
                    <div className="border-t border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50">
                      {provider.models.map((model) => {
                        const isSelected = selectedModels.includes(model.id)

                        return (
                          <label
                            key={model.id}
                            className={`flex items-start gap-3 p-4 cursor-pointer transition-all hover:bg-slate-100 dark:hover:bg-slate-700 border-b last:border-b-0 border-slate-200 dark:border-slate-600 ${
                              isSelected ? 'bg-slate-100 dark:bg-slate-700' : ''
                            }`}
                          >
                            <div className="relative flex items-center justify-center w-5 h-5 mt-0.5">
                              {compareMode ? (
                                <div className={`w-5 h-5 rounded border-2 transition-all ${
                                  isSelected
                                    ? `${getColorClasses(provider.color, 'bg')} ${getColorClasses(provider.color, 'border')}`
                                    : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                                }`}>
                                  {isSelected && (
                                    <Check className="w-4 h-4 text-white absolute inset-0 m-auto" strokeWidth={3} />
                                  )}
                                </div>
                              ) : (
                                <div className={`w-5 h-5 rounded-full border-2 transition-all ${
                                  isSelected
                                    ? `${getColorClasses(provider.color, 'border')}`
                                    : 'border-slate-300 dark:border-slate-600'
                                }`}>
                                  {isSelected && (
                                    <div className={`w-2.5 h-2.5 rounded-full ${getColorClasses(provider.color, 'bg')} absolute inset-0 m-auto`} />
                                  )}
                                </div>
                              )}
                              <input
                                type={compareMode ? 'checkbox' : 'radio'}
                                checked={isSelected}
                                onChange={() => handleModelToggle(model.id)}
                                className="absolute opacity-0 w-full h-full cursor-pointer"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-slate-900 dark:text-white mb-1">
                                {model.displayName}
                              </div>
                              {model.features && (
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                  {model.features.map((feature) => (
                                    <span
                                      key={feature}
                                      className="text-xs px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200"
                                    >
                                      {feature}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div className="flex gap-4 text-sm text-slate-600 dark:text-slate-300">
                                <span className="flex items-center gap-1.5">
                                  <DollarSign className="w-3.5 h-3.5" />
                                  {calculateCost(model.pricePerMillionTokens)}
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <Clock className="w-3.5 h-3.5" />
                                  ~{(model.averageLatencyMs / 1000).toFixed(1)}s
                                </span>
                              </div>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex gap-3 justify-end bg-slate-50 dark:bg-slate-800/50">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedModels.length === 0}
            className={`px-6 py-2 rounded-lg font-medium transition-all ${
              selectedModels.length === 0
                ? 'bg-slate-300 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700 shadow-sm hover:shadow-md'
            }`}
          >
            Execute {compareMode ? `(${selectedModels.length} models)` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

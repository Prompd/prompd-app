import { Play, Loader2 } from 'lucide-react'
import { GenerationControls, type GenerationMode } from './GenerationControls'

export interface ExecutionControlsProps {
  // Provider/Model
  provider: string
  model: string
  providers: Array<{ id: string, name: string, models: Array<{ id: string, name: string }> }>
  onProviderChange: (provider: string) => void
  onModelChange: (model: string) => void

  // Generation settings
  maxTokens: number
  temperature: number
  mode: GenerationMode
  onMaxTokensChange: (value: number) => void
  onTemperatureChange: (value: number) => void
  onModeChange: (mode: GenerationMode) => void

  // Execution
  isExecuting?: boolean
  canExecute?: boolean
  disabledReason?: string
  onExecute: () => void

  // UI
  theme?: 'vs-dark' | 'light'
  compact?: boolean
  showProviderSelector?: boolean
}

export function ExecutionControls({
  provider,
  model,
  providers,
  onProviderChange,
  onModelChange,
  maxTokens,
  temperature,
  mode,
  onMaxTokensChange,
  onTemperatureChange,
  onModeChange,
  isExecuting = false,
  canExecute = true,
  disabledReason,
  onExecute,
  theme = 'vs-dark',
  compact = false,
  showProviderSelector = true
}: ExecutionControlsProps) {
  const isDark = theme === 'vs-dark'

  // Get current provider's models
  const currentProvider = providers.find(p => p.id === provider)
  const availableModels = currentProvider?.models || []

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 8px',
      flexWrap: 'wrap'
    }}>
      {/* Provider Selection - inline */}
      {showProviderSelector && (
        <select
          value={provider}
          onChange={(e) => onProviderChange(e.target.value)}
          style={{
            padding: '3px 6px',
            fontSize: '11px',
            background: 'transparent',
            color: isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)',
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}`,
            borderRadius: '3px',
            outline: 'none',
            cursor: 'pointer',
            height: '24px',
            minWidth: '85px',
            maxWidth: '110px'
          }}
          title="Provider"
        >
          {providers.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      )}

      {/* Model Selection - inline */}
      {showProviderSelector && (
        <select
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={availableModels.length === 0}
          style={{
            padding: '3px 6px',
            fontSize: '11px',
            background: 'transparent',
            color: isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)',
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}`,
            borderRadius: '3px',
            outline: 'none',
            cursor: availableModels.length > 0 ? 'pointer' : 'not-allowed',
            opacity: availableModels.length === 0 ? 0.5 : 1,
            height: '24px',
            minWidth: '115px',
            maxWidth: '165px',
            flex: '1 1 auto'
          }}
          title="Model"
        >
          {availableModels.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      )}

      {/* Divider between provider/model and generation controls */}
      {showProviderSelector && (
        <div style={{
          width: '1px',
          height: '16px',
          background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
          margin: '0 2px'
        }} />
      )}

      {/* Generation Controls - always inline, wraps naturally via flexWrap */}
      <GenerationControls
        maxTokens={maxTokens}
        temperature={temperature}
        mode={mode}
        onMaxTokensChange={onMaxTokensChange}
        onTemperatureChange={onTemperatureChange}
        onModeChange={onModeChange}
        theme={theme}
        provider={provider}
      />

      {/* Execute Button */}
      <button
        onClick={onExecute}
        disabled={isExecuting || !canExecute}
        title={!canExecute && disabledReason ? disabledReason : 'Execute prompt'}
        style={{
          padding: '5px 16px',
          borderRadius: '6px',
          fontSize: '13px',
          fontWeight: 700,
          background: (isExecuting || !canExecute)
            ? (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)')
            : (isDark ? 'rgba(139, 92, 246, 0.3)' : 'rgba(139, 92, 246, 0.25)'),
          color: (isExecuting || !canExecute)
            ? (isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)')
            : '#fff',
          border: `1px solid ${
            (isExecuting || !canExecute)
              ? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)')
              : (isDark ? 'rgba(139, 92, 246, 0.8)' : 'rgba(139, 92, 246, 0.6)')
          }`,
          cursor: (isExecuting || !canExecute) ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          transition: 'all 0.2s ease',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          marginLeft: 'auto',
          boxShadow: (isExecuting || !canExecute)
            ? 'none'
            : (isDark ? '0 2px 8px rgba(139, 92, 246, 0.2)' : '0 2px 8px rgba(139, 92, 246, 0.15)')
        }}
        onMouseEnter={(e) => {
          if (!isExecuting && canExecute) {
            e.currentTarget.style.background = isDark ? 'rgba(139, 92, 246, 0.4)' : 'rgba(139, 92, 246, 0.35)'
            e.currentTarget.style.borderColor = isDark ? 'rgba(139, 92, 246, 0.9)' : 'rgba(139, 92, 246, 0.7)'
            e.currentTarget.style.transform = 'translateY(-1px)'
            e.currentTarget.style.boxShadow = isDark ? '0 4px 12px rgba(139, 92, 246, 0.3)' : '0 4px 12px rgba(139, 92, 246, 0.25)'
          }
        }}
        onMouseLeave={(e) => {
          if (!isExecuting && canExecute) {
            e.currentTarget.style.background = isDark ? 'rgba(139, 92, 246, 0.3)' : 'rgba(139, 92, 246, 0.25)'
            e.currentTarget.style.borderColor = isDark ? 'rgba(139, 92, 246, 0.8)' : 'rgba(139, 92, 246, 0.6)'
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = isDark ? '0 2px 8px rgba(139, 92, 246, 0.2)' : '0 2px 8px rgba(139, 92, 246, 0.15)'
          }
        }}
      >
        {isExecuting ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            <span>Executing...</span>
          </>
        ) : (
          <>
            <Play size={14} fill="currentColor" />
            <span>Execute</span>
          </>
        )}
      </button>
    </div>
  )
}

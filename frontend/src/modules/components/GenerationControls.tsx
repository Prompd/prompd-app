/**
 * Generation Controls Component
 * Styled controls for max tokens, temperature, and generation mode
 */

import { useState, useRef, useEffect } from 'react'
import { Hash, Thermometer, Sparkles, Brain, FileJson, Zap, ChevronDown, HelpCircle } from 'lucide-react'
import type { GenerationMode } from '../types/wizard'

// Re-export for convenience
export type { GenerationMode }

interface GenerationControlsProps {
  maxTokens: number
  temperature: number
  mode: GenerationMode
  onMaxTokensChange: (value: number) => void
  onTemperatureChange: (value: number) => void
  onModeChange: (mode: GenerationMode) => void
  theme?: 'vs-dark' | 'light'
  /** Current provider name to determine supported modes */
  provider?: string
}

interface ModeConfig {
  label: string
  icon: typeof Sparkles
  color: string
  description: string
  /** List of provider names that support this mode, empty means all providers */
  supportedProviders?: string[]
}

const MODE_CONFIG: Record<GenerationMode, ModeConfig> = {
  default: { label: 'Default', icon: Sparkles, color: '#8b5cf6', description: 'Standard generation' },
  thinking: { label: 'Thinking', icon: Brain, color: '#f59e0b', description: 'Extended reasoning', supportedProviders: ['anthropic'] },
  json: { label: 'JSON', icon: FileJson, color: '#10b981', description: 'Structured output', supportedProviders: ['openai', 'groq', 'mistral', 'together', 'perplexity', 'deepseek', 'ollama'] }
}

/** Check if a mode is supported by the given provider */
function isModeSupported(mode: GenerationMode, provider?: string): boolean {
  const config = MODE_CONFIG[mode]
  // No provider specified or no restrictions = always supported
  if (!provider || !config.supportedProviders) return true
  return config.supportedProviders.includes(provider.toLowerCase())
}

const TOKEN_PRESETS = [1024, 2048, 4096, 8192, 16384]

export function GenerationControls({
  maxTokens,
  temperature,
  mode,
  onMaxTokensChange,
  onTemperatureChange,
  onModeChange,
  theme = 'vs-dark',
  provider
}: GenerationControlsProps) {
  const [showModeDropdown, setShowModeDropdown] = useState(false)
  const [showTokenPresets, setShowTokenPresets] = useState(false)
  const modeRef = useRef<HTMLDivElement>(null)
  const tokenRef = useRef<HTMLDivElement>(null)

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modeRef.current && !modeRef.current.contains(e.target as Node)) {
        setShowModeDropdown(false)
      }
      if (tokenRef.current && !tokenRef.current.contains(e.target as Node)) {
        setShowTokenPresets(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const isDark = theme === 'vs-dark'
  const currentMode = MODE_CONFIG[mode]
  const ModeIcon = currentMode.icon

  const styles = {
    container: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px'
    },
    controlGroup: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '6px 10px',
      borderRadius: '8px',
      background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
      border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
      transition: 'all 0.15s ease'
    },
    controlGroupHover: {
      background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
      borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'
    },
    label: {
      fontSize: '11px',
      fontWeight: 500,
      color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.5px'
    },
    value: {
      fontSize: '13px',
      fontWeight: 600,
      color: isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.85)',
      fontFamily: 'ui-monospace, monospace'
    },
    iconSmall: {
      color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'
    },
    dropdown: {
      position: 'absolute' as const,
      top: '100%',
      left: 0,
      marginTop: '4px',
      background: isDark ? '#1e1e2e' : '#ffffff',
      border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
      borderRadius: '10px',
      boxShadow: isDark
        ? '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)'
        : '0 8px 32px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08)',
      overflow: 'hidden',
      zIndex: 100,
      minWidth: '160px'
    },
    dropdownItem: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '10px 14px',
      cursor: 'pointer',
      transition: 'background 0.1s ease',
      background: 'transparent',
      border: 'none',
      width: '100%',
      textAlign: 'left' as const
    },
    dropdownItemHover: {
      background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'
    },
    slider: {
      width: '70px',
      height: '4px',
      borderRadius: '2px',
      cursor: 'pointer',
      WebkitAppearance: 'none' as const,
      appearance: 'none' as const,
      background: isDark
        ? `linear-gradient(to right, #8b5cf6 0%, #8b5cf6 ${temperature * 100}%, rgba(255,255,255,0.1) ${temperature * 100}%, rgba(255,255,255,0.1) 100%)`
        : `linear-gradient(to right, #8b5cf6 0%, #8b5cf6 ${temperature * 100}%, rgba(0,0,0,0.1) ${temperature * 100}%, rgba(0,0,0,0.1) 100%)`,
      outline: 'none'
    },
    divider: {
      width: '1px',
      height: '28px',
      background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
      margin: '0 4px'
    }
  }

  return (
    <div style={styles.container}>
      {/* Help icon with tooltip - before mode selector */}
      <span
        title="Not all providers support all modes"
        style={{ display: 'inline-flex', alignItems: 'center', cursor: 'help' }}
      >
        <HelpCircle
          size={14}
          style={{
            color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)'
          }}
        />
      </span>

      {/* Mode Selector */}
      <div ref={modeRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setShowModeDropdown(!showModeDropdown)}
          style={{
            ...styles.controlGroup,
            cursor: 'pointer',
            background: isDark ? `rgba(${hexToRgb(currentMode.color)}, 0.1)` : `rgba(${hexToRgb(currentMode.color)}, 0.08)`,
            borderColor: isDark ? `rgba(${hexToRgb(currentMode.color)}, 0.3)` : `rgba(${hexToRgb(currentMode.color)}, 0.25)`
          }}
          title={currentMode.description}
        >
          <ModeIcon size={14} style={{ color: currentMode.color }} />
          <span style={{ ...styles.value, color: currentMode.color }}>{currentMode.label}</span>
          <ChevronDown size={12} style={{ color: currentMode.color, opacity: 0.7 }} />
        </button>

        {showModeDropdown && (
          <div style={styles.dropdown}>
            {(Object.entries(MODE_CONFIG) as [GenerationMode, ModeConfig][]).map(([key, config]) => {
              const Icon = config.icon
              const isSelected = key === mode
              const isSupported = isModeSupported(key as GenerationMode, provider)
              const isDisabled = !isSupported
              return (
                <button
                  key={key}
                  onClick={() => {
                    if (!isDisabled) {
                      onModeChange(key as GenerationMode)
                      setShowModeDropdown(false)
                    }
                  }}
                  disabled={isDisabled}
                  style={{
                    ...styles.dropdownItem,
                    background: isSelected
                      ? (isDark ? `rgba(${hexToRgb(config.color)}, 0.15)` : `rgba(${hexToRgb(config.color)}, 0.1)`)
                      : 'transparent',
                    opacity: isDisabled ? 0.4 : 1,
                    cursor: isDisabled ? 'not-allowed' : 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected && !isDisabled) e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected && !isDisabled) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <Icon size={16} style={{ color: isDisabled ? (isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)') : config.color }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: isDark ? '#fff' : '#000' }}>
                      {config.label}
                      {isDisabled && <span style={{ fontSize: '10px', marginLeft: '6px', opacity: 0.6 }}>(not supported)</span>}
                    </div>
                    <div style={{ fontSize: '11px', color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)' }}>
                      {config.description}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Max Tokens */}
      <div ref={tokenRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setShowTokenPresets(!showTokenPresets)}
          style={{
            ...styles.controlGroup,
            cursor: 'pointer'
          }}
          title="Max tokens to generate"
        >
          <Hash size={12} style={styles.iconSmall} />
          <span style={styles.label}>Max</span>
          <span style={styles.value}>{maxTokens.toLocaleString()}</span>
          <ChevronDown size={10} style={styles.iconSmall} />
        </button>

        {showTokenPresets && (
          <div style={{ ...styles.dropdown, minWidth: '120px' }}>
            {TOKEN_PRESETS.map((preset) => (
              <button
                key={preset}
                onClick={() => {
                  onMaxTokensChange(preset)
                  setShowTokenPresets(false)
                }}
                style={{
                  ...styles.dropdownItem,
                  justifyContent: 'space-between',
                  background: preset === maxTokens
                    ? (isDark ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.1)')
                    : 'transparent'
                }}
                onMouseEnter={(e) => {
                  if (preset !== maxTokens) e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'
                }}
                onMouseLeave={(e) => {
                  if (preset !== maxTokens) e.currentTarget.style.background = 'transparent'
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 500, color: isDark ? '#fff' : '#000' }}>
                  {preset.toLocaleString()}
                </span>
                {preset === maxTokens && (
                  <Zap size={12} style={{ color: '#8b5cf6' }} />
                )}
              </button>
            ))}
            <div style={{
              padding: '8px 14px',
              borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`
            }}>
              <input
                type="number"
                value={maxTokens}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 4096
                  onMaxTokensChange(Math.max(256, Math.min(32768, val)))
                }}
                min={256}
                max={32768}
                step={256}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                  background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                  color: isDark ? '#fff' : '#000',
                  fontSize: '12px',
                  textAlign: 'center',
                  outline: 'none'
                }}
                placeholder="Custom..."
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        )}
      </div>

      {/* Temperature */}
      <div
        style={styles.controlGroup}
        title={`Temperature: ${temperature.toFixed(2)} - Controls randomness (0 = deterministic, 1 = creative)`}
      >
        <Thermometer size={12} style={{
          color: temperature < 0.3 ? '#3b82f6' : temperature > 0.7 ? '#ef4444' : '#f59e0b'
        }} />
        <span style={styles.label}>Temp</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={temperature}
          onChange={(e) => onTemperatureChange(parseFloat(e.target.value))}
          style={styles.slider}
        />
        <span style={{
          ...styles.value,
          minWidth: '32px',
          textAlign: 'right' as const,
          color: temperature < 0.3 ? '#3b82f6' : temperature > 0.7 ? '#ef4444' : '#f59e0b'
        }}>
          {temperature.toFixed(2)}
        </span>
      </div>

      <div style={styles.divider} />
    </div>
  )
}

// Helper to convert hex to RGB
function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return '255,255,255'
  return `${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)}`
}

// Add CSS for the slider thumb
const sliderStyles = `
  .generation-controls-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #8b5cf6;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(139, 92, 246, 0.4);
    transition: transform 0.1s ease;
  }
  .generation-controls-slider::-webkit-slider-thumb:hover {
    transform: scale(1.15);
  }
  .generation-controls-slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #8b5cf6;
    cursor: pointer;
    border: none;
    box-shadow: 0 2px 6px rgba(139, 92, 246, 0.4);
  }
`

// Inject styles on module load
if (typeof document !== 'undefined') {
  const styleEl = document.createElement('style')
  styleEl.textContent = sliderStyles
  document.head.appendChild(styleEl)
}

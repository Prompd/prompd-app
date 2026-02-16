import { useState, useEffect } from 'react'
import { X, Plus, Trash2, Eye, EyeOff, Server, Cpu } from 'lucide-react'
import type { CustomProviderModelConfig, CustomProviderConfig } from '../../electron'

interface CustomProviderModalProps {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
  theme: 'light' | 'dark'
  editProviderId?: string | null
}

interface ModelRow {
  id: string
  name: string
  supports_text: boolean
  supports_vision: boolean
  supports_image_generation: boolean
  supports_tools: boolean
  context_window: string  // string for input binding
}

const emptyModel = (): ModelRow => ({
  id: '',
  name: '',
  supports_text: true,
  supports_vision: false,
  supports_image_generation: false,
  supports_tools: false,
  context_window: ''
})

function parseModelEntry(entry: string | CustomProviderModelConfig): ModelRow {
  if (typeof entry === 'string') {
    return { ...emptyModel(), id: entry, name: entry }
  }
  return {
    id: entry.id,
    name: entry.name || entry.id,
    supports_text: entry.supports_text !== false,
    supports_vision: entry.supports_vision ?? false,
    supports_image_generation: entry.supports_image_generation ?? false,
    supports_tools: entry.supports_tools ?? false,
    context_window: entry.context_window ? String(entry.context_window) : ''
  }
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function CustomProviderModal({ isOpen, onClose, onSaved, theme, editProviderId }: CustomProviderModalProps) {
  const [providerId, setProviderId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [models, setModels] = useState<ModelRow[]>([emptyModel()])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoSlug, setAutoSlug] = useState(true)

  const isEditing = !!editProviderId

  const colors = {
    bg: theme === 'dark' ? '#1e293b' : '#ffffff',
    bgSecondary: theme === 'dark' ? '#0f172a' : '#f8fafc',
    bgTertiary: theme === 'dark' ? '#334155' : '#e2e8f0',
    border: theme === 'dark' ? 'rgba(71, 85, 105, 0.3)' : '#e2e8f0',
    text: theme === 'dark' ? '#ffffff' : '#0f172a',
    textSecondary: theme === 'dark' ? '#94a3b8' : '#64748b',
    textMuted: theme === 'dark' ? '#64748b' : '#94a3b8',
    hover: theme === 'dark' ? 'rgba(71, 85, 105, 0.3)' : 'rgba(148, 163, 184, 0.15)',
    primary: '#3b82f6',
    primaryHover: '#2563eb',
    error: '#ef4444',
    errorBg: theme === 'dark' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.1)',
    errorBorder: theme === 'dark' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.3)',
    toggleOn: '#10b981',
    toggleOff: theme === 'dark' ? '#475569' : '#cbd5e1'
  }

  // Load existing provider data when editing
  useEffect(() => {
    if (!isOpen) return
    if (editProviderId) {
      loadExistingProvider(editProviderId)
    } else {
      // Reset form for new provider
      setProviderId('')
      setDisplayName('')
      setBaseUrl('')
      setApiKey('')
      setShowApiKey(false)
      setEnabled(true)
      setModels([emptyModel()])
      setError(null)
      setAutoSlug(true)
    }
  }, [isOpen, editProviderId])

  const loadExistingProvider = async (id: string) => {
    try {
      const configResult = await window.electronAPI?.config?.load()
      if (!configResult?.success || !configResult.config) return

      const config = configResult.config as Record<string, unknown>
      const customProviders = config.custom_providers as Record<string, CustomProviderConfig> | undefined
      if (!customProviders?.[id]) return

      const provider = customProviders[id]
      setProviderId(id)
      setDisplayName(provider.display_name || id.charAt(0).toUpperCase() + id.slice(1))
      setBaseUrl(provider.base_url || '')
      setEnabled(provider.enabled !== false)
      setAutoSlug(false)

      // Load models
      if (provider.models && provider.models.length > 0) {
        setModels(provider.models.map(parseModelEntry))
      } else {
        setModels([emptyModel()])
      }

      // Load API key
      const keyResult = await window.electronAPI?.config?.getApiKey(id)
      if (keyResult?.apiKey) {
        setApiKey(keyResult.apiKey)
      } else {
        setApiKey('')
      }

      setError(null)
    } catch (err) {
      console.error('[CustomProviderModal] Failed to load provider:', err)
    }
  }

  const handleDisplayNameChange = (value: string) => {
    setDisplayName(value)
    if (autoSlug && !isEditing) {
      setProviderId(slugify(value))
    }
  }

  const handleProviderIdChange = (value: string) => {
    setProviderId(value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
    setAutoSlug(false)
  }

  const updateModel = (index: number, field: keyof ModelRow, value: string | boolean) => {
    setModels(prev => prev.map((m, i) => i === index ? { ...m, [field]: value } : m))
  }

  const addModel = () => {
    setModels(prev => [...prev, emptyModel()])
  }

  const removeModel = (index: number) => {
    setModels(prev => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev)
  }

  const handleSave = async () => {
    // Validate
    if (!providerId.trim()) {
      setError('Provider ID is required')
      return
    }
    if (!displayName.trim()) {
      setError('Display Name is required')
      return
    }
    if (!baseUrl.trim()) {
      setError('Base URL is required')
      return
    }
    const validModels = models.filter(m => m.id.trim())
    if (validModels.length === 0) {
      setError('At least one model with an ID is required')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const api = window.electronAPI?.config
      if (!api) throw new Error('Electron config API not available')

      // Load current config
      const configResult = await api.load()
      if (!configResult.success || !configResult.config) {
        throw new Error('Failed to load config')
      }

      const config = configResult.config as Record<string, unknown>
      const customProviders = (config.custom_providers as Record<string, unknown>) || {}

      // Normalize base URL: strip trailing /chat/completions since the provider appends it
      let normalizedUrl = baseUrl.trim().replace(/\/+$/, '')
      if (normalizedUrl.endsWith('/chat/completions')) {
        normalizedUrl = normalizedUrl.slice(0, -'/chat/completions'.length)
      }

      // Build rich model entries
      const modelEntries: CustomProviderModelConfig[] = validModels.map(m => {
        const entry: CustomProviderModelConfig = {
          id: m.id.trim(),
          name: m.name.trim() || m.id.trim(),
          supports_text: m.supports_text,
          supports_vision: m.supports_vision,
          supports_image_generation: m.supports_image_generation,
          supports_tools: m.supports_tools
        }
        const ctxWindow = parseInt(m.context_window, 10)
        if (!isNaN(ctxWindow) && ctxWindow > 0) {
          entry.context_window = ctxWindow
        }
        return entry
      })

      // Save custom provider config
      customProviders[providerId] = {
        display_name: displayName.trim(),
        base_url: normalizedUrl,
        type: 'openai-compatible',
        enabled,
        models: modelEntries
      }
      config.custom_providers = customProviders
      await api.save(config, 'global')

      // Save API key if provided
      if (apiKey.trim()) {
        await api.setApiKey(providerId, apiKey.trim())
      }

      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save provider')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    background: colors.bg,
    border: `1px solid ${colors.border}`,
    borderRadius: '6px',
    fontSize: '13px',
    color: colors.text,
    boxSizing: 'border-box' as const
  }

  const labelStyle = {
    fontSize: '12px',
    color: colors.textSecondary,
    display: 'block' as const,
    marginBottom: '4px',
    fontWeight: 500 as const
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        backdropFilter: 'blur(4px)'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          borderRadius: '12px',
          width: '90%',
          maxWidth: '640px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: theme === 'dark' ? '0 20px 60px rgba(0, 0, 0, 0.6)' : '0 20px 60px rgba(0, 0, 0, 0.15)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: `1px solid ${colors.border}`
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Server size={20} style={{ color: colors.primary }} />
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: colors.text }}>
              {isEditing ? 'Edit Custom Provider' : 'Add Custom Provider'}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '6px',
              borderRadius: '6px', display: 'flex', alignItems: 'center', color: colors.textSecondary
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = colors.hover)}
            onMouseOut={(e) => (e.currentTarget.style.background = 'none')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          {error && (
            <div style={{
              padding: '10px 14px', background: colors.errorBg, border: `1px solid ${colors.errorBorder}`,
              borderRadius: '6px', marginBottom: '16px', fontSize: '13px', color: colors.error
            }}>
              {error}
            </div>
          )}

          {/* Provider Details */}
          <div style={{ display: 'grid', gap: '12px', marginBottom: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Display Name *</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => handleDisplayNameChange(e.target.value)}
                  placeholder="Custom Provider"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Provider ID *</label>
                <input
                  type="text"
                  value={providerId}
                  onChange={(e) => handleProviderIdChange(e.target.value)}
                  placeholder="custom-provider"
                  disabled={isEditing}
                  style={{ ...inputStyle, opacity: isEditing ? 0.6 : 1, fontFamily: 'monospace', fontSize: '12px' }}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Base URL * <span style={{ fontWeight: 400, color: colors.textMuted }}>(OpenAI-compatible endpoint, without /chat/completions)</span></label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://custom.provider/api/v1"
                style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '12px' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'end' }}>
              <div>
                <label style={labelStyle}>API Key <span style={{ fontWeight: 400, color: colors.textMuted }}>(optional for local models)</span></label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Leave empty for local models"
                    style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '12px', paddingRight: '36px' }}
                  />
                  <button
                    onClick={() => setShowApiKey(!showApiKey)}
                    style={{
                      position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: colors.textSecondary
                    }}
                  >
                    {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <div style={{ paddingBottom: '2px' }}>
                <label style={{ ...labelStyle, marginBottom: '6px' }}>Enabled</label>
                <button
                  onClick={() => setEnabled(!enabled)}
                  style={{
                    width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                    background: enabled ? colors.toggleOn : colors.toggleOff, position: 'relative', transition: 'background 0.2s'
                  }}
                >
                  <div style={{
                    width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
                    position: 'absolute', top: '3px', left: enabled ? '23px' : '3px', transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                  }} />
                </button>
              </div>
            </div>
          </div>

          {/* Models Section */}
          <div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Cpu size={16} style={{ color: colors.primary }} />
                <span style={{ fontSize: '14px', fontWeight: 600, color: colors.text }}>Models</span>
              </div>
              <button
                onClick={addModel}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px',
                  background: 'transparent', border: `1px solid ${colors.border}`, borderRadius: '4px',
                  cursor: 'pointer', fontSize: '12px', color: colors.textSecondary
                }}
                onMouseOver={(e) => { e.currentTarget.style.borderColor = colors.primary; e.currentTarget.style.color = colors.primary }}
                onMouseOut={(e) => { e.currentTarget.style.borderColor = colors.border; e.currentTarget.style.color = colors.textSecondary }}
              >
                <Plus size={12} /> Add Model
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {models.map((model, index) => (
                <div
                  key={index}
                  style={{
                    padding: '12px',
                    background: colors.bgSecondary,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '8px'
                  }}
                >
                  {/* Model ID + Name row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '8px', marginBottom: '8px' }}>
                    <div>
                      <label style={{ ...labelStyle, fontSize: '11px' }}>Model ID *</label>
                      <input
                        type="text"
                        value={model.id}
                        onChange={(e) => updateModel(index, 'id', e.target.value)}
                        placeholder="model-name"
                        style={{ ...inputStyle, fontSize: '12px', fontFamily: 'monospace' }}
                      />
                    </div>
                    <div>
                      <label style={{ ...labelStyle, fontSize: '11px' }}>Display Name</label>
                      <input
                        type="text"
                        value={model.name}
                        onChange={(e) => updateModel(index, 'name', e.target.value)}
                        placeholder={model.id || 'Optional'}
                        style={{ ...inputStyle, fontSize: '12px' }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '1px' }}>
                      <button
                        onClick={() => removeModel(index)}
                        disabled={models.length <= 1}
                        style={{
                          padding: '6px', background: 'none', border: 'none', cursor: models.length <= 1 ? 'default' : 'pointer',
                          color: models.length <= 1 ? colors.textMuted : colors.error, borderRadius: '4px',
                          opacity: models.length <= 1 ? 0.3 : 1, display: 'flex'
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Capabilities + Context Window row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <CapabilityToggle
                      label="Text"
                      checked={model.supports_text}
                      onChange={(v) => updateModel(index, 'supports_text', v)}
                      colors={colors}
                    />
                    <CapabilityToggle
                      label="Vision"
                      checked={model.supports_vision}
                      onChange={(v) => updateModel(index, 'supports_vision', v)}
                      colors={colors}
                    />
                    <CapabilityToggle
                      label="Image Gen"
                      checked={model.supports_image_generation}
                      onChange={(v) => updateModel(index, 'supports_image_generation', v)}
                      colors={colors}
                    />
                    <CapabilityToggle
                      label="Tools"
                      checked={model.supports_tools}
                      onChange={(v) => updateModel(index, 'supports_tools', v)}
                      colors={colors}
                    />
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <label style={{ fontSize: '11px', color: colors.textMuted }}>Context</label>
                      <input
                        type="text"
                        value={model.context_window}
                        onChange={(e) => updateModel(index, 'context_window', e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder="32000"
                        style={{ ...inputStyle, width: '80px', fontSize: '11px', textAlign: 'right' as const }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: '8px',
          padding: '14px 20px', borderTop: `1px solid ${colors.border}`
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px', background: colors.bgSecondary, border: `1px solid ${colors.border}`,
              borderRadius: '6px', cursor: 'pointer', fontSize: '13px', color: colors.text
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '8px 20px', background: saving ? colors.bgTertiary : colors.primary, border: 'none',
              borderRadius: '6px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '13px',
              color: 'white', fontWeight: 500, opacity: saving ? 0.6 : 1
            }}
          >
            {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Provider'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Capability-specific colors matching ProviderModelSelector icons
const CAPABILITY_COLORS: Record<string, string> = {
  Text: '#10b981',       // emerald
  Vision: '#8b5cf6',     // purple (matches Eye icon)
  'Image Gen': '#f59e0b', // amber (matches ImageIcon)
  Tools: '#3b82f6',      // blue (matches Wrench icon)
}

// Small inline toggle for capabilities
function CapabilityToggle({
  label,
  checked,
  onChange,
  colors
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  colors: Record<string, string>
}) {
  const activeColor = CAPABILITY_COLORS[label] || colors.primary
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '3px 8px',
        background: checked ? `${activeColor}22` : 'transparent',
        border: `1px solid ${checked ? activeColor : colors.border}`,
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '11px',
        color: checked ? activeColor : colors.textMuted,
        fontWeight: checked ? 500 : 400,
        transition: 'all 0.15s'
      }}
    >
      <div style={{
        width: '8px', height: '8px', borderRadius: '2px',
        background: checked ? activeColor : colors.toggleOff,
        transition: 'background 0.15s'
      }} />
      {label}
    </button>
  )
}

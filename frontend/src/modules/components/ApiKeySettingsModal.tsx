import React, { useState, useEffect } from 'react'
import { X, Key, Trash2, Plus, Eye, EyeOff, Check, AlertCircle, ExternalLink, BarChart3, ChevronDown, Star } from 'lucide-react'
import {
  getLLMProviders,
  setLlmApiKey,
  removeLlmApiKey,
  setDefaultProvider,
  LLMProvidersResponse,
  ProviderInfo,
  CustomProviderConfig
} from '../services/aiApi'
import { usePrompdUsage, formatCost, formatTokens } from '@prompd/react'
import { useConfirmDialog } from './ConfirmDialog'

type TabType = 'keys' | 'usage'

interface ApiKeySettingsModalProps {
  isOpen: boolean
  onClose: () => void
  theme: 'light' | 'dark'
  onProvidersChanged?: () => void  // Callback when providers are added/removed
}

export function ApiKeySettingsModal({ isOpen, onClose, theme, onProvidersChanged }: ApiKeySettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('keys')
  const [providersData, setProvidersData] = useState<LLMProvidersResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Custom confirm dialog
  const { showConfirm, ConfirmDialogComponent } = useConfirmDialog(theme)

  // Usage tracking
  const { events, stats, clearUsage, getSessionStats, getTodayStats } = usePrompdUsage()

  // Theme-aware colors
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
    success: '#10b981',
    successBg: theme === 'dark' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.1)',
    successBorder: theme === 'dark' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.3)',
    error: '#ef4444',
    errorBg: theme === 'dark' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.1)',
    errorBorder: theme === 'dark' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.3)',
    infoBg: theme === 'dark' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.1)',
    infoBorder: theme === 'dark' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.3)',
    warningBg: theme === 'dark' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.1)',
    warningBorder: theme === 'dark' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(245, 158, 11, 0.3)',
    warning: '#f59e0b'
  }

  // Add key state
  const [showAddKeyFor, setShowAddKeyFor] = useState<string | null>(null)
  const [newApiKey, setNewApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [isAddingKey, setIsAddingKey] = useState(false)

  // Add provider state
  const [showAddProviderForm, setShowAddProviderForm] = useState(false)
  const [addProviderMode, setAddProviderMode] = useState<'select' | 'known' | 'custom'>('select')
  const [selectedKnownProvider, setSelectedKnownProvider] = useState<string | null>(null)

  // Custom provider state
  const [showCustomProviderForm, setShowCustomProviderForm] = useState(false)
  const [customProviderId, setCustomProviderId] = useState('')
  const [customDisplayName, setCustomDisplayName] = useState('')
  const [customBaseUrl, setCustomBaseUrl] = useState('')
  const [customModels, setCustomModels] = useState('')

  useEffect(() => {
    if (isOpen) {
      loadProviders()
    }
  }, [isOpen])

  const loadProviders = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getLLMProviders()
      setProvidersData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load providers')
    } finally {
      setLoading(false)
    }
  }

  const handleAddKey = async (providerId: string, customConfig?: CustomProviderConfig) => {
    if (!newApiKey.trim()) {
      setError('Please enter an API key')
      return
    }

    setIsAddingKey(true)
    setError(null)
    setSuccess(null)

    try {
      await setLlmApiKey(providerId, newApiKey, customConfig)
      const displayName = customConfig?.displayName || providersData?.providers[providerId]?.displayName || providerId
      setSuccess(`${displayName} API key added successfully! You now have unlimited generations.`)
      setNewApiKey('')
      setShowAddKeyFor(null)
      setShowApiKey(false)
      setShowCustomProviderForm(false)
      setShowAddProviderForm(false)
      setAddProviderMode('select')
      setSelectedKnownProvider(null)
      setCustomProviderId('')
      setCustomDisplayName('')
      setCustomBaseUrl('')
      setCustomModels('')
      await loadProviders()
      // Notify parent to refresh global provider state
      onProvidersChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add API key')
    } finally {
      setIsAddingKey(false)
    }
  }

  const handleRemoveKey = async (providerId: string) => {
    const displayName = providersData?.providers[providerId]?.displayName || providerId
    const confirmed = await showConfirm({
      title: 'Remove API Key',
      message: `Remove ${displayName} API key? You will revert to plan-based quotas.`,
      confirmLabel: 'Remove',
      cancelLabel: 'Cancel',
      confirmVariant: 'danger'
    })
    if (!confirmed) {
      return
    }

    setError(null)
    setSuccess(null)

    try {
      await removeLlmApiKey(providerId)
      setSuccess(`${displayName} API key removed`)
      await loadProviders()
      // Notify parent to refresh global provider state
      onProvidersChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove API key')
    }
  }

  const handleSetDefault = async (providerId: string) => {
    setError(null)
    try {
      await setDefaultProvider(providerId)
      await loadProviders()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set default provider')
    }
  }

  const handleAddCustomProvider = () => {
    if (!customProviderId.trim() || !customDisplayName.trim() || !customBaseUrl.trim()) {
      setError('Provider ID, Display Name, and Base URL are required for custom providers')
      return
    }

    const customConfig: CustomProviderConfig = {
      displayName: customDisplayName.trim(),
      baseUrl: customBaseUrl.trim(),
      models: customModels.split(',').map(m => m.trim()).filter(Boolean)
    }

    handleAddKey(customProviderId.trim().toLowerCase().replace(/\s+/g, '-'), customConfig)
  }

  const handleClearUsage = async () => {
    const confirmed = await showConfirm({
      title: 'Clear Usage History',
      message: 'Clear all usage history? This cannot be undone.',
      confirmLabel: 'Clear',
      cancelLabel: 'Cancel',
      confirmVariant: 'danger'
    })
    if (confirmed) {
      clearUsage()
    }
  }

  if (!isOpen) return null

  const sessionStats = getSessionStats()
  const todayStats = getTodayStats()

  // Get all providers as sorted array (for Add Provider form)
  const allProvidersList: ProviderInfo[] = providersData?.providers
    ? Object.values(providersData.providers).sort((a, b) => {
        // Configured providers first, then by name
        if (a.hasKey && !b.hasKey) return -1
        if (!a.hasKey && b.hasKey) return 1
        return a.displayName.localeCompare(b.displayName)
      })
    : []

  // Only show configured providers in the main list
  const providersList = allProvidersList.filter(p => p.hasKey)

  // Render provider card
  const renderProviderCard = (provider: ProviderInfo) => {
    const isDefault = providersData?.defaultProvider === provider.providerId

    return (
      <div
        key={provider.providerId}
        style={{
          padding: '16px',
          background: colors.bgSecondary,
          border: `1px solid ${isDefault ? colors.primary : colors.border}`,
          borderRadius: '8px',
          marginBottom: '12px',
          transition: 'all 0.2s ease'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: provider.hasKey || showAddKeyFor === provider.providerId ? '12px' : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px', fontWeight: 600, color: colors.text }}>{provider.displayName}</span>
                {provider.isCustom && (
                  <span style={{ fontSize: '10px', padding: '2px 6px', background: colors.warningBg, border: `1px solid ${colors.warningBorder}`, borderRadius: '4px', color: colors.warning }}>
                    Custom
                  </span>
                )}
                {isDefault && (
                  <Star size={14} style={{ color: colors.warning, fill: colors.warning }} />
                )}
              </div>
              <div style={{ fontSize: '13px', color: colors.textSecondary }}>
                {provider.hasKey ? (
                  <span style={{ color: colors.success }}>API key configured</span>
                ) : (
                  'No API key configured'
                )}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {provider.hasKey && !isDefault && (
              <button
                onClick={() => handleSetDefault(provider.providerId)}
                title="Set as default"
                style={{
                  padding: '8px 12px',
                  background: 'transparent',
                  border: `1px solid ${colors.border}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  color: colors.textSecondary,
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => (e.currentTarget.style.borderColor = colors.warning)}
                onMouseOut={(e) => (e.currentTarget.style.borderColor = colors.border)}
              >
                <Star size={14} />
                Default
              </button>
            )}
            {provider.hasKey ? (
              <button
                onClick={() => handleRemoveKey(provider.providerId)}
                style={{
                  padding: '8px 12px',
                  background: colors.errorBg,
                  border: `1px solid ${colors.errorBorder}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  color: colors.error,
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => (e.currentTarget.style.opacity = '0.8')}
                onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
              >
                <Trash2 size={14} />
                Remove
              </button>
            ) : (
              <button
                onClick={() => {
                  setShowAddKeyFor(provider.providerId)
                  setShowCustomProviderForm(false)
                }}
                style={{
                  padding: '8px 12px',
                  background: colors.primary,
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  color: 'white',
                  fontWeight: 500,
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = colors.primaryHover)}
                onMouseOut={(e) => (e.currentTarget.style.background = colors.primary)}
              >
                <Plus size={14} />
                Add Key
              </button>
            )}
          </div>
        </div>

        {showAddKeyFor === provider.providerId && (
          <div style={{ paddingTop: '12px', borderTop: `1px solid ${colors.border}` }}>
            <div style={{ marginBottom: '8px' }}>
              <label style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>
                API Key
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder={provider.keyPrefix ? `${provider.keyPrefix}...` : 'Enter API key'}
                  style={{
                    width: '100%',
                    padding: '10px 40px 10px 12px',
                    background: colors.bg,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '6px',
                    fontSize: '14px',
                    color: colors.text,
                    fontFamily: 'monospace',
                    transition: 'all 0.2s ease',
                    boxSizing: 'border-box'
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = colors.primary)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = colors.border)}
                />
                <button
                  onClick={() => setShowApiKey(!showApiKey)}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    color: colors.textSecondary
                  }}
                >
                  {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {provider.consoleUrl && (
              <div style={{ fontSize: '12px', color: colors.textSecondary, marginBottom: '12px' }}>
                Get your API key from{' '}
                <a
                  href={provider.consoleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: colors.primary, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  {provider.displayName} Console
                  <ExternalLink size={12} />
                </a>
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => {
                  setShowAddKeyFor(null)
                  setNewApiKey('')
                  setShowApiKey(false)
                }}
                style={{
                  padding: '8px 16px',
                  background: colors.bgSecondary,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: colors.text,
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = colors.hover)}
                onMouseOut={(e) => (e.currentTarget.style.background = colors.bgSecondary)}
              >
                Cancel
              </button>
              <button
                onClick={() => handleAddKey(provider.providerId)}
                disabled={isAddingKey || !newApiKey.trim()}
                style={{
                  padding: '8px 16px',
                  background: isAddingKey || !newApiKey.trim() ? colors.bgTertiary : colors.primary,
                  border: 'none',
                  borderRadius: '6px',
                  cursor: isAddingKey || !newApiKey.trim() ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  color: 'white',
                  fontWeight: 500,
                  opacity: isAddingKey || !newApiKey.trim() ? 0.5 : 1,
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  if (!isAddingKey && newApiKey.trim()) {
                    e.currentTarget.style.background = colors.primaryHover
                  }
                }}
                onMouseOut={(e) => {
                  if (!isAddingKey && newApiKey.trim()) {
                    e.currentTarget.style.background = colors.primary
                  }
                }}
              >
                {isAddingKey ? 'Adding...' : 'Add Key'}
              </button>
            </div>
          </div>
        )}
      </div>
    )
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
        zIndex: 9999,
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
          maxWidth: '600px',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: theme === 'dark' ? '0 20px 60px rgba(0, 0, 0, 0.6)' : '0 20px 60px rgba(0, 0, 0, 0.15)',
          transition: 'all 0.2s ease'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: `1px solid ${colors.border}`
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Key size={24} style={{ color: colors.primary }} />
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: colors.text }}>Settings</h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              color: colors.textSecondary,
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = colors.hover)}
            onMouseOut={(e) => (e.currentTarget.style.background = 'none')}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: `1px solid ${colors.border}`,
          padding: '0 24px'
        }}>
          <button
            onClick={() => setActiveTab('keys')}
            style={{
              padding: '12px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'keys' ? `2px solid ${colors.primary}` : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '14px',
              fontWeight: activeTab === 'keys' ? 600 : 400,
              color: activeTab === 'keys' ? colors.primary : colors.textSecondary,
              transition: 'all 0.2s ease',
              marginBottom: '-1px'
            }}
          >
            <Key size={16} />
            API Keys
          </button>
          <button
            onClick={() => setActiveTab('usage')}
            style={{
              padding: '12px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'usage' ? `2px solid ${colors.primary}` : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '14px',
              fontWeight: activeTab === 'usage' ? 600 : 400,
              color: activeTab === 'usage' ? colors.primary : colors.textSecondary,
              transition: 'all 0.2s ease',
              marginBottom: '-1px'
            }}
          >
            <BarChart3 size={16} />
            Usage
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px' }}>
          {activeTab === 'keys' && (
            <>
              {/* Info Banner */}
              <div
                style={{
                  padding: '12px 16px',
                  background: colors.infoBg,
                  border: `1px solid ${colors.infoBorder}`,
                  borderRadius: '8px',
                  marginBottom: '24px'
                }}
              >
                <div style={{ fontSize: '13px', color: colors.textSecondary }}>
                  Add your own API keys to unlock unlimited AI generations and executions. Keys are encrypted and stored securely.
                  {providersData?.totalConfigured ? ` You have ${providersData.totalConfigured} provider(s) configured.` : ''}
                </div>
              </div>

              {/* Success Message */}
              {success && (
                <div
                  style={{
                    padding: '12px 16px',
                    background: colors.successBg,
                    border: `1px solid ${colors.successBorder}`,
                    borderRadius: '8px',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}
                >
                  <Check size={20} style={{ color: colors.success, flexShrink: 0 }} />
                  <span style={{ fontSize: '14px', color: colors.success }}>{success}</span>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div
                  style={{
                    padding: '12px 16px',
                    background: colors.errorBg,
                    border: `1px solid ${colors.errorBorder}`,
                    borderRadius: '8px',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}
                >
                  <AlertCircle size={20} style={{ color: colors.error, flexShrink: 0 }} />
                  <span style={{ fontSize: '14px', color: colors.error }}>{error}</span>
                </div>
              )}

              {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: colors.textSecondary }}>Loading...</div>
              ) : (
                <>
                  {/* Provider Cards */}
                  {providersList.length > 0 ? (
                    providersList.map(renderProviderCard)
                  ) : (
                    <div style={{
                      padding: '24px',
                      textAlign: 'center',
                      background: colors.bgSecondary,
                      borderRadius: '8px',
                      border: `1px solid ${colors.border}`,
                      marginBottom: '12px'
                    }}>
                      <div style={{ fontSize: '14px', color: colors.textSecondary, marginBottom: '8px' }}>
                        No providers configured yet
                      </div>
                      <div style={{ fontSize: '13px', color: colors.textMuted }}>
                        Add your API keys to unlock unlimited AI generations
                      </div>
                    </div>
                  )}

                  {/* Add Provider Button */}
                  <button
                    onClick={() => {
                      setShowAddProviderForm(true)
                      setAddProviderMode('select')
                      setSelectedKnownProvider(null)
                      setShowCustomProviderForm(false)
                      setShowAddKeyFor(null)
                      setNewApiKey('')
                    }}
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: 'transparent',
                      border: `1px dashed ${colors.border}`,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      fontSize: '13px',
                      color: colors.textSecondary,
                      transition: 'all 0.2s ease',
                      marginTop: '8px'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.borderColor = colors.primary
                      e.currentTarget.style.color = colors.primary
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.borderColor = colors.border
                      e.currentTarget.style.color = colors.textSecondary
                    }}
                  >
                    <Plus size={16} />
                    Add Provider
                  </button>

                  {/* Add Provider Form */}
                  {showAddProviderForm && (
                    <div
                      style={{
                        marginTop: '16px',
                        padding: '16px',
                        background: colors.bgSecondary,
                        border: `1px solid ${colors.border}`,
                        borderRadius: '8px'
                      }}
                    >
                      <div style={{ fontSize: '14px', fontWeight: 600, color: colors.text, marginBottom: '16px' }}>
                        Add Provider
                      </div>

                      {/* Provider Selection */}
                      {addProviderMode === 'select' && (
                        <div style={{ display: 'grid', gap: '12px' }}>
                          <div style={{ fontSize: '13px', color: colors.textSecondary, marginBottom: '8px' }}>
                            Select a provider to configure:
                          </div>

                          {/* List of unconfigured known providers */}
                          <div style={{ display: 'grid', gap: '8px', maxHeight: '240px', overflowY: 'auto' }}>
                            {allProvidersList
                              .filter(p => !p.hasKey && !p.isCustom)
                              .map(provider => (
                                <button
                                  key={provider.providerId}
                                  onClick={() => {
                                    setSelectedKnownProvider(provider.providerId)
                                    setAddProviderMode('known')
                                    setNewApiKey('')
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '12px',
                                    background: colors.bg,
                                    border: `1px solid ${colors.border}`,
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    transition: 'all 0.2s ease'
                                  }}
                                  onMouseOver={(e) => {
                                    e.currentTarget.style.borderColor = colors.primary
                                    e.currentTarget.style.background = colors.hover
                                  }}
                                  onMouseOut={(e) => {
                                    e.currentTarget.style.borderColor = colors.border
                                    e.currentTarget.style.background = colors.bg
                                  }}
                                >
                                  <div>
                                    <div style={{ fontWeight: 500, color: colors.text }}>{provider.displayName}</div>
                                    {provider.keyPrefix && (
                                      <div style={{ fontSize: '11px', color: colors.textMuted }}>
                                        Key prefix: {provider.keyPrefix}...
                                      </div>
                                    )}
                                    {provider.isLocal && (
                                      <div style={{ fontSize: '11px', color: colors.textMuted }}>
                                        Local provider (no API key required)
                                      </div>
                                    )}
                                  </div>
                                  <ChevronDown size={16} style={{ color: colors.textSecondary, transform: 'rotate(-90deg)' }} />
                                </button>
                              ))}

                            {allProvidersList.filter(p => !p.hasKey && !p.isCustom).length === 0 && (
                              <div style={{ padding: '16px', textAlign: 'center', color: colors.textMuted, fontSize: '13px' }}>
                                All supported providers are already configured!
                              </div>
                            )}
                          </div>

                          {/* Custom Provider Option */}
                          <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: '12px', marginTop: '4px' }}>
                            <button
                              onClick={() => {
                                setAddProviderMode('custom')
                                setCustomProviderId('')
                                setCustomDisplayName('')
                                setCustomBaseUrl('')
                                setCustomModels('')
                                setNewApiKey('')
                              }}
                              style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '12px',
                                background: colors.bg,
                                border: `1px dashed ${colors.border}`,
                                borderRadius: '6px',
                                cursor: 'pointer',
                                textAlign: 'left',
                                transition: 'all 0.2s ease'
                              }}
                              onMouseOver={(e) => {
                                e.currentTarget.style.borderColor = colors.primary
                              }}
                              onMouseOut={(e) => {
                                e.currentTarget.style.borderColor = colors.border
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: 500, color: colors.text }}>Custom Provider</div>
                                <div style={{ fontSize: '11px', color: colors.textMuted }}>
                                  Add any OpenAI-compatible API endpoint
                                </div>
                              </div>
                              <Plus size={16} style={{ color: colors.textSecondary }} />
                            </button>
                          </div>

                          <button
                            onClick={() => {
                              setShowAddProviderForm(false)
                              setAddProviderMode('select')
                            }}
                            style={{
                              padding: '8px 16px',
                              background: colors.bgSecondary,
                              border: `1px solid ${colors.border}`,
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '13px',
                              color: colors.text,
                              marginTop: '8px'
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      )}

                      {/* Known Provider API Key Form */}
                      {addProviderMode === 'known' && selectedKnownProvider && (
                        <div style={{ display: 'grid', gap: '12px' }}>
                          {(() => {
                            const provider = allProvidersList.find(p => p.providerId === selectedKnownProvider)
                            if (!provider) return null
                            return (
                              <>
                                <div style={{
                                  padding: '12px',
                                  background: colors.infoBg,
                                  border: `1px solid ${colors.infoBorder}`,
                                  borderRadius: '6px',
                                  marginBottom: '4px'
                                }}>
                                  <div style={{ fontWeight: 500, color: colors.text, marginBottom: '4px' }}>
                                    {provider.displayName}
                                  </div>
                                  {provider.consoleUrl && (
                                    <a
                                      href={provider.consoleUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{
                                        fontSize: '12px',
                                        color: colors.primary,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                      }}
                                    >
                                      Get your API key
                                      <ExternalLink size={12} />
                                    </a>
                                  )}
                                </div>

                                <div>
                                  <label style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>
                                    API Key {provider.keyPrefix && `(starts with ${provider.keyPrefix})`}
                                  </label>
                                  <div style={{ position: 'relative' }}>
                                    <input
                                      type={showApiKey ? 'text' : 'password'}
                                      value={newApiKey}
                                      onChange={(e) => setNewApiKey(e.target.value)}
                                      placeholder={provider.keyPrefix ? `${provider.keyPrefix}...` : 'Enter API key'}
                                      style={{
                                        width: '100%',
                                        padding: '10px 40px 10px 12px',
                                        background: colors.bg,
                                        border: `1px solid ${colors.border}`,
                                        borderRadius: '6px',
                                        fontSize: '14px',
                                        color: colors.text,
                                        fontFamily: 'monospace',
                                        boxSizing: 'border-box'
                                      }}
                                    />
                                    <button
                                      onClick={() => setShowApiKey(!showApiKey)}
                                      style={{
                                        position: 'absolute',
                                        right: '8px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: '4px',
                                        color: colors.textSecondary
                                      }}
                                    >
                                      {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                  <button
                                    onClick={() => {
                                      setAddProviderMode('select')
                                      setSelectedKnownProvider(null)
                                      setNewApiKey('')
                                      setShowApiKey(false)
                                    }}
                                    style={{
                                      padding: '8px 16px',
                                      background: colors.bgSecondary,
                                      border: `1px solid ${colors.border}`,
                                      borderRadius: '6px',
                                      cursor: 'pointer',
                                      fontSize: '13px',
                                      color: colors.text
                                    }}
                                  >
                                    Back
                                  </button>
                                  <button
                                    onClick={() => handleAddKey(selectedKnownProvider)}
                                    disabled={isAddingKey || !newApiKey.trim()}
                                    style={{
                                      padding: '8px 16px',
                                      background: isAddingKey || !newApiKey.trim() ? colors.bgTertiary : colors.primary,
                                      border: 'none',
                                      borderRadius: '6px',
                                      cursor: isAddingKey || !newApiKey.trim() ? 'not-allowed' : 'pointer',
                                      fontSize: '13px',
                                      color: 'white',
                                      fontWeight: 500,
                                      opacity: isAddingKey || !newApiKey.trim() ? 0.5 : 1
                                    }}
                                  >
                                    {isAddingKey ? 'Adding...' : 'Add API Key'}
                                  </button>
                                </div>
                              </>
                            )
                          })()}
                        </div>
                      )}

                      {/* Custom Provider Form */}
                      {addProviderMode === 'custom' && (
                        <div style={{ display: 'grid', gap: '12px' }}>
                          <div>
                            <label style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>
                              Provider ID (e.g., my-provider)
                            </label>
                            <input
                              type="text"
                              value={customProviderId}
                              onChange={(e) => setCustomProviderId(e.target.value)}
                              placeholder="my-custom-provider"
                              style={{
                                width: '100%',
                                padding: '10px 12px',
                                background: colors.bg,
                                border: `1px solid ${colors.border}`,
                                borderRadius: '6px',
                                fontSize: '14px',
                                color: colors.text,
                                boxSizing: 'border-box'
                              }}
                            />
                          </div>

                          <div>
                            <label style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>
                              Display Name
                            </label>
                            <input
                              type="text"
                              value={customDisplayName}
                              onChange={(e) => setCustomDisplayName(e.target.value)}
                              placeholder="My Custom Provider"
                              style={{
                                width: '100%',
                                padding: '10px 12px',
                                background: colors.bg,
                                border: `1px solid ${colors.border}`,
                                borderRadius: '6px',
                                fontSize: '14px',
                                color: colors.text,
                                boxSizing: 'border-box'
                              }}
                            />
                          </div>

                          <div>
                            <label style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>
                              Base URL (OpenAI-compatible API)
                            </label>
                            <input
                              type="text"
                              value={customBaseUrl}
                              onChange={(e) => setCustomBaseUrl(e.target.value)}
                              placeholder="https://api.example.com/v1"
                              style={{
                                width: '100%',
                                padding: '10px 12px',
                                background: colors.bg,
                                border: `1px solid ${colors.border}`,
                                borderRadius: '6px',
                                fontSize: '14px',
                                color: colors.text,
                                boxSizing: 'border-box'
                              }}
                            />
                          </div>

                          <div>
                            <label style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>
                              Models (comma-separated, optional)
                            </label>
                            <input
                              type="text"
                              value={customModels}
                              onChange={(e) => setCustomModels(e.target.value)}
                              placeholder="model-1, model-2, model-3"
                              style={{
                                width: '100%',
                                padding: '10px 12px',
                                background: colors.bg,
                                border: `1px solid ${colors.border}`,
                                borderRadius: '6px',
                                fontSize: '14px',
                                color: colors.text,
                                boxSizing: 'border-box'
                              }}
                            />
                          </div>

                          <div>
                            <label style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>
                              API Key
                            </label>
                            <div style={{ position: 'relative' }}>
                              <input
                                type={showApiKey ? 'text' : 'password'}
                                value={newApiKey}
                                onChange={(e) => setNewApiKey(e.target.value)}
                                placeholder="Enter API key"
                                style={{
                                  width: '100%',
                                  padding: '10px 40px 10px 12px',
                                  background: colors.bg,
                                  border: `1px solid ${colors.border}`,
                                  borderRadius: '6px',
                                  fontSize: '14px',
                                  color: colors.text,
                                  fontFamily: 'monospace',
                                  boxSizing: 'border-box'
                                }}
                              />
                              <button
                                onClick={() => setShowApiKey(!showApiKey)}
                                style={{
                                  position: 'absolute',
                                  right: '8px',
                                  top: '50%',
                                  transform: 'translateY(-50%)',
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: '4px',
                                  color: colors.textSecondary
                                }}
                              >
                                {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                              </button>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                            <button
                              onClick={() => {
                                setAddProviderMode('select')
                                setCustomProviderId('')
                                setCustomDisplayName('')
                                setCustomBaseUrl('')
                                setCustomModels('')
                                setNewApiKey('')
                                setShowApiKey(false)
                              }}
                              style={{
                                padding: '8px 16px',
                                background: colors.bgSecondary,
                                border: `1px solid ${colors.border}`,
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                color: colors.text
                              }}
                            >
                              Back
                            </button>
                            <button
                              onClick={handleAddCustomProvider}
                              disabled={isAddingKey || !customProviderId.trim() || !customDisplayName.trim() || !customBaseUrl.trim() || !newApiKey.trim()}
                              style={{
                                padding: '8px 16px',
                                background: colors.primary,
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                color: 'white',
                                fontWeight: 500,
                                opacity: isAddingKey || !customProviderId.trim() || !customDisplayName.trim() || !customBaseUrl.trim() || !newApiKey.trim() ? 0.5 : 1
                              }}
                            >
                              {isAddingKey ? 'Adding...' : 'Add Custom Provider'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Legacy Custom Provider Form (keep for backward compatibility during migration) */}
                  {showCustomProviderForm && !showAddProviderForm && (
                    <div
                      style={{
                        marginTop: '16px',
                        padding: '16px',
                        background: colors.bgSecondary,
                        border: `1px solid ${colors.border}`,
                        borderRadius: '8px'
                      }}
                    >
                      <div style={{ fontSize: '14px', fontWeight: 600, color: colors.text, marginBottom: '16px' }}>
                        Add Custom Provider
                      </div>

                      <div style={{ display: 'grid', gap: '12px' }}>
                        <div>
                          <label style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>
                            Provider ID (e.g., my-provider)
                          </label>
                          <input
                            type="text"
                            value={customProviderId}
                            onChange={(e) => setCustomProviderId(e.target.value)}
                            placeholder="my-custom-provider"
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              background: colors.bg,
                              border: `1px solid ${colors.border}`,
                              borderRadius: '6px',
                              fontSize: '14px',
                              color: colors.text,
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>
                            Display Name
                          </label>
                          <input
                            type="text"
                            value={customDisplayName}
                            onChange={(e) => setCustomDisplayName(e.target.value)}
                            placeholder="My Custom Provider"
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              background: colors.bg,
                              border: `1px solid ${colors.border}`,
                              borderRadius: '6px',
                              fontSize: '14px',
                              color: colors.text,
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>
                            Base URL (OpenAI-compatible API)
                          </label>
                          <input
                            type="text"
                            value={customBaseUrl}
                            onChange={(e) => setCustomBaseUrl(e.target.value)}
                            placeholder="https://api.example.com/v1"
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              background: colors.bg,
                              border: `1px solid ${colors.border}`,
                              borderRadius: '6px',
                              fontSize: '14px',
                              color: colors.text,
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>
                            Models (comma-separated, optional)
                          </label>
                          <input
                            type="text"
                            value={customModels}
                            onChange={(e) => setCustomModels(e.target.value)}
                            placeholder="model-1, model-2, model-3"
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              background: colors.bg,
                              border: `1px solid ${colors.border}`,
                              borderRadius: '6px',
                              fontSize: '14px',
                              color: colors.text,
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>
                            API Key
                          </label>
                          <div style={{ position: 'relative' }}>
                            <input
                              type={showApiKey ? 'text' : 'password'}
                              value={newApiKey}
                              onChange={(e) => setNewApiKey(e.target.value)}
                              placeholder="Enter API key"
                              style={{
                                width: '100%',
                                padding: '10px 40px 10px 12px',
                                background: colors.bg,
                                border: `1px solid ${colors.border}`,
                                borderRadius: '6px',
                                fontSize: '14px',
                                color: colors.text,
                                fontFamily: 'monospace',
                                boxSizing: 'border-box'
                              }}
                            />
                            <button
                              onClick={() => setShowApiKey(!showApiKey)}
                              style={{
                                position: 'absolute',
                                right: '8px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '4px',
                                color: colors.textSecondary
                              }}
                            >
                              {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                        <button
                          onClick={() => {
                            setShowCustomProviderForm(false)
                            setCustomProviderId('')
                            setCustomDisplayName('')
                            setCustomBaseUrl('')
                            setCustomModels('')
                            setNewApiKey('')
                          }}
                          style={{
                            padding: '8px 16px',
                            background: colors.bgSecondary,
                            border: `1px solid ${colors.border}`,
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            color: colors.text
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleAddCustomProvider}
                          disabled={isAddingKey || !customProviderId.trim() || !customDisplayName.trim() || !customBaseUrl.trim() || !newApiKey.trim()}
                          style={{
                            padding: '8px 16px',
                            background: colors.primary,
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            color: 'white',
                            fontWeight: 500,
                            opacity: isAddingKey || !customProviderId.trim() || !customDisplayName.trim() || !customBaseUrl.trim() || !newApiKey.trim() ? 0.5 : 1
                          }}
                        >
                          {isAddingKey ? 'Adding...' : 'Add Custom Provider'}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {activeTab === 'usage' && (
            <>
              {/* Usage Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '24px' }}>
                <div style={{
                  padding: '16px',
                  background: colors.bgSecondary,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '8px'
                }}>
                  <div style={{ fontSize: '12px', color: colors.textSecondary, marginBottom: '4px' }}>This Session</div>
                  <div style={{ fontSize: '20px', fontWeight: 600, color: colors.text }}>{formatCost(sessionStats.totalCost)}</div>
                  <div style={{ fontSize: '11px', color: colors.textMuted }}>{formatTokens(sessionStats.totalTokens)} tokens</div>
                </div>
                <div style={{
                  padding: '16px',
                  background: colors.bgSecondary,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '8px'
                }}>
                  <div style={{ fontSize: '12px', color: colors.textSecondary, marginBottom: '4px' }}>Today</div>
                  <div style={{ fontSize: '20px', fontWeight: 600, color: colors.text }}>{formatCost(todayStats.totalCost)}</div>
                  <div style={{ fontSize: '11px', color: colors.textMuted }}>{formatTokens(todayStats.totalTokens)} tokens</div>
                </div>
                <div style={{
                  padding: '16px',
                  background: colors.bgSecondary,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '8px'
                }}>
                  <div style={{ fontSize: '12px', color: colors.textSecondary, marginBottom: '4px' }}>All Time</div>
                  <div style={{ fontSize: '20px', fontWeight: 600, color: colors.text }}>{formatCost(stats.totalCost)}</div>
                  <div style={{ fontSize: '11px', color: colors.textMuted }}>{formatTokens(stats.totalTokens)} tokens</div>
                </div>
              </div>

              {/* Usage by Type */}
              <div style={{
                padding: '16px',
                background: colors.bgSecondary,
                border: `1px solid ${colors.border}`,
                borderRadius: '8px',
                marginBottom: '16px'
              }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: colors.text, marginBottom: '12px' }}>Usage by Type</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {Object.entries(stats.byType).map(([type, data]) => (
                    <div key={type} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', color: colors.text, textTransform: 'capitalize', minWidth: '80px' }}>{type}</span>
                        <span style={{ fontSize: '11px', color: colors.textMuted }}>{data.count} {data.count === 1 ? 'call' : 'calls'}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '11px', color: colors.textMuted }}>{formatTokens(data.tokens)}</span>
                        <span style={{ fontSize: '12px', fontWeight: 500, color: colors.text, minWidth: '60px', textAlign: 'right' }}>{formatCost(data.cost)}</span>
                      </div>
                    </div>
                  ))}
                  {Object.keys(stats.byType).length === 0 && (
                    <div style={{ fontSize: '13px', color: colors.textMuted, textAlign: 'center', padding: '8px' }}>No usage data yet</div>
                  )}
                </div>
              </div>

              {/* Usage by Model */}
              <div style={{
                padding: '16px',
                background: colors.bgSecondary,
                border: `1px solid ${colors.border}`,
                borderRadius: '8px',
                marginBottom: '16px'
              }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: colors.text, marginBottom: '12px' }}>Usage by Model</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {Object.entries(stats.byModel).map(([model, data]) => (
                    <div key={model} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', color: colors.text, minWidth: '120px' }}>{model}</span>
                        <span style={{ fontSize: '11px', color: colors.textMuted }}>{data.count} {data.count === 1 ? 'call' : 'calls'}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '11px', color: colors.textMuted }}>{formatTokens(data.tokens)}</span>
                        <span style={{ fontSize: '12px', fontWeight: 500, color: colors.text, minWidth: '60px', textAlign: 'right' }}>{formatCost(data.cost)}</span>
                      </div>
                    </div>
                  ))}
                  {Object.keys(stats.byModel).length === 0 && (
                    <div style={{ fontSize: '13px', color: colors.textMuted, textAlign: 'center', padding: '8px' }}>No usage data yet</div>
                  )}
                </div>
              </div>

              {/* Recent Activity */}
              <div style={{
                padding: '16px',
                background: colors.bgSecondary,
                border: `1px solid ${colors.border}`,
                borderRadius: '8px',
                marginBottom: '16px'
              }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: colors.text, marginBottom: '12px' }}>Recent Activity</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                  {events.slice(-10).reverse().map((event) => (
                    <div key={event.id} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px',
                      background: colors.bg,
                      borderRadius: '6px'
                    }}>
                      <div>
                        <div style={{ fontSize: '12px', color: colors.text, textTransform: 'capitalize' }}>{event.type} - {event.model}</div>
                        <div style={{ fontSize: '11px', color: colors.textMuted }}>{new Date(event.timestamp).toLocaleTimeString()}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '12px', fontWeight: 500, color: colors.text }}>{formatCost(event.cost)}</div>
                        <div style={{ fontSize: '11px', color: colors.textMuted }}>{formatTokens(event.inputTokens + event.outputTokens)}</div>
                      </div>
                    </div>
                  ))}
                  {events.length === 0 && (
                    <div style={{ fontSize: '13px', color: colors.textMuted, textAlign: 'center', padding: '16px' }}>
                      No activity yet. Usage will appear here after your first LLM call.
                    </div>
                  )}
                </div>
              </div>

              {/* Clear Usage Button */}
              {events.length > 0 && (
                <button
                  onClick={handleClearUsage}
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: colors.errorBg,
                    border: `1px solid ${colors.errorBorder}`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: colors.error,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.opacity = '0.8')}
                  onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
                >
                  <Trash2 size={14} />
                  Clear Usage History
                </button>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            padding: '16px 24px',
            borderTop: `1px solid ${colors.border}`
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              background: colors.primary,
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              color: 'white',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = colors.primaryHover)}
            onMouseOut={(e) => (e.currentTarget.style.background = colors.primary)}
          >
            Done
          </button>
        </div>
      </div>
      <ConfirmDialogComponent />
    </div>
  )
}

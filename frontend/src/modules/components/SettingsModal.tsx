import { useState, useEffect, useCallback } from 'react'
import { X, Keyboard, User, Key, BarChart3, Trash2, Plus, Eye, EyeOff, Check, AlertCircle, ExternalLink, ChevronDown, Star, Database, Globe, Code, Layout, Shield, Package, Loader, RefreshCw, Clock, Wifi, Server } from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'
import { OrganizationSwitcher } from '@clerk/clerk-react'
import { useAuthenticatedUser } from '../auth/ClerkWrapper'
import HotkeySettings from './HotkeySettings'
import { isElectron } from '../auth/ClerkWrapper'
import { WebhookSettings } from './settings/WebhookSettings'
import { ServiceSettings } from './settings/ServiceSettings'
import { ScheduleSettings } from './settings/ScheduleSettings'
import {
  getLLMProviders,
  setLlmApiKey as setLlmApiKeyRemote,
  removeLlmApiKey as removeLlmApiKeyRemote,
  setDefaultProvider as setDefaultProviderRemote,
  LLMProvidersResponse,
  ProviderInfo,
  CustomProviderConfig
} from '../services/aiApi'
import { configService } from '../services/configService'
import { usePrompdUsage, formatCost, formatTokens } from '@prompd/react'
import type { NamespaceInfo } from '../services/namespacesApi'
import { useConfirmDialog } from './ConfirmDialog'

// Local-first API key management
// In Electron: Save to ~/.prompd/config.yaml (local-first)
// In Web: Save to backend (remote storage)
async function setLlmApiKey(
  provider: string,
  apiKey: string,
  customConfig?: CustomProviderConfig
): Promise<{ message: string; hasKey: boolean; isCustom: boolean; unlockedFeatures: string[] }> {
  if (isElectron && configService.hasNativeConfig()) {
    // Local-first: Save to ~/.prompd/config.yaml
    const success = await configService.setApiKey(provider, apiKey)
    if (!success) {
      throw new Error('Failed to save API key to local config')
    }

    // If custom provider, also save the custom config
    if (customConfig) {
      const config = await configService.getConfig()
      config.custom_providers = config.custom_providers || {}
      config.custom_providers[provider] = {
        base_url: customConfig.baseUrl || '',
        models: customConfig.models || [],
        enabled: true
      }
      await configService.saveConfig(config)
    }

    return {
      message: `${provider} API key saved locally`,
      hasKey: true,
      isCustom: !!customConfig,
      unlockedFeatures: ['unlimited-generations', 'local-execution']
    }
  }

  // Web mode: Use backend API
  return setLlmApiKeyRemote(provider, apiKey, customConfig)
}

async function removeLlmApiKey(provider: string): Promise<{ message: string; note: string }> {
  if (isElectron && configService.hasNativeConfig()) {
    // Local-first: Remove from ~/.prompd/config.yaml
    const config = await configService.getConfig()
    if (config.api_keys) {
      delete config.api_keys[provider.toLowerCase()]
    }
    if (config.custom_providers) {
      delete config.custom_providers[provider]
    }
    const success = await configService.saveConfig(config)
    if (!success) {
      throw new Error('Failed to remove API key from local config')
    }
    return {
      message: `${provider} API key removed`,
      note: 'Key removed from local config'
    }
  }

  // Web mode: Use backend API
  return removeLlmApiKeyRemote(provider)
}

async function setDefaultProvider(provider: string): Promise<void> {
  if (isElectron && configService.hasNativeConfig()) {
    // Local-first: Save to ~/.prompd/config.yaml
    await configService.setDefaultProvider(provider)
    return
  }

  // Web mode: Use backend API (discard return value)
  await setDefaultProviderRemote(provider)
}

// Helper to refocus window after native dialogs (fixes Electron input focus bug)
function refocusWindow() {
  const electronAPI = (window as any).electronAPI
  if (electronAPI?.focusWindow) {
    setTimeout(() => electronAPI.focusWindow(), 50)
  }
}

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  theme: 'light' | 'dark'
  onProvidersChanged?: () => void
  initialTab?: TabType
}

type TabType = 'profile' | 'api-keys' | 'registries' | 'usage' | 'shortcuts' | 'schedules' | 'webhooks' | 'service'

// Default View Mode Button Component
function DefaultViewModeButton({
  mode,
  label,
  icon,
  colors
}: {
  mode: 'design' | 'code'
  label: string
  icon: React.ReactNode
  colors: Record<string, string>
}) {
  const defaultViewMode = useUIStore(state => state.defaultViewMode)
  const setDefaultViewMode = useUIStore(state => state.setDefaultViewMode)
  const setMode = useUIStore(state => state.setMode)
  const isSelected = defaultViewMode === mode

  return (
    <button
      onClick={() => {
        setDefaultViewMode(mode)
        // Also update current mode immediately
        setMode(mode)
      }}
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: '10px 16px',
        background: isSelected ? colors.primary : colors.bg,
        border: `1px solid ${isSelected ? colors.primary : colors.border}`,
        borderRadius: '6px',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: 500,
        color: isSelected ? 'white' : colors.text,
        transition: 'all 0.2s ease'
      }}
      onMouseOver={(e) => {
        if (!isSelected) {
          e.currentTarget.style.borderColor = colors.primary
        }
      }}
      onMouseOut={(e) => {
        if (!isSelected) {
          e.currentTarget.style.borderColor = colors.border
        }
      }}
    >
      {icon}
      {label}
    </button>
  )
}

// Auto-Save Toggle Component
function AutoSaveToggle({ colors }: { colors: Record<string, string> }) {
  const autoSaveEnabled = useUIStore(state => state.autoSaveEnabled)
  const setAutoSaveEnabled = useUIStore(state => state.setAutoSaveEnabled)

  return (
    <div
      style={{
        padding: '16px',
        background: colors.bgSecondary,
        borderRadius: '8px',
        border: `1px solid ${colors.border}`
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 500, color: colors.text, marginBottom: '4px' }}>
            Auto-Save
          </div>
          <div style={{ fontSize: '13px', color: colors.textSecondary }}>
            Automatically save files before running prompts or approving tool calls
          </div>
        </div>
        <button
          onClick={() => setAutoSaveEnabled(!autoSaveEnabled)}
          style={{
            width: '48px',
            height: '26px',
            borderRadius: '13px',
            border: 'none',
            background: autoSaveEnabled ? colors.success : colors.bgTertiary,
            cursor: 'pointer',
            position: 'relative',
            transition: 'all 0.2s ease'
          }}
        >
          <div
            style={{
              width: '22px',
              height: '22px',
              borderRadius: '11px',
              background: 'white',
              position: 'absolute',
              top: '2px',
              left: autoSaveEnabled ? '24px' : '2px',
              transition: 'all 0.2s ease',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
            }}
          />
        </button>
      </div>
    </div>
  )
}

export function SettingsModal({ isOpen, onClose, theme, onProvidersChanged, initialTab = 'profile' }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab)
  const { getToken } = useAuthenticatedUser()

  // Use custom confirm dialog instead of native confirm()
  const { showConfirm, ConfirmDialogComponent } = useConfirmDialog(theme)

  // API Keys state
  const [providersData, setProvidersData] = useState<LLMProvidersResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Usage tracking
  const { events, stats, clearUsage, getSessionStats, getTodayStats } = usePrompdUsage()

  // Add key state
  const [showAddKeyFor, setShowAddKeyFor] = useState<string | null>(null)
  const [newApiKey, setNewApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [isAddingKey, setIsAddingKey] = useState(false)

  // Add provider state
  const [showAddProviderForm, setShowAddProviderForm] = useState(false)
  const [addProviderMode, setAddProviderMode] = useState<'select' | 'known' | 'custom'>('select')
  const [selectedKnownProvider, setSelectedKnownProvider] = useState<string | null>(null)

  // Disabled providers state (for enable/disable toggle)
  const [disabledProviders, setDisabledProviders] = useState<string[]>([])

  // Custom provider state
  const [customProviderId, setCustomProviderId] = useState('')
  const [customDisplayName, setCustomDisplayName] = useState('')
  const [customBaseUrl, setCustomBaseUrl] = useState('')
  const [customModels, setCustomModels] = useState('')

  // Registries state
  interface RegistryEntry {
    name: string
    url: string
    username?: string
    apiKey?: string  // Registry API key from config.yaml for authentication
    isDefault: boolean
  }
  const [registries, setRegistries] = useState<RegistryEntry[]>([])
  const [currentNamespace, setCurrentNamespace] = useState('')
  const [showAddRegistry, setShowAddRegistry] = useState(false)
  const [newRegistryName, setNewRegistryName] = useState('')
  const [newRegistryUrl, setNewRegistryUrl] = useState('')
  const [registriesLoading, setRegistriesLoading] = useState(false)
  const [registryError, setRegistryError] = useState<string | null>(null)
  const [registrySuccess, setRegistrySuccess] = useState<string | null>(null)

  // Namespace management state (per-registry)
  const [expandedRegistry, setExpandedRegistry] = useState<string | null>(null)
  const [registryNamespaces, setRegistryNamespaces] = useState<Record<string, NamespaceInfo[]>>({})
  const [namespacesLoading, setNamespacesLoading] = useState<Record<string, boolean>>({})
  const [namespacesError, setNamespacesError] = useState<Record<string, string>>({})
  const [showCreateNamespace, setShowCreateNamespace] = useState<string | null>(null)
  const [newNamespaceName, setNewNamespaceName] = useState('')
  const [newNamespaceDescription, setNewNamespaceDescription] = useState('')
  const [newNamespaceVisibility, setNewNamespaceVisibility] = useState<'public' | 'private'>('public')
  const [creatingNamespace, setCreatingNamespace] = useState(false)

  // Storage & sync state
  const [syncEnabled, setSyncEnabled] = useState<boolean>(() => {
    return localStorage.getItem('prompd.syncEnabled') === 'true' // Default false
  })

  // Load registries from config.yaml
  const loadRegistries = async () => {
    if (!isElectron || !configService.hasNativeConfig()) {
      return
    }

    setRegistriesLoading(true)
    setRegistryError(null)
    try {
      const config = await configService.getConfig()
      const registryConfig = config.registry || {}
      const defaultRegistry = registryConfig.default || 'prompdhub'
      const configuredRegistries = registryConfig.registries || {}

      // Build registry list from config
      const registryList: RegistryEntry[] = []

      // Always include prompdhub as the default option
      if (!configuredRegistries['prompdhub']) {
        registryList.push({
          name: 'prompdhub',
          url: 'https://registry.prompdhub.ai',
          isDefault: defaultRegistry === 'prompdhub'
        })
      }

      // Add configured registries
      for (const [name, regConfig] of Object.entries(configuredRegistries)) {
        const typedConfig = regConfig as { url?: string; api_key?: string; username?: string }
        registryList.push({
          name,
          url: typedConfig.url || '',
          username: typedConfig.username,
          apiKey: typedConfig.api_key,  // Include registry API key for authentication
          isDefault: defaultRegistry === name
        })
      }

      setRegistries(registryList)
      setCurrentNamespace(registryConfig.current_namespace || '')
    } catch (err) {
      console.error('[SettingsModal] Failed to load registries:', err)
      setRegistryError('Failed to load registries from config')
    } finally {
      setRegistriesLoading(false)
    }
  }

  // Load namespaces for a specific registry
  const loadNamespacesForRegistry = useCallback(async (registryName: string, registryUrl: string, registryApiKey?: string) => {
    setNamespacesLoading(prev => ({ ...prev, [registryName]: true }))
    setNamespacesError(prev => ({ ...prev, [registryName]: '' }))
    try {
      const namespacesUrl = new URL('/user/namespaces', registryUrl).toString()

      // Priority: Registry API key from config.yaml > Clerk user token
      // Registry API key is stored in ~/.prompd/config.yaml and is the preferred auth method
      let authToken = registryApiKey
      if (!authToken) {
        // Fallback to Clerk token for backward compatibility
        authToken = await getToken() || undefined
      }

      const response = await fetch(namespacesUrl, {
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        }
      })

      if (response.ok) {
        const namespaces = await response.json()
        setRegistryNamespaces(prev => ({
          ...prev,
          [registryName]: Array.isArray(namespaces) ? namespaces : []
        }))
        setNamespacesError(prev => ({ ...prev, [registryName]: '' }))
      } else if (response.status === 401) {
        // Not authenticated - show empty with login prompt
        setRegistryNamespaces(prev => ({ ...prev, [registryName]: [] }))
        setNamespacesError(prev => ({ ...prev, [registryName]: 'Sign in to view your namespaces' }))
      } else {
        console.warn(`[SettingsModal] Failed to load namespaces for ${registryName}:`, response.status)
        setRegistryNamespaces(prev => ({ ...prev, [registryName]: [] }))
        setNamespacesError(prev => ({ ...prev, [registryName]: `Failed to load namespaces (${response.status})` }))
      }
    } catch (err) {
      console.error(`[SettingsModal] Error loading namespaces for ${registryName}:`, err)
      setRegistryNamespaces(prev => ({ ...prev, [registryName]: [] }))
      // Check if it's a CORS/network error
      const errorMsg = err instanceof TypeError && err.message.includes('fetch')
        ? 'Unable to connect to registry. The registry may not support desktop app connections.'
        : 'Failed to load namespaces'
      setNamespacesError(prev => ({ ...prev, [registryName]: errorMsg }))
    } finally {
      setNamespacesLoading(prev => ({ ...prev, [registryName]: false }))
    }
  }, [getToken])

  // Create a new namespace
  const handleCreateNamespace = async (registryName: string, registryUrl: string, registryApiKey?: string) => {
    if (!newNamespaceName.trim()) {
      setRegistryError('Namespace name is required')
      return
    }

    setCreatingNamespace(true)
    setRegistryError(null)

    try {
      const createUrl = new URL('/namespaces', registryUrl).toString()

      // Priority: Registry API key from config.yaml > Clerk user token
      let authToken = registryApiKey
      if (!authToken) {
        authToken = await getToken() || undefined
      }

      const response = await fetch(createUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({
          name: newNamespaceName.startsWith('@') ? newNamespaceName : `@${newNamespaceName}`,
          description: newNamespaceDescription || undefined,
          visibility: newNamespaceVisibility,
          type: 'personal'
        })
      })

      if (response.ok) {
        const result = await response.json()
        setRegistrySuccess(`Namespace ${result.namespace?.name || newNamespaceName} created successfully`)
        setShowCreateNamespace(null)
        setNewNamespaceName('')
        setNewNamespaceDescription('')
        setNewNamespaceVisibility('public')
        // Reload namespaces with the same API key
        await loadNamespacesForRegistry(registryName, registryUrl, registryApiKey)
      } else {
        const error = await response.json().catch(() => ({ message: 'Failed to create namespace' }))
        setRegistryError(error.message || error.reason || 'Failed to create namespace')
      }
    } catch (err) {
      console.error('[SettingsModal] Error creating namespace:', err)
      setRegistryError(err instanceof Error ? err.message : 'Failed to create namespace')
    } finally {
      setCreatingNamespace(false)
    }
  }

  // Toggle registry expansion and load namespaces
  const handleToggleRegistry = (registryName: string, registryUrl: string, registryApiKey?: string) => {
    if (expandedRegistry === registryName) {
      setExpandedRegistry(null)
    } else {
      setExpandedRegistry(registryName)
      // Load namespaces if not already loaded
      if (!registryNamespaces[registryName]) {
        loadNamespacesForRegistry(registryName, registryUrl, registryApiKey)
      }
    }
  }

  // Reset to initial tab when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab)
      loadProviders()
      loadRegistries()
    }
  }, [isOpen, initialTab])

  const loadProviders = async () => {
    setLoading(true)
    setError(null)
    try {
      // In Electron with local config, load from config.yaml
      if (isElectron && configService.hasNativeConfig()) {
        // Clear config cache to ensure fresh data (both renderer and main process)
        await configService.clearCache()
        const config = await configService.getConfig()
        const apiKeysRaw = config.api_keys || {}
        const defaultProvider = config.default_provider || null
        const customProviders = config.custom_providers || {}
        const disabledProvidersFromConfig = config.disabled_providers || []

        console.log('[SettingsModal] Raw config api_keys:', apiKeysRaw)
        console.log('[SettingsModal] api_keys keys:', Object.keys(apiKeysRaw))

        // Normalize api_keys to lowercase for case-insensitive lookup
        // YAML may have keys like "Google" instead of "google"
        const apiKeys: Record<string, string> = {}
        for (const [key, value] of Object.entries(apiKeysRaw)) {
          apiKeys[key.toLowerCase()] = value as string
        }
        console.log('[SettingsModal] Normalized api_keys:', Object.keys(apiKeys))

        // Load disabled providers into state
        setDisabledProviders(disabledProvidersFromConfig)

        // Build providers map from local config + known providers
        const providers: Record<string, ProviderInfo> = {}
        let totalConfigured = 0

        // Add known providers with their local key status
        const knownProviderIds = ['openai', 'anthropic', 'google', 'groq', 'mistral', 'cohere', 'together', 'perplexity', 'deepseek', 'ollama']
        const knownDisplayNames: Record<string, string> = {
          openai: 'OpenAI',
          anthropic: 'Anthropic',
          google: 'Google Gemini',
          groq: 'Groq',
          mistral: 'Mistral AI',
          cohere: 'Cohere',
          together: 'Together AI',
          perplexity: 'Perplexity',
          deepseek: 'DeepSeek',
          ollama: 'Ollama (Local)'
        }
        const keyPrefixes: Record<string, string> = {
          openai: 'sk-',
          anthropic: 'sk-ant-',
          google: 'AIza',
          groq: 'gsk_'
        }
        const consoleUrls: Record<string, string> = {
          openai: 'https://platform.openai.com/api-keys',
          anthropic: 'https://console.anthropic.com/settings/keys',
          google: 'https://aistudio.google.com/app/apikey',
          groq: 'https://console.groq.com/keys',
          mistral: 'https://console.mistral.ai/api-keys',
          cohere: 'https://dashboard.cohere.com/api-keys',
          together: 'https://api.together.xyz/settings/api-keys',
          perplexity: 'https://www.perplexity.ai/settings/api',
          deepseek: 'https://platform.deepseek.com/api_keys'
        }

        for (const providerId of knownProviderIds) {
          const hasKey = !!apiKeys[providerId] || providerId === 'ollama'
          if (hasKey) totalConfigured++

          providers[providerId] = {
            providerId,
            displayName: knownDisplayNames[providerId] || providerId,
            hasKey,
            isCustom: false,
            isLocal: providerId === 'ollama',
            keyPrefix: keyPrefixes[providerId],
            consoleUrl: consoleUrls[providerId]
          }
        }

        // Add custom providers from config
        for (const [providerId, customConfig] of Object.entries(customProviders)) {
          const typed = customConfig as { display_name?: string; base_url?: string; models?: string[]; enabled?: boolean }
          // Use lowercase for API key lookup (keys are normalized above)
          const hasKey = !!apiKeys[providerId.toLowerCase()]
          if (hasKey) totalConfigured++

          providers[providerId] = {
            providerId,
            displayName: typed.display_name || providerId,
            hasKey,
            isCustom: true,
            baseUrl: typed.base_url,
            models: typed.models
          }
        }

        setProvidersData({
          providers,
          defaultProvider,
          totalConfigured
        })
      } else {
        // Web mode: Load from backend
        const result = await getLLMProviders()
        setProvidersData(result)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load providers')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  // Theme-aware colors
  const colors = {
    bg: theme === 'dark' ? '#1e293b' : '#ffffff',
    bgPrimary: theme === 'dark' ? '#1e293b' : '#ffffff',
    bgSecondary: theme === 'dark' ? '#0f172a' : '#f8fafc',
    bgTertiary: theme === 'dark' ? '#334155' : '#e2e8f0',
    border: theme === 'dark' ? 'rgba(71, 85, 105, 0.3)' : '#e2e8f0',
    text: theme === 'dark' ? '#ffffff' : '#0f172a',
    textSecondary: theme === 'dark' ? '#94a3b8' : '#64748b',
    textMuted: theme === 'dark' ? '#64748b' : '#94a3b8',
    input: theme === 'dark' ? 'rgba(15, 23, 42, 0.6)' : '#f8fafc',
    hover: theme === 'dark' ? 'rgba(71, 85, 105, 0.3)' : 'rgba(148, 163, 184, 0.15)',
    primary: '#3b82f6',
    primaryHover: '#2563eb',
    success: '#10b981',
    successHover: '#059669',
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

  // API Keys handlers
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
      setShowAddProviderForm(false)
      setAddProviderMode('select')
      setSelectedKnownProvider(null)
      setCustomProviderId('')
      setCustomDisplayName('')
      setCustomBaseUrl('')
      setCustomModels('')
      await loadProviders()
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
    if (!confirmed) return

    setError(null)
    setSuccess(null)

    try {
      await removeLlmApiKey(providerId)
      setSuccess(`${displayName} API key removed`)
      await loadProviders()
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

  const handleToggleProvider = async (providerId: string) => {
    if (!isElectron || !configService.hasNativeConfig()) {
      return // Only works in Electron mode with local config
    }

    try {
      const config = await configService.getConfig()
      const currentDisabled = config.disabled_providers || []

      // Toggle the provider in the disabled list
      const newDisabled = currentDisabled.includes(providerId)
        ? currentDisabled.filter((p: string) => p !== providerId)
        : [...currentDisabled, providerId]

      config.disabled_providers = newDisabled
      await configService.saveConfig(config)

      // Update local state
      setDisabledProviders(newDisabled)

      // Trigger providers changed callback
      onProvidersChanged?.()

      const action = newDisabled.includes(providerId) ? 'disabled' : 'enabled'
      setSuccess(`${providersData?.providers[providerId]?.displayName || providerId} ${action}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle provider')
    }
  }

  const handleClearUsage = async () => {
    const confirmed = await showConfirm({
      title: 'Clear Usage History',
      message: 'Clear all usage history? This cannot be undone.',
      confirmLabel: 'Clear History',
      cancelLabel: 'Cancel',
      confirmVariant: 'danger'
    })
    if (confirmed) {
      clearUsage()
    }
  }

  const sessionStats = getSessionStats()
  const todayStats = getTodayStats()

  // Get all providers as sorted array
  const allProvidersList: ProviderInfo[] = providersData?.providers
    ? Object.values(providersData.providers).sort((a, b) => {
        if (a.hasKey && !b.hasKey) return -1
        if (!a.hasKey && b.hasKey) return 1
        return a.displayName.localeCompare(b.displayName)
      })
    : []

  const providersList = allProvidersList.filter(p => p.hasKey)

  // Render provider card
  const renderProviderCard = (provider: ProviderInfo) => {
    const isDefault = providersData?.defaultProvider === provider.providerId
    const isDisabled = disabledProviders.includes(provider.providerId)

    return (
      <div
        key={provider.providerId}
        style={{
          padding: '16px',
          background: colors.bgSecondary,
          border: `1px solid ${isDefault ? colors.primary : colors.border}`,
          borderRadius: '8px',
          marginBottom: '12px',
          transition: 'all 0.2s ease',
          opacity: isDisabled ? 0.6 : 1
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
                {isDisabled && (
                  <span style={{ fontSize: '10px', padding: '2px 6px', background: colors.errorBg, border: `1px solid ${colors.errorBorder}`, borderRadius: '4px', color: colors.textMuted }}>
                    Disabled
                  </span>
                )}
              </div>
              <div style={{ fontSize: '13px', color: colors.textSecondary }}>
                {provider.hasKey ? (
                  <span style={{ color: isDisabled ? colors.textMuted : colors.success }}>
                    API key configured{isDisabled ? ' (disabled)' : ''}
                  </span>
                ) : (
                  'No API key configured'
                )}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {/* Enable/Disable Toggle - Only show in Electron mode with API key */}
            {isElectron && provider.hasKey && (
              <button
                onClick={() => handleToggleProvider(provider.providerId)}
                title={isDisabled ? 'Enable provider' : 'Disable provider'}
                style={{
                  width: '48px',
                  height: '26px',
                  borderRadius: '13px',
                  border: 'none',
                  background: isDisabled ? colors.bgTertiary : colors.success,
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'all 0.2s ease'
                }}
              >
                <div
                  style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '11px',
                    background: 'white',
                    position: 'absolute',
                    top: '2px',
                    left: isDisabled ? '2px' : '24px',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                  }}
                />
              </button>
            )}
            {provider.hasKey && !isDefault && (
              <button
                onClick={() => handleSetDefault(provider.providerId)}
                title="Set as default"
                disabled={isDisabled}
                style={{
                  padding: '8px 12px',
                  background: 'transparent',
                  border: `1px solid ${colors.border}`,
                  borderRadius: '6px',
                  cursor: isDisabled ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  color: colors.textSecondary,
                  transition: 'all 0.2s ease',
                  opacity: isDisabled ? 0.5 : 1
                }}
                onMouseOver={(e) => !isDisabled && (e.currentTarget.style.borderColor = colors.warning)}
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

  const sidebarItems: Array<{
    id: TabType
    label: string
    icon: React.ReactNode
    children?: Array<{ id: TabType; label: string; icon: React.ReactNode }>
  }> = [
    { id: 'profile', label: 'Profile', icon: <User size={16} /> },
    { id: 'api-keys', label: 'API Keys', icon: <Key size={16} /> },
    { id: 'registries', label: 'Registries', icon: <Database size={16} /> },
    { id: 'usage', label: 'Usage', icon: <BarChart3 size={16} /> },
    { id: 'shortcuts', label: 'Shortcuts', icon: <Keyboard size={16} /> },
    {
      id: 'schedules',
      label: 'Scheduler',
      icon: <Clock size={16} />,
      children: [
        { id: 'schedules', label: 'Schedules', icon: <Clock size={14} /> },
        { id: 'webhooks', label: 'Webhooks', icon: <Wifi size={14} /> },
        { id: 'service', label: 'Service', icon: <Server size={14} /> }
      ]
    }
  ]

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.6)',
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
          maxWidth: '1000px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: theme === 'dark' ? '0 20px 60px rgba(0, 0, 0, 0.6)' : '0 20px 60px rgba(0, 0, 0, 0.15)',
          transition: 'all 0.2s ease'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: `1px solid ${colors.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: colors.text }}>
            Settings
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: colors.textSecondary,
              cursor: 'pointer',
              padding: '8px',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '6px',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = colors.hover
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Sidebar + Content Layout */}
        <div
          style={{
            display: 'flex',
            flex: 1,
            overflow: 'hidden'
          }}
        >
          {/* Sidebar Navigation */}
          <div
            style={{
              width: '220px',
              borderRight: `1px solid ${colors.border}`,
              background: colors.bgSecondary,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'auto'
            }}
          >
            <div style={{ padding: '12px' }}>
              {sidebarItems.map(item => (
                <div key={item.id}>
                  <button
                    onClick={() => setActiveTab(item.id)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 12px',
                      fontSize: '13px',
                      fontWeight: 500,
                      border: 'none',
                      borderRadius: '6px',
                      background: activeTab === item.id && !item.children ? colors.primary : 'transparent',
                      color: activeTab === item.id && !item.children ? 'white' : colors.text,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      textAlign: 'left',
                      marginBottom: '2px'
                    }}
                    onMouseEnter={(e) => {
                      if (activeTab !== item.id || item.children) {
                        e.currentTarget.style.background = colors.hover
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (activeTab !== item.id || item.children) {
                        e.currentTarget.style.background = 'transparent'
                      } else if (!item.children) {
                        e.currentTarget.style.background = colors.primary
                      }
                    }}
                  >
                    {item.icon}
                    {item.label}
                  </button>

                  {/* Sub-items for hierarchical navigation */}
                  {item.children && (
                    <div style={{ paddingLeft: '24px', marginTop: '4px', marginBottom: '8px' }}>
                      {item.children.map(child => (
                        <button
                          key={child.id}
                          onClick={() => setActiveTab(child.id)}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 10px',
                            fontSize: '12px',
                            fontWeight: 500,
                            border: 'none',
                            borderRadius: '5px',
                            background: activeTab === child.id ? colors.primary : 'transparent',
                            color: activeTab === child.id ? 'white' : colors.textSecondary,
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                            textAlign: 'left',
                            marginBottom: '2px'
                          }}
                          onMouseEnter={(e) => {
                            if (activeTab !== child.id) {
                              e.currentTarget.style.background = colors.hover
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (activeTab !== child.id) {
                              e.currentTarget.style.background = 'transparent'
                            } else {
                              e.currentTarget.style.background = colors.primary
                            }
                          }}
                        >
                          {child.icon}
                          {child.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Content Area */}
          <div
            style={{
              flex: 1,
              overflow: 'auto',
              padding: '24px'
            }}
          >
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div>
              {/* Organization Switcher Section - Only available in web mode */}
              {!isElectron && (
                <div style={{ marginBottom: '32px' }}>
                  <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '16px', fontWeight: 600, color: colors.text }}>
                    Organization
                  </h3>
                  <p style={{ marginBottom: '16px', color: colors.textSecondary, fontSize: '14px' }}>
                    Manage your organization membership and switch between different organizations.
                  </p>
                  <div
                    style={{
                      padding: '20px',
                      background: colors.bgSecondary,
                      borderRadius: '8px',
                      border: `1px solid ${colors.border}`
                    }}
                  >
                    <OrganizationSwitcher
                      appearance={{
                        variables: {
                          colorPrimary: '#3b82f6',
                          colorText: colors.text,
                          colorTextSecondary: colors.textSecondary,
                          colorBackground: colors.bg,
                          colorInputBackground: colors.input,
                          colorInputText: colors.text,
                          borderRadius: '0.5rem',
                          fontFamily: 'Inter, system-ui, Arial'
                        },
                        elements: {
                          rootBox: {
                            width: '100%'
                          }
                        }
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Editor Preferences - Default View Mode */}
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '16px', fontWeight: 600, color: colors.text }}>
                  Editor Preferences
                </h3>
                <p style={{ marginBottom: '16px', color: colors.textSecondary, fontSize: '14px' }}>
                  Configure your default editor behavior for .prmd files.
                </p>

                <div
                  style={{
                    padding: '16px',
                    background: colors.bgSecondary,
                    borderRadius: '8px',
                    border: `1px solid ${colors.border}`
                  }}
                >
                  <div style={{ fontWeight: 500, color: colors.text, marginBottom: '12px' }}>
                    Default View Mode
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <DefaultViewModeButton
                      mode="design"
                      label="Design"
                      icon={<Layout size={16} />}
                      colors={colors}
                    />
                    <DefaultViewModeButton
                      mode="code"
                      label="Code"
                      icon={<Code size={16} />}
                      colors={colors}
                    />
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '12px', color: colors.textMuted }}>
                    New .prmd files will open in this view by default.
                  </div>
                </div>
              </div>

              {/* Storage & Execution Mode Section - Only show in Electron */}
              {isElectron && (
                <div style={{ marginBottom: '32px' }}>
                  <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '16px', fontWeight: 600, color: colors.text }}>
                    Storage & Sync
                  </h3>
                  <p style={{ marginBottom: '16px', color: colors.textSecondary, fontSize: '14px' }}>
                    Configure how data is stored and synced.
                  </p>

                  {/* Backend Sync Toggle */}
                  <div
                    style={{
                      padding: '16px',
                      background: colors.bgSecondary,
                      borderRadius: '8px',
                      border: `1px solid ${colors.border}`
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontWeight: 500, color: colors.text, marginBottom: '4px' }}>
                          Sync with Backend
                        </div>
                        <div style={{ fontSize: '13px', color: colors.textSecondary }}>
                          Sync usage stats and preferences with your account
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          const newValue = !syncEnabled
                          setSyncEnabled(newValue)
                          localStorage.setItem('prompd.syncEnabled', String(newValue))
                        }}
                        style={{
                          width: '48px',
                          height: '26px',
                          borderRadius: '13px',
                          border: 'none',
                          background: syncEnabled ? colors.success : colors.bgTertiary,
                          cursor: 'pointer',
                          position: 'relative',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div
                          style={{
                            width: '22px',
                            height: '22px',
                            borderRadius: '11px',
                            background: 'white',
                            position: 'absolute',
                            top: '2px',
                            left: syncEnabled ? '24px' : '2px',
                            transition: 'all 0.2s ease',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                          }}
                        />
                      </button>
                    </div>
                    {!syncEnabled && (
                      <div
                        style={{
                          marginTop: '12px',
                          padding: '8px 12px',
                          background: colors.infoBg,
                          border: `1px solid ${colors.infoBorder}`,
                          borderRadius: '6px',
                          fontSize: '12px',
                          color: colors.textSecondary
                        }}
                      >
                        Usage data stays local. Enable to sync across devices.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Auto-Save Toggle */}
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '16px', fontWeight: 600, color: colors.text }}>
                  Auto-Save
                </h3>
                <AutoSaveToggle colors={colors} />
              </div>

              {/* Note: Registry configuration moved to dedicated Registries tab */}
            </div>
          )}

          {/* API Keys Tab */}
          {activeTab === 'api-keys' && (
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
                  {isElectron ? (
                    <>
                      Add your API keys to enable local-first execution. Keys are stored in <code style={{ background: colors.bgSecondary, padding: '2px 6px', borderRadius: '3px' }}>~/.prompd/config.yaml</code> and never leave your machine.
                    </>
                  ) : (
                    <>Add your own API keys to unlock unlimited AI generations. Keys are encrypted and stored securely on our servers.</>
                  )}
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
                </>
              )}
            </>
          )}

          {/* Registries Tab */}
          {activeTab === 'registries' && (
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
                  Configure package registries for discovering and publishing Prompd packages.
                  {isElectron && ' Settings are saved to ~/.prompd/config.yaml.'}
                </div>
              </div>

              {/* Current Namespace */}
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600, color: colors.text }}>
                  Current Namespace
                </h3>
                <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: colors.textSecondary }}>
                  Your namespace is used when publishing packages (e.g., @your-namespace/package-name).
                </p>
                <input
                  type="text"
                  value={currentNamespace}
                  onChange={(e) => setCurrentNamespace(e.target.value)}
                  placeholder="@your-namespace"
                  style={{
                    width: '100%',
                    maxWidth: '300px',
                    padding: '10px 12px',
                    fontSize: '14px',
                    border: `1px solid ${colors.border}`,
                    borderRadius: '6px',
                    background: colors.input,
                    color: colors.text,
                    fontFamily: 'monospace',
                    boxSizing: 'border-box'
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = colors.primary)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = colors.border)}
                />
              </div>

              {/* Configured Registries */}
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600, color: colors.text }}>
                  Configured Registries
                </h3>

                {registriesLoading ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: colors.textSecondary }}>
                    Loading registries...
                  </div>
                ) : registries.length === 0 ? (
                  <div style={{
                    padding: '24px',
                    textAlign: 'center',
                    background: colors.bgSecondary,
                    borderRadius: '8px',
                    border: `1px solid ${colors.border}`,
                    marginBottom: '12px'
                  }}>
                    <Globe size={32} style={{ color: colors.textMuted, marginBottom: '8px' }} />
                    <div style={{ fontSize: '14px', color: colors.textSecondary, marginBottom: '4px' }}>
                      Using default registry
                    </div>
                    <div style={{ fontSize: '13px', color: colors.textMuted }}>
                      https://registry.prompdhub.ai
                    </div>
                  </div>
                ) : (
                  registries.map((registry) => (
                    <div
                      key={registry.name}
                      style={{
                        background: colors.bgSecondary,
                        border: `1px solid ${registry.isDefault ? colors.primary : colors.border}`,
                        borderRadius: '8px',
                        marginBottom: '12px',
                        overflow: 'hidden'
                      }}
                    >
                      {/* Registry Header */}
                      <div style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '16px', fontWeight: 600, color: colors.text }}>
                                {registry.name}
                              </span>
                              {registry.isDefault && (
                                <Star size={14} style={{ color: colors.warning, fill: colors.warning }} />
                              )}
                            </div>
                            <div style={{ fontSize: '13px', color: colors.textSecondary, fontFamily: 'monospace' }}>
                              {registry.url}
                            </div>
                            {registry.username && (
                              <div style={{ fontSize: '12px', color: colors.textMuted, marginTop: '4px' }}>
                                Logged in as: {registry.username}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            {/* Namespaces Toggle */}
                            <button
                              onClick={() => handleToggleRegistry(registry.name, registry.url, registry.apiKey)}
                              style={{
                                padding: '8px 12px',
                                background: expandedRegistry === registry.name ? colors.primary : 'transparent',
                                border: `1px solid ${expandedRegistry === registry.name ? colors.primary : colors.border}`,
                                borderRadius: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '13px',
                                color: expandedRegistry === registry.name ? 'white' : colors.textSecondary,
                                transition: 'all 0.2s ease'
                              }}
                            >
                              <Package size={14} />
                              Namespaces
                              <ChevronDown
                                size={14}
                                style={{
                                  transform: expandedRegistry === registry.name ? 'rotate(180deg)' : 'rotate(0deg)',
                                  transition: 'transform 0.2s ease'
                                }}
                              />
                            </button>
                            {!registry.isDefault && (
                              <button
                                onClick={async () => {
                                  if (isElectron && configService.hasNativeConfig()) {
                                    const config = await configService.getConfig()
                                    config.registry = config.registry || { default: 'prompdhub', registries: {} }
                                    config.registry.default = registry.name
                                    await configService.saveConfig(config)
                                    setRegistries(prev => prev.map(r => ({
                                      ...r,
                                      isDefault: r.name === registry.name
                                    })))
                                    setRegistrySuccess(`${registry.name} set as default registry`)
                                  }
                                }}
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
                                  color: colors.textSecondary
                                }}
                              >
                                <Star size={14} />
                                Set Default
                              </button>
                            )}
                            {registry.name !== 'prompdhub' && (
                              <button
                                onClick={async () => {
                                  const confirmed = await showConfirm({
                                    title: 'Remove Registry',
                                    message: `Remove ${registry.name} registry? You will no longer be able to install packages from this registry.`,
                                    confirmLabel: 'Remove',
                                    cancelLabel: 'Cancel',
                                    confirmVariant: 'danger'
                                  })
                                  if (!confirmed) return

                                  if (isElectron && configService.hasNativeConfig()) {
                                    const config = await configService.getConfig()
                                    if (config.registry?.registries) {
                                      delete config.registry.registries[registry.name]
                                    }
                                    if (config.registry?.default === registry.name) {
                                      config.registry.default = 'prompdhub'
                                    }
                                    await configService.saveConfig(config)
                                    setRegistries(prev => prev.filter(r => r.name !== registry.name))
                                    setRegistrySuccess(`${registry.name} registry removed`)
                                  }
                                }}
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
                                  color: colors.error
                                }}
                              >
                                <Trash2 size={14} />
                                Remove
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expanded Namespaces Section */}
                      {expandedRegistry === registry.name && (
                        <div style={{
                          borderTop: `1px solid ${colors.border}`,
                          padding: '16px',
                          background: colors.bg
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: colors.text }}>
                              Your Namespaces
                            </h4>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={() => loadNamespacesForRegistry(registry.name, registry.url, registry.apiKey)}
                                disabled={namespacesLoading[registry.name]}
                                style={{
                                  padding: '6px 10px',
                                  background: 'transparent',
                                  border: `1px solid ${colors.border}`,
                                  borderRadius: '4px',
                                  cursor: namespacesLoading[registry.name] ? 'not-allowed' : 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '12px',
                                  color: colors.textSecondary,
                                  opacity: namespacesLoading[registry.name] ? 0.5 : 1
                                }}
                              >
                                <RefreshCw size={12} className={namespacesLoading[registry.name] ? 'animate-spin' : ''} />
                                Refresh
                              </button>
                              <button
                                onClick={() => setShowCreateNamespace(registry.name)}
                                style={{
                                  padding: '6px 10px',
                                  background: colors.primary,
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '12px',
                                  color: 'white',
                                  fontWeight: 500
                                }}
                              >
                                <Plus size={12} />
                                Create Namespace
                              </button>
                            </div>
                          </div>

                          {/* Loading State */}
                          {namespacesLoading[registry.name] && (
                            <div style={{ textAlign: 'center', padding: '20px', color: colors.textSecondary }}>
                              <Loader size={20} className="animate-spin" style={{ marginBottom: '8px' }} />
                              <div style={{ fontSize: '13px' }}>Loading namespaces...</div>
                            </div>
                          )}

                          {/* Error State */}
                          {!namespacesLoading[registry.name] && namespacesError[registry.name] && (
                            <div style={{
                              textAlign: 'center',
                              padding: '24px',
                              background: colors.errorBg,
                              borderRadius: '6px',
                              border: `1px solid ${colors.errorBorder}`
                            }}>
                              <AlertCircle size={24} style={{ color: colors.error, marginBottom: '8px' }} />
                              <div style={{ fontSize: '13px', color: colors.error }}>
                                {namespacesError[registry.name]}
                              </div>
                              <button
                                onClick={() => loadNamespacesForRegistry(registry.name, registry.url, registry.apiKey)}
                                style={{
                                  marginTop: '12px',
                                  padding: '6px 12px',
                                  background: 'transparent',
                                  border: `1px solid ${colors.border}`,
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  color: colors.textSecondary
                                }}
                              >
                                Try Again
                              </button>
                            </div>
                          )}

                          {/* Namespace List */}
                          {!namespacesLoading[registry.name] && !namespacesError[registry.name] && registryNamespaces[registry.name] && (
                            <>
                              {registryNamespaces[registry.name].length === 0 ? (
                                <div style={{
                                  textAlign: 'center',
                                  padding: '24px',
                                  background: colors.bgSecondary,
                                  borderRadius: '6px',
                                  border: `1px dashed ${colors.border}`
                                }}>
                                  <Shield size={24} style={{ color: colors.textMuted, marginBottom: '8px' }} />
                                  <div style={{ fontSize: '13px', color: colors.textSecondary }}>
                                    No namespaces found
                                  </div>
                                  <div style={{ fontSize: '12px', color: colors.textMuted, marginTop: '4px' }}>
                                    Create a namespace to publish packages
                                  </div>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  {registryNamespaces[registry.name].map((ns) => (
                                    <div
                                      key={ns.id}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '12px',
                                        background: colors.bgSecondary,
                                        borderRadius: '6px',
                                        border: `1px solid ${colors.border}`
                                      }}
                                    >
                                      <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                          <span style={{ fontSize: '14px', fontWeight: 600, color: colors.text, fontFamily: 'monospace' }}>
                                            {ns.displayName || ns.name}
                                          </span>
                                          {ns.verified && (
                                            <span title="Verified">
                                              <Check size={14} style={{ color: colors.success }} />
                                            </span>
                                          )}
                                          <span style={{
                                            fontSize: '10px',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            background: ns.visibility === 'public' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                                            color: ns.visibility === 'public' ? colors.success : colors.warning,
                                            textTransform: 'uppercase',
                                            fontWeight: 600
                                          }}>
                                            {ns.visibility}
                                          </span>
                                        </div>
                                        {ns.description && (
                                          <div style={{ fontSize: '12px', color: colors.textSecondary, marginTop: '4px' }}>
                                            {ns.description}
                                          </div>
                                        )}
                                        <div style={{ fontSize: '11px', color: colors.textMuted, marginTop: '4px' }}>
                                          {ns.packageCount || 0} packages
                                          {ns.permission && ` · ${ns.permission} access`}
                                        </div>
                                      </div>
                                      <button
                                        onClick={() => {
                                          setCurrentNamespace(ns.name)
                                          setRegistrySuccess(`Default namespace set to ${ns.name}`)
                                        }}
                                        style={{
                                          padding: '6px 10px',
                                          background: currentNamespace === ns.name ? colors.success : 'transparent',
                                          border: `1px solid ${currentNamespace === ns.name ? colors.success : colors.border}`,
                                          borderRadius: '4px',
                                          cursor: 'pointer',
                                          fontSize: '11px',
                                          color: currentNamespace === ns.name ? 'white' : colors.textSecondary,
                                          fontWeight: 500
                                        }}
                                      >
                                        {currentNamespace === ns.name ? 'Active' : 'Use'}
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          )}

                          {/* Create Namespace Form */}
                          {showCreateNamespace === registry.name && (
                            <div style={{
                              marginTop: '16px',
                              padding: '16px',
                              background: colors.bgSecondary,
                              borderRadius: '6px',
                              border: `1px solid ${colors.border}`
                            }}>
                              <h5 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 600, color: colors.text }}>
                                Create New Namespace
                              </h5>

                              <div style={{ marginBottom: '12px' }}>
                                <label style={{ display: 'block', fontSize: '12px', color: colors.textSecondary, marginBottom: '4px' }}>
                                  Namespace Name
                                </label>
                                <input
                                  type="text"
                                  value={newNamespaceName}
                                  onChange={(e) => setNewNamespaceName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                  placeholder="my-namespace"
                                  style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    fontSize: '13px',
                                    border: `1px solid ${colors.border}`,
                                    borderRadius: '4px',
                                    background: colors.input,
                                    color: colors.text,
                                    fontFamily: 'monospace',
                                    boxSizing: 'border-box'
                                  }}
                                />
                                <div style={{ fontSize: '11px', color: colors.textMuted, marginTop: '4px' }}>
                                  Will be created as @{newNamespaceName || 'namespace'}
                                </div>
                              </div>

                              <div style={{ marginBottom: '12px' }}>
                                <label style={{ display: 'block', fontSize: '12px', color: colors.textSecondary, marginBottom: '4px' }}>
                                  Description (optional)
                                </label>
                                <input
                                  type="text"
                                  value={newNamespaceDescription}
                                  onChange={(e) => setNewNamespaceDescription(e.target.value)}
                                  placeholder="A brief description of your namespace"
                                  style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    fontSize: '13px',
                                    border: `1px solid ${colors.border}`,
                                    borderRadius: '4px',
                                    background: colors.input,
                                    color: colors.text,
                                    boxSizing: 'border-box'
                                  }}
                                />
                              </div>

                              <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', fontSize: '12px', color: colors.textSecondary, marginBottom: '4px' }}>
                                  Visibility
                                </label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button
                                    onClick={() => setNewNamespaceVisibility('public')}
                                    style={{
                                      flex: 1,
                                      padding: '8px 12px',
                                      fontSize: '12px',
                                      border: `1px solid ${newNamespaceVisibility === 'public' ? colors.success : colors.border}`,
                                      borderRadius: '4px',
                                      background: newNamespaceVisibility === 'public' ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                                      color: newNamespaceVisibility === 'public' ? colors.success : colors.textSecondary,
                                      cursor: 'pointer',
                                      fontWeight: newNamespaceVisibility === 'public' ? 600 : 400
                                    }}
                                  >
                                    <Globe size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                                    Public
                                  </button>
                                  <button
                                    onClick={() => setNewNamespaceVisibility('private')}
                                    style={{
                                      flex: 1,
                                      padding: '8px 12px',
                                      fontSize: '12px',
                                      border: `1px solid ${newNamespaceVisibility === 'private' ? colors.warning : colors.border}`,
                                      borderRadius: '4px',
                                      background: newNamespaceVisibility === 'private' ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
                                      color: newNamespaceVisibility === 'private' ? colors.warning : colors.textSecondary,
                                      cursor: 'pointer',
                                      fontWeight: newNamespaceVisibility === 'private' ? 600 : 400
                                    }}
                                  >
                                    <Shield size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                                    Private
                                  </button>
                                </div>
                              </div>

                              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button
                                  onClick={() => {
                                    setShowCreateNamespace(null)
                                    setNewNamespaceName('')
                                    setNewNamespaceDescription('')
                                    setNewNamespaceVisibility('public')
                                  }}
                                  style={{
                                    padding: '8px 16px',
                                    fontSize: '13px',
                                    border: `1px solid ${colors.border}`,
                                    borderRadius: '4px',
                                    background: 'transparent',
                                    color: colors.text,
                                    cursor: 'pointer'
                                  }}
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => handleCreateNamespace(registry.name, registry.url, registry.apiKey)}
                                  disabled={!newNamespaceName.trim() || creatingNamespace}
                                  style={{
                                    padding: '8px 16px',
                                    fontSize: '13px',
                                    border: 'none',
                                    borderRadius: '4px',
                                    background: !newNamespaceName.trim() || creatingNamespace ? colors.bgTertiary : colors.primary,
                                    color: 'white',
                                    cursor: !newNamespaceName.trim() || creatingNamespace ? 'not-allowed' : 'pointer',
                                    fontWeight: 500,
                                    opacity: !newNamespaceName.trim() || creatingNamespace ? 0.5 : 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                  }}
                                >
                                  {creatingNamespace && <Loader size={14} className="animate-spin" />}
                                  {creatingNamespace ? 'Creating...' : 'Create Namespace'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}

                {/* Add Registry Button */}
                {!showAddRegistry && (
                  <button
                    onClick={() => setShowAddRegistry(true)}
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
                      transition: 'all 0.2s ease'
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
                    Add Registry
                  </button>
                )}

                {/* Add Registry Form */}
                {showAddRegistry && (
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
                      Add Registry
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>
                        Registry Name
                      </label>
                      <input
                        type="text"
                        value={newRegistryName}
                        onChange={(e) => setNewRegistryName(e.target.value)}
                        placeholder="my-registry"
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

                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '13px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>
                        Registry URL
                      </label>
                      <input
                        type="text"
                        value={newRegistryUrl}
                        onChange={(e) => setNewRegistryUrl(e.target.value)}
                        placeholder="https://registry.example.com"
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          background: colors.bg,
                          border: `1px solid ${colors.border}`,
                          borderRadius: '6px',
                          fontSize: '14px',
                          color: colors.text,
                          fontFamily: 'monospace',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => {
                          setShowAddRegistry(false)
                          setNewRegistryName('')
                          setNewRegistryUrl('')
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
                        onClick={async () => {
                          if (!newRegistryName.trim() || !newRegistryUrl.trim()) {
                            setRegistryError('Name and URL are required')
                            return
                          }

                          if (isElectron && configService.hasNativeConfig()) {
                            const config = await configService.getConfig()
                            config.registry = config.registry || { default: 'prompdhub', registries: {} }
                            config.registry.registries = config.registry.registries || {}
                            config.registry.registries[newRegistryName.trim()] = {
                              url: newRegistryUrl.trim()
                            }
                            await configService.saveConfig(config)
                            setRegistries(prev => [...prev, {
                              name: newRegistryName.trim(),
                              url: newRegistryUrl.trim(),
                              isDefault: false
                            }])
                            setShowAddRegistry(false)
                            setNewRegistryName('')
                            setNewRegistryUrl('')
                            setRegistrySuccess(`${newRegistryName} registry added`)
                          }
                        }}
                        disabled={!newRegistryName.trim() || !newRegistryUrl.trim()}
                        style={{
                          padding: '8px 16px',
                          background: !newRegistryName.trim() || !newRegistryUrl.trim() ? colors.bgTertiary : colors.primary,
                          border: 'none',
                          borderRadius: '6px',
                          cursor: !newRegistryName.trim() || !newRegistryUrl.trim() ? 'not-allowed' : 'pointer',
                          fontSize: '13px',
                          color: 'white',
                          fontWeight: 500,
                          opacity: !newRegistryName.trim() || !newRegistryUrl.trim() ? 0.5 : 1
                        }}
                      >
                        Add Registry
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Success/Error Messages */}
              {registrySuccess && (
                <div
                  style={{
                    padding: '12px 16px',
                    background: colors.successBg,
                    border: `1px solid ${colors.successBorder}`,
                    borderRadius: '8px',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}
                >
                  <Check size={20} style={{ color: colors.success, flexShrink: 0 }} />
                  <span style={{ fontSize: '14px', color: colors.success }}>{registrySuccess}</span>
                </div>
              )}

              {registryError && (
                <div
                  style={{
                    padding: '12px 16px',
                    background: colors.errorBg,
                    border: `1px solid ${colors.errorBorder}`,
                    borderRadius: '8px',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}
                >
                  <AlertCircle size={20} style={{ color: colors.error, flexShrink: 0 }} />
                  <span style={{ fontSize: '14px', color: colors.error }}>{registryError}</span>
                </div>
              )}

              {/* Save Namespace Button */}
              <button
                onClick={async () => {
                  if (isElectron && configService.hasNativeConfig()) {
                    const config = await configService.getConfig()
                    config.registry = config.registry || { default: 'prompdhub', registries: {} }
                    config.registry.current_namespace = currentNamespace.trim()
                    await configService.saveConfig(config)
                    setRegistrySuccess('Namespace saved successfully')
                  }
                }}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: 500,
                  border: 'none',
                  borderRadius: '6px',
                  background: colors.success,
                  color: 'white',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = colors.successHover)}
                onMouseLeave={(e) => (e.currentTarget.style.background = colors.success)}
              >
                Save Settings
              </button>
            </>
          )}

          {/* Usage Tab */}
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

          {/* Shortcuts Tab */}
          {activeTab === 'shortcuts' && (
            <div>
              <HotkeySettings theme={theme} onClose={() => {}} inline={true} />
            </div>
          )}

          {/* Scheduler Tabs */}
          {activeTab === 'schedules' && <ScheduleSettings colors={colors} />}

          {activeTab === 'webhooks' && (
            <div>
              <WebhookSettings />
            </div>
          )}

          {activeTab === 'service' && (
            <div>
              <ServiceSettings />
            </div>
          )}
        </div>
      </div>
    </div>

      {/* Confirm Dialog */}
      <ConfirmDialogComponent />
    </div>
  )
}

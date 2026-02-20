// Config Service - Frontend abstraction for ~/.prompd/config.yaml
// In Electron: Uses IPC to read/write config files (shared with CLI)
// In Web: Falls back to localStorage with same interface

import type {
  PrompdConfig,
  CustomProviderConfig,
  RegistryConfig,
  ProviderInfo
} from '../../electron'

// Re-export types for convenience
export type { PrompdConfig, CustomProviderConfig, RegistryConfig, ProviderInfo }

// Default config (matches main.js DEFAULT_CONFIG)
const DEFAULT_CONFIG: PrompdConfig = {
  default_provider: '',
  default_model: '',
  api_keys: {},
  custom_providers: {},
  provider_configs: {},
  registry: {
    default: 'prompdhub',
    current_namespace: '',
    registries: {
      prompdhub: {
        url: 'https://registry.prompdhub.ai',
        api_key: '',
        username: ''
      }
    }
  },
  scopes: {},
  timeout: 30,
  max_retries: 3,
  verbose: false
}

// Default models for standard providers
const DEFAULT_PROVIDER_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1-preview', 'o1-mini'],
  anthropic: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-5-20250929', 'claude-opus-4-6', 'claude-sonnet-4-20250514'],
  google: ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
  mistral: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest'],
  cohere: ['command-r-plus', 'command-r', 'command'],
  together: ['meta-llama/Llama-3-70b-chat-hf', 'mistralai/Mixtral-8x7B-Instruct-v0.1'],
  perplexity: ['llama-3.1-sonar-large-128k-online', 'llama-3.1-sonar-small-128k-online'],
  deepseek: ['deepseek-chat', 'deepseek-coder']
}

type ConfigChangeListener = (config: PrompdConfig) => void

class ConfigService {
  private cachedConfig: PrompdConfig | null = null
  private lastWorkspacePath: string | null = null
  private configListeners = new Set<ConfigChangeListener>()
  private isElectron: boolean
  // Track in-flight load to deduplicate concurrent calls (e.g., React StrictMode)
  private loadingPromise: Promise<PrompdConfig> | null = null
  private loadingWorkspacePath: string | null = null

  constructor() {
    this.isElectron = typeof window !== 'undefined' && !!window.electronAPI?.config
  }

  // Check if running in Electron with config support
  hasNativeConfig(): boolean {
    return this.isElectron
  }

  // Load config (merged from all sources)
  async loadConfig(workspacePath?: string): Promise<PrompdConfig> {
    // If there's already a load in progress for the same workspace, return that promise
    // This prevents double-loading in React StrictMode
    const workspaceKey = workspacePath || null
    if (this.loadingPromise && workspaceKey === this.loadingWorkspacePath) {
      return this.loadingPromise
    }

    // Start new load - track the workspace we're loading for
    this.loadingWorkspacePath = workspaceKey
    this.loadingPromise = this.doLoadConfig(workspacePath)

    try {
      const result = await this.loadingPromise
      return result
    } finally {
      this.loadingPromise = null
      this.loadingWorkspacePath = null
    }
  }

  // Internal method that does the actual config loading
  private async doLoadConfig(workspacePath?: string): Promise<PrompdConfig> {
    if (this.isElectron && window.electronAPI?.config) {
      try {
        const result = await window.electronAPI.config.load(workspacePath)
        if (result.success && result.config) {
          this.cachedConfig = result.config
          this.lastWorkspacePath = workspacePath || null
          console.log('[ConfigService] Loaded config from Electron:', result.sources)
          return result.config
        }
        console.warn('[ConfigService] Failed to load config:', result.error)
      } catch (error) {
        console.error('[ConfigService] Error loading config:', error)
      }
    }

    // Fallback to localStorage for web
    return this.loadFromLocalStorage()
  }

  // Get cached config or load if not cached
  async getConfig(workspacePath?: string): Promise<PrompdConfig> {
    // If workspace changed, reload
    if (workspacePath !== this.lastWorkspacePath) {
      return this.loadConfig(workspacePath)
    }

    // Return cached if available
    if (this.cachedConfig) {
      return this.cachedConfig
    }

    return this.loadConfig(workspacePath)
  }

  // Save config to file
  async saveConfig(
    config: PrompdConfig,
    location: 'global' | 'local' = 'global',
    workspacePath?: string
  ): Promise<boolean> {
    if (this.isElectron && window.electronAPI?.config) {
      try {
        const result = await window.electronAPI.config.save(config, location, workspacePath)
        if (result.success) {
          // Update cache
          this.cachedConfig = config
          this.notifyListeners(config)
          console.log('[ConfigService] Saved config to:', result.path)
          return true
        }
        console.error('[ConfigService] Failed to save config:', result.error)
        return false
      } catch (error) {
        console.error('[ConfigService] Error saving config:', error)
        return false
      }
    }

    // Fallback to localStorage
    return this.saveToLocalStorage(config)
  }

  // Get API key for a provider
  async getApiKey(provider: string, workspacePath?: string): Promise<string | null> {
    if (this.isElectron && window.electronAPI?.config) {
      try {
        const result = await window.electronAPI.config.getApiKey(provider, workspacePath)
        if (result.success) {
          if (result.apiKey) {
            console.log(`[ConfigService] API key for ${provider} from ${result.source}`)
          }
          return result.apiKey || null
        }
      } catch (error) {
        console.error('[ConfigService] Error getting API key:', error)
      }
    }

    // Fallback to localStorage
    const config = this.loadFromLocalStorage()
    return config.api_keys?.[provider.toLowerCase()] || null
  }

  // Set API key for a provider (always global)
  async setApiKey(provider: string, apiKey: string): Promise<boolean> {
    if (this.isElectron && window.electronAPI?.config) {
      try {
        const result = await window.electronAPI.config.setApiKey(provider, apiKey)
        if (result.success) {
          // Update cache
          if (this.cachedConfig) {
            this.cachedConfig.api_keys = this.cachedConfig.api_keys || {}
            this.cachedConfig.api_keys[provider.toLowerCase()] = apiKey
            this.notifyListeners(this.cachedConfig)
          }
          return true
        }
        console.error('[ConfigService] Failed to set API key:', result.error)
        return false
      } catch (error) {
        console.error('[ConfigService] Error setting API key:', error)
        return false
      }
    }

    // Fallback to localStorage
    const config = this.loadFromLocalStorage()
    config.api_keys = config.api_keys || {}
    config.api_keys[provider.toLowerCase()] = apiKey
    return this.saveToLocalStorage(config)
  }

  // Get registry URL
  async getRegistryUrl(registryName?: string, workspacePath?: string): Promise<string> {
    if (this.isElectron && window.electronAPI?.config) {
      try {
        const result = await window.electronAPI.config.getRegistryUrl(registryName, workspacePath)
        if (result.success && result.url) {
          return result.url
        }
      } catch (error) {
        console.error('[ConfigService] Error getting registry URL:', error)
      }
    }

    // Fallback
    const config = await this.getConfig(workspacePath)
    const regKey = registryName || config.registry?.default || 'prompdhub'
    const registry = config.registry?.registries?.[regKey]
    return registry?.url || 'https://registry.prompdhub.ai'
  }

  // Get list of providers with configuration status
  async getProviders(workspacePath?: string): Promise<{
    providers: ProviderInfo[]
    defaultProvider: string
    defaultModel: string
  }> {
    if (this.isElectron && window.electronAPI?.config) {
      try {
        const result = await window.electronAPI.config.getProviders(workspacePath)
        if (result.success && result.providers) {
          return {
            providers: result.providers,
            defaultProvider: result.defaultProvider || '',
            defaultModel: result.defaultModel || ''
          }
        }
      } catch (error) {
        console.error('[ConfigService] Error getting providers:', error)
      }
    }

    // Fallback: build provider list from localStorage config
    const config = await this.getConfig(workspacePath)
    const providers: ProviderInfo[] = []

    // Standard providers
    const standardProviders = ['openai', 'anthropic', 'google', 'groq', 'mistral', 'cohere', 'together', 'perplexity', 'deepseek']
    for (const provider of standardProviders) {
      providers.push({
        name: provider,
        type: 'standard',
        configured: !!config.api_keys?.[provider],
        models: DEFAULT_PROVIDER_MODELS[provider] || []
      })
    }

    // Custom providers
    if (config.custom_providers) {
      for (const [name, providerConfig] of Object.entries(config.custom_providers)) {
        providers.push({
          name,
          type: providerConfig.type || 'openai-compatible',
          configured: providerConfig.enabled !== false,
          baseUrl: providerConfig.base_url,
          models: (providerConfig.models || []).map(m => typeof m === 'string' ? m : m.id)
        })
      }
    }

    return {
      providers,
      defaultProvider: config.default_provider || '',
      defaultModel: config.default_model || ''
    }
  }

  // Get default provider
  async getDefaultProvider(workspacePath?: string): Promise<string> {
    const config = await this.getConfig(workspacePath)
    return config.default_provider || ''
  }

  // Get default model for a provider
  async getDefaultModel(provider?: string, workspacePath?: string): Promise<string> {
    const config = await this.getConfig(workspacePath)

    // If specific provider requested, check provider_configs
    if (provider && config.provider_configs?.[provider]) {
      const providerConfig = config.provider_configs[provider] as Record<string, unknown>
      if (typeof providerConfig.default_model === 'string') {
        return providerConfig.default_model
      }
    }

    return config.default_model || ''
  }

  // Set default provider
  async setDefaultProvider(provider: string, workspacePath?: string): Promise<boolean> {
    const config = await this.getConfig(workspacePath)
    config.default_provider = provider
    return this.saveConfig(config, 'global', workspacePath)
  }

  // Set default model
  async setDefaultModel(model: string, workspacePath?: string): Promise<boolean> {
    const config = await this.getConfig(workspacePath)
    config.default_model = model
    return this.saveConfig(config, 'global', workspacePath)
  }

  // Clear cached config (force reload on next access)
  // Clears both renderer-side cache and Electron main process cache
  async clearCache(): Promise<void> {
    this.cachedConfig = null
    this.lastWorkspacePath = null

    // Also clear the Electron main process cache
    if (this.isElectron && window.electronAPI?.config?.clearCache) {
      try {
        await window.electronAPI.config.clearCache()
        console.log('[ConfigService] Cleared main process config cache')
      } catch (error) {
        console.error('[ConfigService] Failed to clear main process cache:', error)
      }
    }
  }

  // Subscribe to config changes
  onConfigChange(listener: ConfigChangeListener): () => void {
    this.configListeners.add(listener)
    return () => this.configListeners.delete(listener)
  }

  private notifyListeners(config: PrompdConfig): void {
    this.configListeners.forEach(listener => {
      try {
        listener(config)
      } catch (error) {
        console.error('[ConfigService] Error in config change listener:', error)
      }
    })
  }

  // LocalStorage fallback methods (for web mode)
  private loadFromLocalStorage(): PrompdConfig {
    try {
      const stored = localStorage.getItem('prompd.config')
      if (stored) {
        const parsed = JSON.parse(stored)
        return { ...DEFAULT_CONFIG, ...parsed }
      }
    } catch (error) {
      console.error('[ConfigService] Error loading from localStorage:', error)
    }
    return { ...DEFAULT_CONFIG }
  }

  private saveToLocalStorage(config: PrompdConfig): boolean {
    try {
      localStorage.setItem('prompd.config', JSON.stringify(config))
      this.cachedConfig = config
      this.notifyListeners(config)
      return true
    } catch (error) {
      console.error('[ConfigService] Error saving to localStorage:', error)
      return false
    }
  }
}

// Export singleton instance
export const configService = new ConfigService()

// Export class for testing
export { ConfigService }

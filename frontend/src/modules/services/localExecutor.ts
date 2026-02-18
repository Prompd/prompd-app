/**
 * Local Executor Service
 *
 * Executes prompts locally using direct LLM API calls.
 * Part of the local-first Electron architecture.
 */

import { configService } from './configService'
import { persistBase64Images } from './imageStorage'
import {
  createProvider,
  getProviderConfig,
  listKnownProviders,
  isKnownProvider,
  KNOWN_PROVIDERS
} from './providers'
import type {
  ExecutionRequest,
  ExecutionResult,
  StreamChunk,
  ModelInfo,
  ProviderEntry,
  GenerationMode
} from './providers'

/**
 * Options for local execution
 */
export interface LocalExecuteOptions {
  /** Provider name (e.g., 'openai', 'anthropic') */
  provider: string
  /** Model identifier */
  model: string
  /** The prompt content to execute */
  prompt: string
  /** System prompt (optional) */
  systemPrompt?: string
  /** Maximum tokens to generate */
  maxTokens?: number
  /** Temperature (0-2) */
  temperature?: number
  /** Generation mode (default, thinking, json, code) */
  mode?: GenerationMode
  /** Whether to stream the response */
  stream?: boolean
  /** Enable image generation output for models that support it */
  enableImageGeneration?: boolean
  /** Custom provider config (for custom endpoints) */
  customConfig?: {
    baseUrl: string
    displayName?: string
  }
}

/**
 * Result from local execution
 */
export interface LocalExecuteResult {
  success: boolean
  response?: string
  error?: string
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  metadata: {
    provider: string
    model: string
    duration: number
    local: true
  }
}

/**
 * Local Executor Service singleton
 */
class LocalExecutorService {
  private static instance: LocalExecutorService

  private constructor() {}

  static getInstance(): LocalExecutorService {
    if (!LocalExecutorService.instance) {
      LocalExecutorService.instance = new LocalExecutorService()
    }
    return LocalExecutorService.instance
  }

  /**
   * Check if we can execute locally (Electron only with API key)
   */
  async canExecuteLocally(provider: string): Promise<boolean> {
    // Must be in Electron
    if (!this.isElectron()) {
      return false
    }

    // Check if provider is Ollama (doesn't need API key)
    if (provider.toLowerCase() === 'ollama') {
      return true
    }

    // Custom providers may not need an API key (e.g. local models)
    if (!isKnownProvider(provider)) {
      const customConfig = await this.resolveCustomProviderConfig(provider)
      if (customConfig) return true
    }

    // Check if API key is available for provider
    const apiKey = await configService.getApiKey(provider)
    return !!apiKey
  }

  /**
   * Resolve custom provider config from configService when provider is not in KNOWN_PROVIDERS.
   * Returns the customConfig object for createProvider, or null if not found.
   */
  private async resolveCustomProviderConfig(provider: string): Promise<{ baseUrl: string; displayName: string } | null> {
    try {
      const config = await configService.getConfig()
      if (config.custom_providers) {
        const providerConfig = config.custom_providers[provider]
        if (providerConfig) {
          // Normalize base URL: strip /chat/completions suffix since OpenAICompatibleProvider appends it
          let baseUrl = (providerConfig.base_url || '').replace(/\/+$/, '')
          if (baseUrl.endsWith('/chat/completions')) {
            baseUrl = baseUrl.slice(0, -'/chat/completions'.length)
          }
          return {
            baseUrl,
            displayName: provider.charAt(0).toUpperCase() + provider.slice(1)
          }
        }
      }
    } catch {
      // Config load failure
    }
    return null
  }

  /**
   * Execute a prompt locally
   */
  async execute(options: LocalExecuteOptions): Promise<LocalExecuteResult> {
    const startTime = Date.now()

    try {
      // Get API key from config
      const apiKey = await this.getApiKey(options.provider)

      // Resolve custom config: use explicit config, or auto-resolve from configService
      const resolvedCustomConfig = options.customConfig
        || (!isKnownProvider(options.provider) ? await this.resolveCustomProviderConfig(options.provider) : null)

      // Create provider instance
      const providerInstance = createProvider(
        options.provider,
        resolvedCustomConfig ? {
          name: options.provider,
          displayName: resolvedCustomConfig.displayName || options.provider,
          baseUrl: resolvedCustomConfig.baseUrl
        } : undefined
      )

      // Build execution request
      const request: ExecutionRequest = {
        prompt: options.prompt,
        model: options.model,
        apiKey,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        systemPrompt: options.systemPrompt,
        stream: false,
        mode: options.mode,
        enableImageGeneration: options.enableImageGeneration
      }

      // Execute
      const result = await providerInstance.execute(request)

      // Persist any inline base64 images to disk to avoid store bloat
      const response = result.response
        ? await persistBase64Images(result.response)
        : result.response

      return {
        success: result.success,
        response,
        error: result.error,
        usage: result.usage,
        metadata: {
          provider: options.provider,
          model: options.model,
          duration: result.duration,
          local: true
        }
      }
    } catch (error) {
      const duration = Date.now() - startTime
      const message = error instanceof Error ? error.message : 'Unknown error'

      return {
        success: false,
        error: message,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        metadata: {
          provider: options.provider,
          model: options.model,
          duration,
          local: true
        }
      }
    }
  }

  /**
   * Execute with streaming response
   */
  async *stream(options: LocalExecuteOptions): AsyncGenerator<StreamChunk, LocalExecuteResult, unknown> {
    const startTime = Date.now()

    try {
      // Get API key from config
      const apiKey = await this.getApiKey(options.provider)

      // Resolve custom config: use explicit config, or auto-resolve from configService
      const resolvedCustomConfig = options.customConfig
        || (!isKnownProvider(options.provider) ? await this.resolveCustomProviderConfig(options.provider) : null)

      // Create provider instance
      const providerInstance = createProvider(
        options.provider,
        resolvedCustomConfig ? {
          name: options.provider,
          displayName: resolvedCustomConfig.displayName || options.provider,
          baseUrl: resolvedCustomConfig.baseUrl
        } : undefined
      )

      // Build execution request
      const request: ExecutionRequest = {
        prompt: options.prompt,
        model: options.model,
        apiKey,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        systemPrompt: options.systemPrompt,
        stream: true,
        mode: options.mode,
        enableImageGeneration: options.enableImageGeneration
      }

      // Stream
      let finalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
      let fullResponse = ''

      for await (const chunk of providerInstance.stream(request)) {
        fullResponse += chunk.content
        if (chunk.usage) {
          finalUsage = chunk.usage
        }
        yield chunk
      }

      const duration = Date.now() - startTime

      // Persist any inline base64 images to disk to avoid store bloat
      const persistedResponse = await persistBase64Images(fullResponse)

      return {
        success: true,
        response: persistedResponse,
        usage: finalUsage,
        metadata: {
          provider: options.provider,
          model: options.model,
          duration,
          local: true
        }
      }
    } catch (error) {
      const duration = Date.now() - startTime
      const message = error instanceof Error ? error.message : 'Unknown error'

      return {
        success: false,
        error: message,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        metadata: {
          provider: options.provider,
          model: options.model,
          duration,
          local: true
        }
      }
    }
  }

  /**
   * Get available providers with their configuration status
   */
  async getAvailableProviders(): Promise<Array<ProviderEntry & { hasKey: boolean; isDefault: boolean; isCustom?: boolean }>> {
    const providers = listKnownProviders()
    const defaultProvider = await configService.getDefaultProvider()

    const result = await Promise.all(
      providers.map(async (name) => {
        const config = getProviderConfig(name)
        if (!config) return null

        const hasKey = config.isLocal || !!(await configService.getApiKey(name))

        return {
          ...config,
          hasKey,
          isDefault: name === defaultProvider
        }
      })
    )

    type ProviderResult = ProviderEntry & { hasKey: boolean; isDefault: boolean; isCustom?: boolean }
    const allProviders: ProviderResult[] = result.filter((p): p is NonNullable<typeof p> => p !== null)

    // Include custom providers from config.yaml
    try {
      const config = await configService.getConfig()
      if (config.custom_providers) {
        for (const [name, providerConfig] of Object.entries(config.custom_providers)) {
          if (providers.includes(name)) continue
          const hasKey = !!(await configService.getApiKey(name))
          // Parse models: support both string[] and CustomProviderModelConfig[]
          const models: ModelInfo[] = (providerConfig.models || []).map(m => {
            if (typeof m === 'string') {
              return { id: m, name: m }
            }
            return {
              id: m.id,
              name: m.name || m.id,
              contextWindow: m.context_window
            }
          })
          allProviders.push({
            name,
            displayName: providerConfig.display_name || name.charAt(0).toUpperCase() + name.slice(1),
            baseUrl: providerConfig.base_url || '',
            isOpenAICompatible: (providerConfig.type || 'openai-compatible') === 'openai-compatible',
            models,
            hasKey: hasKey || providerConfig.enabled !== false,
            isDefault: name === defaultProvider,
            isCustom: true
          })
        }
      }
    } catch {
      // Config load failure - skip custom providers
    }

    return allProviders
  }

  /**
   * Get models for a specific provider
   */
  getModelsForProvider(providerName: string): ModelInfo[] {
    const config = getProviderConfig(providerName)
    return config?.models || []
  }

  /**
   * Get all known providers
   */
  getKnownProviders(): Record<string, ProviderEntry> {
    return KNOWN_PROVIDERS
  }

  /**
   * Check if running in Electron
   */
  isElectron(): boolean {
    const electronAPI = (window as { electronAPI?: { isElectron?: boolean } }).electronAPI
    return !!electronAPI?.isElectron
  }

  /**
   * Get API key for provider from config
   */
  private async getApiKey(provider: string): Promise<string> {
    // Ollama doesn't need API key
    if (provider.toLowerCase() === 'ollama') {
      return 'ollama'
    }

    const apiKey = await configService.getApiKey(provider)
    if (!apiKey) {
      // Custom providers may not require an API key (e.g. local models)
      if (!isKnownProvider(provider)) {
        const customConfig = await this.resolveCustomProviderConfig(provider)
        if (customConfig) {
          return ''  // Allow empty key for custom providers
        }
      }
      throw new Error(`No API key configured for ${provider}. Add it to ~/.prompd/config.yaml or set ${provider.toUpperCase()}_API_KEY environment variable.`)
    }
    return apiKey
  }
}

// Export singleton instance
export const localExecutor = LocalExecutorService.getInstance()

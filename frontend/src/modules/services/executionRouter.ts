/**
 * Execution Router Service
 *
 * Unified interface that routes execution requests to either:
 * - Local execution (Electron with config-based API keys)
 * - Remote execution (Web or Electron without local API keys)
 *
 * This abstraction allows the UI to use a single API regardless of execution mode.
 */

import { localExecutor } from './localExecutor'
import { localCompiler } from './localCompiler'
import type { LocalExecuteOptions } from './localExecutor'
import type { StreamChunk, GenerationMode } from './providers'

/**
 * Execution options passed to the router
 */
export interface ExecutionOptions {
  /** Provider name (e.g., 'openai', 'anthropic') */
  provider: string
  /** Model identifier */
  model: string
  /** The prompt content (raw or compiled) */
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
  /** If true, compile the prompt first using local compiler */
  compile?: boolean
  /** Compilation format (if compile is true) */
  compileFormat?: 'markdown' | 'openai' | 'anthropic'
  /** Template parameters for compilation */
  parameters?: Record<string, unknown>
  /** Custom provider config (for custom endpoints) */
  customConfig?: {
    baseUrl: string
    displayName?: string
  }
}

/**
 * Execution result from the router
 */
export interface ExecutionRouterResult {
  success: boolean
  response?: string
  error?: string
  compiledPrompt?: string
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  metadata: {
    provider: string
    model: string
    duration: number
    executionMode: 'local' | 'remote'
    compiledLocally?: boolean
  }
}

/**
 * Backend execution endpoint configuration
 */
const BACKEND_EXECUTE_URL = '/api/compilation/execute'

/**
 * Execution Router Service singleton
 */
class ExecutionRouterService {
  private static instance: ExecutionRouterService

  private constructor() {}

  static getInstance(): ExecutionRouterService {
    if (!ExecutionRouterService.instance) {
      ExecutionRouterService.instance = new ExecutionRouterService()
    }
    return ExecutionRouterService.instance
  }

  /**
   * Determine the best execution mode for the given provider
   */
  async getExecutionMode(provider: string): Promise<'local' | 'remote'> {
    // Check if we can execute locally
    if (await localExecutor.canExecuteLocally(provider)) {
      return 'local'
    }
    return 'remote'
  }

  /**
   * Execute a prompt, routing to local or remote as appropriate
   */
  async execute(options: ExecutionOptions): Promise<ExecutionRouterResult> {
    const startTime = Date.now()
    let prompt = options.prompt
    let compiledPrompt: string | undefined
    let compiledLocally = false

    try {
      // Compile the prompt if requested
      if (options.compile && localCompiler.hasLocalCompiler()) {
        const compileResult = await localCompiler.compile(prompt, {
          format: options.compileFormat || 'markdown',
          parameters: options.parameters
        })

        if (compileResult.success && compileResult.output) {
          compiledPrompt = compileResult.output
          prompt = compileResult.output
          compiledLocally = true
        }
      }

      // Determine execution mode
      const mode = await this.getExecutionMode(options.provider)

      if (mode === 'local') {
        return await this.executeLocally(options, prompt, compiledPrompt, compiledLocally)
      } else {
        return await this.executeRemotely(options, prompt, compiledPrompt, compiledLocally)
      }
    } catch (error) {
      const duration = Date.now() - startTime
      const message = error instanceof Error ? error.message : 'Unknown error'

      return {
        success: false,
        error: message,
        compiledPrompt,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        metadata: {
          provider: options.provider,
          model: options.model,
          duration,
          executionMode: 'remote',
          compiledLocally
        }
      }
    }
  }

  /**
   * Execute with streaming, routing to local or remote
   */
  async *stream(options: ExecutionOptions): AsyncGenerator<StreamChunk, ExecutionRouterResult, unknown> {
    const startTime = Date.now()
    let prompt = options.prompt
    let compiledPrompt: string | undefined
    let compiledLocally = false

    try {
      // Compile the prompt if requested
      if (options.compile && localCompiler.hasLocalCompiler()) {
        const compileResult = await localCompiler.compile(prompt, {
          format: options.compileFormat || 'markdown',
          parameters: options.parameters
        })

        if (compileResult.success && compileResult.output) {
          compiledPrompt = compileResult.output
          prompt = compileResult.output
          compiledLocally = true
        }
      }

      // Determine execution mode
      const mode = await this.getExecutionMode(options.provider)

      if (mode === 'local') {
        // Use local streaming
        const localOptions: LocalExecuteOptions = {
          provider: options.provider,
          model: options.model,
          prompt,
          systemPrompt: options.systemPrompt,
          maxTokens: options.maxTokens,
          temperature: options.temperature,
          mode: options.mode,
          stream: true,
          enableImageGeneration: options.enableImageGeneration,
          customConfig: options.customConfig
        }

        let fullResponse = ''
        let finalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

        for await (const chunk of localExecutor.stream(localOptions)) {
          fullResponse += chunk.content
          if (chunk.usage) {
            finalUsage = chunk.usage
          }
          yield chunk
        }

        const duration = Date.now() - startTime

        return {
          success: true,
          response: fullResponse,
          compiledPrompt,
          usage: finalUsage,
          metadata: {
            provider: options.provider,
            model: options.model,
            duration,
            executionMode: 'local',
            compiledLocally
          }
        }
      } else {
        // Remote streaming - use SSE from backend
        const result = await this.streamRemotely(options, prompt, compiledPrompt, compiledLocally)

        // For remote, we don't have a true streaming implementation yet
        // Yield the full response as a single chunk
        yield { content: result.response || '', done: true, usage: result.usage }

        return result
      }
    } catch (error) {
      const duration = Date.now() - startTime
      const message = error instanceof Error ? error.message : 'Unknown error'

      return {
        success: false,
        error: message,
        compiledPrompt,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        metadata: {
          provider: options.provider,
          model: options.model,
          duration,
          executionMode: 'remote',
          compiledLocally
        }
      }
    }
  }

  /**
   * Execute locally using the local executor
   */
  private async executeLocally(
    options: ExecutionOptions,
    prompt: string,
    compiledPrompt: string | undefined,
    compiledLocally: boolean
  ): Promise<ExecutionRouterResult> {
    const localOptions: LocalExecuteOptions = {
      provider: options.provider,
      model: options.model,
      prompt,
      systemPrompt: options.systemPrompt,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      mode: options.mode,
      stream: false,
      enableImageGeneration: options.enableImageGeneration,
      customConfig: options.customConfig
    }

    const result = await localExecutor.execute(localOptions)

    return {
      success: result.success,
      response: result.response,
      error: result.error,
      compiledPrompt,
      usage: result.usage,
      metadata: {
        provider: result.metadata.provider,
        model: result.metadata.model,
        duration: result.metadata.duration,
        executionMode: 'local',
        compiledLocally
      }
    }
  }

  /**
   * Execute remotely using the backend API
   */
  private async executeRemotely(
    options: ExecutionOptions,
    prompt: string,
    compiledPrompt: string | undefined,
    compiledLocally: boolean
  ): Promise<ExecutionRouterResult> {
    const startTime = Date.now()

    try {
      const response = await fetch(BACKEND_EXECUTE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt,
          provider: options.provider,
          model: options.model,
          systemPrompt: options.systemPrompt,
          maxTokens: options.maxTokens,
          temperature: options.temperature,
          mode: options.mode
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`
        throw new Error(errorMessage)
      }

      const data = await response.json()
      const duration = Date.now() - startTime

      return {
        success: data.success,
        response: data.response,
        error: data.error,
        compiledPrompt: compiledPrompt || data.compiledPrompt,
        usage: {
          promptTokens: data.usage?.promptTokens || 0,
          completionTokens: data.usage?.completionTokens || 0,
          totalTokens: data.usage?.totalTokens || 0
        },
        metadata: {
          provider: options.provider,
          model: options.model,
          duration,
          executionMode: 'remote',
          compiledLocally
        }
      }
    } catch (error) {
      const duration = Date.now() - startTime
      const message = error instanceof Error ? error.message : 'Unknown error'

      return {
        success: false,
        error: message,
        compiledPrompt,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        metadata: {
          provider: options.provider,
          model: options.model,
          duration,
          executionMode: 'remote',
          compiledLocally
        }
      }
    }
  }

  /**
   * Stream remotely (currently falls back to non-streaming)
   */
  private async streamRemotely(
    options: ExecutionOptions,
    prompt: string,
    compiledPrompt: string | undefined,
    compiledLocally: boolean
  ): Promise<ExecutionRouterResult> {
    // For now, remote streaming falls back to regular execution
    // The backend would need SSE support for true streaming
    return this.executeRemotely(options, prompt, compiledPrompt, compiledLocally)
  }

  /**
   * Check if local execution is available
   */
  isLocalExecutionAvailable(): boolean {
    return localExecutor.isElectron()
  }

  /**
   * Get available providers with their status
   */
  async getAvailableProviders() {
    return localExecutor.getAvailableProviders()
  }

  /**
   * Get models for a provider
   */
  getModelsForProvider(provider: string) {
    return localExecutor.getModelsForProvider(provider)
  }
}

// Export singleton instance
export const executionRouter = ExecutionRouterService.getInstance()

/**
 * Local LLM Client
 *
 * Executes LLM requests locally using API keys from ~/.prompd/config.yaml
 * Replaces DefaultLLMClient for local-first chat execution
 */

import type {
  IPrompdLLMClient,
  PrompdLLMRequest,
  PrompdLLMResponse,
  LLMProvider
} from '@prompd/react'
import { localExecutor } from './localExecutor'
import { configService } from './configService'
import { useUIStore } from '../../stores/uiStore'

export interface LocalLLMClientConfig {
  provider?: LLMProvider
  model?: string
  getAuthToken?: () => Promise<string | null> // For compatibility
}

/**
 * Local implementation of IPrompdLLMClient
 * Routes requests through local provider infrastructure instead of backend API
 */
export class LocalLLMClient implements IPrompdLLMClient {
  private provider: LLMProvider
  private model: string

  constructor(config: LocalLLMClientConfig = {}) {
    this.provider = config.provider || 'openai'
    this.model = config.model || 'gpt-4o-mini'
  }

  async send(request: PrompdLLMRequest): Promise<PrompdLLMResponse> {
    const provider = request.provider || this.provider
    const model = request.model || this.model

    try {
      // Check if we can execute locally
      const canExecute = await localExecutor.canExecuteLocally(provider)
      if (!canExecute) {
        throw new Error(`Provider ${provider} not configured locally. Add API key in Settings.`)
      }

      // Get API key from config
      const apiKey = await configService.getApiKey(provider)
      if (!apiKey) {
        throw new Error(`${provider} API key not found in local config`)
      }

      // Convert messages to prompt format
      const prompt = this.messagesToPrompt(request.messages)
      const systemPrompt = this.extractSystemPrompt(request.messages)

      // Check if selected model supports image generation
      const providersWithPricing = useUIStore.getState().llmProvider.providersWithPricing
      const providerData = providersWithPricing?.find(p => p.providerId === provider)
      const modelData = providerData?.models.find(m => m.model === model)
      const enableImageGeneration = modelData?.supportsImageGeneration === true

      // Only pass thinking mode if the model supports it
      const supportsThinking = modelData?.supportsThinking === true
      const effectiveMode = (request.mode === 'thinking' && !supportsThinking)
        ? 'default'
        : request.mode as 'default' | 'thinking' | 'json' | undefined

      const execOptions = {
        provider,
        model,
        prompt,
        systemPrompt,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        enableImageGeneration,
        mode: effectiveMode
      }

      // If onChunk callback is provided, use streaming execution
      if (request.onChunk) {
        return await this.sendStreaming(request.onChunk, execOptions, provider, model)
      }

      // Non-streaming path
      const result = await localExecutor.execute({ ...execOptions, stream: false })

      if (!result.success) {
        throw new Error(result.error || 'Execution failed')
      }

      return {
        content: result.response || '',
        thinking: result.thinking,
        provider,
        model,
        usage: result.usage,
        metadata: {
          executionMode: 'local',
          duration: result.metadata.duration,
          ...(result.thinking ? { thinking: result.thinking } : {})
        }
      }
    } catch (error) {
      console.error('[LocalLLMClient] Execution failed:', error)
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Failed to execute LLM request locally'
      )
    }
  }

  /**
   * Streaming execution — calls localExecutor.stream() and delivers chunks via onChunk
   */
  private async sendStreaming(
    onChunk: (chunk: { content?: string; thinking?: string; done: boolean }) => void,
    execOptions: Record<string, unknown>,
    provider: string,
    model: string
  ): Promise<PrompdLLMResponse> {
    let fullContent = ''
    let fullThinking = ''
    let finalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    const startTime = Date.now()

    const generator = localExecutor.stream({ ...execOptions, stream: true } as Parameters<typeof localExecutor.stream>[0])

    for await (const chunk of generator) {
      // Access thinking field (exists at runtime on Anthropic chunks but not in StreamChunk type)
      const chunkAny = chunk as unknown as { content: string; thinking?: string; done: boolean; usage?: typeof finalUsage }
      if (chunkAny.content) fullContent += chunkAny.content
      if (chunkAny.thinking) fullThinking += chunkAny.thinking
      if (chunkAny.usage) finalUsage = chunkAny.usage

      const thinkingDelta = chunkAny.thinking
      onChunk({
        content: chunk.content || undefined,
        thinking: thinkingDelta || undefined,
        done: chunk.done
      })
    }

    onChunk({ done: true })

    const duration = Date.now() - startTime

    return {
      content: fullContent,
      thinking: fullThinking || undefined,
      provider,
      model,
      usage: finalUsage,
      metadata: {
        executionMode: 'local',
        duration,
        ...(fullThinking ? { thinking: fullThinking } : {})
      }
    }
  }

  /**
   * Convert OpenAI-style messages to single prompt string
   */
  private messagesToPrompt(messages: Array<{ role: string; content: string }>): string {
    // Filter out system messages (handled separately)
    const nonSystemMessages = messages.filter(m => m.role !== 'system')

    // Format as conversation
    return nonSystemMessages
      .map(m => {
        const role = m.role === 'user' ? 'Human' : 'Assistant'
        return `${role}: ${m.content}`
      })
      .join('\n\n')
  }

  /**
   * Extract system prompt from messages
   * Combines all system messages (agent prompt + context) into one
   */
  private extractSystemPrompt(messages: Array<{ role: string; content: string }>): string | undefined {
    const systemMessages = messages.filter(m => m.role === 'system')
    if (systemMessages.length === 0) return undefined

    // Combine all system messages with double newline separator
    return systemMessages.map(m => m.content).join('\n\n')
  }

  /**
   * Update configuration
   */
  configure(config: Partial<LocalLLMClientConfig>): void {
    if (config.provider) this.provider = config.provider
    if (config.model) this.model = config.model
  }

  /**
   * Get current configuration
   */
  getConfig(): LocalLLMClientConfig {
    return {
      provider: this.provider,
      model: this.model
    }
  }

  /**
   * Check if local execution is available for a provider
   */
  static async canExecuteLocally(provider: string): Promise<boolean> {
    return localExecutor.canExecuteLocally(provider)
  }
}

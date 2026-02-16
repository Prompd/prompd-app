/**
 * Base Provider Class
 *
 * Abstract base class that handles common logic for all providers.
 * Providers can extend this and override specific methods as needed.
 */

import type {
  IExecutionProvider,
  ExecutionRequest,
  ExecutionResult,
  StreamChunk,
  ModelInfo,
  TokenUsage,
  ProviderEntry
} from './types'
import { electronFetch } from '../electronFetch'

/**
 * Abstract base class for LLM providers
 */
export abstract class BaseProvider implements IExecutionProvider {
  abstract readonly name: string
  abstract readonly displayName: string
  abstract readonly baseUrl: string

  protected config: ProviderEntry

  constructor(config: ProviderEntry) {
    this.config = config
  }

  /**
   * Execute a prompt - must be implemented by subclasses
   */
  abstract execute(request: ExecutionRequest): Promise<ExecutionResult>

  /**
   * Stream a response - must be implemented by subclasses
   */
  abstract stream(request: ExecutionRequest): AsyncGenerator<StreamChunk, void, unknown>

  /**
   * List available models from config
   */
  listModels(): ModelInfo[] {
    return this.config.models || []
  }

  /**
   * Helper to create a standard error result
   */
  protected createErrorResult(error: string, duration: number): ExecutionResult {
    return {
      success: false,
      error,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      duration
    }
  }

  /**
   * Helper to create a success result
   */
  protected createSuccessResult(
    response: string,
    usage: TokenUsage,
    duration: number
  ): ExecutionResult {
    return {
      success: true,
      response,
      usage,
      duration
    }
  }
}

/**
 * OpenAI-compatible provider base class
 *
 * Many providers (Groq, Mistral, Together, Perplexity, DeepSeek, Ollama)
 * use the OpenAI chat completions API format. This class handles all of them.
 */
export class OpenAICompatibleProvider extends BaseProvider {
  readonly name: string
  readonly displayName: string
  readonly baseUrl: string

  constructor(config: ProviderEntry, baseUrlOverride?: string) {
    super(config)
    this.name = config.name
    this.displayName = config.displayName
    this.baseUrl = baseUrlOverride || config.baseUrl
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const startTime = Date.now()

    try {
      // Use the Responses API for image generation (OpenAI only, not other compatible providers)
      if (request.enableImageGeneration && this.name === 'openai') {
        return await this.executeWithResponses(request, startTime)
      }

      const messages: Array<{ role: string; content: string }> = []

      // For JSON mode, ensure "json" appears in the system prompt (OpenAI requirement)
      const systemPrompt = request.mode === 'json'
        ? (request.systemPrompt ? `${request.systemPrompt}\n\nRespond with valid JSON.` : 'Respond with valid JSON.')
        : request.systemPrompt

      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt })
      }
      messages.push({ role: 'user', content: request.prompt })

      const body: Record<string, unknown> = {
        model: request.model,
        messages,
        stream: false
      }

      if (request.maxTokens) {
        body.max_tokens = request.maxTokens
      }
      if (request.temperature !== undefined) {
        body.temperature = request.temperature
      }

      // JSON mode - request structured JSON output
      if (request.mode === 'json') {
        body.response_format = { type: 'json_object' }
      }

      const response = await electronFetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${request.apiKey}`
        },
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`
        return this.createErrorResult(errorMessage, Date.now() - startTime)
      }

      const data = await response.json()
      const duration = Date.now() - startTime

      // Handle both string responses and multimodal content arrays
      // Models like GPT-4o can return image content blocks alongside text
      let content = ''
      const messageContent = data.choices?.[0]?.message?.content
      if (typeof messageContent === 'string') {
        content = messageContent
      } else if (Array.isArray(messageContent)) {
        for (const block of messageContent) {
          if (block.type === 'text') {
            content += block.text || ''
          } else if (block.type === 'image_url' && block.image_url?.url) {
            content += `\n\n![generated image](${block.image_url.url})\n\n`
          }
        }
      }

      const usage: TokenUsage = {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0
      }

      return this.createSuccessResult(content, usage, duration)
    } catch (error) {
      const duration = Date.now() - startTime
      const message = error instanceof Error ? error.message : 'Unknown error'
      return this.createErrorResult(message, duration)
    }
  }

  async *stream(request: ExecutionRequest): AsyncGenerator<StreamChunk, void, unknown> {
    const messages: Array<{ role: string; content: string }> = []

    // For JSON mode, ensure "json" appears in the system prompt (OpenAI requirement)
    const systemPrompt = request.mode === 'json'
      ? (request.systemPrompt ? `${request.systemPrompt}\n\nRespond with valid JSON.` : 'Respond with valid JSON.')
      : request.systemPrompt

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt })
    }
    messages.push({ role: 'user', content: request.prompt })

    const body: Record<string, unknown> = {
      model: request.model,
      messages,
      stream: true
    }

    if (request.maxTokens) {
      body.max_tokens = request.maxTokens
    }
    if (request.temperature !== undefined) {
      body.temperature = request.temperature
    }

    // JSON mode - request structured JSON output
    if (request.mode === 'json') {
      body.response_format = { type: 'json_object' }
    }

    const response = await electronFetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${request.apiKey}`
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`
      yield { content: '', done: true, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } }
      throw new Error(errorMessage)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body')
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let totalUsage: TokenUsage | undefined

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed === 'data: [DONE]') continue
          if (!trimmed.startsWith('data: ')) continue

          try {
            const json = JSON.parse(trimmed.slice(6))
            const delta = json.choices?.[0]?.delta?.content || ''

            // Capture usage if present (some providers send on last chunk)
            if (json.usage) {
              totalUsage = {
                promptTokens: json.usage.prompt_tokens || 0,
                completionTokens: json.usage.completion_tokens || 0,
                totalTokens: json.usage.total_tokens || 0
              }
            }

            if (delta) {
              yield { content: delta, done: false }
            }
          } catch {
            // Skip invalid JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    yield { content: '', done: true, usage: totalUsage }
  }

  /**
   * Execute using OpenAI's Responses API for image generation
   * Uses POST /v1/responses with tools: [{"type": "image_generation"}]
   */
  private async executeWithResponses(request: ExecutionRequest, startTime: number): Promise<ExecutionResult> {
    const input: Array<Record<string, unknown>> = []

    if (request.systemPrompt) {
      input.push({ role: 'developer', content: request.systemPrompt })
    }
    input.push({ role: 'user', content: request.prompt })

    const body: Record<string, unknown> = {
      model: request.model,
      input,
      tools: [{ type: 'image_generation' }]
    }

    if (request.maxTokens) {
      body.max_output_tokens = request.maxTokens
    }
    if (request.temperature !== undefined) {
      body.temperature = request.temperature
    }

    const response = await electronFetch(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${request.apiKey}`
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`
      return this.createErrorResult(errorMessage, Date.now() - startTime)
    }

    const data = await response.json()
    const duration = Date.now() - startTime

    // Parse the Responses API output format
    // Output is an array of items: message (text), image_generation_call (images)
    let content = ''
    const outputItems = data.output || []
    for (const item of outputItems) {
      if (item.type === 'message') {
        // Text content from the model
        const parts = item.content || []
        for (const part of parts) {
          if (part.type === 'output_text') {
            content += part.text || ''
          }
        }
      } else if (item.type === 'image_generation_call' && item.result) {
        // Base64 image data from image generation
        content += `\n\n![generated image](data:image/png;base64,${item.result})\n\n`
      }
    }

    const usage: TokenUsage = {
      promptTokens: data.usage?.input_tokens || 0,
      completionTokens: data.usage?.output_tokens || 0,
      totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
    }

    return this.createSuccessResult(content, usage, duration)
  }
}

/**
 * Anthropic provider using the Messages API
 */
export class AnthropicProvider extends BaseProvider {
  readonly name = 'anthropic'
  readonly displayName = 'Anthropic'
  readonly baseUrl = 'https://api.anthropic.com'

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const startTime = Date.now()

    try {
      const messages: Array<{ role: string; content: string }> = [
        { role: 'user', content: request.prompt }
      ]

      // For thinking mode, ensure minimum 1024 tokens for both max_tokens and budget
      const isThinking = request.mode === 'thinking'
      const maxTokens = isThinking
        ? Math.max(1024, request.maxTokens || 4096)
        : (request.maxTokens || 4096)

      const body: Record<string, unknown> = {
        model: request.model,
        max_tokens: maxTokens,
        messages
      }

      if (request.systemPrompt) {
        body.system = request.systemPrompt
      }
      if (request.temperature !== undefined) {
        body.temperature = request.temperature
      }

      // Extended thinking mode - uses budget_tokens (minimum 1024)
      if (isThinking) {
        body.thinking = { type: 'enabled', budget_tokens: maxTokens }
      }

      const response = await electronFetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': request.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`
        return this.createErrorResult(errorMessage, Date.now() - startTime)
      }

      const data = await response.json()
      const duration = Date.now() - startTime

      // Anthropic returns content as an array of blocks
      // With thinking mode, there may be thinking blocks followed by text blocks
      // Image blocks (from multimodal responses) are converted to markdown syntax
      let content = ''
      if (data.content && Array.isArray(data.content)) {
        for (const block of data.content) {
          if (block.type === 'text') {
            content += block.text || ''
          } else if (block.type === 'thinking') {
            // Include thinking content (summarized in Claude 4)
            content += block.thinking || ''
          } else if (block.type === 'image' && block.source?.data) {
            const mimeType = block.source.media_type || 'image/png'
            content += `\n\n![generated image](data:${mimeType};base64,${block.source.data})\n\n`
          }
        }
      }
      const usage: TokenUsage = {
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
      }

      return this.createSuccessResult(content, usage, duration)
    } catch (error) {
      const duration = Date.now() - startTime
      const message = error instanceof Error ? error.message : 'Unknown error'
      return this.createErrorResult(message, duration)
    }
  }

  async *stream(request: ExecutionRequest): AsyncGenerator<StreamChunk, void, unknown> {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'user', content: request.prompt }
    ]

    // For thinking mode, ensure minimum 1024 tokens for both max_tokens and budget
    const isThinking = request.mode === 'thinking'
    const maxTokens = isThinking
      ? Math.max(1024, request.maxTokens || 4096)
      : (request.maxTokens || 4096)

    const body: Record<string, unknown> = {
      model: request.model,
      max_tokens: maxTokens,
      messages,
      stream: true
    }

    if (request.systemPrompt) {
      body.system = request.systemPrompt
    }
    if (request.temperature !== undefined) {
      body.temperature = request.temperature
    }

    // Extended thinking mode - uses budget_tokens (minimum 1024)
    if (isThinking) {
      body.thinking = { type: 'enabled', budget_tokens: maxTokens }
    }

    const response = await electronFetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': request.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`
      throw new Error(errorMessage)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body')
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let totalUsage: TokenUsage | undefined

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data: ')) continue

          try {
            const json = JSON.parse(trimmed.slice(6))

            if (json.type === 'message_start' && json.message?.usage) {
              // Capture input tokens from message_start (comes first)
              totalUsage = {
                promptTokens: json.message.usage.input_tokens || 0,
                completionTokens: 0,
                totalTokens: json.message.usage.input_tokens || 0
              }
            } else if (json.type === 'content_block_delta') {
              // Handle both regular text and thinking text deltas
              const delta = json.delta?.text || json.delta?.thinking || ''
              if (delta) {
                yield { content: delta, done: false }
              }
            } else if (json.type === 'message_delta' && json.usage) {
              // Update with output tokens (comes at end)
              const outputTokens = json.usage.output_tokens || 0
              if (totalUsage) {
                totalUsage.completionTokens = outputTokens
                totalUsage.totalTokens = totalUsage.promptTokens + outputTokens
              } else {
                totalUsage = {
                  promptTokens: 0,
                  completionTokens: outputTokens,
                  totalTokens: outputTokens
                }
              }
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    yield { content: '', done: true, usage: totalUsage }
  }
}

/**
 * Google Gemini provider using the Generative Language API
 */
export class GoogleGeminiProvider extends BaseProvider {
  readonly name = 'google'
  readonly displayName = 'Google Gemini'
  readonly baseUrl = 'https://generativelanguage.googleapis.com'

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const startTime = Date.now()

    try {
      const contents = [
        {
          parts: [{ text: request.prompt }]
        }
      ]

      const body: Record<string, unknown> = {
        contents
      }

      if (request.systemPrompt) {
        body.systemInstruction = { parts: [{ text: request.systemPrompt }] }
      }

      const generationConfig: Record<string, unknown> = {}
      if (request.maxTokens) {
        generationConfig.maxOutputTokens = request.maxTokens
      }
      if (request.temperature !== undefined) {
        generationConfig.temperature = request.temperature
      }
      // Enable image output modality for models that support it
      if (request.enableImageGeneration) {
        generationConfig.responseModalities = ['TEXT', 'IMAGE']
      }
      if (Object.keys(generationConfig).length > 0) {
        body.generationConfig = generationConfig
      }

      const url = `${this.baseUrl}/v1beta/models/${request.model}:generateContent?key=${request.apiKey}`

      const response = await electronFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`
        return this.createErrorResult(errorMessage, Date.now() - startTime)
      }

      const data = await response.json()
      const duration = Date.now() - startTime

      // Extract text and images from candidates
      // Gemini returns content as parts array which can contain text and inline_data
      let content = ''
      const parts = data.candidates?.[0]?.content?.parts || []
      for (const part of parts) {
        if (part.text) {
          content += part.text
        } else if (part.inline_data?.data) {
          const mimeType = part.inline_data.mime_type || 'image/png'
          content += `\n\n![generated image](data:${mimeType};base64,${part.inline_data.data})\n\n`
        }
      }
      const usageMetadata = data.usageMetadata || {}
      const usage: TokenUsage = {
        promptTokens: usageMetadata.promptTokenCount || 0,
        completionTokens: usageMetadata.candidatesTokenCount || 0,
        totalTokens: usageMetadata.totalTokenCount || 0
      }

      return this.createSuccessResult(content, usage, duration)
    } catch (error) {
      const duration = Date.now() - startTime
      const message = error instanceof Error ? error.message : 'Unknown error'
      return this.createErrorResult(message, duration)
    }
  }

  async *stream(request: ExecutionRequest): AsyncGenerator<StreamChunk, void, unknown> {
    const contents = [
      {
        parts: [{ text: request.prompt }]
      }
    ]

    const body: Record<string, unknown> = {
      contents
    }

    if (request.systemPrompt) {
      body.systemInstruction = { parts: [{ text: request.systemPrompt }] }
    }

    const generationConfig: Record<string, unknown> = {}
    if (request.maxTokens) {
      generationConfig.maxOutputTokens = request.maxTokens
    }
    if (request.temperature !== undefined) {
      generationConfig.temperature = request.temperature
    }
    // Enable image output modality for models that support it
    if (request.enableImageGeneration) {
      generationConfig.responseModalities = ['TEXT', 'IMAGE']
    }
    if (Object.keys(generationConfig).length > 0) {
      body.generationConfig = generationConfig
    }

    const url = `${this.baseUrl}/v1beta/models/${request.model}:streamGenerateContent?alt=sse&key=${request.apiKey}`

    const response = await electronFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`
      throw new Error(errorMessage)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body')
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let totalUsage: TokenUsage | undefined

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data: ')) continue

          try {
            const json = JSON.parse(trimmed.slice(6))
            // Handle both text and image parts in streamed chunks
            const parts = json.candidates?.[0]?.content?.parts || []
            let chunkContent = ''
            for (const part of parts) {
              if (part.text) {
                chunkContent += part.text
              } else if (part.inline_data?.data) {
                const mimeType = part.inline_data.mime_type || 'image/png'
                chunkContent += `\n\n![generated image](data:${mimeType};base64,${part.inline_data.data})\n\n`
              }
            }

            if (json.usageMetadata) {
              totalUsage = {
                promptTokens: json.usageMetadata.promptTokenCount || 0,
                completionTokens: json.usageMetadata.candidatesTokenCount || 0,
                totalTokens: json.usageMetadata.totalTokenCount || 0
              }
            }

            if (chunkContent) {
              yield { content: chunkContent, done: false }
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    yield { content: '', done: true, usage: totalUsage }
  }
}

/**
 * Cohere provider using the Chat API
 */
export class CohereProvider extends BaseProvider {
  readonly name = 'cohere'
  readonly displayName = 'Cohere'
  readonly baseUrl = 'https://api.cohere.ai'

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const startTime = Date.now()

    try {
      const body: Record<string, unknown> = {
        model: request.model,
        message: request.prompt
      }

      if (request.systemPrompt) {
        body.preamble = request.systemPrompt
      }
      if (request.maxTokens) {
        body.max_tokens = request.maxTokens
      }
      if (request.temperature !== undefined) {
        body.temperature = request.temperature
      }

      const response = await electronFetch(`${this.baseUrl}/v1/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${request.apiKey}`
        },
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.message || `HTTP ${response.status}: ${response.statusText}`
        return this.createErrorResult(errorMessage, Date.now() - startTime)
      }

      const data = await response.json()
      const duration = Date.now() - startTime

      const content = data.text || ''
      const tokens = data.meta?.tokens || {}
      const usage: TokenUsage = {
        promptTokens: tokens.input_tokens || 0,
        completionTokens: tokens.output_tokens || 0,
        totalTokens: (tokens.input_tokens || 0) + (tokens.output_tokens || 0)
      }

      return this.createSuccessResult(content, usage, duration)
    } catch (error) {
      const duration = Date.now() - startTime
      const message = error instanceof Error ? error.message : 'Unknown error'
      return this.createErrorResult(message, duration)
    }
  }

  async *stream(request: ExecutionRequest): AsyncGenerator<StreamChunk, void, unknown> {
    const body: Record<string, unknown> = {
      model: request.model,
      message: request.prompt,
      stream: true
    }

    if (request.systemPrompt) {
      body.preamble = request.systemPrompt
    }
    if (request.maxTokens) {
      body.max_tokens = request.maxTokens
    }
    if (request.temperature !== undefined) {
      body.temperature = request.temperature
    }

    const response = await electronFetch(`${this.baseUrl}/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${request.apiKey}`
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData.message || `HTTP ${response.status}: ${response.statusText}`
      throw new Error(errorMessage)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body')
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let totalUsage: TokenUsage | undefined

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          try {
            const json = JSON.parse(trimmed)

            if (json.event_type === 'text-generation') {
              const text = json.text || ''
              if (text) {
                yield { content: text, done: false }
              }
            } else if (json.event_type === 'stream-end' && json.response?.meta?.tokens) {
              const tokens = json.response.meta.tokens
              totalUsage = {
                promptTokens: tokens.input_tokens || 0,
                completionTokens: tokens.output_tokens || 0,
                totalTokens: (tokens.input_tokens || 0) + (tokens.output_tokens || 0)
              }
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    yield { content: '', done: true, usage: totalUsage }
  }
}

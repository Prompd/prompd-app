import type {
  IPrompdLLMClient,
  PrompdLLMRequest,
  PrompdLLMResponse,
  LLMProvider
} from '../types'

export interface DefaultLLMClientConfig {
  apiBaseUrl?: string
  provider?: LLMProvider
  model?: string
  getAuthToken?: () => Promise<string | null> // Function to get auth token
}

/**
 * Default implementation of IPrompdLLMClient
 * Routes requests through the prmd.ai backend API
 */
export class DefaultLLMClient implements IPrompdLLMClient {
  private apiBaseUrl: string
  private provider: LLMProvider
  private model: string
  private getAuthToken?: () => Promise<string | null>

  constructor(config: DefaultLLMClientConfig = {}) {
    this.apiBaseUrl = config.apiBaseUrl || 'http://localhost:4050'
    this.provider = config.provider || 'openai'
    this.model = config.model || 'gpt-4o-mini'
    this.getAuthToken = config.getAuthToken
  }

  async send(request: PrompdLLMRequest): Promise<PrompdLLMResponse> {
    const provider = request.provider || this.provider
    const model = request.model || this.model

    try {
      // Build headers with optional authentication
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }

      // Add auth token if available
      if (this.getAuthToken) {
        try {
          const token = await this.getAuthToken()
          if (token) {
            headers['Authorization'] = `Bearer ${token}`
            console.log('[DefaultLLMClient] Authorization header set:', !!headers['Authorization'])
          } else {
            console.warn('[DefaultLLMClient] getAuthToken returned null/undefined')
          }
        } catch (error) {
          console.warn('Failed to get auth token:', error)
        }
      } else {
        console.warn('[DefaultLLMClient] No getAuthToken function provided')
      }

      console.log('[DefaultLLMClient] Request headers:', Object.keys(headers))

      const response = await fetch(`${this.apiBaseUrl}/api/chat/message`, {
        method: 'POST',
        headers,
        credentials: 'include', // Include credentials for cross-origin requests
        signal: request.signal,
        body: JSON.stringify({
          messages: request.messages,
          provider,
          model,
          temperature: request.temperature,
          maxTokens: request.maxTokens
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorData: any = {}
        try {
          errorData = JSON.parse(errorText)
        } catch {
          // Not JSON, use text as error
        }
        throw new Error(errorData.error || errorText || `HTTP ${response.status}: ${response.statusText}`)
      }

      // Handle Server-Sent Events (SSE) response
      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        return this.handleSSE(response, provider, model)
      }

      // Handle regular JSON response
      const data = await response.json()

      return {
        content: data.message.content,
        provider: data.message.metadata?.provider || provider,
        model: data.message.metadata?.model || model,
        usage: data.message.metadata?.usage,
        metadata: data.message.metadata
      }
    } catch (error) {
      console.error('LLM request failed:', error)
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Failed to send LLM request'
      )
    }
  }

  /**
   * Handle Server-Sent Events (SSE) streaming response
   */
  private async handleSSE(response: Response, provider: LLMProvider, model: string): Promise<PrompdLLMResponse> {
    if (!response.body) {
      throw new Error('No response body')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let fullContent = ''
    let metadata: any = {}
    let buffer = '' // Buffer for incomplete lines
    let streamError: Error | null = null

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // Append to buffer and process complete lines
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')

        // Keep the last incomplete line in the buffer
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()

            if (data === '[DONE]') {
              break
            }

            try {
              const json = JSON.parse(data)

              if (json.type === 'error') {
                // Store the error but let the stream finish so we can release the reader properly
                const errorMessage = this.parseErrorMessage(json.error)
                streamError = new Error(errorMessage)
              }

              if (json.type === 'content' && json.content) {
                fullContent += json.content
              }

              // Capture metadata from 'done' events (contains usage info)
              if (json.type === 'done' && json.metadata) {
                metadata = json.metadata
              }

              // Also capture metadata if present in any event (backwards compatibility)
              if (json.metadata && !metadata.usage) {
                metadata = json.metadata
              }
            } catch (e) {
              // Skip malformed JSON (this only catches JSON.parse errors)
              if (e instanceof SyntaxError) {
                console.warn('Failed to parse SSE data:', e)
              }
            }
          }
        }
      }

      // Process any remaining data in the buffer
      if (buffer.startsWith('data: ')) {
        const data = buffer.slice(6).trim()
        if (data && data !== '[DONE]') {
          try {
            const json = JSON.parse(data)
            if (json.type === 'error') {
              const errorMessage = this.parseErrorMessage(json.error)
              streamError = new Error(errorMessage)
            } else if (json.type === 'done' && json.metadata) {
              metadata = json.metadata
            } else if (json.metadata && !metadata.usage) {
              metadata = json.metadata
            }
          } catch (e) {
            // Ignore incomplete JSON
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    // If we encountered an error during streaming, throw it now
    if (streamError) {
      throw streamError
    }

    return {
      content: fullContent,
      provider: metadata.provider || provider,
      model: metadata.model || model,
      usage: metadata.usage,
      metadata
    }
  }

  /**
   * Parse API error messages into user-friendly format
   */
  private parseErrorMessage(error: string): string {
    if (!error) return 'An unknown error occurred'

    // Handle quota/rate limit errors
    if (error.includes('429') || error.includes('quota') || error.includes('RESOURCE_EXHAUSTED')) {
      const retryMatch = error.match(/retry in (\d+(?:\.\d+)?s?)/i)
      const retryInfo = retryMatch ? ` Try again in ${retryMatch[1]}.` : ' Please try again in a minute.'

      if (error.includes('free_tier')) {
        return `API rate limit exceeded (free tier).${retryInfo} Consider upgrading your plan or switching to a different provider.`
      }
      return `API rate limit exceeded.${retryInfo}`
    }

    // Handle authentication errors
    if (error.includes('401') || error.includes('Unauthorized') || error.includes('API key')) {
      return 'Authentication failed. Please check your API key in Settings.'
    }

    // Handle missing API key errors
    if (error.includes('not configured')) {
      const providerMatch = error.match(/Server (\w+) API key not configured/i)
      const provider = providerMatch ? providerMatch[1] : 'Provider'
      return `${provider} API key not configured. Add your API key in Settings or switch to a different provider.`
    }

    // Handle network errors
    if (error.includes('fetch') || error.includes('network') || error.includes('ECONNREFUSED')) {
      return 'Network error. Please check your internet connection and try again.'
    }

    // Handle model not found
    if (error.includes('model') && (error.includes('not found') || error.includes('does not exist'))) {
      return 'Model not available. Please select a different model.'
    }

    // Handle context length exceeded
    if (error.includes('context') || error.includes('token limit') || error.includes('too long')) {
      return 'Message too long. Try shortening your request or starting a new conversation.'
    }

    // Extract clean message from JSON if present
    try {
      const jsonMatch = error.match(/"message":\s*"([^"]+)"/)
      if (jsonMatch) {
        return jsonMatch[1]
      }
    } catch {
      // Ignore parsing errors
    }

    // Truncate very long errors
    if (error.length > 200) {
      const firstSentence = error.match(/^[^.!?]+[.!?]/)
      if (firstSentence) {
        return firstSentence[0]
      }
      return error.substring(0, 150) + '...'
    }

    return error
  }

  /**
   * Update configuration
   */
  configure(config: Partial<DefaultLLMClientConfig>): void {
    if (config.apiBaseUrl) this.apiBaseUrl = config.apiBaseUrl
    if (config.provider) this.provider = config.provider
    if (config.model) this.model = config.model
  }

  /**
   * Get current configuration
   */
  getConfig(): DefaultLLMClientConfig {
    return {
      apiBaseUrl: this.apiBaseUrl,
      provider: this.provider,
      model: this.model
    }
  }
}

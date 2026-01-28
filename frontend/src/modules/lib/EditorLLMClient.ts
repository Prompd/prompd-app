import type {
  IPrompdLLMClient,
  PrompdLLMRequest,
  PrompdLLMResponse,
  LLMUsage
} from '@prompd/react'

/**
 * SSE stream result containing content and metadata
 */
interface SSEStreamResult {
  content: string
  usage?: LLMUsage
  duration?: number
  estimatedCost?: number
}

/**
 * Custom LLM Client for Prompd Backend
 * Routes chat requests through /api/chat/message endpoint with streaming SSE
 * Maintains full conversation history for proper multi-turn conversations
 */
export class EditorLLMClient implements IPrompdLLMClient {
  private apiBaseUrl: string
  private getToken: () => Promise<string | null>

  constructor(apiBaseUrl: string, getToken: () => Promise<string | null>) {
    this.apiBaseUrl = apiBaseUrl
    this.getToken = getToken
  }

  async send(request: PrompdLLMRequest): Promise<PrompdLLMResponse> {
    const provider = request.provider || 'anthropic'
    const model = request.model || 'claude-sonnet-4-20250514'

    try {
      // Get auth token
      const token = await this.getToken()
      if (!token) {
        throw new Error('Authentication required')
      }

      // Call chat endpoint with full message history (streaming SSE)
      const response = await fetch(`${this.apiBaseUrl}/api/chat/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          messages: request.messages,
          provider,
          model,
          temperature: 0.7,
          maxTokens: 4000
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }

      // Parse SSE stream response (includes usage data from 'done' event)
      const result = await this.parseSSEStream(response)

      return {
        content: result.content,
        provider,
        model,
        usage: result.usage,
        metadata: {
          streaming: true,
          duration: result.duration,
          estimatedCost: result.estimatedCost
        }
      }
    } catch (error) {
      console.error('LLM chat request failed:', error)
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Failed to send LLM request'
      )
    }
  }

  /**
   * Parse Server-Sent Events stream and accumulate content
   * Captures both content chunks and the final 'done' event with usage data
   */
  private async parseSSEStream(response: Response): Promise<SSEStreamResult> {
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body')
    }

    const decoder = new TextDecoder()
    let content = ''
    let usage: LLMUsage | undefined
    let duration: number | undefined
    let estimatedCost: number | undefined
    let streamError: Error | null = null

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (data === '[DONE]') {
              continue
            }

            try {
              const parsed = JSON.parse(data)

              if (parsed.type === 'content' && parsed.content) {
                // Accumulate content chunks
                content += parsed.content
              } else if (parsed.type === 'done' && parsed.metadata) {
                // Capture usage data from the 'done' event
                // Backend sends: metadata.usage = { promptTokens, completionTokens, totalTokens }
                if (parsed.metadata.usage) {
                  usage = {
                    promptTokens: parsed.metadata.usage.promptTokens || 0,
                    completionTokens: parsed.metadata.usage.completionTokens || 0,
                    totalTokens: parsed.metadata.usage.totalTokens || 0
                  }
                }
                duration = parsed.metadata.duration
                estimatedCost = parsed.metadata.estimatedCost

                console.log('[EditorLLMClient] Captured usage from done event:', usage)
              } else if (parsed.type === 'error') {
                // Parse user-friendly error message from API errors
                const errorMessage = this.parseErrorMessage(parsed.error)
                streamError = new Error(errorMessage)
                // Don't break - let the stream finish so we can release the reader properly
              }
            } catch (parseError) {
              // Skip non-JSON lines (this only catches JSON.parse errors, not our thrown errors)
            }
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
      content,
      usage,
      duration,
      estimatedCost
    }
  }

  /**
   * Parse API error messages into user-friendly format
   */
  private parseErrorMessage(error: string): string {
    if (!error) return 'An unknown error occurred'

    // Handle Google API quota errors
    if (error.includes('429') || error.includes('quota') || error.includes('RESOURCE_EXHAUSTED')) {
      // Extract retry delay if present
      const retryMatch = error.match(/retry in (\d+(?:\.\d+)?s?)/i)
      const retryInfo = retryMatch ? ` Try again in ${retryMatch[1]}.` : ' Please try again in a minute.'

      if (error.includes('free_tier')) {
        return `Google API rate limit exceeded (free tier).${retryInfo} Consider upgrading your Google AI plan or switching to a different provider.`
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

    // For other errors, try to extract a clean message
    // Remove JSON wrapper if present
    try {
      const jsonMatch = error.match(/"message":\s*"([^"]+)"/)
      if (jsonMatch) {
        return jsonMatch[1]
      }
    } catch {
      // Ignore parsing errors
    }

    // If the error is very long (like full JSON), truncate it
    if (error.length > 200) {
      // Try to get first meaningful sentence
      const firstSentence = error.match(/^[^.!?]+[.!?]/)
      if (firstSentence) {
        return firstSentence[0]
      }
      return error.substring(0, 150) + '...'
    }

    return error
  }
}

/**
 * Conversational AI API client with streaming support
 */
import { getApiBaseUrl } from './apiConfig'

// getApiBaseUrl() returns URL with /api suffix (e.g., '/api' or 'http://localhost:3010/api')
// So we use it directly without adding /api again

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface StreamEvent {
  type: 'conversation_id' | 'content' | 'done' | 'error'
  conversationId?: string
  content?: string
  hasGeneratedPrompd?: boolean
  fullResponse?: string
  error?: string
  metadata?: {
    provider: string
    model: string
    duration: number
    tokensUsed?: {
      input: number
      output: number
      total: number
    }
    estimatedCost?: number
  }
}

export interface ConversationOptions {
  provider?: 'anthropic' | 'openai'
  model?: string
  temperature?: number
  maxTokens?: number
}

/**
 * Stream a conversational AI response
 * @param message User's message
 * @param conversationId Optional conversation ID to continue
 * @param getToken Function to get auth token
 * @param options Generation options
 * @param onEvent Callback for each stream event
 */
export async function streamConversation(
  message: string,
  conversationId: string | null,
  getToken: () => Promise<string>,
  options: ConversationOptions,
  onEvent: (event: StreamEvent) => void
): Promise<void> {
  try {
    const token = await getToken()

    const response = await fetch(`${getApiBaseUrl()}/ai/chat`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message,
        conversationId,
        provider: options.provider || 'anthropic',
        model: options.model,
        temperature: options.temperature || 0.7,
        maxTokens: options.maxTokens || 4000
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`)
    }

    if (!response.body) {
      throw new Error('Response body is null')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()

          if (data === '[DONE]') {
            continue
          }

          try {
            const event: StreamEvent = JSON.parse(data)
            onEvent(event)
          } catch (parseError) {
            console.warn('Failed to parse SSE data:', data, parseError)
          }
        }
      }
    }
  } catch (error) {
    console.error('Stream conversation error:', error)
    onEvent({
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

/**
 * Get conversation history
 */
export async function getConversationHistory(
  conversationId: string,
  getToken: () => Promise<string>
): Promise<Message[]> {
  try {
    const token = await getToken()

    const response = await fetch(`${getApiBaseUrl()}/ai/chat/history/${conversationId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to get history: ${response.status}`)
    }

    const result = await response.json()
    return result.success ? result.data.messages : []
  } catch (error) {
    console.error('Get conversation history error:', error)
    return []
  }
}

/**
 * Clear conversation
 */
export async function clearConversation(
  conversationId: string,
  getToken: () => Promise<string>
): Promise<void> {
  try {
    const token = await getToken()

    await fetch(`${getApiBaseUrl()}/ai/chat/${conversationId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
  } catch (error) {
    console.error('Clear conversation error:', error)
  }
}

/**
 * Extract .prmd file from AI response with auto-fix for common LLM syntax errors
 */
export function extractPrompd(text: string): string | null {
  // Look for GENERATED_PROMPD: marker
  const marker = 'GENERATED_PROMPD:'
  const markerIndex = text.indexOf(marker)

  if (markerIndex === -1) {
    return null
  }

  // Extract everything after the marker
  let prompd = text.substring(markerIndex + marker.length).trim()

  // Remove markdown code fences if present
  prompd = prompd.replace(/^```(?:yaml|markdown|prmd)?\n?/, '')
  prompd = prompd.replace(/\n?```\s*$/, '')
  prompd = prompd.trim()

  // Auto-fix common LLM syntax errors (inline implementation to avoid async import)
  prompd = fixLLMSyntaxErrors(prompd)

  // Final check: ensure it starts with ---
  if (!prompd.startsWith('---')) {
    console.warn('[extractPrompd] Content does not start with ---, attempting fix...')
    // Last resort: prepend --- if content looks like prompd
    if (/^(id|name|parameters|version|provider|model|description)\s*:/m.test(prompd)) {
      prompd = '---\n' + prompd
      // Try to find where frontmatter ends and add closing ---
      const lines = prompd.split('\n')
      let insertAt = lines.length
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim().startsWith('# ')) {
          insertAt = i
          break
        }
      }
      if (!lines.slice(1, insertAt).some(l => l.trim() === '---')) {
        lines.splice(insertAt, 0, '---')
        prompd = lines.join('\n')
      }
    } else {
      return null
    }
  }

  return prompd
}

/**
 * Fix common LLM syntax errors in prompd content
 * - Missing frontmatter delimiters
 * - Object-format parameters instead of array format
 */
function fixLLMSyntaxErrors(text: string): string {
  let result = text.trim()

  // Check if it looks like prompd content but missing ---
  const looksLikePrompd = /^(id|name|parameters|version|provider|model|description)\s*:/m.test(result)

  // Add opening --- if missing
  if (!result.startsWith('---') && looksLikePrompd) {
    result = '---\n' + result
    console.log('[fixLLMSyntaxErrors] Added opening --- delimiter')
  }

  // Ensure closing --- exists before markdown content
  if (result.startsWith('---')) {
    const lines = result.split(/\r?\n/)
    let hasClosingDelimiter = false
    let contentStartIndex = -1

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line === '---') {
        hasClosingDelimiter = true
        break
      }
      if (line.startsWith('# ')) {
        contentStartIndex = i
        break
      }
    }

    // Add closing --- before markdown content if missing
    if (!hasClosingDelimiter && contentStartIndex > 0) {
      lines.splice(contentStartIndex, 0, '---')
      result = lines.join('\n')
      console.log('[fixLLMSyntaxErrors] Added closing --- delimiter')
    }
  }

  // Fix object-format parameters to array format
  // Handles both pure object format AND mixed format (first param object, rest array)
  const lines = result.split('\n')
  const paramsLineIdx = lines.findIndex(l => l.match(/^\s*parameters:\s*$/))

  if (paramsLineIdx >= 0) {
    // Check the line after "parameters:" for object format
    const nextLineIdx = paramsLineIdx + 1
    if (nextLineIdx < lines.length) {
      const nextLine = lines[nextLineIdx]
      // Object format: "  param_name:" (indented identifier + colon, alone on line)
      const isObjectFormat = nextLine.match(/^[ \t]+[a-zA-Z_][a-zA-Z0-9_]*:\s*$/) && !nextLine.includes('- name:')

      if (isObjectFormat) {
        console.log('[fixLLMSyntaxErrors] Detected object-format parameters, converting to array format...')

        // Find the end of the parameters section
        let paramsEndIdx = lines.length
        for (let i = paramsLineIdx + 1; i < lines.length; i++) {
          const line = lines[i]
          if (line.trim() === '---' || (line.trim() !== '' && !line.match(/^[ \t]/))) {
            paramsEndIdx = i
            break
          }
        }

        // Extract and fix the parameters section
        const beforeParams = lines.slice(0, paramsLineIdx + 1)
        const paramLines = lines.slice(paramsLineIdx + 1, paramsEndIdx)
        const afterParams = lines.slice(paramsEndIdx)

        const newParamLines: string[] = []
        let currentParam: { name: string; props: string[] } | null = null
        let inObjectParam = false

        for (const line of paramLines) {
          const objectParamMatch = line.match(/^([ \t]+)([a-zA-Z_][a-zA-Z0-9_]*):\s*$/)
          const arrayParamMatch = line.match(/^([ \t]+)-\s*name:\s*(\S+)/)

          if (objectParamMatch && !line.includes('- name:')) {
            if (currentParam) {
              newParamLines.push(`  - name: ${currentParam.name}`)
              newParamLines.push(...currentParam.props)
            }
            currentParam = { name: objectParamMatch[2], props: [] }
            inObjectParam = true
          } else if (arrayParamMatch) {
            if (currentParam) {
              newParamLines.push(`  - name: ${currentParam.name}`)
              newParamLines.push(...currentParam.props)
              currentParam = null
            }
            inObjectParam = false
            newParamLines.push(line)
          } else if (inObjectParam && currentParam && line.match(/^[ \t]+\S/)) {
            currentParam.props.push(line)
          } else if (!inObjectParam) {
            newParamLines.push(line)
          }
        }

        if (currentParam) {
          newParamLines.push(`  - name: ${currentParam.name}`)
          newParamLines.push(...currentParam.props)
        }

        result = [...beforeParams, ...newParamLines, ...afterParams].join('\n')
        console.log('[fixLLMSyntaxErrors] Converted parameters to array format')
      }
    }
  }

  return result
}

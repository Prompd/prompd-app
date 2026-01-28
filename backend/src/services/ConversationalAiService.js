import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { decryptApiKey } from './EncryptionService.js'
import { ExecutionHistory } from '../models/ExecutionHistory.js'
import { pricingService } from './PricingService.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SYSTEM_PROMPT_PATH = join(__dirname, '../prompts/conversational-prompd-generator.md')

/**
 * Conversational AI service for generating .prmd files through interactive dialogue
 * Supports streaming responses and multi-turn conversations
 */
export class ConversationalAiService {
  constructor() {
    this.conversations = new Map() // Store conversation history in memory
    this.conversationMetadata = new Map() // Store metadata (clarification rounds, etc.)
    this.MAX_CLARIFICATIONS = 2
  }

  /**
   * Helper for Map-based access (with backward compatibility for plain objects)
   * Used for accessing llmProviders which can be either a Mongoose Map or plain object
   */
  getUserProviderConfig(providers, providerId) {
    if (!providers) return null
    if (typeof providers.get === 'function') {
      return providers.get(providerId)
    }
    return providers[providerId]
  }

  /**
   * Get system prompt for conversational .prmd generation
   */
  getSystemPrompt() {
    try {
      return readFileSync(SYSTEM_PROMPT_PATH, 'utf-8')
    } catch (error) {
      // Fallback system prompt if file doesn't exist
      return `You are an expert AI assistant helping users create Prompd (.prmd) files.

Prompd files use this format:
---
id: prompt-id
name: Prompt Name
description: Brief description
version: 1.0.0
parameters:
  paramName:
    type: string
    description: Parameter description
---

# System
System instructions here

# User
User message template with {paramName} placeholders

Your goal is to:
1. Ask clarifying questions to understand what the user wants to build
2. Gather information about parameters, sections, and use case
3. Generate a complete, well-structured .prmd file
4. Be conversational and helpful - ask follow-up questions to improve quality

When you have enough information, generate the .prmd file and prefix it with:
GENERATED_PROMPD:
---
... rest of the file ...

Be concise but thorough in your questions.`
    }
  }

  /**
   * Start or continue a conversation
   * @param {string} userId - User ID for conversation tracking
   * @param {string} message - User's message
   * @param {string} conversationId - Optional conversation ID to continue
   * @param {object} options - Generation options (provider, model, etc.)
   * @returns {AsyncGenerator} Streaming response chunks
   */
  async *streamConversation(userId, message, conversationId = null, options = {}) {
    const convId = conversationId || `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Use client-provided message history if available, otherwise use in-memory history
    let history
    let metadata
    let clientSystemPrompt = null

    if (options.messages && Array.isArray(options.messages)) {
      // Client provided full message history - use it directly
      // Extract system messages (contains mode-specific system prompt from frontend)
      const systemMessages = options.messages.filter(m => m.role === 'system')
      if (systemMessages.length > 0) {
        // Join all system messages (first is mode prompt, subsequent may be context like file content)
        clientSystemPrompt = systemMessages.map(m => m.content).join('\n\n')

        // Log which system prompt is being used
        const promptPreview = clientSystemPrompt.substring(0, 150).replace(/\n/g, ' ')
        console.log(`[Chat] Using client system prompt (${systemMessages.length} message(s)): "${promptPreview}..."`)
      } else {
        console.log('[Chat] No client system prompt provided, will use default')
      }

      // Filter to only user/assistant messages for conversation history
      history = options.messages.filter(m => m.role === 'user' || m.role === 'assistant')
      metadata = {
        clarificationRound: 0,
        declined: message.toLowerCase().includes('decline') || message.toLowerCase().includes('refine'),
        lastDeclinedContent: null
      }
    } else {
      // Fallback to in-memory history for backwards compatibility
      if (!this.conversations.has(convId)) {
        this.conversations.set(convId, [])
        this.conversationMetadata.set(convId, {
          clarificationRound: 0,
          declined: false,
          lastDeclinedContent: null
        })
      }
      history = this.conversations.get(convId)
      metadata = this.conversationMetadata.get(convId)

      // Check if user declined previous generation
      if (message.toLowerCase().includes('decline') || message.toLowerCase().includes('refine')) {
        metadata.declined = true
        metadata.clarificationRound++
      }

      // Add user message to history
      history.push({
        role: 'user',
        content: message
      })
    }

    const provider = options.provider || 'anthropic'
    const model = options.model || (provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o')

    // OpenAI-compatible providers with their base URLs
    const openAICompatibleProviders = {
      'openai': null, // null means use default OpenAI URL
      'groq': 'https://api.groq.com/openai/v1',
      'mistral': 'https://api.mistral.ai/v1',
      'together': 'https://api.together.xyz/v1',
      'perplexity': 'https://api.perplexity.ai',
      'deepseek': 'https://api.deepseek.com/v1',
      'ollama': 'http://localhost:11434/v1'
    }

    try {
      if (provider === 'anthropic') {
        yield* this.streamAnthropicResponse(userId, history, convId, model, options, metadata, clientSystemPrompt)
      } else if (provider === 'google') {
        yield* this.streamGoogleResponse(userId, history, convId, model, options, metadata, clientSystemPrompt)
      } else if (provider === 'cohere') {
        yield* this.streamCohereResponse(userId, history, convId, model, options, metadata, clientSystemPrompt)
      } else if (openAICompatibleProviders.hasOwnProperty(provider)) {
        // Handle all OpenAI-compatible providers (OpenAI, Groq, Mistral, Together, Perplexity, DeepSeek, Ollama)
        const baseURL = openAICompatibleProviders[provider]
        yield* this.streamOpenAICompatibleResponse(userId, history, convId, model, options, metadata, clientSystemPrompt, provider, baseURL)
      } else {
        throw new Error(`Unsupported provider: ${provider}. Supported: anthropic, openai, google, groq, mistral, cohere, together, perplexity, deepseek, ollama`)
      }
    } catch (error) {
      console.error('Streaming conversation error:', error)
      yield { type: 'error', error: error.message }
    }
  }

  /**
   * Stream response from Anthropic Claude
   */
  async *streamAnthropicResponse(userId, history, conversationId, model, options, metadata, clientSystemPrompt = null) {
    const { user, client } = await this.getAnthropicClient(userId)

    // Use client-provided system prompt (mode-specific) if available, otherwise use default
    let systemPrompt = clientSystemPrompt || this.getSystemPrompt()
    const promptSource = clientSystemPrompt ? 'client (mode-specific)' : 'default (conversational-prompd-generator.md)'
    console.log(`[Chat:Anthropic] System prompt source: ${promptSource}`)

    // Add clarification context if user declined
    if (metadata.clarificationRound > 0) {
      systemPrompt += `\n\n## CURRENT CONTEXT\nThe user has declined the previous generation (clarification round ${metadata.clarificationRound}/${this.MAX_CLARIFICATIONS}).
Ask specific, targeted questions about what they want to change.
${metadata.clarificationRound >= this.MAX_CLARIFICATIONS ? 'This is the FINAL clarification - generate after this round.' : 'Focus on understanding their feedback before regenerating.'}`
    }

    let fullResponse = ''
    let startTime = Date.now()

    const stream = await client.messages.stream({
      model,
      max_tokens: options.maxTokens || 4000,
      temperature: options.temperature || 0.7,
      system: systemPrompt,
      messages: history
    })

    // Yield conversation ID first
    yield { type: 'conversation_id', conversationId }

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const chunk = event.delta.text
        fullResponse += chunk

        yield {
          type: 'content',
          content: chunk
        }
      }

      if (event.type === 'message_stop') {
        // Add assistant response to history
        history.push({
          role: 'assistant',
          content: fullResponse
        })

        // Check if .prmd was generated
        const hasGenerated = fullResponse.includes('GENERATED_PROMPD:')

        // Extract token usage from the final message
        const usage = event.message?.usage || {}
        const inputTokens = usage.input_tokens || 0
        const outputTokens = usage.output_tokens || 0
        const totalTokens = inputTokens + outputTokens

        // Calculate cost using pricing service
        const costResult = await pricingService.calculateCost('anthropic', model, inputTokens, outputTokens)
        const estimatedCost = costResult?.totalCost || (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15

        yield {
          type: 'done',
          conversationId,
          hasGeneratedPrompd: hasGenerated,
          fullResponse,
          metadata: {
            provider: 'anthropic',
            model,
            duration: Date.now() - startTime,
            tokensUsed: {
              input: inputTokens,
              output: outputTokens,
              total: totalTokens
            },
            // Also send in format expected by @prompd/react DefaultLLMClient
            usage: {
              promptTokens: inputTokens,
              completionTokens: outputTokens,
              totalTokens
            },
            estimatedCost,
            cost: costResult ? {
              inputCost: costResult.inputCost,
              outputCost: costResult.outputCost,
              totalCost: costResult.totalCost
            } : null
          }
        }

        // Save to execution history
        await ExecutionHistory.create({
          userId: user._id.toString(),
          type: 'conversation',
          prompt: history[history.length - 2].content, // Last user message
          provider: 'anthropic',
          model,
          response: fullResponse,
          metadata: {
            conversationId,
            turnNumber: Math.floor(history.length / 2),
            hasGeneratedPrompd: hasGenerated,
            tokensUsed: {
              prompt: inputTokens,
              completion: outputTokens,
              total: totalTokens
            },
            estimatedCost,
            // Enhanced pricing tracking
            pricingRef: costResult ? {
              pricingId: costResult.pricingId,
              effectiveFrom: costResult.pricingEffectiveFrom,
              inputRate: costResult.inputRate,
              outputRate: costResult.outputRate
            } : null,
            cost: costResult ? {
              inputCost: costResult.inputCost,
              outputCost: costResult.outputCost,
              totalCost: costResult.totalCost,
              currency: 'USD'
            } : null,
            durationMs: Date.now() - startTime,
            usedOwnApiKey: !!this.getUserProviderConfig(user.aiFeatures?.llmProviders, 'anthropic')?.hasKey
          },
          error: {
            occurred: false
          }
        })
      }
    }
  }

  /**
   * Stream response from OpenAI-compatible providers (OpenAI, Groq, Mistral, Together, Perplexity, DeepSeek, Ollama)
   */
  async *streamOpenAICompatibleResponse(userId, history, conversationId, model, options, metadata, clientSystemPrompt = null, providerName = 'openai', baseURL = null) {
    const { user, client } = await this.getOpenAICompatibleClient(userId, providerName, baseURL)

    // Use client-provided system prompt (mode-specific) if available, otherwise use default
    let systemPrompt = clientSystemPrompt || this.getSystemPrompt()
    const promptSource = clientSystemPrompt ? 'client (mode-specific)' : 'default (conversational-prompd-generator.md)'
    console.log(`[Chat:${providerName}] System prompt source: ${promptSource}`)

    // Add clarification context if user declined
    if (metadata.clarificationRound > 0) {
      systemPrompt += `\n\n## CURRENT CONTEXT\nThe user has declined the previous generation (clarification round ${metadata.clarificationRound}/${this.MAX_CLARIFICATIONS}).
Ask specific, targeted questions about what they want to change.
${metadata.clarificationRound >= this.MAX_CLARIFICATIONS ? 'This is the FINAL clarification - generate after this round.' : 'Focus on understanding their feedback before regenerating.'}`
    }

    let fullResponse = ''
    let startTime = Date.now()
    let usageData = null

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history
    ]

    const stream = await client.chat.completions.create({
      model,
      messages,
      max_tokens: options.maxTokens || 4000,
      temperature: options.temperature || 0.7,
      stream: true,
      stream_options: { include_usage: true }
    })

    // Yield conversation ID first
    yield { type: 'conversation_id', conversationId }

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content
      if (content) {
        fullResponse += content

        yield {
          type: 'content',
          content
        }
      }

      // Capture usage data from the final chunk (OpenAI sends usage in the last chunk when stream_options.include_usage is true)
      if (chunk.usage) {
        usageData = chunk.usage
      }

      if (chunk.choices[0]?.finish_reason === 'stop') {
        // Add assistant response to history
        history.push({
          role: 'assistant',
          content: fullResponse
        })

        const hasGenerated = fullResponse.includes('GENERATED_PROMPD:')

        // Extract token usage
        const inputTokens = usageData?.prompt_tokens || 0
        const outputTokens = usageData?.completion_tokens || 0
        const totalTokens = inputTokens + outputTokens

        // Calculate cost using pricing service
        const costResult = await pricingService.calculateCost(providerName, model, inputTokens, outputTokens)
        const estimatedCost = costResult?.totalCost || (inputTokens / 1_000_000) * 2.5 + (outputTokens / 1_000_000) * 10

        yield {
          type: 'done',
          conversationId,
          hasGeneratedPrompd: hasGenerated,
          fullResponse,
          metadata: {
            provider: providerName,
            model,
            duration: Date.now() - startTime,
            tokensUsed: {
              input: inputTokens,
              output: outputTokens,
              total: totalTokens
            },
            // Send in format expected by @prompd/react DefaultLLMClient
            usage: {
              promptTokens: inputTokens,
              completionTokens: outputTokens,
              totalTokens
            },
            estimatedCost,
            cost: costResult ? {
              inputCost: costResult.inputCost,
              outputCost: costResult.outputCost,
              totalCost: costResult.totalCost
            } : null
          }
        }

        // Save to execution history
        await ExecutionHistory.create({
          userId: user._id.toString(),
          type: 'conversation',
          prompt: history[history.length - 2].content, // Last user message
          provider: providerName,
          model,
          response: fullResponse,
          metadata: {
            conversationId,
            turnNumber: Math.floor(history.length / 2),
            hasGeneratedPrompd: hasGenerated,
            tokensUsed: {
              prompt: inputTokens,
              completion: outputTokens,
              total: totalTokens
            },
            estimatedCost,
            pricingRef: costResult ? {
              pricingId: costResult.pricingId,
              effectiveFrom: costResult.pricingEffectiveFrom,
              inputRate: costResult.inputRate,
              outputRate: costResult.outputRate
            } : null,
            cost: costResult ? {
              inputCost: costResult.inputCost,
              outputCost: costResult.outputCost,
              totalCost: costResult.totalCost,
              currency: 'USD'
            } : null,
            durationMs: Date.now() - startTime,
            usedOwnApiKey: !!this.getUserProviderConfig(user.aiFeatures?.llmProviders, providerName)?.hasKey
          },
          error: {
            occurred: false
          }
        })
      }
    }
  }

  /**
   * Stream response from Google (Gemini)
   * Note: Google uses a different SDK (@google/generative-ai), adding basic support
   */
  async *streamGoogleResponse(userId, history, conversationId, model, options, metadata, clientSystemPrompt = null) {
    const User = (await import('../models/User.js')).User
    const user = await User.findById(userId)

    if (!user) {
      throw new Error('User not found')
    }

    // Check for API key
    const googleConfig = this.getUserProviderConfig(user.aiFeatures?.llmProviders, 'google')
    const hasOwnKey = googleConfig?.hasKey || false
    let apiKey

    if (hasOwnKey) {
      apiKey = decryptApiKey(googleConfig.encryptedKey, googleConfig.iv)
    } else if (process.env.GOOGLE_API_KEY) {
      apiKey = process.env.GOOGLE_API_KEY
    } else {
      throw new Error('Server GOOGLE API key not configured. Set GOOGLE_API_KEY environment variable or add your own key in settings.')
    }

    // Use Google's REST API for streaming (avoiding SDK dependency)
    const systemPrompt = clientSystemPrompt || this.getSystemPrompt()
    const promptSource = clientSystemPrompt ? 'client (mode-specific)' : 'default (conversational-prompd-generator.md)'
    console.log(`[Chat:Google] System prompt source: ${promptSource}`)

    // Add clarification context if user declined
    let fullSystemPrompt = systemPrompt
    if (metadata.clarificationRound > 0) {
      fullSystemPrompt += `\n\n## CURRENT CONTEXT\nThe user has declined the previous generation (clarification round ${metadata.clarificationRound}/${this.MAX_CLARIFICATIONS}).
Ask specific, targeted questions about what they want to change.
${metadata.clarificationRound >= this.MAX_CLARIFICATIONS ? 'This is the FINAL clarification - generate after this round.' : 'Focus on understanding their feedback before regenerating.'}`
    }

    let fullResponse = ''
    const startTime = Date.now()

    // Build contents array for Gemini API
    const contents = history.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }))

    // Gemini uses system instruction separately
    const requestBody = {
      contents,
      systemInstruction: { parts: [{ text: fullSystemPrompt }] },
      generationConfig: {
        temperature: options.temperature || 0.7,
        maxOutputTokens: options.maxTokens || 4000
      }
    }

    // Determine model endpoint (use provided model or default)
    const modelName = model || 'gemini-1.5-flash'
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?key=${apiKey}&alt=sse`

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Google API error: ${response.status} - ${errorText}`)
      }

      // Yield conversation ID first
      yield { type: 'conversation_id', conversationId }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let usageMetadata = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (!data || data === '[DONE]') continue

            try {
              const parsed = JSON.parse(data)
              const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text
              if (text) {
                fullResponse += text
                yield { type: 'content', content: text }
              }
              // Capture usage metadata
              if (parsed.usageMetadata) {
                usageMetadata = parsed.usageMetadata
              }
            } catch (e) {
              // Skip malformed JSON
            }
          }
        }
      }

      // Add assistant response to history
      history.push({ role: 'assistant', content: fullResponse })

      const hasGenerated = fullResponse.includes('GENERATED_PROMPD:')
      const inputTokens = usageMetadata?.promptTokenCount || 0
      const outputTokens = usageMetadata?.candidatesTokenCount || 0
      const totalTokens = inputTokens + outputTokens

      const costResult = await pricingService.calculateCost('google', modelName, inputTokens, outputTokens)
      const estimatedCost = costResult?.totalCost || (inputTokens / 1_000_000) * 0.075 + (outputTokens / 1_000_000) * 0.30

      yield {
        type: 'done',
        conversationId,
        hasGeneratedPrompd: hasGenerated,
        fullResponse,
        metadata: {
          provider: 'google',
          model: modelName,
          duration: Date.now() - startTime,
          tokensUsed: { input: inputTokens, output: outputTokens, total: totalTokens },
          usage: { promptTokens: inputTokens, completionTokens: outputTokens, totalTokens },
          estimatedCost,
          cost: costResult ? { inputCost: costResult.inputCost, outputCost: costResult.outputCost, totalCost: costResult.totalCost } : null
        }
      }

      // Save to execution history
      await ExecutionHistory.create({
        userId: user._id.toString(),
        type: 'conversation',
        prompt: history[history.length - 2].content,
        provider: 'google',
        model: modelName,
        response: fullResponse,
        metadata: {
          conversationId,
          turnNumber: Math.floor(history.length / 2),
          hasGeneratedPrompd: hasGenerated,
          tokensUsed: { prompt: inputTokens, completion: outputTokens, total: totalTokens },
          estimatedCost,
          cost: costResult ? { inputCost: costResult.inputCost, outputCost: costResult.outputCost, totalCost: costResult.totalCost, currency: 'USD' } : null,
          durationMs: Date.now() - startTime,
          usedOwnApiKey: hasOwnKey
        },
        error: { occurred: false }
      })
    } catch (error) {
      console.error('[Chat:Google] Error:', error)
      throw error
    }
  }

  /**
   * Stream response from Cohere
   * Note: Cohere has its own API format, adding basic support
   */
  async *streamCohereResponse(userId, history, conversationId, model, options, metadata, clientSystemPrompt = null) {
    const User = (await import('../models/User.js')).User
    const user = await User.findById(userId)

    if (!user) {
      throw new Error('User not found')
    }

    // Check for API key
    const cohereConfig = this.getUserProviderConfig(user.aiFeatures?.llmProviders, 'cohere')
    const hasOwnKey = cohereConfig?.hasKey || false
    let apiKey

    if (hasOwnKey) {
      apiKey = decryptApiKey(cohereConfig.encryptedKey, cohereConfig.iv)
    } else if (process.env.COHERE_API_KEY) {
      apiKey = process.env.COHERE_API_KEY
    } else {
      throw new Error('Server COHERE API key not configured. Set COHERE_API_KEY environment variable or add your own key in settings.')
    }

    const systemPrompt = clientSystemPrompt || this.getSystemPrompt()
    const promptSource = clientSystemPrompt ? 'client (mode-specific)' : 'default (conversational-prompd-generator.md)'
    console.log(`[Chat:Cohere] System prompt source: ${promptSource}`)

    let fullSystemPrompt = systemPrompt
    if (metadata.clarificationRound > 0) {
      fullSystemPrompt += `\n\n## CURRENT CONTEXT\nThe user has declined the previous generation (clarification round ${metadata.clarificationRound}/${this.MAX_CLARIFICATIONS}).
Ask specific, targeted questions about what they want to change.
${metadata.clarificationRound >= this.MAX_CLARIFICATIONS ? 'This is the FINAL clarification - generate after this round.' : 'Focus on understanding their feedback before regenerating.'}`
    }

    let fullResponse = ''
    const startTime = Date.now()

    // Build chat history for Cohere format
    const chatHistory = history.slice(0, -1).map(msg => ({
      role: msg.role === 'assistant' ? 'CHATBOT' : 'USER',
      message: msg.content
    }))

    const lastUserMessage = history[history.length - 1]?.content || ''

    const requestBody = {
      model: model || 'command-r-plus',
      message: lastUserMessage,
      chat_history: chatHistory,
      preamble: fullSystemPrompt,
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens || 4000,
      stream: true
    }

    try {
      const response = await fetch('https://api.cohere.ai/v1/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Cohere API error: ${response.status} - ${errorText}`)
      }

      // Yield conversation ID first
      yield { type: 'conversation_id', conversationId }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let billingData = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue

          try {
            const parsed = JSON.parse(line)

            if (parsed.event_type === 'text-generation' && parsed.text) {
              fullResponse += parsed.text
              yield { type: 'content', content: parsed.text }
            }

            if (parsed.event_type === 'stream-end' && parsed.response?.meta?.billed_units) {
              billingData = parsed.response.meta.billed_units
            }
          } catch (e) {
            // Skip malformed JSON
          }
        }
      }

      // Add assistant response to history
      history.push({ role: 'assistant', content: fullResponse })

      const hasGenerated = fullResponse.includes('GENERATED_PROMPD:')
      const inputTokens = billingData?.input_tokens || 0
      const outputTokens = billingData?.output_tokens || 0
      const totalTokens = inputTokens + outputTokens

      const modelName = model || 'command-r-plus'
      const costResult = await pricingService.calculateCost('cohere', modelName, inputTokens, outputTokens)
      const estimatedCost = costResult?.totalCost || (inputTokens / 1_000_000) * 2.5 + (outputTokens / 1_000_000) * 10

      yield {
        type: 'done',
        conversationId,
        hasGeneratedPrompd: hasGenerated,
        fullResponse,
        metadata: {
          provider: 'cohere',
          model: modelName,
          duration: Date.now() - startTime,
          tokensUsed: { input: inputTokens, output: outputTokens, total: totalTokens },
          usage: { promptTokens: inputTokens, completionTokens: outputTokens, totalTokens },
          estimatedCost,
          cost: costResult ? { inputCost: costResult.inputCost, outputCost: costResult.outputCost, totalCost: costResult.totalCost } : null
        }
      }

      // Save to execution history
      await ExecutionHistory.create({
        userId: user._id.toString(),
        type: 'conversation',
        prompt: lastUserMessage,
        provider: 'cohere',
        model: modelName,
        response: fullResponse,
        metadata: {
          conversationId,
          turnNumber: Math.floor(history.length / 2),
          hasGeneratedPrompd: hasGenerated,
          tokensUsed: { prompt: inputTokens, completion: outputTokens, total: totalTokens },
          estimatedCost,
          cost: costResult ? { inputCost: costResult.inputCost, outputCost: costResult.outputCost, totalCost: costResult.totalCost, currency: 'USD' } : null,
          durationMs: Date.now() - startTime,
          usedOwnApiKey: hasOwnKey
        },
        error: { occurred: false }
      })
    } catch (error) {
      console.error('[Chat:Cohere] Error:', error)
      throw error
    }
  }

  /**
   * Get Anthropic client (user's key or server key)
   */
  async getAnthropicClient(userId) {
    const User = (await import('../models/User.js')).User
    const user = await User.findById(userId)

    if (!user) {
      throw new Error('User not found')
    }

    let client
    const anthropicConfig = this.getUserProviderConfig(user.aiFeatures?.llmProviders, 'anthropic')
    const hasOwnKey = anthropicConfig?.hasKey || false

    if (hasOwnKey) {
      const userKey = decryptApiKey(
        anthropicConfig.encryptedKey,
        anthropicConfig.iv
      )
      client = new Anthropic({ apiKey: userKey })
    } else {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('Server Anthropic API key not configured')
      }
      client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    }

    return { user, client }
  }

  /**
   * Get OpenAI client (user's key or server key)
   */
  async getOpenAIClient(userId) {
    const User = (await import('../models/User.js')).User
    const user = await User.findById(userId)

    if (!user) {
      throw new Error('User not found')
    }

    let client
    const openaiConfig = this.getUserProviderConfig(user.aiFeatures?.llmProviders, 'openai')
    const hasOwnKey = openaiConfig?.hasKey || false

    if (hasOwnKey) {
      const userKey = decryptApiKey(
        openaiConfig.encryptedKey,
        openaiConfig.iv
      )
      client = new OpenAI({ apiKey: userKey })
    } else {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('Server OpenAI API key not configured')
      }
      client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    }

    return { user, client }
  }

  /**
   * Get OpenAI-compatible client for various providers
   * Supports: OpenAI, Groq, Mistral, Together, Perplexity, DeepSeek, Ollama
   */
  async getOpenAICompatibleClient(userId, providerName, baseURL = null) {
    const User = (await import('../models/User.js')).User
    const user = await User.findById(userId)

    if (!user) {
      throw new Error('User not found')
    }

    // Map provider names to environment variable names
    const envKeyMap = {
      'openai': 'OPENAI_API_KEY',
      'groq': 'GROQ_API_KEY',
      'mistral': 'MISTRAL_API_KEY',
      'together': 'TOGETHER_API_KEY',
      'perplexity': 'PERPLEXITY_API_KEY',
      'deepseek': 'DEEPSEEK_API_KEY',
      'ollama': null // Ollama typically doesn't need an API key
    }

    let client
    const providerConfig = this.getUserProviderConfig(user.aiFeatures?.llmProviders, providerName)
    const hasOwnKey = providerConfig?.hasKey || false

    // Build client options
    const clientOptions = {}
    if (baseURL) {
      clientOptions.baseURL = baseURL
    }

    if (hasOwnKey) {
      // User has their own API key for this provider
      const userKey = decryptApiKey(
        providerConfig.encryptedKey,
        providerConfig.iv
      )
      clientOptions.apiKey = userKey
      client = new OpenAI(clientOptions)
    } else {
      // Use server key from environment
      const envKey = envKeyMap[providerName]

      if (providerName === 'ollama') {
        // Ollama typically runs locally without auth
        clientOptions.apiKey = 'ollama' // Placeholder, not validated
        client = new OpenAI(clientOptions)
      } else if (envKey && process.env[envKey]) {
        clientOptions.apiKey = process.env[envKey]
        client = new OpenAI(clientOptions)
      } else {
        throw new Error(`Server ${providerName.toUpperCase()} API key not configured. Set ${envKey} environment variable or add your own key in settings.`)
      }
    }

    return { user, client }
  }

  /**
   * Get conversation history
   */
  getConversationHistory(conversationId) {
    return this.conversations.get(conversationId) || []
  }

  /**
   * Clear conversation history
   */
  clearConversation(conversationId) {
    this.conversations.delete(conversationId)
  }

  /**
   * Clear old conversations (called periodically)
   */
  clearOldConversations(maxAgeMs = 3600000) { // 1 hour default
    const now = Date.now()
    for (const [convId, _] of this.conversations) {
      const timestamp = parseInt(convId.split('_')[1])
      if (now - timestamp > maxAgeMs) {
        this.conversations.delete(convId)
      }
    }
  }
}

export const conversationalAiService = new ConversationalAiService()

// Clean up old conversations every 30 minutes
setInterval(() => {
  conversationalAiService.clearOldConversations()
}, 30 * 60 * 1000)

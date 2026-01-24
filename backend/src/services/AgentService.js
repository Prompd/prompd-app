/**
 * Agent Service - Handles LLM calls for agent mode
 *
 * ARCHITECTURE:
 * - This service ONLY handles LLM API calls
 * - Tool execution happens CLIENT-SIDE (Electron IPC or browser)
 * - Frontend sends: user message + tool results
 * - Backend returns: LLM response (text or tool calls)
 */

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { decryptApiKey } from './EncryptionService.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load agent mode configuration
let agentModeConfig = null
try {
  const configPath = join(__dirname, '../prompts/modes/agent.json')
  agentModeConfig = JSON.parse(readFileSync(configPath, 'utf-8'))
} catch (error) {
  console.error('Failed to load agent mode config:', error.message)
}

/**
 * Agent Service - LLM-only, no tool execution
 */
export class AgentService {
  constructor() {
    this.sessions = new Map()
  }

  /**
   * Helper for Map-based access
   */
  getUserProviderConfig(providers, providerId) {
    if (!providers) return null
    if (typeof providers.get === 'function') {
      return providers.get(providerId)
    }
    return providers[providerId]
  }

  /**
   * Get the agent system prompt
   */
  getSystemPrompt() {
    return agentModeConfig?.systemPrompt || `You are an AI coding agent. Respond with JSON containing "message" and "toolCalls" array.`
  }

  /**
   * Get tool definitions for documentation
   */
  getToolDefinitions() {
    return agentModeConfig?.tools || []
  }

  /**
   * Get or create session
   */
  getOrCreateSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        id: sessionId,
        messages: [],
        iteration: 0,
        startTime: Date.now()
      })
    }
    return this.sessions.get(sessionId)
  }

  /**
   * Get existing session
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId)
  }

  /**
   * Process a message and return LLM response
   *
   * @param {string} userId - User ID for auth
   * @param {string} sessionId - Session ID
   * @param {object} options - { provider, model, messages }
   * @returns {object} - { message, toolCalls, done }
   */
  async chat(userId, sessionId, options = {}) {
    const session = this.getOrCreateSession(sessionId)
    const provider = options.provider || 'anthropic'
    const model = options.model || (provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o')
    const messages = options.messages || []

    // Update session messages
    session.messages = messages
    session.iteration++

    console.log(`[AgentService] Chat called - session: ${sessionId}, iteration: ${session.iteration}`)

    try {
      let response
      if (provider === 'anthropic') {
        response = await this.callAnthropic(userId, messages, model, options)
      } else {
        response = await this.callOpenAI(userId, messages, model, options)
      }

      // Parse the response
      const parsed = this.parseResponse(response)

      return {
        success: true,
        ...parsed,
        iteration: session.iteration,
        rawResponse: response
      }
    } catch (error) {
      console.error('[AgentService] Chat error:', error)
      return {
        success: false,
        error: error.message,
        iteration: session.iteration
      }
    }
  }

  /**
   * Call Anthropic Claude
   */
  async callAnthropic(userId, messages, model, options) {
    const { user, client } = await this.getAnthropicClient(userId)
    const systemPrompt = this.getSystemPrompt()

    const response = await client.messages.create({
      model,
      max_tokens: options.maxTokens || 4000,
      temperature: options.temperature || 0.7,
      system: systemPrompt,
      messages
    })

    // Extract text from response
    const textBlock = response.content.find(c => c.type === 'text')
    return textBlock?.text || ''
  }

  /**
   * Call OpenAI (or compatible)
   */
  async callOpenAI(userId, messages, model, options) {
    const { user, client } = await this.getOpenAIClient(userId)
    const systemPrompt = this.getSystemPrompt()

    const messagesWithSystem = [
      { role: 'system', content: systemPrompt },
      ...messages
    ]

    const response = await client.chat.completions.create({
      model,
      messages: messagesWithSystem,
      max_tokens: options.maxTokens || 4000,
      temperature: options.temperature || 0.7
    })

    return response.choices[0]?.message?.content || ''
  }

  /**
   * Parse LLM response to extract message and tool calls
   */
  parseResponse(response) {
    try {
      // Try to extract JSON from the response
      let jsonStr = response.trim()

      // Remove markdown code fences if present
      const codeFenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (codeFenceMatch) {
        jsonStr = codeFenceMatch[1].trim()
      }

      const parsed = JSON.parse(jsonStr)

      return {
        message: parsed.message || '',
        toolCalls: Array.isArray(parsed.toolCalls) ? parsed.toolCalls.map((tc, i) => ({
          id: `tool_${Date.now()}_${i}`,
          tool: tc.tool,
          params: tc.params || {}
        })) : [],
        done: parsed.done === true
      }
    } catch (error) {
      // Not valid JSON - return as plain message
      console.log('[AgentService] Response is not JSON, treating as plain text')
      return {
        message: response,
        toolCalls: [],
        done: true
      }
    }
  }

  /**
   * Get Anthropic client
   * @param {string} userId - Can be Clerk user ID (user_xxx) or session fallback (session_xxx)
   */
  async getAnthropicClient(userId) {
    const User = (await import('../models/User.js')).User

    // Try to find user - handles both Clerk IDs and session fallbacks gracefully
    let user = null
    if (userId && !userId.startsWith('session_')) {
      // Try to find by Clerk user ID first
      user = await User.findOne({ clerkUserId: userId })
    }

    // If user found, try to use their API key
    let client
    if (user) {
      const anthropicConfig = this.getUserProviderConfig(user.aiFeatures?.llmProviders, 'anthropic')
      const hasOwnKey = anthropicConfig?.hasKey || false

      if (hasOwnKey) {
        const userKey = decryptApiKey(anthropicConfig.encryptedKey, anthropicConfig.iv)
        client = new Anthropic({ apiKey: userKey })
        return { user, client }
      }
    }

    // Fall back to server API key
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('Server Anthropic API key not configured')
    }
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    return { user, client }
  }

  /**
   * Get OpenAI client
   * @param {string} userId - Can be Clerk user ID (user_xxx) or session fallback (session_xxx)
   */
  async getOpenAIClient(userId) {
    const User = (await import('../models/User.js')).User

    // Try to find user - handles both Clerk IDs and session fallbacks gracefully
    let user = null
    if (userId && !userId.startsWith('session_')) {
      // Try to find by Clerk user ID first
      user = await User.findOne({ clerkUserId: userId })
    }

    // If user found, try to use their API key
    let client
    if (user) {
      const openaiConfig = this.getUserProviderConfig(user.aiFeatures?.llmProviders, 'openai')
      const hasOwnKey = openaiConfig?.hasKey || false

      if (hasOwnKey) {
        const userKey = decryptApiKey(openaiConfig.encryptedKey, openaiConfig.iv)
        client = new OpenAI({ apiKey: userKey })
        return { user, client }
      }
    }

    // Fall back to server API key
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('Server OpenAI API key not configured')
    }
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    return { user, client }
  }

  /**
   * Stop a session
   */
  stopSession(sessionId) {
    const session = this.sessions.get(sessionId)
    if (session) {
      console.log(`[AgentService] Stopping session ${sessionId}`)
      // Mark as stopped but keep for reference
      session.stopped = true
    }
  }

  /**
   * Clean up old sessions
   */
  cleanupSessions(maxAgeMs = 3600000) {
    const now = Date.now()
    for (const [sessionId, session] of this.sessions) {
      if (now - session.startTime > maxAgeMs) {
        this.sessions.delete(sessionId)
      }
    }
  }
}

export const agentService = new AgentService()

// Clean up old sessions every 30 minutes
setInterval(() => {
  agentService.cleanupSessions()
}, 30 * 60 * 1000)

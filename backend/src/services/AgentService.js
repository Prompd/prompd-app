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
import { resolveServerKeyAccess } from './serverKeyAccess.js'
import { incrementAiUsage } from '../middleware/aiQuota.js'

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
 * The server's own provider key, for a known user who passes the free-tier
 * gate. Throws (with .code) otherwise. Never returns a key for no user.
 */
async function serverKeyFor(user, provider, model, envName, label) {
  if (!user) {
    const err = new Error('Sign in required')
    err.code = 'AUTH_REQUIRED'
    throw err
  }
  const gate = await resolveServerKeyAccess({ user, provider, model })
  if (!gate.allowed) {
    const err = new Error(gate.message)
    err.code = gate.code
    throw err
  }
  const apiKey = process.env[envName]
  if (!apiKey) {
    throw new Error(`Server ${label} API key not configured`)
  }
  return { apiKey, meter: gate.meter }
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
      let call
      if (provider === 'anthropic') {
        call = await this.callAnthropic(userId, messages, model, options)
      } else {
        call = await this.callOpenAI(userId, messages, model, options)
      }
      const response = call.text

      // A run on OUR server key counts against the user's execution quota.
      // Best-effort: a save failure must not lose the response.
      if (call.meter && call.user) {
        try { await incrementAiUsage(call.user, 'execute') }
        catch (e) { console.error('[AgentService] usage increment failed:', e.message) }
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
        ...(error.code ? { code: error.code } : {}),
        iteration: session.iteration
      }
    }
  }

  /**
   * Call Anthropic Claude
   */
  async callAnthropic(userId, messages, model, options) {
    const { user, client, meter } = await this.getAnthropicClient(userId, model)
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
    return { text: textBlock?.text || '', user, meter }
  }

  /**
   * Call OpenAI (or compatible)
   */
  async callOpenAI(userId, messages, model, options) {
    const { user, client, meter } = await this.getOpenAIClient(userId, model)
    const systemPrompt = this.getSystemPrompt()

    const messagesWithSystem = [
      { role: 'system', content: systemPrompt },
      ...messages
    ]

    // OpenAI reasoning models (o1, o3, etc.) use max_completion_tokens and don't support temperature
    const isReasoningModel = /^o\d/.test(model)
    const completionParams = {
      model,
      messages: messagesWithSystem
    }
    if (isReasoningModel) {
      completionParams.max_completion_tokens = options.maxTokens || 4000
    } else {
      completionParams.max_tokens = options.maxTokens || 4000
      completionParams.temperature = options.temperature || 0.7
    }

    const response = await client.chat.completions.create(completionParams)

    return { text: response.choices[0]?.message?.content || '', user, meter }
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
  async getAnthropicClient(userId, model) {
    const User = (await import('../models/User.js')).User

    // userId is the verified identity (the socket's handshake sub). No user,
    // no server key: a missing or pseudo id never spends our provider key.
    let user = null
    if (userId && typeof userId === 'string' && !userId.startsWith('session_')) {
      user = await User.findOne({ clerkUserId: userId })
    }

    // The user's own key, when they have one.
    if (user) {
      const anthropicConfig = this.getUserProviderConfig(user.aiFeatures?.llmProviders, 'anthropic')
      if (anthropicConfig?.hasKey) {
        const userKey = decryptApiKey(anthropicConfig.encryptedKey, anthropicConfig.iv)
        return { user, client: new Anthropic({ apiKey: userKey }), meter: false }
      }
    }

    // Server key: a known user only, through the same free-tier allowlist and
    // quota gate as the HTTP chat gateway.
    const { apiKey, meter } = await serverKeyFor(user, 'anthropic', model, 'ANTHROPIC_API_KEY', 'Anthropic')
    return { user, client: new Anthropic({ apiKey }), meter }
  }

  /**
   * Get OpenAI client
   * @param {string} userId - Can be Clerk user ID (user_xxx) or session fallback (session_xxx)
   */
  async getOpenAIClient(userId, model) {
    const User = (await import('../models/User.js')).User

    // userId is the verified identity (the socket's handshake sub). No user,
    // no server key: a missing or pseudo id never spends our provider key.
    let user = null
    if (userId && typeof userId === 'string' && !userId.startsWith('session_')) {
      user = await User.findOne({ clerkUserId: userId })
    }

    // The user's own key, when they have one.
    if (user) {
      const openaiConfig = this.getUserProviderConfig(user.aiFeatures?.llmProviders, 'openai')
      if (openaiConfig?.hasKey) {
        const userKey = decryptApiKey(openaiConfig.encryptedKey, openaiConfig.iv)
        return { user, client: new OpenAI({ apiKey: userKey }), meter: false }
      }
    }

    // Server key: a known user only, through the same free-tier allowlist and
    // quota gate as the HTTP chat gateway.
    const { apiKey, meter } = await serverKeyFor(user, 'openai', model, 'OPENAI_API_KEY', 'OpenAI')
    return { user, client: new OpenAI({ apiKey }), meter }
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

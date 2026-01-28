import express from 'express'
import { validateAiQuota, incrementAiUsage } from '../middleware/aiQuota.js'
import { generatePrompd } from '../services/AiGenerationService.js'
import { ExecutionHistory } from '../models/ExecutionHistory.js'
import { clerkAuth } from '../middleware/clerkAuth.js'
import { conversationalAiService } from '../services/ConversationalAiService.js'

const router = express.Router()

/**
 * POST /api/ai/generate
 * Generate a .prmd file from natural language description
 */
router.post('/generate', clerkAuth, async (req, res) => {
  try {
    const { description, options } = req.body

    // Validate description
    if (!description || typeof description !== 'string' || description.length < 10) {
      return res.status(400).json({ error: 'Description required (minimum 10 characters)' })
    }

    if (description.length > 5000) {
      return res.status(400).json({ error: 'Description too long (maximum 5000 characters)' })
    }

    // Validate quota
    const quota = await validateAiQuota(req.user, 'generate')
    if (!quota.allowed) {
      return res.status(402).json({
        error: 'Quota exceeded',
        reason: quota.reason,
        canAddApiKey: quota.canAddApiKey,
        upgradeRequired: quota.upgradeRequired,
        suggestion: 'Add your own Anthropic API key for unlimited generations'
      })
    }

    // Generate
    const result = await generatePrompd(req.user, description, options)

    // Increment usage (only if not using own key and not enterprise)
    // Use helper for Map-based access (llmProviders changed from object to Mongoose Map)
    const providers = req.user.aiFeatures?.llmProviders
    const anthropicCfg = providers && typeof providers.get === 'function' ? providers.get('anthropic') : providers?.anthropic
    const hasOwnKey = anthropicCfg?.hasKey || false
    const isEnterprise = req.user.subscription?.plan === 'enterprise'

    if (!hasOwnKey && !isEnterprise) {
      await incrementAiUsage(req.user, 'generate')
    }

    // Refresh user to get updated counts
    await req.user.save()

    res.json({
      prompd: result.prompd,
      metadata: result.metadata,
      usage: {
        used: req.user.aiFeatures?.generations?.used || 0,
        limit: req.user.aiFeatures?.generations?.limit || 5,
        unlimited: hasOwnKey || isEnterprise
      }
    })
  } catch (error) {
    console.error('AI generation error:', error)
    res.status(500).json({
      error: 'Generation failed',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
})

/**
 * Helper to get provider config from Map or plain object
 */
const getUserProviderConfig = (providers, providerId) => {
  if (!providers) return null
  if (typeof providers.get === 'function') {
    return providers.get(providerId)
  }
  return providers[providerId]
}

/**
 * GET /api/ai/quota
 * Get current AI quota status for the authd user
 */
router.get('/quota', clerkAuth, async (req, res) => {
  try {
    const anthropicConfig = getUserProviderConfig(req.user.aiFeatures?.llmProviders, 'anthropic')
    const openaiConfig = getUserProviderConfig(req.user.aiFeatures?.llmProviders, 'openai')
    const hasAnthropicKey = anthropicConfig?.hasKey || false
    const hasOpenaiKey = openaiConfig?.hasKey || false
    const isEnterprise = req.user.subscription?.plan === 'enterprise'

    res.json({
      plan: req.user.subscription?.plan || 'free',
      generations: {
        used: req.user.aiFeatures?.generations?.used || 0,
        limit: req.user.aiFeatures?.generations?.limit || 5,
        unlimited: hasAnthropicKey || hasOpenaiKey || isEnterprise
      },
      executions: {
        used: req.user.aiFeatures?.executions?.used || 0,
        limit: req.user.aiFeatures?.executions?.limit || 10,
        unlimited: hasAnthropicKey || hasOpenaiKey || isEnterprise
      },
      providers: {
        anthropic: hasAnthropicKey,
        openai: hasOpenaiKey
      },
      totalUsage: {
        generations: req.user.aiFeatures?.history?.totalGenerations || 0,
        executions: req.user.aiFeatures?.history?.totalExecutions || 0
      }
    })
  } catch (error) {
    console.error('Error fetching AI quota:', error)
    res.status(500).json({ error: 'Failed to fetch quota' })
  }
})

/**
 * GET /api/ai/history
 * Get execution history for the authd user
 */
router.get('/history', clerkAuth, async (req, res) => {
  try {
    const { type, limit = 20, skip = 0 } = req.query

    // Build query
    const query = { userId: req.user._id.toString() }
    if (type && ['generation', 'execution'].includes(type)) {
      query.type = type
    }

    // Fetch history
    const history = await ExecutionHistory.find(query)
      .sort({ executedAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean()

    // Get total count
    const total = await ExecutionHistory.countDocuments(query)

    res.json({
      history,
      pagination: {
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
        hasMore: total > parseInt(skip) + parseInt(limit)
      }
    })
  } catch (error) {
    console.error('Error fetching AI history:', error)
    res.status(500).json({ error: 'Failed to fetch history' })
  }
})

/**
 * POST /api/ai/chat
 * Stream a conversational response for .prmd generation
 */
router.post('/chat', clerkAuth, async (req, res) => {
  try {
    const { message, conversationId, provider = 'openai', model, temperature = 0.7, maxTokens = 4000 } = req.body

    console.log(`[AI/Chat] Received request - provider: "${provider}", model: "${model}"`)

    // Validate message
    if (!message || typeof message !== 'string' || message.length < 1) {
      return res.status(400).json({ error: 'Message required' })
    }

    if (message.length > 2000) {
      return res.status(400).json({ error: 'Message too long (maximum 2000 characters)' })
    }

    // Set headers for Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no') // Disable nginx buffering

    // Stream the conversation
    try {
      const stream = conversationalAiService.streamConversation(
        req.user._id.toString(),
        message,
        conversationId,
        {
          provider,
          model,
          temperature,
          maxTokens
        }
      )

      for await (const chunk of stream) {
        // Send SSE event
        res.write(`data: ${JSON.stringify(chunk)}\n\n`)

        // Flush immediately
        if (res.flush) res.flush()
      }

      // Close stream
      res.write('data: [DONE]\n\n')
      res.end()
    } catch (streamError) {
      console.error('Streaming error:', streamError)
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: streamError.message
      })}\n\n`)
      res.end()
    }
  } catch (error) {
    console.error('Conversational AI error:', error)
    res.status(500).json({ error: 'Chat failed', message: error.message })
  }
})

/**
 * GET /api/ai/chat/history/:conversationId
 * Get conversation history
 */
router.get('/chat/history/:conversationId', clerkAuth, async (req, res) => {
  try {
    const { conversationId } = req.params

    const history = conversationalAiService.getConversationHistory(conversationId)

    res.json({
      success: true,
      data: {
        conversationId,
        messages: history,
        messageCount: history.length
      }
    })
  } catch (error) {
    console.error('Get conversation history error:', error)
    res.status(500).json({ error: 'Failed to get history' })
  }
})

/**
 * DELETE /api/ai/chat/:conversationId
 * Clear conversation history
 */
router.delete('/chat/:conversationId', clerkAuth, async (req, res) => {
  try {
    const { conversationId } = req.params

    conversationalAiService.clearConversation(conversationId)

    res.json({
      success: true,
      message: 'Conversation cleared'
    })
  } catch (error) {
    console.error('Clear conversation error:', error)
    res.status(500).json({ error: 'Failed to clear conversation' })
  }
})

export default router

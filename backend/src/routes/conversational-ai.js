import express from 'express'
import Joi from 'joi'
import { auth } from '../middleware/auth.js'
import { validate } from '../middleware/validation.js'
import { rateLimit } from '../middleware/rateLimit.js'
import { conversationalAiService } from '../services/ConversationalAiService.js'

const router = express.Router()

// Rate limiting for AI generation
const aiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 conversations per window
  message: 'Too many AI requests'
})

// Validation schemas
const conversationSchema = Joi.object({
  message: Joi.string().min(1).max(2000).required(),
  conversationId: Joi.string().pattern(/^conv_/).optional(),
  provider: Joi.string().valid('anthropic', 'openai', 'google', 'groq', 'mistral', 'cohere', 'together', 'perplexity', 'deepseek', 'ollama').default('openai'), // Support all providers, default to openai
  model: Joi.string().max(100).optional(),
  temperature: Joi.number().min(0).max(2).default(0.7),
  maxTokens: Joi.number().min(100).max(8000).default(4000)
})

// Apply middleware
router.use(aiRateLimit)
router.use(auth)

/**
 * POST /api/conversational-ai/chat
 * Stream a conversational response for .prmd generation
 */
router.post('/chat', validate(conversationSchema), async (req, res, next) => {
  try {
    const userId = req.user.userId
    const { message, conversationId, provider, model, temperature, maxTokens } = req.body

    // Set headers for Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no') // Disable nginx buffering

    // Stream the conversation
    try {
      const stream = conversationalAiService.streamConversation(
        userId,
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
    next(error)
  }
})

/**
 * GET /api/conversational-ai/history/:conversationId
 * Get conversation history
 */
router.get('/history/:conversationId', async (req, res, next) => {
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
    next(error)
  }
})

/**
 * DELETE /api/conversational-ai/conversation/:conversationId
 * Clear conversation history
 */
router.delete('/conversation/:conversationId', async (req, res, next) => {
  try {
    const { conversationId } = req.params

    conversationalAiService.clearConversation(conversationId)

    res.json({
      success: true,
      message: 'Conversation cleared'
    })
  } catch (error) {
    console.error('Clear conversation error:', error)
    next(error)
  }
})

export default router

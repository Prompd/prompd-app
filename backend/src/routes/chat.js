import express from 'express'
import { auth } from '../middleware/auth.js'
import { conversationalAiService } from '../services/ConversationalAiService.js'

const router = express.Router()

/**
 * POST /api/chat/message
 * Adapter endpoint for @prompd/react DefaultLLMClient
 * Translates the client's format to our conversational AI service
 */
router.post('/message', auth, async (req, res) => {
  try {
    const userId = req.user.id // Use Mongoose id getter (string of _id)
    const { messages, provider, model, temperature, maxTokens, conversationId } = req.body

    // Debug logging for provider selection
    console.log(`[Chat] Received request - provider: "${provider}", model: "${model}"`)

    // Extract the last user message
    const userMessages = messages.filter(m => m.role === 'user')
    const lastMessage = userMessages[userMessages.length - 1]?.content || ''

    if (!lastMessage) {
      return res.status(400).json({ error: 'No user message found' })
    }

    // Set headers for Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    // Stream the conversation with full message history
    try {
      const stream = conversationalAiService.streamConversation(
        userId,
        lastMessage,
        conversationId,
        {
          provider: provider || 'openai', // Default to openai (most common)
          model,
          temperature: temperature || 0.7,
          maxTokens: maxTokens || 4000,
          messages // Pass full message history from client
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
    console.error('Chat endpoint error:', error)

    // If headers not sent yet, send error response
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Chat failed',
        message: error.message
      })
    }
  }
})

export default router

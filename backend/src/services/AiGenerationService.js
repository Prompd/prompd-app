import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { decryptApiKey } from './EncryptionService.js'
import { ExecutionHistory } from '../models/ExecutionHistory.js'
import { pricingService } from './PricingService.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const META_PROMPT_PATH = join(__dirname, '../prompts/prompd-generator.prmd')

/**
 * Generate a .prmd file from natural language description
 * @param {object} user - User document from database
 * @param {string} description - Natural language description of the prompt
 * @param {object} options - Generation options
 * @returns {Promise<object>} Generated prompd content and metadata
 */
export async function generatePrompd(user, description, options = {}) {
  const startTime = Date.now()
  let error = null
  let response = null

  try {
    // Load meta-prompt
    const metaPrompt = readFileSync(META_PROMPT_PATH, 'utf-8')

    // Parse frontmatter and body (split on ---  delimiters)
    const parts = metaPrompt.split('---')
    if (parts.length < 3) {
      throw new Error('Invalid meta-prompt format: missing frontmatter delimiters')
    }
    const body = parts[2] // After closing ---

    // Substitute parameters in meta-prompt
    const finalPrompt = body
      .replace(/{description}/g, description)
      .replace(/{complexity}/g, options.complexity || 'intermediate')
      .replace(/{include_examples}/g, options.includeExamples !== false ? 'true' : 'false')
      .replace(/{target_provider}/g, options.targetProvider || 'any')

    // Determine which API key to use
    // Helper for Map-based access (with backward compatibility for plain objects)
    const getUserProviderConfig = (providers, providerId) => {
      if (!providers) return null
      if (typeof providers.get === 'function') {
        return providers.get(providerId)
      }
      return providers[providerId]
    }

    let anthropicClient
    const anthropicConfig = getUserProviderConfig(user.aiFeatures?.llmProviders, 'anthropic')
    const usedOwnKey = anthropicConfig?.hasKey || false

    if (usedOwnKey) {
      const userKey = decryptApiKey(
        anthropicConfig.encryptedKey,
        anthropicConfig.iv
      )
      anthropicClient = new Anthropic({ apiKey: userKey })
    } else {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('Server Anthropic API key not configured')
      }
      anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    }

    // Call Claude API to generate markdown prompt content
    // Use assistant prefill to force .prmd format
    const message = await anthropicClient.messages.create({
      model: options.model || 'claude-sonnet-4-20250514',
      max_tokens: options.maxTokens || 4000,
      temperature: options.temperature || 0.7,
      messages: [
        {
          role: 'user',
          content: finalPrompt
        },
        {
          role: 'assistant',
          content: '---'
        }
      ]
    })

    // Prepend the --- to get the complete .prmd file
    response = '---' + message.content[0].text

    // Calculate cost using pricing service
    const promptTokens = message.usage.input_tokens
    const completionTokens = message.usage.output_tokens
    const costResult = await pricingService.calculateCost('anthropic', message.model, promptTokens, completionTokens)
    const estimatedCost = costResult?.totalCost || (promptTokens / 1000000) * 3.0 + (completionTokens / 1000000) * 15.0

    // Save to execution history
    await ExecutionHistory.create({
      userId: user._id.toString(),
      type: 'generation',
      prompt: description,
      provider: 'anthropic',
      model: message.model,
      response,
      metadata: {
        complexity: options.complexity || 'intermediate',
        includeExamples: options.includeExamples !== false,
        tokensUsed: {
          prompt: promptTokens,
          completion: completionTokens,
          total: promptTokens + completionTokens
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
        usedOwnApiKey: usedOwnKey
      },
      error: {
        occurred: false
      }
    })

    return {
      prompd: response,
      metadata: {
        tokensUsed: {
          input: message.usage.input_tokens,
          output: message.usage.output_tokens,
          total: message.usage.input_tokens + message.usage.output_tokens
        },
        estimatedCost,
        model: message.model,
        durationMs: Date.now() - startTime
      }
    }
  } catch (err) {
    error = err

    // Helper for Map-based access in error handler
    const getProviderConfigForError = (providers, providerId) => {
      if (!providers) return null
      if (typeof providers.get === 'function') {
        return providers.get(providerId)
      }
      return providers[providerId]
    }

    const anthropicConfigForError = getProviderConfigForError(user.aiFeatures?.llmProviders, 'anthropic')

    // Save error to history
    await ExecutionHistory.create({
      userId: user._id.toString(),
      type: 'generation',
      prompt: description,
      provider: 'anthropic',
      model: options.model || 'claude-sonnet-4-20250514',
      response: `[Error: ${err.message}]`,
      metadata: {
        durationMs: Date.now() - startTime,
        usedOwnApiKey: anthropicConfigForError?.hasKey || false
      },
      error: {
        occurred: true,
        message: err.message,
        code: err.code
      }
    })

    throw err
  }
}

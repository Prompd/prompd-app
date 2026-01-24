import express from 'express'
import Joi from 'joi'
import { CompilationService } from '../services/CompilationService.js'
import { ValidationService } from '../services/ValidationService.js'
import { clerkAuth } from '../middleware/clerkAuth.js'
import { validate } from '../middleware/validation.js'
import { rateLimit } from '../middleware/rateLimit.js'

const router = express.Router()
const compilationService = new CompilationService()
const validationService = new ValidationService()

// Rate limiting for compilation (more restrictive due to resource usage)
const compilationRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // 20 compilations per 5 minutes
  message: 'Too many compilation requests'
})

const validationRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 60 validations per minute
  message: 'Too many validation requests'
})

// Validation schemas
const compileSchema = Joi.object({
  content: Joi.string().min(1).max(10 * 1024 * 1024).required(), // 10MB limit
  format: Joi.string().valid('markdown', 'openai-json', 'anthropic-json').default('markdown'),
  parameters: Joi.object({
    provider: Joi.string().max(100).optional(),
    model: Joi.string().max(100).optional(),
    parameters: Joi.object().pattern(Joi.string(), Joi.any()).optional(),
    packageVersions: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        version: Joi.string().required()
      })
    ).optional()
  }).optional(),
  projectId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
  useCache: Joi.boolean().default(true),
  // Package/inheritance resolution fields (same as execute)
  packageRef: Joi.string().pattern(/^@[\w.-]+\/[\w.-]+@[\w.-]+$/).optional(), // Package reference for inheritance resolution
  files: Joi.object().pattern(
    Joi.string(), // File path (e.g., "./base.prmd", "./systems/tech.md")
    Joi.string().max(1 * 1024 * 1024) // File content (1MB limit per file)
  ).optional(), // Map of local file references and their content
  sourceFilePath: Joi.string().max(500).optional() // Source file path for relative path resolution
})

const validateSchema = Joi.object({
  content: Joi.string().min(1).max(10 * 1024 * 1024).required(),
  context: Joi.object({
    projectId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
    fileName: Joi.string().max(255).optional()
  }).optional()
})

const previewSchema = Joi.object({
  content: Joi.string().min(1).max(1 * 1024 * 1024).required(), // 1MB limit for preview
  format: Joi.string().valid('markdown', 'openai-json', 'anthropic-json').default('markdown'),
  parameters: Joi.object().optional()
})

/**
 * POST /api/compilation/preview-public
 * Public preview compilation (no authentication required)
 */
router.post('/preview-public', validationRateLimit, validate(previewSchema), async (req, res, next) => {
  try {
    const { content, format, parameters } = req.body

    // Use a simplified compilation for public preview
    const result = await compilationService.compile(
      content,
      format,
      parameters || {},
      null, // No user ID for public preview
      null  // No project ID for public preview
    )

    // Return only essential data for public preview
    res.json({
      success: true,
      data: {
        output: result.output,
        isValid: result.validationResults.isValid,
        errors: result.validationResults.errors.slice(0, 5), // Limit errors
        warnings: result.validationResults.warnings.slice(0, 3) // Limit warnings
      }
    })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/compilation/execute-public
 * Public execution (no authentication required, limited functionality)
 */
const publicExecuteSchema = Joi.object({
  prompt: Joi.string().min(1).max(100 * 1024).required(), // 100KB limit for public
  provider: Joi.string().valid('openai', 'anthropic').default('openai'),
  model: Joi.string().max(100).default('gpt-4o'),
  parameters: Joi.object().optional()
})

router.post('/execute-public', compilationRateLimit, validate(publicExecuteSchema), async (req, res, next) => {
  try {
    // Note: This would require API keys to be configured in the backend
    // For demo purposes, we'll return a mock response
    res.json({
      success: false,
      error: 'Public execution requires API keys to be configured on the server. Please set up authentication or configure the backend with provider API keys.'
    })
  } catch (error) {
    next(error)
  }
})

// Apply Clerk authentication to remaining routes
router.use(clerkAuth)

/**
 * POST /api/compilation/compile
 * Compile Prompd content to specified format
 */
router.post('/compile', compilationRateLimit, validate(compileSchema), async (req, res, next) => {
  try {
    const { content, format, parameters, projectId, useCache } = req.body
    const userId = req.user._id

    // Skip cache if requested
    if (!useCache) {
      await compilationService.clearCache(userId, projectId)
    }

    const result = await compilationService.compile(
      content,
      format,
      parameters || {},
      userId,
      projectId
    )

    res.json({
      success: true,
      data: {
        output: result.output,
        metadata: result.metadata,
        cached: result.cached,
        validationResults: result.validationResults
      }
    })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/compilation/compile/stream
 * Compile with real-time progress updates via Server-Sent Events
 */
router.post('/compile/stream', compilationRateLimit, validate(compileSchema), async (req, res, next) => {
  try {
    const { content, format, parameters, projectId } = req.body
    const userId = req.user._id

    // Set up Server-Sent Events
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    })

    // Send initial connection confirmation
    res.write('data: {"type":"connected","message":"Compilation started"}\n\n')

    try {
      const result = await compilationService.compileWithProgress(
        content,
        format,
        parameters || {},
        (progress) => {
          // Send progress updates
          res.write(`data: ${JSON.stringify({ type: 'progress', ...progress })}\n\n`)
        }
      )

      // Send final result
      res.write(`data: ${JSON.stringify({ 
        type: 'complete', 
        success: result.success,
        output: result.output,
        metadata: result.metadata,
        cached: result.cached,
        validationResults: result.validationResults
      })}\n\n`)

    } catch (error) {
      res.write(`data: ${JSON.stringify({ 
        type: 'error', 
        error: error.message 
      })}\n\n`)
    }

    res.end()
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/compilation/validate
 * Validate Prompd content
 */
router.post('/validate', validationRateLimit, validate(validateSchema), async (req, res, next) => {
  try {
    const { content, context } = req.body

    const result = await validationService.validateContent(content, context || {})

    res.json({
      success: true,
      data: result
    })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/compilation/preview
 * Quick preview compilation (limited features, no caching)
 */
router.post('/preview', validationRateLimit, validate(previewSchema), async (req, res, next) => {
  try {
    const { content, format, parameters } = req.body

    // Use a simplified compilation for preview
    const result = await compilationService.compile(
      content,
      format,
      parameters || {},
      null, // No user ID for preview
      null  // No project ID for preview
    )

    // Return only essential data for preview
    res.json({
      success: true,
      data: {
        output: result.output,
        isValid: result.validationResults.isValid,
        errors: result.validationResults.errors.slice(0, 5), // Limit errors
        warnings: result.validationResults.warnings.slice(0, 3) // Limit warnings
      }
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/compilation/cache/stats
 * Get compilation cache statistics
 */
router.get('/cache/stats', async (req, res, next) => {
  try {
    const userId = req.query.global === 'true' ? null : req.user._id
    const stats = await compilationService.getStatistics(userId)

    res.json({
      success: true,
      data: stats
    })
  } catch (error) {
    next(error)
  }
})

/**
 * DELETE /api/compilation/cache
 * Clear compilation cache
 */
router.delete('/cache', async (req, res, next) => {
  try {
    const userId = req.user._id
    const projectId = req.query.projectId || null

    const deletedCount = await compilationService.clearCache(userId, projectId)

    res.json({
      success: true,
      data: {
        deletedCount,
        message: `Cleared ${deletedCount} cache entries`
      }
    })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/compilation/cache/maintenance
 * Perform cache maintenance (admin only)
 */
router.post('/cache/maintenance', async (req, res, next) => {
  try {
    // Check if user is admin (simplified check)
    if (!req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      })
    }

    const result = await compilationService.performMaintenance()

    res.json({
      success: true,
      data: result,
      message: 'Cache maintenance completed'
    })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/compilation/validate/project/:id
 * Validate entire project
 */
router.post('/validate/project/:id', async (req, res, next) => {
  try {
    const projectId = req.params.id
    const userId = req.user._id

    const result = await validationService.validateProject(projectId, userId)

    res.json({
      success: true,
      data: result
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/compilation/formats
 * Get supported compilation formats
 */
router.get('/formats', async (req, res, next) => {
  try {
    const formats = [
      {
        id: 'markdown',
        name: 'Markdown',
        description: 'Standard Markdown format with parameter substitution',
        mimeType: 'text/markdown',
        extension: '.md'
      },
      {
        id: 'openai-json',
        name: 'OpenAI JSON',
        description: 'OpenAI Chat Completions API format',
        mimeType: 'application/json',
        extension: '.json'
      },
      {
        id: 'anthropic-json',
        name: 'Anthropic JSON',
        description: 'Anthropic Messages API format',
        mimeType: 'application/json',
        extension: '.json'
      }
    ]

    res.json({
      success: true,
      data: formats
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/compilation/providers
 * Get supported providers and models
 */
router.get('/providers', async (req, res, next) => {
  try {
    const providers = [
      {
        id: 'openai',
        name: 'OpenAI',
        models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4', 'gpt-3.5-turbo'],
        supportsStreaming: true,
        supportsImages: true
      },
      {
        id: 'anthropic',
        name: 'Anthropic',
        models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
        supportsStreaming: true,
        supportsImages: true
      },
      {
        id: 'google',
        name: 'Google AI',
        models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash-exp'],
        supportsStreaming: true,
        supportsImages: true
      },
      {
        id: 'azure',
        name: 'Azure OpenAI',
        models: ['gpt-4', 'gpt-35-turbo'],
        supportsStreaming: true,
        supportsImages: false
      },
      {
        id: 'ollama',
        name: 'Ollama',
        models: ['llama3.2', 'qwen2.5', 'mistral'],
        supportsStreaming: true,
        supportsImages: false
      }
    ]

    res.json({
      success: true,
      data: providers
    })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/compilation/execute
 * Execute compiled prompt with AI provider
 */
const executeSchema = Joi.object({
  prompt: Joi.string().min(1).max(1 * 1024 * 1024).required(), // 1MB limit
  provider: Joi.string().valid('openai', 'anthropic', 'google', 'groq', 'ollama').default('openai'),
  model: Joi.string().max(100).default('gpt-4o'),
  parameters: Joi.object().optional(),
  projectId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
  packageRef: Joi.string().pattern(/^@[\w.-]+\/[\w.-]+@[\w.-]+$/).optional(), // Package reference for inheritance resolution
  files: Joi.object().pattern(
    Joi.string(), // File path (e.g., "./base.prmd", "./systems/tech.md")
    Joi.string().max(1 * 1024 * 1024) // File content (1MB limit per file)
  ).optional(), // Map of local file references and their content
  sourceFilePath: Joi.string().max(500).optional() // Source file path for relative path resolution
})

router.post('/execute', compilationRateLimit, validate(executeSchema), async (req, res, next) => {
  try {
    const { prompt, provider, model, parameters, projectId, packageRef, files, sourceFilePath } = req.body
    console.log('[compilation.js] Request body keys:', Object.keys(req.body))
    console.log('[compilation.js] packageRef from req.body:', packageRef)
    console.log('[compilation.js] files from req.body:', files ? Object.keys(files) : 'none')
    console.log('[compilation.js] sourceFilePath from req.body:', sourceFilePath)
    const userId = req.user._id

    const result = await compilationService.execute(
      prompt,
      provider,
      model,
      parameters || {},
      userId,
      projectId,
      req.user, // Pass full user object to access aiFeatures.llmProviders
      packageRef, // Pass package reference for inheritance resolution
      files, // Pass local file references and content
      sourceFilePath // Pass source file path for relative path resolution
    )

    res.json({
      success: true,
      data: result
    })
  } catch (error) {
    next(error)
  }
})

export default router
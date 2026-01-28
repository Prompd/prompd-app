import express from 'express'
import multer from 'multer'
import Joi from 'joi'
import { FileProcessingService } from '../services/FileProcessingService.js'
import { auth } from '../middleware/auth.js'
import { validate, validateFile } from '../middleware/validation.js'
import { rateLimit } from '../middleware/rateLimit.js'

const router = express.Router()
const fileProcessingService = new FileProcessingService()

// Rate limiting for file operations
const fileRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // 20 file operations per window
  message: 'Too many file requests'
})

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    files: 10 // Max 10 files at once
  }
})

// Validation schemas
const extractContentSchema = Joi.object({
  format: Joi.string().valid('text', 'json', 'structured').default('text'),
  options: Joi.object({
    preserveFormatting: Joi.boolean().default(false),
    extractImages: Joi.boolean().default(false),
    extractTables: Joi.boolean().default(true),
    maxPages: Joi.number().integer().min(1).max(100).optional()
  }).optional()
})

// Apply middleware
router.use(fileRateLimit)
router.use(auth)

/**
 * POST /api/files/upload
 * Upload and process files
 */
router.post('/upload', 
  upload.array('files', 10),
  validateFile({
    maxSize: 50 * 1024 * 1024, // 50MB
    allowedMimeTypes: [
      // Documents
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-powerpoint',
      // Images
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/bmp',
      'image/tiff',
      // Text files
      'text/plain',
      'text/csv',
      'application/json',
      'application/x-yaml',
      'text/yaml',
      // Archives
      'application/zip',
      'application/x-tar',
      'application/gzip'
    ],
    required: true
  }),
  async (req, res, next) => {
    try {
      const files = req.files
      const userId = req.user.userId
      const projectId = req.body.projectId

      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No files uploaded',
          code: 'NO_FILES'
        })
      }

      const results = []

      for (const file of files) {
        try {
          const result = await fileProcessingService.processUpload(file, {
            userId,
            projectId,
            extractContent: req.body.extractContent === 'true',
            preserveOriginal: req.body.preserveOriginal !== 'false'
          })

          results.push({
            originalName: file.originalname,
            ...result
          })
        } catch (error) {
          results.push({
            originalName: file.originalname,
            success: false,
            error: error.message
          })
        }
      }

      res.json({
        success: true,
        data: {
          files: results,
          totalProcessed: results.length,
          successful: results.filter(r => r.success !== false).length
        }
      })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * GET /api/files/:id
 * Download processed file
 */
router.get('/:id', async (req, res, next) => {
  try {
    const fileId = req.params.id
    const userId = req.user.userId

    const file = await fileProcessingService.getFile(fileId, userId)

    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'File not found',
        code: 'FILE_NOT_FOUND'
      })
    }

    // Set appropriate headers
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`)
    
    if (file.size) {
      res.setHeader('Content-Length', file.size)
    }

    // Stream the file
    const stream = await fileProcessingService.getFileStream(fileId, userId)
    stream.pipe(res)
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/files/:id/extract
 * Extract content from uploaded file
 */
router.post('/:id/extract', validate(extractContentSchema), async (req, res, next) => {
  try {
    const fileId = req.params.id
    const userId = req.user.userId
    const { format, options } = req.body

    const result = await fileProcessingService.extractContent(fileId, userId, {
      format,
      ...options
    })

    res.json({
      success: true,
      data: result
    })
  } catch (error) {
    next(error)
  }
})

/**
 * DELETE /api/files/:id
 * Delete uploaded file
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const fileId = req.params.id
    const userId = req.user.userId

    const result = await fileProcessingService.deleteFile(fileId, userId)

    res.json({
      success: true,
      data: result,
      message: 'File deleted successfully'
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/files/user/uploads
 * List user's uploaded files
 */
router.get('/user/uploads', async (req, res, next) => {
  try {
    const userId = req.user.userId
    const options = {
      limit: Math.min(parseInt(req.query.limit) || 50, 100),
      skip: parseInt(req.query.skip) || 0,
      projectId: req.query.projectId,
      fileType: req.query.fileType,
      sortBy: req.query.sortBy || 'uploadedAt',
      sortOrder: req.query.sortOrder || 'desc'
    }

    const result = await fileProcessingService.getUserFiles(userId, options)

    res.json({
      success: true,
      data: {
        files: result.files,
        pagination: {
          total: result.total,
          limit: options.limit,
          skip: options.skip,
          hasMore: result.hasMore
        }
      }
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/files/types
 * Get supported file types and their capabilities
 */
router.get('/types', async (req, res, next) => {
  try {
    const supportedTypes = await fileProcessingService.getSupportedTypes()

    res.json({
      success: true,
      data: supportedTypes
    })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/files/bulk-extract
 * Extract content from multiple files
 */
router.post('/bulk-extract', 
  validate(Joi.object({
    fileIds: Joi.array().items(Joi.string()).min(1).max(10).required(),
    format: Joi.string().valid('text', 'json', 'structured').default('text'),
    options: Joi.object({
      preserveFormatting: Joi.boolean().default(false),
      extractImages: Joi.boolean().default(false),
      extractTables: Joi.boolean().default(true),
      combineResults: Joi.boolean().default(false)
    }).optional()
  })),
  async (req, res, next) => {
    try {
      const { fileIds, format, options } = req.body
      const userId = req.user.userId

      const results = []

      for (const fileId of fileIds) {
        try {
          const result = await fileProcessingService.extractContent(fileId, userId, {
            format,
            ...options
          })

          results.push({
            fileId,
            success: true,
            ...result
          })
        } catch (error) {
          results.push({
            fileId,
            success: false,
            error: error.message
          })
        }
      }

      // Combine results if requested
      let combinedContent = null
      if (options?.combineResults) {
        const successfulResults = results.filter(r => r.success)
        if (format === 'text') {
          combinedContent = successfulResults.map(r => r.content).join('\n\n---\n\n')
        } else if (format === 'json') {
          combinedContent = successfulResults.map(r => r.content)
        }
      }

      res.json({
        success: true,
        data: {
          results,
          totalProcessed: results.length,
          successful: results.filter(r => r.success).length,
          ...(combinedContent && { combinedContent })
        }
      })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * POST /api/files/:id/convert
 * Convert file to different format
 */
router.post('/:id/convert', 
  validate(Joi.object({
    targetFormat: Joi.string().valid('pdf', 'docx', 'txt', 'json', 'csv').required(),
    options: Joi.object({
      quality: Joi.string().valid('low', 'medium', 'high').default('medium'),
      preserveFormatting: Joi.boolean().default(true),
      includeMetadata: Joi.boolean().default(false)
    }).optional()
  })),
  async (req, res, next) => {
    try {
      const fileId = req.params.id
      const userId = req.user.userId
      const { targetFormat, options } = req.body

      const result = await fileProcessingService.convertFile(fileId, userId, targetFormat, options)

      res.json({
        success: true,
        data: result,
        message: `File converted to ${targetFormat.toUpperCase()} successfully`
      })
    } catch (error) {
      next(error)
    }
  }
)

/**
 * POST /api/files/analyze
 * Analyze uploaded files for content insights
 */
router.post('/analyze',
  upload.array('files', 5),
  validateFile({
    maxSize: 10 * 1024 * 1024, // 10MB for analysis
    required: true
  }),
  async (req, res, next) => {
    try {
      const files = req.files
      const userId = req.user.userId
      const analysisType = req.body.analysisType || 'content'

      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No files uploaded for analysis',
          code: 'NO_FILES'
        })
      }

      const results = []

      for (const file of files) {
        try {
          const analysis = await fileProcessingService.analyzeFile(file, {
            userId,
            analysisType,
            includeStatistics: req.body.includeStatistics === 'true',
            extractKeywords: req.body.extractKeywords === 'true'
          })

          results.push({
            originalName: file.originalname,
            ...analysis
          })
        } catch (error) {
          results.push({
            originalName: file.originalname,
            success: false,
            error: error.message
          })
        }
      }

      res.json({
        success: true,
        data: {
          analyses: results,
          totalAnalyzed: results.length,
          successful: results.filter(r => r.success !== false).length
        }
      })
    } catch (error) {
      next(error)
    }
  }
)

export default router
import Joi from 'joi'

/**
 * Request body validation middleware
 */
export const validate = (schema, options = {}) => {
  return (req, res, next) => {
    const validationOptions = {
      abortEarly: false, // Return all validation errors
      allowUnknown: false, // Don't allow unknown fields
      stripUnknown: true, // Remove unknown fields
      ...options
    }

    const { error, value } = schema.validate(req.body, validationOptions)

    if (error) {
      const validationErrors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }))

      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: validationErrors
      })
    }

    // Replace request body with validated value
    req.body = value
    next()
  }
}

/**
 * Query parameters validation middleware
 */
export const validateQuery = (schema, options = {}) => {
  return (req, res, next) => {
    const validationOptions = {
      abortEarly: false,
      allowUnknown: true, // Query params can have extra fields
      stripUnknown: false, // Don't remove extra query params
      ...options
    }

    const { error, value } = schema.validate(req.query, validationOptions)

    if (error) {
      const validationErrors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }))

      return res.status(400).json({
        success: false,
        error: 'Query validation failed',
        code: 'QUERY_VALIDATION_ERROR',
        details: validationErrors
      })
    }

    // Update query with validated values
    req.query = { ...req.query, ...value }
    next()
  }
}

/**
 * Route parameters validation middleware
 */
export const validateParams = (schema, options = {}) => {
  return (req, res, next) => {
    const validationOptions = {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true,
      ...options
    }

    const { error, value } = schema.validate(req.params, validationOptions)

    if (error) {
      const validationErrors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }))

      return res.status(400).json({
        success: false,
        error: 'Parameter validation failed',
        code: 'PARAM_VALIDATION_ERROR',
        details: validationErrors
      })
    }

    req.params = value
    next()
  }
}

/**
 * File upload validation middleware
 */
export const validateFile = (options = {}) => {
  const {
    maxSize = 50 * 1024 * 1024, // 50MB default
    allowedMimeTypes = [],
    allowedExtensions = [],
    required = true
  } = options

  return (req, res, next) => {
    if (!req.file && !req.files) {
      if (required) {
        return res.status(400).json({
          success: false,
          error: 'File upload required',
          code: 'FILE_REQUIRED'
        })
      }
      return next()
    }

    const files = req.files || (req.file ? [req.file] : [])

    for (const file of files) {
      // Check file size
      if (file.size > maxSize) {
        return res.status(400).json({
          success: false,
          error: `File size exceeds limit of ${Math.round(maxSize / 1024 / 1024)}MB`,
          code: 'FILE_TOO_LARGE',
          details: {
            fileName: file.originalname,
            fileSize: file.size,
            maxSize
          }
        })
      }

      // Check MIME type
      if (allowedMimeTypes.length > 0 && !allowedMimeTypes.includes(file.mimetype)) {
        return res.status(400).json({
          success: false,
          error: `File type not allowed: ${file.mimetype}`,
          code: 'INVALID_FILE_TYPE',
          details: {
            fileName: file.originalname,
            mimeType: file.mimetype,
            allowedTypes: allowedMimeTypes
          }
        })
      }

      // Check file extension
      if (allowedExtensions.length > 0) {
        const fileExtension = file.originalname.split('.').pop()?.toLowerCase()
        if (!fileExtension || !allowedExtensions.includes(fileExtension)) {
          return res.status(400).json({
            success: false,
            error: `File extension not allowed: .${fileExtension}`,
            code: 'INVALID_FILE_EXTENSION',
            details: {
              fileName: file.originalname,
              extension: fileExtension,
              allowedExtensions
            }
          })
        }
      }

      // Basic security checks
      if (containsSuspiciousContent(file)) {
        return res.status(400).json({
          success: false,
          error: 'File contains suspicious content',
          code: 'SUSPICIOUS_FILE',
          details: {
            fileName: file.originalname
          }
        })
      }
    }

    next()
  }
}

/**
 * Combined validation middleware for complex requests
 */
export const validateRequest = (schemas = {}) => {
  return async (req, res, next) => {
    const errors = []

    // Validate body
    if (schemas.body) {
      const { error } = schemas.body.validate(req.body, { abortEarly: false })
      if (error) {
        errors.push(...error.details.map(detail => ({
          type: 'body',
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value
        })))
      }
    }

    // Validate query
    if (schemas.query) {
      const { error } = schemas.query.validate(req.query, { abortEarly: false })
      if (error) {
        errors.push(...error.details.map(detail => ({
          type: 'query',
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value
        })))
      }
    }

    // Validate params
    if (schemas.params) {
      const { error } = schemas.params.validate(req.params, { abortEarly: false })
      if (error) {
        errors.push(...error.details.map(detail => ({
          type: 'params',
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value
        })))
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Request validation failed',
        code: 'REQUEST_VALIDATION_ERROR',
        details: errors
      })
    }

    next()
  }
}

/**
 * Custom Joi validators for Prompd-specific formats
 */
export const customValidators = {
  // MongoDB ObjectId validation
  objectId: () => Joi.string().pattern(/^[0-9a-fA-F]{24}$/),

  // Package name validation (npm-style)
  packageName: () => Joi.string().pattern(/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/),

  // Semantic version validation
  semver: () => Joi.string().pattern(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/),

  // Parameter name validation (valid JavaScript identifier)
  parameterName: () => Joi.string().pattern(/^[a-zA-Z_][a-zA-Z0-9_]*$/),

  // File path validation (safe paths only)
  filePath: () => Joi.string().pattern(/^[a-zA-Z0-9\/._-]+$/).max(500),

  // Prompd content validation
  prompdContent: () => Joi.string().custom((value, helpers) => {
    // Basic Prompd structure validation
    if (!value.includes('---')) {
      return helpers.error('prompd.noFrontmatter')
    }

    const parts = value.split('---')
    if (parts.length < 3) {
      return helpers.error('prompd.invalidStructure')
    }

    // Validate YAML frontmatter
    try {
      const yaml = require('js-yaml')
      yaml.load(parts[1])
    } catch (error) {
      return helpers.error('prompd.invalidYaml', { message: error.message })
    }

    return value
  }, 'Prompd content validation').messages({
    'prompd.noFrontmatter': 'Content must include YAML frontmatter delimited by ---',
    'prompd.invalidStructure': 'Invalid Prompd file structure',
    'prompd.invalidYaml': 'Invalid YAML frontmatter: {{#message}}'
  })
}

/**
 * Provider validation schemas
 */
export const providerSchemas = {
  create: Joi.object({
    providerId: Joi.string().required().pattern(/^[a-z0-9-_]+$/),
    name: Joi.string().required().min(1).max(100),
    displayName: Joi.string().required().min(1).max(100),
    apiKey: Joi.string().optional().min(1).max(1000),
    baseUrl: Joi.string().uri().required(),
    models: Joi.array().items(Joi.string().min(1).max(100)).default([]),
    isActive: Joi.boolean().default(false),
    metadata: Joi.object().pattern(Joi.string(), Joi.any()).default({})
  }),
  
  update: Joi.object({
    name: Joi.string().optional().min(1).max(100),
    displayName: Joi.string().optional().min(1).max(100),
    apiKey: Joi.string().optional().min(1).max(1000),
    baseUrl: Joi.string().uri().optional(),
    models: Joi.array().items(Joi.string().min(1).max(100)).optional(),
    isActive: Joi.boolean().optional(),
    metadata: Joi.object().pattern(Joi.string(), Joi.any()).optional()
  })
}

/**
 * Provider validation middleware
 */
export const validateProvider = validate(providerSchemas.create)

/**
 * Common validation schemas
 */
export const commonSchemas = {
  // Pagination parameters
  pagination: Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(20),
    skip: Joi.number().integer().min(0).default(0),
    sortBy: Joi.string().valid('createdAt', 'updatedAt', 'name', 'size').default('updatedAt'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
  }),

  // MongoDB ObjectId parameter
  idParam: Joi.object({
    id: customValidators.objectId().required()
  }),

  // Search query
  search: Joi.object({
    query: Joi.string().min(1).max(100).optional(),
    tags: Joi.array().items(Joi.string().max(50)).max(10).optional(),
    category: Joi.string().max(50).optional()
  })
}

/**
 * Security validation helpers
 */
function containsSuspiciousContent(file) {
  // Check for suspicious file names
  const suspiciousPatterns = [
    /\.exe$/i,
    /\.bat$/i,
    /\.cmd$/i,
    /\.scr$/i,
    /\.vbs$/i,
    /\.js$/i, // JavaScript files can be dangerous
    /\.php$/i,
    /\.asp$/i,
    /\.jsp$/i
  ]

  const fileName = file.originalname.toLowerCase()
  return suspiciousPatterns.some(pattern => pattern.test(fileName))
}

/**
 * Sanitization helpers
 */
export const sanitize = {
  // Remove HTML tags and dangerous characters
  html: (value) => {
    if (typeof value !== 'string') return value
    return value
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<[^>]*>/g, '')
      .trim()
  },

  // Sanitize for database queries
  query: (value) => {
    if (typeof value !== 'string') return value
    return value.replace(/[<>{}]/g, '')
  },

  // Sanitize file names
  fileName: (value) => {
    if (typeof value !== 'string') return value
    return value
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .trim()
  }
}
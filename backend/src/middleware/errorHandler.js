/**
 * Global error handling middleware
 */
export const errorHandler = (err, req, res, next) => {
  // Log error with context
  logError(err, req)

  // Don't log errors in test environment
  if (process.env.NODE_ENV !== 'test') {
    console.error('Error occurred:', {
      message: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method,
      userId: req.user?.userId,
      timestamp: new Date().toISOString()
    })
  }

  // Handle specific error types
  if (err.name === 'ValidationError') {
    return handleValidationError(err, res)
  }

  if (err.name === 'CastError') {
    return handleCastError(err, res)
  }

  if (err.code === 11000) {
    return handleDuplicateKeyError(err, res)
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Invalid authentication token',
      code: 'INVALID_TOKEN'
    })
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'Authentication token expired',
      code: 'TOKEN_EXPIRED'
    })
  }

  if (err.name === 'MulterError') {
    return handleMulterError(err, res)
  }

  // Handle operational errors with specific status codes
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code || 'OPERATIONAL_ERROR'
    })
  }

  // Handle known business logic errors
  if (err.message.includes('not found')) {
    return res.status(404).json({
      success: false,
      error: err.message,
      code: 'NOT_FOUND'
    })
  }

  if (err.message.includes('permission') || err.message.includes('access denied')) {
    return res.status(403).json({
      success: false,
      error: err.message,
      code: 'ACCESS_DENIED'
    })
  }

  if (err.message.includes('already exists') || err.message.includes('duplicate')) {
    return res.status(409).json({
      success: false,
      error: err.message,
      code: 'DUPLICATE_RESOURCE'
    })
  }

  // Default server error
  const isDevelopment = process.env.NODE_ENV === 'development'
  
  res.status(500).json({
    success: false,
    error: isDevelopment ? err.message : 'Internal server error',
    code: 'INTERNAL_ERROR',
    ...(isDevelopment && { stack: err.stack })
  })
}

/**
 * Handle Mongoose validation errors
 */
function handleValidationError(err, res) {
  const errors = Object.values(err.errors).map(error => ({
    field: error.path,
    message: error.message,
    value: error.value
  }))

  return res.status(400).json({
    success: false,
    error: 'Validation failed',
    code: 'VALIDATION_ERROR',
    details: errors
  })
}

/**
 * Handle Mongoose cast errors (invalid ObjectId, etc.)
 */
function handleCastError(err, res) {
  const field = err.path
  const value = err.value

  return res.status(400).json({
    success: false,
    error: `Invalid ${field}: ${value}`,
    code: 'INVALID_FORMAT',
    details: {
      field,
      value,
      expectedType: err.kind
    }
  })
}

/**
 * Handle MongoDB duplicate key errors
 */
function handleDuplicateKeyError(err, res) {
  const field = Object.keys(err.keyValue)[0]
  const value = err.keyValue[field]

  return res.status(409).json({
    success: false,
    error: `${field} '${value}' already exists`,
    code: 'DUPLICATE_KEY',
    details: {
      field,
      value
    }
  })
}

/**
 * Handle Multer file upload errors
 */
function handleMulterError(err, res) {
  switch (err.code) {
    case 'LIMIT_FILE_SIZE':
      return res.status(400).json({
        success: false,
        error: 'File size too large',
        code: 'FILE_TOO_LARGE',
        details: {
          maxSize: err.limit,
          field: err.field
        }
      })

    case 'LIMIT_FILE_COUNT':
      return res.status(400).json({
        success: false,
        error: 'Too many files',
        code: 'TOO_MANY_FILES',
        details: {
          maxCount: err.limit,
          field: err.field
        }
      })

    case 'LIMIT_UNEXPECTED_FILE':
      return res.status(400).json({
        success: false,
        error: 'Unexpected file field',
        code: 'UNEXPECTED_FILE',
        details: {
          fieldName: err.field
        }
      })

    default:
      return res.status(400).json({
        success: false,
        error: 'File upload error',
        code: 'UPLOAD_ERROR',
        details: {
          message: err.message
        }
      })
  }
}

/**
 * Log errors with context and categorization
 */
function logError(err, req) {
  const errorLog = {
    timestamp: new Date().toISOString(),
    level: getErrorLevel(err),
    category: getErrorCategory(err),
    message: err.message,
    stack: err.stack,
    request: {
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      userId: req.user?.userId,
      body: sanitizeLogData(req.body),
      query: sanitizeLogData(req.query),
      params: req.params
    },
    error: {
      name: err.name,
      code: err.code,
      statusCode: err.statusCode
    }
  }

  // In production, you would send this to a logging service
  if (process.env.NODE_ENV === 'production') {
    // Example: Send to logging service
    // loggingService.error(errorLog)
    console.error('PRODUCTION ERROR:', JSON.stringify(errorLog, null, 2))
  } else {
    console.error('DEV ERROR:', errorLog)
  }

  // Send to monitoring service for critical errors
  if (errorLog.level === 'critical') {
    // Example: Send alert to monitoring service
    // monitoringService.alert(errorLog)
  }
}

/**
 * Determine error severity level
 */
function getErrorLevel(err) {
  // Critical errors that need immediate attention
  if (err.name === 'MongoError' || err.name === 'MongooseError') {
    return 'critical'
  }

  // System errors
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    return 'critical'
  }

  // Authentication/authorization errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return 'warning'
  }

  // Validation errors
  if (err.name === 'ValidationError' || err.name === 'CastError') {
    return 'info'
  }

  // File upload errors
  if (err.name === 'MulterError') {
    return 'info'
  }

  // Business logic errors
  if (err.statusCode && err.statusCode < 500) {
    return 'info'
  }

  // Default to error level
  return 'error'
}

/**
 * Categorize errors for better organization
 */
function getErrorCategory(err) {
  if (err.name === 'ValidationError' || err.name === 'CastError') {
    return 'validation'
  }

  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return 'authentication'
  }

  if (err.name === 'MulterError') {
    return 'file_upload'
  }

  if (err.name === 'MongoError' || err.name === 'MongooseError') {
    return 'database'
  }

  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    return 'network'
  }

  if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
    return 'client_error'
  }

  return 'server_error'
}

/**
 * Sanitize sensitive data from logs
 */
function sanitizeLogData(data) {
  if (!data || typeof data !== 'object') {
    return data
  }

  const sensitiveFields = [
    'password',
    'token',
    'apiKey',
    'secret',
    'authorization',
    'cookie',
    'session'
  ]

  const sanitized = { ...data }

  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]'
    }
  }

  // Recursively sanitize nested objects
  for (const key in sanitized) {
    if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeLogData(sanitized[key])
    }
  }

  return sanitized
}

/**
 * Create operational error with specific status code
 */
export class OperationalError extends Error {
  constructor(message, statusCode = 500, code = null) {
    super(message)
    this.name = 'OperationalError'
    this.statusCode = statusCode
    this.code = code
    this.isOperational = true
    
    Error.captureStackTrace(this, this.constructor)
  }
}

/**
 * Create validation error
 */
export class ValidationError extends Error {
  constructor(message, details = []) {
    super(message)
    this.name = 'ValidationError'
    this.statusCode = 400
    this.code = 'VALIDATION_ERROR'
    this.details = details
    this.isOperational = true
    
    Error.captureStackTrace(this, this.constructor)
  }
}

/**
 * Create authentication error
 */
export class AuthenticationError extends Error {
  constructor(message, code = 'AUTH_ERROR') {
    super(message)
    this.name = 'AuthenticationError'
    this.statusCode = 401
    this.code = code
    this.isOperational = true
    
    Error.captureStackTrace(this, this.constructor)
  }
}

/**
 * Create authorization error
 */
export class AuthorizationError extends Error {
  constructor(message, code = 'ACCESS_DENIED') {
    super(message)
    this.name = 'AuthorizationError'
    this.statusCode = 403
    this.code = code
    this.isOperational = true
    
    Error.captureStackTrace(this, this.constructor)
  }
}

/**
 * Create not found error
 */
export class NotFoundError extends Error {
  constructor(message, code = 'NOT_FOUND') {
    super(message)
    this.name = 'NotFoundError'
    this.statusCode = 404
    this.code = code
    this.isOperational = true
    
    Error.captureStackTrace(this, this.constructor)
  }
}

/**
 * Handle unhandled promise rejections
 */
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  
  // Log the error
  logError(new Error(`Unhandled Rejection: ${reason}`), {
    method: 'SYSTEM',
    url: 'N/A',
    get: () => null,
    ip: 'system',
    body: {},
    query: {},
    params: {}
  })
  
  // Exit gracefully
  process.exit(1)
})

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err)
  
  // Log the error
  logError(err, {
    method: 'SYSTEM',
    url: 'N/A',
    get: () => null,
    ip: 'system',
    body: {},
    query: {},
    params: {}
  })
  
  // Exit gracefully
  process.exit(1)
})
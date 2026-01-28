import crypto from 'crypto'

/**
 * Request logging middleware
 */
export const requestLogger = (req, res, next) => {
  const startTime = Date.now()
  
  // Generate request ID for tracing
  req.requestId = crypto.randomUUID()
  
  // Add request ID to response headers
  res.setHeader('X-Request-ID', req.requestId)
  
  // Log request start
  if (process.env.NODE_ENV !== 'test') {
    console.log(`[${new Date().toISOString()}] ${req.requestId} ${req.method} ${req.url} - START`)
  }
  
  // Override res.end to capture response details
  const originalEnd = res.end
  res.end = function(chunk, encoding) {
    const duration = Date.now() - startTime
    const contentLength = res.getHeader('content-length') || (chunk ? chunk.length : 0)
    
    // Log request completion
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[${new Date().toISOString()}] ${req.requestId} ${req.method} ${req.url} - ${res.statusCode} ${duration}ms ${contentLength}bytes`)
    }
    
    // Log additional details for errors
    if (res.statusCode >= 400) {
      console.error(`[ERROR] ${req.requestId} ${req.method} ${req.url} - ${res.statusCode}`, {
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        userId: req.user?.userId,
        body: sanitizeLogData(req.body),
        query: sanitizeLogData(req.query)
      })
    }
    
    originalEnd.call(this, chunk, encoding)
  }
  
  next()
}

/**
 * Performance monitoring middleware
 */
export const performanceLogger = (req, res, next) => {
  const startTime = process.hrtime.bigint()
  
  res.on('finish', () => {
    const endTime = process.hrtime.bigint()
    const duration = Number(endTime - startTime) / 1000000 // Convert to milliseconds
    
    // Log slow requests
    if (duration > 1000) { // Requests taking more than 1 second
      console.warn(`[SLOW REQUEST] ${req.requestId} ${req.method} ${req.url} - ${duration.toFixed(2)}ms`)
    }
    
    // Log performance metrics
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[PERF] ${req.requestId} - ${duration.toFixed(2)}ms CPU, ${process.memoryUsage().rss / 1024 / 1024}MB RAM`)
    }
  })
  
  next()
}

/**
 * Security event logging middleware
 */
export const securityLogger = (req, res, next) => {
  // Log suspicious activities
  const suspiciousPatterns = [
    /\.\.\//,           // Directory traversal
    /<script/i,         // XSS attempts
    /union.*select/i,   // SQL injection
    /javascript:/i,     // JavaScript injection
    /vbscript:/i,       // VBScript injection
    /onload=/i,         // Event handler injection
    /onerror=/i         // Event handler injection
  ]
  
  const checkForSuspiciousContent = (data) => {
    if (typeof data === 'string') {
      return suspiciousPatterns.some(pattern => pattern.test(data))
    }
    if (typeof data === 'object' && data !== null) {
      return Object.values(data).some(value => checkForSuspiciousContent(value))
    }
    return false
  }
  
  // Check URL, query params, and body for suspicious content
  const suspicious = 
    checkForSuspiciousContent(req.url) ||
    checkForSuspiciousContent(req.query) ||
    checkForSuspiciousContent(req.body)
  
  if (suspicious) {
    console.warn(`[SECURITY] ${req.requestId} Suspicious request detected`, {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?.userId,
      timestamp: new Date().toISOString()
    })
  }
  
  // Log authentication failures
  res.on('finish', () => {
    if (res.statusCode === 401 || res.statusCode === 403) {
      console.warn(`[SECURITY] ${req.requestId} Authentication/Authorization failure`, {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.user?.userId,
        timestamp: new Date().toISOString()
      })
    }
  })
  
  next()
}

/**
 * Structured application logging
 */
export class Logger {
  constructor(context = 'app') {
    this.context = context
  }
  
  info(message, meta = {}) {
    this.log('info', message, meta)
  }
  
  warn(message, meta = {}) {
    this.log('warn', message, meta)
  }
  
  error(message, meta = {}) {
    this.log('error', message, meta)
  }
  
  debug(message, meta = {}) {
    if (process.env.NODE_ENV === 'development') {
      this.log('debug', message, meta)
    }
  }
  
  log(level, message, meta = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      context: this.context,
      message,
      ...meta
    }
    
    // In production, you would send this to a logging service
    if (process.env.NODE_ENV === 'production') {
      // Example: Send to logging service
      console.log(JSON.stringify(logEntry))
    } else {
      console.log(`[${level.toUpperCase()}] ${this.context}: ${message}`, meta)
    }
  }
}

/**
 * Request context logger
 */
export const createRequestLogger = (req) => {
  return new Logger(`request:${req.requestId}`)
}

/**
 * Database operation logger
 */
export const dbLogger = new Logger('database')

/**
 * API operation logger
 */
export const apiLogger = new Logger('api')

/**
 * File operation logger
 */
export const fileLogger = new Logger('file')

/**
 * Package operation logger
 */
export const packageLogger = new Logger('package')

/**
 * Compilation operation logger
 */
export const compilationLogger = new Logger('compilation')

/**
 * Audit logging for sensitive operations
 */
export const auditLogger = (operation, req, details = {}) => {
  const auditEntry = {
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
    operation,
    userId: req.user?.userId,
    userEmail: req.user?.email,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    url: req.url,
    method: req.method,
    details: sanitizeLogData(details)
  }
  
  console.log(`[AUDIT] ${operation}`, auditEntry)
  
  // In production, send to audit logging service
  if (process.env.NODE_ENV === 'production') {
    // auditService.log(auditEntry)
  }
}

/**
 * Error tracking and monitoring
 */
export const errorTracker = (error, req, additionalContext = {}) => {
  const errorEntry = {
    timestamp: new Date().toISOString(),
    requestId: req?.requestId,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
      statusCode: error.statusCode
    },
    request: req ? {
      method: req.method,
      url: req.url,
      userId: req.user?.userId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    } : null,
    context: additionalContext
  }
  
  console.error(`[ERROR TRACKER]`, errorEntry)
  
  // In production, send to error tracking service
  if (process.env.NODE_ENV === 'production') {
    // errorTrackingService.captureException(error, errorEntry)
  }
}

/**
 * Metrics and analytics logger
 */
export const metricsLogger = {
  counter: (metric, value = 1, tags = {}) => {
    console.debug(`[METRIC] ${metric}: ${value}`, tags)
    // In production: metricsService.counter(metric, value, tags)
  },
  
  gauge: (metric, value, tags = {}) => {
    console.debug(`[METRIC] ${metric}: ${value}`, tags)
    // In production: metricsService.gauge(metric, value, tags)
  },
  
  histogram: (metric, value, tags = {}) => {
    console.debug(`[METRIC] ${metric}: ${value}`, tags)
    // In production: metricsService.histogram(metric, value, tags)
  },
  
  timing: (metric, duration, tags = {}) => {
    console.debug(`[METRIC] ${metric}: ${duration}ms`, tags)
    // In production: metricsService.timing(metric, duration, tags)
  }
}

/**
 * Log sanitization helper
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
    'session',
    'creditCard',
    'ssn',
    'email' // Sometimes you want to log email, sometimes not
  ]
  
  const sanitized = Array.isArray(data) ? [] : {}
  
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase()
    
    if (sensitiveFields.some(field => lowerKey.includes(field))) {
      sanitized[key] = '[REDACTED]'
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeLogData(value)
    } else {
      sanitized[key] = value
    }
  }
  
  return sanitized
}

/**
 * Request/Response data sanitizer for debugging
 */
export const sanitizeForLog = sanitizeLogData

/**
 * Performance monitoring helper
 */
export const measurePerformance = (name, fn) => {
  return async (...args) => {
    const start = process.hrtime.bigint()
    try {
      const result = await fn(...args)
      const duration = Number(process.hrtime.bigint() - start) / 1000000
      metricsLogger.timing(name, duration)
      return result
    } catch (error) {
      const duration = Number(process.hrtime.bigint() - start) / 1000000
      metricsLogger.timing(`${name}.error`, duration)
      throw error
    }
  }
}

/**
 * Default export for convenience
 */
export default {
  requestLogger,
  performanceLogger,
  securityLogger,
  Logger,
  createRequestLogger,
  auditLogger,
  errorTracker,
  metricsLogger,
  sanitizeForLog,
  measurePerformance
}
import expressRateLimit from 'express-rate-limit'

/**
 * Create rate limit middleware with custom options
 */
export const rateLimit = (options = {}) => {
  const defaultOptions = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
      success: false,
      error: 'Too many requests from this IP, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    
    // Custom key generator to include user ID if available
    keyGenerator: (req) => {
      if (req.user?.userId) {
        return `user:${req.user.userId}`
      }
      return req.ip
    },

    // Custom handler for rate limit exceeded
    handler: (req, res) => {
      const retryAfter = Math.round(options.windowMs / 1000) || 900 // 15 minutes default
      
      res.status(429).json({
        success: false,
        error: options.message || 'Too many requests, please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter,
        limit: options.max || 100,
        windowMs: options.windowMs || 15 * 60 * 1000
      })
    },

    // Skip rate limiting for certain conditions
    skip: (req) => {
      // Skip rate limiting for admin users
      if (req.user?.isAdmin) {
        return true
      }
      
      // Skip for health check endpoints
      if (req.path === '/health' || req.path === '/api/health') {
        return true
      }

      return false
    }
  }

  return expressRateLimit({ ...defaultOptions, ...options })
}

/**
 * Strict rate limiting for authentication endpoints
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true // Don't count successful requests
})

/**
 * Moderate rate limiting for API endpoints
 */
export const apiRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: 'Too many API requests, please slow down.'
})

/**
 * Lenient rate limiting for public endpoints
 */
export const publicRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many requests, please try again later.'
})

/**
 * Strict rate limiting for file upload endpoints
 */
export const uploadRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // 10 uploads per 5 minutes
  message: 'Too many file uploads, please wait before uploading more files.'
})

/**
 * Very strict rate limiting for expensive operations
 */
export const expensiveOperationRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5, // 5 operations per minute
  message: 'Too many expensive operations, please wait before trying again.'
})

/**
 * Rate limiting for search operations
 */
export const searchRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 searches per minute
  message: 'Too many search requests, please slow down.'
})

/**
 * Rate limiting for package operations
 */
export const packageRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50, // 50 package operations per 5 minutes
  message: 'Too many package requests, please try again later.'
})

/**
 * Rate limiting for compilation operations
 */
export const compilationRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // 20 compilations per 5 minutes
  message: 'Too many compilation requests, please wait before compiling again.'
})

/**
 * User-specific rate limiting that scales with subscription
 */
export const createUserRateLimit = (getUserLimits) => {
  return rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: (req) => {
      if (!req.user) {
        return 20 // Anonymous users get lower limits
      }

      const limits = getUserLimits(req.user)
      return limits.requestsPerMinute || 60
    },
    keyGenerator: (req) => {
      return req.user?.userId || req.ip
    },
    message: (req) => {
      const userType = req.user?.subscription?.plan || 'anonymous'
      return `Rate limit exceeded for ${userType} users. Please upgrade your plan for higher limits.`
    }
  })
}

/**
 * Dynamic rate limiting based on endpoint and user
 */
export const dynamicRateLimit = (config) => {
  return (req, res, next) => {
    const endpoint = req.route?.path || req.path
    const method = req.method.toLowerCase()
    const userPlan = req.user?.subscription?.plan || 'free'
    
    // Get configuration for this endpoint and user plan
    const endpointConfig = config[`${method}:${endpoint}`] || config[endpoint] || config.default
    const userConfig = endpointConfig[userPlan] || endpointConfig.default
    
    if (!userConfig) {
      return next() // No rate limiting configured
    }

    // Create rate limiter with user-specific config
    const limiter = rateLimit({
      windowMs: userConfig.windowMs || 60 * 1000,
      max: userConfig.max || 60,
      message: userConfig.message || 'Rate limit exceeded',
      keyGenerator: (req) => `${req.user?.userId || req.ip}:${endpoint}`
    })

    return limiter(req, res, next)
  }
}

/**
 * Rate limiting with Redis backend (for production)
 */
export const createRedisRateLimit = (redisClient) => {
  return (options = {}) => {
    return rateLimit({
      ...options,
      store: new expressRateLimit.MemoryStore(), // Would use Redis store in production
      
      // Custom store implementation for Redis
      onLimitReached: async (req, res, options) => {
        const key = options.keyGenerator(req)
        
        // Log rate limit violations
        console.warn('Rate limit exceeded:', {
          key,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          endpoint: req.path,
          timestamp: new Date().toISOString()
        })

        // Could also trigger alerts or notifications
        if (options.alertOnLimit) {
          // Send alert to monitoring system
        }
      }
    })
  }
}

/**
 * Sliding window rate limiter
 */
export const slidingWindowRateLimit = (options = {}) => {
  const {
    windowMs = 60 * 1000,
    maxRequests = 60,
    message = 'Rate limit exceeded'
  } = options

  const requestCounts = new Map()

  return (req, res, next) => {
    const key = req.user?.userId || req.ip
    const now = Date.now()
    const windowStart = now - windowMs

    // Clean old entries
    if (requestCounts.has(key)) {
      const requests = requestCounts.get(key)
      requestCounts.set(key, requests.filter(timestamp => timestamp > windowStart))
    }

    // Get current request count
    const requests = requestCounts.get(key) || []
    
    if (requests.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        error: message,
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil((requests[0] - windowStart) / 1000)
      })
    }

    // Add current request
    requests.push(now)
    requestCounts.set(key, requests)

    // Add rate limit headers
    res.set({
      'X-RateLimit-Limit': maxRequests,
      'X-RateLimit-Remaining': maxRequests - requests.length,
      'X-RateLimit-Reset': new Date(requests[0] + windowMs).toISOString()
    })

    next()
  }
}

/**
 * Adaptive rate limiting that adjusts based on system load
 */
export const adaptiveRateLimit = (options = {}) => {
  const {
    baseMax = 100,
    windowMs = 60 * 1000,
    loadThresholds = [0.5, 0.7, 0.9],
    reductionFactors = [1, 0.7, 0.5, 0.2]
  } = options

  return rateLimit({
    windowMs,
    max: (req) => {
      // Get current system load (simplified)
      const load = process.cpuUsage().system / 1000000 // Convert to percentage
      
      let factor = reductionFactors[0]
      for (let i = 0; i < loadThresholds.length; i++) {
        if (load > loadThresholds[i]) {
          factor = reductionFactors[i + 1]
        }
      }
      
      return Math.floor(baseMax * factor)
    },
    message: 'System is under high load. Please try again later.'
  })
}

/**
 * Rate limiting with priority queuing
 */
export const priorityRateLimit = (options = {}) => {
  const queues = {
    high: [],
    normal: [],
    low: []
  }

  const processQueue = () => {
    // Process high priority requests first
    const priorities = ['high', 'normal', 'low']
    
    for (const priority of priorities) {
      if (queues[priority].length > 0) {
        const { req, res, next } = queues[priority].shift()
        next()
        break
      }
    }
  }

  return (req, res, next) => {
    const priority = req.user?.subscription?.plan === 'enterprise' ? 'high' :
                    req.user?.subscription?.plan === 'pro' ? 'normal' : 'low'

    // Add to appropriate queue
    queues[priority].push({ req, res, next })

    // Process queue
    setImmediate(processQueue)
  }
}

export default rateLimit
# Middleware - Request Processing Layer

## Overview
Express.js middleware functions that handle cross-cutting concerns like authentication, validation, rate limiting, and error handling.

## Files

### `auth.js`
Authentication and authorization middleware:
- **auth()** - JWT token validation for protected routes
- **optionalAuth()** - Optional authentication for public endpoints
- **requireRole(role)** - Role-based authorization checking
- **apiKeyAuth()** - API key authentication for external integrations
- Token extraction from Authorization header or query parameters
- User context injection into request object
- Comprehensive error handling for invalid/expired tokens

### `validation.js`
Request validation using Joi schemas:
- **validate(schema)** - Validates request body against Joi schema
- **validateQuery(schema)** - Validates query parameters
- **validateParams(schema)** - Validates route parameters
- Detailed error messages with field-specific validation failures
- Automatic type coercion and sanitization
- Custom validation rules for Prompd-specific formats

### `rateLimit.js`
Rate limiting and abuse prevention:
- **rateLimit(options)** - Configurable rate limiting by IP/user
- **compilationRateLimit** - Specialized limits for resource-intensive operations
- **apiRateLimit** - API-specific rate limiting
- Redis-backed rate limiting for distributed deployments
- Different limits for authenticated vs anonymous users
- Graceful degradation when rate limit backend unavailable

### `errorHandler.js`
Global error handling and logging:
- **errorHandler(err, req, res, next)** - Centralized error processing
- Structured error logging with context
- Error sanitization to prevent information leakage
- Development vs production error responses
- Error categorization (validation, authentication, business logic, system)
- Integration with monitoring and alerting systems

### `logger.js`
Request/response logging and monitoring:
- **requestLogger** - Detailed request/response logging
- **performanceLogger** - Response time and performance metrics
- **securityLogger** - Security-related event logging
- Structured logging format (JSON) for log aggregation
- Request ID generation for distributed tracing
- Sensitive data redaction (passwords, tokens, PII)

### `cors.js`
Cross-Origin Resource Sharing configuration:
- **corsMiddleware** - CORS headers for browser requests
- Environment-specific origin whitelisting
- Credential handling for authenticated requests
- Preflight request handling
- Custom headers for API versioning and client identification

### `security.js`
Security headers and protection:
- **securityHeaders** - Security-focused HTTP headers
- **csrfProtection** - CSRF token validation
- **contentTypeValidation** - Request content type enforcement
- **inputSanitization** - XSS and injection prevention
- **fileUploadSecurity** - File upload validation and scanning

## Middleware Chain Order
1. **Security Headers** - Set security-related headers
2. **CORS** - Handle cross-origin requests
3. **Rate Limiting** - Apply rate limits before processing
4. **Request Logging** - Log incoming requests
5. **Body Parsing** - Parse request bodies
6. **Authentication** - Validate user credentials
7. **Input Validation** - Validate request data
8. **Route Handler** - Execute business logic
9. **Response Logging** - Log outgoing responses
10. **Error Handling** - Process any errors

## Configuration
- **Environment Variables** - Different settings per environment
- **Redis Configuration** - For distributed rate limiting
- **JWT Settings** - Token signing and validation parameters
- **Logging Levels** - Debug, info, warn, error levels
- **Rate Limit Rules** - Per-endpoint and per-user limits

## Security Features
- **JWT Token Validation** - Secure user authentication
- **Rate Limiting** - Prevent abuse and DoS attacks
- **Input Sanitization** - Prevent XSS and injection attacks
- **CORS Protection** - Control cross-origin access
- **Security Headers** - Browser security features
- **Request Size Limits** - Prevent resource exhaustion
- **File Upload Security** - Validate and scan uploaded files
/**
 * Logger utility that wraps console methods and can be disabled in production.
 * Also supports remote error reporting for production error tracking.
 *
 * Usage:
 *   import { logger } from './lib/logger'
 *   logger.log('[Component] message', data)
 *   logger.warn('[Component] warning')
 *   logger.error('[Component] error', error)
 *
 * To disable logging:
 *   - Set VITE_DISABLE_LOGGING=true in .env
 *   - Or call logger.setEnabled(false) at runtime
 *
 * Remote error reporting:
 *   - Errors and warnings are always sent to the remote endpoint in production
 *   - Configure via logger.setRemoteEndpoint(url) or VITE_ERROR_REPORTING_URL
 *   - Compatible with Sentry, LogRocket, or custom endpoints
 */

// Check if logging is enabled (default: enabled in development, disabled in production)
const isProduction = import.meta.env.PROD
const envDisabled = import.meta.env.VITE_DISABLE_LOGGING === 'true'
let loggingEnabled = !isProduction && !envDisabled

// Optional: filter logs by prefix (e.g., only show '[useAgentMode]' logs)
let prefixFilter: string | null = null

// Remote error reporting configuration
// Default to /api/errors which Vite proxies to the backend
let remoteEndpoint: string | null = import.meta.env.VITE_ERROR_REPORTING_URL || '/api/errors'
let remoteReportingEnabled = isProduction // Only enabled in production by default

// Error context for better debugging
interface ErrorContext {
  userId?: string
  sessionId?: string
  appVersion?: string
  platform?: string
  extra?: Record<string, unknown>
}

// Import lazily to avoid circular dependencies
const getAppVersion = () => {
  try {
    // Dynamic import to avoid bundler issues with constants
    return import.meta.env.VITE_APP_VERSION || '0.1.0'
  } catch {
    return 'unknown'
  }
}

let errorContext: ErrorContext = {
  appVersion: getAppVersion(),
  platform: typeof window !== 'undefined' && 'electronAPI' in window ? 'electron' : 'web'
}

/**
 * Send error to remote endpoint
 */
async function reportToRemote(
  level: 'error' | 'warn',
  message: string,
  error?: Error | unknown,
  extra?: Record<string, unknown>
): Promise<void> {
  if (!remoteEndpoint || !remoteReportingEnabled) return

  try {
    const payload = {
      level,
      message,
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error,
      context: {
        ...errorContext,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        ...extra
      }
    }

    // Fire and forget - don't block on network
    fetch(remoteEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => {
      // Silently fail - we don't want error reporting to cause more errors
    })
  } catch {
    // Silently fail
  }
}

/**
 * Extract error and message from arguments
 */
function extractErrorInfo(args: unknown[]): { message: string; error?: Error } {
  let message = ''
  let error: Error | undefined

  for (const arg of args) {
    if (arg instanceof Error) {
      error = arg
      if (!message) message = arg.message
    } else if (typeof arg === 'string') {
      message = message ? `${message} ${arg}` : arg
    } else if (arg !== null && arg !== undefined) {
      message = message ? `${message} ${String(arg)}` : String(arg)
    }
  }

  return { message, error }
}

/**
 * Logger that can be disabled for production builds
 */
export const logger = {
  /**
   * Enable or disable all logging at runtime
   */
  setEnabled(enabled: boolean): void {
    loggingEnabled = enabled
  },

  /**
   * Check if logging is currently enabled
   */
  isEnabled(): boolean {
    return loggingEnabled
  },

  /**
   * Set a prefix filter - only logs matching this prefix will be shown
   * Pass null to show all logs
   */
  setFilter(prefix: string | null): void {
    prefixFilter = prefix
  },

  /**
   * Configure remote error reporting endpoint
   * Set to null to disable remote reporting
   */
  setRemoteEndpoint(url: string | null): void {
    remoteEndpoint = url
  },

  /**
   * Enable or disable remote error reporting
   */
  setRemoteReportingEnabled(enabled: boolean): void {
    remoteReportingEnabled = enabled
  },

  /**
   * Set context that will be included with all error reports
   * Useful for user identification, session tracking, etc.
   */
  setContext(context: Partial<ErrorContext>): void {
    errorContext = { ...errorContext, ...context }
  },

  /**
   * Log a message (equivalent to console.log)
   */
  log(...args: unknown[]): void {
    if (!loggingEnabled) return
    if (prefixFilter && typeof args[0] === 'string' && !args[0].includes(prefixFilter)) return
    console.log(...args)
  },

  /**
   * Log a debug message (equivalent to console.debug)
   */
  debug(...args: unknown[]): void {
    if (!loggingEnabled) return
    if (prefixFilter && typeof args[0] === 'string' && !args[0].includes(prefixFilter)) return
    console.debug(...args)
  },

  /**
   * Log a warning (equivalent to console.warn)
   * Warnings are always shown even when logging is disabled
   * In production, warnings are sent to remote endpoint
   */
  warn(...args: unknown[]): void {
    console.warn(...args)
    // Report warnings to remote in production
    const { message, error } = extractErrorInfo(args)
    reportToRemote('warn', message, error)
  },

  /**
   * Log an error (equivalent to console.error)
   * Errors are always shown even when logging is disabled
   * In production, errors are sent to remote endpoint
   */
  error(...args: unknown[]): void {
    console.error(...args)
    // Report errors to remote in production
    const { message, error } = extractErrorInfo(args)
    reportToRemote('error', message, error)
  },

  /**
   * Capture an exception explicitly (for try/catch blocks)
   * Always reports to remote regardless of logging settings
   */
  captureException(error: Error, extra?: Record<string, unknown>): void {
    console.error('[Exception]', error)
    reportToRemote('error', error.message, error, extra)
  },

  /**
   * Log with a specific tag/component name
   * Automatically adds brackets around the tag
   */
  tagged(tag: string, ...args: unknown[]): void {
    if (!loggingEnabled) return
    if (prefixFilter && !tag.includes(prefixFilter)) return
    console.log(`[${tag}]`, ...args)
  },

  /**
   * Create a scoped logger for a specific component/module
   * Returns a logger instance that automatically prefixes all messages
   */
  scope(tag: string) {
    const prefix = `[${tag}]`
    return {
      log: (...args: unknown[]) => {
        if (!loggingEnabled) return
        if (prefixFilter && !tag.includes(prefixFilter)) return
        console.log(prefix, ...args)
      },
      debug: (...args: unknown[]) => {
        if (!loggingEnabled) return
        if (prefixFilter && !tag.includes(prefixFilter)) return
        console.debug(prefix, ...args)
      },
      warn: (...args: unknown[]) => {
        console.warn(prefix, ...args)
        const { message, error } = extractErrorInfo(args)
        reportToRemote('warn', `${prefix} ${message}`, error)
      },
      error: (...args: unknown[]) => {
        console.error(prefix, ...args)
        const { message, error } = extractErrorInfo(args)
        reportToRemote('error', `${prefix} ${message}`, error)
      },
      captureException: (error: Error, extra?: Record<string, unknown>) => {
        console.error(prefix, error)
        reportToRemote('error', `${prefix} ${error.message}`, error, extra)
      }
    }
  },

  /**
   * Group related logs together (uses console.group)
   */
  group(label: string): void {
    if (!loggingEnabled) return
    console.group(label)
  },

  /**
   * End a log group
   */
  groupEnd(): void {
    if (!loggingEnabled) return
    console.groupEnd()
  },

  /**
   * Log a table (uses console.table)
   */
  table(data: unknown): void {
    if (!loggingEnabled) return
    console.table(data)
  }
}

// Export a default instance
export default logger

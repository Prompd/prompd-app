/**
 * Environment Variables Cache for IntelliSense
 *
 * This module stores environment variables loaded from .env files
 * and makes them available to the intellisense completion provider.
 */

// Cache for environment variables (for intellisense)
// This is populated by the envLoader when .env files are loaded
let envVarsCache: Record<string, string> = {}

/**
 * Update the environment variables cache for intellisense
 * Call this when env vars are loaded from .env files
 */
export function setEnvVarsCache(envVars: Record<string, string>): void {
  envVarsCache = { ...envVars }
  console.log('[intellisense] Updated env vars cache with', Object.keys(envVars).length, 'variables:', Object.keys(envVars))
}

/**
 * Get the current environment variables cache
 * Used by completion providers for env var suggestions
 */
export function getEnvVarsCache(): Record<string, string> {
  return envVarsCache
}

/**
 * Clear the environment variables cache
 */
export function clearEnvVarsCache(): void {
  envVarsCache = {}
}

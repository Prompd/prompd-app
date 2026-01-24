/**
 * API Configuration Utility
 *
 * Centralized configuration for all API endpoints.
 * Handles URL resolution for web, Electron dev, and Electron production environments.
 *
 * IMPORTANT: All services should use these functions - no hardcoded URLs!
 * NOTE: For registry URL, use prompdSettings.getRegistryUrl() - it's the single source of truth
 */

import { prompdSettings } from './prompdSettings'

// Storage keys
const API_BASE_KEY = 'prompd.apiBase'
const PRMD_API_KEY = 'prompd.prmdApiBase'

// Default URLs (used when no override is set)
// These can be overridden via environment variables
const DEFAULT_BACKEND_HOST = import.meta.env.VITE_BACKEND_HOST || 'http://localhost:3010'

// Connection state
type ConnectionStatus = 'connected' | 'disconnected' | 'checking' | 'unknown'

interface ConnectionState {
  backend: ConnectionStatus
  registry: ConnectionStatus
  lastChecked: number | null
  error: string | null
}

let connectionState: ConnectionState = {
  backend: 'unknown',
  registry: 'unknown',
  lastChecked: null,
  error: null
}

const connectionListeners: Set<(state: ConnectionState) => void> = new Set()

/**
 * Detect if we're running in Electron
 */
export function isElectron(): boolean {
  return !!(window as unknown as { electronAPI?: { isElectron?: boolean } }).electronAPI?.isElectron
}

/**
 * Detect if we're in Electron production mode (packaged app)
 * In dev mode, ELECTRON_START_URL is set and we use Vite proxy
 */
export function isElectronProduction(): boolean {
  if (!isElectron()) return false
  // In production, the app loads from file:// protocol
  // In dev, it loads from http://127.0.0.1:5173
  return window.location.protocol === 'file:'
}

/**
 * Get the backend host URL (without /api path)
 * This is the base for health checks and non-API endpoints
 */
export function getBackendHost(): string {
  const stored = localStorage.getItem(API_BASE_KEY)
  if (stored) {
    // Strip /api suffix if present to get just the host
    return stored.replace(/\/api\/?$/, '')
  }

  if (isElectronProduction()) {
    return DEFAULT_BACKEND_HOST
  }

  // In web/dev mode, use origin for relative URLs
  return window.location.origin
}

/**
 * Get the WebSocket/Socket.io URL for real-time connections
 * This ALWAYS returns the actual backend URL, not the Vite proxy
 * because Vite doesn't proxy WebSocket connections for socket.io
 */
export function getSocketUrl(): string {
  const stored = localStorage.getItem(API_BASE_KEY)
  if (stored) {
    // Strip /api suffix if present to get just the host
    return stored.replace(/\/api\/?$/, '')
  }

  // Always return the actual backend host for WebSocket connections
  // Vite's proxy only works for HTTP requests, not WebSocket
  return DEFAULT_BACKEND_HOST
}

/**
 * Get the API base URL (WITH /api path)
 * Use this for all API calls - it always includes /api
 *
 * Returns: '/api' in dev mode, 'http://localhost:3010/api' in Electron production
 */
export function getApiBaseUrl(): string {
  const stored = localStorage.getItem(API_BASE_KEY)
  if (stored) {
    // Ensure /api suffix
    return stored.endsWith('/api') ? stored : `${stored}/api`
  }

  if (isElectronProduction()) {
    return `${DEFAULT_BACKEND_HOST}/api`
  }

  // In web or Electron dev mode, use relative URL (Vite proxy handles it)
  return import.meta.env.VITE_API_BASE_URL || '/api'
}

/**
 * Get the Registry API URL
 * Delegates to prompdSettings for single source of truth
 */
export function getRegistryUrl(): string {
  return prompdSettings.getRegistryUrl()
}

/**
 * Set custom backend URL (persisted to localStorage)
 * @param url - The backend host URL (with or without /api suffix)
 */
export function setApiBaseUrl(url: string): void {
  // Normalize: store with /api suffix
  const normalized = url.endsWith('/api') ? url : `${url.replace(/\/$/, '')}/api`
  localStorage.setItem(API_BASE_KEY, normalized)
  // Re-check connection after URL change
  checkBackendConnection()
}

/**
 * Set custom registry URL
 * Delegates to prompdSettings for single source of truth
 */
export function setRegistryUrl(url: string): void {
  prompdSettings.setRegistryUrl(url.replace(/\/$/, ''))
}

/**
 * Set custom Prmd.ai API URL
 */
export function setPrmdApiUrl(url: string): void {
  localStorage.setItem(PRMD_API_KEY, url.replace(/\/$/, ''))
}

/**
 * Clear all custom URLs (revert to defaults)
 */
export function clearCustomUrls(): void {
  localStorage.removeItem(API_BASE_KEY)
  localStorage.removeItem(PRMD_API_KEY)
  prompdSettings.resetRegistryUrl()
}

/**
 * Clear just the API base URL
 */
export function clearApiBaseUrl(): void {
  localStorage.removeItem(API_BASE_KEY)
}

// ============================================================================
// Connection Validation
// ============================================================================

/**
 * Subscribe to connection state changes
 * Returns unsubscribe function
 */
export function onConnectionChange(callback: (state: ConnectionState) => void): () => void {
  connectionListeners.add(callback)
  // Send current state immediately
  callback(connectionState)
  return () => connectionListeners.delete(callback)
}

/**
 * Get current connection state
 */
export function getConnectionState(): ConnectionState {
  return { ...connectionState }
}

function updateConnectionState(updates: Partial<ConnectionState>): void {
  connectionState = { ...connectionState, ...updates }
  connectionListeners.forEach(cb => cb(connectionState))
}

/**
 * Check backend connection health
 * Returns true if connected, false otherwise
 */
export async function checkBackendConnection(): Promise<boolean> {
  updateConnectionState({ backend: 'checking', error: null })

  try {
    const host = getBackendHost()
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    const response = await fetch(`${host}/health`, {
      method: 'GET',
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (response.ok) {
      updateConnectionState({
        backend: 'connected',
        lastChecked: Date.now(),
        error: null
      })
      return true
    } else {
      updateConnectionState({
        backend: 'disconnected',
        lastChecked: Date.now(),
        error: `Backend returned ${response.status}`
      })
      return false
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const isAbort = error instanceof Error && error.name === 'AbortError'

    updateConnectionState({
      backend: 'disconnected',
      lastChecked: Date.now(),
      error: isAbort ? 'Connection timeout - backend may not be running' : message
    })

    console.warn('[apiConfig] Backend connection check failed:', message)
    return false
  }
}

/**
 * Check registry connection health
 */
export async function checkRegistryConnection(): Promise<boolean> {
  updateConnectionState({ registry: 'checking' })

  try {
    const registryUrl = getRegistryUrl()
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    // Try the packages endpoint as a health check
    const response = await fetch(`${registryUrl}/packages?limit=1`, {
      method: 'GET',
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (response.ok) {
      updateConnectionState({ registry: 'connected' })
      return true
    } else {
      updateConnectionState({ registry: 'disconnected' })
      return false
    }
  } catch (error) {
    updateConnectionState({ registry: 'disconnected' })
    return false
  }
}

/**
 * Check all connections
 */
export async function checkAllConnections(): Promise<{ backend: boolean; registry: boolean }> {
  const [backend, registry] = await Promise.all([
    checkBackendConnection(),
    checkRegistryConnection()
  ])
  return { backend, registry }
}

/**
 * Initialize connection checks on app startup
 * Call this once when the app loads
 */
export function initializeConnectionChecks(): void {
  // Initial check
  checkAllConnections()

  // Periodic re-check every 30 seconds
  setInterval(() => {
    // Only re-check if we were disconnected
    if (connectionState.backend === 'disconnected') {
      checkBackendConnection()
    }
  }, 30000)

  // Re-check when coming back online
  window.addEventListener('online', () => {
    console.log('[apiConfig] Network online, checking connections...')
    checkAllConnections()
  })

  window.addEventListener('offline', () => {
    console.log('[apiConfig] Network offline')
    updateConnectionState({
      backend: 'disconnected',
      registry: 'disconnected',
      error: 'No network connection'
    })
  })
}

// ============================================================================
// User Sync
// ============================================================================

// Track if user has been synced this session to prevent duplicate calls
let userSynced = false
let syncPromise: Promise<boolean> | null = null

/**
 * Sync user with backend on sign-in
 * This ensures the user exists in the database before any other authenticated requests
 * Uses a promise to prevent race conditions - multiple callers will wait for the same sync
 *
 * @param getToken - Function to get the auth token
 * @returns true if sync succeeded, false otherwise
 */
export async function syncUserOnSignIn(getToken: () => Promise<string | null>): Promise<boolean> {
  // Already synced this session
  if (userSynced) {
    return true
  }

  // If sync is in progress, wait for it
  if (syncPromise) {
    return syncPromise
  }

  // Start sync
  syncPromise = (async () => {
    try {
      const token = await getToken()
      if (!token) {
        console.warn('[apiConfig] No token available for user sync')
        return false
      }

      const apiBase = getApiBaseUrl()
      const response = await fetch(`${apiBase}/auth/sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        console.log('[apiConfig] User synced successfully:', data.user?.email)
        userSynced = true
        return true
      } else {
        const error = await response.text()
        console.error('[apiConfig] User sync failed:', response.status, error)
        return false
      }
    } catch (error) {
      console.error('[apiConfig] User sync error:', error)
      return false
    } finally {
      syncPromise = null
    }
  })()

  return syncPromise
}

/**
 * Reset user sync state (call on sign-out)
 */
export function resetUserSyncState(): void {
  userSynced = false
  syncPromise = null
}

/**
 * Check if user has been synced this session
 */
export function isUserSynced(): boolean {
  return userSynced
}

/**
 * Wait for user sync to complete (if in progress)
 * Returns true if synced, false if not synced or sync failed
 * Use this before making authenticated API calls
 */
export async function waitForUserSync(): Promise<boolean> {
  if (userSynced) {
    return true
  }
  if (syncPromise) {
    return syncPromise
  }
  // Not synced and no sync in progress - caller should trigger sync
  return false
}

// ============================================================================
// Debug / Development Helpers
// ============================================================================

/**
 * Log current configuration (for debugging)
 */
export function logConfig(): void {
  console.log('[apiConfig] Current configuration:')
  console.log('  isElectron:', isElectron())
  console.log('  isElectronProduction:', isElectronProduction())
  console.log('  backendHost:', getBackendHost())
  console.log('  apiBaseUrl:', getApiBaseUrl())
  console.log('  registryUrl:', getRegistryUrl())
  console.log('  connectionState:', connectionState)
}

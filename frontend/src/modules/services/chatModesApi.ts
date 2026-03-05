/**
 * Chat Modes API Service
 * Fetches chat mode configurations from the backend
 * Caches to localStorage for offline use
 */
import { getApiBaseUrl } from './apiConfig'

export interface ChatModeConfig {
  id: string
  label: string
  icon: string
  description: string
  systemPrompt: string
  settings?: {
    maxIterations?: number
    streamResponses?: boolean
    permissionLevels?: Record<string, {
      label: string
      description: string
      requiresApprovalTools: string[]
    }>
    defaultPermissionLevel?: string
  }
  followUpStrategies?: {
    detailed?: string
    vague?: string
    modification?: string
    decline?: string
  }
  examples?: Array<{
    userInput: string
    aiResponse: string
    action: string
  }>
}

export interface ChatModesResponse {
  modes: Record<string, ChatModeConfig>
  version: string
  lastUpdated: string
}

const CACHE_KEY = 'prompd_chat_modes_cache'

/**
 * Get cached chat modes from localStorage
 */
function getCachedModes(): ChatModesResponse | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (cached) {
      console.log('[chatModesApi] Loaded chat modes from cache')
      return JSON.parse(cached)
    }
  } catch (error) {
    console.warn('[chatModesApi] Failed to load cache:', error)
  }
  return null
}

/**
 * Save chat modes to localStorage cache
 */
function cacheModes(modes: ChatModesResponse): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(modes))
    console.log('[chatModesApi] Cached chat modes to localStorage')
  } catch (error) {
    console.warn('[chatModesApi] Failed to cache modes:', error)
  }
}

// Module-level singleton: one fetch shared across all callers
let inflight: Promise<ChatModesResponse> | null = null
let resolved: ChatModesResponse | null = null

/**
 * Fetch all chat mode configurations from the backend.
 * Deduplicates concurrent calls — first caller triggers the fetch,
 * all subsequent callers share the same promise/result.
 * Falls back to localStorage cache if offline or API fails.
 */
export async function fetchChatModes(): Promise<ChatModesResponse> {
  // Return cached result immediately if already fetched this session
  if (resolved) return resolved

  // Return in-flight promise if a fetch is already in progress
  if (inflight) return inflight

  inflight = (async () => {
    const base = getApiBaseUrl()
    const url = `${base}/chat-modes`

    try {
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Failed to fetch chat modes: ${response.statusText} (URL: ${url}, base: ${base})`)
      }

      const data = await response.json()

      // Cache the fresh data
      cacheModes(data)
      resolved = data

      return data
    } catch (error) {
      console.warn('[chatModesApi] API fetch failed, trying cache:', error)

      // Try to use cached data
      const cached = getCachedModes()
      if (cached) {
        console.log('[chatModesApi] Using cached chat modes (offline mode)')
        resolved = cached
        return cached
      }

      // No cache available, throw error
      throw new Error(`Failed to fetch chat modes and no cache available: ${error}`)
    } finally {
      inflight = null
    }
  })()

  return inflight
}

/**
 * Fetch a specific chat mode configuration
 */
export async function fetchChatMode(modeId: string): Promise<ChatModeConfig> {
  const response = await fetch(`${getApiBaseUrl()}/chat-modes/${modeId}`)

  if (!response.ok) {
    throw new Error(`Failed to fetch chat mode ${modeId}: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Convert chat modes response to array format for UI components
 * Includes systemPrompt for use in chat
 */
export function chatModesToArray(modes: Record<string, ChatModeConfig>): Array<{
  id: string
  label: string
  icon: string
  description: string
  systemPrompt: string
}> {
  return Object.values(modes).map(mode => ({
    id: mode.id,
    label: mode.label,
    icon: mode.icon,
    description: mode.description,
    systemPrompt: mode.systemPrompt
  }))
}

/**
 * Startup API Service
 * Fetches news and platform info from the backend on startup
 * with localStorage caching for offline support
 */

const CACHE_KEY = 'prompd_startup_cache'
const DISMISSED_KEY = 'prompd_dismissed_news'

export interface NewsAction {
  type: 'link' | 'settings' | 'registry' | 'update' | 'dismiss'
  label: string
  target?: string
  config?: {
    provider?: string
    [key: string]: unknown
  }
}

export interface NewsItem {
  id: string
  title: string
  description: string
  icon?: string
  type: 'announcement' | 'release' | 'tip' | 'community' | 'warning'
  date: string
  priority?: number
  action?: NewsAction
  dismissible?: boolean
  expiresAt?: string
}

export interface StartupData {
  platform: {
    latestVersion: string
    downloadUrl?: string
  }
  registry: {
    status: 'online' | 'degraded' | 'offline'
    packageCount: number
    featuredPackages?: string[]
  }
  news: NewsItem[]
}

interface CachedStartup {
  data: StartupData
  fetchedAt: number
}

/**
 * Get the API base URL from environment or default
 */
function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL || '/api'
}

/**
 * Fetch startup data from the API with caching
 * Falls back to cached data or smart defaults when offline
 */
export async function fetchStartupData(): Promise<StartupData> {
  // Try cache first for instant display
  const cached = getCachedStartup()

  // Check if online
  if (!navigator.onLine) {
    console.log('[startupApi] Offline, using cached data')
    return cached?.data ?? getSmartDefaults()
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}/startup`, {
      signal: AbortSignal.timeout(5000)
    })

    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status}`)
    }

    const result = await response.json()
    if (result.success) {
      cacheStartup(result.data)
      return result.data
    }
    throw new Error('API returned success: false')
  } catch (error) {
    console.warn('[startupApi] Fetch failed, using cache:', error)
    return cached?.data ?? getSmartDefaults()
  }
}

/**
 * Get smart default data when no cache and offline
 */
function getSmartDefaults(): StartupData {
  return {
    platform: { latestVersion: '1.0.0' },
    registry: { status: 'online', packageCount: 0 },
    news: [
      {
        id: 'welcome-default',
        title: 'Welcome to Prompd',
        description: 'Create, manage, and share AI prompts.',
        type: 'tip',
        date: new Date().toISOString().split('T')[0]
      }
    ]
  }
}

/**
 * Cache startup data to localStorage
 */
function cacheStartup(data: StartupData): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      data,
      fetchedAt: Date.now()
    }))
  } catch (error) {
    console.warn('[startupApi] Failed to cache startup data:', error)
  }
}

/**
 * Get cached startup data from localStorage
 */
function getCachedStartup(): CachedStartup | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    return cached ? JSON.parse(cached) : null
  } catch {
    return null
  }
}

/**
 * Dismiss a news item (stores ID in localStorage)
 */
export function dismissNews(newsId: string): void {
  const dismissed = getDismissedNews()
  dismissed.add(newsId)
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed]))
  } catch (error) {
    console.warn('[startupApi] Failed to save dismissed news:', error)
  }
}

/**
 * Get set of dismissed news IDs
 */
export function getDismissedNews(): Set<string> {
  try {
    const stored = localStorage.getItem(DISMISSED_KEY)
    return new Set(stored ? JSON.parse(stored) : [])
  } catch {
    return new Set()
  }
}

/**
 * Filter news items, removing dismissed and expired
 */
export function filterVisibleNews(news: NewsItem[]): NewsItem[] {
  const dismissedIds = getDismissedNews()
  const now = new Date()

  return news.filter(item =>
    !dismissedIds.has(item.id) &&
    (!item.expiresAt || new Date(item.expiresAt) > now)
  )
}

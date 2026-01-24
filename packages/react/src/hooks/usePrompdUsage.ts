import { useCallback, useMemo } from 'react'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import {
  UsageEvent,
  UsageEventType,
  UsageStats,
  calculateUsageStats,
  createUsageEvent
} from '../components/PrompdUsageTracker'

const STORAGE_KEY = 'prompd-usage-events'
const MAX_EVENTS = 1000 // Keep last 1000 events

export interface UsePrompdUsageOptions {
  persist?: boolean        // Persist to localStorage (default: true)
  maxEvents?: number       // Max events to keep (default: 1000)
  sessionOnly?: boolean    // Only track current session (default: false)
}

export interface UsePrompdUsageReturn {
  events: UsageEvent[]
  stats: UsageStats
  trackUsage: (
    type: UsageEventType,
    provider: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    metadata?: UsageEvent['metadata']
  ) => UsageEvent
  clearUsage: () => void
  getSessionStats: () => UsageStats
  getTodayStats: () => UsageStats
}

// Session start time (set once when module loads)
const sessionStart = new Date().toISOString()

// Zustand store interface
interface UsageStore {
  events: UsageEvent[]
  addEvent: (event: UsageEvent) => void
  clearEvents: () => void
}

// Global Zustand store with localStorage persistence
// This ensures all components share the same state
const useUsageStore = create<UsageStore>()(
  persist(
    (set) => ({
      events: [],
      addEvent: (event: UsageEvent) => set((state) => {
        const updated = [...state.events, event]
        // Keep only the last MAX_EVENTS
        if (updated.length > MAX_EVENTS) {
          return { events: updated.slice(-MAX_EVENTS) }
        }
        return { events: updated }
      }),
      clearEvents: () => set({ events: [] })
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ events: state.events })
    }
  )
)

/**
 * Hook for tracking LLM usage across the application
 * Uses a global Zustand store so all components share the same usage data
 */
export function usePrompdUsage(options: UsePrompdUsageOptions = {}): UsePrompdUsageReturn {
  const { sessionOnly = false } = options

  // Subscribe to the global store
  const events = useUsageStore((state) => state.events)
  const addEvent = useUsageStore((state) => state.addEvent)
  const clearEvents = useUsageStore((state) => state.clearEvents)

  /**
   * Track a new usage event
   */
  const trackUsage = useCallback((
    type: UsageEventType,
    provider: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    metadata?: UsageEvent['metadata']
  ): UsageEvent => {
    const event = createUsageEvent(type, provider, model, inputTokens, outputTokens, metadata)
    addEvent(event)
    return event
  }, [addEvent])

  /**
   * Clear all usage history
   */
  const clearUsage = useCallback(() => {
    clearEvents()
  }, [clearEvents])

  /**
   * Get stats for current session only
   */
  const getSessionStats = useCallback((): UsageStats => {
    const sessionEvents = events.filter(e => e.timestamp >= sessionStart)
    return calculateUsageStats(sessionEvents)
  }, [events])

  /**
   * Get stats for today only
   */
  const getTodayStats = useCallback((): UsageStats => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString()

    const todayEvents = events.filter(e => e.timestamp >= todayStr)
    return calculateUsageStats(todayEvents)
  }, [events])

  // Compute stats from events (memoized)
  const stats = useMemo(() => calculateUsageStats(events), [events])

  // For sessionOnly mode, filter events
  const filteredEvents = useMemo(() => {
    if (sessionOnly) {
      return events.filter(e => e.timestamp >= sessionStart)
    }
    return events
  }, [events, sessionOnly])

  return {
    events: filteredEvents,
    stats,
    trackUsage,
    clearUsage,
    getSessionStats,
    getTodayStats
  }
}
import { useState, useCallback } from 'react'
import type { UsePrompdSessionReturn, PrompdSession } from '../types'
import { usePrompd } from '../context/PrompdContext'

export function usePrompdSession(initialSessionId?: string): UsePrompdSessionReturn {
  const { apiBaseUrl } = usePrompd()
  const [session, setSession] = useState<PrompdSession | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const saveSession = useCallback(async () => {
    if (!session) return

    setIsLoading(true)
    try {
      const response = await fetch(`${apiBaseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session)
      })

      if (!response.ok) {
        throw new Error('Failed to save session')
      }

      const savedSession = await response.json()
      setSession(savedSession)
    } catch (error) {
      console.error('Failed to save session:', error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [apiBaseUrl, session])

  const loadSession = useCallback(async (sessionId: string) => {
    setIsLoading(true)
    try {
      const response = await fetch(`${apiBaseUrl}/api/sessions/${sessionId}`)

      if (!response.ok) {
        throw new Error('Failed to load session')
      }

      const loadedSession = await response.json()
      setSession(loadedSession)
    } catch (error) {
      console.error('Failed to load session:', error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [apiBaseUrl])

  const updateContext = useCallback((context: Partial<PrompdSession>) => {
    setSession(prev => {
      if (!prev) {
        return {
          id: initialSessionId || `session_${Date.now()}`,
          messages: [],
          context: new Map(),
          pinnedPackages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...context
        }
      }

      return {
        ...prev,
        ...context,
        updatedAt: new Date().toISOString()
      }
    })
  }, [initialSessionId])

  return {
    session,
    isLoading,
    saveSession,
    loadSession,
    updateContext
  }
}

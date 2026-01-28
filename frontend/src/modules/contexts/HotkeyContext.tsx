import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'
import { HotkeyAction, DEFAULT_HOTKEYS, HotkeyConfig, hotkeyMatches } from '../types/hotkeys'

interface HotkeyContextValue {
  hotkeys: Record<string, HotkeyAction>
  updateHotkey: (actionId: string, config: HotkeyConfig) => void
  resetHotkey: (actionId: string) => void
  resetAllHotkeys: () => void
  registerHandler: (actionId: string, handler: () => void) => void
  unregisterHandler: (actionId: string) => void
}

const HotkeyContext = createContext<HotkeyContextValue | undefined>(undefined)

const STORAGE_KEY = 'prompd.hotkeys'

export function HotkeyProvider({ children }: { children: ReactNode }) {
  const [hotkeys, setHotkeys] = useState<Record<string, HotkeyAction>>(() => {
    // Load from localStorage
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        // Merge with defaults to ensure new hotkeys are added
        return { ...DEFAULT_HOTKEYS, ...parsed }
      } catch {
        return DEFAULT_HOTKEYS
      }
    }
    return DEFAULT_HOTKEYS
  })

  const [handlers, setHandlers] = useState<Record<string, () => void>>({})

  // Save to localStorage whenever hotkeys change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(hotkeys))
  }, [hotkeys])

  const updateHotkey = useCallback((actionId: string, config: HotkeyConfig) => {
    setHotkeys(prev => ({
      ...prev,
      [actionId]: {
        ...prev[actionId],
        config
      }
    }))
  }, [])

  const resetHotkey = useCallback((actionId: string) => {
    setHotkeys(prev => ({
      ...prev,
      [actionId]: {
        ...prev[actionId],
        config: prev[actionId].defaultConfig
      }
    }))
  }, [])

  const resetAllHotkeys = useCallback(() => {
    setHotkeys(DEFAULT_HOTKEYS)
  }, [])

  const registerHandler = useCallback((actionId: string, handler: () => void) => {
    setHandlers(prev => ({ ...prev, [actionId]: handler }))
  }, [])

  const unregisterHandler = useCallback((actionId: string) => {
    setHandlers(prev => {
      const { [actionId]: _, ...rest } = prev
      return rest
    })
  }, [])

  // Global keyboard event handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input field
      const target = e.target as HTMLElement
      const isTyping = target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('.monaco-editor') // Skip Monaco editor as well

      if (isTyping) {
        return
      }

      // Find matching hotkey
      for (const [actionId, action] of Object.entries(hotkeys)) {
        if (hotkeyMatches(e, action.config)) {
          e.preventDefault()
          const handler = handlers[actionId]
          if (handler) {
            handler()
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hotkeys, handlers])

  return (
    <HotkeyContext.Provider value={{
      hotkeys,
      updateHotkey,
      resetHotkey,
      resetAllHotkeys,
      registerHandler,
      unregisterHandler
    }}>
      {children}
    </HotkeyContext.Provider>
  )
}

export function useHotkeys() {
  const context = useContext(HotkeyContext)
  if (!context) {
    throw new Error('useHotkeys must be used within HotkeyProvider')
  }
  return context
}

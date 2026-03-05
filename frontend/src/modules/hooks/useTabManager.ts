/**
 * TabManager Hook
 *
 * Centralizes tab management operations and handles file-tab synchronization.
 * Prevents common issues like:
 * - Duplicate tabs for the same file
 * - Tabs getting stuck when files are renamed/deleted
 * - State desynchronization between filesystem and tabs
 *
 * PERFORMANCE NOTE: This hook uses getState() for lookups to avoid
 * subscribing to the tabs array and causing excessive re-renders.
 */

import { useCallback, useRef } from 'react'
import { useEditorStore, useUIStore } from '../../stores'
import type { Tab } from '../../stores/types'

// Generate unique tab ID
const generateTabId = (prefix: string = 't') =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`

export interface OpenFileOptions {
  name: string
  handle?: FileSystemFileHandle
  text: string
  readOnly?: boolean
  packageSource?: { packageId: string; filePath: string }
  viewMode?: 'wizard' | 'design' | 'code'
  type?: 'file' | 'execution' | 'chat'
  executionConfig?: any
  chatConfig?: {
    mode: string
    conversationId?: string
    contextFile?: string | null
  }
}

export interface TabManager {
  // Core operations
  openFile: (opts: OpenFileOptions) => string | null
  closeTab: (tabId: string) => void
  closeAllTabs: () => void
  closeOtherTabs: (tabId: string) => void

  // File sync operations
  handleFileRenamed: (oldPath: string, newPath: string, newFilePath?: string, newHandle?: FileSystemFileHandle) => void
  handleFileDeleted: (filePath: string) => void
  handleFilesRefreshed: (entries: { name: string; path: string; handle?: FileSystemFileHandle }[]) => void

  // Tab lookup (use getState() internally - no subscription)
  findTabByHandle: (handle: FileSystemFileHandle) => Tab | undefined
  findTabByPath: (path: string) => Tab | undefined
  findTabByPackageSource: (packageId: string, filePath: string) => Tab | undefined

  // Utilities
  getActiveTab: () => Tab | undefined
  isTabDirty: (tabId: string) => boolean
  markTabClean: (tabId: string, savedText?: string) => void
  updateTabContent: (tabId: string, text: string) => void
  refreshTab: (tabId: string, newText: string, newHandle?: FileSystemFileHandle) => void
}

/**
 * Helper to find tab by path (normalized comparison)
 * Handles various path formats:
 * - Exact match: "prompts/README.md" === "prompts/README.md"
 * - Tab contains path: "packages/@prompd/core/README.md" ends with "/README.md"
 * - Path contains tab: "prompts/README.md" ends with "/README.md" (tab name)
 * - Leading ./ stripped: "./README.md" matches "README.md"
 * - Filename only match (fallback): "README.md" matches tab ending in "/README.md"
 */
function findTabByPathInArray(tabs: Tab[], path: string): Tab | undefined {
  // Normalize: replace backslashes, remove leading ./
  const normalizedPath = path.replace(/\\/g, '/').replace(/^\.\//, '')

  const found = tabs.find(t => {
    // Skip non-file tabs
    if (t.type !== 'file') return false

    // Normalize tab path the same way
    const tabPath = t.name.replace(/\\/g, '/').replace(/^\.\//, '')

    // Exact match
    if (tabPath === normalizedPath) {
      return true
    }

    // Tab path ends with the search path (e.g., tab: "packages/foo/README.md", search: "README.md")
    if (tabPath.endsWith('/' + normalizedPath)) {
      return true
    }

    // Search path ends with tab path (e.g., search: "packages/foo/README.md", tab: "README.md")
    if (normalizedPath.endsWith('/' + tabPath)) {
      return true
    }

    // Filename-only match: extract filename from both and compare
    // This handles case where tool uses just filename but tab has full relative path
    const searchFilename = normalizedPath.split('/').pop() || normalizedPath
    const tabFilename = tabPath.split('/').pop() || tabPath
    if (searchFilename === tabFilename && searchFilename === normalizedPath) {
      // Only match by filename if the search was just a filename (not a path)
      return true
    }

    return false
  })

  if (!found) {
    console.log('[findTabByPathInArray] No tab found for path:', normalizedPath)
  }

  return found
}

export function useTabManager(): TabManager {
  // Only subscribe to store actions, NOT state (for performance)
  const addTab = useEditorStore(state => state.addTab)
  const removeTab = useEditorStore(state => state.removeTab)
  const updateTab = useEditorStore(state => state.updateTab)
  const activateTab = useEditorStore(state => state.activateTab)
  const setTabs = useEditorStore(state => state.setTabs)
  const setText = useEditorStore(state => state.setText)

  const setMode = useUIStore(state => state.setMode)

  // Track pending operations to prevent race conditions
  const pendingOps = useRef(new Set<string>())

  /**
   * Find existing tab by file handle (most reliable for filesystem files)
   * Uses getState() to avoid subscription
   */
  const findTabByHandle = useCallback((handle: FileSystemFileHandle): Tab | undefined => {
    const { tabs } = useEditorStore.getState()
    return tabs.find(t => t.handle === handle)
  }, [])

  /**
   * Find existing tab by file path/name
   * Uses getState() to avoid subscription
   */
  const findTabByPath = useCallback((path: string): Tab | undefined => {
    const { tabs } = useEditorStore.getState()
    return findTabByPathInArray(tabs, path)
  }, [])

  /**
   * Find existing tab by package source
   * Uses getState() to avoid subscription
   */
  const findTabByPackageSource = useCallback((packageId: string, filePath: string): Tab | undefined => {
    const { tabs } = useEditorStore.getState()
    return tabs.find(t =>
      t.packageSource?.packageId === packageId &&
      t.packageSource?.filePath === filePath
    )
  }, [])

  /**
   * Get the currently active tab
   * Uses getState() to avoid subscription
   */
  const getActiveTab = useCallback((): Tab | undefined => {
    const { tabs, activeTabId } = useEditorStore.getState()
    return tabs.find(t => t.id === activeTabId)
  }, [])

  /**
   * Open file in a tab (creates new tab or activates existing)
   * Returns tab ID if opened/activated, null if failed
   */
  const openFile = useCallback((opts: OpenFileOptions): string | null => {
    const opKey = `open-${opts.name}-${opts.handle?.name || 'no-handle'}`

    // Prevent duplicate operations
    if (pendingOps.current.has(opKey)) {
      console.log('[TabManager] Skipping duplicate open operation:', opts.name)
      return null
    }

    pendingOps.current.add(opKey)

    try {
      const { tabs } = useEditorStore.getState()
      const { mode } = useUIStore.getState()

      // Check for existing tab
      let existingTab: Tab | undefined

      // Priority 1: Match by package source (for package files)
      if (opts.packageSource) {
        existingTab = tabs.find(t =>
          t.packageSource?.packageId === opts.packageSource?.packageId &&
          t.packageSource?.filePath === opts.packageSource?.filePath
        )
      }

      // Priority 2: Match by file handle (for local files)
      if (!existingTab && opts.handle) {
        existingTab = tabs.find(t => t.handle === opts.handle)
      }

      // Priority 3: Match by file path (fallback)
      if (!existingTab) {
        existingTab = findTabByPathInArray(tabs, opts.name)
      }

      // If tab exists, activate it and optionally update content
      if (existingTab) {
        console.log('[TabManager] Activating existing tab:', existingTab.id, existingTab.name)
        activateTab(existingTab.id)

        // Update mode to match tab's view mode
        if (existingTab.viewMode) {
          setMode(existingTab.viewMode)
        }

        return existingTab.id
      }

      // Determine appropriate view mode for new tab
      // .prmd/.pdflow files keep current mode, all others force code mode
      const isPrompdFile = opts.name.toLowerCase().endsWith('.prmd') ||
                           opts.name.toLowerCase().endsWith('.pdflow')
      const initialViewMode = opts.viewMode || (isPrompdFile ? mode : 'code')

      // Generate unique ID based on tab type
      const idPrefix = opts.type === 'execution' ? 'exec' :
                       opts.type === 'chat' ? 'chat' :
                       opts.packageSource ? 'pkg' : 't'

      const newTab: Tab = {
        id: generateTabId(idPrefix),
        name: opts.name,
        text: opts.text,
        savedText: opts.text,
        handle: opts.handle,
        type: opts.type || 'file',
        viewMode: initialViewMode,
        readOnly: opts.readOnly,
        packageSource: opts.packageSource,
        executionConfig: opts.executionConfig,
        chatConfig: opts.chatConfig,
        dirty: false
      }

      console.log('[TabManager] Creating new tab:', newTab.id, newTab.name)
      addTab(newTab)
      setMode(initialViewMode)

      return newTab.id
    } finally {
      // Clear pending operation after a short delay to prevent rapid duplicate calls
      setTimeout(() => {
        pendingOps.current.delete(opKey)
      }, 100)
    }
  }, [addTab, activateTab, setMode])

  /**
   * Close a tab by ID
   */
  const closeTab = useCallback((tabId: string): void => {
    const { tabs, activeTabId } = useEditorStore.getState()

    const tabIndex = tabs.findIndex(t => t.id === tabId)
    if (tabIndex < 0) {
      console.warn('[TabManager] Tab not found for closing:', tabId)
      return
    }

    const closingTab = tabs[tabIndex]
    console.log('[TabManager] Closing tab:', tabId, closingTab.name)

    // If closing the active tab, determine next tab to activate
    if (tabId === activeTabId) {
      const remainingTabs = tabs.filter(t => t.id !== tabId)

      if (remainingTabs.length > 0) {
        // Activate the tab before the closed one, or the first one
        const newActiveIndex = Math.max(0, tabIndex - 1)
        const newActiveTab = remainingTabs[newActiveIndex]

        if (newActiveTab) {
          // First activate the new tab
          activateTab(newActiveTab.id)

          // Then set the appropriate mode
          if (newActiveTab.viewMode) {
            setMode(newActiveTab.viewMode)
          } else {
            const isPrompdFile = newActiveTab.name.toLowerCase().endsWith('.prmd') ||
                                 newActiveTab.name.toLowerCase().endsWith('.pdflow')
            setMode(isPrompdFile ? 'design' : 'code')
          }
        }
      } else {
        // No tabs left - clear editor
        setText('')
      }
    }

    // Clean up Monaco model for brainstorm tabs to prevent stale markers
    if (closingTab.type === 'brainstorm') {
      try {
        const monacoInstance = (window as unknown as Record<string, unknown>).monaco as typeof import('monaco-editor') | undefined
        if (monacoInstance?.editor) {
          for (const model of monacoInstance.editor.getModels()) {
            if (model.uri.toString().includes(tabId)) {
              monacoInstance.editor.setModelMarkers(model, 'prompd', [])
              model.dispose()
            }
          }
        }
      } catch {
        // Monaco not available — ignore
      }
    }

    // Remove the tab
    removeTab(tabId)
  }, [removeTab, activateTab, setMode, setText])

  /**
   * Close all tabs
   */
  const closeAllTabs = useCallback((): void => {
    console.log('[TabManager] Closing all tabs')
    setTabs([])
    setText('')
  }, [setTabs, setText])

  /**
   * Close all tabs except the specified one
   */
  const closeOtherTabs = useCallback((tabId: string): void => {
    const { tabs, activeTabId } = useEditorStore.getState()

    const keepTab = tabs.find(t => t.id === tabId)
    if (!keepTab) {
      console.warn('[TabManager] Tab not found:', tabId)
      return
    }

    console.log('[TabManager] Closing other tabs, keeping:', tabId)
    setTabs([keepTab])

    if (activeTabId !== tabId) {
      activateTab(tabId)
      if (keepTab.viewMode) {
        setMode(keepTab.viewMode)
      }
    }
  }, [setTabs, activateTab, setMode])

  /**
   * Handle file rename - update tab name and handle
   */
  const handleFileRenamed = useCallback((
    oldPath: string,
    newPath: string,
    newFilePath?: string,
    newHandle?: FileSystemFileHandle
  ): void => {
    console.log('[TabManager] File renamed:', oldPath, '->', newPath)

    const { tabs } = useEditorStore.getState()
    const tab = findTabByPathInArray(tabs, oldPath)

    if (!tab) {
      console.log('[TabManager] No tab found for renamed file:', oldPath)
      return
    }

    // Update tab with new name, filePath, and handle
    const updates: Partial<Tab> = { name: newPath }
    if (newFilePath) {
      updates.filePath = newFilePath
    }
    if (newHandle) {
      updates.handle = newHandle
    }

    console.log('[TabManager] Updating tab for renamed file:', tab.id, updates)
    updateTab(tab.id, updates)
  }, [updateTab])

  /**
   * Handle file deletion - close associated tab
   */
  const handleFileDeleted = useCallback((filePath: string): void => {
    console.log('[TabManager] File deleted:', filePath)

    const { tabs } = useEditorStore.getState()
    const tab = findTabByPathInArray(tabs, filePath)

    if (!tab) {
      console.log('[TabManager] No tab found for deleted file:', filePath)
      return
    }

    // If tab has unsaved changes, warn user
    if (tab.dirty) {
      console.warn('[TabManager] Closing dirty tab due to file deletion:', tab.id, tab.name)
      // Could emit an event here to show a notification
    }

    closeTab(tab.id)
  }, [closeTab])

  /**
   * Handle file explorer refresh - validate tabs still have valid files
   */
  const handleFilesRefreshed = useCallback((
    entries: { name: string; path: string; handle?: FileSystemFileHandle }[]
  ): void => {
    console.log('[TabManager] Files refreshed, validating tabs')

    const { tabs } = useEditorStore.getState()

    // Build set of valid file paths from entries
    // Entries is a flat list with { name, path, handle }
    // path is like "prompts/file.prmd" or just "file.prmd"
    const validPaths = new Set<string>()
    const validNames = new Set<string>()
    for (const entry of entries) {
      // Add full path (normalized)
      validPaths.add(entry.path.replace(/\\/g, '/'))
      // Also add just the filename for matching tabs that only have name
      validNames.add(entry.name)
    }

    // Check each tab with a file handle
    for (const tab of tabs) {
      // Skip non-file tabs (execution, chat, package, virtual)
      if (tab.type === 'execution' || tab.type === 'chat' || tab.packageSource || tab.virtualTemp) {
        continue
      }

      // Skip tabs without a file system link
      if (!tab.handle) {
        continue
      }

      // Check if file still exists
      // Tab name could be just filename or full path depending on how it was opened
      const tabName = tab.name.replace(/\\/g, '/')

      // Match by exact path, by name only, or by path ending with tab name
      const stillExists = validPaths.has(tabName) ||
                          validNames.has(tabName) ||
                          Array.from(validPaths).some(p => p.endsWith('/' + tabName) || p === tabName)

      if (!stillExists) {
        console.log('[TabManager] Tab file no longer exists:', tab.id, tab.name)

        // Mark as virtual/detached rather than closing (user might want to save elsewhere)
        updateTab(tab.id, {
          handle: undefined,
          virtualTemp: true,
          dirty: true
        })
      }
    }
  }, [updateTab])

  /**
   * Check if tab has unsaved changes
   * Uses getState() to avoid subscription
   */
  const isTabDirty = useCallback((tabId: string): boolean => {
    const { tabs } = useEditorStore.getState()
    const tab = tabs.find(t => t.id === tabId)
    return tab?.dirty ?? false
  }, [])

  /**
   * Mark tab as clean (saved)
   */
  const markTabClean = useCallback((tabId: string, savedText?: string): void => {
    const { tabs } = useEditorStore.getState()
    const tab = tabs.find(t => t.id === tabId)
    if (!tab) return

    updateTab(tabId, {
      dirty: false,
      savedText: savedText ?? tab.text
    })
  }, [updateTab])

  /**
   * Update tab text content
   */
  const updateTabContent = useCallback((tabId: string, text: string): void => {
    const { tabs, activeTabId } = useEditorStore.getState()
    const tab = tabs.find(t => t.id === tabId)
    if (!tab) return

    const isDirty = text !== tab.savedText
    updateTab(tabId, { text, dirty: isDirty })

    // If this is the active tab, also update the editor text
    if (tabId === activeTabId) {
      setText(text)
    }
  }, [updateTab, setText])

  /**
   * Refresh tab with new content (e.g., after external file modification)
   */
  const refreshTab = useCallback((
    tabId: string,
    newText: string,
    newHandle?: FileSystemFileHandle
  ): void => {
    const { activeTabId } = useEditorStore.getState()
    console.log('[useTabManager] refreshTab called:', tabId, 'activeTabId:', activeTabId, 'isActive:', tabId === activeTabId)

    const updates: Partial<Tab> = {
      text: newText,
      savedText: newText,
      dirty: false
    }

    if (newHandle) {
      updates.handle = newHandle
    }

    updateTab(tabId, updates)

    // If this is the active tab, update editor text
    if (tabId === activeTabId) {
      console.log('[useTabManager] Calling setText with new content, length:', newText.length)
      setText(newText)
    } else {
      console.log('[useTabManager] Tab is not active, skipping setText')
    }
  }, [updateTab, setText])

  return {
    openFile,
    closeTab,
    closeAllTabs,
    closeOtherTabs,
    handleFileRenamed,
    handleFileDeleted,
    handleFilesRefreshed,
    findTabByHandle,
    findTabByPath,
    findTabByPackageSource,
    getActiveTab,
    isTabDirty,
    markTabClean,
    updateTabContent,
    refreshTab
  }
}

export default useTabManager

/**
 * Editor Store
 * Manages text content, tabs, parsing, and file operations
 */

import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { enableMapSet } from 'immer'
import { debounce } from 'lodash-es'
import { parsePrompd } from '../modules/lib/prompdParser'
import type { ParsedPrompd } from '../modules/lib/prompdParser'
import type { Tab, Metadata } from './types'

// Enable MapSet support for Immer (required for Sets and Maps in Zustand)
enableMapSet()

/**
 * Workspace state - persisted per workspace path
 * Stores open tabs, cursor positions, scroll positions for restoration
 */
export interface WorkspaceState {
  /** Workspace path (key) */
  path: string
  /** Open tab file paths (relative to workspace) */
  openFiles: string[]
  /** Active tab file path */
  activeFile: string | null
  /** Cursor positions per file */
  cursorPositions: Record<string, { line: number; column: number }>
  /** Scroll positions per file (viewport top line) */
  scrollPositions: Record<string, number>
  /** View mode per file */
  viewModes: Record<string, 'wizard' | 'design' | 'code'>
  /** Timestamp of last save */
  lastSaved: number
}

// Type for a single parameter schema entry
type ParameterSchema = {
  type: string
  required?: boolean
  description?: string
  default?: any
  enum?: any[]
  min?: number
  max?: number
  pattern?: string
}

/**
 * Parsing cache for performance
 */
interface ParsingCache {
  input: string
  output: ParsedPrompd
  timestamp: number
}

const parsingCache = new Map<string, ParsingCache>()
const CACHE_TTL = 5000 // 5 seconds
const MAX_CACHE_SIZE = 50

/**
 * Parse with caching
 */
function parseCached(text: string): ParsedPrompd {
  const cached = parsingCache.get(text)

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.output
  }

  const result = parsePrompd(text)
  parsingCache.set(text, {
    input: text,
    output: result,
    timestamp: Date.now()
  })

  // Keep cache size manageable
  if (parsingCache.size > MAX_CACHE_SIZE) {
    const oldest = Array.from(parsingCache.keys())[0]
    parsingCache.delete(oldest)
  }

  return result
}

/**
 * Editor Store State
 */
interface EditorState {
  // Core content
  text: string
  tabs: Tab[]
  activeTabId: string | null

  // Metadata (synced from parsed frontmatter)
  metadata: Metadata
  editableParams: Record<string, ParameterSchema>
  sectionOverrides: Record<string, string | null>

  // File explorer
  explorerDirHandle: FileSystemDirectoryHandle | null
  explorerDirPath: string | null  // Actual file path (Electron only)
  explorerEntries: any[]

  // Editor state
  cursor: { line: number; column: number }
  jumpTo: { line: number; column?: number } | null

  // Parameter values (for execution)
  params: Record<string, any>

  // Execution tracking
  executingTabs: Set<string>

  // Current project
  currentProjectId: string | null

  // Package cache dir handle
  packageCacheDirHandle: FileSystemDirectoryHandle | null

  // Workspace states - keyed by workspace path
  workspaceStates: Record<string, WorkspaceState>
}

/**
 * Editor Store Actions
 */
interface EditorActions {
  // Text operations
  setText: (text: string) => void
  setTextWithoutTabUpdate: (text: string) => void

  // Tab operations
  addTab: (tab: Tab) => void
  addTabWithMode: (tab: Tab, setUIMode: (mode: 'wizard' | 'design' | 'code') => void) => void
  removeTab: (tabId: string) => void
  activateTab: (tabId: string) => void
  updateTab: (tabId: string, updates: Partial<Tab>) => void
  setTabs: (tabs: Tab[]) => void
  reorderTabs: (fromIndex: number, toIndex: number) => void

  // Metadata operations
  setMetadata: (metadata: Partial<Metadata>) => void
  updateMetadata: (field: keyof Metadata, value: string) => void

  // Parameter operations
  setEditableParams: (params: Record<string, ParameterSchema>) => void
  updateParameter: (name: string, schema: ParameterSchema) => void
  removeParameter: (name: string) => void

  // Section overrides
  setSectionOverrides: (overrides: Record<string, string | null>) => void
  updateSectionOverride: (section: string, value: string | null) => void

  // File explorer
  setExplorerDirHandle: (handle: FileSystemDirectoryHandle | null) => void
  setExplorerDirPath: (path: string | null) => void
  setExplorerEntries: (entries: any[]) => void

  // Editor state
  setCursor: (cursor: { line: number; column: number }) => void
  setJumpTo: (jumpTo: { line: number; column?: number } | null) => void

  // Parameters
  setParams: (params: Record<string, any>) => void
  updateParam: (key: string, value: any) => void

  // Execution
  setExecutingTab: (tabId: string, executing: boolean) => void

  // Project
  setCurrentProjectId: (projectId: string | null) => void

  // Package cache
  setPackageCacheDirHandle: (handle: FileSystemDirectoryHandle | null) => void

  // Workspace state management
  saveWorkspaceState: (workspacePath: string) => void
  getWorkspaceState: (workspacePath: string) => WorkspaceState | null
  clearWorkspaceState: (workspacePath: string) => void
  updateFileCursor: (workspacePath: string, filePath: string, cursor: { line: number; column: number }) => void
  updateFileScroll: (workspacePath: string, filePath: string, scrollTop: number) => void

  // Clear all tabs from persistence (called on clean app close after save/discard)
  clearAllTabs: () => void

  // Computed/derived
  getActiveTab: () => Tab | undefined
  getParsed: () => ParsedPrompd
  getParsedDebounced: () => ParsedPrompd
}

type EditorStore = EditorState & EditorActions

/**
 * Debounced parsing for UI updates (300ms)
 */
let debouncedParseCache: ParsedPrompd | null = null
const debouncedParse = debounce((text: string, callback: (parsed: ParsedPrompd) => void) => {
  const parsed = parseCached(text)
  debouncedParseCache = parsed
  callback(parsed)
}, 300)

/**
 * Create Editor Store
 */
export const useEditorStore = create<EditorStore>()(
  devtools(
    immer(
      persist(
        (set, get) => ({
          // Initial state
          text: '',
          tabs: [],
          activeTabId: null,
          metadata: {
            id: '',
            name: '',
            version: '1.0.0',
            description: ''
          },
          editableParams: {},
          sectionOverrides: {},
          explorerDirHandle: null,
          explorerDirPath: null,
          explorerEntries: [],
          cursor: { line: 1, column: 1 },
          jumpTo: null,
          params: {},
          executingTabs: new Set(),
          currentProjectId: null,
          packageCacheDirHandle: null,
          workspaceStates: {},

          // Text operations
          setText: (text: string) => set((state) => {
            state.text = text

            // Update active tab's text and dirty status
            if (state.activeTabId) {
              const tabIndex = state.tabs.findIndex(t => t.id === state.activeTabId)
              if (tabIndex !== -1) {
                const tab = state.tabs[tabIndex]
                tab.text = text
                // Chat and execution tabs should never be marked as dirty (they can't be saved)
                if (tab.type !== 'chat' && tab.type !== 'execution') {
                  tab.dirty = tab.savedText !== text
                }
              }
            }
          }),

          setTextWithoutTabUpdate: (text: string) => set((state) => {
            state.text = text
          }),

          // Tab operations
          addTab: (tab: Tab) => set((state) => {
            state.tabs.push(tab)
            state.activeTabId = tab.id
            state.text = tab.text
          }),

          addTabWithMode: (tab: Tab, setUIMode: (mode: 'wizard' | 'design' | 'code') => void) => {
            // Add the tab with viewMode set
            set((state) => {
              state.tabs.push(tab)
              state.activeTabId = tab.id
              state.text = tab.text
            })
            // Then set the UI mode to match
            if (tab.viewMode) {
              setUIMode(tab.viewMode)
            }
          },

          removeTab: (tabId: string) => set((state) => {
            const index = state.tabs.findIndex(t => t.id === tabId)
            if (index !== -1) {
              state.tabs.splice(index, 1)

              // If removing active tab, activate another
              if (state.activeTabId === tabId) {
                if (state.tabs.length > 0) {
                  const newActiveTab = state.tabs[Math.max(0, index - 1)]
                  state.activeTabId = newActiveTab.id
                  state.text = newActiveTab.text || ''
                } else {
                  state.activeTabId = null
                  state.text = ''
                }
              }
            }
          }),

          activateTab: (tabId: string) => set((state) => {
            const tab = state.tabs.find(t => t.id === tabId)
            if (tab) {
              state.activeTabId = tabId
              state.text = tab.text || ''
            }
          }),

          updateTab: (tabId: string, updates: Partial<Tab>) => set((state) => {
            const index = state.tabs.findIndex(t => t.id === tabId)
            if (index !== -1) {
              const tab = state.tabs[index]
              // Prevent setting dirty on chat/execution tabs (they can't be saved)
              if ((tab.type === 'chat' || tab.type === 'execution' || tab.type === 'brainstorm') && 'dirty' in updates) {
                const { dirty, ...safeUpdates } = updates
                state.tabs[index] = { ...tab, ...safeUpdates }
              } else {
                state.tabs[index] = { ...tab, ...updates }
              }
            }
          }),

          setTabs: (tabs: Tab[]) => set((state) => {
            state.tabs = tabs
          }),

          reorderTabs: (fromIndex: number, toIndex: number) => set((state) => {
            if (fromIndex === toIndex) return
            if (fromIndex < 0 || fromIndex >= state.tabs.length) return
            if (toIndex < 0 || toIndex >= state.tabs.length) return

            const [removed] = state.tabs.splice(fromIndex, 1)
            state.tabs.splice(toIndex, 0, removed)
          }),

          // Metadata operations
          setMetadata: (metadata: Partial<Metadata>) => set((state) => {
            state.metadata = { ...state.metadata, ...metadata }
          }),

          updateMetadata: (field: keyof Metadata, value: string) => set((state) => {
            state.metadata[field] = value as any
          }),

          // Parameter operations
          setEditableParams: (params: Record<string, ParameterSchema>) => set((state) => {
            state.editableParams = params
          }),

          updateParameter: (name: string, schema: ParameterSchema) => set((state) => {
            state.editableParams[name] = schema
          }),

          removeParameter: (name: string) => set((state) => {
            delete state.editableParams[name]
          }),

          // Section overrides
          setSectionOverrides: (overrides: Record<string, string | null>) => set((state) => {
            state.sectionOverrides = overrides
          }),

          updateSectionOverride: (section: string, value: string | null) => set((state) => {
            state.sectionOverrides[section] = value
          }),

          // File explorer
          setExplorerDirHandle: (handle: FileSystemDirectoryHandle | null) => set((state) => {
            state.explorerDirHandle = handle
            // Clear currentProjectId when opening a NEW folder
            // This ensures new folders get a new project ID when saved
            // instead of overwriting the previous project
            // Note: When loading from saved projects, setCurrentProjectId is called
            // AFTER setExplorerDirHandle, so this clear is expected behavior
            state.currentProjectId = null
          }),

          setExplorerDirPath: (path: string | null) => set((state) => {
            state.explorerDirPath = path
          }),

          setExplorerEntries: (entries: any[]) => set((state) => {
            state.explorerEntries = entries
          }),

          // Editor state
          setCursor: (cursor: { line: number; column: number }) => set((state) => {
            state.cursor = cursor
          }),

          setJumpTo: (jumpTo: { line: number; column?: number } | null) => set((state) => {
            state.jumpTo = jumpTo
          }),

          // Parameters
          setParams: (params: Record<string, any>) => set((state) => {
            state.params = params
          }),

          updateParam: (key: string, value: any) => set((state) => {
            state.params[key] = value
          }),

          // Execution
          setExecutingTab: (tabId: string, executing: boolean) => set((state) => {
            if (executing) {
              state.executingTabs.add(tabId)
            } else {
              state.executingTabs.delete(tabId)
            }
          }),

          // Project
          setCurrentProjectId: (projectId: string | null) => set((state) => {
            state.currentProjectId = projectId
          }),

          // Package cache
          setPackageCacheDirHandle: (handle: FileSystemDirectoryHandle | null) => set((state) => {
            state.packageCacheDirHandle = handle
          }),

          // Workspace state management
          saveWorkspaceState: (workspacePath: string) => set((state) => {
            // Get open file tabs (excluding chat and execution tabs)
            const fileTabs = state.tabs.filter(t =>
              t.type === 'file' || t.type === undefined
            )

            // Extract relative file paths from tabs
            const openFiles: string[] = []
            const cursorPositions: Record<string, { line: number; column: number }> = {}
            const viewModes: Record<string, 'wizard' | 'design' | 'code'> = {}

            for (const tab of fileTabs) {
              // Use tab name as relative path (or extract from handle if available)
              const filePath = tab.name
              openFiles.push(filePath)

              // Store view mode if set
              if (tab.viewMode) {
                viewModes[filePath] = tab.viewMode
              }
            }

            // Get active file
            const activeTab = state.tabs.find(t => t.id === state.activeTabId)
            const activeFile = activeTab && (activeTab.type === 'file' || activeTab.type === undefined)
              ? activeTab.name
              : null

            // Store current cursor position for active file
            if (activeFile) {
              cursorPositions[activeFile] = { ...state.cursor }
            }

            // Only save if there are open files
            if (openFiles.length > 0) {
              state.workspaceStates[workspacePath] = {
                path: workspacePath,
                openFiles,
                activeFile,
                cursorPositions,
                scrollPositions: state.workspaceStates[workspacePath]?.scrollPositions || {},
                viewModes,
                lastSaved: Date.now()
              }
            }
          }),

          getWorkspaceState: (workspacePath: string) => {
            const state = get()
            return state.workspaceStates[workspacePath] || null
          },

          clearWorkspaceState: (workspacePath: string) => set((state) => {
            delete state.workspaceStates[workspacePath]
          }),

          updateFileCursor: (workspacePath: string, filePath: string, cursor: { line: number; column: number }) => set((state) => {
            if (state.workspaceStates[workspacePath]) {
              state.workspaceStates[workspacePath].cursorPositions[filePath] = cursor
            }
          }),

          updateFileScroll: (workspacePath: string, filePath: string, scrollTop: number) => set((state) => {
            if (state.workspaceStates[workspacePath]) {
              state.workspaceStates[workspacePath].scrollPositions[filePath] = scrollTop
            }
          }),

          // Clear all tabs from persistence (called on clean app close after save/discard)
          clearAllTabs: () => set((state) => {
            state.tabs = []
            state.activeTabId = null
            state.text = ''
          }),

          // Computed/derived
          getActiveTab: () => {
            const state = get()
            return state.tabs.find(t => t.id === state.activeTabId)
          },

          getParsed: () => {
            const state = get()
            return parseCached(state.text)
          },

          getParsedDebounced: () => {
            const state = get()
            // Return cached debounced result or immediate parse
            return debouncedParseCache || parseCached(state.text)
          }
        }),
        {
          name: 'prompd-editor-storage',
          partialize: (state) => ({
            // Persist open editors with content (base64 images included).
            // handles are non-serializable so they're excluded.
            // Realistic open count is 15-25 files, few with images — fits in ~5MB localStorage.
            tabs: state.tabs.map(({ handle, ...rest }) => rest),
            activeTabId: state.activeTabId,
            currentProjectId: state.currentProjectId,
            explorerDirPath: state.explorerDirPath,
            workspaceStates: state.workspaceStates
          })
        }
      )
    ),
    { name: 'EditorStore' }
  )
)

/**
 * Selectors for common use cases
 */
export const selectActiveTab = (state: EditorStore) => state.tabs.find(t => t.id === state.activeTabId)
export const selectActiveTabText = (state: EditorStore) => state.text
export const selectTabs = (state: EditorStore) => state.tabs
export const selectMetadata = (state: EditorStore) => state.metadata
export const selectEditableParams = (state: EditorStore) => state.editableParams
export const selectWorkspaceStates = (state: EditorStore) => state.workspaceStates
export const selectWorkspaceState = (workspacePath: string) => (state: EditorStore) => state.workspaceStates[workspacePath]

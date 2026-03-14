import { useCallback, useEffect, useState, useRef, useMemo } from 'react'
import PrompdEditor, { type PendingEdit as EditorPendingEdit } from './editor/PrompdEditor'
import { SplitEditor } from './editor/SplitEditor'
import DesignView from './editor/DesignView'
import { BrainstormTab } from './brainstorm/BrainstormTab'
import FileExplorer from './editor/FileExplorer'
import PackagePanel from './editor/PackagePanel'
import AiChatPanel from './editor/AiChatPanel'
import TabsBar from './editor/TabsBar'
import StatusBar from './editor/StatusBar'
import EditorHeader from './editor/EditorHeader'
import TitleBar from './components/TitleBar'
import ActivityBar from './editor/ActivityBar'
import GuidedPromptWizard from './wizard/GuidedPromptWizard'
import { PrompdExecutionTab } from './editor/PrompdExecutionTab'
import { ChatTab } from './editor/ChatTab'
import GitPanel from './editor/GitPanel'
import { ExecutionHistoryPanel } from './components/ExecutionHistoryPanel'
import { ResourcePanel } from './components/ResourcePanel'
import InstalledResourcesPanel from './editor/InstalledResourcesPanel'
import PackageExplorerPanel from './editor/PackageExplorerPanel'
import type { PackageManifest } from './services/packageService'
import { LocalStorageModal } from './components/LocalStorageModal'
import { PublishModal } from './components/PublishModal'
import { PublishResourceModal, type PublishResourceInfo } from './components/PublishResourceModal'
import { NewFileDialog, getDefaultContent } from './components/NewFileDialog'
import { NewProjectModal } from './components/NewProjectModal'
import { SettingsModal } from './components/SettingsModal'
import { AboutModal } from './components/AboutModal'
import { DeploymentModal } from './components/deployment/DeploymentModal'
import { DeployWorkflowModal } from './components/deployment/DeployWorkflowModal'
import { PrompdPreviewModal } from './components/PrompdPreviewModal'
import { PrompdIcon, GradientPrompdIcon } from './components/PrompdIcon'
import LocalPackageModal from './editor/LocalPackageModal'
import { ExecutionResultModal, type ExecutionResult } from './editor/ExecutionResultModal'
import PrompdJsonDesignView from './components/PrompdJsonDesignView'
import { WorkflowCanvas } from './editor/WorkflowCanvas'
import PackageDetailsModal from './editor/PackageDetailsModal'
import WelcomeView from './components/WelcomeView'
import CloseWorkspaceDialog from './components/CloseWorkspaceDialog'
import FileChangesModal from './components/FileChangesModal'
import ToastContainer from './components/ToastContainer'
import { UpdateBanner } from './components/UpdateBanner'
import BottomPanelTabs from './components/BottomPanelTabs'
import { CommandPalette } from './components/CommandPalette'
import { FirstTimeSetupWizard, isOnboardingComplete, isWizardDismissed } from './components/FirstTimeSetupWizard'
import { InlineHints } from './components/InlineHints'
import { HelpChatPopover } from './components/HelpChatPopover'
import { markHintSeen } from './services/onboardingService'
// DISABLED: DiffDemo imports monacoDiff which breaks Monaco Code Actions
// import { DiffDemo } from './components/DiffDemo'
import type { FileNode } from './services/packageCache'
import type { RegistryPackage } from './services/registryApi'
import { parsePrompd } from './lib/prompdParser'
import type { ParamValue } from './types'
import type { SectionEntry } from './types/wizard'
import { useAuthenticatedUser } from './auth/ClerkWrapper'
import { registryApi } from './services/registryApi'
import { packageCache } from './services/packageCache'
import { setAiAuthTokenGetter } from './services/aiApi'
import { namespacesApi } from './services/namespacesApi'
import { configService } from './services/configService'
import { localProjectStorage, LocalProject } from './services/localProjectStorage'
import { conversationStorage } from './services/conversationStorage'
import { hotkeyManager } from './services/hotkeyManager'
import { setWorkspaceFiles, clearWorkspaceFiles } from './services/workspaceService'
import { buildPrompdFile, executePrompdConfig } from './services/executionService'
import { parseWorkflow } from './services/workflowParser'
import { usageTracker } from './services/usageTracker'
import { initializeRegistrySync, cleanupRegistrySync } from './lib/intellisense/registrySync'
import { useMonaco } from '@monaco-editor/react'
import { initializeMonaco } from './lib/monacoConfig'
import { getLanguageFromExtension } from './lib/languageDetection'
import { usePrompdLLMClient, usePrompdUsage } from '@prompd/react'
import { useEditorStore, useUIStore, useWorkflowStore } from '../stores'
import type { Tab, BuildError } from '../stores/types'
import { useTabManager } from './hooks/useTabManager'

/**
 * MonacoMarkerListener - Isolated component that uses useMonaco()
 * This component only renders when there are tabs, preventing Monaco from
 * loading on initial app startup when no editors are visible.
 */
function MonacoMarkerListener({
  tabs,
  onMarkersChange
}: {
  tabs: Tab[]
  onMarkersChange: (errors: BuildError[]) => void
}) {
  const monaco = useMonaco()

  useEffect(() => {
    if (!monaco) return

    const updateMarkers = () => {
      const rawMarkers = monaco.editor.getModelMarkers({})

      // Build a map of URIs to tab names for filtering
      const uriToTabName = new Map<string, string>()
      const currentModels = monaco.editor.getModels()

      // Map each currently open model to its tab
      for (const model of currentModels) {
        const modelUri = model.uri.toString()

        // Find matching tab by comparing model URI or content
        for (const tab of tabs) {
          // Check if URI matches tab's file path
          if (tab.filePath && modelUri.includes(tab.filePath.replace(/\\/g, '/'))) {
            uriToTabName.set(modelUri, tab.name)
            break
          }

          // Check if model ID matches tab ID (for temp models)
          const modelId = modelUri.split('/').pop() || ''
          if (tab.id === modelId || tab.id.includes(modelId)) {
            uriToTabName.set(modelUri, tab.name)
            break
          }

          // Check if model content matches tab content (fallback)
          if (model.getValue() === tab.text) {
            uriToTabName.set(modelUri, tab.name)
            break
          }
        }
      }

      // Convert to BuildError format - only include markers from currently open tabs
      const seen = new Set<string>()
      const buildErrors: BuildError[] = []

      for (const m of rawMarkers) {
        const uri = m.resource.toString()

        // Skip markers from brainstorm working copy models (stale after tab close)
        if (uri.includes('brainstorm-')) continue

        // Skip markers from models that aren't in currently open tabs
        const displayFile = uriToTabName.get(uri)
        if (!displayFile) {
          continue // Model not associated with any open tab, skip it
        }

        // Deduplicate by file:line:column:message
        const key = `${displayFile}:${m.startLineNumber}:${m.startColumn}:${m.message}`
        if (seen.has(key)) continue
        seen.add(key)

        // Map Monaco MarkerSeverity to our string severity
        const severityMap: Record<number, BuildError['severity']> = {
          8: 'error',    // MarkerSeverity.Error
          4: 'warning',  // MarkerSeverity.Warning
          2: 'info',     // MarkerSeverity.Info
          1: 'hint',     // MarkerSeverity.Hint
        }

        buildErrors.push({
          file: displayFile,
          message: m.message,
          line: m.startLineNumber,
          column: m.startColumn,
          severity: severityMap[m.severity] || 'error'
        })
      }

      onMarkersChange(buildErrors)
    }

    updateMarkers()

    const disposable = monaco.editor.onDidChangeMarkers(() => {
      updateMarkers()
    })

    return () => {
      disposable.dispose()
    }
  }, [monaco, tabs, onMarkersChange])

  return null // This component renders nothing, it just manages markers
}

const defaultTemplate = `---
id: hello-world
name: Hello World
description: A simple example prompt
version: 1.0.0
---

# User
Hello World! This is a simple prompt.
`

/**
 * Resolve a FileSystemFileHandle to its relative path from a workspace root directory.
 * Supports both File System Access API and Electron pseudo-handles.
 */
async function resolveFileHandle(
  rootHandle: any,
  targetHandle: any
): Promise<string | null> {
  // Handle Electron pseudo-handles: extract relative path from full path
  if (targetHandle?._electronPath && rootHandle?._electronPath) {
    const rootPath = rootHandle._electronPath.replace(/\\/g, '/')
    const targetPath = targetHandle._electronPath.replace(/\\/g, '/')

    if (targetPath.startsWith(rootPath)) {
      // Remove root path and leading slash to get relative path
      const relativePath = targetPath.slice(rootPath.length).replace(/^\//, '')
      return relativePath || null
    }
    // Target is not under root
    return null
  }

  // Electron handle with just _electronPath (from FileExplorer entries)
  if (targetHandle?._electronPath) {
    // Try to extract just the filename or path portion
    const pathParts = targetHandle._electronPath.replace(/\\/g, '/').split('/')
    const fileName = pathParts[pathParts.length - 1]
    return fileName || null
  }

  // Fall back to File System Access API for web mode
  if (!targetHandle?.getFile) {
    console.warn('[resolveFileHandle] targetHandle has no getFile method and no _electronPath')
    return null
  }

  const targetFile = await targetHandle.getFile()
  const targetName = targetHandle.name

  // BFS to find the file
  const queue: Array<{ handle: any; path: string }> = [
    { handle: rootHandle, path: '' }
  ]

  while (queue.length > 0) {
    const { handle, path } = queue.shift()!

    // Check if handle supports entries() iteration
    if (!handle?.entries) continue

    // Check files in current directory
    for await (const [name, entry] of (handle as any).entries()) {
      const currentPath = path ? `${path}/${name}` : name

      if (entry.kind === 'file' && name === targetName) {
        // Verify it's the same file by comparing metadata
        const file = await entry.getFile()
        if (
          file.name === targetFile.name &&
          file.size === targetFile.size &&
          file.lastModified === targetFile.lastModified
        ) {
          return currentPath
        }
      } else if (entry.kind === 'directory') {
        // Add subdirectory to queue
        queue.push({
          handle: entry,
          path: currentPath
        })
      }
    }
  }

  return null // File not found in workspace
}

export default function App() {
  const { user, isAuthenticated, getToken } = useAuthenticatedUser()
  const llmClient = usePrompdLLMClient()
  const { trackUsage } = usePrompdUsage()
  // Note: useMonaco() moved to MonacoMarkerListener component to prevent
  // Monaco from loading on startup when no editors are visible

  // Use Zustand stores instead of local state
  const text = useEditorStore(state => state.text)
  const setText = useEditorStore(state => state.setText)
  const tabs = useEditorStore(state => state.tabs)
  const activeTabId = useEditorStore(state => state.activeTabId)
  const activateTab = useEditorStore(state => state.activateTab)
  const addTab = useEditorStore(state => state.addTab)
  const addTabWithMode = useEditorStore(state => state.addTabWithMode)
  const removeTab = useEditorStore(state => state.removeTab)
  const updateTab = useEditorStore(state => state.updateTab)
  const setTabs = useEditorStore(state => state.setTabs)
  const reorderTabs = useEditorStore(state => state.reorderTabs)
  const getActiveTab = useEditorStore(state => state.getActiveTab)
  const getParsed = useEditorStore(state => state.getParsed)

  const params = useEditorStore(state => state.params)
  const setParams = useEditorStore(state => state.setParams)
  const updateParam = useEditorStore(state => state.updateParam)

  const explorerDirHandle = useEditorStore(state => state.explorerDirHandle)
  const setExplorerDirHandle = useEditorStore(state => state.setExplorerDirHandle)
  const explorerDirPath = useEditorStore(state => state.explorerDirPath)
  const setExplorerDirPath = useEditorStore(state => state.setExplorerDirPath)
  const explorerEntries = useEditorStore(state => state.explorerEntries)
  const setExplorerEntries = useEditorStore(state => state.setExplorerEntries)

  const cursor = useEditorStore(state => state.cursor)
  const setCursor = useEditorStore(state => state.setCursor)
  const jumpTo = useEditorStore(state => state.jumpTo)
  const setJumpTo = useEditorStore(state => state.setJumpTo)

  const currentProjectId = useEditorStore(state => state.currentProjectId)
  const setCurrentProjectId = useEditorStore(state => state.setCurrentProjectId)

  const executingTabs = useEditorStore(state => state.executingTabs)
  const setExecutingTab = useEditorStore(state => state.setExecutingTab)

  // Workflow execution state (persists across tab switches)
  const executionResult = useWorkflowStore(state => state.executionResult)
  const checkpoints = useWorkflowStore(state => state.checkpoints)
  const promptsSent = useWorkflowStore(state => state.promptsSent)

  // Workspace state management
  const saveWorkspaceState = useEditorStore(state => state.saveWorkspaceState)


  // UI store
  const mode = useUIStore(state => state.mode)
  const setMode = useUIStore(state => state.setMode)
  const defaultViewMode = useUIStore(state => state.defaultViewMode)
  const theme = useUIStore(state => state.theme)
  const setTheme = useUIStore(state => state.setTheme)
  const showSidebar = useUIStore(state => state.showSidebar)
  const setShowSidebar = useUIStore(state => state.setShowSidebar)
  const toggleSidebar = useUIStore(state => state.toggleSidebar)
  const activeSide = useUIStore(state => state.activeSide)
  const setActiveSide = useUIStore(state => state.setActiveSide)
  const sidebarWidth = useUIStore(state => state.sidebarWidth)
  const setSidebarWidth = useUIStore(state => state.setSidebarWidth)
  const packageSearchQuery = useUIStore(state => state.packageSearchQuery)
  const wizardState = useUIStore(state => state.wizardState)
  const setWizardState = useUIStore(state => state.setWizardState)

  const activeModal = useUIStore(state => state.activeModal)
  const openModal = useUIStore(state => state.openModal)
  const closeModal = useUIStore(state => state.closeModal)
  const selectedEnvFile = useUIStore(state => state.selectedEnvFile)

  // Publish modal initial manifest (set from InstalledResourcesPanel)
  const [publishInitialManifest, setPublishInitialManifest] = useState<PackageManifest | undefined>(undefined)

  // Publish resource modal state (set from InstalledResourcesPanel)
  const [publishResource, setPublishResource] = useState<{ resource: PublishResourceInfo; manifest: Record<string, unknown> } | null>(null)

  // Settings modal initial tab state
  const [settingsInitialTab, setSettingsInitialTab] = useState<'profile' | 'api-keys' | 'usage' | 'shortcuts' | 'registries'>('profile')

  // New File dialog state (shared across all entry points)
  const [showNewFileDialog, setShowNewFileDialog] = useState(false)

  // Helper to open settings modal with a specific tab
  const openSettingsModal = useCallback((tab: 'profile' | 'api-keys' | 'usage' | 'shortcuts' | 'registries' = 'profile') => {
    setSettingsInitialTab(tab)
    openModal('settings')
  }, [openModal])

  // Centralized LLM provider state
  const llmProvider = useUIStore(state => state.llmProvider)
  const initializeLLMProviders = useUIStore(state => state.initializeLLMProviders)
  const refreshLLMProviders = useUIStore(state => state.refreshLLMProviders)

  // Auto-save setting
  const autoSaveEnabled = useUIStore(state => state.autoSaveEnabled)

  // Help chat setting
  const helpChatEnabled = useUIStore(state => state.helpChatEnabled)

  // Recent projects for welcome screen
  const addRecentProject = useUIStore(state => state.addRecentProject)

  // TabManager for centralized tab operations and file synchronization
  const tabManager = useTabManager()

  // Save filename dialog state
  const [saveFilenameDialog, setSaveFilenameDialog] = useState<{ show: boolean; defaultName: string; onConfirm: (filename: string) => void } | null>(null)

  // Prompt preview modal state
  const [showPrompdPreview, setShowPrompdPreview] = useState(false)
  const [generatedPrompd, setGeneratedPrompd] = useState<{ content: string; filename: string; metadata?: any } | null>(null)
  const [clarificationRound, setClarificationRound] = useState(0)

  // Help chat popover state
  const [helpChatOpen, setHelpChatOpen] = useState(false)

  // Close workspace dialog state
  const [showCloseWorkspaceDialog, setShowCloseWorkspaceDialog] = useState(false)
  const pendingProjectPathRef = useRef<string | null>(null)
  const [retryGeneration, setRetryGeneration] = useState(0) // Increment to trigger retry in chat

  // Command palette state
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [commandPaletteInitialQuery, setCommandPaletteInitialQuery] = useState('')

  // First-time setup wizard state - show if user hasn't dismissed it
  const [showFirstTimeWizard, setShowFirstTimeWizard] = useState(() => !isWizardDismissed())

  // Track onboarding completion in React state (not just localStorage)
  // This ensures InlineHints re-render after wizard closes
  const [onboardingComplete, setOnboardingComplete] = useState(() => isOnboardingComplete())

  // Monaco markers state (for status bar issue count and Output panel errors)
  const [monacoMarkers, setMonacoMarkers] = useState<BuildError[]>([])

  // Drag and drop state for visual feedback
  const [isDraggingFiles, setIsDraggingFiles] = useState(false)

  // File changes detection state
  const [modifiedFiles, setModifiedFiles] = useState<Array<{ tabId: string; name: string; newContent: string }>>([])


  // Pending edit state for inline diff view (shared between AiChatPanel and PrompdEditor)
  const [editorPendingEdit, setEditorPendingEdit] = useState<EditorPendingEdit | null>(null)

  // Prompd execution session history (cleared on app close, shown in bottom panel)
  const [prompdSessionHistory, setPrompdSessionHistory] = useState<Array<{
    id: string
    timestamp: number
    provider: string
    model: string
    compiledPrompt: string
    response?: string
    error?: string
    success: boolean
    promptTokens: number
    completionTokens: number
    totalTokens: number
    duration: number
    context?: string
  }>>([])

  // Execution state tracking
  const [isExecutingPreview, setIsExecutingPreview] = useState(false)

  // Execution result modal state
  const [showExecutionModal, setShowExecutionModal] = useState(false)
  const [selectedExecutionIndex, setSelectedExecutionIndex] = useState(0)

  // Local package modal state
  const [localPackageInfo, setLocalPackageInfo] = useState<{
    manifest: {
      name: string
      version: string
      description?: string
      author?: string
      main?: string
      files?: string[]
    } | null
    fileTree: FileNode[]
    getFileContent: (filePath: string) => Promise<string | null>
    fileName: string
  } | null>(null)

  // Registry package details modal state (from AI Explore mode)
  const [selectedRegistryPackage, setSelectedRegistryPackage] = useState<RegistryPackage | null>(null)

  // Package explorer auto-expand (set when search result clicked on welcome view)
  const [expandPackageInExplorer, setExpandPackageInExplorer] = useState<string | null>(null)

  // Ref to store the execute function for menu triggering
  const executePrompdRef = useRef<(() => void) | null>(null)
  const stopExecutionRef = useRef<(() => void) | null>(null)

  // Track .prmd tab IDs that have had chat opened — these get persistent SplitEditor instances
  const chatMountedTabsRef = useRef<Set<string>>(new Set())

  // Ref to store the save function for auto-save (allows use before declaration)
  const saveRef = useRef<(() => Promise<void>) | null>(null)

  // Parse current document (from store)
  const parsed = getParsed()

  // Initialize Monaco editor (run once on mount)
  useEffect(() => {
    initializeMonaco()
    console.log('Monaco editor initialized with YAML and Markdown support')

    // Initialize registry sync for IntelliSense enhancements
    const registrySync = initializeRegistrySync({
      syncInterval: 15 * 60 * 1000, // 15 minutes
      autoStart: true
    })
    registrySync.start()
    console.log('Registry sync initialized for IntelliSense')

    // Load saved text if not already loaded
    const savedText = localStorage.getItem('prompd.editor.text')
    if (savedText && !text) {
      setText(savedText)
    }

    // Cleanup on unmount
    return () => {
      cleanupRegistrySync()
      console.log('Registry sync cleaned up')
    }
  }, [])

  // Analytics opt-in sync moved to uiStore onRehydrateStorage (runs after localStorage hydration)

  // Auto-restore workspace on startup (Electron only)
  // If we have a persisted explorerDirPath but no handle, restore it
  const hasRestoredWorkspace = useRef(false)
  useEffect(() => {
    const restoreWorkspace = async () => {
      // Only restore once, only in Electron, only if we have a path but no handle
      if (hasRestoredWorkspace.current) return
      if (!explorerDirPath) return
      if (explorerDirHandle) return // Already have a handle
      if (!(window as any).electronAPI?.readDir) return // Not Electron

      hasRestoredWorkspace.current = true
      console.log('[App] Restoring workspace from persisted path:', explorerDirPath)

      try {
        // Verify the directory still exists
        const result = await (window as any).electronAPI.readDir(explorerDirPath)
        if (!result.success) {
          console.warn('[App] Persisted workspace no longer exists, clearing:', explorerDirPath)
          setExplorerDirPath(null)
          return
        }

        // Create pseudo-handle for Electron
        const pseudoHandle = {
          kind: 'directory',
          name: explorerDirPath.split(/[\\/]/).pop() || explorerDirPath,
          _electronPath: explorerDirPath
        }

        // Set the handle and path
        setExplorerDirHandle(pseudoHandle as any)

        // Set workspace path in Electron main process
        await (window as any).electronAPI.setWorkspacePath?.(explorerDirPath)

        // Load persisted connections for this workspace
        useWorkflowStore.getState().loadConnections()

        console.log('[App] Workspace restored successfully:', explorerDirPath)
      } catch (error) {
        console.error('[App] Failed to restore workspace:', error)
        setExplorerDirPath(null)
      }
    }

    restoreWorkspace()
  }, [explorerDirPath, explorerDirHandle, setExplorerDirHandle, setExplorerDirPath])

  // Sync workspace files to the workspace service for IntelliSense
  // This enables file path suggestions in {% include %} and context: fields
  useEffect(() => {
    if (explorerEntries && explorerEntries.length > 0) {
      setWorkspaceFiles(explorerEntries.map((entry: { name: string; path: string; kind: 'file' | 'folder' }) => ({
        name: entry.name,
        path: entry.path,
        kind: entry.kind
      })))
    } else {
      clearWorkspaceFiles()
    }
  }, [explorerEntries])

  // Restore file handles for tabs after workspace is restored
  // This is separate from workspace restore because tabs may hydrate after the workspace effect runs
  const hasRestoredTabHandles = useRef(false)
  useEffect(() => {
    const restoreTabHandles = async () => {
      // Only in Electron, only when we have a workspace path
      if (!(window as any).electronAPI?.readFile) return
      if (!explorerDirPath) return
      // Wait for tabs to be hydrated (at least one tab)
      if (tabs.length === 0) return
      // Only restore once
      if (hasRestoredTabHandles.current) return

      hasRestoredTabHandles.current = true
      const electronAPI = (window as any).electronAPI
      console.log('[App] Restoring file handles for', tabs.length, 'tabs')

      for (const tab of tabs) {
        // Skip non-file tabs, tabs with valid handles, and package-sourced tabs
        if (tab.type === 'chat' || tab.type === 'execution' || tab.type === 'brainstorm' || tab.packageSource) continue
        if (tab.handle && typeof tab.handle.createWritable === 'function') continue

        // Use stored filePath, or construct from workspace + tab name (for legacy tabs)
        let fullPath = tab.filePath
        if (!fullPath && tab.name) {
          // Legacy fallback: construct path from workspace directory and tab name
          const tabName = tab.name.replace(/\//g, '\\')
          if (tabName.includes(':') || tabName.startsWith('\\')) {
            fullPath = tabName
          } else {
            fullPath = `${explorerDirPath}\\${tabName}`
          }
        }
        if (!fullPath) continue

        // Verify file exists before creating handle
        try {
          const fileResult = await electronAPI.readFile(fullPath)
          if (fileResult.success) {
            const fileName = fullPath.split(/[\\/]/).pop() || tab.name
            const fileHandle = {
              kind: 'file',
              name: fileName,
              _electronPath: fullPath,
              getFile: async () => ({
                name: fileName,
                text: async () => {
                  const result = await electronAPI.readFile(fullPath)
                  return result.content || ''
                }
              }),
              createWritable: async () => ({
                write: async (content: string) => {
                  await electronAPI.writeFile(fullPath, content)
                },
                close: async () => {}
              })
            }
            updateTab(tab.id, { handle: fileHandle as any, filePath: fullPath })
          }
        } catch (err) {
          console.warn('[App] Could not restore handle for tab:', fullPath, err)
        }
      }

    }

    restoreTabHandles()
  }, [explorerDirPath, tabs, updateTab])

  // Apply theme to document element and sync with Electron native theme
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
    // Sync Electron window chrome (title bar, scrollbars) with app theme
    ;(window as any).electronAPI?.setNativeTheme?.(theme)
  }, [theme])

  // Monaco marker listening is now handled by MonacoMarkerListener component
  // which only renders when tabs.length > 0, preventing Monaco from loading on startup

  // Clean close handler — save workspace state and signal ready to quit.
  // Tabs persist in Zustand/localStorage and restore on next launch.
  useEffect(() => {
    const electronAPI = (window as any).electronAPI
    if (!electronAPI?.onBeforeQuit) return

    const handleBeforeQuit = async () => {
      // Save workspace state — tabs persist in Zustand/localStorage
      // and will be restored on next launch (same as crash recovery)
      const dirPath = useEditorStore.getState().explorerDirPath
      if (dirPath) {
        saveWorkspaceState(dirPath)
      }

      // Signal main process that we're ready to quit
      electronAPI.readyToQuit()
    }

    electronAPI.onBeforeQuit(handleBeforeQuit)

    return () => {
      // ipcRenderer.on returns the ipcRenderer, so removal uses removeListener
      // But since we're in the cleanup phase, this is fine to skip
    }
  }, [saveWorkspaceState])

  // Save workspace state on unload and when workspace changes
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Save current workspace state before closing
      if (explorerDirPath) {
        saveWorkspaceState(explorerDirPath)
        console.log('[App] Saved workspace state on unload:', explorerDirPath)
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [explorerDirPath, saveWorkspaceState])

  // Save workspace state when tabs change (debounced via store)
  const prevExplorerDirPathRef = useRef<string | null>(null)
  useEffect(() => {
    // When workspace changes, save the previous workspace state first
    if (prevExplorerDirPathRef.current && prevExplorerDirPathRef.current !== explorerDirPath) {
      saveWorkspaceState(prevExplorerDirPathRef.current)
      console.log('[App] Saved previous workspace state:', prevExplorerDirPathRef.current)
    }
    prevExplorerDirPathRef.current = explorerDirPath
  }, [explorerDirPath, saveWorkspaceState])

  // Setup registry API authentication (only when authentication state changes)
  useEffect(() => {
    if (isAuthenticated && getToken) {
      registryApi.setAuthTokenGetter(getToken)
      setAiAuthTokenGetter(getToken)
      namespacesApi.setAuthTokenGetter(getToken)
      console.log('Registry and AI APIs configured with authentication')
    }
  }, [isAuthenticated])

  // Setup namespaces API with registry API key from config.yaml
  // This key is used for namespace management operations and takes precedence over user tokens
  useEffect(() => {
    const loadRegistryApiKey = async () => {
      try {
        const config = await configService.getConfig(explorerDirPath || undefined)
        const defaultRegistry = config.registry?.default || 'prompdhub'
        const registryConfig = config.registry?.registries?.[defaultRegistry]

        if (registryConfig?.api_key) {
          namespacesApi.setRegistryApiKey(registryConfig.api_key)
          console.log('[App] Namespaces API configured with registry API key')
        }
      } catch (error) {
        console.error('[App] Failed to load registry API key:', error)
      }
    }

    loadRegistryApiKey()
  }, [explorerDirPath])

  // Wire workspace handle to package cache service
  useEffect(() => {
    if (explorerDirHandle) {
      packageCache.setWorkspaceHandle(explorerDirHandle)
      console.log('Package cache configured with workspace handle')
    }
  }, [explorerDirHandle])

  // Track recently opened projects for welcome screen
  useEffect(() => {
    if (explorerDirPath && explorerDirHandle) {
      const projectName = explorerDirHandle.name || explorerDirPath.split(/[/\\]/).pop() || 'Project'

      // Get current user ID for user-scoped recent projects
      const userId = localProjectStorage.getCurrentUser()

      // Add to recent projects
      addRecentProject({
        name: projectName,
        path: explorerDirPath,
        userId: userId || undefined
      })

      const electronAPI = (window as any).electronAPI

      // Fetch git status if in Electron
      if (electronAPI?.runGitCommand) {
        // Get current branch
        electronAPI.runGitCommand(['branch', '--show-current'], explorerDirPath)
          .then((result: { success: boolean; stdout?: string }) => {
            if (result.success && result.stdout) {
              const branch = result.stdout.trim()
              // Check for uncommitted changes
              electronAPI.runGitCommand(['status', '--porcelain'], explorerDirPath)
                .then((statusResult: { success: boolean; stdout?: string }) => {
                  const gitDirty = statusResult.success && (statusResult.stdout?.trim().length || 0) > 0
                  useUIStore.getState().updateRecentProject(explorerDirPath, {
                    gitBranch: branch,
                    gitDirty
                  })
                })
            }
          })
          .catch(() => {
            // Not a git repo, ignore
          })
      }

      // Count .prmd files in the project directory
      const countPrompdFiles = async () => {
        try {
          if (electronAPI?.readDir) {
            // Detect path separator (Windows uses \, Unix uses /)
            const sep = explorerDirPath.includes('\\') ? '\\' : '/'

            // Electron mode - recursively count .prmd files
            const countFilesRecursive = async (dirPath: string): Promise<number> => {
              const result = await electronAPI.readDir(dirPath)
              if (!result.success || !result.files) return 0

              let count = 0
              for (const entry of result.files) {
                if (entry.isDirectory) {
                  // Skip node_modules and hidden directories
                  if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                    count += await countFilesRecursive(`${dirPath}${sep}${entry.name}`)
                  }
                } else if (entry.name.endsWith('.prmd')) {
                  count++
                }
              }
              return count
            }

            const fileCount = await countFilesRecursive(explorerDirPath)
            useUIStore.getState().updateRecentProject(explorerDirPath, { fileCount })
          } else if (explorerDirHandle && 'values' in explorerDirHandle) {
            // Web File System Access API mode
            const countFilesRecursive = async (dirHandle: FileSystemDirectoryHandle): Promise<number> => {
              let count = 0
              for await (const entry of (dirHandle as any).values()) {
                if (entry.kind === 'directory') {
                  // Skip hidden directories and node_modules
                  if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                    count += await countFilesRecursive(entry)
                  }
                } else if (entry.name.endsWith('.prmd')) {
                  count++
                }
              }
              return count
            }

            const fileCount = await countFilesRecursive(explorerDirHandle as FileSystemDirectoryHandle)
            useUIStore.getState().updateRecentProject(explorerDirPath, { fileCount })
          }
        } catch (err) {
          console.warn('Failed to count .prmd files:', err)
        }
      }

      countPrompdFiles()

      console.log(`Tracked recent project: ${projectName} at ${explorerDirPath}`)
    }
  }, [explorerDirPath, explorerDirHandle, addRecentProject])

  // Autosave editor text
  useEffect(() => {
    if (text) {
      localStorage.setItem('prompd.editor.text', text)
    }
  }, [text])

  // Persist params
  useEffect(() => {
    localStorage.setItem('prompd.params', JSON.stringify(params))
  }, [params])

  // Update Electron menu state when app state changes
  useEffect(() => {
    const electronAPI = (window as any).electronAPI
    if (!electronAPI?.updateMenuState) return

    const activeTab = tabs.find(t => t.id === activeTabId)
    const activeFileName = activeTab?.name?.toLowerCase() || ''
    const isPrompdFile = activeFileName.endsWith('.prmd')
    const isWorkflowFile = activeFileName.endsWith('.pdflow')

    electronAPI.updateMenuState({
      hasWorkspace: !!explorerDirHandle,
      hasActiveTab: !!activeTabId && tabs.length > 0,
      isPrompdFile,
      isWorkflowFile,
      canExecute: isPrompdFile && !!activeTab
    })
  }, [explorerDirHandle, activeTabId, tabs])

  // Auto-switch to code view when opening non-.prmd files
  // This ensures wizard/design views are only shown for .prmd/.pdflow files
  useEffect(() => {
    if (!activeTabId) return

    const activeTab = tabs.find(t => t.id === activeTabId)
    if (!activeTab) return

    const name = activeTab.name.toLowerCase()
    const isPrompdCompatible = name.endsWith('.prmd') || name.endsWith('.pdflow')
    const isPrompdJson = name === 'prompd.json' || name.endsWith('/prompd.json') || name.endsWith('\\prompd.json')

    // If it's not a .prmd/.pdflow/prompd.json file and we're in wizard/design mode, switch to code
    // Note: prompd.json only supports design mode (not wizard)
    if (!isPrompdCompatible && !isPrompdJson && (mode === 'wizard' || mode === 'design')) {
      setMode('code')
      updateTab(activeTabId, { viewMode: 'code' })
    }
    // prompd.json doesn't support wizard mode, only design/code
    if (isPrompdJson && mode === 'wizard') {
      setMode('design')
      updateTab(activeTabId, { viewMode: 'design' })
    }
    // Brainstorm tabs only support design/code (no wizard)
    if (activeTab.type === 'brainstorm' && mode === 'wizard') {
      setMode('design')
      updateTab(activeTabId, { viewMode: 'design' })
    }
  }, [activeTabId, tabs, mode, setMode, updateTab])

  // Apply default parameter values from schema
  useEffect(() => {
    const newParams: Record<string, ParamValue> = {}
    let changed = false

    Object.entries(parsed.paramsSchema).forEach(([k, meta]: any) => {
      const currentValue = params[k]
      if ((currentValue === undefined || currentValue === '') && meta && meta.default !== undefined) {
        newParams[k] = meta.default
        changed = true
      }
    })

    if (changed) {
      setParams({ ...params, ...newParams })
    }
  }, [parsed.paramsSchema])

  // Sync source tab changes to execution tabs
  // When a source file is edited, update all linked execution tabs
  useEffect(() => {
    // Find all execution tabs that have a sourceTabId
    const executionTabs = tabs.filter(tab =>
      tab.type === 'execution' &&
      tab.executionConfig?.sourceTabId
    )

    if (executionTabs.length === 0) return

    // Check each execution tab's source
    executionTabs.forEach(execTab => {
      const sourceTabId = execTab.executionConfig?.sourceTabId
      const sourceTab = tabs.find(t => t.id === sourceTabId)

      if (!sourceTab) {
        // Source tab was closed - could clear sourceTabId or leave as-is
        return
      }

      // Check if source content has changed
      const currentSourceContent = execTab.executionConfig?.prompdSource?.content
      if (currentSourceContent !== sourceTab.text) {
        // Re-parse the source to get updated parameters
        const newParsed = parsePrompd(sourceTab.text)
        const newOriginalParams = Object.entries(newParsed.paramsSchema).map(([name, schema]) => ({
          name,
          type: schema.type,
          description: schema.description,
          required: schema.required,
          default: schema.default,
          enum: schema.enum
        }))

        // Update the execution tab with new content and parameters
        updateTab(execTab.id, {
          filePath: sourceTab.filePath,
          executionConfig: {
            ...execTab.executionConfig,
            prompdSource: {
              ...execTab.executionConfig.prompdSource,
              content: sourceTab.text,
              originalParams: newOriginalParams,
              filePath: sourceTab.filePath
            },
            workspacePath: explorerDirPath || execTab.executionConfig.workspacePath
          }
        })
      }
    })
  }, [tabs]) // Re-run when any tab changes

  // Wrapper to activate tab AND restore its viewMode
  const activateTabWithMode = useCallback((tabId: string) => {
    const tab = tabs.find(t => t.id === tabId)
    if (!tab) return

    activateTab(tabId)

    // Restore the tab's viewMode (or default based on file type)
    if (tab.viewMode) {
      setMode(tab.viewMode)
    } else {
      const name = tab.name.toLowerCase()
      const isPrompdFile = name.endsWith('.prmd') || name.endsWith('.pdflow')
      setMode(isPrompdFile ? defaultViewMode : 'code')
    }
  }, [tabs, activateTab, setMode, defaultViewMode])

  // Tab management
  const closeTab = (id: string) => {
    const idx = tabs.findIndex(t => t.id === id)
    if (idx < 0) return

    const next = tabs.filter(t => t.id !== id)

    if (id === activeTabId) {
      if (next.length > 0) {
        const newIdx = Math.max(0, idx - 1)
        const newActive = next[newIdx]
        if (newActive) {
          activateTab(newActive.id)
          // Auto-detect mode for new active tab
          const isPrompdFile = newActive.name.toLowerCase().endsWith('.prmd') || newActive.name.toLowerCase().endsWith('.pdflow')
          setMode(newActive.viewMode || (isPrompdFile ? 'design' : 'code'))
        }
      } else {
        setTabs([])
        setText('')
        return
      }
    }

    setTabs(next)
  }

  const closeAllTabs = useCallback(() => {
    // Check for unsaved changes
    const dirtyTabs = tabs.filter(t => t.dirty)
    if (dirtyTabs.length > 0) {
      // For now, just close all tabs without prompting
      // TODO: Add confirmation dialog for unsaved changes
    }
    setTabs([])
    setText('')
  }, [tabs, setTabs, setText])

  const onOpenFile = useCallback((opts: {
    name: string;
    handle?: any;
    text: string;
    readOnly?: boolean;
    packageSource?: { packageId: string; filePath: string };
    electronPath?: string;
  }) => {
    // Determine view mode: preserve current mode if compatible, otherwise use file-appropriate default
    const lowerName = opts.name.toLowerCase()
    const isPrompdFile = lowerName.endsWith('.prmd') || lowerName.endsWith('.pdflow')
    const isPrompdJson = lowerName === 'prompd.json' || lowerName.endsWith('/prompd.json') || lowerName.endsWith('\\prompd.json')
    // Files that support design/code toggle
    const supportsDesignView = isPrompdFile || isPrompdJson

    // For package files, match by packageSource instead of name to avoid conflicts
    let found: Tab | undefined
    if (opts.packageSource) {
      found = tabs.find(t =>
        t.packageSource?.packageId === opts.packageSource?.packageId &&
        t.packageSource?.filePath === opts.packageSource?.filePath
      )
    } else {
      found = tabs.find(t => (opts.handle && t.handle === opts.handle) || t.name === opts.name)
    }

    // Helper to create Electron pseudo-handle
    const createElectronHandle = (filePath: string, fileName: string) => {
      const electronAPI = (window as any).electronAPI
      if (!electronAPI?.isElectron) return null
      return {
        kind: 'file',
        name: fileName,
        _electronPath: filePath,
        getFile: async () => ({
          name: fileName,
          text: async () => {
            const result = await electronAPI.readFile(filePath)
            return result.content || ''
          }
        }),
        createWritable: async () => ({
          write: async (content: string) => {
            await electronAPI.writeFile(filePath, content)
          },
          close: async () => {}
        })
      }
    }

    if (found) {
      activateTab(found.id)
      // For files supporting design view, use tab's saved viewMode; otherwise force code mode
      const restoredMode = supportsDesignView ? (found.viewMode || mode) : 'code'
      setMode(restoredMode)
      // Update tab viewMode if it was invalid for the file type
      if (!supportsDesignView && found.viewMode !== 'code') {
        updateTab(found.id, { viewMode: 'code' })
      }

      // If the existing tab is missing a proper handle but we have one, update it
      // This fixes tabs that were created before with incomplete handles or had handles invalidated
      const needsHandleUpdate = !found.handle || typeof found.handle.createWritable !== 'function'
      if (needsHandleUpdate) {
        let newHandle = opts.handle
        if (!newHandle && opts.electronPath) {
          newHandle = createElectronHandle(opts.electronPath, opts.name)
        }
        if (newHandle) {
          updateTab(found.id, { handle: newHandle })
        }
      }
      return
    }

    // Create a proper Electron pseudo-handle if electronPath is provided but no handle
    let fileHandle = opts.handle
    if (!fileHandle && opts.electronPath) {
      fileHandle = createElectronHandle(opts.electronPath, opts.name)
    }

    const id = `t-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
    // For new tabs: files supporting design view use user's default preference, all others force code mode
    // prompd.json and .pdflow always default to design mode for visual editing
    const isWorkflowFile = lowerName.endsWith('.pdflow')
    const initialViewMode = supportsDesignView ? (isPrompdJson || isWorkflowFile ? 'design' : defaultViewMode) : 'code'
    const tab: Tab = {
      id,
      name: opts.name,
      handle: fileHandle,
      filePath: opts.electronPath, // Store full path for handle restoration after restart
      text: opts.text,
      savedText: opts.text,
      viewMode: initialViewMode,
      readOnly: opts.readOnly,
      packageSource: opts.packageSource
    }

    addTab(tab)
    setMode(initialViewMode)
  }, [defaultViewMode, tabs, addTab, activateTab, setMode, updateTab])

  // Handle Electron file associations (.prmd files opened via double-click or command line)
  useEffect(() => {
    const electronAPI = (window as any).electronAPI
    if (!electronAPI) return // Not in Electron

    // Helper to open a file from a path
    const openFileFromPath = async (filePath: string) => {
      console.log('[App.tsx] Opening file from path:', filePath)
      try {
        const result = await electronAPI.readFile(filePath)
        if (result.success) {
          const fileName = filePath.split(/[/\\]/).pop() || 'untitled.prmd'

          // Create a pseudo-handle for Electron files
          const pseudoHandle = {
            kind: 'file',
            name: fileName,
            _electronPath: filePath,
            getFile: async () => ({
              name: fileName,
              text: async () => result.content
            }),
            createWritable: async () => ({
              write: async (content: string) => {
                await electronAPI.writeFile(filePath, content)
              },
              close: async () => {}
            })
          }

          onOpenFile({
            name: fileName,
            handle: pseudoHandle,
            text: result.content,
            readOnly: false,
            electronPath: filePath // Store full path for handle restoration after restart
          })
          console.log('[App.tsx] File opened successfully:', fileName)
        } else {
          console.error('[App.tsx] Failed to read file:', result.error)
        }
      } catch (error) {
        console.error('[App.tsx] Error opening file:', error)
      }
    }

    // Collect cleanup functions
    const cleanups: (() => void)[] = []

    // Check for pending file on startup (file opened before renderer was ready)
    electronAPI.getPendingFile().then((filePath: string | null) => {
      if (filePath) {
        console.log('[App.tsx] Found pending file to open:', filePath)
        openFileFromPath(filePath)
      }
    })

    // Listen for file-open events (files opened while app is running)
    const unsubFileOpen = electronAPI.onFileOpen((filePath: string) => {
      console.log('[App.tsx] Received file-open event:', filePath)
      openFileFromPath(filePath)
    })
    if (unsubFileOpen) cleanups.push(unsubFileOpen)

    // Menu: Open File (Ctrl+O from menu)
    const unsubMenuOpenFile = electronAPI.onMenuOpenFile?.((filePath: string) => {
      console.log('[App.tsx] Menu open file:', filePath)
      openFileFromPath(filePath)
    })
    if (unsubMenuOpenFile) cleanups.push(unsubMenuOpenFile)

    // Cleanup on unmount or dependency change
    return () => {
      cleanups.forEach(cleanup => cleanup())
    }
  }, [onOpenFile])

  // Open package file in editor (read-only)
  const onOpenPackageFile = useCallback((content: string, filename: string, packageId: string, filePath: string) => {
    onOpenFile({
      name: filename,
      text: content,
      readOnly: true,
      packageSource: { packageId, filePath }
    })
  }, [onOpenFile])

  // Use package file as template in wizard
  const onUsePackageAsTemplate = useCallback((content: string, filename: string, packageId: string, filePath: string) => {
    const newTab: Tab = {
      id: 'template-' + Date.now(),
      name: filename,
      text: content,
      dirty: false,
      viewMode: 'wizard'
    }
    addTab(newTab)
    setMode('wizard')

    console.log('Using template from:', packageId, filePath)
  }, [addTab, setMode])

  // Create new wizard tab for creating a new prompt
  const handleNewWizard = useCallback(() => {
    // Generate a unique filename
    const timestamp = Date.now()
    const filename = `new-prompt-${timestamp}.prmd`

    // Create minimal template - wizard will fill in the rest
    const template = `---
id: new-prompt-${timestamp}
name: ""
description: ""
version: 1.0.0
---

# System


# User

`

    const newTab: Tab = {
      id: `wizard-${timestamp}`,
      name: filename,
      text: template,
      dirty: true, // Mark as dirty since it's a new unsaved file
      viewMode: 'wizard'
    }
    addTab(newTab)
    setMode('wizard')
  }, [addTab, setMode])

  // Helper to clean filename from emoji/icon prefixes
  const cleanFilename = (filename: string): string => {
    return filename.replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]\s*/u, '').trim()
  }

  // Handle AI generated prompt
  const onAiGenerated = useCallback((prompd: string, filename: string, metadata: any) => {
    // Show preview modal instead of immediately creating tab
    setGeneratedPrompd({ content: prompd, filename, metadata })
    setShowPrompdPreview(true)
  }, [])

  // Handle accept from preview modal
  const handleAcceptPrompdPreview = useCallback(() => {
    if (!generatedPrompd) return

    const newTab: Tab = {
      id: 'ai-' + Date.now(),
      name: generatedPrompd.filename,
      text: generatedPrompd.content,
      dirty: true,
      viewMode: 'design'  // Open in Design view
    }

    addTabWithMode(newTab, setMode)  // Use new helper to auto-switch mode
    setClarificationRound(0)  // Reset clarification counter
    console.log('✓ AI generated prompt loaded in Design view:', generatedPrompd.filename)
  }, [generatedPrompd, addTabWithMode, setMode])

  // Handle decline from preview modal
  const handleDeclinePrompdPreview = useCallback(() => {
    setClarificationRound(prev => prev + 1)
    console.log(`✓ Prompt declined, clarification round ${clarificationRound + 1}`)
    // User will refine in chat - AI will ask clarifying questions
  }, [clarificationRound])

  // Handle retry from preview modal
  const handleRetryPrompdPreview = useCallback(() => {
    console.log('✓ Retrying generation with same context')
    // Trigger regeneration in the active chat
    setRetryGeneration(prev => prev + 1)
    // Close modal - the chat will automatically send a retry message
    setShowPrompdPreview(false)
  }, [])

  // Handle first-time setup wizard completion
  const handleFirstTimeWizardComplete = useCallback((result: { template?: { id: string; name: string; content: string }; generatedContent?: string; filename?: string }) => {
    setShowFirstTimeWizard(false)
    // Sync React state with localStorage (wizard's handleComplete sets onboarding_complete)
    setOnboardingComplete(true)

    // Create a new tab with the selected template or generated content
    if (result.template) {
      const newTab: Tab = {
        id: 'template-' + Date.now(),
        name: result.template.id + '.prmd',
        text: result.template.content,
        dirty: true,
        viewMode: 'design'
      }
      addTabWithMode(newTab, setMode)
      console.log('[FirstTimeWizard] Created prompt from template:', result.template.name)
      // Note: Wizard hints are excluded via excludeCategory prop when mode !== 'wizard'
      // They'll show later when user clicks "New Prompd" to create from scratch
    } else if (result.generatedContent && result.filename) {
      const filename = result.filename.endsWith('.prmd') ? result.filename : result.filename + '.prmd'
      const newTab: Tab = {
        id: 'generated-' + Date.now(),
        name: filename,
        text: result.generatedContent,
        dirty: true,
        viewMode: 'design'
      }
      addTabWithMode(newTab, setMode)
      console.log('[FirstTimeWizard] Created prompt from AI generation:', filename)
      // Note: Wizard hints are excluded via excludeCategory prop when mode !== 'wizard'
      // They'll show later when user clicks "New Prompd" to create from scratch
    }
    // Note: If no template/generated content, user will see WelcomeView with non-wizard hints
  }, [addTabWithMode, setMode])

  // Handle opening chat in a new tab
  const handleOpenChatInTab = useCallback((mode: string, conversationId?: string, contextFile?: string | null) => {
    const newTab: Tab = {
      id: 'chat-' + Date.now(),
      name: 'Chat',
      text: '', // Chat tabs don't need text content
      type: 'chat',
      chatConfig: {
        mode,
        conversationId,
        contextFile
      }
    }

    addTab(newTab)
    console.log('Opened chat in new tab:', mode, conversationId)
  }, [addTab])

  // Open a brainstorm tab for collaborative editing with AI
  const handleOpenBrainstorm = useCallback((filePath: string, fileContent: string, sourceTabId?: string) => {
    // If a brainstorm tab already exists for this source, activate it
    const { tabs } = useEditorStore.getState()
    const existing = tabs.find(t =>
      t.type === 'brainstorm' && t.brainstormConfig?.sourceTabId === sourceTabId
    )
    if (existing) {
      activateTab(existing.id)
      return
    }

    // Inherit view mode from the source tab (default to design)
    const sourceTab = sourceTabId ? tabs.find(t => t.id === sourceTabId) : undefined
    const inheritedViewMode = sourceTab?.viewMode === 'code' ? 'code' : 'design'

    const fileName = filePath.split(/[\\/]/).pop() || filePath
    const newTab: Tab = {
      id: 'brainstorm-' + Date.now(),
      name: `Brainstorm: ${fileName}`,
      text: fileContent,
      type: 'brainstorm',
      viewMode: inheritedViewMode,
      brainstormConfig: {
        sourceFilePath: filePath,
        sourceTabId
      }
    }
    addTab(newTab)
  }, [addTab, activateTab])

  // Listen for open-brainstorm events from agent tool
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { filePath: string; content: string; sourceTabId?: string }
      if (detail) {
        handleOpenBrainstorm(detail.filePath, detail.content, detail.sourceTabId)
      }
    }
    window.addEventListener('open-brainstorm', handler)
    return () => window.removeEventListener('open-brainstorm', handler)
  }, [handleOpenBrainstorm])

  // Toast notifications - declare before handlers that use them
  const addToast = useUIStore(state => state.addToast)

  // Save current project directory to local storage
  const handleSaveToStorage = useCallback(async () => {
    if (!explorerDirHandle) {
      addToast('No project folder is open. Please open a folder first.', 'warning')
      return
    }

    try {
      const projectName = explorerDirHandle.name
      const project = await localProjectStorage.saveProject(projectName, explorerDirHandle, currentProjectId || undefined, explorerDirPath || undefined)
      setCurrentProjectId(project.id)

      // Also save current tab state
      const tabStates = tabs.map(tab => ({
        name: tab.name,
        path: tab.name,
        viewMode: tab.viewMode || 'code'
      }))

      const activeTab = getActiveTab()
      localProjectStorage.updateTabState(
        project.id,
        tabStates,
        activeTab?.name
      )

      console.log('[App] Saved project to local storage:', projectName)
      addToast(`Saved project "${projectName}" with ${project.files.length} files`, 'success')
    } catch (error) {
      console.error('Failed to save project:', error)
      addToast(error instanceof Error ? error.message : 'Failed to save project to storage', 'error')
    }
  }, [explorerDirHandle, explorerDirPath, currentProjectId, tabs, getActiveTab, setCurrentProjectId, addToast])

  // Open project from local storage
  const handleOpenFromStorage = useCallback(async (files: { path: string; content: string }[], name: string, projectId: string) => {
    const dirHandle = await localProjectStorage.getDirectoryHandle(projectId)
    const project = localProjectStorage.get(projectId)

    if (dirHandle) {
      const hasPermission = await localProjectStorage.verifyPermission(dirHandle)

      if (hasPermission) {
        setExplorerDirHandle(dirHandle)
        setExplorerEntries([])
        console.log(`✓ Restored directory handle for project: ${name}`)

        // Restore workspace path for git operations (Electron only)
        // Try project.workspacePath first, then fall back to dirHandle._electronPath
        const workspacePath = project?.workspacePath || (dirHandle as any)?._electronPath
        if (workspacePath) {
          setExplorerDirPath(workspacePath)
          // Also notify Electron to update window title
          if ((window as any).electronAPI?.setWorkspacePath) {
            (window as any).electronAPI.setWorkspacePath(workspacePath)
          }
          // Load persisted connections for this workspace
          useWorkflowStore.getState().loadConnections()
          console.log(`✓ Restored workspace path: ${workspacePath}`)
        }
      } else {
        console.warn(`Permission denied for directory: ${name}`)
        addToast(`Permission denied to access the original folder for "${name}". You can still work with the saved files, but changes won't sync to the original location.`, 'warning')
      }
    } else if (project?.workspacePath) {
      // Electron-only project: No browser directory handle, but we have the filesystem path
      // Create a pseudo handle for the workspace
      const electronAPI = (window as any).electronAPI
      if (electronAPI?.isElectron) {
        const pseudoHandle = {
          kind: 'directory' as const,
          name: name || project.workspacePath.split(/[/\\]/).pop() || 'workspace',
          _electronPath: project.workspacePath
        }
        setExplorerDirHandle(pseudoHandle as any)
        setExplorerDirPath(project.workspacePath)
        setExplorerEntries([])

        // Notify Electron to update window title
        if (electronAPI.setWorkspacePath) {
          electronAPI.setWorkspacePath(project.workspacePath)
        }
        // Load persisted connections for this workspace
        useWorkflowStore.getState().loadConnections()
        console.log(`✓ Restored Electron workspace for project: ${name} at ${project.workspacePath}`)
      } else {
        console.log(`No directory handle found for project: ${name} (not in Electron)`)
      }
    } else {
      console.log(`No directory handle or workspace path found for project: ${name}`)
    }
    const openTabs = project?.openTabs
    const activeTabPath = project?.activeTabPath

    if (openTabs && openTabs.length > 0) {
      const newTabs: Tab[] = openTabs.map((tabState, index) => {
        const file = files.find(f => f.path === tabState.path)
        if (!file) return null

        // Workflow files (.pdflow) always open in design view regardless of persisted state
        const isWorkflow = file.path.toLowerCase().endsWith('.pdflow')
        return {
          id: `storage-${projectId}-${index}`,
          name: file.path,
          text: file.content,
          dirty: false,
          viewMode: isWorkflow ? 'design' : tabState.viewMode
        }
      }).filter(Boolean) as Tab[]

      if (newTabs.length > 0) {
        // Replace all tabs instead of appending - user is opening a new project
        setTabs(newTabs)

        const activeTab = activeTabPath
          ? newTabs.find(t => t.name === activeTabPath) || newTabs[0]
          : newTabs[0]

        activateTab(activeTab.id)
        setCurrentProjectId(projectId)
        setMode(activeTab.viewMode || 'code')

        console.log(`✓ Restored ${newTabs.length} tabs from project: ${name}`)
        return
      }
    }

    // Opening a new project with no saved tabs - clear existing tabs
    setTabs([])
    setCurrentProjectId(projectId)
    console.log(`✓ Opened project: ${name} (${files.length} files) - Navigate via File Explorer`)
  }, [setTabs, activateTab, setCurrentProjectId, setMode, setExplorerDirHandle, setExplorerDirPath, setExplorerEntries])

  // Upload project to cloud database
  const handleUploadToCloud = useCallback(async (project: LocalProject) => {
    if (!isAuthenticated) {
      throw new Error('You must be signed in to upload projects to the cloud')
    }

    try {
      const { uploadProject, getProjectQuota } = await import('./services/api')

      const quota = await getProjectQuota(getToken)
      if (quota && quota.remaining === 0) {
        throw new Error(
          `Project limit reached!\n\n` +
          `You have ${quota.count}/${quota.limit} projects in the cloud.\n\n` +
          `Free users can have up to ${quota.limit} projects. Please delete or archive an existing project to upload a new one.\n\n` +
          `Want unlimited projects? Upgrade your plan!`
        )
      }

      const result = await uploadProject(
        project.name,
        project.files,
        `Uploaded from local storage on ${new Date().toLocaleString()}`,
        getToken
      )

      localProjectStorage.markAsUploaded(project.id, result.projectId)

      console.log(`✓ Uploaded project "${project.name}" to cloud: ${result.filesUploaded}/${project.files.length} files`)

      if (quota) {
        const newRemaining = quota.remaining - 1
        console.log(`📊 Project quota: ${quota.count + 1}/${quota.limit} (${newRemaining} remaining)`)
      }

      return result
    } catch (error) {
      console.error('Failed to upload project:', error)
      throw error
    }
  }, [isAuthenticated, getToken])

  // Handle opening local .pdpkg files
  const handleOpenLocalPackage = useCallback(async (blob: Blob, fileName: string) => {
    try {
      const result = await packageCache.loadLocalPackage(blob)

      // Check for prompd.json - if not present, show error and abandon
      if (!result.manifest) {
        console.warn('Local package missing prompd.json:', fileName)
        addToast(`Cannot open "${fileName}". This package does not contain a prompd.json file and may not be a valid Prompd package.`, 'error')
        return
      }

      // Open the local package modal
      setLocalPackageInfo({
        manifest: result.manifest,
        fileTree: result.fileTree,
        getFileContent: result.getFileContent,
        fileName
      })
    } catch (error) {
      console.error('Failed to open local package:', error)
      addToast(`Failed to open package "${fileName}". ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
    }
  }, [addToast])

  // Handle opening file from local package in editor
  const handleLocalPackageOpenInEditor = useCallback((content: string, filename: string) => {
    const newTab: Tab = {
      id: `local-pkg-${Date.now()}`,
      name: filename,
      text: content,
      dirty: false,
      viewMode: 'code',
      readOnly: true // Package files are read-only
    }
    addTab(newTab)
    setLocalPackageInfo(null)
  }, [addTab])

  // Handle using local package file as template
  const handleLocalPackageUseAsTemplate = useCallback((content: string, filename: string) => {
    const newTab: Tab = {
      id: `template-${Date.now()}`,
      name: `new-${filename}`,
      text: content,
      dirty: true, // Mark as dirty since it's a new file
      viewMode: 'code'
    }
    addTab(newTab)
    setLocalPackageInfo(null)
  }, [addTab])

  // AI chat panel callbacks (no refs needed with Zustand!)
  const aiGetText = useCallback(() => {
    // Only return text if there's an active tab - never fall back to store text
    // which might be stale. This ensures AIChatPanel knows when no file is open.
    const activeTab = getActiveTab()
    return activeTab?.text ?? ''
  }, [getActiveTab])

  const aiSetText = useCallback((newText: string) => {
    setText(newText)
    // Mark active tab as dirty
    if (activeTabId) {
      updateTab(activeTabId, { text: newText, dirty: true })
    }
  }, [setText, activeTabId, updateTab])

  const aiGetActiveTabName = useCallback(() => {
    return getActiveTab()?.name || null
  }, [getActiveTab])

  // Note: addToast is declared earlier (before handleSaveToStorage)
  const removeToast = useUIStore(state => state.removeToast)
  const setBuildOutput = useUIStore(state => state.setBuildOutput)
  const addPackageBuildRecord = useUIStore(state => state.addPackageBuildRecord)
  const setShowBuildPanel = useUIStore(state => state.setShowBuildPanel)
  const setShowBottomPanel = useUIStore(state => state.setShowBottomPanel)
  const setActiveBottomTab = useUIStore(state => state.setActiveBottomTab)
  const aiShowNotification = useCallback((message: string, type?: 'info' | 'warning' | 'error' | 'success', duration?: number) => {
    addToast(message, type || 'info', duration)
  }, [addToast])

  // Sync Monaco markers to build output panel whenever they change
  // Live update - show errors when present, clear when fixed
  const setBottomPanelMinimized = useUIStore(state => state.setBottomPanelMinimized)
  const openBottomPanelMinimized = useUIStore(state => state.openBottomPanelMinimized)
  useEffect(() => {
    if (monacoMarkers.length > 0) {
      const errorCount = monacoMarkers.filter(m => !m.severity || m.severity === 'error').length
      const warnCount = monacoMarkers.filter(m => m.severity === 'warning' || m.severity === 'info' || m.severity === 'hint').length
      const parts: string[] = []
      if (errorCount > 0) parts.push(`${errorCount} ${errorCount === 1 ? 'error' : 'errors'}`)
      if (warnCount > 0) parts.push(`${warnCount} ${warnCount === 1 ? 'warning' : 'warnings'}`)
      setBuildOutput({
        status: 'error',
        message: parts.join(', '),
        errors: monacoMarkers,
        timestamp: Date.now()
      })
      // Auto-open output panel when errors appear (show minimized if not already visible)
      const panelState = useUIStore.getState()
      if (!panelState.showBottomPanel) {
        setShowBottomPanel(true)
        setBottomPanelMinimized(true)
      }
      setActiveBottomTab('errors')
    } else {
      // Clear errors when all markers are resolved
      setBuildOutput({
        status: 'success',
        message: 'No problems found',
        errors: undefined,
        timestamp: Date.now()
      })
    }
  }, [monacoMarkers, setBuildOutput, setShowBottomPanel, setActiveBottomTab, setBottomPanelMinimized])

  // Parse build error string into structured errors
  // Supports multiple formats:
  // 1. CLI validation: "Validation errors in .prmd files:\n  file.prmd:\n    - Error message (line X)"
  // 2. JSON parse: "Invalid prompd.json: /path/to/file.json: Error message (line X column Y)"
  // 3. Generic with path: "Error: /path/to/file: message"
  const parseBuildErrors = useCallback((errorString: string): { file: string; message: string; line?: number; column?: number }[] => {
    const errors: { file: string; message: string; line?: number; column?: number }[] = []

    if (!errorString) return errors

    // Try to match JSON parse error format with Windows paths:
    // "Invalid prompd.json: C:\path\to\file.json: Expected ',' or ']' ... (line 17 column 5)"
    // Windows paths have drive letter + colon (C:), so we need to match:
    // - Optional drive letter (e.g., C:)
    // - Path characters until ": " (colon-space separates path from error message)
    const jsonErrorMatch = errorString.match(/^Invalid (\S+):\s*([A-Za-z]:)?([^:]+):\s*(.+?)\s*\(line\s+(\d+)(?:\s+column\s+(\d+))?\)/)
    if (jsonErrorMatch) {
      const [, fileType, driveLetter, pathRest, message, lineStr, colStr] = jsonErrorMatch
      const filePath = (driveLetter || '') + pathRest
      errors.push({
        file: filePath,
        message: `Invalid ${fileType}: ${message}`,
        line: parseInt(lineStr, 10),
        column: colStr ? parseInt(colStr, 10) : undefined
      })
      return errors
    }

    // Try simpler JSON error format without line/column:
    // "Invalid prompd.json: C:\path\to\file.json: Unexpected token..."
    const simpleJsonMatch = errorString.match(/^Invalid (\S+):\s*([A-Za-z]:)?([^:]+):\s*(.+)$/)
    if (simpleJsonMatch) {
      const [, fileType, driveLetter, pathRest, message] = simpleJsonMatch
      const filePath = (driveLetter || '') + pathRest
      // Try to extract line from message like "at position X (line Y column Z)"
      const posMatch = message.match(/\(line\s+(\d+)(?:\s+column\s+(\d+))?\)/)
      errors.push({
        file: filePath,
        message: `Invalid ${fileType}: ${message.replace(/\s*\(line\s+\d+.*\)$/, '')}`,
        line: posMatch ? parseInt(posMatch[1], 10) : undefined,
        column: posMatch?.[2] ? parseInt(posMatch[2], 10) : undefined
      })
      return errors
    }

    // Parse CLI validation format: multi-line with file headers
    const lines = errorString.split('\n')
    let currentFile: string | null = null

    for (const line of lines) {
      // Check for file header: "  filename.prmd:"
      const fileMatch = line.match(/^\s{2}(\S+\.prmd):?\s*$/)
      if (fileMatch) {
        currentFile = fileMatch[1]
        continue
      }

      // Check for error line: "    - Error message (line X)"
      const errorMatch = line.match(/^\s{4}-\s+(.+?)(?:\s+\(line\s+(\d+)\))?$/)
      if (errorMatch && currentFile) {
        errors.push({
          file: currentFile,
          message: errorMatch[1],
          line: errorMatch[2] ? parseInt(errorMatch[2], 10) : undefined
        })
      }
    }

    return errors
  }, [])

  // Set Monaco markers for build errors (to show squiggly lines)
  // Uses window.monaco which is set by @monaco-editor/react when an editor is mounted
  const setBuildErrorMarkers = useCallback((errors: BuildError[]) => {
    const monacoInstance = (window as any).monaco
    if (!monacoInstance) return

    // Group errors by file
    const errorsByFile = new Map<string, BuildError[]>()
    for (const error of errors) {
      const existing = errorsByFile.get(error.file) || []
      existing.push(error)
      errorsByFile.set(error.file, existing)
    }

    // Find matching models and set markers
    const models = monacoInstance.editor.getModels()
    for (const model of models) {
      const modelUri = model.uri.toString()
      let modelPath = modelUri

      // Convert Monaco URI to file path for matching
      if (modelUri.startsWith('file:///')) {
        modelPath = decodeURIComponent(modelUri.replace('file:///', ''))
        if (modelPath.match(/^[a-zA-Z]:\//)) {
          modelPath = modelPath.replace(/\//g, '\\')
        }
      }

      const modelFileName = modelPath.split(/[/\\]/).pop() || modelPath

      // Find errors that match this model
      let matchedErrors: BuildError[] = []

      for (const [errorFile, fileErrors] of errorsByFile) {
        const errorFileName = errorFile.split(/[/\\]/).pop() || errorFile

        // Match by exact path, path ending, or filename
        if (
          errorFile === modelPath ||
          modelPath.endsWith('/' + errorFile) ||
          modelPath.endsWith('\\' + errorFile) ||
          errorFile.endsWith('/' + modelFileName) ||
          errorFile.endsWith('\\' + modelFileName) ||
          errorFileName === modelFileName
        ) {
          matchedErrors = matchedErrors.concat(fileErrors)
        }
      }

      if (matchedErrors.length > 0) {
        // Convert build errors to Monaco markers
        const markers = matchedErrors.map(error => ({
          severity: monacoInstance.MarkerSeverity.Error,
          startLineNumber: error.line || 1,
          startColumn: error.column || 1,
          endLineNumber: error.line || 1,
          endColumn: error.column ? error.column + 20 : model.getLineMaxColumn(error.line || 1),
          message: error.message,
          source: 'build'
        }))

        console.log('[App] Setting build markers for', modelPath, ':', markers.length, 'markers')
        monacoInstance.editor.setModelMarkers(model, 'build', markers)
      }
    }
  }, [])

  // Clear build error markers
  const clearBuildErrorMarkers = useCallback(() => {
    const monacoInstance = (window as any).monaco
    if (!monacoInstance) return

    const models = monacoInstance.editor.getModels()
    for (const model of models) {
      monacoInstance.editor.setModelMarkers(model, 'build', [])
    }
  }, [])

  // Handle package build (Ctrl+Shift+B) - builds package to ./dist/ without modal
  const handleBuildPackage = useCallback(async () => {
    if (!explorerDirHandle) {
      aiShowNotification('No workspace open. Open a folder to create a package.', 'warning')
      return
    }

    // Get workspace path for Electron
    const electronPath = (explorerDirHandle as any)?._electronPath
    if (!electronPath) {
      // Fallback to publish modal for web mode
      openModal('publish')
      return
    }

    // Check if package:createLocal is available
    if (!window.electronAPI?.package?.createLocal) {
      // Fallback to publish modal if IPC not available
      openModal('publish')
      return
    }

    // Show validation status
    setBuildOutput({
      status: 'building',
      message: 'Validating compilable files...',
      timestamp: Date.now()
    })

    // Validate all compilable files (.prmd and .pdflow) before building
    // Other files (content files, user personas, etc.) are allowed to not compile
    console.log('[App] Validating compilable files before build...')
    const compilableFiles = explorerEntries.filter(entry =>
      entry.kind === 'file' && (entry.name.endsWith('.prmd') || entry.name.endsWith('.pdflow'))
    )

    if (compilableFiles.length > 0) {
      const validationErrors: Array<{ file: string; message: string; line?: number; column?: number }> = []

      for (const file of compilableFiles) {
        try {
          // Read the file
          const fullPath = `${electronPath}/${file.path}`
          const result = await window.electronAPI.readFile(fullPath)

          if (result.success && result.content) {
            if (file.name.endsWith('.pdflow')) {
              // Validate workflow files
              const { parseWorkflow } = await import('./services/workflowParser')
              const parsed = parseWorkflow(result.content)

              if (parsed.errors && parsed.errors.length > 0) {
                // Add errors with file context
                for (const error of parsed.errors) {
                  const node = parsed.nodes?.find(n => n.id === error.nodeId)
                  const nodeLabel = node?.data?.label || error.nodeId || 'Unknown'

                  // Find line number in JSON
                  let lineNumber: number | undefined
                  if (error.nodeId) {
                    const lines = result.content.split('\n')
                    const nodeIdPattern = new RegExp(`"id":\\s*"${error.nodeId}"`)
                    for (let i = 0; i < lines.length; i++) {
                      if (nodeIdPattern.test(lines[i])) {
                        lineNumber = i + 1
                        break
                      }
                    }
                  }

                  validationErrors.push({
                    file: file.path,
                    message: `Node '${nodeLabel}': ${error.message}`,
                    line: lineNumber,
                    column: undefined,
                  })
                }
              }
            } else if (file.name.endsWith('.prmd')) {
              // Validate .prmd files with comprehensive validation (includes Jinja2 template syntax)
              const { validatePrompdComprehensive } = await import('./lib/prompdParser')
              const parsed = validatePrompdComprehensive(result.content)

              if (parsed.issues && parsed.issues.length > 0) {
                // Filter for errors only (not warnings or info)
                const errors = parsed.issues.filter(issue => issue.severity === 'error')
                for (const error of errors) {
                  validationErrors.push({
                    file: file.path,
                    message: error.message,
                    line: error.line,
                    column: error.column,
                  })
                }
              }
            }
          }
        } catch (err) {
          console.error(`[App] Error validating ${file.path}:`, err)
          validationErrors.push({
            file: file.path,
            message: `Failed to validate: ${err instanceof Error ? err.message : 'Unknown error'}`,
          })
        }
      }

      // If there are validation errors, prevent the build
      if (validationErrors.length > 0) {
        setBuildOutput({
          status: 'error',
          message: `Build cancelled: ${validationErrors.length} validation error${validationErrors.length > 1 ? 's' : ''} found`,
          errors: validationErrors,
          timestamp: Date.now(),
        })
        setShowBottomPanel(true)
        setActiveBottomTab('output')
        aiShowNotification(`Build cancelled: Fix ${validationErrors.length} error${validationErrors.length > 1 ? 's' : ''} first`, 'error', 8000)
        console.error('[App] Build cancelled due to validation errors:', validationErrors)
        return
      }

      console.log(`[App] All ${compilableFiles.length} compilable files validated successfully`)

      // Show validation success status briefly
      setBuildOutput({
        status: 'building',
        message: `Validated ${compilableFiles.length} file${compilableFiles.length > 1 ? 's' : ''} successfully. Building package...`,
        timestamp: Date.now()
      })
    } else {
      // No compilable files, just show building status
      setBuildOutput({
        status: 'building',
        message: 'Building package...',
        timestamp: Date.now()
      })
    }

    // Show building notification (short duration, will be replaced by result)
    const buildingToastId = addToast('Building package...', 'info', 0) // 0 = persistent until removed

    console.log('[App] Building package from:', electronPath)

    try {
      const result = await window.electronAPI.package.createLocal(electronPath)

      // Remove the building notification
      removeToast(buildingToastId)

      if (result.success) {
        // Clear any previous build error markers
        clearBuildErrorMarkers()

        // Build success message with validation info
        const validationInfo = compilableFiles.length > 0
          ? `Validated ${compilableFiles.length} file${compilableFiles.length > 1 ? 's' : ''}. `
          : ''

        const buildTimestamp = Date.now()
        setBuildOutput({
          status: 'success',
          message: validationInfo + (result.message || 'Package created successfully!'),
          outputPath: result.outputPath,
          fileName: result.fileName,
          fileCount: result.fileCount,
          size: result.size,
          timestamp: buildTimestamp,
          // Include build log for raw output display
          details: result.log,
          // Explicitly clear error fields from previous failed builds
          errors: undefined
        })
        addPackageBuildRecord({
          id: `build-${buildTimestamp}`,
          status: 'success',
          message: result.message || 'Package created successfully!',
          fileName: result.fileName,
          outputPath: result.outputPath,
          fileCount: result.fileCount,
          size: result.size,
          timestamp: buildTimestamp,
        })
        // Don't change panel state on success - show toast notification (8s auto-dismiss)
        aiShowNotification('Package created successfully!', 'success', 8000)
        console.log('[App] Package created at:', result.outputPath)
      } else {
        // Parse structured errors from CLI output
        const errors = parseBuildErrors(result.error || '')
        // Set Monaco markers to show squiggly lines for build errors
        if (errors.length > 0) {
          setBuildErrorMarkers(errors)
        }
        const errorTimestamp = Date.now()
        setBuildOutput({
          status: 'error',
          message: errors.length > 0 ? `Build failed: ${errors.length} error${errors.length > 1 ? 's' : ''}` : 'Build failed',
          details: result.error,
          errors: errors.length > 0 ? errors : undefined,
          timestamp: errorTimestamp
        })
        addPackageBuildRecord({
          id: `build-${errorTimestamp}`,
          status: 'error',
          message: errors.length > 0 ? `Build failed: ${errors.length} error${errors.length > 1 ? 's' : ''}` : 'Build failed',
          timestamp: errorTimestamp,
          errors: errors.length > 0 ? errors : undefined,
        })
        // Show output panel on error (no toast - panel shows details)
        setShowBottomPanel(true)
        setActiveBottomTab('output')
        console.error('[App] Package build failed:', result.error)
      }
    } catch (err) {
      // Remove the building notification
      removeToast(buildingToastId)

      const message = err instanceof Error ? err.message : 'Unknown error'
      const stack = err instanceof Error ? err.stack : undefined
      setBuildOutput({
        status: 'error',
        message: 'Build error',
        details: stack || message,
        timestamp: Date.now()
      })
      // Show output panel on error (no toast - panel shows details)
      setShowBottomPanel(true)
      setActiveBottomTab('output')
      console.error('[App] Package build error:', message)
    }
  }, [explorerDirHandle, explorerEntries, aiShowNotification, openModal, setBuildOutput, setShowBuildPanel, parseBuildErrors, addToast, removeToast, setBuildErrorMarkers, clearBuildErrorMarkers])

  // Note: Keyboard shortcuts are handled by Electron menu accelerators (main.js)
  // which send IPC messages to the renderer. No standalone keyboard listeners needed.

  // Listen for Monaco-forwarded keyboard events and slash commands
  // These events are dispatched from PrompdEditor.tsx when Monaco intercepts hotkeys
  // Note: Save is handled separately after the save callback is defined
  useEffect(() => {
    const handleBuildEvent = () => handleBuildPackage()
    const handleToggleOutputPanel = () => {
      console.log('[App.tsx] toggle-output-panel event received')
      const currentState = useUIStore.getState()
      const isCurrentlyVisible = currentState.showBottomPanel
      if (isCurrentlyVisible) {
        // If visible, hide it
        currentState.setShowBottomPanel(false)
      } else {
        // If hidden, show it and dispatch expand event
        currentState.setShowBottomPanel(true)
        currentState.setActiveBottomTab('output')
        // Also expand the panel (it may have been auto-minimized on editor focus)
        window.dispatchEvent(new CustomEvent('expand-output-panel'))
      }
    }
    const handleSetViewMode = (e: CustomEvent) => {
      const newMode = e.detail as 'wizard' | 'design' | 'code'
      if (['wizard', 'design', 'code'].includes(newMode)) {
        setMode(newMode)
        if (activeTabId) {
          updateTab(activeTabId, { viewMode: newMode })
        }
      }
    }
    const handleToggleSidebar = (e: CustomEvent) => {
      const panel = e.detail as string
      if (panel === activeSide && showSidebar) {
        setShowSidebar(false)
      } else {
        setActiveSide(panel as any)
        setShowSidebar(true)
      }
    }
    const handlePublish = () => openModal('publish')

    window.addEventListener('prompd-build-package', handleBuildEvent)
    window.addEventListener('toggle-output-panel', handleToggleOutputPanel)
    window.addEventListener('set-view-mode', handleSetViewMode as EventListener)
    window.addEventListener('toggle-sidebar', handleToggleSidebar as EventListener)
    window.addEventListener('prompd-publish', handlePublish)

    return () => {
      window.removeEventListener('prompd-build-package', handleBuildEvent)
      window.removeEventListener('toggle-output-panel', handleToggleOutputPanel)
      window.removeEventListener('set-view-mode', handleSetViewMode as EventListener)
      window.removeEventListener('toggle-sidebar', handleToggleSidebar as EventListener)
      window.removeEventListener('prompd-publish', handlePublish)
    }
  }, [handleBuildPackage, setMode, activeSide, showSidebar, setShowSidebar, setActiveSide, openModal])

  // Handle opening file from error panel (custom event from BuildOutputPanel)
  useEffect(() => {
    const handleOpenFileFromError = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.filePath && detail?.content !== undefined) {
        onOpenFile({
          name: detail.fileName || detail.filePath.split(/[/\\]/).pop() || 'file',
          text: detail.content,
          electronPath: detail.filePath,
          readOnly: false
        })
        setMode('code')
        // Jump to error location
        if (detail.line && detail.line > 0) {
          setTimeout(() => {
            setJumpTo({ line: detail.line, column: detail.column || 1 })
          }, 100)
        }
      }
    }

    window.addEventListener('open-file-from-error', handleOpenFileFromError)

    // Handle opening a local package from build history
    const handleOpenLocalPackageEvent = async (e: Event) => {
      const { outputPath } = (e as CustomEvent).detail
      if (!outputPath || !window.electronAPI?.readBinaryFile) return
      try {
        const result = await window.electronAPI.readBinaryFile(outputPath)
        if (result.success && result.data) {
          const binaryString = atob(result.data)
          const bytes = new Uint8Array(binaryString.length)
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i)
          }
          const fileName = outputPath.split(/[/\\]/).pop() || 'package.pdpkg'
          const blob = new Blob([bytes])
          handleOpenLocalPackage(blob, fileName)
        }
      } catch (err) {
        console.error('[App] Failed to open package from history:', err)
      }
    }
    window.addEventListener('open-local-package', handleOpenLocalPackageEvent)

    return () => {
      window.removeEventListener('open-file-from-error', handleOpenFileFromError)
      window.removeEventListener('open-local-package', handleOpenLocalPackageEvent)
    }
  }, [onOpenFile, setMode, setJumpTo, handleOpenLocalPackage])

  // Handle opening file from build output panel errors
  const handleOpenBuildErrorFile = useCallback(async (relativePath: string, line?: number) => {
    const electronAPI = (window as any).electronAPI
    const workspacePath = (explorerDirHandle as any)?._electronPath

    if (!electronAPI?.readFile || !workspacePath) {
      console.error('[App] Cannot open file - no workspace or not in Electron')
      return
    }

    const fullPath = `${workspacePath}/${relativePath}`.replace(/\\/g, '/')
    console.log('[App] Opening build error file:', fullPath, 'line:', line)

    try {
      const result = await electronAPI.readFile(fullPath)
      if (result.success && result.content !== undefined) {
        onOpenFile({
          name: relativePath,
          text: result.content,
          electronPath: fullPath,
          readOnly: false
        })
        // Force code view for error navigation
        setMode('code')
        // Jump to the error line if specified
        if (line && line > 0) {
          // Small delay to ensure editor is mounted and ready
          setTimeout(() => {
            setJumpTo({ line, column: 1 })
          }, 100)
        }
      } else {
        console.error('[App] Failed to read file:', result.error)
      }
    } catch (err) {
      console.error('[App] Error opening file:', err)
    }
  }, [explorerDirHandle, onOpenFile, setMode, setJumpTo])

  // Handle pending edit for inline diff view
  const handleSetPendingEdit = useCallback((edit: EditorPendingEdit | null) => {
    setEditorPendingEdit(edit)
  }, [])

  // Handle file written by agent - update any open tab with the new content
  const handleFileWritten = useCallback((path: string, content: string) => {
    console.log('[App] handleFileWritten called:', path, 'content length:', content.length)

    const { tabs, activeTabId: currentActiveTabId } = useEditorStore.getState()
    const filename = path.replace(/\\/g, '/').split('/').pop() || path

    // Try to find the tab by relative path first
    let tab = tabManager.findTabByPath(path)

    // If not found and we have a workspace path, try with the full path
    if (!tab && explorerDirPath) {
      const fullPath = path.startsWith(explorerDirPath)
        ? path
        : `${explorerDirPath}/${path.replace(/^\.?[/\\]/, '')}`
      console.log('[App] Trying full path:', fullPath)
      tab = tabManager.findTabByPath(fullPath)
    }

    // If still not found, check if active tab's filename matches
    if (!tab && currentActiveTabId) {
      const activeTab = tabs.find(t => t.id === currentActiveTabId)
      if (activeTab && activeTab.type === 'file') {
        const activeFilename = activeTab.name.replace(/\\/g, '/').split('/').pop() || activeTab.name
        if (activeFilename === filename) {
          console.log('[App] Matched by active tab filename:', activeFilename)
          tab = activeTab
        }
      }
    }

    if (tab) {
      console.log('[App] Found matching tab:', tab.id, tab.name, 'isActive:', tab.id === currentActiveTabId)
      // Update the tab with the new content (marks it as saved, not dirty)
      tabManager.refreshTab(tab.id, content)
      console.log('[App] Tab refreshed, new content should be visible')
    } else {
      // Log all open tabs to help debug path matching
      console.log('[App] No tab found for path:', path)
      console.log('[App] Open tabs:', tabs.filter(t => t.type === 'file').map(t => t.name))
    }
  }, [tabManager, explorerDirPath])

  const handleAcceptEdit = useCallback(() => {
    if (!editorPendingEdit) return

    // Apply the edit to the current text
    const lines = text.split('\n')
    const [startLine, endLine] = editorPendingEdit.lineNumbers
    const startIdx = Math.max(0, startLine - 1)
    const endIdx = Math.min(lines.length - 1, endLine - 1)

    const newContentLines = editorPendingEdit.content.split('\n')
    const beforeLines = lines.slice(0, startIdx)
    const afterLines = lines.slice(endIdx + 1)
    const newText = [...beforeLines, ...newContentLines, ...afterLines].join('\n')

    setText(newText)

    // Mark active tab as dirty
    if (activeTabId) {
      updateTab(activeTabId, { text: newText, dirty: true })
    }

    setEditorPendingEdit(null)
    aiShowNotification(`Changes applied: Lines ${startLine}-${endLine} replaced`, 'info')
  }, [editorPendingEdit, text, setText, activeTabId, updateTab, aiShowNotification])

  const handleDeclineEdit = useCallback(() => {
    setEditorPendingEdit(null)
    aiShowNotification('Changes declined', 'info')
  }, [aiShowNotification])

  // Shared file reader for workspace files (used by execution handlers)
  const readFileFromWorkspace = useCallback(async (filePath: string): Promise<string | null> => {
    const electronAPI = (window as { electronAPI?: { readFile: (path: string) => Promise<{ success: boolean; content?: string; error?: string }>, getWorkspacePath: () => Promise<string | null> } }).electronAPI

    // Electron mode: use IPC bridge
    if (electronAPI?.readFile) {
      try {
        // Check if path is already absolute
        const isAbsolutePath = /^[A-Za-z]:[\\/]/.test(filePath) || filePath.startsWith('/')
        let fullPath: string

        if (isAbsolutePath) {
          fullPath = filePath.replace(/\\/g, '/')
        } else {
          // Get workspace path
          let workspacePath = await electronAPI.getWorkspacePath()
          if (!workspacePath && explorerDirHandle && (explorerDirHandle as any)._electronPath) {
            workspacePath = (explorerDirHandle as any)._electronPath
          }
          if (!workspacePath) {
            return null
          }

          const normalizedPath = filePath.replace(/^\.\//, '')
          fullPath = `${workspacePath}/${normalizedPath}`.replace(/\\/g, '/')
        }

        const result = await electronAPI.readFile(fullPath)
        if (result.success && result.content !== undefined) {
          return result.content
        }
        return null
      } catch (error) {
        console.warn(`Failed to read ${filePath}:`, error)
        return null
      }
    }

    // Web mode: use File System Access API
    if (!explorerDirHandle) {
      return null
    }

    try {
      const normalizedPath = filePath.replace(/^\.\//, '').replace(/\\/g, '/')
      const pathParts = normalizedPath.split('/').filter(p => p && p !== '.')

      let dirHandle: FileSystemDirectoryHandle = explorerDirHandle
      for (let i = 0; i < pathParts.length - 1; i++) {
        dirHandle = await dirHandle.getDirectoryHandle(pathParts[i])
      }

      const fileName = pathParts[pathParts.length - 1]
      const fileHandle = await dirHandle.getFileHandle(fileName)
      const file = await fileHandle.getFile()
      const content = await file.text()

      return content
    } catch (error) {
      console.warn(`Failed to load file ${filePath}:`, error)
      return null
    }
  }, [explorerDirHandle])

  // Handle executing a .prmd file - creates execution tab
  const handleExecutePrompd = useCallback(async () => {
    const activeTab = getActiveTab()
    if (!activeTab || activeTab.type === 'execution') return

    // Auto-save if enabled and file is dirty
    if (autoSaveEnabled && activeTab.dirty && activeTab.handle && saveRef.current) {
      try {
        console.log('[App.tsx] Auto-saving before execution...')
        await saveRef.current()
      } catch (err) {
        console.warn('[App.tsx] Auto-save failed, continuing with execution:', err)
      }
    }

    const parsed = parsePrompd(activeTab.text)
    const originalParams = Object.entries(parsed.paramsSchema).map(([name, schema]) => ({
      name,
      type: schema.type,
      description: schema.description,
      required: schema.required,
      default: schema.default,
      enum: schema.enum,
      min: schema.min,
      max: schema.max
    }))

    const specialtySections = ['system', 'user', 'task', 'output', 'response', 'context', 'assistant']
    const extractedSections: Record<string, any> = {}

    // Get source file path for converting workspace paths to relative paths
    let sourceFilePath: string | null = null
    if (activeTab.handle && explorerDirHandle) {
      try {
        sourceFilePath = await resolveFileHandle(explorerDirHandle, activeTab.handle)
        console.log('[App.tsx] Source file path for extraction:', sourceFilePath)
      } catch (error) {
        console.warn('[App.tsx] Could not resolve source file path:', error)
      }
    }

    const readFileContent = async (originalFilePath: string): Promise<{ content: string, filePath: string }> => {
      if (!explorerDirHandle) {
        return { content: '', filePath: originalFilePath }
      }

      try {
        let workspacePath = originalFilePath.replace(/\\/g, '/')

        // Resolve relative paths to be absolute from the workspace root
        if (sourceFilePath && (workspacePath.startsWith('./') || workspacePath.startsWith('../'))) {
          const sourceDir = sourceFilePath.substring(0, sourceFilePath.lastIndexOf('/') + 1)
          const pathParts = (sourceDir + workspacePath).split('/')
          const resolvedParts: string[] = []
          for (const part of pathParts) {
            if (part === '..') {
              if (resolvedParts.length === 0) {
                throw new Error(`Path travels above workspace root: ${originalFilePath}`)
              }
              resolvedParts.pop()
            } else if (part !== '.' && part !== '') {
              resolvedParts.push(part)
            }
          }
          workspacePath = resolvedParts.join('/')
        }

        const pathParts = workspacePath.split('/').filter(p => p && p !== '.')
        let dirHandle: FileSystemDirectoryHandle = explorerDirHandle

        for (let i = 0; i < pathParts.length - 1; i++) {
          dirHandle = await dirHandle.getDirectoryHandle(pathParts[i])
        }

        const fileName = pathParts[pathParts.length - 1]
        const fileHandle = await dirHandle.getFileHandle(fileName)
        const file = await fileHandle.getFile()
        const content = await file.text()

        console.log(`[App.tsx] Read file for exec tab: ${originalFilePath} (resolved to ${workspacePath})`)
        return { content, filePath: originalFilePath }
      } catch (error) {
        console.warn(`Failed to load file ${originalFilePath}:`, error)
        return { content: '', filePath: originalFilePath }
      }
    }

    for (const sectionName of specialtySections) {
      const frontmatterValue = parsed.frontmatter[sectionName]

      if (!frontmatterValue) continue

      if (sectionName === 'context') {
        // Context supports multiple files
        const contextFiles: string[] = Array.isArray(frontmatterValue)
          ? frontmatterValue
          : [frontmatterValue]

        const contextSections = await Promise.all(
          contextFiles.map(filePath => readFileContent(filePath))
        )

        extractedSections.context = contextSections.map(({ content, filePath }) => ({
          type: 'file',
          content,
          filePath
        }))
      } else {
        // All other sections are single-file, but may be specified as string or array
        let filePathToLoad: string | null = null

        if (typeof frontmatterValue === 'string') {
          filePathToLoad = frontmatterValue
        } else if (Array.isArray(frontmatterValue) && frontmatterValue.length > 0) {
          filePathToLoad = frontmatterValue[0]
        }

        if (filePathToLoad) {
          const { content, filePath } = await readFileContent(filePathToLoad)
          extractedSections[sectionName] = {
            type: 'file',
            content,
            filePath
          }
        }
      }
    }

    const newTab: Tab = {
      id: `execution-${Date.now()}`,
      name: `${activeTab.name} (execution)`,
      text: '',
      type: 'execution',
      handle: activeTab.handle,
      filePath: activeTab.filePath,
      packageSource: activeTab.packageSource,
      executionConfig: {
        sourceTabId: activeTab.id,
        prompdSource: {
          type: activeTab.packageSource ? 'package' : 'file',
          content: activeTab.text,
          originalParams,
          filePath: activeTab.filePath,
          packageRef: activeTab.packageSource
            ? `${activeTab.packageSource.packageId}/${activeTab.packageSource.filePath}`
            : undefined
        },
        parameters: activeTab.previewParams || {},
        customParameters: [],
        sections: extractedSections,
        provider: llmProvider.provider,
        model: llmProvider.model,
        maxTokens: llmProvider.maxTokens,
        temperature: llmProvider.temperature,
        mode: llmProvider.generationMode,
        executionHistory: [],
        workspacePath: explorerDirPath || undefined
      }
    }

    addTab(newTab)

    const totalFiles = Object.values(extractedSections).flat().length
    if (totalFiles > 0) {
      const sectionNames = Object.keys(extractedSections).join(', ')
      aiShowNotification(`Created execution workspace with ${totalFiles} attached file(s) in sections: ${sectionNames}`, 'info')
    } else {
      aiShowNotification(`Created execution workspace for ${activeTab.name}`, 'info')
    }
  }, [getActiveTab, explorerDirHandle, explorerDirPath, llmProvider.provider, llmProvider.model, llmProvider.maxTokens, llmProvider.temperature, llmProvider.generationMode, addTab, aiShowNotification, autoSaveEnabled])

  // Handle direct execution from preview (without creating execution tab)
  const handleExecuteFromPreview = useCallback(async () => {
    const activeTab = getActiveTab()
    if (!activeTab || activeTab.type === 'execution') return

    // Open bottom panel minimized to Prompds tab if closed
    openBottomPanelMinimized('prompds')

    // Set executing state
    setIsExecutingPreview(true)

    // For package files, resolve source path from packageSource
    const packageSourceFilePath = activeTab.packageSource?.filePath
    const packageSourceId = activeTab.packageSource?.packageId

    // Build execution config
    const executionConfig = {
      prompdSource: {
        type: (packageSourceId ? 'package' : 'file') as 'file' | 'package',
        content: activeTab.text,
        originalParams: [],
        filePath: activeTab.filePath,
        packageRef: packageSourceId ? `${packageSourceId}/${packageSourceFilePath}` : undefined
      },
      parameters: activeTab.previewParams || {},
      customParameters: [],
      sections: {},
      provider: llmProvider.provider,
      model: llmProvider.model,
      maxTokens: llmProvider.maxTokens,
      temperature: llmProvider.temperature,
      mode: llmProvider.generationMode,
      executionHistory: [],
      workspacePath: explorerDirPath || undefined
    }

    try {
      // Execute the prompd
      const result = await executePrompdConfig(
        executionConfig,
        async () => {
          const token = await getToken()
          return token
        },
        readFileFromWorkspace,
        activeTab.filePath || packageSourceFilePath || undefined,
        {
          workspacePath: explorerDirPath,
          selectedEnvFile
        },
        packageSourceId  // Pass package ID for resolving file references from package cache
      )

      if (result.status === 'success') {
        aiShowNotification('Execution completed successfully', 'info')

        // Extract compiled prompt text
        const compiledPromptText = typeof result.compiledPrompt === 'string'
          ? result.compiledPrompt
          : result.compiledPrompt?.finalPrompt || ''

        // Add to session history
        setPrompdSessionHistory(prev => [...prev, {
          id: `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
          provider: result.metadata?.provider || executionConfig.provider,
          model: result.metadata?.model || executionConfig.model,
          compiledPrompt: compiledPromptText,
          response: result.content,
          success: true,
          promptTokens: result.metadata?.tokensUsed?.input || 0,
          completionTokens: result.metadata?.tokensUsed?.output || 0,
          totalTokens: result.metadata?.tokensUsed?.total || 0,
          duration: result.metadata?.duration || 0,
          context: activeTab.name || 'preview'
        }])

        // Record to IndexedDB
        usageTracker.recordExecution({
          provider: result.metadata?.provider || executionConfig.provider,
          model: result.metadata?.model || executionConfig.model,
          promptTokens: result.metadata?.tokensUsed?.input || 0,
          completionTokens: result.metadata?.tokensUsed?.output || 0,
          totalTokens: result.metadata?.tokensUsed?.total || 0,
          duration: result.metadata?.duration || 0,
          success: true,
          executionMode: result.metadata?.executionMode || 'local',
          compiledPrompt: compiledPromptText,
          response: result.content,
          context: activeTab.name || 'preview'
        }).catch(err => {
          console.warn('[App.tsx] Failed to record execution to IndexedDB:', err)
        })

        // GA4 analytics (anonymous)
        ;(window as any).electronAPI?.analytics?.trackEvent('prompt_execute', {
          event_category: 'execution',
          provider: result.metadata?.provider || executionConfig.provider,
        })

        // Show bottom panel with Prompds tab, expand if minimized
        setShowBottomPanel(true)
        setActiveBottomTab('prompds')
        setBottomPanelMinimized(false)
        setIsExecutingPreview(false)
      } else {
        const isAuthError = result.content.includes('Unauthorized') || result.content.includes('Authentication required')

        if (isAuthError) {
          aiShowNotification(
            'Backend authentication required. Please start the backend server (port 3010) with MongoDB and API keys configured.',
            'error'
          )
        } else {
          aiShowNotification(
            `Execution failed: ${result.content}`,
            'error'
          )
        }

        // Add failed execution to session history
        const compiledPromptForError = typeof result.compiledPrompt === 'string'
          ? result.compiledPrompt
          : result.compiledPrompt?.finalPrompt || ''
        setPrompdSessionHistory(prev => [...prev, {
          id: `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
          provider: result.metadata?.provider || executionConfig.provider,
          model: result.metadata?.model || executionConfig.model,
          compiledPrompt: compiledPromptForError,
          error: result.content,
          success: false,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          duration: result.metadata?.duration || 0,
          context: activeTab.name || 'preview'
        }])

        // Record failed execution to IndexedDB
        usageTracker.recordExecution({
          provider: result.metadata?.provider || executionConfig.provider,
          model: result.metadata?.model || executionConfig.model,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          duration: result.metadata?.duration || 0,
          success: false,
          error: result.content,
          executionMode: result.metadata?.executionMode || 'local',
          context: activeTab.name || 'preview'
        }).catch(err => {
          console.warn('[App.tsx] Failed to record failed execution to IndexedDB:', err)
        })

        // Show bottom panel with Prompds tab, expand if minimized
        setShowBottomPanel(true)
        setActiveBottomTab('prompds')
        setBottomPanelMinimized(false)
        setIsExecutingPreview(false)
      }
    } catch (error) {
      console.error('Unexpected execution error:', error)
      aiShowNotification(
        `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      )
      setIsExecutingPreview(false)
    }
  }, [getActiveTab, llmProvider.provider, llmProvider.model, llmProvider.maxTokens, llmProvider.temperature, llmProvider.generationMode, explorerDirPath, selectedEnvFile, setShowBottomPanel, setActiveBottomTab, setBottomPanelMinimized, openBottomPanelMinimized, aiShowNotification, setPrompdSessionHistory, getToken, readFileFromWorkspace])

  // Handle viewing execution in modal
  const handleViewExecution = useCallback((index: number) => {
    setSelectedExecutionIndex(index)
    setShowExecutionModal(true)
  }, [])

  // Update ref when active tab changes or handleExecutePrompd changes
  // Must include activeTabId to re-run when switching tabs or opening files
  useEffect(() => {
    const activeTab = getActiveTab()
    if (activeTab?.name.endsWith('.prmd') && activeTab.type !== 'execution') {
      executePrompdRef.current = handleExecutePrompd
    } else {
      executePrompdRef.current = null
    }
  }, [getActiveTab, handleExecutePrompd, activeTabId])

  const save = useCallback(async () => {
    try {
      const active = getActiveTab()
      const nameWithoutReadonly = active?.name?.replace(/\s*\(readonly\)\s*$/i, '') || 'untitled.prmd'
      const cleanName = cleanFilename(nameWithoutReadonly)
      const electronAPI = (window as any).electronAPI

      if (active?.readOnly || !active?.handle || typeof active.handle.createWritable !== 'function') {
        // In Electron, use native save dialog
        if (electronAPI?.isElectron && electronAPI?.saveFile && electronAPI?.writeFile) {
          const defaultPath = explorerDirPath ? `${explorerDirPath}/${cleanName}` : cleanName
          const filePath = await electronAPI.saveFile(defaultPath)
          if (!filePath) return // User cancelled

          const result = await electronAPI.writeFile(filePath, text)
          if (!result.success) {
            console.error('Save failed:', result.error)
            return
          }

          const fileName = filePath.split(/[/\\]/).pop() || cleanName
          console.log('File saved:', fileName, 'Size:', text.length, 'bytes')

          if (activeTabId) {
            // Create a handle-like object for Electron files
            const electronHandle = {
              name: fileName,
              kind: 'file' as const,
              isSameEntry: async () => false,
              getFile: async () => {
                const readResult = await electronAPI.readFile(filePath)
                return new File([readResult.content || ''], fileName)
              },
              createWritable: async () => ({
                write: async (content: string) => {
                  await electronAPI.writeFile(filePath, content)
                },
                close: async () => {}
              })
            }

            updateTab(activeTabId, {
              name: fileName,
              handle: electronHandle as any,
              dirty: false,
              text,
              savedText: text,
              readOnly: false,
              packageSource: undefined
            })
            // Notify editor to reset change tracking baseline
            window.dispatchEvent(new CustomEvent('prompd-file-saved'))
          }
        } else if ((window as any).showSaveFilePicker) {
          // Browser: use File System Access API
          // Note: Don't use startIn with directory handles as they may not be compatible
          const options: any = { suggestedName: cleanName }

          const handle = await (window as any).showSaveFilePicker(options)
          const writable = await handle.createWritable()
          await writable.write(text)
          await writable.close()

          const file = await handle.getFile()
          const savedText = await file.text()

          if (savedText === text) {
            console.log('File saved and verified:', handle.name, 'Size:', savedText.length, 'bytes')
          } else {
            console.warn('File saved but verification mismatch')
          }

          if (activeTabId) {
            updateTab(activeTabId, {
              name: handle.name,
              handle,
              dirty: false,
              text,
              savedText: text,
              readOnly: false,
              packageSource: undefined
            })
            // Notify editor to reset change tracking baseline
            window.dispatchEvent(new CustomEvent('prompd-file-saved'))
          }
        } else {
          // Fallback: download
          const blob = new Blob([text], { type: 'text/plain' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = cleanName
          a.click()
          URL.revokeObjectURL(url)
        }
      } else {
        // File already has a handle - save directly
        const writable = await active.handle.createWritable()
        await writable.write(text)
        await writable.close()

        const file = await active.handle.getFile()
        const savedText = await file.text()

        if (savedText === text) {
          console.log('File saved and verified:', active.name, 'Size:', savedText.length, 'bytes')
        } else {
          console.warn('File saved but verification mismatch')
        }

        if (activeTabId) {
          updateTab(activeTabId, { dirty: false, text, savedText: text })
          // Notify editor to reset change tracking baseline
          window.dispatchEvent(new CustomEvent('prompd-file-saved'))
        }
      }
    } catch (err) {
      if (err && (err as any).name !== 'AbortError') {
        console.error('Save failed:', err)
      }
    }
  }, [explorerDirPath, getActiveTab, text, activeTabId, updateTab])

  // Update saveRef when save function changes (for use in handleExecutePrompd and auto-save)
  useEffect(() => {
    saveRef.current = save
  }, [save])

  // Listen for Monaco-forwarded save event (Ctrl+S from within editor)
  useEffect(() => {
    const handleSaveEvent = () => save()
    window.addEventListener('prompd-save', handleSaveEvent)
    return () => window.removeEventListener('prompd-save', handleSaveEvent)
  }, [save])

  // Listen for Monaco context menu "Open Chat" event
  useEffect(() => {
    const handleOpenChat = () => {
      if (activeTabId) {
        updateTab(activeTabId, { showChat: true, showPreview: false })
      }
    }
    window.addEventListener('prompd-open-chat', handleOpenChat)
    return () => window.removeEventListener('prompd-open-chat', handleOpenChat)
  }, [activeTabId, updateTab])

  // Track .prmd tabs that have chat open — these get persistent SplitEditor instances
  // so chat state survives tab switches. Clean up closed tabs.
  useEffect(() => {
    const tabIds = new Set(tabs.map(t => t.id))
    // Add any tab that currently has chat open
    for (const t of tabs) {
      if (t.showChat && t.name?.toLowerCase().endsWith('.prmd')) {
        chatMountedTabsRef.current.add(t.id)
      }
    }
    // Remove tabs that no longer exist
    for (const id of chatMountedTabsRef.current) {
      if (!tabIds.has(id)) {
        chatMountedTabsRef.current.delete(id)
      }
    }
  }, [tabs])

  // Listen for settings open events (from news items, etc.)
  useEffect(() => {
    const handleOpenSettings = (e: Event) => {
      const detail = (e as CustomEvent).detail
      const tab = detail?.tab || 'api-keys'
      openSettingsModal(tab as 'profile' | 'api-keys' | 'usage' | 'shortcuts')
    }
    window.addEventListener('prompd:openSettings', handleOpenSettings)
    return () => window.removeEventListener('prompd:openSettings', handleOpenSettings)
  }, [openSettingsModal])

  // Listen for package open events (from IntelliSense hover links)
  useEffect(() => {
    const handleOpenPackage = async (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (!detail?.name) return

      try {
        console.log('[App] Opening package from hover:', detail.name, detail.version)
        const packageInfo = await registryApi.getPackageInfo(detail.name)
        if (packageInfo) {
          setSelectedRegistryPackage(packageInfo)
        } else {
          console.warn('[App] Package not found:', detail.name)
        }
      } catch (error) {
        console.error('[App] Failed to load package:', error)
      }
    }

    window.addEventListener('prompd-open-package', handleOpenPackage)
    return () => window.removeEventListener('prompd-open-package', handleOpenPackage)
  }, [])

  // Listen for file renames from code actions and tool executor
  useEffect(() => {
    const handleFileRenamed = (e: Event) => {
      const { oldPath, newPath } = (e as CustomEvent).detail as { oldPath: string; newPath: string }
      if (!oldPath || !newPath) return
      console.log('[App] File renamed:', oldPath, '->', newPath)

      // Extract filenames for tab matching (tabs use relative paths)
      const oldName = oldPath.replace(/\\/g, '/').split('/').pop() || oldPath
      const newName = newPath.replace(/\\/g, '/').split('/').pop() || newPath

      // Build pseudo-handle so the tab can save to the new path
      const electronAPI = (window as unknown as Record<string, unknown>).electronAPI as {
        readFile: (p: string) => Promise<{ content?: string }>
        writeFile: (p: string, c: string) => Promise<void>
      } | undefined
      const pseudoHandle = electronAPI ? {
        kind: 'file' as const,
        name: newName,
        _electronPath: newPath,
        getFile: async () => ({
          name: newName,
          text: async () => {
            const r = await electronAPI.readFile(newPath)
            return r.content || ''
          }
        }),
        createWritable: async () => ({
          write: async (content: string) => { await electronAPI.writeFile(newPath, content) },
          close: async () => {}
        })
      } : undefined

      tabManager.handleFileRenamed(oldName, newName, newPath, pseudoHandle as unknown as FileSystemFileHandle)
    }

    window.addEventListener('prompd-file-renamed', handleFileRenamed)
    return () => window.removeEventListener('prompd-file-renamed', handleFileRenamed)
  }, [tabManager])

  // Save As - always shows file picker
  const saveAs = useCallback(async (tabId?: string) => {
    try {
      const targetTab = tabId ? tabs.find(t => t.id === tabId) : getActiveTab()
      if (!targetTab) return

      // Chat and execution tabs cannot be saved
      if (targetTab.type === 'chat' || targetTab.type === 'execution' || targetTab.type === 'brainstorm') {
        console.log('[App.tsx] Skipping Save As for non-saveable tab type:', targetTab.type)
        return
      }

      const tabText = targetTab.text
      const nameWithoutReadonly = targetTab.name?.replace(/\s*\(readonly\)\s*$/i, '') || 'untitled.prmd'
      const cleanName = cleanFilename(nameWithoutReadonly)
      const electronAPI = (window as any).electronAPI

      // In Electron, use native save dialog
      if (electronAPI?.isElectron && electronAPI?.saveFile && electronAPI?.writeFile) {
        const defaultPath = explorerDirPath ? `${explorerDirPath}/${cleanName}` : cleanName
        const filePath = await electronAPI.saveFile(defaultPath)
        if (!filePath) return // User cancelled

        const result = await electronAPI.writeFile(filePath, tabText)
        if (!result.success) {
          console.error('Save As failed:', result.error)
          return
        }

        const fileName = filePath.split(/[/\\]/).pop() || cleanName
        console.log('File saved as:', fileName, 'Size:', tabText.length, 'bytes')

        // Create a handle-like object for Electron files
        const electronHandle = {
          name: fileName,
          kind: 'file' as const,
          isSameEntry: async () => false,
          getFile: async () => {
            const readResult = await electronAPI.readFile(filePath)
            return new File([readResult.content || ''], fileName)
          },
          createWritable: async () => ({
            write: async (content: string) => {
              await electronAPI.writeFile(filePath, content)
            },
            close: async () => {}
          })
        }

        updateTab(targetTab.id, {
          name: fileName,
          handle: electronHandle as any,
          dirty: false,
          text: tabText,
          savedText: tabText,
          readOnly: false,
          packageSource: undefined
        })

        // If this was the active tab, update the editor text
        if (targetTab.id === activeTabId) {
          setText(tabText)
        }
      } else if ((window as any).showSaveFilePicker) {
        // Browser: use File System Access API
        // Note: Don't use startIn with directory handles as they may not be compatible
        const options: any = { suggestedName: cleanName }

        const handle = await (window as any).showSaveFilePicker(options)
        const writable = await handle.createWritable()
        await writable.write(tabText)
        await writable.close()

        const file = await handle.getFile()
        const savedText = await file.text()

        if (savedText === tabText) {
          console.log('File saved as and verified:', handle.name, 'Size:', savedText.length, 'bytes')
        } else {
          console.warn('File saved but verification mismatch')
        }

        updateTab(targetTab.id, {
          name: handle.name,
          handle,
          dirty: false,
          text: tabText,
          savedText: tabText,
          readOnly: false,
          packageSource: undefined
        })

        // If this was the active tab, update the editor text
        if (targetTab.id === activeTabId) {
          setText(tabText)
        }
      } else {
        // Fallback: download
        const blob = new Blob([tabText], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = cleanName
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      if (err && (err as any).name !== 'AbortError') {
        console.error('Save As failed:', err)
      }
    }
  }, [tabs, getActiveTab, explorerDirPath, updateTab, activeTabId, setText])

  // Save handler that works with tab IDs (for context menu)
  const saveTabById = useCallback(async (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId)
    if (!tab) return

    // Chat and execution tabs cannot be saved
    if (tab.type === 'chat' || tab.type === 'execution' || tab.type === 'brainstorm') {
      console.log('[App.tsx] Skipping save for non-saveable tab type:', tab.type)
      return
    }

    // If tab is read-only or has no handle, use Save As
    if (tab.readOnly || !tab.handle || typeof tab.handle.createWritable !== 'function') {
      await saveAs(tabId)
      return
    }

    try {
      const writable = await tab.handle.createWritable()
      await writable.write(tab.text)
      await writable.close()

      const file = await tab.handle.getFile()
      const savedText = await file.text()

      if (savedText === tab.text) {
        console.log('✓ File saved and verified:', tab.name, 'Size:', savedText.length, 'bytes')
      } else {
        console.warn('⚠ File saved but verification mismatch')
      }

      updateTab(tabId, { dirty: false, text: tab.text, savedText: tab.text })
    } catch (err) {
      if (err && (err as any).name !== 'AbortError') {
        console.error('❌ Save failed:', err)
      }
    }
  }, [tabs, saveAs, updateTab])

  // Close workspace and clear all tabs
  const closeWorkspace = useCallback(() => {
    const electronAPI = (window as any).electronAPI

    // Save workspace state before closing
    if (explorerDirPath) {
      saveWorkspaceState(explorerDirPath)
    }

    // Close all file tabs (keep chat tabs if any)
    const fileTabs = tabs.filter(t => t.type === 'file' || t.type === undefined)
    for (const tab of fileTabs) {
      removeTab(tab.id)
    }

    // Clear workspace
    setExplorerDirHandle(null)
    setExplorerDirPath(null)
    setExplorerEntries([])

    // Update menu state
    electronAPI?.updateMenuState?.({ hasWorkspace: false })

    console.log('[App] Workspace closed')
  }, [explorerDirPath, saveWorkspaceState, tabs, removeTab, setExplorerDirHandle, setExplorerDirPath, setExplorerEntries])

  // Open a directory as workspace (shared by close-workspace flow and new project)
  const openProjectAsWorkspace = useCallback((projectPath: string) => {
    const pseudoHandle = {
      kind: 'directory',
      name: projectPath.replace(/\\/g, '/').split('/').pop() || 'project',
      _electronPath: projectPath
    }
    setExplorerDirHandle(pseudoHandle as unknown as FileSystemDirectoryHandle)
    setExplorerDirPath(projectPath)
    window.electronAPI?.setWorkspacePath?.(projectPath)
    window.electronAPI?.updateMenuState?.({ hasWorkspace: true })
    // Load persisted connections for this workspace
    useWorkflowStore.getState().loadConnections()
  }, [setExplorerDirHandle, setExplorerDirPath])

  // After close-workspace completes, open pending project if any
  const openPendingProjectIfAny = useCallback(() => {
    const pending = pendingProjectPathRef.current
    if (pending) {
      pendingProjectPathRef.current = null
      openProjectAsWorkspace(pending)
    }
  }, [openProjectAsWorkspace])

  // Handle save all and close for CloseWorkspaceDialog
  const handleSaveAllAndClose = useCallback(async () => {
    const dirtyTabs = tabs.filter(t => t.dirty && t.type !== 'chat' && t.type !== 'execution' && t.type !== 'brainstorm')

    console.log('[App] Saving', dirtyTabs.length, 'dirty tabs before closing workspace')

    for (const tab of dirtyTabs) {
      try {
        await saveTabById(tab.id)
      } catch (error) {
        console.error('[App] Failed to save tab:', tab.name, error)
        // Continue trying to save other tabs
      }
    }

    setShowCloseWorkspaceDialog(false)
    closeWorkspace()
    openPendingProjectIfAny()
  }, [tabs, saveTabById, closeWorkspace, openPendingProjectIfAny])

  // Handle discard all and close for CloseWorkspaceDialog
  const handleDiscardAndClose = useCallback(() => {
    setShowCloseWorkspaceDialog(false)
    closeWorkspace()
    openPendingProjectIfAny()
  }, [closeWorkspace, openPendingProjectIfAny])

  // File change detection - check if open files have been modified externally
  const checkForModifiedFiles = useCallback(async () => {
    const modified: Array<{ tabId: string; name: string; newContent: string }> = []

    for (const tab of tabs) {
      // Skip non-file tabs and tabs without handles
      if (!tab.handle || tab.type === 'chat' || tab.type === 'execution' || tab.type === 'brainstorm' || tab.packageSource) {
        continue
      }

      try {
        // Read current file content from disk
        const file = await tab.handle.getFile()
        const currentContent = await file.text()

        // Compare with saved content in tab (use savedText if available, otherwise text)
        const savedContent = tab.savedText ?? tab.text
        if (currentContent !== savedContent) {
          modified.push({
            tabId: tab.id,
            name: tab.name,
            newContent: currentContent
          })
        }
      } catch (error) {
        console.warn(`[App] Failed to check file ${tab.name} for changes:`, error)
      }
    }

    if (modified.length > 0) {
      console.log(`[App] Detected ${modified.length} modified files:`, modified.map(f => f.name))
      setModifiedFiles(modified)
      openModal('fileChanges')
    }
  }, [tabs, openModal])

  // Reload all modified files
  const handleReloadAllFiles = useCallback(() => {
    console.log('[App] Reloading all modified files:', modifiedFiles.length)

    for (const file of modifiedFiles) {
      tabManager.refreshTab(file.tabId, file.newContent)
    }

    setModifiedFiles([])
    closeModal()
  }, [modifiedFiles, tabManager, closeModal])

  // Reload a single modified file
  const handleReloadSingleFile = useCallback((tabId: string) => {
    const file = modifiedFiles.find(f => f.tabId === tabId)
    if (!file) return

    console.log('[App] Reloading file:', file.name)
    tabManager.refreshTab(file.tabId, file.newContent)

    // Remove this file from the list
    const remaining = modifiedFiles.filter(f => f.tabId !== tabId)
    setModifiedFiles(remaining)

    // If no more modified files, close the modal
    if (remaining.length === 0) {
      closeModal()
    }
  }, [modifiedFiles, tabManager, closeModal])

  // Keep current versions and dismiss modal
  const handleKeepCurrentVersions = useCallback(() => {
    console.log('[App] Keeping current editor versions for', modifiedFiles.length, 'files')
    setModifiedFiles([])
    closeModal()
  }, [modifiedFiles, closeModal])

  // Close file changes modal
  const handleCloseFileChangesModal = useCallback(() => {
    setModifiedFiles([])
    closeModal()
  }, [closeModal])

  // Handle Electron menu events
  useEffect(() => {
    const electronAPI = (window as any).electronAPI
    if (!electronAPI) return

    // Collect cleanup functions
    const cleanups: (() => void)[] = []

    // === Prompd Menu ===
    // Menu: API Keys (Ctrl+,)
    const unsubApiKeys = electronAPI.onMenuApiKeys?.(() => {
      console.log('[App.tsx] Menu API Keys')
      openSettingsModal('api-keys')
    })
    if (unsubApiKeys) cleanups.push(unsubApiKeys)

    // Menu: Settings
    const unsubSettings = electronAPI.onMenuSettings?.(() => {
      console.log('[App.tsx] Menu Settings')
      openSettingsModal('profile')
    })
    if (unsubSettings) cleanups.push(unsubSettings)

    // Menu: Scheduler - Manage Schedules
    const unsubSchedulerSettings = electronAPI.onMenuSchedulerSettings?.(() => {
      console.log('[App.tsx] Menu Scheduler Settings')
      openModal('settings')
      // Switch to schedules tab after a brief delay to ensure modal is open
      setTimeout(() => {
        const settingsModal = document.querySelector('[data-settings-modal]')
        if (settingsModal) {
          const schedulesButton = settingsModal.querySelector('[data-tab="schedules"]') as HTMLButtonElement
          schedulesButton?.click()
        }
      }, 100)
    })
    if (unsubSchedulerSettings) cleanups.push(unsubSchedulerSettings)

    // Menu: Scheduler - Service Settings
    const unsubSchedulerService = electronAPI.onMenuSchedulerService?.(() => {
      console.log('[App.tsx] Menu Scheduler Service')
      openModal('settings')
      // Switch to service tab after a brief delay to ensure modal is open
      setTimeout(() => {
        const settingsModal = document.querySelector('[data-settings-modal]')
        if (settingsModal) {
          const serviceButton = settingsModal.querySelector('[data-tab="service"]') as HTMLButtonElement
          serviceButton?.click()
        }
      }, 100)
    })
    if (unsubSchedulerService) cleanups.push(unsubSchedulerService)

    // Menu: About
    const unsubAbout = electronAPI.onMenuAbout?.(() => {
      console.log('[App.tsx] Menu About')
      openModal('about')
    })
    if (unsubAbout) cleanups.push(unsubAbout)

    // === Project Menu ===
    // Menu: New File (Ctrl+N)
    const unsubNewFile = electronAPI.onMenuNewFile?.(() => {
      console.log('[App.tsx] Menu new file')
      setShowNewFileDialog(true)
    })
    if (unsubNewFile) cleanups.push(unsubNewFile)

    // Menu: New Project
    const unsubNewProject = electronAPI.onMenuNewProject?.(() => {
      console.log('[App.tsx] Menu new project')
      openModal('newProject')
    })
    if (unsubNewProject) cleanups.push(unsubNewProject)

    // Menu: Save (Ctrl+S)
    const unsubSave = electronAPI.onMenuSave?.(() => {
      console.log('[App.tsx] Menu save')
      if (activeTabId) {
        saveTabById(activeTabId)
      }
    })
    if (unsubSave) cleanups.push(unsubSave)

    // Menu: Save As (Ctrl+Shift+S)
    const unsubSaveAs = electronAPI.onMenuSaveAs?.(() => {
      console.log('[App.tsx] Menu save as')
      if (activeTabId) {
        saveAs(activeTabId)
      }
    })
    if (unsubSaveAs) cleanups.push(unsubSaveAs)

    // Menu: Save Project
    const unsubSaveProject = electronAPI.onMenuSaveProject?.(() => {
      console.log('[App.tsx] Menu save project')
      handleSaveToStorage()
    })
    if (unsubSaveProject) cleanups.push(unsubSaveProject)

    // Menu: Manage Projects
    const unsubManageProjects = electronAPI.onMenuManageProjects?.(() => {
      console.log('[App.tsx] Menu manage projects')
      openModal('localStorage')
    })
    if (unsubManageProjects) cleanups.push(unsubManageProjects)

    // Menu: Open Project (opens saved projects dialog)
    const unsubOpenProject = electronAPI.onMenuOpenProject?.(() => {
      console.log('[App.tsx] Menu open project')
      openModal('localStorage')
    })
    if (unsubOpenProject) cleanups.push(unsubOpenProject)

    // Menu: Open Folder (Ctrl+Shift+O)
    const unsubOpenFolder = electronAPI.onMenuOpenFolder?.(async (folderPath: string) => {
      console.log('[App.tsx] Menu open folder:', folderPath)
      const pseudoHandle = {
        kind: 'directory',
        name: folderPath.split(/[/\\]/).pop() || 'folder',
        _electronPath: folderPath
      }
      setExplorerDirHandle(pseudoHandle as any)
      electronAPI.setWorkspacePath?.(folderPath)
      // Load persisted connections for this workspace
      useWorkflowStore.getState().loadConnections()
    })
    if (unsubOpenFolder) cleanups.push(unsubOpenFolder)

    // Menu: Close Folder
    const unsubCloseFolder = electronAPI.onMenuCloseFolder?.(() => {
      console.log('[App.tsx] Menu close folder')
      // Check for unsaved files
      const dirtyTabs = tabs.filter(t => t.dirty && t.type !== 'chat' && t.type !== 'execution' && t.type !== 'brainstorm')
      if (dirtyTabs.length > 0) {
        // Show confirmation dialog
        setShowCloseWorkspaceDialog(true)
      } else {
        // No unsaved files, close immediately
        closeWorkspace()
      }
    })
    if (unsubCloseFolder) cleanups.push(unsubCloseFolder)

    // Menu: Close Tab (Ctrl+W)
    const unsubCloseTab = electronAPI.onMenuCloseTab?.(() => {
      console.log('[App.tsx] Menu close tab')
      if (activeTabId) {
        closeTab(activeTabId)
      }
    })
    if (unsubCloseTab) cleanups.push(unsubCloseTab)

    // Menu: Close All Tabs (Ctrl+Shift+W)
    const unsubCloseAllTabs = electronAPI.onMenuCloseAllTabs?.(() => {
      console.log('[App.tsx] Menu close all tabs')
      closeAllTabs()
    })
    if (unsubCloseAllTabs) cleanups.push(unsubCloseAllTabs)

    // === Package Menu ===
    // Menu: Create Package (Ctrl+Shift+B)
    const unsubPackageCreate = electronAPI.onMenuPackageCreate?.(() => {
      console.log('[App.tsx] Menu package create (Ctrl+Shift+B)')
      handleBuildPackage()
    })
    if (unsubPackageCreate) cleanups.push(unsubPackageCreate)

    // Menu: Publish Package
    const unsubPackagePublish = electronAPI.onMenuPackagePublish?.(() => {
      console.log('[App.tsx] Menu package publish')
      if (!explorerDirHandle) {
        addToast('No project folder is open. Please open a folder first to publish a package.', 'warning')
        return
      }
      openModal('publish')
    })
    if (unsubPackagePublish) cleanups.push(unsubPackagePublish)

    // Menu: Deploy Workflow (current workflow)
    const unsubPackageDeploy = electronAPI.onMenuPackageDeploy?.(() => {
      console.log('[App.tsx] Menu package deploy')
      openModal('deploy-workflow')
    })
    if (unsubPackageDeploy) cleanups.push(unsubPackageDeploy)

    // Menu: Manage Deployments (view all)
    const unsubDeploymentManage = electronAPI.onMenuDeploymentManage?.(() => {
      console.log('[App.tsx] Menu deployment manage')
      openModal('deployment')
    })
    if (unsubDeploymentManage) cleanups.push(unsubDeploymentManage)

    // Menu: Install Package → command palette with /install pre-filled
    const unsubPackageInstall = electronAPI.onMenuPackageInstall?.(() => {
      setCommandPaletteInitialQuery('/install ')
      setShowCommandPalette(true)
    })
    if (unsubPackageInstall) cleanups.push(unsubPackageInstall)

    // === Run Menu ===
    // Menu: Execute Prompt (F5)
    const unsubRunExecute = electronAPI.onMenuRunExecute?.(() => {
      console.log('[App.tsx] Menu run execute')
      if (executePrompdRef.current) {
        executePrompdRef.current()
      } else {
        addToast('Please open a .prmd file to execute', 'warning')
      }
    })
    if (unsubRunExecute) cleanups.push(unsubRunExecute)

    // Menu: Stop Execution (Shift+F5)
    const unsubRunStop = electronAPI.onMenuRunStop?.(() => {
      console.log('[App.tsx] Menu run stop')
      if (stopExecutionRef.current) {
        stopExecutionRef.current()
        electronAPI.updateMenuState?.({ isExecutionActive: false })
      } else {
        addToast('No execution to stop', 'info')
      }
    })
    if (unsubRunStop) cleanups.push(unsubRunStop)

    // Menu: Prompd Install - install all dependencies from prompd.json
    const unsubRunInstall = electronAPI.onMenuRunInstall?.(async () => {
      console.log('[App.tsx] Menu run install')
      if (!explorerDirPath) {
        addToast('Please open a workspace folder first', 'warning')
        return
      }

      // Show build panel with installing status
      setBuildOutput({
        status: 'building',
        message: 'Installing dependencies...',
        timestamp: Date.now()
      })
      setShowBottomPanel(true)
      setActiveBottomTab('output')

      try {
        const result = await electronAPI.package.installAll(explorerDirPath)
        console.log('[App.tsx] Install result:', result)

        if (result.success) {
          const count = result.installed?.length || 0
          const installedList = result.installed?.map((p: any) =>
            `${p.name}@${p.version} (${p.status})`
          ).join('\n') || ''

          setBuildOutput({
            status: 'success',
            message: result.message || `Installed ${count} packages`,
            details: installedList || undefined,
            timestamp: Date.now()
          })
          window.dispatchEvent(new Event('prompd:resources-changed'))
        } else {
          // Build structured errors from failed packages
          const errors: { file: string; message: string; line?: number }[] = []

          if (result.failed && result.failed.length > 0) {
            for (const pkg of result.failed) {
              errors.push({
                file: 'prompd.json',
                message: `${pkg.name}@${pkg.version}: ${pkg.error}`
              })
            }
          }

          setBuildOutput({
            status: 'error',
            message: result.message || 'Installation failed',
            details: result.error,
            errors: errors.length > 0 ? errors : undefined,
            timestamp: Date.now()
          })
        }
      } catch (err: any) {
        console.error('[App.tsx] Install failed:', err)
        setBuildOutput({
          status: 'error',
          message: 'Installation failed',
          details: err.message || 'Unknown error',
          timestamp: Date.now()
        })
      }
    })
    if (unsubRunInstall) cleanups.push(unsubRunInstall)

    // === View Menu ===
    // Menu: Toggle Sidebar (Ctrl+B for explorer, Ctrl+Shift+A for AI, Ctrl+Shift+G for git)
    const unsubToggleSidebar = electronAPI.onMenuToggleSidebar?.((panel: string) => {
      console.log('[App.tsx] Menu toggle sidebar:', panel)
      if (activeSide === panel && showSidebar) {
        // If same panel and visible, hide sidebar
        setShowSidebar(false)
      } else {
        // Show sidebar with specified panel
        setActiveSide(panel as 'explorer' | 'packages' | 'ai' | 'git')
        setShowSidebar(true)
      }
    })
    if (unsubToggleSidebar) cleanups.push(unsubToggleSidebar)

    // Menu: Set View Mode (Ctrl+Shift+W for wizard/new prompt, Ctrl+Shift+D for design, Ctrl+Shift+C for code)
    const unsubSetViewMode = electronAPI.onMenuSetViewMode?.((newMode: string) => {
      console.log('[App.tsx] Menu set view mode:', newMode)
      if (newMode === 'wizard') {
        // Wizard view from menu creates a new wizard tab (same as "New Prompt" button)
        handleNewWizard()
      } else if (newMode === 'design' || newMode === 'code') {
        setMode(newMode)
        if (activeTabId) {
          updateTab(activeTabId, { viewMode: newMode })
        }
      }
    })
    if (unsubSetViewMode) cleanups.push(unsubSetViewMode)

    // Menu: Toggle Theme (Ctrl+Shift+T)
    const unsubToggleTheme = electronAPI.onMenuToggleTheme?.(() => {
      console.log('[App.tsx] Menu toggle theme')
      setTheme(theme === 'dark' ? 'light' : 'dark')
    })
    if (unsubToggleTheme) cleanups.push(unsubToggleTheme)

    // Menu: Toggle Output Panel (Ctrl+Shift+M)
    const unsubToggleOutputPanel = electronAPI.onMenuToggleOutputPanel?.(() => {
      console.log('[App.tsx] Menu toggle output panel')
      // Dispatch the toggle event so the BuildOutputPanel can handle the expand state
      window.dispatchEvent(new CustomEvent('toggle-output-panel'))
    })
    if (unsubToggleOutputPanel) cleanups.push(unsubToggleOutputPanel)

    // Menu: Command Palette (Ctrl+Shift+P)
    const unsubCommandPalette = electronAPI.onMenuCommandPalette?.(() => {
      console.log('[App.tsx] Menu command palette')
      setShowCommandPalette(true)
    })
    if (unsubCommandPalette) cleanups.push(unsubCommandPalette)

    // Workflow: Handle scheduled/deployed workflow execution requests
    const unsubWorkflowExecute = electronAPI.workflow?.onExecuteRequest?.(async (data: { workflowPath: string; parameters?: Record<string, unknown>; trigger?: string; scheduleId?: string }) => {
      console.log('[App.tsx] Scheduled workflow execution requested:', data)
      const startTime = Date.now()

      try {
        // Load workflow file
        console.log('[App.tsx] Reading workflow file:', data.workflowPath)
        const workflowContent = await electronAPI.readFile(data.workflowPath)
        if (!workflowContent.success) {
          throw new Error(workflowContent.error || 'Failed to read workflow file')
        }

        // Parse workflow
        console.log('[App.tsx] Parsing workflow...')
        const workflow = parseWorkflow(workflowContent.content)
        if (!workflow) {
          throw new Error('Failed to parse workflow')
        }
        console.log('[App.tsx] Workflow parsed successfully, executing...')

        // Execute workflow (returns executionId immediately)
        // Pass workflowFilePath so prompt node source paths resolve relative to the deployed workflow
        const executeResult = await electronAPI.workflow?.execute(workflow, data.parameters || {}, {
          executionMode: 'automated',
          workflowFilePath: data.workflowPath
        })

        if (!executeResult) {
          throw new Error('Workflow execution failed to start')
        }

        console.log('[App.tsx] Workflow execution started:', executeResult.executionId)

        // Listen for workflow completion events
        const cleanup = electronAPI.workflow?.onEvent?.((event: any) => {
          if (event.executionId !== executeResult.executionId) return

          if (event.type === 'complete') {
            console.log('[App.tsx] Workflow execution completed, sending result...')

            electronAPI.workflow?.sendExecutionResult({
              success: true,
              status: 'success',
              result: event.data,
              duration: Date.now() - startTime
            })

            console.log('[App.tsx] Execution result sent successfully')
            if (cleanup) cleanup()
          } else if (event.type === 'error') {
            console.error('[App.tsx] Workflow execution error:', event.data)

            electronAPI.workflow?.sendExecutionResult({
              success: false,
              status: 'error',
              error: event.data?.message || 'Workflow execution failed',
              duration: Date.now() - startTime
            })

            if (cleanup) cleanup()
          }
        })
      } catch (error) {
        console.error('[App.tsx] Scheduled workflow execution failed:', error)
        // Send error result
        electronAPI.workflow?.sendExecutionResult({
          success: false,
          status: 'error',
          error: (error as Error).message,
          duration: Date.now() - startTime
        })
      }
    })
    if (unsubWorkflowExecute) cleanups.push(unsubWorkflowExecute)

    // Cleanup on unmount or dependency change
    return () => {
      cleanups.forEach(cleanup => cleanup())
    }
  }, [addTab, activeTabId, saveTabById, saveAs, setExplorerDirHandle, setExplorerDirPath, setExplorerEntries, openModal, handleSaveToStorage, explorerDirHandle, setActiveSide, setShowSidebar, activeSide, showSidebar, setMode, updateTab, setTheme, theme, handleNewWizard, handleBuildPackage, closeTab, closeAllTabs])

  // Handle power events (sleep/wake) to prevent unwanted reloads
  useEffect(() => {
    const electronAPI = (window as any).electronAPI
    if (!electronAPI) return

    let isSuspended = false

    // Block beforeunload during suspend to prevent reload prompts
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isSuspended) {
        e.preventDefault()
        e.returnValue = ''
        return ''
      }
    }

    const unsubSuspend = electronAPI.onPowerSuspend?.(() => {
      console.log('[App.tsx] System suspending - blocking reloads')
      isSuspended = true
      window.addEventListener('beforeunload', handleBeforeUnload)
    })

    const unsubResume = electronAPI.onPowerResume?.(() => {
      console.log('[App.tsx] System resumed')
      // Delay removing the block to allow HMR to stabilize
      setTimeout(() => {
        isSuspended = false
        window.removeEventListener('beforeunload', handleBeforeUnload)
      }, 5000)
    })

    const unsubLock = electronAPI.onPowerLock?.(() => {
      console.log('[App.tsx] Screen locked')
      isSuspended = true
      window.addEventListener('beforeunload', handleBeforeUnload)
    })

    const unsubUnlock = electronAPI.onPowerUnlock?.(() => {
      console.log('[App.tsx] Screen unlocked')
      setTimeout(() => {
        isSuspended = false
        window.removeEventListener('beforeunload', handleBeforeUnload)
      }, 5000)
    })

    return () => {
      unsubSuspend?.()
      unsubResume?.()
      unsubLock?.()
      unsubUnlock?.()
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

  // Auto-update notifications via toasts
  useEffect(() => {
    const api = window.electronAPI
    if (!api?.isElectron) return

    const cleanups: (() => void)[] = []

    cleanups.push(api.onUpdateAvailable((info) => {
      addToast(`Version ${info.version} is available and downloading...`, 'update', 10000)
    }))

    cleanups.push(api.onUpdateDownloaded((info) => {
      addToast(`Version ${info.version} is ready to install`, 'update', 0, {
        label: 'Restart & Update',
        onClick: () => api.installUpdate(),
      })
    }))

    return () => cleanups.forEach(fn => fn())
  }, [addToast])


  // Add file to content reference field
  const addToContentField = useCallback((filePath: string, field: 'system' | 'assistant' | 'context' | 'user' | 'response', currentFilePath?: string) => {
    let pathToInsert = filePath
    if (currentFilePath) {
      const from = currentFilePath.split('/').slice(0, -1)
      const to = filePath.split('/')
      let i = 0
      while (i < from.length && i < to.length && from[i] === to[i]) i++
      const upLevels = from.length - i
      const downPath = to.slice(i)
      const relativeParts = [...Array(upLevels).fill('..'), ...downPath]
      pathToInsert = relativeParts.length > 0 ? relativeParts.join('/') : './'
    }

    const lines = text.split('\n')
    let inFrontmatter = false
    let frontmatterEnd = -1
    let fieldLineIndex = -1

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        if (!inFrontmatter) {
          inFrontmatter = true
        } else {
          frontmatterEnd = i
          break
        }
      } else if (inFrontmatter && lines[i].trim().startsWith(`${field}:`)) {
        fieldLineIndex = i
      }
    }

    if (frontmatterEnd === -1) return

    if (fieldLineIndex >= 0) {
      let insertIndex = fieldLineIndex + 1
      while (insertIndex < frontmatterEnd && lines[insertIndex].trim().startsWith('-')) {
        insertIndex++
      }
      lines.splice(insertIndex, 0, `  - "${pathToInsert}"`)
    } else {
      lines.splice(frontmatterEnd, 0, `${field}:\n  - "${pathToInsert}"`)
    }

    setText(lines.join('\n'))
    console.log(`✓ Added to ${field}:`, pathToInsert)
  }, [text, setText])

  // Register hotkey handlers with hotkeyManager
  useEffect(() => {
    hotkeyManager.registerHandler('save', save)
    return () => hotkeyManager.unregisterHandler('save')
  }, [save])

  // Command palette hotkey handler
  const openCommandPalette = useCallback(() => {
    setShowCommandPalette(true)
  }, [])

  useEffect(() => {
    hotkeyManager.registerHandler('commandPalette', openCommandPalette)

    // Also listen for the custom event from Monaco DOM interceptor
    const handleToggleCommandPalette = () => {
      console.log('[App.tsx] toggle-command-palette event received')
      setShowCommandPalette(prev => !prev)
    }
    window.addEventListener('toggle-command-palette', handleToggleCommandPalette)

    return () => {
      hotkeyManager.unregisterHandler('commandPalette')
      window.removeEventListener('toggle-command-palette', handleToggleCommandPalette)
    }
  }, [openCommandPalette])

  // Sidebar resize
  const beginResize = (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const start = sidebarWidth
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX
      const next = Math.max(160, Math.min(640, start + dx))
      setSidebarWidth(next)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
  }

  const hasOpenTab = tabs.length > 0 && !!activeTabId
  const gridColumns = showSidebar ? `48px ${sidebarWidth}px minmax(0,1fr)` : `48px minmax(0,1fr)`

  // Drag and drop handler for opening files from file system
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only show overlay if dragging files
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingFiles(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only hide overlay if leaving the root element
    if (e.currentTarget === e.target) {
      setIsDraggingFiles(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Indicate this is a valid drop zone
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingFiles(false)

    const files = Array.from(e.dataTransfer.files)

    // Filter for text-openable file types
    const textExtensions = [
      '.prmd', '.pdflow', '.prompdflow',
      '.json', '.yaml', '.yml', '.md', '.txt',
      '.js', '.ts', '.jsx', '.tsx', '.css', '.html',
      '.env', '.toml', '.ini', '.cfg', '.conf',
      '.sh', '.bat', '.ps1', '.py', '.rb', '.go',
      '.xml', '.csv', '.log', '.gitignore'
    ]
    const openableFiles = files.filter(file => {
      const name = file.name.toLowerCase()
      return textExtensions.some(ext => name.endsWith(ext))
        || name === 'prompd.json'
        || name.startsWith('.')  // dotfiles
    })

    if (openableFiles.length === 0) {
      console.log('[App] No supported files in drop:', files.map(f => f.name))
      return
    }

    // In Electron, get the file path and use openFileFromPath
    if (window.electronAPI?.isElectron && window.electronAPI) {
      // Electron provides file paths via dataTransfer.files[i].path
      for (const file of openableFiles) {
        const filePath = (file as any).path
        if (filePath) {
          console.log('[App] Opening dropped file (Electron):', filePath)
          // Access openFileFromPath from the useEffect scope
          const result = await window.electronAPI.readFile(filePath)
          if (result.success && result.content) {
            const fileName = filePath.split(/[/\\]/).pop() || 'untitled.prmd'
            const api = window.electronAPI
            const pseudoHandle = {
              kind: 'file',
              name: fileName,
              _electronPath: filePath,
              getFile: async () => ({
                name: fileName,
                text: async () => result.content || ''
              }),
              createWritable: async () => ({
                write: async (content: string) => {
                  await api.writeFile(filePath, content)
                },
                close: async () => {}
              })
            }
            onOpenFile({
              name: fileName,
              handle: pseudoHandle as any,
              text: result.content,
              readOnly: false,
              electronPath: filePath
            })
          }
        }
      }
    } else {
      // Web mode: read file contents directly
      for (const file of openableFiles) {
        console.log('[App] Opening dropped file (Web):', file.name)
        const text = await file.text()
        onOpenFile({
          name: file.name,
          text: text,
          readOnly: false
        })
      }
    }
  }, [onOpenFile])

  return (
    <div
      className={`layout${showSidebar ? '' : ' no-sidebar'}`}
      style={{ gridTemplateColumns: gridColumns }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag and drop overlay */}
      {isDraggingFiles && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(var(--accent-rgb, 99, 102, 241), 0.1)',
          border: '2px dashed var(--accent)',
          zIndex: 9999,
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            background: 'var(--panel)',
            padding: '24px 32px',
            borderRadius: '12px',
            border: '2px solid var(--accent)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
              Drop files to open
            </div>
            <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
              Supported: .prmd, .pdflow, prompd.json
            </div>
          </div>
        </div>
      )}

      {/* Only load Monaco marker listener when there are tabs open */}
      {tabs.length > 0 && (
        <MonacoMarkerListener
          tabs={tabs}
          onMarkersChange={setMonacoMarkers}
        />
      )}
      <TitleBar theme={theme} />
      <UpdateBanner />
      <EditorHeader
        theme={theme}
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        mode={mode}
        onModeChange={(newMode) => {
          setMode(newMode)
          if (activeTabId) {
            updateTab(activeTabId, { viewMode: newMode })
          }
        }}
        onOpenSettings={() => openSettingsModal('api-keys')}
        isPrompdFile={(() => {
          const tab = getActiveTab()
          if (!tab || tab.type === 'execution') return false
          const name = tab.name.toLowerCase()
          // Only .prmd files are executable - prompd.json is config, not a prompt
          return name.endsWith('.prmd')
        })()}
        isWorkflowFile={(() => {
          const tab = getActiveTab()
          if (!tab || tab.type === 'execution') return false
          const name = tab.name.toLowerCase()
          return name.endsWith('.pdflow') || name.endsWith('.prompdflow')
        })()}
        canSwitchViewMode={(() => {
          const tab = getActiveTab()
          if (!tab) return true // No tab open, allow switching
          // .prmd, .pdflow, and prompd.json files support design/code view toggle
          const name = tab.name.toLowerCase()
          return name.endsWith('.prmd') || name.endsWith('.pdflow') || name === 'prompd.json' || name.endsWith('/prompd.json') || name.endsWith('\\prompd.json')
        })()}
        onExecutePrompd={getActiveTab()?.type === 'brainstorm' ? undefined : handleExecutePrompd}
        onExecuteWorkflow={() => {
          // Dispatch event for WorkflowCanvas to handle
          window.dispatchEvent(new CustomEvent('execute-workflow'))
          // GA4 analytics (anonymous)
          ;(window as any).electronAPI?.analytics?.trackEvent('workflow_execute', { event_category: 'execution' })
        }}
        workspacePath={explorerDirPath}
        showPreview={getActiveTab()?.showPreview || false}
        onTogglePreview={getActiveTab()?.type === 'brainstorm' ? undefined : () => {
          if (activeTabId) {
            const tab = getActiveTab()
            if (tab?.showPreview) {
              updateTab(activeTabId, { showPreview: false })
            } else {
              updateTab(activeTabId, { showPreview: true, showChat: false })
            }
          }
        }}
        showChat={getActiveTab()?.showChat || false}
        onToggleChat={getActiveTab()?.type === 'brainstorm' ? undefined : () => {
          if (activeTabId) {
            const tab = getActiveTab()
            if (tab?.showChat) {
              updateTab(activeTabId, { showChat: false })
            } else {
              updateTab(activeTabId, { showChat: true, showPreview: false })
            }
          }
        }}
      />

      <ActivityBar
        showSidebar={showSidebar}
        active={activeSide}
        onSelect={setActiveSide}
        onToggleSidebar={toggleSidebar}
        onHelpClick={() => setHelpChatOpen(prev => !prev)}
        helpOpen={helpChatOpen}
        helpEnabled={helpChatEnabled}
      />

      <div className="sidebar" style={{ display: showSidebar ? undefined : 'none', position: 'relative' }}>
        <div style={{
          visibility: activeSide === 'explorer' ? 'visible' : 'hidden',
          position: activeSide === 'explorer' ? 'relative' : 'absolute',
          height: '100%',
          width: '100%',
          top: 0,
          left: 0,
          pointerEvents: activeSide === 'explorer' ? 'auto' : 'none',
          overflow: 'hidden'
        }}>
          <FileExplorer
            currentFileName={getActiveTab()?.name}
            onOpenFile={onOpenFile}
            onCreateNewPrompd={() => {
              setShowNewFileDialog(true)
            }}
            onAddToContentField={(filePath, field) => {
              const activeTab = getActiveTab()
              if (activeTab && (activeTab.name.endsWith('.prmd') || activeTab.name.endsWith('.pdflow'))) {
                addToContentField(filePath, field, activeTab.name)
              } else {
                console.warn('Can only add files to .prmd or .pdflow files')
              }
            }}
            dirHandleExternal={explorerDirHandle}
            setDirHandleExternal={setExplorerDirHandle}
            entriesExternal={explorerEntries as any}
            setEntriesExternal={setExplorerEntries as any}
            onOpenPublish={() => openModal('publish')}
            // TabManager integration for file sync
            onFileRenamed={tabManager.handleFileRenamed}
            onFileDeleted={tabManager.handleFileDeleted}
            onFilesRefreshed={tabManager.handleFilesRefreshed}
            // Local package opening
            onOpenLocalPackage={handleOpenLocalPackage}
            // Workspace path for Git panel and window title
            onWorkspacePathChanged={setExplorerDirPath}
            // Collapse sidebar
            onCollapse={() => setShowSidebar(false)}
            // Open saved projects dialog
            onOpenProjects={() => openModal('localStorage')}
            // Open prompd.json as a tab with design view
            onOpenPrompdJson={async () => {
              if (!explorerDirPath) {
                console.warn('[App] No workspace open, cannot open prompd.json')
                return
              }

              const electronAPI = (window as any).electronAPI
              if (!electronAPI?.readFile) {
                console.warn('[App] No file system access')
                return
              }

              const configPath = `${explorerDirPath}/prompd.json`
              let content = ''
              let fileExists = false

              try {
                const result = await electronAPI.readFile(configPath)
                if (result.success) {
                  content = result.content
                  fileExists = true
                } else {
                  // File doesn't exist - create default content
                  const projectName = explorerDirPath.split(/[\\/]/).pop() || 'My Project'
                  content = JSON.stringify({
                    name: projectName,
                    version: '1.0.0',
                    description: '',
                    ignore: []
                  }, null, 2)
                }
              } catch (error) {
                console.error('[App] Error reading prompd.json:', error)
                return
              }

              // Open as a tab - onOpenFile handles setting the appropriate view mode
              // (design for new tabs, preserved viewMode for existing tabs)
              onOpenFile({
                name: 'prompd.json',
                text: content,
                electronPath: configPath
              })
            }}
            // Install all dependencies from prompd.json
            onInstallDependencies={async () => {
              const electronAPI = (window as any).electronAPI
              if (!electronAPI?.package?.installAll || !explorerDirPath) {
                addToast('Cannot install dependencies', 'error')
                return
              }

              // Show build panel with installing status
              setBuildOutput({
                status: 'building',
                message: 'Installing dependencies...',
                timestamp: Date.now()
              })
              setShowBottomPanel(true)
        setActiveBottomTab('output')

              try {
                const result = await electronAPI.package.installAll(explorerDirPath)
                console.log('[App] Install result:', result)

                if (result.success) {
                  const count = result.installed?.length || 0
                  const installedList = result.installed?.map((p: any) =>
                    `${p.name}@${p.version} (${p.status})`
                  ).join('\n') || ''

                  setBuildOutput({
                    status: 'success',
                    message: result.message || `Installed ${count} packages`,
                    details: installedList || undefined,
                    timestamp: Date.now()
                  })
                  window.dispatchEvent(new Event('prompd:resources-changed'))
                } else {
                  // Build structured errors from failed packages
                  const errors: { file: string; message: string; line?: number }[] = []

                  if (result.failed && result.failed.length > 0) {
                    for (const pkg of result.failed) {
                      errors.push({
                        file: 'prompd.json',
                        message: `${pkg.name}@${pkg.version}: ${pkg.error}`
                      })
                    }
                  }

                  setBuildOutput({
                    status: 'error',
                    message: result.message || 'Installation failed',
                    details: result.error,
                    errors: errors.length > 0 ? errors : undefined,
                    timestamp: Date.now()
                  })
                }
              } catch (err: any) {
                console.error('[App] Install failed:', err)
                setBuildOutput({
                  status: 'error',
                  message: 'Installation failed',
                  details: err.message || 'Unknown error',
                  timestamp: Date.now()
                })
              }
            }}
            onBrainstorm={handleOpenBrainstorm}
          />
        </div>
        <div style={{
          visibility: activeSide === 'packages' ? 'visible' : 'hidden',
          position: activeSide === 'packages' ? 'relative' : 'absolute',
          height: '100%',
          width: '100%',
          top: 0,
          left: 0,
          pointerEvents: activeSide === 'packages' ? 'auto' : 'none',
          overflow: 'hidden'
        }}>
          <PackageExplorerPanel
            theme={theme}
            workspacePath={explorerDirPath}
            onCollapse={() => setShowSidebar(false)}
            onOpenFile={onOpenFile}
            onShowNotification={(msg, type) => {
              addToast(msg, type || 'info')
            }}
            expandPackage={expandPackageInExplorer}
            onExpandHandled={() => setExpandPackageInExplorer(null)}
            visible={activeSide === 'packages' && showSidebar}
          />
        </div>
        <div style={{
          visibility: activeSide === 'ai' ? 'visible' : 'hidden',
          position: activeSide === 'ai' ? 'relative' : 'absolute',
          height: '100%',
          width: '100%',
          top: 0,
          left: 0,
          pointerEvents: activeSide === 'ai' ? 'auto' : 'none',
          overflow: 'hidden'
        }}>
          <AiChatPanel
            onPrompdGenerated={onAiGenerated}
            getText={aiGetText}
            setText={aiSetText}
            getActiveTabName={aiGetActiveTabName}
            showNotification={aiShowNotification}
            cursorPosition={cursor}
            workspacePath={explorerDirPath}
            onRegisterStop={(fn) => { stopExecutionRef.current = fn }}
            onAutoSave={async () => {
              const activeTab = getActiveTab()
              if (autoSaveEnabled && activeTab?.dirty && activeTab?.handle) {
                console.log('[App.tsx] Auto-saving before tool approval...')
                await save()
              }
            }}
            onPackageSelected={async (packageName: string) => {
              console.log('Package selected from AI:', packageName)

              try {
                // Fetch package info from registry
                const packageInfo = await registryApi.getPackageInfo(packageName)
                if (!packageInfo) {
                  throw new Error('Package not found')
                }

                // Open the PackageDetailsModal with the package info
                setSelectedRegistryPackage(packageInfo)
              } catch (error) {
                console.error('Failed to load package info:', error)
                aiShowNotification(
                  `Failed to load package: ${error instanceof Error ? error.message : 'Unknown error'}`,
                  'error'
                )
              }
            }}
            onOpenChatInTab={handleOpenChatInTab}
            onClose={() => setShowSidebar(false)}
            retryTrigger={retryGeneration}
            onSetPendingEdit={handleSetPendingEdit}
            onFileWritten={handleFileWritten}
          />
        </div>
        <div style={{
          visibility: activeSide === 'git' ? 'visible' : 'hidden',
          position: activeSide === 'git' ? 'relative' : 'absolute',
          height: '100%',
          width: '100%',
          top: 0,
          left: 0,
          pointerEvents: activeSide === 'git' ? 'auto' : 'none',
          overflow: 'hidden'
        }}>
          <GitPanel
            workspaceDir={explorerDirHandle}
            workspacePath={explorerDirPath}
            theme={theme}
            onWorkspacePathSet={setExplorerDirPath}
            onCollapse={() => setShowSidebar(false)}
          />
        </div>
        <div style={{
          visibility: activeSide === 'history' ? 'visible' : 'hidden',
          position: activeSide === 'history' ? 'relative' : 'absolute',
          height: '100%',
          width: '100%',
          top: 0,
          left: 0,
          pointerEvents: activeSide === 'history' ? 'auto' : 'none',
          overflow: 'hidden'
        }}>
          <ExecutionHistoryPanel
            theme={theme}
            onCollapse={() => setShowSidebar(false)}
          />
        </div>
        <div style={{
          visibility: activeSide === 'resources' ? 'visible' : 'hidden',
          position: activeSide === 'resources' ? 'relative' : 'absolute',
          height: '100%',
          width: '100%',
          top: 0,
          left: 0,
          pointerEvents: activeSide === 'resources' ? 'auto' : 'none',
          overflow: 'hidden'
        }}>
          <ResourcePanel
            onCollapse={() => setShowSidebar(false)}
          />
        </div>
        <div style={{
          visibility: activeSide === 'library' ? 'visible' : 'hidden',
          position: activeSide === 'library' ? 'relative' : 'absolute',
          height: '100%',
          width: '100%',
          top: 0,
          left: 0,
          pointerEvents: activeSide === 'library' ? 'auto' : 'none',
          overflow: 'hidden'
        }}>
          <InstalledResourcesPanel
            theme={theme}
            workspacePath={explorerDirPath}
            onCollapse={() => setShowSidebar(false)}
            onPublish={(resource, manifest) => {
              setPublishResource({ resource, manifest })
              openModal('publish-resource')
            }}
          />
        </div>
        <div className="sidebar-resizer" onMouseDown={beginResize} />
      </div>

      <div className="main-content" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: 'calc(100% - var(--bottom-panel-height, 0px) + 24px)' }}>
        <TabsBar
          tabs={tabs}
          activeTabId={activeTabId}
          onActivate={activateTabWithMode}
          onClose={closeTab}
          onCloseAll={closeAllTabs}
          onSave={saveTabById}
          onSaveAs={(tabId) => saveAs(tabId)}
          onReorder={reorderTabs}
        />

        {hasOpenTab ? (
          <div style={{
            flex: 1,
            minHeight: 0,
            position: 'relative'
          }}>
            {/* Persistent SplitEditors for .prmd tabs that have had chat opened.
                Each stays mounted (hidden when not active) so chat state survives tab switches. */}
            {tabs.filter(t =>
              chatMountedTabsRef.current.has(t.id) &&
              t.name?.toLowerCase().endsWith('.prmd')
            ).map(tab => {
              const isActive = tab.id === activeTabId && mode === 'code'
              const fullFilePath = (tab.handle as unknown as Record<string, unknown>)?._electronPath as string | undefined
              return (
                <div
                  key={`persistent-split-${tab.id}`}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: isActive ? 1 : 0,
                    visibility: isActive ? 'visible' : 'hidden',
                    pointerEvents: isActive ? 'auto' : 'none'
                  }}
                >
                  {/* Floating Brainstorm Launcher - gradient P icon */}
                  {isActive && !tab.showChat && !tab.showPreview && (
                    <button
                      onClick={() => {
                        updateTab(tab.id, {
                          showChat: true,
                          chatConfig: { mode: 'brainstorm', contextFile: tab.id, conversationId: tab.chatConfig?.conversationId }
                        })
                        chatMountedTabsRef.current.add(tab.id)
                      }}
                      style={{
                        position: 'absolute',
                        top: '8px',
                        left: '8px',
                        zIndex: 20,
                        width: '28px',
                        height: '28px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                      }}
                      title="Brainstorm: Collaborate with AI to edit this file on a working copy you control"
                    >
                      <GradientPrompdIcon size={18} />
                    </button>
                  )}
                  <SplitEditor
                    value={tab.text || ''}
                    onChange={(v) => {
                      // Use setText for active tab (syncs store.text + tab), updateTab for background
                      if (tab.id === activeTabId) {
                        setText(v)
                      } else {
                        updateTab(tab.id, { text: v, dirty: true })
                      }
                    }}
                    jumpTo={isActive ? (jumpTo || undefined) : undefined}
                    theme={theme}
                    onCursorChange={isActive ? setCursor : undefined}
                    language="prompd"
                    readOnly={tab.readOnly}
                    currentFilePath={fullFilePath}
                    workspacePath={explorerDirPath}
                    tabId={tab.id}
                    pendingEdit={isActive ? editorPendingEdit : undefined}
                    onAcceptEdit={isActive ? handleAcceptEdit : undefined}
                    onDeclineEdit={isActive ? handleDeclineEdit : undefined}
                    showPreview={tab.showPreview || false}
                    onClosePreview={() => updateTab(tab.id, { showPreview: false })}
                    parameters={tab.previewParams || {}}
                    onParametersChange={(params) => updateTab(tab.id, { previewParams: params })}
                    showContextSections={true}
                    hasFolderOpen={!!explorerDirPath}
                    onFileUpload={async (_sectionName: string, files: File[]) => {
                      const filePaths: string[] = []
                      for (const file of files) {
                        filePaths.push(file.name)
                      }
                      return filePaths
                    }}
                    onSelectFromBrowser={async (sectionName: string) => {
                      const files = await window.electronAPI?.showOpenDialog({
                        title: `Select file for ${sectionName} section`,
                        filters: [{ name: 'All Files', extensions: ['*'] }],
                        properties: ['openFile']
                      })
                      if (files && files.length > 0) {
                        return files[0]
                      }
                      return null
                    }}
                    onExecute={isActive ? handleExecuteFromPreview : undefined}
                    isExecuting={isActive ? isExecutingPreview : false}
                    showChat={tab.showChat || false}
                    onCloseChat={() => updateTab(tab.id, { showChat: false })}
                    chatTab={{
                      id: `chat-inline-${tab.id}`,
                      name: 'Chat',
                      text: '',
                      type: 'chat' as const,
                      chatConfig: { mode: tab.chatConfig?.mode || 'agent', contextFile: tab.id, conversationId: tab.chatConfig?.conversationId }
                    }}
                    chatWorkspacePath={explorerDirPath}
                    onChatGenerated={onAiGenerated}
                    onNewChat={() => {
                      const currentMode = tab.chatConfig?.mode || 'agent'
                      const newConv = conversationStorage.createConversation('confirm')
                      updateTab(tab.id, {
                        chatConfig: { mode: currentMode, contextFile: tab.id, conversationId: newConv.id }
                      })
                    }}
                    onSelectConversation={(conversationId: string) => {
                      const currentMode = tab.chatConfig?.mode || 'agent'
                      updateTab(tab.id, {
                        chatConfig: { mode: currentMode, contextFile: tab.id, conversationId }
                      })
                    }}
                  />
                </div>
              )
            })}

            {(() => {
              // Use tabs.find() instead of getActiveTab() to ensure React tracks the dependency
              const activeTab = tabs.find(t => t.id === activeTabId)

              // Render ChatTab for chat-type tabs
              if (activeTab?.type === 'chat' && activeTab.chatConfig) {
                return (
                  <ChatTab
                    tab={activeTab}
                    onPrompdGenerated={onAiGenerated}
                    theme={theme}
                    workspacePath={explorerDirPath}
                    onAutoSave={async () => {
                      const tab = getActiveTab()
                      if (autoSaveEnabled && tab?.dirty && tab?.handle) {
                        console.log('[App.tsx] Auto-saving before tool approval (ChatTab)...')
                        await save()
                      }
                    }}
                    onRegisterStop={(fn) => { stopExecutionRef.current = fn }}
                  />
                )
              }

              if (activeTab?.type === 'execution' && activeTab.executionConfig) {
                return (
                  <PrompdExecutionTab
                    config={activeTab.executionConfig}
                    theme={theme === 'dark' ? 'vs-dark' : 'light'}
                    onConfigChange={(updates) => {
                      if (activeTabId) {
                        console.log('[App.tsx] Config change requested:', updates)
                        console.log('[App.tsx] Current config before update:', {
                          provider: activeTab.executionConfig?.provider,
                          model: activeTab.executionConfig?.model
                        })

                        const newConfig = { ...activeTab.executionConfig!, ...updates }
                        console.log('[App.tsx] New config after merge:', {
                          provider: newConfig.provider,
                          model: newConfig.model
                        })

                        updateTab(activeTabId, {
                          executionConfig: newConfig,
                          dirty: true
                        })
                      }
                    }}
                    onExecute={async () => {
                      if (!activeTabId) return

                      setExecutingTab(activeTabId, true)

                      // Open bottom panel minimized to Prompds tab if closed
                      openBottomPanelMinimized('prompds')

                      try {
                        // Get FRESH config from current tab state (not from closure)
                        // This ensures we use the latest sections after user modifications
                        const currentTab = tabs.find(t => t.id === activeTabId)
                        if (!currentTab?.executionConfig) {
                          console.error('[App.tsx] No execution config found for tab:', activeTabId)
                          return
                        }

                        const config = currentTab.executionConfig

                        // Use global LLM provider from uiStore (centralized provider selection)
                        const globalProvider = useUIStore.getState().llmProvider
                        const executionConfig = {
                          ...config,
                          provider: globalProvider.provider,
                          model: globalProvider.model
                        }

                        // Debug: Log what will be sent to backend
                        console.log('[App.tsx] Executing prompt:', {
                          packageRef: executionConfig.prompdSource.packageRef,
                          provider: executionConfig.provider,
                          model: executionConfig.model,
                          parameterCount: Object.keys(executionConfig.parameters).length,
                          hasCustomSections: Object.keys(executionConfig.sections).length > 0,
                          sections: Object.keys(executionConfig.sections)  // Show which sections are present
                        })

                        // File reader for local file inheritance support
                        // Uses Electron IPC in Electron mode, File System Access API in web
                        const readFileFromWorkspace = async (filePath: string): Promise<string | null> => {
                          const electronAPI = (window as { electronAPI?: { readFile: (path: string) => Promise<{ success: boolean; content?: string; error?: string }>, getWorkspacePath: () => Promise<string | null> } }).electronAPI

                          // Electron mode: use IPC bridge
                          if (electronAPI?.readFile) {
                            try {
                              console.log('[App.tsx] Reading file from workspace (Electron):', filePath)

                              // Check if path is already absolute (contains drive letter like C:/ or starts with /)
                              const isAbsolutePath = /^[A-Za-z]:[\\/]/.test(filePath) || filePath.startsWith('/')
                              let fullPath: string

                              if (isAbsolutePath) {
                                // Path is already absolute - use it directly
                                fullPath = filePath.replace(/\\/g, '/')
                                console.log('[App.tsx] Using absolute path directly:', fullPath)
                              } else {
                                // Get workspace path - try IPC first, fallback to explorerDirHandle._electronPath
                                let workspacePath = await electronAPI.getWorkspacePath()
                                if (!workspacePath && explorerDirHandle && (explorerDirHandle as any)._electronPath) {
                                  workspacePath = (explorerDirHandle as any)._electronPath
                                  console.log('[App.tsx] Using explorerDirHandle._electronPath as workspace:', workspacePath)
                                }
                                if (!workspacePath) {
                                  console.warn('[App.tsx] No workspace path in Electron')
                                  return null
                                }

                                // Normalize path: remove leading ./ and construct full path
                                const normalizedPath = filePath.replace(/^\.\//, '')
                                fullPath = `${workspacePath}/${normalizedPath}`.replace(/\\/g, '/')
                              }

                              console.log(`[App.tsx] Reading full path: ${fullPath}`)
                              const result = await electronAPI.readFile(fullPath)
                              if (result.success && result.content !== undefined) {
                                console.log(`[App.tsx] Read ${filePath} (${result.content.length} bytes)`)
                                return result.content
                              } else {
                                console.warn(`[App.tsx] Failed to read ${filePath}:`, result.error)
                                return null
                              }
                            } catch (error) {
                              console.warn(`[App.tsx] Failed to read ${filePath}:`, error)
                              return null
                            }
                          }

                          // Web mode: use File System Access API
                          if (!explorerDirHandle) {
                            console.warn('[App.tsx] No workspace handle available for reading:', filePath)
                            return null
                          }

                          try {
                            console.log('[App.tsx] Reading file from workspace (FSAPI):', filePath)

                            // Navigate path (e.g., "./systems/tech.md" → ["systems", "tech.md"])
                            const parts = filePath.replace(/^\.\//, '').split('/')
                            let currentHandle: FileSystemDirectoryHandle = explorerDirHandle

                            // Navigate directories
                            for (let i = 0; i < parts.length - 1; i++) {
                              currentHandle = await currentHandle.getDirectoryHandle(parts[i])
                            }

                            // Get file handle and read content
                            const fileHandle = await currentHandle.getFileHandle(parts[parts.length - 1])
                            const file = await fileHandle.getFile()
                            const content = await file.text()

                            console.log(`[App.tsx] Read ${filePath} (${content.length} bytes)`)
                            return content
                          } catch (error) {
                            console.warn(`[App.tsx] Failed to read ${filePath}:`, error)
                            return null
                          }
                        }

                        // Resolve FULL disk path to the source file
                        // This is critical for the compiler to use NodeFileSystem and resolve packages correctly
                        let sourceFilePath: string | undefined

                        console.log('[App.tsx] Source path resolution:', {
                          hasHandle: !!currentTab.handle,
                          hasExplorerDir: !!explorerDirHandle,
                          tabType: currentTab.type,
                          tabName: currentTab.name
                        })

                        // Check if this execution tab was created from a workspace file
                        if (currentTab.handle && explorerDirHandle) {
                          // Get the full disk path by combining workspace path + relative path
                          const electronAPI = window.electronAPI
                          if (electronAPI?.getWorkspacePath) {
                            try {
                              const workspacePath = await electronAPI.getWorkspacePath()
                              const relativePath = await resolveFileHandle(explorerDirHandle, currentTab.handle)

                              if (workspacePath && relativePath) {
                                // Combine to get full absolute path
                                sourceFilePath = workspacePath + '/' + relativePath
                                console.log('[App.tsx] ✓ Source file path from handle:', sourceFilePath)
                              } else {
                                console.warn('[App.tsx] Missing workspacePath or relativePath:', { workspacePath, relativePath })
                              }
                            } catch (error) {
                              console.warn('[App.tsx] Could not determine full path from file handle:', error)
                            }
                          }
                        } else {
                          console.warn('[App.tsx] Cannot resolve source path - missing handle or explorer dir')
                        }

                        // Fallback: use tab.filePath (full disk path stored for persistence)
                        if (!sourceFilePath && currentTab.filePath) {
                          sourceFilePath = currentTab.filePath
                          console.log('[App.tsx] Source file path from tab.filePath:', sourceFilePath)
                        }

                        // Fallback: extract from package reference
                        let execPackageId: string | undefined
                        if (!sourceFilePath && executionConfig.prompdSource.type === 'package' && executionConfig.prompdSource.packageRef) {
                          // Example: "@prompd/blog@1.0.0/prompts/writer.prmd" → "prompts/writer.prmd"
                          const match = executionConfig.prompdSource.packageRef.match(/\/([^@]+)$/)
                          if (match) {
                            sourceFilePath = match[1]
                            console.log('[App.tsx] Source file path from packageRef:', sourceFilePath)
                          }
                          // Extract packageId: "@prompd/blog@1.0.0/prompts/writer.prmd" → "@prompd/blog@1.0.0"
                          const pkgMatch = executionConfig.prompdSource.packageRef.match(/^(@[^/]+\/[^@]+@[^/]+)/)
                          if (pkgMatch) {
                            execPackageId = pkgMatch[1]
                          }
                        }

                        // Also check tab's packageSource directly
                        if (!execPackageId && currentTab.packageSource?.packageId) {
                          execPackageId = currentTab.packageSource.packageId
                          if (!sourceFilePath && currentTab.packageSource.filePath) {
                            sourceFilePath = currentTab.packageSource.filePath
                            console.log('[App.tsx] Source file path from tab.packageSource:', sourceFilePath)
                          }
                        }

                        const result = await executePrompdConfig(
                          executionConfig,
                          async () => {
                            const token = await getToken()
                            return token
                          },
                          readFileFromWorkspace,  // Pass file reader for local file inheritance
                          sourceFilePath,  // Pass source file path for relative path resolution
                          {  // Env options for compile-time variable substitution
                            workspacePath: explorerDirPath,
                            selectedEnvFile
                          },
                          execPackageId  // Pass package ID for resolving file references from package cache
                        )

                        console.log('[App.tsx] Execution result received:', {
                          hasCompiledPrompt: !!result.compiledPrompt,
                          compiledPromptType: typeof result.compiledPrompt,
                          resultKeys: Object.keys(result)
                        })

                        if (activeTabId) {
                          // Get FRESH tab state to preserve any config changes made during execution
                          const freshTab = useEditorStore.getState().tabs.find(t => t.id === activeTabId)
                          const freshConfig = freshTab?.executionConfig || currentTab.executionConfig!

                          updateTab(activeTabId, {
                            executionConfig: {
                              ...freshConfig,
                              executionHistory: [result, ...(freshConfig.executionHistory || [])]
                            }
                          })

                          console.log('[App.tsx] Updated tab with execution history:', {
                            historyLength: [result, ...(currentTab.executionConfig!.executionHistory || [])].length,
                            latestResultHasCompiledPrompt: !!result.compiledPrompt
                          })
                        }

                        if (result.status === 'success') {
                          aiShowNotification('Execution completed successfully', 'info')

                          // Track usage for successful execution (localStorage-based)
                          if (result.metadata?.tokensUsed) {
                            trackUsage(
                              'execution',
                              result.metadata.provider,
                              result.metadata.model,
                              result.metadata.tokensUsed.input,
                              result.metadata.tokensUsed.output,
                              {
                                source: executionConfig.prompdSource.packageRef || 'local',
                                duration: result.metadata.duration
                              }
                            )
                          }

                          // Record execution to IndexedDB with backend sync
                          // This stores the full execution for history viewing and comparison
                          const compiledPromptText = typeof result.compiledPrompt === 'string'
                            ? result.compiledPrompt
                            : result.compiledPrompt?.finalPrompt || ''

                          usageTracker.recordExecution({
                            provider: result.metadata?.provider || executionConfig.provider,
                            model: result.metadata?.model || executionConfig.model,
                            promptTokens: result.metadata?.tokensUsed?.input || 0,
                            completionTokens: result.metadata?.tokensUsed?.output || 0,
                            totalTokens: result.metadata?.tokensUsed?.total || 0,
                            duration: result.metadata?.duration || 0,
                            success: true,
                            executionMode: result.metadata?.executionMode || 'local',
                            compiledPrompt: compiledPromptText,
                            response: result.content,
                            context: executionConfig.prompdSource.packageRef || activeTab?.name || 'local'
                          }).catch(err => {
                            console.warn('[App.tsx] Failed to record execution to IndexedDB:', err)
                          })

                          // Add to session history (cleared on app close, shown in bottom panel)
                          setPrompdSessionHistory(prev => [...prev, {
                            id: `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                            timestamp: Date.now(),
                            provider: result.metadata?.provider || executionConfig.provider,
                            model: result.metadata?.model || executionConfig.model,
                            compiledPrompt: compiledPromptText,
                            response: result.content,
                            success: true,
                            promptTokens: result.metadata?.tokensUsed?.input || 0,
                            completionTokens: result.metadata?.tokensUsed?.output || 0,
                            totalTokens: result.metadata?.tokensUsed?.total || 0,
                            duration: result.metadata?.duration || 0,
                            context: executionConfig.prompdSource.packageRef || activeTab?.name || 'local'
                          }])

                          // Show bottom panel with Prompds tab, expand if minimized
                          setShowBottomPanel(true)
                          setActiveBottomTab('prompds')
                          setBottomPanelMinimized(false)
                        } else {
                          const isAuthError = result.content.includes('Unauthorized') || result.content.includes('Authentication required')

                          if (isAuthError) {
                            aiShowNotification(
                              'Backend authentication required. Please start the backend server (port 3010) with MongoDB and API keys configured.',
                              'error'
                            )
                          } else {
                            aiShowNotification(
                              `Execution failed: ${result.content}`,
                              'error'
                            )
                          }

                          // Record failed execution to IndexedDB for tracking
                          usageTracker.recordExecution({
                            provider: result.metadata?.provider || executionConfig.provider,
                            model: result.metadata?.model || executionConfig.model,
                            promptTokens: 0,
                            completionTokens: 0,
                            totalTokens: 0,
                            duration: result.metadata?.duration || 0,
                            success: false,
                            error: result.content,
                            executionMode: result.metadata?.executionMode || 'local',
                            context: executionConfig.prompdSource.packageRef || activeTab?.name || 'local'
                          }).catch(err => {
                            console.warn('[App.tsx] Failed to record failed execution to IndexedDB:', err)
                          })

                          // Add failed execution to session history
                          const compiledPromptForError = typeof result.compiledPrompt === 'string'
                            ? result.compiledPrompt
                            : result.compiledPrompt?.finalPrompt || ''
                          setPrompdSessionHistory(prev => [...prev, {
                            id: `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                            timestamp: Date.now(),
                            provider: result.metadata?.provider || executionConfig.provider,
                            model: result.metadata?.model || executionConfig.model,
                            compiledPrompt: compiledPromptForError,
                            error: result.content,
                            success: false,
                            promptTokens: 0,
                            completionTokens: 0,
                            totalTokens: 0,
                            duration: result.metadata?.duration || 0,
                            context: executionConfig.prompdSource.packageRef || activeTab?.name || 'local'
                          }])

                          // Show bottom panel with Prompds tab, expand if minimized
                          setShowBottomPanel(true)
                          setActiveBottomTab('prompds')
                          setBottomPanelMinimized(false)
                        }
                      } catch (error) {
                        console.error('Unexpected execution error:', error)
                        aiShowNotification(
                          `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                          'error'
                        )
                      } finally {
                        if (activeTabId) {
                          setExecutingTab(activeTabId, false)
                        }
                      }
                    }}
                    onSave={async () => {
                      if (!activeTab.executionConfig) return

                      try {
                        const prompdContent = buildPrompdFile(activeTab.executionConfig)
                        // Extract just the filename (no path) and remove (execution) suffix
                        const rawName = activeTab.name.replace(' (execution)', '')
                        const defaultFilename = rawName.split('/').pop()?.split('\\').pop() || 'untitled.prmd'

                        setSaveFilenameDialog({
                          show: true,
                          defaultName: defaultFilename,
                          onConfirm: async (filename: string) => {
                            try {
                              // Sanitize filename: remove path separators and invalid characters
                              let sanitizedFilename = filename.split('/').pop()?.split('\\').pop() || filename
                              // Remove characters not allowed in filenames
                              sanitizedFilename = sanitizedFilename.replace(/[<>:"|?*]/g, '-')
                              const finalFilename = sanitizedFilename.endsWith('.prmd') ? sanitizedFilename : `${sanitizedFilename}.prmd`

                              if (explorerDirHandle) {
                                const fileHandle = await explorerDirHandle.getFileHandle(finalFilename, { create: true })
                                const writable = await fileHandle.createWritable()
                                await writable.write(prompdContent)
                                await writable.close()

                                if (activeTabId) {
                                  updateTab(activeTabId, {
                                    name: finalFilename,
                                    text: prompdContent,
                                    type: 'file',
                                    handle: fileHandle,
                                    dirty: false,
                                    executionConfig: undefined,
                                    virtualTemp: undefined
                                  })
                                }

                                aiShowNotification(`Saved as ${finalFilename}`, 'info')
                              } else {
                                if (activeTabId) {
                                  updateTab(activeTabId, {
                                    name: finalFilename,
                                    text: prompdContent,
                                    type: 'file',
                                    dirty: false,
                                    executionConfig: undefined,
                                    virtualTemp: true
                                  })
                                }

                                aiShowNotification(`Saved as ${finalFilename} (virtual - open a folder to save to disk)`, 'info')
                              }

                              setSaveFilenameDialog(null)
                            } catch (error) {
                              console.error('Save error:', error)
                              console.error('[error] Save failed:', error instanceof Error ? error.message : String(error))
                            }
                          }
                        })
                      } catch (error) {
                        console.error('Save error:', error)
                        aiShowNotification(
                          `Save failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                          'error'
                        )
                      }
                    }}
                    isExecuting={executingTabs.has(activeTabId!)}
                    hasFolder={!!explorerDirHandle}
                    onSelectFileFromBrowser={async (sectionName) => {
                      if (!explorerDirHandle && !explorerDirPath) return null

                      try {
                        let fileName: string
                        let content: string

                        // Check if we're in Electron
                        const electronAPI = (window as any).electronAPI
                        if (electronAPI?.selectFileFromWorkspace && explorerDirPath) {
                          // Electron: Use native file picker
                          const result = await electronAPI.selectFileFromWorkspace(
                            explorerDirPath,
                            `Select file for ${sectionName} section`
                          )

                          if (!result.success) {
                            if (result.canceled) return null
                            throw new Error(result.error || 'Failed to select file')
                          }

                          fileName = result.relativePath
                          content = result.content
                        } else if (explorerDirHandle) {
                          // Browser: Use File System Access API
                          try {
                            // Only use startIn if we have a valid native FileSystemDirectoryHandle
                            // Check for instanceof to ensure it's not a serialized/deserialized plain object
                            const pickerOptions: any = { multiple: false }
                            const isNativeHandle = typeof FileSystemDirectoryHandle !== 'undefined' &&
                              explorerDirHandle instanceof FileSystemDirectoryHandle
                            if (isNativeHandle) {
                              pickerOptions.startIn = explorerDirHandle
                            }
                            const [fileHandle] = await (window as any).showOpenFilePicker(pickerOptions)

                            const fileObj = await fileHandle.getFile()
                            content = await fileObj.text()

                            // Get the relative path by resolving from the directory handle
                            const relativePath = await explorerDirHandle.resolve(fileHandle)
                            if (relativePath) {
                              fileName = relativePath.join('/')
                            } else {
                              fileName = fileObj.name
                            }
                          } catch (e: any) {
                            // Fallback to prompt if showOpenFilePicker not available or user canceled
                            if (e.name === 'AbortError') return null
                            throw e
                          }
                        } else {
                          return null
                        }

                        // Convert workspace path to source-relative path for the compiler
                        // The @prompd/cli compiler resolves ALL paths relative to the source file
                        // So "contexts/data.csv" from "prompts/file.prmd" needs to be "../contexts/data.csv"
                        const sourceFilePath = activeTab?.name?.replace(/\\/g, '/') || ''
                        const sourceDir = sourceFilePath.includes('/')
                          ? sourceFilePath.substring(0, sourceFilePath.lastIndexOf('/') + 1)
                          : ''

                        let relativeFilePath = fileName
                        if (sourceDir) {
                          // Calculate relative path from source directory to target file
                          const sourceParts = sourceDir.split('/').filter(p => p)
                          const targetParts = fileName.replace(/\\/g, '/').split('/').filter(p => p)

                          // Find common prefix
                          let commonLength = 0
                          while (commonLength < sourceParts.length &&
                                 commonLength < targetParts.length &&
                                 sourceParts[commonLength] === targetParts[commonLength]) {
                            commonLength++
                          }

                          // Build relative path: ../ for each remaining source dir, then target path
                          const upCount = sourceParts.length - commonLength
                          const remainingTarget = targetParts.slice(commonLength)

                          if (upCount > 0 || remainingTarget.length > 0) {
                            relativeFilePath = '../'.repeat(upCount) + remainingTarget.join('/')
                          }

                          // Ensure it starts with ./ or ../ for explicit relative path
                          if (!relativeFilePath.startsWith('../')) {
                            relativeFilePath = './' + relativeFilePath
                          }

                          console.log(`[App.tsx] Converted path: ${fileName} → ${relativeFilePath} (relative to ${sourceDir})`)
                        }

                        if (activeTabId && activeTab.executionConfig) {
                          if (sectionName === 'context') {
                            updateTab(activeTabId, {
                              executionConfig: {
                                ...activeTab.executionConfig,
                                sections: {
                                  ...activeTab.executionConfig.sections,
                                  context: [
                                    ...(activeTab.executionConfig.sections.context || []),
                                    { type: 'file', content, filePath: relativeFilePath }
                                  ]
                                }
                              },
                              dirty: true
                            })
                          } else {
                            const entry: SectionEntry = {
                              type: 'file',
                              content,
                              filePath: relativeFilePath
                            }

                            updateTab(activeTabId, {
                              executionConfig: {
                                ...activeTab.executionConfig,
                                sections: {
                                  ...activeTab.executionConfig.sections,
                                  [sectionName]: entry
                                }
                              },
                              dirty: true
                            })
                          }
                        }

                        return relativeFilePath
                      } catch (error) {
                        console.error('File selection error:', error)
                        addToast(`Failed to select file: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
                        return null
                      }
                    }}
                  />
                )
              }

              // Brainstorm tab — collaborative editor with working copy + AI chat
              if (activeTab?.type === 'brainstorm' && activeTab.brainstormConfig) {
                return (
                  <BrainstormTab
                    tab={activeTab}
                    theme={theme}
                    workspacePath={explorerDirPath}
                    onApply={(newText) => {
                      // Write back to the source file tab if it's open
                      const sourceTabId = activeTab.brainstormConfig?.sourceTabId
                      if (sourceTabId) {
                        const sourceTab = tabs.find(t => t.id === sourceTabId)
                        if (sourceTab) {
                          updateTab(sourceTabId, { text: newText, dirty: true })
                        }
                      }
                      // Write to disk via Electron IPC if we have the path
                      const filePath = activeTab.brainstormConfig?.sourceFilePath
                      if (filePath && window.electronAPI?.isElectron) {
                        window.electronAPI.writeFile(filePath, newText)
                      }
                      // Update brainstorm tab base text so isDirty resets
                      updateTab(activeTab.id, { text: newText })
                    }}
                    onChatGenerated={onAiGenerated}
                  />
                )
              }

              if (mode === 'wizard') {
                return (
                  <GuidedPromptWizard
                    initialText={text}
                    onChange={(newText, newTabName) => {
                      setText(newText)
                      // Update tab name if provided
                      if (newTabName && activeTabId) {
                        updateTab(activeTabId, { name: newTabName })
                      }
                    }}
                    theme={theme}
                    onComplete={(state) => {
                      setWizardState(state)
                      console.log('[App] Wizard completed - activeTabId:', activeTabId)
                      console.log('[App] Current text state:', text.substring(0, 100))
                      console.log('[App] Active tab:', getActiveTab())
                      // Update the current tab's viewMode to design (text was already updated by wizard's onChange)
                      if (activeTabId) {
                        updateTab(activeTabId, { viewMode: 'design' })
                      }
                      setMode('design')
                      // Wizard hints are auto-dismissed as the user progresses through them
                      // No need to call dismissWizardHints() - let remaining hints show naturally
                    }}
                  />
                )
              } else if (mode === 'design') {
                // Check if this is a .pdflow workflow file - use WorkflowCanvas (visual canvas)
                const isWorkflowFile = activeTab?.name?.toLowerCase()?.endsWith('.pdflow')
                if (isWorkflowFile) {
                  console.log(`[App] Rendering WorkflowCanvas: tab=${activeTabId}, file=${activeTab?.name}, length=${activeTab?.text?.length || 0}`)
                  return (
                    <WorkflowCanvas
                      key={`workflow-${activeTabId}`}
                      content={activeTab?.text || ''}
                      activeTabId={activeTabId}
                      onChange={setText}
                      readOnly={activeTab?.readOnly}
                      onDeploy={() => openModal('deploy-workflow')}
                    />
                  )
                }

                // Check if this is a prompd.json file - use specialized design view
                const isPrompdJson = activeTab?.name?.toLowerCase() === 'prompd.json' ||
                                     activeTab?.name?.toLowerCase()?.endsWith('/prompd.json') ||
                                     activeTab?.name?.toLowerCase()?.endsWith('\\prompd.json')

                if (isPrompdJson) {
                  return (
                    <PrompdJsonDesignView
                      value={activeTab?.text || text}
                      onChange={setText}
                      theme={theme}
                      readOnly={activeTab?.readOnly}
                    />
                  )
                }

                return (
                  <DesignView
                    value={activeTab?.text || text}
                    onChange={setText}
                    wizardState={wizardState}
                    currentFilePath={activeTab?.name}
                    onOpenFile={onOpenFile}
                    workspaceHandle={explorerDirHandle}
                    theme={theme}
                    onOpenPackageFile={onOpenPackageFile}
                    readOnly={activeTab?.readOnly}
                    onSelectFileFromBrowser={async (sectionName) => {
                      if (!explorerDirHandle) {
                        addToast('No workspace folder is open. Please open a folder first.', 'warning')
                        return null
                      }

                      try {
                        const pickerOptions: any = {
                          multiple: false,
                          types: [
                            {
                              description: 'All Files',
                              accept: {
                                '*/*': []
                              }
                            }
                          ]
                        }
                        // Only use startIn if explorerDirHandle is a valid native FileSystemDirectoryHandle
                        // In Electron, explorerDirHandle may be a mock object that doesn't work with showOpenFilePicker
                        if (explorerDirHandle &&
                            explorerDirHandle.kind === 'directory' &&
                            typeof explorerDirHandle.getFileHandle === 'function' &&
                            !(window as any).electronAPI) {
                          pickerOptions.startIn = explorerDirHandle
                        }
                        const fileHandles = await (window as any).showOpenFilePicker(pickerOptions)

                        if (!fileHandles || fileHandles.length === 0) return null
                        const fileHandle = fileHandles[0]

                        const resolvedPath = await resolveFileHandle(explorerDirHandle, fileHandle)
                        if (!resolvedPath) {
                          addToast('Selected file must be within the workspace folder.', 'warning')
                          return null
                        }

                        // Convert workspace path to source-relative path for the compiler
                        // The @prompd/cli compiler resolves ALL paths relative to the source file
                        // So "contexts/data.csv" from "prompts/file.prmd" needs to be "../contexts/data.csv"
                        const sourceFilePath = activeTab?.name?.replace(/\\/g, '/') || ''
                        const sourceDir = sourceFilePath.includes('/')
                          ? sourceFilePath.substring(0, sourceFilePath.lastIndexOf('/') + 1)
                          : ''

                        let relativeFilePath = resolvedPath
                        if (sourceDir) {
                          // Calculate relative path from source directory to target file
                          const sourceParts = sourceDir.split('/').filter(p => p)
                          const targetParts = resolvedPath.replace(/\\/g, '/').split('/').filter(p => p)

                          // Find common prefix
                          let commonLength = 0
                          while (commonLength < sourceParts.length &&
                                 commonLength < targetParts.length &&
                                 sourceParts[commonLength] === targetParts[commonLength]) {
                            commonLength++
                          }

                          // Build relative path: ../ for each remaining source dir, then target path
                          const upCount = sourceParts.length - commonLength
                          const remainingTarget = targetParts.slice(commonLength)

                          if (upCount > 0 || remainingTarget.length > 0) {
                            relativeFilePath = '../'.repeat(upCount) + remainingTarget.join('/')
                          }

                          // Ensure it starts with ./ or ../ for explicit relative path
                          if (!relativeFilePath.startsWith('../')) {
                            relativeFilePath = './' + relativeFilePath
                          }

                          console.log(`[App.tsx] DesignView: Converted path: ${resolvedPath} → ${relativeFilePath} (relative to ${sourceDir})`)
                        } else {
                          // No source directory, ensure workspace-relative path starts with ./
                          relativeFilePath = resolvedPath.startsWith('./') ? resolvedPath : `./${resolvedPath}`
                        }

                        return relativeFilePath
                      } catch (error) {
                        if (error instanceof Error && error.name === 'AbortError') {
                          return null
                        }
                        console.error('File selection error:', error)
                        addToast(`Failed to select file: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
                        return null
                      }
                    }}
                  />
                )
              } else {
                // Determine language based on file extension (only .prmd files use prompd language)
                const detectedLanguage = getLanguageFromExtension(activeTab?.name || '') || 'plaintext'
                // Get full file path from Electron handle for IntelliSense validation
                const fullFilePath = (activeTab?.handle as any)?._electronPath || null
                const isPrompdLanguage = detectedLanguage === 'prompd'

                // Use SplitEditor for .prmd files
                if (isPrompdLanguage) {
                  // If this tab has a persistent SplitEditor (chat was opened), it's
                  // already rendered above — skip the IIFE render to avoid duplicates.
                  if (activeTabId && chatMountedTabsRef.current.has(activeTabId)) {
                    return null
                  }

                  return (
                    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                      {/* Floating Brainstorm Launcher - gradient P icon */}
                      {!activeTab?.showChat && !activeTab?.showPreview && (
                        <button
                          onClick={() => {
                            if (activeTabId) {
                              updateTab(activeTabId, {
                                showChat: true,
                                chatConfig: { mode: 'brainstorm', contextFile: activeTabId, conversationId: activeTab?.chatConfig?.conversationId }
                              })
                              chatMountedTabsRef.current.add(activeTabId)
                            }
                          }}
                          style={{
                            position: 'absolute',
                            top: '8px',
                            left: '8px',
                            zIndex: 20,
                            width: '28px',
                            height: '28px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                          }}
                          title="Brainstorm: Collaborate with AI to edit this file on a working copy you control"
                        >
                          <GradientPrompdIcon size={18} />
                        </button>
                      )}
                      <SplitEditor
                        value={activeTab?.text || text}
                        onChange={setText}
                        jumpTo={jumpTo || undefined}
                        theme={theme}
                        onCursorChange={setCursor}
                        language={detectedLanguage}
                        readOnly={activeTab?.readOnly}
                        currentFilePath={fullFilePath}
                        workspacePath={explorerDirPath}
                        tabId={activeTabId || undefined}
                        pendingEdit={editorPendingEdit}
                        onAcceptEdit={handleAcceptEdit}
                        onDeclineEdit={handleDeclineEdit}
                        showPreview={activeTab?.showPreview || false}
                        onClosePreview={() => {
                          if (activeTabId) {
                            updateTab(activeTabId, { showPreview: false })
                          }
                        }}
                        parameters={activeTab?.previewParams || {}}
                        onParametersChange={(params) => {
                          if (activeTabId) {
                            updateTab(activeTabId, { previewParams: params })
                          }
                        }}
                        showContextSections={true}
                        hasFolderOpen={!!explorerDirPath}
                        onFileUpload={async (sectionName: string, files: File[]) => {
                          const filePaths: string[] = []
                          for (const file of files) {
                            filePaths.push(file.name)
                          }
                          return filePaths
                        }}
                        onSelectFromBrowser={async (sectionName: string) => {
                          const files = await window.electronAPI?.showOpenDialog({
                            title: `Select file for ${sectionName} section`,
                            filters: [{ name: 'All Files', extensions: ['*'] }],
                            properties: ['openFile']
                          })
                          if (files && files.length > 0) {
                            return files[0]
                          }
                          return null
                        }}
                        onExecute={handleExecuteFromPreview}
                        isExecuting={isExecutingPreview}
                        showChat={activeTab?.showChat || false}
                        onCloseChat={() => {
                          if (activeTabId) {
                            updateTab(activeTabId, { showChat: false })
                          }
                        }}
                        chatTab={activeTabId ? {
                          id: `chat-inline-${activeTabId}`,
                          name: 'Chat',
                          text: '',
                          type: 'chat' as const,
                          chatConfig: { mode: activeTab?.chatConfig?.mode || 'agent', contextFile: activeTabId, conversationId: activeTab?.chatConfig?.conversationId }
                        } : undefined}
                        chatWorkspacePath={explorerDirPath}
                        onChatGenerated={onAiGenerated}
                        onNewChat={() => {
                          if (activeTabId) {
                            const currentMode = activeTab?.chatConfig?.mode || 'agent'
                            const newConv = conversationStorage.createConversation('confirm')
                            updateTab(activeTabId, {
                              chatConfig: { mode: currentMode, contextFile: activeTabId, conversationId: newConv.id }
                            })
                          }
                        }}
                        onSelectConversation={(conversationId: string) => {
                          if (activeTabId) {
                            const currentMode = activeTab?.chatConfig?.mode || 'agent'
                            updateTab(activeTabId, {
                              chatConfig: { mode: currentMode, contextFile: activeTabId, conversationId }
                            })
                          }
                        }}
                      />
                    </div>
                  )
                }

                // All other files (including .pdflow in code mode) use Monaco editor
                return (
                  <PrompdEditor
                    value={activeTab?.text || text}
                    onChange={setText}
                    jumpTo={jumpTo || undefined}
                    theme={theme}
                    onCursorChange={setCursor}
                    language={detectedLanguage}
                    readOnly={activeTab?.readOnly}
                    currentFilePath={fullFilePath}
                    workspacePath={explorerDirPath}
                    tabId={activeTabId || undefined}
                    pendingEdit={editorPendingEdit}
                    onAcceptEdit={handleAcceptEdit}
                    onDeclineEdit={handleDeclineEdit}
                  />
                )
              }
            })()}
          </div>
        ) : (
          <WelcomeView
            theme={theme}
            onOpenFolder={async () => {
              // Trigger folder open dialog
              const electronAPI = (window as any).electronAPI
              if (electronAPI?.openFolder) {
                try {
                  const folderPath = await electronAPI.openFolder()
                  // Handle canceled dialog (returns null)
                  if (folderPath) {
                    // Create pseudo-handle for Electron
                    const pseudoHandle = {
                      name: folderPath.split(/[/\\]/).pop() || 'workspace',
                      kind: 'directory' as const,
                      _electronPath: folderPath
                    }
                    setExplorerDirHandle(pseudoHandle as any)
                    setExplorerDirPath(folderPath)
                  }
                } catch (error) {
                  console.error('Failed to open folder:', error)
                }
              } else if ((window as any).showDirectoryPicker) {
                try {
                  const handle = await (window as any).showDirectoryPicker()
                  setExplorerDirHandle(handle)
                } catch (error) {
                  if ((error as Error).name !== 'AbortError') {
                    console.error('Failed to open folder:', error)
                  }
                }
              }
            }}

            onNewPrompt={() => {
              setShowNewFileDialog(true)
              // User took the action we were hinting at - dismiss the hint
              markHintSeen('getting-started')
            }}
            onBrowseRegistry={() => {
              setActiveSide('packages')
              setShowSidebar(true)
            }}
            onOpenProject={async (path: string) => {
              const electronAPI = (window as any).electronAPI
              if (electronAPI?.readDir) {
                try {
                  // Open the specific folder path
                  const result = await electronAPI.readDir(path)
                  if (result.success) {
                    const pseudoHandle = {
                      name: path.split(/[/\\]/).pop() || 'workspace',
                      kind: 'directory' as const,
                      _electronPath: path
                    }
                    setExplorerDirHandle(pseudoHandle as any)
                    setExplorerDirPath(path)
                    // Update Electron window title
                    if (electronAPI.setWorkspacePath) {
                      electronAPI.setWorkspacePath(path)
                    }
                  }
                } catch (error) {
                  console.error('Failed to open project:', error)
                }
              }
            }}
            onOpenFile={async (relativePath: string) => {
              // Open a file from the project using the proper onOpenFile handler
              if (!explorerDirPath) return
              const electronAPI = (window as any).electronAPI
              if (!electronAPI?.readFile) return

              try {
                const fullPath = `${explorerDirPath}/${relativePath}`.replace(/\\/g, '/')
                const result = await electronAPI.readFile(fullPath)
                if (result.success && result.content !== undefined) {
                  // Use relativePath as the name to match how FileExplorer names tabs
                  // This ensures duplicate detection works correctly
                  onOpenFile({
                    name: relativePath,
                    text: result.content,
                    electronPath: fullPath,
                    readOnly: false
                  })
                }
              } catch (error) {
                console.error('Failed to open file:', error)
              }
            }}
            workspacePath={explorerDirPath}
            workspaceName={explorerDirHandle?.name}
            onRestoreState={async (workspaceState) => {
              // Restore previously open files from workspace state
              const electronAPI = (window as any).electronAPI
              if (!electronAPI?.readFile || !explorerDirPath) return

              console.log('[App] Restoring workspace state:', workspaceState.openFiles.length, 'files')

              // Open each file from the saved state
              for (const relativePath of workspaceState.openFiles) {
                try {
                  const fullPath = `${explorerDirPath}/${relativePath}`.replace(/\\/g, '/')
                  const result = await electronAPI.readFile(fullPath)
                  if (result.success && result.content !== undefined) {
                    // Get the saved view mode for this file
                    const savedViewMode = workspaceState.viewModes?.[relativePath]

                    onOpenFile({
                      name: relativePath,
                      text: result.content,
                      electronPath: fullPath,
                      readOnly: false
                    })

                    // If there's a saved view mode, update the tab
                    if (savedViewMode) {
                      // The tab was just added, find it and update
                      const currentTabs = useEditorStore.getState().tabs
                      const newTab = currentTabs.find(t => t.name === relativePath)
                      if (newTab) {
                        updateTab(newTab.id, { viewMode: savedViewMode })
                      }
                    }
                  }
                } catch (error) {
                  console.error('[App] Failed to restore file:', relativePath, error)
                }
              }

              // Activate the previously active file if specified
              if (workspaceState.activeFile) {
                const currentTabs = useEditorStore.getState().tabs
                const activeTab = currentTabs.find(t => t.name === workspaceState.activeFile)
                if (activeTab) {
                  activateTab(activeTab.id)
                  // Restore cursor position if saved
                  const savedCursor = workspaceState.cursorPositions?.[workspaceState.activeFile]
                  if (savedCursor) {
                    setCursor(savedCursor)
                    // Also set jumpTo to scroll to the cursor position
                    setJumpTo({ line: savedCursor.line, column: savedCursor.column })
                  }
                  // Restore view mode
                  const savedViewMode = workspaceState.viewModes?.[workspaceState.activeFile]
                  if (savedViewMode) {
                    setMode(savedViewMode)
                  }
                }
              }

              console.log('[App] Workspace state restored successfully')
            }}
            onOpenPackageDetails={async (pkg) => {
              const eApi = (window as unknown as Record<string, unknown>).electronAPI as {
                cache?: { download: (name: string, version?: string) => Promise<{ success: boolean; error?: string }> }
              } | undefined
              if (eApi?.cache) {
                const ref = pkg.version ? `${pkg.name}@${pkg.version}` : pkg.name
                addToast(`Downloading ${ref} to cache...`, 'info')
                const result = await eApi.cache.download(pkg.name, pkg.version)
                if (result.success) {
                  setExpandPackageInExplorer(`${pkg.name}@${pkg.version}`)
                  setActiveSide('packages')
                  setShowSidebar(true)
                  window.dispatchEvent(new Event('prompd:resources-changed'))
                } else {
                  addToast(`Failed to download: ${result.error}`, 'error')
                }
              } else {
                // Fallback: open modal if not in Electron
                setSelectedRegistryPackage(pkg)
              }
            }}
          />
        )}
      </div>

      <StatusBar
        fileName={getActiveTab()?.name || ''}
        dirty={getActiveTab()?.dirty}
        line={cursor.line}
        column={cursor.column}
        issuesCount={monacoMarkers.length}
        theme={theme}
        language={getLanguageFromExtension(getActiveTab()?.name || '') || 'plaintext'}
        onIssuesClick={() => {
          // Show Monaco markers in the Output panel
          if (monacoMarkers.length > 0) {
            setBuildOutput({
              status: 'error',
              message: `${monacoMarkers.length} ${monacoMarkers.length === 1 ? 'problem' : 'problems'} found`,
              errors: monacoMarkers,
              timestamp: Date.now()
            })
            setShowBottomPanel(true)
        setActiveBottomTab('output')
            // Dispatch event to expand the panel
            window.dispatchEvent(new CustomEvent('expand-output-panel'))
          }
        }}
      />

      {/* Modals */}
      <CloseWorkspaceDialog
        isOpen={showCloseWorkspaceDialog}
        unsavedFiles={tabs
          .filter(t => t.dirty && t.type !== 'chat' && t.type !== 'execution' && t.type !== 'brainstorm')
          .map(t => ({ id: t.id, name: t.name }))
        }
        onSaveAll={handleSaveAllAndClose}
        onDiscardAll={handleDiscardAndClose}
        onCancel={() => {
          setShowCloseWorkspaceDialog(false)
          pendingProjectPathRef.current = null
        }}
        theme={theme}
      />

      <FileChangesModal
        isOpen={activeModal === 'fileChanges'}
        modifiedFiles={modifiedFiles}
        onReloadAll={handleReloadAllFiles}
        onReloadFile={handleReloadSingleFile}
        onKeepAll={handleKeepCurrentVersions}
        onClose={handleCloseFileChangesModal}
        theme={theme}
      />

      <LocalStorageModal
        isOpen={activeModal === 'localStorage'}
        onClose={closeModal}
        onOpenProject={handleOpenFromStorage}
        onUploadToCloud={handleUploadToCloud}
        theme={theme}
      />

      <PublishModal
        isOpen={activeModal === 'publish'}
        onClose={() => {
          closeModal()
          setPublishInitialManifest(undefined)
        }}
        workspaceHandle={explorerDirHandle}
        workspaceFiles={explorerEntries}
        getToken={getToken}
        theme={theme}
        initialManifest={publishInitialManifest}
        onFilesSaved={checkForModifiedFiles}
      />

      <PublishResourceModal
        isOpen={activeModal === 'publish-resource'}
        onClose={() => {
          closeModal()
          setPublishResource(null)
        }}
        resource={publishResource?.resource ?? null}
        manifest={publishResource?.manifest ?? null}
        getToken={getToken}
        theme={theme}
        onOpenSettings={() => {
          closeModal()
          setPublishResource(null)
          openSettingsModal('registries')
        }}
      />

      <NewFileDialog
        isOpen={showNewFileDialog}
        onClose={() => setShowNewFileDialog(false)}
        onSubmit={async (fileName, content, options) => {
          setShowNewFileDialog(false)
          const openBrainstorm = options?.brainstorm
          const electronPath = (explorerDirHandle as unknown as Record<string, unknown>)?._electronPath as string | undefined
          const electronAPI = (window as unknown as Record<string, unknown>).electronAPI as Record<string, unknown> | undefined
          if (electronPath && electronAPI?.writeFile) {
            // Workspace is open — write to disk and open
            const fullPath = `${electronPath}/${fileName}`.replace(/\\/g, '/')
            const writeFile = electronAPI.writeFile as (path: string, content: string) => Promise<{ success: boolean; error?: string }>
            const result = await writeFile(fullPath, content)
            if (result.success) {
              onOpenFile({ name: fileName, text: content, electronPath: fullPath })
              // Open brainstorm chat after tab is created
              if (openBrainstorm) {
                setTimeout(() => {
                  const { tabs } = useEditorStore.getState()
                  const newTab = tabs.find(t => t.name === fileName || t.filePath?.endsWith(fileName))
                  if (newTab) {
                    updateTab(newTab.id, {
                      showChat: true,
                      chatConfig: { mode: 'brainstorm', contextFile: newTab.id }
                    })
                    chatMountedTabsRef.current.add(newTab.id)
                  }
                }, 100)
              }
            }
          } else {
            // No workspace — create unsaved tab
            const viewMode = fileName.endsWith('.prmd') || fileName.endsWith('.pdflow') || fileName === 'prompd.json'
              ? 'design' as const
              : 'code' as const
            const tabId = 'new-' + Date.now()
            addTab({
              id: tabId,
              name: fileName,
              text: content,
              dirty: true,
              viewMode,
              ...(openBrainstorm ? {
                showChat: true,
                chatConfig: { mode: 'brainstorm', contextFile: tabId }
              } : {})
            })
            if (openBrainstorm) {
              chatMountedTabsRef.current.add(tabId)
            }
          }
        }}
      />

      <NewProjectModal
        isOpen={activeModal === 'newProject'}
        onClose={closeModal}
        onProjectCreated={(projectPath) => {
          closeModal()
          // Check for unsaved files in current workspace
          const dirtyTabs = tabs.filter(t => t.dirty && t.type !== 'chat' && t.type !== 'execution' && t.type !== 'brainstorm')
          if (explorerDirPath && dirtyTabs.length > 0) {
            // Defer opening until save/discard dialog completes
            pendingProjectPathRef.current = projectPath
            setShowCloseWorkspaceDialog(true)
          } else {
            // No unsaved files or no workspace — close and open immediately
            if (explorerDirPath) closeWorkspace()
            openProjectAsWorkspace(projectPath)
          }
        }}
      />

      <SettingsModal
        isOpen={activeModal === 'settings'}
        onClose={closeModal}
        theme={theme}
        onProvidersChanged={() => refreshLLMProviders(getToken)}
        initialTab={settingsInitialTab}
      />

      <AboutModal
        isOpen={activeModal === 'about'}
        onClose={closeModal}
        theme={theme}
      />

      <DeployWorkflowModal
        open={activeModal === 'deploy-workflow'}
        onClose={closeModal}
        workflow={(() => {
          const activeTab = tabs.find(t => t.id === activeTabId)
          if (!activeTab || !activeTab.name.toLowerCase().endsWith('.pdflow')) return null
          try {
            const parsed = JSON.parse(activeTab.text || '{}')
            console.log('[App.tsx] Parsed workflow for deployment:', {
              hasMetadata: !!parsed.metadata,
              metadataName: parsed.metadata?.name,
              version: parsed.version,
              workflowPath: activeTab?.filePath
            })
            return parsed
          } catch (err) {
            console.error('[App.tsx] Failed to parse workflow:', err)
            return null
          }
        })()}
        workflowPath={(() => {
          const activeTab = tabs.find(t => t.id === activeTabId)
          // Use absolute filePath if available, fallback to name
          return activeTab?.filePath || activeTab?.name || null
        })()}
      />

      <DeploymentModal
        open={activeModal === 'deployment'}
        onClose={closeModal}
      />

      {/* First-Time Setup Wizard */}
      <FirstTimeSetupWizard
        isOpen={showFirstTimeWizard}
        onClose={() => {
          setShowFirstTimeWizard(false)
          // Wizard's handleClose already called markOnboardingComplete(), so set to true
          setOnboardingComplete(true)
        }}
        onComplete={handleFirstTimeWizardComplete}
        theme={theme}
      />

      {/* Inline Hints - Progressive tips shown after onboarding */}
      {/* On WelcomeView (no tabs) or wizard mode: show wizard hints to guide "New Prompd" flow */}
      {/* With open tabs and not in wizard: show non-wizard hints (editor, execution, etc.) */}
      {!showFirstTimeWizard && onboardingComplete && (
        <InlineHints
          theme={theme}
          floating
          category={(!hasOpenTab || mode === 'wizard') ? 'wizard' : undefined}
          excludeCategory={(!hasOpenTab || mode === 'wizard') ? undefined : 'wizard'}
        />
      )}

      {/* Save Filename Dialog */}
      {saveFilenameDialog?.show && (
        <SaveFilenameDialog
          defaultName={saveFilenameDialog.defaultName}
          onConfirm={saveFilenameDialog.onConfirm}
          onCancel={() => setSaveFilenameDialog(null)}
          theme={theme === 'dark' ? 'vs-dark' : 'light'}
        />
      )}

      {/* Prompt Preview Modal */}
      {generatedPrompd && (
        <PrompdPreviewModal
          isOpen={showPrompdPreview}
          content={generatedPrompd.content}
          filename={generatedPrompd.filename}
          metadata={generatedPrompd.metadata}
          onAccept={handleAcceptPrompdPreview}
          onDecline={handleDeclinePrompdPreview}
          onRetry={handleRetryPrompdPreview}
          onClose={() => setShowPrompdPreview(false)}
          theme={theme}
        />
      )}

      {/* Local Package Modal */}
      {localPackageInfo && (
        <LocalPackageModal
          packageInfo={localPackageInfo}
          onClose={() => setLocalPackageInfo(null)}
          onOpenInEditor={handleLocalPackageOpenInEditor}
          onUseAsTemplate={handleLocalPackageUseAsTemplate}
        />
      )}

      {/* Registry Package Details Modal (from AI Explore mode) */}
      {selectedRegistryPackage && (
        <PackageDetailsModal
          package={selectedRegistryPackage}
          onClose={() => setSelectedRegistryPackage(null)}
          onOpenInEditor={onOpenPackageFile}
          onUseAsTemplate={onUsePackageAsTemplate}
        />
      )}

      {/* Execution Result Modal */}
      {showExecutionModal && prompdSessionHistory.length > 0 && (
        <ExecutionResultModal
          result={{
            content: prompdSessionHistory[selectedExecutionIndex]?.response || prompdSessionHistory[selectedExecutionIndex]?.error || '',
            status: prompdSessionHistory[selectedExecutionIndex]?.success ? 'success' : 'error',
            timestamp: new Date(prompdSessionHistory[selectedExecutionIndex]?.timestamp).toISOString(),
            compiledPrompt: prompdSessionHistory[selectedExecutionIndex]?.compiledPrompt || '',
            metadata: {
              provider: prompdSessionHistory[selectedExecutionIndex]?.provider || '',
              model: prompdSessionHistory[selectedExecutionIndex]?.model || '',
              duration: prompdSessionHistory[selectedExecutionIndex]?.duration || 0,
              tokensUsed: {
                input: prompdSessionHistory[selectedExecutionIndex]?.promptTokens || 0,
                output: prompdSessionHistory[selectedExecutionIndex]?.completionTokens || 0,
                total: prompdSessionHistory[selectedExecutionIndex]?.totalTokens || 0
              }
            }
          }}
          executionHistory={prompdSessionHistory.map(exec => ({
            content: exec.response || exec.error || '',
            status: exec.success ? 'success' : 'error',
            timestamp: new Date(exec.timestamp).toISOString(),
            compiledPrompt: exec.compiledPrompt,
            metadata: {
              provider: exec.provider,
              model: exec.model,
              duration: exec.duration,
              tokensUsed: {
                input: exec.promptTokens,
                output: exec.completionTokens,
                total: exec.totalTokens
              }
            }
          }))}
          selectedIndex={selectedExecutionIndex}
          onSelectIndex={setSelectedExecutionIndex}
          theme={theme === 'dark' ? 'vs-dark' : 'light'}
          onClose={() => setShowExecutionModal(false)}
          onRunAgain={() => {
            setShowExecutionModal(false)
            handleExecuteFromPreview()
          }}
        />
      )}

      {/* Help Chat Popover */}
      <HelpChatPopover
        isOpen={helpChatOpen && helpChatEnabled}
        onClose={() => setHelpChatOpen(false)}
      />

      {/* Toast Notifications */}
      <ToastContainer />

      {/* Bottom Panel Tabs (Output + Execution) */}
      <BottomPanelTabs
        onOpenFile={handleOpenBuildErrorFile}
        prompdExecutions={prompdSessionHistory}
        onViewExecution={handleViewExecution}
        workflowResult={executionResult}
        checkpoints={checkpoints}
        promptsSent={promptsSent}
      />

      {/* Command Palette */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => { setShowCommandPalette(false); setCommandPaletteInitialQuery('') }}
        workspacePath={explorerDirPath}
        onShowNotification={aiShowNotification}
        initialQuery={commandPaletteInitialQuery}
      />
    </div>
  )
}

// Simple filename dialog component
function SaveFilenameDialog({
  defaultName,
  onConfirm,
  onCancel,
  theme
}: {
  defaultName: string
  onConfirm: (filename: string) => void
  onCancel: () => void
  theme: 'vs-dark' | 'light'
}) {
  const [filename, setFilename] = useState(defaultName)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (filename.trim()) {
      onConfirm(filename.trim())
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)'
      }}
      onClick={onCancel}
    >
      <div
        style={{
          maxWidth: '500px',
          width: '100%',
          background: theme === 'vs-dark' ? '#0f172a' : '#ffffff',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{
          margin: '0 0 16px 0',
          fontSize: '18px',
          fontWeight: 600,
          color: 'var(--text)'
        }}>
          Save Prompd File
        </h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              marginBottom: '8px'
            }}>
              Filename (without extension)
            </label>
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              autoFocus
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: '14px',
                background: 'var(--panel)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                outline: 'none'
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--accent)'
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--border)'
              }}
            />
            <div style={{
              fontSize: '12px',
              color: 'var(--text-secondary)',
              marginTop: '6px'
            }}>
              Will be saved as: <span style={{ fontFamily: 'monospace', color: 'var(--text)' }}>
                {filename.trim().endsWith('.prmd') ? filename.trim() : `${filename.trim()}.prmd`}
              </span>
            </div>
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px'
          }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                fontWeight: 500,
                background: 'var(--panel)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--panel-3)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--panel)'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!filename.trim()}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                fontWeight: 500,
                background: filename.trim() ? 'var(--accent)' : 'var(--panel)',
                color: filename.trim() ? 'white' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '6px',
                cursor: filename.trim() ? 'pointer' : 'not-allowed',
                transition: 'all 0.15s',
                opacity: filename.trim() ? 1 : 0.5
              }}
              onMouseEnter={(e) => {
                if (filename.trim()) {
                  e.currentTarget.style.filter = 'brightness(1.1)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = 'none'
              }}
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

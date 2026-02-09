import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAuthenticatedUser } from '../auth/ClerkWrapper'
import {
  PrompdProvider,
  PrompdChat,
  PrompdPackageSelector,
  usePrompdUsage,
  type PrompdPackageMetadata,
  type PrompdPackageRecommendation,
  type PrompdChatHandle,
  type PrompdChatMessage,
  getChatModesArray
} from '@prompd/react'
import { LLMClientRouter } from '../services/llmClientRouter'
import '@prompd/react/dist/style.css' // Import styles explicitly
import { PrompdEditorIntegration } from '../integrations/PrompdEditorIntegration'
import { registryApi } from '../services/registryApi'
import { conversationStorage, type Conversation, type ConversationMessage, type AgentPermissionLevel } from '../services/conversationStorage'
import { ConversationSidebar } from '../components/ConversationSidebar'
import { MessageSquare, ExternalLink, Plus, MoreVertical, ChevronDown, Loader2, Zap, ShieldCheck, ClipboardList, MessageCircle, Undo2, Redo2, Play } from 'lucide-react'
import { SidebarPanelHeader } from '../components/SidebarPanelHeader'
import { PrompdIcon } from '../components/PrompdIcon'
import { fetchChatModes, chatModesToArray, type ChatModeConfig } from '../services/chatModesApi'
import { getBackendHost } from '../services/apiConfig'
import { useUIStore } from '../../stores/uiStore'
import { useEditorStore, selectActiveTab } from '../../stores/editorStore'
import {
  applyEdit,
  prepareNewFile,
  extractSearchKeywords,
  type Suggestion
} from '../services/editorService'
import { PlanApprovalDialog } from '../components/PlanApprovalDialog'
import PlanReviewModal from '../components/PlanReviewModal'
import { SlashCommandMenu, useSlashCommands, type SlashCommand } from '../components/SlashCommandMenu'
import { buildFileContextMessages } from '../services/fileContextBuilder'
import { executeSlashCommand, SLASH_COMMANDS } from '../services/slashCommands'
import { prompdSettings } from '../services/prompdSettings'
import { useAgentMode } from '../hooks/useAgentMode'
import { undoStack } from '../services/toolExecutor'

// Pending edit state for diff view
interface PendingEdit {
  suggestion: Suggestion
  originalText: string
  proposedText: string
  lineNumbers?: [number, number]
  language?: string
}

// Fallback system prompt - only used when backend mode configs haven't loaded yet
// Each mode has its own complete system prompt in backend/src/prompts/modes/*.json
const EDITOR_SYSTEM_PROMPT = `You are an AI assistant specialized in helping users with .prmd prompt files.

Please wait a moment while the mode configuration loads. If you're seeing this message, try refreshing the page or check the backend connection.

## .prmd File Structure
\`\`\`yaml
---
id: kebab-case-id
name: "Human Readable Name"
description: "One-sentence description"
version: 1.0.0
parameters:
  - name: parameter_name
    type: string
    required: true
    description: "What this parameter does"
---

# Title

## Instructions
Your instructions here
\`\`\`

Help the user create or modify .prmd files as needed.`

// Suggestion interface is now imported from editorService.ts

// Pending edit type for inline diff in editor
interface EditorPendingEdit {
  content: string
  lineNumbers: [number, number]
  language?: string
}

interface AiChatPanelProps {
  onPrompdGenerated: (prompd: string, filename: string, metadata?: any) => void
  getText: () => string
  setText: (text: string) => void
  getActiveTabName: () => string | null
  showNotification: (message: string, type?: 'info' | 'warning' | 'error') => void
  onPackageSelected?: (packageName: string, prompdFile?: string) => void  // Callback when package is selected from AI suggestions
  onOpenChatInTab?: (mode: string, conversationId?: string, contextFile?: string | null) => void  // Open chat in a new tab
  onClose?: () => void  // Close/collapse the panel
  retryTrigger?: number  // Increment to trigger regeneration
  cursorPosition?: { line: number; column: number }  // Current cursor position in editor
  onSetPendingEdit?: (edit: EditorPendingEdit | null) => void  // Set pending edit for inline diff in editor
  workspacePath?: string | null  // Workspace path for tool execution (Electron)
  onFileWritten?: (path: string, content: string) => void  // Callback when agent writes a file (to update tabs)
  onAutoSave?: () => Promise<void>  // Callback to auto-save before tool approval
  onRegisterStop?: (stopFn: (() => void) | null) => void  // Register stop function for menu integration
}

export default function AiChatPanel({
  onPrompdGenerated,
  getText,
  setText,
  getActiveTabName,
  showNotification,
  onPackageSelected,
  onOpenChatInTab,
  onClose,
  retryTrigger,
  cursorPosition,
  onSetPendingEdit,
  workspacePath,
  onFileWritten,
  onAutoSave,
  onRegisterStop
}: AiChatPanelProps) {
  const { getToken, isLoaded, isAuthenticated } = useAuthenticatedUser()
  const { trackUsage } = usePrompdUsage()

  // Centralized LLM provider state
  const { llmProvider, setLLMProvider, setLLMModel, initializeLLMProviders } = useUIStore(
    useShallow(state => ({
      llmProvider: state.llmProvider,
      setLLMProvider: state.setLLMProvider,
      setLLMModel: state.setLLMModel,
      initializeLLMProviders: state.initializeLLMProviders
    }))
  )

  // Track active tab from store - triggers re-render when tab changes
  // This ensures editorLLMClient and emptyStateContent update with current file context
  const activeTab = useEditorStore(selectActiveTab)
  const activeTabId = useEditorStore(state => state.activeTabId)
  const activeTabName = activeTab?.name || null

  // Chat modes state (loaded from backend)
  const [chatModes, setChatModes] = useState<Record<string, ChatModeConfig> | null>(null)
  const chatModesRef = useRef<Record<string, ChatModeConfig> | null>(null)
  const [modeConfigsArray, setModeConfigsArray] = useState<Array<{ id: string; label: string; icon: string; description: string }>>([])
  const [modesLoading, setModesLoading] = useState(true)

  // Cursor position ref to avoid stale closures in useMemo
  const cursorPositionRef = useRef(cursorPosition)

  // Mode and conversation state - permission level drives chatMode
  const [permissionLevel, setPermissionLevel] = useState<AgentPermissionLevel>('confirm')
  // Plan permission activates planner mode; Auto/Confirm use agent mode
  const chatMode = permissionLevel === 'plan' ? 'planner' : 'agent'
  const permissionLevelRef = useRef<AgentPermissionLevel>('confirm')
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null)
  const currentConversationRef = useRef<Conversation | null>(null)

  // Keep ref in sync with state to avoid stale closures in callbacks
  useEffect(() => {
    currentConversationRef.current = currentConversation
  }, [currentConversation])

  // Agent mode hook - shared with ChatTab
  const [agentState, agentActions] = useAgentMode({
    workspacePath,
    permissionLevel,
    chatModes,
    chatMode,
    getToken,
    trackUsage: (type, provider, model, promptTokens, completionTokens, metadata) => {
      trackUsage(type, provider, model, promptTokens, completionTokens, metadata)
    },
    showNotification,
    onFileWritten,
    onToolMessage: (msg) => {
      // Persist tool execution messages to conversation storage
      setCurrentConversation(prev => {
        if (!prev) return null
        const toolMsg: ConversationMessage = {
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          metadata: msg.metadata
        }
        // Replace if exists (update), otherwise append
        const existingIdx = prev.messages.findIndex(m => m.id === msg.id)
        const updatedMessages = existingIdx >= 0
          ? prev.messages.map((m, i) => i === existingIdx ? toolMsg : m)
          : [...prev.messages, toolMsg]
        const updated = { ...prev, messages: updatedMessages, updatedAt: new Date().toISOString() }
        conversationStorage.save(updated).catch(err => console.error('[AiChatPanel] Failed to save tool message:', err))
        return updated
      })
    }
  })

  const [showConversationSidebar, setShowConversationSidebar] = useState(false)
  const [conversationList, setConversationList] = useState<typeof conversationStorage extends { list: () => infer R } ? R : never>([])

  // Register stop function for menu integration (Shift+F5)
  useEffect(() => {
    if (agentState.isAgentLoopActive && onRegisterStop) {
      onRegisterStop(() => agentActions.stop())
      const electronAPI = (window as any).electronAPI
      electronAPI?.updateMenuState?.({ isExecutionActive: true })
    } else if (!agentState.isAgentLoopActive && onRegisterStop) {
      onRegisterStop(null)
      const electronAPI = (window as any).electronAPI
      electronAPI?.updateMenuState?.({ isExecutionActive: false })
    }
  }, [agentState.isAgentLoopActive, onRegisterStop, agentActions])

  // Undo/Redo state
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  // Subscribe to undo/redo stack changes
  useEffect(() => {
    // Initial state
    setCanUndo(undoStack.canUndo())
    setCanRedo(undoStack.canRedo())
    // Subscribe to changes
    const unsubscribe = undoStack.subscribe(() => {
      setCanUndo(undoStack.canUndo())
      setCanRedo(undoStack.canRedo())
    })
    return unsubscribe
  }, [])

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Z or Cmd+Z for undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (canUndo) {
          e.preventDefault()
          agentActions.undo().then((result) => {
            if (result.success) {
              showNotification(result.message, 'info')
            } else {
              showNotification(result.message, 'error')
            }
          })
        }
      }
      // Ctrl+Y or Cmd+Y for redo
      else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        if (canRedo) {
          e.preventDefault()
          const toolExecutor = agentActions.getToolExecutor()
          if (toolExecutor) {
            toolExecutor.redo().then((result) => {
              if (result.success) {
                showNotification('Redone', 'info')
                // Update editor with redone content
                const output = result.output as { path?: string; content?: string } | undefined
                if (output?.path && output?.content !== undefined && onFileWritten) {
                  onFileWritten(output.path, output.content)
                }
              } else {
                showNotification(result.error || 'Redo failed', 'error')
              }
            })
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canUndo, canRedo, agentActions, showNotification])

  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [showPermissionMenu, setShowPermissionMenu] = useState(false)

  // Chat input state - controlled here to preserve input across mode changes
  const [chatInputValue, setChatInputValue] = useState('')

  // Slash command menu state
  const slashCommands = useSlashCommands(chatInputValue)

  // Handle slash command selection
  const handleSlashCommandSelect = useCallback(async (command: SlashCommand) => {
    console.log('[AiChatPanel] Slash command selected:', command.id)

    // Close the menu
    slashCommands.close()

    // Parse any arguments from the input (text after the command name)
    const inputAfterCommand = chatInputValue.slice(1 + command.name.length).trim()

    // If command requires args and none provided, insert command into input for user to complete
    if (command.args && !inputAfterCommand) {
      setChatInputValue(`/${command.name} `)
      // Focus the input so user can type the arguments
      setTimeout(() => {
        chatRef.current?.focusInput()
      }, 50)
      return
    }

    // Clear the input
    setChatInputValue('')

    // Execute the command
    const result = await executeSlashCommand(command.id, inputAfterCommand, {
      fileContent: getText(),
      fileName: getActiveTabName() || undefined,
      workspacePath: workspacePath || undefined,
      registryUrl: prompdSettings.getRegistryUrl(),
      getToken: async () => {
        const token = await getToken()
        return token || ''
      }
    })

    // Display result in chat
    if (chatRef.current) {
      // Add a system message showing the command result
      chatRef.current.addMessage({
        id: `slash-cmd-${Date.now()}`,
        role: 'system',
        content: result.success ? result.output : `**Error:** ${result.error}`,
        timestamp: new Date().toISOString(),
        metadata: {
          type: 'slash-command',
          command: command.id,
          success: result.success
        }
      })
    }

    if (!result.success) {
      showNotification(result.error || 'Command failed', 'error')
    }
  }, [chatInputValue, slashCommands, getText, getActiveTabName, workspacePath, getToken, showNotification])

  // Debounce timer for auto-save
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Load chat modes from backend on mount
  useEffect(() => {
    setModesLoading(true)
    fetchChatModes()
      .then(response => {
        setChatModes(response.modes)
        chatModesRef.current = response.modes
        setModeConfigsArray(chatModesToArray(response.modes))
        console.log('Chat modes loaded from backend:', response.version, Object.keys(response.modes))
      })
      .catch(error => {
        console.error('Failed to load chat modes:', error)
        // Fallback to @prompd/react constants if backend fails
        setModeConfigsArray(getChatModesArray())
      })
      .finally(() => {
        setModesLoading(false)
        console.log('[AiChatPanel] Modes loading complete')
      })
  }, [])

  // Package suggestions state
  const [packageRecommendations, setPackageRecommendations] = useState<PrompdPackageRecommendation[]>([])
  const [showPackageSelector, setShowPackageSelector] = useState(false)
  const [selectedPackage, setSelectedPackage] = useState<PrompdPackageMetadata | undefined>()
  const [showNoResultsPrompt, setShowNoResultsPrompt] = useState(false)
  const [triggerAutoGenerate, setTriggerAutoGenerate] = useState(false)

  // Pending edit state for diff view (instead of auto-applying)
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null)

  // Update cursor position ref whenever prop changes
  useEffect(() => {
    cursorPositionRef.current = cursorPosition
  }, [cursorPosition])

  // Update permission level ref whenever state changes
  useEffect(() => {
    permissionLevelRef.current = permissionLevel
    console.log('[AiChatPanel] permissionLevelRef updated to:', permissionLevel)
  }, [permissionLevel])

  // Create a ref to programmatically trigger message send via PrompdChat imperative handle
  const chatRef = useRef<PrompdChatHandle>(null)

  useEffect(() => {
    if (triggerAutoGenerate) {
      console.log('Auto-generating custom prompt (no packages found)')

      // Use the imperative handle to send message programmatically
      const timer = setTimeout(() => {
        if (chatRef.current) {
          console.log('Sending auto-generate message via ref')
          chatRef.current.sendMessage("No packages were found. Please generate a custom .prmd file for me.")
          setTriggerAutoGenerate(false)
        } else {
          console.warn('Chat ref not available for auto-generate')
          setTriggerAutoGenerate(false)
        }
      }, 300)

      return () => clearTimeout(timer)
    }
  }, [triggerAutoGenerate])

  // Handle retry trigger from preview modal
  useEffect(() => {
    if (retryTrigger && retryTrigger > 0) {
      console.log('Retry triggered, sending regeneration request')

      // Use the imperative handle to send retry message programmatically
      const timer = setTimeout(() => {
        if (chatRef.current) {
          console.log('Sending retry message via ref')
          chatRef.current.sendMessage("Please regenerate the .prmd file with a different approach. Try to improve upon the previous attempt.")
        } else {
          console.warn('Chat ref not available for retry')
        }
      }, 300)

      return () => clearTimeout(timer)
    }
  }, [retryTrigger])

  // Sync theme with editor's theme
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'dark'
  })

  // Initialize LLM providers on mount (uses centralized store)
  useEffect(() => {
    if (!isLoaded || !isAuthenticated) {
      console.log('Waiting for authentication...', { isLoaded, isAuthenticated })
      return
    }

    // Only initialize if not already initialized
    if (!llmProvider.isInitialized) {
      console.log('Loading providers with centralized store...')
      initializeLLMProviders(getToken)
    }
  }, [isLoaded, isAuthenticated, llmProvider.isInitialized])

  useEffect(() => {
    // Watch for theme changes
    const observer = new MutationObserver(() => {
      const currentTheme = (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'dark'
      setTheme(currentTheme)
    })

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    })

    return () => observer.disconnect()
  }, [])

  // Load conversation list on mount
  useEffect(() => {
    setConversationList(conversationStorage.list())
  }, [])

  // Create new conversation when permission level changes or no conversation exists
  useEffect(() => {
    if (!currentConversation) {
      const newConv = conversationStorage.createConversation(permissionLevel)
      setCurrentConversation(newConv)
    }
  }, [permissionLevel])

  // Flush pending save immediately (used before opening in new tab)
  // Messages are now saved immediately using functional updates, but we keep this
  // to ensure the latest state is persisted before opening in a new tab
  const flushSave = useCallback(async () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }
    if (currentConversation) {
      await conversationStorage.save(currentConversation)
      setConversationList(conversationStorage.list())
    }
  }, [currentConversation])

  // Conversation management functions
  const handleNewConversation = useCallback(() => {
    const newConv = conversationStorage.createConversation(permissionLevel)
    setCurrentConversation(newConv)
    setConversationList(conversationStorage.list())
    // Clear the chat UI via imperative handle
    if (chatRef.current) {
      chatRef.current.clearMessages()
    }
    console.log('Created new conversation:', newConv.id)
  }, [permissionLevel])

  const handleSelectConversation = useCallback(async (id: string) => {
    const conv = await conversationStorage.load(id)
    if (conv) {
      console.log('Loading conversation:', conv.id, 'with', conv.messages.length, 'messages')
      setCurrentConversation(conv)
      // Restore permission level from conversation if available
      if (conv.permissionLevel) {
        setPermissionLevel(conv.permissionLevel)
      }
    }
  }, [])

  const handleDeleteConversation = useCallback(async (id: string) => {
    await conversationStorage.delete(id)
    setConversationList(conversationStorage.list())

    // If deleted current conversation, create new one
    if (currentConversation?.id === id) {
      handleNewConversation()
    }
  }, [currentConversation, handleNewConversation])

  const handleRenameConversation = useCallback(async (id: string, newTitle: string) => {
    await conversationStorage.rename(id, newTitle)
    setConversationList(conversationStorage.list())

    // Update current conversation if it's the one being renamed
    if (currentConversation?.id === id) {
      setCurrentConversation({ ...currentConversation, title: newTitle })
    }
  }, [currentConversation])

  const handlePinConversation = useCallback(async (id: string, isPinned: boolean) => {
    await conversationStorage.pin(id, isPinned)
    setConversationList(conversationStorage.list())
  }, [])

  const handleOpenInTab = useCallback(async () => {
    if (onOpenChatInTab) {
      // Flush any pending conversation saves before opening in tab
      await flushSave()
      const activeTab = getActiveTabName()
      onOpenChatInTab(chatMode, currentConversation?.id, activeTab || null)
    }
  }, [onOpenChatInTab, chatMode, currentConversation, getActiveTabName, flushSave])

  const handleExportConversation = useCallback(async (id: string, format: 'json' | 'markdown') => {
    const exported = await conversationStorage.export(id, format)
    const blob = new Blob([exported], { type: format === 'json' ? 'application/json' : 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `conversation-${id}.${format === 'json' ? 'json' : 'md'}`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  // Handle search_registry tool call from agent - opens package modal with results
  const handleSearchRegistry = useCallback(async (query: string) => {
    console.log('[AiChatPanel] Searching registry for:', query)
    try {
      const results = await registryApi.searchPackages(query)
      if (results.packages && results.packages.length > 0) {
        const recommendations: PrompdPackageRecommendation[] = results.packages.slice(0, 5).map((pkg, index) => ({
          package: {
            name: pkg.name,
            version: pkg.version,
            description: pkg.description,
            tags: pkg.keywords || [],
            downloads: pkg.downloads,
            rating: 0
          },
          score: 100 - (index * 5),
          reason: `Search result for: ${query}`
        }))
        setPackageRecommendations(recommendations)
        setShowPackageSelector(true)
        showNotification(`Found ${results.packages.length} package(s)`, 'info')
      } else {
        showNotification('No packages found', 'info')
      }
    } catch (error) {
      console.error('[AiChatPanel] Registry search failed:', error)
      showNotification('Failed to search registry', 'error')
    }
  }, [showNotification])

  // Handle accepting a pending edit
  // Note: The actual edit is applied by PrompdEditor using Monaco's executeEdits
  // for proper undo/redo support. This handler just clears the state.
  const handleAcceptEdit = useCallback(() => {
    if (!pendingEdit) return

    console.log('Edit accepted - applied via Monaco executeEdits for undo support')
    showNotification('Changes applied (Ctrl+Z to undo)', 'info')

    setPendingEdit(null)
    // Also clear editor's inline diff
    if (onSetPendingEdit) {
      onSetPendingEdit(null)
    }
  }, [pendingEdit, showNotification, onSetPendingEdit])

  // Handle declining a pending edit
  const handleDeclineEdit = useCallback(() => {
    console.log('Edit declined by user')
    showNotification('Changes declined', 'info')
    setPendingEdit(null)
    // Also clear editor's inline diff
    if (onSetPendingEdit) {
      onSetPendingEdit(null)
    }
  }, [showNotification, onSetPendingEdit])

  // Convert conversation messages to PrompdChatMessage format for initialMessages prop
  const initialMessages = useMemo(() => {
    if (!currentConversation?.messages || currentConversation.messages.length === 0) {
      return undefined
    }

    // Map ConversationMessage to PrompdChatMessage format
    return currentConversation.messages.map(msg => ({
      id: msg.id,
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
      timestamp: msg.timestamp,
      metadata: msg.metadata
    }))
  }, [currentConversation?.id, currentConversation?.messages])

  // Create editor integration instance (memoized to prevent recreation)
  // Include activeTabId to recreate when tab changes (ensures fresh file context)
  const editorIntegration = useMemo(() => {
    return new PrompdEditorIntegration(
      getText,
      setText,
      getActiveTabName,
      showNotification
    )
  }, [getText, setText, getActiveTabName, showNotification, activeTabId])

  // Create LLM client with agent functionality (using shared useAgentChat hook)
  // Uses LLMClientRouter to route between local and remote execution
  const editorLLMClient = useMemo(() => {
    const baseClient = new LLMClientRouter({
      provider: llmProvider.provider,
      model: llmProvider.model,
      getAuthToken: async () => {
        try {
          return await getToken()
        } catch (error) {
          console.error('Failed to get auth token:', error)
          return null
        }
      }
    })

    // Build context messages for current file using shared utility
    let contextMessages: Array<{ role: 'system'; content: string }> = []

    const currentFile = getText()
    const fileName = getActiveTabName()

    if (currentFile && typeof currentFile === 'string') {
      contextMessages = buildFileContextMessages({
        fileName,
        content: currentFile,
        cursorPosition: cursorPositionRef.current
      })
    }

    // Use the shared agent LLM client wrapper
    return agentActions.createAgentLLMClient(baseClient, chatRef, contextMessages)
  // Include activeTabId to trigger rebuild when active tab changes
  }, [llmProvider.provider, llmProvider.model, getToken, getText, getActiveTabName, agentActions, activeTabId])

  // Custom empty state content - unified agent mode
  const emptyStateContent = useMemo(() => {
    const currentFileName = getActiveTabName()
    const hasOpenFile = currentFileName && currentFileName.length > 0

    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4">
        <div className="mb-6">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 animate-gradient-shift flex items-center justify-center">
            <PrompdIcon size={40} />
          </div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--prompd-text)' }}>
            Prompd Agent
          </h2>
          <p className="max-w-md mx-auto mb-4" style={{ color: 'var(--prompd-muted)' }}>
            {hasOpenFile
              ? `Working with ${currentFileName}`
              : 'Ask me to create, edit, search, or explore packages'
            }
          </p>
          <div className="flex gap-2 justify-center flex-wrap" style={{ maxWidth: '300px', margin: '0 auto' }}>
            {['Create prompts', 'Edit files', 'Search registry', 'Run commands'].map((action) => (
              <span
                key={action}
                style={{
                  padding: '4px 10px',
                  background: 'var(--prompd-panel)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  fontSize: '12px',
                  color: 'var(--text-muted)'
                }}
              >
                {action}
              </span>
            ))}
          </div>
        </div>
      </div>
    )
  // Include activeTabName to update when active tab changes
  }, [getActiveTabName, activeTabName])

  // Handle generated prompts
  const handlePrompdGenerated = (prompd: string, turnMetadata?: any) => {
    // Generate filename from YAML frontmatter (prioritize 'id' field, then 'name')
    let filename = 'untitled.prmd'

    // Try to extract id from YAML frontmatter (preferred)
    const idMatch = prompd.match(/^id:\s*(.+)$/m)
    if (idMatch) {
      filename = idMatch[1].trim() + '.prmd'
    } else {
      // Fallback to name field
      const nameMatch = prompd.match(/^name:\s*["']?(.+?)["']?$/m)
      if (nameMatch) {
        filename = nameMatch[1].trim().toLowerCase().replace(/\s+/g, '-') + '.prmd'
      } else {
        // Last resort: use first content line
        const lines = prompd.split('\n')
        const firstContent = lines.find(l => l.trim() && !l.startsWith('---'))
        if (firstContent) {
          filename = firstContent
            .trim()
            .slice(0, 30)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') + '.prmd'
        }
      }
    }

    const metadata = {
      source: 'ai-chat',
      provider: llmProvider.provider,
      model: llmProvider.model,
      conversationId: turnMetadata?.conversationId,
      turnNumber: turnMetadata?.turnNumber,
      generatedAt: new Date().toISOString()
    }

    // Call with correct signature: (prompd, filename, metadata)
    onPrompdGenerated(prompd, filename, metadata)
  }

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'var(--sidebar-bg)',
      borderRight: '1px solid var(--border)',
      overflow: 'hidden',
      position: 'relative'
    }}>
      {/* Conversation History Sidebar */}
      <ConversationSidebar
        conversations={conversationList}
        currentConversationId={currentConversation?.id || null}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        onRenameConversation={handleRenameConversation}
        onPinConversation={handlePinConversation}
        onExportConversation={handleExportConversation}
        isOpen={showConversationSidebar}
        onClose={() => setShowConversationSidebar(false)}
      />

      {/* Plan Approval Dialog */}
      {agentState.pendingPlanApproval && (
        <PlanApprovalDialog
          toolCalls={agentState.pendingPlanApproval.toolCalls}
          agentMessage={agentState.pendingPlanApproval.agentMessage}
          onApprove={async (filteredToolCalls) => {
            // Auto-save before approving tool calls
            if (onAutoSave) {
              try {
                await onAutoSave()
              } catch (err) {
                console.warn('[AiChatPanel] Auto-save failed before approval:', err)
              }
            }
            agentState.pendingPlanApproval?.resolve(true, undefined, filteredToolCalls)
          }}
          onReject={(reason) => agentState.pendingPlanApproval?.resolve(false, reason)}
          workspacePath={workspacePath}
          theme={theme}
        />
      )}

      {/* Plan Review Modal (present_plan tool) */}
      {agentState.pendingPlanReview && (
        <PlanReviewModal
          content={agentState.pendingPlanReview.content}
          onRefine={(feedback) => agentState.pendingPlanReview?.resolve({ action: 'refine', feedback })}
          onApply={(mode) => agentState.pendingPlanReview?.resolve({ action: 'apply', mode })}
          onCancel={() => agentActions.cancelPlanReview()}
        />
      )}

      {/* Agent Running Indicator */}
      {agentState.isAgentLoopActive && (
        <div style={{
          position: 'absolute',
          top: '50px',
          right: '12px',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          background: 'var(--prompd-accent, #6366f1)',
          borderRadius: '12px',
          fontSize: '11px',
          fontWeight: 500,
          color: 'white'
        }}>
          <Loader2 size={12} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
          Agent working...
        </div>
      )}

      <SidebarPanelHeader title="Agent" onCollapse={onClose}>
        {/* New Chat Button */}
        <button
          onClick={handleNewConversation}
          title="New Chat"
          style={{
            background: 'none',
            border: 'none',
            borderRadius: '4px',
            padding: '6px',
            cursor: 'pointer',
            color: 'var(--foreground)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--panel)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'none'
          }}
        >
          <Plus size={16} />
        </button>

        {/* 3-dot Menu */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            title="More options"
            style={{
              background: showMoreMenu ? 'var(--panel)' : 'none',
              border: 'none',
              borderRadius: '4px',
              padding: '6px',
              cursor: 'pointer',
              color: 'var(--foreground)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseEnter={(e) => {
              if (!showMoreMenu) e.currentTarget.style.background = 'var(--panel)'
            }}
            onMouseLeave={(e) => {
              if (!showMoreMenu) e.currentTarget.style.background = 'none'
            }}
          >
            <MoreVertical size={16} />
          </button>

          {/* Dropdown Menu */}
          {showMoreMenu && (
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 999 }}
                onClick={() => setShowMoreMenu(false)}
              />
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                right: 0,
                background: 'var(--panel-2)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                minWidth: '160px',
                zIndex: 1000,
                overflow: 'hidden'
              }}>
                <button
                  onClick={() => {
                    setShowConversationSidebar(true)
                    setShowMoreMenu(false)
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--foreground)',
                    fontSize: '13px',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                >
                  <MessageSquare size={14} />
                  <span>Chat History</span>
                </button>
                <button
                  onClick={async () => {
                    setShowMoreMenu(false)
                    const result = await agentActions.undo()
                    if (result.success) {
                      showNotification(result.message, 'info')
                    } else {
                      showNotification(result.message, 'error')
                    }
                  }}
                  disabled={!canUndo}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: 'none',
                    border: 'none',
                    color: canUndo ? 'var(--foreground)' : 'var(--muted)',
                    fontSize: '13px',
                    cursor: canUndo ? 'pointer' : 'not-allowed',
                    textAlign: 'left',
                    opacity: canUndo ? 1 : 0.5
                  }}
                  onMouseEnter={(e) => canUndo && (e.currentTarget.style.background = 'var(--hover)')}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                >
                  <Undo2 size={14} />
                  <span>Undo Last Edit</span>
                </button>
                <button
                  onClick={() => {
                    handleOpenInTab()
                    setShowMoreMenu(false)
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--foreground)',
                    fontSize: '13px',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                >
                  <ExternalLink size={14} />
                  <span>Open in Tab</span>
                </button>
              </div>
            </>
          )}
        </div>
      </SidebarPanelHeader>

      {/* Package Selector Modal - shown when AI suggests packages or when no packages found */}
      {showPackageSelector && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }} onClick={() => setShowPackageSelector(false)}>
          <div style={{
            backgroundColor: 'var(--panel)',
            borderRadius: '12px',
            maxWidth: '800px',
            width: '100%',
            maxHeight: '80vh',
            overflow: 'auto',
            border: '1px solid var(--border)'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{
              padding: '20px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text)' }}>
                Suggested Packages
              </h2>
              <button
                onClick={() => setShowPackageSelector(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  padding: '0 8px'
                }}
              >×</button>
            </div>
            <div style={{ padding: '20px' }}>
              <PrompdPackageSelector
                recommendations={packageRecommendations}
                selectedPackage={selectedPackage}
                onSelect={(pkg) => {
                  console.log('Package selected:', pkg)
                  setSelectedPackage(pkg)
                  setShowPackageSelector(false)

                  // Notify parent component
                  if (onPackageSelected) {
                    onPackageSelected(pkg.name)
                  }
                }}
                onGenerateCustom={() => {
                  console.log('Generate custom prompt requested')
                  setShowPackageSelector(false)
                  // Trigger the LLM to generate a custom .prmd file
                  // The conversation context already has the user's request
                  showNotification('Generating custom prompt...', 'info')
                }}
                onSearch={async (query) => {
                  // Search registry for additional packages
                  try {
                    const results = await registryApi.searchPackages(query)
                    return results.packages.map((pkg, index): PrompdPackageRecommendation => ({
                      package: {
                        name: pkg.name,
                        version: pkg.version,
                        description: pkg.description,
                        tags: pkg.keywords || [],
                        downloads: pkg.downloads,
                        rating: 0
                      },
                      score: 100 - (index * 5),
                      reason: `Search result for: ${query}`
                    }))
                  } catch (error) {
                    console.error('Package search failed:', error)
                    return []
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}

      <div style={{
        flex: 1,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0
      }}>
        {/* Pending Edit Notice - simple message when there's a pending edit in the editor */}
        {pendingEdit && (
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            background: theme === 'dark' ? 'rgba(34, 197, 94, 0.1)' : '#f0fdf4',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
              color: theme === 'dark' ? '#86efac' : '#16a34a'
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              <span>
                <strong>Proposed changes</strong> for lines {pendingEdit.lineNumbers?.[0] ?? '?'}-{pendingEdit.lineNumbers?.[1] ?? '?'} — review in editor
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleDeclineEdit}
                style={{
                  padding: '4px 10px',
                  fontSize: '12px',
                  fontWeight: 500,
                  background: 'transparent',
                  border: `1px solid ${theme === 'dark' ? 'rgba(71, 85, 105, 0.5)' : '#e2e8f0'}`,
                  borderRadius: '4px',
                  color: theme === 'dark' ? '#e2e8f0' : '#0f172a',
                  cursor: 'pointer'
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <PrompdProvider
          apiBaseUrl="" // Empty - DefaultLLMClient appends /api/chat paths
          defaultLLMClient={editorLLMClient}
          defaultEditor={editorIntegration}
          mode="editor"
          theme={theme}
        >
          <PrompdChat
            ref={chatRef}
            sessionId={currentConversation?.id}
            initialMessages={initialMessages}
            emptyStateContent={emptyStateContent}
            currentMode={modeConfigsArray.find(m => m.id === chatMode)}
            modes={[]}  // Hide mode dropdown - unified agent mode only
            inputValue={chatInputValue}
            onInputChange={setChatInputValue}
            inputTheme={permissionLevel}
            waitingForUserInput={!!agentState.pendingAskUser}
            onStop={() => agentActions.stop()}
            onBeforeSubmit={async (inputValue) => {
              // Check if there's a pending ask_user waiting for user response
              if (agentState.pendingAskUser) {
                console.log('[AiChatPanel] onBeforeSubmit: Resolving pending ask_user with:', inputValue)
                // Add the user's response as a message in the chat
                if (chatRef.current) {
                  chatRef.current.addMessage({
                    id: `user-response-${Date.now()}`,
                    role: 'user',
                    content: inputValue,
                    timestamp: new Date().toISOString()
                  })
                }
                // Resolve the pending ask_user promise
                agentState.pendingAskUser.resolve(inputValue)
                setChatInputValue('')
                return true // Consumed - don't send to LLM directly
              }

              // Check if this is a slash command
              if (inputValue.startsWith('/')) {
                const match = inputValue.match(/^\/(\w+)(?:\s+(.*))?$/)
                if (match) {
                  const [, commandName, args] = match
                  const command = SLASH_COMMANDS.find(c => c.name === commandName)
                  if (command) {
                    // Execute the slash command
                    setChatInputValue('')
                    const result = await executeSlashCommand(command.id, args?.trim() || '', {
                      fileContent: getText(),
                      fileName: getActiveTabName() || undefined,
                      workspacePath: workspacePath || undefined,
                      registryUrl: prompdSettings.getRegistryUrl(),
                      getToken: async () => {
                        const token = await getToken()
                        return token || ''
                      }
                    })

                    // Display result in chat
                    if (chatRef.current) {
                      chatRef.current.addMessage({
                        id: `slash-cmd-${Date.now()}`,
                        role: 'system',
                        content: result.success ? result.output : `**Error:** ${result.error}`,
                        timestamp: new Date().toISOString(),
                        metadata: {
                          type: 'slash-command',
                          command: command.id,
                          success: result.success
                        }
                      })
                    }
                    return true // Consumed - don't send to LLM
                  }
                }
              }
              return false // Not a slash command, send to LLM
            }}
            leftControls={
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* Slash Command Menu */}
                <SlashCommandMenu
                  isOpen={slashCommands.isOpen}
                  filter={slashCommands.filter}
                  onSelect={handleSlashCommandSelect}
                  onClose={slashCommands.close}
                  theme={theme}
                />
                {/* Undo/Redo buttons - visible and easy to access */}
                <button
                  type="button"
                  onClick={async () => {
                    const result = await agentActions.undo()
                    if (result.success) {
                      showNotification(result.message, 'info')
                    } else {
                      showNotification(result.message, 'error')
                    }
                  }}
                  disabled={!canUndo}
                  title={`Undo Last Edit (Ctrl+Z)${canUndo ? '' : ' - Nothing to undo'}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '6px',
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    cursor: canUndo ? 'pointer' : 'not-allowed',
                    color: canUndo ? 'var(--foreground)' : 'var(--muted)',
                    opacity: canUndo ? 1 : 0.5,
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (canUndo) e.currentTarget.style.background = 'var(--hover)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <Undo2 size={14} />
                </button>
                {/* Redo button */}
                <button
                  type="button"
                  onClick={async () => {
                    const toolExecutor = agentActions.getToolExecutor()
                    if (!toolExecutor) {
                      showNotification('Tool executor not available', 'error')
                      return
                    }
                    const result = await toolExecutor.redo()
                    if (result.success) {
                      showNotification('Redone', 'info')
                      // Notify parent to update tabs with redone content if needed
                      const output = result.output as { path?: string; content?: string } | undefined
                      if (output?.path && output?.content !== undefined && onFileWritten) {
                        onFileWritten(output.path, output.content)
                      }
                    } else {
                      showNotification(result.error || 'Redo failed', 'error')
                    }
                  }}
                  disabled={!canRedo}
                  title={`Redo Last Edit (Ctrl+Y)${canRedo ? '' : ' - Nothing to redo'}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '6px',
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    cursor: canRedo ? 'pointer' : 'not-allowed',
                    color: canRedo ? 'var(--foreground)' : 'var(--muted)',
                    opacity: canRedo ? 1 : 0.5,
                    transition: 'all 0.15s ease',
                    marginRight: '4px'
                  }}
                  onMouseEnter={(e) => {
                    if (canRedo) e.currentTarget.style.background = 'var(--hover)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <Redo2 size={14} />
                </button>
                <button
                  type="button"
                  className={permissionLevel === 'plan' && agentState.isAgentLoopActive ? 'plan-executing' : ''}
                  onClick={() => setShowPermissionMenu(!showPermissionMenu)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 10px',
                    background: showPermissionMenu ? 'var(--hover)' : 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: 'var(--foreground)',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (!showPermissionMenu) e.currentTarget.style.background = 'var(--hover)'
                  }}
                  onMouseLeave={(e) => {
                    if (!showPermissionMenu) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  {permissionLevel === 'auto' && <Zap size={14} style={{ color: '#22c55e' }} />}
                  {permissionLevel === 'confirm' && <ShieldCheck size={14} style={{ color: '#eab308' }} />}
                  {permissionLevel === 'plan' && !agentState.isAgentLoopActive && <ClipboardList size={14} style={{ color: '#6366f1' }} />}
                  {permissionLevel === 'plan' && agentState.isAgentLoopActive && <Play size={14} style={{ color: '#f97316' }} />}
                  <span style={{ textTransform: 'capitalize', fontSize: '16px' }}>
                    {permissionLevel === 'plan' && agentState.isAgentLoopActive ? 'Executing' : permissionLevel}
                  </span>
                  <ChevronDown size={12} style={{ color: 'var(--text-muted)', transform: showPermissionMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
                </button>

                {showPermissionMenu && (
                  <>
                    <div
                      style={{ position: 'fixed', inset: 0, zIndex: 999 }}
                      onClick={() => setShowPermissionMenu(false)}
                    />
                    <div style={{
                      position: 'absolute',
                      bottom: 'calc(100% + 4px)',
                      left: 0,
                      background: 'var(--panel-2)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                      zIndex: 1000,
                      overflow: 'hidden',
                      minWidth: '180px'
                    }}>
                      {([
                        { level: 'auto' as const, icon: Zap, color: '#22c55e', desc: 'Execute automatically' },
                        { level: 'confirm' as const, icon: ShieldCheck, color: '#eab308', desc: 'Confirm writes' },
                        { level: 'plan' as const, icon: ClipboardList, color: '#6366f1', desc: 'Plan first' }
                      ]).map(({ level, icon: Icon, color, desc }) => (
                        <button
                          type="button"
                          key={level}
                          onClick={() => {
                            setPermissionLevel(level)
                            setShowPermissionMenu(false)
                          }}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            background: permissionLevel === level ? 'var(--hover)' : 'none',
                            border: 'none',
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'background 0.1s ease'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--hover)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = permissionLevel === level ? 'var(--hover)' : 'none'}
                        >
                          <Icon size={16} style={{ color, flexShrink: 0 }} />
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--foreground)', textTransform: 'capitalize' }}>
                              {level}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              {desc}
                            </div>
                          </div>
                          {permissionLevel === level && (
                            <div style={{ marginLeft: 'auto', color: 'var(--prompd-accent, #6366f1)' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {/* Slash Command Trigger Button */}
                <button
                  type="button"
                  onClick={() => {
                    // Open the slash command menu directly
                    slashCommands.open()
                  }}
                  title="Slash commands"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '32px',
                    height: '32px',
                    background: slashCommands.isOpen ? 'var(--hover)' : 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '16px',
                    fontWeight: 600,
                    color: slashCommands.isOpen ? 'var(--accent)' : 'var(--foreground)',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (!slashCommands.isOpen) e.currentTarget.style.background = 'var(--hover)'
                  }}
                  onMouseLeave={(e) => {
                    if (!slashCommands.isOpen) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  /
                </button>
              </div>
            }
            aboveInput={agentState.pendingAskUser ? (
              <div style={{
                background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(139, 92, 246, 0.1) 100%)',
                borderTop: '2px solid rgba(168, 85, 247, 0.5)',
                padding: '16px 20px'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '16px',
                  maxWidth: '600px',
                  margin: '0 auto'
                }}>
                  {/* Icon */}
                  <div style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    background: 'rgba(168, 85, 247, 0.2)',
                    border: '1px solid rgba(168, 85, 247, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <MessageCircle size={22} style={{ color: '#a855f7' }} />
                  </div>
                  {/* Content */}
                  <div style={{ flex: 1 }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '8px'
                    }}>
                      <span style={{
                        color: '#a855f7',
                        fontWeight: 700,
                        fontSize: '14px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        Agent needs your input
                      </span>
                      <span style={{
                        background: 'rgba(168, 85, 247, 0.3)',
                        color: '#c4b5fd',
                        fontSize: '10px',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        fontWeight: 600
                      }}>
                        WAITING
                      </span>
                    </div>
                    <div style={{
                      color: 'var(--prompd-text)',
                      fontSize: '15px',
                      lineHeight: 1.6,
                      fontWeight: 500
                    }}>
                      {agentState.pendingAskUser.question}
                    </div>
                    {/* Option buttons when ask_user provides options */}
                    {agentState.pendingAskUser.options && agentState.pendingAskUser.options.length > 0 && (
                      <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '8px',
                        marginTop: '12px'
                      }}>
                        {agentState.pendingAskUser.options.map((opt, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => {
                              if (chatRef.current) {
                                chatRef.current.addMessage({
                                  id: `user-response-${Date.now()}`,
                                  role: 'user',
                                  content: opt.label,
                                  timestamp: new Date().toISOString()
                                })
                              }
                              agentState.pendingAskUser?.resolve(opt.label)
                              setChatInputValue('')
                            }}
                            style={{
                              padding: opt.description ? '10px 16px' : '8px 16px',
                              background: 'rgba(168, 85, 247, 0.1)',
                              border: '1px solid rgba(168, 85, 247, 0.3)',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              textAlign: 'left',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '2px',
                              transition: 'all 0.15s'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'rgba(168, 85, 247, 0.2)'
                              e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.5)'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'rgba(168, 85, 247, 0.1)'
                              e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.3)'
                            }}
                          >
                            <span style={{ color: '#a855f7', fontWeight: 600, fontSize: '14px' }}>{opt.label}</span>
                            {opt.description && (
                              <span style={{ color: 'var(--prompd-muted)', fontSize: '12px' }}>{opt.description}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    <div style={{
                      fontSize: '12px',
                      color: 'var(--prompd-muted)',
                      marginTop: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                          background: 'var(--prompd-panel)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontFamily: 'monospace',
                          fontSize: '11px'
                        }}>Enter</span>
                        {agentState.pendingAskUser.options && agentState.pendingAskUser.options.length > 0
                          ? 'Or type a custom answer below'
                          : 'Type your answer below and press Enter to continue'
                        }
                      </div>
                      <button
                        type="button"
                        onClick={() => agentActions.cancelAskUser()}
                        style={{
                          padding: '4px 12px',
                          background: 'rgba(239, 68, 68, 0.2)',
                          border: '1px solid rgba(239, 68, 68, 0.4)',
                          borderRadius: '6px',
                          color: '#f87171',
                          fontSize: '12px',
                          fontWeight: 500,
                          cursor: 'pointer'
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : undefined}
            onMessage={(message) => {
              console.log('[AiChatPanel] PrompdChat message received:', message.role, message.content?.slice(0, 100))

              // Note: ask_user responses are now handled in onBeforeSubmit, which intercepts
              // before the message reaches here. Messages that arrive here are normal chat flow.

              // Save message to conversation using functional update to avoid stale state
              setCurrentConversation(prevConversation => {
                if (!prevConversation) return null
                const conversationMessage: ConversationMessage = {
                  id: message.id,
                  role: message.role,
                  content: message.content,
                  timestamp: message.timestamp,
                  metadata: message.metadata
                }
                const updatedConv: Conversation = {
                  ...prevConversation,
                  messages: [...prevConversation.messages, conversationMessage],
                  updatedAt: new Date().toISOString()
                }
                // Save asynchronously
                conversationStorage.save(updatedConv).catch(err => {
                  console.error('[AiChatPanel] Failed to save conversation:', err)
                })
                return updatedConv
              })

              // JSON parsing is already handled in editorLLMClient.send()
              // The message.content should already be the human-readable message
              // The message.metadata.suggestion should already contain the suggestion

              // Handle different suggestion types
              const suggestion = message.metadata?.suggestion as Suggestion | undefined
              console.log('🎯 Extracted suggestion:', suggestion)

              if (suggestion && message.role === 'assistant') {
                console.log('✅ Processing suggestion type:', suggestion.type)

                switch (suggestion.type) {
                  case 'new-file': {
                    // Generate new .prmd file using editorService
                    const newFileResult = prepareNewFile(suggestion)
                    if (newFileResult.success) {
                      console.log('Generating new file:', newFileResult.filename)
                      onPrompdGenerated(newFileResult.content, newFileResult.filename, {
                        source: 'ai-chat',
                        provider: llmProvider.provider,
                        model: llmProvider.model
                      })
                    } else {
                      console.warn('New file preparation failed:', newFileResult.message)
                    }
                    break
                  }

                  case 'edit-existing': {
                    // Store pending edit for diff review instead of auto-applying
                    const currentText = getText()
                    const lineNumbers = suggestion.lineNumbers && suggestion.lineNumbers.length >= 2
                      ? [suggestion.lineNumbers[0], suggestion.lineNumbers[1]] as [number, number]
                      : undefined

                    // Validate the edit can be applied
                    const editResult = applyEdit(currentText, suggestion)
                    if (editResult.success && suggestion.content && lineNumbers) {
                      console.log('Storing pending edit for review:', editResult.message)

                      // Set pending edit for chat panel diff view
                      setPendingEdit({
                        suggestion,
                        originalText: currentText,
                        proposedText: suggestion.content,
                        lineNumbers,
                        language: suggestion.language || 'yaml'
                      })

                      // Also send to editor for inline diff view (VS Code style)
                      if (onSetPendingEdit) {
                        onSetPendingEdit({
                          content: suggestion.content,
                          lineNumbers,
                          language: suggestion.language || 'yaml'
                        })
                      }

                      showNotification('Review proposed changes in the editor', 'info')
                    } else if (!lineNumbers) {
                      console.warn('Edit missing line numbers - cannot show inline diff')
                      showNotification('Edit suggestion missing line numbers', 'warning')
                    } else {
                      console.warn('Edit validation failed:', editResult.message)
                      showNotification(editResult.message, 'warning')
                    }
                    break
                  }

                  case 'search-keywords': {
                    // Auto-search registry using extracted keywords
                    const keywords = extractSearchKeywords(suggestion)
                    if (keywords.length > 0) {
                      console.log('🔍 Auto-searching registry with keywords:', keywords)

                      const searchQuery = keywords.join(' ')
                      console.log('🔍 Search query:', searchQuery)

                      registryApi.searchPackages(searchQuery)
                        .then(results => {
                          console.log('🔍 Search results:', results)

                          if (results.packages && results.packages.length > 0) {
                            // Take top 5 results
                            const topResults = results.packages.slice(0, 5)

                            // Convert to recommendations for quick access
                            const recommendations: PrompdPackageRecommendation[] = topResults.map((pkg, index) => ({
                              package: {
                                name: pkg.name,
                                version: pkg.version,
                                description: pkg.description,
                                tags: pkg.keywords || [],
                                downloads: pkg.downloads,
                                rating: 0
                              },
                              score: 100 - (index * 5),
                              reason: `Match for: ${searchQuery}`
                            }))

                            console.log('✅ Storing', topResults.length, 'package recommendations')
                            setPackageRecommendations(recommendations)
                            setShowNoResultsPrompt(false) // Hide no-results prompt if it was showing

                            // Build formatted list for AI to present
                            let packageList = `\n\nI found ${topResults.length} relevant package(s):\n\n`
                            topResults.forEach((pkg, index) => {
                              packageList += `${index + 1}. **${pkg.name}** (v${pkg.version})\n`
                              packageList += `   ${pkg.description}\n`
                              if (pkg.keywords && pkg.keywords.length > 0) {
                                packageList += `   Tags: ${pkg.keywords.join(', ')}\n`
                              }
                              packageList += `\n`
                            })
                            packageList += `Type the package name to use it, or ask me to "generate a custom prompt" if none of these fit your needs.`

                            // TODO: Send this list back to the AI so it can present it nicely
                            // For now, show notification and store recommendations
                            // Also show the package selector modal so user can browse and select
                            setShowPackageSelector(true)
                            showNotification(`Found ${topResults.length} package(s) - click to select or generate custom`, 'info')
                          } else {
                            // No packages found - automatically trigger custom generation
                            console.log('❌ No packages found - triggering automatic custom generation')
                            setPackageRecommendations([])
                            setShowNoResultsPrompt(false)
                            setTriggerAutoGenerate(true) // This will trigger a follow-up message
                            showNotification('No packages found - generating custom prompt...', 'info')
                          }
                        })
                        .catch(error => {
                          console.error('❌ Package search failed:', error)
                          showNotification('Failed to search registry', 'error')
                        })
                    } else {
                      console.log('⚠️ No keywords provided for search')
                    }
                    break
                  }

                  case 'none':
                    // Just conversational, no action needed
                    console.log('No action needed for this message')
                    break

                  default:
                    console.log('Unknown suggestion type:', suggestion.type)
                }
              }

              // Legacy: If it's a generated prompt with old metadata format
              if (message.metadata?.type === 'generated-prompt') {
                handlePrompdGenerated(message.content, message.metadata)
              }
            }}
          />

        </PrompdProvider>
      </div>

      {/* Token usage status bar */}
      {agentState.tokenUsage.totalTokens > 0 && (
        <div style={{
          padding: '3px 12px',
          fontSize: '11px',
          color: theme === 'dark' ? 'var(--text-muted, #6b7280)' : 'rgba(0,0,0,0.4)',
          borderTop: `1px solid ${theme === 'dark' ? 'var(--border, #2d2d3d)' : '#e2e8f0'}`,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexShrink: 0,
          fontFamily: 'var(--font-mono, monospace)',
          background: theme === 'dark' ? 'rgba(255,255,255,0.01)' : 'rgba(0,0,0,0.01)'
        }}>
          <span>{agentState.tokenUsage.totalTokens.toLocaleString()} tokens</span>
          <span style={{ opacity: 0.5 }}>
            ({agentState.tokenUsage.promptTokens.toLocaleString()} in / {agentState.tokenUsage.completionTokens.toLocaleString()} out)
          </span>
        </div>
      )}
    </div>
  )
}

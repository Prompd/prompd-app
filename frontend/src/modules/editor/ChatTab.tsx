import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAuthenticatedUser } from '../auth/ClerkWrapper'
import {
  PrompdProvider,
  PrompdChat,
  usePrompdUsage,
  getChatModesArray,
  type PrompdLLMRequest,
  type PrompdLLMResponse,
  type PrompdChatHandle,
  type UsageEventType
} from '@prompd/react'
import '@prompd/react/dist/style.css'
import { PrompdEditorIntegration } from '../integrations/PrompdEditorIntegration'
import { conversationStorage, type Conversation, type ConversationMessage, type AgentPermissionLevel } from '../services/conversationStorage'
import { fetchChatModes, chatModesToArray, type ChatModeConfig } from '../services/chatModesApi'
import { LLMClientRouter } from '../services/llmClientRouter'
import { CompactingLLMClient, SlidingWindowCompactor } from '@prompd/react'
import { resolveEffectiveContextWindow, formatContextWindow } from '../services/contextWindowResolver'

/** Module-level singleton — SlidingWindowCompactor is stateless */
const slidingWindowCompactor = new SlidingWindowCompactor()
import { createToolExecutor, type IToolExecutor, type ToolCall } from '../services/toolExecutor'
import type { Tab } from '../../stores/types'
import { useEditorStore } from '../../stores/editorStore'
import { useUIStore } from '../../stores/uiStore'
import { Zap, ShieldCheck, ClipboardList, ChevronDown, FileText, MessageCircle, Undo2 } from 'lucide-react'
import { SlashCommandMenu, useSlashCommands, type SlashCommand } from '../components/SlashCommandMenu'
import { executeSlashCommand, SLASH_COMMANDS } from '../services/slashCommands'
import { prompdSettings } from '../services/prompdSettings'
import { PlanApprovalDialog } from '../components/PlanApprovalDialog'
import PlanReviewModal from '../components/PlanReviewModal'
import { useAgentMode } from '../hooks/useAgentMode'
import { undoStack } from '../services/toolExecutor'
import { buildFileContextMessages } from '../services/fileContextBuilder'

interface ChatTabProps {
  tab: Tab
  onPrompdGenerated?: (prompd: string, filename: string, metadata: Record<string, unknown>) => void
  getText?: () => string
  setText?: (text: string) => void
  theme?: 'light' | 'dark'
  workspacePath?: string | null  // Workspace path for tool execution (Electron)
  showNotification?: (message: string, type?: 'info' | 'warning' | 'error') => void
  onFileWritten?: (path: string, content: string) => void  // Callback when agent writes a file
  onAutoSave?: () => Promise<void>  // Callback to auto-save before tool approval
  onRegisterStop?: (stopFn: (() => void) | null) => void  // Register stop function for menu integration
  embedded?: boolean  // When true, hides context file selector (used in SplitEditor)
}

// Fallback system prompt used when backend modes haven't loaded yet
const FALLBACK_SYSTEM_PROMPT = `You are a Prompd AI assistant helping users create and manage .prmd files.

## .prmd File Structure
\`\`\`yaml
---
id: kebab-case-id
name: "Human Readable Name"
description: "One-sentence description"
version: 1.0.0
parameters:
  - name: parameter_name
    type: string|integer|float|boolean|enum|array|object
    required: true|false
    default: value
    description: "What this parameter does"
    enum: [option1, option2]  # For enum types
---

# Main Title

## System
AI role and behavior

## Context
Background information

## Instructions
Step-by-step task breakdown

## Output Format
Expected output structure
\`\`\`

CRITICAL RULES:
1. When generating .prmd files, output them in properly formatted code fences.
2. Use ONLY real package names from the registry. Never invent package names.
3. If no packages found, suggest generating a custom prompt instead.
4. Ensure valid YAML frontmatter with id, name, and version fields.
5. Parameters MUST use array format with "- name:" syntax, NOT object format.`

/** Welcome state with interactive gradient P icon that chases the mouse */
function WelcomeGradientP({ contextFileName }: { contextFileName: string | null }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const iconRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [angle, setAngle] = useState(135)
  const [active, setActive] = useState(false)
  const [snowing, setSnowing] = useState(false)
  const rafRef = useRef<number>(0)
  const snowStopRef = useRef<(() => void) | null>(null)

  // Mouse-tracking gradient effect
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const onMove = (e: MouseEvent) => {
      if (!iconRef.current) return
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        const rect = iconRef.current!.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        const deg = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI)
        setAngle(deg)
        setActive(true)
      })
    }
    const onLeave = () => { setActive(false) }

    container.addEventListener('mousemove', onMove)
    container.addEventListener('mouseleave', onLeave)
    return () => {
      container.removeEventListener('mousemove', onMove)
      container.removeEventListener('mouseleave', onLeave)
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // Snow effect — delegates to snowEffect service
  useEffect(() => {
    if (!snowing) return

    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    // Lazy-import to keep the module isolated
    import('../services/snowEffect').then(({ startSnowEffect }) => {
      snowStopRef.current = startSnowEffect(canvas, container, () => setSnowing(false))
    })

    return () => {
      snowStopRef.current?.()
      snowStopRef.current = null
    }
  }, [snowing])

  // Click easter egg: trigger snow
  const handleClick = useCallback(() => {
    if (snowing) return
    setSnowing(true)
    setActive(true)
  }, [snowing])

  // Cleanup
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current)
      snowStopRef.current?.()
    }
  }, [])

  const maskSvg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 475 487">` +
    `<path fill="white" d="M 271.6313,29.109924 C 456.06055,29.109924 454.60452,304.1 270.40336,304.1 L 228,304 v -47.30173 l 43.85191,0.0317 c 118.41324,0 116.08205,-178.966717 -0.82527,-178.966717 L 132.15087,77.622831 129.6,420.52 c -0.33992,0.0728 -45.968529,35.12868 -45.968529,35.12868 L 83.506489,28.866413 Z"/>` +
    `<path fill="white" d="m 156,102 103.33423,0.32678 c 88.07508,0 87.938,129.66692 1.26051,129.66692 l -32.5414,0.0925 -0.0533,-47.08616 32.66331,-0.23913 c 27.90739,0 25.69827,-34.89447 -0.0611,-34.99087 L 204.00004,150 c 0.90517,68.30467 0.52,211.29643 0.52,211.29643 0,0 -48.54879,38.04493 -48.62668,38.05052 z"/>` +
    `</svg>`
  )

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', padding: '0 16px', paddingTop: '15%', position: 'relative', overflow: 'hidden' }}>
      {/* Snow canvas overlay */}
      {snowing && (
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 10
          }}
        />
      )}
      <div style={{ marginBottom: '24px', position: 'relative', zIndex: 1 }}>
        <div
          ref={iconRef}
          onClick={handleClick}
          style={{
            width: 80,
            height: 80,
            margin: '0 auto 16px',
            cursor: 'pointer',
            background: active
              ? `conic-gradient(from ${angle}deg, #06b6d4, #8b5cf6, #ec4899, #f59e0b, #06b6d4)`
              : 'linear-gradient(135deg, #06b6d4, #3b82f6)',
            WebkitMaskImage: `url("data:image/svg+xml,${maskSvg}")`,
            maskImage: `url("data:image/svg+xml,${maskSvg}")`,
            WebkitMaskSize: 'contain',
            maskSize: 'contain',
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            WebkitMaskPosition: 'center',
            maskPosition: 'center',
            transition: active ? 'none' : 'background 0.4s ease'
          }}
        />
        <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px', color: 'var(--prompd-text)' }}>
          Prompd Agent
        </h2>
        <p style={{ maxWidth: '320px', margin: '0 auto 16px', color: 'var(--prompd-muted)' }}>
          {contextFileName
            ? `Working with ${contextFileName}`
            : 'Ask me to create, edit, search, or explore packages'
          }
        </p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap', maxWidth: '300px', margin: '0 auto' }}>
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
}

export function ChatTab({ tab, onPrompdGenerated, getText, setText, theme = 'dark', workspacePath, showNotification, onFileWritten, onAutoSave, onRegisterStop, embedded = false }: ChatTabProps) {
  const { getToken } = useAuthenticatedUser()
  const { trackUsage } = usePrompdUsage()

  // Use useShallow to ensure proper re-renders when tabs array changes
  const { tabs, activeTabId, updateTab, addTab } = useEditorStore(
    useShallow(state => ({
      tabs: state.tabs,
      activeTabId: state.activeTabId,
      updateTab: state.updateTab,
      addTab: state.addTab
    }))
  )

  // Refs for imperative control
  const chatRef = useRef<PrompdChatHandle>(null)

  // Centralized LLM provider state
  const { llmProvider, initializeLLMProviders } = useUIStore(
    useShallow(state => ({
      llmProvider: state.llmProvider,
      initializeLLMProviders: state.initializeLLMProviders
    }))
  )

  const [modeConfigsArray, setModeConfigsArray] = useState<Array<{ id: string; label: string; icon: string; description: string; systemPrompt: string }>>([])
  const [modesError, setModesError] = useState<string | null>(null)

  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null)

  const [selectedFileTabId, setSelectedFileTabId] = useState<string | null>(
    tab.chatConfig?.contextFile !== undefined ? tab.chatConfig.contextFile : activeTabId
  )

  const chatMode = (tab.chatConfig?.mode || 'generate') as 'generate' | 'edit' | 'discuss' | 'explore'

  // Permission level state for unified agent mode
  const [permissionLevel, setPermissionLevel] = useState<AgentPermissionLevel>('confirm')
  const [showPermissionMenu, setShowPermissionMenu] = useState(false)

  // Derive effective chatMode: when Plan permission is selected, use planner mode
  const effectiveChatMode = permissionLevel === 'plan' ? 'planner' : chatMode

  // Chat input state for slash commands
  const [chatInputValue, setChatInputValue] = useState('')
  const slashCommands = useSlashCommands(chatInputValue)

  // Store chat modes from backend for agent prompts
  const [chatModes, setChatModes] = useState<Record<string, ChatModeConfig> | null>(null)

  // Agent mode hook - shared with AiChatPanel
  const [agentState, agentActions] = useAgentMode({
    workspacePath,
    permissionLevel,
    chatModes,
    chatMode: effectiveChatMode,
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
        const existingIdx = prev.messages.findIndex(m => m.id === msg.id)
        const updatedMessages = existingIdx >= 0
          ? prev.messages.map((m, i) => i === existingIdx ? toolMsg : m)
          : [...prev.messages, toolMsg]
        const updated = { ...prev, messages: updatedMessages, updatedAt: new Date().toISOString() }
        conversationStorage.save(updated).catch(err => console.error('[ChatTab] Failed to save tool message:', err))
        return updated
      })
    }
  })

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

  // Undo state
  const [canUndo, setCanUndo] = useState(false)

  // Subscribe to undo stack changes
  useEffect(() => {
    // Initial state
    setCanUndo(undoStack.size() > 0)
    // Subscribe to changes
    const unsubscribe = undoStack.subscribe(() => {
      setCanUndo(undoStack.size() > 0)
    })
    return unsubscribe
  }, [])

  // Track if we've initialized for this tab to prevent infinite loops
  const initializedTabRef = useRef<string | null>(null)

  // Track the conversationId we last initialized with
  const initializedConvRef = useRef<string | null>(null)

  // Load or create conversation on mount or when conversationId changes
  useEffect(() => {
    const convId = tab.chatConfig?.conversationId

    // Skip if already initialized for this exact tab + conversation combo
    if (initializedTabRef.current === tab.id && initializedConvRef.current === (convId || null)) {
      return
    }

    const initConversation = async () => {
      // Check if tab already has a conversation ID
      if (convId) {
        console.log('[ChatTab] Loading conversation:', convId)
        const loaded = await conversationStorage.load(convId)
        if (loaded) {
          console.log('[ChatTab] Loaded conversation with', loaded.messages.length, 'messages:',
            loaded.messages.map(m => ({ role: m.role, content: m.content.slice(0, 50) })))
          setCurrentConversation(loaded)
          initializedTabRef.current = tab.id
          initializedConvRef.current = convId
          return
        }
        // Conversation ID was set (e.g. by onNewChat) but not yet in IndexedDB.
        // Create an empty conversation with this exact ID and save it.
        // Do NOT call updateTab — the tab already has the correct ID.
        console.log('[ChatTab] Conversation not found in storage, creating with ID:', convId)
        const now = new Date().toISOString()
        const freshConversation: Conversation = {
          id: convId,
          title: 'New Conversation',
          mode: 'agent',
          permissionLevel: 'confirm',
          messages: [],
          createdAt: now,
          updatedAt: now,
          isPinned: false
        }
        await conversationStorage.save(freshConversation)
        setCurrentConversation(freshConversation)
        initializedTabRef.current = tab.id
        initializedConvRef.current = convId
        return
      }
      // No conversationId at all — create a new one and persist the ID to the tab
      console.log('[ChatTab] Creating new conversation')
      const newConversation = conversationStorage.createConversation('confirm')
      await conversationStorage.save(newConversation)
      setCurrentConversation(newConversation)
      initializedTabRef.current = tab.id
      initializedConvRef.current = newConversation.id

      // Save the conversation ID to the tab so it persists across tab switches
      // For inline/embedded chat, contextFile points to the real file tab ID;
      // for standalone chat tabs, tab.id is the real store ID
      const targetTabId = tab.chatConfig?.contextFile || tab.id
      updateTab(targetTabId, {
        chatConfig: {
          mode: tab.chatConfig?.mode || 'agent',
          contextFile: tab.chatConfig?.contextFile,
          conversationId: newConversation.id
        }
      })
    }
    initConversation()
  }, [tab.id, tab.chatConfig?.conversationId])

  useEffect(() => {
    const loadChatModes = async () => {
      console.log('[ChatTab] Loading chat modes...')
      try {
        const response = await fetchChatModes()
        console.log('[ChatTab] Chat modes response:', response)
        const modes = chatModesToArray(response.modes)
        console.log('[ChatTab] Parsed modes:', modes)
        setModeConfigsArray(modes)
        setChatModes(response.modes)  // Store raw modes for useAgentChat hook
        setModesError(null)
      } catch (error) {
        console.error('[ChatTab] Failed to load chat modes from backend:', error)
        // Fallback to @prompd/react constants if backend fails
        console.log('[ChatTab] Using fallback modes from @prompd/react')
        const fallbackModes = getChatModesArray().map(mode => ({
          ...mode,
          systemPrompt: FALLBACK_SYSTEM_PROMPT
        }))
        setModeConfigsArray(fallbackModes)
        setModesError(null)
      }
    }
    loadChatModes()
  }, [])

  // Initialize LLM providers on mount (uses centralized store)
  useEffect(() => {
    if (!llmProvider.isInitialized) {
      initializeLLMProviders(getToken)
    }
  }, [llmProvider.isInitialized])

  // Get selected file tab for Edit mode context
  const selectedFileTab = useMemo(() =>
    selectedFileTabId ? tabs.find(t => t.id === selectedFileTabId) : null,
    [selectedFileTabId, tabs]
  )

  // For Edit mode, get/set the selected file's content; otherwise use props
  const getSelectedFileText = useCallback(() => {
    if (chatMode === 'edit' && selectedFileTab) {
      return selectedFileTab.text || ''
    }
    return getText ? getText() : ''
  }, [chatMode, selectedFileTab, getText])

  const setSelectedFileText = useCallback((newText: string) => {
    if (chatMode === 'edit' && selectedFileTabId) {
      updateTab(selectedFileTabId, { text: newText, dirty: true })
    } else if (setText) {
      setText(newText)
    }
  }, [chatMode, selectedFileTabId, updateTab, setText])

  // Handle slash command selection from menu
  const handleSlashCommandSelect = useCallback(async (command: SlashCommand) => {
    console.log('[ChatTab] Slash command selected:', command.id)

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

    // For commands that don't require args, execute immediately
    const fullCommand = `/${command.name}${inputAfterCommand ? ' ' + inputAfterCommand : ''}`
    setChatInputValue('')

    // Execute the slash command directly
    const result = await executeSlashCommand(command.id, inputAfterCommand || '', {
      fileContent: selectedFileTab?.text || '',
      fileName: selectedFileTab?.name || undefined,
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
  }, [chatInputValue, slashCommands, selectedFileTab, workspacePath, getToken])


  // Create LLM client with agent functionality
  // Uses LLMClientRouter to route between local and remote execution (same as AiChatPanel)
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

    // Build context messages for file content using shared utility
    let contextMessages: Array<{ role: 'system'; content: string }> = []

    if (selectedFileTab) {
      const fileContent = selectedFileTab.text || ''
      const fileName = selectedFileTab.name || 'untitled.txt'

      if (fileContent) {
        contextMessages = buildFileContextMessages({
          fileName,
          content: fileContent,
          cursorPosition: undefined // ChatTab doesn't track cursor position
        })
      }
    }

    // Wrap base client with context compaction (decorator pattern)
    // Use effective (capped) context window so compaction triggers at a practical
    // conversation length even for models with 1M+ token windows.
    const effectiveCtxWindow = resolveEffectiveContextWindow(
      llmProvider.provider,
      llmProvider.model,
      llmProvider.providersWithPricing
    )
    const compactingClient = new CompactingLLMClient(
      baseClient,
      slidingWindowCompactor,
      effectiveCtxWindow
    )

    // Use the shared agent LLM client wrapper
    return agentActions.createAgentLLMClient(compactingClient, chatRef, contextMessages)
  }, [llmProvider.provider, llmProvider.model, getToken, selectedFileTab, agentActions])

  // Context utilization for status bar display (uses effective/capped context window)
  const contextUtilization = useMemo(() => {
    if (agentState.lastPromptTokens <= 0) return null
    const ctxWindow = resolveEffectiveContextWindow(llmProvider.provider, llmProvider.model, llmProvider.providersWithPricing)
    return { pct: Math.round((agentState.lastPromptTokens / ctxWindow) * 100), formatted: formatContextWindow(ctxWindow) }
  }, [agentState.lastPromptTokens, llmProvider.provider, llmProvider.model, llmProvider.providersWithPricing])

  const editorIntegration = useMemo(() => new PrompdEditorIntegration(
    getSelectedFileText,
    setSelectedFileText,
    () => selectedFileTab?.name || null,
    () => {} // showNotification not available here
  ), [getSelectedFileText, setSelectedFileText, selectedFileTab])

  const emptyStateContent = useMemo(() => {
    // Unified agent mode empty state
    const contextFileName = selectedFileTab?.name || null

    return (
      <WelcomeGradientP contextFileName={contextFileName} />
    )
  }, [selectedFileTab])

  const handleModeChange = useCallback((modeId: string) => {
    const targetTabId = tab.chatConfig?.contextFile || tab.id
    updateTab(targetTabId, {
      chatConfig: {
        ...tab.chatConfig,
        mode: modeId
      }
    })
  }, [tab.id, tab.chatConfig, updateTab])

  const handleMessage = useCallback(async (message: ConversationMessage & { timestamp?: string | number }) => {
    // Use functional update to avoid stale closure issues
    setCurrentConversation(prevConversation => {
      if (!prevConversation) return null

      const newMessage: ConversationMessage = {
        id: message.id,
        role: message.role,
        content: message.content,
        timestamp: typeof message.timestamp === 'number'
          ? new Date(message.timestamp).toISOString()
          : message.timestamp || new Date().toISOString(),
        metadata: message.metadata
      }

      const updatedConv: Conversation = {
        ...prevConversation,
        messages: [...prevConversation.messages, newMessage],
        updatedAt: new Date().toISOString()
      }

      // Save asynchronously (don't block the state update)
      conversationStorage.save(updatedConv).catch(err => {
        console.error('[ChatTab] Failed to save conversation:', err)
      })

      return updatedConv
    })
  }, [])

  // Common text/code file extensions that can be used as context
  const TEXT_FILE_EXTENSIONS = [
    '.prmd', '.prompd',  // Prompd files
    '.md', '.mdx', '.txt', '.rst',  // Documentation
    '.json', '.yaml', '.yml', '.toml', '.xml', '.csv',  // Data formats
    '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',  // JavaScript/TypeScript
    '.py', '.pyw', '.pyi',  // Python
    '.go', '.rs', '.c', '.cpp', '.h', '.hpp',  // Systems languages
    '.java', '.kt', '.scala', '.groovy',  // JVM languages
    '.rb', '.php', '.lua', '.pl', '.pm',  // Scripting languages
    '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd',  // Shell scripts
    '.sql', '.graphql', '.gql',  // Query languages
    '.html', '.htm', '.css', '.scss', '.sass', '.less',  // Web
    '.vue', '.svelte', '.astro',  // Component frameworks
    '.env', '.env.local', '.env.example',  // Environment files
    '.gitignore', '.dockerignore', '.eslintrc', '.prettierrc',  // Config files
    '.conf', '.config', '.ini', '.cfg',  // Configuration
    '.lock', '.sum'  // Lock files (package-lock, go.sum, etc.)
  ]

  // Check if a filename has a text/code file extension
  const isTextFile = useCallback((filename: string) => {
    const lower = filename.toLowerCase()
    return TEXT_FILE_EXTENSIONS.some(ext => lower.endsWith(ext)) ||
           // Also include files without extensions that are typically text (Makefile, Dockerfile, etc.)
           ['makefile', 'dockerfile', 'jenkinsfile', 'vagrantfile', 'rakefile', 'gemfile', 'procfile'].includes(lower) ||
           lower.startsWith('.')  // Hidden config files like .bashrc, .zshrc
  }, [])

  // Filter to text/code files that are editable
  // Note: type is optional and defaults to 'file', so check for undefined or 'file'
  const editableTabs = useMemo(() =>
    tabs.filter(t => (t.type === 'file' || t.type === undefined) && !t.readOnly && isTextFile(t.name)),
    [tabs, isTextFile]
  )

  // Auto-select first available file if none selected and files become available
  useEffect(() => {
    if (chatMode === 'edit' && !selectedFileTabId && editableTabs.length > 0) {
      setSelectedFileTabId(editableTabs[0].id)
    }
    // If selected file is removed, select next available or clear
    if (selectedFileTabId && !editableTabs.find(t => t.id === selectedFileTabId)) {
      setSelectedFileTabId(editableTabs.length > 0 ? editableTabs[0].id : null)
    }
  }, [chatMode, editableTabs, selectedFileTabId])

  // Handle file selection change, creating new file if needed
  const handleFileSelectionChange = useCallback((value: string) => {
    if (value === 'new') {
      // Create a new .prmd file
      const newTabId = `new-${Date.now()}`
      const defaultContent = `---
id: new-prompt
name: New Prompt
version: 1.0.0
---

# Prompt

Write your prompt content here.
`
      const newTab = {
        id: newTabId,
        name: 'untitled.prmd',
        text: defaultContent,
        dirty: true,
        virtualTemp: true,
        type: 'file' as const
      }
      addTab(newTab)
      setSelectedFileTabId(newTabId)
    } else {
      setSelectedFileTabId(value)
    }
  }, [addTab])

  // Context file selector - shows which file the agent is working with
  const renderContextSelector = () => {
    const hasFiles = editableTabs.length > 0

    // Only show if there are files to select from
    if (!hasFiles) return null

    return (
      <div style={{
        padding: '8px 12px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--panel-2)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <FileText size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', flexShrink: 0 }}>Context:</span>
        <select
          value={selectedFileTabId || ''}
          onChange={(e) => handleFileSelectionChange(e.target.value)}
          style={{
            flex: 1,
            padding: '4px 8px',
            fontSize: '12px',
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            color: 'var(--text)',
            cursor: 'pointer'
          }}
        >
          <option value="">No file selected</option>
          {editableTabs.map(t => (
            <option key={t.id} value={t.id}>
              {t.name} {t.dirty ? '*' : ''}
            </option>
          ))}
        </select>
      </div>
    )
  }

  // Show loading state while providers are being loaded
  if (llmProvider.isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{
            width: '32px',
            height: '32px',
            border: '2px solid currentColor',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            margin: '0 auto 8px',
            animation: 'spin 1s linear infinite'
          }} />
          <p style={{ margin: 0 }}>Loading chat providers...</p>
        </div>
      </div>
    )
  }

  // Show error state if modes failed to load
  if (modesError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', maxWidth: '400px' }}>
          <p style={{ color: 'var(--error, #ef4444)', marginBottom: '8px' }}>Failed to load chat modes</p>
          <p style={{ fontSize: '12px', margin: 0 }}>{modesError}</p>
        </div>
      </div>
    )
  }

  // Show loading state if modes haven't loaded yet
  if (modeConfigsArray.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{
            width: '32px',
            height: '32px',
            border: '2px solid currentColor',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            margin: '0 auto 8px',
            animation: 'spin 1s linear infinite'
          }} />
          <p style={{ margin: 0 }}>Loading chat modes...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {!embedded && renderContextSelector()}

      <div style={{ flex: 1, overflow: 'hidden' }}>
        <PrompdProvider
          apiBaseUrl=""
          defaultLLMClient={editorLLMClient}
          defaultEditor={editorIntegration}
          mode="editor"
          theme={theme}
        >
          <PrompdChat
            key={tab.id}
            ref={chatRef}
            sessionId={currentConversation?.id}
            initialMessages={currentConversation?.messages}
            emptyStateContent={emptyStateContent}
            currentMode={modeConfigsArray.find(m => m.id === chatMode)}
            modes={[]}
            onModeChange={handleModeChange}
            onMessage={handleMessage}
            inputValue={chatInputValue}
            onInputChange={setChatInputValue}
            inputTheme={permissionLevel}
            waitingForUserInput={!!agentState.pendingAskUser}
            onStop={() => agentActions.stop()}
            onBeforeSubmit={async (inputValue) => {
              console.log('[ChatTab] onBeforeSubmit called with:', inputValue)

              // Check if there's a pending ask_user waiting for user response
              if (agentState.pendingAskUser) {
                console.log('[ChatTab] onBeforeSubmit: Resolving pending ask_user with:', inputValue)
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
                console.log('[ChatTab] Slash command match:', match)
                if (match) {
                  const [, commandName, args] = match
                  const command = SLASH_COMMANDS.find(c => c.name === commandName)
                  console.log('[ChatTab] Found command:', command?.id, 'args:', args)
                  if (command) {
                    // Execute the slash command
                    setChatInputValue('')
                    const result = await executeSlashCommand(command.id, args?.trim() || '', {
                      fileContent: selectedFileTab?.text || '',
                      fileName: selectedFileTab?.name || undefined,
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
                <button
                  type="button"
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
                  {permissionLevel === 'plan' && <ClipboardList size={14} style={{ color: '#6366f1' }} />}
                  <span style={{ textTransform: 'capitalize', fontSize: '16px' }}>{permissionLevel}</span>
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
                {/* Undo Button */}
                <button
                  type="button"
                  onClick={async () => {
                    const result = await agentActions.undo()
                    if (result.success) {
                      showNotification?.(result.message, 'info')
                    } else {
                      showNotification?.(result.message, 'error')
                    }
                  }}
                  disabled={!canUndo}
                  title={canUndo ? 'Undo last edit' : 'Nothing to undo'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '32px',
                    height: '32px',
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
              </div>
            }
            aboveInput={agentState.pendingAskUser ? (
              <div style={{
                background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(139, 92, 246, 0.1) 100%)',
                borderTop: '2px solid rgba(168, 85, 247, 0.5)',
                padding: '16px 20px'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #a855f7 0%, #8b5cf6 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <MessageCircle size={16} style={{ color: 'white' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#a855f7',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: '4px'
                    }}>
                      Agent Needs Your Input
                    </div>
                    <div style={{
                      fontSize: '14px',
                      color: 'var(--prompd-text)',
                      lineHeight: 1.5,
                      marginBottom: '8px'
                    }}>
                      {agentState.pendingAskUser.question}
                    </div>
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
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px'
                    }}>
                      <div style={{
                        fontSize: '12px',
                        color: 'var(--prompd-muted)',
                        fontStyle: 'italic'
                      }}>
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
          {contextUtilization && (
            <span style={{ opacity: 0.5, marginLeft: 'auto' }}>
              Context: {contextUtilization.pct}% of {contextUtilization.formatted}
            </span>
          )}
        </div>
      )}

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
                console.warn('[ChatTab] Auto-save failed before approval:', err)
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
    </div>
  )
}
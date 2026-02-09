/**
 * SplitEditor - Horizontal split view with code editor and compiled preview or chat
 *
 * Provides a resizable split pane with the Monaco editor on the left
 * and either the compiled markdown preview or AI chat on the right.
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import PrompdEditor, { PendingEdit } from './PrompdEditor'
import { CompiledPreview } from './CompiledPreview'
import { ChatTab } from './ChatTab'
import { GripVertical, Maximize2, Minimize2, X, Plus, MessageSquare } from 'lucide-react'
import { PrompdIcon } from '../components/PrompdIcon'
import { ConversationSidebar } from '../components/ConversationSidebar'
import { conversationStorage, type ConversationMeta } from '../services/conversationStorage'
import type { Tab } from '../../stores/types'

/** Interactive P icon — gradient chases the mouse across the header bar */
function GradientPrompdIcon({ size = 14, headerRef }: { size?: number; headerRef: React.RefObject<HTMLDivElement | null> }) {
  const iconRef = useRef<HTMLDivElement>(null)
  const [angle, setAngle] = useState(135)
  const [active, setActive] = useState(false)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const header = headerRef.current
    if (!header) return

    const onMove = (e: MouseEvent) => {
      if (!iconRef.current) return
      // Throttle via rAF
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

    header.addEventListener('mousemove', onMove)
    header.addEventListener('mouseleave', onLeave)
    return () => {
      header.removeEventListener('mousemove', onMove)
      header.removeEventListener('mouseleave', onLeave)
      cancelAnimationFrame(rafRef.current)
    }
  }, [headerRef])

  // SVG path data for the P mask (same as PrompdIcon)
  const maskSvg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 475 487">` +
    `<path fill="white" d="M 271.6313,29.109924 C 456.06055,29.109924 454.60452,304.1 270.40336,304.1 L 228,304 v -47.30173 l 43.85191,0.0317 c 118.41324,0 116.08205,-178.966717 -0.82527,-178.966717 L 132.15087,77.622831 129.6,420.52 c -0.33992,0.0728 -45.968529,35.12868 -45.968529,35.12868 L 83.506489,28.866413 Z"/>` +
    `<path fill="white" d="m 156,102 103.33423,0.32678 c 88.07508,0 87.938,129.66692 1.26051,129.66692 l -32.5414,0.0925 -0.0533,-47.08616 32.66331,-0.23913 c 27.90739,0 25.69827,-34.89447 -0.0611,-34.99087 L 204.00004,150 c 0.90517,68.30467 0.52,211.29643 0.52,211.29643 0,0 -48.54879,38.04493 -48.62668,38.05052 z"/>` +
    `</svg>`
  )

  return (
    <div
      ref={iconRef}
      style={{
        width: size,
        height: size,
        background: active
          ? `conic-gradient(from ${angle}deg, #06b6d4, #8b5cf6, #ec4899, #f59e0b, #06b6d4)`
          : 'var(--accent)',
        WebkitMaskImage: `url("data:image/svg+xml,${maskSvg}")`,
        maskImage: `url("data:image/svg+xml,${maskSvg}")`,
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        transition: active ? 'none' : 'background 0.4s ease',
        flexShrink: 0
      }}
    />
  )
}

interface SplitEditorProps {
  /** The .prmd file content */
  value: string
  /** Callback when content changes */
  onChange: (v: string) => void
  /** Jump to specific line/column */
  jumpTo?: { line: number; column?: number }
  /** Theme for styling */
  theme: 'light' | 'dark'
  /** Cursor position callback */
  onCursorChange?: (pos: { line: number; column: number }) => void
  /** Monaco language ID */
  language?: string
  /** Read-only mode */
  readOnly?: boolean
  /** Current file path for IntelliSense */
  currentFilePath?: string
  /** Workspace root for .editorconfig */
  workspacePath?: string | null
  /** Tab ID for undo/redo history */
  tabId?: string
  /** Inline diff view props */
  pendingEdit?: PendingEdit | null
  onAcceptEdit?: () => void
  onDeclineEdit?: () => void
  /** Whether to show the preview panel */
  showPreview: boolean
  /** Callback to close preview */
  onClosePreview: () => void
  /** Parameters for template substitution in preview */
  parameters?: Record<string, unknown>
  /** Callback when preview parameters change */
  onParametersChange?: (params: Record<string, unknown>) => void
  /** Whether to show context sections in preview */
  showContextSections?: boolean
  /** Has folder open (for file browser) */
  hasFolderOpen?: boolean
  /** File upload handler for context sections */
  onFileUpload?: (sectionName: string, files: File[]) => Promise<string[]>
  /** Select from browser handler */
  onSelectFromBrowser?: (sectionName: string) => Promise<string | null>
  /** Execute handler */
  onExecute?: () => void
  /** Is executing */
  isExecuting?: boolean
  /** Whether to show the chat panel */
  showChat?: boolean
  /** Callback to close chat */
  onCloseChat?: () => void
  /** Synthetic tab object for the embedded ChatTab */
  chatTab?: Tab
  /** Workspace path for chat tool execution */
  chatWorkspacePath?: string | null
  /** Callback when chat generates prompd content */
  onChatGenerated?: (prompd: string, filename: string, metadata: Record<string, unknown>) => void
  /** Callback to start a new chat conversation */
  onNewChat?: () => void
  /** Callback when a conversation is selected from history */
  onSelectConversation?: (conversationId: string) => void
}

export function SplitEditor({
  value,
  onChange,
  jumpTo,
  theme,
  onCursorChange,
  language = 'prompd',
  readOnly = false,
  currentFilePath,
  workspacePath,
  tabId,
  pendingEdit,
  onAcceptEdit,
  onDeclineEdit,
  showPreview,
  onClosePreview,
  parameters = {},
  onParametersChange,
  showContextSections = true,
  hasFolderOpen = false,
  onFileUpload,
  onSelectFromBrowser,
  onExecute,
  isExecuting = false,
  showChat = false,
  onCloseChat,
  chatTab,
  chatWorkspacePath,
  onChatGenerated,
  onNewChat,
  onSelectConversation
}: SplitEditorProps) {
  // Right pane is visible when either preview or chat is shown
  const showRightPane = showPreview || showChat

  // Split position as percentage (0-100)
  const [splitPosition, setSplitPosition] = useState(50)
  const [isDragging, setIsDragging] = useState(false)
  const [isRightPaneMaximized, setIsRightPaneMaximized] = useState(false)
  const [showConversationSidebar, setShowConversationSidebar] = useState(false)
  const [conversationList, setConversationList] = useState<ConversationMeta[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const chatHeaderRef = useRef<HTMLDivElement>(null)
  // Track if chat has ever been opened so we keep it mounted (hidden) when switching to Preview
  const chatHasBeenOpened = useRef(false)
  if (showChat) chatHasBeenOpened.current = true

  // Refresh conversation list when sidebar opens
  useEffect(() => {
    if (showConversationSidebar) {
      setConversationList(conversationStorage.list())
    }
  }, [showConversationSidebar])

  // Handle resize drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return

    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentage = (x / rect.width) * 100

    // Clamp between 20% and 80%
    setSplitPosition(Math.max(20, Math.min(80, percentage)))
  }, [isDragging])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Attach/detach global mouse events for dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  // Calculate widths
  const editorWidth = showRightPane
    ? (isRightPaneMaximized ? 0 : splitPosition)
    : 100
  const rightPaneWidth = showRightPane
    ? (isRightPaneMaximized ? 100 : 100 - splitPosition)
    : 0

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        height: '100%',
        width: '100%',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Editor pane */}
      {(!showRightPane || !isRightPaneMaximized) && (
        <div
          style={{
            width: `${editorWidth}%`,
            height: '100%',
            overflow: 'hidden',
            flexShrink: 0,
            transition: isDragging ? 'none' : 'width 0.15s ease'
          }}
        >
          <PrompdEditor
            value={value}
            onChange={onChange}
            jumpTo={jumpTo}
            theme={theme}
            onCursorChange={onCursorChange}
            language={language}
            readOnly={readOnly}
            currentFilePath={currentFilePath}
            workspacePath={workspacePath}
            tabId={tabId}
            pendingEdit={pendingEdit}
            onAcceptEdit={onAcceptEdit}
            onDeclineEdit={onDeclineEdit}
          />
        </div>
      )}

      {/* Resize handle */}
      {showRightPane && !isRightPaneMaximized && (
        <div
          onMouseDown={handleMouseDown}
          style={{
            width: '6px',
            height: '100%',
            background: theme === 'dark' ? 'var(--border)' : '#e2e8f0',
            cursor: 'col-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'background 0.15s',
            position: 'relative',
            zIndex: 10
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = theme === 'dark' ? 'var(--accent)' : '#3b82f6'
          }}
          onMouseLeave={(e) => {
            if (!isDragging) {
              e.currentTarget.style.background = theme === 'dark' ? 'var(--border)' : '#e2e8f0'
            }
          }}
        >
          <GripVertical
            size={12}
            style={{
              color: theme === 'dark' ? 'var(--text-muted)' : '#94a3b8',
              opacity: 0.6
            }}
          />
        </div>
      )}

      {/* Right pane */}
      {showRightPane && (
        <div
          style={{
            width: `${rightPaneWidth}%`,
            height: '100%',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
            transition: isDragging ? 'none' : 'width 0.15s ease',
            borderLeft: isRightPaneMaximized ? 'none' : undefined
          }}
        >
          {/* Preview mode */}
          {showPreview && (
            <CompiledPreview
              content={value}
              parameters={parameters}
              onParametersChange={onParametersChange}
              theme={theme}
              height="100%"
              showMeta={true}
              debounceMs={500}
              filePath={currentFilePath}
              workspacePath={workspacePath}
              isMaximized={isRightPaneMaximized}
              onToggleMaximize={() => setIsRightPaneMaximized(!isRightPaneMaximized)}
              onClose={onClosePreview}
              showContextSections={showContextSections}
              onContextSectionsChange={onChange}
              onFileUpload={onFileUpload}
              onSelectFromBrowser={onSelectFromBrowser}
              hasFolderOpen={hasFolderOpen}
              onExecute={onExecute}
              isExecuting={isExecuting}
            />
          )}

          {/* Chat mode - kept mounted once opened so state persists across Preview/Chat toggles */}
          {chatTab && chatHasBeenOpened.current && (
            <div style={{
              display: showChat ? 'flex' : 'none',
              flexDirection: 'column',
              flex: 1,
              overflow: 'hidden'
            }}>
              {/* Conversation History Sidebar */}
              <ConversationSidebar
                conversations={conversationList}
                currentConversationId={chatTab.chatConfig?.conversationId || null}
                onSelectConversation={(id) => {
                  if (onSelectConversation) onSelectConversation(id)
                  setShowConversationSidebar(false)
                }}
                onNewConversation={() => {
                  if (onNewChat) onNewChat()
                  setConversationList(conversationStorage.list())
                  setShowConversationSidebar(false)
                }}
                onDeleteConversation={async (id) => {
                  await conversationStorage.delete(id)
                  setConversationList(conversationStorage.list())
                  if (chatTab.chatConfig?.conversationId === id && onNewChat) {
                    onNewChat()
                  }
                }}
                onRenameConversation={async (id, newTitle) => {
                  await conversationStorage.rename(id, newTitle)
                  setConversationList(conversationStorage.list())
                }}
                onPinConversation={async (id, isPinned) => {
                  await conversationStorage.pin(id, isPinned)
                  setConversationList(conversationStorage.list())
                }}
                onExportConversation={async (id, format) => {
                  const conv = await conversationStorage.load(id)
                  if (!conv) return
                  let content: string
                  let ext: string
                  if (format === 'markdown') {
                    content = conv.messages.map(m => `## ${m.role}\n\n${m.content}`).join('\n\n---\n\n')
                    ext = 'md'
                  } else {
                    content = JSON.stringify(conv, null, 2)
                    ext = 'json'
                  }
                  const blob = new Blob([content], { type: 'text/plain' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `${conv.title || 'conversation'}.${ext}`
                  a.click()
                  URL.revokeObjectURL(url)
                }}
                isOpen={showConversationSidebar}
                onClose={() => setShowConversationSidebar(false)}
              />
              {/* Chat pane header */}
              <div ref={chatHeaderRef} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '0 10px',
                height: '32px',
                borderBottom: `1px solid ${theme === 'dark' ? 'var(--border)' : '#e2e8f0'}`,
                background: theme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
                flexShrink: 0
              }}>
                <GradientPrompdIcon size={14} headerRef={chatHeaderRef} />
                <span style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: theme === 'dark' ? 'var(--text-secondary)' : 'rgba(0,0,0,0.6)',
                  flex: 1
                }}>AI Chat</span>
                <button
                  onClick={() => {
                    if (onNewChat) onNewChat()
                    setConversationList(conversationStorage.list())
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '22px',
                    height: '22px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    color: theme === 'dark' ? 'var(--text-muted)' : 'rgba(0,0,0,0.4)',
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'
                    e.currentTarget.style.color = theme === 'dark' ? 'var(--text-primary)' : 'rgba(0,0,0,0.8)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = theme === 'dark' ? 'var(--text-muted)' : 'rgba(0,0,0,0.4)'
                  }}
                  title="New Chat"
                >
                  <Plus size={12} />
                </button>
                <button
                  onClick={() => setShowConversationSidebar(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '22px',
                    height: '22px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    color: theme === 'dark' ? 'var(--text-muted)' : 'rgba(0,0,0,0.4)',
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'
                    e.currentTarget.style.color = theme === 'dark' ? 'var(--text-primary)' : 'rgba(0,0,0,0.8)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = theme === 'dark' ? 'var(--text-muted)' : 'rgba(0,0,0,0.4)'
                  }}
                  title="Chat History"
                >
                  <MessageSquare size={12} />
                </button>
                <button
                  onClick={() => setIsRightPaneMaximized(!isRightPaneMaximized)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '22px',
                    height: '22px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    color: theme === 'dark' ? 'var(--text-muted)' : 'rgba(0,0,0,0.4)',
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'
                    e.currentTarget.style.color = theme === 'dark' ? 'var(--text-primary)' : 'rgba(0,0,0,0.8)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = theme === 'dark' ? 'var(--text-muted)' : 'rgba(0,0,0,0.4)'
                  }}
                  title={isRightPaneMaximized ? 'Restore' : 'Maximize'}
                >
                  {isRightPaneMaximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                </button>
                <button
                  onClick={onCloseChat}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '22px',
                    height: '22px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    color: theme === 'dark' ? 'var(--text-muted)' : 'rgba(0,0,0,0.4)',
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'
                    e.currentTarget.style.color = theme === 'dark' ? 'var(--text-primary)' : 'rgba(0,0,0,0.8)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = theme === 'dark' ? 'var(--text-muted)' : 'rgba(0,0,0,0.4)'
                  }}
                  title="Close chat"
                >
                  <X size={12} />
                </button>
              </div>
              {/* Chat component */}
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                <ChatTab
                  key={chatTab.chatConfig?.conversationId || chatTab.id}
                  tab={chatTab}
                  getText={() => value}
                  setText={onChange}
                  theme={theme}
                  workspacePath={chatWorkspacePath}
                  onPrompdGenerated={onChatGenerated}
                  embedded={true}
                />
                {/* Conversation History Sidebar */}
                <ConversationSidebar
                  conversations={conversationList}
                  currentConversationId={chatTab.chatConfig?.conversationId || null}
                  onSelectConversation={(id) => {
                    if (onSelectConversation) onSelectConversation(id)
                    setShowConversationSidebar(false)
                  }}
                  onNewConversation={() => {
                    if (onNewChat) onNewChat()
                    setShowConversationSidebar(false)
                  }}
                  onDeleteConversation={async (id) => {
                    await conversationStorage.delete(id)
                    setConversationList(conversationStorage.list())
                    if (chatTab.chatConfig?.conversationId === id && onNewChat) {
                      onNewChat()
                    }
                  }}
                  onRenameConversation={async (id, newTitle) => {
                    await conversationStorage.rename(id, newTitle)
                    setConversationList(conversationStorage.list())
                  }}
                  onPinConversation={async (id, isPinned) => {
                    await conversationStorage.pin(id, isPinned)
                    setConversationList(conversationStorage.list())
                  }}
                  onExportConversation={async (id, format) => {
                    const conv = await conversationStorage.load(id)
                    if (conv) {
                      if (format === 'json') {
                        const json = JSON.stringify(conv, null, 2)
                        const blob = new Blob([json], { type: 'application/json' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = `${conv.title || 'conversation'}.json`
                        a.click()
                        URL.revokeObjectURL(url)
                      } else {
                        const markdown = conv.messages.map(m => `**${m.role}:** ${m.content}`).join('\n\n---\n\n')
                        const blob = new Blob([markdown], { type: 'text/markdown' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = `${conv.title || 'conversation'}.md`
                        a.click()
                        URL.revokeObjectURL(url)
                      }
                    }
                  }}
                  isOpen={showConversationSidebar}
                  onClose={() => setShowConversationSidebar(false)}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default SplitEditor

/**
 * BrainstormTab - Collaborative editor tab with working copy isolation.
 *
 * Opens as a separate tab (type: 'brainstorm') for any text file.
 * The user and AI agent edit a temporary working copy back and forth.
 * Only when the user clicks "Apply Changes" does the content get
 * written back to the actual file.
 *
 * View modes controlled by EditorHeader's Design/Code toggle (tab.viewMode):
 *   - design: BlockCanvas (metadata blocks) + WysiwygEditor (body) in single scroll
 *   - code:   Full file in PrompdEditor (Monaco), fills the pane
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { MessageSquare, PanelRightClose, Check, RotateCcw } from 'lucide-react'
import { BlockCanvas } from './BlockCanvas'
import WysiwygEditor from '../components/WysiwygEditor'
import PrompdEditor from '../editor/PrompdEditor'
import { ChatTab } from '../editor/ChatTab'
import type { BrainstormTabProps, BlockProposal, ProposalResult } from './types'
import type { Tab } from '../../stores/types'

/** Detect Monaco language from file extension */
function languageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'prmd': return 'prompd'
    case 'md': return 'markdown'
    case 'json': return 'json'
    case 'yaml': case 'yml': return 'yaml'
    case 'js': return 'javascript'
    case 'ts': return 'typescript'
    case 'py': return 'python'
    case 'html': return 'html'
    case 'css': return 'css'
    case 'xml': return 'xml'
    case 'sh': case 'bash': return 'shell'
    default: return 'plaintext'
  }
}

export function BrainstormTab({
  tab,
  theme,
  workspacePath,
  onApply,
  onChatGenerated
}: BrainstormTabProps) {
  const config = tab.brainstormConfig
  const sourceFilePath = config?.sourceFilePath || tab.name

  // View mode from EditorHeader's Design/Code toggle (persisted on tab)
  const viewMode = tab.viewMode === 'code' ? 'code' : 'design'

  // Detect if this is a .prmd file for structured block editing
  const isPrompdFile = useMemo(() => {
    const lower = sourceFilePath.toLowerCase()
    return lower.endsWith('.prmd') || lower.endsWith('.prompd')
  }, [sourceFilePath])

  // Detect Monaco language from file extension
  const monacoLanguage = useMemo(() => languageFromPath(sourceFilePath), [sourceFilePath])

  // ── Working copy state ──────────────────────────────────────────────────
  const [workingValue, setWorkingValue] = useState(tab.text)
  const [baseValue, setBaseValue] = useState(tab.text)
  const workingValueRef = useRef(workingValue)
  workingValueRef.current = workingValue

  // Wrap setter so the ref updates immediately (before React re-renders).
  // This ensures getText() returns fresh content right after tool calls.
  const setWorkingValueWithRef = useCallback((value: string) => {
    workingValueRef.current = value
    setWorkingValue(value)
  }, [])

  // Sync when source tab content changes externally (only if not dirty)
  useEffect(() => {
    if (tab.text !== baseValue) {
      const isDirty = workingValueRef.current !== baseValue
      if (!isDirty) {
        setWorkingValue(tab.text)
      }
      setBaseValue(tab.text)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.text, baseValue])

  // For .prmd files in design mode, split frontmatter from body so
  // BlockCanvas handles YAML and WysiwygEditor handles markdown body.
  const { frontmatterSection, bodyContent } = useMemo(() => {
    if (!isPrompdFile) return { frontmatterSection: '', bodyContent: workingValue }

    const normalized = workingValue.replace(/\r\n/g, '\n')
    const lines = normalized.split('\n')

    // Skip any leading blank lines (e.g. from LLM CDATA output) before looking for ---
    let startIdx = 0
    while (startIdx < lines.length && lines[startIdx].trim() === '') {
      startIdx++
    }

    if (lines[startIdx]?.trim() === '---') {
      const endIdx = lines.findIndex((l, i) => i > startIdx && l.trim() === '---')
      if (endIdx > startIdx) {
        return {
          frontmatterSection: lines.slice(startIdx, endIdx + 1).join('\n'),
          bodyContent: lines.slice(endIdx + 1).join('\n')
        }
      }
    }

    return { frontmatterSection: '', bodyContent: workingValue }
  }, [workingValue, isPrompdFile])

  // When WysiwygEditor changes, reconstruct the full .prmd document
  const handleContentChange = useCallback((newBody: string) => {
    if (isPrompdFile && frontmatterSection) {
      setWorkingValueWithRef(frontmatterSection + '\n' + newBody)
    } else {
      setWorkingValueWithRef(newBody)
    }
  }, [isPrompdFile, frontmatterSection, setWorkingValueWithRef])

  const isDirty = workingValue !== baseValue
  const hasContent = workingValue.trim().length > 0

  // Apply working copy to the actual file
  const handleApply = useCallback(() => {
    onApply(workingValue)
    setBaseValue(workingValue)
  }, [workingValue, onApply])

  // Discard working copy, revert to source
  const handleDiscard = useCallback(() => {
    setWorkingValue(baseValue)
  }, [baseValue])

  // ── Layout state ────────────────────────────────────────────────────────
  const [splitPosition, setSplitPosition] = useState(55)
  const [showChat, setShowChat] = useState(true)
  const isDragging = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // ── Proposal state ──────────────────────────────────────────────────────
  const [activeProposal, setActiveProposal] = useState<BlockProposal | null>(null)
  const proposalResolveRef = useRef<((result: ProposalResult) => void) | null>(null)

  const handleProposalWithResolve = useCallback((proposal: BlockProposal, resolve: (result: ProposalResult) => void) => {
    setActiveProposal(proposal)
    proposalResolveRef.current = resolve
  }, [])

  // Register global handler for agent integration
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__brainstormProposalHandler = handleProposalWithResolve
    return () => {
      delete (window as unknown as Record<string, unknown>).__brainstormProposalHandler
    }
  }, [handleProposalWithResolve])

  const handleProposalAction = useCallback((result: ProposalResult) => {
    setActiveProposal(null)
    if (proposalResolveRef.current) {
      proposalResolveRef.current(result)
      proposalResolveRef.current = null
    }
  }, [])

  // ── Chat tab object ─────────────────────────────────────────────────────
  const chatTab = useMemo((): Tab => ({
    id: `chat-brainstorm-${tab.id}`,
    name: 'Chat',
    text: '',
    type: 'chat',
    chatConfig: {
      mode: 'brainstorm',
      contextFile: config?.sourceTabId || tab.id,
      conversationId: config?.conversationId
    }
  }), [tab.id, config?.sourceTabId, config?.conversationId])

  // ── Draggable split divider ─────────────────────────────────────────────
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true

    const handleDrag = (moveEvent: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const pct = ((moveEvent.clientX - rect.left) / rect.width) * 100
      setSplitPosition(Math.max(25, Math.min(75, pct)))
    }

    const handleDragEnd = () => {
      isDragging.current = false
      document.removeEventListener('mousemove', handleDrag)
      document.removeEventListener('mouseup', handleDragEnd)
    }

    document.addEventListener('mousemove', handleDrag)
    document.addEventListener('mouseup', handleDragEnd)
  }, [])

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        background: 'var(--panel)'
      }}
    >
      {/* Working copy status bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 16px',
        borderBottom: '1px solid var(--border)',
        background: isDirty
          ? (theme === 'dark' ? 'rgba(59, 130, 246, 0.06)' : 'rgba(59, 130, 246, 0.04)')
          : (theme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)'),
        flexShrink: 0
      }}>
        <span style={{
          fontSize: '11px',
          fontWeight: 500,
          color: isDirty ? 'var(--accent)' : 'var(--text-muted)'
        }}>
          {isDirty ? 'Working copy has changes' : 'Brainstorm'}
        </span>

        <div style={{ flex: 1 }} />

        {isDirty && (
          <>
            <button
              onClick={handleDiscard}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '3px 10px', fontSize: '11px', fontWeight: 500,
                background: 'transparent', color: 'var(--text-secondary)',
                border: '1px solid var(--border)', borderRadius: '4px',
                cursor: 'pointer'
              }}
              title="Discard changes and revert to saved file"
            >
              <RotateCcw size={11} /> Discard
            </button>
            <button
              onClick={handleApply}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '3px 10px', fontSize: '11px', fontWeight: 500,
                background: 'var(--success)', color: 'white',
                border: 'none', borderRadius: '4px',
                cursor: 'pointer'
              }}
              title="Apply changes to the file"
            >
              <Check size={11} /> Apply Changes
            </button>
          </>
        )}

        {!isDirty && !hasContent && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Ask the agent to help, or start editing below
          </span>
        )}

        {/* Chat toggle when hidden */}
        {!showChat && (
          <button
            onClick={() => setShowChat(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '3px 10px', fontSize: '11px',
              background: 'var(--bg)', color: 'var(--accent)',
              border: '1px solid var(--border)', borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            <MessageSquare size={11} /> Chat
          </button>
        )}
      </div>

      {/* Main split layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left pane: editor area */}
        <div style={{
          width: showChat ? `${splitPosition}%` : '100%',
          height: '100%',
          // Code mode: flex column so Monaco fills remaining space (owns scroll)
          // Design mode: single overflow scroll for blocks + WYSIWYG
          ...(viewMode === 'code'
            ? { display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' }
            : { overflow: 'auto' }),
          transition: showChat ? 'none' : 'width 0.2s'
        }}>
          {viewMode === 'code' ? (
            // Code mode: full file in Monaco — fills remaining space
            <div style={{ flex: 1, minHeight: 0 }}>
              <PrompdEditor
                value={workingValue}
                onChange={setWorkingValueWithRef}
                theme={theme}
                language={monacoLanguage}
                tabId={tab.id}
              />
            </div>
          ) : (
            // Design mode: BlockCanvas (metadata) + WysiwygEditor (body)
            <>
              {isPrompdFile && (
                <BlockCanvas
                  value={workingValue}
                  onChange={setWorkingValueWithRef}
                  theme={theme}
                  excludeBlocks={['content']}
                  proposal={activeProposal}
                  onProposalAction={handleProposalAction}
                />
              )}
              <div style={{ padding: '8px 0' }}>
                <WysiwygEditor
                  value={bodyContent}
                  onChange={handleContentChange}
                  height="auto"
                  theme={theme}
                  placeholder="Start writing content..."
                  showToolbar={true}
                />
              </div>
            </>
          )}
        </div>

        {/* Draggable divider */}
        {showChat && (
          <div
            onMouseDown={handleDragStart}
            style={{
              width: '4px',
              cursor: 'col-resize',
              background: 'var(--border)',
              flexShrink: 0,
              position: 'relative',
              zIndex: 5
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)' }}
            onMouseLeave={e => { if (!isDragging.current) e.currentTarget.style.background = 'var(--border)' }}
          />
        )}

        {/* Right pane: ChatTab */}
        {showChat && (
          <div style={{
            width: `${100 - splitPosition}%`,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderLeft: '1px solid var(--border)'
          }}>
            {/* Chat header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0 10px',
              height: '32px',
              borderBottom: '1px solid var(--border)',
              background: theme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
              flexShrink: 0
            }}>
              <MessageSquare size={12} style={{ color: 'var(--accent)' }} />
              <span style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                flex: 1
              }}>
                AI Chat
              </span>
              <button
                onClick={() => setShowChat(false)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '22px', height: '22px', background: 'transparent',
                  border: 'none', borderRadius: '4px', cursor: 'pointer',
                  color: 'var(--text-muted)'
                }}
                title="Hide chat"
              >
                <PanelRightClose size={12} />
              </button>
            </div>

            {/* ChatTab — reads/writes the working copy */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <ChatTab
                tab={chatTab}
                theme={theme}
                workspacePath={workspacePath}
                onPrompdGenerated={onChatGenerated}
                embedded={true}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

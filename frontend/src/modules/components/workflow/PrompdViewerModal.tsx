/**
 * PrompdViewerModal - Full SplitEditor modal for editing local .prmd files.
 * Embeds the same SplitEditor used in the main editor tab, with IntelliSense,
 * hovers, validation, compiled preview, and chat panel.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { FileText, Save, X } from 'lucide-react'
import { useUIStore, useEditorStore, selectTheme } from '@/stores'
import { SplitEditor } from '../../editor/SplitEditor'
import { PreviewToggle, ChatToggle } from '../../editor/SplitViewToggles'
import { conversationStorage } from '../../services/conversationStorage'
import type { Tab } from '../../../stores/types'

interface PrompdViewerModalProps {
  isOpen: boolean
  /** Display source (e.g. relative path or package ref) */
  source: string
  /** Absolute path to read/write from (for local files) */
  resolvedPath?: string
  onClose: () => void
}

const electronAPI = (window as Window & {
  electronAPI?: {
    isElectron: boolean
    readFile: (path: string) => Promise<{ success: boolean; content?: string; error?: string }>
    writeFile: (path: string, content: string) => Promise<{ success: boolean; error?: string }>
    showOpenDialog: (options: Record<string, unknown>) => Promise<string[] | null>
  }
}).electronAPI

export function PrompdViewerModal({ isOpen, source, resolvedPath, onClose }: PrompdViewerModalProps) {
  const theme = useUIStore(selectTheme)
  const explorerDirPath = useEditorStore(state => state.explorerDirPath)
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [previewParams, setPreviewParams] = useState<Record<string, unknown>>({})
  const [chatConversationId, setChatConversationId] = useState<string | undefined>(undefined)
  const originalContentRef = useRef<string>('')
  const contentRef = useRef<string>('')

  // Stable ID for the modal's chat tab
  const modalTabId = useRef(`prompd-viewer-${Date.now()}`).current

  const readPath = resolvedPath || source

  // Derive the file's directory for workspacePath
  const fileDirPath = readPath
    ? readPath.replace(/[/\\][^/\\]*$/, '')
    : null

  // Load file content
  useEffect(() => {
    if (!isOpen || !readPath) return

    let cancelled = false
    setLoading(true)
    setError(null)
    setContent(null)
    setDirty(false)
    setShowPreview(false)
    setShowChat(false)

    loadFile(readPath).then(result => {
      if (cancelled) return
      if (result.error) {
        setError(result.error)
      } else {
        const text = result.content ?? ''
        setContent(text)
        originalContentRef.current = text
        contentRef.current = text
      }
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [isOpen, readPath])

  // Save handler
  const handleSave = useCallback(async () => {
    if (!dirty || !readPath) return
    setSaving(true)
    try {
      if (!electronAPI?.isElectron) {
        setError('Saving requires the desktop application.')
        return
      }
      const result = await electronAPI.writeFile(readPath, contentRef.current)
      if (result.success) {
        originalContentRef.current = contentRef.current
        setDirty(false)
      } else {
        setError(result.error || 'Failed to save file.')
      }
    } catch (err) {
      setError(`Failed to save: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }, [dirty, readPath])

  // Close with dirty check
  const handleClose = useCallback(() => {
    if (dirty) {
      const discard = window.confirm('You have unsaved changes. Discard them?')
      if (!discard) return
    }
    setContent(null)
    setDirty(false)
    onClose()
  }, [dirty, onClose])

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      }
      // Ctrl+S / Cmd+S to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    // Use capture to intercept before Monaco
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [isOpen, handleClose, handleSave])

  // onChange from SplitEditor
  const handleChange = useCallback((v: string) => {
    setContent(v)
    contentRef.current = v
    setDirty(v !== originalContentRef.current)
  }, [])

  const handleSelectFromBrowser = useCallback(async (sectionName: string) => {
    const files = await electronAPI?.showOpenDialog({
      title: `Select file for ${sectionName} section`,
      filters: [{ name: 'All Files', extensions: ['*'] }],
      properties: ['openFile']
    })
    if (files && files.length > 0) {
      return files[0]
    }
    return null
  }, [])

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={handleClose}
    >
      <div
        style={{
          width: 'min(1400px, 95vw)',
          height: 'min(90vh, 950px)',
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <FileText size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <strong style={{ fontSize: '13px' }}>View Prompd File</strong>
            <code style={{
              fontSize: '12px',
              color: 'var(--text-secondary)',
              fontFamily: 'monospace',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {source}
            </code>
            {dirty && (
              <span style={{
                fontSize: '11px',
                color: 'var(--warning, #ffcc02)',
                fontWeight: 600,
              }}>
                (unsaved)
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <PreviewToggle
              active={showPreview}
              onClick={() => {
                setShowPreview(p => {
                  if (!p) setShowChat(false)
                  return !p
                })
              }}
            />
            <ChatToggle
              active={showChat}
              onClick={() => {
                setShowChat(c => {
                  if (!c) setShowPreview(false)
                  return !c
                })
              }}
            />

            <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />

            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                background: dirty ? 'var(--accent)' : 'var(--panel-2)',
                color: dirty ? '#fff' : 'var(--text-secondary)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: dirty ? 'pointer' : 'default',
                opacity: dirty ? 1 : 0.5,
              }}
            >
              <Save size={14} />
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={handleClose}
              className="btn"
              style={{ padding: '4px 8px', fontSize: '14px' }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* SplitEditor area */}
        <div style={{ flex: 1, minHeight: 0 }}>
          {loading && (
            <div style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
              fontSize: '13px',
            }}>
              Loading...
            </div>
          )}

          {error && (
            <div style={{
              padding: '16px',
              margin: '16px',
              background: 'color-mix(in srgb, var(--error) 10%, var(--panel-2))',
              border: '1px solid color-mix(in srgb, var(--error) 30%, transparent)',
              borderRadius: '6px',
              color: 'var(--text)',
              fontSize: '13px',
            }}>
              {error}
            </div>
          )}

          {content !== null && (
            <SplitEditor
              value={content}
              onChange={handleChange}
              theme={theme}
              language="prompd"
              currentFilePath={readPath}
              workspacePath={explorerDirPath || fileDirPath}
              showPreview={showPreview}
              onClosePreview={() => setShowPreview(false)}
              parameters={previewParams}
              onParametersChange={setPreviewParams}
              showContextSections={true}
              hasFolderOpen={!!explorerDirPath}
              onSelectFromBrowser={handleSelectFromBrowser}
              showChat={showChat}
              onCloseChat={() => setShowChat(false)}
              chatTab={{
                id: `chat-modal-${modalTabId}`,
                name: 'Chat',
                text: '',
                type: 'chat' as const,
                chatConfig: { mode: 'agent', contextFile: modalTabId, conversationId: chatConversationId },
              } satisfies Tab}
              chatWorkspacePath={explorerDirPath || fileDirPath}
              onNewChat={() => {
                const newConv = conversationStorage.createConversation('confirm')
                setChatConversationId(newConv.id)
              }}
              onSelectConversation={(id: string) => {
                setChatConversationId(id)
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Load file content from disk via Electron IPC.
 */
async function loadFile(filePath: string): Promise<{ content?: string; error?: string }> {
  if (!electronAPI?.isElectron) {
    return { error: 'File reading requires the desktop application.' }
  }
  try {
    const result = await electronAPI.readFile(filePath)
    if (result.success && result.content !== undefined) {
      return { content: result.content }
    }
    return { error: result.error || 'Failed to read file.' }
  } catch (err) {
    return { error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` }
  }
}

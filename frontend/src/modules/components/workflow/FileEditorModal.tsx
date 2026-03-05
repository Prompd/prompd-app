/**
 * FileEditorModal - Monaco editor modal for editing generic files or inline content.
 *
 * Two modes:
 * 1. **File mode** (resolvedPath provided): reads/writes from disk via Electron IPC.
 * 2. **Content mode** (initialContent + onSaveContent provided): edits content in memory
 *    and calls back with the modified content on save.
 *
 * Used by workflow node properties (TransformNode, CodeNode, ToolNode) to expand
 * inline editors into a full-screen Monaco editor.
 * For .prmd files, use PrompdViewerModal instead (which has SplitEditor + IntelliSense).
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { FileText, Save, X, Code } from 'lucide-react'
import { Editor } from '@monaco-editor/react'
import { useUIStore, selectTheme } from '@/stores'
import { getMonacoTheme, registerPrompdThemes } from '../../lib/monacoConfig'
import { useConfirmDialog } from '../ConfirmDialog'

interface FileEditorModalBaseProps {
  isOpen: boolean
  /** Display label shown in the header */
  source: string
  onClose: () => void
}

/** File mode: reads/writes from disk */
interface FileEditorModalFileProps extends FileEditorModalBaseProps {
  resolvedPath: string
  initialContent?: undefined
  language?: string
  onSaveContent?: undefined
}

/** Content mode: edits in-memory content */
interface FileEditorModalContentProps extends FileEditorModalBaseProps {
  resolvedPath?: undefined
  initialContent: string
  language: string
  onSaveContent: (content: string) => void
}

export type FileEditorModalProps = FileEditorModalFileProps | FileEditorModalContentProps

const electronAPI = (window as Window & {
  electronAPI?: {
    isElectron: boolean
    readFile: (path: string) => Promise<{ success: boolean; content?: string; error?: string }>
    writeFile: (path: string, content: string) => Promise<{ success: boolean; error?: string }>
  }
}).electronAPI

/** Detect Monaco language from file extension */
function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    md: 'markdown', markdown: 'markdown',
    json: 'json', jsonc: 'json',
    yaml: 'yaml', yml: 'yaml',
    xml: 'xml', html: 'html', htm: 'html',
    css: 'css', scss: 'scss', less: 'less',
    js: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'typescript', jsx: 'javascript',
    py: 'python',
    sh: 'shell', bash: 'shell', zsh: 'shell',
    cs: 'csharp',
    go: 'go', rs: 'rust', sql: 'sql',
    txt: 'plaintext', text: 'plaintext', log: 'plaintext',
    env: 'plaintext', ini: 'ini', toml: 'plaintext', csv: 'plaintext',
  }
  return map[ext] || 'plaintext'
}

export function FileEditorModal(props: FileEditorModalProps) {
  const { isOpen, source, onClose } = props
  const isContentMode = props.initialContent !== undefined
  const theme = useUIStore(selectTheme)

  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const originalContentRef = useRef<string>('')
  const contentRef = useRef<string>('')
  const { showConfirm, ConfirmDialogComponent } = useConfirmDialog()

  const editorLanguage = isContentMode
    ? props.language
    : (props.language || detectLanguage(props.resolvedPath || source || ''))

  // Load content (file mode: from disk; content mode: from prop)
  useEffect(() => {
    if (!isOpen) return

    if (isContentMode) {
      const text = props.initialContent
      setContent(text)
      originalContentRef.current = text
      contentRef.current = text
      setLoading(false)
      setError(null)
      setDirty(false)
      return
    }

    // File mode
    const readPath = props.resolvedPath
    if (!readPath) return

    let cancelled = false
    setLoading(true)
    setError(null)
    setContent(null)
    setDirty(false)

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
  }, [isOpen, isContentMode, isContentMode ? props.initialContent : props.resolvedPath])

  // Save handler
  const handleSave = useCallback(async () => {
    if (!dirty) return
    setSaving(true)
    try {
      if (isContentMode) {
        props.onSaveContent(contentRef.current)
        originalContentRef.current = contentRef.current
        setDirty(false)
      } else {
        const readPath = props.resolvedPath
        if (!readPath) return
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
      }
    } catch (err) {
      setError(`Failed to save: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }, [dirty, isContentMode, isContentMode ? props.onSaveContent : props.resolvedPath])

  // Close with dirty check
  const handleClose = useCallback(async () => {
    if (dirty) {
      const discard = await showConfirm({
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. Discard them?',
        confirmLabel: 'Discard',
        confirmVariant: 'danger'
      })
      if (!discard) return
    }
    setContent(null)
    setDirty(false)
    onClose()
  }, [dirty, onClose, showConfirm])

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [isOpen, handleClose, handleSave])

  const handleChange = useCallback((v: string | undefined) => {
    const val = v ?? ''
    setContent(val)
    contentRef.current = val
    setDirty(val !== originalContentRef.current)
  }, [])

  if (!isOpen) return null

  const headerIcon = isContentMode
    ? <Code size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
    : <FileText size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />

  const headerTitle = isContentMode ? 'Editor' : 'Edit File'

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
          width: 'min(1100px, 90vw)',
          height: 'min(80vh, 800px)',
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
            {headerIcon}
            <strong style={{ fontSize: '13px' }}>{headerTitle}</strong>
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

        {/* Editor area */}
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
            <Editor
              value={content}
              onChange={handleChange}
              language={editorLanguage}
              theme={getMonacoTheme(theme === 'dark')}
              beforeMount={registerPrompdThemes}
              options={{
                minimap: { enabled: false },
                lineNumbers: 'on',
                fontSize: 13,
                padding: { top: 12 },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                wordWrap: 'on',
                renderWhitespace: 'selection',
              }}
            />
          )}
        </div>
      </div>
      <ConfirmDialogComponent />
    </div>
  )
}

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

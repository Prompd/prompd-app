/**
 * ApprovalDiffView Component
 *
 * Monaco-based side-by-side diff view for approval dialogs.
 * Shows original vs. modified content with syntax highlighting.
 * Handles large files by showing only changed regions.
 * Supports toggle between side-by-side and stacked (inline) view.
 */

import { useMemo, useState, useEffect, useRef } from 'react'
import { DiffEditor } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import { Loader2, AlertTriangle, FileText, ChevronUp, ChevronDown, Columns, Rows, Plus, Minus } from 'lucide-react'
import { detectLanguage, isLargeFile, isBinaryContent, extractChangedRegions } from '../services/diffUtils'
import { registerPrompdThemes, getMonacoTheme } from '../lib/monacoConfig'

// ============================================================================
// Types
// ============================================================================

export interface ApprovalDiffViewProps {
  /** Original file content (current state) */
  originalContent: string
  /** Modified content (after applying edits) */
  modifiedContent: string
  /** File path for language detection and display */
  filePath?: string
  /** Theme for Monaco editor */
  theme?: 'light' | 'dark'
  /** Line count threshold for "large file" mode (default: 200) */
  lineThreshold?: number
  /** Context lines to show around changes in large file mode (default: 5) */
  contextLines?: number
  /** Show loading state */
  isLoading?: boolean
  /** Error message to display */
  loadError?: string | null
  /** Height of the diff editor (default: 300px) */
  height?: number | string
  /** Initial view mode (default: 'side-by-side') */
  defaultViewMode?: 'side-by-side' | 'stacked'
  /** Edits array for stacked view (optional) */
  edits?: Array<{ search: string; replace: string }>
}

// ============================================================================
// Subcomponents
// ============================================================================

function LoadingState() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
      padding: '40px 20px',
      color: 'var(--prompd-muted)'
    }}>
      <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
      <span style={{ fontSize: '13px' }}>Loading file content...</span>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

function ErrorState({ error, fallbackContent }: { error: string; fallbackContent?: React.ReactNode }) {
  return (
    <div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 16px',
        background: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '6px',
        marginBottom: fallbackContent ? '12px' : 0
      }}>
        <AlertTriangle size={16} style={{ color: '#ef4444' }} />
        <span style={{ fontSize: '13px', color: '#fca5a5' }}>{error}</span>
      </div>
      {fallbackContent}
    </div>
  )
}

function BinaryFileWarning({ filePath }: { filePath?: string }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
      padding: '40px 20px',
      background: 'var(--prompd-panel)',
      borderRadius: '8px'
    }}>
      <FileText size={32} style={{ color: 'var(--prompd-muted)' }} />
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--prompd-text)', marginBottom: '4px' }}>
          Binary file detected
        </div>
        <div style={{ fontSize: '12px', color: 'var(--prompd-muted)' }}>
          {filePath || 'This file'} appears to be a binary file and cannot be displayed as text.
        </div>
      </div>
    </div>
  )
}

function DiffStats({ added, removed }: { added: number; removed: number }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      fontSize: '12px'
    }}>
      {added > 0 && (
        <span style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          color: '#22c55e'
        }}>
          <ChevronUp size={14} />
          +{added}
        </span>
      )}
      {removed > 0 && (
        <span style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          color: '#ef4444'
        }}>
          <ChevronDown size={14} />
          -{removed}
        </span>
      )}
    </div>
  )
}

/** Stacked diff view showing search/replace pairs */
function StackedDiffView({ edits, theme }: { edits: Array<{ search: string; replace: string }>; theme: 'light' | 'dark' }) {
  const maxEditsToShow = 5
  const visibleEdits = edits.slice(0, maxEditsToShow)
  const remainingCount = edits.length - maxEditsToShow

  const colors = theme === 'dark' ? {
    removeBg: 'rgba(239, 68, 68, 0.1)',
    removeBorder: 'rgba(239, 68, 68, 0.3)',
    removeLabel: '#ef4444',
    removeText: '#fca5a5',
    addBg: 'rgba(34, 197, 94, 0.1)',
    addBorder: 'rgba(34, 197, 94, 0.3)',
    addLabel: '#22c55e',
    addText: '#86efac',
    muted: '#94a3b8',
    panelBg: 'var(--prompd-panel, #1e293b)'
  } : {
    removeBg: 'rgba(239, 68, 68, 0.08)',
    removeBorder: 'rgba(239, 68, 68, 0.2)',
    removeLabel: '#dc2626',
    removeText: '#b91c1c',
    addBg: 'rgba(34, 197, 94, 0.08)',
    addBorder: 'rgba(34, 197, 94, 0.2)',
    addLabel: '#16a34a',
    addText: '#15803d',
    muted: '#64748b',
    panelBg: '#f8fafc'
  }

  return (
    <div style={{
      background: colors.panelBg,
      borderRadius: '6px',
      padding: '12px',
      fontFamily: 'ui-monospace, monospace',
      fontSize: '12px',
      overflow: 'auto',
      maxHeight: '400px'
    }}>
      {visibleEdits.map((edit, idx) => (
        <div key={idx} style={{ marginBottom: idx < visibleEdits.length - 1 ? '16px' : 0 }}>
          {edits.length > 1 && (
            <div style={{
              fontSize: '11px',
              color: colors.muted,
              marginBottom: '8px',
              fontWeight: 500
            }}>
              Change {idx + 1} of {edits.length}
            </div>
          )}

          {/* Remove section */}
          <div style={{
            background: colors.removeBg,
            border: `1px solid ${colors.removeBorder}`,
            borderRadius: '4px',
            padding: '8px 10px',
            marginBottom: '6px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              marginBottom: '6px',
              color: colors.removeLabel,
              fontSize: '10px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              <Minus size={10} />
              Remove
            </div>
            <pre style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: colors.removeText,
              fontSize: '11px',
              lineHeight: '1.5',
              maxHeight: '150px',
              overflow: 'auto'
            }}>
              {edit.search}
            </pre>
          </div>

          {/* Add section */}
          <div style={{
            background: colors.addBg,
            border: `1px solid ${colors.addBorder}`,
            borderRadius: '4px',
            padding: '8px 10px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              marginBottom: '6px',
              color: colors.addLabel,
              fontSize: '10px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              <Plus size={10} />
              Add
            </div>
            <pre style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: colors.addText,
              fontSize: '11px',
              lineHeight: '1.5',
              maxHeight: '150px',
              overflow: 'auto'
            }}>
              {edit.replace}
            </pre>
          </div>
        </div>
      ))}
      {remainingCount > 0 && (
        <div style={{
          fontSize: '11px',
          color: colors.muted,
          fontStyle: 'italic',
          marginTop: '12px',
          padding: '4px 0'
        }}>
          ...and {remainingCount} more change{remainingCount !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function ApprovalDiffView({
  originalContent,
  modifiedContent,
  filePath,
  theme = 'dark',
  lineThreshold = 200,
  contextLines = 5,
  isLoading = false,
  loadError = null,
  height = 300,
  defaultViewMode = 'side-by-side',
  edits
}: ApprovalDiffViewProps) {
  const [viewMode, setViewMode] = useState<'side-by-side' | 'stacked'>(defaultViewMode)
  const editorRef = useRef<Monaco.editor.IStandaloneDiffEditor | null>(null)

  // Dispose DiffEditor on unmount to prevent stale hover/marker references
  useEffect(() => {
    return () => {
      if (editorRef.current) {
        try { editorRef.current.dispose() } catch {}
        editorRef.current = null
      }
    }
  }, [])

  // Detect language from file path
  const language = useMemo(() => detectLanguage(filePath || ''), [filePath])

  // Check if content is binary
  const isBinary = useMemo(() => {
    return isBinaryContent(originalContent) || isBinaryContent(modifiedContent)
  }, [originalContent, modifiedContent])

  // Check if file is large
  const isLarge = useMemo(() => {
    return isLargeFile(originalContent, lineThreshold) || isLargeFile(modifiedContent, lineThreshold)
  }, [originalContent, modifiedContent, lineThreshold])

  // Extract regions for large files
  const regions = useMemo(() => {
    if (!isLarge) return null
    return extractChangedRegions(originalContent, modifiedContent, contextLines)
  }, [originalContent, modifiedContent, isLarge, contextLines])

  // Calculate diff stats including token estimation
  const stats = useMemo(() => {
    const originalLines = originalContent.split('\n').length
    const modifiedLines = modifiedContent.split('\n').length
    const added = Math.max(0, modifiedLines - originalLines)
    const removed = Math.max(0, originalLines - modifiedLines)
    // Estimate tokens: ~4 chars per token is a reasonable approximation for code
    const modifiedTokens = Math.ceil(modifiedContent.length / 4)
    return { added, removed, originalLines, modifiedLines, modifiedTokens }
  }, [originalContent, modifiedContent])

  // Get Monaco theme name
  const monacoTheme = getMonacoTheme(theme === 'dark')

  // Theme colors for UI elements
  const colors = theme === 'dark' ? {
    bg: '#0b1220',
    headerBg: '#1e293b',
    border: 'rgba(71, 85, 105, 0.3)',
    text: '#e2e8f0',
    muted: '#94a3b8',
    buttonBg: 'rgba(71, 85, 105, 0.3)',
    buttonHover: 'rgba(71, 85, 105, 0.5)',
    buttonActive: 'rgba(96, 165, 250, 0.3)'
  } : {
    bg: '#ffffff',
    headerBg: '#f8fafc',
    border: '#e2e8f0',
    text: '#0f172a',
    muted: '#64748b',
    buttonBg: '#e2e8f0',
    buttonHover: '#d1d5db',
    buttonActive: 'rgba(59, 130, 246, 0.2)'
  }

  // Handle editor mount to register themes
  const handleEditorDidMount = (editor: Monaco.editor.IStandaloneDiffEditor, monaco: typeof Monaco) => {
    editorRef.current = editor
    // Register custom themes if not already registered
    registerPrompdThemes(monaco)
    // Set the theme
    monaco.editor.setTheme(monacoTheme)
  }

  // Handle loading state
  if (isLoading) {
    return (
      <div style={{
        border: `1px solid ${colors.border}`,
        borderRadius: '8px',
        background: colors.bg,
        overflow: 'hidden'
      }}>
        <LoadingState />
      </div>
    )
  }

  // Handle error state
  if (loadError) {
    return <ErrorState error={loadError} />
  }

  // Handle binary files
  if (isBinary) {
    return <BinaryFileWarning filePath={filePath} />
  }

  // Handle no changes
  if (originalContent === modifiedContent) {
    return (
      <div style={{
        padding: '20px',
        textAlign: 'center',
        color: colors.muted,
        fontSize: '13px',
        background: colors.bg,
        borderRadius: '8px',
        border: `1px solid ${colors.border}`
      }}>
        No changes detected
      </div>
    )
  }

  // View mode toggle button
  const ViewModeToggle = () => (
    <div style={{ display: 'flex', gap: '4px' }}>
      <button
        onClick={() => setViewMode('side-by-side')}
        title="Side-by-side view"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4px 8px',
          background: viewMode === 'side-by-side' ? colors.buttonActive : colors.buttonBg,
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          color: viewMode === 'side-by-side' ? (theme === 'dark' ? '#60a5fa' : '#3b82f6') : colors.muted,
          fontSize: '11px',
          gap: '4px',
          transition: 'background 0.15s'
        }}
      >
        <Columns size={12} />
        Split
      </button>
      <button
        onClick={() => setViewMode('stacked')}
        title="Stacked view"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4px 8px',
          background: viewMode === 'stacked' ? colors.buttonActive : colors.buttonBg,
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          color: viewMode === 'stacked' ? (theme === 'dark' ? '#60a5fa' : '#3b82f6') : colors.muted,
          fontSize: '11px',
          gap: '4px',
          transition: 'background 0.15s'
        }}
      >
        <Rows size={12} />
        Stacked
      </button>
    </div>
  )

  // Render regions for large files (side-by-side only)
  if (isLarge && regions && regions.length > 0 && viewMode === 'side-by-side') {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        {/* View mode toggle for large files */}
        {edits && edits.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <ViewModeToggle />
          </div>
        )}
        {regions.map((region, idx) => (
          <div
            key={idx}
            style={{
              border: `1px solid ${colors.border}`,
              borderRadius: '8px',
              overflow: 'hidden',
              background: colors.bg
            }}
          >
            {/* Region header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              background: colors.headerBg,
              borderBottom: `1px solid ${colors.border}`,
              fontSize: '12px'
            }}>
              <span style={{ color: colors.muted }}>
                Lines {region.startLine}-{region.endLine}
                {region.type === 'added' && ' (new)'}
                {region.type === 'removed' && ' (removed)'}
              </span>
              {filePath && (
                <span style={{ color: colors.muted, fontFamily: 'monospace' }}>
                  {filePath.split('/').pop()}
                </span>
              )}
            </div>

            {/* Monaco diff for this region */}
            <div style={{ height: Math.min(250, (region.originalContent.split('\n').length + 2) * 20) }}>
              <DiffEditor
                original={region.originalContent}
                modified={region.modifiedContent}
                language={language}
                theme={monacoTheme}
                onMount={handleEditorDidMount}
                options={{
                  readOnly: true,
                  renderSideBySide: true,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 12,
                  lineNumbers: 'on',
                  folding: false,
                  renderOverviewRuler: false,
                  scrollbar: {
                    vertical: 'auto',
                    horizontal: 'auto',
                    verticalScrollbarSize: 8,
                    horizontalScrollbarSize: 8
                  },
                  diffWordWrap: 'on',
                  ignoreTrimWhitespace: false,
                  renderIndicators: true,
                  originalEditable: false
                }}
              />
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Stacked view (for both large and small files when toggled)
  if (viewMode === 'stacked' && edits && edits.length > 0) {
    return (
      <div style={{
        border: `1px solid ${colors.border}`,
        borderRadius: '8px',
        overflow: 'hidden',
        background: colors.bg
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          background: colors.headerBg,
          borderBottom: `1px solid ${colors.border}`
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '12px'
          }}>
            <span style={{ fontWeight: 500, color: colors.text }}>
              Changes ({edits.length})
            </span>
            <DiffStats added={stats.added} removed={stats.removed} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {filePath && (
              <span style={{
                fontSize: '11px',
                color: colors.muted,
                fontFamily: 'monospace'
              }}>
                {filePath}
              </span>
            )}
            <ViewModeToggle />
          </div>
        </div>

        {/* Stacked diff content */}
        <StackedDiffView edits={edits} theme={theme} />
      </div>
    )
  }

  // Full file diff for small files (side-by-side view)
  return (
    <div style={{
      border: `1px solid ${colors.border}`,
      borderRadius: '8px',
      overflow: 'hidden',
      background: colors.bg
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        background: colors.headerBg,
        borderBottom: `1px solid ${colors.border}`
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '12px'
        }}>
          <span style={{ fontWeight: 500, color: colors.text }}>
            Changes
          </span>
          <DiffStats added={stats.added} removed={stats.removed} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {filePath && (
            <span style={{
              fontSize: '11px',
              color: colors.muted,
              fontFamily: 'monospace'
            }}>
              {filePath}
            </span>
          )}
          {edits && edits.length > 0 && <ViewModeToggle />}
        </div>
      </div>

      {/* Monaco diff editor */}
      <div style={{ height: typeof height === 'number' ? height : height }}>
        <DiffEditor
          original={originalContent}
          modified={modifiedContent}
          language={language}
          theme={monacoTheme}
          onMount={handleEditorDidMount}
          options={{
            readOnly: true,
            renderSideBySide: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 12,
            lineNumbers: 'on',
            folding: false,
            renderOverviewRuler: false,
            scrollbar: {
              vertical: 'auto',
              horizontal: 'auto',
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8
            },
            diffWordWrap: 'on',
            ignoreTrimWhitespace: false,
            renderIndicators: true,
            originalEditable: false
          }}
        />
      </div>

      {/* Footer with language hint and token count */}
      <div style={{
        padding: '6px 12px',
        borderTop: `1px solid ${colors.border}`,
        background: colors.headerBg,
        fontSize: '11px',
        color: colors.muted,
        display: 'flex',
        justifyContent: 'space-between'
      }}>
        <span>{language}</span>
        <div style={{ display: 'flex', gap: '12px' }}>
          <span>{stats.originalLines} {'->'} {stats.modifiedLines} lines</span>
          <span title="Estimated token count for modified content">~{stats.modifiedTokens.toLocaleString()} tokens</span>
        </div>
      </div>
    </div>
  )
}

export default ApprovalDiffView

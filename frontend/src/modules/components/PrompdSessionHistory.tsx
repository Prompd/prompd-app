/**
 * PrompdSessionHistory - Display prompd execution history for current session
 * Session-only history (cleared on app close) shown in bottom panel Prompds tab
 */

import { useState, useMemo } from 'react'
import {
  Clock,
  Cpu,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  Braces,
  FileCode2,
} from 'lucide-react'
import { JsonTreeViewer, extractJson } from './common/JsonTreeViewer'
import WysiwygEditor from './WysiwygEditor'

export interface PrompdExecutionRecord {
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
}

interface PrompdSessionHistoryProps {
  executions: PrompdExecutionRecord[]
  theme?: 'light' | 'dark'
  embedded?: boolean
  onViewExecution?: (execution: PrompdExecutionRecord, index: number) => void
}

// ============================================================================
// ResponseSection - Handles markdown/JSON toggle per execution
// ============================================================================

interface ResponseSectionProps {
  exec: PrompdExecutionRecord
  colors: Record<string, string>
  viewMode?: 'rendered' | 'json'
  onViewModeChange: (mode: 'rendered' | 'json') => void
  onCopy: () => void
}

function ResponseSection({ exec, colors, viewMode, onViewModeChange, onCopy }: ResponseSectionProps) {
  const jsonResult = useMemo(() => {
    if (!exec.response) return null
    return extractJson(exec.response)
  }, [exec.response])

  const hasJson = jsonResult !== null
  // Default: JSON Explorer for full-JSON responses, Rendered for markdown with embedded JSON
  const activeView = viewMode ?? (jsonResult?.isFullJson ? 'json' : 'rendered')

  const toggleBtnStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 8px',
    background: active ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.05)',
    border: active ? '1px solid rgba(99, 102, 241, 0.4)' : `1px solid ${colors.border}`,
    borderRadius: '4px',
    cursor: 'pointer',
    color: active ? 'var(--prompd-accent, #a5b4fc)' : colors.textSecondary,
    fontSize: '11px',
    transition: 'all 0.15s',
  })

  return (
    <div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '6px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: colors.textMuted, fontWeight: 500 }}>Response</span>
          {hasJson && (
            <div style={{ display: 'flex', gap: '2px' }}>
              <button
                onClick={() => onViewModeChange('rendered')}
                style={toggleBtnStyle(activeView === 'rendered')}
                title="Rendered markdown view"
              >
                <FileCode2 size={11} />
                Rendered
              </button>
              <button
                onClick={() => onViewModeChange('json')}
                style={toggleBtnStyle(activeView === 'json')}
                title="Interactive JSON explorer"
              >
                <Braces size={11} />
                JSON
              </button>
            </div>
          )}
        </div>
        <button
          onClick={onCopy}
          style={{
            padding: '2px 6px',
            background: 'transparent',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            color: colors.textMuted,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px'
          }}
        >
          <Copy size={11} />
        </button>
      </div>

      {activeView === 'json' && jsonResult ? (
        <div style={{
          padding: '14px',
          background: 'rgba(0, 0, 0, 0.2)',
          border: `1px solid ${colors.border}`,
          borderRadius: '6px',
          overflow: 'auto',
          maxHeight: '350px',
          color: 'var(--foreground)'
        }}>
          <JsonTreeViewer
            data={jsonResult.parsed}
            rootPath="response"
            defaultExpandDepth={2}
          />
        </div>
      ) : (
        <WysiwygEditor
          value={exec.response || ''}
          readOnly
          height="auto"
          showToolbar={false}
        />
      )}
    </div>
  )
}

export function PrompdSessionHistory({
  executions,
  theme = 'dark',
  embedded = false,
  onViewExecution
}: PrompdSessionHistoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [viewModes, setViewModes] = useState<Record<string, 'rendered' | 'json'>>({})

  const setViewMode = (id: string, mode: 'rendered' | 'json') => {
    setViewModes(prev => ({ ...prev, [id]: mode }))
  }

  const colors = {
    bg: 'var(--sidebar-bg)',
    bgSecondary: 'var(--panel)',
    border: 'var(--border)',
    text: 'var(--foreground)',
    textSecondary: 'var(--muted)',
    textMuted: 'var(--muted)',
    accent: 'var(--prompd-accent, #6366f1)',
    success: 'var(--success, #22c55e)',
    error: 'var(--error, #ef4444)',
  }

  const handleCopyPrompt = (execution: PrompdExecutionRecord) => {
    if (execution.compiledPrompt) {
      navigator.clipboard.writeText(execution.compiledPrompt)
    }
  }

  const handleCopyResponse = (execution: PrompdExecutionRecord) => {
    if (execution.response) {
      navigator.clipboard.writeText(execution.response)
    }
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: embedded ? 'transparent' : colors.bg,
      color: colors.text,
      overflow: 'hidden'
    }}>
      {/* Execution List */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '12px 16px'
      }}>
        {executions.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100%',
            color: colors.textMuted,
            gap: '8px'
          }}>
            <FileText size={32} />
            <span>No prompd executions yet</span>
            <span style={{ fontSize: '12px' }}>Execute a prompd to see it here</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {executions.slice().reverse().map((exec) => (
              <div
                key={exec.id}
                style={{
                  background: 'var(--panel)',
                  border: `1px solid ${expandedId === exec.id ? colors.accent : colors.border}`,
                  borderRadius: '8px',
                  overflow: 'hidden',
                  transition: 'border-color 0.15s'
                }}
              >
                {/* Execution Header */}
                <div
                  style={{
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    if (onViewExecution) {
                      const index = executions.findIndex(e => e.id === exec.id)
                      onViewExecution(exec, index)
                    } else {
                      setExpandedId(expandedId === exec.id ? null : exec.id)
                    }
                  }}
                >
                  <div
                    onClick={(e) => {
                      e.stopPropagation()
                      setExpandedId(expandedId === exec.id ? null : exec.id)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '2px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      flexShrink: 0
                    }}
                    title="Quick preview"
                  >
                    {expandedId === exec.id
                      ? <ChevronDown size={14} color={colors.textMuted} />
                      : <ChevronRight size={14} color={colors.textMuted} />
                    }
                  </div>
                  {exec.success
                    ? <CheckCircle2 size={14} color={colors.success} />
                    : <XCircle size={14} color={colors.error} />
                  }

                  <span style={{ fontSize: '13px', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {exec.model}
                  </span>

                  <span style={{ fontSize: '11px', color: colors.textMuted, display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <span title={`${exec.totalTokens.toLocaleString()} tokens`}>{exec.totalTokens > 999 ? `${(exec.totalTokens / 1000).toFixed(1)}k` : exec.totalTokens} tok</span>
                    <span>{formatDuration(exec.duration)}</span>
                    <span>{formatDate(exec.timestamp)}</span>
                  </span>
                </div>

                {/* Expanded Details */}
                {expandedId === exec.id && (
                  <div style={{
                    borderTop: `1px solid ${colors.border}`,
                    padding: '14px'
                  }}>
                    {/* Token Breakdown */}
                    <div style={{
                      display: 'flex',
                      gap: '16px',
                      marginBottom: '14px',
                      fontSize: '12px',
                      color: colors.textMuted
                    }}>
                      <span>{exec.provider} / {exec.model}</span>
                      <span>{exec.promptTokens.toLocaleString()} in / {exec.completionTokens.toLocaleString()} out</span>
                      <span>{formatDuration(exec.duration)}</span>
                    </div>

                    {/* Compiled Prompt */}
                    {exec.compiledPrompt && (
                      <div style={{ marginBottom: '14px' }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '6px'
                        }}>
                          <span style={{ fontSize: '11px', color: colors.textMuted, fontWeight: 500 }}>Compiled Prompt</span>
                          <button
                            onClick={() => handleCopyPrompt(exec)}
                            style={{
                              padding: '2px 6px',
                              background: 'transparent',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              color: colors.textMuted,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px'
                            }}
                          >
                            <Copy size={11} />
                          </button>
                        </div>
                        <WysiwygEditor
                          value={exec.compiledPrompt}
                          readOnly
                          height="auto"
                          showToolbar={false}
                        />
                      </div>
                    )}

                    {/* Response */}
                    {exec.response && (
                      <ResponseSection
                        exec={exec}
                        colors={colors}
                        viewMode={viewModes[exec.id]}
                        onViewModeChange={(mode) => setViewMode(exec.id, mode)}
                        onCopy={() => handleCopyResponse(exec)}
                      />
                    )}

                    {/* Error */}
                    {exec.error && (
                      <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontSize: '11px', color: colors.error, marginBottom: '8px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Error</div>
                        <pre style={{
                          padding: '12px',
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          borderRadius: '6px',
                          fontSize: '12px',
                          color: '#fca5a5',
                          overflow: 'auto',
                          maxHeight: '120px',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          margin: 0,
                          lineHeight: '1.5'
                        }}>
                          {exec.error}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

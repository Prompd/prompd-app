/**
 * PrompdSessionHistory - Display prompd execution history for current session
 * Session-only history (cleared on app close) shown in bottom panel Prompds tab
 */

import { useState } from 'react'
import {
  Clock,
  Cpu,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  ExternalLink
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

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

export function PrompdSessionHistory({
  executions,
  theme = 'dark',
  embedded = false,
  onViewExecution
}: PrompdSessionHistoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

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
                  background: 'var(--prompd-panel, rgba(255, 255, 255, 0.03))',
                  border: expandedId === exec.id
                    ? `1px solid ${colors.accent}`
                    : `1px solid ${colors.border}`,
                  borderRadius: '8px',
                  overflow: 'hidden',
                  boxShadow: expandedId === exec.id
                    ? '0 2px 8px rgba(0, 0, 0, 0.15)'
                    : '0 1px 3px rgba(0, 0, 0, 0.08)',
                  transition: 'all 0.15s ease'
                }}
              >
                {/* Execution Header */}
                <div
                  style={{
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                    background: expandedId === exec.id
                      ? 'rgba(99, 102, 241, 0.08)'
                      : 'transparent'
                  }}
                  onClick={() => setExpandedId(expandedId === exec.id ? null : exec.id)}
                >
                  {expandedId === exec.id ? (
                    <ChevronDown size={16} color={colors.textMuted} />
                  ) : (
                    <ChevronRight size={16} color={colors.textMuted} />
                  )}

                  {/* Status */}
                  {exec.success ? (
                    <CheckCircle2 size={16} color={colors.success} />
                  ) : (
                    <XCircle size={16} color={colors.error} />
                  )}

                  {/* Provider & Model */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {exec.provider} / {exec.model}
                      </span>
                      <span style={{ fontSize: '11px', color: colors.textMuted, fontWeight: 400 }}>
                        {formatDate(exec.timestamp)}
                      </span>
                    </div>
                    {exec.context && (
                      <div style={{ fontSize: '11px', color: colors.textMuted, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {exec.context}
                      </div>
                    )}
                  </div>

                  {/* Metrics */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: colors.textSecondary, flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }} title={`${exec.totalTokens.toLocaleString()} tokens`}>
                      <Cpu size={12} />
                      <span>{exec.totalTokens > 999 ? `${(exec.totalTokens / 1000).toFixed(1)}k` : exec.totalTokens}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }} title={`Duration: ${formatDuration(exec.duration)}`}>
                      <Clock size={12} />
                      <span>{formatDuration(exec.duration)}</span>
                    </div>
                    {onViewExecution && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          const index = executions.findIndex(e => e.id === exec.id)
                          onViewExecution(exec, index)
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '4px',
                          background: 'transparent',
                          border: `1px solid ${colors.border}`,
                          borderRadius: '4px',
                          cursor: 'pointer',
                          color: colors.textSecondary,
                          transition: 'all 0.15s'
                        }}
                        title="View in modal"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)'
                          e.currentTarget.style.color = colors.accent
                          e.currentTarget.style.borderColor = colors.accent
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent'
                          e.currentTarget.style.color = colors.textSecondary
                          e.currentTarget.style.borderColor = colors.border
                        }}
                      >
                        <ExternalLink size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedId === exec.id && (
                  <div style={{
                    borderTop: `1px solid rgba(99, 102, 241, 0.2)`,
                    padding: '16px',
                    background: 'rgba(0, 0, 0, 0.15)'
                  }}>
                    {/* Token Breakdown */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '12px',
                      marginBottom: '16px',
                      padding: '12px',
                      background: 'rgba(255, 255, 255, 0.03)',
                      borderRadius: '6px',
                      border: `1px solid ${colors.border}`
                    }}>
                      <div>
                        <div style={{ fontSize: '10px', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Prompt Tokens</div>
                        <div style={{ fontWeight: 600, fontSize: '15px' }}>{exec.promptTokens.toLocaleString()}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Completion</div>
                        <div style={{ fontWeight: 600, fontSize: '15px' }}>{exec.completionTokens.toLocaleString()}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Duration</div>
                        <div style={{ fontWeight: 600, fontSize: '15px', color: colors.accent }}>{formatDuration(exec.duration)}</div>
                      </div>
                    </div>

                    {/* Compiled Prompt */}
                    {exec.compiledPrompt && (
                      <div style={{ marginBottom: '16px' }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '8px'
                        }}>
                          <span style={{ fontSize: '11px', color: colors.textMuted, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Compiled Prompt</span>
                          <button
                            onClick={() => handleCopyPrompt(exec)}
                            style={{
                              padding: '4px 8px',
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: `1px solid ${colors.border}`,
                              borderRadius: '4px',
                              cursor: 'pointer',
                              color: colors.textSecondary,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px'
                            }}
                          >
                            <Copy size={12} /> Copy
                          </button>
                        </div>
                        <pre style={{
                          padding: '12px',
                          background: 'rgba(0, 0, 0, 0.2)',
                          border: `1px solid ${colors.border}`,
                          borderRadius: '6px',
                          fontSize: '12px',
                          overflow: 'auto',
                          maxHeight: '150px',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          margin: 0,
                          lineHeight: '1.5',
                          color: 'var(--foreground)'
                        }}>
                          {exec.compiledPrompt}
                        </pre>
                      </div>
                    )}

                    {/* Response */}
                    {exec.response && (
                      <div style={{ marginBottom: '16px' }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '8px'
                        }}>
                          <span style={{ fontSize: '11px', color: colors.textMuted, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Response</span>
                          <button
                            onClick={() => handleCopyResponse(exec)}
                            style={{
                              padding: '4px 8px',
                              background: 'rgba(255, 255, 255, 0.05)',
                              border: `1px solid ${colors.border}`,
                              borderRadius: '4px',
                              cursor: 'pointer',
                              color: colors.textSecondary,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px'
                            }}
                          >
                            <Copy size={12} /> Copy
                          </button>
                        </div>
                        <div style={{
                          padding: '14px',
                          background: 'rgba(0, 0, 0, 0.2)',
                          border: `1px solid ${colors.border}`,
                          borderRadius: '6px',
                          fontSize: '13px',
                          overflow: 'auto',
                          maxHeight: '250px',
                          lineHeight: '1.6',
                          color: 'var(--foreground)'
                        }} className="history-markdown">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              p: ({ children }) => (
                                <p style={{ margin: '0 0 8px', lineHeight: '1.5' }}>{children}</p>
                              ),
                              code: ({ inline, children, ...props }: any) =>
                                inline ? (
                                  <code
                                    style={{
                                      background: 'rgba(99, 102, 241, 0.15)',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      fontSize: '12px',
                                      fontFamily: 'monospace',
                                      color: 'var(--prompd-accent, #a5b4fc)'
                                    }}
                                    {...props}
                                  >
                                    {children}
                                  </code>
                                ) : (
                                  <code
                                    style={{
                                      display: 'block',
                                      background: 'rgba(0, 0, 0, 0.3)',
                                      border: `1px solid ${colors.border}`,
                                      padding: '10px',
                                      borderRadius: '4px',
                                      fontSize: '12px',
                                      fontFamily: 'monospace',
                                      overflowX: 'auto',
                                      margin: '8px 0',
                                      lineHeight: '1.4'
                                    }}
                                    {...props}
                                  >
                                    {children}
                                  </code>
                                ),
                              pre: ({ children }) => (
                                <pre style={{ margin: 0 }}>{children}</pre>
                              ),
                            }}
                          >
                            {exec.response}
                          </ReactMarkdown>
                        </div>
                      </div>
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

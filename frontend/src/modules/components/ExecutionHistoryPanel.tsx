/**
 * ExecutionHistoryPanel - Display execution history from IndexedDB
 * Shows all executions with ability to view details, compare, and filter
 */

import { useState, useEffect, useCallback } from 'react'
import {
  History,
  Clock,
  Cpu,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Search,
  Trash2,
  RefreshCw,
  Cloud,
  CloudOff,
  Copy,
  ExternalLink
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { usageTracker, ExecutionRecord, UsageSummary } from '../services/usageTracker'
import { useConfirmDialog } from './ConfirmDialog'
import { SidebarPanelHeader } from './SidebarPanelHeader'

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]
const DEFAULT_PAGE_SIZE = 10

// Helper to check sync status (handles both boolean and numeric values from IndexedDB)
function isSynced(exec: ExecutionRecord): boolean {
  // IndexedDB may store booleans as 0/1 in some cases
  return exec.synced === true || (exec.synced as unknown) === 1
}

interface ExecutionHistoryPanelProps {
  theme: 'light' | 'dark'
  onViewExecution?: (execution: ExecutionRecord) => void
  onCollapse?: () => void
}

export function ExecutionHistoryPanel({ theme, onViewExecution, onCollapse }: ExecutionHistoryPanelProps) {
  const [executions, setExecutions] = useState<ExecutionRecord[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProvider, setSelectedProvider] = useState<string>('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [unsyncedCount, setUnsyncedCount] = useState(0)

  // Use custom confirm dialog instead of native confirm()
  const { showConfirm, ConfirmDialogComponent } = useConfirmDialog(theme)
  const [syncing, setSyncing] = useState(false)
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'all'>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  // Use CSS variables for consistent theming with other panels
  const colors = {
    bg: 'var(--sidebar-bg)',
    bgSecondary: 'var(--panel)',
    bgTertiary: 'var(--panel-2)',
    border: 'var(--border)',
    text: 'var(--foreground)',
    textSecondary: 'var(--muted)',
    textMuted: 'var(--muted)',
    accent: 'var(--prompd-accent, #6366f1)',
    success: 'var(--success, #22c55e)',
    error: 'var(--error, #ef4444)',
    warning: 'var(--warning, #f59e0b)',
  }

  const loadExecutions = useCallback(async () => {
    setLoading(true)
    try {
      // Calculate date range
      let startDate: number | undefined
      const now = Date.now()
      switch (dateRange) {
        case 'today':
          startDate = new Date().setHours(0, 0, 0, 0)
          break
        case 'week':
          startDate = now - 7 * 24 * 60 * 60 * 1000
          break
        case 'month':
          startDate = now - 30 * 24 * 60 * 60 * 1000
          break
      }

      const [records, summaryData, unsynced] = await Promise.all([
        usageTracker.getExecutions({
          limit: 1000, // Get more to allow client-side filtering/pagination
          provider: selectedProvider || undefined,
          startDate
        }),
        usageTracker.getSummary({ startDate }),
        usageTracker.getUnsyncedCount()
      ])

      setExecutions(records)
      setTotalCount(records.length)
      setSummary(summaryData)
      setUnsyncedCount(unsynced)
    } catch (error) {
      console.error('[ExecutionHistoryPanel] Failed to load executions:', error)
    } finally {
      setLoading(false)
    }
  }, [selectedProvider, dateRange])

  useEffect(() => {
    loadExecutions()
  }, [loadExecutions])

  const handleSync = async () => {
    setSyncing(true)
    try {
      const result = await usageTracker.syncToBackend()
      console.log('[ExecutionHistoryPanel] Sync result:', result)
      await loadExecutions()
    } catch (error) {
      console.error('[ExecutionHistoryPanel] Sync failed:', error)
    } finally {
      setSyncing(false)
    }
  }

  const handleClearHistory = async () => {
    const confirmed = await showConfirm({
      title: 'Clear History',
      message: 'Are you sure you want to clear all execution history? This cannot be undone.',
      confirmLabel: 'Clear All',
      cancelLabel: 'Cancel',
      confirmVariant: 'danger'
    })
    if (confirmed) {
      await usageTracker.clearAll()
      await loadExecutions()
    }
  }

  const handleCopyPrompt = (execution: ExecutionRecord) => {
    if (execution.compiledPrompt) {
      navigator.clipboard.writeText(execution.compiledPrompt)
    }
  }

  const handleCopyResponse = (execution: ExecutionRecord) => {
    if (execution.response) {
      navigator.clipboard.writeText(execution.response)
    }
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  const formatCost = (tokens: number, provider: string) => {
    // Rough cost estimates per 1M tokens
    const rates: Record<string, number> = {
      openai: 3.0,
      anthropic: 8.0,
      google: 1.0,
      groq: 0.27,
    }
    const rate = rates[provider.toLowerCase()] || 2.0
    const cost = (tokens / 1_000_000) * rate
    return cost < 0.01 ? '<$0.01' : `$${cost.toFixed(2)}`
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000))

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (diffDays === 1) {
      return 'Yesterday ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  // Filter executions by search query
  const filteredExecutions = executions.filter(exec => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      exec.model.toLowerCase().includes(query) ||
      exec.provider.toLowerCase().includes(query) ||
      exec.context?.toLowerCase().includes(query) ||
      exec.compiledPrompt?.toLowerCase().includes(query) ||
      exec.response?.toLowerCase().includes(query)
    )
  })

  // Pagination
  const totalPages = Math.ceil(filteredExecutions.length / pageSize)
  const startIndex = (currentPage - 1) * pageSize
  const paginatedExecutions = filteredExecutions.slice(startIndex, startIndex + pageSize)

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, selectedProvider, dateRange])

  // Get unique providers for filter
  const providers = Array.from(new Set(executions.map(e => e.provider)))

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: colors.bg,
      color: colors.text
    }}>
      <SidebarPanelHeader title="Execution History" onCollapse={onCollapse}>
        {unsyncedCount > 0 && (
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              fontSize: '12px',
              background: colors.bgSecondary,
              border: `1px solid ${colors.border}`,
              borderRadius: '4px',
              color: colors.warning,
              cursor: 'pointer'
            }}
            title={`${unsyncedCount} executions pending sync`}
          >
            <CloudOff size={14} />
            {syncing ? <RefreshCw size={14} className="spin" /> : unsyncedCount}
          </button>
        )}
        <button
          onClick={loadExecutions}
          style={{
            padding: '4px 8px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: colors.textSecondary
          }}
          title="Refresh"
        >
          <RefreshCw size={16} />
        </button>
      </SidebarPanelHeader>

      {/* Summary Cards */}
      {summary && (
        <div style={{
          padding: '12px 16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '12px',
          borderBottom: `1px solid ${colors.border}`
        }}>
          <div style={{
            padding: '12px',
            background: colors.bgSecondary,
            borderRadius: '6px',
            border: `1px solid ${colors.border}`
          }}>
            <div style={{ fontSize: '11px', color: colors.textMuted, marginBottom: '4px' }}>Executions</div>
            <div style={{ fontSize: '18px', fontWeight: 600 }}>{summary.totalExecutions}</div>
          </div>
          <div style={{
            padding: '12px',
            background: colors.bgSecondary,
            borderRadius: '6px',
            border: `1px solid ${colors.border}`
          }}>
            <div style={{ fontSize: '11px', color: colors.textMuted, marginBottom: '4px' }}>Total Tokens</div>
            <div style={{ fontSize: '18px', fontWeight: 600 }}>{(summary.totalTokens / 1000).toFixed(1)}k</div>
          </div>
          <div style={{
            padding: '12px',
            background: colors.bgSecondary,
            borderRadius: '6px',
            border: `1px solid ${colors.border}`
          }}>
            <div style={{ fontSize: '11px', color: colors.textMuted, marginBottom: '4px' }}>Success Rate</div>
            <div style={{ fontSize: '18px', fontWeight: 600, color: summary.successCount === summary.totalExecutions ? colors.success : colors.warning }}>
              {summary.totalExecutions > 0 ? ((summary.successCount / summary.totalExecutions) * 100).toFixed(0) : 0}%
            </div>
          </div>
          <div style={{
            padding: '12px',
            background: colors.bgSecondary,
            borderRadius: '6px',
            border: `1px solid ${colors.border}`
          }}>
            <div style={{ fontSize: '11px', color: colors.textMuted, marginBottom: '4px' }}>Providers</div>
            <div style={{ fontSize: '18px', fontWeight: 600 }}>{Object.keys(summary.byProvider).length}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{
        padding: '12px 16px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        borderBottom: `1px solid ${colors.border}`
      }}>
        <div style={{
          flex: '1 1 150px',
          minWidth: '120px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 10px',
          background: colors.bgSecondary,
          border: `1px solid ${colors.border}`,
          borderRadius: '4px'
        }}>
          <Search size={14} color={colors.textMuted} style={{ flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              background: 'transparent',
              outline: 'none',
              fontSize: '13px',
              color: colors.text
            }}
          />
        </div>
        <select
          value={selectedProvider}
          onChange={(e) => setSelectedProvider(e.target.value)}
          style={{
            flex: '0 1 auto',
            minWidth: 0,
            maxWidth: '120px',
            padding: '6px 8px',
            background: colors.bgSecondary,
            border: `1px solid ${colors.border}`,
            borderRadius: '4px',
            fontSize: '12px',
            color: colors.text,
            cursor: 'pointer'
          }}
        >
          <option value="">Provider</option>
          {providers.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value as typeof dateRange)}
          style={{
            flex: '0 1 auto',
            minWidth: 0,
            maxWidth: '100px',
            padding: '6px 8px',
            background: colors.bgSecondary,
            border: `1px solid ${colors.border}`,
            borderRadius: '4px',
            fontSize: '12px',
            color: colors.text,
            cursor: 'pointer'
          }}
        >
          <option value="today">Today</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
          <option value="all">All</option>
        </select>
      </div>

      {/* Execution List */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '8px 16px'
      }}>
        {loading ? (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100%',
            color: colors.textMuted
          }}>
            Loading executions...
          </div>
        ) : filteredExecutions.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100%',
            color: colors.textMuted,
            gap: '8px'
          }}>
            <History size={32} />
            <span>No executions found</span>
            <span style={{ fontSize: '12px' }}>Execute a prompt to see it here</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {paginatedExecutions.map((exec) => (
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
                      {/* Timestamp shown inline on wider panels, moves to second line on narrow */}
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

                  {/* Metrics - compact icons that stay visible */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: colors.textSecondary, flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }} title={`${exec.totalTokens.toLocaleString()} tokens`}>
                      <Cpu size={12} />
                      <span>{exec.totalTokens > 999 ? `${(exec.totalTokens / 1000).toFixed(1)}k` : exec.totalTokens}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }} title={`Duration: ${formatDuration(exec.duration)}`}>
                      <Clock size={12} />
                      <span>{formatDuration(exec.duration)}</span>
                    </div>
                    <div title={isSynced(exec) ? 'Synced to backend' : 'Pending sync'}>
                      {isSynced(exec) ? (
                        <Cloud size={12} color={colors.success} />
                      ) : (
                        <CloudOff size={12} color={colors.warning} />
                      )}
                    </div>
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
                        <div style={{ fontSize: '10px', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Est. Cost</div>
                        <div style={{ fontWeight: 600, fontSize: '15px', color: colors.accent }}>{formatCost(exec.totalTokens, exec.provider)}</div>
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
                            urlTransform={(url) => {
                              // Allow prompd-gen:// protocol for persisted generated images
                              if (url.startsWith('prompd-gen://')) return url
                              // Default: allow http, https, mailto, tel
                              if (/^https?:\/\/|^mailto:|^tel:|^#/.test(url)) return url
                              return ''
                            }}
                            components={{
                              h1: ({ children }) => (
                                <h1 style={{ margin: '16px 0 8px', fontSize: '18px', fontWeight: 600 }}>{children}</h1>
                              ),
                              h2: ({ children }) => (
                                <h2 style={{ margin: '14px 0 6px', fontSize: '16px', fontWeight: 600 }}>{children}</h2>
                              ),
                              h3: ({ children }) => (
                                <h3 style={{ margin: '12px 0 4px', fontSize: '14px', fontWeight: 600 }}>{children}</h3>
                              ),
                              p: ({ children }) => (
                                <p style={{ margin: '0 0 8px', lineHeight: '1.5' }}>{children}</p>
                              ),
                              ul: ({ children }) => (
                                <ul style={{ margin: '0 0 8px', paddingLeft: '20px' }}>{children}</ul>
                              ),
                              ol: ({ children }) => (
                                <ol style={{ margin: '0 0 8px', paddingLeft: '20px' }}>{children}</ol>
                              ),
                              li: ({ children }) => (
                                <li style={{ margin: '2px 0', lineHeight: '1.4' }}>{children}</li>
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
                              blockquote: ({ children }) => (
                                <blockquote style={{
                                  borderLeft: `3px solid ${colors.accent}`,
                                  paddingLeft: '12px',
                                  margin: '8px 0',
                                  color: colors.textSecondary,
                                  fontStyle: 'italic'
                                }}>
                                  {children}
                                </blockquote>
                              ),
                              a: ({ children, href }) => (
                                <a
                                  href={href}
                                  style={{ color: colors.accent, textDecoration: 'underline' }}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {children}
                                </a>
                              ),
                              table: ({ children }) => (
                                <table style={{
                                  width: '100%',
                                  borderCollapse: 'collapse',
                                  margin: '8px 0',
                                  fontSize: '12px'
                                }}>
                                  {children}
                                </table>
                              ),
                              th: ({ children }) => (
                                <th style={{
                                  border: `1px solid ${colors.border}`,
                                  padding: '8px 10px',
                                  background: 'rgba(99, 102, 241, 0.1)',
                                  fontWeight: 600,
                                  textAlign: 'left'
                                }}>
                                  {children}
                                </th>
                              ),
                              td: ({ children }) => (
                                <td style={{
                                  border: `1px solid ${colors.border}`,
                                  padding: '6px 8px'
                                }}>
                                  {children}
                                </td>
                              ),
                              strong: ({ children }) => (
                                <strong style={{ fontWeight: 600 }}>{children}</strong>
                              ),
                              em: ({ children }) => (
                                <em style={{ fontStyle: 'italic' }}>{children}</em>
                              ),
                              hr: () => (
                                <hr style={{ border: 'none', borderTop: `1px solid ${colors.border}`, margin: '12px 0' }} />
                              ),
                              img: ({ src, alt }) => (
                                <img
                                  src={src}
                                  alt={alt || 'generated image'}
                                  loading="lazy"
                                  style={{
                                    maxWidth: '100%',
                                    borderRadius: '6px',
                                    margin: '8px 0'
                                  }}
                                />
                              )
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

                    {/* Action Buttons */}
                    {onViewExecution && (
                      <div style={{ display: 'flex', gap: '8px', marginTop: '16px', paddingTop: '12px', borderTop: `1px solid ${colors.border}` }}>
                        <button
                          onClick={() => onViewExecution(exec)}
                          style={{
                            padding: '8px 16px',
                            background: colors.accent,
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 500,
                            color: '#fff',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <ExternalLink size={14} /> Open in Editor
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer with Pagination */}
      <div style={{
        padding: '12px 16px',
        borderTop: `1px solid ${colors.border}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        fontSize: '12px',
        color: colors.textMuted
      }}>
        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '8px'
          }}>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              style={{
                padding: '4px 8px',
                background: currentPage === 1 ? colors.bgTertiary : colors.bgSecondary,
                border: `1px solid ${colors.border}`,
                borderRadius: '4px',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                color: currentPage === 1 ? colors.textMuted : colors.text,
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <ChevronLeft size={14} />
            </button>
            <span style={{ minWidth: '100px', textAlign: 'center' }}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              style={{
                padding: '4px 8px',
                background: currentPage === totalPages ? colors.bgTertiary : colors.bgSecondary,
                border: `1px solid ${colors.border}`,
                borderRadius: '4px',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                color: currentPage === totalPages ? colors.textMuted : colors.text,
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        {/* Info, Page Size, and Clear */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px'
        }}>
          <span style={{ flex: 1 }}>
            {filteredExecutions.length === executions.length
              ? `${executions.length} executions`
              : `${filteredExecutions.length} of ${executions.length} executions`
            }
            {filteredExecutions.length > pageSize && ` (${startIndex + 1}-${Math.min(startIndex + pageSize, filteredExecutions.length)})`}
          </span>

          {/* Page Size Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '11px' }}>Show:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setCurrentPage(1)
              }}
              style={{
                padding: '2px 4px',
                background: colors.bgSecondary,
                border: `1px solid ${colors.border}`,
                borderRadius: '4px',
                fontSize: '11px',
                color: colors.text,
                cursor: 'pointer'
              }}
            >
              {PAGE_SIZE_OPTIONS.map(size => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleClearHistory}
            style={{
              padding: '4px 8px',
              background: 'transparent',
              border: `1px solid ${colors.error}`,
              borderRadius: '4px',
              fontSize: '11px',
              color: colors.error,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <Trash2 size={12} /> Clear
          </button>
        </div>
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialogComponent />
    </div>
  )
}

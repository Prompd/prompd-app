import { User, Bot, Maximize2, AlertCircle, Sparkles, Play, ExternalLink, Info, ChevronDown, ChevronRight, Cpu, Terminal, FileText, Search, Folder, Loader2, Check, X, Clock, Ban, Plus, Minus, GitMerge } from 'lucide-react'
import type { PrompdChatMessage, PrompdPackageRecommendation, PrompdPackageMetadata, PrompdMetadata as PrompdMetadataType } from '../types'
import { clsx } from 'clsx'
import { useState } from 'react'
import { PrompdPackageSuggestionMessage } from './PrompdPackageSuggestionMessage'
import { PrompdExecutionResult as PrompdExecutionResultComponent } from './PrompdExecutionResult'
import { MarkdownChatMessage } from './MarkdownChatMessage'

// Side-by-side diff view for edit_file operations in chat history
function SideBySideDiff({ edits, path }: { edits: Array<{ search: string; replace: string }>; path?: string }) {
  const maxEditsToShow = 5
  const visibleEdits = edits.slice(0, maxEditsToShow)
  const remainingCount = edits.length - maxEditsToShow

  // Split content into lines for display, truncate long content
  const prepareLines = (text: string, maxLines: number = 20) => {
    const lines = text.split('\n')
    const truncated = lines.length > maxLines
    return { lines: lines.slice(0, maxLines), truncated, totalLines: lines.length }
  }

  return (
    <div style={{
      borderRadius: '6px',
      overflow: 'auto',
      maxHeight: '400px',
      fontFamily: 'ui-monospace, monospace',
      fontSize: '11px'
    }}>
      {path && (
        <div style={{
          padding: '6px 10px',
          fontSize: '11px',
          color: 'var(--prompd-muted)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'var(--prompd-panel)'
        }}>
          {path}
        </div>
      )}
      {visibleEdits.map((edit, idx) => {
        const oldLines = prepareLines(edit.search)
        const newLines = prepareLines(edit.replace)

        return (
          <div key={idx} style={{ marginBottom: idx < visibleEdits.length - 1 ? '2px' : 0 }}>
            {edits.length > 1 && (
              <div style={{
                fontSize: '10px',
                color: 'var(--prompd-muted)',
                padding: '4px 10px',
                background: 'var(--prompd-panel)',
                fontWeight: 500
              }}>
                Change {idx + 1} of {edits.length}
              </div>
            )}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1px',
              background: 'rgba(255,255,255,0.06)'
            }}>
              {/* Left: old content (removed) */}
              <div style={{
                background: 'rgba(239, 68, 68, 0.08)',
                padding: '8px',
                minWidth: 0
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  marginBottom: '6px',
                  color: '#ef4444',
                  fontSize: '10px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  <Minus size={10} />
                  Removed
                </div>
                <div style={{ overflow: 'hidden' }}>
                  {oldLines.lines.map((line, i) => (
                    <div key={i} style={{
                      display: 'flex',
                      gap: '8px',
                      lineHeight: '18px'
                    }}>
                      <span style={{
                        color: 'rgba(239, 68, 68, 0.4)',
                        userSelect: 'none',
                        minWidth: '20px',
                        textAlign: 'right',
                        flexShrink: 0,
                        fontSize: '10px',
                        lineHeight: '18px'
                      }}>{i + 1}</span>
                      <pre style={{
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        color: '#fca5a5',
                        flex: 1,
                        minWidth: 0
                      }}>{line}</pre>
                    </div>
                  ))}
                  {oldLines.truncated && (
                    <div style={{ color: 'rgba(239, 68, 68, 0.5)', fontSize: '10px', marginTop: '4px', fontStyle: 'italic' }}>
                      ...{oldLines.totalLines - oldLines.lines.length} more lines
                    </div>
                  )}
                </div>
              </div>

              {/* Right: new content (added) */}
              <div style={{
                background: 'rgba(34, 197, 94, 0.08)',
                padding: '8px',
                minWidth: 0
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  marginBottom: '6px',
                  color: '#22c55e',
                  fontSize: '10px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  <Plus size={10} />
                  Added
                </div>
                <div style={{ overflow: 'hidden' }}>
                  {newLines.lines.map((line, i) => (
                    <div key={i} style={{
                      display: 'flex',
                      gap: '8px',
                      lineHeight: '18px'
                    }}>
                      <span style={{
                        color: 'rgba(34, 197, 94, 0.4)',
                        userSelect: 'none',
                        minWidth: '20px',
                        textAlign: 'right',
                        flexShrink: 0,
                        fontSize: '10px',
                        lineHeight: '18px'
                      }}>{i + 1}</span>
                      <pre style={{
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        color: '#86efac',
                        flex: 1,
                        minWidth: 0
                      }}>{line}</pre>
                    </div>
                  ))}
                  {newLines.truncated && (
                    <div style={{ color: 'rgba(34, 197, 94, 0.5)', fontSize: '10px', marginTop: '4px', fontStyle: 'italic' }}>
                      ...{newLines.totalLines - newLines.lines.length} more lines
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
      {remainingCount > 0 && (
        <div style={{
          fontSize: '10px',
          color: 'var(--prompd-muted)',
          fontStyle: 'italic',
          padding: '6px 10px',
          background: 'var(--prompd-panel)'
        }}>
          ...and {remainingCount} more change{remainingCount !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}

interface PrompdMessagesProps {
  messages: PrompdChatMessage[]
  onExpandResult?: (executionId: string) => void
  onPackageSelect?: (pkg: PrompdPackageMetadata) => void
  onPrompdSelect?: (prompd: PrompdMetadataType) => void
  onDeclinePackage?: () => void
  onRerunExecution?: (executionId: string, parameters?: Record<string, unknown>) => void
  className?: string
  onViewComparison?: () => void
}

export function PrompdMessages({
  messages,
  onExpandResult,
  onPackageSelect,
  onPrompdSelect,
  onDeclinePackage,
  onRerunExecution,
  className,
  onViewComparison,
}: PrompdMessagesProps) {
  return (
    <div className={clsx('space-y-6', className)}>
      {messages.map(message => (
        <Message
          key={message.id}
          message={message}
          onExpandResult={onExpandResult}
          onPackageSelect={onPackageSelect}
          onPrompdSelect={onPrompdSelect}
          onDeclinePackage={onDeclinePackage}
          onRerunExecution={onRerunExecution}
          onViewComparison={onViewComparison}
        />
      ))}
    </div>
  )
}

// Tool execution message component with collapsible details
function ToolExecutionMessage({
  toolName,
  toolParams,
  status,
  result,
  error,
  duration
}: {
  toolName: string
  toolParams: Record<string, unknown>
  status: 'pending' | 'running' | 'success' | 'error' | 'pending-approval' | 'rejected'
  result?: string
  error?: string
  duration?: number
}) {
  // Check if this is an edit_file with edits array
  const isEditFile = toolName === 'edit_file'
  const edits = isEditFile && Array.isArray(toolParams.edits) ? toolParams.edits as Array<{ search: string; replace: string }> : null
  const isReadFile = toolName === 'read_file'
  const isWriteFile = toolName === 'write_file'

  // Auto-expand for run_command with results, and edit_file/write_file with successful changes
  const shouldAutoExpand =
    (toolName === 'run_command' && status === 'success' && !!result) ||
    (isEditFile && status === 'success' && !!edits) ||
    (isWriteFile && status === 'success')
  const [expanded, setExpanded] = useState<boolean>(shouldAutoExpand)

  // Get icon and color based on tool type
  const getToolIcon = () => {
    switch (toolName) {
      case 'read_file':
        return <FileText className="w-4 h-4" />
      case 'write_file':
        return <FileText className="w-4 h-4" />
      case 'edit_file':
        return <GitMerge className="w-4 h-4" />
      case 'run_command':
        return <Terminal className="w-4 h-4" />
      case 'search_files':
      case 'search_registry':
        return <Search className="w-4 h-4" />
      case 'list_files':
        return <Folder className="w-4 h-4" />
      default:
        return <Cpu className="w-4 h-4" />
    }
  }

  // Get human-readable tool description
  const getToolDescription = () => {
    switch (toolName) {
      case 'read_file':
        return `Read ${toolParams.path || 'file'}`
      case 'write_file': {
        const content = toolParams.content as string | undefined
        const size = content ? formatBytes(content.length) : ''
        return `Wrote ${toolParams.path || 'file'}${size ? ` (${size})` : ''}`
      }
      case 'edit_file': {
        const editCount = edits?.length || 0
        return `Edited ${toolParams.path || 'file'} (${editCount} change${editCount !== 1 ? 's' : ''})`
      }
      case 'run_command':
        return `Running: ${String(toolParams.command || '').substring(0, 50)}${String(toolParams.command || '').length > 50 ? '...' : ''}`
      case 'search_files':
        return `Searching for "${toolParams.pattern || toolParams.query}"`
      case 'search_registry':
        return `Searching registry for "${toolParams.query}"`
      case 'list_files':
        return `Listing files in ${toolParams.path || 'directory'}`
      default:
        return `Executing ${toolName}`
    }
  }

  const statusColors = {
    pending: { bg: 'rgba(107, 114, 128, 0.1)', border: '#6b7280', text: '#6b7280' },
    running: { bg: 'rgba(59, 130, 246, 0.1)', border: '#3b82f6', text: '#3b82f6' },
    success: { bg: 'rgba(34, 197, 94, 0.1)', border: '#22c55e', text: '#22c55e' },
    error: { bg: 'rgba(239, 68, 68, 0.1)', border: '#ef4444', text: '#ef4444' },
    'pending-approval': { bg: 'rgba(168, 85, 247, 0.1)', border: '#a855f7', text: '#a855f7' },
    'rejected': { bg: 'rgba(239, 68, 68, 0.1)', border: '#ef4444', text: '#ef4444' }
  }

  const colors = statusColors[status]

  // read_file: compact one-liner, no expand
  if (isReadFile && status !== 'error') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          fontSize: '12px',
          color: 'var(--prompd-muted)',
          fontFamily: 'ui-monospace, monospace'
        }}
      >
        <div style={{ color: colors.text, flexShrink: 0 }}>
          {status === 'running' ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <FileText className="w-3 h-3" />
          )}
        </div>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {status === 'running' ? 'Reading' : 'Read'} {String(toolParams.path || 'file')}
        </span>
        {duration && status !== 'running' && (
          <span style={{ fontSize: '10px', opacity: 0.6, flexShrink: 0 }}>{(duration / 1000).toFixed(2)}s</span>
        )}
      </div>
    )
  }

  // Determine if this is expandable (read_file errors still show expand)
  const isExpandable = !isReadFile || status === 'error'

  return (
    <div
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: '10px',
        overflow: 'hidden'
      }}
    >
      {/* Header - always visible */}
      <button
        onClick={isExpandable ? () => setExpanded(!expanded) : undefined}
        style={{
          width: '100%',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: 'transparent',
          border: 'none',
          cursor: isExpandable ? 'pointer' : 'default',
          textAlign: 'left'
        }}
      >
        {/* Status indicator */}
        <div style={{ color: colors.text, flexShrink: 0 }}>
          {status === 'running' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : status === 'success' ? (
            <Check className="w-4 h-4" />
          ) : status === 'error' ? (
            <X className="w-4 h-4" />
          ) : status === 'pending-approval' ? (
            <Clock className="w-4 h-4" />
          ) : status === 'rejected' ? (
            <Ban className="w-4 h-4" />
          ) : (
            getToolIcon()
          )}
        </div>

        {/* Tool info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--prompd-text)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {getToolDescription()}
          </div>
          {duration && status !== 'running' && (
            <div style={{ fontSize: '11px', color: 'var(--prompd-muted)', marginTop: '2px' }}>
              {(duration / 1000).toFixed(2)}s
            </div>
          )}
        </div>

        {/* Expand/collapse indicator */}
        {isExpandable && (
          <div style={{ color: 'var(--prompd-muted)', flexShrink: 0 }}>
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>
        )}
      </button>

      {/* Expandable details */}
      {expanded && (
        <div style={{
          padding: '0 14px 12px',
          borderTop: `1px solid ${colors.border}`,
          marginTop: '0'
        }}>
          {/* Side-by-side diff for edit_file operations */}
          {isEditFile && edits && edits.length > 0 ? (
            <div style={{ marginTop: '10px' }}>
              <SideBySideDiff
                edits={edits}
                path={typeof toolParams.path === 'string' ? toolParams.path : undefined}
              />
            </div>
          ) : isWriteFile && typeof toolParams.content === 'string' ? (
            /* write_file: show content preview */
            <div style={{ marginTop: '10px' }}>
              <div style={{
                fontSize: '10px',
                fontWeight: 600,
                color: 'var(--prompd-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '6px'
              }}>
                Content Written
              </div>
              <div style={{
                background: 'rgba(34, 197, 94, 0.08)',
                borderRadius: '6px',
                padding: '8px',
                fontFamily: 'ui-monospace, monospace',
                fontSize: '11px',
                overflow: 'auto',
                maxHeight: '300px'
              }}>
                {(toolParams.content as string).split('\n').slice(0, 30).map((line, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    gap: '8px',
                    lineHeight: '18px'
                  }}>
                    <span style={{
                      color: 'rgba(34, 197, 94, 0.4)',
                      userSelect: 'none',
                      minWidth: '24px',
                      textAlign: 'right',
                      flexShrink: 0,
                      fontSize: '10px',
                      lineHeight: '18px'
                    }}>{i + 1}</span>
                    <pre style={{
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      color: '#86efac',
                      flex: 1,
                      minWidth: 0
                    }}>{line}</pre>
                  </div>
                ))}
                {(toolParams.content as string).split('\n').length > 30 && (
                  <div style={{ color: 'rgba(34, 197, 94, 0.5)', fontSize: '10px', marginTop: '4px', fontStyle: 'italic', paddingLeft: '32px' }}>
                    ...{(toolParams.content as string).split('\n').length - 30} more lines
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Default: show parameters as JSON */
            <div style={{ marginTop: '10px' }}>
              <div style={{
                fontSize: '10px',
                fontWeight: 600,
                color: 'var(--prompd-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '6px'
              }}>
                Parameters
              </div>
              <pre style={{
                fontSize: '11px',
                fontFamily: 'ui-monospace, monospace',
                color: 'var(--prompd-text)',
                background: 'var(--prompd-panel)',
                padding: '8px 10px',
                borderRadius: '6px',
                overflow: 'auto',
                maxHeight: '120px',
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}>
                {JSON.stringify(toolParams, null, 2)}
              </pre>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div style={{ marginTop: '10px' }}>
              <div style={{
                fontSize: '10px',
                fontWeight: 600,
                color: '#ef4444',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '6px'
              }}>
                Error
              </div>
              <pre style={{
                fontSize: '11px',
                fontFamily: 'ui-monospace, monospace',
                color: '#ef4444',
                background: 'var(--prompd-panel)',
                padding: '8px 10px',
                borderRadius: '6px',
                overflow: 'auto',
                maxHeight: '200px',
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}>
                {error}
              </pre>
            </div>
          )}

          {/* Rich result display for non-file-modification tools */}
          {result && !error && !isEditFile && !isWriteFile && (
            <div style={{ marginTop: '10px' }}>
              <ToolResultView toolName={toolName} result={result} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Format bytes to human-readable string
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Rich result formatter - replaces raw JSON dumps with tool-specific views
function ToolResultView({ toolName, result }: { toolName: string; result: string }) {
  // Parse the JSON result string
  let parsed: Record<string, unknown> | null = null
  try {
    parsed = JSON.parse(result)
  } catch {
    // Not valid JSON - show as plain text
    return (
      <pre style={{
        fontSize: '11px',
        fontFamily: 'ui-monospace, monospace',
        color: 'var(--prompd-text)',
        background: 'var(--prompd-panel)',
        padding: '8px 10px',
        borderRadius: '6px',
        overflow: 'auto',
        maxHeight: '200px',
        margin: 0,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word'
      }}>
        {result}
      </pre>
    )
  }

  if (!parsed) return null

  // run_command: show terminal-style output
  if (toolName === 'run_command') {
    const stdout = parsed.stdout as string || ''
    const stderr = parsed.stderr as string || ''
    const exitCode = parsed.exitCode as number
    return (
      <div style={{
        background: '#0d1117',
        borderRadius: '6px',
        overflow: 'auto',
        maxHeight: '250px',
        fontFamily: 'ui-monospace, monospace',
        fontSize: '11px'
      }}>
        {stdout && (
          <pre style={{
            margin: 0,
            padding: '8px 10px',
            color: '#e6edf3',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word'
          }}>{stdout}</pre>
        )}
        {stderr && (
          <pre style={{
            margin: 0,
            padding: '8px 10px',
            color: '#f97583',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            borderTop: stdout ? '1px solid rgba(255,255,255,0.06)' : undefined
          }}>{stderr}</pre>
        )}
        {exitCode !== undefined && exitCode !== 0 && (
          <div style={{
            padding: '4px 10px 6px',
            color: '#f97583',
            fontSize: '10px',
            borderTop: '1px solid rgba(255,255,255,0.06)'
          }}>
            Exit code: {exitCode}
          </div>
        )}
      </div>
    )
  }

  // search_files: show matches as a file list with line + snippet
  if (toolName === 'search_files' && Array.isArray(parsed.matches)) {
    const matches = parsed.matches as Array<{ file: string; line: number; content: string }>
    const count = (parsed.count as number) || matches.length
    const truncated = parsed.truncated as boolean
    return (
      <div style={{
        borderRadius: '6px',
        overflow: 'auto',
        maxHeight: '250px'
      }}>
        <div style={{
          fontSize: '10px',
          fontWeight: 600,
          color: 'var(--prompd-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '6px'
        }}>
          {count} match{count !== 1 ? 'es' : ''}{truncated ? ' (truncated)' : ''}
        </div>
        <div style={{
          background: 'var(--prompd-panel)',
          borderRadius: '6px',
          fontFamily: 'ui-monospace, monospace',
          fontSize: '11px'
        }}>
          {matches.slice(0, 20).map((m, i) => (
            <div key={i} style={{
              padding: '4px 10px',
              borderBottom: i < Math.min(matches.length, 20) - 1 ? '1px solid rgba(255,255,255,0.04)' : undefined,
              display: 'flex',
              gap: '8px',
              alignItems: 'baseline'
            }}>
              <span style={{ color: '#60a5fa', flexShrink: 0 }}>{m.file}</span>
              <span style={{ color: 'var(--prompd-muted)', flexShrink: 0 }}>:{m.line}</span>
              <span style={{
                color: 'var(--prompd-text)',
                opacity: 0.7,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>{m.content}</span>
            </div>
          ))}
          {matches.length > 20 && (
            <div style={{ padding: '4px 10px', color: 'var(--prompd-muted)', fontSize: '10px', fontStyle: 'italic' }}>
              ...{matches.length - 20} more matches
            </div>
          )}
        </div>
      </div>
    )
  }

  // list_files: show as compact file list
  if (toolName === 'list_files' && Array.isArray(parsed.files)) {
    const files = parsed.files as Array<{ name: string; path: string; type: string; size?: number }>
    const count = (parsed.count as number) || files.length
    return (
      <div style={{
        borderRadius: '6px',
        overflow: 'auto',
        maxHeight: '250px'
      }}>
        <div style={{
          fontSize: '10px',
          fontWeight: 600,
          color: 'var(--prompd-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '6px'
        }}>
          {count} item{count !== 1 ? 's' : ''}
        </div>
        <div style={{
          background: 'var(--prompd-panel)',
          borderRadius: '6px',
          fontFamily: 'ui-monospace, monospace',
          fontSize: '11px'
        }}>
          {files.slice(0, 30).map((f, i) => (
            <div key={i} style={{
              padding: '3px 10px',
              borderBottom: i < Math.min(files.length, 30) - 1 ? '1px solid rgba(255,255,255,0.04)' : undefined,
              display: 'flex',
              gap: '6px',
              alignItems: 'center'
            }}>
              <span style={{ color: 'var(--prompd-muted)', flexShrink: 0, fontSize: '10px' }}>
                {f.type === 'directory' ? <Folder className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
              </span>
              <span style={{ color: f.type === 'directory' ? '#60a5fa' : 'var(--prompd-text)' }}>
                {f.path || f.name}
              </span>
              {f.size !== undefined && f.type === 'file' && (
                <span style={{ color: 'var(--prompd-muted)', fontSize: '10px', marginLeft: 'auto', flexShrink: 0 }}>
                  {formatBytes(f.size)}
                </span>
              )}
            </div>
          ))}
          {files.length > 30 && (
            <div style={{ padding: '4px 10px', color: 'var(--prompd-muted)', fontSize: '10px', fontStyle: 'italic' }}>
              ...{files.length - 30} more items
            </div>
          )}
        </div>
      </div>
    )
  }

  // search_registry: show package cards
  if (toolName === 'search_registry' && Array.isArray(parsed.packages)) {
    const packages = parsed.packages as Array<{ name: string; version: string; description?: string; keywords?: string[]; downloads?: number; author?: string }>
    const total = (parsed.total as number) || packages.length
    return (
      <div style={{
        borderRadius: '6px',
        overflow: 'auto',
        maxHeight: '300px'
      }}>
        <div style={{
          fontSize: '10px',
          fontWeight: 600,
          color: 'var(--prompd-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '6px'
        }}>
          {total} package{total !== 1 ? 's' : ''} found
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {packages.slice(0, 10).map((pkg, i) => (
            <div key={i} style={{
              background: 'var(--prompd-panel)',
              borderRadius: '6px',
              padding: '8px 10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{
                  fontWeight: 600,
                  fontSize: '12px',
                  color: '#60a5fa',
                  fontFamily: 'ui-monospace, monospace'
                }}>{pkg.name}</span>
                <span style={{
                  fontSize: '10px',
                  color: 'var(--prompd-muted)',
                  fontFamily: 'ui-monospace, monospace'
                }}>v{pkg.version}</span>
                {pkg.author && (
                  <span style={{ fontSize: '10px', color: 'var(--prompd-muted)', marginLeft: 'auto' }}>
                    by {pkg.author}
                  </span>
                )}
              </div>
              {pkg.description && (
                <div style={{
                  fontSize: '11px',
                  color: 'var(--prompd-text)',
                  opacity: 0.8,
                  marginTop: '3px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>{pkg.description}</div>
              )}
              {pkg.keywords && pkg.keywords.length > 0 && (
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                  {pkg.keywords.slice(0, 5).map((kw, j) => (
                    <span key={j} style={{
                      fontSize: '9px',
                      padding: '1px 6px',
                      borderRadius: '3px',
                      background: 'rgba(99, 102, 241, 0.15)',
                      color: '#818cf8'
                    }}>{kw}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {packages.length > 10 && (
            <div style={{ color: 'var(--prompd-muted)', fontSize: '10px', fontStyle: 'italic', padding: '2px 0' }}>
              ...{packages.length - 10} more packages
            </div>
          )}
        </div>
      </div>
    )
  }

  // list_package_files: show as package file tree
  if (toolName === 'list_package_files' && Array.isArray(parsed.files)) {
    const files = parsed.files as string[]
    const packageId = (parsed.packageId as string) || `${parsed.packageName}@${parsed.version}`
    return (
      <div style={{
        borderRadius: '6px',
        overflow: 'auto',
        maxHeight: '250px'
      }}>
        <div style={{
          fontSize: '10px',
          fontWeight: 600,
          color: 'var(--prompd-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '6px'
        }}>
          {packageId} - {files.length} file{files.length !== 1 ? 's' : ''}
        </div>
        <div style={{
          background: 'var(--prompd-panel)',
          borderRadius: '6px',
          fontFamily: 'ui-monospace, monospace',
          fontSize: '11px',
          padding: '4px 0'
        }}>
          {files.slice(0, 30).map((f, i) => (
            <div key={i} style={{
              padding: '2px 10px',
              color: 'var(--prompd-text)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <FileText className="w-3 h-3" style={{ color: 'var(--prompd-muted)', flexShrink: 0 }} />
              {f}
            </div>
          ))}
          {files.length > 30 && (
            <div style={{ padding: '4px 10px', color: 'var(--prompd-muted)', fontSize: '10px', fontStyle: 'italic' }}>
              ...{files.length - 30} more files
            </div>
          )}
        </div>
      </div>
    )
  }

  // Fallback: JSON display (for unknown tools or unexpected shapes)
  return (
    <div>
      <div style={{
        fontSize: '10px',
        fontWeight: 600,
        color: 'var(--prompd-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        marginBottom: '6px'
      }}>
        Result
      </div>
      <pre style={{
        fontSize: '11px',
        fontFamily: 'ui-monospace, monospace',
        color: 'var(--prompd-text)',
        background: 'var(--prompd-panel)',
        padding: '8px 10px',
        borderRadius: '6px',
        overflow: 'auto',
        maxHeight: '200px',
        margin: 0,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word'
      }}>
        {result}
      </pre>
    </div>
  )
}

// Slash command message component with collapsible output
function SlashCommandMessage({
  command,
  success,
  output,
  error
}: {
  command: string
  success: boolean
  output: string
  error?: string
}) {
  const [expanded, setExpanded] = useState<boolean>(true)

  const colors = success
    ? { bg: 'rgba(139, 92, 246, 0.1)', border: '#8b5cf6', text: '#8b5cf6' }
    : { bg: 'rgba(239, 68, 68, 0.1)', border: '#ef4444', text: '#ef4444' }

  return (
    <div
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: '10px',
        overflow: 'hidden'
      }}
    >
      {/* Header - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left'
        }}
      >
        {/* Slash icon */}
        <div style={{ color: colors.text, flexShrink: 0, fontSize: '16px', fontWeight: 600 }}>
          /
        </div>

        {/* Command info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--prompd-text)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{ fontFamily: 'ui-monospace, monospace' }}>{command}</span>
            {!success && (
              <span style={{
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '4px',
                background: 'rgba(239, 68, 68, 0.2)',
                color: '#ef4444'
              }}>
                Error
              </span>
            )}
          </div>
        </div>

        {/* Status icon */}
        <div style={{ color: colors.text, flexShrink: 0 }}>
          {success ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
        </div>

        {/* Expand/collapse indicator */}
        <div style={{ color: 'var(--prompd-muted)', flexShrink: 0 }}>
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </button>

      {/* Expandable output */}
      {expanded && (output || error) && (
        <div style={{
          padding: '0 14px 12px',
          borderTop: `1px solid ${colors.border}`
        }}>
          <div style={{ marginTop: '10px' }}>
            <div style={{
              fontSize: '10px',
              fontWeight: 600,
              color: error ? '#ef4444' : 'var(--prompd-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '6px'
            }}>
              {error ? 'Error' : 'Output'}
            </div>
            <div style={{
              fontSize: '13px',
              color: error ? '#ef4444' : 'var(--prompd-text)',
              background: 'var(--prompd-panel)',
              padding: '10px 12px',
              borderRadius: '6px',
              overflow: 'auto',
              maxHeight: '300px'
            }}>
              <MarkdownChatMessage
                content={error || output}
                isUser={false}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Message({
  message,
  onExpandResult,
  onPackageSelect,
  onPrompdSelect,
  onDeclinePackage,
  onViewComparison,
  onRerunExecution
}: {
  message: PrompdChatMessage
  onExpandResult?: (executionId: string) => void
  onPackageSelect?: (pkg: PrompdPackageMetadata) => void
  onPrompdSelect?: (prompd: PrompdMetadataType) => void
  onDeclinePackage?: () => void
  onViewComparison?: () => void
  onRerunExecution?: (executionId: string, parameters?: Record<string, unknown>) => void
}) {
  const [executionModalOpen, setExecutionModalOpen] = useState(false)
  const [showRunInfo, setShowRunInfo] = useState(false)
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'
  const isAssistant = message.role === 'assistant'

  return (
    <div
      className={clsx(
        'prompd-message flex gap-3 group',
        isUser ? 'prompd-message-user flex-row-reverse' : isSystem ? 'prompd-message-system flex-row' : 'prompd-message-assistant flex-row'
      )}
    >
      {/* Avatar - Beautiful Gradient Orbs */}
      <div className="prompd-avatar flex-shrink-0 relative">
        <div
          className="prompd-avatar-orb w-9 h-9 rounded-full flex items-center justify-center shadow-lg"
          style={{
            background: isUser
              ? 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)'
              : isSystem
              ? 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)'
              : 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
            boxShadow: isUser
              ? '0 4px 12px rgba(168, 85, 247, 0.3)'
              : '0 4px 12px rgba(59, 130, 246, 0.3)'
          }}
        >
          {isUser ? (
            <User className="w-5 h-5 text-white" />
          ) : isSystem ? (
            <AlertCircle className="w-5 h-5 text-white" />
          ) : (
            <Bot className="w-5 h-5 text-white" />
          )}
        </div>

        {/* Pulse animation for assistant (only while streaming) */}
        {!isUser && !isSystem && message.isStreaming && (
          <div
            className="absolute inset-0 rounded-full animate-pulse"
            style={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
              opacity: 0.2,
              animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
            }}
          />
        )}
      </div>

      {/* Content Container */}
      <div
        className={clsx(
          'flex-1 max-w-[85%] space-y-2',
          isUser ? 'items-end' : 'items-start'
        )}
      >
        {/* Message Bubble - Sleek & Modern */}
        <div
          className="prompd-message-content px-4 py-3 rounded-2xl shadow-sm backdrop-blur-sm"
          style={{
            background: isUser
              ? 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)'
              : isSystem
              ? 'var(--prompd-panel-2)'
              : 'var(--prompd-panel)',
            color: isUser ? 'white' : 'var(--prompd-text)',
            border: isUser ? 'none' : `1px solid var(--prompd-border)`,
            borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
            boxShadow: isUser
              ? '0 4px 12px rgba(59, 130, 246, 0.25)'
              : '0 1px 3px rgba(0, 0, 0, 0.1)'
          }}
        >
          {/* System Message: Package Suggestions */}
          {isSystem && message.metadata?.type === 'package-suggestions' && message.metadata?.recommendations ? (
            <div>
              <p className="mb-3 text-sm">{message.content}</p>
              <PrompdPackageSuggestionMessage
                recommendations={message.metadata.recommendations as PrompdPackageRecommendation[]}
                onAccept={(pkg) => onPackageSelect?.(pkg)}
                onDecline={() => onDeclinePackage?.()}
                layout="vertical"
                compact={false}
              />
            </div>
          ) : null}

          {/* System Message: Prompd Suggestions */}
          {isSystem && message.metadata?.type === 'prompd-suggestions' && message.metadata?.prompds ? (
            <div>
              <p className="mb-3 text-sm">{message.content}</p>
              <div className="space-y-2">
                {(message.metadata.prompds as PrompdMetadataType[]).map((prompd) => (
                  <button
                    key={prompd.id}
                    onClick={() => onPrompdSelect?.(prompd)}
                    className="w-full text-left p-3 rounded-lg transition-colors"
                    style={{
                      background: 'var(--prompd-panel)',
                      border: '1px solid var(--prompd-border)',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--prompd-accent)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--prompd-border)'
                    }}
                  >
                    <div className="font-medium text-sm">{prompd.name}</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--prompd-muted)' }}>
                      {prompd.description}
                    </div>
                    {prompd.tags && prompd.tags.length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {prompd.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 text-xs rounded-full"
                            style={{
                              background: 'var(--prompd-panel-2)',
                              color: 'var(--prompd-muted)'
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* System Message: Generate Prompt Confirmation */}
          {isSystem && message.metadata?.type === 'generate-prompt-confirmation' ? (
            <div>
              {message.content && <p className="mb-4 text-sm">{message.content}</p>}
              {message.metadata?.declined ? (
                <div className="px-4 py-2 rounded-lg text-sm" style={{
                  background: 'var(--prompd-panel-2)',
                  color: 'var(--prompd-muted)',
                  border: '1px solid var(--prompd-border)'
                }}>
                  Declined
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      if (message.metadata?.onAccept && typeof message.metadata.onAccept === 'function') {
                        message.metadata.onAccept()
                      }
                    }}
                    className="flex-1 px-6 py-3 rounded-xl font-medium transition-all"
                    style={{
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      color: 'white',
                      boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.02)'
                      e.currentTarget.style.boxShadow = '0 8px 20px rgba(16, 185, 129, 0.3)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)'
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.2)'
                    }}
                  >
                    ✨ Yes, Generate Custom Prompt
                  </button>
                  <button
                    onClick={() => onDeclinePackage?.()}
                    className="flex-1 px-6 py-3 rounded-xl font-medium transition-all"
                    style={{
                      background: 'var(--prompd-panel-2)',
                      color: 'var(--prompd-text)',
                      border: '1px solid var(--prompd-border)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--prompd-panel)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--prompd-panel-2)'
                    }}
                  >
                    No, Thanks
                  </button>
                </div>
              )}
            </div>
          ) : null}

          {/* System Message: Execution Result */}
          {isSystem && message.metadata?.type === 'execution-result' && message.metadata?.executionResult ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Play className="w-4 h-4" style={{ color: 'var(--prompd-accent)' }} />
                  <span>Execution Complete</span>
                </div>
                <button
                  onClick={() => setExecutionModalOpen(true)}
                  className="text-xs px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                  style={{
                    background: 'var(--prompd-panel)',
                    color: 'var(--prompd-accent)',
                    border: '1px solid var(--prompd-border)',
                    cursor: 'pointer'
                  }}
                >
                  <ExternalLink className="w-3 h-3" />
                  View Details
                </button>
              </div>
              <p className="text-sm" style={{ color: 'var(--prompd-muted)' }}>{message.content}</p>

              {/* Execution Result Modal */}
              {executionModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setExecutionModalOpen(false)}>
                  <div className="rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden" style={{ background: 'var(--prompd-panel)' }} onClick={(e) => e.stopPropagation()}>
                    <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--prompd-border)' }}>
                      <h2 className="text-lg font-semibold">Execution Result</h2>
                      <button
                        onClick={() => setExecutionModalOpen(false)}
                        className="transition-colors"
                        style={{ color: 'var(--prompd-muted)' }}
                      >
                        ✕
                      </button>
                    </div>
                    <div className="overflow-y-auto max-h-[calc(90vh-80px)]">
                      <PrompdExecutionResultComponent
                        result={message.metadata.executionResult as any}
                        onRerun={(params?: Record<string, unknown>) => {
                          onRerunExecution?.(message.id, params)
                          setExecutionModalOpen(false)
                        }}
                        onCopy={(content: string) => navigator.clipboard.writeText(content)}
                        showMetadata={true}
                        showCompiledPrompt={true}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* System Message: Comparison Complete */}
          {isSystem && message.metadata?.type === 'comparison-complete' && message.metadata?.showDetailsButton ? (
            <div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--prompd-text)' }}>{message.content}</p>
              <button
                onClick={() => onViewComparison?.()}
                className="mt-3 w-full px-4 py-2.5 rounded-lg transition-all flex items-center justify-center gap-2"
                style={{
                  background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.02)'
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(59, 130, 246, 0.3)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)'
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.2)'
                }}
              >
                <ExternalLink className="w-4 h-4" />
                View Full Comparison
              </button>
            </div>
          ) : null}

          {/* System Message: Tool Execution */}
          {isSystem && message.metadata?.type === 'tool-execution' ? (
            <ToolExecutionMessage
              toolName={message.metadata.toolName as string}
              toolParams={message.metadata.toolParams as Record<string, unknown>}
              status={message.metadata.status as 'pending' | 'running' | 'success' | 'error' | 'pending-approval' | 'rejected'}
              result={message.metadata.result as string | undefined}
              error={message.metadata.error as string | undefined}
              duration={message.metadata.duration as number | undefined}
            />
          ) : null}

          {/* System Message: Slash Command Result */}
          {isSystem && message.metadata?.type === 'slash-command' ? (
            <SlashCommandMessage
              command={message.metadata.command as string}
              success={message.metadata.success !== false}
              output={message.content}
              error={message.metadata.success === false ? message.content : undefined}
            />
          ) : null}

          {/* Regular message content (not system special types) */}
          {(!isSystem || !message.metadata?.type) ? (
            <MarkdownChatMessage
              content={message.content}
              isUser={isUser}
            />
          ) : null}

          {/* Run Info Footer - Inline within message bubble */}
          {isAssistant && message.metadata?.provider && showRunInfo && (
            <div
              className="text-xs"
              style={{
                borderTop: '1px solid var(--prompd-border)',
                marginTop: '8px',
                paddingTop: '8px',
                display: 'grid',
                gridTemplateColumns: 'auto 1fr',
                gap: '4px 12px',
                alignItems: 'baseline'
              }}
            >
              <span style={{ color: 'var(--prompd-muted)' }}>Provider</span>
              <span style={{ color: 'var(--prompd-text)', fontWeight: 500, textAlign: 'right' }}>{String(message.metadata?.provider || 'N/A')}</span>
              <span style={{ color: 'var(--prompd-muted)' }}>Model</span>
              <span style={{ color: 'var(--prompd-text)', fontWeight: 500, textAlign: 'right' }}>{String(message.metadata?.model || 'N/A')}</span>
              {message.metadata?.usage ? (
                <>
                  <span style={{ color: 'var(--prompd-muted)' }}>Tokens</span>
                  <span style={{ color: 'var(--prompd-text)', fontWeight: 500, fontFamily: 'monospace', textAlign: 'right' }}>
                    {(message.metadata.usage as Record<string, number>).promptTokens || 0} / {(message.metadata.usage as Record<string, number>).completionTokens || 0} / {(message.metadata.usage as Record<string, number>).totalTokens || 0}
                  </span>
                </>
              ) : null}
              {message.metadata?.duration ? (
                <>
                  <span style={{ color: 'var(--prompd-muted)' }}>Duration</span>
                  <span style={{ color: 'var(--prompd-text)', fontWeight: 500, fontFamily: 'monospace', textAlign: 'right' }}>
                    {((message.metadata.duration as number) / 1000).toFixed(2)}s
                  </span>
                </>
              ) : null}
              <span style={{ color: 'var(--prompd-muted)' }}>Time</span>
              <span style={{ color: 'var(--prompd-text)', fontWeight: 500, fontFamily: 'monospace', textAlign: 'right' }}>
                {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          )}
        </div>

        {/* Metadata Row - Clean & Minimal */}
        <div
          className={clsx(
            'prompd-message-meta flex items-center gap-2 px-2',
            isUser ? 'justify-end' : 'justify-start'
          )}
        >
          {/* Run Info Button - For Assistant Messages */}
          {isAssistant && message.metadata?.provider ? (
            <button
              onClick={() => setShowRunInfo(!showRunInfo)}
              className="flex items-center gap-1 px-2 py-1 rounded-md transition-all hover:scale-105 hover:bg-opacity-80"
              style={{
                background: showRunInfo ? 'var(--prompd-accent)' : 'rgba(59, 130, 246, 0.15)',
                color: showRunInfo ? 'white' : 'var(--prompd-accent)',
                fontSize: '11px',
                border: `1px solid ${showRunInfo ? 'var(--prompd-accent)' : 'rgba(59, 130, 246, 0.3)'}`
              }}
              title="View run details"
            >
              <Info className="w-3 h-3" />
            </button>
          ) : null}

          {/* Timestamp */}
          {!isAssistant && (
            <span
              className="text-xs opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color: 'var(--prompd-muted)' }}
            >
              {new Date(message.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          )}

          {/* Expand Button */}
          {message.executionId && onExpandResult && (
            <>
              <span style={{ color: 'var(--prompd-muted)', opacity: 0.4 }}>•</span>
              <button
                onClick={() => onExpandResult(message.executionId!)}
                className="flex items-center gap-1 px-2 py-1 rounded-md transition-all hover:scale-105"
                style={{
                  background: 'var(--prompd-panel-2)',
                  color: 'var(--prompd-accent)',
                  fontSize: '11px',
                  border: '1px solid var(--prompd-border)'
                }}
              >
                <Maximize2 className="w-3 h-3" />
                <span>Details</span>
              </button>
            </>
          )}

          {/* Model Badges - Elegant Pills */}
          {message.metadata && !isUser && (
            <div className="flex items-center gap-1.5">
              {message.metadata.provider && typeof message.metadata.provider === 'string' ? (
                <>
                  <span style={{ color: 'var(--prompd-muted)', opacity: 0.4 }}>•</span>
                  <span
                    className="px-2 py-0.5 rounded-full flex items-center gap-1"
                    style={{
                      background: 'var(--prompd-panel-2)',
                      border: '1px solid var(--prompd-border)',
                      color: 'var(--prompd-muted)',
                      fontSize: '10px',
                      fontWeight: 500
                    }}
                  >
                    <Sparkles className="w-2.5 h-2.5" style={{ color: 'var(--prompd-accent)' }} />
                    {String(message.metadata.provider)}
                  </span>
                </>
              ) : null}
              {message.metadata.model && typeof message.metadata.model === 'string' ? (
                <span
                  className="px-2 py-0.5 rounded-full font-mono"
                  style={{
                    background: 'var(--prompd-panel-2)',
                    border: '1px solid var(--prompd-border)',
                    color: 'var(--prompd-muted)',
                    fontSize: '9px'
                  }}
                >
                  {String(message.metadata.model)}
                </span>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

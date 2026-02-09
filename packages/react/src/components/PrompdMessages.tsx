import { User, Bot, Maximize2, AlertCircle, Sparkles, Play, ExternalLink, Info, ChevronDown, ChevronRight, Cpu, Terminal, FileText, Search, Folder, Loader2, Check, X, Clock, Ban, Plus, Minus, GitMerge } from 'lucide-react'
import type { PrompdChatMessage, PrompdPackageRecommendation, PrompdPackageMetadata, PrompdMetadata as PrompdMetadataType } from '../types'
import { clsx } from 'clsx'
import { useState } from 'react'
import { PrompdPackageSuggestionMessage } from './PrompdPackageSuggestionMessage'
import { PrompdExecutionResult as PrompdExecutionResultComponent } from './PrompdExecutionResult'
import { MarkdownChatMessage } from './MarkdownChatMessage'

// Compact stacked diff view for edit_file operations in chat history
function EditDiffPreview({ edits }: { edits: Array<{ search: string; replace: string }> }) {
  const maxEditsToShow = 3
  const visibleEdits = edits.slice(0, maxEditsToShow)
  const remainingCount = edits.length - maxEditsToShow

  return (
    <div style={{
      background: 'var(--prompd-panel)',
      borderRadius: '6px',
      padding: '10px',
      fontFamily: 'ui-monospace, monospace',
      fontSize: '11px',
      overflow: 'auto',
      maxHeight: '300px'
    }}>
      {visibleEdits.map((edit, idx) => (
        <div key={idx} style={{ marginBottom: idx < visibleEdits.length - 1 ? '12px' : 0 }}>
          {edits.length > 1 && (
            <div style={{
              fontSize: '10px',
              color: 'var(--prompd-muted)',
              marginBottom: '6px',
              fontWeight: 500
            }}>
              Change {idx + 1} of {edits.length}
            </div>
          )}

          {/* Remove section */}
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '4px',
            padding: '6px 8px',
            marginBottom: '4px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              marginBottom: '4px',
              color: '#ef4444',
              fontSize: '10px',
              fontWeight: 500
            }}>
              <Minus size={10} />
              Remove
            </div>
            <pre style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: '#fca5a5',
              fontSize: '11px',
              maxHeight: '80px',
              overflow: 'hidden'
            }}>
              {edit.search.length > 200 ? edit.search.slice(0, 200) + '...' : edit.search}
            </pre>
          </div>

          {/* Add section */}
          <div style={{
            background: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '4px',
            padding: '6px 8px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              marginBottom: '4px',
              color: '#22c55e',
              fontSize: '10px',
              fontWeight: 500
            }}>
              <Plus size={10} />
              Add
            </div>
            <pre style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: '#86efac',
              fontSize: '11px',
              maxHeight: '80px',
              overflow: 'hidden'
            }}>
              {edit.replace.length > 200 ? edit.replace.slice(0, 200) + '...' : edit.replace}
            </pre>
          </div>
        </div>
      ))}
      {remainingCount > 0 && (
        <div style={{
          fontSize: '10px',
          color: 'var(--prompd-muted)',
          fontStyle: 'italic',
          marginTop: '8px',
          padding: '4px 0'
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
  // Auto-expand for run_command with successful results (shows terminal output)
  const shouldAutoExpand = toolName === 'run_command' && status === 'success' && !!result
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

  // Check if this is an edit_file with edits array
  const isEditFile = toolName === 'edit_file'
  const edits = isEditFile && Array.isArray(toolParams.edits) ? toolParams.edits as Array<{ search: string; replace: string }> : null

  // Get human-readable tool description
  const getToolDescription = () => {
    switch (toolName) {
      case 'read_file':
        return `Reading ${toolParams.path || 'file'}`
      case 'write_file':
        return `Writing to ${toolParams.path || 'file'}`
      case 'edit_file': {
        const editCount = edits?.length || 0
        return `Editing ${toolParams.path || 'file'} (${editCount} change${editCount !== 1 ? 's' : ''})`
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
        <div style={{ color: 'var(--prompd-muted)', flexShrink: 0 }}>
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </button>

      {/* Expandable details */}
      {expanded && (
        <div style={{
          padding: '0 14px 12px',
          borderTop: `1px solid ${colors.border}`,
          marginTop: '0'
        }}>
          {/* Show diff preview for edit_file operations */}
          {isEditFile && edits && edits.length > 0 ? (
            <div style={{ marginTop: '10px' }}>
              <div style={{
                fontSize: '10px',
                fontWeight: 600,
                color: 'var(--prompd-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '6px'
              }}>
                Changes
              </div>
              <EditDiffPreview edits={edits} />
              {/* Show file path */}
              {typeof toolParams.path === 'string' && toolParams.path && (
                <div style={{
                  marginTop: '8px',
                  fontSize: '11px',
                  color: 'var(--prompd-muted)',
                  fontFamily: 'ui-monospace, monospace'
                }}>
                  File: {toolParams.path}
                </div>
              )}
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

          {/* Result or Error */}
          {(result || error) && (
            <div style={{ marginTop: '10px' }}>
              <div style={{
                fontSize: '10px',
                fontWeight: 600,
                color: error ? '#ef4444' : 'var(--prompd-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '6px'
              }}>
                {error ? 'Error' : 'Result'}
              </div>
              <pre style={{
                fontSize: '11px',
                fontFamily: 'ui-monospace, monospace',
                color: error ? '#ef4444' : 'var(--prompd-text)',
                background: 'var(--prompd-panel)',
                padding: '8px 10px',
                borderRadius: '6px',
                overflow: 'auto',
                maxHeight: '200px',
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}>
                {error || (typeof result === 'string' ? result : JSON.stringify(result, null, 2))}
              </pre>
            </div>
          )}
        </div>
      )}
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
            <div className="relative">
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

              {/* Stats Tooltip */}
              {showRunInfo && (
                <div
                  className="absolute left-0 top-full mt-1 z-50 p-3 rounded-lg shadow-xl min-w-[240px]"
                  style={{
                    background: 'var(--prompd-panel)',
                    border: '1px solid var(--prompd-accent)',
                    boxShadow: '0 8px 24px rgba(59, 130, 246, 0.25)'
                  }}
                >
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between gap-4">
                      <span style={{ color: 'var(--prompd-muted)' }}>Provider:</span>
                      <span style={{ color: 'var(--prompd-text)', fontWeight: 500 }}>{String(message.metadata?.provider || 'N/A')}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span style={{ color: 'var(--prompd-muted)' }}>Model:</span>
                      <span style={{ color: 'var(--prompd-text)', fontWeight: 500 }}>{String(message.metadata?.model || 'N/A')}</span>
                    </div>
                    {message.metadata?.usage ? (
                      <>
                        <div style={{ borderTop: '1px solid var(--prompd-border)', margin: '8px 0' }} />
                        <div className="flex justify-between gap-4">
                          <span style={{ color: 'var(--prompd-muted)' }}>Prompt Tokens:</span>
                          <span style={{ color: 'var(--prompd-text)', fontWeight: 500, fontFamily: 'monospace' }}>
                            {(message.metadata.usage as any).promptTokens || 0}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span style={{ color: 'var(--prompd-muted)' }}>Completion Tokens:</span>
                          <span style={{ color: 'var(--prompd-text)', fontWeight: 500, fontFamily: 'monospace' }}>
                            {(message.metadata.usage as any).completionTokens || 0}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span style={{ color: 'var(--prompd-muted)' }}>Total Tokens:</span>
                          <span style={{ color: 'var(--prompd-text)', fontWeight: 600, fontFamily: 'monospace' }}>
                            {(message.metadata.usage as any).totalTokens || 0}
                          </span>
                        </div>
                      </>
                    ) : null}
                    {message.metadata?.duration ? (
                      <>
                        <div style={{ borderTop: '1px solid var(--prompd-border)', margin: '8px 0' }} />
                        <div className="flex justify-between gap-4">
                          <span style={{ color: 'var(--prompd-muted)' }}>Duration:</span>
                          <span style={{ color: 'var(--prompd-text)', fontWeight: 500, fontFamily: 'monospace' }}>
                            {((message.metadata.duration as number) / 1000).toFixed(2)}s
                          </span>
                        </div>
                      </>
                    ) : null}
                    <div style={{ borderTop: '1px solid var(--prompd-border)', margin: '8px 0' }} />
                    <div className="flex justify-between gap-4">
                      <span style={{ color: 'var(--prompd-muted)' }}>Timestamp:</span>
                      <span style={{ color: 'var(--prompd-text)', fontWeight: 500, fontFamily: 'monospace' }}>
                        {new Date(message.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
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

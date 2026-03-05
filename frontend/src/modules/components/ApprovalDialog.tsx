/**
 * ApprovalDialog Component
 *
 * Shows a modal dialog asking user to approve or reject a tool call.
 * Used by agent mode when permission level requires confirmation.
 * Shows Monaco side-by-side diff for edit_file and write_file operations.
 */

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Check, X, Terminal, FileEdit, Folder, Search, GitMerge, Plus, Minus, Loader2 } from 'lucide-react'
import type { ToolCall, EditOperation } from '../services/toolExecutor'
import { ApprovalDiffView } from './ApprovalDiffView'
import { applyEdits, getFileContent } from '../services/diffUtils'
import { useEditorStore } from '../../stores/editorStore'

interface FileContentState {
  isLoading: boolean
  originalContent: string | null
  modifiedContent: string | null
  error: string | null
}

interface ApprovalDialogProps {
  toolCall: ToolCall
  /** Multiple tool calls when in plan mode - shows all as a batched plan */
  toolCalls?: ToolCall[]
  onApprove: () => void
  onReject: (reason?: string) => void
  currentFileContent?: string // For showing diffs (legacy)
  /** Workspace path for file resolution */
  workspacePath?: string | null
  /** Theme for Monaco diff editor */
  theme?: 'light' | 'dark'
}

// Get icon for tool type
function getToolIcon(toolName: string) {
  switch (toolName) {
    case 'write_file':
      return <FileEdit size={20} />
    case 'edit_file':
      return <GitMerge size={20} />
    case 'run_command':
      return <Terminal size={20} />
    case 'read_file':
    case 'list_files':
      return <Folder size={20} />
    case 'search_files':
    case 'search_registry':
      return <Search size={20} />
    default:
      return <AlertTriangle size={20} />
  }
}

// Get human-readable tool description
function getToolDescription(toolCall: ToolCall): string {
  const { tool, params } = toolCall

  switch (tool) {
    case 'write_file':
      return `Write to file: ${params.path || 'unknown'}`
    case 'edit_file': {
      const edits = params.edits as EditOperation[] | undefined
      const editCount = edits?.length || 0
      return `Edit file: ${params.path || 'unknown'} (${editCount} change${editCount !== 1 ? 's' : ''})`
    }
    case 'run_command':
      return `Execute command: ${params.command || 'unknown'}`
    case 'read_file':
      return `Read file: ${params.path || 'unknown'}`
    case 'list_files':
      return `List files in: ${params.path || 'current directory'}`
    case 'search_files':
      return `Search for: "${params.pattern || 'unknown'}" in ${params.path || 'workspace'}`
    case 'search_registry':
      return `Search registry for: "${params.query || 'unknown'}"`
    default:
      return `Execute tool: ${tool}`
  }
}

// Get risk level for tool
function getToolRisk(toolName: string): 'low' | 'medium' | 'high' {
  switch (toolName) {
    case 'run_command':
      return 'high'
    case 'write_file':
    case 'edit_file':
      return 'medium'
    default:
      return 'low'
  }
}

// Render edit operations as a diff view
function renderEditDiff(edits: EditOperation[]): JSX.Element {
  return (
    <div style={{
      background: 'var(--prompd-panel)',
      borderRadius: '6px',
      padding: '12px',
      fontFamily: 'monospace',
      fontSize: '12px',
      overflow: 'auto',
      maxHeight: '300px'
    }}>
      {edits.map((edit, idx) => (
        <div key={idx} style={{ marginBottom: idx < edits.length - 1 ? '16px' : 0 }}>
          <div style={{
            fontSize: '11px',
            color: 'var(--prompd-muted)',
            marginBottom: '8px',
            fontWeight: 500
          }}>
            Change {idx + 1} of {edits.length}
          </div>

          {/* Search (what will be removed/replaced) */}
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '4px',
            padding: '8px',
            marginBottom: '4px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '4px',
              color: '#ef4444',
              fontSize: '11px',
              fontWeight: 500
            }}>
              <Minus size={12} />
              Remove
            </div>
            <pre style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: '#fca5a5'
            }}>
              {edit.search}
            </pre>
          </div>

          {/* Replace (what will be added) */}
          <div style={{
            background: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '4px',
            padding: '8px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '4px',
              color: '#22c55e',
              fontSize: '11px',
              fontWeight: 500
            }}>
              <Plus size={12} />
              Add
            </div>
            <pre style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: '#86efac'
            }}>
              {edit.replace}
            </pre>
          </div>
        </div>
      ))}
    </div>
  )
}

// Render tool parameters in a readable format
function renderParams(params: Record<string, unknown>): JSX.Element {
  const formatValue = (value: unknown): string => {
    if (typeof value === 'string') return value
    return JSON.stringify(value, null, 2)
  }

  return (
    <div style={{
      background: 'var(--prompd-panel)',
      borderRadius: '6px',
      padding: '12px',
      fontFamily: 'monospace',
      fontSize: '12px',
      overflow: 'auto',
      maxHeight: '200px'
    }}>
      {Object.entries(params).map(([key, value]) => (
        <div key={key} style={{ marginBottom: '8px' }}>
          <span style={{ color: 'var(--prompd-accent)', fontWeight: 500 }}>{key}:</span>
          <pre style={{
            margin: '4px 0 0 16px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: 'var(--prompd-text)'
          }}>
            {formatValue(value)}
          </pre>
        </div>
      ))}
    </div>
  )
}

export function ApprovalDialog({ toolCall, toolCalls, onApprove, onReject, currentFileContent, workspacePath, theme = 'dark' }: ApprovalDialogProps) {
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [expandedTool, setExpandedTool] = useState<number | null>(null)
  const [fileContent, setFileContent] = useState<FileContentState>({
    isLoading: false,
    originalContent: null,
    modifiedContent: null,
    error: null
  })

  // Get tab content helper from editor store
  const tabs = useEditorStore(state => state.tabs)
  const getTabContent = useCallback((path: string): string | null => {
    const tab = tabs.find(t => t.filePath === path || t.filePath?.endsWith(path))
    return tab?.text ?? null
  }, [tabs])

  // Use toolCalls array if provided, otherwise wrap single toolCall
  const allToolCalls = toolCalls && toolCalls.length > 0 ? toolCalls : [toolCall]
  const isMultiple = allToolCalls.length > 1

  // Get highest risk level from all tools
  const overallRisk = allToolCalls.reduce((highest, tc) => {
    const risk = getToolRisk(tc.tool)
    if (risk === 'high') return 'high'
    if (risk === 'medium' && highest !== 'high') return 'medium'
    return highest
  }, 'low' as 'low' | 'medium' | 'high')

  const riskColors = {
    low: { bg: 'rgba(34, 197, 94, 0.1)', border: '#22c55e', text: '#22c55e' },
    medium: { bg: 'rgba(234, 179, 8, 0.1)', border: '#eab308', text: '#eab308' },
    high: { bg: 'rgba(239, 68, 68, 0.1)', border: '#ef4444', text: '#ef4444' }
  }
  const colors = riskColors[overallRisk]

  // Load file content for edit_file or write_file operations (single tool only)
  useEffect(() => {
    if (isMultiple) return // Multi-tool uses PlanApprovalDialog

    const loadContent = async () => {
      const filePath = toolCall.params.path as string | undefined
      if (!filePath) return

      // Handle edit_file
      if (toolCall.tool === 'edit_file') {
        const edits = toolCall.params.edits as EditOperation[] | undefined
        if (!edits || edits.length === 0) return

        setFileContent({ isLoading: true, originalContent: null, modifiedContent: null, error: null })

        try {
          // Try to get file content
          const result = await getFileContent(filePath, {
            getTabContent,
            electronAPI: window.electronAPI,
            workspacePath: workspacePath || undefined
          })

          if (result.success) {
            // Apply edits to get modified content
            const editResult = applyEdits(result.content, edits)
            setFileContent({
              isLoading: false,
              originalContent: result.content,
              modifiedContent: editResult.modifiedContent,
              error: editResult.success ? null : editResult.error || 'Some edits failed to apply'
            })
          } else {
            setFileContent({
              isLoading: false,
              originalContent: null,
              modifiedContent: null,
              error: result.error || 'Failed to load file content'
            })
          }
        } catch (err) {
          setFileContent({
            isLoading: false,
            originalContent: null,
            modifiedContent: null,
            error: err instanceof Error ? err.message : 'Unknown error'
          })
        }
      }

      // Handle write_file
      if (toolCall.tool === 'write_file') {
        const newContent = toolCall.params.content as string | undefined
        if (newContent === undefined) return

        setFileContent({ isLoading: true, originalContent: null, modifiedContent: null, error: null })

        try {
          // Try to get existing file content (might be a new file)
          const result = await getFileContent(filePath, {
            getTabContent,
            electronAPI: window.electronAPI,
            workspacePath: workspacePath || undefined
          })

          // For write_file: original is current content (or empty for new file)
          // modified is the new content being written
          setFileContent({
            isLoading: false,
            originalContent: result.success ? result.content : '',
            modifiedContent: newContent,
            error: null
          })
        } catch {
          // If we can't read the file, assume it's a new file
          setFileContent({
            isLoading: false,
            originalContent: '',
            modifiedContent: newContent,
            error: null
          })
        }
      }
    }

    loadContent()
  }, [toolCall, isMultiple, getTabContent, workspacePath])

  const handleReject = () => {
    if (showRejectInput) {
      onReject(rejectReason || undefined)
    } else {
      setShowRejectInput(true)
    }
  }

  // Render a single tool call (for expanded view or single tool)
  const renderSingleToolContent = (tc: ToolCall): JSX.Element => {
    const isEditFile = tc.tool === 'edit_file'
    const edits: EditOperation[] | null = isEditFile && Array.isArray(tc.params.edits)
      ? (tc.params.edits as EditOperation[])
      : null

    if (isEditFile && edits && edits.length > 0) {
      return renderEditDiff(edits)
    }
    return renderParams(tc.params as Record<string, unknown>)
  }

  // For single tool, check if it's a file operation
  const isEditFile = toolCall.tool === 'edit_file'
  const isWriteFile = toolCall.tool === 'write_file'
  const isFileOperation = isEditFile || isWriteFile
  const edits: EditOperation[] | null = isEditFile && Array.isArray(toolCall.params.edits)
    ? (toolCall.params.edits as EditOperation[])
    : null
  const filePath = toolCall.params.path as string | undefined

  // Check if we can show Monaco diff (have loaded content successfully)
  const canShowMonacoDiff = isFileOperation &&
    fileContent.originalContent !== null &&
    fileContent.modifiedContent !== null

  // Render content section based on tool type
  const renderToolContent = (): JSX.Element => {
    // Show loading state while fetching file content
    if (isFileOperation && fileContent.isLoading) {
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          padding: '40px 20px',
          background: 'var(--prompd-panel)',
          borderRadius: '6px',
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

    // Show Monaco diff if we have the content
    if (canShowMonacoDiff) {
      return (
        <ApprovalDiffView
          originalContent={fileContent.originalContent || ''}
          modifiedContent={fileContent.modifiedContent || ''}
          filePath={filePath}
          theme={theme}
          height={350}
          loadError={fileContent.error}
          edits={edits || undefined}
        />
      )
    }

    // Fall back to stacked diff for edit_file if Monaco loading failed
    if (isEditFile && edits && edits.length > 0) {
      return (
        <>
          {fileContent.error && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              background: 'rgba(234, 179, 8, 0.1)',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              borderRadius: '6px',
              marginBottom: '12px',
              fontSize: '12px',
              color: '#fbbf24'
            }}>
              <AlertTriangle size={14} />
              <span>{fileContent.error} - showing edit preview</span>
            </div>
          )}
          {renderEditDiff(edits)}
        </>
      )
    }

    // Default: show parameters
    return renderParams(toolCall.params as Record<string, unknown>)
  }

  return createPortal(
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      backdropFilter: 'blur(4px)'
    }}>
      <div style={{
        background: 'var(--prompd-panel-2, #1e1e2e)',
        borderRadius: '12px',
        border: '1px solid var(--border)',
        maxWidth: isFileOperation ? '900px' : '500px',
        width: '90%',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
        animation: 'fadeIn 0.2s ease-out'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: colors.text
          }}>
            {isMultiple ? <AlertTriangle size={20} /> : getToolIcon(toolCall.tool)}
          </div>
          <div>
            <h3 style={{
              margin: 0,
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--prompd-text)'
            }}>
              {isMultiple ? `Plan: ${allToolCalls.length} Actions` : 'Approval Required'}
            </h3>
            <p style={{
              margin: '2px 0 0',
              fontSize: '13px',
              color: 'var(--prompd-muted)'
            }}>
              {isMultiple
                ? 'Review and approve all actions below'
                : getToolDescription(toolCall)}
            </p>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', maxHeight: '60vh', overflow: 'auto' }}>
          {/* Risk badge */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: '12px',
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            fontSize: '11px',
            fontWeight: 500,
            color: colors.text,
            marginBottom: '16px',
            textTransform: 'uppercase'
          }}>
            <AlertTriangle size={12} />
            {overallRisk} risk
          </div>

          {/* Multiple tools - show as a plan list */}
          {isMultiple ? (
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--prompd-muted)',
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Execution Plan
              </label>
              <div style={{
                background: 'var(--prompd-panel)',
                borderRadius: '6px',
                overflow: 'hidden'
              }}>
                {allToolCalls.map((tc, idx) => {
                  const tcRisk = getToolRisk(tc.tool)
                  const tcColors = riskColors[tcRisk]
                  const isExpanded = expandedTool === idx

                  return (
                    <div key={idx} style={{
                      borderBottom: idx < allToolCalls.length - 1 ? '1px solid var(--border)' : 'none'
                    }}>
                      <button
                        onClick={() => setExpandedTool(isExpanded ? null : idx)}
                        style={{
                          width: '100%',
                          padding: '12px',
                          background: 'transparent',
                          border: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          cursor: 'pointer',
                          textAlign: 'left'
                        }}
                      >
                        <div style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '6px',
                          background: tcColors.bg,
                          border: `1px solid ${tcColors.border}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: tcColors.text,
                          fontSize: '12px',
                          fontWeight: 600,
                          flexShrink: 0
                        }}>
                          {idx + 1}
                        </div>
                        <div style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}>
                          <span style={{ color: tcColors.text }}>
                            {getToolIcon(tc.tool)}
                          </span>
                          <span style={{
                            color: 'var(--prompd-text)',
                            fontSize: '13px'
                          }}>
                            {getToolDescription(tc)}
                          </span>
                        </div>
                        <span style={{
                          color: 'var(--prompd-muted)',
                          fontSize: '12px',
                          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s'
                        }}>
                          v
                        </span>
                      </button>
                      {isExpanded && (
                        <div style={{ padding: '0 12px 12px' }}>
                          {renderSingleToolContent(tc)}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <>
              {/* Single tool - Diff view for edit_file, parameters for others */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--prompd-muted)',
                  marginBottom: '8px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  {isEditFile ? 'Changes' : 'Parameters'}
                </label>
                {renderToolContent()}
              </div>

              {/* Show file path for edit_file */}
              {isEditFile && typeof toolCall.params.path === 'string' && (
                <div style={{
                  fontSize: '12px',
                  color: 'var(--prompd-muted)',
                  marginBottom: '16px'
                }}>
                  <strong>File:</strong> {toolCall.params.path}
                </div>
              )}
            </>
          )}

          {/* Reject reason input */}
          {showRejectInput && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--prompd-muted)',
                marginBottom: '8px'
              }}>
                Reason for rejection (optional)
              </label>
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Tell the agent why you rejected this..."
                autoFocus
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--prompd-panel)',
                  color: 'var(--prompd-text)',
                  fontSize: '13px',
                  outline: 'none'
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onReject(rejectReason || undefined)
                  }
                }}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 20px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '10px'
        }}>
          <button
            onClick={handleReject}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--prompd-text)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            <X size={14} />
            {showRejectInput ? 'Confirm Reject' : 'Reject'}
          </button>
          <button
            onClick={onApprove}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              background: 'var(--prompd-accent, #6366f1)',
              color: 'white',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            <Check size={14} />
            {isMultiple ? `Approve All (${allToolCalls.length})` : 'Approve'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

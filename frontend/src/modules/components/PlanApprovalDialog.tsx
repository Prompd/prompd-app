/**
 * PlanApprovalDialog Component
 *
 * Shows a modal dialog with the full execution plan for user approval.
 * Used in "plan" mode to show all proposed tool calls before execution.
 * Features Monaco side-by-side diff for edit_file and write_file operations.
 */

import { useState, useEffect, useCallback } from 'react'
import { ClipboardList, Check, X, ChevronDown, ChevronRight, FileEdit, GitMerge, Terminal, Folder, Search, Package, Eye, ToggleLeft, ToggleRight } from 'lucide-react'
import type { EditOperation } from '../services/toolExecutor'
import { ApprovalDiffView } from './ApprovalDiffView'
import { applyEdits, getFileContent } from '../services/diffUtils'
import { useEditorStore } from '../../stores/editorStore'

// ============================================================================
// Types
// ============================================================================

interface FileContentState {
  originalContent: string | null
  modifiedContent: string | null
  isLoading: boolean
  error: string | null
}

interface PlanApprovalDialogProps {
  toolCalls: Array<{ tool: string; params: Record<string, unknown> }>
  agentMessage: string // The agent's explanation of the plan
  onApprove: (enabledToolCalls: Array<{ tool: string; params: Record<string, unknown> }>) => void
  onReject: (reason?: string) => void
  /** Workspace path for file reading (Electron) */
  workspacePath?: string | null
  /** Theme for diff view */
  theme?: 'light' | 'dark'
}

// Get icon for tool type
function getToolIcon(toolName: string) {
  switch (toolName) {
    case 'write_file':
      return <FileEdit size={16} />
    case 'edit_file':
      return <GitMerge size={16} />
    case 'run_command':
      return <Terminal size={16} />
    case 'read_file':
    case 'list_files':
      return <Folder size={16} />
    case 'search_files':
    case 'search_registry':
      return <Search size={16} />
    case 'read_package_file':
    case 'list_package_files':
      return <Package size={16} />
    default:
      return <Eye size={16} />
  }
}

// Get human-readable tool description
function getToolDescription(tool: string, params: Record<string, unknown>): string {
  switch (tool) {
    case 'write_file':
      return `Write file: ${params.path || 'unknown'}`
    case 'edit_file': {
      const edits = params.edits as EditOperation[] | undefined
      const editCount = edits?.length || 0
      return `Edit file: ${params.path || 'unknown'} (${editCount} change${editCount !== 1 ? 's' : ''})`
    }
    case 'run_command':
      return `Run: ${params.command || 'unknown'}`
    case 'read_file':
      return `Read: ${params.path || 'unknown'}`
    case 'list_files':
      return `List: ${params.path || '.'}`
    case 'search_files':
      return `Search: "${params.pattern || ''}"`
    case 'search_registry':
      return `Search registry: "${params.query || ''}"`
    case 'read_package_file':
      return `Read package: ${params.package_name}@${params.version}/${params.file_path}`
    case 'list_package_files':
      return `List package: ${params.package_name}@${params.version}`
    default:
      return `${tool}`
  }
}

// Get action category
function getToolCategory(tool: string): 'read' | 'write' | 'execute' {
  switch (tool) {
    case 'write_file':
    case 'edit_file':
      return 'write'
    case 'run_command':
      return 'execute'
    default:
      return 'read'
  }
}

// Helper to format diff text for display
function formatDiffText(text: string, maxLines: number = 8): string[] {
  const lines = text.split('\n')
  if (lines.length <= maxLines) {
    return lines.map(line => line.length > 120 ? line.slice(0, 120) + '...' : line)
  }
  // Show first few and last few lines
  const halfLines = Math.floor(maxLines / 2)
  const first = lines.slice(0, halfLines)
  const last = lines.slice(-halfLines)
  return [
    ...first.map(line => line.length > 120 ? line.slice(0, 120) + '...' : line),
    `... ${lines.length - maxLines} more lines ...`,
    ...last.map(line => line.length > 120 ? line.slice(0, 120) + '...' : line)
  ]
}

// Render edit operations preview with toggleable changes
interface EditPreviewProps {
  edits: EditOperation[]
  actionIndex: number
  enabledEdits: Set<string> // Set of "actionIndex-editIndex" keys
  onToggleEdit: (actionIndex: number, editIndex: number) => void
}

function EditPreview({ edits, actionIndex, enabledEdits, onToggleEdit }: EditPreviewProps) {
  return (
    <div style={{ marginTop: '8px', paddingLeft: '8px' }}>
      {edits.slice(0, 5).map((edit, idx) => {
        const editKey = `${actionIndex}-${idx}`
        const isEnabled = enabledEdits.has(editKey)

        return (
          <div key={idx} style={{
            marginBottom: '12px',
            padding: '8px',
            background: 'rgba(0, 0, 0, 0.15)',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            opacity: isEnabled ? 1 : 0.5,
            transition: 'opacity 0.15s ease'
          }}>
            {/* Change header with toggle */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '6px'
            }}>
              <span
                onClick={() => onToggleEdit(actionIndex, idx)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isEnabled ? '#22c55e' : 'var(--prompd-muted)',
                  cursor: 'pointer',
                  transition: 'color 0.15s ease'
                }}
                title={isEnabled ? 'Click to exclude this change' : 'Click to include this change'}
              >
                {isEnabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
              </span>
              <span style={{
                fontSize: '10px',
                color: 'var(--prompd-muted)',
                fontWeight: 500,
                textDecoration: isEnabled ? 'none' : 'line-through'
              }}>
                Change {idx + 1}
              </span>
            </div>
            {/* Search (what to find) */}
            <div style={{
              fontFamily: 'monospace',
              fontSize: '11px',
              marginBottom: '4px'
            }}>
              <div style={{ color: '#ef4444', fontWeight: 500, marginBottom: '2px' }}>- Remove:</div>
              <pre style={{
                margin: 0,
                padding: '6px',
                background: 'rgba(239, 68, 68, 0.1)',
                borderRadius: '4px',
                overflow: 'auto',
                maxHeight: '100px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                color: '#fca5a5',
                fontSize: '10px',
                lineHeight: '1.4'
              }}>
                {formatDiffText(edit.search).join('\n')}
              </pre>
            </div>
            {/* Replace (what to add) */}
            <div style={{
              fontFamily: 'monospace',
              fontSize: '11px'
            }}>
              <div style={{ color: '#22c55e', fontWeight: 500, marginBottom: '2px' }}>+ Add:</div>
              <pre style={{
                margin: 0,
                padding: '6px',
                background: 'rgba(34, 197, 94, 0.1)',
                borderRadius: '4px',
                overflow: 'auto',
                maxHeight: '150px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                color: '#86efac',
                fontSize: '10px',
                lineHeight: '1.4'
              }}>
                {formatDiffText(edit.replace, 12).join('\n')}
              </pre>
            </div>
          </div>
        )
      })}
      {edits.length > 5 && (
        <div style={{ fontSize: '11px', color: 'var(--prompd-muted)', fontStyle: 'italic', padding: '4px 0' }}>
          ...and {edits.length - 5} more changes
        </div>
      )}
    </div>
  )
}

export function PlanApprovalDialog({ toolCalls, agentMessage, onApprove, onReject, workspacePath, theme = 'dark' }: PlanApprovalDialogProps) {
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectInput, setShowRejectInput] = useState(false)
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set())
  // Track which actions are enabled (all enabled by default)
  const [enabledActions, setEnabledActions] = useState<Set<number>>(() => new Set(toolCalls.map((_, i) => i)))
  // Track which individual edits within edit_file actions are enabled (key: "actionIndex-editIndex")
  const [enabledEdits, setEnabledEdits] = useState<Set<string>>(() => {
    const edits = new Set<string>()
    toolCalls.forEach((tc, actionIndex) => {
      if (tc.tool === 'edit_file' && Array.isArray(tc.params.edits)) {
        (tc.params.edits as EditOperation[]).forEach((_, editIndex) => {
          edits.add(`${actionIndex}-${editIndex}`)
        })
      }
    })
    return edits
  })

  // Track file content for diff view (keyed by action index)
  const [fileContents, setFileContents] = useState<Map<number, FileContentState>>(new Map())

  // Get tab content helper
  const getTabContent = useCallback((filePath: string): string | null => {
    const tabs = useEditorStore.getState().tabs
    const normalizedPath = filePath.replace(/\\/g, '/')

    for (const tab of tabs) {
      if (!tab.filePath) continue
      const tabPath = tab.filePath.replace(/\\/g, '/')

      // Check various path matching conditions
      if (
        tabPath === normalizedPath ||
        tabPath.endsWith('/' + normalizedPath) ||
        normalizedPath.endsWith('/' + tabPath)
      ) {
        // Return savedText (original disk content) if available, otherwise current text
        return tab.savedText ?? tab.text ?? null
      }
    }
    return null
  }, [])

  // Load file content for a tool action
  const loadFileContent = useCallback(async (index: number, tc: { tool: string; params: Record<string, unknown> }) => {
    const path = tc.params.path as string
    if (!path) return

    // Set loading state
    setFileContents(prev => new Map(prev).set(index, {
      originalContent: null,
      modifiedContent: null,
      isLoading: true,
      error: null
    }))

    try {
      // Get original file content
      const result = await getFileContent(path, {
        getTabContent,
        electronAPI: (window as any).electronAPI,
        workspacePath: workspacePath || undefined
      })

      if (tc.tool === 'edit_file') {
        // For edit_file, apply edits to compute modified content
        const edits = tc.params.edits as EditOperation[]
        if (!result.success) {
          // File not accessible - can still show edit preview
          setFileContents(prev => new Map(prev).set(index, {
            originalContent: null,
            modifiedContent: null,
            isLoading: false,
            error: result.error || 'Could not read file'
          }))
          return
        }

        const applyResult = applyEdits(result.content, edits)
        setFileContents(prev => new Map(prev).set(index, {
          originalContent: result.content,
          modifiedContent: applyResult.modifiedContent,
          isLoading: false,
          error: applyResult.success ? null : applyResult.error || null
        }))
      } else if (tc.tool === 'write_file') {
        // For write_file, original is current content (or empty for new file)
        const newContent = tc.params.content as string
        setFileContents(prev => new Map(prev).set(index, {
          originalContent: result.success ? result.content : '',
          modifiedContent: newContent,
          isLoading: false,
          error: null
        }))
      }
    } catch (err) {
      setFileContents(prev => new Map(prev).set(index, {
        originalContent: null,
        modifiedContent: null,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load file'
      }))
    }
  }, [getTabContent, workspacePath])

  const toggleExpand = useCallback(async (index: number) => {
    const tc = toolCalls[index]
    const newExpanded = new Set(expandedTools)

    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)

      // Load file content if this is an edit_file or write_file and not already loaded
      if ((tc.tool === 'edit_file' || tc.tool === 'write_file') && !fileContents.has(index)) {
        loadFileContent(index, tc)
      }
    }
    setExpandedTools(newExpanded)
  }, [expandedTools, toolCalls, fileContents, loadFileContent])

  const toggleEnabled = (index: number, e: React.MouseEvent) => {
    e.stopPropagation() // Don't expand/collapse when clicking toggle
    const newEnabled = new Set(enabledActions)
    if (newEnabled.has(index)) {
      newEnabled.delete(index)
    } else {
      newEnabled.add(index)
    }
    setEnabledActions(newEnabled)
  }

  const toggleEdit = (actionIndex: number, editIndex: number) => {
    const editKey = `${actionIndex}-${editIndex}`
    const newEnabled = new Set(enabledEdits)
    if (newEnabled.has(editKey)) {
      newEnabled.delete(editKey)
    } else {
      newEnabled.add(editKey)
    }
    setEnabledEdits(newEnabled)
  }

  const handleApprove = () => {
    // Only pass enabled tool calls, filtering out disabled edits for edit_file actions
    const enabledToolCalls = toolCalls
      .filter((_, index) => enabledActions.has(index))
      .map((tc) => {
        // Find the original index in the full toolCalls array (needed for edit lookup)
        const actualIndex = toolCalls.findIndex(t => t === tc)

        // For edit_file actions, filter out disabled edits
        if (tc.tool === 'edit_file' && Array.isArray(tc.params.edits)) {
          const originalEdits = tc.params.edits as EditOperation[]
          const filteredEdits = originalEdits.filter((_, editIndex) =>
            enabledEdits.has(`${actualIndex}-${editIndex}`)
          )
          // If all edits are disabled, skip this action entirely
          if (filteredEdits.length === 0) {
            return null
          }
          // Return modified tool call with only enabled edits
          return {
            ...tc,
            params: {
              ...tc.params,
              edits: filteredEdits
            }
          }
        }
        return tc
      })
      .filter((tc): tc is { tool: string; params: Record<string, unknown> } => tc !== null)

    onApprove(enabledToolCalls)
  }

  // Count enabled tools by category
  const enabledToolCalls = toolCalls.filter((_, i) => enabledActions.has(i))
  const readCount = enabledToolCalls.filter(tc => getToolCategory(tc.tool) === 'read').length
  const writeCount = enabledToolCalls.filter(tc => getToolCategory(tc.tool) === 'write').length
  const execCount = enabledToolCalls.filter(tc => getToolCategory(tc.tool) === 'execute').length
  const enabledCount = enabledActions.size

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 2000,
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
        maxWidth: '900px',
        width: '95%',
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
        animation: 'fadeIn 0.2s ease-out'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexShrink: 0
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#6366f1'
          }}>
            <ClipboardList size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{
              margin: 0,
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--prompd-text)'
            }}>
              Execution Plan
            </h3>
            <p style={{
              margin: '2px 0 0',
              fontSize: '13px',
              color: 'var(--prompd-muted)'
            }}>
              {enabledCount} of {toolCalls.length} action{toolCalls.length !== 1 ? 's' : ''} to execute
            </p>
          </div>
          {/* Action summary badges */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {readCount > 0 && (
              <span style={{
                padding: '2px 8px',
                borderRadius: '10px',
                background: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                color: '#22c55e',
                fontSize: '11px',
                fontWeight: 500
              }}>
                {readCount} read
              </span>
            )}
            {writeCount > 0 && (
              <span style={{
                padding: '2px 8px',
                borderRadius: '10px',
                background: 'rgba(234, 179, 8, 0.1)',
                border: '1px solid rgba(234, 179, 8, 0.3)',
                color: '#eab308',
                fontSize: '11px',
                fontWeight: 500
              }}>
                {writeCount} write
              </span>
            )}
            {execCount > 0 && (
              <span style={{
                padding: '2px 8px',
                borderRadius: '10px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
                fontSize: '11px',
                fontWeight: 500
              }}>
                {execCount} exec
              </span>
            )}
          </div>
        </div>

        {/* Body - scrollable */}
        <div style={{
          padding: '16px 20px',
          overflowY: 'auto',
          flex: 1
        }}>
          {/* Agent's explanation */}
          {agentMessage && (
            <div style={{
              background: 'var(--prompd-panel)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '16px',
              fontSize: '13px',
              color: 'var(--prompd-text)',
              lineHeight: '1.5',
              whiteSpace: 'pre-wrap'
            }}>
              {agentMessage}
            </div>
          )}

          {/* Tool list */}
          <div style={{
            fontSize: '12px',
            fontWeight: 500,
            color: 'var(--prompd-muted)',
            marginBottom: '8px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            Actions
          </div>

          <div style={{
            background: 'var(--prompd-panel)',
            borderRadius: '8px',
            overflow: 'hidden'
          }}>
            {toolCalls.map((tc, index) => {
              const isExpanded = expandedTools.has(index)
              const isEnabled = enabledActions.has(index)
              const category = getToolCategory(tc.tool)
              const categoryColors = {
                read: { bg: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' },
                write: { bg: 'rgba(234, 179, 8, 0.1)', color: '#eab308' },
                execute: { bg: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }
              }
              const colors = categoryColors[category]

              return (
                <div
                  key={index}
                  style={{
                    borderBottom: index < toolCalls.length - 1 ? '1px solid var(--border)' : 'none',
                    opacity: isEnabled ? 1 : 0.5,
                    transition: 'opacity 0.15s ease'
                  }}
                >
                  <button
                    onClick={() => toggleExpand(index)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: 'var(--prompd-text)'
                    }}
                  >
                    {/* Toggle button */}
                    <span
                      onClick={(e) => toggleEnabled(index, e)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isEnabled ? '#22c55e' : 'var(--prompd-muted)',
                        cursor: 'pointer',
                        transition: 'color 0.15s ease'
                      }}
                      title={isEnabled ? 'Click to exclude from execution' : 'Click to include in execution'}
                    >
                      {isEnabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                    </span>
                    <span style={{ color: 'var(--prompd-muted)' }}>
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                    <span style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '24px',
                      height: '24px',
                      borderRadius: '6px',
                      background: colors.bg,
                      color: colors.color
                    }}>
                      {getToolIcon(tc.tool)}
                    </span>
                    <span style={{
                      flex: 1,
                      fontSize: '13px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textDecoration: isEnabled ? 'none' : 'line-through'
                    }}>
                      {tc.tool === 'edit_file' && Array.isArray(tc.params.edits) ? (() => {
                        const edits = tc.params.edits as EditOperation[]
                        const totalCount = edits.length
                        const enabledCount = edits.filter((_, editIdx) =>
                          enabledEdits.has(`${index}-${editIdx}`)
                        ).length
                        return `Edit file: ${tc.params.path || 'unknown'} (${enabledCount}/${totalCount} change${totalCount !== 1 ? 's' : ''})`
                      })() : getToolDescription(tc.tool, tc.params)}
                    </span>
                    <span style={{
                      fontSize: '11px',
                      color: 'var(--prompd-muted)',
                      fontFamily: 'monospace'
                    }}>
                      #{index + 1}
                    </span>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div style={{
                      padding: '0 12px 12px 12px',
                      fontSize: '12px'
                    }}>
                      {(tc.tool === 'edit_file' || tc.tool === 'write_file') ? (() => {
                        const fileState = fileContents.get(index)

                        // Show Monaco diff if we have content
                        if (fileState && fileState.originalContent !== null && fileState.modifiedContent !== null) {
                          const editsForDiff = tc.tool === 'edit_file' && Array.isArray(tc.params.edits)
                            ? tc.params.edits as EditOperation[]
                            : undefined
                          return (
                            <ApprovalDiffView
                              originalContent={fileState.originalContent}
                              modifiedContent={fileState.modifiedContent}
                              filePath={tc.params.path as string}
                              theme={theme}
                              isLoading={fileState.isLoading}
                              loadError={fileState.error}
                              height={250}
                              edits={editsForDiff}
                            />
                          )
                        }

                        // Show loading state
                        if (fileState?.isLoading) {
                          return (
                            <ApprovalDiffView
                              originalContent=""
                              modifiedContent=""
                              filePath={tc.params.path as string}
                              theme={theme}
                              isLoading={true}
                            />
                          )
                        }

                        // Show error with fallback to EditPreview
                        if (fileState?.error) {
                          return (
                            <div>
                              <div style={{
                                padding: '8px 12px',
                                background: 'rgba(239, 68, 68, 0.1)',
                                borderRadius: '6px',
                                marginBottom: '12px',
                                fontSize: '12px',
                                color: '#fca5a5'
                              }}>
                                Could not load file for diff: {fileState.error}
                              </div>
                              {tc.tool === 'edit_file' && Array.isArray(tc.params.edits) && (
                                <EditPreview
                                  edits={tc.params.edits as EditOperation[]}
                                  actionIndex={index}
                                  enabledEdits={enabledEdits}
                                  onToggleEdit={toggleEdit}
                                />
                              )}
                              {tc.tool === 'write_file' && (
                                <pre style={{
                                  margin: 0,
                                  padding: '8px',
                                  background: 'rgba(0,0,0,0.2)',
                                  borderRadius: '4px',
                                  overflow: 'auto',
                                  maxHeight: '200px',
                                  fontFamily: 'monospace',
                                  fontSize: '11px',
                                  color: 'var(--prompd-muted)'
                                }}>
                                  {tc.params.content as string}
                                </pre>
                              )}
                            </div>
                          )
                        }

                        // Fallback to EditPreview while loading starts
                        if (tc.tool === 'edit_file' && Array.isArray(tc.params.edits)) {
                          return (
                            <EditPreview
                              edits={tc.params.edits as EditOperation[]}
                              actionIndex={index}
                              enabledEdits={enabledEdits}
                              onToggleEdit={toggleEdit}
                            />
                          )
                        }

                        // write_file without content loaded yet
                        return (
                          <pre style={{
                            margin: 0,
                            padding: '8px',
                            background: 'rgba(0,0,0,0.2)',
                            borderRadius: '4px',
                            overflow: 'auto',
                            maxHeight: '200px',
                            fontFamily: 'monospace',
                            fontSize: '11px',
                            color: 'var(--prompd-muted)'
                          }}>
                            {tc.params.content as string}
                          </pre>
                        )
                      })() : (
                        <pre style={{
                          margin: 0,
                          padding: '8px',
                          background: 'rgba(0,0,0,0.2)',
                          borderRadius: '4px',
                          overflow: 'auto',
                          maxHeight: '150px',
                          fontFamily: 'monospace',
                          fontSize: '11px',
                          color: 'var(--prompd-muted)'
                        }}>
                          {JSON.stringify(tc.params, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Reject reason input */}
          {showRejectInput && (
            <div style={{ marginTop: '16px' }}>
              <label style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--prompd-muted)',
                marginBottom: '8px'
              }}>
                Feedback for the agent (optional)
              </label>
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Tell the agent what you'd like instead..."
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
          gap: '10px',
          flexShrink: 0
        }}>
          {showRejectInput ? (
            <>
              {/* Back button - returns to plan view */}
              <button
                onClick={() => setShowRejectInput(false)}
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
                ← Back
              </button>
              {/* Cancel Plan button - rejects without feedback */}
              <button
                onClick={() => onReject(undefined)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: '#ef4444',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Cancel Plan
              </button>
              {/* Send Feedback button */}
              <button
                onClick={() => onReject(rejectReason || undefined)}
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
                Send Feedback
              </button>
            </>
          ) : (
            <>
              {/* Revise Plan button */}
              <button
                onClick={() => setShowRejectInput(true)}
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
                Revise Plan
              </button>
              {/* Execute button */}
              <button
                onClick={handleApprove}
                disabled={enabledCount === 0}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: enabledCount === 0 ? 'var(--prompd-muted)' : 'var(--prompd-accent, #6366f1)',
                  color: 'white',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: enabledCount === 0 ? 'not-allowed' : 'pointer',
                  opacity: enabledCount === 0 ? 0.6 : 1
                }}
              >
                <Check size={14} />
                Execute {enabledCount > 0 ? `${enabledCount} Action${enabledCount !== 1 ? 's' : ''}` : 'Plan'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

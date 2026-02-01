/**
 * WorkflowExecutionPanel - Displays workflow execution progress, results, and trace
 * Matches BuildOutputPanel styling with pin/minimize functionality
 */

import { useState, useEffect } from 'react'
import {
  CheckCircle,
  AlertCircle,
  Loader,
  Clock,
  Play,
  Square,
  Radio,
  ChevronRight,
  Download,
  List,
  Zap,
  Timer,
  FileText,
  Sparkles,
  Copy,
  History,
  Trash2
} from 'lucide-react'
import { useWorkflowStore } from '../../../stores/workflowStore'
import { useEditorStore } from '../../../stores/editorStore'
import type { WorkflowResult } from '../../services/workflowTypes'
import type { CheckpointEvent, ExecutionTrace, TraceEntry } from '../../services/workflowExecutor'
import { getTraceSummary } from '../../services/workflowExecutor'

/** Captured prompt info for debugging */
export interface PromptSentInfo {
  nodeId: string
  source: string
  resolvedPath?: string
  compiledPrompt: string
  params: Record<string, unknown>
  provider?: string
  model?: string
  timestamp: number
}

interface WorkflowExecutionPanelProps {
  onClose?: () => void
  result?: (WorkflowResult & { trace?: ExecutionTrace }) | null
  checkpoints?: CheckpointEvent[]
  promptsSent?: PromptSentInfo[]
  onResume?: () => void
  onStop?: () => void
  isPaused?: boolean
  pendingCheckpoint?: CheckpointEvent | null
  embedded?: boolean // When true, panel is embedded in tabs (parent handles all controls)
}

export function WorkflowExecutionPanel({
  onClose,
  result,
  checkpoints = [],
  promptsSent = [],
  onResume,
  onStop,
  isPaused,
  pendingCheckpoint,
  embedded = false
}: WorkflowExecutionPanelProps) {
  const [activeTab, setActiveTab] = useState<'progress' | 'output' | 'prompts' | 'checkpoints' | 'trace' | 'history'>('progress')
  const [traceFilter, setTraceFilter] = useState<TraceEntry['type'] | 'all'>('all')
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)
  const [expandedTraceIndices, setExpandedTraceIndices] = useState<Set<number>>(new Set())

  // Get trace from result
  const trace = result?.trace

  // Workflow store state
  const executionState = useWorkflowStore(state => state.executionState)
  const isExecuting = useWorkflowStore(state => state.isExecuting)
  const workflowFile = useWorkflowStore(state => state.workflowFile)
  const executionHistory = useWorkflowStore(state => state.executionHistory)
  const loadExecutionFromHistory = useWorkflowStore(state => state.loadExecutionFromHistory)
  const clearExecutionHistory = useWorkflowStore(state => state.clearExecutionHistory)

  // Editor store for opening trace in editor
  const addTab = useEditorStore(state => state.addTab)

  // Auto-switch to output tab when complete (must be in useEffect, not during render)
  useEffect(() => {
    if (result && !isExecuting && activeTab === 'progress') {
      setActiveTab('output')
    }
  }, [result, isExecuting, activeTab])

  // Get node label from workflow file
  const getNodeLabel = (nodeId: string) => {
    const node = workflowFile?.nodes.find(n => n.id === nodeId)
    return node?.data.label || nodeId
  }

  // Format duration
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Loader className="animate-spin" size={14} style={{ color: 'var(--accent)' }} />
      case 'completed':
        return <CheckCircle size={14} style={{ color: 'var(--success)' }} />
      case 'failed':
        return <AlertCircle size={14} style={{ color: 'var(--error)' }} />
      case 'pending':
        return <Clock size={14} style={{ color: 'var(--muted)' }} />
      default:
        return null
    }
  }

  // Handle copy
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopyFeedback('Copied!')
    setTimeout(() => setCopyFeedback(null), 2000)
  }

  // Calculate stats
  const stats = trace ? getTraceSummary(trace) : null
  const nodeCount = executionState?.nodeStates ? Object.keys(executionState.nodeStates).length : 0
  const completedNodes = executionState?.nodeStates
    ? Object.values(executionState.nodeStates).filter(s => s.status === 'completed').length
    : 0

  // Filter trace entries
  const filteredTrace = trace?.entries.filter(entry =>
    traceFilter === 'all' || entry.type === traceFilter
  ) || []

  return (
    <div className="workflow-execution-panel" style={{ height: embedded ? '100%' : 'auto' }}>
      {/* Note: This component is now always embedded in BottomPanelTabs.
          Header/controls removed - parent handles all UI chrome. */}

      {/* Tabs for switching content */}
      <div className="workflow-panel-tabs" style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
        <button
          className={`workflow-panel-tab ${activeTab === 'progress' ? 'active' : ''}`}
          onClick={() => setActiveTab('progress')}
        >
          <List size={12} />
          Progress
        </button>
        <button
          className={`workflow-panel-tab ${activeTab === 'output' ? 'active' : ''}`}
          onClick={() => setActiveTab('output')}
        >
          <FileText size={12} />
          Output
        </button>
        {promptsSent.length > 0 && (
          <button
            className={`workflow-panel-tab ${activeTab === 'prompts' ? 'active' : ''}`}
            onClick={() => setActiveTab('prompts')}
          >
            <Sparkles size={12} />
            Prompts ({promptsSent.length})
          </button>
        )}
        {checkpoints.length > 0 && (
          <button
            className={`workflow-panel-tab ${activeTab === 'checkpoints' ? 'active' : ''}`}
            onClick={() => setActiveTab('checkpoints')}
          >
            <Radio size={12} />
            Checkpoints ({checkpoints.length})
          </button>
        )}
        {trace && (
          <button
            className={`workflow-panel-tab ${activeTab === 'trace' ? 'active' : ''}`}
            onClick={() => setActiveTab('trace')}
          >
            <Clock size={12} />
            Trace ({trace.entries.length})
          </button>
        )}
        <button
          className={`workflow-panel-tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <History size={12} />
          History ({executionHistory.length})
        </button>
      </div>

      {/* Content */}
      <div className="workflow-panel-content" style={{ height: 'calc(100% - 40px)', overflow: 'auto' }}>
          {/* Progress Tab */}
          {activeTab === 'progress' && (
            <div>
              {executionState?.nodeStates && Object.keys(executionState.nodeStates).length > 0 ? (
                Object.entries(executionState.nodeStates).map(([nodeId, nodeState]) => (
                  <div
                    key={nodeId}
                    className={`workflow-node-card ${nodeState.status}`}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {getStatusIcon(nodeState.status)}
                      <span style={{ fontWeight: 500, fontSize: '12px' }}>{getNodeLabel(nodeId)}</span>
                      <span style={{ color: 'var(--muted)', fontSize: '11px' }}>
                        {nodeState.status}
                      </span>
                      {nodeState.startTime && nodeState.endTime && (
                        <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: '11px' }}>
                          {formatDuration(nodeState.endTime - nodeState.startTime)}
                        </span>
                      )}
                    </div>
                    {nodeState.error && (
                      <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--error)' }}>
                        {nodeState.error}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="workflow-empty-state">
                  <List size={24} />
                  <div style={{ fontSize: '12px' }}>No execution in progress</div>
                  <div style={{ fontSize: '11px', marginTop: '4px' }}>
                    Run the workflow to see progress
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Output Tab */}
          {activeTab === 'output' && (
            <div>
              {result ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      Final output
                    </span>
                    <button
                      className="workflow-panel-action"
                      onClick={() => handleCopy(
                        typeof result.output === 'string'
                          ? result.output
                          : JSON.stringify(result.output, null, 2)
                      )}
                      title="Copy output"
                      style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <Copy size={12} />
                      {copyFeedback && (
                        <span style={{ fontSize: '10px', color: 'var(--success)' }}>{copyFeedback}</span>
                      )}
                    </button>
                  </div>
                  <pre style={{
                    margin: 0,
                    padding: '12px',
                    background: 'var(--panel-2)',
                    borderRadius: '6px',
                    fontSize: '11px',
                    lineHeight: 1.5,
                    overflow: 'auto',
                    maxHeight: '300px',
                    color: 'var(--text-secondary)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word'
                  }}>
                    {typeof result.output === 'string'
                      ? result.output
                      : JSON.stringify(result.output, null, 2)}
                  </pre>
                  {result.errors && result.errors.length > 0 && (
                    <div style={{
                      marginTop: '12px',
                      padding: '10px 12px',
                      background: 'color-mix(in srgb, var(--error) 10%, transparent)',
                      borderRadius: '6px',
                      borderLeft: '3px solid var(--error)',
                      fontSize: '12px',
                      color: 'var(--error)'
                    }}>
                      {result.errors.map((err, i) => (
                        <div key={i}>{err.message}</div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="workflow-empty-state">
                  <FileText size={24} />
                  <div style={{ fontSize: '12px' }}>No output yet</div>
                  <div style={{ fontSize: '11px', marginTop: '4px' }}>
                    Output will appear here when the workflow completes
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Prompts Tab */}
          {activeTab === 'prompts' && (
            <div>
              {promptsSent.length > 0 ? (
                promptsSent.map((prompt, index) => (
                  <div key={index} className="workflow-prompt-card">
                    <div className="workflow-prompt-card-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Sparkles size={14} style={{ color: 'var(--accent)' }} />
                        <span style={{ fontWeight: 500, fontSize: '12px' }}>{getNodeLabel(prompt.nodeId)}</span>
                        {prompt.provider && prompt.model && (
                          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                            {prompt.provider}/{prompt.model}
                          </span>
                        )}
                      </div>
                      <button
                        className="workflow-panel-action"
                        onClick={() => handleCopy(prompt.compiledPrompt)}
                        title="Copy prompt"
                      >
                        <Copy size={12} />
                      </button>
                    </div>
                    <div className="workflow-prompt-card-content">
                      <div style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '6px' }}>
                        Source: {prompt.resolvedPath || prompt.source}
                      </div>
                      <pre>{prompt.compiledPrompt}</pre>
                      {Object.keys(prompt.params).length > 0 && (
                        <details style={{ marginTop: '8px' }}>
                          <summary style={{ fontSize: '11px', color: 'var(--muted)', cursor: 'pointer' }}>
                            Parameters ({Object.keys(prompt.params).length})
                          </summary>
                          <pre style={{ marginTop: '6px', fontSize: '10px' }}>
                            {JSON.stringify(prompt.params, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="workflow-empty-state">
                  <Sparkles size={24} />
                  <div style={{ fontSize: '12px' }}>No prompts sent yet</div>
                </div>
              )}
            </div>
          )}

          {/* Checkpoints Tab */}
          {activeTab === 'checkpoints' && (
            <div>
              {checkpoints.length > 0 ? (
                checkpoints.map((checkpoint, index) => (
                  <CheckpointCard key={index} checkpoint={checkpoint} />
                ))
              ) : (
                <div className="workflow-empty-state">
                  <Radio size={24} />
                  <div style={{ fontSize: '12px' }}>No checkpoints hit yet</div>
                </div>
              )}
            </div>
          )}

          {/* Trace Tab */}
          {activeTab === 'trace' && (
            <div>
              {trace ? (
                <>
                  {/* Trace header with download button */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', padding: '0 12px' }}>
                    <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: 'var(--muted)' }}>
                      {(() => {
                        const summary = getTraceSummary(trace)
                        return (
                          <>
                            <span>{summary.totalNodes} nodes</span>
                            <span>{summary.completedNodes} completed</span>
                            {summary.errorNodes > 0 && (
                              <span style={{ color: 'var(--error)' }}>{summary.errorNodes} errors</span>
                            )}
                            <span>{formatDuration(summary.totalDuration)}</span>
                          </>
                        )
                      })()}
                    </div>
                    <button
                      className="workflow-action-button"
                      onClick={() => {
                        try {
                          // Generate trace JSON
                          const traceJson = JSON.stringify(trace, null, 2)

                          // Generate filename with timestamp
                          const timestamp = new Date(trace.startTime).toISOString().replace(/[:.]/g, '-').slice(0, -5)
                          const filename = `trace-${timestamp}.json`

                          // Create new tab with trace JSON
                          addTab({
                            id: `trace-${Date.now()}`,
                            name: filename,
                            text: traceJson,
                            savedText: traceJson,
                            type: 'file',
                            viewMode: 'code',
                            readOnly: false,
                            dirty: false
                          })
                        } catch (err) {
                          console.error('[WorkflowExecutionPanel] Failed to open trace:', err)
                          alert('Failed to open trace: ' + (err instanceof Error ? err.message : String(err)))
                        }
                      }}
                      title="Open trace as JSON file in editor"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', fontSize: '11px' }}
                    >
                      <FileText size={12} />
                      Open Trace
                    </button>
                  </div>

                  {/* Filter chips */}
                  <div className="workflow-filter-chips">
                    <button
                      className={`workflow-filter-chip ${traceFilter === 'all' ? 'active' : ''}`}
                      onClick={() => setTraceFilter('all')}
                    >
                      All ({trace.entries.length})
                    </button>
                    {['node_start', 'node_complete', 'node_error', 'checkpoint', 'debug_step'].map(type => {
                      const count = trace.entries.filter(e => e.type === type).length
                      if (count === 0) return null
                      return (
                        <button
                          key={type}
                          className={`workflow-filter-chip ${traceFilter === type ? 'active' : ''}`}
                          onClick={() => setTraceFilter(type as TraceEntry['type'])}
                        >
                          {type.replace(/_/g, ' ')} ({count})
                        </button>
                      )
                    })}
                  </div>

                  {/* Trace entries */}
                  <div style={{ background: 'var(--panel-2)', borderRadius: '6px', overflow: 'hidden' }}>
                    {filteredTrace.map((entry, index) => {
                      const isExpanded = expandedTraceIndices.has(index)
                      const hasData = entry.data && Object.keys(entry.data).length > 0

                      return (
                        <div key={index} style={{ borderBottom: index < filteredTrace.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <div
                            className="workflow-trace-row"
                            onClick={() => {
                              if (hasData) {
                                setExpandedTraceIndices(prev => {
                                  const next = new Set(prev)
                                  if (next.has(index)) {
                                    next.delete(index)
                                  } else {
                                    next.add(index)
                                  }
                                  return next
                                })
                              }
                            }}
                            style={{
                              cursor: hasData ? 'pointer' : 'default',
                              transition: 'background 0.15s ease',
                            }}
                            onMouseEnter={(e) => {
                              if (hasData) {
                                e.currentTarget.style.background = 'var(--hover)'
                              }
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'transparent'
                            }}
                          >
                            {hasData ? (
                              <ChevronRight
                                size={14}
                                style={{
                                  color: 'var(--muted)',
                                  minWidth: '14px',
                                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                  transition: 'transform 0.15s ease',
                                }}
                              />
                            ) : (
                              <span style={{ minWidth: '14px' }} />
                            )}
                            <span style={{ color: 'var(--muted)', minWidth: '50px', fontSize: '10px', marginLeft: hasData ? '8px' : '0' }}>
                              {formatDuration(entry.timestamp - trace.startTime)}
                            </span>
                            <span className="workflow-trace-type" style={{ color: getTraceTypeColor(entry.type) }}>
                              {entry.type.replace(/_/g, ' ')}
                            </span>
                            <span style={{ flex: 1, color: 'var(--text-secondary)' }}>
                              {entry.nodeId && <strong>{getNodeLabel(entry.nodeId)}</strong>}
                              {entry.message && ` - ${entry.message}`}
                            </span>
                            {entry.duration !== undefined && (
                              <span style={{ color: 'var(--muted)' }}>
                                {formatDuration(entry.duration)}
                              </span>
                            )}
                          </div>

                          {/* Expanded data view */}
                          {isExpanded && hasData ? (
                            <div style={{
                              padding: '12px 16px 12px 38px',
                              background: 'var(--panel)',
                              borderTop: '1px solid var(--border)',
                            }}>
                              <div style={{
                                fontSize: '10px',
                                fontWeight: 500,
                                color: 'var(--muted)',
                                marginBottom: '8px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                              }}>
                                Trace Data:
                              </div>
                              <pre style={{
                                margin: 0,
                                padding: '10px',
                                background: 'var(--input-bg)',
                                borderRadius: '4px',
                                fontSize: '11px',
                                color: 'var(--text)',
                                overflowX: 'auto',
                                maxHeight: '300px',
                                overflowY: 'auto',
                                fontFamily: 'monospace',
                                lineHeight: '1.5',
                              }}>
                                {JSON.stringify(entry.data, null, 2)}
                              </pre>
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </>
              ) : (
                <div className="workflow-empty-state">
                  <Clock size={24} />
                  <div style={{ fontSize: '12px' }}>No trace data</div>
                </div>
              )}
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div style={{ padding: '12px' }}>
              {executionHistory.length > 0 ? (
                <>
                  {/* Header with clear button */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      Last {executionHistory.length} execution{executionHistory.length !== 1 ? 's' : ''}
                    </div>
                    <button
                      className="workflow-action-button"
                      onClick={() => {
                        if (confirm('Clear all execution history?')) {
                          clearExecutionHistory()
                        }
                      }}
                      title="Clear history"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', fontSize: '11px' }}
                    >
                      <Trash2 size={12} />
                      Clear History
                    </button>
                  </div>

                  {/* History list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {executionHistory.map((entry) => (
                      <div
                        key={entry.id}
                        className="workflow-history-entry"
                        onClick={() => loadExecutionFromHistory(entry.id)}
                        style={{
                          background: result?.startTime === entry.result.startTime ? 'var(--hover)' : 'var(--panel-2)',
                          border: result?.startTime === entry.result.startTime ? '1px solid var(--primary)' : '1px solid var(--border)',
                          borderRadius: '6px',
                          padding: '12px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          if (result?.startTime !== entry.result.startTime) {
                            e.currentTarget.style.background = 'var(--hover)'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (result?.startTime !== entry.result.startTime) {
                            e.currentTarget.style.background = 'var(--panel-2)'
                          }
                        }}
                      >
                        {/* Header row with workflow name and status */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {entry.status === 'success' ? (
                              <CheckCircle size={14} style={{ color: 'var(--success)' }} />
                            ) : entry.status === 'error' ? (
                              <AlertCircle size={14} style={{ color: 'var(--error)' }} />
                            ) : (
                              <Square size={14} style={{ color: 'var(--warning)' }} />
                            )}
                            <span style={{ fontWeight: 500, fontSize: '12px' }}>
                              {entry.workflowName}
                            </span>
                          </div>
                          <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
                            {new Date(entry.timestamp).toLocaleTimeString()}
                          </span>
                        </div>

                        {/* Stats row */}
                        <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: 'var(--muted)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Timer size={10} />
                            {formatDuration(entry.duration)}
                          </div>
                          {entry.result.trace && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Zap size={10} />
                              {(() => {
                                const summary = getTraceSummary(entry.result.trace)
                                return `${summary.completedNodes}/${summary.totalNodes} nodes`
                              })()}
                            </div>
                          )}
                          {entry.promptsSent.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Sparkles size={10} />
                              {entry.promptsSent.length} prompt{entry.promptsSent.length !== 1 ? 's' : ''}
                            </div>
                          )}
                        </div>

                        {/* Error message if failed */}
                        {entry.status === 'error' && entry.result.errors && entry.result.errors.length > 0 && (
                          <div style={{
                            marginTop: '8px',
                            padding: '6px 8px',
                            background: 'var(--error-bg)',
                            border: '1px solid var(--error)',
                            borderRadius: '4px',
                            fontSize: '10px',
                            color: 'var(--error)',
                          }}>
                            {entry.result.errors[0].message}
                          </div>
                        )}

                        {/* Active indicator */}
                        {result?.startTime === entry.result.startTime && (
                          <div style={{
                            marginTop: '8px',
                            fontSize: '10px',
                            color: 'var(--primary)',
                            fontWeight: 500,
                          }}>
                            Currently viewing
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="workflow-empty-state">
                  <History size={24} />
                  <div style={{ fontSize: '12px' }}>No execution history</div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                    Execute a workflow to see history here
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
    </div>
  )
}

// Helper function for trace type colors
function getTraceTypeColor(type: string): string {
  switch (type) {
    case 'node_start': return 'var(--accent)'
    case 'node_complete': return 'var(--success)'
    case 'llm_call': return 'var(--node-purple)'
    case 'checkpoint': return 'var(--node-amber)'
    case 'node_error': return 'var(--error)'
    default: return 'var(--muted)'
  }
}

// Helper function for behavior colors
function getBehaviorColor(behaviors: CheckpointEvent['behaviors']): string {
  if (behaviors.requireApproval) return 'var(--node-teal)'
  if (behaviors.pauseInDebug) return 'var(--node-amber)'
  if (behaviors.sendWebhook) return 'var(--accent)'
  if (behaviors.logToConsole || behaviors.logToHistory) return 'var(--node-blue)'
  return 'var(--muted)'
}

// Get primary behavior label for display
function getPrimaryBehaviorLabel(behaviors: CheckpointEvent['behaviors']): string {
  if (behaviors.requireApproval) return 'Approval'
  if (behaviors.pauseInDebug) return 'Debug'
  if (behaviors.sendWebhook) return 'Webhook'
  if (behaviors.logToHistory) return 'Log'
  if (behaviors.logToConsole) return 'Console'
  return 'Passthrough'
}

// CheckpointCard sub-component
interface CheckpointCardProps {
  checkpoint: CheckpointEvent
}

function CheckpointCard({ checkpoint }: CheckpointCardProps) {
  const behaviorColor = getBehaviorColor(checkpoint.behaviors)
  const behaviorLabel = getPrimaryBehaviorLabel(checkpoint.behaviors)

  return (
    <div className="workflow-checkpoint-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <Radio size={14} style={{ color: behaviorColor }} />
        <span style={{ fontWeight: 500, fontSize: '12px' }}>
          {checkpoint.checkpointName || `Checkpoint ${checkpoint.nodeId}`}
        </span>
        <span
          style={{
            fontSize: '10px',
            padding: '2px 6px',
            borderRadius: '4px',
            background: `color-mix(in srgb, ${behaviorColor} 15%, transparent)`,
            color: behaviorColor
          }}
        >
          {behaviorLabel}
        </span>
      </div>
      {checkpoint.message && (
        <div style={{
          fontSize: '12px',
          color: 'var(--text-secondary)',
          marginBottom: '8px',
          padding: '8px 12px',
          background: 'var(--panel)',
          borderRadius: '6px',
          borderLeft: `3px solid ${behaviorColor}`
        }}>
          "{checkpoint.message}"
        </div>
      )}
      {checkpoint.nextNodeInfo && (
        <div style={{ fontSize: '11px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ChevronRight size={14} />
          Next: <span style={{ color: 'var(--text)', fontWeight: 500 }}>{checkpoint.nextNodeInfo.label}</span>
          <span style={{ color: 'var(--muted)' }}>({checkpoint.nextNodeInfo.type})</span>
        </div>
      )}
      {checkpoint.previousOutput !== undefined && (
        <details style={{ marginTop: '12px' }}>
          <summary style={{ fontSize: '11px', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ChevronRight size={12} />
            Previous Output
          </summary>
          <pre style={{
            margin: '8px 0 0 0',
            padding: '12px',
            background: 'var(--panel)',
            borderRadius: '8px',
            fontSize: '10px',
            overflow: 'auto',
            maxHeight: '120px',
            color: 'var(--text-secondary)'
          }}>
            {typeof checkpoint.previousOutput === 'string'
              ? checkpoint.previousOutput
              : JSON.stringify(checkpoint.previousOutput, null, 2)}
          </pre>
        </details>
      )}
    </div>
  )
}

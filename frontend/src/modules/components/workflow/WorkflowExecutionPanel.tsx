/**
 * WorkflowExecutionPanel - Displays workflow execution progress, results, and trace
 * Matches BuildOutputPanel styling with pin/minimize functionality
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  ChevronDown,
  ChevronUp,
  X,
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
  Pin,
  PinOff
} from 'lucide-react'
import { useWorkflowStore } from '../../../stores/workflowStore'
import { useUIStore, selectWorkflowPanelPinned } from '../../../stores/uiStore'
import type { WorkflowResult } from '../../services/workflowTypes'
import type { CheckpointEvent, ExecutionTrace, TraceEntry } from '../../services/workflowExecutor'
import { downloadTrace, getTraceSummary } from '../../services/workflowExecutor'

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
}

const MIN_HEIGHT = 100
const MAX_HEIGHT = 500
const DEFAULT_HEIGHT = 200

export function WorkflowExecutionPanel({
  onClose,
  result,
  checkpoints = [],
  promptsSent = [],
  onResume,
  onStop,
  isPaused,
  pendingCheckpoint
}: WorkflowExecutionPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [panelHeight, setPanelHeight] = useState(DEFAULT_HEIGHT)
  const [isResizing, setIsResizing] = useState(false)
  const [activeTab, setActiveTab] = useState<'progress' | 'output' | 'prompts' | 'checkpoints' | 'trace'>('progress')
  const [traceFilter, setTraceFilter] = useState<TraceEntry['type'] | 'all'>('all')
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)
  const [expandedTraceIndices, setExpandedTraceIndices] = useState<Set<number>>(new Set())
  const resizeStartY = useRef(0)
  const resizeStartHeight = useRef(0)

  // UI Store state for pinning
  const isPinned = useUIStore(selectWorkflowPanelPinned)
  const setWorkflowPanelPinned = useUIStore(state => state.setWorkflowPanelPinned)

  // Get trace from result
  const trace = result?.trace

  // Workflow store state
  const executionState = useWorkflowStore(state => state.executionState)
  const isExecuting = useWorkflowStore(state => state.isExecuting)
  const workflowFile = useWorkflowStore(state => state.workflowFile)

  // Handle resize drag
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    resizeStartY.current = e.clientY
    resizeStartHeight.current = panelHeight
  }, [panelHeight])

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = resizeStartY.current - e.clientY
      const newHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, resizeStartHeight.current + deltaY))
      setPanelHeight(newHeight)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

  // Auto-collapse when canvas gains focus (if not pinned)
  useEffect(() => {
    const handleCanvasFocus = () => {
      if (!isPinned && isExpanded) {
        setIsExpanded(false)
      }
    }
    window.addEventListener('workflow-canvas-focused', handleCanvasFocus)
    return () => window.removeEventListener('workflow-canvas-focused', handleCanvasFocus)
  }, [isPinned, isExpanded])

  // Listen for expand event
  useEffect(() => {
    const handleExpand = () => {
      setIsExpanded(true)
    }
    window.addEventListener('expand-workflow-panel', handleExpand)
    return () => window.removeEventListener('expand-workflow-panel', handleExpand)
  }, [])

  // Auto-switch to output tab when complete
  useEffect(() => {
    if (result && !isExecuting) {
      setActiveTab('output')
    }
  }, [result, isExecuting])

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

  // Build class name - when not pinned, panel floats over content
  const panelClassName = [
    'workflow-execution-panel',
    isResizing ? 'resizing' : '',
    !isPinned ? 'floating' : ''
  ].filter(Boolean).join(' ')

  return (
    <div
      className={panelClassName}
      style={{ height: isExpanded ? panelHeight : 'auto' }}
    >
      {/* Resize handle */}
      <div
        className="workflow-resize-handle"
        onMouseDown={handleResizeMouseDown}
      />

      {/* Header */}
      <div className="workflow-panel-header">
        <div className="workflow-panel-title" onClick={() => setIsExpanded(!isExpanded)}>
          {isPaused && pendingCheckpoint ? (
            <Radio size={14} style={{ color: 'var(--node-amber)' }} />
          ) : isExecuting ? (
            <Loader className="animate-spin" size={14} style={{ color: 'var(--accent)' }} />
          ) : result ? (
            result.success ? (
              <CheckCircle size={14} style={{ color: 'var(--success)' }} />
            ) : (
              <AlertCircle size={14} style={{ color: 'var(--error)' }} />
            )
          ) : (
            <Zap size={14} />
          )}
          <span>
            {isPaused && pendingCheckpoint
              ? `Paused at ${pendingCheckpoint.checkpointName || 'Checkpoint'}`
              : isExecuting
                ? 'Running...'
                : result
                  ? result.success ? 'Completed' : 'Failed'
                  : 'Workflow Execution'
            }
          </span>
          {result?.metrics?.totalDuration && (
            <span style={{ color: 'var(--muted)', fontWeight: 400 }}>
              ({formatDuration(result.metrics.totalDuration)})
            </span>
          )}
        </div>

        {/* Debug controls when paused */}
        {isPaused && (
          <div style={{ display: 'flex', gap: '6px', marginLeft: '12px' }}>
            {onResume && (
              <button
                className="workflow-action-button"
                onClick={onResume}
                style={{ background: 'var(--success)', color: 'white' }}
              >
                <Play size={12} />
                Resume
              </button>
            )}
            {onStop && (
              <button
                className="workflow-action-button"
                onClick={onStop}
                style={{ background: 'var(--error)', color: 'white' }}
              >
                <Square size={12} />
                Stop
              </button>
            )}
          </div>
        )}

        {/* Tabs (centered) */}
        {isExpanded && (
          <div className="workflow-panel-tabs" style={{ marginLeft: 'auto', marginRight: '12px' }}>
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
          </div>
        )}

        {/* Actions */}
        <div className="workflow-panel-actions">
          {/* Stats */}
          {isExpanded && (isExecuting || result) && (
            <>
              <div className="workflow-mini-stat">
                <Zap size={12} />
                <span className="value">{completedNodes}/{nodeCount}</span>
              </div>
              {promptsSent.length > 0 && (
                <div className="workflow-mini-stat" style={{ marginLeft: '8px' }}>
                  <Sparkles size={12} />
                  <span className="value">{promptsSent.length}</span>
                </div>
              )}
              {stats && (
                <div className="workflow-mini-stat" style={{ marginLeft: '8px' }}>
                  <Timer size={12} />
                  <span className="value">{formatDuration(stats.totalDuration)}</span>
                </div>
              )}
              <div style={{ width: '1px', height: '14px', background: 'var(--border)', margin: '0 8px' }} />
            </>
          )}

          {/* Export button */}
          {trace && isExpanded && (
            <button
              className="workflow-panel-action"
              onClick={() => downloadTrace(trace)}
              title="Export trace as JSON"
            >
              <Download size={14} />
            </button>
          )}

          {/* Expand/collapse */}
          <button
            className="workflow-panel-action"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Minimize panel' : 'Expand panel'}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>

          {/* Pin button */}
          <button
            className={`workflow-panel-action ${isPinned ? 'active' : ''}`}
            onClick={() => setWorkflowPanelPinned(!isPinned)}
            title={isPinned ? 'Unpin panel (will auto-hide on canvas focus)' : 'Pin panel (keep visible)'}
          >
            {isPinned ? <Pin size={14} /> : <PinOff size={14} />}
          </button>

          {/* Close button */}
          {onClose && (
            <button
              className="workflow-panel-action"
              onClick={onClose}
              title="Close"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="workflow-panel-content">
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
        </div>
      )}
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

/**
 * BottomPanelTabs - Unified tabbed interface for bottom panels
 * Similar to VSCode's bottom panel with Output, Terminal, etc.
 * Houses BuildOutputPanel and WorkflowExecutionPanel
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { X, ChevronDown, ChevronUp, FileWarning, Zap, Pin, PinOff } from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'
import BuildOutputPanel from './BuildOutputPanel'
import { WorkflowExecutionPanel } from './workflow/WorkflowExecutionPanel'
import type { WorkflowResult } from '@prompd/cli'
import type { CheckpointEvent, ExecutionTrace } from '@prompd/cli'

interface BottomPanelTabsProps {
  onOpenFile?: (filePath: string, line?: number) => void
  // Workflow execution data
  workflowResult?: (WorkflowResult & { trace?: ExecutionTrace }) | null
  checkpoints?: CheckpointEvent[]
  promptsSent?: Array<{
    nodeId: string
    source: string
    resolvedPath?: string
    compiledPrompt: string
    params: Record<string, unknown>
    provider?: string
    model?: string
    timestamp: number
  }>
}

const MIN_HEIGHT = 100
const MAX_HEIGHT = 600
const DEFAULT_HEIGHT = 200

export function BottomPanelTabs({
  onOpenFile,
  workflowResult,
  checkpoints,
  promptsSent,
}: BottomPanelTabsProps) {
  const showBottomPanel = useUIStore(state => state.showBottomPanel)
  const activeBottomTab = useUIStore(state => state.activeBottomTab)
  const bottomPanelHeight = useUIStore(state => state.bottomPanelHeight)
  const bottomPanelPinned = useUIStore(state => state.bottomPanelPinned)
  const setShowBottomPanel = useUIStore(state => state.setShowBottomPanel)
  const setActiveBottomTab = useUIStore(state => state.setActiveBottomTab)
  const setBottomPanelHeight = useUIStore(state => state.setBottomPanelHeight)
  const setBottomPanelPinned = useUIStore(state => state.setBottomPanelPinned)

  const buildOutput = useUIStore(state => state.buildOutput)
  const showSidebar = useUIStore(state => state.showSidebar)
  const sidebarWidth = useUIStore(state => state.sidebarWidth)

  const [isExpanded, setIsExpanded] = useState(true)
  const [isResizing, setIsResizing] = useState(false)
  const resizeStartY = useRef(0)
  const resizeStartHeight = useRef(0)

  // Handle resize drag
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    resizeStartY.current = e.clientY
    resizeStartHeight.current = bottomPanelHeight
  }, [bottomPanelHeight])

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      // Calculate new height (dragging up increases height)
      const deltaY = resizeStartY.current - e.clientY
      const newHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, resizeStartHeight.current + deltaY))
      setBottomPanelHeight(newHeight)
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
  }, [isResizing, setBottomPanelHeight])

  // Auto-collapse when editor gains focus (if not pinned)
  useEffect(() => {
    const handleEditorFocus = () => {
      if (!bottomPanelPinned && isExpanded) {
        setIsExpanded(false)
      }
    }
    window.addEventListener('editor-focused', handleEditorFocus)
    return () => window.removeEventListener('editor-focused', handleEditorFocus)
  }, [bottomPanelPinned, isExpanded])

  // Listen for expand event (from hotkey toggle)
  useEffect(() => {
    const handleExpand = () => {
      setIsExpanded(true)
    }
    window.addEventListener('expand-output-panel', handleExpand)
    return () => window.removeEventListener('expand-output-panel', handleExpand)
  }, [])

  // Calculate actual panel height
  const actualPanelHeight = showBottomPanel
    ? (isExpanded ? bottomPanelHeight : 32)
    : 0

  // Expose panel height via CSS custom property
  useEffect(() => {
    document.documentElement.style.setProperty('--bottom-panel-height', `${actualPanelHeight}px`)
    return () => {
      document.documentElement.style.setProperty('--bottom-panel-height', '0px')
    }
  }, [actualPanelHeight])

  // Check for errors in build output
  const hasErrors = buildOutput.status === 'error' && (buildOutput.errors?.length || 0) > 0
  const errorCount = buildOutput.errors?.length || 0

  // Check for workflow execution
  const hasWorkflowExecution = !!workflowResult

  // Calculate left position based on sidebar state
  const leftPosition = showSidebar ? 48 + sidebarWidth : 48

  if (!showBottomPanel) return null

  return (
    <div
      className={`bottom-panel-tabs ${isResizing ? 'resizing' : ''}`}
      style={{ left: leftPosition, height: isExpanded ? bottomPanelHeight : 'auto' }}
    >
      {/* Resize handle on top edge */}
      <div
        className="bottom-panel-resize-handle"
        onMouseDown={handleResizeMouseDown}
      />

      {/* Header with tabs */}
      <div className="bottom-panel-header">
        <div className="bottom-panel-tabs-container">
          <button
            className={`bottom-panel-tab ${activeBottomTab === 'output' ? 'active' : ''}`}
            onClick={() => {
              setActiveBottomTab('output')
              setIsExpanded(true)
            }}
          >
            <FileWarning size={14} />
            <span>Output</span>
            {hasErrors && (
              <span className="bottom-panel-tab-badge">{errorCount}</span>
            )}
          </button>

          <button
            className={`bottom-panel-tab ${activeBottomTab === 'execution' ? 'active' : ''}`}
            onClick={() => {
              setActiveBottomTab('execution')
              setIsExpanded(true)
            }}
          >
            <Zap size={14} />
            <span>Execution</span>
            {hasWorkflowExecution && (
              <span className="bottom-panel-tab-indicator" />
            )}
          </button>
        </div>

        <div className="bottom-panel-actions">
          <button
            className="bottom-panel-action"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Minimize panel' : 'Expand panel'}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
          <button
            className={`bottom-panel-action ${bottomPanelPinned ? 'active' : ''}`}
            onClick={() => setBottomPanelPinned(!bottomPanelPinned)}
            title={bottomPanelPinned ? 'Unpin panel (will auto-hide on editor focus)' : 'Pin panel (keep visible)'}
          >
            {bottomPanelPinned ? <Pin size={14} /> : <PinOff size={14} />}
          </button>
          <button
            className="bottom-panel-action"
            onClick={() => setShowBottomPanel(false)}
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Panel content */}
      {isExpanded && (
        <div className="bottom-panel-content">
          {activeBottomTab === 'output' && (
            <div className="bottom-panel-tab-content">
              <BuildOutputPanel onOpenFile={onOpenFile} embedded={true} />
            </div>
          )}

          {activeBottomTab === 'execution' && (
            <div className="bottom-panel-tab-content">
              <WorkflowExecutionPanel
                onClose={() => setShowBottomPanel(false)}
                result={workflowResult}
                checkpoints={checkpoints}
                promptsSent={promptsSent}
                embedded={true}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default BottomPanelTabs

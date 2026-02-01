/**
 * BottomPanelTabs - Unified tabbed interface for bottom panels
 * Similar to VSCode's bottom panel with Output, Terminal, etc.
 * Houses BuildOutputPanel and WorkflowExecutionPanel
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { X, FileWarning, Zap, Pin, PinOff, ChevronUp, ChevronDown } from 'lucide-react'
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
  const bottomPanelMinimized = useUIStore(state => state.bottomPanelMinimized)
  const setShowBottomPanel = useUIStore(state => state.setShowBottomPanel)
  const setActiveBottomTab = useUIStore(state => state.setActiveBottomTab)
  const setBottomPanelHeight = useUIStore(state => state.setBottomPanelHeight)
  const setBottomPanelPinned = useUIStore(state => state.setBottomPanelPinned)
  const setBottomPanelMinimized = useUIStore(state => state.setBottomPanelMinimized)

  const buildOutput = useUIStore(state => state.buildOutput)
  const showSidebar = useUIStore(state => state.showSidebar)
  const sidebarWidth = useUIStore(state => state.sidebarWidth)

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

  // Auto-minimize when editor gains focus (if not pinned)
  useEffect(() => {
    const handleEditorFocus = () => {
      if (!bottomPanelPinned && !bottomPanelMinimized) {
        setBottomPanelMinimized(true)
      }
    }
    window.addEventListener('editor-focused', handleEditorFocus)
    return () => window.removeEventListener('editor-focused', handleEditorFocus)
  }, [bottomPanelPinned, bottomPanelMinimized, setBottomPanelMinimized])

  // Expose panel height via CSS custom property
  // Panel is always part of layout when visible (whether pinned or unpinned)
  // Pin only controls auto-minimize behavior, not layout integration
  useEffect(() => {
    const STATUS_BAR_HEIGHT = 24  // Must match panel's bottom: 24px positioning
    let heightToReserve = 0
    if (showBottomPanel) {
      if (bottomPanelMinimized) {
        heightToReserve = 33  // Tab row (32px) + border-top (1px)
      } else {
        heightToReserve = bottomPanelHeight + 1  // Full panel height + border-top (1px)
      }
    }
    // Always add status bar height
    heightToReserve += STATUS_BAR_HEIGHT
    document.documentElement.style.setProperty('--bottom-panel-height', `${heightToReserve}px`)
    return () => {
      document.documentElement.style.setProperty('--bottom-panel-height', '24px')  // Reset to status bar height
    }
  }, [showBottomPanel, bottomPanelMinimized, bottomPanelHeight])

  // Check for errors in build output
  const hasErrors = buildOutput.status === 'error' && (buildOutput.errors?.length || 0) > 0
  const errorCount = buildOutput.errors?.length || 0

  // Check for workflow execution
  const hasWorkflowExecution = !!workflowResult

  // Calculate left position based on sidebar state
  const leftPosition = showSidebar ? 48 + sidebarWidth : 48

  // Calculate bottom position based on sidebar state
  const bottomPosition = 29

  // Tab row is always visible (VS Code style)
  // Only hide completely if user explicitly closed the panel
  if (!showBottomPanel) return null

  return (
    <div
      className={`bottom-panel-tabs ${isResizing ? 'resizing' : ''} ${bottomPanelMinimized ? 'minimized' : ''}`}
      style={{ bottom: bottomPosition, left: leftPosition, height: bottomPanelMinimized ? 'auto' : bottomPanelHeight, paddingTop: 0 }}
    >
      {/* Resize handle on top edge (only when expanded) */}
      {!bottomPanelMinimized && (
        <div
          className="bottom-panel-resize-handle"
          onMouseDown={handleResizeMouseDown}
        />
      )}

      {/* Header with tabs */}
      <div className="bottom-panel-header">
        <div className="bottom-panel-tabs-container">
          <button
            className={`bottom-panel-tab ${activeBottomTab === 'output' ? 'active' : ''}`}
            onClick={() => {
              setActiveBottomTab('output')
              if (bottomPanelMinimized) setBottomPanelMinimized(false)
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
              if (bottomPanelMinimized) setBottomPanelMinimized(false)
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
            onClick={() => setBottomPanelMinimized(!bottomPanelMinimized)}
            title={bottomPanelMinimized ? 'Maximize panel' : 'Minimize panel'}
          >
            {bottomPanelMinimized ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            className={`bottom-panel-action ${bottomPanelPinned ? 'active' : ''}`}
            onClick={() => setBottomPanelPinned(!bottomPanelPinned)}
            title={bottomPanelPinned ? 'Unpin panel (will auto-minimize on editor focus)' : 'Pin panel (keep expanded)'}
          >
            {bottomPanelPinned ? <Pin size={14} /> : <PinOff size={14} />}
          </button>
          <button
            className="bottom-panel-action"
            onClick={() => setShowBottomPanel(false)}
            title="Close panel (will reopen automatically when errors occur or workflow executes)"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Panel content (only when expanded) */}
      {!bottomPanelMinimized && (
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

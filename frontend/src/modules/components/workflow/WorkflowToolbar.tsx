/**
 * WorkflowToolbar - Toolbar for workflow canvas actions
 *
 * The play button is in the EditorHeader. This toolbar contains:
 * - Execution mode selector (automated/debug/step)
 * - Stop button (when executing)
 * - View controls (zoom, fit, grid, minimap)
 */

import { Play, Square, LayoutGrid, Map, ZoomIn, ZoomOut, Maximize, Settings, ChevronDown, PlayCircle, Undo2, Redo2, Link2, Package } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useWorkflowStore } from '../../../stores/workflowStore'
import { useUIStore } from '../../../stores/uiStore'
import type { ExecutionMode } from '../../services/workflowExecutor'

interface WorkflowToolbarProps {
  readOnly?: boolean
  onRun?: (mode: ExecutionMode) => void
  onStop?: () => void
  onResume?: () => void
  isPaused?: boolean
  onDeploy?: () => void
}

// Store execution mode globally so it persists and can be accessed by EditorHeader event
let globalExecutionMode: ExecutionMode = 'automated'
const modeChangeListeners: Array<(mode: ExecutionMode) => void> = []

export function getGlobalExecutionMode(): ExecutionMode {
  return globalExecutionMode
}

export function onExecutionModeChange(listener: (mode: ExecutionMode) => void) {
  modeChangeListeners.push(listener)
  return () => {
    const idx = modeChangeListeners.indexOf(listener)
    if (idx >= 0) modeChangeListeners.splice(idx, 1)
  }
}

export function WorkflowToolbar({ readOnly = false, onRun, onStop, onResume, isPaused = false, onDeploy }: WorkflowToolbarProps) {
  const reactFlow = useReactFlow()
  const [showModeMenu, setShowModeMenu] = useState(false)
  const [executionMode, setExecutionMode] = useState<ExecutionMode>(globalExecutionMode)

  // Store state
  const isExecuting = useWorkflowStore(state => state.isExecuting)
  const showMinimap = useWorkflowStore(state => state.showMinimap)
  const showGrid = useWorkflowStore(state => state.showGrid)

  // Store actions
  const toggleMinimap = useWorkflowStore(state => state.toggleMinimap)
  const toggleGrid = useWorkflowStore(state => state.toggleGrid)
  const undo = useWorkflowStore(state => state.undo)
  const redo = useWorkflowStore(state => state.redo)
  const canUndo = useWorkflowStore(state => state.canUndo)
  const canRedo = useWorkflowStore(state => state.canRedo)

  // UI Store - connections panel
  const showConnectionsPanel = useUIStore(state => state.showConnectionsPanel)
  const toggleConnectionsPanel = useUIStore(state => state.toggleConnectionsPanel)

  // Check undo/redo availability
  const undoAvailable = canUndo()
  const redoAvailable = canRedo()

  // Keyboard shortcuts for undo/redo
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Check if focus is in an input field
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return
    }

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
    const cmdKey = isMac ? e.metaKey : e.ctrlKey

    if (cmdKey && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      undo()
    } else if (cmdKey && e.key === 'z' && e.shiftKey) {
      e.preventDefault()
      redo()
    } else if (cmdKey && e.key === 'y') {
      e.preventDefault()
      redo()
    }
  }, [undo, redo])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Keep global mode in sync
  useEffect(() => {
    globalExecutionMode = executionMode
    modeChangeListeners.forEach(listener => listener(executionMode))
  }, [executionMode])

  const handleStop = () => {
    // Keep executionState so node debug footers persist after stop
    onStop?.()
  }

  const handleModeSelect = (mode: ExecutionMode) => {
    setExecutionMode(mode)
    setShowModeMenu(false)
  }

  const handleZoomIn = () => {
    reactFlow.zoomIn()
  }

  const handleZoomOut = () => {
    reactFlow.zoomOut()
  }

  const handleFitView = () => {
    reactFlow.fitView({ padding: 0.2 })
  }

  const getModeIcon = (mode: ExecutionMode) => {
    switch (mode) {
      case 'automated': return <Play style={{ width: 12, height: 12 }} />
      case 'debug': return <Settings style={{ width: 12, height: 12 }} />
      case 'step': return <Square style={{ width: 12, height: 12 }} />
    }
  }

  const getModeLabel = (mode: ExecutionMode) => {
    switch (mode) {
      case 'automated': return 'Auto'
      case 'debug': return 'Debug'
      case 'step': return 'Step'
    }
  }

  const buttonBaseStyle: React.CSSProperties = {
    padding: '8px',
    borderRadius: '6px',
    transition: 'background-color 0.2s, color 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    cursor: 'pointer',
  }

  const defaultButtonStyle: React.CSSProperties = {
    ...buttonBaseStyle,
    background: 'transparent',
    color: 'var(--muted)',
  }

  const activeButtonStyle: React.CSSProperties = {
    ...buttonBaseStyle,
    background: 'color-mix(in srgb, var(--accent) 20%, transparent)',
    color: 'var(--accent)',
  }

  const stopButtonStyle: React.CSSProperties = {
    ...buttonBaseStyle,
    background: 'color-mix(in srgb, var(--error) 20%, transparent)',
    color: 'var(--error)',
  }

  const continueButtonStyle: React.CSSProperties = {
    ...buttonBaseStyle,
    background: 'color-mix(in srgb, var(--success) 20%, transparent)',
    color: 'var(--success)',
  }

  const disabledButtonStyle: React.CSSProperties = {
    ...buttonBaseStyle,
    background: 'transparent',
    color: 'var(--muted)',
    opacity: 0.4,
    cursor: 'not-allowed',
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        background: 'var(--panel)',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        border: '1px solid var(--border)',
        padding: '4px',
      }}
    >
      {/* Execution controls */}
      {!readOnly && (
        <>
          {/* Continue button - only shown when paused */}
          {isExecuting && isPaused && (
            <button
              onClick={onResume}
              style={continueButtonStyle}
              title="Continue execution"
            >
              <PlayCircle style={{ width: 16, height: 16 }} />
            </button>
          )}

          {/* Stop button - only shown when executing */}
          {isExecuting && (
            <button
              onClick={handleStop}
              style={stopButtonStyle}
              title="Stop execution"
            >
              <Square style={{ width: 16, height: 16 }} />
            </button>
          )}

          {/* Execution mode selector - always shown (replaces the play button) */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowModeMenu(!showModeMenu)}
              disabled={isExecuting}
              style={{
                ...buttonBaseStyle,
                background: 'transparent',
                color: isExecuting ? 'var(--muted)' : 'var(--text-secondary)',
                padding: '6px 8px',
                gap: '4px',
                opacity: isExecuting ? 0.5 : 1,
              }}
              title={`Execution mode: ${executionMode}`}
            >
              {getModeIcon(executionMode)}
              <span style={{ fontSize: '11px', fontWeight: 500 }}>{getModeLabel(executionMode)}</span>
              <ChevronDown style={{ width: 10, height: 10 }} />
            </button>

            {/* Mode dropdown menu */}
            {showModeMenu && !isExecuting && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '4px',
                  background: 'var(--panel)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  zIndex: 100,
                  minWidth: '180px',
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => handleModeSelect('automated')}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    width: '100%',
                    padding: '10px 12px',
                    background: executionMode === 'automated' ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <Play style={{ width: 14, height: 14, color: 'var(--success)', marginTop: '2px', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)' }}>Automated</div>
                    <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Run to completion</div>
                  </div>
                </button>
                <button
                  onClick={() => handleModeSelect('debug')}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    width: '100%',
                    padding: '10px 12px',
                    background: executionMode === 'debug' ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                    border: 'none',
                    borderTop: '1px solid var(--border)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <Settings style={{ width: 14, height: 14, color: 'var(--node-amber)', marginTop: '2px', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)' }}>Debug</div>
                    <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Pause at checkpoints</div>
                  </div>
                </button>
                <button
                  onClick={() => handleModeSelect('step')}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    width: '100%',
                    padding: '10px 12px',
                    background: executionMode === 'step' ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                    border: 'none',
                    borderTop: '1px solid var(--border)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <Square style={{ width: 14, height: 14, color: 'var(--node-teal)', marginTop: '2px', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)' }}>Step</div>
                    <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Pause after each node</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Deploy button */}
          {onDeploy && (
            <button
              onClick={onDeploy}
              disabled={isExecuting}
              style={{
                ...buttonBaseStyle,
                background: 'color-mix(in srgb, var(--node-purple) 15%, transparent)',
                color: isExecuting ? 'var(--muted)' : 'var(--node-purple)',
                padding: '6px 10px',
                gap: '4px',
                opacity: isExecuting ? 0.5 : 1,
              }}
              title="Deploy workflow"
            >
              <Package style={{ width: 14, height: 14 }} />
              <span style={{ fontSize: '11px', fontWeight: 500 }}>Deploy</span>
            </button>
          )}

          <div style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 4px' }} />
        </>
      )}

      {/* View controls */}
      <button
        onClick={handleZoomIn}
        style={defaultButtonStyle}
        title="Zoom in"
      >
        <ZoomIn style={{ width: 16, height: 16 }} />
      </button>

      <button
        onClick={handleZoomOut}
        style={defaultButtonStyle}
        title="Zoom out"
      >
        <ZoomOut style={{ width: 16, height: 16 }} />
      </button>

      <button
        onClick={handleFitView}
        style={defaultButtonStyle}
        title="Fit view"
      >
        <Maximize style={{ width: 16, height: 16 }} />
      </button>

      <div style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 4px' }} />

      {/* Toggle controls */}
      <button
        onClick={toggleGrid}
        style={showGrid ? activeButtonStyle : defaultButtonStyle}
        title="Toggle grid"
      >
        <LayoutGrid style={{ width: 16, height: 16 }} />
      </button>

      <button
        onClick={toggleMinimap}
        style={showMinimap ? activeButtonStyle : defaultButtonStyle}
        title="Toggle minimap"
      >
        <Map style={{ width: 16, height: 16 }} />
      </button>

      {/* Connections panel toggle */}
      {!readOnly && (
        <button
          onClick={toggleConnectionsPanel}
          style={showConnectionsPanel ? activeButtonStyle : defaultButtonStyle}
          title="Toggle connections panel"
        >
          <Link2 style={{ width: 16, height: 16 }} />
        </button>
      )}

      {/* Undo/Redo controls */}
      {!readOnly && (
        <>
          <div style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 4px' }} />

          <button
            onClick={undo}
            disabled={!undoAvailable || isExecuting}
            style={undoAvailable && !isExecuting ? defaultButtonStyle : disabledButtonStyle}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 style={{ width: 16, height: 16 }} />
          </button>

          <button
            onClick={redo}
            disabled={!redoAvailable || isExecuting}
            style={redoAvailable && !isExecuting ? defaultButtonStyle : disabledButtonStyle}
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 style={{ width: 16, height: 16 }} />
          </button>
        </>
      )}
    </div>
  )
}

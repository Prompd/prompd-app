/**
 * UnifiedWorkflowToolbar - Combined toolbar spanning the canvas
 *
 * Combines WorkflowToolbar and WorkflowParametersPanel into a single
 * horizontal bar that can dock to canvas edges (top/bottom/left/right).
 *
 * Layout:
 * - Left section: Auto/Debug/Step, Zoom+, Zoom-, Fit View, Grid, Links, Minimap
 * - Middle section: Undo, Redo
 * - Right section: Workflow Parameters (collapsible)
 */

import {
  Play,
  Square,
  Settings,
  ZoomIn,
  ZoomOut,
  Maximize,
  LayoutGrid,
  Map,
  Link2,
  PanelLeft,
  Undo2,
  Redo2,
  ChevronDown,
  ChevronRight,
  PlayCircle,
  Plus,
  Trash2,
  GripVertical,
  Settings2,
  Package,
} from 'lucide-react'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useReactFlow } from '@xyflow/react'
import { useWorkflowStore } from '../../../stores/workflowStore'
import { useUIStore } from '../../../stores/uiStore'
import type { ExecutionMode } from '../../services/workflowExecutor'
import type { WorkflowParameter } from '../../services/workflowTypes'

interface UnifiedWorkflowToolbarProps {
  readOnly?: boolean
  onRun?: (mode: ExecutionMode) => void
  onStop?: () => void
  onResume?: () => void
  isPaused?: boolean
  onDeploy?: () => void
  onExport?: () => void
  hasErrors?: boolean
}

type DockPosition = 'top' | 'bottom' | 'left' | 'right'

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

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 500,
  color: 'var(--text-secondary)',
  marginBottom: '4px',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid var(--input-border)',
  borderRadius: '4px',
  background: 'var(--input-bg)',
  color: 'var(--text)',
  fontSize: '12px',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
}

export function UnifiedWorkflowToolbar({
  readOnly = false,
  onRun,
  onStop,
  onResume,
  isPaused = false,
  onDeploy,
  hasErrors = false,
}: UnifiedWorkflowToolbarProps) {
  const reactFlow = useReactFlow()
  const [showModeMenu, setShowModeMenu] = useState(false)
  const [executionMode, setExecutionMode] = useState<ExecutionMode>(globalExecutionMode)
  const [parametersExpanded, setParametersExpanded] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)

  // Store state
  const isExecuting = useWorkflowStore((state) => state.isExecuting)
  const showMinimap = useWorkflowStore((state) => state.showMinimap)
  const showGrid = useWorkflowStore((state) => state.showGrid)
  const dockPosition = useWorkflowStore((state) => state.toolbarDockPosition)
  const workflowFile = useWorkflowStore((state) => state.workflowFile)
  const updateWorkflowParameters = useWorkflowStore((state) => state.updateWorkflowParameters)
  const undo = useWorkflowStore((state) => state.undo)
  const redo = useWorkflowStore((state) => state.redo)
  const canUndo = useWorkflowStore((state) => state.canUndo)
  const canRedo = useWorkflowStore((state) => state.canRedo)
  const toggleMinimap = useWorkflowStore((state) => state.toggleMinimap)
  const toggleGrid = useWorkflowStore((state) => state.toggleGrid)
  const setToolbarDockPosition = useWorkflowStore((state) => state.setToolbarDockPosition)

  // UI Store - connections panel
  const showConnectionsPanel = useUIStore((state) => state.showConnectionsPanel)
  const toggleConnectionsPanel = useUIStore((state) => state.toggleConnectionsPanel)
  const showNodePalette = useUIStore((state) => state.showNodePalette)
  const toggleNodePalette = useUIStore((state) => state.toggleNodePalette)

  const parameters = workflowFile?.parameters || []
  const undoAvailable = canUndo()
  const redoAvailable = canRedo()

  // Keep global mode in sync
  useEffect(() => {
    globalExecutionMode = executionMode
    modeChangeListeners.forEach((listener) => listener(executionMode))
  }, [executionMode])

  // Keyboard shortcuts for undo/redo
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
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
    },
    [undo, redo]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Handle drag for repositioning
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    dragStartRef.current = { x: e.clientX, y: e.clientY }
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current || !toolbarRef.current) return

      const deltaX = e.clientX - dragStartRef.current.x
      const deltaY = e.clientY - dragStartRef.current.y

      // Determine new dock position based on drag direction
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        // Vertical movement
        if (deltaY > 50) {
          setToolbarDockPosition('bottom')
        } else if (deltaY < -50) {
          setToolbarDockPosition('top')
        }
      } else {
        // Horizontal movement
        if (deltaX > 50) {
          setToolbarDockPosition('right')
        } else if (deltaX < -50) {
          setToolbarDockPosition('left')
        }
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      dragStartRef.current = null
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, setToolbarDockPosition])

  const handleStop = () => {
    // Keep executionState so node debug footers persist after stop
    onStop?.()
  }

  const handleModeSelect = (mode: ExecutionMode) => {
    setExecutionMode(mode)
    setShowModeMenu(false)
  }

  const handleZoomIn = () => reactFlow.zoomIn()
  const handleZoomOut = () => reactFlow.zoomOut()
  const handleFitView = () => reactFlow.fitView({ padding: 0.2 })

  const getModeIcon = (mode: ExecutionMode) => {
    switch (mode) {
      case 'automated':
        return <Play style={{ width: 12, height: 12 }} />
      case 'debug':
        return <Settings style={{ width: 12, height: 12 }} />
      case 'step':
        return <Square style={{ width: 12, height: 12 }} />
    }
  }

  const getModeLabel = (mode: ExecutionMode) => {
    switch (mode) {
      case 'automated':
        return 'Auto'
      case 'debug':
        return 'Debug'
      case 'step':
        return 'Step'
    }
  }

  const addParameter = () => {
    const newParam: WorkflowParameter = {
      name: `param_${parameters.length + 1}`,
      type: 'string',
      required: false,
      description: '',
    }
    updateWorkflowParameters([...parameters, newParam])
  }

  const updateParameter = (index: number, updates: Partial<WorkflowParameter>) => {
    const newParams = [...parameters]
    newParams[index] = { ...newParams[index], ...updates }
    updateWorkflowParameters(newParams)
  }

  const removeParameter = (index: number) => {
    const newParams = parameters.filter((_, i) => i !== index)
    updateWorkflowParameters(newParams)
  }

  // Stop events from bubbling to React Flow
  const stopPropagation = (e: React.SyntheticEvent) => {
    e.stopPropagation()
  }

  // Determine container style based on dock position
  // Always horizontal layout, rotate 90deg for left/right docking
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '8px',
    background: 'var(--panel)',
    boxShadow: isDragging ? '0 4px 16px rgba(0,0,0,0.25)' : '0 2px 8px rgba(0,0,0,0.15)',
    border: `1px solid ${isDragging ? 'var(--accent)' : 'var(--border)'}`,
    borderRadius:
      dockPosition === 'top'
        ? '0 0 8px 8px'
        : dockPosition === 'bottom'
        ? '8px 8px 0 0'
        : dockPosition === 'left'
        ? '8px 0 0 8px'  // Round left side when docked left
        : '0 8px 8px 0', // Round right side when docked right
    padding: '6px 12px',
    transition: isDragging ? 'none' : 'all 0.2s',
  }

  const buttonBaseStyle: React.CSSProperties = {
    padding: '6px',
    borderRadius: '6px',
    transition: 'background-color 0.2s, color 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    cursor: 'pointer',
    background: 'transparent',
    color: 'var(--muted)',
  }

  const activeButtonStyle: React.CSSProperties = {
    ...buttonBaseStyle,
    background: 'color-mix(in srgb, var(--accent) 20%, transparent)',
    color: 'var(--accent)',
  }

  const disabledButtonStyle: React.CSSProperties = {
    ...buttonBaseStyle,
    opacity: 0.4,
    cursor: 'not-allowed',
  }

  return (
    <div
      ref={toolbarRef}
      style={containerStyle}
      onKeyDown={stopPropagation}
      onMouseDown={stopPropagation}
      onClick={stopPropagation}
    >
      {/* Drag handle */}
      <div
        onMouseDown={handleDragStart}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: isDragging ? 'grabbing' : 'grab',
          color: 'var(--muted)',
          padding: '4px',
        }}
        title="Drag to reposition"
      >
        <GripVertical style={{ width: 14, height: 14 }} />
      </div>

      <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />

      {/* LEFT SECTION: Execution mode & view controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {/* Execution controls */}
        {!readOnly && (
          <>
            {isExecuting && isPaused && (
              <button
                onClick={onResume}
                style={{
                  ...buttonBaseStyle,
                  background: 'color-mix(in srgb, var(--success) 20%, transparent)',
                  color: 'var(--success)',
                }}
                title="Continue execution"
              >
                <PlayCircle style={{ width: 16, height: 16 }} />
              </button>
            )}

            {isExecuting && (
              <button
                onClick={handleStop}
                style={{
                  ...buttonBaseStyle,
                  background: 'color-mix(in srgb, var(--error) 20%, transparent)',
                  color: 'var(--error)',
                }}
                title="Stop execution"
              >
                <Square style={{ width: 16, height: 16 }} />
              </button>
            )}

            {/* Execution mode selector */}
            <div style={{ position: 'relative' }} ref={toolbarRef}>
              <button
                onClick={() => setShowModeMenu(!showModeMenu)}
                disabled={isExecuting}
                style={{
                  ...buttonBaseStyle,
                  padding: '6px 8px',
                  gap: '4px',
                  opacity: isExecuting ? 0.5 : 1,
                  color: isExecuting ? 'var(--muted)' : 'var(--text-secondary)',
                }}
                title={`Execution mode: ${executionMode}`}
              >
                {getModeIcon(executionMode)}
                <span style={{ fontSize: '11px', fontWeight: 500 }}>{getModeLabel(executionMode)}</span>
                <ChevronDown style={{ width: 10, height: 10 }} />
              </button>

              {showModeMenu && !isExecuting && toolbarRef.current && createPortal(
                <>
                  {/* Backdrop */}
                  <div
                    style={{
                      position: 'fixed',
                      inset: 0,
                      zIndex: 9998,
                    }}
                    onClick={() => setShowModeMenu(false)}
                  />
                  {/* Menu */}
                  <div
                    style={{
                      position: 'fixed',
                      ...(() => {
                        const rect = toolbarRef.current!.getBoundingClientRect()
                        const menuWidth = 180
                        const menuHeight = 140 // Approximate height for 3 buttons
                        const toolbarHeight = rect.height

                        // Calculate position based on dock position
                        // For right docking, position menu to the left and at top of button to avoid overflow
                        if (dockPosition === 'right') {
                          // Check if there's enough space on the right
                          const spaceOnRight = window.innerWidth - rect.right
                          if (spaceOnRight < menuWidth) {
                            // Not enough space on right, position to the left at top of button
                            return {
                              right: window.innerWidth - rect.left,
                              top: rect.top,
                            }
                          }
                        }

                        // For left docking, check if menu would overflow left edge
                        if (dockPosition === 'left') {
                          const spaceOnLeft = rect.left
                          if (spaceOnLeft < menuWidth) {
                            // Not enough space on left, push to the right at top of button
                            return {
                              left: rect.right + 8,
                              top: rect.top,
                            }
                          }
                        }

                        // For bottom docking, check if menu would overflow bottom edge
                        if (dockPosition === 'bottom') {
                          const spaceBelow = window.innerHeight - rect.bottom
                          if (spaceBelow < menuHeight) {
                            // Not enough space below, position above the button
                            return {
                              left: rect.left,
                              bottom: window.innerHeight - rect.top + 4,
                            }
                          }
                        }

                        // Default positioning (for top or when there's space)
                        return {
                          left: rect.left,
                          top: rect.bottom + 4,
                        }
                      })(),
                      background: 'var(--panel)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      zIndex: 9999,
                      minWidth: '180px',
                      overflow: 'hidden',
                    }}
                    onMouseDown={stopPropagation}
                    onClick={stopPropagation}
                  >
                  <button
                    onClick={() => handleModeSelect('automated')}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                      width: '100%',
                      padding: '10px 12px',
                      background:
                        executionMode === 'automated'
                          ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
                          : 'transparent',
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
                      background:
                        executionMode === 'debug'
                          ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
                          : 'transparent',
                      border: 'none',
                      borderTop: '1px solid var(--border)',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <Settings
                      style={{ width: 14, height: 14, color: 'var(--node-amber)', marginTop: '2px', flexShrink: 0 }}
                    />
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
                      background:
                        executionMode === 'step'
                          ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
                          : 'transparent',
                      border: 'none',
                      borderTop: '1px solid var(--border)',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <Square
                      style={{ width: 14, height: 14, color: 'var(--node-teal)', marginTop: '2px', flexShrink: 0 }}
                    />
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)' }}>Step</div>
                      <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Pause after each node</div>
                    </div>
                  </button>
                </div>
                </>,
                document.body
              )}
            </div>

            {/* Deploy button */}
            {onDeploy && (
              <button
                onClick={onDeploy}
                disabled={isExecuting || hasErrors}
                style={{
                  ...buttonBaseStyle,
                  padding: '6px 10px',
                  gap: '4px',
                  opacity: (isExecuting || hasErrors) ? 0.5 : 1,
                  background: 'color-mix(in srgb, var(--node-purple) 15%, transparent)',
                  color: (isExecuting || hasErrors) ? 'var(--muted)' : 'var(--node-purple)',
                }}
                title={hasErrors ? "Fix validation errors before deploying" : "Deploy workflow"}
              >
                <Package style={{ width: 14, height: 14 }} />
                <span style={{ fontSize: '11px', fontWeight: 500 }}>Deploy</span>
              </button>
            )}

            <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />
          </>
        )}

        {/* View controls */}
        <button onClick={handleZoomIn} style={buttonBaseStyle} title="Zoom in">
          <ZoomIn style={{ width: 16, height: 16 }} />
        </button>

        <button onClick={handleZoomOut} style={buttonBaseStyle} title="Zoom out">
          <ZoomOut style={{ width: 16, height: 16 }} />
        </button>

        <button onClick={handleFitView} style={buttonBaseStyle} title="Fit view">
          <Maximize style={{ width: 16, height: 16 }} />
        </button>

        <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />

        {/* Toggle controls */}
        <button onClick={toggleGrid} style={showGrid ? activeButtonStyle : buttonBaseStyle} title="Toggle grid">
          <LayoutGrid style={{ width: 16, height: 16 }} />
        </button>

        {!readOnly && (
          <button
            onClick={toggleNodePalette}
            style={showNodePalette ? activeButtonStyle : buttonBaseStyle}
            title="Toggle node palette"
          >
            <PanelLeft style={{ width: 16, height: 16 }} />
          </button>
        )}

        {!readOnly && (
          <button
            onClick={toggleConnectionsPanel}
            style={showConnectionsPanel ? activeButtonStyle : buttonBaseStyle}
            title="Toggle connections panel"
          >
            <Link2 style={{ width: 16, height: 16 }} />
          </button>
        )}

        <button onClick={toggleMinimap} style={showMinimap ? activeButtonStyle : buttonBaseStyle} title="Toggle minimap">
          <Map style={{ width: 16, height: 16 }} />
        </button>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* MIDDLE SECTION: Undo/Redo */}
      {!readOnly && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={undo}
            disabled={!undoAvailable || isExecuting}
            style={undoAvailable && !isExecuting ? buttonBaseStyle : disabledButtonStyle}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 style={{ width: 16, height: 16 }} />
          </button>

          <button
            onClick={redo}
            disabled={!redoAvailable || isExecuting}
            style={redoAvailable && !isExecuting ? buttonBaseStyle : disabledButtonStyle}
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 style={{ width: 16, height: 16 }} />
          </button>
        </div>
      )}

      {/* RIGHT SECTION: Workflow Parameters */}
      {!readOnly && (
        <>
          <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              onClick={() => setParametersExpanded(!parametersExpanded)}
              style={{
                ...buttonBaseStyle,
                padding: '6px 8px',
                gap: '6px',
                background: parametersExpanded ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                color: parametersExpanded ? 'var(--accent)' : 'var(--text-secondary)',
              }}
              title="Workflow parameters"
            >
              {parametersExpanded ? (
                <ChevronDown style={{ width: 14, height: 14 }} />
              ) : (
                <ChevronRight style={{ width: 14, height: 14 }} />
              )}
              <Settings2 style={{ width: 14, height: 14 }} />
              <span style={{ fontSize: '11px', fontWeight: 500 }}>Parameters</span>
              <span
                style={{
                  fontSize: '10px',
                  color: 'var(--muted)',
                  background: 'var(--panel-2)',
                  padding: '2px 5px',
                  borderRadius: '3px',
                }}
              >
                {parameters.length}
              </span>
            </button>
          </div>
        </>
      )}

      {/* Parameters modal (appears centered over canvas when expanded) */}
      {!readOnly && parametersExpanded && createPortal(
        <>
          {/* Backdrop */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              zIndex: 9998,
            }}
            onClick={() => setParametersExpanded(false)}
          />
          {/* Modal */}
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              padding: '0',
              width: '90%',
              maxWidth: '500px',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 9999,
            }}
            onKeyDown={stopPropagation}
            onMouseDown={stopPropagation}
            onClick={stopPropagation}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Settings2 style={{ width: 18, height: 18, color: 'var(--accent)' }} />
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
                  Workflow Parameters
                </h3>
                <span
                  style={{
                    fontSize: '12px',
                    color: 'var(--muted)',
                    background: 'var(--panel-2)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                  }}
                >
                  {parameters.length}
                </span>
              </div>
              <button
                onClick={() => setParametersExpanded(false)}
                style={{
                  padding: '4px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--muted)',
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: '4px',
                }}
                title="Close"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {parameters.map((param, index) => (
              <ParameterRow
                key={index}
                parameter={param}
                onChange={(updates) => updateParameter(index, updates)}
                onRemove={() => removeParameter(index)}
              />
            ))}
          </div>

          <button
            onClick={addParameter}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px',
              marginTop: '8px',
              background: 'transparent',
              border: '1px dashed var(--border)',
              borderRadius: '6px',
              cursor: 'pointer',
              color: 'var(--accent)',
              fontSize: '12px',
            }}
          >
            <Plus style={{ width: 14, height: 14 }} />
            Add Parameter
          </button>

          {parameters.length > 0 && (
            <div
              style={{
                marginTop: '12px',
                padding: '8px',
                background: 'var(--panel-2)',
                borderRadius: '4px',
                fontSize: '10px',
                color: 'var(--text-secondary)',
              }}
            >
              Use{' '}
              <code style={{ background: 'var(--input-bg)', padding: '1px 4px', borderRadius: '2px' }}>
                {'{{ workflow.param_name }}'}
              </code>{' '}
              in node parameters to reference these values.
            </div>
          )}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}

interface ParameterRowProps {
  parameter: WorkflowParameter
  onChange: (updates: Partial<WorkflowParameter>) => void
  onRemove: () => void
}

function ParameterRow({ parameter, onChange, onRemove }: ParameterRowProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div
      style={{
        background: 'var(--panel-2)',
        borderRadius: '6px',
        border: '1px solid var(--border)',
        overflow: 'hidden',
      }}
    >
      {/* Collapsed view */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px',
        }}
      >
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          style={{
            padding: '2px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--muted)',
          }}
        >
          {isExpanded ? <ChevronDown style={{ width: 12, height: 12 }} /> : <ChevronRight style={{ width: 12, height: 12 }} />}
        </button>

        <input
          type="text"
          value={parameter.name}
          onChange={(e) => onChange({ name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
          placeholder="param_name"
          style={{
            flex: 1,
            padding: '4px 8px',
            border: 'none',
            background: 'transparent',
            color: 'var(--text)',
            fontSize: '12px',
            fontFamily: 'monospace',
          }}
        />

        <select
          value={parameter.type}
          onChange={(e) => onChange({ type: e.target.value as WorkflowParameter['type'] })}
          style={{
            padding: '4px 6px',
            border: '1px solid var(--input-border)',
            borderRadius: '4px',
            background: 'var(--input-bg)',
            color: 'var(--text)',
            fontSize: '11px',
            cursor: 'pointer',
          }}
        >
          <option value="string">string</option>
          <option value="number">number</option>
          <option value="integer">integer</option>
          <option value="boolean">boolean</option>
          <option value="array">array</option>
          <option value="object">object</option>
        </select>

        {parameter.required && (
          <span
            style={{
              fontSize: '10px',
              color: 'var(--error)',
              fontWeight: 500,
            }}
          >
            *
          </span>
        )}

        <button
          onClick={onRemove}
          style={{
            padding: '4px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--muted)',
          }}
          title="Remove parameter"
        >
          <Trash2 style={{ width: 12, height: 12 }} />
        </button>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div
          style={{
            padding: '8px 12px 12px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div>
            <label style={labelStyle}>Description</label>
            <input
              type="text"
              value={parameter.description || ''}
              onChange={(e) => onChange({ description: e.target.value })}
              placeholder="Parameter description..."
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Default Value</label>
              {parameter.type === 'boolean' ? (
                <select
                  value={parameter.default !== undefined ? String(parameter.default) : ''}
                  onChange={(e) => {
                    const val = e.target.value === '' ? undefined : e.target.value === 'true'
                    onChange({ default: val })
                  }}
                  style={selectStyle}
                >
                  <option value="">No default</option>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  type={parameter.type === 'number' || parameter.type === 'integer' ? 'number' : 'text'}
                  value={(parameter.default as string) || ''}
                  onChange={(e) => {
                    let value: unknown = e.target.value
                    if (parameter.type === 'number') value = parseFloat(e.target.value) || 0
                    if (parameter.type === 'integer') value = parseInt(e.target.value) || 0
                    onChange({ default: value })
                  }}
                  placeholder="Default value..."
                  style={inputStyle}
                />
              )}
            </div>

            <div style={{ width: '80px' }}>
              <label style={labelStyle}>Required</label>
              <select
                value={parameter.required ? 'yes' : 'no'}
                onChange={(e) => onChange({ required: e.target.value === 'yes' })}
                style={selectStyle}
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
          </div>

          {(parameter.type === 'number' || parameter.type === 'integer') && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Min</label>
                <input
                  type="number"
                  value={parameter.min ?? ''}
                  onChange={(e) => onChange({ min: e.target.value ? parseFloat(e.target.value) : undefined })}
                  placeholder="Min"
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Max</label>
                <input
                  type="number"
                  value={parameter.max ?? ''}
                  onChange={(e) => onChange({ max: e.target.value ? parseFloat(e.target.value) : undefined })}
                  placeholder="Max"
                  style={inputStyle}
                />
              </div>
            </div>
          )}

          {parameter.type === 'string' && (
            <div>
              <label style={labelStyle}>Allowed Values (comma-separated, optional)</label>
              <input
                type="text"
                value={parameter.enum?.join(', ') || ''}
                onChange={(e) => {
                  const values = e.target.value
                    .split(',')
                    .map((v) => v.trim())
                    .filter((v) => v)
                  onChange({ enum: values.length > 0 ? values : undefined })
                }}
                placeholder="option1, option2, option3"
                style={inputStyle}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

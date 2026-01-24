import { useState, useCallback, useEffect, useRef } from 'react'
import { useUIStore, selectBuildOutput, selectShowBuildPanel, selectBuildPanelPinned } from '../../stores/uiStore'
import { useEditorStore } from '../../stores/editorStore'
import { X, CheckCircle, AlertCircle, Loader, Package, FolderOpen, ChevronDown, ChevronUp, FileWarning, ExternalLink, Pin, PinOff } from 'lucide-react'
import type { BuildError } from '../../stores/types'

interface BuildOutputPanelProps {
  onOpenFile?: (filePath: string, line?: number) => void
}

const MIN_HEIGHT = 100
const MAX_HEIGHT = 500
const DEFAULT_HEIGHT = 200

/**
 * Build Output Panel - Docked bottom panel showing build status and errors
 * Features clickable error links that navigate to file/line
 * Resizable via drag handle on top edge
 */
export function BuildOutputPanel({ onOpenFile }: BuildOutputPanelProps) {
  const buildOutput = useUIStore(selectBuildOutput)
  const showPanel = useUIStore(selectShowBuildPanel)
  const isPinned = useUIStore(selectBuildPanelPinned)
  const setShowBuildPanel = useUIStore(state => state.setShowBuildPanel)
  const setBuildPanelPinned = useUIStore(state => state.setBuildPanelPinned)
  const clearBuildOutput = useUIStore(state => state.clearBuildOutput)
  const showSidebar = useUIStore(state => state.showSidebar)
  const sidebarWidth = useUIStore(state => state.sidebarWidth)
  const [isExpanded, setIsExpanded] = useState(true)
  const [panelHeight, setPanelHeight] = useState(DEFAULT_HEIGHT)
  const [isResizing, setIsResizing] = useState(false)
  const resizeStartY = useRef(0)
  const resizeStartHeight = useRef(0)

  // Editor store for opening files and jumping to lines
  const activateTab = useEditorStore(state => state.activateTab)
  const setJumpTo = useEditorStore(state => state.setJumpTo)
  const tabs = useEditorStore(state => state.tabs)

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
      // Calculate new height (dragging up increases height)
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

  // Auto-collapse when editor gains focus (if not pinned)
  useEffect(() => {
    const handleEditorFocus = () => {
      if (!isPinned && isExpanded) {
        setIsExpanded(false)
      }
    }
    window.addEventListener('editor-focused', handleEditorFocus)
    return () => window.removeEventListener('editor-focused', handleEditorFocus)
  }, [isPinned, isExpanded])

  // Listen for expand event (from hotkey toggle)
  useEffect(() => {
    const handleExpand = () => {
      setIsExpanded(true)
    }
    window.addEventListener('expand-output-panel', handleExpand)
    return () => window.removeEventListener('expand-output-panel', handleExpand)
  }, [])

  // Check if there are errors (for error count badge)
  const hasErrors = buildOutput.status === 'error' && (buildOutput.errors?.length || 0) > 0

  // Calculate actual panel height for external consumers
  // When minimized, always show 32px header bar (panel stays visible until X is clicked)
  // When expanded, height is full panel height
  const actualPanelHeight = showPanel
    ? (isExpanded ? panelHeight : 32)
    : 0

  // Expose panel height via CSS custom property for main content to consume
  useEffect(() => {
    document.documentElement.style.setProperty('--build-panel-height', `${actualPanelHeight}px`)
    return () => {
      document.documentElement.style.setProperty('--build-panel-height', '0px')
    }
  }, [actualPanelHeight])

  // Hide panel completely only if explicitly closed by user (X button)
  if (!showPanel) return null

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString()
  }

  const handleOpenFolder = async () => {
    if (buildOutput.outputPath && window.electronAPI?.showItemInFolder) {
      await window.electronAPI.showItemInFolder(buildOutput.outputPath)
    }
  }

  // Handle clicking on an error to navigate to file/line
  const handleErrorClick = async (error: BuildError) => {
    // Extract just the filename from the path for comparison
    const errorFileName = error.file.split(/[/\\]/).pop() || error.file

    // Check if this is a temporary/in-memory model (Monaco creates these for unsaved files)
    // Pattern: t-<timestamp>-<random> with no path separators or file extension
    const isTempModel = /^t-\d+-[a-z0-9]+$/i.test(errorFileName) && !error.file.includes('/') && !error.file.includes('\\')

    // Try to find existing tab with this file
    // Match by: exact path, ends with path, or matching filename
    const existingTab = tabs.find(tab => {
      const tabFileName = tab.name.split(/[/\\]/).pop() || tab.name

      // For temp models, check if tab ID contains the model identifier
      if (isTempModel) {
        return tab.id.includes(errorFileName) || tab.id === errorFileName
      }

      return (
        tab.name === error.file ||
        tab.name.endsWith('/' + error.file) ||
        tab.name.endsWith('\\' + error.file) ||
        error.file.endsWith('/' + tab.name) ||
        error.file.endsWith('\\' + tab.name) ||
        tabFileName === errorFileName
      )
    })

    if (existingTab) {
      activateTab(existingTab.id)
      // Jump to the error line if specified
      if (error.line && error.line > 0) {
        // Small delay to ensure tab switch completes
        setTimeout(() => {
          setJumpTo({ line: error.line!, column: error.column || 1 })
        }, 50)
      }
      return
    }

    // For temp models that weren't matched to a tab, just jump to line in active tab
    // since the error is likely for the currently edited content
    if (isTempModel) {
      if (error.line && error.line > 0) {
        setJumpTo({ line: error.line, column: error.column || 1 })
      }
      return
    }

    // Try to open the file - first try as full path via Electron API
    const electronAPI = (window as typeof window & { electronAPI?: { readFile?: (path: string) => Promise<{ success: boolean; content?: string; error?: string }> } }).electronAPI

    if (electronAPI?.readFile) {
      try {
        const result = await electronAPI.readFile(error.file)
        if (result.success && result.content !== undefined) {
          // Dispatch custom event to open file in App.tsx
          window.dispatchEvent(new CustomEvent('open-file-from-error', {
            detail: {
              filePath: error.file,
              fileName: errorFileName,
              content: result.content,
              line: error.line,
              column: error.column
            }
          }))
          return
        }
      } catch (err) {
        console.error('[BuildOutputPanel] Error reading file:', err)
      }
    }

    // Fallback to onOpenFile callback (for relative paths)
    if (onOpenFile) {
      onOpenFile(error.file, error.line)
    }
  }

  // Calculate left position based on sidebar state
  const leftPosition = showSidebar ? 48 + sidebarWidth : 48

  const errorCount = buildOutput.errors?.length || 0

  return (
    <div
      className={`build-output-panel-docked ${isResizing ? 'resizing' : ''}`}
      style={{ left: leftPosition, height: isExpanded ? panelHeight : 'auto' }}
    >
      {/* Resize handle on top edge */}
      <div
        className="build-output-resize-handle"
        onMouseDown={handleResizeMouseDown}
      />
      {/* Header bar - always visible */}
      <div className="build-output-header">
        <div className="build-output-title" onClick={() => setIsExpanded(!isExpanded)}>
          {buildOutput.status === 'building' && (
            <Loader size={14} className="animate-spin" style={{ color: 'var(--accent)' }} />
          )}
          {buildOutput.status === 'success' && (
            <CheckCircle size={14} style={{ color: 'var(--success)' }} />
          )}
          {buildOutput.status === 'error' && (
            <AlertCircle size={14} style={{ color: 'var(--error)' }} />
          )}
          <span>Output</span>
          {hasErrors && (
            <span className="build-output-error-count">{errorCount}</span>
          )}
        </div>
        <div className="build-output-actions">
          <button
            className="build-output-action"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Minimize panel' : 'Expand panel'}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
          <button
            className={`build-output-action ${isPinned ? 'active' : ''}`}
            onClick={() => setBuildPanelPinned(!isPinned)}
            title={isPinned ? 'Unpin panel (will auto-hide on editor focus)' : 'Pin panel (keep visible)'}
          >
            {isPinned ? <Pin size={14} /> : <PinOff size={14} />}
          </button>
          <button
            className="build-output-action"
            onClick={() => {
              clearBuildOutput()
              setShowBuildPanel(false)
            }}
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Expandable content */}
      {isExpanded && (
        <div className="build-output-content">
          {/* Building status */}
          {buildOutput.status === 'building' && (
            <div className="build-output-status-message">
              <Loader size={16} className="animate-spin" />
              <span>{buildOutput.message}</span>
            </div>
          )}

          {/* Success message */}
          {buildOutput.status === 'success' && (
            <div className="build-output-success-content">
              <div className="build-output-status-message success">
                <CheckCircle size={16} />
                <span>{buildOutput.message}</span>
              </div>
              {/* Package build details (fileName, fileCount, size) */}
              <div className="build-output-details-grid">
                {buildOutput.fileName && (
                  <div className="build-output-detail">
                    <Package size={12} />
                    <span>{buildOutput.fileName}</span>
                    {buildOutput.outputPath && (
                      <button
                        className="build-output-detail-action"
                        onClick={handleOpenFolder}
                        title="Show in folder"
                      >
                        <FolderOpen size={12} />
                      </button>
                    )}
                  </div>
                )}
                {buildOutput.fileCount !== undefined && (
                  <div className="build-output-detail">
                    <span>{buildOutput.fileCount} files</span>
                  </div>
                )}
                {buildOutput.size !== undefined && (
                  <div className="build-output-detail">
                    <span>{formatSize(buildOutput.size)}</span>
                  </div>
                )}
              </div>
              {/* Raw output toggle for package builds */}
              {buildOutput.details && buildOutput.fileName && (
                <details className="build-output-raw-details">
                  <summary>Raw Output</summary>
                  <pre>{buildOutput.details}</pre>
                </details>
              )}
              {/* Command output (from /validate, /explain, etc.) - show inline without toggle */}
              {buildOutput.details && !buildOutput.fileName && (
                <div className="build-output-command-details">
                  <pre>{buildOutput.details}</pre>
                </div>
              )}
            </div>
          )}

          {/* Error list - clickable items */}
          {buildOutput.status === 'error' && (
            <div className="build-output-error-content">
              {/* Show structured errors if available */}
              {buildOutput.errors && buildOutput.errors.length > 0 ? (
                <div className="build-output-error-list">
                  {buildOutput.errors.map((error, index) => {
                    // Extract just the filename for display, keep full path for navigation
                    const displayFileName = error.file.split(/[/\\]/).pop() || error.file
                    return (
                      <div
                        key={index}
                        className="build-output-error-item"
                        onClick={() => handleErrorClick(error)}
                        title={`Click to open ${error.file}${error.line ? `:${error.line}` : ''}`}
                      >
                        <FileWarning size={14} className="error-icon" />
                        <span className="error-file">
                          {displayFileName}
                          {error.line && <span className="error-location">:{error.line}</span>}
                        </span>
                        <span className="error-message">{error.message}</span>
                        <ExternalLink size={12} className="error-link-icon" />
                      </div>
                    )
                  })}
                </div>
              ) : (
                /* Fallback to details string */
                buildOutput.details && (
                  <div className="build-output-error-details">
                    <pre>{buildOutput.details}</pre>
                  </div>
                )
              )}

              {/* Show raw details below error list if both exist */}
              {buildOutput.errors && buildOutput.errors.length > 0 && buildOutput.details && (
                <details className="build-output-raw-details">
                  <summary>Raw Output</summary>
                  <pre>{buildOutput.details}</pre>
                </details>
              )}
            </div>
          )}

          {/* Timestamp footer */}
          {buildOutput.timestamp && (
            <div className="build-output-footer">
              <span className="build-output-timestamp">{formatTime(buildOutput.timestamp)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default BuildOutputPanel

import { useState, useCallback, useEffect, useRef } from 'react'
import { CheckCircle, AlertCircle, AlertTriangle, Loader, Package, FolderOpen, FileWarning, ExternalLink, Copy, ClipboardList, FileCode } from 'lucide-react'
import { useUIStore, selectBuildOutput } from '../../stores/uiStore'
import { useEditorStore } from '../../stores/editorStore'
import type { BuildError } from '../../stores/types'

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  error: BuildError | null
  displayFileName: string
}

interface BuildOutputPanelProps {
  onOpenFile?: (filePath: string, line?: number) => void
  embedded?: boolean // When true, panel is embedded in tabs (parent handles all controls)
  errorsOnly?: boolean // When true, only show error list (for Errors tab)
}

/**
 * Build Output Panel - Shows build status and errors
 * Features clickable error links that navigate to file/line
 * When embedded=true, parent BottomPanelTabs handles all controls/visibility
 */
export function BuildOutputPanel({ onOpenFile, embedded = false, errorsOnly = false }: BuildOutputPanelProps) {
  const buildOutput = useUIStore(selectBuildOutput)

  // Editor store for opening files and jumping to lines
  const activateTab = useEditorStore(state => state.activateTab)
  const setJumpTo = useEditorStore(state => state.setJumpTo)
  const tabs = useEditorStore(state => state.tabs)
  const activeTabId = useEditorStore(state => state.activeTabId)
  const updateTab = useEditorStore(state => state.updateTab)

  // Severity filter toggles (for errorsOnly mode)
  const [showErrors, setShowErrors] = useState(true)
  const [showWarnings, setShowWarnings] = useState(true)

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false, x: 0, y: 0, error: null, displayFileName: ''
  })
  const contextMenuRef = useRef<HTMLDivElement>(null)

  // Close context menu on click outside or Escape
  useEffect(() => {
    if (!contextMenu.visible) return
    const handleClose = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(prev => ({ ...prev, visible: false }))
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(prev => ({ ...prev, visible: false }))
    }
    document.addEventListener('mousedown', handleClose)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClose)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [contextMenu.visible])

  const handleErrorContextMenu = useCallback((e: React.MouseEvent, error: BuildError, displayFileName: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, error, displayFileName })
  }, [])

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Fallback for clipboard access issues
      const textarea = document.createElement('textarea')
      textarea.value = text
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    setContextMenu(prev => ({ ...prev, visible: false }))
  }, [])

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
      // Check if this is a workflow file (.pdflow)
      const isWorkflowFile = existingTab.name.endsWith('.pdflow')

      // For workflow files, switch to code view first
      if (isWorkflowFile && existingTab.viewMode !== 'code') {
        updateTab(existingTab.id, { viewMode: 'code' })
      }

      activateTab(existingTab.id)

      // Jump to the error line if specified
      if (error.line && error.line > 0) {
        // Small delay to ensure tab switch and view mode change complete
        setTimeout(() => {
          setJumpTo({ line: error.line!, column: error.column || 1 })
        }, isWorkflowFile ? 100 : 50)
      }
      return
    }

    // For temp models that weren't matched to a tab, just jump to line in active tab
    // since the error is likely for the currently edited content
    if (isTempModel) {
      // If the active tab is a workflow file, switch to code view first
      if (activeTabId) {
        const activeTab = tabs.find(t => t.id === activeTabId)
        if (activeTab?.name.endsWith('.pdflow') && activeTab.viewMode !== 'code') {
          updateTab(activeTabId, { viewMode: 'code' })
          setTimeout(() => {
            if (error.line && error.line > 0) {
              setJumpTo({ line: error.line, column: error.column || 1 })
            }
          }, 100)
          return
        }
      }

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

  // Compute severity counts for the filter bar
  const allErrors = buildOutput.errors || []
  const errorCount = allErrors.filter(e => !e.severity || e.severity === 'error').length
  const warningCount = allErrors.filter(e => e.severity === 'warning').length
  const infoCount = allErrors.filter(e => e.severity === 'info' || e.severity === 'hint').length

  // Filter errors based on toggles (only when errorsOnly mode)
  const filteredErrors = errorsOnly ? allErrors.filter(e => {
    const sev = e.severity || 'error'
    if (sev === 'error') return showErrors
    if (sev === 'warning') return showWarnings
    // info/hint always shown when warnings are shown
    return showWarnings
  }) : allErrors

  return (
    <div className="build-output-content" style={{ height: embedded ? '100%' : 'auto' }}>
          {/* Severity filter toggles (errorsOnly mode) */}
          {errorsOnly && (errorCount > 0 || warningCount > 0) && (
            <div className="build-output-filter-bar">
              <button
                className={`build-output-filter-btn ${showErrors ? 'active' : ''}`}
                onClick={() => setShowErrors(!showErrors)}
                title={showErrors ? 'Hide errors' : 'Show errors'}
              >
                <AlertCircle size={12} />
                <span>{errorCount}</span>
              </button>
              <button
                className={`build-output-filter-btn warning ${showWarnings ? 'active' : ''}`}
                onClick={() => setShowWarnings(!showWarnings)}
                title={showWarnings ? 'Hide warnings' : 'Show warnings'}
              >
                <AlertTriangle size={12} />
                <span>{warningCount + infoCount}</span>
              </button>
            </div>
          )}

          {/* Building status */}
          {!errorsOnly && buildOutput.status === 'building' && (
            <div className="build-output-status-message">
              <Loader size={16} className="animate-spin" />
              <span>{buildOutput.message}</span>
            </div>
          )}

          {/* Success message */}
          {!errorsOnly && buildOutput.status === 'success' && (
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
              {filteredErrors.length > 0 ? (
                <div className="build-output-error-list">
                  {filteredErrors.map((error, index) => {
                    // Extract filename from path (handles both Unix and Windows paths)
                    const errorFileName = error.file ? (error.file.split(/[/\\]/).pop() || error.file) : 'Unknown'

                    // Check if this is a temporary/in-memory model (Monaco creates these for unsaved files)
                    // Pattern: t-<timestamp>-<random> with no path separators
                    const isTempModel = /^t-\d+-[a-z0-9]+$/i.test(errorFileName) && !error.file.includes('/') && !error.file.includes('\\')

                    // Determine display name
                    let displayFileName = errorFileName

                    if (isTempModel) {
                      // For temp models, try to find the corresponding tab to get a friendly name
                      const matchingTab = tabs.find(tab =>
                        tab.id.includes(errorFileName) || tab.id === errorFileName
                      )
                      if (matchingTab) {
                        displayFileName = matchingTab.name.split(/[/\\]/).pop() || matchingTab.name || 'Untitled'
                      } else {
                        displayFileName = 'Untitled'
                      }
                    }
                    // For regular files, displayFileName is already set to errorFileName

                    return (
                      <div
                        key={index}
                        className="build-output-error-item"
                        onClick={() => handleErrorClick(error)}
                        onContextMenu={(e) => handleErrorContextMenu(e, error, displayFileName)}
                        title={`Click to open ${displayFileName}${error.line ? `:${error.line}` : ''} | Right-click for copy options`}
                      >
                        {error.severity === 'warning' || error.severity === 'info' || error.severity === 'hint'
                          ? <AlertTriangle size={14} className="warning-icon" />
                          : <FileWarning size={14} className="error-icon" />
                        }
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

          {/* Errors-only empty state */}
          {errorsOnly && buildOutput.status !== 'error' && (
            <div className="build-output-status-message success" style={{ padding: '12px 16px', opacity: 0.7 }}>
              <CheckCircle size={14} />
              <span>No errors</span>
            </div>
          )}

          {/* Timestamp footer */}
      {!errorsOnly && buildOutput.timestamp && (
        <div className="build-output-footer">
          <span className="build-output-timestamp">{formatTime(buildOutput.timestamp)}</span>
        </div>
      )}

      {/* Context menu for error items */}
      {contextMenu.visible && contextMenu.error && (
        <div
          ref={contextMenuRef}
          className="error-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            className="error-context-menu-item"
            onClick={() => copyToClipboard(contextMenu.error!.message)}
          >
            <Copy size={14} />
            <span>Copy Message</span>
          </button>
          <button
            className="error-context-menu-item"
            onClick={() => {
              const err = contextMenu.error!
              const location = err.line ? `${contextMenu.displayFileName}:${err.line}${err.column ? `:${err.column}` : ''}` : contextMenu.displayFileName
              copyToClipboard(`${location} - ${err.message}`)
            }}
          >
            <ClipboardList size={14} />
            <span>Copy Details</span>
          </button>
          <button
            className="error-context-menu-item"
            onClick={() => {
              const err = contextMenu.error!
              const location = err.line ? `${err.file}:${err.line}` : err.file
              copyToClipboard(location)
            }}
          >
            <FileCode size={14} />
            <span>Copy File Path</span>
          </button>
          {buildOutput.errors && buildOutput.errors.length > 1 && (
            <>
              <div className="error-context-menu-separator" />
              <button
                className="error-context-menu-item"
                onClick={() => {
                  const allErrors = buildOutput.errors!.map(err => {
                    const fileName = err.file ? (err.file.split(/[/\\]/).pop() || err.file) : 'Unknown'
                    const location = err.line ? `${fileName}:${err.line}` : fileName
                    return `${location} - ${err.message}`
                  }).join('\n')
                  copyToClipboard(allErrors)
                }}
              >
                <ClipboardList size={14} />
                <span>Copy All Errors</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default BuildOutputPanel

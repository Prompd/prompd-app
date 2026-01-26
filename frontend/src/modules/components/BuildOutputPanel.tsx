import { CheckCircle, AlertCircle, Loader, Package, FolderOpen, FileWarning, ExternalLink } from 'lucide-react'
import { useUIStore, selectBuildOutput } from '../../stores/uiStore'
import { useEditorStore } from '../../stores/editorStore'
import type { BuildError } from '../../stores/types'

interface BuildOutputPanelProps {
  onOpenFile?: (filePath: string, line?: number) => void
  embedded?: boolean // When true, panel is embedded in tabs (parent handles all controls)
}

/**
 * Build Output Panel - Shows build status and errors
 * Features clickable error links that navigate to file/line
 * When embedded=true, parent BottomPanelTabs handles all controls/visibility
 */
export function BuildOutputPanel({ onOpenFile, embedded = false }: BuildOutputPanelProps) {
  const buildOutput = useUIStore(selectBuildOutput)

  // Editor store for opening files and jumping to lines
  const activateTab = useEditorStore(state => state.activateTab)
  const setJumpTo = useEditorStore(state => state.setJumpTo)
  const tabs = useEditorStore(state => state.tabs)
  const activeTabId = useEditorStore(state => state.activeTabId)
  const updateTab = useEditorStore(state => state.updateTab)

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

  return (
    <div className="build-output-content" style={{ height: embedded ? '100%' : 'auto' }}>
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
                        title={`Click to open ${displayFileName}${error.line ? `:${error.line}` : ''}`}
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
  )
}

export default BuildOutputPanel

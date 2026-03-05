/**
 * PackageBuildHistory - Shows history of package builds in the Packages tab
 * Each successful build entry can be clicked to open LocalPackageModal
 */

import { useCallback } from 'react'
import { Package, CheckCircle, AlertCircle, FolderOpen, Trash2 } from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'
import type { PackageBuildRecord } from '../../stores/types'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString()
}

function formatDate(timestamp: number): string {
  const now = new Date()
  const date = new Date(timestamp)
  if (date.toDateString() === now.toDateString()) {
    return `Today ${formatTime(timestamp)}`
  }
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday ${formatTime(timestamp)}`
  }
  return `${date.toLocaleDateString()} ${formatTime(timestamp)}`
}

export function PackageBuildHistory() {
  const packageBuildHistory = useUIStore(state => state.packageBuildHistory)
  const clearPackageBuildHistory = useUIStore(state => state.clearPackageBuildHistory)

  const handleOpenPackage = useCallback((record: PackageBuildRecord) => {
    if (record.status === 'success' && record.outputPath) {
      window.dispatchEvent(new CustomEvent('open-local-package', {
        detail: { outputPath: record.outputPath }
      }))
    }
  }, [])

  const handleShowInFolder = useCallback((e: React.MouseEvent, outputPath: string) => {
    e.stopPropagation()
    if (window.electronAPI?.showItemInFolder) {
      window.electronAPI.showItemInFolder(outputPath)
    }
  }, [])

  if (packageBuildHistory.length === 0) {
    return (
      <div className="build-output-content" style={{ height: '100%' }}>
        <div className="build-output-status-message" style={{ padding: '16px', opacity: 0.6 }}>
          <Package size={16} />
          <span>No package builds yet</span>
        </div>
      </div>
    )
  }

  return (
    <div className="build-output-content" style={{ height: '100%', overflow: 'auto' }}>
      {/* Header with clear button */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 8px', borderBottom: '1px solid var(--border-color, #333)'
      }}>
        <span style={{ fontSize: '11px', opacity: 0.6 }}>
          {packageBuildHistory.length} build{packageBuildHistory.length !== 1 ? 's' : ''}
        </span>
        <button
          className="bottom-panel-action"
          onClick={clearPackageBuildHistory}
          title="Clear build history"
          style={{ padding: '2px 4px' }}
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Build records list */}
      <div style={{ padding: '4px 0' }}>
        {packageBuildHistory.map((record) => (
          <div
            key={record.id}
            className="build-output-error-item"
            onClick={() => handleOpenPackage(record)}
            style={{
              cursor: record.status === 'success' && record.outputPath ? 'pointer' : 'default',
              padding: '6px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
            title={
              record.status === 'success' && record.outputPath
                ? 'Click to inspect package'
                : record.message
            }
          >
            {record.status === 'success' ? (
              <CheckCircle size={14} style={{ color: 'var(--success-color, #4ade80)', flexShrink: 0 }} />
            ) : (
              <AlertCircle size={14} style={{ color: 'var(--error-color, #f87171)', flexShrink: 0 }} />
            )}

            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {record.fileName && (
                  <span style={{ fontSize: '12px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {record.fileName}
                  </span>
                )}
                {!record.fileName && (
                  <span style={{ fontSize: '12px', fontWeight: 500 }}>
                    {record.status === 'error' ? 'Build failed' : 'Package built'}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', opacity: 0.6 }}>
                <span>{formatDate(record.timestamp)}</span>
                {record.fileCount !== undefined && <span>{record.fileCount} files</span>}
                {record.size !== undefined && <span>{formatSize(record.size)}</span>}
                {record.status === 'error' && record.errors && record.errors.length > 0 && (
                  <span>{record.errors.length} error{record.errors.length !== 1 ? 's' : ''}</span>
                )}
              </div>
            </div>

            {record.status === 'success' && record.outputPath && (
              <button
                className="bottom-panel-action"
                onClick={(e) => handleShowInFolder(e, record.outputPath!)}
                title="Show in folder"
                style={{ padding: '2px', flexShrink: 0 }}
              >
                <FolderOpen size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default PackageBuildHistory

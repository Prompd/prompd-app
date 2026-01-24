/**
 * RestoreStatePrompt - Shows in WelcomeView when a project has saved state
 * Allows user to accept or decline restoring previously open files
 */

import { RotateCcw, X, File, Clock } from 'lucide-react'
import type { WorkspaceState } from '../../stores/editorStore'

interface RestoreStatePromptProps {
  workspaceState: WorkspaceState
  onAccept: () => void
  onDecline: () => void
  onOpenFile?: (path: string) => void
  theme: 'light' | 'dark'
}

/**
 * Format relative time for last saved
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 7) {
    return new Date(timestamp).toLocaleDateString()
  } else if (days > 1) {
    return `${days} days ago`
  } else if (days === 1) {
    return 'Yesterday'
  } else if (hours > 1) {
    return `${hours} hours ago`
  } else if (hours === 1) {
    return '1 hour ago'
  } else if (minutes > 1) {
    return `${minutes} minutes ago`
  } else {
    return 'Just now'
  }
}

export default function RestoreStatePrompt({
  workspaceState,
  onAccept,
  onDecline,
  onOpenFile,
  theme
}: RestoreStatePromptProps) {
  const colors = theme === 'dark' ? {
    bg: 'rgba(99, 102, 241, 0.1)',
    border: 'rgba(99, 102, 241, 0.3)',
    text: '#e2e8f0',
    textMuted: '#94a3b8',
    textDim: '#64748b',
    fileBg: 'rgba(30, 41, 59, 0.5)',
    fileBorder: 'rgba(71, 85, 105, 0.3)',
    fileHoverBg: 'rgba(30, 41, 59, 0.8)',
    fileHoverBorder: 'rgba(99, 102, 241, 0.5)',
    acceptBg: '#6366f1',
    acceptHover: '#4f46e5',
    declineBg: 'rgba(71, 85, 105, 0.3)',
    declineHover: 'rgba(71, 85, 105, 0.5)'
  } : {
    bg: 'rgba(99, 102, 241, 0.08)',
    border: 'rgba(99, 102, 241, 0.2)',
    text: '#0f172a',
    textMuted: '#64748b',
    textDim: '#94a3b8',
    fileBg: 'rgba(248, 250, 252, 0.8)',
    fileBorder: 'rgba(226, 232, 240, 0.8)',
    fileHoverBg: '#ffffff',
    fileHoverBorder: 'rgba(99, 102, 241, 0.5)',
    acceptBg: '#6366f1',
    acceptHover: '#4f46e5',
    declineBg: 'rgba(226, 232, 240, 0.8)',
    declineHover: 'rgba(203, 213, 225, 0.8)'
  }

  const fileCount = workspaceState.openFiles.length

  return (
    <div
      style={{
        padding: '16px',
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: '10px',
        marginBottom: '24px'
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        marginBottom: '12px'
      }}>
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: '8px',
          background: 'rgba(99, 102, 241, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <RotateCcw size={16} style={{ color: '#6366f1' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: '14px',
            fontWeight: 600,
            color: colors.text
          }}>
            Restore Previous Session?
          </div>
          <div style={{
            fontSize: '12px',
            color: colors.textMuted,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '2px'
          }}>
            <Clock size={11} />
            Last saved {formatRelativeTime(workspaceState.lastSaved)}
          </div>
        </div>
      </div>

      {/* File List */}
      <div style={{
        marginBottom: '14px',
        maxHeight: '140px',
        overflowY: 'auto'
      }}>
        <div style={{
          fontSize: '11px',
          fontWeight: 600,
          color: colors.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '8px'
        }}>
          {fileCount} {fileCount === 1 ? 'File' : 'Files'} to restore
        </div>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
        }}>
          {workspaceState.openFiles.slice(0, 6).map((filePath) => (
            <div
              key={filePath}
              onClick={() => onOpenFile?.(filePath)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 10px',
                background: colors.fileBg,
                border: `1px solid ${colors.fileBorder}`,
                borderRadius: '6px',
                fontSize: '12px',
                cursor: onOpenFile ? 'pointer' : 'default',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                if (onOpenFile) {
                  e.currentTarget.style.background = colors.fileHoverBg
                  e.currentTarget.style.borderColor = colors.fileHoverBorder
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = colors.fileBg
                e.currentTarget.style.borderColor = colors.fileBorder
              }}
              title={onOpenFile ? `Open ${filePath}` : undefined}
            >
              <File size={14} style={{ color: '#6366f1', flexShrink: 0 }} />
              <span style={{
                color: colors.text,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {filePath}
              </span>
              {/* Show active indicator */}
              {workspaceState.activeFile === filePath && (
                <span style={{
                  fontSize: '10px',
                  color: '#6366f1',
                  background: 'rgba(99, 102, 241, 0.15)',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  marginLeft: 'auto',
                  flexShrink: 0
                }}>
                  active
                </span>
              )}
            </div>
          ))}
          {fileCount > 6 && (
            <div style={{
              fontSize: '11px',
              color: colors.textDim,
              padding: '4px 10px'
            }}>
              + {fileCount - 6} more {fileCount - 6 === 1 ? 'file' : 'files'}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{
        display: 'flex',
        gap: '10px'
      }}>
        <button
          onClick={onAccept}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '10px 16px',
            background: colors.acceptBg,
            border: 'none',
            borderRadius: '8px',
            color: 'white',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background 0.15s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = colors.acceptHover
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = colors.acceptBg
          }}
        >
          <RotateCcw size={14} />
          Restore Files
        </button>
        <button
          onClick={onDecline}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '10px 16px',
            background: colors.declineBg,
            border: 'none',
            borderRadius: '8px',
            color: colors.textMuted,
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background 0.15s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = colors.declineHover
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = colors.declineBg
          }}
        >
          <X size={14} />
          Dismiss
        </button>
      </div>
    </div>
  )
}

/**
 * FileChangesModal - Notifies user when open files have been modified externally
 */

import { AlertTriangle, RefreshCw, X, FileText } from 'lucide-react'

export interface ModifiedFile {
  tabId: string
  name: string
  newContent: string
}

interface FileChangesModalProps {
  isOpen: boolean
  modifiedFiles: ModifiedFile[]
  onReloadAll: () => void
  onReloadFile: (tabId: string) => void
  onKeepAll: () => void
  onClose: () => void
  theme: 'light' | 'dark'
}

export default function FileChangesModal({
  isOpen,
  modifiedFiles,
  onReloadAll,
  onReloadFile,
  onKeepAll,
  onClose,
  theme
}: FileChangesModalProps) {
  if (!isOpen || modifiedFiles.length === 0) return null

  const colors = theme === 'dark' ? {
    overlay: 'rgba(0, 0, 0, 0.6)',
    bg: '#1e293b',
    border: 'rgba(71, 85, 105, 0.5)',
    text: '#e2e8f0',
    textMuted: '#94a3b8',
    fileBg: 'rgba(30, 41, 59, 0.8)',
    fileBorder: 'rgba(71, 85, 105, 0.3)',
    warningBg: 'rgba(251, 191, 36, 0.1)',
    warningBorder: 'rgba(251, 191, 36, 0.3)',
    warningText: '#fbbf24',
    reloadBg: '#6366f1',
    reloadHover: '#4f46e5',
    reloadFileBg: 'rgba(99, 102, 241, 0.15)',
    reloadFileBorder: 'rgba(99, 102, 241, 0.3)',
    reloadFileHover: 'rgba(99, 102, 241, 0.25)',
    reloadFileText: '#818cf8',
    keepBg: 'rgba(71, 85, 105, 0.3)',
    keepHover: 'rgba(71, 85, 105, 0.5)'
  } : {
    overlay: 'rgba(0, 0, 0, 0.4)',
    bg: '#ffffff',
    border: 'rgba(226, 232, 240, 0.8)',
    text: '#0f172a',
    textMuted: '#64748b',
    fileBg: 'rgba(248, 250, 252, 0.8)',
    fileBorder: 'rgba(226, 232, 240, 0.8)',
    warningBg: 'rgba(251, 191, 36, 0.1)',
    warningBorder: 'rgba(251, 191, 36, 0.3)',
    warningText: '#d97706',
    reloadBg: '#6366f1',
    reloadHover: '#4f46e5',
    reloadFileBg: 'rgba(99, 102, 241, 0.1)',
    reloadFileBorder: 'rgba(99, 102, 241, 0.2)',
    reloadFileHover: 'rgba(99, 102, 241, 0.15)',
    reloadFileText: '#6366f1',
    keepBg: 'rgba(226, 232, 240, 0.8)',
    keepHover: 'rgba(203, 213, 225, 0.8)'
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: colors.overlay
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '480px',
          width: '90%',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Warning Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '16px',
            padding: '12px',
            background: colors.warningBg,
            border: `1px solid ${colors.warningBorder}`,
            borderRadius: '8px'
          }}
        >
          <AlertTriangle size={24} style={{ color: colors.warningText, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: colors.text }}>
              Files Modified Externally
            </div>
            <div style={{ fontSize: '13px', color: colors.textMuted, marginTop: '2px' }}>
              {modifiedFiles.length} open {modifiedFiles.length === 1 ? 'file has' : 'files have'} been changed
            </div>
          </div>
        </div>

        {/* File List */}
        <div
          style={{
            marginBottom: '20px',
            maxHeight: '240px',
            overflowY: 'auto'
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}
          >
            {modifiedFiles.slice(0, 10).map((file) => (
              <div
                key={file.tabId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  padding: '8px 12px',
                  background: colors.fileBg,
                  border: `1px solid ${colors.fileBorder}`,
                  borderRadius: '6px',
                  fontSize: '13px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                  <FileText size={14} style={{ color: '#6366f1', flexShrink: 0 }} />
                  <span
                    style={{
                      color: colors.text,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {file.name}
                  </span>
                </div>
                <button
                  onClick={() => onReloadFile(file.tabId)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    background: colors.reloadFileBg,
                    border: `1px solid ${colors.reloadFileBorder}`,
                    borderRadius: '4px',
                    color: colors.reloadFileText,
                    fontSize: '11px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                    flexShrink: 0
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = colors.reloadFileHover
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = colors.reloadFileBg
                  }}
                >
                  <RefreshCw size={11} />
                  Reload
                </button>
              </div>
            ))}
            {modifiedFiles.length > 10 && (
              <div
                style={{
                  fontSize: '12px',
                  color: colors.textMuted,
                  padding: '4px 12px'
                }}
              >
                + {modifiedFiles.length - 10} more {modifiedFiles.length - 10 === 1 ? 'file' : 'files'}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}
        >
          {/* Reload All - Primary */}
          <button
            onClick={onReloadAll}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '12px 20px',
              background: colors.reloadBg,
              border: 'none',
              borderRadius: '8px',
              color: 'white',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.15s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = colors.reloadHover
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = colors.reloadBg
            }}
          >
            <RefreshCw size={16} />
            Reload All Files
          </button>

          {/* Secondary Row */}
          <div style={{ display: 'flex', gap: '10px' }}>
            {/* Keep Current */}
            <button
              onClick={onKeepAll}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '10px 16px',
                background: colors.keepBg,
                border: 'none',
                borderRadius: '8px',
                color: colors.textMuted,
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = colors.keepHover
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = colors.keepBg
              }}
            >
              Keep Current Version
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '10px 16px',
                background: colors.keepBg,
                border: 'none',
                borderRadius: '8px',
                color: colors.textMuted,
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = colors.keepHover
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = colors.keepBg
              }}
            >
              <X size={14} />
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
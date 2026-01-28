/**
 * CloseWorkspaceDialog - Prompts user to save unsaved files before closing workspace
 */

import { AlertTriangle, Save, X, FileText } from 'lucide-react'

interface UnsavedFile {
  id: string
  name: string
}

interface CloseWorkspaceDialogProps {
  isOpen: boolean
  unsavedFiles: UnsavedFile[]
  onSaveAll: () => void
  onDiscardAll: () => void
  onCancel: () => void
  theme: 'light' | 'dark'
}

export default function CloseWorkspaceDialog({
  isOpen,
  unsavedFiles,
  onSaveAll,
  onDiscardAll,
  onCancel,
  theme
}: CloseWorkspaceDialogProps) {
  if (!isOpen) return null

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
    saveBg: '#6366f1',
    saveHover: '#4f46e5',
    discardBg: 'rgba(239, 68, 68, 0.15)',
    discardBorder: 'rgba(239, 68, 68, 0.3)',
    discardHover: 'rgba(239, 68, 68, 0.25)',
    discardText: '#f87171',
    cancelBg: 'rgba(71, 85, 105, 0.3)',
    cancelHover: 'rgba(71, 85, 105, 0.5)'
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
    saveBg: '#6366f1',
    saveHover: '#4f46e5',
    discardBg: 'rgba(239, 68, 68, 0.1)',
    discardBorder: 'rgba(239, 68, 68, 0.2)',
    discardHover: 'rgba(239, 68, 68, 0.15)',
    discardText: '#dc2626',
    cancelBg: 'rgba(226, 232, 240, 0.8)',
    cancelHover: 'rgba(203, 213, 225, 0.8)'
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
      onClick={onCancel}
    >
      <div
        style={{
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '420px',
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
              Unsaved Changes
            </div>
            <div style={{ fontSize: '13px', color: colors.textMuted, marginTop: '2px' }}>
              {unsavedFiles.length} {unsavedFiles.length === 1 ? 'file has' : 'files have'} unsaved changes
            </div>
          </div>
        </div>

        {/* File List */}
        <div
          style={{
            marginBottom: '20px',
            maxHeight: '180px',
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
            {unsavedFiles.slice(0, 8).map((file) => (
              <div
                key={file.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  background: colors.fileBg,
                  border: `1px solid ${colors.fileBorder}`,
                  borderRadius: '6px',
                  fontSize: '13px'
                }}
              >
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
            ))}
            {unsavedFiles.length > 8 && (
              <div
                style={{
                  fontSize: '12px',
                  color: colors.textMuted,
                  padding: '4px 12px'
                }}
              >
                + {unsavedFiles.length - 8} more {unsavedFiles.length - 8 === 1 ? 'file' : 'files'}
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
          {/* Save All - Primary */}
          <button
            onClick={onSaveAll}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '12px 20px',
              background: colors.saveBg,
              border: 'none',
              borderRadius: '8px',
              color: 'white',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.15s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = colors.saveHover
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = colors.saveBg
            }}
          >
            <Save size={16} />
            Save All & Close
          </button>

          {/* Secondary Row */}
          <div style={{ display: 'flex', gap: '10px' }}>
            {/* Discard */}
            <button
              onClick={onDiscardAll}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '10px 16px',
                background: colors.discardBg,
                border: `1px solid ${colors.discardBorder}`,
                borderRadius: '8px',
                color: colors.discardText,
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = colors.discardHover
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = colors.discardBg
              }}
            >
              <X size={14} />
              Discard & Close
            </button>

            {/* Cancel */}
            <button
              onClick={onCancel}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '10px 16px',
                background: colors.cancelBg,
                border: 'none',
                borderRadius: '8px',
                color: colors.textMuted,
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = colors.cancelHover
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = colors.cancelBg
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * WorkflowSettingsDialog - Modal dialog for editing workflow metadata
 *
 * Allows editing of workflow-level properties like name, description, and version.
 */

import { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, FileJson } from 'lucide-react'

interface WorkflowSettingsDialogProps {
  /** Current workflow name */
  name: string
  /** Current workflow description */
  description: string
  /** Current workflow version */
  version: string
  /** Workflow ID (read-only) */
  workflowId: string
  /** Callback when settings are saved */
  onSave: (settings: { name: string; description: string; version: string }) => void
  /** Callback to close dialog */
  onClose: () => void
}

export function WorkflowSettingsDialog({
  name,
  description,
  version,
  workflowId,
  onSave,
  onClose,
}: WorkflowSettingsDialogProps) {
  const [editedName, setEditedName] = useState(name)
  const [editedDescription, setEditedDescription] = useState(description)
  const [editedVersion, setEditedVersion] = useState(version)

  const handleSave = useCallback(() => {
    onSave({
      name: editedName,
      description: editedDescription,
      version: editedVersion,
    })
    onClose()
  }, [editedName, editedDescription, editedVersion, onSave, onClose])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose()
      }
    },
    [onClose]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'Enter' && e.ctrlKey) {
        handleSave()
      }
    },
    [onClose, handleSave]
  )

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div
        style={{
          background: 'var(--panel)',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          width: '520px',
          maxWidth: '90vw',
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '6px',
                background: 'color-mix(in srgb, var(--accent) 20%, transparent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent)',
              }}
            >
              <FileJson style={{ width: 16, height: 16 }} />
            </div>
            <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
              Workflow Settings
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '6px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--muted)',
              borderRadius: '4px',
            }}
            title="Close (Esc)"
          >
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            padding: '20px',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* Workflow ID (read-only) */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--text)',
                marginBottom: '6px',
              }}
            >
              Workflow ID
            </label>
            <input
              type="text"
              value={workflowId}
              readOnly
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid var(--input-border)',
                borderRadius: '6px',
                background: 'var(--panel-2)',
                color: 'var(--muted)',
                fontSize: '13px',
                fontFamily: 'monospace',
                cursor: 'not-allowed',
              }}
            />
          </div>

          {/* Name */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--text)',
                marginBottom: '6px',
              }}
            >
              Name
            </label>
            <input
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              placeholder="My Workflow"
              autoFocus
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid var(--input-border)',
                borderRadius: '6px',
                background: 'var(--input-bg)',
                color: 'var(--text)',
                fontSize: '14px',
              }}
            />
          </div>

          {/* Description */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--text)',
                marginBottom: '6px',
              }}
            >
              Description
            </label>
            <textarea
              value={editedDescription}
              onChange={(e) => setEditedDescription(e.target.value)}
              placeholder="Describe what this workflow does..."
              rows={4}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid var(--input-border)',
                borderRadius: '6px',
                background: 'var(--input-bg)',
                color: 'var(--text)',
                fontSize: '14px',
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Version */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--text)',
                marginBottom: '6px',
              }}
            >
              Version
            </label>
            <input
              type="text"
              value={editedVersion}
              onChange={(e) => setEditedVersion(e.target.value)}
              placeholder="1.0"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid var(--input-border)',
                borderRadius: '6px',
                background: 'var(--input-bg)',
                color: 'var(--text)',
                fontSize: '14px',
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderTop: '1px solid var(--border)',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
            Press Ctrl+Enter to save, Esc to cancel
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                cursor: 'pointer',
                color: 'var(--text)',
                fontSize: '13px',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              style={{
                padding: '8px 20px',
                background: 'var(--accent)',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                color: 'white',
                fontSize: '13px',
                fontWeight: 500,
              }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

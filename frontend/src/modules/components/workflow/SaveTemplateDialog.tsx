/**
 * SaveTemplateDialog
 *
 * Modal dialog for naming and saving a workflow node as a reusable template.
 * Follows the same pattern as WorkflowSettingsDialog.
 */

import { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Save } from 'lucide-react'
import type { TemplateScope } from '../../services/nodeTemplateTypes'

interface SaveTemplateDialogProps {
  /** Display name of the node type (e.g., "Prompt", "Loop") */
  nodeTypeLabel: string
  /** Default template name (pre-filled from node label) */
  defaultName: string
  /** Callback when save is clicked */
  onSave: (name: string, description: string, scope: TemplateScope) => void
  /** Callback to close the dialog */
  onClose: () => void
}

export function SaveTemplateDialog({
  nodeTypeLabel,
  defaultName,
  onSave,
  onClose,
}: SaveTemplateDialogProps) {
  const [name, setName] = useState(defaultName)
  const [description, setDescription] = useState('')
  const [scope, setScope] = useState<TemplateScope>('workspace')

  const handleSave = useCallback(() => {
    if (!name.trim()) return
    onSave(name.trim(), description.trim(), scope)
  }, [name, description, scope, onSave])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
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
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          width: 460,
          maxWidth: '90vw',
          maxHeight: '90vh',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Save size={15} color="var(--accent)" />
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
              Save {nodeTypeLabel} as Template
            </span>
          </div>
          <button
            onClick={onClose}
            title="Close (Esc)"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              color: 'var(--muted)',
              display: 'flex',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Name */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--text)',
                marginBottom: 6,
              }}
            >
              Template Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="e.g. Research Agent, API Call Template"
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'var(--input-bg)',
                border: '1px solid var(--input-border)',
                borderRadius: 6,
                color: 'var(--text)',
                fontSize: 13,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Description */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--text)',
                marginBottom: 6,
              }}
            >
              Description
              <span style={{ color: 'var(--muted)', fontWeight: 400, marginLeft: 4 }}>
                (optional)
              </span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Brief description of what this template does"
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'var(--input-bg)',
                border: '1px solid var(--input-border)',
                borderRadius: 6,
                color: 'var(--text)',
                fontSize: 13,
                outline: 'none',
                resize: 'vertical',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Scope toggle */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--text)',
                marginBottom: 6,
              }}
            >
              Save Location
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setScope('workspace')}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: scope === 'workspace'
                    ? 'color-mix(in srgb, var(--accent) 15%, transparent)'
                    : 'var(--input-bg)',
                  border: `1px solid ${scope === 'workspace' ? 'var(--accent)' : 'var(--input-border)'}`,
                  borderRadius: 6,
                  color: scope === 'workspace' ? 'var(--accent)' : 'var(--text)',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontWeight: scope === 'workspace' ? 500 : 400,
                }}
              >
                Workspace
              </button>
              <button
                onClick={() => setScope('user')}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: scope === 'user'
                    ? 'color-mix(in srgb, var(--accent) 15%, transparent)'
                    : 'var(--input-bg)',
                  border: `1px solid ${scope === 'user' ? 'var(--accent)' : 'var(--input-border)'}`,
                  borderRadius: 6,
                  color: scope === 'user' ? 'var(--accent)' : 'var(--text)',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontWeight: scope === 'user' ? 500 : 400,
                }}
              >
                Global
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              {scope === 'workspace'
                ? 'Saved to .prompd/templates/ in this workspace'
                : 'Saved to ~/.prompd/templates/ for use in any workspace'}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Ctrl+Enter to save</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text)',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!name.trim()}
              style={{
                padding: '8px 16px',
                background: name.trim() ? 'var(--accent)' : 'var(--muted)',
                border: 'none',
                borderRadius: 6,
                color: 'white',
                fontSize: 13,
                fontWeight: 500,
                cursor: name.trim() ? 'pointer' : 'not-allowed',
                opacity: name.trim() ? 1 : 0.5,
              }}
            >
              Save Template
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

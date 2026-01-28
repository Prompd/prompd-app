/**
 * CronEditorDialog - Modal dialog for editing cron expressions
 *
 * Provides a clean modal interface for the CronInput component,
 * keeping the properties panel compact while still offering
 * full cron editing capabilities.
 */

import { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Calendar } from 'lucide-react'
import { CronInput } from './CronInput'

interface CronEditorDialogProps {
  /** Current cron expression value */
  value: string
  /** Callback when value is saved */
  onSave: (value: string) => void
  /** Callback to close dialog */
  onClose: () => void
  /** Optional title */
  title?: string
}

export function CronEditorDialog({
  value,
  onSave,
  onClose,
  title = 'Edit Cron Schedule',
}: CronEditorDialogProps) {
  const [cronValue, setCronValue] = useState(value)

  const handleSave = useCallback(() => {
    onSave(cronValue)
    onClose()
  }, [cronValue, onSave, onClose])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose()
      }
    },
    [onClose]
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
    >
      <div
        style={{
          background: 'var(--panel)',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          width: '720px',
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
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--panel-2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Calendar style={{ width: 18, height: 18, color: 'var(--accent)' }} />
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
              {title}
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              padding: '4px',
              cursor: 'pointer',
              color: 'var(--muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            title="Close"
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
          }}
        >
          <CronInput value={cronValue} onChange={setCronValue} showMessage={true} />
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            gap: '8px',
            justifyContent: 'flex-end',
            background: 'var(--panel-2)',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: 'var(--input-bg)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--text)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '8px 16px',
              background: 'var(--accent)',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
              color: 'white',
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

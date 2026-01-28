/**
 * ConfirmDialog - Reusable confirmation dialog component
 *
 * Use this instead of window.confirm() which doesn't work in Electron.
 * Provides a consistent UI for all confirmation dialogs across the app.
 */

import { useEffect, useRef } from 'react'

export interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  confirmVariant?: 'danger' | 'primary' | 'warning'
  onConfirm: () => void
  onCancel: () => void
  theme?: 'light' | 'dark'
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'danger',
  onConfirm,
  onCancel,
  theme = 'dark'
}: ConfirmDialogProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  // Auto-focus confirm button when dialog opens
  useEffect(() => {
    if (isOpen && confirmButtonRef.current) {
      confirmButtonRef.current.focus()
    }
  }, [isOpen])

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
      } else if (e.key === 'Enter') {
        onConfirm()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onCancel, onConfirm])

  if (!isOpen) return null

  const getConfirmButtonStyles = () => {
    const base = {
      padding: '8px 16px',
      border: 'none',
      borderRadius: '6px',
      color: 'white',
      cursor: 'pointer',
      fontWeight: 500 as const,
      fontSize: '14px',
      transition: 'opacity 0.2s'
    }

    switch (confirmVariant) {
      case 'danger':
        return { ...base, background: 'var(--error, #ef4444)' }
      case 'warning':
        return { ...base, background: 'var(--warning, #f59e0b)' }
      case 'primary':
      default:
        return { ...base, background: 'var(--accent, #6366f1)' }
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: 'var(--panel-2, #1e1e2e)',
          border: '1px solid var(--border, #333)',
          borderRadius: 12,
          padding: '20px',
          minWidth: '320px',
          maxWidth: '480px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{
          margin: '0 0 12px 0',
          fontSize: '16px',
          fontWeight: 600,
          color: 'var(--foreground, #fff)'
        }}>
          {title}
        </h3>
        <p style={{
          margin: '0 0 20px 0',
          fontSize: '14px',
          color: 'var(--text-muted, #888)',
          lineHeight: 1.5
        }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              border: '1px solid var(--border, #333)',
              borderRadius: '6px',
              color: 'var(--foreground, #fff)',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--hover, rgba(255,255,255,0.1))'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            onClick={onConfirm}
            style={getConfirmButtonStyles()}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.9'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1'
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Hook for managing confirm dialog state
 *
 * Usage:
 * ```tsx
 * const { showConfirm, ConfirmDialogComponent } = useConfirmDialog()
 *
 * const handleDelete = async () => {
 *   const confirmed = await showConfirm({
 *     title: 'Delete Section',
 *     message: 'Are you sure you want to delete this section?',
 *     confirmLabel: 'Delete',
 *     confirmVariant: 'danger'
 *   })
 *   if (confirmed) {
 *     // perform delete
 *   }
 * }
 *
 * return (
 *   <>
 *     <button onClick={handleDelete}>Delete</button>
 *     <ConfirmDialogComponent />
 *   </>
 * )
 * ```
 */
import { useState, useCallback } from 'react'

interface ShowConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  confirmVariant?: 'danger' | 'primary' | 'warning'
}

interface ConfirmDialogState extends ShowConfirmOptions {
  resolve: (value: boolean) => void
}

export function useConfirmDialog(theme?: 'light' | 'dark') {
  const [dialogState, setDialogState] = useState<ConfirmDialogState | null>(null)

  const showConfirm = useCallback((options: ShowConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialogState({ ...options, resolve })
    })
  }, [])

  const handleConfirm = useCallback(() => {
    if (dialogState) {
      dialogState.resolve(true)
      setDialogState(null)
    }
  }, [dialogState])

  const handleCancel = useCallback(() => {
    if (dialogState) {
      dialogState.resolve(false)
      setDialogState(null)
    }
  }, [dialogState])

  const ConfirmDialogComponent = useCallback(() => {
    if (!dialogState) return null

    return (
      <ConfirmDialog
        isOpen={true}
        title={dialogState.title}
        message={dialogState.message}
        confirmLabel={dialogState.confirmLabel}
        cancelLabel={dialogState.cancelLabel}
        confirmVariant={dialogState.confirmVariant}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        theme={theme}
      />
    )
  }, [dialogState, handleConfirm, handleCancel, theme])

  return { showConfirm, ConfirmDialogComponent }
}

export default ConfirmDialog

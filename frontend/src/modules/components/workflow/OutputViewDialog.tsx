/**
 * OutputViewDialog - Modal dialog for viewing workflow output
 *
 * Displays the complete output data from a workflow node in a readable format.
 */

import { useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Flag, Copy, Check } from 'lucide-react'

interface OutputViewDialogProps {
  /** Output data to display */
  output: unknown
  /** Node label for dialog title */
  nodeLabel?: string
  /** Callback to close dialog */
  onClose: () => void
}

export function OutputViewDialog({
  output,
  nodeLabel = 'Output',
  onClose,
}: OutputViewDialogProps) {
  const [copied, setCopied] = useState(false)

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose()
      }
    },
    [onClose]
  )

  const outputText = typeof output === 'string' ? output : JSON.stringify(output, null, 2)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(outputText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [outputText])

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
          width: '800px',
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
            <Flag style={{ width: 18, height: 18, color: 'var(--node-green)' }} />
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
              {nodeLabel} - Output
            </h3>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleCopy}
              style={{
                background: copied ? 'var(--success)' : 'var(--input-bg)',
                border: '1px solid var(--border)',
                padding: '6px 12px',
                cursor: 'pointer',
                color: copied ? 'white' : 'var(--text)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 500,
                transition: 'background 0.15s',
              }}
              title="Copy to clipboard"
            >
              {copied ? (
                <>
                  <Check style={{ width: 14, height: 14 }} />
                  Copied
                </>
              ) : (
                <>
                  <Copy style={{ width: 14, height: 14 }} />
                  Copy
                </>
              )}
            </button>
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
        </div>

        {/* Content */}
        <div
          style={{
            padding: '20px',
            overflowY: 'auto',
            flex: 1,
            background: 'var(--panel)',
          }}
        >
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0,
              fontFamily: 'monospace',
              fontSize: '13px',
              lineHeight: '1.6',
              color: 'var(--text)',
            }}
          >
            {outputText}
          </pre>
        </div>

        {/* Footer with metadata */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            gap: '16px',
            justifyContent: 'flex-start',
            background: 'var(--panel-2)',
            fontSize: '11px',
            color: 'var(--muted)',
          }}
        >
          <span>Type: {typeof output}</span>
          <span>Size: {outputText.length.toLocaleString()} characters</span>
          {typeof output === 'object' && output !== null && (
            <span>Keys: {Object.keys(output).length}</span>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

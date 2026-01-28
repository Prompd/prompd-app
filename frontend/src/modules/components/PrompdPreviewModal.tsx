import { useState, useEffect } from 'react'
import { Check, X, FileText, Zap } from 'lucide-react'
import Modal from '../editor/Modal'
import { Editor } from '@monaco-editor/react'

interface PrompdPreviewModalProps {
  isOpen: boolean
  content: string
  filename: string
  metadata?: {
    provider?: string
    model?: string
    tokens?: number
    cost?: number
  }
  onAccept: () => void
  onDecline: () => void
  onRetry?: () => void
  onClose: () => void
  theme?: 'light' | 'dark'
}

export function PrompdPreviewModal({
  isOpen,
  content,
  filename,
  metadata,
  onAccept,
  onDecline,
  onRetry,
  onClose,
  theme = 'dark'
}: PrompdPreviewModalProps) {
  const [editorTheme, setEditorTheme] = useState(theme === 'dark' ? 'vs-dark' : 'vs-light')

  useEffect(() => {
    setEditorTheme(theme === 'dark' ? 'vs-dark' : 'vs-light')
  }, [theme])

  const handleAccept = () => {
    onAccept()
    onClose()
  }

  const handleDecline = () => {
    onDecline()
    onClose()
  }

  const handleRetry = () => {
    if (onRetry) {
      onRetry()
    }
    onClose()
  }

  if (!isOpen) return null

  return (
    <Modal open={isOpen} onClose={onClose} title="Generated Prompt Preview">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', maxWidth: '100%', overflow: 'visible' }}>
        {/* Header Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'var(--panel-2)', borderRadius: '8px' }}>
          <FileText size={20} style={{ color: 'var(--accent)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>{filename}</div>
            {metadata && (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {metadata.provider && metadata.model && (
                  <span>{metadata.provider} · {metadata.model}</span>
                )}
                {metadata.tokens && (
                  <span> · {metadata.tokens.toLocaleString()} tokens</span>
                )}
                {metadata.cost && (
                  <span> · ${metadata.cost.toFixed(4)}</span>
                )}
              </div>
            )}
          </div>
          <Zap size={16} style={{ color: 'var(--success)' }} />
        </div>

        {/* Monaco Editor Preview */}
        <div style={{ height: '500px', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
          <Editor
            height="100%"
            language="yaml"
            value={content}
            theme={editorTheme}
            options={{
              readOnly: true,
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              fontSize: 13,
              lineNumbers: 'on',
              renderWhitespace: 'selection',
              wordWrap: 'on',
              folding: true,
              lineDecorationsWidth: 10,
              lineNumbersMinChars: 3
            }}
          />
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={handleDecline}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              background: 'var(--error)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.9'
              e.currentTarget.style.transform = 'translateY(-1px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <X size={16} />
            <span>Decline & Refine</span>
          </button>

          {onRetry && (
            <button
              onClick={handleRetry}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                background: 'var(--accent)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '0.9'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '1'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <Zap size={16} />
              <span>Retry Generation</span>
            </button>
          )}

          <button
            onClick={handleAccept}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 24px',
              background: 'var(--success)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.9'
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1'
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)'
            }}
          >
            <Check size={16} />
            <span>Accept & Open in Design View</span>
          </button>
        </div>

        {/* Helper Text */}
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center', paddingTop: '4px' }}>
          <strong>Accept</strong> to open in Design View • <strong>Retry</strong> to regenerate • <strong>Decline</strong> to refine with clarifying questions
        </div>
      </div>
    </Modal>
  )
}

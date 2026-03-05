import { MessageCircle } from 'lucide-react'

interface AskUserOption {
  label: string
  description?: string
}

interface AskUserPanelProps {
  question: string
  options?: Array<AskUserOption | string>
  onSelect: (label: string) => void
  onCancel: () => void
}

/** Normalize options — LLM XML parser may return plain strings or {label} objects */
function normalizeOption(opt: AskUserOption | string): AskUserOption {
  return typeof opt === 'string' ? { label: opt } : opt
}

/**
 * Compact ask_user prompt displayed above the chat input.
 * Shows the agent's question, optional option chips, and a cancel button.
 */
export function AskUserPanel({ question, options, onSelect, onCancel }: AskUserPanelProps) {
  const normalized = options?.map(normalizeOption)
  const hasOptions = normalized && normalized.length > 0

  return (
    <div style={{
      borderTop: '1px solid rgba(168, 85, 247, 0.25)',
      padding: '14px 20px 12px'
    }}>
      {/* Header row: label + cancel */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '6px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <MessageCircle size={14} style={{ color: '#a855f7', opacity: 0.8 }} />
          <span style={{
            color: '#a855f7',
            fontWeight: 600,
            fontSize: '12px',
            letterSpacing: '0.3px'
          }}>
            Agent needs your input
          </span>
        </div>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '2px 8px',
            background: 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '4px',
            color: 'var(--prompd-muted)',
            fontSize: '11px',
            cursor: 'pointer',
            transition: 'all 0.15s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)'
            e.currentTarget.style.color = '#f87171'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
            e.currentTarget.style.color = 'var(--prompd-muted)'
          }}
        >
          Cancel
        </button>
      </div>

      {/* Question */}
      <div style={{
        color: 'var(--prompd-text)',
        fontSize: '14px',
        lineHeight: 1.5,
        marginBottom: hasOptions ? '10px' : '4px'
      }}>
        {question}
      </div>

      {/* Option chips */}
      {hasOptions && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
          marginBottom: '6px'
        }}>
          {normalized.map((opt, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(opt.label)}
              title={opt.description || undefined}
              style={{
                padding: '5px 12px',
                background: 'rgba(168, 85, 247, 0.08)',
                border: '1px solid rgba(168, 85, 247, 0.25)',
                borderRadius: '6px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s',
                color: '#c4b5fd',
                fontSize: '13px',
                fontWeight: 500
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(168, 85, 247, 0.18)'
                e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.45)'
                e.currentTarget.style.color = '#d8b4fe'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(168, 85, 247, 0.08)'
                e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.25)'
                e.currentTarget.style.color = '#c4b5fd'
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Hint */}
      <div style={{
        fontSize: '11px',
        color: 'var(--prompd-muted)',
        opacity: 0.7
      }}>
        {hasOptions
          ? 'Pick an option or type a custom answer'
          : 'Type your answer below'
        }
      </div>
    </div>
  )
}

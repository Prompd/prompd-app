/**
 * SplitViewToggles - Reusable toggle buttons for SplitEditor preview and chat panels.
 * Used by EditorHeader and PrompdViewerModal.
 */

import { SplitSquareHorizontal } from 'lucide-react'
import { PrompdIcon } from '../components/PrompdIcon'

interface SplitViewToggleProps {
  active: boolean
  onClick: () => void
  disabled?: boolean
  compact?: boolean
}

const toggleStyle = (active: boolean, disabled: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '4px 10px',
  fontSize: '11px',
  fontWeight: 500,
  border: 'none',
  borderRadius: '4px',
  background: active && !disabled ? 'rgba(99, 102, 241, 0.85)' : 'transparent',
  color: active && !disabled ? 'white' : 'var(--text-secondary)',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.4 : 1,
  transition: 'all 0.2s',
})

const compactToggleStyle = (active: boolean, disabled: boolean): React.CSSProperties => ({
  ...toggleStyle(active, disabled),
  gap: '0',
  padding: '4px 6px',
})

export function PreviewToggle({ active, onClick, disabled = false, compact = false }: SplitViewToggleProps) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={compact ? compactToggleStyle(active, disabled) : toggleStyle(active, disabled)}
      title={disabled ? 'Preview only available in Code mode' : (active ? 'Hide preview panel' : 'Show compiled preview')}
    >
      <SplitSquareHorizontal size={14} />
      {!compact && <span>Preview</span>}
    </button>
  )
}

export function ChatToggle({ active, onClick, disabled = false, compact = false }: SplitViewToggleProps) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={compact ? compactToggleStyle(active, disabled) : toggleStyle(active, disabled)}
      title={disabled ? 'Chat only available in Code mode' : (active ? 'Hide chat panel' : 'Open AI chat')}
    >
      <PrompdIcon size={14} />
      {!compact && <span>Chat</span>}
    </button>
  )
}

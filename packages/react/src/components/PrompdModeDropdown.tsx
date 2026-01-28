import { useState, useRef, useEffect } from 'react'
import { clsx } from 'clsx'
import { Sparkles, Pencil, Search, MessageCircle, Check, type LucideIcon } from 'lucide-react'
import type { PrompdChatMode } from '../types'

// Map icon names to Lucide components
const iconMap: Record<string, LucideIcon> = {
  Sparkles,
  Pencil,
  Search,
  MessageCircle
}

function ModeIcon({ name, size = 18 }: { name: string; size?: number }) {
  const IconComponent = iconMap[name]
  if (IconComponent) {
    return <IconComponent size={size} strokeWidth={1.5} />
  }
  // Fallback to text if icon not found (backwards compatibility with emojis)
  return <span style={{ fontSize: size }}>{name}</span>
}

export interface PrompdModeDropdownProps {
  currentMode: PrompdChatMode
  modes: PrompdChatMode[]
  onModeChange: (modeId: string) => void
  className?: string
}

/**
 * Compact mode selector - designed to sit inline in the chat input area
 */
export function PrompdModeDropdown({
  currentMode,
  modes,
  onModeChange,
  className
}: PrompdModeDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  return (
    <div
      ref={dropdownRef}
      className={clsx('prompd-mode-dropdown relative', className)}
    >
      {/* Dropdown menu (appears above button) */}
      {isOpen && (
        <div
          className="prompd-mode-menu"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: '8px',
            minWidth: '260px',
            background: 'var(--prompd-panel)',
            border: '1px solid var(--prompd-border)',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            overflow: 'hidden',
            zIndex: 1000
          }}
        >
          {modes.map((mode) => {
            const isActive = mode.id === currentMode.id
            return (
              <button
                key={mode.id}
                onClick={() => {
                  onModeChange(mode.id)
                  setIsOpen(false)
                }}
                className={clsx(
                  'prompd-mode-option w-full flex items-start gap-3 px-3 py-2.5 transition-colors',
                  isActive && 'prompd-mode-option-active'
                )}
                style={{
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                  <ModeIcon name={mode.icon} size={18} />
                </span>
                <div className="flex-1 min-w-0">
                  <div
                    className="font-medium"
                    style={{
                      color: 'var(--prompd-text)',
                      fontSize: '13px',
                      marginBottom: mode.description ? '2px' : 0
                    }}
                  >
                    {mode.label}
                  </div>
                  {mode.description && (
                    <div
                      style={{
                        color: 'var(--prompd-muted)',
                        fontSize: '11px',
                        lineHeight: '1.3'
                      }}
                    >
                      {mode.description}
                    </div>
                  )}
                </div>
                {isActive && (
                  <Check
                    size={14}
                    strokeWidth={2}
                    style={{
                      color: 'var(--prompd-accent, rgb(99, 102, 241))',
                      flexShrink: 0
                    }}
                  />
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Compact mode button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="prompd-mode-button flex items-center gap-1.5 transition-all"
        title={`Current mode: ${currentMode.label}`}
        style={{
          border: '1px solid var(--prompd-border)',
          borderRadius: '10px',
          color: 'var(--prompd-text)',
          fontSize: '13px',
          padding: '8px 12px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          height: '36px',
          display: 'flex',
          alignItems: 'center'
        }}
      >
        <ModeIcon name={currentMode.icon} size={16} />
        <span style={{ fontWeight: 500 }}>{currentMode.label}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
            opacity: 0.5,
            marginLeft: '2px'
          }}
        >
          <path
            d="M3 4.5L6 7.5L9 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  )
}
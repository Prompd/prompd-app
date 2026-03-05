import React, { useRef, useEffect, useState } from 'react'
import { SendHorizontal, Loader2, Square } from 'lucide-react'
import type { PrompdChatInputProps, PrompdInputTheme } from '../types'
import { clsx } from 'clsx'

// Theme color definitions
const INPUT_THEME_COLORS: Record<PrompdInputTheme, { border: string; focus: string; glow: string; button: string }> = {
  default: {
    border: 'var(--prompd-input-border)',
    focus: 'var(--prompd-accent)',
    glow: 'rgba(59, 130, 246, 0.1)',
    button: 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)'
  },
  auto: {
    border: '#22c55e',
    focus: '#22c55e',
    glow: 'rgba(34, 197, 94, 0.15)',
    button: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
  },
  confirm: {
    border: '#eab308',
    focus: '#eab308',
    glow: 'rgba(234, 179, 8, 0.15)',
    button: 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)'
  },
  plan: {
    border: '#6366f1',
    focus: '#6366f1',
    glow: 'rgba(99, 102, 241, 0.15)',
    button: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)'
  },
  brainstorm: {
    border: '#06b6d4',
    focus: '#06b6d4',
    glow: 'rgba(6, 182, 212, 0.15)',
    button: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)'
  }
}

export function PrompdChatInput({
  value,
  onChange,
  onSubmit,
  isLoading = false,
  onStop,
  placeholder = 'Ask me anything... (Up/Down for history)',
  maxLines = 10,
  className,
  leftControls,
  rightControls,
  showHelperText = true,
  inputRef: externalInputRef,
  inputTheme = 'default',
  history = []
}: PrompdChatInputProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null)
  const textareaRef = externalInputRef || internalRef
  const [isFocused, setIsFocused] = useState(false)

  // History navigation state
  // -1 means we're at the current input (not browsing history)
  const [historyIndex, setHistoryIndex] = useState(-1)
  // Store the current input when user starts navigating history
  const [savedInput, setSavedInput] = useState('')

  // Auto-focus when component becomes enabled
  useEffect(() => {
    if (!isLoading && textareaRef.current) {
      const timer = setTimeout(() => {
        textareaRef.current?.focus()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [isLoading])

  // Reset height when value is cleared and reset history index
  useEffect(() => {
    if (value === '' && textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = '24px'
      // Reset history navigation when input is cleared (e.g., after submit)
      setHistoryIndex(-1)
      setSavedInput('')
    }
  }, [value])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter to submit
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isLoading && value.trim()) {
        // Reset history state on submit
        setHistoryIndex(-1)
        setSavedInput('')
        onSubmit()
      }
      return
    }

    // History navigation with up/down arrows
    // Only navigate when cursor is at start (up) or end (down) of input, or input is empty
    if (history.length === 0) return

    const textarea = textareaRef.current
    if (!textarea) return

    const cursorPos = textarea.selectionStart
    const selectionCollapsed = textarea.selectionStart === textarea.selectionEnd
    const textBeforeCursor = value.substring(0, cursorPos)
    const cursorOnFirstLine = !textBeforeCursor.includes('\n')
    const cursorOnLastLine = !value.substring(cursorPos).includes('\n')
    const isEmpty = value === ''

    if (e.key === 'ArrowUp' && selectionCollapsed && (isEmpty || cursorOnFirstLine)) {
      e.preventDefault()

      if (historyIndex === -1) {
        // Starting to navigate history - save current input
        setSavedInput(value)
        // Go to most recent history item (end of array)
        if (history.length > 0) {
          setHistoryIndex(history.length - 1)
          onChange(history[history.length - 1])
        }
      } else if (historyIndex > 0) {
        // Navigate to older history
        const newIndex = historyIndex - 1
        setHistoryIndex(newIndex)
        onChange(history[newIndex])
      }
      // Move cursor to end after setting value
      setTimeout(() => {
        if (textarea) {
          textarea.selectionStart = textarea.value.length
          textarea.selectionEnd = textarea.value.length
        }
      }, 0)
    } else if (e.key === 'ArrowDown' && selectionCollapsed && (isEmpty || cursorOnLastLine)) {
      if (historyIndex === -1) return // Not in history navigation mode

      e.preventDefault()

      if (historyIndex < history.length - 1) {
        // Navigate to more recent history
        const newIndex = historyIndex + 1
        setHistoryIndex(newIndex)
        onChange(history[newIndex])
      } else {
        // At the end of history - restore saved input
        setHistoryIndex(-1)
        onChange(savedInput)
        setSavedInput('')
      }
      // Move cursor to end after setting value
      setTimeout(() => {
        if (textarea) {
          textarea.selectionStart = textarea.value.length
          textarea.selectionEnd = textarea.value.length
        }
      }, 0)
    }
  }

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement
    target.style.height = 'auto'
    const lineHeight = 24
    const maxHeight = lineHeight * maxLines
    const newHeight = Math.min(target.scrollHeight, maxHeight)
    target.style.height = `${newHeight}px`
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isLoading && value.trim()) {
      onSubmit()
    }
  }

  const canSend = !isLoading && value.trim().length > 0

  // Get theme colors
  const themeColors = INPUT_THEME_COLORS[inputTheme]

  return (
    <form onSubmit={handleSubmit} className={clsx('relative', className)}>
      {/* Main Input Container - 3 Row Flex Layout */}
      <div
        className="prompd-input-field flex flex-col"
        style={{
          background: 'var(--prompd-input-bg)',
          border: `2px solid ${isFocused ? themeColors.focus : themeColors.border}`,
          borderRadius: '12px',
          transition: 'all 0.2s ease',
          boxShadow: isFocused ? `0 0 0 3px ${themeColors.glow}` : 'none',
          minWidth: '317px'
        }}
      >
        {/* Row 1: Textarea */}
        <div className="flex-1 min-h-[60px]">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            disabled={isLoading}
            rows={1}
            tabIndex={0}
            className="w-full h-full resize-none bg-transparent outline-none px-4 py-4"
            style={{
              minHeight: '60px',
              maxHeight: `${28 * maxLines}px`,
              color: 'var(--prompd-text)',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontSize: '14px',
              lineHeight: '24px',
              pointerEvents: isLoading ? 'none' : 'auto'
            }}
          />
        </div>

        {/* Row 2: Bottom Controls (Left and Right) */}
        {(leftControls || rightControls) && (
          <div className="flex items-center justify-between gap-2 px-3 pb-3">
            {/* Left Controls */}
            <div className="flex items-center gap-2">
              {leftControls}
            </div>

            {/* Right Controls or Submit Button */}
            <div className="flex items-center gap-2">
              {rightControls ? (
                rightControls
              ) : isLoading && onStop ? (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); onStop() }}
                  className="prompd-stop-button p-2.5 rounded-xl text-white transition-all duration-200 hover:scale-[1.02] active:scale-95"
                  style={{
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    boxShadow: '0 4px 14px 0 rgba(239, 68, 68, 0.3)'
                  }}
                  title="Stop generation (Esc)"
                >
                  <Square className="w-4 h-4" fill="currentColor" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!canSend}
                  className={clsx(
                    'prompd-submit-button p-2.5 rounded-xl text-white transition-all duration-200',
                    canSend
                      ? 'hover:scale-[1.02] active:scale-95 shadow-lg hover:shadow-xl'
                      : 'opacity-50 cursor-not-allowed'
                  )}
                  style={{
                    background: canSend ? themeColors.button : 'linear-gradient(135deg, #64748b 0%, #475569 100%)',
                    boxShadow: canSend ? `0 4px 14px 0 ${themeColors.glow}` : 'none'
                  }}
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <SendHorizontal className="w-5 h-5" />
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Default submit button when no controls */}
        {!leftControls && !rightControls && (
          <div className="flex justify-end px-3 pb-3">
            {isLoading && onStop ? (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); onStop() }}
                className="prompd-stop-button p-2 rounded-lg transition-all duration-200 opacity-100 scale-100 hover:scale-110"
                style={{
                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  color: 'white',
                  boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)'
                }}
                title="Stop generation (Esc)"
              >
                <Square className="w-4 h-4" fill="currentColor" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSend}
                className={clsx(
                  'prompd-submit-button p-2 rounded-lg transition-all duration-200',
                  canSend
                    ? 'opacity-100 scale-100 hover:scale-110'
                    : 'opacity-30 scale-90 cursor-not-allowed'
                )}
                style={{
                  background: canSend ? themeColors.button : 'var(--prompd-muted)',
                  color: 'white',
                  boxShadow: canSend ? `0 2px 8px ${themeColors.glow}` : 'none'
                }}
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <SendHorizontal className="w-5 h-5" />
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Helper Text - Optional */}
      {showHelperText && (
        <div
          className="prompd-input-helper mt-2 px-1 flex items-center justify-between text-xs"
          style={{ color: 'var(--prompd-muted)' }}
        >
          <span className="flex items-center gap-2">
            <kbd style={{
              background: 'var(--prompd-panel-2)',
              border: '1px solid var(--prompd-border)',
              borderRadius: '4px',
              padding: '2px 6px',
              fontSize: '10px',
              fontFamily: 'monospace'
            }}>Enter</kbd>
            <span>to send</span>
            <span style={{ opacity: 0.5 }}>•</span>
            <kbd style={{
              background: 'var(--prompd-panel-2)',
              border: '1px solid var(--prompd-border)',
              borderRadius: '4px',
              padding: '2px 6px',
              fontSize: '10px',
              fontFamily: 'monospace'
            }}>Shift+Enter</kbd>
            <span>for new line</span>
          </span>
          {value.length > 0 && (
            <div className="ml-auto flex items-center gap-4 text-slate-600 dark:text-slate-400">
              <span>{value.length} chars</span>
            </div>
          )}
        </div>
      )}
    </form>
  )
}

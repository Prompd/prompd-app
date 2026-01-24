/**
 * String input component for parameter values
 * Auto-expands to textarea when content has newlines or is long
 */

import { useRef, useEffect } from 'react'
import { clsx } from 'clsx'
import type { ParameterInputProps } from '../utils/types'
import { MAX_LENGTHS } from '../utils/validation'

interface StringInputProps extends ParameterInputProps<string> {
  maxLength?: number
}

export function StringInput({
  value,
  onChange,
  placeholder,
  disabled = false,
  error,
  className,
  maxLength = MAX_LENGTHS.string,
}: StringInputProps) {
  // Refs for focus management
  const inputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const hadFocusRef = useRef(false)
  const prevUseTextareaRef = useRef<boolean | null>(null)

  // Ensure we have a string - convert objects/arrays to string
  // Also convert escaped newlines (\n) to actual newlines for display
  let stringValue: string
  if (typeof value === 'string') {
    // Convert literal \n escape sequences to actual newlines for display
    stringValue = value.replace(/\\n/g, '\n')
  } else if (value != null) {
    stringValue = JSON.stringify(value)
  } else {
    stringValue = ''
  }
  const hasNewlines = stringValue.includes('\n')
  const isLongContent = stringValue.length > 100
  const useTextarea = hasNewlines || isLongContent

  // Restore focus when switching between input and textarea
  useEffect(() => {
    // Skip on first render
    if (prevUseTextareaRef.current === null) {
      prevUseTextareaRef.current = useTextarea
      return
    }

    // If the input type changed and we had focus, restore it
    if (prevUseTextareaRef.current !== useTextarea && hadFocusRef.current) {
      const element = useTextarea ? textareaRef.current : inputRef.current
      if (element) {
        element.focus()
        // Move cursor to end
        const len = stringValue.length
        element.setSelectionRange(len, len)
      }
    }
    prevUseTextareaRef.current = useTextarea
  }, [useTextarea, stringValue.length])

  // Track focus state
  const handleFocus = () => {
    hadFocusRef.current = true
  }

  const handleBlur = () => {
    hadFocusRef.current = false
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Don't trim while typing - only enforce max length
    // Trimming on every keystroke prevents typing spaces at the end
    const value = e.target.value.slice(0, maxLength)
    onChange(value)
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // Multiline: preserve whitespace, only enforce max length
    // Don't trim - user may want leading/trailing newlines
    const value = e.target.value.slice(0, maxLength)
    onChange(value)
  }

  // Handle paste on single-line input - if pasted content has newlines, preserve them
  const handleInputPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData('text')
    if (pastedText.includes('\n')) {
      e.preventDefault()
      // Combine with existing value at cursor position
      const input = e.currentTarget
      const start = input.selectionStart ?? 0
      const end = input.selectionEnd ?? 0
      const newValue = stringValue.slice(0, start) + pastedText + stringValue.slice(end)
      onChange(newValue.slice(0, maxLength))
    }
  }

  const inputClasses = clsx(
    'w-full px-3 py-2 text-sm rounded-md transition-colors',
    'bg-white dark:bg-slate-900',
    'border',
    error
      ? 'border-red-500 focus:ring-red-500'
      : 'border-slate-300 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-400',
    'text-slate-800 dark:text-slate-200',
    'placeholder:text-slate-400 dark:placeholder:text-slate-500',
    'focus:outline-none focus:ring-2 focus:ring-opacity-50',
    disabled && 'opacity-50 cursor-not-allowed'
  )

  // Calculate rows for textarea based on content
  const lineCount = stringValue.split('\n').length
  const rows = Math.min(Math.max(3, lineCount), 15)

  return (
    <div className={clsx('prompd-string-input', className)}>
      {useTextarea ? (
        <textarea
          ref={textareaRef}
          value={stringValue}
          onChange={handleTextareaChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={maxLength}
          rows={rows}
          className={clsx(inputClasses, 'resize-y font-mono transition-all duration-200 ease-out')}
        />
      ) : (
        <input
          ref={inputRef}
          type="text"
          value={stringValue}
          onChange={handleInputChange}
          onPaste={handleInputPaste}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={maxLength}
          className={clsx(inputClasses, 'transition-all duration-200 ease-out')}
        />
      )}
      {error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}
    </div>
  )
}

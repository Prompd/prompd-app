/**
 * Object/JSON input component for complex parameter values
 * Provides a JSON editor with validation
 */

import { useState, useEffect } from 'react'
import { clsx } from 'clsx'
import type { ParameterInputProps } from '../utils/types'

interface ObjectInputProps extends ParameterInputProps<Record<string, unknown> | undefined> {
  defaultValue?: Record<string, unknown>
}

export function ObjectInput({
  value,
  onChange,
  placeholder,
  disabled = false,
  error: externalError,
  className,
  defaultValue,
}: ObjectInputProps) {
  // Keep text representation in sync with value
  const [text, setText] = useState(() => {
    if (value !== undefined) {
      return JSON.stringify(value, null, 2)
    }
    if (defaultValue !== undefined) {
      return JSON.stringify(defaultValue, null, 2)
    }
    return '{}'
  })
  const [parseError, setParseError] = useState<string | null>(null)

  // Update text when external value changes
  useEffect(() => {
    if (value !== undefined) {
      const newText = JSON.stringify(value, null, 2)
      if (newText !== text) {
        setText(newText)
        setParseError(null)
      }
    }
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value
    setText(newText)

    // Try to parse as JSON
    try {
      const parsed = JSON.parse(newText)
      if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        setParseError('Value must be a JSON object')
        return
      }
      setParseError(null)
      onChange(parsed)
    } catch (err) {
      setParseError('Invalid JSON syntax')
    }
  }

  const error = externalError || parseError

  // Calculate rows based on content
  const lineCount = text.split('\n').length
  const rows = Math.min(Math.max(4, lineCount), 15)

  return (
    <div className={clsx('prompd-object-input', className)}>
      <textarea
        value={text}
        onChange={handleChange}
        placeholder={placeholder || '{\n  "key": "value"\n}'}
        disabled={disabled}
        rows={rows}
        className={clsx(
          'w-full px-3 py-2 text-sm rounded-md transition-colors resize-y',
          'bg-white dark:bg-slate-900',
          'border',
          error
            ? 'border-red-500 focus:ring-red-500'
            : 'border-slate-300 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-400',
          'text-slate-800 dark:text-slate-200',
          'placeholder:text-slate-400 dark:placeholder:text-slate-500',
          'focus:outline-none focus:ring-2 focus:ring-opacity-50',
          'font-mono text-xs',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      />
      {error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}
    </div>
  )
}

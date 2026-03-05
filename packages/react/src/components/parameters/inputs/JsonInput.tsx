/**
 * JSON input component with syntax highlighting
 * Edit mode: plain textarea for typing
 * View mode: syntax-highlighted read-only display
 * Accepts any valid JSON value (objects, arrays, primitives)
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { clsx } from 'clsx'
import { AlignLeft, Pencil } from 'lucide-react'
import type { ParameterInputProps } from '../utils/types'

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null

interface JsonInputProps extends ParameterInputProps<JsonValue | undefined> {
  defaultValue?: JsonValue
}

/**
 * Tokenize JSON text into highlighted spans
 * Uses class names for theme-aware coloring via CSS
 */
function highlightJson(text: string): string {
  if (!text) return ''

  // Escape HTML entities first
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Apply syntax highlighting via regex replacement
  // Order matters: keys before standalone strings
  return escaped
    // Keys: "key":
    .replace(
      /("(?:[^"\\]|\\.)*")\s*:/g,
      '<span class="prompd-json-key">$1</span>:'
    )
    // String values after colon: : "value"
    .replace(
      /:\s*("(?:[^"\\]|\\.)*")/g,
      ': <span class="prompd-json-str">$1</span>'
    )
    // Standalone strings (arrays, top-level)
    .replace(
      /(?<=[\[,\n])\s*("(?:[^"\\]|\\.)*")(?=\s*[,\]\n])/g,
      ' <span class="prompd-json-str">$1</span>'
    )
    // Numbers
    .replace(
      /\b(-?\d+\.?\d*(?:[eE][+-]?\d+)?)\b/g,
      '<span class="prompd-json-num">$1</span>'
    )
    // Booleans and null
    .replace(
      /\b(true|false|null)\b/g,
      '<span class="prompd-json-kw">$1</span>'
    )
    // Structural chars
    .replace(
      /([{}[\]])/g,
      '<span class="prompd-json-brace">$1</span>'
    )
}

export function JsonInput({
  value,
  onChange,
  placeholder,
  disabled = false,
  error: externalError,
  className,
  defaultValue,
}: JsonInputProps) {
  const [text, setText] = useState(() => {
    if (value !== undefined && value !== null) {
      return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
    }
    if (defaultValue !== undefined && defaultValue !== null) {
      return typeof defaultValue === 'string' ? defaultValue : JSON.stringify(defaultValue, null, 2)
    }
    return ''
  })
  const [parseError, setParseError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(!text.trim())
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Update text when external value changes
  useEffect(() => {
    if (value !== undefined && value !== null) {
      const newText = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
      try {
        const currentParsed = text ? JSON.parse(text) : undefined
        const newParsed = typeof value === 'string' ? JSON.parse(value) : value
        if (JSON.stringify(currentParsed) !== JSON.stringify(newParsed)) {
          setText(newText)
          setParseError(null)
        }
      } catch {
        setText(newText)
        setParseError(null)
      }
    }
  }, [value])

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      const len = textareaRef.current.value.length
      textareaRef.current.setSelectionRange(len, len)
    }
  }, [isEditing])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value
    setText(newText)

    if (!newText.trim()) {
      setParseError(null)
      onChange(undefined)
      return
    }

    try {
      const parsed = JSON.parse(newText)
      setParseError(null)
      onChange(parsed)
    } catch {
      setParseError('Invalid JSON')
    }
  }

  const handleFormat = useCallback(() => {
    try {
      const parsed = JSON.parse(text)
      const formatted = JSON.stringify(parsed, null, 2)
      setText(formatted)
      setParseError(null)
      onChange(parsed)
    } catch {
      // Keep current text if invalid
    }
  }, [text, onChange])

  const handleBlur = () => {
    // Switch to view mode when valid JSON and not empty
    if (text.trim() && !parseError) {
      setIsEditing(false)
    }
  }

  const error = externalError || parseError

  const lineCount = text.split('\n').length
  const rows = Math.min(Math.max(4, lineCount + 1), 20)

  // Value type indicator
  const getValueType = (): string | null => {
    if (!text.trim() || parseError) return null
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) return `array[${parsed.length}]`
      if (parsed === null) return 'null'
      if (typeof parsed === 'object') return `object{${Object.keys(parsed).length}}`
      return typeof parsed
    } catch {
      return null
    }
  }

  const valueType = getValueType()

  return (
    <div className={clsx('prompd-json-input', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          {valueType && (
            <span className={clsx(
              'text-[10px] px-1.5 py-0.5 rounded',
              'bg-emerald-100 dark:bg-emerald-900/30',
              'text-emerald-700 dark:text-emerald-400',
              'font-mono'
            )}>
              {valueType}
            </span>
          )}
          {parseError && (
            <span className={clsx(
              'text-[10px] px-1.5 py-0.5 rounded',
              'bg-red-100 dark:bg-red-900/30',
              'text-red-700 dark:text-red-400'
            )}>
              {parseError}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!disabled && !isEditing && text.trim() && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className={clsx(
                'text-xs flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors',
                'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
                'hover:bg-slate-100 dark:hover:bg-slate-700'
              )}
              title="Edit JSON"
            >
              <Pencil size={12} />
              Edit
            </button>
          )}
          {!disabled && text.trim() && !parseError && (
            <button
              type="button"
              onClick={handleFormat}
              className={clsx(
                'text-xs flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors',
                'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
                'hover:bg-slate-100 dark:hover:bg-slate-700'
              )}
              title="Format JSON"
            >
              <AlignLeft size={12} />
              Format
            </button>
          )}
        </div>
      </div>

      {isEditing || !text.trim() || parseError ? (
        /* Edit mode: plain textarea */
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder || '{\n  "key": "value"\n}'}
          disabled={disabled}
          rows={rows}
          spellCheck={false}
          className={clsx(
            'w-full px-3 py-2 text-xs rounded-md transition-colors resize-y',
            'bg-white dark:bg-slate-900',
            'border',
            error
              ? 'border-red-500 focus:ring-red-500'
              : 'border-slate-300 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-400',
            'text-slate-800 dark:text-slate-200',
            'placeholder:text-slate-400 dark:placeholder:text-slate-500',
            'focus:outline-none focus:ring-2 focus:ring-opacity-50',
            'font-mono whitespace-pre-wrap break-words',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        />
      ) : (
        /* View mode: syntax-highlighted display */
        <pre
          onClick={() => !disabled && setIsEditing(true)}
          className={clsx(
            'prompd-json-highlight',
            'w-full px-3 py-2 text-xs rounded-md overflow-auto',
            'bg-slate-50 dark:bg-slate-900',
            'border border-slate-200 dark:border-slate-700',
            'font-mono whitespace-pre-wrap break-words',
            'max-h-80',
            !disabled && 'cursor-text hover:border-blue-400 dark:hover:border-blue-500 transition-colors'
          )}
          dangerouslySetInnerHTML={{ __html: highlightJson(text) }}
        />
      )}
    </div>
  )
}

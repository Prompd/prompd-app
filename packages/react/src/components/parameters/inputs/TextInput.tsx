/**
 * Text/Textarea input component for long-form parameter values
 */

import { clsx } from 'clsx'
import type { ParameterInputProps } from '../utils/types'
import { sanitizeString, MAX_LENGTHS } from '../utils/validation'

interface TextInputProps extends ParameterInputProps<string> {
  maxLength?: number
  rows?: number
  autoResize?: boolean
}

export function TextInput({
  value,
  onChange,
  placeholder,
  disabled = false,
  error,
  className,
  maxLength = MAX_LENGTHS.text,
  rows = 4,
  autoResize = true,
}: TextInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const sanitized = sanitizeString(e.target.value, maxLength)
    onChange(sanitized)
  }

  // Calculate dynamic rows based on content if autoResize is enabled
  const lineCount = (value ?? '').split('\n').length
  const dynamicRows = autoResize
    ? Math.min(Math.max(rows, lineCount), 20) // Min of default rows, max of 20
    : rows

  return (
    <div className={clsx('prompd-text-input', className)}>
      <textarea
        value={value ?? ''}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        rows={dynamicRows}
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
          'font-mono',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      />
      <div className="flex justify-between mt-1">
        {error ? (
          <p className="text-xs text-red-500">{error}</p>
        ) : (
          <span />
        )}
        <span className="text-xs text-slate-400">
          {(value ?? '').length} / {maxLength}
        </span>
      </div>
    </div>
  )
}

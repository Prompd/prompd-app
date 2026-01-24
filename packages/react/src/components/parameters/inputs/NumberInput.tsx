/**
 * Number input component for parameter values
 * Supports integer and float types
 */

import { clsx } from 'clsx'
import type { ParameterInputProps } from '../utils/types'

interface NumberInputProps extends ParameterInputProps<number | undefined> {
  type?: 'number' | 'integer' | 'float'
  min?: number
  max?: number
  step?: number
}

export function NumberInput({
  value,
  onChange,
  placeholder,
  disabled = false,
  error,
  className,
  type = 'number',
  min,
  max,
  step,
}: NumberInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value

    // Allow empty value
    if (rawValue === '') {
      onChange(undefined)
      return
    }

    // Parse based on type
    const parsed = type === 'integer'
      ? parseInt(rawValue, 10)
      : parseFloat(rawValue)

    // Only update if it's a valid number
    if (!isNaN(parsed)) {
      onChange(parsed)
    }
  }

  // Determine step based on type if not provided
  const inputStep = step ?? (type === 'integer' ? 1 : 'any')

  return (
    <div className={clsx('prompd-number-input', className)}>
      <input
        type="number"
        value={value ?? ''}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        min={min}
        max={max}
        step={inputStep}
        className={clsx(
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
        )}
      />
      {error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}
    </div>
  )
}

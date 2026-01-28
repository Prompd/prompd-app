/**
 * Boolean input component for parameter values
 * Uses toggle buttons for clear binary choice
 */

import { clsx } from 'clsx'
import type { ParameterInputProps } from '../utils/types'

interface BooleanInputProps extends ParameterInputProps<boolean | undefined> {
  trueLabel?: string
  falseLabel?: string
}

export function BooleanInput({
  value,
  onChange,
  disabled = false,
  error,
  className,
  trueLabel = 'Yes',
  falseLabel = 'No',
}: BooleanInputProps) {
  return (
    <div className={clsx('prompd-boolean-input', className)}>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange(true)}
          disabled={disabled}
          className={clsx(
            'flex-1 px-4 py-2 rounded-md font-medium text-sm transition-all',
            value === true
              ? 'bg-green-500 text-white shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          {trueLabel}
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          disabled={disabled}
          className={clsx(
            'flex-1 px-4 py-2 rounded-md font-medium text-sm transition-all',
            value === false
              ? 'bg-red-500 text-white shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          {falseLabel}
        </button>
      </div>
      {error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}
    </div>
  )
}

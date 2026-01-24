/**
 * Enum/Select input component for parameter values
 * Dropdown with predefined options
 */

import { clsx } from 'clsx'
import type { ParameterInputProps } from '../utils/types'

interface EnumInputProps extends ParameterInputProps<string> {
  options: string[]
  emptyLabel?: string
}

export function EnumInput({
  value,
  onChange,
  disabled = false,
  error,
  className,
  options,
  emptyLabel = 'Select an option...',
}: EnumInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(e.target.value)
  }

  return (
    <div className={clsx('prompd-enum-input', className)}>
      <select
        value={value ?? ''}
        onChange={handleChange}
        disabled={disabled}
        className={clsx(
          'w-full px-3 py-2 text-sm rounded-md transition-colors',
          'bg-white dark:bg-slate-900',
          'border',
          error
            ? 'border-red-500 focus:ring-red-500'
            : 'border-slate-300 dark:border-slate-600 focus:border-blue-500 dark:focus:border-blue-400',
          'text-slate-800 dark:text-slate-200',
          'focus:outline-none focus:ring-2 focus:ring-opacity-50',
          disabled && 'opacity-50 cursor-not-allowed',
          // Custom dropdown arrow
          'appearance-none bg-no-repeat bg-right pr-8',
          'bg-[url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 20 20\'%3E%3Cpath stroke=\'%236B7280\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'1.5\' d=\'m6 8 4 4 4-4\'/%3E%3C/svg%3E")]',
          'bg-[length:1.5rem_1.5rem]'
        )}
      >
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}
    </div>
  )
}

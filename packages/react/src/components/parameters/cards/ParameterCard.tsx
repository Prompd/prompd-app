/**
 * Base Parameter Card component
 * Wraps parameter inputs with consistent styling and labels
 */

import { clsx } from 'clsx'
import { Info } from 'lucide-react'
import type { PrompdParameter } from '../utils/types'
import { isEmptyValue } from '../utils/typeUtils'

interface ParameterCardProps {
  param: PrompdParameter
  value: unknown
  children: React.ReactNode
  className?: string
  fullWidth?: boolean
  error?: string
}

export function ParameterCard({
  param,
  value,
  children,
  className,
  fullWidth = false,
  error,
}: ParameterCardProps) {
  const isEmpty = isEmptyValue(value)
  const showRequired = param.required && isEmpty

  return (
    <div
      className={clsx(
        'prompd-parameter-card',
        'p-3 rounded-lg border transition-all',
        'bg-white dark:bg-slate-800',
        error
          ? 'border-red-300 dark:border-red-700'
          : showRequired
            ? 'border-amber-300 dark:border-amber-700'
            : 'border-slate-200 dark:border-slate-700',
        'hover:shadow-sm',
        fullWidth && 'col-span-full',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <label className="font-medium text-sm text-slate-800 dark:text-slate-200">
          {param.name}
        </label>

        {param.required && (
          <span className="text-red-500 text-sm font-semibold" title="Required">
            *
          </span>
        )}

        <span className={clsx(
          'text-[10px] px-1.5 py-0.5 rounded',
          'bg-slate-100 dark:bg-slate-700',
          'text-slate-500 dark:text-slate-400'
        )}>
          {param.type}
        </span>

        {/* Info tooltip for description */}
        {param.description && (
          <div className="relative group ml-auto">
            <Info
              size={14}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-help"
            />
            <div className={clsx(
              'absolute z-50 bottom-full right-0 mb-2 p-2 rounded-md shadow-lg',
              'bg-slate-900 dark:bg-slate-700 text-white text-xs',
              'max-w-[200px] w-max',
              'opacity-0 invisible group-hover:opacity-100 group-hover:visible',
              'transition-all duration-150'
            )}>
              {param.description}
              <div className="absolute top-full right-2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900 dark:border-t-slate-700" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div>
        {children}
      </div>

      {/* Default value hint */}
      {param.default !== undefined && isEmpty && (
        <p className="mt-1 text-xs text-slate-400">
          Default: {typeof param.default === 'object'
            ? JSON.stringify(param.default)
            : String(param.default)
          }
        </p>
      )}
    </div>
  )
}

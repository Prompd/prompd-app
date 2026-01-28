import { RotateCcw } from 'lucide-react'
import { clsx } from 'clsx'

export interface PrompdResetButtonProps {
  onReset: () => void
  show?: boolean
  className?: string
  title?: string
}

/**
 * Reset/Start Over button for clearing workflow state
 */
export function PrompdResetButton({
  onReset,
  show = true,
  className,
  title = 'Start over'
}: PrompdResetButtonProps) {
  if (!show) return null

  return (
    <button
      onClick={onReset}
      className={clsx(
        'p-2 rounded-lg glass border border-slate-200 dark:border-slate-700',
        'hover:bg-slate-100 dark:hover:bg-slate-800',
        'text-slate-700 dark:text-slate-400 transition-colors',
        className
      )}
      title={title}
    >
      <RotateCcw className="w-5 h-5" />
    </button>
  )
}

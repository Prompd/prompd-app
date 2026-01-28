import { AlertTriangle, ExternalLink } from 'lucide-react'

export interface PromptSwitchConfirmDialogProps {
  isOpen: boolean
  currentPromptName: string
  newPromptName: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Confirmation dialog when switching prompts
 * Warns about replacement and suggests prompd.app for multi-prompt workflows
 */
export function PromptSwitchConfirmDialog({
  isOpen,
  currentPromptName,
  newPromptName,
  onConfirm,
  onCancel
}: PromptSwitchConfirmDialogProps) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <div
        className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              Switch Prompt?
            </h2>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-slate-700 dark:text-slate-300">
            You currently have <span className="font-semibold text-slate-900 dark:text-white">{currentPromptName}</span> open.
            Switching to <span className="font-semibold text-slate-900 dark:text-white">{newPromptName}</span> will replace it.
          </p>

          <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-900 dark:text-blue-200 mb-2">
              <span className="font-semibold">Need to work with multiple prompts?</span>
            </p>
            <p className="text-sm text-blue-800 dark:text-blue-300">
              For complex multi-prompt workflows, we recommend using{' '}
              <a
                href="https://prompd.app"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold hover:underline"
              >
                prompd.app
                <ExternalLink className="w-3 h-3" />
              </a>
              , which supports advanced orchestration and chaining.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-6 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-6 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700 font-medium transition-all shadow-sm hover:shadow-md"
          >
            Switch Prompt
          </button>
        </div>
      </div>
    </div>
  )
}

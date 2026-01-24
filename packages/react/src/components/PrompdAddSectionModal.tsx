import { X } from 'lucide-react'
import { STANDARD_SECTIONS, getAvailableSections } from '../constants/sections'

export interface PrompdAddSectionModalProps {
  isOpen: boolean
  onClose: () => void
  onAddSection: (sectionName: string) => void
  activeSections: string[]
  className?: string
}

/**
 * Modal for adding new sections to prompt configuration
 */
export function PrompdAddSectionModal({
  isOpen,
  onClose,
  onAddSection,
  activeSections,
  className
}: PrompdAddSectionModalProps) {
  if (!isOpen) return null

  const availableSections = getAvailableSections().filter(
    sectionName => !activeSections.includes(sectionName)
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className={`bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 dark:border-slate-700 ${className || ''}`}>
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Add Section</h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          <p className="text-sm text-slate-700 dark:text-slate-400 mb-4">
            Select a section type to add to your prompt configuration:
          </p>

          <div className="space-y-2">
            {availableSections.map(sectionName => {
              const def = STANDARD_SECTIONS[sectionName]
              return (
                <button
                  key={sectionName}
                  onClick={() => {
                    onAddSection(sectionName)
                    onClose()
                  }}
                  className="w-full text-left p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-all"
                >
                  <div className="font-medium text-slate-900 dark:text-white mb-1">
                    {def.label}
                  </div>
                  <div className="text-xs text-slate-700 dark:text-slate-400">
                    {def.description}
                    {def.allowMultiple && ' • Allows multiple files'}
                  </div>
                </button>
              )
            })}

            {availableSections.length === 0 && (
              <div className="text-center py-6 text-slate-500 dark:text-slate-400">
                All available sections have been added
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

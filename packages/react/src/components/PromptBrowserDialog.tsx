import React, { useState, useMemo } from 'react'
import { Search, FileText, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { clsx } from 'clsx'
import type { Prompt } from '../utils/PackageCache'

export interface PromptBrowserDialogProps {
  prompts: Prompt[]
  packageName: string
  packageVersion: string
  currentPromptPath?: string
  onSelect: (prompt: Prompt) => void
  onClose: () => void
  isOpen: boolean
}

const PROMPTS_PER_PAGE = 20

/**
 * Modal dialog for browsing and selecting prompts from a package
 * Features: search, pagination, keyboard navigation
 */
export function PromptBrowserDialog({
  prompts,
  packageName,
  packageVersion,
  currentPromptPath,
  onSelect,
  onClose,
  isOpen
}: PromptBrowserDialogProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  // Filter prompts by search query
  const filteredPrompts = useMemo(() => {
    if (!searchQuery.trim()) return prompts

    const query = searchQuery.toLowerCase()
    return prompts.filter(
      prompt =>
        prompt.name.toLowerCase().includes(query) ||
        prompt.path.toLowerCase().includes(query) ||
        prompt.description?.toLowerCase().includes(query)
    )
  }, [prompts, searchQuery])

  // Paginate filtered prompts
  const totalPages = Math.max(1, Math.ceil(filteredPrompts.length / PROMPTS_PER_PAGE))
  const startIndex = (currentPage - 1) * PROMPTS_PER_PAGE
  const endIndex = startIndex + PROMPTS_PER_PAGE
  const paginatedPrompts = filteredPrompts.slice(startIndex, endIndex)

  // Reset to page 1 when search query changes
  React.useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery])

  // Keyboard navigation
  React.useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowLeft' && currentPage > 1) {
        setCurrentPage(p => p - 1)
      } else if (e.key === 'ArrowRight' && currentPage < totalPages) {
        setCurrentPage(p => p + 1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, currentPage, totalPages])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Browse Prompts</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {packageName}@{packageVersion} • {filteredPrompts.length} prompt
                  {filteredPrompts.length !== 1 ? 's' : ''}
                  {searchQuery && ` matching "${searchQuery}"`}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-400 transition-colors"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search prompts by name, path, or description..."
              className={clsx(
                'w-full pl-10 pr-4 py-2.5 rounded-lg',
                'bg-slate-50 dark:bg-slate-800',
                'border border-slate-300 dark:border-slate-600',
                'text-slate-900 dark:text-white placeholder:text-slate-400',
                'focus:ring-2 focus:ring-blue-500 focus:border-transparent',
                'transition-all'
              )}
              autoFocus
            />
          </div>
        </div>

        {/* Prompt List */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {paginatedPrompts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="w-16 h-16 text-slate-300 dark:text-slate-600 mb-4" />
              <p className="text-lg font-medium text-slate-600 dark:text-slate-400">
                {searchQuery ? 'No prompts match your search' : 'No prompts found in package'}
              </p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {paginatedPrompts.map((prompt, index) => (
                <PromptCard
                  key={prompt.path}
                  prompt={prompt}
                  isSelected={prompt.path === currentPromptPath}
                  onSelect={() => onSelect(prompt)}
                  index={index}
                />
              ))}
            </div>
          )}
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex-shrink-0 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Page {currentPage} of {totalPages} • Showing {startIndex + 1}-
                {Math.min(endIndex, filteredPrompts.length)} of {filteredPrompts.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className={clsx(
                    'flex items-center gap-1 px-3 py-2 rounded-lg font-medium transition-all',
                    currentPage === 1
                      ? 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                      : 'bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  )}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className={clsx(
                    'flex items-center gap-1 px-3 py-2 rounded-lg font-medium transition-all',
                    currentPage === totalPages
                      ? 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                      : 'bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  )}
                  aria-label="Next page"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PromptCard({
  prompt,
  isSelected,
  onSelect,
  index
}: {
  prompt: Prompt
  isSelected: boolean
  onSelect: () => void
  index: number
}) {
  return (
    <button
      onClick={onSelect}
      style={{ animationDelay: `${index * 50}ms` }}
      className={clsx(
        'w-full p-4 rounded-lg transition-all text-left group',
        'border-2 relative',
        'animate-in slide-in-from-right-4 fade-in duration-300',
        isSelected
          ? 'border-blue-500 dark:border-blue-600 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 shadow-lg shadow-blue-500/20'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={clsx(
            'p-2 rounded-lg flex-shrink-0',
            isSelected
              ? 'bg-gradient-to-br from-blue-500 to-indigo-600'
              : 'bg-gradient-to-br from-slate-400 to-slate-500 group-hover:from-blue-400 group-hover:to-indigo-500'
          )}
        >
          <FileText className="w-5 h-5 text-white" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-slate-900 dark:text-white truncate">
                {prompt.name}
              </h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 truncate">
                {prompt.path}
              </p>
            </div>
            {isSelected && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500 text-white flex-shrink-0">
                Current
              </span>
            )}
          </div>

          {prompt.description && (
            <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2 mt-2">
              {prompt.description}
            </p>
          )}

          {prompt.size !== undefined && (
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">
              {formatBytes(prompt.size)}
            </p>
          )}
        </div>
      </div>
    </button>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

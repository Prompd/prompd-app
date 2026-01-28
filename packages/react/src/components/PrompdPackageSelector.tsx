import React, { useState } from 'react'
import { Search, Package, Star, Download, Check } from 'lucide-react'
import type { PrompdPackageSelectorProps } from '../types'
import { clsx } from 'clsx'

export function PrompdPackageSelector({
  recommendations,
  selectedPackage,
  onSelect,
  onSearch,
  onGenerateCustom,
  className
}: PrompdPackageSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)

  const handleSearch = async () => {
    if (!onSearch || !searchQuery.trim()) return

    setIsSearching(true)
    try {
      await onSearch(searchQuery)
    } finally {
      setIsSearching(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  return (
    <div className={clsx('space-y-4', className)}>
      {/* Search Bar */}
      {onSearch && (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search packages..."
              className={clsx(
                'w-full pl-10 pr-4 py-3 rounded-lg',
                'bg-white dark:bg-slate-900',
                'border border-slate-300 dark:border-slate-700',
                'text-slate-900 dark:text-white placeholder:text-slate-400',
                'focus:ring-2 focus:ring-blue-500 focus:border-transparent',
                'transition-all'
              )}
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={isSearching || !searchQuery.trim()}
            className={clsx(
              'px-6 py-3 rounded-lg font-medium transition-all',
              'bg-gradient-to-r from-blue-600 to-purple-600',
              'text-white hover:shadow-lg',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'transform hover:scale-105'
            )}
          >
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="space-y-3">
          {recommendations.map((recommendation, index) => (
            <PackageCard
              key={`${recommendation.package.name}-${recommendation.package.version}`}
              recommendation={recommendation}
              isSelected={
                selectedPackage?.name === recommendation.package.name &&
                selectedPackage?.version === recommendation.package.version
              }
              onSelect={() => onSelect(recommendation.package)}
              index={index}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {recommendations.length === 0 && (
        <div className={clsx(
          'p-8 rounded-xl text-center',
          'bg-slate-50 dark:bg-slate-900/50',
          'border-2 border-dashed border-slate-300 dark:border-slate-700'
        )}>
          <Package className="w-12 h-12 mx-auto mb-3 text-slate-400" />
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            {onSearch
              ? 'Search for packages or describe what you want to do'
              : 'No package recommendations yet'
            }
          </p>
          {onGenerateCustom && (
            <button
              onClick={onGenerateCustom}
              className={clsx(
                'px-6 py-3 rounded-lg font-medium transition-all',
                'bg-gradient-to-r from-green-600 to-emerald-600',
                'text-white hover:shadow-lg',
                'transform hover:scale-105'
              )}
            >
              Generate New
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function PackageCard({
  recommendation,
  isSelected,
  onSelect,
  index
}: {
  recommendation: PrompdPackageSelectorProps['recommendations'][0]
  isSelected: boolean
  onSelect: () => void
  index?: number
}) {
  const { package: pkg, score, reason } = recommendation

  return (
    <button
      onClick={onSelect}
      style={{ animationDelay: `${(index || 0) * 100}ms` }}
      className={clsx(
        'w-full p-4 rounded-xl transition-all text-left group',
        'border-2 relative overflow-hidden',
        'animate-in slide-in-from-right-4 fade-in duration-500',
        isSelected
          ? 'border-blue-500 dark:border-blue-600 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 shadow-xl shadow-blue-500/20'
          : 'border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm hover:border-blue-300 dark:hover:border-blue-700',
        'hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98]'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={clsx(
          'p-2 rounded-lg flex-shrink-0',
          isSelected
            ? 'bg-gradient-to-br from-blue-500 to-purple-600'
            : 'bg-gradient-to-br from-slate-400 to-slate-500'
        )}>
          <Package className="w-5 h-5 text-white" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-slate-900 dark:text-white truncate">
                {pkg.name}
              </h4>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                v{pkg.version}
              </p>
            </div>
            {isSelected && (
              <div className="p-1 rounded-full bg-blue-500">
                <Check className="w-4 h-4 text-white" />
              </div>
            )}
          </div>

          <p className="text-sm text-slate-700 dark:text-slate-300 mb-2 line-clamp-2">
            {pkg.description}
          </p>

          {/* Reason for recommendation */}
          <div className={clsx(
            'px-3 py-1.5 rounded-lg mb-2',
            'bg-blue-50 dark:bg-blue-950/30',
            'border border-blue-200 dark:border-blue-800'
          )}>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              {reason}
            </p>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
            {pkg.rating !== undefined && (
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                <span>{pkg.rating.toFixed(1)}</span>
              </div>
            )}
            {pkg.downloads !== undefined && (
              <div className="flex items-center gap-1">
                <Download className="w-4 h-4" />
                <span>{formatNumber(pkg.downloads)}</span>
              </div>
            )}
            {/* Match Score */}
            <div className={clsx(
              'ml-auto px-2 py-0.5 rounded-full text-xs font-medium',
              score >= 0.8
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : score >= 0.6
                ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            )}>
              {Math.round(score * 100)}% match
            </div>
          </div>

          {/* Tags */}
          {pkg.tags && pkg.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {pkg.tags.slice(0, 3).map(tag => (
                <span
                  key={tag}
                  className={clsx(
                    'px-2 py-0.5 rounded text-xs',
                    'bg-slate-100 dark:bg-slate-800',
                    'text-slate-600 dark:text-slate-400'
                  )}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`
  }
  return num.toString()
}

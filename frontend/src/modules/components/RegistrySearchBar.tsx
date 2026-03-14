/**
 * RegistrySearchBar - Package discovery search bar for the WelcomeView
 *
 * On focus: shows suggested packages from cached registry data (instant, no API call)
 * On typing: searches registry API with 300ms debounce
 * On click result: fetches full package info, then calls onSelectPackage
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Package, Loader } from 'lucide-react'
import { registryApi, type RegistryPackage } from '../services/registryApi'
import { getRegistrySync, type PackageStatus } from '../lib/intellisense/registrySync'

interface RegistrySearchBarProps {
  theme: 'light' | 'dark'
  onSelectPackage: (pkg: RegistryPackage) => void
}

/** Convert cached PackageStatus to minimal RegistryPackage for display */
function statusToPackage(status: PackageStatus): RegistryPackage {
  return {
    name: status.name,
    version: status.version,
    description: '',
    keywords: status.tags
  }
}

export default function RegistrySearchBar({ theme, onSelectPackage }: RegistrySearchBarProps) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [results, setResults] = useState<RegistryPackage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const [loadingIndex, setLoadingIndex] = useState(-1)

  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const colors = theme === 'dark' ? {
    inputBg: 'rgba(30, 41, 59, 0.5)',
    inputBorder: 'rgba(71, 85, 105, 0.3)',
    inputFocusBorder: 'rgba(99, 102, 241, 0.5)',
    dropdownBg: theme === 'dark' ? 'rgba(15, 23, 42, 0.98)' : 'rgba(255, 255, 255, 0.98)',
    text: '#e2e8f0',
    textMuted: '#94a3b8',
    textDim: '#64748b',
    hoverBg: 'rgba(30, 41, 59, 0.8)',
    versionBg: 'rgba(99, 102, 241, 0.15)',
    versionText: '#818cf8',
    sectionText: '#64748b',
    shadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
  } : {
    inputBg: 'rgba(248, 250, 252, 0.8)',
    inputBorder: 'rgba(226, 232, 240, 0.8)',
    inputFocusBorder: 'rgba(99, 102, 241, 0.5)',
    dropdownBg: 'rgba(255, 255, 255, 0.98)',
    text: '#0f172a',
    textMuted: '#64748b',
    textDim: '#94a3b8',
    hoverBg: 'rgba(248, 250, 252, 1)',
    versionBg: 'rgba(99, 102, 241, 0.1)',
    versionText: '#6366f1',
    sectionText: '#94a3b8',
    shadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
  }

  // Load cached suggestions on focus (instant, no API call)
  const loadSuggestions = useCallback(() => {
    try {
      const sync = getRegistrySync()
      const allPackages = sync.getAllPackages()

      if (allPackages.length === 0) {
        setResults([])
        return
      }

      // Sort: @examples first, then by lastModified descending
      const sorted = [...allPackages].sort((a, b) => {
        const aIsExample = a.namespace === 'examples'
        const bIsExample = b.namespace === 'examples'
        if (aIsExample && !bIsExample) return -1
        if (!aIsExample && bIsExample) return 1
        return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
      })

      setResults(sorted.slice(0, 8).map(statusToPackage))
    } catch {
      setResults([])
    }
  }, [])

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      // Revert to suggestions when query is cleared
      if (isOpen) {
        loadSuggestions()
      }
      return
    }

    if (query.trim().length < 2) return

    const timer = setTimeout(async () => {
      setIsLoading(true)
      try {
        const searchResults = await registryApi.searchPackages(query.trim(), 8)
        setResults(searchResults.packages || [])
        setHighlightIndex(-1)
      } catch (err) {
        console.error('[RegistrySearchBar] Search failed:', err)
      } finally {
        setIsLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query, isOpen, loadSuggestions])

  // Click-outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Listen for registry sync completion to refresh suggestions
  useEffect(() => {
    const handler = () => {
      if (isOpen && !query.trim()) {
        loadSuggestions()
      }
    }
    window.addEventListener('registry-sync-complete', handler)
    return () => window.removeEventListener('registry-sync-complete', handler)
  }, [isOpen, query, loadSuggestions])

  const handleFocus = () => {
    setIsOpen(true)
    if (!query.trim()) {
      loadSuggestions()
    }
  }

  const handleSelect = async (pkg: RegistryPackage, index: number) => {
    setLoadingIndex(index)
    try {
      // Fetch full package info for the modal
      const fullInfo = await registryApi.getPackageInfo(pkg.name)
      if (fullInfo) {
        onSelectPackage(fullInfo)
        setIsOpen(false)
        setQuery('')
      }
    } catch (err) {
      console.error('[RegistrySearchBar] Failed to fetch package info:', err)
    } finally {
      setLoadingIndex(-1)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightIndex(prev => (prev + 1) % results.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightIndex(prev => (prev - 1 + results.length) % results.length)
        break
      case 'Enter':
        e.preventDefault()
        if (highlightIndex >= 0 && highlightIndex < results.length) {
          handleSelect(results[highlightIndex], highlightIndex)
        }
        break
      case 'Escape':
        e.preventDefault()
        setIsOpen(false)
        inputRef.current?.blur()
        break
    }
  }

  const isSearchMode = query.trim().length >= 2

  return (
    <div ref={containerRef} style={{ position: 'relative', marginBottom: '24px' }}>
      {/* Search Input */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 16px',
        background: colors.inputBg,
        border: `1px solid ${isOpen ? colors.inputFocusBorder : colors.inputBorder}`,
        borderRadius: '10px',
        transition: 'all 0.15s ease',
      }}>
        <Search size={18} style={{ color: colors.textDim, flexShrink: 0 }} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder="Search PrompdHub for packages"
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: colors.text,
            fontSize: '15px',
            fontFamily: 'inherit',
          }}
        />
        {isLoading && (
          <Loader size={14} style={{ color: colors.textDim, animation: 'spin 1s linear infinite' }} />
        )}
      </div>

      {/* Dropdown */}
      {isOpen && results.length > 0 && (
        <div
          ref={dropdownRef}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '4px',
            background: colors.dropdownBg,
            border: `1px solid ${colors.inputBorder}`,
            borderRadius: '8px',
            boxShadow: colors.shadow,
            zIndex: 50,
            overflow: 'hidden',
            backdropFilter: 'blur(12px)',
          }}
        >
          {/* Section header */}
          <div style={{
            padding: '8px 12px 4px',
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: colors.sectionText,
          }}>
            {isSearchMode ? 'Results' : 'Suggested'}
          </div>

          {/* Results list */}
          {results.map((pkg, i) => (
            <div
              key={pkg.name + pkg.version}
              onClick={() => handleSelect(pkg, i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 12px',
                cursor: 'pointer',
                background: highlightIndex === i ? colors.hoverBg : 'transparent',
                transition: 'background 0.1s ease',
              }}
              onMouseEnter={() => setHighlightIndex(i)}
              onMouseLeave={() => setHighlightIndex(-1)}
            >
              {loadingIndex === i ? (
                <Loader size={14} style={{ color: colors.textDim, flexShrink: 0, animation: 'spin 1s linear infinite' }} />
              ) : (
                <Package size={14} style={{ color: colors.versionText, flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}>
                  <span style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: colors.text,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {pkg.name}
                  </span>
                  <span style={{
                    fontSize: '11px',
                    color: colors.versionText,
                    background: colors.versionBg,
                    padding: '1px 6px',
                    borderRadius: '4px',
                    flexShrink: 0,
                  }}>
                    {pkg.version}
                  </span>
                </div>
                {pkg.description && (
                  <div style={{
                    fontSize: '12px',
                    color: colors.textMuted,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginTop: '2px',
                  }}>
                    {pkg.description}
                  </div>
                )}
              </div>
              {pkg.downloads !== undefined && pkg.downloads > 0 && (
                <span style={{
                  fontSize: '11px',
                  color: colors.textDim,
                  flexShrink: 0,
                }}>
                  {pkg.downloads.toLocaleString()} dl
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty state when dropdown is open but no results */}
      {isOpen && results.length === 0 && query.trim().length >= 2 && !isLoading && (
        <div
          ref={dropdownRef}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '4px',
            background: colors.dropdownBg,
            border: `1px solid ${colors.inputBorder}`,
            borderRadius: '8px',
            boxShadow: colors.shadow,
            zIndex: 50,
            padding: '16px',
            textAlign: 'center',
            backdropFilter: 'blur(12px)',
          }}
        >
          <span style={{ fontSize: '13px', color: colors.textMuted }}>
            No packages found
          </span>
        </div>
      )}
    </div>
  )
}

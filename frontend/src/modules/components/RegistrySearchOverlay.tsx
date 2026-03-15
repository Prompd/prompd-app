/**
 * RegistrySearchOverlay - Modal overlay for searching PrompdHub packages
 *
 * Opened via Ctrl+Shift+D when tabs are open (WelcomeView not visible).
 * Same search behavior as RegistrySearchBar but rendered as a centered overlay.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Package, Loader, ChevronRight, WifiOff } from 'lucide-react'
import { registryApi, type RegistryPackage } from '../services/registryApi'
import { getRegistrySync, type PackageStatus } from '../lib/intellisense/registrySync'

interface RegistrySearchOverlayProps {
  theme: 'light' | 'dark'
  onSelectPackage: (pkg: RegistryPackage) => void
  onClose: () => void
}

function statusToPackage(status: PackageStatus): RegistryPackage {
  return {
    name: status.name,
    version: status.version,
    description: status.description || '',
    keywords: status.tags
  }
}

export default function RegistrySearchOverlay({ theme, onSelectPackage, onClose }: RegistrySearchOverlayProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<RegistryPackage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const [loadingIndex, setLoadingIndex] = useState(-1)
  const [registryOffline, setRegistryOffline] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const colors = theme === 'dark' ? {
    backdrop: 'rgba(0, 0, 0, 0.5)',
    panelBg: 'rgba(15, 23, 42, 0.98)',
    inputBg: 'rgba(30, 41, 59, 0.5)',
    inputBorder: 'rgba(71, 85, 105, 0.3)',
    inputFocusBorder: 'rgba(99, 102, 241, 0.5)',
    text: '#e2e8f0',
    textMuted: '#94a3b8',
    textDim: '#64748b',
    hoverBg: 'rgba(30, 41, 59, 0.8)',
    versionBg: 'rgba(99, 102, 241, 0.15)',
    versionText: '#818cf8',
    sectionText: '#64748b',
    shadow: '0 16px 48px rgba(0, 0, 0, 0.5)',
    border: 'rgba(99, 102, 241, 0.3)',
  } : {
    backdrop: 'rgba(0, 0, 0, 0.3)',
    panelBg: 'rgba(255, 255, 255, 0.98)',
    inputBg: 'rgba(248, 250, 252, 0.8)',
    inputBorder: 'rgba(226, 232, 240, 0.8)',
    inputFocusBorder: 'rgba(99, 102, 241, 0.5)',
    text: '#0f172a',
    textMuted: '#64748b',
    textDim: '#94a3b8',
    hoverBg: 'rgba(248, 250, 252, 1)',
    versionBg: 'rgba(99, 102, 241, 0.1)',
    versionText: '#6366f1',
    sectionText: '#94a3b8',
    shadow: '0 16px 48px rgba(0, 0, 0, 0.15)',
    border: 'rgba(99, 102, 241, 0.3)',
  }

  // Auto-focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  // Load suggestions immediately
  const loadSuggestions = useCallback(() => {
    try {
      const sync = getRegistrySync()
      const allPackages = sync.getAllPackages()

      if (allPackages.length === 0) {
        setResults([])
        setRegistryOffline(true)
        return
      }

      setRegistryOffline(false)
      const sorted = [...allPackages].sort((a, b) => {
        return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
      })
      setResults(sorted.slice(0, 10).map(statusToPackage))
    } catch {
      setResults([])
      setRegistryOffline(true)
    }
  }, [])

  // Load suggestions on mount
  useEffect(() => {
    loadSuggestions()
  }, [loadSuggestions])

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      loadSuggestions()
      return
    }

    if (query.trim().length < 2) return

    const timer = setTimeout(async () => {
      setIsLoading(true)
      try {
        const searchResults = await registryApi.searchPackages(query.trim(), 10)
        setResults(searchResults.packages || [])
        setHighlightIndex(-1)
        setRegistryOffline(false)
      } catch (err) {
        console.error('[RegistrySearchOverlay] Search failed:', err)
        setRegistryOffline(true)
      } finally {
        setIsLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query, loadSuggestions])

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
      onClose()
    }
  }

  const handleSelect = async (pkg: RegistryPackage, index: number) => {
    setLoadingIndex(index)
    try {
      const fullInfo = await registryApi.getPackageInfo(pkg.name)
      if (fullInfo) {
        onSelectPackage(fullInfo)
        onClose()
      }
    } catch (err) {
      console.error('[RegistrySearchOverlay] Failed to fetch package info:', err)
    } finally {
      setLoadingIndex(-1)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        onClose()
        break
      case 'ArrowDown':
        e.preventDefault()
        if (results.length > 0) {
          setHighlightIndex(prev => (prev + 1) % results.length)
        }
        break
      case 'ArrowUp':
        e.preventDefault()
        if (results.length > 0) {
          setHighlightIndex(prev => (prev - 1 + results.length) % results.length)
        }
        break
      case 'Enter':
        e.preventDefault()
        if (highlightIndex >= 0 && highlightIndex < results.length) {
          handleSelect(results[highlightIndex], highlightIndex)
        }
        break
    }
  }

  const isSearchMode = query.trim().length >= 2

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '15vh',
        background: colors.backdrop,
        backdropFilter: 'blur(4px)',
      }}
      onMouseDown={handleBackdropClick}
    >
      <div
        ref={panelRef}
        style={{
          width: '100%',
          maxWidth: '600px',
          background: colors.panelBg,
          border: `1px solid ${colors.border}`,
          borderRadius: '12px',
          boxShadow: colors.shadow,
          overflow: 'hidden',
        }}
      >
        {/* Search input */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '14px 18px',
          borderBottom: `1px solid ${colors.inputBorder}`,
        }}>
          <Search size={20} style={{ color: colors.textDim, flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search PrompdHub for packages..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: colors.text,
              fontSize: '16px',
              fontFamily: 'inherit',
            }}
          />
          {isLoading && (
            <Loader size={14} style={{ color: colors.textDim, flexShrink: 0, animation: 'spin 1s linear infinite' }} />
          )}
        </div>

        {/* Results area */}
        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          {/* Registry offline */}
          {registryOffline && results.length === 0 && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              padding: '24px 16px',
              textAlign: 'center',
            }}>
              <WifiOff size={20} style={{ color: colors.textDim }} />
              <span style={{ fontSize: '13px', color: colors.textMuted }}>
                Registry unavailable
              </span>
              <span style={{ fontSize: '11px', color: colors.textDim }}>
                Check your connection or try again later
              </span>
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <>
              <div style={{
                padding: '10px 14px 6px',
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.05em',
                color: colors.sectionText,
              }}>
                {isSearchMode ? 'Results' : 'Browse PrompdHub'}
                {registryOffline && (
                  <span style={{ marginLeft: '8px', fontWeight: 400, fontStyle: 'italic' }}>
                    (showing cached)
                  </span>
                )}
              </div>

              {results.map((pkg, i) => (
                <div
                  key={pkg.name + pkg.version}
                  onClick={() => handleSelect(pkg, i)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 14px',
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
                        fontSize: '14px',
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
                  <ChevronRight
                    size={14}
                    style={{
                      color: highlightIndex === i ? colors.textMuted : colors.textDim,
                      flexShrink: 0,
                      transition: 'color 0.1s ease',
                    }}
                  />
                </div>
              ))}
            </>
          )}

          {/* No results */}
          {results.length === 0 && !registryOffline && isSearchMode && !isLoading && (
            <div style={{ padding: '24px 16px', textAlign: 'center' }}>
              <span style={{ fontSize: '13px', color: colors.textMuted }}>
                No packages found for &ldquo;{query.trim()}&rdquo;
              </span>
            </div>
          )}
        </div>

        {/* Footer with keyboard hints */}
        <div style={{
          padding: '8px 14px',
          fontSize: '11px',
          color: colors.textDim,
          borderTop: `1px solid ${colors.inputBorder}`,
          display: 'flex',
          gap: '12px',
        }}>
          <span>
            <kbd style={{ padding: '1px 4px', borderRadius: '3px', background: colors.hoverBg, fontSize: '10px' }}>
              &#8593;&#8595;
            </kbd>
            {' '}navigate
          </span>
          <span>
            <kbd style={{ padding: '1px 4px', borderRadius: '3px', background: colors.hoverBg, fontSize: '10px' }}>
              Enter
            </kbd>
            {' '}select
          </span>
          <span>
            <kbd style={{ padding: '1px 4px', borderRadius: '3px', background: colors.hoverBg, fontSize: '10px' }}>
              Esc
            </kbd>
            {' '}close
          </span>
        </div>
      </div>
    </div>
  )
}

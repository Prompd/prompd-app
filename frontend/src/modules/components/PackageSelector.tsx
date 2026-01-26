import { useState, useRef, useEffect } from 'react'
import { Search, Package, FileText } from 'lucide-react'

interface PackageSearchResult {
  name: string
  version: string
  description?: string
}

interface PackageSelectorProps {
  selectedPackage: { name: string; version: string } | null
  selectedLocalFile?: string  // Selected local file path (for display)
  onSelect: (packageName: string, version: string) => void
  onSearch: (query: string) => Promise<PackageSearchResult[]>
  onLocalFileSearch?: (query: string) => Promise<string[]>  // Search local files
  onLocalFileSelect?: (filePath: string) => void  // Handle local file selection
  fileExtensions?: string[]  // File extensions to display (e.g., ['.prmd'], ['.pdflow'], ['.prmd', '.pdflow'])
  className?: string
}

export default function PackageSelector({
  selectedPackage,
  selectedLocalFile = '',
  onSelect,
  onSearch,
  onLocalFileSearch,
  onLocalFileSelect,
  fileExtensions = ['.prmd'],
  className = ''
}: PackageSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<PackageSearchResult[]>([])
  const [localFileResults, setLocalFileResults] = useState<string[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [isLocalSearch, setIsLocalSearch] = useState(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout>()
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    // Check if searching for local files (starts with ".")
    const isLocal = searchQuery.trim().startsWith('.')
    setIsLocalSearch(isLocal)

    if (searchQuery.trim().length === 0) {
      setSearchResults([])
      setLocalFileResults([])
      setShowDropdown(false)
      return
    }

    // For local file search, require at least "."
    // For package search, require at least 2 characters
    if (isLocal && searchQuery.trim().length < 1) {
      setLocalFileResults([])
      setShowDropdown(false)
      return
    } else if (!isLocal && searchQuery.trim().length < 2) {
      setSearchResults([])
      setShowDropdown(false)
      return
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true)
      try {
        if (isLocal && onLocalFileSearch) {
          // Search local files
          const results = await onLocalFileSearch(searchQuery)
          setLocalFileResults(results)
          setSearchResults([])
          setShowDropdown(results.length > 0)
          setHighlightedIndex(0)
        } else {
          // Search packages
          const results = await onSearch(searchQuery)
          setSearchResults(results)
          setLocalFileResults([])
          setShowDropdown(true)
          setHighlightedIndex(0)
        }
      } catch (err) {
        console.error('Search failed:', err)
        setSearchResults([])
        setLocalFileResults([])
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchQuery, onSearch, onLocalFileSearch])

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDropdown])

  const handleSelectPackage = (pkg: PackageSearchResult) => {
    onSelect(pkg.name, pkg.version)
    setSearchQuery('')
    setShowDropdown(false)
    setSearchResults([])
  }

  return (
    <div className={className} style={{ position: 'relative' }} ref={dropdownRef}>
      {/* Label */}
      <label style={{
        display: 'block',
        fontSize: '12px',
        fontWeight: '600',
        color: 'var(--text)',
        marginBottom: '6px'
      }}>
        Package
      </label>

      {/* Selected package display OR selected local file display OR search input */}
      {selectedPackage ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          background: 'var(--input-bg)',
          border: '1px solid var(--input-border)',
          borderRadius: '6px'
        }}>
          <Package size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <code style={{
            fontSize: '12px',
            color: 'var(--text)',
            fontFamily: 'monospace',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {selectedPackage.name}@{selectedPackage.version}
          </code>
          <button
            onClick={() => {
              onSelect('', '')
              // Focus the search input after clearing selection
              setTimeout(() => {
                inputRef.current?.focus()
              }, 0)
            }}
            style={{
              padding: '4px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              borderRadius: '4px',
              transition: 'all 0.2s',
              fontSize: '10px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--hover)'
              e.currentTarget.style.color = 'var(--accent)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--text-secondary)'
            }}
          >
            Change
          </button>
        </div>
      ) : selectedLocalFile ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          background: 'var(--input-bg)',
          border: '1px solid var(--input-border)',
          borderRadius: '6px'
        }}>
          <FileText size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <code style={{
            fontSize: '12px',
            color: 'var(--text)',
            fontFamily: 'monospace',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {selectedLocalFile}
          </code>
          <button
            onClick={() => {
              if (onLocalFileSelect) {
                onLocalFileSelect('')
              }
              // Focus the search input after clearing selection
              setTimeout(() => {
                inputRef.current?.focus()
              }, 0)
            }}
            style={{
              padding: '4px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              borderRadius: '4px',
              transition: 'all 0.2s',
              fontSize: '10px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--hover)'
              e.currentTarget.style.color = 'var(--accent)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--text-secondary)'
            }}
          >
            Change
          </button>
        </div>
      ) : (
        <>
          {/* Search input */}
          <div style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center'
          }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: '10px',
                color: 'var(--text-secondary)',
                pointerEvents: 'none'
              }}
            />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                const hasResults = isLocalSearch ? localFileResults.length > 0 : searchResults.length > 0
                if (!hasResults) return

                const resultsLength = isLocalSearch ? localFileResults.length : searchResults.length

                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setHighlightedIndex((prev) =>
                    prev < resultsLength - 1 ? prev + 1 : prev
                  )
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setHighlightedIndex((prev) => prev > 0 ? prev - 1 : prev)
                } else if (e.key === 'Enter' && showDropdown) {
                  e.preventDefault()
                  if (isLocalSearch && onLocalFileSelect) {
                    const selectedFile = localFileResults[highlightedIndex]
                    if (selectedFile) {
                      onLocalFileSelect(selectedFile)
                      setSearchQuery('')
                      setShowDropdown(false)
                      setLocalFileResults([])
                    }
                  } else {
                    const selectedPkg = searchResults[highlightedIndex]
                    if (selectedPkg) {
                      handleSelectPackage(selectedPkg)
                    }
                  }
                } else if (e.key === 'Escape') {
                  setShowDropdown(false)
                }
              }}
              placeholder={`Search packages (or type . for local ${fileExtensions.join(', ')} files)...`}
              style={{
                width: '100%',
                padding: '8px 12px 8px 32px',
                fontSize: '12px',
                border: '1px solid var(--input-border)',
                borderRadius: '6px',
                background: 'var(--input-bg)',
                color: 'var(--text)',
                fontFamily: 'monospace'
              }}
            />
            {isSearching && (
              <div style={{
                position: 'absolute',
                right: '10px',
                fontSize: '10px',
                color: 'var(--text-secondary)'
              }}>
                Searching...
              </div>
            )}
          </div>

          {/* Search results dropdown - Local files */}
          {showDropdown && isLocalSearch && localFileResults.length > 0 && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '4px',
              background: 'var(--panel)',
              border: '1px solid #6b7280',
              borderRadius: '6px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
              maxHeight: '200px',
              overflowY: 'auto',
              zIndex: 10000
            }}>
              {localFileResults.map((filePath, index) => (
                <div
                  key={`${filePath}-${index}`}
                  onClick={() => {
                    if (onLocalFileSelect) {
                      onLocalFileSelect(filePath)
                      setSearchQuery('')
                      setShowDropdown(false)
                      setLocalFileResults([])
                    }
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    borderBottom: index < localFileResults.length - 1 ? '1px solid var(--border)' : 'none',
                    background: index === highlightedIndex ? 'var(--accent)' : 'transparent',
                    transition: 'all 0.2s'
                  }}
                >
                  <FileText size={14} style={{
                    color: index === highlightedIndex ? 'white' : 'var(--accent)',
                    flexShrink: 0
                  }} />
                  <div style={{
                    fontSize: '12px',
                    fontWeight: '500',
                    color: index === highlightedIndex ? 'white' : 'var(--text)',
                    fontFamily: 'monospace',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {filePath}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Search results dropdown - Packages */}
          {showDropdown && !isLocalSearch && searchResults && searchResults.length > 0 && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '4px',
              background: 'var(--panel)',
              border: '1px solid #6b7280',
              borderRadius: '6px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
              maxHeight: '200px',
              overflowY: 'auto',
              zIndex: 10000
            }}>
              {searchResults.map((pkg, index) => (
                <div
                  key={`${pkg.name}-${pkg.version}-${index}`}
                  onClick={() => handleSelectPackage(pkg)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    borderBottom: index < searchResults.length - 1 ? '1px solid var(--border)' : 'none',
                    background: index === highlightedIndex ? 'var(--accent)' : 'transparent',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{
                    fontSize: '12px',
                    fontWeight: '600',
                    color: index === highlightedIndex ? 'white' : 'var(--text)',
                    fontFamily: 'monospace',
                    marginBottom: '2px'
                  }}>
                    {pkg.name}@{pkg.version}
                  </div>
                  {pkg.description && (
                    <div style={{
                      fontSize: '10px',
                      color: index === highlightedIndex ? 'rgba(255, 255, 255, 0.8)' : 'var(--text-secondary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {pkg.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* No results message */}
          {showDropdown && searchQuery.length >= 1 &&
           ((isLocalSearch && localFileResults.length === 0) ||
            (!isLocalSearch && searchResults.length === 0)) &&
           !isSearching && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '4px',
              padding: '12px',
              background: 'var(--panel)',
              border: '1px solid #6b7280',
              borderRadius: '6px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
              textAlign: 'center',
              zIndex: 10000
            }}>
              <p style={{
                fontSize: '11px',
                color: 'var(--text-secondary)',
                fontStyle: 'italic',
                margin: 0
              }}>
                {isLocalSearch
                  ? `No local ${fileExtensions.join(', ')} files found matching "${searchQuery}"`
                  : `No packages found for "${searchQuery}"`}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

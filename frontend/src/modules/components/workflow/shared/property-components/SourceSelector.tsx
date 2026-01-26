/**
 * SourceSelector - File/raw text toggle + search for prompt sources
 * Used by PromptNode and ChatAgentNode to select prompt source (file, package, or raw text)
 */

import { FileText, AlignLeft, Package, Search, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useSourceSearch } from '../hooks/useSourceSearch'
import { labelStyle, inputStyle, textareaStyle } from '../styles/propertyStyles'

export interface SourceSelectorProps {
  /** Current source type ('file' or 'raw') */
  sourceType: 'file' | 'raw'
  /** Current source file path or package reference */
  source?: string
  /** Current raw prompt text */
  rawPrompt?: string
  /** Called when source type changes */
  onSourceTypeChange: (type: 'file' | 'raw') => void
  /** Called when source changes */
  onSourceChange: (source: string) => void
  /** Called when raw prompt text changes */
  onRawPromptChange: (text: string) => void
  /** Label for source type section */
  label?: string
}

export function SourceSelector({
  sourceType,
  source,
  rawPrompt,
  onSourceTypeChange,
  onSourceChange,
  onRawPromptChange,
  label = 'Source Type',
}: SourceSelectorProps) {
  const {
    searchQuery,
    searchResults,
    localFileResults,
    isSearching,
    showDropdown,
    highlightedIndex,
    dropdownPosition,
    inputRef,
    isLocalSearch,
    selectedPackage,
    packageFiles,
    loadingPackageFiles,
    canSearchLocal,
    handleSearchChange,
    handleSelectLocalFile,
    handleSelectPackage,
    handleSelectPackageFile,
    setHighlightedIndex,
    setShowDropdown,
  } = useSourceSearch({
    onLocalFileSelect: (filePath) => {
      onSourceChange(filePath)
    },
    onPackageSelect: (packageName, version, file) => {
      if (file) {
        onSourceChange(`${packageName}@${version}/${file}`)
      } else {
        onSourceChange(`${packageName}@${version}`)
      }
    },
  })

  const handleSourceTypeChange = (newType: 'file' | 'raw') => {
    onSourceTypeChange(newType)
    // Clear the opposite source when switching
    if (newType === 'raw') {
      onSourceChange('')
    } else {
      onRawPromptChange('')
    }
  }

  return (
    <>
      {/* Source Type Toggle */}
      <div>
        <label style={labelStyle}>{label}</label>
        <div style={{
          display: 'flex',
          background: 'var(--panel-2)',
          borderRadius: '6px',
          padding: '2px',
          border: '1px solid var(--border)',
        }}>
          <button
            onClick={() => handleSourceTypeChange('file')}
            style={{
              flex: 1,
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: 500,
              border: 'none',
              borderRadius: '4px',
              background: sourceType === 'file' ? 'var(--accent)' : 'transparent',
              color: sourceType === 'file' ? 'white' : 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
            }}
          >
            <FileText size={12} />
            File
          </button>
          <button
            onClick={() => handleSourceTypeChange('raw')}
            style={{
              flex: 1,
              padding: '6px 10px',
              fontSize: '11px',
              fontWeight: 500,
              border: 'none',
              borderRadius: '4px',
              background: sourceType === 'raw' ? 'var(--accent)' : 'transparent',
              color: sourceType === 'raw' ? 'white' : 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
            }}
          >
            <AlignLeft size={12} />
            Raw Text
          </button>
        </div>
      </div>

      {/* Raw Text Mode */}
      {sourceType === 'raw' && (
        <div>
          <label style={labelStyle}>Prompt Text</label>
          <textarea
            value={rawPrompt || ''}
            onChange={(e) => onRawPromptChange(e.target.value)}
            placeholder="Enter your prompt text here...&#10;&#10;You can use {{ parameters }} and {{ previous_output }}"
            rows={8}
            style={{
              ...textareaStyle,
              minHeight: '150px',
              fontSize: '12px',
            }}
          />
          <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
            Supports {'{{ }}'} template expressions. Will be compiled as .prmd format.
          </p>
        </div>
      )}

      {/* File Source selector with local file and package search */}
      {sourceType === 'file' && (
        <div style={{ position: 'relative' }}>
          <label style={labelStyle}>Source (.prmd file or package)</label>

          {source ? (
            // Show selected source
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              background: 'var(--input-bg)',
              border: '1px solid var(--input-border)',
              borderRadius: '6px'
            }}>
              {source.startsWith('.') ? (
                <FileText size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              ) : (
                <Package size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              )}
              <code style={{
                fontSize: '12px',
                color: 'var(--text)',
                fontFamily: 'monospace',
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {source}
              </code>
              <button
                onClick={() => onSourceChange('')}
                style={{
                  padding: '4px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--muted)',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Clear selection"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            // Search input
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--muted)',
                  pointerEvents: 'none',
                }} />
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => {
                    if (searchQuery.length > 0) {
                      setShowDropdown(true)
                    }
                  }}
                  placeholder="Search packages or ./local/file.prmd"
                  style={{
                    ...inputStyle,
                    paddingLeft: '32px',
                  }}
                />
              </div>
              <p style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px' }}>
                Start with . for local files, or search registry packages
              </p>

              {/* Search Dropdown */}
              {showDropdown && dropdownPosition && createPortal(
                <div
                  style={{
                    position: 'fixed',
                    top: dropdownPosition.top,
                    left: dropdownPosition.left,
                    width: dropdownPosition.width,
                    maxHeight: '300px',
                    overflowY: 'auto',
                    background: 'var(--panel)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    zIndex: 10000,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {isSearching ? (
                    <div style={{ padding: '12px', textAlign: 'center', color: 'var(--muted)', fontSize: '11px' }}>
                      Searching...
                    </div>
                  ) : isLocalSearch ? (
                    // Local file results
                    !canSearchLocal ? (
                      <div style={{ padding: '12px', fontSize: '11px', color: 'var(--muted)' }}>
                        No workspace available. Open a folder to search local files.
                      </div>
                    ) : localFileResults.length === 0 ? (
                      <div style={{ padding: '12px', fontSize: '11px', color: 'var(--muted)' }}>
                        No .prmd files found matching "{searchQuery}"
                      </div>
                    ) : (
                      localFileResults.map((file, i) => (
                        <div
                          key={file}
                          onClick={() => handleSelectLocalFile(file)}
                          onMouseEnter={() => setHighlightedIndex(i)}
                          style={{
                            padding: '10px 12px',
                            cursor: 'pointer',
                            background: i === highlightedIndex ? 'var(--hover)' : 'transparent',
                            borderBottom: i < localFileResults.length - 1 ? '1px solid var(--border)' : 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                        >
                          <FileText size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                          <code style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text)' }}>
                            {file}
                          </code>
                        </div>
                      ))
                    )
                  ) : (
                    // Package results
                    searchResults.length === 0 ? (
                      <div style={{ padding: '12px', fontSize: '11px', color: 'var(--muted)' }}>
                        No packages found matching "{searchQuery}"
                      </div>
                    ) : (
                      searchResults.map((pkg, i) => (
                        <div
                          key={`${pkg.name}-${pkg.version}`}
                          onClick={() => handleSelectPackage(pkg)}
                          onMouseEnter={() => setHighlightedIndex(i)}
                          style={{
                            padding: '10px 12px',
                            cursor: 'pointer',
                            background: i === highlightedIndex ? 'var(--hover)' : 'transparent',
                            borderBottom: i < searchResults.length - 1 ? '1px solid var(--border)' : 'none',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Package size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)' }}>
                                {pkg.name}
                              </div>
                              {pkg.description && (
                                <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>
                                  {pkg.description}
                                </div>
                              )}
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                              v{pkg.version}
                            </div>
                          </div>
                        </div>
                      ))
                    )
                  )}
                </div>,
                document.body
              )}

              {/* Package File Selection (Step 2) */}
              {selectedPackage && packageFiles.length > 1 && (
                <div style={{
                  marginTop: '8px',
                  padding: '12px',
                  background: 'var(--panel-2)',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                }}>
                  <div style={{ fontSize: '11px', fontWeight: 500, marginBottom: '8px', color: 'var(--text)' }}>
                    Select a file from {selectedPackage.name}:
                  </div>
                  {packageFiles.map(file => (
                    <button
                      key={file}
                      onClick={() => handleSelectPackageFile(file)}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        marginBottom: '4px',
                        fontSize: '11px',
                        textAlign: 'left',
                        background: 'var(--input-bg)',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontFamily: 'monospace',
                        color: 'var(--text)',
                      }}
                    >
                      {file}
                    </button>
                  ))}
                </div>
              )}

              {loadingPackageFiles && (
                <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--muted)', textAlign: 'center' }}>
                  Loading package files...
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}

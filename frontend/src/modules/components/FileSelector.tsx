import { useState, useRef, useEffect } from 'react'
import { FileText, ChevronDown, Loader } from 'lucide-react'

interface FileSelectorProps {
  selectedFile: string
  onSelect: (filePath: string) => void
  files: string[]
  isLoading: boolean
  selectedPackage: { name: string; version: string } | null
  className?: string
}

export default function FileSelector({
  selectedFile,
  onSelect,
  files,
  isLoading,
  selectedPackage,
  className = ''
}: FileSelectorProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

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

  const handleSelectFile = (filePath: string) => {
    onSelect(filePath)
    setShowDropdown(false)
  }

  const getFileName = (filePath: string) => {
    return filePath.split('/').pop() || filePath
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
        Template file
      </label>

      {/* Selected file or selector button */}
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        disabled={!selectedPackage || isLoading}
        style={{
          width: '100%',
          padding: '8px 12px',
          fontSize: '12px',
          border: '1px solid var(--input-border)',
          borderRadius: '6px',
          background: 'var(--input-bg)',
          color: selectedFile ? 'var(--text)' : 'var(--text-secondary)',
          cursor: (selectedPackage && !isLoading) ? 'pointer' : 'not-allowed',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          transition: 'all 0.2s',
          opacity: (selectedPackage && !isLoading) ? 1 : 0.5,
          textAlign: 'left'
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flex: 1,
          overflow: 'hidden'
        }}>
          {isLoading ? (
            <>
              <Loader size={14} style={{ flexShrink: 0, animation: 'spin 1s linear infinite' }} />
              <span>Loading files...</span>
            </>
          ) : selectedFile ? (
            <>
              <FileText size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <code style={{
                fontFamily: 'monospace',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {selectedFile}
              </code>
            </>
          ) : (
            <span>{selectedPackage ? 'Select a .prmd file' : 'Select package first'}</span>
          )}
        </div>
        {!isLoading && <ChevronDown size={14} style={{ flexShrink: 0 }} />}
      </button>

      {/* Dropdown */}
      {showDropdown && selectedPackage && !isLoading && (
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
          maxHeight: '250px',
          overflowY: 'auto',
          zIndex: 1000
        }}>
          {files.length > 0 ? (
            files.map((filePath, index) => (
              <div
                key={filePath}
                onClick={() => handleSelectFile(filePath)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  borderBottom: index < files.length - 1 ? '1px solid var(--border)' : 'none',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--hover)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <FileText size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: '500',
                    color: 'var(--text)',
                    fontFamily: 'monospace',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {getFileName(filePath)}
                  </div>
                  {filePath.includes('/') && (
                    <div style={{
                      fontSize: '10px',
                      color: 'var(--text-secondary)',
                      fontFamily: 'monospace',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {filePath}
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div style={{
              padding: '12px',
              textAlign: 'center'
            }}>
              <p style={{
                fontSize: '11px',
                color: 'var(--text-secondary)',
                fontStyle: 'italic'
              }}>
                No .prmd files found in this package
              </p>
            </div>
          )}
        </div>
      )}

      {/* Helper text */}
      <div style={{
        marginTop: '4px',
        fontSize: '10px',
        color: 'var(--text-secondary)',
        fontStyle: 'italic'
      }}>
        {selectedPackage
          ? `Choose which template to inherit from ${selectedPackage.name}`
          : 'Select a package to see available templates'}
      </div>
    </div>
  )
}

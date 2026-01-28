import { useState, useEffect, useRef } from 'react'
import { ChevronDown, FileText, X } from 'lucide-react'
import { findEnvFiles, loadEnvVars } from '../services/envLoader'

interface Props {
  workspacePath: string | null
  selectedEnvFile: string | null
  onEnvFileChange: (file: string | null) => void
  compact?: boolean
  theme?: 'light' | 'dark'
}

/**
 * Dropdown selector for .env files in the workspace.
 * Shows available .env files and allows user to select one for execution.
 * Selection is optional - user can choose "None" to not use any .env file.
 */
export function EnvFileSelector({
  workspacePath,
  selectedEnvFile,
  onEnvFileChange,
  compact = false,
  theme = 'dark'
}: Props) {
  const [envFiles, setEnvFiles] = useState<string[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)

  // Load .env files when workspace changes
  useEffect(() => {
    if (!workspacePath) {
      setEnvFiles([])
      return
    }

    setIsLoading(true)
    findEnvFiles(workspacePath)
      .then(files => {
        setEnvFiles(files)
      })
      .catch(err => {
        console.warn('[EnvFileSelector] Failed to load .env files:', err)
        setEnvFiles([])
      })
      .finally(() => setIsLoading(false))
  }, [workspacePath])

  // Load env vars when selection changes (for intellisense)
  useEffect(() => {
    if (!workspacePath) return

    // Load env vars so intellisense can show suggestions
    loadEnvVars(workspacePath, selectedEnvFile)
      .then(vars => {
        console.log('[EnvFileSelector] Loaded', Object.keys(vars).length, 'env vars for intellisense')
      })
      .catch(err => {
        console.warn('[EnvFileSelector] Failed to load env vars:', err)
      })
  }, [workspacePath, selectedEnvFile])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Don't render if no .env files found
  if (envFiles.length === 0 && !isLoading) {
    return null
  }

  const openDropdown = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setMenuPos({
        top: rect.bottom + 4,
        left: rect.left
      })
    }
    setIsOpen(true)
  }

  const handleSelect = (file: string | null) => {
    onEnvFileChange(file)
    setIsOpen(false)
  }

  const displayValue = selectedEnvFile || 'No .env'

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={buttonRef}
        onClick={() => isOpen ? setIsOpen(false) : openDropdown()}
        disabled={isLoading}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: compact ? '4px' : '6px',
          padding: compact ? '4px 8px' : '6px 10px',
          fontSize: '12px',
          fontWeight: 500,
          border: '1px solid var(--border)',
          borderRadius: '6px',
          background: selectedEnvFile ? 'rgba(16, 185, 129, 0.1)' : 'var(--panel-2)',
          color: selectedEnvFile ? '#10b981' : 'var(--text-secondary)',
          cursor: isLoading ? 'wait' : 'pointer',
          transition: 'all 0.2s',
          whiteSpace: 'nowrap',
          maxWidth: compact ? '100px' : '140px',
          overflow: 'hidden'
        }}
        onMouseOver={(e) => {
          if (!isLoading) {
            e.currentTarget.style.borderColor = 'var(--accent)'
          }
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.borderColor = 'var(--border)'
        }}
        title={selectedEnvFile ? `Using ${selectedEnvFile}` : 'Select .env file for execution'}
      >
        <FileText size={12} style={{ flexShrink: 0 }} />
        <span style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
          {isLoading ? 'Loading...' : displayValue}
        </span>
        <ChevronDown
          size={12}
          style={{
            flexShrink: 0,
            transform: isOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s'
          }}
        />
      </button>

      {/* Clear button when file is selected */}
      {selectedEnvFile && !compact && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onEnvFileChange(null)
          }}
          style={{
            position: 'absolute',
            right: '-8px',
            top: '-8px',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            border: 'none',
            background: 'var(--text-secondary)',
            color: 'var(--panel)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0
          }}
          title="Clear .env selection"
        >
          <X size={10} />
        </button>
      )}

      {/* Dropdown menu */}
      {isOpen && menuPos && (
        <>
          {/* Backdrop */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9998
            }}
            onClick={() => setIsOpen(false)}
          />

          {/* Menu */}
          <div
            ref={dropdownRef}
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              minWidth: '160px',
              maxWidth: '250px',
              background: theme === 'dark' ? '#1e293b' : '#ffffff',
              border: theme === 'dark' ? '1px solid rgba(71, 85, 105, 0.3)' : '1px solid #e2e8f0',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              zIndex: 9999,
              overflow: 'hidden'
            }}
          >
            {/* None option */}
            <button
              onClick={() => handleSelect(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '10px 12px',
                border: 'none',
                background: !selectedEnvFile
                  ? (theme === 'dark' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.1)')
                  : 'transparent',
                color: 'var(--text)',
                fontSize: '12px',
                cursor: 'pointer',
                textAlign: 'left'
              }}
              onMouseOver={(e) => {
                if (selectedEnvFile) {
                  e.currentTarget.style.background = theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
                }
              }}
              onMouseOut={(e) => {
                if (selectedEnvFile) {
                  e.currentTarget.style.background = 'transparent'
                }
              }}
            >
              <span style={{ color: 'var(--text-secondary)' }}>None</span>
              {!selectedEnvFile && (
                <span style={{ marginLeft: 'auto', color: 'var(--accent)', fontSize: '11px' }}>
                  selected
                </span>
              )}
            </button>

            {/* Divider */}
            <div style={{
              height: '1px',
              background: theme === 'dark' ? 'rgba(71, 85, 105, 0.3)' : '#e2e8f0',
              margin: '4px 0'
            }} />

            {/* .env files */}
            {envFiles.map(file => (
              <button
                key={file}
                onClick={() => handleSelect(file)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '10px 12px',
                  border: 'none',
                  background: selectedEnvFile === file
                    ? (theme === 'dark' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.1)')
                    : 'transparent',
                  color: selectedEnvFile === file ? '#10b981' : 'var(--text)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'monospace'
                }}
                onMouseOver={(e) => {
                  if (selectedEnvFile !== file) {
                    e.currentTarget.style.background = theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
                  }
                }}
                onMouseOut={(e) => {
                  if (selectedEnvFile !== file) {
                    e.currentTarget.style.background = 'transparent'
                  }
                }}
              >
                <FileText size={12} style={{ flexShrink: 0, opacity: 0.6 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{file}</span>
                {selectedEnvFile === file && (
                  <span style={{ marginLeft: 'auto', fontSize: '11px' }}>
                    selected
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

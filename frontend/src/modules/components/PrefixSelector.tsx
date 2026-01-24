import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Plus } from 'lucide-react'

interface PrefixSelectorProps {
  value: string
  onChange: (prefix: string) => void
  existingPrefixes: string[]
  selectedPackage: { name: string; version: string } | null
  className?: string
}

export default function PrefixSelector({
  value,
  onChange,
  existingPrefixes,
  selectedPackage,
  className = ''
}: PrefixSelectorProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [customPrefix, setCustomPrefix] = useState('')
  const [validationError, setValidationError] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Filter existing prefixes to show those matching the selected package
  const matchingPrefixes = existingPrefixes.filter(prefix => {
    // In a real implementation, you'd check if this prefix maps to the selected package
    // For now, we'll show all existing prefixes
    return true
  })

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
        setShowCustomInput(false)
      }
    }

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDropdown])

  const validatePrefix = (prefix: string): string | null => {
    if (!prefix.trim()) {
      return 'Prefix cannot be empty'
    }

    // Auto-prepend @ if not present
    const normalizedPrefix = prefix.startsWith('@') ? prefix : `@${prefix}`

    if (!/^@[a-z][a-z0-9-]*$/i.test(normalizedPrefix)) {
      return 'Prefix must contain only letters, numbers, and hyphens'
    }
    if (existingPrefixes.includes(normalizedPrefix)) {
      return 'Prefix already exists'
    }
    return null
  }

  const handleSelectExisting = (prefix: string) => {
    onChange(prefix)
    setShowDropdown(false)
    setShowCustomInput(false)
  }

  const handleCreateCustom = () => {
    const error = validatePrefix(customPrefix)
    if (error) {
      setValidationError(error)
      return
    }

    // Auto-prepend @ if not present
    const normalizedPrefix = customPrefix.startsWith('@') ? customPrefix : `@${customPrefix}`
    onChange(normalizedPrefix)
    setCustomPrefix('')
    setValidationError('')
    setShowDropdown(false)
    setShowCustomInput(false)
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
        Prefix (optional)
      </label>

      {/* Selected prefix or selector button */}
      {value ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          background: 'var(--input-bg)',
          border: '1px solid var(--input-border)',
          borderRadius: '6px'
        }}>
          <code style={{
            fontSize: '12px',
            color: 'var(--accent)',
            fontFamily: 'monospace',
            fontWeight: '600',
            flex: 1
          }}>
            {value}
          </code>
          <button
            onClick={() => onChange('')}
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
            Clear
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          disabled={!selectedPackage}
          style={{
            width: '100%',
            padding: '8px 12px',
            fontSize: '12px',
            border: '1px solid var(--input-border)',
            borderRadius: '6px',
            background: 'var(--input-bg)',
            color: selectedPackage ? 'var(--text)' : 'var(--text-secondary)',
            cursor: selectedPackage ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            transition: 'all 0.2s',
            opacity: selectedPackage ? 1 : 0.5
          }}
        >
          <span>{selectedPackage ? 'Select or create prefix' : 'Select package first'}</span>
          <ChevronDown size={14} />
        </button>
      )}

      {/* Dropdown */}
      {showDropdown && selectedPackage && (
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
          zIndex: 1000
        }}>
          {/* Existing prefixes */}
          {matchingPrefixes.length > 0 && (
            <>
              <div style={{
                padding: '6px 12px',
                fontSize: '10px',
                fontWeight: '600',
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                borderBottom: '1px solid var(--border)'
              }}>
                Existing Prefixes
              </div>
              {matchingPrefixes.map((prefix) => (
                <div
                  key={prefix}
                  onClick={() => handleSelectExisting(prefix)}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border)',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--hover)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <code style={{
                    fontSize: '12px',
                    fontWeight: '600',
                    color: 'var(--accent)',
                    fontFamily: 'monospace'
                  }}>
                    {prefix}
                  </code>
                </div>
              ))}
            </>
          )}

          {/* Create new prefix */}
          {!showCustomInput ? (
            <div
              onClick={() => setShowCustomInput(true)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--hover)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <Plus size={14} style={{ color: 'var(--accent)' }} />
              <span style={{
                fontSize: '12px',
                color: 'var(--text)',
                fontWeight: '500'
              }}>
                Create new prefix
              </span>
            </div>
          ) : (
            <div style={{
              padding: '8px 12px'
            }}>
              <input
                type="text"
                value={customPrefix}
                onChange={(e) => {
                  setCustomPrefix(e.target.value)
                  setValidationError('')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateCustom()
                  if (e.key === 'Escape') {
                    setShowCustomInput(false)
                    setCustomPrefix('')
                    setValidationError('')
                  }
                }}
                placeholder="@prefix"
                autoFocus
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  fontSize: '12px',
                  border: `1px solid ${validationError ? 'var(--error)' : 'var(--input-border)'}`,
                  borderRadius: '4px',
                  background: 'var(--input-bg)',
                  color: 'var(--text)',
                  fontFamily: 'monospace',
                  marginBottom: validationError ? '4px' : 0
                }}
              />
              {validationError && (
                <div style={{
                  fontSize: '10px',
                  color: 'var(--error)',
                  marginBottom: '6px'
                }}>
                  {validationError}
                </div>
              )}
              <div style={{
                display: 'flex',
                gap: '6px',
                marginTop: '6px'
              }}>
                <button
                  onClick={handleCreateCustom}
                  style={{
                    flex: 1,
                    padding: '4px 8px',
                    fontSize: '11px',
                    background: 'var(--accent)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setShowCustomInput(false)
                    setCustomPrefix('')
                    setValidationError('')
                  }}
                  style={{
                    flex: 1,
                    padding: '4px 8px',
                    fontSize: '11px',
                    background: 'transparent',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
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
          ? 'Leave empty for no prefix, or select/create one for easier references'
          : 'Select a package to choose a prefix'}
      </div>
    </div>
  )
}

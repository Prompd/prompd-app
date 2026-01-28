import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

type Props = {
  value: string
  onChange: (version: string) => void
  placeholder?: string
  compact?: boolean  // Use smaller padding/font to match other form inputs
  hideHelperText?: boolean  // Hide the helper text below the input
  colors: {
    input: string
    border: string
    text: string
    textSecondary: string
    primary: string
    bgSecondary: string
  }
}

// Parse semver string into parts
function parseSemver(version: string): { major: number; minor: number; patch: number } | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10)
  }
}

// Generate version suggestions based on current version
function getVersionSuggestions(currentVersion: string): { label: string; version: string; description: string }[] {
  const parsed = parseSemver(currentVersion)

  if (!parsed) {
    // Default suggestions when no valid version
    return [
      { label: '1.0.0', version: '1.0.0', description: 'Initial release' },
      { label: '0.1.0', version: '0.1.0', description: 'Pre-release' },
      { label: '0.0.1', version: '0.0.1', description: 'Early development' }
    ]
  }

  const { major, minor, patch } = parsed

  return [
    {
      label: `${major}.${minor}.${patch + 1}`,
      version: `${major}.${minor}.${patch + 1}`,
      description: 'Patch - bug fixes'
    },
    {
      label: `${major}.${minor + 1}.0`,
      version: `${major}.${minor + 1}.0`,
      description: 'Minor - new features'
    },
    {
      label: `${major + 1}.0.0`,
      version: `${major + 1}.0.0`,
      description: 'Major - breaking changes'
    }
  ]
}

export default function VersionInput({ value, onChange, placeholder = '1.0.0', compact = false, hideHelperText = false, colors }: Props) {
  // Style values based on compact mode
  const padding = compact ? '8px 12px' : '10px 12px'
  const fontSize = compact ? '13px' : '14px'
  const borderRadius = compact ? '6px' : '8px'
  const [showDropdown, setShowDropdown] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const suggestions = getVersionSuggestions(value)
  const isValidSemver = parseSemver(value) !== null

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 0 }}>
        <input
          ref={inputRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            flex: 1,
            padding,
            background: colors.input,
            borderTop: `1px solid ${isFocused ? colors.primary : colors.border}`,
            borderBottom: `1px solid ${isFocused ? colors.primary : colors.border}`,
            borderLeft: `1px solid ${isFocused ? colors.primary : colors.border}`,
            borderRight: 'none',
            borderRadius: `${borderRadius} 0 0 ${borderRadius}`,
            color: colors.text,
            fontSize,
            fontFamily: 'monospace',
            transition: 'border-color 0.2s',
            outline: 'none'
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
        <button
          type="button"
          onClick={() => setShowDropdown(!showDropdown)}
          style={{
            padding,
            background: colors.input,
            border: `1px solid ${isFocused || showDropdown ? colors.primary : colors.border}`,
            borderRadius: `0 ${borderRadius} ${borderRadius} 0`,
            color: colors.textSecondary,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'border-color 0.2s, background 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = colors.bgSecondary}
          onMouseLeave={(e) => e.currentTarget.style.background = colors.input}
        >
          <ChevronDown size={16} style={{
            transform: showDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s'
          }} />
        </button>
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: 4,
          background: colors.bgSecondary,
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          zIndex: 100,
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '8px 12px',
            fontSize: '11px',
            fontWeight: 600,
            color: colors.textSecondary,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            borderBottom: `1px solid ${colors.border}`
          }}>
            {isValidSemver ? 'Bump Version' : 'Suggested Versions'}
          </div>
          {suggestions.map((suggestion, i) => (
            <button
              key={suggestion.version}
              type="button"
              onClick={() => {
                onChange(suggestion.version)
                setShowDropdown(false)
                inputRef.current?.focus()
              }}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: 'transparent',
                border: 'none',
                borderBottom: i < suggestions.length - 1 ? `1px solid ${colors.border}` : 'none',
                color: colors.text,
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                textAlign: 'left',
                transition: 'background 0.15s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = colors.input}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{
                fontFamily: 'monospace',
                fontWeight: 600,
                fontSize: '14px'
              }}>
                {suggestion.label}
              </span>
              <span style={{
                fontSize: '12px',
                color: colors.textSecondary
              }}>
                {suggestion.description}
              </span>
            </button>
          ))}
        </div>
      )}

      {!hideHelperText && (
        <small style={{
          color: isValidSemver || !value ? colors.textSecondary : '#ef4444',
          display: 'block',
          marginTop: 8,
          fontSize: '13px'
        }}>
          {!value ? 'Semantic version (x.y.z)' :
           isValidSemver ? 'Semantic version (x.y.z)' :
           'Invalid format - use x.y.z (e.g., 1.0.0)'}
        </small>
      )}
    </div>
  )
}

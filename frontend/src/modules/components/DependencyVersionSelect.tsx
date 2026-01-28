import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Loader } from 'lucide-react'
import { registryApi } from '../services/registryApi'

type Props = {
  packageName: string  // e.g., "@prompd/core"
  value: string        // Current version
  onChange: (version: string) => void
  compact?: boolean
  colors: {
    input: string
    border: string
    text: string
    textSecondary: string
    textMuted?: string
    primary: string
    bgSecondary: string
    accent?: string
  }
}

/**
 * Version selector for dependencies that fetches available versions from the registry.
 * Shows a dropdown of released versions instead of increment buttons.
 */
export default function DependencyVersionSelect({
  packageName,
  value,
  onChange,
  compact = false,
  colors
}: Props) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [versions, setVersions] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isHovered, setIsHovered] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Style values based on compact mode
  const padding = compact ? '6px 10px' : '8px 12px'
  const fontSize = compact ? '12px' : '13px'
  const borderRadius = compact ? '4px' : '6px'

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

  // Fetch versions when dropdown opens (always fetch fresh data)
  useEffect(() => {
    if (!showDropdown) return

    const fetchVersions = async () => {
      setLoading(true)
      setError(null)
      try {
        // Force fresh fetch to get latest versions (bypass cache)
        const result = await registryApi.getPackageVersions(packageName, true)
        setVersions(result)
        if (result.length === 0) {
          setError('No versions found')
        }
      } catch (err) {
        console.error('[DependencyVersionSelect] Failed to fetch versions:', err)
        setError('Failed to load versions')
      } finally {
        setLoading(false)
      }
    }

    fetchVersions()
  }, [showDropdown, packageName])

  // Clear cached versions when package name changes
  useEffect(() => {
    setVersions([])
    setError(null)
  }, [packageName])

  const handleSelect = (version: string) => {
    onChange(version)
    setShowDropdown(false)
  }

  // Determine border color based on state
  const borderColor = showDropdown ? colors.primary : isHovered ? colors.textSecondary : colors.border

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setShowDropdown(!showDropdown)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '6px',
          width: '100%',
          padding,
          background: isHovered && !showDropdown ? colors.bgSecondary : colors.input,
          border: `1px solid ${borderColor}`,
          borderRadius,
          color: colors.text,
          fontSize,
          fontFamily: 'monospace',
          cursor: 'pointer',
          transition: 'border-color 0.15s, background 0.15s'
        }}
      >
        <span style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          @{value}
        </span>
        <ChevronDown
          size={14}
          style={{
            flexShrink: 0,
            color: colors.textSecondary,
            transform: showDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s'
          }}
        />
      </button>

      {/* Dropdown */}
      {showDropdown && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          minWidth: '140px',
          marginTop: 4,
          background: colors.bgSecondary,
          border: `1px solid ${colors.border}`,
          borderRadius: 6,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          zIndex: 100,
          overflow: 'hidden',
          maxHeight: '200px',
          overflowY: 'auto'
        }}>
          {/* Header */}
          <div style={{
            padding: '6px 10px',
            fontSize: '10px',
            fontWeight: 600,
            color: colors.textSecondary,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            borderBottom: `1px solid ${colors.border}`,
            background: colors.input,
            position: 'sticky',
            top: 0
          }}>
            Available Versions
          </div>

          {/* Loading state */}
          {loading && (
            <div style={{
              padding: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              color: colors.textSecondary,
              fontSize: '12px'
            }}>
              <Loader size={14} className="animate-spin" />
              <span>Loading versions...</span>
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div style={{
              padding: '12px',
              color: colors.textMuted || colors.textSecondary,
              fontSize: '12px',
              textAlign: 'center'
            }}>
              {error}
            </div>
          )}

          {/* Version list */}
          {!loading && !error && versions.map((version, i) => (
            <button
              key={version}
              type="button"
              onClick={() => handleSelect(version)}
              style={{
                width: '100%',
                padding: '8px 10px',
                background: version === value ? colors.input : 'transparent',
                border: 'none',
                borderBottom: i < versions.length - 1 ? `1px solid ${colors.border}` : 'none',
                color: version === value ? (colors.accent || colors.primary) : colors.text,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                textAlign: 'left',
                fontFamily: 'monospace',
                fontSize: '12px',
                transition: 'background 0.15s'
              }}
              onMouseEnter={(e) => {
                if (version !== value) {
                  e.currentTarget.style.background = colors.input
                }
              }}
              onMouseLeave={(e) => {
                if (version !== value) {
                  e.currentTarget.style.background = 'transparent'
                }
              }}
            >
              <span>{version}</span>
              {version === value && (
                <span style={{
                  fontSize: '10px',
                  color: colors.textSecondary,
                  fontFamily: 'system-ui, sans-serif'
                }}>
                  current
                </span>
              )}
              {i === 0 && version !== value && (
                <span style={{
                  fontSize: '10px',
                  color: colors.accent || colors.primary,
                  fontFamily: 'system-ui, sans-serif'
                }}>
                  latest
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

import { useState, useRef, useEffect } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'

type Props = {
  value: string
  onChange: (version: string) => void
  colors: {
    input: string
    border: string
    text: string
    textSecondary: string
    primary: string
    bgSecondary: string
  }
}

type Segment = 'major' | 'minor' | 'patch' | null

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

export default function VersionSegmentInput({ value, onChange, colors }: Props) {
  const parsed = parseSemver(value)
  const [major, setMajor] = useState(parsed?.major ?? 1)
  const [minor, setMinor] = useState(parsed?.minor ?? 0)
  const [patch, setPatch] = useState(parsed?.patch ?? 0)
  const [activeSegment, setActiveSegment] = useState<Segment>(null)
  const [isFocused, setIsFocused] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync internal state when external value changes
  useEffect(() => {
    const parsed = parseSemver(value)
    if (parsed) {
      setMajor(parsed.major)
      setMinor(parsed.minor)
      setPatch(parsed.patch)
    }
  }, [value])

  // Update parent when any part changes
  const updateVersion = (newMajor: number, newMinor: number, newPatch: number) => {
    setMajor(newMajor)
    setMinor(newMinor)
    setPatch(newPatch)
    onChange(`${newMajor}.${newMinor}.${newPatch}`)
  }

  const increment = (segment: Segment) => {
    if (!segment) return
    if (segment === 'major') updateVersion(major + 1, 0, 0)
    else if (segment === 'minor') updateVersion(major, minor + 1, 0)
    else if (segment === 'patch') updateVersion(major, minor, patch + 1)
  }

  const decrement = (segment: Segment) => {
    if (!segment) return
    if (segment === 'major' && major > 0) updateVersion(major - 1, minor, patch)
    else if (segment === 'minor' && minor > 0) updateVersion(major, minor - 1, patch)
    else if (segment === 'patch' && patch > 0) updateVersion(major, minor, patch - 1)
  }

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Set default segment if none active
    const segment = activeSegment || 'major'
    if (!activeSegment) setActiveSegment('major')

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      increment(segment)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      decrement(segment)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      if (segment === 'major') setActiveSegment('minor')
      else if (segment === 'minor') setActiveSegment('patch')
      // patch stays on patch (end of line)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      if (segment === 'patch') setActiveSegment('minor')
      else if (segment === 'minor') setActiveSegment('major')
      // major stays on major (start of line)
    } else if (e.key === 'Tab') {
      // Allow Tab to move focus out of the control
      if (e.shiftKey) {
        // Shift+Tab: move left or exit
        if (segment === 'major') return // let focus leave
        e.preventDefault()
        if (segment === 'patch') setActiveSegment('minor')
        else if (segment === 'minor') setActiveSegment('major')
      } else {
        // Tab: move right or exit
        if (segment === 'patch') return // let focus leave
        e.preventDefault()
        if (segment === 'major') setActiveSegment('minor')
        else if (segment === 'minor') setActiveSegment('patch')
      }
    }
  }

  // Handle scroll wheel on segments
  const handleWheel = (e: React.WheelEvent, segment: Segment) => {
    e.preventDefault()
    if (e.deltaY < 0) increment(segment)
    else decrement(segment)
  }

  // Close active segment when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActiveSegment(null)
        setIsFocused(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const segmentStyle = (segment: Segment) => ({
    padding: '2px 6px',
    borderRadius: 4,
    cursor: 'pointer',
    background: activeSegment === segment ? colors.primary : 'transparent',
    color: activeSegment === segment ? '#fff' : colors.text,
    transition: 'all 0.15s ease',
    fontFamily: 'monospace',
    fontWeight: 600,
    fontSize: '15px',
    minWidth: '32px',
    textAlign: 'center' as const,
    display: 'inline-block'
  })

  const dotStyle = {
    color: colors.textSecondary,
    fontSize: '15px',
    fontWeight: 600,
    padding: '0 1px',
    userSelect: 'none' as const
  }

  const arrowButtonStyle = (disabled: boolean) => ({
    background: 'transparent',
    border: 'none',
    padding: '2px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    color: disabled ? colors.border : colors.textSecondary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    transition: 'color 0.15s, background 0.15s'
  })

  return (
    <div ref={containerRef}>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '4px 10px',
          background: colors.input,
          border: `1px solid ${isFocused ? colors.primary : colors.border}`,
          borderRadius: 8,
          transition: 'border-color 0.2s',
          gap: 8
        }}
        tabIndex={0}
        onFocus={() => {
          setIsFocused(true)
          if (!activeSegment) setActiveSegment('major')
        }}
        onBlur={() => {
          // Don't blur if clicking within container
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Version segments */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span
            style={segmentStyle('major')}
            onClick={() => setActiveSegment('major')}
            onWheel={(e) => handleWheel(e, 'major')}
            title="Major version - Click to select, scroll or arrow keys to change"
          >
            {major}
          </span>
          <span style={dotStyle}>.</span>
          <span
            style={segmentStyle('minor')}
            onClick={() => setActiveSegment('minor')}
            onWheel={(e) => handleWheel(e, 'minor')}
            title="Minor version - Click to select, scroll or arrow keys to change"
          >
            {minor}
          </span>
          <span style={dotStyle}>.</span>
          <span
            style={segmentStyle('patch')}
            onClick={() => setActiveSegment('patch')}
            onWheel={(e) => handleWheel(e, 'patch')}
            title="Patch version - Click to select, scroll or arrow keys to change"
          >
            {patch}
          </span>
        </div>

        {/* Up/Down arrows - always rendered but hidden when no segment selected */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          marginLeft: 4,
          visibility: activeSegment ? 'visible' : 'hidden'
        }}>
          <button
            type="button"
            style={arrowButtonStyle(false)}
            onClick={() => increment(activeSegment)}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = colors.bgSecondary
              e.currentTarget.style.color = colors.text
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = colors.textSecondary
            }}
            title={activeSegment ? `Increment ${activeSegment}` : ''}
          >
            <ChevronUp size={14} />
          </button>
          <button
            type="button"
            style={arrowButtonStyle(
              (activeSegment === 'major' && major === 0) ||
              (activeSegment === 'minor' && minor === 0) ||
              (activeSegment === 'patch' && patch === 0)
            )}
            onClick={() => decrement(activeSegment)}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = colors.bgSecondary
              e.currentTarget.style.color = colors.text
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = colors.textSecondary
            }}
            title={activeSegment ? `Decrement ${activeSegment}` : ''}
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      <small style={{
        color: colors.textSecondary,
        display: 'block',
        marginTop: 8,
        fontSize: '13px'
      }}>
        Click segment to select, then use arrows or scroll to change
      </small>
    </div>
  )
}
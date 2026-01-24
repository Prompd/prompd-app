import { useState, useRef, useEffect } from 'react'

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

export default function VersionNumberInput({ value, onChange, colors }: Props) {
  const parsed = parseSemver(value)
  const [major, setMajor] = useState(parsed?.major ?? 1)
  const [minor, setMinor] = useState(parsed?.minor ?? 0)
  const [patch, setPatch] = useState(parsed?.patch ?? 0)
  const [isFocused, setIsFocused] = useState(false)

  const majorRef = useRef<HTMLInputElement>(null)
  const minorRef = useRef<HTMLInputElement>(null)
  const patchRef = useRef<HTMLInputElement>(null)

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
    onChange(`${newMajor}.${newMinor}.${newPatch}`)
  }

  const handleMajorChange = (val: string) => {
    const num = Math.max(0, parseInt(val, 10) || 0)
    setMajor(num)
    updateVersion(num, minor, patch)
  }

  const handleMinorChange = (val: string) => {
    const num = Math.max(0, parseInt(val, 10) || 0)
    setMinor(num)
    updateVersion(major, num, patch)
  }

  const handlePatchChange = (val: string) => {
    const num = Math.max(0, parseInt(val, 10) || 0)
    setPatch(num)
    updateVersion(major, minor, num)
  }

  // Auto-advance to next field when typing
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, field: 'major' | 'minor' | 'patch') => {
    if (e.key === '.' || e.key === 'Tab') {
      e.preventDefault()
      if (field === 'major') minorRef.current?.focus()
      else if (field === 'minor') patchRef.current?.focus()
    }
    if (e.key === 'Backspace' && e.currentTarget.value === '') {
      e.preventDefault()
      if (field === 'patch') minorRef.current?.focus()
      else if (field === 'minor') majorRef.current?.focus()
    }
  }

  const inputStyle = {
    width: '48px',
    padding: '10px 8px',
    background: colors.input,
    border: `1px solid ${isFocused ? colors.primary : colors.border}`,
    borderRadius: 8,
    color: colors.text,
    fontSize: '14px',
    fontFamily: 'monospace',
    fontWeight: 600,
    textAlign: 'center' as const,
    transition: 'border-color 0.2s',
    outline: 'none'
  }

  const dotStyle = {
    color: colors.textSecondary,
    fontSize: '18px',
    fontWeight: 700,
    padding: '0 4px',
    userSelect: 'none' as const
  }

  const labelStyle = {
    fontSize: '10px',
    color: colors.textSecondary,
    textAlign: 'center' as const,
    marginTop: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px'
  }

  return (
    <div>
      <div
        style={{ display: 'flex', alignItems: 'center' }}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <input
            ref={majorRef}
            type="number"
            min="0"
            value={major}
            onChange={e => handleMajorChange(e.target.value)}
            onKeyDown={e => handleKeyDown(e, 'major')}
            style={inputStyle}
          />
          <span style={labelStyle}>Major</span>
        </div>

        <span style={dotStyle}>.</span>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <input
            ref={minorRef}
            type="number"
            min="0"
            value={minor}
            onChange={e => handleMinorChange(e.target.value)}
            onKeyDown={e => handleKeyDown(e, 'minor')}
            style={inputStyle}
          />
          <span style={labelStyle}>Minor</span>
        </div>

        <span style={dotStyle}>.</span>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <input
            ref={patchRef}
            type="number"
            min="0"
            value={patch}
            onChange={e => handlePatchChange(e.target.value)}
            onKeyDown={e => handleKeyDown(e, 'patch')}
            style={inputStyle}
          />
          <span style={labelStyle}>Patch</span>
        </div>
      </div>

      <small style={{
        color: colors.textSecondary,
        display: 'block',
        marginTop: 8,
        fontSize: '13px'
      }}>
        Semantic version (major.minor.patch)
      </small>
    </div>
  )
}

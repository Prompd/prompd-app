import React, { useState, useRef, KeyboardEvent } from 'react'
import { X } from 'lucide-react'

interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  maxTags?: number
  disabled?: boolean
  theme?: 'light' | 'dark'
}

/**
 * Pill-style tag input component for managing tags/keywords
 * Supports adding via Enter/comma, removing via X button or backspace
 * Uses CSS variables to match other form inputs in the app
 */
export function TagInput({
  tags,
  onChange,
  placeholder = 'Add tag...',
  maxTags = 20,
  disabled = false,
  theme = 'dark'
}: TagInputProps) {
  const [inputValue, setInputValue] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const isDark = theme === 'dark'

  const addTag = (tag: string) => {
    const trimmed = tag.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    if (trimmed && !tags.includes(trimmed) && tags.length < maxTags) {
      onChange([...tags, trimmed])
    }
    setInputValue('')
  }

  const removeTag = (tagToRemove: string) => {
    onChange(tags.filter(t => t !== tagToRemove))
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (inputValue.trim()) {
        addTag(inputValue)
      }
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      removeTag(tags[tags.length - 1])
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    // If user pastes or types a comma, split and add tags
    if (value.includes(',')) {
      const parts = value.split(',')
      parts.forEach((part, i) => {
        if (i < parts.length - 1) {
          addTag(part)
        } else {
          setInputValue(part)
        }
      })
    } else {
      setInputValue(value)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 12px',
        minHeight: '38px',
        borderRadius: '6px',
        border: `1px solid ${isFocused ? 'var(--accent)' : 'var(--input-border)'}`,
        background: 'var(--input-bg)',
        cursor: disabled ? 'not-allowed' : 'text',
        opacity: disabled ? 0.7 : 1,
        transition: 'border-color 0.15s ease'
      }}
      onClick={() => !disabled && inputRef.current?.focus()}
    >
      {tags.map(tag => (
        <span
          key={tag}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 8px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: 500,
            background: isDark
              ? 'rgba(139, 92, 246, 0.2)'
              : 'rgba(139, 92, 246, 0.15)',
            color: isDark ? '#c4b5fd' : '#7c3aed',
            border: `1px solid ${isDark ? 'rgba(139, 92, 246, 0.3)' : 'rgba(139, 92, 246, 0.25)'}`,
          }}
        >
          {tag}
          {!disabled && (
            <button
              type="button"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                background: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                color: 'inherit',
                opacity: 0.7,
                transition: 'opacity 0.15s ease, background 0.15s ease'
              }}
              onClick={(e) => {
                e.stopPropagation()
                removeTag(tag)
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '1'
                e.currentTarget.style.background = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '0.7'
                e.currentTarget.style.background = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
              }}
            >
              <X size={10} />
            </button>
          )}
        </span>
      ))}
      {!disabled && tags.length < maxTags && (
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false)
            // Add tag on blur if there's input
            if (inputValue.trim()) {
              addTag(inputValue)
            }
          }}
          placeholder={tags.length === 0 ? placeholder : ''}
          style={{
            flex: 1,
            minWidth: '80px',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: '13px',
            color: 'var(--text)',
            padding: '2px 0'
          }}
          disabled={disabled}
        />
      )}
      {tags.length >= maxTags && (
        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', padding: '2px 4px' }}>
          Max {maxTags} tags
        </span>
      )}
    </div>
  )
}

export default TagInput

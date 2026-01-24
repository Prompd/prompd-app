import { useState } from 'react'
import { Plus } from 'lucide-react'

interface SectionAdderProps {
  onAdd: (title: string, type: string, position?: number) => void
  position?: number
  suggestions?: string[]
}

export default function SectionAdder({ onAdd, position, suggestions = [] }: SectionAdderProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [sectionTitle, setSectionTitle] = useState('')
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([])
  const [validationError, setValidationError] = useState<string | null>(null)

  const handleAdd = () => {
    const title = sectionTitle.trim()

    if (!title) {
      setValidationError('Section title is required')
      return
    }
    setValidationError(null)

    // Pass title, 'custom' type, and position
    onAdd(title, 'custom', position)
    setIsExpanded(false)
    setSectionTitle('')
    setFilteredSuggestions([])
  }

  const handleInputChange = (value: string) => {
    setSectionTitle(value)

    // Filter suggestions based on input
    if (value.trim() && suggestions.length > 0) {
      const filtered = suggestions.filter(s =>
        s.toLowerCase().includes(value.toLowerCase())
      )
      setFilteredSuggestions(filtered)
    } else {
      setFilteredSuggestions(suggestions.length > 0 ? suggestions : [])
    }
  }

  const handleSuggestionClick = (suggestion: string) => {
    setSectionTitle(suggestion)
    setFilteredSuggestions([])
  }

  const handleCancel = () => {
    setIsExpanded(false)
    setSectionTitle('')
    setFilteredSuggestions([])
    setValidationError(null)
  }

  if (isExpanded) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        padding: '8px'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '8px',
          position: 'relative'
        }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '300px' }}>
            <input
            type="text"
            value={sectionTitle}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => {
              if (suggestions.length > 0 && !sectionTitle.trim()) {
                setFilteredSuggestions(suggestions)
              }
            }}
            placeholder="Enter section title or select from inherited sections"
            style={{
              padding: '6px 10px',
              background: 'var(--panel)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              fontSize: '12px',
              width: '100%'
            }}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd()
              if (e.key === 'Escape') handleCancel()
            }}
          />

          {/* Type-ahead dropdown */}
          {filteredSuggestions.length > 0 && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '4px',
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
              maxHeight: '200px',
              overflowY: 'auto',
              zIndex: 1000
            }}>
              {filteredSuggestions.map((suggestion, index) => (
                <div
                  key={index}
                  onClick={() => handleSuggestionClick(suggestion)}
                  style={{
                    padding: '8px 12px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    color: 'var(--text)',
                    borderBottom: index < filteredSuggestions.length - 1 ? '1px solid var(--border)' : 'none'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--accent)'
                    e.currentTarget.style.color = 'white'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = 'var(--text)'
                  }}
                >
                  {suggestion}
                </div>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={handleAdd}
          style={{
            padding: '6px 12px',
            fontSize: '11px',
            background: 'var(--accent)',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Add
        </button>
        <button
          onClick={handleCancel}
          style={{
            padding: '6px 12px',
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
        {validationError && (
          <div style={{
            fontSize: '11px',
            color: '#ef4444',
            textAlign: 'center'
          }}>
            {validationError}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 0',
        opacity: 0.5,
        transition: 'opacity 0.2s'
      }}
      onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
      onMouseLeave={(e) => e.currentTarget.style.opacity = '0.5'}
    >
      <div style={{ flex: 1, height: '1px', background: 'var(--accent)' }} />
      <button
        onClick={() => {
          setIsExpanded(true)
          setSectionTitle('')
        }}
        style={{
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          background: 'transparent',
          color: 'var(--accent)',
          border: '1px solid var(--accent)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px',
          padding: 0,
          transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--accent)'
          e.currentTarget.style.color = 'white'
          e.currentTarget.style.borderColor = 'var(--accent)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'var(--accent)'
          e.currentTarget.style.borderColor = 'var(--accent)'
        }}
        title="Add new section"
      >
        <Plus size={14} />
      </button>
      <div style={{ flex: 1, height: '1px', background: 'var(--accent)' }} />
    </div>
  )
}

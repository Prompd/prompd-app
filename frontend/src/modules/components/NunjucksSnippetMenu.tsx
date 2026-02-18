/**
 * NunjucksSnippetMenu - Dropdown for inserting Nunjucks template snippets
 *
 * Works with both Tiptap (via onInsert callback) and can be adapted for Monaco.
 */
import { useState, useRef, useEffect } from 'react'
import { Braces } from 'lucide-react'

interface Snippet {
  label: string
  preview: string
  template: string
}

const SNIPPETS: Snippet[] = [
  {
    label: 'Variable',
    preview: '{{ name }}',
    template: '{{ name }}'
  },
  {
    label: 'If / Else',
    preview: '{% if ... %}',
    template: '{% if condition %}\n\n{% else %}\n\n{% endif %}'
  },
  {
    label: 'For Loop',
    preview: '{% for ... %}',
    template: '{% for item in list %}\n\n{% endfor %}'
  },
  {
    label: 'Include',
    preview: '{% include "..." %}',
    template: '{% include "file.prmd" %}'
  },
  {
    label: 'Block',
    preview: '{% block ... %}',
    template: '{% block name %}\n\n{% endblock %}'
  },
  {
    label: 'Comment',
    preview: '{# ... #}',
    template: '{# comment #}'
  }
]

interface NunjucksSnippetMenuProps {
  onInsert: (snippet: string) => void
}

export default function NunjucksSnippetMenu({ onInsert }: NunjucksSnippetMenuProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        className={open ? 'is-active' : ''}
        title="Insert Nunjucks snippet"
      >
        <Braces size={15} />
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: '4px',
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          zIndex: 100,
          minWidth: '200px',
          padding: '4px',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px'
        }}>
          {SNIPPETS.map(s => (
            <button
              key={s.label}
              onClick={() => {
                onInsert(s.template)
                setOpen(false)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '6px 10px',
                fontSize: '12px',
                background: 'transparent',
                color: 'var(--text)',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                transition: 'background 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--panel-2)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <span style={{ fontWeight: 500 }}>{s.label}</span>
              <span style={{
                fontFamily: '"JetBrains Mono", Monaco, Consolas, monospace',
                fontSize: '10px',
                color: '#ff8800',
                whiteSpace: 'nowrap'
              }}>
                {s.preview}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

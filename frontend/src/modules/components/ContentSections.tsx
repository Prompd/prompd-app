/**
 * ContentSections - Extracted from DesignView
 *
 * Renders the content sections block with two modes:
 * - "sections": Per-section cards with edit/preview/hide/delete (Tiptap editors)
 * - "document": Single continuous WysiwygEditor with all sections as headings
 *
 * Defaults to "document" mode for a clean WYSIWYG experience.
 */
import { useState, useCallback } from 'react'
import React from 'react'
import { FileText, Edit3, Trash2, Eye, EyeOff, X, Check } from 'lucide-react'
import SectionAdder from './SectionAdder'
import MarkdownPreview from './MarkdownPreview'
import WysiwygEditor from './WysiwygEditor'

export interface Section {
  id: string
  title: string
  level: number
  content: string
  overridden: boolean
  isLocal?: boolean
}

type ContentViewMode = 'sections' | 'document'

interface ContentSectionsProps {
  sections: Section[]
  sectionOverrides: Record<string, string | null>
  editingSection: string | null
  editContent: string
  hasInheritance: boolean
  availableSections: string[]
  readOnly: boolean
  theme: 'light' | 'dark'
  /** Raw markdown body from parsed .prmd - used directly in document mode to avoid round-trip issues */
  body?: string

  onStartEditing: (section: Section) => void
  onCancelEditing: () => void
  onSaveSection: (sectionId: string) => void
  onEditContentChange: (content: string) => void
  onAddSection: (title: string, type: string, index: number) => void
  onDeleteSection: (sectionId: string, title: string) => void
  onToggleVisibility: (sectionId: string) => void
  onResetSection: (sectionId: string) => void
  /** Direct body replacement for document mode - avoids per-section save round-trips */
  onBodyChange?: (body: string) => void
}

export default function ContentSections({
  sections,
  sectionOverrides,
  editingSection,
  editContent,
  hasInheritance,
  availableSections,
  readOnly,
  theme,
  onStartEditing,
  onCancelEditing,
  onSaveSection,
  onEditContentChange,
  onAddSection,
  onDeleteSection,
  onToggleVisibility,
  onResetSection,
  onBodyChange,
  body
}: ContentSectionsProps) {
  const [contentViewMode, setContentViewMode] = useState<ContentViewMode>('document')

  // For document mode, use the raw body directly to avoid round-trip parsing issues.
  // The raw body preserves exact formatting and prevents inherited sections from
  // being duplicated into the body on each keystroke.
  const documentMarkdown = body ?? ''

  // Handle document mode changes - directly replace the body to avoid re-render loops
  const handleDocumentChange = useCallback((markdown: string) => {
    if (onBodyChange) {
      onBodyChange(markdown)
    }
  }, [onBodyChange])

  return (
    <div
      data-section="content"
      style={{
        padding: '20px',
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        marginBottom: '24px'
      }}
    >
      {/* Header with view mode toggle */}
      <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <FileText size={16} style={{ color: 'var(--accent)' }} />
        Content Sections
        <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
          Main prompt sections with inherited content and overrides
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)', marginRight: '4px' }}>
            {sections.length} section{sections.length !== 1 ? 's' : ''}
          </span>
          <div style={{
            display: 'flex',
            background: 'var(--panel)',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            overflow: 'hidden'
          }}>
            <button
              onClick={() => setContentViewMode('sections')}
              style={{
                padding: '3px 10px',
                fontSize: '11px',
                fontWeight: 500,
                border: 'none',
                background: contentViewMode === 'sections' ? 'var(--accent)' : 'transparent',
                color: contentViewMode === 'sections' ? 'white' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Sections
            </button>
            <button
              onClick={() => setContentViewMode('document')}
              style={{
                padding: '3px 10px',
                fontSize: '11px',
                fontWeight: 500,
                border: 'none',
                background: contentViewMode === 'document' ? 'var(--accent)' : 'transparent',
                color: contentViewMode === 'document' ? 'white' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              title="Edit all sections as a single document"
            >
              Document
            </button>
          </div>
        </div>
      </div>

      {contentViewMode === 'document' ? (
        /* Document mode - single continuous WYSIWYG editor */
        <div style={{ margin: '0 -20px -20px' }}>
          <WysiwygEditor
            value={documentMarkdown}
            onChange={handleDocumentChange}
            height="auto"
            theme={theme}
            readOnly={readOnly}
            placeholder="Start writing your prompt content..."
          />
        </div>
      ) : (
        /* Sections mode - per-section cards */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* SectionAdder at the top */}
          <SectionAdder
            onAdd={(title, type) => onAddSection(title, type, 0)}
            suggestions={availableSections}
          />

          {/* Render sections with SectionAdder between each */}
          {sections.map((section, index) => {
            const isHidden = sectionOverrides[section.id] === null
            const isOverridden = sectionOverrides[section.id] !== undefined && sectionOverrides[section.id] !== null
            const isEditing = editingSection === section.id
            const displayContent = sectionOverrides[section.id] ?? section.content

            return (
              <React.Fragment key={section.id}>
                <div
                  style={{
                    padding: '16px',
                    background: 'var(--panel)',
                    border: `1px solid ${isOverridden ? 'var(--warning)' : isHidden ? 'var(--muted)' : 'var(--border)'}`,
                    borderRadius: '8px',
                    opacity: isHidden ? 0.6 : 1
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: isEditing ? '12px' : '8px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                        {section.title}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {isHidden ? 'Hidden' : isOverridden ? 'Modified' : 'Original'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      {!isEditing && (
                        <>
                          <button
                            onClick={() => onStartEditing(section)}
                            disabled={isHidden}
                            style={{
                              padding: '4px 8px',
                              fontSize: '10px',
                              background: 'transparent',
                              color: 'var(--accent)',
                              border: '1px solid var(--accent)',
                              borderRadius: '4px',
                              cursor: isHidden ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              opacity: isHidden ? 0.5 : 1,
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              if (!isHidden) {
                                e.currentTarget.style.background = 'var(--accent)'
                                e.currentTarget.style.color = 'white'
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isHidden) {
                                e.currentTarget.style.background = 'transparent'
                                e.currentTarget.style.color = 'var(--accent)'
                              }
                            }}
                          >
                            <Edit3 size={10} />
                            Edit
                          </button>
                          {section.isLocal && !hasInheritance ? (
                            <button
                              onClick={() => onDeleteSection(section.id, section.title)}
                              style={{
                                padding: '4px 8px',
                                fontSize: '10px',
                                background: 'transparent',
                                color: 'var(--error)',
                                border: '1px solid var(--error)',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'var(--error)'
                                e.currentTarget.style.color = 'white'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent'
                                e.currentTarget.style.color = 'var(--error)'
                              }}
                              title="Delete section"
                            >
                              <Trash2 size={10} />
                              Delete
                            </button>
                          ) : (
                            <button
                              onClick={() => onToggleVisibility(section.id)}
                              style={{
                                padding: '4px 8px',
                                fontSize: '10px',
                                background: isHidden ? 'var(--success)' : 'transparent',
                                color: isHidden ? 'white' : 'var(--text-secondary)',
                                border: `1px solid ${isHidden ? 'var(--success)' : 'var(--text-secondary)'}`,
                                borderRadius: '4px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                if (!isHidden) {
                                  e.currentTarget.style.background = 'var(--text-secondary)'
                                  e.currentTarget.style.color = 'white'
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!isHidden) {
                                  e.currentTarget.style.background = 'transparent'
                                  e.currentTarget.style.color = 'var(--text-secondary)'
                                }
                              }}
                              title={isHidden ? 'Show section' : 'Hide section'}
                            >
                              {isHidden ? <Eye size={10} /> : <EyeOff size={10} />}
                            </button>
                          )}
                          {isOverridden && (
                            <button
                              onClick={() => onResetSection(section.id)}
                              style={{
                                padding: '4px 8px',
                                fontSize: '10px',
                                background: 'transparent',
                                color: 'var(--error)',
                                border: '1px solid var(--error)',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'var(--error)'
                                e.currentTarget.style.color = 'white'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent'
                                e.currentTarget.style.color = 'var(--error)'
                              }}
                              title="Reset to original"
                            >
                              <X size={10} />
                              Reset
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {isEditing ? (
                    <div>
                      <div style={{
                        marginBottom: '8px'
                      }}>
                        <WysiwygEditor
                          value={editContent}
                          onChange={onEditContentChange}
                          height="auto"
                          theme={theme}
                          readOnly={false}
                          placeholder="Start writing..."
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={onCancelEditing}
                          style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            background: 'transparent',
                            color: 'var(--text)',
                            border: '1px solid var(--border)',
                            borderRadius: '6px',
                            cursor: 'pointer'
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => onSaveSection(section.id)}
                          style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            background: 'var(--success)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Check size={12} />
                          Save Changes
                        </button>
                      </div>
                    </div>
                  ) : !isHidden && (
                    <div
                      onDoubleClick={() => !readOnly && onStartEditing(section)}
                      style={{
                        cursor: readOnly ? 'default' : 'pointer'
                      }}
                      title={readOnly ? undefined : 'Double-click to edit'}
                    >
                      {displayContent.trim() ? (
                        <MarkdownPreview
                          content={displayContent}
                          theme={theme}
                          height="auto"
                        />
                      ) : (
                        <div style={{
                          padding: '16px 0',
                          fontSize: '12px',
                          color: 'var(--text-muted)',
                          fontStyle: 'italic',
                          textAlign: 'center'
                        }}>
                          Empty section - {readOnly ? '' : 'double-click to add content'}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* SectionAdder after each section */}
                <SectionAdder
                  onAdd={(title, type) => onAddSection(title, type, index + 1)}
                  suggestions={availableSections}
                />
              </React.Fragment>
            )
          })}
        </div>
      )}
    </div>
  )
}

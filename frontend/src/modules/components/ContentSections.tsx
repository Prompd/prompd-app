/**
 * ContentSections - Extracted from DesignView
 *
 * Renders the content sections block with two modes:
 * - "sections": Per-section cards with edit/preview/hide/delete (Tiptap editors)
 * - "document": Single continuous WysiwygEditor with all sections as headings
 *
 * Defaults to "document" mode for a clean WYSIWYG experience.
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import React from 'react'
import { FileText, Edit3, Trash2, Eye, EyeOff, Check, Maximize2, Minimize2, RotateCcw, GripVertical } from 'lucide-react'
import SectionAdder from './SectionAdder'
import MarkdownPreview from './MarkdownPreview'
import WysiwygEditor from './WysiwygEditor'
import type { VariablesMap } from '../lib/tiptap/nunjucksExtension'

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
  fullscreen?: boolean
  onToggleFullscreen?: () => void

  onStartEditing: (section: Section) => void
  onCancelEditing: () => void
  onSaveSection: (sectionId: string) => void
  onEditContentChange: (content: string) => void
  onAddSection: (title: string, type: string, index: number) => void
  onDeleteSection: (sectionId: string, title: string) => void
  onRenameSection?: (sectionId: string, oldTitle: string, newTitle: string) => void
  onReorderSections?: (fromIndex: number, toIndex: number) => void
  onToggleVisibility: (sectionId: string) => void
  onResetSection: (sectionId: string) => void
  /** Direct body replacement for document mode - avoids per-section save round-trips */
  onBodyChange?: (body: string) => void
  /** Parameter metadata for hover tooltips on {{ variable }} expressions */
  variables?: VariablesMap
}

/**
 * Inline editable section title
 */
function EditableTitle({
  title,
  level,
  readOnly,
  isLocal,
  onRename
}: {
  title: string
  level: number
  readOnly: boolean
  isLocal?: boolean
  onRename?: (newTitle: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== title && onRename) {
      onRename(trimmed)
    } else {
      setDraft(title)
    }
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setDraft(title); setEditing(false) }
        }}
        style={{
          fontSize: level === 1 ? '18px' : '16px',
          fontWeight: 700,
          color: 'var(--text)',
          background: 'transparent',
          border: 'none',
          borderBottom: '2px solid var(--accent)',
          outline: 'none',
          padding: '2px 0',
          width: '100%',
          fontFamily: 'inherit',
          letterSpacing: '-0.01em'
        }}
      />
    )
  }

  return (
    <span
      onClick={() => {
        if (!readOnly && isLocal && onRename) setEditing(true)
      }}
      style={{
        fontSize: level === 1 ? '18px' : '16px',
        fontWeight: 700,
        color: 'var(--text)',
        letterSpacing: '-0.01em',
        cursor: !readOnly && isLocal && onRename ? 'text' : 'default',
        borderBottom: !readOnly && isLocal && onRename ? '2px solid transparent' : 'none',
        transition: 'border-color 0.15s'
      }}
      onMouseEnter={e => {
        if (!readOnly && isLocal && onRename) {
          e.currentTarget.style.borderBottomColor = 'var(--border)'
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderBottomColor = 'transparent'
      }}
      title={!readOnly && isLocal ? 'Click to rename' : undefined}
    >
      {title}
    </span>
  )
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
  onRenameSection,
  onReorderSections,
  onToggleVisibility,
  onResetSection,
  onBodyChange,
  body,
  fullscreen = false,
  onToggleFullscreen,
  variables
}: ContentSectionsProps) {
  const [contentViewMode, setContentViewMode] = useState<ContentViewMode>('document')
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<number | null>(null)

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
        padding: fullscreen ? '0' : '20px',
        background: fullscreen ? 'transparent' : 'var(--bg)',
        border: fullscreen ? 'none' : '1px solid var(--border)',
        borderRadius: fullscreen ? 0 : '8px',
        marginBottom: fullscreen ? 0 : '24px',
        ...(fullscreen ? { flex: 1, display: 'flex', flexDirection: 'column' as const } : {})
      }}
    >
      {/* Header with view mode toggle */}
      <div style={{
        fontSize: '14px',
        fontWeight: 600,
        marginBottom: fullscreen ? '8px' : '16px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        ...(fullscreen ? { padding: '8px 0 0' } : {})
      }}>
        <FileText size={16} style={{ color: 'var(--accent)' }} />
        Content Sections
        {!fullscreen && (
          <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            Main prompt sections with inherited content and overrides
          </span>
        )}
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
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '26px',
                height: '26px',
                background: 'transparent',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                color: fullscreen ? 'var(--accent)' : 'var(--text-muted)',
                transition: 'all 0.15s',
                marginLeft: '4px'
              }}
              title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          )}
        </div>
      </div>

      {contentViewMode === 'document' ? (
        /* Document mode - single continuous WYSIWYG editor */
        <div style={{ margin: fullscreen ? '0 -12px 0 0' : '0 -20px -20px' }}>
          <WysiwygEditor
            value={documentMarkdown}
            onChange={handleDocumentChange}
            height="auto"
            theme={theme}
            readOnly={readOnly}
            placeholder="Start writing your prompt content..."
            variables={variables}
          />
        </div>
      ) : (
        /* Sections mode - per-section cards */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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

            // Status badge
            const statusLabel = isHidden ? 'Hidden' : isOverridden ? 'Modified' : section.isLocal ? 'Local' : 'Inherited'
            const statusColor = isHidden ? 'var(--text-muted)' : isOverridden ? 'var(--warning)' : 'var(--text-secondary)'

            const isDragging = dragIndex === index
            const isDropTarget = dropTarget === index
            const canDrag = !readOnly && section.isLocal && onReorderSections

            return (
              <React.Fragment key={section.id}>
                <div
                  draggable={!!canDrag}
                  onDragStart={e => {
                    if (!canDrag) return
                    setDragIndex(index)
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', String(index))
                  }}
                  onDragOver={e => {
                    if (dragIndex === null) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    setDropTarget(index)
                  }}
                  onDragLeave={() => {
                    if (dropTarget === index) setDropTarget(null)
                  }}
                  onDrop={e => {
                    e.preventDefault()
                    if (dragIndex !== null && dragIndex !== index && onReorderSections) {
                      onReorderSections(dragIndex, index)
                    }
                    setDragIndex(null)
                    setDropTarget(null)
                  }}
                  onDragEnd={() => {
                    setDragIndex(null)
                    setDropTarget(null)
                  }}
                  style={{
                    background: 'var(--panel)',
                    border: `1px solid ${isDropTarget && dragIndex !== null ? 'var(--accent)' : isHidden ? 'var(--border)' : isOverridden ? 'rgba(245, 158, 11, 0.3)' : 'var(--border)'}`,
                    borderRadius: '10px',
                    opacity: isDragging ? 0.4 : isHidden ? 0.5 : 1,
                    transition: 'all 0.2s',
                    overflow: 'hidden',
                    ...(isDropTarget && dragIndex !== null ? { boxShadow: '0 0 0 1px var(--accent)' } : {})
                  }}
                >
                  {/* Section Header Bar */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '12px 16px',
                      borderBottom: isEditing || (!isHidden && displayContent.trim()) ? '1px solid var(--border)' : 'none',
                      background: isOverridden ? 'rgba(245, 158, 11, 0.04)' : 'transparent'
                    }}
                  >
                    {/* Drag handle */}
                    {canDrag && (
                      <div
                        style={{
                          cursor: 'grab',
                          color: 'var(--text-muted)',
                          flexShrink: 0,
                          opacity: 0.5,
                          display: 'flex',
                          alignItems: 'center',
                          transition: 'opacity 0.15s'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '0.5' }}
                        title="Drag to reorder"
                      >
                        <GripVertical size={14} />
                      </div>
                    )}

                    {/* Title + status */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <EditableTitle
                          title={section.title}
                          level={section.level}
                          readOnly={readOnly}
                          isLocal={section.isLocal}
                          onRename={onRenameSection ? (newTitle) => onRenameSection(section.id, section.title, newTitle) : undefined}
                        />
                        <span style={{
                          fontSize: '10px',
                          fontWeight: 500,
                          color: statusColor,
                          background: isOverridden ? 'rgba(245, 158, 11, 0.1)' : 'var(--bg)',
                          padding: '2px 8px',
                          borderRadius: '10px',
                          flexShrink: 0,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em'
                        }}>
                          {statusLabel}
                        </span>
                      </div>
                    </div>

                    {/* Action buttons - icon-only for cleaner look */}
                    {!isEditing && (
                      <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                        <button
                          onClick={() => onStartEditing(section)}
                          disabled={isHidden}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '28px',
                            height: '28px',
                            background: 'transparent',
                            color: isHidden ? 'var(--text-muted)' : 'var(--accent)',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: isHidden ? 'not-allowed' : 'pointer',
                            opacity: isHidden ? 0.4 : 1,
                            transition: 'all 0.15s'
                          }}
                          onMouseEnter={e => { if (!isHidden) e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                          title="Edit section"
                        >
                          <Edit3 size={14} />
                        </button>

                        {section.isLocal && !hasInheritance ? (
                          <button
                            onClick={() => onDeleteSection(section.id, section.title)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '28px',
                              height: '28px',
                              background: 'transparent',
                              color: 'var(--text-muted)',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              transition: 'all 0.15s'
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'
                              e.currentTarget.style.color = 'var(--error)'
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = 'transparent'
                              e.currentTarget.style.color = 'var(--text-muted)'
                            }}
                            title="Delete section"
                          >
                            <Trash2 size={14} />
                          </button>
                        ) : (
                          <button
                            onClick={() => onToggleVisibility(section.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '28px',
                              height: '28px',
                              background: 'transparent',
                              color: isHidden ? 'var(--success)' : 'var(--text-muted)',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              transition: 'all 0.15s'
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = isHidden
                                ? 'rgba(34, 197, 94, 0.1)'
                                : 'rgba(107, 114, 128, 0.1)'
                            }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                            title={isHidden ? 'Show section' : 'Hide section'}
                          >
                            {isHidden ? <Eye size={14} /> : <EyeOff size={14} />}
                          </button>
                        )}

                        {isOverridden && (
                          <button
                            onClick={() => onResetSection(section.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '28px',
                              height: '28px',
                              background: 'transparent',
                              color: 'var(--text-muted)',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              transition: 'all 0.15s'
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'
                              e.currentTarget.style.color = 'var(--error)'
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = 'transparent'
                              e.currentTarget.style.color = 'var(--text-muted)'
                            }}
                            title="Reset to original"
                          >
                            <RotateCcw size={14} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Content Area */}
                  {isEditing ? (
                    <div style={{ padding: '12px 16px' }}>
                      <div style={{ marginBottom: '10px' }}>
                        <WysiwygEditor
                          value={editContent}
                          onChange={onEditContentChange}
                          height="auto"
                          theme={theme}
                          readOnly={false}
                          placeholder="Start writing..."
                          variables={variables}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={onCancelEditing}
                          style={{
                            padding: '6px 14px',
                            fontSize: '12px',
                            fontWeight: 500,
                            background: 'transparent',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--border)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            transition: 'all 0.15s'
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => onSaveSection(section.id)}
                          style={{
                            padding: '6px 14px',
                            fontSize: '12px',
                            fontWeight: 500,
                            background: 'var(--accent)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            transition: 'all 0.15s'
                          }}
                        >
                          <Check size={12} />
                          Save
                        </button>
                      </div>
                    </div>
                  ) : !isHidden && (
                    <div
                      onDoubleClick={() => !readOnly && onStartEditing(section)}
                      style={{
                        cursor: readOnly ? 'default' : 'pointer',
                        padding: displayContent.trim() ? '8px 16px 12px' : '0'
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
                          padding: '20px 16px',
                          fontSize: '13px',
                          color: 'var(--text-muted)',
                          fontStyle: 'italic',
                          textAlign: 'center'
                        }}>
                          {readOnly ? 'Empty section' : 'Double-click to add content'}
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

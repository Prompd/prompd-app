/**
 * ContentBlock - Renders and edits .prmd content sections (body markdown).
 * Handles both local content sections (# headings in the body) and
 * specialty sections (system, user, context, task, output, response in frontmatter).
 */

import { useState, useCallback } from 'react'
import { FileText, ChevronDown, ChevronRight, Check, X, Plus, Link2 } from 'lucide-react'
import { registerBlock } from '../blockRegistry'
import type {
  BlockRendererProps,
  BlockEditorProps,
  BlockDiffProps,
  BlockProposalItem
} from '../types'
import type { ParsedPrompd } from '../../lib/prompdParser'

// ── Data Shape ───────────────────────────────────────────────────────────────

export interface ContentSection {
  id: string
  title: string
  level: 1 | 2
  content: string
  source: 'body' | 'specialty'
}

export interface ContentData {
  sections: ContentSection[]
  /** Raw body text for full-document editing */
  rawBody: string
  /** Specialty file references from frontmatter */
  specialtyRefs: Record<string, string[]>
}

// ── Styles ───────────────────────────────────────────────────────────────────

const acceptBtnStyle = {
  display: 'flex' as const, alignItems: 'center' as const, gap: '4px',
  padding: '4px 12px', fontSize: '11px', fontWeight: 500 as const,
  background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)',
  border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '4px', cursor: 'pointer' as const
}

const rejectBtnStyle = {
  display: 'flex' as const, alignItems: 'center' as const, gap: '4px',
  padding: '4px 12px', fontSize: '11px', fontWeight: 500 as const,
  background: 'rgba(239, 68, 68, 0.08)', color: 'var(--error)',
  border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '4px', cursor: 'pointer' as const
}

const saveBtnStyle = {
  display: 'flex' as const, alignItems: 'center' as const, gap: '4px',
  padding: '4px 12px', fontSize: '11px', fontWeight: 500 as const,
  background: 'var(--success)', color: 'white',
  border: 'none' as const, borderRadius: '4px', cursor: 'pointer' as const
}

const cancelBtnStyle = {
  display: 'flex' as const, alignItems: 'center' as const, gap: '4px',
  padding: '4px 12px', fontSize: '11px', fontWeight: 500 as const,
  background: 'transparent', color: 'var(--text-secondary)',
  border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer' as const
}

const textareaStyle = {
  width: '100%', padding: '10px 12px', fontSize: '13px', fontFamily: 'monospace',
  background: 'var(--input-bg)', color: 'var(--text)',
  border: '1px solid var(--input-border)', borderRadius: '4px',
  outline: 'none', boxSizing: 'border-box' as const,
  resize: 'vertical' as const, minHeight: '80px', lineHeight: '1.5'
}

const sourceBadge = (source: 'body' | 'specialty') => ({
  fontSize: '9px', fontWeight: 600 as const, textTransform: 'uppercase' as const,
  letterSpacing: '0.5px', padding: '1px 5px', borderRadius: '3px',
  background: source === 'specialty' ? 'rgba(168, 85, 247, 0.1)' : 'rgba(59, 130, 246, 0.1)',
  color: source === 'specialty' ? '#a855f7' : '#3b82f6',
  border: `1px solid ${source === 'specialty' ? 'rgba(168, 85, 247, 0.2)' : 'rgba(59, 130, 246, 0.2)'}`
})

// ── Renderer ─────────────────────────────────────────────────────────────────

function ContentRenderer({ block, onEdit, proposal, onAcceptProposal, onRejectProposal }: BlockRendererProps<ContentData>) {
  const { sections, specialtyRefs } = block.data
  const [collapsed, setCollapsed] = useState(false)

  const specialtyKeys = Object.keys(specialtyRefs).filter(k => specialtyRefs[k].length > 0)

  return (
    <div style={{
      background: 'var(--bg)',
      border: proposal ? '2px solid var(--accent)' : '1px solid var(--border)',
      borderRadius: '8px',
      overflow: 'hidden',
      transition: 'border-color 0.2s'
    }}>
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          padding: '16px 20px', fontSize: '14px', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: '8px',
          cursor: 'pointer', borderBottom: collapsed ? 'none' : '1px solid var(--border)',
          userSelect: 'none'
        }}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        <FileText size={16} style={{ color: 'var(--accent)' }} />
        <span>Content</span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>
          ({sections.length} section{sections.length !== 1 ? 's' : ''}{specialtyKeys.length > 0 ? `, ${specialtyKeys.length} ref${specialtyKeys.length !== 1 ? 's' : ''}` : ''})
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          {proposal && (
            <>
              <button onClick={(e) => { e.stopPropagation(); onAcceptProposal?.() }} style={acceptBtnStyle}>
                <Check size={12} /> Accept
              </button>
              <button onClick={(e) => { e.stopPropagation(); onRejectProposal?.() }} style={rejectBtnStyle}>
                <X size={12} /> Reject
              </button>
            </>
          )}
          {!proposal && (
            <button onClick={(e) => { e.stopPropagation(); onEdit() }} style={{
              padding: '4px 12px', fontSize: '11px', fontWeight: 500, background: 'transparent',
              color: 'var(--accent)', border: '1px solid var(--accent)',
              borderRadius: '4px', cursor: 'pointer'
            }}>
              Edit
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div style={{ padding: '12px 16px' }}>
          {/* Specialty file references */}
          {specialtyKeys.length > 0 && (
            <div style={{ marginBottom: sections.length > 0 ? '12px' : 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {specialtyKeys.map(key => (
                <div key={key} style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '6px 10px', background: 'var(--panel)',
                  borderRadius: '4px', border: '1px solid var(--border)'
                }}>
                  <Link2 size={12} style={{ color: 'var(--text-muted)' }} />
                  <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)', textTransform: 'capitalize' }}>{key}</span>
                  <div style={{ display: 'flex', gap: '4px', flex: 1, flexWrap: 'wrap' }}>
                    {specialtyRefs[key].map((file, i) => (
                      <span key={i} style={{
                        fontSize: '11px', fontFamily: 'monospace', color: 'var(--accent)',
                        background: 'rgba(59, 130, 246, 0.05)', padding: '1px 6px',
                        borderRadius: '3px', border: '1px solid rgba(59, 130, 246, 0.15)'
                      }}>
                        {file}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Content sections */}
          {sections.length === 0 && specialtyKeys.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', padding: '12px' }}>
              No content sections. Click Edit to add content.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {sections.map(section => (
                <div key={section.id} style={{
                  padding: '10px 12px', background: 'var(--panel)',
                  borderRadius: '6px', border: '1px solid var(--border)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                      {'#'.repeat(section.level)} {section.title}
                    </span>
                    <span style={sourceBadge(section.source)}>{section.source}</span>
                  </div>
                  <div style={{
                    fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5',
                    whiteSpace: 'pre-wrap', maxHeight: '120px', overflow: 'hidden',
                    maskImage: 'linear-gradient(to bottom, black 80%, transparent 100%)',
                    WebkitMaskImage: 'linear-gradient(to bottom, black 80%, transparent 100%)'
                  }}>
                    {section.content || '(empty)'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {proposal?.description && (
            <div style={{ marginTop: '8px', padding: '8px 12px', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              {proposal.description}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Editor ───────────────────────────────────────────────────────────────────

function ContentEditor({ block, onSave, onCancel }: BlockEditorProps<ContentData>) {
  const [sections, setSections] = useState<ContentSection[]>(block.data.sections.map(s => ({ ...s })))
  const [rawBody, setRawBody] = useState(block.data.rawBody)
  const [editMode, setEditMode] = useState<'sections' | 'raw'>('sections')

  const updateSection = useCallback((index: number, field: keyof ContentSection, value: string | number) => {
    setSections(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s))
  }, [])

  const addSection = useCallback(() => {
    const id = `section-${Date.now()}`
    setSections(prev => [...prev, { id, title: 'New Section', level: 2, content: '', source: 'body' }])
  }, [])

  const removeSection = useCallback((index: number) => {
    setSections(prev => prev.filter((_, i) => i !== index))
  }, [])

  const handleSave = useCallback(() => {
    if (editMode === 'raw') {
      // Re-extract sections from raw body
      const extracted = extractSectionsFromBody(rawBody)
      onSave({ sections: extracted, rawBody, specialtyRefs: block.data.specialtyRefs })
    } else {
      // Rebuild rawBody from sections
      const rebuilt = sections
        .filter(s => s.source === 'body')
        .map(s => `${'#'.repeat(s.level)} ${s.title}\n\n${s.content}`)
        .join('\n\n')
      onSave({ sections, rawBody: rebuilt, specialtyRefs: block.data.specialtyRefs })
    }
  }, [editMode, rawBody, sections, block.data.specialtyRefs, onSave])

  return (
    <div style={{
      background: 'var(--bg)', border: '2px solid var(--accent)',
      borderRadius: '8px', overflow: 'hidden'
    }}>
      <div style={{
        padding: '16px 20px', fontSize: '14px', fontWeight: 600,
        display: 'flex', alignItems: 'center', gap: '8px',
        borderBottom: '1px solid var(--border)', background: 'rgba(59, 130, 246, 0.05)'
      }}>
        <FileText size={16} style={{ color: 'var(--accent)' }} />
        <span>Edit Content</span>
        <div style={{ display: 'flex', background: 'var(--panel)', borderRadius: '4px', padding: '2px', border: '1px solid var(--border)', marginLeft: '8px' }}>
          <button onClick={() => setEditMode('sections')} style={{
            padding: '2px 8px', fontSize: '10px', border: 'none', borderRadius: '3px', cursor: 'pointer',
            background: editMode === 'sections' ? 'var(--accent)' : 'transparent',
            color: editMode === 'sections' ? 'white' : 'var(--text-secondary)'
          }}>
            Sections
          </button>
          <button onClick={() => setEditMode('raw')} style={{
            padding: '2px 8px', fontSize: '10px', border: 'none', borderRadius: '3px', cursor: 'pointer',
            background: editMode === 'raw' ? 'var(--accent)' : 'transparent',
            color: editMode === 'raw' ? 'white' : 'var(--text-secondary)'
          }}>
            Raw
          </button>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          <button onClick={handleSave} style={saveBtnStyle}>
            <Check size={12} /> Save
          </button>
          <button onClick={onCancel} style={cancelBtnStyle}>
            <X size={12} /> Cancel
          </button>
        </div>
      </div>

      <div style={{ padding: '16px' }}>
        {editMode === 'raw' ? (
          <textarea
            value={rawBody}
            onChange={e => setRawBody(e.target.value)}
            style={{ ...textareaStyle, minHeight: '200px' }}
            placeholder="# Section Title\n\nContent goes here..."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {sections.filter(s => s.source === 'body').map((section, i) => (
              <div key={section.id} style={{
                padding: '12px', background: 'var(--panel)',
                borderRadius: '6px', border: '1px solid var(--border)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <select
                    value={section.level}
                    onChange={e => updateSection(i, 'level', parseInt(e.target.value))}
                    style={{ padding: '2px 4px', fontSize: '12px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '3px' }}
                  >
                    <option value={1}>H1</option>
                    <option value={2}>H2</option>
                  </select>
                  <input
                    value={section.title}
                    onChange={e => updateSection(i, 'title', e.target.value)}
                    style={{ flex: 1, padding: '4px 8px', fontSize: '13px', fontWeight: 600, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '4px', outline: 'none' }}
                    placeholder="Section title"
                  />
                  <button onClick={() => removeSection(i)} style={{ ...rejectBtnStyle, padding: '4px' }}>
                    <X size={12} />
                  </button>
                </div>
                <textarea
                  value={section.content}
                  onChange={e => updateSection(i, 'content', e.target.value)}
                  style={{ ...textareaStyle, minHeight: '60px' }}
                  placeholder="Section content..."
                />
              </div>
            ))}
            <button onClick={addSection} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              padding: '8px', background: 'transparent', border: '1px dashed var(--border)',
              borderRadius: '6px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px'
            }}>
              <Plus size={14} /> Add Section
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Diff Renderer ────────────────────────────────────────────────────────────

function ContentDiff({ currentData, proposedData, description }: BlockDiffProps<ContentData>) {
  const currIds = new Set(currentData.sections.map(s => s.id))
  const propIds = new Set(proposedData.sections.map(s => s.id))
  const added = proposedData.sections.filter(s => !currIds.has(s.id))
  const removed = currentData.sections.filter(s => !propIds.has(s.id))

  return (
    <div style={{ fontSize: '12px' }}>
      {description && <div style={{ marginBottom: '8px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>{description}</div>}
      {added.map(s => (
        <div key={s.id} style={{ color: '#22c55e', marginBottom: '2px' }}>+ Section: {s.title}</div>
      ))}
      {removed.map(s => (
        <div key={s.id} style={{ color: '#ef4444', marginBottom: '2px' }}>- Section: {s.title}</div>
      ))}
      {added.length === 0 && removed.length === 0 && (
        <div style={{ color: 'var(--text-muted)' }}>Content modified</div>
      )}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractSectionsFromBody(body: string): ContentSection[] {
  const lines = body.split('\n')
  const sections: ContentSection[] = []
  let current: ContentSection | null = null

  for (const line of lines) {
    const h1Match = line.match(/^#\s+(.+)/)
    const h2Match = line.match(/^##\s+(.+)/)

    if (h1Match || h2Match) {
      if (current) sections.push(current)
      const title = h1Match ? h1Match[1] : h2Match![1]
      const id = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      current = { id, title, level: h1Match ? 1 : 2, content: '', source: 'body' }
    } else if (current && line.trim()) {
      current.content += (current.content ? '\n' : '') + line
    }
  }
  if (current) sections.push(current)
  return sections
}

// ── Extract / Apply ──────────────────────────────────────────────────────────

function extractContent(parsed: ParsedPrompd): ContentData | null {
  const sections = extractSectionsFromBody(parsed.body)

  // Extract specialty file references from frontmatter
  const specialtyKeys = ['system', 'user', 'context', 'contexts', 'task', 'output', 'response']
  const specialtyRefs: Record<string, string[]> = {}

  for (const key of specialtyKeys) {
    const val = parsed.frontmatter[key]
    if (val) {
      const normalizedKey = key === 'contexts' ? 'context' : key
      if (Array.isArray(val)) {
        specialtyRefs[normalizedKey] = val
      } else if (typeof val === 'string') {
        specialtyRefs[normalizedKey] = [val]
      }
    }
  }

  return {
    sections,
    rawBody: parsed.body,
    specialtyRefs
  }
}

function applyContent(data: ContentData, document: string, parsed: ParsedPrompd): string {
  // Reconstruct body from sections
  const newBody = data.sections
    .filter(s => s.source === 'body')
    .map(s => `${'#'.repeat(s.level)} ${s.title}\n\n${s.content}`)
    .join('\n\n')

  // Replace body portion of document (everything after closing ---)
  const lines = document.split('\n')
  const startIdx = lines.findIndex(l => l.trim() === '---')
  if (startIdx < 0) return newBody

  const endIdx = lines.findIndex((l, i) => i > startIdx && l.trim() === '---')
  if (endIdx < 0) return document

  const frontmatter = lines.slice(0, endIdx + 1).join('\n')
  return `${frontmatter}\n\n${newBody.replace(/^\n+/, '')}`.trim()
}

// ── Registration ─────────────────────────────────────────────────────────────

registerBlock<ContentData>({
  type: 'content',
  label: 'Content',
  icon: FileText,
  renderer: ContentRenderer,
  editor: ContentEditor,
  diffRenderer: ContentDiff,
  extract: extractContent,
  apply: applyContent,
  order: 3
})

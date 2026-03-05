/**
 * MetadataBlock - Renders and edits .prmd metadata (id, name, version, description, tags, inherits, using).
 */

import { useState, useCallback } from 'react'
import { Sparkles, ChevronDown, ChevronRight, Check, X, Plus, Trash2 } from 'lucide-react'
import { registerBlock } from '../blockRegistry'
import type {
  BlockRendererProps,
  BlockEditorProps,
  BlockDiffProps,
  BlockProposalItem
} from '../types'
import type { ParsedPrompd } from '../../lib/prompdParser'

// ── Data Shape ───────────────────────────────────────────────────────────────

export interface MetadataData {
  id: string
  name: string
  version: string
  description: string
  tags: string[]
  inherits: string
  using: Array<{ name: string; prefix?: string }>
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const fieldLabelStyle = {
  fontSize: '11px',
  fontWeight: 600 as const,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  marginBottom: '4px'
}

const fieldValueStyle = {
  fontSize: '13px',
  color: 'var(--text)',
  padding: '6px 10px',
  background: 'var(--panel)',
  borderRadius: '4px',
  border: '1px solid var(--border)',
  minHeight: '28px',
  display: 'flex',
  alignItems: 'center'
}

const inputStyle = {
  width: '100%',
  padding: '6px 10px',
  fontSize: '13px',
  background: 'var(--input-bg)',
  color: 'var(--text)',
  border: '1px solid var(--input-border)',
  borderRadius: '4px',
  outline: 'none',
  boxSizing: 'border-box' as const
}

const tagStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '2px 8px',
  fontSize: '11px',
  background: 'rgba(59, 130, 246, 0.1)',
  color: 'var(--accent)',
  borderRadius: '10px',
  border: '1px solid rgba(59, 130, 246, 0.2)'
}

// ── Renderer ─────────────────────────────────────────────────────────────────

function MetadataRenderer({ block, onEdit, proposal, onAcceptProposal, onRejectProposal, theme }: BlockRendererProps<MetadataData>) {
  const d = block.data
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div style={{
      background: 'var(--bg)',
      border: proposal ? '2px solid var(--accent)' : '1px solid var(--border)',
      borderRadius: '8px',
      overflow: 'hidden',
      transition: 'border-color 0.2s'
    }}>
      {/* Header */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          padding: '16px 20px',
          fontSize: '14px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          borderBottom: collapsed ? 'none' : '1px solid var(--border)',
          userSelect: 'none'
        }}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        <Sparkles size={16} style={{ color: 'var(--accent)' }} />
        <span>Metadata</span>
        {collapsed && (
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 400 }}>
            {d.name || d.id || 'Untitled'}{d.version ? ` v${d.version}` : ''}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          {proposal && (
            <>
              <button onClick={(e) => { e.stopPropagation(); onAcceptProposal?.() }} style={{ ...acceptBtnStyle }} title="Accept change">
                <Check size={12} /> Accept
              </button>
              <button onClick={(e) => { e.stopPropagation(); onRejectProposal?.() }} style={{ ...rejectBtnStyle }} title="Reject change">
                <X size={12} /> Reject
              </button>
            </>
          )}
          {!proposal && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit() }}
              style={{
                padding: '4px 12px',
                fontSize: '11px',
                fontWeight: 500,
                background: 'transparent',
                color: 'var(--accent)',
                border: '1px solid var(--accent)',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {!collapsed && (
        <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Field label="ID" value={d.id} proposal={proposal?.proposedData as MetadataData | undefined} field="id" />
          <Field label="Name" value={d.name} proposal={proposal?.proposedData as MetadataData | undefined} field="name" />
          <Field label="Version" value={d.version} proposal={proposal?.proposedData as MetadataData | undefined} field="version" />
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Description" value={d.description} proposal={proposal?.proposedData as MetadataData | undefined} field="description" />
          </div>
          {(d.tags.length > 0 || proposal) && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={fieldLabelStyle}>Tags</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {d.tags.map((tag, i) => <span key={i} style={tagStyle}>{tag}</span>)}
                {d.tags.length === 0 && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>None</span>}
              </div>
            </div>
          )}
          {d.inherits && (
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Inherits" value={d.inherits} />
            </div>
          )}
          {d.using.length > 0 && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={fieldLabelStyle}>Using</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {d.using.map((u, i) => (
                  <div key={i} style={{ ...fieldValueStyle, gap: '8px' }}>
                    <span style={{ fontWeight: 500 }}>{u.name}</span>
                    {u.prefix && <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>as {u.prefix}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {proposal?.description && (
            <div style={{ gridColumn: '1 / -1', padding: '8px 12px', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '4px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              {proposal.description}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Field({ label, value, proposal, field }: {
  label: string
  value: string
  proposal?: MetadataData
  field?: keyof MetadataData
}) {
  const proposed = field && proposal ? proposal[field] : undefined
  const hasChange = proposed !== undefined && proposed !== value

  return (
    <div>
      <div style={fieldLabelStyle}>{label}</div>
      <div style={{
        ...fieldValueStyle,
        ...(hasChange ? { borderColor: 'var(--accent)', background: 'rgba(59, 130, 246, 0.05)' } : {})
      }}>
        {hasChange ? (
          <span>
            <span style={{ textDecoration: 'line-through', color: 'var(--text-muted)', marginRight: '8px' }}>{value || '(empty)'}</span>
            <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{String(proposed)}</span>
          </span>
        ) : (
          <span>{value || <span style={{ color: 'var(--text-muted)' }}>—</span>}</span>
        )}
      </div>
    </div>
  )
}

// ── Editor ───────────────────────────────────────────────────────────────────

function MetadataEditor({ block, onSave, onCancel }: BlockEditorProps<MetadataData>) {
  const [data, setData] = useState<MetadataData>({ ...block.data })
  const [newTag, setNewTag] = useState('')

  const update = useCallback((field: keyof MetadataData, value: string | string[]) => {
    setData(prev => ({ ...prev, [field]: value }))
  }, [])

  const addTag = useCallback(() => {
    const tag = newTag.trim()
    if (tag && !data.tags.includes(tag)) {
      setData(prev => ({ ...prev, tags: [...prev.tags, tag] }))
      setNewTag('')
    }
  }, [newTag, data.tags])

  const removeTag = useCallback((index: number) => {
    setData(prev => ({ ...prev, tags: prev.tags.filter((_, i) => i !== index) }))
  }, [])

  return (
    <div style={{
      background: 'var(--bg)',
      border: '2px solid var(--accent)',
      borderRadius: '8px',
      overflow: 'hidden'
    }}>
      <div style={{
        padding: '16px 20px',
        fontSize: '14px',
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        borderBottom: '1px solid var(--border)',
        background: 'rgba(59, 130, 246, 0.05)'
      }}>
        <Sparkles size={16} style={{ color: 'var(--accent)' }} />
        <span>Edit Metadata</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          <button onClick={() => onSave(data)} style={saveBtnStyle}>
            <Check size={12} /> Save
          </button>
          <button onClick={onCancel} style={cancelBtnStyle}>
            <X size={12} /> Cancel
          </button>
        </div>
      </div>

      <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <div style={fieldLabelStyle}>ID</div>
          <input value={data.id} onChange={e => update('id', e.target.value)} style={inputStyle} placeholder="my-prompt" />
        </div>
        <div>
          <div style={fieldLabelStyle}>Name</div>
          <input value={data.name} onChange={e => update('name', e.target.value)} style={inputStyle} placeholder="My Prompt" />
        </div>
        <div>
          <div style={fieldLabelStyle}>Version</div>
          <input value={data.version} onChange={e => update('version', e.target.value)} style={inputStyle} placeholder="1.0.0" />
        </div>
        <div>
          <div style={fieldLabelStyle}>Inherits</div>
          <input value={data.inherits} onChange={e => update('inherits', e.target.value)} style={inputStyle} placeholder="@scope/package@^1.0.0/file.prmd" />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={fieldLabelStyle}>Description</div>
          <textarea
            value={data.description}
            onChange={e => update('description', e.target.value)}
            style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }}
            placeholder="A brief description of this prompt"
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={fieldLabelStyle}>Tags</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
            {data.tags.map((tag, i) => (
              <span key={i} style={{ ...tagStyle, cursor: 'pointer' }} onClick={() => removeTag(i)}>
                {tag} <Trash2 size={10} />
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <input
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTag()}
              style={{ ...inputStyle, flex: 1 }}
              placeholder="Add tag..."
            />
            <button onClick={addTag} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '4px 8px', background: 'var(--accent)', color: 'white',
              border: 'none', borderRadius: '4px', cursor: 'pointer'
            }}>
              <Plus size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Diff Renderer ────────────────────────────────────────────────────────────

function MetadataDiff({ currentData, proposedData, description }: BlockDiffProps<MetadataData>) {
  const fields: Array<{ key: keyof MetadataData; label: string }> = [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Name' },
    { key: 'version', label: 'Version' },
    { key: 'description', label: 'Description' },
  ]

  return (
    <div style={{ fontSize: '12px' }}>
      {description && (
        <div style={{ marginBottom: '8px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>{description}</div>
      )}
      {fields.map(({ key, label }) => {
        const curr = String(currentData[key] || '')
        const proposed = String(proposedData[key] || '')
        if (curr === proposed) return null
        return (
          <div key={key} style={{ marginBottom: '4px' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{label}: </span>
            <span style={{ textDecoration: 'line-through', color: 'var(--text-muted)' }}>{curr || '(empty)'}</span>
            {' -> '}
            <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{proposed || '(empty)'}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Shared Button Styles ─────────────────────────────────────────────────────

/** Proposal accept button (green tint) */
const acceptBtnStyle = {
  display: 'flex' as const,
  alignItems: 'center' as const,
  gap: '4px',
  padding: '4px 12px',
  fontSize: '11px',
  fontWeight: 500 as const,
  background: 'rgba(16, 185, 129, 0.1)',
  color: 'var(--success)',
  border: '1px solid rgba(16, 185, 129, 0.3)',
  borderRadius: '4px',
  cursor: 'pointer' as const
}

/** Proposal reject button (red tint) */
const rejectBtnStyle = {
  display: 'flex' as const,
  alignItems: 'center' as const,
  gap: '4px',
  padding: '4px 12px',
  fontSize: '11px',
  fontWeight: 500 as const,
  background: 'rgba(239, 68, 68, 0.08)',
  color: 'var(--error)',
  border: '1px solid rgba(239, 68, 68, 0.2)',
  borderRadius: '4px',
  cursor: 'pointer' as const
}

/** Editor Save button (filled success, matches DesignView) */
const saveBtnStyle = {
  display: 'flex' as const,
  alignItems: 'center' as const,
  gap: '4px',
  padding: '4px 12px',
  fontSize: '11px',
  fontWeight: 500 as const,
  background: 'var(--success)',
  color: 'white',
  border: 'none' as const,
  borderRadius: '4px',
  cursor: 'pointer' as const
}

/** Editor Cancel button (ghost, matches DesignView) */
const cancelBtnStyle = {
  display: 'flex' as const,
  alignItems: 'center' as const,
  gap: '4px',
  padding: '4px 12px',
  fontSize: '11px',
  fontWeight: 500 as const,
  background: 'transparent',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  cursor: 'pointer' as const
}

// ── Extract / Apply ──────────────────────────────────────────────────────────

function extractMetadata(parsed: ParsedPrompd): MetadataData | null {
  const fm = parsed.frontmatter
  if (!fm || typeof fm !== 'object') return null
  return {
    id: fm.id || '',
    name: fm.name || '',
    version: fm.version || '',
    description: fm.description || '',
    tags: Array.isArray(fm.tags) ? fm.tags : [],
    inherits: fm.inherits || '',
    using: Array.isArray(fm.using) ? fm.using : []
  }
}

function applyMetadata(data: MetadataData, document: string, parsed: ParsedPrompd): string {
  const lines = document.split('\n')
  const startIdx = lines.findIndex(l => l.trim() === '---')
  if (startIdx < 0) return document
  const endIdx = lines.findIndex((l, i) => i > startIdx && l.trim() === '---')
  if (endIdx < 0) return document

  // Parse existing frontmatter lines, replace metadata fields
  const fmLines = lines.slice(startIdx + 1, endIdx)
  const metaFields = ['id', 'name', 'version', 'description', 'tags', 'inherits']
  const filteredFm = fmLines.filter(line => {
    const trimmed = line.trim()
    return !metaFields.some(f => trimmed.startsWith(f + ':'))
  })

  const quoteIfNeeded = (val: string) => {
    if (!val) return '""'
    if (val.startsWith('@') || val.includes(' ') || val.includes(':') || val.includes('#') || val.includes('"')) {
      return `"${val.replace(/"/g, '\\"')}"`
    }
    return val
  }

  const newMetaLines: string[] = []
  newMetaLines.push(`id: ${data.id}`)
  newMetaLines.push(`name: ${quoteIfNeeded(data.name)}`)
  newMetaLines.push(`version: ${data.version}`)
  if (data.description) newMetaLines.push(`description: ${quoteIfNeeded(data.description)}`)
  if (data.tags.length > 0) newMetaLines.push(`tags: [${data.tags.join(', ')}]`)
  if (data.inherits) newMetaLines.push(`inherits: ${quoteIfNeeded(data.inherits)}`)

  const allFmLines = [...newMetaLines, ...filteredFm]
  const result = [
    lines.slice(0, startIdx + 1).join('\n'),
    allFmLines.join('\n'),
    lines.slice(endIdx).join('\n')
  ].join('\n')

  return result
}

// ── Registration ─────────────────────────────────────────────────────────────

registerBlock<MetadataData>({
  type: 'metadata',
  label: 'Metadata',
  icon: Sparkles,
  renderer: MetadataRenderer,
  editor: MetadataEditor,
  diffRenderer: MetadataDiff,
  extract: extractMetadata,
  apply: applyMetadata,
  order: 0
})

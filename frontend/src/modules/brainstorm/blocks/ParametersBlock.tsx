/**
 * ParametersBlock - Renders and edits .prmd parameter definitions.
 */

import { useState, useCallback } from 'react'
import { Settings, ChevronDown, ChevronRight, Check, X, Plus, Trash2 } from 'lucide-react'
import { registerBlock } from '../blockRegistry'
import type {
  BlockRendererProps,
  BlockEditorProps,
  BlockDiffProps,
  BlockProposalItem
} from '../types'
import type { ParsedPrompd } from '../../lib/prompdParser'

// ── Data Shape ───────────────────────────────────────────────────────────────

export interface ParameterDef {
  name: string
  type: string
  required?: boolean
  description?: string
  default?: unknown
  enum?: string[]
  min?: number
  max?: number
  pattern?: string
}

export interface ParametersData {
  parameters: ParameterDef[]
}

// ── Styles ───────────────────────────────────────────────────────────────────

const typeBadge = (type: string) => ({
  display: 'inline-flex' as const,
  alignItems: 'center' as const,
  padding: '1px 6px',
  fontSize: '10px',
  fontWeight: 600 as const,
  fontFamily: 'monospace',
  borderRadius: '3px',
  background: type === 'string' ? 'rgba(59, 130, 246, 0.1)'
    : type === 'number' ? 'rgba(168, 85, 247, 0.1)'
    : type === 'boolean' ? 'rgba(34, 197, 94, 0.1)'
    : type === 'array' ? 'rgba(245, 158, 11, 0.1)'
    : 'rgba(107, 114, 128, 0.1)',
  color: type === 'string' ? 'var(--accent)'
    : type === 'number' ? '#a855f7'
    : type === 'boolean' ? 'var(--success)'
    : type === 'array' ? '#f59e0b'
    : 'var(--text-secondary)',
  border: `1px solid ${type === 'string' ? 'rgba(59, 130, 246, 0.2)'
    : type === 'number' ? 'rgba(168, 85, 247, 0.2)'
    : type === 'boolean' ? 'rgba(34, 197, 94, 0.2)'
    : type === 'array' ? 'rgba(245, 158, 11, 0.2)'
    : 'rgba(107, 114, 128, 0.2)'}`
})

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

const inputStyle = {
  width: '100%', padding: '6px 10px', fontSize: '13px',
  background: 'var(--input-bg)', color: 'var(--text)',
  border: '1px solid var(--input-border)', borderRadius: '4px',
  outline: 'none', boxSizing: 'border-box' as const
}

// ── Renderer ─────────────────────────────────────────────────────────────────

function ParametersRenderer({ block, onEdit, proposal, onAcceptProposal, onRejectProposal }: BlockRendererProps<ParametersData>) {
  const params = block.data.parameters
  const [collapsed, setCollapsed] = useState(false)

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
        <Settings size={16} style={{ color: 'var(--accent)' }} />
        <span>Parameters</span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400 }}>
          ({params.length})
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
        <div style={{ padding: params.length > 0 ? '8px 16px 16px' : '16px' }}>
          {params.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', padding: '12px' }}>
              No parameters defined
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {params.map((p, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '8px 12px', background: 'var(--panel)',
                  borderRadius: '6px', border: '1px solid var(--border)'
                }}>
                  <span style={{ fontWeight: 500, fontSize: '13px', color: 'var(--text)', fontFamily: 'monospace' }}>
                    {p.name}
                  </span>
                  <span style={typeBadge(p.type)}>{p.type}</span>
                  {p.required && (
                    <span style={{
                      fontSize: '10px', fontWeight: 600, color: 'var(--error)',
                      background: 'rgba(239, 68, 68, 0.08)', padding: '1px 5px',
                      borderRadius: '3px', border: '1px solid rgba(239, 68, 68, 0.15)'
                    }}>
                      required
                    </span>
                  )}
                  {p.description && (
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.description}
                    </span>
                  )}
                  {p.default !== undefined && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      = {JSON.stringify(p.default)}
                    </span>
                  )}
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

function ParametersEditor({ block, onSave, onCancel }: BlockEditorProps<ParametersData>) {
  const [params, setParams] = useState<ParameterDef[]>(block.data.parameters.map(p => ({ ...p })))

  const updateParam = useCallback((index: number, field: keyof ParameterDef, value: unknown) => {
    setParams(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p))
  }, [])

  const addParam = useCallback(() => {
    setParams(prev => [...prev, { name: '', type: 'string' }])
  }, [])

  const removeParam = useCallback((index: number) => {
    setParams(prev => prev.filter((_, i) => i !== index))
  }, [])

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
        <Settings size={16} style={{ color: 'var(--accent)' }} />
        <span>Edit Parameters</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          <button onClick={() => onSave({ parameters: params })} style={saveBtnStyle}>
            <Check size={12} /> Save
          </button>
          <button onClick={onCancel} style={cancelBtnStyle}>
            <X size={12} /> Cancel
          </button>
        </div>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {params.map((p, i) => (
          <div key={i} style={{
            padding: '12px', background: 'var(--panel)',
            borderRadius: '6px', border: '1px solid var(--border)',
            display: 'grid', gridTemplateColumns: '1fr 120px auto auto', gap: '8px', alignItems: 'center'
          }}>
            <input
              value={p.name}
              onChange={e => updateParam(i, 'name', e.target.value)}
              style={inputStyle}
              placeholder="parameter_name"
            />
            <select
              value={p.type}
              onChange={e => updateParam(i, 'type', e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="string">string</option>
              <option value="number">number</option>
              <option value="boolean">boolean</option>
              <option value="array">array</option>
              <option value="object">object</option>
              <option value="file">file</option>
              <option value="json">json</option>
              <option value="jwt">jwt</option>
              <option value="base64">base64</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input
                type="checkbox"
                checked={p.required || false}
                onChange={e => updateParam(i, 'required', e.target.checked)}
              />
              Req
            </label>
            <button onClick={() => removeParam(i)} style={{ ...rejectBtnStyle, padding: '4px' }}>
              <Trash2 size={12} />
            </button>
            {/* Second row: description */}
            <div style={{ gridColumn: '1 / -1' }}>
              <input
                value={p.description || ''}
                onChange={e => updateParam(i, 'description', e.target.value)}
                style={{ ...inputStyle, fontSize: '12px' }}
                placeholder="Description..."
              />
            </div>
          </div>
        ))}
        <button onClick={addParam} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          padding: '8px', background: 'transparent', border: '1px dashed var(--border)',
          borderRadius: '6px', color: 'var(--text-secondary)', cursor: 'pointer',
          fontSize: '12px'
        }}>
          <Plus size={14} /> Add Parameter
        </button>
      </div>
    </div>
  )
}

// ── Diff Renderer ────────────────────────────────────────────────────────────

function ParametersDiff({ currentData, proposedData, description }: BlockDiffProps<ParametersData>) {
  const currNames = new Set(currentData.parameters.map(p => p.name))
  const propNames = new Set(proposedData.parameters.map(p => p.name))
  const added = proposedData.parameters.filter(p => !currNames.has(p.name))
  const removed = currentData.parameters.filter(p => !propNames.has(p.name))
  const modified = proposedData.parameters.filter(p => {
    if (!currNames.has(p.name)) return false
    const curr = currentData.parameters.find(c => c.name === p.name)
    return curr && JSON.stringify(curr) !== JSON.stringify(p)
  })

  return (
    <div style={{ fontSize: '12px' }}>
      {description && <div style={{ marginBottom: '8px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>{description}</div>}
      {added.map(p => (
        <div key={p.name} style={{ color: '#22c55e', marginBottom: '2px' }}>
          + {p.name} ({p.type}){p.required ? ' [required]' : ''}
        </div>
      ))}
      {removed.map(p => (
        <div key={p.name} style={{ color: '#ef4444', textDecoration: 'line-through', marginBottom: '2px' }}>
          - {p.name} ({p.type})
        </div>
      ))}
      {modified.map(p => (
        <div key={p.name} style={{ color: 'var(--accent)', marginBottom: '2px' }}>
          ~ {p.name}: modified
        </div>
      ))}
      {added.length === 0 && removed.length === 0 && modified.length === 0 && (
        <div style={{ color: 'var(--text-muted)' }}>No changes</div>
      )}
    </div>
  )
}

// ── Extract / Apply ──────────────────────────────────────────────────────────

function extractParameters(parsed: ParsedPrompd): ParametersData | null {
  const schema = parsed.paramsSchema
  if (!schema || typeof schema !== 'object') return { parameters: [] }

  const parameters: ParameterDef[] = Object.entries(schema).map(([name, def]) => ({
    name,
    type: def.type || 'string',
    required: def.required,
    description: def.description,
    default: def.default,
    enum: def.enum as string[] | undefined,
    min: def.min,
    max: def.max,
    pattern: def.pattern
  }))

  return { parameters }
}

function applyParameters(data: ParametersData, document: string): string {
  const lines = document.split('\n')
  const startIdx = lines.findIndex(l => l.trim() === '---')
  if (startIdx < 0) return document
  const endIdx = lines.findIndex((l, i) => i > startIdx && l.trim() === '---')
  if (endIdx < 0) return document

  // Remove existing parameters block from frontmatter
  const fmLines = lines.slice(startIdx + 1, endIdx)
  const filteredFm: string[] = []
  let skipParam = false
  for (const line of fmLines) {
    if (line.trim().startsWith('parameters:')) {
      skipParam = true
      continue
    }
    if (skipParam) {
      // Parameter entries are indented
      if (line.startsWith('  ') && (line.trim().startsWith('- name:') || line.trim().startsWith('name:') || line.trim().startsWith('type:') || line.trim().startsWith('required:') || line.trim().startsWith('description:') || line.trim().startsWith('default:') || line.trim().startsWith('enum:') || line.trim().startsWith('min:') || line.trim().startsWith('max:') || line.trim().startsWith('pattern:'))) {
        continue
      }
      skipParam = false
    }
    filteredFm.push(line)
  }

  // Build new parameters YAML
  if (data.parameters.length > 0) {
    const paramLines: string[] = ['parameters:']
    for (const p of data.parameters) {
      paramLines.push(`  - name: ${p.name}`)
      paramLines.push(`    type: ${p.type}`)
      if (p.required) paramLines.push(`    required: true`)
      if (p.description) paramLines.push(`    description: "${p.description.replace(/"/g, '\\"')}"`)
      if (p.default !== undefined) {
        if (typeof p.default === 'string') {
          paramLines.push(`    default: "${p.default.replace(/"/g, '\\"')}"`)
        } else {
          paramLines.push(`    default: ${JSON.stringify(p.default)}`)
        }
      }
      if (p.enum && p.enum.length > 0) paramLines.push(`    enum: ${JSON.stringify(p.enum)}`)
      if (p.min !== undefined) paramLines.push(`    min: ${p.min}`)
      if (p.max !== undefined) paramLines.push(`    max: ${p.max}`)
      if (p.pattern) paramLines.push(`    pattern: "${p.pattern.replace(/"/g, '\\"')}"`)
    }
    filteredFm.push(...paramLines)
  }

  return [
    lines.slice(0, startIdx + 1).join('\n'),
    filteredFm.join('\n'),
    lines.slice(endIdx).join('\n')
  ].join('\n')
}

// ── Registration ─────────────────────────────────────────────────────────────

registerBlock<ParametersData>({
  type: 'parameters',
  label: 'Parameters',
  icon: Settings,
  renderer: ParametersRenderer,
  editor: ParametersEditor,
  diffRenderer: ParametersDiff,
  extract: extractParameters,
  apply: applyParameters,
  order: 1
})

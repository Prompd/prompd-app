/**
 * SkillNodeProperties - Property editor for Skill nodes
 *
 * Discovers installed skills via the useInstalledSkills hook and generates
 * schema-driven parameter fields from the skill's parameter JSON Schema.
 */

import { useState, useMemo } from 'react'
import { RefreshCw, Loader2, Plus, Trash2, Sparkles, Globe, FolderOpen } from 'lucide-react'
import type { SkillNodeData } from '../../../services/workflowTypes'
import { useInstalledSkills } from '../../../hooks'
import type { InstalledSkill } from '../../../hooks'
import { labelStyle, inputStyle, selectStyle } from '../shared/styles/propertyStyles'

export interface SkillNodePropertiesProps {
  data: SkillNodeData
  onChange: (field: string, value: unknown) => void
  nodeId?: string
}

/** Extract flat properties from a JSON Schema parameters object */
function getSchemaProperties(parameters: Record<string, unknown> | undefined): {
  name: string
  type: string
  description: string
  required: boolean
  enumValues?: string[]
}[] {
  if (!parameters) return []

  const props = parameters.properties as Record<string, {
    type?: string
    description?: string
    enum?: string[]
  }> | undefined

  if (!props) return []

  const requiredSet = new Set(
    Array.isArray(parameters.required) ? parameters.required as string[] : []
  )

  return Object.entries(props).map(([name, prop]) => ({
    name,
    type: prop.type || 'string',
    description: prop.description || '',
    required: requiredSet.has(name),
    enumValues: prop.enum,
  }))
}

export function SkillNodeProperties({ data, onChange }: SkillNodePropertiesProps) {
  const { skills, isLoading, error: skillsError, refresh } = useInstalledSkills()

  // Find the currently selected skill
  const selectedSkill = useMemo(
    () => skills.find(s => s.name === data.skillName && (
      !data.skillScope || s.scope === data.skillScope
    )),
    [skills, data.skillName, data.skillScope]
  )

  // Schema-driven parameters from the selected skill
  const schemaProps = useMemo(
    () => getSchemaProperties(selectedSkill?.parameters as Record<string, unknown> | undefined),
    [selectedSkill]
  )

  const [paramKey, setParamKey] = useState('')
  const [paramValue, setParamValue] = useState('')

  const parameters = (data.parameters && typeof data.parameters === 'object')
    ? data.parameters as Record<string, unknown>
    : {}

  const handleSkillSelect = (skillName: string) => {
    const skill = skills.find(s => s.name === skillName)
    if (skill) {
      onChange('skillName', skill.name)
      onChange('skillVersion', skill.version)
      onChange('skillPath', skill.path)
      onChange('skillScope', skill.scope)
    } else {
      onChange('skillName', skillName)
      onChange('skillVersion', undefined)
      onChange('skillPath', undefined)
      onChange('skillScope', undefined)
    }
  }

  const handleAddParameter = () => {
    if (paramKey.trim()) {
      onChange('parameters', {
        ...parameters,
        [paramKey.trim()]: paramValue,
      })
      setParamKey('')
      setParamValue('')
    }
  }

  const handleRemoveParameter = (key: string) => {
    const newParams = { ...parameters }
    delete newParams[key]
    onChange('parameters', newParams)
  }

  const handleSchemaParamChange = (name: string, value: string) => {
    onChange('parameters', {
      ...parameters,
      [name]: value,
    })
  }

  return (
    <>
      {/* Skill Selector */}
      <div>
        <label style={{
          ...labelStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span>Skill</span>
          <button
            onClick={refresh}
            disabled={isLoading}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: isLoading ? 'default' : 'pointer',
              color: 'var(--muted)',
              padding: '0 2px',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Refresh installed skills"
          >
            {isLoading
              ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
              : <RefreshCw size={12} />
            }
          </button>
        </label>

        {skills.length > 0 ? (
          <select
            value={data.skillName || ''}
            onChange={(e) => handleSkillSelect(e.target.value)}
            style={selectStyle}
          >
            <option value="">Select skill...</option>
            {skills.map(skill => (
              <option key={`${skill.scope}:${skill.name}`} value={skill.name}>
                {skill.name} ({skill.version}) [{skill.scope}]
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={data.skillName || ''}
            onChange={(e) => onChange('skillName', e.target.value)}
            style={inputStyle}
            placeholder="@namespace/skill-name"
          />
        )}

        {/* Error loading skills */}
        {skillsError && (
          <div style={{
            fontSize: '11px',
            color: 'var(--error, #ef4444)',
            marginTop: '4px',
          }}>
            {skillsError}
          </div>
        )}
      </div>

      {/* Skill Info (when selected) */}
      {selectedSkill && (
        <div style={{
          padding: '8px 10px',
          background: 'var(--panel-2)',
          borderRadius: '6px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}>
          {/* Description */}
          {selectedSkill.description && (
            <div style={{
              fontSize: '11px',
              color: 'var(--text-secondary)',
              lineHeight: '1.4',
            }}>
              {selectedSkill.description}
            </div>
          )}

          {/* Meta badges row */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {/* Version */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              padding: '2px 6px',
              background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
              borderRadius: '4px',
              fontSize: '10px',
              color: 'var(--accent)',
              fontWeight: 500,
            }}>
              <Sparkles size={9} />
              v{selectedSkill.version}
            </div>

            {/* Scope */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              padding: '2px 6px',
              background: 'color-mix(in srgb, var(--muted) 15%, transparent)',
              borderRadius: '4px',
              fontSize: '10px',
              color: 'var(--muted)',
            }}>
              {selectedSkill.scope === 'user'
                ? <Globe size={9} />
                : <FolderOpen size={9} />
              }
              {selectedSkill.scope}
            </div>
          </div>

          {/* Required tools */}
          {selectedSkill.tools && selectedSkill.tools.length > 0 && (
            <div>
              <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '3px' }}>
                Required tools:
              </div>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {selectedSkill.tools.map(tool => (
                  <span
                    key={tool}
                    style={{
                      padding: '1px 6px',
                      background: 'color-mix(in srgb, var(--node-yellow) 15%, transparent)',
                      borderRadius: '3px',
                      fontSize: '10px',
                      color: 'var(--node-yellow)',
                      fontFamily: 'monospace',
                    }}
                  >
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Allowed tools */}
          {selectedSkill.allowedTools && selectedSkill.allowedTools.length > 0 && (
            <div>
              <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '3px' }}>
                Allowed tools:
              </div>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {selectedSkill.allowedTools.map(tool => (
                  <span
                    key={tool}
                    style={{
                      padding: '1px 6px',
                      background: 'color-mix(in srgb, var(--success) 15%, transparent)',
                      borderRadius: '3px',
                      fontSize: '10px',
                      color: 'var(--success)',
                      fontFamily: 'monospace',
                    }}
                  >
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Schema-Driven Parameters */}
      {schemaProps.length > 0 && (
        <div>
          <label style={labelStyle}>Parameters</label>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}>
            {schemaProps.map(prop => (
              <div key={prop.name}>
                <label style={{
                  display: 'block',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  marginBottom: '2px',
                }}>
                  <code style={{ color: 'var(--accent)', fontSize: '11px' }}>{prop.name}</code>
                  {prop.required && <span style={{ color: 'var(--error, #ef4444)', marginLeft: '2px' }}>*</span>}
                  {prop.description && (
                    <span style={{ color: 'var(--muted)', marginLeft: '6px' }}>
                      {prop.description.length > 60 ? prop.description.slice(0, 60) + '...' : prop.description}
                    </span>
                  )}
                </label>
                {prop.enumValues ? (
                  <select
                    value={String(parameters[prop.name] ?? '')}
                    onChange={(e) => handleSchemaParamChange(prop.name, e.target.value)}
                    style={selectStyle}
                  >
                    <option value="">Select...</option>
                    {prop.enumValues.map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={String(parameters[prop.name] ?? '')}
                    onChange={(e) => handleSchemaParamChange(prop.name, e.target.value)}
                    style={inputStyle}
                    placeholder={'{{ expression }} or value'}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual Parameters */}
      <div>
        <label style={labelStyle}>
          {schemaProps.length > 0 ? 'Additional Parameters' : 'Parameters'}
        </label>
        <div style={{
          border: '1px solid var(--input-border)',
          borderRadius: '6px',
          overflow: 'hidden',
        }}>
          {(() => {
            const schemaNames = new Set(schemaProps.map(p => p.name))
            const manualEntries = Object.entries(parameters).filter(([key]) => !schemaNames.has(key))
            return manualEntries.length > 0 ? (
              <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                {manualEntries.map(([key, value]) => (
                  <div
                    key={key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      borderBottom: '1px solid var(--border)',
                      background: 'var(--input-bg)',
                    }}
                  >
                    <code style={{ fontSize: '11px', color: 'var(--accent)' }}>{key}</code>
                    <span style={{ color: 'var(--muted)', fontSize: '11px' }}>=</span>
                    <code style={{ fontSize: '11px', color: 'var(--text-secondary)', flex: 1 }}>
                      {String(value).length > 30 ? String(value).slice(0, 30) + '...' : String(value)}
                    </code>
                    <button
                      onClick={() => handleRemoveParameter(key)}
                      style={{
                        padding: '2px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--muted)',
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              schemaProps.length === 0 && (
                <div style={{
                  padding: '12px',
                  textAlign: 'center',
                  color: 'var(--muted)',
                  fontSize: '11px',
                  background: 'var(--input-bg)',
                }}>
                  No parameters defined
                </div>
              )
            )
          })()}

          {/* Add Parameter */}
          <div style={{
            display: 'flex',
            gap: '4px',
            padding: '8px',
            background: 'var(--panel-2)',
          }}>
            <input
              type="text"
              value={paramKey}
              onChange={(e) => setParamKey(e.target.value)}
              placeholder="key"
              style={{ ...inputStyle, flex: 1, padding: '4px 8px', fontSize: '11px' }}
            />
            <input
              type="text"
              value={paramValue}
              onChange={(e) => setParamValue(e.target.value)}
              placeholder="{{ expression }}"
              style={{ ...inputStyle, flex: 2, padding: '4px 8px', fontSize: '11px' }}
            />
            <button
              onClick={handleAddParameter}
              disabled={!paramKey.trim()}
              style={{
                padding: '4px 8px',
                background: paramKey.trim() ? 'var(--accent)' : 'var(--muted)',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: paramKey.trim() ? 'pointer' : 'not-allowed',
                fontSize: '11px',
              }}
            >
              <Plus size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* Timeout */}
      <div>
        <label style={labelStyle}>Timeout (ms)</label>
        <input
          type="number"
          min={0}
          step={1000}
          value={typeof data.timeoutMs === 'number' ? data.timeoutMs : 60000}
          onChange={(e) => onChange('timeoutMs', parseInt(e.target.value) || 60000)}
          style={inputStyle}
        />
      </div>
    </>
  )
}

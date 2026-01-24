/**
 * WorkflowParametersPanel - Panel for managing workflow-level parameters
 *
 * Draggable panel that can be repositioned on the canvas.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { Settings, Plus, Trash2, ChevronDown, ChevronRight, GripVertical } from 'lucide-react'
import { useWorkflowStore } from '../../../stores/workflowStore'
import type { WorkflowParameter } from '../../services/workflowTypes'

interface Position {
  x: number
  y: number
}

// Dock threshold - if Y is within this distance from 0, snap to dock
const DOCK_SNAP_THRESHOLD = 30
// Tear-away threshold - must drag this far down from dock to undock
const TEAR_AWAY_THRESHOLD = 40

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 500,
  color: 'var(--text-secondary)',
  marginBottom: '4px',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid var(--input-border)',
  borderRadius: '4px',
  background: 'var(--input-bg)',
  color: 'var(--text)',
  fontSize: '12px',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
}

export function WorkflowParametersPanel() {
  const [isExpanded, setIsExpanded] = useState(true)
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 })
  const [isDocked, setIsDocked] = useState(true) // Start docked at top
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number; wasDocked: boolean } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const workflowFile = useWorkflowStore(state => state.workflowFile)
  const updateWorkflowParameters = useWorkflowStore(state => state.updateWorkflowParameters)

  const parameters = workflowFile?.parameters || []

  // Handle drag start
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
      wasDocked: isDocked,
    }
  }, [position, isDocked])

  // Handle drag move and end with useEffect
  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return
      const deltaX = e.clientX - dragStartRef.current.x
      const deltaY = e.clientY - dragStartRef.current.y

      let newX = dragStartRef.current.posX + deltaX
      let newY = dragStartRef.current.posY + deltaY

      // Docking logic
      if (dragStartRef.current.wasDocked) {
        // If was docked, need to drag past tear-away threshold to undock
        if (deltaY > TEAR_AWAY_THRESHOLD) {
          setIsDocked(false)
        } else {
          // Still docked - only allow X movement, keep Y at 0
          newY = 0
          setIsDocked(true)
        }
      } else {
        // If not docked, check if should snap to dock
        if (newY < DOCK_SNAP_THRESHOLD && newY > -DOCK_SNAP_THRESHOLD) {
          newY = 0
          setIsDocked(true)
        } else {
          setIsDocked(false)
        }
      }

      setPosition({ x: newX, y: newY })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      dragStartRef.current = null

      // On release, if close to top, snap to dock
      if (position.y < DOCK_SNAP_THRESHOLD && position.y > -DOCK_SNAP_THRESHOLD) {
        setPosition(prev => ({ ...prev, y: 0 }))
        setIsDocked(true)
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, position.y])

  const addParameter = () => {
    const newParam: WorkflowParameter = {
      name: `param_${parameters.length + 1}`,
      type: 'string',
      required: false,
      description: '',
    }
    updateWorkflowParameters([...parameters, newParam])
  }

  const updateParameter = (index: number, updates: Partial<WorkflowParameter>) => {
    const newParams = [...parameters]
    newParams[index] = { ...newParams[index], ...updates }
    updateWorkflowParameters(newParams)
  }

  const removeParameter = (index: number) => {
    const newParams = parameters.filter((_, i) => i !== index)
    updateWorkflowParameters(newParams)
  }

  // Stop events from bubbling to React Flow
  const stopPropagation = (e: React.SyntheticEvent) => {
    e.stopPropagation()
  }

  return (
    <div
      ref={panelRef}
      style={{
        background: 'var(--panel)',
        borderRadius: isDocked ? '0 0 8px 8px' : '8px',
        boxShadow: isDragging ? '0 4px 16px rgba(0,0,0,0.25)' : '0 2px 8px rgba(0,0,0,0.15)',
        borderLeft: `1px solid ${isDragging ? 'var(--accent)' : 'var(--border)'}`,
        borderRight: `1px solid ${isDragging ? 'var(--accent)' : 'var(--border)'}`,
        borderBottom: `1px solid ${isDragging ? 'var(--accent)' : 'var(--border)'}`,
        borderTop: isDocked ? 'none' : `1px solid ${isDragging ? 'var(--accent)' : 'var(--border)'}`,
        overflow: 'hidden',
        minWidth: '280px',
        transform: `translate(${position.x}px, ${position.y}px)`,
        transition: isDragging ? 'none' : 'transform 0.15s ease-out, box-shadow 0.2s, border-color 0.2s, border-radius 0.15s',
        cursor: isDragging ? 'grabbing' : 'default',
      }}
      onKeyDown={stopPropagation}
      onMouseDown={stopPropagation}
      onClick={stopPropagation}
    >
      {/* Header with drag handle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {/* Drag handle */}
        <div
          onMouseDown={handleDragStart}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '10px 4px 10px 8px',
            cursor: isDragging ? 'grabbing' : 'grab',
            color: 'var(--muted)',
            borderRight: '1px solid var(--border)',
          }}
          title="Drag to move"
        >
          <GripVertical style={{ width: 14, height: 14 }} />
        </div>

        {/* Header button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 12px 10px 8px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text)',
          }}
        >
          {isExpanded ? (
            <ChevronDown style={{ width: 14, height: 14, color: 'var(--muted)' }} />
          ) : (
            <ChevronRight style={{ width: 14, height: 14, color: 'var(--muted)' }} />
          )}
          <Settings style={{ width: 14, height: 14, color: 'var(--accent)' }} />
          <span style={{ fontSize: '12px', fontWeight: 500 }}>
            Workflow Parameters
          </span>
          <span style={{
            marginLeft: 'auto',
            fontSize: '11px',
            color: 'var(--muted)',
            background: 'var(--panel-2)',
            padding: '2px 6px',
            borderRadius: '4px',
          }}>
            {parameters.length}
          </span>
        </button>
      </div>

      {/* Content */}
      {isExpanded && (
        <div style={{ padding: '0 12px 12px', maxHeight: '300px', overflowY: 'auto' }}>
          {/* Parameters list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {parameters.map((param, index) => (
              <ParameterRow
                key={index}
                parameter={param}
                onChange={(updates) => updateParameter(index, updates)}
                onRemove={() => removeParameter(index)}
              />
            ))}
          </div>

          {/* Add button */}
          <button
            onClick={addParameter}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px',
              marginTop: '8px',
              background: 'transparent',
              border: '1px dashed var(--border)',
              borderRadius: '6px',
              cursor: 'pointer',
              color: 'var(--accent)',
              fontSize: '12px',
            }}
          >
            <Plus style={{ width: 14, height: 14 }} />
            Add Parameter
          </button>

          {/* Usage hint */}
          {parameters.length > 0 && (
            <div style={{
              marginTop: '12px',
              padding: '8px',
              background: 'var(--panel-2)',
              borderRadius: '4px',
              fontSize: '10px',
              color: 'var(--text-secondary)',
            }}>
              Use <code style={{ background: 'var(--input-bg)', padding: '1px 4px', borderRadius: '2px' }}>
                {'{{ workflow.param_name }}'}
              </code> in node parameters to reference these values.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface ParameterRowProps {
  parameter: WorkflowParameter
  onChange: (updates: Partial<WorkflowParameter>) => void
  onRemove: () => void
}

function ParameterRow({ parameter, onChange, onRemove }: ParameterRowProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div
      style={{
        background: 'var(--panel-2)',
        borderRadius: '6px',
        border: '1px solid var(--border)',
        overflow: 'hidden',
      }}
    >
      {/* Collapsed view */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px',
        }}
      >
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          style={{
            padding: '2px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--muted)',
          }}
        >
          {isExpanded ? (
            <ChevronDown style={{ width: 12, height: 12 }} />
          ) : (
            <ChevronRight style={{ width: 12, height: 12 }} />
          )}
        </button>

        <input
          type="text"
          value={parameter.name}
          onChange={(e) => onChange({ name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
          placeholder="param_name"
          style={{
            flex: 1,
            padding: '4px 8px',
            border: 'none',
            background: 'transparent',
            color: 'var(--text)',
            fontSize: '12px',
            fontFamily: 'monospace',
          }}
        />

        <select
          value={parameter.type}
          onChange={(e) => onChange({ type: e.target.value as WorkflowParameter['type'] })}
          style={{
            padding: '4px 6px',
            border: '1px solid var(--input-border)',
            borderRadius: '4px',
            background: 'var(--input-bg)',
            color: 'var(--text)',
            fontSize: '11px',
            cursor: 'pointer',
          }}
        >
          <option value="string">string</option>
          <option value="number">number</option>
          <option value="integer">integer</option>
          <option value="boolean">boolean</option>
          <option value="array">array</option>
          <option value="object">object</option>
        </select>

        {parameter.required && (
          <span style={{
            fontSize: '10px',
            color: 'var(--error)',
            fontWeight: 500,
          }}>
            *
          </span>
        )}

        <button
          onClick={onRemove}
          style={{
            padding: '4px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--muted)',
          }}
          title="Remove parameter"
        >
          <Trash2 style={{ width: 12, height: 12 }} />
        </button>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div style={{
          padding: '8px 12px 12px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          <div>
            <label style={labelStyle}>Description</label>
            <input
              type="text"
              value={parameter.description || ''}
              onChange={(e) => onChange({ description: e.target.value })}
              placeholder="Parameter description..."
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Default Value</label>
              {parameter.type === 'boolean' ? (
                <select
                  value={parameter.default !== undefined ? String(parameter.default) : ''}
                  onChange={(e) => {
                    const val = e.target.value === '' ? undefined : e.target.value === 'true'
                    onChange({ default: val })
                  }}
                  style={selectStyle}
                >
                  <option value="">No default</option>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  type={parameter.type === 'number' || parameter.type === 'integer' ? 'number' : 'text'}
                  value={parameter.default as string || ''}
                  onChange={(e) => {
                    let value: unknown = e.target.value
                    if (parameter.type === 'number') value = parseFloat(e.target.value) || 0
                    if (parameter.type === 'integer') value = parseInt(e.target.value) || 0
                    onChange({ default: value })
                  }}
                  placeholder="Default value..."
                  style={inputStyle}
                />
              )}
            </div>

            <div style={{ width: '80px' }}>
              <label style={labelStyle}>Required</label>
              <select
                value={parameter.required ? 'yes' : 'no'}
                onChange={(e) => onChange({ required: e.target.value === 'yes' })}
                style={selectStyle}
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
          </div>

          {(parameter.type === 'number' || parameter.type === 'integer') && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Min</label>
                <input
                  type="number"
                  value={parameter.min ?? ''}
                  onChange={(e) => onChange({ min: e.target.value ? parseFloat(e.target.value) : undefined })}
                  placeholder="Min"
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Max</label>
                <input
                  type="number"
                  value={parameter.max ?? ''}
                  onChange={(e) => onChange({ max: e.target.value ? parseFloat(e.target.value) : undefined })}
                  placeholder="Max"
                  style={inputStyle}
                />
              </div>
            </div>
          )}

          {parameter.type === 'string' && (
            <div>
              <label style={labelStyle}>Allowed Values (comma-separated, optional)</label>
              <input
                type="text"
                value={parameter.enum?.join(', ') || ''}
                onChange={(e) => {
                  const values = e.target.value.split(',').map(v => v.trim()).filter(v => v)
                  onChange({ enum: values.length > 0 ? values : undefined })
                }}
                placeholder="option1, option2, option3"
                style={inputStyle}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * WorkflowRunDialog - Dialog for entering parameter values before workflow execution
 */

import { useState, useEffect } from 'react'
import { X, Play, AlertCircle } from 'lucide-react'
import type { WorkflowParameter } from '../../services/workflowTypes'
import type { ExecutionMode } from '../../services/workflowExecutor'

interface WorkflowRunDialogProps {
  parameters: WorkflowParameter[]
  executionMode: ExecutionMode
  initialValues?: Record<string, unknown>
  onRun: (params: Record<string, unknown>) => void
  onCancel: () => void
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 500,
  color: 'var(--text)',
  marginBottom: '4px',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--input-border)',
  borderRadius: '6px',
  background: 'var(--input-bg)',
  color: 'var(--text)',
  fontSize: '13px',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
}

export function WorkflowRunDialog({
  parameters,
  executionMode,
  initialValues,
  onRun,
  onCancel,
}: WorkflowRunDialogProps) {
  // Initialize parameter values from initialValues (previous run), then defaults
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {}
    for (const param of parameters) {
      // Use initialValues if available, otherwise fall back to param default or type default
      if (initialValues && param.name in initialValues) {
        initial[param.name] = initialValues[param.name]
      } else {
        initial[param.name] = param.default ?? getDefaultForType(param.type)
      }
    }
    return initial
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  // Validate on mount and value change
  useEffect(() => {
    const newErrors: Record<string, string> = {}
    for (const param of parameters) {
      const value = values[param.name]
      if (param.required && (value === undefined || value === null || value === '')) {
        newErrors[param.name] = 'Required'
      } else if (param.type === 'number' || param.type === 'integer') {
        const numVal = Number(value)
        if (param.min !== undefined && numVal < param.min) {
          newErrors[param.name] = `Min: ${param.min}`
        }
        if (param.max !== undefined && numVal > param.max) {
          newErrors[param.name] = `Max: ${param.max}`
        }
      }
    }
    setErrors(newErrors)
  }, [values, parameters])

  const handleValueChange = (name: string, value: unknown, type: string) => {
    let parsedValue = value
    if (type === 'number') {
      parsedValue = value === '' ? undefined : parseFloat(value as string)
    } else if (type === 'integer') {
      parsedValue = value === '' ? undefined : parseInt(value as string, 10)
    } else if (type === 'boolean') {
      parsedValue = value === 'true'
    }
    setValues(prev => ({ ...prev, [name]: parsedValue }))
  }

  const handleRun = () => {
    // Check for validation errors
    if (Object.keys(errors).length > 0) {
      return
    }
    onRun(values)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && Object.keys(errors).length === 0) {
      handleRun()
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }

  const hasErrors = Object.keys(errors).length > 0

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onCancel}
      onKeyDown={handleKeyDown}
    >
      <div
        style={{
          background: 'var(--panel)',
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          border: '1px solid var(--border)',
          width: '100%',
          maxWidth: '480px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Play style={{ width: 18, height: 18, color: 'var(--success)' }} />
            <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
              Run Workflow
            </span>
            <span
              style={{
                fontSize: '11px',
                color: 'var(--muted)',
                background: 'var(--panel-2)',
                padding: '2px 8px',
                borderRadius: '4px',
              }}
            >
              {executionMode}
            </span>
          </div>
          <button
            onClick={onCancel}
            style={{
              padding: '6px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--muted)',
              borderRadius: '4px',
            }}
          >
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            padding: '20px',
            overflowY: 'auto',
            flex: 1,
          }}
        >
          {parameters.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '24px',
                color: 'var(--muted)',
                fontSize: '13px',
              }}
            >
              This workflow has no parameters.
              <br />
              Click Run to start execution.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {parameters.map(param => (
                <ParameterInput
                  key={param.name}
                  parameter={param}
                  value={values[param.name]}
                  error={errors[param.name]}
                  onChange={(value) => handleValueChange(param.name, value, param.type)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '10px',
            padding: '16px 20px',
            borderTop: '1px solid var(--border)',
          }}
        >
          <button
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              cursor: 'pointer',
              color: 'var(--text)',
              fontSize: '13px',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleRun}
            disabled={hasErrors}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 20px',
              background: hasErrors
                ? 'var(--panel-2)'
                : 'var(--success)',
              border: 'none',
              borderRadius: '6px',
              cursor: hasErrors ? 'not-allowed' : 'pointer',
              color: hasErrors ? 'var(--muted)' : 'white',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            <Play style={{ width: 14, height: 14 }} />
            Run
          </button>
        </div>
      </div>
    </div>
  )
}

interface ParameterInputProps {
  parameter: WorkflowParameter
  value: unknown
  error?: string
  onChange: (value: unknown) => void
}

function ParameterInput({ parameter, value, error, onChange }: ParameterInputProps) {
  const { name, type, required, description, enum: enumValues } = parameter

  return (
    <div>
      <label style={labelStyle}>
        {name}
        {required && <span style={{ color: 'var(--error)', marginLeft: '4px' }}>*</span>}
      </label>

      {description && (
        <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '6px' }}>
          {description}
        </div>
      )}

      {/* Render appropriate input based on type */}
      {enumValues && enumValues.length > 0 ? (
        <select
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          style={{
            ...selectStyle,
            borderColor: error ? 'var(--error)' : 'var(--input-border)',
          }}
        >
          <option value="">Select...</option>
          {enumValues.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : type === 'boolean' ? (
        <select
          value={String(value ?? 'false')}
          onChange={(e) => onChange(e.target.value)}
          style={{
            ...selectStyle,
            borderColor: error ? 'var(--error)' : 'var(--input-border)',
          }}
        >
          <option value="false">false</option>
          <option value="true">true</option>
        </select>
      ) : type === 'number' || type === 'integer' ? (
        <input
          type="number"
          value={typeof value === 'number' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={getPlaceholder(parameter)}
          step={type === 'integer' ? 1 : 'any'}
          min={parameter.min}
          max={parameter.max}
          style={{
            ...inputStyle,
            borderColor: error ? 'var(--error)' : 'var(--input-border)',
          }}
        />
      ) : type === 'array' || type === 'object' ? (
        <input
          type="text"
          value={typeof value === 'string' ? value : JSON.stringify(value ?? '')}
          onChange={(e) => {
            try {
              onChange(JSON.parse(e.target.value))
            } catch {
              onChange(e.target.value)
            }
          }}
          placeholder={type === 'array' ? '["item1", "item2"]' : '{"key": "value"}'}
          style={{
            ...inputStyle,
            fontFamily: 'monospace',
            borderColor: error ? 'var(--error)' : 'var(--input-border)',
          }}
        />
      ) : (
        <input
          type="text"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder={getPlaceholder(parameter)}
          style={{
            ...inputStyle,
            borderColor: error ? 'var(--error)' : 'var(--input-border)',
          }}
        />
      )}

      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            marginTop: '4px',
            fontSize: '11px',
            color: 'var(--error)',
          }}
        >
          <AlertCircle style={{ width: 12, height: 12 }} />
          {error}
        </div>
      )}
    </div>
  )
}

function getDefaultForType(type: string): unknown {
  switch (type) {
    case 'string':
      return ''
    case 'number':
    case 'integer':
      return undefined
    case 'boolean':
      return false
    case 'array':
      return []
    case 'object':
      return {}
    default:
      return ''
  }
}

function getPlaceholder(param: WorkflowParameter): string {
  if (param.type === 'number' || param.type === 'integer') {
    const parts: string[] = []
    if (param.min !== undefined) parts.push(`min: ${param.min}`)
    if (param.max !== undefined) parts.push(`max: ${param.max}`)
    return parts.length > 0 ? parts.join(', ') : `Enter ${param.type}...`
  }
  return `Enter ${param.name}...`
}

/**
 * ParameterInputModal - Dynamic form for workflow parameter input
 *
 * Features:
 * - Auto-generates form fields from parameter schema
 * - Supports string, number, boolean, enum types
 * - Validates required fields
 * - Shows default values
 * - Toggle between Form and JSON views
 */

import { useState, useEffect } from 'react'
import { X, FileJson } from 'lucide-react'
import './ParameterInputModal.css'

export interface WorkflowParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'enum' | 'array' | 'object'
  required?: boolean
  description?: string
  default?: unknown
  enum?: string[]
}

interface ParameterInputModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (parameters: Record<string, unknown>) => void
  parameters: WorkflowParameter[]
  workflowName: string
}

type ViewMode = 'form' | 'json'

export function ParameterInputModal({
  open,
  onClose,
  onSubmit,
  parameters,
  workflowName
}: ParameterInputModalProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('form')
  const [formValues, setFormValues] = useState<Record<string, unknown>>({})
  const [jsonValue, setJsonValue] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  // Initialize form values with defaults
  useEffect(() => {
    if (open && parameters) {
      const initialValues: Record<string, unknown> = {}
      parameters.forEach(param => {
        if (param.default !== undefined) {
          initialValues[param.name] = param.default
        } else if (param.type === 'boolean') {
          initialValues[param.name] = false
        }
      })
      setFormValues(initialValues)
      setJsonValue(JSON.stringify(initialValues, null, 2))
      setValidationErrors({})
      setJsonError(null)
    }
  }, [open, parameters])

  // Sync JSON view with form values
  useEffect(() => {
    if (viewMode === 'form') {
      setJsonValue(JSON.stringify(formValues, null, 2))
      setJsonError(null)
    }
  }, [formValues, viewMode])

  const handleFormChange = (paramName: string, value: unknown) => {
    setFormValues(prev => ({
      ...prev,
      [paramName]: value
    }))
    // Clear validation error for this field
    if (validationErrors[paramName]) {
      setValidationErrors(prev => {
        const next = { ...prev }
        delete next[paramName]
        return next
      })
    }
  }

  const handleJsonChange = (value: string) => {
    setJsonValue(value)
    setJsonError(null)
  }

  const validateForm = (values: Record<string, unknown>): Record<string, string> => {
    const errors: Record<string, string> = {}
    parameters.forEach(param => {
      if (param.required) {
        const value = values[param.name]
        if (value === undefined || value === null || value === '') {
          errors[param.name] = 'This field is required'
        }
      }
    })
    return errors
  }

  const handleSubmit = () => {
    let finalValues: Record<string, unknown>

    if (viewMode === 'json') {
      // Parse and validate JSON
      try {
        finalValues = JSON.parse(jsonValue)
      } catch (error) {
        setJsonError('Invalid JSON: ' + (error as Error).message)
        return
      }
    } else {
      finalValues = formValues
    }

    // Validate required fields
    const errors = validateForm(finalValues)
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      if (viewMode === 'json') {
        setJsonError('Validation failed: Missing required fields')
      }
      return
    }

    onSubmit(finalValues)
    onClose()
  }

  const renderFormField = (param: WorkflowParameter) => {
    const value = formValues[param.name]
    const hasError = validationErrors[param.name]

    switch (param.type) {
      case 'string':
        if (param.enum && param.enum.length > 0) {
          // Enum dropdown
          return (
            <select
              value={value as string || ''}
              onChange={(e) => handleFormChange(param.name, e.target.value)}
              className={hasError ? 'error' : ''}
            >
              <option value="">Select...</option>
              {param.enum.map(option => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          )
        } else {
          // Text input
          return (
            <input
              type="text"
              value={value as string || ''}
              onChange={(e) => handleFormChange(param.name, e.target.value)}
              placeholder={param.default ? `Default: ${param.default}` : ''}
              className={hasError ? 'error' : ''}
            />
          )
        }

      case 'number':
        return (
          <input
            type="number"
            value={value as number || ''}
            onChange={(e) => handleFormChange(param.name, parseFloat(e.target.value))}
            placeholder={param.default ? `Default: ${param.default}` : ''}
            className={hasError ? 'error' : ''}
          />
        )

      case 'boolean':
        return (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={value as boolean || false}
              onChange={(e) => handleFormChange(param.name, e.target.checked)}
            />
            <span>{value ? 'Yes' : 'No'}</span>
          </label>
        )

      case 'array':
      case 'object':
        // For complex types, show a textarea with JSON input
        return (
          <textarea
            value={typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value)
                handleFormChange(param.name, parsed)
              } catch {
                // Allow invalid JSON while typing
                handleFormChange(param.name, e.target.value)
              }
            }}
            placeholder={param.default ? `Default: ${JSON.stringify(param.default)}` : `Enter ${param.type}`}
            className={hasError ? 'error' : ''}
            rows={4}
          />
        )

      default:
        return (
          <input
            type="text"
            value={value as string || ''}
            onChange={(e) => handleFormChange(param.name, e.target.value)}
            className={hasError ? 'error' : ''}
          />
        )
    }
  }

  if (!open) return null

  return (
    <div className="parameter-modal-overlay" onClick={onClose}>
      <div className="parameter-modal" onClick={(e) => e.stopPropagation()}>
        <div className="parameter-modal-header">
          <h3>Execute: {workflowName}</h3>
          <button className="modal-close-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {parameters.length === 0 ? (
          <div className="parameter-modal-content">
            <p className="no-parameters">This workflow has no parameters.</p>
          </div>
        ) : (
          <>
            <div className="view-mode-tabs">
              <button
                className={`view-tab ${viewMode === 'form' ? 'active' : ''}`}
                onClick={() => setViewMode('form')}
              >
                Form
              </button>
              <button
                className={`view-tab ${viewMode === 'json' ? 'active' : ''}`}
                onClick={() => setViewMode('json')}
              >
                <FileJson size={14} />
                JSON
              </button>
            </div>

            <div className="parameter-modal-content">
              {viewMode === 'form' ? (
                <div className="parameter-form">
                  {parameters.map(param => (
                    <div key={param.name} className="parameter-field">
                      <label>
                        {param.name}
                        {param.required && <span className="required-asterisk">*</span>}
                      </label>
                      {param.description && (
                        <div className="parameter-description">{param.description}</div>
                      )}
                      {renderFormField(param)}
                      {validationErrors[param.name] && (
                        <div className="parameter-error">{validationErrors[param.name]}</div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="parameter-json-view">
                  <textarea
                    value={jsonValue}
                    onChange={(e) => handleJsonChange(e.target.value)}
                    className={`json-textarea ${jsonError ? 'error' : ''}`}
                    spellCheck={false}
                  />
                  {jsonError && (
                    <div className="json-error">{jsonError}</div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        <div className="parameter-modal-footer">
          <button className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" onClick={handleSubmit}>
            Execute
          </button>
        </div>
      </div>
    </div>
  )
}

export default ParameterInputModal

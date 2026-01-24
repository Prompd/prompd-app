import { useState, useEffect } from 'react'
import { clsx } from 'clsx'
import { ChevronDown, ChevronRight, Info, Edit2 } from 'lucide-react'
import { AdaptiveParameterList } from './parameters/layouts/AdaptiveParameterList'

export interface PrompdParameter {
  name: string
  type: string
  value?: any
  required?: boolean
  description?: string
  default?: any
  enum?: string[]
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  pattern?: string
}

export interface PrompdParameterListProps {
  parameters: PrompdParameter[]
  values?: Record<string, any>
  onChange?: (name: string, value: any) => void
  onValidate?: (name: string, value: any) => boolean | string
  /** Callback when validation state changes (for adaptive layout). Returns true if all required params have values. */
  onValidationChange?: (isValid: boolean, missingRequired: string[]) => void
  readOnly?: boolean
  className?: string
  layout?: 'vertical' | 'horizontal' | 'inline' | 'expandable' | 'adaptive'
  compact?: boolean
  allowCustom?: boolean
  onAddParameter?: (param: PrompdParameter) => void
  columns?: 1 | 2 | 3
}

/**
 * Display and edit parameter list for prompd packages
 */
export function PrompdParameterList({
  parameters,
  values = {},
  onChange,
  onValidate,
  onValidationChange,
  readOnly = false,
  className,
  layout = 'vertical',
  compact = false,
  allowCustom = false,
  onAddParameter,
  columns = 2
}: PrompdParameterListProps) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [newParam, setNewParam] = useState<PrompdParameter>({
    name: '',
    type: 'string',
    required: false,
    description: '',
  })

  const handleChange = (name: string, value: any) => {
    if (readOnly || !onChange) return

    // Validate if validator provided
    if (onValidate) {
      const result = onValidate(name, value)
      if (result === false || typeof result === 'string') {
        return // Validation failed
      }
    }

    onChange(name, value)
  }

  const handleAddParameter = () => {
    if (!newParam.name || !onAddParameter) return

    onAddParameter(newParam)
    setShowAddModal(false)
    setNewParam({
      name: '',
      type: 'string',
      required: false,
      description: '',
    })
  }

  // Adaptive card mode - 2-column smart layout, always visible inputs
  if (layout === 'adaptive') {
    return <AdaptiveParameterList
      parameters={parameters}
      values={values}
      onChange={handleChange}
      onValidationChange={onValidationChange}
      readOnly={readOnly}
      className={className}
      columns={columns}
    />
  }

  // Expandable card mode - compact with expand on click
  if (layout === 'expandable') {
    return <ExpandableParameterList
      parameters={parameters}
      values={values}
      onChange={handleChange}
      readOnly={readOnly}
      className={className}
      compact={compact}
    />
  }

  // Inline chip mode (like your existing OrchestrationPage style)
  if (layout === 'inline') {
    return (
      <div className={clsx('prompd-parameter-list-inline flex items-center gap-2 flex-wrap', className)}>
        <span className="text-xs font-medium" style={{ color: 'var(--prompd-muted)' }}>Params:</span>
        {parameters.map((param: any) => (
          <div key={param.name} className="inline-flex items-center gap-1.5">
            <span className="text-xs" style={{ color: 'var(--prompd-muted)' }}>{param.name}:</span>
            {param.type === 'enum' || param.values || param.enum ? (
              <select
                value={values[param.name] || param.default || ''}
                onChange={(e) => handleChange(param.name, e.target.value)}
                disabled={readOnly}
                style={{
                  padding: '0.125rem 0.5rem',
                  fontSize: '0.75rem',
                  borderRadius: '0.25rem',
                  background: 'var(--prompd-panel)',
                  border: '1px solid var(--prompd-border)',
                  color: 'var(--prompd-text)',
                }}
              >
                {!values[param.name] && !param.default && <option value="">--</option>}
                {(param.values || param.enum || []).map((value: string) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            ) : param.type === 'boolean' ? (
              <select
                value={String(values[param.name] ?? param.default ?? 'false')}
                onChange={(e) => handleChange(param.name, e.target.value === 'true')}
                disabled={readOnly}
                style={{
                  padding: '0.125rem 0.5rem',
                  fontSize: '0.75rem',
                  borderRadius: '0.25rem',
                  background: 'var(--prompd-panel)',
                  border: '1px solid var(--prompd-border)',
                  color: 'var(--prompd-text)',
                }}
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            ) : (
              <input
                type={param.type === 'number' || param.type === 'integer' || param.type === 'float' ? 'number' : 'text'}
                value={values[param.name] ?? param.default ?? ''}
                onChange={(e) => handleChange(param.name, param.type === 'number' || param.type === 'integer' || param.type === 'float' ? parseFloat(e.target.value) : e.target.value)}
                placeholder="--"
                disabled={readOnly}
                style={{
                  width: '6rem',
                  padding: '0.125rem 0.5rem',
                  fontSize: '0.75rem',
                  borderRadius: '0.25rem',
                  background: 'var(--prompd-panel)',
                  border: '1px solid var(--prompd-border)',
                  color: 'var(--prompd-text)',
                }}
              />
            )}
            {param.required && <span className="text-xs" style={{ color: '#ef4444' }}>*</span>}
          </div>
        ))}
      </div>
    )
  }

  if (parameters.length === 0) {
    return (
      <div
        className={clsx('prompd-parameters-empty', className)}
        style={{
          padding: '1rem',
          textAlign: 'center',
          color: 'var(--prompd-muted)',
          fontSize: '0.875rem',
        }}
      >
        No parameters
      </div>
    )
  }

  return (
    <div className={clsx('prompd-parameter-list', compact && 'prompd-parameter-list-compact', className)}>
      {parameters.map((param) => {
        const currentValue = values[param.name] ?? param.default
        const hasValue = currentValue !== undefined && currentValue !== null && currentValue !== ''

        return (
          <div
            key={param.name}
            className="prompd-parameter-item"
            style={{
              padding: compact ? '0.75rem' : '1rem',
              background: 'var(--prompd-panel)',
              border: '1px solid var(--prompd-border)',
              borderRadius: '0.375rem',
              marginBottom: compact ? '0.5rem' : '0.75rem',
            }}
          >
            {/* Label */}
            <div
              className="prompd-parameter-label"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '0.5rem',
              }}
            >
              <span
                style={{
                  fontWeight: 500,
                  fontSize: compact ? '0.875rem' : '0.9375rem',
                  color: 'var(--prompd-text)',
                }}
              >
                {param.name}
              </span>

              {param.required && (
                <span
                  className="prompd-parameter-required"
                  style={{
                    fontSize: '0.75rem',
                    color: '#ef4444',
                    fontWeight: 600,
                  }}
                >
                  *
                </span>
              )}

              <span
                className="prompd-parameter-type"
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--prompd-muted)',
                  background: 'var(--prompd-border)',
                  padding: '0.125rem 0.375rem',
                  borderRadius: '0.25rem',
                }}
              >
                {param.type}
              </span>
            </div>

            {/* Description */}
            {param.description && (
              <div
                className="prompd-parameter-description"
                style={{
                  fontSize: '0.8125rem',
                  color: 'var(--prompd-muted)',
                  marginBottom: '0.5rem',
                }}
              >
                {param.description}
              </div>
            )}

            {/* Input */}
            {!readOnly && (
              <div className="prompd-parameter-input">
                {param.type === 'boolean' ? (
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={currentValue === true}
                      onChange={(e) => handleChange(param.name, e.target.checked)}
                      style={{
                        width: '1rem',
                        height: '1rem',
                        cursor: 'pointer',
                      }}
                    />
                    <span style={{ fontSize: '0.875rem', color: 'var(--prompd-text)' }}>
                      {currentValue ? 'Yes' : 'No'}
                    </span>
                  </label>
                ) : param.enum && param.enum.length > 0 ? (
                  <select
                    value={currentValue || ''}
                    onChange={(e) => handleChange(param.name, e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      fontSize: '0.875rem',
                      color: 'var(--prompd-text)',
                      background: 'var(--prompd-panel)',
                      border: '1px solid var(--prompd-border)',
                      borderRadius: '0.375rem',
                    }}
                  >
                    <option value="">Select...</option>
                    {param.enum.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : param.type === 'integer' || param.type === 'float' ? (
                  <input
                    type="number"
                    value={currentValue || ''}
                    onChange={(e) =>
                      handleChange(
                        param.name,
                        param.type === 'integer' ? parseInt(e.target.value) : parseFloat(e.target.value)
                      )
                    }
                    placeholder={param.default !== undefined ? `Default: ${param.default}` : ''}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      fontSize: '0.875rem',
                      color: 'var(--prompd-text)',
                      background: 'var(--prompd-panel)',
                      border: '1px solid var(--prompd-border)',
                      borderRadius: '0.375rem',
                    }}
                  />
                ) : (
                  <input
                    type="text"
                    value={currentValue || ''}
                    onChange={(e) => handleChange(param.name, e.target.value)}
                    placeholder={param.default !== undefined ? `Default: ${param.default}` : ''}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      fontSize: '0.875rem',
                      color: 'var(--prompd-text)',
                      background: 'var(--prompd-panel)',
                      border: '1px solid var(--prompd-border)',
                      borderRadius: '0.375rem',
                    }}
                  />
                )}
              </div>
            )}

            {/* Read-only value display */}
            {readOnly && hasValue && (
              <div
                className="prompd-parameter-value"
                style={{
                  padding: '0.5rem',
                  fontSize: '0.875rem',
                  color: 'var(--prompd-text)',
                  background: 'var(--prompd-border)',
                  borderRadius: '0.375rem',
                  fontFamily: 'monospace',
                }}
              >
                {typeof currentValue === 'object' ? JSON.stringify(currentValue) : String(currentValue)}
              </div>
            )}
          </div>
        )
      })}

      {/* Add Parameter Button */}
      {allowCustom && !readOnly && onAddParameter && (
        <button
          onClick={() => setShowAddModal(true)}
          className="prompd-add-parameter-button"
          style={{
            width: '100%',
            padding: compact ? '0.75rem' : '1rem',
            background: 'transparent',
            border: '2px dashed var(--prompd-border)',
            borderRadius: '0.375rem',
            color: 'var(--prompd-muted)',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--prompd-accent)'
            e.currentTarget.style.color = 'var(--prompd-accent)'
            e.currentTarget.style.background = 'var(--prompd-accent-bg)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--prompd-border)'
            e.currentTarget.style.color = 'var(--prompd-muted)'
            e.currentTarget.style.background = 'transparent'
          }}
        >
          <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>+</span>
          Add Parameter
        </button>
      )}

      {/* Add Parameter Modal */}
      {showAddModal && (
        <>
          <div
            className="prompd-modal-backdrop"
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              zIndex: 9998,
            }}
            onClick={() => setShowAddModal(false)}
          />
          <div
            className="prompd-modal"
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'var(--prompd-panel)',
              border: '1px solid var(--prompd-border)',
              borderRadius: '0.5rem',
              padding: '1.5rem',
              maxWidth: '500px',
              width: '90%',
              zIndex: 9999,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            }}
          >
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.125rem', fontWeight: 600, color: 'var(--prompd-text)' }}>
              Add Custom Parameter
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Name */}
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem', color: 'var(--prompd-text)' }}>
                  Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={newParam.name}
                  onChange={(e) => setNewParam({ ...newParam, name: e.target.value })}
                  placeholder="e.g., apiKey, maxRetries"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    fontSize: '0.875rem',
                    color: 'var(--prompd-text)',
                    background: 'var(--prompd-panel)',
                    border: '1px solid var(--prompd-border)',
                    borderRadius: '0.375rem',
                  }}
                />
              </div>

              {/* Type */}
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem', color: 'var(--prompd-text)' }}>
                  Type
                </label>
                <select
                  value={newParam.type}
                  onChange={(e) => setNewParam({ ...newParam, type: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    fontSize: '0.875rem',
                    color: 'var(--prompd-text)',
                    background: 'var(--prompd-panel)',
                    border: '1px solid var(--prompd-border)',
                    borderRadius: '0.375rem',
                  }}
                >
                  <option value="string">String</option>
                  <option value="integer">Integer</option>
                  <option value="float">Float</option>
                  <option value="boolean">Boolean</option>
                  <option value="array">Array</option>
                  <option value="object">Object</option>
                  <option value="file">File</option>
                </select>
              </div>

              {/* Description */}
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem', color: 'var(--prompd-text)' }}>
                  Description
                </label>
                <textarea
                  value={newParam.description || ''}
                  onChange={(e) => setNewParam({ ...newParam, description: e.target.value })}
                  placeholder="Describe what this parameter does..."
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    fontSize: '0.875rem',
                    color: 'var(--prompd-text)',
                    background: 'var(--prompd-panel)',
                    border: '1px solid var(--prompd-border)',
                    borderRadius: '0.375rem',
                    resize: 'vertical',
                  }}
                />
              </div>

              {/* Required Checkbox */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={newParam.required || false}
                    onChange={(e) => setNewParam({ ...newParam, required: e.target.checked })}
                    style={{ width: '1rem', height: '1rem', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '0.875rem', color: 'var(--prompd-text)' }}>Required parameter</span>
                </label>
              </div>

              {/* Default Value */}
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem', color: 'var(--prompd-text)' }}>
                  Default Value
                </label>
                <input
                  type="text"
                  value={newParam.default || ''}
                  onChange={(e) => setNewParam({ ...newParam, default: e.target.value })}
                  placeholder="Optional default value"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    fontSize: '0.875rem',
                    color: 'var(--prompd-text)',
                    background: 'var(--prompd-panel)',
                    border: '1px solid var(--prompd-border)',
                    borderRadius: '0.375rem',
                  }}
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowAddModal(false)}
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
                  color: 'var(--prompd-text)',
                  background: 'transparent',
                  border: '1px solid var(--prompd-border)',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddParameter}
                disabled={!newParam.name}
                style={{
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
                  color: 'white',
                  background: newParam.name ? 'var(--prompd-accent)' : 'var(--prompd-muted)',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: newParam.name ? 'pointer' : 'not-allowed',
                  fontWeight: 500,
                }}
              >
                Add Parameter
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Expandable Parameter List Component
 * Compact cards that expand to show full details and advanced inputs
 */
function ExpandableParameterList({
  parameters,
  values = {},
  onChange,
  readOnly = false,
  className,
  compact = false
}: {
  parameters: PrompdParameter[]
  values: Record<string, any>
  onChange: (name: string, value: any) => void
  readOnly?: boolean
  className?: string
  compact?: boolean
}) {
  const [expandedParams, setExpandedParams] = useState<Set<string>>(new Set())
  const [showTooltip, setShowTooltip] = useState(false)
  const [hasInteracted, setHasInteracted] = useState(false)

  // Show tooltip for first 5 seconds on first visit (if not previously dismissed)
  useEffect(() => {
    const hasSeenTooltip = localStorage.getItem('prompd_params_tooltip_seen')
    if (!hasSeenTooltip && !readOnly && parameters.length > 0) {
      setShowTooltip(true)
      const timer = setTimeout(() => {
        setShowTooltip(false)
        localStorage.setItem('prompd_params_tooltip_seen', 'true')
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [parameters.length, readOnly])

  const toggleExpand = (paramName: string) => {
    const newExpanded = new Set(expandedParams)
    if (newExpanded.has(paramName)) {
      newExpanded.delete(paramName)
    } else {
      newExpanded.add(paramName)
    }
    setExpandedParams(newExpanded)

    // Hide tooltip on first interaction
    if (!hasInteracted) {
      setHasInteracted(true)
      setShowTooltip(false)
      localStorage.setItem('prompd_params_tooltip_seen', 'true')
    }
  }

  if (parameters.length === 0) {
    return (
      <div className={clsx('text-center py-4 text-slate-500 dark:text-slate-400 text-sm', className)}>
        No parameters required
      </div>
    )
  }

  return (
    <div className="relative">
      {/* First-visit tooltip */}
      {showTooltip && (
        <div className="absolute -top-12 left-0 right-0 z-50 flex justify-center pointer-events-none animate-fade-in">
          <div className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
            <Info className="w-4 h-4" />
            <span>Click parameter cards to edit values</span>
          </div>
        </div>
      )}

      <div className={clsx(
        'grid gap-2',
        compact ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4' : 'grid-cols-1 md:grid-cols-2',
        className
      )}>
        {parameters.map((param) => {
          const isExpanded = expandedParams.has(param.name)
          const currentValue = values[param.name] ?? param.default
          const isArray = param.type === 'array' || param.type === 'string[]' || param.type?.includes('[]')

          return (
            <ExpandableParameterCard
              key={param.name}
              param={param}
              value={currentValue}
              isExpanded={isExpanded}
              onToggle={() => toggleExpand(param.name)}
              onChange={onChange}
              readOnly={readOnly}
              isArray={isArray}
              compact={compact}
            />
          )
        })}
      </div>
    </div>
  )
}

/**
 * Individual Expandable Parameter Card
 */
function ExpandableParameterCard({
  param,
  value,
  isExpanded,
  onToggle,
  onChange,
  readOnly,
  isArray,
  compact = false
}: {
  param: PrompdParameter
  value: any
  isExpanded: boolean
  onToggle: () => void
  onChange: (name: string, value: any) => void
  readOnly: boolean
  isArray: boolean
  compact?: boolean
}) {
  const [isHovered, setIsHovered] = useState(false)
  const hasValue = value !== undefined && value !== null && value !== ''

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={clsx(
        'border rounded-lg relative group',
        'transition-all duration-200 ease-out',
        isExpanded
          ? 'border-blue-500 dark:border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 shadow-lg col-span-full z-50 scale-[1.02]'
          : hasValue
          ? 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md'
          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-sm',
        !readOnly && 'cursor-pointer hover:-translate-y-0.5'
      )}
    >
      {/* Compact Header - Always Visible */}
      <div
        onClick={readOnly ? undefined : onToggle}
        className={clsx(
          'flex items-center justify-between transition-colors',
          !readOnly && 'cursor-pointer',
          compact ? 'p-1.5' : 'p-2'
        )}
      >
        <div className="flex items-center gap-1 flex-1 min-w-0">
          {/* Expand Icon */}
          {!compact && (isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400 flex-shrink-0" />
          ))}

          {/* Parameter Name */}
          <span className={clsx(
            'font-medium text-slate-800 dark:text-slate-200 truncate',
            compact ? 'text-[10px]' : 'text-xs'
          )}>
            {param.name}
          </span>

          {/* Required Badge */}
          {param.required && (
            <span className={clsx('font-semibold text-red-500 flex-shrink-0', compact ? 'text-[10px]' : 'text-xs')}>*</span>
          )}

          {/* Type Badge - only show if not compact or has no value */}
          {(!compact || !hasValue) && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 flex-shrink-0">
              {param.type}
            </span>
          )}
        </div>

        {/* Value Preview (when collapsed) or Empty State Hint */}
        {!isExpanded && (
          <div className="flex items-center gap-1.5 flex-shrink-0 min-w-0">
            {hasValue ? (
              <>
                <span className={clsx(
                  'text-slate-600 dark:text-slate-400 truncate',
                  compact ? 'text-[10px] max-w-[80px]' : 'text-xs max-w-[100px]'
                )}>
                  {isArray && Array.isArray(value)
                    ? `${value.length} item${value.length !== 1 ? 's' : ''}`
                    : String(value)
                  }
                </span>
                {/* Edit icon on hover */}
                {!readOnly && isHovered && !compact && (
                  <Edit2 className="w-3 h-3 text-blue-500 dark:text-blue-400 flex-shrink-0 animate-fade-in" />
                )}
              </>
            ) : (
              /* Empty state hint */
              !readOnly && (
                <span className={clsx(
                  'text-slate-400 dark:text-slate-500 italic flex items-center gap-1',
                  compact ? 'text-[9px]' : 'text-xs'
                )}>
                  {isHovered ? (
                    <>
                      <span>Click to configure</span>
                      <ChevronRight className="w-3 h-3" />
                    </>
                  ) : (
                    <span>Not set</span>
                  )}
                </span>
              )
            )}
          </div>
        )}
      </div>

      {/* Expanded Content with smooth slide-down animation */}
      {isExpanded && (
        <div
          className="px-3 pb-3 space-y-2 border-t border-slate-200 dark:border-slate-700 pt-2 animate-slide-down"
          style={{
            animation: 'slideDown 0.2s ease-out'
          }}
        >
          {/* Description */}
          {param.description && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {param.description}
            </p>
          )}

          {/* Input Field */}
          {!readOnly && (
            <div>
              {isArray ? (
                <ArrayInput
                  value={value}
                  onChange={(newValue) => onChange(param.name, newValue)}
                  placeholder={param.default ? `Default: ${JSON.stringify(param.default)}` : 'Add items...'}
                />
              ) : param.type === 'boolean' ? (
                <BooleanInput
                  value={value}
                  onChange={(newValue) => onChange(param.name, newValue)}
                />
              ) : param.enum && param.enum.length > 0 ? (
                <EnumInput
                  value={value}
                  options={param.enum}
                  onChange={(newValue) => onChange(param.name, newValue)}
                />
              ) : param.type === 'integer' || param.type === 'float' ? (
                <NumberInput
                  value={value}
                  type={param.type}
                  default={param.default}
                  onChange={(newValue) => onChange(param.name, newValue)}
                />
              ) : param.type === 'object' ? (
                <ObjectInput
                  value={value}
                  default={param.default}
                  onChange={(newValue) => onChange(param.name, newValue)}
                />
              ) : param.type === 'file' ? (
                <FileInput
                  value={value}
                  onChange={(newValue) => onChange(param.name, newValue)}
                />
              ) : (
                <TextInput
                  value={value}
                  default={param.default}
                  onChange={(newValue) => onChange(param.name, newValue)}
                />
              )}
            </div>
          )}

          {/* Read-only Display */}
          {readOnly && hasValue && (
            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 font-mono text-sm text-slate-700 dark:text-slate-300">
              {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
            </div>
          )}

          {/* Metadata Row */}
          <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
            {param.default !== undefined && (
              <span>Default: <code className="px-1 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">{String(param.default)}</code></span>
            )}
            {param.required && (
              <span className="text-red-500 font-medium">Required</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Array Input - Textarea where each line is an array item
 */
function ArrayInput({ value, onChange, placeholder }: { value: any, onChange: (value: string[]) => void, placeholder?: string }) {
  const items: string[] = Array.isArray(value) ? value : value ? [String(value)] : []
  const textValue = items.join('\n')

  const handleChange = (text: string) => {
    // Split by newlines, trim each line, filter out empty lines
    const newItems = text.split('\n').map(line => line.trim()).filter(Boolean)
    onChange(newItems)
  }

  // Calculate row count based on content
  const lineCount = textValue.split('\n').length
  const rows = Math.min(Math.max(3, lineCount), 15)

  return (
    <div className="space-y-2">
      <textarea
        value={textValue}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder || 'Enter one item per line...'}
        rows={rows}
        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-mono text-sm resize-y"
      />
      <p className="text-xs text-slate-500 dark:text-slate-400">
        One item per line • {items.length} item{items.length !== 1 ? 's' : ''}
      </p>
    </div>
  )
}

/**
 * Boolean Input
 */
function BooleanInput({ value, onChange }: { value: any, onChange: (value: boolean) => void }) {
  return (
    <div className="flex gap-2">
      <button
        onClick={() => onChange(true)}
        className={clsx(
          'flex-1 px-4 py-2 rounded-lg font-medium transition-all',
          value === true
            ? 'bg-green-500 text-white shadow-md'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
        )}
      >
        Yes
      </button>
      <button
        onClick={() => onChange(false)}
        className={clsx(
          'flex-1 px-4 py-2 rounded-lg font-medium transition-all',
          value === false
            ? 'bg-red-500 text-white shadow-md'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
        )}
      >
        No
      </button>
    </div>
  )
}

/**
 * Enum/Select Input
 */
function EnumInput({ value, options, onChange }: { value: any, options: string[], onChange: (value: string) => void }) {
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
    >
      <option value="">Select an option...</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  )
}

/**
 * Number Input
 */
function NumberInput({ value, type, default: defaultValue, onChange }: { value: any, type: string, default?: any, onChange: (value: number) => void }) {
  return (
    <input
      type="number"
      value={value ?? ''}
      onChange={(e) => onChange(type === 'integer' ? parseInt(e.target.value) : parseFloat(e.target.value))}
      placeholder={defaultValue !== undefined ? `Default: ${defaultValue}` : ''}
      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
    />
  )
}

/**
 * Text Input
 */
function TextInput({ value, default: defaultValue, onChange }: { value: any, default?: any, onChange: (value: string) => void }) {
  const stringValue = value ?? ''
  const hasNewlines = typeof stringValue === 'string' && stringValue.includes('\n')

  return hasNewlines || (stringValue && stringValue.length > 100) ? (
    <textarea
      value={stringValue}
      onChange={(e) => onChange(e.target.value)}
      placeholder={defaultValue !== undefined ? `Default: ${defaultValue}` : 'Enter text (supports multiple lines)'}
      rows={Math.min(Math.max(3, (stringValue.split('\n').length)), 15)}
      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-mono text-sm resize-y"
    />
  ) : (
    <input
      type="text"
      value={stringValue}
      onChange={(e) => onChange(e.target.value)}
      placeholder={defaultValue !== undefined ? `Default: ${defaultValue}` : ''}
      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
    />
  )
}

/**
 * Object Input - JSON editor with tree-view toggle
 * Uses a textarea for JSON editing with validation feedback
 */
function ObjectInput({ value, default: defaultValue, onChange }: { value: any, default?: any, onChange: (value: Record<string, unknown>) => void }) {
  const [isEditing, setIsEditing] = useState(false)
  const [textValue, setTextValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Initialize text value from object
  useEffect(() => {
    if (value && typeof value === 'object') {
      setTextValue(JSON.stringify(value, null, 2))
    } else if (defaultValue && typeof defaultValue === 'object') {
      setTextValue(JSON.stringify(defaultValue, null, 2))
    } else {
      setTextValue('{\n  \n}')
    }
  }, [])

  const handleTextChange = (newText: string) => {
    setTextValue(newText)
    try {
      const parsed = JSON.parse(newText)
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        setError(null)
        onChange(parsed)
      } else {
        setError('Must be a JSON object (not array or primitive)')
      }
    } catch (e) {
      setError('Invalid JSON syntax')
    }
  }

  const formatJson = () => {
    try {
      const parsed = JSON.parse(textValue)
      setTextValue(JSON.stringify(parsed, null, 2))
      setError(null)
    } catch {
      // Keep current text if invalid
    }
  }

  // Display as key-value pairs when not editing
  const renderTreeView = () => {
    if (!value || typeof value !== 'object') {
      return (
        <div className="text-sm text-slate-500 dark:text-slate-400 italic p-2">
          No value set
        </div>
      )
    }

    const entries = Object.entries(value)
    if (entries.length === 0) {
      return (
        <div className="text-sm text-slate-500 dark:text-slate-400 italic p-2">
          Empty object
        </div>
      )
    }

    return (
      <div className="space-y-1 p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
        {entries.map(([key, val]) => (
          <div key={key} className="flex items-start gap-2 text-sm">
            <span className="font-medium text-blue-600 dark:text-blue-400 min-w-[80px] truncate">{key}:</span>
            <span className="text-slate-700 dark:text-slate-300 font-mono text-xs break-all">
              {typeof val === 'object' ? JSON.stringify(val) : String(val)}
            </span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Toggle between tree view and editor */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIsEditing(!isEditing)}
          className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 font-medium flex items-center gap-1"
        >
          {isEditing ? (
            <>
              <ChevronDown className="w-3 h-3" />
              Show preview
            </>
          ) : (
            <>
              <Edit2 className="w-3 h-3" />
              Edit JSON
            </>
          )}
        </button>
        {isEditing && (
          <button
            onClick={formatJson}
            className="text-xs text-slate-500 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-300"
          >
            Format
          </button>
        )}
      </div>

      {isEditing ? (
        <>
          <textarea
            value={textValue}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder='{\n  "key": "value"\n}'
            rows={Math.min(Math.max(5, textValue.split('\n').length + 1), 20)}
            className={clsx(
              'w-full px-3 py-2 border rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:ring-2 focus:border-transparent outline-none font-mono text-sm resize-y',
              error
                ? 'border-red-400 dark:border-red-500 focus:ring-red-500'
                : 'border-slate-300 dark:border-slate-600 focus:ring-blue-500'
            )}
          />
          {error && (
            <p className="text-xs text-red-500 dark:text-red-400 flex items-center gap-1">
              <span>!</span> {error}
            </p>
          )}
        </>
      ) : (
        <div onClick={() => setIsEditing(true)} className="cursor-pointer hover:opacity-80 transition-opacity">
          {renderTreeView()}
        </div>
      )}
    </div>
  )
}

/**
 * File Input - Drag & drop file picker
 * Supports common file types that can be extracted by the compiler:
 * Excel, Word, PDF, PowerPoint, Images, CSV, JSON, YAML, Text
 */
function FileInput({
  value,
  accept,
  onChange
}: {
  value: any
  accept?: string
  onChange: (value: { path?: string; name: string; content: string; type: string; size: number }) => void
}) {
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Supported file types for extraction
  const SUPPORTED_EXTENSIONS = [
    // Documents
    '.pdf', '.doc', '.docx', '.txt', '.md', '.rtf',
    // Spreadsheets
    '.xlsx', '.xls', '.csv', '.tsv',
    // Presentations
    '.pptx', '.ppt',
    // Data formats
    '.json', '.yaml', '.yml', '.xml',
    // Images (for vision models)
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
    // Code files
    '.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.rs', '.java', '.cs', '.cpp', '.c', '.h'
  ]

  const defaultAccept = SUPPORTED_EXTENSIONS.join(',')

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      await processFile(files[0])
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      await processFile(files[0])
    }
  }

  const processFile = async (file: File) => {
    setError(null)

    // Check file extension
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      setError(`Unsupported file type: ${ext}. Supported: ${SUPPORTED_EXTENSIONS.slice(0, 5).join(', ')}...`)
      return
    }

    // Check file size (10MB limit)
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      setError('File too large. Maximum size is 10MB.')
      return
    }

    try {
      // Read file content based on type
      let content: string

      if (file.type.startsWith('image/')) {
        // Convert images to base64
        const buffer = await file.arrayBuffer()
        const base64 = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        )
        content = `data:${file.type};base64,${base64}`
      } else {
        // Read as text for text-based files
        content = await file.text()
      }

      onChange({
        name: file.name,
        content,
        type: file.type || 'application/octet-stream',
        size: file.size
      })
    } catch (err) {
      setError('Failed to read file')
    }
  }

  const clearFile = () => {
    onChange({ name: '', content: '', type: '', size: 0 })
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // Get file icon based on extension
  const getFileIcon = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase()
    const icons: Record<string, string> = {
      pdf: 'PDF',
      doc: 'DOC',
      docx: 'DOC',
      xlsx: 'XLS',
      xls: 'XLS',
      csv: 'CSV',
      pptx: 'PPT',
      ppt: 'PPT',
      json: 'JSON',
      yaml: 'YAML',
      yml: 'YAML',
      png: 'IMG',
      jpg: 'IMG',
      jpeg: 'IMG',
      gif: 'IMG',
      webp: 'IMG',
      svg: 'SVG',
      txt: 'TXT',
      md: 'MD'
    }
    return icons[ext || ''] || 'FILE'
  }

  const hasFile = value && value.name

  return (
    <div className="space-y-2">
      {hasFile ? (
        /* File selected - show preview */
        <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="flex-shrink-0 w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
              {getFileIcon(value.name)}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
              {value.name}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {formatFileSize(value.size)}
            </p>
          </div>
          <button
            onClick={clearFile}
            className="flex-shrink-0 p-1.5 text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 transition-colors"
            title="Remove file"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        /* No file - show drop zone */
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => document.getElementById('file-input-hidden')?.click()}
          className={clsx(
            'relative border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all',
            isDragging
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
              : 'border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-slate-50 dark:hover:bg-slate-800/50'
          )}
        >
          <input
            id="file-input-hidden"
            type="file"
            accept={accept || defaultAccept}
            onChange={handleFileSelect}
            className="hidden"
          />
          <div className="space-y-2">
            <div className="mx-auto w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                <span className="text-blue-500 dark:text-blue-400 font-medium">Click to upload</span> or drag and drop
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                PDF, Word, Excel, Images, CSV, JSON, and more
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-500 dark:text-red-400 flex items-center gap-1">
          <span>!</span> {error}
        </p>
      )}
    </div>
  )
}

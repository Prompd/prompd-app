/**
 * Adaptive Parameter List Layout
 *
 * Smart 2-column layout that adapts based on parameter type:
 * - Simple types (string, number, boolean, enum): Half-width cards
 * - Complex types (array, object, text): Full-width cards
 *
 * All inputs are always visible - no expand/collapse needed.
 */

import { useEffect, useMemo, useRef } from 'react'
import { clsx } from 'clsx'
import type { ParameterListProps, PrompdParameter } from '../utils/types'
import { isFullWidthType, isArrayType, isNumericType, isBooleanType, isEnumType, isFileType, isJsonType, isBase64Type, isJwtType, isEmptyValue } from '../utils/typeUtils'
import { ParameterCard } from '../cards/ParameterCard'
import { StringInput } from '../inputs/StringInput'
import { NumberInput } from '../inputs/NumberInput'
import { BooleanInput } from '../inputs/BooleanInput'
import { EnumInput } from '../inputs/EnumInput'
import { TextInput } from '../inputs/TextInput'
import { ObjectInput } from '../inputs/ObjectInput'
import { ArrayPillInput } from '../inputs/ArrayPillInput'
import { FileInput, type FileValue } from '../inputs/FileInput'
import { JsonInput } from '../inputs/JsonInput'
import { Base64Input } from '../inputs/Base64Input'
import { JwtInput } from '../inputs/JwtInput'

interface AdaptiveParameterListProps extends ParameterListProps {
  columns?: 1 | 2 | 3
  /** Callback when validation state changes. Returns true if all required params have values. */
  onValidationChange?: (isValid: boolean, missingRequired: string[]) => void
}

/**
 * Check if all required parameters have values (considering defaults)
 */
export function validateRequiredParameters(
  parameters: PrompdParameter[],
  values: Record<string, unknown>
): { isValid: boolean; missingRequired: string[] } {
  const missingRequired: string[] = []

  for (const param of parameters) {
    if (param.required) {
      const effectiveValue = values[param.name] ?? param.default
      if (isEmptyValue(effectiveValue)) {
        missingRequired.push(param.name)
      }
    }
  }

  return {
    isValid: missingRequired.length === 0,
    missingRequired,
  }
}

export function AdaptiveParameterList({
  parameters,
  values = {},
  onChange,
  readOnly = false,
  className,
  columns = 2,
  onValidationChange,
}: AdaptiveParameterListProps) {
  // Compute validation state with stable array reference
  const validationState = useMemo(
    () => validateRequiredParameters(parameters, values),
    [parameters, values]
  )

  // Create a stable string key for comparison to avoid infinite loops
  const missingKey = validationState.missingRequired.join(',')

  // Track previous validation state to avoid unnecessary callbacks
  const prevValidationRef = useRef<{ isValid: boolean; missingKey: string } | null>(null)

  // Notify parent of validation changes only when values actually change
  useEffect(() => {
    if (!onValidationChange) return

    const prev = prevValidationRef.current
    if (!prev || prev.isValid !== validationState.isValid || prev.missingKey !== missingKey) {
      prevValidationRef.current = { isValid: validationState.isValid, missingKey }
      onValidationChange(validationState.isValid, validationState.missingRequired)
    }
  }, [validationState.isValid, missingKey, validationState.missingRequired, onValidationChange])

  if (parameters.length === 0) {
    return (
      <div className={clsx(
        'text-center py-6 text-slate-500 dark:text-slate-400 text-sm',
        className
      )}>
        No parameters defined
      </div>
    )
  }

  const handleChange = (name: string, value: unknown) => {
    if (readOnly || !onChange) return
    onChange(name, value)
  }

  // Check if a string value needs full-width (multiline or long content)
  const needsFullWidthForValue = (param: PrompdParameter, value: unknown): boolean => {
    // Already a full-width type
    if (isFullWidthType(param.type)) return true

    // Check if string value has newlines or is long (matches StringInput logic)
    const effectiveValue = value ?? param.default
    if (typeof effectiveValue === 'string') {
      return effectiveValue.includes('\n') || effectiveValue.length > 100
    }
    return false
  }

  // Render all parameters in original order within a single grid
  // Full-width items span all columns using col-span-full
  return (
    <div className={clsx('prompd-adaptive-parameter-list', className)}>
      <div className={clsx(
        'grid gap-3',
        columns === 1 && 'grid-cols-1',
        columns === 2 && 'grid-cols-1 md:grid-cols-2',
        columns === 3 && 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
      )}>
        {parameters.map((param) => {
          const isFullWidth = needsFullWidthForValue(param, values[param.name])
          return (
            <div
              key={param.name}
              className={clsx(
                isFullWidth && 'col-span-full',
                'transition-all duration-200 ease-out'
              )}
            >
              <ParameterCardWithInput
                param={param}
                value={values[param.name]}
                onChange={handleChange}
                readOnly={readOnly}
                fullWidth={isFullWidth}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Helper component that renders the appropriate input for a parameter type
 */
function ParameterCardWithInput({
  param,
  value,
  onChange,
  readOnly,
  fullWidth = false,
}: {
  param: PrompdParameter
  value: unknown
  onChange: (name: string, value: unknown) => void
  readOnly: boolean
  fullWidth?: boolean
}) {
  // Use effective value: user value OR default
  const effectiveValue = value ?? param.default

  const handleInputChange = (newValue: unknown) => {
    onChange(param.name, newValue)
  }

  const renderInput = () => {
    // If readonly, just show the effective value
    if (readOnly) {
      return (
        <div className="text-sm text-slate-600 dark:text-slate-300 py-1">
          {formatDisplayValue(effectiveValue, param.type)}
        </div>
      )
    }

    // Array types - check BEFORE enum to prevent array values hitting <select>
    if (isArrayType(param.type)) {
      // Handle default array values - stringify any object items
      const arrayValue = Array.isArray(effectiveValue)
        ? effectiveValue.map(item => typeof item === 'object' && item !== null ? JSON.stringify(item) : String(item))
        : effectiveValue
          ? [typeof effectiveValue === 'object' ? JSON.stringify(effectiveValue) : String(effectiveValue)]
          : []
      return (
        <ArrayPillInput
          value={arrayValue as string[]}
          onChange={handleInputChange}
          placeholder={param.description || 'Add items...'}
        />
      )
    }

    // Enum type (dropdown) - only for non-array params
    if (isEnumType(param)) {
      return (
        <EnumInput
          value={(effectiveValue as string) ?? ''}
          onChange={handleInputChange}
          options={param.enum || []}
        />
      )
    }

    // Boolean type
    if (isBooleanType(param.type)) {
      return (
        <BooleanInput
          value={effectiveValue as boolean}
          onChange={handleInputChange}
        />
      )
    }

    // Numeric types
    if (isNumericType(param.type)) {
      return (
        <NumberInput
          value={effectiveValue as number}
          onChange={handleInputChange}
          type={param.type as 'number' | 'integer' | 'float'}
          min={param.min}
          max={param.max}
          placeholder={param.description}
        />
      )
    }

    // Object type
    if (param.type?.toLowerCase() === 'object') {
      return (
        <ObjectInput
          value={effectiveValue as Record<string, unknown>}
          onChange={handleInputChange}
          defaultValue={param.default as Record<string, unknown>}
        />
      )
    }

    // JSON type - accepts any valid JSON (objects, arrays, primitives)
    if (isJsonType(param.type)) {
      return (
        <JsonInput
          value={effectiveValue as Record<string, unknown> | unknown[] | string | number | boolean | null | undefined}
          onChange={handleInputChange}
          defaultValue={param.default as Record<string, unknown> | unknown[] | string | number | boolean | null | undefined}
          placeholder={param.description}
        />
      )
    }

    // File type - drag & drop file picker
    if (isFileType(param.type)) {
      return (
        <FileInput
          value={effectiveValue as FileValue | undefined}
          onChange={handleInputChange}
        />
      )
    }

    // Base64 type - base64-encoded content with preview
    if (isBase64Type(param.type)) {
      return (
        <Base64Input
          value={(effectiveValue as string) ?? undefined}
          onChange={handleInputChange}
        />
      )
    }

    // JWT type - token with decoded header/payload display
    if (isJwtType(param.type)) {
      return (
        <JwtInput
          value={(effectiveValue as string) ?? undefined}
          onChange={handleInputChange}
        />
      )
    }

    // Text/textarea type
    if (param.type?.toLowerCase() === 'text' || param.type?.toLowerCase() === 'textarea') {
      return (
        <TextInput
          value={(effectiveValue as string) ?? ''}
          onChange={handleInputChange}
          placeholder={param.description || 'Enter text...'}
        />
      )
    }

    // Default: string input
    return (
      <StringInput
        value={(effectiveValue as string) ?? ''}
        onChange={handleInputChange}
        placeholder={param.description}
      />
    )
  }

  return (
    <ParameterCard
      param={param}
      value={effectiveValue}
      fullWidth={fullWidth}
    >
      {renderInput()}
    </ParameterCard>
  )
}

/**
 * Format a value for readonly display
 */
function formatDisplayValue(value: unknown, type: string): string {
  if (value === undefined || value === null) {
    return '(not set)'
  }

  // File type - show filename
  if (isFileType(type) && typeof value === 'object' && value !== null) {
    const fileVal = value as Record<string, unknown>
    return typeof fileVal.name === 'string' ? fileVal.name : '[file]'
  }

  // Base64 - show size info
  if (isBase64Type(type) && typeof value === 'string') {
    const len = value.length
    if (len < 1024) return `${len} chars encoded`
    return `${(len / 1024).toFixed(1)} KB encoded`
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '(empty)'
    // Stringify each item to avoid [object Object]
    return value.map(item =>
      typeof item === 'object' && item !== null ? JSON.stringify(item) : String(item)
    ).join(', ')
  }

  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2)
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  return String(value)
}

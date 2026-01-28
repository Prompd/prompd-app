/**
 * Parameter type definitions and utilities
 * Central location for all parameter-related types
 */

export interface PrompdParameter {
  name: string
  type: string
  value?: unknown
  required?: boolean
  description?: string
  default?: unknown
  enum?: string[]
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  pattern?: string
}

export interface ParameterInputProps<T = unknown> {
  value: T
  onChange: (value: T) => void
  placeholder?: string
  disabled?: boolean
  error?: string
  className?: string
}

export interface ParameterCardProps {
  param: PrompdParameter
  value: unknown
  onChange: (name: string, value: unknown) => void
  readOnly?: boolean
  compact?: boolean
  className?: string
}

export interface ParameterListProps {
  parameters: PrompdParameter[]
  values?: Record<string, unknown>
  onChange?: (name: string, value: unknown) => void
  onValidate?: (name: string, value: unknown) => boolean | string
  readOnly?: boolean
  className?: string
  compact?: boolean
  allowCustom?: boolean
  onAddParameter?: (param: PrompdParameter) => void
}

/**
 * Parameter type classifications
 */
export const SIMPLE_TYPES = ['string', 'number', 'integer', 'float', 'boolean'] as const
export const COMPLEX_TYPES = ['array', 'string[]', 'object', 'text'] as const
export const ENUM_INDICATOR = 'enum' as const

export type SimpleType = typeof SIMPLE_TYPES[number]
export type ComplexType = typeof COMPLEX_TYPES[number]

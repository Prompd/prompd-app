/**
 * Type classification utilities for parameter handling
 */

import { SIMPLE_TYPES, type PrompdParameter } from './types'

/**
 * Check if a parameter type is an array type
 */
export function isArrayType(type: string): boolean {
  if (!type) return false
  const normalized = type.toLowerCase().trim()
  return normalized === 'array' ||
         normalized === 'string[]' ||
         normalized.endsWith('[]')
}

/**
 * Check if a parameter type is a file type
 */
export function isFileType(type: string): boolean {
  if (!type) return false
  return type.toLowerCase().trim() === 'file'
}

/**
 * Check if a parameter type is a JSON type
 */
export function isJsonType(type: string): boolean {
  if (!type) return false
  return type.toLowerCase().trim() === 'json'
}

/**
 * Check if a parameter type is a base64 type
 */
export function isBase64Type(type: string): boolean {
  if (!type) return false
  return type.toLowerCase().trim() === 'base64'
}

/**
 * Check if a parameter type is a JWT type
 */
export function isJwtType(type: string): boolean {
  if (!type) return false
  return type.toLowerCase().trim() === 'jwt'
}

/**
 * Check if a parameter type requires full-width display
 * Arrays, objects, long text, file, json, base64, and jwt need more horizontal space
 */
export function isFullWidthType(type: string): boolean {
  if (!type) return false
  const normalized = type.toLowerCase().trim()
  return isArrayType(normalized) ||
         normalized === 'object' ||
         normalized === 'text' ||
         normalized === 'textarea' ||
         normalized === 'file' ||
         normalized === 'json' ||
         normalized === 'base64' ||
         normalized === 'jwt'
}

/**
 * Check if a parameter type is a simple inline type
 * These can be displayed in a compact 2-column layout
 */
export function isSimpleType(type: string): boolean {
  if (!type) return true // Default to simple
  const normalized = type.toLowerCase().trim()
  return SIMPLE_TYPES.includes(normalized as typeof SIMPLE_TYPES[number])
}

/**
 * Check if a parameter has enum options
 */
export function isEnumType(param: PrompdParameter): boolean {
  return Boolean(param.enum && param.enum.length > 0)
}

/**
 * Check if a parameter type is numeric
 */
export function isNumericType(type: string): boolean {
  if (!type) return false
  const normalized = type.toLowerCase().trim()
  return normalized === 'number' ||
         normalized === 'integer' ||
         normalized === 'float'
}

/**
 * Check if a parameter type is boolean
 */
export function isBooleanType(type: string): boolean {
  if (!type) return false
  return type.toLowerCase().trim() === 'boolean'
}

/**
 * Get the appropriate HTML input type for a parameter
 */
export function getInputType(type: string): string {
  if (isNumericType(type)) return 'number'
  if (isBooleanType(type)) return 'checkbox'
  return 'text'
}

/**
 * Parse a numeric value based on type
 */
export function parseNumericValue(value: string, type: string): number {
  if (type.toLowerCase() === 'integer') {
    return parseInt(value, 10)
  }
  return parseFloat(value)
}

/**
 * Check if a value is considered "empty" for display purposes
 */
export function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (value === '') return true
  if (Array.isArray(value) && value.length === 0) return true
  if (typeof value === 'object' && Object.keys(value).length === 0) return true
  return false
}

/**
 * Format a value for display preview
 */
export function formatValuePreview(value: unknown, type: string, maxLength = 30): string {
  if (isEmptyValue(value)) return ''

  if (isArrayType(type) && Array.isArray(value)) {
    return `${value.length} item${value.length !== 1 ? 's' : ''}`
  }

  // File type - show filename
  if (isFileType(type) && typeof value === 'object' && value !== null) {
    const fileVal = value as Record<string, unknown>
    return typeof fileVal.name === 'string' ? fileVal.name : '[file]'
  }

  // Base64 - show encoded size
  if (isBase64Type(type) && typeof value === 'string') {
    const len = value.length
    if (len < 1024) return `${len} chars`
    return `${(len / 1024).toFixed(1)} KB encoded`
  }

  // JSON - show type indicator
  if (isJsonType(type)) {
    if (Array.isArray(value)) return `array[${value.length}]`
    if (typeof value === 'object' && value !== null) {
      return `{${Object.keys(value).length} keys}`
    }
  }

  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value).substring(0, maxLength)
  }

  const str = String(value)
  if (str.length > maxLength) {
    return str.substring(0, maxLength - 3) + '...'
  }
  return str
}

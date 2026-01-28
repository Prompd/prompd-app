/**
 * Input validation and sanitization utilities
 * Security-focused input handling
 */

import type { PrompdParameter } from './types'

/**
 * Maximum allowed lengths for different input types
 * Prevents excessive memory usage and potential DoS
 */
export const MAX_LENGTHS: {
  string: number
  text: number
  arrayItem: number
  arrayItems: number
  objectKeys: number
  parameterName: number
} = {
  string: 10000,
  text: 100000,
  arrayItem: 1000,
  arrayItems: 1000,
  objectKeys: 100,
  parameterName: 100,
}

/**
 * Sanitize a string input
 * - Trims whitespace
 * - Enforces max length
 * - Does NOT escape HTML (React handles this automatically)
 */
export function sanitizeString(value: string, maxLength = MAX_LENGTHS.string): string {
  if (typeof value !== 'string') {
    return String(value ?? '')
  }
  return value.trim().slice(0, maxLength)
}

/**
 * Sanitize an array of strings
 * - Trims each item
 * - Filters empty items
 * - Enforces max items and max item length
 */
export function sanitizeStringArray(
  items: string[],
  maxItems = MAX_LENGTHS.arrayItems,
  maxItemLength = MAX_LENGTHS.arrayItem
): string[] {
  if (!Array.isArray(items)) {
    return []
  }

  return items
    .slice(0, maxItems)
    .map(item => sanitizeString(String(item), maxItemLength))
    .filter(item => item.length > 0)
}

/**
 * Validate a parameter value against its definition
 * Returns true if valid, or an error message string if invalid
 */
export function validateParameterValue(
  param: PrompdParameter,
  value: unknown
): true | string {
  // Check required
  if (param.required && isEmptyValue(value)) {
    return `${param.name} is required`
  }

  // Skip further validation if empty and not required
  if (isEmptyValue(value)) {
    return true
  }

  // Type-specific validation
  const type = param.type?.toLowerCase() ?? 'string'

  // String length validation
  if (type === 'string' || type === 'text') {
    const strValue = String(value)
    if (param.minLength && strValue.length < param.minLength) {
      return `${param.name} must be at least ${param.minLength} characters`
    }
    if (param.maxLength && strValue.length > param.maxLength) {
      return `${param.name} must be at most ${param.maxLength} characters`
    }
  }

  // Numeric range validation
  if (type === 'number' || type === 'integer' || type === 'float') {
    const numValue = Number(value)
    if (isNaN(numValue)) {
      return `${param.name} must be a valid number`
    }
    if (param.min !== undefined && numValue < param.min) {
      return `${param.name} must be at least ${param.min}`
    }
    if (param.max !== undefined && numValue > param.max) {
      return `${param.name} must be at most ${param.max}`
    }
    if (type === 'integer' && !Number.isInteger(numValue)) {
      return `${param.name} must be a whole number`
    }
  }

  // Enum validation
  if (param.enum && param.enum.length > 0) {
    if (!param.enum.includes(String(value))) {
      return `${param.name} must be one of: ${param.enum.join(', ')}`
    }
  }

  // Pattern validation (regex)
  if (param.pattern) {
    try {
      const regex = new RegExp(param.pattern)
      if (!regex.test(String(value))) {
        return `${param.name} format is invalid`
      }
    } catch {
      // Invalid regex pattern in schema - skip validation
    }
  }

  return true
}

/**
 * Check if a value is considered "empty"
 */
function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (value === '') return true
  if (Array.isArray(value) && value.length === 0) return true
  return false
}

/**
 * Validate a parameter name
 * - Must be alphanumeric with underscores
 * - Cannot start with a number
 */
export function validateParameterName(name: string): true | string {
  if (!name || name.trim().length === 0) {
    return 'Parameter name is required'
  }

  const trimmed = name.trim()

  if (trimmed.length > MAX_LENGTHS.parameterName) {
    return `Parameter name must be at most ${MAX_LENGTHS.parameterName} characters`
  }

  // Allow alphanumeric, underscores, and hyphens
  // Must start with a letter or underscore
  const validPattern = /^[a-zA-Z_][a-zA-Z0-9_-]*$/
  if (!validPattern.test(trimmed)) {
    return 'Parameter name must start with a letter or underscore, and contain only letters, numbers, underscores, or hyphens'
  }

  return true
}

/**
 * Parse array input from various formats
 * Supports: comma-separated, newline-separated, JSON array
 */
export function parseArrayInput(input: string): string[] {
  const trimmed = input.trim()

  // Try JSON array first
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return sanitizeStringArray(parsed.map(String))
      }
    } catch {
      // Not valid JSON, continue with other parsing
    }
  }

  // Split by newlines or commas
  const delimiter = trimmed.includes('\n') ? '\n' : ','
  const items = trimmed.split(delimiter)

  return sanitizeStringArray(items)
}

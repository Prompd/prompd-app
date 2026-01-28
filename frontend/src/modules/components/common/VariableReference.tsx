/**
 * VariableReference - Reusable components for displaying and editing template variables
 *
 * This module provides components for working with {{ variable }} syntax used in:
 * - Workflow nodes (Transform, Condition, Prompt parameters)
 * - .prmd files (template expressions)
 * - Any text field that supports variable interpolation
 *
 * Components:
 * - VariablePill: Inline pill display for a single variable
 * - VariablePreview: Renders text with variables as pills (read-only)
 * - VariableInput: Input field with variable preview below
 * - parseVariables: Utility to extract variables from text
 */

import { memo, useMemo } from 'react'
import { Braces, X, ArrowRight } from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

export interface VariableInfo {
  /** Full match including {{ }} */
  raw: string
  /** Variable path without braces (e.g., "user.name" or "previous_output.items[0]") */
  path: string
  /** Start index in original string */
  start: number
  /** End index in original string */
  end: number
  /** Source node ID if path contains node reference (e.g., "node_id.output") */
  sourceNodeId?: string
  /** Property path after node ID */
  propertyPath?: string
}

export interface VariablePillProps {
  /** Variable path (without {{ }}) */
  path: string
  /** Source node ID for tooltip */
  sourceNodeId?: string
  /** Source node label for display */
  sourceNodeLabel?: string
  /** Called when remove button is clicked */
  onRemove?: () => void
  /** Called when pill is clicked */
  onClick?: () => void
  /** Size variant */
  size?: 'sm' | 'md'
  /** Color variant */
  variant?: 'default' | 'success' | 'warning' | 'error'
  /** Whether to show the full path or just the last segment */
  compact?: boolean
}

// ============================================================================
// Variable Parsing Utilities
// ============================================================================

/** Regex to match {{ variable }} patterns including nested paths and array access */
const VARIABLE_REGEX = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*|\[\d+\]|\['[^']+'\]|\["[^"]+"\])*)\s*\}\}/g

/**
 * Parse variables from a template string
 * @param text - Text containing {{ variable }} patterns
 * @returns Array of VariableInfo objects
 */
export function parseVariables(text: string): VariableInfo[] {
  const variables: VariableInfo[] = []
  let match: RegExpExecArray | null

  // Reset regex state
  VARIABLE_REGEX.lastIndex = 0

  while ((match = VARIABLE_REGEX.exec(text)) !== null) {
    const path = match[1].trim()
    const parts = path.split('.')

    // Check if first part looks like a node ID (contains hyphen or is a known prefix)
    let sourceNodeId: string | undefined
    let propertyPath: string | undefined

    if (parts.length > 1 && (parts[0].includes('-') || parts[0].includes('_'))) {
      // Likely a node reference like "prompt-1.output" or "generate_outline.result"
      sourceNodeId = parts[0]
      propertyPath = parts.slice(1).join('.')
    }

    variables.push({
      raw: match[0],
      path,
      start: match.index,
      end: match.index + match[0].length,
      sourceNodeId,
      propertyPath,
    })
  }

  return variables
}

/**
 * Check if a string contains any variables
 */
export function hasVariables(text: string): boolean {
  VARIABLE_REGEX.lastIndex = 0
  return VARIABLE_REGEX.test(text)
}

/**
 * Extract unique variable paths from text
 */
export function getUniqueVariablePaths(text: string): string[] {
  const variables = parseVariables(text)
  return [...new Set(variables.map(v => v.path))]
}

/**
 * Replace variables in text with values from a context object
 */
export function interpolateVariables(
  text: string,
  context: Record<string, unknown>
): string {
  return text.replace(VARIABLE_REGEX, (match, path) => {
    const value = getNestedValue(context, path.trim())
    if (value === undefined) return match
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  })
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(/\.|\[|\]/).filter(Boolean)
  let current: unknown = obj

  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    if (typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }

  return current
}

// ============================================================================
// VariablePill Component
// ============================================================================

const pillSizes = {
  sm: {
    padding: '1px 6px',
    fontSize: '10px',
    iconSize: 10,
    gap: '3px',
  },
  md: {
    padding: '2px 8px',
    fontSize: '12px',
    iconSize: 12,
    gap: '4px',
  },
}

const pillVariants = {
  default: {
    bg: 'color-mix(in srgb, var(--accent) 15%, transparent)',
    border: 'color-mix(in srgb, var(--accent) 30%, transparent)',
    color: 'var(--accent)',
  },
  success: {
    bg: 'color-mix(in srgb, var(--success) 15%, transparent)',
    border: 'color-mix(in srgb, var(--success) 30%, transparent)',
    color: 'var(--success)',
  },
  warning: {
    bg: 'color-mix(in srgb, var(--warning) 15%, transparent)',
    border: 'color-mix(in srgb, var(--warning) 30%, transparent)',
    color: 'var(--warning)',
  },
  error: {
    bg: 'color-mix(in srgb, var(--error) 15%, transparent)',
    border: 'color-mix(in srgb, var(--error) 30%, transparent)',
    color: 'var(--error)',
  },
}

/**
 * VariablePill - Inline pill display for a single variable reference
 */
export const VariablePill = memo(function VariablePill({
  path,
  sourceNodeId,
  sourceNodeLabel,
  onRemove,
  onClick,
  size = 'md',
  variant = 'default',
  compact = false,
}: VariablePillProps) {
  const sizeStyle = pillSizes[size]
  const variantStyle = pillVariants[variant]

  // For compact mode, show only the last segment
  const displayPath = compact ? path.split('.').pop() || path : path

  // Build tooltip
  const tooltip = useMemo(() => {
    const parts: string[] = []
    if (sourceNodeLabel) parts.push(`From: ${sourceNodeLabel}`)
    else if (sourceNodeId) parts.push(`From node: ${sourceNodeId}`)
    if (compact && path !== displayPath) parts.push(`Full path: ${path}`)
    return parts.join('\n') || path
  }, [sourceNodeId, sourceNodeLabel, path, displayPath, compact])

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: sizeStyle.gap,
        padding: sizeStyle.padding,
        background: variantStyle.bg,
        border: `1px solid ${variantStyle.border}`,
        borderRadius: '4px',
        fontSize: sizeStyle.fontSize,
        fontFamily: 'var(--font-mono, monospace)',
        color: variantStyle.color,
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        verticalAlign: 'middle',
        lineHeight: 1.4,
      }}
      title={tooltip}
      onClick={onClick}
    >
      <Braces style={{ width: sizeStyle.iconSize, height: sizeStyle.iconSize, flexShrink: 0 }} />
      <span style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {displayPath}
      </span>
      {sourceNodeLabel && (
        <>
          <ArrowRight style={{ width: sizeStyle.iconSize - 2, height: sizeStyle.iconSize - 2, opacity: 0.5 }} />
          <span style={{ opacity: 0.7, fontSize: '0.9em' }}>{sourceNodeLabel}</span>
        </>
      )}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            margin: 0,
            marginLeft: '2px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'inherit',
            opacity: 0.6,
          }}
          title="Remove variable"
        >
          <X style={{ width: sizeStyle.iconSize, height: sizeStyle.iconSize }} />
        </button>
      )}
    </span>
  )
})

// ============================================================================
// VariablePreview Component
// ============================================================================

export interface VariablePreviewProps {
  /** Text containing {{ variable }} patterns */
  text: string
  /** Size variant for pills */
  size?: 'sm' | 'md'
  /** Map of variable paths to their source node labels */
  nodeLabels?: Record<string, string>
  /** Called when a variable pill is clicked */
  onVariableClick?: (variable: VariableInfo) => void
  /** Custom class name */
  className?: string
  /** Inline styles */
  style?: React.CSSProperties
}

/**
 * VariablePreview - Renders text with variables displayed as pills
 *
 * Useful for showing a preview of template text with visual variable indicators.
 */
export const VariablePreview = memo(function VariablePreview({
  text,
  size = 'sm',
  nodeLabels = {},
  onVariableClick,
  className,
  style,
}: VariablePreviewProps) {
  const segments = useMemo(() => {
    const variables = parseVariables(text)
    const result: Array<{ type: 'text' | 'variable'; content: string; variable?: VariableInfo }> = []
    let lastIndex = 0

    for (const variable of variables) {
      // Add text before this variable
      if (variable.start > lastIndex) {
        result.push({
          type: 'text',
          content: text.slice(lastIndex, variable.start),
        })
      }
      // Add the variable
      result.push({
        type: 'variable',
        content: variable.path,
        variable,
      })
      lastIndex = variable.end
    }

    // Add remaining text
    if (lastIndex < text.length) {
      result.push({
        type: 'text',
        content: text.slice(lastIndex),
      })
    }

    return result
  }, [text])

  if (segments.length === 0) {
    return <span className={className} style={style}>{text}</span>
  }

  return (
    <span
      className={className}
      style={{
        display: 'inline',
        lineHeight: 1.6,
        ...style,
      }}
    >
      {segments.map((segment, index) => {
        if (segment.type === 'text') {
          return <span key={index}>{segment.content}</span>
        }

        const variable = segment.variable!
        const nodeLabel = variable.sourceNodeId
          ? nodeLabels[variable.sourceNodeId]
          : undefined

        return (
          <VariablePill
            key={index}
            path={variable.path}
            sourceNodeId={variable.sourceNodeId}
            sourceNodeLabel={nodeLabel}
            size={size}
            onClick={onVariableClick ? () => onVariableClick(variable) : undefined}
          />
        )
      })}
    </span>
  )
})

// ============================================================================
// VariableInput Component
// ============================================================================

export interface VariableInputProps {
  /** Current value */
  value: string
  /** Called when value changes */
  onChange: (value: string) => void
  /** Placeholder text */
  placeholder?: string
  /** Whether to show preview below input */
  showPreview?: boolean
  /** Map of variable paths to their source node labels */
  nodeLabels?: Record<string, string>
  /** Called when a variable in preview is clicked */
  onVariableClick?: (variable: VariableInfo) => void
  /** Input style overrides */
  inputStyle?: React.CSSProperties
  /** Whether input is disabled */
  disabled?: boolean
  /** Whether to use textarea instead of input */
  multiline?: boolean
  /** Number of rows for multiline */
  rows?: number
}

/**
 * VariableInput - Input field with live variable preview
 *
 * Shows a standard text input with a preview below that renders
 * variables as pills for visual feedback.
 */
export const VariableInput = memo(function VariableInput({
  value,
  onChange,
  placeholder,
  showPreview = true,
  nodeLabels = {},
  onVariableClick,
  inputStyle,
  disabled = false,
  multiline = false,
  rows = 3,
}: VariableInputProps) {
  const hasVars = useMemo(() => hasVariables(value), [value])

  const baseInputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid var(--input-border)',
    borderRadius: '6px',
    background: 'var(--input-bg)',
    color: 'var(--text)',
    fontSize: '13px',
    fontFamily: 'inherit',
    resize: multiline ? 'vertical' : 'none',
    ...inputStyle,
  }

  const InputComponent = multiline ? 'textarea' : 'input'

  return (
    <div>
      <InputComponent
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        rows={multiline ? rows : undefined}
        style={baseInputStyle}
      />
      {showPreview && hasVars && (
        <div
          style={{
            marginTop: '6px',
            padding: '6px 10px',
            background: 'var(--panel-2)',
            borderRadius: '4px',
            fontSize: '12px',
            color: 'var(--text-secondary)',
          }}
        >
          <div style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '4px' }}>
            Preview:
          </div>
          <VariablePreview
            text={value}
            size="sm"
            nodeLabels={nodeLabels}
            onVariableClick={onVariableClick}
          />
        </div>
      )}
    </div>
  )
})

// ============================================================================
// Export all
// ============================================================================

export default {
  VariablePill,
  VariablePreview,
  VariableInput,
  parseVariables,
  hasVariables,
  getUniqueVariablePaths,
  interpolateVariables,
}

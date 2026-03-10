/**
 * ToolIdentityFields - Shared property editor fields for tool-like nodes
 *
 * Renders toolName and description inputs that are common to all nodes
 * extending BaseToolNodeData. Used inside each tool node's properties panel.
 */

import { labelStyle, inputStyle } from '../shared/styles/propertyStyles'

export interface ToolIdentityFieldsProps {
  toolName: string
  description: string
  onToolNameChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  /** Custom label for toolName field (default: "Tool Name") */
  toolNameLabel?: string
  /** Custom placeholder for toolName (default: "e.g., web_search") */
  toolNamePlaceholder?: string
  /** Help text below toolName input */
  toolNameHint?: string
}

/**
 * Enforces snake_case: lowercase, underscores, no leading/trailing underscores.
 * Allows empty string for initial state.
 */
function normalizeToolName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_/, '')
}

export function ToolIdentityFields({
  toolName,
  description,
  onToolNameChange,
  onDescriptionChange,
  toolNameLabel = 'Tool Name',
  toolNamePlaceholder = 'e.g., web_search',
  toolNameHint,
}: ToolIdentityFieldsProps) {
  return (
    <>
      {/* Tool Name */}
      <div>
        <label style={labelStyle}>{toolNameLabel}</label>
        <input
          type="text"
          value={toolName || ''}
          onChange={(e) => onToolNameChange(normalizeToolName(e.target.value))}
          placeholder={toolNamePlaceholder}
          style={inputStyle}
        />
        {toolNameHint && (
          <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
            {toolNameHint}
          </p>
        )}
      </div>

      {/* Description */}
      <div>
        <label style={labelStyle}>Description</label>
        <textarea
          value={description || ''}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Brief description of what this tool does"
          style={{ ...inputStyle, minHeight: '60px', resize: 'vertical', fontFamily: 'inherit' }}
        />
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
          Shown to LLM agents for tool selection.
        </p>
      </div>
    </>
  )
}

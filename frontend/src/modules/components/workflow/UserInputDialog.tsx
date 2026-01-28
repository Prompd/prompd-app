/**
 * UserInputDialog - Dialog for collecting user input during workflow execution
 *
 * This dialog appears when a user-input node is reached during workflow execution.
 * It shows the context (previous output) and collects the user's input.
 */

import { useState, useEffect, useRef } from 'react'
import { X, Send, MessageSquare, AlertCircle } from 'lucide-react'
import type { UserInputNodeData } from '../../services/workflowTypes'

/**
 * UserInputRequest - Data passed to the dialog when requesting user input
 */
export interface UserInputRequest {
  nodeId: string
  nodeLabel: string
  prompt: string
  inputType: 'text' | 'textarea' | 'choice' | 'confirm' | 'number'
  choices?: string[]
  placeholder?: string
  defaultValue?: string
  required?: boolean
  showContext?: boolean
  contextTemplate?: string
  context: {
    previousOutput: unknown
    variables: Record<string, unknown>
  }
}

/**
 * UserInputResponse - Response from the dialog
 */
export interface UserInputResponse {
  value: unknown
  cancelled?: boolean
}

interface UserInputDialogProps {
  request: UserInputRequest
  onSubmit: (response: UserInputResponse) => void
  onCancel: () => void
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 500,
  color: 'var(--text)',
  marginBottom: '6px',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid var(--input-border)',
  borderRadius: '6px',
  background: 'var(--input-bg)',
  color: 'var(--text)',
  fontSize: '14px',
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: '120px',
  resize: 'vertical',
  fontFamily: 'inherit',
}

const nodeColor = 'var(--node-violet, #8b5cf6)'

export function UserInputDialog({ request, onSubmit, onCancel }: UserInputDialogProps) {
  const [value, setValue] = useState<unknown>(request.defaultValue ?? getDefaultValue(request.inputType))
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => {
      inputRef.current?.focus()
    }, 100)
  }, [])

  // Validate input
  useEffect(() => {
    if (request.required) {
      if (value === undefined || value === null || value === '') {
        setError('This field is required')
      } else {
        setError(null)
      }
    } else {
      setError(null)
    }
  }, [value, request.required])

  const handleSubmit = () => {
    if (error) return
    onSubmit({ value })
  }

  const handleCancel = () => {
    onCancel()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl+Enter submits for all input types (including textarea)
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault()
      handleSubmit()
    }
    // Plain Enter submits for non-textarea inputs
    else if (e.key === 'Enter' && !e.shiftKey && request.inputType !== 'textarea') {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  // Format context for display
  const formatContext = (ctx: unknown): string => {
    if (ctx === null || ctx === undefined) return ''
    if (typeof ctx === 'string') return ctx
    try {
      return JSON.stringify(ctx, null, 2)
    } catch {
      return String(ctx)
    }
  }

  const contextDisplay = request.showContext && request.context.previousOutput
    ? formatContext(request.context.previousOutput)
    : null

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
      onClick={handleCancel}
      onKeyDown={handleKeyDown}
    >
      <div
        style={{
          background: 'var(--panel)',
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          border: '1px solid var(--border)',
          width: '100%',
          maxWidth: '520px',
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
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '6px',
                background: `color-mix(in srgb, ${nodeColor} 20%, transparent)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: nodeColor,
              }}
            >
              <MessageSquare style={{ width: 16, height: 16 }} />
            </div>
            <div>
              <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
                {request.nodeLabel || 'User Input'}
              </span>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                Workflow paused - waiting for input
              </div>
            </div>
          </div>
          <button
            onClick={handleCancel}
            style={{
              padding: '6px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--muted)',
              borderRadius: '4px',
            }}
            title="Cancel and stop workflow"
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
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* Context display - show previous output if enabled */}
          {contextDisplay && (
            <div
              style={{
                padding: '12px',
                background: 'var(--panel-2)',
                borderRadius: '8px',
                borderLeft: `3px solid ${nodeColor}`,
              }}
            >
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 500,
                  color: 'var(--muted)',
                  marginBottom: '8px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Previous Output
              </div>
              <div
                style={{
                  fontSize: '13px',
                  color: 'var(--text)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  fontFamily: typeof request.context.previousOutput === 'string' ? 'inherit' : 'monospace',
                }}
              >
                {contextDisplay}
              </div>
            </div>
          )}

          {/* Prompt */}
          <div>
            <label style={labelStyle}>
              {request.prompt || 'Enter your input'}
              {request.required && <span style={{ color: 'var(--error)', marginLeft: '4px' }}>*</span>}
            </label>

            {/* Input based on type */}
            {request.inputType === 'textarea' ? (
              <textarea
                ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                value={String(value ?? '')}
                onChange={(e) => setValue(e.target.value)}
                placeholder={request.placeholder || 'Type your message...'}
                style={{
                  ...textareaStyle,
                  borderColor: error ? 'var(--error)' : 'var(--input-border)',
                }}
              />
            ) : request.inputType === 'choice' && request.choices ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {request.choices.map((choice, idx) => (
                  <button
                    key={idx}
                    onClick={() => setValue(choice)}
                    style={{
                      padding: '10px 14px',
                      background: value === choice
                        ? `color-mix(in srgb, ${nodeColor} 15%, transparent)`
                        : 'var(--panel-2)',
                      border: value === choice
                        ? `2px solid ${nodeColor}`
                        : '2px solid var(--border)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      color: 'var(--text)',
                      fontSize: '13px',
                      textAlign: 'left',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                  >
                    {choice}
                  </button>
                ))}
              </div>
            ) : request.inputType === 'confirm' ? (
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => setValue(true)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: value === true
                      ? 'color-mix(in srgb, var(--success) 15%, transparent)'
                      : 'var(--panel-2)',
                    border: value === true
                      ? '2px solid var(--success)'
                      : '2px solid var(--border)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    color: value === true ? 'var(--success)' : 'var(--text)',
                    fontSize: '14px',
                    fontWeight: 500,
                  }}
                >
                  Yes
                </button>
                <button
                  onClick={() => setValue(false)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: value === false
                      ? 'color-mix(in srgb, var(--error) 15%, transparent)'
                      : 'var(--panel-2)',
                    border: value === false
                      ? '2px solid var(--error)'
                      : '2px solid var(--border)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    color: value === false ? 'var(--error)' : 'var(--text)',
                    fontSize: '14px',
                    fontWeight: 500,
                  }}
                >
                  No
                </button>
              </div>
            ) : request.inputType === 'number' ? (
              <input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                type="number"
                value={value !== undefined ? String(value) : ''}
                onChange={(e) => setValue(e.target.value === '' ? undefined : Number(e.target.value))}
                placeholder={request.placeholder || 'Enter a number...'}
                style={{
                  ...inputStyle,
                  borderColor: error ? 'var(--error)' : 'var(--input-border)',
                }}
              />
            ) : (
              <input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                type="text"
                value={String(value ?? '')}
                onChange={(e) => setValue(e.target.value)}
                placeholder={request.placeholder || 'Type here...'}
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
                  marginTop: '6px',
                  fontSize: '11px',
                  color: 'var(--error)',
                }}
              >
                <AlertCircle style={{ width: 12, height: 12 }} />
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderTop: '1px solid var(--border)',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
            Press {request.inputType === 'textarea' ? 'Ctrl+Enter' : 'Enter'} to submit, Esc to cancel
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleCancel}
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
              onClick={handleSubmit}
              disabled={!!error}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 20px',
                background: error ? 'var(--panel-2)' : nodeColor,
                border: 'none',
                borderRadius: '6px',
                cursor: error ? 'not-allowed' : 'pointer',
                color: error ? 'var(--muted)' : 'white',
                fontSize: '13px',
                fontWeight: 500,
              }}
            >
              <Send style={{ width: 14, height: 14 }} />
              Submit
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function getDefaultValue(inputType: string): unknown {
  switch (inputType) {
    case 'confirm':
      return undefined
    case 'number':
      return undefined
    case 'choice':
      return undefined
    default:
      return ''
  }
}

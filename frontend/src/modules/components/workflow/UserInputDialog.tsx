/**
 * UserInputDialog - Chat-style dialog for collecting user input during workflow execution
 *
 * Appears when a user-input node is reached during workflow execution.
 * Shows context (previous output) as chat bubbles and collects the user's input.
 */

import { useState, useEffect, useRef } from 'react'
import { X, Send, MessageSquare, AlertCircle } from 'lucide-react'
import type { UserInputNodeData } from '../../services/workflowTypes'
import './UserInputDialog.css'

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

export function UserInputDialog({ request, onSubmit, onCancel }: UserInputDialogProps) {
  const [value, setValue] = useState<unknown>(request.defaultValue ?? getDefaultValue(request.inputType))
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => {
      inputRef.current?.focus()
    }, 100)
  }, [])

  // Scroll chat to bottom when content changes
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [request])

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
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'Enter' && !e.shiftKey && request.inputType !== 'textarea') {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

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

  const isMonoContext = request.context.previousOutput != null && typeof request.context.previousOutput !== 'string'

  // Choose which input to render based on type
  const renderInput = () => {
    if (request.inputType === 'choice' && request.choices) {
      return (
        <div className="uid-choices">
          {request.choices.map((choice, idx) => (
            <button
              key={idx}
              className={`uid-choice-btn ${value === choice ? 'selected' : ''}`}
              onClick={() => setValue(choice)}
            >
              {choice}
            </button>
          ))}
        </div>
      )
    }

    if (request.inputType === 'confirm') {
      return (
        <div className="uid-confirm-row">
          <button
            className={`uid-confirm-btn yes ${value === true ? 'selected' : ''}`}
            onClick={() => setValue(true)}
          >
            Yes
          </button>
          <button
            className={`uid-confirm-btn no ${value === false ? 'selected' : ''}`}
            onClick={() => setValue(false)}
          >
            No
          </button>
        </div>
      )
    }

    if (request.inputType === 'textarea') {
      return (
        <div className="uid-input-wrapper">
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            className={`uid-text-input ${error ? 'has-error' : ''}`}
            value={String(value ?? '')}
            onChange={(e) => setValue(e.target.value)}
            placeholder={request.placeholder || 'Type your message...'}
            rows={3}
          />
          <button
            className="uid-submit-btn"
            onClick={handleSubmit}
            disabled={!!error}
            title="Submit"
          >
            <Send size={16} />
          </button>
        </div>
      )
    }

    if (request.inputType === 'number') {
      return (
        <div className="uid-input-wrapper">
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="number"
            className={`uid-text-input uid-number-input ${error ? 'has-error' : ''}`}
            value={value !== undefined ? String(value) : ''}
            onChange={(e) => setValue(e.target.value === '' ? undefined : Number(e.target.value))}
            placeholder={request.placeholder || 'Enter a number...'}
          />
          <button
            className="uid-submit-btn"
            onClick={handleSubmit}
            disabled={!!error}
            title="Submit"
          >
            <Send size={16} />
          </button>
        </div>
      )
    }

    // Default: text input
    return (
      <div className="uid-input-wrapper">
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          className={`uid-text-input ${error ? 'has-error' : ''}`}
          value={String(value ?? '')}
          onChange={(e) => setValue(e.target.value)}
          placeholder={request.placeholder || 'Type here...'}
        />
        <button
          className="uid-submit-btn"
          onClick={handleSubmit}
          disabled={!!error}
          title="Submit"
        >
          <Send size={16} />
        </button>
      </div>
    )
  }

  return (
    <div className="uid-overlay" onClick={handleCancel} onKeyDown={handleKeyDown}>
      <div className="uid-window" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="uid-header">
          <div className="uid-header-left">
            <div className="uid-icon-badge">
              <MessageSquare size={16} />
            </div>
            <div>
              <div className="uid-header-title">
                {request.nodeLabel || 'User Input'}
              </div>
              <div className="uid-header-subtitle">
                Workflow paused — waiting for input
              </div>
            </div>
          </div>
          <button
            className="uid-close-btn"
            onClick={handleCancel}
            title="Cancel and stop workflow"
          >
            <X size={18} />
          </button>
        </div>

        {/* Chat area */}
        <div className="uid-chat-area">
          {/* Context bubble */}
          {contextDisplay && (
            <div className="uid-message context">
              <div className="uid-context-label">Previous Output</div>
              <div className={`uid-context-content ${isMonoContext ? 'monospace' : ''}`}>
                {contextDisplay}
              </div>
            </div>
          )}

          {/* Prompt bubble */}
          <div className="uid-prompt-bubble">
            {request.prompt || 'Enter your input'}
            {request.required && <span className="uid-required">*</span>}
          </div>

          <div ref={chatEndRef} />
        </div>

        {/* Input section */}
        <div className="uid-input-section" onKeyDown={handleKeyDown}>
          {renderInput()}

          {error && (
            <div className="uid-error">
              <AlertCircle size={12} />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="uid-footer">
          <div className="uid-footer-hint">
            {request.inputType === 'textarea' ? 'Ctrl+Enter to submit' : 'Enter to submit'} · Esc to cancel
          </div>
          <div className="uid-footer-actions">
            <button className="uid-cancel-btn" onClick={handleCancel}>
              Cancel
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

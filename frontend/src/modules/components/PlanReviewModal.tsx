/**
 * PlanReviewModal Component
 *
 * Shows a modal dialog with a markdown-rendered plan for user review.
 * Used when the agent calls the `present_plan` tool.
 * User can refine the plan, or apply it with review or trust.
 */

import { useState } from 'react'
import { ClipboardList, PenLine, Shield, Zap, X } from 'lucide-react'
import MarkdownPreview from './MarkdownPreview'

interface PlanReviewModalProps {
  content: string
  onRefine: (feedback: string) => void
  onApply: (mode: 'confirm' | 'auto') => void
  onCancel: () => void
}

export default function PlanReviewModal({ content, onRefine, onApply, onCancel }: PlanReviewModalProps) {
  const [showRefineInput, setShowRefineInput] = useState(false)
  const [refineFeedback, setRefineFeedback] = useState('')

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 2000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      backdropFilter: 'blur(4px)'
    }}>
      <div style={{
        background: 'var(--prompd-panel-2, #1e1e2e)',
        borderRadius: '12px',
        border: '1px solid var(--border)',
        maxWidth: '900px',
        width: '95%',
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
        animation: 'fadeIn 0.2s ease-out'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexShrink: 0
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#6366f1'
          }}>
            <ClipboardList size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{
              margin: 0,
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--prompd-text)'
            }}>
              Plan Review
            </h3>
            <p style={{
              margin: '2px 0 0',
              fontSize: '13px',
              color: 'var(--prompd-muted)'
            }}>
              Review the proposed plan before execution
            </p>
          </div>
          <button
            onClick={onCancel}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--prompd-muted)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Cancel"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          minHeight: 0
        }}>
          <MarkdownPreview
            content={content}
            height="auto"
            theme="dark"
          />
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 20px',
          borderTop: '1px solid var(--border)',
          flexShrink: 0
        }}>
          {showRefineInput ? (
            <div>
              <textarea
                value={refineFeedback}
                onChange={(e) => setRefineFeedback(e.target.value)}
                placeholder="Tell the agent what to change or add to the plan..."
                autoFocus
                style={{
                  width: '100%',
                  minHeight: '80px',
                  padding: '10px 12px',
                  background: 'var(--prompd-panel, #1a1a2e)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--prompd-text)',
                  fontSize: '14px',
                  resize: 'vertical',
                  marginBottom: '12px',
                  outline: 'none',
                  fontFamily: 'inherit'
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.5)' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  onClick={() => setShowRefineInput(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--prompd-text)',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  Back
                </button>
                <button
                  onClick={() => onCancel()}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: '#ef4444',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => onRefine(refineFeedback || '')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    background: 'var(--prompd-accent, #6366f1)',
                    color: 'white',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  Send Feedback
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              {/* Refine */}
              <button
                onClick={() => setShowRefineInput(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--prompd-text)',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                <PenLine size={14} />
                Refine
              </button>
              {/* Apply (review each) */}
              <button
                onClick={() => onApply('confirm')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: '1px solid rgba(99, 102, 241, 0.4)',
                  background: 'rgba(99, 102, 241, 0.1)',
                  color: '#818cf8',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                <Shield size={14} />
                Apply (review each)
              </button>
              {/* Apply (trust) */}
              <button
                onClick={() => onApply('auto')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'var(--prompd-accent, #6366f1)',
                  color: 'white',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                <Zap size={14} />
                Apply (trust)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

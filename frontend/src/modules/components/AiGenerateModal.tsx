import React from 'react'
import { X, Sparkles } from 'lucide-react'
import { AiGenerationMetadata } from '../types'
import { ConversationalChat } from './ConversationalChat'
import { useAuthenticatedUser } from '../auth/ClerkWrapper'

interface AiGenerateModalProps {
  isOpen: boolean
  onClose: () => void
  onGenerated: (prompd: string, filename: string, metadata: AiGenerationMetadata) => void
  theme: 'light' | 'dark'
}

export function AiGenerateModal({ isOpen, onClose, onGenerated, theme }: AiGenerateModalProps) {
  const { getToken } = useAuthenticatedUser()

  // Theme-aware colors
  const colors = {
    bg: theme === 'dark' ? '#1e293b' : '#ffffff',
    bgSecondary: theme === 'dark' ? '#0f172a' : '#f8fafc',
    bgTertiary: theme === 'dark' ? '#334155' : '#e2e8f0',
    border: theme === 'dark' ? 'rgba(71, 85, 105, 0.3)' : '#e2e8f0',
    text: theme === 'dark' ? '#ffffff' : '#0f172a',
    textSecondary: theme === 'dark' ? '#94a3b8' : '#64748b',
    hover: theme === 'dark' ? 'rgba(71, 85, 105, 0.3)' : 'rgba(148, 163, 184, 0.15)',
    primary: '#3b82f6',
    primaryHover: '#2563eb',
    error: '#ef4444',
    errorBg: theme === 'dark' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.1)',
    errorBorder: theme === 'dark' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.3)',
    infoBg: theme === 'dark' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.1)',
    infoBorder: theme === 'dark' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.3)'
  }

  const handleConversationalGenerated = (prompd: string, turnMetadata?: {
    tokensUsed: { input: number; output: number; total: number }
    estimatedCost: number
    model: string
    durationMs: number
  }) => {
    // Generate filename from first line of description
    const filename = 'ai-conversation-generated.prmd'

    const metadata: AiGenerationMetadata = {
      description: 'Generated via conversational AI',
      complexity: 'intermediate',
      includeExamples: true,
      timestamp: new Date().toISOString(),
      responseMetadata: {
        mode: 'conversational',
        provider: 'anthropic',
        model: turnMetadata?.model,
        durationMs: turnMetadata?.durationMs,
        tokensUsed: turnMetadata?.tokensUsed,
        estimatedCost: turnMetadata?.estimatedCost
      }
    }

    onGenerated(prompd, filename, metadata)
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        backdropFilter: 'blur(4px)'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          borderRadius: '12px',
          width: '90%',
          maxWidth: '600px',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: theme === 'dark' ? '0 20px 60px rgba(0, 0, 0, 0.6)' : '0 20px 60px rgba(0, 0, 0, 0.15)',
          transition: 'all 0.2s ease'
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: `1px solid ${colors.border}`
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Sparkles size={24} style={{ color: colors.primary }} />
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: colors.text }}>AI Chat</h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              color: colors.textSecondary,
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = colors.hover)}
            onMouseOut={(e) => (e.currentTarget.style.background = 'none')}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px' }}>
          <ConversationalChat
            getToken={async () => {
              const token = await getToken()
              if (!token) throw new Error('Authentication required')
              return token
            }}
            onPrompdGenerated={handleConversationalGenerated}
            provider="anthropic"
          />
        </div>
      </div>
    </div>
  )
}

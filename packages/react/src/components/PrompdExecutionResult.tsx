import React from 'react'
import { clsx } from 'clsx'
import { Play, Copy } from 'lucide-react'

export interface PrompdExecutionResultData {
  content: string
  metadata?: {
    provider?: string
    model?: string
    usage?: {
      promptTokens?: number
      completionTokens?: number
      totalTokens?: number
    }
    executionTime?: number
    timestamp?: Date | string
    [key: string]: any
  }
  compiledPrompt?: string
  parameters?: Record<string, any>
  error?: string
  status?: 'success' | 'error' | 'pending'
}

export interface PrompdExecutionResultProps {
  result: PrompdExecutionResultData
  onRerun?: (parameters?: Record<string, any>) => void
  onCopy?: (content: string) => void
  className?: string
  showMetadata?: boolean
  showCompiledPrompt?: boolean
}

/**
 * Display execution result from prompd package
 */
export function PrompdExecutionResult({
  result,
  onRerun,
  onCopy,
  className,
  showMetadata = true,
  showCompiledPrompt = false
}: PrompdExecutionResultProps) {
  const [activeTab, setActiveTab] = React.useState<'result' | 'compiled' | 'metadata'>('result')

  const tabs = [
    { id: 'result' as const, label: 'Result', show: true },
    { id: 'compiled' as const, label: 'Compiled Prompt', show: showCompiledPrompt && result.compiledPrompt },
    { id: 'metadata' as const, label: 'Metadata', show: showMetadata && result.metadata }
  ].filter(tab => tab.show)

  React.useEffect(() => {
    // Ensure active tab is valid
    if (!tabs.find(t => t.id === activeTab)) {
      setActiveTab('result')
    }
  }, [tabs, activeTab])

  return (
    <div className={clsx('prompd-execution-result', className)} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tabs - Sticky at top */}
      {tabs.length > 1 && (
        <div
          className="prompd-result-tabs"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            display: 'flex',
            gap: '0.25rem',
            borderBottom: '1px solid var(--prompd-border)',
            background: 'var(--prompd-panel)',
            paddingTop: '0.5rem',
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx('prompd-result-tab', activeTab === tab.id && 'active')}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: activeTab === tab.id ? 'var(--prompd-accent)' : 'var(--prompd-muted)',
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${activeTab === tab.id ? 'var(--prompd-accent)' : 'transparent'}`,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Result Tab */}
      {activeTab === 'result' && (
        <div className="prompd-result-content">
          {result.status === 'error' && result.error ? (
            <div
              className="prompd-result-error"
              style={{
                padding: '1rem',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '0.5rem',
                color: '#991b1b',
                fontSize: '0.875rem',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Error</div>
              <div>{result.error}</div>
            </div>
          ) : (
            <>
              <div
                className="prompd-result-text"
                style={{
                  padding: '1rem',
                  background: 'var(--prompd-panel)',
                  border: '1px solid var(--prompd-border)',
                  borderRadius: '0.5rem',
                  fontSize: '0.9375rem',
                  lineHeight: 1.6,
                  color: 'var(--prompd-text)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {result.content}
              </div>

              {/* Actions */}
              <div
                className="prompd-result-actions"
                style={{
                  display: 'flex',
                  gap: '0.75rem',
                  marginTop: '1rem',
                }}
              >
                {onCopy && (
                  <button
                    onClick={() => onCopy(result.content)}
                    className="prompd-copy-button"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.625rem 1.25rem',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      color: 'var(--prompd-text)',
                      background: 'var(--prompd-panel)',
                      border: '1px solid var(--prompd-border)',
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--prompd-panel-2)'
                      e.currentTarget.style.borderColor = 'var(--prompd-accent)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--prompd-panel)'
                      e.currentTarget.style.borderColor = 'var(--prompd-border)'
                    }}
                  >
                    <Copy style={{ width: '1rem', height: '1rem' }} />
                    Copy
                  </button>
                )}

                {onRerun && (
                  <button
                    onClick={() => onRerun(result.parameters)}
                    className="prompd-rerun-button"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.625rem 1.25rem',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      color: 'white',
                      background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                      border: 'none',
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      boxShadow: '0 2px 8px rgba(59, 130, 246, 0.25)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-1px)'
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.35)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.25)'
                    }}
                  >
                    <Play style={{ width: '1rem', height: '1rem' }} />
                    Run Again
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Compiled Prompt Tab */}
      {activeTab === 'compiled' && result.compiledPrompt && (
        <div className="prompd-result-compiled">
          <div
            style={{
              padding: '1rem',
              background: 'var(--prompd-panel)',
              border: '1px solid var(--prompd-border)',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              lineHeight: 1.6,
              color: 'var(--prompd-text)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'monospace',
            }}
          >
            {result.compiledPrompt}
          </div>

          {/* Actions for Compiled Prompt */}
          <div
            className="prompd-result-actions"
            style={{
              display: 'flex',
              gap: '0.75rem',
              marginTop: '1rem',
            }}
          >
            {onCopy && (
              <button
                onClick={() => onCopy(result.compiledPrompt!)}
                className="prompd-copy-button"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.625rem 1.25rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: 'var(--prompd-text)',
                  background: 'var(--prompd-panel)',
                  border: '1px solid var(--prompd-border)',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--prompd-panel-2)'
                  e.currentTarget.style.borderColor = 'var(--prompd-accent)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--prompd-panel)'
                  e.currentTarget.style.borderColor = 'var(--prompd-border)'
                }}
              >
                <Copy style={{ width: '1rem', height: '1rem' }} />
                Copy Prompt
              </button>
            )}

            {onRerun && (
              <button
                onClick={() => onRerun(result.parameters)}
                className="prompd-rerun-button"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.625rem 1.25rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: 'white',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 2px 8px rgba(59, 130, 246, 0.25)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)'
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.35)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.25)'
                }}
              >
                <Play style={{ width: '1rem', height: '1rem' }} />
                Run Again
              </button>
            )}
          </div>
        </div>
      )}

      {/* Metadata Tab */}
      {activeTab === 'metadata' && result.metadata && (
        <div
          className="prompd-result-metadata"
          style={{
            padding: '1rem',
            background: 'var(--prompd-panel)',
            border: '1px solid var(--prompd-border)',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '0.5rem',
              color: 'var(--prompd-text)',
            }}
          >
            {Object.entries(result.metadata).map(([key, value]) => (
              <React.Fragment key={key}>
                <div style={{ color: 'var(--prompd-muted)', fontWeight: 500 }}>{key}:</div>
                <div style={{ fontFamily: 'monospace' }}>
                  {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

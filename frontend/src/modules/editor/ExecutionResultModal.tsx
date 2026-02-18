import { useState } from 'react'
import {
  CheckCircle,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Copy,
  Zap,
  DollarSign,
  Timer,
  FileText,
  Info,
  X,
  Sparkles,
  Play,
  Settings
} from 'lucide-react'
import WysiwygEditor from '../components/WysiwygEditor'

export interface ExecutionResult {
  content: string
  metadata?: {
    provider: string
    model: string
    duration: number
    tokensUsed?: {
      input: number
      output: number
      total: number
    }
    estimatedCost?: number
    executionMode?: 'local' | 'remote'
    // Generation settings
    maxTokens?: number
    temperature?: number
    mode?: 'default' | 'thinking' | 'json' | 'code'
  }
  compiledPrompt?: string | {
    finalPrompt: string
    sections: {
      system?: string
      context?: string
      user?: string
    }
    parameters: Record<string, unknown>
    metadata: {
      packageName?: string
      packageVersion?: string
      compiledAt: string
      compiler: string
    }
  }
  status: 'success' | 'error'
  timestamp: string
}

interface ExecutionResultModalProps {
  result: ExecutionResult
  executionHistory: ExecutionResult[]
  selectedIndex: number
  onSelectIndex: (index: number) => void
  theme: 'vs-dark' | 'light'
  onClose: () => void
  onRunAgain: () => void
}

export function ExecutionResultModal({
  result,
  executionHistory,
  selectedIndex,
  onSelectIndex,
  theme,
  onClose,
  onRunAgain
}: ExecutionResultModalProps) {
  const [activeTab, setActiveTab] = useState<'response' | 'prompd' | 'metadata'>('response')
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)

  const handleCopy = () => {
    const textToCopy = activeTab === 'prompd'
      ? (typeof result.compiledPrompt === 'string'
          ? result.compiledPrompt
          : result.compiledPrompt?.finalPrompt || '')
      : result.content
    navigator.clipboard.writeText(textToCopy)
    setCopyFeedback('Copied!')
    setTimeout(() => setCopyFeedback(null), 2000)
  }

  const isDark = theme === 'vs-dark'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(8px)'
      }}
      onClick={onClose}
    >
      <div
        style={{
          maxWidth: '1100px',
          width: '100%',
          height: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: isDark ? '#0f172a' : '#ffffff',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 25px 80px rgba(0, 0, 0, 0.5)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Stats */}
        <div style={{
          background: isDark
            ? 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)'
            : 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
          borderBottom: '1px solid var(--border)'
        }}>
          {/* Top Row: Title, Status, Close */}
          <div style={{
            padding: '20px 24px 16px 24px',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                <h2 style={{
                  fontSize: '18px',
                  fontWeight: 700,
                  color: 'var(--text)',
                  margin: 0
                }}>
                  Execution Result
                </h2>
                {result.status === 'success' ? (
                  <span style={{
                    padding: '4px 10px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#10b981',
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    <CheckCircle size={12} />
                    Success
                  </span>
                ) : (
                  <span style={{
                    padding: '4px 10px',
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: '#ef4444',
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    <XCircle size={12} />
                    Error
                  </span>
                )}
              </div>
              <div style={{
                fontSize: '12px',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <Clock size={12} />
                {new Date(result.timestamp).toLocaleString()}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                padding: '8px',
                borderRadius: '8px',
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--panel-2)'
                e.currentTarget.style.color = 'var(--text)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--text-secondary)'
              }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Stats Cards */}
          {result.metadata && (
            <div style={{
              padding: '0 24px 16px 24px',
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '12px'
            }}>
              {/* Provider/Model Card */}
              <StatCard
                icon={<Sparkles size={10} />}
                label="Model"
                value={result.metadata.model}
                subValue={result.metadata.provider}
                isDark={isDark}
                mono
              />

              {/* Duration Card */}
              <StatCard
                icon={<Timer size={10} />}
                label="Duration"
                value={`${(result.metadata.duration / 1000).toFixed(2)}`}
                valueSuffix="s"
                isDark={isDark}
                large
              />

              {/* Tokens Card */}
              <StatCard
                icon={<Zap size={10} />}
                label="Tokens"
                value={result.metadata.tokensUsed?.total.toLocaleString() || 'N/A'}
                subValue={result.metadata.tokensUsed
                  ? `In: ${result.metadata.tokensUsed.input.toLocaleString()} | Out: ${result.metadata.tokensUsed.output.toLocaleString()}`
                  : undefined
                }
                isDark={isDark}
                large
              />

              {/* Cost Card */}
              <StatCard
                icon={<DollarSign size={10} />}
                label="Est. Cost"
                value={result.metadata.estimatedCost
                  ? `$${result.metadata.estimatedCost.toFixed(4)}`
                  : 'N/A'
                }
                isDark={isDark}
                large
                valueColor={result.metadata.estimatedCost ? '#10b981' : undefined}
              />
            </div>
          )}

          {/* Tabs */}
          <div style={{
            display: 'flex',
            gap: '2px',
            padding: '0 24px',
            borderTop: '1px solid var(--border)',
            background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)'
          }}>
            {[
              { id: 'response' as const, label: 'Response', icon: FileText },
              { id: 'prompd' as const, label: 'Compiled Prompt', icon: Sparkles },
              { id: 'metadata' as const, label: 'Details', icon: Info }
            ].map(tab => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: '12px 20px',
                    fontSize: '13px',
                    fontWeight: 500,
                    background: isActive
                      ? (isDark ? '#0f172a' : '#ffffff')
                      : 'transparent',
                    color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                    border: 'none',
                    borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                    borderTopLeftRadius: isActive ? '8px' : 0,
                    borderTopRightRadius: isActive ? '8px' : 0,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: isActive ? '-1px' : 0
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = 'var(--text)'
                      e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = 'var(--text-secondary)'
                      e.currentTarget.style.background = 'transparent'
                    }
                  }}
                >
                  <Icon size={14} />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Content Area */}
        <div style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative'
        }}>
          {/* Response Tab */}
          {activeTab === 'response' && (
            <WysiwygEditor
              value={result.content}
              readOnly
              height="100%"
              theme={isDark ? 'dark' : 'light'}
              showToolbar={false}
            />
          )}

          {/* Compiled Prompd Tab */}
          {activeTab === 'prompd' && result.compiledPrompt && (
            <WysiwygEditor
              value={
                typeof result.compiledPrompt === 'string'
                  ? result.compiledPrompt
                  : result.compiledPrompt?.finalPrompt || ''
              }
              readOnly
              height="100%"
              theme={isDark ? 'dark' : 'light'}
              showToolbar={false}
            />
          )}

          {activeTab === 'prompd' && !result.compiledPrompt && (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
              fontSize: '14px'
            }}>
              <div style={{ textAlign: 'center' }}>
                <FileText size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
                <div>No compiled prompt available for this execution.</div>
              </div>
            </div>
          )}

          {/* Metadata Tab */}
          {activeTab === 'metadata' && (
            <MetadataTab result={result} isDark={isDark} />
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: isDark ? '#1e293b' : '#f8fafc'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Copy Button with Feedback */}
            <button
              onClick={handleCopy}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 500,
                background: copyFeedback ? '#10b981' : 'var(--panel-3)',
                color: copyFeedback ? 'white' : 'var(--text)',
                border: '1px solid var(--border)',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                minWidth: '100px',
                justifyContent: 'center'
              }}
              onMouseEnter={(e) => {
                if (!copyFeedback) {
                  e.currentTarget.style.background = 'var(--panel)'
                }
              }}
              onMouseLeave={(e) => {
                if (!copyFeedback) {
                  e.currentTarget.style.background = 'var(--panel-3)'
                }
              }}
            >
              {copyFeedback ? (
                <>
                  <CheckCircle size={14} />
                  {copyFeedback}
                </>
              ) : (
                <>
                  <Copy size={14} />
                  Copy
                </>
              )}
            </button>

            {/* Navigation between results */}
            {executionHistory.length > 1 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px',
                background: 'var(--panel-2)',
                borderRadius: '8px',
                border: '1px solid var(--border)'
              }}>
                <NavButton
                  direction="prev"
                  disabled={selectedIndex >= executionHistory.length - 1}
                  onClick={() => onSelectIndex(Math.min(selectedIndex + 1, executionHistory.length - 1))}
                />
                <span style={{
                  fontSize: '12px',
                  color: 'var(--text)',
                  padding: '0 12px',
                  fontWeight: 500
                }}>
                  {selectedIndex + 1} / {executionHistory.length}
                </span>
                <NavButton
                  direction="next"
                  disabled={selectedIndex <= 0}
                  onClick={() => onSelectIndex(Math.max(selectedIndex - 1, 0))}
                />
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => {
                onClose()
                onRunAgain()
              }}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 8px rgba(79, 70, 229, 0.3)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(79, 70, 229, 0.4)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(79, 70, 229, 0.3)'
              }}
            >
              <Play size={14} />
              Run Again
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 500,
                background: 'var(--panel-3)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--panel)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--panel-3)'
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Stat Card Component
interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string
  valueSuffix?: string
  subValue?: string
  isDark: boolean
  mono?: boolean
  large?: boolean
  valueColor?: string
}

function StatCard({ icon, label, value, valueSuffix, subValue, isDark, mono, large, valueColor }: StatCardProps) {
  return (
    <div style={{
      padding: '12px 16px',
      background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
      borderRadius: '10px',
      border: '1px solid var(--border)'
    }}>
      <div style={{
        fontSize: '10px',
        color: 'var(--text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        marginBottom: '4px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px'
      }}>
        {icon}
        {label}
      </div>
      <div style={{
        fontSize: large ? '20px' : '13px',
        fontWeight: large ? 700 : 600,
        color: valueColor || 'var(--text)',
        fontFamily: mono ? 'monospace' : 'inherit'
      }}>
        {value}
        {valueSuffix && (
          <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)', marginLeft: '2px' }}>
            {valueSuffix}
          </span>
        )}
      </div>
      {subValue && (
        <div style={{
          fontSize: large ? '10px' : '11px',
          color: 'var(--text-secondary)',
          marginTop: '2px'
        }}>
          {subValue}
        </div>
      )}
    </div>
  )
}

// Navigation Button Component
interface NavButtonProps {
  direction: 'prev' | 'next'
  disabled: boolean
  onClick: () => void
}

function NavButton({ direction, disabled, onClick }: NavButtonProps) {
  const Icon = direction === 'prev' ? ChevronLeft : ChevronRight
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '6px 10px',
        borderRadius: '6px',
        fontSize: '12px',
        fontWeight: 500,
        background: 'transparent',
        color: disabled ? 'var(--text-secondary)' : 'var(--text)',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        transition: 'all 0.15s'
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = 'var(--panel-3)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
      title={direction === 'prev' ? 'Previous (older) result' : 'Next (newer) result'}
    >
      <Icon size={14} />
    </button>
  )
}

// Helper to format generation mode for display
function formatGenerationMode(mode?: 'default' | 'thinking' | 'json' | 'code'): string {
  switch (mode) {
    case 'thinking': return 'Extended Thinking'
    case 'json': return 'JSON Output'
    case 'code': return 'Code Generation'
    case 'default':
    default: return 'Default'
  }
}

// Metadata Tab Component
interface MetadataTabProps {
  result: ExecutionResult
  isDark: boolean
}

function MetadataTab({ result, isDark }: MetadataTabProps) {
  // Calculate cost per token for display
  const costPerInputToken = result.metadata?.tokensUsed?.input && result.metadata?.estimatedCost
    ? (result.metadata.estimatedCost * 0.3 / result.metadata.tokensUsed.input * 1000000).toFixed(2)
    : null
  const costPerOutputToken = result.metadata?.tokensUsed?.output && result.metadata?.estimatedCost
    ? (result.metadata.estimatedCost * 0.7 / result.metadata.tokensUsed.output * 1000000).toFixed(2)
    : null

  return (
    <div style={{
      flex: 1,
      overflow: 'auto',
      padding: '24px'
    }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        {/* Cost & Usage Summary - Featured at top */}
        {(result.metadata?.estimatedCost !== undefined && result.metadata.estimatedCost > 0) || result.metadata?.tokensUsed ? (
          <div style={{
            background: isDark
              ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(6, 95, 70, 0.1) 100%)'
              : 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(16, 185, 129, 0.05) 100%)',
            borderRadius: '16px',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            padding: '24px',
            marginBottom: '24px',
            boxShadow: isDark
              ? '0 4px 20px rgba(16, 185, 129, 0.1)'
              : '0 4px 20px rgba(16, 185, 129, 0.08)'
          }}>
            {/* Main cost display */}
            {result.metadata?.estimatedCost !== undefined && result.metadata.estimatedCost > 0 && (
              <div style={{ textAlign: 'center', marginBottom: result.metadata?.tokensUsed ? '20px' : 0 }}>
                <div style={{
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  color: '#10b981',
                  fontWeight: 600,
                  marginBottom: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}>
                  <DollarSign size={14} />
                  Estimated Cost
                </div>
                <div style={{
                  fontSize: '42px',
                  fontWeight: 700,
                  color: '#10b981',
                  lineHeight: 1,
                  fontFamily: 'system-ui, -apple-system, sans-serif'
                }}>
                  ${result.metadata.estimatedCost.toFixed(6)}
                </div>
                <div style={{
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  marginTop: '8px'
                }}>
                  {result.metadata.model} via {result.metadata.provider}
                </div>
              </div>
            )}

            {/* Token breakdown */}
            {result.metadata?.tokensUsed && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '12px',
                paddingTop: result.metadata?.estimatedCost ? '20px' : 0,
                borderTop: result.metadata?.estimatedCost ? '1px solid rgba(16, 185, 129, 0.2)' : 'none'
              }}>
                <div style={{
                  background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.6)',
                  borderRadius: '10px',
                  padding: '14px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                    Input
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)' }}>
                    {result.metadata.tokensUsed.input.toLocaleString()}
                  </div>
                  {costPerInputToken && (
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      ~${costPerInputToken}/M
                    </div>
                  )}
                </div>
                <div style={{
                  background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.6)',
                  borderRadius: '10px',
                  padding: '14px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                    Output
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)' }}>
                    {result.metadata.tokensUsed.output.toLocaleString()}
                  </div>
                  {costPerOutputToken && (
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      ~${costPerOutputToken}/M
                    </div>
                  )}
                </div>
                <div style={{
                  background: 'rgba(16, 185, 129, 0.15)',
                  borderRadius: '10px',
                  padding: '14px',
                  textAlign: 'center',
                  border: '1px solid rgba(16, 185, 129, 0.3)'
                }}>
                  <div style={{ fontSize: '10px', color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', fontWeight: 600 }}>
                    Total
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: '#10b981' }}>
                    {result.metadata.tokensUsed.total.toLocaleString()}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    tokens
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Execution Info */}
        <MetadataSection
          icon={<Info size={16} style={{ color: 'var(--accent)' }} />}
          title="Execution Details"
        >
          <MetadataList
            items={[
              { label: 'Timestamp', value: new Date(result.timestamp).toLocaleString() },
              { label: 'Status', value: result.status },
              { label: 'Provider', value: result.metadata?.provider || 'N/A' },
              { label: 'Model', value: result.metadata?.model || 'N/A', mono: true },
              { label: 'Duration', value: result.metadata?.duration ? `${(result.metadata.duration / 1000).toFixed(3)}s` : 'N/A' },
              { label: 'Execution Mode', value: result.metadata?.executionMode === 'local' ? 'Local (Electron)' : result.metadata?.executionMode === 'remote' ? 'Remote (Backend)' : 'N/A' }
            ]}
            isDark={isDark}
          />
        </MetadataSection>

        {/* Generation Settings */}
        <MetadataSection
          icon={<Settings size={16} style={{ color: '#8b5cf6' }} />}
          title="Generation Settings"
        >
          <MetadataList
            items={[
              { label: 'Mode', value: formatGenerationMode(result.metadata?.mode) },
              { label: 'Max Tokens', value: result.metadata?.maxTokens?.toLocaleString() || '4,096' },
              { label: 'Temperature', value: result.metadata?.temperature?.toFixed(2) || '0.70' }
            ]}
            isDark={isDark}
          />
        </MetadataSection>

        {/* Compiled Prompt Metadata */}
        {result.compiledPrompt && typeof result.compiledPrompt === 'object' && result.compiledPrompt.metadata && (
          <MetadataSection
            icon={<Sparkles size={16} style={{ color: 'var(--accent)' }} />}
            title="Prompt Metadata"
          >
            <MetadataList
              items={[
                { label: 'Package', value: result.compiledPrompt.metadata.packageName || 'N/A' },
                { label: 'Version', value: result.compiledPrompt.metadata.packageVersion || 'N/A' },
                { label: 'Compiled At', value: result.compiledPrompt.metadata.compiledAt ? new Date(result.compiledPrompt.metadata.compiledAt).toLocaleString() : 'N/A' },
                { label: 'Compiler', value: result.compiledPrompt.metadata.compiler || 'N/A' }
              ]}
              isDark={isDark}
            />
          </MetadataSection>
        )}
      </div>
    </div>
  )
}

// Metadata Section Component
interface MetadataSectionProps {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}

function MetadataSection({ icon, title, children }: MetadataSectionProps) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <h3 style={{
        fontSize: '14px',
        fontWeight: 600,
        color: 'var(--text)',
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        {icon}
        {title}
      </h3>
      {children}
    </div>
  )
}

// Metadata List Component
interface MetadataListItem {
  label: string
  value: string
  mono?: boolean
  highlight?: boolean
  highlightColor?: string
}

interface MetadataListProps {
  items: MetadataListItem[]
  isDark: boolean
}

function MetadataList({ items, isDark }: MetadataListProps) {
  return (
    <div style={{
      background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
      borderRadius: '10px',
      border: '1px solid var(--border)',
      overflow: 'hidden'
    }}>
      {items.map((item, idx) => (
        <div
          key={item.label}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            borderBottom: idx < items.length - 1 ? '1px solid var(--border)' : 'none',
            background: item.highlight
              ? (isDark ? `${item.highlightColor}15` : `${item.highlightColor}08`)
              : 'transparent'
          }}
        >
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{item.label}</span>
          <span style={{
            fontSize: '13px',
            fontWeight: item.highlight ? 700 : 500,
            color: item.highlight ? item.highlightColor : 'var(--text)',
            fontFamily: item.mono ? 'monospace' : 'inherit'
          }}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  )
}

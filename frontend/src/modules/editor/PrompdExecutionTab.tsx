import { useState, useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  type PrompdParameter,
  validateRequiredParameters
} from '@prompd/react'
import {
  Play,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Copy,
  ChevronDown,
  ChevronRight
} from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'
import { useAuthenticatedUser } from '../auth/ClerkWrapper'
import { ExecutionResultModal, type ExecutionResult } from './ExecutionResultModal'
import { GenerationControls, type GenerationMode } from '../components/GenerationControls'
import { CompiledPreview } from './CompiledPreview'

// Re-export GenerationMode for external consumers
export type { GenerationMode }

export interface ExecutionConfig {
  sourceTabId?: string  // ID of source tab for live syncing
  prompdSource: {
    type: 'package' | 'generated' | 'file'
    packageRef?: string  // "@prompd/math@1.0.0/quadratic.prmd"
    content: string      // Full .prmd file content
    originalParams: PrompdParameter[]
    filePath?: string    // Source file path for inheritance resolution
  }
  parameters: Record<string, unknown>
  customParameters: PrompdParameter[]
  sections: {
    system?: { type: 'text' | 'file', content: string, filePath?: string, workspacePath?: string }
    user?: { type: 'text' | 'file', content: string, filePath?: string, workspacePath?: string }
    context?: Array<{ type: 'text' | 'file', content: string, filePath?: string, workspacePath?: string }>  // MULTIPLE FILES
    assistant?: { type: 'text' | 'file', content: string, filePath?: string, workspacePath?: string }
    task?: { type: 'text' | 'file', content: string, filePath?: string, workspacePath?: string }
    output?: { type: 'text' | 'file', content: string, filePath?: string, workspacePath?: string }
    response?: { type: 'text' | 'file', content: string, filePath?: string, workspacePath?: string }
  }
  provider: string
  model: string
  executionHistory: ExecutionResult[]
  // Generation controls
  maxTokens?: number      // Max tokens to generate (default: 4096)
  temperature?: number    // Temperature 0-2 (default: 0.7)
  mode?: GenerationMode   // Generation mode (default: 'default')
  // Workspace context for package resolution
  workspacePath?: string  // Root workspace path
}

// ExecutionResult is imported from ExecutionResultModal

interface PrompdExecutionTabProps {
  config: ExecutionConfig
  theme: 'vs-dark' | 'light'
  onConfigChange: (config: Partial<ExecutionConfig>) => void
  onExecute: () => Promise<void>
  onSave: () => Promise<void>
  isExecuting?: boolean
  hasFolder?: boolean
  onSelectFileFromBrowser?: (sectionName: string) => Promise<string | null>
}

export function PrompdExecutionTab({
  config,
  theme,
  onConfigChange,
  onExecute,
  onSave,
  isExecuting = false,
  hasFolder = false,
  onSelectFileFromBrowser
}: PrompdExecutionTabProps) {
  const [showExecutionResult, setShowExecutionResult] = useState(false)
  const [viewedResults, setViewedResults] = useState<Set<string>>(new Set())
  const [selectedResultIndex, setSelectedResultIndex] = useState(0)
  const [historyExpanded, setHistoryExpanded] = useState(false)

  // Validate required parameters for execute button
  const { isParamsValid, missingParams } = useMemo(() => {
    const params = config.prompdSource.originalParams
    if (params.length === 0) return { isParamsValid: true, missingParams: [] as string[] }
    const result = validateRequiredParameters(params, config.parameters)
    return { isParamsValid: result.isValid, missingParams: result.missingRequired }
  }, [config.prompdSource.originalParams, config.parameters])

  // Auth and LLM provider state
  const { getToken, isLoaded, isAuthenticated } = useAuthenticatedUser()
  const { llmProvider, setLLMProvider, setLLMModel, initializeLLMProviders } = useUIStore(
    useShallow(state => ({
      llmProvider: state.llmProvider,
      setLLMProvider: state.setLLMProvider,
      setLLMModel: state.setLLMModel,
      initializeLLMProviders: state.initializeLLMProviders
    }))
  )

  // Initialize LLM providers when authenticated
  useEffect(() => {
    if (isLoaded && isAuthenticated && !llmProvider.isInitialized) {
      initializeLLMProviders(getToken)
    }
  }, [isLoaded, isAuthenticated, llmProvider.isInitialized])

  // Sync provider/model from config or use global state
  useEffect(() => {
    if (config.provider && config.provider !== llmProvider.provider) {
      // Config has a different provider, update global state
      setLLMProvider(config.provider)
    }
    if (config.model && config.model !== llmProvider.model) {
      setLLMModel(config.model)
    }
  }, [config.provider, config.model])

  // Calculate execution statistics
  const executionStats = useMemo(() => {
    if (config.executionHistory.length === 0) {
      return null
    }

    const successCount = config.executionHistory.filter(r => r.status === 'success').length
    const totalDuration = config.executionHistory.reduce((sum, r) => sum + (r.metadata?.duration || 0), 0)
    const totalTokens = config.executionHistory.reduce((sum, r) =>
      sum + (r.metadata?.tokensUsed?.total || 0), 0
    )
    const avgDuration = totalDuration / config.executionHistory.length

    return {
      total: config.executionHistory.length,
      successful: successCount,
      failed: config.executionHistory.length - successCount,
      successRate: ((successCount / config.executionHistory.length) * 100).toFixed(1),
      avgDuration: (avgDuration / 1000).toFixed(2),
      totalTokens: totalTokens.toLocaleString()
    }
  }, [config.executionHistory])

  // Handle file upload for context sections (stores content for execution)
  const handleFileUpload = async (sectionName: string, files: File[]): Promise<string[]> => {
    const fileResults: Array<{ name: string; content: string }> = []
    for (const file of files) {
      const content = await file.text()
      fileResults.push({ name: file.name, content })
    }

    // Store file content in config.sections for execution
    const newSections = { ...config.sections }
    for (const { name, content } of fileResults) {
      if (sectionName === 'context') {
        newSections.context = [...(newSections.context || []), { type: 'file' as const, content, filePath: name }]
      } else {
        const key = sectionName as keyof Omit<typeof config.sections, 'context'>
        newSections[key] = { type: 'file' as const, content, filePath: name }
      }
    }
    onConfigChange({ sections: newSections })

    return fileResults.map(f => f.name)
  }

  // Handle file selection from browser for context sections
  const handleSelectFromBrowser = async (sectionName: string): Promise<string | null> => {
    if (!onSelectFileFromBrowser) return null
    const filePath = await onSelectFileFromBrowser(sectionName)
    if (!filePath) return null

    // Store in config.sections for execution
    const newSections = { ...config.sections }
    if (sectionName === 'context') {
      newSections.context = [...(newSections.context || []), { type: 'file' as const, content: '', filePath }]
    } else {
      const key = sectionName as keyof Omit<typeof config.sections, 'context'>
      newSections[key] = { type: 'file' as const, content: '', filePath }
    }
    onConfigChange({ sections: newSections })

    return filePath
  }

  const handleCopyCompiledPrompt = () => {
    const latestResult = config.executionHistory[0]
    if (latestResult?.compiledPrompt) {
      const text = typeof latestResult.compiledPrompt === 'string'
        ? latestResult.compiledPrompt
        : latestResult.compiledPrompt.finalPrompt || ''
      navigator.clipboard.writeText(text)
    }
  }

  // Get the selected result (or latest if none selected / index out of bounds)
  const selectedResult = config.executionHistory[selectedResultIndex] || config.executionHistory[0]

  return (
    <>
      <style>{`
        @keyframes flash-in {
          0% {
            opacity: 0;
            transform: translateY(-10px) scale(0.95);
          }
          50% {
            opacity: 1;
            transform: translateY(0) scale(1.02);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--panel)',
          overflow: 'hidden'
        }}
      >
        {/* Header - fixed */}
        <div style={{ flexShrink: 0, padding: '16px 24px 0' }}>
          <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px' }}>
                <h2 style={{ margin: 0, fontSize: '20px', color: 'var(--text)' }}>
                  Execute Prompd
                </h2>
                {config.prompdSource.packageRef && (
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                    {config.prompdSource.packageRef}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <GenerationControls
                  maxTokens={config.maxTokens ?? 4096}
                  temperature={Math.min(1, config.temperature ?? 0.7)}
                  mode={config.mode ?? 'default'}
                  onMaxTokensChange={(value) => onConfigChange({ maxTokens: value })}
                  onTemperatureChange={(value) => onConfigChange({ temperature: Math.min(1, Math.max(0, value)) })}
                  onModeChange={(mode) => onConfigChange({ mode })}
                  theme={theme}
                  provider={config.provider}
                />

                <button
                  onClick={onExecute}
                  disabled={isExecuting || !isParamsValid}
                  title={!isParamsValid ? `Missing required: ${missingParams.join(', ')}` : 'Execute prompt'}
                  style={{
                    padding: '10px 24px',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: 600,
                    background: (isExecuting || !isParamsValid) ? '#9ca3af' : '#4f46e5',
                    color: 'white',
                    border: 'none',
                    cursor: (isExecuting || !isParamsValid) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    opacity: (isExecuting || !isParamsValid) ? 0.7 : 1,
                    transition: 'all 0.2s',
                    boxShadow: (isExecuting || !isParamsValid) ? 'none' : '0 2px 8px rgba(79, 70, 229, 0.3)'
                  }}
                  onMouseEnter={(e) => {
                    if (!isExecuting && isParamsValid) {
                      e.currentTarget.style.background = '#6366f1'
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(79, 70, 229, 0.4)'
                      e.currentTarget.style.transform = 'translateY(-1px)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isExecuting && isParamsValid) {
                      e.currentTarget.style.background = '#4f46e5'
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(79, 70, 229, 0.3)'
                      e.currentTarget.style.transform = 'translateY(0)'
                    }
                  }}
                >
                  {isExecuting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Executing...
                    </>
                  ) : (
                    <>
                      <Play size={16} />
                      Execute
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Validation Banner */}
            {!isParamsValid && missingParams.length > 0 && (
              <div style={{
                padding: '10px 16px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid #ef4444',
                borderRadius: '6px',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '13px',
                color: '#ef4444'
              }}>
                <XCircle size={16} />
                <span>Missing required parameters: {missingParams.join(', ')}</span>
              </div>
            )}

            {/* Execution History - Collapsible */}
            {config.executionHistory.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: historyExpanded ? '8px' : '0'
                }}>
                  <button
                    onClick={() => setHistoryExpanded(!historyExpanded)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '2px 0'
                    }}
                  >
                    {historyExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <Clock size={14} />
                    <span>History</span>
                    <span style={{ fontWeight: 400, fontSize: '12px' }}>
                      ({config.executionHistory.length})
                    </span>
                    {/* Inline summary when collapsed */}
                    {!historyExpanded && executionStats && (
                      <span style={{ fontWeight: 400, fontSize: '11px', color: 'var(--text-secondary)', marginLeft: '4px' }}>
                        {executionStats.successRate}% success, avg {executionStats.avgDuration}s
                      </span>
                    )}
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {config.executionHistory[0]?.compiledPrompt && (
                      <button
                        onClick={handleCopyCompiledPrompt}
                        style={{
                          padding: '4px 10px',
                          fontSize: '11px',
                          fontWeight: 500,
                          background: 'transparent',
                          color: 'var(--text-secondary)',
                          border: '1px solid var(--border)',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          transition: 'all 0.15s'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--text)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                        title="Copy latest compiled prompt"
                      >
                        <Copy size={12} />
                        Copy
                      </button>
                    )}
                  </div>
                </div>

                {/* Collapsed: compact inline chips */}
                {!historyExpanded && (
                  <div style={{
                    display: 'flex',
                    gap: '4px',
                    flexWrap: 'wrap',
                    marginTop: '6px'
                  }}>
                    {config.executionHistory.slice(0, 8).map((result, idx) => {
                      const isNew = idx === 0 && !viewedResults.has(result.timestamp)
                      return (
                        <button
                          key={result.timestamp}
                          onClick={() => {
                            setSelectedResultIndex(idx)
                            setShowExecutionResult(true)
                            setViewedResults(prev => new Set(prev).add(result.timestamp))
                          }}
                          style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            background: isNew ? 'rgba(59, 130, 246, 0.1)' : 'var(--panel-2)',
                            border: isNew ? '1px solid var(--accent)' : '1px solid var(--border)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            color: 'var(--text-secondary)',
                            transition: 'all 0.15s'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = isNew ? 'var(--accent)' : 'var(--border)' }}
                          title={`${result.status === 'success' ? 'Success' : 'Failed'} - ${new Date(result.timestamp).toLocaleTimeString()}`}
                        >
                          {result.status === 'success' ? (
                            <CheckCircle size={10} style={{ color: '#22c55e' }} />
                          ) : (
                            <XCircle size={10} style={{ color: '#ef4444' }} />
                          )}
                          <span>{new Date(result.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </button>
                      )
                    })}
                    {config.executionHistory.length > 8 && (
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', padding: '3px 4px' }}>
                        +{config.executionHistory.length - 8} more
                      </span>
                    )}
                  </div>
                )}

                {/* Expanded: full horizontal scrollable cards */}
                {historyExpanded && (
                  <>
                    {/* Stats row */}
                    {executionStats && (
                      <div style={{
                        display: 'flex',
                        gap: '16px',
                        marginBottom: '8px',
                        fontSize: '12px',
                        color: 'var(--text-secondary)'
                      }}>
                        <span>{executionStats.total} runs</span>
                        <span style={{ color: '#22c55e' }}>{executionStats.successRate}% success</span>
                        <span>avg {executionStats.avgDuration}s</span>
                        <span>{executionStats.totalTokens} tokens</span>
                      </div>
                    )}
                    <div style={{
                      display: 'flex',
                      gap: '8px',
                      overflowX: 'auto',
                      paddingBottom: '4px'
                    }}>
                      {config.executionHistory.map((result, idx) => {
                        const isNew = idx === 0 && !viewedResults.has(result.timestamp)
                        return (
                          <button
                            key={result.timestamp}
                            onClick={() => {
                              setSelectedResultIndex(idx)
                              setShowExecutionResult(true)
                              setViewedResults(prev => new Set(prev).add(result.timestamp))
                            }}
                            style={{
                              flex: '0 0 auto',
                              textAlign: 'left',
                              padding: '8px 12px',
                              borderRadius: '6px',
                              background: isNew ? 'rgba(59, 130, 246, 0.08)' : 'var(--panel-2)',
                              border: isNew ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                              cursor: 'pointer',
                              transition: 'all 0.15s',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              animation: isNew ? 'flash-in 0.4s ease-out' : 'none',
                              minWidth: '180px'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'var(--panel-3)'
                              if (!isNew) e.currentTarget.style.borderColor = 'var(--accent)'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = isNew ? 'rgba(59, 130, 246, 0.08)' : 'var(--panel-2)'
                              if (!isNew) e.currentTarget.style.borderColor = 'var(--border)'
                            }}
                          >
                            {result.status === 'success' ? (
                              <CheckCircle size={14} style={{ color: '#22c55e', flexShrink: 0 }} />
                            ) : (
                              <XCircle size={14} style={{ color: '#ef4444', flexShrink: 0 }} />
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                              <span style={{ fontSize: '12px', color: 'var(--text)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                                {new Date(result.timestamp).toLocaleTimeString()}
                              </span>
                              <div style={{ display: 'flex', gap: '6px', fontSize: '10px', color: 'var(--text-secondary)' }}>
                                {result.metadata?.model && (
                                  <span style={{ fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }}>
                                    {result.metadata.model}
                                  </span>
                                )}
                                {result.metadata?.duration && (
                                  <span style={{ whiteSpace: 'nowrap' }}>
                                    {(result.metadata.duration / 1000).toFixed(1)}s
                                  </span>
                                )}
                              </div>
                            </div>
                            {isNew && (
                              <span style={{
                                fontSize: '9px',
                                fontWeight: 700,
                                color: 'var(--accent)',
                                padding: '1px 5px',
                                background: 'rgba(59, 130, 246, 0.15)',
                                borderRadius: '3px',
                                flexShrink: 0,
                                letterSpacing: '0.5px'
                              }}>
                                NEW
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Compiled Preview - fills remaining space */}
        <div style={{
          flex: 1,
          minHeight: 0,
          padding: '0 24px 24px',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            maxWidth: '1400px',
            margin: '0 auto',
            width: '100%',
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div
              style={{
                borderRadius: '8px',
                border: '1px solid var(--border)',
                overflow: 'hidden',
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <CompiledPreview
                content={config.prompdSource.content}
                parameters={config.parameters}
                onParametersChange={(params) => onConfigChange({ parameters: params })}
                theme={theme === 'vs-dark' ? 'dark' : 'light'}
                height="100%"
                showMeta={true}
                showParameters={true}
                showContextSections={true}
                onContextSectionsChange={(updatedContent) => {
                  onConfigChange({
                    prompdSource: {
                      ...config.prompdSource,
                      content: updatedContent
                    }
                  })
                }}
                onFileUpload={handleFileUpload}
                onSelectFromBrowser={onSelectFileFromBrowser ? handleSelectFromBrowser : undefined}
                hasFolderOpen={hasFolder}
                filePath={config.prompdSource.filePath || null}
                workspacePath={config.workspacePath || null}
              />
            </div>
          </div>
        </div>

        {/* Execution Result Modal */}
        {showExecutionResult && selectedResult && (
          <ExecutionResultModal
            result={selectedResult}
            executionHistory={config.executionHistory}
            selectedIndex={selectedResultIndex}
            onSelectIndex={setSelectedResultIndex}
            theme={theme}
            onClose={() => setShowExecutionResult(false)}
            onRunAgain={onExecute}
          />
        )}
      </div>
    </>
  )
}

import { useState, useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import Editor from '@monaco-editor/react'
import {
  PrompdParameterList,
  PrompdContextArea,
  type PrompdParameter,
  type PrompdFileSection,
  type PrompdFileSections
} from '@prompd/react'
import { Play, Loader2, ChevronDown, ChevronRight, Sparkles, CheckCircle, XCircle, Clock } from 'lucide-react'
import { yamlEditorOptions, readOnlyEditorOptions, getMonacoTheme, registerPrompdThemes } from '../lib/monacoConfig'
import { useUIStore } from '../../stores/uiStore'
import { useAuthenticatedUser } from '../auth/ClerkWrapper'
import { ExecutionResultModal, type ExecutionResult } from './ExecutionResultModal'
import { GenerationControls, type GenerationMode } from '../components/GenerationControls'

// Re-export GenerationMode for external consumers
export type { GenerationMode }

export interface ExecutionConfig {
  sourceTabId?: string  // ID of source tab for live syncing
  prompdSource: {
    type: 'package' | 'generated' | 'file'
    packageRef?: string  // "@prompd/math@1.0.0/quadratic.prmd"
    content: string      // Full .prmd file content
    originalParams: PrompdParameter[]
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
  const [showPromptContent, setShowPromptContent] = useState(false)
  const [showExecutionResult, setShowExecutionResult] = useState(false)
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [viewedResults, setViewedResults] = useState<Set<string>>(new Set())
  const [selectedResultIndex, setSelectedResultIndex] = useState(0) // Track which result to display
  const [isParamsValid, setIsParamsValid] = useState(true)
  const [missingParams, setMissingParams] = useState<string[]>([])

  // Callback for parameter validation state changes
  const handleValidationChange = (isValid: boolean, missing: string[]) => {
    setIsParamsValid(isValid)
    setMissingParams(missing)
  }

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

  // All parameters (original + custom)
  const allParameters: PrompdParameter[] = [
    ...config.prompdSource.originalParams,
    ...config.customParameters
  ]

  // File sections configuration
  const fileSections: PrompdFileSection[] = [
    {
      name: 'system',
      label: 'System',
      files: config.sections.system ? [config.sections.system.filePath || config.sections.system.content] : [],
      allowMultiple: false,
      accept: '.prmd,.txt,.md',
      description: 'System instructions and configuration'
    },
    {
      name: 'user',
      label: 'User',
      files: config.sections.user ? [config.sections.user.filePath || config.sections.user.content] : [],
      allowMultiple: false,
      accept: '*/*',
      description: 'User prompt or primary input'
    },
    {
      name: 'task',
      label: 'Task',
      files: config.sections.task ? [config.sections.task.filePath || config.sections.task.content] : [],
      allowMultiple: false,
      accept: '.prmd,.txt,.md',
      description: 'Task-specific instructions'
    },
    {
      name: 'output',
      label: 'Output',
      files: config.sections.output ? [config.sections.output.filePath || config.sections.output.content] : [],
      allowMultiple: false,
      accept: '.prmd,.txt,.md',
      description: 'Output format specifications'
    },
    {
      name: 'response',
      label: 'Response',
      files: config.sections.response ? [config.sections.response.filePath || config.sections.response.content] : [],
      allowMultiple: false,
      accept: '.prmd,.txt,.md',
      description: 'Response format and structure'
    },
    {
      name: 'context',
      label: 'Context',
      files: config.sections.context?.map(c => c.filePath || c.content) || [],
      allowMultiple: true,  // ONLY ONE WITH MULTIPLE
      accept: '*/*',
      description: 'Background information and reference files'
    },
    {
      name: 'assistant',
      label: 'Assistant',
      files: config.sections.assistant ? [config.sections.assistant.filePath || config.sections.assistant.content] : [],
      allowMultiple: false,
      accept: '.prmd,.txt,.md',
      description: 'Assistant behavior overrides'
    }
  ]

  // Convert config sections to PrompdFileSections Map
  const fileSectionsValue: PrompdFileSections = new Map()
  if (config.sections.system) {
    fileSectionsValue.set('system', [config.sections.system.filePath || config.sections.system.content])
  }
  if (config.sections.user) {
    fileSectionsValue.set('user', [config.sections.user.filePath || config.sections.user.content])
  }
  if (config.sections.context) {
    fileSectionsValue.set('context', config.sections.context.map(c => c.filePath || c.content))
  }
  if (config.sections.assistant) {
    fileSectionsValue.set('assistant', [config.sections.assistant.filePath || config.sections.assistant.content])
  }
  if (config.sections.task) {
    fileSectionsValue.set('task', [config.sections.task.filePath || config.sections.task.content])
  }
  if (config.sections.output) {
    fileSectionsValue.set('output', [config.sections.output.filePath || config.sections.output.content])
  }
  if (config.sections.response) {
    fileSectionsValue.set('response', [config.sections.response.filePath || config.sections.response.content])
  }

  const handleParameterChange = (paramName: string, value: unknown) => {
    onConfigChange({
      parameters: {
        ...config.parameters,
        [paramName]: value
      }
    })
  }

  const handleAddParameter = (param: PrompdParameter) => {
    onConfigChange({
      customParameters: [...config.customParameters, param]
    })
  }

  const handleFileSectionsChange = (sections: PrompdFileSections) => {
    const newSections: typeof config.sections = {}

    // Convert Map back to our ExecutionConfig format
    sections.forEach((files, sectionName) => {
      if (sectionName === 'context') {
        newSections.context = files.map(f => ({ type: 'file', content: f, filePath: f }))
      } else {
        if (files.length > 0) {
          const key = sectionName as keyof Omit<typeof config.sections, 'context'>
          newSections[key] = {
            type: 'file',
            content: files[0],
            filePath: files[0]
          }
        }
      }
    })

    onConfigChange({ sections: newSections })
  }

  const handleFileUpload = async (sectionName: string, files: File[]): Promise<string[]> => {
    // Read file contents and update config
    const filePaths: string[] = []

    for (const file of files) {
      const content = await file.text()
      filePaths.push(file.name)

      // Store file content in config
      if (sectionName === 'context') {
        onConfigChange({
          sections: {
            ...config.sections,
            context: [...(config.sections.context || []), { type: 'file', content, filePath: file.name }]
          }
        })
      } else {
        onConfigChange({
          sections: {
            ...config.sections,
            [sectionName]: { type: 'file', content, filePath: file.name }
          }
        })
      }
    }

    return filePaths
  }

  const handleSelectFromBrowser = async (sectionName: string) => {
    // Set this section as active to show visual feedback
    setActiveSection(sectionName)

    if (onSelectFileFromBrowser) {
      try {
        const filePath = await onSelectFileFromBrowser(sectionName)

        if (filePath) {
          // File was selected - update config
          if (sectionName === 'context') {
            onConfigChange({
              sections: {
                ...config.sections,
                context: [...(config.sections.context || []), { type: 'file', content: '', filePath }]
              }
            })
          } else {
            onConfigChange({
              sections: {
                ...config.sections,
                [sectionName]: { type: 'file', content: '', filePath }
              }
            })
          }
        }
      } finally {
        setActiveSection(null)
      }
    }
  }

  // Get the selected result (or latest if none selected / index out of bounds)
  const selectedResult = config.executionHistory[selectedResultIndex] || config.executionHistory[0]

  // Debug logging
  if (selectedResult) {
    console.log('[PrompdExecutionTab] Selected result (index ' + selectedResultIndex + '):', {
      hasCompiledPrompt: !!selectedResult.compiledPrompt,
      compiledPromptType: typeof selectedResult.compiledPrompt,
      compiledPromptKeys: selectedResult.compiledPrompt && typeof selectedResult.compiledPrompt === 'object' ? Object.keys(selectedResult.compiledPrompt) : [],
      hasFinalPrompt: selectedResult.compiledPrompt && typeof selectedResult.compiledPrompt === 'object' && 'finalPrompt' in selectedResult.compiledPrompt,
      finalPromptLength: selectedResult.compiledPrompt && typeof selectedResult.compiledPrompt === 'object' && 'finalPrompt' in selectedResult.compiledPrompt ? selectedResult.compiledPrompt.finalPrompt.length : 0,
      finalPromptPreview: selectedResult.compiledPrompt && typeof selectedResult.compiledPrompt === 'object' && 'finalPrompt' in selectedResult.compiledPrompt ? selectedResult.compiledPrompt.finalPrompt.substring(0, 200) : ''
    })
  }

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
          overflow: 'auto',
          background: 'var(--panel)',
          padding: '24px'
        }}
      >
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
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
            {/* Generation Controls */}
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

            {/* Execute Button */}
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

        {/* Execution History */}
        {config.executionHistory.length > 0 && (
          <div
            style={{
              padding: '20px',
              background: 'var(--panel-2)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              marginBottom: '24px'
            }}
          >
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={16} style={{ color: 'var(--accent)' }} />
              <span>Execution History</span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 400, marginLeft: '4px' }}>
                {config.executionHistory.length} execution{config.executionHistory.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div style={{ display: 'grid', gap: '8px' }}>
              {config.executionHistory.map((result, idx) => {
                const isNew = idx === 0 && !viewedResults.has(result.timestamp)
                return (
                  <button
                    key={result.timestamp}
                    onClick={() => {
                      setSelectedResultIndex(idx) // Set which result to display
                      setShowExecutionResult(true)
                      setViewedResults(prev => new Set(prev).add(result.timestamp))
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '12px',
                      borderRadius: '6px',
                      background: 'var(--panel)',
                      border: isNew ? '2px solid var(--accent)' : '1px solid var(--border)',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      animation: isNew ? 'flash-in 0.6s ease-out' : 'none',
                      boxShadow: isNew ? '0 0 20px rgba(59, 130, 246, 0.3)' : 'none'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--panel-3)'
                      if (!isNew) {
                        e.currentTarget.style.borderColor = 'var(--accent)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--panel)'
                      if (!isNew) {
                        e.currentTarget.style.borderColor = 'var(--border)'
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {result.status === 'success' ? (
                        <CheckCircle size={16} style={{ color: '#22c55e' }} />
                      ) : (
                        <XCircle size={16} style={{ color: '#ef4444' }} />
                      )}
                      <span style={{ fontSize: '13px', color: 'var(--text)' }}>
                        {new Date(result.timestamp).toLocaleString()}
                      </span>
                      {isNew && (
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: 'var(--accent)',
                          padding: '2px 8px',
                          background: 'rgba(59, 130, 246, 0.1)',
                          borderRadius: '4px'
                        }}>
                          NEW
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {result.metadata?.provider && (
                        <span style={{ fontWeight: 500 }}>{result.metadata.provider}</span>
                      )}
                      {result.metadata?.model && (
                        <span style={{ fontFamily: 'monospace', padding: '3px 8px', background: 'var(--panel-2)', borderRadius: '4px' }}>
                          {result.metadata.model}
                        </span>
                      )}
                      {result.metadata?.duration && (
                        <span style={{ padding: '3px 8px', background: 'var(--panel-2)', borderRadius: '4px' }}>
                          {(result.metadata.duration / 1000).toFixed(2)}s
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Source Prompd Section */}
        <div
          style={{
            padding: '20px',
            background: 'var(--panel-2)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            marginBottom: '24px'
          }}
        >
          <button
            onClick={() => setShowPromptContent(!showPromptContent)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              marginBottom: showPromptContent ? '16px' : 0
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
              {showPromptContent ? (
                <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />
              ) : (
                <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
              )}
              <Sparkles size={16} style={{ color: 'var(--accent)' }} />
              <span>Source Prompd</span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 400, marginLeft: '4px' }}>
                ({config.prompdSource.type})
              </span>
            </div>
          </button>
          {showPromptContent && (
            <div
              style={{
                height: '300px',
                overflow: 'hidden',
                borderRadius: '6px',
                border: '1px solid var(--border)'
              }}
            >
              <Editor
                value={config.prompdSource.content}
                language="yaml"
                theme={getMonacoTheme(theme === 'vs-dark')}
                beforeMount={registerPrompdThemes}
                options={{
                  ...yamlEditorOptions,
                  ...readOnlyEditorOptions
                }}
              />
            </div>
          )}
        </div>

        {/* Parameters Section */}
        <div
          style={{
            padding: '20px',
            background: 'var(--panel-2)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            marginBottom: '24px'
          }}
        >
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={16} style={{ color: 'var(--accent)' }} />
            <span>Parameters</span>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 400, marginLeft: '4px' }}>
              {allParameters.length} parameter{allParameters.length !== 1 ? 's' : ''}
            </span>
          </div>
          {allParameters.length > 0 ? (
            <PrompdParameterList
              parameters={allParameters}
              values={config.parameters}
              onChange={handleParameterChange}
              onValidationChange={handleValidationChange}
              onAddParameter={handleAddParameter}
              allowCustom={true}
              layout="adaptive"
              columns={2}
            />
          ) : (
            <div style={{
              padding: '24px',
              textAlign: 'center',
              color: 'var(--text-secondary)',
              fontSize: '13px',
              fontStyle: 'italic'
            }}>
              No parameters defined for this prompd
            </div>
          )}
        </div>

        {/* Specialty Sections */}
        <div
          style={{
            padding: '20px',
            background: 'var(--panel-2)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            marginBottom: '24px'
          }}
        >
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={16} style={{ color: 'var(--accent)' }} />
            <span>Specialty Sections</span>
            <span style={{
              fontSize: '12px',
              color: 'var(--text-secondary)',
              fontWeight: 400,
              marginLeft: '4px',
              fontStyle: 'italic'
            }}>
              Override prompt sections with context files
            </span>
          </div>
          <PrompdContextArea
            sections={fileSections}
            value={fileSectionsValue}
            onChange={handleFileSectionsChange}
            onFileUpload={handleFileUpload}
            onSelectFromBrowser={onSelectFileFromBrowser ? handleSelectFromBrowser : undefined}
            hasFolderOpen={hasFolder}
            activeSection={activeSection}
          />
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

import { useState, useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import Editor from '@monaco-editor/react'
import {
  PrompdParameterList,
  PrompdContextArea,
  type PrompdParameter,
  type PrompdFileSection,
  type PrompdFileSections
} from '@prompd/react'
import {
  Play,
  Loader2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  CheckCircle,
  XCircle,
  Clock,
  BarChart3,
  FileText,
  Copy,
  RotateCcw,
  Trash2,
  Download,
  Eye,
  Plus
} from 'lucide-react'
import { yamlEditorOptions, readOnlyEditorOptions, getMonacoTheme, registerPrompdThemes } from '../lib/monacoConfig'
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
  const [showCompiledPreview, setShowCompiledPreview] = useState(false)
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

  // Determine which sections to show
  // Always show at least 3 sections: prioritize sections with files, then fill with defaults
  const visibleSections = useMemo(() => {
    const sectionsWithFiles: string[] = []
    const allSectionNames = ['system', 'user', 'context', 'assistant', 'task', 'output', 'response']

    // Check which sections have files
    if (config.sections.system?.filePath) sectionsWithFiles.push('system')
    if (config.sections.user?.filePath) sectionsWithFiles.push('user')
    if (config.sections.context && config.sections.context.length > 0) sectionsWithFiles.push('context')
    if (config.sections.assistant?.filePath) sectionsWithFiles.push('assistant')
    if (config.sections.task?.filePath) sectionsWithFiles.push('task')
    if (config.sections.output?.filePath) sectionsWithFiles.push('output')
    if (config.sections.response?.filePath) sectionsWithFiles.push('response')

    // Start with sections that have files
    const result = [...sectionsWithFiles]

    // If fewer than 3 sections, add more to reach 3 total
    // Priority order: system, user, context (most common), then others
    const defaultSections = ['system', 'user', 'context']
    for (const section of defaultSections) {
      if (result.length >= 3) break
      if (!result.includes(section)) {
        result.push(section)
      }
    }

    // If still fewer than 3 (edge case), add any remaining sections
    if (result.length < 3) {
      for (const section of allSectionNames) {
        if (result.length >= 3) break
        if (!result.includes(section)) {
          result.push(section)
        }
      }
    }

    return result
  }, [config.sections])

  // File sections configuration - only show visible sections
  const fileSections: PrompdFileSection[] = visibleSections.map(sectionName => {
    const sectionConfigs: Record<string, Omit<PrompdFileSection, 'files' | 'name'>> = {
      system: {
        label: 'System',
        allowMultiple: false,
        accept: '.prmd,.txt,.md',
        description: 'System instructions and configuration'
      },
      user: {
        label: 'User',
        allowMultiple: false,
        accept: '*/*',
        description: 'User prompt or primary input'
      },
      task: {
        label: 'Task',
        allowMultiple: false,
        accept: '.prmd,.txt,.md',
        description: 'Task-specific instructions'
      },
      output: {
        label: 'Output',
        allowMultiple: false,
        accept: '.prmd,.txt,.md',
        description: 'Output format specifications'
      },
      response: {
        label: 'Response',
        allowMultiple: false,
        accept: '.prmd,.txt,.md',
        description: 'Response format and structure'
      },
      context: {
        label: 'Context',
        allowMultiple: true,
        accept: '*/*',
        description: 'Background information and reference files'
      },
      assistant: {
        label: 'Assistant',
        allowMultiple: false,
        accept: '.prmd,.txt,.md',
        description: 'Assistant behavior overrides'
      }
    }

    const sectionConfig = sectionConfigs[sectionName]
    const files = sectionName === 'context'
      ? (config.sections.context?.map(c => c.filePath || c.content) || [])
      : (config.sections[sectionName as keyof typeof config.sections] as any)?.filePath
        ? [(config.sections[sectionName as keyof typeof config.sections] as any).filePath]
        : []

    return {
      name: sectionName,
      files,
      ...sectionConfig
    }
  })

  // Convert config sections to PrompdFileSections Map
  const fileSectionsValue: PrompdFileSections = new Map()
  visibleSections.forEach(sectionName => {
    if (sectionName === 'context' && config.sections.context) {
      fileSectionsValue.set('context', config.sections.context.map(c => c.filePath || c.content))
    } else if (config.sections[sectionName as keyof typeof config.sections]) {
      const section = config.sections[sectionName as keyof typeof config.sections] as any
      if (section && section.filePath) {
        fileSectionsValue.set(sectionName, [section.filePath])
      }
    }
  })

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

  // Helper function to update frontmatter with sections
  const updateFrontmatterSections = (prompdContent: string, sections: typeof config.sections): string => {
    // Parse frontmatter
    const frontmatterMatch = prompdContent.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)

    if (!frontmatterMatch) {
      // No frontmatter, add one (always required by compiler)
      const sectionsYaml = buildSectionsYaml(sections)
      if (sectionsYaml) {
        return `---\n${sectionsYaml}\n---\n${prompdContent}`
      }
      // Even if no sections, add empty frontmatter (required by compiler)
      return `---\n---\n${prompdContent}`
    }

    const [, frontmatterContent, markdownContent] = frontmatterMatch

    // Parse YAML (simple parsing for sections field)
    // Remove existing sections field if present
    const lines = frontmatterContent.split('\n').filter(line => line !== undefined)
    const newLines: string[] = []
    let inSections = false
    let indentLevel = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Detect sections field
      if (line.match(/^sections:/)) {
        inSections = true
        // Calculate indent of next line to know when sections block ends
        const nextLine = lines[i + 1]
        if (nextLine) {
          const match = nextLine.match(/^(\s+)/)
          indentLevel = match ? match[1].length : 0
        }
        continue
      }

      // Skip lines that are part of sections block
      if (inSections) {
        const match = line.match(/^(\s+)/)
        const currentIndent = match ? match[1].length : 0

        // If line has less or equal indent than expected, sections block ended
        if (line.trim() && currentIndent < indentLevel) {
          inSections = false
          newLines.push(line)
        }
        // Otherwise skip this line (it's part of sections)
        continue
      }

      newLines.push(line)
    }

    // Add sections at the end (if any)
    const sectionsYaml = buildSectionsYaml(sections)
    if (sectionsYaml) {
      newLines.push(sectionsYaml)
    }

    // Handle empty frontmatter case
    const frontmatterBody = newLines.filter(line => line.trim()).join('\n')
    if (frontmatterBody) {
      return `---\n${frontmatterBody}\n---\n${markdownContent}`
    } else {
      // Empty frontmatter
      return `---\n---\n${markdownContent}`
    }
  }

  // Helper to build sections YAML
  const buildSectionsYaml = (sections: typeof config.sections): string => {
    const lines: string[] = []

    if (Object.keys(sections).length === 0) {
      return ''
    }

    lines.push('sections:')

    // Single-value sections
    const singleSections = ['system', 'user', 'assistant', 'task', 'output', 'response'] as const
    for (const sectionName of singleSections) {
      const section = sections[sectionName]
      if (section?.filePath) {
        lines.push(`  ${sectionName}: "${section.filePath}"`)
      }
    }

    // Context (array)
    if (sections.context && sections.context.length > 0) {
      const contextWithFiles = sections.context.filter(c => c.filePath)
      if (contextWithFiles.length > 0) {
        lines.push('  context:')
        contextWithFiles.forEach(ctx => {
          lines.push(`    - "${ctx.filePath}"`)
        })
      }
    }

    return lines.join('\n')
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

    // Update frontmatter with sections
    const updatedContent = updateFrontmatterSections(config.prompdSource.content, newSections)

    onConfigChange({
      sections: newSections,
      prompdSource: {
        ...config.prompdSource,
        content: updatedContent
      }
    })
  }

  const handleFileUpload = async (sectionName: string, files: File[]): Promise<string[]> => {
    // Read file contents and update config
    const filePaths: string[] = []

    for (const file of files) {
      const content = await file.text()
      filePaths.push(file.name)

      // Store file content in config
      let newSections: typeof config.sections
      if (sectionName === 'context') {
        newSections = {
          ...config.sections,
          context: [...(config.sections.context || []), { type: 'file', content, filePath: file.name }]
        }
      } else {
        newSections = {
          ...config.sections,
          [sectionName]: { type: 'file', content, filePath: file.name }
        }
      }

      // Update frontmatter with sections
      const updatedContent = updateFrontmatterSections(config.prompdSource.content, newSections)

      onConfigChange({
        sections: newSections,
        prompdSource: {
          ...config.prompdSource,
          content: updatedContent
        }
      })
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
          let newSections: typeof config.sections
          if (sectionName === 'context') {
            newSections = {
              ...config.sections,
              context: [...(config.sections.context || []), { type: 'file', content: '', filePath }]
            }
          } else {
            newSections = {
              ...config.sections,
              [sectionName]: { type: 'file', content: '', filePath }
            }
          }

          // Update frontmatter with sections
          const updatedContent = updateFrontmatterSections(config.prompdSource.content, newSections)

          onConfigChange({
            sections: newSections,
            prompdSource: {
              ...config.prompdSource,
              content: updatedContent
            }
          })
        }
      } finally {
        setActiveSection(null)
      }
    }
  }

  const handleClearParameters = () => {
    onConfigChange({
      parameters: {}
    })
  }

  const handleClearSections = () => {
    // Clear sections from frontmatter
    const updatedContent = updateFrontmatterSections(config.prompdSource.content, {})

    onConfigChange({
      sections: {},
      prompdSource: {
        ...config.prompdSource,
        content: updatedContent
      }
    })
  }

  const handleAddSection = () => {
    // Find the next available section that isn't currently visible
    const allSectionNames = ['system', 'user', 'context', 'assistant', 'task', 'output', 'response']
    const nextSection = allSectionNames.find(section => !visibleSections.includes(section))

    if (nextSection) {
      // Add an empty entry for this section to make it visible
      // For context (which is an array), add an empty array
      // For others, add an empty object placeholder
      let newSections: typeof config.sections
      if (nextSection === 'context') {
        newSections = {
          ...config.sections,
          context: [...(config.sections.context || []), { type: 'text', content: '', filePath: '' }]
        }
      } else {
        newSections = {
          ...config.sections,
          [nextSection]: { type: 'text', content: '', filePath: '' }
        }
      }

      // Note: Don't update frontmatter for empty sections (no filePath)
      // Only update frontmatter when files are actually attached
      onConfigChange({
        sections: newSections
      })
    }
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

        .execution-tab-grid {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 24px;
        }

        @media (max-width: 1200px) {
          .execution-tab-grid {
            grid-template-columns: 1fr;
          }
        }

        .quick-action-btn {
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          background: var(--panel);
          color: var(--text);
          border: 1px solid var(--border);
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.15s;
        }

        .quick-action-btn:hover {
          background: var(--panel-3);
          border-color: var(--accent);
          transform: translateY(-1px);
        }

        .stat-card {
          padding: 12px 16px;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 6px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .stat-label {
          font-size: 11px;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .stat-value {
          font-size: 18px;
          font-weight: 600;
          color: var(--text);
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
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
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

          {/* Execution Statistics (if history exists) */}
          {executionStats && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '12px',
                marginBottom: '24px'
              }}
            >
              <div className="stat-card">
                <div className="stat-label">Total Runs</div>
                <div className="stat-value">{executionStats.total}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Success Rate</div>
                <div className="stat-value" style={{ color: '#22c55e' }}>{executionStats.successRate}%</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Avg Duration</div>
                <div className="stat-value">{executionStats.avgDuration}s</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Total Tokens</div>
                <div className="stat-value">{executionStats.totalTokens}</div>
              </div>
            </div>
          )}

          {/* Two-Column Layout */}
          <div className="execution-tab-grid">
            {/* Left Column - Configuration */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Parameters Section */}
              <div
                style={{
                  padding: '20px',
                  background: 'var(--panel-2)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px'
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '16px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600 }}>
                    <Sparkles size={16} style={{ color: 'var(--accent)' }} />
                    <span>Parameters</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 400 }}>
                      {allParameters.length} parameter{allParameters.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {allParameters.length > 0 && (
                    <button
                      className="quick-action-btn"
                      onClick={handleClearParameters}
                      title="Clear all parameter values"
                    >
                      <RotateCcw size={14} />
                      Clear
                    </button>
                  )}
                </div>

                {!isParamsValid && missingParams.length > 0 && (
                  <div style={{
                    padding: '12px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid #ef4444',
                    borderRadius: '6px',
                    marginBottom: '16px',
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

              {/* Context Files Section */}
              <div
                style={{
                  padding: '20px',
                  background: 'var(--panel-2)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px'
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '16px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600 }}>
                    <FileText size={16} style={{ color: 'var(--accent)' }} />
                    <span>Context Files</span>
                    <span style={{
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                      fontWeight: 400,
                      fontStyle: 'italic',
                      marginLeft: '4px'
                    }}>
                      {visibleSections.length === 3 && visibleSections.includes('system') && visibleSections.includes('user')
                        ? '(default sections)'
                        : `(${visibleSections.length} active)`}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {visibleSections.length < 7 && (
                      <button
                        className="quick-action-btn"
                        onClick={handleAddSection}
                        title="Add another context section"
                      >
                        <Plus size={14} />
                        Add Section
                      </button>
                    )}
                    {Object.keys(config.sections).length > 0 && (
                      <button
                        className="quick-action-btn"
                        onClick={handleClearSections}
                        title="Remove all context files"
                      >
                        <Trash2 size={14} />
                        Clear All
                      </button>
                    )}
                  </div>
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

            {/* Right Column - Execution History */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {config.executionHistory.length > 0 && (
                <div
                  style={{
                    padding: '20px',
                    background: 'var(--panel-2)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    position: 'sticky',
                    top: '24px'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '16px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600 }}>
                      <Clock size={16} style={{ color: 'var(--accent)' }} />
                      <span>Execution History</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 400 }}>
                        {config.executionHistory.length} run{config.executionHistory.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {config.executionHistory.length > 0 && config.executionHistory[0].compiledPrompt && (
                      <button
                        className="quick-action-btn"
                        onClick={handleCopyCompiledPrompt}
                        title="Copy latest compiled prompt"
                      >
                        <Copy size={14} />
                        Copy Prompt
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'grid', gap: '8px', maxHeight: '600px', overflowY: 'auto' }}>
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
                            width: '100%',
                            textAlign: 'left',
                            padding: '12px',
                            borderRadius: '6px',
                            background: 'var(--panel)',
                            border: isNew ? '2px solid var(--accent)' : '1px solid var(--border)',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
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
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {result.status === 'success' ? (
                                <CheckCircle size={14} style={{ color: '#22c55e' }} />
                              ) : (
                                <XCircle size={14} style={{ color: '#ef4444' }} />
                              )}
                              <span style={{ fontSize: '12px', color: 'var(--text)' }}>
                                {new Date(result.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            {isNew && (
                              <span style={{
                                fontSize: '10px',
                                fontWeight: 600,
                                color: 'var(--accent)',
                                padding: '2px 6px',
                                background: 'rgba(59, 130, 246, 0.1)',
                                borderRadius: '3px'
                              }}>
                                NEW
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '11px' }}>
                            {result.metadata?.provider && (
                              <span style={{
                                padding: '2px 6px',
                                background: 'var(--panel-2)',
                                borderRadius: '3px',
                                fontWeight: 500
                              }}>
                                {result.metadata.provider}
                              </span>
                            )}
                            {result.metadata?.model && (
                              <span style={{
                                fontFamily: 'monospace',
                                padding: '2px 6px',
                                background: 'var(--panel-2)',
                                borderRadius: '3px',
                                color: 'var(--text-secondary)'
                              }}>
                                {result.metadata.model}
                              </span>
                            )}
                            {result.metadata?.duration && (
                              <span style={{
                                padding: '2px 6px',
                                background: 'var(--panel-2)',
                                borderRadius: '3px',
                                color: 'var(--text-secondary)'
                              }}>
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
            </div>
          </div>

          {/* Compiled Preview Section - Full Width */}
          <div
            style={{
              padding: '20px',
              background: 'var(--panel-2)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              marginTop: '24px'
            }}
          >
            <button
              onClick={() => setShowCompiledPreview(!showCompiledPreview)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                marginBottom: showCompiledPreview ? '16px' : 0
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                {showCompiledPreview ? (
                  <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />
                ) : (
                  <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                )}
                <Eye size={16} style={{ color: 'var(--accent)' }} />
                <span>Compiled Preview</span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 400, marginLeft: '4px' }}>
                  (live preview with parameters)
                </span>
              </div>
            </button>
            {showCompiledPreview && (
              <div
                style={{
                  minHeight: '400px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  overflow: 'visible'
                }}
              >
                <CompiledPreview
                  content={(() => {
                    // Extract frontmatter and body from original prompd content
                    const frontmatterMatch = config.prompdSource.content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
                    const hasFrontmatter = !!frontmatterMatch
                    const frontmatter = hasFrontmatter ? frontmatterMatch[1] : ''
                    const body = hasFrontmatter ? frontmatterMatch[2] : config.prompdSource.content

                    // Build sections preview in markdown body
                    let sectionsPreview = ''

                    // Add system section if present
                    if (config.sections.system?.content) {
                      sectionsPreview += `## System\n\n${config.sections.system.content}\n\n---\n\n`
                    }

                    // Add user section if present
                    if (config.sections.user?.content) {
                      sectionsPreview += `## User\n\n${config.sections.user.content}\n\n---\n\n`
                    }

                    // Add context sections if present
                    if (config.sections.context && config.sections.context.length > 0) {
                      config.sections.context.forEach((ctx, idx) => {
                        if (ctx.content) {
                          sectionsPreview += `## Context ${idx + 1}${ctx.filePath ? ` (${ctx.filePath})` : ''}\n\n${ctx.content}\n\n---\n\n`
                        }
                      })
                    }

                    // Add assistant section if present
                    if (config.sections.assistant?.content) {
                      sectionsPreview += `## Assistant\n\n${config.sections.assistant.content}\n\n---\n\n`
                    }

                    // Add task section if present
                    if (config.sections.task?.content) {
                      sectionsPreview += `## Task\n\n${config.sections.task.content}\n\n---\n\n`
                    }

                    // Add output section if present
                    if (config.sections.output?.content) {
                      sectionsPreview += `## Output\n\n${config.sections.output.content}\n\n---\n\n`
                    }

                    // Add response section if present
                    if (config.sections.response?.content) {
                      sectionsPreview += `## Response\n\n${config.sections.response.content}\n\n---\n\n`
                    }

                    // Combine everything with frontmatter
                    if (sectionsPreview) {
                      // Add sections preview header and original body
                      const combinedBody = `${sectionsPreview}## Compiled Prompt\n\n${body}`
                      // Reconstruct with frontmatter
                      if (hasFrontmatter) {
                        return `---\n${frontmatter}\n---\n${combinedBody}`
                      } else {
                        // Add minimal frontmatter if none exists
                        return `---\n---\n${combinedBody}`
                      }
                    } else {
                      // No sections, return original content
                      // Ensure it has frontmatter
                      if (hasFrontmatter) {
                        return config.prompdSource.content
                      } else {
                        return `---\n---\n${config.prompdSource.content}`
                      }
                    }
                  })()}
                  parameters={config.parameters}
                  onParametersChange={(params) => onConfigChange({ parameters: params })}
                  theme={theme === 'vs-dark' ? 'dark' : 'light'}
                  height="auto"
                  showMeta={true}
                  showParameters={false}
                  filePath={config.prompdSource.filePath || null}
                  workspacePath={config.workspacePath || null}
                />
              </div>
            )}
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

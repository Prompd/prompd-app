/**
 * CompiledPreview - Real-time compiled markdown preview for .prmd files
 *
 * Compiles the prmd content via the local compiler (Electron) or backend API
 * and renders the result as formatted markdown.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Loader2, AlertCircle, RefreshCw, CheckCircle2, Clock, Sparkles, ChevronDown, ChevronRight, Eye, Code, Maximize2, Minimize2, X, Hash, FileText, Scissors, Layout, Map as MapIcon, Play } from 'lucide-react'
import { PrompdParameterList, type PrompdParameter, PrompdContextArea, type PrompdFileSections, type PrompdFileSection, validateRequiredParameters } from '@prompd/react'
import Editor from '@monaco-editor/react'
import WysiwygEditor from '../components/WysiwygEditor'
import XmlDesignView, { type XmlDesignViewHandle } from '../components/XmlDesignView'
import { ContentMinimap, type MinimapSection } from '../components/ContentMinimap'
import { localCompiler } from '../services/localCompiler'
import { parsePrompd } from '../lib/prompdParser'
import { getMonacoTheme, registerPrompdThemes, readOnlyEditorOptions } from '../lib/monacoConfig'
import { toTrimmed, toPlainText, estimateTokens } from '../lib/markdownTransform'
import { debounce } from 'lodash-es'

type OutputFormat = 'markdown' | 'trimmed' | 'plain'

interface CompiledPreviewProps {
  /** The .prmd file content to compile */
  content: string
  /** Parameter values for template substitution */
  parameters?: Record<string, unknown>
  /** Callback when parameters change */
  onParametersChange?: (params: Record<string, unknown>) => void
  /** Theme for styling */
  theme?: 'light' | 'dark'
  /** Debounce delay in ms (default: 500) */
  debounceMs?: number
  /** Height of the preview area */
  height?: string
  /** Show compilation metadata (time, errors) */
  showMeta?: boolean
  /** Show parameters section (default: true) */
  showParameters?: boolean
  /** Callback when compilation completes */
  onCompileComplete?: (result: { success: boolean; output?: string; error?: string }) => void
  /** File path for disk-based compilation (enables inheritance resolution) */
  filePath?: string | null
  /** Workspace root for package cache resolution */
  workspacePath?: string | null
  /** Whether the preview is maximized */
  isMaximized?: boolean
  /** Callback to toggle maximize state */
  onToggleMaximize?: () => void
  /** Callback to close the preview */
  onClose?: () => void

  /** Execute callback */
  onExecute?: () => void
  /** Is executing */
  isExecuting?: boolean

  /** Show context sections */
  showContextSections?: boolean
  /** Context sections data */
  contextSections?: Record<string, any>
  /** Context sections change callback (updates content in editor) */
  onContextSectionsChange?: (updatedContent: string) => void
  /** File upload callback */
  onFileUpload?: (sectionName: string, files: File[]) => Promise<string[]>
  /** Select from browser callback */
  onSelectFromBrowser?: (sectionName: string) => Promise<string | null>
  /** Has folder open */
  hasFolderOpen?: boolean
}

interface CompilationState {
  status: 'idle' | 'compiling' | 'success' | 'error'
  output: string
  error: string | null
  compilationTime: number | null
  lastCompiled: Date | null
  tokenEstimate: number | null
}

export function CompiledPreview({
  content,
  parameters: externalParameters = {},
  onParametersChange,
  theme = 'dark',
  debounceMs = 500,
  height = '100%',
  showMeta = true,
  showParameters = true,
  onCompileComplete,
  filePath,
  workspacePath,
  isMaximized = false,
  onToggleMaximize,
  onClose,
  onExecute,
  isExecuting = false,
  // Context sections props
  showContextSections = false,
  contextSections = {},
  onContextSectionsChange,
  onFileUpload,
  onSelectFromBrowser,
  hasFolderOpen = false
}: CompiledPreviewProps) {
  const [state, setState] = useState<CompilationState>({
    status: 'idle',
    output: '',
    error: null,
    compilationTime: null,
    lastCompiled: null,
    tokenEstimate: null
  })

  // UI state
  const [activeControlsTab, setActiveControlsTab] = useState<'context' | 'params' | null>(null)
  const [viewMode, setViewMode] = useState<'rendered' | 'raw'>('rendered')
  const [xmlViewMode, setXmlViewMode] = useState<'designer' | 'raw'>('designer')
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('markdown')
  const [showMinimap, setShowMinimap] = useState(true)

  // Refs for minimap functionality
  const contentAreaRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const xmlDesignViewRef = useRef<XmlDesignViewHandle>(null)

  // Use external parameters directly (stored in tab state for persistence)
  const parameters = externalParameters

  // Parse content to extract parameter definitions, content-type, and sections
  const { parsedParams, contentType, parsedSections } = useMemo((): {
    parsedParams: PrompdParameter[],
    contentType: 'md' | 'xml',
    parsedSections: Record<string, any>
  } => {
    try {
      const parsed = parsePrompd(content)

      // Detect content-type from frontmatter (default to 'md' for markdown)
      const rawContentType = parsed.frontmatter?.['content-type'] || parsed.frontmatter?.contentType
      const detectedContentType: 'md' | 'xml' = rawContentType === 'xml' ? 'xml' : 'md'

      // Extract sections from frontmatter (top-level context/system/etc fields)
      const sections: Record<string, any> = {}
      const sectionNames = ['context', 'system', 'user', 'assistant', 'task', 'output', 'response']

      if (parsed.frontmatter) {
        for (const sectionName of sectionNames) {
          const value = parsed.frontmatter[sectionName]
          if (value !== undefined) {
            // Convert to array format if not already (paths are relative to .prmd file)
            if (Array.isArray(value)) {
              sections[sectionName] = value
            } else if (typeof value === 'string') {
              sections[sectionName] = [value]
            }
          }
        }
      }

      // Parse parameters
      let paramList: PrompdParameter[] = []
      if (parsed.frontmatter?.parameters) {
        const params = parsed.frontmatter.parameters

        if (Array.isArray(params)) {
          paramList = params.map((p: Record<string, unknown>) => ({
            name: String(p.name || ''),
            type: String(p.type || 'string'),
            description: p.description ? String(p.description) : undefined,
            default: p.default,
            required: Boolean(p.required),
            enum: Array.isArray(p.enum) ? p.enum : undefined,
            min: typeof p.min === 'number' ? p.min : undefined,
            max: typeof p.max === 'number' ? p.max : undefined
          }))
        } else if (typeof params === 'object') {
          paramList = Object.entries(params).map(([name, def]) => {
            const d = def as Record<string, unknown>
            return {
              name,
              type: String(d.type || 'string'),
              description: d.description ? String(d.description) : undefined,
              default: d.default,
              required: Boolean(d.required),
              enum: Array.isArray(d.enum) ? d.enum : undefined,
              min: typeof d.min === 'number' ? d.min : undefined,
              max: typeof d.max === 'number' ? d.max : undefined
            }
          })
        }
      }

      return { parsedParams: paramList, contentType: detectedContentType, parsedSections: sections }
    } catch {
      return { parsedParams: [], contentType: 'md', parsedSections: {} }
    }
  }, [content])

  // Validate required parameters (works even when params panel is closed)
  const { isParamsValid, missingParams } = useMemo(() => {
    if (parsedParams.length === 0) return { isParamsValid: true, missingParams: [] as string[] }
    const result = validateRequiredParameters(parsedParams, parameters)
    return { isParamsValid: result.isValid, missingParams: result.missingRequired }
  }, [parsedParams, parameters])

  // For XML content-type, transforms don't apply
  const isXmlContent = contentType === 'xml'

  // Build file sections configuration for PrompdContextArea
  const fileSections: PrompdFileSection[] = useMemo(() => {
    if (!showContextSections) return []

    // Section configurations with labels and constraints
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

    // Determine which sections to show (prioritize sections with files, ensure minimum of 3)
    const sectionsWithFiles: string[] = []
    const allSectionNames = ['system', 'user', 'context', 'assistant', 'task', 'output', 'response']

    // Check which sections have files from frontmatter
    for (const sectionName of allSectionNames) {
      if (sectionName === 'context') {
        if (Array.isArray(parsedSections.context) && parsedSections.context.length > 0) {
          sectionsWithFiles.push('context')
        }
      } else if (parsedSections[sectionName]) {
        sectionsWithFiles.push(sectionName)
      }
    }

    // Start with sections that have files
    const visibleSections = [...sectionsWithFiles]

    // If fewer than 3 sections, add more to reach 3 total
    const defaultSections = ['system', 'user', 'context']
    for (const section of defaultSections) {
      if (visibleSections.length >= 3) break
      if (!visibleSections.includes(section)) {
        visibleSections.push(section)
      }
    }

    // If still fewer than 3, add remaining sections
    if (visibleSections.length < 3) {
      for (const section of allSectionNames) {
        if (visibleSections.length >= 3) break
        if (!visibleSections.includes(section)) {
          visibleSections.push(section)
        }
      }
    }

    // Build PrompdFileSection[] for visible sections
    return visibleSections.map(sectionName => {
      const sectionConfig = sectionConfigs[sectionName]

      // Extract files from parsed sections
      let files: string[] = []
      if (sectionName === 'context') {
        const contextArray = parsedSections.context
        if (Array.isArray(contextArray)) {
          files = contextArray.map((item: string | Record<string, unknown>) =>
            typeof item === 'string' ? item : String(item)
          )
        }
      } else {
        const sectionValue = parsedSections[sectionName]
        if (sectionValue) {
          files = [typeof sectionValue === 'string' ? sectionValue : String(sectionValue)]
        }
      }

      return {
        name: sectionName,
        files,
        ...sectionConfig
      }
    })
  }, [showContextSections, parsedSections])

  // Build PrompdFileSections Map from fileSections
  const fileSectionsValue: PrompdFileSections = useMemo(() => {
    const map = new Map<string, string[]>()
    fileSections.forEach(section => {
      if (section.files.length > 0) {
        map.set(section.name, section.files)
      }
    })
    return map
  }, [fileSections])

  // Helper to update frontmatter with sections
  const updateFrontmatterWithSections = useCallback((newSections: PrompdFileSections): string => {
    // Parse frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)

    // Build sections YAML (top-level fields, not nested under sections:)
    const buildSectionsYaml = (): string => {
      if (newSections.size === 0) return ''

      const lines: string[] = []

      // Single-value sections (only first file)
      const singleSections = ['system', 'user', 'assistant', 'task', 'output', 'response']
      for (const sectionName of singleSections) {
        const files = newSections.get(sectionName)
        if (files && files.length > 0) {
          lines.push(`${sectionName}: "${files[0]}"`)
        }
      }

      // Context (array - paths relative to .prmd file)
      const contextFiles = newSections.get('context')
      if (contextFiles && contextFiles.length > 0) {
        lines.push('context:')
        contextFiles.forEach(filePath => {
          lines.push(`  - "${filePath}"`)
        })
      }

      return lines.join('\n')
    }

    if (!frontmatterMatch) {
      // No frontmatter, add one
      const sectionsYaml = buildSectionsYaml()
      if (sectionsYaml) {
        return `---\n${sectionsYaml}\n---\n${content}`
      }
      // Even if no sections, add empty frontmatter
      return `---\n---\n${content}`
    }

    const [, frontmatterContent, markdownContent] = frontmatterMatch

    // Remove existing section fields (context, system, user, etc.)
    const lines = frontmatterContent.split('\n')
    const newLines: string[] = []
    let inSectionBlock = false
    let indentLevel = 0

    // Section field names to remove
    const sectionFieldNames = ['context', 'system', 'user', 'assistant', 'task', 'output', 'response']

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Detect section field (top-level context:, system:, etc.)
      const sectionMatch = line.match(/^(context|system|user|assistant|task|output|response):/)
      if (sectionMatch) {
        inSectionBlock = true
        // Calculate indent of next line to know when block ends
        const nextLine = lines[i + 1]
        if (nextLine) {
          const match = nextLine.match(/^(\s+)/)
          indentLevel = match ? match[1].length : 0
        }
        continue
      }

      // Skip lines that are part of section block
      if (inSectionBlock) {
        const match = line.match(/^(\s+)/)
        const currentIndent = match ? match[1].length : 0

        // If line has less or equal indent than expected OR is a top-level field, block ended
        if (line.trim() && (currentIndent < indentLevel || line.match(/^[a-zA-Z]/))) {
          inSectionBlock = false
          // Check if this line is itself a section field
          if (sectionFieldNames.some(name => line.match(new RegExp(`^${name}:`)))) {
            inSectionBlock = true
            const nextLine = lines[i + 1]
            if (nextLine) {
              const m = nextLine.match(/^(\s+)/)
              indentLevel = m ? m[1].length : 0
            }
            continue
          }
          newLines.push(line)
        }
        // Otherwise skip this line (it's part of section block)
        continue
      }

      newLines.push(line)
    }

    // Add section fields at the end (if any)
    const sectionsYaml = buildSectionsYaml()
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
  }, [content])

  // Handle file sections change from PrompdContextArea
  const handleFileSectionsChange = useCallback((newSections: PrompdFileSections) => {
    if (!onContextSectionsChange) return

    // Update frontmatter with new sections
    const updatedContent = updateFrontmatterWithSections(newSections)
    onContextSectionsChange(updatedContent)
  }, [onContextSectionsChange, updateFrontmatterWithSections])

  // Handle file upload - wraps external callback and updates frontmatter
  const handleFileUploadInternal = useCallback(async (sectionName: string, files: File[]): Promise<string[]> => {
    if (!onFileUpload) return []

    // Call external handler
    const filePaths = await onFileUpload(sectionName, files)

    // Update frontmatter with new file paths
    const newSections = new Map(fileSectionsValue)
    const currentFiles = newSections.get(sectionName) || []

    // For context (multi-file), append; for others, replace
    const section = fileSections.find(s => s.name === sectionName)
    if (section?.allowMultiple) {
      newSections.set(sectionName, [...currentFiles, ...filePaths])
    } else {
      newSections.set(sectionName, filePaths)
    }

    // Update frontmatter
    if (onContextSectionsChange) {
      const updatedContent = updateFrontmatterWithSections(newSections)
      onContextSectionsChange(updatedContent)
    }

    return filePaths
  }, [onFileUpload, fileSectionsValue, fileSections, onContextSectionsChange, updateFrontmatterWithSections])

  // Handle select from browser - wraps external callback and updates frontmatter
  const handleSelectFromBrowserInternal = useCallback(async (sectionName: string): Promise<string | null> => {
    if (!onSelectFromBrowser) return null

    // Call external handler
    const filePath = await onSelectFromBrowser(sectionName)
    if (!filePath) return null

    // Update frontmatter with new file path
    const newSections = new Map(fileSectionsValue)
    const currentFiles = newSections.get(sectionName) || []

    // For context (multi-file), append; for others, replace
    const section = fileSections.find(s => s.name === sectionName)
    if (section?.allowMultiple) {
      newSections.set(sectionName, [...currentFiles, filePath])
    } else {
      newSections.set(sectionName, [filePath])
    }

    // Update frontmatter
    if (onContextSectionsChange) {
      const updatedContent = updateFrontmatterWithSections(newSections)
      onContextSectionsChange(updatedContent)
    }

    return filePath
  }, [onSelectFromBrowser, fileSectionsValue, fileSections, onContextSectionsChange, updateFrontmatterWithSections])

  // Handle parameter value changes - update parent state directly
  const handleParameterChange = useCallback((name: string, value: unknown) => {
    const updated = { ...parameters, [name]: value }
    onParametersChange?.(updated)
  }, [parameters, onParametersChange])

  // Track if component is mounted for async safety
  const isMountedRef = useRef(true)
  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  // Track previous values to avoid unnecessary recompiles
  const prevValuesRef = useRef({
    content: '',
    paramsJson: '{}',
    filePath: filePath
  })
  const isFirstRender = useRef(true)

  // Compile function
  const compile = useCallback(async (
    contentToCompile: string,
    params: Record<string, unknown>,
    path: string | null | undefined
  ) => {
    if (!contentToCompile.trim()) {
      setState(prev => ({
        ...prev,
        status: 'idle',
        output: '',
        error: null
      }))
      return
    }

    setState(prev => ({ ...prev, status: 'compiling' }))

    const startTime = performance.now()

    try {
      // Check if local compiler is available (Electron)
      const hasLocal = localCompiler.hasLocalCompiler()

      if (hasLocal) {
        // Use local compiler via Electron IPC
        // Pass filePath to enable disk-based compilation with inheritance resolution
        const result = await localCompiler.compileToMarkdown(contentToCompile, params, path)

        if (!isMountedRef.current) return

        const compilationTime = Math.round(performance.now() - startTime)

        if (result.success && result.output) {
          // Estimate tokens: ~4 characters per token on average
          const tokenEstimate = Math.ceil(result.output.length / 4)
          setState({
            status: 'success',
            output: result.output,
            error: null,
            compilationTime,
            lastCompiled: new Date(),
            tokenEstimate
          })
          onCompileComplete?.({ success: true, output: result.output })
        } else {
          setState({
            status: 'error',
            output: '',
            error: result.error || 'Compilation failed',
            compilationTime,
            lastCompiled: new Date(),
            tokenEstimate: null
          })
          onCompileComplete?.({ success: false, error: result.error })
        }
      } else {
        // Fallback: Simple markdown extraction without full compilation
        // Extract markdown body from prmd (after frontmatter)
        const simpleOutput = extractMarkdownBody(contentToCompile, params)
        const compilationTime = Math.round(performance.now() - startTime)
        const tokenEstimate = Math.ceil(simpleOutput.length / 4)

        if (!isMountedRef.current) return

        setState({
          status: 'success',
          output: simpleOutput,
          error: null,
          compilationTime,
          lastCompiled: new Date(),
          tokenEstimate
        })
        onCompileComplete?.({ success: true, output: simpleOutput })
      }
    } catch (error) {
      if (!isMountedRef.current) return

      const errorMessage = error instanceof Error ? error.message : 'Unknown compilation error'
      setState({
        status: 'error',
        output: '',
        error: errorMessage,
        compilationTime: Math.round(performance.now() - startTime),
        lastCompiled: new Date(),
        tokenEstimate: null
      })
      onCompileComplete?.({ success: false, error: errorMessage })
    }
  }, [onCompileComplete])

  // Debounced compile
  const debouncedCompile = useMemo(
    () => debounce(compile, debounceMs),
    [compile, debounceMs]
  )

  // Trigger compilation on content/params/filePath change
  // Use refs to avoid recompiling when object references change but values don't
  useEffect(() => {
    const paramsJson = JSON.stringify(parameters)
    const prev = prevValuesRef.current

    // On first render, compile immediately
    if (isFirstRender.current) {
      isFirstRender.current = false
      prev.content = content
      prev.paramsJson = paramsJson
      prev.filePath = filePath
      compile(content, parameters, filePath)
      return
    }

    // Check if values actually changed
    const contentChanged = content !== prev.content
    const paramsChanged = paramsJson !== prev.paramsJson
    const pathChanged = filePath !== prev.filePath

    if (contentChanged || paramsChanged || pathChanged) {
      prev.content = content
      prev.paramsJson = paramsJson
      prev.filePath = filePath
      debouncedCompile(content, parameters, filePath)
    }
  }, [content, parameters, filePath, compile, debouncedCompile])

  // Cleanup debounce on unmount only
  useEffect(() => {
    return () => debouncedCompile.cancel()
  }, [debouncedCompile])

  // Manual recompile
  const handleRecompile = useCallback(() => {
    debouncedCompile.cancel()
    compile(content, parameters, filePath)
  }, [compile, content, parameters, filePath, debouncedCompile])

  // Lazy computation - only compute markdown tokens always, others on demand
  const markdownTokens = useMemo(() => {
    if (!state.output) return 0
    return estimateTokens(state.output)
  }, [state.output])

  // Compute current format content and tokens lazily
  // For XML content, transforms don't apply - just show raw output
  const { displayContent, currentTokens } = useMemo(() => {
    if (!state.output) return { displayContent: '', currentTokens: 0 }

    // XML content: no transforms, just raw output
    if (isXmlContent) {
      return { displayContent: state.output, currentTokens: markdownTokens }
    }

    // Markdown content: apply selected transform
    switch (outputFormat) {
      case 'trimmed': {
        const trimmed = toTrimmed(state.output)
        return { displayContent: trimmed, currentTokens: estimateTokens(trimmed) }
      }
      case 'plain': {
        const plain = toPlainText(state.output)
        return { displayContent: plain, currentTokens: estimateTokens(plain) }
      }
      default:
        return { displayContent: state.output, currentTokens: markdownTokens }
    }
  }, [state.output, outputFormat, markdownTokens, isXmlContent])

  // Calculate savings percentage when not in markdown mode (not applicable for XML)
  const savingsPercent = !isXmlContent && outputFormat !== 'markdown' && markdownTokens > 0
    ? Math.round((1 - currentTokens / markdownTokens) * 100)
    : 0

  // Calculate Monaco editor height when parent uses height="auto"
  const monacoHeight = useMemo(() => {
    if (height === 'auto' || height === '100%') {
      // When auto height, calculate based on content lines (min 600px)
      if (!displayContent) return '600px'
      const lines = displayContent.split('\n').length
      // Approximately 19px per line + 24px padding
      const calculatedHeight = Math.max(600, lines * 19 + 24)
      return `${calculatedHeight}px`
    }
    return '100%' // Use 100% when parent has fixed height
  }, [height, displayContent])

  // Build minimap sections from parameters and content
  const minimapSections = useMemo((): MinimapSection[] => {
    const sections: MinimapSection[] = []

    // Add parameters section if visible
    if (showParameters && parsedParams.length > 0) {
      sections.push({
        id: 'params-section',
        type: 'params',
        label: `Parameters (${parsedParams.length})`,
        depth: 0
      })
      // Add individual parameters
      parsedParams.forEach((param, i) => {
        sections.push({
          id: `param-${i}`,
          type: 'params',
          label: param.name,
          depth: 1
        })
      })
    }

    // Add context sections if visible
    if (showContextSections && fileSections.length > 0) {
      sections.push({
        id: 'context-section',
        type: 'context',
        label: 'Context Sections',
        depth: 0
      })
      fileSections.forEach((fs) => {
        const files = fileSectionsValue.get(fs.name) || []
        if (files.length > 0) {
          sections.push({
            id: `context-${fs.name}`,
            type: 'context',
            label: `${fs.label} (${files.length})`,
            depth: 1
          })
        }
      })
    }

    // Add content section
    if (displayContent) {
      sections.push({
        id: 'content-section',
        type: 'content',
        label: isXmlContent ? 'XML Content' : 'Markdown Content',
        depth: 0
      })

      if (isXmlContent && displayContent) {
        // For XML content, extract elements for minimap
        // Simple regex-based extraction of XML elements
        const extractXmlElements = (xml: string, depth: number, startIndex: number): { sections: MinimapSection[], nextIndex: number } => {
          const result: MinimapSection[] = []
          let index = startIndex
          let remaining = xml.trim()

          while (remaining.length > 0) {
            // Match opening tag
            const tagMatch = remaining.match(/^<([a-zA-Z_][\w.-]*)((?:\s+[^>]*?)?)(\/?)\s*>/)
            if (tagMatch) {
              const [fullMatch, tagName, , selfClosing] = tagMatch
              result.push({
                id: `xml-${index++}`,
                type: 'element',
                label: `<${tagName}>`,
                depth: depth + 1
              })

              remaining = remaining.substring(fullMatch.length)

              if (!selfClosing) {
                // Find closing tag and recurse into children
                const closingTag = `</${tagName}>`
                let nestLevel = 1
                let searchIdx = 0
                let contentEnd = -1

                while (nestLevel > 0 && searchIdx < remaining.length) {
                  const nextOpen = remaining.indexOf(`<${tagName}`, searchIdx)
                  const nextClose = remaining.indexOf(closingTag, searchIdx)

                  if (nextClose === -1) break

                  if (nextOpen !== -1 && nextOpen < nextClose) {
                    const afterOpen = remaining[nextOpen + tagName.length + 1]
                    if (afterOpen === '>' || afterOpen === ' ' || afterOpen === '/') {
                      nestLevel++
                    }
                    searchIdx = nextOpen + 1
                  } else {
                    nestLevel--
                    if (nestLevel === 0) {
                      contentEnd = nextClose
                    }
                    searchIdx = nextClose + 1
                  }
                }

                if (contentEnd !== -1) {
                  const innerContent = remaining.substring(0, contentEnd)
                  remaining = remaining.substring(contentEnd + closingTag.length).trim()

                  // Recurse into children
                  const { sections: childSections, nextIndex } = extractXmlElements(innerContent, depth + 1, index)
                  result.push(...childSections)
                  index = nextIndex
                }
              }
              continue
            }

            // Skip text content and comments for minimap
            const nextTag = remaining.indexOf('<')
            if (nextTag === -1) {
              break
            } else if (nextTag > 0) {
              // Check if there's meaningful text content
              const textContent = remaining.substring(0, nextTag).trim()
              if (textContent) {
                result.push({
                  id: `xml-text-${index++}`,
                  type: 'text',
                  label: textContent.length > 20 ? textContent.substring(0, 20) + '...' : textContent,
                  depth: depth + 1
                })
              }
              remaining = remaining.substring(nextTag)
            } else if (remaining.startsWith('<!--')) {
              // Skip comments
              const endComment = remaining.indexOf('-->')
              if (endComment !== -1) {
                remaining = remaining.substring(endComment + 3).trim()
              } else {
                break
              }
            } else if (remaining.startsWith('</')) {
              // Closing tag without opening - skip
              const endIdx = remaining.indexOf('>')
              if (endIdx !== -1) {
                remaining = remaining.substring(endIdx + 1).trim()
              } else {
                break
              }
            } else {
              remaining = remaining.substring(1)
            }
          }

          return { sections: result, nextIndex: index }
        }

        const { sections: xmlSections } = extractXmlElements(displayContent, 0, 0)
        sections.push(...xmlSections)
      } else if (!isXmlContent && displayContent) {
        // For markdown, extract headings
        const lines = displayContent.split('\n')
        let headingIndex = 0
        for (const line of lines) {
          const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
          if (headingMatch) {
            const level = headingMatch[1].length
            sections.push({
              id: `heading-${headingIndex++}`,
              type: 'heading',
              label: headingMatch[2],
              depth: level
            })
          }
        }
      }
    }

    return sections
  }, [showParameters, parsedParams, showContextSections, fileSections, fileSectionsValue, displayContent, isXmlContent])

  // Scroll to a section when clicked in minimap
  const scrollToSection = useCallback((sectionId: string) => {
    const container = scrollContainerRef.current
    if (!container) return

    // Helper to scroll after potential expand
    const scrollTo = (selector: string, delay: number = 0) => {
      setTimeout(() => {
        const element = container.querySelector(selector)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, delay)
    }

    // Context sections — expand the context tab and scroll to it
    if (sectionId === 'context-section' || sectionId.startsWith('context-')) {
      const needsExpand = activeControlsTab !== 'context'
      if (needsExpand) {
        setActiveControlsTab('context')
      }
      scrollTo('[data-section="context"]', needsExpand ? 100 : 0)
      return
    }

    // For params-section, scroll to the parameters area and expand the params tab
    if (sectionId === 'params-section' || sectionId.startsWith('param-')) {
      const needsExpand = activeControlsTab !== 'params'
      if (needsExpand) {
        setActiveControlsTab('params')
      }
      scrollTo('[data-section="params"]', needsExpand ? 100 : 0)
      return
    }

    // For content-section, scroll to top of content
    if (sectionId === 'content-section') {
      scrollTo('[data-section="content"]', 0)
      return
    }

    // For XML elements, expand ancestors and scroll to the specific node
    if (sectionId.startsWith('xml-')) {
      // Extract index from section ID (xml-0, xml-1, etc.)
      const index = parseInt(sectionId.replace('xml-', ''), 10)
      if (!isNaN(index)) {
        // First, expand all ancestors so the node becomes visible
        xmlDesignViewRef.current?.expandToNodeIndex(index)
        // Wait for expansion to render, then scroll
        setTimeout(() => {
          const allNodes = container.querySelectorAll('[data-node-id]')
          if (index < allNodes.length) {
            const targetNode = allNodes[index]
            targetNode.scrollIntoView({ behavior: 'smooth', block: 'start' })
          } else {
            // Fallback to content section
            scrollTo('[data-section="content"]', 0)
          }
        }, 100)
      }
      return
    }

    // For headings, find the actual heading element in the rendered content
    if (sectionId.startsWith('heading-')) {
      const index = parseInt(sectionId.replace('heading-', ''), 10)
      if (!isNaN(index)) {
        const headings = container.querySelectorAll('[data-section="content"] h1, [data-section="content"] h2, [data-section="content"] h3, [data-section="content"] h4, [data-section="content"] h5, [data-section="content"] h6')
        if (index < headings.length) {
          headings[index].scrollIntoView({ behavior: 'smooth', block: 'start' })
        } else {
          scrollTo('[data-section="content"]', 0)
        }
      }
      return
    }
  }, [activeControlsTab])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height,
        background: theme === 'dark' ? 'var(--panel-2)' : '#ffffff',
        overflow: 'hidden'
      }}
    >
      {/* Header with status */}
      {showMeta && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            borderBottom: `1px solid ${theme === 'dark' ? 'var(--border)' : '#e2e8f0'}`,
            background: theme === 'dark' ? 'var(--panel-2)' : '#f8fafc',
            fontSize: '12px',
            color: theme === 'dark' ? 'var(--text-secondary)' : '#64748b',
            flexShrink: 0
          }}
        >
          {/* Left section: Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {state.status === 'compiling' && (
              <>
                <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent)' }} />
                <span>Compiling...</span>
              </>
            )}
            {state.status === 'success' && (
              <>
                <CheckCircle2 size={14} style={{ color: '#22c55e' }} />
                <span>Preview</span>
              </>
            )}
            {state.status === 'error' && (
              <>
                <AlertCircle size={14} style={{ color: '#ef4444' }} />
                <span>Error</span>
              </>
            )}
            {state.status === 'idle' && (
              <>
                <Clock size={14} />
                <span>Ready</span>
              </>
            )}

            {/* Separator */}
            {(currentTokens > 0 || state.compilationTime !== null) && (
              <div style={{
                width: '1px',
                height: '14px',
                background: theme === 'dark' ? 'var(--border)' : '#d1d5db',
                marginLeft: '4px'
              }} />
            )}

            {/* Stats: ~tokens (-savings%) | compile time */}
            {currentTokens > 0 && (
              <span
                style={{
                  fontSize: '11px',
                  color: theme === 'dark' ? 'var(--text-muted)' : '#9ca3af',
                  fontFamily: 'ui-monospace, monospace'
                }}
                title={savingsPercent > 0
                  ? `${outputFormat === 'trimmed' ? 'Trimmed' : 'Plain'}: ~${currentTokens.toLocaleString()} tokens (saved ${savingsPercent}% from markdown)`
                  : 'Estimated token count (~4 chars/token)'
                }
              >
                ~{currentTokens.toLocaleString()}
                {savingsPercent > 0 && (
                  <span style={{ color: '#22c55e' }}> (-{savingsPercent}%)</span>
                )}
              </span>
            )}
            {currentTokens > 0 && state.compilationTime !== null && (
              <div style={{
                width: '1px',
                height: '12px',
                background: theme === 'dark' ? 'var(--border)' : '#d1d5db'
              }} />
            )}
            {state.compilationTime !== null && (
              <span style={{
                fontSize: '11px',
                color: theme === 'dark' ? 'var(--text-muted)' : '#9ca3af',
                fontFamily: 'ui-monospace, monospace'
              }}>
                {state.compilationTime}ms
              </span>
            )}
          </div>

          {/* Right section: Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* For XML: Show view mode toggle (Design | Code) */}
            {isXmlContent ? (
              <>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: theme === 'dark' ? 'var(--panel)' : '#e2e8f0',
                  borderRadius: '4px',
                  padding: '2px',
                  gap: '1px'
                }}>
                  <button
                    onClick={() => setXmlViewMode('designer')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                      padding: '3px 6px',
                      background: xmlViewMode === 'designer' ? (theme === 'dark' ? 'var(--accent)' : '#3b82f6') : 'transparent',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      color: xmlViewMode === 'designer' ? 'white' : (theme === 'dark' ? 'var(--text-secondary)' : '#64748b'),
                      fontSize: '10px',
                      fontWeight: 500,
                      transition: 'all 0.15s'
                    }}
                    title="Visual XML design view"
                  >
                    <Layout size={10} />
                    {isMaximized && 'Design'}
                  </button>
                  <button
                    onClick={() => setXmlViewMode('raw')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                      padding: '3px 6px',
                      background: xmlViewMode === 'raw' ? (theme === 'dark' ? 'var(--accent)' : '#3b82f6') : 'transparent',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      color: xmlViewMode === 'raw' ? 'white' : (theme === 'dark' ? 'var(--text-secondary)' : '#64748b'),
                      fontSize: '10px',
                      fontWeight: 500,
                      transition: 'all 0.15s'
                    }}
                    title="Raw XML with syntax highlighting"
                  >
                    <Code size={10} />
                    {isMaximized && 'Code'}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Output Format: MD | Trim | Plain (only for markdown content) */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: theme === 'dark' ? 'var(--panel)' : '#e2e8f0',
                  borderRadius: '4px',
                  padding: '2px',
                  gap: '1px'
                }}>
                  <button
                    onClick={() => setOutputFormat('markdown')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                      padding: '3px 6px',
                      background: outputFormat === 'markdown' ? (theme === 'dark' ? 'var(--accent)' : '#3b82f6') : 'transparent',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      color: outputFormat === 'markdown' ? 'white' : (theme === 'dark' ? 'var(--text-secondary)' : '#64748b'),
                      fontSize: '10px',
                      fontWeight: 500,
                      transition: 'all 0.15s'
                    }}
                    title="Full markdown output"
                  >
                    MD
                  </button>
                  <button
                    onClick={() => setOutputFormat('trimmed')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                      padding: '3px 6px',
                      background: outputFormat === 'trimmed' ? (theme === 'dark' ? 'var(--accent)' : '#3b82f6') : 'transparent',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      color: outputFormat === 'trimmed' ? 'white' : (theme === 'dark' ? 'var(--text-secondary)' : '#64748b'),
                      fontSize: '10px',
                      fontWeight: 500,
                      transition: 'all 0.15s'
                    }}
                    title="Trimmed - removes formatting syntax, keeps code blocks and URLs"
                  >
                    <Scissors size={9} />
                    Trim
                  </button>
                  <button
                    onClick={() => setOutputFormat('plain')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                      padding: '3px 6px',
                      background: outputFormat === 'plain' ? (theme === 'dark' ? 'var(--accent)' : '#3b82f6') : 'transparent',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      color: outputFormat === 'plain' ? 'white' : (theme === 'dark' ? 'var(--text-secondary)' : '#64748b'),
                      fontSize: '10px',
                      fontWeight: 500,
                      transition: 'all 0.15s'
                    }}
                    title="Plain text - all formatting stripped"
                  >
                    <FileText size={9} />
                    Plain
                  </button>
                </div>

                {/* Separator */}
                <div style={{
                  width: '1px',
                  height: '16px',
                  background: theme === 'dark' ? 'var(--border)' : '#d1d5db'
                }} />

                {/* View Mode: Rendered | Raw (only for markdown content) */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: theme === 'dark' ? 'var(--panel)' : '#e2e8f0',
                  borderRadius: '4px',
                  padding: '2px'
                }}>
                  <button
                    onClick={() => setViewMode('rendered')}
                    disabled={outputFormat !== 'markdown'}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '3px 6px',
                      background: viewMode === 'rendered' && outputFormat === 'markdown' ? (theme === 'dark' ? 'var(--accent)' : '#3b82f6') : 'transparent',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: outputFormat === 'markdown' ? 'pointer' : 'not-allowed',
                      color: viewMode === 'rendered' && outputFormat === 'markdown' ? 'white' : (theme === 'dark' ? 'var(--text-secondary)' : '#64748b'),
                      fontSize: '10px',
                      opacity: outputFormat !== 'markdown' ? 0.4 : 1,
                      transition: 'all 0.15s'
                    }}
                    title={outputFormat !== 'markdown' ? 'Rendered view only available for Markdown format' : 'Rendered preview'}
                  >
                    <Eye size={11} />
                  </button>
                  <button
                    onClick={() => setViewMode('raw')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '3px 6px',
                      background: viewMode === 'raw' || outputFormat !== 'markdown' ? (theme === 'dark' ? 'var(--accent)' : '#3b82f6') : 'transparent',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      color: viewMode === 'raw' || outputFormat !== 'markdown' ? 'white' : (theme === 'dark' ? 'var(--text-secondary)' : '#64748b'),
                      fontSize: '10px',
                      transition: 'all 0.15s'
                    }}
                    title="Raw text view"
                  >
                    <Code size={11} />
                  </button>
                </div>
              </>
            )}

            {/* Separator */}
            <div style={{
              width: '1px',
              height: '16px',
              background: theme === 'dark' ? 'var(--border)' : '#d1d5db'
            }} />
            {/* Actions: Run, Minimap, Recompile, Maximize, Close */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {onExecute && (
                <button
                  onClick={onExecute}
                  disabled={isExecuting || !isParamsValid}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    height: '22px',
                    padding: '0 8px',
                    background: (isExecuting || !isParamsValid)
                      ? (theme === 'dark' ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.1)')
                      : (theme === 'dark' ? 'rgba(139, 92, 246, 0.25)' : 'rgba(139, 92, 246, 0.2)'),
                    border: `1px solid ${(isExecuting || !isParamsValid)
                      ? (theme === 'dark' ? 'rgba(139, 92, 246, 0.3)' : 'rgba(139, 92, 246, 0.2)')
                      : (theme === 'dark' ? 'rgba(139, 92, 246, 0.5)' : 'rgba(139, 92, 246, 0.4)')}`,
                    borderRadius: '5px',
                    cursor: (isExecuting || !isParamsValid) ? 'not-allowed' : 'pointer',
                    color: !isParamsValid ? (theme === 'dark' ? 'rgba(167, 139, 250, 0.5)' : 'rgba(139, 92, 246, 0.4)') : '#a78bfa',
                    fontSize: '11px',
                    fontWeight: 600,
                    transition: 'all 0.15s',
                    marginRight: '4px'
                  }}
                  title={isExecuting ? 'Executing...' : (!isParamsValid ? `Missing required: ${missingParams.join(', ')}` : 'Execute prompt')}
                  onMouseEnter={(e) => {
                    if (!isExecuting && isParamsValid) {
                      e.currentTarget.style.background = theme === 'dark' ? 'rgba(139, 92, 246, 0.35)' : 'rgba(139, 92, 246, 0.3)'
                      e.currentTarget.style.borderColor = theme === 'dark' ? 'rgba(139, 92, 246, 0.6)' : 'rgba(139, 92, 246, 0.5)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isExecuting && isParamsValid) {
                      e.currentTarget.style.background = theme === 'dark' ? 'rgba(139, 92, 246, 0.25)' : 'rgba(139, 92, 246, 0.2)'
                      e.currentTarget.style.borderColor = theme === 'dark' ? 'rgba(139, 92, 246, 0.5)' : 'rgba(139, 92, 246, 0.4)'
                    }
                  }}
                >
                  {isExecuting ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} fill="currentColor" />}
                  <span>{isExecuting ? 'Running' : 'Run'}</span>
                </button>
              )}
              <button
                onClick={() => setShowMinimap(!showMinimap)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '24px',
                  height: '24px',
                  background: showMinimap ? (theme === 'dark' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.15)') : 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  color: showMinimap ? '#3b82f6' : (theme === 'dark' ? 'var(--text-muted)' : '#64748b'),
                  transition: 'all 0.15s'
                }}
                title={showMinimap ? 'Hide minimap' : 'Show minimap'}
                onMouseEnter={(e) => e.currentTarget.style.color = showMinimap ? '#3b82f6' : (theme === 'dark' ? 'var(--text)' : '#374151')}
                onMouseLeave={(e) => e.currentTarget.style.color = showMinimap ? '#3b82f6' : (theme === 'dark' ? 'var(--text-muted)' : '#64748b')}
              >
                <MapIcon size={13} />
              </button>
              <button
                onClick={handleRecompile}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '24px',
                  height: '24px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  color: theme === 'dark' ? 'var(--text-muted)' : '#64748b',
                  transition: 'color 0.15s'
                }}
                title="Recompile (refresh)"
                onMouseEnter={(e) => e.currentTarget.style.color = theme === 'dark' ? 'var(--text)' : '#374151'}
                onMouseLeave={(e) => e.currentTarget.style.color = theme === 'dark' ? 'var(--text-muted)' : '#64748b'}
              >
                <RefreshCw size={13} />
              </button>
              {onToggleMaximize && (
                <button
                  onClick={onToggleMaximize}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '24px',
                    height: '24px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    color: theme === 'dark' ? 'var(--text-muted)' : '#64748b',
                    transition: 'color 0.15s'
                  }}
                  title={isMaximized ? 'Restore split view' : 'Maximize preview'}
                  onMouseEnter={(e) => e.currentTarget.style.color = theme === 'dark' ? 'var(--text)' : '#374151'}
                  onMouseLeave={(e) => e.currentTarget.style.color = theme === 'dark' ? 'var(--text-muted)' : '#64748b'}
                >
                  {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                </button>
              )}
              {onClose && (
                <button
                  onClick={onClose}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '24px',
                    height: '24px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    color: theme === 'dark' ? 'var(--text-muted)' : '#64748b',
                    transition: 'color 0.15s'
                  }}
                  title="Close preview"
                  onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                  onMouseLeave={(e) => e.currentTarget.style.color = theme === 'dark' ? 'var(--text-muted)' : '#64748b'}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Scrollable content container with minimap overlay */}
      <div
        ref={contentAreaRef}
        style={{
          flex: 1,
          display: 'flex',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Scrollable inner content */}
        <div
          ref={scrollContainerRef}
          style={{
            flex: 1,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
            paddingRight: showMinimap && minimapSections.length > 0 ? '130px' : '0'
          }}
        >
          {/* Controls Strip - Context Files + Parameters */}
          {((showContextSections && fileSections.length > 0) || (showParameters && parsedParams.length > 0)) && (
            <div style={{
              borderBottom: `1px solid ${theme === 'dark' ? 'var(--border)' : '#e2e8f0'}`,
              background: theme === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
              flexShrink: 0
            }}>
              {/* Tab buttons */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0',
                padding: '0 12px',
                height: '30px',
                borderBottom: activeControlsTab ? `1px solid ${theme === 'dark' ? 'var(--border)' : '#e2e8f0'}` : 'none'
              }}>
                {showContextSections && fileSections.length > 0 && (() => {
                  const fileCount = Array.from(fileSectionsValue.values()).reduce((sum, files) => sum + files.length, 0)
                  return (
                    <button
                      onClick={() => setActiveControlsTab(activeControlsTab === 'context' ? null : 'context')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '0 12px',
                        height: '100%',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: activeControlsTab === 'context'
                          ? '2px solid var(--accent, #8b5cf6)'
                          : '2px solid transparent',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: 500,
                        color: activeControlsTab === 'context'
                          ? (theme === 'dark' ? '#e2e8f0' : '#1e293b')
                          : (theme === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)'),
                        transition: 'all 0.15s',
                        marginBottom: '-1px'
                      }}
                    >
                      <FileText size={11} />
                      <span>Context</span>
                      <span style={{
                        fontSize: '10px',
                        padding: '0 5px',
                        borderRadius: '8px',
                        background: theme === 'dark' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(139, 92, 246, 0.12)',
                        color: '#a78bfa',
                        fontWeight: 600
                      }}>{fileCount > 0 ? fileCount : fileSections.length}</span>
                    </button>
                  )
                })()}
                {showParameters && parsedParams.length > 0 && (
                  <button
                    onClick={() => setActiveControlsTab(activeControlsTab === 'params' ? null : 'params')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '0 12px',
                      height: '100%',
                      background: !isParamsValid
                        ? (theme === 'dark' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.06)')
                        : 'transparent',
                      border: 'none',
                      borderBottom: activeControlsTab === 'params'
                        ? `2px solid ${!isParamsValid ? '#ef4444' : 'var(--accent, #8b5cf6)'}`
                        : '2px solid transparent',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: 500,
                      color: activeControlsTab === 'params'
                        ? (theme === 'dark' ? '#e2e8f0' : '#1e293b')
                        : (theme === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)'),
                      transition: 'all 0.15s',
                      marginBottom: '-1px'
                    }}
                    title={!isParamsValid ? `Missing required: ${missingParams.join(', ')}` : undefined}
                  >
                    <Sparkles size={11} />
                    <span>Parameters</span>
                    {!isParamsValid ? (
                      <span style={{
                        fontSize: '10px',
                        padding: '0 5px',
                        borderRadius: '8px',
                        background: theme === 'dark' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(239, 68, 68, 0.12)',
                        color: '#ef4444',
                        fontWeight: 600
                      }}>{missingParams.length}/{parsedParams.length}</span>
                    ) : (
                      <span style={{
                        fontSize: '10px',
                        padding: '0 5px',
                        borderRadius: '8px',
                        background: theme === 'dark' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(139, 92, 246, 0.12)',
                        color: '#a78bfa',
                        fontWeight: 600
                      }}>{parsedParams.length}</span>
                    )}
                  </button>
                )}
              </div>

              {/* Expanded content */}
              {activeControlsTab === 'context' && showContextSections && fileSections.length > 0 && (
                <div data-section="context" style={{ padding: '10px 12px' }}>
                  <PrompdContextArea
                    sections={fileSections}
                    value={fileSectionsValue}
                    onChange={handleFileSectionsChange}
                    onFileUpload={handleFileUploadInternal}
                    onSelectFromBrowser={onSelectFromBrowser ? handleSelectFromBrowserInternal : undefined}
                    hasFolderOpen={hasFolderOpen}
                    currentFilePath={filePath || undefined}
                    workspacePath={workspacePath || undefined}
                    variant="compact"
                  />
                </div>
              )}
              {activeControlsTab === 'params' && showParameters && parsedParams.length > 0 && (
                <div data-section="params" style={{ padding: '10px 12px' }}>
                  <PrompdParameterList
                    parameters={parsedParams}
                    values={parameters}
                    onChange={handleParameterChange}
                    layout="adaptive"
                    columns={2}
                  />
                </div>
              )}
            </div>
          )}

          {/* Content area */}
          <div data-section="content" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {state.status === 'error' && state.error && (
          <div
            style={{
              padding: '16px',
              margin: '12px',
              background: theme === 'dark' ? 'rgba(239, 68, 68, 0.1)' : '#fef2f2',
              border: `1px solid ${theme === 'dark' ? 'rgba(239, 68, 68, 0.3)' : '#fecaca'}`,
              borderRadius: '6px',
              color: theme === 'dark' ? '#fca5a5' : '#dc2626',
              fontSize: '13px',
              fontFamily: 'monospace'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>Compilation Error</div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {state.error}
                </pre>
              </div>
            </div>
          </div>
        )}

        {(state.status === 'success' || state.status === 'compiling') && displayContent && (
          isXmlContent ? (
            // XML content: Show designer view or raw syntax-highlighted XML
            xmlViewMode === 'designer' ? (
              <div style={{ padding: '16px', overflow: 'auto', height: '100%' }}>
                <XmlDesignView
                  ref={xmlDesignViewRef}
                  xmlContent={displayContent}
                  onChange={() => {}} // Read-only in preview
                  theme={theme}
                  readOnly={true}
                />
              </div>
            ) : (
              <Editor
                height={monacoHeight}
                value={displayContent}
                language="xml"
                theme={getMonacoTheme(theme === 'dark')}
                beforeMount={registerPrompdThemes}
                options={{
                  ...readOnlyEditorOptions,
                  lineNumbers: 'on',
                  folding: true,
                  wordWrap: 'on',
                  scrollBeyondLastLine: false,
                  scrollbar: {
                    vertical: 'auto',
                    horizontal: 'hidden'
                  },
                  padding: { top: 12, bottom: 12 },
                  fontSize: 13
                }}
              />
            )
          ) : viewMode === 'rendered' && outputFormat === 'markdown' ? (
            <WysiwygEditor
              value={displayContent}
              readOnly
              height="100%"
              theme={theme}
              showToolbar={false}
            />
          ) : (
            <Editor
              height={monacoHeight}
              value={displayContent}
              language={outputFormat === 'markdown' ? 'markdown' : 'plaintext'}
              theme={getMonacoTheme(theme === 'dark')}
              beforeMount={registerPrompdThemes}
              options={{
                ...readOnlyEditorOptions,
                lineNumbers: 'off',
                folding: false,
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                scrollbar: {
                  vertical: 'auto',
                  horizontal: 'hidden'
                },
                padding: { top: 12, bottom: 12 },
                fontSize: 13
              }}
            />
          )
        )}

        {state.status === 'idle' && !content.trim() && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: theme === 'dark' ? 'var(--text-muted)' : '#94a3b8',
              fontSize: '13px',
              fontStyle: 'italic'
            }}
          >
            Enter content to see preview
          </div>
        )}
          </div>
        </div>

        {/* Minimap overlay */}
        {showMinimap && minimapSections.length > 0 && (
          <ContentMinimap
            sections={minimapSections}
            theme={theme}
            containerRef={contentAreaRef}
            onScrollToSection={scrollToSection}
          />
        )}
      </div>
    </div>
  )
}

/**
 * Simple fallback: Extract markdown body from prmd content
 * Used when local compiler is not available
 */
function extractMarkdownBody(content: string, params: Record<string, unknown>): string {
  const lines = content.split('\n')
  let inFrontmatter = false
  let frontmatterEnd = -1

  // Find frontmatter boundaries
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (trimmed === '---') {
      if (!inFrontmatter) {
        inFrontmatter = true
      } else {
        frontmatterEnd = i
        break
      }
    }
  }

  // Extract body after frontmatter
  let body = frontmatterEnd >= 0
    ? lines.slice(frontmatterEnd + 1).join('\n')
    : content

  // Simple parameter substitution
  // Replace {{ param }} with values
  body = body.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, paramName) => {
    const value = params[paramName]
    if (value !== undefined) {
      return String(value)
    }
    return match // Keep original if param not provided
  })

  // Replace {param} with values (simple syntax)
  body = body.replace(/\{(\w+)\}/g, (match, paramName) => {
    const value = params[paramName]
    if (value !== undefined) {
      return String(value)
    }
    return match
  })

  return body.trim()
}

export default CompiledPreview

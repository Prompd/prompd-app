/**
 * CompiledPreview - Real-time compiled markdown preview for .prmd files
 *
 * Compiles the prmd content via the local compiler (Electron) or backend API
 * and renders the result as formatted markdown.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Loader2, AlertCircle, RefreshCw, CheckCircle2, Clock, Sparkles, ChevronDown, ChevronRight, Eye, Code, Maximize2, Minimize2, X, Hash, FileText, Scissors, Layout, Map } from 'lucide-react'
import { PrompdParameterList, type PrompdParameter } from '@prompd/react'
import Editor from '@monaco-editor/react'
import MarkdownPreview from '../components/MarkdownPreview'
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
  onClose
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
  const [paramsCollapsed, setParamsCollapsed] = useState(false)
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

  // Parse content to extract parameter definitions and content-type
  const { parsedParams, contentType } = useMemo((): { parsedParams: PrompdParameter[], contentType: 'md' | 'xml' } => {
    try {
      const parsed = parsePrompd(content)

      // Detect content-type from frontmatter (default to 'md' for markdown)
      const rawContentType = parsed.frontmatter?.['content-type'] || parsed.frontmatter?.contentType
      const detectedContentType: 'md' | 'xml' = rawContentType === 'xml' ? 'xml' : 'md'

      if (!parsed.frontmatter?.parameters) {
        return { parsedParams: [], contentType: detectedContentType }
      }

      // Handle both array and object format parameters
      const params = parsed.frontmatter.parameters
      let paramList: PrompdParameter[] = []

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

      return { parsedParams: paramList, contentType: detectedContentType }
    } catch {
      return { parsedParams: [], contentType: 'md' }
    }
  }, [content])

  // For XML content-type, transforms don't apply
  const isXmlContent = contentType === 'xml'

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
  }, [showParameters, parsedParams, displayContent, isXmlContent])

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

    // For params-section, scroll to the parameters area and expand if collapsed
    if (sectionId === 'params-section' || sectionId.startsWith('param-')) {
      const needsExpand = paramsCollapsed
      if (needsExpand) {
        setParamsCollapsed(false)
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

    // For headings, scroll to the content section
    if (sectionId.startsWith('heading-')) {
      scrollTo('[data-section="content"]', 0)
    }
  }, [paramsCollapsed])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height,
        background: theme === 'dark' ? 'var(--panel)' : '#ffffff',
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
            {/* Actions: Minimap, Recompile, Maximize, Close */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
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
                <Map size={13} />
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
          {/* Parameters Section - only show when parameters exist */}
          {showParameters && parsedParams.length > 0 && (
            <div
              data-section="params"
              style={{
                padding: paramsCollapsed ? '12px 16px' : '16px',
                background: 'var(--panel-2)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                margin: '12px',
                flexShrink: 0
              }}
            >
              <button
                onClick={() => setParamsCollapsed(!paramsCollapsed)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: 0,
                  marginBottom: paramsCollapsed ? 0 : '12px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--text)',
                  textAlign: 'left'
                }}
              >
                {paramsCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                <Sparkles size={14} style={{ color: 'var(--accent)' }} />
                <span>Parameters</span>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 400, marginLeft: '4px' }}>
                  ({parsedParams.length})
                </span>
              </button>
              {!paramsCollapsed && (
                <PrompdParameterList
                  parameters={parsedParams}
                  values={parameters}
                  onChange={handleParameterChange}
                  layout="adaptive"
                  columns={2}
                />
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
                height="100%"
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
            <MarkdownPreview
              content={displayContent}
              height="100%"
              theme={theme}
            />
          ) : (
            <Editor
              height="100%"
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

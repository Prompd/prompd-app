/**
 * Execution Service
 * Handles compiling and executing prompd files with the backend
 */

import type { ExecutionConfig, ExecutionResult } from '../types/wizard'
import type { PrompdCompiledPrompt } from '@prompd/react'
import { packageCache } from './packageCache'
import { executionRouter } from './executionRouter'
import { localCompiler } from './localCompiler'
import { loadEnvVars } from './envLoader'
import { prompdSettings } from './prompdSettings'
import { useUIStore } from '../../stores/uiStore'

/**
 * Approximate pricing per 1M tokens for common models
 * Prices are in USD. Format: { input: price, output: price }
 * Updated as of February 2026
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4.1': { input: 2.00, output: 8.00 },
  'gpt-4.1-mini': { input: 0.40, output: 1.60 },
  'gpt-4.1-nano': { input: 0.10, output: 0.40 },
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
  'o3-mini': { input: 1.10, output: 4.40 },
  // Anthropic
  'claude-opus-4-6': { input: 5.00, output: 25.00 },
  'claude-sonnet-4-5-20250929': { input: 3.00, output: 15.00 },
  'claude-haiku-4-5-20251001': { input: 1.00, output: 5.00 },
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
  'claude-opus-4-5-20251101': { input: 5.00, output: 25.00 },
  // Google Gemini
  'gemini-2.0-flash-exp': { input: 0.075, output: 0.30 },
  'gemini-1.5-pro': { input: 1.25, output: 5.00 },
  'gemini-1.5-flash': { input: 0.075, output: 0.30 },
  // Groq (free tier, nominal pricing)
  'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
  'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
  'mixtral-8x7b-32768': { input: 0.24, output: 0.24 },
  // Mistral
  'mistral-large-latest': { input: 2.00, output: 6.00 },
  'mistral-small-latest': { input: 0.20, output: 0.60 },
  // DeepSeek
  'deepseek-chat': { input: 0.14, output: 0.28 },
  'deepseek-coder': { input: 0.14, output: 0.28 },
}

/**
 * Calculate estimated cost based on token usage and model
 * First tries to use pricing from uiStore (populated from backend API),
 * then falls back to hardcoded pricing table
 */
function calculateEstimatedCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number
): number | undefined {
  let inputPrice: number | undefined
  let outputPrice: number | undefined

  // First try to get pricing from uiStore (from backend API)
  const providersWithPricing = useUIStore.getState().llmProvider.providersWithPricing
  if (providersWithPricing) {
    const providerData = providersWithPricing.find(p => p.providerId === provider)
    if (providerData) {
      const modelData = providerData.models.find(m => m.model === model)
      if (modelData && modelData.inputPrice != null && modelData.outputPrice != null) {
        inputPrice = modelData.inputPrice
        outputPrice = modelData.outputPrice
      }
    }
  }

  // Fall back to hardcoded pricing table
  if (inputPrice == null || outputPrice == null) {
    // Try exact model match first
    let pricing = MODEL_PRICING[model]

    // Try with provider prefix
    if (!pricing) {
      pricing = MODEL_PRICING[`${provider}/${model}`]
    }

    // Try partial match (for model variants)
    if (!pricing) {
      const modelLower = model.toLowerCase()
      for (const [key, value] of Object.entries(MODEL_PRICING)) {
        if (modelLower.includes(key.toLowerCase()) || key.toLowerCase().includes(modelLower)) {
          pricing = value
          break
        }
      }
    }

    if (pricing) {
      inputPrice = pricing.input
      outputPrice = pricing.output
    }
  }

  if (inputPrice == null || outputPrice == null) {
    return undefined
  }

  // Calculate cost (pricing is per 1M tokens)
  const inputCost = (inputTokens / 1_000_000) * inputPrice
  const outputCost = (outputTokens / 1_000_000) * outputPrice
  const totalCost = inputCost + outputCost

  // Round to 6 decimal places
  return Math.round(totalCost * 1_000_000) / 1_000_000
}

/**
 * Check if the selected model supports image generation
 * Uses pricing data from uiStore (populated from backend API)
 */
export function modelSupportsImageGeneration(provider: string, model: string): boolean {
  const providersWithPricing = useUIStore.getState().llmProvider.providersWithPricing
  if (!providersWithPricing) return false
  const providerData = providersWithPricing.find(p => p.providerId === provider)
  if (!providerData) return false
  const modelData = providerData.models.find(m => m.model === model)
  return modelData?.supportsImageGeneration === true
}

/**
 * Parse compiled markdown prompt into sections
 * Splits the prompt by markdown headers (# System, # User, # Context, etc.)
 */
function parseCompiledPromptIntoSections(compiledMarkdown: string): Record<string, string> {
  const sections: Record<string, string> = {}

  // Match markdown headers like # System, ## User, # Context, etc.
  const headerRegex = /^#{1,3}\s+(System|User|Context|Assistant|Task|Output|Response)\s*$/gim

  const lines = compiledMarkdown.split('\n')
  let currentSection: string | null = null
  let currentContent: string[] = []

  for (const line of lines) {
    const match = line.match(headerRegex)

    if (match) {
      // Save previous section
      if (currentSection) {
        sections[currentSection.toLowerCase()] = currentContent.join('\n').trim()
      }

      // Start new section
      currentSection = match[1]
      currentContent = []
    } else if (currentSection) {
      currentContent.push(line)
    }
  }

  // Save final section
  if (currentSection) {
    sections[currentSection.toLowerCase()] = currentContent.join('\n').trim()
  }

  return sections
}

/**
 * Remove a named section (e.g. "system") from compiled markdown.
 * Strips the heading and all content up to the next heading of equal or higher level.
 */
function removeSection(compiledMarkdown: string, sectionName: string): string {
  const lines = compiledMarkdown.split('\n')
  const result: string[] = []
  let skipping = false
  let skipLevel = 0

  for (const line of lines) {
    // Check if this is a heading that matches the section to remove
    const headingMatch = line.match(/^(#{1,3})\s+(.+?)\s*$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const name = headingMatch[2].toLowerCase()

      if (skipping) {
        // Stop skipping when we hit another heading at same or higher level
        if (level <= skipLevel) {
          skipping = false
          result.push(line)
        }
        // else: subheading within the section, keep skipping
      } else if (name === sectionName.toLowerCase()) {
        // Start skipping this section
        skipping = true
        skipLevel = level
      } else {
        result.push(line)
      }
    } else if (!skipping) {
      result.push(line)
    }
  }

  // Clean up any resulting double blank lines
  return result.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Convert plain compiled markdown into @prompd/react PrompdCompiledPrompt format
 */
function buildCompiledPromptStructure(
  compiledMarkdown: string,
  config: ExecutionConfig,
  options?: { useLocalCompiler?: boolean; compilerVersion?: string }
): PrompdCompiledPrompt {
  const sections = parseCompiledPromptIntoSections(compiledMarkdown)

  // Try to extract package info from packageRef or from the prompt content itself
  let packageName = config.prompdSource.packageRef
  let packageVersion: string | undefined

  if (packageName) {
    // Parse version from packageRef like "@prompd/blog@1.0.0/prompts/file.prmd"
    const versionMatch = packageName.match(/@([^/]+)\/([^@/]+)@([^/]+)/)
    if (versionMatch) {
      packageName = `@${versionMatch[1]}/${versionMatch[2]}`
      packageVersion = versionMatch[3]
    }
  } else {
    // Try to extract from frontmatter in the source content
    const content = config.prompdSource.content
    const nameMatch = content.match(/^name:\s*["']?([^"'\n]+)["']?\s*$/m)
    const versionMatch = content.match(/^version:\s*["']?([^"'\n]+)["']?\s*$/m)
    if (nameMatch) packageName = nameMatch[1].trim()
    if (versionMatch) packageVersion = versionMatch[1].trim()
  }

  // Determine compiler name based on whether we used local compiler
  const compilerName = options?.useLocalCompiler
    ? `@prompd/cli${options.compilerVersion ? ` v${options.compilerVersion}` : ''}`
    : 'prompd-cli (backend)'

  return {
    finalPrompt: compiledMarkdown,
    sections: {
      system: sections.system,
      context: sections.context,
      user: sections.user
    },
    parameters: config.parameters,
    metadata: {
      packageName,
      packageVersion,
      compiledAt: new Date().toISOString(),
      compiler: compilerName
    }
  }
}

/**
 * File reader function for local file references
 * Returns file content given a relative path
 */
export type FileReader = (path: string) => Promise<string | null>

/**
 * Options for environment variable loading during execution
 */
export interface EnvOptions {
  workspacePath?: string | null
  selectedEnvFile?: string | null
}

/**
 * Execute a prompd configuration against an LLM provider
 */
export async function executePrompdConfig(
  config: ExecutionConfig,
  getToken: () => Promise<string | null>,
  readFile?: FileReader,  // Optional file reader for local file references
  sourceFilePath?: string,  // Optional source file path for resolving relative references
  envOptions?: EnvOptions,  // Optional env file options for compile-time variable substitution
  sourcePackageId?: string  // Optional package ID for resolving file references from package cache
): Promise<ExecutionResult> {
  const startTime = Date.now()

  try {
    // Validate required parameters
    const allParameters = [
      ...config.prompdSource.originalParams,
      ...config.customParameters
    ]
    const missingRequired = allParameters
      .filter(p => p.required && !config.parameters[p.name] && p.default === undefined)
      .map(p => p.name)

    if (missingRequired.length > 0) {
      throw new Error(`Missing required parameters: ${missingRequired.join(', ')}`)
    }

    // Build the .prmd file with specialty sections in YAML frontmatter
    // Paths are already relative (converted during extraction in App.tsx)
    const prompdFile = buildPrompdFileForExecution(config)

    // Get authentication token
    const token = await getToken()
    if (!token) {
      throw new Error('Authentication required')
    }

    // Collect referenced files from workspace for local file inheritance
    // This supports prompts that have: inherits: "./base.prmd", system: "./tech.md", etc.
    if (!readFile) {
      console.warn('[executionService] No file reader provided - local file references will not be collected')
      console.warn('[executionService] To use local file inheritance, open a workspace folder first')
    }

    // Determine source file path for relative path resolution
    // This is needed when the prompt has inherits: "./base.prmd" - we need to know
    // which directory to resolve "./" relative to
    let resolvedSourcePath = sourceFilePath

    // If not provided, try to extract from package reference
    if (!resolvedSourcePath && config.prompdSource.type === 'package' && config.prompdSource.packageRef) {
      // Example: "@prompd/blog@1.0.0/prompts/writer.prmd" → "prompts/writer.prmd"
      const match = config.prompdSource.packageRef.match(/\/([^@]+)$/)
      if (match) {
        resolvedSourcePath = match[1]
        console.log('[executionService] Extracted source file path from packageRef:', resolvedSourcePath)
      }
    }

    if (resolvedSourcePath) {
      console.log('[executionService] Using source file path for relative resolution:', resolvedSourcePath)
    } else {
      console.log('[executionService] No source file path - file references should be workspace-relative')
    }

    // First, parse the using block to get prefix mappings
    const { frontmatter } = parsePrompdContent(prompdFile)
    const prefixMap = parseUsingBlock(frontmatter)
    console.log('[executionService] Parsed prefix map:', prefixMap)

    const files: Record<string, string> = await collectReferencedFiles(
      prompdFile,  // Use the built prompt file (has frontmatter with file references)
      readFile,  // File reader callback (optional)
      3,  // Maximum depth to prevent infinite inheritance chains
      resolvedSourcePath,  // Source file path for relative resolution
      0,  // currentDepth
      {},  // collected
      prefixMap,  // prefix map from 'using' block
      sourcePackageId  // Package ID for resolving file references from package cache
    )

    console.log('[executionService] Collected files:', Object.keys(files))
    if (Object.keys(files).length === 0 && readFile) {
      console.warn('[executionService] No files were collected despite having a file reader - check file paths')
    }

    // Rewrite alias references in the prompt content before sending to compiler
    // This transforms: inherits: "@p/path" -> inherits: "@prompd/pkg@1.0.0/path"
    // The compiler doesn't have access to the 'using' block context, so we resolve it here
    const rewrittenPrompt = rewriteAliasReferences(prompdFile, prefixMap)

    // Log the built prompt for debugging
    console.log('[executionService] Built prompt file (after alias rewriting):')
    console.log('--- PROMPT START ---')
    console.log(rewrittenPrompt)
    console.log('--- PROMPT END ---')

    // === LOCAL-FIRST COMPILATION AND EXECUTION ===
    // Use local compiler (via Electron IPC) instead of sending to backend
    // This enables offline operation and faster execution

    let compiledPrompt: PrompdCompiledPrompt | string | undefined
    let compiledMarkdown = ''

    // Load environment variables for compile-time substitution
    // Priority: system PROMPD_* vars -> selected .env file -> user parameters
    let envVars: Record<string, string> = {}
    if (envOptions?.workspacePath) {
      try {
        envVars = await loadEnvVars(envOptions.workspacePath, envOptions.selectedEnvFile)
        if (Object.keys(envVars).length > 0) {
          console.log('[executionService] Loaded env vars:', Object.keys(envVars))
        }
      } catch (err) {
        console.warn('[executionService] Failed to load env vars:', err)
      }
    }

    // Merge parameters: env vars available as {{ env.VAR_NAME }}, user params can override
    const mergedParameters = {
      env: envVars,  // Available as {{ env.VAR_NAME }} in templates
      ...config.parameters  // User params have highest priority
    }

    // Track compiler info for metadata
    let usedLocalCompiler = false
    let compilerVersion: string | undefined

    // Check if local compiler is available (running in Electron)
    if (localCompiler.hasLocalCompiler()) {
      console.log('[executionService] Using LOCAL compiler (Electron)')
      usedLocalCompiler = true

      // Get compiler version for metadata
      try {
        const compilerInfo = await localCompiler.getInfo()
        if (compilerInfo.success && compilerInfo.version) {
          compilerVersion = compilerInfo.version
        }
      } catch {
        // Version info not critical, continue without it
      }

      // Compile locally using @prompd/cli via IPC
      // Pass full source file path so compiler can use NodeFileSystem
      // This enables proper package resolution and relative imports
      const compileResult = await localCompiler.compileWithContext(rewrittenPrompt, {
        format: 'markdown',
        parameters: mergedParameters,
        filePath: sourceFilePath,  // Full disk path (not workspace + filename)
        registryUrl: prompdSettings.getRegistryUrl()
      })

      if (compileResult.success && compileResult.output) {
        compiledMarkdown = compileResult.output
        compiledPrompt = buildCompiledPromptStructure(compiledMarkdown, config, {
          useLocalCompiler: true,
          compilerVersion
        })
        console.log('[executionService] Local compilation successful:', {
          outputLength: compiledMarkdown.length,
          warnings: compileResult.warnings?.length || 0,
          compilerVersion
        })
      } else {
        // Compilation failed - stop execution and report the error
        const errorMessage = compileResult.error || 'Unknown compilation error'
        console.error('[executionService] Compilation failed:', errorMessage)
        throw new Error(`Compilation failed: ${errorMessage}`)
      }
    } else {
      console.log('[executionService] Local compiler not available, using prompt as-is')
      compiledMarkdown = rewrittenPrompt
    }

    // Extract system section from compiled markdown to send as system role
    // The compiler outputs ## System as a markdown heading — we extract it and send
    // it via the provider's native system prompt mechanism (role: "system" for OpenAI,
    // system field for Anthropic, systemInstruction for Google, etc.)
    let promptForExecution = compiledMarkdown
    let systemPrompt: string | undefined

    const sections = parseCompiledPromptIntoSections(compiledMarkdown)
    if (sections.system) {
      systemPrompt = sections.system
      // Remove the ## System section from the prompt so it's not duplicated
      promptForExecution = removeSection(compiledMarkdown, 'system')
      console.log('[executionService] Extracted system prompt:', systemPrompt.slice(0, 100) + (systemPrompt.length > 100 ? '...' : ''))
    }

    // Execute via execution router (local-first with fallback to remote)
    console.log('[executionService] Executing via router:', {
      provider: config.provider,
      model: config.model,
      promptLength: promptForExecution.length,
      hasSystemPrompt: !!systemPrompt,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      mode: config.mode
    })

    const routerResult = await executionRouter.execute({
      provider: config.provider,
      model: config.model,
      prompt: promptForExecution,
      systemPrompt,
      compile: false,  // Already compiled above
      parameters: config.parameters,
      maxTokens: config.maxTokens ?? 4096,
      temperature: config.temperature ?? 0.7,
      mode: config.mode ?? 'default',
      enableImageGeneration: (config.imageGeneration !== false) && modelSupportsImageGeneration(config.provider, config.model)
    })

    console.log('[executionService] Router result:', {
      success: routerResult.success,
      executionMode: routerResult.metadata.executionMode,
      responseLength: routerResult.response?.length || 0
    })

    if (!routerResult.success) {
      throw new Error(routerResult.error || 'Execution failed')
    }

    // Calculate estimated cost if we have token usage
    const estimatedCost = routerResult.usage
      ? calculateEstimatedCost(
          routerResult.metadata.provider,
          routerResult.metadata.model,
          routerResult.usage.promptTokens || 0,
          routerResult.usage.completionTokens || 0
        )
      : undefined

    // Build execution result
    const result: ExecutionResult = {
      content: routerResult.response || '',
      metadata: {
        provider: routerResult.metadata.provider,
        model: routerResult.metadata.model,
        duration: routerResult.metadata.duration,
        tokensUsed: routerResult.usage ? {
          input: routerResult.usage.promptTokens || 0,
          output: routerResult.usage.completionTokens || 0,
          total: routerResult.usage.totalTokens || 0
        } : undefined,
        estimatedCost,
        executionMode: routerResult.metadata.executionMode,
        // Generation settings
        maxTokens: config.maxTokens ?? 4096,
        temperature: config.temperature ?? 0.7,
        mode: config.mode ?? 'default'
      },
      compiledPrompt: compiledPrompt || (compiledMarkdown ? buildCompiledPromptStructure(compiledMarkdown, config, {
        useLocalCompiler: usedLocalCompiler,
        compilerVersion
      }) : undefined),
      status: 'success',
      timestamp: new Date().toISOString()
    }

    console.log('[executionService] Returning execution result:', {
      hasCompiledPrompt: !!result.compiledPrompt,
      executionMode: routerResult.metadata.executionMode,
      resultKeys: Object.keys(result)
    })

    return result
  } catch (error) {
    console.error('Execution failed:', error)

    return {
      content: error instanceof Error ? error.message : 'Execution failed',
      metadata: {
        provider: config.provider,
        model: config.model,
        duration: Date.now() - startTime
      },
      status: 'error',
      timestamp: new Date().toISOString()
    }
  }
}

/**
 * Build the .prmd file for execution
 *
 * Strategy:
 * - Keep the original frontmatter unchanged (preserves inherits, using, file references)
 * - Append user's custom sections as inline markdown (these override inherited sections)
 * - Frontend will separately collect and send referenced files via the `files` parameter
 *
 * Note: File paths in config.sections are ALREADY RELATIVE to the source .prmd file
 * (converted during extraction in App.tsx per RELATIVE-PATH-FIX.md)
 */
function buildPrompdFileForExecution(config: ExecutionConfig): string {
  const lines: string[] = []

  // Parse the original content
  const { frontmatter, body } = parsePrompdContent(config.prompdSource.content)
  console.log('[buildPrompdFileForExecution] Parsed:', {
    frontmatterLength: frontmatter.length,
    bodyLength: body.length,
    frontmatterPreview: frontmatter.substring(0, 200),
    bodyPreview: body.substring(0, 200)
  })

  // Build modified frontmatter by injecting user-added file sections
  // This allows users to add/override specialty sections via the UI
  const frontmatterLines = frontmatter.split('\n')

  // Track which sections need to be added
  const sectionsToInject: Record<string, string> = {}

  // Check for file-type sections that need to be injected into frontmatter
  // Paths are already relative (converted at extraction time), so use them as-is
  const sectionOrder = ['system', 'user', 'assistant', 'task', 'output'] as const
  for (const sectionName of sectionOrder) {
    const section = config.sections[sectionName]
    if (section && 'filePath' in section && section.type === 'file' && section.filePath) {
      // Paths are already relative from App.tsx extraction
      sectionsToInject[sectionName] = `"${section.filePath}"`
    }
  }

  // Handle context separately (it's an array)
  const contextSection = config.sections.context
  if (contextSection && Array.isArray(contextSection)) {
    const filePaths = contextSection
      .filter(ctx => ctx?.type === 'file' && ctx?.filePath)
      .map(ctx => `"${ctx.filePath!}"`)  // Paths already relative
    if (filePaths.length > 0) {
      sectionsToInject['context'] = filePaths.join('\n  - ')
    }
  }

  // Rebuild frontmatter with injected sections
  lines.push('---')

  // First, copy original frontmatter lines (excluding sections we're overriding)
  const sectionsToOverride = Object.keys(sectionsToInject)

  // More sophisticated filtering to handle multiline array syntax
  const filteredFrontmatter: string[] = []
  let skipMode: string | null = null  // Track which section's array items we're skipping

  for (let i = 0; i < frontmatterLines.length; i++) {
    const line = frontmatterLines[i]
    const trimmed = line.trim()

    // Check if we're currently skipping array items for a section
    if (skipMode) {
      // Stop skipping when we hit a non-indented line or a different section
      if (trimmed && !line.startsWith('  ') && !line.startsWith('\t')) {
        skipMode = null
      } else {
        // Still in the array, skip this line
        continue
      }
    }

    // Check if this line starts a section we're overriding
    let shouldSkip = false
    for (const sectionName of sectionsToOverride) {
      if (trimmed.startsWith(`${sectionName}:`)) {
        // Check if the next line is an array item (starts with "  -")
        const nextLine = frontmatterLines[i + 1]
        if (nextLine && (nextLine.trim().startsWith('-') && (nextLine.startsWith('  ') || nextLine.startsWith('\t')))) {
          // This is an array section, enter skip mode
          skipMode = sectionName
        }
        shouldSkip = true
        break
      }
    }

    if (!shouldSkip) {
      filteredFrontmatter.push(line)
    }
  }

  // Only add non-empty frontmatter lines (skip if frontmatter was empty)
  filteredFrontmatter.forEach(line => {
    // Skip empty lines that result from empty frontmatter
    if (filteredFrontmatter.length === 1 && line === '') return
    lines.push(line)
  })

  // Then inject our file-type sections
  if (Object.keys(sectionsToInject).length > 0) {
    console.log('[buildPrompdFileForExecution] Injecting file sections into frontmatter:', sectionsToInject)
  }

  for (const [sectionName, value] of Object.entries(sectionsToInject)) {
    if (sectionName === 'context' && value.includes('\n')) {
      // Array format for context
      lines.push(`${sectionName}:`)
      lines.push(`  - ${value}`)
    } else {
      // Single file format
      lines.push(`${sectionName}: ${value}`)
    }
  }

  lines.push('---')
  lines.push('')
  lines.push(body)
  lines.push('')

  // Append user's custom sections as inline markdown (these OVERRIDE inherited sections)
  // The compiler processes inline sections AFTER file-based sections, so these take precedence
  //
  // IMPORTANT: Only append sections with type: 'text' (inline content).
  // Sections with type: 'file' should remain in the frontmatter and will be
  // collected via collectReferencedFiles() and sent in the files parameter.
  const textSectionOrder = ['system', 'user', 'context', 'assistant', 'task', 'output'] as const

  for (const sectionName of textSectionOrder) {
    const section = config.sections[sectionName]

    if (!section) continue

    // Handle context (array of sections) differently
    if (sectionName === 'context' && Array.isArray(section)) {
      // Only include text-type context sections (file-type should be in frontmatter)
      const textContexts = section.filter(ctx => ctx?.type === 'text' && ctx?.content)
      if (textContexts.length > 0) {
        lines.push('## Context')
        textContexts.forEach(ctx => {
          lines.push(ctx.content.trim())
          lines.push('')
        })
      }
    } else if (section && 'content' in section && section.content) {
      // Only append if this is text content (not a file reference)
      // File references should stay in the frontmatter and be collected separately
      if (section.type === 'text') {
        const headerName = sectionName.charAt(0).toUpperCase() + sectionName.slice(1)
        lines.push(`## ${headerName}`)
        lines.push(section.content.trim())
        lines.push('')
      }
      // If type === 'file', skip - it's already in frontmatter and will be collected
    }
  }

  const result = lines.join('\n')
  console.log('[buildPrompdFileForExecution] Built file:', {
    totalLength: result.length,
    lineCount: lines.length,
    preview: result.substring(0, 500)
  })
  return result
}

/**
 * Collect all local file references from a .prmd file
 * Recursively processes inherited files up to maxDepth levels
 *
 * Path Resolution:
 * - Paths with './' or '../' are resolved relative to the source file
 * - Paths without prefix are treated as workspace-relative
 * - When processing package files, relative paths are resolved within the package
 *
 * Supports:
 * - inherits: "./base.prmd" (relative to source file)
 * - context: "contexts/data.csv" (workspace-relative)
 * - system, user, assistant, task, output file references
 *
 * @param content - The .prmd file content
 * @param readFile - File reader callback
 * @param maxDepth - Maximum recursion depth (default 3)
 * @param sourceFilePath - Path to the source .prmd file (for resolving ./ and ../ paths)
 * @param currentDepth - Current recursion depth (internal)
 * @param collected - Already collected files (internal)
 * @param prefixMap - Package prefix mappings (internal)
 * @param sourcePackageId - If set, indicates the source file is from this package (internal)
 * @returns Map of file paths to their content
 */
async function collectReferencedFiles(
  content: string,
  readFile?: FileReader,
  maxDepth: number = 3,
  sourceFilePath?: string,
  currentDepth: number = 0,
  collected: Record<string, string> = {},
  prefixMap?: Record<string, string>,  // Pass through for recursive calls
  sourcePackageId?: string  // If set, indicates we're processing a file from this package
): Promise<Record<string, string>> {

  // Stop if we've hit max depth
  if (currentDepth >= maxDepth) {
    console.log(`[collectReferencedFiles] Max depth ${maxDepth} reached, stopping recursion`)
    return collected
  }

  const { frontmatter } = parsePrompdContent(content)

  // Parse the using block on first call to build prefix map
  // This map is passed through recursive calls
  if (!prefixMap) {
    prefixMap = parseUsingBlock(frontmatter)
  }

  // Normalize source path and get its directory, using only forward slashes
  const normalizedSourcePath = sourceFilePath?.replace(/\\/g, '/')
  const sourceDir = normalizedSourcePath ? normalizedSourcePath.substring(0, normalizedSourcePath.lastIndexOf('/') + 1) : ''
  console.log(`[collectReferencedFiles] Source file: ${normalizedSourcePath}, Source dir: ${sourceDir}`)
  console.log(`[collectReferencedFiles] Source package: ${sourcePackageId || '(local workspace)'}`)
  console.log(`[collectReferencedFiles] Frontmatter to parse:\n${frontmatter}`)
  console.log(`[collectReferencedFiles] readFile provided: ${!!readFile}`)
  console.log(`[collectReferencedFiles] prefixMap:`, prefixMap)


  // Extract all file references from frontmatter (both local and package-prefixed)
  const fileReferences: string[] = []

  // Match inherits: "./file.prmd", inherits: './file.prmd', or inherits: ./file.prmd (without quotes)
  // Also matches: inherits: "@p/assistants/code-assistant.prmd" (package-prefixed)
  // Use a more flexible pattern that handles both quoted and unquoted paths
  // and works with Windows line endings (\r\n) and Unix (\n)
  const inheritsMatch = frontmatter.match(/^inherits:\s*["']?([^"'\r\n]+?)["']?\s*$/m)
  console.log(`[collectReferencedFiles] inherits regex match:`, inheritsMatch)
  if (inheritsMatch) {
    const inheritsPath = inheritsMatch[1].trim()
    console.log(`[collectReferencedFiles] Found inherits: ${inheritsPath}`)
    fileReferences.push(inheritsPath)
  } else {
    // Try a simpler match to see what's in the frontmatter
    const simpleMatch = frontmatter.match(/inherits:\s*(.+)/m)
    console.log(`[collectReferencedFiles] Simple inherits match:`, simpleMatch)
  }

  // Match specialty sections with single file: system: "./file.md", user: "src/file.md", etc.
  // Also matches: system: "@p/systems/coding.md" (package-prefixed)
  // Captures both "./file.md", "src/file.md", and "@p/file.md" formats
  const sectionPattern = /^(system|user|assistant|task|output|context):\s*["']([^"']+?)["']\s*$/gm
  let sectionMatch
  while ((sectionMatch = sectionPattern.exec(frontmatter)) !== null) {
    const path = sectionMatch[2]
    console.log(`[collectReferencedFiles] Single file match for ${sectionMatch[1]}: ${path}`)
    // Collect local files and package-prefixed paths (not full package refs like @namespace/pkg@version or absolute paths)
    if (!path.startsWith('/') && !path.includes(':\\') && !path.match(/^@[^/]+\/[^/]+@\d/)) {
      fileReferences.push(path)
    }
  }

  // Match specialty sections with array syntax (all sections support this per CLI validation)
  // system:
  //   - "./file1.md"
  //   - "./file2.md"
  //   - "@p/systems/coding.md"  (package-prefixed)
  // Note: Handle both Unix (\n) and Windows (\r\n) line endings
  const arrayPattern = /^(system|user|assistant|task|output|context):\s*\r?\n((?:\s+-\s*["'][^"']+["']\s*\r?\n?)+)/gm
  let arrayMatch
  while ((arrayMatch = arrayPattern.exec(frontmatter)) !== null) {
    console.log(`[collectReferencedFiles] Array match for ${arrayMatch[1]}:`, arrayMatch[2])
    const items = arrayMatch[2].matchAll(/["']([^"']+)["']/g)
    for (const item of items) {
      const path = item[1]
      console.log(`[collectReferencedFiles] Found array item path: ${path}`)
      // Collect local file references and package-prefixed paths
      // Valid: "./file.md", "../file.md", "src/file.md", "@p/file.md"
      // Invalid: "@namespace/pkg@1.0.0", "/absolute/path", "C:\windows\path"
      if (!path.startsWith('/') && !path.includes(':\\') && !path.match(/^@[^/]+\/[^/]+@\d/)) {
        fileReferences.push(path)
      }
    }
  }

  console.log(`[collectReferencedFiles] Depth ${currentDepth}: Found ${fileReferences.length} file references:`, fileReferences)

  // Read each referenced file
  for (const rawPath of fileReferences) {
    // Normalize path to always use forward slashes
    const normalizedRawPath = rawPath.replace(/\\/g, '/');

    // Check if this is a package-prefixed path (e.g., @p/assistants/code-assistant.prmd)
    const packageResolution = resolvePrefixedPath(normalizedRawPath, prefixMap)

    if (packageResolution) {
      // This is a package-prefixed path - resolve from package cache
      const { packageId, filePath } = packageResolution
      const cacheKey = `${packageId}/${filePath}`

      // Skip if already collected
      if (collected[cacheKey]) {
        console.log(`[collectReferencedFiles] Skipping already collected package file: ${cacheKey}`)
        continue
      }

      try {
        console.log(`[collectReferencedFiles] Reading from package cache: ${packageId} -> ${filePath}`)

        // Try to get from package cache
        const fileContent = await packageCache.getFileContent(packageId, filePath)

        if (!fileContent) {
          console.warn(`[collectReferencedFiles] Package file not found in cache: ${cacheKey}`)
          console.warn(`[collectReferencedFiles] Make sure package ${packageId} is installed`)
          continue
        }

        // Store with the package-prefixed key so backend can find it
        collected[cacheKey] = fileContent
        // Also store with the raw path so inherits resolution works
        collected[normalizedRawPath] = fileContent
        console.log(`[collectReferencedFiles] Collected package file ${normalizedRawPath} -> ${cacheKey} (${fileContent.length} bytes)`)

        // If it's a .prmd file, recursively collect its references
        if (filePath.endsWith('.prmd') || filePath.endsWith('.prompd')) {
          console.log(`[collectReferencedFiles] Recursively processing package file: ${filePath} (in package ${packageId})`)
          // For package files, pass the packageId so relative paths are resolved within the package
          await collectReferencedFiles(fileContent, readFile, maxDepth, filePath, currentDepth + 1, collected, prefixMap, packageId)
        }

      } catch (error) {
        console.warn(`[collectReferencedFiles] Failed to read package file ${cacheKey}:`, error)
      }

      continue  // Skip the local file resolution below
    }

    // Resolve relative paths - behavior depends on whether we're inside a package or local workspace
    let resolvedPath: string;

    // Paths starting with './' or '../' are relative to the source file.
    // Other paths are treated as workspace-relative (or package-relative if inside a package).
    if (normalizedRawPath.startsWith('./') || normalizedRawPath.startsWith('../')) {
      if (!sourceDir) {
        console.warn(`[collectReferencedFiles] Cannot resolve relative path "${rawPath}" without a source file path.`);
        resolvedPath = normalizedRawPath.startsWith('./') ? normalizedRawPath.substring(2) : normalizedRawPath;
      } else {
        // Strip leading ./ from the path before combining with sourceDir
        const relativePath = normalizedRawPath.startsWith('./')
          ? normalizedRawPath.substring(2)
          : normalizedRawPath;

        // Combine source directory with relative path
        const combinedPath = sourceDir + relativePath;

        // Normalize the path by handling .. segments
        const pathParts = combinedPath.split('/');
        const resolvedParts: string[] = [];
        for (const part of pathParts) {
          if (part === '..') {
            resolvedParts.pop(); // Go up one level
          } else if (part !== '.' && part !== '') {
            resolvedParts.push(part);
          }
        }
        resolvedPath = resolvedParts.join('/');
        console.log(`[collectReferencedFiles] Resolved ${rawPath} -> ${resolvedPath} (relative to ${sourceDir})`);
      }
    } else {
      // Workspace-relative path (e.g., "contexts/sample-data.csv")
      resolvedPath = normalizedRawPath;
    }

    // If we're inside a package, resolve relative paths from the package cache
    if (sourcePackageId) {
      const packageCacheKey = `${sourcePackageId}/${resolvedPath}`

      // Skip if already collected
      if (collected[packageCacheKey]) {
        console.log(`[collectReferencedFiles] Skipping already collected package file: ${packageCacheKey}`)
        continue
      }

      try {
        console.log(`[collectReferencedFiles] Reading from package cache (relative): ${sourcePackageId} -> ${resolvedPath}`)

        // Try to get from package cache
        const fileContent = await packageCache.getFileContent(sourcePackageId, resolvedPath)

        if (!fileContent) {
          console.warn(`[collectReferencedFiles] Package file not found in cache: ${packageCacheKey}`)
          continue
        }

        // Store with the full package key
        collected[packageCacheKey] = fileContent
        console.log(`[collectReferencedFiles] Collected package file ${rawPath} -> ${packageCacheKey} (${fileContent.length} bytes)`)

        // If it's a .prmd file, recursively collect its references (staying within the package)
        if (resolvedPath.endsWith('.prmd') || resolvedPath.endsWith('.prompd')) {
          console.log(`[collectReferencedFiles] Recursively processing package file: ${resolvedPath}`)
          await collectReferencedFiles(fileContent, readFile, maxDepth, resolvedPath, currentDepth + 1, collected, prefixMap, sourcePackageId)
        }

      } catch (error) {
        console.warn(`[collectReferencedFiles] Failed to read package file ${packageCacheKey}:`, error)
      }

      continue  // Skip the local file resolution below
    }

    // Local workspace file resolution
    // Skip if already collected
    if (collected[resolvedPath]) {
      console.log(`[collectReferencedFiles] Skipping already collected: ${resolvedPath}`)
      continue
    }

    // Skip if no file reader provided
    if (!readFile) {
      console.log(`[collectReferencedFiles] No file reader provided, skipping: ${resolvedPath}`)
      continue
    }

    try {
      // Read file content from workspace
      console.log(`[collectReferencedFiles] Reading file from workspace: ${resolvedPath}`)
      const fileContent = await readFile(resolvedPath)

      if (!fileContent) {
        console.warn(`[collectReferencedFiles] File not found or empty: ${resolvedPath}`)
        continue
      }

      // Store at the resolved path
      collected[resolvedPath] = fileContent
      console.log(`[collectReferencedFiles] Collected ${rawPath} -> ${resolvedPath} (${fileContent.length} bytes)`)

      // If it's a .prmd file, recursively collect its references
      if (resolvedPath.endsWith('.prmd') || resolvedPath.endsWith('.prompd')) {
        console.log(`[collectReferencedFiles] Recursively processing: ${resolvedPath}`)
        await collectReferencedFiles(fileContent, readFile, maxDepth, resolvedPath, currentDepth + 1, collected, prefixMap)
      }

    } catch (error) {
      console.warn(`[collectReferencedFiles] Failed to read ${resolvedPath}:`, error)
      // Continue collecting other files even if one fails
    }
  }

  return collected
}

/**
 * Parse .prmd content into frontmatter and body
 * Handles both Unix (\n) and Windows (\r\n) line endings
 */
function parsePrompdContent(content: string): { frontmatter: string; body: string } {
  // Normalize line endings to Unix style for consistent parsing
  const normalizedContent = content.replace(/\r\n/g, '\n')

  const match = normalizedContent.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)

  if (match) {
    return {
      frontmatter: match[1].trim(),
      body: match[2].trim()
    }
  }

  // No frontmatter found
  return {
    frontmatter: '',
    body: normalizedContent.trim()
  }
}

/**
 * Parse the 'using' block from frontmatter to build a prefix map
 *
 * Supports two formats:
 *
 * Format 1 (array with name/prefix):
 * using:
 *   - name: "@prompd/public-examples@1.1.0"
 *     prefix: "@p"
 *   - name: "@company/blog-templates@2.0.0"
 *     prefix: "@blog"
 *
 * Format 2 (simple key-value):
 * using:
 *   @p: "@prompd/public-examples@1.1.0"
 *   @blog: "@company/blog-templates@2.0.0"
 *
 * Returns: { "@p": "@prompd/public-examples@1.1.0", "@blog": "@company/blog-templates@2.0.0" }
 */
function parseUsingBlock(frontmatter: string): Record<string, string> {
  const prefixMap: Record<string, string> = {}

  // Try Format 1: Array with name/prefix fields
  // using:
  //   - name: "@prompd/public-examples@1.1.0"
  //     prefix: "@p"
  const arrayMatch = frontmatter.match(/^using:\s*\n((?:\s+-[^\n]*\n(?:\s+[^\n-][^\n]*\n)*)+)/m)

  if (arrayMatch) {
    const usingBlock = arrayMatch[1]
    console.log(`[parseUsingBlock] Found array-style using block:\n${usingBlock}`)

    // Split into individual items (each starting with "  - ")
    const items = usingBlock.split(/\n\s+-\s*/).filter(item => item.trim())

    for (const item of items) {
      // Extract name and prefix from each item
      const nameMatch = item.match(/name:\s*["']?([^"'\n]+?)["']?\s*(?:\n|$)/m)
      const prefixMatch = item.match(/prefix:\s*["']?([^"'\n]+?)["']?\s*(?:\n|$)/m)

      if (nameMatch && prefixMatch) {
        const packageRef = nameMatch[1].trim()
        const prefix = prefixMatch[1].trim()
        prefixMap[prefix] = packageRef
        console.log(`[parseUsingBlock] Found array item: ${prefix} -> ${packageRef}`)
      }
    }
  }

  // If no array format found, try Format 2: simple key-value
  if (Object.keys(prefixMap).length === 0) {
    const keyValueMatch = frontmatter.match(/^using:\s*\n((?:\s+@[^:\s]+:\s*["']?[^"'\n]+["']?\s*\n?)+)/m)

    if (keyValueMatch) {
      const usingBlock = keyValueMatch[1]
      // Match each prefix: package mapping
      const prefixPattern = /^\s*(@[^:\s]+):\s*["']?([^"'\n]+?)["']?\s*$/gm
      let match
      while ((match = prefixPattern.exec(usingBlock)) !== null) {
        const prefix = match[1].trim()
        const packageRef = match[2].trim()
        prefixMap[prefix] = packageRef
        console.log(`[parseUsingBlock] Found key-value mapping: ${prefix} -> ${packageRef}`)
      }
    } else {
      // Try simpler single-line format: using: { @p: "@pkg@1.0.0" }
      const inlineMatch = frontmatter.match(/^using:\s*\{([^}]+)\}/m)
      if (inlineMatch) {
        const pairs = inlineMatch[1].split(',')
        for (const pair of pairs) {
          const colonIndex = pair.indexOf(':')
          if (colonIndex !== -1) {
            const prefix = pair.substring(0, colonIndex).trim()
            const packageRef = pair.substring(colonIndex + 1).trim().replace(/["']/g, '')
            if (prefix.startsWith('@')) {
              prefixMap[prefix] = packageRef
              console.log(`[parseUsingBlock] Found inline prefix mapping: ${prefix} -> ${packageRef}`)
            }
          }
        }
      }
    }
  }

  console.log(`[parseUsingBlock] Built prefix map with ${Object.keys(prefixMap).length} entries:`, prefixMap)
  return prefixMap
}

/**
 * Resolve a prefixed path to its full package reference and file path
 *
 * Example:
 * - Input: "@p/assistants/code-assistant.prmd", prefixMap: { "@p": "@prompd/public-examples@1.1.0" }
 * - Output: { packageId: "@prompd/public-examples@1.1.0", filePath: "assistants/code-assistant.prmd" }
 */
function resolvePrefixedPath(path: string, prefixMap: Record<string, string>): { packageId: string; filePath: string } | null {
  // Check if path starts with a known prefix (e.g., @p/, @blog/)
  for (const [prefix, packageRef] of Object.entries(prefixMap)) {
    const prefixWithSlash = prefix + '/'
    if (path.startsWith(prefixWithSlash)) {
      const filePath = path.substring(prefixWithSlash.length)
      console.log(`[resolvePrefixedPath] Resolved ${path} -> package: ${packageRef}, file: ${filePath}`)
      return { packageId: packageRef, filePath }
    }
  }

  return null
}

/**
 * Rewrite prompt content to replace alias references with fully-resolved paths
 *
 * This is necessary because the compiler (whether local or backend) doesn't have
 * access to the 'using' block context from the original file. By rewriting the
 * references before compilation, we ensure the compiler can find all files.
 *
 * Example transformations:
 * - inherits: "@p/assistants/code-assistant.prmd"
 *   -> inherits: "@prompd/public-examples@1.1.0/assistants/code-assistant.prmd"
 * - system: "@p/systems/coding.md"
 *   -> system: "@prompd/public-examples@1.1.0/systems/coding.md"
 */
function rewriteAliasReferences(content: string, prefixMap: Record<string, string>): string {
  if (Object.keys(prefixMap).length === 0) {
    return content
  }

  let rewritten = content

  // Sort prefixes by length (longest first) to avoid partial replacements
  const sortedPrefixes = Object.keys(prefixMap).sort((a, b) => b.length - a.length)

  for (const prefix of sortedPrefixes) {
    const packageRef = prefixMap[prefix]
    const prefixWithSlash = prefix + '/'

    // Replace all occurrences of the prefix path in the content
    // This handles: inherits: "@p/path", system: "@p/path", context: ["@p/path"]
    // We use a regex that matches the prefix followed by a path, within quotes or unquoted

    // Pattern: matches @prefix/ followed by a path (non-whitespace, non-quote characters)
    const escapedPrefix = prefixWithSlash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(escapedPrefix + '([^"\'\\s\\n\\r]+)', 'g')

    rewritten = rewritten.replace(pattern, (match, filePath) => {
      const resolved = `${packageRef}/${filePath}`
      console.log(`[rewriteAliasReferences] Rewrote ${match} -> ${resolved}`)
      return resolved
    })
  }

  return rewritten
}

// Removed: removeSpecialtySectionReferences()
// We now preserve the original frontmatter unchanged and send referenced files separately

/**
 * Build a .prmd file from execution configuration
 * Used for the save workflow
 */
export function buildPrompdFile(config: ExecutionConfig): string {
  const lines: string[] = []

  // YAML Frontmatter
  lines.push('---')

  // Extract ID from package ref or generate one
  const id = config.prompdSource.packageRef
    ? config.prompdSource.packageRef.split('/')[1]?.split('@')[0] || 'custom-prompd'
    : 'custom-prompd'

  lines.push(`id: ${id}`)
  lines.push(`name: "${id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}"`)
  lines.push(`description: "Execution workspace configuration"`)
  lines.push(`version: 1.0.0`)

  // Add parameters (original + custom)
  const allParameters = [
    ...config.prompdSource.originalParams,
    ...config.customParameters
  ]

  if (allParameters.length > 0) {
    lines.push('parameters:')
    for (const param of allParameters) {
      lines.push(`  - name: ${param.name}`)
      lines.push(`    type: ${param.type}`)
      if (param.required) lines.push(`    required: true`)
      if (param.description) lines.push(`    description: "${param.description}"`)
      if (param.default !== undefined) {
        lines.push(`    default: ${JSON.stringify(param.default)}`)
      }
    }
  }

  lines.push('---')
  lines.push('')

  // Body content - use base prompd content
  const bodyLines = config.prompdSource.content.split('\n')
  const contentStart = bodyLines.findIndex((line, index) => {
    // Find the second '---' which marks end of frontmatter
    if (line.trim() === '---') {
      const firstDash = bodyLines.slice(0, index).findIndex(l => l.trim() === '---')
      return firstDash >= 0
    }
    return false
  })

  if (contentStart > 0) {
    lines.push(...bodyLines.slice(contentStart + 1))
  } else {
    // No frontmatter found, use entire content
    lines.push(...bodyLines)
  }

  // Append section overrides
  if (config.sections.system) {
    lines.push('', '## System', config.sections.system.content)
  }

  if (config.sections.user) {
    lines.push('', '## User', config.sections.user.content)
  }

  if (config.sections.context && config.sections.context.length > 0) {
    lines.push('', '## Context')
    config.sections.context.forEach(c => lines.push('', c.content))
  }

  if (config.sections.assistant) {
    lines.push('', '## Assistant', config.sections.assistant.content)
  }

  if (config.sections.task) {
    lines.push('', '## Task', config.sections.task.content)
  }

  if (config.sections.output) {
    lines.push('', '## Output', config.sections.output.content)
  }

  return lines.join('\n')
}

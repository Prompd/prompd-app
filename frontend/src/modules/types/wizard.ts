/**
 * Wizard state management types for guided prompt creation
 */

export type WizardStep = 'select-packages' | 'complete'

export interface PackageReference {
  name: string              // "@namespace/package@version"
  prefix?: string           // Optional alias (e.g., "@api")
}

export interface Section {
  id: string                // kebab-case identifier (e.g., "system-prompt")
  title: string             // Display title (e.g., "System Prompt")
  level: number             // Heading level (1-6)
  content: string           // Section content (markdown)
  overridden?: boolean      // Whether this section has been customized
  type?: 'system' | 'user' | 'assistant' | 'context' | 'output' | 'custom'  // Section type for YAML structure
  files?: string[]          // Attached file names for this section
}

export interface WizardState {
  currentStep: WizardStep

  // Step 1: Package selection
  selectedPackages: PackageReference[]

  // Step 2: Base template selection
  basePrompt: string | null                 // "@pkg@ver/path/file.prmd" or "./local.prmd"
  basePromptContent: ParsedPrompd | null    // Parsed content of base template

  // Step 3: Section customization
  sections: Section[]                        // All sections from base template
  sectionOverrides: Record<string, string | null>  // section-id -> override path or null (remove)

  // Generated metadata
  id: string
  name: string
  version: string
  description?: string
  customContent?: string                    // Additional content to append
  parameterOverrides?: Parameter[]          // Override parameter defaults
  contextFiles?: string[]                   // Context file paths added via drag-and-drop
}

export interface ParsedPrompd {
  frontmatter: any
  body: string
  sections: Section[]
  paramsSchema: Record<string, ParameterSchema>
  issues: ValidationIssue[]
}

export interface Parameter {
  name: string
  type: string
  required?: boolean
  description?: string
  default?: any
  enum?: string[]
  min?: number
  max?: number
  pattern?: string
}

export interface ParameterSchema {
  type: string
  required?: boolean
  description?: string
  default?: any
  enum?: any[]
  min?: number
  max?: number
  pattern?: string
}

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info'
  message: string
  line?: number
  column?: number
}

/**
 * Package metadata from registry
 */
export interface PackageMetadata {
  id: string
  name: string
  version: string
  description: string
  author?: string
  license?: string
  tags?: string[]
  categories?: string[]
  homepage?: string
  repository?: {
    type: string
    url: string
  }
  dependencies?: Record<string, string>
  exports?: Record<string, string>
  files?: {
    prompts?: string[]
    templates?: string[]
    contexts?: string[]
    systems?: string[]
  }
  keywords?: string[]
  maintainers?: Array<{
    name: string
    email?: string
  }>
  downloads?: number
  readme?: string
}

/**
 * Package file reference within a package
 */
export interface PackageFile {
  path: string                    // Relative path within package
  name: string                    // File name
  type: 'prompt' | 'template' | 'context' | 'system'
  content?: string                // File content (lazy loaded)
  description?: string            // Short description from frontmatter
}

/**
 * Search filters for package discovery
 */
export interface PackageSearchFilters {
  query?: string
  tags?: string[]
  categories?: string[]
  author?: string
  limit?: number
  offset?: number
}

/**
 * Package search result
 */
export interface PackageSearchResult {
  total: number
  packages: PackageMetadata[]
  filters: PackageSearchFilters
}

/** Generation mode for LLM execution */
export type GenerationMode = 'default' | 'thinking' | 'json'

/**
 * Execution tab configuration
 */
export interface ExecutionConfig {
  prompdSource: {
    type: 'package' | 'generated' | 'file'
    packageRef?: string  // "@prompd/math@1.0.0/quadratic.prmd"
    content: string      // Full .prmd file content
    originalParams: Parameter[]
  }
  parameters: Record<string, unknown>
  customParameters: Parameter[]
  sections: {
    system?: SectionEntry
    user?: SectionEntry
    context?: SectionEntry[]  // ONLY section that allows multiple files
    assistant?: SectionEntry
    task?: SectionEntry
    output?: SectionEntry
  }
  provider: string
  model: string
  executionHistory: ExecutionResult[]
  // Generation controls
  maxTokens?: number      // Max tokens to generate (default: 4096)
  temperature?: number    // Temperature 0-2 (default: 0.7)
  mode?: GenerationMode   // Generation mode (default: 'default')
  imageGeneration?: boolean  // Enable image generation (default: true when model supports it)
}

/**
 * Section entry (file or text)
 */
export interface SectionEntry {
  type: 'text' | 'file'
  content: string
  filePath?: string
}

/**
 * Execution result
 */
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
    executionMode?: 'local' | 'remote'  // Whether executed locally (Electron) or via backend
    // Generation settings used for this execution
    maxTokens?: number
    temperature?: number
    mode?: GenerationMode
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

/**
 * AI intent detection result
 */
export interface AIIntent {
  type: 'create-prompd' | 'edit-existing' | 'search-registry' | 'execute-prompd'
  action: 'search' | 'generate' | 'modify' | 'execute'
  entities: {
    packageName?: string
    searchQuery?: string
    parameters?: Record<string, unknown>
    sections?: Record<string, string>
  }
  confidence: number
}

export type ParamValue = string | number | boolean | any[] | Record<string, any> | ''

export type AiGenerationMetadata = {
  description: string
  complexity: 'simple' | 'intermediate' | 'advanced'
  includeExamples: boolean
  timestamp: string
  responseMetadata?: {
    tokensUsed?: {
      input: number
      output: number
      total: number
    }
    estimatedCost?: number
    model?: string
    durationMs?: number
    mode?: string
    provider?: string
  }
}

export type Tab = {
  id: string
  name: string
  type?: 'file' | 'execution' | 'chat'  // Default is 'file' if not specified (.pdflow files use 'file' type with 'design' viewMode)
  handle?: any
  text: string
  dirty?: boolean
  savedText?: string  // Track saved content for dirty detection
  viewMode?: 'wizard' | 'design' | 'code'  // 'design' mode for .pdflow shows WorkflowCanvas
  readOnly?: boolean
  packageSource?: {
    packageId: string
    filePath: string
  }
  aiGeneration?: AiGenerationMetadata
  executionConfig?: import('./types/wizard').ExecutionConfig  // For execution tabs
  virtualTemp?: boolean  // Flag for tabs not yet saved to disk
  chatConfig?: {
    mode: string
    conversationId?: string
    contextFile?: string | null
  }
  showPreview?: boolean  // Show compiled markdown preview in split view
}

export type SectionItem = { name: string; content: string }

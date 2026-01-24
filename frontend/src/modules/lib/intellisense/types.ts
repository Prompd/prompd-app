/**
 * IntelliSense type definitions
 */
import type * as monacoEditor from 'monaco-editor'

export interface Context {
  type: 'using' | 'inherits' | 'parameter' | 'frontmatter' | 'section' | 'variable' | 'version' | 'filepath' | 'paramtype' | 'paramprop' | 'filter' | 'envvar' | 'include' | 'none'
  query?: string
  field?: string
  packageName?: string // For version completion context
  parameterName?: string // For parameter type/enum context
  existingProps?: string[] // Properties already defined in current parameter
}

export interface HoverContext {
  type: 'package' | 'parameter' | 'filter' | 'envvar' | 'none'
  value: string
}

export interface ExtractedParameters {
  parameters: string[]
  loopVariables: Set<string> // Track which are loop variables for better suggestions
}

export interface ParameterMetadata {
  type?: string
  description?: string
  default?: string | number | boolean
  required?: boolean
  enum?: string[]
}

export interface FilterDefinition {
  name: string
  description: string
  documentation: string
  example: string
  parameters?: {
    name: string
    type: string
    description: string
    optional?: boolean
    default?: string
  }[]
  returnType: string
}

// Re-export monaco types for convenience
export type Monaco = typeof monacoEditor
export type TextModel = monacoEditor.editor.ITextModel
export type CompletionItem = monacoEditor.languages.CompletionItem
export type MarkerData = monacoEditor.editor.IMarkerData

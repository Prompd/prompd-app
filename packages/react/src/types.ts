/**
 * Core type definitions for @prompd/react
 */

// ============================================================================
// LLM Provider Types
// ============================================================================

// Support common providers plus 'custom' for any others
// Using string union with common providers for autocomplete, but accepts any string via 'custom'
export type LLMProvider =
  | 'openai'
  | 'anthropic'
  | 'groq'
  | 'gemini'
  | 'google'
  | 'mistral'
  | 'ollama'
  | 'lmstudio'
  | 'openrouter'
  | 'azure'
  | 'bedrock'
  | 'custom'
  | (string & {})  // Allow any string while preserving autocomplete for known providers

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface PrompdLLMRequest {
  messages: LLMMessage[]
  provider?: LLMProvider
  model?: string
  temperature?: number
  maxTokens?: number
  stream?: boolean
}

export interface PrompdLLMResponse {
  content: string
  provider: LLMProvider
  model: string
  usage?: LLMUsage
  metadata?: Record<string, unknown>
}

/**
 * Pluggable LLM Client Interface
 * Implement this to create custom LLM clients (local models, custom APIs, etc.)
 */
export interface IPrompdLLMClient {
  send(request: PrompdLLMRequest): Promise<PrompdLLMResponse>
}

// ============================================================================
// Package & Prompd Types
// ============================================================================

export interface PrompdParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description?: string
  required?: boolean
  default?: unknown
  enum?: unknown[]
}

/**
 * Individual .prmd file metadata
 */
export interface PrompdMetadata {
  id: string // Unique identifier from YAML frontmatter
  name: string // Display name
  description: string
  version?: string
  author?: string
  tags?: string[]
  category?: string
  parameters?: PrompdParameter[]
  content?: string // Full .prmd content (YAML + markdown)
  promptContent?: string // Just the markdown content (without frontmatter)
}

/**
 * Package metadata (.pdpkg container)
 */
export interface PrompdPackageMetadata {
  name: string // @namespace/package-name
  version: string
  description: string
  author?: string
  tags?: string[]
  category?: string
  downloads?: number
  rating?: number
  prompds?: PrompdMetadata[] // Individual .prmd files within the package
}

export interface PrompdPackageRecommendation {
  package: PrompdPackageMetadata
  score: number
  reason: string
}

// ============================================================================
// File Section Types
// ============================================================================

export interface PrompdFileSection {
  name: string // "system", "context", "user"
  label: string
  files: string[]
  allowMultiple: boolean
  accept?: string
  description?: string
}

export type PrompdFileSections = Map<string, string[]>

// ============================================================================
// Execution Types
// ============================================================================

export interface PrompdExecutionRequest {
  packageName?: string
  packageVersion?: string
  promptContent?: string
  role?: string
  parameters?: Record<string, unknown>
  fileSections?: PrompdFileSections
  provider?: LLMProvider
  model?: string
}

export interface PrompdCompiledPrompt {
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

export interface PrompdExecutionResult {
  id: string
  request: PrompdExecutionRequest
  compiledPrompt: PrompdCompiledPrompt
  response: PrompdLLMResponse
  timestamp: string
  status: 'success' | 'error'
  error?: string
}

/**
 * Pluggable Result Display Interface
 * Implement this to create custom result displays (modal, editor, tabs, etc.)
 */
export interface IPrompdResultDisplay {
  show(result: PrompdExecutionResult): void
}

/**
 * Pluggable Editor Interface
 * Implement this to enable live .prmd file editing from chat interactions
 * Used by editor.prompdhub.ai, VS Code extension, and other editors
 */
export interface IPrompdEditor {
  /**
   * Get the currently active .prmd file being edited
   * @returns The file path/URI of the active document, or null if none
   */
  getActiveDocument(): string | null

  /**
   * Insert content at the current cursor position or specified location
   * @param content - The content to insert
   * @param location - Optional location (line number, section name, etc.)
   */
  insertContent(content: string, location?: string | number): Promise<void>

  /**
   * Replace a section of the document
   * @param section - Section name ('system', 'user', 'context', 'parameters', etc.)
   * @param content - New content for the section
   */
  replaceSection(section: string, content: string): Promise<void>

  /**
   * Add a parameter to the YAML frontmatter
   * @param parameter - Parameter definition
   */
  addParameter(parameter: {
    name: string
    type: string
    description?: string
    required?: boolean
    default?: any
  }): Promise<void>

  /**
   * Update a parameter in the YAML frontmatter
   * @param parameterName - Name of the parameter to update
   * @param updates - Fields to update
   */
  updateParameter(parameterName: string, updates: Partial<{
    type: string
    description: string
    required: boolean
    default: any
  }>): Promise<void>

  /**
   * Get the current document content
   * @returns Full .prmd file content
   */
  getDocumentContent(): Promise<string>

  /**
   * Set the entire document content (full replacement)
   * @param content - New .prmd file content
   */
  setDocumentContent(content: string): Promise<void>

  /**
   * Show a notification/message to the user
   * @param message - Message to display
   * @param type - Message type
   */
  showMessage(message: string, type?: 'info' | 'warning' | 'error'): void

  /**
   * Get the editor type/name for context-aware behavior
   * @returns Editor identifier (e.g., 'vscode', 'web-editor', 'electron')
   */
  getEditorType(): string
}

// ============================================================================
// Chat Message Types
// ============================================================================

/**
 * Message types for distinguishing different kinds of messages in the chat UI
 */
export type PrompdMessageType =
  | 'user'           // Regular user message
  | 'assistant'      // Regular assistant response
  | 'tool_call'      // Tool execution in progress or completed
  | 'tool_results'   // Tool results sent to LLM (hidden or collapsed by default)
  | 'system'         // System messages (errors, notifications)

/**
 * Tool execution status
 */
export type ToolExecutionStatus = 'pending' | 'running' | 'success' | 'error' | 'pending-approval' | 'rejected'

/**
 * Tool execution log entry
 */
export interface ToolExecutionLog {
  timestamp: string
  message: string
  type: 'info' | 'warning' | 'error'
}

/**
 * Tool message metadata - used when metadata.type is 'tool-execution'
 */
export interface ToolMessageMetadata {
  type: 'tool-execution'
  toolName: string
  toolParams: Record<string, unknown>
  status: ToolExecutionStatus
  result?: string
  error?: string
  duration?: number
  logs?: ToolExecutionLog[]
  collapsed?: boolean
}

/**
 * Chat message metadata - flexible to support various message types
 * The 'type' field distinguishes between different metadata structures
 */
export interface ChatMessageMetadata {
  // Common fields
  type?: string
  provider?: string
  model?: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  duration?: number

  // Tool execution fields (when type === 'tool-execution')
  toolName?: string
  toolParams?: Record<string, unknown>
  status?: ToolExecutionStatus
  result?: string
  error?: string
  logs?: ToolExecutionLog[]
  collapsed?: boolean

  // Package suggestion fields (when type === 'package-suggestions')
  recommendations?: unknown[]

  // Prompd suggestion fields (when type === 'prompd-suggestions')
  prompds?: unknown[]

  // Generate prompt confirmation fields
  declined?: boolean
  onAccept?: () => void

  // Execution result fields (when type === 'execution-result')
  executionResult?: unknown

  // Comparison fields
  showDetailsButton?: boolean

  // Suggestion field for edit/new-file suggestions
  suggestion?: unknown

  // Tool calls from LLM response
  toolCalls?: unknown[]

  // Original JSON for debugging
  originalJson?: unknown

  // Thinking indicator
  isThinking?: boolean
  icon?: string

  // Allow additional properties
  [key: string]: unknown
}

/**
 * Chat message with flexible metadata
 */
export interface PrompdChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  executionId?: string
  metadata?: ChatMessageMetadata
  isStreaming?: boolean  // True while message is being streamed, false when complete
}

/**
 * Helper to check if message is a tool execution message
 */
export function isToolExecutionMessage(message: PrompdChatMessage): boolean {
  return message.metadata?.type === 'tool-execution'
}

/**
 * Helper to create a tool execution message
 */
export function createToolExecutionMessage(
  toolName: string,
  toolParams: Record<string, unknown>,
  status: ToolExecutionStatus = 'pending'
): PrompdChatMessage {
  return {
    id: `tool_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    role: 'system',
    content: '',
    timestamp: new Date().toISOString(),
    metadata: {
      type: 'tool-execution',
      toolName,
      toolParams,
      status,
      collapsed: false
    }
  }
}

export interface PrompdSession {
  id: string
  userId?: string
  messages: PrompdChatMessage[]
  context: PrompdFileSections
  pinnedPackages: PrompdPackageMetadata[]
  createdAt: string
  updatedAt: string
}

// ============================================================================
// Orchestration Types
// ============================================================================

export interface PrompdRoleExtractionResult {
  role: string
  confidence: number
  reasoning: string
}

export interface PrompdParameterExtractionResult {
  parameters: Record<string, unknown>
  confidence: number
  missingRequired: string[]
  suggestions: Record<string, unknown>
}

export interface PrompdOrchestrationState {
  intent?: string
  recommendedPackages: PrompdPackageRecommendation[]
  selectedPackage?: PrompdPackageMetadata // Selected package (container)
  selectedPrompd?: PrompdMetadata // Selected individual .prmd file
  extractedRole?: string
  extractedParameters?: Record<string, unknown>
  fileSections: PrompdFileSections
  isProcessing: boolean
}

// ============================================================================
// Component Props Types
// ============================================================================

export interface PrompdProviderProps {
  children: React.ReactNode
  apiBaseUrl?: string
  defaultLLMClient?: IPrompdLLMClient
  defaultResultDisplay?: IPrompdResultDisplay
  defaultEditor?: IPrompdEditor
  theme?: 'light' | 'dark' | 'auto'
  mode?: 'consumer' | 'editor' // Consumer mode (prmd.ai) vs Editor mode (editor.prompdhub.ai)
}

export interface PrompdChatMode {
  id: string
  label: string
  icon: string
  description?: string
}

/**
 * Input theme for colored accent based on agent permission level
 */
export type PrompdInputTheme = 'default' | 'auto' | 'confirm' | 'plan'

export interface PrompdChatProps {
  sessionId?: string
  llmClient?: IPrompdLLMClient
  resultDisplay?: IPrompdResultDisplay
  onMessage?: (message: PrompdChatMessage) => void
  onExecute?: (result: PrompdExecutionResult) => void
  className?: string
  // Mode selection support
  emptyStateContent?: React.ReactNode
  currentMode?: PrompdChatMode
  modes?: PrompdChatMode[]
  onModeChange?: (modeId: string) => void
  // Initial messages to load (for restoring conversation history)
  initialMessages?: PrompdChatMessage[]
  // Controlled input - allows parent to preserve input text across mode changes
  inputValue?: string
  onInputChange?: (value: string) => void
  // Custom left controls for the input area (replaces mode dropdown when provided)
  leftControls?: React.ReactNode
  // Intercept submit - return true to consume the input (prevent LLM call)
  onBeforeSubmit?: (inputValue: string) => Promise<boolean> | boolean
  // Content to render above the input area (between messages and input)
  // Useful for banners, prompts, or notifications that should be part of the flow
  aboveInput?: React.ReactNode
  // Input theme for permission-level colored accents
  // 'auto' = green (#22c55e), 'confirm' = yellow (#eab308), 'plan' = purple (#6366f1)
  inputTheme?: PrompdInputTheme
  // Force the input to be ready for user input (overrides internal isLoading state)
  // Used when agent is waiting for user input (ask_user tool)
  waitingForUserInput?: boolean
}

/**
 * Imperative handle for PrompdChat component
 * Allows programmatic control of the chat from parent components
 */
export interface PrompdChatHandle {
  /**
   * Send a message programmatically (as if user typed and submitted it)
   * @param content - The message content to send
   */
  sendMessage: (content: string) => Promise<void>
  /**
   * Continue the conversation with hidden context (for tool results, etc.)
   * This adds context to the LLM call without showing a user message in the UI.
   * @param context - The context content to include in the LLM call
   */
  continueWithContext: (context: string) => Promise<void>
  /**
   * Clear all messages in the chat
   */
  clearMessages: () => void
  /**
   * Get the current loading state
   */
  isLoading: () => boolean
  /**
   * Add a message directly to the chat (for system messages, tool execution, etc.)
   * @param message - The message to add
   */
  addMessage: (message: PrompdChatMessage) => void
  /**
   * Update an existing message by ID
   * @param messageId - The ID of the message to update
   * @param updates - Partial message updates to apply
   */
  updateMessage: (messageId: string, updates: Partial<PrompdChatMessage>) => void
  /**
   * Focus the chat input field
   */
  focusInput: () => void
}

export interface PrompdContextAreaProps {
  sections: PrompdFileSection[]
  value: PrompdFileSections
  onChange: (sections: PrompdFileSections) => void
  onFileUpload?: (section: string, files: File[]) => Promise<string[]>
  onSelectFromBrowser?: (section: string) => void  // Trigger file browser selection
  onFileClick?: (filePath: string) => void  // Click handler to open file in editor
  hasFolderOpen?: boolean  // Whether a folder is currently open in file browser
  activeSection?: string | null  // Currently active section for file selection
  variant?: 'compact' | 'card'  // Display variant: compact (default) or card (filled backgrounds)
  className?: string
}

export interface PrompdPackageSelectorProps {
  recommendations: PrompdPackageRecommendation[]
  selectedPackage?: PrompdPackageMetadata
  onSelect: (pkg: PrompdPackageMetadata) => void
  onSearch?: (query: string) => Promise<PrompdPackageRecommendation[]>
  onGenerateCustom?: () => void
  className?: string
}

export interface PrompdResultModalProps {
  result: PrompdExecutionResult
  isOpen: boolean
  onClose: () => void
  onRerun?: (parameters: Record<string, unknown>) => void
  className?: string
}

export interface PrompdChatInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  isLoading?: boolean
  placeholder?: string
  maxLines?: number
  className?: string
  leftControls?: React.ReactNode
  rightControls?: React.ReactNode
  showHelperText?: boolean
  inputRef?: React.RefObject<HTMLTextAreaElement>
  // Input theme for permission-level colored accents
  // 'auto' = green (#22c55e), 'confirm' = yellow (#eab308), 'plan' = purple (#6366f1)
  inputTheme?: PrompdInputTheme
  // History navigation - press up/down arrows to cycle through previous prompts
  history?: string[]
  // Maximum number of history entries to keep (default: 50)
  maxHistorySize?: number
}

// ============================================================================
// Hook Return Types
// ============================================================================

export interface UsePrompdChatReturn {
  messages: PrompdChatMessage[]
  sessionId: string
  isLoading: boolean
  sendMessage: (content: string) => Promise<void>
  clearMessages: () => void
}

export interface UsePrompdOrchestrationReturn {
  state: PrompdOrchestrationState
  recommendPackages: (intent: string) => Promise<void>
  selectPackage: (pkg: PrompdPackageMetadata) => void
  selectPrompd: (prompd: PrompdMetadata) => void
  extractRole: (message: string) => Promise<void>
  extractParameters: (message: string, prompd: PrompdMetadata) => Promise<void>
  updateFileSections: (sections: PrompdFileSections) => void
  executePrompt: () => Promise<PrompdExecutionResult>
  reset: () => void
}

export interface UsePrompdSessionReturn {
  session: PrompdSession | null
  isLoading: boolean
  saveSession: () => Promise<void>
  loadSession: (sessionId: string) => Promise<void>
  updateContext: (context: Partial<PrompdSession>) => void
}

export interface UsePrompdPackageReturn {
  packages: PrompdPackageMetadata[]
  isLoading: boolean
  search: (query: string) => Promise<PrompdPackageRecommendation[]>
  getPackage: (name: string, version?: string) => Promise<PrompdPackageMetadata>
}

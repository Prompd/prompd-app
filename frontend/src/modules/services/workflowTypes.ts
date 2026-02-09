/**
 * Workflow Types - TypeScript interfaces for .pdflow files
 */

// ============================================================================
// .pdflow File Format Types
// ============================================================================

export interface WorkflowFile {
  version: string
  metadata: WorkflowMetadata
  parameters?: WorkflowParameter[]
  using?: PackageAlias[]
  variables?: WorkflowVariable[]
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]  // React Flow standard format
  errorHandling?: ErrorHandlingConfig
  execution?: ExecutionConfig
}

export interface WorkflowMetadata {
  id: string
  name: string
  description?: string
  author?: string
  version?: string
  tags?: string[]
}

export interface WorkflowParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'integer'
  required?: boolean
  description?: string
  default?: unknown
  enum?: string[]
  min?: number
  max?: number
}

export interface PackageAlias {
  name: string
  prefix: string
}

export interface WorkflowVariable {
  name: string
  type: string
  scope?: 'workflow' | 'node'
  default?: unknown
}

// ============================================================================
// Node Types
// ============================================================================

export type WorkflowNodeType =
  | 'trigger'         // Workflow entry point (manual, webhook, schedule, file-watch)
  | 'prompt'
  | 'provider'  // LLM provider configuration node
  | 'condition'
  | 'loop'
  | 'parallel'
  | 'merge'
  | 'transformer'
  | 'api'
  | 'tool'            // Unified tool node: function, MCP, HTTP, command, or code
  | 'tool-call-parser' // Parse LLM output for tool calls
  | 'tool-call-router' // Container for Tool nodes with routing logic
  | 'agent'           // Autonomous AI agent with ReAct-style tool-use loop
  | 'chat-agent'      // Composite: User Input + Guardrail + Agent + Tool Router
  | 'guardrail'       // Input validation with success/rejected branching
  | 'callback'
  | 'checkpoint'  // Alias for callback (legacy compatibility)
  | 'user-input'  // Pause and collect user input
  | 'error-handler'   // Error handling configuration node (referenced by other nodes)
  | 'command'         // Shell command execution (Phase E)
  | 'claude-code'     // Claude Code agent with SSH support (Phase E)
  | 'workflow'        // Sub-workflow invocation (Phase E)
  | 'mcp-tool'        // External MCP tool execution (Phase E)
  | 'code'            // Code execution node: TS/JS, Python, or C#
  | 'memory'          // Memory node: KV store, conversation history, or cache
  | 'output'
  | 'web-search'      // Web search node: search the web via configurable provider

export interface WorkflowNode {
  id: string
  type: WorkflowNodeType
  position: { x: number; y: number }
  data: TriggerNodeData | PromptNodeData | ProviderNodeData | ConditionNodeData | LoopNodeData | ParallelNodeData | MergeNodeData | TransformerNodeData | ApiNodeData | ToolNodeData | ToolCallParserNodeData | ToolCallRouterNodeData | AgentNodeData | ChatAgentNodeData | GuardrailNodeData | CallbackNodeData | UserInputNodeData | ErrorHandlerNodeData | CommandNodeData | ClaudeCodeNodeData | WorkflowNodeData | McpToolNodeData | CodeNodeData | MemoryNodeData | OutputNodeData | WebSearchNodeData
  /** Parent node ID for compound nodes (loop/parallel containers) */
  parentId?: string
  /** Extent for child nodes - 'parent' constrains to parent bounds */
  extent?: 'parent' | [number, number, number, number]
  /** Whether this node is expandable (container nodes) */
  expandParent?: boolean
  /** Width for resizable container nodes */
  width?: number
  /** Height for resizable container nodes */
  height?: number
  /** Style overrides */
  style?: Record<string, unknown>
}

export interface BaseNodeData {
  label: string
  /** Disable this node to skip it during workflow execution */
  disabled?: boolean
  /** Lock the node to prevent dragging/moving */
  locked?: boolean
  /** Reference to ErrorHandler node for this node's errors */
  errorHandlerNodeId?: string
  /** Override: stop workflow immediately on error (ignores errorHandler) */
  failFast?: boolean
  /** Reference to a Connection for external service access (SSH, Database, HTTP API, etc.) */
  connectionId?: string
  /**
   * Docking configuration - when this node is docked to another node's handle.
   * Docked nodes appear as mini 24px circle previews attached to the host handle.
   */
  dockedTo?: {
    /** ID of the host node this node is docked to */
    nodeId: string
    /** Handle ID on the host node (e.g., 'rejected', 'onError', 'output') */
    handleId: string
  }
  /** Saved width before docking (for restoring on undock) */
  _preDockWidth?: number
  /** Saved height before docking (for restoring on undock) */
  _preDockHeight?: number
  /** Saved position before docking (for restoring on undock) */
  _preDockPosition?: { x: number; y: number }
  [key: string]: unknown  // Index signature for React Flow compatibility
}

// ============================================================================
// Node Docking Configuration
// ============================================================================

/** Node types that can be docked to handles */
export const DOCKABLE_NODE_TYPES: WorkflowNodeType[] = [
  'tool-call-router', 'tool', 'callback', 'checkpoint', 'memory', 'error-handler'
]

/** Handle configurations that accept docked nodes */
export const DOCKABLE_HANDLES: Array<{
  nodeType: WorkflowNodeType
  handleId: string
  position: { side: 'left' | 'right' | 'bottom'; topPercent: number }
  acceptsTypes: WorkflowNodeType[]
}> = [
  // Main agent/guardrail nodes - accept callback, checkpoint, error-handler on rejected handle
  { nodeType: 'chat-agent', handleId: 'rejected', position: { side: 'left', topPercent: 80 }, acceptsTypes: ['callback', 'checkpoint', 'error-handler'] },
  { nodeType: 'chat-agent', handleId: 'memory', position: { side: 'right', topPercent: 70 }, acceptsTypes: ['memory'] },
  { nodeType: 'chat-agent', handleId: 'onCheckpoint', position: { side: 'bottom', topPercent: 100 }, acceptsTypes: ['callback', 'checkpoint'] },
  { nodeType: 'guardrail', handleId: 'rejected', position: { side: 'left', topPercent: 70 }, acceptsTypes: ['callback', 'checkpoint', 'error-handler'] },
  { nodeType: 'guardrail', handleId: 'onCheckpoint', position: { side: 'bottom', topPercent: 100 }, acceptsTypes: ['callback', 'checkpoint'] },
  { nodeType: 'agent', handleId: 'onCheckpoint', position: { side: 'bottom', topPercent: 100 }, acceptsTypes: ['callback', 'checkpoint'] },
  { nodeType: 'agent', handleId: 'ai-output', position: { side: 'right', topPercent: 65 }, acceptsTypes: ['tool-call-router'] },
  { nodeType: 'agent', handleId: 'toolResult', position: { side: 'right', topPercent: 80 }, acceptsTypes: ['tool-call-router'] },
  { nodeType: 'agent', handleId: 'memory', position: { side: 'left', topPercent: 70 }, acceptsTypes: ['memory'] },

  // Prompt node - accepts memory for output caching, callback for logging
  { nodeType: 'prompt', handleId: 'output', position: { side: 'right', topPercent: 50 }, acceptsTypes: ['memory', 'callback'] },
  { nodeType: 'prompt', handleId: 'onCheckpoint', position: { side: 'bottom', topPercent: 100 }, acceptsTypes: ['callback', 'checkpoint'] },

  // Loop node - accepts memory for iteration state, callback for iteration events
  { nodeType: 'loop', handleId: 'onIteration', position: { side: 'bottom', topPercent: 100 }, acceptsTypes: ['memory', 'callback'] },

  // Condition node - accepts callback for branch logging
  { nodeType: 'condition', handleId: 'onEvaluate', position: { side: 'bottom', topPercent: 100 }, acceptsTypes: ['callback'] },

  // Code node - accepts memory for state, callback for logging
  { nodeType: 'code', handleId: 'onExecute', position: { side: 'bottom', topPercent: 100 }, acceptsTypes: ['memory', 'callback'] },

  // Transformer node - accepts callback for transform logging
  { nodeType: 'transformer', handleId: 'onTransform', position: { side: 'bottom', topPercent: 100 }, acceptsTypes: ['callback'] },

  // Tool Call Router node - accepts tool nodes for docking
  { nodeType: 'tool-call-router', handleId: 'ai-input', position: { side: 'left', topPercent: 35 }, acceptsTypes: ['tool'] },

  // Tool Call Router node - accepts tool nodes for docking
  { nodeType: 'tool-call-router', handleId: 'toolResult', position: { side: 'left', topPercent: 65 }, acceptsTypes: ['tool'] },

  // Loop node - accepts tool-call-router nodes for container-to-container docking
  { nodeType: 'loop', handleId: 'ai-output', position: { side: 'left', topPercent: 50 }, acceptsTypes: ['tool-call-router'] },

  // Loop node - accepts tool-call-router nodes for container-to-container docking
  { nodeType: 'loop', handleId: 'toolResult', position: { side: 'left', topPercent: 50 }, acceptsTypes: ['tool-call-router'] },
]

// ============================================================================
// Trigger Node - Workflow Entry Point
// ============================================================================

/**
 * TriggerNodeData - Workflow entry point configuration
 *
 * Trigger types:
 * - manual: User clicks "Run" button (default)
 * - webhook: HTTP POST to a generated endpoint
 * - schedule: Cron expression or interval-based
 * - file-watch: File system changes (Electron only)
 * - event: Internal event from another workflow
 *
 * Every workflow should have exactly one TriggerNode as its entry point.
 * The trigger node has no inputs and one output that starts the workflow.
 */
export interface TriggerNodeData extends BaseNodeData {
  /** Type of trigger */
  triggerType: 'manual' | 'webhook' | 'schedule' | 'file-watch' | 'event'

  /** Description of when/how this workflow runs */
  description?: string

  // === Webhook Configuration (triggerType: 'webhook') ===

  /** Webhook path suffix (e.g., '/my-workflow' -> POST /api/webhooks/my-workflow) */
  webhookPath?: string
  /** Secret for HMAC signature validation */
  webhookSecret?: string
  /** HTTP methods to accept (default: POST only) */
  webhookMethods?: ('GET' | 'POST' | 'PUT')[]
  /** Whether to require authentication */
  webhookRequireAuth?: boolean

  // === Schedule Configuration (triggerType: 'schedule') ===

  /** Schedule type */
  scheduleType?: 'cron' | 'interval'
  /** Cron expression (e.g., '0 9 * * *' for 9am daily) */
  scheduleCron?: string
  /** Interval in milliseconds (e.g., 60000 for every minute) */
  scheduleIntervalMs?: number
  /** Timezone for cron expressions (default: UTC) */
  scheduleTimezone?: string
  /** Whether schedule is currently active */
  scheduleEnabled?: boolean

  // === File Watch Configuration (triggerType: 'file-watch', Electron only) ===

  /** Glob patterns for files to watch */
  fileWatchPaths?: string[]
  /** Events to trigger on */
  fileWatchEvents?: ('create' | 'modify' | 'delete')[]
  /** Debounce time in ms to batch rapid changes */
  fileWatchDebounceMs?: number
  /** Whether to watch subdirectories */
  fileWatchRecursive?: boolean

  // === Event Configuration (triggerType: 'event') ===

  /** Event name to listen for */
  eventName?: string
  /** Optional filter expression for event data */
  eventFilter?: string

  // === Output Schema ===

  /** Schema for data this trigger provides to the workflow */
  outputSchema?: JsonSchema
}

export interface PromptNodeData extends BaseNodeData {
  /** Source type: 'file' for .prmd file reference, 'raw' for inline text */
  sourceType?: 'file' | 'raw'
  /** Path to .prmd file or package reference (used when sourceType is 'file' or undefined) */
  source: string
  /** Raw prompt text (used when sourceType is 'raw') */
  rawPrompt?: string
  /** Reference to a provider node ID, or inline provider name */
  provider?: string
  /** Model name (used with inline provider, ignored if providerNodeId is set) */
  model?: string
  /** Reference to a provider node by ID (preferred over inline provider/model) */
  providerNodeId?: string
  parameters?: Record<string, string> // Template expressions
  context?: {
    previous_output?: 'auto' | string
  }
  outputMapping?: Record<string, string>
  inputSchema?: JsonSchema
  outputSchema?: JsonSchema
  /** Guardrail configuration (for content filtering/validation) */
  guardrail?: {
    /** Output mode when guardrail passes */
    outputMode?: 'passthrough' | 'original' | 'reject-message'
    /** Expected response format from LLM */
    expectedFormat?: 'json' | 'text'
    /** JSON field to check for rejection status */
    rejectionField?: string
    /** Pass when field is true or false */
    passWhen?: 'true' | 'false'
    /** Action to take when guardrail fails */
    failAction?: 'error' | 'stop' | 'continue'
    /** Custom message when rejected */
    customRejectMessage?: string
    /** Custom rejection expression (advanced) - overrides simple field check */
    rejectionExpression?: string
  }
}

/**
 * ProviderNodeData - LLM provider configuration node
 *
 * Centralizes provider/model selection so multiple prompt nodes can reference
 * the same provider configuration. This makes it easy to switch providers
 * across an entire workflow.
 */
export interface ProviderNodeData extends BaseNodeData {
  /** Provider ID (e.g., 'openai', 'anthropic', 'google') */
  providerId: string
  /** Model ID (e.g., 'gpt-4o', 'claude-sonnet-4-20250514') */
  model: string
  /** Optional description for this provider configuration */
  description?: string
  /** Temperature override (0-2) */
  temperature?: number
  /** Max tokens override */
  maxTokens?: number
}

export interface ConditionNodeData extends BaseNodeData {
  conditions: ConditionBranch[]
  default?: string // Target node ID
}

export interface ConditionBranch {
  id: string
  expression: string // Template expression e.g. "{{ score >= 0.8 }}"
  target: string // Target node ID
}

export interface LoopNodeData extends BaseNodeData {
  loopType: 'while' | 'for-each' | 'count'
  condition?: string // For while loops
  items?: string // For for-each loops (template expression)
  itemVariable?: string // Variable name for current item
  count?: number // For count loops
  maxIterations: number // Safety limit
  body: string[] // Node IDs to execute in loop
  onComplete?: string // Target node ID after loop
  /** Whether the container is collapsed (hides child nodes) */
  collapsed?: boolean
}

export interface ParallelNodeData extends BaseNodeData {
  /** Execution mode: 'broadcast' (container) or 'fork' (edge-based branches) */
  mode: 'broadcast' | 'fork'
  /** Number of output handles in fork mode */
  forkCount?: number
  /** Custom labels for fork branches (indexed by branch number) */
  forkLabels?: string[]
  branches: ParallelBranch[]
  waitFor: 'all' | 'any' | 'race'
  mergeStrategy: 'object' | 'array' | 'first'
  /** Whether the container is collapsed (hides child nodes) */
  collapsed?: boolean
}

export interface ParallelBranch {
  id: string
  label?: string // Custom label for the branch (defaults to "Branch N")
  nodes: string[] // Node IDs in this branch
}

export interface MergeNodeData extends BaseNodeData {
  inputs: string[] // Template expressions for inputs
  mergeAs: 'object' | 'array'
  /**
   * Merge mode determines how the merge node behaves:
   * - 'wait': Waits for all connected inputs to have outputs before executing (default)
   * - 'transform': Executes immediately with whatever inputs are available (router/passthrough)
   */
  mode?: 'wait' | 'transform'
}

/**
 * TransformerNodeData - Data transformation node
 *
 * Transform, reshape, or filter data using templates with {{ variable }} syntax.
 * Supports multiple transform modes for different use cases.
 *
 * Transform Modes:
 * - template: JSON template with {{ }} variable interpolation
 * - jq: JQ-style query expressions (future)
 * - javascript: Inline JS expression (sandboxed)
 *
 * Variables:
 * - {{ previous_output }} - Output from the connected input node
 * - {{ node_id.property }} - Access specific node outputs
 * - {{ workflow.param_name }} - Workflow parameters
 */
export interface TransformerNodeData extends BaseNodeData {
  /** Transform mode */
  mode: 'template' | 'jq' | 'expression'

  /** JSON template string with {{ variable }} syntax (for template mode) */
  template?: string

  /** JQ-style query expression (for jq mode, future) */
  jqExpression?: string

  /** JavaScript expression that returns transformed value (for expression mode) */
  expression?: string

  /** Input variable name (defaults to 'input') */
  inputVariable?: string

  /** Whether to pass through unchanged if transform fails */
  passthroughOnError?: boolean

  /** Description of what this transform does */
  description?: string

  // Legacy field for backwards compatibility
  transform?: string
}

export interface ApiNodeData extends BaseNodeData {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  url: string
  headers?: Record<string, string>
  body?: string // Template expression
  retryPolicy?: RetryPolicy
}

/**
 * ToolNodeData - Unified tool execution node
 *
 * Supports five tool types:
 * - function: Call a registered function/callback provided to the workflow executor
 * - mcp: Call a tool exposed by an MCP (Model Context Protocol) server
 * - http: Make an HTTP request (similar to ApiNodeData but unified interface)
 * - command: Execute a whitelisted shell command (npm, git, python, etc.)
 * - code: Execute code snippets (TypeScript/JavaScript, Python, or C#)
 *
 * Use cases:
 * - Database lookups
 * - Code execution
 * - External API integration
 * - MCP-compatible AI tools
 * - Custom business logic
 * - Shell command execution
 * - Data transformation via code
 */
export interface ToolNodeData extends BaseNodeData {
  /** Tool type determines how the tool is invoked */
  toolType: 'function' | 'mcp' | 'http' | 'command' | 'code'

  /** Tool name - for function/mcp types, this identifies the tool to call */
  toolName: string

  /** Description shown in the node and used for documentation */
  description?: string

  /** Input parameters - template expressions supported */
  parameters?: Record<string, unknown>

  /** Parameter schema for validation and UI generation */
  parameterSchema?: {
    type: 'object'
    properties?: Record<string, {
      type: string
      description?: string
      default?: unknown
      enum?: string[]
    }>
    required?: string[]
  }

  // === HTTP-specific fields (toolType: 'http') ===
  /** HTTP method (only for http type) */
  httpMethod?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  /** URL template (only for http type) */
  httpUrl?: string
  /** HTTP headers (only for http type) */
  httpHeaders?: Record<string, string>
  /** Request body template (only for http type) */
  httpBody?: string

  // === MCP-specific fields (toolType: 'mcp') ===
  /** MCP server URL (only for mcp type) */
  mcpServerUrl?: string
  /** MCP server name/identifier (alternative to URL for configured servers) */
  mcpServerName?: string

  // === Command-specific fields (toolType: 'command') ===
  /** The executable to run (must be in allowed list or custom commands) */
  commandExecutable?: string
  /** Action/subcommand (e.g., 'run' for npm, 'status' for git) */
  commandAction?: string
  /** Arguments template (supports {{ }} expressions) */
  commandArgs?: string
  /** Working directory (relative to workspace) */
  commandCwd?: string
  /** Whether this command requires user approval before execution */
  commandRequiresApproval?: boolean
  /** Custom command ID (references CustomCommandConfig from connections) */
  customCommandId?: string

  // === Code-specific fields (toolType: 'code') ===
  /** Programming language for code execution */
  codeLanguage?: 'typescript' | 'javascript' | 'python' | 'csharp'
  /** The code snippet to execute */
  codeSnippet?: string
  /** Variable name for previous_output (default: 'input') */
  codeInputVariable?: string
  /** For TS/JS: execution context */
  codeExecutionContext?: 'isolated' | 'main'

  // === Common execution options ===
  /** Timeout in milliseconds */
  timeout?: number
  /** Retry policy for failed executions */
  retryPolicy?: RetryPolicy
  /** Transform the result before passing to next node */
  outputTransform?: string
}

/**
 * ToolCallParserNodeData - Parse LLM output for tool call requests
 *
 * This node detects and extracts tool calls from LLM responses, enabling
 * agentic workflows where the LLM decides which tools to call.
 *
 * Supported formats:
 * - openai: OpenAI function calling format (tool_calls array)
 * - anthropic: Anthropic tool_use blocks
 * - xml: XML-style <tool_call> tags
 * - json: Generic JSON with configurable field names
 * - auto: Automatically detect format
 *
 * Output structure:
 * {
 *   hasToolCall: boolean,
 *   toolName: string | null,
 *   toolParameters: Record<string, unknown> | null,
 *   remainingText: string,  // Text after tool call extraction
 *   rawToolCall: unknown,   // Original tool call data
 *   format: string          // Detected format
 * }
 */
export interface ToolCallParserNodeData extends BaseNodeData {
  /** Format to parse - 'auto' will attempt to detect */
  format: 'auto' | 'openai' | 'anthropic' | 'xml' | 'json'

  /** For 'json' format: field name containing the tool name */
  jsonToolNameField?: string
  /** For 'json' format: field name containing the parameters */
  jsonParametersField?: string

  /** For 'xml' format: tag name for tool calls (default: 'tool_call') */
  xmlTagName?: string

  /** List of valid tool names - if provided, only these will be recognized */
  allowedTools?: string[]

  /** What to do if no tool call is found */
  noToolCallBehavior: 'passthrough' | 'error' | 'default'

  /** Default tool to use if noToolCallBehavior is 'default' */
  defaultTool?: string
  defaultParameters?: Record<string, unknown>
}

/**
 * ToolCallRouterNodeData - Container node for grouping Tool nodes
 *
 * This node acts as a container that groups Tool nodes together and routes
 * tool calls from Agent nodes to the appropriate Tool node based on tool name.
 *
 * Usage:
 * 1. Create a ToolCallRouter node on the canvas
 * 2. Drag Tool nodes inside the container (they become children via parentId)
 * 3. Connect Agent's onCheckpoint handle to router's toolCall input
 * 4. Connect router's toolResult output back to Agent's toolResult input
 *
 * The router automatically collects tool schemas from child Tool nodes and
 * dispatches tool calls to the matching Tool node for execution.
 */
export interface ToolCallRouterNodeData extends BaseNodeData {
  /** How tool calls are matched to Tool nodes */
  routingMode: 'name-match' | 'pattern' | 'fallback'

  /** Behavior when no Tool node matches the requested tool name */
  onNoMatch: 'error' | 'passthrough' | 'fallback-tool'

  /** ID of a Tool node inside this router to use as fallback */
  fallbackToolId?: string

  /** Whether the container is collapsed (hides child nodes) */
  collapsed?: boolean
}

export interface OutputNodeData extends BaseNodeData {
  outputSchema?: JsonSchema
  result?: unknown  // Execution result
}

/**
 * ErrorHandlerNodeData - Workflow-level error handling configuration
 *
 * Error handling is configured as a **workflow-level node** that other nodes
 * reference by ID (similar to how nodes reference Provider nodes). This avoids
 * cluttering the graph with inline error edges.
 *
 * Nodes reference an ErrorHandler via `errorHandlerNodeId` in BaseNodeData.
 * When an error occurs, the executor routes it to the referenced ErrorHandler
 * for retry, fallback, or notification handling.
 *
 * Strategies:
 * - retry: Attempt the operation again with backoff
 * - fallback: Return a fallback value or execute a fallback node
 * - notify: Send notification (webhook, log) and continue
 * - ignore: Swallow the error and continue with null/undefined
 * - rethrow: Re-throw the error to stop execution
 *
 * Visual representation:
 * - Displayed in "Error Handlers" section of NodePalette
 * - Rose/red color theme
 * - Dashed border to indicate "config node" vs "flow node"
 * - No edges - referenced by ID from other nodes
 */
export interface ErrorHandlerNodeData extends BaseNodeData {
  /** Error handling strategy */
  strategy: 'retry' | 'fallback' | 'notify' | 'ignore' | 'rethrow'

  // === Retry Configuration (strategy: 'retry') ===

  /** Retry policy */
  retry?: {
    /** Maximum number of retry attempts */
    maxAttempts: number
    /** Initial backoff delay in milliseconds */
    backoffMs: number
    /** Backoff multiplier for exponential backoff (e.g., 2 for doubling) */
    backoffMultiplier?: number
    /** Maximum backoff delay in milliseconds */
    maxBackoffMs?: number
    /** Error codes/patterns that should trigger a retry (empty = retry all) */
    retryOn?: string[]
    /** Error codes/patterns that should NOT trigger a retry */
    noRetryOn?: string[]
  }

  // === Fallback Configuration (strategy: 'fallback') ===

  /** Fallback value or node when all retries exhausted or strategy is 'fallback' */
  fallback?: {
    /** Type of fallback */
    type: 'value' | 'template' | 'node'
    /** Static value to return (when type is 'value') */
    value?: unknown
    /** Template expression to evaluate (when type is 'template') */
    template?: string
    /** Node ID to execute as fallback (when type is 'node') */
    nodeId?: string
  }

  // === Notification Configuration (strategy: 'notify' or any strategy) ===

  /** Notification settings */
  notify?: {
    /** Webhook URL to POST error details */
    webhookUrl?: string
    /** HTTP headers for webhook */
    webhookHeaders?: Record<string, string>
    /** Whether to include stack trace in notification */
    includeStack?: boolean
    /** Whether to include node input/context in notification */
    includeContext?: boolean
    /** Custom message template (supports {{ error.message }}, {{ node.id }}, etc.) */
    messageTemplate?: string
  }

  // === Logging Configuration ===

  /** Logging settings */
  log?: {
    /** Log level for this error handler */
    level: 'error' | 'warn' | 'info' | 'debug'
    /** Whether to include the node data that caused the error */
    includeNodeData?: boolean
    /** Whether to include input data */
    includeInput?: boolean
  }

  // === Condition Configuration ===

  /** Only handle errors matching these conditions */
  conditions?: {
    /** Error codes/patterns to match (regex supported) */
    errorCodes?: string[]
    /** Error message patterns to match (regex supported) */
    messagePatterns?: string[]
    /** Node types this handler applies to */
    nodeTypes?: WorkflowNodeType[]
  }

  /** Description of this error handler */
  description?: string
}

/**
 * CheckpointNodeData - Configurable observation point for workflow execution
 *
 * The Checkpoint node is a flexible observation/control point that can:
 * - Log data to console and execution history
 * - Pause execution in debug mode (breakpoint)
 * - Gate execution requiring human approval (production use)
 * - Send webhook notifications to external systems
 *
 * Pre-Node Aware: The checkpoint detects what type of node feeds into it
 * and can subscribe to specific events from that node (e.g., Agent iterations).
 *
 * All behaviors are toggleable and can be combined.
 */
export interface CallbackNodeData extends BaseNodeData {
  /** Custom name for this checkpoint (shown in logs/UI) */
  checkpointName?: string
  /** Description of what this checkpoint monitors */
  description?: string

  // ============================================================================
  // Behaviors (toggleable, can combine multiple)
  // ============================================================================

  /** Log checkpoint data to console/stdout */
  logToConsole?: boolean
  /** Store checkpoint data in execution history for later review */
  logToHistory?: boolean
  /** Pause execution when running in debug mode (breakpoint) */
  pauseInDebug?: boolean
  /** Require human approval before continuing (works in production) */
  requireApproval?: boolean
  /** Send HTTP webhook notification */
  sendWebhook?: boolean

  // ============================================================================
  // Data Capture Options
  // ============================================================================

  /** Include the previous node's output in checkpoint data */
  capturePreviousOutput?: boolean
  /** Include timestamp and execution duration */
  captureTimestamp?: boolean
  /** Include full execution context (all variables, workflow state) */
  captureFullContext?: boolean
  /** Custom message template (supports {{ }} expressions) */
  message?: string

  // ============================================================================
  // Approval Options (when requireApproval is true)
  // ============================================================================

  /** Title shown in approval dialog */
  approvalTitle?: string
  /** Instructions for the reviewer */
  approvalInstructions?: string
  /** Timeout in ms to wait for approval (0 = wait indefinitely) */
  approvalTimeoutMs?: number
  /** What to do if approval times out */
  approvalTimeoutAction?: 'continue' | 'fail' | 'skip'

  // ============================================================================
  // Webhook Options (when sendWebhook is true)
  // ============================================================================

  /** Webhook URL to POST checkpoint data */
  webhookUrl?: string
  /** Custom headers to include in webhook request */
  webhookHeaders?: Record<string, string>
  /** Whether to wait for webhook acknowledgment before continuing */
  webhookWaitForAck?: boolean
  /** Timeout in ms to wait for acknowledgment (0 = no timeout) */
  webhookAckTimeoutMs?: number

  // ============================================================================
  // Pre-Node Awareness (auto-detected based on incoming connection)
  // ============================================================================

  /**
   * Detected type of the node connected to this checkpoint's input.
   * This is auto-populated and used to show relevant options in the UI.
   * @readonly - Set automatically, not user-configurable
   */
  _detectedSourceType?: WorkflowNodeType

  // === Agent-specific options (shown when source is 'agent') ===

  /** Include full iteration history from agent execution */
  agentCaptureIterations?: boolean
  /** Include conversation/message history */
  agentCaptureConversation?: boolean
  /** Include tool call details and results */
  agentCaptureToolCalls?: boolean
  /** Include agent's thinking/reasoning (if available) */
  agentCaptureThinking?: boolean

  /**
   * Event types to listen for when connected to an Agent's onCheckpoint handle.
   * If empty or undefined, listens to all event types.
   */
  listenTo?: AgentCheckpointEventType[]

  // === Loop-specific options (shown when source is 'loop') ===

  /** Capture current iteration index */
  loopCaptureIteration?: boolean
  /** Capture loop variable value */
  loopCaptureVariable?: boolean

  // === Prompt-specific options (shown when source is 'prompt') ===

  /** Include the compiled prompt that was sent to the LLM */
  promptCaptureCompiled?: boolean
  /** Include token usage stats */
  promptCaptureTokens?: boolean

  // ============================================================================
  // Legacy/Deprecated (for backwards compatibility)
  // ============================================================================

  /** @deprecated Use individual behavior toggles instead */
  mode?: 'passthrough' | 'pause' | 'report'
  /** @deprecated Use capturePreviousOutput instead */
  includePreviousOutput?: boolean
  /** @deprecated Use captureFullContext instead */
  includeNextNodeInfo?: boolean
  /** @deprecated Use webhookWaitForAck instead */
  waitForAck?: boolean
  /** @deprecated Use webhookAckTimeoutMs instead */
  ackTimeoutMs?: number
  /** @deprecated Use agentCaptureIterations instead */
  agentIncludeIterationHistory?: boolean
  /** @deprecated Use agentCaptureConversation instead */
  agentIncludeConversationHistory?: boolean
  /** @deprecated Use agentCaptureToolCalls instead */
  agentIncludeToolCalls?: boolean
}

/**
 * UserInputNodeData - Pause workflow and collect user input
 *
 * This node pauses execution and waits for user input. It can be used for:
 * - Interactive chat loops (user message -> LLM -> user message -> ...)
 * - Human-in-the-loop approval workflows
 * - Data collection mid-workflow
 * - Debugging with manual input injection
 *
 * The node provides context (previous output, conversation history) to help
 * the user understand what input is needed.
 */
export interface UserInputNodeData extends BaseNodeData {
  /** Prompt message shown to the user (supports {{ }} template expressions) */
  prompt: string
  /** Type of input to collect */
  inputType: 'text' | 'textarea' | 'choice' | 'confirm' | 'number'
  /** Choices for 'choice' input type */
  choices?: string[]
  /** Placeholder text for input field */
  placeholder?: string
  /** Default value for the input */
  defaultValue?: string
  /** Whether input is required to continue */
  required?: boolean
  /** Whether to show the previous node's output to the user */
  showContext?: boolean
  /** Custom template for displaying context (supports {{ previous_output }}, {{ variables }}) */
  contextTemplate?: string
  /** Timeout in ms (0 = wait indefinitely) */
  timeout?: number
}

// ============================================================================
// Phase E: Advanced Nodes
// ============================================================================

/**
 * CommandNodeData - Execute whitelisted shell commands
 *
 * This node executes shell commands with proper security controls:
 * - Commands can be whitelisted by admin
 * - Arguments are passed safely (not interpolated into command string)
 * - Output is captured and parsed
 * - Requires approval for sensitive operations
 */
export interface CommandNodeData extends BaseNodeData {
  /** Command template (supports {{ }} expressions for arguments) */
  command: string

  /** Command arguments (safer than string interpolation) */
  args?: string[]

  /** Working directory (relative to workspace) */
  cwd?: string

  /** Environment variables to set */
  env?: Record<string, string>

  /** Timeout in milliseconds */
  timeoutMs?: number

  /** Output parsing format */
  outputFormat: 'text' | 'json' | 'lines'

  /** Whether this command requires user approval before execution */
  requiresApproval?: boolean

  /** Description shown in approval dialog */
  approvalMessage?: string
}

/**
 * WebSearchNodeData - Search the web via configurable provider
 *
 * Uses the connection system to configure which search provider to use.
 * Supports LangSearch (free), Brave Search, and Tavily.
 */
export interface WebSearchNodeData extends BaseNodeData {
  /** Search query template (supports {{ }} expressions) */
  query: string

  /** Maximum number of results to return (default: 5) */
  resultCount?: number

  /** Search provider: 'langsearch' (free, default), 'brave', or 'tavily' */
  provider?: 'langsearch' | 'brave' | 'tavily'

  /** API key for LangSearch/Brave/Tavily providers */
  apiKey?: string
}

/**
 * ClaudeCodeNodeData - Claude Code agent with SSH support for remote development
 *
 * This node encapsulates a full Claude Code agent that can:
 * - Connect to local or remote systems via SSH
 * - Execute multi-turn development tasks
 * - Use file editing, command execution, and web tools
 * - Stream progress back to the workflow
 */
export interface ClaudeCodeNodeData extends BaseNodeData {
  /** Connection type and configuration */
  connection: {
    type: 'local' | 'ssh'

    /** SSH settings (when type === 'ssh') */
    ssh?: {
      /** Reference to SSH connection from Connections Panel */
      connectionId?: string
      /** Or inline config (deprecated - use connectionId) */
      host?: string
      port?: number
      username?: string
      authMethod?: 'key' | 'agent'
      keyPath?: string
    }
  }

  /** Task configuration */
  task: {
    /** Main task description (supports {{ }} template expressions) */
    prompt: string

    /** Optional system prompt override */
    systemPrompt?: string

    /** Working directory on target (relative or absolute) */
    workingDirectory?: string

    /** Files to include as context (glob patterns) */
    contextFiles?: string[]
  }

  /** Execution constraints */
  constraints: {
    /** Maximum agent turns before forcing completion */
    maxTurns?: number

    /** Allowed tool categories */
    allowedTools?: ('read' | 'write' | 'execute' | 'web')[]

    /** Blocked file patterns (security) */
    blockedPaths?: string[]

    /** Require approval for write operations */
    requireApprovalForWrites?: boolean

    /** Timeout for entire execution (ms) */
    timeoutMs?: number
  }

  /** Output configuration */
  output: {
    /** What to return as node output */
    format: 'final-response' | 'full-conversation' | 'files-changed' | 'structured'

    /** For structured output - JSON schema to enforce */
    schema?: JsonSchema

    /** Include execution metadata (tokens, duration, etc.) */
    includeMetadata?: boolean
  }
}

/**
 * WorkflowNodeData - Invoke another .pdflow as a sub-workflow
 *
 * This enables workflow composition:
 * - Call reusable workflow modules
 * - Pass parameters and receive outputs
 * - Support for recursive workflows (with depth limit)
 */
export interface WorkflowNodeData extends BaseNodeData {
  /** Source workflow path or package reference */
  source: string

  /** Parameter mapping (input to sub-workflow) */
  parameters: Record<string, string>

  /** Output mapping (sub-workflow output to this node's output) */
  outputMapping?: Record<string, string>

  /** Execution options */
  timeout?: number

  /** Whether to pass parent workflow variables */
  inheritVariables?: boolean

  /** Maximum recursion depth (to prevent infinite loops) */
  maxDepth?: number
}

/**
 * McpToolNodeData - Execute tools from external MCP servers
 *
 * This node connects to external MCP servers and executes their tools.
 * Unlike the generic Tool node, this is specifically for MCP protocol
 * and supports MCP-specific features like resources and prompts.
 */
export interface McpToolNodeData extends BaseNodeData {
  /** Reference to MCP server connection from Connections Panel */
  connectionId?: string

  /** Or inline MCP server config (deprecated - use connectionId) */
  serverConfig?: {
    serverUrl?: string
    serverName?: string
    transport?: 'stdio' | 'http' | 'websocket'
  }

  /** Tool name to execute */
  toolName: string

  /** Parameter mapping (supports {{ }} expressions) */
  parameters: Record<string, string>

  /** Timeout for tool execution (ms) */
  timeoutMs?: number

  /** Whether to include tool result in conversation context */
  includeInContext?: boolean
}

/**
 * CodeNodeData - Execute code snippets in various languages
 *
 * Supports:
 * - TypeScript/JavaScript: Runs in isolated VM context or via temp file
 * - Python: Executes via python -c or temp file
 * - C#: Executes via dotnet-script or compiled temp file
 *
 * The previous_output is available as a variable (default name: 'input')
 */
export interface CodeNodeData extends BaseNodeData {
  /** Programming language */
  language: 'typescript' | 'javascript' | 'python' | 'csharp'

  /** The code to execute */
  code: string

  /** Variable name for the input (previous_output), default: 'input' */
  inputVariable?: string

  /** For TS/JS: run in isolated VM or main context */
  executionContext?: 'isolated' | 'main'

  /** Timeout in milliseconds (default: 30000) */
  timeoutMs?: number

  /** Description of what this code does */
  description?: string
}

/**
 * MemoryNodeData - Configurable memory storage node
 *
 * Supports multiple memory patterns:
 * - 'kv': Key-value store for passing state between nodes
 * - 'conversation': Message history with sliding window for chat context
 * - 'cache': Time-based caching for expensive operations
 *
 * Memory is scoped to workflow execution by default, but can be
 * persisted across executions via the 'persistent' flag.
 *
 * Handles:
 * - input (left) - Data to store or key to retrieve
 * - output (right) - Retrieved value or confirmation
 */
/** Memory operation type */
export type MemoryOperation = 'get' | 'set' | 'delete' | 'clear' | 'list' | 'append'

/** Operations available per memory mode */
export const MEMORY_OPERATIONS_BY_MODE: Record<string, MemoryOperation[]> = {
  kv: ['get', 'set', 'delete', 'list', 'clear'],
  conversation: ['get', 'append', 'clear'],
  cache: ['get', 'set', 'delete', 'clear'],
}

export interface MemoryNodeData extends BaseNodeData {
  /** Memory operation mode */
  mode: 'kv' | 'conversation' | 'cache'

  /**
   * Operations this node can perform (multi-select).
   * When multiple operations are enabled, the input data's `operation` field
   * determines which to execute, or defaults to the first enabled operation.
   */
  operations: MemoryOperation[]

  // ============================================================================
  // Key-Value Mode Configuration
  // ============================================================================

  /**
   * Key for the value (supports {{ }} template expressions).
   * Used in kv and cache modes.
   */
  key?: string

  /**
   * Value to store (supports {{ }} template expressions).
   * Used with 'set' operation. If not provided, uses input data.
   */
  value?: string

  /**
   * Default value to return if key doesn't exist.
   * Used with 'get' operation.
   */
  defaultValue?: string

  // ============================================================================
  // Conversation Mode Configuration
  // ============================================================================

  /**
   * Conversation/thread identifier (supports {{ }} expressions).
   * Allows multiple separate conversation histories.
   */
  conversationId?: string

  /**
   * Role for the message being appended ('user', 'assistant', 'system').
   * Used with 'append' operation in conversation mode.
   */
  messageRole?: 'user' | 'assistant' | 'system'

  /**
   * Maximum messages to retain in sliding window.
   * Older messages are removed when limit is exceeded.
   * Set to 0 for unlimited.
   */
  maxMessages?: number

  /**
   * Include system messages in the sliding window count.
   * If false, system messages are always retained.
   */
  includeSystemInWindow?: boolean

  // ============================================================================
  // Cache Mode Configuration
  // ============================================================================

  /**
   * Time-to-live in seconds for cached values.
   * After TTL expires, 'get' returns defaultValue or undefined.
   * Set to 0 for no expiration.
   */
  ttlSeconds?: number

  /**
   * Refresh TTL on read (sliding expiration).
   * If true, reading a value resets its TTL.
   */
  refreshOnRead?: boolean

  // ============================================================================
  // Persistence & Scope
  // ============================================================================

  /**
   * Memory scope:
   * - 'execution': Cleared when workflow execution completes (default)
   * - 'workflow': Persists across executions of this workflow
   * - 'global': Shared across all workflows (use with caution)
   */
  scope?: 'execution' | 'workflow' | 'global'

  /**
   * Namespace to isolate this memory from others.
   * Useful for avoiding key collisions in global scope.
   */
  namespace?: string

  // ============================================================================
  // Output Configuration
  // ============================================================================

  /**
   * What to output after the operation:
   * - 'value': The retrieved/stored value
   * - 'success': Boolean indicating success
   * - 'metadata': Object with value, timestamp, ttl info
   * - 'passthrough': Pass input through unchanged
   */
  outputMode?: 'value' | 'success' | 'metadata' | 'passthrough'
}

/**
 * CustomCommandConfig - User-defined allowed commands
 *
 * Stored in the Connections panel, these allow users to whitelist
 * additional shell commands for use in Tool nodes.
 */
export interface CustomCommandConfig {
  /** Unique identifier */
  id: string

  /** The executable name (e.g., 'cargo', 'terraform', 'kubectl') */
  executable: string

  /** Allowed actions/subcommands (if empty, any args allowed with validation) */
  allowedActions?: string[]

  /** Human-readable description */
  description?: string

  /** Whether to require approval before execution */
  requiresApproval: boolean

  /** When this command was added */
  addedAt: number
}

/**
 * Built-in allowed executables for command tool type
 */
export const BUILTIN_COMMAND_EXECUTABLES = [
  // Package managers
  { executable: 'npm', description: 'Node.js package manager', actions: ['run', 'install', 'test', 'build', 'start'] },
  { executable: 'npx', description: 'Execute npm packages', actions: [] },
  { executable: 'node', description: 'Node.js runtime', actions: [] },
  { executable: 'yarn', description: 'Yarn package manager', actions: ['run', 'install', 'test', 'build', 'start'] },
  { executable: 'pnpm', description: 'PNPM package manager', actions: ['run', 'install', 'test', 'build', 'start'] },
  { executable: 'pip', description: 'Python package manager', actions: ['install', 'list', 'show'] },
  // Version control
  { executable: 'git', description: 'Version control', actions: ['status', 'add', 'commit', 'push', 'pull', 'log', 'diff', 'branch'] },
  // Languages and runtimes
  { executable: 'python', description: 'Python interpreter', actions: [] },
  { executable: 'python3', description: 'Python 3 interpreter', actions: [] },
  { executable: 'prompd', description: 'Prompd CLI', actions: ['compile', 'run', 'validate', 'package', 'list', 'show'] },
  { executable: 'dotnet', description: '.NET CLI', actions: ['build', 'run', 'test', 'publish'] },
  { executable: 'tsc', description: 'TypeScript compiler', actions: [] },
  { executable: 'eslint', description: 'JavaScript linter', actions: [] },
  { executable: 'prettier', description: 'Code formatter', actions: [] },
  // Filesystem and shell utilities
  { executable: 'ls', description: 'List directory contents', actions: [] },
  { executable: 'dir', description: 'List directory contents (Windows)', actions: [] },
  { executable: 'find', description: 'Find files by name or pattern', actions: [] },
  { executable: 'cat', description: 'Display file contents', actions: [] },
  { executable: 'head', description: 'Display first lines of file', actions: [] },
  { executable: 'tail', description: 'Display last lines of file', actions: [] },
  { executable: 'grep', description: 'Search text patterns in files', actions: [] },
  { executable: 'sed', description: 'Stream editor for text transformation', actions: [] },
  { executable: 'awk', description: 'Text processing', actions: [] },
  { executable: 'wc', description: 'Word/line/byte count', actions: [] },
  { executable: 'sort', description: 'Sort lines', actions: [] },
  { executable: 'uniq', description: 'Filter duplicate lines', actions: [] },
  { executable: 'diff', description: 'Compare files', actions: [] },
  { executable: 'cp', description: 'Copy files', actions: [] },
  { executable: 'mv', description: 'Move/rename files', actions: [] },
  { executable: 'mkdir', description: 'Create directories', actions: [] },
  { executable: 'touch', description: 'Create empty files or update timestamps', actions: [] },
  { executable: 'echo', description: 'Print text', actions: [] },
  { executable: 'pwd', description: 'Print working directory', actions: [] },
  { executable: 'which', description: 'Locate a command', actions: [] },
  { executable: 'where', description: 'Locate a command (Windows)', actions: [] },
  { executable: 'type', description: 'Display file contents (Windows)', actions: [] },
  { executable: 'tree', description: 'Display directory tree', actions: [] },
  { executable: 'curl', description: 'Transfer data from URLs', actions: [] },
  { executable: 'wget', description: 'Download files from web', actions: [] },
] as const

/**
 * AgentIterationRecord - Record of a single agent iteration for debugging
 */
export interface AgentIterationRecord {
  iteration: number
  timestamp: number
  llmInput: {
    systemPrompt: string
    conversationHistory: Array<{ role: string; content: string }>
  }
  llmOutput: {
    response: string
    hasToolCall: boolean
    toolName?: string
    toolParams?: Record<string, unknown>
  }
  toolExecution?: {
    toolName: string
    parameters: Record<string, unknown>
    result: unknown
    error?: string
    durationMs: number
  }
  durationMs: number
}

// ============================================================================
// Agent Checkpoint Event Types
// ============================================================================

/**
 * AgentCheckpointEvent - Events emitted by Agent nodes during execution
 *
 * Agent nodes emit these events through their onCheckpoint handle, allowing
 * connected Callback nodes to observe and react to agent execution.
 *
 * Event types:
 * - toolCall: Agent is requesting a tool execution
 * - iteration: Agent completed an iteration of the ReAct loop
 * - thinking: Agent emitted reasoning/chain-of-thought
 * - error: An error occurred during agent execution
 * - complete: Agent finished execution
 */
export type AgentCheckpointEventType = 'toolCall' | 'iteration' | 'thinking' | 'error' | 'complete'

export interface AgentCheckpointEvent {
  /** Type of event */
  type: AgentCheckpointEventType
  /** When the event occurred */
  timestamp: number
  /** Current iteration number (1-indexed) */
  iteration: number
  /** Node ID of the agent that emitted this event */
  agentNodeId: string
  /** Event-specific data */
  data: ToolCallEventData | IterationEventData | ThinkingEventData | ErrorEventData | CompleteEventData
}

/** Data for 'toolCall' events - agent is requesting tool execution */
export interface ToolCallEventData {
  toolName: string
  parameters: Record<string, unknown>
  /** Tool schema for validation (if available) */
  schema?: {
    type: 'object'
    properties?: Record<string, { type: string; description?: string }>
    required?: string[]
  }
}

/** Data for 'iteration' events - agent completed a ReAct loop iteration */
export interface IterationEventData {
  iterationNumber: number
  llmInput: {
    systemPrompt: string
    messages: Array<{ role: string; content: string }>
  }
  llmOutput: {
    response: string
    hasToolCall: boolean
    toolName?: string
    toolParams?: Record<string, unknown>
  }
  durationMs: number
}

/** Data for 'thinking' events - agent's reasoning/chain-of-thought */
export interface ThinkingEventData {
  thought: string
}

/** Data for 'error' events - an error occurred */
export interface ErrorEventData {
  message: string
  code?: string
  stack?: string
  recoverable: boolean
}

/** Data for 'complete' events - agent finished execution */
export interface CompleteEventData {
  finalResponse: string
  totalIterations: number
  totalDurationMs: number
  stopReason: 'max-iterations' | 'stop-phrase' | 'no-tool-call' | 'error' | 'completed'
}

/**
 * AgentNodeData - Autonomous AI agent with tool-use loop
 *
 * Implements a ReAct-style (Reasoning + Acting) agent that:
 * 1. Sends a prompt to an LLM with tool definitions
 * 2. Parses the response for tool calls
 * 3. Executes requested tools
 * 4. Feeds results back to the LLM
 * 5. Repeats until LLM provides final answer or max iterations reached
 *
 * This encapsulates the common "agentic loop" pattern into a single node.
 *
 * Debug Mode:
 * When debugConfig.debugMode is enabled, the agent emits detailed traces at
 * internal checkpoints and can optionally pause at each checkpoint (like breakpoints).
 * Iteration history is stored in the node output for downstream analysis.
 */
export interface AgentNodeData extends BaseNodeData {
  /** System prompt that defines the agent's behavior and available tools */
  systemPrompt: string

  /** Initial user message / task description (supports {{ }} template expressions) */
  userPrompt: string

  /** Reference to a Provider node by ID (preferred - enables centralized config) */
  providerNodeId?: string

  /** Inline LLM provider (fallback if no providerNodeId) */
  provider?: string

  /** Inline model (fallback if no providerNodeId) */
  model?: string

  /** Tool definitions available to the agent (legacy - prefer toolRouterNodeId) */
  tools: AgentTool[]

  /** Reference to a ToolCallRouter node by ID (preferred over inline tools) */
  toolRouterNodeId?: string

  /** Maximum number of tool-use iterations before stopping */
  maxIterations: number

  /** Format for tool calls in LLM responses */
  toolCallFormat: 'auto' | 'openai' | 'anthropic' | 'xml' | 'json'

  /** What to output when agent completes */
  outputMode: 'final-response' | 'full-conversation' | 'last-tool-result'

  /** Whether to include conversation history in context */
  includeHistory?: boolean

  /** Stop phrases that indicate the agent is done (in addition to no tool call) */
  stopPhrases?: string[]

  /** Temperature for LLM calls */
  temperature?: number

  /** Timeout per LLM call in ms */
  llmTimeout?: number
}

/**
 * GuardrailNodeData - Input validation node with success/rejected branching
 *
 * Validates input against a system prompt and routes to success or rejected paths.
 * Uses an LLM to evaluate the input and determine if it passes validation.
 *
 * Handles:
 * - input (left, top) - Data to validate
 * - rejected (left, bottom) - Source handle for routing rejected input back
 *
 * Outputs:
 * - output (right) - Validated input passes through on success
 *
 * The guardrail evaluates the input using the configured provider and system prompt,
 * then uses the passExpression to determine if the result indicates pass or fail.
 */
export interface GuardrailNodeData extends BaseNodeData {
  /** System prompt that defines the validation criteria */
  systemPrompt: string

  /** Reference to a Provider node by ID for LLM evaluation */
  providerNodeId?: string

  /** Inline provider (fallback if no providerNodeId) */
  provider?: string

  /** Inline model (fallback if no providerNodeId) */
  model?: string

  /**
   * Expression to evaluate pass/fail from the LLM response.
   * Supports {{ }} template syntax with access to the parsed response.
   *
   * Examples:
   * - "{{ score >= 0.8 }}" - Pass if score is 0.8 or higher
   * - "{{ !rejected }}" - Pass if rejected is falsy
   * - "{{ score >= 0.8 && !rejected }}" - Combined conditions
   *
   * The expression is evaluated against the parsed JSON response from the LLM.
   * If the LLM returns a non-JSON response, it's wrapped as { response: "..." }
   */
  passExpression?: string

  /**
   * Numeric threshold for pass/fail (alternative to passExpression).
   * If the LLM response contains a 'score' field, this threshold is used.
   * Input passes if score >= scoreThreshold.
   */
  scoreThreshold?: number

  /** Temperature for LLM evaluation (default: 0 for deterministic) */
  temperature?: number

  /** Timeout for LLM call in ms */
  timeout?: number

  /** Description of what this guardrail validates */
  description?: string

  /** Output mode when guardrail passes */
  outputMode?: 'passthrough' | 'original' | 'reject-message'

  /** Expected response format from LLM */
  expectedFormat?: 'json' | 'text'

  /** JSON field to check for rejection status */
  rejectionField?: string

  /** Pass when field is true or false */
  passWhen?: 'true' | 'false'

  /** Action to take when guardrail fails */
  failAction?: 'error' | 'stop' | 'continue'

  /** Custom message when rejected */
  customRejectMessage?: string

  /** Custom rejection expression (advanced) - overrides simple field check */
  rejectionExpression?: string
}

/**
 * ChatAgentNodeData - Composite container for conversational AI agent pattern
 *
 * Bundles the common pattern of: User Input → Guardrail → AI Agent ↔ Tool Router
 * into a single, configurable node with checkpoints at each stage.
 *
 * When collapsed: Shows as a single node with key metrics
 * When expanded: Shows all internal nodes for detailed editing
 *
 * Internal nodes (auto-created):
 * - UserInput: Collects user message
 * - Guardrail: Validates input before processing
 * - Agent: AI agent with ReAct loop
 * - ToolRouter: Container for available tools
 *
 * Handles:
 * - input (left) - Workflow data / conversation context
 * - output (right) - Final agent response
 * - rejected (left, bottom) - Guardrail rejection path
 */
export interface ChatAgentNodeData extends BaseNodeData {
  // ============================================================================
  // Container State
  // ============================================================================

  /** Whether the container is collapsed (shows as single node) */
  collapsed?: boolean

  /** Saved dimensions when expanded */
  _savedWidth?: number
  _savedHeight?: number

  // ============================================================================
  // Agent Configuration (propagates to internal Agent node)
  // ============================================================================

  /**
   * Agent prompt source type:
   * - 'raw': Inline text prompt (agentSystemPrompt field)
   * - 'file': Reference to .prmd file or package (agentPromptSource field)
   */
  agentPromptSourceType?: 'raw' | 'file'

  /** System prompt for the AI agent (used when agentPromptSourceType is 'raw' or not set) */
  agentSystemPrompt: string

  /** Source file for agent prompt (used when agentPromptSourceType is 'file') - local .prmd path or package reference */
  agentPromptSource?: string

  /** Initial user prompt template (supports {{ }} expressions) */
  agentUserPrompt?: string

  /** Reference to Provider node for LLM */
  providerNodeId?: string

  /** Inline provider (fallback) */
  provider?: string

  /** Inline model (fallback) */
  model?: string

  /** Maximum ReAct loop iterations */
  maxIterations?: number

  /** Tool call format detection */
  toolCallFormat?: 'auto' | 'openai' | 'anthropic' | 'xml' | 'json'

  /** What to output when complete */
  outputMode?: 'final-response' | 'full-conversation' | 'last-tool-result'

  /** Temperature for LLM calls */
  temperature?: number

  // ============================================================================
  // Loop Configuration - Controls the agent's iterative behavior
  // ============================================================================

  /**
   * Loop mode for the chat agent:
   * - 'single-turn': Execute once and return (no looping)
   * - 'multi-turn': Continue until stop condition or max iterations
   * - 'until-complete': Loop until agent signals completion
   * - 'user-driven': Loop back for user input after each response
   */
  loopMode?: 'single-turn' | 'multi-turn' | 'until-complete' | 'user-driven'

  /**
   * Condition expression to continue looping (for multi-turn mode).
   * Evaluated after each iteration. Loop continues while this is true.
   * Uses {{ }} template syntax with access to iteration context.
   *
   * Examples:
   * - "{{ iteration < 5 }}" - Continue for 5 iterations
   * - "{{ !response.includes('DONE') }}" - Until response contains DONE
   * - "{{ tools_used > 0 }}" - Continue if tools were used
   */
  loopCondition?: string

  /**
   * Stop phrases that signal the agent is done.
   * If the response contains any of these, the loop terminates.
   */
  stopPhrases?: string[]

  /**
   * Whether to prompt for user input after each agent response (for user-driven mode).
   * When true, the loop pauses for user input before continuing.
   */
  loopOnUserInput?: boolean

  /**
   * Minimum number of iterations before stop condition is checked.
   * Ensures the agent runs at least this many times.
   */
  minIterations?: number

  /**
   * Delay between iterations in milliseconds.
   * Useful for rate limiting or allowing processing time.
   */
  iterationDelayMs?: number

  // ============================================================================
  // Guardrail Configuration (propagates to internal Guardrail node)
  // ============================================================================

  /** Whether guardrail is enabled */
  guardrailEnabled?: boolean

  /** Guardrail system prompt */
  guardrailSystemPrompt?: string

  /** Reference to Provider node for guardrail LLM (can be different from agent's provider) */
  guardrailProviderNodeId?: string

  /** Inline provider for guardrail (fallback if no guardrailProviderNodeId) */
  guardrailProvider?: string

  /** Inline model for guardrail (fallback if no guardrailProviderNodeId) */
  guardrailModel?: string

  /** Temperature for guardrail LLM evaluation (default: 0 for deterministic) */
  guardrailTemperature?: number

  /** Pass/fail expression */
  guardrailPassExpression?: string

  /** Score threshold alternative */
  guardrailScoreThreshold?: number

  /** Output mode when guardrail passes */
  guardrailOutputMode?: 'passthrough' | 'original' | 'reject-message'

  /** Expected response format from guardrail LLM */
  guardrailExpectedFormat?: 'json' | 'text'

  /** JSON field to check for rejection status */
  guardrailRejectionField?: string

  /** Pass when field is true or false */
  guardrailPassWhen?: 'true' | 'false'

  /** Action to take when guardrail fails */
  guardrailFailAction?: 'error' | 'stop' | 'continue'

  /** Custom message when rejected */
  guardrailCustomRejectMessage?: string

  /** Custom rejection expression (advanced) - overrides simple field check */
  guardrailRejectionExpression?: string

  // ============================================================================
  // User Input Configuration (propagates to internal UserInput node)
  // ============================================================================

  /** Whether to prompt for user input at start of each iteration */
  userInputEnabled?: boolean

  /** Prompt message shown to user */
  userInputPrompt?: string

  /** Input type */
  userInputType?: 'text' | 'textarea' | 'choice' | 'confirm'

  /** Placeholder text */
  userInputPlaceholder?: string

  /** Whether to show previous context to user */
  userInputShowContext?: boolean

  // ============================================================================
  // Tool Configuration (propagates to internal ToolRouter)
  // ============================================================================

  /** Inline tool definitions (for simple cases) */
  tools?: AgentTool[]

  /** Reference to external ToolRouter node (for complex tool setups) */
  toolRouterNodeId?: string

  // ============================================================================
  // Checkpoint Configuration - Control observability at each stage
  // ============================================================================

  /** Checkpoint settings for different stages */
  checkpoints?: {
    /** On user input received */
    onUserInput?: ChatAgentCheckpointConfig

    /** Before guardrail validation */
    beforeGuardrail?: ChatAgentCheckpointConfig

    /** After guardrail (pass or reject) */
    afterGuardrail?: ChatAgentCheckpointConfig

    /** Before each agent iteration */
    onIterationStart?: ChatAgentCheckpointConfig

    /** After each agent iteration */
    onIterationEnd?: ChatAgentCheckpointConfig

    /** When agent requests a tool call */
    onToolCall?: ChatAgentCheckpointConfig

    /** After tool execution returns */
    onToolResult?: ChatAgentCheckpointConfig

    /** When agent completes */
    onAgentComplete?: ChatAgentCheckpointConfig
  }

  // ============================================================================
  // Internal Node References (auto-managed)
  // ============================================================================

  /** IDs of internal nodes (auto-created, managed by the container) */
  _internalNodes?: {
    userInputId?: string
    guardrailId?: string
    agentId?: string
    toolRouterId?: string
  }
}

/**
 * Checkpoint configuration for ChatAgentNode stages
 */
export interface ChatAgentCheckpointConfig {
  /** Whether this checkpoint is enabled */
  enabled: boolean

  /** Pause execution at this point (debug mode) */
  pause?: boolean

  /** Log to console */
  logToConsole?: boolean

  /** Log to execution history */
  logToHistory?: boolean

  /** Require approval to continue */
  requireApproval?: boolean

  /** Send webhook notification */
  sendWebhook?: boolean
  webhookUrl?: string

  /** Custom message template */
  message?: string

  /** Include full context in checkpoint data */
  includeFullContext?: boolean
}

/**
 * Tool definition for an agent
 */
export interface AgentTool {
  /** Unique tool name */
  name: string

  /** Description shown to the LLM */
  description: string

  /** JSON schema for tool parameters */
  parameters?: {
    type: 'object'
    properties?: Record<string, {
      type: string
      description?: string
      enum?: string[]
      default?: unknown
    }>
    required?: string[]
  }

  /** How this tool is executed */
  toolType: 'function' | 'http' | 'mcp' | 'workflow' | 'command' | 'code'

  /** For HTTP tools */
  httpConfig?: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
    url: string
    headers?: Record<string, string>
    bodyTemplate?: string
  }

  /** For MCP tools */
  mcpConfig?: {
    serverUrl?: string
    serverName?: string
  }

  /** For workflow tools - execute a sub-workflow */
  workflowConfig?: {
    workflowPath: string
  }

  /** For command tools - execute shell commands */
  commandConfig?: {
    executable: string
    action?: string
    args?: string
    cwd?: string
    requiresApproval?: boolean
  }

  /** For code tools - execute code snippets */
  codeConfig?: {
    language: 'typescript' | 'javascript' | 'python' | 'csharp'
    snippet: string
    inputVariable?: string
    executionContext?: 'isolated' | 'main'
  }
}

// ============================================================================
// Edges (React Flow standard format)
// ============================================================================

/**
 * WorkflowEdge uses React Flow's standard edge format directly.
 * This eliminates conversion overhead and makes debugging easier.
 */
export interface WorkflowEdge {
  id: string
  source: string        // Source node ID
  target: string        // Target node ID
  sourceHandle?: string // 'output' or condition ID (optional, defaults to 'output')
  targetHandle?: string // 'input' (optional, defaults to 'input')
  animated?: boolean    // For visual feedback
  label?: string        // Edge label (e.g., condition name)
}

// ============================================================================
// Configuration
// ============================================================================

export interface ErrorHandlingConfig {
  onError: 'continue' | 'stop' | 'retry'
  retryPolicy?: RetryPolicy
  fallbackNode?: string
}

export interface RetryPolicy {
  enabled: boolean
  maxRetries: number
  backoffMs: number
  backoffMultiplier?: number
}

export interface ExecutionConfig {
  timeout?: number // ms
  parallelism?: {
    enabled: boolean
    maxConcurrency: number
  }
  logging?: {
    level: 'debug' | 'info' | 'warn' | 'error'
    includeTimings?: boolean
  }
  caching?: {
    enabled: boolean
    ttlMs: number
  }
}

// ============================================================================
// JSON Schema (simplified)
// ============================================================================

export interface JsonSchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'integer'
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
  required?: string[]
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  enum?: unknown[]
}

// ============================================================================
// Validation Types
// ============================================================================

export interface WorkflowValidationError {
  nodeId?: string
  connectionId?: string
  field?: string
  message: string
  code: string
}

export interface WorkflowValidationWarning {
  nodeId?: string
  message: string
  code: string
}

// ============================================================================
// Execution State Types
// ============================================================================

export type WorkflowExecutionStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed'
export type NodeExecutionStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'skipped'

export interface WorkflowExecutionState {
  workflowId: string
  status: WorkflowExecutionStatus
  currentNodeId?: string
  nodeStates: Record<string, NodeExecutionState>
  nodeOutputs: Record<string, unknown>
  variables: Record<string, unknown>
  errors: WorkflowExecutionError[]
  startTime?: number
  endTime?: number
  /** Memory storage for MemoryNode operations */
  memory?: {
    /** Key-value store (by namespace or root) */
    kv: Record<string, unknown>
    /** Conversation histories (by conversation ID) */
    conversation: Record<string, unknown[]>
    /** Cache entries with TTL (by namespace or root) */
    cache: Record<string, unknown>
  }
}

export interface NodeExecutionState {
  nodeId: string
  status: NodeExecutionStatus
  startTime?: number
  endTime?: number
  output?: unknown
  error?: string
  retryCount: number
  streamingContent?: string
}

export interface WorkflowExecutionError {
  nodeId?: string
  message: string
  stack?: string
  timestamp: number
}

export interface WorkflowResult {
  success: boolean
  output?: unknown
  startTime?: number
  endTime?: number
  nodeOutputs: Record<string, unknown>
  errors: WorkflowExecutionError[]
  metrics: {
    totalDuration: number
    nodeMetrics: Record<string, { duration: number; tokens?: number }>
  }
}

// ============================================================================
// Connection Types (External Services)
// ============================================================================

/**
 * WorkflowConnectionType - Types of external connections managed in the Connections panel
 *
 * Connections are managed in a dedicated panel (not canvas nodes) to scale to
 * hundreds of connection types. Nodes reference connections by ID.
 */
export type WorkflowConnectionType =
  | 'ssh'           // SSH to remote server
  | 'database'      // PostgreSQL, MySQL, MongoDB, Redis, SQLite
  | 'http-api'      // Generic REST API with auth
  | 'slack'         // Slack workspace
  | 'github'        // GitHub API
  | 'mcp-server'    // External MCP server
  | 'websocket'     // WebSocket connection
  | 'web-search'    // Web search provider (LangSearch, Brave, Tavily)
  | 'custom'        // User-defined

export type WorkflowConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

/**
 * WorkflowConnection - External service connection managed in the Connections panel
 *
 * Stored separately from workflow nodes - connections are workflow-scoped resources
 * that can be referenced by multiple nodes via connectionId.
 */
export interface WorkflowConnection {
  id: string
  name: string
  type: WorkflowConnectionType
  status: WorkflowConnectionStatus
  lastConnected?: number
  lastError?: string
  config: WorkflowConnectionConfig
}

/** Union type for all connection configs */
export type WorkflowConnectionConfig =
  | SSHConnectionConfig
  | DatabaseConnectionConfig
  | HttpApiConnectionConfig
  | SlackConnectionConfig
  | GitHubConnectionConfig
  | McpServerConnectionConfig
  | WebSocketConnectionConfig
  | WebSearchConnectionConfig
  | CustomConnectionConfig

export interface SSHConnectionConfig {
  type: 'ssh'
  host: string
  port?: number
  username: string
  authMethod: 'key' | 'password' | 'agent'
  keyPath?: string
  // Password/passphrase stored encrypted, never in config
}

export interface DatabaseConnectionConfig {
  type: 'database'
  dbType: 'postgresql' | 'mysql' | 'mongodb' | 'redis' | 'sqlite'
  host?: string
  port?: number
  database: string
  username?: string
  ssl?: boolean
  connectionString?: string
}

export interface HttpApiConnectionConfig {
  type: 'http-api'
  baseUrl: string
  authType: 'none' | 'bearer' | 'api-key' | 'basic' | 'oauth2'
  headers?: Record<string, string>
  apiKeyHeader?: string  // Header name for API key
}

export interface SlackConnectionConfig {
  type: 'slack'
  workspace: string
  defaultChannel?: string
}

export interface GitHubConnectionConfig {
  type: 'github'
  owner?: string
  repo?: string
  baseUrl?: string  // For GitHub Enterprise
}

export interface McpServerConnectionConfig {
  type: 'mcp-server'
  serverUrl: string
  serverName: string
  transport: 'stdio' | 'http' | 'websocket'
}

export interface WebSocketConnectionConfig {
  type: 'websocket'
  url: string
  protocols?: string[]
  headers?: Record<string, string>
}

export interface WebSearchConnectionConfig {
  type: 'web-search'
  /** Search provider */
  provider: 'langsearch' | 'brave' | 'tavily'
  /** API key for LangSearch/Brave/Tavily */
  apiKey?: string
}

export interface CustomConnectionConfig {
  type: 'custom'
  [key: string]: unknown
}

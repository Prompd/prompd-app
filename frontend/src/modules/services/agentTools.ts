/**
 * Agent Tools - Tool definitions and types for the Agent mode
 * These tools enable the AI to interact with the file system and execute commands
 */

// JSON Schema type for tool parameters
export interface JSONSchema {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array'
  properties?: Record<string, JSONSchemaProperty>
  required?: string[]
}

export interface JSONSchemaProperty {
  type: string
  description?: string
  default?: unknown
  enum?: string[]
}

// Tool definition
export interface AgentTool {
  name: string
  description: string
  parameters: JSONSchema
  requiresApproval: boolean
  allowedCommands?: string[] // For run_command tool
}

// Tool call from the AI
export interface ToolCall {
  tool: string
  params: Record<string, unknown>
}

// Result of executing a tool
export interface ToolResult {
  success: boolean
  output?: string
  error?: string
}

// Pending approval state
export interface PendingApproval {
  id: string
  tool: string
  params: Record<string, unknown>
  preview?: string // For write_file, shows diff
  originalContent?: string // For diff comparison
}

// Tool execution history entry
export interface ToolExecution {
  id: string
  tool: string
  params: Record<string, unknown>
  result: ToolResult
  approved: boolean
  timestamp: Date
  duration?: number
}

// Agent session state
export interface AgentSession {
  id: string
  isRunning: boolean
  currentIteration: number
  maxIterations: number
  pendingApproval: PendingApproval | null
  toolHistory: ToolExecution[]
  filesRead: Set<string>
  filesWritten: Set<string>
  startTime?: Date
}

// AI response structure
export interface AgentResponse {
  message: string
  toolCalls?: ToolCall[]
  done?: boolean
}

/**
 * Available agent tools with their schemas
 */
export const AGENT_TOOLS: AgentTool[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path from workspace root'
        }
      },
      required: ['path']
    },
    requiresApproval: false
  },
  {
    name: 'write_file',
    description: 'Write content to a file (creates or overwrites)',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path from workspace root'
        },
        content: {
          type: 'string',
          description: 'The file content to write'
        }
      },
      required: ['path', 'content']
    },
    requiresApproval: true
  },
  {
    name: 'list_files',
    description: 'List files in a directory',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path relative to workspace root',
          default: '.'
        },
        recursive: {
          type: 'boolean',
          description: 'Whether to list recursively',
          default: false
        }
      }
    },
    requiresApproval: false
  },
  {
    name: 'search_files',
    description: 'Search for text pattern in files using regex',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Regex pattern to search for'
        },
        glob: {
          type: 'string',
          description: 'Glob pattern to filter files',
          default: '**/*'
        }
      },
      required: ['pattern']
    },
    requiresApproval: false
  },
  {
    name: 'run_command',
    description: 'Execute a shell command',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The command to execute'
        },
        cwd: {
          type: 'string',
          description: 'Working directory (relative to workspace)'
        }
      },
      required: ['command']
    },
    requiresApproval: true,
    allowedCommands: ['npm', 'node', 'npx', 'git', 'yarn', 'pnpm', 'tsc', 'eslint', 'prettier']
  },
  {
    name: 'ask_user',
    description: 'Ask the user a clarifying question',
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'The question to ask the user'
        }
      },
      required: ['question']
    },
    requiresApproval: false
  }
]

/**
 * Get tool definition by name
 */
export function getToolByName(name: string): AgentTool | undefined {
  return AGENT_TOOLS.find(tool => tool.name === name)
}

/**
 * Check if a tool requires user approval
 */
export function toolRequiresApproval(toolName: string): boolean {
  const tool = getToolByName(toolName)
  return tool?.requiresApproval ?? false
}

/**
 * Validate tool call parameters
 */
export function validateToolCall(toolCall: ToolCall): { valid: boolean; error?: string } {
  const tool = getToolByName(toolCall.tool)

  if (!tool) {
    return { valid: false, error: `Unknown tool: ${toolCall.tool}` }
  }

  // Check required parameters
  const required = tool.parameters.required || []
  for (const param of required) {
    if (!(param in toolCall.params)) {
      return { valid: false, error: `Missing required parameter: ${param}` }
    }
  }

  // Validate command whitelist for run_command
  if (toolCall.tool === 'run_command' && tool.allowedCommands) {
    const command = toolCall.params.command as string
    const firstWord = command.split(' ')[0]
    if (!tool.allowedCommands.includes(firstWord)) {
      return {
        valid: false,
        error: `Command '${firstWord}' not allowed. Allowed: ${tool.allowedCommands.join(', ')}`
      }
    }
  }

  return { valid: true }
}

/**
 * Validate path to prevent directory traversal
 */
export function validatePath(path: string): { valid: boolean; error?: string } {
  // Check for directory traversal
  if (path.includes('..') || path.startsWith('/') || path.startsWith('\\')) {
    return { valid: false, error: 'Path traversal not allowed' }
  }

  // Check for shell metacharacters
  const dangerousChars = ['|', '>', '<', '&', ';', '`', '$', '(', ')']
  for (const char of dangerousChars) {
    if (path.includes(char)) {
      return { valid: false, error: `Invalid character in path: ${char}` }
    }
  }

  return { valid: true }
}

/**
 * Create a new agent session
 */
export function createAgentSession(maxIterations: number = 25): AgentSession {
  return {
    id: `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    isRunning: false,
    currentIteration: 0,
    maxIterations,
    pendingApproval: null,
    toolHistory: [],
    filesRead: new Set(),
    filesWritten: new Set(),
    startTime: undefined
  }
}

/**
 * Parse AI response to extract message and tool calls
 */
export function parseAgentResponse(response: string): AgentResponse | null {
  try {
    // Try to parse as JSON
    const parsed = JSON.parse(response)

    // Validate structure
    if (typeof parsed.message !== 'string') {
      return null
    }

    return {
      message: parsed.message,
      toolCalls: Array.isArray(parsed.toolCalls) ? parsed.toolCalls : [],
      done: parsed.done === true
    }
  } catch {
    // Not valid JSON
    return null
  }
}

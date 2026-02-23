/**
 * Node Type Registry - Single source of truth for workflow node types (Frontend)
 *
 * All node type metadata (labels, descriptions, icons, colors, categories)
 * is defined here. Consumers import and derive what they need instead of
 * maintaining their own hardcoded lists.
 *
 * CLI counterpart: C:\git\github\Logikbug\prompd-cli\cli\npm\src\lib\nodeTypeRegistry.ts
 * Future: Consolidate both into a shared @prompd/shared package.
 *
 * When adding a new node type:
 *   1. Add it to WorkflowNodeType union in workflowTypes.ts
 *   2. Add an entry to NODE_TYPE_REGISTRY below
 *   3. Add createWorkflowNode() default data in workflowParser.ts
 *   4. Create the node component + properties panel in nodes/
 *   5. Register in nodes/index.ts NODE_TYPE_MAP
 *   6. Add execution logic in workflowExecutor.ts
 *   7. Add validation in workflowValidator.ts (if needed)
 *   8. Mirror in CLI nodeTypeRegistry.ts + workflowExecutor.ts
 */

import type { LucideIcon } from 'lucide-react'
import {
  Play, Flag, MessageSquare, Cpu, Bot, MessagesSquare, Server,
  ShieldCheck, Wrench, Terminal, Search, FileCode, Globe, Plug,
  ScanSearch, Route, GitBranch, Repeat, GitFork, Combine,
  Wand2, Database, TableProperties, UserCircle, Eye, AlertTriangle, Workflow,
  Group,
} from 'lucide-react'
import type { WorkflowNodeType } from './workflowTypes'

// ============================================================================
// Types
// ============================================================================

export interface NodeTypeEntry {
  type: WorkflowNodeType
  label: string
  description: string
  icon: LucideIcon
  color: string       // CSS variable e.g. 'var(--node-sky)'
  colorVar: string    // Short name for palette e.g. 'sky'
}

export interface NodeTypeCategory {
  key: string
  label: string
  paletteLabel: string  // May differ from context menu label
  types: WorkflowNodeType[]
}

// ============================================================================
// Registry
// ============================================================================

export const NODE_TYPE_REGISTRY: Record<WorkflowNodeType, NodeTypeEntry> = {
  // Entry & Exit
  'trigger': {
    type: 'trigger', label: 'Trigger', description: 'Workflow entry point',
    icon: Play, color: 'var(--node-sky)', colorVar: 'green',
  },
  'output': {
    type: 'output', label: 'Output', description: 'Workflow final output',
    icon: Flag, color: 'var(--node-emerald)', colorVar: 'green',
  },

  // AI & Prompts
  'prompt': {
    type: 'prompt', label: 'Prompt', description: 'Execute a .prmd file',
    icon: MessageSquare, color: 'var(--node-blue)', colorVar: 'purple',
  },
  'provider': {
    type: 'provider', label: 'Provider', description: 'LLM provider & model config',
    icon: Cpu, color: 'var(--node-green)', colorVar: 'rose',
  },
  'agent': {
    type: 'agent', label: 'AI Agent', description: 'Autonomous agent with tools',
    icon: Bot, color: 'var(--node-purple)', colorVar: 'indigo',
  },
  'chat-agent': {
    type: 'chat-agent', label: 'Chat Agent', description: 'Input + Guard + Agent + Tools',
    icon: MessagesSquare, color: 'var(--node-purple)', colorVar: 'indigo',
  },
  'claude-code': {
    type: 'claude-code', label: 'Claude Code', description: 'Claude Code agent (local/SSH)',
    icon: Server, color: 'var(--node-indigo)', colorVar: 'violet',
  },
  'guardrail': {
    type: 'guardrail', label: 'Guardrail', description: 'Validate input with pass/reject',
    icon: ShieldCheck, color: 'var(--node-pink)', colorVar: 'amber',
  },

  // Tools & Execution
  'tool': {
    type: 'tool', label: 'Tool', description: 'Unified tool execution',
    icon: Wrench, color: 'var(--node-yellow)', colorVar: 'orange',
  },
  'command': {
    type: 'command', label: 'Command', description: 'Execute shell commands',
    icon: Terminal, color: 'var(--node-teal)', colorVar: 'slate',
  },
  'web-search': {
    type: 'web-search', label: 'Web Search', description: 'Search the web',
    icon: Search, color: 'var(--node-sky)', colorVar: 'sky',
  },
  'code': {
    type: 'code', label: 'Code', description: 'Run TS/Python/C# snippets',
    icon: FileCode, color: 'var(--node-cyan)', colorVar: 'blue',
  },
  'api': {
    type: 'api', label: 'HTTP Request', description: 'Make REST API calls',
    icon: Globe, color: 'var(--node-green)', colorVar: 'blue',
  },
  'mcp-tool': {
    type: 'mcp-tool', label: 'MCP Tool', description: 'External MCP server tool',
    icon: Plug, color: 'var(--node-orange)', colorVar: 'cyan',
  },
  'database-query': {
    type: 'database-query', label: 'DB Query', description: 'Query a database connection',
    icon: TableProperties, color: 'var(--node-teal)', colorVar: 'teal',
  },
  // --- Add new tool/execution node types here ---

  // Tool Routing
  'tool-call-parser': {
    type: 'tool-call-parser', label: 'Tool Parser', description: 'Parse LLM tool call output',
    icon: ScanSearch, color: 'var(--node-yellow)', colorVar: 'cyan',
  },
  'tool-call-router': {
    type: 'tool-call-router', label: 'Tool Router', description: 'Route tool calls to handlers',
    icon: Route, color: 'var(--node-teal)', colorVar: 'teal',
  },

  // Control Flow
  'condition': {
    type: 'condition', label: 'Condition', description: 'Branch based on expression',
    icon: GitBranch, color: 'var(--node-amber)', colorVar: 'amber',
  },
  'loop': {
    type: 'loop', label: 'Loop', description: 'Iterate over items or count',
    icon: Repeat, color: 'var(--node-lime)', colorVar: 'cyan',
  },
  'parallel': {
    type: 'parallel', label: 'Parallel', description: 'Execute branches concurrently',
    icon: GitFork, color: 'var(--node-lime)', colorVar: 'indigo',
  },
  'merge': {
    type: 'merge', label: 'Merge', description: 'Combine parallel results',
    icon: Combine, color: 'var(--node-lime)', colorVar: 'emerald',
  },

  // Data
  'transformer': {
    type: 'transformer', label: 'Transform', description: 'Transform data with template',
    icon: Wand2, color: 'var(--node-cyan)', colorVar: 'orange',
  },
  'memory': {
    type: 'memory', label: 'Memory', description: 'KV store, conversation, or cache',
    icon: Database, color: 'var(--node-emerald)', colorVar: 'emerald',
  },

  // Interaction & Debug
  'user-input': {
    type: 'user-input', label: 'User Input', description: 'Pause for user input',
    icon: UserCircle, color: 'var(--node-sky)', colorVar: 'violet',
  },
  'callback': {
    type: 'callback', label: 'Checkpoint', description: 'Log, pause, approve, or notify',
    icon: Eye, color: 'var(--node-violet)', colorVar: 'amber',
  },
  'checkpoint': {
    type: 'checkpoint', label: 'Checkpoint', description: 'Log, pause, approve, or notify',
    icon: Eye, color: 'var(--node-violet)', colorVar: 'amber',
  },
  'error-handler': {
    type: 'error-handler', label: 'Error Handler', description: 'Configure error handling',
    icon: AlertTriangle, color: 'var(--node-red)', colorVar: 'rose',
  },

  // Composition
  'workflow': {
    type: 'workflow', label: 'Sub-Workflow', description: 'Invoke another .pdflow',
    icon: Workflow, color: 'var(--node-green)', colorVar: 'teal',
  },
  'node-group': {
    type: 'node-group', label: 'Group', description: 'Visual grouping for template export',
    icon: Group, color: 'var(--node-slate)', colorVar: 'slate',
  },
}

// ============================================================================
// Categories - defines grouping for palette and context menu
// ============================================================================

export const NODE_TYPE_CATEGORIES: NodeTypeCategory[] = [
  {
    key: 'entry-exit',
    label: 'Core',
    paletteLabel: 'Entry & Exit',
    types: ['trigger', 'output'],
  },
  {
    key: 'ai-prompts',
    label: 'AI & Agents',
    paletteLabel: 'AI & Prompts',
    types: ['prompt', 'provider', 'agent', 'chat-agent', 'claude-code', 'guardrail'],
  },
  {
    key: 'tools-execution',
    label: 'Tools & Execution',
    paletteLabel: 'Tools & Execution',
    types: ['tool', 'command', 'web-search', 'code', 'api', 'mcp-tool', 'database-query'],
  },
  {
    key: 'tool-routing',
    label: 'Tool Routing',
    paletteLabel: 'Tool Routing',
    types: ['tool-call-parser', 'tool-call-router'],
  },
  {
    key: 'control-flow',
    label: 'Control Flow',
    paletteLabel: 'Control Flow',
    types: ['condition', 'loop', 'parallel', 'merge'],
  },
  {
    key: 'data',
    label: 'Data & Transform',
    paletteLabel: 'Data',
    types: ['transformer', 'memory'],
  },
  {
    key: 'interaction',
    label: 'Interaction',
    paletteLabel: 'Interaction & Debug',
    types: ['user-input', 'callback', 'error-handler'],
  },
  {
    key: 'composition',
    label: 'Composition',
    paletteLabel: 'Composition',
    types: ['workflow', 'node-group'],
  },
]

// ============================================================================
// Derived helpers
// ============================================================================

/** All valid node type keys (for parser validation) */
export const ALL_NODE_TYPES: WorkflowNodeType[] = Object.keys(NODE_TYPE_REGISTRY) as WorkflowNodeType[]

/** All node types that appear in the palette (excludes aliases like 'checkpoint') */
export const PALETTE_NODE_TYPES: WorkflowNodeType[] = NODE_TYPE_CATEGORIES.flatMap(c => c.types)

/** Get a node type entry, returns undefined for unknown types */
export function getNodeTypeEntry(type: WorkflowNodeType): NodeTypeEntry | undefined {
  return NODE_TYPE_REGISTRY[type]
}

/** Get color for a node type, with fallback */
export function getNodeColor(type: WorkflowNodeType): string {
  return NODE_TYPE_REGISTRY[type]?.color || 'var(--node-slate)'
}

/** Get all entries for a category */
export function getCategoryEntries(categoryKey: string): NodeTypeEntry[] {
  const category = NODE_TYPE_CATEGORIES.find(c => c.key === categoryKey)
  if (!category) return []
  return category.types
    .map(t => NODE_TYPE_REGISTRY[t])
    .filter((e): e is NodeTypeEntry => !!e)
}

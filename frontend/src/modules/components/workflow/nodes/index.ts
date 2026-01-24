/**
 * Workflow Node Components - Export all custom node types
 */

export { TriggerNode } from './TriggerNode'
export { PromptNode } from './PromptNode'
export { ProviderNode } from './ProviderNode'
export { OutputNode } from './OutputNode'
export { ConditionNode } from './ConditionNode'
export { LoopNode } from './LoopNode'
export { ParallelNode } from './ParallelNode'
export { ParallelBroadcastNode } from './ParallelBroadcastNode'
export { ParallelForkNode } from './ParallelForkNode'
export { MergeNode } from './MergeNode'
export { CallbackNode } from './CallbackNode'
export { UserInputNode } from './UserInputNode'
export { ToolNode } from './ToolNode'
export { ToolCallParserNode } from './ToolCallParserNode'
export { ToolCallRouterNode } from './ToolCallRouterNode'
export { AgentNode } from './AgentNode'
export { ChatAgentNode } from './ChatAgentNode'
export { GuardrailNode } from './GuardrailNode'
export { ErrorHandlerNode } from './ErrorHandlerNode'
export { CommandNode } from './CommandNode'
export { CodeNode } from './CodeNode'
export { ClaudeCodeNode } from './ClaudeCodeNode'
export { WorkflowNode } from './WorkflowNode'
export { McpToolNode } from './McpToolNode'
export { TransformNode } from './TransformNode'
export { MemoryNode } from './MemoryNode'
export { ContainerNode, MetadataRow, CONTAINER_MIN_WIDTH, CONTAINER_MIN_HEIGHT, COLLAPSED_WIDTH } from './ContainerNode'

import { TriggerNode } from './TriggerNode'
import { PromptNode } from './PromptNode'
import { ProviderNode } from './ProviderNode'
import { OutputNode } from './OutputNode'
import { ConditionNode } from './ConditionNode'
import { LoopNode } from './LoopNode'
import { ParallelNode } from './ParallelNode'
import { MergeNode } from './MergeNode'
import { CallbackNode } from './CallbackNode'
import { UserInputNode } from './UserInputNode'
import { ToolNode } from './ToolNode'
import { ToolCallParserNode } from './ToolCallParserNode'
import { ToolCallRouterNode } from './ToolCallRouterNode'
import { AgentNode } from './AgentNode'
import { ChatAgentNode } from './ChatAgentNode'
import { GuardrailNode } from './GuardrailNode'
import { ErrorHandlerNode } from './ErrorHandlerNode'
import { CommandNode } from './CommandNode'
import { CodeNode } from './CodeNode'
import { ClaudeCodeNode } from './ClaudeCodeNode'
import { WorkflowNode } from './WorkflowNode'
import { McpToolNode } from './McpToolNode'
import { TransformNode } from './TransformNode'
import { MemoryNode } from './MemoryNode'

/**
 * Node types registry for React Flow
 */
export const nodeTypes = {
  trigger: TriggerNode,
  prompt: PromptNode,
  provider: ProviderNode,
  output: OutputNode,
  condition: ConditionNode,
  loop: LoopNode,
  parallel: ParallelNode,
  merge: MergeNode,
  callback: CallbackNode,
  checkpoint: CallbackNode, // Alias for callback (legacy compatibility)
  'user-input': UserInputNode,
  tool: ToolNode,
  'tool-call-parser': ToolCallParserNode,
  'tool-call-router': ToolCallRouterNode,
  agent: AgentNode,
  'chat-agent': ChatAgentNode,
  guardrail: GuardrailNode,
  'error-handler': ErrorHandlerNode,
  // Phase E: Advanced Nodes
  command: CommandNode,
  code: CodeNode,
  'claude-code': ClaudeCodeNode,
  workflow: WorkflowNode,
  'mcp-tool': McpToolNode,
  transformer: TransformNode,
  memory: MemoryNode,
  // Placeholder mappings (reuse existing nodes until dedicated ones are created)
  api: ToolNode, // HTTP API node uses Tool with http type
}

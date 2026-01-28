/**
 * Workflow Node Components - Export all custom node types
 *
 * All nodes are wrapped with NodeErrorBoundary for crash protection.
 */

import { ComponentType, createElement } from 'react'
import type { NodeProps } from '@xyflow/react'
import { NodeErrorBoundary } from '../NodeErrorBoundary'
import type { BaseNodeData } from '../../../services/workflowTypes'

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
 * Wraps a node component with error boundary for crash protection
 * Using permissive types since node components are already properly typed
 */
function withErrorBoundary(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Component: ComponentType<any>,
  nodeType: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): ComponentType<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function WrappedNode(props: any) {
    return createElement(
      NodeErrorBoundary,
      {
        nodeId: props.id,
        nodeType,
        children: createElement(Component, props),
      }
    )
  }
}

/**
 * Node types registry for React Flow
 * All nodes are wrapped with error boundaries for crash protection
 */
export const nodeTypes = {
  trigger: withErrorBoundary(TriggerNode, 'trigger'),
  prompt: withErrorBoundary(PromptNode, 'prompt'),
  provider: withErrorBoundary(ProviderNode, 'provider'),
  output: withErrorBoundary(OutputNode, 'output'),
  condition: withErrorBoundary(ConditionNode, 'condition'),
  loop: withErrorBoundary(LoopNode, 'loop'),
  parallel: withErrorBoundary(ParallelNode, 'parallel'),
  merge: withErrorBoundary(MergeNode, 'merge'),
  callback: withErrorBoundary(CallbackNode, 'callback'),
  checkpoint: withErrorBoundary(CallbackNode, 'checkpoint'), // Alias for callback (legacy compatibility)
  'user-input': withErrorBoundary(UserInputNode, 'user-input'),
  tool: withErrorBoundary(ToolNode, 'tool'),
  'tool-call-parser': withErrorBoundary(ToolCallParserNode, 'tool-call-parser'),
  'tool-call-router': withErrorBoundary(ToolCallRouterNode, 'tool-call-router'),
  agent: withErrorBoundary(AgentNode, 'agent'),
  'chat-agent': withErrorBoundary(ChatAgentNode, 'chat-agent'),
  guardrail: withErrorBoundary(GuardrailNode, 'guardrail'),
  'error-handler': withErrorBoundary(ErrorHandlerNode, 'error-handler'),
  // Phase E: Advanced Nodes
  command: withErrorBoundary(CommandNode, 'command'),
  code: withErrorBoundary(CodeNode, 'code'),
  'claude-code': withErrorBoundary(ClaudeCodeNode, 'claude-code'),
  workflow: withErrorBoundary(WorkflowNode, 'workflow'),
  'mcp-tool': withErrorBoundary(McpToolNode, 'mcp-tool'),
  transformer: withErrorBoundary(TransformNode, 'transformer'),
  memory: withErrorBoundary(MemoryNode, 'memory'),
  // Placeholder mappings (reuse existing nodes until dedicated ones are created)
  api: withErrorBoundary(ToolNode, 'api'), // HTTP API node uses Tool with http type
}

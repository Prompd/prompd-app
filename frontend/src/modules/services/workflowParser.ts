/**
 * Workflow Parser - Parse and validate .pdflow JSON files
 * Converts between .pdflow format and React Flow format
 *
 * This is a frontend-specific implementation that works in browser contexts.
 * For Node.js contexts (CLI, service mode), use @prompd/cli's workflowParser instead.
 *
 * Note: This file contains a complete implementation to avoid bundling Node.js
 * dependencies. The logic is kept in sync with the CLI version.
 */

import type { Node, Edge } from '@xyflow/react'
import type {
  WorkflowFile,
  WorkflowNode,
  WorkflowEdge,
  WorkflowValidationError,
  WorkflowValidationWarning,
  WorkflowNodeType,
  BaseNodeData,
} from './workflowTypes'
import { validateWorkflow } from './workflowValidator'

// Use simple React Flow types for parser output
type WorkflowCanvasNode = Node<BaseNodeData>
type WorkflowCanvasEdge = Edge

export interface ParsedWorkflow {
  file: WorkflowFile
  nodes: WorkflowCanvasNode[]
  edges: WorkflowCanvasEdge[]
  errors: WorkflowValidationError[]
  warnings: WorkflowValidationWarning[]
}

// Valid node types
const VALID_NODE_TYPES: WorkflowNodeType[] = [
  'trigger',
  'prompt',
  'provider',
  'condition',
  'loop',
  'parallel',
  'merge',
  'transformer',
  'api',
  'tool',
  'tool-call-parser',
  'tool-call-router',
  'agent',
  'chat-agent',   // Composite chat agent with guardrail
  'guardrail',    // Input validation node
  'callback',
  'checkpoint',   // Alias for callback
  'user-input',
  'error-handler',
  'command',      // Phase E: Shell command execution
  'code',         // Phase E: Custom code execution
  'claude-code',  // Phase E: Claude Code agent with SSH
  'workflow',     // Phase E: Sub-workflow invocation
  'mcp-tool',     // Phase E: External MCP tool execution
  'memory',       // Memory/storage operations
  'output',
]

// Internal handles that indicate container-internal edges
const INTERNAL_HANDLES = ['loop-start', 'loop-end', 'parallel-start', 'parallel-end']

/**
 * Determine if an edge should be animated based on its source handle
 * Animated edges: internal container edges and condition branch edges
 * Static edges: regular output → input edges between nodes
 */
function shouldEdgeBeAnimated(sourceHandle: string | null | undefined): boolean {
  if (!sourceHandle) return false
  // Internal container edges
  if (INTERNAL_HANDLES.includes(sourceHandle)) return true
  // Condition branch edges (condition-* or default)
  if (sourceHandle.startsWith('condition-') || sourceHandle === 'default') return true
  // Regular output edges are not animated
  return false
}

/**
 * Parse a .pdflow JSON string into a ParsedWorkflow
 */
export function parseWorkflow(json: string): ParsedWorkflow {
  const errors: WorkflowValidationError[] = []
  const warnings: WorkflowValidationWarning[] = []

  let file: WorkflowFile

  // Parse JSON
  try {
    file = JSON.parse(json)
  } catch (e) {
    return {
      file: createEmptyWorkflow(),
      nodes: [],
      edges: [],
      errors: [{
        message: `Invalid JSON: ${e instanceof Error ? e.message : 'Parse error'}`,
        code: 'INVALID_JSON',
      }],
      warnings: [],
    }
  }

  // Validate structure
  validateWorkflowStructure(file, errors, warnings)

  // Convert nodes to React Flow format (edges are already in standard format)
  const nodes = convertNodesToReactFlow(file.nodes || [], errors)
  const edges = normalizeEdges(file.edges || [], errors)

  // Validate data flow
  validateDataFlow(file, errors, warnings)

  // Run comprehensive validation (includes node-specific checks like empty containers)
  const validationResult = validateWorkflow(file)
  errors.push(...validationResult.errors)
  warnings.push(...validationResult.warnings)

  return {
    file,
    nodes,
    edges,
    errors,
    warnings,
  }
}

/**
 * Serialize a workflow back to JSON string
 */
export function serializeWorkflow(
  file: WorkflowFile,
  nodes: WorkflowCanvasNode[],
  edges: WorkflowCanvasEdge[]
): string {
  // Update node positions, data, and container properties from React Flow
  const updatedNodes: WorkflowNode[] = file.nodes.map(node => {
    const rfNode = nodes.find(n => n.id === node.id)
    if (rfNode) {
      const nodeData = rfNode.data as BaseNodeData

      // For docked nodes, use the saved pre-dock position instead of the off-canvas position
      let position = rfNode.position
      if (nodeData.dockedTo && nodeData._preDockPosition) {
        position = nodeData._preDockPosition
      }

      const updated: WorkflowNode = {
        ...node,
        position,
        // Sync node data from React Flow (includes _savedWidth, _savedHeight, collapsed, etc.)
        data: nodeData as WorkflowNode['data'],
      }

      // Sync container relationship properties
      if (rfNode.parentId) {
        updated.parentId = rfNode.parentId
        updated.extent = (rfNode.extent as 'parent' | undefined) || 'parent'
      } else {
        // Remove parentId if node was removed from container
        delete updated.parentId
        delete updated.extent
      }

      // Sync container dimensions - skip for docked nodes (they have 0 dimensions)
      if (rfNode.width && !nodeData.dockedTo) {
        updated.width = rfNode.width
      } else if (nodeData.dockedTo && nodeData._preDockWidth) {
        // For docked nodes, restore saved dimensions
        updated.width = nodeData._preDockWidth
      }
      if (rfNode.height && !nodeData.dockedTo) {
        updated.height = rfNode.height
      } else if (nodeData.dockedTo && nodeData._preDockHeight) {
        // For docked nodes, restore saved dimensions
        updated.height = nodeData._preDockHeight
      }

      return updated
    }
    return node
  })

  // Edges are already in React Flow standard format - just map directly
  const workflowEdges: WorkflowEdge[] = edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? undefined,
    targetHandle: edge.targetHandle ?? undefined,
    animated: edge.animated,
    label: typeof edge.label === 'string' ? edge.label : undefined,
  }))

  const updatedFile: WorkflowFile = {
    ...file,
    nodes: updatedNodes,
    edges: workflowEdges,
  }

  return JSON.stringify(updatedFile, null, 2)
}

/**
 * Create an empty workflow file
 */
export function createEmptyWorkflow(): WorkflowFile {
  return {
    version: '1.0',
    metadata: {
      id: `workflow-${Date.now()}`,
      name: 'New Workflow',
      description: '',
    },
    parameters: [],
    nodes: [],
    edges: [],
  }
}

/**
 * Create a new workflow node
 *
 * IMPORTANT: When adding a new node type, you MUST update THREE places:
 * 1. This switch statement (createWorkflowNode) - add a case with default data
 * 2. getDefaultLabel() below - add the default label for the node type
 * 3. nodes/index.ts - add the component to nodeTypes registry
 *
 * If you only add to nodes/index.ts without adding a case here, the node
 * will render as "UNKNOWN: <type>" because createWorkflowNode falls back
 * to a generic tool node for unhandled types.
 */
export function createWorkflowNode(
  type: WorkflowNodeType,
  position: { x: number; y: number },
  id?: string
): WorkflowNode {
  const nodeId = id || `${type}-${Date.now()}`

  const baseData = {
    label: getDefaultLabel(type),
  }

  switch (type) {
    case 'trigger':
      return {
        id: nodeId,
        type,
        position,
        data: {
          ...baseData,
          triggerType: 'manual',
        },
      }
    case 'prompt':
      return {
        id: nodeId,
        type,
        position,
        data: {
          ...baseData,
          source: '',
          provider: 'openai',
          model: 'gpt-4o',
          parameters: {},
        },
      }
    case 'provider':
      return {
        id: nodeId,
        type,
        position,
        data: {
          ...baseData,
          providerId: 'openai',
          model: 'gpt-4o',
        },
      }
    case 'condition':
      return {
        id: nodeId,
        type,
        position,
        data: {
          ...baseData,
          conditions: [],
          default: undefined,
        },
      }
    case 'loop':
      return {
        id: nodeId,
        type,
        position,
        width: 300,
        height: 200,
        data: {
          ...baseData,
          loopType: 'while',
          condition: '',
          maxIterations: 10,
          body: [],
        },
      }
    case 'parallel':
      return {
        id: nodeId,
        type,
        position,
        width: 350,
        height: 200,
        data: {
          ...baseData,
          mode: 'broadcast',
          forkCount: 2,
          branches: [],
          waitFor: 'all',
          mergeStrategy: 'object',
        },
      }
    case 'merge':
      return {
        id: nodeId,
        type,
        position,
        data: {
          ...baseData,
          inputs: [],
          mergeAs: 'object',
        },
      }
    case 'api':
      return {
        id: nodeId,
        type,
        position,
        data: {
          ...baseData,
          method: 'GET',
          url: '',
        },
      }
    case 'callback':
    case 'checkpoint':
      return {
        id: nodeId,
        type: 'callback',
        position,
        data: {
          ...baseData,
          mode: 'report',
          checkpointName: '',
          includePreviousOutput: true,
          includeNextNodeInfo: true,
          waitForAck: false,
        },
      }
    case 'user-input':
      return {
        id: nodeId,
        type,
        position,
        data: {
          ...baseData,
          prompt: 'Enter your input:',
          inputType: 'text',
          required: true,
          showContext: true,
        },
      }
    case 'tool':
      return {
        id: nodeId,
        type,
        position,
        data: {
          ...baseData,
          toolType: 'function',
          toolName: '',
          parameters: {},
        },
      }
    case 'tool-call-parser':
      return {
        id: nodeId,
        type,
        position,
        data: {
          ...baseData,
          format: 'auto',
          noToolCallBehavior: 'passthrough',
          allowedTools: [],
        },
      }
    case 'agent':
      return {
        id: nodeId,
        type,
        position,
        data: {
          ...baseData,
          systemPrompt: 'You are a helpful AI assistant with access to tools. Use the available tools to complete the user\'s request.',
          userPrompt: '{{ input }}',
          tools: [],
          maxIterations: 10,
          toolCallFormat: 'auto',
          outputMode: 'final-response',
          includeHistory: true,
        },
      }
    case 'chat-agent':
      return {
        id: nodeId,
        type,
        position,
        width: 400,
        height: 320,
        data: {
          ...baseData,
          // Agent configuration
          agentSystemPrompt: 'You are a helpful AI assistant.',
          agentUserPrompt: '{{ input }}',
          maxIterations: 10,
          toolCallFormat: 'auto',
          outputMode: 'final-response',
          // Guardrail configuration (disabled by default)
          guardrailEnabled: false,
          // User input configuration (enabled by default)
          userInputEnabled: true,
          userInputPrompt: 'Enter your message:',
          userInputType: 'textarea',
          // Container state
          collapsed: true,
          // Saved dimensions for when expanded
          _savedWidth: 400,
          _savedHeight: 320,
          tools: [],
        },
      }
    case 'guardrail':
      return {
        id: nodeId,
        type,
        position,
        data: {
          ...baseData,
          systemPrompt: 'Validate the input. Respond with "PASS" if the input is appropriate and safe, or "REJECT" with a reason if it violates guidelines.',
          scoreThreshold: 0.5,
        },
      }
    case 'tool-call-router':
      return {
        id: nodeId,
        type,
        position,
        width: 320,
        height: 180,
        data: {
          ...baseData,
          routingMode: 'name-match',
          onNoMatch: 'error',
          collapsed: false,
        },
      }
    case 'error-handler':
      return {
        id: nodeId,
        type,
        position,
        data: {
          ...baseData,
          strategy: 'retry',
          retry: {
            maxAttempts: 3,
            backoffMs: 1000,
            backoffMultiplier: 2,
          },
        },
      }
    case 'output':
      return {
        id: nodeId,
        type,
        position,
        data: {
          ...baseData,
        },
      }
    case 'command':
      return {
        id: nodeId,
        type,
        position,
        data: {
          ...baseData,
          command: '',
          args: [],
          cwd: '',
          env: {},
          timeoutMs: 30000,
          outputFormat: 'text',
          requiresApproval: true,
        },
      }
    case 'claude-code':
      return {
        id: nodeId,
        type,
        position,
        data: {
          ...baseData,
          connection: {
            type: 'local',
          },
          task: {
            prompt: '',
            workingDirectory: '',
          },
          constraints: {
            maxTurns: 50,
            allowedTools: ['read', 'write', 'execute', 'web'],
            requireApprovalForWrites: false,
          },
          output: {
            format: 'final-response',
            includeMetadata: false,
          },
        },
      }
    case 'workflow':
      return {
        id: nodeId,
        type,
        position,
        data: {
          ...baseData,
          source: '',
          parameters: {},
          outputMapping: {},
          inheritVariables: false,
        },
      }
    case 'mcp-tool':
      return {
        id: nodeId,
        type,
        position,
        data: {
          ...baseData,
          toolName: '',
          parameters: {},
          timeoutMs: 30000,
          includeInContext: false,
        },
      }
    case 'code':
      return {
        id: nodeId,
        type,
        position,
        data: {
          ...baseData,
          language: 'typescript',
          code: '',
          inputVariable: 'input',
          executionContext: 'isolated',
        },
      }
    case 'transformer':
      return {
        id: nodeId,
        type,
        position,
        data: {
          ...baseData,
          mode: 'template',
          template: '',
          inputVariable: 'input',
          passthroughOnError: false,
        },
      }
    case 'memory':
      return {
        id: nodeId,
        type,
        position,
        data: {
          ...baseData,
          mode: 'kv',
          operations: ['get'],  // Multi-action array (replaces single 'operation')
          scope: 'execution',
        },
      }
    default:
      // IMPORTANT: If you see this error, add a new case to createWorkflowNode() in workflowParser.ts
      // This fallback should NEVER be hit in production - all node types must have explicit cases
      console.error(
        `[createWorkflowNode] MISSING CASE for node type: "${type}". ` +
        `Add a case for '${type}' in workflowParser.ts createWorkflowNode() switch statement!`
      )
      // Return a generic tool node as fallback (more visible than callback)
      return {
        id: nodeId,
        type: 'tool' as const,
        position,
        data: {
          ...baseData,
          label: `UNKNOWN: ${type}`, // Make it obvious this is a fallback
          toolType: 'function',
          toolName: '',
          parameters: {},
        },
      }
  }
}

/**
 * Get default label for a node type
 */
function getDefaultLabel(type: WorkflowNodeType): string {
  const labels: Record<WorkflowNodeType, string> = {
    trigger: 'Start',
    prompt: 'Prompt',
    provider: 'Provider',
    condition: 'Condition',
    loop: 'Loop',
    parallel: 'Parallel',
    merge: 'Merge',
    transformer: 'Transform',
    api: 'API Call',
    tool: 'Tool',
    'tool-call-parser': 'Tool Parser',
    'tool-call-router': 'Tool Router',
    agent: 'AI Agent',
    'chat-agent': 'Chat Agent',
    guardrail: 'Guardrail',
    callback: 'Checkpoint',
    checkpoint: 'Checkpoint',  // Alias for callback
    'user-input': 'User Input',
    'error-handler': 'Error Handler',
    command: 'Command',
    code: 'Code',
    'claude-code': 'Claude Code',
    workflow: 'Sub-Workflow',
    'mcp-tool': 'MCP Tool',
    memory: 'Memory',
    output: 'Output',
  }
  return labels[type] || 'Node'
}

// ============================================================================
// Validation Functions
// ============================================================================

function validateWorkflowStructure(
  file: WorkflowFile,
  errors: WorkflowValidationError[],
  warnings: WorkflowValidationWarning[]
): void {
  // Version check
  if (!file.version) {
    warnings.push({
      message: 'Missing version field, defaulting to 1.0',
      code: 'MISSING_VERSION',
    })
  }

  // Metadata check
  if (!file.metadata) {
    errors.push({
      message: 'Missing metadata section',
      code: 'MISSING_METADATA',
    })
  } else {
    if (!file.metadata.id) {
      errors.push({
        field: 'metadata.id',
        message: 'Missing workflow ID',
        code: 'MISSING_ID',
      })
    }
    if (!file.metadata.name) {
      warnings.push({
        message: 'Missing workflow name',
        code: 'MISSING_NAME',
      })
    }
  }

  // Nodes check
  if (!file.nodes || !Array.isArray(file.nodes)) {
    errors.push({
      message: 'Missing or invalid nodes array',
      code: 'INVALID_NODES',
    })
  } else {
    // Check for duplicate IDs
    const nodeIds = new Set<string>()
    for (const node of file.nodes) {
      if (nodeIds.has(node.id)) {
        errors.push({
          nodeId: node.id,
          message: `Duplicate node ID: ${node.id}`,
          code: 'DUPLICATE_NODE_ID',
        })
      }
      nodeIds.add(node.id)

      // Validate node type
      if (!VALID_NODE_TYPES.includes(node.type)) {
        errors.push({
          nodeId: node.id,
          message: `Invalid node type: ${node.type}`,
          code: 'INVALID_NODE_TYPE',
        })
      }

      // Validate position
      if (!node.position || typeof node.position.x !== 'number' || typeof node.position.y !== 'number') {
        errors.push({
          nodeId: node.id,
          message: 'Invalid or missing position',
          code: 'INVALID_POSITION',
        })
      }

      // Validate node-specific data
      validateNodeData(node, errors, warnings)
    }
  }

  // Edges check
  if (file.edges && !Array.isArray(file.edges)) {
    errors.push({
      message: 'Invalid edges array',
      code: 'INVALID_EDGES',
    })
  }
}

function validateNodeData(
  node: WorkflowNode,
  errors: WorkflowValidationError[],
  warnings: WorkflowValidationWarning[]
): void {
  if (!node.data) {
    errors.push({
      nodeId: node.id,
      message: 'Missing node data',
      code: 'MISSING_NODE_DATA',
    })
    return
  }

  switch (node.type) {
    case 'prompt':
      if (!('source' in node.data)) {
        errors.push({
          nodeId: node.id,
          field: 'source',
          message: 'Prompt node missing source',
          code: 'MISSING_PROMPT_SOURCE',
        })
      }
      break

    case 'condition':
      if (!('conditions' in node.data) || !Array.isArray(node.data.conditions)) {
        errors.push({
          nodeId: node.id,
          field: 'conditions',
          message: 'Condition node missing conditions array',
          code: 'MISSING_CONDITIONS',
        })
      }
      break

    case 'loop':
      if (!('loopType' in node.data)) {
        errors.push({
          nodeId: node.id,
          field: 'loopType',
          message: 'Loop node missing loopType',
          code: 'MISSING_LOOP_TYPE',
        })
      }
      if (!('maxIterations' in node.data) || typeof node.data.maxIterations !== 'number') {
        warnings.push({
          nodeId: node.id,
          message: 'Loop node missing maxIterations, defaulting to 10',
          code: 'MISSING_MAX_ITERATIONS',
        })
      }
      break

    case 'parallel':
      if (!('branches' in node.data) || !Array.isArray(node.data.branches)) {
        errors.push({
          nodeId: node.id,
          field: 'branches',
          message: 'Parallel node missing branches array',
          code: 'MISSING_BRANCHES',
        })
      }
      break

    case 'api':
      if (!('url' in node.data) || !node.data.url) {
        errors.push({
          nodeId: node.id,
          field: 'url',
          message: 'API node missing URL',
          code: 'MISSING_API_URL',
        })
      }
      if (!('method' in node.data)) {
        warnings.push({
          nodeId: node.id,
          message: 'API node missing method, defaulting to GET',
          code: 'MISSING_API_METHOD',
        })
      }
      break
  }
}

function validateDataFlow(
  file: WorkflowFile,
  errors: WorkflowValidationError[],
  warnings: WorkflowValidationWarning[]
): void {
  if (!file.nodes || !file.edges) return

  const nodeIds = new Set(file.nodes.map(n => n.id))

  // Check edge references
  for (const edge of file.edges) {
    if (!nodeIds.has(edge.source)) {
      errors.push({
        connectionId: edge.id,
        message: `Edge references non-existent source node: ${edge.source}`,
        code: 'INVALID_SOURCE_NODE',
      })
    }
    if (!nodeIds.has(edge.target)) {
      errors.push({
        connectionId: edge.id,
        message: `Edge references non-existent target node: ${edge.target}`,
        code: 'INVALID_TARGET_NODE',
      })
    }
  }

  // Check for cycles (basic detection)
  const hasCycle = detectCycles(file.nodes, file.edges)
  if (hasCycle) {
    errors.push({
      message: 'Workflow contains cycles which may cause infinite loops',
      code: 'CYCLE_DETECTED',
    })
  }

  // Check for unreachable nodes
  const connectedNodes = new Set<string>()
  for (const edge of file.edges) {
    connectedNodes.add(edge.source)
    connectedNodes.add(edge.target)
  }

  for (const node of file.nodes) {
    if (!connectedNodes.has(node.id) && file.nodes.length > 1) {
      warnings.push({
        nodeId: node.id,
        message: `Node "${node.data.label || node.id}" is not connected to any other nodes`,
        code: 'UNREACHABLE_NODE',
      })
    }
  }
}

/**
 * Check if an edge is an internal container edge (loop or parallel internal wiring)
 * or a feedback edge (tool results back to agent)
 * These edges are intentional and should not be considered for cycle detection
 */
function isInternalContainerEdge(edge: WorkflowEdge): boolean {
  const internalHandles = [
    'loop-start',
    'loop-end',
    'parallel-start',
    'parallel-end',
  ]

  // Check for internal loop/parallel handles
  if (edge.sourceHandle && internalHandles.includes(edge.sourceHandle)) {
    return true
  }
  if (edge.targetHandle && internalHandles.includes(edge.targetHandle)) {
    return true
  }

  // Check for fork handles (fork-0, fork-1, etc.)
  if (edge.sourceHandle && edge.sourceHandle.startsWith('fork-')) {
    return true
  }
  if (edge.targetHandle && edge.targetHandle.startsWith('fork-')) {
    return true
  }

  // Check for Agent <-> ToolCallRouter feedback edges
  // toolResult edges go from ToolCallRouter back to Agent - this is intentional feedback
  if (edge.sourceHandle === 'toolResult' && edge.targetHandle === 'toolResult') {
    return true
  }

  // onCheckpoint edges are event streams, not data flow cycles
  if (edge.sourceHandle === 'onCheckpoint') {
    return true
  }

  return false
}

/**
 * Simple cycle detection using DFS
 * Excludes internal container edges (loop/parallel internal wiring) from cycle detection
 */
function detectCycles(nodes: WorkflowNode[], edges: WorkflowEdge[]): boolean {
  const adjacencyList = new Map<string, string[]>()

  // Build adjacency list, excluding internal container edges
  for (const node of nodes) {
    adjacencyList.set(node.id, [])
  }
  for (const edge of edges) {
    // Skip internal loop/parallel edges - these are intentional back-edges
    if (isInternalContainerEdge(edge)) {
      continue
    }

    const targets = adjacencyList.get(edge.source) || []
    targets.push(edge.target)
    adjacencyList.set(edge.source, targets)
  }

  const visited = new Set<string>()
  const recursionStack = new Set<string>()

  function dfs(nodeId: string): boolean {
    visited.add(nodeId)
    recursionStack.add(nodeId)

    const neighbors = adjacencyList.get(nodeId) || []
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true
      } else if (recursionStack.has(neighbor)) {
        return true // Cycle found
      }
    }

    recursionStack.delete(nodeId)
    return false
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      if (dfs(node.id)) return true
    }
  }

  return false
}

// ============================================================================
// Conversion Functions
// ============================================================================

function convertNodesToReactFlow(
  nodes: WorkflowNode[],
  errors: WorkflowValidationError[]
): WorkflowCanvasNode[] {
  // Convert nodes to React Flow format
  const rfNodes = nodes.map(node => {
    // Migration: Convert old MemoryNode 'operation' (single) to 'operations' (array)
    if (node.type === 'memory') {
      const memData = node.data as { operation?: string; operations?: string[] }
      if (memData.operation && !memData.operations) {
        memData.operations = [memData.operation]
        delete memData.operation
      }
    }

    const nodeData = node.data as BaseNodeData

    const rfNode: WorkflowCanvasNode = {
      id: node.id,
      type: node.type,
      position: node.position || { x: 0, y: 0 },
      data: nodeData,
    }

    // Handle docked nodes - restore hidden state and minimal dimensions
    if (nodeData.dockedTo) {
      rfNode.hidden = true
      rfNode.width = 0
      rfNode.height = 0
      rfNode.position = { x: -9999, y: -9999 }
    }

    // Preserve container relationship properties
    if (node.parentId) {
      rfNode.parentId = node.parentId
      // Only use 'parent' extent for child nodes (React Flow's CoordinateExtent has different format)
      rfNode.extent = 'parent'
    }

    // Preserve container dimensions (for loop/parallel nodes) - skip for docked nodes
    if (node.width && !nodeData.dockedTo) {
      rfNode.width = node.width
    }
    if (node.height && !nodeData.dockedTo) {
      rfNode.height = node.height
    }

    return rfNode
  })

  // CRITICAL: React Flow requires parent nodes to appear BEFORE their children in the array
  // Sort so that nodes without parentId come first, then children follow their parents
  return sortNodesForReactFlow(rfNodes)
}

/**
 * Sort nodes so parent nodes appear before their children.
 * React Flow requires this ordering for proper parent-child rendering.
 */
function sortNodesForReactFlow(nodes: WorkflowCanvasNode[]): WorkflowCanvasNode[] {
  // Build a map of node ID to node for quick lookup
  const nodeMap = new Map<string, WorkflowCanvasNode>()
  for (const node of nodes) {
    nodeMap.set(node.id, node)
  }

  // Separate root nodes (no parent) from child nodes
  const rootNodes: WorkflowCanvasNode[] = []
  const childNodes: WorkflowCanvasNode[] = []

  for (const node of nodes) {
    if (node.parentId) {
      childNodes.push(node)
    } else {
      rootNodes.push(node)
    }
  }

  // Result array - start with root nodes
  const result: WorkflowCanvasNode[] = [...rootNodes]

  // Add child nodes after their parents
  // We need to handle nested containers, so we iterate until all children are placed
  const remaining = [...childNodes]
  const placedIds = new Set(rootNodes.map(n => n.id))

  // Safety limit to prevent infinite loops
  let iterations = 0
  const maxIterations = remaining.length * 2

  while (remaining.length > 0 && iterations < maxIterations) {
    iterations++
    for (let i = remaining.length - 1; i >= 0; i--) {
      const child = remaining[i]
      // If parent is already placed, we can place this child
      if (child.parentId && placedIds.has(child.parentId)) {
        result.push(child)
        placedIds.add(child.id)
        remaining.splice(i, 1)
      }
    }
  }

  // If any nodes couldn't be placed (orphaned children with missing parents), add them at the end
  if (remaining.length > 0) {
    console.warn('[workflowParser] Some nodes have missing parent references:', remaining.map(n => n.id))
    result.push(...remaining)
  }

  return result
}

/**
 * Normalize edges - already in React Flow format, just ensure defaults
 * Applies consistent animation rules: internal container edges and condition
 * branch edges are animated, regular output edges are not
 */
function normalizeEdges(
  edges: WorkflowEdge[],
  errors: WorkflowValidationError[]
): WorkflowCanvasEdge[] {
  return edges.map(edge => {
    const sourceHandle = edge.sourceHandle || 'output'
    const targetHandle = edge.targetHandle || 'input'
    // Use explicit animated value if provided, otherwise determine from handles
    const animated = edge.animated ?? (
      shouldEdgeBeAnimated(sourceHandle) || shouldEdgeBeAnimated(targetHandle)
    )
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle,
      targetHandle,
      animated,
      label: edge.label,
    }
  })
}

/**
 * Check if an edge is used for the main execution flow (should be included in topological sort)
 * Excludes internal container edges that would create back-edges (loop-end, parallel-end)
 * Excludes event-based edges that are triggered by events, not data flow (onError, onCheckpoint, onProgress)
 */
function isExecutionFlowEdge(edge: { sourceHandle?: string; targetHandle?: string }): boolean {
  // Exclude back-edges that go TO container start handles (these create cycles)
  // loop-end -> container and parallel-end -> container edges should not count for topological ordering
  if (edge.sourceHandle === 'loop-end' || edge.sourceHandle === 'parallel-end') {
    return false
  }

  // Exclude edges targeting internal handles (fork handles for parallel nodes)
  if (edge.targetHandle && edge.targetHandle.startsWith('fork-')) {
    return false
  }

  // Exclude event-based edges - these are triggered by events, not main data flow
  // They should NOT be included in topological sort for execution order
  // - onError: triggered when an error occurs in a node using this error handler
  // - onCheckpoint: triggered when agent emits checkpoint events
  // - onProgress: triggered when a node emits progress events (e.g., ClaudeCode)
  // - toolResult: triggered when a tool returns a result to an agent
  const eventBasedHandles = ['onError', 'onCheckpoint', 'onProgress', 'toolResult']
  if (edge.sourceHandle && eventBasedHandles.includes(edge.sourceHandle)) {
    return false
  }

  // Include all other edges:
  // - Regular output -> input edges
  // - Condition branch edges (condition-* or default)
  // - Internal start edges (loop-start, parallel-start) - these are entry points, should flow to children
  return true
}

/**
 * Build execution order using topological sort
 *
 * Important: Child nodes (nodes with parentId) are EXCLUDED from the main execution order.
 * They are executed by their parent container node (loop, parallel), not by the main executor.
 *
 * Excludes:
 * - Internal back-edges that would create cycles (e.g., loop-end -> container)
 * - Child nodes that belong to container nodes (they have parentId set)
 */
export function getExecutionOrder(workflow: ParsedWorkflow): string[] {
  const { file } = workflow
  if (!file.nodes || !file.edges) return []

  // Identify child nodes (nodes that have a parentId - they belong to containers)
  const childNodeIds = new Set<string>()
  for (const node of file.nodes) {
    if (node.parentId) {
      childNodeIds.add(node.id)
    }
  }

  // Only include root-level nodes in the main execution order
  const rootNodes = file.nodes.filter(n => !n.parentId)

  // Build in-degree map and adjacency list for ROOT NODES ONLY
  const inDegree = new Map<string, number>()
  const adjacencyList = new Map<string, string[]>()

  // Initialize all root nodes with in-degree 0
  for (const node of rootNodes) {
    inDegree.set(node.id, 0)
    adjacencyList.set(node.id, [])
  }

  // Build graph from execution flow edges (only between root nodes)
  for (const edge of file.edges) {
    // Skip edges involving child nodes - they're handled by container execution
    if (childNodeIds.has(edge.source) || childNodeIds.has(edge.target)) {
      continue
    }

    // Skip internal back-edges that would create cycles
    if (!isExecutionFlowEdge(edge)) {
      continue
    }

    const targets = adjacencyList.get(edge.source) || []
    targets.push(edge.target)
    adjacencyList.set(edge.source, targets)

    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1)
  }

  // Kahn's algorithm for topological sort with specific node type handling
  //
  // Node categories:
  // 1. Global nodes (provider, error-handler, connection): Always run first, configure the workflow
  // 2. Trigger/Start nodes: Begin the actual execution flow
  // 3. Event-driven nodes (callback, checkpoint): NEVER auto-execute, only run when triggered by events
  // 4. Other nodes: Execute when reached via edges from trigger/start nodes
  //
  const globalNodeTypes = new Set(['provider', 'error-handler', 'connection'])
  const startNodeTypes = new Set(['trigger'])
  // Callback/Checkpoint nodes are event-driven - they ONLY execute when triggered by events
  // from Agent nodes (onCheckpoint), error handlers (onError), etc. They should NEVER auto-start.
  const eventDrivenNodeTypes = new Set(['callback', 'checkpoint'])

  const globalQueue: string[] = []
  const startQueue: string[] = []
  const otherQueue: string[] = []

  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      const node = rootNodes.find(n => n.id === nodeId)
      const nodeType = node?.type || ''

      // NEVER include event-driven nodes in the initial queue
      // They only execute when triggered by events, not as part of the main flow
      if (eventDrivenNodeTypes.has(nodeType)) {
        continue
      }

      if (globalNodeTypes.has(nodeType)) {
        globalQueue.push(nodeId)
      } else if (startNodeTypes.has(nodeType)) {
        startQueue.push(nodeId)
      } else {
        otherQueue.push(nodeId)
      }
    }
  }

  // Build initial queue: global nodes first, then triggers, then other start points
  // If no triggers exist, use other nodes with in-degree 0 as starting points
  // (this supports simple workflows without explicit trigger nodes)
  const queue: string[] = [...globalQueue, ...startQueue, ...otherQueue]
  const order: string[] = []

  while (queue.length > 0) {
    const current = queue.shift()!
    order.push(current)

    const neighbors = adjacencyList.get(current) || []
    for (const neighbor of neighbors) {
      const newDegree = (inDegree.get(neighbor) || 0) - 1
      inDegree.set(neighbor, newDegree)
      if (newDegree === 0) queue.push(neighbor)
    }
  }

  // Log disconnected nodes for debugging (but don't add them to execution order)
  const visitedSet = new Set(order)
  for (const node of rootNodes) {
    if (!visitedSet.has(node.id)) {
      // Don't warn for event-driven nodes - they're intentionally excluded
      if (!eventDrivenNodeTypes.has(node.type || '')) {
        console.log(`[getExecutionOrder] Node not in execution flow (disconnected or event-driven): ${node.id} (type: ${node.type})`)
      }
    }
  }

  return order
}

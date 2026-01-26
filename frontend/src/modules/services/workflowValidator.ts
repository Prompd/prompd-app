/**
 * Centralized Workflow Validation System
 *
 * Validates workflow structure, edges, and node configurations.
 * Returns errors (blocking issues) and warnings (non-blocking suggestions).
 */

import type {
  WorkflowFile,
  WorkflowNode,
  WorkflowValidationError,
  WorkflowValidationWarning,
  WorkflowNodeType,
  TriggerNodeData,
  PromptNodeData,
  ConditionNodeData,
  LoopNodeData,
  AgentNodeData,
  BaseNodeData,
} from './workflowTypes'

export interface ValidationResult {
  errors: WorkflowValidationError[]
  warnings: WorkflowValidationWarning[]
  isValid: boolean
}

/**
 * Validates an entire workflow
 */
export function validateWorkflow(workflow: WorkflowFile): ValidationResult {
  const errors: WorkflowValidationError[] = []
  const warnings: WorkflowValidationWarning[] = []

  // Validate workflow structure
  if (!workflow.nodes || workflow.nodes.length === 0) {
    errors.push({
      message: 'Workflow is empty. Drag a node from the Node Palette on the left to get started.',
      code: 'EMPTY_WORKFLOW',
    })
    return { errors, warnings, isValid: false }
  }

  // Validate each node
  for (const node of workflow.nodes) {
    const nodeErrors = validateNode(node, workflow)
    errors.push(...nodeErrors)
  }

  // Validate edges
  if (workflow.edges) {
    for (const connection of workflow.edges) {
      const connectionErrors = validateConnection(connection, workflow)
      errors.push(...connectionErrors)
    }
  }

  // Check for disconnected nodes (warnings)
  const disconnectedNodes = findDisconnectedNodes(workflow)
  for (const nodeId of disconnectedNodes) {
    const node = workflow.nodes.find(n => n.id === nodeId)
    const nodeLabel = node?.data?.label || nodeId
    warnings.push({
      nodeId,
      message: `Node '${nodeLabel}' is not connected. Connect it to other nodes to include it in the workflow.`,
      code: 'DISCONNECTED_NODE',
    })
  }

  // Check for circular dependencies
  const cycles = detectCircularDependencies(workflow)
  for (const cycle of cycles) {
    errors.push({
      message: `Circular dependency detected: ${cycle.join(' → ')}`,
      code: 'CIRCULAR_DEPENDENCY',
    })
  }

  // Check for missing trigger nodes
  const triggerCount = workflow.nodes.filter(n => n.type === 'trigger').length
  if (triggerCount === 0) {
    warnings.push({
      message: 'Workflow has no trigger node. Add a trigger to define when the workflow should run.',
      code: 'NO_TRIGGER',
    })
  }

  // Check for missing output nodes
  const outputCount = workflow.nodes.filter(n => n.type === 'output').length
  if (outputCount === 0) {
    warnings.push({
      message: 'Workflow has no output node. Add an output node to capture workflow results.',
      code: 'NO_OUTPUT',
    })
  }

  return {
    errors,
    warnings,
    isValid: errors.length === 0,
  }
}

/**
 * Validates a single node
 */
function validateNode(node: WorkflowNode, workflow: WorkflowFile): WorkflowValidationError[] {
  const errors: WorkflowValidationError[] = []

  // Validate node has required fields
  if (!node.id) {
    errors.push({
      nodeId: node.id,
      message: 'Node is missing required field: id',
      code: 'MISSING_NODE_ID',
    })
  }

  if (!node.type) {
    errors.push({
      nodeId: node.id,
      message: 'Node is missing required field: type',
      code: 'MISSING_NODE_TYPE',
    })
  }

  // Validate node-specific requirements
  switch (node.type) {
    case 'trigger':
      errors.push(...validateTriggerNode(node))
      break
    case 'prompt':
      errors.push(...validatePromptNode(node))
      break
    case 'condition':
      errors.push(...validateConditionNode(node))
      break
    case 'loop':
      errors.push(...validateLoopNode(node))
      break
    case 'agent':
      errors.push(...validateAgentNode(node))
      break
    // Add more node type validations as needed
  }

  // Validate container nodes have proper children
  if (['loop', 'parallel', 'tool-call-router', 'chat-agent'].includes(node.type)) {
    const children = workflow.nodes.filter(n => n.parentId === node.id)
    if (children.length === 0 && node.type !== 'chat-agent') {
      const containerTypeHelp: Record<string, string> = {
        'loop': 'Drag nodes inside this loop container to define the loop body.',
        'parallel': 'Drag nodes inside this parallel container to run them concurrently.',
        'tool-call-router': 'Drag tool nodes inside this router to handle different tool calls.',
      }

      errors.push({
        nodeId: node.id,
        message: `Container '${node.type}' (${node.data?.label || node.id}) is empty. ${containerTypeHelp[node.type] || 'Drag nodes inside this container.'}`,
        code: 'EMPTY_CONTAINER',
      })
    }
  }

  return errors
}

/**
 * Validate trigger node
 */
function validateTriggerNode(node: WorkflowNode): WorkflowValidationError[] {
  const errors: WorkflowValidationError[] = []
  const data = node.data as TriggerNodeData

  if (!data.triggerType) {
    errors.push({
      nodeId: node.id,
      field: 'triggerType',
      message: `Trigger '${data.label || node.id}' is missing a trigger type. Select Manual, Schedule, Webhook, or Event in the properties panel.`,
      code: 'MISSING_TRIGGER_TYPE',
    })
  }

  // Validate schedule trigger - check BOTH fields
  if (data.triggerType === 'schedule' && !data.schedule && !data.scheduleCron) {
    errors.push({
      nodeId: node.id,
      field: 'schedule',
      message: `Schedule trigger '${data.label || node.id}' needs a schedule. Enter a cron expression in the properties panel.`,
      code: 'MISSING_SCHEDULE',
    })
  }

  // Validate webhook trigger
  if (data.triggerType === 'webhook' && !data.webhookPath) {
    errors.push({
      nodeId: node.id,
      field: 'webhookPath',
      message: `Webhook trigger '${data.label || node.id}' needs a webhook path. Enter a URL path (e.g., /api/trigger) in the properties panel.`,
      code: 'MISSING_WEBHOOK_PATH',
    })
  }

  return errors
}

/**
 * Validate prompt node
 */
function validatePromptNode(node: WorkflowNode): WorkflowValidationError[] {
  const errors: WorkflowValidationError[] = []
  const data = node.data as PromptNodeData

  // Check if prompt has content from ANY source
  if (!data.source && !data.content && !data.rawPrompt) {
    errors.push({
      nodeId: node.id,
      message: `Prompt '${data.label || node.id}' has no content. Either select a .prmd file or enter prompt text in the properties panel.`,
      code: 'MISSING_PROMPT_CONTENT',
    })
  }

  return errors
}

/**
 * Validate condition node
 */
function validateConditionNode(node: WorkflowNode): WorkflowValidationError[] {
  const errors: WorkflowValidationError[] = []
  const data = node.data as ConditionNodeData

  if (!data.conditions || data.conditions.length === 0) {
    errors.push({
      nodeId: node.id,
      field: 'conditions',
      message: `Condition '${data.label || node.id}' has no conditions. Add at least one condition in the properties panel.`,
      code: 'MISSING_CONDITIONS',
    })
  }

  return errors
}

/**
 * Validate loop node
 */
function validateLoopNode(node: WorkflowNode): WorkflowValidationError[] {
  const errors: WorkflowValidationError[] = []
  const data = node.data as LoopNodeData

  if (!data.loopType) {
    errors.push({
      nodeId: node.id,
      field: 'loopType',
      message: `Loop '${data.label || node.id}' is missing a loop type. Select While, For-Each, or Count in the properties panel.`,
      code: 'MISSING_LOOP_TYPE',
    })
  }

  if (data.loopType === 'while' && !data.condition) {
    errors.push({
      nodeId: node.id,
      field: 'condition',
      message: `While loop '${data.label || node.id}' needs a condition. Enter a condition expression in the properties panel.`,
      code: 'MISSING_LOOP_CONDITION',
    })
  }

  if (data.loopType === 'for-each' && !data.arraySource) {
    errors.push({
      nodeId: node.id,
      field: 'arraySource',
      message: `For-Each loop '${data.label || node.id}' needs an array source. Specify the array variable in the properties panel.`,
      code: 'MISSING_ARRAY_SOURCE',
    })
  }

  if (data.loopType === 'count' && !data.count) {
    errors.push({
      nodeId: node.id,
      field: 'count',
      message: `Count loop '${data.label || node.id}' needs a count value. Enter the number of iterations in the properties panel.`,
      code: 'MISSING_COUNT',
    })
  }

  return errors
}

/**
 * Validate agent node
 */
function validateAgentNode(node: WorkflowNode): WorkflowValidationError[] {
  const errors: WorkflowValidationError[] = []
  const data = node.data as AgentNodeData

  // Check if agent has EITHER inline model config OR provider node reference
  if (!data.model && !data.provider && !data.providerNodeId) {
    errors.push({
      nodeId: node.id,
      message: `Agent '${data.label || node.id}' has no model configured. Select an LLM provider and model in the properties panel, or connect to a Provider node.`,
      code: 'MISSING_AGENT_MODEL',
    })
  }

  return errors
}

/**
 * Validate a connection
 */
function validateConnection(
  connection: { source: string; target: string; sourceHandle?: string; targetHandle?: string },
  workflow: WorkflowFile
): WorkflowValidationError[] {
  const errors: WorkflowValidationError[] = []

  // Check source node exists
  const sourceNode = workflow.nodes.find(n => n.id === connection.source)
  if (!sourceNode) {
    errors.push({
      connectionId: `${connection.source}-${connection.target}`,
      message: `Invalid connection: source node '${connection.source}' no longer exists. Delete this connection.`,
      code: 'INVALID_SOURCE_NODE',
    })
  }

  // Check target node exists
  const targetNode = workflow.nodes.find(n => n.id === connection.target)
  if (!targetNode) {
    errors.push({
      connectionId: `${connection.source}-${connection.target}`,
      message: `Invalid connection: target node '${connection.target}' no longer exists. Delete this connection.`,
      code: 'INVALID_TARGET_NODE',
    })
  }

  // Check for self-edges
  if (connection.source === connection.target) {
    const selfNode = workflow.nodes.find(n => n.id === connection.source)
    const nodeLabel = selfNode?.data?.label || connection.source
    errors.push({
      connectionId: `${connection.source}-${connection.target}`,
      message: `Node '${nodeLabel}' cannot connect to itself. Remove this connection.`,
      code: 'SELF_CONNECTION',
    })
  }

  return errors
}

/**
 * Find nodes that have no incoming or outgoing edges
 */
function findDisconnectedNodes(workflow: WorkflowFile): string[] {
  const connectedNodes = new Set<string>()

  if (workflow.edges) {
    for (const connection of workflow.edges) {
      connectedNodes.add(connection.source)
      connectedNodes.add(connection.target)
    }
  }

  return workflow.nodes
    .filter(node => {
      // Trigger and output nodes can be disconnected
      if (node.type === 'trigger' || node.type === 'output') {
        return false
      }
      return !connectedNodes.has(node.id)
    })
    .map(node => node.id)
}

/**
 * Detect circular dependencies in the workflow
 */
function detectCircularDependencies(workflow: WorkflowFile): string[][] {
  const cycles: string[][] = []
  const visited = new Set<string>()
  const recursionStack = new Set<string>()

  // Build adjacency list, excluding special edge types
  const graph = new Map<string, string[]>()
  for (const node of workflow.nodes) {
    graph.set(node.id, [])
  }

  if (workflow.edges) {
    for (const connection of workflow.edges) {
      // Exclude docked edges (agent <-> tool-router feedback loops)
      const isDocked = connection.id?.startsWith('docked-') ||
        connection.sourceHandle === 'ai-output' ||
        connection.targetHandle === 'ai-input' ||
        connection.targetHandle === 'toolResult'

      // Exclude loop container edges (loop-start, loop-end are valid cycles)
      const sourceNode = workflow.nodes.find(n => n.id === connection.source)
      const isLoopEdge = sourceNode?.type === 'loop' && (
        connection.sourceHandle === 'loop-start' ||
        connection.sourceHandle === 'loop-end'
      )

      // Skip these edge types in cycle detection
      if (isDocked || isLoopEdge) {
        continue
      }

      const targets = graph.get(connection.source) || []
      targets.push(connection.target)
      graph.set(connection.source, targets)
    }
  }

  // DFS to detect cycles
  function dfs(nodeId: string, path: string[]): void {
    visited.add(nodeId)
    recursionStack.add(nodeId)
    path.push(nodeId)

    const neighbors = graph.get(nodeId) || []
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, [...path])
      } else if (recursionStack.has(neighbor)) {
        // Found a cycle
        const cycleStart = path.indexOf(neighbor)
        if (cycleStart !== -1) {
          cycles.push([...path.slice(cycleStart), neighbor])
        }
      }
    }

    recursionStack.delete(nodeId)
  }

  for (const node of workflow.nodes) {
    if (!visited.has(node.id)) {
      dfs(node.id, [])
    }
  }

  return cycles
}

/**
 * Quick validation for real-time feedback (lighter weight)
 */
export function validateWorkflowQuick(workflow: WorkflowFile): Pick<ValidationResult, 'isValid'> {
  // Quick checks only
  if (!workflow.nodes || workflow.nodes.length === 0) {
    return { isValid: false }
  }

  // Check for obvious issues
  for (const node of workflow.nodes) {
    if (!node.id || !node.type) {
      return { isValid: false }
    }
  }

  return { isValid: true }
}

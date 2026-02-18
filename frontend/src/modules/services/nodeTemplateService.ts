/**
 * Node Template Service
 *
 * Pure logic for extracting template data from workflow nodes.
 * No UI, no IPC — used by WorkflowCanvas to prepare data for template:save IPC.
 */

import type { WorkflowNode, WorkflowEdge, WorkflowNodeType } from './workflowTypes'
import type { NodeTemplate, NodeTemplateChild, NodeTemplateEdge } from './nodeTemplateTypes'
import { NODE_TYPE_REGISTRY } from './nodeTypeRegistry'

/** Node types that can reference .prmd or .pdflow files */
const NODE_TYPES_WITH_FILE_REFS = new Set<WorkflowNodeType>([
  'prompt',
  'chat-agent',
  'workflow',
])

/** Fields to strip from node data when creating a template (runtime-only references) */
const RUNTIME_DATA_FIELDS = new Set([
  'errorHandlerNodeId',
  'providerNodeId',
  'connectionId',
  'dockedTo',
  '_preDockWidth',
  '_preDockHeight',
  '_preDockPosition',
])

interface NodeDeps {
  files: string[]    // workspace-relative file paths
  packages: string[] // package references (@ns/package@version)
}

/**
 * Get dependencies for a single node based on its type and data.
 * Separates workspace files from package references.
 */
export function getNodeDependencies(
  nodeType: WorkflowNodeType,
  nodeData: Record<string, unknown>
): NodeDeps {
  if (!NODE_TYPES_WITH_FILE_REFS.has(nodeType)) return { files: [], packages: [] }

  const files: string[] = []
  const packages: string[] = []

  const addSource = (source: string | undefined) => {
    if (!source) return
    if (source.startsWith('@')) {
      // Package reference: @ns/package@version/path/to/file.prmd
      // Extract just the @ns/package@version portion for the packages list
      const secondAt = source.indexOf('@', 1)
      if (secondAt > 0) {
        const slashAfterVersion = source.indexOf('/', secondAt)
        const pkgRef = slashAfterVersion > 0 ? source.substring(0, slashAfterVersion) : source
        packages.push(pkgRef)
      }
    } else {
      files.push(source)
    }
  }

  switch (nodeType) {
    case 'prompt': {
      const sourceType = nodeData.sourceType as string | undefined
      const source = nodeData.source as string | undefined
      if (source && (sourceType === 'file' || !sourceType)) {
        addSource(source)
      }
      break
    }
    case 'chat-agent': {
      const sourceType = nodeData.agentPromptSourceType as string | undefined
      const source = nodeData.agentPromptSource as string | undefined
      if (source && sourceType === 'file') {
        addSource(source)
      }
      break
    }
    case 'workflow': {
      const source = nodeData.source as string | undefined
      if (source) {
        addSource(source)
      }
      break
    }
  }

  return { files, packages }
}

/**
 * Strip runtime-only fields from node data, returning a clean copy for the template.
 */
function cleanNodeData(data: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (!RUNTIME_DATA_FIELDS.has(key)) {
      cleaned[key] = value
    }
  }
  return cleaned
}

/**
 * Extract template data from a workflow node and its children (for containers).
 *
 * @param node - The root node to save as template
 * @param allNodes - All nodes in the workflow (for finding children)
 * @param allEdges - All edges in the workflow (for finding internal edges)
 */
export function extractTemplateData(
  node: WorkflowNode,
  allNodes: WorkflowNode[],
  allEdges: WorkflowEdge[]
): NodeTemplate {
  const registry = NODE_TYPE_REGISTRY[node.type]
  const nodeData = cleanNodeData(node.data as unknown as Record<string, unknown>)

  // Collect dimensions for container nodes
  const dimensions = (node.width && node.height)
    ? { width: node.width, height: node.height }
    : undefined

  // Find children (nodes whose parentId matches this node)
  const childNodes = allNodes.filter(n => n.parentId === node.id)

  let children: NodeTemplateChild[] | undefined
  let edges: NodeTemplateEdge[] | undefined
  const allFiles: string[] = []
  const allPackages: string[] = []

  // Collect dependencies from root node
  const rootDeps = getNodeDependencies(node.type, node.data as unknown as Record<string, unknown>)
  allFiles.push(...rootDeps.files)
  allPackages.push(...rootDeps.packages)

  if (childNodes.length > 0) {
    // Build set of all IDs in this template (root + children)
    const templateNodeIds = new Set([node.id, ...childNodes.map(c => c.id)])

    // Extract children with relative positions (already relative in React Flow)
    children = childNodes.map(child => {
      const childData = cleanNodeData(child.data as unknown as Record<string, unknown>)

      // Collect dependencies from each child
      const childDeps = getNodeDependencies(child.type, child.data as unknown as Record<string, unknown>)
      allFiles.push(...childDeps.files)
      allPackages.push(...childDeps.packages)

      return {
        type: child.type,
        data: childData,
        relativePosition: { x: child.position.x, y: child.position.y },
        dimensions: (child.width && child.height)
          ? { width: child.width, height: child.height }
          : undefined,
        originalId: child.id,
      }
    })

    // Find edges where both source and target are within this template
    const internalEdges = allEdges.filter(
      e => templateNodeIds.has(e.source) && templateNodeIds.has(e.target)
    )

    if (internalEdges.length > 0) {
      edges = internalEdges.map(e => ({
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
      }))
    }
  }

  // Deduplicate
  const uniqueFiles = [...new Set(allFiles)]
  const uniquePackages = [...new Set(allPackages)]

  return {
    version: '1.0',
    type: 'node-template',
    name: (node.data as { label?: string }).label || registry?.label || node.type,
    nodeTypeLabel: registry?.label || node.type,
    createdAt: new Date().toISOString(),
    files: uniqueFiles.length > 0 ? uniqueFiles : undefined,
    packages: uniquePackages.length > 0 ? uniquePackages : undefined,
    node: {
      nodeType: node.type,
      nodeData,
      originalId: node.id,
      dimensions,
      children: children && children.length > 0 ? children : undefined,
      edges: edges && edges.length > 0 ? edges : undefined,
    },
  }
}

/**
 * Workflow Store - Zustand store for workflow canvas state
 *
 * Includes undo/redo history tracking for all state-changing operations.
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from '@xyflow/react'
import type {
  WorkflowFile,
  WorkflowNode,
  WorkflowNodeType,
  WorkflowExecutionState,
  WorkflowValidationError,
  WorkflowValidationWarning,
  NodeExecutionStatus,
  BaseNodeData,
  WorkflowConnection,
  WorkflowConnectionStatus,
  CustomCommandConfig,
  WorkflowResult,
} from '../modules/services/workflowTypes'
import { DOCKABLE_NODE_TYPES, DOCKABLE_HANDLES } from '../modules/services/workflowTypes'
import type { CheckpointEvent, ExecutionTrace } from '../modules/services/workflowExecutor'

// Use generic Node/Edge types for React Flow compatibility
type WorkflowCanvasNode = Node<BaseNodeData>
type WorkflowCanvasEdge = Edge
import {
  parseWorkflow,
  serializeWorkflow,
  createEmptyWorkflow,
  createWorkflowNode,
} from '../modules/services/workflowParser'

// ============================================================================
// Undo/Redo History Management
// ============================================================================

/** Snapshot of the workflow state for undo/redo */
interface HistorySnapshot {
  workflowFile: WorkflowFile | null
  nodes: WorkflowCanvasNode[]
  edges: WorkflowCanvasEdge[]
  timestamp: number
}

/** Maximum number of history entries to keep */
const MAX_HISTORY_SIZE = 50
const DEFAULT_SNAP_THRESHOLD = 100



/** Minimum time between history snapshots (ms) to avoid spam during drags */
const HISTORY_DEBOUNCE_MS = 300

/**
 * Deep clone a workflow file for history snapshot
 */
function cloneWorkflowFile(file: WorkflowFile | null): WorkflowFile | null {
  if (!file) return null
  return JSON.parse(JSON.stringify(file))
}

/**
 * Deep clone nodes array for history snapshot
 */
function cloneNodes(nodes: WorkflowCanvasNode[]): WorkflowCanvasNode[] {
  return JSON.parse(JSON.stringify(nodes))
}

/**
 * Deep clone edges array for history snapshot
 */
function cloneEdges(edges: WorkflowCanvasEdge[]): WorkflowCanvasEdge[] {
  return JSON.parse(JSON.stringify(edges))
}

// Container node types that can have children
const CONTAINER_TYPES = ['loop', 'parallel', 'tool-call-router', 'chat-agent']

// Node types that can be dropped into tool-call-router
const TOOL_ROUTER_ALLOWED_CHILDREN = ['tool', 'tool-call-parser']

// Default dimensions for container nodes
const DEFAULT_CONTAINER_WIDTH = 300
const DEFAULT_CONTAINER_HEIGHT = 200
const CONTAINER_HEADER_HEIGHT = 40

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
 * Check if a node type can be dropped into a specific container type
 */
function canNodeBeDroppedIntoContainer(
  nodeType: string | undefined,
  containerType: string | undefined
): boolean {
  if (!nodeType || !containerType) return false

  // Tool-call-router only accepts tool and tool-call-parser nodes
  if (containerType === 'tool-call-router') {
    return TOOL_ROUTER_ALLOWED_CHILDREN.includes(nodeType)
  }

  // Chat-agent accepts tool nodes (like tool-call-router does)
  if (containerType === 'chat-agent') {
    return TOOL_ROUTER_ALLOWED_CHILDREN.includes(nodeType)
  }

  // Loop and parallel accept any non-container node
  if (containerType === 'loop' || containerType === 'parallel') {
    return !CONTAINER_TYPES.includes(nodeType)
  }

  return false
}

/**
 * Find the container node (loop/parallel/tool-call-router) at a given position
 * Returns the container's ID if found, null otherwise
 * If draggedNodeType is provided, only returns containers that can accept that node type
 */
// Collapsed dimensions for container boundary detection (matching ContainerNode.tsx)
const COLLAPSED_WIDTH = 180
const COLLAPSED_HEIGHT = 120

function findContainerAtPosition(
  nodes: WorkflowCanvasNode[],
  position: { x: number; y: number },
  excludeNodeId?: string,
  draggedNodeType?: string
): string | null {
  // Find all container nodes
  const containers = nodes.filter(
    n => CONTAINER_TYPES.includes(n.type || '') && n.id !== excludeNodeId
  )

  // Check if position is inside any container (checking innermost first by sorting by area)
  for (const container of containers) {
    // Check if container is collapsed
    const nodeData = container.data as BaseNodeData
    const isCollapsed = (nodeData as { collapsed?: boolean }).collapsed === true

    // Use collapsed dimensions if container is collapsed, otherwise use measured/default dimensions
    let width: number
    let height: number

    if (isCollapsed) {
      // Collapsed containers have fixed dimensions
      width = COLLAPSED_WIDTH
      height = COLLAPSED_HEIGHT
    } else {
      // Expanded containers use measured width/height or defaults
      width = (container.width as number) || DEFAULT_CONTAINER_WIDTH
      height = (container.height as number) || DEFAULT_CONTAINER_HEIGHT
    }

    const bounds = {
      left: container.position.x,
      top: container.position.y + CONTAINER_HEADER_HEIGHT, // Skip header area
      right: container.position.x + width,
      bottom: container.position.y + height,
    }

    if (
      position.x >= bounds.left &&
      position.x <= bounds.right &&
      position.y >= bounds.top &&
      position.y <= bounds.bottom
    ) {
      // If we have a dragged node type, check if it can be dropped here
      if (draggedNodeType && !canNodeBeDroppedIntoContainer(draggedNodeType, container.type)) {
        continue // Skip this container, try the next one
      }
      return container.id
    }
  }

  return null
}

/** Default node dimensions for dock target calculation, per node type
 * These are estimates based on typical rendered sizes - React Flow doesn't auto-measure
 * COLLAPSED dimensions are for container nodes in collapsed state
 */
const DEFAULT_NODE_DIMENSIONS: Partial<Record<WorkflowNodeType, { width: number; height: number }>> = {
  // AgentNode: minWidth 200, variable height based on content (~160px typical)
  agent: { width: 200, height: 160 },
  // ChatAgentNode (collapsed): COLLAPSED_WIDTH=180, height ~150px based on collapsed content
  'chat-agent': { width: 180, height: 150 },
  // GuardrailNode: similar to other nodes
  guardrail: { width: 200, height: 140 },
  // PromptNode: variable based on content
  prompt: { width: 200, height: 175 },
}

/** Collapsed dimensions for container nodes */
const COLLAPSED_DIMENSIONS: Partial<Record<WorkflowNodeType, { width: number; height: number }>> = {
  'chat-agent': { width: 180, height: 150 },
  'loop': { width: 180, height: 100 },
  'parallel': { width: 180, height: 100 },
  'tool-call-router': { width: 180, height: 100 },
}
const DEFAULT_NODE_WIDTH = 200
const DEFAULT_NODE_HEIGHT = 150

/** Get default dimensions for a node type */
function getDefaultNodeDimensions(nodeType: string | undefined): { width: number; height: number } {
  if (nodeType && DEFAULT_NODE_DIMENSIONS[nodeType as WorkflowNodeType]) {
    return DEFAULT_NODE_DIMENSIONS[nodeType as WorkflowNodeType]!
  }
  return { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT }
}

/**
 * Find the nearest dockable handle within snap distance
 * Returns the target { nodeId, handleId } if found, null otherwise
 */
function findDockTargetAtPosition(
  nodes: WorkflowCanvasNode[],
  draggedNodePosition: { x: number; y: number },
  draggedNodeType: string,
  snapThreshold: number = DEFAULT_SNAP_THRESHOLD
): { nodeId: string; handleId: string } | null {
  // Only proceed if the dragged node is a dockable type
  if (!DOCKABLE_NODE_TYPES.includes(draggedNodeType as WorkflowNodeType)) {
    return null
  }

  // Find all potential host nodes with dockable handles
  for (const handle of DOCKABLE_HANDLES) {
    // Check if the dragged node type can dock to this handle
    if (!handle.acceptsTypes.includes(draggedNodeType as WorkflowNodeType)) {
      continue
    }

    // Find nodes of this type
    const hostNodes = nodes.filter(n => n.type === handle.nodeType)

    for (const hostNode of hostNodes) {
      // Calculate handle position on the host node
      // For container nodes (chat-agent, etc.), check if collapsed and use collapsed dimensions
      const nodeData = hostNode.data as BaseNodeData
      const defaults = getDefaultNodeDimensions(hostNode.type)

      // Container types that support collapse
      const isContainerType = ['chat-agent', 'loop', 'parallel', 'tool-call-router'].includes(hostNode.type || '')
      const isCollapsed = isContainerType && (nodeData as { collapsed?: boolean }).collapsed !== false

      // For collapsed containers, use collapsed dimensions (COLLAPSED_WIDTH = 180)
      // For AgentNode and other non-containers, prefer defaults since React Flow often doesn't measure them
      let nodeWidth: number
      let nodeHeight: number

      if (isContainerType && isCollapsed) {
        nodeWidth = 180 // COLLAPSED_WIDTH
        nodeHeight = defaults.height // Use default height for collapsed state
      } else if (hostNode.type === 'agent') {
        // AgentNode doesn't get measured by React Flow - always use defaults
        nodeWidth = defaults.width
        nodeHeight = defaults.height
      } else {
        // For other nodes, use measured if available, else defaults
        nodeWidth = (hostNode.width as number) || defaults.width
        nodeHeight = (hostNode.height as number) || defaults.height
      }

      let handleX: number
      let handleY: number

      if (handle.position.side === 'left') {
        handleX = hostNode.position.x
        handleY = hostNode.position.y + (nodeHeight * handle.position.topPercent / 100)
      } else if (handle.position.side === 'right') {
        handleX = hostNode.position.x + nodeWidth
        handleY = hostNode.position.y + (nodeHeight * handle.position.topPercent / 100)
      } else { // 'bottom'
        handleX = hostNode.position.x + nodeWidth / 2
        handleY = hostNode.position.y + nodeHeight
      }

      // Check if dragged node is within snap distance of this handle
      const distance = Math.sqrt(
        Math.pow(draggedNodePosition.x - handleX, 2) +
        Math.pow(draggedNodePosition.y - handleY, 2)
      )

      // Debug: log when checking against any dockable host node
      if (distance < 100) {
        console.log(`[Docking] Checking ${hostNode.type}:`, {
          hostNodeId: hostNode.id,
          hostPosition: hostNode.position,
          isContainerType,
          collapsedRawValue: (nodeData as { collapsed?: boolean }).collapsed,
          isCollapsed,
          measuredWidth: hostNode.width,
          measuredHeight: hostNode.height,
          defaultDims: defaults,
          usedWidth: nodeWidth,
          usedHeight: nodeHeight,
          handleId: handle.handleId,
          handleConfig: handle.position,
          calculatedHandlePos: { x: handleX, y: handleY },
          dragPosition: draggedNodePosition,
          distance: Math.round(distance),
          snapThreshold,
          wouldDock: distance <= snapThreshold,
        })
      }

      if (distance <= snapThreshold) {
        return { nodeId: hostNode.id, handleId: handle.handleId }
      }
    }
  }

  return null
}

/** Captured prompt info for debugging */
export interface PromptSentInfo {
  nodeId: string
  source: string
  resolvedPath?: string
  compiledPrompt: string
  params: Record<string, unknown>
  provider?: string
  model?: string
  timestamp: number
}

/** Execution history entry */
export interface ExecutionHistoryEntry {
  id: string
  workflowName: string
  status: 'success' | 'error' | 'cancelled'
  timestamp: number
  duration: number
  result: WorkflowResult & { trace?: ExecutionTrace }
  checkpoints: CheckpointEvent[]
  promptsSent: PromptSentInfo[]
}

interface WorkflowStoreState {
  // Workflow file data
  workflowFile: WorkflowFile | null

  // React Flow state
  nodes: WorkflowCanvasNode[]
  edges: WorkflowCanvasEdge[]

  // Connections (external services like SSH, Database, HTTP API)
  connections: WorkflowConnection[]

  // Custom allowed commands (user-defined shell commands)
  customCommands: CustomCommandConfig[]

  // Selection
  selectedNodeId: string | null
  selectedEdgeId: string | null

  // Validation
  errors: WorkflowValidationError[]
  warnings: WorkflowValidationWarning[]

  // Execution state
  executionState: WorkflowExecutionState | null
  executionResult: (WorkflowResult & { trace?: ExecutionTrace }) | null
  checkpoints: CheckpointEvent[]
  promptsSent: PromptSentInfo[]
  executionHistory: ExecutionHistoryEntry[]

  // UI state
  isDirty: boolean
  isExecuting: boolean
  showMinimap: boolean
  showGrid: boolean
  toolbarDockPosition: 'top' | 'bottom' | 'left' | 'right'

  // Drag state for visual feedback
  dragState: {
    /** ID of node being dragged */
    draggingNodeId: string | null
    /** ID of container the dragged node is currently over */
    hoverContainerId: string | null
    /** ID of container the node is leaving (for exit feedback) */
    exitingContainerId: string | null
  } | null

  // Docking state for magnetic node docking to handles
  dockingState: {
    /** ID of node being dragged that could be docked */
    draggingNodeId: string | null
    /** Handle currently being hovered over for docking */
    hoveredDockTarget: { nodeId: string; handleId: string } | null
    /** Snap threshold in pixels */
    snapThreshold: number
  } | null

  // Undo/Redo history
  history: HistorySnapshot[]
  historyIndex: number
  lastHistoryTimestamp: number

  // Actions
  loadWorkflow: (json: string) => void
  serializeToJson: () => string
  clearWorkflow: () => void
  updateWorkflowParameters: (parameters: import('../modules/services/workflowTypes').WorkflowParameter[]) => void

  // Clipboard for copy/paste
  clipboard: { node: WorkflowCanvasNode; edges: WorkflowCanvasEdge[] } | null

  // Context menu state
  contextMenu: {
    type: 'node' | 'edge' | 'canvas'
    position: { x: number; y: number }
    nodeId?: string
    edgeId?: string
  } | null

  // Node operations
  onNodesChange: (changes: NodeChange<WorkflowCanvasNode>[]) => void
  onNodeDragStart: (nodeId: string) => void
  onNodeDrag: (nodeId: string, position: { x: number; y: number }, mousePosition?: { x: number; y: number }) => void
  onNodeDragStop: (nodeId: string, position: { x: number; y: number }, mousePosition?: { x: number; y: number }) => void
  addNode: (type: WorkflowNodeType, position: { x: number; y: number }) => string
  updateNodeData: (nodeId: string, data: Partial<WorkflowNode['data']>) => void
  deleteNode: (nodeId: string) => void
  duplicateNode: (nodeId: string) => string | null
  copyNode: (nodeId: string) => void
  cutNode: (nodeId: string) => void
  pasteNode: (position: { x: number; y: number }) => string | null
  toggleNodeDisabled: (nodeId: string) => void
  ejectChildNodes: (containerId: string) => void

  // Context menu operations
  showContextMenu: (type: 'node' | 'edge' | 'canvas', position: { x: number; y: number }, nodeId?: string, edgeId?: string) => void
  hideContextMenu: () => void

  // Edge operations
  onEdgesChange: (changes: EdgeChange<WorkflowCanvasEdge>[]) => void
  onConnect: (connection: Connection) => void
  deleteEdge: (edgeId: string) => void

  // Node docking operations
  dockNode: (nodeId: string, hostNodeId: string, handleId: string) => void
  undockNode: (nodeId: string) => void
  setDockingTarget: (target: { nodeId: string; handleId: string } | null) => void

  // Selection
  selectNode: (nodeId: string | null) => void
  selectEdge: (edgeId: string | null) => void

  // Execution
  setExecutionState: (state: WorkflowExecutionState | null) => void
  updateNodeExecutionStatus: (nodeId: string, status: NodeExecutionStatus, output?: unknown) => void
  setExecutionResult: (result: (WorkflowResult & { trace?: ExecutionTrace }) | null) => void
  setCheckpoints: (checkpoints: CheckpointEvent[]) => void
  setPromptsSent: (prompts: PromptSentInfo[]) => void
  clearExecutionState: () => void
  loadExecutionFromHistory: (id: string) => void
  clearExecutionHistory: () => void

  // UI
  toggleMinimap: () => void
  toggleGrid: () => void
  setToolbarDockPosition: (position: 'top' | 'bottom' | 'left' | 'right') => void
  setDirty: (dirty: boolean) => void

  // Connections (external services)
  addConnection: (connection: Omit<WorkflowConnection, 'id'>) => string
  updateConnection: (connectionId: string, updates: Partial<WorkflowConnection>) => void
  deleteConnection: (connectionId: string) => void
  updateConnectionStatus: (connectionId: string, status: WorkflowConnectionStatus, error?: string) => void

  // Custom Commands (user-defined allowed shell commands)
  addCustomCommand: (command: Omit<CustomCommandConfig, 'id' | 'addedAt'>) => string
  updateCustomCommand: (commandId: string, updates: Partial<CustomCommandConfig>) => void
  deleteCustomCommand: (commandId: string) => void

  // Undo/Redo
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  pushHistory: () => void
}

export const useWorkflowStore = create<WorkflowStoreState>()(
  immer((set, get) => ({
    // Initial state
    workflowFile: null,
    nodes: [],
    edges: [],
    connections: [],
    customCommands: [],
    clipboard: null,
    contextMenu: null,
    selectedNodeId: null,
    selectedEdgeId: null,
    errors: [],
    warnings: [],
    executionState: null,
    executionResult: null,
    checkpoints: [],
    promptsSent: [],
    executionHistory: [],
    isDirty: false,
    isExecuting: false,
    showMinimap: true,
    showGrid: true,
    toolbarDockPosition: 'top',
    dragState: null,
    dockingState: null,
    history: [],
    historyIndex: -1,
    lastHistoryTimestamp: 0,

    // Load workflow from JSON
    loadWorkflow: (json: string) => {
      const parsed = parseWorkflow(json)
      set(state => {
        state.workflowFile = parsed.file
        state.nodes = parsed.nodes
        state.edges = parsed.edges
        state.errors = parsed.errors
        state.warnings = parsed.warnings
        state.isDirty = false,
        
        // Reset history on load
        state.history = [{
          workflowFile: cloneWorkflowFile(parsed.file),
          nodes: cloneNodes(parsed.nodes),
          edges: cloneEdges(parsed.edges),
          timestamp: Date.now(),
        }]
        state.historyIndex = 0
        state.lastHistoryTimestamp = Date.now()
        state.selectedNodeId = null
        state.selectedEdgeId = null
        state.executionState = null

        // First pass: Ensure edge animation is consistent and apply locked state
        state.edges = state.edges.map(edge => {
          const shouldAnimate = shouldEdgeBeAnimated(edge.sourceHandle) ||
            shouldEdgeBeAnimated(edge.targetHandle)

          if (shouldAnimate !== edge.animated) {
            return { ...edge, animated: shouldAnimate }
          }
          return edge
        })

        // Apply locked state to nodes (make locked nodes non-draggable)
        state.nodes = state.nodes.map(node => {
          const isLocked = node.data?.locked
          if (isLocked) {
            return { ...node, draggable: false }
          }
          return node
        })

        // Second pass: Apply collapsed state to child nodes and edges
        for (const containerNode of state.nodes) {
          if (CONTAINER_TYPES.includes(containerNode.type || '') && containerNode.data?.collapsed) {
            const childIds = new Set(state.nodes.filter(n => n.parentId === containerNode.id).map(n => n.id))

            // Hide child nodes
            for (const node of state.nodes) {
              if (node.parentId === containerNode.id) {
                node.hidden = true
              }
            }

            // Hide internal edges - update edges array to ensure proper references
            state.edges = state.edges.map(edge => {
              const isInternalEdge =
                childIds.has(edge.source) ||
                childIds.has(edge.target) ||
                (edge.source === containerNode.id && INTERNAL_HANDLES.includes(edge.sourceHandle || '')) ||
                (edge.target === containerNode.id && INTERNAL_HANDLES.includes(edge.targetHandle || ''))

              if (isInternalEdge) {
                return { ...edge, hidden: true }
              }
              return edge
            })
          }
        }
      })
    },

    // Serialize current state to JSON
    serializeToJson: () => {
      const { workflowFile, nodes, edges } = get()
      if (!workflowFile) {
        return JSON.stringify(createEmptyWorkflow(), null, 2)
      }
      return serializeWorkflow(workflowFile, nodes, edges)
    },

    // Clear workflow
    clearWorkflow: () => {
      set(state => {
        state.workflowFile = createEmptyWorkflow()
        state.nodes = []
        state.edges = []
        state.errors = []
        state.warnings = []
        state.isDirty = false
        state.selectedNodeId = null
        state.selectedEdgeId = null
        state.executionState = null
      })
    },

    // Update workflow parameters
    updateWorkflowParameters: (parameters) => {
      set(state => {
        if (state.workflowFile) {
          state.workflowFile.parameters = parameters
          state.isDirty = true
        }
      })
    },

    // Handle React Flow node changes (drag, select, etc.)
    onNodesChange: (changes) => {
      set(state => {
        // Sync node removals to workflowFile
        const removals = changes.filter(c => c.type === 'remove')
        if (removals.length > 0 && state.workflowFile) {
          const removedIds = new Set(removals.map(c => c.id))
          state.workflowFile.nodes = state.workflowFile.nodes.filter(n => !removedIds.has(n.id))
          state.workflowFile.edges = state.workflowFile.edges.filter(
            e => !removedIds.has(e.source) && !removedIds.has(e.target)
          )
          // Clear selection if deleted node was selected
          if (state.selectedNodeId && removedIds.has(state.selectedNodeId)) {
            state.selectedNodeId = null
          }
        }

        // Sync position changes to workflowFile (container detection is handled in onNodeDragStop)
        const positionChanges = changes.filter(c => c.type === 'position' && c.position)
        for (const change of positionChanges) {
          if (change.type === 'position' && change.position) {
            const fileNode = state.workflowFile?.nodes.find(n => n.id === change.id)
            if (fileNode) {
              fileNode.position = change.position
            }

            // Docked nodes stay hidden at -9999, -9999 (no position update needed)
          }
        }

        state.nodes = applyNodeChanges(changes, state.nodes) as WorkflowCanvasNode[]
        state.isDirty = true
      })
    },

    // Handle node drag start - initialize drag state
    onNodeDragStart: (nodeId) => {
      // Push history before drag starts (captures pre-drag position)
      get().pushHistory()
      set(state => {
        const node = state.nodes.find(n => n.id === nodeId)
        if (!node) return

        // Allow drag state for all nodes (including containers for docking)
        state.dragState = {
          draggingNodeId: nodeId,
          hoverContainerId: node.parentId || null,
          exitingContainerId: null,
        }
      })
    },

    // Handle node drag - update hover container for visual feedback and detect docking
    onNodeDrag: (nodeId, position, mousePosition) => {
      set(state => {
        if (!state.dragState || state.dragState.draggingNodeId !== nodeId) return

        const node = state.nodes.find(n => n.id === nodeId)
        if (!node) return

        const isContainer = CONTAINER_TYPES.includes(node.type || '')
        const currentParentId = node.parentId

        // Calculate absolute position (needed for both container detection and docking)
        // Use mouse position if available, otherwise fall back to node position
        let absolutePosition: { x: number; y: number }

        if (mousePosition) {
          // Mouse position is already in absolute flow coordinates
          absolutePosition = mousePosition
        } else if (currentParentId) {
          // Fall back to calculating from node position if mousePosition not available
          const currentParent = state.nodes.find(n => n.id === currentParentId)
          if (currentParent) {
            absolutePosition = {
              x: position.x + currentParent.position.x,
              y: position.y + currentParent.position.y,
            }
          } else {
            absolutePosition = position
          }
        } else {
          absolutePosition = position
        }

        // Container-into-container parent/child detection (skip for containers)
        if (!isContainer) {
          // Find container at position, passing node type for filtering
          const containerId = findContainerAtPosition(state.nodes, absolutePosition, nodeId, node.type)

          // Update drag state for visual feedback
          const prevHoverId = state.dragState.hoverContainerId

          // Detect when leaving a container
          if (currentParentId && !containerId) {
            state.dragState.exitingContainerId = currentParentId
            state.dragState.hoverContainerId = null
          } else if (containerId !== prevHoverId) {
            state.dragState.hoverContainerId = containerId
            state.dragState.exitingContainerId = prevHoverId && prevHoverId !== containerId ? prevHoverId : null
          }
        }

        // Check for dock targets (for ALL dockable node types, including containers)
        const nodeType = node.type || ''
        if (DOCKABLE_NODE_TYPES.includes(nodeType as WorkflowNodeType)) {
          console.log('[onNodeDrag] Dragging dockable node:', nodeType, 'ID:', nodeId)
          console.log('[Docking Check] Looking for dock target for', nodeType, 'at absolute position:', absolutePosition)
          const dockTarget = findDockTargetAtPosition(state.nodes, absolutePosition, nodeType, DEFAULT_SNAP_THRESHOLD)

          if (dockTarget) {
            console.log('[Docking] ✅ Found dock target:', dockTarget, 'at position:', absolutePosition)
            state.dockingState = {
              draggingNodeId: nodeId,
              hoveredDockTarget: dockTarget,
              snapThreshold: DEFAULT_SNAP_THRESHOLD,
            }
          } else {
            console.log('[Docking] ❌ No dock target found at position:', absolutePosition)
            if (state.dockingState?.draggingNodeId === nodeId) {
              // Clear docking state if we moved away from dock target
              console.log('[Docking] Clearing docking state')
              state.dockingState = null
            }
          }
        }
      })
    },

    // Handle node drag stop - detect container membership changes
    onNodeDragStop: (nodeId, position, mousePosition) => {
      set(state => {
        const nodeIndex = state.nodes.findIndex(n => n.id === nodeId)
        if (nodeIndex === -1) return

        const rfNode = state.nodes[nodeIndex]
        const fileNode = state.workflowFile?.nodes.find(n => n.id === nodeId)

        // Check if we should dock this node
        if (state.dockingState?.draggingNodeId === nodeId && state.dockingState.hoveredDockTarget) {
          const { nodeId: hostNodeId, handleId } = state.dockingState.hoveredDockTarget

          const hostNode = state.nodes.find(n => n.id === hostNodeId)
          if (!hostNode) {
            state.dockingState = null
            return
          }

          // Save original dimensions before docking
          const rfNodeData = rfNode.data as BaseNodeData
          rfNodeData._preDockWidth = rfNode.width as number | undefined
          rfNodeData._preDockHeight = rfNode.height as number | undefined
          rfNodeData._preDockPosition = { ...rfNode.position }

          // Dock the node
          rfNodeData.dockedTo = { nodeId: hostNodeId, handleId }

          // Update the file node too
          if (fileNode) {
            const fileNodeData = fileNode.data as BaseNodeData
            fileNodeData._preDockWidth = rfNode.width as number | undefined
            fileNodeData._preDockHeight = rfNode.height as number | undefined
            fileNodeData._preDockPosition = { ...rfNode.position }
            fileNodeData.dockedTo = { nodeId: hostNodeId, handleId }
          }

          // Create edge connections based on the docking relationship
          const nodeType = rfNode.type as string
          const hostType = hostNode.type as string

          // Array to hold all edges to create for this docking
          const edgesToCreate: Array<{ source: string; sourceHandle: string; target: string; targetHandle: string; id: string }> = []

          // ToolCallRouter docking to Agent - create BOTH edges for bidirectional flow
          if (nodeType === 'tool-call-router' && hostType === 'agent') {
            // Create both edges regardless of which handle was used for docking
            edgesToCreate.push(
              {
                id: `docked-${nodeId}-${hostNodeId}-input`,
                source: hostNodeId,
                sourceHandle: 'ai-output',
                target: nodeId,
                targetHandle: 'ai-input'
              },
              {
                id: `docked-${nodeId}-${hostNodeId}-output`,
                source: nodeId,
                sourceHandle: 'toolResult',
                target: hostNodeId,
                targetHandle: 'toolResult'
              }
            )
          }
          // Memory docking to Agent
          else if (nodeType === 'memory' && hostType === 'agent' && handleId === 'memory') {
            edgesToCreate.push({
              id: `docked-${nodeId}-${hostNodeId}-${handleId}`,
              source: nodeId,
              sourceHandle: 'output',
              target: hostNodeId,
              targetHandle: 'memory'
            })
          }
          // Callback/Checkpoint docking to Agent/Guardrail/Prompt/ChatAgent's onCheckpoint
          else if ((nodeType === 'callback' || nodeType === 'checkpoint') &&
                   (hostType === 'agent' || hostType === 'guardrail' || hostType === 'prompt' || hostType === 'chat-agent') &&
                   handleId === 'onCheckpoint') {
            edgesToCreate.push({
              id: `docked-${nodeId}-${hostNodeId}-${handleId}`,
              source: hostNodeId,
              sourceHandle: 'onCheckpoint',
              target: nodeId,
              targetHandle: 'input'
            })
          }

          // Create all edges
          for (const edgeConnection of edgesToCreate) {
            // Check if edge already exists
            const existingEdge = state.edges.find(e =>
              e.source === edgeConnection.source &&
              e.sourceHandle === edgeConnection.sourceHandle &&
              e.target === edgeConnection.target &&
              e.targetHandle === edgeConnection.targetHandle
            )

            if (!existingEdge) {
              const newEdge: import('../modules/services/workflowTypes').WorkflowEdge = {
                id: edgeConnection.id,
                source: edgeConnection.source,
                sourceHandle: edgeConnection.sourceHandle,
                target: edgeConnection.target,
                targetHandle: edgeConnection.targetHandle,
              }
              state.edges.push(newEdge)

              if (state.workflowFile) {
                state.workflowFile.edges.push({ ...newEdge })
              }
            }
          }

          // Hide docked node off-canvas (all dockable nodes use preview)
          rfNode.hidden = true
          rfNode.width = 0
          rfNode.height = 0
          rfNode.position = { x: -9999, y: -9999 }
          rfNode.draggable = false  // Prevent dragging while docked

          console.log('[Docking] ✅ Docking complete! Node state:', {
            nodeId,
            type: rfNode.type,
            hidden: rfNode.hidden,
            dockedTo: (rfNode.data as BaseNodeData).dockedTo,
            position: rfNode.position
          })

          // Clear docking and drag state
          state.dockingState = null
          state.dragState = null
          state.isDirty = true
          return
        }

        // Clear docking state
        state.dockingState = null

        // Skip if this node IS a container
        if (CONTAINER_TYPES.includes(rfNode.type || '')) {
          return
        }

        const currentParentId = rfNode.parentId

        // Use mouse position for container detection if available
        // Mouse position is unclamped (not constrained by extent='parent')
        // This allows detection of when user drags outside a collapsed container
        let absolutePosition: { x: number; y: number }

        if (mousePosition) {
          // Mouse position is already in absolute flow coordinates
          absolutePosition = mousePosition
        } else if (currentParentId) {
          // Fall back to calculating from node position if mousePosition not available
          const currentParent = state.nodes.find(n => n.id === currentParentId)
          if (currentParent) {
            absolutePosition = {
              x: position.x + currentParent.position.x,
              y: position.y + currentParent.position.y,
            }
          } else {
            absolutePosition = position
          }
        } else {
          absolutePosition = position
        }

        // Find container at the absolute position (using mouse position), passing node type for filtering
        const containerId = findContainerAtPosition(state.nodes, absolutePosition, nodeId, rfNode.type)

        // Helper function to reorder node to be after its parent
        const reorderNodeAfterParent = (newParentId: string) => {
          // Re-find the node since we may have modified rfNode properties
          const currentNodeIndex = state.nodes.findIndex(n => n.id === nodeId)
          const parentIndex = state.nodes.findIndex(n => n.id === newParentId)

          if (parentIndex === -1 || currentNodeIndex === -1) return

          // Check if already in correct position (right after parent)
          if (currentNodeIndex === parentIndex + 1) return

          // Remove node from current position
          const [removedNode] = state.nodes.splice(currentNodeIndex, 1)
          // Find new parent index (may have shifted if node was before parent)
          const newParentIndex = state.nodes.findIndex(n => n.id === newParentId)
          // Insert after parent
          state.nodes.splice(newParentIndex + 1, 0, removedNode)
        }

        // Update parentId if changed
        if (containerId !== currentParentId) {
          // If entering a container from no parent
          if (containerId && !currentParentId) {
            const container = state.nodes.find(n => n.id === containerId)
            if (container) {
              // Convert to relative position within new container
              let relativePosition = {
                x: position.x - container.position.x,
                y: position.y - container.position.y,
              }

              // Ensure minimum spacing from top (60px) for menu visibility
              const MIN_TOP_SPACING = 60
              if (relativePosition.y < MIN_TOP_SPACING) {
                relativePosition.y = MIN_TOP_SPACING
              }

              // Ensure minimum spacing from left (20px)
              const MIN_LEFT_SPACING = 20
              if (relativePosition.x < MIN_LEFT_SPACING) {
                relativePosition.x = MIN_LEFT_SPACING
              }

              rfNode.parentId = containerId
              rfNode.extent = 'parent'
              rfNode.position = relativePosition
              rfNode.draggable = true  // Ensure child nodes are draggable within container

              // Set child visibility based on parent's collapsed state
              const containerData = container.data as BaseNodeData
              const isContainerCollapsed = Boolean(containerData.collapsed ?? false)
              rfNode.hidden = isContainerCollapsed

              if (fileNode) {
                fileNode.position = relativePosition
                fileNode.parentId = containerId
              }
              // Reorder nodes array so this node comes after its parent
              reorderNodeAfterParent(containerId)
              state.isDirty = true
            }
          }
          // If moving from one container to another
          else if (containerId && currentParentId) {
            const newContainer = state.nodes.find(n => n.id === containerId)
            if (newContainer) {
              // Convert absolute position to relative within new container
              let relativePosition = {
                x: absolutePosition.x - newContainer.position.x,
                y: absolutePosition.y - newContainer.position.y,
              }

              // Ensure minimum spacing from top (60px) for menu visibility
              const MIN_TOP_SPACING = 60
              if (relativePosition.y < MIN_TOP_SPACING) {
                relativePosition.y = MIN_TOP_SPACING
              }

              // Ensure minimum spacing from left (20px)
              const MIN_LEFT_SPACING = 20
              if (relativePosition.x < MIN_LEFT_SPACING) {
                relativePosition.x = MIN_LEFT_SPACING
              }

              rfNode.parentId = containerId
              rfNode.extent = 'parent'
              rfNode.position = relativePosition
              rfNode.draggable = true  // Ensure child nodes are draggable within container
              if (fileNode) {
                fileNode.position = relativePosition
                fileNode.parentId = containerId
              }
              // Reorder nodes array so this node comes after its new parent
              reorderNodeAfterParent(containerId)
              state.isDirty = true
            }
          }
          // If leaving a container to no parent
          else if (!containerId && currentParentId) {
            // Use absolute position as the new position
            rfNode.parentId = undefined
            rfNode.extent = undefined
            rfNode.position = absolutePosition
            rfNode.draggable = true  // Ensure draggable when leaving container
            if (fileNode) {
              fileNode.position = absolutePosition
              fileNode.parentId = undefined
            }
            state.isDirty = true
          }
        }

        // Clear drag state
        state.dragState = null
      })
    },

    // Add a new node
    addNode: (type, position) => {
      // Push history before making changes
      get().pushHistory()
      const newNode = createWorkflowNode(type, position)
      set(state => {
        // Check if dropping into a container (unless this IS a container)
        let parentId: string | undefined
        let adjustedPosition = position

        if (!CONTAINER_TYPES.includes(type)) {
          parentId = findContainerAtPosition(state.nodes, position) || undefined
          if (parentId) {
            // Convert to relative position
            const container = state.nodes.find(n => n.id === parentId)
            if (container) {
              adjustedPosition = {
                x: position.x - container.position.x,
                y: position.y - container.position.y,
              }

              // Ensure minimum spacing from top (60px) for menu visibility
              const MIN_TOP_SPACING = 60
              if (adjustedPosition.y < MIN_TOP_SPACING) {
                adjustedPosition.y = MIN_TOP_SPACING
              }

              // Ensure minimum spacing from left (20px)
              const MIN_LEFT_SPACING = 20
              if (adjustedPosition.x < MIN_LEFT_SPACING) {
                adjustedPosition.x = MIN_LEFT_SPACING
              }
            }
          }
        }

        // Update node with parent info
        newNode.position = adjustedPosition
        newNode.parentId = parentId

        // Add to workflow file
        if (state.workflowFile) {
          state.workflowFile.nodes.push(newNode)
        }

        // Check if parent is collapsed to set initial child visibility
        let isParentCollapsed = false
        if (parentId) {
          const parent = state.nodes.find(n => n.id === parentId)
          if (parent) {
            isParentCollapsed = Boolean((parent.data as BaseNodeData)?.collapsed ?? false)
          }
        }

        // Add to React Flow nodes
        const rfNode: WorkflowCanvasNode = {
          id: newNode.id,
          type: newNode.type,
          position: adjustedPosition,
          data: newNode.data,
          parentId,
          extent: parentId ? 'parent' : undefined,
          hidden: isParentCollapsed,  // Hide if parent is collapsed
          draggable: !isParentCollapsed,  // Only draggable if parent is expanded (or no parent)
        }

        // Set dimensions for container nodes
        if (newNode.width) {
          rfNode.width = newNode.width
        }
        if (newNode.height) {
          rfNode.height = newNode.height
        }

        // CRITICAL: React Flow requires parent nodes to appear BEFORE their children in the array
        // If this node has a parent, insert it after the parent rather than at the end
        if (parentId) {
          const parentIndex = state.nodes.findIndex(n => n.id === parentId)
          if (parentIndex !== -1) {
            // Insert after the parent node
            state.nodes.splice(parentIndex + 1, 0, rfNode)
          } else {
            // Fallback: parent not found, add at end
            state.nodes.push(rfNode)
          }
        } else {
          // No parent, add at end (or beginning for containers to keep them grouped)
          state.nodes.push(rfNode)
        }

        state.isDirty = true
        state.selectedNodeId = newNode.id
      })
      return newNode.id
    },

    // Update node data
    updateNodeData: (nodeId, data) => {
      // Push history before making changes
      get().pushHistory()
      set(state => {
        // Update in workflow file
        const fileNode = state.workflowFile?.nodes.find(n => n.id === nodeId)
        if (fileNode) {
          Object.assign(fileNode.data, data)
        }

        // If this is a container node and collapsed state changed, update child visibility
        if ('collapsed' in data) {
          const rfNode = state.nodes.find(n => n.id === nodeId)
          if (rfNode && CONTAINER_TYPES.includes(rfNode.type || '')) {
            const isCollapsed = data.collapsed as boolean
            const childIds = new Set(state.nodes.filter(n => n.parentId === nodeId).map(n => n.id))
            const nodeData = rfNode.data as BaseNodeData
            const isDocked = !!nodeData.dockedTo

            // Store current dimensions before collapsing (so we can restore on expand)
            // Get the current node to save/restore dimensions
            const currentNode = state.nodes.find(n => n.id === nodeId)
            const savedWidth = currentNode?.width
            const savedHeight = currentNode?.height

            // Collapsed dimensions for container nodes
            const COLLAPSED_WIDTH = 180
            const COLLAPSED_HEIGHT = 120 // Approximate height for collapsed view with metadata

            // Update ALL nodes - container gets new data, children get hidden state
            // Creating new objects for all affected nodes to trigger React Flow re-render
            // IMPORTANT: Create a completely new array reference to force React Flow to re-render
            const newNodes = state.nodes.map(node => {
              if (node.id === nodeId) {
                // Update container node with new data and dimensions
                // When collapsing: set to collapsed dimensions
                // When expanding: restore to saved dimensions or defaults
                const newNode = {
                  ...node,
                  data: {
                    ...node.data,
                    ...data,
                    // Save the expanded dimensions when collapsing
                    ...(isCollapsed && savedWidth ? { _savedWidth: savedWidth } : {}),
                    ...(isCollapsed && savedHeight ? { _savedHeight: savedHeight } : {}),
                  },
                }

                if (isCollapsed) {
                  // Set to collapsed size
                  newNode.width = COLLAPSED_WIDTH
                  newNode.height = COLLAPSED_HEIGHT
                } else {
                  // Restore to saved dimensions or remove to let node auto-size
                  const savedW = (node.data as Record<string, unknown>)?._savedWidth as number | undefined
                  const savedH = (node.data as Record<string, unknown>)?._savedHeight as number | undefined
                  if (savedW) newNode.width = savedW
                  else delete newNode.width
                  if (savedH) newNode.height = savedH
                  else delete newNode.height
                }

                return newNode
              }
              if (node.parentId === nodeId) {
                // Update child visibility and ensure draggable when expanded
                return {
                  ...node,
                  hidden: isCollapsed,
                  draggable: !isCollapsed, // Children are draggable when container is expanded
                }
              }
              return node
            })
            state.nodes = newNodes

            // Update edge visibility based on collapsed state
            // CRITICAL: Create new edge objects for ALL internal edges to force React Flow
            // to recalculate edge paths when nodes become visible/hidden
            const newEdges = state.edges.map(edge => {
              const isInternalEdge =
                // Edge connects to/from a child node
                childIds.has(edge.source) ||
                childIds.has(edge.target) ||
                // Edge connects from container's internal start handle
                (edge.source === nodeId && INTERNAL_HANDLES.includes(edge.sourceHandle || '')) ||
                // Edge connects to container's internal end handle
                (edge.target === nodeId && INTERNAL_HANDLES.includes(edge.targetHandle || ''))

              if (isInternalEdge) {
                // Return a new edge object with updated hidden state
                // Force React Flow to recalculate by creating completely new object
                return {
                  ...edge,
                  hidden: isCollapsed,
                  // Add a timestamp to force React Flow to recognize this as a "new" edge
                  // This helps trigger edge path recalculation
                  data: { ...edge.data, _lastUpdated: Date.now() },
                }
              }
              return edge
            })
            state.edges = newEdges

            // Handle docked node visibility/positioning when collapsed state changes
            if (isDocked && nodeData.dockedTo) {
              const hostNodeId = nodeData.dockedTo.nodeId
              const handleId = nodeData.dockedTo.handleId
              const hostNode = state.nodes.find(n => n.id === hostNodeId)

              // Update nodes array with new positions for docked node
              state.nodes = state.nodes.map(node => {
                if (node.id === nodeId) {
                  if (isCollapsed) {
                    // Collapsing: Hide at -9999, -9999 (docked state)
                    return {
                      ...node,
                      hidden: true,
                      draggable: false, // Prevent dragging while docked and collapsed
                      position: { x: -9999, y: -9999 }
                    }
                  } else {
                    // Expanding: Position near host and make visible
                    if (hostNode) {
                      const handleConfig = DOCKABLE_HANDLES.find(
                        h => h.nodeType === hostNode.type && h.handleId === handleId
                      )

                      if (handleConfig) {
                        const hostWidth = (hostNode.width as number) || 200
                        const hostHeight = (hostNode.height as number) || 160
                        const spacing = 20

                        let dockX: number
                        let dockY: number

                        if (handleConfig.position.side === 'left') {
                          dockX = hostNode.position.x - (node.width as number || 300) - spacing
                          dockY = hostNode.position.y
                        } else if (handleConfig.position.side === 'right') {
                          dockX = hostNode.position.x + hostWidth + spacing
                          dockY = hostNode.position.y
                        } else { // bottom
                          dockX = hostNode.position.x
                          dockY = hostNode.position.y + hostHeight + spacing
                        }

                        return {
                          ...node,
                          hidden: false,
                          draggable: true, // Make docked container draggable when expanded
                          position: { x: dockX, y: dockY }
                        }
                      }
                    }
                    return { ...node, hidden: false }
                  }
                }
                return node
              })
            }

            state.isDirty = true
            return // Exit early since we handled all updates
          }
        }

        // Standard node data update (non-container or non-collapse change)
        state.nodes = state.nodes.map(node => {
          if (node.id === nodeId) {
            const newData = { ...node.data, ...data }
            // If locked property changed, also update draggable state
            const isLocked = 'locked' in data ? data.locked : node.data?.locked
            return {
              ...node,
              data: newData,
              draggable: !isLocked,
            }
          }
          return node
        })
        state.isDirty = true
      })
    },

    // Delete a node
    deleteNode: (nodeId) => {
      // Push history before making changes
      get().pushHistory()
      set(state => {
        // Remove from workflow file
        if (state.workflowFile) {
          state.workflowFile.nodes = state.workflowFile.nodes.filter(n => n.id !== nodeId)
          state.workflowFile.edges = state.workflowFile.edges.filter(
            e => e.source !== nodeId && e.target !== nodeId
          )
        }
        // Remove from React Flow
        state.nodes = state.nodes.filter(n => n.id !== nodeId)
        state.edges = state.edges.filter(e => e.source !== nodeId && e.target !== nodeId)

        if (state.selectedNodeId === nodeId) {
          state.selectedNodeId = null
        }
        state.isDirty = true
      })
    },

    // Duplicate a node (creates copy at offset position)
    duplicateNode: (nodeId) => {
      const state = get()
      const sourceNode = state.nodes.find(n => n.id === nodeId)
      if (!sourceNode) return null

      // Push history before making changes
      get().pushHistory()

      // Generate new ID
      const newId = `${sourceNode.type}-${Date.now()}`

      // Clone node data
      const newNodeData = JSON.parse(JSON.stringify(sourceNode.data))
      // Update label to indicate it's a copy
      if (newNodeData.label) {
        newNodeData.label = `${newNodeData.label} (copy)`
      }

      // Create new node at offset position
      const newNode: WorkflowCanvasNode = {
        ...sourceNode,
        id: newId,
        position: {
          x: sourceNode.position.x + 50,
          y: sourceNode.position.y + 50,
        },
        data: newNodeData,
        selected: false,
      }

      // Also add to workflow file
      const workflowNode: WorkflowNode = {
        id: newId,
        type: sourceNode.type as WorkflowNodeType,
        position: newNode.position,
        data: newNodeData,
      }

      set(state => {
        state.nodes.push(newNode)
        if (state.workflowFile) {
          state.workflowFile.nodes.push(workflowNode)
        }
        state.selectedNodeId = newId
        state.isDirty = true
      })

      return newId
    },

    // Copy a node to clipboard
    copyNode: (nodeId) => {
      const state = get()
      const node = state.nodes.find(n => n.id === nodeId)
      if (!node) return

      // Clone the node
      const nodeCopy = JSON.parse(JSON.stringify(node))

      // Find edges connected to this node (for context, not for pasting)
      const connectedEdges = state.edges.filter(
        e => e.source === nodeId || e.target === nodeId
      )
      const edgesCopy = JSON.parse(JSON.stringify(connectedEdges))

      set(state => {
        state.clipboard = { node: nodeCopy, edges: edgesCopy }
      })
    },

    // Paste node from clipboard at specified position
    pasteNode: (position) => {
      const state = get()
      if (!state.clipboard) return null

      // Push history before making changes
      get().pushHistory()

      const sourceNode = state.clipboard.node

      // Generate new ID
      const newId = `${sourceNode.type}-${Date.now()}`

      // Clone node data
      const newNodeData = JSON.parse(JSON.stringify(sourceNode.data))
      // Update label to indicate it's a paste
      if (newNodeData.label) {
        newNodeData.label = `${newNodeData.label} (copy)`
      }

      // Create new node at specified position
      const newNode: WorkflowCanvasNode = {
        ...sourceNode,
        id: newId,
        position,
        data: newNodeData,
        selected: false,
        // Remove parent relationship when pasting (paste outside containers)
        parentId: undefined,
        extent: undefined,
      }

      // Also add to workflow file
      const workflowNode: WorkflowNode = {
        id: newId,
        type: sourceNode.type as WorkflowNodeType,
        position,
        data: newNodeData,
      }

      set(state => {
        state.nodes.push(newNode)
        if (state.workflowFile) {
          state.workflowFile.nodes.push(workflowNode)
        }
        state.selectedNodeId = newId
        state.isDirty = true
      })

      return newId
    },

    // Cut a node (copy + delete)
    cutNode: (nodeId) => {
      const state = get()
      const node = state.nodes.find(n => n.id === nodeId)
      if (!node) return

      // Copy to clipboard
      get().copyNode(nodeId)

      // Delete the node
      get().deleteNode(nodeId)
    },

    // Toggle node disabled state
    toggleNodeDisabled: (nodeId) => {
      // Push history before making changes
      get().pushHistory()

      set(state => {
        const node = state.nodes.find(n => n.id === nodeId)
        if (node) {
          const currentDisabled = (node.data as BaseNodeData).disabled ?? false
          ;(node.data as BaseNodeData).disabled = !currentDisabled
          state.isDirty = true
        }

        // Also update in workflow file
        if (state.workflowFile) {
          const workflowNode = state.workflowFile.nodes.find(n => n.id === nodeId)
          if (workflowNode) {
            const currentDisabled = (workflowNode.data as BaseNodeData).disabled ?? false
            ;(workflowNode.data as BaseNodeData).disabled = !currentDisabled
          }
        }
      })
    },

    // Show context menu
    showContextMenu: (type, position, nodeId, edgeId) => {
      set(state => {
        state.contextMenu = { type, position, nodeId, edgeId }
      })
    },

    // Hide context menu
    hideContextMenu: () => {
      set(state => {
        state.contextMenu = null
      })
    },

    // Eject all child nodes from a container (used when switching parallel modes)
    ejectChildNodes: (containerId) => {
      // Push history before making changes
      get().pushHistory()
      set(state => {
        const container = state.nodes.find(n => n.id === containerId)
        if (!container) return

        // Find all child nodes
        const childNodes = state.nodes.filter(n => n.parentId === containerId)
        if (childNodes.length === 0) return

        // Eject each child to absolute position
        state.nodes = state.nodes.map(node => {
          if (node.parentId === containerId) {
            // Convert relative position to absolute
            const absolutePosition = {
              x: node.position.x + container.position.x,
              y: node.position.y + container.position.y,
            }
            return {
              ...node,
              parentId: undefined,
              extent: undefined,
              position: absolutePosition,
              hidden: false, // Make sure they're visible
            }
          }
          return node
        })

        // Update workflow file nodes
        if (state.workflowFile) {
          for (const childNode of childNodes) {
            const fileNode = state.workflowFile.nodes.find(n => n.id === childNode.id)
            if (fileNode) {
              fileNode.parentId = undefined
              fileNode.position = {
                x: childNode.position.x + container.position.x,
                y: childNode.position.y + container.position.y,
              }
            }
          }
        }

        state.isDirty = true
      })
    },

    // =========================================================================
    // Node Docking Operations
    // =========================================================================

    // Dock a node to a host node's handle (node becomes a mini preview attached to handle)
    dockNode: (nodeId, hostNodeId, handleId) => {
      console.log('[dockNode] Called with:', { nodeId, hostNodeId, handleId })
      get().pushHistory()
      set(state => {
        const nodeIndex = state.nodes.findIndex(n => n.id === nodeId)
        if (nodeIndex === -1) {
          console.log('[dockNode] ❌ Node not found:', nodeId)
          return
        }

        const rfNode = state.nodes[nodeIndex]
        const hostNode = state.nodes.find(n => n.id === hostNodeId)
        if (!hostNode) {
          console.log('[dockNode] ❌ Host node not found:', hostNodeId)
          return
        }
        console.log('[dockNode] ⚓ Docking', rfNode.type, 'to', hostNode.type)

        // Save original dimensions and position before docking
        const nodeData = rfNode.data as import('../modules/services/workflowTypes').BaseNodeData
        nodeData._preDockWidth = rfNode.width as number | undefined
        nodeData._preDockHeight = rfNode.height as number | undefined
        nodeData._preDockPosition = { ...rfNode.position }

        // Set docking configuration on the node
        nodeData.dockedTo = { nodeId: hostNodeId, handleId }

        // Create edge connection based on the docking relationship
        // Determine which edge to create based on handle types and node types
        const edgeId = `docked-${nodeId}-${hostNodeId}-${handleId}`

        // Mapping for determining edge connections based on node types and handles
        const getEdgeConnection = (
          hostType: string,
          hostHandle: string,
          dockedType: string
        ): { source: string; sourceHandle: string; target: string; targetHandle: string } | null => {
          // ToolCallRouter docking to Agent
          if (dockedType === 'tool-call-router' && hostType === 'agent') {
            if (hostHandle === 'ai-output') {
              // Agent sends AI output to ToolCallRouter
              return { source: hostNodeId, sourceHandle: 'ai-output', target: nodeId, targetHandle: 'ai-input' }
            } else if (hostHandle === 'toolResult') {
              // ToolCallRouter sends results back to Agent
              return { source: nodeId, sourceHandle: 'toolResult', target: hostNodeId, targetHandle: 'toolResult' }
            }
          }

          // Memory docking to Agent
          if (dockedType === 'memory' && hostType === 'agent' && hostHandle === 'memory') {
            return { source: nodeId, sourceHandle: 'output', target: hostNodeId, targetHandle: 'memory' }
          }

          // Callback/Checkpoint docking to Agent/Guardrail/Prompt/ChatAgent's onCheckpoint
          if ((dockedType === 'callback' || dockedType === 'checkpoint') &&
              (hostType === 'agent' || hostType === 'guardrail' || hostType === 'prompt' || hostType === 'chat-agent') &&
              hostHandle === 'onCheckpoint') {
            return { source: hostNodeId, sourceHandle: 'onCheckpoint', target: nodeId, targetHandle: 'input' }
          }

          // Add more mappings as needed for other docking relationships

          return null
        }

        const edgeConnection = getEdgeConnection(hostNode.type as string, handleId, rfNode.type as string)

        if (edgeConnection) {
          // Check if edge already exists
          const existingEdge = state.edges.find(e =>
            e.source === edgeConnection.source &&
            e.sourceHandle === edgeConnection.sourceHandle &&
            e.target === edgeConnection.target &&
            e.targetHandle === edgeConnection.targetHandle
          )

          if (!existingEdge) {
            // Create new edge
            const newEdge: import('../modules/services/workflowTypes').WorkflowEdge = {
              id: edgeId,
              source: edgeConnection.source,
              sourceHandle: edgeConnection.sourceHandle,
              target: edgeConnection.target,
              targetHandle: edgeConnection.targetHandle,
            }
            state.edges.push(newEdge)

            // Add to workflow file edges as well
            if (state.workflowFile) {
              state.workflowFile.edges.push({ ...newEdge })
            }
          }
        }

        // Hide the node and minimize its dimensions to remove interaction area
        rfNode.hidden = true
        rfNode.width = 0
        rfNode.height = 0
        rfNode.position = { x: -9999, y: -9999 }

        // Update workflow file
        if (state.workflowFile) {
          const fileNode = state.workflowFile.nodes.find(n => n.id === nodeId)
          if (fileNode) {
            const fileNodeData = fileNode.data as import('../modules/services/workflowTypes').BaseNodeData
            fileNodeData._preDockWidth = nodeData._preDockWidth
            fileNodeData._preDockHeight = nodeData._preDockHeight
            fileNodeData._preDockPosition = nodeData._preDockPosition
            fileNodeData.dockedTo = { nodeId: hostNodeId, handleId }
          }
        }

        console.log('[dockNode] ✅ Docking complete!', {
          nodeId,
          type: rfNode.type,
          hidden: rfNode.hidden,
          dockedTo: nodeData.dockedTo,
          position: rfNode.position
        })

        // Clear docking state
        state.dockingState = null
        state.isDirty = true
      })
    },

    // Undock a node from its host (node becomes normal canvas node again)
    undockNode: (nodeId) => {
      get().pushHistory()
      set(state => {
        const nodeIndex = state.nodes.findIndex(n => n.id === nodeId)
        if (nodeIndex === -1) return

        const rfNode = state.nodes[nodeIndex]
        const nodeData = rfNode.data as import('../modules/services/workflowTypes').BaseNodeData

        if (!nodeData.dockedTo) return

        // Find the host node to calculate a good undock position
        const hostNode = state.nodes.find(n => n.id === nodeData.dockedTo?.nodeId)

        // Restore original position or calculate new position near host
        if (nodeData._preDockPosition) {
          rfNode.position = { ...nodeData._preDockPosition }
        } else if (hostNode) {
          // Position the node near the host node
          rfNode.position = {
            x: hostNode.position.x + (hostNode.width || 200) + 50,
            y: hostNode.position.y,
          }
        }

        // Restore original dimensions
        if (nodeData._preDockWidth !== undefined) {
          rfNode.width = nodeData._preDockWidth
        }
        if (nodeData._preDockHeight !== undefined) {
          rfNode.height = nodeData._preDockHeight
        }

        // Remove docking edges (edges created when docking)
        const hostNodeId = nodeData.dockedTo.nodeId
        const handleId = nodeData.dockedTo.handleId
        const edgeId = `docked-${nodeId}-${hostNodeId}-${handleId}`

        // Remove edge from state.edges
        // Remove any docking edges (edges with IDs starting with 'docked-') between these two nodes
        state.edges = state.edges.filter(e => {
          // Check if this is a docking edge by ID pattern
          const isDockingEdge = e.id.startsWith('docked-')
          if (isDockingEdge) {
            // Remove if it connects these two nodes in either direction
            return !((e.source === nodeId && e.target === hostNodeId) || (e.source === hostNodeId && e.target === nodeId))
          }
          return true
        })

        // Remove edge from workflow file
        if (state.workflowFile) {
          state.workflowFile.edges = state.workflowFile.edges.filter(e => {
            const isDockingEdge = e.id.startsWith('docked-')
            if (isDockingEdge) {
              return !((e.source === nodeId && e.target === hostNodeId) || (e.source === hostNodeId && e.target === nodeId))
            }
            return true
          })
        }

        // Clear docking configuration and saved dimensions
        delete nodeData.dockedTo
        delete nodeData._preDockWidth
        delete nodeData._preDockHeight
        delete nodeData._preDockPosition

        // Show the node on the canvas and restore draggability
        rfNode.hidden = false
        rfNode.draggable = true

        // Update workflow file
        if (state.workflowFile) {
          const fileNode = state.workflowFile.nodes.find(n => n.id === nodeId)
          if (fileNode) {
            const fileNodeData = fileNode.data as import('../modules/services/workflowTypes').BaseNodeData
            delete fileNodeData.dockedTo
            delete fileNodeData._preDockWidth
            delete fileNodeData._preDockHeight
            delete fileNodeData._preDockPosition
            // Sync file position with rfNode position
            fileNode.position = { ...rfNode.position }
          }
        }

        state.isDirty = true
      })
    },

    // Set the current docking target during drag (for visual feedback)
    setDockingTarget: (target) => {
      set(state => {
        if (target) {
          state.dockingState = {
            draggingNodeId: state.dragState?.draggingNodeId || null,
            hoveredDockTarget: target,
            snapThreshold: DEFAULT_SNAP_THRESHOLD,
          }
        } else {
          state.dockingState = null
        }
      })
    },

    // Handle React Flow edge changes
    onEdgesChange: (changes) => {
      set(state => {
        // Sync edge removals to workflowFile and clear condition targets
        const removals = changes.filter(c => c.type === 'remove')
        if (removals.length > 0) {
          const removedIds = new Set(removals.map(c => c.id))

          // Clear condition targets for removed edges
          for (const removal of removals) {
            const edge = state.edges.find(e => e.id === removal.id)
            if (edge) {
              const isConditionEdge =
                edge.sourceHandle?.startsWith('condition-') ||
                edge.sourceHandle === 'default'

              if (isConditionEdge) {
                const sourceNode = state.nodes.find(n => n.id === edge.source)
                if (sourceNode && sourceNode.type === 'condition') {
                  if (edge.sourceHandle === 'default') {
                    sourceNode.data = { ...sourceNode.data, default: undefined }
                    const fileNode = state.workflowFile?.nodes.find(n => n.id === edge.source)
                    if (fileNode) {
                      fileNode.data = { ...fileNode.data, default: undefined }
                    }
                  } else if (edge.sourceHandle?.startsWith('condition-')) {
                    const conditionId = edge.sourceHandle.replace('condition-', '')
                    const conditionData = sourceNode.data as { conditions?: Array<{ id: string; target?: string }> }
                    const updatedConditions = (conditionData.conditions || []).map(c =>
                      c.id === conditionId ? { ...c, target: undefined } : c
                    )
                    sourceNode.data = { ...sourceNode.data, conditions: updatedConditions }
                    const fileNode = state.workflowFile?.nodes.find(n => n.id === edge.source)
                    if (fileNode && 'conditions' in fileNode.data) {
                      const fileConditions = (fileNode.data as { conditions: Array<{ id: string; target?: string }> }).conditions
                      const idx = fileConditions.findIndex(c => c.id === conditionId)
                      if (idx >= 0) {
                        fileConditions[idx] = { ...fileConditions[idx], target: undefined }
                      }
                    }
                  }
                }
              }
            }
          }

          if (state.workflowFile) {
            state.workflowFile.edges = state.workflowFile.edges.filter(e => !removedIds.has(e.id))
          }
          // Clear selection if deleted edge was selected
          if (state.selectedEdgeId && removedIds.has(state.selectedEdgeId)) {
            state.selectedEdgeId = null
          }
        }

        state.edges = applyEdgeChanges(changes, state.edges) as WorkflowCanvasEdge[]
        state.isDirty = true
      })
    },

    // Handle new connection
    onConnect: (connection) => {
      if (!connection.source || !connection.target) return

      // Push history before making changes
      get().pushHistory()
      set(state => {
        // Determine if edge should be animated based on source handle
        const animated = shouldEdgeBeAnimated(connection.sourceHandle) ||
          shouldEdgeBeAnimated(connection.targetHandle)

        // Check if this is a condition branch edge for data updates
        const isConditionEdge =
          connection.sourceHandle?.startsWith('condition-') ||
          connection.sourceHandle === 'default'

        const newEdge: WorkflowCanvasEdge = {
          id: `e-${connection.source}-${connection.target}-${Date.now()}`,
          source: connection.source,
          target: connection.target,
          sourceHandle: connection.sourceHandle || 'output',
          targetHandle: connection.targetHandle || 'input',
          animated,
        }

        state.edges = addEdge(newEdge, state.edges) as WorkflowCanvasEdge[]

        // Add to workflow file (now using standard edge format)
        if (state.workflowFile) {
          state.workflowFile.edges.push({
            id: newEdge.id,
            source: connection.source,
            target: connection.target,
            sourceHandle: connection.sourceHandle || 'output',
            targetHandle: connection.targetHandle || 'input',
            animated,
          })
        }

        // Update condition node data when connecting from condition handles
        if (isConditionEdge) {
          const sourceNode = state.nodes.find(n => n.id === connection.source)
          if (sourceNode && sourceNode.type === 'condition') {
            const conditionData = sourceNode.data as { conditions?: Array<{ id: string; target?: string }>; default?: string }

            if (connection.sourceHandle === 'default') {
              // Update default target
              sourceNode.data = { ...sourceNode.data, default: connection.target }
              // Also update in workflow file
              const fileNode = state.workflowFile?.nodes.find(n => n.id === connection.source)
              if (fileNode) {
                fileNode.data = { ...fileNode.data, default: connection.target }
              }
            } else if (connection.sourceHandle?.startsWith('condition-')) {
              // Update specific condition's target
              const conditionId = connection.sourceHandle.replace('condition-', '')
              const updatedConditions = (conditionData.conditions || []).map(c =>
                c.id === conditionId ? { ...c, target: connection.target } : c
              )
              sourceNode.data = { ...sourceNode.data, conditions: updatedConditions }
              // Also update in workflow file
              const fileNode = state.workflowFile?.nodes.find(n => n.id === connection.source)
              if (fileNode && 'conditions' in fileNode.data) {
                const fileConditions = (fileNode.data as { conditions: Array<{ id: string; target?: string }> }).conditions
                const idx = fileConditions.findIndex(c => c.id === conditionId)
                if (idx >= 0) {
                  fileConditions[idx] = { ...fileConditions[idx], target: connection.target }
                }
              }
            }
          }
        }

        state.isDirty = true
      })
    },

    // Delete an edge
    deleteEdge: (edgeId) => {
      // Push history before making changes
      get().pushHistory()
      set(state => {
        // Find the edge before deleting to clear condition targets if needed
        const edge = state.edges.find(e => e.id === edgeId)
        if (edge) {
          const isConditionEdge =
            edge.sourceHandle?.startsWith('condition-') ||
            edge.sourceHandle === 'default'

          // Clear condition target when edge is deleted
          if (isConditionEdge) {
            const sourceNode = state.nodes.find(n => n.id === edge.source)
            if (sourceNode && sourceNode.type === 'condition') {
              if (edge.sourceHandle === 'default') {
                sourceNode.data = { ...sourceNode.data, default: undefined }
                const fileNode = state.workflowFile?.nodes.find(n => n.id === edge.source)
                if (fileNode) {
                  fileNode.data = { ...fileNode.data, default: undefined }
                }
              } else if (edge.sourceHandle?.startsWith('condition-')) {
                const conditionId = edge.sourceHandle.replace('condition-', '')
                const conditionData = sourceNode.data as { conditions?: Array<{ id: string; target?: string }> }
                const updatedConditions = (conditionData.conditions || []).map(c =>
                  c.id === conditionId ? { ...c, target: undefined } : c
                )
                sourceNode.data = { ...sourceNode.data, conditions: updatedConditions }
                const fileNode = state.workflowFile?.nodes.find(n => n.id === edge.source)
                if (fileNode && 'conditions' in fileNode.data) {
                  const fileConditions = (fileNode.data as { conditions: Array<{ id: string; target?: string }> }).conditions
                  const idx = fileConditions.findIndex(c => c.id === conditionId)
                  if (idx >= 0) {
                    fileConditions[idx] = { ...fileConditions[idx], target: undefined }
                  }
                }
              }
            }
          }
        }

        state.edges = state.edges.filter(e => e.id !== edgeId)
        if (state.workflowFile) {
          state.workflowFile.edges = state.workflowFile.edges.filter(e => e.id !== edgeId)
        }
        if (state.selectedEdgeId === edgeId) {
          state.selectedEdgeId = null
        }
        state.isDirty = true
      })
    },

    // Selection
    selectNode: (nodeId) => {
      set(state => {
        state.selectedNodeId = nodeId
        state.selectedEdgeId = null
      })
    },

    selectEdge: (edgeId) => {
      set(state => {
        state.selectedEdgeId = edgeId
        state.selectedNodeId = null
      })
    },

    // Execution state management
    setExecutionState: (executionState) => {
      set(state => {
        state.executionState = executionState
        // isExecuting is true for both running and paused (paused = still in the middle of execution)
        state.isExecuting = executionState?.status === 'running' || executionState?.status === 'paused'
      })
    },

    updateNodeExecutionStatus: (nodeId, status, output) => {
      set(state => {
        if (state.executionState) {
          state.executionState.nodeStates[nodeId] = {
            ...state.executionState.nodeStates[nodeId],
            nodeId,
            status,
            output,
            retryCount: state.executionState.nodeStates[nodeId]?.retryCount || 0,
          }
          if (output !== undefined) {
            state.executionState.nodeOutputs[nodeId] = output
          }
          state.executionState.currentNodeId = status === 'running' ? nodeId : state.executionState.currentNodeId
        }
      })
    },

    setExecutionResult: (result) => {
      set(state => {
        state.executionResult = result
      })
    },

    setCheckpoints: (checkpoints) => {
      set(state => {
        state.checkpoints = checkpoints
      })
    },

    setPromptsSent: (prompts) => {
      set(state => {
        state.promptsSent = prompts
      })
    },

    clearExecutionState: () => {
      set(state => {
        state.executionResult = null
        state.checkpoints = []
        state.promptsSent = []
        state.executionState = null
      })
    },

    loadExecutionFromHistory: (id) => {
      const state = get()
      const entry = state.executionHistory.find(e => e.id === id)
      if (entry) {
        set(draft => {
          draft.executionResult = entry.result
          draft.checkpoints = entry.checkpoints
          draft.promptsSent = entry.promptsSent
        })
      }
    },

    clearExecutionHistory: () => {
      set(state => {
        state.executionHistory = []
      })
    },

    // UI toggles
    toggleMinimap: () => {
      set(state => {
        state.showMinimap = !state.showMinimap
      })
    },

    toggleGrid: () => {
      set(state => {
        state.showGrid = !state.showGrid
      })
    },

    setToolbarDockPosition: (position: 'top' | 'bottom' | 'left' | 'right') => {
      set(state => {
        state.toolbarDockPosition = position
      })
    },

    setDirty: (dirty) => {
      set(state => {
        state.isDirty = dirty
      })
    },

    // ========================================================================
    // Connection Management (External Services)
    // ========================================================================

    /**
     * Add a new connection
     */
    addConnection: (connection) => {
      const id = `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      set(state => {
        state.connections.push({
          ...connection,
          id,
        })
        state.isDirty = true
      })
      return id
    },

    /**
     * Update an existing connection
     */
    updateConnection: (connectionId, updates) => {
      set(state => {
        const index = state.connections.findIndex(c => c.id === connectionId)
        if (index !== -1) {
          state.connections[index] = {
            ...state.connections[index],
            ...updates,
          }
          state.isDirty = true
        }
      })
    },

    /**
     * Delete a connection
     */
    deleteConnection: (connectionId) => {
      set(state => {
        state.connections = state.connections.filter(c => c.id !== connectionId)
        state.isDirty = true
      })
    },

    /**
     * Update connection status (for live status indicators)
     */
    updateConnectionStatus: (connectionId, status, error) => {
      set(state => {
        const connection = state.connections.find(c => c.id === connectionId)
        if (connection) {
          connection.status = status
          if (error !== undefined) {
            connection.lastError = error
          }
          if (status === 'connected') {
            connection.lastConnected = Date.now()
          }
        }
      })
    },

    // ========================================================================
    // Custom Commands Management (User-Defined Shell Commands)
    // ========================================================================

    /**
     * Add a new custom command to the allowed list
     */
    addCustomCommand: (command) => {
      const id = `cmd-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      set(state => {
        state.customCommands.push({
          ...command,
          id,
          addedAt: Date.now(),
        })
        state.isDirty = true
      })
      return id
    },

    /**
     * Update an existing custom command
     */
    updateCustomCommand: (commandId, updates) => {
      set(state => {
        const index = state.customCommands.findIndex(c => c.id === commandId)
        if (index !== -1) {
          state.customCommands[index] = {
            ...state.customCommands[index],
            ...updates,
          }
          state.isDirty = true
        }
      })
    },

    /**
     * Delete a custom command
     */
    deleteCustomCommand: (commandId) => {
      set(state => {
        state.customCommands = state.customCommands.filter(c => c.id !== commandId)
        state.isDirty = true
      })
    },

    // ========================================================================
    // Undo/Redo Implementation
    // ========================================================================

    /**
     * Push current state onto history stack.
     * Call this BEFORE making changes when you want undo support.
     * Debounced to avoid spam during rapid changes (like dragging).
     */
    pushHistory: () => {
      const state = get()
      const now = Date.now()

      // Debounce rapid changes
      if (now - state.lastHistoryTimestamp < HISTORY_DEBOUNCE_MS) {
        return
      }

      set(draft => {
        // If we're not at the end of history, truncate forward history
        if (draft.historyIndex < draft.history.length - 1) {
          draft.history = draft.history.slice(0, draft.historyIndex + 1)
        }

        // Push new snapshot
        const snapshot: HistorySnapshot = {
          workflowFile: cloneWorkflowFile(draft.workflowFile),
          nodes: cloneNodes(draft.nodes),
          edges: cloneEdges(draft.edges),
          timestamp: now,
        }
        draft.history.push(snapshot)

        // Trim history if too large
        if (draft.history.length > MAX_HISTORY_SIZE) {
          draft.history = draft.history.slice(-MAX_HISTORY_SIZE)
        }

        draft.historyIndex = draft.history.length - 1
        draft.lastHistoryTimestamp = now
      })
    },

    /**
     * Undo the last change by restoring the previous history state
     */
    undo: () => {
      const state = get()
      if (state.historyIndex <= 0) {
        console.log('[workflowStore] Cannot undo - at beginning of history')
        return
      }

      set(draft => {
        // Move back in history
        draft.historyIndex -= 1
        const snapshot = draft.history[draft.historyIndex]

        if (snapshot) {
          // Restore state from snapshot
          draft.workflowFile = cloneWorkflowFile(snapshot.workflowFile)
          draft.nodes = cloneNodes(snapshot.nodes)
          draft.edges = cloneEdges(snapshot.edges)
          draft.isDirty = true
          // Clear selection to avoid stale references
          draft.selectedNodeId = null
          draft.selectedEdgeId = null

          console.log(`[workflowStore] Undo: restored to history index ${draft.historyIndex}`)
        }
      })
    },

    /**
     * Redo the last undone change by restoring the next history state
     */
    redo: () => {
      const state = get()
      if (state.historyIndex >= state.history.length - 1) {
        console.log('[workflowStore] Cannot redo - at end of history')
        return
      }

      set(draft => {
        // Move forward in history
        draft.historyIndex += 1
        const snapshot = draft.history[draft.historyIndex]

        if (snapshot) {
          // Restore state from snapshot
          draft.workflowFile = cloneWorkflowFile(snapshot.workflowFile)
          draft.nodes = cloneNodes(snapshot.nodes)
          draft.edges = cloneEdges(snapshot.edges)
          draft.isDirty = true
          // Clear selection to avoid stale references
          draft.selectedNodeId = null
          draft.selectedEdgeId = null

          console.log(`[workflowStore] Redo: restored to history index ${draft.historyIndex}`)
        }
      })
    },

    /**
     * Check if undo is available
     */
    canUndo: () => {
      const state = get()
      return state.historyIndex > 0
    },

    /**
     * Check if redo is available
     */
    canRedo: () => {
      const state = get()
      return state.historyIndex < state.history.length - 1
    },
  }))
)

// Selectors for performance
export const selectNodes = (state: WorkflowStoreState) => state.nodes
export const selectEdges = (state: WorkflowStoreState) => state.edges
export const selectSelectedNode = (state: WorkflowStoreState) => {
  if (!state.selectedNodeId) return null
  return state.nodes.find(n => n.id === state.selectedNodeId) || null
}
export const selectExecutionState = (state: WorkflowStoreState) => state.executionState
export const selectIsDirty = (state: WorkflowStoreState) => state.isDirty
export const selectIsExecuting = (state: WorkflowStoreState) => state.isExecuting
export const selectHistoryIndex = (state: WorkflowStoreState) => state.historyIndex
export const selectHistoryLength = (state: WorkflowStoreState) => state.history.length

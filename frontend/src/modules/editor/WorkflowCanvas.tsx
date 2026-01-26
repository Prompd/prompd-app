/**
 * WorkflowCanvas - Main React Flow canvas for .pdflow workflow editing
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  MiniMap,
  Panel,
  useReactFlow,
  SelectionMode,
  type OnConnect,
  type NodeMouseHandler,
  type EdgeMouseHandler,
  type Node,
  BackgroundVariant,
  ReactFlowProvider,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { nodeTypes } from '../components/workflow/nodes'
import { NodePalette } from '../components/workflow/NodePalette'
import { WorkflowPropertiesPanel } from '../components/workflow/PropertiesPanel'
import { UnifiedWorkflowToolbar, getGlobalExecutionMode } from '../components/workflow/UnifiedWorkflowToolbar'
import { WorkflowExecutionPanel } from '../components/workflow/WorkflowExecutionPanel'
import { WorkflowRunDialog } from '../components/workflow/WorkflowRunDialog'
import { WorkflowSettingsDialog } from '../components/workflow/WorkflowSettingsDialog'
import { UserInputDialog, type UserInputRequest, type UserInputResponse } from '../components/workflow/UserInputDialog'
import { ConnectionsPanel } from '../components/workflow/panels/ConnectionsPanel'
import { NodeQuickActions } from '../components/workflow/NodeQuickActions'
import { ContextMenu } from '../components/workflow/ContextMenu'
import { useWorkflowStore } from '../../stores/workflowStore'
import { useUIStore, selectWorkflowPanelPinned } from '../../stores/uiStore'
import { useEditorStore } from '../../stores/editorStore'
import type { WorkflowNodeType, WorkflowResult } from '@prompd/cli'
import { parseWorkflow } from '../services/workflowParser'
import { createWorkflowExecutor, type ExecutionMode, type CheckpointEvent, type ExecutionTrace, type DebugState } from '../services/workflowExecutor'
import { executionRouter } from '../services/executionRouter'
import { localCompiler } from '../services/localCompiler'

interface WorkflowCanvasProps {
  content: string
  activeTabId?: string
  onChange?: (json: string) => void
  readOnly?: boolean
}

function WorkflowCanvasInner({ content, activeTabId, onChange, readOnly = false }: WorkflowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const reactFlowInstance = useReactFlow()

  // Track selected node position for quick actions toolbar
  const [quickActionsPosition, setQuickActionsPosition] = useState<{ x: number; y: number } | null>(null)

  // Execution state (from store - persists across tab switches)
  const executionResult = useWorkflowStore(state => state.executionResult)
  const checkpoints = useWorkflowStore(state => state.checkpoints)
  const promptsSent = useWorkflowStore(state => state.promptsSent)
  const setExecutionResult = useWorkflowStore(state => state.setExecutionResult)
  const setCheckpoints = useWorkflowStore(state => state.setCheckpoints)
  const setPromptsSent = useWorkflowStore(state => state.setPromptsSent)
  const clearExecutionState = useWorkflowStore(state => state.clearExecutionState)

  // Local execution state (doesn't need to persist)
  const [showExecutionPanel, setShowExecutionPanel] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [pendingCheckpoint, setPendingCheckpoint] = useState<CheckpointEvent | null>(null)
  const [pendingUserInput, setPendingUserInput] = useState<UserInputRequest | null>(null)
  const executorRef = useRef<ReturnType<typeof createWorkflowExecutor> | null>(null)
  const checkpointResolveRef = useRef<((continueExecution: boolean) => void) | null>(null)
  const userInputResolveRef = useRef<((response: UserInputResponse) => void) | null>(null)
  const debugPauseResolveRef = useRef<((continueExecution: boolean) => void) | null>(null)

  // Run dialog state
  const [showRunDialog, setShowRunDialog] = useState(false)
  const [pendingExecutionMode, setPendingExecutionMode] = useState<ExecutionMode>('automated')
  const [lastUsedParams, setLastUsedParams] = useState<Record<string, unknown>>({})

  // Workflow settings dialog state
  const [showWorkflowSettings, setShowWorkflowSettings] = useState(false)

  const currentNodeIdRef = useRef<string | null>(null)

  // Workflow store state
  const nodes = useWorkflowStore(state => state.nodes)
  const storeEdges = useWorkflowStore(state => state.edges)
  const selectedNodeId = useWorkflowStore(state => state.selectedNodeId)
  const selectedEdgeId = useWorkflowStore(state => state.selectedEdgeId)
  const showMinimap = useWorkflowStore(state => state.showMinimap)
  const showGrid = useWorkflowStore(state => state.showGrid)
  const toolbarDockPosition = useWorkflowStore(state => state.toolbarDockPosition)
  const isDirty = useWorkflowStore(state => state.isDirty)
  const errors = useWorkflowStore(state => state.errors)
  const contextMenu = useWorkflowStore(state => state.contextMenu)

  // Workflow store actions
  const loadWorkflow = useWorkflowStore(state => state.loadWorkflow)
  const serializeToJson = useWorkflowStore(state => state.serializeToJson)
  const onNodesChange = useWorkflowStore(state => state.onNodesChange)
  const onNodeDragStart = useWorkflowStore(state => state.onNodeDragStart)
  const onNodeDrag = useWorkflowStore(state => state.onNodeDrag)
  const onNodeDragStop = useWorkflowStore(state => state.onNodeDragStop)
  const onEdgesChange = useWorkflowStore(state => state.onEdgesChange)
  const onConnect = useWorkflowStore(state => state.onConnect)
  const selectNode = useWorkflowStore(state => state.selectNode)
  const selectEdge = useWorkflowStore(state => state.selectEdge)
  const addNode = useWorkflowStore(state => state.addNode)
  const deleteNode = useWorkflowStore(state => state.deleteNode)
  const deleteEdge = useWorkflowStore(state => state.deleteEdge)
  const undockNode = useWorkflowStore(state => state.undockNode)
  const setDirty = useWorkflowStore(state => state.setDirty)
  const setExecutionState = useWorkflowStore(state => state.setExecutionState)
  const updateNodeExecutionStatus = useWorkflowStore(state => state.updateNodeExecutionStatus)
  const workflowFile = useWorkflowStore(state => state.workflowFile)
  const copyNode = useWorkflowStore(state => state.copyNode)
  const cutNode = useWorkflowStore(state => state.cutNode)
  const pasteNode = useWorkflowStore(state => state.pasteNode)
  const duplicateNode = useWorkflowStore(state => state.duplicateNode)
  const toggleNodeDisabled = useWorkflowStore(state => state.toggleNodeDisabled)
  const clipboard = useWorkflowStore(state => state.clipboard)
  const updateNodeData = useWorkflowStore(state => state.updateNodeData)
  const showContextMenu = useWorkflowStore(state => state.showContextMenu)
  const hideContextMenu = useWorkflowStore(state => state.hideContextMenu)

  // Editor store for getting current tab info
  const tabs = useEditorStore(state => state.tabs)

  // UI store for theme and panel pinned state
  const theme = useUIStore((state: { theme: 'light' | 'dark' }) => state.theme)
  const isWorkflowPanelPinned = useUIStore(selectWorkflowPanelPinned)
  const showConnectionsPanel = useUIStore(state => state.showConnectionsPanel)
  const setShowConnectionsPanel = useUIStore(state => state.setShowConnectionsPanel)
  const setBuildOutput = useUIStore(state => state.setBuildOutput)
  const setShowBuildPanel = useUIStore(state => state.setShowBuildPanel)

  // Compute selected node's screen position for quick actions toolbar
  useEffect(() => {
    if (!selectedNodeId) {
      setQuickActionsPosition(null)
      return
    }

    const selectedNode = nodes.find(n => n.id === selectedNodeId)
    if (!selectedNode) {
      setQuickActionsPosition(null)
      return
    }

    // Get node dimensions (use defaults if not set)
    const nodeWidth = selectedNode.width || 200
    const nodeHeight = selectedNode.height || 60

    // Calculate the center-top position of the node in flow coordinates
    const flowX = selectedNode.position.x + nodeWidth / 2
    const flowY = selectedNode.position.y

    // If the node has a parent, we need to add the parent's position
    let absoluteFlowX = flowX
    let absoluteFlowY = flowY
    if (selectedNode.parentId) {
      const parentNode = nodes.find(n => n.id === selectedNode.parentId)
      if (parentNode) {
        absoluteFlowX += parentNode.position.x
        absoluteFlowY += parentNode.position.y
      }
    }

    // Convert flow coordinates to screen coordinates using the viewport
    const viewport = reactFlowInstance.getViewport()
    const screenX = absoluteFlowX * viewport.zoom + viewport.x
    const screenY = absoluteFlowY * viewport.zoom + viewport.y

    setQuickActionsPosition({ x: screenX, y: screenY })
  }, [selectedNodeId, nodes, reactFlowInstance])

  // Update quick actions position when viewport changes (pan/zoom)
  useEffect(() => {
    if (!selectedNodeId) return

    const handleViewportChange = () => {
      const selectedNode = nodes.find(n => n.id === selectedNodeId)
      if (!selectedNode) return

      const nodeWidth = selectedNode.width || 200
      const flowX = selectedNode.position.x + nodeWidth / 2
      const flowY = selectedNode.position.y

      let absoluteFlowX = flowX
      let absoluteFlowY = flowY
      if (selectedNode.parentId) {
        const parentNode = nodes.find(n => n.id === selectedNode.parentId)
        if (parentNode) {
          absoluteFlowX += parentNode.position.x
          absoluteFlowY += parentNode.position.y
        }
      }

      const viewport = reactFlowInstance.getViewport()
      const screenX = absoluteFlowX * viewport.zoom + viewport.x
      const screenY = absoluteFlowY * viewport.zoom + viewport.y

      setQuickActionsPosition({ x: screenX, y: screenY })
    }

    // Listen for viewport changes
    const reactFlowElement = reactFlowWrapper.current?.querySelector('.react-flow__viewport')
    if (reactFlowElement) {
      const observer = new MutationObserver(handleViewportChange)
      observer.observe(reactFlowElement, { attributes: true, attributeFilter: ['style'] })
      return () => observer.disconnect()
    }
  }, [selectedNodeId, nodes, reactFlowInstance])

  // Determine toolbar panel position based on dock position
  // For left/right, we'll use absolute positioning instead of Panel
  const toolbarPanelPosition = useMemo((): 'top-center' | 'bottom-center' => {
    switch (toolbarDockPosition) {
      case 'top':
        return 'top-center'
      case 'bottom':
        return 'bottom-center'
      case 'left':
        return 'top-center' // Will use absolute positioning
      case 'right':
        return 'top-center' // Will use absolute positioning
      default:
        return 'top-center'
    }
  }, [toolbarDockPosition])

  // For left/right docking, calculate absolute position with rotation
  const toolbarAbsoluteStyle = useMemo((): React.CSSProperties | undefined => {
    if (toolbarDockPosition === 'left') {
      return {
        position: 'absolute',
        top: '86%',
        left: 0,
        transform: 'translateY(-50%) rotate(-90deg)',
        transformOrigin: 'left top',
        zIndex: 10,
      }
    }
    if (toolbarDockPosition === 'right') {
      return {
        position: 'absolute',
        top: '86%',
        right: 0,
        transform: 'translateY(-50%) rotate(90deg)',
        transformOrigin: 'right top',
        zIndex: 10,
      }
    }
    return undefined
  }, [toolbarDockPosition])

  const shouldUseAbsolutePosition = toolbarDockPosition === 'left' || toolbarDockPosition === 'right'

  // Compute which external nodes should be hidden when connected only to collapsed container children
  // Also compute edges with hidden property
  //
  // RULE 1: If an internal node connects to an outside node that does NOT have any other
  //         connections besides to internal nodes, then hide it and show as mini icon.
  // RULE 2: If an internal node connects to an outside node that ALSO connects to another
  //         node not in the internal collection, keep it visible with an edge from the
  //         collapsed container to that external node.
  const { visibleNodes, edges } = useMemo(() => {
    // Find all collapsed container nodes
    const collapsedContainerIds = new Set(
      nodes
        .filter(n => {
          const data = n.data as { collapsed?: boolean }
          return data.collapsed === true
        })
        .map(n => n.id)
    )

    if (collapsedContainerIds.size === 0) {
      return { visibleNodes: nodes, edges: storeEdges }
    }

    // Find all child node IDs inside collapsed containers
    const childrenOfCollapsedContainers = new Set(
      nodes
        .filter(n => n.parentId && collapsedContainerIds.has(n.parentId))
        .map(n => n.id)
    )

    if (childrenOfCollapsedContainers.size === 0) {
      return { visibleNodes: nodes, edges: storeEdges }
    }

    // Build a map of node ID -> parent container ID (for all nodes with parents)
    const nodeToParent = new Map<string, string>()
    for (const node of nodes) {
      if (node.parentId) {
        nodeToParent.set(node.id, node.parentId)
      }
    }

    // Helper to get the top-level node for any node (either itself or its parent container)
    const getTopLevelNode = (nodeId: string): string => {
      const parentId = nodeToParent.get(nodeId)
      return parentId || nodeId
    }

    // Build a set of all nodes that are inside ANY container (collapsed or not)
    // This includes children of the Tool Router, children of Loop, etc.
    const allContainerChildren = new Set(
      nodes.filter(n => n.parentId).map(n => n.id)
    )

    // For each top-level node, collect ALL its connections (including through its children)
    // We need to know: does this top-level node have ANY connection to something
    // that is NOT a child of a collapsed container?
    const topLevelNodeConnections = new Map<string, Array<{
      nodeId: string        // The actual node ID we connect to
      topLevelId: string    // The top-level parent of that node
      isToCollapsedChild: boolean  // Is this connection to a child of a collapsed container?
    }>>()

    for (const edge of storeEdges) {
      const sourceTopLevel = getTopLevelNode(edge.source)
      const targetTopLevel = getTopLevelNode(edge.target)

      // Skip if both endpoints belong to the same top-level node (internal edge within container)
      if (sourceTopLevel === targetTopLevel) continue

      // Determine if each endpoint is a CHILD of a collapsed container (not the container itself)
      // This is the key distinction: connections to a container's handles should NOT be hidden,
      // only connections to the container's INTERNAL nodes (children) should trigger hiding.
      const sourceIsCollapsedChild = childrenOfCollapsedContainers.has(edge.source)
      const targetIsCollapsedChild = childrenOfCollapsedContainers.has(edge.target)

      // Track connection for source's top-level node
      if (!topLevelNodeConnections.has(sourceTopLevel)) {
        topLevelNodeConnections.set(sourceTopLevel, [])
      }
      topLevelNodeConnections.get(sourceTopLevel)!.push({
        nodeId: edge.target,
        topLevelId: targetTopLevel,
        // ONLY mark as "to collapsed child" if connecting to an ACTUAL CHILD, not the container itself
        // Connecting to a container's input/output handles should keep the node visible
        isToCollapsedChild: targetIsCollapsedChild
      })

      // Track connection for target's top-level node
      if (!topLevelNodeConnections.has(targetTopLevel)) {
        topLevelNodeConnections.set(targetTopLevel, [])
      }
      topLevelNodeConnections.get(targetTopLevel)!.push({
        nodeId: edge.source,
        topLevelId: sourceTopLevel,
        // ONLY mark as "to collapsed child" if connecting FROM an ACTUAL CHILD, not the container itself
        isToCollapsedChild: sourceIsCollapsedChild
      })
    }

    // Determine which top-level nodes should be hidden
    // A top-level node is hidden if:
    // 1. It is NOT a collapsed container itself, AND
    // 2. ALL of its connections are to children of collapsed containers (or to collapsed containers)
    const topLevelNodesToHide = new Set<string>()

    // Debug: log connections for each top-level node
    if (collapsedContainerIds.size > 0) {
      console.log('[WorkflowCanvas] ===== NODE VISIBILITY DEBUG =====')
      console.log('[WorkflowCanvas] Collapsed containers:', [...collapsedContainerIds].map(id => {
        const n = nodes.find(x => x.id === id)
        return `${n?.data?.label || id} (${id})`
      }))
      console.log('[WorkflowCanvas] Children of collapsed containers:', [...childrenOfCollapsedContainers].map(id => {
        const n = nodes.find(x => x.id === id)
        const parent = nodes.find(x => x.id === n?.parentId)
        return `${n?.data?.label || id} (parent: ${parent?.data?.label})`
      }))
      // Log all edges for debugging
      console.log('[WorkflowCanvas] All cross-container edges:')
      for (const edge of storeEdges) {
        const srcTop = getTopLevelNode(edge.source)
        const tgtTop = getTopLevelNode(edge.target)
        if (srcTop !== tgtTop) {
          const srcNode = nodes.find(n => n.id === edge.source)
          const tgtNode = nodes.find(n => n.id === edge.target)
          const srcTopNode = nodes.find(n => n.id === srcTop)
          const tgtTopNode = nodes.find(n => n.id === tgtTop)
          console.log(`  Edge: "${srcNode?.data?.label}" (top: ${srcTopNode?.data?.label}) → "${tgtNode?.data?.label}" (top: ${tgtTopNode?.data?.label})`)
        }
      }
      for (const [topLevelId, connections] of topLevelNodeConnections) {
        const node = nodes.find(n => n.id === topLevelId)
        console.log(`[WorkflowCanvas] Top-level "${node?.data?.label}" connections:`, connections.map(c => {
          const n = nodes.find(x => x.id === c.nodeId)
          const topN = nodes.find(x => x.id === c.topLevelId)
          return `→ ${n?.data?.label} (top: ${topN?.data?.label}, isToCollapsedChild: ${c.isToCollapsedChild})`
        }))
      }
    }

    for (const [topLevelId, connections] of topLevelNodeConnections) {
      const node = nodes.find(n => n.id === topLevelId)
      const isCollapsedContainer = collapsedContainerIds.has(topLevelId)

      // For collapsed containers, we only hide them if ALL their connections go to
      // DIFFERENT collapsed containers (not themselves). This handles Tool Router
      // being hidden when Loop is collapsed and Tool Router only connects to Loop's children.

      // Filter out connections that go to THIS container's own children (self-connections)
      const externalConnections = connections.filter(conn => {
        // If this is a collapsed container, ignore connections to its own children
        if (isCollapsedContainer) {
          const targetNode = nodes.find(n => n.id === conn.nodeId)
          if (targetNode?.parentId === topLevelId) {
            console.log(`[WorkflowCanvas] "${node?.data?.label}" - filtering OUT self-connection to "${targetNode?.data?.label}"`)
            return false // Internal connection to own child
          }
        }
        return true
      })

      console.log(`[WorkflowCanvas] "${node?.data?.label || topLevelId}" external connections after filter:`,
        externalConnections.map(c => {
          const n = nodes.find(x => x.id === c.nodeId)
          return { nodeLabel: n?.data?.label, topLevelId: c.topLevelId, isToCollapsedChild: c.isToCollapsedChild }
        }))

      // Check if ALL external connections go to collapsed containers/children
      const allConnectionsToCollapsed = externalConnections.length > 0 &&
        externalConnections.every(conn => conn.isToCollapsedChild)

      console.log(`[WorkflowCanvas] "${node?.data?.label || topLevelId}" isCollapsed:`, isCollapsedContainer,
        'externalConnections:', externalConnections.length, 'allConnectionsToCollapsed:', allConnectionsToCollapsed)

      if (allConnectionsToCollapsed) {
        topLevelNodesToHide.add(topLevelId)
      }
    }

    console.log('[WorkflowCanvas] Nodes to hide:', [...topLevelNodesToHide])

    // Build set of all nodes to hide (top-level nodes + their children)
    const nodesToHide = new Set<string>()
    for (const nodeId of topLevelNodesToHide) {
      nodesToHide.add(nodeId)
      // Also hide all children of this container
      for (const node of nodes) {
        if (node.parentId === nodeId) {
          nodesToHide.add(node.id)
        }
      }
    }

    // Filter nodes - hide external nodes that only connect to collapsed container children
    const filteredNodes = nodes.map(node => {
      const updates: Partial<Node> = {}

      if (nodesToHide.has(node.id)) {
        updates.hidden = true
      }

      // Note: Disabled styling is handled by individual node components applying
      // the 'workflow-node-disabled' CSS class. We don't apply inline styles here
      // to avoid triggering ReactFlow layout recalculations that cause position jumps.

      if (Object.keys(updates).length > 0) {
        return { ...node, ...updates }
      }
      return node
    })

    // Hide edges that:
    // 1. Have source OR target as a child of a collapsed container
    // 2. Connect to/from nodes that are being hidden
    const filteredEdges = storeEdges.map(edge => {
      // Hide edges that connect to/from hidden nodes
      if (nodesToHide.has(edge.source) || nodesToHide.has(edge.target)) {
        return { ...edge, hidden: true }
      }

      const sourceIsChild = childrenOfCollapsedContainers.has(edge.source)
      const targetIsChild = childrenOfCollapsedContainers.has(edge.target)

      // If both ends are children of the same container, it's an internal edge - hide it
      if (sourceIsChild && targetIsChild) {
        return { ...edge, hidden: true }
      }

      // If one end is a child and the other is external, hide it
      // (the mini preview now represents this connection)
      if (sourceIsChild || targetIsChild) {
        // Check if the other end is the container itself (input/output handle)
        // Those edges should remain visible
        const sourceNode = nodes.find(n => n.id === edge.source)
        const targetNode = nodes.find(n => n.id === edge.target)

        // If source is child, check if target is the parent container
        if (sourceIsChild && sourceNode?.parentId) {
          if (edge.target === sourceNode.parentId) {
            // This is a connection from child to container's handle - keep visible
            return edge
          }
        }

        // If target is child, check if source is the parent container
        if (targetIsChild && targetNode?.parentId) {
          if (edge.source === targetNode.parentId) {
            // This is a connection from container's handle to child - keep visible
            return edge
          }
        }

        // External connection to/from child - hide it
        return { ...edge, hidden: true }
      }

      return edge
    })

    return { visibleNodes: filteredNodes, edges: filteredEdges }
  }, [nodes, storeEdges])

  // Get active tab for workflow file path (needed to resolve relative .prmd paths)
  const activeTab = useEditorStore(state => state.tabs.find(t => t.id === state.activeTabId))
  const workflowFilePath = activeTab?.filePath

  // Track content to prevent re-loading from our own serialization
  const lastContentRef = useRef<string>('')
  const isInternalUpdate = useRef(false)

  // Load workflow content when it changes externally (not from our own edits)
  useEffect(() => {
    // Skip if this is our own update (from serializeToJson -> onChange -> content prop)
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false
      return
    }

    // Skip if content is exactly the same (prevents unnecessary reloads)
    if (content === lastContentRef.current) {
      return
    }

    // Content changed externally (e.g., from code editor) - reload workflow
    console.log('[WorkflowCanvas] External content change detected, reloading workflow')
    loadWorkflow(content)
    lastContentRef.current = content
  }, [content, loadWorkflow])

  // Notify parent of changes (when workflow is edited in canvas)
  useEffect(() => {
    if (isDirty && onChange) {
      const json = serializeToJson()
      // Mark as internal update to prevent reload loop when content prop updates
      isInternalUpdate.current = true
      lastContentRef.current = json
      onChange(json)
      setDirty(false)
    }
  }, [isDirty, onChange, serializeToJson, setDirty])

  // Push validation errors to BuildOutputPanel
  useEffect(() => {
    if (errors.length > 0) {
      // Get the actual file name from the active tab instead of workflow metadata
      const currentTab = activeTabId ? tabs.find(t => t.id === activeTabId) : null
      const fileName = currentTab?.name || workflowFile?.metadata?.name || 'Workflow'
      const json = serializeToJson()

      // Convert WorkflowValidationErrors to BuildErrors with line numbers
      const buildErrors = errors.map(error => {
        const node = nodes.find(n => n.id === error.nodeId)
        const nodeLabel = node?.data?.label || error.nodeId || 'Unknown'

        // Find line number in JSON where this node is defined
        let lineNumber: number | undefined
        if (error.nodeId) {
          // Search for the node ID in the JSON to find its line number
          const lines = json.split('\n')
          const nodeIdPattern = new RegExp(`"id":\\s*"${error.nodeId}"`)
          for (let i = 0; i < lines.length; i++) {
            if (nodeIdPattern.test(lines[i])) {
              lineNumber = i + 1 // Line numbers are 1-based
              break
            }
          }
        }

        return {
          file: fileName,
          message: `Node '${nodeLabel}': ${error.message}`,
          line: lineNumber,
          column: undefined,
        }
      })

      setBuildOutput({
        status: 'error',
        message: `Workflow has ${errors.length} validation error${errors.length > 1 ? 's' : ''}`,
        errors: buildErrors,
        timestamp: Date.now(),
      })
      setShowBuildPanel(true)
    }
  }, [errors, nodes, workflowFile, activeTabId, tabs, setBuildOutput, setShowBuildPanel, serializeToJson])

  // Listen for execute-workflow event from EditorHeader play button
  useEffect(() => {
    const handleExecuteWorkflow = () => {
      // Use the execution mode selected in the WorkflowToolbar
      if (workflowFile) {
        setPendingExecutionMode(getGlobalExecutionMode())
        setShowRunDialog(true)
      }
    }

    window.addEventListener('execute-workflow', handleExecuteWorkflow)
    return () => window.removeEventListener('execute-workflow', handleExecuteWorkflow)
  }, [workflowFile])

  // Keyboard shortcuts for copy/paste/duplicate/cut/disable/delete
  useEffect(() => {
    if (readOnly) return

    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't handle shortcuts when typing in inputs
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      const isCtrlOrCmd = event.ctrlKey || event.metaKey

      // Copy: Ctrl/Cmd + C
      if (isCtrlOrCmd && event.key === 'c' && selectedNodeId) {
        event.preventDefault()
        copyNode(selectedNodeId)
      }

      // Cut: Ctrl/Cmd + X
      if (isCtrlOrCmd && event.key === 'x' && selectedNodeId) {
        event.preventDefault()
        cutNode(selectedNodeId)
      }

      // Paste: Ctrl/Cmd + V
      if (isCtrlOrCmd && event.key === 'v' && clipboard) {
        event.preventDefault()
        // Get the current viewport center for paste position
        const viewport = reactFlowInstance.getViewport()
        const wrapper = reactFlowWrapper.current
        if (wrapper) {
          const bounds = wrapper.getBoundingClientRect()
          // Convert screen center to flow coordinates
          const centerX = (bounds.width / 2 - viewport.x) / viewport.zoom
          const centerY = (bounds.height / 2 - viewport.y) / viewport.zoom
          pasteNode({ x: centerX, y: centerY })
        }
      }

      // Duplicate: Ctrl/Cmd + D
      if (isCtrlOrCmd && event.key === 'd' && selectedNodeId) {
        event.preventDefault()
        duplicateNode(selectedNodeId)
      }

      // Enable/Disable Toggle: Ctrl/Cmd + E
      if (isCtrlOrCmd && event.key === 'e' && selectedNodeId) {
        event.preventDefault()
        toggleNodeDisabled(selectedNodeId)
      }

      // Lock/Unlock: Ctrl/Cmd + L
      if (isCtrlOrCmd && event.key === 'l' && selectedNodeId) {
        event.preventDefault()
        const selectedNode = nodes.find(n => n.id === selectedNodeId)
        if (selectedNode) {
          const isLocked = selectedNode.data?.locked ?? false
          updateNodeData(selectedNodeId, { locked: !isLocked })
        }
      }

      // Delete: Delete or Backspace key
      // Note: ReactFlow handles node deletion automatically via deleteKeyCode prop
      // We only need to handle edge deletion manually
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedEdgeId && !selectedNodeId) {
        event.preventDefault()
        deleteEdge(selectedEdgeId)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [readOnly, selectedNodeId, selectedEdgeId, clipboard, nodes, copyNode, cutNode, pasteNode, duplicateNode, toggleNodeDisabled, updateNodeData, deleteEdge, reactFlowInstance])

  // Handle connection
  const handleConnect: OnConnect = useCallback((connection) => {
    if (!readOnly) {
      onConnect(connection)
    }
  }, [onConnect, readOnly])

  // Handle node click
  const handleNodeClick: NodeMouseHandler = useCallback((event, node) => {
    selectNode(node.id)
  }, [selectNode])

  // Handle edge click
  const handleEdgeClick: EdgeMouseHandler = useCallback((event, edge) => {
    selectEdge(edge.id)
  }, [selectEdge])

  // Handle pane click (deselect and hide context menu)
  const handlePaneClick = useCallback(() => {
    selectNode(null)
    selectEdge(null)
    hideContextMenu()
  }, [selectNode, selectEdge, hideContextMenu])

  // Handle node right-click (context menu)
  const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault()
    showContextMenu('node', { x: event.clientX, y: event.clientY }, node.id)
  }, [showContextMenu])

  // Handle edge right-click (context menu)
  const handleEdgeContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    if (selectedEdgeId) {
      showContextMenu('edge', { x: event.clientX, y: event.clientY }, undefined, selectedEdgeId)
    }
  }, [showContextMenu, selectedEdgeId])

  // Handle canvas right-click (context menu)
  const handlePaneContextMenu = useCallback((event: React.MouseEvent | MouseEvent) => {
    event.preventDefault()
    showContextMenu('canvas', { x: event.clientX, y: event.clientY })
  }, [showContextMenu])

  // Context menu action handlers
  const handleContextMenuCopy = useCallback(() => {
    if (contextMenu?.nodeId) {
      copyNode(contextMenu.nodeId)
    }
    hideContextMenu()
  }, [contextMenu, copyNode, hideContextMenu])

  const handleContextMenuCut = useCallback(() => {
    if (contextMenu?.nodeId) {
      cutNode(contextMenu.nodeId)
    }
    hideContextMenu()
  }, [contextMenu, cutNode, hideContextMenu])

  const handleContextMenuPaste = useCallback(() => {
    if (clipboard) {
      // Get the current viewport center for paste position
      const viewport = reactFlowInstance.getViewport()
      const wrapper = reactFlowWrapper.current
      if (wrapper) {
        const bounds = wrapper.getBoundingClientRect()
        // Convert screen center to flow coordinates
        const centerX = (bounds.width / 2 - viewport.x) / viewport.zoom
        const centerY = (bounds.height / 2 - viewport.y) / viewport.zoom
        pasteNode({ x: centerX, y: centerY })
      }
    }
    hideContextMenu()
  }, [clipboard, pasteNode, hideContextMenu, reactFlowInstance])

  const handleContextMenuDuplicate = useCallback(() => {
    if (contextMenu?.nodeId) {
      duplicateNode(contextMenu.nodeId)
    }
    hideContextMenu()
  }, [contextMenu, duplicateNode, hideContextMenu])

  const handleContextMenuToggleDisabled = useCallback(() => {
    if (contextMenu?.nodeId) {
      toggleNodeDisabled(contextMenu.nodeId)
    }
    hideContextMenu()
  }, [contextMenu, toggleNodeDisabled, hideContextMenu])

  const handleContextMenuDelete = useCallback(() => {
    if (contextMenu?.type === 'node' && contextMenu.nodeId) {
      deleteNode(contextMenu.nodeId)
    } else if (contextMenu?.type === 'edge' && contextMenu.edgeId) {
      deleteEdge(contextMenu.edgeId)
    }
    hideContextMenu()
  }, [contextMenu, deleteNode, deleteEdge, hideContextMenu])

  const handleContextMenuUndock = useCallback(() => {
    if (contextMenu?.nodeId) {
      undockNode(contextMenu.nodeId)
    }
    hideContextMenu()
  }, [contextMenu, undockNode, hideContextMenu])

  const handleContextMenuAddNode = useCallback((nodeType: WorkflowNodeType) => {
    if (contextMenu?.type === 'canvas') {
      // Convert screen position to flow position
      const position = reactFlowInstance.screenToFlowPosition({
        x: contextMenu.position.x,
        y: contextMenu.position.y,
      })
      addNode(nodeType, position)
    }
    hideContextMenu()
  }, [contextMenu, addNode, hideContextMenu, reactFlowInstance])

  const handleContextMenuHighlightPath = useCallback(() => {
    // TODO: Implement path highlighting
    console.log('Highlight path for edge:', contextMenu?.edgeId)
    hideContextMenu()
  }, [contextMenu, hideContextMenu])

  // Workflow settings handlers
  const handleOpenWorkflowSettings = useCallback(() => {
    setShowWorkflowSettings(true)
    hideContextMenu()
  }, [hideContextMenu])

  const handleSaveWorkflowSettings = useCallback((settings: { name: string; description: string; version: string }) => {
    try {
      // Parse current workflow JSON
      const workflow = JSON.parse(content)

      // Update metadata
      workflow.metadata = {
        ...workflow.metadata,
        name: settings.name,
        description: settings.description,
      }

      // Update version (both top-level and metadata)
      workflow.version = settings.version
      if (workflow.metadata) {
        workflow.metadata.version = settings.version
      }

      // Update timestamp
      workflow.metadata.modified = Date.now()

      // Call onChange with updated JSON
      onChange?.(JSON.stringify(workflow, null, 2))
    } catch (error) {
      console.error('Failed to update workflow settings:', error)
    }
  }, [content, onChange])

  // Handle node drag start - initialize drag state for visual feedback
  const handleNodeDragStart = useCallback((event: React.MouseEvent, node: Node) => {
    if (!readOnly) {
      onNodeDragStart(node.id)
    }
  }, [readOnly, onNodeDragStart])

  // Handle node drag - update visual feedback for container hover
  // We use mouse position (screenToFlowPosition) for container detection since
  // nodes with extent='parent' have their positions clamped within parent bounds
  const handleNodeDrag = useCallback((event: React.MouseEvent, node: Node) => {
    if (!readOnly) {
      // Get the actual mouse position in flow coordinates
      // This is unclamped, allowing us to detect when user drags outside container
      const mousePosition = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
      onNodeDrag(node.id, node.position, mousePosition)
    }
  }, [readOnly, onNodeDrag, reactFlowInstance])

  // Handle node drag stop - detect if node was dropped into a container
  // The third parameter `nodes` contains all selected nodes when multi-dragging
  const handleNodeDragStop = useCallback((event: React.MouseEvent, node: Node, nodes: Node[]) => {
    if (!readOnly) {
      // Get mouse position in flow coordinates for accurate container detection
      const mousePosition = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
      // Handle all dragged nodes (for multi-select drag)
      const nodesToProcess = nodes && nodes.length > 0 ? nodes : [node]
      for (const n of nodesToProcess) {
        onNodeDragStop(n.id, n.position, mousePosition)
      }
    }
  }, [readOnly, onNodeDragStop, reactFlowInstance])

  // Handle drop from palette
  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()

    if (readOnly) return

    const type = event.dataTransfer.getData('application/workflow-node') as WorkflowNodeType
    if (!type) return
    if (!reactFlowInstance) return

    // screenToFlowPosition takes raw screen coordinates (clientX/Y) and converts
    // them to flow coordinates, accounting for zoom and pan
    const position = reactFlowInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    })

    addNode(type, position)
  }, [readOnly, reactFlowInstance, addNode])

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const handleDragEnter = useCallback((event: React.DragEvent) => {
    event.preventDefault()
  }, [])

  // Handle run button click - show parameter dialog
  const handleRunClick = useCallback((mode: ExecutionMode) => {
    if (!workflowFile) return
    setPendingExecutionMode(mode)
    setShowRunDialog(true)
  }, [workflowFile])

  // Handle actual workflow execution with parameters
  const handleRunWithParams = useCallback(async (params: Record<string, unknown>) => {
    if (!workflowFile) return

    // Save the parameters for next run
    setLastUsedParams(params)

    // Close dialog
    setShowRunDialog(false)

    // Reset state
    setCheckpoints([])
    setExecutionResult(null)
    setPromptsSent([])
    setShowExecutionPanel(true)

    // Parse the current workflow
    const json = serializeToJson()
    const parsed = parseWorkflow(json)

    if (parsed.errors.length > 0) {
      console.error('Workflow has errors:', parsed.errors)
      return
    }

    const mode = pendingExecutionMode

    // Initialize execution state
    setExecutionState({
      workflowId: workflowFile.metadata.id,
      status: 'running',
      nodeStates: {},
      nodeOutputs: {},
      variables: {},
      errors: [],
      startTime: Date.now(),
    })

    // Create executor with callbacks
    const executor = createWorkflowExecutor(parsed, params, {
      executionMode: mode,
      onProgress: (state) => {
        setExecutionState(state)
      },
      onNodeStart: (nodeId) => {
        currentNodeIdRef.current = nodeId
        updateNodeExecutionStatus(nodeId, 'running')
      },
      onNodeComplete: (nodeId, output) => {
        updateNodeExecutionStatus(nodeId, 'completed', output)
      },
      onNodeError: (nodeId, error) => {
        updateNodeExecutionStatus(nodeId, 'failed')
        console.error(`Node ${nodeId} failed:`, error)
      },
      onCheckpoint: async (event) => {
        setCheckpoints([...checkpoints, event])

        // Check if this checkpoint requires pausing
        const shouldPause = event.behaviors.requireApproval ||
          (mode === 'debug' && event.behaviors.pauseInDebug)

        if (shouldPause) {
          console.log('[WorkflowCanvas] Checkpoint hit, pausing for user:', event)
          setIsPaused(true)
          setPendingCheckpoint(event)

          // Return a promise that waits for user to click Resume or Stop
          return new Promise<boolean>((resolve) => {
            checkpointResolveRef.current = resolve
          })
        }

        // For automated mode or non-pause checkpoints, continue immediately
        return true
      },
      // Handle user input nodes
      onUserInput: async (request) => {
        console.log('[WorkflowCanvas] User input requested:', request)
        setIsPaused(true)
        setPendingUserInput(request)

        // Return a promise that waits for user to submit or cancel
        return new Promise<UserInputResponse>((resolve) => {
          userInputResolveRef.current = resolve
        })
      },
      // Handle step mode and breakpoint pauses
      onDebugPause: async (debugState, trace) => {
        console.log('[WorkflowCanvas] Debug pause:', debugState, 'Mode:', mode)
        setIsPaused(true)

        // Return a promise that waits for user to click Resume or Stop
        return new Promise<boolean>((resolve) => {
          debugPauseResolveRef.current = resolve
        })
      },
      // Execute prompts using the execution router
      executePrompt: async (source, promptParams, provider, model) => {
        console.log('[WorkflowCanvas] Executing prompt:', source, promptParams, provider, model)
        console.log('[WorkflowCanvas] Workflow file path:', workflowFilePath)

        // Read the .prmd file content if it's a file path
        let promptContent = source
        let resolvedPath: string | undefined = undefined

        // Check if source is raw text (prefixed with "raw:")
        if (source.startsWith('raw:')) {
          // Extract raw prompt text and wrap it in minimal .prmd frontmatter
          // Minimum required fields: id, name, version, description
          const rawText = source.substring(4)  // Remove "raw:" prefix
          const uniqueId = `raw-prompt-${Date.now()}`
          // Ensure proper frontmatter format with newline after closing ---
          promptContent = [
            '---',
            `id: ${uniqueId}`,
            'name: "Raw Prompt"',
            'version: 0.0.1',
            'description: "Inline raw prompt from workflow"',
            '---',
            '',  // Empty line after frontmatter
            rawText
          ].join('\n')
          console.log('[WorkflowCanvas] Using raw prompt text, length:', rawText.length)
        }
        // Check if source is a file path (starts with ./ or ../ or @)
        else if (source.startsWith('./') || source.startsWith('../') || source.startsWith('@')) {
          // Try to read the file via Electron
          if (window.electronAPI?.readFile) {
            try {
              if (source.startsWith('@')) {
                // Package reference - would need package resolver
                // For now, try workspace-relative
                const workspacePath = await window.electronAPI.getWorkspacePath()
                resolvedPath = workspacePath ? `${workspacePath}/${source}` : source
              } else {
                // Relative path - resolve relative to the WORKFLOW FILE's directory
                if (workflowFilePath) {
                  // Get the directory containing the workflow file
                  // Handle both forward and back slashes for cross-platform
                  const lastSlash = Math.max(
                    workflowFilePath.lastIndexOf('/'),
                    workflowFilePath.lastIndexOf('\\')
                  )
                  const workflowDir = lastSlash > -1 ? workflowFilePath.substring(0, lastSlash) : ''

                  // Normalize the source path (remove leading ./)
                  const normalizedSource = source.replace(/^\.\//, '')

                  // Combine workflow directory with the relative path
                  resolvedPath = workflowDir ? `${workflowDir}/${normalizedSource}` : normalizedSource

                  // Handle ../ navigation
                  if (source.startsWith('../')) {
                    // Let the file system handle ../ paths
                    resolvedPath = `${workflowDir}/${source}`
                  }

                  console.log('[WorkflowCanvas] Resolved prompt path:', resolvedPath)
                } else {
                  // Fallback to workspace-relative if no workflow path
                  const workspacePath = await window.electronAPI.getWorkspacePath()
                  resolvedPath = workspacePath
                    ? `${workspacePath}/${source.replace(/^\.\//, '')}`
                    : source
                  console.warn('[WorkflowCanvas] No workflow file path, using workspace-relative:', resolvedPath)
                }
              }

              const fileResult = await window.electronAPI.readFile(resolvedPath)
              if (fileResult.success && fileResult.content) {
                promptContent = fileResult.content
                console.log('[WorkflowCanvas] Read prompt file, content length:', promptContent.length)
              } else {
                console.error('[WorkflowCanvas] Failed to read prompt file:', resolvedPath, fileResult.error)
              }
            } catch (err) {
              console.error('[WorkflowCanvas] Could not read prompt file:', source, err)
              // Fall back to using source as content
            }
          } else {
            console.warn('[WorkflowCanvas] No Electron API available, cannot read file:', source)
          }
        }

        // Compile the prompt using local compiler if available
        let compiledPrompt = promptContent
        const hasCompiler = localCompiler.hasLocalCompiler()
        console.log('[WorkflowCanvas] Local compiler available:', hasCompiler, 'electronAPI:', !!window.electronAPI, 'compiler:', !!window.electronAPI?.compiler)
        if (hasCompiler) {
          try {
            console.log('[WorkflowCanvas] Compiling prompt with params:', promptParams)
            const compileResult = await localCompiler.compile(promptContent, {
              format: 'markdown',
              parameters: promptParams
            })
            if (compileResult.success && compileResult.output) {
              compiledPrompt = compileResult.output
              console.log('[WorkflowCanvas] Compiled prompt length:', compiledPrompt.length)
              console.log('[WorkflowCanvas] Compiled prompt preview:', compiledPrompt.substring(0, 300))
            } else {
              console.warn('[WorkflowCanvas] Compilation failed:', compileResult.error || 'Unknown error')
              console.warn('[WorkflowCanvas] Full compile result:', JSON.stringify(compileResult, null, 2))
            }
          } catch (err) {
            console.warn('[WorkflowCanvas] Compilation failed, using raw content:', err)
          }
        } else {
          console.warn('[WorkflowCanvas] No local compiler available')
        }

        console.log('[WorkflowCanvas] Executing with compiled prompt (first 200 chars):', compiledPrompt.substring(0, 200))

        // Track this prompt for debugging
        setPromptsSent([...promptsSent, {
          nodeId: currentNodeIdRef.current || 'unknown',
          source,
          resolvedPath,
          compiledPrompt,
          params: promptParams,
          provider,
          model,
          timestamp: Date.now(),
        }])

        // Execute using the execution router
        const result = await executionRouter.execute({
          provider: provider || 'openai',
          model: model || 'gpt-4o',
          prompt: compiledPrompt,
          maxTokens: 4096,
          temperature: 0.7,
        })

        if (!result.success) {
          throw new Error(result.error || 'Execution failed')
        }

        return result.response || ''
      },
      // Execute LLM prompts for agent nodes (multi-turn conversations)
      onPromptExecute: async (request) => {
        console.log('[WorkflowCanvas] Agent LLM request:', request.nodeId, request.messages.length, 'messages')

        // Build the full prompt with system message and conversation history
        const systemMessage = request.prompt
        const messages = request.messages

        // Format as a single prompt for the LLM
        // System prompt first, then conversation history
        let fullPrompt = systemMessage + '\n\n'
        for (const msg of messages) {
          if (msg.role === 'user') {
            fullPrompt += `User: ${msg.content}\n\n`
          } else if (msg.role === 'assistant') {
            fullPrompt += `Assistant: ${msg.content}\n\n`
          }
        }
        fullPrompt += 'Assistant:'

        // Track for debugging
        setPromptsSent([...promptsSent, {
          nodeId: request.nodeId,
          source: 'agent-llm-call',
          compiledPrompt: fullPrompt,
          params: {},
          provider: request.provider,
          model: request.model,
          timestamp: Date.now(),
        }])

        try {
          const result = await executionRouter.execute({
            provider: request.provider || 'openai',
            model: request.model || 'gpt-4o',
            prompt: fullPrompt,
            maxTokens: 4096,
            temperature: request.temperature ?? 0.7,
          })

          if (!result.success) {
            return {
              success: false,
              error: result.error || 'LLM execution failed',
            }
          }

          return {
            success: true,
            response: result.response || '',
          }
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          }
        }
      },
    })

    executorRef.current = executor

    try {
      console.log('[WorkflowCanvas] Starting execution with mode:', mode)
      const result = await executor.execute()
      console.log('[WorkflowCanvas] Execution completed:', result)
      console.log('[WorkflowCanvas] Result has trace:', !!result.trace)
      console.log('[WorkflowCanvas] Trace entries:', result.trace?.entries?.length || 0)
      setExecutionResult(result)
      setExecutionState({
        workflowId: workflowFile.metadata.id,
        status: result.success ? 'completed' : 'failed',
        nodeStates: {},
        nodeOutputs: result.nodeOutputs,
        variables: {},
        errors: result.errors,
        endTime: Date.now(),
      })
    } catch (error) {
      console.error('[WorkflowCanvas] Workflow execution failed:', error)
      setExecutionState({
        workflowId: workflowFile.metadata.id,
        status: 'failed',
        nodeStates: {},
        nodeOutputs: {},
        variables: {},
        errors: [{
          message: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
        }],
        endTime: Date.now(),
      })
    }
  }, [workflowFile, workflowFilePath, pendingExecutionMode, serializeToJson, setExecutionState, updateNodeExecutionStatus])

  const handleStop = useCallback(() => {
    // If paused at a checkpoint, resolve the promise to stop
    if (checkpointResolveRef.current) {
      checkpointResolveRef.current(false)
      checkpointResolveRef.current = null
    }
    // If paused in step/debug mode, resolve to stop
    if (debugPauseResolveRef.current) {
      debugPauseResolveRef.current(false)
      debugPauseResolveRef.current = null
    }
    // If waiting for user input, resolve with cancelled
    if (userInputResolveRef.current) {
      userInputResolveRef.current({ value: undefined, cancelled: true })
      userInputResolveRef.current = null
    }
    executorRef.current?.stop()
    setExecutionState(null)
    setIsPaused(false)
    setPendingCheckpoint(null)
    setPendingUserInput(null)
  }, [setExecutionState])

  const handleResume = useCallback(() => {
    // If paused at a checkpoint, resolve the promise to continue
    if (checkpointResolveRef.current) {
      console.log('[WorkflowCanvas] Resuming from checkpoint')
      checkpointResolveRef.current(true)
      checkpointResolveRef.current = null
    }
    // If paused in step/debug mode, resolve the debug pause promise
    if (debugPauseResolveRef.current) {
      console.log('[WorkflowCanvas] Resuming from step/debug pause')
      debugPauseResolveRef.current(true)
      debugPauseResolveRef.current = null
    }
    executorRef.current?.resume()
    setIsPaused(false)
    setPendingCheckpoint(null)
  }, [])

  const handleCloseExecutionPanel = useCallback(() => {
    // Clean up any pending checkpoint promise
    if (checkpointResolveRef.current) {
      checkpointResolveRef.current(false)
      checkpointResolveRef.current = null
    }
    // Clean up any pending debug pause promise
    if (debugPauseResolveRef.current) {
      debugPauseResolveRef.current(false)
      debugPauseResolveRef.current = null
    }
    // Clean up any pending user input promise
    if (userInputResolveRef.current) {
      userInputResolveRef.current({ value: undefined, cancelled: true })
      userInputResolveRef.current = null
    }
    setShowExecutionPanel(false)
    setExecutionResult(null)
    setCheckpoints([])
    setExecutionState(null)
    setIsPaused(false)
    setPendingCheckpoint(null)
    setPendingUserInput(null)
  }, [setExecutionState])

  // Handle user input submission
  const handleUserInputSubmit = useCallback((response: UserInputResponse) => {
    console.log('[WorkflowCanvas] User input submitted:', response)
    if (userInputResolveRef.current) {
      userInputResolveRef.current(response)
      userInputResolveRef.current = null
    }
    setIsPaused(false)
    setPendingUserInput(null)
  }, [])

  // Handle user input cancellation
  const handleUserInputCancel = useCallback(() => {
    console.log('[WorkflowCanvas] User input cancelled')
    if (userInputResolveRef.current) {
      userInputResolveRef.current({ value: undefined, cancelled: true })
      userInputResolveRef.current = null
    }
    setIsPaused(false)
    setPendingUserInput(null)
  }, [])

  // Custom edge style
  const defaultEdgeOptions = useMemo(() => ({
    style: { strokeWidth: 2 },
    animated: false,
  }), [])

  // Determine if panel should be in the flow (pinned) or floating
  const showPinnedPanel = showExecutionPanel && isWorkflowPanelPinned
  const showFloatingPanel = showExecutionPanel && !isWorkflowPanelPinned

  const onReactFlowError = useCallback((id: string, message: string): void => {
    console.error(`[WorkflowCanvas] ReactFlow error (ID: ${id}): ${message}`)
  }, [])

  const onReactFlowErrorCapture = useCallback((event: React.SyntheticEvent<HTMLDivElement>) => {
    console.error('[WorkflowCanvas] ReactFlow error (capture):', event)
  }, [])

  return (
    <div className="flex h-full w-full">
      {/* Node Palette Sidebar */}
      {!readOnly && (
        <NodePalette />
      )}

      {/* Main content area - flex column when panel is pinned */}
      <div className="flex-1 flex flex-col h-full min-w-0" style={{ position: 'relative', overflow: 'hidden' }}>
        {/* Canvas area - takes remaining space */}
        <div
          ref={reactFlowWrapper}
          className="flex-1 min-h-0"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          style={{ position: 'relative' }}
        >
          <ReactFlow
            onError={onReactFlowError}
            onErrorCapture={onReactFlowErrorCapture}
            nodes={visibleNodes}
            edges={edges}
            onNodesChange={readOnly ? undefined : (onNodesChange as any)}
            onEdgesChange={readOnly ? undefined : onEdgesChange}
            onConnect={handleConnect}
            onNodeClick={handleNodeClick}
            onNodeDragStart={handleNodeDragStart}
            onNodeDrag={handleNodeDrag}
            onNodeDragStop={handleNodeDragStop}
            onEdgeClick={handleEdgeClick}
            onPaneClick={handlePaneClick}
            onNodeContextMenu={readOnly ? undefined : handleNodeContextMenu}
            onEdgeContextMenu={readOnly ? undefined : handleEdgeContextMenu}
            onPaneContextMenu={readOnly ? undefined : handlePaneContextMenu}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            snapToGrid
            snapGrid={[15, 15]}
            deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
            colorMode={theme}
            proOptions={{ hideAttribution: true }}
            // Selection behavior:
            // - Default drag: Pan canvas
            // - Shift+drag: Draw selection box
            // - Ctrl/Cmd+click: Toggle individual node selection
            panOnDrag
            selectionOnDrag={false}
            selectionMode={SelectionMode.Partial}
            panOnScroll={false}
            selectionKeyCode="Shift"
            multiSelectionKeyCode={['Meta', 'Control']}
          >
            {/* Background grid */}
            {showGrid && (
              <Background
                variant={BackgroundVariant.Dots}
                gap={15}
                size={1}
                className="workflow-canvas-background"
              />
            )}

            {/* Note: We use WorkflowToolbar for controls instead of the default Controls component
                 to avoid duplicate controls and provide a more integrated toolbar experience */}

            {/* Minimap */}
            {showMinimap && (
              <MiniMap
                position="bottom-right"
                pannable
                zoomable
                nodeStrokeWidth={3}
                nodeBorderRadius={8}
                style={{
                  width: 200,
                  height: 150,
                }}
              />
            )}

            {/* Unified Toolbar - spans full width, contains all controls and parameters */}
            {shouldUseAbsolutePosition ? (
              // Use absolute positioning for left/right docking
              <div style={{ ...toolbarAbsoluteStyle, pointerEvents: 'auto' }}>
                <UnifiedWorkflowToolbar
                  readOnly={readOnly}
                  onRun={handleRunClick}
                  onStop={handleStop}
                  onResume={handleResume}
                  isPaused={isPaused}
                />
              </div>
            ) : (
              // Use Panel for top/bottom docking
              <Panel
                position={toolbarPanelPosition}
                style={{ pointerEvents: 'none', width: '100%', display: 'flex', justifyContent: 'center' }}
              >
                <div style={{ pointerEvents: 'auto' }}>
                  <UnifiedWorkflowToolbar
                    readOnly={readOnly}
                    onRun={handleRunClick}
                    onStop={handleStop}
                    onResume={handleResume}
                    isPaused={isPaused}
                  />
                </div>
              </Panel>
            )}

            {/* Error indicator */}
            {errors.length > 0 && (
              <Panel position="top-right" style={{ pointerEvents: 'none' }}>
                <div
                  style={{
                    pointerEvents: 'auto',
                    background: 'color-mix(in srgb, var(--error) 15%, var(--panel))',
                    border: '1px solid color-mix(in srgb, var(--error) 40%, transparent)',
                    borderRadius: '8px',
                    padding: '12px',
                    maxWidth: '280px',
                  }}
                >
                  <div
                    style={{
                      fontWeight: 500,
                      color: 'var(--error)',
                      fontSize: '13px',
                      marginBottom: '4px',
                    }}
                  >
                    {errors.length} Error{errors.length > 1 ? 's' : ''}
                  </div>
                  <ul
                    style={{
                      fontSize: '11px',
                      color: 'var(--error)',
                      margin: 0,
                      paddingLeft: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    {errors.slice(0, 3).map((error, i) => (
                      <li key={i}>{error.message}</li>
                    ))}
                    {errors.length > 3 && (
                      <li>...and {errors.length - 3} more</li>
                    )}
                  </ul>
                </div>
              </Panel>
            )}

          </ReactFlow>

          {/* Floating Execution Panel (when not pinned) - positioned inside canvas area */}
          {showFloatingPanel && (
            <WorkflowExecutionPanel
              onClose={handleCloseExecutionPanel}
              result={executionResult}
              checkpoints={checkpoints}
              promptsSent={promptsSent}
              onResume={handleResume}
              onStop={handleStop}
              isPaused={isPaused}
              pendingCheckpoint={pendingCheckpoint}
            />
          )}

          {/* Quick Actions Toolbar - appears above selected node */}
          {selectedNodeId && quickActionsPosition && !readOnly && (
            <NodeQuickActions
              nodeId={selectedNodeId}
              position={quickActionsPosition}
              readOnly={readOnly}
            />
          )}

          {/* Context Menu - appears on right-click */}
          {contextMenu && !readOnly && (
            <ContextMenu
              type={contextMenu.type}
              position={contextMenu.position}
              nodeId={contextMenu.nodeId}
              nodeType={contextMenu.nodeId ? nodes.find(n => n.id === contextMenu.nodeId)?.type as WorkflowNodeType : undefined}
              nodeLabel={contextMenu.nodeId ? nodes.find(n => n.id === contextMenu.nodeId)?.data?.label : undefined}
              isNodeDisabled={contextMenu.nodeId ? (nodes.find(n => n.id === contextMenu.nodeId)?.data as any)?.disabled ?? false : false}
              isNodeDocked={contextMenu.nodeId ? !!nodes.find(n => n.id === contextMenu.nodeId)?.parentId : false}
              canPaste={!!clipboard}
              edgeId={contextMenu.edgeId}
              edgeSource={contextMenu.edgeId ? edges.find(e => e.id === contextMenu.edgeId)?.source : undefined}
              edgeTarget={contextMenu.edgeId ? edges.find(e => e.id === contextMenu.edgeId)?.target : undefined}
              onClose={hideContextMenu}
              onCopy={handleContextMenuCopy}
              onCut={handleContextMenuCut}
              onPaste={handleContextMenuPaste}
              onDuplicate={handleContextMenuDuplicate}
              onToggleDisabled={handleContextMenuToggleDisabled}
              onDelete={handleContextMenuDelete}
              onUndock={handleContextMenuUndock}
              onAddNode={handleContextMenuAddNode}
              onHighlightPath={handleContextMenuHighlightPath}
              onWorkflowSettings={handleOpenWorkflowSettings}
            />
          )}
        </div>

        {/* Pinned Execution Panel - part of flex layout, takes space at bottom */}
        {showPinnedPanel && (
          <WorkflowExecutionPanel
            onClose={handleCloseExecutionPanel}
            result={executionResult}
            checkpoints={checkpoints}
            promptsSent={promptsSent}
            onResume={handleResume}
            onStop={handleStop}
            isPaused={isPaused}
            pendingCheckpoint={pendingCheckpoint}
          />
        )}
      </div>

      {/* Properties Panel - shown when node selected */}
      {selectedNodeId && !readOnly && (
        <WorkflowPropertiesPanel />
      )}

      {/* Connections Panel - manages external connections (SSH, Database, HTTP API, etc.) */}
      {showConnectionsPanel && !readOnly && (
        <div style={{
          width: 300,
          height: '100%',
          borderLeft: '1px solid var(--border)',
          overflow: 'hidden',
        }}>
          <ConnectionsPanel onClose={() => setShowConnectionsPanel(false)} />
        </div>
      )}

      {/* Run Dialog for parameter input */}
      {showRunDialog && workflowFile && (
        <WorkflowRunDialog
          parameters={workflowFile.parameters || []}
          executionMode={pendingExecutionMode}
          initialValues={lastUsedParams}
          onRun={handleRunWithParams}
          onCancel={() => setShowRunDialog(false)}
        />
      )}

      {/* Workflow Settings Dialog */}
      {showWorkflowSettings && workflowFile && (
        <WorkflowSettingsDialog
          name={workflowFile.metadata?.name || 'New Workflow'}
          description={workflowFile.metadata?.description || ''}
          version={workflowFile.version || '1.0'}
          workflowId={workflowFile.metadata?.id || 'unknown'}
          onSave={handleSaveWorkflowSettings}
          onClose={() => setShowWorkflowSettings(false)}
        />
      )}

      {/* User Input Dialog - shown when a user-input node is reached */}
      {pendingUserInput && (
        <UserInputDialog
          request={pendingUserInput}
          onSubmit={handleUserInputSubmit}
          onCancel={handleUserInputCancel}
        />
      )}
    </div>
  )
}

/**
 * WorkflowCanvas with ReactFlowProvider wrapper
 */
export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  )
}

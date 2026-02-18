/**
 * ContainerNode - Shared base component for collapsible container nodes
 *
 * Used by LoopNode and ParallelNode (broadcast mode) to provide consistent
 * collapse/expand behavior, stacked visual layers, and resizing.
 *
 * Features:
 * - Collapse/expand with dimension persistence
 * - Mini node previews showing external connections when collapsed
 * - Drag-and-drop feedback for adding/removing child nodes
 */

import { memo, useCallback, useEffect, useRef, useMemo, type ReactNode } from 'react'
import { Handle, Position, NodeResizer, useReactFlow, useUpdateNodeInternals } from '@xyflow/react'
import {
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
  Loader2,
  // Node type icons for mini previews
  MessageSquare,
  Bot,
  GitBranch,
  Repeat,
  Layers,
  Merge,
  Wrench,
  Code,
  Globe,
  Eye,
  User,
  AlertTriangle,
  Terminal,
  Workflow,
  Server,
  Zap,
  FileOutput,
  Play,
  ShieldCheck,
  MessagesSquare,
  Database,
  TableProperties,
  Search,
} from 'lucide-react'
import type { NodeExecutionStatus, WorkflowNodeType } from '../../../services/workflowTypes'
import { useWorkflowStore } from '../../../../stores/workflowStore'

// ============================================================================
// Types for External Connection Tracking
// ============================================================================

interface ExternalConnection {
  nodeId: string
  nodeType: WorkflowNodeType
  nodeLabel: string
  direction: 'incoming' | 'outgoing'
  /** The child node ID inside the container that this external node connects to */
  childNodeId: string
  edgeId: string
}

// ============================================================================
// Node Type Icon Mapping for Mini Previews
// ============================================================================

const NODE_TYPE_ICONS: Record<WorkflowNodeType, React.ComponentType<{ style?: React.CSSProperties }>> = {
  trigger: Play,
  prompt: MessageSquare,
  provider: Server,
  condition: GitBranch,
  loop: Repeat,
  parallel: Layers,
  merge: Merge,
  transformer: Code,
  api: Globe,
  tool: Wrench,
  'tool-call-parser': Code,
  'tool-call-router': Wrench,
  agent: Bot,
  'chat-agent': MessagesSquare,
  guardrail: ShieldCheck,
  callback: Eye,
  checkpoint: Eye, // Alias for callback
  'user-input': User,
  'error-handler': AlertTriangle,
  command: Terminal,
  'claude-code': Bot,
  workflow: Workflow,
  'mcp-tool': Server,
  code: Code,
  memory: Database,
  output: FileOutput,
  'web-search': Search,
  'database-query': TableProperties,
}

// Node type color mapping for mini previews
const NODE_TYPE_COLORS: Partial<Record<WorkflowNodeType, string>> = {
  prompt: 'var(--node-blue)',
  agent: 'var(--node-purple)',
  tool: 'var(--node-orange)',
  'tool-call-router': 'var(--node-orange)',
  condition: 'var(--node-amber)',
  callback: 'var(--node-amber)',
  'user-input': 'var(--node-teal)',
  provider: 'var(--node-green)',
  output: 'var(--node-green)',
  'error-handler': 'var(--node-rose)',
}

// ============================================================================
// Mini Node Preview Component
// ============================================================================

interface MiniNodePreviewProps {
  connection: ExternalConnection
  position: 'left' | 'right'
  index: number
  total: number
  containerColor: string
}

/**
 * Renders a small preview of an external node connected to a child inside the container
 */
function MiniNodePreview({ connection, position, index, total, containerColor }: MiniNodePreviewProps) {
  const Icon = NODE_TYPE_ICONS[connection.nodeType] || Zap
  const nodeColor = NODE_TYPE_COLORS[connection.nodeType] || 'var(--muted)'

  // Calculate vertical position - distribute evenly along the side
  const verticalOffset = total > 1
    ? 60 + (index * 28) // Start below header, 28px per mini node
    : 60 // Center if single connection

  return (
    <div
      style={{
        position: 'absolute',
        [position]: -36,
        top: verticalOffset,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        flexDirection: position === 'left' ? 'row' : 'row-reverse',
        zIndex: 5,
      }}
      title={`${connection.nodeLabel} (${connection.direction === 'incoming' ? 'connects to' : 'connected from'} child node)`}
    >
      {/* Connection line to container edge */}
      <div
        style={{
          width: 12,
          height: 2,
          background: `linear-gradient(${position === 'left' ? '90deg' : '270deg'}, ${nodeColor}, ${containerColor})`,
          opacity: 0.6,
        }}
      />

      {/* Mini node circle */}
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: `color-mix(in srgb, ${nodeColor} 15%, var(--panel))`,
          border: `2px solid ${nodeColor}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
          cursor: 'pointer',
          transition: 'transform 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.1)'
          e.currentTarget.style.boxShadow = `0 0 0 3px color-mix(in srgb, ${nodeColor} 30%, transparent)`
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)'
          e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.15)'
        }}
      >
        <Icon style={{ width: 12, height: 12, color: nodeColor }} />
      </div>
    </div>
  )
}

/**
 * Shows a summary badge when there are too many connections to show individually
 */
function ConnectionSummaryBadge({
  count,
  direction,
  position,
  containerColor,
}: {
  count: number
  direction: 'incoming' | 'outgoing'
  position: 'left' | 'right'
  containerColor: string
}) {
  return (
    <div
      style={{
        position: 'absolute',
        [position]: -32,
        top: 60,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        flexDirection: position === 'left' ? 'row' : 'row-reverse',
        zIndex: 5,
      }}
      title={`${count} ${direction} connection${count !== 1 ? 's' : ''} to child nodes`}
    >
      {/* Connection line */}
      <div
        style={{
          width: 8,
          height: 2,
          background: containerColor,
          opacity: 0.5,
        }}
      />

      {/* Count badge */}
      <div
        style={{
          minWidth: 20,
          height: 20,
          borderRadius: 10,
          background: `color-mix(in srgb, ${containerColor} 20%, var(--panel))`,
          border: `2px solid ${containerColor}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          fontWeight: 600,
          color: containerColor,
          padding: '0 4px',
        }}
      >
        {count}
      </div>
    </div>
  )
}

// ============================================================================
// Constants
// ============================================================================

// Maximum mini previews to show per side before switching to summary badge
const MAX_MINI_PREVIEWS = 3

// Expanded mode dimensions
export const CONTAINER_MIN_WIDTH = 280
export const CONTAINER_MIN_HEIGHT = 150

// Collapsed mode dimensions
export const COLLAPSED_WIDTH = 180
// Note: Collapsed height is auto-calculated from content, but we set a reasonable default
// for React Flow's internal dimension tracking. The actual rendered height may vary.
export const COLLAPSED_HEIGHT = 'auto' as const

export interface ContainerNodeProps {
  /** Node ID */
  id: string
  /** Whether the node is selected */
  selected?: boolean
  /** Whether the node is disabled */
  disabled?: boolean
  /** Whether the node is locked (position frozen) */
  locked?: boolean
  /** Whether the node is collapsed */
  isCollapsed: boolean
  /** Callback to toggle collapsed state */
  onToggleCollapsed: () => void
  /** Color variable suffix (e.g., 'cyan', 'indigo') */
  colorVar: string
  /** Icon component to render */
  icon: ReactNode
  /** Node label */
  label: string
  /** Execution status for status icon */
  executionStatus?: NodeExecutionStatus
  /** Badge content for header (e.g., loop type, wait strategy) */
  headerBadge?: ReactNode
  /** Metadata rows for collapsed view */
  collapsedMetadata?: ReactNode
  /** Body content for expanded view */
  expandedBody?: ReactNode
  /** Footer content for expanded view */
  expandedFooter?: ReactNode
  /** Additional handles to render */
  additionalHandles?: ReactNode
  /** Docked node previews - rendered outside overflow:hidden to prevent clipping */
  dockedPreviews?: ReactNode
  /** Saved width from node data (for restoring after expand) */
  savedWidth?: number
  /** Saved height from node data (for restoring after expand) */
  savedHeight?: number
}

/**
 * Renders execution status icon based on node state
 */
function StatusIcon({ status }: { status?: NodeExecutionStatus }) {
  if (!status) return null

  switch (status) {
    case 'running':
      return <Loader2 style={{ width: 14, height: 14, color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
    case 'completed':
      return <CheckCircle style={{ width: 14, height: 14, color: 'var(--success)' }} />
    case 'failed':
      return <XCircle style={{ width: 14, height: 14, color: 'var(--error)' }} />
    default:
      return null
  }
}

export const ContainerNode = memo(({
  id,
  selected = false,
  disabled = false,
  locked = false,
  isCollapsed,
  onToggleCollapsed,
  colorVar,
  icon,
  label,
  executionStatus,
  headerBadge,
  collapsedMetadata,
  expandedBody,
  expandedFooter,
  additionalHandles,
  dockedPreviews,
  savedWidth,
  savedHeight,
}: ContainerNodeProps) => {
  const reactFlow = useReactFlow()
  const updateNodeInternals = useUpdateNodeInternals()
  const updateNodeData = useWorkflowStore(state => state.updateNodeData)
  const prevCollapsedRef = useRef(isCollapsed)
  const containerRef = useRef<HTMLDivElement>(null)

  // Subscribe to drag state for visual feedback
  const dragState = useWorkflowStore(state => state.dragState)

  // Get nodes and edges from store for computing external connections
  const storeNodes = useWorkflowStore(state => state.nodes)
  const storeEdges = useWorkflowStore(state => state.edges)

  // Compute external connections when collapsed
  // These are edges that connect external nodes to child nodes inside this container
  const externalConnections = useMemo(() => {
    if (!isCollapsed) return { incoming: [], outgoing: [] }

    // Get IDs of all child nodes inside this container
    const childNodeIds = new Set(
      storeNodes
        .filter(n => n.parentId === id)
        .map(n => n.id)
    )

    if (childNodeIds.size === 0) return { incoming: [], outgoing: [] }

    const incoming: ExternalConnection[] = []
    const outgoing: ExternalConnection[] = []

    for (const edge of storeEdges) {
      const sourceIsChild = childNodeIds.has(edge.source)
      const targetIsChild = childNodeIds.has(edge.target)

      // Skip internal edges (both endpoints are children)
      if (sourceIsChild && targetIsChild) continue

      // Skip edges that don't involve child nodes
      if (!sourceIsChild && !targetIsChild) continue

      // Find the external node
      const externalNodeId = sourceIsChild ? edge.target : edge.source
      const childNodeId = sourceIsChild ? edge.source : edge.target
      const externalNode = storeNodes.find(n => n.id === externalNodeId)

      if (!externalNode) continue

      // Don't show connections to the container itself (input/output handles)
      if (externalNodeId === id) continue

      const connection: ExternalConnection = {
        nodeId: externalNodeId,
        nodeType: externalNode.type as WorkflowNodeType,
        nodeLabel: (externalNode.data as { label?: string })?.label || externalNodeId,
        direction: sourceIsChild ? 'outgoing' : 'incoming',
        childNodeId,
        edgeId: edge.id,
      }

      if (sourceIsChild) {
        outgoing.push(connection)
      } else {
        incoming.push(connection)
      }
    }

    return { incoming, outgoing }
  }, [isCollapsed, id, storeNodes, storeEdges])

  // Determine if a node is being dragged into this container
  const isHoveredDuringDrag = dragState?.hoverContainerId === id
  // Determine if a node is being dragged out of this container
  const isExitingDrag = dragState?.exitingContainerId === id

  // Update node internals when collapsed state changes
  useEffect(() => {
    if (prevCollapsedRef.current !== isCollapsed) {
      const wasCollapsed = prevCollapsedRef.current
      prevCollapsedRef.current = isCollapsed

      // Update dimensions based on collapsed state
      reactFlow.setNodes(nodes => nodes.map(node => {
        if (node.id !== id) return node

        if (isCollapsed) {
          // Save current dimensions to node data before collapsing
          if (!wasCollapsed && node.width && node.height) {
            // Save dimensions to node data so they persist
            updateNodeData(id, {
              _savedWidth: node.width,
              _savedHeight: node.height,
            })
          }
          // Set explicit collapsed dimensions so React Flow updates its internal tracking
          // Height will be re-measured from DOM after render
          return {
            ...node,
            width: COLLAPSED_WIDTH,
            height: undefined, // Will be measured and set in RAF below
            style: { ...node.style, width: COLLAPSED_WIDTH, height: 'auto' },
          }
        } else {
          // Expanding - restore saved dimensions from props or use defaults
          // When expanding from collapsed state, node.width is COLLAPSED_WIDTH and height is undefined
          // So we must use savedWidth/savedHeight from data or fall back to minimum container size
          const newWidth = savedWidth && savedWidth >= CONTAINER_MIN_WIDTH
            ? savedWidth
            : CONTAINER_MIN_WIDTH
          const newHeight = savedHeight && savedHeight >= CONTAINER_MIN_HEIGHT
            ? savedHeight
            : CONTAINER_MIN_HEIGHT
          return {
            ...node,
            width: newWidth,
            height: newHeight,
            style: { ...node.style, width: newWidth, height: newHeight },
          }
        }
      }))

      // Use requestAnimationFrame to ensure DOM has updated before recalculating
      requestAnimationFrame(() => {
        // If collapsed, measure actual DOM height and update node dimensions
        if (isCollapsed && containerRef.current) {
          const measuredHeight = containerRef.current.getBoundingClientRect().height
          if (measuredHeight > 0) {
            reactFlow.setNodes(nodes => nodes.map(node => {
              if (node.id !== id) return node
              return {
                ...node,
                height: measuredHeight,
                style: { ...node.style, height: measuredHeight },
              }
            }))
          }
        }
        updateNodeInternals(id)
        // Also update child nodes so their edges recalculate
        const childNodes = reactFlow.getNodes().filter(n => n.parentId === id)
        childNodes.forEach(child => updateNodeInternals(child.id))
      })
    }
  }, [isCollapsed, id, updateNodeInternals, reactFlow, updateNodeData, savedWidth, savedHeight])

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleCollapsed()
  }, [onToggleCollapsed])

  // Handle resize end - save dimensions to node data for persistence
  const handleResizeEnd = useCallback((_event: unknown, params: { width: number; height: number }) => {
    if (params.width >= CONTAINER_MIN_WIDTH && params.height >= CONTAINER_MIN_HEIGHT) {
      updateNodeData(id, {
        _savedWidth: params.width,
        _savedHeight: params.height,
      })
    }
  }, [id, updateNodeData])

  const color = `var(--node-${colorVar})`

  // Calculate border and shadow styles based on drag state
  const getDragFeedbackStyles = () => {
    if (isHoveredDuringDrag) {
      // Node is being dragged INTO this container - highlight with success color
      return {
        border: `2px solid var(--success)`,
        boxShadow: `0 0 0 3px color-mix(in srgb, var(--success) 30%, transparent), inset 0 0 20px color-mix(in srgb, var(--success) 10%, transparent)`,
      }
    }
    if (isExitingDrag) {
      // Node is being dragged OUT of this container - warning feedback
      return {
        border: `2px dashed var(--warning, orange)`,
        boxShadow: `0 0 0 3px color-mix(in srgb, var(--warning, orange) 25%, transparent)`,
      }
    }
    return null
  }

  const dragFeedbackStyles = getDragFeedbackStyles()

  // Collapsed view - stacked/layered node representation
  if (isCollapsed) {
    return (
      <div
        ref={containerRef}
        className={[disabled && 'workflow-node-disabled', locked && 'workflow-node-locked'].filter(Boolean).join(' ')}
        style={{
          position: 'relative',
          width: COLLAPSED_WIDTH,
        }}
      >
        {/* Stacked layers behind to indicate container nature */}
        <div
          style={{
            position: 'absolute',
            top: 6,
            left: 6,
            width: COLLAPSED_WIDTH - 6,
            height: 'calc(100% - 6px)',
            borderRadius: '8px',
            background: `color-mix(in srgb, ${color} 10%, var(--panel))`,
            border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 3,
            left: 3,
            width: COLLAPSED_WIDTH - 3,
            height: 'calc(100% - 3px)',
            borderRadius: '8px',
            background: `color-mix(in srgb, ${color} 15%, var(--panel))`,
            border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
          }}
        />

        {/* Main collapsed card */}
        <div
          style={{
            position: 'relative',
            borderRadius: '8px',
            background: 'var(--panel)',
            border: `2px solid ${selected ? color : 'var(--border)'}`,
            boxShadow: selected ? `0 0 0 2px color-mix(in srgb, ${color} 20%, transparent)` : '0 2px 4px rgba(0,0,0,0.1)',
            transition: 'border-color 0.2s, box-shadow 0.2s',
            overflow: 'hidden',
          }}
        >
          {/* Input Handle */}
          <Handle
            type="target"
            position={Position.Left}
            id="input"
            style={{
              width: 12,
              height: 12,
              background: color,
              border: '2px solid var(--panel)',
              top: 24,
            }}
          />

          {/* Header row */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            padding: '8px 10px',
            gap: '6px',
            borderBottom: '1px solid var(--border)',
            background: `color-mix(in srgb, ${color} 8%, transparent)`,
          }}>
            {/* Expand button */}
            <button
              onClick={handleToggle}
              style={{
                background: 'none',
                border: 'none',
                padding: '2px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: color,
                flexShrink: 0,
              }}
              title="Expand"
            >
              <ChevronRight style={{ width: 14, height: 14 }} />
            </button>

            {/* Icon */}
            <div style={{ flexShrink: 0, color: color }}>
              {icon}
            </div>

            {/* Label */}
            <span style={{
              fontWeight: 500,
              fontSize: '12px',
              color: 'var(--text)',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {label}
            </span>

            <StatusIcon status={executionStatus} />
          </div>

          {/* Metadata rows */}
          {collapsedMetadata && (
            <div style={{
              padding: '6px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}>
              {collapsedMetadata}
            </div>
          )}

          {/* Output Handle */}
          <Handle
            type="source"
            position={Position.Right}
            id="output"
            style={{
              width: 12,
              height: 12,
              background: color,
              border: '2px solid var(--panel)',
              top: 24,
            }}
          />

          {additionalHandles}
        </div>

        {/* Docked node previews - rendered outside overflow:hidden to prevent clipping */}
        {dockedPreviews}

        {/* Mini node previews for external connections (LEFT side - incoming) */}
        {externalConnections.incoming.length > 0 && (
          externalConnections.incoming.length <= MAX_MINI_PREVIEWS ? (
            externalConnections.incoming.map((conn, idx) => (
              <MiniNodePreview
                key={conn.edgeId}
                connection={conn}
                position="left"
                index={idx}
                total={externalConnections.incoming.length}
                containerColor={color}
              />
            ))
          ) : (
            <ConnectionSummaryBadge
              count={externalConnections.incoming.length}
              direction="incoming"
              position="left"
              containerColor={color}
            />
          )
        )}

        {/* Mini node previews for external connections (RIGHT side - outgoing) */}
        {externalConnections.outgoing.length > 0 && (
          externalConnections.outgoing.length <= MAX_MINI_PREVIEWS ? (
            externalConnections.outgoing.map((conn, idx) => (
              <MiniNodePreview
                key={conn.edgeId}
                connection={conn}
                position="right"
                index={idx}
                total={externalConnections.outgoing.length}
                containerColor={color}
              />
            ))
          ) : (
            <ConnectionSummaryBadge
              count={externalConnections.outgoing.length}
              direction="outgoing"
              position="right"
              containerColor={color}
            />
          )
        )}
      </div>
    )
  }

  // Expanded view - full container
  return (
    <>
      {/* Resizer - only when selected */}
      <NodeResizer
        minWidth={CONTAINER_MIN_WIDTH}
        minHeight={CONTAINER_MIN_HEIGHT}
        isVisible={selected}
        lineStyle={{ borderColor: color, borderWidth: 1 }}
        handleStyle={{
          width: 8,
          height: 8,
          backgroundColor: color,
          borderRadius: 2,
        }}
        onResizeEnd={handleResizeEnd}
      />

      <div
        className={[disabled && 'workflow-node-disabled', locked && 'workflow-node-locked'].filter(Boolean).join(' ')}
        style={{
          width: '100%',
          height: '100%',
          minWidth: CONTAINER_MIN_WIDTH,
          minHeight: CONTAINER_MIN_HEIGHT,
          borderRadius: '12px',
          background: dragFeedbackStyles
            ? `color-mix(in srgb, ${isHoveredDuringDrag ? 'var(--success)' : 'var(--warning, orange)'} 8%, var(--panel))`
            : `color-mix(in srgb, ${color} 5%, var(--panel))`,
          border: dragFeedbackStyles?.border || `2px ${selected ? 'solid' : 'dashed'} ${selected ? color : `color-mix(in srgb, ${color} 50%, transparent)`}`,
          boxShadow: dragFeedbackStyles?.boxShadow || (selected ? `0 0 0 2px color-mix(in srgb, ${color} 20%, transparent)` : 'none'),
          transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Input Handle */}
        <Handle
          type="target"
          position={Position.Left}
          id="input"
          style={{
            width: 12,
            height: 12,
            background: color,
            border: '2px solid var(--panel)',
            top: 24,
          }}
        />

        {/* Header bar */}
        <div style={{
          padding: '8px 12px',
          borderBottom: `1px solid color-mix(in srgb, ${color} 20%, transparent)`,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: `color-mix(in srgb, ${color} 10%, transparent)`,
          borderRadius: '10px 10px 0 0',
        }}>
          {/* Collapse button */}
          <button
            onClick={handleToggle}
            style={{
              background: 'none',
              border: 'none',
              padding: '2px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: color,
              flexShrink: 0,
            }}
            title="Collapse"
          >
            <ChevronDown style={{ width: 14, height: 14 }} />
          </button>

          <div style={{ flexShrink: 0, color: color }}>
            {icon}
          </div>
          <span style={{ fontWeight: 500, fontSize: '12px', color: 'var(--text)', flex: 1 }}>
            {label}
          </span>

          {/* Header badge */}
          {headerBadge && (
            <div style={{
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '10px',
              background: `color-mix(in srgb, ${color} 20%, transparent)`,
              color: color,
              fontWeight: 500,
            }}>
              {headerBadge}
            </div>
          )}

          <StatusIcon status={executionStatus} />
        </div>

        {/* Body area - where child nodes go */}
        <div style={{
          flex: 1,
          padding: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 80,
          position: 'relative',
        }}>
          {expandedBody}
          {/* Drag feedback overlay */}
          {(isHoveredDuringDrag || isExitingDrag) && (
            <div style={{
              position: 'absolute',
              inset: 4,
              borderRadius: '8px',
              border: `2px dashed ${isHoveredDuringDrag ? 'var(--success)' : 'var(--warning, orange)'}`,
              background: `color-mix(in srgb, ${isHoveredDuringDrag ? 'var(--success)' : 'var(--warning, orange)'} 5%, transparent)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 10,
            }}>
              <span style={{
                fontSize: '11px',
                fontWeight: 500,
                color: isHoveredDuringDrag ? 'var(--success)' : 'var(--warning, orange)',
                background: 'var(--panel)',
                padding: '4px 8px',
                borderRadius: '4px',
              }}>
                {isHoveredDuringDrag ? 'Drop to add' : 'Dragging out'}
              </span>
            </div>
          )}
        </div>

        {/* Footer with stats */}
        {expandedFooter && (
          <div style={{
            padding: '6px 12px',
            borderTop: `1px solid color-mix(in srgb, ${color} 20%, transparent)`,
            fontSize: '10px',
            color: 'var(--text-secondary)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            {expandedFooter}
          </div>
        )}

        {/* Output Handle */}
        <Handle
          type="source"
          position={Position.Right}
          id="output"
          style={{
            width: 12,
            height: 12,
            background: color,
            border: '2px solid var(--panel)',
            top: 24,
          }}
        />

        {additionalHandles}

        {/* Docked node previews - rendered at top level to prevent clipping */}
        {dockedPreviews}
      </div>
    </>
  )
})

ContainerNode.displayName = 'ContainerNode'

/**
 * Helper component for metadata rows in collapsed view
 */
export function MetadataRow({ label, value, badge = false, color }: {
  label: string
  value: ReactNode
  badge?: boolean
  color?: string
}) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      fontSize: '10px',
    }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      {badge ? (
        <span style={{
          padding: '1px 6px',
          borderRadius: '3px',
          background: color ? `color-mix(in srgb, ${color} 15%, transparent)` : 'var(--panel-2)',
          color: color || 'var(--text)',
          fontWeight: 500,
        }}>
          {value}
        </span>
      ) : (
        <span style={{ color: 'var(--text)', fontWeight: 500 }}>
          {value}
        </span>
      )}
    </div>
  )
}

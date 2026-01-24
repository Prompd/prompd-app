/**
 * ToolCallRouterNode - Container node for grouping Tool nodes
 *
 * This node acts as a container that groups Tool nodes together and routes
 * tool calls from Agent nodes to the appropriate Tool node based on tool name.
 *
 * Connection Pattern (Router placed to the RIGHT of Agent - horizontal flow):
 *   Agent.tools (source, right@65%) --> ToolCallRouter.input (target, left@35%)
 *   ToolCallRouter.toolResult (source, left@65%) --> Agent.toolResult (target, right@80%)
 *
 * This horizontal layout keeps the Agent's checkpoint handle (bottom) free for
 * connecting to Callback nodes below without edge crossings.
 *
 * The router internally handles tool execution - no internal dispatch/collect handles needed.
 * Tool nodes are placed inside the container (via parentId) and the router auto-collects
 * their schemas and routes tool calls by name.
 */

import { memo, useCallback, useMemo, useEffect, useRef } from 'react'
import { Handle, Position, NodeResizer, useReactFlow, useUpdateNodeInternals } from '@xyflow/react'
import { Route, Wrench, ChevronDown, ChevronRight, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import type { ToolCallRouterNodeData, BaseNodeData, ToolNodeData, NodeExecutionStatus } from '../../../services/workflowTypes'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import { DockedNodePreview, useDockedNodes } from './DockedNodePreview'
import { DOCKABLE_HANDLES } from '../../../services/workflowTypes'
import { getNodeColor } from '../nodeColors'

const handleSize = 12
const handleBorder = '2px solid var(--panel)'

// Container dimensions
const CONTAINER_MIN_WIDTH = 280
const CONTAINER_MIN_HEIGHT = 150
const COLLAPSED_WIDTH = 180

interface ToolCallRouterNodeProps {
  id: string
  data: BaseNodeData
  selected?: boolean
}

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

export const ToolCallRouterNode = memo(({ id, data, selected }: ToolCallRouterNodeProps) => {
  const nodeData = data as ToolCallRouterNodeData
  const executionState = useWorkflowStore(state => state.executionState)
  const updateNodeData = useWorkflowStore(state => state.updateNodeData)
  const nodes = useWorkflowStore(state => state.nodes)
  const dragState = useWorkflowStore(state => state.dragState)
  const dockingState = useWorkflowStore(state => state.dockingState)
  const nodeState = executionState?.nodeStates[id]
  const reactFlow = useReactFlow()
  const updateNodeInternals = useUpdateNodeInternals()
  const prevCollapsedRef = useRef(nodeData.collapsed ?? false)

  // Check if this node is docked to another node
  const isDocked = !!(nodeData as BaseNodeData).dockedTo

  const dockedToToolRouterDock = useDockedNodes(id, 'ai-output')
  const toolRouterDockHandleConfig = DOCKABLE_HANDLES.find(
    h => h.nodeType === 'tool-call-router' && h.handleId === 'toolResult'
  )

  const toolRouterInputDockHandleConfig = DOCKABLE_HANDLES.find(
    h => h.nodeType === 'tool-call-router' && h.handleId === 'ai-input'
  )

  const isToolRouterDockTarget = dockingState?.hoveredDockTarget?.nodeId === id &&
    (dockingState?.hoveredDockTarget?.handleId === 'toolResult' || dockingState?.hoveredDockTarget?.handleId === "ai-input")

  // Count child Tool nodes (nodes with parentId === this node's id)
  const childToolNodes = useMemo(() => {
    return nodes.filter(n => n.parentId === id && n.type === 'tool')
  }, [nodes, id])

  const childCount = childToolNodes.length

  // Collect tool names from child nodes for display
  const toolNames = useMemo(() => {
    return childToolNodes
      .map(n => (n.data as ToolNodeData).toolName || (n.data as BaseNodeData).label)
      .filter(Boolean)
  }, [childToolNodes])

  const isCollapsed = nodeData.collapsed ?? false

  // Drag feedback
  const isHoveredDuringDrag = dragState?.hoverContainerId === id
  const isExitingDrag = dragState?.exitingContainerId === id

  // Handle collapse/expand
  useEffect(() => {
    if (prevCollapsedRef.current !== isCollapsed) {
      const wasCollapsed = prevCollapsedRef.current
      prevCollapsedRef.current = isCollapsed

      const savedWidth = (nodeData as Record<string, unknown>)._savedWidth as number | undefined
      const savedHeight = (nodeData as Record<string, unknown>)._savedHeight as number | undefined

      reactFlow.setNodes(nodes => nodes.map(node => {
        if (node.id !== id) return node

        if (isCollapsed) {
          if (!wasCollapsed && node.width && node.height) {
            updateNodeData(id, {
              _savedWidth: node.width,
              _savedHeight: node.height,
            })
          }
          return {
            ...node,
            width: COLLAPSED_WIDTH,
            height: undefined,
            style: { ...node.style, width: COLLAPSED_WIDTH, height: undefined },
          }
        } else {
          const newWidth = savedWidth && savedWidth >= CONTAINER_MIN_WIDTH ? savedWidth : CONTAINER_MIN_WIDTH
          const newHeight = savedHeight && savedHeight >= CONTAINER_MIN_HEIGHT ? savedHeight : CONTAINER_MIN_HEIGHT
          return {
            ...node,
            width: newWidth,
            height: newHeight,
            style: { ...node.style, width: newWidth, height: newHeight },
          }
        }
      }))

      requestAnimationFrame(() => {
        updateNodeInternals(id)
        const childNodes = reactFlow.getNodes().filter(n => n.parentId === id)
        childNodes.forEach(child => updateNodeInternals(child.id))
      })
    }
  }, [isCollapsed, id, updateNodeInternals, reactFlow, updateNodeData, nodeData])

  const toggleCollapsed = useCallback(() => {
    updateNodeData(id, { collapsed: !isCollapsed })
  }, [id, isCollapsed, updateNodeData])

  const handleResizeEnd = useCallback((_event: unknown, params: { width: number; height: number }) => {
    if (params.width >= CONTAINER_MIN_WIDTH && params.height >= CONTAINER_MIN_HEIGHT) {
      updateNodeData(id, {
        _savedWidth: params.width,
        _savedHeight: params.height,
      })
    }
  }, [id, updateNodeData])

  // Routing mode display
  const getRoutingModeLabel = () => {
    switch (nodeData.routingMode) {
      case 'name-match': return 'Name Match'
      case 'pattern': return 'Pattern'
      case 'fallback': return 'Fallback'
      default: return 'Name Match'
    }
  }

  // Colors
  const nodeColor = getNodeColor('tool-call-router')

  // Collapsed view
  if (isCollapsed) {
    return (
      <div className={nodeData.disabled ? 'workflow-node-disabled' : ''} style={{ position: 'relative', width: COLLAPSED_WIDTH }}>
        {/* Stacked layers - visual effect only */}
        <div style={{
          position: 'absolute', top: 6, left: 6,
          width: COLLAPSED_WIDTH - 6, height: 'calc(100% - 6px)',
          borderRadius: '8px',
          background: `color-mix(in srgb, ${nodeColor} 10%, var(--panel))`,
          border: `1px solid color-mix(in srgb, ${nodeColor} 30%, transparent)`,
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', top: 3, left: 3,
          width: COLLAPSED_WIDTH - 3, height: 'calc(100% - 3px)',
          borderRadius: '8px',
          background: `color-mix(in srgb, ${nodeColor} 15%, var(--panel))`,
          border: `1px solid color-mix(in srgb, ${nodeColor} 40%, transparent)`,
          pointerEvents: 'none',
        }} />

        {/* Main card */}
        <div style={{
          position: 'relative',
          borderRadius: '8px',
          background: 'var(--panel)',
          border: `2px solid ${selected ? nodeColor : 'var(--border)'}`,
          boxShadow: selected ? `0 0 0 2px color-mix(in srgb, ${nodeColor} 20%, transparent)` : '0 2px 4px rgba(0,0,0,0.1)',
          overflow: 'hidden',
        }}>

          {/* Tools Input Handle (LEFT, upper) - receives from Agent's tools output */}
          <Handle
            type="target"
            position={Position.Left}
            id="ai-input"
            style={{
              width: isToolRouterDockTarget ? handleSize + 4 : handleSize,
              height: isToolRouterDockTarget ? handleSize + 4 : handleSize,
              background: 'var(--node-orange, #f97316)',
              border: '2px solid var(--panel)',
              top: '25%',
              zIndex: 10,
              boxShadow: isToolRouterDockTarget ? '0 0 0 4px color-mix(in srgb, var(--node-amber) 50%, transparent), 0 0 12px var(--node-amber)' : undefined,
              transition: 'width 0.15s, height 0.15s, box-shadow 0.15s',
            }}
            title="Connect from Agent's tools handle"
          />

          {/* Tool Result Output Handle (LEFT, lower) - sends back to Agent's toolResult */}
          <Handle
            type="source"
            position={Position.Left}
            id="toolResult"
            style={{
              width: isToolRouterDockTarget ? handleSize + 4 : handleSize,
              height: isToolRouterDockTarget ? handleSize + 4 : handleSize,
              background: nodeColor,
              border: '2px solid var(--panel)',
              top: '40%',
              zIndex: 10,
              boxShadow: isToolRouterDockTarget ? '0 0 0 4px color-mix(in srgb, var(--node-amber) 50%, transparent), 0 0 12px var(--node-amber)' : undefined,
              transition: 'width 0.15s, height 0.15s, box-shadow 0.15s',
            }}
            title="Sends tool results back to Agent's toolResult input"
          />
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', padding: '8px 10px', gap: '6px',
            borderBottom: isDocked ? `1px solid color-mix(in srgb, ${nodeColor} 20%, transparent)` : '1px solid var(--border)',
            background: isDocked ? `color-mix(in srgb, ${nodeColor} 12%, transparent)` : `color-mix(in srgb, ${nodeColor} 8%, transparent)`,
          }}>
            <button onClick={toggleCollapsed} style={{
              background: 'none', border: 'none', padding: '2px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: nodeColor, flexShrink: 0,
            }} title="Expand">
              <ChevronRight style={{ width: 14, height: 14 }} />
            </button>
            <div style={{ flexShrink: 0, color: nodeColor }}>
              <Route style={{ width: 14, height: 14 }} />
            </div>
            <span style={{
              fontWeight: 600, fontSize: '11px', color: isDocked ? nodeColor : 'var(--text)',
              flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {nodeData.label || 'Tool Router'}
            </span>
            <StatusIcon status={nodeState?.status} />
          </div>

          {/* Metadata */}
          <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {/* Tools count - prominent display */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 8px',
              background: `color-mix(in srgb, ${nodeColor} ${isDocked ? '15' : '10'}%, transparent)`,
              borderRadius: '4px',
            }}>
              <Wrench style={{ width: 14, height: 14, color: nodeColor }} />
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', flex: 1 }}>
                Tools
              </span>
              <span style={{
                fontSize: '13px',
                fontWeight: 700,
                color: nodeColor,
                minWidth: '20px',
                textAlign: 'right',
              }}>
                {childCount}
              </span>
            </div>

            {/* Mode indicator */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Mode</span>
              <span style={{
                padding: '2px 8px', borderRadius: '4px',
                background: `color-mix(in srgb, ${nodeColor} 15%, transparent)`,
                color: nodeColor, fontWeight: 500,
              }}>{getRoutingModeLabel()}</span>
            </div>

            {/* Tool names preview */}
            {toolNames.length > 0 && (
              <div style={{
                fontSize: '9px', color: 'var(--text-secondary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                fontStyle: 'italic',
              }}>
                {toolNames.slice(0, 2).join(', ')}
                {toolNames.length > 2 && ` +${toolNames.length - 2}`}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Expanded view
  const getDragFeedbackStyles = () => {
    if (isHoveredDuringDrag) {
      return {
        border: `2px solid var(--success)`,
        boxShadow: `0 0 0 3px color-mix(in srgb, var(--success) 30%, transparent), inset 0 0 20px color-mix(in srgb, var(--success) 10%, transparent)`,
      }
    }
    if (isExitingDrag) {
      return {
        border: `2px dashed var(--warning, orange)`,
        boxShadow: `0 0 0 3px color-mix(in srgb, var(--warning, orange) 25%, transparent)`,
      }
    }
    return null
  }

  const dragFeedbackStyles = getDragFeedbackStyles()

  return (
    <>
      <NodeResizer
        minWidth={CONTAINER_MIN_WIDTH}
        minHeight={CONTAINER_MIN_HEIGHT}
        isVisible={selected}
        lineStyle={{ borderColor: nodeColor, borderWidth: 1 }}
        handleStyle={{ width: 8, height: 8, backgroundColor: nodeColor, borderRadius: 2 }}
        onResizeEnd={handleResizeEnd}
      />

      {/* Tools Input Handle (LEFT, upper) - receives from Agent's tools output */}
      <Handle
        type="target"
        position={Position.Left}
        id="ai-input"
        style={{
          width: isToolRouterDockTarget ? handleSize + 4 : handleSize,
          height: isToolRouterDockTarget ? handleSize + 4 : handleSize,
          background: 'var(--node-orange, #f97316)',
          border: '2px solid var(--panel)',
          top: '15%',
          zIndex: 10,
          boxShadow: isToolRouterDockTarget ? '0 0 0 4px color-mix(in srgb, var(--node-amber) 50%, transparent), 0 0 12px var(--node-amber)' : undefined,
          transition: 'width 0.15s, height 0.15s, box-shadow 0.15s',
        }}
        title="Connect from Agent's ai-output handle"
      />

      {/* Tool Result Output Handle (LEFT, lower) - sends back to Agent's toolResult */}
      <Handle
        type="source"
        position={Position.Left}
        id="toolResult"
        style={{
          width: isToolRouterDockTarget ? handleSize + 4 : handleSize,
          height: isToolRouterDockTarget ? handleSize + 4 : handleSize,
          background: nodeColor,
          border: '2px solid var(--panel)',
          top: 'calc(15% + 20px)',
          zIndex: 10,
          boxShadow: isToolRouterDockTarget ? '0 0 0 4px color-mix(in srgb, var(--node-amber) 50%, transparent), 0 0 12px var(--node-amber)' : undefined,
          transition: 'width 0.15s, height 0.15s, box-shadow 0.15s',
        }}
        title="Sends tool results back to Agent's toolResult input"
      />

      <div
        className={nodeData.disabled ? 'workflow-node-disabled' : ''}
        style={{
        width: '100%', height: '100%',
        minWidth: CONTAINER_MIN_WIDTH, minHeight: CONTAINER_MIN_HEIGHT,
        borderRadius: '12px',
        background: dragFeedbackStyles
          ? `color-mix(in srgb, ${isHoveredDuringDrag ? 'var(--success)' : 'var(--warning, orange)'} 8%, var(--panel))`
          : `color-mix(in srgb, ${nodeColor} 5%, var(--panel))`,
        border: dragFeedbackStyles?.border || `2px ${selected ? 'solid' : 'dashed'} ${selected ? nodeColor : `color-mix(in srgb, ${nodeColor} 50%, transparent)`}`,
        boxShadow: dragFeedbackStyles?.boxShadow || (selected ? `0 0 0 2px color-mix(in srgb, ${nodeColor} 20%, transparent)` : 'none'),
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '8px 12px',
          borderBottom: `1px solid color-mix(in srgb, ${nodeColor} 20%, transparent)`,
          display: 'flex', alignItems: 'center', gap: '8px',
          background: `color-mix(in srgb, ${nodeColor} 10%, transparent)`,
          borderRadius: '10px 10px 0 0',
        }}>
          <button onClick={toggleCollapsed} style={{
            background: 'none', border: 'none', padding: '2px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: nodeColor, flexShrink: 0,
          }} title="Collapse">
            <ChevronDown style={{ width: 14, height: 14 }} />
          </button>
          <div style={{ flexShrink: 0, color: nodeColor }}>
            <Route style={{ width: 14, height: 14 }} />
          </div>
          <span style={{ fontWeight: 500, fontSize: '12px', color: 'var(--text)', flex: 1 }}>
            {nodeData.label || 'Tool Router'}
          </span>
          <div style={{
            padding: '2px 6px', borderRadius: '4px', fontSize: '10px',
            background: `color-mix(in srgb, ${nodeColor} 20%, transparent)`,
            color: nodeColor, fontWeight: 500,
          }}>
            {getRoutingModeLabel()}
          </div>
          <StatusIcon status={nodeState?.status} />
        </div>

        {/* Body - child Tool nodes render here via React Flow parentId */}
        <div style={{
          flex: 1, padding: '8px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: 80, position: 'relative',
        }}>
          {/* Empty state */}
          {childCount === 0 && (
            <div style={{
              color: 'var(--muted)', fontSize: '11px', textAlign: 'center', padding: '16px',
            }}>
              Drag Tool nodes here
            </div>
          )}

          {/* Drag feedback overlay */}
          {(isHoveredDuringDrag || isExitingDrag) && (
            <div style={{
              position: 'absolute', inset: 4, borderRadius: '8px',
              border: `2px dashed ${isHoveredDuringDrag ? 'var(--success)' : 'var(--warning, orange)'}`,
              background: `color-mix(in srgb, ${isHoveredDuringDrag ? 'var(--success)' : 'var(--warning, orange)'} 5%, transparent)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none', zIndex: 10,
            }}>
              <span style={{
                fontSize: '11px', fontWeight: 500,
                color: isHoveredDuringDrag ? 'var(--success)' : 'var(--warning, orange)',
                background: 'var(--panel)', padding: '4px 8px', borderRadius: '4px',
              }}>
                {isHoveredDuringDrag ? 'Drop to add' : 'Dragging out'}
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '6px 12px',
          borderTop: `1px solid color-mix(in srgb, ${nodeColor} 20%, transparent)`,
          fontSize: '10px', color: 'var(--text-secondary)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Wrench style={{ width: 10, height: 10 }} />
            {childCount > 0 ? `${childCount} tool${childCount !== 1 ? 's' : ''}` : 'No tools'}
          </span>
          <span>{getRoutingModeLabel()}</span>
        </div>
      </div>
    </>
  )
})

ToolCallRouterNode.displayName = 'ToolCallRouterNode'

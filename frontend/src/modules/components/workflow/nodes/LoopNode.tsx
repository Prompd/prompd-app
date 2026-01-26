/**
 * LoopNode - Container node for loop iteration
 *
 * Child nodes can be dragged inside this container.
 * The executor finds body nodes via parentId relationship.
 *
 * Uses shared ContainerNode for collapse/expand behavior.
 */

import { memo, useCallback } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Repeat, Play, Square } from 'lucide-react'
import { ContainerNode, MetadataRow } from './ContainerNode'
import type { LoopNodeData, BaseNodeData, WorkflowNodeType } from '../../../services/workflowTypes'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import { DockedNodePreview, useDockedNodes } from './DockedNodePreview'
import { DOCKABLE_HANDLES } from '../../../services/workflowTypes'

interface LoopNodeProps {
  id: string
  data: BaseNodeData
  selected?: boolean
}

export const LoopNode = memo(({ id, data, selected }: LoopNodeProps) => {
  const nodeData = data as LoopNodeData
  const executionState = useWorkflowStore(state => state.executionState)
  const updateNodeData = useWorkflowStore(state => state.updateNodeData)
  const nodeState = executionState?.nodeStates[id]
  const output = executionState?.nodeOutputs[id] as { iterations?: number } | undefined

  // Subscribe to nodes from store for reactive child count updates
  const childCount = useWorkflowStore(state =>
    state.nodes.filter(n => n.parentId === id).length
  )

  // Get nodes docked to the onIteration handle
  const dockedToIteration = useDockedNodes(id, 'onIteration')
  const iterationHandleConfig = DOCKABLE_HANDLES.find(
    h => h.nodeType === 'loop' && h.handleId === 'onIteration'
  )

  // Get nodes docked to the toolRouterDock handle
  const dockedToToolRouterDock = useDockedNodes(id, 'toolRouterDock')
  const toolRouterDockHandleConfig = DOCKABLE_HANDLES.find(
    h => h.nodeType === 'loop' && h.handleId === 'toolRouterDock'
  )

  // Check if this handle is being targeted for docking
  const dockingState = useWorkflowStore(state => state.dockingState)
  const isIterationDockTarget = dockingState?.hoveredDockTarget?.nodeId === id &&
    dockingState?.hoveredDockTarget?.handleId === 'onIteration'
  const isToolRouterDockTarget = dockingState?.hoveredDockTarget?.nodeId === id &&
    dockingState?.hoveredDockTarget?.handleId === 'toolRouterDock'

  const isCollapsed = nodeData.collapsed ?? false

  const toggleCollapsed = useCallback(() => {
    updateNodeData(id, { collapsed: !isCollapsed })
  }, [id, isCollapsed, updateNodeData])

  const getLoopTypeLabel = () => {
    switch (nodeData.loopType) {
      case 'while':
        return 'While'
      case 'for-each':
        return 'For Each'
      case 'count':
        return `${nodeData.count || 0}x`
      default:
        return 'Loop'
    }
  }

  // Collapsed metadata content
  const collapsedMetadata = (
    <>
      <MetadataRow
        label="Type"
        value={getLoopTypeLabel()}
        badge
        color="var(--node-cyan)"
      />
      <MetadataRow label="Nodes" value={childCount} />
      <MetadataRow label="Max" value={nodeData.maxIterations} />
      {output?.iterations !== undefined && (
        <MetadataRow
          label="Ran"
          value={<span style={{ color: 'var(--success)' }}>{output.iterations}</span>}
        />
      )}
    </>
  )

  // Expanded body content with internal handles
  const expandedBody = (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Internal Start Handle - child nodes connect FROM this */}
      <div
        style={{
          position: 'absolute',
          left: 4,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: 'color-mix(in srgb, var(--node-cyan) 20%, var(--panel))',
            border: '2px solid var(--node-cyan)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Play style={{ width: 10, height: 10, color: 'var(--node-cyan)', marginLeft: 2 }} />
        </div>
        <span style={{ fontSize: 8, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Start</span>
        {/* Internal source handle for start */}
        <Handle
          type="source"
          position={Position.Right}
          id="loop-start"
          style={{
            position: 'absolute',
            width: 10,
            height: 10,
            background: 'var(--node-cyan)',
            border: '2px solid var(--panel)',
            right: -5,
            top: 12,
          }}
        />
      </div>

      {/* Empty state message */}
      {childCount === 0 ? (
        <div style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          color: 'var(--muted)',
          fontSize: '11px',
          textAlign: 'center',
          padding: '16px',
        }}>
          Drag nodes here
        </div>
      ) : null}

      {/* Internal End Handle - child nodes connect TO this */}
      <div
        style={{
          position: 'absolute',
          right: 4,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: 'color-mix(in srgb, var(--node-cyan) 20%, var(--panel))',
            border: '2px solid var(--node-cyan)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Square style={{ width: 8, height: 8, color: 'var(--node-cyan)' }} />
        </div>
        <span style={{ fontSize: 8, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>End</span>
        {/* Internal target handle for end */}
        <Handle
          type="target"
          position={Position.Left}
          id="loop-end"
          style={{
            position: 'absolute',
            width: 10,
            height: 10,
            background: 'var(--node-cyan)',
            border: '2px solid var(--panel)',
            left: -5,
            top: 12,
          }}
        />
      </div>
    </div>
  )

  // Expanded footer content
  const expandedFooter = (
    <>
      <span>
        {childCount > 0 ? `${childCount} node${childCount !== 1 ? 's' : ''}` : 'Empty'}
      </span>
      <span>
        max {nodeData.maxIterations}
        {output?.iterations !== undefined && ` | ran ${output.iterations}`}
      </span>
    </>
  )

  // Build docked previews for the onIteration handle
  const iterationDockedPreviews = iterationHandleConfig && dockedToIteration.length > 0 ? (
    <>
      {dockedToIteration.map((dockedNode, index) => (
        <DockedNodePreview
          key={dockedNode.id}
          dockedNodeId={dockedNode.id}
          dockedNodeType={dockedNode.type as WorkflowNodeType}
          dockedNodeLabel={(dockedNode.data as BaseNodeData).label}
          handleConfig={iterationHandleConfig.position}
          index={index}
        />
      ))}
    </>
  ) : null

  // Build docked previews for the toolRouterDock handle
  const toolRouterDockedPreviews = toolRouterDockHandleConfig && dockedToToolRouterDock.length > 0 ? (
    <>
      {dockedToToolRouterDock.map((dockedNode, index) => (
        <DockedNodePreview
          key={dockedNode.id}
          dockedNodeId={dockedNode.id}
          dockedNodeType={dockedNode.type as WorkflowNodeType}
          dockedNodeLabel={(dockedNode.data as BaseNodeData).label}
          handleConfig={toolRouterDockHandleConfig.position}
          index={index}
        />
      ))}
    </>
  ) : null

  // Combine all docked previews
  const dockedPreviews = (
    <>
      {iterationDockedPreviews}
      {toolRouterDockedPreviews}
    </>
  )

  // Additional handles
  const additionalHandles = (
    <>
      <Handle
        type="source"
        position={Position.Bottom}
        id="onIteration"
        style={{
          width: isIterationDockTarget ? 16 : 12,
          height: isIterationDockTarget ? 16 : 12,
          background: 'var(--node-amber)',
          border: '2px solid var(--panel)',
          left: '50%',
          boxShadow: isIterationDockTarget ? '0 0 0 4px color-mix(in srgb, var(--node-amber) 50%, transparent), 0 0 12px var(--node-amber)' : undefined,
          transition: 'width 0.15s, height 0.15s, box-shadow 0.15s',
        }}
        title="Iteration events (accepts Memory, Callback)"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="toolRouterDock"
        style={{
          width: isToolRouterDockTarget ? 16 : 12,
          height: isToolRouterDockTarget ? 16 : 12,
          background: 'var(--node-purple, #9333ea)',
          border: '2px solid var(--panel)',
          top: '50%',
          boxShadow: isToolRouterDockTarget ? '0 0 0 4px color-mix(in srgb, var(--node-purple, #9333ea) 50%, transparent), 0 0 12px var(--node-purple, #9333ea)' : undefined,
          transition: 'width 0.15s, height 0.15s, box-shadow 0.15s',
        }}
        title="Tool Call Router Dock (accepts Tool Call Router)"
      />
    </>
  )

  return (
    <ContainerNode
      id={id}
      selected={selected}
      disabled={nodeData.disabled}
      isCollapsed={isCollapsed}
      onToggleCollapsed={toggleCollapsed}
      colorVar="cyan"
      icon={<Repeat style={{ width: 14, height: 14 }} />}
      label={nodeData.label || 'Loop'}
      executionStatus={nodeState?.status}
      headerBadge={getLoopTypeLabel()}
      collapsedMetadata={collapsedMetadata}
      expandedBody={expandedBody}
      expandedFooter={expandedFooter}
      additionalHandles={additionalHandles}
      dockedPreviews={dockedPreviews}
      savedWidth={(nodeData as Record<string, unknown>)._savedWidth as number | undefined}
      savedHeight={(nodeData as Record<string, unknown>)._savedHeight as number | undefined}
    />
  )
})

LoopNode.displayName = 'LoopNode'

// Export properties component
export { LoopNodeProperties } from './LoopNodeProperties'

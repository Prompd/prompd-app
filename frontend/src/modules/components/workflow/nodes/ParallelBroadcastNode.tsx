/**
 * ParallelBroadcastNode - Container node for broadcast parallel execution
 *
 * Child nodes can be dragged inside this container.
 * All children execute in parallel with the same input.
 */

import { memo, useCallback } from 'react'
import { GitFork } from 'lucide-react'
import { ContainerNode, MetadataRow } from './ContainerNode'
import type { ParallelNodeData, BaseNodeData } from '../../../services/workflowTypes'
import { useWorkflowStore } from '../../../../stores/workflowStore'

interface ParallelBroadcastNodeProps {
  id: string
  data: BaseNodeData
  selected?: boolean
}

export const ParallelBroadcastNode = memo(({ id, data, selected }: ParallelBroadcastNodeProps) => {
  const nodeData = data as ParallelNodeData
  const executionState = useWorkflowStore(state => state.executionState)
  const updateNodeData = useWorkflowStore(state => state.updateNodeData)
  const nodeState = executionState?.nodeStates[id]

  // Subscribe to nodes from store for reactive child count updates
  const childCount = useWorkflowStore(state =>
    state.nodes.filter(n => n.parentId === id).length
  )

  const isCollapsed = nodeData.collapsed ?? false

  const toggleCollapsed = useCallback(() => {
    updateNodeData(id, { collapsed: !isCollapsed })
  }, [id, isCollapsed, updateNodeData])

  const getWaitLabel = () => {
    switch (nodeData.waitFor) {
      case 'all': return 'All'
      case 'any': return 'Any'
      case 'race': return 'Race'
      default: return 'All'
    }
  }

  // Collapsed metadata content
  const collapsedMetadata = (
    <>
      <MetadataRow
        label="Wait"
        value={getWaitLabel()}
        badge
        color="var(--node-indigo)"
      />
      <MetadataRow label="Nodes" value={childCount} />
      <MetadataRow label="Merge" value={nodeData.mergeStrategy || 'object'} />
    </>
  )

  // Expanded body content
  const expandedBody = childCount === 0 ? (
    <div style={{
      color: 'var(--muted)',
      fontSize: '11px',
      textAlign: 'center',
      padding: '16px',
    }}>
      Drag nodes here to run in parallel
    </div>
  ) : null

  // Expanded footer content
  const expandedFooter = (
    <>
      <span>
        {childCount > 0 ? `${childCount} parallel node${childCount !== 1 ? 's' : ''}` : 'Empty'}
      </span>
      <span>
        Merge: {nodeData.mergeStrategy || 'object'}
      </span>
    </>
  )

  return (
    <ContainerNode
      id={id}
      selected={selected}
      disabled={nodeData.disabled}
      locked={nodeData.locked}
      isCollapsed={isCollapsed}
      onToggleCollapsed={toggleCollapsed}
      colorVar="indigo"
      icon={<GitFork style={{ width: 14, height: 14 }} />}
      label={nodeData.label || 'Parallel'}
      executionStatus={nodeState?.status}
      headerBadge={getWaitLabel()}
      collapsedMetadata={collapsedMetadata}
      expandedBody={expandedBody}
      expandedFooter={expandedFooter}
      savedWidth={(nodeData as Record<string, unknown>)._savedWidth as number | undefined}
      savedHeight={(nodeData as Record<string, unknown>)._savedHeight as number | undefined}
    />
  )
})

ParallelBroadcastNode.displayName = 'ParallelBroadcastNode'

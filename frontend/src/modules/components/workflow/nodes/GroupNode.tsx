/**
 * GroupNode - Visual grouping container for multi-node template export
 *
 * No execution logic. Child nodes can be dragged inside this container.
 * Saving this node as a template captures all children and internal edges.
 *
 * Uses shared ContainerNode for collapse/expand behavior.
 */

import { memo, useCallback } from 'react'
import { Group } from 'lucide-react'
import { ContainerNode, MetadataRow } from './ContainerNode'
import type { BaseNodeData } from '../../../services/workflowTypes'
import { useWorkflowStore } from '../../../../stores/workflowStore'

interface GroupNodeProps {
  id: string
  data: BaseNodeData
  selected?: boolean
}

export const GroupNode = memo(({ id, data, selected }: GroupNodeProps) => {
  const updateNodeData = useWorkflowStore(state => state.updateNodeData)

  const childCount = useWorkflowStore(state =>
    state.nodes.filter(n => n.parentId === id).length
  )

  const isCollapsed = (data as Record<string, unknown>).collapsed as boolean ?? false

  const toggleCollapsed = useCallback(() => {
    updateNodeData(id, { collapsed: !isCollapsed })
  }, [id, isCollapsed, updateNodeData])

  const collapsedMetadata = (
    <MetadataRow label="Nodes" value={childCount} />
  )

  const expandedBody = (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
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
    </div>
  )

  const expandedFooter = (
    <>
      <span>
        {childCount > 0 ? `${childCount} node${childCount !== 1 ? 's' : ''}` : 'Empty'}
      </span>
    </>
  )

  return (
    <ContainerNode
      id={id}
      selected={selected}
      disabled={data.disabled}
      locked={data.locked}
      isCollapsed={isCollapsed}
      onToggleCollapsed={toggleCollapsed}
      colorVar="slate"
      icon={<Group style={{ width: 14, height: 14 }} />}
      label={data.label || 'Group'}
      collapsedMetadata={collapsedMetadata}
      expandedBody={expandedBody}
      expandedFooter={expandedFooter}
      savedWidth={(data as Record<string, unknown>)._savedWidth as number | undefined}
      savedHeight={(data as Record<string, unknown>)._savedHeight as number | undefined}
    />
  )
})

GroupNode.displayName = 'GroupNode'

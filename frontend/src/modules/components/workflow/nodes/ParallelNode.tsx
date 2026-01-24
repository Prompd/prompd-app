/**
 * ParallelNode - Dispatcher for parallel execution nodes
 *
 * Two modes:
 * - Broadcast (container): Child nodes can be dragged inside, all run in parallel
 * - Fork (edge-based): Multiple output handles, connect edges to different branches
 */

import { memo } from 'react'
import type { ParallelNodeData, BaseNodeData } from '../../../services/workflowTypes'
import { ParallelBroadcastNode } from './ParallelBroadcastNode'
import { ParallelForkNode } from './ParallelForkNode'

interface ParallelNodeProps {
  id: string
  data: BaseNodeData
  selected?: boolean
}

export const ParallelNode = memo(({ id, data, selected }: ParallelNodeProps) => {
  const nodeData = data as ParallelNodeData
  const mode = nodeData.mode || 'broadcast'

  if (mode === 'fork') {
    return <ParallelForkNode id={id} data={data} selected={selected} />
  }

  return <ParallelBroadcastNode id={id} data={data} selected={selected} />
})

ParallelNode.displayName = 'ParallelNode'

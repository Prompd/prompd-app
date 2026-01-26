/**
 * Hook to find and filter provider nodes in the workflow
 */

import { useMemo } from 'react'
import type { Node } from '@xyflow/react'
import { useWorkflowStore } from '../../../../../stores/workflowStore'
import type { BaseNodeData, ProviderNodeData } from '../../../../services/workflowTypes'

// Match workflowStore's WorkflowCanvasNode type
type WorkflowCanvasNode = Node<BaseNodeData>

export interface ProviderNodeInfo {
  node: WorkflowCanvasNode
  data: ProviderNodeData
}

/**
 * Get all provider nodes in the current workflow
 * @returns Array of provider nodes with typed data
 */
export function useProviderNodes(): ProviderNodeInfo[] {
  const nodes = useWorkflowStore(state => state.nodes)

  return useMemo(() => {
    return nodes
      .filter(n => n.type === 'provider')
      .map(node => ({
        node,
        data: node.data as ProviderNodeData
      }))
  }, [nodes])
}

/**
 * Find a specific provider node by ID
 * @param nodeId - Provider node ID to find
 * @returns Provider node info or undefined if not found
 */
export function useProviderNode(nodeId: string | undefined): ProviderNodeInfo | undefined {
  const providerNodes = useProviderNodes()

  return useMemo(() => {
    if (!nodeId) return undefined
    return providerNodes.find(p => p.node.id === nodeId)
  }, [providerNodes, nodeId])
}

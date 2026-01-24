/**
 * Docking Hooks - Hooks for node docking functionality
 *
 * Separated from DockedNodePreview.tsx to avoid React Fast Refresh issues
 * (HMR doesn't work well with mixed component and hook exports)
 */

import { useWorkflowStore } from '../../../../stores/workflowStore'
import type { BaseNodeData } from '../../../services/workflowTypes'

/**
 * Hook for host nodes to get their docked nodes.
 * Use this in nodes like ChatAgentNode, GuardrailNode, etc.
 */
export function useDockedNodes(hostNodeId: string, handleId: string) {
  const nodes = useWorkflowStore(state => state.nodes)

  const dockedNodes = nodes.filter(node => {
    const data = node.data as BaseNodeData
    const isDocked = data.dockedTo?.nodeId === hostNodeId && data.dockedTo?.handleId === handleId
    return isDocked
  })

  // DEBUG: Log all nodes checking for docking
  if (dockedNodes.length > 0) {
    console.log(`[useDockedNodes] Host: ${hostNodeId}, Handle: ${handleId}, Found: ${dockedNodes.length}`, {
      totalNodes: nodes.length,
      dockedNodes: dockedNodes.map(n => ({ id: n.id, type: n.type, hidden: n.hidden }))
    })
  }

  return dockedNodes
}

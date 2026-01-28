/**
 * Hook to find and filter workflow connections (external service connections)
 */

import { useMemo } from 'react'
import { useWorkflowStore } from '../../../../../stores/workflowStore'
import type { WorkflowConnection, WorkflowConnectionType } from '../../../../services/workflowTypes'

/**
 * Get all connections in the current workflow
 * @returns Array of all workflow connections
 */
export function useConnections(): WorkflowConnection[] {
  return useWorkflowStore(state => state.connections)
}

/**
 * Get connections filtered by type
 * @param connectionTypes - Array of connection types to filter by
 * @returns Filtered array of connections
 */
export function useFilteredConnections(connectionTypes?: WorkflowConnectionType[]): WorkflowConnection[] {
  const connections = useConnections()

  return useMemo(() => {
    if (!connectionTypes || connectionTypes.length === 0) {
      return connections
    }
    return connections.filter(c => connectionTypes.includes(c.type))
  }, [connections, connectionTypes])
}

/**
 * Find a specific connection by ID
 * @param connectionId - Connection ID to find
 * @returns Connection or undefined if not found
 */
export function useConnection(connectionId: string | undefined): WorkflowConnection | undefined {
  const connections = useConnections()

  return useMemo(() => {
    if (!connectionId) return undefined
    return connections.find(c => c.id === connectionId)
  }, [connections, connectionId])
}

/**
 * Get all error handler nodes in the current workflow
 * @returns Array of error handler nodes
 */
export function useErrorHandlerNodes() {
  const nodes = useWorkflowStore(state => state.nodes)

  return useMemo(() => {
    return nodes.filter(n => n.type === 'error-handler')
  }, [nodes])
}

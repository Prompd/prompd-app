/**
 * AgentNode - Autonomous AI agent with ReAct-style tool-use loop
 *
 * Encapsulates the common "agentic loop" pattern:
 * 1. Send prompt to LLM with tool definitions
 * 2. Parse response for tool calls
 * 3. Execute requested tools
 * 4. Feed results back to LLM
 * 5. Repeat until final answer or max iterations
 */

import { memo, useMemo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Bot, CheckCircle, XCircle, Loader2, Wrench, RotateCcw, Cpu, Activity, ArrowDownLeft } from 'lucide-react'
import type { AgentNodeData, BaseNodeData, ProviderNodeData, WorkflowNodeType } from '../../../services/workflowTypes'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import { DockedNodePreview, useDockedNodes } from './DockedNodePreview'
import { ToolRouterDockPreview } from './ToolRouterDockPreview'
import { DOCKABLE_HANDLES } from '../../../services/workflowTypes'
import { getNodeColor } from '../nodeColors'
import { NodeExecutionFooter } from './NodeExecutionFooter'

// Handle style constants
const handleSize = 12
const handleBorder = '2px solid var(--panel)'

/** Get provider info from providerNodeId reference */
function useProviderReference(providerNodeId: string | undefined): {
  hasProvider: boolean
  providerLabel?: string
  model?: string
} {
  const nodes = useWorkflowStore(state => state.nodes)

  return useMemo(() => {
    if (!providerNodeId) return { hasProvider: false }

    const providerNode = nodes.find(n => n.id === providerNodeId && n.type === 'provider')
    if (!providerNode) return { hasProvider: false }

    const data = providerNode.data as ProviderNodeData
    return {
      hasProvider: true,
      providerLabel: data.label || data.providerId || 'Provider',
      model: data.model
    }
  }, [nodes, providerNodeId])
}

/** Count connected tool nodes via edges - includes tools connected via ToolCallRouter */
function useConnectedToolsCount(nodeId: string): number {
  const edges = useWorkflowStore(state => state.edges)
  const nodes = useWorkflowStore(state => state.nodes)

  return useMemo(() => {
    // Check if we're connected to a ToolCallRouter via the tools handle
    const toolsEdge = edges.find(
      e => e.source === nodeId && e.sourceHandle === 'tools'
    )

    if (toolsEdge) {
      // If connected to a ToolCallRouter, count its child tool nodes
      const targetNode = nodes.find(n => n.id === toolsEdge.target)
      if (targetNode?.type === 'tool-call-router') {
        // Count tool nodes inside the router
        return nodes.filter(n => n.parentId === toolsEdge.target && n.type === 'tool').length
      }
    }

    // Fallback: count directly connected tool nodes (legacy pattern)
    const directToolEdges = edges.filter(
      e => e.target === nodeId && e.targetHandle === 'tools'
    )
    return directToolEdges.filter(e => {
      const sourceNode = nodes.find(n => n.id === e.source)
      return sourceNode?.type === 'tool'
    }).length
  }, [edges, nodes, nodeId])
}

/** Check if a ToolCallRouter is connected via toolResult handle */
function useToolRouterConnection(nodeId: string): {
  hasRouter: boolean
  routerLabel?: string
} {
  const edges = useWorkflowStore(state => state.edges)
  const nodes = useWorkflowStore(state => state.nodes)

  return useMemo(() => {
    // Find edge connecting to toolResult handle
    const routerEdge = edges.find(
      e => e.target === nodeId && e.targetHandle === 'toolResult'
    )
    if (!routerEdge) return { hasRouter: false }

    const routerNode = nodes.find(n => n.id === routerEdge.source && n.type === 'tool-call-router')
    if (!routerNode) return { hasRouter: false }

    return {
      hasRouter: true,
      routerLabel: (routerNode.data as BaseNodeData).label || 'Tool Router'
    }
  }, [edges, nodes, nodeId])
}

interface AgentNodeProps {
  id: string
  data: BaseNodeData
  selected?: boolean
}

export const AgentNode = memo(({ id, data, selected }: AgentNodeProps) => {
  const executionState = useWorkflowStore(state => state.executionState)
  const nodeState = executionState?.nodeStates[id]
  const nodeData = data as AgentNodeData

  // Get provider info from providerNodeId reference (not via edge connection)
  const { hasProvider, providerLabel, model: providerModel } = useProviderReference(nodeData.providerNodeId)
  const connectedToolsCount = useConnectedToolsCount(id)
  const { hasRouter, routerLabel } = useToolRouterConnection(id)

  // Get nodes docked to the onCheckpoint handle
  const dockedToCheckpoint = useDockedNodes(id, 'onCheckpoint')
  const checkpointHandleConfig = DOCKABLE_HANDLES.find(
    h => h.nodeType === 'agent' && h.handleId === 'onCheckpoint'
  )

  // Get nodes docked to the memory handle
  const dockedToMemory = useDockedNodes(id, 'memory')
  const memoryHandleConfig = DOCKABLE_HANDLES.find(
    h => h.nodeType === 'agent' && h.handleId === 'memory'
  )

  // Get nodes docked to the ai-output handle (ToolCallRouter)
  const dockedToAiOutput = useDockedNodes(id, 'ai-output')

  // DEBUG: Log docked nodes
  if (dockedToAiOutput.length > 0) {
    console.log(`[AgentNode ${id}] Found ${dockedToAiOutput.length} docked to ai-output:`, dockedToAiOutput.map(n => ({
      id: n.id,
      type: n.type,
      label: (n.data as BaseNodeData).label,
      hidden: n.hidden,
      dockedTo: (n.data as BaseNodeData).dockedTo
    })))
  }

  // Count tools in docked ToolCallRouter
  const nodes = useWorkflowStore(state => state.nodes)
  const dockedRouterToolCount = useMemo(() => {
    const dockedRouter = dockedToAiOutput.find(n => n.type === 'tool-call-router')
    if (!dockedRouter) return 0

    // Count Tool nodes that are children of the docked router
    return nodes.filter(n => n.parentId === dockedRouter.id && n.type === 'tool').length
  }, [dockedToAiOutput, nodes])

  // Check if this handle is being targeted for docking
  const dockingState = useWorkflowStore(state => state.dockingState)

  const isCheckpointDockTarget = dockingState?.hoveredDockTarget?.nodeId === id &&
    dockingState?.hoveredDockTarget?.handleId === 'onCheckpoint'

  const isMemoryDockTarget = dockingState?.hoveredDockTarget?.nodeId === id &&
    dockingState?.hoveredDockTarget?.handleId === 'memory'

  const isToolRouterDockTarget = dockingState?.hoveredDockTarget?.nodeId === id &&
    (dockingState?.hoveredDockTarget?.handleId === 'ai-output' || dockingState?.hoveredDockTarget?.handleId === 'toolResult')

  // Count inline tools (defined in node data) + connected tools + tools in docked router
  const inlineToolCount = nodeData.tools?.length || 0
  const totalToolCount = inlineToolCount + connectedToolsCount + dockedRouterToolCount
  const maxIterations = nodeData.maxIterations || 10

  // Node color from central definition
  const nodeColor = getNodeColor('agent')

  // Status-based styling
  const getStatusIcon = () => {
    if (!nodeState) return null

    switch (nodeState.status) {
      case 'running':
        return (
          <Loader2
            style={{
              width: 14,
              height: 14,
              color: nodeColor,
              animation: 'spin 1s linear infinite',
            }}
          />
        )
      case 'completed':
        return <CheckCircle style={{ width: 14, height: 14, color: 'var(--success)' }} />
      case 'failed':
        return <XCircle style={{ width: 14, height: 14, color: 'var(--error)' }} />
      default:
        return null
    }
  }

  const getStatusBorderColor = (): string | null => {
    if (!nodeState) return null

    switch (nodeState.status) {
      case 'running':
        return nodeColor
      case 'completed':
        return 'var(--success)'
      case 'failed':
        return 'var(--error)'
      default:
        return null
    }
  }

  const getStatusBoxShadow = (): string | undefined => {
    if (!nodeState) return undefined

    if (nodeState.status === 'running') {
      return `0 0 0 2px ${nodeColor}, 0 0 12px ${nodeColor}`
    }
    return undefined
  }

  const statusBorderColor = getStatusBorderColor()
  const statusBoxShadow = getStatusBoxShadow()

  const borderColor = statusBorderColor || (selected ? nodeColor : 'var(--border)')
  const boxShadow = statusBoxShadow || (selected ? `0 0 0 2px color-mix(in srgb, ${nodeColor} 30%, transparent)` : '0 2px 4px rgba(0,0,0,0.1)')

  // Get iteration info from execution state if available
  const iterationInfo = nodeState?.output as {
    currentIteration?: number
    totalToolCalls?: number
  } | undefined

  return (
    <div
      className={[nodeData.disabled && 'workflow-node-disabled', nodeData.locked && 'workflow-node-locked'].filter(Boolean).join(' ')}
      style={{
        minWidth: 200,
        padding: '12px',
        background: 'var(--panel)',
        borderWidth: '2px',
        borderStyle: 'solid',
        borderColor: borderColor,
        borderRadius: '8px',
        boxShadow: boxShadow,
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}
    >
      {/* Main Input Handle (left) - workflow data flow */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        style={{
          width: handleSize,
          height: handleSize,
          background: nodeColor,
          border: handleBorder,
          top: '25%',
        }}
      />

      {/* Main memory (left) - workflow data flow */}
      <Handle
        type="target"
        position={Position.Left}
        id="memory"
        style={{
          width: isMemoryDockTarget ? handleSize + 4 : handleSize,
          height: isMemoryDockTarget ? handleSize + 4 : handleSize,
          background: 'var(--node-emerald, #10b981)',
          boxShadow: isMemoryDockTarget ? '0 0 0 4px color-mix(in srgb, var(--node-emerald) 50%, transparent), 0 0 12px var(--node-emerald)' : undefined,
          transition: 'width 0.15s, height 0.15s, box-shadow 0.15s',
          border: handleBorder,
          top: '70%',
        }}
        title="Connect to Memory node for conversation/history storage"
      />

      {/* Tools Output Handle (right side, below output) - connects to ToolCallRouter */}
      <Handle
        type="source"
        position={Position.Right}
        id="ai-output"
        style={{
          width: isToolRouterDockTarget ? handleSize + 4 : handleSize,
          height: isToolRouterDockTarget ? handleSize + 4 : handleSize,
          background: 'var(--node-orange, #f97316)',
          border: handleBorder,
          top: '65%',
          boxShadow: isToolRouterDockTarget ? '0 0 0 4px color-mix(in srgb, var(--node-amber) 50%, transparent), 0 0 12px var(--node-amber)' : undefined,
          transition: 'width 0.15s, height 0.15s, box-shadow 0.15s',
        }}
        title="Connect to ToolCallRouter for agent tool calls"
      />

      {/* Tool Result Input Handle (right side, below tools) - receives results from ToolCallRouter */}
      <Handle
        type="target"
        position={Position.Right}
        id="toolResult"
        style={{
          width: isToolRouterDockTarget ? handleSize + 4 : handleSize,
          height: isToolRouterDockTarget ? handleSize + 4 : handleSize,
          background: 'var(--node-teal, #14b8a6)',
          border: handleBorder,
          top: 'calc(65% + 20px)',
          boxShadow: isToolRouterDockTarget ? '0 0 0 4px color-mix(in srgb, var(--node-amber) 50%, transparent), 0 0 12px var(--node-amber)' : undefined,
          transition: 'width 0.15s, height 0.15s, box-shadow 0.15s',
        }}
        title="Receives tool execution results from ToolCallRouter"
      />

      {/* Checkpoint Output Handle (bottom) - connects to Callback nodes below */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="onCheckpoint"
        style={{
          width: isCheckpointDockTarget ? handleSize + 4 : handleSize,
          height: isCheckpointDockTarget ? handleSize + 4 : handleSize,
          background: 'var(--node-amber, #f59e0b)',
          border: handleBorder,
          left: '50%',
          boxShadow: isCheckpointDockTarget ? '0 0 0 4px color-mix(in srgb, var(--node-amber) 50%, transparent), 0 0 12px var(--node-amber)' : undefined,
          transition: 'width 0.15s, height 0.15s, box-shadow 0.15s',
        }}
        title="Checkpoint events (connect to Checkpoint node)"
      />
      
      {/* Render docked nodes near onCheckpoint handle */}
      {checkpointHandleConfig && dockedToCheckpoint.map((dockedNode, index) => (
        <DockedNodePreview
          key={dockedNode.id}
          dockedNodeId={dockedNode.id}
          dockedNodeType={dockedNode.type as WorkflowNodeType}
          dockedNodeLabel={(dockedNode.data as BaseNodeData).label}
          handleConfig={checkpointHandleConfig.position}
          targetNodeCollapsed={true}
          index={index}
        />
      ))}

      {/* Render docked nodes near memory handle */}
      {memoryHandleConfig && dockedToMemory.map((dockedNode, index) => (
        <DockedNodePreview
          key={dockedNode.id}
          dockedNodeId={dockedNode.id}
          dockedNodeType={dockedNode.type as WorkflowNodeType}
          dockedNodeLabel={(dockedNode.data as BaseNodeData).label}
          handleConfig={memoryHandleConfig.position}
          targetNodeCollapsed={true}
          index={index}
        />
      ))}

      {/* Render docked ToolCallRouter (spans both ai-output and toolResult handles) */}
      {dockedToAiOutput.filter(n => n.type === 'tool-call-router').map((dockedNode) => (
        <ToolRouterDockPreview
          key={dockedNode.id}
          dockedNodeId={dockedNode.id}
          dockedNodeLabel={(dockedNode.data as BaseNodeData).label}
          targetNodeCollapsed={true}
        />
      ))}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: '6px',
            background: `color-mix(in srgb, ${nodeColor} 20%, transparent)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: nodeColor,
          }}
        >
          <Bot style={{ width: 14, height: 14 }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
            {nodeData.label || 'AI Agent'}
          </div>
        </div>
        {getStatusIcon()}
      </div>

      {/* Provider/Model indicator - shows referenced provider or inline config */}
      {hasProvider ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '10px',
            color: 'var(--node-rose, #f43f5e)',
            marginBottom: '6px',
          }}
        >
          <Cpu style={{ width: 10, height: 10 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {providerModel ? `${providerLabel} / ${providerModel}` : providerLabel}
          </span>
        </div>
      ) : (nodeData.provider || nodeData.model) ? (
        <div
          style={{
            fontSize: '10px',
            color: 'var(--muted)',
            marginBottom: '6px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {nodeData.provider && nodeData.model
            ? `${nodeData.provider} / ${nodeData.model}`
            : nodeData.model || nodeData.provider}
        </div>
      ) : null}

      {/* Tools count indicator */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 8px',
          background: `color-mix(in srgb, ${nodeColor} 10%, transparent)`,
          borderRadius: '4px',
          fontSize: '10px',
          color: nodeColor,
          fontWeight: 500,
          marginBottom: '6px',
        }}
      >
        <Wrench style={{ width: 12, height: 12 }} />
        {totalToolCount} {totalToolCount === 1 ? 'tool' : 'tools'}
        {connectedToolsCount > 0 && inlineToolCount > 0 && (
          <span style={{ opacity: 0.7, fontWeight: 400 }}>
            ({inlineToolCount} inline + {connectedToolsCount} connected)
          </span>
        )}
        {connectedToolsCount > 0 && inlineToolCount === 0 && (
          <span style={{ opacity: 0.7, fontWeight: 400 }}>
            (connected)
          </span>
        )}
      </div>

      {/* Tool Router indicator - shows when connected to ToolCallRouter */}
      {hasRouter && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '10px',
            color: 'var(--node-teal, #14b8a6)',
            marginBottom: '6px',
          }}
        >
          <Activity style={{ width: 10, height: 10 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {routerLabel}
          </span>
        </div>
      )}

      {/* Iteration limit indicator */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 8px',
          background: 'color-mix(in srgb, var(--muted) 10%, transparent)',
          borderRadius: '4px',
          fontSize: '10px',
          color: 'var(--muted)',
        }}
      >
        <RotateCcw style={{ width: 12, height: 12 }} />
        Max {maxIterations} iterations
      </div>

      {/* Tool names preview */}
      {nodeData.tools && nodeData.tools.length > 0 && (
        <div
          style={{
            marginTop: '6px',
            fontSize: '9px',
            color: 'var(--text-secondary)',
          }}
        >
          {nodeData.tools.slice(0, 3).map(t => t.name).join(', ')}
          {nodeData.tools.length > 3 && ` +${nodeData.tools.length - 3}`}
        </div>
      )}

      {/* Running iteration indicator */}
      {nodeState?.status === 'running' && iterationInfo?.currentIteration !== undefined && (
        <div
          style={{
            marginTop: '8px',
            padding: '6px 8px',
            background: `color-mix(in srgb, ${nodeColor} 10%, transparent)`,
            borderRadius: '4px',
            fontSize: '10px',
            color: nodeColor,
          }}
        >
          Iteration {iterationInfo.currentIteration}/{maxIterations}
          {iterationInfo.totalToolCalls !== undefined && ` (${iterationInfo.totalToolCalls} tool calls)`}
        </div>
      )}

      {/* Execution status message */}
      {nodeState?.status === 'completed' && (
        <div
          style={{
            marginTop: '8px',
            padding: '6px 8px',
            background: 'color-mix(in srgb, var(--success) 10%, transparent)',
            borderRadius: '4px',
            fontSize: '10px',
            color: 'var(--success)',
          }}
        >
          {iterationInfo?.totalToolCalls !== undefined
            ? `Completed (${iterationInfo.totalToolCalls} tool calls)`
            : 'Agent completed'}
        </div>
      )}

      {nodeState?.status === 'failed' && nodeState.error && (
        <div
          style={{
            marginTop: '8px',
            padding: '6px 8px',
            background: 'color-mix(in srgb, var(--error) 10%, transparent)',
            borderRadius: '4px',
            fontSize: '10px',
            color: 'var(--error)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {nodeState.error}
        </div>
      )}

      {/* Execution debug footer */}
      <NodeExecutionFooter
        nodeState={nodeState}
        allNodeStates={executionState?.nodeStates}
        showOutput={false}
        showError={false}
      />

      {/* Main Output Handle (right) - workflow data flow */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        style={{
          width: handleSize,
          height: handleSize,
          background: nodeColor,
          border: handleBorder,
          top: '25%',
        }}
      />
    </div>
  )
})

AgentNode.displayName = 'AgentNode'

export { AgentNodeProperties } from './AgentNodeProperties'

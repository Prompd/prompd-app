/**
 * ChatAgentNode - Composite container for conversational AI agent pattern
 *
 * Bundles: User Input → Guardrail → AI Agent ↔ Tool Router
 * into a single, configurable node with checkpoints at each stage.
 *
 * When collapsed: Shows as a single node with key metrics
 * When expanded: Shows all internal nodes for detailed editing
 */

import { memo, useCallback, useMemo } from 'react'
import { Handle, Position } from '@xyflow/react'
import {
  Bot,
  MessageSquare,
  ShieldCheck,
  Wrench,
  Settings,
  AlertCircle,
  MessagesSquare,
  Repeat,
  Cpu,
} from 'lucide-react'
import { ContainerNode, MetadataRow } from './ContainerNode'
import type { ChatAgentNodeData, BaseNodeData, ProviderNodeData, WorkflowNodeType } from '../../../services/workflowTypes'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import { DockedNodePreview, useDockedNodes } from './DockedNodePreview'
import { DOCKABLE_HANDLES } from '../../../services/workflowTypes'

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

interface ChatAgentNodeProps {
  id: string
  data: BaseNodeData
  selected?: boolean
}

export const ChatAgentNode = memo(({ id, data, selected }: ChatAgentNodeProps) => {
  const nodeData = data as ChatAgentNodeData
  const executionState = useWorkflowStore(state => state.executionState)
  const updateNodeData = useWorkflowStore(state => state.updateNodeData)
  const nodeState = executionState?.nodeStates[id]

  // Get nodes docked to the rejected handle
  const dockedToRejected = useDockedNodes(id, 'rejected')
  const rejectedHandleConfig = DOCKABLE_HANDLES.find(
    h => h.nodeType === 'chat-agent' && h.handleId === 'rejected'
  )

  // Get nodes docked to the onCheckpoint handle
  const dockedToCheckpoint = useDockedNodes(id, 'onCheckpoint')
  const checkpointHandleConfig = DOCKABLE_HANDLES.find(
    h => h.nodeType === 'chat-agent' && h.handleId === 'onCheckpoint'
  )

  // Check if this handle is being targeted for docking
  const dockingState = useWorkflowStore(state => state.dockingState)
  const isRejectedDockTarget = dockingState?.hoveredDockTarget?.nodeId === id &&
    dockingState?.hoveredDockTarget?.handleId === 'rejected'

  const isMemoryDockTarget = dockingState?.hoveredDockTarget?.nodeId === id &&
    dockingState?.hoveredDockTarget?.handleId === 'memory'

  const isCheckpointDockTarget = dockingState?.hoveredDockTarget?.nodeId === id &&
    dockingState?.hoveredDockTarget?.handleId === 'onCheckpoint'

  let handleWidth = 10
  let handleHeight = 10

  if (isRejectedDockTarget || isMemoryDockTarget || isCheckpointDockTarget) {
    // Increase handle size when being targeted for docking
    handleHeight = handleHeight + 4
    handleWidth = handleWidth + 4
  }

  // Count internal/child nodes
  const nodes = useWorkflowStore(state => state.nodes)
  const childCount = useMemo(() => {
    return nodes.filter(n => n.parentId === id).length
  }, [nodes, id])

  // Count child Tool nodes specifically
  const childToolCount = useMemo(() => {
    return nodes.filter(n => n.parentId === id && n.type === 'tool').length
  }, [nodes, id])

  // Count tools: inline tools (data.tools) + child Tool nodes
  const inlineToolCount = nodeData.tools?.length || 0
  const toolCount = inlineToolCount + childToolCount

  const isCollapsed = nodeData.collapsed ?? true // Default to collapsed for composite

  const toggleCollapsed = useCallback(() => {
    updateNodeData(id, { collapsed: !isCollapsed })
  }, [id, isCollapsed, updateNodeData])

  // Get provider info from providerNodeId reference (not via edge connection)
  const { hasProvider: hasProviderRef, providerLabel, model: providerModel } = useProviderReference(nodeData.providerNodeId)

  // Resolve display values: prefer inline config, fallback to referenced provider
  const displayProvider = nodeData.provider || (hasProviderRef ? providerLabel : undefined)
  const displayModel = nodeData.model || (hasProviderRef ? providerModel : undefined)

  // Determine checkpoint indicators
  const checkpointCount = Object.values(nodeData.checkpoints || {}).filter(
    cp => cp?.enabled
  ).length

  // Get loop mode display label
  const getLoopModeLabel = () => {
    switch (nodeData.loopMode) {
      case 'single-turn': return 'Single'
      case 'multi-turn': return 'Multi'
      case 'until-complete': return 'Until Done'
      case 'user-driven': return 'User'
      default: return 'Multi'
    }
  }

  // Collapsed view metadata
  const collapsedMetadata = (
    <>
      {/* Provider/Model info row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px',
        background: 'var(--panel-2)',
        borderRadius: 4,
        marginBottom: 4,
      }}>
        <Cpu style={{ width: 11, height: 11, color: 'var(--node-rose)' }} />
        <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
          {displayProvider || 'No provider'}
          {displayModel && <span style={{ color: 'var(--muted)' }}> / {displayModel}</span>}
        </span>
      </div>

      {/* Loop mode and iterations */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 6px',
          background: 'color-mix(in srgb, var(--node-cyan) 15%, transparent)',
          borderRadius: 4,
        }}>
          <Repeat style={{ width: 10, height: 10, color: 'var(--node-cyan)' }} />
          <span style={{ fontSize: 10, color: 'var(--node-cyan)', fontWeight: 500 }}>
            {getLoopModeLabel()}
          </span>
        </div>
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>
          max {nodeData.maxIterations || 10}
          {nodeData.minIterations ? ` (min ${nodeData.minIterations})` : ''}
        </span>
      </div>

      {/* Feature indicators row */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
        {nodeData.userInputEnabled !== false && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            padding: '2px 5px',
            background: 'color-mix(in srgb, var(--node-violet) 12%, transparent)',
            borderRadius: 3,
          }}>
            <MessageSquare style={{ width: 10, height: 10, color: 'var(--node-violet)' }} />
            <span style={{ fontSize: 9, color: 'var(--node-violet)' }}>Input</span>
          </div>
        )}
        {nodeData.guardrailEnabled && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            padding: '2px 5px',
            background: 'color-mix(in srgb, var(--node-amber) 12%, transparent)',
            borderRadius: 3,
          }}>
            <ShieldCheck style={{ width: 10, height: 10, color: 'var(--node-amber)' }} />
            <span style={{ fontSize: 9, color: 'var(--node-amber)' }}>Guard</span>
          </div>
        )}
        {toolCount > 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            padding: '2px 5px',
            background: 'color-mix(in srgb, var(--node-orange) 12%, transparent)',
            borderRadius: 3,
          }}>
            <Wrench style={{ width: 10, height: 10, color: 'var(--node-orange)' }} />
            <span style={{ fontSize: 9, color: 'var(--node-orange)' }}>{toolCount}</span>
          </div>
        )}
        {checkpointCount > 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            padding: '2px 5px',
            background: 'color-mix(in srgb, var(--warning) 12%, transparent)',
            borderRadius: 3,
          }}>
            <Settings style={{ width: 10, height: 10, color: 'var(--warning)' }} />
            <span style={{ fontSize: 9, color: 'var(--warning)' }}>{checkpointCount}</span>
          </div>
        )}
      </div>

      {/* Stop phrases indicator (if configured) */}
      {nodeData.stopPhrases && nodeData.stopPhrases.length > 0 && (
        <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>
          Stop: {nodeData.stopPhrases.slice(0, 2).map(p => `"${p.substring(0, 12)}${p.length > 12 ? '...' : ''}"`).join(', ')}
          {nodeData.stopPhrases.length > 2 && ` +${nodeData.stopPhrases.length - 2}`}
        </div>
      )}

      {/* System prompt preview */}
      {nodeData.agentSystemPrompt && (
        <div style={{
          fontSize: 9,
          color: 'var(--muted)',
          marginTop: 4,
          padding: '4px 6px',
          background: 'var(--bg)',
          borderRadius: 3,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '100%',
        }}>
          {nodeData.agentSystemPrompt.substring(0, 60)}{nodeData.agentSystemPrompt.length > 60 ? '...' : ''}
        </div>
      )}
    </>
  )

  // Expanded view body - shows internal structure
  const expandedBody = (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      {/* Internal flow visualization */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        background: 'var(--bg)',
        borderRadius: 6,
        fontSize: 11,
        color: 'var(--muted)',
      }}>
        {nodeData.userInputEnabled !== false && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'color-mix(in srgb, var(--node-violet) 15%, transparent)', borderRadius: 4 }}>
              <MessageSquare style={{ width: 12, height: 12, color: 'var(--node-violet)' }} />
              <span>Input</span>
            </div>
            <span>→</span>
          </>
        )}
        {nodeData.guardrailEnabled && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'color-mix(in srgb, var(--node-amber) 15%, transparent)', borderRadius: 4 }}>
              <ShieldCheck style={{ width: 12, height: 12, color: 'var(--node-amber)' }} />
              <span>Guard</span>
            </div>
            <span>→</span>
          </>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'color-mix(in srgb, var(--node-indigo) 15%, transparent)', borderRadius: 4 }}>
          <Bot style={{ width: 12, height: 12, color: 'var(--node-indigo)' }} />
          <span>Agent</span>
        </div>
        {toolCount > 0 && (
          <>
            <span>↔</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'color-mix(in srgb, var(--node-orange) 15%, transparent)', borderRadius: 4 }}>
              <Wrench style={{ width: 12, height: 12, color: 'var(--node-orange)' }} />
              <span>Tools</span>
            </div>
          </>
        )}
      </div>

      {/* Checkpoint configuration summary */}
      {checkpointCount > 0 && (
        <div style={{
          padding: '8px 12px',
          background: 'color-mix(in srgb, var(--warning) 10%, transparent)',
          borderRadius: 6,
          border: '1px dashed var(--warning)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <AlertCircle style={{ width: 12, height: 12, color: 'var(--warning)' }} />
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--warning)' }}>
              Active Checkpoints
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {nodeData.checkpoints?.onUserInput?.enabled && (
              <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--panel)', borderRadius: 3 }}>onUserInput</span>
            )}
            {nodeData.checkpoints?.beforeGuardrail?.enabled && (
              <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--panel)', borderRadius: 3 }}>beforeGuardrail</span>
            )}
            {nodeData.checkpoints?.afterGuardrail?.enabled && (
              <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--panel)', borderRadius: 3 }}>afterGuardrail</span>
            )}
            {nodeData.checkpoints?.onIterationStart?.enabled && (
              <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--panel)', borderRadius: 3 }}>onIterationStart</span>
            )}
            {nodeData.checkpoints?.onIterationEnd?.enabled && (
              <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--panel)', borderRadius: 3 }}>onIterationEnd</span>
            )}
            {nodeData.checkpoints?.onToolCall?.enabled && (
              <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--panel)', borderRadius: 3 }}>onToolCall</span>
            )}
            {nodeData.checkpoints?.onToolResult?.enabled && (
              <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--panel)', borderRadius: 3 }}>onToolResult</span>
            )}
            {nodeData.checkpoints?.onAgentComplete?.enabled && (
              <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--panel)', borderRadius: 3 }}>onAgentComplete</span>
            )}
          </div>
        </div>
      )}

      {/* Placeholder for child nodes (tools) */}
      {childCount === 0 && (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '2px dashed var(--border)',
          borderRadius: 8,
          color: 'var(--muted)',
          fontSize: 12,
          minHeight: 100,
        }}>
          Drag Tool nodes here to add capabilities
        </div>
      )}
    </div>
  )

  // Footer stats
  const expandedFooter = (
    <div style={{ display: 'flex', gap: 12, fontSize: 10, color: 'var(--muted)' }}>
      {toolCount > 0 && <span>{toolCount} tool{toolCount !== 1 ? 's' : ''}</span>}
      {checkpointCount > 0 && <span>{checkpointCount} checkpoint{checkpointCount !== 1 ? 's' : ''}</span>}
    </div>
  )

  return (
    <>
      <ContainerNode
        id={id}
        selected={selected}
        disabled={nodeData.disabled}
        isCollapsed={isCollapsed}
        onToggleCollapsed={toggleCollapsed}
        colorVar="indigo"
        icon={<MessagesSquare style={{ width: 14, height: 14 }} />}
        label={nodeData.label || 'Chat Agent'}
        executionStatus={nodeState?.status}
        headerBadge={nodeData.maxIterations ? `${nodeData.maxIterations} iter` : undefined}
        collapsedMetadata={collapsedMetadata}
        expandedBody={expandedBody}
        expandedFooter={expandedFooter}
        savedWidth={nodeData._savedWidth}
        savedHeight={nodeData._savedHeight}
        additionalHandles={
          <>
            {/* Rejected handle - for guardrail rejection path */}
            {nodeData.guardrailEnabled && (
              <Handle
                type="source"
                position={Position.Left}
                id="rejected"
                style={{
                  width: handleWidth,
                  height: handleHeight,
                  background: 'var(--error)',
                  border: '2px solid var(--panel)',
                  top: '70%',
                  boxShadow: isRejectedDockTarget ? '0 0 0 4px color-mix(in srgb, var(--error) 50%, transparent), 0 0 12px var(--error)' : undefined,
                  transition: 'width 0.15s, height 0.15s, box-shadow 0.15s',
                }}
                title="Guardrail rejected"
              />
            )}

            {/* Memory handle - for docking memory nodes */}
            <Handle
              type="target"
              position={Position.Right}
              id="memory"
              style={{
                width: handleWidth,
                height: handleHeight,
                background: 'var(--node-emerald, #10b981)',
                border: '2px solid var(--panel)',
                top: '70%',
                boxShadow: isMemoryDockTarget ? '0 0 0 4px color-mix(in srgb, var(--node-emerald) 50%, transparent), 0 0 12px var(--node-emerald)' : undefined,
                transition: 'width 0.15s, height 0.15s, box-shadow 0.15s',
              }}
              title="Memory storage"
            />

            {/* Checkpoint Output Handle (bottom) - connects to Callback nodes */}
            <Handle
              type="source"
              position={Position.Bottom}
              id="onCheckpoint"
              style={{
                width: handleWidth,
                height: handleHeight,
                background: 'var(--node-amber, #f59e0b)',
                border: '2px solid var(--panel)',
                left: '50%',
                boxShadow: isCheckpointDockTarget ? '0 0 0 4px color-mix(in srgb, var(--node-amber) 50%, transparent), 0 0 12px var(--node-amber)' : undefined,
                transition: 'width 0.15s, height 0.15s, box-shadow 0.15s',
              }}
              title="Checkpoint events (connect to Callback node)"
            />
          </>
        }
        dockedPreviews={
          <>
            {/* Docked nodes near rejected handle - rendered outside overflow:hidden */}
            {nodeData.guardrailEnabled && rejectedHandleConfig && dockedToRejected.map((dockedNode, index) => (
              <DockedNodePreview
                key={dockedNode.id}
                dockedNodeId={dockedNode.id}
                dockedNodeType={dockedNode.type as WorkflowNodeType}
                dockedNodeLabel={(dockedNode.data as BaseNodeData).label}
                handleConfig={{ side: 'left', topPercent: 70, handleId: 'rejected' }}
                targetNodeCollapsed={isCollapsed}
                index={index}
              />
            ))}

            {/* Docked nodes near memory handle - rendered outside overflow:hidden */}
            {useDockedNodes(id, 'memory').map((dockedNode, index) => (
              <DockedNodePreview
                key={dockedNode.id}
                dockedNodeId={dockedNode.id}
                dockedNodeType={dockedNode.type as WorkflowNodeType}
                dockedNodeLabel={(dockedNode.data as BaseNodeData).label}
                handleConfig={{ side: 'right', topPercent: 70, handleId: 'memory' }}
                targetNodeCollapsed={isCollapsed}
                index={index}
              />
            ))}

            {/* Docked nodes near onCheckpoint handle - rendered outside overflow:hidden */}
            {checkpointHandleConfig && dockedToCheckpoint.map((dockedNode, index) => (
              <DockedNodePreview
                key={dockedNode.id}
                dockedNodeId={dockedNode.id}
                dockedNodeType={dockedNode.type as WorkflowNodeType}
                dockedNodeLabel={(dockedNode.data as BaseNodeData).label}
                handleConfig={{ side: 'bottom', topPercent: 50, handleId: 'onCheckpoint' }}
                targetNodeCollapsed={isCollapsed}
                index={index}
              />
            ))}
          </>
        }
      />
    </>
  )
})

ChatAgentNode.displayName = 'ChatAgentNode'

export { ChatAgentNodeProperties } from './ChatAgentNodeProperties'

/**
 * NodeExecutionFooter - Compact execution debug info at the bottom of workflow nodes
 *
 * Shows execution order, duration (live-updating while running), retry count,
 * error preview, output preview, and an inspect button for full I/O data.
 * Imported by all node components.
 */

import { memo, useState, useEffect, useMemo } from 'react'
import { Bug } from 'lucide-react'
import type { NodeExecutionState } from '../../../services/workflowTypes'
import { formatDuration, getNodeDuration, calculateExecutionOrder, truncateText } from '../../../lib/executionUtils'
import { NodeInspectModal } from './NodeInspectModal'

export interface NodeExecutionFooterProps {
  nodeState: NodeExecutionState | undefined
  allNodeStates?: Record<string, NodeExecutionState>
  showOutput?: boolean
  showError?: boolean
}

export const NodeExecutionFooter = memo(({
  nodeState,
  allNodeStates,
  showOutput = true,
  showError = true,
}: NodeExecutionFooterProps) => {
  // Live-updating duration for running nodes
  const [, setTick] = useState(0)
  const [inspectOpen, setInspectOpen] = useState(false)

  useEffect(() => {
    if (nodeState?.status !== 'running') return
    const interval = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(interval)
  }, [nodeState?.status])

  // Execution order (memoized — only recomputes when allNodeStates changes)
  const executionOrder = useMemo(() => {
    if (!allNodeStates || !nodeState) return undefined
    return calculateExecutionOrder(allNodeStates).get(nodeState.nodeId)
  }, [allNodeStates, nodeState])

  if (!nodeState || nodeState.status === 'pending') return null

  const duration = getNodeDuration(nodeState)
  const hasError = showError && nodeState.status === 'failed' && !!nodeState.error
  const hasOutput = showOutput && nodeState.status === 'completed' && nodeState.output !== undefined
  const hasRetries = nodeState.retryCount > 0
  const canInspect = nodeState.status === 'completed' || nodeState.status === 'failed'

  // Nothing to show
  if (duration === null && !hasError && !hasOutput && !hasRetries && executionOrder === undefined && !canInspect) {
    return null
  }

  return (
    <div style={{
      marginTop: '8px',
      paddingTop: '6px',
      borderTop: '1px solid var(--border)',
    }}>
      {/* Badges row: order, duration, retries, inspect */}
      <div style={{
        display: 'flex',
        gap: '6px',
        flexWrap: 'wrap',
        alignItems: 'center',
        marginBottom: hasError || hasOutput ? '6px' : 0,
      }}>
        {/* Execution order */}
        {executionOrder !== undefined && (
          <div style={{
            padding: '1px 5px',
            background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
            borderRadius: '4px',
            fontSize: '9px',
            fontWeight: 600,
            color: 'var(--accent)',
            fontFamily: 'monospace',
          }}>
            #{executionOrder}
          </div>
        )}

        {/* Duration */}
        {duration !== null && (
          <div style={{
            padding: '1px 5px',
            background: nodeState.status === 'running'
              ? 'color-mix(in srgb, var(--accent) 15%, transparent)'
              : 'var(--panel-2)',
            borderRadius: '4px',
            fontSize: '9px',
            fontWeight: 500,
            color: nodeState.status === 'running' ? 'var(--accent)' : 'var(--text-secondary)',
            fontFamily: 'monospace',
          }}>
            {formatDuration(duration)}
          </div>
        )}

        {/* Retry count */}
        {hasRetries && (
          <div style={{
            padding: '1px 5px',
            background: 'color-mix(in srgb, var(--warning) 15%, transparent)',
            borderRadius: '4px',
            fontSize: '9px',
            fontWeight: 500,
            color: 'var(--warning)',
            fontFamily: 'monospace',
          }}>
            retry:{nodeState.retryCount}
          </div>
        )}

        {/* Inspect button — pushed to the right */}
        {canInspect && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setInspectOpen(true)
            }}
            title="Inspect node input/output"
            style={{
              marginLeft: 'auto',
              padding: '3px',
              background: 'var(--panel-2)',
              borderRadius: '4px',
              color: 'var(--text-secondary)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 20%, transparent)'
              e.currentTarget.style.color = 'var(--accent)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--panel-2)'
              e.currentTarget.style.color = 'var(--text-secondary)'
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '11px', fontFamily: 'monospace', fontWeight: 600 }}>
              {'{'} <Bug style={{ width: 10, height: 10 }} /> {'}'}
            </span>
          </button>
        )}
      </div>

      {/* Error preview */}
      {hasError && (
        <div style={{
          padding: '4px 6px',
          background: 'color-mix(in srgb, var(--error) 10%, transparent)',
          borderRadius: '4px',
          fontSize: '10px',
          color: 'var(--error)',
          fontFamily: 'monospace',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {truncateText(nodeState.error!, 60)}
        </div>
      )}

      {/* Output preview */}
      {hasOutput && (
        <div style={{
          padding: '4px 6px',
          background: 'color-mix(in srgb, var(--success) 10%, transparent)',
          borderRadius: '4px',
          fontSize: '10px',
          color: 'var(--text-secondary)',
          fontFamily: 'monospace',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {truncateText(
            typeof nodeState.output === 'string'
              ? nodeState.output
              : JSON.stringify(nodeState.output),
            50
          )}
        </div>
      )}

      {/* Inspect modal */}
      {inspectOpen && (
        <NodeInspectModal
          nodeId={nodeState.nodeId}
          onClose={() => setInspectOpen(false)}
        />
      )}
    </div>
  )
})

NodeExecutionFooter.displayName = 'NodeExecutionFooter'

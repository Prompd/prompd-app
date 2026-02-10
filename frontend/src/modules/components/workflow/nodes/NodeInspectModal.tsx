/**
 * NodeInspectModal - Shows full input/output data for an executed node
 *
 * Reads edges from the workflow store to derive the node's input
 * (source node outputs) and displays both input and output as
 * formatted JSON in a modal overlay.
 */

import { memo, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import { JsonTreeViewer, tryParseJsonValue } from '../../common/JsonTreeViewer'

interface NodeInspectModalProps {
  nodeId: string
  onClose: () => void
}

/** Format a value for display — pretty-print objects, show strings as-is */
function formatValue(value: unknown): string {
  if (value === undefined) return '(no data)'
  if (value === null) return 'null'
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export const NodeInspectModal = memo(({ nodeId, onClose }: NodeInspectModalProps) => {
  const edges = useWorkflowStore(state => state.edges)
  const nodes = useWorkflowStore(state => state.nodes)
  const executionState = useWorkflowStore(state => state.executionState)

  const nodeOutputs = executionState?.nodeOutputs
  const nodeState = executionState?.nodeStates[nodeId]

  // Derive input: find source nodes connected to this node and get their outputs
  const inputData = useMemo(() => {
    if (!nodeOutputs) return []

    const incomingEdges = edges.filter(e => e.target === nodeId)
    return incomingEdges.map(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source)
      const sourceLabel = sourceNode?.data?.label || edge.source
      return {
        sourceId: edge.source,
        sourceLabel: String(sourceLabel),
        sourceHandle: edge.sourceHandle || 'output',
        value: nodeOutputs[edge.source],
      }
    })
  }, [edges, nodes, nodeId, nodeOutputs])

  const output = nodeState?.output
  const error = nodeState?.error
  const nodeLabel = nodes.find(n => n.id === nodeId)?.data?.label || nodeId

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.5)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          width: '600px',
          maxWidth: '90vw',
          maxHeight: '80vh',
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
            Inspect: {String(nodeLabel)}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}>
          {/* Input section */}
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '8px',
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--accent)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              <ArrowDownLeft style={{ width: 12, height: 12 }} />
              Input
            </div>
            {inputData.length === 0 ? (
              <div style={{
                padding: '8px 12px',
                background: 'var(--bg)',
                borderRadius: '4px',
                fontSize: '11px',
                color: 'var(--text-secondary)',
                fontStyle: 'italic',
              }}>
                No input connections
              </div>
            ) : (
              inputData.map((input) => (
                <div key={input.sourceId} style={{ marginBottom: '8px' }}>
                  <div style={{
                    fontSize: '10px',
                    color: 'var(--text-secondary)',
                    marginBottom: '4px',
                  }}>
                    from <span style={{ fontWeight: 600 }}>{input.sourceLabel}</span>
                    {input.sourceHandle !== 'output' && (
                      <span style={{ opacity: 0.7 }}> ({input.sourceHandle})</span>
                    )}
                  </div>
                  {(() => { const parsed = tryParseJsonValue(input.value); return parsed !== null ? (
                    <div style={{
                      padding: '8px 12px',
                      background: 'var(--bg)',
                      borderRadius: '4px',
                      maxHeight: '200px',
                      overflow: 'auto',
                      border: '1px solid var(--border)',
                    }}>
                      <JsonTreeViewer
                        data={parsed}
                        rootPath={`${input.sourceId}.output`}
                        defaultExpandDepth={2}
                        maxStringPreview={60}
                      />
                    </div>
                  ) : (
                    <pre style={{
                      padding: '8px 12px',
                      background: 'var(--bg)',
                      borderRadius: '4px',
                      fontSize: '11px',
                      color: 'var(--text)',
                      fontFamily: 'monospace',
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxHeight: '200px',
                      overflow: 'auto',
                      border: '1px solid var(--border)',
                    }}>
                      {formatValue(input.value)}
                    </pre>
                  ) })()}
                </div>
              ))
            )}
          </div>

          {/* Output section */}
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '8px',
              fontSize: '11px',
              fontWeight: 600,
              color: nodeState?.status === 'failed' ? 'var(--error)' : 'var(--success)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              <ArrowUpRight style={{ width: 12, height: 12 }} />
              {nodeState?.status === 'failed' ? 'Error' : 'Output'}
            </div>
            {nodeState?.status === 'failed' && error ? (
              <pre style={{
                padding: '8px 12px',
                background: 'color-mix(in srgb, var(--error) 10%, transparent)',
                borderRadius: '4px',
                fontSize: '11px',
                color: 'var(--error)',
                fontFamily: 'monospace',
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: '300px',
                overflow: 'auto',
                border: '1px solid color-mix(in srgb, var(--error) 30%, transparent)',
              }}>
                {error}
              </pre>
            ) : output !== undefined ? (
              (() => { const parsed = tryParseJsonValue(output); return parsed !== null ? (
                <div style={{
                  padding: '8px 12px',
                  background: 'var(--bg)',
                  borderRadius: '4px',
                  maxHeight: '300px',
                  overflow: 'auto',
                  border: '1px solid var(--border)',
                }}>
                  <JsonTreeViewer
                    data={parsed}
                    rootPath={`${nodeId}.output`}
                    defaultExpandDepth={2}
                    maxStringPreview={80}
                  />
                </div>
              ) : (
                <pre style={{
                  padding: '8px 12px',
                  background: 'var(--bg)',
                  borderRadius: '4px',
                  fontSize: '11px',
                  color: 'var(--text)',
                  fontFamily: 'monospace',
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: '300px',
                  overflow: 'auto',
                  border: '1px solid var(--border)',
                }}>
                  {formatValue(output)}
                </pre>
              ) })()
            ) : (
              <div style={{
                padding: '8px 12px',
                background: 'var(--bg)',
                borderRadius: '4px',
                fontSize: '11px',
                color: 'var(--text-secondary)',
                fontStyle: 'italic',
              }}>
                {nodeState?.status === 'running' ? 'Still executing...' : 'No output data'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
})

NodeInspectModal.displayName = 'NodeInspectModal'

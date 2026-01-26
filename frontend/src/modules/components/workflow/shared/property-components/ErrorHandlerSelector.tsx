/**
 * ErrorHandlerSelector - Dropdown to select an ErrorHandler node to use for this node
 * Similar to LLMProviderConfig but simpler - just a dropdown to select error handler node
 */

import { AlertTriangle } from 'lucide-react'
import { useErrorHandlerNodes } from '../hooks/useNodeConnections'
import type { ErrorHandlerNodeData } from '../../../../services/workflowTypes'
import { labelStyle, selectStyle } from '../styles/propertyStyles'

export interface ErrorHandlerSelectorProps {
  errorHandlerNodeId?: string
  onErrorHandlerChange: (nodeId: string | undefined) => void
  currentNodeType: string
}

export function ErrorHandlerSelector({
  errorHandlerNodeId,
  onErrorHandlerChange,
  currentNodeType,
}: ErrorHandlerSelectorProps) {
  // Error handler nodes are config nodes - shouldn't reference themselves
  // And error-handler nodes don't need error handlers
  if (currentNodeType === 'error-handler') {
    return null
  }

  const errorHandlerNodes = useErrorHandlerNodes()
  const selectedHandler = errorHandlerNodes.find(n => n.id === errorHandlerNodeId)
  const selectedHandlerData = selectedHandler?.data as ErrorHandlerNodeData | undefined

  // Strategy display
  const strategyLabels: Record<string, string> = {
    retry: 'Retry',
    fallback: 'Fallback',
    notify: 'Notify',
    ignore: 'Ignore',
    rethrow: 'Rethrow',
  }

  if (errorHandlerNodes.length === 0) {
    return null // Don't show if no error handlers exist
  }

  return (
    <div>
      <label style={labelStyle}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <AlertTriangle size={12} style={{ color: 'var(--node-rose)' }} />
          Error Handler
        </span>
      </label>
      <select
        value={errorHandlerNodeId || ''}
        onChange={(e) => onErrorHandlerChange(e.target.value || undefined)}
        style={selectStyle}
      >
        <option value="">None (fail on error)</option>
        {errorHandlerNodes.map(node => {
          const hData = node.data as ErrorHandlerNodeData
          return (
            <option key={node.id} value={node.id}>
              {hData.label || node.id} ({strategyLabels[hData.strategy] || hData.strategy})
            </option>
          )
        })}
      </select>
      {selectedHandlerData && (
        <div style={{
          marginTop: '8px',
          padding: '8px',
          background: 'color-mix(in srgb, var(--node-rose) 10%, transparent)',
          borderRadius: '6px',
          fontSize: '11px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <AlertTriangle size={14} style={{ color: 'var(--node-rose)' }} />
          <div>
            <div style={{ fontWeight: 500, color: 'var(--text)' }}>
              {strategyLabels[selectedHandlerData.strategy] || selectedHandlerData.strategy}
            </div>
            {selectedHandlerData.strategy === 'retry' && selectedHandlerData.retry && (
              <div style={{ color: 'var(--text-secondary)' }}>
                {selectedHandlerData.retry.maxAttempts} attempts, {selectedHandlerData.retry.backoffMs}ms backoff
              </div>
            )}
            {selectedHandlerData.description && (
              <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                {selectedHandlerData.description}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

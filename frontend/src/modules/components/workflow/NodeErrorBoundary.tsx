/**
 * NodeErrorBoundary - Error boundary for workflow nodes
 *
 * Catches rendering errors in individual nodes and displays a fallback UI
 * instead of crashing the entire workflow canvas.
 */

import { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface NodeErrorBoundaryProps {
  nodeId: string
  nodeType: string
  children: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface NodeErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class NodeErrorBoundary extends Component<NodeErrorBoundaryProps, NodeErrorBoundaryState> {
  constructor(props: NodeErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<NodeErrorBoundaryState> {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(`[NodeErrorBoundary] Error in node ${this.props.nodeId}:`, error, errorInfo)

    this.setState({
      error,
      errorInfo,
    })

    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return <NodeErrorFallback
        nodeId={this.props.nodeId}
        nodeType={this.props.nodeType}
        error={this.state.error}
        onReset={this.handleReset}
      />
    }

    return this.props.children
  }
}

interface NodeErrorFallbackProps {
  nodeId: string
  nodeType: string
  error: Error | null
  onReset: () => void
}

function NodeErrorFallback({ nodeId, nodeType, error, onReset }: NodeErrorFallbackProps): JSX.Element {
  return (
    <div
      style={{
        minWidth: '200px',
        maxWidth: '300px',
        background: 'var(--panel)',
        borderRadius: '8px',
        border: '2px solid var(--error)',
        boxShadow: '0 0 0 2px color-mix(in srgb, var(--error) 30%, transparent)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          borderBottom: '1px solid var(--border)',
          background: 'color-mix(in srgb, var(--error) 10%, transparent)',
        }}
      >
        <AlertTriangle style={{ width: 14, height: 14, color: 'var(--error)' }} />
        <span
          style={{
            flex: 1,
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--error)',
          }}
        >
          Node Error
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: '12px' }}>
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
          <div><strong>Type:</strong> {nodeType}</div>
          <div><strong>ID:</strong> {nodeId}</div>
        </div>

        {error && (
          <div
            style={{
              padding: '8px',
              background: 'var(--input-bg)',
              borderRadius: '4px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono, monospace)',
              color: 'var(--error)',
              marginBottom: '10px',
              maxHeight: '100px',
              overflow: 'auto',
            }}
          >
            {error.message}
          </div>
        )}

        <button
          onClick={onReset}
          style={{
            width: '100%',
            padding: '6px 12px',
            background: 'var(--input-bg)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 500,
            color: 'var(--text)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'background 0.15s, border-color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--hover)'
            e.currentTarget.style.borderColor = 'var(--accent)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--input-bg)'
            e.currentTarget.style.borderColor = 'var(--border)'
          }}
        >
          <RefreshCw style={{ width: 12, height: 12 }} />
          Reset Node
        </button>

        <div
          style={{
            marginTop: '8px',
            fontSize: '10px',
            color: 'var(--muted)',
            textAlign: 'center',
          }}
        >
          Check console for details
        </div>
      </div>
    </div>
  )
}

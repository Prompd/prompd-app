import { clsx } from 'clsx'

export interface PrompdMetadataProps {
  metadata: {
    provider?: string
    model?: string
    usage?: {
      promptTokens?: number
      completionTokens?: number
      totalTokens?: number
    }
    intent?: string
    confidence?: number
    timestamp?: Date | string
    executionTime?: number
    [key: string]: any
  }
  className?: string
  compact?: boolean
}

/**
 * Display metadata information from LLM responses or executions
 */
export function PrompdMetadata({ metadata, className, compact = false }: PrompdMetadataProps) {
  const {
    provider,
    model,
    usage,
    intent,
    confidence,
    timestamp,
    executionTime,
    ...customFields
  } = metadata

  if (compact) {
    return (
      <div
        className={clsx('prompd-metadata prompd-metadata-compact', className)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.5rem 0.75rem',
          fontSize: '0.75rem',
          color: 'var(--prompd-muted)',
          borderTop: '1px solid var(--prompd-border)',
        }}
      >
        {provider && (
          <span className="prompd-metadata-provider">
            <span style={{ opacity: 0.7 }}>via</span> {provider}
          </span>
        )}
        {model && (
          <span className="prompd-metadata-model">
            {model}
          </span>
        )}
        {usage?.totalTokens && (
          <span className="prompd-metadata-tokens">
            {usage.totalTokens.toLocaleString()} tokens
          </span>
        )}
      </div>
    )
  }

  return (
    <div
      className={clsx('prompd-metadata prompd-metadata-full', className)}
      style={{
        padding: '1rem',
        background: 'var(--prompd-panel)',
        border: '1px solid var(--prompd-border)',
        borderRadius: '0.5rem',
        fontSize: '0.875rem',
      }}
    >
      <div
        className="prompd-metadata-header"
        style={{
          fontWeight: 600,
          marginBottom: '0.75rem',
          color: 'var(--prompd-text)',
        }}
      >
        Metadata
      </div>

      <div
        className="prompd-metadata-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          gap: '0.5rem',
          color: 'var(--prompd-text)',
        }}
      >
        {provider && (
          <>
            <div style={{ color: 'var(--prompd-muted)' }}>Provider:</div>
            <div className="prompd-metadata-provider">{provider}</div>
          </>
        )}

        {model && (
          <>
            <div style={{ color: 'var(--prompd-muted)' }}>Model:</div>
            <div className="prompd-metadata-model">{model}</div>
          </>
        )}

        {intent && (
          <>
            <div style={{ color: 'var(--prompd-muted)' }}>Intent:</div>
            <div className="prompd-metadata-intent">
              {intent}
              {confidence && (
                <span style={{ marginLeft: '0.5rem', opacity: 0.7 }}>
                  ({Math.round(confidence * 100)}%)
                </span>
              )}
            </div>
          </>
        )}

        {usage && (
          <>
            <div style={{ color: 'var(--prompd-muted)' }}>Tokens:</div>
            <div className="prompd-metadata-tokens">
              {usage.totalTokens?.toLocaleString() || 0}
              {usage.promptTokens && usage.completionTokens && (
                <span style={{ marginLeft: '0.5rem', opacity: 0.7, fontSize: '0.75rem' }}>
                  ({usage.promptTokens.toLocaleString()} + {usage.completionTokens.toLocaleString()})
                </span>
              )}
            </div>
          </>
        )}

        {executionTime && (
          <>
            <div style={{ color: 'var(--prompd-muted)' }}>Execution:</div>
            <div className="prompd-metadata-time">{executionTime}ms</div>
          </>
        )}

        {timestamp && (
          <>
            <div style={{ color: 'var(--prompd-muted)' }}>Timestamp:</div>
            <div className="prompd-metadata-timestamp">
              {new Date(timestamp).toLocaleString()}
            </div>
          </>
        )}

        {/* Custom fields */}
        {Object.entries(customFields).map(([key, value]) => (
          <div key={key} style={{ display: 'contents' }}>
            <div style={{ color: 'var(--prompd-muted)' }}>{key}:</div>
            <div className={`prompd-metadata-${key}`}>
              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

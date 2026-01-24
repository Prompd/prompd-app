import { Package, Star, Download } from 'lucide-react'
import { clsx } from 'clsx'

export interface PrompdPackageRecommendation {
  package: {
    name: string
    version: string
    description: string
    rating?: number
    downloads?: number
    tags?: string[]
  }
  score: number
  reason: string
}

export interface PrompdPackageSuggestionMessageProps {
  recommendations: PrompdPackageRecommendation[]
  onAccept: (pkg: PrompdPackageRecommendation['package']) => void
  onDecline: () => void
  className?: string
  layout?: 'vertical' | 'horizontal'
  compact?: boolean
}

/**
 * Inline chat message component for displaying package suggestions
 * Shows accept/decline actions for each package
 */
export function PrompdPackageSuggestionMessage({
  recommendations,
  onAccept,
  onDecline,
  className,
  layout = 'vertical',
  compact = false
}: PrompdPackageSuggestionMessageProps) {
  if (recommendations.length === 0) {
    return (
      <div className={clsx('prompd-package-recommendation-message-empty', className)}>
        <div
          style={{
            padding: '1rem',
            textAlign: 'center',
            color: 'var(--prompd-muted)',
            fontSize: '0.875rem',
          }}
        >
          No package recommendations
        </div>
      </div>
    )
  }

  return (
    <div
      className={clsx(
        'prompd-package-recommendation-message',
        layout === 'horizontal' && 'prompd-package-recommendation-message-horizontal',
        compact && 'prompd-package-recommendation-message-compact',
        className
      )}
      style={{
        display: 'flex',
        flexDirection: layout === 'horizontal' ? 'row' : 'column',
        gap: compact ? '0.5rem' : '0.75rem',
      }}
    >
      {recommendations.map((rec, index) => (
        <div
          key={`${rec.package.name}-${index}`}
          className="prompd-package-recommendation-card"
          style={{
            padding: compact ? '0.75rem' : '1rem',
            background: 'var(--prompd-panel)',
            border: '1px solid var(--prompd-border)',
            borderRadius: '0.5rem',
            transition: 'all 0.2s',
          }}
        >
          {/* Package Info */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              marginBottom: '0.75rem',
            }}
          >
            {/* Icon */}
            <div
              style={{
                padding: '0.5rem',
                borderRadius: '0.375rem',
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                flexShrink: 0,
              }}
            >
              <Package
                style={{
                  width: compact ? '1rem' : '1.25rem',
                  height: compact ? '1rem' : '1.25rem',
                  color: 'white',
                }}
              />
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h4
                style={{
                  fontSize: compact ? '0.875rem' : '1rem',
                  fontWeight: 600,
                  color: 'var(--prompd-text)',
                  marginBottom: '0.25rem',
                }}
              >
                {rec.package.name}
              </h4>
              <p
                style={{
                  fontSize: compact ? '0.75rem' : '0.875rem',
                  color: 'var(--prompd-muted)',
                  marginBottom: '0.5rem',
                }}
              >
                v{rec.package.version}
              </p>
              <p
                style={{
                  fontSize: '0.875rem',
                  color: 'var(--prompd-text)',
                  marginBottom: '0.5rem',
                  lineHeight: 1.5,
                }}
              >
                {rec.package.description}
              </p>

              {/* Reason */}
              <div
                style={{
                  padding: compact ? '0.375rem 0.5rem' : '0.5rem 0.75rem',
                  background: 'var(--prompd-accent-bg)',
                  border: '1px solid var(--prompd-accent)',
                  borderRadius: '0.375rem',
                  marginBottom: '0.5rem',
                }}
              >
                <p
                  style={{
                    fontSize: '0.8125rem',
                    color: 'var(--prompd-accent)',
                  }}
                >
                  {rec.reason}
                </p>
              </div>

              {/* Stats */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  fontSize: '0.8125rem',
                  color: 'var(--prompd-muted)',
                }}
              >
                {rec.package.rating !== undefined && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Star
                      style={{
                        width: '1rem',
                        height: '1rem',
                        fill: '#fbbf24',
                        color: '#fbbf24',
                      }}
                    />
                    <span>{rec.package.rating.toFixed(1)}</span>
                  </div>
                )}
                {rec.package.downloads !== undefined && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Download style={{ width: '1rem', height: '1rem' }} />
                    <span>{formatNumber(rec.package.downloads)}</span>
                  </div>
                )}
                <div
                  style={{
                    marginLeft: 'auto',
                    padding: '0.125rem 0.5rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    background:
                      rec.score >= 0.8
                        ? '#d1fae5'
                        : rec.score >= 0.6
                        ? '#fef3c7'
                        : '#f1f5f9',
                    color:
                      rec.score >= 0.8
                        ? '#065f46'
                        : rec.score >= 0.6
                        ? '#92400e'
                        : '#475569',
                  }}
                >
                  {Math.round(rec.score * 100)}% match
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              justifyContent: 'flex-end',
            }}
          >
            <button
              onClick={onDecline}
              style={{
                padding: compact ? '0.375rem 0.75rem' : '0.5rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: 'var(--prompd-text)',
                background: 'transparent',
                border: '1px solid var(--prompd-border)',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--prompd-border)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              Decline
            </button>
            <button
              onClick={() => onAccept(rec.package)}
              style={{
                padding: compact ? '0.375rem 0.75rem' : '0.5rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: 'white',
                background: 'var(--prompd-accent)',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)'
              }}
            >
              Accept
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`
  }
  return num.toString()
}

// Multi-Provider Comparison Results Display
import { useState } from 'react'
import { clsx } from 'clsx'

export interface ProviderResult {
  provider: string
  providerName: string
  status: 'success' | 'failed'
  response?: {
    content: string
    tokens: {
      input: number
      output: number
      total: number
    }
    cost: number
    latency: number
    model: string
  }
  error?: string
}

export interface ComparisonMetadata {
  cheapest?: {
    provider: string
    cost: number
  }
  fastest?: {
    provider: string
    latency: number
  }
  bestQuality?: {
    provider: string
    rating: number
  }
  totalCost: number
  totalTime: number
  successCount: number
  failureCount: number
}

export interface PrompdComparisonResultsProps {
  results: ProviderResult[]
  comparison: ComparisonMetadata
  className?: string
  onRateResponse?: (provider: string, rating: number) => void
}

export function PrompdComparisonResults({
  results,
  comparison,
  className,
  onRateResponse
}: PrompdComparisonResultsProps) {
  const [activeTab, setActiveTab] = useState<'metadata' | string>('metadata')

  const successfulResults = results.filter(r => r.status === 'success')
  const failedResults = results.filter(r => r.status === 'failed')

  return (
    <div className={clsx('prompd-comparison-results flex flex-col h-full', className)}>
      {/* Tab Navigation */}
      <div
        className="sticky top-0 z-10 flex items-center gap-1 overflow-x-auto"
        style={{
          borderBottom: '1px solid var(--prompd-border)',
          background: 'var(--prompd-panel)',
          marginBottom: '0.75rem'
        }}
      >
        {/* Metadata Tab (Always First) */}
        <button
          onClick={() => setActiveTab('metadata')}
          className={clsx(
            'px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap',
            activeTab === 'metadata' && 'border-b-2'
          )}
          style={{
            color: activeTab === 'metadata' ? 'var(--prompd-accent)' : 'var(--prompd-muted)',
            borderColor: activeTab === 'metadata' ? 'var(--prompd-accent)' : 'transparent'
          }}
        >
          📊 Metadata
        </button>

        {/* Provider Tabs */}
        {results.map(result => (
          <button
            key={result.provider}
            onClick={() => setActiveTab(result.provider)}
            className={clsx(
              'px-4 py-2 text-sm transition-colors whitespace-nowrap flex items-center gap-2',
              activeTab === result.provider && 'border-b-2'
            )}
            style={{
              color: activeTab === result.provider ? 'var(--prompd-accent)' : 'var(--prompd-muted)',
              borderColor: activeTab === result.provider ? 'var(--prompd-accent)' : 'transparent'
            }}
          >
            <span className="font-medium">{result.providerName}</span>
            {result.status === 'success' && result.response && (
              <span className="text-xs opacity-70">
                ${result.response.cost.toFixed(4)} • {result.response.latency}ms
              </span>
            )}
            {result.status === 'failed' && (
              <span className="text-xs text-red-500">✗</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div
        className="p-4 rounded-lg"
        style={{
          background: 'var(--prompd-panel)',
          border: '1px solid var(--prompd-border)'
        }}
      >
        {/* Metadata Tab Content */}
        {activeTab === 'metadata' && (
          <div className="space-y-4">
            {/* Cost Comparison Header */}
            <div className="text-center">
              <h3 className="text-lg font-bold mb-1" style={{ color: 'var(--prompd-text)' }}>
                Cost Comparison
              </h3>
              <p className="text-sm" style={{ color: 'var(--prompd-muted)' }}>
                Executed across {comparison.successCount} provider{comparison.successCount === 1 ? '' : 's'} in {(comparison.totalTime / 1000).toFixed(2)}s
              </p>
            </div>

            {/* Winner Cards */}
            {successfulResults.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Cheapest */}
                {comparison.cheapest && (
                  <div
                    className="p-3 rounded-lg"
                    style={{
                      background: 'var(--prompd-panel-hover)',
                      border: '2px solid #10b981'
                    }}
                  >
                    <div className="text-2xl mb-1">🟢</div>
                    <div className="text-xs font-semibold mb-1" style={{ color: '#10b981' }}>
                      CHEAPEST
                    </div>
                    <div className="font-medium text-sm mb-1" style={{ color: 'var(--prompd-text)' }}>
                      {results.find(r => r.provider === comparison.cheapest?.provider)?.providerName}
                    </div>
                    <div className="text-lg font-mono font-bold" style={{ color: 'var(--prompd-text)' }}>
                      ${comparison.cheapest.cost.toFixed(4)}
                    </div>
                  </div>
                )}

                {/* Fastest */}
                {comparison.fastest && (
                  <div
                    className="p-3 rounded-lg"
                    style={{
                      background: 'var(--prompd-panel-hover)',
                      border: '2px solid #3b82f6'
                    }}
                  >
                    <div className="text-2xl mb-1">🔵</div>
                    <div className="text-xs font-semibold mb-1" style={{ color: '#3b82f6' }}>
                      FASTEST
                    </div>
                    <div className="font-medium text-sm mb-1" style={{ color: 'var(--prompd-text)' }}>
                      {results.find(r => r.provider === comparison.fastest?.provider)?.providerName}
                    </div>
                    <div className="text-lg font-mono font-bold" style={{ color: 'var(--prompd-text)' }}>
                      {comparison.fastest.latency}ms
                    </div>
                  </div>
                )}

                {/* Best Quality */}
                {comparison.bestQuality && (
                  <div
                    className="p-3 rounded-lg"
                    style={{
                      background: 'var(--prompd-panel-hover)',
                      border: '2px solid #f59e0b'
                    }}
                  >
                    <div className="text-2xl mb-1">⭐</div>
                    <div className="text-xs font-semibold mb-1" style={{ color: '#f59e0b' }}>
                      BEST QUALITY
                    </div>
                    <div className="font-medium text-sm mb-1" style={{ color: 'var(--prompd-text)' }}>
                      {results.find(r => r.provider === comparison.bestQuality?.provider)?.providerName}
                    </div>
                    <div className="text-lg font-mono font-bold" style={{ color: 'var(--prompd-text)' }}>
                      {comparison.bestQuality.rating.toFixed(1)}/5
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Summary Stats */}
            <div
              className="p-3 rounded-lg space-y-2"
              style={{
                background: 'var(--prompd-panel-hover)',
                border: '1px solid var(--prompd-border)'
              }}
            >
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--prompd-muted)' }}>Total Cost:</span>
                <span className="font-mono font-semibold" style={{ color: 'var(--prompd-text)' }}>
                  ${comparison.totalCost.toFixed(4)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--prompd-muted)' }}>Total Time:</span>
                <span className="font-mono font-semibold" style={{ color: 'var(--prompd-text)' }}>
                  {(comparison.totalTime / 1000).toFixed(2)}s
                </span>
              </div>
            </div>

            {/* Provider Breakdown Table */}
            <div className="overflow-x-auto">
              <div className="text-xs font-semibold mb-2" style={{ color: 'var(--prompd-muted)' }}>
                PROVIDER BREAKDOWN
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--prompd-border)' }}>
                    <th className="text-left py-2 pr-4" style={{ color: 'var(--prompd-muted)' }}>Provider</th>
                    <th className="text-right py-2 px-4" style={{ color: 'var(--prompd-muted)' }}>Tokens</th>
                    <th className="text-right py-2 px-4" style={{ color: 'var(--prompd-muted)' }}>Cost</th>
                    <th className="text-right py-2 pl-4" style={{ color: 'var(--prompd-muted)' }}>Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {successfulResults.map(result => (
                    <tr key={result.provider} style={{ borderBottom: '1px solid var(--prompd-border)' }}>
                      <td className="py-2 pr-4 font-medium" style={{ color: 'var(--prompd-text)' }}>
                        {result.providerName}
                      </td>
                      <td className="text-right py-2 px-4 font-mono" style={{ color: 'var(--prompd-text)' }}>
                        {result.response?.tokens.total}
                      </td>
                      <td className="text-right py-2 px-4 font-mono" style={{ color: 'var(--prompd-text)' }}>
                        ${result.response?.cost.toFixed(4)}
                      </td>
                      <td className="text-right py-2 pl-4 font-mono" style={{ color: 'var(--prompd-text)' }}>
                        {result.response?.latency}ms
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Failed Providers */}
            {failedResults.length > 0 && (
              <div
                className="p-3 rounded-lg"
                style={{
                  background: 'var(--prompd-panel-hover)',
                  border: '1px solid #ef4444'
                }}
              >
                <div className="text-xs font-semibold mb-2" style={{ color: '#ef4444' }}>
                  FAILED PROVIDERS ({failedResults.length})
                </div>
                {failedResults.map(result => (
                  <div key={result.provider} className="text-sm py-1">
                    <span className="font-medium" style={{ color: 'var(--prompd-text)' }}>
                      {result.providerName}:
                    </span>{' '}
                    <span style={{ color: 'var(--prompd-muted)' }}>{result.error}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Individual Provider Response Tabs */}
        {results.map(result => (
          activeTab === result.provider && (
            <div key={result.provider} className="space-y-4">
              {result.status === 'success' && result.response ? (
                <>
                  {/* Response Content */}
                  <div>
                    <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--prompd-muted)' }}>
                      RESPONSE
                    </h4>
                    <div
                      className="p-3 rounded whitespace-pre-wrap font-mono text-sm"
                      style={{
                        background: 'var(--prompd-panel-hover)',
                        color: 'var(--prompd-text)'
                      }}
                    >
                      {result.response.content}
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="text-center">
                      <div className="text-xs" style={{ color: 'var(--prompd-muted)' }}>Cost</div>
                      <div className="text-lg font-mono font-semibold" style={{ color: 'var(--prompd-text)' }}>
                        ${result.response.cost.toFixed(4)}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs" style={{ color: 'var(--prompd-muted)' }}>Latency</div>
                      <div className="text-lg font-mono font-semibold" style={{ color: 'var(--prompd-text)' }}>
                        {result.response.latency}ms
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs" style={{ color: 'var(--prompd-muted)' }}>Tokens</div>
                      <div className="text-lg font-mono font-semibold" style={{ color: 'var(--prompd-text)' }}>
                        {result.response.tokens.total}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs" style={{ color: 'var(--prompd-muted)' }}>Model</div>
                      <div className="text-sm font-medium" style={{ color: 'var(--prompd-text)' }}>
                        {result.response.model}
                      </div>
                    </div>
                  </div>

                  {/* Rating */}
                  {onRateResponse && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--prompd-muted)' }}>
                        RATE THIS RESPONSE
                      </h4>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map(rating => (
                          <button
                            key={rating}
                            onClick={() => onRateResponse(result.provider, rating)}
                            className="px-3 py-1 rounded transition-colors"
                            style={{
                              background: 'var(--prompd-panel-hover)',
                              border: '1px solid var(--prompd-border)',
                              color: 'var(--prompd-text)'
                            }}
                          >
                            {'⭐'.repeat(rating)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* Error State */
                <div
                  className="p-4 rounded-lg text-center"
                  style={{
                    background: 'var(--prompd-panel-hover)',
                    border: '1px solid #ef4444'
                  }}
                >
                  <div className="text-4xl mb-2">⚠️</div>
                  <div className="font-semibold mb-1" style={{ color: '#ef4444' }}>
                    Execution Failed
                  </div>
                  <div className="text-sm" style={{ color: 'var(--prompd-muted)' }}>
                    {result.error}
                  </div>
                </div>
              )}
            </div>
          )
        ))}
      </div>
    </div>
  )
}

import { clsx } from 'clsx'
import { calculateCost, formatCost, formatTokens, getModelPricing } from '../constants/pricing'

/**
 * Usage event types for tracking different LLM operations
 */
export type UsageEventType =
  | 'execution'      // Prompd execution
  | 'chat'           // Chat conversation
  | 'generation'     // Prompd generation
  | 'editing'        // Prompd editing assistance
  | 'other'

/**
 * Single usage event record
 */
export interface UsageEvent {
  id: string
  type: UsageEventType
  timestamp: string
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cost: number
  metadata?: {
    promptName?: string
    packageName?: string
    conversationId?: string
    [key: string]: unknown
  }
}

/**
 * Aggregated usage statistics
 */
export interface UsageStats {
  totalTokens: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCost: number
  eventCount: number
  byType: Record<UsageEventType, {
    tokens: number
    cost: number
    count: number
  }>
  byModel: Record<string, {
    tokens: number
    cost: number
    count: number
  }>
}

/**
 * Props for PrompdUsageTracker component
 */
export interface PrompdUsageTrackerProps {
  events: UsageEvent[]
  className?: string
  variant?: 'compact' | 'detailed' | 'summary'
  showByType?: boolean
  showByModel?: boolean
  title?: string
}

/**
 * Calculate aggregated stats from events
 */
export function calculateUsageStats(events: UsageEvent[]): UsageStats {
  const stats: UsageStats = {
    totalTokens: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCost: 0,
    eventCount: events.length,
    byType: {
      execution: { tokens: 0, cost: 0, count: 0 },
      chat: { tokens: 0, cost: 0, count: 0 },
      generation: { tokens: 0, cost: 0, count: 0 },
      editing: { tokens: 0, cost: 0, count: 0 },
      other: { tokens: 0, cost: 0, count: 0 }
    },
    byModel: {}
  }

  for (const event of events) {
    stats.totalTokens += event.totalTokens
    stats.totalInputTokens += event.inputTokens
    stats.totalOutputTokens += event.outputTokens
    stats.totalCost += event.cost

    // By type
    if (stats.byType[event.type]) {
      stats.byType[event.type].tokens += event.totalTokens
      stats.byType[event.type].cost += event.cost
      stats.byType[event.type].count += 1
    }

    // By model
    if (!stats.byModel[event.model]) {
      stats.byModel[event.model] = { tokens: 0, cost: 0, count: 0 }
    }
    stats.byModel[event.model].tokens += event.totalTokens
    stats.byModel[event.model].cost += event.cost
    stats.byModel[event.model].count += 1
  }

  return stats
}

/**
 * Create a usage event from LLM response
 */
export function createUsageEvent(
  type: UsageEventType,
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  metadata?: UsageEvent['metadata']
): UsageEvent {
  const cost = calculateCost(model, inputTokens, outputTokens)

  return {
    id: crypto.randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    provider,
    model,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    cost,
    metadata
  }
}

/**
 * Get display label for event type
 */
function getTypeLabel(type: UsageEventType): string {
  switch (type) {
    case 'execution': return 'Execution'
    case 'chat': return 'Chat'
    case 'generation': return 'Generation'
    case 'editing': return 'Editing'
    default: return 'Other'
  }
}

/**
 * Get icon for event type
 */
function getTypeIcon(type: UsageEventType): string {
  switch (type) {
    case 'execution': return '▶'
    case 'chat': return '💬'
    case 'generation': return '✨'
    case 'editing': return '✏'
    default: return '•'
  }
}

/**
 * PrompdUsageTracker Component
 * Displays token usage and cost tracking for LLM operations
 */
export function PrompdUsageTracker({
  events,
  className,
  variant = 'compact',
  showByType = true,
  showByModel = false,
  title = 'Usage'
}: PrompdUsageTrackerProps) {
  const stats = calculateUsageStats(events)

  // Compact: Just show total tokens and cost
  if (variant === 'compact') {
    return (
      <div
        className={clsx('prompd-usage-tracker inline-flex items-center gap-2 px-2 py-1 rounded text-xs', className)}
        style={{
          background: 'var(--prompd-panel)',
          border: '1px solid var(--prompd-border)',
          color: 'var(--prompd-muted)'
        }}
      >
        <span title="Total tokens">{formatTokens(stats.totalTokens)} tokens</span>
        <span style={{ opacity: 0.5 }}>|</span>
        <span
          title="Estimated cost"
          style={{ color: stats.totalCost > 0 ? 'var(--prompd-accent)' : undefined }}
        >
          {formatCost(stats.totalCost)}
        </span>
      </div>
    )
  }

  // Summary: Show totals with type breakdown
  if (variant === 'summary') {
    return (
      <div
        className={clsx('prompd-usage-tracker rounded-lg p-3', className)}
        style={{
          background: 'var(--prompd-panel)',
          border: '1px solid var(--prompd-border)'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium" style={{ color: 'var(--prompd-text)' }}>
            {title}
          </span>
          <span
            className="text-sm font-semibold"
            style={{ color: 'var(--prompd-accent)' }}
          >
            {formatCost(stats.totalCost)}
          </span>
        </div>

        {/* Total tokens */}
        <div className="flex items-center justify-between text-xs mb-2" style={{ color: 'var(--prompd-muted)' }}>
          <span>Total tokens</span>
          <span>{formatTokens(stats.totalTokens)}</span>
        </div>

        {/* Input/Output breakdown */}
        <div className="flex gap-4 text-xs mb-3" style={{ color: 'var(--prompd-muted)' }}>
          <div className="flex items-center gap-1">
            <span style={{ opacity: 0.6 }}>In:</span>
            <span>{formatTokens(stats.totalInputTokens)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span style={{ opacity: 0.6 }}>Out:</span>
            <span>{formatTokens(stats.totalOutputTokens)}</span>
          </div>
        </div>

        {/* By type breakdown */}
        {showByType && stats.eventCount > 0 && (
          <div className="pt-2 border-t" style={{ borderColor: 'var(--prompd-border)' }}>
            <div className="text-xs font-medium mb-2" style={{ color: 'var(--prompd-muted)' }}>
              By Type
            </div>
            <div className="space-y-1">
              {(Object.entries(stats.byType) as [UsageEventType, typeof stats.byType.chat][])
                .filter(([, data]) => data.count > 0)
                .map(([type, data]) => (
                  <div
                    key={type}
                    className="flex items-center justify-between text-xs"
                    style={{ color: 'var(--prompd-text)' }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{getTypeIcon(type)}</span>
                      <span>{getTypeLabel(type)}</span>
                      <span style={{ color: 'var(--prompd-muted)' }}>({data.count})</span>
                    </div>
                    <span style={{ color: 'var(--prompd-muted)' }}>{formatCost(data.cost)}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* By model breakdown */}
        {showByModel && Object.keys(stats.byModel).length > 0 && (
          <div className="pt-2 mt-2 border-t" style={{ borderColor: 'var(--prompd-border)' }}>
            <div className="text-xs font-medium mb-2" style={{ color: 'var(--prompd-muted)' }}>
              By Model
            </div>
            <div className="space-y-1">
              {Object.entries(stats.byModel).map(([model, data]) => {
                const pricing = getModelPricing(model)
                return (
                  <div
                    key={model}
                    className="flex items-center justify-between text-xs"
                    style={{ color: 'var(--prompd-text)' }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="truncate max-w-[150px]" title={model}>
                        {pricing?.name || model}
                      </span>
                      <span style={{ color: 'var(--prompd-muted)' }}>({data.count})</span>
                    </div>
                    <span style={{ color: 'var(--prompd-muted)' }}>{formatCost(data.cost)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Detailed: Full breakdown with individual events
  return (
    <div
      className={clsx('prompd-usage-tracker rounded-lg', className)}
      style={{
        background: 'var(--prompd-panel)',
        border: '1px solid var(--prompd-border)'
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-3 border-b"
        style={{ borderColor: 'var(--prompd-border)' }}
      >
        <span className="text-sm font-medium" style={{ color: 'var(--prompd-text)' }}>
          {title}
        </span>
        <div className="flex items-center gap-3 text-xs">
          <span style={{ color: 'var(--prompd-muted)' }}>
            {formatTokens(stats.totalTokens)} tokens
          </span>
          <span
            className="font-semibold"
            style={{ color: 'var(--prompd-accent)' }}
          >
            {formatCost(stats.totalCost)}
          </span>
        </div>
      </div>

      {/* Events list */}
      <div className="max-h-[300px] overflow-y-auto">
        {events.length === 0 ? (
          <div className="p-4 text-center text-xs" style={{ color: 'var(--prompd-muted)' }}>
            No usage recorded yet
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--prompd-border)' }}>
            {events.slice().reverse().map((event) => {
              const pricing = getModelPricing(event.model)
              return (
                <div key={event.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{getTypeIcon(event.type)}</span>
                      <div>
                        <div className="text-sm" style={{ color: 'var(--prompd-text)' }}>
                          {getTypeLabel(event.type)}
                          {event.metadata?.promptName && (
                            <span style={{ color: 'var(--prompd-muted)' }}>
                              {' - '}{event.metadata.promptName}
                            </span>
                          )}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--prompd-muted)' }}>
                          {pricing?.name || event.model}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm" style={{ color: 'var(--prompd-accent)' }}>
                        {formatCost(event.cost)}
                      </div>
                      <div className="text-xs" style={{ color: 'var(--prompd-muted)' }}>
                        {formatTokens(event.totalTokens)} tokens
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3 mt-1 text-xs" style={{ color: 'var(--prompd-muted)' }}>
                    <span>In: {formatTokens(event.inputTokens)}</span>
                    <span>Out: {formatTokens(event.outputTokens)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
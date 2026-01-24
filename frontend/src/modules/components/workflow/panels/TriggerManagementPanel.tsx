/**
 * TriggerManagementPanel - Sidebar panel for managing workflow triggers
 *
 * Allows users to configure workflows to run automatically via:
 * - Schedule triggers (cron expressions, intervals)
 * - Webhook triggers (HTTP endpoints)
 * - File watch triggers (filesystem events)
 *
 * Integrates with Electron's trigger service for background execution.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  X,
  Plus,
  Search,
  Clock,
  Globe,
  FolderSearch,
  ChevronDown,
  ChevronRight,
  Play,
  Pause,
  Trash2,
  Settings,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  FileText,
  Copy,
  ExternalLink,
} from 'lucide-react'

// ============================================================================
// Types - imported from electron.d.ts
// ============================================================================

import type { TriggerConfig, TriggerState, TriggerType } from '../../../../electron.d'

interface Props {
  onClose?: () => void
}

// ============================================================================
// Trigger Type Metadata
// ============================================================================

const TRIGGER_TYPE_INFO: Record<TriggerType, {
  label: string
  icon: typeof Clock
  color: string
  description: string
}> = {
  manual: {
    label: 'Manual',
    icon: Play,
    color: 'var(--text-secondary)',
    description: 'Run manually',
  },
  schedule: {
    label: 'Schedule',
    icon: Clock,
    color: 'var(--node-blue, #3b82f6)',
    description: 'Cron or interval based',
  },
  webhook: {
    label: 'Webhook',
    icon: Globe,
    color: 'var(--node-emerald, #10b981)',
    description: 'HTTP endpoint trigger',
  },
  'file-watch': {
    label: 'File Watch',
    icon: FolderSearch,
    color: 'var(--node-orange, #f97316)',
    description: 'Filesystem changes',
  },
}

// ============================================================================
// Common cron presets
// ============================================================================

const CRON_PRESETS = [
  { label: 'Every minute', value: '* * * * *' },
  { label: 'Every 5 minutes', value: '*/5 * * * *' },
  { label: 'Every 15 minutes', value: '*/15 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every day at midnight', value: '0 0 * * *' },
  { label: 'Every day at 9am', value: '0 9 * * *' },
  { label: 'Every Monday at 9am', value: '0 9 * * 1' },
  { label: 'First day of month', value: '0 0 1 * *' },
]

// ============================================================================
// Component
// ============================================================================

export function TriggerManagementPanel({ onClose }: Props) {
  const [triggers, setTriggers] = useState<TriggerConfig[]>([])
  const [trayState, setTrayState] = useState<TriggerState | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<TriggerType>>(
    new Set(['schedule', 'webhook', 'file-watch'])
  )
  const [selectedTrigger, setSelectedTrigger] = useState<string | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Check if running in Electron
  const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron

  // Load triggers from Electron
  const loadTriggers = useCallback(async () => {
    if (!isElectron) {
      setIsLoading(false)
      return
    }

    try {
      const result = await window.electronAPI?.trigger?.list()
      if (result?.success) {
        setTriggers(result.triggers || [])
      }

      const state = await window.electronAPI?.trigger?.trayState()
      if (state) setTrayState(state)
    } catch (err) {
      console.error('[TriggerPanel] Failed to load triggers:', err)
    } finally {
      setIsLoading(false)
    }
  }, [isElectron])

  // Initial load and listen for updates
  useEffect(() => {
    loadTriggers()

    if (isElectron && window.electronAPI) {
      // Listen for trigger events
      const unsubStart = window.electronAPI.onTriggerExecutionStart?.(() => {
        loadTriggers()
      })
      const unsubComplete = window.electronAPI.onTriggerExecutionComplete?.(() => {
        loadTriggers()
      })
      const unsubChange = window.electronAPI.onTriggerStatusChange?.(() => {
        loadTriggers()
      })

      return () => {
        unsubStart?.()
        unsubComplete?.()
        unsubChange?.()
      }
    }
  }, [isElectron, loadTriggers])

  // Group triggers by type
  const groupedTriggers = triggers.reduce((acc, trigger) => {
    const type = trigger.triggerType
    if (!acc[type]) acc[type] = []
    acc[type].push(trigger)
    return acc
  }, {} as Record<TriggerType, TriggerConfig[]>)

  // Filter triggers by search
  const filteredGroups = Object.entries(groupedTriggers).filter(([type, items]) => {
    if (!searchQuery) return true
    return items.some(
      (t) =>
        t.workflowName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.workflowPath.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })

  // Toggle group expansion
  const toggleGroup = (type: TriggerType) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  // Add workflow from file picker
  const handleAddWorkflow = async () => {
    if (!isElectron) return

    try {
      const result = await window.electronAPI?.trigger?.addWorkflow()
      if (result?.success && result.triggerConfig) {
        // Open config dialog for the new trigger
        setSelectedTrigger(result.workflowId ?? null)
        setIsAddDialogOpen(true)
      }
      loadTriggers()
    } catch (err) {
      console.error('[TriggerPanel] Failed to add workflow:', err)
    }
  }

  // Toggle trigger enabled state
  const toggleEnabled = async (workflowId: string, enabled: boolean) => {
    if (!isElectron) return

    try {
      await window.electronAPI?.trigger?.setEnabled(workflowId, enabled)
      loadTriggers()
    } catch (err) {
      console.error('[TriggerPanel] Failed to toggle trigger:', err)
    }
  }

  // Remove trigger
  const removeTrigger = async (workflowId: string) => {
    if (!isElectron) return

    try {
      await window.electronAPI?.trigger?.unregister(workflowId)
      loadTriggers()
    } catch (err) {
      console.error('[TriggerPanel] Failed to remove trigger:', err)
    }
  }

  // Run workflow manually
  const runManually = async (workflowId: string) => {
    if (!isElectron) return

    try {
      await window.electronAPI?.trigger?.runManually(workflowId)
      loadTriggers()
    } catch (err) {
      console.error('[TriggerPanel] Failed to run workflow:', err)
    }
  }

  // Copy webhook URL
  const copyWebhookUrl = async (trigger: TriggerConfig) => {
    const port = trayState?.webhookPort || 9876
    const url = `http://localhost:${port}${trigger.webhookPath || `/workflow/${trigger.workflowId}`}`
    await navigator.clipboard.writeText(url)
  }

  // Get status indicator
  const getStatusIndicator = (trigger: TriggerConfig) => {
    if (!trigger.enabled) {
      return <Pause style={{ width: 12, height: 12, color: 'var(--text-muted)' }} />
    }
    if (trigger.lastStatus === 'failed') {
      return <AlertCircle style={{ width: 12, height: 12, color: 'var(--error)' }} />
    }
    return <CheckCircle style={{ width: 12, height: 12, color: 'var(--success)' }} />
  }

  // Format last triggered time
  const formatLastTriggered = (timestamp?: number) => {
    if (!timestamp) return 'Never'
    const diff = Date.now() - timestamp
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return new Date(timestamp).toLocaleDateString()
  }

  if (!isElectron) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          background: 'var(--panel)',
          borderLeft: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <span style={{ fontWeight: 600, fontSize: '14px' }}>Triggers</span>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)',
              }}
            >
              <X style={{ width: 16, height: 16 }} />
            </button>
          )}
        </div>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            textAlign: 'center',
            color: 'var(--text-secondary)',
          }}
        >
          <Clock style={{ width: 48, height: 48, marginBottom: 16, opacity: 0.5 }} />
          <p style={{ marginBottom: 8 }}>
            Background triggers are only available in the desktop app.
          </p>
          <p style={{ fontSize: '12px', opacity: 0.7 }}>
            Download Prompd for Windows, macOS, or Linux to enable scheduled, webhook, and file
            watch triggers.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--panel)',
        borderLeft: '1px solid var(--border)',
        width: '320px',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: '14px' }}>Triggers</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleAddWorkflow}
            style={{
              background: 'var(--accent)',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              padding: '4px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              color: 'white',
              fontSize: '12px',
            }}
          >
            <Plus style={{ width: 14, height: 14 }} />
            Add
          </button>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)',
              }}
            >
              <X style={{ width: 16, height: 16 }} />
            </button>
          )}
        </div>
      </div>

      {/* Status Bar */}
      {trayState && (
        <div
          style={{
            display: 'flex',
            gap: '12px',
            padding: '8px 16px',
            background: 'var(--input-bg)',
            borderBottom: '1px solid var(--border)',
            fontSize: '11px',
            color: 'var(--text-secondary)',
          }}
        >
          <span>
            <Clock style={{ width: 10, height: 10, marginRight: 4, verticalAlign: 'middle' }} />
            {trayState.scheduledTriggers} scheduled
          </span>
          <span>
            <Globe
              style={{
                width: 10,
                height: 10,
                marginRight: 4,
                verticalAlign: 'middle',
                color: trayState.webhookServerRunning ? 'var(--success)' : 'var(--text-muted)',
              }}
            />
            {trayState.webhookServerRunning ? `:${trayState.webhookPort}` : 'Off'}
          </span>
          <span>
            <FolderSearch
              style={{ width: 10, height: 10, marginRight: 4, verticalAlign: 'middle' }}
            />
            {trayState.fileWatchers} watchers
          </span>
        </div>
      )}

      {/* Search */}
      <div style={{ padding: '8px 16px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 10px',
            background: 'var(--input-bg)',
            borderRadius: '6px',
            border: '1px solid var(--border)',
          }}
        >
          <Search style={{ width: 14, height: 14, color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search triggers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              border: 'none',
              background: 'none',
              outline: 'none',
              fontSize: '13px',
              color: 'var(--text)',
            }}
          />
        </div>
      </div>

      {/* Trigger List */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 8px' }}>
        {isLoading ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '32px',
              color: 'var(--text-secondary)',
            }}
          >
            <RefreshCw
              style={{ width: 16, height: 16, marginRight: 8, animation: 'spin 1s linear infinite' }}
            />
            Loading...
          </div>
        ) : triggers.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '32px',
              textAlign: 'center',
              color: 'var(--text-secondary)',
            }}
          >
            <FileText style={{ width: 32, height: 32, marginBottom: 12, opacity: 0.5 }} />
            <p style={{ marginBottom: 8 }}>No triggers configured</p>
            <p style={{ fontSize: '12px', opacity: 0.7 }}>
              Click "Add" to configure a workflow to run automatically.
            </p>
          </div>
        ) : (
          Object.entries(TRIGGER_TYPE_INFO)
            .filter(([type]) => type !== 'manual')
            .map(([type, info]) => {
              const typeTriggers = groupedTriggers[type as TriggerType] || []
              if (typeTriggers.length === 0) return null

              const isExpanded = expandedGroups.has(type as TriggerType)
              const Icon = info.icon

              return (
                <div key={type} style={{ marginBottom: '8px' }}>
                  {/* Group Header */}
                  <button
                    onClick={() => toggleGroup(type as TriggerType)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      width: '100%',
                      padding: '8px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text)',
                      fontSize: '12px',
                      fontWeight: 600,
                      borderRadius: '4px',
                    }}
                  >
                    {isExpanded ? (
                      <ChevronDown style={{ width: 14, height: 14 }} />
                    ) : (
                      <ChevronRight style={{ width: 14, height: 14 }} />
                    )}
                    <Icon style={{ width: 14, height: 14, color: info.color }} />
                    {info.label}
                    <span
                      style={{
                        marginLeft: 'auto',
                        fontSize: '10px',
                        color: 'var(--text-muted)',
                        background: 'var(--input-bg)',
                        padding: '2px 6px',
                        borderRadius: '10px',
                      }}
                    >
                      {typeTriggers.length}
                    </span>
                  </button>

                  {/* Trigger Items */}
                  {isExpanded && (
                    <div style={{ paddingLeft: '16px' }}>
                      {typeTriggers.map((trigger) => (
                        <div
                          key={trigger.workflowId}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            padding: '8px',
                            marginBottom: '4px',
                            background: 'var(--input-bg)',
                            borderRadius: '6px',
                            border: '1px solid var(--border)',
                          }}
                        >
                          {/* Trigger Header */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              marginBottom: '4px',
                            }}
                          >
                            {getStatusIndicator(trigger)}
                            <span
                              style={{
                                flex: 1,
                                fontSize: '12px',
                                fontWeight: 500,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {trigger.workflowName || trigger.workflowId}
                            </span>
                          </div>

                          {/* Trigger Details */}
                          <div
                            style={{
                              fontSize: '11px',
                              color: 'var(--text-secondary)',
                              marginBottom: '8px',
                            }}
                          >
                            {type === 'schedule' && (
                              <span>
                                {trigger.scheduleType === 'cron'
                                  ? trigger.scheduleCron
                                  : `Every ${Math.round((trigger.scheduleIntervalMs || 0) / 60000)} min`}
                              </span>
                            )}
                            {type === 'webhook' && trigger.webhookPath && (
                              <span style={{ fontFamily: 'monospace' }}>{trigger.webhookPath}</span>
                            )}
                            {type === 'file-watch' && (
                              <span>
                                {trigger.fileWatchPaths?.length || 0} path(s)
                              </span>
                            )}
                            <span style={{ marginLeft: '8px', opacity: 0.7 }}>
                              Last: {formatLastTriggered(trigger.lastTriggered)}
                            </span>
                          </div>

                          {/* Actions */}
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              onClick={() => runManually(trigger.workflowId)}
                              title="Run now"
                              style={{
                                background: 'var(--button-bg)',
                                border: '1px solid var(--border)',
                                borderRadius: '4px',
                                padding: '4px 8px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '11px',
                                color: 'var(--text)',
                              }}
                            >
                              <Play style={{ width: 10, height: 10 }} />
                              Run
                            </button>

                            <button
                              onClick={() => toggleEnabled(trigger.workflowId, !trigger.enabled)}
                              title={trigger.enabled ? 'Pause' : 'Resume'}
                              style={{
                                background: 'var(--button-bg)',
                                border: '1px solid var(--border)',
                                borderRadius: '4px',
                                padding: '4px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                color: 'var(--text)',
                              }}
                            >
                              {trigger.enabled ? (
                                <Pause style={{ width: 12, height: 12 }} />
                              ) : (
                                <Play style={{ width: 12, height: 12 }} />
                              )}
                            </button>

                            {type === 'webhook' && (
                              <button
                                onClick={() => copyWebhookUrl(trigger)}
                                title="Copy webhook URL"
                                style={{
                                  background: 'var(--button-bg)',
                                  border: '1px solid var(--border)',
                                  borderRadius: '4px',
                                  padding: '4px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  color: 'var(--text)',
                                }}
                              >
                                <Copy style={{ width: 12, height: 12 }} />
                              </button>
                            )}

                            <button
                              onClick={() => setSelectedTrigger(trigger.workflowId)}
                              title="Settings"
                              style={{
                                background: 'var(--button-bg)',
                                border: '1px solid var(--border)',
                                borderRadius: '4px',
                                padding: '4px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                color: 'var(--text)',
                              }}
                            >
                              <Settings style={{ width: 12, height: 12 }} />
                            </button>

                            <button
                              onClick={() => removeTrigger(trigger.workflowId)}
                              title="Remove"
                              style={{
                                background: 'var(--button-bg)',
                                border: '1px solid var(--border)',
                                borderRadius: '4px',
                                padding: '4px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                color: 'var(--error)',
                                marginLeft: 'auto',
                              }}
                            >
                              <Trash2 style={{ width: 12, height: 12 }} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
        )}
      </div>

      {/* Next Scheduled Run */}
      {trayState?.nextScheduledRun && (
        <div
          style={{
            padding: '8px 16px',
            borderTop: '1px solid var(--border)',
            fontSize: '11px',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Clock style={{ width: 12, height: 12 }} />
          Next run: {new Date(trayState.nextScheduledRun).toLocaleString()}
        </div>
      )}
    </div>
  )
}


/**
 * TriggerConfigDialog - Dialog for configuring workflow trigger settings
 *
 * Allows users to configure:
 * - Schedule triggers (cron expressions, intervals)
 * - Webhook triggers (path, secret, methods)
 * - File watch triggers (paths, events, debounce)
 */

import { useState, useEffect } from 'react'
import {
  X,
  Clock,
  Globe,
  FolderSearch,
  Plus,
  Trash2,
  AlertCircle,
  Info,
  Copy,
  Eye,
  EyeOff,
  Play,
  Zap,
} from 'lucide-react'
import { CronInput } from '../CronInput'

// ============================================================================
// Types
// ============================================================================

type TriggerType = 'manual' | 'schedule' | 'webhook' | 'file-watch' | 'event'

interface TriggerConfig {
  workflowId: string
  workflowPath: string
  workflowName?: string
  enabled: boolean
  triggerType: TriggerType
  // Schedule
  scheduleType?: 'cron' | 'interval'
  scheduleCron?: string
  scheduleIntervalMs?: number
  scheduleTimezone?: string
  // Webhook
  webhookPath?: string
  webhookSecret?: string
  webhookMethods?: string[]
  // File watch
  fileWatchPaths?: string[]
  fileWatchEvents?: ('create' | 'modify' | 'delete')[]
  fileWatchDebounceMs?: number
  // Event
  eventName?: string
  eventFilter?: string
}

interface Props {
  workflowId: string
  workflowPath: string
  workflowName?: string
  initialConfig?: Partial<TriggerConfig>
  onSave: (config: TriggerConfig) => void
  onCancel: () => void
}

// ============================================================================
// Cron Presets
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

const INTERVAL_PRESETS = [
  { label: '1 minute', value: 60000 },
  { label: '5 minutes', value: 300000 },
  { label: '15 minutes', value: 900000 },
  { label: '30 minutes', value: 1800000 },
  { label: '1 hour', value: 3600000 },
  { label: '4 hours', value: 14400000 },
  { label: '12 hours', value: 43200000 },
  { label: '24 hours', value: 86400000 },
]

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

const FILE_EVENTS = [
  { value: 'create' as const, label: 'Create', description: 'New file created' },
  { value: 'modify' as const, label: 'Modify', description: 'File modified' },
  { value: 'delete' as const, label: 'Delete', description: 'File deleted' },
]

// ============================================================================
// Component
// ============================================================================

export function TriggerConfigDialog({
  workflowId,
  workflowPath,
  workflowName,
  initialConfig,
  onSave,
  onCancel,
}: Props) {
  const [triggerType, setTriggerType] = useState<TriggerType>(
    initialConfig?.triggerType || 'schedule'
  )
  const [enabled, setEnabled] = useState(initialConfig?.enabled ?? true)

  // Schedule state
  const [scheduleType, setScheduleType] = useState<'cron' | 'interval'>(
    initialConfig?.scheduleType || 'cron'
  )
  const [cronExpression, setCronExpression] = useState(initialConfig?.scheduleCron || '0 * * * *')
  const [intervalMs, setIntervalMs] = useState(initialConfig?.scheduleIntervalMs || 3600000)
  const [timezone, setTimezone] = useState(
    initialConfig?.scheduleTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  )

  // Webhook state
  const [webhookPath, setWebhookPath] = useState(
    initialConfig?.webhookPath || `/workflow/${workflowId}`
  )
  const [webhookSecret, setWebhookSecret] = useState(initialConfig?.webhookSecret || '')
  const [webhookMethods, setWebhookMethods] = useState<string[]>(
    initialConfig?.webhookMethods || ['POST']
  )
  const [showSecret, setShowSecret] = useState(false)

  // File watch state
  const [fileWatchPaths, setFileWatchPaths] = useState<string[]>(
    initialConfig?.fileWatchPaths || []
  )
  const [fileWatchEvents, setFileWatchEvents] = useState<('create' | 'modify' | 'delete')[]>(
    initialConfig?.fileWatchEvents || ['create', 'modify', 'delete']
  )
  const [fileWatchDebounceMs, setFileWatchDebounceMs] = useState(
    initialConfig?.fileWatchDebounceMs || 500
  )
  const [newWatchPath, setNewWatchPath] = useState('')

  // Event state
  const [eventName, setEventName] = useState(initialConfig?.eventName || '')
  const [eventFilter, setEventFilter] = useState(initialConfig?.eventFilter || '')

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (triggerType === 'schedule') {
      if (scheduleType === 'cron' && !cronExpression) {
        newErrors.cron = 'Cron expression is required'
      }
      if (scheduleType === 'interval' && (!intervalMs || intervalMs < 1000)) {
        newErrors.interval = 'Interval must be at least 1 second'
      }
    }

    if (triggerType === 'webhook') {
      if (!webhookPath) {
        newErrors.webhookPath = 'Webhook path is required'
      } else if (!webhookPath.startsWith('/')) {
        newErrors.webhookPath = 'Path must start with /'
      }
      if (webhookMethods.length === 0) {
        newErrors.webhookMethods = 'At least one HTTP method is required'
      }
    }

    if (triggerType === 'file-watch') {
      if (fileWatchPaths.length === 0) {
        newErrors.fileWatchPaths = 'At least one watch path is required'
      }
      if (fileWatchEvents.length === 0) {
        newErrors.fileWatchEvents = 'At least one event type is required'
      }
    }

    if (triggerType === 'event') {
      if (!eventName) {
        newErrors.eventName = 'Event name is required'
      }
    }

    // Manual type has no required fields

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = () => {
    if (!validate()) return

    const config: TriggerConfig = {
      workflowId,
      workflowPath,
      workflowName,
      enabled,
      triggerType,
    }

    if (triggerType === 'schedule') {
      config.scheduleType = scheduleType
      if (scheduleType === 'cron') {
        config.scheduleCron = cronExpression
      } else {
        config.scheduleIntervalMs = intervalMs
      }
      config.scheduleTimezone = timezone
    }

    if (triggerType === 'webhook') {
      config.webhookPath = webhookPath
      config.webhookSecret = webhookSecret
      config.webhookMethods = webhookMethods
    }

    if (triggerType === 'file-watch') {
      config.fileWatchPaths = fileWatchPaths
      config.fileWatchEvents = fileWatchEvents
      config.fileWatchDebounceMs = fileWatchDebounceMs
    }

    if (triggerType === 'event') {
      config.eventName = eventName
      config.eventFilter = eventFilter
    }

    // Manual type has no additional config

    onSave(config)
  }

  const addWatchPath = () => {
    if (newWatchPath && !fileWatchPaths.includes(newWatchPath)) {
      setFileWatchPaths([...fileWatchPaths, newWatchPath])
      setNewWatchPath('')
    }
  }

  const removeWatchPath = (path: string) => {
    setFileWatchPaths(fileWatchPaths.filter((p) => p !== path))
  }

  const toggleMethod = (method: string) => {
    if (webhookMethods.includes(method)) {
      setWebhookMethods(webhookMethods.filter((m) => m !== method))
    } else {
      setWebhookMethods([...webhookMethods, method])
    }
  }

  const toggleEvent = (event: 'create' | 'modify' | 'delete') => {
    if (fileWatchEvents.includes(event)) {
      setFileWatchEvents(fileWatchEvents.filter((e) => e !== event))
    } else {
      setFileWatchEvents([...fileWatchEvents, event])
    }
  }

  const generateSecret = () => {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    setWebhookSecret(Array.from(array, (b) => b.toString(16).padStart(2, '0')).join(''))
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: 'var(--panel)',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          width: '480px',
          maxHeight: '80vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Configure Trigger</h2>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
              {workflowName || workflowId}
            </p>
          </div>
          <button
            onClick={onCancel}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              color: 'var(--text-secondary)',
            }}
          >
            <X style={{ width: 20, height: 20 }} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          {/* Trigger Type Selection */}
          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 500,
                marginBottom: '8px',
                color: 'var(--text-secondary)',
              }}
            >
              Trigger Type
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {[
                { type: 'manual' as const, icon: Play, label: 'Manual' },
                { type: 'schedule' as const, icon: Clock, label: 'Schedule' },
                { type: 'webhook' as const, icon: Globe, label: 'Webhook' },
                { type: 'file-watch' as const, icon: FolderSearch, label: 'File Watch' },
                { type: 'event' as const, icon: Zap, label: 'Event' },
              ].map(({ type, icon: Icon, label }) => (
                <button
                  key={type}
                  onClick={() => setTriggerType(type)}
                  style={{
                    flex: '1 1 calc(33% - 8px)',
                    minWidth: '100px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '12px',
                    background: triggerType === type ? 'var(--accent)' : 'var(--input-bg)',
                    border: `1px solid ${triggerType === type ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    color: triggerType === type ? 'white' : 'var(--text)',
                  }}
                >
                  <Icon style={{ width: 20, height: 20 }} />
                  <span style={{ fontSize: '12px', fontWeight: 500 }}>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Manual Trigger - No configuration needed */}
          {triggerType === 'manual' && (
            <div style={{
              padding: '16px',
              background: 'var(--input-bg)',
              borderRadius: '8px',
              textAlign: 'center',
              color: 'var(--text-secondary)',
              fontSize: '13px',
            }}>
              <Play style={{ width: 24, height: 24, color: 'var(--success)', margin: '0 auto 8px' }} />
              <p style={{ margin: 0 }}>
                Manual triggers start the workflow when you click the Run button.
                No additional configuration needed.
              </p>
            </div>
          )}

          {/* Schedule Configuration */}
          {triggerType === 'schedule' && (
            <div>
              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 500,
                    marginBottom: '8px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Schedule Type
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setScheduleType('cron')}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      background: scheduleType === 'cron' ? 'var(--accent)' : 'var(--input-bg)',
                      border: `1px solid ${scheduleType === 'cron' ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      color: scheduleType === 'cron' ? 'white' : 'var(--text)',
                      fontSize: '13px',
                    }}
                  >
                    Cron Expression
                  </button>
                  <button
                    onClick={() => setScheduleType('interval')}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      background: scheduleType === 'interval' ? 'var(--accent)' : 'var(--input-bg)',
                      border: `1px solid ${scheduleType === 'interval' ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      color: scheduleType === 'interval' ? 'white' : 'var(--text)',
                      fontSize: '13px',
                    }}
                  >
                    Interval
                  </button>
                </div>
              </div>

              {scheduleType === 'cron' ? (
                <div style={{ marginBottom: '16px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 500,
                      marginBottom: '8px',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Cron Expression
                  </label>
                  <CronInput
                    value={cronExpression}
                    onChange={setCronExpression}
                    showMessage={true}
                    error={!!errors.cron}
                  />
                  {errors.cron && (
                    <p style={{ color: 'var(--error)', fontSize: '11px', margin: '4px 0' }}>
                      {errors.cron}
                    </p>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '12px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--muted)', marginRight: '4px', alignSelf: 'center' }}>
                      Quick presets:
                    </span>
                    {CRON_PRESETS.map((preset) => (
                      <button
                        key={preset.value}
                        onClick={() => setCronExpression(preset.value)}
                        style={{
                          padding: '4px 8px',
                          background:
                            cronExpression === preset.value ? 'var(--accent)' : 'var(--input-bg)',
                          border: '1px solid var(--border)',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '11px',
                          color: cronExpression === preset.value ? 'white' : 'var(--text)',
                        }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: '16px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 500,
                      marginBottom: '8px',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Interval
                  </label>
                  <select
                    value={intervalMs}
                    onChange={(e) => setIntervalMs(parseInt(e.target.value, 10))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: 'var(--input-bg)',
                      border: `1px solid ${errors.interval ? 'var(--error)' : 'var(--border)'}`,
                      borderRadius: '6px',
                      fontSize: '13px',
                      color: 'var(--text)',
                    }}
                  >
                    {INTERVAL_PRESETS.map((preset) => (
                      <option key={preset.value} value={preset.value}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                  {errors.interval && (
                    <p style={{ color: 'var(--error)', fontSize: '11px', margin: '4px 0' }}>
                      {errors.interval}
                    </p>
                  )}
                </div>
              )}

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 500,
                    marginBottom: '8px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Timezone
                </label>
                <input
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    fontSize: '13px',
                    color: 'var(--text)',
                  }}
                />
              </div>
            </div>
          )}

          {/* Webhook Configuration */}
          {triggerType === 'webhook' && (
            <div>
              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 500,
                    marginBottom: '8px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Webhook Path
                </label>
                <input
                  type="text"
                  value={webhookPath}
                  onChange={(e) => setWebhookPath(e.target.value)}
                  placeholder="/my-workflow"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'var(--input-bg)',
                    border: `1px solid ${errors.webhookPath ? 'var(--error)' : 'var(--border)'}`,
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    color: 'var(--text)',
                  }}
                />
                {errors.webhookPath && (
                  <p style={{ color: 'var(--error)', fontSize: '11px', margin: '4px 0' }}>
                    {errors.webhookPath}
                  </p>
                )}
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 500,
                    marginBottom: '8px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  HMAC Secret (Optional)
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <input
                      type={showSecret ? 'text' : 'password'}
                      value={webhookSecret}
                      onChange={(e) => setWebhookSecret(e.target.value)}
                      placeholder="Leave empty to disable signature validation"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        paddingRight: '36px',
                        background: 'var(--input-bg)',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontFamily: 'monospace',
                        color: 'var(--text)',
                      }}
                    />
                    <button
                      onClick={() => setShowSecret(!showSecret)}
                      style={{
                        position: 'absolute',
                        right: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)',
                        padding: '4px',
                      }}
                    >
                      {showSecret ? (
                        <EyeOff style={{ width: 14, height: 14 }} />
                      ) : (
                        <Eye style={{ width: 14, height: 14 }} />
                      )}
                    </button>
                  </div>
                  <button
                    onClick={generateSecret}
                    style={{
                      padding: '8px 12px',
                      background: 'var(--input-bg)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: 'var(--text)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Generate
                  </button>
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 500,
                    marginBottom: '8px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  HTTP Methods
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {HTTP_METHODS.map((method) => (
                    <button
                      key={method}
                      onClick={() => toggleMethod(method)}
                      style={{
                        padding: '6px 12px',
                        background: webhookMethods.includes(method)
                          ? 'var(--accent)'
                          : 'var(--input-bg)',
                        border: `1px solid ${webhookMethods.includes(method) ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        color: webhookMethods.includes(method) ? 'white' : 'var(--text)',
                      }}
                    >
                      {method}
                    </button>
                  ))}
                </div>
                {errors.webhookMethods && (
                  <p style={{ color: 'var(--error)', fontSize: '11px', margin: '4px 0' }}>
                    {errors.webhookMethods}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* File Watch Configuration */}
          {triggerType === 'file-watch' && (
            <div>
              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 500,
                    marginBottom: '8px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Watch Paths (glob patterns supported)
                </label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    value={newWatchPath}
                    onChange={(e) => setNewWatchPath(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addWatchPath()}
                    placeholder="/path/to/watch or **/*.json"
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      background: 'var(--input-bg)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontFamily: 'monospace',
                      color: 'var(--text)',
                    }}
                  />
                  <button
                    onClick={addWatchPath}
                    style={{
                      padding: '8px 12px',
                      background: 'var(--accent)',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      color: 'white',
                    }}
                  >
                    <Plus style={{ width: 16, height: 16 }} />
                  </button>
                </div>
                {fileWatchPaths.length > 0 ? (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      maxHeight: '120px',
                      overflow: 'auto',
                    }}
                  >
                    {fileWatchPaths.map((path, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '6px 8px',
                          background: 'var(--input-bg)',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontFamily: 'monospace',
                        }}
                      >
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {path}
                        </span>
                        <button
                          onClick={() => removeWatchPath(path)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--error)',
                            padding: '2px',
                          }}
                        >
                          <Trash2 style={{ width: 12, height: 12 }} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: '8px 0' }}>
                    No paths added yet
                  </p>
                )}
                {errors.fileWatchPaths && (
                  <p style={{ color: 'var(--error)', fontSize: '11px', margin: '4px 0' }}>
                    {errors.fileWatchPaths}
                  </p>
                )}
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 500,
                    marginBottom: '8px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Events to Watch
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {FILE_EVENTS.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => toggleEvent(value)}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        background: fileWatchEvents.includes(value)
                          ? 'var(--accent)'
                          : 'var(--input-bg)',
                        border: `1px solid ${fileWatchEvents.includes(value) ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        color: fileWatchEvents.includes(value) ? 'white' : 'var(--text)',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {errors.fileWatchEvents && (
                  <p style={{ color: 'var(--error)', fontSize: '11px', margin: '4px 0' }}>
                    {errors.fileWatchEvents}
                  </p>
                )}
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 500,
                    marginBottom: '8px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Debounce (ms)
                </label>
                <input
                  type="number"
                  value={fileWatchDebounceMs}
                  onChange={(e) => setFileWatchDebounceMs(parseInt(e.target.value, 10) || 500)}
                  min={100}
                  max={10000}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    fontSize: '13px',
                    color: 'var(--text)',
                  }}
                />
                <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '4px' }}>
                  Wait time before triggering after file changes
                </p>
              </div>
            </div>
          )}

          {/* Event Trigger Configuration */}
          {triggerType === 'event' && (
            <div>
              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 500,
                    marginBottom: '8px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Event Name
                </label>
                <input
                  type="text"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  placeholder="my-custom-event"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'var(--input-bg)',
                    border: `1px solid ${errors.eventName ? 'var(--error)' : 'var(--border)'}`,
                    borderRadius: '6px',
                    fontSize: '13px',
                    color: 'var(--text)',
                  }}
                />
                {errors.eventName && (
                  <p style={{ color: 'var(--error)', fontSize: '11px', margin: '4px 0' }}>
                    {errors.eventName}
                  </p>
                )}
                <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '4px' }}>
                  The event name to listen for from other workflows or external sources
                </p>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 500,
                    marginBottom: '8px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Event Filter (Optional)
                </label>
                <input
                  type="text"
                  value={eventFilter}
                  onChange={(e) => setEventFilter(e.target.value)}
                  placeholder="{{ event.type == 'important' }}"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'var(--input-bg)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    color: 'var(--text)',
                  }}
                />
                <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '4px' }}>
                  Only trigger when this expression evaluates to true
                </p>
              </div>

              <div style={{
                padding: '12px',
                background: 'var(--input-bg)',
                borderRadius: '6px',
                fontSize: '12px',
                color: 'var(--text-secondary)',
              }}>
                <strong style={{ color: 'var(--text)' }}>Event triggers</strong> are activated by:
                <ul style={{ margin: '8px 0 0', paddingLeft: '20px' }}>
                  <li>Other workflows emitting events</li>
                  <li>API calls to the event endpoint</li>
                  <li>Internal application events</li>
                </ul>
              </div>
            </div>
          )}

          {/* Enabled Toggle */}
          <div
            style={{
              marginTop: '20px',
              paddingTop: '16px',
              borderTop: '1px solid var(--border)',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                style={{ width: '16px', height: '16px' }}
              />
              <span style={{ fontSize: '13px' }}>Enable trigger immediately</span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
            padding: '16px 20px',
            borderTop: '1px solid var(--border)',
          }}
        >
          <button
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              background: 'var(--input-bg)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              color: 'var(--text)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '8px 16px',
              background: 'var(--accent)',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              color: 'white',
              fontWeight: 500,
            }}
          >
            Save Trigger
          </button>
        </div>
      </div>
    </div>
  )
}

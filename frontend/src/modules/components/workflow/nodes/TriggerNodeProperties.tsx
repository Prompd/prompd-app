/**
 * TriggerNodeProperties - Property editor for Trigger nodes
 */

import { useState } from 'react'
import { Play, Edit, Plus, Trash2, Eye, EyeOff } from 'lucide-react'
import type { TriggerNodeData } from '../../../services/workflowTypes'
import { labelStyle, inputStyle, selectStyle } from '../shared/styles/propertyStyles'
import { CronEditorDialog } from '../CronEditorDialog'

export interface TriggerNodePropertiesProps {
  data: TriggerNodeData
  onChange: (field: string, value: unknown) => void
  nodeId?: string
}

export function TriggerNodeProperties({ data, onChange }: TriggerNodePropertiesProps) {
  const [showSecret, setShowSecret] = useState(false)
  const [newWatchPath, setNewWatchPath] = useState('')
  const [showCronEditor, setShowCronEditor] = useState(false)

  const triggerType = data.triggerType || 'manual'

  // Cron presets
  const cronPresets = [
    { label: 'Every minute', value: '* * * * *' },
    { label: 'Every 5 min', value: '*/5 * * * *' },
    { label: 'Every hour', value: '0 * * * *' },
    { label: 'Daily 9am', value: '0 9 * * *' },
    { label: 'Weekly Mon', value: '0 9 * * 1' },
  ]

  // Interval presets
  const intervalPresets = [
    { label: '1 min', value: 60000 },
    { label: '5 min', value: 300000 },
    { label: '15 min', value: 900000 },
    { label: '1 hour', value: 3600000 },
    { label: '24 hours', value: 86400000 },
  ]

  const generateSecret = () => {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    onChange('webhookSecret', Array.from(array, (b) => b.toString(16).padStart(2, '0')).join(''))
  }

  const addWatchPath = () => {
    if (newWatchPath && !(data.fileWatchPaths || []).includes(newWatchPath)) {
      onChange('fileWatchPaths', [...(data.fileWatchPaths || []), newWatchPath])
      setNewWatchPath('')
    }
  }

  const removeWatchPath = (path: string) => {
    onChange('fileWatchPaths', (data.fileWatchPaths || []).filter((p) => p !== path))
  }

  const toggleMethod = (method: 'GET' | 'POST' | 'PUT') => {
    const methods = data.webhookMethods || ['POST']
    if (methods.includes(method)) {
      onChange('webhookMethods', methods.filter((m) => m !== method))
    } else {
      onChange('webhookMethods', [...methods, method])
    }
  }

  const toggleFileEvent = (event: 'create' | 'modify' | 'delete') => {
    const events = data.fileWatchEvents || ['create', 'modify', 'delete']
    if (events.includes(event)) {
      onChange('fileWatchEvents', events.filter((e) => e !== event))
    } else {
      onChange('fileWatchEvents', [...events, event])
    }
  }

  return (
    <>
      {/* Trigger Type Selection */}
      <div>
        <label style={labelStyle}>Trigger Type</label>
        <select
          value={triggerType}
          onChange={(e) => onChange('triggerType', e.target.value)}
          style={selectStyle}
        >
          <option value="manual">Manual (Run button)</option>
          <option value="schedule">Schedule (Cron/Interval)</option>
          <option value="webhook">Webhook (HTTP endpoint)</option>
          <option value="file-watch">File Watch (Electron only)</option>
          <option value="event">Event (Internal trigger)</option>
        </select>
      </div>

      {/* Manual Trigger - No additional configuration needed */}
      {triggerType === 'manual' && (
        <div style={{
          padding: '12px',
          background: 'var(--panel-2)',
          borderRadius: '6px',
          fontSize: '12px',
          color: 'var(--text-secondary)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Play style={{ width: 16, height: 16, color: 'var(--node-green)' }} />
            <strong style={{ color: 'var(--text)' }}>Manual Trigger</strong>
          </div>
          <p style={{ margin: 0 }}>
            This workflow starts when you click the Run button. No additional configuration needed.
          </p>
        </div>
      )}

      {/* Schedule Trigger Configuration */}
      {triggerType === 'schedule' && (
        <>
          <div>
            <label style={labelStyle}>Schedule Type</label>
            <select
              value={data.scheduleType || 'cron'}
              onChange={(e) => onChange('scheduleType', e.target.value)}
              style={selectStyle}
            >
              <option value="cron">Cron Expression</option>
              <option value="interval">Fixed Interval</option>
            </select>
          </div>

          {data.scheduleType === 'cron' || !data.scheduleType ? (
            <div>
              <label style={labelStyle}>Cron Expression</label>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  background: 'var(--panel-2)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                  fontSize: '13px',
                }}
              >
                <span style={{ flex: 1, color: 'var(--text)' }}>
                  {data.scheduleCron || '0 * * * *'}
                </span>
                <button
                  onClick={() => setShowCronEditor(true)}
                  style={{
                    padding: '4px 10px',
                    background: 'var(--accent)',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 500,
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Edit style={{ width: 12, height: 12 }} />
                  Change
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
                <span style={{ fontSize: '10px', color: 'var(--muted)', marginRight: '4px', alignSelf: 'center' }}>
                  Quick:
                </span>
                {cronPresets.map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => onChange('scheduleCron', preset.value)}
                    style={{
                      padding: '4px 8px',
                      background: data.scheduleCron === preset.value ? 'var(--accent)' : 'var(--input-bg)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '10px',
                      color: data.scheduleCron === preset.value ? 'white' : 'var(--text)',
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Cron Editor Dialog */}
              {showCronEditor && (
                <CronEditorDialog
                  value={data.scheduleCron || '0 * * * *'}
                  onSave={(value) => onChange('scheduleCron', value)}
                  onClose={() => setShowCronEditor(false)}
                />
              )}
            </div>
          ) : (
            <div>
              <label style={labelStyle}>Interval</label>
              <select
                value={data.scheduleIntervalMs || 3600000}
                onChange={(e) => onChange('scheduleIntervalMs', parseInt(e.target.value, 10))}
                style={selectStyle}
              >
                {intervalPresets.map((preset) => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label style={labelStyle}>Timezone</label>
            <input
              type="text"
              value={data.scheduleTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone}
              onChange={(e) => onChange('scheduleTimezone', e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              id="scheduleEnabled"
              checked={data.scheduleEnabled !== false}
              onChange={(e) => onChange('scheduleEnabled', e.target.checked)}
              style={{ width: '16px', height: '16px' }}
            />
            <label htmlFor="scheduleEnabled" style={{ fontSize: '12px', color: 'var(--text)' }}>
              Enable schedule
            </label>
          </div>
        </>
      )}

      {/* Webhook Trigger Configuration */}
      {triggerType === 'webhook' && (
        <>
          <div>
            <label style={labelStyle}>Webhook Path</label>
            <input
              type="text"
              value={data.webhookPath || '/my-workflow'}
              onChange={(e) => onChange('webhookPath', e.target.value)}
              placeholder="/my-workflow"
              style={{ ...inputStyle, fontFamily: 'monospace' }}
            />
            <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
              Full URL: POST http://localhost:9876{data.webhookPath || '/my-workflow'}
            </p>
          </div>

          <div>
            <label style={labelStyle}>HTTP Methods</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['GET', 'POST', 'PUT'] as const).map((method) => (
                <button
                  key={method}
                  onClick={() => toggleMethod(method)}
                  style={{
                    padding: '6px 12px',
                    background: (data.webhookMethods || ['POST']).includes(method) ? 'var(--accent)' : 'var(--input-bg)',
                    border: `1px solid ${(data.webhookMethods || ['POST']).includes(method) ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    color: (data.webhookMethods || ['POST']).includes(method) ? 'white' : 'var(--text)',
                  }}
                >
                  {method}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>HMAC Secret (Optional)</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={data.webhookSecret || ''}
                  onChange={(e) => onChange('webhookSecret', e.target.value)}
                  placeholder="Leave empty to disable validation"
                  style={{ ...inputStyle, paddingRight: '36px', fontFamily: 'monospace', fontSize: '11px' }}
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
                  {showSecret ? <EyeOff style={{ width: 14, height: 14 }} /> : <Eye style={{ width: 14, height: 14 }} />}
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
                  fontSize: '11px',
                  color: 'var(--text)',
                }}
              >
                Generate
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              id="webhookRequireAuth"
              checked={data.webhookRequireAuth || false}
              onChange={(e) => onChange('webhookRequireAuth', e.target.checked)}
              style={{ width: '16px', height: '16px' }}
            />
            <label htmlFor="webhookRequireAuth" style={{ fontSize: '12px', color: 'var(--text)' }}>
              Require authentication
            </label>
          </div>
        </>
      )}

      {/* File Watch Trigger Configuration */}
      {triggerType === 'file-watch' && (
        <>
          <div>
            <label style={labelStyle}>Watch Paths (glob patterns supported)</label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input
                type="text"
                value={newWatchPath}
                onChange={(e) => setNewWatchPath(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addWatchPath()}
                placeholder="/path/to/watch or **/*.json"
                style={{ ...inputStyle, flex: 1, fontFamily: 'monospace', fontSize: '12px' }}
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
            {(data.fileWatchPaths || []).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '100px', overflowY: 'auto' }}>
                {(data.fileWatchPaths || []).map((path, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 8px',
                      background: 'var(--input-bg)',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                    }}
                  >
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{path}</span>
                    <button
                      onClick={() => removeWatchPath(path)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', padding: '2px' }}
                    >
                      <Trash2 style={{ width: 12, height: 12 }} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--muted)', fontSize: '11px', margin: '8px 0' }}>No paths added</p>
            )}
          </div>

          <div>
            <label style={labelStyle}>Events to Watch</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['create', 'modify', 'delete'] as const).map((event) => (
                <button
                  key={event}
                  onClick={() => toggleFileEvent(event)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    background: (data.fileWatchEvents || ['create', 'modify', 'delete']).includes(event) ? 'var(--accent)' : 'var(--input-bg)',
                    border: `1px solid ${(data.fileWatchEvents || ['create', 'modify', 'delete']).includes(event) ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    color: (data.fileWatchEvents || ['create', 'modify', 'delete']).includes(event) ? 'white' : 'var(--text)',
                    textTransform: 'capitalize',
                  }}
                >
                  {event}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Debounce (ms)</label>
            <input
              type="number"
              value={data.fileWatchDebounceMs || 500}
              onChange={(e) => onChange('fileWatchDebounceMs', parseInt(e.target.value, 10) || 500)}
              min={100}
              max={10000}
              style={inputStyle}
            />
            <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
              Wait time before triggering after file changes
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              id="fileWatchRecursive"
              checked={data.fileWatchRecursive !== false}
              onChange={(e) => onChange('fileWatchRecursive', e.target.checked)}
              style={{ width: '16px', height: '16px' }}
            />
            <label htmlFor="fileWatchRecursive" style={{ fontSize: '12px', color: 'var(--text)' }}>
              Watch subdirectories recursively
            </label>
          </div>

          <div style={{
            padding: '10px',
            background: 'color-mix(in srgb, var(--warning) 10%, transparent)',
            borderRadius: '6px',
            border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)',
            fontSize: '11px',
            color: 'var(--warning)',
          }}>
            File watch triggers require Electron desktop app
          </div>
        </>
      )}

      {/* Event Trigger Configuration */}
      {triggerType === 'event' && (
        <>
          <div>
            <label style={labelStyle}>Event Name</label>
            <input
              type="text"
              value={data.eventName || ''}
              onChange={(e) => onChange('eventName', e.target.value)}
              placeholder="my-custom-event"
              style={inputStyle}
            />
            <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
              The event name to listen for from other workflows or external sources
            </p>
          </div>

          <div>
            <label style={labelStyle}>Event Filter (Optional)</label>
            <input
              type="text"
              value={data.eventFilter || ''}
              onChange={(e) => onChange('eventFilter', e.target.value)}
              placeholder="{{ event.type == 'important' }}"
              style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '12px' }}
            />
            <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
              Only trigger when this expression evaluates to true
            </p>
          </div>

          <div style={{
            padding: '12px',
            background: 'var(--panel-2)',
            borderRadius: '6px',
            fontSize: '11px',
            color: 'var(--text-secondary)',
          }}>
            <strong style={{ color: 'var(--text)' }}>Event triggers</strong> are activated by:
            <ul style={{ margin: '8px 0 0', paddingLeft: '16px' }}>
              <li>Other workflows emitting events</li>
              <li>API calls to the event endpoint</li>
              <li>Internal application events</li>
            </ul>
          </div>
        </>
      )}

      {/* Description */}
      <div>
        <label style={labelStyle}>Description</label>
        <input
          type="text"
          value={data.description || ''}
          onChange={(e) => onChange('description', e.target.value)}
          placeholder="When/how this workflow runs"
          style={inputStyle}
        />
      </div>
    </>
  )
}

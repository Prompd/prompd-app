import { useState, useEffect } from 'react'
import { Clock, Plus, Trash2, Edit2, Play, Pause } from 'lucide-react'
import { ScheduleDialog } from '../scheduler/ScheduleDialog'
import type { ScheduleInfo } from '../../../electron'

type Schedule = ScheduleInfo

interface ScheduleSettingsProps {
  colors: {
    bgPrimary: string
    bgSecondary: string
    border: string
    text: string
    textSecondary: string
    primary: string
  }
}

export function ScheduleSettings({ colors }: ScheduleSettingsProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [showDialog, setShowDialog] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isElectron = !!(window as any).electronAPI?.isElectron

  // Load schedules from service
  useEffect(() => {
    loadSchedules()
  }, [])

  const loadSchedules = async () => {
    try {
      setLoading(true)
      if (isElectron && (window as any).electronAPI?.scheduler?.listSchedules) {
        const result = await (window as any).electronAPI.scheduler.listSchedules()
        if (result.success) {
          setSchedules(result.schedules || [])
        }
      }
    } catch (error) {
      console.error('Failed to load schedules:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateSchedule = () => {
    setEditingSchedule(null)
    setShowDialog(true)
  }

  const handleEditSchedule = (schedule: Schedule) => {
    setEditingSchedule(schedule)
    setShowDialog(true)
  }

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return

    try {
      setError(null)
      if (isElectron && (window as any).electronAPI?.scheduler?.deleteSchedule) {
        const result = await (window as any).electronAPI.scheduler.deleteSchedule(scheduleId)
        if (result.success) {
          await loadSchedules()
        } else {
          setError(`Failed to delete schedule: ${result.error}`)
        }
      }
    } catch (error) {
      console.error('Failed to delete schedule:', error)
      setError('Failed to delete schedule')
    }
  }

  const handleToggleSchedule = async (scheduleId: string, enabled: boolean) => {
    try {
      setError(null)
      if (isElectron && (window as any).electronAPI?.scheduler?.updateSchedule) {
        const result = await (window as any).electronAPI.scheduler.updateSchedule(scheduleId, { enabled })
        if (result.success) {
          await loadSchedules()
        } else {
          setError(`Failed to ${enabled ? 'enable' : 'disable'} schedule: ${result.error}`)
        }
      }
    } catch (error) {
      console.error('Failed to toggle schedule:', error)
      setError('Failed to toggle schedule')
    }
  }

  const handleSaveSchedule = async (config: any) => {
    try {
      setError(null)
      const electronAPI = (window as any).electronAPI

      if (editingSchedule) {
        // Update existing schedule
        const result = await electronAPI.scheduler.updateSchedule(editingSchedule.id, config)
        if (!result.success) {
          throw new Error(result.error || 'Failed to update schedule')
        }
      } else {
        // Create new schedule
        const result = await electronAPI.scheduler.createSchedule(config)
        if (!result.success) {
          throw new Error(result.error || 'Failed to create schedule')
        }
      }

      await loadSchedules()
    } catch (error) {
      console.error('Failed to save schedule:', error)
      setError(`Failed to save schedule: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const formatNextRun = (nextRunAt: number | null | undefined): string => {
    if (!nextRunAt) return 'Not scheduled'
    const date = new Date(nextRunAt)
    const now = new Date()
    const diff = date.getTime() - now.getTime()

    if (diff < 0) return 'Overdue'
    if (diff < 60000) return 'In less than a minute'
    if (diff < 3600000) return `In ${Math.floor(diff / 60000)} minutes`
    if (diff < 86400000) return `In ${Math.floor(diff / 3600000)} hours`
    return date.toLocaleString()
  }

  if (!isElectron) {
    return (
      <div>
        <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '16px', fontWeight: 600, color: colors.text }}>
          Workflow Schedules
        </h3>
        <div
          style={{
            padding: '20px',
            background: colors.bgSecondary,
            borderRadius: '8px',
            border: `1px solid ${colors.border}`,
            textAlign: 'center'
          }}
        >
          <p style={{ margin: 0, color: colors.textSecondary }}>
            Workflow scheduling is only available in the desktop app.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: colors.text }}>
          Workflow Schedules
        </h3>
        <button
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            background: colors.primary,
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer'
          }}
          onClick={handleCreateSchedule}
        >
          <Plus size={16} />
          Create Schedule
        </button>
      </div>

      <p style={{ marginBottom: '24px', color: colors.textSecondary, fontSize: '14px' }}>
        Schedule workflows to run automatically at specified intervals using cron expressions.
      </p>

      {/* Error Display */}
      {error && (
        <div
          style={{
            padding: '12px 16px',
            marginBottom: '16px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '6px',
            color: '#ef4444',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span>⚠️</span>
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              color: '#ef4444',
              cursor: 'pointer',
              fontSize: '18px',
              padding: '0 4px'
            }}
          >
            ×
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: colors.textSecondary }}>
          Loading schedules...
        </div>
      ) : schedules.length === 0 ? (
        <div
          style={{
            padding: '40px',
            background: colors.bgSecondary,
            borderRadius: '8px',
            border: `1px solid ${colors.border}`,
            textAlign: 'center'
          }}
        >
          <Clock size={48} style={{ color: colors.textSecondary, opacity: 0.5, marginBottom: '12px' }} />
          <h4 style={{ margin: '0 0 8px 0', color: colors.text }}>No Schedules Yet</h4>
          <p style={{ margin: 0, color: colors.textSecondary, fontSize: '13px' }}>
            Create your first workflow schedule to automate execution.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {schedules.map(schedule => (
            <div
              key={schedule.id}
              style={{
                padding: '16px',
                background: colors.bgSecondary,
                borderRadius: '8px',
                border: `1px solid ${colors.border}`
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 600, color: colors.text }}>
                    {schedule.name}
                  </h4>
                  <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: colors.textSecondary }}>
                    {schedule.workflowPath}
                  </p>
                  <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: colors.textSecondary }}>
                    <span>
                      <strong>Cron:</strong> {schedule.cronExpression}
                    </span>
                    <span>
                      <strong>Next Run:</strong> {formatNextRun(schedule.nextRunAt)}
                    </span>
                    {schedule.timezone && schedule.timezone !== 'UTC' && (
                      <span>
                        <strong>Timezone:</strong> {schedule.timezone}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {/* Enable/Disable Toggle */}
                  <button
                    onClick={() => handleToggleSchedule(schedule.id, !schedule.enabled)}
                    style={{
                      padding: '6px 12px',
                      background: schedule.enabled ? colors.primary : colors.bgPrimary,
                      color: schedule.enabled ? 'white' : colors.text,
                      border: `1px solid ${schedule.enabled ? colors.primary : colors.border}`,
                      borderRadius: '4px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title={schedule.enabled ? 'Disable schedule' : 'Enable schedule'}
                  >
                    {schedule.enabled ? <Pause size={12} /> : <Play size={12} />}
                    {schedule.enabled ? 'Enabled' : 'Disabled'}
                  </button>

                  {/* Edit Button */}
                  <button
                    onClick={() => handleEditSchedule(schedule)}
                    style={{
                      padding: '6px',
                      background: 'transparent',
                      color: colors.text,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '4px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                    title="Edit schedule"
                  >
                    <Edit2 size={14} />
                  </button>

                  {/* Delete Button */}
                  <button
                    onClick={() => handleDeleteSchedule(schedule.id)}
                    style={{
                      padding: '6px',
                      background: 'transparent',
                      color: '#ef4444',
                      border: `1px solid ${colors.border}`,
                      borderRadius: '4px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                    title="Delete schedule"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Schedule Dialog (Create/Edit) - Uses ScheduleDialog with integrated CronEditorDialog */}
      <ScheduleDialog
        open={showDialog}
        onClose={() => {
          setShowDialog(false)
          setEditingSchedule(null)
        }}
        schedule={editingSchedule}
        onSave={handleSaveSchedule}
      />
    </div>
  )
}

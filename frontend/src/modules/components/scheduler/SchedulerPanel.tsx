/**
 * Scheduler Modal - Configuration dialog for workflow scheduling
 *
 * Features:
 * - List all schedules with status
 * - Create/edit/delete schedules
 * - Enable/disable schedules
 * - Manual execution
 * - Execution history view
 * - Webhook proxy configuration
 * - Service management
 */

import { useState, useEffect } from 'react'
import { Plus, Play, Pause, Trash2, Edit, Clock, CheckCircle, XCircle, AlertCircle, RefreshCw, Wifi, X } from 'lucide-react'
import { ScheduleDialog } from './ScheduleDialog'
import { WebhookSettings } from '../settings/WebhookSettings'
import type { ScheduleInfo, ScheduleExecution } from '../../../electron'
import './SchedulerPanel.css'

type Schedule = ScheduleInfo
type Execution = ScheduleExecution

interface SchedulerModalProps {
  open: boolean
  onClose: () => void
}

export function SchedulerModal({ open, onClose }: SchedulerModalProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [executions, setExecutions] = useState<Execution[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null)
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'schedules' | 'history' | 'webhooks'>('schedules')

  // Load schedules on mount
  useEffect(() => {
    loadSchedules()
    loadExecutionHistory()

    // Refresh every 30 seconds
    const interval = setInterval(() => {
      loadSchedules()
      if (activeTab === 'history') {
        loadExecutionHistory()
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [activeTab])

  const loadSchedules = async () => {
    if (!window.electronAPI?.scheduler) {
      console.warn('Scheduler API not available')
      setLoading(false)
      return
    }

    try {
      const result = await window.electronAPI.scheduler.getSchedules()
      if (result.success) {
        setSchedules(result.schedules || [])
      }
    } catch (error) {
      console.error('Failed to load schedules:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadExecutionHistory = async () => {
    if (!window.electronAPI?.scheduler) return

    try {
      const result = await window.electronAPI.scheduler.getHistory(null, { limit: 50 })
      if (result.success) {
        setExecutions(result.history || [])
      }
    } catch (error) {
      console.error('Failed to load execution history:', error)
    }
  }

  const handleCreateSchedule = () => {
    setEditingSchedule(null)
    setDialogOpen(true)
  }

  const handleEditSchedule = (schedule: Schedule) => {
    setEditingSchedule(schedule)
    setDialogOpen(true)
  }

  const handleSaveSchedule = async (config: any) => {
    if (!window.electronAPI?.scheduler) return

    try {
      if (editingSchedule) {
        // Update existing schedule
        const result = await window.electronAPI.scheduler.updateSchedule(editingSchedule.id, config)
        if (result.success) {
          await loadSchedules()
        }
      } else {
        // Create new schedule
        const result = await window.electronAPI.scheduler.addSchedule(config)
        if (result.success) {
          await loadSchedules()
        }
      }
    } catch (error) {
      console.error('Failed to save schedule:', error)
      alert('Failed to save schedule: ' + (error as Error).message)
    }
  }

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!window.electronAPI?.scheduler) return

    if (!confirm('Are you sure you want to delete this schedule?')) {
      return
    }

    try {
      const result = await window.electronAPI.scheduler.deleteSchedule(scheduleId)
      if (result.success) {
        await loadSchedules()
      }
    } catch (error) {
      console.error('Failed to delete schedule:', error)
      alert('Failed to delete schedule: ' + (error as Error).message)
    }
  }

  const handleToggleSchedule = async (schedule: Schedule) => {
    if (!window.electronAPI?.scheduler) return

    try {
      const result = await window.electronAPI.scheduler.updateSchedule(schedule.id, {
        enabled: !schedule.enabled
      })
      if (result.success) {
        await loadSchedules()
      }
    } catch (error) {
      console.error('Failed to toggle schedule:', error)
    }
  }

  const handleExecuteNow = async (scheduleId: string) => {
    if (!window.electronAPI?.scheduler) return

    if (!confirm('Execute this workflow now?')) {
      return
    }

    try {
      const result = await window.electronAPI.scheduler.executeNow(scheduleId)
      if (result.success) {
        alert('Workflow execution started')
        await loadSchedules()
        await loadExecutionHistory()
      } else {
        alert('Failed to execute: ' + result.error)
      }
    } catch (error) {
      console.error('Failed to execute schedule:', error)
      alert('Failed to execute: ' + (error as Error).message)
    }
  }

  const formatNextRun = (timestamp: number | null | undefined) => {
    if (!timestamp) return 'Not scheduled'

    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = date.getTime() - now.getTime()
    const diffMins = Math.round(diffMs / 60000)

    if (diffMins < 1) return 'Now'
    if (diffMins < 60) return `${diffMins}m`
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h`
    return `${Math.floor(diffMins / 1440)}d`
  }

  const formatDuration = (startedAt: number, completedAt: number | null | undefined) => {
    if (!completedAt) return 'Running...'
    const duration = completedAt - startedAt
    if (duration < 1000) return `${duration}ms`
    if (duration < 60000) return `${(duration / 1000).toFixed(1)}s`
    return `${(duration / 60000).toFixed(1)}m`
  }

  if (!open) return null

  if (!window.electronAPI?.scheduler) {
    return (
      <div className="scheduler-modal-overlay" onClick={onClose}>
        <div className="scheduler-modal" onClick={(e) => e.stopPropagation()}>
          <div className="scheduler-modal-header">
            <h2>Scheduler Configuration</h2>
            <button className="modal-close-button" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
          <div className="scheduler-empty">
            <AlertCircle size={48} />
            <h3>Scheduler Not Available</h3>
            <p>The scheduler service is not running. Make sure you're using the Electron app.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="scheduler-modal-overlay" onClick={onClose}>
      <div className="scheduler-modal" onClick={(e) => e.stopPropagation()}>
        <div className="scheduler-modal-header">
          <h2>Scheduler Configuration</h2>
          <button className="modal-close-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="scheduler-tabs">
          <button
            className={`tab ${activeTab === 'schedules' ? 'active' : ''}`}
            onClick={() => setActiveTab('schedules')}
          >
            <Clock size={16} />
            Schedules ({schedules.length})
          </button>
          <button
            className={`tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <RefreshCw size={16} />
            History ({executions.length})
          </button>
          <button
            className={`tab ${activeTab === 'webhooks' ? 'active' : ''}`}
            onClick={() => setActiveTab('webhooks')}
          >
            <Wifi size={16} />
            Webhooks
          </button>
        </div>

        <div className="scheduler-content">
        {activeTab === 'schedules' ? (
          loading ? (
            <div className="scheduler-loading">Loading schedules...</div>
          ) : schedules.length === 0 ? (
            <div className="scheduler-empty">
              <Clock size={48} />
              <h3>No Schedules Yet</h3>
              <p>Create your first workflow schedule to automate execution.</p>
              <button className="button primary" onClick={handleCreateSchedule}>
                <Plus size={16} />
                Create Schedule
              </button>
            </div>
          ) : (
            <div className="schedules-list">
              {schedules.map((schedule) => (
                <div key={schedule.id} className={`schedule-card ${!schedule.enabled ? 'disabled' : ''}`}>
                  <div className="schedule-card-header">
                    <div className="schedule-info">
                      <h4>{schedule.name}</h4>
                      <span className="schedule-path">{schedule.workflowPath}</span>
                    </div>
                    <div className="schedule-actions">
                      <button
                        className="icon-button"
                        onClick={() => handleToggleSchedule(schedule)}
                        title={schedule.enabled ? 'Pause' : 'Resume'}
                      >
                        {schedule.enabled ? <Pause size={16} /> : <Play size={16} />}
                      </button>
                      <button
                        className="icon-button"
                        onClick={() => handleExecuteNow(schedule.id)}
                        title="Execute now"
                      >
                        <Play size={16} />
                      </button>
                      <button
                        className="icon-button"
                        onClick={() => handleEditSchedule(schedule)}
                        title="Edit"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        className="icon-button danger"
                        onClick={() => handleDeleteSchedule(schedule.id)}
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="schedule-card-body">
                    <div className="schedule-meta">
                      <div className="meta-item">
                        <Clock size={14} />
                        <span>{schedule.cronExpression}</span>
                      </div>
                      <div className="meta-item">
                        <span className="meta-label">Next run:</span>
                        <span>{formatNextRun(schedule.nextRunAt)}</span>
                      </div>
                      {schedule.lastRunAt && (
                        <div className="meta-item">
                          <span className="meta-label">Last run:</span>
                          <span>{new Date(schedule.lastRunAt).toLocaleString()}</span>
                          {schedule.lastRunStatus && (
                            <span className={`status-badge ${schedule.lastRunStatus}`}>
                              {schedule.lastRunStatus}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : activeTab === 'history' ? (
          <div className="history-list">
            {executions.length === 0 ? (
              <div className="scheduler-empty">
                <RefreshCw size={48} />
                <h3>No Execution History</h3>
                <p>Workflow executions will appear here.</p>
              </div>
            ) : (
              executions.map((execution) => {
                const schedule = schedules.find(s => s.id === execution.scheduleId)
                return (
                  <div key={execution.id} className="history-card">
                    <div className="history-icon">
                      {execution.status === 'success' && <CheckCircle size={20} className="success" />}
                      {execution.status === 'error' && <XCircle size={20} className="error" />}
                      {execution.status === 'cancelled' && <AlertCircle size={20} className="cancelled" />}
                    </div>
                    <div className="history-info">
                      <h4>{schedule?.name || 'Unknown Schedule'}</h4>
                      <div className="history-meta">
                        <span>{new Date(execution.startedAt).toLocaleString()}</span>
                        <span className="separator">•</span>
                        <span>{execution.trigger}</span>
                        <span className="separator">•</span>
                        <span>{formatDuration(execution.startedAt, execution.completedAt)}</span>
                      </div>
                      {execution.error && (
                        <div className="history-error">{execution.error}</div>
                      )}
                    </div>
                    <div className={`status-badge ${execution.status}`}>
                      {execution.status}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        ) : activeTab === 'webhooks' ? (
          <WebhookSettings />
        ) : null}
        </div>

        <ScheduleDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          schedule={editingSchedule}
          onSave={handleSaveSchedule}
        />
      </div>
    </div>
  )
}

// Backwards compatibility export
export { SchedulerModal as SchedulerPanel }

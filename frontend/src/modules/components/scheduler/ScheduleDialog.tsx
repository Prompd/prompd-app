/**
 * Schedule Dialog - Create/Edit workflow schedules
 *
 * Allows users to configure cron-based workflow execution with:
 * - Cron expression builder with presets
 * - Timezone selection
 * - Parameter configuration
 * - Next run times preview
 */

import { useState, useEffect, useCallback } from 'react'
import { X, Clock, Calendar, Globe, Settings, Play, Edit2 } from 'lucide-react'
import './ScheduleDialog.css'
import PackageSelector from '../PackageSelector'
import FileSelector from '../FileSelector'
import { registryApi } from '../../services/registryApi'
import { CronEditorDialog } from '../workflow/CronEditorDialog'
import type { ScheduleInfo, ScheduleConfig } from '../../../electron'

interface ScheduleDialogProps {
  open: boolean
  onClose: () => void
  schedule?: ScheduleInfo | null
  workflowPath?: string
  workflowId?: string
  onSave: (schedule: ScheduleConfig) => void
}

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney'
]

export function ScheduleDialog({
  open,
  onClose,
  schedule,
  workflowPath,
  workflowId,
  onSave
}: ScheduleDialogProps) {
  const [name, setName] = useState('')
  const [cronExpression, setCronExpression] = useState('0 9 * * *')
  const [timezone, setTimezone] = useState('UTC')
  const [enabled, setEnabled] = useState(true)
  const [parameters, setParameters] = useState<Record<string, unknown>>({})
  const [nextRuns, setNextRuns] = useState<Date[]>([])
  const [validationError, setValidationError] = useState<string | null>(null)
  const [showCronEditor, setShowCronEditor] = useState(false)

  // Workflow file selection state
  const [selectedPackage, setSelectedPackage] = useState<{ name: string; version: string } | null>(null)
  const [selectedWorkflowFile, setSelectedWorkflowFile] = useState<string>('')
  const [packageFiles, setPackageFiles] = useState<string[]>([])
  const [isLoadingPackageFiles, setIsLoadingPackageFiles] = useState(false)

  // Load schedule data if editing
  useEffect(() => {
    if (schedule) {
      setName(schedule.name)
      setCronExpression(schedule.cronExpression)
      setTimezone(schedule.timezone)
      setEnabled(schedule.enabled)
      setParameters(schedule.parameters || {})

      // Parse workflow path to extract package and file info
      // Format: @package@version/file.pdflow or just file.pdflow for local files
      const packageMatch = schedule.workflowPath.match(/^(.+?)@([^/]+)\/(.+)$/)
      if (packageMatch) {
        const [, packageName, version, filePath] = packageMatch
        setSelectedPackage({ name: packageName, version })
        setSelectedWorkflowFile(filePath)

        // Load package files
        setIsLoadingPackageFiles(true)
        registryApi.getPackageFiles(packageName, version)
          .then((files: string[]) => {
            const workflowFiles = files.filter((f: string) => f.endsWith('.pdflow'))
            setPackageFiles(workflowFiles)
          })
          .catch((error: unknown) => {
            console.error('Failed to load package files:', error)
            setPackageFiles([])
          })
          .finally(() => {
            setIsLoadingPackageFiles(false)
          })
      } else {
        // Local file
        setSelectedPackage(null)
        setSelectedWorkflowFile(schedule.workflowPath)
        setPackageFiles([])
      }
    } else if (workflowPath) {
      // Default name from workflow path
      const fileName = workflowPath.split(/[/\\]/).pop()?.replace('.pdflow', '') || 'Workflow'
      setName(`${fileName} Schedule`)

      // Parse workflowPath for initial selection
      const packageMatch = workflowPath.match(/^(.+?)@([^/]+)\/(.+)$/)
      if (packageMatch) {
        const [, packageName, version, filePath] = packageMatch
        setSelectedPackage({ name: packageName, version })
        setSelectedWorkflowFile(filePath)
      } else {
        setSelectedPackage(null)
        setSelectedWorkflowFile(workflowPath)
      }
    }
  }, [schedule, workflowPath])

  // Preview next run times
  useEffect(() => {
    if ((window as any).electronAPI?.scheduler && schedule?.id) {
      (window as any).electronAPI.scheduler.getNextRunTimes(schedule.id, 5).then((result: any) => {
        if (result.success && result.times) {
          setNextRuns(result.times.map((t: number) => new Date(t)))
        }
      })
    }
  }, [schedule, cronExpression, timezone])

  // Search for packages in registry
  const searchPackages = useCallback(async (query: string) => {
    try {
      const results = await registryApi.searchPackages(query, 20)
      return results.packages.map((pkg: any) => ({
        name: pkg.name,
        version: pkg.version || 'latest',
        description: pkg.description
      }))
    } catch (error) {
      console.error('Failed to search packages:', error)
      return []
    }
  }, [])

  // Search for local .pdflow files
  const searchLocalWorkflowFiles = useCallback(async (query: string): Promise<string[]> => {
    const isElectron = !!(window as any).electronAPI?.isElectron

    if (!isElectron || !(window as any).electronAPI?.getWorkspacePath) {
      return []
    }

    try {
      const workspacePath = await (window as any).electronAPI.getWorkspacePath()
      if (!workspacePath) {
        return []
      }

      const workspaceRelativePaths: string[] = []
      const searchTerm = query.toLowerCase().replace(/^\.+\//, '')

      const searchDirectory = async (dirPath: string, currentPath: string = '') => {
        const result: any = await (window as any).electronAPI.readDir(dirPath)
        if (!result.success) {
          return
        }

        for (const item of result.files) {
          const relativePath = currentPath ? `${currentPath}/${item.name}` : item.name

          if (!item.isDirectory && item.name.endsWith('.pdflow')) {
            if (searchTerm === '' || relativePath.toLowerCase().includes(searchTerm)) {
              workspaceRelativePaths.push(relativePath)
            }
          } else if (item.isDirectory) {
            if (!['node_modules', '.git', 'dist', 'build', '.prompd'].includes(item.name)) {
              if (currentPath.split('/').length < 10) {
                await searchDirectory(item.path, relativePath)
              }
            }
          }
        }
      }

      await searchDirectory(workspacePath)
      return workspaceRelativePaths.sort()
    } catch (error) {
      console.error('Failed to search local workflow files:', error)
      return []
    }
  }, [])

  // Handle local workflow file selection
  const handleLocalWorkflowFileSelect = useCallback((filePath: string) => {
    setSelectedPackage(null)
    setSelectedWorkflowFile(filePath)
    setPackageFiles([])
  }, [])

  // Handle package selection
  const handlePackageSelect = useCallback((packageName: string, version: string) => {
    if (!packageName || !version) {
      setSelectedPackage(null)
      setSelectedWorkflowFile('')
      setPackageFiles([])
      return
    }

    setSelectedPackage({ name: packageName, version })
    setSelectedWorkflowFile('')

    // Load package files
    setIsLoadingPackageFiles(true)
    registryApi.getPackageFiles(packageName, version)
      .then((files: string[]) => {
        // Filter for .pdflow files only
        const workflowFiles = files.filter((f: string) => f.endsWith('.pdflow'))
        setPackageFiles(workflowFiles)
      })
      .catch((error: unknown) => {
        console.error('Failed to load package files:', error)
        setPackageFiles([])
      })
      .finally(() => {
        setIsLoadingPackageFiles(false)
      })
  }, [])

  // Handle file selection from package
  const handlePackageFileSelect = useCallback((filePath: string) => {
    setSelectedWorkflowFile(filePath)
  }, [])

  // Handle cron editor save
  const handleCronSave = useCallback((newCronExpression: string) => {
    setCronExpression(newCronExpression)
  }, [])

  const handleSave = () => {
    // Clear previous validation error
    setValidationError(null)

    // Validate required fields
    if (!name.trim()) {
      setValidationError('Please enter a schedule name')
      return
    }

    if (!cronExpression.trim()) {
      setValidationError('Please configure a schedule')
      return
    }

    // Construct workflow path from selected package/file or use provided workflowPath
    let finalWorkflowPath = workflowPath || schedule?.workflowPath || ''

    if (selectedWorkflowFile) {
      if (selectedPackage) {
        // Package format: @package@version/file.pdflow
        finalWorkflowPath = `${selectedPackage.name}@${selectedPackage.version}/${selectedWorkflowFile}`
      } else {
        // Local file path
        finalWorkflowPath = selectedWorkflowFile
      }
    }

    if (!finalWorkflowPath) {
      setValidationError('Please select a workflow file')
      return
    }

    const config: ScheduleConfig = {
      workflowId: schedule?.workflowId || workflowId || '',
      workflowPath: finalWorkflowPath,
      name: name.trim(),
      cronExpression,
      timezone,
      enabled,
      parameters
    }

    onSave(config)
    onClose()
  }

  if (!open) return null

  return (
    <div className="schedule-dialog-overlay" onClick={onClose}>
      <div className="schedule-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="schedule-dialog-header">
          <h2>{schedule ? 'Edit Schedule' : 'Create Schedule'}</h2>
          <button className="close-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="schedule-dialog-content">
          {/* Schedule Name */}
          <div className="form-group">
            <label>
              <Calendar size={16} />
              Schedule Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Daily Report Generation"
              autoFocus
            />
          </div>

          {/* Workflow File Selection */}
          <div className="form-group">
            <PackageSelector
              selectedPackage={selectedPackage}
              selectedLocalFile={selectedWorkflowFile}
              onSelect={handlePackageSelect}
              onSearch={searchPackages}
              onLocalFileSearch={searchLocalWorkflowFiles}
              onLocalFileSelect={handleLocalWorkflowFileSelect}
              fileExtensions={['.pdflow']}
            />
          </div>

          {/* File selector for package files */}
          {selectedPackage && (
            <div className="form-group">
              <FileSelector
                selectedFile={selectedWorkflowFile}
                onSelect={handlePackageFileSelect}
                files={packageFiles}
                isLoading={isLoadingPackageFiles}
                selectedPackage={selectedPackage}
              />
            </div>
          )}

          {/* Cron Schedule Button */}
          <div className="form-group">
            <label>
              <Clock size={16} />
              Schedule
            </label>
            <button
              type="button"
              onClick={() => setShowCronEditor(true)}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--input-bg)',
                border: '1px solid var(--input-border)',
                borderRadius: '6px',
                color: 'var(--text)',
                fontSize: '13px',
                fontFamily: 'monospace',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                textAlign: 'left',
              }}
            >
              <span>{cronExpression || 'Click to configure schedule'}</span>
              <Edit2 size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            </button>
          </div>

          {/* Timezone */}
          <div className="form-group">
            <label>
              <Globe size={16} />
              Timezone
            </label>
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>

          {/* Next Run Times Preview */}
          {nextRuns.length > 0 && (
            <div className="form-group">
              <label>Next Run Times</label>
              <div className="next-runs-preview">
                {nextRuns.map((run, index) => (
                  <div key={index} className="next-run-item">
                    <Clock size={14} />
                    <span>{run.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Enabled Toggle */}
          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <span>Enable schedule immediately</span>
            </label>
          </div>
        </div>

        {/* Validation Error Display */}
        {validationError && (
          <div style={{
            padding: '12px 20px',
            background: 'rgba(239, 68, 68, 0.1)',
            borderTop: '1px solid rgba(239, 68, 68, 0.3)',
            borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#ef4444',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span>⚠️</span>
            <span>{validationError}</span>
          </div>
        )}

        <div className="schedule-dialog-footer">
          <button className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" onClick={handleSave}>
            <Play size={16} />
            {schedule ? 'Update Schedule' : 'Create Schedule'}
          </button>
        </div>
      </div>

      {/* Cron Editor Dialog */}
      {showCronEditor && (
        <CronEditorDialog
          value={cronExpression}
          onSave={handleCronSave}
          onClose={() => setShowCronEditor(false)}
          title="Configure Schedule"
        />
      )}
    </div>
  )
}

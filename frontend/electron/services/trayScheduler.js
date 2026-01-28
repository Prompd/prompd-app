/**
 * Tray Scheduler - Persistent workflow scheduling for Electron tray mode
 *
 * Integrates the shared scheduler-shared package with Electron tray UI
 * Provides:
 * - SQLite persistence across app restarts
 * - Cron-based scheduling with node-cron
 * - Tray menu integration with schedule status
 * - Workflow execution via workflowExecutor
 * - Execution history tracking
 */

const path = require('path')
const fs = require('fs')

// Lazy load the scheduler to avoid issues with module resolution
let Scheduler, getDefaultDbPath
try {
  const schedulerModule = require('../../../scheduler-shared/scheduler.js')
  const scheduleDBModule = require('../../../scheduler-shared/models/scheduleDB.js')
  Scheduler = schedulerModule.Scheduler
  getDefaultDbPath = scheduleDBModule.getDefaultDbPath
} catch (error) {
  console.error('[TrayScheduler] Failed to load scheduler-shared:', error.message)
  console.error('[TrayScheduler] Make sure to run "npm install" in scheduler-shared directory')
}

/**
 * Tray Scheduler Service - Wraps shared Scheduler for Electron
 */
class TraySchedulerService {
  constructor(options = {}) {
    this.mainWindow = options.mainWindow
    this.trayManager = options.trayManager
    this.workflowExecutor = options.workflowExecutor

    // Initialize shared scheduler with custom db path
    const dbPath = options.dbPath || getDefaultDbPath()

    this.scheduler = new Scheduler({
      dbPath,
      executeWorkflow: this.executeWorkflow.bind(this)
    })

    console.log('[TrayScheduler] Initialized with database:', dbPath)
  }

  /**
   * Start the scheduler
   */
  start() {
    this.scheduler.start()
    this.updateTrayStatus()
    console.log('[TrayScheduler] Started')
  }

  /**
   * Stop the scheduler
   */
  stop() {
    this.scheduler.stop()
    this.updateTrayStatus()
    console.log('[TrayScheduler] Stopped')
  }

  /**
   * Execute a workflow for a schedule
   * @param {object} schedule - Schedule data from database
   * @returns {Promise<object>} - Execution result
   */
  async executeWorkflow(schedule) {
    console.log(`[TrayScheduler] Executing workflow: ${schedule.name}`)

    try {
      // Check if workflow file exists
      if (!fs.existsSync(schedule.workflowPath)) {
        throw new Error(`Workflow file not found: ${schedule.workflowPath}`)
      }

      // Read workflow file
      const workflowContent = fs.readFileSync(schedule.workflowPath, 'utf-8')

      // Parse parameters
      const parameters = schedule.parameters ? schedule.parameters : {}

      // Execute workflow via provided executor
      if (!this.workflowExecutor) {
        throw new Error('No workflow executor provided')
      }

      const result = await this.workflowExecutor.execute(schedule.workflowPath, {
        parameters,
        trigger: 'schedule',
        scheduleId: schedule.id
      })

      // Show notification on completion
      if (this.trayManager) {
        this.trayManager.showNotification({
          title: 'Workflow Completed',
          body: `${schedule.name} executed successfully`,
          type: 'success'
        })
      }

      this.updateTrayStatus()

      return {
        status: 'success',
        result
      }
    } catch (error) {
      console.error(`[TrayScheduler] Workflow execution failed:`, error)

      // Show error notification
      if (this.trayManager) {
        this.trayManager.showNotification({
          title: 'Workflow Failed',
          body: `${schedule.name}: ${error.message}`,
          type: 'error'
        })
      }

      this.updateTrayStatus()

      return {
        status: 'error',
        error: error.message
      }
    }
  }

  /**
   * Add a new schedule
   * @param {object} config - Schedule configuration
   * @returns {string} - Schedule ID
   */
  addSchedule(config) {
    const scheduleId = this.scheduler.addSchedule(config)
    this.updateTrayStatus()
    return scheduleId
  }

  /**
   * Update a schedule
   * @param {string} scheduleId - Schedule ID
   * @param {object} updates - Fields to update
   * @returns {boolean} - Success
   */
  updateSchedule(scheduleId, updates) {
    const success = this.scheduler.updateSchedule(scheduleId, updates)
    if (success) {
      this.updateTrayStatus()
    }
    return success
  }

  /**
   * Delete a schedule
   * @param {string} scheduleId - Schedule ID
   * @returns {boolean} - Success
   */
  deleteSchedule(scheduleId) {
    const success = this.scheduler.deleteSchedule(scheduleId)
    if (success) {
      this.updateTrayStatus()
    }
    return success
  }

  /**
   * Execute a schedule immediately (manual trigger)
   * @param {string} scheduleId - Schedule ID
   * @returns {Promise<object>} - Execution result
   */
  async executeScheduleNow(scheduleId) {
    const result = await this.scheduler.executeScheduleNow(scheduleId)
    this.updateTrayStatus()
    return result
  }

  /**
   * Get all schedules
   * @param {object} filters - Optional filters
   * @returns {Array} - Schedules
   */
  getSchedules(filters = {}) {
    return this.scheduler.getSchedules(filters)
  }

  /**
   * Get active schedules (enabled)
   * @returns {Array} - Active schedules
   */
  getActiveSchedules() {
    return this.scheduler.getActiveSchedules()
  }

  /**
   * Get execution history
   * @param {string} workflowId - Workflow ID (optional)
   * @param {object} options - Query options
   * @returns {Array} - Execution history
   */
  getExecutionHistory(workflowId = null, options = {}) {
    return this.scheduler.getExecutionHistory(workflowId, options)
  }

  /**
   * Get next run times for a schedule
   * @param {string} scheduleId - Schedule ID
   * @param {number} count - Number of times to calculate
   * @returns {Array<Date>} - Next run times
   */
  getNextRunTimes(scheduleId, count = 5) {
    return this.scheduler.getNextRunTimes(scheduleId, count)
  }

  /**
   * Update tray status with schedule information
   */
  updateTrayStatus() {
    if (!this.trayManager) return

    const activeSchedules = this.getActiveSchedules()

    // Find next scheduled run across all schedules
    let nextRunAt = null
    for (const schedule of activeSchedules) {
      if (schedule.nextRunAt && (!nextRunAt || schedule.nextRunAt < nextRunAt)) {
        nextRunAt = schedule.nextRunAt
      }
    }

    // Update tray state
    this.trayManager.setState({
      scheduledTriggers: activeSchedules.length,
      nextScheduledRun: nextRunAt ? new Date(nextRunAt).toISOString() : undefined
    })

    console.log(`[TrayScheduler] Updated tray status: ${activeSchedules.length} active schedules`)
  }

  /**
   * Get schedule status for tray menu
   * @returns {Array<{name: string, nextRun: string}>}
   */
  getScheduleStatusForTray() {
    const activeSchedules = this.getActiveSchedules()
      .sort((a, b) => (a.nextRunAt || 0) - (b.nextRunAt || 0))
      .slice(0, 5) // Top 5 upcoming schedules

    return activeSchedules.map(schedule => {
      let nextRunStr = 'Unknown'
      if (schedule.nextRunAt) {
        const nextRun = new Date(schedule.nextRunAt)
        const now = new Date()
        const diffMs = nextRun.getTime() - now.getTime()
        const diffMins = Math.round(diffMs / 60000)

        if (diffMins < 1) {
          nextRunStr = 'Now'
        } else if (diffMins < 60) {
          nextRunStr = `${diffMins}m`
        } else if (diffMins < 1440) {
          nextRunStr = `${Math.floor(diffMins / 60)}h`
        } else {
          nextRunStr = `${Math.floor(diffMins / 1440)}d`
        }
      }

      return {
        id: schedule.id,
        name: schedule.name,
        nextRun: nextRunStr,
        cronExpression: schedule.cronExpression
      }
    })
  }

  /**
   * Close database connection and clean up
   */
  close() {
    this.scheduler.close()
    console.log('[TrayScheduler] Closed')
  }
}

/**
 * Create workflow executor wrapper for Electron
 * This bridges the scheduler to the actual workflow execution system
 */
function createWorkflowExecutor(mainWindow) {
  return {
    /**
     * Execute a workflow file
     * @param {string} workflowPath - Path to workflow file
     * @param {object} options - Execution options
     * @returns {Promise<object>} - Execution result
     */
    async execute(workflowPath, options = {}) {
      return new Promise((resolve, reject) => {
        // Send execution request to renderer process
        mainWindow.webContents.send('execute-workflow', {
          workflowPath,
          parameters: options.parameters || {},
          trigger: options.trigger || 'manual',
          scheduleId: options.scheduleId
        })

        // Wait for execution result
        const timeoutId = setTimeout(() => {
          reject(new Error('Workflow execution timeout (5 minutes)'))
        }, 5 * 60 * 1000)

        // Listen for result
        const resultHandler = (event, result) => {
          clearTimeout(timeoutId)
          mainWindow.webContents.off('workflow-execution-result', resultHandler)

          if (result.error) {
            reject(new Error(result.error))
          } else {
            resolve(result)
          }
        }

        mainWindow.webContents.on('workflow-execution-result', resultHandler)
      })
    }
  }
}

// Export using CommonJS
module.exports = {
  TraySchedulerService,
  createWorkflowExecutor
}

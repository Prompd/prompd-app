/**
 * Shared Workflow Scheduler Logic
 *
 * Used by both tray mode (Electron) and service mode (standalone Node.js)
 * Handles cron job registration, workflow execution, and schedule management
 */

const cron = require('node-cron')
const cronParser = require('cron-parser')
const { SchedulerDatabase } = require('./models/scheduleDB.js')

/**
 * Workflow Scheduler
 */
class Scheduler {
  constructor(options = {}) {
    this.dbPath = options.dbPath
    this.db = new SchedulerDatabase(this.dbPath)
    this.executeWorkflow = options.executeWorkflow // Function to execute workflows
    this.cronJobs = new Map() // scheduleId -> cron.ScheduledTask
    this.isRunning = false

    // Maintenance interval (daily cleanup)
    this.maintenanceInterval = null
  }

  /**
   * Start the scheduler
   */
  start() {
    if (this.isRunning) {
      console.log('[Scheduler] Already running')
      return
    }

    console.log('[Scheduler] Starting...')
    this.isRunning = true

    // Load and register all enabled schedules
    this.registerCronJobs()

    // Start daily maintenance (cleanup old executions)
    this.startMaintenance()

    console.log(`[Scheduler] Started with ${this.cronJobs.size} active schedules`)
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (!this.isRunning) {
      return
    }

    console.log('[Scheduler] Stopping...')
    this.isRunning = false

    // Stop all cron jobs
    for (const [scheduleId, task] of this.cronJobs.entries()) {
      task.stop()
      console.log(`[Scheduler] Stopped schedule: ${scheduleId}`)
    }
    this.cronJobs.clear()

    // Stop maintenance
    if (this.maintenanceInterval) {
      clearInterval(this.maintenanceInterval)
      this.maintenanceInterval = null
    }

    console.log('[Scheduler] Stopped')
  }

  /**
   * Register all enabled schedules as cron jobs
   */
  registerCronJobs() {
    const schedules = this.db.schedules.getAllSchedules({ enabled: true })

    for (const schedule of schedules) {
      this.registerSchedule(schedule)
    }

    console.log(`[Scheduler] Registered ${schedules.length} schedules`)
  }

  /**
   * Register a single schedule as a cron job
   * @param {object} schedule - Schedule data
   */
  registerSchedule(schedule) {
    // Remove existing job if present
    if (this.cronJobs.has(schedule.id)) {
      this.cronJobs.get(schedule.id).stop()
      this.cronJobs.delete(schedule.id)
    }

    // Validate cron expression
    if (!cron.validate(schedule.cronExpression)) {
      console.error(`[Scheduler] Invalid cron expression for schedule ${schedule.id}: ${schedule.cronExpression}`)
      return
    }

    // Calculate next run time
    const nextRunAt = this.calculateNextRun(schedule.cronExpression, schedule.timezone)
    if (nextRunAt) {
      this.db.schedules.updateSchedule(schedule.id, { nextRunAt: nextRunAt.getTime() })
    }

    // Create cron job
    const task = cron.schedule(
      schedule.cronExpression,
      () => {
        this.executeSchedule(schedule.id)
      },
      {
        timezone: schedule.timezone || 'UTC',
        scheduled: true
      }
    )

    this.cronJobs.set(schedule.id, task)
    console.log(`[Scheduler] Registered schedule: ${schedule.name} (${schedule.cronExpression})`)
  }

  /**
   * Unregister a schedule
   * @param {string} scheduleId - Schedule ID
   */
  unregisterSchedule(scheduleId) {
    if (this.cronJobs.has(scheduleId)) {
      this.cronJobs.get(scheduleId).stop()
      this.cronJobs.delete(scheduleId)
      console.log(`[Scheduler] Unregistered schedule: ${scheduleId}`)
    }
  }

  /**
   * Add a new schedule
   * @param {object} config - Schedule configuration
   * @returns {string} - Schedule ID
   */
  addSchedule(config) {
    // Validate cron expression
    if (!cron.validate(config.cronExpression)) {
      throw new Error(`Invalid cron expression: ${config.cronExpression}`)
    }

    // Calculate next run time
    const nextRunAt = this.calculateNextRun(config.cronExpression, config.timezone)

    // Create schedule in database
    const scheduleId = this.db.schedules.createSchedule({
      ...config,
      nextRunAt: nextRunAt ? nextRunAt.getTime() : null
    })

    // Register cron job if enabled
    if (config.enabled !== false) {
      const schedule = this.db.schedules.getSchedule(scheduleId)
      this.registerSchedule(schedule)
    }

    console.log(`[Scheduler] Added schedule: ${config.name} (${scheduleId})`)
    return scheduleId
  }

  /**
   * Update a schedule
   * @param {string} scheduleId - Schedule ID
   * @param {object} updates - Fields to update
   * @returns {boolean} - Success
   */
  updateSchedule(scheduleId, updates) {
    // Validate cron expression if being updated
    if (updates.cronExpression && !cron.validate(updates.cronExpression)) {
      throw new Error(`Invalid cron expression: ${updates.cronExpression}`)
    }

    // Calculate new next run time if cron expression or timezone changed
    if (updates.cronExpression || updates.timezone) {
      const schedule = this.db.schedules.getSchedule(scheduleId)
      const cronExpression = updates.cronExpression || schedule.cronExpression
      const timezone = updates.timezone || schedule.timezone
      const nextRunAt = this.calculateNextRun(cronExpression, timezone)
      updates.nextRunAt = nextRunAt ? nextRunAt.getTime() : null
    }

    // Update in database
    const success = this.db.schedules.updateSchedule(scheduleId, updates)

    if (success) {
      // Re-register cron job
      const schedule = this.db.schedules.getSchedule(scheduleId)
      if (schedule.enabled) {
        this.registerSchedule(schedule)
      } else {
        this.unregisterSchedule(scheduleId)
      }

      console.log(`[Scheduler] Updated schedule: ${scheduleId}`)
    }

    return success
  }

  /**
   * Delete a schedule
   * @param {string} scheduleId - Schedule ID
   * @returns {boolean} - Success
   */
  deleteSchedule(scheduleId) {
    // Unregister cron job
    this.unregisterSchedule(scheduleId)

    // Delete from database
    const success = this.db.schedules.deleteSchedule(scheduleId)

    if (success) {
      console.log(`[Scheduler] Deleted schedule: ${scheduleId}`)
    }

    return success
  }

  /**
   * Execute a schedule immediately (manual trigger)
   * @param {string} scheduleId - Schedule ID
   * @returns {Promise<object>} - Execution result
   */
  async executeScheduleNow(scheduleId) {
    const schedule = this.db.schedules.getSchedule(scheduleId)
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`)
    }

    return this.executeSchedule(scheduleId, 'manual')
  }

  /**
   * Execute a schedule
   * @private
   * @param {string} scheduleId - Schedule ID
   * @param {string} trigger - Trigger type ('schedule', 'manual', 'webhook')
   * @returns {Promise<object>} - Execution result
   */
  async executeSchedule(scheduleId, trigger = 'schedule') {
    const schedule = this.db.schedules.getSchedule(scheduleId)
    if (!schedule) {
      console.error(`[Scheduler] Schedule not found: ${scheduleId}`)
      return
    }

    console.log(`[Scheduler] Executing schedule: ${schedule.name} (trigger: ${trigger})`)

    // Create execution history entry
    const executionId = this.db.executions.createExecution({
      scheduleId: schedule.id,
      workflowId: schedule.workflowId,
      trigger,
      status: 'running',
      startedAt: Date.now()
    })

    let result
    let status = 'success'
    let error = null

    try {
      // Execute workflow via provided callback
      if (!this.executeWorkflow) {
        throw new Error('No workflow execution function provided')
      }

      result = await this.executeWorkflow(schedule)

      if (result.status === 'error') {
        status = 'error'
        error = result.error || 'Unknown error'
      }
    } catch (err) {
      console.error(`[Scheduler] Execution failed for ${schedule.name}:`, err)
      status = 'error'
      error = err.message
    }

    // Update execution history
    this.db.executions.updateExecution(executionId, {
      status,
      result,
      error,
      completedAt: Date.now()
    })

    // Update schedule last run status
    this.db.schedules.updateSchedule(schedule.id, {
      lastRunAt: Date.now(),
      lastRunStatus: status
    })

    // Calculate next run time (for schedule triggers)
    if (trigger === 'schedule') {
      const nextRunAt = this.calculateNextRun(schedule.cronExpression, schedule.timezone)
      if (nextRunAt) {
        this.db.schedules.updateSchedule(schedule.id, {
          nextRunAt: nextRunAt.getTime()
        })
      }
    }

    console.log(`[Scheduler] Execution completed: ${schedule.name} (status: ${status})`)

    return {
      executionId,
      status,
      result,
      error
    }
  }

  /**
   * Calculate next run time for a cron expression
   * @param {string} cronExpression - Cron expression
   * @param {string} timezone - Timezone
   * @returns {Date|null} - Next run time
   */
  calculateNextRun(cronExpression, timezone = 'UTC') {
    try {
      const interval = cronParser.parseExpression(cronExpression, {
        currentDate: new Date(),
        tz: timezone
      })
      return interval.next().toDate()
    } catch (err) {
      console.error(`[Scheduler] Error calculating next run:`, err)
      return null
    }
  }

  /**
   * Get next N run times for a schedule
   * @param {string} scheduleId - Schedule ID
   * @param {number} count - Number of times to calculate
   * @returns {Array<Date>} - Next run times
   */
  getNextRunTimes(scheduleId, count = 5) {
    const schedule = this.db.schedules.getSchedule(scheduleId)
    if (!schedule) {
      return []
    }

    const times = []
    try {
      const interval = cronParser.parseExpression(schedule.cronExpression, {
        currentDate: new Date(),
        tz: schedule.timezone || 'UTC'
      })

      for (let i = 0; i < count; i++) {
        times.push(interval.next().toDate())
      }
    } catch (err) {
      console.error(`[Scheduler] Error calculating next run times:`, err)
    }

    return times
  }

  /**
   * Get all schedules
   * @param {object} filters - Optional filters
   * @returns {Array} - Schedules
   */
  getSchedules(filters = {}) {
    return this.db.schedules.getAllSchedules(filters)
  }

  /**
   * Get active schedules (enabled)
   * @returns {Array} - Active schedules
   */
  getActiveSchedules() {
    return this.db.schedules.getAllSchedules({ enabled: true })
  }

  /**
   * Get execution history
   * @param {string} workflowId - Workflow ID (optional)
   * @param {object} options - Query options
   * @returns {Array} - Execution history
   */
  getExecutionHistory(workflowId = null, options = {}) {
    if (workflowId) {
      return this.db.executions.getWorkflowExecutionHistory(workflowId, options)
    }
    return this.db.executions.getAllExecutions(options)
  }

  /**
   * Start daily maintenance tasks
   * @private
   */
  startMaintenance() {
    // Run maintenance daily at 3 AM
    this.maintenanceInterval = setInterval(() => {
      console.log('[Scheduler] Running maintenance...')
      this.db.maintenance()
    }, 24 * 60 * 60 * 1000) // 24 hours

    // Run once on startup
    setTimeout(() => {
      this.db.maintenance()
    }, 5000) // 5 seconds after startup
  }

  /**
   * Close database connection
   */
  close() {
    this.stop()
    this.db.close()
  }
}

// Export Scheduler class
module.exports = {
  Scheduler
}

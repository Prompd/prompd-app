/**
 * Scheduler Service - Cron-based workflow trigger execution
 *
 * Uses node-cron for scheduling workflow executions with:
 * - Cron expression support (standard 5-field format)
 * - Interval-based scheduling (every N minutes/hours)
 * - Timezone support
 * - Pause/resume functionality
 * - Next run time calculation
 */

const cron = require('node-cron')
const EventEmitter = require('events')

/**
 * @typedef {Object} ScheduleConfig
 * @property {string} workflowId - Unique workflow identifier
 * @property {'cron' | 'interval'} type - Schedule type
 * @property {string} [cron] - Cron expression (when type is 'cron')
 * @property {number} [intervalMs] - Interval in milliseconds (when type is 'interval')
 * @property {string} [timezone] - IANA timezone (e.g., 'America/Denver')
 * @property {boolean} [runOnStart] - Whether to run immediately when registered
 */

/**
 * @typedef {Object} ScheduledJob
 * @property {string} workflowId
 * @property {ScheduleConfig} config
 * @property {import('node-cron').ScheduledTask | null} task
 * @property {NodeJS.Timeout | null} intervalId
 * @property {boolean} paused
 * @property {number | null} lastRun
 * @property {number | null} nextRun
 */

class SchedulerService extends EventEmitter {
  constructor() {
    super()
    /** @type {Map<string, ScheduledJob>} */
    this.jobs = new Map()
  }

  /**
   * Add a scheduled job for a workflow
   * @param {ScheduleConfig} config
   */
  addJob(config) {
    const { workflowId, type } = config

    // Remove existing job if present
    if (this.jobs.has(workflowId)) {
      this.removeJob(workflowId)
    }

    /** @type {ScheduledJob} */
    const job = {
      workflowId,
      config,
      task: null,
      intervalId: null,
      paused: false,
      lastRun: null,
      nextRun: null,
    }

    if (type === 'cron' && config.cron) {
      // Validate cron expression
      if (!cron.validate(config.cron)) {
        throw new Error(`Invalid cron expression: ${config.cron}`)
      }

      // Create cron task
      const options = {
        scheduled: true,
        timezone: config.timezone || undefined,
      }

      job.task = cron.schedule(
        config.cron,
        () => {
          if (!job.paused) {
            job.lastRun = Date.now()
            this.calculateNextRun(job)
            this.emit('trigger', {
              workflowId,
              type: 'schedule',
              scheduleType: 'cron',
              timestamp: job.lastRun,
            })
          }
        },
        options
      )

      this.calculateNextRun(job)
    } else if (type === 'interval' && config.intervalMs) {
      // Validate interval
      if (config.intervalMs < 1000) {
        throw new Error('Interval must be at least 1000ms (1 second)')
      }

      // Create interval
      job.intervalId = setInterval(() => {
        if (!job.paused) {
          job.lastRun = Date.now()
          job.nextRun = job.lastRun + config.intervalMs
          this.emit('trigger', {
            workflowId,
            type: 'schedule',
            scheduleType: 'interval',
            timestamp: job.lastRun,
          })
        }
      }, config.intervalMs)

      job.nextRun = Date.now() + config.intervalMs

      // Run immediately if configured
      if (config.runOnStart) {
        job.lastRun = Date.now()
        this.emit('trigger', {
          workflowId,
          type: 'schedule',
          scheduleType: 'interval',
          timestamp: job.lastRun,
          isInitialRun: true,
        })
      }
    } else {
      throw new Error(`Invalid schedule config: type=${type}`)
    }

    this.jobs.set(workflowId, job)
    console.log(`[Scheduler] Added job for workflow ${workflowId}`)

    return job
  }

  /**
   * Remove a scheduled job
   * @param {string} workflowId
   */
  removeJob(workflowId) {
    const job = this.jobs.get(workflowId)
    if (!job) return false

    // Stop the task/interval
    if (job.task) {
      job.task.stop()
    }
    if (job.intervalId) {
      clearInterval(job.intervalId)
    }

    this.jobs.delete(workflowId)
    console.log(`[Scheduler] Removed job for workflow ${workflowId}`)
    return true
  }

  /**
   * Pause a scheduled job
   * @param {string} workflowId
   */
  pauseJob(workflowId) {
    const job = this.jobs.get(workflowId)
    if (!job) return false

    job.paused = true
    if (job.task) {
      job.task.stop()
    }

    console.log(`[Scheduler] Paused job for workflow ${workflowId}`)
    this.emit('jobPaused', { workflowId })
    return true
  }

  /**
   * Resume a paused job
   * @param {string} workflowId
   */
  resumeJob(workflowId) {
    const job = this.jobs.get(workflowId)
    if (!job) return false

    job.paused = false
    if (job.task) {
      job.task.start()
      this.calculateNextRun(job)
    } else if (job.intervalId === null && job.config.intervalMs) {
      // Recreate interval if it was removed
      job.intervalId = setInterval(() => {
        if (!job.paused) {
          job.lastRun = Date.now()
          job.nextRun = job.lastRun + job.config.intervalMs
          this.emit('trigger', {
            workflowId,
            type: 'schedule',
            scheduleType: 'interval',
            timestamp: job.lastRun,
          })
        }
      }, job.config.intervalMs)
      job.nextRun = Date.now() + job.config.intervalMs
    }

    console.log(`[Scheduler] Resumed job for workflow ${workflowId}`)
    this.emit('jobResumed', { workflowId })
    return true
  }

  /**
   * Pause all scheduled jobs
   */
  pauseAll() {
    for (const workflowId of this.jobs.keys()) {
      this.pauseJob(workflowId)
    }
    console.log('[Scheduler] Paused all jobs')
  }

  /**
   * Resume all scheduled jobs
   */
  resumeAll() {
    for (const workflowId of this.jobs.keys()) {
      this.resumeJob(workflowId)
    }
    console.log('[Scheduler] Resumed all jobs')
  }

  /**
   * Get job status
   * @param {string} workflowId
   */
  getJobStatus(workflowId) {
    const job = this.jobs.get(workflowId)
    if (!job) return null

    return {
      workflowId: job.workflowId,
      paused: job.paused,
      lastRun: job.lastRun,
      nextRun: job.nextRun,
      config: job.config,
    }
  }

  /**
   * Get the next scheduled run across all jobs
   * @returns {string | null} ISO timestamp of next run, or null if no jobs
   */
  getNextScheduledRun() {
    let nextRun = null

    for (const job of this.jobs.values()) {
      if (!job.paused && job.nextRun) {
        if (nextRun === null || job.nextRun < nextRun) {
          nextRun = job.nextRun
        }
      }
    }

    return nextRun ? new Date(nextRun).toISOString() : null
  }

  /**
   * Get count of active (non-paused) scheduled jobs
   * @returns {number}
   */
  getActiveCount() {
    let count = 0
    for (const job of this.jobs.values()) {
      if (!job.paused) {
        count++
      }
    }
    return count
  }

  /**
   * Calculate and set the next run time for a cron job
   * @param {ScheduledJob} job
   * @private
   */
  calculateNextRun(job) {
    if (job.config.type !== 'cron' || !job.config.cron) {
      return
    }

    try {
      // Parse cron expression to calculate next occurrence
      // node-cron doesn't expose a next() method, so we calculate manually
      const fields = job.config.cron.split(' ')
      if (fields.length < 5) return

      // For now, use a simple estimation based on the cron pattern
      // A more accurate implementation would parse the full cron expression
      job.nextRun = this.estimateNextCronRun(job.config.cron)
    } catch (error) {
      console.error(`[Scheduler] Error calculating next run: ${error.message}`)
    }
  }

  /**
   * Estimate next run time for a cron expression
   * @param {string} cronExpr - Cron expression (5 fields)
   * @returns {number} Timestamp of estimated next run
   * @private
   */
  estimateNextCronRun(cronExpr) {
    const now = new Date()
    const fields = cronExpr.split(' ')

    // Parse fields with wildcard handling
    const parseField = (field, min, max, current) => {
      if (field === '*') return current
      if (field.includes('/')) {
        const [, step] = field.split('/')
        const stepNum = parseInt(step, 10)
        return Math.ceil(current / stepNum) * stepNum
      }
      if (field.includes(',')) {
        const values = field.split(',').map(Number)
        const next = values.find((v) => v >= current)
        return next !== undefined ? next : values[0]
      }
      if (field.includes('-')) {
        const [start, end] = field.split('-').map(Number)
        if (current >= start && current <= end) return current
        if (current < start) return start
        return start // Wrap to next period
      }
      return parseInt(field, 10)
    }

    // Simple estimation - add 1 minute and round to the pattern
    // This is a rough estimate; a full cron parser would be more accurate
    const nextMinute = new Date(now.getTime() + 60000)

    const minute = parseField(fields[0], 0, 59, nextMinute.getMinutes())
    const hour = parseField(fields[1], 0, 23, nextMinute.getHours())

    const result = new Date(nextMinute)
    result.setMinutes(minute)
    result.setHours(hour)
    result.setSeconds(0)
    result.setMilliseconds(0)

    // If we calculated a time in the past, add appropriate time
    if (result.getTime() <= now.getTime()) {
      // Add a day if hour pattern doesn't match today
      if (fields[1] !== '*' && parseInt(fields[1], 10) < now.getHours()) {
        result.setDate(result.getDate() + 1)
      } else if (fields[0] !== '*') {
        // Add an hour if minute pattern doesn't match this hour
        result.setHours(result.getHours() + 1)
      }
    }

    return result.getTime()
  }

  /**
   * Stop all jobs and clean up
   */
  shutdown() {
    for (const [workflowId, job] of this.jobs.entries()) {
      if (job.task) {
        job.task.stop()
      }
      if (job.intervalId) {
        clearInterval(job.intervalId)
      }
    }
    this.jobs.clear()
    console.log('[Scheduler] Shutdown complete')
  }
}

// Export singleton instance
const schedulerService = new SchedulerService()

module.exports = {
  schedulerService,
  SchedulerService,
}

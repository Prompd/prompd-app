/**
 * Shared SQLite Database Schema for Workflow Scheduler
 *
 * Used by both tray mode (Electron) and service mode (standalone Node.js)
 * Location: ~/.prompd/scheduler/schedules.db
 */

const Database = require('better-sqlite3')
const { randomUUID } = require('crypto')
const path = require('path')
const fs = require('fs')
const os = require('os')

/**
 * Initialize database connection and create tables if they don't exist
 * @param {string} dbPath - Path to SQLite database file
 * @returns {Database.Database} - SQLite database instance
 */
function initializeDatabase(dbPath) {
  // Ensure directory exists
  const dir = path.dirname(dbPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const db = new Database(dbPath)

  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL')

  // Create schedules table
  db.exec(`
    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      workflowId TEXT NOT NULL,
      workflowPath TEXT NOT NULL,
      name TEXT NOT NULL,
      cronExpression TEXT NOT NULL,
      timezone TEXT DEFAULT 'UTC',
      enabled INTEGER DEFAULT 1,
      parameters TEXT,
      nextRunAt INTEGER,
      lastRunAt INTEGER,
      lastRunStatus TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_schedules_enabled ON schedules(enabled);
    CREATE INDEX IF NOT EXISTS idx_schedules_nextRunAt ON schedules(nextRunAt);
    CREATE INDEX IF NOT EXISTS idx_schedules_workflowId ON schedules(workflowId);
  `)

  // Create execution_history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS execution_history (
      id TEXT PRIMARY KEY,
      scheduleId TEXT NOT NULL,
      workflowId TEXT NOT NULL,
      trigger TEXT NOT NULL,
      status TEXT NOT NULL,
      result TEXT,
      error TEXT,
      startedAt INTEGER NOT NULL,
      completedAt INTEGER,
      FOREIGN KEY (scheduleId) REFERENCES schedules(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_history_completed ON execution_history(completedAt);
    CREATE INDEX IF NOT EXISTS idx_history_scheduleId ON execution_history(scheduleId);
    CREATE INDEX IF NOT EXISTS idx_history_workflowId ON execution_history(workflowId);
    CREATE INDEX IF NOT EXISTS idx_history_status ON execution_history(status);
  `)

  return db
}

/**
 * Get default database path
 * @returns {string} - Default database path
 */
function getDefaultDbPath() {
  return path.join(os.homedir(), '.prompd', 'scheduler', 'schedules.db')
}

/**
 * Schedule CRUD Operations
 */
class ScheduleDB {
  constructor(db) {
    this.db = db
  }

  /**
   * Create a new schedule
   * @param {object} schedule - Schedule data
   * @returns {string} - Schedule ID
   */
  createSchedule(schedule) {
    const id = randomUUID()
    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT INTO schedules (
        id, workflowId, workflowPath, name, cronExpression, timezone,
        enabled, parameters, nextRunAt, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      schedule.workflowId,
      schedule.workflowPath,
      schedule.name,
      schedule.cronExpression,
      schedule.timezone || 'UTC',
      schedule.enabled !== undefined ? (schedule.enabled ? 1 : 0) : 1,
      schedule.parameters ? JSON.stringify(schedule.parameters) : null,
      schedule.nextRunAt || null,
      now,
      now
    )

    return id
  }

  /**
   * Get schedule by ID
   * @param {string} id - Schedule ID
   * @returns {object|null} - Schedule data
   */
  getSchedule(id) {
    const stmt = this.db.prepare('SELECT * FROM schedules WHERE id = ?')
    const row = stmt.get(id)
    return row ? this._deserializeSchedule(row) : null
  }

  /**
   * Get all schedules
   * @param {object} filters - Optional filters
   * @returns {Array} - Array of schedules
   */
  getAllSchedules(filters = {}) {
    let query = 'SELECT * FROM schedules WHERE 1=1'
    const params = []

    if (filters.enabled !== undefined) {
      query += ' AND enabled = ?'
      params.push(filters.enabled ? 1 : 0)
    }

    if (filters.workflowId) {
      query += ' AND workflowId = ?'
      params.push(filters.workflowId)
    }

    query += ' ORDER BY nextRunAt ASC'

    const stmt = this.db.prepare(query)
    const rows = stmt.all(...params)
    return rows.map(row => this._deserializeSchedule(row))
  }

  /**
   * Update schedule
   * @param {string} id - Schedule ID
   * @param {object} updates - Fields to update
   * @returns {boolean} - Success
   */
  updateSchedule(id, updates) {
    const allowed = ['name', 'cronExpression', 'timezone', 'enabled', 'parameters', 'nextRunAt', 'lastRunAt', 'lastRunStatus']
    const sets = []
    const params = []

    for (const [key, value] of Object.entries(updates)) {
      if (allowed.includes(key)) {
        sets.push(`${key} = ?`)
        if (key === 'enabled') {
          params.push(value ? 1 : 0)
        } else if (key === 'parameters') {
          params.push(value ? JSON.stringify(value) : null)
        } else {
          params.push(value)
        }
      }
    }

    if (sets.length === 0) {
      return false
    }

    sets.push('updatedAt = ?')
    params.push(Date.now())
    params.push(id)

    const stmt = this.db.prepare(`
      UPDATE schedules SET ${sets.join(', ')} WHERE id = ?
    `)

    const result = stmt.run(...params)
    return result.changes > 0
  }

  /**
   * Delete schedule
   * @param {string} id - Schedule ID
   * @returns {boolean} - Success
   */
  deleteSchedule(id) {
    const stmt = this.db.prepare('DELETE FROM schedules WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * Get schedules due for execution
   * @param {number} timestamp - Current timestamp
   * @returns {Array} - Schedules due for execution
   */
  getSchedulesDue(timestamp = Date.now()) {
    const stmt = this.db.prepare(`
      SELECT * FROM schedules
      WHERE enabled = 1
        AND nextRunAt IS NOT NULL
        AND nextRunAt <= ?
      ORDER BY nextRunAt ASC
    `)
    const rows = stmt.all(timestamp)
    return rows.map(row => this._deserializeSchedule(row))
  }

  /**
   * Deserialize schedule row from database
   * @private
   */
  _deserializeSchedule(row) {
    return {
      ...row,
      enabled: Boolean(row.enabled),
      parameters: row.parameters ? JSON.parse(row.parameters) : null
    }
  }
}

/**
 * Execution History CRUD Operations
 */
class ExecutionHistoryDB {
  constructor(db) {
    this.db = db
  }

  /**
   * Create execution history entry
   * @param {object} execution - Execution data
   * @returns {string} - Execution ID
   */
  createExecution(execution) {
    const id = randomUUID()

    const stmt = this.db.prepare(`
      INSERT INTO execution_history (
        id, scheduleId, workflowId, trigger, status,
        result, error, startedAt, completedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      execution.scheduleId,
      execution.workflowId,
      execution.trigger,
      execution.status,
      execution.result ? JSON.stringify(execution.result) : null,
      execution.error || null,
      execution.startedAt,
      execution.completedAt || null
    )

    return id
  }

  /**
   * Update execution status
   * @param {string} id - Execution ID
   * @param {object} updates - Fields to update
   * @returns {boolean} - Success
   */
  updateExecution(id, updates) {
    const allowed = ['status', 'result', 'error', 'completedAt']
    const sets = []
    const params = []

    for (const [key, value] of Object.entries(updates)) {
      if (allowed.includes(key)) {
        sets.push(`${key} = ?`)
        if (key === 'result' && value) {
          params.push(JSON.stringify(value))
        } else {
          params.push(value)
        }
      }
    }

    if (sets.length === 0) {
      return false
    }

    params.push(id)

    const stmt = this.db.prepare(`
      UPDATE execution_history SET ${sets.join(', ')} WHERE id = ?
    `)

    const result = stmt.run(...params)
    return result.changes > 0
  }

  /**
   * Get execution history for a schedule
   * @param {string} scheduleId - Schedule ID
   * @param {object} options - Query options
   * @returns {Array} - Execution history
   */
  getExecutionHistory(scheduleId, options = {}) {
    const limit = options.limit || 50
    const offset = options.offset || 0

    const stmt = this.db.prepare(`
      SELECT * FROM execution_history
      WHERE scheduleId = ?
      ORDER BY startedAt DESC
      LIMIT ? OFFSET ?
    `)

    const rows = stmt.all(scheduleId, limit, offset)
    return rows.map(row => this._deserializeExecution(row))
  }

  /**
   * Get execution history for a workflow
   * @param {string} workflowId - Workflow ID
   * @param {object} options - Query options
   * @returns {Array} - Execution history
   */
  getWorkflowExecutionHistory(workflowId, options = {}) {
    const limit = options.limit || 50
    const offset = options.offset || 0

    const stmt = this.db.prepare(`
      SELECT * FROM execution_history
      WHERE workflowId = ?
      ORDER BY startedAt DESC
      LIMIT ? OFFSET ?
    `)

    const rows = stmt.all(workflowId, limit, offset)
    return rows.map(row => this._deserializeExecution(row))
  }

  /**
   * Get all execution history
   * @param {object} filters - Optional filters
   * @returns {Array} - Execution history
   */
  getAllExecutions(filters = {}) {
    let query = 'SELECT * FROM execution_history WHERE 1=1'
    const params = []

    if (filters.status) {
      query += ' AND status = ?'
      params.push(filters.status)
    }

    if (filters.trigger) {
      query += ' AND trigger = ?'
      params.push(filters.trigger)
    }

    if (filters.workflowId) {
      query += ' AND workflowId = ?'
      params.push(filters.workflowId)
    }

    query += ' ORDER BY startedAt DESC LIMIT ?'
    params.push(filters.limit || 100)

    const stmt = this.db.prepare(query)
    const rows = stmt.all(...params)
    return rows.map(row => this._deserializeExecution(row))
  }

  /**
   * Clean up old execution history
   * @param {number} olderThan - Delete executions older than this timestamp
   * @returns {number} - Number of rows deleted
   */
  cleanupOldExecutions(olderThan) {
    const stmt = this.db.prepare(`
      DELETE FROM execution_history
      WHERE completedAt < ?
    `)
    const result = stmt.run(olderThan)
    return result.changes
  }

  /**
   * Deserialize execution row from database
   * @private
   */
  _deserializeExecution(row) {
    return {
      ...row,
      result: row.result ? JSON.parse(row.result) : null
    }
  }
}

/**
 * Database facade with all operations
 */
class SchedulerDatabase {
  constructor(dbPath) {
    this.db = initializeDatabase(dbPath || getDefaultDbPath())
    this.schedules = new ScheduleDB(this.db)
    this.executions = new ExecutionHistoryDB(this.db)
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close()
  }

  /**
   * Run maintenance tasks
   */
  maintenance() {
    // Clean up executions older than 90 days
    const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000)
    const deleted = this.executions.cleanupOldExecutions(ninetyDaysAgo)

    if (deleted > 0) {
      console.log(`[SchedulerDB] Cleaned up ${deleted} old execution records`)
    }

    // Optimize database
    this.db.pragma('optimize')
  }
}

// Export all classes and functions
module.exports = {
  initializeDatabase,
  getDefaultDbPath,
  ScheduleDB,
  ExecutionHistoryDB,
  SchedulerDatabase
}

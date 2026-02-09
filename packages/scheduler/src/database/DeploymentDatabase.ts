/**
 * Deployment Database Schema - Workflow deployment and trigger management
 *
 * Used by both tray mode (Electron) and service mode (standalone Node.js)
 * Location: ~/.prompd/scheduler/schedules.db (shared with legacy schedules)
 */

import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { migrateStatusTerminology } from './migration'
import type {
  DeploymentRecord,
  DeploymentData,
  TriggerRecord,
  TriggerData,
  ExecutionRecord,
  ExecutionData,
  DeploymentVersionRecord,
  DeploymentVersionData,
  DeploymentFilters,
  TriggerFilters,
  ExecutionFilters,
  ExecutionQueryOptions
} from '../types'

/**
 * Initialize deployment database connection and create tables
 */
export function initializeDeploymentDatabase(dbPath: string): Database.Database {
  // Ensure directory exists
  const dir = path.dirname(dbPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const db = new Database(dbPath)

  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL')

  // Create deployments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS deployments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      workflowId TEXT NOT NULL,
      packagePath TEXT NOT NULL,
      packageHash TEXT NOT NULL,
      version TEXT,
      status TEXT NOT NULL,
      deployedAt INTEGER NOT NULL,
      deletedAt INTEGER,
      lastExecutionAt INTEGER,
      lastExecutionStatus TEXT,
      metadata TEXT,
      createdBy TEXT,
      updatedAt INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);
    CREATE INDEX IF NOT EXISTS idx_deployments_workflowId ON deployments(workflowId);
  `)

  // Create triggers table
  db.exec(`
    CREATE TABLE IF NOT EXISTS triggers (
      id TEXT PRIMARY KEY,
      deploymentId TEXT NOT NULL,
      nodeId TEXT NOT NULL,
      triggerType TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      config TEXT NOT NULL,

      scheduleCron TEXT,
      scheduleTimezone TEXT,
      nextRunAt INTEGER,
      webhookPath TEXT,
      webhookSecret TEXT,
      fileWatchPaths TEXT,
      eventName TEXT,

      lastTriggeredAt INTEGER,
      lastTriggerStatus TEXT,
      triggerCount INTEGER DEFAULT 0,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,

      FOREIGN KEY (deploymentId) REFERENCES deployments(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_triggers_deployment ON triggers(deploymentId);
    CREATE INDEX IF NOT EXISTS idx_triggers_type ON triggers(triggerType);
    CREATE INDEX IF NOT EXISTS idx_triggers_enabled ON triggers(enabled);
    CREATE INDEX IF NOT EXISTS idx_triggers_nextRunAt ON triggers(nextRunAt);
    CREATE INDEX IF NOT EXISTS idx_triggers_webhook ON triggers(webhookPath);
  `)

  // Create updated execution_history table for deployments
  db.exec(`
    CREATE TABLE IF NOT EXISTS deployment_executions (
      id TEXT PRIMARY KEY,
      deploymentId TEXT NOT NULL,
      triggerId TEXT,
      workflowId TEXT NOT NULL,
      triggerType TEXT NOT NULL,
      status TEXT NOT NULL,
      result TEXT,
      error TEXT,
      startedAt INTEGER NOT NULL,
      completedAt INTEGER,
      durationMs INTEGER,
      parameters TEXT,
      nodeExecutionLog TEXT,

      FOREIGN KEY (deploymentId) REFERENCES deployments(id) ON DELETE CASCADE,
      FOREIGN KEY (triggerId) REFERENCES triggers(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_dep_exec_deployment ON deployment_executions(deploymentId);
    CREATE INDEX IF NOT EXISTS idx_dep_exec_trigger ON deployment_executions(triggerId);
    CREATE INDEX IF NOT EXISTS idx_dep_exec_completed ON deployment_executions(completedAt);
    CREATE INDEX IF NOT EXISTS idx_dep_exec_status ON deployment_executions(status);
  `)

  // Create deployment versions table (version history for re-deploys)
  db.exec(`
    CREATE TABLE IF NOT EXISTS deployment_versions (
      id TEXT PRIMARY KEY,
      deploymentId TEXT NOT NULL,
      version TEXT,
      packageHash TEXT NOT NULL,
      triggerSnapshot TEXT,
      metadata TEXT,
      deployedAt INTEGER NOT NULL,
      deployedBy TEXT,
      note TEXT,
      FOREIGN KEY (deploymentId) REFERENCES deployments(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_dep_versions_deployment ON deployment_versions(deploymentId, deployedAt DESC);
  `)

  // Run status terminology migration
  migrateStatusTerminology(db)

  return db
}

/**
 * Get default database path
 */
export function getDefaultDbPath(): string {
  return path.join(os.homedir(), '.prompd', 'scheduler', 'schedules.db')
}

/**
 * Deployment CRUD Operations
 */
export class DeploymentDB {
  constructor(private db: Database.Database) {}

  /**
   * Create a new deployment
   */
  create(deployment: DeploymentData): string {
    const id = deployment.id || randomUUID()
    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT INTO deployments (
        id, name, workflowId, packagePath, packageHash, version,
        status, deployedAt, metadata, createdBy, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      deployment.name,
      deployment.workflowId,
      deployment.packagePath,
      deployment.packageHash,
      deployment.version || null,
      deployment.status || 'enabled',
      deployment.deployedAt || now,
      deployment.metadata ? JSON.stringify(deployment.metadata) : null,
      deployment.createdBy || 'user',
      now
    )

    return id
  }

  /**
   * Get deployment by ID
   */
  get(id: string): DeploymentRecord | null {
    const stmt = this.db.prepare('SELECT * FROM deployments WHERE id = ?')
    const row = stmt.get(id) as DeploymentRecord | undefined
    return row ? this._deserialize(row) : null
  }

  /**
   * Get all deployments
   */
  getAll(filters: DeploymentFilters = {}): DeploymentRecord[] {
    let query = 'SELECT * FROM deployments WHERE 1=1'
    const params: unknown[] = []

    if (filters.status) {
      query += ' AND status = ?'
      params.push(filters.status)
    }

    if (filters.workflowId) {
      query += ' AND workflowId = ?'
      params.push(filters.workflowId)
    }

    if (filters.createdBy) {
      query += ' AND createdBy = ?'
      params.push(filters.createdBy)
    }

    query += ' ORDER BY deployedAt DESC'

    const stmt = this.db.prepare(query)
    const rows = stmt.all(...params) as DeploymentRecord[]
    return rows.map(row => this._deserialize(row))
  }

  /**
   * Update deployment
   */
  update(id: string, updates: Partial<Omit<DeploymentData, 'id' | 'workflowId' | 'packagePath' | 'packageHash'>>): boolean {
    const allowed = [
      'name', 'status', 'version', 'deletedAt',
      'lastExecutionAt', 'lastExecutionStatus', 'metadata'
    ]
    const sets: string[] = []
    const params: unknown[] = []

    for (const [key, value] of Object.entries(updates)) {
      if (allowed.includes(key)) {
        sets.push(`${key} = ?`)
        if (key === 'metadata' && value) {
          params.push(JSON.stringify(value))
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
      UPDATE deployments SET ${sets.join(', ')} WHERE id = ?
    `)

    const result = stmt.run(...params)
    return result.changes > 0
  }

  /**
   * Delete deployment
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM deployments WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * Get enabled deployments
   */
  getEnabled(): DeploymentRecord[] {
    return this.getAll({ status: 'enabled' })
  }

  /**
   * Deserialize deployment row from database
   */
  private _deserialize(row: DeploymentRecord): DeploymentRecord {
    return {
      ...row,
      metadata: row.metadata ? row.metadata : null
    }
  }
}

/**
 * Trigger CRUD Operations
 */
export class TriggerDB {
  constructor(private db: Database.Database) {}

  /**
   * Create a new trigger
   */
  create(trigger: TriggerData): string {
    const id = trigger.id || randomUUID()
    const now = Date.now()

    const stmt = this.db.prepare(`
      INSERT INTO triggers (
        id, deploymentId, nodeId, triggerType, enabled, config,
        scheduleCron, scheduleTimezone, nextRunAt, webhookPath, webhookSecret,
        fileWatchPaths, eventName, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      trigger.deploymentId,
      trigger.nodeId,
      trigger.triggerType,
      trigger.enabled !== undefined ? (trigger.enabled ? 1 : 0) : 1,
      JSON.stringify(trigger.config),
      trigger.scheduleCron || null,
      trigger.scheduleTimezone || null,
      trigger.nextRunAt || null,
      trigger.webhookPath || null,
      trigger.webhookSecret || null,
      trigger.fileWatchPaths || null,
      trigger.eventName || null,
      now,
      now
    )

    return id
  }

  /**
   * Get trigger by ID
   */
  get(id: string): TriggerRecord | null {
    const stmt = this.db.prepare('SELECT * FROM triggers WHERE id = ?')
    const row = stmt.get(id) as TriggerRecord | undefined
    return row ? this._deserialize(row) : null
  }

  /**
   * Get triggers by deployment ID
   */
  getByDeployment(deploymentId: string): TriggerRecord[] {
    const stmt = this.db.prepare('SELECT * FROM triggers WHERE deploymentId = ?')
    const rows = stmt.all(deploymentId) as TriggerRecord[]
    return rows.map(row => this._deserialize(row))
  }

  /**
   * Get all triggers
   */
  getAll(filters: TriggerFilters = {}): TriggerRecord[] {
    let query = 'SELECT * FROM triggers WHERE 1=1'
    const params: unknown[] = []

    if (filters.deploymentId) {
      query += ' AND deploymentId = ?'
      params.push(filters.deploymentId)
    }

    if (filters.triggerType) {
      query += ' AND triggerType = ?'
      params.push(filters.triggerType)
    }

    if (filters.enabled !== undefined) {
      query += ' AND enabled = ?'
      params.push(filters.enabled ? 1 : 0)
    }

    query += ' ORDER BY createdAt DESC'

    const stmt = this.db.prepare(query)
    const rows = stmt.all(...params) as TriggerRecord[]
    return rows.map(row => this._deserialize(row))
  }

  /**
   * Update trigger
   */
  update(id: string, updates: Partial<Omit<TriggerData, 'id' | 'deploymentId' | 'nodeId' | 'triggerType'>>): boolean {
    const allowed = [
      'enabled', 'config', 'scheduleCron', 'scheduleTimezone', 'nextRunAt',
      'webhookPath', 'webhookSecret', 'fileWatchPaths', 'eventName',
      'lastTriggeredAt', 'lastTriggerStatus', 'triggerCount'
    ]
    const sets: string[] = []
    const params: unknown[] = []

    for (const [key, value] of Object.entries(updates)) {
      if (allowed.includes(key)) {
        sets.push(`${key} = ?`)
        if (key === 'enabled') {
          params.push(value ? 1 : 0)
        } else if (key === 'config' && value) {
          params.push(JSON.stringify(value))
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
      UPDATE triggers SET ${sets.join(', ')} WHERE id = ?
    `)

    const result = stmt.run(...params)
    return result.changes > 0
  }

  /**
   * Delete trigger
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM triggers WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * Delete all triggers for a deployment
   */
  deleteByDeployment(deploymentId: string): number {
    const stmt = this.db.prepare('DELETE FROM triggers WHERE deploymentId = ?')
    const result = stmt.run(deploymentId)
    return result.changes
  }

  /**
   * Get triggers due for execution (schedule type)
   */
  getDueSchedules(timestamp: number = Date.now()): TriggerRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM triggers
      WHERE triggerType = 'schedule'
        AND enabled = 1
        AND nextRunAt IS NOT NULL
        AND nextRunAt <= ?
      ORDER BY nextRunAt ASC
    `)
    const rows = stmt.all(timestamp) as TriggerRecord[]
    return rows.map(row => this._deserialize(row))
  }

  /**
   * Increment trigger count
   */
  incrementCount(id: string): boolean {
    const stmt = this.db.prepare(`
      UPDATE triggers
      SET triggerCount = triggerCount + 1,
          lastTriggeredAt = ?,
          updatedAt = ?
      WHERE id = ?
    `)
    const now = Date.now()
    const result = stmt.run(now, now, id)
    return result.changes > 0
  }

  /**
   * Deserialize trigger row from database
   */
  private _deserialize(row: TriggerRecord): TriggerRecord {
    return {
      ...row,
      enabled: Boolean(row.enabled),
      config: row.config || null
    }
  }
}

/**
 * Deployment Execution History CRUD Operations
 */
export class DeploymentExecutionDB {
  constructor(private db: Database.Database) {}

  /**
   * Create execution history entry
   */
  create(execution: ExecutionData): string {
    const id = execution.id || randomUUID()

    const stmt = this.db.prepare(`
      INSERT INTO deployment_executions (
        id, deploymentId, triggerId, workflowId, triggerType, status,
        result, error, startedAt, completedAt, durationMs, parameters, nodeExecutionLog
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      execution.deploymentId,
      execution.triggerId || null,
      execution.workflowId,
      execution.triggerType,
      execution.status,
      execution.result ? JSON.stringify(execution.result) : null,
      execution.error || null,
      execution.startedAt,
      execution.completedAt || null,
      execution.durationMs || null,
      execution.parameters ? JSON.stringify(execution.parameters) : null,
      execution.nodeExecutionLog ? JSON.stringify(execution.nodeExecutionLog) : null
    )

    return id
  }

  /**
   * Update execution
   */
  update(id: string, updates: Partial<Omit<ExecutionData, 'id' | 'deploymentId' | 'workflowId' | 'triggerType'>>): boolean {
    const allowed = ['status', 'result', 'error', 'completedAt', 'durationMs', 'nodeExecutionLog']
    const sets: string[] = []
    const params: unknown[] = []

    for (const [key, value] of Object.entries(updates)) {
      if (allowed.includes(key)) {
        sets.push(`${key} = ?`)
        if ((key === 'result' || key === 'nodeExecutionLog') && value) {
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
      UPDATE deployment_executions SET ${sets.join(', ')} WHERE id = ?
    `)

    const result = stmt.run(...params)
    return result.changes > 0
  }

  /**
   * Get execution by ID
   */
  get(id: string): ExecutionRecord | null {
    const stmt = this.db.prepare('SELECT * FROM deployment_executions WHERE id = ?')
    const row = stmt.get(id) as ExecutionRecord | undefined
    return row ? this._deserialize(row) : null
  }

  /**
   * Get execution history for a deployment
   */
  getByDeployment(deploymentId: string, options: ExecutionQueryOptions = {}): ExecutionRecord[] {
    const limit = options.limit || 50
    const offset = options.offset || 0

    const stmt = this.db.prepare(`
      SELECT * FROM deployment_executions
      WHERE deploymentId = ?
      ORDER BY startedAt DESC
      LIMIT ? OFFSET ?
    `)

    const rows = stmt.all(deploymentId, limit, offset) as ExecutionRecord[]
    return rows.map(row => this._deserialize(row))
  }

  /**
   * Get execution history for a trigger
   */
  getByTrigger(triggerId: string, options: ExecutionQueryOptions = {}): ExecutionRecord[] {
    const limit = options.limit || 50
    const offset = options.offset || 0

    const stmt = this.db.prepare(`
      SELECT * FROM deployment_executions
      WHERE triggerId = ?
      ORDER BY startedAt DESC
      LIMIT ? OFFSET ?
    `)

    const rows = stmt.all(triggerId, limit, offset) as ExecutionRecord[]
    return rows.map(row => this._deserialize(row))
  }

  /**
   * Get all executions
   */
  getAll(filters: ExecutionFilters = {}): ExecutionRecord[] {
    let query = 'SELECT * FROM deployment_executions WHERE 1=1'
    const params: unknown[] = []

    if (filters.status) {
      query += ' AND status = ?'
      params.push(filters.status)
    }

    if (filters.triggerType) {
      query += ' AND triggerType = ?'
      params.push(filters.triggerType)
    }

    if (filters.workflowId) {
      query += ' AND workflowId = ?'
      params.push(filters.workflowId)
    }

    query += ' ORDER BY startedAt DESC LIMIT ? OFFSET ?'
    params.push(filters.limit || 100)
    params.push(filters.offset || 0)

    const stmt = this.db.prepare(query)
    const rows = stmt.all(...params) as ExecutionRecord[]
    return rows.map(row => this._deserialize(row))
  }

  /**
   * Get total count of executions (for pagination)
   */
  getCount(filters: ExecutionFilters = {}): number {
    let query = 'SELECT COUNT(*) as count FROM deployment_executions WHERE 1=1'
    const params: unknown[] = []

    if (filters.status) {
      query += ' AND status = ?'
      params.push(filters.status)
    }

    if (filters.triggerType) {
      query += ' AND triggerType = ?'
      params.push(filters.triggerType)
    }

    if (filters.workflowId) {
      query += ' AND workflowId = ?'
      params.push(filters.workflowId)
    }

    const stmt = this.db.prepare(query)
    const result = stmt.get(...params) as { count: number }
    return result.count
  }

  /**
   * Mark stale running executions as cancelled
   */
  cancelStaleExecutions(options: { all?: boolean; staleDurationMs?: number } = {}): number {
    const cancelAll = options.all !== false
    const now = Date.now()

    let query = `
      UPDATE deployment_executions
      SET status = 'cancelled',
          error = 'Execution cancelled due to app restart',
          completedAt = ?
      WHERE status = 'running'
        AND completedAt IS NULL
    `

    const params: unknown[] = [now]

    if (!cancelAll && options.staleDurationMs) {
      const staleThreshold = now - options.staleDurationMs
      query += ' AND startedAt < ?'
      params.push(staleThreshold)
    }

    const stmt = this.db.prepare(query)
    const result = stmt.run(...params)
    return result.changes
  }

  /**
   * Cancel running executions for a specific deployment
   */
  cancelRunningExecutions(deploymentId: string): number {
    const now = Date.now()

    const stmt = this.db.prepare(`
      UPDATE deployment_executions
      SET status = 'cancelled',
          error = 'Execution cancelled - deployment was undeployed',
          completedAt = ?
      WHERE deploymentId = ?
        AND status = 'running'
        AND completedAt IS NULL
    `)

    const result = stmt.run(now, deploymentId)
    return result.changes
  }

  /**
   * Clean up old execution history
   */
  cleanup(olderThan: number): number {
    const stmt = this.db.prepare(`
      DELETE FROM deployment_executions
      WHERE completedAt < ?
    `)
    const result = stmt.run(olderThan)
    return result.changes
  }

  /**
   * Clear all execution history
   */
  clearAll(): number {
    const stmt = this.db.prepare('DELETE FROM deployment_executions')
    const result = stmt.run()
    return result.changes
  }

  /**
   * Deserialize execution row from database
   */
  private _deserialize(row: ExecutionRecord): ExecutionRecord {
    return {
      ...row,
      result: row.result || null,
      parameters: row.parameters || null,
      nodeExecutionLog: row.nodeExecutionLog || null
    }
  }
}

/**
 * Deployment Version History CRUD Operations
 */
export class DeploymentVersionDB {
  constructor(private db: Database.Database) {}

  /**
   * Create a version history entry
   */
  create(version: DeploymentVersionData): string {
    const id = version.id || randomUUID()

    const stmt = this.db.prepare(`
      INSERT INTO deployment_versions (
        id, deploymentId, version, packageHash, triggerSnapshot,
        metadata, deployedAt, deployedBy, note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      version.deploymentId,
      version.version || null,
      version.packageHash,
      version.triggerSnapshot || null,
      version.metadata || null,
      version.deployedAt,
      version.deployedBy || null,
      version.note || null
    )

    return id
  }

  /**
   * Get a single version by ID
   */
  get(id: string): DeploymentVersionRecord | null {
    const stmt = this.db.prepare('SELECT * FROM deployment_versions WHERE id = ?')
    const row = stmt.get(id) as DeploymentVersionRecord | undefined
    return row || null
  }

  /**
   * Get version history for a deployment (newest first)
   */
  getByDeployment(deploymentId: string, options: { limit?: number; offset?: number } = {}): DeploymentVersionRecord[] {
    const limit = options.limit || 50
    const offset = options.offset || 0

    const stmt = this.db.prepare(`
      SELECT * FROM deployment_versions
      WHERE deploymentId = ?
      ORDER BY deployedAt DESC
      LIMIT ? OFFSET ?
    `)

    return stmt.all(deploymentId, limit, offset) as DeploymentVersionRecord[]
  }

  /**
   * Delete a single version
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM deployment_versions WHERE id = ?')
    const result = stmt.run(id)
    return result.changes > 0
  }

  /**
   * Delete all versions for a deployment
   */
  deleteByDeployment(deploymentId: string): number {
    const stmt = this.db.prepare('DELETE FROM deployment_versions WHERE deploymentId = ?')
    const result = stmt.run(deploymentId)
    return result.changes
  }
}

/**
 * Deployment Database facade with all operations
 */
export class DeploymentDatabase {
  public deployments: DeploymentDB
  public triggers: TriggerDB
  public executions: DeploymentExecutionDB
  public versions: DeploymentVersionDB
  private db: Database.Database

  constructor(dbPath?: string) {
    this.db = initializeDeploymentDatabase(dbPath || getDefaultDbPath())
    this.deployments = new DeploymentDB(this.db)
    this.triggers = new TriggerDB(this.db)
    this.executions = new DeploymentExecutionDB(this.db)
    this.versions = new DeploymentVersionDB(this.db)
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close()
  }

  /**
   * Run maintenance tasks
   */
  maintenance(): void {
    // Clean up executions older than 90 days
    const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000)
    const deleted = this.executions.cleanup(ninetyDaysAgo)

    if (deleted > 0) {
      console.log(`[DeploymentDB] Cleaned up ${deleted} old execution records`)
    }

    // Optimize database
    this.db.pragma('optimize')
  }
}

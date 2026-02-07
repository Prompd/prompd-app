/**
 * Migration Script: schedules → deployments
 *
 * Migrates existing schedule-based system to deployment-based system
 */

import Database from 'better-sqlite3'
import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'
import type { ParsedWorkflow, WorkflowNode } from '../types'

interface ScheduleRecord {
  id: string
  name: string
  workflowId: string
  workflowPath: string
  cronExpression: string
  timezone?: string
  enabled: number
  createdAt: number
  nextRunAt?: number
}

interface MigrationResult {
  success: boolean
  migratedCount: number
  skippedCount: number
  errors: Array<{ scheduleId?: string; scheduleName?: string; error: string; stack?: string }>
  backupCreated: boolean
  alreadyMigrated?: boolean
}

interface VerificationResult {
  success: boolean
  errors: string[]
  statistics: {
    originalSchedules: number
    migratedDeployments: number
    migratedTriggers: number
    originalExecutions: number
    migratedExecutions: number
  }
}

interface RollbackResult {
  success: boolean
  error: string | null
}

/**
 * Run migration from schedules to deployments
 */
export function migrateSchedulesToDeployments(db: Database.Database): MigrationResult {
  console.log('[Migration] Starting schedule → deployment migration...')

  const result: MigrationResult = {
    success: false,
    migratedCount: 0,
    skippedCount: 0,
    errors: [],
    backupCreated: false
  }

  try {
    // Check if deployments table exists
    const tableCheck = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='deployments'
    `).get()

    if (!tableCheck) {
      result.errors.push({ error: 'Deployments table does not exist. Initialize database first.' })
      return result
    }

    // Check if we've already migrated (check for backup table)
    const backupCheck = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='schedules_backup'
    `).get()

    if (backupCheck) {
      console.log('[Migration] Migration already completed (backup table exists)')
      result.success = true
      result.alreadyMigrated = true
      return result
    }

    // Get all schedules
    const schedules = db.prepare('SELECT * FROM schedules').all() as ScheduleRecord[]

    if (schedules.length === 0) {
      console.log('[Migration] No schedules to migrate')
      result.success = true
      return result
    }

    console.log(`[Migration] Found ${schedules.length} schedules to migrate`)

    // Migrate each schedule
    for (const schedule of schedules) {
      try {
        migrateSchedule(db, schedule, result)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error(`[Migration] Failed to migrate schedule ${schedule.id}:`, errorMessage)
        result.errors.push({
          scheduleId: schedule.id,
          scheduleName: schedule.name,
          error: errorMessage
        })
        result.skippedCount++
      }
    }

    // Create backup tables
    console.log('[Migration] Creating backup tables...')
    db.exec('ALTER TABLE schedules RENAME TO schedules_backup')
    db.exec('ALTER TABLE execution_history RENAME TO execution_history_backup')
    result.backupCreated = true

    console.log(`[Migration] Complete! Migrated ${result.migratedCount} schedules, skipped ${result.skippedCount}`)
    result.success = true

    return result
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    console.error('[Migration] Migration failed:', error)
    result.errors.push({ error: errorMessage, stack: errorStack })
    return result
  }
}

/**
 * Migrate a single schedule to deployment
 */
function migrateSchedule(db: Database.Database, schedule: ScheduleRecord, result: MigrationResult): void {
  // 1. Read workflow file
  const workflowPath = schedule.workflowPath
  if (!fs.existsSync(workflowPath)) {
    throw new Error(`Workflow file not found: ${workflowPath}`)
  }

  const workflowContent = fs.readFileSync(workflowPath, 'utf-8')
  let workflow: ParsedWorkflow
  try {
    workflow = JSON.parse(workflowContent)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid workflow JSON: ${errorMessage}`)
  }

  // 2. Find trigger node
  let triggerNode: WorkflowNode | undefined = workflow.nodes?.find(n => n.type === 'trigger')
  if (!triggerNode) {
    console.warn(`[Migration] No trigger node in workflow: ${workflowPath}`)
    // Create a default trigger node from schedule
    triggerNode = {
      id: 'migrated-trigger',
      type: 'trigger',
      data: {
        triggerType: 'schedule',
        scheduleCron: schedule.cronExpression,
        scheduleTimezone: schedule.timezone || 'UTC',
        scheduleEnabled: Boolean(schedule.enabled)
      }
    }
  }

  // 3. Calculate package hash (simple hash for migrated deployments)
  const packagePath = path.dirname(workflowPath)
  const packageHash = `migrated-${Date.now()}-${randomUUID().slice(0, 8)}`

  // 4. Create deployment record
  const deploymentId = randomUUID()
  const deploymentStmt = db.prepare(`
    INSERT INTO deployments (
      id, name, workflowId, packagePath, packageHash, version,
      status, deployedAt, metadata, createdBy, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  deploymentStmt.run(
    deploymentId,
    schedule.name,
    schedule.workflowId,
    packagePath,
    packageHash,
    workflow.metadata?.version || '1.0.0',
    schedule.enabled ? 'enabled' : 'disabled',
    schedule.createdAt,
    JSON.stringify(workflow.metadata || {}),
    'migration',
    Date.now()
  )

  // 5. Create trigger record from schedule
  const triggerId = randomUUID()
  const triggerStmt = db.prepare(`
    INSERT INTO triggers (
      id, deploymentId, nodeId, triggerType, enabled, config,
      scheduleCron, scheduleTimezone, nextRunAt, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const triggerConfig = triggerNode.data || {
    triggerType: 'schedule',
    scheduleCron: schedule.cronExpression,
    scheduleTimezone: schedule.timezone || 'UTC'
  }

  triggerStmt.run(
    triggerId,
    deploymentId,
    triggerNode.id,
    'schedule',
    schedule.enabled ? 1 : 0,
    JSON.stringify(triggerConfig),
    schedule.cronExpression,
    schedule.timezone || 'UTC',
    schedule.nextRunAt || null,
    schedule.createdAt,
    Date.now()
  )

  // 6. Migrate execution history
  migrateExecutionHistory(db, schedule.id, deploymentId, triggerId)

  console.log(`[Migration] Migrated schedule: ${schedule.name} → ${deploymentId}`)
  result.migratedCount++
}

/**
 * Migrate execution history for a schedule
 */
function migrateExecutionHistory(
  db: Database.Database,
  scheduleId: string,
  deploymentId: string,
  triggerId: string
): void {
  // Get executions for this schedule
  const executions = db.prepare(`
    SELECT * FROM execution_history WHERE scheduleId = ?
  `).all(scheduleId) as Array<{
    id: string
    workflowId: string
    trigger: string
    status: string
    result?: string
    error?: string
    startedAt: number
    completedAt?: number
  }>

  if (executions.length === 0) {
    return
  }

  // Insert into deployment_executions
  const insertStmt = db.prepare(`
    INSERT INTO deployment_executions (
      id, deploymentId, triggerId, workflowId, triggerType, status,
      result, error, startedAt, completedAt, durationMs, parameters
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  for (const execution of executions) {
    const durationMs = execution.completedAt
      ? execution.completedAt - execution.startedAt
      : null

    insertStmt.run(
      execution.id,
      deploymentId,
      triggerId,
      execution.workflowId,
      execution.trigger,
      execution.status,
      execution.result || null,
      execution.error || null,
      execution.startedAt,
      execution.completedAt || null,
      durationMs,
      null // No parameters in old schema
    )
  }

  console.log(`[Migration] Migrated ${executions.length} execution records`)
}

/**
 * Rollback migration (restore from backup)
 */
export function rollbackMigration(db: Database.Database): RollbackResult {
  console.log('[Migration] Rolling back migration...')

  const result: RollbackResult = {
    success: false,
    error: null
  }

  try {
    // Check if backup exists
    const backupCheck = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='schedules_backup'
    `).get()

    if (!backupCheck) {
      result.error = 'No backup table found. Cannot rollback.'
      return result
    }

    // Drop new tables
    db.exec('DROP TABLE IF EXISTS deployment_executions')
    db.exec('DROP TABLE IF EXISTS triggers')
    db.exec('DROP TABLE IF EXISTS deployments')

    // Restore backup tables
    db.exec('ALTER TABLE schedules_backup RENAME TO schedules')
    db.exec('ALTER TABLE execution_history_backup RENAME TO execution_history')

    console.log('[Migration] Rollback complete')
    result.success = true

    return result
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[Migration] Rollback failed:', error)
    result.error = errorMessage
    return result
  }
}

/**
 * Migrate status terminology: active/paused/undeployed → enabled/disabled/deleted
 */
export function migrateStatusTerminology(db: Database.Database): { success: boolean; error: string | null } {
  console.log('[Migration] Updating status terminology...')

  try {
    // Check if migration already applied (look for 'enabled' status)
    const check = db.prepare(`SELECT COUNT(*) as count FROM deployments WHERE status = 'enabled'`).get() as { count: number }

    if (check.count > 0) {
      console.log('[Migration] Status terminology already migrated')
      return { success: true, error: null }
    }

    // Begin transaction
    db.exec('BEGIN TRANSACTION')

    try {
      // Update status values
      db.prepare(`UPDATE deployments SET status = 'enabled' WHERE status = 'active'`).run()
      db.prepare(`UPDATE deployments SET status = 'disabled' WHERE status = 'paused'`).run()
      db.prepare(`UPDATE deployments SET status = 'deleted' WHERE status = 'undeployed'`).run()

      // Add deletedAt column if it doesn't exist
      try {
        db.exec(`ALTER TABLE deployments ADD COLUMN deletedAt INTEGER`)
      } catch (error) {
        // Column may already exist, ignore error
        const errorMessage = error instanceof Error ? error.message : String(error)
        if (!errorMessage.includes('duplicate column')) {
          throw error
        }
      }

      // Copy undeployedAt to deletedAt
      db.exec(`UPDATE deployments SET deletedAt = undeployedAt WHERE undeployedAt IS NOT NULL`)

      db.exec('COMMIT')

      const updated = db.prepare(`SELECT COUNT(*) as count FROM deployments WHERE status IN ('enabled', 'disabled', 'deleted')`).get() as { count: number }
      console.log(`[Migration] Updated ${updated.count} deployment status records`)

      return { success: true, error: null }
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[Migration] Status terminology migration failed:', error)
    return { success: false, error: errorMessage }
  }
}

/**
 * Verify migration integrity
 */
export function verifyMigration(db: Database.Database): VerificationResult {
  console.log('[Migration] Verifying migration...')

  const result: VerificationResult = {
    success: true,
    errors: [],
    statistics: {
      originalSchedules: 0,
      migratedDeployments: 0,
      migratedTriggers: 0,
      originalExecutions: 0,
      migratedExecutions: 0
    }
  }

  try {
    // Count records
    const backupSchedules = db.prepare('SELECT COUNT(*) as count FROM schedules_backup').get() as { count: number }
    const deployments = db.prepare('SELECT COUNT(*) as count FROM deployments WHERE createdBy = "migration"').get() as { count: number }
    const triggers = db.prepare('SELECT COUNT(*) as count FROM triggers').get() as { count: number }
    const backupExecutions = db.prepare('SELECT COUNT(*) as count FROM execution_history_backup').get() as { count: number }
    const newExecutions = db.prepare('SELECT COUNT(*) as count FROM deployment_executions').get() as { count: number }

    result.statistics = {
      originalSchedules: backupSchedules.count,
      migratedDeployments: deployments.count,
      migratedTriggers: triggers.count,
      originalExecutions: backupExecutions.count,
      migratedExecutions: newExecutions.count
    }

    // Verify counts match
    if (backupSchedules.count !== deployments.count) {
      result.errors.push(`Schedule count mismatch: ${backupSchedules.count} → ${deployments.count}`)
      result.success = false
    }

    if (backupExecutions.count !== newExecutions.count) {
      result.errors.push(`Execution count mismatch: ${backupExecutions.count} → ${newExecutions.count}`)
      result.success = false
    }

    // Verify all deployments have triggers
    const deploymentsWithoutTriggers = db.prepare(`
      SELECT d.id, d.name
      FROM deployments d
      LEFT JOIN triggers t ON d.id = t.deploymentId
      WHERE d.createdBy = 'migration' AND t.id IS NULL
    `).all() as Array<{ id: string; name: string }>

    if (deploymentsWithoutTriggers.length > 0) {
      result.errors.push(`${deploymentsWithoutTriggers.length} deployments have no triggers`)
      result.success = false
    }

    console.log('[Migration] Verification complete')
    console.log('Statistics:', result.statistics)

    if (result.errors.length > 0) {
      console.error('Verification errors:', result.errors)
    }

    return result
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[Migration] Verification failed:', error)
    result.success = false
    result.errors.push(errorMessage)
    return result
  }
}

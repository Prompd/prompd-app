/**
 * DeploymentService - Manages workflow deployments and trigger registration
 *
 * Handles:
 * - Package extraction to ~/.prompd/workflows/{id}/
 * - Workflow and manifest reading
 * - Trigger extraction from TriggerNode
 * - Deployment lifecycle (deploy, delete, purge, status)
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { randomUUID } from 'crypto'
import * as crypto from 'crypto'
import AdmZip from 'adm-zip'
import { DeploymentDatabase } from './database/DeploymentDatabase'
import { TriggerManager } from './TriggerManager'
import { DeploymentDependencyResolver } from './DeploymentDependencyResolver'
import type {
  DeploymentOptions,
  DeploymentRecord,
  TriggerRecord,
  DeploymentServiceOptions,
  DeploymentStatus,
  ParsedWorkflow,
  WorkflowNode,
  ExecutionResult,
  TriggerEventContext,
  TriggerConfiguration,
  DeploymentFilters,
  ExecutionQueryOptions,
  ExecutionPage,
  WorkflowParameters
} from './types'

interface PackageManifest {
  name?: string
  version?: string
  dependencies?: Record<string, string>
  main?: string
  [key: string]: unknown
}

interface RegistryClient {
  install(packageSpec: string, options: { workspaceRoot: string; skipCache: boolean }): Promise<void>
}

export class DeploymentService {
  private dbPath?: string
  private db: DeploymentDatabase
  private executeWorkflow?: (
    deployment: DeploymentRecord,
    trigger: TriggerRecord | { triggerType: 'manual' },
    context: TriggerEventContext
  ) => Promise<ExecutionResult>
  private deploymentsPath: string
  private triggerManager: TriggerManager

  constructor(options: DeploymentServiceOptions = {}) {
    this.dbPath = options.dbPath
    this.db = new DeploymentDatabase(this.dbPath)
    this.executeWorkflow = options.executeWorkflow
    this.deploymentsPath = options.deploymentsPath || path.join(os.homedir(), '.prompd', 'workflows')

    // Ensure deployments directory exists
    if (!fs.existsSync(this.deploymentsPath)) {
      fs.mkdirSync(this.deploymentsPath, { recursive: true })
    }

    // Create trigger manager with callback to execute workflows
    this.triggerManager = new TriggerManager({
      onTrigger: (triggerId, context) => this.handleTrigger(triggerId, context)
    })

    // Clean up stale "running" executions on startup
    const cancelledCount = this.db.executions.cancelStaleExecutions()
    if (cancelledCount > 0) {
      console.log(`[DeploymentService] Marked ${cancelledCount} stale execution(s) as cancelled`)
    }

    // Re-register all active triggers at startup
    this.reregisterAllTriggers()
  }

  /**
   * Re-register all enabled triggers from active deployments at startup
   */
  private async reregisterAllTriggers(): Promise<void> {
    console.log('[DeploymentService] Re-registering all active triggers')

    const enabledDeployments = this.db.deployments.getAll({ status: 'enabled' })
    let registeredCount = 0

    for (const deployment of enabledDeployments) {
      const triggers = this.db.triggers.getByDeployment(deployment.id)

      for (const trigger of triggers) {
        if (!trigger.enabled || trigger.triggerType === 'manual') {
          continue
        }

        try {
          const triggerData: TriggerConfiguration = {
            ...(trigger.config ? JSON.parse(trigger.config) : {}),
            triggerType: trigger.triggerType,
            scheduleCron: trigger.scheduleCron || undefined,
            scheduleTimezone: trigger.scheduleTimezone || undefined,
            webhookPath: trigger.webhookPath || undefined,
            webhookSecret: trigger.webhookSecret || undefined,
            eventName: trigger.eventName || undefined
          }

          if (trigger.fileWatchPaths) {
            try {
              triggerData.fileWatchPaths = JSON.parse(trigger.fileWatchPaths)
            } catch (e) {
              triggerData.fileWatchPaths = []
            }
          }

          await this.triggerManager.register(trigger.id, triggerData, {
            deploymentId: deployment.id,
            workflowId: deployment.workflowId,
            packagePath: deployment.packagePath
          })

          registeredCount++
          console.log(`[DeploymentService] Re-registered ${trigger.triggerType} trigger: ${trigger.id}`)
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err)
          console.error(`[DeploymentService] Failed to re-register trigger ${trigger.id}:`, errorMessage)
        }
      }
    }

    console.log(`[DeploymentService] Re-registered ${registeredCount} trigger(s)`)
  }

  /**
   * Deploy a workflow package
   */
  async deploy(packagePath: string, options: DeploymentOptions = {}): Promise<string> {
    console.log(`[DeploymentService] Deploying from: ${packagePath}`)

    // Extract to temporary location first to read workflow metadata
    const tempDir = path.join(this.deploymentsPath, `temp-${randomUUID()}`)

    try {
      // 1. Extract or copy package to temp location
      await this.extractPackage(packagePath, tempDir)

      // 2. Read workflow file and manifest
      const workflowFile = await this.findWorkflowFile(tempDir)
      const workflowPath = path.join(tempDir, workflowFile)
      const workflow: ParsedWorkflow = JSON.parse(fs.readFileSync(workflowPath, 'utf-8'))

      let manifest: PackageManifest | null = null
      const manifestPath = path.join(tempDir, 'prompd.json')
      if (fs.existsSync(manifestPath)) {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))

        // Inject dependencies from options if provided (CLI strips them during packaging)
        if (manifest && options.dependencies && Object.keys(options.dependencies).length > 0) {
          console.log(`[DeploymentService] Injecting ${Object.keys(options.dependencies).length} dependencies into manifest`)
          manifest.dependencies = options.dependencies
          // Write updated manifest back to temp directory
          fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')
        }
      }

      // 3. Validate workflow has trigger node
      const triggerNode = workflow.nodes?.find(n => n.type === 'trigger')
      if (!triggerNode) {
        throw new Error('Workflow must have a trigger node')
      }

      // 4. Get workflow ID from metadata
      const workflowId = workflow.metadata?.id || randomUUID()

      // 5. Check if deployment already exists with this workflow ID
      const existingDeployments = this.db.deployments.getAll({ workflowId })
      const enabledDeployment = existingDeployments.find(d => d.status !== 'deleted')
      const deletedDeployment = existingDeployments.find(d => d.status === 'deleted')

      let deploymentId: string
      let deploymentDir: string
      let isUpdate = false

      if (enabledDeployment) {
        // Update existing active/paused deployment
        console.log(`[DeploymentService] Updating existing deployment: ${enabledDeployment.id}`)
        deploymentId = enabledDeployment.id
        deploymentDir = path.join(this.deploymentsPath, deploymentId)
        isUpdate = true

        // Unregister existing triggers
        const triggers = this.db.triggers.getByDeployment(deploymentId)
        for (const trigger of triggers) {
          if (this.triggerManager) {
            await this.triggerManager.unregister(trigger.id)
          }
        }

        // Delete existing triggers from database
        this.db.triggers.deleteByDeployment(deploymentId)

        // Clean up old deployment directory
        if (fs.existsSync(deploymentDir)) {
          fs.rmSync(deploymentDir, { recursive: true, force: true })
        }
      } else if (deletedDeployment) {
        // Reactivate deleted deployment (restore from deleted state)
        console.log(`[DeploymentService] Reactivating deleted deployment: ${deletedDeployment.id}`)
        deploymentId = deletedDeployment.id
        deploymentDir = path.join(this.deploymentsPath, deploymentId)
        isUpdate = true

        // Unregister existing triggers
        const triggers = this.db.triggers.getByDeployment(deploymentId)
        for (const trigger of triggers) {
          if (this.triggerManager) {
            await this.triggerManager.unregister(trigger.id)
          }
        }

        // Delete existing triggers from database
        this.db.triggers.deleteByDeployment(deploymentId)

        // Clean up old deployment directory if it exists
        if (fs.existsSync(deploymentDir)) {
          fs.rmSync(deploymentDir, { recursive: true, force: true })
        }
      } else {
        // Create new deployment
        deploymentId = randomUUID()
        deploymentDir = path.join(this.deploymentsPath, deploymentId)
      }

      // 6. Move temp directory to final location
      fs.renameSync(tempDir, deploymentDir)

      // 7. Resolve and copy all referenced files from .prmd files
      // Pass original package path for resolving external dependencies
      await this.resolveDependencies(deploymentDir, workflowFile, packagePath)

      // 8. Install dependencies if present in manifest
      if (manifest && manifest.dependencies && Object.keys(manifest.dependencies).length > 0) {
        console.log(`[DeploymentService] Installing ${Object.keys(manifest.dependencies).length} dependencies...`)
        await this.installDependencies(deploymentDir, manifest.dependencies)
      }

      // 9. Calculate package hash for integrity
      const packageHash = await this.calculatePackageHash(deploymentDir)

      // 10. Create or update deployment record
      if (isUpdate) {
        const existingDeployment = enabledDeployment || deletedDeployment
        if (existingDeployment) {
          this.db.deployments.update(deploymentId, {
            name: options.name || workflow.metadata?.name || existingDeployment.name,
            version: manifest?.version || workflow.metadata?.version || '1.0.0',
            status: options.enabled !== false ? 'enabled' : 'disabled',
            metadata: workflow.metadata || {}
          })
        }
      } else {
        this.db.deployments.create({
          id: deploymentId,
          name: options.name || workflow.metadata?.name || 'Unnamed Workflow',
          workflowId,
          packagePath: deploymentDir,
          packageHash,
          version: manifest?.version || workflow.metadata?.version || '1.0.0',
          status: options.enabled !== false ? 'enabled' : 'disabled',
          metadata: workflow.metadata || {},
          createdBy: options.createdBy || 'user'
        })
      }

      // 11. Extract and register triggers
      await this.extractTriggers(deploymentId, workflow, triggerNode)

      console.log(`[DeploymentService] ${isUpdate ? 'Updated' : 'Deployed'}: ${workflow.metadata?.name} (${deploymentId})`)

      return deploymentId
    } catch (error) {
      console.error(`[DeploymentService] Deployment failed:`, error)

      // Cleanup temp directory on failure
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true })
      }

      throw error
    }
  }

  /**
   * Resolve and copy all dependencies from .prmd files
   */
  private async resolveDependencies(deploymentDir: string, workflowFile: string, _originalPackagePath?: string): Promise<void> {
    console.log('[DeploymentService] Resolving workflow dependencies...')

    // All referenced files should already be in the deployment directory
    // (packageWorkflow.js traces the full dependency tree and includes everything)
    // This method resolves package dependencies and verifies file integrity

    // Find all .prmd files in the deployment directory
    const allFiles = this.getFilesRecursively(deploymentDir)
    const prmdFiles = allFiles.filter(f => f.endsWith('.prmd'))

    if (prmdFiles.length === 0) {
      console.log('[DeploymentService] No .prmd files found - skipping dependency resolution')
      return
    }

    console.log(`[DeploymentService] Found ${prmdFiles.length} .prmd file(s) to scan for dependencies`)

    // Create resolver instance
    const resolver = new DeploymentDependencyResolver()

    // Track all package dependencies to install
    const allPackages = new Set<string>()

    // Resolve dependencies for each .prmd file from within the deployment directory
    for (const prmdFile of prmdFiles) {
      try {
        console.log(`[DeploymentService] Scanning: ${path.relative(deploymentDir, prmdFile)}`)

        // Resolve from the deployment directory - all files are relative to their containing file
        const result = await resolver.resolveDependencies(prmdFile, deploymentDir)

        // Collect package dependencies for installation
        result.packages.forEach(pkg => allPackages.add(pkg))

        console.log(`[DeploymentService]   - Found ${result.contextFiles.length} context file(s)`)
        console.log(`[DeploymentService]   - Found ${result.packages.length} package(s)`)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.warn(`[DeploymentService] Failed to resolve dependencies for ${prmdFile}:`, errorMessage)
      }
    }

    // Read prompd.json manifest for additional dependencies
    const manifestPath = path.join(deploymentDir, 'prompd.json')
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
        if (manifest.dependencies) {
          for (const [name, version] of Object.entries(manifest.dependencies)) {
            allPackages.add(`${name}@${version}`)
          }
          console.log(`[DeploymentService] Found ${Object.keys(manifest.dependencies).length} dependencies in prompd.json`)
        }
      } catch (err) {
        console.warn('[DeploymentService] Failed to read prompd.json manifest:', err)
      }
    }

    // Install packages if any were found
    if (allPackages.size > 0) {
      console.log(`[DeploymentService] Installing ${allPackages.size} package dependencies...`)
      try {
        await resolver.installPackages(Array.from(allPackages), deploymentDir)
        console.log(`[DeploymentService] Package installation complete`)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error(`[DeploymentService] Package installation failed:`, errorMessage)
        throw error
      }
    }

    console.log('[DeploymentService] Dependency resolution complete')
  }

  /**
   * Extract package to deployment directory
   */
  private async extractPackage(packagePath: string, deploymentDir: string): Promise<void> {
    // Ensure deployment directory exists
    if (!fs.existsSync(deploymentDir)) {
      fs.mkdirSync(deploymentDir, { recursive: true })
    }

    const stat = fs.statSync(packagePath)

    if (stat.isDirectory()) {
      // Copy directory contents
      this.copyDirectory(packagePath, deploymentDir)
    } else if (packagePath.endsWith('.pdpkg')) {
      // Extract ZIP file
      const zip = new AdmZip(packagePath)
      zip.extractAllTo(deploymentDir, true)
    } else {
      throw new Error('Package must be a .pdpkg file or directory')
    }

    console.log(`[DeploymentService] Extracted package to: ${deploymentDir}`)
  }

  /**
   * Copy directory recursively
   */
  private copyDirectory(src: string, dest: string): void {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true })
    }

    const entries = fs.readdirSync(src, { withFileTypes: true })

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name)
      const destPath = path.join(dest, entry.name)

      if (entry.isDirectory()) {
        this.copyDirectory(srcPath, destPath)
      } else {
        fs.copyFileSync(srcPath, destPath)
      }
    }
  }

  /**
   * Find workflow file in deployment directory
   * Reads prompd.json > main first, falls back to recursive .pdflow search
   */
  private async findWorkflowFile(deploymentDir: string): Promise<string> {
    // Try prompd.json > main first
    const manifestPath = path.join(deploymentDir, 'prompd.json')
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
        if (manifest.main && manifest.main.endsWith('.pdflow')) {
          const mainPath = path.join(deploymentDir, manifest.main)
          if (fs.existsSync(mainPath)) {
            console.log(`[DeploymentService] Resolved workflow from prompd.json main: ${manifest.main}`)
            return manifest.main
          }
        }
      } catch (err) {
        console.warn('[DeploymentService] Failed to read prompd.json:', err)
      }
    }

    // Fallback: search recursively for .pdflow
    const files = this.getFilesRecursively(deploymentDir)
    const workflowFile = files.find(f => f.endsWith('.pdflow'))

    if (!workflowFile) {
      throw new Error('No .pdflow file found in package')
    }

    return path.relative(deploymentDir, workflowFile)
  }

  /**
   * Calculate SHA256 hash of deployment directory
   */
  private async calculatePackageHash(deploymentDir: string): Promise<string> {
    const hash = crypto.createHash('sha256')
    const files = this.getFilesRecursively(deploymentDir)

    // Sort files for consistent hashing
    files.sort()

    for (const file of files) {
      const content = fs.readFileSync(file)
      hash.update(content)
    }

    return hash.digest('hex')
  }

  /**
   * Install dependencies from prompd.json
   */
  private async installDependencies(deploymentDir: string, dependencies: Record<string, string>): Promise<void> {
    try {
      // Dynamically import @prompd/cli (ESM module)
      const { RegistryClient } = await import('@prompd/cli') as { RegistryClient: { new(): RegistryClient } }
      const client = new RegistryClient()

      const depEntries = Object.entries(dependencies)
      console.log(`[DeploymentService] Installing ${depEntries.length} dependencies to:`, deploymentDir)

      const installed: string[] = []
      const failed: Array<{ name: string; error: string }> = []

      for (const [packageName, version] of depEntries) {
        try {
          console.log(`[DeploymentService] Installing: ${packageName}@${version}`)

          await client.install(`${packageName}@${version}`, {
            workspaceRoot: deploymentDir,
            skipCache: false
          })

          console.log(`[DeploymentService] Installed: ${packageName}@${version}`)
          installed.push(packageName)
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err)
          console.error(`[DeploymentService] Failed to install ${packageName}:`, errorMessage)
          failed.push({ name: packageName, error: errorMessage })
        }
      }

      if (failed.length > 0) {
        console.warn(`[DeploymentService] ${failed.length} dependencies failed to install:`, failed)
      }

      console.log(`[DeploymentService] Successfully installed ${installed.length} of ${depEntries.length} dependencies`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('[DeploymentService] Dependency installation failed:', error)
      throw new Error(`Failed to install dependencies: ${errorMessage}`)
    }
  }

  /**
   * Get all files in directory recursively
   */
  private getFilesRecursively(dir: string): string[] {
    const files: string[] = []
    const entries = fs.readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        files.push(...this.getFilesRecursively(fullPath))
      } else {
        files.push(fullPath)
      }
    }

    return files
  }

  /**
   * Extract trigger configuration from TriggerNode and register
   */
  private async extractTriggers(deploymentId: string, workflow: ParsedWorkflow, triggerNode: WorkflowNode): Promise<void> {
    const triggerData = (triggerNode.data || {}) as TriggerConfiguration
    const triggerType = triggerData.triggerType || 'manual'

    // Create trigger record
    const triggerId = randomUUID()

    const triggerRecord: Record<string, unknown> = {
      id: triggerId,
      deploymentId,
      nodeId: triggerNode.id,
      triggerType,
      enabled: triggerData.scheduleEnabled !== false,
      config: triggerData
    }

    // Extract denormalized fields based on trigger type
    if (triggerType === 'schedule') {
      triggerRecord.scheduleCron = triggerData.scheduleCron
      triggerRecord.scheduleTimezone = triggerData.scheduleTimezone || 'UTC'
    } else if (triggerType === 'webhook') {
      triggerRecord.webhookPath = triggerData.webhookPath
      triggerRecord.webhookSecret = triggerData.webhookSecret
    } else if (triggerType === 'file-watch') {
      triggerRecord.fileWatchPaths = JSON.stringify(triggerData.fileWatchPaths || [])
    } else if (triggerType === 'event') {
      triggerRecord.eventName = triggerData.eventName
    }

    // Save to database
    this.db.triggers.create({
      id: triggerId,
      deploymentId,
      nodeId: triggerNode.id,
      triggerType,
      enabled: triggerData.scheduleEnabled !== false,
      config: triggerData,
      scheduleCron: triggerRecord.scheduleCron as string | undefined,
      scheduleTimezone: triggerRecord.scheduleTimezone as string | undefined,
      webhookPath: triggerRecord.webhookPath as string | undefined,
      webhookSecret: triggerRecord.webhookSecret as string | undefined,
      fileWatchPaths: triggerRecord.fileWatchPaths as string | undefined,
      eventName: triggerRecord.eventName as string | undefined
    })

    // Register with TriggerManager
    if (this.triggerManager && triggerType !== 'manual') {
      const deployment = this.db.deployments.get(deploymentId)

      if (deployment) {
        // Ensure triggerData has all required fields for registration
        const registrationData: TriggerConfiguration = {
          ...triggerData,
          triggerType,
          scheduleCron: triggerRecord.scheduleCron as string | undefined,
          scheduleTimezone: triggerRecord.scheduleTimezone as string | undefined,
          webhookPath: triggerRecord.webhookPath as string | undefined,
          webhookSecret: triggerRecord.webhookSecret as string | undefined,
          eventName: triggerRecord.eventName as string | undefined
        }

        // Add fileWatchPaths if present (parse from JSON string)
        if (triggerRecord.fileWatchPaths) {
          try {
            registrationData.fileWatchPaths = JSON.parse(triggerRecord.fileWatchPaths as string)
          } catch (e) {
            registrationData.fileWatchPaths = []
          }
        }

        await this.triggerManager.register(triggerId, registrationData, {
          deploymentId,
          workflowId: workflow.metadata?.id,
          packagePath: deployment.packagePath
        })

        console.log(`[DeploymentService] Registered ${triggerType} trigger: ${triggerId}`)
      }
    }
  }

  /**
   * Delete a deployment (mark as deleted, stop triggers, optionally remove files)
   */
  async delete(deploymentId: string, options: { deleteFiles?: boolean } = {}): Promise<void> {
    const deployment = this.db.deployments.get(deploymentId)
    if (!deployment) {
      throw new Error('Deployment not found')
    }

    console.log(`[DeploymentService] Deleting deployment: ${deployment.name}`)

    // 1. Cancel any running executions for this deployment
    const cancelledCount = this.db.executions.cancelRunningExecutions(deploymentId)
    if (cancelledCount > 0) {
      console.log(`[DeploymentService] Cancelled ${cancelledCount} running execution(s)`)
    }

    // 2. Unregister all triggers
    const triggers = this.db.triggers.getByDeployment(deploymentId)
    for (const trigger of triggers) {
      if (this.triggerManager) {
        await this.triggerManager.unregister(trigger.id)
      }
    }

    // 3. Update deployment status
    this.db.deployments.update(deploymentId, {
      status: 'deleted',
      deletedAt: Date.now()
    })

    // 4. Optionally delete files
    if (options.deleteFiles && fs.existsSync(deployment.packagePath)) {
      fs.rmSync(deployment.packagePath, { recursive: true, force: true })
      console.log(`[DeploymentService] Deleted deployment files: ${deployment.packagePath}`)
    }

    console.log(`[DeploymentService] Deployment deleted: ${deployment.name}`)
  }

  /**
   * Purge a specific deleted deployment (permanently remove from database and filesystem)
   */
  async purge(deploymentId: string): Promise<void> {
    const deployment = this.db.deployments.get(deploymentId)
    if (!deployment) {
      throw new Error('Deployment not found')
    }

    if (deployment.status !== 'deleted') {
      throw new Error(`Deployment must be deleted before purging (current status: ${deployment.status})`)
    }

    console.log(`[DeploymentService] Purging deployment: ${deployment.name}`)

    // 1. Delete files
    if (fs.existsSync(deployment.packagePath)) {
      fs.rmSync(deployment.packagePath, { recursive: true, force: true })
      console.log(`[DeploymentService] Deleted deployment files: ${deployment.packagePath}`)
    }

    // 2. Delete from database (triggers and executions will cascade delete)
    this.db.deployments.delete(deploymentId)

    console.log(`[DeploymentService] Deployment purged: ${deployment.name}`)
  }

  /**
   * Purge all deleted deployments (permanently remove from database and filesystem)
   */
  async purgeDeleted(): Promise<{ purgedCount: number; errors: Array<{ id: string; name: string; error: string }> }> {
    console.log('[DeploymentService] Purging all deleted deployments...')

    const deletedDeployments = this.db.deployments.getAll({ status: 'deleted' })
    const errors: Array<{ id: string; name: string; error: string }> = []
    let purgedCount = 0

    for (const deployment of deletedDeployments) {
      try {
        await this.purge(deployment.id)
        purgedCount++
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error(`[DeploymentService] Failed to purge ${deployment.name}:`, errorMessage)
        errors.push({
          id: deployment.id,
          name: deployment.name,
          error: errorMessage
        })
      }
    }

    console.log(`[DeploymentService] Purged ${purgedCount} deployment(s)${errors.length > 0 ? `, ${errors.length} failed` : ''}`)

    return { purgedCount, errors }
  }

  /**
   * List all deployments
   */
  listDeployments(filters: DeploymentFilters = {}): DeploymentRecord[] {
    return this.db.deployments.getAll(filters)
  }

  /**
   * Get deployment status with trigger info and recent executions
   */
  getDeploymentStatus(deploymentId: string): DeploymentStatus | null {
    const deployment = this.db.deployments.get(deploymentId)
    if (!deployment) {
      return null
    }

    const triggers = this.db.triggers.getByDeployment(deploymentId)
    const executions = this.db.executions.getByDeployment(deploymentId, { limit: 10 })

    return {
      ...deployment,
      triggers,
      recentExecutions: executions,
      triggerCount: triggers.length,
      activeTriggersCount: triggers.filter(t => t.enabled).length
    }
  }

  /**
   * Toggle trigger enabled/disabled
   */
  async toggleTrigger(triggerId: string, enabled: boolean): Promise<void> {
    const trigger = this.db.triggers.get(triggerId)
    if (!trigger) {
      throw new Error('Trigger not found')
    }

    // Update database
    this.db.triggers.update(triggerId, { enabled })

    // Update trigger manager
    if (this.triggerManager) {
      if (enabled) {
        // Re-register trigger
        const deployment = this.db.deployments.get(trigger.deploymentId)

        if (deployment) {
          // Ensure registrationData has all required fields
          const registrationData: TriggerConfiguration = {
            ...(trigger.config ? JSON.parse(trigger.config) : {}),
            triggerType: trigger.triggerType,
            scheduleCron: trigger.scheduleCron || undefined,
            scheduleTimezone: trigger.scheduleTimezone || undefined,
            webhookPath: trigger.webhookPath || undefined,
            webhookSecret: trigger.webhookSecret || undefined,
            eventName: trigger.eventName || undefined
          }

          // Add fileWatchPaths if present
          if (trigger.fileWatchPaths) {
            try {
              registrationData.fileWatchPaths = JSON.parse(trigger.fileWatchPaths)
            } catch (e) {
              registrationData.fileWatchPaths = []
            }
          }

          await this.triggerManager.register(triggerId, registrationData, {
            deploymentId: trigger.deploymentId,
            packagePath: deployment.packagePath
          })
        }
      } else {
        // Unregister trigger
        await this.triggerManager.unregister(triggerId)
      }
    }

    console.log(`[DeploymentService] Trigger ${triggerId} ${enabled ? 'enabled' : 'disabled'}`)
  }

  /**
   * Toggle deployment status (enable/disable)
   * When disabled, all triggers are unregistered
   * When enabled, all triggers are re-registered
   */
  async toggleStatus(deploymentId: string): Promise<{ id: string; status: string; name: string }> {
    const deployment = this.db.deployments.get(deploymentId)
    if (!deployment) {
      throw new Error('Deployment not found')
    }

    if (deployment.status === 'deleted') {
      throw new Error('Cannot toggle status of deleted deployment')
    }

    // Toggle status
    const newStatus = deployment.status === 'enabled' ? 'disabled' : 'enabled'

    // Get all triggers for this deployment
    const triggers = this.db.triggers.getByDeployment(deploymentId)

    if (this.triggerManager) {
      if (newStatus === 'enabled') {
        // Re-register all enabled triggers
        for (const trigger of triggers) {
          if (trigger.enabled) {
            const registrationData: TriggerConfiguration = {
              ...(trigger.config ? JSON.parse(trigger.config) : {}),
              triggerType: trigger.triggerType,
              scheduleCron: trigger.scheduleCron || undefined,
              scheduleTimezone: trigger.scheduleTimezone || undefined,
              webhookPath: trigger.webhookPath || undefined,
              webhookSecret: trigger.webhookSecret || undefined,
              eventName: trigger.eventName || undefined
            }

            // Add fileWatchPaths if present
            if (trigger.fileWatchPaths) {
              try {
                registrationData.fileWatchPaths = JSON.parse(trigger.fileWatchPaths)
              } catch (e) {
                registrationData.fileWatchPaths = []
              }
            }

            await this.triggerManager.register(trigger.id, registrationData, {
              deploymentId: deployment.id,
              packagePath: deployment.packagePath
            })
          }
        }
      } else {
        // Unregister all triggers
        for (const trigger of triggers) {
          await this.triggerManager.unregister(trigger.id)
        }
      }
    }

    // Update deployment status
    this.db.deployments.update(deploymentId, { status: newStatus })

    console.log(`[DeploymentService] Deployment ${deployment.name} ${newStatus}`)

    return {
      id: deployment.id,
      status: newStatus,
      name: deployment.name
    }
  }

  /**
   * Execute a deployment manually
   */
  async execute(deploymentId: string, parameters: Record<string, unknown> = {}): Promise<ExecutionResult & { id: string }> {
    const deployment = this.db.deployments.get(deploymentId)
    if (!deployment) {
      throw new Error('Deployment not found')
    }

    if (deployment.status !== 'enabled') {
      throw new Error(`Deployment is ${deployment.status}`)
    }

    console.log(`[DeploymentService] Manual execution requested: ${deployment.name}`)

    // Create execution record
    const executionId = randomUUID()
    this.db.executions.create({
      id: executionId,
      deploymentId: deployment.id,
      triggerId: null,
      workflowId: deployment.workflowId,
      triggerType: 'manual',
      status: 'running',
      startedAt: Date.now(),
      parameters
    })

    // Create manual trigger context
    const context: TriggerEventContext = {
      triggerType: 'manual',
      triggeredAt: Date.now(),
      payload: parameters
    }

    try {
      // Execute via callback
      if (this.executeWorkflow) {
        const result = await this.executeWorkflow(deployment, { triggerType: 'manual' }, context)

        // Update execution record with result
        this.db.executions.update(executionId, {
          status: result.status || 'success',
          result: result.result,
          error: result.error,
          completedAt: Date.now(),
          durationMs: result.duration
        })

        // Update deployment
        this.db.deployments.update(deployment.id, {
          lastExecutionAt: Date.now(),
          lastExecutionStatus: result.status || 'success'
        })

        console.log(`[DeploymentService] Manual execution completed: ${result.status || 'success'}`)

        return { id: executionId, ...result }
      } else {
        throw new Error('No workflow executor configured')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(`[DeploymentService] Manual execution failed:`, error)

      // Update execution record with error
      this.db.executions.update(executionId, {
        status: 'error',
        error: errorMessage,
        completedAt: Date.now()
      })

      // Update deployment
      this.db.deployments.update(deployment.id, {
        lastExecutionStatus: 'error'
      })

      throw error
    }
  }

  /**
   * Handle trigger firing (callback from TriggerManager)
   */
  private async handleTrigger(triggerId: string, context: TriggerEventContext): Promise<ExecutionResult | undefined> {
    const trigger = this.db.triggers.get(triggerId)
    if (!trigger) {
      console.error(`[DeploymentService] Unknown trigger: ${triggerId}`)
      return
    }

    const deployment = this.db.deployments.get(trigger.deploymentId)
    if (!deployment || deployment.status !== 'enabled') {
      console.log(`[DeploymentService] Deployment inactive: ${trigger.deploymentId}`)
      return
    }

    console.log(`[DeploymentService] Trigger fired: ${trigger.triggerType} (${triggerId})`)

    // Create execution record
    const executionId = randomUUID()
    this.db.executions.create({
      id: executionId,
      deploymentId: deployment.id,
      triggerId: trigger.id,
      workflowId: deployment.workflowId,
      triggerType: trigger.triggerType,
      status: 'running',
      startedAt: Date.now(),
      parameters: context.payload
    })

    try {
      // Execute workflow
      if (this.executeWorkflow) {
        const result = await this.executeWorkflow(deployment, trigger, context)

        // Update execution record
        this.db.executions.update(executionId, {
          status: result.status || 'success',
          result: result.result,
          error: result.error,
          completedAt: Date.now(),
          durationMs: result.duration
        })

        // Update trigger
        this.db.triggers.incrementCount(triggerId)
        this.db.triggers.update(triggerId, {
          lastTriggerStatus: result.status || 'success'
        })

        // Update deployment
        this.db.deployments.update(deployment.id, {
          lastExecutionAt: Date.now(),
          lastExecutionStatus: result.status || 'success'
        })

        return result
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(`[DeploymentService] Execution failed:`, error)

      // Update execution record
      this.db.executions.update(executionId, {
        status: 'error',
        error: errorMessage,
        completedAt: Date.now()
      })

      // Update trigger and deployment
      this.db.triggers.update(triggerId, {
        lastTriggerStatus: 'error'
      })
      this.db.deployments.update(deployment.id, {
        lastExecutionStatus: 'error'
      })

      throw error
    }
  }

  /**
   * Get all execution history (across all deployments)
   */
  getAllExecutions(options: ExecutionQueryOptions & { filters?: Record<string, unknown> } = {}): ExecutionPage {
    const limit = options.limit || 50
    const offset = options.offset || 0
    const filters = {
      ...options.filters,
      limit,
      offset
    }

    const executions = this.db.executions.getAll(filters)
    const total = this.db.executions.getCount(options.filters || {})

    return {
      executions,
      total,
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
      totalPages: Math.ceil(total / limit)
    }
  }

  /**
   * Get execution history for a specific deployment
   */
  getHistory(deploymentId: string, options: ExecutionQueryOptions = {}): ReturnType<typeof this.db.executions.getByDeployment> {
    return this.db.executions.getByDeployment(deploymentId, options)
  }

  /**
   * Clear all execution history
   */
  clearAllHistory(): number {
    return this.db.executions.clearAll()
  }

  /**
   * Get workflow parameters from a deployment
   */
  getParameters(deploymentId: string): WorkflowParameters {
    // Get deployment from database
    const deployment = this.db.deployments.get(deploymentId)
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`)
    }

    // Resolve workflow file from prompd.json > main, fallback to directory scan
    let workflowPath: string | null = null

    const manifestPath = path.join(deployment.packagePath, 'prompd.json')
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
        if (manifest.main && manifest.main.endsWith('.pdflow')) {
          const mainPath = path.join(deployment.packagePath, manifest.main)
          if (fs.existsSync(mainPath)) {
            workflowPath = mainPath
          }
        }
      } catch (_err) {
        // Fall through to directory scan
      }
    }

    if (!workflowPath) {
      const workflowFiles = this.getFilesRecursively(deployment.packagePath)
        .filter(f => f.endsWith('.pdflow'))

      if (workflowFiles.length === 0) {
        throw new Error(`No workflow file found in deployment: ${deploymentId}`)
      }
      workflowPath = workflowFiles[0]
    }
    const workflowContent = fs.readFileSync(workflowPath, 'utf-8')
    const workflow: ParsedWorkflow = JSON.parse(workflowContent)

    return {
      parameters: workflow.parameters || [],
      workflowName: deployment.name
    }
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close()
  }
}

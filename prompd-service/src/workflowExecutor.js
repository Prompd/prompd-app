/**
 * Workflow Executor for Prompd Service
 *
 * Executes .pdflow workflow files using @prompd/cli
 * Supports deployment-based workflow execution with full package context
 */

import { readFileSync, existsSync, readdirSync } from 'fs'
import path from 'path'
import { executeWorkflow as executeWorkflowCLI } from '@prompd/cli'

/**
 * Resolve the workflow file path from a deployment directory.
 * Uses prompd.json > main as primary source, falls back to recursive search.
 * @param {string} packagePath - Deployment directory path
 * @returns {string|null} - Absolute path to workflow file, or null
 */
function resolveWorkflowPath(packagePath) {
  // Check prompd.json manifest for main field
  const manifestPath = path.join(packagePath, 'prompd.json')
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
      if (manifest.main) {
        const mainPath = path.join(packagePath, manifest.main)
        if (existsSync(mainPath)) {
          return mainPath
        }
        console.warn(`[WorkflowExecutor] prompd.json main "${manifest.main}" not found at: ${mainPath}`)
      }
    } catch (err) {
      console.warn(`[WorkflowExecutor] Failed to read prompd.json:`, err.message)
    }
  }

  // Fallback: search recursively for .pdflow
  const findPdflow = (dir) => {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        const found = findPdflow(fullPath)
        if (found) return found
      } else if (entry.name.endsWith('.pdflow')) {
        return fullPath
      }
    }
    return null
  }
  return findPdflow(packagePath)
}

/**
 * Execute a deployed workflow
 *
 * @param {object} deployment - Deployment record from database
 * @param {object} trigger - Trigger record from database
 * @param {object} context - Trigger context (payload, event data, etc.)
 * @returns {Promise<object>} - Execution result
 */
export async function executeDeployedWorkflow(deployment, trigger, context = {}) {
  const { packagePath, name } = deployment

  // Resolve workflow file from prompd.json > main, fallback to recursive search
  const workflowFile = resolveWorkflowPath(packagePath)

  if (!workflowFile) {
    throw new Error(`No workflow file found in deployment: ${packagePath}`)
  }

  try {
    // Read and parse workflow file
    const workflowContent = readFileSync(workflowFile, 'utf-8')
    let workflow
    try {
      workflow = JSON.parse(workflowContent)
    } catch (error) {
      throw new Error(`Invalid workflow file format: ${error.message}`)
    }

    // Log execution start
    const startTime = Date.now()
    console.log(`[WorkflowExecutor] Starting deployed workflow: ${name}`)
    console.log(`[WorkflowExecutor] Deployment ID: ${deployment.id}`)
    console.log(`[WorkflowExecutor] Trigger: ${trigger.triggerType}`)
    console.log(`[WorkflowExecutor] Package path: ${packagePath}`)

    // Build parameters from trigger context
    const parameters = {
      ...(context.payload || {}),
      _trigger: {
        type: trigger.triggerType,
        triggeredAt: Date.now(),
        triggerId: trigger.id,
        ...context
      }
    }

    console.log(`[WorkflowExecutor] Parameters:`, parameters)

    // Execute workflow using @prompd/cli
    const result = await executeWorkflowCLI(workflow, parameters, {
      workingDirectory: packagePath,
      packagePath,
      onNodeStart: (nodeId) => {
        console.log(`[WorkflowExecutor] Node started: ${nodeId}`)
      },
      onNodeComplete: (nodeId, output) => {
        console.log(`[WorkflowExecutor] Node completed: ${nodeId}`)
      },
      onError: (error) => {
        console.error(`[WorkflowExecutor] Error:`, error.message)
      }
    })

    const endTime = Date.now()
    const duration = endTime - startTime

    console.log(`[WorkflowExecutor] Workflow ${result.success ? 'completed' : 'failed'} in ${duration}ms`)

    return {
      status: result.success ? 'success' : 'error',
      workflowId: deployment.workflowId,
      deploymentId: deployment.id,
      triggerId: trigger.id,
      startTime,
      endTime,
      duration,
      message: result.success
        ? `Workflow "${name}" executed successfully`
        : `Workflow "${name}" failed: ${result.error?.message || 'Unknown error'}`,
      result: result.output,
      error: result.error?.message
    }
  } catch (error) {
    console.error(`[WorkflowExecutor] Execution failed:`, error.message)
    throw error
  }
}

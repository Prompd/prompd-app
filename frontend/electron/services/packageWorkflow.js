/**
 * Shared Workflow Packaging Utility
 *
 * Creates a .pdpkg package from a workflow file with:
 * - Workflow file
 * - Referenced prompt files (with path resolution)
 * - Package dependencies (from @namespace/package references)
 * - prompd.json manifest with integrity hashes (via CLI)
 *
 * Used by:
 * - Local deployment (deployment:deploy IPC handler)
 * - Docker/Kubernetes export (workflowExportService)
 */

const fs = require('fs-extra')
const path = require('path')
const { app } = require('electron')
const yaml = require('yaml')

/**
 * Trace all file dependencies from a workflow
 * Walks the dependency tree to find all referenced files:
 * - Workflow file itself
 * - Prompt files from workflow nodes
 * - Files referenced by inherits: field
 * - Files referenced by {% include="..." %} Nunjucks syntax
 * - Files attached via files: field in frontmatter
 *
 * @param {string} workspaceRoot - Workspace root directory
 * @param {string} workflowRelativePath - Workflow file path (relative to workspace)
 * @param {object} workflow - Parsed workflow object
 * @returns {Promise<{referencedFiles: string[], scannedDependencies: object}>}
 */
async function traceDependencyTree(workspaceRoot, workflowRelativePath, workflow) {
  const referencedFiles = new Set()
  const scannedDependencies = {}
  const visited = new Set() // Prevent infinite loops

  // Always include the workflow file
  referencedFiles.add(workflowRelativePath)

  /**
   * Recursively trace a .prmd file and its dependencies
   */
  async function tracePromptFile(relativePath) {
    if (visited.has(relativePath)) return
    visited.add(relativePath)

    const absolutePath = path.join(workspaceRoot, relativePath)

    if (!await fs.pathExists(absolutePath)) {
      console.warn('[PackageWorkflow] File not found:', relativePath)
      return
    }

    // Add file to referenced set
    referencedFiles.add(relativePath)

    try {
      // Normalize line endings (Windows CRLF -> LF) before parsing
      const content = (await fs.readFile(absolutePath, 'utf-8')).replace(/\r\n/g, '\n')

      // Parse YAML frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
      if (!frontmatterMatch) return

      const frontmatter = yaml.parse(frontmatterMatch[1])

      // 1. Check for package inheritance (inherits: @namespace/package@version)
      if (frontmatter.inherits) {
        if (frontmatter.inherits.startsWith('@')) {
          const atIndex = frontmatter.inherits.lastIndexOf('@')
          if (atIndex > 0) {
            const packageName = frontmatter.inherits.substring(0, atIndex)
            // Version is between '@' and the next '/' (strip trailing path like /prompts/base.prmd)
            const versionAndPath = frontmatter.inherits.substring(atIndex + 1)
            const version = versionAndPath.split('/')[0]
            scannedDependencies[packageName] = version
            console.log('[PackageWorkflow] Found package dependency:', packageName, '@', version)
          }
        } else if (frontmatter.inherits.endsWith('.prmd')) {
          // Local file inheritance
          const inheritPath = path.isAbsolute(frontmatter.inherits)
            ? path.relative(workspaceRoot, frontmatter.inherits)
            : path.join(path.dirname(relativePath), frontmatter.inherits).replace(/\\/g, '/')
          await tracePromptFile(inheritPath)
        }
      }

      // 2. Check for attached files (files: [file1.txt, file2.json])
      if (frontmatter.files && Array.isArray(frontmatter.files)) {
        for (const fileRef of frontmatter.files) {
          const filePath = path.isAbsolute(fileRef)
            ? path.relative(workspaceRoot, fileRef)
            : path.join(path.dirname(relativePath), fileRef).replace(/\\/g, '/')

          if (await fs.pathExists(path.join(workspaceRoot, filePath))) {
            referencedFiles.add(filePath)
          }
        }
      }

      // 2b. Check for context files (context: or contexts: - both singular and plural, string or array)
      const rawContext = frontmatter.context || frontmatter.contexts
      const contextArray = rawContext ? (Array.isArray(rawContext) ? rawContext : [rawContext]) : null
      if (contextArray) {
        for (const contextRef of contextArray) {
          if (typeof contextRef !== 'string') continue
          const filePath = path.isAbsolute(contextRef)
            ? path.relative(workspaceRoot, contextRef)
            : path.join(path.dirname(relativePath), contextRef).replace(/\\/g, '/')

          if (await fs.pathExists(path.join(workspaceRoot, filePath))) {
            referencedFiles.add(filePath)
            console.log('[PackageWorkflow] Found context file:', filePath)
          } else {
            console.warn('[PackageWorkflow] Context file not found:', filePath)
          }
        }
      }

      // 2c. Check for override file references (override: { system: "../systems/file.md" })
      if (frontmatter.override && typeof frontmatter.override === 'object') {
        for (const overrideValue of Object.values(frontmatter.override)) {
          if (typeof overrideValue !== 'string') continue
          const filePath = path.isAbsolute(overrideValue)
            ? path.relative(workspaceRoot, overrideValue)
            : path.join(path.dirname(relativePath), overrideValue).replace(/\\/g, '/')

          if (await fs.pathExists(path.join(workspaceRoot, filePath))) {
            referencedFiles.add(filePath)
            console.log('[PackageWorkflow] Found override file:', filePath)
          } else {
            console.warn('[PackageWorkflow] Override file not found:', filePath)
          }
        }
      }

      // 2d. Check for top-level section fields that can be file references
      // (system:, user:, task:, assistant:, response:, output:)
      const sectionFields = ['system', 'user', 'task', 'assistant', 'response', 'output']
      for (const field of sectionFields) {
        const sectionValue = frontmatter[field]
        if (!sectionValue) continue

        const sectionRefs = Array.isArray(sectionValue) ? sectionValue : [sectionValue]
        for (const ref of sectionRefs) {
          if (typeof ref !== 'string') continue
          // Only resolve relative paths (starts with ./ or ../ or has a file extension)
          if (!ref.startsWith('./') && !ref.startsWith('../') && !ref.match(/\.\w+$/)) continue

          const filePath = path.isAbsolute(ref)
            ? path.relative(workspaceRoot, ref)
            : path.join(path.dirname(relativePath), ref).replace(/\\/g, '/')

          if (await fs.pathExists(path.join(workspaceRoot, filePath))) {
            referencedFiles.add(filePath)
            console.log(`[PackageWorkflow] Found ${field} file:`, filePath)
          } else {
            console.warn(`[PackageWorkflow] Section file not found (${field}):`, filePath)
          }
        }
      }

      // 3. Check for Jinja/Nunjucks includes ({% include "file.prmd" %} or {% include="file.prmd" %})
      const includePattern = /{%[-~]?\s*include\s*=?\s*["']([^"']+)["']\s*[-~]?%}/g
      let includeMatch
      while ((includeMatch = includePattern.exec(content)) !== null) {
        const includePath = path.isAbsolute(includeMatch[1])
          ? path.relative(workspaceRoot, includeMatch[1])
          : path.join(path.dirname(relativePath), includeMatch[1]).replace(/\\/g, '/')

        if (includePath.endsWith('.prmd')) {
          await tracePromptFile(includePath)
        } else {
          // Non-.prmd include (e.g., .md, .txt files)
          if (await fs.pathExists(path.join(workspaceRoot, includePath))) {
            referencedFiles.add(includePath)
          }
        }
      }

    } catch (err) {
      console.warn('[PackageWorkflow] Failed to trace file', relativePath, ':', err.message)
    }
  }

  /**
   * Trace all prompt nodes in the workflow
   */
  const promptNodes = workflow.nodes?.filter(n => n.type === 'prompt') || []

  for (const node of promptNodes) {
    const sourceRef = node.data?.source || node.data?.promptRef

    if (!sourceRef) continue

    if (sourceRef.startsWith('@')) {
      // Direct package reference in workflow node
      const atIndex = sourceRef.lastIndexOf('@')
      if (atIndex > 0) {
        const packageName = sourceRef.substring(0, atIndex)
        const version = sourceRef.substring(atIndex + 1)
        scannedDependencies[packageName] = version
      }
    } else if (sourceRef.startsWith('./') || sourceRef.startsWith('../') || !sourceRef.startsWith('raw:')) {
      // Local prompt file reference - resolve relative to workflow file directory
      const workflowDir = path.dirname(workflowRelativePath)
      const resolved = path.join(workflowDir, sourceRef)
      const promptPath = path.normalize(resolved).replace(/\\/g, '/')
      await tracePromptFile(promptPath)
    }
  }

  return {
    referencedFiles: Array.from(referencedFiles).sort(),
    scannedDependencies
  }
}

/**
 * Package a workflow file into a .pdpkg with integrity hashes
 *
 * Preserves workspace directory structure - if workflow is at ./workflows/test.pdflow
 * and references ./prompts/file.prmd, the package will contain both paths as-is.
 *
 * @param {string} workflowPath - Path to .pdflow file
 * @param {object} options - Packaging options
 * @param {string} options.workspacePath - Workspace root for resolving relative paths (REQUIRED)
 * @param {string} options.name - Package name (defaults to workflow filename)
 * @param {string} options.version - Package version (defaults to '1.0.0')
 * @param {function} getPrompdCli - Function to get CLI module
 * @returns {Promise<{success: boolean, packagePath?: string, workflowRelativePath?: string, error?: string}>}
 */
async function packageWorkflow(workflowPath, options = {}, getPrompdCli) {
  const originalCwd = process.cwd()

  try {
    console.log('[PackageWorkflow] Called with:', {
      workflowPath,
      workspacePath: options.workspacePath,
      options: Object.keys(options)
    })

    const workspaceRoot = options.workspacePath
    if (!workspaceRoot) {
      throw new Error(`options.workspacePath is required - cannot resolve relative paths without workspace root. Received: ${JSON.stringify({ workflowPath, workspacePath: options.workspacePath })}`)
    }

    // Calculate workspace-relative path for workflow (e.g., "workflows/test.pdflow")
    const workflowRelativePath = path.relative(workspaceRoot, workflowPath).replace(/\\/g, '/')

    // Parse workflow to find dependencies
    const workflowContent = await fs.readFile(workflowPath, 'utf-8')
    let workflow
    try {
      workflow = JSON.parse(workflowContent)
    } catch (parseError) {
      throw new Error(`Invalid workflow file: ${parseError.message}`)
    }

    // Trace all dependencies starting from workflow
    const { referencedFiles, scannedDependencies: tracedDependencies } = await traceDependencyTree(
      workspaceRoot,
      workflowRelativePath,
      workflow
    )

    console.log('[PackageWorkflow] Traced', referencedFiles.length, 'files from dependency tree')

    // tracedDependencies already contains all package dependencies from the tree walk
    const scannedDependencies = tracedDependencies

    // Create a NEW prompd.json for packaging with all traced files
    // If workspace has one, read it for metadata but never modify it
    const prompdJsonPath = path.join(workspaceRoot, 'prompd.json')
    const prompdJsonBackupPath = prompdJsonPath + '.bak'
    const prompdJsonExists = await fs.pathExists(prompdJsonPath)
    let existingPrompdJson = null

    if (prompdJsonExists) {
      existingPrompdJson = await fs.readJson(prompdJsonPath)
      await fs.copy(prompdJsonPath, prompdJsonBackupPath)
      console.log('[PackageWorkflow] Backed up workspace prompd.json:', existingPrompdJson.name, 'v' + existingPrompdJson.version)
    }

    // Merge scanned dependencies with any existing ones
    const mergedDependencies = {
      ...(existingPrompdJson?.dependencies || {}),
      ...scannedDependencies
    }

    // Build the packaging prompd.json with ALL traced files
    const packagingPrompdJson = {
      name: options.name || existingPrompdJson?.name || path.basename(workflowPath, '.pdflow'),
      version: options.version || existingPrompdJson?.version || '1.0.0',
      description: existingPrompdJson?.description || `Deployed workflow: ${options.name || path.basename(workflowPath, '.pdflow')}`,
      type: existingPrompdJson?.type || 'workflow',
      main: workflowRelativePath,
      files: referencedFiles,
      ...(Object.keys(mergedDependencies).length > 0 && { dependencies: mergedDependencies }),
      ...(existingPrompdJson?.ignore && { ignore: existingPrompdJson.ignore })
    }

    await fs.writeJson(prompdJsonPath, packagingPrompdJson, { spaces: 2 })
    console.log('[PackageWorkflow] Created packaging prompd.json with', referencedFiles.length, 'files and', Object.keys(mergedDependencies).length, 'dependencies')

    const cli = await getPrompdCli()
    const outputDir = app.getPath('temp')

    // Change to workspace directory for CLI execution
    process.chdir(workspaceRoot)
    console.log('[PackageWorkflow] Changed working directory to:', workspaceRoot)

    let result
    try {
      result = await cli.createPackageFromPrompdJson(workspaceRoot, outputDir)
    } finally {
      // Restore original prompd.json or clean up
      if (prompdJsonExists) {
        await fs.move(prompdJsonBackupPath, prompdJsonPath, { overwrite: true }).catch(() => {})
        console.log('[PackageWorkflow] Restored original prompd.json')
      } else {
        await fs.remove(prompdJsonPath).catch(() => {})
        console.log('[PackageWorkflow] Cleaned up temporary prompd.json')
      }
    }

    console.log('[PackageWorkflow] Package creation result:', {
      success: result.success,
      packagePath: result.packagePath,
      error: result.error
    })

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to create package'
      }
    }

    if (!result.outputPath) {
      return {
        success: false,
        error: 'Package created but no path returned'
      }
    }

    console.log('[PackageWorkflow] Package created:', result.outputPath)
    return {
      success: true,
      packagePath: result.outputPath,
      workflowRelativePath
    }

  } catch (error) {
    console.error('[PackageWorkflow] Failed:', error)
    return {
      success: false,
      error: error.message || 'Package creation failed'
    }
  } finally {
    // Restore original working directory
    process.chdir(originalCwd)
    console.log('[PackageWorkflow] Restored working directory to:', originalCwd)
  }
}

/**
 * Recursively get all files in a directory
 * @param {string} dirPath - Directory to scan
 * @param {string} basePath - Base path for calculating relative paths
 * @returns {Promise<string[]>} - Array of relative file paths
 */
async function getAllFiles(dirPath, basePath) {
  const files = []
  const entries = await fs.readdir(dirPath, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    const relativePath = path.relative(basePath, fullPath).replace(/\\/g, '/')

    if (entry.isDirectory()) {
      // Recursively get files from subdirectories
      const subFiles = await getAllFiles(fullPath, basePath)
      files.push(...subFiles)
    } else {
      files.push(relativePath)
    }
  }

  return files
}

module.exports = { packageWorkflow }

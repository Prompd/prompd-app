/**
 * TemplateIpcRegistration — IPC handlers for all template:* channels
 *
 * Handles: template:save, template:list, template:delete, template:insert
 *
 * Saves and restores workflow node templates as .pdpkg archives in:
 * - <workspace>/.prompd/templates/local/ (project-specific, user-created)
 * - ~/.prompd/templates/local/ (user-level, user-created)
 * Registry-installed templates live at the root: .prompd/templates/@scope/name/version/
 */

const { BaseIpcRegistration } = require('./IpcRegistration')
const { tracePromptFileDeps, getNodeFileRefs } = require('../services/packageWorkflow')
const JSZip = require('jszip')
const fs = require('fs-extra')
const path = require('path')
const os = require('os')

/**
 * Slugify a template name for use as a filename.
 * Converts to lowercase, replaces spaces/special chars with hyphens.
 * @param {string} name
 * @returns {string}
 */
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80) || 'template'
}

/**
 * Resolve the templates directory for a given scope.
 * @param {string} workspacePath
 * @param {'workspace'|'user'} scope
 * @returns {string}
 */
function getTemplatesDir(workspacePath, scope) {
  if (scope === 'user') {
    return path.join(os.homedir(), '.prompd', 'templates')
  }
  return path.join(workspacePath, '.prompd', 'templates')
}

/**
 * Resolve the local templates directory (for user-created exports).
 * @param {string} workspacePath
 * @param {'workspace'|'user'} scope
 * @returns {string}
 */
function getLocalTemplatesDir(workspacePath, scope) {
  return path.join(getTemplatesDir(workspacePath, scope), 'local')
}

/**
 * Read a node-template list item from a .pdpkg archive.
 * @param {string} filePath - Absolute path to the .pdpkg file
 * @param {string} fileName - The .pdpkg filename
 * @param {string} scope - 'workspace' or 'user'
 * @param {string} origin - 'local' or 'registry'
 * @returns {Promise<object|null>} Template list item or null
 */
async function readTemplatePdpkg(filePath, fileName, scope, origin) {
  try {
    const zipBuffer = await fs.readFile(filePath)
    const zip = await JSZip.loadAsync(zipBuffer)

    const manifestFile = zip.file('prompd.json')
    if (!manifestFile) return null

    const manifestText = await manifestFile.async('string')
    const manifest = JSON.parse(manifestText)

    const ntSection = manifest['node-template']
    if (!ntSection?.node) return null

    return {
      fileName,
      name: manifest.name || fileName.replace('.pdpkg', ''),
      description: manifest.description,
      nodeType: ntSection.node.nodeType,
      nodeTypeLabel: ntSection.nodeTypeLabel || ntSection.node.nodeType,
      scope,
      origin,
      createdAt: manifest.createdAt || '',
    }
  } catch (err) {
    console.warn('[Template IPC] Failed to read template:', fileName, err.message)
    return null
  }
}

/**
 * Resolve the node-template section from a template manifest.
 * @param {object} template - The template manifest
 * @returns {{ node: object, section: object }} - node data and section reference
 */
function resolveNodeTemplateSection(template) {
  const section = template['node-template']
  return { node: section?.node || null, section: section || null }
}

/**
 * Collect file paths from a node template that reference .prmd/.pdflow files.
 * Scans the root nodeData and all children.
 * @param {object} template - The NodeTemplate manifest
 * @returns {string[]} - Array of workspace-relative file paths
 */
function collectFilePaths(template) {
  const files = []
  const { node } = resolveNodeTemplateSection(template)
  if (!node) return files

  // Check root node
  const rootFiles = getNodeFileRefs(node.nodeType, node.nodeData)
  files.push(...rootFiles)

  // Check children
  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      const childFiles = getNodeFileRefs(child.type, child.data)
      files.push(...childFiles)
    }
  }

  return [...new Set(files)]
}

/**
 * Adjust file reference paths in a single node's data using a conversion function.
 * Mutates nodeData in place.
 * @param {string} nodeType - The workflow node type
 * @param {object} nodeData - The node's data object (mutated)
 * @param {(p: string) => string} convertPath - Path conversion function
 */
function adjustNodeDataPaths(nodeType, nodeData, convertPath) {
  if (!nodeData) return

  switch (nodeType) {
    case 'prompt':
    case 'agent': {
      const sourceKey = nodeData.source != null ? 'source' : (nodeData.promptRef != null ? 'promptRef' : null)
      const source = sourceKey ? nodeData[sourceKey] : null
      if (source && (nodeData.sourceType === 'file' || !nodeData.sourceType) && !source.startsWith('@')) {
        nodeData[sourceKey] = convertPath(source)
      }
      break
    }
    case 'chatAgent':
    case 'chat-agent': {
      if (nodeData.agentPromptSource && nodeData.agentPromptSourceType === 'file' && !nodeData.agentPromptSource.startsWith('@')) {
        nodeData.agentPromptSource = convertPath(nodeData.agentPromptSource)
      }
      break
    }
    case 'workflow': {
      if (nodeData.source && !nodeData.source.startsWith('@')) {
        nodeData.source = convertPath(nodeData.source)
      }
      break
    }
  }
}

/**
 * Convert all file reference paths in a template's node data (root + children).
 * Mutates the template in place.
 * @param {object} template - The template manifest
 * @param {(p: string) => string} convertPath - Path conversion function
 */
function convertTemplateFilePaths(template, convertPath) {
  const { node } = resolveNodeTemplateSection(template)
  if (!node) return

  adjustNodeDataPaths(node.nodeType, node.nodeData, convertPath)

  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      adjustNodeDataPaths(child.type, child.data, convertPath)
    }
  }
}

class TemplateIpcRegistration extends BaseIpcRegistration {
  constructor() {
    super('Template')
  }

  /**
   * Register all template IPC handlers.
   * @param {Electron.IpcMain} ipcMain
   */
  register(ipcMain) {
    // Save a node as a template (.pdpkg)
    ipcMain.handle('template:save', async (_event, workspacePath, template, scope = 'workspace', workflowFilePath) => {
      try {
        if (!workspacePath || !template) {
          return { success: false, error: 'Workspace path and template data are required' }
        }
        const { node: templateNode, section: templateSection } = resolveNodeTemplateSection(template)
        if (!template.name || !templateNode?.nodeType || !templateSection) {
          return { success: false, error: 'Template name and node-template section with node.nodeType are required' }
        }

        // Ensure an id field exists (slugified package identifier)
        if (!template.id) {
          template.id = slugify(template.name)
        }

        console.log('[Template IPC] Saving template:', template.name, '(id:', template.id + ')', 'scope:', scope)

        // Convert workflow-file-relative paths in nodeData to workspace-relative
        // so that dependency tracing and file bundling work correctly.
        if (workflowFilePath) {
          const workflowDir = path.dirname(workflowFilePath)
          convertTemplateFilePaths(template, (wfRelPath) => {
            const absPath = path.resolve(workflowDir, wfRelPath)
            const wsRel = path.relative(workspacePath, absPath).replace(/\\/g, '/')
            console.log('[Template IPC] Path conversion (save):', wfRelPath, '->', wsRel)
            return wsRel
          })
          templateSection.pathsConverted = true
          console.log('[Template IPC] Converted node paths from workflow-relative to workspace-relative')
        } else {
          // No workflowFilePath — try to resolve workflow-relative paths to workspace-relative
          // by stripping leading ../ segments and checking if the file exists in the workspace.
          console.log('[Template IPC] No workflowFilePath — attempting fallback path resolution')
          let hasFilePaths = false
          let allConverted = true
          convertTemplateFilePaths(template, (wfRelPath) => {
            hasFilePaths = true
            // Strip leading ../ and ./ to get a candidate workspace-relative path
            const stripped = wfRelPath.replace(/^(\.\.\/?|\.\/)+/g, '')
            const candidate = path.join(workspacePath, stripped)
            if (fs.pathExistsSync(candidate)) {
              const wsRel = stripped.replace(/\\/g, '/')
              console.log('[Template IPC] Fallback path resolution:', wfRelPath, '->', wsRel)
              return wsRel
            }
            allConverted = false
            console.warn('[Template IPC] Could not resolve path without workflowFilePath:', wfRelPath)
            return wfRelPath
          })
          // Only mark as converted if ALL file paths were successfully resolved
          templateSection.pathsConverted = hasFilePaths && allConverted
          if (templateSection.pathsConverted) {
            console.log('[Template IPC] Fallback resolution converted all paths to workspace-relative')
          } else if (hasFilePaths) {
            console.log('[Template IPC] Fallback resolution failed — template may not be portable')
          }
        }

        // 1. Collect file references from the template (now workspace-relative)
        const filePaths = collectFilePaths(template)

        // 2. Trace dependencies for each referenced file
        const traceState = {
          referencedFiles: new Set(),
          scannedDependencies: {},
          visited: new Set(),
        }

        for (const filePath of filePaths) {
          await tracePromptFileDeps(workspacePath, filePath, traceState)
        }

        const tracedFiles = Array.from(traceState.referencedFiles)
        console.log('[Template IPC] Traced', tracedFiles.length, 'file dependencies')

        // Update template with resolved file list
        if (tracedFiles.length > 0) {
          template.files = tracedFiles
        }

        // 3. Create JSZip archive
        const zip = new JSZip()

        // Add manifest
        zip.file('prompd.json', JSON.stringify(template, null, 2))

        // Add traced files (validate each stays within workspace before reading)
        const resolvedWorkspace = path.resolve(workspacePath)
        for (const relPath of tracedFiles) {
          const absPath = path.resolve(workspacePath, relPath)
          if (!absPath.startsWith(resolvedWorkspace + path.sep) && absPath !== resolvedWorkspace) {
            console.warn('[Template IPC] File escapes workspace, skipping:', relPath)
            continue
          }
          if (await fs.pathExists(absPath)) {
            const fileContent = await fs.readFile(absPath)
            zip.file(relPath, fileContent)
          } else {
            console.warn('[Template IPC] File not found, skipping:', relPath)
          }
        }

        // 4. Write .pdpkg to local/ subdirectory (user-created exports)
        const templatesDir = getLocalTemplatesDir(workspacePath, scope)
        await fs.ensureDir(templatesDir)

        const fileName = `${slugify(template.name)}.pdpkg`
        const outputPath = path.join(templatesDir, fileName)

        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })
        await fs.writeFile(outputPath, zipBuffer)

        console.log('[Template IPC] Saved template:', outputPath)
        return { success: true, fileName, scope }
      } catch (err) {
        console.error('[Template IPC] save error:', err.message)
        return { success: false, error: err.message }
      }
    })

    // List all templates from both workspace and user directories
    ipcMain.handle('template:list', async (_event, workspacePath) => {
      try {
        const templates = []

        // Read from both scopes (workspace scope only if workspacePath is provided)
        const scopes = [
          ...(workspacePath ? [{ scope: 'workspace', dir: getTemplatesDir(workspacePath, 'workspace') }] : []),
          { scope: 'user', dir: getTemplatesDir('', 'user') },
        ]

        for (const { scope, dir } of scopes) {
          if (!await fs.pathExists(dir)) continue

          const entries = await fs.readdir(dir)

          // Scan root for registry-installed .pdpkg files
          const rootPdpkgs = entries.filter(f => f.endsWith('.pdpkg'))
          for (const fileName of rootPdpkgs) {
            const item = await readTemplatePdpkg(path.join(dir, fileName), fileName, scope, 'registry')
            if (item) templates.push(item)
          }

          // Scan local/ subdirectory for user-created templates
          const localDir = path.join(dir, 'local')
          if (await fs.pathExists(localDir)) {
            const localFiles = await fs.readdir(localDir)
            const localPdpkgs = localFiles.filter(f => f.endsWith('.pdpkg'))

            for (const fileName of localPdpkgs) {
              const item = await readTemplatePdpkg(path.join(localDir, fileName), fileName, scope, 'local')
              if (item) templates.push(item)
            }
          }
        }

        return { success: true, templates }
      } catch (err) {
        console.error('[Template IPC] list error:', err.message)
        return { success: false, error: err.message, templates: [] }
      }
    })

    // Delete a template
    ipcMain.handle('template:delete', async (_event, workspacePath, fileName, scope) => {
      try {
        if (!fileName || !scope) {
          return { success: false, error: 'fileName and scope are required' }
        }

        // Sanitize fileName: must not contain path separators or traversal sequences
        if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
          return { success: false, error: 'Invalid file name' }
        }

        const templatesDir = getTemplatesDir(workspacePath, scope)

        // Check local/ first, then fall back to root for backward compat
        const localPath = path.join(templatesDir, 'local', fileName)
        const rootPath = path.join(templatesDir, fileName)
        const filePath = (await fs.pathExists(localPath)) ? localPath : rootPath

        // Security: ensure path is within templates directory
        const resolvedPath = path.resolve(filePath)
        const resolvedDir = path.resolve(templatesDir)
        if (!resolvedPath.startsWith(resolvedDir + path.sep) && resolvedPath !== resolvedDir) {
          return { success: false, error: 'Invalid file path' }
        }

        if (!await fs.pathExists(filePath)) {
          return { success: false, error: 'Template not found' }
        }

        await fs.remove(filePath)
        console.log('[Template IPC] Deleted template:', filePath)
        return { success: true }
      } catch (err) {
        console.error('[Template IPC] delete error:', err.message)
        return { success: false, error: err.message }
      }
    })

    // Insert a template (extract files + return template data)
    ipcMain.handle('template:insert', async (_event, workspacePath, fileName, scope, workflowFilePath) => {
      try {
        if (!fileName || !scope) {
          return { success: false, error: 'fileName and scope are required' }
        }

        // Sanitize fileName: must not contain path separators or traversal sequences
        if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
          return { success: false, error: 'Invalid file name' }
        }

        const templatesDir = getTemplatesDir(workspacePath, scope)

        // Check local/ first, then fall back to root for backward compat
        const localPath = path.join(templatesDir, 'local', fileName)
        const rootPath = path.join(templatesDir, fileName)
        const filePath = (await fs.pathExists(localPath)) ? localPath : rootPath

        // Security: ensure path is within templates directory
        const resolvedPath = path.resolve(filePath)
        const resolvedDir = path.resolve(templatesDir)
        if (!resolvedPath.startsWith(resolvedDir + path.sep) && resolvedPath !== resolvedDir) {
          return { success: false, error: 'Invalid file path' }
        }

        if (!await fs.pathExists(filePath)) {
          return { success: false, error: 'Template not found' }
        }

        const zipBuffer = await fs.readFile(filePath)
        const zip = await JSZip.loadAsync(zipBuffer)

        // Read manifest
        const manifestFile = zip.file('prompd.json')
        if (!manifestFile) {
          return { success: false, error: 'Invalid template: missing prompd.json' }
        }

        const manifestText = await manifestFile.async('string')
        const template = JSON.parse(manifestText)

        // Extract bundled files to workspace (skip existing)
        const extractedFiles = []
        const skippedFiles = []

        const allFiles = []
        zip.forEach((relativePath, file) => {
          if (relativePath !== 'prompd.json' && !file.dir) {
            allFiles.push({ relativePath, file })
          }
        })

        for (const { relativePath, file } of allFiles) {
          const targetPath = path.join(workspacePath, relativePath)

          // Security: ensure extracted path stays within workspace
          const resolvedTarget = path.resolve(targetPath)
          const resolvedWorkspace = path.resolve(workspacePath)
          if (!resolvedTarget.startsWith(resolvedWorkspace + path.sep) && resolvedTarget !== resolvedWorkspace) {
            console.warn('[Template IPC] Skipping path traversal attempt:', relativePath)
            continue
          }

          if (await fs.pathExists(targetPath)) {
            skippedFiles.push(relativePath)
            console.log('[Template IPC] Skipping existing file:', relativePath)
          } else {
            await fs.ensureDir(path.dirname(targetPath))
            const content = await file.async('nodebuffer')
            await fs.writeFile(targetPath, content)
            extractedFiles.push(relativePath)
            console.log('[Template IPC] Extracted file:', relativePath)
          }
        }

        // Convert workspace-relative paths in nodeData to workflow-file-relative
        // so that the inserted node references files correctly from the target workflow's location.
        // Only convert if paths were explicitly marked as workspace-relative during save.
        // pathsConverted === true means save converted workflow-relative -> workspace-relative.
        // pathsConverted === false or undefined means paths are workflow-relative (no conversion needed).
        const ntInsertSection = template['node-template']
        const pathsConverted = ntInsertSection?.pathsConverted
        const shouldConvertPaths = pathsConverted === true
        if (shouldConvertPaths && workflowFilePath) {
          const workflowDir = path.dirname(workflowFilePath)
          convertTemplateFilePaths(template, (wsRelPath) => {
            const absPath = path.resolve(workspacePath, wsRelPath)
            let wfRel = path.relative(workflowDir, absPath).replace(/\\/g, '/')
            // Ensure relative paths start with ./ so the executor recognizes them as file refs
            if (!wfRel.startsWith('../') && !wfRel.startsWith('./')) {
              wfRel = './' + wfRel
            }
            console.log('[Template IPC] Path conversion (insert):', wsRelPath, '->', wfRel)
            return wfRel
          })
          console.log('[Template IPC] Converted node paths from workspace-relative to workflow-relative')
        } else if (shouldConvertPaths && !workflowFilePath) {
          // No workflow file path (unsaved workflow) — add ./ prefix to workspace-relative paths
          // so the executor recognizes them as file refs resolved from workspace root
          convertTemplateFilePaths(template, (wsRelPath) => {
            const wfRel = wsRelPath.startsWith('./') ? wsRelPath : './' + wsRelPath
            console.log('[Template IPC] Path prefix (insert, no workflow path):', wsRelPath, '->', wfRel)
            return wfRel
          })
          console.log('[Template IPC] Added ./ prefix to workspace-relative paths (no workflow file path)')
        } else if (pathsConverted === false) {
          console.log('[Template IPC] Skipping path conversion — template paths are already workflow-relative')
        }

        console.log('[Template IPC] Inserted template:', template.name,
          'extracted:', extractedFiles.length, 'skipped:', skippedFiles.length)

        return {
          success: true,
          template,
          extractedFiles,
          skippedFiles,
        }
      } catch (err) {
        console.error('[Template IPC] insert error:', err.message)
        return { success: false, error: err.message }
      }
    })

    console.log('[Template IPC] Registered 4 handlers')
  }
}

module.exports = { TemplateIpcRegistration }

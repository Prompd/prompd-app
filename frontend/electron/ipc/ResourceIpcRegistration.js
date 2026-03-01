/**
 * ResourceIpcRegistration — IPC handlers for resource:* channels
 *
 * Handles: resource:listInstalled, resource:delete, resource:getManifest
 *
 * Scans installed resources across type-specific directories:
 * - <workspace>/.prompd/{packages,workflows,templates,skills}/ (project-specific)
 * - ~/.prompd/{packages,workflows,templates,skills}/ (user-level, shared across workspaces)
 */

const { BaseIpcRegistration } = require('./IpcRegistration')
const fs = require('fs-extra')
const path = require('path')
const os = require('os')
const AdmZip = require('adm-zip')

// Maps resource type to directory name
const TYPE_DIRS = {
  'package': 'packages',
  'workflow': 'workflows',
  'node-template': 'templates',
  'skill': 'skills',
}

// Reverse map: directory name -> resource type
const DIR_TYPES = Object.fromEntries(
  Object.entries(TYPE_DIRS).map(([type, dir]) => [dir, type])
)

/**
 * Read a resource manifest from inside a .pdpkg archive (ZIP).
 * Looks for prompd.json at the archive root.
 *
 * @param {string} pkgPath - Absolute path to the .pdpkg file
 * @param {string} resourceType - The expected resource type
 * @param {string} scope - 'workspace' or 'user'
 * @returns {object|null} Resource info or null if no manifest in archive
 */
function readPdpkgManifest(pkgPath, resourceType, scope) {
  try {
    const zip = new AdmZip(pkgPath)
    const manifestEntry = zip.getEntry('prompd.json')
    if (!manifestEntry) return null

    const manifest = JSON.parse(manifestEntry.getData().toString('utf8'))
    const fallbackName = path.basename(pkgPath, '.pdpkg')

    return {
      name: manifest.name || fallbackName,
      version: manifest.version || '0.0.0',
      type: manifest.type || resourceType,
      scope,
      path: pkgPath,
      description: manifest.description || '',
      tools: manifest.tools || undefined,
      mcps: manifest.mcps || undefined,
      main: manifest.main || undefined,
      isArchive: true,
    }
  } catch (err) {
    console.warn('[Resource IPC] Failed to read .pdpkg manifest:', pkgPath, err.message)
    return null
  }
}

/**
 * Scan version subdirectories within a package name directory.
 * CLI installs to: .prompd/{typeDir}/[name|@scope/name]/{version}/prompd.json
 * Falls back to reading prompd.json directly from the name dir (flat layout).
 *
 * @param {string} nameDir - Absolute path to the name directory
 * @param {string} fallbackName - Package name for manifest fallback
 * @param {string} resourceType - The expected resource type
 * @param {string} scope - 'workspace' or 'user'
 * @returns {Promise<Array>} Array of resource info objects (one per version)
 */
async function scanVersionDirs(nameDir, fallbackName, resourceType, scope) {
  const resources = []

  // Check if prompd.json exists directly in the name dir (flat layout)
  const directManifest = path.join(nameDir, 'prompd.json')
  if (await fs.pathExists(directManifest)) {
    const resource = await readResourceManifest(nameDir, fallbackName, resourceType, scope)
    if (resource) resources.push(resource)
    return resources
  }

  // Otherwise scan version subdirectories
  const versionEntries = await fs.readdir(nameDir, { withFileTypes: true })
  for (const vEntry of versionEntries) {
    if (!vEntry.isDirectory()) continue
    const versionDir = path.join(nameDir, vEntry.name)
    const resource = await readResourceManifest(versionDir, fallbackName, resourceType, scope)
    if (resource) resources.push(resource)
  }

  return resources
}

/**
 * Scan a type directory for installed resources.
 * Structure: .prompd/{typeDir}/[@scope/]name/{version}/prompd.json
 *
 * @param {string} baseDir - The .prompd root (workspace or user home)
 * @param {string} typeDir - The type subdirectory name (packages, workflows, etc.)
 * @param {string} resourceType - The resource type key
 * @param {string} scope - 'workspace' or 'user'
 * @returns {Promise<Array>} Array of resource info objects
 */
async function scanTypeDir(baseDir, typeDir, resourceType, scope) {
  const resources = []
  const typePath = path.join(baseDir, typeDir)

  if (!await fs.pathExists(typePath)) return resources

  const entries = await fs.readdir(typePath, { withFileTypes: true })

  for (const entry of entries) {
    // Handle .pdpkg archives sitting directly in the type directory
    if (entry.isFile() && entry.name.endsWith('.pdpkg')) {
      const pkgPath = path.join(typePath, entry.name)
      const resource = readPdpkgManifest(pkgPath, resourceType, scope)
      if (resource) resources.push(resource)
      continue
    }

    if (!entry.isDirectory()) continue

    // Skip the local/ subdirectory in the main loop — scanned separately below
    if (entry.name === 'local') continue

    if (entry.name.startsWith('@')) {
      // Scoped: @scope/name/{version}/
      const scopeDir = path.join(typePath, entry.name)
      const scopeEntries = await fs.readdir(scopeDir, { withFileTypes: true })

      for (const scopeEntry of scopeEntries) {
        if (!scopeEntry.isDirectory()) continue
        const nameDir = path.join(scopeDir, scopeEntry.name)
        const found = await scanVersionDirs(
          nameDir,
          `${entry.name}/${scopeEntry.name}`,
          resourceType,
          scope
        )
        resources.push(...found)
      }
    } else {
      // Unscoped: name/{version}/
      const nameDir = path.join(typePath, entry.name)
      const found = await scanVersionDirs(nameDir, entry.name, resourceType, scope)
      resources.push(...found)
    }
  }

  // For templates and workflows, also scan local/ subdirectory for user-created .pdpkg files
  if (resourceType === 'node-template' || resourceType === 'workflow') {
    const localPath = path.join(typePath, 'local')
    if (await fs.pathExists(localPath)) {
      const localEntries = await fs.readdir(localPath, { withFileTypes: true })
      for (const entry of localEntries) {
        if (entry.isFile() && entry.name.endsWith('.pdpkg')) {
          const pkgPath = path.join(localPath, entry.name)
          const resource = readPdpkgManifest(pkgPath, resourceType, scope)
          if (resource) {
            resource.origin = 'local'
            resources.push(resource)
          }
        }
      }
    }
  }

  return resources
}

/**
 * Read a resource's prompd.json manifest and return resource info.
 *
 * @param {string} resourceDir - Absolute path to the resource directory
 * @param {string} fallbackName - Fallback name if manifest has no name field
 * @param {string} resourceType - The expected resource type
 * @param {string} scope - 'workspace' or 'user'
 * @returns {Promise<object|null>} Resource info or null if no manifest
 */
async function readResourceManifest(resourceDir, fallbackName, resourceType, scope) {
  const manifestPath = path.join(resourceDir, 'prompd.json')

  if (!await fs.pathExists(manifestPath)) return null

  try {
    const manifest = await fs.readJson(manifestPath)
    return {
      name: manifest.name || fallbackName,
      version: manifest.version || '0.0.0',
      type: manifest.type || resourceType,
      scope,
      path: resourceDir,
      description: manifest.description || '',
      tools: manifest.tools || undefined,
      mcps: manifest.mcps || undefined,
      main: manifest.main || undefined,
    }
  } catch (err) {
    console.warn('[Resource IPC] Failed to read manifest:', manifestPath, err.message)
    return null
  }
}

class ResourceIpcRegistration extends BaseIpcRegistration {
  constructor() {
    super('Resource')
  }

  /**
   * Register all resource IPC handlers.
   * @param {Electron.IpcMain} ipcMain
   */
  register(ipcMain) {
    // List all installed resources from both workspace and user directories
    ipcMain.handle('resource:listInstalled', async (_event, workspacePath) => {
      try {
        const resources = []

        // Scan user-level (global) resources: ~/.prompd/{typeDir}/
        const userBase = path.join(os.homedir(), '.prompd')
        for (const [type, dir] of Object.entries(TYPE_DIRS)) {
          const found = await scanTypeDir(userBase, dir, type, 'user')
          resources.push(...found)
        }

        // Scan workspace-level (local) resources: <workspace>/.prompd/{typeDir}/
        if (workspacePath) {
          const wsBase = path.join(workspacePath, '.prompd')
          for (const [type, dir] of Object.entries(TYPE_DIRS)) {
            const found = await scanTypeDir(wsBase, dir, type, 'workspace')
            resources.push(...found)
          }
        }

        // Deduplicate: same name+version+scope can appear in multiple type dirs
        // (e.g., CLI bug installs skill to packages/ instead of skills/).
        // Keep the entry where the directory type matches the manifest type.
        const seen = new Map()
        for (const r of resources) {
          const key = `${r.name}@${r.version}:${r.scope}`
          const existing = seen.get(key)
          if (!existing) {
            seen.set(key, r)
          } else {
            // Prefer the entry whose directory matches the manifest type
            const rDirType = r.path.includes(path.sep + TYPE_DIRS[r.type] + path.sep)
            const existingDirType = existing.path.includes(path.sep + TYPE_DIRS[existing.type] + path.sep)
            if (rDirType && !existingDirType) {
              seen.set(key, r)
            }
          }
        }
        const deduplicated = Array.from(seen.values())

        console.log('[Resource IPC] Found', deduplicated.length, 'installed resources')
        return { success: true, resources: deduplicated }
      } catch (err) {
        console.error('[Resource IPC] listInstalled error:', err.message)
        return { success: false, error: err.message, resources: [] }
      }
    })

    // Delete an installed resource directory
    ipcMain.handle('resource:delete', async (_event, resourcePath) => {
      try {
        if (!resourcePath) {
          return { success: false, error: 'Resource path is required' }
        }

        // Security: validate the path is within a .prompd type directory
        const resolvedPath = path.resolve(resourcePath)
        const userBase = path.resolve(os.homedir(), '.prompd')
        const isInUserDir = resolvedPath.startsWith(userBase + path.sep)

        // Check if it's within any valid type directory
        const validTypeDirs = Object.values(TYPE_DIRS)
        let isValidPath = false
        if (isInUserDir) {
          const relToBase = path.relative(userBase, resolvedPath)
          const firstSegment = relToBase.split(path.sep)[0]
          isValidPath = validTypeDirs.includes(firstSegment)
        }

        // Also check workspace-level .prompd directories
        if (!isValidPath) {
          // Path should contain .prompd/{typeDir}/ somewhere
          const prompdIdx = resolvedPath.indexOf(path.sep + '.prompd' + path.sep)
          if (prompdIdx >= 0) {
            const afterPrompd = resolvedPath.substring(prompdIdx + path.sep.length + '.prompd'.length + path.sep.length)
            const firstSegment = afterPrompd.split(path.sep)[0]
            isValidPath = validTypeDirs.includes(firstSegment)
          }
        }

        if (!isValidPath) {
          return { success: false, error: 'Invalid resource path: must be within a .prompd type directory' }
        }

        if (!await fs.pathExists(resolvedPath)) {
          return { success: false, error: 'Resource not found' }
        }

        await fs.remove(resolvedPath)
        console.log('[Resource IPC] Deleted resource:', resolvedPath)
        return { success: true }
      } catch (err) {
        console.error('[Resource IPC] delete error:', err.message)
        return { success: false, error: err.message }
      }
    })

    // Read a resource's prompd.json manifest (supports directories and .pdpkg archives)
    ipcMain.handle('resource:getManifest', async (_event, resourcePath) => {
      try {
        if (!resourcePath) {
          return { success: false, error: 'Resource path is required' }
        }

        // Handle .pdpkg archive files — read manifest from inside the ZIP
        if (resourcePath.endsWith('.pdpkg')) {
          if (!await fs.pathExists(resourcePath)) {
            return { success: false, error: 'Package archive not found' }
          }
          const zip = new AdmZip(resourcePath)
          const manifestEntry = zip.getEntry('prompd.json')
          if (!manifestEntry) {
            return { success: false, error: 'No prompd.json found in package archive' }
          }
          const manifest = JSON.parse(manifestEntry.getData().toString('utf8'))
          return { success: true, manifest }
        }

        // Handle extracted directories
        const manifestPath = path.join(resourcePath, 'prompd.json')
        if (!await fs.pathExists(manifestPath)) {
          return { success: false, error: 'No prompd.json found at resource path' }
        }

        const manifest = await fs.readJson(manifestPath)
        return { success: true, manifest }
      } catch (err) {
        console.error('[Resource IPC] getManifest error:', err.message)
        return { success: false, error: err.message }
      }
    })

    console.log('[Resource IPC] Registered 3 handlers')
  }
}

module.exports = { ResourceIpcRegistration }

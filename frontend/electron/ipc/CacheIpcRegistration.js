/**
 * CacheIpcRegistration — IPC handlers for cache:* channels
 *
 * Manages disk-based package cache at ~/.prompd/cache/
 * Packages are extracted from registry ZIPs and stored as files on disk,
 * enabling direct filesystem access for compilation and execution.
 *
 * Handlers: cache:list, cache:readFile, cache:download, cache:delete, cache:getPath
 */

const { BaseIpcRegistration } = require('./IpcRegistration')
const fs = require('fs-extra')
const path = require('path')
const os = require('os')
const AdmZip = require('adm-zip')
const https = require('https')
const http = require('http')

/**
 * Get the base cache directory path
 * @returns {string}
 */
function getCachePath() {
  return path.join(os.homedir(), '.prompd', 'cache')
}

/**
 * Build a file tree from a directory on disk
 * @param {string} dirPath - Absolute path to scan
 * @param {string} relativeTo - Base path for computing relative paths
 * @returns {Array<{name: string, path: string, kind: 'file' | 'folder', children?: Array}>}
 */
function buildFileTree(dirPath, relativeTo) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  const result = []

  // Sort: folders first, then files, alphabetical
  const sorted = [...entries].sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1
    if (!a.isDirectory() && b.isDirectory()) return 1
    return a.name.localeCompare(b.name)
  })

  for (const entry of sorted) {
    const fullPath = path.join(dirPath, entry.name)
    const relPath = path.relative(relativeTo, fullPath).replace(/\\/g, '/')

    if (entry.isDirectory()) {
      result.push({
        name: entry.name,
        path: relPath,
        kind: 'folder',
        children: buildFileTree(fullPath, relativeTo)
      })
    } else {
      result.push({
        name: entry.name,
        path: relPath,
        kind: 'file'
      })
    }
  }

  return result
}

/**
 * Parse a scoped package name into directory components
 * e.g. "@prompd/core" -> ["@prompd", "core"]
 * e.g. "my-package" -> ["my-package"]
 * @param {string} packageName
 * @returns {string[]}
 */
function packageNameToParts(packageName) {
  if (packageName.startsWith('@')) {
    const slashIdx = packageName.indexOf('/')
    if (slashIdx > 0) {
      return [packageName.substring(0, slashIdx), packageName.substring(slashIdx + 1)]
    }
  }
  return [packageName]
}

/**
 * Get the disk path for a cached package
 * @param {string} packageName
 * @param {string} version
 * @returns {string}
 */
function getPackageCachePath(packageName, version) {
  const parts = packageNameToParts(packageName)
  return path.join(getCachePath(), ...parts, version)
}

/**
 * Build the download URL for a package from the registry
 * @param {string} registryUrl - Base registry URL
 * @param {string} packageName - e.g. "@prompd/core"
 * @param {string} [version] - e.g. "0.2.0"
 * @returns {string}
 */
function buildDownloadUrl(registryUrl, packageName, version) {
  const base = registryUrl.replace(/\/$/, '')
  // Registry expects: /packages/@scope/name/download/version
  // Package name already includes @ and / for scoped packages
  if (version) {
    return `${base}/packages/${packageName}/download/${version}`
  }
  return `${base}/packages/${packageName}/download`
}

/**
 * Fetch a URL and return the response body as a Buffer.
 * Follows redirects (up to 5).
 * @param {string} url
 * @param {number} [maxRedirects=5]
 * @returns {Promise<Buffer>}
 */
function fetchBuffer(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const transport = url.startsWith('https') ? https : http

    transport.get(url, (res) => {
      // Follow redirects
      if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) && res.headers.location) {
        if (maxRedirects <= 0) {
          reject(new Error('Too many redirects'))
          return
        }
        const redirectUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href
        fetchBuffer(redirectUrl, maxRedirects - 1).then(resolve, reject)
        return
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`))
        return
      }

      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

class CacheIpcRegistration extends BaseIpcRegistration {
  constructor() {
    super('CacheIpc')
  }

  register(ipcMain) {
    // List all cached packages with their file trees
    ipcMain.handle('cache:list', async () => {
      try {
        const cachePath = getCachePath()
        if (!fs.existsSync(cachePath)) {
          return { success: true, packages: [] }
        }

        const packages = []
        const topEntries = fs.readdirSync(cachePath, { withFileTypes: true })

        // Skip system directories that aren't cached packages
        const SKIP_DIRS = new Set(['packages', 'workflows', 'templates', 'skills', 'local', 'node_modules'])

        for (const entry of topEntries) {
          if (!entry.isDirectory()) continue
          if (SKIP_DIRS.has(entry.name)) continue

          if (entry.name.startsWith('@')) {
            // Scoped packages: @scope/name/version/
            const scopePath = path.join(cachePath, entry.name)
            const scopeEntries = fs.readdirSync(scopePath, { withFileTypes: true })

            for (const pkgEntry of scopeEntries) {
              if (!pkgEntry.isDirectory()) continue
              const pkgPath = path.join(scopePath, pkgEntry.name)
              const pkgName = `${entry.name}/${pkgEntry.name}`

              // Each subdirectory is a version
              const versionEntries = fs.readdirSync(pkgPath, { withFileTypes: true })
              for (const verEntry of versionEntries) {
                if (!verEntry.isDirectory()) continue
                const verPath = path.join(pkgPath, verEntry.name)

                // Read manifest if available
                let description = ''
                const manifestPath = path.join(verPath, 'prompd.json')
                if (fs.existsSync(manifestPath)) {
                  try {
                    const manifest = fs.readJsonSync(manifestPath)
                    description = manifest.description || ''
                  } catch { /* ignore */ }
                }

                packages.push({
                  name: pkgName,
                  version: verEntry.name,
                  path: verPath,
                  description,
                  files: buildFileTree(verPath, verPath)
                })
              }
            }
          } else {
            // Unscoped packages: name/version/
            const pkgPath = path.join(cachePath, entry.name)
            const versionEntries = fs.readdirSync(pkgPath, { withFileTypes: true })

            for (const verEntry of versionEntries) {
              if (!verEntry.isDirectory()) continue
              const verPath = path.join(pkgPath, verEntry.name)

              let description = ''
              const manifestPath = path.join(verPath, 'prompd.json')
              if (fs.existsSync(manifestPath)) {
                try {
                  const manifest = fs.readJsonSync(manifestPath)
                  description = manifest.description || ''
                } catch { /* ignore */ }
              }

              packages.push({
                name: entry.name,
                version: verEntry.name,
                path: verPath,
                description,
                files: buildFileTree(verPath, verPath)
              })
            }
          }
        }

        return { success: true, packages }
      } catch (error) {
        console.error('[Cache] Failed to list cache:', error)
        return { success: false, error: error.message, packages: [] }
      }
    })

    // Read a file from the cache
    ipcMain.handle('cache:readFile', async (_event, filePath) => {
      try {
        // Security: ensure the path is within the cache directory
        const cachePath = getCachePath()
        const resolved = path.resolve(filePath)
        if (!resolved.startsWith(cachePath)) {
          return { success: false, error: 'Path outside cache directory' }
        }

        if (!fs.existsSync(resolved)) {
          return { success: false, error: 'File not found' }
        }

        const content = fs.readFileSync(resolved, 'utf8')
        return { success: true, content }
      } catch (error) {
        console.error('[Cache] Failed to read file:', error)
        return { success: false, error: error.message }
      }
    })

    // Download a package from registry and extract to cache
    ipcMain.handle('cache:download', async (_event, packageName, version) => {
      console.log('[Cache] Downloading package:', packageName, version || 'latest')

      try {
        const targetPath = getPackageCachePath(packageName, version || 'latest')

        // Check if already cached
        if (fs.existsSync(targetPath) && fs.readdirSync(targetPath).length > 0) {
          console.log('[Cache] Package already cached at:', targetPath)
          return {
            success: true,
            path: targetPath,
            files: buildFileTree(targetPath, targetPath),
            cached: true
          }
        }

        // Build download URL from registry
        // Read registry URL from config, falling back to env vars
        let registryUrl = process.env.VITE_REGISTRY_URL || 'https://registry.prompdhub.ai'
        try {
          const configPath = path.join(os.homedir(), '.prompd', 'config.yaml')
          if (fs.existsSync(configPath)) {
            const configContent = fs.readFileSync(configPath, 'utf8')
            const registryMatch = configContent.match(/registry_url:\s*['"]?([^\s'"]+)/)
            if (registryMatch) registryUrl = registryMatch[1]
          }
        } catch { /* use default */ }
        const downloadUrl = buildDownloadUrl(registryUrl, packageName, version)
        console.log('[Cache] Downloading from:', downloadUrl)

        // Download the package ZIP via HTTP(S)
        const zipBuffer = await fetchBuffer(downloadUrl)

        if (!zipBuffer || zipBuffer.length === 0) {
          return { success: false, error: 'Failed to download package from registry' }
        }

        // Ensure target directory exists
        fs.ensureDirSync(targetPath)

        // Extract ZIP to target path
        const zip = new AdmZip(zipBuffer)
        const zipEntries = zip.getEntries()

        for (const entry of zipEntries) {
          if (entry.isDirectory) continue

          // Security: prevent path traversal
          const entryPath = entry.entryName.replace(/\\/g, '/')
          if (entryPath.includes('..')) continue

          const outputPath = path.join(targetPath, entryPath)
          fs.ensureDirSync(path.dirname(outputPath))
          fs.writeFileSync(outputPath, entry.getData())
        }

        // If the version was 'latest', try to read actual version from manifest
        // and rename directory if needed
        let actualVersion = version
        const manifestPath = path.join(targetPath, 'prompd.json')
        if (fs.existsSync(manifestPath)) {
          try {
            const manifest = fs.readJsonSync(manifestPath)
            if (manifest.version && manifest.version !== version) {
              actualVersion = manifest.version
              const actualPath = getPackageCachePath(packageName, actualVersion)
              if (targetPath !== actualPath && !fs.existsSync(actualPath)) {
                fs.ensureDirSync(path.dirname(actualPath))
                fs.moveSync(targetPath, actualPath)
                console.log('[Cache] Renamed to actual version:', actualPath)
                return {
                  success: true,
                  path: actualPath,
                  version: actualVersion,
                  files: buildFileTree(actualPath, actualPath),
                  cached: false
                }
              }
            }
          } catch { /* ignore manifest read errors */ }
        }

        console.log('[Cache] Extracted to:', targetPath)
        return {
          success: true,
          path: targetPath,
          version: actualVersion,
          files: buildFileTree(targetPath, targetPath),
          cached: false
        }
      } catch (error) {
        console.error('[Cache] Download failed:', error)
        return { success: false, error: error.message }
      }
    })

    // Delete a cached package
    ipcMain.handle('cache:delete', async (_event, cachePath) => {
      try {
        // Security: ensure the path is within the cache directory
        const baseCachePath = getCachePath()
        const resolved = path.resolve(cachePath)
        if (!resolved.startsWith(baseCachePath)) {
          return { success: false, error: 'Path outside cache directory' }
        }

        if (fs.existsSync(resolved)) {
          fs.removeSync(resolved)
          console.log('[Cache] Deleted:', resolved)
        }

        return { success: true }
      } catch (error) {
        console.error('[Cache] Delete failed:', error)
        return { success: false, error: error.message }
      }
    })

    // Get the cache base path
    ipcMain.handle('cache:getPath', async () => {
      return { success: true, path: getCachePath() }
    })

    // Recursively scan any directory and return a file tree
    // Used by PackageExplorerPanel for installed packages (not just cache)
    ipcMain.handle('cache:fileTree', async (_event, dirPath) => {
      try {
        const resolved = path.resolve(dirPath)
        if (!fs.existsSync(resolved)) {
          return { success: false, error: 'Directory not found', files: [] }
        }
        const stat = fs.statSync(resolved)
        if (!stat.isDirectory()) {
          return { success: false, error: 'Not a directory', files: [] }
        }
        return { success: true, files: buildFileTree(resolved, resolved) }
      } catch (error) {
        console.error('[Cache] Failed to scan directory:', error)
        return { success: false, error: error.message, files: [] }
      }
    })

    console.log('[CacheIpc] Registered cache:list, cache:readFile, cache:download, cache:delete, cache:getPath, cache:fileTree')
  }
}

module.exports = { CacheIpcRegistration }

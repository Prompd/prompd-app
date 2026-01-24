/**
 * electron-builder afterPack hook
 *
 * Runs after the app is packed but BEFORE installers are created.
 * Tasks:
 * 1. Bundle @prompd/cli into node_modules (resolves file: dependency)
 * 2. Embed icon into Windows executable
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

/**
 * Copy @prompd/cli from the linked location into the packed app's node_modules
 */
function bundlePrompdCli(context) {
  const cliSourcePath = path.resolve(__dirname, '..', '..', '..', 'prompd-cli', 'cli', 'npm')
  const appNodeModules = path.join(context.appOutDir, 'resources', 'app', 'node_modules')
  const cliDestPath = path.join(appNodeModules, '@prompd', 'cli')

  console.log('[afterPack] Bundling @prompd/cli...')
  console.log('[afterPack] Source:', cliSourcePath)
  console.log('[afterPack] Destination:', cliDestPath)

  if (!fs.existsSync(cliSourcePath)) {
    console.warn('[afterPack] WARNING: @prompd/cli source not found at', cliSourcePath)
    console.warn('[afterPack] Local compilation features will be unavailable')
    return
  }

  // Create @prompd directory if needed
  const prompdDir = path.join(appNodeModules, '@prompd')
  if (!fs.existsSync(prompdDir)) {
    fs.mkdirSync(prompdDir, { recursive: true })
  }

  // Copy the CLI dist and package.json (not the entire source)
  const filesToCopy = ['dist', 'package.json']

  if (fs.existsSync(cliDestPath)) {
    fs.rmSync(cliDestPath, { recursive: true, force: true })
  }
  fs.mkdirSync(cliDestPath, { recursive: true })

  for (const file of filesToCopy) {
    const src = path.join(cliSourcePath, file)
    const dest = path.join(cliDestPath, file)

    if (fs.existsSync(src)) {
      if (fs.statSync(src).isDirectory()) {
        copyDirSync(src, dest)
      } else {
        fs.copyFileSync(src, dest)
      }
      console.log('[afterPack] Copied:', file)
    } else {
      console.warn('[afterPack] WARNING: Missing', file, '- run `npm run build` in prompd-cli/cli/npm first')
    }
  }

  console.log('[afterPack] @prompd/cli bundled successfully')
}

/**
 * Recursively copy a directory
 */
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  const entries = fs.readdirSync(src, { withFileTypes: true })

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

// Find rcedit in electron-builder cache
function findRcedit() {
  const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local')
  const cacheDir = path.join(localAppData, 'electron-builder', 'Cache', 'winCodeSign')

  if (!fs.existsSync(cacheDir)) {
    console.log('[afterPack] electron-builder winCodeSign cache not found')
    return null
  }

  // Find any winCodeSign directory with rcedit
  const dirs = fs.readdirSync(cacheDir)
    .filter(d => fs.statSync(path.join(cacheDir, d)).isDirectory())

  for (const dir of dirs) {
    const rceditPath = path.join(cacheDir, dir, 'rcedit-x64.exe')
    if (fs.existsSync(rceditPath)) {
      return rceditPath
    }
  }

  return null
}

module.exports = async function(context) {
  // Bundle @prompd/cli for all platforms
  bundlePrompdCli(context)

  // Only run icon embedding for Windows builds
  if (context.electronPlatformName !== 'win32') {
    console.log('[afterPack] Skipping icon embedding (not Windows)')
    return
  }

  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`)
  const iconPath = path.join(__dirname, '..', 'public', 'logo.ico')

  console.log('[afterPack] Embedding icon into Windows executable...')
  console.log('[afterPack] Exe path:', exePath)
  console.log('[afterPack] Icon path:', iconPath)

  // Verify files exist
  if (!fs.existsSync(exePath)) {
    console.error('[afterPack] ERROR: Exe not found:', exePath)
    return
  }

  if (!fs.existsSync(iconPath)) {
    console.error('[afterPack] ERROR: Icon not found:', iconPath)
    return
  }

  // Find rcedit
  const rceditPath = findRcedit()
  if (!rceditPath) {
    console.error('[afterPack] ERROR: Could not find rcedit in electron-builder cache')
    console.error('[afterPack] The taskbar icon may show as Electron logo')
    return
  }

  console.log('[afterPack] Using rcedit:', rceditPath)

  try {
    execSync(`"${rceditPath}" "${exePath}" --set-icon "${iconPath}"`, {
      stdio: 'inherit'
    })
    console.log('[afterPack] Icon embedded successfully!')
  } catch (error) {
    console.error('[afterPack] ERROR: Failed to embed icon:', error.message)
  }
}
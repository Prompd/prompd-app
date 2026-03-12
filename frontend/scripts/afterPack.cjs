/**
 * electron-builder afterPack hook
 *
 * Runs after the app is packed but BEFORE installers are created.
 * Tasks:
 * 1. Verify @prompd/cli is installed from npm
 * 2. Embed icon into Windows executable
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

/**
 * Verify @prompd/cli exists in the packed app's node_modules (installed from npm)
 */
function verifyPrompdCli(context) {
  // @prompd/cli is in asarUnpack, so it lands in app.asar.unpacked/
  const unpackedPath = path.join(context.appOutDir, 'resources', 'app.asar.unpacked', 'node_modules', '@prompd', 'cli')
  const asarPath = path.join(context.appOutDir, 'resources', 'app', 'node_modules', '@prompd', 'cli')
  const cliPath = fs.existsSync(path.join(unpackedPath, 'package.json')) ? unpackedPath : asarPath

  console.log('[afterPack] Verifying @prompd/cli...')

  if (fs.existsSync(path.join(cliPath, 'package.json'))) {
    const pkg = JSON.parse(fs.readFileSync(path.join(cliPath, 'package.json'), 'utf8'))
    console.log('[afterPack] @prompd/cli', pkg.version, 'found (npm) at', cliPath)
  } else {
    console.error('[afterPack] ERROR: @prompd/cli not found in packed node_modules')
    console.error('[afterPack] Run `npm install` in frontend/ to install from npm')
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
  // Verify @prompd/cli is installed from npm
  verifyPrompdCli(context)

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
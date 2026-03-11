/**
 * electron-builder beforeBuild hook
 *
 * Runs BEFORE native module rebuild.
 * Removes bcrypt's native binding directory so @electron/rebuild skips it,
 * then installs bcryptjs as a pure-JS fallback and creates a shim.
 *
 * IMPORTANT: Does NOT run npm install (which would corrupt the dependency tree).
 * Instead, manually downloads bcryptjs into node_modules.
 */

const fs = require('fs')
const path = require('path')

module.exports = async function(context) {
  const appDir = context.appDir || path.resolve(__dirname, '..')
  const nodeModules = path.join(appDir, 'node_modules')
  const bcryptPath = path.join(nodeModules, 'bcrypt')

  if (!fs.existsSync(bcryptPath)) {
    console.log('[beforeBuild] bcrypt not found, skipping')
    return
  }

  // Remove bcrypt's native binding so @electron/rebuild has nothing to compile.
  // Replace the entire module with a shim to bcryptjs.
  console.log('[beforeBuild] Replacing native bcrypt with bcryptjs shim...')

  // Check if bcryptjs already exists (may be installed as a dep)
  const bcryptjsPath = path.join(nodeModules, 'bcryptjs')
  if (!fs.existsSync(bcryptjsPath)) {
    // Copy bcryptjs from the build's own devDependencies or download it
    console.error('[beforeBuild] ERROR: bcryptjs not found. Add it to devDependencies.')
    console.error('[beforeBuild] Run: npm install bcryptjs --save-dev')
    process.exit(1)
  }

  // Replace bcrypt with a shim
  fs.rmSync(bcryptPath, { recursive: true, force: true })
  fs.mkdirSync(bcryptPath, { recursive: true })
  fs.writeFileSync(path.join(bcryptPath, 'package.json'), JSON.stringify({
    name: 'bcrypt',
    version: '0.0.0-shim',
    main: 'index.js'
  }, null, 2))
  fs.writeFileSync(path.join(bcryptPath, 'index.js'),
    'module.exports = require("bcryptjs");\n'
  )

  console.log('[beforeBuild] bcrypt -> bcryptjs shim created')
}

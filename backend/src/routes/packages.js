import express from 'express'
import multer from 'multer'
import AdmZip from 'adm-zip'
import archiver from 'archiver'
import { auth } from '../middleware/auth.js'

const router = express.Router()

// SECURITY: Use memory storage for package files (don't persist to disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 1000, // Max 1000 files
    fieldSize: 1024 * 1024 // 1MB for text fields
  }
})

// Security constants
const MAX_PACKAGE_SIZE = 50 * 1024 * 1024 // 50MB
const SECRET_PATTERNS = [
  { name: 'AWS Key', pattern: /AKIA[0-9A-Z]{16}/ },
  { name: 'GitHub Token', pattern: /ghp_[a-zA-Z0-9]{36}/ },
  { name: 'Generic API Key', pattern: /(?:api[_-]?key|apikey)[\s:=]+['"]?([a-zA-Z0-9_\-]{20,})['"]?/i },
  { name: 'Private Key', pattern: /-----BEGIN (?:RSA|OPENSSH|EC|DSA) PRIVATE KEY-----/ },
  { name: 'JWT Token', pattern: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/ },
  { name: 'Anthropic Key', pattern: /sk-ant-[a-zA-Z0-9_-]{95,}/ },
  { name: 'OpenAI Key', pattern: /sk-[a-zA-Z0-9]{48}/ }
]

/**
 * SECURITY: Simple secrets detection for browser-based files
 */
function detectSecrets(content) {
  const found = []
  for (const { name, pattern } of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      found.push({ type: name })
    }
  }
  return found
}

/**
 * SECURITY: Validate package name format
 */
function validatePackageName(name) {
  if (!name || typeof name !== 'string') return false
  // Must be @namespace/package-name format
  return /^@[a-z0-9-~][a-z0-9-._~]*\/[a-z0-9-~][a-z0-9-._~]*$/.test(name)
}

/**
 * SECURITY: Validate semantic version
 */
function validateVersion(version) {
  if (!version || typeof version !== 'string') return false
  return /^\d+\.\d+\.\d+$/.test(version)
}

/**
 * POST /api/packages/create
 *
 * Create .pdpkg package from uploaded files
 *
 * SECURITY:
 * - Requires authentication (Clerk JWT)
 * - Scans for secrets
 * - Validates manifest structure
 * - Returns .pdpkg blob for download
 */
router.post('/create', auth, upload.array('files'), async (req, res, next) => {
  try {
    console.log('[Packages] Create request received')

    const { manifest, filePaths: filePathsJson } = req.body
    const files = req.files

    // SECURITY: Validate inputs
    if (!manifest) {
      return res.status(400).json({
        success: false,
        error: 'Missing manifest'
      })
    }

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded'
      })
    }

    // Parse file paths array (browsers strip path separators from FormData filenames)
    let filePaths = []
    if (filePathsJson) {
      try {
        filePaths = JSON.parse(filePathsJson)
      } catch (e) {
        console.warn('[Packages] Failed to parse filePaths, falling back to originalname')
      }
    }

    console.log(`[Packages] Processing ${files.length} files`)
    console.log(`[Packages] File paths received:`, filePaths)

    // Log file mapping for debugging
    files.forEach((file, i) => {
      const archivePath = filePaths[i] || file.originalname
      console.log(`[Packages] File ${i + 1}: "${file.originalname}" → archive: "${archivePath}" (${file.size} bytes)`)
    })

    // Parse manifest
    let manifestData
    try {
      manifestData = typeof manifest === 'string' ? JSON.parse(manifest) : manifest
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid manifest JSON'
      })
    }

    // SECURITY: Validate manifest
    if (!validatePackageName(manifestData.name)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid package name - must be @namespace/package-name'
      })
    }

    if (!validateVersion(manifestData.version)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid version - must be semantic version (x.y.z)'
      })
    }

    if (!manifestData.description || manifestData.description.length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Description must be at least 10 characters'
      })
    }

    console.log(`[Packages] Creating package: ${manifestData.name}@${manifestData.version}`)

    // SECURITY: Scan files for secrets
    const secretsFound = []
    const textExtensions = ['.prmd', '.md', '.txt', '.json', '.yaml', '.yml', '.js', '.ts', '.py', '.sh', '.csv', '.xml']

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const archivePath = filePaths[i] || file.originalname
      const ext = archivePath.substring(archivePath.lastIndexOf('.')).toLowerCase()
      const isText = textExtensions.includes(ext)

      if (isText && file.buffer) {
        const content = file.buffer.toString('utf-8')
        const secrets = detectSecrets(content)

        if (secrets.length > 0) {
          secretsFound.push({
            file: archivePath,
            secrets: secrets.map(s => s.type)
          })
        }
      }
    }

    if (secretsFound.length > 0) {
      console.log('[Packages] Secrets detected:', secretsFound)
      return res.status(400).json({
        success: false,
        error: 'Secrets detected in files',
        code: 'SECRETS_DETECTED',
        details: secretsFound
      })
    }

    // Create .pdpkg archive using archiver
    const archive = archiver('zip', { zlib: { level: 9 } })
    const chunks = []

    archive.on('data', chunk => chunks.push(chunk))
    archive.on('error', err => {
      console.error('[Packages] Archive error:', err)
      throw err
    })

    // Add prompd.json
    archive.append(JSON.stringify(manifestData, null, 2), { name: 'prompd.json' })

    // Add all uploaded files
    let totalSize = 0
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      // Use filePaths array for correct directory structure, fallback to originalname
      const archivePath = filePaths[i] || file.originalname

      // SECURITY: Validate file path (prevent traversal)
      let normalizedPath = archivePath.replace(/\\/g, '/').replace(/^\.\.\//, '')
      if (normalizedPath.includes('../') || normalizedPath.startsWith('/')) {
        return res.status(400).json({
          success: false,
          error: `Invalid file path: ${archivePath}`,
          code: 'PATH_TRAVERSAL'
        })
      }

      totalSize += file.size
      if (totalSize > MAX_PACKAGE_SIZE) {
        return res.status(400).json({
          success: false,
          error: `Package too large (max ${MAX_PACKAGE_SIZE / 1024 / 1024}MB)`,
          code: 'PACKAGE_TOO_LARGE'
        })
      }

      archive.append(file.buffer, { name: normalizedPath })
    }

    await archive.finalize()
    const packageBuffer = Buffer.concat(chunks)

    console.log(`[Packages] Package created: ${packageBuffer.length} bytes`)

    // Return .pdpkg as download
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${manifestData.name.replace('/', '-')}-${manifestData.version}.pdpkg"`)
    res.send(packageBuffer)

  } catch (error) {
    console.error('[Packages] Create error:', error)
    next(error)
  }
})

/**
 * POST /api/packages/publish
 *
 * Publish package to registry
 *
 * SECURITY:
 * - Requires authentication (Clerk JWT)
 * - Validates package structure
 * - Uses user's JWT to authenticate with registry
 * - Returns publish result
 */
router.post('/publish', auth, upload.single('package'), async (req, res, next) => {
  try {
    console.log('[Packages] Publish request received')

    const { manifest, registryApiKey, registryUrl: registryUrlOverride } = req.body
    const packageFile = req.file

    // SECURITY: Validate inputs
    if (!manifest) {
      return res.status(400).json({
        success: false,
        error: 'Missing manifest'
      })
    }

    if (!packageFile) {
      return res.status(400).json({
        success: false,
        error: 'No package file uploaded'
      })
    }

    console.log(`[Packages] Package file received: ${packageFile.size} bytes`)

    // Parse manifest
    let manifestData
    try {
      manifestData = typeof manifest === 'string' ? JSON.parse(manifest) : manifest
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid manifest JSON'
      })
    }

    console.log(`[Packages] Publishing: ${manifestData.name}@${manifestData.version}`)

    // SECURITY: Validate package is a valid ZIP
    let zip
    try {
      zip = new AdmZip(packageFile.buffer)
      const entries = zip.getEntries()

      // Verify prompd.json exists (or legacy manifest.json for backwards compatibility)
      const hasManifest = entries.some(e => e.entryName === 'prompd.json' || e.entryName === 'manifest.json')
      if (!hasManifest) {
        return res.status(400).json({
          success: false,
          error: 'Package missing prompd.json',
          code: 'INVALID_PACKAGE'
        })
      }

      // SECURITY: Check for path traversal in ZIP entries
      for (const entry of entries) {
        if (entry.entryName.includes('..') || entry.entryName.startsWith('/')) {
          return res.status(400).json({
            success: false,
            error: 'Invalid package structure (path traversal detected)',
            code: 'SECURITY_VIOLATION'
          })
        }
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid package archive',
        code: 'INVALID_ARCHIVE',
        details: error.message
      })
    }

    // Get user's JWT token from Clerk
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Missing authentication token'
      })
    }

    const userToken = authHeader.replace('Bearer ', '')

    // Use registry-specific API key if provided, otherwise fall back to Clerk JWT
    const publishToken = registryApiKey || userToken

    // Use provided registry URL if specified, otherwise fall back to env/default
    const registryUrl = registryUrlOverride || process.env.PROMPD_REGISTRY_URL || 'https://registry.prompdhub.ai'
    const endpoint = `${registryUrl}/packages/${encodeURIComponent(manifestData.name)}`

    console.log(`[Packages] Publishing to registry: ${endpoint}`)

    // Create FormData for registry upload
    const FormData = (await import('form-data')).default
    const formData = new FormData()
    formData.append('package', packageFile.buffer, {
      filename: `${manifestData.name.replace('/', '-')}-${manifestData.version}.pdpkg`,
      contentType: 'application/zip'
    })

    // Upload to registry
    const fetch = (await import('node-fetch')).default
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${publishToken}`,
        ...formData.getHeaders()
      },
      body: formData
    })

    console.log(`[Packages] Registry response: ${response.status} ${response.statusText}`)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Packages] Registry error:', errorText)

      return res.status(response.status).json({
        success: false,
        error: 'Registry publish failed',
        details: errorText,
        code: 'REGISTRY_ERROR'
      })
    }

    let result
    try {
      result = await response.json()
    } catch {
      result = { message: 'Published successfully' }
    }

    console.log(`[Packages] ✅ Published successfully: ${manifestData.name}@${manifestData.version}`)

    res.json({
      success: true,
      data: {
        name: manifestData.name,
        version: manifestData.version,
        published: true
      },
      message: `Successfully published ${manifestData.name}@${manifestData.version}`
    })

  } catch (error) {
    console.error('[Packages] Publish error:', error)
    next(error)
  }
})

export default router

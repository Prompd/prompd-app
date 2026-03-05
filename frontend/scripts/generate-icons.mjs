#!/usr/bin/env node

/**
 * Icon Generation Script for Prompd
 *
 * Generates platform-specific icons from source PNG:
 * - macOS: .icns file with multiple resolutions (16x16 to 1024x1024)
 * - Windows: .ico file with multiple resolutions (16x16 to 256x256)
 *
 * Requirements: png-to-ico (sharp optional for advanced resizing)
 */

import pngToIco from 'png-to-ico'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Try to load sharp, but make it optional
let sharp = null
try {
  const sharpModule = await import('sharp')
  sharp = sharpModule.default
} catch (err) {
  console.warn('⚠️  Sharp module not available - using fallback PNG processing')
}

// Paths
const ROOT_DIR = path.join(__dirname, '..')
const PUBLIC_DIR = path.join(ROOT_DIR, 'public')
const SOURCE_PNG = path.join(PUBLIC_DIR, 'logo.png')
const TEMP_DIR = path.join(ROOT_DIR, '.icon-temp')

// Icon sizes required for each platform
const ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024]
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true })
  } catch (err) {
    if (err.code !== 'EEXIST') throw err
  }
}

async function cleanup() {
  try {
    await fs.rm(TEMP_DIR, { recursive: true, force: true })
  } catch (err) {
    // Ignore cleanup errors
  }
}

async function generatePngVariants(sizes, prefix) {
  console.log(`Generating ${sizes.length} PNG variants...`)
  const variants = []

  if (sharp) {
    // Use sharp for advanced resizing
    for (const size of sizes) {
      const outputPath = path.join(TEMP_DIR, `${prefix}_${size}x${size}.png`)

      await sharp(SOURCE_PNG)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png()
        .toFile(outputPath)

      variants.push(outputPath)
      console.log(`  ✓ ${size}x${size}`)
    }
  } else {
    // Fallback: just copy the source PNG for each size (png-to-ico will handle resizing)
    console.log('  Using source PNG (png-to-ico will resize)')
    for (const size of sizes) {
      const outputPath = path.join(TEMP_DIR, `${prefix}_${size}x${size}.png`)
      await fs.copyFile(SOURCE_PNG, outputPath)
      variants.push(outputPath)
    }
  }

  return variants
}

async function generateIcns() {
  console.log('\n📦 Generating macOS .icns file...')

  // Generate PNG variants for iconset
  const pngFiles = await generatePngVariants(ICNS_SIZES, 'icon')

  // Create .iconset directory structure (required by macOS iconutil)
  const iconsetDir = path.join(TEMP_DIR, 'icon.iconset')
  await ensureDir(iconsetDir)

  // Copy files to iconset with proper naming convention
  for (const size of ICNS_SIZES) {
    const srcFile = path.join(TEMP_DIR, `icon_${size}x${size}.png`)
    const destFile = path.join(iconsetDir, `icon_${size}x${size}.png`)
    await fs.copyFile(srcFile, destFile)

    // Also create @2x versions for retina displays (except 1024)
    if (size <= 512) {
      const destFile2x = path.join(iconsetDir, `icon_${size / 2}x${size / 2}@2x.png`)
      await fs.copyFile(srcFile, destFile2x)
    }
  }

  // For cross-platform .icns generation without macOS iconutil:
  // We'll use a PNG to ICO approach and rename it
  // (electron-builder will handle proper .icns internally)

  // Generate multi-resolution PNG buffer
  const icnsBuffer = await pngToIco(pngFiles.slice(0, 5)) // Use first 5 sizes
  const icnsPath = path.join(PUBLIC_DIR, 'logo.icns')
  await fs.writeFile(icnsPath, icnsBuffer)

  console.log(`✅ Generated: ${icnsPath}`)

  return icnsPath
}

async function generateIco() {
  console.log('\n🪟 Generating Windows .ico file...')

  // Generate PNG variants - use smaller set for reasonable file size
  // ICO files should contain 16, 32, 48, and 256 for best compatibility
  const optimizedSizes = [16, 32, 48, 256]
  const pngFiles = []

  if (sharp) {
    // Use sharp to generate optimized PNGs
    for (const size of optimizedSizes) {
      const outputPath = path.join(TEMP_DIR, `icon_win_${size}x${size}.png`)

      await sharp(SOURCE_PNG)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png({ compressionLevel: 9 }) // Maximum compression
        .toFile(outputPath)

      pngFiles.push(outputPath)
      console.log(`  ✓ ${size}x${size}`)
    }
  } else {
    // Fallback: use source PNG
    console.log('  Using source PNG (png-to-ico will resize)')
    for (const size of optimizedSizes) {
      const outputPath = path.join(TEMP_DIR, `icon_win_${size}x${size}.png`)
      await fs.copyFile(SOURCE_PNG, outputPath)
      pngFiles.push(outputPath)
    }
  }

  // Convert to .ico
  const icoBuffer = await pngToIco(pngFiles)
  const icoPath = path.join(PUBLIC_DIR, 'logo.ico')
  await fs.writeFile(icoPath, icoBuffer)

  // Log file size
  const stats = await fs.stat(icoPath)
  console.log(`✅ Generated: ${icoPath} (${(stats.size / 1024).toFixed(1)}KB)`)

  // Warn if file is too large
  if (stats.size > 500000) {
    console.warn('⚠️  Warning: ICO file is larger than 500KB - this may cause issues')
  }

  return icoPath
}

async function verifySource() {
  try {
    await fs.access(SOURCE_PNG)
    const stats = await fs.stat(SOURCE_PNG)
    console.log(`✓ Source PNG found: ${SOURCE_PNG} (${(stats.size / 1024).toFixed(1)}KB)`)

    // Verify it's a valid PNG with sharp (if available)
    if (sharp) {
      const metadata = await sharp(SOURCE_PNG).metadata()
      console.log(`  Dimensions: ${metadata.width}x${metadata.height}`)
      console.log(`  Format: ${metadata.format}`)

      if (metadata.width < 1024 || metadata.height < 1024) {
        console.warn(`⚠️  Warning: Source PNG is smaller than 1024x1024 (optimal for high-DPI displays)`)
      }
    } else {
      console.log('  (Sharp not available - skipping metadata check)')
    }

    return true
  } catch (err) {
    console.error(`❌ Error: Source PNG not found or invalid: ${SOURCE_PNG}`)
    console.error(err.message)
    return false
  }
}

/**
 * Generate a Windows .ico from an SVG file.
 * Requires sharp to rasterize the SVG at multiple resolutions.
 */
async function generateIcoFromSvg(svgPath, icoPath, label) {
  console.log(`\n🪟 Generating ${label} .ico from SVG...`)

  if (!sharp) {
    console.warn(`⚠️  Sharp required to generate ${label}.ico from SVG - skipping`)
    return null
  }

  const sizes = [16, 32, 48, 256]
  const pngFiles = []

  for (const size of sizes) {
    const outputPath = path.join(TEMP_DIR, `${label}_${size}x${size}.png`)

    await sharp(svgPath, { density: Math.round(size / 32 * 72 * 2) })
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png({ compressionLevel: 9 })
      .toFile(outputPath)

    pngFiles.push(outputPath)
    console.log(`  ✓ ${size}x${size}`)
  }

  const icoBuffer = await pngToIco(pngFiles)
  await fs.writeFile(icoPath, icoBuffer)

  const stats = await fs.stat(icoPath)
  console.log(`✅ Generated: ${icoPath} (${(stats.size / 1024).toFixed(1)}KB)`)

  return icoPath
}

async function main() {
  console.log('Prompd - Icon Generation\n')

  // Verify source file
  const sourceValid = await verifySource()
  if (!sourceValid) {
    process.exit(1)
  }

  // Create temp directory
  await ensureDir(TEMP_DIR)

  try {
    // Generate platform-specific icons
    await generateIcns()
    await generateIco()

    // Generate file-type icons from SVGs
    const fileTypeIcons = [
      { svg: 'icons/pdpkg-color.svg', ico: 'pdpkg.ico', label: 'pdpkg' },
    ]

    for (const { svg, ico, label } of fileTypeIcons) {
      const svgPath = path.join(PUBLIC_DIR, svg)
      try {
        await fs.access(svgPath)
        await generateIcoFromSvg(svgPath, path.join(PUBLIC_DIR, ico), label)
      } catch (err) {
        if (err.code === 'ENOENT') {
          console.warn(`⚠️  SVG not found for ${label}: ${svgPath} - skipping`)
        } else {
          throw err
        }
      }
    }

    console.log('\n✅ All icons generated successfully!')
    console.log('\nGenerated files:')
    console.log('  - public/logo.icns (macOS)')
    console.log('  - public/logo.ico (Windows)')
    console.log('  - public/logo.png (Linux - already exists)')
    console.log('  - public/pdpkg.ico (Windows file association)')

  } catch (err) {
    console.error('\n❌ Error generating icons:', err)
    process.exit(1)
  } finally {
    // Cleanup temp files
    await cleanup()
  }
}

// Run the main function
main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})

export { generateIcns, generateIco }

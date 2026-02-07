#!/usr/bin/env node

/**
 * File Icon Generation Script
 *
 * Generates .ico files from SVG file type icons for Windows file associations
 */

import pngToIco from 'png-to-ico'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Try to load sharp
let sharp = null
try {
  const sharpModule = await import('sharp')
  sharp = sharpModule.default
} catch (err) {
  console.error('❌ Sharp is required for SVG conversion. Install it with: npm install sharp')
  process.exit(1)
}

const ROOT_DIR = path.join(__dirname, '..')
const ICONS_DIR = path.join(ROOT_DIR, 'public', 'icons')
const PUBLIC_DIR = path.join(ROOT_DIR, 'public')
const TEMP_DIR = path.join(ROOT_DIR, '.file-icon-temp')

// File type icons to generate
const FILE_ICONS = [
  { svg: 'prmd-color.svg', ico: 'prmd.ico', name: '.prmd files' },
  { svg: 'prompdflow-color.svg', ico: 'pdflow.ico', name: '.pdflow files' }
]

// ICO sizes for file associations (smaller set for reasonable file size)
const ICO_SIZES = [16, 32, 48, 256]

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

async function generateIcoFromSvg(svgPath, icoOutputPath, iconName) {
  console.log(`\n📄 Generating ${iconName}...`)

  // Read SVG
  const svgBuffer = await fs.readFile(svgPath)

  // Generate PNG variants at different sizes
  const pngFiles = []
  for (const size of ICO_SIZES) {
    const outputPath = path.join(TEMP_DIR, `${path.basename(svgPath, '.svg')}_${size}x${size}.png`)

    await sharp(svgBuffer)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png({ compressionLevel: 9 })
      .toFile(outputPath)

    pngFiles.push(outputPath)
    console.log(`  ✓ ${size}x${size}`)
  }

  // Convert PNGs to ICO
  const icoBuffer = await pngToIco(pngFiles)
  await fs.writeFile(icoOutputPath, icoBuffer)

  // Log file size
  const stats = await fs.stat(icoOutputPath)
  console.log(`✅ Generated: ${icoOutputPath} (${(stats.size / 1024).toFixed(1)}KB)`)

  return icoOutputPath
}

async function main() {
  console.log('Prompd - File Type Icon Generation\n')

  // Create temp directory
  await ensureDir(TEMP_DIR)

  try {
    const generatedFiles = []

    for (const icon of FILE_ICONS) {
      const svgPath = path.join(ICONS_DIR, icon.svg)
      const icoPath = path.join(PUBLIC_DIR, icon.ico)

      // Check if SVG exists
      try {
        await fs.access(svgPath)
      } catch (err) {
        console.warn(`⚠️  Warning: ${svgPath} not found, skipping...`)
        continue
      }

      await generateIcoFromSvg(svgPath, icoPath, icon.name)
      generatedFiles.push(icon.ico)
    }

    console.log('\n✅ All file icons generated successfully!')
    console.log('\nGenerated files:')
    generatedFiles.forEach(file => console.log(`  - public/${file}`))

    console.log('\n💡 Update package.json fileAssociations to use these icons:')
    console.log('   - .prmd → public/prmd.ico')
    console.log('   - .pdflow → public/pdflow.ico')

  } catch (err) {
    console.error('\n❌ Error generating file icons:', err)
    process.exit(1)
  } finally {
    await cleanup()
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})

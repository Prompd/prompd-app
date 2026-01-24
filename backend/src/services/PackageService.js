import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs/promises'
import { Package, LocalPackage } from '../models/Package.js'
import { RegistryClientService } from './RegistryClientService.js'

export class PackageService {
  constructor() {
    this.registryClient = new RegistryClientService()
    // IMPORTANT: This should be the CLI command name, NOT a path
    this.cliCommand = process.env.PROMPD_CLI_COMMAND || 'prompd'
  }

  /**
   * Search packages in registry
   */
  async searchPackages(query, options = {}) {
    try {
      const {
        category,
        sortBy = 'relevance',
        limit = 20,
        skip = 0,
        includePrivate = false
      } = options

      // First search local cache
      const localResults = await this.searchLocalPackages(query, options)
      
      // Then search registry
      let registryResults = []
      try {
        const registryResponse = await this.registryClient.searchPackages(query, options)
        registryResults = Array.isArray(registryResponse) ? registryResponse : []
      } catch (error) {
        console.warn('Registry search failed:', error.message)
        registryResults = []
      }

      // Merge and deduplicate results
      const allPackages = this.mergePackageResults(localResults, registryResults)

      // Apply additional filtering
      let filteredPackages = allPackages
      if (category && category !== 'all') {
        filteredPackages = allPackages.filter(pkg => pkg.category === category)
      }

      // Sort results
      filteredPackages = this.sortPackages(filteredPackages, sortBy)

      // Apply pagination
      const paginatedPackages = filteredPackages.slice(skip, skip + limit)

      return {
        packages: paginatedPackages,
        total: filteredPackages.length
      }
    } catch (error) {
      console.error('Package search error:', error)
      throw new Error(`Failed to search packages: ${error.message}`)
    }
  }

  /**
   * Search local package cache
   */
  async searchLocalPackages(query, options = {}) {
    try {
      const searchQuery = {
        isPrivate: false,
        isDeprecated: false
      }

      if (query) {
        searchQuery.$text = { $search: query }
      }

      if (options.category && options.category !== 'all') {
        searchQuery.category = options.category
      }

      const packages = await Package.find(searchQuery)
        .populate('maintainers.userId', 'username email')
        .sort(this.getSortOptions(options.sortBy))
        .limit(options.limit || 20)
        .skip(options.skip || 0)

      return packages.map(pkg => this.formatPackageForResponse(pkg))
    } catch (error) {
      console.error('Local package search error:', error)
      return []
    }
  }

  /**
   * Get package information
   */
  async getPackageInfo(packageName, version = 'latest') {
    try {
      // Try local cache first
      let packageInfo = await Package.findOne({ name: packageName })
        .populate('maintainers.userId', 'username email')

      if (packageInfo) {
        const versionData = packageInfo.getVersion(version)
        if (versionData) {
          return this.formatPackageForResponse(packageInfo, versionData)
        }
      }

      // Fallback to registry
      packageInfo = await this.registryClient.getPackageInfo(packageName, version)
      
      if (packageInfo) {
        // Cache the package info locally
        await this.cachePackageInfo(packageInfo)
      }

      return packageInfo
    } catch (error) {
      console.error('Get package info error:', error)
      throw new Error(`Failed to get package info: ${error.message}`)
    }
  }

  /**
   * Get package versions
   */
  async getPackageVersions(packageName) {
    try {
      // Try local cache first
      const localPackage = await Package.findOne({ name: packageName })
      if (localPackage && localPackage.versions.length > 0) {
        return localPackage.versions
          .map(v => v.version)
          .sort((a, b) => this.compareVersions(b, a)) // Latest first
      }

      // Fallback to registry
      return await this.registryClient.getPackageVersions(packageName)
    } catch (error) {
      console.error('Get package versions error:', error)
      throw new Error(`Failed to get package versions: ${error.message}`)
    }
  }

  /**
   * Install package to user's local environment
   */
  async installPackage(packageName, version = 'latest', userId, projectId = null) {
    try {
      // Get package info
      const packageInfo = await this.getPackageInfo(packageName, version)
      if (!packageInfo) {
        throw new Error('Package not found')
      }

      // Check if already installed
      const existingInstallation = await LocalPackage.findOne({
        userId,
        packageName,
        ...(projectId && { projectId })
      })

      if (existingInstallation) {
        // Update version if different
        if (existingInstallation.version !== version) {
          existingInstallation.version = version
          existingInstallation.lastUsed = new Date()
          await existingInstallation.save()
        }
        return {
          packageName,
          version,
          status: 'updated',
          installation: existingInstallation
        }
      }

      // Create new installation record
      const installation = new LocalPackage({
        userId,
        projectId,
        packageName,
        version,
        source: 'registry',
        configuration: new Map(),
        lastUsed: new Date(),
        usageCount: 1
      })

      await installation.save()

      // Update package download count
      await this.incrementDownloadCount(packageName, version)

      return {
        packageName,
        version,
        status: 'installed',
        installation
      }
    } catch (error) {
      console.error('Install package error:', error)
      throw new Error(`Failed to install package: ${error.message}`)
    }
  }

  /**
   * Uninstall package from user's environment
   */
  async uninstallPackage(packageName, userId, projectId = null) {
    try {
      const query = {
        userId,
        packageName
      }

      if (projectId) {
        query.projectId = projectId
      }

      const result = await LocalPackage.deleteOne(query)

      if (result.deletedCount === 0) {
        throw new Error('Package not found or not installed')
      }

      return {
        packageName,
        status: 'uninstalled',
        message: 'Package removed successfully'
      }
    } catch (error) {
      console.error('Uninstall package error:', error)
      throw new Error(`Failed to uninstall package: ${error.message}`)
    }
  }

  /**
   * Get user's locally installed packages
   */
  async getLocalPackages(userId, projectId = null) {
    try {
      const query = { userId }
      if (projectId) {
        query.projectId = projectId
      }

      const installations = await LocalPackage.find(query)
        .sort({ lastUsed: -1 })

      // Enrich with package info
      const enrichedPackages = await Promise.all(
        installations.map(async (installation) => {
          try {
            const packageInfo = await this.getPackageInfo(installation.packageName, installation.version)
            return {
              ...installation.toObject(),
              packageInfo
            }
          } catch (error) {
            return {
              ...installation.toObject(),
              packageInfo: null,
              error: 'Package info unavailable'
            }
          }
        })
      )

      return enrichedPackages
    } catch (error) {
      console.error('Get local packages error:', error)
      throw new Error(`Failed to get local packages: ${error.message}`)
    }
  }

  /**
   * Validate package structure and manifest using CLI
   */
  async validatePackage(manifest, files = []) {
    try {
      // First do basic validation locally
      const basicValidation = await this.validatePackageBasic(manifest, files)
      
      // Then validate using CLI if available
      try {
        const cliValidation = await this.validatePackageWithCLI(manifest, files)
        
        // Merge results
        return {
          isValid: basicValidation.isValid && cliValidation.isValid,
          errors: [...basicValidation.errors, ...cliValidation.errors],
          warnings: [...basicValidation.warnings, ...cliValidation.warnings],
          manifest,
          files,
          cliValidated: true
        }
      } catch (cliError) {
        console.warn('CLI validation unavailable:', cliError.message)
        return {
          ...basicValidation,
          cliValidated: false,
          cliError: cliError.message
        }
      }
    } catch (error) {
      console.error('Package validation error:', error)
      throw new Error(`Failed to validate package: ${error.message}`)
    }
  }

  /**
   * Basic package validation (without CLI)
   */
  async validatePackageBasic(manifest, files = []) {
    const errors = []
    const warnings = []

    // Validate manifest structure
    if (!manifest.name) {
      errors.push('Package name is required')
    } else if (!/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(manifest.name)) {
      errors.push('Invalid package name format')
    }

    if (!manifest.version) {
      errors.push('Package version is required')
    } else if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/.test(manifest.version)) {
      errors.push('Invalid semantic version format')
    }

    if (!manifest.description) {
      warnings.push('Package description is recommended')
    }

    // Validate parameters if present
    if (manifest.parameters) {
      Object.entries(manifest.parameters).forEach(([name, config]) => {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
          errors.push(`Invalid parameter name: ${name}`)
        }

        if (config.type && !['string', 'number', 'boolean', 'object', 'array', 'file'].includes(config.type)) {
          errors.push(`Invalid parameter type for ${name}: ${config.type}`)
        }
      })
    }

    // Validate dependencies
    if (manifest.dependencies) {
      Object.entries(manifest.dependencies).forEach(([name, version]) => {
        if (!/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name)) {
          errors.push(`Invalid dependency name: ${name}`)
        }
      })
    }

    // Validate files
    if (files.length === 0) {
      warnings.push('No files provided - package will be empty')
    }

    files.forEach((file, index) => {
      if (!file.path) {
        errors.push(`File at index ${index} missing path`)
      }
      if (!file.content) {
        errors.push(`File at index ${index} missing content`)
      }
    })

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    }
  }

  /**
   * Validate package using CLI
   */
  async validatePackageWithCLI(manifest, files = []) {
    const tempDir = path.join(process.cwd(), 'temp', 'package-validation')
    await fs.mkdir(tempDir, { recursive: true })
    
    const packageDir = path.join(tempDir, `pkg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`)
    await fs.mkdir(packageDir, { recursive: true })

    try {
      // Write prompd.json
      await fs.writeFile(
        path.join(packageDir, 'prompd.json'),
        JSON.stringify(manifest, null, 2),
        'utf8'
      )

      // Write files
      for (const file of files) {
        const filePath = path.join(packageDir, file.path)
        const fileDir = path.dirname(filePath)
        await fs.mkdir(fileDir, { recursive: true })
        await fs.writeFile(filePath, file.content, 'utf8')
      }

      // Execute CLI validation: prompd package validate <dir>
      const result = await this.executeCLI('package', ['validate', packageDir, '--output-json'])
      
      const parsed = this.parseCliOutput(result.stdout)
      
      return {
        isValid: parsed.success && result.exitCode === 0,
        errors: parsed.errors || [],
        warnings: parsed.warnings || []
      }

    } finally {
      // Cleanup temp directory
      try {
        await fs.rm(packageDir, { recursive: true, force: true })
      } catch (error) {
        console.warn('Failed to cleanup temp package dir:', error.message)
      }
    }
  }

  /**
   * Install package using CLI
   */
  async installPackageWithCLI(packageName, version = 'latest', projectDir = null) {
    const args = ['install', `${packageName}@${version}`]
    
    if (projectDir) {
      args.push('--project-dir', projectDir)
    }
    
    const result = await this.executeCLI(args[0], args.slice(1))
    
    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.stderr
    }
  }

  /**
   * Execute CLI command
   */
  async executeCLI(command, args = []) {
    return new Promise((resolve, reject) => {
      const fullArgs = [command, ...args]
      const child = spawn(this.cliCommand, fullArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd()
      })

      let stdout = ''
      let stderr = ''

      child.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      child.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      child.on('close', (code) => {
        resolve({
          exitCode: code,
          stdout,
          stderr
        })
      })

      child.on('error', (error) => {
        reject(new Error(`Failed to execute CLI: ${error.message}`))
      })

      // Set timeout
      setTimeout(() => {
        child.kill('SIGTERM')
        reject(new Error('CLI execution timeout'))
      }, 60000)
    })
  }

  /**
   * Parse CLI JSON output
   */
  parseCliOutput(stdout) {
    try {
      const lines = stdout.split('\n')
      for (const line of lines) {
        if (line.trim().startsWith('{')) {
          try {
            return JSON.parse(line.trim())
          } catch (e) {
            continue
          }
        }
      }

      return {
        success: true,
        output: stdout,
        errors: [],
        warnings: []
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to parse CLI output: ${error.message}`,
        errors: [error.message],
        warnings: []
      }
    }
  }

  /**
   * Get popular packages
   */
  async getPopularPackages(options = {}) {
    try {
      const { timeframe = 'total', limit = 10 } = options

      // Get from local cache
      const localPopular = await Package.findPopular({ limit, timeframe })

      // Get from registry
      const registryPopular = await this.registryClient.getPopularPackages(options)

      // Merge results
      const allPackages = this.mergePackageResults(localPopular, registryPopular || [])

      return allPackages.slice(0, limit)
    } catch (error) {
      console.error('Get popular packages error:', error)
      return []
    }
  }

  /**
   * Get package categories
   */
  async getCategories() {
    try {
      const categories = await Package.aggregate([
        { $match: { isPrivate: false, isDeprecated: false } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])

      const formattedCategories = categories.map(cat => ({
        id: cat._id,
        name: this.formatCategoryName(cat._id),
        count: cat.count
      }))

      return formattedCategories
    } catch (error) {
      console.error('Get categories error:', error)
      return []
    }
  }

  /**
   * Helper methods
   */

  mergePackageResults(localResults, registryResults) {
    const packageMap = new Map()

    // Add local results first
    localResults.forEach(pkg => {
      packageMap.set(pkg.name, pkg)
    })

    // Add registry results, but don't override local ones
    registryResults.forEach(pkg => {
      if (!packageMap.has(pkg.name)) {
        packageMap.set(pkg.name, pkg)
      }
    })

    return Array.from(packageMap.values())
  }

  sortPackages(packages, sortBy) {
    switch (sortBy) {
      case 'downloads':
        return packages.sort((a, b) => (b.statistics?.totalDownloads || 0) - (a.statistics?.totalDownloads || 0))
      case 'updated':
        return packages.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      case 'created':
        return packages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      case 'name':
        return packages.sort((a, b) => a.name.localeCompare(b.name))
      case 'stars':
        return packages.sort((a, b) => (b.statistics?.stars || 0) - (a.statistics?.stars || 0))
      default: // relevance
        return packages
    }
  }

  getSortOptions(sortBy) {
    switch (sortBy) {
      case 'downloads':
        return { 'statistics.totalDownloads': -1 }
      case 'updated':
        return { updatedAt: -1 }
      case 'created':
        return { createdAt: -1 }
      case 'name':
        return { name: 1 }
      case 'stars':
        return { 'statistics.stars': -1 }
      default:
        return { 'statistics.totalDownloads': -1 }
    }
  }

  formatPackageForResponse(pkg, version = null) {
    const versionData = version || pkg.latestVersion

    return {
      name: pkg.name,
      version: versionData?.version || pkg.tags.latest,
      description: versionData?.description || pkg.description,
      author: versionData?.author || pkg.maintainers?.[0],
      keywords: versionData?.keywords || [],
      parameters: versionData?.parameters || [],
      exports: versionData?.exports || {},
      statistics: pkg.statistics,
      category: pkg.category,
      isPrivate: pkg.isPrivate,
      isDeprecated: pkg.isDeprecated,
      createdAt: pkg.createdAt,
      updatedAt: pkg.updatedAt
    }
  }

  formatCategoryName(categoryId) {
    const categoryNames = {
      'ai-tools': 'AI Tools',
      'templates': 'Templates',
      'utilities': 'Utilities',
      'integrations': 'Integrations',
      'examples': 'Examples',
      'other': 'Other'
    }
    return categoryNames[categoryId] || categoryId
  }

  compareVersions(a, b) {
    const aParts = a.split('.').map(Number)
    const bParts = b.split('.').map(Number)

    for (let i = 0; i < 3; i++) {
      if (aParts[i] > bParts[i]) return 1
      if (aParts[i] < bParts[i]) return -1
    }
    return 0
  }

  async cachePackageInfo(packageInfo) {
    try {
      // Simple caching implementation
      // In production, you might want more sophisticated caching
      const existing = await Package.findOne({ name: packageInfo.name })
      
      if (!existing) {
        const newPackage = new Package({
          name: packageInfo.name,
          description: packageInfo.description,
          versions: [packageInfo],
          tags: { latest: packageInfo.version },
          category: packageInfo.category || 'other'
        })
        await newPackage.save()
      }
    } catch (error) {
      console.warn('Failed to cache package info:', error.message)
    }
  }

  async incrementDownloadCount(packageName, version) {
    try {
      await Package.updateOne(
        { name: packageName, 'versions.version': version },
        { 
          $inc: { 
            'versions.$.downloadCount': 1,
            'statistics.totalDownloads': 1
          }
        }
      )
    } catch (error) {
      console.warn('Failed to increment download count:', error.message)
    }
  }

  async getPackageDependencies(packageName, version = 'latest') {
    try {
      const packageInfo = await this.getPackageInfo(packageName, version)
      return packageInfo?.dependencies || []
    } catch (error) {
      console.error('Get package dependencies error:', error)
      return []
    }
  }

  async getPackageDependents(packageName, options = {}) {
    try {
      // This would require a more sophisticated dependency tracking system
      // For now, return empty array
      return []
    } catch (error) {
      console.error('Get package dependents error:', error)
      return []
    }
  }

  async togglePackageStar(packageName, userId, starred) {
    try {
      // This would integrate with user preferences/favorites
      // For now, just return success
      return {
        packageName,
        starred,
        message: starred ? 'Package starred' : 'Package unstarred'
      }
    } catch (error) {
      console.error('Toggle package star error:', error)
      throw new Error(`Failed to ${starred ? 'star' : 'unstar'} package: ${error.message}`)
    }
  }

  async getUserStarredPackages(userId, options = {}) {
    try {
      // This would integrate with user preferences/favorites
      // For now, return empty array
      return []
    } catch (error) {
      console.error('Get user starred packages error:', error)
      return []
    }
  }
}
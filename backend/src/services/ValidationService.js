import { spawn } from 'child_process'
import yaml from 'js-yaml'
import { ProjectService } from './ProjectService.js'

export class ValidationService {
  constructor() {
    // IMPORTANT: This should be the CLI command name, NOT a path
    // The prompd CLI should be globally installed via pip install prompd
    this.cliCommand = process.env.PROMPD_CLI_COMMAND || 'prompd'
    this.projectService = new ProjectService()
  }

  /**
   * Validate Prompd content with comprehensive checks
   */
  async validateContent(content, context = {}) {
    const startTime = Date.now()
    const results = {
      isValid: true,
      errors: [],
      warnings: [],
      stats: {
        totalLines: 0,
        totalTokens: 0,
        parametersUsed: 0,
        packagesReferenced: 0
      }
    }

    try {
      // Basic content validation
      this.validateBasicStructure(content, results)
      
      // Parse and validate YAML frontmatter
      const { frontmatter, markdownContent } = this.parseContent(content)
      if (frontmatter) {
        this.validateFrontmatter(frontmatter, results)
      }
      
      // Validate markdown content
      this.validateMarkdownContent(markdownContent, results, frontmatter)
      
      // Validate parameter references
      this.validateParameterReferences(content, frontmatter, results)
      
      // Validate package references
      await this.validatePackageReferences(frontmatter, results, context)
      
      // Calculate statistics
      this.calculateStatistics(content, frontmatter, results)
      
      // Run Python CLI validation if available
      try {
        const cliResults = await this.runPythonCliValidation(content)
        this.mergePythonCliResults(cliResults, results)
      } catch (error) {
        results.warnings.push({
          type: 'cli',
          message: `Python CLI validation unavailable: ${error.message}`,
          severity: 'warning'
        })
      }

      // Determine overall validity
      results.isValid = results.errors.length === 0

      return {
        ...results,
        validationTime: Date.now() - startTime
      }

    } catch (error) {
      console.error('Validation error:', error)
      return {
        isValid: false,
        errors: [{
          type: 'validation',
          message: `Validation failed: ${error.message}`,
          severity: 'error'
        }],
        warnings: [],
        stats: {
          totalLines: 0,
          totalTokens: 0,
          parametersUsed: 0,
          packagesReferenced: 0
        },
        validationTime: Date.now() - startTime
      }
    }
  }

  /**
   * Validate basic file structure
   */
  validateBasicStructure(content, results) {
    if (!content || typeof content !== 'string') {
      results.errors.push({
        type: 'structure',
        message: 'Content is empty or invalid',
        severity: 'error'
      })
      return
    }

    if (content.length > 10 * 1024 * 1024) { // 10MB limit
      results.errors.push({
        type: 'structure',
        message: 'Content exceeds maximum size limit (10MB)',
        severity: 'error'
      })
    }

    // Check for basic Prompd structure
    if (!content.includes('---')) {
      results.warnings.push({
        type: 'structure',
        message: 'No YAML frontmatter found - file may not be a valid .prmd file',
        severity: 'warning'
      })
    }
  }

  /**
   * Parse YAML frontmatter and markdown content
   */
  parseContent(content) {
    try {
      const parts = content.split('---')
      
      if (parts.length < 3) {
        return { frontmatter: null, markdownContent: content }
      }

      const yamlContent = parts[1].trim()
      const markdownContent = parts.slice(2).join('---').trim()

      let frontmatter = null
      if (yamlContent) {
        try {
          frontmatter = yaml.load(yamlContent)
        } catch (yamlError) {
          throw new Error(`Invalid YAML frontmatter: ${yamlError.message}`)
        }
      }

      return { frontmatter, markdownContent }
    } catch (error) {
      throw new Error(`Failed to parse content: ${error.message}`)
    }
  }

  /**
   * Validate YAML frontmatter
   */
  validateFrontmatter(frontmatter, results) {
    if (!frontmatter || typeof frontmatter !== 'object') {
      results.errors.push({
        type: 'yaml',
        message: 'Invalid frontmatter structure',
        severity: 'error'
      })
      return
    }

    // Validate provider
    if (frontmatter.provider) {
      const validProviders = ['openai', 'anthropic', 'azure', 'ollama', 'custom']
      if (!validProviders.includes(frontmatter.provider)) {
        results.warnings.push({
          type: 'yaml',
          message: `Unknown provider: ${frontmatter.provider}`,
          severity: 'warning'
        })
      }
    }

    // Validate model
    if (frontmatter.model && typeof frontmatter.model !== 'string') {
      results.errors.push({
        type: 'yaml',
        message: 'Model must be a string',
        severity: 'error'
      })
    }

    // Validate parameters
    if (frontmatter.parameters) {
      this.validateParameters(frontmatter.parameters, results)
    }

    // Validate using (package references)
    if (frontmatter.using) {
      this.validateUsingReferences(frontmatter.using, results)
    }

    // Validate inherits
    if (frontmatter.inherits) {
      this.validateInheritsReference(frontmatter.inherits, results)
    }

    // Validate temperature, max_tokens, etc.
    this.validateModelParameters(frontmatter, results)
  }

  /**
   * Validate parameters definition
   */
  validateParameters(parameters, results) {
    if (!parameters || typeof parameters !== 'object') {
      results.errors.push({
        type: 'parameters',
        message: 'Parameters must be an object',
        severity: 'error'
      })
      return
    }

    Object.entries(parameters).forEach(([name, config]) => {
      // Parameter name validation
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
        results.errors.push({
          type: 'parameters',
          message: `Invalid parameter name: ${name}`,
          severity: 'error'
        })
      }

      // Parameter configuration validation
      if (config && typeof config === 'object') {
        const validTypes = ['string', 'number', 'boolean', 'object', 'array', 'file']
        if (config.type && !validTypes.includes(config.type)) {
          results.errors.push({
            type: 'parameters',
            message: `Invalid parameter type for ${name}: ${config.type}`,
            severity: 'error'
          })
        }

        // Validate constraints
        if (config.type === 'number' && config.min !== undefined && config.max !== undefined) {
          if (config.min >= config.max) {
            results.errors.push({
              type: 'parameters',
              message: `Invalid range for parameter ${name}: min must be less than max`,
              severity: 'error'
            })
          }
        }

        if (config.enum && !Array.isArray(config.enum)) {
          results.errors.push({
            type: 'parameters',
            message: `Enum for parameter ${name} must be an array`,
            severity: 'error'
          })
        }
      }
    })
  }

  /**
   * Validate using (package) references
   */
  validateUsingReferences(using, results) {
    if (!Array.isArray(using)) {
      results.errors.push({
        type: 'packages',
        message: 'Using directive must be an array',
        severity: 'error'
      })
      return
    }

    using.forEach((packageRef, index) => {
      if (typeof packageRef !== 'string') {
        results.errors.push({
          type: 'packages',
          message: `Package reference at index ${index} must be a string`,
          severity: 'error'
        })
        return
      }

      // Validate package name format
      const packageNameRegex = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*(@[\d\w.-]+)?$/
      if (!packageNameRegex.test(packageRef)) {
        results.errors.push({
          type: 'packages',
          message: `Invalid package reference format: ${packageRef}`,
          severity: 'error'
        })
      }
    })
  }

  /**
   * Validate inherits reference
   */
  validateInheritsReference(inherits, results) {
    if (typeof inherits !== 'string') {
      results.errors.push({
        type: 'inheritance',
        message: 'Inherits directive must be a string',
        severity: 'error'
      })
      return
    }

    // Check if it's a local file reference
    if (inherits.startsWith('./') || inherits.startsWith('../')) {
      if (!inherits.endsWith('.prmd')) {
        results.warnings.push({
          type: 'inheritance',
          message: 'Local inherits reference should point to a .prmd file',
          severity: 'warning'
        })
      }
    } else {
      // Should be a package reference
      const packageNameRegex = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*(@[\d\w.-]+)?$/
      if (!packageNameRegex.test(inherits)) {
        results.errors.push({
          type: 'inheritance',
          message: `Invalid inherits package reference format: ${inherits}`,
          severity: 'error'
        })
      }
    }
  }

  /**
   * Validate model parameters
   */
  validateModelParameters(frontmatter, results) {
    // Temperature validation
    if (frontmatter.temperature !== undefined) {
      if (typeof frontmatter.temperature !== 'number' || frontmatter.temperature < 0 || frontmatter.temperature > 2) {
        results.errors.push({
          type: 'model',
          message: 'Temperature must be a number between 0 and 2',
          severity: 'error'
        })
      }
    }

    // Max tokens validation
    if (frontmatter.max_tokens !== undefined) {
      if (!Number.isInteger(frontmatter.max_tokens) || frontmatter.max_tokens < 1 || frontmatter.max_tokens > 100000) {
        results.errors.push({
          type: 'model',
          message: 'Max tokens must be an integer between 1 and 100000',
          severity: 'error'
        })
      }
    }

    // Top P validation
    if (frontmatter.top_p !== undefined) {
      if (typeof frontmatter.top_p !== 'number' || frontmatter.top_p < 0 || frontmatter.top_p > 1) {
        results.errors.push({
          type: 'model',
          message: 'Top P must be a number between 0 and 1',
          severity: 'error'
        })
      }
    }
  }

  /**
   * Validate markdown content
   */
  validateMarkdownContent(content, results, frontmatter) {
    if (!content || content.trim().length === 0) {
      results.warnings.push({
        type: 'content',
        message: 'No markdown content found',
        severity: 'warning'
      })
      return
    }

    // Check for common markdown issues
    const lines = content.split('\n')
    lines.forEach((line, index) => {
      const lineNumber = index + 1

      // Check for malformed parameter references
      const paramMatches = line.match(/\{[^}]*\}/g) || []
      paramMatches.forEach(match => {
        const paramName = match.slice(1, -1).trim()
        if (!paramName) {
          results.errors.push({
            type: 'content',
            message: `Empty parameter reference at line ${lineNumber}`,
            line: lineNumber,
            severity: 'error'
          })
        } else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(paramName)) {
          results.errors.push({
            type: 'content',
            message: `Invalid parameter reference: {${paramName}} at line ${lineNumber}`,
            line: lineNumber,
            severity: 'error'
          })
        }
      })

      // Check for very long lines
      if (line.length > 1000) {
        results.warnings.push({
          type: 'content',
          message: `Very long line (${line.length} chars) at line ${lineNumber}`,
          line: lineNumber,
          severity: 'warning'
        })
      }
    })
  }

  /**
   * Validate parameter references in content
   */
  validateParameterReferences(content, frontmatter, results) {
    const paramMatches = content.match(/\{([^}]+)\}/g) || []
    const usedParams = new Set()
    const definedParams = new Set(Object.keys(frontmatter?.parameters || {}))

    paramMatches.forEach(match => {
      const paramName = match.slice(1, -1).trim()
      usedParams.add(paramName)

      if (!definedParams.has(paramName)) {
        results.errors.push({
          type: 'parameters',
          message: `Parameter '${paramName}' is used but not defined`,
          severity: 'error'
        })
      }
    })

    // Check for unused parameters
    definedParams.forEach(paramName => {
      if (!usedParams.has(paramName)) {
        results.warnings.push({
          type: 'parameters',
          message: `Parameter '${paramName}' is defined but never used`,
          severity: 'warning'
        })
      }
    })

    results.stats.parametersUsed = usedParams.size
  }

  /**
   * Validate package references
   */
  async validatePackageReferences(frontmatter, results, context) {
    if (!frontmatter) return

    const packageRefs = []
    
    // Collect package references from using and inherits
    if (frontmatter.using) {
      packageRefs.push(...frontmatter.using.filter(ref => !ref.startsWith('./') && !ref.startsWith('../')))
    }
    
    if (frontmatter.inherits && !frontmatter.inherits.startsWith('./') && !frontmatter.inherits.startsWith('../')) {
      packageRefs.push(frontmatter.inherits)
    }

    results.stats.packagesReferenced = packageRefs.length

    // Validate package availability (simplified - in production would check registry)
    for (const packageRef of packageRefs) {
      try {
        const [packageName, version] = packageRef.includes('@') && packageRef.lastIndexOf('@') > 0
          ? [packageRef.substring(0, packageRef.lastIndexOf('@')), packageRef.substring(packageRef.lastIndexOf('@') + 1)]
          : [packageRef, 'latest']

        // In a real implementation, you would check the registry here
        // For now, just validate the format
        if (!packageName || packageName.length < 3) {
          results.errors.push({
            type: 'packages',
            message: `Invalid package name: ${packageName}`,
            severity: 'error'
          })
        }

        if (version && version !== 'latest' && !/^\d+\.\d+\.\d+/.test(version)) {
          results.warnings.push({
            type: 'packages',
            message: `Invalid version format for ${packageName}: ${version}`,
            severity: 'warning'
          })
        }

      } catch (error) {
        results.warnings.push({
          type: 'packages',
          message: `Could not validate package: ${packageRef}`,
          severity: 'warning'
        })
      }
    }
  }

  /**
   * Calculate content statistics
   */
  calculateStatistics(content, frontmatter, results) {
    const lines = content.split('\n')
    results.stats.totalLines = lines.length

    // Rough token count estimation (4 chars = 1 token average)
    results.stats.totalTokens = Math.ceil(content.length / 4)

    // Additional stats would go here
  }

  /**
   * Run Python CLI validation
   */
  async runPythonCliValidation(content) {
    return new Promise((resolve, reject) => {
      const child = spawn(this.cliCommand, ['validate', '-'], {
        stdio: ['pipe', 'pipe', 'pipe']
      })

      let stdout = ''
      let stderr = ''

      child.stdin.write(content)
      child.stdin.end()

      child.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      child.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      child.on('close', (code) => {
        try {
          const result = JSON.parse(stdout)
          resolve(result)
        } catch (error) {
          resolve({
            valid: code === 0,
            errors: code !== 0 ? [stderr] : [],
            warnings: []
          })
        }
      })

      child.on('error', (error) => {
        reject(error)
      })

      // Timeout
      setTimeout(() => {
        child.kill('SIGTERM')
        reject(new Error('Python CLI validation timeout'))
      }, 30000)
    })
  }

  /**
   * Merge Python CLI results with our validation results
   */
  mergePythonCliResults(cliResults, results) {
    if (cliResults.errors && Array.isArray(cliResults.errors)) {
      cliResults.errors.forEach(error => {
        results.errors.push({
          type: 'cli',
          message: error,
          severity: 'error'
        })
      })
    }

    if (cliResults.warnings && Array.isArray(cliResults.warnings)) {
      cliResults.warnings.forEach(warning => {
        results.warnings.push({
          type: 'cli',
          message: warning,
          severity: 'warning'
        })
      })
    }

    if (cliResults.valid === false) {
      results.isValid = false
    }
  }

  /**
   * Validate a complete project
   */
  async validateProject(projectId, userId) {
    try {
      const project = await this.projectService.getProject(projectId, userId)
      if (!project) {
        throw new Error('Project not found')
      }

      const results = {
        projectId,
        isValid: true,
        files: [],
        summary: {
          totalFiles: 0,
          validFiles: 0,
          errors: 0,
          warnings: 0
        }
      }

      // Validate each file
      for (const file of project.files) {
        if (file.type === 'prmd') {
          const fileValidation = await this.validateContent(file.content, {
            projectId,
            fileName: file.name
          })

          results.files.push({
            name: file.name,
            path: file.path,
            ...fileValidation
          })

          results.summary.totalFiles++
          if (fileValidation.isValid) {
            results.summary.validFiles++
          }
          results.summary.errors += fileValidation.errors.length
          results.summary.warnings += fileValidation.warnings.length
        }
      }

      results.isValid = results.summary.errors === 0
      return results

    } catch (error) {
      console.error('Project validation error:', error)
      return {
        projectId,
        isValid: false,
        error: error.message,
        files: [],
        summary: {
          totalFiles: 0,
          validFiles: 0,
          errors: 1,
          warnings: 0
        }
      }
    }
  }
}
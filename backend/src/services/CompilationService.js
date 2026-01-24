import path from 'path'
import fs from 'fs/promises'
import crypto from 'crypto'
import { PrompdCompiler, MemoryFileSystem } from '@prompd/cli'
import { CompilationCache } from '../models/CompilationCache.js'
import { ProjectService } from './ProjectService.js'
import Provider from '../models/Provider.js'
import { pricingService } from './PricingService.js'

export class CompilationService {
  constructor() {
    // Use @prompd/cli TypeScript library instead of Python CLI
    this.compiler = new PrompdCompiler()
    this.tempDir = path.join(process.cwd(), 'temp', 'compilation')
    this.ensureTempDir()
    this.projectService = new ProjectService()
  }

  async ensureTempDir() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true })
    } catch (error) {
      console.warn('Failed to create temp directory:', error.message)
    }
  }

  /**
   * Compile content with full 6-stage pipeline using @prompd/cli library
   */
  async compile(content, format = 'markdown', parameters = {}, userId = null, projectId = null) {
    const startTime = Date.now()

    try {
      // Check cache first
      const cacheEntry = await CompilationCache.findByContent(content, { format, ...parameters })
      if (cacheEntry) {
        await cacheEntry.incrementHit()
        return {
          success: true,
          output: cacheEntry.compiledOutput,
          metadata: cacheEntry.metadata,
          cached: true,
          validationResults: cacheEntry.validationResults
        }
      }

      // Use memory filesystem for compilation (no temp files needed)
      const memFS = new MemoryFileSystem({
        '/main.prmd': content
      })

      // Compile using @prompd/cli library
      // Pass registryUrl for package resolution
      const result = await this.compiler.compile('/main.prmd', {
        outputFormat: this.mapFormatToCompiler(format),
        parameters: parameters,
        fileSystem: memFS,
        registryUrl: process.env.PROMPD_REGISTRY_URL || 'https://registry.prompdhub.ai'
      })

      const compilationTime = Date.now() - startTime

      // Cache the successful result
      if (result.success) {
        await this.cacheCompilationResult(content, format, parameters, result, compilationTime, userId, projectId)
      }

      return {
        success: result.success,
        output: result.output,
        metadata: {
          compilationTime,
          outputSize: Buffer.byteLength(result.output || '', 'utf8'),
          stages: result.stages || [],
          dependencies: result.dependencies || []
        },
        cached: false,
        validationResults: result.validation || { isValid: true, errors: [], warnings: [] }
      }

    } catch (error) {
      console.error('Compilation error:', error)
      return {
        success: false,
        error: error.message,
        metadata: {
          compilationTime: Date.now() - startTime,
          outputSize: 0,
          stages: [],
          dependencies: []
        },
        cached: false,
        validationResults: {
          isValid: false,
          errors: [{ type: 'compilation', message: error.message, severity: 'error' }],
          warnings: []
        }
      }
    }
  }

  /**
   * Map format string to compiler output format
   */
  mapFormatToCompiler(format) {
    const formatMap = {
      'markdown': 'markdown',
      'openai-json': 'provider-json:openai',
      'anthropic-json': 'provider-json:anthropic'
    }
    return formatMap[format] || 'markdown'
  }

  /**
   * Compile with real-time progress updates
   */
  async compileWithProgress(content, format = 'markdown', parameters = {}, progressCallback) {
    const stages = [
      { name: 'lexical', description: 'Parsing .prmd file structure' },
      { name: 'dependency', description: 'Resolving package dependencies' },
      { name: 'semantic', description: 'Validating parameters and references' },
      { name: 'asset', description: 'Processing binary assets' },
      { name: 'template', description: 'Applying template inheritance' },
      { name: 'codegen', description: 'Generating final output' }
    ]

    let currentStage = 0
    const stageResults = []

    try {
      // Check cache first
      progressCallback?.({ stage: 'cache-check', progress: 5, description: 'Checking compilation cache' })
      
      const cacheEntry = await CompilationCache.findByContent(content, { format, ...parameters })
      if (cacheEntry) {
        await cacheEntry.incrementHit()
        progressCallback?.({ stage: 'complete', progress: 100, description: 'Retrieved from cache' })
        
        return {
          success: true,
          output: cacheEntry.compiledOutput,
          metadata: cacheEntry.metadata,
          cached: true,
          validationResults: cacheEntry.validationResults
        }
      }

      // Use memory filesystem (no temp files needed)
      progressCallback?.({ stage: 'setup', progress: 10, description: 'Preparing compilation environment' })

      const memFS = new MemoryFileSystem({
        '/main.prmd': content
      })

      const startTime = Date.now()

      // Execute compilation with @prompd/cli library
      // Note: The library doesn't provide real-time progress callbacks for each stage yet
      // We'll simulate progress updates based on the 6-stage pipeline

      stages.forEach((stage, index) => {
        const progress = 10 + ((index + 1) / stages.length) * 80
        progressCallback?.({
          stage: stage.name,
          progress: Math.round(progress),
          description: stage.description
        })
      })

      const result = await this.compiler.compile('/main.prmd', {
        outputFormat: this.mapFormatToCompiler(format),
        parameters: parameters,
        fileSystem: memFS,
        registryUrl: process.env.PROMPD_REGISTRY_URL || 'https://registry.prompdhub.ai'
      })

      const compilationTime = Date.now() - startTime

      progressCallback?.({ stage: 'complete', progress: 100, description: 'Compilation finished' })

      // Cache successful results
      if (result.success) {
        await this.cacheCompilationResult(content, format, parameters, result, compilationTime)
      }

      return {
        success: result.success,
        output: result.output,
        metadata: {
          compilationTime,
          outputSize: Buffer.byteLength(result.output || '', 'utf8'),
          stages: result.stages || [],
          dependencies: result.dependencies || []
        },
        cached: false,
        validationResults: result.validation || { isValid: true, errors: [], warnings: [] }
      }

    } catch (error) {
      console.error('Compilation with progress error:', error)
      progressCallback?.({ 
        stage: 'error', 
        progress: 0, 
        description: `Compilation failed: ${error.message}`,
        error: error.message
      })

      return {
        success: false,
        error: error.message,
        metadata: {
          compilationTime: 0,
          outputSize: 0,
          stages: stageResults,
          dependencies: []
        },
        cached: false,
        validationResults: { 
          isValid: false, 
          errors: [{ type: 'compilation', message: error.message, severity: 'error' }], 
          warnings: [] 
        }
      }
    }
  }

  /**
   * Parse CLI JSON output (kept for backward compatibility with execute method)
   */
  parseCliOutput(stdout) {
    try {
      // Look for JSON output in stdout
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

      // Fallback: treat stdout as the output
      return {
        success: true,
        output: stdout,
        stages: [],
        dependencies: [],
        validation: { isValid: true, errors: [], warnings: [] }
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to parse CLI output: ${error.message}`,
        output: '',
        stages: [],
        dependencies: [],
        validation: { isValid: false, errors: [], warnings: [] }
      }
    }
  }

  /**
   * Cache compilation result
   */
  async cacheCompilationResult(content, format, parameters, parsed, compilationTime, userId = null, projectId = null) {
    try {
      const cacheEntry = new CompilationCache({
        inputContent: content,
        compilationParameters: {
          format,
          provider: parameters.provider,
          model: parameters.model,
          parameters: parameters.parameters || {},
          packageVersions: parameters.packageVersions || []
        },
        compiledOutput: parsed.output,
        metadata: {
          compilationTime,
          outputSize: Buffer.byteLength(parsed.output || '', 'utf8'),
          stages: parsed.stages || [],
          dependencies: parsed.dependencies || []
        },
        validationResults: parsed.validation || { isValid: true, errors: [], warnings: [] },
        userId,
        projectId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      })

      await cacheEntry.save()
      console.log(`Cached compilation result: ${cacheEntry.cacheKey}`)
    } catch (error) {
      console.warn('Failed to cache compilation result:', error.message)
    }
  }

  /**
   * Get compilation statistics
   */
  async getStatistics(userId = null) {
    try {
      const stats = await CompilationCache.getStatistics(userId)
      return stats[0] || {
        totalEntries: 0,
        totalHits: 0,
        averageCompilationTime: 0,
        totalCacheSize: 0,
        hitRate: 0,
        formatDistribution: {}
      }
    } catch (error) {
      console.error('Failed to get compilation statistics:', error)
      return {
        totalEntries: 0,
        totalHits: 0,
        averageCompilationTime: 0,
        totalCacheSize: 0,
        hitRate: 0,
        formatDistribution: {}
      }
    }
  }

  /**
   * Clear cache for user or project
   */
  async clearCache(userId = null, projectId = null) {
    try {
      const query = {}
      if (userId) query.userId = userId
      if (projectId) query.projectId = projectId
      
      const result = await CompilationCache.deleteMany(query)
      console.log(`Cleared ${result.deletedCount} cache entries`)
      return result.deletedCount
    } catch (error) {
      console.error('Failed to clear cache:', error)
      return 0
    }
  }

  /**
   * Perform cache maintenance
   */
  async performMaintenance() {
    try {
      return await CompilationCache.performMaintenance()
    } catch (error) {
      console.error('Cache maintenance failed:', error)
      return {
        expiredRemoved: 0,
        oldRemoved: 0,
        statistics: null
      }
    }
  }

  /**
   * Execute compiled prompt with stored provider API keys
   */
  async execute(prompt, providerName = 'openai', model = 'gpt-4o-mini', parameters = {}, userId = null, projectId = null, user = null, packageRef = null, files = null, sourceFilePath = null) {
    const startTime = Date.now()

    try {
      console.log('[CompilationService] === Execute called ===')
      console.log('[CompilationService] Prompt length:', prompt?.length)
      console.log('[CompilationService] Prompt preview (first 500 chars):', prompt?.substring(0, 500))
      console.log('[CompilationService] Source file path:', sourceFilePath)
      console.log('[CompilationService] Files received:', files ? Object.keys(files) : 'none')
      // Get user's provider configuration (if userId provided)
      let providerConfig = null

      // First check if user has API key in aiFeatures.llmProviders (Map-based system)
      // Use Map.get() for Mongoose Map types, fallback to bracket notation for plain objects
      const getUserProviderConfig = (providers, providerId) => {
        if (!providers) return null
        // Handle both Map and plain object (for backward compatibility)
        if (typeof providers.get === 'function') {
          return providers.get(providerId)
        }
        return providers[providerId]
      }

      const userProviderConfig = getUserProviderConfig(user?.aiFeatures?.llmProviders, providerName)
      if (userProviderConfig?.hasKey) {
        console.log(`[CompilationService] Found API key in user.aiFeatures.llmProviders for ${providerName}`)
        const { encryptedKey, iv, customConfig } = userProviderConfig

        // Decrypt the key using the same method as EncryptionService
        const decryptApiKey = (encryptedKeyHex, ivHex) => {
          if (!encryptedKeyHex || !ivHex) return null
          try {
            // Get encryption key using scrypt (same as EncryptionService)
            const secret = process.env.ENCRYPTION_SECRET || process.env.JWT_SECRET
            if (!secret) {
              console.error('ENCRYPTION_SECRET or JWT_SECRET not found in environment')
              return null
            }
            const KEY = crypto.scryptSync(secret, 'prompd-salt', 32)

            // Extract encrypted text and auth tag (last 32 hex chars = 16 bytes)
            const ivBuffer = Buffer.from(ivHex, 'hex')
            const encryptedText = encryptedKeyHex.slice(0, -32)
            const authTag = Buffer.from(encryptedKeyHex.slice(-32), 'hex')

            // Decrypt with AES-256-GCM
            const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, ivBuffer)
            decipher.setAuthTag(authTag)

            let decrypted = decipher.update(encryptedText, 'hex', 'utf8')
            decrypted += decipher.final('utf8')

            return decrypted
          } catch (error) {
            console.error('Failed to decrypt user API key:', error)
            return null
          }
        }

        const apiKey = decryptApiKey(encryptedKey, iv)
        if (apiKey) {
          console.log(`[CompilationService] Successfully decrypted API key for ${providerName}`)
          providerConfig = {
            name: providerName,
            displayName: customConfig?.displayName || providerName.charAt(0).toUpperCase() + providerName.slice(1),
            apiKey,
            baseUrl: customConfig?.baseUrl || null,
            models: customConfig?.models || [],
            isCustom: userProviderConfig.isCustom || false
          }
        } else {
          console.error(`[CompilationService] Failed to decrypt API key for ${providerName}`)
        }
      }

      // Fall back to Provider collection (old system)
      if (!providerConfig && userId) {
        console.log(`[CompilationService] Checking Provider collection for ${providerName}`)
        if (providerName) {
          // Use specified provider
          providerConfig = await Provider.findUserProviderWithKey(userId, providerName)
        } else {
          // Use active provider
          const activeProvider = await Provider.findOne({ userId, isActive: true })
          if (activeProvider) {
            providerConfig = await Provider.findUserProviderWithKey(userId, activeProvider.providerId)
          }
        }
      }

      // Fall back to environment variables if no provider config found
      if (!providerConfig) {
        console.log(`Using environment variable for provider '${providerName}'`)
        const envKey = `${providerName.toUpperCase()}_API_KEY`
        const apiKey = process.env[envKey]

        if (!apiKey) {
          throw new Error(`No API key found for provider '${providerName}'. Please configure ${envKey} in environment or add provider in settings.`)
        }

        // Create a mock provider config from environment
        providerConfig = {
          name: providerName,
          displayName: providerName.charAt(0).toUpperCase() + providerName.slice(1),
          apiKey: apiKey,
          baseUrl: null,
          models: []
        }
      }

      // Auto-select model if needed
      if (model === 'auto' && providerConfig.models && providerConfig.models.length > 0) {
        model = providerConfig.models[0] // Use first available model
      }

      // Extract inherits field from YAML frontmatter to manually merge inheritance
      // Match both package references (@namespace/package@version) and relative file paths (./file.prmd)
      const inheritsPackageMatch = prompt.match(/^---\n[\s\S]*?inherits:\s*["']?(@[\w.-]+\/[\w.-]+@[\w.-]+)["']?[\s\S]*?\n---/m)
      const inheritsFileMatch = prompt.match(/^---\n[\s\S]*?inherits:\s*["']?(\.\/[\w\/.-]+\.prmd)["']?[\s\S]*?\n---/m)

      console.log('[CompilationService] Checking for inherits field...')
      console.log('[CompilationService] Prompt first 600 chars:', prompt.substring(0, 600))
      console.log('[CompilationService] Inherits package match:', inheritsPackageMatch ? inheritsPackageMatch[1] : 'not found')
      console.log('[CompilationService] Inherits file match:', inheritsFileMatch ? inheritsFileMatch[1] : 'not found')
      console.log('[CompilationService] packageRef parameter:', packageRef)

      // Prepare MemoryFileSystem files
      // IMPORTANT: We should NOT manually merge inheritance - let the @prompd/cli handle it!
      // The CLI has a full 6-stage compilation pipeline with proper inheritance resolution.

      // CORRECT APPROACH: Recreate workspace directory structure in MemoryFileSystem
      // The @prompd/cli MemoryFileSystem normalizes paths by stripping leading slashes
      // and treats everything as relative. To resolve paths like "../contexts/file.md",
      // we need the actual directory structure.
      //
      // Example: If source file is "src/prompts/ai-blog-writer.prmd"
      // - Main file: src/prompts/ai-blog-writer.prmd
      // - Inherited: src/prompts/blog-writer.prmd (resolves from "./blog-writer.prmd")
      // - User section: src/contexts/user.md (resolves from "../contexts/user.md")

      const mainFilePath = sourceFilePath || 'main.prmd'
      console.log('[CompilationService] Source file path:', sourceFilePath)
      console.log('[CompilationService] Main file in MemoryFS:', mainFilePath)

      const memoryFiles = {
        [mainFilePath]: prompt
      }

      // Add referenced files - frontend sends these with workspace paths
      // The compiler resolves paths relative to the source file, so we need to store files
      // at both their workspace path AND their compiler-resolved path
      //
      // Example: Source file at "prompts/main.prmd" with "context: contexts/data.csv"
      // - Workspace path: "contexts/data.csv"
      // - Compiler-resolved path: "prompts/contexts/data.csv" (relative to source)
      //
      // By storing at both paths, we support both workspace-relative and source-relative references
      if (files && typeof files === 'object') {
        console.log('[CompilationService] Adding workspace files:')
        const sourceDir = sourceFilePath ? sourceFilePath.replace(/[^/]+$/, '') : ''

        for (const [filePath, content] of Object.entries(files)) {
          console.log(`[CompilationService]   ${filePath} (${content.length} bytes)`)
          // Store at original workspace path
          memoryFiles[filePath] = content

          // Also store at compiler-resolved path (source directory + file path)
          // This handles the case where the YAML has workspace-relative paths like "contexts/data.csv"
          // but the compiler resolves them relative to the source file at "prompts/main.prmd"
          if (sourceDir && !filePath.startsWith(sourceDir)) {
            const compilerResolvedPath = sourceDir + filePath
            console.log(`[CompilationService]   Also storing at compiler-resolved path: ${compilerResolvedPath}`)
            memoryFiles[compilerResolvedPath] = content
          }
        }
      }

      // Create MemoryFileSystem with workspace structure
      const memFS = new MemoryFileSystem(memoryFiles)

      // If prompt has relative file inheritance (inherits: ./blog-writer.prmd) or package inheritance,
      // download the package and load it using secure MemoryFileSystem API
      //
      // Security features (automatic validation via @prompd/cli MemoryFileSystem.addPackage):
      // - ZIP Slip protection (path traversal attacks)
      // - Symlink attack prevention
      // - Size limits: 50MB package max, 10MB per file
      // - Package name/version validation
      // - Null byte injection protection
      //
      // See: C:\git\github\Logikbug\prompd-cli\cli\npm\IN-MEMORY-PACKAGES.md
      // Test coverage: 22/22 tests passing
      if ((inheritsFileMatch || inheritsPackageMatch) && packageRef) {
        const relativeFilePath = inheritsFileMatch ? inheritsFileMatch[1] : null
        if (relativeFilePath) {
          console.log('[CompilationService] Detected relative file inheritance:', relativeFilePath)
        }
        console.log('[CompilationService] Package reference from frontend:', packageRef)

        try {
          // Parse the package reference from frontend (@namespace/package@version)
          const pkgMatch = packageRef.match(/^(@[\w.-]+\/[\w.-]+)@([\w.-]+)$/)
          if (!pkgMatch) {
            throw new Error(`Invalid package reference format: ${packageRef}. Expected: @namespace/package@version`)
          }

          const packageName = pkgMatch[1]
          const packageVersion = pkgMatch[2]
          console.log('[CompilationService] Parsed package:', packageName, 'version:', packageVersion)

          // Download package using secure RegistryClient API
          const { RegistryClientService } = await import('./RegistryClientService.js')
          const registryClient = new RegistryClientService()
          const { tarball, metadata } = await registryClient.downloadPackageBuffer(packageName, packageVersion)

          console.log(`[CompilationService] Downloaded ${metadata.name}@${metadata.version} (${tarball.length} bytes)`)

          // Load package into MemoryFileSystem with automatic security validation
          // This validates: ZIP slip, symlinks, size limits, package name/version format
          await memFS.addPackage(packageName, packageVersion, tarball)

          const stats = memFS.getTotalSize(`/packages/${packageName}@${packageVersion}`)
          console.log(`[CompilationService] ✓ Loaded package with ${stats.files} files (${stats.size} bytes)`)

        } catch (pkgError) {
          // Proper error handling - don't silently continue
          console.error('[CompilationService] Package load failed:', pkgError)
          throw new Error(`Failed to load package ${packageRef}: ${pkgError.message}`)
        }
      }

      // Build parameter object (only user parameters, not provider/model)
      const compileParams = {}
      if (parameters && typeof parameters === 'object') {
        for (const [key, value] of Object.entries(parameters)) {
          if (key !== 'provider' && key !== 'model') {
            compileParams[key] = value
          }
        }
      }

      // First, compile to markdown to get the compiled prompt
      let compiledPrompt = ''
      try {
        console.log('[CompilationService] Attempting compilation with @prompd/cli')
        console.log('[CompilationService] Input prompt length:', prompt.length)
        console.log('[CompilationService] mainFilePath:', mainFilePath)
        console.log('[CompilationService] Input prompt preview:', prompt.substring(0, 400))
        console.log('[CompilationService] MemoryFS files:', Array.from(memFS.getAllFiles().keys()))

        // Log file contents for debugging
        console.log('[CompilationService] MemoryFS files:')
        const allFiles = Array.from(memFS.getAllFiles().entries())
        console.log('[CompilationService] Total files in MemoryFS:', allFiles.length)
        for (const [path, content] of allFiles) {
          console.log(`[CompilationService]   ${path}: ${content.length} bytes`)
          console.log(`[CompilationService]     Preview: ${content.substring(0, 150).replace(/\n/g, '\\n')}`)
        }
        console.log('[CompilationService] Compiling file:', mainFilePath)

        console.log('[CompilationService] === Starting compilation ===')
        // Use compileWithContext to get warnings and full context
        // Pass registryUrl so package resolution uses the correct registry (local dev or production)
        const compilationContext = await this.compiler.compileWithContext(mainFilePath, {
          outputFormat: 'markdown',
          parameters: compileParams,
          fileSystem: memFS,
          verbose: false, // Disable verbose to prevent metadata comments in output
          registryUrl: process.env.PROMPD_REGISTRY_URL || 'https://registry.prompdhub.ai'
        })

        // Extract result from context
        const compileResult = compilationContext.compiledResult || ''

        console.log('[CompilationService] === Compilation complete ===')
        console.log('[CompilationService] Compilation context:', {
          hasErrors: compilationContext.hasErrors?.() || compilationContext.errors?.length > 0,
          errors: compilationContext.errors || [],
          warnings: compilationContext.warnings || [],
          metadata: compilationContext.metadata ? { id: compilationContext.metadata.id, name: compilationContext.metadata.name } : null,
          resultType: typeof compileResult,
          resultLength: typeof compileResult === 'string' ? compileResult.length : (compileResult?.length || 0),
          isString: typeof compileResult === 'string',
          resultKeys: typeof compileResult === 'object' ? Object.keys(compileResult || {}) : []
        })

        // Log any warnings for debugging
        if (compilationContext.warnings && compilationContext.warnings.length > 0) {
          console.warn('[CompilationService] Compilation warnings:')
          for (const warning of compilationContext.warnings) {
            console.warn(`  - ${warning}`)
          }
        }

        // Check for errors
        if ((compilationContext.hasErrors?.() || compilationContext.errors?.length > 0)) {
          const errorMessages = (compilationContext.errors || []).join('; ')
          throw new Error(`Compilation errors: ${errorMessages}`)
        }

        // Handle both return formats: string or object { success, output }
        if (typeof compileResult === 'string') {
          // Compiler returned raw string (markdown output)
          compiledPrompt = compileResult
          console.log(`[CompilationService] ✓ Compiler returned string output (${compiledPrompt.length} chars)`)
          if (compiledPrompt.length > 0) {
            console.log('[CompilationService] Compiled prompt preview:', compiledPrompt.substring(0, 300))
          } else {
            console.warn('[CompilationService] ⚠ Warning: Compilation returned empty string')
            console.warn('[CompilationService] This usually means the .prmd file has no body content or inline sections')
          }
        } else if (compileResult && typeof compileResult === 'object' && compileResult.success && compileResult.output) {
          // Compiler returned object with success and output
          compiledPrompt = compileResult.output
          console.log(`[CompilationService] ✓ Compiler returned object with output (${compiledPrompt.length} chars)`)
          console.log('[CompilationService] Compiled prompt preview:', compiledPrompt.substring(0, 300))
        } else if (compileResult && typeof compileResult === 'object') {
          // Compiler returned object but without output - check for errors
          console.error('[CompilationService] ✗ Compiler returned object without output')
          console.error('[CompilationService] compileResult:', JSON.stringify(compileResult, null, 2))
          throw new Error('Compilation failed: No output generated. Check .prmd syntax.')
        } else {
          console.error('[CompilationService] ✗ Compilation returned unexpected result')
          console.error('[CompilationService] compileResult type:', typeof compileResult)
          console.error('[CompilationService] compileResult preview:',
            typeof compileResult === 'string' ? compileResult.substring(0, 500) : JSON.stringify(compileResult, null, 2))
          throw new Error('Compilation failed: Unexpected result type. Check .prmd syntax.')
        }
      } catch (compileError) {
        console.error('[CompilationService] Compilation to markdown failed:', compileError.message, compileError.stack)
        // Don't silently fall back - propagate the error so users know their .prmd has issues
        throw new Error(`Compilation failed: ${compileError.message}`)
      }

      // Now execute against the LLM provider using appropriate SDK
      let result
      try {
        if (providerName === 'anthropic') {
          // Use Anthropic SDK
          const Anthropic = (await import('@anthropic-ai/sdk')).default
          const anthropic = new Anthropic({ apiKey: providerConfig.apiKey })

          const response = await anthropic.messages.create({
            model: model,
            max_tokens: 4096,
            messages: [
              {
                role: 'user',
                content: compiledPrompt || prompt
              }
            ]
          })

          result = {
            exitCode: 0,
            stdout: JSON.stringify({
              success: true,
              response: response.content[0].text,
              usage: {
                promptTokens: response.usage.input_tokens,
                completionTokens: response.usage.output_tokens,
                totalTokens: response.usage.input_tokens + response.usage.output_tokens
              }
            })
          }
        } else if (providerName === 'openai') {
          // Use OpenAI SDK
          const OpenAI = (await import('openai')).default
          const openai = new OpenAI({ apiKey: providerConfig.apiKey })

          const response = await openai.chat.completions.create({
            model: model,
            messages: [
              {
                role: 'user',
                content: compiledPrompt || prompt
              }
            ]
          })

          result = {
            exitCode: 0,
            stdout: JSON.stringify({
              success: true,
              response: response.choices[0].message.content,
              usage: {
                promptTokens: response.usage.prompt_tokens,
                completionTokens: response.usage.completion_tokens,
                totalTokens: response.usage.total_tokens
              }
            })
          }
        } else if (providerName === 'google') {
          // Use Google Generative AI SDK (Gemini)
          console.log('[CompilationService] >>> GOOGLE GEMINI BLOCK ENTERED <<<')
          const { GoogleGenerativeAI } = await import('@google/generative-ai')
          const genAI = new GoogleGenerativeAI(providerConfig.apiKey)
          const generativeModel = genAI.getGenerativeModel({ model: model })

          console.log('[CompilationService] Calling Gemini with prompt length:', (compiledPrompt || prompt).length)
          const response = await generativeModel.generateContent(compiledPrompt || prompt)
          console.log('[CompilationService] Gemini API call completed')

          // Debug logging for Google response structure
          console.log('[CompilationService] Google response type:', typeof response)
          console.log('[CompilationService] Google response keys:', Object.keys(response || {}))

          // Get the response - the SDK returns a GenerateContentResult
          // response.response is a GenerateContentResponse with text() method
          const generatedResponse = response.response
          console.log('[CompilationService] generatedResponse type:', typeof generatedResponse)
          console.log('[CompilationService] generatedResponse keys:', Object.keys(generatedResponse || {}))

          let responseText = ''

          // Try to extract text from the response
          if (generatedResponse && typeof generatedResponse.text === 'function') {
            console.log('[CompilationService] Using text() method')
            responseText = generatedResponse.text()
          } else if (generatedResponse?.candidates?.[0]?.content?.parts?.[0]?.text) {
            // Fallback: extract from candidates array directly
            console.log('[CompilationService] Using candidates array fallback')
            responseText = generatedResponse.candidates[0].content.parts[0].text
          } else {
            console.log('[CompilationService] WARNING: Could not extract text!')
            console.log('[CompilationService] candidates:', JSON.stringify(generatedResponse?.candidates, null, 2))
          }

          console.log('[CompilationService] Google responseText length:', responseText?.length)
          console.log('[CompilationService] Google responseText (first 500 chars):', responseText?.substring(0, 500))

          const usageMetadata = generatedResponse?.usageMetadata || {}
          console.log('[CompilationService] Google usageMetadata:', JSON.stringify(usageMetadata))

          result = {
            exitCode: 0,
            stdout: JSON.stringify({
              success: true,
              response: responseText,
              usage: {
                promptTokens: usageMetadata.promptTokenCount || 0,
                completionTokens: usageMetadata.candidatesTokenCount || 0,
                totalTokens: usageMetadata.totalTokenCount || 0
              }
            })
          }
          console.log('[CompilationService] >>> GOOGLE GEMINI BLOCK COMPLETE <<<')
        } else if (providerName === 'groq') {
          // Groq API (OpenAI-compatible)
          console.log('[CompilationService] >>> GROQ BLOCK ENTERED <<<')
          const OpenAI = (await import('openai')).default
          const groq = new OpenAI({ apiKey: providerConfig.apiKey, baseURL: 'https://api.groq.com/openai/v1' })
          const response = await groq.chat.completions.create({ model, messages: [{ role: 'user', content: compiledPrompt || prompt }] })
          result = { exitCode: 0, stdout: JSON.stringify({ success: true, response: response.choices[0].message.content, usage: { promptTokens: response.usage?.prompt_tokens || 0, completionTokens: response.usage?.completion_tokens || 0, totalTokens: response.usage?.total_tokens || 0 } }) }
          console.log('[CompilationService] >>> GROQ BLOCK COMPLETE <<<')
        } else if (providerName === 'mistral') {
          // Mistral API (OpenAI-compatible)
          console.log('[CompilationService] >>> MISTRAL BLOCK ENTERED <<<')
          const OpenAI = (await import('openai')).default
          const mistral = new OpenAI({ apiKey: providerConfig.apiKey, baseURL: 'https://api.mistral.ai/v1' })
          const response = await mistral.chat.completions.create({ model, messages: [{ role: 'user', content: compiledPrompt || prompt }] })
          result = { exitCode: 0, stdout: JSON.stringify({ success: true, response: response.choices[0].message.content, usage: { promptTokens: response.usage?.prompt_tokens || 0, completionTokens: response.usage?.completion_tokens || 0, totalTokens: response.usage?.total_tokens || 0 } }) }
          console.log('[CompilationService] >>> MISTRAL BLOCK COMPLETE <<<')
        } else if (providerName === 'cohere') {
          // Cohere API (native SDK)
          console.log('[CompilationService] >>> COHERE BLOCK ENTERED <<<')
          const { CohereClient } = await import('cohere-ai')
          const cohere = new CohereClient({ token: providerConfig.apiKey })
          const response = await cohere.chat({ model, message: compiledPrompt || prompt })
          result = { exitCode: 0, stdout: JSON.stringify({ success: true, response: response.text, usage: { promptTokens: response.meta?.tokens?.inputTokens || 0, completionTokens: response.meta?.tokens?.outputTokens || 0, totalTokens: (response.meta?.tokens?.inputTokens || 0) + (response.meta?.tokens?.outputTokens || 0) } }) }
          console.log('[CompilationService] >>> COHERE BLOCK COMPLETE <<<')
        } else if (providerName === 'together') {
          // Together API (OpenAI-compatible)
          console.log('[CompilationService] >>> TOGETHER BLOCK ENTERED <<<')
          const OpenAI = (await import('openai')).default
          const together = new OpenAI({ apiKey: providerConfig.apiKey, baseURL: 'https://api.together.xyz/v1' })
          const response = await together.chat.completions.create({ model, messages: [{ role: 'user', content: compiledPrompt || prompt }] })
          result = { exitCode: 0, stdout: JSON.stringify({ success: true, response: response.choices[0].message.content, usage: { promptTokens: response.usage?.prompt_tokens || 0, completionTokens: response.usage?.completion_tokens || 0, totalTokens: response.usage?.total_tokens || 0 } }) }
          console.log('[CompilationService] >>> TOGETHER BLOCK COMPLETE <<<')
        } else if (providerName === 'perplexity') {
          // Perplexity API (OpenAI-compatible)
          console.log('[CompilationService] >>> PERPLEXITY BLOCK ENTERED <<<')
          const OpenAI = (await import('openai')).default
          const perplexity = new OpenAI({ apiKey: providerConfig.apiKey, baseURL: 'https://api.perplexity.ai' })
          const response = await perplexity.chat.completions.create({ model, messages: [{ role: 'user', content: compiledPrompt || prompt }] })
          result = { exitCode: 0, stdout: JSON.stringify({ success: true, response: response.choices[0].message.content, usage: { promptTokens: response.usage?.prompt_tokens || 0, completionTokens: response.usage?.completion_tokens || 0, totalTokens: response.usage?.total_tokens || 0 } }) }
          console.log('[CompilationService] >>> PERPLEXITY BLOCK COMPLETE <<<')
        } else if (providerName === 'deepseek') {
          // DeepSeek API (OpenAI-compatible)
          console.log('[CompilationService] >>> DEEPSEEK BLOCK ENTERED <<<')
          const OpenAI = (await import('openai')).default
          const deepseek = new OpenAI({ apiKey: providerConfig.apiKey, baseURL: 'https://api.deepseek.com/v1' })
          const response = await deepseek.chat.completions.create({ model, messages: [{ role: 'user', content: compiledPrompt || prompt }] })
          result = { exitCode: 0, stdout: JSON.stringify({ success: true, response: response.choices[0].message.content, usage: { promptTokens: response.usage?.prompt_tokens || 0, completionTokens: response.usage?.completion_tokens || 0, totalTokens: response.usage?.total_tokens || 0 } }) }
          console.log('[CompilationService] >>> DEEPSEEK BLOCK COMPLETE <<<')
        } else if (providerName === 'ollama') {
          // Ollama API (OpenAI-compatible, local)
          console.log('[CompilationService] >>> OLLAMA BLOCK ENTERED <<<')
          const OpenAI = (await import('openai')).default
          const ollama = new OpenAI({ apiKey: 'ollama', baseURL: providerConfig.baseUrl || 'http://localhost:11434/v1' })
          const response = await ollama.chat.completions.create({ model, messages: [{ role: 'user', content: compiledPrompt || prompt }] })
          result = { exitCode: 0, stdout: JSON.stringify({ success: true, response: response.choices[0].message.content, usage: { promptTokens: response.usage?.prompt_tokens || 0, completionTokens: response.usage?.completion_tokens || 0, totalTokens: response.usage?.total_tokens || 0 } }) }
          console.log('[CompilationService] >>> OLLAMA BLOCK COMPLETE <<<')
        } else {
          throw new Error(`Unsupported provider: ${providerName}. Supported providers: 'openai', 'anthropic', 'google', 'groq', 'mistral', 'cohere', 'together', 'perplexity', 'deepseek', 'ollama'.`)
        }
      } catch (providerError) {
        console.error('[CompilationService] Provider API error:', providerError.message)
        console.error('[CompilationService] Provider error details:', providerError.errorDetails || 'none')

        // Build a more descriptive error message for rate limits
        let errorMessage = providerError.message
        if (providerError.status === 429) {
          const retryInfo = providerError.errorDetails?.find(d => d['@type']?.includes('RetryInfo'))
          const retryDelay = retryInfo?.retryDelay || '30s'
          errorMessage = `Rate limit exceeded. Please wait ${retryDelay} before trying again.`
        }

        result = {
          exitCode: 1,
          stderr: errorMessage,
          stdout: JSON.stringify({
            success: false,
            error: errorMessage
          })
        }
      }

      const executionTime = Date.now() - startTime

      // Parse CLI output
      const parsed = this.parseCliOutput(result.stdout)

      // Calculate cost using pricing service
      const promptTokens = parsed.usage?.promptTokens || parsed.promptTokens || 0
      const completionTokens = parsed.usage?.completionTokens || parsed.completionTokens || 0
      let costResult = null
      let estimatedCost = 0

      if (promptTokens > 0 || completionTokens > 0) {
        try {
          costResult = await pricingService.calculateCost(
            providerName,
            model,
            promptTokens,
            completionTokens
          )
          estimatedCost = costResult?.totalCost || 0
        } catch (pricingError) {
          console.warn('[CompilationService] Failed to calculate cost:', pricingError.message)
          // Continue without cost calculation - don't fail the execution
        }
      }

      return {
        success: parsed.success,
        response: parsed.response || parsed.output,
        compiledPrompt: compiledPrompt, // Always has value (compiled or original)
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
          cost: estimatedCost,
          // Enhanced pricing breakdown
          costBreakdown: costResult ? {
            inputCost: costResult.inputCost,
            outputCost: costResult.outputCost,
            totalCost: costResult.totalCost,
            inputRate: costResult.inputRate,
            outputRate: costResult.outputRate,
            currency: 'USD'
          } : null,
          pricingRef: costResult ? {
            pricingId: costResult.pricingId,
            effectiveFrom: costResult.pricingEffectiveFrom
          } : null
        },
        metadata: {
          executionTime,
          provider: providerConfig.name,
          providerDisplayName: providerConfig.displayName,
          model,
          latency: parsed.latency || executionTime,
          baseUrl: providerConfig.baseUrl
        },
        error: parsed.error || (result.exitCode !== 0 ? result.stderr : null)
      }

    } catch (error) {
      console.error('Execution error:', error)
      console.error('Error stack:', error.stack)
      return {
        success: false,
        error: error.message,
        response: null,
        compiledPrompt: null,  // Include compiledPrompt in error response for consistency
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cost: 0,
          costBreakdown: null,
          pricingRef: null
        },
        metadata: {
          executionTime: Date.now() - startTime,
          provider: providerName,
          model,
          latency: 0
        }
      }
    }
  }
}
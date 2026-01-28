// Local Compiler Service
// Provides local compilation using @prompd/cli via Electron IPC
// Falls back to backend API when not running in Electron

import type {
  CompileOptions,
  CompileResult,
  CompileContextResult,
  ValidateResult,
  CompilerInfo
} from '../../electron'

// Re-export types for convenience
export type { CompileOptions, CompileResult, CompileContextResult, ValidateResult, CompilerInfo }

class LocalCompilerService {
  private isElectron: boolean
  private compilerAvailable: boolean | null = null

  constructor() {
    this.isElectron = typeof window !== 'undefined' && !!window.electronAPI?.compiler
  }

  /**
   * Check if local compilation is available
   */
  hasLocalCompiler(): boolean {
    return this.isElectron
  }

  /**
   * Check if the compiler is working (lazy initialization check)
   */
  async isCompilerAvailable(): Promise<boolean> {
    if (this.compilerAvailable !== null) {
      return this.compilerAvailable
    }

    if (!this.isElectron) {
      this.compilerAvailable = false
      return false
    }

    try {
      const info = await this.getInfo()
      this.compilerAvailable = info.success
      return this.compilerAvailable
    } catch {
      this.compilerAvailable = false
      return false
    }
  }

  /**
   * Compile a prompt to the specified format
   * @param content - The .prmd file content
   * @param options - Compilation options
   */
  async compile(content: string, options: CompileOptions = {}): Promise<CompileResult> {
    if (this.isElectron && window.electronAPI?.compiler) {
      try {
        return await window.electronAPI.compiler.compile(content, options)
      } catch (error) {
        console.error('[LocalCompiler] IPC error:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown compilation error',
          metadata: { compilationTime: 0 }
        }
      }
    }

    // Fallback: Local compilation not available
    return {
      success: false,
      error: 'Local compiler not available (Electron required)',
      metadata: { compilationTime: 0 }
    }
  }

  /**
   * Compile with full context including errors, warnings, and stage information
   * @param content - The .prmd file content
   * @param options - Compilation options
   */
  async compileWithContext(content: string, options: CompileOptions = {}): Promise<CompileContextResult> {
    if (this.isElectron && window.electronAPI?.compiler) {
      try {
        return await window.electronAPI.compiler.compileWithContext(content, options)
      } catch (error) {
        console.error('[LocalCompiler] IPC error:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown compilation error',
          errors: [error instanceof Error ? error.message : 'Unknown error'],
          warnings: [],
          metadata: { compilationTime: 0 }
        }
      }
    }

    return {
      success: false,
      error: 'Local compiler not available (Electron required)',
      errors: ['Local compiler not available'],
      warnings: [],
      metadata: { compilationTime: 0 }
    }
  }

  /**
   * Validate a prompt without full compilation
   * Useful for syntax checking and parameter validation
   * @param content - The .prmd file content
   */
  async validate(content: string): Promise<ValidateResult> {
    if (this.isElectron && window.electronAPI?.compiler) {
      try {
        return await window.electronAPI.compiler.validate(content)
      } catch (error) {
        console.error('[LocalCompiler] IPC error:', error)
        return {
          success: false,
          isValid: false,
          issues: [{ type: 'error', message: error instanceof Error ? error.message : 'Validation failed' }],
          error: error instanceof Error ? error.message : 'Validation failed'
        }
      }
    }

    return {
      success: false,
      isValid: false,
      issues: [{ type: 'error', message: 'Local compiler not available' }],
      error: 'Local compiler not available (Electron required)'
    }
  }

  /**
   * Get compiler version and capabilities
   */
  async getInfo(): Promise<CompilerInfo> {
    if (this.isElectron && window.electronAPI?.compiler) {
      try {
        return await window.electronAPI.compiler.info()
      } catch (error) {
        console.error('[LocalCompiler] IPC error:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get compiler info'
        }
      }
    }

    return {
      success: false,
      error: 'Local compiler not available (Electron required)'
    }
  }

  /**
   * Compile to markdown format (convenience method)
   * @param content - The .prmd file content
   * @param parameters - Template parameters
   * @param filePath - Optional file path for disk-based compilation (enables inheritance)
   */
  async compileToMarkdown(
    content: string,
    parameters: Record<string, unknown> = {},
    filePath?: string | null
  ): Promise<CompileResult> {
    return this.compile(content, {
      format: 'markdown',
      parameters,
      filePath: filePath || undefined
    })
  }

  /**
   * Compile to OpenAI format (convenience method)
   */
  async compileToOpenAI(
    content: string,
    parameters: Record<string, unknown> = {},
    filePath?: string | null
  ): Promise<CompileResult> {
    return this.compile(content, {
      format: 'openai',
      parameters,
      filePath: filePath || undefined
    })
  }

  /**
   * Compile to Anthropic format (convenience method)
   */
  async compileToAnthropic(
    content: string,
    parameters: Record<string, unknown> = {},
    filePath?: string | null
  ): Promise<CompileResult> {
    return this.compile(content, {
      format: 'anthropic',
      parameters,
      filePath: filePath || undefined
    })
  }

  /**
   * Check if content is valid .prmd format (quick check without full validation)
   */
  isPrompdContent(content: string): boolean {
    // Quick check for YAML frontmatter
    const trimmed = content.trim()
    return trimmed.startsWith('---') && trimmed.includes('---', 4)
  }

  /**
   * Extract parameters from content (without full compilation)
   * Returns parameter names referenced in the content
   */
  extractParameterRefs(content: string): string[] {
    const paramPattern = /\{\{([^}]+)\}\}/g
    const params = new Set<string>()

    let match
    while ((match = paramPattern.exec(content)) !== null) {
      const paramExpr = match[1].trim()
      // Extract parameter name (before any filter or default)
      const paramName = paramExpr.split('|')[0].trim()

      // Skip control structures
      if (!['if', 'else', 'endif', 'for', 'endfor', 'include'].includes(paramName)) {
        params.add(paramName)
      }
    }

    return Array.from(params)
  }
}

// Export singleton instance
export const localCompiler = new LocalCompilerService()

// Export class for testing
export { LocalCompilerService }

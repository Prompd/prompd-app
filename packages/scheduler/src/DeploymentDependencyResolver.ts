/**
 * DeploymentDependencyResolver - Resolves all dependencies for workflow deployment
 *
 * Handles:
 * - Context file references (e.g., ../contexts/typescript-examples.ts)
 * - Package inheritance (e.g., @prompd/core@0.0.1/prompts/base.prmd)
 * - Recursive dependency resolution
 */

import * as fs from 'fs'
import * as path from 'path'
import { PrompdParser, RegistryClient } from '@prompd/cli'

export interface ResolvedDependency {
  type: 'context' | 'inherits' | 'package'
  source: string
  resolvedPath: string
  content?: string
}

export interface DependencyResolutionResult {
  dependencies: ResolvedDependency[]
  packages: string[] // Package specs like "@prompd/core@0.0.1"
  contextFiles: string[] // Resolved file paths
}

export class DeploymentDependencyResolver {
  private registryClient: RegistryClient | null = null
  private visited: Set<string> = new Set()

  constructor() {
    // PrompdParser.parse is a static method, no need to store it
  }

  /**
   * Resolve all dependencies for a .prmd file
   */
  async resolveDependencies(
    filePath: string,
    workspaceRoot: string
  ): Promise<DependencyResolutionResult> {
    this.visited.clear()

    const result: DependencyResolutionResult = {
      dependencies: [],
      packages: [],
      contextFiles: []
    }

    await this.resolveDependenciesRecursive(filePath, workspaceRoot, result)

    return result
  }

  /**
   * Recursively resolve dependencies from a file
   */
  private async resolveDependenciesRecursive(
    filePath: string,
    workspaceRoot: string,
    result: DependencyResolutionResult
  ): Promise<void> {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(workspaceRoot, filePath)

    // Avoid circular dependencies
    if (this.visited.has(absolutePath)) {
      return
    }
    this.visited.add(absolutePath)

    // Check if file exists
    if (!fs.existsSync(absolutePath)) {
      console.warn(`[DependencyResolver] File not found: ${absolutePath}`)
      return
    }

    // Parse the file
    const content = fs.readFileSync(absolutePath, 'utf-8')
    let parsed: any

    try {
      parsed = PrompdParser.parse(content)
    } catch (error) {
      console.error(`[DependencyResolver] Failed to parse ${absolutePath}:`, error)
      return
    }

    // Extract context file references (context: or contexts: - both singular and plural)
    const contextArray = parsed.frontmatter?.context || parsed.frontmatter?.contexts
    if (contextArray && Array.isArray(contextArray)) {
      for (const contextRef of contextArray) {
        if (typeof contextRef !== 'string') continue
        const contextPath = path.resolve(path.dirname(absolutePath), contextRef)

        if (fs.existsSync(contextPath)) {
          result.dependencies.push({
            type: 'context',
            source: contextRef,
            resolvedPath: contextPath,
            content: fs.readFileSync(contextPath, 'utf-8')
          })
          result.contextFiles.push(contextPath)
        } else {
          console.warn(`[DependencyResolver] Context file not found: ${contextPath}`)
        }
      }
    }

    // Extract override file references (override: { system: "../systems/file.md" })
    if (parsed.frontmatter?.override && typeof parsed.frontmatter.override === 'object') {
      for (const overrideValue of Object.values(parsed.frontmatter.override)) {
        if (typeof overrideValue !== 'string') continue
        const overridePath = path.resolve(path.dirname(absolutePath), overrideValue as string)

        if (fs.existsSync(overridePath)) {
          result.contextFiles.push(overridePath)
        } else {
          console.warn(`[DependencyResolver] Override file not found: ${overridePath}`)
        }
      }
    }

    // Extract inheritance dependencies
    if (parsed.frontmatter?.inherits) {
      const inheritsSpec = parsed.frontmatter.inherits

      if (inheritsSpec.startsWith('@')) {
        // Package spec: "@namespace/package@version" or "@namespace/package@version/path/to/file.prmd"
        const match = inheritsSpec.match(/^(@[^/]+\/[^@]+)@([^/]+)(?:\/(.+))?$/)

        if (match) {
          const [, packageName, version] = match
          const packageSpec = `${packageName}@${version}`

          if (!result.packages.includes(packageSpec)) {
            result.packages.push(packageSpec)
          }

          result.dependencies.push({
            type: 'inherits',
            source: inheritsSpec,
            resolvedPath: inheritsSpec
          })
        }
      } else {
        // Local file inherits (e.g., ../templates/base.prmd) - resolve relative to this file
        const inheritsPath = path.resolve(path.dirname(absolutePath), inheritsSpec)

        if (fs.existsSync(inheritsPath)) {
          result.dependencies.push({
            type: 'inherits',
            source: inheritsSpec,
            resolvedPath: inheritsPath
          })

          // Recursively resolve dependencies from the inherited file
          await this.resolveDependenciesRecursive(inheritsPath, workspaceRoot, result)
        } else {
          console.warn(`[DependencyResolver] Inherited file not found: ${inheritsPath}`)
        }
      }
    }

    // Extract attached files (files: field in frontmatter)
    if (parsed.frontmatter?.files && Array.isArray(parsed.frontmatter.files)) {
      for (const fileRef of parsed.frontmatter.files) {
        const filePath = path.resolve(path.dirname(absolutePath), fileRef)

        if (fs.existsSync(filePath)) {
          result.contextFiles.push(filePath)
        } else {
          console.warn(`[DependencyResolver] Attached file not found: ${filePath}`)
        }
      }
    }
  }

  /**
   * Install package dependencies
   */
  async installPackages(
    packages: string[],
    workspaceRoot: string
  ): Promise<void> {
    if (packages.length === 0) {
      return
    }

    if (!this.registryClient) {
      this.registryClient = new RegistryClient()
    }

    for (const packageSpec of packages) {
      console.log(`[DependencyResolver] Installing package: ${packageSpec}`)
      try {
        await this.registryClient.install(packageSpec, {
          workspaceRoot,
          skipCache: false
        })
      } catch (error) {
        console.error(`[DependencyResolver] Failed to install ${packageSpec}:`, error)
        throw error
      }
    }
  }

  /**
   * Copy context files to deployment directory
   */
  copyContextFiles(
    contextFiles: string[],
    sourceRoot: string,
    targetRoot: string
  ): void {
    for (const contextFile of contextFiles) {
      const relativePath = path.relative(sourceRoot, contextFile)
      const targetPath = path.join(targetRoot, relativePath)

      // Create target directory
      const targetDir = path.dirname(targetPath)
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true })
      }

      // Copy file
      fs.copyFileSync(contextFile, targetPath)
      console.log(`[DependencyResolver] Copied context file: ${relativePath}`)
    }
  }
}

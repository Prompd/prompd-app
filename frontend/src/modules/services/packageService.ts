import { prompdSettings } from './prompdSettings'
import { getApiBaseUrl } from './apiConfig'
import { electronFetch } from './electronFetch'
import type { ResourceType } from './resourceTypes'
import type { NodeTemplateNodeData } from './nodeTemplateTypes'

/** Type-specific section for node-template packages */
export interface NodeTemplateSectionData {
  nodeTypeLabel: string
  node: NodeTemplateNodeData
  pathsConverted?: boolean
}

/** Type-specific section for skill packages */
export interface SkillSectionData {
  allowedTools?: string[]              // Tools the skill is permitted to use at runtime
  parameters?: Record<string, unknown> // JSON Schema for input parameters
}

/** Type-specific section for workflow packages */
export interface WorkflowSectionData {
  entrypoint?: string
  triggers?: Record<string, unknown>[]
  parameters?: Record<string, unknown>
}

export interface PackageManifest {
  name: string
  version: string
  description: string
  type?: ResourceType
  author?: string
  license?: string
  keywords?: string[]
  main?: string
  readme?: string  // Path to README file (e.g., "README.md")
  repository?: string
  files?: string[]
  ignore?: string[]  // Glob patterns for files to exclude from package
  tools?: string[]   // Required tool names (universal dependency declaration)
  mcps?: string[]    // MCP server names required by this package
  // Type-specific sections (keyed by the resource type)
  'node-template'?: NodeTemplateSectionData
  'skill'?: SkillSectionData
  'workflow'?: WorkflowSectionData
}

// Check if running in Electron with local package support
const hasLocalPackageSupport = () => {
  return !!(window as any).electronAPI?.package?.createLocal
}

export interface CreatePackageOptions {
  onProgress?: (percent: number) => void
}

export interface Namespace {
  name: string
  displayName?: string
  description?: string
  type: 'personal' | 'organization'
  canPublish: boolean
  frozen?: boolean
}

export interface CreatePackageResult {
  blob: Blob
  /** On-disk path to the .pdpkg file (only available in Electron/local mode) */
  outputPath?: string
}

export class PackageService {
  /**
   * Create package using local CLI (Electron) or backend API (web)
   * Local CLI handles extension transforms (.ts -> .ts.txt), secret scanning, archiving
   */
  async createPackage(
    workspaceHandle: FileSystemDirectoryHandle,
    manifest: PackageManifest,
    getToken: () => Promise<string | null>,
    options: CreatePackageOptions = {}
  ): Promise<CreatePackageResult> {
    console.log('[PackageService] Creating package:', manifest.name)
    const selectedFiles = manifest.files || []
    if (selectedFiles.length === 0) {
      throw new Error('No files selected')
    }

    // Detect Electron mode
    const electronPath = (workspaceHandle as any)?._electronPath
    const isElectronMode = electronPath && (window as any).electronAPI?.readFile

    // Use local CLI for packaging in Electron mode (handles extension transforms correctly)
    if (isElectronMode && hasLocalPackageSupport()) {
      return this.createPackageLocal(electronPath, manifest)
    }

    // Determine the directory prefix where prompd.json is located
    // This will be stripped from all file paths so they're relative to manifest
    let manifestDir = ''
    const manifestFile = selectedFiles.find(f => f.endsWith('prompd.json') || f.endsWith('manifest.json'))
    if (manifestFile) {
      const lastSlash = manifestFile.lastIndexOf('/')
      if (lastSlash > 0) {
        manifestDir = manifestFile.substring(0, lastSlash + 1) // Keep trailing slash
        console.log('[PackageService] Manifest directory:', manifestDir)
      }
    }

    // Prepare FormData
    const formData = new FormData()
    formData.append('manifest', JSON.stringify(manifest))

    // Collect file paths separately (browsers strip path separators from FormData filenames)
    const filePaths: string[] = []

    // Read and append files from workspace
    for (const filePath of selectedFiles) {
      try {
        let file: File

        if (isElectronMode) {
          // Electron mode - use IPC to read the file
          const fullPath = `${electronPath}/${filePath}`.replace(/\\/g, '/')
          const result = await (window as any).electronAPI.readFile(fullPath)
          if (!result.success) {
            throw new Error(result.error || 'Failed to read file')
          }
          // Create a File object from the content
          const blob = new Blob([result.content], { type: 'text/plain' })
          file = new File([blob], filePath.split('/').pop() || 'file', { type: 'text/plain' })
        } else {
          // File System Access API mode
          const fileHandle = await this.getFileFromPath(workspaceHandle, filePath)
          file = await fileHandle.getFile()
        }

        // Strip manifest directory prefix to make paths relative to manifest location
        let relativePath = filePath
        if (manifestDir && filePath.startsWith(manifestDir)) {
          relativePath = filePath.substring(manifestDir.length)
        }

        // Skip prompd.json/manifest.json itself - backend will add it separately
        if (relativePath === 'prompd.json' || relativePath === 'manifest.json') {
          console.log(`[PackageService] Skipping ${relativePath} (added by backend)`)
          continue
        }

        // Append file (browser may strip path from filename)
        formData.append('files', file)
        // Track the actual relative path separately
        filePaths.push(relativePath)

        console.log(`[PackageService] Added: ${filePath} → ${relativePath} (${file.size} bytes)`)
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        throw new Error(`Failed to read file ${filePath}: ${message}`)
      }
    }

    // Send file paths as separate JSON array (browsers strip paths from FormData filenames)
    formData.append('filePaths', JSON.stringify(filePaths))

    // Send to backend
    const token = await getToken()
    console.log('[PackageService] Token retrieved:', token ? `${token.substring(0, 20)}...` : 'NULL')

    if (!token) {
      throw new Error('Authentication required. Please sign in to publish packages.')
    }

    console.log('[PackageService] Sending request to:', `${getApiBaseUrl()}/packages/create`)
    const response = await fetch(`${getApiBaseUrl()}/packages/create`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    })

    console.log('[PackageService] Response status:', response.status)
    if (!response.ok) {
      const error = await response.json()

      // Handle secrets detected error
      if (error.code === 'SECRETS_DETECTED') {
        const fileList = error.details
          .map((d: { file: string; secrets: string[] }) => `  • ${d.file}: ${d.secrets.join(', ')}`)
          .join('\n')
        throw new Error(`🔒 Secrets detected in files:\n${fileList}\n\nRemove secrets before packaging.`)
      }

      throw new Error(error.error || 'Package creation failed')
    }

    // Return blob (no outputPath in web mode)
    const blob = await response.blob()
    console.log(`[PackageService] ✅ Package created: ${blob.size} bytes`)

    return { blob }
  }

  /**
   * Publish package to registry directly via Electron IPC
   * Sends the .pdpkg file directly to the registry (no backend proxy).
   */
  async publish(
    filePath: string | undefined,
    manifest: PackageManifest,
    getToken: () => Promise<string | null>,
    onProgress?: (percent: number) => void,
    registryConfig?: { apiKey?: string; url?: string }
  ): Promise<void> {
    console.log('[PackageService] Publishing:', manifest.name)

    if (!filePath) {
      throw new Error('No package file path available. Package creation may have failed.')
    }

    const electronAPI = (window as any).electronAPI
    if (!electronAPI?.package?.publish) {
      throw new Error('Electron IPC not available for publishing.')
    }

    // Use registry API key if available, otherwise fall back to auth token
    let authToken: string | null = registryConfig?.apiKey || null
    if (!authToken) {
      authToken = await getToken()
    }
    if (!authToken) {
      throw new Error('Authentication required. Please sign in or configure a registry API key.')
    }

    // Resolve registry URL
    const registryUrl = registryConfig?.url || prompdSettings.getRegistryUrl()

    if (onProgress) onProgress(10)

    const result = await electronAPI.package.publish({
      filePath,
      registryUrl,
      authToken,
    })

    if (onProgress) onProgress(100)

    if (!result.success) {
      throw new Error(result.error || 'Publish failed')
    }

    console.log('[PackageService] Published via IPC:', result.data)
  }

  /**
   * Get user's namespaces from registry
   * If registryConfig is provided, fetches from that specific registry using its API key.
   * Otherwise falls back to default registry with Clerk token.
   */
  async getUserNamespaces(
    getToken: () => Promise<string | null>,
    registryConfig?: { apiKey?: string; url?: string }
  ): Promise<Namespace[]> {
    const registryUrl = registryConfig?.url || prompdSettings.getRegistryUrl()

    // Use registry API key if available, otherwise fall back to Clerk token
    let authToken: string | null = registryConfig?.apiKey || null
    if (!authToken) {
      authToken = await getToken()
    }

    if (!authToken) {
      throw new Error('Authentication required. Please sign in or configure a registry API key.')
    }

    console.log('[PackageService] Fetching namespaces from:', registryUrl)

    const response = await electronFetch(`${registryUrl}/user/namespaces`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch namespaces: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()

    // Backend returns array directly, not wrapped in object
    const namespaces = Array.isArray(data) ? data : []

    // Transform to match expected format
    return namespaces.map((ns: Record<string, unknown>) => ({
      name: ns.name as string,
      displayName: (ns.displayName as string) || (ns.name as string),
      description: ns.description as string | undefined,
      type: (ns.type as 'personal' | 'organization') || 'personal',
      canPublish: (ns.canPublish as boolean) ?? true,
      frozen: (ns.frozen as boolean) ?? false
    }))
  }

  /**
   * Create package using local CLI via Electron IPC
   * This handles extension transforms (.ts -> .ts.txt) for security compliance
   */
  private async createPackageLocal(
    workspacePath: string,
    manifest: PackageManifest
  ): Promise<CreatePackageResult> {
    console.log('[PackageService] Using local CLI for package creation')
    const electronAPI = (window as any).electronAPI

    // First, ensure prompd.json is up to date with the manifest
    // Build a clean object — omit undefined values so they don't pollute the JSON
    const manifestObj: Record<string, unknown> = {
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      type: manifest.type,
      author: manifest.author,
      license: manifest.license,
      keywords: manifest.keywords,
      readme: manifest.readme,
      repository: manifest.repository,
      main: manifest.main,
      files: manifest.files,
      ignore: manifest.ignore,
      tools: manifest.tools,
      mcps: manifest.mcps,
    }
    // Include type-specific sections when present
    if (manifest['node-template']) manifestObj['node-template'] = manifest['node-template']
    if (manifest.skill) manifestObj.skill = manifest.skill
    if (manifest.workflow) manifestObj.workflow = manifest.workflow

    const manifestContent = JSON.stringify(manifestObj, null, 2)

    const manifestPath = `${workspacePath}/prompd.json`.replace(/\\/g, '/')
    const writeResult = await electronAPI.writeFile(manifestPath, manifestContent)
    if (!writeResult.success) {
      throw new Error(`Failed to update prompd.json: ${writeResult.error}`)
    }
    console.log('[PackageService] Updated prompd.json before packaging')

    // Create package using local CLI (outputs to dist/ by default)
    const result = await electronAPI.package.createLocal(workspacePath)

    if (!result.success) {
      throw new Error(result.error || 'Local package creation failed')
    }

    const outputPath: string = result.outputPath
    console.log('[PackageService] Local CLI created package:', outputPath)

    // Read the created .pdpkg file as a blob (readBinaryFile returns base64)
    const readResult = await electronAPI.readBinaryFile(outputPath)
    if (!readResult.success) {
      throw new Error(`Failed to read package file: ${readResult.error}`)
    }

    // Convert base64 to Blob
    const binaryString = atob(readResult.data)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    const blob = new Blob([bytes], { type: 'application/zip' })
    console.log(`[PackageService] Package blob created: ${blob.size} bytes`)

    return { blob, outputPath }
  }

  /**
   * Helper: Get file handle from path (supports nested directories)
   */
  private async getFileFromPath(
    dirHandle: FileSystemDirectoryHandle,
    filePath: string
  ): Promise<FileSystemFileHandle> {
    const parts = filePath.split('/').filter(p => p && p !== '.')
    let currentHandle: FileSystemDirectoryHandle | FileSystemFileHandle = dirHandle

    for (let i = 0; i < parts.length - 1; i++) {
      currentHandle = await (currentHandle as FileSystemDirectoryHandle).getDirectoryHandle(parts[i])
    }

    return await (currentHandle as FileSystemDirectoryHandle).getFileHandle(parts[parts.length - 1])
  }
}

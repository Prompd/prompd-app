// API client for backend integration
import { parsePrompd } from '../lib/prompdParser'
import {
  getApiBaseUrl,
  getBackendHost,
  onConnectionChange as onApiConnectionChange,
  checkBackendConnection as checkApiBackendConnection,
  checkRegistryConnection as checkApiRegistryConnection
} from './apiConfig'

export type ValidateResult = { ok: boolean; issues: ReturnType<typeof parsePrompd>['issues'] }
export type CompileResult = { ok: boolean; markdown: string; metadata?: unknown }
export type RunResult = { ok: boolean; response: unknown; usage?: unknown; metadata?: unknown }
export type PackageValidateResult = { ok: boolean; errors: string[]; warnings: string[]; cliValidated?: boolean }
export type PackageInstallResult = { ok: boolean; packageName: string; version: string; status: string }
export type ConnectionStatus = 'connected' | 'disconnected' | 'checking'
export type ConnectionInfo = { backend: ConnectionStatus; registry: ConnectionStatus }

// Re-export connection utilities from centralized apiConfig
export const checkBackendConnection = checkApiBackendConnection
export const checkRegistryConnection = checkApiRegistryConnection

// Adapter for legacy onConnectionChange interface
export function onConnectionChange(callback: (status: ConnectionInfo) => void): () => void {
  return onApiConnectionChange((state) => {
    callback({
      backend: state.backend === 'unknown' ? 'disconnected' : state.backend,
      registry: state.registry === 'unknown' ? 'disconnected' : state.registry
    })
  })
}

// Legacy stub - connection status is managed by apiConfig now
// These calls are no-ops but kept for compatibility during refactor
function updateConnectionStatus(_type: 'backend' | 'registry', _status: ConnectionStatus): void {
  // Connection status is now managed centrally in apiConfig.ts
  // This function is a no-op stub for backwards compatibility
}

export async function validate(content: string): Promise<ValidateResult> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/compilation/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    })
    
    const result = await response.json()
    
    if (result.success && result.data) {
      return { 
        ok: result.data.isValid, 
        issues: result.data.errors.map((err: any) => ({
          type: err.type || 'validation',
          message: err.message,
          severity: err.severity || 'error',
          line: err.line,
          column: err.column
        }))
      }
    }
  } catch (error) {
    console.warn('Validation API unavailable, using fallback:', error)
  }
  
  // Fallback to local validation
  const parsed = parsePrompd(content)
  return { ok: parsed.issues.every(i => i.severity !== 'error'), issues: parsed.issues }
}

export async function compile(content: string, format: string = 'markdown', params: Record<string, any> = {}): Promise<CompileResult> {
  try {
    updateConnectionStatus('backend', 'checking')
    
    // Try unauthenticated compilation first (simple preview)
    let response = await fetch(`${getApiBaseUrl()}/compilation/preview-public`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, format, parameters: params })
    })
    
    // If that fails, try a basic markdown conversion without backend
    if (!response.ok) {
      console.warn('Backend compilation unavailable, using client-side fallback')
      updateConnectionStatus('backend', 'disconnected')
      
      // Simple client-side markdown compilation with parameter substitution
      let markdown = content
      
      // Extract frontmatter if present
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
      if (frontmatterMatch) {
        markdown = frontmatterMatch[2] // Just the body content
      }
      
      // Basic parameter substitution for handlebars-style templates
      Object.entries(params).forEach(([key, value]) => {
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g')
        markdown = markdown.replace(regex, String(value))
      })
      
      return {
        ok: true,
        markdown: markdown.trim() || 'No content provided',
        metadata: { isValid: true, errors: [], warnings: ['Using client-side compilation'] }
      }
    }
    
    updateConnectionStatus('backend', 'connected')
    const result = await response.json()
    
    if (result.success && result.data) {
      return { 
        ok: result.data.isValid,
        markdown: result.data.output,
        metadata: {
          isValid: result.data.isValid,
          errors: result.data.errors,
          warnings: result.data.warnings
        }
      }
    } else {
      throw new Error(result.error || 'Compilation failed')
    }
  } catch (error) {
    console.error('Compilation failed:', error)
    updateConnectionStatus('backend', 'disconnected')
    
    // Return fallback client-side compilation
    let markdown = content
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
    if (frontmatterMatch) {
      markdown = frontmatterMatch[2]
    }
    
    // Basic parameter substitution for handlebars-style templates
    Object.entries(params).forEach(([key, value]) => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g')
      markdown = markdown.replace(regex, String(value))
    })
    
    return { 
      ok: true, 
      markdown: markdown.trim() || `Client-side compilation of content (backend unavailable)`,
      metadata: { isValid: true, errors: [], warnings: ['Backend compilation service unavailable'] }
    }
  }
}

export async function run(
  content: string, 
  params: Record<string, any> = {}, 
  provider: string | null = null, 
  model: string = 'auto',
  getToken?: () => Promise<string>
): Promise<RunResult> {
  let compileResult: CompileResult | null = null
  
  try {
    // First compile the content with parameters
    compileResult = await compile(content, 'markdown', params)
    if (!compileResult.ok) {
      throw new Error('Compilation failed before execution')
    }
    
    updateConnectionStatus('backend', 'checking')
    
    // Check if user is authenticated
    let headers: Record<string, string> = { 'Content-Type': 'application/json' }
    
    if (getToken) {
      try {
        const token = await getToken()
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }
      } catch (error) {
        console.warn('Failed to get auth token, falling back to public endpoint:', error)
      }
    }
    
    // Choose endpoint based on authentication
    const endpoint = headers['Authorization'] 
      ? `${getApiBaseUrl()}/compilation/execute`
      : `${getApiBaseUrl()}/compilation/execute-public`
    
    // Try authenticated execution endpoint first
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        prompt: compileResult.markdown, 
        provider, 
        model,
        parameters: params
      })
    })
    
    if (!response.ok) {
      // If authenticated call fails with 401/403, fall back to error message
      if (response.status === 401 || response.status === 403) {
        throw new Error('Authentication required. Please sign in to execute prompts with your configured API keys.')
      }
      
      updateConnectionStatus('backend', 'disconnected')
      const errorText = await response.text()
      throw new Error(`Backend execution service unavailable (HTTP ${response.status}): ${errorText}`)
    }
    
    updateConnectionStatus('backend', 'connected')
    const result = await response.json()
    
    if (result.success && result.data) {
      return { 
        ok: true, 
        response: result.data.response,
        usage: result.data.usage || {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cost: 0
        },
        metadata: {
          ...result.data.metadata,
          executionTime: result.data.metadata?.executionTime,
          provider: result.data.metadata?.providerDisplayName || result.data.metadata?.provider,
          model: result.data.metadata?.model
        }
      }
    } else {
      throw new Error(result.error || 'Execution failed')
    }
  } catch (error) {
    console.error('Execution failed:', error)
    updateConnectionStatus('backend', 'disconnected')
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    return { 
      ok: false, 
      response: `Execution failed: ${errorMessage}\n\n${
        errorMessage.includes('Authentication required') 
          ? 'Please sign in and configure your API keys in Settings to execute prompts.'
          : errorMessage.includes('No active provider') || errorMessage.includes('not configured')
            ? 'Please configure and activate a provider in Settings to execute prompts.'
            : `The compiled prompt was:\n\n${compileResult?.markdown || 'N/A'}`
      }`
    }
  }
}

/**
 * Validate package manifest and files using backend CLI
 */
export async function validatePackage(manifest: any, files: any[] = [], getToken?: () => Promise<string>): Promise<PackageValidateResult> {
  try {
    updateConnectionStatus('backend', 'checking')
    
    let headers: Record<string, string> = { 'Content-Type': 'application/json' }
    
    if (getToken) {
      try {
        const token = await getToken()
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }
      } catch (error) {
        console.warn('Failed to get auth token for package validation:', error)
      }
    }
    
    const response = await fetch(`${getApiBaseUrl()}/packages/validate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ manifest, files })
    })
    
    if (!response.ok) {
      updateConnectionStatus('backend', 'disconnected')
      throw new Error(`Package validation failed: HTTP ${response.status}`)
    }
    
    updateConnectionStatus('backend', 'connected')
    const result = await response.json()
    
    if (result.success && result.data) {
      return {
        ok: result.data.isValid,
        errors: result.data.errors || [],
        warnings: result.data.warnings || [],
        cliValidated: result.data.cliValidated
      }
    } else {
      throw new Error(result.error || 'Package validation failed')
    }
  } catch (error) {
    console.error('Package validation failed:', error)
    updateConnectionStatus('backend', 'disconnected')
    
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : 'Package validation service unavailable'],
      warnings: ['Backend package validation service unavailable - using basic validation only']
    }
  }
}

/**
 * Install package using backend CLI
 */
export async function installPackage(packageName: string, version: string = 'latest', projectId?: string, getToken?: () => Promise<string>): Promise<PackageInstallResult> {
  try {
    updateConnectionStatus('backend', 'checking')
    
    if (!getToken) {
      throw new Error('Authentication required to install packages')
    }
    
    const token = await getToken()
    if (!token) {
      throw new Error('Authentication token not available')
    }
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
    
    const response = await fetch(`${getApiBaseUrl()}/packages/install`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: packageName, version, projectId })
    })
    
    if (!response.ok) {
      updateConnectionStatus('backend', 'disconnected')
      
      if (response.status === 401 || response.status === 403) {
        throw new Error('Authentication required. Please sign in to install packages.')
      }
      
      const errorText = await response.text()
      throw new Error(`Package installation failed (HTTP ${response.status}): ${errorText}`)
    }
    
    updateConnectionStatus('backend', 'connected')
    const result = await response.json()
    
    if (result.success && result.data) {
      return {
        ok: true,
        packageName: result.data.packageName,
        version: result.data.version,
        status: result.data.status
      }
    } else {
      throw new Error(result.error || 'Package installation failed')
    }
  } catch (error) {
    console.error('Package installation failed:', error)
    updateConnectionStatus('backend', 'disconnected')
    
    return {
      ok: false,
      packageName,
      version,
      status: 'failed'
    }
  }
}

/**
 * Get installed packages for current user/project
 */
export async function getLocalPackages(projectId?: string, getToken?: () => Promise<string>): Promise<any[]> {
  try {
    if (!getToken) {
      return []
    }

    const token = await getToken()
    if (!token) {
      return []
    }

    const headers = {
      'Authorization': `Bearer ${token}`
    }

    const url = new URL(`${getApiBaseUrl()}/packages/local`, window.location.origin)
    if (projectId) {
      url.searchParams.set('projectId', projectId)
    }

    const response = await fetch(url.toString(), { headers })

    if (!response.ok) {
      throw new Error(`Failed to get local packages: HTTP ${response.status}`)
    }

    const result = await response.json()
    return result.success ? result.data : []
  } catch (error) {
    console.error('Failed to get local packages:', error)
    return []
  }
}

/**
 * Upload project to cloud database
 */
export async function uploadProject(
  projectName: string,
  files: { path: string; content: string }[],
  description?: string,
  getToken?: () => Promise<string | null>
): Promise<{ projectId: string; filesUploaded: number }> {
  try {
    if (!getToken) {
      throw new Error('Authentication required to upload projects')
    }

    const token = await getToken()
    if (!token) {
      throw new Error('Authentication token not available')
    }

    updateConnectionStatus('backend', 'checking')

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }

    // Step 1: Create project in database
    const createResponse = await fetch(`${getApiBaseUrl()}/projects`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: projectName,
        description: description || `Uploaded from local storage - ${new Date().toLocaleString()}`,
        settings: {
          autoSave: true,
          autoCompile: false
        },
        isPublic: false
      })
    })

    if (!createResponse.ok) {
      const errorText = await createResponse.text()
      throw new Error(`Failed to create project: ${errorText}`)
    }

    const createResult = await createResponse.json()
    const projectId = createResult.data._id || createResult.data.id

    if (!projectId) {
      throw new Error('Project created but no ID returned')
    }

    // Step 2: Upload all files
    let filesUploaded = 0
    for (const file of files) {
      try {
        // Detect file type from extension
        const ext = file.path.split('.').pop()?.toLowerCase()
        const typeMap: Record<string, string> = {
          'prmd': 'prmd',
          'pdflow': 'pdflow',
          'yaml': 'yaml',
          'yml': 'yaml',
          'json': 'json',
          'md': 'md',
          'txt': 'txt'
        }
        const fileType = typeMap[ext || ''] || 'other'

        const fileResponse = await fetch(`${getApiBaseUrl()}/projects/${projectId}/files`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            name: file.path.split('/').pop() || file.path,
            path: file.path,
            content: file.content,
            type: fileType
          })
        })

        if (fileResponse.ok) {
          filesUploaded++
        } else {
          console.warn(`Failed to upload file ${file.path}:`, await fileResponse.text())
        }
      } catch (fileError) {
        console.warn(`Error uploading file ${file.path}:`, fileError)
      }
    }

    updateConnectionStatus('backend', 'connected')

    return {
      projectId,
      filesUploaded
    }
  } catch (error) {
    console.error('Project upload failed:', error)
    updateConnectionStatus('backend', 'disconnected')
    throw error
  }
}

/**
 * Get user's cloud projects
 */
export async function getUserProjects(getToken?: () => Promise<string | null>): Promise<any[]> {
  try {
    if (!getToken) {
      return []
    }

    const token = await getToken()
    if (!token) {
      return []
    }

    const headers = {
      'Authorization': `Bearer ${token}`
    }

    const response = await fetch(`${getApiBaseUrl()}/projects`, { headers })

    if (!response.ok) {
      throw new Error(`Failed to get projects: HTTP ${response.status}`)
    }

    const result = await response.json()
    return result.success && result.data ? result.data : []
  } catch (error) {
    console.error('Failed to get user projects:', error)
    return []
  }
}

/**
 * Get user's project count and quota information
 */
export async function getProjectQuota(getToken?: () => Promise<string | null>): Promise<{ count: number; limit: number; remaining: number } | null> {
  try {
    if (!getToken) {
      return null
    }

    const token = await getToken()
    if (!token) {
      return null
    }

    const projects = await getUserProjects(getToken)
    const count = projects.length

    // Default limit for free users (matches backend default)
    const limit = 5

    return {
      count,
      limit,
      remaining: Math.max(0, limit - count)
    }
  } catch (error) {
    console.error('Failed to get project quota:', error)
    return null
  }
}

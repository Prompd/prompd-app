// Namespaces API client for organization and namespace management
import { prompdSettings } from './prompdSettings'

export interface NamespaceInfo {
  id: string
  name: string // "@prompd.io"
  displayName: string // Original casing
  description?: string
  organizationId?: string
  visibility: 'public' | 'private' | 'internal'
  verified: boolean
  packageCount: number
  downloadCount: number
  permission: 'read' | 'write' | 'admin' | 'owner'
  source: 'personal' | 'organization' | 'public'
  organizationName?: string
}

export interface OrganizationInfo {
  id: string
  name: string // "Prompd Inc"
  slug: string // "prompd-inc"
  description?: string
  plan: 'team' | 'enterprise'
  role: 'owner' | 'admin' | 'write' | 'read'
  namespaces: NamespaceInfo[]
}

class NamespacesApiClient {
  private baseUrl: string
  private getAuthToken?: () => Promise<string | null>
  private registryApiKey?: string

  constructor() {
    this.baseUrl = prompdSettings.getRegistryUrl()
    console.log('[NamespacesAPI] Initialized with registry URL:', this.baseUrl)

    // Subscribe to registry URL changes
    prompdSettings.onRegistryUrlChange((newUrl) => {
      this.baseUrl = newUrl
      console.log('[NamespacesAPI] Registry URL changed to:', newUrl)
    })
  }

  /**
   * Set the registry API key from config.yaml for authentication.
   * This key is used for namespace management operations.
   */
  setRegistryApiKey(apiKey: string | undefined): void {
    this.registryApiKey = apiKey
    if (apiKey) {
      console.log('[NamespacesAPI] Registry API key configured')
    }
  }

  /**
   * Set a token getter for user authentication (Clerk tokens).
   * Registry API key takes precedence over user tokens for namespace operations.
   */
  setAuthTokenGetter(tokenGetter: () => Promise<string | null>): void {
    this.getAuthToken = tokenGetter
  }

  private async authenticatedFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers as Record<string, string>
    }

    // Priority: Registry API key > User token
    // Registry API key is used for namespace management operations
    if (this.registryApiKey) {
      headers['Authorization'] = `Bearer ${this.registryApiKey}`
    } else if (this.getAuthToken) {
      try {
        const token = await this.getAuthToken()
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }
      } catch (error) {
        console.warn('Failed to get auth token:', error)
      }
    }

    const url = new URL(endpoint, this.baseUrl)
    return fetch(url.toString(), {
      ...options,
      headers
    })
  }

  // Get all namespaces accessible to the current user
  async getAccessibleNamespaces(): Promise<NamespaceInfo[]> {
    try {
      const response = await this.authenticatedFetch('/user/namespaces')
      
      if (!response.ok) {
        if (response.status === 401) {
          console.warn('Authentication required for namespaces')
          return []
        }
        throw new Error(`Failed to fetch namespaces: ${response.status}`)
      }

      const data = await response.json()
      // Backend returns array directly, not wrapped in object
      return Array.isArray(data) ? data : []
    } catch (error) {
      console.error('Failed to fetch accessible namespaces:', error)
      return []
    }
  }

  // Get user's organizations with their namespaces
  async getUserOrganizations(): Promise<OrganizationInfo[]> {
    try {
      const response = await this.authenticatedFetch('/user/organizations')
      
      if (!response.ok) {
        if (response.status === 401) {
          console.warn('Authentication required for organizations')
          return []
        }
        throw new Error(`Failed to fetch organizations: ${response.status}`)
      }

      const data = await response.json()
      // Backend returns array directly, not wrapped in object
      return Array.isArray(data) ? data : []
    } catch (error) {
      console.error('Failed to fetch user organizations:', error)
      return []
    }
  }

  // Create a new organization (this would typically redirect to Clerk)
  async createOrganization(organizationData: {
    name: string
    slug: string
    description?: string
  }): Promise<{ redirectUrl: string } | { organization: OrganizationInfo }> {
    try {
      const response = await this.authenticatedFetch('/organizations', {
        method: 'POST',
        body: JSON.stringify(organizationData)
      })

      if (!response.ok) {
        throw new Error(`Failed to create organization: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Failed to create organization:', error)
      throw error
    }
  }

  // Create a new namespace within an organization
  async createNamespace(namespaceData: {
    name: string // "@my-org"
    description?: string
    organizationId?: string // If omitted, creates personal namespace
    visibility?: 'public' | 'private' | 'internal'
  }): Promise<NamespaceInfo> {
    try {
      const response = await this.authenticatedFetch('/namespaces', {
        method: 'POST',
        body: JSON.stringify(namespaceData)
      })

      if (!response.ok) {
        throw new Error(`Failed to create namespace: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Failed to create namespace:', error)
      throw error
    }
  }

  // Get namespace suggestions for package naming
  async getNamespaceSuggestions(query: string): Promise<string[]> {
    try {
      const namespaces = await this.getAccessibleNamespaces()
      
      const suggestions = namespaces
        .filter(ns => 
          ns.permission === 'write' || 
          ns.permission === 'admin' || 
          ns.permission === 'owner'
        )
        .map(ns => ns.name)
        .filter(name => name.toLowerCase().includes(query.toLowerCase()))

      // Always include @public if query matches
      if ('@public'.includes(query.toLowerCase()) && !suggestions.includes('@public')) {
        suggestions.unshift('@public')
      }

      return suggestions
    } catch (error) {
      console.error('Failed to get namespace suggestions:', error)
      return ['@public'] // Fallback to public namespace
    }
  }

  // Check if a namespace name is available
  async checkNamespaceAvailability(name: string): Promise<{
    available: boolean
    reason?: string
    suggestions?: string[]
  }> {
    try {
      const response = await this.authenticatedFetch(`/namespaces/check-availability?name=${encodeURIComponent(name)}`)
      
      if (!response.ok) {
        throw new Error(`Failed to check namespace availability: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Failed to check namespace availability:', error)
      return { 
        available: false, 
        reason: 'Unable to verify availability',
        suggestions: []
      }
    }
  }
}

// Export singleton instance
export const namespacesApi = new NamespacesApiClient()

// Built-in namespace patterns
export const NAMESPACE_PATTERNS = {
  // Personal namespace pattern
  personal: (username: string) => `@${username}`,
  
  // Organization namespace pattern  
  organization: (orgSlug: string) => `@${orgSlug}`,
  
  // Public namespace (no prefix)
  public: (packageName: string) => packageName,
  
  // Validation regex
  validNamespace: /^@[a-z0-9]([a-z0-9\-]){1,214}$/,
  validPackageName: /^[a-z0-9]([a-z0-9\-]){0,214}$/
}
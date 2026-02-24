// Registry Discovery Service
// Implements /.well-known/registry.json discovery protocol
// Provides endpoint URL resolution for registry operations

import { configService } from './configService'
import { electronFetch } from './electronFetch'

// Types matching registry.json structure
export interface RegistryDiscoveryResponse {
  name: string
  version: string
  description: string
  capabilities: {
    formats: string[]
    features: string[]
    authentication: string[]
  }
  endpoints: RegistryEndpoints
  stats: {
    packages: number
    versions: number
    lastUpdated: string
  }
  config: {
    defaultDistTag: string
    maxPackageSize: string
    supportedFormats: Array<{
      type: string
      description: string
      extension: string
    }>
  }
}

export interface RegistryEndpoints {
  // Package operations
  packages: string
  package: string
  scopedPackage: string
  packageVersions: string
  scopedPackageVersions: string

  // Downloads
  download: string
  downloadLatest: string
  downloadWithVersion: string
  scopedDownload: string
  scopedDownloadLatest: string
  scopedDownloadWithVersion: string

  // Publishing
  publish: string
  scopedPublish: string
  unpublish: string

  // Authentication
  login: string
  userInfo: string
  tokens: string

  // Organization management
  organizations: string
  userOrganizations: string
  createOrganization: string
  organizationDetails: string
  organizationMembers: string

  // Namespace management
  namespaces: string
  userNamespaces: string
  createNamespace: string
  namespaceDetails: string

  // System endpoints
  health: string
  registryInfo: string

  // Search parameters
  searchParams: {
    search: string
    tags: string
    type: string
    scope: string
    author: string
    limit: string
    offset: string
  }
}

// Endpoint names that can be resolved
export type EndpointName = keyof Omit<RegistryEndpoints, 'searchParams'>

// Parameters for URL template substitution
export interface EndpointParams {
  package?: string
  scope?: string
  version?: string
  orgId?: string
  name?: string
}

interface DiscoveryCache {
  data: RegistryDiscoveryResponse
  timestamp: number
  registryUrl: string
}

class RegistryDiscoveryService {
  private cache: DiscoveryCache | null = null
  private pendingFetch: Promise<RegistryDiscoveryResponse> | null = null
  private readonly CACHE_TTL = 30 * 60 * 1000 // 30 minutes (discovery data changes rarely)
  private readonly FETCH_TIMEOUT = 10000 // 10 seconds

  // Default endpoints (fallback if discovery fails)
  private readonly DEFAULT_ENDPOINTS: RegistryEndpoints = {
    packages: '/packages',
    package: '/packages/{package}',
    scopedPackage: '/packages/@{scope}/{package}',
    packageVersions: '/packages/{package}/versions',
    scopedPackageVersions: '/packages/@{scope}/{package}/versions',
    download: '/packages/{package}/download/{version}',
    downloadLatest: '/packages/{package}/download',
    downloadWithVersion: '/packages/{package}@{version}',
    scopedDownload: '/packages/@{scope}/{package}/download/{version}',
    scopedDownloadLatest: '/packages/@{scope}/{package}/download',
    scopedDownloadWithVersion: '/packages/@{scope}/{package}@{version}',
    publish: '/packages/{package}',
    scopedPublish: '/packages/@{scope}/{package}',
    unpublish: '/packages/{package}',
    login: '/auth/login',
    userInfo: '/auth/me',
    tokens: '/auth/tokens',
    organizations: '/organizations',
    userOrganizations: '/user/organizations',
    createOrganization: '/organizations',
    organizationDetails: '/organizations/{orgId}',
    organizationMembers: '/organizations/{orgId}/members',
    namespaces: '/namespaces',
    userNamespaces: '/user/namespaces',
    createNamespace: '/namespaces',
    namespaceDetails: '/namespaces/{name}',
    health: '/health',
    registryInfo: '/.well-known/registry.json',
    searchParams: {
      search: 'search query text',
      tags: 'comma-separated tags',
      type: 'package type (package, node-template, workflow, skill)',
      scope: 'package scope',
      author: 'package author',
      limit: 'results per page (default: 20, max: 100)',
      offset: 'pagination offset (default: 0)'
    }
  }

  /**
   * Get the current registry URL from config
   */
  private async getRegistryUrl(): Promise<string> {
    // Try configService first (handles Electron IPC)
    const registryUrl = await configService.getRegistryUrl()
    if (registryUrl) {
      return registryUrl
    }

    // Fallback to environment/defaults
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_REGISTRY_URL) {
      return import.meta.env.VITE_REGISTRY_URL
    }

    return 'https://registry.prompdhub.ai'
  }

  /**
   * Fetch discovery data from registry
   */
  async discover(forceRefresh = false): Promise<RegistryDiscoveryResponse> {
    const registryUrl = await this.getRegistryUrl()

    // Check cache validity
    if (!forceRefresh && this.cache) {
      const cacheAge = Date.now() - this.cache.timestamp
      const sameRegistry = this.cache.registryUrl === registryUrl

      if (sameRegistry && cacheAge < this.CACHE_TTL) {
        return this.cache.data
      }
    }

    // Avoid duplicate fetches
    if (this.pendingFetch) {
      return this.pendingFetch
    }

    this.pendingFetch = this.fetchDiscovery(registryUrl)

    try {
      const data = await this.pendingFetch
      return data
    } finally {
      this.pendingFetch = null
    }
  }

  private async fetchDiscovery(registryUrl: string): Promise<RegistryDiscoveryResponse> {
    const discoveryUrl = `${registryUrl.replace(/\/$/, '')}/.well-known/registry.json`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.FETCH_TIMEOUT)

    try {
      console.log('[RegistryDiscovery] Fetching:', discoveryUrl)

      const response = await electronFetch(discoveryUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json'
        }
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`Discovery failed: ${response.status} ${response.statusText}`)
      }

      const data: RegistryDiscoveryResponse = await response.json()

      // Validate required fields
      if (!data.endpoints) {
        throw new Error('Invalid discovery response: missing endpoints')
      }

      // Cache successful response
      this.cache = {
        data,
        timestamp: Date.now(),
        registryUrl
      }

      console.log('[RegistryDiscovery] Cached discovery data from:', registryUrl)
      return data

    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof Error && error.name === 'AbortError') {
        console.warn('[RegistryDiscovery] Request timeout')
      } else {
        console.warn('[RegistryDiscovery] Fetch failed:', error)
      }

      // Return cached data if available (even if stale)
      if (this.cache) {
        console.log('[RegistryDiscovery] Using stale cache')
        return this.cache.data
      }

      // Return default response as last resort
      return this.createDefaultResponse(registryUrl)
    }
  }

  private createDefaultResponse(registryUrl: string): RegistryDiscoveryResponse {
    return {
      name: 'PrompdHub Registry',
      version: '1.0.0',
      description: 'Registry for AI Prompts (using defaults)',
      capabilities: {
        formats: ['pdpkg'],
        features: ['search', 'versioning', 'scoped-packages'],
        authentication: ['oauth', 'api-token']
      },
      endpoints: this.DEFAULT_ENDPOINTS,
      stats: {
        packages: 0,
        versions: 0,
        lastUpdated: new Date().toISOString()
      },
      config: {
        defaultDistTag: 'latest',
        maxPackageSize: '10MB',
        supportedFormats: [{
          type: 'pdpkg',
          description: 'ZIP archives containing .prmd files and prompd.json',
          extension: '.pdpkg'
        }]
      }
    }
  }

  /**
   * Get endpoint URL template by name
   */
  async getEndpointTemplate(endpointName: EndpointName): Promise<string> {
    const discovery = await this.discover()
    const template = discovery.endpoints[endpointName]

    if (!template) {
      // Fallback to default
      const defaultTemplate = this.DEFAULT_ENDPOINTS[endpointName]
      if (defaultTemplate && typeof defaultTemplate === 'string') {
        return defaultTemplate
      }
      throw new Error(`Unknown endpoint: ${endpointName}`)
    }

    return template as string
  }

  /**
   * Resolve endpoint URL with parameters
   * @param endpointName - Name of the endpoint from discovery
   * @param params - Parameters to substitute into the URL template
   * @returns Full URL with base and substituted parameters
   */
  async getEndpointUrl(endpointName: EndpointName, params?: EndpointParams): Promise<string> {
    const registryUrl = await this.getRegistryUrl()
    const template = await this.getEndpointTemplate(endpointName)

    let url = template

    // Substitute parameters
    if (params) {
      if (params.package) {
        url = url.replace('{package}', encodeURIComponent(params.package))
      }
      if (params.scope) {
        url = url.replace('{scope}', encodeURIComponent(params.scope))
      }
      if (params.version) {
        url = url.replace('{version}', encodeURIComponent(params.version))
      }
      if (params.orgId) {
        url = url.replace('{orgId}', encodeURIComponent(params.orgId))
      }
      if (params.name) {
        url = url.replace('{name}', encodeURIComponent(params.name))
      }
    }

    // Combine with base URL
    const baseUrl = registryUrl.replace(/\/$/, '')
    return `${baseUrl}${url}`
  }

  /**
   * Parse a package reference into scope and name
   * @param packageRef - Package reference like "@scope/package" or "package"
   */
  parsePackageRef(packageRef: string): { scope?: string; name: string } {
    if (packageRef.startsWith('@')) {
      const parts = packageRef.slice(1).split('/')
      if (parts.length >= 2) {
        return {
          scope: parts[0],
          name: parts.slice(1).join('/')
        }
      }
    }
    return { name: packageRef }
  }

  /**
   * Get download URL for a package
   * Automatically handles scoped vs unscoped packages
   */
  async getDownloadUrl(packageRef: string, version?: string): Promise<string> {
    const { scope, name } = this.parsePackageRef(packageRef)

    if (scope) {
      // Scoped package
      if (version) {
        return this.getEndpointUrl('scopedDownload', { scope, package: name, version })
      }
      return this.getEndpointUrl('scopedDownloadLatest', { scope, package: name })
    }

    // Unscoped package
    if (version) {
      return this.getEndpointUrl('download', { package: name, version })
    }
    return this.getEndpointUrl('downloadLatest', { package: name })
  }

  /**
   * Get package info URL
   */
  async getPackageUrl(packageRef: string): Promise<string> {
    const { scope, name } = this.parsePackageRef(packageRef)

    if (scope) {
      return this.getEndpointUrl('scopedPackage', { scope, package: name })
    }
    return this.getEndpointUrl('package', { package: name })
  }

  /**
   * Get package versions URL
   */
  async getVersionsUrl(packageRef: string): Promise<string> {
    const { scope, name } = this.parsePackageRef(packageRef)

    if (scope) {
      return this.getEndpointUrl('scopedPackageVersions', { scope, package: name })
    }
    return this.getEndpointUrl('packageVersions', { package: name })
  }

  /**
   * Get registry capabilities
   */
  async getCapabilities(): Promise<RegistryDiscoveryResponse['capabilities']> {
    const discovery = await this.discover()
    return discovery.capabilities
  }

  /**
   * Get registry stats
   */
  async getStats(): Promise<RegistryDiscoveryResponse['stats']> {
    const discovery = await this.discover()
    return discovery.stats
  }

  /**
   * Get registry config
   */
  async getConfig(): Promise<RegistryDiscoveryResponse['config']> {
    const discovery = await this.discover()
    return discovery.config
  }

  /**
   * Check if registry supports a specific feature
   */
  async hasFeature(feature: string): Promise<boolean> {
    const capabilities = await this.getCapabilities()
    return capabilities.features.includes(feature)
  }

  /**
   * Check if registry supports a specific format
   */
  async supportsFormat(format: string): Promise<boolean> {
    const capabilities = await this.getCapabilities()
    return capabilities.formats.includes(format)
  }

  /**
   * Clear the discovery cache
   */
  clearCache(): void {
    this.cache = null
    console.log('[RegistryDiscovery] Cache cleared')
  }

  /**
   * Get cache status for debugging
   */
  getCacheStatus(): { cached: boolean; age?: number; registryUrl?: string } {
    if (!this.cache) {
      return { cached: false }
    }

    return {
      cached: true,
      age: Date.now() - this.cache.timestamp,
      registryUrl: this.cache.registryUrl
    }
  }
}

// Export singleton instance
export const registryDiscovery = new RegistryDiscoveryService()

// Export class for testing
export { RegistryDiscoveryService }

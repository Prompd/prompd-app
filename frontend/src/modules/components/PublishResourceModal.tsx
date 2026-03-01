import { useState, useEffect, useCallback } from 'react'
import { X, Upload, AlertCircle, CheckCircle, Loader2, KeyRound, Globe, HardDrive } from 'lucide-react'
import { PackageService, type PackageManifest } from '../services/packageService'
import { configService } from '../services/configService'
import { RESOURCE_TYPE_LABELS, RESOURCE_TYPE_ICONS, RESOURCE_TYPE_COLORS, type ResourceType } from '../services/resourceTypes'
import VersionInput from './VersionInput'

interface RegistryOption {
  name: string
  url: string
  apiKey?: string
  isDefault?: boolean
}

interface Namespace {
  name: string
  displayName: string
  description?: string
  type: 'personal' | 'organization'
  canPublish: boolean
  frozen: boolean
}

export interface PublishResourceInfo {
  name: string
  version: string
  type: string
  scope: 'workspace' | 'user'
  path: string
  description?: string
  tools?: string[]
  mcps?: string[]
  main?: string
  isArchive?: boolean
}

interface PublishResourceModalProps {
  isOpen: boolean
  onClose: () => void
  resource: PublishResourceInfo | null
  manifest: Record<string, unknown> | null
  getToken: () => Promise<string | null>
  theme?: 'light' | 'dark'
  onOpenSettings?: () => void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getElectronAPI = (): any => (window as any).electronAPI

/**
 * Fetch from a registry URL, using Electron IPC to bypass CORS when available.
 */
async function registryFetch(url: string, headers: Record<string, string>): Promise<{ ok: boolean; status: number; body: string }> {
  const electronAPI = getElectronAPI()
  if (electronAPI?.apiRequest) {
    const result = await electronAPI.apiRequest(url, { method: 'GET', headers })
    return {
      ok: result.ok ?? false,
      status: result.status ?? 0,
      body: result.body ?? ''
    }
  }
  const response = await fetch(url, { headers })
  const body = await response.text()
  return { ok: response.ok, status: response.status, body }
}

export function PublishResourceModal({
  isOpen,
  onClose,
  resource,
  manifest,
  getToken,
  theme = 'dark',
  onOpenSettings,
}: PublishResourceModalProps) {
  // Registry state
  const [registries, setRegistries] = useState<RegistryOption[]>([])
  const [selectedRegistryName, setSelectedRegistryName] = useState('')
  const [namespaces, setNamespaces] = useState<Namespace[]>([])
  const [namespace, setNamespace] = useState('')
  const [isLoadingNamespaces, setIsLoadingNamespaces] = useState(false)
  const [customNs, setCustomNs] = useState('')
  const [registryApiKeyInput, setRegistryApiKeyInput] = useState('')
  const [needsRegistryLogin, setNeedsRegistryLogin] = useState(false)

  // Publish state
  const [publishStatus, setPublishStatus] = useState<'idle' | 'packaging' | 'uploading' | 'success' | 'error'>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [version, setVersion] = useState('1.0.0')
  const [packageName, setPackageName] = useState('')

  const colors = {
    bg: theme === 'dark' ? '#1e293b' : '#ffffff',
    bgSecondary: theme === 'dark' ? '#0f172a' : '#f8fafc',
    border: theme === 'dark' ? 'rgba(71, 85, 105, 0.3)' : '#e2e8f0',
    text: theme === 'dark' ? '#ffffff' : '#0f172a',
    textSecondary: theme === 'dark' ? '#94a3b8' : '#64748b',
    textMuted: theme === 'dark' ? '#64748b' : '#94a3b8',
    input: theme === 'dark' ? 'rgba(15, 23, 42, 0.6)' : '#f8fafc',
    hover: theme === 'dark' ? 'rgba(71, 85, 105, 0.3)' : 'rgba(148, 163, 184, 0.15)',
    primary: '#3b82f6',
    primaryHover: '#2563eb',
    success: '#10b981',
    error: theme === 'dark' ? '#7f1d1d' : '#fee2e2',
    errorBorder: theme === 'dark' ? '#dc2626' : '#ef4444',
    errorText: theme === 'dark' ? '#fca5a5' : '#dc2626',
  }

  const isArchive = resource?.isArchive || resource?.path?.endsWith('.pdpkg') || false

  // Get registry config for the currently selected registry
  const getSelectedRegistryConfig = useCallback((): { apiKey?: string; url?: string } | undefined => {
    const reg = registries.find(r => r.name === selectedRegistryName)
    if (!reg) return undefined
    return { apiKey: reg.apiKey, url: reg.url }
  }, [registries, selectedRegistryName])

  // Load namespaces for a specific registry
  const loadNamespacesForRegistry = useCallback(async (regConfig?: { apiKey?: string; url?: string }) => {
    setIsLoadingNamespaces(true)
    setNamespaces([])
    setCustomNs('')
    setError('')
    setNeedsRegistryLogin(false)

    try {
      const registryUrl = regConfig?.url || 'https://registry.prompdhub.ai'
      const namespacesUrl = new URL('/user/namespaces', registryUrl).toString()

      let authToken: string | null = regConfig?.apiKey || null
      if (!authToken) {
        authToken = await getToken()
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`

      const response = await registryFetch(namespacesUrl, headers)

      if (response.ok) {
        const data = JSON.parse(response.body)
        const rawNamespaces = Array.isArray(data) ? data : []
        const publishable: Namespace[] = rawNamespaces
          .map((ns: Record<string, unknown>) => ({
            name: ns.name as string,
            displayName: (ns.displayName as string) || (ns.name as string),
            description: ns.description as string | undefined,
            type: (ns.type as 'personal' | 'organization') || 'personal',
            canPublish: (ns.canPublish as boolean) ?? true,
            frozen: (ns.frozen as boolean) ?? false
          }))
          .filter(n => n.canPublish)

        // Determine if the existing namespace from prompd.json name is in the user's publishable list.
        // Prefer manifest?.name (freshly read from disk) over resource?.name (from the last scan).
        const rawName = ((manifest?.name) as string | undefined) || resource?.name || ''
        const existingNs = rawName.includes('/')
          ? rawName.split('/')[0].replace('@', '')
          : ''
        const isExistingInList = existingNs ? publishable.some(n => n.name === existingNs) : false

        setNamespaces(publishable)
        setCustomNs(existingNs && !isExistingInList ? existingNs : '')

        if (existingNs && !isExistingInList) {
          // Namespace from prompd.json is not in the user's registry list — pre-select as custom
          setNamespace(prev =>
            (prev && (publishable.some(n => n.name === prev) || prev === existingNs)) ? prev : existingNs
          )
        } else if (publishable.length > 0) {
          setNamespace(prev => {
            if (prev && publishable.some(n => n.name === prev)) return prev
            if (existingNs && isExistingInList) return existingNs
            return publishable[0].name
          })
        }
      } else if (response.status === 401) {
        setNeedsRegistryLogin(true)
        setError('API key required to access this registry')
      } else {
        setError(`Failed to load namespaces (${response.status})`)
      }
    } catch (err) {
      const message = err instanceof TypeError && (err as TypeError).message.includes('fetch')
        ? 'Unable to connect to registry'
        : err instanceof Error ? err.message : 'Unknown error'
      setError(message)
    } finally {
      setIsLoadingNamespaces(false)
    }
  }, [getToken, resource?.name, manifest?.name])

  // Save API key for the selected registry and retry
  const saveRegistryApiKey = useCallback(async (apiKey: string) => {
    if (!selectedRegistryName || !apiKey.trim()) return

    try {
      const config = await configService.getConfig()
      config.registry = config.registry || { default: 'prompdhub', registries: {} }
      config.registry.registries = config.registry.registries || {}
      if (!config.registry.registries[selectedRegistryName]) {
        const reg = registries.find(r => r.name === selectedRegistryName)
        config.registry.registries[selectedRegistryName] = { url: reg?.url || '' }
      }
      config.registry.registries[selectedRegistryName].api_key = apiKey.trim()
      await configService.saveConfig(config)

      setRegistries(prev => prev.map(r =>
        r.name === selectedRegistryName ? { ...r, apiKey: apiKey.trim() } : r
      ))

      setRegistryApiKeyInput('')
      setNeedsRegistryLogin(false)
      const reg = registries.find(r => r.name === selectedRegistryName)
      loadNamespacesForRegistry({ apiKey: apiKey.trim(), url: reg?.url })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(`Failed to save API key: ${message}`)
    }
  }, [selectedRegistryName, registries, loadNamespacesForRegistry])

  // Initialize on open
  useEffect(() => {
    if (!isOpen) {
      setPublishStatus('idle')
      setProgress(0)
      setError('')
      setRegistries([])
      setSelectedRegistryName('')
      setNamespaces([])
      setNamespace('')
      setCustomNs('')
      setRegistryApiKeyInput('')
      setNeedsRegistryLogin(false)
      setVersion('1.0.0')
      setPackageName('')
      return
    }

    // Initialize version from manifest (normalize "1.0" → "1.0.0")
    const v = (manifest?.version as string) || resource?.version || '1.0.0'
    setVersion(v.split('.').length === 2 ? `${v}.0` : v)

    // Initialize package name from id or slugified name
    const rawId = (manifest?.id as string) || ''
    const rawName = (manifest?.name as string) || resource?.name || ''
    const deriveName = (n: string): string => n.includes('/') ? n.split('/').pop() || n : n
    const slug = (n: string): string => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 80) || 'resource'
    setPackageName(rawId ? deriveName(rawId) : slug(deriveName(rawName)))

    // Load registries from config
    configService.getConfig().then(config => {
      const regEntries = config.registry?.registries || {}
      const defaultRegName = config.registry?.default || ''
      const regList: RegistryOption[] = Object.entries(regEntries).map(([name, entry]) => ({
        name,
        url: entry.url,
        apiKey: entry.api_key,
        isDefault: name === defaultRegName
      }))

      if (regList.length > 0) {
        setRegistries(regList)
        const defaultReg = regList.find(r => r.isDefault) || regList[0]
        setSelectedRegistryName(defaultReg.name)
        loadNamespacesForRegistry({ apiKey: defaultReg.apiKey, url: defaultReg.url })
      } else {
        loadNamespacesForRegistry()
      }
    }).catch(() => {
      loadNamespacesForRegistry()
    })
  }, [isOpen, loadNamespacesForRegistry])

  // Reload namespaces when registry selection changes
  useEffect(() => {
    if (!isOpen || !selectedRegistryName) return
    const regConfig = getSelectedRegistryConfig()
    if (regConfig) {
      loadNamespacesForRegistry(regConfig)
    }
    // Only re-run when the selected registry changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRegistryName])

  // Reset error state when user changes form fields
  useEffect(() => {
    if (publishStatus === 'error') {
      setPublishStatus('idle')
      setError('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, packageName, namespace])

  // Derive display values from resource/manifest
  const resourceName = (manifest?.name as string) || resource?.name || ''
  const resourceType = (manifest?.type as string) || resource?.type || 'package'
  const resourceDescription = (manifest?.description as string) || resource?.description || ''

  const nsPrefix = namespace ? (namespace.startsWith('@') ? namespace : `@${namespace}`) : ''
  const fullPublishName = nsPrefix && packageName ? `${nsPrefix}/${packageName}` : packageName

  const TypeIcon = RESOURCE_TYPE_ICONS[resourceType as ResourceType] || RESOURCE_TYPE_ICONS['package']
  const typeLabel = RESOURCE_TYPE_LABELS[resourceType as ResourceType] || resourceType
  const typeColor = RESOURCE_TYPE_COLORS[resourceType as ResourceType] || RESOURCE_TYPE_COLORS['package']

  const handlePublish = async () => {
    if (!resource) return

    setError('')
    setProgress(0)

    const regConfig = getSelectedRegistryConfig()
    const packageService = new PackageService()

    // Build the manifest with namespace-prefixed name
    const publishManifest: PackageManifest = {
      name: fullPublishName,
      version: version,
      description: resourceDescription,
      type: resourceType as PackageManifest['type'],
      ...(manifest as Partial<PackageManifest>),
    }
    // Ensure the name and version are correct after spread
    publishManifest.name = fullPublishName
    publishManifest.version = version

    try {
      if (isArchive) {
        // Direct publish of .pdpkg archive
        setPublishStatus('uploading')
        await packageService.publish(
          resource.path,
          publishManifest,
          getToken,
          setProgress,
          regConfig
        )
      } else {
        // Directory: package first, then publish
        setPublishStatus('packaging')
        const electronAPI = getElectronAPI()
        if (!electronAPI?.package?.createLocal) {
          throw new Error('Electron IPC not available for packaging')
        }

        const createResult = await electronAPI.package.createLocal(resource.path)
        if (!createResult.success || !createResult.outputPath) {
          throw new Error(createResult.error || 'Package creation failed')
        }
        setProgress(50)

        // Publish the created .pdpkg
        setPublishStatus('uploading')
        await packageService.publish(
          createResult.outputPath,
          publishManifest,
          getToken,
          setProgress,
          regConfig
        )
      }

      setPublishStatus('success')
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Unknown error'
      // Try to extract a friendlier message from embedded JSON (e.g. "Publish failed: 409 - {"error":"Version 1.0.1 already exists"}")
      let message = raw
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0])
          if (parsed.error && typeof parsed.error === 'string') {
            message = parsed.error
          } else if (parsed.message && typeof parsed.message === 'string') {
            message = parsed.message
          }
        } catch {
          // JSON parse failed, keep original message
        }
      }
      setError(message)
      setPublishStatus('error')
    }
  }

  if (!isOpen) return null

  const canPublish = publishStatus === 'idle' && namespace && packageName && !isLoadingNamespaces && !needsRegistryLogin

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)',
      backdropFilter: 'blur(4px)',
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: colors.bg,
        borderRadius: 12,
        border: `1px solid ${colors.border}`,
        width: 480,
        maxHeight: '80vh',
        overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: `1px solid ${colors.border}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Upload size={18} style={{ color: colors.primary }} />
            <span style={{ fontSize: 15, fontWeight: 600, color: colors.text }}>Publish Resource</span>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: colors.textSecondary, padding: 4, borderRadius: 4,
            display: 'flex', alignItems: 'center',
          }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Resource info card */}
          <div style={{
            padding: 12,
            borderRadius: 8,
            background: colors.bgSecondary,
            border: `1px solid ${colors.border}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <TypeIcon size={16} style={{ color: typeColor }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: colors.text }}>{resourceName}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: resourceDescription ? 8 : 0 }}>
              <span style={{
                fontSize: 11, padding: '2px 6px', borderRadius: 4,
                background: `${typeColor}22`, color: typeColor, fontWeight: 500,
              }}>{typeLabel}</span>
              <span style={{
                fontSize: 11, padding: '2px 6px', borderRadius: 4,
                background: colors.hover, color: colors.textSecondary,
                display: 'flex', alignItems: 'center', gap: 3,
              }}>
                {resource?.scope === 'user' ? <Globe size={10} /> : <HardDrive size={10} />}
                {resource?.scope || 'user'}
              </span>
              {isArchive && (
                <span style={{
                  fontSize: 11, padding: '2px 6px', borderRadius: 4,
                  background: colors.hover, color: colors.textSecondary,
                }}>.pdpkg</span>
              )}
            </div>
            {resourceDescription && (
              <div style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 1.4 }}>
                {resourceDescription}
              </div>
            )}
          </div>

          {/* Version */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: colors.textSecondary, marginBottom: 4, display: 'block' }}>
              Version
            </label>
            <VersionInput
              value={version}
              onChange={setVersion}
              placeholder="1.0.0"
              compact={true}
              hideHelperText={true}
              colors={colors}
            />
          </div>

          {/* Package Name with namespace dropdown */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: colors.textSecondary, marginBottom: 4, display: 'block' }}>
              Package Name
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              {/* Namespace dropdown prefix */}
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <select
                  value={namespace}
                  onChange={(e) => setNamespace(e.target.value)}
                  disabled={isLoadingNamespaces || (namespaces.length === 0 && !customNs)}
                  style={{
                    padding: '8px 8px',
                    background: colors.input,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '6px 0 0 6px',
                    borderRight: 'none',
                    color: colors.text,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: (namespaces.length > 0 || !!customNs) ? 'pointer' : 'default',
                    minWidth: 80,
                    opacity: isLoadingNamespaces ? 0.6 : 1,
                    outline: 'none',
                  }}
                >
                  {isLoadingNamespaces ? (
                    <option value="">loading...</option>
                  ) : (namespaces.length === 0 && !customNs) ? (
                    <option value="">no namespaces</option>
                  ) : (
                    <>
                      {customNs && (
                        <option key={`custom-${customNs}`} value={customNs}>
                          @{customNs} (custom)
                        </option>
                      )}
                      {namespaces.map(ns => (
                        <option key={ns.name} value={ns.name}>
                          {ns.name.startsWith('@') ? ns.name : `@${ns.name}`}
                        </option>
                      ))}
                    </>
                  )}
                </select>
                <span style={{
                  color: colors.textSecondary,
                  fontSize: 13,
                  fontWeight: 500,
                  padding: '8px 4px 8px 2px',
                  background: colors.input,
                  borderTop: `1px solid ${colors.border}`,
                  borderBottom: `1px solid ${colors.border}`,
                }}>/</span>
              </div>
              <input
                value={packageName}
                onChange={(e) => setPackageName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="my-package"
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  background: colors.input,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '0 6px 6px 0',
                  color: colors.text,
                  fontSize: 13,
                  outline: 'none',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = colors.primary }}
                onBlur={(e) => { e.currentTarget.style.borderColor = colors.border }}
              />
            </div>
            {!isLoadingNamespaces && namespaces.length === 0 && !customNs && !needsRegistryLogin && (
              <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>
                No namespaces available.{' '}
                {onOpenSettings ? (
                  <button
                    onClick={() => { onOpenSettings(); onClose() }}
                    style={{
                      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                      color: colors.primary, fontSize: 11, textDecoration: 'underline',
                    }}
                  >
                    Go to Settings &gt; Registries to create one.
                  </button>
                ) : (
                  <span>Sign in or configure an API key.</span>
                )}
              </div>
            )}
          </div>

          {/* Registry selector */}
          {registries.length > 1 && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: colors.textSecondary, marginBottom: 4, display: 'block' }}>
                Registry
              </label>
              <select
                value={selectedRegistryName}
                onChange={(e) => setSelectedRegistryName(e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 6,
                  background: colors.input, border: `1px solid ${colors.border}`,
                  color: colors.text, fontSize: 13, cursor: 'pointer',
                  outline: 'none',
                }}
              >
                {registries.map(r => (
                  <option key={r.name} value={r.name}>
                    {r.name} ({r.url})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* API Key input (shown on 401) */}
          {needsRegistryLogin && (
            <div style={{
              padding: 12, borderRadius: 8,
              background: colors.bgSecondary, border: `1px solid ${colors.border}`,
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
                fontSize: 12, fontWeight: 500, color: colors.textSecondary,
              }}>
                <KeyRound size={14} />
                Registry API Key Required
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="password"
                  value={registryApiKeyInput}
                  onChange={(e) => setRegistryApiKeyInput(e.target.value)}
                  placeholder="Enter API key..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveRegistryApiKey(registryApiKeyInput)
                  }}
                  style={{
                    flex: 1, padding: '6px 10px', borderRadius: 6,
                    background: colors.input, border: `1px solid ${colors.border}`,
                    color: colors.text, fontSize: 12, outline: 'none',
                  }}
                />
                <button
                  onClick={() => saveRegistryApiKey(registryApiKeyInput)}
                  disabled={!registryApiKeyInput.trim()}
                  style={{
                    padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                    background: colors.primary, color: '#fff', border: 'none',
                    cursor: registryApiKeyInput.trim() ? 'pointer' : 'not-allowed',
                    opacity: registryApiKeyInput.trim() ? 1 : 0.5,
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {/* Error message */}
          {error && publishStatus !== 'error' && !needsRegistryLogin && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', borderRadius: 6,
              background: colors.error, border: `1px solid ${colors.errorBorder}`,
              fontSize: 12, color: colors.errorText,
            }}>
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {/* Publish status */}
          {publishStatus === 'packaging' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', fontSize: 12, color: colors.textSecondary,
            }}>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              Creating package...
            </div>
          )}

          {publishStatus === 'uploading' && (
            <div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 12, color: colors.textSecondary, marginBottom: 6,
              }}>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                Publishing to registry...
              </div>
              <div style={{
                height: 4, borderRadius: 2, background: colors.bgSecondary, overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', borderRadius: 2, background: colors.primary,
                  width: `${progress}%`, transition: 'width 0.3s ease',
                }} />
              </div>
            </div>
          )}

          {publishStatus === 'success' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 12px', borderRadius: 6,
              background: theme === 'dark' ? '#064e3b' : '#ecfdf5',
              border: `1px solid ${colors.success}`,
              fontSize: 13, fontWeight: 500, color: colors.success,
            }}>
              <CheckCircle size={16} />
              Published {fullPublishName}@{version}
            </div>
          )}

          {publishStatus === 'error' && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: '10px 12px', borderRadius: 6,
              background: colors.error, border: `1px solid ${colors.errorBorder}`,
              fontSize: 12, color: colors.errorText,
            }}>
              <AlertCircle size={14} style={{ marginTop: 1, flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          padding: '12px 20px',
          borderTop: `1px solid ${colors.border}`,
        }}>
          <button onClick={onClose} style={{
            padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 500,
            background: 'transparent', border: `1px solid ${colors.border}`,
            color: colors.textSecondary, cursor: 'pointer',
          }}>
            {publishStatus === 'success' ? 'Close' : 'Cancel'}
          </button>
          {publishStatus !== 'success' && (
            <button
              onClick={handlePublish}
              disabled={!canPublish}
              style={{
                padding: '8px 20px', borderRadius: 6, fontSize: 13, fontWeight: 500,
                background: canPublish ? colors.primary : colors.bgSecondary,
                color: canPublish ? '#fff' : colors.textMuted,
                border: canPublish ? 'none' : `1px solid ${colors.border}`,
                cursor: canPublish ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <Upload size={14} />
              Publish
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

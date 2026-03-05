import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Package, Check, AlertTriangle, Save, AlertCircle, Globe, X, Plus, KeyRound } from 'lucide-react'
import { PackageService, type PackageManifest, type Namespace } from '../services/packageService'
import { parsePrompd, type Issue } from '../lib/prompdParser'
import { configService } from '../services/configService'
import VersionInput from './VersionInput'
import VersionSegmentInput from './VersionSegmentInput'

interface RegistryOption {
  name: string
  url: string
  apiKey?: string
  isDefault?: boolean
}

interface PublishModalProps {
  isOpen: boolean
  onClose: () => void
  workspaceHandle: FileSystemDirectoryHandle | null
  workspaceFiles: Array<{ path: string; name: string; type?: 'file' | 'directory'; kind?: 'file' | 'folder' }>
  getToken: () => Promise<string | null>
  theme: 'light' | 'dark'
  initialManifest?: PackageManifest & { files?: string[], main?: string }
  onFilesSaved?: () => void | Promise<void>
  localOnly?: boolean  // If true, skip namespace selection and hide publish button
}

interface ValidationError {
  filePath: string
  missingDependency: string
}

interface SyntaxError {
  filePath: string
  issues: Issue[]
}

// Patterns that are ALWAYS ignored when packaging (never included in packages)
const ALWAYS_IGNORED_PATTERNS = [
  '.prompd/**',   // Package cache directory
  'dist/**',      // Build output directory
  'node_modules/**',
  '.git/**',
  '.env',
  '.env.*',
]

// File extensions that can be included in packages
const PACKAGABLE_EXTENSIONS = [
  '.prmd',        // Prompt files
  '.md',          // Documentation
  '.txt',         // Text files
  '.json',        // Config/data (except prompd.json which is handled separately)
  '.yaml',        // Config files
  '.yml',         // Config files
]

// Helper function to parse dependencies from a .prmd file's content
const getDependencies = (content: string): string[] => {
  const fileReferences: string[] = []
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (!frontmatterMatch) return []

  const frontmatter = frontmatterMatch[1]

  // Regex to find file paths in inherits, system, user, context, etc.
  const pathRegex = /^(?:inherits|system|user|context|task|output|response):\s*["']?((?:\.\.|\.)\/[^"']+?)["']?\s*$/gm
  let match
  while ((match = pathRegex.exec(frontmatter)) !== null) {
    fileReferences.push(match[1])
  }

  // Regex for array syntax
  const arrayRegex = /^(?:system|user|context|task|output|response):\s*\n((?:\s+-\s*["'][^"']+["']\s*\n?)+)/gm
  while ((match = arrayRegex.exec(frontmatter)) !== null) {
    const items = match[1].matchAll(/["']([^"']+)["']/g)
    for (const item of items) {
      // Only include local relative paths
      if (item[1].startsWith('./') || item[1].startsWith('../')) {
        fileReferences.push(item[1])
      }
    }
  }

  return fileReferences
}

/**
 * Fetch from a registry URL, using Electron IPC to bypass CORS when available.
 * Falls back to direct fetch for non-Electron environments.
 */
async function registryFetch(url: string, headers: Record<string, string>): Promise<{ ok: boolean; status: number; body: string }> {
  // Use Electron IPC to bypass CORS when available
  const apiRequest = (window as any).electronAPI?.apiRequest
  if (apiRequest) {
    const result = await apiRequest(url, { method: 'GET', headers })
    return {
      ok: result.ok ?? false,
      status: result.status ?? 0,
      body: result.body ?? ''
    }
  }
  // Fallback: direct fetch (works for same-origin / CORS-enabled registries)
  const response = await fetch(url, { headers })
  const body = await response.text()
  return { ok: response.ok, status: response.status, body }
}

export function PublishModal({
  isOpen,
  onClose,
  workspaceHandle,
  workspaceFiles,
  getToken,
  theme,
  initialManifest,
  onFilesSaved,
  localOnly = false
}: PublishModalProps) {
  const [step, setStep] = useState(1)
  const [namespace, setNamespace] = useState('')
  const [namespaces, setNamespaces] = useState<Namespace[]>([])
  const [manifest, setManifest] = useState<PackageManifest>({
    name: '',
    version: '0.1.0',
    description: '',
    author: '',
    license: 'MIT',
    keywords: [],
    repository: '',
    ignore: [],
  })
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [originalManifestFiles, setOriginalManifestFiles] = useState<string[]>([]) // Track files from loaded manifest
  const [mainFile, setMainFile] = useState<string>('')
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])
  const [syntaxErrors, setSyntaxErrors] = useState<SyntaxError[]>([])
  const [fileContents, setFileContents] = useState<Map<string, string>>(new Map())
  const [isLoadingManifest, setIsLoadingManifest] = useState(false)

  const [progress, setProgress] = useState(0)
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState('')
  const [logs, setLogs] = useState<string[]>([])
  const [publishStatus, setPublishStatus] = useState<'idle' | 'creating' | 'uploading' | 'success' | 'error'>('idle')
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [latestRegistryVersion, setLatestRegistryVersion] = useState<string | null>(null)

  // Registry selection state
  const [registries, setRegistries] = useState<RegistryOption[]>([])
  const [selectedRegistryName, setSelectedRegistryName] = useState<string>('')
  const [isLoadingNamespaces, setIsLoadingNamespaces] = useState(false)
  // Tracks a namespace extracted from prompd.json that isn't in the user's registry list
  const [customNs, setCustomNs] = useState('')
  // Ref holds the namespace value pre-populated from the manifest so loadNamespacesForRegistry can compare
  const presetNsRef = useRef('')
  const [updateWorkspaceManifest, setUpdateWorkspaceManifest] = useState(true)
  const [tagInput, setTagInput] = useState('')
  const [packageType, setPackageType] = useState<'package' | 'workflow' | 'node-template' | 'skill'>(
    (initialManifest?.type as 'package' | 'workflow' | 'node-template' | 'skill') || 'package'
  )
  const [packageTools, setPackageTools] = useState<string[]>(initialManifest?.tools || [])
  const [toolInput, setToolInput] = useState('')
  const [registryApiKeyInput, setRegistryApiKeyInput] = useState('')
  const [needsRegistryLogin, setNeedsRegistryLogin] = useState(false)

  const packageService = new PackageService()

  // Theme colors
  const colors = {
    bg: theme === 'dark' ? '#1e293b' : '#ffffff',
    bgSecondary: theme === 'dark' ? '#0f172a' : '#f8fafc',
    bgTertiary: theme === 'dark' ? '#334155' : '#e2e8f0',
    border: theme === 'dark' ? 'rgba(71, 85, 105, 0.3)' : '#e2e8f0',
    text: theme === 'dark' ? '#ffffff' : '#0f172a',
    textSecondary: theme === 'dark' ? '#94a3b8' : '#64748b',
    textMuted: theme === 'dark' ? '#64748b' : '#94a3b8',
    input: theme === 'dark' ? 'rgba(15, 23, 42, 0.6)' : '#f8fafc',
    hover: theme === 'dark' ? 'rgba(71, 85, 105, 0.3)' : 'rgba(148, 163, 184, 0.15)',
    primary: '#3b82f6',
    primaryHover: '#2563eb',
    success: '#10b981',
    successHover: '#059669',
    error: theme === 'dark' ? '#7f1d1d' : '#fee2e2',
    errorBorder: theme === 'dark' ? '#dc2626' : '#ef4444',
    errorText: theme === 'dark' ? '#fca5a5' : '#dc2626',
    warning: theme === 'dark' ? '#a16207' : '#fefce8',
    warningBorder: theme === 'dark' ? '#facc15' : '#eab308',
    warningText: theme === 'dark' ? '#fde047' : '#a16207'
  }

  const log = (message: string) => {
    console.log(message)
    setLogs(prev => [...prev, `${new Date().toISOString().split('T')[1].substring(0, 8)} ${message}`])
  }

  // Get registry config for the currently selected registry
  const getSelectedRegistryConfig = useCallback((): { apiKey?: string; url?: string } | undefined => {
    const reg = registries.find(r => r.name === selectedRegistryName)
    if (!reg) return undefined
    return { apiKey: reg.apiKey, url: reg.url }
  }, [registries, selectedRegistryName])

  // Load namespaces for a specific registry (direct fetch for 401 detection)
  const loadNamespacesForRegistry = useCallback(async (regConfig?: { apiKey?: string; url?: string }) => {
    setIsLoadingNamespaces(true)
    setNamespaces([])
    setError('')
    setNeedsRegistryLogin(false)

    try {
      const registryUrl = regConfig?.url || 'https://registry.prompdhub.ai'
      const namespacesUrl = new URL('/user/namespaces', registryUrl).toString()

      // Priority: Registry API key > Clerk token
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

        setNamespaces(publishable)
        log(`Loaded ${publishable.length} namespaces`)

        // Determine if the namespace pre-populated from the manifest is in the list
        const presetNs = presetNsRef.current
        const isPresetInList = presetNs ? publishable.some(n => n.name === presetNs) : false
        setCustomNs(presetNs && !isPresetInList ? presetNs : '')

        setNamespace(prev => {
          if (prev && publishable.some(n => n.name === prev)) return prev
          // Preset from manifest is not in the registry list — keep it anyway
          if (prev && prev === presetNs && !isPresetInList) return prev
          if (!prev && presetNs && !isPresetInList) return presetNs
          return publishable.length > 0 ? publishable[0].name : prev
        })
      } else if (response.status === 401) {
        log('Authentication required for this registry')
        setNeedsRegistryLogin(true)
        setError('API key required to access this registry')
      } else {
        log(`Failed to load namespaces: ${response.status}`)
        setError(`Failed to load namespaces (${response.status})`)
      }
    } catch (err) {
      const message = err instanceof TypeError && (err as TypeError).message.includes('fetch')
        ? 'Unable to connect to registry'
        : err instanceof Error ? err.message : 'Unknown error'
      log(`Failed to load namespaces: ${message}`)
      setError(message)
    } finally {
      setIsLoadingNamespaces(false)
    }
  }, [getToken])

  // Save an API key for the selected registry and retry namespace loading
  const saveRegistryApiKey = useCallback(async (apiKey: string) => {
    if (!selectedRegistryName || !apiKey.trim()) return

    try {
      // Save to config.yaml
      const config = await configService.getConfig()
      config.registry = config.registry || { default: 'prompdhub', registries: {} }
      config.registry.registries = config.registry.registries || {}
      if (!config.registry.registries[selectedRegistryName]) {
        const reg = registries.find(r => r.name === selectedRegistryName)
        config.registry.registries[selectedRegistryName] = { url: reg?.url || '' }
      }
      config.registry.registries[selectedRegistryName].api_key = apiKey.trim()
      await configService.saveConfig(config)
      log(`API key saved for ${selectedRegistryName}`)

      // Update local registries state with the new key
      setRegistries(prev => prev.map(r =>
        r.name === selectedRegistryName ? { ...r, apiKey: apiKey.trim() } : r
      ))

      // Clear input and retry namespace loading
      setRegistryApiKeyInput('')
      setNeedsRegistryLogin(false)
      const reg = registries.find(r => r.name === selectedRegistryName)
      loadNamespacesForRegistry({ apiKey: apiKey.trim(), url: reg?.url })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log(`Failed to save API key: ${message}`)
      setError(`Failed to save API key: ${message}`)
    }
  }, [selectedRegistryName, registries, loadNamespacesForRegistry])

  // Helper function to populate state from manifest
  const populateFromManifest = (parsedManifest: PackageManifest & { files?: string[], main?: string }) => {
    log('Populating from manifest...')

    // Extract namespace from package name (e.g., "@namespace/package-name")
    if (parsedManifest.name && parsedManifest.name.includes('/')) {
      const extractedNamespace = parsedManifest.name.split('/')[0]
      setNamespace(extractedNamespace)
      presetNsRef.current = extractedNamespace
      log(`Pre-selected namespace: ${extractedNamespace}`)
    }

    // Pre-fill manifest details
    setManifest(prev => ({
      ...prev,
      name: parsedManifest.name?.split('/')[1] || parsedManifest.name || '', // remove namespace
      version: parsedManifest.version || '0.1.0',
      description: parsedManifest.description || '',
      author: parsedManifest.author || '',
      license: parsedManifest.license || 'MIT',
      keywords: parsedManifest.keywords || [],
      readme: parsedManifest.readme || '',
      repository: parsedManifest.repository || '',
      ignore: parsedManifest.ignore || [],
    }))

    // Pre-fill package type
    if (parsedManifest.type) {
      setPackageType(parsedManifest.type)
      log(`Pre-selected type: ${parsedManifest.type}`)
    }

    // Pre-fill tools (skill type)
    if (Array.isArray(parsedManifest.tools) && parsedManifest.tools.length > 0) {
      setPackageTools(parsedManifest.tools)
      log(`Pre-selected ${parsedManifest.tools.length} tools from manifest.`)
    }

    // Pre-select files (filter out prompd.json/manifest.json if it was incorrectly included)
    if (Array.isArray(parsedManifest.files) && parsedManifest.files.length > 0) {
      const filteredFiles = parsedManifest.files.filter(f =>
        f !== 'prompd.json' && !f.endsWith('/prompd.json') &&
        f !== 'manifest.json' && !f.endsWith('/manifest.json')
      )
      setSelectedFiles(filteredFiles)
      setOriginalManifestFiles(filteredFiles) // Track original files from manifest
      log(`Pre-selected ${filteredFiles.length} files from manifest.`)
    } else {
      // If files array is empty or not present, we'll auto-select packagable files later
      // via the useEffect that watches selectableFiles
      log('No files in manifest - will auto-select packagable files.')
    }

    // Pre-select main file
    if (parsedManifest.main) {
      setMainFile(parsedManifest.main)
      log(`Pre-selected main file: ${parsedManifest.main}`)
    }

    // Auto-advance to step 3 if all required fields are present
    // Note: We check for files.length > 0 OR we'll auto-select files later
    const hasFiles = Array.isArray(parsedManifest.files) && parsedManifest.files.length > 0
    const willAutoSelectFiles = !hasFiles // Files will be auto-selected if not specified

    if (parsedManifest.name && parsedManifest.version && parsedManifest.description &&
        parsedManifest.description.length >= 10 && (hasFiles || willAutoSelectFiles) && parsedManifest.main) {
      log('✅ Manifest complete - advancing to step 3')
      setStep(3)
    }
  }

  // Load namespaces and check for prompd.json when modal opens
  useEffect(() => {
    if (!isOpen) {
      // Reset state when closing - always start at step 2 (file selection)
      setStep(2)
      setNamespace('')
      setError('')
      setLogs([])
      setProgress(0)
      setPublishStatus('idle')
      setSelectedFiles([])
      setOriginalManifestFiles([])
      setMainFile('')
      setFileContents(new Map())
      setValidationErrors([])
      setSyntaxErrors([])
      setLatestRegistryVersion(null)
      setRegistries([])
      setSelectedRegistryName('')
      setIsLoadingNamespaces(false)
      setUpdateWorkspaceManifest(true)
      setTagInput('')
      setRegistryApiKeyInput('')
      setNeedsRegistryLogin(false)
      setCustomNs('')
      presetNsRef.current = ''
      return
    }

    // Always start at step 2 (file selection)
    setStep(2)

    if (localOnly) {
      log('Local-only mode: skipping namespace/registry loading')
    } else {
      // Load configured registries, then load namespaces from the default one
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
          log(`Loaded ${regList.length} registries, default: ${defaultReg.name}`)

          // Load namespaces from the default registry
          const regConfig = { apiKey: defaultReg.apiKey, url: defaultReg.url }
          loadNamespacesForRegistry(regConfig)
        } else {
          // No registries configured — fall back to default namespace loading
          log('No registries configured, using default')
          loadNamespacesForRegistry()
        }
      }).catch(err => {
        const message = err instanceof Error ? err.message : 'Unknown error'
        log(`Failed to load registries: ${message}`)
        // Fall back to default namespace loading
        loadNamespacesForRegistry()
      })
    }

    // Priority 1: Use initialManifest prop if provided
    if (initialManifest) {
      log('Using provided initialManifest prop')
      populateFromManifest(initialManifest)
      return
    }

    // Priority 2: Load prompd.json from workspace (or legacy manifest.json)
    const loadManifest = async () => {
      if (!workspaceHandle) {
        return
      }
      try {
        setIsLoadingManifest(true)
        log('Checking for prompd.json...')

        let content: string | null = null

        // Check if this is an Electron pseudo-handle
        const electronPath = (workspaceHandle as any)?._electronPath
        if (electronPath && (window as any).electronAPI?.readFile) {
          // Electron mode - use IPC to read the file (try prompd.json first, then manifest.json)
          const prompdPath = `${electronPath}/prompd.json`.replace(/\\/g, '/')
          log(`Reading manifest from Electron path: ${prompdPath}`)
          let result = await (window as any).electronAPI.readFile(prompdPath)
          if (!result.success) {
            // Try legacy manifest.json
            const manifestPath = `${electronPath}/manifest.json`.replace(/\\/g, '/')
            result = await (window as any).electronAPI.readFile(manifestPath)
          }
          if (result.success && result.content) {
            content = result.content
          } else if (result.error?.includes('ENOENT') || result.error?.includes('no such file')) {
            log('No prompd.json found in root, starting fresh.')
            return
          } else {
            log(`Could not read prompd.json: ${result.error || 'Unknown error'}`)
            return
          }
        } else if (typeof workspaceHandle.getFileHandle === 'function') {
          // File System Access API mode (try prompd.json first, then manifest.json)
          try {
            const manifestHandle = await workspaceHandle.getFileHandle('prompd.json', { create: false })
            const file = await manifestHandle.getFile()
            content = await file.text()
          } catch {
            // Try legacy manifest.json
            const manifestHandle = await workspaceHandle.getFileHandle('manifest.json', { create: false })
            const file = await manifestHandle.getFile()
            content = await file.text()
          }
        } else {
          log('No supported file access method available')
          return
        }

        if (content) {
          const parsedManifest = JSON.parse(content) as PackageManifest & { files?: string[], main?: string }
          log('Found and parsed prompd.json')
          populateFromManifest(parsedManifest)
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'NotFoundError') {
          log('No prompd.json found in root, starting fresh.')
        } else {
          log(`Could not load or parse prompd.json: ${err instanceof Error ? err.message : 'Unknown error'}`)
        }
      } finally {
        setIsLoadingManifest(false)
      }
    }

    loadManifest()
  }, [isOpen, workspaceHandle, getToken, initialManifest])

  // Fetch latest version from the selected registry when namespace and package name are available
  useEffect(() => {
    if (!isOpen || localOnly || !namespace || !manifest.name) {
      setLatestRegistryVersion(null)
      return
    }

    const fetchLatestVersion = async () => {
      try {
        const cleanNamespace = namespace.replace(/^@/, '')
        const fullPackageName = `@${cleanNamespace}/${manifest.name}`
        log(`Fetching latest version for ${fullPackageName}...`)

        // Use the selected registry's URL and API key
        const reg = registries.find(r => r.name === selectedRegistryName)
        const registryUrl = reg?.url || 'https://registry.prompdhub.ai'
        const versionsUrl = new URL(`/packages/@${cleanNamespace}/${manifest.name}/versions`, registryUrl).toString()

        let authToken: string | null = reg?.apiKey || null
        if (!authToken) {
          authToken = await getToken()
        }

        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`

        const response = await registryFetch(versionsUrl, headers)

        if (response.ok) {
          const result = JSON.parse(response.body)
          if (Array.isArray(result) && result.length > 0) {
            const sorted = result
              .map((v: Record<string, unknown>) => (typeof v === 'string' ? v : (v.version as string)) || '')
              .filter(Boolean)
              .sort((a: string, b: string) => b.localeCompare(a, undefined, { numeric: true }))
            setLatestRegistryVersion(sorted[0])
            log(`Latest registry version: ${sorted[0]}`)
          } else {
            setLatestRegistryVersion(null)
            log('No published versions found (new package)')
          }
        } else {
          setLatestRegistryVersion(null)
          log('No published versions found (new package or error)')
        }
      } catch (err) {
        // Package may not exist yet - that's fine
        setLatestRegistryVersion(null)
        log('No published versions found (new package or error)')
      }
    }

    fetchLatestVersion()
  }, [isOpen, localOnly, namespace, manifest.name, selectedRegistryName, registries, getToken])

  // Fetch content of selected files
  useEffect(() => {
    if (selectedFiles.length === 0 || !workspaceHandle) {
      setFileContents(new Map())
      return
    }

    const fetchContents = async () => {
      const contents = new Map<string, string>()
      const electronPath = (workspaceHandle as any)?._electronPath
      const isElectronMode = electronPath && (window as any).electronAPI?.readFile

      for (const filePath of selectedFiles) {
        if (filePath.endsWith('.prmd')) {
          try {
            if (isElectronMode) {
              // Electron mode - use IPC to read the file
              const fullPath = `${electronPath}/${filePath}`.replace(/\\/g, '/')
              const result = await (window as any).electronAPI.readFile(fullPath)
              if (result.success && result.content) {
                contents.set(filePath, result.content)
              }
            } else if (typeof workspaceHandle.getDirectoryHandle === 'function') {
              // File System Access API mode
              let currentHandle: FileSystemDirectoryHandle = workspaceHandle
              const parts = filePath.split('/')
              for (let i = 0; i < parts.length - 1; i++) {
                currentHandle = await currentHandle.getDirectoryHandle(parts[i])
              }
              const fileHandle = await currentHandle.getFileHandle(parts[parts.length - 1])
              const file = await fileHandle.getFile()
              const content = await file.text()
              contents.set(filePath, content)
            } else {
              console.warn(`Could not read ${filePath}: No supported file access method`)
            }
          } catch (e) {
            console.warn(`Could not read ${filePath} for validation.`)
            // Leave content empty for this file, validation will catch it
          }
        }
      }
      setFileContents(contents)
    }

    fetchContents()
  }, [selectedFiles, workspaceHandle])

  // Validate file selection whenever it changes
  useEffect(() => {
    if (selectedFiles.length === 0) {
      setValidationErrors([])
      setSyntaxErrors([])
      return
    }

    const validate = () => {
      const depErrors: ValidationError[] = []
      const syntaxErrs: SyntaxError[] = []
      const selectedSet = new Set(selectedFiles)

      for (const filePath of selectedFiles) {
        if (filePath.endsWith('.prmd')) {
          const content = fileContents.get(filePath)
          if (!content) continue // File content not yet loaded

          // Parse and check for syntax errors
          const parsed = parsePrompd(content)
          const errors = parsed.issues.filter(i => i.severity === 'error')
          if (errors.length > 0) {
            syntaxErrs.push({ filePath, issues: errors })
          }

          // Check for missing dependencies
          const dependencies = getDependencies(content)
          const sourceDir = filePath.substring(0, filePath.lastIndexOf('/') + 1)

          for (const dep of dependencies) {
            // Resolve dependency path relative to the current file
            const pathParts = (sourceDir + dep).replace(/\\/g, '/').split('/')
            const resolvedParts: string[] = []
            for (const part of pathParts) {
              if (part === '..') {
                resolvedParts.pop()
              } else if (part !== '.' && part !== '') {
                resolvedParts.push(part)
              }
            }
            const resolvedDepPath = resolvedParts.join('/')

            if (!selectedSet.has(resolvedDepPath)) {
              depErrors.push({ filePath, missingDependency: resolvedDepPath })
            }
          }
        }
      }
      setValidationErrors(depErrors)
      setSyntaxErrors(syntaxErrs)
    }

    validate()
  }, [selectedFiles, fileContents])


  // Helper to construct full package name - ensure it starts with @ but don't double it
  // In localOnly mode without namespace, just use the package name
  const getFullPackageName = () => {
    if (localOnly && !namespace) {
      return manifest.name
    }
    return namespace.startsWith('@')
      ? `${namespace}/${manifest.name}`
      : `@${namespace}/${manifest.name}`
  }

  const handleCreatePackage = async () => {
    try {
      setIsWorking(true)
      setError('')
      log('Creating package...')

      if (!workspaceHandle) {
        throw new Error('No workspace open')
      }

      // Ensure README file is included in the files list
      let filesToInclude = [...selectedFiles];
      if (manifest.readme && !filesToInclude.includes(manifest.readme)) {
        filesToInclude.push(manifest.readme);
      }

      // Skill validation
      if (packageType === 'skill') {
        if (!mainFile) {
          setError('Skills require an entry point file (main). Select a .prmd or .pdflow file as the main file.')
          return
        }
        if (packageTools.length === 0) {
          setError('Skills require at least one tool declaration. Add tools in the Tools section.')
          return
        }
      }

      const fullManifest: PackageManifest = {
        ...manifest,
        name: getFullPackageName(),
        type: packageType,
        main: mainFile,
        files: filesToInclude,
        ...(packageType === 'skill' && packageTools.length > 0 ? { tools: packageTools } : {}),
        ...(packageType === 'skill' ? { skill: { allowedTools: packageTools } } : {}),
      };

      const { blob: packageBlob } = await packageService.createPackage(
        workspaceHandle,
        fullManifest,
        getToken
      )

      log(`Package created: ${packageBlob.size} bytes`)

      // Download for inspection
      const url = URL.createObjectURL(packageBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${manifest.name}-${manifest.version}.pdpkg`
      a.click()
      URL.revokeObjectURL(url)

      log('Downloaded .pdpkg for inspection')

      return packageBlob
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log(`❌ Package creation failed: ${message}`)
      setError(message)
      throw err
    } finally {
      setIsWorking(false)
    }
  }

  const handlePublish = async () => {
    try {
      setIsWorking(true)
      setError('')
      setProgress(0)
      setPublishStatus('creating')

      if (!workspaceHandle) {
        throw new Error('No workspace open')
      }

      // Ensure README file is included in the files list
      let filesToInclude = [...selectedFiles];
      if (manifest.readme && !filesToInclude.includes(manifest.readme)) {
        filesToInclude.push(manifest.readme);
      }

      // Skill validation
      if (packageType === 'skill') {
        if (!mainFile) {
          setError('Skills require an entry point file (main). Select a .prmd or .pdflow file as the main file.')
          return
        }
        if (packageTools.length === 0) {
          setError('Skills require at least one tool declaration. Add tools in the Tools section.')
          return
        }
      }

      // Create package
      log('Creating package...')
      const fullManifest: PackageManifest = {
        ...manifest,
        name: getFullPackageName(),
        type: packageType,
        main: mainFile,
        files: filesToInclude,
        ...(packageType === 'skill' && packageTools.length > 0 ? { tools: packageTools } : {}),
        ...(packageType === 'skill' ? { skill: { allowedTools: packageTools } } : {}),
      };

      const { outputPath } = await packageService.createPackage(
        workspaceHandle,
        fullManifest,
        getToken
      )

      // Publish to the selected registry
      setPublishStatus('uploading')
      const regConfig = getSelectedRegistryConfig()
      const regName = selectedRegistryName || 'default'
      log(`Publishing to registry: ${regName}...`)
      await packageService.publish(outputPath, fullManifest, getToken, setProgress, regConfig)

      setPublishStatus('success')
      log('Publish complete!')

      // Update workspace prompd.json if toggle is on
      if (updateWorkspaceManifest) {
        try {
          log('Updating prompd.json with published data...')
          await saveManifestFile(fullManifest)
          log('prompd.json updated')

          // Trigger file change check if callback provided
          if (onFilesSaved) {
            await onFilesSaved()
          }
        } catch (saveErr) {
          const saveMessage = saveErr instanceof Error ? saveErr.message : 'Unknown error'
          log(`Warning: Failed to update prompd.json: ${saveMessage}`)
          // Don't fail the publish if manifest save fails
        }
      } else {
        log('Skipping workspace prompd.json update (toggle off)')
      }

      // Auto-close after showing success for 2 seconds
      setTimeout(() => {
        onClose()
      }, 2000)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log(`Publish failed: ${message}`)
      setError(message)
      setPublishStatus('error')
    } finally {
      setIsWorking(false)
    }
  }


  // Helper function to save manifest file (used by both manual save and auto-save after publish)
  const saveManifestFile = async (manifestToSave: PackageManifest) => {
    if (!workspaceHandle) {
      throw new Error('No workspace handle');
    }

    // Filter out prompd.json/manifest.json from files list (it's metadata, not content)
    const filteredFiles = (manifestToSave.files || []).filter(f =>
      f !== 'prompd.json' && !f.endsWith('/prompd.json') &&
      f !== 'manifest.json' && !f.endsWith('/manifest.json')
    );

    const manifestData: Partial<PackageManifest> = {
      name: manifestToSave.name,
      version: manifestToSave.version,
      description: manifestToSave.description,
      type: manifestToSave.type || undefined,
      author: manifestToSave.author,
      license: manifestToSave.license,
      keywords: manifestToSave.keywords,
      readme: manifestToSave.readme || undefined,
      repository: manifestToSave.repository,
      main: manifestToSave.main,
      files: filteredFiles,
      ignore: manifestToSave.ignore?.length ? manifestToSave.ignore : undefined,
      tools: manifestToSave.tools?.length ? manifestToSave.tools : undefined,
      mcps: manifestToSave.mcps?.length ? manifestToSave.mcps : undefined,
    };

    // remove undefined properties
    Object.keys(manifestData).forEach(key => {
      if (manifestData[key as keyof PackageManifest] === undefined) {
        delete manifestData[key as keyof PackageManifest];
      }
    });

    const manifestContent = JSON.stringify(manifestData, null, 2);

    // Check if this is an Electron pseudo-handle
    const electronPath = (workspaceHandle as any)?._electronPath
    if (electronPath && (window as any).electronAPI?.writeFile) {
      // Electron mode - use IPC to write the file
      const manifestPath = `${electronPath}/prompd.json`.replace(/\\/g, '/')
      const result = await (window as any).electronAPI.writeFile(manifestPath, manifestContent)
      if (!result.success) {
        throw new Error(result.error || 'Failed to write prompd.json')
      }
    } else if (typeof workspaceHandle.getFileHandle === 'function') {
      // File System Access API mode
      const fileHandle = await workspaceHandle.getFileHandle('prompd.json', { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(manifestContent);
      await writable.close();
    } else {
      throw new Error('No supported file access method available')
    }
  };

  const handleSaveManifest = async () => {
    if (!workspaceHandle) {
      log('❌ Cannot save manifest: No workspace handle.');
      setError('Cannot save manifest: No workspace handle.');
      return;
    }

    try {
      setIsWorking(true);
      setError('');
      log('Saving prompd.json...');

      // Preserve files that were in the original manifest but aren't visible in workspace
      const workspaceFilePaths = new Set(workspaceFiles.map(f => f.path));
      const preservedFiles = originalManifestFiles.filter(f =>
        !workspaceFilePaths.has(f) &&
        f !== 'prompd.json' && !f.endsWith('/prompd.json') &&
        f !== 'manifest.json' && !f.endsWith('/manifest.json')
      );

      // Merge: selected files + preserved files (avoid duplicates)
      const selectedSet = new Set(selectedFiles);
      let mergedFiles = [...selectedFiles, ...preservedFiles.filter(f => !selectedSet.has(f))];

      // Ensure README file is included if specified in manifest
      if (manifest.readme && !mergedFiles.includes(manifest.readme)) {
        mergedFiles.push(manifest.readme);
      }

      const fullManifest: PackageManifest = {
        ...manifest,
        name: getFullPackageName(),
        type: packageType,
        main: mainFile,
        files: mergedFiles,
        ...(packageType === 'skill' && packageTools.length > 0 ? { tools: packageTools } : {}),
        ...(packageType === 'skill' ? { skill: { allowedTools: packageTools } } : {}),
      };

      await saveManifestFile(fullManifest);

      log('prompd.json saved successfully.');
      setSuccessMessage('prompd.json saved successfully.')
      // Auto-dismiss after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000)

      // Trigger file change check if callback provided
      if (onFilesSaved) {
        await onFilesSaved()
      }

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      log(`Failed to save prompd.json: ${message}`);
      setError(`Failed to save prompd.json: ${message}`);
    } finally {
      setIsWorking(false);
    }
  };

  const toggleFile = (filePath: string) => {
    setSelectedFiles(prev =>
      prev.includes(filePath)
        ? prev.filter(p => p !== filePath)
        : [...prev, filePath]
    )
  }

  const toggleAll = () => {
    const allFiles = selectableFiles.map(f => f.path)
    setSelectedFiles(prev => prev.length === allFiles.length ? [] : allFiles)
  }

  // Simple glob pattern matching (supports * and **)
  const matchesPattern = useCallback((filePath: string, pattern: string): boolean => {
    // Normalize paths
    const normalizedPath = filePath.replace(/\\/g, '/')
    const normalizedPattern = pattern.replace(/\\/g, '/')

    // Convert glob pattern to regex
    const regexPattern = normalizedPattern
      .replace(/\./g, '\\.')           // Escape dots
      .replace(/\*\*/g, '{{DOUBLESTAR}}')  // Temp placeholder for **
      .replace(/\*/g, '[^/]*')         // * matches any chars except /
      .replace(/{{DOUBLESTAR}}/g, '.*') // ** matches anything including /
      .replace(/\?/g, '.')              // ? matches single char

    const regex = new RegExp(`^${regexPattern}$|/${regexPattern}$|^${regexPattern}/`)
    return regex.test(normalizedPath)
  }, [])

  // Filter out .pdpkg, .zip, prompd.json/manifest.json, always-ignored patterns, and user ignore patterns
  const selectableFiles = useMemo(() => {
    return workspaceFiles.filter(f => {
      const isFile = f.type === 'file' || f.kind === 'file'
      const isPackageFile = f.path.endsWith('.pdpkg') || f.path.endsWith('.zip')
      const isManifest = f.path === 'prompd.json' || f.path.endsWith('/prompd.json') ||
                         f.path === 'manifest.json' || f.path.endsWith('/manifest.json')
      const fileName = f.name || f.path.split('/').pop() || ''

      // Check against always-ignored patterns (system patterns that are never packaged)
      const isAlwaysIgnored = ALWAYS_IGNORED_PATTERNS.some(pattern =>
        matchesPattern(f.path, pattern) || matchesPattern(fileName, pattern)
      )

      // Check against user-defined ignore patterns from manifest.ignore
      const isUserIgnored = (manifest.ignore || []).some(pattern =>
        matchesPattern(f.path, pattern) || matchesPattern(fileName, pattern)
      )

      return isFile && !isPackageFile && !isManifest && !isAlwaysIgnored && !isUserIgnored
    })
  }, [workspaceFiles, manifest.ignore, matchesPattern])

  // Auto-select packagable files when manifest.files is empty and we have selectable files
  // This runs after selectableFiles is computed
  useEffect(() => {
    // Only auto-select if:
    // 1. Modal is open
    // 2. originalManifestFiles is empty (no files were specified in prompd.json)
    // 3. selectedFiles is empty (nothing selected yet)
    // 4. selectableFiles has items available
    if (isOpen && originalManifestFiles.length === 0 && selectedFiles.length === 0 && selectableFiles.length > 0) {
      // Filter to only packagable file types
      const packagableFiles = selectableFiles
        .filter(f => PACKAGABLE_EXTENSIONS.some(ext => f.path.toLowerCase().endsWith(ext)))
        .map(f => f.path)

      if (packagableFiles.length > 0) {
        setSelectedFiles(packagableFiles)
        log(`Auto-selected ${packagableFiles.length} packagable files.`)

        // Auto-select main file based on package type
        const mainExt = packageType === 'workflow' ? '.pdflow' : '.prmd'
        const mainCandidates = packagableFiles.filter(f => f.endsWith(mainExt))
        if (mainCandidates.length === 1 && !mainFile) {
          setMainFile(mainCandidates[0])
          log(`Auto-selected main file: ${mainCandidates[0]}`)
        }
      }
    }
  }, [isOpen, originalManifestFiles.length, selectedFiles.length, selectableFiles, mainFile, packageType])

  // Step 3 is now Package Details - validate both file selection AND manifest
  const isStep3Valid = validationErrors.length === 0
    && mainFile !== ''
    && selectedFiles.length > 0
    && manifest.name
    && manifest.version
    && manifest.description
    && manifest.description.length >= 10;

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(4px)'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          borderRadius: 12,
          padding: 24,
          maxWidth: 800,
          width: '90%',
          maxHeight: '90vh',
          overflow: 'auto',
          color: colors.text,
          boxShadow: theme === 'dark' ? '0 20px 60px rgba(0, 0, 0, 0.5)' : '0 20px 60px rgba(0, 0, 0, 0.15)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 20px 0', color: colors.primary, fontSize: '20px', fontWeight: 600 }}>
          <Package size={24} style={{ verticalAlign: 'middle', marginRight: 8 }} />
          {localOnly ? 'Create Package' : 'Publish Package'} (Step {step === 2 ? 1 : 2}/{localOnly ? 2 : 2})
        </h2>

        {error && (
          <div style={{
            background: colors.error,
            border: `1px solid ${colors.errorBorder}`,
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
            whiteSpace: 'pre-wrap',
            color: colors.errorText,
            fontSize: '14px'
          }}>
            {error}
          </div>
        )}

        {successMessage && (
          <div style={{
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
            color: '#10b981',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <Check size={16} />
            {successMessage}
          </div>
        )}

        {/* Step 2: File Selection */}
        {step === 2 && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <label style={{
                  fontWeight: 600,
                  fontSize: '14px',
                  color: colors.text
                }}>
                  Select Files to Include
                </label>
                <button
                  onClick={toggleAll}
                  style={{
                    padding: '6px 12px',
                    background: colors.bgTertiary,
                    border: 'none',
                    borderRadius: 6,
                    color: colors.text,
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 500,
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = colors.hover}
                  onMouseLeave={(e) => e.currentTarget.style.background = colors.bgTertiary}
                >
                  {selectedFiles.length === selectableFiles.length
                    ? 'Deselect All'
                    : 'Select All'
                  }
                </button>
              </div>
              <div style={{
                maxHeight: 200,
                overflow: 'auto',
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                padding: 12,
                background: colors.input
              }}>
                {isLoadingManifest ? (
                  <div style={{ padding: 24, textAlign: 'center', color: colors.textMuted, fontSize: '14px' }}>
                    Loading...
                  </div>
                ) : selectableFiles.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: colors.textMuted, fontSize: '14px' }}>
                    No files found in workspace.
                  </div>
                ) : (
                  selectableFiles.map(file => (
                    <label
                      key={file.path}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '8px',
                        cursor: 'pointer',
                        borderRadius: 6,
                        transition: 'background 0.15s',
                        color: colors.text,
                        fontSize: '14px'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = colors.hover}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <input
                        type="checkbox"
                        checked={selectedFiles.includes(file.path)}
                        onChange={() => toggleFile(file.path)}
                        style={{
                          marginRight: 12,
                          width: 16,
                          height: 16,
                          cursor: 'pointer'
                        }}
                      />
                      <span>{file.path}</span>
                    </label>
                  ))
                )}
              </div>
              <small style={{ color: colors.textSecondary, display: 'block', marginTop: 8, fontSize: '13px' }}>
                {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
              </small>
            </div>

            {/* Syntax Errors - Block packaging if .prmd files have syntax errors */}
            {syntaxErrors.length > 0 && (
              <div style={{
                background: colors.error,
                border: `1px solid ${colors.errorBorder}`,
                borderRadius: 8,
                padding: '12px 16px',
                marginBottom: 20,
                color: colors.errorText,
                fontSize: '13px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, marginBottom: 8 }}>
                  <AlertCircle size={16} />
                  Syntax Errors (must fix before packaging)
                </div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {syntaxErrors.map((err, i) => (
                    <li key={i} style={{ marginBottom: 8 }}>
                      <strong style={{ color: colors.text }}>{err.filePath}</strong>
                      <ul style={{ margin: '4px 0 0 0', paddingLeft: 16 }}>
                        {err.issues.map((issue, j) => (
                          <li key={j} style={{ marginBottom: 2 }}>
                            {issue.line && <span style={{ opacity: 0.7 }}>Line {issue.line}: </span>}
                            {issue.message}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Dependency Validation Errors */}
            {validationErrors.length > 0 && (
              <div style={{
                background: colors.warning,
                border: `1px solid ${colors.warningBorder}`,
                borderRadius: 8,
                padding: '12px 16px',
                marginBottom: 20,
                color: colors.warningText,
                fontSize: '13px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, marginBottom: 8 }}>
                  <AlertTriangle size={16} />
                  Missing Dependencies
                </div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {validationErrors.map((err, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>
                      <strong style={{ color: colors.text }}>{err.filePath}</strong> depends on <strong style={{ color: colors.text }}>{err.missingDependency}</strong>, which is not selected.
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Main File Selection */}
            <div style={{ marginBottom: 20 }}>
              <label style={{
                display: 'block',
                marginBottom: 12,
                fontWeight: 600,
                fontSize: '14px',
                color: colors.text
              }}>
                Select Main Entry Point
              </label>
              <div style={{
                maxHeight: 150,
                overflow: 'auto',
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                padding: 12,
                background: colors.input
              }}>
                {(() => {
                  const mainExt = packageType === 'workflow' ? '.pdflow' : '.prmd'
                  const mainCandidates = selectedFiles.filter(f => f.endsWith(mainExt))
                  return mainCandidates.length === 0 ? (
                  <div style={{ padding: 12, textAlign: 'center', color: colors.textMuted, fontSize: '13px' }}>
                    Select at least one <code style={{ background: colors.bgTertiary, padding: '2px 4px', borderRadius: 4 }}>{mainExt}</code> file to choose an entry point.
                  </div>
                ) : (
                  mainCandidates.map(file => (
                    <label
                      key={file}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '8px',
                        cursor: 'pointer',
                        borderRadius: 6,
                        transition: 'background 0.15s',
                        color: colors.text,
                        fontSize: '14px'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = colors.hover}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <input
                        type="radio"
                        name="mainFile"
                        checked={mainFile === file}
                        onChange={() => setMainFile(file)}
                        style={{
                          marginRight: 12,
                          width: 16,
                          height: 16,
                          cursor: 'pointer'
                        }}
                      />
                      <span>{file}</span>
                    </label>
                  ))
                )
                })()}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', marginTop: 24 }}>
              <button
                onClick={onClose}
                style={{
                  padding: '10px 20px',
                  background: 'transparent',
                  border: `1px solid ${colors.border}`,
                  borderRadius: 8,
                  color: colors.textSecondary,
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = colors.hover
                  e.currentTarget.style.color = colors.text
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = colors.textSecondary
                }}
              >
                Cancel
              </button>
              {(() => {
                const isStep2Valid = selectedFiles.length > 0 && mainFile && validationErrors.length === 0 && syntaxErrors.length === 0
                return (
                  <button
                    onClick={() => setStep(3)}
                    disabled={!isStep2Valid}
                    style={{
                      padding: '10px 24px',
                      background: isStep2Valid ? colors.primary : colors.bgTertiary,
                      border: 'none',
                      borderRadius: 8,
                      color: isStep2Valid ? '#ffffff' : colors.textMuted,
                      cursor: isStep2Valid ? 'pointer' : 'not-allowed',
                      fontSize: '14px',
                      fontWeight: 600,
                      transition: 'all 0.2s',
                      opacity: isStep2Valid ? 1 : 0.5
                    }}
                    onMouseEnter={(e) => {
                      if (isStep2Valid) {
                        e.currentTarget.style.background = colors.primaryHover
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (isStep2Valid) {
                        e.currentTarget.style.background = colors.primary
                      }
                    }}
                  >
                    Next →
                  </button>
                )
              })()}
            </div>
          </div>
        )}

        {/* Step 3: Package Details */}
        {step === 3 && (
          <div>
            {/* Registry Selector - show when not localOnly and registries are loaded */}
            {!localOnly && registries.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <label style={{
                  display: 'block',
                  marginBottom: 8,
                  fontWeight: 600,
                  fontSize: '14px',
                  color: colors.text
                }}>
                  <Globe size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                  Registry
                </label>
                <select
                  value={selectedRegistryName}
                  onChange={(e) => {
                    const newName = e.target.value
                    setSelectedRegistryName(newName)
                    setRegistryApiKeyInput('')
                    setLatestRegistryVersion(null)
                    const reg = registries.find(r => r.name === newName)
                    if (reg) {
                      loadNamespacesForRegistry({ apiKey: reg.apiKey, url: reg.url })
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: colors.input,
                    border: `1px solid ${colors.border}`,
                    borderRadius: needsRegistryLogin ? '8px 8px 0 0' : 8,
                    color: colors.text,
                    fontSize: '14px',
                    cursor: registries.length > 1 ? 'pointer' : 'default'
                  }}
                >
                  {registries.map(reg => (
                    <option key={reg.name} value={reg.name}>
                      {reg.name}{reg.isDefault ? ' (default)' : ''} — {reg.url}
                    </option>
                  ))}
                </select>

                {/* API Key input - shown when registry requires authentication */}
                {needsRegistryLogin && (
                  <div style={{
                    padding: '12px',
                    background: colors.bgSecondary,
                    border: `1px solid ${colors.border}`,
                    borderTop: 'none',
                    borderRadius: '0 0 8px 8px'
                  }}>
                    <div style={{
                      fontSize: '13px',
                      color: colors.textSecondary,
                      marginBottom: 8,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}>
                      <KeyRound size={13} />
                      Enter an API key to authenticate with this registry
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="password"
                        value={registryApiKeyInput}
                        onChange={(e) => setRegistryApiKeyInput(e.target.value)}
                        placeholder="Registry API key"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && registryApiKeyInput.trim()) {
                            saveRegistryApiKey(registryApiKeyInput)
                          }
                        }}
                        style={{
                          flex: 1,
                          padding: '8px 10px',
                          background: colors.input,
                          border: `1px solid ${colors.border}`,
                          borderRadius: 6,
                          color: colors.text,
                          fontSize: '13px'
                        }}
                        onFocus={(e) => e.currentTarget.style.borderColor = colors.primary}
                        onBlur={(e) => e.currentTarget.style.borderColor = colors.border}
                      />
                      <button
                        onClick={() => saveRegistryApiKey(registryApiKeyInput)}
                        disabled={!registryApiKeyInput.trim()}
                        style={{
                          padding: '8px 14px',
                          background: registryApiKeyInput.trim() ? colors.primary : colors.bgTertiary,
                          border: 'none',
                          borderRadius: 6,
                          color: registryApiKeyInput.trim() ? '#ffffff' : colors.textMuted,
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: registryApiKeyInput.trim() ? 'pointer' : 'not-allowed',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        Save & Connect
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Package Type (read-only — determined by prompd.json) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <label style={{
                fontWeight: 600,
                fontSize: '14px',
                color: colors.text,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                margin: 0,
              }}>
                <Package size={14} />
                Type
              </label>
              <div
                title={{
                  package: 'Standard prompt package containing .prmd files',
                  workflow: 'Deployable workflow package containing .pdflow files',
                  'node-template': 'Reusable node configuration for the workflow canvas',
                  skill: 'AI agent skill with tool declarations',
                }[packageType]}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '3px 10px',
                  background: theme === 'dark' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(59, 130, 246, 0.08)',
                  border: `1px solid ${theme === 'dark' ? 'rgba(59, 130, 246, 0.25)' : 'rgba(59, 130, 246, 0.2)'}`,
                  borderRadius: 6,
                  fontSize: '12px',
                  fontWeight: 500,
                  color: colors.primary,
                  cursor: 'default',
                }}>
                {{ package: 'Package', workflow: 'Workflow', 'node-template': 'Node Template', skill: 'Skill' }[packageType]}
              </div>
            </div>

            {/* Tools (skill type only) */}
            {packageType === 'skill' && (
              <div style={{ marginBottom: 20 }}>
                <label style={{
                  display: 'block',
                  marginBottom: 8,
                  fontWeight: 600,
                  fontSize: '14px',
                  color: colors.text
                }}>
                  Required Tools
                  <span style={{
                    marginLeft: 8,
                    fontSize: '11px',
                    fontWeight: 500,
                    color: colors.primary,
                    background: theme === 'dark' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)',
                    padding: '2px 8px',
                    borderRadius: '10px'
                  }}>
                    Required for Skills
                  </span>
                </label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input
                    type="text"
                    value={toolInput}
                    onChange={(e) => setToolInput(e.target.value)}
                    placeholder="Tool name (e.g., Read, Write, Bash)"
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ',') && toolInput.trim()) {
                        e.preventDefault()
                        const trimmed = toolInput.trim().replace(/,$/, '')
                        if (trimmed && !packageTools.includes(trimmed)) {
                          setPackageTools(prev => [...prev, trimmed])
                        }
                        setToolInput('')
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      background: colors.input,
                      border: `1px solid ${colors.border}`,
                      borderRadius: 8,
                      color: colors.text,
                      fontSize: '14px'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = colors.primary}
                    onBlur={(e) => e.currentTarget.style.borderColor = colors.border}
                  />
                  <button
                    onClick={() => {
                      const trimmed = toolInput.trim()
                      if (trimmed && !packageTools.includes(trimmed)) {
                        setPackageTools(prev => [...prev, trimmed])
                      }
                      setToolInput('')
                    }}
                    disabled={!toolInput.trim()}
                    style={{
                      padding: '10px 14px',
                      background: toolInput.trim() ? colors.primary : colors.bgTertiary,
                      border: 'none',
                      borderRadius: 8,
                      color: toolInput.trim() ? '#ffffff' : colors.textMuted,
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: toolInput.trim() ? 'pointer' : 'not-allowed'
                    }}
                  >
                    <Plus size={16} />
                  </button>
                </div>
                {packageTools.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {packageTools.map(tool => (
                      <span
                        key={tool}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '4px 10px',
                          background: theme === 'dark' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)',
                          border: `1px solid ${theme === 'dark' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.2)'}`,
                          borderRadius: 6,
                          fontSize: '13px',
                          color: colors.primary
                        }}
                      >
                        {tool}
                        <X
                          size={12}
                          style={{ cursor: 'pointer', opacity: 0.7 }}
                          onClick={() => setPackageTools(prev => prev.filter(t => t !== tool))}
                        />
                      </span>
                    ))}
                  </div>
                )}
                {packageTools.length === 0 && (
                  <p style={{
                    margin: '4px 0 0 0',
                    fontSize: '12px',
                    color: colors.errorText || '#dc2626',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}>
                    <AlertTriangle size={12} />
                    Skills should declare at least one required tool
                  </p>
                )}
              </div>
            )}

            {/* Package Name with namespace dropdown */}
            <div style={{ marginBottom: 20 }}>
              <label style={{
                display: 'block',
                marginBottom: 8,
                fontWeight: 600,
                fontSize: '14px',
                color: colors.text
              }}>
                Package Name
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                {/* Namespace dropdown prefix - only when not in localOnly mode */}
                {!localOnly && (
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {/* <span style={{ color: colors.textSecondary, fontSize: '14px', fontWeight: 500, marginRight: 2 }}>@</span> */}
                    <select
                      value={namespace}
                      onChange={(e) => setNamespace(e.target.value)}
                      disabled={isLoadingNamespaces || (namespaces.length === 0 && !customNs)}
                      style={{
                        padding: '10px 8px',
                        background: colors.input,
                        border: `1px solid ${colors.border}`,
                        borderRadius: '8px 0 0 8px',
                        borderRight: 'none',
                        color: colors.text,
                        fontSize: '14px',
                        fontWeight: 500,
                        cursor: (namespaces.length > 0 || !!customNs) ? 'pointer' : 'default',
                        minWidth: 80,
                        opacity: isLoadingNamespaces ? 0.6 : 1
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
                              {ns.name}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                    <span style={{
                      color: colors.textSecondary,
                      fontSize: '14px',
                      fontWeight: 500,
                      padding: '10px 4px 10px 2px',
                      background: colors.input,
                      borderTop: `1px solid ${colors.border}`,
                      borderBottom: `1px solid ${colors.border}`
                    }}>/</span>
                  </div>
                )}
                <input
                  value={manifest.name}
                  onChange={e => setManifest({ ...manifest, name: e.target.value })}
                  placeholder="my-package"
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    background: colors.input,
                    border: `1px solid ${colors.border}`,
                    borderRadius: !localOnly ? '0 8px 8px 0' : 8,
                    color: colors.text,
                    fontSize: '14px',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = colors.primary}
                  onBlur={(e) => e.currentTarget.style.borderColor = colors.border}
                />
              </div>
            </div>

            {/* Version Input */}
            <div style={{ marginBottom: 20 }}>
              <label style={{
                display: 'block',
                marginBottom: 8,
                fontWeight: 600,
                fontSize: '14px',
                color: colors.text
              }}>
                Version
                {latestRegistryVersion ? (
                  <span style={{
                    marginLeft: 10,
                    fontSize: '12px',
                    fontWeight: 500,
                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(139, 92, 246, 0.15))',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    padding: '3px 10px',
                    borderRadius: 6
                  }}>
                    <span style={{ color: colors.textSecondary }}>latest:</span>
                    <span style={{ color: colors.primary, marginLeft: 4 }}>{latestRegistryVersion}</span>
                  </span>
                ) : !localOnly && namespace && manifest.name ? (
                  <span style={{
                    marginLeft: 10,
                    fontSize: '11px',
                    fontWeight: 500,
                    color: colors.textMuted,
                    fontStyle: 'italic'
                  }}>
                    (new package)
                  </span>
                ) : null}
              </label>
              <VersionInput
                value={manifest.version}
                onChange={(version) => setManifest({ ...manifest, version })}
                colors={colors}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{
                display: 'block',
                marginBottom: 8,
                fontWeight: 600,
                fontSize: '14px',
                color: colors.text
              }}>
                Description
              </label>
              <textarea
                value={manifest.description}
                onChange={e => setManifest({ ...manifest, description: e.target.value })}
                placeholder="Describe your package..."
                rows={4}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: colors.input,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 8,
                  color: colors.text,
                  fontSize: '14px',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = colors.primary}
                onBlur={(e) => e.currentTarget.style.borderColor = colors.border}
              />
              <small style={{ color: colors.textSecondary, display: 'block', marginTop: 8, fontSize: '13px' }}>
                At least 10 characters
              </small>
            </div>

            {/* Tags / Keywords */}
            <div style={{ marginBottom: 20 }}>
              <label style={{
                display: 'block',
                marginBottom: 8,
                fontWeight: 600,
                fontSize: '14px',
                color: colors.text
              }}>
                Tags
              </label>
              {/* Tag chips */}
              {manifest.keywords && manifest.keywords.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {manifest.keywords.map((tag, idx) => (
                    <span
                      key={idx}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 10px',
                        background: 'rgba(59, 130, 246, 0.15)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        borderRadius: 12,
                        fontSize: '12px',
                        color: colors.primary,
                        fontWeight: 500
                      }}
                    >
                      {tag}
                      <button
                        onClick={() => setManifest({ ...manifest, keywords: manifest.keywords?.filter((_, i) => i !== idx) })}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          display: 'flex',
                          color: colors.primary,
                          opacity: 0.7
                        }}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {/* Tag input */}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && tagInput.trim()) {
                      e.preventDefault()
                      const newTag = tagInput.trim().toLowerCase()
                      if (!manifest.keywords?.includes(newTag)) {
                        setManifest({ ...manifest, keywords: [...(manifest.keywords || []), newTag] })
                      }
                      setTagInput('')
                    }
                  }}
                  placeholder="Type a tag and press Enter"
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    background: colors.input,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 8,
                    color: colors.text,
                    fontSize: '13px'
                  }}
                />
                <button
                  onClick={() => {
                    if (tagInput.trim()) {
                      const newTag = tagInput.trim().toLowerCase()
                      if (!manifest.keywords?.includes(newTag)) {
                        setManifest({ ...manifest, keywords: [...(manifest.keywords || []), newTag] })
                      }
                      setTagInput('')
                    }
                  }}
                  disabled={!tagInput.trim()}
                  style={{
                    padding: '8px 12px',
                    background: tagInput.trim() ? colors.bgTertiary : 'transparent',
                    border: `1px solid ${colors.border}`,
                    borderRadius: 8,
                    color: tagInput.trim() ? colors.text : colors.textMuted,
                    cursor: tagInput.trim() ? 'pointer' : 'default',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <Plus size={14} /> Add
                </button>
              </div>
            </div>

            {/* Update workspace prompd.json toggle */}
            {!localOnly && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 20,
                padding: '10px 14px',
                background: colors.bgSecondary,
                borderRadius: 8,
                border: `1px solid ${colors.border}`
              }}>
                <label style={{
                  position: 'relative',
                  display: 'inline-block',
                  width: 36,
                  height: 20,
                  flexShrink: 0,
                  cursor: 'pointer'
                }}>
                  <input
                    type="checkbox"
                    checked={updateWorkspaceManifest}
                    onChange={e => setUpdateWorkspaceManifest(e.target.checked)}
                    style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                  />
                  <span style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: updateWorkspaceManifest ? colors.primary : colors.bgTertiary,
                    borderRadius: 10,
                    transition: 'background 0.2s',
                    cursor: 'pointer'
                  }}>
                    <span style={{
                      position: 'absolute',
                      content: '""',
                      height: 16, width: 16,
                      left: updateWorkspaceManifest ? 18 : 2,
                      bottom: 2,
                      background: '#fff',
                      borderRadius: '50%',
                      transition: 'left 0.2s'
                    }} />
                  </span>
                </label>
                <span style={{ color: colors.text, fontSize: '13px' }}>
                  Update workspace <code style={{ fontSize: '12px', background: colors.bgTertiary, padding: '1px 4px', borderRadius: 3 }}>prompd.json</code> with changes
                </span>
              </div>
            )}

            {/* Publishing Status Overlay */}
            {(publishStatus === 'creating' || publishStatus === 'uploading' || publishStatus === 'success') && (
              <div style={{
                background: publishStatus === 'success' ? 'rgba(16, 185, 129, 0.1)' : colors.bgSecondary,
                border: `1px solid ${publishStatus === 'success' ? colors.success : colors.border}`,
                borderRadius: 12,
                padding: 24,
                marginBottom: 20,
                textAlign: 'center'
              }}>
                {publishStatus === 'creating' && (
                  <>
                    <div style={{
                      width: 48,
                      height: 48,
                      margin: '0 auto 16px',
                      border: `3px solid ${colors.border}`,
                      borderTopColor: colors.primary,
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite'
                    }} />
                    <div style={{ fontSize: '16px', fontWeight: 600, color: colors.text, marginBottom: 8 }}>
                      Creating Package...
                    </div>
                    <div style={{ fontSize: '14px', color: colors.textSecondary }}>
                      Bundling {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''}
                    </div>
                  </>
                )}
                {publishStatus === 'uploading' && (
                  <>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{
                        width: '100%',
                        height: 8,
                        background: colors.bgTertiary,
                        borderRadius: 4,
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          width: `${progress}%`,
                          height: '100%',
                          background: `linear-gradient(90deg, ${colors.primary}, ${colors.primaryHover})`,
                          borderRadius: 4,
                          transition: 'width 0.3s ease'
                        }} />
                      </div>
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 600, color: colors.text, marginBottom: 8 }}>
                      Publishing to Registry...
                    </div>
                    <div style={{ fontSize: '14px', color: colors.textSecondary }}>
                      {progress < 100 ? `Uploading... ${Math.round(progress)}%` : 'Finalizing...'}
                    </div>
                  </>
                )}
                {publishStatus === 'success' && (
                  <>
                    <div style={{
                      width: 48,
                      height: 48,
                      margin: '0 auto 16px',
                      background: colors.success,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Check size={28} color="#ffffff" />
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 600, color: colors.success, marginBottom: 8 }}>
                      Published Successfully!
                    </div>
                    <div style={{ fontSize: '14px', color: colors.text, marginBottom: 4 }}>
                      {getFullPackageName()}@{manifest.version}
                    </div>
                    <div style={{ fontSize: '13px', color: colors.textSecondary }}>
                      Closing in 2 seconds...
                    </div>
                  </>
                )}
              </div>
            )}

            {/* CSS for spinner animation */}
            <style>{`
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
            `}</style>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', marginTop: 24 }}>
              <button
                onClick={() => setStep(2)}
                disabled={isWorking}
                style={{
                  padding: '10px 20px',
                  background: 'transparent',
                  border: `1px solid ${colors.border}`,
                  borderRadius: 8,
                  color: colors.textSecondary,
                  cursor: isWorking ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  transition: 'all 0.2s',
                  opacity: isWorking ? 0.5 : 1
                }}
                onMouseEnter={(e) => {
                  if (!isWorking) e.currentTarget.style.background = colors.hover
                }}
                onMouseLeave={(e) => {
                  if (!isWorking) e.currentTarget.style.background = 'transparent'
                }}
              >
                ← Back
              </button>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={handleSaveManifest}
                  disabled={!isStep3Valid || isWorking}
                  style={{
                    padding: '10px 20px',
                    background: 'transparent',
                    border: `1px solid ${colors.border}`,
                    borderRadius: 8,
                    color: isStep3Valid ? colors.textSecondary : colors.textMuted,
                    cursor: isStep3Valid && !isWorking ? 'pointer' : 'not-allowed',
                    fontSize: '14px',
                    fontWeight: 500,
                    transition: 'all 0.2s',
                    opacity: isStep3Valid && !isWorking ? 1 : 0.5,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  onMouseEnter={(e) => { if (isStep3Valid && !isWorking) { e.currentTarget.style.background = colors.hover; e.currentTarget.style.color = colors.text; } }}
                  onMouseLeave={(e) => { if (isStep3Valid && !isWorking) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = colors.textSecondary; } }}
                >
                  <Save size={16} style={{ marginRight: 8 }} />
                  Save Manifest
                </button>
                <button
                  onClick={handleCreatePackage}
                  disabled={!isStep3Valid || isWorking}
                  style={{
                    padding: '10px 20px',
                    background: isStep3Valid ? colors.success : colors.bgTertiary,
                    border: 'none',
                    borderRadius: 8,
                    color: isStep3Valid ? '#ffffff' : colors.textMuted,
                    cursor: isStep3Valid ? 'pointer' : 'not-allowed',
                    fontSize: '14px',
                    fontWeight: 600,
                    transition: 'all 0.2s',
                    opacity: isStep3Valid ? 1 : 0.5
                  }}
                  onMouseEnter={(e) => { if (isStep3Valid) e.currentTarget.style.background = colors.successHover }}
                  onMouseLeave={(e) => { if (isStep3Valid) e.currentTarget.style.background = colors.success }}
                >
                  📥 Download .pdpkg
                </button>
                {/* Hide publish button in localOnly mode */}
                {!localOnly && (
                  <button
                    onClick={handlePublish}
                    disabled={!isStep3Valid || isWorking}
                    style={{
                      padding: '10px 24px',
                      background: isStep3Valid ? colors.primary : colors.bgTertiary,
                      border: 'none',
                      borderRadius: 8,
                      color: isStep3Valid ? '#ffffff' : colors.textMuted,
                      cursor: isStep3Valid ? 'pointer' : 'not-allowed',
                      fontSize: '14px',
                      fontWeight: 600,
                      transition: 'all 0.2s',
                      opacity: isStep3Valid ? 1 : 0.5
                    }}
                    onMouseEnter={(e) => { if (isStep3Valid) e.currentTarget.style.background = colors.primaryHover }}
                    onMouseLeave={(e) => { if (isStep3Valid) e.currentTarget.style.background = colors.primary }}
                  >
                    🚀 Publish to Registry
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}

/**
 * PrompdJsonDesignView - Visual editor for prompd.json files
 *
 * Renders as a design view within a tab, matching the design/code pattern
 * used for .prmd files.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Plus, Trash2, AlertCircle, AlertTriangle, Info, Search, Package, BookOpen, ChevronDown, FileText, Files, Check, Square, Sparkles, EyeOff, Globe, Tag, Server, Plug } from 'lucide-react'
import VersionInput from './VersionInput'
import { TagInput } from './TagInput'
import DependencyVersionSelect from './DependencyVersionSelect'
import { registryApi } from '../services/registryApi'
import { useEditorStore } from '../../stores/editorStore'
import { useShallow } from 'zustand/react/shallow'

interface PrompdJsonConfig {
  name?: string
  description?: string
  author?: string
  version?: string
  type?: 'package' | 'workflow' | 'skill'  // Package type (skill requires MCP servers)
  tags?: string[]  // Searchable tags for categorization
  main?: string  // Main .prmd file entry point
  files?: string[]  // Files to include in package
  readme?: string
  ignore?: string[]
  dependencies?: Record<string, string>
  mcps?: string[]  // MCP server names required by this package
  registry?: string
  [key: string]: unknown
}

interface PackageSearchResult {
  name: string
  version: string
  description?: string
}

interface Props {
  value: string  // JSON string content
  onChange: (value: string) => void
  theme?: 'light' | 'dark'
  readOnly?: boolean
}

const DEFAULT_IGNORE_PATTERNS = [
  'node_modules/**',
  '.git/**',
  '.vscode/**',
  'dist/**',
  'build/**',
  '*.log',
  '.env',
  '.env.*'
]

export default function PrompdJsonDesignView({ value, onChange, theme = 'dark', readOnly = false }: Props) {
  const [config, setConfig] = useState<PrompdJsonConfig>({ ignore: [] })
  const [newIgnorePattern, setNewIgnorePattern] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)

  // MCP server status tracking
  const [mcpServerStatuses, setMcpServerStatuses] = useState<Record<string, 'configured' | 'missing'>>({})
  const [mcpAddInput, setMcpAddInput] = useState('')

  // Dependencies search state
  const [depSearchQuery, setDepSearchQuery] = useState('')
  const [depSearchResults, setDepSearchResults] = useState<PackageSearchResult[]>([])
  const [isSearchingDeps, setIsSearchingDeps] = useState(false)
  const [showDepDropdown, setShowDepDropdown] = useState(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Get files from workspace for README picker
  const { explorerEntries } = useEditorStore(
    useShallow(state => ({
      explorerEntries: state.explorerEntries
    }))
  )

  // Generic file collector helper
  // explorerEntries is a flat list where each entry has name, kind, and path
  const collectFiles = useCallback((
    entries: typeof explorerEntries,
    filter: (name: string) => boolean
  ): string[] => {
    const files: string[] = []
    for (const entry of entries) {
      // Use entry.path directly - it contains the full relative path (e.g., "prompts/csv-sorter.prmd")
      const entryPath = (entry as { path?: string }).path || entry.name
      if (entry.kind === 'file' && filter(entry.name)) {
        files.push(entryPath)
      }
    }
    return files
  }, [])

  // Always excluded directory patterns (system directories)
  const excludeDirPatterns = useMemo(() => [
    /^\.git(\/|$)/,
    /^node_modules(\/|$)/,
    /^\.prompd(\/|$)/,
    /^dist(\/|$)/,
    /^build(\/|$)/
  ], [])

  // Helper to check if a file path matches any exclude pattern
  const isExcludedPath = useCallback((filePath: string): boolean => {
    return excludeDirPatterns.some(p => p.test(filePath))
  }, [excludeDirPatterns])

  // Helper to check if a file path matches any user-defined ignore pattern (glob-style)
  const matchesIgnorePattern = useCallback((filePath: string, patterns: string[]): boolean => {
    if (!patterns || patterns.length === 0) return false
    const normalizedPath = filePath.replace(/\\/g, '/')

    for (const pattern of patterns) {
      const normalizedPattern = pattern.replace(/\\/g, '/')
      // Convert glob pattern to regex
      const regexPattern = normalizedPattern
        .replace(/\./g, '\\.')           // Escape dots
        .replace(/\*\*/g, '{{DOUBLESTAR}}')  // Temp placeholder for **
        .replace(/\*/g, '[^/]*')         // * matches any chars except /
        .replace(/{{DOUBLESTAR}}/g, '.*') // ** matches anything including /
        .replace(/\?/g, '.')              // ? matches single char

      const regex = new RegExp(`^${regexPattern}$|^${regexPattern}/|/${regexPattern}$`)
      if (regex.test(normalizedPath)) {
        return true
      }
    }
    return false
  }, [])

  // Get markdown files from workspace for README dropdown
  const markdownFiles = useMemo(() => {
    if (!explorerEntries || explorerEntries.length === 0) {
      return ['README.md', 'docs/README.md'] // fallback defaults
    }
    const mdFiles = collectFiles(explorerEntries, name => /\.(md|markdown)$/i.test(name))
      .filter(path => !isExcludedPath(path))
      .filter(path => !matchesIgnorePattern(path, config.ignore || []))
    return mdFiles.length > 0 ? mdFiles : ['README.md', 'docs/README.md']
  }, [explorerEntries, collectFiles, isExcludedPath, matchesIgnorePattern, config.ignore])

  // Get .prmd files for main entry point dropdown
  const prmdFiles = useMemo(() => {
    if (!explorerEntries || explorerEntries.length === 0) {
      return []
    }
    return collectFiles(explorerEntries, name => /\.prmd$/i.test(name))
      .filter(path => !isExcludedPath(path))
      .filter(path => !matchesIgnorePattern(path, config.ignore || []))
  }, [explorerEntries, collectFiles, isExcludedPath, matchesIgnorePattern, config.ignore])

  // Supported file extensions for packaging (matches @prompd/cli AssetExtractionStage)
  // Only these file types can be included in packages for security
  const ALLOWED_EXTENSIONS = new Set([
    // Prompd files
    '.prmd',
    '.pdflow',  // Workflow files
    // Binary context files
    '.xlsx', '.xls',  // Excel
    '.docx',          // Word
    '.pdf',           // PDF
    '.png', '.jpg', '.jpeg', '.gif',  // Images
    // Text files
    '.txt', '.md', '.markdown',
    // Data files
    '.json', '.yaml', '.yml', '.csv',
    // Shell scripts
    '.sh', '.bash', '.zsh', '.fish',
    // Code files
    '.py', '.js', '.ts', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp',
    // Markup
    '.html', '.xml', '.svg', '.css', '.scss'
  ])

  // Get all workspace files for the files array picker
  // Filters out: system directories, user ignore patterns, and unsupported extensions
  const allWorkspaceFiles = useMemo(() => {
    if (!explorerEntries || explorerEntries.length === 0) {
      return []
    }
    // Only include files with allowed extensions for security
    return collectFiles(
      explorerEntries,
      () => true  // Accept all files initially
    ).filter(path => {
      // Check if path is in excluded directory (system patterns)
      if (isExcludedPath(path)) return false
      // Check if path matches user-defined ignore patterns
      if (matchesIgnorePattern(path, config.ignore || [])) return false
      // Check if file is prompd.json (config file, not packaged)
      const fileName = path.split('/').pop() || path
      if (fileName === 'prompd.json') return false
      // Only allow supported file extensions
      const ext = '.' + fileName.split('.').pop()?.toLowerCase()
      return ALLOWED_EXTENSIONS.has(ext)
    })
  }, [explorerEntries, collectFiles, isExcludedPath, matchesIgnorePattern, config.ignore])

  // Theme-aware colors - bg is darker, sections are lighter
  const colors = useMemo(() => ({
    bg: theme === 'dark' ? '#0f172a' : '#f8fafc',
    bgSecondary: theme === 'dark' ? '#1e293b' : '#ffffff',
    bgTertiary: theme === 'dark' ? '#334155' : '#e2e8f0',
    border: theme === 'dark' ? 'rgba(71, 85, 105, 0.3)' : '#e2e8f0',
    text: theme === 'dark' ? '#ffffff' : '#0f172a',
    textSecondary: theme === 'dark' ? '#94a3b8' : '#64748b',
    textMuted: theme === 'dark' ? '#64748b' : '#94a3b8',
    input: theme === 'dark' ? '#1e293b' : '#ffffff',
    hover: theme === 'dark' ? 'rgba(71, 85, 105, 0.3)' : 'rgba(148, 163, 184, 0.15)',
    primary: '#3b82f6',
    primaryHover: '#2563eb',
    success: '#10b981',
    successBg: theme === 'dark' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.1)',
    successBorder: theme === 'dark' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.3)',
    error: '#ef4444',
    errorBg: theme === 'dark' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.1)',
    errorBorder: theme === 'dark' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.3)',
    infoBg: theme === 'dark' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.1)',
    infoBorder: theme === 'dark' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.3)',
    accent: '#3b82f6'
  }), [theme])

  // Parse JSON value into config state
  useEffect(() => {
    if (!value || value.trim() === '') {
      setConfig({ name: '', version: '1.0.0', ignore: [] })
      setParseError(null)
      return
    }

    try {
      const parsed = JSON.parse(value)
      setConfig(parsed)
      setParseError(null)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Invalid JSON')
    }
  }, [value])

  // Update parent when config changes - using functional update to avoid stale closures
  const updateConfig = useCallback((updates: Partial<PrompdJsonConfig> | ((prev: PrompdJsonConfig) => Partial<PrompdJsonConfig>)) => {
    if (readOnly) return

    setConfig(prevConfig => {
      const resolvedUpdates = typeof updates === 'function' ? updates(prevConfig) : updates
      const newConfig = { ...prevConfig, ...resolvedUpdates }

      // Serialize back to JSON with nice formatting
      const jsonStr = JSON.stringify(newConfig, null, 2)
      // Use setTimeout to avoid calling onChange during render
      setTimeout(() => onChange(jsonStr), 0)

      return newConfig
    })
  }, [onChange, readOnly])

  const addIgnorePattern = useCallback(() => {
    if (!newIgnorePattern.trim() || readOnly) return

    updateConfig(prev => ({
      ignore: [...(prev.ignore || []), newIgnorePattern.trim()]
    }))
    setNewIgnorePattern('')
  }, [newIgnorePattern, updateConfig, readOnly])

  const removeIgnorePattern = useCallback((index: number) => {
    if (readOnly) return
    updateConfig(prev => ({
      ignore: (prev.ignore || []).filter((_, i) => i !== index)
    }))
  }, [updateConfig, readOnly])

  const addCommonPatterns = useCallback(() => {
    if (readOnly) return

    updateConfig(prev => {
      const currentPatterns = new Set(prev.ignore || [])
      const newPatterns = DEFAULT_IGNORE_PATTERNS.filter(p => !currentPatterns.has(p))

      if (newPatterns.length > 0) {
        return { ignore: [...(prev.ignore || []), ...newPatterns] }
      }
      return {}  // No changes needed
    })
  }, [updateConfig, readOnly])

  // Normalize path for comparison (handle ./, \, etc.)
  const normalizePath = useCallback((path: string): string => {
    return path
      .replace(/\\/g, '/')           // Backslash to forward slash
      .replace(/^\.\//, '')          // Remove leading ./
      .replace(/\/+/g, '/')          // Collapse multiple slashes
  }, [])

  // Check if a file path is in the files array (normalized comparison)
  const isFileSelected = useCallback((filePath: string): boolean => {
    const normalizedPath = normalizePath(filePath)
    return (config.files || []).some(f => normalizePath(f) === normalizedPath)
  }, [config.files, normalizePath])

  // Count selected files that exist in the workspace (for accurate count display)
  const selectedFileCount = useMemo(() => {
    if (!config.files || config.files.length === 0) return 0
    // Count how many workspace files are in the config.files array
    return allWorkspaceFiles.filter(f => isFileSelected(f)).length
  }, [config.files, allWorkspaceFiles, isFileSelected])

  // Find files listed in config.files that don't exist in the workspace (missing files)
  const missingFiles = useMemo(() => {
    if (!config.files || config.files.length === 0) return []
    const workspaceFileSet = new Set(allWorkspaceFiles.map(normalizePath))
    return config.files.filter(f => !workspaceFileSet.has(normalizePath(f)))
  }, [config.files, allWorkspaceFiles, normalizePath])

  // Files array management
  const toggleFileInPackage = useCallback((filePath: string) => {
    if (readOnly) return
    const normalizedPath = normalizePath(filePath)

    updateConfig(prev => {
      const currentFiles = prev.files || []
      // Find existing entry with normalized comparison
      const existingIndex = currentFiles.findIndex(f => normalizePath(f) === normalizedPath)

      if (existingIndex >= 0) {
        // Remove the existing entry
        return { files: currentFiles.filter((_, i) => i !== existingIndex) }
      } else {
        // Add with normalized path
        return { files: [...currentFiles, normalizedPath] }
      }
    })
  }, [updateConfig, readOnly, normalizePath])

  const selectAllFiles = useCallback(() => {
    if (readOnly) return
    updateConfig({ files: [...allWorkspaceFiles] })
  }, [allWorkspaceFiles, updateConfig, readOnly])

  const deselectAllFiles = useCallback(() => {
    if (readOnly) return
    updateConfig({ files: [] })
  }, [updateConfig, readOnly])

  // Dependency management
  const addDependency = useCallback((name: string, version: string) => {
    if (readOnly) return
    updateConfig(prev => ({
      dependencies: {
        ...(prev.dependencies || {}),
        [name]: version
      }
    }))
    setDepSearchQuery('')
    setShowDepDropdown(false)
    setDepSearchResults([])
  }, [updateConfig, readOnly])

  const removeDependency = useCallback((name: string) => {
    if (readOnly) return
    updateConfig(prev => {
      const newDeps = { ...(prev.dependencies || {}) }
      delete newDeps[name]
      return { dependencies: newDeps }
    })
  }, [updateConfig, readOnly])

  const updateDependencyVersion = useCallback((name: string, newVersion: string) => {
    if (readOnly) return
    updateConfig(prev => ({
      dependencies: {
        ...(prev.dependencies || {}),
        [name]: newVersion
      }
    }))
  }, [updateConfig, readOnly])

  // Debounced package search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (depSearchQuery.trim().length < 2) {
      setDepSearchResults([])
      setShowDepDropdown(false)
      return
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearchingDeps(true)
      try {
        const results = await registryApi.searchPackages(depSearchQuery.trim(), 10)
        setDepSearchResults(results.packages.map(p => ({
          name: p.name,
          version: p.version,
          description: p.description
        })))
        setShowDepDropdown(true)
      } catch (err) {
        console.error('[PrompdJsonDesignView] Package search failed:', err)
        setDepSearchResults([])
      } finally {
        setIsSearchingDeps(false)
      }
    }, 300)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [depSearchQuery])

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDepDropdown(false)
      }
    }

    if (showDepDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDepDropdown])

  // Check MCP server configuration status when mcps array changes
  useEffect(() => {
    const mcps = config.mcps
    if (!mcps || mcps.length === 0) {
      setMcpServerStatuses({})
      return
    }

    if (!window.electronAPI?.isElectron) {
      // Can't check in browser mode — mark all as missing
      const statuses: Record<string, 'configured' | 'missing'> = {}
      for (const name of mcps) {
        statuses[name] = 'missing'
      }
      setMcpServerStatuses(statuses)
      return
    }

    window.electronAPI.mcp?.listServers().then(result => {
      if (!result.success || !result.servers) return
      const configuredNames = new Set(result.servers.map((s: { name: string }) => s.name))
      const statuses: Record<string, 'configured' | 'missing'> = {}
      for (const name of mcps) {
        statuses[name] = configuredNames.has(name) ? 'configured' : 'missing'
      }
      setMcpServerStatuses(statuses)
    }).catch(() => {
      // If MCP service isn't available, mark all as missing
      const statuses: Record<string, 'configured' | 'missing'> = {}
      for (const name of mcps) {
        statuses[name] = 'missing'
      }
      setMcpServerStatuses(statuses)
    })
  }, [config.mcps])

  // MCP server management callbacks
  const addMcpServer = useCallback((name: string) => {
    if (readOnly || !name.trim()) return
    const trimmed = name.trim()
    updateConfig(prev => {
      const current = prev.mcps || []
      if (current.includes(trimmed)) return {}
      return { mcps: [...current, trimmed] }
    })
    setMcpAddInput('')
  }, [updateConfig, readOnly])

  const removeMcpServer = useCallback((name: string) => {
    if (readOnly) return
    updateConfig(prev => ({
      mcps: (prev.mcps || []).filter(s => s !== name)
    }))
  }, [updateConfig, readOnly])

  // Show parse error if JSON is invalid
  if (parseError) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px',
        background: colors.bg,
        color: colors.text
      }}>
        <AlertCircle size={48} style={{ color: colors.error, marginBottom: '16px' }} />
        <h3 style={{ margin: '0 0 8px 0', fontSize: '18px' }}>Invalid JSON</h3>
        <p style={{ margin: 0, color: colors.textSecondary, textAlign: 'center', maxWidth: '400px' }}>
          {parseError}
        </p>
        <p style={{ margin: '16px 0 0', fontSize: '13px', color: colors.textMuted }}>
          Switch to Code view to fix the syntax error
        </p>
      </div>
    )
  }

  return (
    <div style={{
      height: '100%',
      overflow: 'auto',
      background: colors.bg,
      color: colors.text
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '32px 24px'
      }}>
        {/* Read-only banner */}
        {readOnly && (
          <div style={{
            padding: '12px 16px',
            background: colors.infoBg,
            border: `1px solid ${colors.infoBorder}`,
            borderRadius: '8px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <Info size={20} style={{ color: colors.primary, flexShrink: 0 }} />
            <span style={{ fontSize: '14px', color: colors.primary }}>
              This file is read-only. Switch to Code view to make changes.
            </span>
          </div>
        )}

        {/* Project Metadata Section */}
        <div style={{
          marginBottom: '24px',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '20px'
        }}>
          <h2 style={{
            margin: '0 0 20px 0',
            fontSize: '16px',
            fontWeight: 600,
            color: colors.text,
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <Sparkles size={16} style={{ color: colors.primary }} />
            Project Information
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Project Name */}
            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                color: colors.text,
                marginBottom: '8px'
              }}>
                Project Name
              </label>
              <input
                type="text"
                value={config.name || ''}
                onChange={(e) => updateConfig({ name: e.target.value })}
                placeholder="My Prompd Project"
                disabled={readOnly}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: colors.input,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '6px',
                  fontSize: '14px',
                  color: colors.text,
                  transition: 'border-color 0.2s',
                  boxSizing: 'border-box',
                  opacity: readOnly ? 0.7 : 1
                }}
                onFocus={(e) => !readOnly && (e.currentTarget.style.borderColor = colors.primary)}
                onBlur={(e) => (e.currentTarget.style.borderColor = colors.border)}
              />
            </div>

            {/* Description */}
            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                color: colors.text,
                marginBottom: '8px'
              }}>
                Description
              </label>
              <textarea
                value={config.description || ''}
                onChange={(e) => updateConfig({ description: e.target.value })}
                placeholder="A collection of AI prompts for..."
                rows={3}
                disabled={readOnly}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: colors.input,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '6px',
                  fontSize: '14px',
                  color: colors.text,
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.2s',
                  boxSizing: 'border-box',
                  opacity: readOnly ? 0.7 : 1
                }}
                onFocus={(e) => !readOnly && (e.currentTarget.style.borderColor = colors.primary)}
                onBlur={(e) => (e.currentTarget.style.borderColor = colors.border)}
              />
            </div>

            {/* Tags */}
            <div>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: colors.text,
                marginBottom: '8px'
              }}>
                <Tag size={14} style={{ color: colors.primary }} />
                Tags
                <span style={{ fontSize: '12px', fontWeight: 400, color: colors.textSecondary }}>
                  (for search and categorization)
                </span>
              </label>
              <TagInput
                tags={config.tags || []}
                onChange={(tags) => updateConfig({ tags })}
                placeholder="Add tags (press Enter or comma to add)"
                disabled={readOnly}
                theme={theme}
              />
            </div>

            {/* Version and Author row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: colors.text,
                  marginBottom: '8px'
                }}>
                  Version
                </label>
                <VersionInput
                  value={config.version || ''}
                  onChange={(v) => updateConfig({ version: v })}
                  placeholder="1.0.0"
                  compact
                  hideHelperText
                  colors={colors}
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: colors.text,
                  marginBottom: '8px'
                }}>
                  Author
                </label>
                <input
                  type="text"
                  value={config.author || ''}
                  onChange={(e) => updateConfig({ author: e.target.value })}
                  placeholder="Your Name"
                  disabled={readOnly}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: colors.input,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '6px',
                    fontSize: '13px',
                    color: colors.text,
                    transition: 'border-color 0.2s',
                    boxSizing: 'border-box',
                    opacity: readOnly ? 0.7 : 1
                  }}
                  onFocus={(e) => !readOnly && (e.currentTarget.style.borderColor = colors.primary)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = colors.border)}
                />
              </div>
            </div>

            {/* Package Type */}
            <div>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: colors.text,
                marginBottom: '8px'
              }}>
                <Plug size={14} style={{ color: colors.primary }} />
                Package Type
                <span style={{ fontSize: '12px', fontWeight: 400, color: colors.textSecondary }}>
                  (determines package capabilities)
                </span>
              </label>
              <div style={{ position: 'relative' }}>
                <select
                  value={config.type || 'package'}
                  onChange={(e) => updateConfig({ type: e.target.value as PrompdJsonConfig['type'] })}
                  disabled={readOnly}
                  style={{
                    width: '100%',
                    padding: '10px 36px 10px 12px',
                    background: colors.input,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '6px',
                    fontSize: '14px',
                    color: colors.text,
                    appearance: 'none',
                    cursor: readOnly ? 'not-allowed' : 'pointer',
                    opacity: readOnly ? 0.7 : 1
                  }}
                >
                  <option value="package">Package - Standard prompt package</option>
                  <option value="workflow">Workflow - Deployable workflow package</option>
                  <option value="skill">Skill - Requires MCP server connections</option>
                </select>
                <ChevronDown
                  size={16}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: colors.textMuted,
                    pointerEvents: 'none'
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Main Entry Point Section */}
        <div style={{
          marginBottom: '24px',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '20px'
        }}>
          <h2 style={{
            margin: '0 0 12px 0',
            fontSize: '16px',
            fontWeight: 600,
            color: colors.text,
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <FileText size={16} style={{ color: colors.primary }} />
            Main Entry Point
          </h2>
          <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: colors.textSecondary }}>
            The primary .prmd file that serves as the package's entry point
          </p>
          <div style={{ position: 'relative' }}>
            <select
              value={config.main || ''}
              onChange={(e) => updateConfig({ main: e.target.value || undefined })}
              disabled={readOnly}
              style={{
                width: '100%',
                padding: '10px 36px 10px 12px',
                background: colors.input,
                border: `1px solid ${colors.border}`,
                borderRadius: '6px',
                fontSize: '14px',
                color: config.main ? colors.text : colors.textMuted,
                fontFamily: 'Consolas, Monaco, monospace',
                appearance: 'none',
                cursor: readOnly ? 'not-allowed' : 'pointer',
                opacity: readOnly ? 0.7 : 1
              }}
            >
              <option value="">Select main .prmd file...</option>
              {prmdFiles.map((file) => (
                <option key={file} value={file}>{file}</option>
              ))}
              {config.main && !prmdFiles.includes(config.main) && (
                <option value={config.main}>{config.main} (custom)</option>
              )}
            </select>
            <ChevronDown
              size={16}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: colors.textMuted,
                pointerEvents: 'none'
              }}
            />
          </div>
          {prmdFiles.length === 0 && (
            <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: colors.textMuted }}>
              No .prmd files found in workspace
            </p>
          )}
        </div>

        {/* Package Files Section */}
        <div style={{
          marginBottom: '24px',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '20px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px'
          }}>
            <h2 style={{
              margin: 0,
              fontSize: '16px',
              fontWeight: 600,
              color: colors.text,
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <Files size={16} style={{ color: colors.primary }} />
              Package Files
            </h2>
            {!readOnly && allWorkspaceFiles.length > 0 && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={selectAllFiles}
                  style={{
                    padding: '6px 12px',
                    fontSize: '13px',
                    fontWeight: 500,
                    background: colors.bgSecondary,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    color: colors.text,
                    transition: 'all 0.2s'
                  }}
                >
                  Select All
                </button>
                <button
                  onClick={deselectAllFiles}
                  style={{
                    padding: '6px 12px',
                    fontSize: '13px',
                    fontWeight: 500,
                    background: colors.bgSecondary,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    color: colors.text,
                    transition: 'all 0.2s'
                  }}
                >
                  Deselect All
                </button>
              </div>
            )}
          </div>
          <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: colors.textSecondary }}>
            {selectedFileCount === 0
              ? 'If none selected, all supported files (except ignored) will be included'
              : `${selectedFileCount} file${selectedFileCount !== 1 ? 's' : ''} selected - only these will be included`
            }
          </p>

          {/* File list with checkboxes */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            maxHeight: '300px',
            overflowY: 'auto',
            padding: '8px',
            background: colors.bgSecondary,
            border: `1px solid ${colors.border}`,
            borderRadius: '6px'
          }}>
            {allWorkspaceFiles.length === 0 ? (
              <div style={{
                padding: '24px',
                textAlign: 'center',
                color: colors.textMuted,
                fontSize: '14px'
              }}>
                No files found in workspace
              </div>
            ) : (
              allWorkspaceFiles.map((filePath) => {
                const isSelected = isFileSelected(filePath)
                const isPrmd = filePath.endsWith('.prmd')
                return (
                  <label
                    key={filePath}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 10px',
                      borderRadius: '4px',
                      cursor: readOnly ? 'not-allowed' : 'pointer',
                      background: isSelected ? colors.hover : 'transparent',
                      transition: 'background 0.15s',
                      opacity: readOnly ? 0.7 : 1
                    }}
                    onMouseEnter={(e) => !readOnly && (e.currentTarget.style.background = colors.hover)}
                    onMouseLeave={(e) => !readOnly && (e.currentTarget.style.background = isSelected ? colors.hover : 'transparent')}
                  >
                    <button
                      onClick={() => toggleFileInPackage(filePath)}
                      disabled={readOnly}
                      style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '4px',
                        border: `1px solid ${isSelected ? colors.primary : colors.border}`,
                        background: isSelected ? colors.primary : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: readOnly ? 'not-allowed' : 'pointer',
                        padding: 0,
                        flexShrink: 0
                      }}
                    >
                      {isSelected && <Check size={12} style={{ color: 'white' }} />}
                    </button>
                    <span style={{
                      flex: 1,
                      fontSize: '13px',
                      fontFamily: 'Consolas, Monaco, monospace',
                      color: isPrmd ? colors.accent : colors.text,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {filePath}
                    </span>
                    {isPrmd && (
                      <span style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        background: colors.infoBg,
                        border: `1px solid ${colors.infoBorder}`,
                        borderRadius: '4px',
                        color: colors.primary,
                        flexShrink: 0
                      }}>
                        prmd
                      </span>
                    )}
                  </label>
                )
              })
            )}
          </div>

          {/* Missing files warning - files in config but not in workspace */}
          {missingFiles.length > 0 && (
            <div style={{
              marginTop: '12px',
              padding: '12px',
              background: colors.errorBg,
              border: `1px solid ${colors.errorBorder}`,
              borderRadius: '6px'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '8px',
                fontSize: '13px',
                fontWeight: 600,
                color: colors.error
              }}>
                <AlertTriangle size={16} />
                {missingFiles.length} missing file{missingFiles.length !== 1 ? 's' : ''}
              </div>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
              }}>
                {missingFiles.map((filePath) => (
                  <div
                    key={filePath}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                      padding: '6px 10px',
                      background: 'rgba(239, 68, 68, 0.1)',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontFamily: 'Consolas, Monaco, monospace'
                    }}
                  >
                    <span style={{ color: colors.error, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {filePath}
                    </span>
                    {!readOnly && (
                      <button
                        onClick={() => toggleFileInPackage(filePath)}
                        style={{
                          padding: '2px 8px',
                          fontSize: '11px',
                          background: 'transparent',
                          border: `1px solid ${colors.error}`,
                          borderRadius: '4px',
                          color: colors.error,
                          cursor: 'pointer',
                          flexShrink: 0
                        }}
                        title="Remove from package files"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Selected files summary */}
          {selectedFileCount > 0 && missingFiles.length === 0 && (
            <div style={{
              marginTop: '12px',
              padding: '10px 12px',
              background: colors.successBg,
              border: `1px solid ${colors.successBorder}`,
              borderRadius: '6px',
              fontSize: '13px',
              color: colors.success
            }}>
              {selectedFileCount} file{selectedFileCount !== 1 ? 's' : ''} will be included in the package
            </div>
          )}

        </div>

        {/* Ignore Patterns Section */}
        <div style={{
          marginBottom: '24px',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '20px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px'
          }}>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: colors.text, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <EyeOff size={16} style={{ color: colors.primary }} />
              Ignore Patterns
            </h2>
            {!readOnly && (
              <button
                onClick={addCommonPatterns}
                disabled={DEFAULT_IGNORE_PATTERNS.every(p => (config.ignore || []).includes(p))}
                style={{
                  padding: '6px 12px',
                  fontSize: '13px',
                  fontWeight: 500,
                  background: colors.bgSecondary,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '6px',
                  cursor: DEFAULT_IGNORE_PATTERNS.every(p => (config.ignore || []).includes(p)) ? 'not-allowed' : 'pointer',
                  opacity: DEFAULT_IGNORE_PATTERNS.every(p => (config.ignore || []).includes(p)) ? 0.5 : 1,
                  color: colors.text,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s'
                }}
              >
                <Plus size={14} />
                Add Common Patterns
              </button>
            )}
          </div>
          <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: colors.textSecondary }}>
            Files and folders matching these patterns will be hidden in the explorer
          </p>

          {/* Add new pattern - moved above the list */}
          {!readOnly && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input
                type="text"
                value={newIgnorePattern}
                onChange={(e) => setNewIgnorePattern(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addIgnorePattern()
                  }
                }}
                placeholder="e.g., *.log or tests/**"
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  background: colors.input,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '6px',
                  fontSize: '14px',
                  color: colors.text,
                  fontFamily: 'monospace',
                  transition: 'border-color 0.2s',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = colors.primary)}
                onBlur={(e) => (e.currentTarget.style.borderColor = colors.border)}
              />
              <button
                onClick={addIgnorePattern}
                disabled={!newIgnorePattern.trim()}
                style={{
                  padding: '8px 16px',
                  background: colors.bgSecondary,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '6px',
                  cursor: !newIgnorePattern.trim() ? 'not-allowed' : 'pointer',
                  opacity: !newIgnorePattern.trim() ? 0.5 : 1,
                  fontSize: '14px',
                  color: colors.text,
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s'
                }}
              >
                <Plus size={16} />
                Add
              </button>
            </div>
          )}

          {/* Pattern list */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            maxHeight: '300px',
            overflowY: 'auto',
            marginBottom: '16px'
          }}>
            {(config.ignore || []).map((pattern, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  background: colors.bgSecondary,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '6px',
                  transition: 'border-color 0.2s'
                }}
              >
                <code style={{
                  flex: 1,
                  fontFamily: 'Consolas, Monaco, monospace',
                  fontSize: '13px',
                  color: colors.accent
                }}>
                  {pattern}
                </code>
                {!readOnly && (
                  <button
                    onClick={() => removeIgnorePattern(index)}
                    title="Remove pattern"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: colors.textMuted,
                      cursor: 'pointer',
                      padding: '4px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = colors.hover
                      e.currentTarget.style.color = colors.error
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = colors.textMuted
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}

            {(config.ignore || []).length === 0 && (
              <div style={{
                padding: '32px',
                textAlign: 'center',
                color: colors.textMuted,
                fontSize: '14px',
                background: colors.bgSecondary,
                border: `1px dashed ${colors.border}`,
                borderRadius: '6px'
              }}>
                No ignore patterns defined
              </div>
            )}
          </div>

          {/* Pattern examples */}
          <div style={{
            padding: '12px',
            background: colors.bgSecondary,
            border: `1px solid ${colors.border}`,
            borderRadius: '6px',
            fontSize: '13px'
          }}>
            <strong style={{ display: 'block', marginBottom: '8px', color: colors.text }}>Examples:</strong>
            <ul style={{ margin: 0, paddingLeft: '20px', color: colors.textMuted }}>
              <li style={{ margin: '4px 0' }}>
                <code style={{
                  fontFamily: 'Consolas, Monaco, monospace',
                  color: colors.accent,
                  background: colors.bgTertiary,
                  padding: '2px 6px',
                  borderRadius: '3px'
                }}>
                  *.log
                </code> - All .log files
              </li>
              <li style={{ margin: '4px 0' }}>
                <code style={{
                  fontFamily: 'Consolas, Monaco, monospace',
                  color: colors.accent,
                  background: colors.bgTertiary,
                  padding: '2px 6px',
                  borderRadius: '3px'
                }}>
                  node_modules/**
                </code> - All files in node_modules
              </li>
              <li style={{ margin: '4px 0' }}>
                <code style={{
                  fontFamily: 'Consolas, Monaco, monospace',
                  color: colors.accent,
                  background: colors.bgTertiary,
                  padding: '2px 6px',
                  borderRadius: '3px'
                }}>
                  .env*
                </code> - Environment files
              </li>
            </ul>
          </div>
        </div>

        {/* Dependencies Section */}
        <div style={{
          marginBottom: '24px',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '20px'
        }}>
          <h2 style={{
            margin: '0 0 12px 0',
            fontSize: '16px',
            fontWeight: 600,
            color: colors.text,
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <Package size={16} style={{ color: colors.primary }} />
            Dependencies
          </h2>
          <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: colors.textSecondary }}>
            Packages this project depends on from the registry
          </p>

          {/* Add dependency search - moved above the list */}
          {!readOnly && (
            <div ref={dropdownRef} style={{ position: 'relative', marginBottom: '16px' }}>
              <div style={{ position: 'relative' }}>
                <Search
                  size={16}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: colors.textMuted,
                    pointerEvents: 'none'
                  }}
                />
                <input
                  type="text"
                  value={depSearchQuery}
                  onChange={(e) => setDepSearchQuery(e.target.value)}
                  placeholder="Search packages to add as dependency..."
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 40px',
                    background: colors.input,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '6px',
                    fontSize: '14px',
                    color: colors.text,
                    transition: 'border-color 0.2s',
                    boxSizing: 'border-box'
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = colors.primary)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = colors.border)}
                />
                {isSearchingDeps && (
                  <span style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '12px',
                    color: colors.textMuted
                  }}>
                    Searching...
                  </span>
                )}
              </div>

              {/* Search results dropdown */}
              {showDepDropdown && depSearchResults.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: '4px',
                  background: colors.bgSecondary,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '6px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                  maxHeight: '250px',
                  overflowY: 'auto',
                  zIndex: 1000
                }}>
                  {depSearchResults.map((pkg, index) => (
                    <button
                      key={`${pkg.name}-${index}`}
                      onClick={() => addDependency(pkg.name, pkg.version)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: index < depSearchResults.length - 1 ? `1px solid ${colors.border}` : 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        color: colors.text,
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = colors.hover)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Package size={14} style={{ color: colors.accent }} />
                        <span style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 500 }}>
                          {pkg.name}
                        </span>
                        <span style={{ fontSize: '12px', color: colors.textMuted }}>
                          @{pkg.version}
                        </span>
                      </div>
                      {pkg.description && (
                        <span style={{
                          fontSize: '12px',
                          color: colors.textSecondary,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          paddingLeft: '22px'
                        }}>
                          {pkg.description}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* No results message */}
              {showDepDropdown && depSearchQuery.length >= 2 && depSearchResults.length === 0 && !isSearchingDeps && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: '4px',
                  padding: '16px',
                  background: colors.bgSecondary,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '6px',
                  textAlign: 'center',
                  color: colors.textMuted,
                  fontSize: '13px',
                  zIndex: 1000
                }}>
                  No packages found for "{depSearchQuery}"
                </div>
              )}
            </div>
          )}

          {/* Dependency list */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            {Object.entries(config.dependencies || {}).map(([name, version]) => (
              <div
                key={name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  background: colors.bgSecondary,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '6px',
                  gap: '12px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                  <Package size={14} style={{ color: colors.accent, flexShrink: 0 }} />
                  <code style={{
                    fontFamily: 'Consolas, Monaco, monospace',
                    fontSize: '13px',
                    color: colors.text,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {name}
                  </code>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  {readOnly ? (
                    <span style={{
                      fontSize: '12px',
                      color: colors.textMuted,
                      fontFamily: 'monospace'
                    }}>
                      @{version}
                    </span>
                  ) : (
                    <div style={{ width: '100px' }}>
                      <DependencyVersionSelect
                        packageName={name}
                        value={version}
                        onChange={(newVersion) => updateDependencyVersion(name, newVersion)}
                        compact={true}
                        colors={colors}
                      />
                    </div>
                  )}
                  {!readOnly && (
                    <button
                      onClick={() => removeDependency(name)}
                      title="Remove dependency"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: colors.textMuted,
                        cursor: 'pointer',
                        padding: '4px',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = colors.hover
                        e.currentTarget.style.color = colors.error
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.color = colors.textMuted
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {Object.keys(config.dependencies || {}).length === 0 && (
              <div style={{
                padding: '32px',
                textAlign: 'center',
                color: colors.textMuted,
                fontSize: '14px',
                background: colors.bgSecondary,
                border: `1px dashed ${colors.border}`,
                borderRadius: '6px'
              }}>
                No dependencies defined
              </div>
            )}
          </div>
        </div>

        {/* MCP Servers Section */}
        <div style={{
          marginBottom: '24px',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '20px'
        }}>
          <h2 style={{
            margin: '0 0 12px 0',
            fontSize: '16px',
            fontWeight: 600,
            color: colors.text,
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <Server size={16} style={{ color: colors.primary }} />
            MCP Servers
            {config.type === 'skill' && (
              <span style={{
                fontSize: '11px',
                fontWeight: 500,
                color: colors.primary,
                background: colors.infoBg,
                border: `1px solid ${colors.infoBorder}`,
                padding: '2px 8px',
                borderRadius: '10px'
              }}>
                Required for Skills
              </span>
            )}
          </h2>
          <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: colors.textSecondary }}>
            MCP (Model Context Protocol) servers this package requires for tool access
          </p>

          {/* Add MCP server input */}
          {!readOnly && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input
                type="text"
                value={mcpAddInput}
                onChange={(e) => setMcpAddInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addMcpServer(mcpAddInput)
                  }
                }}
                placeholder="Enter MCP server name (e.g., google-gmail, slack)..."
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  background: colors.input,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '6px',
                  fontSize: '14px',
                  color: colors.text,
                  transition: 'border-color 0.2s',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = colors.primary)}
                onBlur={(e) => (e.currentTarget.style.borderColor = colors.border)}
              />
              <button
                onClick={() => addMcpServer(mcpAddInput)}
                disabled={!mcpAddInput.trim()}
                style={{
                  padding: '10px 16px',
                  background: mcpAddInput.trim() ? colors.primary : colors.bgTertiary,
                  color: mcpAddInput.trim() ? '#fff' : colors.textMuted,
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: mcpAddInput.trim() ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s'
                }}
              >
                <Plus size={16} />
                Add
              </button>
            </div>
          )}

          {/* MCP server list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {(config.mcps || []).map((serverName) => {
              const status = mcpServerStatuses[serverName] || 'missing'
              const isConfigured = status === 'configured'
              return (
                <div
                  key={serverName}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    background: colors.bgSecondary,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '6px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <Server size={14} style={{ color: colors.textMuted, flexShrink: 0 }} />
                    <code style={{
                      fontFamily: 'Consolas, Monaco, monospace',
                      fontSize: '13px',
                      color: colors.text,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {serverName}
                    </code>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 500,
                      color: isConfigured ? colors.success : '#f59e0b',
                      background: isConfigured
                        ? colors.successBg
                        : (theme === 'dark' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.1)'),
                      border: `1px solid ${isConfigured
                        ? colors.successBorder
                        : (theme === 'dark' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(245, 158, 11, 0.3)')}`,
                      padding: '2px 8px',
                      borderRadius: '10px',
                      flexShrink: 0
                    }}>
                      {isConfigured ? 'Configured' : 'Not configured'}
                    </span>
                  </div>
                  {!readOnly && (
                    <button
                      onClick={() => removeMcpServer(serverName)}
                      title="Remove MCP server"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: colors.textMuted,
                        cursor: 'pointer',
                        padding: '4px',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        transition: 'all 0.2s',
                        flexShrink: 0
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = colors.hover
                        e.currentTarget.style.color = colors.error
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.color = colors.textMuted
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              )
            })}

            {(!config.mcps || config.mcps.length === 0) && (
              <div style={{
                padding: '32px',
                textAlign: 'center',
                color: colors.textMuted,
                fontSize: '14px',
                background: colors.bgSecondary,
                border: `1px dashed ${colors.border}`,
                borderRadius: '6px'
              }}>
                No MCP servers declared
              </div>
            )}
          </div>
        </div>

        {/* README Section */}
        <div style={{
          marginBottom: '24px',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '20px'
        }}>
          <h2 style={{
            margin: '0 0 12px 0',
            fontSize: '16px',
            fontWeight: 600,
            color: colors.text,
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <BookOpen size={16} style={{ color: colors.primary }} />
            README
          </h2>
          <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: colors.textSecondary }}>
            Path to README file (relative to project root) shown on the registry
          </p>
          <div style={{ position: 'relative' }}>
            <select
              value={config.readme || ''}
              onChange={(e) => updateConfig({ readme: e.target.value })}
              disabled={readOnly}
              style={{
                width: '100%',
                padding: '10px 36px 10px 12px',
                background: colors.input,
                border: `1px solid ${colors.border}`,
                borderRadius: '6px',
                fontSize: '14px',
                color: config.readme ? colors.text : colors.textMuted,
                fontFamily: 'Consolas, Monaco, monospace',
                appearance: 'none',
                cursor: readOnly ? 'not-allowed' : 'pointer',
                opacity: readOnly ? 0.7 : 1
              }}
            >
              <option value="">Select a README file...</option>
              {markdownFiles.map((file) => (
                <option key={file} value={file}>{file}</option>
              ))}
              {config.readme && !markdownFiles.includes(config.readme) && (
                <option value={config.readme}>{config.readme} (custom)</option>
              )}
            </select>
            <ChevronDown
              size={16}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: colors.textMuted,
                pointerEvents: 'none'
              }}
            />
          </div>
          {markdownFiles.length === 0 && (
            <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: colors.textMuted }}>
              No markdown files found in workspace. Type a path manually in Code view.
            </p>
          )}
        </div>

        {/* Registry Configuration Section */}
        <div style={{
          marginBottom: '24px',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '20px'
        }}>
          <h2 style={{
            margin: '0 0 12px 0',
            fontSize: '16px',
            fontWeight: 600,
            color: colors.text,
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <Globe size={16} style={{ color: colors.primary }} />
            Registry
          </h2>
          <div>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: 500,
              color: colors.text,
              marginBottom: '8px'
            }}>
              Default Registry URL
            </label>
            <input
              type="text"
              value={config.registry || ''}
              onChange={(e) => updateConfig({ registry: e.target.value })}
              placeholder="https://registry.prompdhub.ai"
              disabled={readOnly}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: colors.input,
                border: `1px solid ${colors.border}`,
                borderRadius: '6px',
                fontSize: '14px',
                color: colors.text,
                fontFamily: 'monospace',
                transition: 'border-color 0.2s',
                boxSizing: 'border-box',
                opacity: readOnly ? 0.7 : 1
              }}
              onFocus={(e) => !readOnly && (e.currentTarget.style.borderColor = colors.primary)}
              onBlur={(e) => (e.currentTarget.style.borderColor = colors.border)}
            />
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: colors.textMuted }}>
              Leave empty to use the default registry
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

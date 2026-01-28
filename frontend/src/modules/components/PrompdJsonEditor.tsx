import { useState, useEffect, useCallback } from 'react'
import { X, Plus, Trash2, AlertCircle, CheckCircle, FileJson, Code, Search, Package, Loader } from 'lucide-react'
import { registryApi, type SearchResult } from '../services/registryApi'

interface PrompdJsonConfig {
  name?: string
  description?: string
  author?: string
  version?: string
  ignore?: string[]
  dependencies?: Record<string, string>
  registry?: string
  [key: string]: unknown
}

interface Props {
  isOpen: boolean
  workspacePath: string | null
  onClose: () => void
  onSave?: (config: PrompdJsonConfig) => void
  onViewCode?: () => void
  theme?: 'light' | 'dark'
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

export default function PrompdJsonEditor({ isOpen, workspacePath, onClose, onSave, onViewCode, theme = 'dark' }: Props) {
  const [config, setConfig] = useState<PrompdJsonConfig>({
    ignore: []
  })
  const [newIgnorePattern, setNewIgnorePattern] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exists, setExists] = useState(false)

  // Dependencies state
  const [depSearchQuery, setDepSearchQuery] = useState('')
  const [depSearchResults, setDepSearchResults] = useState<SearchResult['packages']>([])
  const [depSearching, setDepSearching] = useState(false)
  const [depSearchDebounce, setDepSearchDebounce] = useState<NodeJS.Timeout | null>(null)

  // Theme-aware colors (matching SettingsModal)
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
    successBg: theme === 'dark' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.1)',
    successBorder: theme === 'dark' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.3)',
    error: '#ef4444',
    errorBg: theme === 'dark' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.1)',
    errorBorder: theme === 'dark' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.3)',
    infoBg: theme === 'dark' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.1)',
    infoBorder: theme === 'dark' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.3)',
    accent: '#3b82f6'
  }

  // Load existing prompd.json or create default
  // Reload when modal opens or workspace changes
  useEffect(() => {
    if (isOpen) {
      // Reset state and reload
      setLoading(true)
      setError(null)
      loadConfig()
    }
  }, [workspacePath, isOpen])

  const loadConfig = async () => {
    if (!workspacePath) {
      setLoading(false)
      return
    }

    try {
      const electronAPI = (window as any).electronAPI
      if (!electronAPI?.readFile) {
        setError('File system access not available')
        setLoading(false)
        return
      }

      const configPath = `${workspacePath}/prompd.json`
      const result = await electronAPI.readFile(configPath)

      if (result.success) {
        const parsed = JSON.parse(result.content)
        console.log('[PrompdJsonEditor] Loaded config:', parsed)
        setConfig(parsed)
        setExists(true)
      } else {
        // File doesn't exist - use defaults
        setConfig({
          name: workspacePath.split(/[\\/]/).pop() || 'My Project',
          version: '1.0.0',
          ignore: []
        })
        setExists(false)
      }
    } catch (err) {
      console.error('Failed to load prompd.json:', err)
      setError('Failed to load configuration')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!workspacePath) return

    setSaving(true)
    setError(null)

    try {
      const electronAPI = (window as any).electronAPI
      if (!electronAPI?.writeFile) {
        throw new Error('File system access not available')
      }

      const configPath = `${workspacePath}/prompd.json`
      const content = JSON.stringify(config, null, 2)

      const result = await electronAPI.writeFile(configPath, content)

      if (!result.success) {
        throw new Error(result.error || 'Failed to write file')
      }

      onSave?.(config)
      onClose()
    } catch (err) {
      console.error('Failed to save prompd.json:', err)
      setError(err instanceof Error ? err.message : 'Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  const addIgnorePattern = () => {
    if (!newIgnorePattern.trim()) return

    setConfig(prev => ({
      ...prev,
      ignore: [...(prev.ignore || []), newIgnorePattern.trim()]
    }))
    setNewIgnorePattern('')
  }

  const removeIgnorePattern = (index: number) => {
    setConfig(prev => ({
      ...prev,
      ignore: (prev.ignore || []).filter((_, i) => i !== index)
    }))
  }

  const addCommonPatterns = () => {
    const currentPatterns = new Set(config.ignore || [])
    const newPatterns = DEFAULT_IGNORE_PATTERNS.filter(p => !currentPatterns.has(p))

    if (newPatterns.length > 0) {
      setConfig(prev => ({
        ...prev,
        ignore: [...(prev.ignore || []), ...newPatterns]
      }))
    }
  }

  // Dependency search with debounce
  const handleDepSearch = useCallback((query: string) => {
    setDepSearchQuery(query)

    // Clear previous debounce
    if (depSearchDebounce) {
      clearTimeout(depSearchDebounce)
    }

    if (!query.trim()) {
      setDepSearchResults([])
      setDepSearching(false)
      return
    }

    setDepSearching(true)
    const timeout = setTimeout(async () => {
      try {
        const result = await registryApi.searchPackages(query.trim(), 8)
        setDepSearchResults(result.packages || [])
      } catch (err) {
        console.error('Package search failed:', err)
        setDepSearchResults([])
      } finally {
        setDepSearching(false)
      }
    }, 300)

    setDepSearchDebounce(timeout)
  }, [depSearchDebounce])

  const addDependency = (packageName: string, version: string) => {
    setConfig(prev => ({
      ...prev,
      dependencies: {
        ...(prev.dependencies || {}),
        [packageName]: version
      }
    }))
    setDepSearchQuery('')
    setDepSearchResults([])
  }

  const removeDependency = (packageName: string) => {
    setConfig(prev => {
      const newDeps = { ...(prev.dependencies || {}) }
      delete newDeps[packageName]
      return {
        ...prev,
        dependencies: Object.keys(newDeps).length > 0 ? newDeps : undefined
      }
    })
  }

  if (!isOpen) return null

  if (loading) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          backdropFilter: 'blur(4px)'
        }}
        onClick={onClose}
      >
        <div
          style={{
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            borderRadius: '12px',
            width: '90%',
            maxWidth: '700px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: theme === 'dark' ? '0 20px 60px rgba(0, 0, 0, 0.6)' : '0 20px 60px rgba(0, 0, 0, 0.15)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              padding: '20px 24px',
              borderBottom: `1px solid ${colors.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <FileJson size={20} style={{ color: colors.accent }} />
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: colors.text }}>
                Loading Configuration...
              </h2>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        backdropFilter: 'blur(4px)'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          borderRadius: '12px',
          width: '90%',
          maxWidth: '700px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: theme === 'dark' ? '0 20px 60px rgba(0, 0, 0, 0.6)' : '0 20px 60px rgba(0, 0, 0, 0.15)',
          transition: 'all 0.2s ease'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: `1px solid ${colors.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <FileJson size={20} style={{ color: colors.accent }} />
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: colors.text }}>
              {exists ? 'Edit' : 'Create'} prompd.json
            </h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {onViewCode && (
              <button
                onClick={() => {
                  onViewCode()
                  onClose()
                }}
                style={{
                  background: colors.bgSecondary,
                  border: `1px solid ${colors.border}`,
                  color: colors.text,
                  cursor: 'pointer',
                  padding: '6px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = colors.hover
                  e.currentTarget.style.borderColor = colors.primary
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = colors.bgSecondary
                  e.currentTarget.style.borderColor = colors.border
                }}
              >
                <Code size={16} />
                View Code
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: colors.textSecondary,
                cursor: 'pointer',
                padding: '8px',
                display: 'flex',
                alignItems: 'center',
                borderRadius: '6px',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = colors.hover
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '24px'
          }}
        >
          {/* Error Banner */}
          {error && (
            <div
              style={{
                padding: '12px 16px',
                background: colors.errorBg,
                border: `1px solid ${colors.errorBorder}`,
                borderRadius: '8px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}
            >
              <AlertCircle size={20} style={{ color: colors.error, flexShrink: 0 }} />
              <span style={{ fontSize: '14px', color: colors.error }}>{error}</span>
            </div>
          )}

          {/* Info Banner */}
          {!exists && (
            <div
              style={{
                padding: '12px 16px',
                background: colors.successBg,
                border: `1px solid ${colors.successBorder}`,
                borderRadius: '8px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}
            >
              <CheckCircle size={20} style={{ color: colors.success, flexShrink: 0 }} />
              <span style={{ fontSize: '14px', color: colors.success }}>
                Creating new prompd.json configuration file
              </span>
            </div>
          )}

          {/* Project Metadata */}
          <div style={{ marginBottom: '32px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600, color: colors.text }}>
              Project Information
            </h3>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: colors.text, marginBottom: '8px' }}>
                Project Name
              </label>
              <input
                type="text"
                value={config.name || ''}
                onChange={(e) => setConfig(prev => ({ ...prev, name: e.target.value }))}
                placeholder="My Prompd Project"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: colors.input,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '6px',
                  fontSize: '14px',
                  color: colors.text,
                  transition: 'all 0.2s ease',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = colors.primary)}
                onBlur={(e) => (e.currentTarget.style.borderColor = colors.border)}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: colors.text, marginBottom: '8px' }}>
                Description
              </label>
              <textarea
                value={config.description || ''}
                onChange={(e) => setConfig(prev => ({ ...prev, description: e.target.value }))}
                placeholder="A collection of AI prompts for..."
                rows={3}
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
                  transition: 'all 0.2s ease',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = colors.primary)}
                onBlur={(e) => (e.currentTarget.style.borderColor = colors.border)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: colors.text, marginBottom: '8px' }}>
                  Version
                </label>
                <input
                  type="text"
                  value={config.version || ''}
                  onChange={(e) => setConfig(prev => ({ ...prev, version: e.target.value }))}
                  placeholder="1.0.0"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: colors.input,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '6px',
                    fontSize: '14px',
                    color: colors.text,
                    fontFamily: 'monospace',
                    transition: 'all 0.2s ease',
                    boxSizing: 'border-box'
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = colors.primary)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = colors.border)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: colors.text, marginBottom: '8px' }}>
                  Author
                </label>
                <input
                  type="text"
                  value={config.author || ''}
                  onChange={(e) => setConfig(prev => ({ ...prev, author: e.target.value }))}
                  placeholder="Your Name"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: colors.input,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '6px',
                    fontSize: '14px',
                    color: colors.text,
                    transition: 'all 0.2s ease',
                    boxSizing: 'border-box'
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = colors.primary)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = colors.border)}
                />
              </div>
            </div>
          </div>

          {/* Dependencies */}
          <div style={{ marginBottom: '32px' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 600, color: colors.text }}>
              Dependencies
            </h3>
            <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: colors.textSecondary }}>
              Packages from the registry that this project depends on
            </p>

            {/* Search input - INPUT FIRST */}
            <div style={{ position: 'relative', marginBottom: '12px' }}>
              <div style={{ position: 'relative' }}>
                <Search size={16} style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: colors.textMuted
                }} />
                <input
                  type="text"
                  value={depSearchQuery}
                  onChange={(e) => handleDepSearch(e.target.value)}
                  placeholder="Search packages..."
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 36px',
                    background: colors.input,
                    border: `1px solid ${colors.border}`,
                    borderRadius: '6px',
                    fontSize: '14px',
                    color: colors.text,
                    transition: 'all 0.2s ease',
                    boxSizing: 'border-box'
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = colors.primary)}
                  onBlur={(e) => {
                    // Delay to allow click on search results
                    setTimeout(() => {
                      e.target.style.borderColor = colors.border
                    }, 200)
                  }}
                />
                {depSearching && (
                  <Loader size={16} style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: colors.primary,
                    animation: 'spin 1s linear infinite'
                  }} />
                )}
              </div>

              {/* Search results dropdown */}
              {depSearchResults.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: colors.bg,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '6px',
                  marginTop: '4px',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  zIndex: 100,
                  boxShadow: theme === 'dark' ? '0 8px 24px rgba(0,0,0,0.4)' : '0 8px 24px rgba(0,0,0,0.1)'
                }}>
                  {depSearchResults.map((pkg) => {
                    const isAdded = !!(config.dependencies && config.dependencies[pkg.name])
                    return (
                      <button
                        key={pkg.name}
                        onClick={() => !isAdded && addDependency(pkg.name, pkg.version || 'latest')}
                        disabled={isAdded}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          background: 'transparent',
                          border: 'none',
                          borderBottom: `1px solid ${colors.border}`,
                          textAlign: 'left',
                          cursor: isAdded ? 'default' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          transition: 'background 0.2s',
                          opacity: isAdded ? 0.5 : 1
                        }}
                        onMouseEnter={(e) => {
                          if (!isAdded) e.currentTarget.style.background = colors.hover
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent'
                        }}
                      >
                        <Package size={16} style={{ color: colors.accent, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '14px', fontWeight: 500, color: colors.text }}>
                            {pkg.name}
                          </div>
                          {pkg.description && (
                            <div style={{
                              fontSize: '12px',
                              color: colors.textMuted,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}>
                              {pkg.description}
                            </div>
                          )}
                        </div>
                        <span style={{
                          fontSize: '12px',
                          color: colors.textSecondary,
                          fontFamily: 'monospace',
                          flexShrink: 0
                        }}>
                          {isAdded ? 'Added' : pkg.version || 'latest'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Dependencies list - BELOW SEARCH */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
              {!config.dependencies || Object.keys(config.dependencies).length === 0 ? (
                <div
                  style={{
                    padding: '24px',
                    textAlign: 'center',
                    color: colors.textMuted,
                    fontSize: '13px',
                    background: colors.bgSecondary,
                    border: `1px dashed ${colors.border}`,
                    borderRadius: '6px'
                  }}
                >
                  No dependencies added. Search above to add packages.
                </div>
              ) : (
                Object.entries(config.dependencies).map(([name, version]) => (
                  <div
                    key={name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: colors.bgSecondary,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '6px',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = colors.accent
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = colors.border
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                      <Package size={14} style={{ color: colors.accent }} />
                      <code style={{ fontFamily: 'Consolas, Monaco, Courier New, monospace', fontSize: '13px', color: colors.text }}>
                        {name}
                      </code>
                      <span style={{ fontSize: '12px', color: colors.textMuted, fontFamily: 'monospace' }}>
                        @{version}
                      </span>
                    </div>
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
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Ignore Patterns */}
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: colors.text }}>
                Ignore Patterns
              </h3>
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
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  if (!DEFAULT_IGNORE_PATTERNS.every(p => (config.ignore || []).includes(p))) {
                    e.currentTarget.style.borderColor = colors.primary
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = colors.border
                }}
              >
                <Plus size={14} />
                Add Common
              </button>
            </div>
            <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: colors.textSecondary }}>
              Files and folders matching these patterns will be excluded from packages
            </p>

            {/* Add new pattern - INPUT FIRST */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
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
                placeholder="e.g., *.log, tests/**, .env*"
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  background: colors.input,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '6px',
                  fontSize: '14px',
                  color: colors.text,
                  fontFamily: 'monospace',
                  transition: 'all 0.2s ease',
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
                  background: newIgnorePattern.trim() ? colors.primary : colors.bgSecondary,
                  border: `1px solid ${newIgnorePattern.trim() ? colors.primary : colors.border}`,
                  borderRadius: '6px',
                  cursor: !newIgnorePattern.trim() ? 'not-allowed' : 'pointer',
                  opacity: !newIgnorePattern.trim() ? 0.5 : 1,
                  fontSize: '14px',
                  color: newIgnorePattern.trim() ? 'white' : colors.text,
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  if (newIgnorePattern.trim()) {
                    e.currentTarget.style.background = colors.primaryHover
                  }
                }}
                onMouseLeave={(e) => {
                  if (newIgnorePattern.trim()) {
                    e.currentTarget.style.background = colors.primary
                  }
                }}
              >
                <Plus size={16} />
                Add
              </button>
            </div>

            {/* Pattern list - BELOW INPUT */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
              {(config.ignore || []).length === 0 ? (
                <div
                  style={{
                    padding: '24px',
                    textAlign: 'center',
                    color: colors.textMuted,
                    fontSize: '13px',
                    background: colors.bgSecondary,
                    border: `1px dashed ${colors.border}`,
                    borderRadius: '6px'
                  }}
                >
                  No ignore patterns defined. Click "Add Common" for defaults.
                </div>
              ) : (
                (config.ignore || []).map((pattern, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: colors.bgSecondary,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '6px',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = colors.accent
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = colors.border
                    }}
                  >
                    <code style={{ flex: 1, fontFamily: 'Consolas, Monaco, Courier New, monospace', fontSize: '13px', color: colors.accent }}>
                      {pattern}
                    </code>
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
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Registry Configuration */}
          <div>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600, color: colors.text }}>
              Registry
            </h3>
            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: colors.text, marginBottom: '8px' }}>
                Default Registry URL
              </label>
              <input
                type="text"
                value={config.registry || ''}
                onChange={(e) => setConfig(prev => ({ ...prev, registry: e.target.value }))}
                placeholder="https://registry.prompdhub.ai"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: colors.input,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '6px',
                  fontSize: '14px',
                  color: colors.text,
                  fontFamily: 'monospace',
                  transition: 'all 0.2s ease',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = colors.primary)}
                onBlur={(e) => (e.currentTarget.style.borderColor = colors.border)}
              />
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: colors.textMuted }}>
                Leave empty to use default registry
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '12px',
            padding: '16px 24px',
            borderTop: `1px solid ${colors.border}`
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: colors.bgSecondary,
              border: `1px solid ${colors.border}`,
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              color: colors.text,
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = colors.hover
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = colors.bgSecondary
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !config.name?.trim()}
            style={{
              padding: '8px 16px',
              background: saving || !config.name?.trim() ? colors.bgTertiary : colors.primary,
              border: 'none',
              borderRadius: '6px',
              cursor: saving || !config.name?.trim() ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              color: 'white',
              fontWeight: 500,
              opacity: saving || !config.name?.trim() ? 0.5 : 1,
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              if (!saving && config.name?.trim()) {
                e.currentTarget.style.background = colors.primaryHover
              }
            }}
            onMouseLeave={(e) => {
              if (!saving && config.name?.trim()) {
                e.currentTarget.style.background = colors.primary
              }
            }}
          >
            {saving ? 'Saving...' : exists ? 'Save Changes' : 'Create File'}
          </button>
        </div>
      </div>
    </div>
  )
}

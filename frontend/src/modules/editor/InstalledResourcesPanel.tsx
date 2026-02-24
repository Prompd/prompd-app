import { useState, useEffect, useCallback } from 'react'
import { Package, RefreshCw, Trash2, Upload, ChevronRight, Globe, HardDrive, Loader2, AlertCircle } from 'lucide-react'
import { SidebarPanelHeader } from '../components/SidebarPanelHeader'
import { RESOURCE_TYPE_LABELS, RESOURCE_TYPE_ICONS, RESOURCE_TYPE_COLORS, type ResourceType } from '../services/resourceTypes'
import type { PackageManifest } from '../services/packageService'

type FilterTab = 'all' | ResourceType

interface InstalledResource {
  name: string
  version: string
  type: string
  scope: 'workspace' | 'user'
  path: string
  description?: string
  tools?: string[]
  mcps?: string[]
  main?: string
}

interface Props {
  theme?: 'light' | 'dark'
  workspacePath?: string | null
  onCollapse?: () => void
  onPublish?: (manifest: PackageManifest) => void
}

export default function InstalledResourcesPanel({ theme = 'dark', workspacePath, onCollapse, onPublish }: Props) {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')
  const [resources, setResources] = useState<InstalledResource[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedResource, setExpandedResource] = useState<string | null>(null)
  const [deletingPath, setDeletingPath] = useState<string | null>(null)

  const electronAPI = (window as unknown as Record<string, unknown>).electronAPI as {
    isElectron?: boolean
    resource?: {
      listInstalled: (workspacePath: string) => Promise<{
        success: boolean
        resources: InstalledResource[]
        error?: string
      }>
      delete: (resourcePath: string) => Promise<{ success: boolean; error?: string }>
      getManifest: (resourcePath: string) => Promise<{
        success: boolean
        manifest?: Record<string, unknown>
        error?: string
      }>
    }
  } | undefined

  const loadResources = useCallback(async () => {
    if (!electronAPI?.isElectron || !electronAPI.resource) return

    setLoading(true)
    setError(null)
    try {
      const result = await electronAPI.resource.listInstalled(workspacePath || '')
      if (result.success) {
        setResources(result.resources || [])
      } else {
        setError(result.error || 'Failed to load resources')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load resources')
    } finally {
      setLoading(false)
    }
  }, [workspacePath, electronAPI?.isElectron])

  useEffect(() => {
    loadResources()
  }, [loadResources])

  const handleDelete = useCallback(async (resourcePath: string) => {
    if (!electronAPI?.resource) return
    if (!confirm('Delete this installed resource? This cannot be undone.')) return

    setDeletingPath(resourcePath)
    try {
      const result = await electronAPI.resource.delete(resourcePath)
      if (result.success) {
        setResources(prev => prev.filter(r => r.path !== resourcePath))
      } else {
        setError(result.error || 'Failed to delete resource')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeletingPath(null)
    }
  }, [electronAPI?.resource])

  const handlePublish = useCallback(async (resource: InstalledResource) => {
    if (!electronAPI?.resource || !onPublish) return

    try {
      const result = await electronAPI.resource.getManifest(resource.path)
      if (result.success && result.manifest) {
        onPublish(result.manifest as unknown as PackageManifest)
      } else {
        setError(result.error || 'Failed to read manifest')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read manifest')
    }
  }, [electronAPI?.resource, onPublish])

  const filteredResources = activeFilter === 'all'
    ? resources
    : resources.filter(r => r.type === activeFilter)

  const filterTabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: `All (${resources.length})` },
    { key: 'package', label: `Packages` },
    { key: 'workflow', label: `Workflows` },
    { key: 'node-template', label: `Templates` },
    { key: 'skill', label: `Skills` },
  ]

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--panel)',
      color: 'var(--text)'
    }}>
      <SidebarPanelHeader title="Installed Resources" onCollapse={onCollapse}>
        <button
          onClick={loadResources}
          disabled={loading}
          title="Refresh"
          style={{
            background: 'none',
            border: 'none',
            cursor: loading ? 'wait' : 'pointer',
            padding: '4px',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
        </button>
      </SidebarPanelHeader>

      {/* Filter tabs */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border)',
        background: 'var(--panel-2)',
        overflowX: 'auto',
        flexShrink: 0
      }}>
        {filterTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveFilter(tab.key)}
            style={{
              flex: tab.key === 'all' ? 'none' : 1,
              padding: '8px 10px',
              fontSize: '11px',
              background: activeFilter === tab.key ? 'var(--panel)' : 'transparent',
              color: activeFilter === tab.key ? 'var(--accent)' : 'var(--text-secondary)',
              border: 'none',
              borderBottom: activeFilter === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
              cursor: 'pointer',
              fontWeight: activeFilter === tab.key ? 600 : 400,
              whiteSpace: 'nowrap',
              transition: 'all 0.15s'
            }}
            onMouseEnter={(e) => {
              if (activeFilter !== tab.key) {
                e.currentTarget.style.background = 'var(--panel)'
                e.currentTarget.style.color = 'var(--text)'
              }
            }}
            onMouseLeave={(e) => {
              if (activeFilter !== tab.key) {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--text-secondary)'
              }
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '8px'
      }}>
        {/* Error */}
        {error && (
          <div style={{
            padding: '8px 12px',
            margin: '0 0 8px 0',
            background: theme === 'dark' ? 'rgba(239, 68, 68, 0.1)' : '#fef2f2',
            border: `1px solid ${theme === 'dark' ? 'rgba(239, 68, 68, 0.3)' : '#fecaca'}`,
            borderRadius: 6,
            fontSize: '12px',
            color: theme === 'dark' ? '#fca5a5' : '#dc2626',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}>
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && resources.length === 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '24px',
            color: 'var(--text-secondary)',
            fontSize: '13px'
          }}>
            <Loader2 size={16} className="spin" />
            Scanning resources...
          </div>
        )}

        {/* Empty state */}
        {!loading && filteredResources.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '32px 16px',
            color: 'var(--text-secondary)',
            fontSize: '13px'
          }}>
            <Package size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
            <p style={{ margin: '0 0 4px 0', fontWeight: 500 }}>
              {activeFilter === 'all' ? 'No installed resources' : `No installed ${RESOURCE_TYPE_LABELS[activeFilter as ResourceType] || activeFilter}s`}
            </p>
            <p style={{ margin: 0, fontSize: '12px', opacity: 0.7 }}>
              Install resources from the registry or deploy locally
            </p>
          </div>
        )}

        {/* Resource list */}
        {filteredResources.map(resource => {
          const TypeIcon = RESOURCE_TYPE_ICONS[resource.type as ResourceType] || Package
          const typeColor = RESOURCE_TYPE_COLORS[resource.type as ResourceType] || '#3b82f6'
          const isExpanded = expandedResource === resource.path
          const isDeleting = deletingPath === resource.path

          return (
            <div
              key={resource.path}
              style={{
                marginBottom: 4,
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: isExpanded ? 'var(--panel-2)' : 'transparent',
                transition: 'all 0.15s',
                opacity: isDeleting ? 0.5 : 1
              }}
            >
              {/* Resource header */}
              <button
                onClick={() => setExpandedResource(isExpanded ? null : resource.path)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  color: 'var(--text)',
                  textAlign: 'left'
                }}
              >
                <ChevronRight
                  size={12}
                  style={{
                    transition: 'transform 0.15s',
                    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                    color: 'var(--text-secondary)',
                    flexShrink: 0
                  }}
                />
                <TypeIcon size={14} style={{ color: typeColor, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {resource.name}
                  </div>
                  <div style={{
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 1
                  }}>
                    <span>v{resource.version}</span>
                    <span style={{
                      fontSize: '10px',
                      padding: '1px 5px',
                      borderRadius: 3,
                      background: `${typeColor}20`,
                      color: typeColor,
                      fontWeight: 500
                    }}>
                      {RESOURCE_TYPE_LABELS[resource.type as ResourceType] || resource.type}
                    </span>
                    <span title={resource.scope === 'user' ? 'Global' : 'Workspace'}>
                      {resource.scope === 'user' ? (
                        <Globe size={10} style={{ opacity: 0.6 }} />
                      ) : (
                        <HardDrive size={10} style={{ opacity: 0.6 }} />
                      )}
                    </span>
                  </div>
                </div>
              </button>

              {/* Expanded details */}
              {isExpanded && (
                <div style={{
                  padding: '0 10px 10px 34px',
                  fontSize: '12px'
                }}>
                  {resource.description && (
                    <p style={{
                      margin: '0 0 8px 0',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.4
                    }}>
                      {resource.description}
                    </p>
                  )}

                  {/* Tools (skill) */}
                  {resource.tools && resource.tools.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Tools: </span>
                      <span style={{ color: 'var(--text)' }}>{resource.tools.join(', ')}</span>
                    </div>
                  )}

                  {/* MCPs */}
                  {resource.mcps && resource.mcps.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>MCPs: </span>
                      <span style={{ color: 'var(--text)' }}>{resource.mcps.join(', ')}</span>
                    </div>
                  )}

                  {/* Path */}
                  <div style={{
                    marginBottom: 10,
                    padding: '4px 8px',
                    background: 'var(--panel)',
                    borderRadius: 4,
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                    fontFamily: 'monospace',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {resource.path}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    {onPublish && (
                      <button
                        onClick={() => handlePublish(resource)}
                        style={{
                          padding: '5px 10px',
                          fontSize: '11px',
                          fontWeight: 500,
                          background: '#3b82f6',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: 4,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        <Upload size={12} />
                        Publish
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(resource.path)}
                      disabled={isDeleting}
                      style={{
                        padding: '5px 10px',
                        fontSize: '11px',
                        fontWeight: 500,
                        background: 'transparent',
                        color: theme === 'dark' ? '#fca5a5' : '#dc2626',
                        border: `1px solid ${theme === 'dark' ? 'rgba(239, 68, 68, 0.3)' : '#fecaca'}`,
                        borderRadius: 4,
                        cursor: isDeleting ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      <Trash2 size={12} />
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

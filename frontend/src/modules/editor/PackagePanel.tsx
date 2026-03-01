import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, Package, Download, ExternalLink, RefreshCw, Calendar, User, Tag, Star, Loader2, Globe, HardDrive, ChevronDown } from 'lucide-react'
import { registryApi, type RegistryPackage } from '../services/registryApi'
import PackageDetailsModal from './PackageDetailsModal'
import { useAuthenticatedUser } from '../auth/ClerkWrapper'
import { SidebarPanelHeader } from '../components/SidebarPanelHeader'
import { RESOURCE_TYPE_ICONS, RESOURCE_TYPE_COLORS, RESOURCE_TYPE_LABELS, RESOURCE_TYPES, type ResourceType } from '../services/resourceTypes'

type TabKey = 'search' | 'my-packages'

interface Props {
  theme?: 'light' | 'dark'
  onOpenInEditor?: (content: string, filename: string, packageId: string, filePath: string) => void
  onUseAsTemplate?: (content: string, filename: string, packageId: string, filePath: string) => void
  initialSearchQuery?: string  // Allow external search trigger
  onCollapse?: () => void  // Collapse panel callback
  workspacePath?: string | null
  onShowNotification?: (message: string, type?: 'info' | 'warning' | 'error') => void
}

export default function PackagePanel({ theme = 'dark', onOpenInEditor, onUseAsTemplate, initialSearchQuery, onCollapse, workspacePath, onShowNotification }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('search')
  const [highlightSearch, setHighlightSearch] = useState(false)
  const { isAuthenticated: isSignedIn } = useAuthenticatedUser()

  // Search tab state
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery || '')
  const [hasSearched, setHasSearched] = useState(false) // Track if user has initiated a search
  const [typeFilter, setTypeFilter] = useState<ResourceType | null>(null)

  // When initialSearchQuery changes, update the search and switch to search tab
  useEffect(() => {
    if (initialSearchQuery && initialSearchQuery !== searchQuery) {
      setSearchQuery(initialSearchQuery)
      setActiveTab('search')
      setHasSearched(true) // External trigger counts as user-initiated

      // Add visual highlight effect
      setHighlightSearch(true)
      const timer = setTimeout(() => setHighlightSearch(false), 2000)
      return () => clearTimeout(timer)
    }
  }, [initialSearchQuery])
  const [packages, setPackages] = useState<RegistryPackage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // My packages state
  const [myPackages, setMyPackages] = useState<RegistryPackage[]>([])
  const [myPackagesLoading, setMyPackagesLoading] = useState(false)
  const [myPackagesError, setMyPackagesError] = useState<string | null>(null)
  const [myPackagesLoaded, setMyPackagesLoaded] = useState(false)
  const [myPackagesFilter, setMyPackagesFilter] = useState('')
  const [myTypeFilter, setMyTypeFilter] = useState<ResourceType | null>(null)

  // Modal state
  const [selectedPackage, setSelectedPackage] = useState<RegistryPackage | null>(null)

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'search', label: 'Search', icon: <Search size={14} /> },
    { key: 'my-packages', label: 'My Packages', icon: <Package size={14} /> }
  ]

  // Filter packages by resource type
  const filterByType = (pkgs: RegistryPackage[], filter: ResourceType | null) => {
    if (!filter) return pkgs
    return pkgs.filter(p => (p.type || 'package') === filter)
  }

  // Debounced package search - only when user has initiated
  useEffect(() => {
    if (activeTab !== 'search' || !hasSearched) return

    const timer = setTimeout(async () => {
      if (searchQuery.length >= 2) {
        setLoading(true)
        setError(null)
        try {
          const result = await registryApi.searchPackages(searchQuery, 20)
          setPackages(result.packages)
        } catch (err: unknown) {
          console.error('Package search failed:', err)
          setError(err instanceof Error ? err.message : 'Failed to search packages')
          setPackages([])
        } finally {
          setLoading(false)
        }
      } else if (searchQuery.length === 0 && hasSearched) {
        // Clear results when search is emptied
        setPackages([])
      } else {
        setPackages([])
      }
    }, 300) // 300ms debounce

    return () => clearTimeout(timer)
  }, [searchQuery, activeTab, hasSearched])

  // Load user's packages when My Packages tab is active
  const loadMyPackages = useCallback(async () => {
    if (!isSignedIn) return

    setMyPackagesLoading(true)
    setMyPackagesError(null)
    try {
      const userPackages = await registryApi.getUserPackages()
      setMyPackages(userPackages)
    } catch (err: unknown) {
      console.error('Failed to load user packages:', err)
      setMyPackagesError(err instanceof Error ? err.message : 'Failed to load your packages')
      setMyPackages([])
    } finally {
      setMyPackagesLoaded(true)
      setMyPackagesLoading(false)
    }
  }, [isSignedIn])

  // Load my packages when tab becomes active (only once per session or on refresh)
  useEffect(() => {
    if (activeTab === 'my-packages' && isSignedIn && !myPackagesLoaded && !myPackagesLoading) {
      loadMyPackages()
    }
  }, [activeTab, isSignedIn, myPackagesLoaded, myPackagesLoading, loadMyPackages])

  // Handle search input - mark as user-initiated on first keystroke
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value)
    if (!hasSearched && e.target.value.length > 0) {
      setHasSearched(true)
    }
  }

  // Handle search on Enter key
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.length >= 2) {
      setHasSearched(true)
    }
  }

  const handlePackageClick = (pkg: RegistryPackage) => {
    setSelectedPackage(pkg)
  }

  const handleInstallPackage = useCallback(async (pkg: RegistryPackage, global?: boolean) => {
    if (!workspacePath) {
      onShowNotification?.('No workspace open. Open a folder first.', 'warning')
      return
    }
    if (!window.electronAPI?.package?.install) {
      onShowNotification?.('Install requires Electron environment', 'error')
      return
    }
    const ref = `${pkg.name}@${pkg.version}`
    const scope = global ? 'global' : 'project'
    try {
      const result = await window.electronAPI.package.install(ref, workspacePath, {
        type: pkg.type as ResourceType,
        global: global || false,
      })
      if (result.success) {
        onShowNotification?.(`Installed ${ref} (${scope})`, 'info')
        window.dispatchEvent(new Event('prompd:resources-changed'))
      } else {
        onShowNotification?.(result.error || 'Install failed', 'error')
      }
    } catch (err) {
      onShowNotification?.(err instanceof Error ? err.message : 'Install failed', 'error')
    }
  }, [workspacePath, onShowNotification])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--panel)',
      color: 'var(--text)'
    }}>
      {/* Header */}
      <SidebarPanelHeader title="Package Manager" onCollapse={onCollapse} />

      {/* Tabs */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border)',
        background: 'var(--panel-2)'
      }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1,
              padding: '10px 8px',
              fontSize: '11px',
              background: activeTab === tab.key ? 'var(--panel)' : 'transparent',
              color: activeTab === tab.key ? 'var(--accent)' : 'var(--text-secondary)',
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontWeight: activeTab === tab.key ? 600 : 400,
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (activeTab !== tab.key) {
                e.currentTarget.style.background = 'var(--panel)'
                e.currentTarget.style.color = 'var(--text)'
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== tab.key) {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--text-secondary)'
              }
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '12px'
      }}>
        {activeTab === 'search' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%' }}>
            {/* Search input */}
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-secondary)',
                pointerEvents: 'none'
              }} />
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search packages..."
                style={{
                  width: '100%',
                  padding: '8px 10px 8px 32px',
                  fontSize: '12px',
                  background: highlightSearch ? 'rgba(59, 130, 246, 0.15)' : 'var(--panel-2)',
                  border: `1px solid ${highlightSearch ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: '6px',
                  color: 'var(--text)',
                  outline: 'none',
                  transition: 'all 0.3s ease',
                  boxSizing: 'border-box',
                  boxShadow: highlightSearch ? '0 0 0 2px rgba(59, 130, 246, 0.2)' : 'none'
                }}
                onFocus={(e) => {
                  if (!highlightSearch) e.currentTarget.style.borderColor = 'var(--accent)'
                }}
                onBlur={(e) => {
                  if (!highlightSearch) e.currentTarget.style.borderColor = 'var(--border)'
                }}
              />
              {searchQuery.length > 0 && searchQuery.length < 2 && (
                <div style={{
                  marginTop: '4px',
                  fontSize: '10px',
                  color: 'var(--text-secondary)',
                  fontStyle: 'italic'
                }}>
                  Type at least 2 characters to search
                </div>
              )}
            </div>

            {/* Type filter chips */}
            <TypeFilterChips activeFilter={typeFilter} onFilterChange={setTypeFilter} />

            {/* Loading state */}
            {loading && (
              <div style={{
                padding: '32px 16px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: '12px'
              }}>
                <Search size={20} style={{
                  animation: 'spin 1s linear infinite',
                  marginBottom: '8px'
                }} />
                <div>Searching registry...</div>
              </div>
            )}

            {/* Error state */}
            {error && !loading && (
              <div style={{
                padding: '12px',
                background: 'rgba(220, 38, 38, 0.1)',
                border: '1px solid rgba(220, 38, 38, 0.3)',
                borderRadius: '6px',
                color: 'var(--error)',
                fontSize: '11px'
              }}>
                <strong>Error:</strong> {error}
              </div>
            )}

            {/* Package list */}
            {!loading && !error && packages.length > 0 && (() => {
              const filtered = filterByType(packages, typeFilter)
              return filtered.length > 0 ? (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  overflow: 'auto',
                }}>
                  {filtered.map((pkg) => (
                    <PackageCard
                      key={`${pkg.name}@${pkg.version}`}
                      package={pkg}
                      onClick={() => handlePackageClick(pkg)}
                      onInstall={handleInstallPackage}
                    />
                  ))}
                </div>
              ) : (
                <div style={{
                  padding: '24px 16px',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: '12px'
                }}>
                  <Package size={24} style={{ opacity: 0.5, marginBottom: '8px' }} />
                  <div>No {RESOURCE_TYPE_LABELS[typeFilter!].toLowerCase()}s found</div>
                  <div style={{ fontSize: '11px', marginTop: '4px' }}>
                    Try removing the type filter
                  </div>
                </div>
              )
            })()}

            {/* Empty state */}
            {!loading && !error && packages.length === 0 && searchQuery.length >= 2 && (
              <div style={{
                padding: '32px 16px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: '12px'
              }}>
                <Package size={24} style={{ opacity: 0.5, marginBottom: '8px' }} />
                <div>No packages found for "{searchQuery}"</div>
                <div style={{ fontSize: '11px', marginTop: '4px' }}>
                  Try a different search term
                </div>
              </div>
            )}

            {/* Initial empty state */}
            {!loading && !error && packages.length === 0 && searchQuery.length === 0 && (
              <div style={{
                padding: '32px 16px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: '12px'
              }}>
                <Search size={24} style={{ opacity: 0.5, marginBottom: '8px' }} />
                <div>Search for packages from the registry</div>
                <div style={{ fontSize: '11px', marginTop: '4px' }}>
                  Start typing to discover packages
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'my-packages' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%' }}>
            {/* Header with refresh button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h4 style={{ margin: 0, fontSize: '12px', fontWeight: 600 }}>
                My Published Packages
              </h4>
              {isSignedIn && (
                <button
                  onClick={() => {
                    setMyPackagesLoaded(false)
                    loadMyPackages()
                  }}
                  disabled={myPackagesLoading}
                  style={{
                    padding: '4px 8px',
                    fontSize: '11px',
                    background: 'var(--panel-2)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    color: 'var(--text-secondary)',
                    cursor: myPackagesLoading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    opacity: myPackagesLoading ? 0.6 : 1
                  }}
                >
                  <RefreshCw size={11} style={{ animation: myPackagesLoading ? 'spin 1s linear infinite' : 'none' }} />
                  Refresh
                </button>
              )}
            </div>

            {/* Filter input */}
            {isSignedIn && myPackages.length > 0 && (
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-secondary)',
                  pointerEvents: 'none'
                }} />
                <input
                  type="text"
                  value={myPackagesFilter}
                  onChange={(e) => setMyPackagesFilter(e.target.value)}
                  placeholder="Filter packages..."
                  style={{
                    width: '100%',
                    padding: '8px 10px 8px 32px',
                    fontSize: '12px',
                    background: 'var(--panel-2)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: 'var(--text)',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                />
              </div>
            )}

            {/* Type filter chips */}
            {isSignedIn && myPackages.length > 0 && (
              <TypeFilterChips activeFilter={myTypeFilter} onFilterChange={setMyTypeFilter} />
            )}

            {/* Not signed in state */}
            {!isSignedIn && (
              <div style={{
                padding: '32px 16px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: '12px'
              }}>
                <Package size={24} style={{ opacity: 0.5, marginBottom: '8px' }} />
                <div>Sign in to view your packages</div>
                <div style={{ fontSize: '11px', marginTop: '4px' }}>
                  Your published packages will appear here
                </div>
              </div>
            )}

            {/* Loading state */}
            {isSignedIn && myPackagesLoading && (
              <div style={{
                padding: '32px 16px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: '12px'
              }}>
                <RefreshCw size={20} style={{
                  animation: 'spin 1s linear infinite',
                  marginBottom: '8px'
                }} />
                <div>Loading your packages...</div>
              </div>
            )}

            {/* Error state */}
            {isSignedIn && myPackagesError && !myPackagesLoading && (
              <div style={{
                padding: '12px',
                background: 'rgba(220, 38, 38, 0.1)',
                border: '1px solid rgba(220, 38, 38, 0.3)',
                borderRadius: '6px',
                color: 'var(--error)',
                fontSize: '11px'
              }}>
                <strong>Error:</strong> {myPackagesError}
              </div>
            )}

            {/* Package list */}
            {isSignedIn && !myPackagesLoading && !myPackagesError && myPackages.length > 0 && (() => {
              let filteredPackages = myPackagesFilter
                ? myPackages.filter(pkg =>
                    pkg.name.toLowerCase().includes(myPackagesFilter.toLowerCase()) ||
                    pkg.description?.toLowerCase().includes(myPackagesFilter.toLowerCase()) ||
                    pkg.keywords?.some(k => k.toLowerCase().includes(myPackagesFilter.toLowerCase()))
                  )
                : myPackages
              filteredPackages = filterByType(filteredPackages, myTypeFilter)

              return filteredPackages.length > 0 ? (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  overflow: 'auto',
                }}>
                  {filteredPackages.map((pkg) => (
                    <PackageCard
                      key={`${pkg.name}@${pkg.version}`}
                      package={pkg}
                      onClick={() => handlePackageClick(pkg)}
                    />
                  ))}
                </div>
              ) : (
                <div style={{
                  padding: '24px 16px',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: '12px'
                }}>
                  <Package size={24} style={{ opacity: 0.5, marginBottom: '8px' }} />
                  <div>No packages match your filters</div>
                  <div style={{ fontSize: '11px', marginTop: '4px' }}>
                    Try a different search term or type filter
                  </div>
                </div>
              )
            })()}

            {/* Empty state */}
            {isSignedIn && !myPackagesLoading && !myPackagesError && myPackages.length === 0 && myPackagesLoaded && (
              <div style={{
                padding: '32px 16px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: '12px'
              }}>
                <Package size={24} style={{ opacity: 0.5, marginBottom: '8px' }} />
                <div>No packages published yet</div>
                <div style={{ fontSize: '11px', marginTop: '4px' }}>
                  Publish a package to see it here
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Package Details Modal */}
      {selectedPackage && (
        <PackageDetailsModal
          package={selectedPackage}
          onClose={() => setSelectedPackage(null)}
          onOpenInEditor={onOpenInEditor}
          onUseAsTemplate={onUseAsTemplate}
        />
      )}
    </div>
  )
}

// Type filter chips component
interface TypeFilterChipsProps {
  activeFilter: ResourceType | null
  onFilterChange: (filter: ResourceType | null) => void
}

function TypeFilterChips({ activeFilter, onFilterChange }: TypeFilterChipsProps) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
      <button
        onClick={() => onFilterChange(null)}
        style={{
          padding: '3px 8px',
          fontSize: '10px',
          fontWeight: activeFilter === null ? 600 : 400,
          background: activeFilter === null ? 'var(--accent)' : 'var(--panel-2)',
          color: activeFilter === null ? 'white' : 'var(--text-secondary)',
          border: activeFilter === null ? '1px solid var(--accent)' : '1px solid var(--border)',
          borderRadius: '10px',
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
      >
        All
      </button>
      {RESOURCE_TYPES.map(rt => {
        const Icon = RESOURCE_TYPE_ICONS[rt]
        const color = RESOURCE_TYPE_COLORS[rt]
        const isActive = activeFilter === rt
        return (
          <button
            key={rt}
            onClick={() => onFilterChange(isActive ? null : rt)}
            style={{
              padding: '3px 8px',
              fontSize: '10px',
              fontWeight: isActive ? 600 : 400,
              background: isActive ? `${color}25` : 'var(--panel-2)',
              color: isActive ? color : 'var(--text-secondary)',
              border: `1px solid ${isActive ? `${color}60` : 'var(--border)'}`,
              borderRadius: '10px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              transition: 'all 0.15s',
            }}
          >
            <Icon size={10} />
            {RESOURCE_TYPE_LABELS[rt]}
          </button>
        )
      })}
    </div>
  )
}

// PackageCard component — compact sidebar-friendly layout
interface PackageCardProps {
  package: RegistryPackage
  onClick: () => void
  onInstall?: (pkg: RegistryPackage, global?: boolean) => Promise<void>
}

function PackageCard({ package: pkg, onClick, onInstall }: PackageCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [showScopeMenu, setShowScopeMenu] = useState(false)
  const scopeMenuRef = useRef<HTMLDivElement>(null)

  // Close scope menu on click outside
  useEffect(() => {
    if (!showScopeMenu) return
    const handleClickOutside = (e: MouseEvent) => {
      if (scopeMenuRef.current && !scopeMenuRef.current.contains(e.target as Node)) {
        setShowScopeMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showScopeMenu])

  const pkgType = (pkg.type || 'package') as ResourceType
  const TypeIcon = RESOURCE_TYPE_ICONS[pkgType] || Package
  const typeColor = RESOURCE_TYPE_COLORS[pkgType] || '#3b82f6'

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        padding: '10px 12px',
        background: isHovered ? 'var(--panel-2)' : 'var(--panel)',
        border: `1px solid ${isHovered ? typeColor + '60' : 'var(--border)'}`,
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'all 0.15s',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      {/* Row 1: Icon + Name + Version + Install */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{
          flexShrink: 0,
          width: '28px',
          height: '28px',
          background: `${typeColor}20`,
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <TypeIcon size={15} color={typeColor} strokeWidth={2} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--text)',
            fontFamily: 'monospace',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            lineHeight: '1.3',
          }}>
            {pkg.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
            <span style={{
              fontSize: '10px',
              fontWeight: 500,
              color: typeColor,
              fontFamily: 'monospace',
            }}>
              v{pkg.version}
            </span>
            <span style={{
              fontSize: '9px',
              fontWeight: 500,
              color: typeColor,
              background: `${typeColor}15`,
              padding: '1px 5px',
              borderRadius: '3px',
            }}>
              {RESOURCE_TYPE_LABELS[pkgType]}
            </span>
          </div>
        </div>
        {/* Install button with scope dropdown */}
        {onInstall && (
          <div style={{ flexShrink: 0, position: 'relative' }} ref={scopeMenuRef}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              borderRadius: '4px',
              border: '1px solid var(--accent)',
              background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
              opacity: isHovered ? (installing ? 0.7 : 1) : 0,
              transition: 'opacity 0.15s',
              overflow: 'hidden',
            }}>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (installing) return
                  setInstalling(true)
                  onInstall(pkg, false).finally(() => setInstalling(false))
                }}
                title={`Install ${pkg.name}@${pkg.version} to project`}
                style={{
                  padding: '3px 7px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--accent)',
                  cursor: installing ? 'default' : 'pointer',
                  fontSize: '10px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                }}
              >
                {installing
                  ? <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />
                  : <Download size={10} />
                }
                {installing ? '...' : 'Install'}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (installing) return
                  setShowScopeMenu(prev => !prev)
                }}
                title="Install scope options"
                style={{
                  padding: '3px 3px',
                  background: 'transparent',
                  borderLeft: '1px solid var(--accent)',
                  border: 'none',
                  borderLeftWidth: '1px',
                  borderLeftStyle: 'solid',
                  borderLeftColor: 'color-mix(in srgb, var(--accent) 40%, transparent)',
                  color: 'var(--accent)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <ChevronDown size={10} />
              </button>
            </div>
            {/* Scope dropdown */}
            {showScopeMenu && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  marginTop: 4,
                  background: 'var(--panel)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                  zIndex: 100,
                  minWidth: 140,
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => {
                    setShowScopeMenu(false)
                    setInstalling(true)
                    onInstall(pkg, false).finally(() => setInstalling(false))
                  }}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text)',
                    fontSize: '11px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--panel-2)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <HardDrive size={12} />
                  Project
                </button>
                <button
                  onClick={() => {
                    setShowScopeMenu(false)
                    setInstalling(true)
                    onInstall(pkg, true).finally(() => setInstalling(false))
                  }}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text)',
                    fontSize: '11px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--panel-2)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <Globe size={12} />
                  Global
                </button>
              </div>
            )}
          </div>
        )}
        {!onInstall && (
          <ExternalLink
            size={14}
            color="var(--accent)"
            style={{ flexShrink: 0, opacity: isHovered ? 0.8 : 0, transition: 'opacity 0.15s' }}
          />
        )}
      </div>

      {/* Row 2: Description */}
      {pkg.description && (
        <div style={{
          fontSize: '11px',
          color: 'var(--text-secondary)',
          lineHeight: '1.4',
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}>
          {pkg.description}
        </div>
      )}

      {/* Row 3: Compact metadata */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '10px',
        color: 'var(--text-secondary)',
        flexWrap: 'wrap',
      }}>
        {pkg.author && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
            <User size={10} style={{ opacity: 0.6 }} />
            {pkg.author}
          </span>
        )}
        {pkg.downloads !== undefined && pkg.downloads > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
            <Download size={10} style={{ opacity: 0.6 }} />
            {formatDownloads(pkg.downloads)}
          </span>
        )}
        {pkg.keywords && pkg.keywords.length > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
            <Tag size={10} style={{ opacity: 0.6 }} />
            {pkg.keywords.slice(0, 2).join(', ')}
            {pkg.keywords.length > 2 && ` +${pkg.keywords.length - 2}`}
          </span>
        )}
      </div>
    </div>
  )
}

// Helper function to format download counts
function formatDownloads(count: number): string {
  if (count >= 1000000) {
    return (count / 1000000).toFixed(1) + 'M'
  } else if (count >= 1000) {
    return (count / 1000).toFixed(1) + 'k'
  }
  return count.toString()
}

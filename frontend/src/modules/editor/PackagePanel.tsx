import { useState, useEffect, useCallback } from 'react'
import { Search, Package, Download, ExternalLink, RefreshCw, Calendar, User, Tag, Star, Loader2 } from 'lucide-react'
import { registryApi, type RegistryPackage } from '../services/registryApi'
import PackageDetailsModal from './PackageDetailsModal'
import { useAuthenticatedUser } from '../auth/ClerkWrapper'
import { SidebarPanelHeader } from '../components/SidebarPanelHeader'

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

  // Modal state
  const [selectedPackage, setSelectedPackage] = useState<RegistryPackage | null>(null)

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'search', label: 'Search', icon: <Search size={14} /> },
    { key: 'my-packages', label: 'My Packages', icon: <Package size={14} /> }
  ]

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

  const handleInstallPackage = useCallback(async (pkg: RegistryPackage) => {
    if (!workspacePath) {
      onShowNotification?.('No workspace open. Open a folder first.', 'warning')
      return
    }
    if (!window.electronAPI?.package?.install) {
      onShowNotification?.('Install requires Electron environment', 'error')
      return
    }
    const ref = `${pkg.name}@${pkg.version}`
    try {
      const result = await window.electronAPI.package.install(ref, workspacePath)
      if (result.success) {
        onShowNotification?.(`Installed ${ref}`, 'info')
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
        padding: '16px'
      }}>
        {activeTab === 'search' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
            {/* Search input */}
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{
                position: 'absolute',
                left: '12px',
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
                  padding: '10px 12px 10px 38px',
                  fontSize: '13px',
                  background: highlightSearch ? 'rgba(59, 130, 246, 0.15)' : 'var(--panel-2)',
                  border: `2px solid ${highlightSearch ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: '6px',
                  color: 'var(--text)',
                  outline: 'none',
                  transition: 'all 0.3s ease',
                  boxShadow: highlightSearch ? '0 0 0 3px rgba(59, 130, 246, 0.2)' : 'none'
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
                  marginTop: '8px',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  fontStyle: 'italic'
                }}>
                  Type at least 2 characters to search
                </div>
              )}
            </div>

            {/* Loading state */}
            {loading && (
              <div style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: '13px'
              }}>
                <Search size={24} style={{
                  animation: 'spin 1s linear infinite',
                  marginBottom: '12px'
                }} />
                <div>Searching registry...</div>
              </div>
            )}

            {/* Error state */}
            {error && !loading && (
              <div style={{
                padding: '16px',
                background: 'rgba(220, 38, 38, 0.1)',
                border: '1px solid rgba(220, 38, 38, 0.3)',
                borderRadius: '6px',
                color: 'var(--error)',
                fontSize: '12px'
              }}>
                <strong>Error:</strong> {error}
              </div>
            )}

            {/* Package grid */}
            {!loading && !error && packages.length > 0 && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '12px',
                overflow: 'auto',
                paddingTop: '8px'
              }}>
                {packages.map((pkg) => (
                  <PackageCard
                    key={`${pkg.name}@${pkg.version}`}
                    package={pkg}
                    onClick={() => handlePackageClick(pkg)}
                    onInstall={handleInstallPackage}
                  />
                ))}
              </div>
            )}

            {/* Empty state */}
            {!loading && !error && packages.length === 0 && searchQuery.length >= 2 && (
              <div style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: '13px'
              }}>
                <Package size={32} style={{ opacity: 0.5, marginBottom: '12px' }} />
                <div>No packages found for "{searchQuery}"</div>
                <div style={{ fontSize: '11px', marginTop: '8px' }}>
                  Try a different search term
                </div>
              </div>
            )}

            {/* Initial empty state */}
            {!loading && !error && packages.length === 0 && searchQuery.length === 0 && (
              <div style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: '13px'
              }}>
                <Search size={32} style={{ opacity: 0.5, marginBottom: '12px' }} />
                <div>Search for packages from the registry</div>
                <div style={{ fontSize: '11px', marginTop: '8px' }}>
                  Start typing to discover packages
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'my-packages' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
            {/* Header with refresh button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>
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
                    padding: '6px 10px',
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
                  <RefreshCw size={12} style={{ animation: myPackagesLoading ? 'spin 1s linear infinite' : 'none' }} />
                  Refresh
                </button>
              )}
            </div>

            {/* Filter input */}
            {isSignedIn && myPackages.length > 0 && (
              <div style={{ position: 'relative' }}>
                <Search size={16} style={{
                  position: 'absolute',
                  left: '12px',
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
                    padding: '10px 12px 10px 38px',
                    fontSize: '13px',
                    background: 'var(--panel-2)',
                    border: '2px solid var(--border)',
                    borderRadius: '6px',
                    color: 'var(--text)',
                    outline: 'none',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
                />
              </div>
            )}

            {/* Not signed in state */}
            {!isSignedIn && (
              <div style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: '13px'
              }}>
                <Package size={32} style={{ opacity: 0.5, marginBottom: '12px' }} />
                <div>Sign in to view your packages</div>
                <div style={{ fontSize: '11px', marginTop: '8px' }}>
                  Your published packages will appear here
                </div>
              </div>
            )}

            {/* Loading state */}
            {isSignedIn && myPackagesLoading && (
              <div style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: '13px'
              }}>
                <RefreshCw size={24} style={{
                  animation: 'spin 1s linear infinite',
                  marginBottom: '12px'
                }} />
                <div>Loading your packages...</div>
              </div>
            )}

            {/* Error state */}
            {isSignedIn && myPackagesError && !myPackagesLoading && (
              <div style={{
                padding: '16px',
                background: 'rgba(220, 38, 38, 0.1)',
                border: '1px solid rgba(220, 38, 38, 0.3)',
                borderRadius: '6px',
                color: 'var(--error)',
                fontSize: '12px'
              }}>
                <strong>Error:</strong> {myPackagesError}
              </div>
            )}

            {/* Package grid */}
            {isSignedIn && !myPackagesLoading && !myPackagesError && myPackages.length > 0 && (() => {
              const filteredPackages = myPackagesFilter
                ? myPackages.filter(pkg =>
                    pkg.name.toLowerCase().includes(myPackagesFilter.toLowerCase()) ||
                    pkg.description?.toLowerCase().includes(myPackagesFilter.toLowerCase()) ||
                    pkg.keywords?.some(k => k.toLowerCase().includes(myPackagesFilter.toLowerCase()))
                  )
                : myPackages

              return filteredPackages.length > 0 ? (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: '12px',
                  overflow: 'auto',
                  paddingTop: '8px'
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
                  padding: '40px 20px',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: '13px'
                }}>
                  <Package size={32} style={{ opacity: 0.5, marginBottom: '12px' }} />
                  <div>No packages match "{myPackagesFilter}"</div>
                  <div style={{ fontSize: '11px', marginTop: '8px' }}>
                    Try a different search term
                  </div>
                </div>
              )
            })()}

            {/* Empty state */}
            {isSignedIn && !myPackagesLoading && !myPackagesError && myPackages.length === 0 && myPackagesLoaded && (
              <div style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: '13px'
              }}>
                <Package size={32} style={{ opacity: 0.5, marginBottom: '12px' }} />
                <div>No packages published yet</div>
                <div style={{ fontSize: '11px', marginTop: '8px' }}>
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

// PackageCard component
interface PackageCardProps {
  package: RegistryPackage
  onClick: () => void
  onInstall?: (pkg: RegistryPackage) => Promise<void>
}

function PackageCard({ package: pkg, onClick, onInstall }: PackageCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [installing, setInstalling] = useState(false)

  // Format publish date
  const publishedDate = pkg.publishedAt ? new Date(pkg.publishedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }) : null

  // Format updated date
  const updatedDate = pkg.updatedAt ? new Date(pkg.updatedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }) : null

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'relative',
        padding: '20px',
        background: 'var(--panel)',
        borderWidth: '2px',
        borderStyle: 'solid',
        borderColor: isHovered ? 'var(--accent)' : 'var(--border)',
        borderRadius: '12px',
        cursor: 'pointer',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        minHeight: '240px',
        boxShadow: isHovered
          ? '0 8px 24px rgba(0, 0, 0, 0.12)'
          : '0 2px 8px rgba(0, 0, 0, 0.04)',
        transform: isHovered ? 'translateY(-2px)' : 'translateY(0)'
      }}
    >
      {/* Package header with icon */}
      <div style={{ display: 'flex', alignItems: 'start', gap: '14px' }}>
        <div style={{
          flexShrink: 0,
          width: '52px',
          height: '52px',
          background: `linear-gradient(135deg, var(--accent), #8b5cf6)`,
          borderRadius: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(99, 102, 241, 0.3)',
          transform: isHovered ? 'scale(1.05)' : 'scale(1)',
          transition: 'transform 0.2s'
        }}>
          <Package size={28} color="white" strokeWidth={2.5} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '16px',
            fontWeight: 700,
            color: 'var(--text)',
            fontFamily: 'monospace',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginBottom: '6px',
            letterSpacing: '-0.02em'
          }}>
            {pkg.name}
          </div>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '4px 10px',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--accent)',
            background: 'rgba(99, 102, 241, 0.1)',
            borderRadius: '6px',
            fontFamily: 'monospace',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: 'rgba(99, 102, 241, 0.25)'
          }}>
            <Tag size={11} />
            v{pkg.version}
          </div>
        </div>
        {/* Install button + hover indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          opacity: isHovered ? 1 : 0,
          transform: isHovered ? 'translateX(0)' : 'translateX(4px)',
          transition: 'all 0.2s'
        }}>
          {onInstall && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (installing) return
                setInstalling(true)
                onInstall(pkg).finally(() => setInstalling(false))
              }}
              title={`Install ${pkg.name}@${pkg.version}`}
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                border: '1px solid var(--accent)',
                background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                color: 'var(--accent)',
                cursor: installing ? 'default' : 'pointer',
                fontSize: '11px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                opacity: installing ? 0.7 : 1,
              }}
            >
              {installing
                ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                : <Download size={12} />
              }
              {installing ? 'Installing' : 'Install'}
            </button>
          )}
          <ExternalLink size={18} color="var(--accent)" />
        </div>
      </div>

      {/* Description */}
      <div style={{
        fontSize: '13px',
        color: 'var(--text-secondary)',
        lineHeight: '1.6',
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical',
        minHeight: '4em',
        flex: 1
      }}>
        {pkg.description || 'No description available'}
      </div>

      {/* Metadata sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Primary metadata - 2 column grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '10px',
          paddingTop: '12px',
          borderTop: '1px solid var(--border)'
        }}>
          {/* Author */}
          {pkg.author && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              fontSize: '12px',
              color: 'var(--text-secondary)'
            }}>
              <User size={14} style={{ flexShrink: 0, opacity: 0.7 }} />
              <span style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontWeight: 500
              }}>
                {pkg.author}
              </span>
            </div>
          )}

          {/* Downloads */}
          {pkg.downloads !== undefined && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              fontSize: '12px',
              color: 'var(--text-secondary)',
              fontWeight: 500
            }}>
              <Download size={14} style={{ flexShrink: 0, opacity: 0.7 }} />
              <span>{formatDownloads(pkg.downloads)} downloads</span>
            </div>
          )}

          {/* Published date */}
          {publishedDate && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              fontSize: '12px',
              color: 'var(--text-secondary)'
            }}>
              <Calendar size={14} style={{ flexShrink: 0, opacity: 0.7 }} />
              <span>Published {publishedDate}</span>
            </div>
          )}

          {/* Updated date */}
          {updatedDate && publishedDate !== updatedDate && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              fontSize: '12px',
              color: 'var(--text-secondary)'
            }}>
              <RefreshCw size={14} style={{ flexShrink: 0, opacity: 0.7 }} />
              <span>Updated {updatedDate}</span>
            </div>
          )}

          {/* License */}
          {pkg.license && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              fontSize: '12px',
              color: 'var(--text-secondary)',
              gridColumn: (!updatedDate || publishedDate === updatedDate) ? 'span 2' : 'auto'
            }}>
              <Star size={14} style={{ flexShrink: 0, opacity: 0.7 }} />
              <span>{pkg.license}</span>
            </div>
          )}
        </div>

        {/* Keywords/Tags */}
        {pkg.keywords && pkg.keywords.length > 0 && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '7px',
            paddingTop: '10px',
            borderTop: '1px solid var(--border)'
          }}>
            {pkg.keywords.slice(0, 5).map((keyword, idx) => (
              <span
                key={idx}
                style={{
                  padding: '4px 12px',
                  fontSize: '11px',
                  fontWeight: 500,
                  background: isHovered ? 'rgba(99, 102, 241, 0.1)' : 'var(--panel-2)',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  borderColor: isHovered ? 'rgba(99, 102, 241, 0.3)' : 'var(--border)',
                  borderRadius: '14px',
                  color: isHovered ? 'var(--accent)' : 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s'
                }}
              >
                {keyword}
              </span>
            ))}
            {pkg.keywords.length > 5 && (
              <span
                style={{
                  padding: '4px 12px',
                  fontSize: '11px',
                  fontWeight: 500,
                  color: 'var(--text-secondary)',
                  fontStyle: 'italic',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                +{pkg.keywords.length - 5} more
              </span>
            )}
          </div>
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

import { useState, useEffect, useCallback } from 'react'
import { Search, Package, Download, ExternalLink, RefreshCw } from 'lucide-react'
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
}

export default function PackagePanel({ theme = 'dark', onOpenInEditor, onUseAsTemplate, initialSearchQuery, onCollapse }: Props) {
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
      setMyPackagesLoaded(true)
    } catch (err: unknown) {
      console.error('Failed to load user packages:', err)
      setMyPackagesError(err instanceof Error ? err.message : 'Failed to load your packages')
      setMyPackages([])
    } finally {
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
                overflow: 'auto'
              }}>
                {packages.map((pkg) => (
                  <PackageCard
                    key={`${pkg.name}@${pkg.version}`}
                    package={pkg}
                    onClick={() => handlePackageClick(pkg)}
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
            {isSignedIn && !myPackagesLoading && !myPackagesError && myPackages.length > 0 && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '12px',
                overflow: 'auto'
              }}>
                {myPackages.map((pkg) => (
                  <PackageCard
                    key={`${pkg.name}@${pkg.version}`}
                    package={pkg}
                    onClick={() => handlePackageClick(pkg)}
                  />
                ))}
              </div>
            )}

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
}

function PackageCard({ package: pkg, onClick }: PackageCardProps) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        padding: '16px',
        background: isHovered ? 'var(--panel-2)' : 'var(--panel)',
        border: `1px solid ${isHovered ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'all 0.2s',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        minHeight: '160px'
      }}
    >
      {/* Package header */}
      <div style={{ display: 'flex', alignItems: 'start', gap: '10px' }}>
        <div style={{
          flexShrink: 0,
          width: '36px',
          height: '36px',
          background: 'var(--accent)',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0.9
        }}>
          <Package size={20} color="white" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--text)',
            fontFamily: 'monospace',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginBottom: '2px'
          }}>
            {pkg.name}
          </div>
          <div style={{
            fontSize: '11px',
            color: 'var(--text-secondary)',
            fontFamily: 'monospace'
          }}>
            v{pkg.version}
          </div>
        </div>
      </div>

      {/* Description */}
      <div style={{
        fontSize: '12px',
        color: 'var(--text-secondary)',
        lineHeight: '1.5',
        flex: 1,
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical'
      }}>
        {pkg.description || 'No description available'}
      </div>

      {/* Metadata footer */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: '8px',
        borderTop: '1px solid var(--border)',
        fontSize: '11px',
        color: 'var(--text-secondary)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {pkg.author && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>By: {pkg.author}</span>
            </div>
          )}
          {pkg.downloads !== undefined && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Download size={12} />
              <span>{formatDownloads(pkg.downloads)}</span>
            </div>
          )}
        </div>
        <ExternalLink size={12} opacity={isHovered ? 1 : 0.5} style={{ transition: 'opacity 0.2s' }} />
      </div>

      {/* Keywords/Tags */}
      {pkg.keywords && pkg.keywords.length > 0 && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px',
          marginTop: '4px'
        }}>
          {pkg.keywords.slice(0, 3).map((keyword, idx) => (
            <span
              key={idx}
              style={{
                padding: '2px 8px',
                fontSize: '10px',
                background: 'var(--panel-2)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap'
              }}
            >
              {keyword}
            </span>
          ))}
          {pkg.keywords.length > 3 && (
            <span
              style={{
                padding: '2px 8px',
                fontSize: '10px',
                color: 'var(--text-secondary)',
                fontStyle: 'italic'
              }}
            >
              +{pkg.keywords.length - 3} more
            </span>
          )}
        </div>
      )}
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

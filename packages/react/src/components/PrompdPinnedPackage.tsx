import { clsx } from 'clsx'

export interface PinnedPrompdPackage {
  name: string
  version: string
  description?: string
  icon?: string
  pinned?: boolean
  displayName?: string  // Custom display name (e.g., "Custom Prompt")
  promptContent?: string  // The actual .prmd content for viewing
}

export interface PrompdPinnedPackageProps {
  packages: PinnedPrompdPackage[]
  onPin?: (packageName: string, version: string) => void
  onUnpin?: (packageName: string, version: string) => void
  onSelect?: (packageName: string, version: string) => void
  onViewPrompt?: (packageName: string, version: string) => void  // New: View .prmd content
  className?: string
  maxDisplay?: number
  compact?: boolean
  namespace?: string  // Current user's namespace (e.g., "@username")
}

/**
 * Display pinned prompd packages
 */
export function PrompdPinnedPackage({
  packages,
  onPin,
  onUnpin,
  onSelect,
  onViewPrompt,
  className,
  maxDisplay = 5,
  compact = false,
  namespace
}: PrompdPinnedPackageProps) {
  const displayedPackages = packages.slice(0, maxDisplay)
  const hasMore = packages.length > maxDisplay

  if (packages.length === 0) {
    return (
      <div
        className={clsx('prompd-pinned-empty', className)}
        style={{
          padding: '1rem',
          textAlign: 'center',
          color: 'var(--prompd-muted)',
          fontSize: '0.875rem',
          border: '1px dashed var(--prompd-border)',
          borderRadius: '0.5rem',
        }}
      >
        No pinned packages
      </div>
    )
  }

  // Compact mode - single line with name@version format
  if (compact) {
    return (
      <div className={clsx('prompd-metadata-pinned-prmd-compact', className)}>
        {displayedPackages.map((pkg) => (
          <a
            key={`${pkg.name}@${pkg.version}`}
            href="#"
            onClick={(e) => {
              e.preventDefault()
              onSelect?.(pkg.name, pkg.version)
            }}
            className="text-sm font-medium font-mono hover:underline"
            style={{
              color: 'var(--prompd-text)',
              textDecoration: 'none',
            }}
          >
            {(() => {
              // If displayName is provided, use it directly
              if (pkg.displayName) {
                return pkg.displayName
              }

              // Otherwise, use the default format: @namespace/package-name@version/package-name.prmd
              const parts = pkg.name.split('/')
              const ns = namespace || (parts[0] || '@user')
              const pkgName = parts[1] || pkg.name
              return `${ns}/${pkgName}@${pkg.version}/${pkgName}.prmd`
            })()}
          </a>
        ))}
      </div>
    )
  }

  // Normal mode - original layout
  return (
    <div className={clsx('prompd-metadata-pinned-prmd', className)}>
      <div
        className="prompd-pinned-header"
        style={{
          fontSize: '0.75rem',
          fontWeight: 600,
          color: 'var(--prompd-muted)',
          marginBottom: '0.5rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        Pinned Packages
      </div>

      <div
        className="prompd-pinned-list"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        {displayedPackages.map((pkg) => (
          <div
            key={`${pkg.name}@${pkg.version}`}
            className="prompd-pinned-item"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.75rem',
              background: 'var(--prompd-panel)',
              border: '1px solid var(--prompd-border)',
              borderRadius: '0.375rem',
              cursor: onSelect ? 'pointer' : 'default',
              transition: 'all 0.2s',
            }}
            onClick={() => onSelect?.(pkg.name, pkg.version)}
            onMouseEnter={(e) => {
              if (onSelect) {
                e.currentTarget.style.borderColor = 'var(--prompd-accent)'
                e.currentTarget.style.background = 'var(--prompd-accent-bg)'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--prompd-border)'
              e.currentTarget.style.background = 'var(--prompd-panel)'
            }}
          >
            {/* Icon */}
            {pkg.icon && (
              <div className="prompd-pinned-icon" style={{ fontSize: '1.25rem' }}>
                {pkg.icon}
              </div>
            )}

            {/* Package info */}
            <div
              className="prompd-pinned-info"
              style={{
                flex: 1,
                minWidth: 0,
              }}
            >
              <div
                className="prompd-pinned-name"
                style={{
                  fontWeight: 500,
                  fontSize: '0.875rem',
                  color: 'var(--prompd-text)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {pkg.displayName || pkg.name}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginTop: '0.125rem',
                }}
              >
                <div
                  className="prompd-pinned-version"
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--prompd-muted)',
                  }}
                >
                  v{pkg.version}
                </div>
                {onViewPrompt && pkg.promptContent && (
                  <>
                    <span style={{ color: 'var(--prompd-muted)', opacity: 0.4 }}>•</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onViewPrompt(pkg.name, pkg.version)
                      }}
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--prompd-accent)',
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        textDecoration: 'underline',
                      }}
                    >
                      View Prompt
                    </button>
                  </>
                )}
              </div>
              {pkg.description && (
                <div
                  className="prompd-pinned-description"
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--prompd-muted)',
                    marginTop: '0.25rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {pkg.description}
                </div>
              )}
            </div>

            {/* Pin/Unpin button */}
            {(onPin || onUnpin) && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (pkg.pinned && onUnpin) {
                    onUnpin(pkg.name, pkg.version)
                  } else if (!pkg.pinned && onPin) {
                    onPin(pkg.name, pkg.version)
                  }
                }}
                className="prompd-pinned-toggle"
                style={{
                  padding: '0.25rem',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: pkg.pinned ? 'var(--prompd-accent)' : 'var(--prompd-muted)',
                  transition: 'color 0.2s',
                }}
                title={pkg.pinned ? 'Unpin' : 'Pin'}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  style={{
                    display: 'block',
                  }}
                >
                  <path d="M9.828 3h3.982a2 2 0 0 1 1.992 2.181l-.637 7A2 2 0 0 1 13.174 14H2.825a2 2 0 0 1-1.991-1.819l-.637-7a1.99 1.99 0 0 1 .342-1.31L.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3zm-8.322.12C1.72 3.042 1.95 3 2.19 3h5.396l-.707-.707A1 1 0 0 0 6.172 2H2.5a1 1 0 0 0-1 .981l.006.139z" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>

      {hasMore && (
        <div
          className="prompd-pinned-more"
          style={{
            marginTop: '0.5rem',
            fontSize: '0.75rem',
            color: 'var(--prompd-muted)',
            textAlign: 'center',
          }}
        >
          +{packages.length - maxDisplay} more
        </div>
      )}
    </div>
  )
}

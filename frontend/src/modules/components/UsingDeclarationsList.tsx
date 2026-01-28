import { X, Plus } from 'lucide-react'

interface UsingDeclaration {
  prefix: string
  package: string
  version: string
}

interface UsingDeclarationsListProps {
  declarations: UsingDeclaration[]
  onAdd: (prefix: string, packageName: string, version: string) => void
  onRemove: (prefix: string) => void
  className?: string
  readOnly?: boolean
}

export default function UsingDeclarationsList({
  declarations,
  onAdd,
  onRemove,
  className = '',
  readOnly = false
}: UsingDeclarationsListProps) {
  const hasDeclarations = declarations && declarations.length > 0

  return (
    <div className={className}>
      {/* Header */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            <label style={{
              fontSize: '12px',
              fontWeight: '600',
              color: 'var(--text)'
            }}>
              Usings:
            </label>
            <span style={{
              fontSize: '12px',
              color: 'var(--text-secondary)',
              fontStyle: 'italic'
            }}>
              Package imports with namespace aliases for referencing in templates
            </span>
          </div>
          <span style={{
            fontSize: '11px',
            color: 'var(--text-secondary)'
          }}>
            {declarations.length} {declarations.length === 1 ? 'import' : 'imports'}
          </span>
        </div>
      </div>

      {/* Declarations list */}
      {hasDeclarations ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          padding: '8px',
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          maxHeight: '200px',
          overflowY: 'auto'
        }}>
          {declarations.map((decl) => (
            <div
              key={decl.prefix}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                padding: '6px 8px',
                background: 'var(--input-bg)',
                border: '1px solid var(--input-border)',
                borderRadius: '4px',
                transition: 'all 0.2s'
              }}
            >
              {/* Prefix */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flex: 1,
                minWidth: 0
              }}>
                <code style={{
                  fontSize: '12px',
                  fontWeight: '600',
                  color: 'var(--accent)',
                  fontFamily: 'monospace',
                  whiteSpace: 'nowrap'
                }}>
                  {decl.prefix}
                </code>
                <span style={{
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap'
                }}>
                  →
                </span>
                <code style={{
                  fontSize: '11px',
                  color: 'var(--text)',
                  fontFamily: 'monospace',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
                title={`${decl.package}@${decl.version}`}
                >
                  {decl.package}@{decl.version}
                </code>
              </div>

              {/* Remove button */}
              {!readOnly && <button
                onClick={() => onRemove(decl.prefix)}
                style={{
                  padding: '2px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  color: 'var(--text-secondary)',
                  borderRadius: '4px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'
                  e.currentTarget.style.color = 'var(--error)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--text-secondary)'
                }}
                title="Remove import"
              >
                <X size={14} />
              </button>}
            </div>
          ))}
        </div>
      ) : (
        <div style={{
          padding: '12px',
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          textAlign: 'center'
        }}>
          <p style={{
            fontSize: '11px',
            color: 'var(--text-secondary)',
            fontStyle: 'italic'
          }}>
            No package imports. Add imports to reference packages with prefixes.
          </p>
        </div>
      )}

      {/* Helper text */}
      <div style={{
        marginTop: '6px',
        fontSize: '10px',
        color: 'var(--text-secondary)',
        fontStyle: 'italic'
      }}>
        Imports are added automatically when you set a prefix for inherits.
      </div>
    </div>
  )
}

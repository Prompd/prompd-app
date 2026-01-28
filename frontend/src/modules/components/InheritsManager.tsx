import { useState, useEffect } from 'react'
import UsingDeclarationsList from './UsingDeclarationsList'
import PackageSelector from './PackageSelector'
import PrefixSelector from './PrefixSelector'
import FileSelector from './FileSelector'
import { Check, X, ChevronDown, ChevronRight } from 'lucide-react'

interface UsingDeclaration {
  prefix: string
  package: string
  version: string
}

interface PackageSearchResult {
  name: string
  version: string
  description?: string
}

interface InheritsManagerProps {
  // Current inherits value
  inheritsValue: string
  onInheritsChange: (value: string) => void

  // Using declarations
  usingDeclarations: UsingDeclaration[]
  // Extended callback that can also set inherits value in the same update
  onUsingDeclarationsChange: (declarations: UsingDeclaration[], newInheritsValue?: string) => void

  // Package search function
  onPackageSearch: (query: string) => Promise<PackageSearchResult[]>

  // File loading function
  onLoadPackageFiles: (packageName: string, version: string) => Promise<string[]>

  // Optional local file search
  onLocalFileSearch?: (query: string) => Promise<string[]>

  // Optional callback to open inherited file
  onOpenInheritedFile?: () => void

  className?: string
  readOnly?: boolean
}

export default function InheritsManager({
  inheritsValue,
  onInheritsChange,
  usingDeclarations,
  onUsingDeclarationsChange,
  onPackageSearch,
  onLoadPackageFiles,
  onLocalFileSearch,
  onOpenInheritedFile,
  className = '',
  readOnly = false
}: InheritsManagerProps) {
  const [selectedPackage, setSelectedPackage] = useState<{ name: string; version: string } | null>(null)
  const [selectedPrefix, setSelectedPrefix] = useState('')
  const [selectedFile, setSelectedFile] = useState('')
  const [packageFiles, setPackageFiles] = useState<string[]>([])
  const [isLoadingFiles, setIsLoadingFiles] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(!inheritsValue) // Collapsed by default if no inherits value
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  // Drag & drop handlers for local files
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const hasPrompdFile = e.dataTransfer.types.includes('application/x-prompd-file')
    if (hasPrompdFile) {
      setIsDraggingOver(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(false)

    const fileData = e.dataTransfer.getData('application/x-prompd-file')
    if (fileData) {
      try {
        const { path } = JSON.parse(fileData)
        if (path.endsWith('.prmd')) {
          // Set inherits directly with the local path
          onInheritsChange(path)
          setIsEditMode(false)
        }
      } catch (err) {
        console.error('Failed to parse dropped file data:', err)
      }
    }
  }

  // Parse inherits value when it changes and we're not in edit mode
  useEffect(() => {
    // Don't override state while user is editing
    if (isEditMode) {
      return
    }

    if (!inheritsValue) {
      setSelectedPackage(null)
      setSelectedPrefix('')
      setSelectedFile('')
      return
    }

    // Parse inherits - supports two formats:
    // 1. Alias format: "@prefix/path/to/file.prmd" (uses using declarations)
    // 2. Full format: "@package@version/path/to/file.prmd"

    // Try alias format first: @prefix/path
    const aliasMatch = inheritsValue.match(/^(@[^/]+)\/(.+)$/)
    if (aliasMatch) {
      const [, prefix, filePath] = aliasMatch
      // Look up package info from using declarations
      const usingDecl = usingDeclarations.find(d => d.prefix === prefix)
      if (usingDecl) {
        setSelectedPackage({ name: usingDecl.package, version: usingDecl.version })
        setSelectedPrefix(prefix)
        setSelectedFile(filePath)
        return
      }
    }

    // Try full format: @package@version/path
    const fullMatch = inheritsValue.match(/^(.+?)@([^/]+)\/(.+)$/)
    if (fullMatch) {
      const [, packageName, version, filePath] = fullMatch
      setSelectedPackage({ name: packageName, version })
      setSelectedPrefix('')
      setSelectedFile(filePath)
    }
  }, [inheritsValue, isEditMode, usingDeclarations])

  // Load package files when package changes
  useEffect(() => {
    if (!selectedPackage) {
      setPackageFiles([])
      return
    }

    const loadFiles = async () => {
      setIsLoadingFiles(true)
      try {
        const files = await onLoadPackageFiles(selectedPackage.name, selectedPackage.version)
        setPackageFiles(files)
      } catch (err) {
        console.error('Failed to load package files:', err)
        setPackageFiles([])
      } finally {
        setIsLoadingFiles(false)
      }
    }

    loadFiles()
  }, [selectedPackage, onLoadPackageFiles])

  const handlePackageSelect = (packageName: string, version: string) => {
    if (!packageName || !version) {
      setSelectedPackage(null)
      setSelectedFile('')
      return
    }

    setSelectedPackage({ name: packageName, version })
    setSelectedFile('') // Reset file selection when package changes
  }

  const handlePrefixChange = (prefix: string) => {
    setSelectedPrefix(prefix)
  }

  const handleFileSelect = (filePath: string) => {
    setSelectedFile(filePath)
  }

  const handleCommit = () => {
    if (!selectedPackage || !selectedFile) {
      setValidationError('Please select both a package and a file')
      return
    }
    setValidationError(null)

    // Build inherits value
    let inherits = ''
    if (selectedPrefix) {
      // When prefix is provided, use alias format: @prefix/filePath
      inherits = `${selectedPrefix}/${selectedFile}`
    } else {
      // When no prefix, use full format: @package@version/filePath
      inherits = `${selectedPackage.name}@${selectedPackage.version}/${selectedFile}`
    }

    // Update using declarations if prefix is provided
    if (selectedPrefix) {
      const existingDecl = usingDeclarations.find(d => d.prefix === selectedPrefix)
      if (!existingDecl) {
        // Add new using declaration AND set inherits in a single update
        // This ensures both are set atomically so the alias can be resolved
        onUsingDeclarationsChange([
          ...usingDeclarations,
          {
            prefix: selectedPrefix,
            package: selectedPackage.name,
            version: selectedPackage.version
          }
        ], inherits)
        setIsEditMode(false)
        return
      }
    }

    // If no prefix or using declaration already exists, set inherits immediately
    onInheritsChange(inherits)
    setIsEditMode(false)
  }

  const handleCancel = () => {
    // Reset to current inherits value
    if (inheritsValue) {
      // Try alias format first: @prefix/path
      const aliasMatch = inheritsValue.match(/^(@[^/]+)\/(.+)$/)
      if (aliasMatch) {
        const [, prefix, filePath] = aliasMatch
        const usingDecl = usingDeclarations.find(d => d.prefix === prefix)
        if (usingDecl) {
          setSelectedPackage({ name: usingDecl.package, version: usingDecl.version })
          setSelectedPrefix(prefix)
          setSelectedFile(filePath)
          setIsEditMode(false)
          return
        }
      }

      // Try full format: @package@version/path
      const fullMatch = inheritsValue.match(/^(.+?)@([^/]+)\/(.+)$/)
      if (fullMatch) {
        const [, packageName, version, filePath] = fullMatch
        setSelectedPackage({ name: packageName, version })
        setSelectedPrefix('')
        setSelectedFile(filePath)
      }
    } else {
      setSelectedPackage(null)
      setSelectedPrefix('')
      setSelectedFile('')
    }
    setIsEditMode(false)
  }

  const handleClearInherits = () => {
    // Only clear inherits, keep using declarations
    onInheritsChange('')
    setSelectedPackage(null)
    setSelectedPrefix('')
    setSelectedFile('')
    setIsEditMode(false)
  }

  const handleLocalFileSelect = (filePath: string) => {
    // Directly set inherits to local file path
    onInheritsChange(filePath)
    setIsEditMode(false)
  }

  const handleRemoveUsing = (prefix: string) => {
    onUsingDeclarationsChange(usingDeclarations.filter(d => d.prefix !== prefix))
  }

  const handleAddUsing = (prefix: string, packageName: string, version: string) => {
    onUsingDeclarationsChange([
      ...usingDeclarations,
      { prefix, package: packageName, version }
    ])
  }

  const existingPrefixes = usingDeclarations.map(d => d.prefix)

  return (
    <div className={className}>
      {/* Using Declarations List */}
      <UsingDeclarationsList
        declarations={usingDeclarations}
        onAdd={handleAddUsing}
        onRemove={handleRemoveUsing}
        className="mb-4"
        readOnly={readOnly}
      />

      {/* Inherits Section */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          padding: '12px',
          background: isDraggingOver ? 'var(--accent-bg)' : 'var(--panel)',
          border: `2px solid ${isDraggingOver ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: '8px',
          transition: 'all 0.2s'
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: isCollapsed ? 0 : '12px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, cursor: 'pointer', minWidth: 0 }} onClick={() => {
              const newCollapsed = !isCollapsed
              setIsCollapsed(newCollapsed)
              // If expanding and no inherits value, enter edit mode
              if (!newCollapsed && !inheritsValue) {
                setIsEditMode(true)
              }
            }}>
              {isCollapsed ? <ChevronRight size={14} style={{ flexShrink: 0 }} /> : <ChevronDown size={14} style={{ flexShrink: 0 }} />}
              <label style={{
                fontSize: '12px',
                fontWeight: '600',
                color: 'var(--text)',
                cursor: 'pointer',
                flexShrink: 0
              }}>
                Inherits:
              </label>
              {isCollapsed && inheritsValue ? (
                <code style={{
                  fontSize: '11px',
                  color: 'var(--accent)',
                  fontFamily: 'monospace',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {inheritsValue}
                </code>
              ) : (
                <span style={{
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  fontStyle: 'italic'
                }}>
                  Base template to extend with sections and parameters
                </span>
              )}
            </div>
            {inheritsValue && !isEditMode && !isCollapsed && !readOnly && (
              <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => setIsEditMode(true)}
                style={{
                  padding: '4px 8px',
                  fontSize: '10px',
                  background: 'transparent',
                  color: 'var(--accent)',
                  border: '1px solid var(--accent)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--accent)'
                  e.currentTarget.style.color = 'white'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--accent)'
                }}
              >
                Edit
              </button>
              <button
                onClick={handleClearInherits}
                style={{
                  padding: '4px 8px',
                  fontSize: '10px',
                  background: 'transparent',
                  color: 'var(--error)',
                  border: '1px solid var(--error)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--error)'
                  e.currentTarget.style.color = 'white'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--error)'
                }}
              >
                Clear
              </button>
              </div>
            )}
          </div>
        </div>

        {/* Content - only show when not collapsed */}
        {!isCollapsed && (
          <>
        {/* Current inherits display (when not editing) */}
        {inheritsValue && !isEditMode && (
          <div
            onClick={onOpenInheritedFile}
            style={{
              padding: '8px 12px',
              background: 'var(--input-bg)',
              border: '1px solid var(--input-border)',
              borderRadius: '6px',
              marginBottom: '12px',
              cursor: onOpenInheritedFile ? 'pointer' : 'default',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (onOpenInheritedFile) {
                e.currentTarget.style.background = 'var(--hover)'
                e.currentTarget.style.borderColor = 'var(--accent)'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--input-bg)'
              e.currentTarget.style.borderColor = 'var(--input-border)'
            }}
            title={onOpenInheritedFile ? 'Click to open inherited file' : ''}
          >
            <code style={{
              fontSize: '12px',
              color: onOpenInheritedFile ? 'var(--accent)' : 'var(--text)',
              fontFamily: 'monospace',
              wordBreak: 'break-all',
              textDecoration: onOpenInheritedFile ? 'underline' : 'none',
              textDecorationStyle: 'dotted'
            }}>
              {inheritsValue}
            </code>
          </div>
        )}

        {/* Edit/Create interface */}
        {(!inheritsValue || isEditMode) && !readOnly && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <PackageSelector
              selectedPackage={selectedPackage}
              onSelect={handlePackageSelect}
              onSearch={onPackageSearch}
              onLocalFileSearch={onLocalFileSearch}
              onLocalFileSelect={handleLocalFileSelect}
            />

            <PrefixSelector
              value={selectedPrefix}
              onChange={handlePrefixChange}
              existingPrefixes={existingPrefixes}
              selectedPackage={selectedPackage}
            />

            <FileSelector
              selectedFile={selectedFile}
              onSelect={handleFileSelect}
              files={packageFiles}
              isLoading={isLoadingFiles}
              selectedPackage={selectedPackage}
            />

            {/* Validation Error */}
            {validationError && (
              <div style={{
                padding: '8px 12px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '6px',
                marginTop: '4px',
                fontSize: '12px',
                color: '#ef4444'
              }}>
                {validationError}
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button
                onClick={handleCommit}
                disabled={!selectedPackage || !selectedFile}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  fontSize: '12px',
                  background: selectedPackage && selectedFile ? 'var(--accent)' : 'var(--panel-2)',
                  color: selectedPackage && selectedFile ? 'white' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: selectedPackage && selectedFile ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  fontWeight: '600',
                  transition: 'all 0.2s'
                }}
              >
                <Check size={14} />
                Save
              </button>
              {(isEditMode || inheritsValue) && (
                <button
                  onClick={handleCancel}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    fontSize: '12px',
                    background: 'transparent',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--hover)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <X size={14} />
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!inheritsValue && !isEditMode && (
          <div style={{
            padding: '12px',
            textAlign: 'center'
          }}>
            <p style={{
              fontSize: '11px',
              color: 'var(--text-secondary)',
              fontStyle: 'italic'
            }}>
              No template inheritance configured. Click the chevron to expand and configure.
            </p>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  )
}

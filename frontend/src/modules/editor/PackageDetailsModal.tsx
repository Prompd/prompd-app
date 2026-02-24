import { useState, useEffect } from 'react'
import { X, Package, FileText, GitBranch, Download, ExternalLink, FolderOpen, Folder, ChevronRight, ChevronDown, Clock, Copy, Check, User, Tag, Star, Play, BookOpen, Terminal, Sparkles, Globe, Calendar, CheckCircle } from 'lucide-react'
import { type RegistryPackage, registryApi } from '../services/registryApi'
import { packageCache, type FileNode } from '../services/packageCache'
import Editor from '@monaco-editor/react'
import { useUIStore, selectTheme } from '../../stores/uiStore'
import { getMonacoTheme, registerPrompdThemes } from '../lib/monacoConfig'
import { stripContentFrontmatter } from '../lib/prompdParser'
import { RESOURCE_TYPE_ICONS, RESOURCE_TYPE_COLORS, RESOURCE_TYPE_LABELS, type ResourceType } from '../services/resourceTypes'

interface Props {
  package: RegistryPackage
  onClose: () => void
  onOpenInEditor?: (content: string, filename: string, packageId: string, filePath: string) => void
  onUseAsTemplate?: (content: string, filename: string, packageId: string, filePath: string) => void
  /** If provided, opens directly to the Files tab and selects this file */
  initialFile?: string
}

type TabKey = 'overview' | 'files' | 'versions'

export default function PackageDetailsModal({ package: pkg, onClose, onOpenInEditor, onUseAsTemplate, initialFile }: Props) {
  const theme = useUIStore(selectTheme)
  const [activeTab, setActiveTab] = useState<TabKey>(initialFile ? 'files' : 'overview')
  const [fileTree, setFileTree] = useState<FileNode[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [loadingContent, setLoadingContent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [versions, setVersions] = useState<string[]>([])
  const [loadingVersions, setLoadingVersions] = useState(false)

  const packageId = `${pkg.name}@${pkg.version}`
  const isDark = theme === 'dark'
  const monacoTheme = getMonacoTheme(isDark)

  // Download and cache package when Files tab is opened
  useEffect(() => {
    if (activeTab === 'files' && fileTree.length === 0 && !loadingFiles) {
      loadPackage()
    }
  }, [activeTab])

  // Auto-select initialFile once the file tree is loaded
  useEffect(() => {
    if (initialFile && fileTree.length > 0 && !selectedFile) {
      // Expand parent folders for the initial file
      const parts = initialFile.split('/')
      const foldersToExpand = new Set(expandedFolders)
      for (let i = 1; i < parts.length; i++) {
        foldersToExpand.add(parts.slice(0, i).join('/'))
      }
      setExpandedFolders(foldersToExpand)
      handleFileClick(initialFile)
    }
  }, [fileTree, initialFile])

  // Load versions when Versions tab is opened
  useEffect(() => {
    if (activeTab === 'versions' && versions.length === 0 && !loadingVersions) {
      loadVersions()
    }
  }, [activeTab])

  const loadPackage = async () => {
    setLoadingFiles(true)
    setError(null)

    try {
      // Use packageCache service to download and cache
      const cachedPackage = await packageCache.downloadAndCache(pkg.name, pkg.version)
      console.log('PackageDetailsModal: Received file tree:', cachedPackage.fileTree)

      if (!cachedPackage.fileTree || cachedPackage.fileTree.length === 0) {
        throw new Error('Package contains no files')
      }

      setFileTree(cachedPackage.fileTree)

      // Auto-expand root level
      const rootFolders = cachedPackage.fileTree.filter(n => n.kind === 'folder').map(n => n.path)
      setExpandedFolders(new Set(rootFolders))
    } catch (err: any) {
      console.error('Failed to load package:', err)
      setError(err.message || 'Failed to load package')
    } finally {
      setLoadingFiles(false)
    }
  }

  const handleFileClick = async (filePath: string) => {
    setSelectedFile(filePath)
    setLoadingContent(true)
    setError(null)

    try {
      // Use packageCache service to get file content
      const content = await packageCache.getFileContent(packageId, filePath)
      if (!content) {
        throw new Error('File not found in package')
      }

      // Strip prompd content frontmatter if present (security layer for packaged code files)
      const displayContent = stripContentFrontmatter(content)
      setFileContent(displayContent)
    } catch (err: any) {
      console.error('Failed to load file content:', err)
      setError(err.message || 'Failed to load file content')
      setFileContent(null)
    } finally {
      setLoadingContent(false)
    }
  }

  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
    }
    setExpandedFolders(newExpanded)
  }

  const handleOpenInEditor = () => {
    if (selectedFile && fileContent && onOpenInEditor) {
      const filename = selectedFile.split('/').pop() || 'file.prmd'
      onOpenInEditor(fileContent, filename, packageId, selectedFile)
    }
  }

  const handleUseAsTemplate = () => {
    if (selectedFile && fileContent && onUseAsTemplate) {
      const filename = selectedFile.split('/').pop() || 'template.prmd'
      onUseAsTemplate(fileContent, filename, packageId, selectedFile)
      onClose() // Close modal after using as template
    }
  }

  const loadVersions = async () => {
    setLoadingVersions(true)
    setError(null)

    try {
      const versionList = await registryApi.getPackageVersions(pkg.name)
      setVersions(versionList)
    } catch (err: any) {
      console.error('Failed to load versions:', err)
      setError(err.message || 'Failed to load versions')
    } finally {
      setLoadingVersions(false)
    }
  }

  const handleVersionDownload = async (version: string) => {
    try {
      await packageCache.downloadAndCache(pkg.name, version)
      setSuccessMessage(`Package ${pkg.name}@${version} cached successfully!`)
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err: any) {
      console.error('Failed to cache version:', err)
      setError(`Failed to cache version: ${err.message}`)
      setTimeout(() => setError(null), 5000)
    }
  }

  const getLanguageFromFilename = (filename: string | null): string => {
    if (!filename) return 'plaintext'

    const ext = filename.split('.').pop()?.toLowerCase()
    const languageMap: Record<string, string> = {
      'prmd': 'markdown',
      'md': 'markdown',
      'json': 'json',
      'yaml': 'yaml',
      'yml': 'yaml',
      'js': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'jsx': 'javascript',
      'py': 'python',
      'sh': 'shell',
      'txt': 'plaintext'
    }

    return languageMap[ext || ''] || 'plaintext'
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    }}
    onClick={(e) => {
      if (e.target === e.currentTarget) onClose()
    }}
    >
      <div style={{
        background: 'var(--panel)',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        width: '100%',
        maxWidth: '1200px',
        height: '80vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
      onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {(() => {
              const headerType = (pkg.type || 'package') as ResourceType
              const HeaderIcon = RESOURCE_TYPE_ICONS[headerType] || Package
              const headerColor = RESOURCE_TYPE_COLORS[headerType] || '#3b82f6'
              return (
                <>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    background: headerColor,
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <HeaderIcon size={24} color="white" />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        fontSize: '18px',
                        fontWeight: 600,
                        color: 'var(--text)',
                        fontFamily: 'monospace'
                      }}>
                        {pkg.name}
                      </div>
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '2px 8px',
                        fontSize: '11px',
                        fontWeight: 500,
                        color: headerColor,
                        background: `${headerColor}20`,
                        borderRadius: '4px',
                      }}>
                        {RESOURCE_TYPE_LABELS[headerType] || headerType}
                      </div>
                    </div>
                    <div style={{
                      fontSize: '13px',
                      color: 'var(--text-secondary)',
                      fontFamily: 'monospace'
                    }}>
                      v{pkg.version}
                    </div>
                  </div>
                </>
              )
            })()}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: '8px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--panel-2)'
              e.currentTarget.style.color = 'var(--text)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--text-secondary)'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--border)',
          background: 'var(--panel-2)',
          padding: '0 24px'
        }}>
          {[
            { key: 'overview' as TabKey, label: 'Overview', icon: <FileText size={14} /> },
            { key: 'files' as TabKey, label: 'Files', icon: <FolderOpen size={14} /> },
            { key: 'versions' as TabKey, label: 'Versions', icon: <GitBranch size={14} /> }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '12px 16px',
                fontSize: '13px',
                fontWeight: 500,
                background: 'transparent',
                color: activeTab === tab.key ? 'var(--accent)' : 'var(--text-secondary)',
                border: 'none',
                borderBottom: activeTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                if (activeTab !== tab.key) {
                  e.currentTarget.style.color = 'var(--text)'
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== tab.key) {
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
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {activeTab === 'overview' && (
            <OverviewTab
              pkg={pkg}
              onUseAsTemplate={() => {
                // Switch to files tab and auto-select main file
                setActiveTab('files')
              }}
              onOpenFiles={() => setActiveTab('files')}
            />
          )}

          {activeTab === 'files' && (
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              {/* File Tree (Left Pane) */}
              <div style={{
                width: '300px',
                borderRight: '1px solid var(--border)',
                overflow: 'auto',
                background: 'var(--panel-2)'
              }}>
                {loadingFiles && (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                    <Package size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
                    <div>Loading package files...</div>
                  </div>
                )}
                {error && !loadingFiles && (
                  <div style={{ padding: '20px', color: 'var(--error)', fontSize: '12px' }}>
                    <strong>Error:</strong> {error}
                  </div>
                )}
                {!loadingFiles && !error && fileTree.length > 0 && (
                  <FileTreeView
                    nodes={fileTree}
                    selectedFile={selectedFile}
                    expandedFolders={expandedFolders}
                    onFileClick={handleFileClick}
                    onFolderToggle={toggleFolder}
                  />
                )}
              </div>

              {/* File Preview (Right Pane) */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {!selectedFile && (
                  <div style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-secondary)',
                    fontSize: '13px',
                    flexDirection: 'column',
                    gap: '12px'
                  }}>
                    <FileText size={32} opacity={0.5} />
                    <div>Select a file to preview</div>
                  </div>
                )}
                {selectedFile && (
                  <>
                    {/* File header */}
                    <div style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--border)',
                      background: 'var(--panel-2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <div style={{
                        fontSize: '13px',
                        fontFamily: 'monospace',
                        color: 'var(--text)',
                        fontWeight: 500
                      }}>
                        {selectedFile}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {selectedFile.endsWith('.prmd') && onUseAsTemplate && (
                          <button
                            onClick={handleUseAsTemplate}
                            style={{
                              padding: '6px 12px',
                              fontSize: '12px',
                              background: 'var(--accent)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontWeight: 500
                            }}
                          >
                            Use as Template
                          </button>
                        )}
                        {onOpenInEditor && (
                          <button
                            onClick={handleOpenInEditor}
                            style={{
                              padding: '6px 12px',
                              fontSize: '12px',
                              background: 'var(--panel)',
                              color: 'var(--text)',
                              border: '1px solid var(--border)',
                              borderRadius: '4px',
                              cursor: 'pointer'
                            }}
                          >
                            Open in Editor
                          </button>
                        )}
                      </div>
                    </div>

                    {/* File content - Monaco Editor */}
                    <div style={{ flex: 1, overflow: 'hidden', background: 'var(--panel)' }}>
                      {loadingContent && (
                        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px', padding: '40px' }}>
                          Loading file content...
                        </div>
                      )}
                      {!loadingContent && fileContent && (
                        <Editor
                          height="100%"
                          language={getLanguageFromFilename(selectedFile)}
                          value={fileContent}
                          theme={monacoTheme}
                          beforeMount={registerPrompdThemes}
                          options={{
                            readOnly: true,
                            minimap: { enabled: false },
                            fontSize: 13,
                            lineNumbers: 'on',
                            scrollBeyondLastLine: false,
                            wordWrap: 'on',
                            renderWhitespace: 'none',
                            folding: true,
                            glyphMargin: false,
                            lineDecorationsWidth: 0,
                            lineNumbersMinChars: 3,
                            padding: { top: 16, bottom: 16 }
                          }}
                        />
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {activeTab === 'versions' && (
            <div style={{ padding: '24px', overflow: 'auto' }}>
              {loadingVersions && (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px', padding: '40px' }}>
                  <Package size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
                  <div>Loading version history...</div>
                </div>
              )}
              {error && !loadingVersions && (
                <div style={{ padding: '20px', color: 'var(--error)', fontSize: '12px', textAlign: 'center' }}>
                  <strong>Error:</strong> {error}
                </div>
              )}
              {successMessage && (
                <div style={{
                  padding: '12px 16px',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: '8px',
                  marginBottom: '16px',
                  color: '#10b981',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <Check size={16} />
                  {successMessage}
                </div>
              )}
              {!loadingVersions && !error && versions.length > 0 && (
                <div style={{ maxWidth: '800px' }}>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
                    Available Versions ({versions.length})
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {versions.map((version) => {
                      const isCurrentVersion = version === pkg.version
                      return (
                        <div
                          key={version}
                          style={{
                            padding: '12px 16px',
                            background: isCurrentVersion ? 'rgba(124, 58, 237, 0.1)' : 'var(--panel-2)',
                            border: isCurrentVersion ? '1px solid var(--accent)' : '1px solid var(--border)',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                              width: '32px',
                              height: '32px',
                              background: isCurrentVersion ? 'var(--accent)' : 'var(--panel)',
                              border: '1px solid var(--border)',
                              borderRadius: '6px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              <GitBranch size={16} color={isCurrentVersion ? 'white' : 'var(--text)'} />
                            </div>
                            <div>
                              <div style={{
                                fontSize: '14px',
                                fontWeight: isCurrentVersion ? 600 : 500,
                                color: 'var(--text)',
                                fontFamily: 'monospace',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                              }}>
                                v{version}
                                {isCurrentVersion && (
                                  <span style={{
                                    padding: '2px 8px',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    background: 'var(--accent)',
                                    color: 'white',
                                    borderRadius: '4px'
                                  }}>
                                    CURRENT
                                  </span>
                                )}
                              </div>
                              <div style={{
                                fontSize: '12px',
                                color: 'var(--text-secondary)',
                                marginTop: '2px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                <Clock size={12} />
                                Published version
                              </div>
                            </div>
                          </div>
                          {!isCurrentVersion && (
                            <button
                              onClick={() => handleVersionDownload(version)}
                              style={{
                                padding: '6px 12px',
                                fontSize: '12px',
                                background: 'var(--panel)',
                                color: 'var(--text)',
                                border: '1px solid var(--border)',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontWeight: 500
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'var(--accent)'
                                e.currentTarget.style.color = 'white'
                                e.currentTarget.style.borderColor = 'var(--accent)'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'var(--panel)'
                                e.currentTarget.style.color = 'var(--text)'
                                e.currentTarget.style.borderColor = 'var(--border)'
                              }}
                            >
                              Download & Cache
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {!loadingVersions && !error && versions.length === 0 && (
                <div style={{
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: '13px',
                  padding: '40px'
                }}>
                  <GitBranch size={32} opacity={0.5} style={{ marginBottom: '12px' }} />
                  <div>No version history available</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// FileTreeView component
interface FileTreeViewProps {
  nodes: FileNode[]
  selectedFile: string | null
  expandedFolders: Set<string>
  onFileClick: (path: string) => void
  onFolderToggle: (path: string) => void
  depth?: number
}

function FileTreeView({ nodes, selectedFile, expandedFolders, onFileClick, onFolderToggle, depth = 0 }: FileTreeViewProps) {
  return (
    <div>
      {nodes.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          selectedFile={selectedFile}
          expandedFolders={expandedFolders}
          onFileClick={onFileClick}
          onFolderToggle={onFolderToggle}
          depth={depth}
        />
      ))}
    </div>
  )
}

interface FileTreeNodeProps {
  node: FileNode
  selectedFile: string | null
  expandedFolders: Set<string>
  onFileClick: (path: string) => void
  onFolderToggle: (path: string) => void
  depth: number
}

function FileTreeNode({ node, selectedFile, expandedFolders, onFileClick, onFolderToggle, depth }: FileTreeNodeProps) {
  const isExpanded = expandedFolders.has(node.path)
  const isSelected = selectedFile === node.path
  const [isHovered, setIsHovered] = useState(false)

  const handleClick = () => {
    if (node.kind === 'folder') {
      onFolderToggle(node.path)
    } else {
      onFileClick(node.path)
    }
  }

  return (
    <div>
      <div
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          padding: '6px 12px 6px ' + (12 + depth * 16) + 'px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '13px',
          color: isSelected ? 'var(--accent)' : 'var(--text)',
          background: isSelected ? 'rgba(124, 58, 237, 0.1)' : isHovered ? 'var(--panel)' : 'transparent',
          fontWeight: isSelected ? 500 : 400,
          transition: 'all 0.15s'
        }}
      >
        {node.kind === 'folder' && (
          <>
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />}
          </>
        )}
        {node.kind === 'file' && (
          <>
            <span style={{ width: '14px' }} />
            <FileText size={14} />
          </>
        )}
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.name}
        </span>
      </div>
      {node.kind === 'folder' && isExpanded && node.children && (
        <FileTreeView
          nodes={node.children}
          selectedFile={selectedFile}
          expandedFolders={expandedFolders}
          onFileClick={onFileClick}
          onFolderToggle={onFolderToggle}
          depth={depth + 1}
        />
      )}
    </div>
  )
}

// Overview Tab Component - Rich package overview
interface OverviewTabProps {
  pkg: RegistryPackage
  onUseAsTemplate: () => void
  onOpenFiles: () => void
}

function OverviewTab({ pkg, onUseAsTemplate, onOpenFiles }: OverviewTabProps) {
  const [copied, setCopied] = useState(false)
  const [versionCount, setVersionCount] = useState<number | null>(null)
  const [loadingVersions, setLoadingVersions] = useState(true)

  // Fetch version count on mount
  useEffect(() => {
    const fetchVersions = async () => {
      try {
        const versions = await registryApi.getPackageVersions(pkg.name)
        setVersionCount(versions.length)
      } catch (err) {
        console.error('Failed to fetch versions:', err)
        setVersionCount(null)
      } finally {
        setLoadingVersions(false)
      }
    }
    fetchVersions()
  }, [pkg.name])

  const installCommand = `prompd install ${pkg.name}@${pkg.version}`

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(installCommand)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Format date helper
  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return null
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    } catch {
      return null
    }
  }

  // Stat card component
  const StatCard = ({ icon, label, value, accent = false }: { icon: React.ReactNode; label: string; value: string | number; accent?: boolean }) => (
    <div style={{
      padding: '16px',
      background: accent ? 'linear-gradient(135deg, rgba(124, 58, 237, 0.15), rgba(124, 58, 237, 0.05))' : 'var(--panel-2)',
      border: accent ? '1px solid rgba(124, 58, 237, 0.3)' : '1px solid var(--border)',
      borderRadius: '10px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: accent ? 'var(--accent)' : 'var(--text-secondary)' }}>
        {icon}
        <span style={{ fontSize: '12px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
      </div>
      <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text)', fontFamily: typeof value === 'number' ? 'monospace' : 'inherit' }}>
        {value}
      </div>
    </div>
  )

  return (
    <div style={{ padding: '24px', overflow: 'auto' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>

        {/* Hero Section */}
        <div style={{
          background: 'linear-gradient(135deg, var(--panel-2), var(--panel))',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '28px',
          marginBottom: '24px'
        }}>
          {/* Namespace Badge */}
          {pkg.namespace && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              background: pkg.namespace.verified ? 'rgba(34, 197, 94, 0.1)' : 'var(--panel)',
              border: pkg.namespace.verified ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid var(--border)',
              borderRadius: '16px',
              marginBottom: '16px',
              fontSize: '12px',
              fontWeight: 500
            }}>
              {pkg.namespace.verified && <CheckCircle size={12} style={{ color: '#22c55e' }} />}
              <span style={{ color: pkg.namespace.verified ? '#22c55e' : 'var(--text-secondary)' }}>
                {pkg.namespace.name}
              </span>
              {pkg.namespace.verified && (
                <span style={{ color: '#22c55e', fontSize: '10px', fontWeight: 600 }}>VERIFIED</span>
              )}
            </div>
          )}

          {/* Description */}
          <p style={{
            margin: '0 0 24px 0',
            fontSize: '16px',
            color: 'var(--text)',
            lineHeight: '1.7',
            maxWidth: '700px'
          }}>
            {pkg.description || 'No description available for this package.'}
          </p>

          {/* Install Command */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '8px',
              color: 'var(--text-secondary)',
              fontSize: '12px',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              <Terminal size={14} />
              Install
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '12px 16px',
              fontFamily: 'monospace',
              fontSize: '14px',
              color: 'var(--text)'
            }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {installCommand}
              </span>
              <button
                onClick={copyToClipboard}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '4px',
                  cursor: 'pointer',
                  color: copied ? 'var(--success)' : 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: '4px',
                  transition: 'all 0.2s'
                }}
                title={copied ? 'Copied!' : 'Copy to clipboard'}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </div>

          {/* Quick Actions */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={onOpenFiles}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: 500,
                background: 'var(--accent)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s'
              }}
            >
              <FolderOpen size={16} />
              Browse Files
            </button>
            <button
              onClick={onUseAsTemplate}
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: 500,
                background: 'var(--panel)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s'
              }}
            >
              <Sparkles size={16} />
              Use as Template
            </button>
            {pkg.homepage && (
              <a
                href={pkg.homepage}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: 500,
                  background: 'var(--panel)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  textDecoration: 'none',
                  transition: 'all 0.2s'
                }}
              >
                <Globe size={16} />
                Homepage
              </a>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px',
          marginBottom: '24px'
        }}>
          <StatCard
            icon={<GitBranch size={16} />}
            label="Version"
            value={`v${pkg.version}`}
            accent
          />
          <StatCard
            icon={<Download size={16} />}
            label="Downloads"
            value={pkg.downloads?.toLocaleString() ?? '0'}
          />
          <StatCard
            icon={<Star size={16} />}
            label="Stars"
            value={pkg.stars ?? 0}
          />
          <StatCard
            icon={<FileText size={16} />}
            label="Files"
            value={pkg.fileCount ?? pkg.files?.length ?? '-'}
          />
          <StatCard
            icon={<Clock size={16} />}
            label="Versions"
            value={loadingVersions ? '...' : (versionCount ?? '-')}
          />
        </div>

        {/* Metadata Row */}
        {(pkg.publishedAt || pkg.updatedAt || pkg.owner || pkg.type) && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '16px',
            padding: '16px',
            background: 'var(--panel-2)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            marginBottom: '24px',
            fontSize: '13px'
          }}>
            {pkg.owner?.handle && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                <User size={14} />
                <span>Owner:</span>
                <span style={{ color: 'var(--text)', fontWeight: 500 }}>@{pkg.owner.handle}</span>
              </div>
            )}
            {(() => {
              const detailType = (pkg.type || 'package') as ResourceType
              const DetailTypeIcon = RESOURCE_TYPE_ICONS[detailType] || Package
              const detailTypeColor = RESOURCE_TYPE_COLORS[detailType] || '#3b82f6'
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                  <DetailTypeIcon size={14} style={{ color: detailTypeColor }} />
                  <span>Type:</span>
                  <span style={{
                    color: detailTypeColor,
                    fontWeight: 500,
                    padding: '1px 8px',
                    background: `${detailTypeColor}15`,
                    borderRadius: '4px',
                    fontSize: '12px',
                  }}>
                    {RESOURCE_TYPE_LABELS[detailType] || pkg.type}
                  </span>
                </div>
              )
            })()}
            {formatDate(pkg.publishedAt) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                <Calendar size={14} />
                <span>Published:</span>
                <span style={{ color: 'var(--text)', fontWeight: 500 }}>{formatDate(pkg.publishedAt)}</span>
              </div>
            )}
            {formatDate(pkg.updatedAt) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                <Clock size={14} />
                <span>Updated:</span>
                <span style={{ color: 'var(--text)', fontWeight: 500 }}>{formatDate(pkg.updatedAt)}</span>
              </div>
            )}
          </div>
        )}

        {/* Two Column Layout */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>

          {/* Left Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Author */}
            {pkg.author && (
              <div style={{
                padding: '16px',
                background: 'var(--panel-2)',
                border: '1px solid var(--border)',
                borderRadius: '10px'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '12px',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  <User size={14} />
                  Author
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--accent), #8b5cf6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: 600,
                    fontSize: '14px'
                  }}>
                    {pkg.author.charAt(0).toUpperCase()}
                  </div>
                  <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text)' }}>
                    {pkg.author}
                  </span>
                </div>
              </div>
            )}

            {/* Parameters */}
            {pkg.parameters && pkg.parameters.length > 0 && (
              <div style={{
                padding: '16px',
                background: 'var(--panel-2)',
                border: '1px solid var(--border)',
                borderRadius: '10px'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '12px',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  <Play size={14} />
                  Parameters ({pkg.parameters.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {pkg.parameters.slice(0, 5).map((param, idx) => (
                    <div key={idx} style={{
                      padding: '10px 12px',
                      background: 'var(--panel)',
                      borderRadius: '6px',
                      border: '1px solid var(--border)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <code style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color: 'var(--accent)',
                          background: 'rgba(124, 58, 237, 0.1)',
                          padding: '2px 6px',
                          borderRadius: '4px'
                        }}>
                          {param.name}
                        </code>
                        <span style={{
                          fontSize: '11px',
                          color: 'var(--text-secondary)',
                          fontFamily: 'monospace'
                        }}>
                          {param.type}
                        </span>
                        {param.required && (
                          <span style={{
                            fontSize: '10px',
                            color: 'var(--error)',
                            fontWeight: 600
                          }}>
                            required
                          </span>
                        )}
                      </div>
                      {param.description && (
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                          {param.description}
                        </div>
                      )}
                    </div>
                  ))}
                  {pkg.parameters.length > 5 && (
                    <div style={{
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      textAlign: 'center',
                      padding: '8px'
                    }}>
                      + {pkg.parameters.length - 5} more parameters
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Keywords */}
            {pkg.keywords && pkg.keywords.length > 0 && (
              <div style={{
                padding: '16px',
                background: 'var(--panel-2)',
                border: '1px solid var(--border)',
                borderRadius: '10px'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '12px',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  <Tag size={14} />
                  Keywords
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {pkg.keywords.map((keyword, idx) => (
                    <span
                      key={idx}
                      style={{
                        padding: '6px 12px',
                        fontSize: '12px',
                        background: 'var(--panel)',
                        border: '1px solid var(--border)',
                        borderRadius: '20px',
                        color: 'var(--text)',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Exports */}
            {pkg.exports && Object.keys(pkg.exports).length > 0 && (
              <div style={{
                padding: '16px',
                background: 'var(--panel-2)',
                border: '1px solid var(--border)',
                borderRadius: '10px'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '12px',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  <BookOpen size={14} />
                  Exports ({Object.keys(pkg.exports).length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {Object.entries(pkg.exports).slice(0, 6).map(([name, path]) => (
                    <div key={name} style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      background: 'var(--panel)',
                      borderRadius: '6px',
                      border: '1px solid var(--border)',
                      fontFamily: 'monospace',
                      fontSize: '12px'
                    }}>
                      <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{name}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{path}</span>
                    </div>
                  ))}
                  {Object.keys(pkg.exports).length > 6 && (
                    <div style={{
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      textAlign: 'center',
                      padding: '8px'
                    }}>
                      + {Object.keys(pkg.exports).length - 6} more exports
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Repository */}
            {pkg.repository && (
              <div style={{
                padding: '16px',
                background: 'var(--panel-2)',
                border: '1px solid var(--border)',
                borderRadius: '10px'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '12px',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  <GitBranch size={14} />
                  Repository
                </div>
                <a
                  href={pkg.repository.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 12px',
                    background: 'var(--panel)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: 'var(--accent)',
                    textDecoration: 'none',
                    fontSize: '13px',
                    transition: 'all 0.2s'
                  }}
                >
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {pkg.repository.url.replace(/^https?:\/\//, '')}
                  </span>
                  <ExternalLink size={14} />
                </a>
              </div>
            )}
          </div>
        </div>

        {/* README Section */}
        {pkg.readme && (
          <div style={{
            marginTop: '24px',
            padding: '16px',
            background: 'var(--panel-2)',
            border: '1px solid var(--border)',
            borderRadius: '10px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '12px',
              color: 'var(--text-secondary)',
              fontSize: '12px',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              <BookOpen size={14} />
              README
            </div>
            <div
              style={{
                padding: '16px',
                background: 'var(--panel)',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                fontSize: '14px',
                lineHeight: '1.6',
                color: 'var(--text)',
                maxHeight: '300px',
                overflow: 'auto',
                whiteSpace: 'pre-wrap'
              }}
              dangerouslySetInnerHTML={{ __html: pkg.readme }}
            />
          </div>
        )}

        {/* Examples Section */}
        {pkg.examples && pkg.examples.length > 0 && (
          <div style={{
            marginTop: '24px',
            padding: '16px',
            background: 'var(--panel-2)',
            border: '1px solid var(--border)',
            borderRadius: '10px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '12px',
              color: 'var(--text-secondary)',
              fontSize: '12px',
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              <BookOpen size={14} />
              Examples
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {pkg.examples.map((example, idx) => (
                <code key={idx} style={{
                  display: 'block',
                  padding: '12px',
                  background: 'var(--panel)',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  fontSize: '13px',
                  color: 'var(--text)',
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'monospace'
                }}>
                  {example}
                </code>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { X, Package, FileText, FolderOpen, Folder, ChevronRight, ChevronDown, BookOpen } from 'lucide-react'
import { packageCache, type FileNode } from '../services/packageCache'
import Editor from '@monaco-editor/react'
import { useUIStore, selectTheme } from '../../stores/uiStore'
import { getMonacoTheme } from '../lib/monacoConfig'
import MarkdownPreview from '../components/MarkdownPreview'
import { stripContentFrontmatter } from '../lib/prompdParser'
import { RESOURCE_TYPE_ICONS, RESOURCE_TYPE_COLORS, RESOURCE_TYPE_LABELS, type ResourceType } from '../services/resourceTypes'

interface LocalPackageInfo {
  manifest: {
    name: string
    version: string
    type?: string
    description?: string
    author?: string
    main?: string
    readme?: string
    files?: string[]
  } | null
  fileTree: FileNode[]
  getFileContent: (filePath: string) => Promise<string | null>
  fileName: string
}

interface Props {
  packageInfo: LocalPackageInfo
  onClose: () => void
  onOpenInEditor?: (content: string, filename: string) => void
  onUseAsTemplate?: (content: string, filename: string) => void
}

type TabKey = 'overview' | 'files'

export default function LocalPackageModal({ packageInfo, onClose, onOpenInEditor, onUseAsTemplate }: Props) {
  const theme = useUIStore(selectTheme)
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [loadingContent, setLoadingContent] = useState(false)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [readmeContent, setReadmeContent] = useState<string | null>(null)
  const [loadingReadme, setLoadingReadme] = useState(false)

  const isDark = theme === 'dark'
  const monacoTheme = getMonacoTheme(isDark)

  const { manifest, fileTree, getFileContent, fileName } = packageInfo

  // Auto-expand root level folders
  useEffect(() => {
    const rootFolders = fileTree.filter(n => n.kind === 'folder').map(n => n.path)
    setExpandedFolders(new Set(rootFolders))
  }, [fileTree])

  // Load README content if specified in manifest
  useEffect(() => {
    const loadReadme = async () => {
      if (!manifest?.readme) {
        setReadmeContent(null)
        return
      }

      setLoadingReadme(true)
      try {
        const content = await getFileContent(manifest.readme)
        setReadmeContent(content)
      } catch (err) {
        console.error('Failed to load README:', err)
        setReadmeContent(null)
      } finally {
        setLoadingReadme(false)
      }
    }

    loadReadme()
  }, [manifest?.readme, getFileContent])

  const handleFileClick = async (filePath: string) => {
    setSelectedFile(filePath)
    setLoadingContent(true)

    try {
      const content = await getFileContent(filePath)
      if (!content) {
        throw new Error('File not found in package')
      }
      // Strip prompd content frontmatter if present (security layer for packaged code files)
      const displayContent = stripContentFrontmatter(content)
      setFileContent(displayContent)
    } catch (err: any) {
      console.error('Failed to load file content:', err)
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
      onOpenInEditor(fileContent, filename)
    }
  }

  const handleUseAsTemplate = () => {
    if (selectedFile && fileContent && onUseAsTemplate) {
      const filename = selectedFile.split('/').pop() || 'template.prmd'
      onUseAsTemplate(fileContent, filename)
      onClose()
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

  const displayName = manifest?.name || fileName.replace('.pdpkg', '')
  const displayVersion = manifest?.version || 'local'

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
          {(() => {
            const localType = (manifest?.type || 'package') as ResourceType
            const LocalTypeIcon = RESOURCE_TYPE_ICONS[localType] || Package
            const localTypeColor = RESOURCE_TYPE_COLORS[localType] || '#3b82f6'
            return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              background: localTypeColor,
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <LocalTypeIcon size={24} color="white" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  fontSize: '18px',
                  fontWeight: 600,
                  color: 'var(--text)',
                  fontFamily: 'monospace'
                }}>
                  {displayName}
                </div>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '2px 8px',
                  fontSize: '11px',
                  fontWeight: 500,
                  color: localTypeColor,
                  background: `${localTypeColor}20`,
                  borderRadius: '4px',
                }}>
                  {RESOURCE_TYPE_LABELS[localType] || localType}
                </div>
              </div>
              <div style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
                fontFamily: 'monospace',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span>v{displayVersion}</span>
                <span style={{
                  padding: '2px 6px',
                  fontSize: '10px',
                  background: 'var(--panel-2)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  textTransform: 'uppercase'
                }}>
                  Local
                </span>
              </div>
            </div>
          </div>
            )
          })()}
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
            { key: 'files' as TabKey, label: 'Files', icon: <FolderOpen size={14} /> }
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
            <div style={{ padding: '24px', overflow: 'auto' }}>
              <div style={{ maxWidth: '800px' }}>
                {/* File Info */}
                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
                    Local Package
                  </h3>
                  <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    {fileName}
                  </p>
                </div>

                {/* Description from manifest */}
                {manifest?.description && (
                  <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
                      Description
                    </h3>
                    <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                      {manifest.description}
                    </p>
                  </div>
                )}

                {/* Metadata */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                  {(() => {
                    const metaType = (manifest?.type || 'package') as ResourceType
                    const MetaTypeIcon = RESOURCE_TYPE_ICONS[metaType] || Package
                    const metaTypeColor = RESOURCE_TYPE_COLORS[metaType] || '#3b82f6'
                    return (
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                          Type
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}>
                          <MetaTypeIcon size={14} style={{ color: metaTypeColor }} />
                          <span style={{ color: metaTypeColor, fontWeight: 500 }}>
                            {RESOURCE_TYPE_LABELS[metaType] || metaType}
                          </span>
                        </div>
                      </div>
                    )
                  })()}
                  {manifest?.author && (
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        Author
                      </div>
                      <div style={{ fontSize: '14px', color: 'var(--text)' }}>
                        {manifest.author}
                      </div>
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Version
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text)', fontFamily: 'monospace' }}>
                      {displayVersion}
                    </div>
                  </div>
                  {manifest?.main && (
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        Main Entry
                      </div>
                      <div style={{ fontSize: '14px', color: 'var(--text)', fontFamily: 'monospace' }}>
                        {manifest.main}
                      </div>
                    </div>
                  )}
                </div>

                {/* No Manifest Warning */}
                {!manifest && (
                  <div style={{
                    padding: '16px',
                    background: 'rgba(255, 193, 7, 0.1)',
                    border: '1px solid rgba(255, 193, 7, 0.3)',
                    borderRadius: '8px',
                    marginBottom: '24px'
                  }}>
                    <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500, marginBottom: '4px' }}>
                      No prompd.json found
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      This package doesn't contain a prompd.json file. Some metadata may be missing.
                    </div>
                  </div>
                )}

                {/* README */}
                {manifest?.readme && (
                  <div style={{ marginTop: '24px' }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '12px'
                    }}>
                      <BookOpen size={16} style={{ color: 'var(--accent)' }} />
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
                        README
                      </h3>
                    </div>
                    {loadingReadme && (
                      <div style={{
                        padding: '24px',
                        textAlign: 'center',
                        color: 'var(--text-secondary)',
                        fontSize: '13px'
                      }}>
                        Loading README...
                      </div>
                    )}
                    {!loadingReadme && readmeContent && (
                      <MarkdownPreview
                        content={readmeContent}
                        height="auto"
                        theme={theme}
                      />
                    )}
                    {!loadingReadme && !readmeContent && (
                      <div style={{
                        padding: '16px',
                        background: 'var(--panel-2)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        color: 'var(--text-secondary)',
                        fontSize: '13px'
                      }}>
                        README file not found: {manifest.readme}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
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
                {fileTree.length === 0 && (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                    <Package size={24} style={{ marginBottom: '12px', opacity: 0.5 }} />
                    <div>No files in package</div>
                  </div>
                )}
                {fileTree.length > 0 && (
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
                            lineNumbersMinChars: 3
                          }}
                        />
                      )}
                    </div>
                  </>
                )}
              </div>
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

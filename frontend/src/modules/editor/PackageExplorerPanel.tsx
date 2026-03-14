/**
 * PackageExplorerPanel - Tree-based browser for packages across three sources:
 * - Workspace Installs (.prompd/packages/)
 * - Global Installs (~/.prompd/packages/)
 * - Cache (~/.prompd/cache/)
 *
 * Provides context menus for actions like View Source, Execute, Inherit From, etc.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Package, ChevronRight, ChevronDown, Folder, FolderOpen,
  FileText, Loader2, RefreshCw, Trash2, Play, Copy, Link,
  ExternalLink, Download, Eye, ClipboardCopy
} from 'lucide-react'
import { SidebarPanelHeader } from '../components/SidebarPanelHeader'

// ── Types ──────────────────────────────────────────────

interface FileNode {
  name: string
  path: string
  kind: 'file' | 'folder'
  children?: FileNode[]
}

interface PackageNode {
  name: string
  version: string
  path: string
  description?: string
  files: FileNode[]
  section: SectionKey
}

type SectionKey = 'workspace' | 'global' | 'cache'

interface ContextMenuState {
  x: number
  y: number
  packageNode: PackageNode
  fileNode?: FileNode
  type: 'package' | 'file'
}

interface PackageExplorerPanelProps {
  theme?: 'light' | 'dark'
  workspacePath?: string | null
  onCollapse?: () => void
  onOpenFile: (opts: {
    name: string
    text: string
    electronPath?: string
    readOnly?: boolean
    packageSource?: { packageId: string; filePath: string }
  }) => void
  onShowNotification?: (message: string, type?: 'info' | 'warning' | 'error') => void
  expandPackage?: string | null
  onExpandHandled?: () => void
  visible?: boolean
}

// ── Helpers ────────────────────────────────────────────

const SECTION_LABELS: Record<SectionKey, string> = {
  workspace: 'WORKSPACE',
  global: 'GLOBAL',
  cache: 'CACHE',
}

function fileIconFor(name: string) {
  const lower = name.toLowerCase()
  if (lower.endsWith('.prmd')) {
    return (
      <img
        src="./icons/prmd-color.svg"
        alt="prmd"
        style={{ width: 16, height: 16 }}
      />
    )
  }
  if (lower.endsWith('.pdflow') || lower.endsWith('.prompdflow')) {
    return (
      <img
        src="./icons/prompdflow-color.svg"
        alt="pdflow"
        style={{ width: 16, height: 16 }}
      />
    )
  }
  if (lower === 'prompd.json' || lower.endsWith('.json')) {
    return <FileText size={14} style={{ color: '#f59e0b' }} />
  }
  if (lower.endsWith('.md')) {
    return <FileText size={14} style={{ color: '#60a5fa' }} />
  }
  return <FileText size={14} style={{ color: '#94a3b8' }} />
}

function buildImportPath(pkg: PackageNode, filePath: string): string {
  return `@${pkg.name.replace(/^@/, '')}@${pkg.version}/${filePath}`
}

// ── Component ──────────────────────────────────────────

export default function PackageExplorerPanel({
  theme = 'dark',
  workspacePath,
  onCollapse,
  onOpenFile,
  onShowNotification,
  expandPackage,
  onExpandHandled,
  visible,
}: PackageExplorerPanelProps) {
  const [packages, setPackages] = useState<PackageNode[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<SectionKey>>(
    () => new Set(['workspace', 'global', 'cache'])
  )
  const [expandedPackages, setExpandedPackages] = useState<Set<string>>(new Set())
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  const electronAPI = (window as unknown as Record<string, unknown>).electronAPI as {
    isElectron?: boolean
    resource?: {
      listInstalled: (wp: string) => Promise<{
        success: boolean
        resources: Array<{
          name: string
          version: string
          type: string
          scope: 'workspace' | 'user'
          path: string
          description?: string
        }>
        error?: string
      }>
    }
    cache?: {
      list: () => Promise<{
        success: boolean
        packages: Array<{
          name: string
          version: string
          path: string
          description?: string
          files: FileNode[]
        }>
        error?: string
      }>
      readFile: (filePath: string) => Promise<{
        success: boolean
        content?: string
        error?: string
      }>
      download: (name: string, version?: string) => Promise<{
        success: boolean
        path?: string
        version?: string
        files?: FileNode[]
        cached?: boolean
        error?: string
      }>
      delete: (cachePath: string) => Promise<{
        success: boolean
        error?: string
      }>
      fileTree: (dirPath: string) => Promise<{
        success: boolean
        files: FileNode[]
        error?: string
      }>
    }
    readDir?: (dirPath: string) => Promise<{
      success: boolean
      entries?: Array<{ name: string; path: string; kind: 'file' | 'folder' }>
    }>
    readFile?: (filePath: string) => Promise<{
      success: boolean
      content?: string
    }>
    openExternal?: (url: string) => void
    package?: {
      install: (ref: string, wp: string, opts?: Record<string, unknown>) => Promise<{
        success: boolean
        error?: string
      }>
    }
  }

  // ── Data Loading ───────────────────────────────────

  const loadPackages = useCallback(async () => {
    if (!electronAPI?.isElectron) return
    setLoading(true)

    try {
      const allPackages: PackageNode[] = []

      // Load installed packages (workspace + global)
      if (electronAPI.resource) {
        const wp = workspacePath || ''
        const result = await electronAPI.resource.listInstalled(wp)
        if (result.success && result.resources) {
          // Deduplicate: keep only the latest version per name+scope
          const latestByKey = new Map<string, typeof result.resources[0]>()
          for (const res of result.resources) {
            if (res.type !== 'package') continue
            const key = `${res.scope}:${res.name}`
            const existing = latestByKey.get(key)
            if (!existing || res.version.localeCompare(existing.version, undefined, { numeric: true }) > 0) {
              latestByKey.set(key, res)
            }
          }

          for (const res of latestByKey.values()) {
            const section: SectionKey = res.scope === 'workspace' ? 'workspace' : 'global'

            // Build file tree recursively from disk
            let files: FileNode[] = []
            if (electronAPI.cache?.fileTree) {
              try {
                const treeResult = await electronAPI.cache.fileTree(res.path)
                if (treeResult.success) {
                  files = treeResult.files as FileNode[]
                }
              } catch { /* ignore */ }
            }

            allPackages.push({
              name: res.name,
              version: res.version,
              path: res.path,
              description: res.description,
              files,
              section,
            })
          }
        }
      }

      // Load cached packages (from ~/.prompd/cache/ - extracted by cache:download)
      if (electronAPI.cache) {
        const cacheResult = await electronAPI.cache.list()
        if (cacheResult.success && cacheResult.packages) {
          for (const pkg of cacheResult.packages) {
            allPackages.push({
              name: pkg.name,
              version: pkg.version,
              path: pkg.path,
              description: pkg.description,
              files: pkg.files || [],
              section: 'cache',
            })
          }
        }
      }

      setPackages(allPackages)
    } catch (err) {
      console.error('[PackageExplorer] Failed to load packages:', err)
    } finally {
      setLoading(false)
    }
  }, [electronAPI, workspacePath])

  useEffect(() => {
    loadPackages()
  }, [loadPackages])

  // Listen for resource changes
  useEffect(() => {
    const handler = () => loadPackages()
    window.addEventListener('prompd:resources-changed', handler)
    return () => window.removeEventListener('prompd:resources-changed', handler)
  }, [loadPackages])

  // Refresh when panel becomes visible
  useEffect(() => {
    if (visible) {
      loadPackages()
    }
  }, [visible, loadPackages])

  // Handle auto-expand from search
  useEffect(() => {
    if (!expandPackage) return

    // Ensure cache section is expanded
    setExpandedSections(prev => {
      const next = new Set(prev)
      next.add('cache')
      return next
    })

    // Expand the target package
    setExpandedPackages(prev => {
      const next = new Set(prev)
      next.add(expandPackage)
      return next
    })

    onExpandHandled?.()
  }, [expandPackage, onExpandHandled])

  // ── Toggle Handlers ────────────────────────────────

  const toggleSection = (section: SectionKey) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }

  const togglePackage = (key: string) => {
    setExpandedPackages(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleFolder = (key: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // ── File Actions ───────────────────────────────────

  const openFileReadOnly = async (pkg: PackageNode, fileNode: FileNode) => {
    const fullPath = `${pkg.path}/${fileNode.path}`.replace(/\\/g, '/')

    try {
      let content = ''
      if (pkg.section === 'cache' && electronAPI?.cache) {
        const result = await electronAPI.cache.readFile(fullPath)
        if (result.success && result.content !== undefined) {
          content = result.content
        } else {
          onShowNotification?.(`Failed to read file: ${result.error}`, 'error')
          return
        }
      } else if (electronAPI?.readFile) {
        const result = await electronAPI.readFile(fullPath)
        if (result.success && result.content !== undefined) {
          content = result.content
        } else {
          onShowNotification?.('Failed to read file', 'error')
          return
        }
      }

      onOpenFile({
        name: `${pkg.name}/${fileNode.path}`,
        text: content,
        electronPath: fullPath,
        readOnly: true,
        packageSource: {
          packageId: `${pkg.name}@${pkg.version}`,
          filePath: fileNode.path,
        },
      })
    } catch (err) {
      console.error('[PackageExplorer] Failed to open file:', err)
      onShowNotification?.('Failed to open file', 'error')
    }
  }

  const handleInheritFrom = async (pkg: PackageNode, fileNode: FileNode) => {
    const importPath = buildImportPath(pkg, fileNode.path)
    const content = `---\ninherits: ${importPath}\n---\n\n`
    onOpenFile({
      name: 'untitled.prmd',
      text: content,
      readOnly: false,
    })
    onShowNotification?.(`Created new prompd inheriting from ${importPath}`, 'info')
  }

  const handleCopyTo = async (pkg: PackageNode, fileNode: FileNode) => {
    const fullPath = `${pkg.path}/${fileNode.path}`.replace(/\\/g, '/')

    try {
      let content = ''
      if (pkg.section === 'cache' && electronAPI?.cache) {
        const result = await electronAPI.cache.readFile(fullPath)
        if (result.success && result.content !== undefined) content = result.content
      } else if (electronAPI?.readFile) {
        const result = await electronAPI.readFile(fullPath)
        if (result.success && result.content !== undefined) content = result.content
      }

      if (content) {
        onOpenFile({
          name: fileNode.name,
          text: content,
          readOnly: false,
        })
        onShowNotification?.(`Copied ${fileNode.name} to new tab`, 'info')
      }
    } catch (err) {
      console.error('[PackageExplorer] Failed to copy file:', err)
    }
  }

  const handleCopyImportPath = (pkg: PackageNode, fileNode: FileNode) => {
    const importPath = buildImportPath(pkg, fileNode.path)
    navigator.clipboard.writeText(importPath)
    onShowNotification?.(`Copied: ${importPath}`, 'info')
  }

  const handleViewOnHub = (pkg: PackageNode) => {
    const url = `https://www.prompdhub.ai/packages/${pkg.name}`
    if (electronAPI?.openExternal) {
      electronAPI.openExternal(url)
    } else {
      window.open(url, '_blank')
    }
  }

  const handleDeleteCache = async (pkg: PackageNode) => {
    if (!electronAPI?.cache) return

    const result = await electronAPI.cache.delete(pkg.path)
    if (result.success) {
      onShowNotification?.(`Removed ${pkg.name}@${pkg.version} from cache`, 'info')
      loadPackages()
    } else {
      onShowNotification?.(`Failed to remove: ${result.error}`, 'error')
    }
  }

  const handleInstallToWorkspace = async (pkg: PackageNode) => {
    if (!electronAPI?.package || !workspacePath) {
      onShowNotification?.('No workspace open', 'warning')
      return
    }

    const ref = `${pkg.name}@${pkg.version}`
    const result = await electronAPI.package.install(ref, workspacePath, { type: 'package' })
    if (result.success) {
      onShowNotification?.(`Installed ${ref} to workspace`, 'info')
      window.dispatchEvent(new Event('prompd:resources-changed'))
      loadPackages()
    } else {
      onShowNotification?.(`Install failed: ${result.error}`, 'error')
    }
  }

  const handleInstallGlobally = async (pkg: PackageNode) => {
    if (!electronAPI?.package) return

    const ref = `${pkg.name}@${pkg.version}`
    const result = await electronAPI.package.install(ref, '', { type: 'package', global: true })
    if (result.success) {
      onShowNotification?.(`Installed ${ref} globally`, 'info')
      window.dispatchEvent(new Event('prompd:resources-changed'))
      loadPackages()
    } else {
      onShowNotification?.(`Install failed: ${result.error}`, 'error')
    }
  }

  // ── Context Menu ───────────────────────────────────

  const handleContextMenu = (
    e: React.MouseEvent,
    pkg: PackageNode,
    fileNode?: FileNode
  ) => {
    e.preventDefault()
    e.stopPropagation()

    // Clamp to viewport
    const x = Math.min(e.clientX, window.innerWidth - 220)
    const y = Math.min(e.clientY, window.innerHeight - 300)

    setContextMenu({
      x,
      y,
      packageNode: pkg,
      fileNode,
      type: fileNode ? 'file' : 'package',
    })
  }

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return
    const handler = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [contextMenu])

  // ── Styles ─────────────────────────────────────────

  const isDark = theme === 'dark'
  const colors = {
    text: isDark ? '#e2e8f0' : '#0f172a',
    textMuted: isDark ? '#94a3b8' : '#64748b',
    textDim: isDark ? '#64748b' : '#94a3b8',
    sectionBg: isDark ? 'rgba(30, 41, 59, 0.3)' : 'rgba(241, 245, 249, 0.8)',
    hoverBg: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(241, 245, 249, 1)',
    activeBg: isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.1)',
    versionBg: isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.1)',
    versionText: isDark ? '#818cf8' : '#6366f1',
    border: isDark ? 'rgba(71, 85, 105, 0.3)' : 'rgba(226, 232, 240, 0.8)',
    menuBg: isDark ? '#1e293b' : '#ffffff',
    menuBorder: isDark ? '#334155' : '#e2e8f0',
    menuHover: isDark ? 'rgba(51, 65, 85, 0.8)' : 'rgba(241, 245, 249, 1)',
    danger: '#ef4444',
  }

  // ── Renderers ──────────────────────────────────────

  const renderFileNode = (
    node: FileNode,
    pkg: PackageNode,
    depth: number,
    parentKey: string
  ): JSX.Element => {
    const nodeKey = `${parentKey}/${node.path}`

    if (node.kind === 'folder') {
      const isExpanded = expandedFolders.has(nodeKey)
      return (
        <div key={nodeKey}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              paddingLeft: 8 + depth * 14,
              cursor: 'pointer',
              fontSize: '13px',
              color: colors.text,
            }}
            onClick={() => toggleFolder(nodeKey)}
            onContextMenu={(e) => handleContextMenu(e, pkg)}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = colors.hoverBg
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'transparent'
            }}
          >
            {isExpanded
              ? <FolderOpen size={14} color="#DCAA5F" />
              : <Folder size={14} color="#DCAA5F" />
            }
            <span style={{ marginLeft: '2px' }}>{node.name}</span>
          </div>
          {isExpanded && node.children?.map(child =>
            renderFileNode(child, pkg, depth + 1, parentKey)
          )}
        </div>
      )
    }

    return (
      <div
        key={nodeKey}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '3px 8px',
          paddingLeft: 8 + depth * 14,
          cursor: 'pointer',
          fontSize: '13px',
          color: colors.text,
        }}
        onClick={() => openFileReadOnly(pkg, node)}
        onContextMenu={(e) => handleContextMenu(e, pkg, node)}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = colors.hoverBg
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'transparent'
        }}
      >
        {fileIconFor(node.name)}
        <span style={{ marginLeft: '2px' }}>{node.name}</span>
      </div>
    )
  }

  const renderPackageNode = (pkg: PackageNode) => {
    const key = `${pkg.name}@${pkg.version}`
    const isExpanded = expandedPackages.has(key)

    return (
      <div key={`${pkg.section}-${key}`}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 8px',
            paddingLeft: 20,
            cursor: 'pointer',
            fontSize: '13px',
            color: colors.text,
          }}
          onClick={() => togglePackage(key)}
          onContextMenu={(e) => handleContextMenu(e, pkg)}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = colors.hoverBg
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'transparent'
          }}
        >
          {isExpanded
            ? <ChevronDown size={12} style={{ flexShrink: 0, color: colors.textDim }} />
            : <ChevronRight size={12} style={{ flexShrink: 0, color: colors.textDim }} />
          }
          <Package size={14} style={{ flexShrink: 0, color: colors.versionText }} />
          <span style={{
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}>
            {pkg.name}
          </span>
          <span style={{
            fontSize: '10px',
            color: colors.versionText,
            background: colors.versionBg,
            padding: '0px 5px',
            borderRadius: '3px',
            flexShrink: 0,
          }}>
            {pkg.version}
          </span>
        </div>
        {isExpanded && (
          <div>
            {pkg.files.length > 0 ? (
              pkg.files.map(node => renderFileNode(node, pkg, 3, key))
            ) : (
              <div style={{
                paddingLeft: 50,
                padding: '4px 8px 4px 50px',
                fontSize: '12px',
                color: colors.textDim,
                fontStyle: 'italic',
              }}>
                No files
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const renderSection = (section: SectionKey) => {
    // Hide workspace section when no workspace open
    if (section === 'workspace' && !workspacePath) return null

    const isExpanded = expandedSections.has(section)
    const sectionPackages = packages.filter(p => p.section === section)

    return (
      <div key={section}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 8px',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: colors.textMuted,
            background: colors.sectionBg,
            borderBottom: `1px solid ${colors.border}`,
            userSelect: 'none',
          }}
          onClick={() => toggleSection(section)}
        >
          {isExpanded
            ? <ChevronDown size={12} />
            : <ChevronRight size={12} />
          }
          <span>{SECTION_LABELS[section]}</span>
          <span style={{
            fontSize: '10px',
            color: colors.textDim,
            marginLeft: 'auto',
          }}>
            {sectionPackages.length}
          </span>
        </div>
        {isExpanded && (
          <div>
            {sectionPackages.length > 0 ? (
              sectionPackages.map(renderPackageNode)
            ) : (
              <div style={{
                padding: '12px 16px',
                fontSize: '12px',
                color: colors.textDim,
                textAlign: 'center',
                fontStyle: 'italic',
              }}>
                {section === 'cache'
                  ? 'Search PrompdHub to browse packages'
                  : 'No packages installed'}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Context Menu Render ────────────────────────────

  const renderContextMenu = () => {
    if (!contextMenu) return null

    const { packageNode: pkg, fileNode, type } = contextMenu
    const isCache = pkg.section === 'cache'
    const isPrmd = fileNode?.name.toLowerCase().endsWith('.prmd')

    const menuItemStyle = (hover = false) => ({
      display: 'flex' as const,
      alignItems: 'center' as const,
      gap: '8px',
      padding: '6px 12px',
      cursor: 'pointer' as const,
      fontSize: '13px',
      color: colors.text,
      background: hover ? colors.menuHover : 'transparent',
      borderRadius: '4px',
      margin: '1px 4px',
    })

    const dangerItemStyle = (hover = false) => ({
      ...menuItemStyle(hover),
      color: colors.danger,
    })

    const dividerStyle = {
      height: '1px',
      background: colors.menuBorder,
      margin: '4px 8px',
    }

    return (
      <div
        ref={contextMenuRef}
        style={{
          position: 'fixed',
          left: contextMenu.x,
          top: contextMenu.y,
          minWidth: '200px',
          background: colors.menuBg,
          border: `1px solid ${colors.menuBorder}`,
          borderRadius: '8px',
          padding: '4px 0',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
          zIndex: 1000,
        }}
      >
        {type === 'file' && fileNode && (
          <>
            {/* View Source */}
            <div
              style={menuItemStyle()}
              onClick={() => {
                openFileReadOnly(pkg, fileNode)
                setContextMenu(null)
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = colors.menuHover
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'transparent'
              }}
            >
              <Eye size={14} />
              <span>View Source</span>
            </div>

            {/* Execute (prmd files only) */}
            {isPrmd && (
              <div
                style={menuItemStyle()}
                onClick={() => {
                  // Open read-only first, execution can happen from there
                  openFileReadOnly(pkg, fileNode)
                  setContextMenu(null)
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = colors.menuHover
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'transparent'
                }}
              >
                <Play size={14} />
                <span>Execute</span>
              </div>
            )}

            <div style={dividerStyle} />

            {/* Inherit From (prmd files only) */}
            {isPrmd && (
              <div
                style={menuItemStyle()}
                onClick={() => {
                  handleInheritFrom(pkg, fileNode)
                  setContextMenu(null)
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = colors.menuHover
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'transparent'
                }}
              >
                <Link size={14} />
                <span>Inherit From</span>
              </div>
            )}

            {/* Copy To */}
            <div
              style={menuItemStyle()}
              onClick={() => {
                handleCopyTo(pkg, fileNode)
                setContextMenu(null)
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = colors.menuHover
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'transparent'
              }}
            >
              <Copy size={14} />
              <span>Copy To New Tab</span>
            </div>

            {/* Copy Import Path */}
            <div
              style={menuItemStyle()}
              onClick={() => {
                handleCopyImportPath(pkg, fileNode)
                setContextMenu(null)
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = colors.menuHover
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'transparent'
              }}
            >
              <ClipboardCopy size={14} />
              <span>Copy Import Path</span>
            </div>
          </>
        )}

        {type === 'package' && (
          <>
            {/* View on PrompdHub */}
            <div
              style={menuItemStyle()}
              onClick={() => {
                handleViewOnHub(pkg)
                setContextMenu(null)
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = colors.menuHover
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'transparent'
              }}
            >
              <ExternalLink size={14} />
              <span>View on PrompdHub</span>
            </div>

            {/* Install actions (cache only) */}
            {isCache && (
              <>
                <div style={dividerStyle} />

                {workspacePath && (
                  <div
                    style={menuItemStyle()}
                    onClick={() => {
                      handleInstallToWorkspace(pkg)
                      setContextMenu(null)
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = colors.menuHover
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = 'transparent'
                    }}
                  >
                    <Download size={14} />
                    <span>Install to Workspace</span>
                  </div>
                )}

                <div
                  style={menuItemStyle()}
                  onClick={() => {
                    handleInstallGlobally(pkg)
                    setContextMenu(null)
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = colors.menuHover
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'transparent'
                  }}
                >
                  <Download size={14} />
                  <span>Install Globally</span>
                </div>

                <div style={dividerStyle} />

                <div
                  style={dangerItemStyle()}
                  onClick={() => {
                    handleDeleteCache(pkg)
                    setContextMenu(null)
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = colors.menuHover
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'transparent'
                  }}
                >
                  <Trash2 size={14} />
                  <span>Remove from Cache</span>
                </div>
              </>
            )}
          </>
        )}
      </div>
    )
  }

  // ── Main Render ────────────────────────────────────

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <SidebarPanelHeader
        title="Package Explorer"
        onCollapse={onCollapse}
      >
        <button
          title="Refresh"
          onClick={loadPackages}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            color: colors.textMuted,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
        </button>
      </SidebarPanelHeader>

      <div style={{
        flex: 1,
        overflow: 'auto',
        paddingBottom: '8px',
      }}>
        {loading && packages.length === 0 ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '24px',
            color: colors.textDim,
            fontSize: '13px',
          }}>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            <span>Loading packages...</span>
          </div>
        ) : (
          <>
            {renderSection('workspace')}
            {renderSection('global')}
            {renderSection('cache')}
          </>
        )}
      </div>

      {renderContextMenu()}
    </div>
  )
}

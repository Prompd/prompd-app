/// <reference path="../types/index.d.ts" />
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Folder,
  FolderOpen,
  FileText,
  MessageCircle,
  Workflow,
  Code,
  FileJson,
  FileCode,
  Square,
  FileImage,
  Settings,
  Package,
  ChevronsDownUp,
  Copy,
  Clipboard,
  FilePlus,
  FolderPlus,
  Trash2,
  Link,
  Download,
  RefreshCw,
  Sparkles
} from 'lucide-react'
import { SidebarPanelHeader } from '../components/SidebarPanelHeader'
import { useConfirmDialog } from '../components/ConfirmDialog'

type FileTypeKey = 'prmd' | 'pdflow' | 'prompdjson' | 'custom'

const FILE_TYPES: Array<{ key: FileTypeKey; label: string; ext: string; description: string; icon: React.ReactNode }> = [
  { key: 'prmd', label: 'Prompt', ext: '.prmd', description: 'Prompd prompt file',
    icon: <img src="./icons/prmd-color.svg" alt="prmd" style={{ width: 20, height: 20 }} /> },
  { key: 'pdflow', label: 'Workflow', ext: '.pdflow', description: 'Visual workflow',
    icon: <img src="./icons/prompdflow-color.svg" alt="pdflow" style={{ width: 20, height: 20 }} /> },
  { key: 'prompdjson', label: 'Project Config', ext: 'prompd.json', description: 'Project configuration',
    icon: <FileJson size={20} color="#CBCB41" /> },
  { key: 'custom', label: 'Other', ext: '', description: 'Any file type',
    icon: <FileText size={20} color="#8B949E" /> },
]

type FileEntry = { name: string; handle?: any; kind: 'file' | 'folder'; path: string; fileObj?: File }

type TreeNode = {
  kind: 'folder' | 'file'
  name: string
  path: string
  children?: TreeNode[]
}

type Props = {
  currentFileName?: string
  onOpenFile: (opts: { name: string; handle?: any; text: string; electronPath?: string; readOnly?: boolean; packageSource?: { packageId: string; filePath: string } }) => void
  onCreateNewPrompd?: () => void
  onAddToContentField?: (filePath: string, field: 'system' | 'assistant' | 'context' | 'user' | 'response') => void
  dirHandleExternal?: any
  setDirHandleExternal?: (h: any) => void
  entriesExternal?: FileEntry[]
  setEntriesExternal?: (list: FileEntry[]) => void
  onOpenPublish?: () => void
  // TabManager integration callbacks
  onFileRenamed?: (oldPath: string, newPath: string, newHandle?: FileSystemFileHandle) => void
  onFileDeleted?: (filePath: string) => void
  onFilesRefreshed?: (entries: { name: string; path: string; handle?: FileSystemFileHandle }[]) => void
  // Local package opening callback
  onOpenLocalPackage?: (blob: Blob, fileName: string) => void
  // Workspace path callback (for Electron title updates)
  onWorkspacePathChanged?: (path: string | null) => void
  // Callback to add ignore patterns to prompd.json
  onAddIgnorePattern?: (pattern: string) => void
  // Ignore patterns from prompd.json (to grey out ignored files)
  ignorePatterns?: string[]
  // Collapse panel callback
  onCollapse?: () => void
  // Open saved projects dialog
  onOpenProjects?: () => void
  // Open prompd.json editor modal
  onOpenPrompdJson?: () => void
  // Install all dependencies from prompd.json
  onInstallDependencies?: () => void
}

export default function FileExplorer({ currentFileName, onOpenFile, onCreateNewPrompd, onAddToContentField, dirHandleExternal, setDirHandleExternal, entriesExternal, setEntriesExternal, onOpenPublish, onFileRenamed, onFileDeleted, onFilesRefreshed, onOpenLocalPackage, onWorkspacePathChanged, onAddIgnorePattern, ignorePatterns: externalIgnorePatterns = [], onCollapse, onOpenProjects, onOpenPrompdJson, onInstallDependencies }: Props) {
  const [dirHandleState, setDirHandleState] = useState<any>(null)
  const [entriesState, setEntriesState] = useState<FileEntry[]>([])
  const dirHandle = dirHandleExternal !== undefined ? dirHandleExternal : dirHandleState
  const setDirHandle = setDirHandleExternal || setDirHandleState
  const entries = entriesExternal !== undefined ? entriesExternal : entriesState
  const setEntries = setEntriesExternal || setEntriesState
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set<string>(['']))
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry: FileEntry | TreeNode; type: 'file' | 'folder' } | null>(null)
  const [showAddToSubmenu, setShowAddToSubmenu] = useState(false)
  const [showIgnoreSubmenu, setShowIgnoreSubmenu] = useState(false)
  const [clipboardData, setClipboardData] = useState<{ path: string; content?: string; type: 'file' | 'folder' } | null>(null)

  // Local ignore patterns state - FileExplorer owns this and loads from prompd.json
  const [localIgnorePatterns, setLocalIgnorePatterns] = useState<string[]>([])

  // Use external patterns if provided, otherwise use local state
  const ignorePatterns = externalIgnorePatterns.length > 0 ? externalIgnorePatterns : localIgnorePatterns

  // Input dialog state (replacement for prompt() which doesn't work in Electron)
  const [inputDialog, setInputDialog] = useState<{
    title: string
    defaultValue: string
    showFileTypeSelector?: boolean
    onSubmit: (value: string) => void
  } | null>(null)
  const [inputDialogValue, setInputDialogValue] = useState('')
  const [fileType, setFileType] = useState<FileTypeKey>('prmd')
  const [showAdvancedNewFile, setShowAdvancedNewFile] = useState(false)

  // Confirmation dialog hook (replacement for confirm() which doesn't work in Electron)
  const { showConfirm, ConfirmDialogComponent } = useConfirmDialog()

  // Helper to show input dialog (replaces prompt())
  const showInputDialog = useCallback((title: string, defaultValue: string): Promise<string | null> => {
    return new Promise((resolve) => {
      setInputDialogValue(defaultValue)
      setInputDialog({
        title,
        defaultValue,
        onSubmit: (value: string) => {
          setInputDialog(null)
          resolve(value || null)
        }
      })
    })
  }, [])

  // Load ignore patterns from prompd.json in workspace root
  const loadIgnorePatterns = useCallback(async (handle: any) => {
    if (!handle) {
      setLocalIgnorePatterns([])
      return
    }

    try {
      let content: string

      // Check if this is an Electron pseudo-handle
      if (handle._electronPath && (window as any).electronAPI?.readFile) {
        const manifestPath = `${handle._electronPath}/prompd.json`
        const result = await (window as any).electronAPI.readFile(manifestPath)
        if (!result.success) {
          setLocalIgnorePatterns([])
          return
        }
        content = result.content
      } else if (typeof handle.getFileHandle === 'function') {
        // Browser File System Access API
        const manifestHandle = await handle.getFileHandle('prompd.json', { create: false })
        const file = await manifestHandle.getFile()
        content = await file.text()
      } else {
        setLocalIgnorePatterns([])
        return
      }

      const manifest = JSON.parse(content)
      if (Array.isArray(manifest.ignore)) {
        setLocalIgnorePatterns(manifest.ignore)
      } else {
        setLocalIgnorePatterns([])
      }
    } catch {
      // No prompd.json or invalid format - that's okay
      setLocalIgnorePatterns([])
    }
  }, [])

  // Add ignore pattern to prompd.json and update local state
  const addIgnorePattern = useCallback(async (pattern: string) => {
    if (!dirHandle) {
      console.warn('Cannot add ignore pattern: No workspace open')
      return
    }

    try {
      let manifest: Record<string, unknown> = {}
      const isElectronHandle = dirHandle._electronPath && (window as any).electronAPI

      // Read existing manifest
      if (isElectronHandle) {
        const manifestPath = `${dirHandle._electronPath}/prompd.json`
        const result = await (window as any).electronAPI.readFile(manifestPath)
        if (result.success) {
          try {
            manifest = JSON.parse(result.content)
          } catch {
            // Invalid JSON, start fresh
          }
        }
      } else if (typeof dirHandle.getFileHandle === 'function') {
        try {
          const manifestHandle = await dirHandle.getFileHandle('prompd.json', { create: false })
          const file = await manifestHandle.getFile()
          const content = await file.text()
          manifest = JSON.parse(content)
        } catch {
          // No prompd.json or invalid - start fresh
        }
      }

      // Add pattern to ignore array if not already present
      const ignoreArray = Array.isArray(manifest.ignore) ? manifest.ignore : []
      if (!ignoreArray.includes(pattern)) {
        ignoreArray.push(pattern)
        manifest.ignore = ignoreArray

        // Write updated prompd.json
        const newContent = JSON.stringify(manifest, null, 2)

        if (isElectronHandle) {
          const manifestPath = `${dirHandle._electronPath}/prompd.json`
          const result = await (window as any).electronAPI.writeFile(manifestPath, newContent)
          if (!result.success) {
            throw new Error(result.error || 'Failed to write prompd.json')
          }
        } else if (typeof dirHandle.getFileHandle === 'function') {
          const manifestHandle = await dirHandle.getFileHandle('prompd.json', { create: true })
          const writable = await manifestHandle.createWritable()
          await writable.write(newContent)
          await writable.close()
        }

        // Update local state immediately
        setLocalIgnorePatterns(ignoreArray as string[])

        // Also call the external callback if provided (for App.tsx state sync)
        onAddIgnorePattern?.(pattern)
      }
    } catch (err) {
      console.error('Failed to add ignore pattern to prompd.json:', err)
    }
  }, [dirHandle, onAddIgnorePattern])

  // Load ignore patterns when dirHandle changes
  useEffect(() => {
    loadIgnorePatterns(dirHandle)
  }, [dirHandle, loadIgnorePatterns])

  const isElectron = !!(window as any).electronAPI?.openFolder
  const canFS = typeof (window as any).showDirectoryPicker === 'function' || isElectron

  const pickFolder = useCallback(async () => {
    setError(null)
    try {
      // In Electron, use native dialog which gives us the actual file path
      if (isElectron) {
        const folderPath = await (window as any).electronAPI.openFolder()
        if (folderPath) {
          // Create a pseudo-handle for Electron that stores the path
          const pseudoHandle = {
            kind: 'directory',
            name: folderPath.split(/[\\/]/).pop() || folderPath,
            _electronPath: folderPath
          }
          setDirHandle(pseudoHandle)
          rememberProject({ mode: 'fs', name: pseudoHandle.name, top: pseudoHandle.name })
          // Set workspace path in Electron main process (for file reading during execution)
          await (window as any).electronAPI.setWorkspacePath?.(folderPath)
          // Load persisted connections for this workspace
          const { useWorkflowStore } = await import('../../stores/workflowStore')
          useWorkflowStore.getState().loadConnections()
          // Notify about workspace path change (for window title)
          onWorkspacePathChanged?.(folderPath)
        }
        return
      }
      // Browser: use File System Access API
      const handle = await (window as any).showDirectoryPicker()
      setDirHandle(handle)
      rememberProject({ mode: 'fs', name: handle.name, top: handle.name })
    } catch (e: any) {
      if (e?.name !== 'AbortError') setError('Folder selection cancelled or failed')
    }
  }, [isElectron, onWorkspacePathChanged, setDirHandle])


  // Walk directory using File System Access API
  async function walkDirFS(dir: any, base: string, acc: FileEntry[]) {
    for await (const [name, handle] of (dir as any).entries()) {
      const kind = (handle as any).kind as 'file' | 'directory'
      if (kind === 'file') {
        acc.push({ name, handle, kind: 'file', path: base ? `${base}/${name}` : name })
      } else if (kind === 'directory') {
        await walkDirFS(handle, base ? `${base}/${name}` : name, acc)
      }
    }
  }

  // Walk directory using Electron's file system
  async function walkDirElectron(basePath: string, relativePath: string, acc: FileEntry[]): Promise<string | null> {
    const fullPath = relativePath ? `${basePath}/${relativePath}` : basePath
    const result = await (window as any).electronAPI.readDir(fullPath)
    if (!result.success) {
      console.error('[FileExplorer] readDir failed for:', fullPath, result.error)
      return result.error || 'Failed to read directory'
    }

    for (const item of result.files) {
      const itemRelativePath = relativePath ? `${relativePath}/${item.name}` : item.name
      if (item.isDirectory) {
        // Add the folder to the list
        acc.push({
          name: item.name,
          kind: 'folder',
          path: itemRelativePath,
          handle: { _electronPath: item.path }
        })
        // Recursively walk subdirectories (ignore errors in subdirs)
        await walkDirElectron(basePath, itemRelativePath, acc)
      } else {
        acc.push({
          name: item.name,
          kind: 'file',
          path: itemRelativePath,
          handle: { _electronPath: item.path } // Store full path for reading
        })
      }
    }
    return null
  }

  const refresh = useCallback(async () => {
    if (!dirHandle) return
    setLoading(true)
    setError(null)
    try {
      const list: FileEntry[] = []

      // Check if this is an Electron pseudo-handle
      if (dirHandle._electronPath) {
        console.log('[FileExplorer] Walking Electron directory:', dirHandle._electronPath)
        const walkError = await walkDirElectron(dirHandle._electronPath, '', list)
        if (walkError && list.length === 0) {
          throw new Error(walkError)
        }
      } else {
        await walkDirFS(dirHandle, '', list)
      }

      console.log('[FileExplorer] Loaded', list.length, 'files')
      list.sort((a, b) => a.path.localeCompare(b.path))
      setEntries(list)

      // Notify TabManager of refreshed files for validation
      if (onFilesRefreshed) {
        onFilesRefreshed(list.map(e => ({
          name: e.name,
          path: e.path,
          handle: e.handle
        })))
      }
    } catch (e: any) {
      console.error('[FileExplorer] refresh error:', e)
      setError(e.message || 'Failed to read directory entries')
    } finally {
      setLoading(false)
    }
  }, [dirHandle, onFilesRefreshed])

  useEffect(() => { refresh() }, [dirHandle])

  const openFile = useCallback(async (entry: FileEntry) => {
    // Check for binary file types that shouldn't be opened as text
    const binaryExtensions = ['.exe', '.dll', '.so', '.dylib', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.bmp', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.mp3', '.mp4', '.wav', '.avi', '.mov', '.woff', '.woff2', '.ttf', '.otf', '.eot']
    const lowerPath = entry.path.toLowerCase()

    // Handle prompd.json files specially - open in visual editor
    if (lowerPath === 'prompd.json' || lowerPath.endsWith('/prompd.json')) {
      if (onOpenPrompdJson) {
        onOpenPrompdJson()
        return
      }
    }

    // Handle .pdpkg files specially - open in package viewer
    if (lowerPath.endsWith('.pdpkg') || lowerPath.endsWith('.zip')) {
      if (!onOpenLocalPackage) {
        setError(`Package files require the package viewer. Unable to open "${entry.name}".`)
        return
      }

      try {
        let blob: Blob

        // Electron mode - read binary file via IPC
        if (entry.handle?._electronPath) {
          const electronAPI = (window as any).electronAPI
          const filePath = entry.handle._electronPath

          // Read file as binary (base64 encoded)
          if (!electronAPI?.readBinaryFile) {
            setError('Binary file reading not supported in this version')
            return
          }

          const result = await electronAPI.readBinaryFile(filePath)
          if (!result.success) {
            setError(`Failed to read package: ${result.error || 'Unknown error'}`)
            return
          }

          // Convert base64 to blob
          const binaryString = atob(result.data)
          const bytes = new Uint8Array(binaryString.length)
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i)
          }
          blob = new Blob([bytes], { type: 'application/zip' })
        } else if (entry.handle && typeof (entry.handle as any).getFile === 'function') {
          const file = await (entry.handle as any).getFile()
          blob = file
        } else if (entry.fileObj) {
          blob = entry.fileObj
        } else {
          setError('Cannot read package file')
          return
        }

        onOpenLocalPackage(blob, entry.name)
        return
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown error'
        setError(`Failed to open package: ${entry.name} - ${message}`)
        return
      }
    }

    if (binaryExtensions.some(ext => lowerPath.endsWith(ext))) {
      setError(`Cannot open binary file: ${entry.name}. This file type is not supported in the editor.`)
      return
    }

    try {
      let text: string
      let fileHandle: any = entry.handle

      // Electron file reading via IPC
      if (entry.handle?._electronPath) {
        const electronAPI = (window as any).electronAPI
        const filePath = entry.handle._electronPath
        const result = await electronAPI.readFile(filePath)
        if (!result.success) {
          setError(`Failed to read file: ${result.error}`)
          return
        }
        text = result.content

        // Create a proper pseudo-handle with createWritable for saving
        fileHandle = {
          kind: 'file',
          name: entry.name,
          _electronPath: filePath,
          getFile: async () => ({
            name: entry.name,
            text: async () => {
              const r = await electronAPI.readFile(filePath)
              return r.content || ''
            }
          }),
          createWritable: async () => ({
            write: async (content: string) => {
              await electronAPI.writeFile(filePath, content)
            },
            close: async () => {}
          })
        }
      } else if (entry.handle && typeof (entry.handle as any).getFile === 'function') {
        const file = await (entry.handle as any).getFile()
        text = await file.text()
      } else if (entry.fileObj) {
        text = await entry.fileObj.text()
      } else {
        return
      }
      // Pass electronPath for file path persistence (handle restoration after restart)
      const electronPath = fileHandle?._electronPath
      onOpenFile({ name: entry.path, handle: fileHandle, text, electronPath })
    } catch (e) {
      setError('Failed to open file')
    }
  }, [onOpenFile, onOpenLocalPackage, onOpenPrompdJson])


  const pathLabel = useMemo(() => {
    if (!dirHandle) return 'No folder open'
    return dirHandle.name || '(selected)'
  }, [dirHandle])

  const projectId = useMemo(() => {
    if (dirHandle) return `fs:${dirHandle.name || ''}`
    const first = entries[0]?.path || ''
    const top = first.split('/')[0] || 'uploaded'
    return `upload:${top}`
  }, [dirHandle, entries])

  const tree = useMemo<TreeNode>(() => {
    const root: TreeNode = { kind: 'folder', name: '', path: '', children: [] }
    const map = new Map<string, TreeNode>()
    map.set('', root)
    const ensureFolder = (p: string, name: string) => {
      const existing = map.get(p)
      if (existing) return existing
      const parentPath = p.split('/').slice(0, -1).join('/')
      const folder: TreeNode = { kind: 'folder', name, path: p, children: [] }
      const parent = ensureFolder(parentPath, parentPath.split('/').pop() || '')
      parent.children!.push(folder)
      map.set(p, folder)
      return folder
    }
    for (const e of entries) {
      if (e.kind === 'folder') {
        // Explicitly added folder - ensure it exists in the tree
        ensureFolder(e.path, e.name)
      } else {
        // File entry - ensure parent folder exists and add file as child
        const parts = e.path.split('/')
        const fileName = parts.pop() as string
        const folderPath = parts.join('/')
        const folderNode = ensureFolder(folderPath, parts[parts.length - 1] || '')
        folderNode.children!.push({ kind: 'file', name: fileName, path: e.path })
      }
    }
    // sort children in each folder: folders first, then files by name
    const sortFolder = (node: TreeNode) => {
      if (!node.children) return
      node.children.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      node.children.forEach(sortFolder)
    }
    sortFolder(root)
    return root
  }, [entries])

  // Persist expanded state per project
  useEffect(() => {
    const key = `prompd.explorer.expanded:${projectId}`
    try {
      const raw = localStorage.getItem(key)
      if (raw) {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr)) setExpanded(new Set<string>(arr))
        return
      }
    } catch {}
    // default expand root
    setExpanded(new Set<string>(['']))
  }, [projectId])

  const toggle = (p: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p); else next.add(p)
      try { localStorage.setItem(`prompd.explorer.expanded:${projectId}`, JSON.stringify(Array.from(next))) } catch {}
      return next
    })
  }

  const collapseAll = useCallback(() => {
    setExpanded(new Set(['']))
    try { localStorage.setItem(`prompd.explorer.expanded:${projectId}`, JSON.stringify([''])) } catch {}
  }, [projectId])

  const isSpecialFolder = (name: string) => {
    const specialFolders = [
      'node_modules',
      '.git',
      '.vscode',
      '.idea',
      '.prompd',
      '.claude',
      'dist',
      'build',
      'out',
      'target',
      '.next',
      '.nuxt',
      'coverage',
      '__pycache__',
      '.pytest_cache',
      '.mypy_cache',
      'venv',
      '.venv',
      'env',
      '.env',
      'vendor',
      'bin',
      'obj'
    ]
    return specialFolders.includes(name.toLowerCase())
  }

  // Check if a path matches any ignore pattern (glob-style matching)
  const isIgnored = useCallback((path: string, name: string): boolean => {
    if (ignorePatterns.length === 0) return false

    for (const pattern of ignorePatterns) {
      // Normalize paths
      const normalizedPath = path.replace(/\\/g, '/')
      let normalizedPattern = pattern.replace(/\\/g, '/')

      // For folder/** patterns, also match the folder itself
      // e.g., "contexts/**" should match both "contexts" folder and "contexts/file.txt"
      if (normalizedPattern.endsWith('/**')) {
        const folderPath = normalizedPattern.slice(0, -3) // Remove /**
        if (normalizedPath === folderPath || normalizedPath.startsWith(folderPath + '/')) {
          return true
        }
      }

      // Convert glob pattern to regex
      const regexPattern = normalizedPattern
        .replace(/\./g, '\\.')           // Escape dots
        .replace(/\*\*/g, '{{DOUBLESTAR}}')  // Temp placeholder for **
        .replace(/\*/g, '[^/]*')         // * matches any chars except /
        .replace(/{{DOUBLESTAR}}/g, '.*') // ** matches anything including /
        .replace(/\?/g, '.')              // ? matches single char

      const regex = new RegExp(`^${regexPattern}$|/${regexPattern}$|^${regexPattern}/`)
      if (regex.test(normalizedPath) || regex.test(name)) {
        return true
      }
    }
    return false
  }, [ignorePatterns])

  const renderNode = (node: TreeNode, depth = 0) => {
    const pad = { paddingLeft: 8 + depth * 14 }
    const isNodeIgnored = isIgnored(node.path, node.name)

    if (node.kind === 'folder') {
      const isRoot = node.path === ''
      const isOpen = expanded.has(node.path)
      const isSpecial = isSpecialFolder(node.name)
      const isDimmed = isSpecial || isNodeIgnored

      if (isRoot) {
        return (
          <div key="root">
            {node.children?.map(ch => renderNode(ch, depth))}
          </div>
        )
      }
      return (
        <div key={node.path}>
          <div
            className="fe-item"
            style={{
              ...pad,
              opacity: isDimmed ? 0.5 : 1,
              fontStyle: isDimmed ? 'italic' : 'normal'
            }}
            data-path={node.path}
            title={isNodeIgnored ? 'Ignored in prompd.json' : undefined}
            onClick={() => toggle(node.path)}
            onContextMenu={(e) => {
              e.preventDefault()
              setContextMenu({
                x: e.clientX,
                y: e.clientY,
                entry: node,
                type: 'folder'
              })
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
              e.dataTransfer.dropEffect = 'move'
              console.log('[FileExplorer] Drag over folder:', node.path)
            }}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              const filePath = e.dataTransfer.getData('text/plain')
              console.log('[FileExplorer] Drop on folder:', node.path, 'file:', filePath)
              if (filePath && filePath !== node.path) {
                console.log('[FileExplorer] Calling handleMoveFile')
                handleMoveFile(filePath, node.path)
              } else {
                console.log('[FileExplorer] Drop ignored - same path or empty')
              }
            }}
          >
            <span className="icon" aria-hidden>
              {isOpen ?
                <FolderOpen size={16} color={isDimmed ? '#8B8B8B' : '#DCAA5F'} /> :
                <Folder size={16} color={isDimmed ? '#8B8B8B' : '#DCAA5F'} />
              }
            </span>
            <span className="name">{node.name}</span>
            {isNodeIgnored && <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#6b7280' }}>ignored</span>}
          </div>
          {isOpen ? (
            <div>
              {node.children?.map(ch => renderNode(ch, depth + 1))}
            </div>
          ) : null}
        </div>
      )
    }
    const isActive = currentFileName === node.path
    return (
      <div
        key={node.path}
        className={'fe-item ' + (isActive ? 'active' : '')}
        style={{
          ...pad,
          opacity: isNodeIgnored ? 0.5 : 1,
          fontStyle: isNodeIgnored ? 'italic' : 'normal'
        }}
        title={isNodeIgnored ? 'Ignored in prompd.json' : undefined}
        data-path={node.path}
        draggable={true}
        onDragStart={(e) => {
          // Allow both copy (for ContextArea) and move (for folder rearranging)
          e.dataTransfer.effectAllowed = 'copyMove'
          e.dataTransfer.setData('text/plain', node.path)
          e.dataTransfer.setData('application/x-prompd-context-file', JSON.stringify({ path: node.path, name: node.name }))
        }}
        onClick={() => openPath(node.path)}
        onContextMenu={(e) => {
          e.preventDefault()
          setContextMenu({
            x: e.clientX,
            y: e.clientY,
            entry: node,
            type: 'file'
          })
        }}>
        <span className="icon" aria-hidden>{iconFor(node.name, isNodeIgnored)}</span>
        <span className="name">{node.name}</span>
        {isNodeIgnored ? (
          <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#6b7280' }}>ignored</span>
        ) : (
          <span className="ext">{node.name.split('.').pop()}</span>
        )}
      </div>
    )
  }

  const uploadInputId = 'fe-upload-folder'
  
  const onUploadFolder = useCallback(async (e: any) => {
    const files: FileList = e.target.files
    if (!files || files.length === 0) return
    const list: FileEntry[] = []
    for (const f of Array.from(files)) {
      const rel = (f as any).webkitRelativePath || f.name
      list.push({ name: f.name, kind: 'file', path: rel, fileObj: f })
    }
    list.sort((a, b) => a.path.localeCompare(b.path))
    setEntries(list)
    setDirHandle(null)
    setError(null)
    // Expand top-level folder by default
    setExpanded(new Set(['']))
    const top = list[0]?.path?.split('/')?.[0] || 'uploaded'
    rememberProject({ mode: 'upload', name: top, top, snapshot: list })
  }, [])



  const openPath = useCallback(async (path: string) => {
    const entry = entries.find(e => e.path === path)
    if (entry) await openFile(entry)
  }, [entries, openFile])

  // Copy/Paste/New File/Folder operations
  const copyFilePath = useCallback(async (path: string) => {
    try {
      await navigator.clipboard.writeText(path)
      setClipboardData({ path, type: 'file' })
    } catch (err) {
      console.error('Failed to copy path:', err)
    }
  }, [])

  const copyFileContents = useCallback(async (path: string) => {
    try {
      const entry = entries.find(e => e.path === path)
      let text = ''
      if (entry?.handle && typeof (entry.handle as any).getFile === 'function') {
        const file = await (entry.handle as any).getFile()
        text = await file.text()
      } else if (entry?.fileObj) {
        text = await entry.fileObj.text()
      }
      await navigator.clipboard.writeText(text)
      setClipboardData({ path, content: text, type: 'file' })
    } catch (err) {
      console.error('Failed to copy contents:', err)
    }
  }, [entries])

  const pasteFileToFolder = useCallback(async (targetFolderPath: string) => {
    if (!clipboardData || !dirHandle) return
    try {
      const sourcePath = clipboardData.path
      const sourceEntry = entries.find(e => e.path === sourcePath)
      if (!sourceEntry) return

      const fileName = sourcePath.split('/').pop() as string
      const targetDir = await getDirectoryHandleForPath(dirHandle, targetFolderPath)

      // Read source file
      let text = ''
      if (sourceEntry.handle && typeof (sourceEntry.handle as any).getFile === 'function') {
        const file = await (sourceEntry.handle as any).getFile()
        text = await file.text()
      } else if (sourceEntry.fileObj) {
        text = await sourceEntry.fileObj.text()
      } else if (clipboardData.content) {
        text = clipboardData.content
      }

      // Write to target
      const newFileHandle = await targetDir.getFileHandle(fileName, { create: true })
      const writable = await newFileHandle.createWritable()
      await writable.write(text)
      await writable.close()
      await refresh()
    } catch (err) {
      console.error('Paste failed:', err)
      setError('Failed to paste file')
    }
  }, [clipboardData, dirHandle, entries, refresh])

  const createFileInFolder = useCallback(async (folderPath: string) => {
    if (!dirHandle) return
    try {
      setFileType('prmd')
      setShowAdvancedNewFile(false)

      const fileName = await new Promise<string | null>((resolve) => {
        setInputDialogValue('untitled.prmd')
        setInputDialog({
          title: 'New file:',
          defaultValue: 'untitled.prmd',
          showFileTypeSelector: true,
          onSubmit: (value: string) => {
            setInputDialog(null)
            resolve(value || null)
          }
        })
      })
      if (!fileName) return

      const content = getDefaultContent(fileName)

      // Check if this is an Electron pseudo-handle
      const electronPath = (dirHandle as any)?._electronPath
      if (electronPath && (window as any).electronAPI?.writeFile) {
        // Electron mode - use IPC to write the file
        const fullPath = folderPath
          ? `${electronPath}/${folderPath}/${fileName}`.replace(/\\/g, '/')
          : `${electronPath}/${fileName}`.replace(/\\/g, '/')
        const result = await (window as any).electronAPI.writeFile(fullPath, content)
        if (!result.success) {
          throw new Error(result.error || 'Failed to create file')
        }
      } else {
        // File System Access API mode
        const targetDir = await getDirectoryHandleForPath(dirHandle, folderPath)
        const newFileHandle = await targetDir.getFileHandle(fileName, { create: true })
        const writable = await newFileHandle.createWritable()
        await writable.write(content)
        await writable.close()
      }
      await refresh()
    } catch (err) {
      console.error('Create file failed:', err)
      setError('Failed to create file')
    }
  }, [dirHandle, refresh])

  const createFolderInFolder = useCallback(async (folderPath: string) => {
    console.log('[FileExplorer] createFolderInFolder called with path:', folderPath)
    if (!dirHandle) {
      console.log('[FileExplorer] No dirHandle, returning')
      return
    }
    try {
      const folderName = await showInputDialog('New folder name:', 'new-folder')
      console.log('[FileExplorer] User entered folder name:', folderName)
      if (!folderName) {
        console.log('[FileExplorer] No folder name provided, returning')
        return
      }

      // Check if this is an Electron pseudo-handle
      const electronPath = (dirHandle as any)?._electronPath
      console.log('[FileExplorer] Electron path:', electronPath)
      if (electronPath && (window as any).electronAPI?.createDir) {
        // Electron mode - use IPC to create the folder
        const fullPath = folderPath
          ? `${electronPath}/${folderPath}/${folderName}`.replace(/\\/g, '/')
          : `${electronPath}/${folderName}`.replace(/\\/g, '/')
        console.log('[FileExplorer] Creating folder at:', fullPath)
        const result = await (window as any).electronAPI.createDir(fullPath)
        console.log('[FileExplorer] Create folder result:', result)
        if (!result.success) {
          throw new Error(result.error || 'Failed to create folder')
        }
      } else {
        // File System Access API mode
        console.log('[FileExplorer] Using File System Access API')
        const targetDir = await getDirectoryHandleForPath(dirHandle, folderPath)
        await targetDir.getDirectoryHandle(folderName, { create: true })
      }
      console.log('[FileExplorer] Refreshing file list...')
      await refresh()
      console.log('[FileExplorer] Folder created and refreshed successfully')
    } catch (err) {
      console.error('[FileExplorer] Create folder failed:', err)
      setError('Failed to create folder')
    }
  }, [dirHandle, refresh, showInputDialog])

  const renameFolder = useCallback(async (folderPath: string) => {
    if (!dirHandle) return
    try {
      const parts = folderPath.split('/')
      const oldName = parts.pop() as string
      const parentPath = parts.join('/')
      const newName = await showInputDialog('Rename folder:', oldName)
      if (!newName || newName === oldName) return

      const electronAPI = (window as any).electronAPI
      const isElectronHandle = (dirHandle as any)._electronPath && electronAPI?.rename

      if (isElectronHandle) {
        // Electron mode: use IPC rename
        const workspacePath = (dirHandle as any)._electronPath
        const oldFullPath = `${workspacePath}/${folderPath}`.replace(/\\/g, '/')
        const newFolderPath = parentPath ? `${parentPath}/${newName}` : newName
        const newFullPath = `${workspacePath}/${newFolderPath}`.replace(/\\/g, '/')
        const result = await electronAPI.rename(oldFullPath, newFullPath)
        if (!result.success) {
          throw new Error(result.error || 'Rename failed')
        }
      } else {
        // Browser File System Access API mode
        const parent = await getDirectoryHandleForPath(dirHandle, parentPath)

        // Get old folder handle
        const oldFolder = await parent.getDirectoryHandle(oldName)

        // Create new folder
        const newFolder = await parent.getDirectoryHandle(newName, { create: true })

        // Copy contents recursively (simplified - would need full recursive copy)
        for await (const [name, handle] of (oldFolder as any).entries()) {
          if ((handle as any).kind === 'file') {
            const file = await (handle as any).getFile()
            const text = await file.text()
            const newFileHandle = await newFolder.getFileHandle(name, { create: true })
            const w = await newFileHandle.createWritable()
            await w.write(text)
            await w.close()
          }
        }

        // Delete old folder
        await parent.removeEntry(oldName, { recursive: true })
      }
      await refresh()
    } catch (err) {
      console.error('Rename folder failed:', err)
      setError('Failed to rename folder')
    }
  }, [dirHandle, refresh, showInputDialog])

  const deleteFolder = useCallback(async (folderPath: string) => {
    if (!dirHandle) return
    const folderName = folderPath.split('/').pop()
    const confirmed = await showConfirm({
      title: 'Delete Folder',
      message: `Delete folder "${folderName}" and all its contents?`,
      confirmLabel: 'Delete',
      confirmVariant: 'danger'
    })
    if (!confirmed) return

    try {
      const electronAPI = (window as any).electronAPI
      const isElectronHandle = (dirHandle as any)._electronPath && electronAPI?.delete

      if (isElectronHandle) {
        // Electron mode: use IPC delete with recursive option for directories
        const workspacePath = (dirHandle as any)._electronPath
        const fullPath = `${workspacePath}/${folderPath}`.replace(/\\/g, '/')
        const result = await electronAPI.delete(fullPath, { recursive: true })
        if (!result.success) {
          throw new Error(result.error || 'Delete failed')
        }
      } else {
        // Browser File System Access API mode
        const parts = folderPath.split('/')
        const name = parts.pop() as string
        const parentPath = parts.join('/')
        const parent = await getDirectoryHandleForPath(dirHandle, parentPath)
        await parent.removeEntry(name, { recursive: true })
      }
      await refresh()
    } catch (err) {
      console.error('Delete folder failed:', err)
      setError('Failed to delete folder')
    }
  }, [dirHandle, refresh, showConfirm])

  const handleMoveFile = useCallback(async (sourceFilePath: string, targetFolderPath: string) => {
    if (!dirHandle) return

    try {
      const sourceEntry = entries.find(e => e.path === sourceFilePath && e.kind === 'file')
      if (!sourceEntry) {
        console.error('Source file not found:', sourceFilePath)
        return
      }

      // Don't move if already in target folder
      const sourceParts = sourceFilePath.split('/')
      const fileName = sourceParts.pop() as string
      const sourceParentPath = sourceParts.join('/')
      if (sourceParentPath === targetFolderPath) {
        return // Already in this folder
      }

      const electronPath = (dirHandle as any)?._electronPath
      if (electronPath && (window as any).electronAPI?.rename) {
        // Electron mode - use rename to move the file
        const sourceFullPath = `${electronPath}/${sourceFilePath}`.replace(/\\/g, '/')
        const targetFullPath = targetFolderPath
          ? `${electronPath}/${targetFolderPath}/${fileName}`.replace(/\\/g, '/')
          : `${electronPath}/${fileName}`.replace(/\\/g, '/')

        const result = await (window as any).electronAPI.rename(sourceFullPath, targetFullPath)
        if (!result.success) {
          throw new Error(result.error || 'Move failed')
        }

        // Notify TabManager of file move (it's a rename with path change)
        const newPath = targetFolderPath ? `${targetFolderPath}/${fileName}` : fileName
        if (onFileRenamed) {
          const electronAPI = (window as any).electronAPI
          const pseudoHandle = {
            kind: 'file',
            name: fileName,
            _electronPath: targetFullPath,
            getFile: async () => ({
              name: fileName,
              text: async () => {
                const readResult = await electronAPI.readFile(targetFullPath)
                return readResult.content || ''
              }
            }),
            createWritable: async () => ({
              write: async (content: string) => {
                await electronAPI.writeFile(targetFullPath, content)
              },
              close: async () => {}
            })
          }
          onFileRenamed(sourceFilePath, newPath, pseudoHandle as any)
        }
      } else {
        // Browser File System Access API mode
        // Read source file
        let text = ''
        if (sourceEntry.handle && typeof (sourceEntry.handle as any).getFile === 'function') {
          const file = await (sourceEntry.handle as any).getFile()
          text = await file.text()
        } else if (sourceEntry.fileObj) {
          text = await sourceEntry.fileObj.text()
        } else {
          throw new Error('Cannot read source file')
        }

        // Write to target folder
        const targetDir = await getDirectoryHandleForPath(dirHandle, targetFolderPath)
        const newFileHandle = await targetDir.getFileHandle(fileName, { create: true })
        const writable = await newFileHandle.createWritable()
        await writable.write(text)
        await writable.close()

        // Delete from source folder
        const sourceParent = await getDirectoryHandleForPath(dirHandle, sourceParentPath)
        await sourceParent.removeEntry(fileName)

        // Notify TabManager of file move
        const newPath = targetFolderPath ? `${targetFolderPath}/${fileName}` : fileName
        if (onFileRenamed) {
          onFileRenamed(sourceFilePath, newPath, newFileHandle)
        }
      }

      await refresh()
    } catch (err) {
      console.error('Move file failed:', err)
      setError(`Failed to move file: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }, [dirHandle, entries, refresh, onFileRenamed])

  const topLevelPdproj = useMemo(() => entries.find(e => e.path.toLowerCase().endsWith('.pdproj') && !e.path.includes('/')), [entries])

  // Track panel width for responsive button labels
  const [panelWidth, setPanelWidth] = useState(300)
  const observerRef = useRef<ResizeObserver | null>(null)
  const panelRef = useCallback((node: HTMLDivElement | null) => {
    // Disconnect previous observer if any
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }
    if (!node) return
    // Create new observer
    observerRef.current = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width || 333
      setPanelWidth(width)
    })
    observerRef.current.observe(node)
  }, [])
  // Threshold for switching to icon-only buttons
  // With 3 buttons (New, Refresh, Publish), we need more space for labels
  const isNarrow = panelWidth < 300

  return (
    <div className="panel file-explorer" ref={panelRef}>
      <SidebarPanelHeader title="Explorer" onCollapse={onCollapse}>
        {onCreateNewPrompd && (
          <button
            className="btn"
            onClick={onCreateNewPrompd}
            title="Create new prompt"
            style={{
              padding: isNarrow ? '4px 6px' : '4px 8px',
              fontSize: '11px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              flexShrink: 0
            }}
          >
            <Sparkles size={12} />
            {!isNarrow && 'New'}
          </button>
        )}
        <button
          className="btn"
          onClick={refresh}
          disabled={!dirHandle || loading}
          title="Refresh file tree"
          style={{
            padding: isNarrow ? '4px 6px' : '4px 8px',
            fontSize: '11px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            flexShrink: 0
          }}
        >
          <RefreshCw size={12} className={loading ? 'spin' : ''} />
          {!isNarrow && 'Refresh'}
        </button>
        {onOpenPublish && (
          <button
            className="btn"
            onClick={onOpenPublish}
            disabled={!dirHandle}
            title={dirHandle ? "Publish package to registry" : "Open a workspace first"}
            style={{
              opacity: dirHandle ? 1 : 0.5,
              cursor: dirHandle ? 'pointer' : 'not-allowed',
              padding: isNarrow ? '4px 6px' : '4px 8px',
              fontSize: '11px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              flexShrink: 0
            }}
          >
            <Package size={12} />
            {!isNarrow && 'Publish'}
          </button>
        )}
      </SidebarPanelHeader>
      <input id={uploadInputId} type="file" webkitdirectory="" multiple style={{ display: 'none' }} onChange={onUploadFolder as any} />
      <div className="fe-path" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
          {topLevelPdproj ? <img src="./icons/pdproj-icon.svg" alt="pdproj" style={{ width: 14, height: 14, marginRight: 6 }} /> : null}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {pathLabel}{topLevelPdproj ? ` — ${topLevelPdproj.path}` : ''}{loading ? ' — loading…' : ''}
          </span>
        </div>
        {entries.length > 0 && (
          <button
            className="btn"
            onClick={collapseAll}
            title="Collapse all folders"
            style={{
              padding: '2px 6px',
              marginLeft: '6px',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              flexShrink: 0
            }}
          >
            <ChevronsDownUp size={12} />
          </button>
        )}
      </div>
      {error ? <div className="issues" style={{ color: 'var(--error)' }}>{error}</div> : null}
      <div
        className="fe-list"
        onContextMenu={(e) => {
          // Show root folder context menu if clicking on empty space (not on files/folders)
          // and if we have a workspace open
          // Check if the click target is the list container, tree container, or empty message
          const target = e.target as HTMLElement
          const isEmptySpace = target === e.currentTarget ||
            target.classList.contains('fe-tree') ||
            target.classList.contains('pv-empty')
          if (isEmptySpace && dirHandle) {
            e.preventDefault()
            setContextMenu({
              x: e.clientX,
              y: e.clientY,
              entry: { kind: 'folder', name: '', path: '' } as TreeNode,
              type: 'folder'
            })
          }
        }}
      >
        {entries.length === 0 ? (
          <div className="pv-empty" style={{ padding: '12px 16px', textAlign: 'center' }}>
            {dirHandle ? (
              <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>No files</span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', padding: '8px 0' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>No workspace open</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={pickFolder}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: 'var(--accent)',
                      background: 'transparent',
                      border: '1px solid var(--accent)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = 'var(--accent)'
                      e.currentTarget.style.color = 'white'
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = 'var(--accent)'
                    }}
                  >
                    <FolderOpen size={14} />
                    Folder
                  </button>
                  {onOpenProjects && (
                    <button
                      onClick={onOpenProjects}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: 'var(--text-secondary)',
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = 'var(--panel)'
                        e.currentTarget.style.borderColor = 'var(--text-secondary)'
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.borderColor = 'var(--border)'
                      }}
                    >
                      <Package size={14} />
                      Projects
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="fe-tree">
            {renderNode(tree)}
          </div>
        )}
      </div>
      {!canFS ? (
        <div className="issues" style={{ fontSize: 12 }}>Your browser may not support the File System Access API. Try Chromium-based browsers.</div>
      ) : null}
      {contextMenu ? (
        <div
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            background: 'var(--panel-2)',
            border: '1px solid rgba(71, 85, 105, 0.3)', borderRadius: 8, zIndex: 150, minWidth: 180, boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15), 0 0 12px rgba(99, 102, 241, 0.15)'
          }}
          onMouseLeave={() => setContextMenu(null)}
        >
          {contextMenu.type === 'file' ? (
            <>
              {/* File Context Menu */}
              <div className="fe-item" onClick={() => { openPath(contextMenu.entry.path); setContextMenu(null) }}>
                <span className="icon"><FileText size={14} /></span>
                <span className="name">Open</span>
              </div>
              <div className="fe-item" onClick={() => {
                // Look up the entry from entries array to get the handle with _electronPath
                const entry = entries.find(e => e.path === contextMenu.entry.path)
                const electronPath = entry?.handle?._electronPath
                revealInExplorer(contextMenu.entry.path, electronPath)
                setContextMenu(null)
              }}>
                <span className="icon"><FileText size={14} /></span>
                <span className="name">Reveal in Explorer</span>
              </div>
              <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
              <div className="fe-item" onClick={() => { copyFilePath(contextMenu.entry.path); setContextMenu(null) }}>
                <span className="icon"><Copy size={14} /></span>
                <span className="name">Copy Path</span>
              </div>
              <div className="fe-item" onClick={() => { copyFileContents(contextMenu.entry.path); setContextMenu(null) }}>
                <span className="icon"><Clipboard size={14} /></span>
                <span className="name">Copy Contents</span>
              </div>

              {/* Install Dependencies - only for prompd.json files */}
              {onInstallDependencies && contextMenu.entry.name === 'prompd.json' && (
                <>
                  <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                  <div className="fe-item" onClick={() => { onInstallDependencies(); setContextMenu(null) }}>
                    <span className="icon"><Download size={14} /></span>
                    <span className="name">Install Dependencies</span>
                  </div>
                </>
              )}

              {/* Add To → submenu (only for .prmd files and when handler is available) */}
              {onAddToContentField && currentFileName && (currentFileName.endsWith('.prmd') || currentFileName.endsWith('.pdflow')) && (
                <div
                  className="fe-item"
                  style={{ position: 'relative' }}
                  onMouseEnter={() => setShowAddToSubmenu(true)}
                  onMouseLeave={() => setShowAddToSubmenu(false)}
                >
                  <span className="icon"><Link size={14} /></span>
                  <span className="name">Add To →</span>
                  {showAddToSubmenu && (
                    <div style={{
                      position: 'absolute',
                      left: '100%',
                      top: 0,
                      minWidth: '120px',
                      background: 'var(--panel)',
                      border: '1px solid #6b7280',
                      borderRadius: '6px',
                      padding: '4px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                      zIndex: 1000
                    }}>
                      <div className="fe-item" onClick={() => { onAddToContentField(contextMenu.entry.path, 'system'); setContextMenu(null); setShowAddToSubmenu(false) }}>
                        <span className="name">system</span>
                      </div>
                      <div className="fe-item" onClick={() => { onAddToContentField(contextMenu.entry.path, 'assistant'); setContextMenu(null); setShowAddToSubmenu(false) }}>
                        <span className="name">assistant</span>
                      </div>
                      <div className="fe-item" onClick={() => { onAddToContentField(contextMenu.entry.path, 'context'); setContextMenu(null); setShowAddToSubmenu(false) }}>
                        <span className="name">context</span>
                      </div>
                      <div className="fe-item" onClick={() => { onAddToContentField(contextMenu.entry.path, 'user'); setContextMenu(null); setShowAddToSubmenu(false) }}>
                        <span className="name">user</span>
                      </div>
                      <div className="fe-item" onClick={() => { onAddToContentField(contextMenu.entry.path, 'response'); setContextMenu(null); setShowAddToSubmenu(false) }}>
                        <span className="name">response</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Ignore submenu - add file/pattern to prompd.json ignore array */}
              {dirHandle && (
                <div
                  className="fe-item"
                  style={{ position: 'relative' }}
                  onMouseEnter={() => setShowIgnoreSubmenu(true)}
                  onMouseLeave={() => setShowIgnoreSubmenu(false)}
                >
                  <span className="icon"><Square size={14} /></span>
                  <span className="name">Ignore →</span>
                  {showIgnoreSubmenu && (
                    <div style={{
                      position: 'absolute',
                      left: '100%',
                      top: 0,
                      minWidth: '200px',
                      background: 'var(--panel)',
                      border: '1px solid #6b7280',
                      borderRadius: '6px',
                      padding: '4px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                      zIndex: 1000
                    }}>
                      {/* Ignore this specific file */}
                      <div className="fe-item" onClick={() => {
                        addIgnorePattern(contextMenu.entry.path)
                        setContextMenu(null)
                        setShowIgnoreSubmenu(false)
                      }}>
                        <span className="name">Ignore file</span>
                      </div>
                      {/* Ignore all files with this extension */}
                      {contextMenu.entry.name.includes('.') && (
                        <div className="fe-item" onClick={() => {
                          const ext = contextMenu.entry.name.split('.').pop()
                          addIgnorePattern(`*.${ext}`)
                          setContextMenu(null)
                          setShowIgnoreSubmenu(false)
                        }}>
                          <span className="name">Ignore all *.{contextMenu.entry.name.split('.').pop()} files</span>
                        </div>
                      )}
                      {/* Ignore folder containing this file */}
                      {contextMenu.entry.path.includes('/') && (
                        <div className="fe-item" onClick={() => {
                          const folderPath = contextMenu.entry.path.split('/').slice(0, -1).join('/')
                          addIgnorePattern(`${folderPath}/**`)
                          setContextMenu(null)
                          setShowIgnoreSubmenu(false)
                        }}>
                          <span className="name">Ignore folder /{contextMenu.entry.path.split('/').slice(0, -1).join('/')}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="fe-item" onClick={async () => {
                try {
                  const picker = (window as any).showSaveFilePicker
                  if (typeof picker !== 'function') return setContextMenu(null)
                  const handle = await picker({ suggestedName: contextMenu.entry.name })
                  const writable = await handle.createWritable()
                  const entry = entries.find(e => e.path === contextMenu.entry.path)
                  let text = ''
                  if (entry?.handle && typeof (entry.handle as any).getFile === 'function') {
                    const f = await (entry.handle as any).getFile(); text = await f.text()
                  } else if (entry?.fileObj) { text = await entry.fileObj.text() }
                  await writable.write(text)
                  await writable.close()
                } catch {}
                setContextMenu(null)
              }}>
                <span className="icon"><FileText size={14} /></span>
                <span className="name">Save As…</span>
              </div>
              {dirHandle ? (
                <>
                  <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                  <div className="fe-item" onClick={async () => {
                    const entry = entries.find(e => e.path === contextMenu.entry.path)
                    const oldPath = contextMenu.entry.path
                    const parts = oldPath.split('/')
                    const fileName = parts.pop() as string
                    const parentPath = parts.join('/')
                    setContextMenu(null) // Close menu before showing dialog
                    const newName = await showInputDialog('Rename file', fileName)
                    if (!newName || newName === fileName) { return }
                    try {
                      const electronAPI = (window as any).electronAPI
                      const isElectronHandle = (dirHandle as any)._electronPath && electronAPI?.rename

                      if (isElectronHandle) {
                        // Electron mode: use IPC rename
                        const workspacePath = (dirHandle as any)._electronPath
                        const oldFullPath = `${workspacePath}/${oldPath}`.replace(/\\/g, '/')
                        const newFullPath = `${workspacePath}/${parentPath ? parentPath + '/' : ''}${newName}`.replace(/\\/g, '/')
                        const result = await electronAPI.rename(oldFullPath, newFullPath)
                        if (!result.success) {
                          throw new Error(result.error || 'Rename failed')
                        }

                        // Notify TabManager of file rename
                        const newPath = parentPath ? `${parentPath}/${newName}` : newName
                        if (onFileRenamed) {
                          // Create a pseudo-handle for the renamed file
                          const pseudoHandle = {
                            kind: 'file',
                            name: newName,
                            _electronPath: newFullPath,
                            getFile: async () => ({
                              name: newName,
                              text: async () => {
                                const readResult = await electronAPI.readFile(newFullPath)
                                return readResult.content || ''
                              }
                            }),
                            createWritable: async () => ({
                              write: async (content: string) => {
                                await electronAPI.writeFile(newFullPath, content)
                              },
                              close: async () => {}
                            })
                          }
                          onFileRenamed(oldPath, newPath, pseudoHandle as any)
                        }
                      } else {
                        // Browser File System Access API mode
                        const parent = await getDirectoryHandleForPath(dirHandle, parentPath)
                        let text = ''
                        if (entry?.handle && typeof (entry.handle as any).getFile === 'function') {
                          const f = await (entry.handle as any).getFile(); text = await f.text()
                        } else if (entry?.fileObj) { text = await entry.fileObj.text() }
                        const newFileHandle = await parent.getFileHandle(newName, { create: true })
                        const w = await newFileHandle.createWritable(); await w.write(text); await w.close()
                        await parent.removeEntry(fileName)

                        // Notify TabManager of file rename
                        const newPath = parentPath ? `${parentPath}/${newName}` : newName
                        if (onFileRenamed) {
                          onFileRenamed(oldPath, newPath, newFileHandle)
                        }
                      }

                      await refresh()
                    } catch (err) { console.warn('Rename failed', err) }
                  }}>
                    <span className="icon"><FileText size={14} /></span>
                    <span className="name">Rename…</span>
                  </div>
                  <div className="fe-item" onClick={async () => {
                    const oldPath = contextMenu.entry.path
                    const parts = oldPath.split('/')
                    const fileName = parts.pop() as string
                    const parentPath = parts.join('/')
                    setContextMenu(null) // Close menu before showing dialog
                    const confirmed = await showConfirm({
                      title: 'Delete File',
                      message: `Delete "${fileName}"?`,
                      confirmLabel: 'Delete',
                      confirmVariant: 'danger'
                    })
                    if (!confirmed) { return }
                    try {
                      const electronAPI = (window as any).electronAPI
                      const isElectronHandle = (dirHandle as any)._electronPath && electronAPI?.delete

                      if (isElectronHandle) {
                        // Electron mode: use IPC delete
                        const workspacePath = (dirHandle as any)._electronPath
                        const fullPath = `${workspacePath}/${oldPath}`.replace(/\\/g, '/')
                        const result = await electronAPI.delete(fullPath)
                        if (!result.success) {
                          throw new Error(result.error || 'Delete failed')
                        }
                      } else {
                        // Browser File System Access API mode
                        const parent = await getDirectoryHandleForPath(dirHandle, parentPath)
                        await parent.removeEntry(fileName)
                      }

                      // Notify TabManager of file deletion
                      if (onFileDeleted) {
                        onFileDeleted(oldPath)
                      }

                      await refresh()
                    } catch (err) { console.warn('Delete failed', err) }
                  }}>
                    <span className="icon"><Trash2 size={14} /></span>
                    <span className="name">Delete</span>
                  </div>
                </>
              ) : null}
            </>
          ) : (
            <>
              {/* Folder Context Menu */}
              {dirHandle ? (
                <>
                  <div className="fe-item" onClick={() => { createFileInFolder(contextMenu.entry.path); setContextMenu(null) }}>
                    <span className="icon"><FilePlus size={14} /></span>
                    <span className="name">New File…</span>
                  </div>
                  <div className="fe-item" onClick={() => { createFolderInFolder(contextMenu.entry.path); setContextMenu(null) }}>
                    <span className="icon"><FolderPlus size={14} /></span>
                    <span className="name">New Folder…</span>
                  </div>
                  <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                  <div
                    className="fe-item"
                    onClick={() => {
                      if (clipboardData) {
                        pasteFileToFolder(contextMenu.entry.path);
                        setContextMenu(null);
                      }
                    }}
                    style={{ opacity: clipboardData ? 1 : 0.5, cursor: clipboardData ? 'pointer' : 'not-allowed' }}
                  >
                    <span className="icon"><Clipboard size={14} /></span>
                    <span className="name">Paste</span>
                  </div>
                  {/* Only show folder operations for non-root folders */}
                  {contextMenu.entry.path !== '' && (
                    <>
                      <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                      <div className="fe-item" onClick={() => { copyFilePath(contextMenu.entry.path); setContextMenu(null) }}>
                        <span className="icon"><Copy size={14} /></span>
                        <span className="name">Copy Path</span>
                      </div>
                      <div className="fe-item" onClick={() => { renameFolder(contextMenu.entry.path); setContextMenu(null) }}>
                        <span className="icon"><FolderOpen size={14} /></span>
                        <span className="name">Rename…</span>
                      </div>
                      <div className="fe-item" onClick={() => { deleteFolder(contextMenu.entry.path); setContextMenu(null) }}>
                        <span className="icon"><Trash2 size={14} /></span>
                        <span className="name">Delete</span>
                      </div>
                      {/* Ignore folder option */}
                      <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                      <div className="fe-item" onClick={() => {
                        addIgnorePattern(`${contextMenu.entry.path}/**`)
                        setContextMenu(null)
                      }}>
                        <span className="icon"><Square size={14} /></span>
                        <span className="name">Ignore folder</span>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="fe-item" style={{ opacity: 0.5 }}>
                  <span className="name">Open folder to edit</span>
                </div>
              )}
            </>
          )}
        </div>
      ) : null}

      {/* Input Dialog (replacement for prompt()) */}
      {inputDialog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => {
            inputDialog.onSubmit('')
          }}
        >
          <div
            style={{
              background: 'var(--panel-2)',
              border: '1px solid var(--accent)',
              borderRadius: 12,
              padding: '20px',
              minWidth: '320px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 16px 0' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--foreground)' }}>
                {inputDialog.title}
              </h3>
              {inputDialog.showFileTypeSelector && (
                <button
                  onClick={() => setShowAdvancedNewFile(!showAdvancedNewFile)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    padding: '2px 4px',
                  }}
                >
                  {showAdvancedNewFile ? 'Show file types' : 'Advanced'}
                </button>
              )}
            </div>

            {/* File type selector cards */}
            {inputDialog.showFileTypeSelector && !showAdvancedNewFile && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                {FILE_TYPES.map(ft => (
                  <button
                    key={ft.key}
                    onClick={() => {
                      setFileType(ft.key)
                      if (ft.key === 'custom') return
                      if (ft.key === 'prompdjson') {
                        setInputDialogValue('prompd.json')
                        return
                      }
                      const dotIdx = inputDialogValue.lastIndexOf('.')
                      const baseName = dotIdx > 0 ? inputDialogValue.substring(0, dotIdx) : inputDialogValue
                      setInputDialogValue(baseName + ft.ext)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 12px',
                      background: fileType === ft.key
                        ? 'color-mix(in srgb, var(--accent) 15%, transparent)'
                        : 'var(--input-bg)',
                      border: fileType === ft.key
                        ? '1.5px solid var(--accent)'
                        : '1px solid var(--border)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: 'var(--foreground)',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                  >
                    <div style={{ flexShrink: 0 }}>{ft.icon}</div>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '13px' }}>{ft.label}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>{ft.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <input
              type="text"
              value={inputDialogValue}
              onChange={(e) => {
                setInputDialogValue(e.target.value)
                // Sync file type from typed extension
                if (inputDialog.showFileTypeSelector) {
                  const val = e.target.value
                  if (val.endsWith('.prmd')) setFileType('prmd')
                  else if (val.endsWith('.pdflow')) setFileType('pdflow')
                  else if (val === 'prompd.json') setFileType('prompdjson')
                  else setFileType('custom')
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  inputDialog.onSubmit(inputDialogValue)
                } else if (e.key === 'Escape') {
                  inputDialog.onSubmit('')
                }
              }}
              autoFocus
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: '14px',
                background: 'var(--input-bg)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: 'var(--foreground)',
                marginBottom: '16px',
                boxSizing: 'border-box'
              }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => inputDialog.onSubmit('')}
                style={{
                  padding: '8px 16px',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  color: 'var(--foreground)',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => inputDialog.onSubmit(inputDialogValue)}
                style={{
                  padding: '8px 16px',
                  background: 'var(--accent)',
                  border: 'none',
                  borderRadius: '6px',
                  color: 'white',
                  cursor: 'pointer'
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog (using reusable component) */}
      <ConfirmDialogComponent />
    </div>
  )
}

function iconFor(name: string, isIgnored = false) {
  const lower = name.toLowerCase()
  const ext = lower.split('.').pop() || ''
  const ignoredColor = '#6b7280' // Grey color for ignored files

  // Prompd-specific files with custom SVG icons
  if (lower.endsWith('.prmd')) {
    return (
      <img
        src="./icons/prmd-color.svg"
        alt="prmd"
        style={{
          width: 20,
          height: 20,
          opacity: isIgnored ? 0.5 : 1,
          filter: isIgnored ? 'grayscale(100%)' : 'none'
        }}
      />
    )
  }
  if (lower.endsWith('.pdflow') || lower.endsWith('.prompdflow')) {
    return (
      <img
        src="./icons/prompdflow-color.svg"
        alt="pdflow"
        style={{
          width: 20,
          height: 20,
          opacity: isIgnored ? 0.5 : 1,
          filter: isIgnored ? 'grayscale(100%)' : 'none'
        }}
      />
    )
  }
  if (lower.endsWith('.pdpkg')) {
    return <Package size={16} color={isIgnored ? ignoredColor : "#C586C0"} />
  }

  // Common file types with VS Code colors
  if (ext === 'md') {
    return <FileText size={16} color={isIgnored ? ignoredColor : "#519ABA"} />
  }
  if (ext === 'json') {
    return <FileJson size={16} color={isIgnored ? ignoredColor : "#CBCB41"} />
  }
  if (ext === 'yaml' || ext === 'yml') {
    return <Settings size={16} color={isIgnored ? ignoredColor : "#CB4B16"} />
  }
  if (ext === 'txt') {
    return <FileText size={16} color={isIgnored ? ignoredColor : "#8B949E"} />
  }
  if (ext === 'ts' || ext === 'tsx') {
    return <FileCode size={16} color={isIgnored ? ignoredColor : "#3178C6"} />
  }
  if (ext === 'js' || ext === 'jsx') {
    return <FileCode size={16} color={isIgnored ? ignoredColor : "#F7DF1E"} />
  }
  if (ext === 'py') {
    return <FileCode size={16} color={isIgnored ? ignoredColor : "#3776AB"} />
  }
  if (ext === 'html') {
    return <Code size={16} color={isIgnored ? ignoredColor : "#E34F26"} />
  }
  if (ext === 'css') {
    return <FileCode size={16} color={isIgnored ? ignoredColor : "#1572B6"} />
  }
  if (ext === 'svg' || ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif') {
    return <FileImage size={16} color={isIgnored ? ignoredColor : "#A371F7"} />
  }

  // Default file icon
  return <FileText size={16} color={isIgnored ? ignoredColor : "#8B949E"} />
}

function formatFileName(fileName: string): { id: string; name: string } {
  // Strip extension
  const dotIdx = fileName.lastIndexOf('.')
  const baseName = dotIdx > 0 ? fileName.substring(0, dotIdx) : fileName
  // id: kebab-case, lowercase, replace underscores/spaces with hyphens
  const id = baseName.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '')
  // name: Title case, split on hyphens/underscores/spaces
  const name = baseName
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim()
  return { id: id || 'untitled', name: name || 'Untitled' }
}

function defaultPrompd(fileName?: string) {
  const { id, name } = formatFileName(fileName || 'untitled.prmd')
  return `---
id: ${id}
name: ${name}
description: ""
version: 1.0.0
---

# User

`
}

function defaultWorkflow(fileName?: string) {
  const { id, name } = formatFileName(fileName || 'new-workflow.pdflow')
  return JSON.stringify({
    version: '1.0.0',
    metadata: {
      id,
      name,
      description: ''
    },
    parameters: [],
    nodes: [],
    edges: []
  }, null, 2) + '\n'
}

function defaultPrompdJson() {
  return JSON.stringify({
    name: 'untitled',
    version: '1.0.0',
    description: ''
  }, null, 2) + '\n'
}

function getDefaultContent(fileName: string): string {
  if (fileName.endsWith('.prmd')) return defaultPrompd(fileName)
  if (fileName.endsWith('.pdflow')) return defaultWorkflow(fileName)
  if (fileName === 'prompd.json') return defaultPrompdJson()
  return ''
}

type ProjectRec = { mode: 'fs' | 'upload'; name: string; top: string; snapshot?: FileEntry[]; ts?: number }
function getProjects(): ProjectRec[] { try { return JSON.parse(localStorage.getItem('prompd.projects') || '[]') } catch { return [] } }
function saveProjects(list: ProjectRec[]) { try { localStorage.setItem('prompd.projects', JSON.stringify(list.slice(0, 12))) } catch {} }
function rememberProject(rec: ProjectRec) {
  const list = getProjects().filter(r => !(r.mode === rec.mode && r.top === rec.top))
  saveProjects([{ ...rec, ts: Date.now() }, ...list])
}

function ProjectsButton({ entries, setEntries, setDirHandle }: { entries: FileEntry[]; setEntries: (l: FileEntry[]) => void; setDirHandle: (h: any) => void }) {
  const list = getProjects()
  if (list.length === 0) return null
  return (
    <div style={{ position: 'relative' }}>
      <details>
        <summary className="btn">Projects ▾</summary>
        <div style={{ position: 'absolute', top: '110%', left: 0, background: 'var(--panel-2)', border: '1px solid var(--accent)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)', zIndex: 10, minWidth: 200 }}>
          {list.map((r, i) => (
            <div key={i} className="fe-item" onClick={async (event) => {
              if (r.mode === 'upload' && r.snapshot) { setEntries(r.snapshot); setDirHandle(null) }
              else {
                try { const h = await (window as any).showDirectoryPicker(); setDirHandle(h) } catch {}
              }
              ;(event?.currentTarget as HTMLElement).closest('details')?.removeAttribute('open')
            }}>
              <span className="icon"><Folder size={16} color="var(--muted)" /></span><span className="name">{r.name}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}

async function getDirectoryHandleForPath(root: any, path: string): Promise<any> {
  let dir = root
  if (!path) return dir
  const parts = path.split('/').filter(Boolean)
  for (const p of parts) {
    dir = await dir.getDirectoryHandle(p, { create: false })
  }
  return dir
}

function revealInExplorer(relativePath: string, electronPath?: string) {
  // In Electron, open the system file explorer
  if (electronPath && (window as any).electronAPI?.showItemInFolder) {
    (window as any).electronAPI.showItemInFolder(electronPath)
    return
  }

  // Fallback: Expand all ancestor folders in the UI and scroll the item into view
  const parts = relativePath.split('/')
  let prefix = ''
  for (let i = 0; i < parts.length - 1; i++) {
    prefix = i === 0 ? parts[i] : `${prefix}/${parts[i]}`
    const el = document.querySelector(`.fe-item[data-path="${CSS.escape(prefix)}"]`) as HTMLElement | null
    if (el && !el.classList.contains('open')) {
      // Trigger a click on folder row to expand (if our toggle relies on click)
      el.click()
    }
  }
  const target = document.querySelector(`.fe-item[data-path="${CSS.escape(relativePath)}"]`) as HTMLElement | null
  target?.scrollIntoView({ block: 'center' })
}

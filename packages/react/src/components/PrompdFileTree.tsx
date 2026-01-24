import { ChevronRight, ChevronDown, File, Folder } from 'lucide-react'

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
}

interface FileTreeNodeProps {
  node: FileNode
  level: number
  expandedFolders: Set<string>
  selectedFiles: string[]
  onToggleFolder: (node: FileNode) => void
  onToggleFile: (path: string) => void
}

function FileTreeNode({
  node,
  level,
  expandedFolders,
  selectedFiles,
  onToggleFolder,
  onToggleFile
}: FileTreeNodeProps) {
  const isExpanded = expandedFolders.has(node.path)
  const isSelected = selectedFiles.includes(node.path)

  if (node.type === 'directory') {
    return (
      <div>
        <button
          onClick={() => onToggleFolder(node)}
          className="w-full flex items-center gap-2 px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-left transition-colors"
          style={{ paddingLeft: `${level * 12 + 8}px` }}
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
          )}
          <Folder className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <span className="text-sm text-slate-700 dark:text-slate-300 truncate">
            {node.name}
          </span>
        </button>

        {isExpanded && node.children && (
          <div>
            {node.children.map(child => (
              <FileTreeNode
                key={child.path}
                node={child}
                level={level + 1}
                expandedFolders={expandedFolders}
                selectedFiles={selectedFiles}
                onToggleFolder={onToggleFolder}
                onToggleFile={onToggleFile}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={() => onToggleFile(node.path)}
      className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left transition-colors ${
        isSelected
          ? 'bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
          : 'hover:bg-slate-100 dark:hover:bg-slate-800'
      }`}
      style={{ paddingLeft: `${level * 12 + 28}px` }}
    >
      <File className="w-4 h-4 text-slate-400 flex-shrink-0" />
      <span className="text-sm text-slate-700 dark:text-slate-300 truncate">
        {node.name}
      </span>
    </button>
  )
}

interface FileTreeViewProps {
  nodes: FileNode[]
  expandedFolders: Set<string>
  selectedFiles: string[]
  onToggleFolder: (node: FileNode) => void
  onToggleFile: (path: string) => void
}

export function FileTreeView({
  nodes,
  expandedFolders,
  selectedFiles,
  onToggleFolder,
  onToggleFile
}: FileTreeViewProps) {
  return (
    <div className="space-y-0.5">
      {nodes.map(node => (
        <FileTreeNode
          key={node.path}
          node={node}
          level={0}
          expandedFolders={expandedFolders}
          selectedFiles={selectedFiles}
          onToggleFolder={onToggleFolder}
          onToggleFile={onToggleFile}
        />
      ))}
    </div>
  )
}

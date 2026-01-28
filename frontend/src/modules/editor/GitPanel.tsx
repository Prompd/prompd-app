import { useState, useEffect, useCallback } from 'react'
import {
  GitBranch,
  GitCommit,
  Check,
  Plus,
  Minus,
  RotateCcw,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  FileText,
  AlertCircle,
  Clock,
  Loader2
} from 'lucide-react'
import { SidebarPanelHeader } from '../components/SidebarPanelHeader'
import { useConfirmDialog } from '../components/ConfirmDialog'

interface GitFileStatus {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'untracked' | 'staged'
  staged: boolean
}

interface GitCommitInfo {
  hash: string
  message: string
  author: string
  date: string
}

interface Props {
  theme?: 'light' | 'dark'
  workspaceDir?: FileSystemDirectoryHandle | null
  workspacePath?: string | null
  onOpenFile?: (path: string) => void
  onWorkspacePathSet?: (path: string) => void
  onCollapse?: () => void  // Collapse panel callback
}

export default function GitPanel({ theme = 'dark', workspaceDir, workspacePath, onOpenFile, onWorkspacePathSet, onCollapse }: Props) {
  const hasWorkspace = !!workspaceDir

  // Use custom confirm dialog instead of native confirm()
  const { showConfirm, ConfirmDialogComponent } = useConfirmDialog(theme)

  // Derive effective workspace path: use prop if available, otherwise try to extract from Electron pseudo-handle
  const effectiveWorkspacePath = workspacePath || (workspaceDir as any)?._electronPath || null

  // Git root path (may be different from workspacePath if .git is in parent)
  const [gitRoot, setGitRoot] = useState<string | null>(null)
  // Relative path from git root to workspace (for prefixing file paths)
  const [workspacePrefix, setWorkspacePrefix] = useState<string>('')

  // Helper to run git commands with the git root path
  const git = useCallback(async (args: string[]) => {
    return runGitCommand(args, gitRoot || effectiveWorkspacePath || undefined)
  }, [gitRoot, effectiveWorkspacePath])

  const [branch, setBranch] = useState<string>('')
  const [stagedFiles, setStagedFiles] = useState<GitFileStatus[]>([])
  const [changedFiles, setChangedFiles] = useState<GitFileStatus[]>([])
  const [commitMessage, setCommitMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recentCommits, setRecentCommits] = useState<GitCommitInfo[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [isGitRepo, setIsGitRepo] = useState(false)

  // Find git root when workspace path changes
  useEffect(() => {
    const findRoot = async () => {
      if (!effectiveWorkspacePath) {
        setGitRoot(null)
        setWorkspacePrefix('')
        return
      }

      if ((window as any).electronAPI?.findGitRoot) {
        const result = await (window as any).electronAPI.findGitRoot(effectiveWorkspacePath)
        if (result.success && result.path) {
          setGitRoot(result.path)
          // Calculate relative path from git root to workspace
          if (result.path !== effectiveWorkspacePath) {
            // Normalize paths and calculate prefix
            const normalizedRoot = result.path.replace(/\\/g, '/')
            const normalizedWorkspace = effectiveWorkspacePath.replace(/\\/g, '/')
            if (normalizedWorkspace.startsWith(normalizedRoot)) {
              const prefix = normalizedWorkspace.slice(normalizedRoot.length + 1)
              setWorkspacePrefix(prefix)
            }
          } else {
            setWorkspacePrefix('')
          }
        } else {
          setGitRoot(null)
          setWorkspacePrefix('')
        }
      }
    }
    findRoot()
  }, [effectiveWorkspacePath])

  // Check git status - optimized to minimize git calls
  // Optional overridePath allows refreshing with a new path before props update
  const refreshStatus = useCallback(async (includeHistory = false, overridePath?: string) => {
    if (!hasWorkspace && !overridePath) return

    setLoading(true)
    setError(null)

    // Use override path if provided, otherwise use the git helper
    const runGit = async (args: string[]) => {
      if (overridePath) {
        return runGitCommand(args, overridePath)
      }
      return git(args)
    }

    try {
      // Use git status -sb to get branch AND status in one call
      const statusResult = await runGit(['status', '-sb', '--porcelain'])
      if (!statusResult.success) {
        setIsGitRepo(false)
        setError('Not a git repository')
        return
      }

      setIsGitRepo(true)
      const lines = statusResult.output.split('\n').filter(l => l.trim())

      // First line contains branch info: ## branch...tracking
      if (lines[0]?.startsWith('##')) {
        const branchLine = lines[0].substring(3)
        const branchName = branchLine.split('...')[0].trim()
        setBranch(branchName || 'HEAD')
        lines.shift() // Remove branch line
      }

      // Parse file status
      const staged: GitFileStatus[] = []
      const changed: GitFileStatus[] = []

      for (const line of lines) {
        // Only show .prmd and .pdflow files
        if (!line.includes('.prmd') && !line.includes('.pdflow')) continue

        const indexStatus = line[0]
        const workTreeStatus = line[1]
        let filePath = line.substring(3).trim()

        // If we have a workspace prefix (git root is parent), filter files
        // Only show files within our workspace subdirectory
        if (workspacePrefix) {
          if (!filePath.startsWith(workspacePrefix + '/') && filePath !== workspacePrefix) {
            continue // File is outside our workspace
          }
          // Remove prefix for display (show relative to workspace)
          filePath = filePath.slice(workspacePrefix.length + 1)
        }

        if (indexStatus !== ' ' && indexStatus !== '?') {
          staged.push({
            path: filePath,
            status: getStatusType(indexStatus),
            staged: true
          })
        }

        if (workTreeStatus !== ' ') {
          changed.push({
            path: filePath,
            status: workTreeStatus === '?' ? 'untracked' : getStatusType(workTreeStatus),
            staged: false
          })
        }
      }

      setStagedFiles(staged)
      setChangedFiles(changed)

      // Only fetch commit history when explicitly requested (lazy load)
      if (includeHistory || showHistory) {
        const logResult = await runGit([
          'log',
          '--oneline',
          '-n', '5',
          '--format=%h|%s|%an|%ar'
        ])
        if (logResult.success && logResult.output.trim()) {
          const commits = logResult.output.trim().split('\n').map(line => {
            const [hash, message, author, date] = line.split('|')
            return { hash, message, author, date }
          })
          setRecentCommits(commits)
        }
      }
    } catch (err) {
      setError('Failed to get git status')
    } finally {
      setLoading(false)
    }
  }, [hasWorkspace, git, showHistory, workspacePrefix])

  // Track if panel is visible (lazy load optimization)
  const [hasBeenVisible, setHasBeenVisible] = useState(false)

  // Only load git status when panel becomes visible for the first time
  // This prevents unnecessary git commands on app startup
  useEffect(() => {
    if (hasWorkspace && effectiveWorkspacePath && !hasBeenVisible) {
      setHasBeenVisible(true)
      refreshStatus()
    }
  }, [hasWorkspace, effectiveWorkspacePath, hasBeenVisible, refreshStatus])

  // Refresh status when git root is found/changed
  useEffect(() => {
    if (gitRoot && hasBeenVisible) {
      refreshStatus()
    }
  }, [gitRoot])

  // Get full git path (prepend workspace prefix if needed)
  const getGitPath = useCallback((relativePath: string) => {
    if (workspacePrefix) {
      return `${workspacePrefix}/${relativePath}`
    }
    return relativePath
  }, [workspacePrefix])

  // Stage a file
  const stageFile = async (path: string) => {
    const gitPath = getGitPath(path)
    const result = await git(['add', gitPath])
    if (result.success) {
      await refreshStatus()
    } else {
      setError(`Failed to stage ${path}: ${result.output}`)
    }
  }

  // Unstage a file
  const unstageFile = async (path: string) => {
    const gitPath = getGitPath(path)
    const result = await git(['restore', '--staged', gitPath])
    if (result.success) {
      await refreshStatus()
    } else {
      setError(`Failed to unstage ${path}`)
    }
  }

  // Discard changes
  const discardChanges = async (path: string) => {
    const confirmed = await showConfirm({
      title: 'Discard Changes',
      message: `Discard changes to ${path}? This cannot be undone.`,
      confirmLabel: 'Discard',
      cancelLabel: 'Cancel',
      confirmVariant: 'danger'
    })
    if (!confirmed) return

    const gitPath = getGitPath(path)
    const result = await git(['restore', gitPath])
    if (result.success) {
      await refreshStatus()
    } else {
      setError(`Failed to discard changes to ${path}`)
    }
  }

  // Stage all
  const stageAll = async () => {
    for (const file of changedFiles) {
      const gitPath = getGitPath(file.path)
      await git(['add', gitPath])
    }
    await refreshStatus()
  }

  // Commit
  const commit = async () => {
    if (!commitMessage.trim()) {
      setError('Please enter a commit message')
      return
    }

    if (stagedFiles.length === 0) {
      setError('No staged changes to commit')
      return
    }

    const result = await git(['commit', '-m', commitMessage.trim()])
    if (result.success) {
      setCommitMessage('')
      await refreshStatus()
    } else {
      setError('Failed to commit: ' + result.output)
    }
  }

  // Check if git is available (Electron mode only)
  const gitAvailable = typeof window !== 'undefined' && !!(window as any).electronAPI?.runGitCommand

  // Git not available in web mode
  if (!gitAvailable) {
    return (
      <div className="git-panel" style={{ padding: '20px', textAlign: 'center' }}>
        <GitBranch size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Git features require the desktop app
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '8px' }}>
          Download Prompd for full Git integration
        </p>
      </div>
    )
  }

  // No workspace open
  if (!hasWorkspace) {
    return (
      <div className="git-panel" style={{ padding: '20px', textAlign: 'center' }}>
        <GitBranch size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Open a folder to use Git features
        </p>
      </div>
    )
  }

  // Workspace open but no path (need to select via Electron dialog)
  if (hasWorkspace && !effectiveWorkspacePath && gitAvailable) {
    return (
      <div className="git-panel" style={{ padding: '20px', textAlign: 'center' }}>
        <GitBranch size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '16px' }}>
          Select the workspace folder for Git operations
        </p>
        <button
          onClick={async () => {
            try {
              const path = await (window as any).electronAPI.openFolder()
              if (path) {
                await (window as any).electronAPI.setWorkspacePath(path)
                // Update React state
                onWorkspacePathSet?.(path)
                // Trigger refresh immediately with the new path
                // Pass path directly since props haven't updated yet
                setHasBeenVisible(true)
                await refreshStatus(false, path)
              }
            } catch (err) {
              setError('Failed to select folder')
            }
          }}
          style={{
            padding: '8px 16px',
            background: 'var(--accent)',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px'
          }}
        >
          Select Workspace Folder
        </button>
      </div>
    )
  }

  // Not a git repo
  if (!isGitRepo && !loading) {
    return (
      <div className="git-panel" style={{ padding: '20px', textAlign: 'center' }}>
        <AlertCircle size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '16px' }}>
          This folder is not a Git repository
        </p>
        <button
          onClick={async () => {
            const result = await git(['init'])
            if (result.success) {
              await refreshStatus()
            } else {
              setError('Failed to initialize repository: ' + result.output)
            }
          }}
          style={{
            padding: '8px 16px',
            background: 'var(--accent)',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px'
          }}
        >
          Initialize Repository
        </button>
      </div>
    )
  }

  return (
    <div className="git-panel" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <SidebarPanelHeader title="Source Control" onCollapse={onCollapse}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <GitBranch size={14} />
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{branch || '...'}</span>
        </div>
        <button
          onClick={() => refreshStatus()}
          disabled={loading}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            color: 'var(--text-muted)'
          }}
          title="Refresh"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </SidebarPanelHeader>

      {/* Error message */}
      {error && (
        <div style={{
          padding: '8px 16px',
          background: 'var(--error-bg, rgba(239, 68, 68, 0.1))',
          color: 'var(--error, #ef4444)',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <AlertCircle size={14} />
          {error}
          <button
            onClick={() => setError(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.7 }}
          >
            x
          </button>
        </div>
      )}

      {/* Commit message input */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <textarea
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder="Commit message..."
          rows={2}
          style={{
            width: '100%',
            padding: '8px',
            fontSize: '12px',
            background: 'var(--input-bg)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            resize: 'vertical',
            color: 'var(--text)',
            fontFamily: 'inherit'
          }}
        />
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          <button
            onClick={commit}
            disabled={!commitMessage.trim() || stagedFiles.length === 0}
            style={{
              flex: 1,
              padding: '6px 12px',
              background: commitMessage.trim() && stagedFiles.length > 0 ? 'var(--accent)' : 'var(--button-disabled)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: commitMessage.trim() && stagedFiles.length > 0 ? 'pointer' : 'not-allowed',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <GitCommit size={14} />
            Commit ({stagedFiles.length})
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* Staged Changes */}
        <div style={{ borderBottom: '1px solid var(--border)' }}>
          <div
            style={{
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              letterSpacing: '0.5px'
            }}
          >
            <span>Staged Changes ({stagedFiles.length})</span>
          </div>
          {stagedFiles.length === 0 ? (
            <div style={{ padding: '8px 16px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No staged changes
            </div>
          ) : (
            stagedFiles.map((file) => (
              <FileRow
                key={file.path}
                file={file}
                onUnstage={() => unstageFile(file.path)}
                onOpenFile={onOpenFile}
              />
            ))
          )}
        </div>

        {/* Changes */}
        <div style={{ borderBottom: '1px solid var(--border)' }}>
          <div
            style={{
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              letterSpacing: '0.5px'
            }}
          >
            <span>Changes ({changedFiles.length})</span>
            {changedFiles.length > 0 && (
              <button
                onClick={stageAll}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '10px',
                  color: 'var(--accent)',
                  textTransform: 'none'
                }}
              >
                Stage All
              </button>
            )}
          </div>
          {changedFiles.length === 0 ? (
            <div style={{ padding: '8px 16px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No changes
            </div>
          ) : (
            changedFiles.map((file) => (
              <FileRow
                key={file.path}
                file={file}
                onStage={() => stageFile(file.path)}
                onDiscard={() => discardChanges(file.path)}
                onOpenFile={onOpenFile}
              />
            ))
          )}
        </div>

        {/* Recent Commits */}
        <div>
          <button
            onClick={async () => {
              const newShow = !showHistory
              setShowHistory(newShow)
              // Lazy load commits when first expanded
              if (newShow && recentCommits.length === 0) {
                await refreshStatus(true)
              }
            }}
            style={{
              width: '100%',
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              letterSpacing: '0.5px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left'
            }}
          >
            {showHistory ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Recent Commits
          </button>
          {showHistory && (
            <div style={{ padding: '0 8px 8px' }}>
              {recentCommits.length === 0 ? (
                <div style={{ padding: '8px', fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  No commits yet
                </div>
              ) : (
                recentCommits.map((commit) => (
                  <div
                    key={commit.hash}
                    style={{
                      padding: '6px 8px',
                      fontSize: '11px',
                      borderRadius: '4px',
                      marginBottom: '4px',
                      background: 'var(--item-bg)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                      <code style={{ color: 'var(--accent)', fontSize: '10px' }}>{commit.hash}</code>
                      <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{commit.date}</span>
                    </div>
                    <div style={{ color: 'var(--text)', lineHeight: 1.3 }}>{commit.message}</div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
      {/* Confirm Dialog */}
      <ConfirmDialogComponent />
    </div>
  )
}

// File row component
function FileRow({
  file,
  onStage,
  onUnstage,
  onDiscard,
  onOpenFile
}: {
  file: GitFileStatus
  onStage?: () => void
  onUnstage?: () => void
  onDiscard?: () => void
  onOpenFile?: (path: string) => void
}) {
  const statusColors: Record<string, string> = {
    modified: '#f59e0b',
    added: '#22c55e',
    deleted: '#ef4444',
    untracked: '#8b5cf6',
    staged: '#3b82f6'
  }

  const statusIcons: Record<string, string> = {
    modified: 'M',
    added: 'A',
    deleted: 'D',
    untracked: 'U',
    staged: 'S'
  }

  return (
    <div
      style={{
        padding: '4px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '12px',
        cursor: 'pointer'
      }}
      onClick={() => onOpenFile?.(file.path)}
      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--item-hover)'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
    >
      <FileText size={14} style={{ opacity: 0.6 }} />
      <span
        style={{
          width: '16px',
          height: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '10px',
          fontWeight: 600,
          color: statusColors[file.status],
          flexShrink: 0
        }}
      >
        {statusIcons[file.status]}
      </span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {file.path}
      </span>
      <div style={{ display: 'flex', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
        {onStage && (
          <button
            onClick={onStage}
            title="Stage"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '2px',
              borderRadius: '2px',
              display: 'flex'
            }}
          >
            <Plus size={14} style={{ color: '#22c55e' }} />
          </button>
        )}
        {onUnstage && (
          <button
            onClick={onUnstage}
            title="Unstage"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '2px',
              borderRadius: '2px',
              display: 'flex'
            }}
          >
            <Minus size={14} style={{ color: '#f59e0b' }} />
          </button>
        )}
        {onDiscard && file.status !== 'untracked' && (
          <button
            onClick={onDiscard}
            title="Discard changes"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '2px',
              borderRadius: '2px',
              display: 'flex'
            }}
          >
            <RotateCcw size={14} style={{ color: '#ef4444' }} />
          </button>
        )}
      </div>
    </div>
  )
}

// Helper to get status type
function getStatusType(char: string): GitFileStatus['status'] {
  switch (char) {
    case 'M': return 'modified'
    case 'A': return 'added'
    case 'D': return 'deleted'
    case '?': return 'untracked'
    default: return 'modified'
  }
}

// Helper to run git commands (uses Electron IPC)
async function runGitCommand(args: string[], cwd?: string): Promise<{ success: boolean; output: string }> {
  // Check if we're in Electron
  if (typeof window !== 'undefined' && (window as any).electronAPI?.runGitCommand) {
    try {
      const result = await (window as any).electronAPI.runGitCommand(args, cwd)
      return result
    } catch (err) {
      return { success: false, output: String(err) }
    }
  }

  // Fallback: not available in web mode
  console.warn('Git commands are only available in Electron mode')
  return { success: false, output: 'Git commands require the desktop app' }
}

// Check if git is available (Electron mode)
export function isGitAvailable(): boolean {
  return typeof window !== 'undefined' && !!(window as any).electronAPI?.runGitCommand
}

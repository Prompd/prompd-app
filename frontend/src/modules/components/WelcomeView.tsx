/**
 * WelcomeView - Landing screen shown when no file is open
 * Two modes:
 * 1. No project open: Shows recent projects, quick actions, and branding
 * 2. Project open: Shows current project stats, recent files, git info
 */

import { useCallback, useEffect, useState } from 'react'
import { FolderOpen, Plus, Search, GitBranch, Clock, FileText, X, ArrowUp, ArrowDown, FileEdit, File, History, Tag, User, Scale, Package, Newspaper, ExternalLink, Sparkles, Users, AlertTriangle, RefreshCw, Settings } from 'lucide-react'
import logoImage from '/logo.png?url'
import { useUIStore, type RecentProject } from '../../stores/uiStore'
import { useEditorStore, type WorkspaceState } from '../../stores/editorStore'
import RestoreStatePrompt from './RestoreStatePrompt'
import { useConfirmDialog } from './ConfirmDialog'
import { fetchStartupData, filterVisibleNews, dismissNews, type NewsItem, type StartupData } from '../services/startupApi'
import RegistrySearchBar from './RegistrySearchBar'
import type { RegistryPackage } from '../services/registryApi'

/**
 * Recent file entry within a project
 */
interface RecentFile {
  name: string
  path: string
  lastModified: number
}

/**
 * Current project stats for project-open view
 */
interface ProjectStats {
  name: string
  path: string
  description?: string
  version?: string
  author?: string
  license?: string
  keywords?: string[]
  gitBranch?: string
  gitChangesCount?: number
  gitAhead?: number
  gitBehind?: number
  fileCount?: number
  recentFiles: RecentFile[]
}

interface WelcomeViewProps {
  onOpenFolder: () => void
  onNewPrompt: () => void
  onBrowseRegistry: () => void
  onOpenProject: (path: string) => void
  onOpenFile?: (path: string) => void
  /** Called when user accepts restoring previous session state */
  onRestoreState?: (workspaceState: WorkspaceState) => void
  theme: 'light' | 'dark'
  /** Current workspace path if a project is open */
  workspacePath?: string | null
  /** Current workspace name */
  workspaceName?: string
  /** Called when user selects a package from the search bar */
  onOpenPackageDetails?: (pkg: RegistryPackage) => void
}

/**
 * Tab type for the welcome view tabbed interface
 */
type WelcomeTab = 'projects' | 'news'

/**
 * Format relative time (e.g., "2 hours ago", "Yesterday")
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 7) {
    return new Date(timestamp).toLocaleDateString()
  } else if (days > 1) {
    return `${days} days ago`
  } else if (days === 1) {
    return 'Yesterday'
  } else if (hours > 1) {
    return `${hours} hours ago`
  } else if (hours === 1) {
    return '1 hour ago'
  } else if (minutes > 1) {
    return `${minutes} minutes ago`
  } else {
    return 'Just now'
  }
}

/**
 * Get folder name from path
 */
function getFolderName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || path
}

/**
 * ProjectCard - Individual recent project card
 */
function ProjectCard({
  project,
  onOpen,
  onRemove,
  theme
}: {
  project: RecentProject
  onOpen: () => void
  onRemove: () => void
  theme: 'light' | 'dark'
}) {
  const colors = theme === 'dark' ? {
    cardBg: 'rgba(30, 41, 59, 0.5)',
    cardBorder: 'rgba(71, 85, 105, 0.3)',
    cardHoverBg: 'rgba(30, 41, 59, 0.8)',
    cardHoverBorder: 'rgba(99, 102, 241, 0.5)',
    text: '#e2e8f0',
    textMuted: '#94a3b8',
    textDim: '#64748b',
    accentGreen: '#4ade80',
    accentYellow: '#facc15',
    removeHover: 'rgba(239, 68, 68, 0.2)'
  } : {
    cardBg: 'rgba(248, 250, 252, 0.8)',
    cardBorder: 'rgba(226, 232, 240, 0.8)',
    cardHoverBg: '#ffffff',
    cardHoverBorder: 'rgba(99, 102, 241, 0.5)',
    text: '#0f172a',
    textMuted: '#64748b',
    textDim: '#94a3b8',
    accentGreen: '#16a34a',
    accentYellow: '#ca8a04',
    removeHover: 'rgba(239, 68, 68, 0.1)'
  }

  return (
    <div
      onClick={onOpen}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        background: colors.cardBg,
        border: `1px solid ${colors.cardBorder}`,
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        position: 'relative'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = colors.cardHoverBg
        e.currentTarget.style.borderColor = colors.cardHoverBorder
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = colors.cardBg
        e.currentTarget.style.borderColor = colors.cardBorder
      }}
    >
      {/* Folder Icon */}
      <div style={{
        width: '40px',
        height: '40px',
        borderRadius: '8px',
        background: theme === 'dark' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0
      }}>
        <FolderOpen size={20} style={{ color: '#6366f1' }} />
      </div>

      {/* Project Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '14px',
          fontWeight: 600,
          color: colors.text,
          marginBottom: '2px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {project.name || getFolderName(project.path)}
        </div>
        {/* Description */}
        {project.description && (
          <div style={{
            fontSize: '12px',
            color: colors.textMuted,
            marginBottom: '4px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {project.description}
          </div>
        )}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '12px',
          color: colors.textMuted,
          flexWrap: 'wrap'
        }}>
          {/* Git branch */}
          {project.gitBranch && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <GitBranch size={12} />
              {project.gitBranch}
            </span>
          )}
          {/* Git changes count */}
          {project.gitChangesCount !== undefined && project.gitChangesCount > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: colors.accentYellow }}>
              <FileEdit size={12} />
              {project.gitChangesCount} {project.gitChangesCount === 1 ? 'change' : 'changes'}
            </span>
          )}
          {/* Git ahead/behind */}
          {(project.gitAhead !== undefined && project.gitAhead > 0) && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '2px', color: colors.accentGreen }}>
              <ArrowUp size={12} />
              {project.gitAhead}
            </span>
          )}
          {(project.gitBehind !== undefined && project.gitBehind > 0) && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '2px', color: colors.accentYellow }}>
              <ArrowDown size={12} />
              {project.gitBehind}
            </span>
          )}
          {/* File count */}
          {project.fileCount !== undefined && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <FileText size={12} />
              {project.fileCount} {project.fileCount === 1 ? 'prompd' : 'prompds'}
            </span>
          )}
        </div>
      </div>

      {/* Time & Remove */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexShrink: 0
      }}>
        <span style={{
          fontSize: '12px',
          color: colors.textDim,
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <Clock size={12} />
          {formatRelativeTime(project.lastOpened)}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          style={{
            padding: '4px',
            background: 'transparent',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            color: colors.textDim,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = colors.removeHover
            e.currentTarget.style.color = '#ef4444'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = colors.textDim
          }}
          title="Remove from recent"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

/**
 * QuickActionButton - Styled action button
 */
function QuickActionButton({
  icon: Icon,
  label,
  onClick,
  primary = false,
  theme,
  dataHintTarget
}: {
  icon: React.ElementType
  label: string
  onClick: () => void
  primary?: boolean
  theme: 'light' | 'dark'
  dataHintTarget?: string
}) {
  const colors = theme === 'dark' ? {
    bg: primary ? '#6366f1' : 'rgba(30, 41, 59, 0.5)',
    border: primary ? '#6366f1' : 'rgba(71, 85, 105, 0.3)',
    hoverBg: primary ? '#4f46e5' : 'rgba(30, 41, 59, 0.8)',
    hoverBorder: primary ? '#4f46e5' : 'rgba(99, 102, 241, 0.5)',
    text: primary ? '#ffffff' : '#e2e8f0',
    iconColor: primary ? '#ffffff' : '#94a3b8'
  } : {
    bg: primary ? '#6366f1' : 'rgba(248, 250, 252, 0.8)',
    border: primary ? '#6366f1' : 'rgba(226, 232, 240, 0.8)',
    hoverBg: primary ? '#4f46e5' : '#ffffff',
    hoverBorder: primary ? '#4f46e5' : 'rgba(99, 102, 241, 0.5)',
    text: primary ? '#ffffff' : '#0f172a',
    iconColor: primary ? '#ffffff' : '#64748b'
  }

  return (
    <button
      onClick={onClick}
      data-hint-target={dataHintTarget}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 16px',
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: '8px',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: 500,
        color: colors.text,
        transition: 'all 0.15s ease'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = colors.hoverBg
        e.currentTarget.style.borderColor = colors.hoverBorder
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = colors.bg
        e.currentTarget.style.borderColor = colors.border
      }}
    >
      <Icon size={16} style={{ color: colors.iconColor }} />
      {label}
    </button>
  )
}

/**
 * RecentFileCard - Individual recent file card for project-open view
 */
function RecentFileCard({
  file,
  onOpen,
  theme
}: {
  file: RecentFile
  onOpen: () => void
  theme: 'light' | 'dark'
}) {
  const colors = theme === 'dark' ? {
    cardBg: 'rgba(30, 41, 59, 0.5)',
    cardBorder: 'rgba(71, 85, 105, 0.3)',
    cardHoverBg: 'rgba(30, 41, 59, 0.8)',
    cardHoverBorder: 'rgba(99, 102, 241, 0.5)',
    text: '#e2e8f0',
    textMuted: '#94a3b8'
  } : {
    cardBg: 'rgba(248, 250, 252, 0.8)',
    cardBorder: 'rgba(226, 232, 240, 0.8)',
    cardHoverBg: '#ffffff',
    cardHoverBorder: 'rgba(99, 102, 241, 0.5)',
    text: '#0f172a',
    textMuted: '#64748b'
  }

  return (
    <div
      onClick={onOpen}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 14px',
        background: colors.cardBg,
        border: `1px solid ${colors.cardBorder}`,
        borderRadius: '6px',
        cursor: 'pointer',
        transition: 'all 0.15s ease'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = colors.cardHoverBg
        e.currentTarget.style.borderColor = colors.cardHoverBorder
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = colors.cardBg
        e.currentTarget.style.borderColor = colors.cardBorder
      }}
    >
      <File size={16} style={{ color: '#6366f1', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '13px',
          fontWeight: 500,
          color: colors.text,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {file.name}
        </div>
        <div style={{
          fontSize: '11px',
          color: colors.textMuted,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {file.path}
        </div>
      </div>
      <span style={{ fontSize: '11px', color: colors.textMuted, flexShrink: 0 }}>
        {formatRelativeTime(file.lastModified)}
      </span>
    </div>
  )
}

/**
 * Icon map for dynamic Lucide icons from news items
 */
const iconMap: Record<string, React.ElementType> = {
  Sparkles,
  Package,
  Users,
  AlertTriangle,
  RefreshCw,
  Settings,
  Newspaper,
  ExternalLink
}

/**
 * NewsCard - Individual news item card
 */
function NewsCard({
  item,
  theme,
  onAction,
  onDismiss
}: {
  item: NewsItem
  theme: 'light' | 'dark'
  onAction?: (item: NewsItem) => void
  onDismiss?: (newsId: string) => void
}) {
  const colors = theme === 'dark' ? {
    cardBg: 'rgba(30, 41, 59, 0.5)',
    cardBorder: 'rgba(71, 85, 105, 0.3)',
    cardHoverBg: 'rgba(30, 41, 59, 0.8)',
    cardHoverBorder: 'rgba(99, 102, 241, 0.5)',
    text: '#e2e8f0',
    textMuted: '#94a3b8',
    textDim: '#64748b',
    buttonBg: 'rgba(99, 102, 241, 0.15)',
    buttonHoverBg: 'rgba(99, 102, 241, 0.25)'
  } : {
    cardBg: 'rgba(248, 250, 252, 0.8)',
    cardBorder: 'rgba(226, 232, 240, 0.8)',
    cardHoverBg: '#ffffff',
    cardHoverBorder: 'rgba(99, 102, 241, 0.5)',
    text: '#0f172a',
    textMuted: '#64748b',
    textDim: '#94a3b8',
    buttonBg: 'rgba(99, 102, 241, 0.1)',
    buttonHoverBg: 'rgba(99, 102, 241, 0.2)'
  }

  const typeColors: Record<NewsItem['type'], string> = {
    announcement: '#6366f1',
    release: '#10b981',
    tip: '#f59e0b',
    community: '#8b5cf6',
    warning: '#ef4444'
  }

  const typeLabels: Record<NewsItem['type'], string> = {
    announcement: 'Announcement',
    release: 'Release',
    tip: 'Tip',
    community: 'Community',
    warning: 'Warning'
  }

  const IconComponent = item.icon ? iconMap[item.icon] : null
  const hasAction = item.action && item.action.type !== 'dismiss'

  const handleActionClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (item.action?.type === 'dismiss') {
      onDismiss?.(item.id)
    } else if (onAction) {
      onAction(item)
    }
  }

  const handleDismissClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDismiss?.(item.id)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '14px 16px',
        background: colors.cardBg,
        border: `1px solid ${colors.cardBorder}`,
        borderRadius: '8px',
        transition: 'all 0.15s ease'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {IconComponent && (
          <IconComponent size={14} style={{ color: typeColors[item.type] }} />
        )}
        <span style={{
          fontSize: '10px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: typeColors[item.type],
          background: `${typeColors[item.type]}15`,
          padding: '2px 6px',
          borderRadius: '4px'
        }}>
          {typeLabels[item.type]}
        </span>
        <span style={{ fontSize: '11px', color: colors.textDim }}>
          {item.date}
        </span>
        {(item.dismissible !== false) && (
          <button
            onClick={handleDismissClick}
            style={{
              marginLeft: 'auto',
              padding: '2px',
              background: 'transparent',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              color: colors.textDim,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Dismiss"
          >
            <X size={12} />
          </button>
        )}
      </div>
      <div style={{
        fontSize: '14px',
        fontWeight: 600,
        color: colors.text
      }}>
        {item.title}
      </div>
      <div style={{
        fontSize: '13px',
        color: colors.textMuted,
        lineHeight: '1.4'
      }}>
        {item.description}
      </div>
      {hasAction && item.action && (
        <button
          onClick={handleActionClick}
          style={{
            alignSelf: 'flex-start',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '4px',
            padding: '6px 12px',
            background: colors.buttonBg,
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 500,
            color: '#6366f1',
            transition: 'background 0.15s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = colors.buttonHoverBg
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = colors.buttonBg
          }}
        >
          {item.action.label}
          {item.action.type === 'link' && <ExternalLink size={12} />}
        </button>
      )}
    </div>
  )
}

/**
 * TabButton - Styled tab button for the welcome view
 */
function TabButton({
  active,
  label,
  icon: Icon,
  onClick,
  theme
}: {
  active: boolean
  label: string
  icon: React.ElementType
  onClick: () => void
  theme: 'light' | 'dark'
}) {
  const colors = theme === 'dark' ? {
    activeBg: 'rgba(99, 102, 241, 0.15)',
    activeBorder: '#6366f1',
    activeText: '#a5b4fc',
    inactiveBg: 'transparent',
    inactiveBorder: 'transparent',
    inactiveText: '#64748b',
    hoverBg: 'rgba(71, 85, 105, 0.3)'
  } : {
    activeBg: 'rgba(99, 102, 241, 0.1)',
    activeBorder: '#6366f1',
    activeText: '#4f46e5',
    inactiveBg: 'transparent',
    inactiveBorder: 'transparent',
    inactiveText: '#94a3b8',
    hoverBg: 'rgba(226, 232, 240, 0.8)'
  }

  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: '12px 16px',
        background: active ? colors.activeBg : colors.inactiveBg,
        border: 'none',
        borderBottom: `2px solid ${active ? colors.activeBorder : colors.inactiveBorder}`,
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: active ? 600 : 500,
        color: active ? colors.activeText : colors.inactiveText,
        transition: 'all 0.15s ease'
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = colors.hoverBg
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = colors.inactiveBg
        }
      }}
    >
      <Icon size={18} />
      {label}
    </button>
  )
}

/**
 * ProjectOpenView - Shown when a project is open but no file is selected
 */
function ProjectOpenView({
  stats,
  onNewPrompt,
  onBrowseRegistry,
  onOpenFile,
  onRestoreState,
  workspaceState,
  onDismissRestore,
  theme
}: {
  stats: ProjectStats
  onNewPrompt: () => void
  onBrowseRegistry: () => void
  onOpenFile?: (path: string) => void
  onRestoreState?: (workspaceState: WorkspaceState) => void
  workspaceState?: WorkspaceState | null
  onDismissRestore?: () => void
  theme: 'light' | 'dark'
}) {
  const colors = theme === 'dark' ? {
    bg: '#0f172a',
    text: '#e2e8f0',
    textMuted: '#94a3b8',
    textDim: '#64748b',
    divider: 'rgba(71, 85, 105, 0.3)',
    accentGreen: '#4ade80',
    accentYellow: '#facc15',
    statBg: 'rgba(30, 41, 59, 0.5)',
    statBorder: 'rgba(71, 85, 105, 0.3)'
  } : {
    bg: '#f8fafc',
    text: '#0f172a',
    textMuted: '#64748b',
    textDim: '#94a3b8',
    divider: 'rgba(226, 232, 240, 0.8)',
    accentGreen: '#16a34a',
    accentYellow: '#ca8a04',
    statBg: 'rgba(248, 250, 252, 0.8)',
    statBorder: 'rgba(226, 232, 240, 0.8)'
  }

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '40px',
      background: colors.bg,
      overflow: 'auto'
    }}>
      <div style={{ maxWidth: '560px', width: '100%', margin: 'auto 0' }}>
        {/* Project Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            marginBottom: '8px'
          }}>
            <FolderOpen size={28} style={{ color: '#6366f1' }} />
            <h1 style={{
              fontSize: '24px',
              fontWeight: 700,
              color: colors.text,
              margin: 0
            }}>
              {stats.name}
            </h1>
          </div>
          {stats.description && (
            <p style={{
              fontSize: '14px',
              color: colors.textMuted,
              margin: '8px 0 0 0',
              lineHeight: '1.5'
            }}>
              {stats.description.length > 300
                ? `${stats.description.substring(0, 300)}...`
                : stats.description
              }
            </p>
          )}
        </div>

        {/* Restore Previous Session Prompt */}
        {workspaceState && workspaceState.openFiles.length > 0 && onRestoreState && (
          <RestoreStatePrompt
            workspaceState={workspaceState}
            onAccept={() => onRestoreState(workspaceState)}
            onDecline={() => onDismissRestore?.()}
            onOpenFile={onOpenFile}
            theme={theme}
          />
        )}

        {/* Project Stats Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: '12px',
          marginBottom: '32px'
        }}>
          {/* File Count */}
          <div style={{
            padding: '16px',
            background: colors.statBg,
            border: `1px solid ${colors.statBorder}`,
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <FileText size={20} style={{ color: '#6366f1', marginBottom: '8px' }} />
            <div style={{ fontSize: '20px', fontWeight: 700, color: colors.text }}>
              {stats.fileCount ?? 0}
            </div>
            <div style={{ fontSize: '12px', color: colors.textMuted }}>
              {(stats.fileCount ?? 0) === 1 ? 'Prompt' : 'Prompts'}
            </div>
          </div>

          {/* Version */}
          {stats.version && (
            <div style={{
              padding: '16px',
              background: colors.statBg,
              border: `1px solid ${colors.statBorder}`,
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <Tag size={20} style={{ color: '#8b5cf6', marginBottom: '8px' }} />
              <div style={{
                fontSize: '14px',
                fontWeight: 600,
                color: colors.text
              }}>
                v{stats.version}
              </div>
              <div style={{ fontSize: '12px', color: colors.textMuted }}>
                Version
              </div>
            </div>
          )}

          {/* Author */}
          {stats.author && (
            <div style={{
              padding: '16px',
              background: colors.statBg,
              border: `1px solid ${colors.statBorder}`,
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <User size={20} style={{ color: '#06b6d4', marginBottom: '8px' }} />
              <div style={{
                fontSize: '13px',
                fontWeight: 500,
                color: colors.text,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {stats.author}
              </div>
              <div style={{ fontSize: '12px', color: colors.textMuted }}>
                Author
              </div>
            </div>
          )}

          {/* License */}
          {stats.license && (
            <div style={{
              padding: '16px',
              background: colors.statBg,
              border: `1px solid ${colors.statBorder}`,
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <Scale size={20} style={{ color: '#10b981', marginBottom: '8px' }} />
              <div style={{
                fontSize: '13px',
                fontWeight: 500,
                color: colors.text
              }}>
                {stats.license}
              </div>
              <div style={{ fontSize: '12px', color: colors.textMuted }}>
                License
              </div>
            </div>
          )}

          {/* Git Branch */}
          {stats.gitBranch && (
            <div style={{
              padding: '16px',
              background: colors.statBg,
              border: `1px solid ${colors.statBorder}`,
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <GitBranch size={20} style={{ color: '#6366f1', marginBottom: '8px' }} />
              <div style={{
                fontSize: '14px',
                fontWeight: 600,
                color: colors.text,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {stats.gitBranch}
              </div>
              <div style={{ fontSize: '12px', color: colors.textMuted }}>
                Branch
              </div>
            </div>
          )}

          {/* Git Changes */}
          {stats.gitChangesCount !== undefined && stats.gitChangesCount > 0 && (
            <div style={{
              padding: '16px',
              background: colors.statBg,
              border: `1px solid ${colors.statBorder}`,
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <FileEdit size={20} style={{ color: colors.accentYellow, marginBottom: '8px' }} />
              <div style={{ fontSize: '20px', fontWeight: 700, color: colors.accentYellow }}>
                {stats.gitChangesCount}
              </div>
              <div style={{ fontSize: '12px', color: colors.textMuted }}>
                {stats.gitChangesCount === 1 ? 'Change' : 'Changes'}
              </div>
            </div>
          )}

          {/* Git Ahead/Behind */}
          {((stats.gitAhead ?? 0) > 0 || (stats.gitBehind ?? 0) > 0) && (
            <div style={{
              padding: '16px',
              background: colors.statBg,
              border: `1px solid ${colors.statBorder}`,
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginBottom: '8px' }}>
                {(stats.gitAhead ?? 0) > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: colors.accentGreen }}>
                    <ArrowUp size={16} />
                    <span style={{ fontWeight: 600 }}>{stats.gitAhead}</span>
                  </div>
                )}
                {(stats.gitBehind ?? 0) > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: colors.accentYellow }}>
                    <ArrowDown size={16} />
                    <span style={{ fontWeight: 600 }}>{stats.gitBehind}</span>
                  </div>
                )}
              </div>
              <div style={{ fontSize: '12px', color: colors.textMuted }}>
                Sync Status
              </div>
            </div>
          )}
        </div>

        {/* Recent Files */}
        {stats.recentFiles.length > 0 && (
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{
              fontSize: '13px',
              fontWeight: 600,
              color: colors.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <History size={14} />
              Recent Files
            </h2>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              {stats.recentFiles.slice(0, 5).map(file => (
                <RecentFileCard
                  key={file.path}
                  file={file}
                  onOpen={() => onOpenFile?.(file.path)}
                  theme={theme}
                />
              ))}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          justifyContent: 'center'
        }}>
          <QuickActionButton
            icon={Plus}
            label="New Prompd"
            onClick={onNewPrompt}
            primary
            theme={theme}
            dataHintTarget="new-prompd-button"
          />
          <QuickActionButton
            icon={Search}
            label="Browse Registry"
            onClick={onBrowseRegistry}
            theme={theme}
          />
        </div>

        {/* Keyboard hints */}
        <div style={{
          marginTop: '32px',
          textAlign: 'center',
          fontSize: '12px',
          color: colors.textDim
        }}>
          <span style={{
            padding: '2px 6px',
            background: theme === 'dark' ? 'rgba(71, 85, 105, 0.3)' : 'rgba(226, 232, 240, 0.8)',
            borderRadius: '4px',
            fontFamily: 'ui-monospace, monospace',
            marginRight: '4px'
          }}>
            Ctrl+N
          </span>
          to create new
          <span style={{ margin: '0 12px', color: colors.divider }}>|</span>
          <span style={{
            padding: '2px 6px',
            background: theme === 'dark' ? 'rgba(71, 85, 105, 0.3)' : 'rgba(226, 232, 240, 0.8)',
            borderRadius: '4px',
            fontFamily: 'ui-monospace, monospace',
            marginRight: '4px'
          }}>
            Ctrl+P
          </span>
          to find files
        </div>
      </div>
    </div>
  )
}

/**
 * Main WelcomeView component
 */
export default function WelcomeView({
  onOpenFolder,
  onNewPrompt,
  onBrowseRegistry,
  onOpenProject,
  onOpenFile,
  onRestoreState,
  theme,
  workspacePath,
  workspaceName,
  onOpenPackageDetails
}: WelcomeViewProps) {
  const allRecentProjects = useUIStore(state => state.recentProjects)
  const removeRecentProject = useUIStore(state => state.removeRecentProject)
  const updateRecentProject = useUIStore(state => state.updateRecentProject)

  // Show all recent projects (desktop app is single-user)
  const recentProjects = allRecentProjects

  // Get workspace state for restore prompt
  const getWorkspaceState = useEditorStore(state => state.getWorkspaceState)
  const clearWorkspaceState = useEditorStore(state => state.clearWorkspaceState)

  // State for project-open view
  const [projectStats, setProjectStats] = useState<ProjectStats | null>(null)

  // Track if restore prompt was dismissed for current workspace
  const [restoreDismissed, setRestoreDismissed] = useState(false)

  // Active tab for no-project view
  const [activeTab, setActiveTab] = useState<WelcomeTab>('projects')

  // Confirm dialog for missing project/file prompts
  const { showConfirm, ConfirmDialogComponent } = useConfirmDialog(theme)

  // Startup data from API
  const [startupData, setStartupData] = useState<StartupData | null>(null)
  const [isLoadingNews, setIsLoadingNews] = useState(true)
  const [newsRefreshKey, setNewsRefreshKey] = useState(0)

  // Fetch startup data on mount
  useEffect(() => {
    fetchStartupData()
      .then(setStartupData)
      .catch(err => console.error('[WelcomeView] Failed to fetch startup data:', err))
      .finally(() => setIsLoadingNews(false))
  }, [])

  // Filter visible news (not dismissed, not expired)
  const newsItems = startupData?.news ? filterVisibleNews(startupData.news) : []

  // Handle news dismiss
  const handleDismissNews = useCallback((newsId: string) => {
    dismissNews(newsId)
    // Trigger re-filter by updating refresh key
    setNewsRefreshKey(prev => prev + 1)
  }, [])

  // Handle news action
  const handleNewsAction = useCallback((item: NewsItem) => {
    if (!item.action) return

    const { type, target, config } = item.action

    switch (type) {
      case 'link':
        if (target) {
          window.open(target, '_blank', 'noopener,noreferrer')
        }
        break
      case 'settings':
        // Open settings modal - dispatch event that App.tsx listens for
        window.dispatchEvent(new CustomEvent('prompd:openSettings', {
          detail: { tab: target, config }
        }))
        break
      case 'registry':
        // Open registry browser
        onBrowseRegistry()
        break
      case 'update':
        // Trigger update check (if implemented)
        console.log('[WelcomeView] Update check triggered')
        break
      default:
        // Unknown action type - graceful degradation
        // If target looks like a URL, treat as link
        if (target && (target.startsWith('http://') || target.startsWith('https://'))) {
          console.warn('[WelcomeView] Unknown action type, falling back to link:', type)
          window.open(target, '_blank', 'noopener,noreferrer')
        } else {
          console.warn('[WelcomeView] Unknown action type with no URL fallback:', type)
        }
    }
  }, [onBrowseRegistry])

  // Get workspace state if workspace is open
  const workspaceState = workspacePath ? getWorkspaceState(workspacePath) : null

  // Reset dismissed state when workspace changes
  useEffect(() => {
    setRestoreDismissed(false)
  }, [workspacePath])

  // Refresh metadata for recent projects when WelcomeView is displayed
  useEffect(() => {
    const electronAPI = (window as any).electronAPI
    if (!electronAPI?.readDir) {
      console.log('[WelcomeView] electronAPI.readDir not available')
      return
    }

    if (recentProjects.length === 0) {
      console.log('[WelcomeView] No recent projects to refresh')
      return
    }

    console.log('[WelcomeView] Refreshing metadata for', recentProjects.length, 'projects')

    // Count .prmd files recursively in a directory
    const countFilesRecursive = async (dirPath: string): Promise<number> => {
      try {
        const result = await electronAPI.readDir(dirPath)
        if (!result.success || !result.files) {
          return 0
        }

        let count = 0
        for (const entry of result.files) {
          if (entry.isDirectory) {
            // Skip node_modules and hidden directories
            if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
              const childPath = `${dirPath}/${entry.name}`
              count += await countFilesRecursive(childPath)
            }
          } else if (entry.name.endsWith('.prmd')) {
            count++
          }
        }
        return count
      } catch {
        return 0
      }
    }

    // Get git status for a project
    const getGitStatus = async (projectPath: string): Promise<{
      branch?: string
      changesCount?: number
      ahead?: number
      behind?: number
    }> => {
      if (!electronAPI?.runGitCommand) return {}

      try {
        // Get branch name
        const branchResult = await electronAPI.runGitCommand(['branch', '--show-current'], projectPath)
        const branch = branchResult.success ? branchResult.stdout?.trim() : undefined

        // Get status (count changes)
        const statusResult = await electronAPI.runGitCommand(['status', '--porcelain'], projectPath)
        let changesCount = 0
        if (statusResult.success && statusResult.stdout) {
          changesCount = statusResult.stdout.trim().split('\n').filter((l: string) => l.trim()).length
        }

        // Get ahead/behind count
        let ahead = 0
        let behind = 0
        if (branch) {
          const revListResult = await electronAPI.runGitCommand(
            ['rev-list', '--left-right', '--count', `origin/${branch}...HEAD`],
            projectPath
          )
          if (revListResult.success && revListResult.stdout) {
            const parts = revListResult.stdout.trim().split(/\s+/)
            if (parts.length >= 2) {
              behind = parseInt(parts[0], 10) || 0
              ahead = parseInt(parts[1], 10) || 0
            }
          }
        }

        return { branch, changesCount, ahead, behind }
      } catch {
        return {}
      }
    }

    // Get project description from prompd.json, .pdproj, or package.json
    const getProjectDescription = async (projectPath: string): Promise<string | undefined> => {
      if (!electronAPI?.readFile) return undefined

      try {
        // Try prompd.json first (canonical package config)
        try {
          const result = await electronAPI.readFile(`${projectPath}/prompd.json`)
          if (result.success && result.content) {
            const parsed = JSON.parse(result.content)
            if (parsed.description) return parsed.description
          }
        } catch {
          // No prompd.json
        }

        // Try .pdproj files (IDE project state)
        const pdprojFiles = ['prompd.pdproj', 'project.pdproj']
        for (const filename of pdprojFiles) {
          try {
            const result = await electronAPI.readFile(`${projectPath}/${filename}`)
            if (result.success && result.content) {
              const parsed = JSON.parse(result.content)
              if (parsed.description) return parsed.description
            }
          } catch {
            // Try next file
          }
        }

        // Fallback to package.json (for npm projects that also have prompts)
        try {
          const result = await electronAPI.readFile(`${projectPath}/package.json`)
          if (result.success && result.content) {
            const parsed = JSON.parse(result.content)
            if (parsed.description) return parsed.description
          }
        } catch {
          // No package.json
        }

        return undefined
      } catch {
        return undefined
      }
    }

    // Refresh all metadata for projects
    const refreshProjectMetadata = async () => {
      for (const project of recentProjects) {
        try {
          // Fetch all metadata in parallel
          const [fileCount, gitStatus, description] = await Promise.all([
            countFilesRecursive(project.path),
            getGitStatus(project.path),
            getProjectDescription(project.path)
          ])

          // Build updates object
          const updates: Record<string, unknown> = {}

          if (project.fileCount !== fileCount) {
            updates.fileCount = fileCount
          }
          if (gitStatus.branch && project.gitBranch !== gitStatus.branch) {
            updates.gitBranch = gitStatus.branch
          }
          if (gitStatus.changesCount !== undefined && project.gitChangesCount !== gitStatus.changesCount) {
            updates.gitChangesCount = gitStatus.changesCount
            updates.gitDirty = gitStatus.changesCount > 0
          }
          if (gitStatus.ahead !== undefined && project.gitAhead !== gitStatus.ahead) {
            updates.gitAhead = gitStatus.ahead
          }
          if (gitStatus.behind !== undefined && project.gitBehind !== gitStatus.behind) {
            updates.gitBehind = gitStatus.behind
          }
          if (description && project.description !== description) {
            updates.description = description
          }

          // Only update if there are changes
          if (Object.keys(updates).length > 0) {
            console.log('[WelcomeView] Updating project:', project.name, updates)
            updateRecentProject(project.path, updates)
          }
        } catch (err) {
          console.error('[WelcomeView] Error refreshing metadata for:', project.path, err)
        }
      }
    }

    refreshProjectMetadata()
  }, [recentProjects, updateRecentProject]) // Re-run when projects change

  // Fetch project stats when a workspace is open
  useEffect(() => {
    if (!workspacePath) {
      setProjectStats(null)
      return
    }

    const electronAPI = (window as any).electronAPI
    if (!electronAPI?.readDir) {
      console.log('[WelcomeView] electronAPI.readDir not available for project stats')
      return
    }

    console.log('[WelcomeView] Fetching stats for workspace:', workspacePath)

    // Count .prmd files recursively
    const countFilesRecursive = async (dirPath: string): Promise<number> => {
      try {
        const result = await electronAPI.readDir(dirPath)
        if (!result.success || !result.files) return 0

        let count = 0
        for (const entry of result.files) {
          if (entry.isDirectory) {
            if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
              count += await countFilesRecursive(`${dirPath}/${entry.name}`)
            }
          } else if (entry.name.endsWith('.prmd')) {
            count++
          }
        }
        return count
      } catch {
        return 0
      }
    }

    // Get recent .prmd files sorted by modification time
    const getRecentFiles = async (dirPath: string, maxFiles: number = 10): Promise<RecentFile[]> => {
      const files: RecentFile[] = []

      const scanDir = async (dir: string, relativePath: string = '') => {
        try {
          const result = await electronAPI.readDir(dir)
          if (!result.success || !result.files) return

          for (const entry of result.files) {
            if (entry.isDirectory) {
              if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                const newRelPath = relativePath ? `${relativePath}/${entry.name}` : entry.name
                await scanDir(`${dir}/${entry.name}`, newRelPath)
              }
            } else if (entry.name.endsWith('.prmd')) {
              const filePath = relativePath ? `${relativePath}/${entry.name}` : entry.name
              files.push({
                name: entry.name,
                path: filePath,
                lastModified: entry.mtime || Date.now()
              })
            }
          }
        } catch {
          // Skip directories we can't read
        }
      }

      await scanDir(dirPath)

      // Sort by last modified (most recent first) and limit
      return files
        .sort((a, b) => b.lastModified - a.lastModified)
        .slice(0, maxFiles)
    }

    // Get git status
    const getGitStatus = async (): Promise<{
      branch?: string
      changesCount?: number
      ahead?: number
      behind?: number
    }> => {
      if (!electronAPI?.runGitCommand) return {}

      try {
        const branchResult = await electronAPI.runGitCommand(['branch', '--show-current'], workspacePath)
        const branch = branchResult.success ? branchResult.stdout?.trim() : undefined

        const statusResult = await electronAPI.runGitCommand(['status', '--porcelain'], workspacePath)
        let changesCount = 0
        if (statusResult.success && statusResult.stdout) {
          changesCount = statusResult.stdout.trim().split('\n').filter((l: string) => l.trim()).length
        }

        let ahead = 0
        let behind = 0
        if (branch) {
          const revListResult = await electronAPI.runGitCommand(
            ['rev-list', '--left-right', '--count', `origin/${branch}...HEAD`],
            workspacePath
          )
          if (revListResult.success && revListResult.stdout) {
            const parts = revListResult.stdout.trim().split(/\s+/)
            if (parts.length >= 2) {
              behind = parseInt(parts[0], 10) || 0
              ahead = parseInt(parts[1], 10) || 0
            }
          }
        }

        return { branch, changesCount, ahead, behind }
      } catch {
        return {}
      }
    }

    // Get manifest data from prompd.json or other config files
    const getManifestData = async (): Promise<{
      description?: string
      version?: string
      author?: string
      license?: string
      keywords?: string[]
    }> => {
      if (!electronAPI?.readFile) return {}

      // Try prompd.json first (canonical package config)
      try {
        const result = await electronAPI.readFile(`${workspacePath}/prompd.json`)
        if (result.success && result.content) {
          const parsed = JSON.parse(result.content)
          return {
            description: parsed.description,
            version: parsed.version,
            author: parsed.author,
            license: parsed.license,
            keywords: parsed.keywords
          }
        }
      } catch {
        // Fall through to other config files
      }

      // Fallback to other config files for basic description
      const configFiles = ['prompd.pdproj', 'project.pdproj', 'package.json']
      for (const filename of configFiles) {
        try {
          const result = await electronAPI.readFile(`${workspacePath}/${filename}`)
          if (result.success && result.content) {
            const parsed = JSON.parse(result.content)
            if (parsed.description) {
              return {
                description: parsed.description,
                version: parsed.version,
                author: parsed.author,
                license: parsed.license
              }
            }
          }
        } catch {
          // Try next file
        }
      }
      return {}
    }

    const fetchStats = async () => {
      const [fileCount, recentFiles, gitStatus, manifestData] = await Promise.all([
        countFilesRecursive(workspacePath),
        getRecentFiles(workspacePath),
        getGitStatus(),
        getManifestData()
      ])

      setProjectStats({
        name: workspaceName || workspacePath.split(/[/\\]/).pop() || 'Project',
        path: workspacePath,
        description: manifestData.description,
        version: manifestData.version,
        author: manifestData.author,
        license: manifestData.license,
        keywords: manifestData.keywords,
        gitBranch: gitStatus.branch,
        gitChangesCount: gitStatus.changesCount,
        gitAhead: gitStatus.ahead,
        gitBehind: gitStatus.behind,
        fileCount,
        recentFiles
      })
    }

    fetchStats()
  }, [workspacePath, workspaceName])

  // Memoized callbacks - must be before any conditional returns
  const handleOpenProject = useCallback(async (path: string) => {
    // Check if path exists before opening
    const electronAPI = (window as any).electronAPI
    if (electronAPI?.readDir) {
      try {
        const result = await electronAPI.readDir(path)
        if (!result.success) {
          // Path doesn't exist - prompt user to remove from recent list
          const shouldRemove = await showConfirm({
            title: 'Project Not Found',
            message: `The folder "${path}" no longer exists or is inaccessible.\n\nWould you like to remove it from your recent projects?`,
            confirmLabel: 'Remove',
            cancelLabel: 'Keep',
            confirmVariant: 'warning'
          })
          if (shouldRemove) {
            removeRecentProject(path)
          }
          return
        }
      } catch (err) {
        console.error('[WelcomeView] Error checking project path:', err)
        // Continue to open - let the main handler deal with errors
      }
    }
    onOpenProject(path)
  }, [onOpenProject, showConfirm, removeRecentProject])

  const handleRemoveProject = useCallback((path: string) => {
    removeRecentProject(path)
  }, [removeRecentProject])

  const colors = theme === 'dark' ? {
    bg: '#0f172a',
    text: '#e2e8f0',
    textMuted: '#94a3b8',
    textDim: '#64748b',
    divider: 'rgba(71, 85, 105, 0.3)'
  } : {
    bg: '#f8fafc',
    text: '#0f172a',
    textMuted: '#64748b',
    textDim: '#94a3b8',
    divider: 'rgba(226, 232, 240, 0.8)'
  }

  // Handle restore state acceptance
  const handleRestoreState = useCallback((state: WorkspaceState) => {
    if (onRestoreState) {
      onRestoreState(state)
    }
    // Clear the workspace state after restore so it doesn't show again
    if (workspacePath) {
      clearWorkspaceState(workspacePath)
    }
    setRestoreDismissed(true)
  }, [onRestoreState, workspacePath, clearWorkspaceState])

  // Handle restore state dismissal
  const handleDismissRestore = useCallback(() => {
    setRestoreDismissed(true)
    // Optionally clear the state so it doesn't persist
    // Uncomment if you want "Dismiss" to permanently remove the saved state:
    // if (workspacePath) {
    //   clearWorkspaceState(workspacePath)
    // }
  }, [])

  // If a project is open, show the project stats view
  if (workspacePath && projectStats) {
    // Only show restore prompt if not dismissed and has files to restore
    const showRestorePrompt = !restoreDismissed && workspaceState && workspaceState.openFiles.length > 0

    return (
      <ProjectOpenView
        stats={projectStats}
        onNewPrompt={onNewPrompt}
        onBrowseRegistry={onBrowseRegistry}
        onOpenFile={onOpenFile}
        onRestoreState={showRestorePrompt ? handleRestoreState : undefined}
        workspaceState={showRestorePrompt ? workspaceState : undefined}
        onDismissRestore={handleDismissRestore}
        theme={theme}
      />
    )
  }

  // If workspace is open but stats are still loading, show a minimal loading state
  // This prevents the flash of no-project view while project stats are being fetched
  if (workspacePath && !projectStats) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: colors.bg
      }}>
        {/* Empty state - just show background while loading */}
      </div>
    )
  }

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '40px',
      background: colors.bg,
      overflow: 'auto'
    }}>
      <div style={{
        maxWidth: '720px',
        width: '100%',
        margin: 'auto 0'
      }}>
        {/* Logo & Title */}
        <div style={{
          textAlign: 'center',
          marginBottom: '32px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            marginBottom: '8px'
          }}>
            <img
              src={logoImage}
              alt="Prompd"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px'
              }}
            />
            <h1 style={{
              fontSize: '28px',
              fontWeight: 700,
              color: colors.text,
              margin: 0
            }}>
              Prompd
            </h1>
          </div>
          <p style={{
            fontSize: '14px',
            color: colors.textMuted,
            margin: 0
          }}>
            Create, manage, and share AI prompts
          </p>
        </div>

        {/* Registry Search Bar */}
        {onOpenPackageDetails && (
          <RegistrySearchBar
            theme={theme}
            onSelectPackage={onOpenPackageDetails}
          />
        )}

        {/* Tabbed Interface */}
        <div style={{
          background: theme === 'dark' ? 'rgba(30, 41, 59, 0.3)' : 'rgba(248, 250, 252, 0.8)',
          borderRadius: '12px',
          border: `1px solid ${colors.divider}`,
          overflow: 'hidden',
          marginBottom: '24px'
        }}>
          {/* Tab Headers */}
          <div style={{
            display: 'flex',
            borderBottom: `1px solid ${colors.divider}`
          }}>
            <TabButton
              active={activeTab === 'projects'}
              label="Recent Projects"
              icon={FolderOpen}
              onClick={() => setActiveTab('projects')}
              theme={theme}
            />
            <TabButton
              active={activeTab === 'news'}
              label="Latest News"
              icon={Newspaper}
              onClick={() => setActiveTab('news')}
              theme={theme}
            />
          </div>

          {/* Tab Content */}
          <div style={{ padding: '16px', minHeight: '280px' }}>
            {activeTab === 'projects' && (
              <>
                {recentProjects.length > 0 ? (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    {recentProjects.map(project => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        onOpen={() => handleOpenProject(project.path)}
                        onRemove={() => handleRemoveProject(project.path)}
                        theme={theme}
                      />
                    ))}
                  </div>
                ) : (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '40px 20px',
                    textAlign: 'center'
                  }}>
                    <FolderOpen size={48} style={{ color: colors.textDim, marginBottom: '16px' }} />
                    <div style={{ fontSize: '16px', fontWeight: 500, color: colors.text, marginBottom: '8px' }}>
                      No recent projects
                    </div>
                    <div style={{ fontSize: '14px', color: colors.textMuted, marginBottom: '20px' }}>
                      Open a folder to get started with Prompd
                    </div>
                    <QuickActionButton
                      icon={FolderOpen}
                      label="Open Folder"
                      onClick={onOpenFolder}
                      primary
                      theme={theme}
                    />
                  </div>
                )}
              </>
            )}

            {activeTab === 'news' && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                {isLoadingNews ? (
                  <div style={{
                    padding: '40px 20px',
                    textAlign: 'center',
                    color: colors.textMuted,
                    fontSize: '14px'
                  }}>
                    Loading news...
                  </div>
                ) : newsItems.length > 0 ? (
                  newsItems.map(item => (
                    <NewsCard
                      key={`${item.id}-${newsRefreshKey}`}
                      item={item}
                      theme={theme}
                      onAction={handleNewsAction}
                      onDismiss={handleDismissNews}
                    />
                  ))
                ) : (
                  <div style={{
                    padding: '40px 20px',
                    textAlign: 'center',
                    color: colors.textMuted,
                    fontSize: '14px'
                  }}>
                    No news at this time.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          justifyContent: 'center'
        }}>
          <QuickActionButton
            icon={FolderOpen}
            label="Open Folder"
            onClick={onOpenFolder}
            primary
            theme={theme}
          />
          <QuickActionButton
            icon={Plus}
            label="New Prompd"
            onClick={onNewPrompt}
            theme={theme}
            dataHintTarget="new-prompd-button"
          />
          <QuickActionButton
            icon={Search}
            label="Browse Registry"
            onClick={onBrowseRegistry}
            theme={theme}
          />
        </div>

        {/* Keyboard hints */}
        <div style={{
          marginTop: '32px',
          textAlign: 'center',
          fontSize: '12px',
          color: colors.textDim
        }}>
          <span style={{
            padding: '2px 6px',
            background: theme === 'dark' ? 'rgba(71, 85, 105, 0.3)' : 'rgba(226, 232, 240, 0.8)',
            borderRadius: '4px',
            fontFamily: 'ui-monospace, monospace',
            marginRight: '4px'
          }}>
            Ctrl+O
          </span>
          to open folder
          <span style={{ margin: '0 12px', color: colors.divider }}>|</span>
          <span style={{
            padding: '2px 6px',
            background: theme === 'dark' ? 'rgba(71, 85, 105, 0.3)' : 'rgba(226, 232, 240, 0.8)',
            borderRadius: '4px',
            fontFamily: 'ui-monospace, monospace',
            marginRight: '4px'
          }}>
            Ctrl+N
          </span>
          to create new
        </div>
      </div>

      {/* Confirm dialog for missing project prompts */}
      <ConfirmDialogComponent />
    </div>
  )
}

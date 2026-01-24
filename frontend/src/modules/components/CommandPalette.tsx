import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useEditorStore, selectActiveTab } from '../../stores/editorStore'
import { SLASH_COMMANDS, executeSlashCommand, type SlashCommand, type SlashCommandContext } from '../services/slashCommands'
import { useAuthenticatedUser } from '../auth/ClerkWrapper'
import {
  Search, FileCode, FileCheck, FileText, GitBranch, Package,
  FolderTree, HelpCircle, Play, Moon, Sun, X,
  Command, ChevronRight, type LucideIcon
} from 'lucide-react'

// Icon mapping for slash commands
const iconMap: Record<string, LucideIcon> = {
  FileCheck,
  FileText,
  FileCode,
  GitBranch,
  Search,
  Package,
  FolderTree,
  HelpCircle
}

// Additional app commands beyond slash commands
interface AppCommand {
  id: string
  name: string
  description: string
  icon: LucideIcon
  category: 'view' | 'settings' | 'action'
  shortcut?: string
  action: () => void
}

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  workspacePath?: string | null
  onShowNotification?: (message: string, type?: 'info' | 'warning' | 'error') => void
}

export function CommandPalette({ isOpen, onClose, workspacePath, onShowNotification }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [parsedArgs, setParsedArgs] = useState<string>('') // Arguments extracted from query
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Get editor state
  const activeTab = useEditorStore(selectActiveTab)
  const text = useEditorStore(state => state.text)

  // Get UI state
  const theme = useUIStore(state => state.theme)
  const setTheme = useUIStore(state => state.setTheme)
  const setBuildOutput = useUIStore(state => state.setBuildOutput)
  const setShowBuildPanel = useUIStore(state => state.setShowBuildPanel)

  // Auth for registry commands
  const { getToken } = useAuthenticatedUser()

  // Theme colors
  const colors = useMemo(() => ({
    bg: theme === 'dark' ? '#1e1e1e' : '#ffffff',
    bgSecondary: theme === 'dark' ? '#252526' : '#f5f5f5',
    bgHover: theme === 'dark' ? '#2a2d2e' : '#e8e8e8',
    bgSelected: theme === 'dark' ? '#094771' : '#0066b8',
    border: theme === 'dark' ? '#3c3c3c' : '#e0e0e0',
    text: theme === 'dark' ? '#cccccc' : '#333333',
    textSecondary: theme === 'dark' ? '#888888' : '#666666',
    textSelected: '#ffffff',
    accent: '#0078d4'
  }), [theme])

  // Build the list of all commands
  const allCommands = useMemo(() => {
    const commands: (SlashCommand | AppCommand)[] = []

    // Add slash commands
    SLASH_COMMANDS.forEach(cmd => {
      commands.push(cmd)
    })

    // Add app commands
    const appCommands: AppCommand[] = [
      {
        id: 'toggle-theme',
        name: 'Toggle Theme',
        description: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        icon: theme === 'dark' ? Sun : Moon,
        category: 'settings',
        action: () => setTheme(theme === 'dark' ? 'light' : 'dark')
      },
      {
        id: 'build-package',
        name: 'Build Package',
        description: 'Build .pdpkg package from workspace',
        icon: Package,
        category: 'action',
        shortcut: 'Ctrl+Shift+B',
        action: () => window.dispatchEvent(new CustomEvent('prompd-build-package'))
      },
      {
        id: 'compile-current',
        name: 'Compile Current File',
        description: 'Compile the active .prmd file to markdown',
        icon: Play,
        category: 'action',
        action: () => executeCompile()
      }
    ]

    appCommands.forEach(cmd => commands.push(cmd))

    return commands
  }, [theme, setTheme])

  // Filter commands based on query and extract arguments
  // Supports formats: "search query", "search prompd", "/search query"
  const filteredCommands = useMemo(() => {
    if (!query.trim()) {
      setParsedArgs('')
      return allCommands
    }

    const trimmedQuery = query.trim()

    // Check if query starts with a command name (with or without /)
    const queryWithoutSlash = trimmedQuery.startsWith('/') ? trimmedQuery.slice(1) : trimmedQuery
    const parts = queryWithoutSlash.split(/\s+/)
    const commandPart = parts[0].toLowerCase()
    const argsPart = parts.slice(1).join(' ')

    // Try to find an exact command match
    const exactMatch = allCommands.find(cmd =>
      cmd.name.toLowerCase() === commandPart
    )

    if (exactMatch) {
      // Found exact command match - set args and return just this command
      setParsedArgs(argsPart)
      return [exactMatch]
    }

    // No exact match - filter by partial match (use queryWithoutSlash to handle /commands)
    setParsedArgs('')
    const lowerQuery = commandPart.toLowerCase()
    return allCommands.filter(cmd =>
      cmd.name.toLowerCase().includes(lowerQuery) ||
      cmd.description.toLowerCase().includes(lowerQuery) ||
      ('category' in cmd && cmd.category.toLowerCase().includes(lowerQuery))
    )
  }, [allCommands, query])

  // Check if command can be executed
  const canExecuteCommand = useCallback((cmd: SlashCommand | AppCommand): boolean => {
    if ('action' in cmd) {
      // App command - check compile requires file
      if (cmd.id === 'compile-current') {
        return !!activeTab && activeTab.name.endsWith('.prmd')
      }
      return true
    }

    // Slash command
    if (cmd.requiresFile && (!activeTab || !activeTab.name.endsWith('.prmd'))) {
      return false
    }
    if (cmd.requiresWorkspace && !workspacePath) {
      return false
    }
    return true
  }, [activeTab, workspacePath])

  // Execute compile command
  const executeCompile = useCallback(async () => {
    if (!activeTab || !activeTab.name.endsWith('.prmd')) {
      onShowNotification?.('No .prmd file open', 'warning')
      return
    }

    // Show build panel with building status
    setBuildOutput({
      status: 'building',
      message: `Compiling ${activeTab.name}...`,
      timestamp: Date.now()
    })
    setShowBuildPanel(true)

    try {
      const context: SlashCommandContext = {
        fileContent: text,
        fileName: activeTab.name,
        workspacePath: workspacePath || undefined,
        getToken: async () => await getToken() || ''
      }

      const result = await executeSlashCommand('compile', '', context)

      if (result.success) {
        setBuildOutput({
          status: 'success',
          message: `Compiled ${activeTab.name} successfully`,
          details: result.output,
          timestamp: Date.now()
        })
      } else {
        setBuildOutput({
          status: 'error',
          message: `Compilation failed: ${result.error || 'Unknown error'}`,
          details: result.output,
          timestamp: Date.now()
        })
      }
    } catch (err) {
      setBuildOutput({
        status: 'error',
        message: `Compilation error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: Date.now()
      })
    }
  }, [activeTab, text, workspacePath, getToken, setBuildOutput, setShowBuildPanel, onShowNotification])

  // Execute selected command
  const executeCommand = useCallback(async (cmd: SlashCommand | AppCommand) => {
    if (!canExecuteCommand(cmd)) {
      const reason = 'requiresFile' in cmd && cmd.requiresFile
        ? 'This command requires an open .prmd file'
        : 'requiresWorkspace' in cmd && cmd.requiresWorkspace
          ? 'This command requires an open workspace'
          : 'Cannot execute this command'
      onShowNotification?.(reason, 'warning')
      return
    }

    onClose()

    if ('action' in cmd) {
      // App command
      cmd.action()
      return
    }

    // Slash command - show in build panel
    const argsDisplay = parsedArgs ? ` ${parsedArgs}` : ''
    setBuildOutput({
      status: 'building',
      message: `Running /${cmd.name}${argsDisplay}...`,
      timestamp: Date.now()
    })
    setShowBuildPanel(true)

    try {
      const context: SlashCommandContext = {
        fileContent: text,
        fileName: activeTab?.name,
        workspacePath: workspacePath || undefined,
        getToken: async () => await getToken() || ''
      }

      const result = await executeSlashCommand(cmd.id, parsedArgs, context)

      if (result.success) {
        setBuildOutput({
          status: 'success',
          message: `/${cmd.name} completed`,
          details: result.output,
          timestamp: Date.now()
        })
      } else {
        setBuildOutput({
          status: 'error',
          message: `/${cmd.name} failed: ${result.error || 'Unknown error'}`,
          details: result.output,
          timestamp: Date.now()
        })
      }
      // Ensure panel is expanded after command completes (otherwise it auto-collapses on editor focus)
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('expand-output-panel'))
      }, 100)
    } catch (err) {
      setBuildOutput({
        status: 'error',
        message: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: Date.now()
      })
      // Ensure panel is expanded after error
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('expand-output-panel'))
      }, 100)
    }
  }, [canExecuteCommand, onClose, setBuildOutput, setShowBuildPanel, text, activeTab, workspacePath, getToken, onShowNotification, parsedArgs])

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => Math.max(prev - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (filteredCommands[selectedIndex]) {
          executeCommand(filteredCommands[selectedIndex])
        }
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
    }
  }, [filteredCommands, selectedIndex, executeCommand, onClose])

  // Focus input when opened, reset state when closed
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setParsedArgs('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedEl = listRef.current.querySelector('[data-selected="true"]')
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex])

  // Note: Global keyboard listener for Ctrl+Shift+P is NOT needed here.
  // - In Electron: Menu accelerators handle the shortcut
  // - Inside Monaco: DOM interceptor in PrompdEditor handles it
  // - Opening/closing is managed by parent component via isOpen prop

  if (!isOpen) return null

  const getIcon = (cmd: SlashCommand | AppCommand) => {
    if ('action' in cmd) {
      const IconComponent = cmd.icon
      return <IconComponent size={16} />
    }
    const IconComponent = iconMap[cmd.icon] || HelpCircle
    return <IconComponent size={16} />
  }

  const getCategoryLabel = (cmd: SlashCommand | AppCommand) => {
    if ('action' in cmd) {
      return cmd.category.charAt(0).toUpperCase() + cmd.category.slice(1)
    }
    return cmd.category.charAt(0).toUpperCase() + cmd.category.slice(1)
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: '15vh',
        zIndex: 10000
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          width: '600px',
          maxWidth: '90vw',
          backgroundColor: colors.bg,
          borderRadius: '8px',
          border: `1px solid ${colors.border}`,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          overflow: 'hidden'
        }}
      >
        {/* Search input */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 16px',
            borderBottom: `1px solid ${colors.border}`
          }}
        >
          <Command size={18} style={{ color: colors.textSecondary, flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: '14px',
              color: colors.text
            }}
          />
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              padding: '4px',
              cursor: 'pointer',
              color: colors.textSecondary,
              display: 'flex',
              alignItems: 'center',
              borderRadius: '4px'
            }}
            onMouseOver={e => e.currentTarget.style.backgroundColor = colors.bgHover}
            onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <X size={16} />
          </button>
        </div>

        {/* Command list */}
        <div
          ref={listRef}
          style={{
            maxHeight: '400px',
            overflowY: 'auto'
          }}
        >
          {filteredCommands.length === 0 ? (
            <div
              style={{
                padding: '24px 16px',
                textAlign: 'center',
                color: colors.textSecondary,
                fontSize: '13px'
              }}
            >
              No commands found
            </div>
          ) : (
            filteredCommands.map((cmd, index) => {
              const isSelected = index === selectedIndex
              const isDisabled = !canExecuteCommand(cmd)

              return (
                <div
                  key={cmd.id}
                  data-selected={isSelected}
                  onClick={() => !isDisabled && executeCommand(cmd)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 16px',
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    backgroundColor: isSelected ? colors.bgSelected : 'transparent',
                    opacity: isDisabled ? 0.5 : 1
                  }}
                  onMouseEnter={() => !isDisabled && setSelectedIndex(index)}
                >
                  <span style={{ color: isSelected ? colors.textSelected : colors.textSecondary, flexShrink: 0 }}>
                    {getIcon(cmd)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      <span style={{
                        color: isSelected ? colors.textSelected : colors.text,
                        fontSize: '13px',
                        fontWeight: 500
                      }}>
                        {'action' in cmd ? cmd.name : `/${cmd.name}`}
                      </span>
                      {/* Show parsed args if present, otherwise show expected args format */}
                      {parsedArgs ? (
                        <span style={{
                          color: isSelected ? 'rgba(255,255,255,0.9)' : colors.accent,
                          fontSize: '12px',
                          fontWeight: 500
                        }}>
                          {parsedArgs}
                        </span>
                      ) : ('args' in cmd && cmd.args && (
                        <span style={{
                          color: isSelected ? 'rgba(255,255,255,0.7)' : colors.textSecondary,
                          fontSize: '12px'
                        }}>
                          {cmd.args}
                        </span>
                      ))}
                    </div>
                    <div style={{
                      color: isSelected ? 'rgba(255,255,255,0.8)' : colors.textSecondary,
                      fontSize: '12px',
                      marginTop: '2px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {cmd.description}
                    </div>
                  </div>
                  <span style={{
                    color: isSelected ? 'rgba(255,255,255,0.6)' : colors.textSecondary,
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    flexShrink: 0
                  }}>
                    {getCategoryLabel(cmd)}
                  </span>
                  {'shortcut' in cmd && cmd.shortcut && (
                    <span style={{
                      color: isSelected ? 'rgba(255,255,255,0.6)' : colors.textSecondary,
                      fontSize: '11px',
                      padding: '2px 6px',
                      backgroundColor: isSelected ? 'rgba(255,255,255,0.1)' : colors.bgSecondary,
                      borderRadius: '4px',
                      flexShrink: 0
                    }}>
                      {cmd.shortcut}
                    </span>
                  )}
                  <ChevronRight
                    size={14}
                    style={{
                      color: isSelected ? 'rgba(255,255,255,0.5)' : colors.textSecondary,
                      flexShrink: 0
                    }}
                  />
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 16px',
            borderTop: `1px solid ${colors.border}`,
            backgroundColor: colors.bgSecondary,
            fontSize: '11px',
            color: colors.textSecondary
          }}
        >
          <div style={{ display: 'flex', gap: '16px' }}>
            <span><kbd style={kbdStyle(colors)}>Enter</kbd> to run</span>
            <span><kbd style={kbdStyle(colors)}>Esc</kbd> to close</span>
          </div>
          <div>
            <kbd style={kbdStyle(colors)}>Ctrl</kbd>+<kbd style={kbdStyle(colors)}>Shift</kbd>+<kbd style={kbdStyle(colors)}>P</kbd> Command Palette
          </div>
        </div>
      </div>
    </div>
  )
}

// Keyboard key style
const kbdStyle = (colors: { bgSecondary: string; border: string }): React.CSSProperties => ({
  display: 'inline-block',
  padding: '1px 4px',
  backgroundColor: colors.bgSecondary,
  border: `1px solid ${colors.border}`,
  borderRadius: '3px',
  fontSize: '10px',
  fontFamily: 'monospace'
})

export default CommandPalette

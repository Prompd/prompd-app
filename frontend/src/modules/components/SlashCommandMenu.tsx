/**
 * SlashCommandMenu - Dropdown menu for slash commands in chat
 *
 * Shows available commands when user types "/" in chat input.
 * Commands are executed via:
 * - Electron: Direct IPC to main process using @prompd/cli
 * - Browser: Backend API endpoints that use @prompd/cli
 */

import { useEffect, useRef, useState } from 'react'
import {
  FileCheck,
  FileCode,
  FileText,
  Search,
  Package,
  HelpCircle,
  GitBranch,
  FilePlus,
  Terminal,
  FolderTree
} from 'lucide-react'
import { SLASH_COMMANDS, type SlashCommand } from '../services/slashCommands'

// Map command IDs to icons
const COMMAND_ICONS: Record<string, React.ReactNode> = {
  validate: <FileCheck size={14} />,
  explain: <FileText size={14} />,
  compile: <FileCode size={14} />,
  deps: <GitBranch size={14} />,
  search: <Search size={14} />,
  install: <Package size={14} />,
  new: <FilePlus size={14} />,
  help: <HelpCircle size={14} />,
  list: <FolderTree size={14} />
}

// Re-export for compatibility
export { SLASH_COMMANDS }
export type { SlashCommand }

interface SlashCommandMenuProps {
  isOpen: boolean
  filter: string  // Text after "/"
  onSelect: (command: SlashCommand) => void
  onClose: () => void
  theme?: 'light' | 'dark'
}

export function SlashCommandMenu({
  isOpen,
  filter,
  onSelect,
  onClose,
  theme = 'dark'
}: SlashCommandMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Filter commands based on input
  const filteredCommands = SLASH_COMMANDS.filter(cmd =>
    cmd.name.toLowerCase().startsWith(filter.toLowerCase()) ||
    cmd.description.toLowerCase().includes(filter.toLowerCase())
  )

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [filter])

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(prev =>
            prev < filteredCommands.length - 1 ? prev + 1 : 0
          )
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(prev =>
            prev > 0 ? prev - 1 : filteredCommands.length - 1
          )
          break
        case 'Enter':
        case 'Tab':
          e.preventDefault()
          if (filteredCommands[selectedIndex]) {
            onSelect(filteredCommands[selectedIndex])
          }
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, filteredCommands, selectedIndex, onSelect, onClose])

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onClose])

  if (!isOpen || filteredCommands.length === 0) return null

  const colors = theme === 'dark' ? {
    bg: '#1e293b',
    border: 'rgba(71, 85, 105, 0.5)',
    text: '#e2e8f0',
    textMuted: '#94a3b8',
    hover: 'rgba(99, 102, 241, 0.15)',
    selected: 'rgba(99, 102, 241, 0.25)',
    accent: '#6366f1',
    categoryBg: 'rgba(71, 85, 105, 0.3)'
  } : {
    bg: '#ffffff',
    border: 'rgba(226, 232, 240, 0.8)',
    text: '#0f172a',
    textMuted: '#64748b',
    hover: 'rgba(99, 102, 241, 0.1)',
    selected: 'rgba(99, 102, 241, 0.15)',
    accent: '#6366f1',
    categoryBg: 'rgba(241, 245, 249, 0.8)'
  }

  // Group commands by category
  const groupedCommands: { category: string; commands: SlashCommand[] }[] = []
  let currentCategory = ''

  filteredCommands.forEach(cmd => {
    if (cmd.category !== currentCategory) {
      currentCategory = cmd.category
      groupedCommands.push({ category: currentCategory, commands: [] })
    }
    groupedCommands[groupedCommands.length - 1].commands.push(cmd)
  })

  let globalIndex = 0

  return (
    <div
      ref={menuRef}
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        left: 0,
        width: '320px',
        maxHeight: '320px',
        overflowY: 'auto',
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: '10px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
        zIndex: 1000,
        padding: '6px'
      }}
    >
      {/* Header */}
      <div style={{
        padding: '8px 10px 6px',
        fontSize: '10px',
        fontWeight: 600,
        color: colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }}>
        <Terminal size={12} />
        Commands
      </div>

      {/* Commands list */}
      {groupedCommands.map(group => (
        <div key={group.category}>
          {/* Category header */}
          <div style={{
            padding: '6px 10px 4px',
            fontSize: '9px',
            fontWeight: 600,
            color: colors.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginTop: '4px'
          }}>
            {group.category}
          </div>

          {/* Commands in category */}
          {group.commands.map(cmd => {
            const cmdIndex = globalIndex++
            const isSelected = cmdIndex === selectedIndex
            const icon = COMMAND_ICONS[cmd.id] || <Terminal size={14} />

            return (
              <div
                key={cmd.id}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onSelect(cmd)
                }}
                onMouseDown={(e) => {
                  // Prevent focus loss from input
                  e.preventDefault()
                }}
                onMouseEnter={() => setSelectedIndex(cmdIndex)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: isSelected ? colors.selected : 'transparent',
                  transition: 'background 0.1s'
                }}
              >
                {/* Icon */}
                <div style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '6px',
                  background: isSelected ? colors.accent : colors.categoryBg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isSelected ? 'white' : colors.textMuted,
                  flexShrink: 0
                }}>
                  {icon}
                </div>

                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: colors.text,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <span style={{ color: colors.accent }}>/</span>
                    {cmd.name}
                    {cmd.args && (
                      <span style={{
                        fontSize: '11px',
                        color: colors.textMuted,
                        fontWeight: 400
                      }}>
                        {cmd.args}
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontSize: '11px',
                    color: colors.textMuted,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {cmd.description}
                  </div>
                </div>

                {/* Keyboard hint */}
                {isSelected && (
                  <div style={{
                    fontSize: '10px',
                    color: colors.textMuted,
                    padding: '2px 6px',
                    background: colors.categoryBg,
                    borderRadius: '4px',
                    flexShrink: 0
                  }}>
                    Enter
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/**
 * Hook to manage slash command state
 */
export function useSlashCommands(inputValue: string) {
  const [isOpen, setIsOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [manuallyOpened, setManuallyOpened] = useState(false)

  useEffect(() => {
    // Check if input starts with / and extract filter
    if (inputValue.startsWith('/')) {
      const filterText = inputValue.slice(1).split(' ')[0] // Get text after / until first space
      if (!inputValue.includes(' ')) {
        // Only show menu if no space yet (still typing command)
        setFilter(filterText)
        setIsOpen(true)
      } else {
        setIsOpen(false)
        setManuallyOpened(false)
      }
    } else if (!manuallyOpened) {
      // Only close if not manually opened
      setIsOpen(false)
      setFilter('')
    }
  }, [inputValue, manuallyOpened])

  return {
    isOpen,
    filter,
    close: () => {
      setIsOpen(false)
      setManuallyOpened(false)
    },
    open: () => {
      setIsOpen(true)
      setManuallyOpened(true)
      setFilter('')
    }
  }
}

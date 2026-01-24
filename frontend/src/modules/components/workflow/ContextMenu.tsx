/**
 * ContextMenu - Right-click context menu for workflow canvas
 *
 * Supports three contexts:
 * - Node: Copy, Cut, Paste, Duplicate, Enable/Disable, Delete, Undock
 * - Edge: Delete Connection, Highlight Path
 * - Canvas: Paste, Add Node (submenu)
 */

import { memo, useCallback, useEffect, useRef } from 'react'
import {
  Copy, Scissors, Clipboard, Files, Power, PowerOff, Trash2,
  Unlink, Plus, Zap, Settings
} from 'lucide-react'
import type { WorkflowNodeType } from '../../services/workflowTypes'

// ============================================================================
// Types
// ============================================================================

export type ContextMenuType = 'node' | 'edge' | 'canvas'

export interface ContextMenuProps {
  type: ContextMenuType
  position: { x: number; y: number }
  onClose: () => void

  // Node context
  nodeId?: string
  nodeType?: WorkflowNodeType
  nodeLabel?: string
  isNodeDisabled?: boolean
  isNodeDocked?: boolean
  canPaste?: boolean

  // Edge context
  edgeId?: string
  edgeSource?: string
  edgeTarget?: string

  // Actions
  onCopy?: () => void
  onCut?: () => void
  onPaste?: () => void
  onDuplicate?: () => void
  onToggleDisabled?: () => void
  onDelete?: () => void
  onUndock?: () => void
  onAddNode?: (nodeType: WorkflowNodeType) => void
  onHighlightPath?: () => void
  onWorkflowSettings?: () => void
}

interface MenuItem {
  id: string
  label: string
  icon?: React.ComponentType<{ style?: React.CSSProperties }>
  onClick?: () => void
  shortcut?: string
  separator?: boolean
  danger?: boolean
  submenu?: MenuItem[]
}

// ============================================================================
// Node type groups for "Add Node" submenu
// ============================================================================

const NODE_TYPE_GROUPS: Array<{
  label: string
  types: Array<{ type: WorkflowNodeType; label: string; icon?: React.ComponentType<any> }>
}> = [
  {
    label: 'Core',
    types: [
      { type: 'trigger', label: 'Trigger' },
      { type: 'prompt', label: 'Prompt' },
      { type: 'provider', label: 'Provider' },
      { type: 'output', label: 'Output' },
    ]
  },
  {
    label: 'AI & Agents',
    types: [
      { type: 'agent', label: 'Agent' },
      { type: 'chat-agent', label: 'Chat Agent' },
      { type: 'claude-code', label: 'Claude Code' },
    ]
  },
  {
    label: 'Tools',
    types: [
      { type: 'tool', label: 'Tool' },
      { type: 'tool-call-router', label: 'Tool Router' },
      { type: 'tool-call-parser', label: 'Tool Parser' },
      { type: 'mcp-tool', label: 'MCP Tool' },
    ]
  },
  {
    label: 'Control Flow',
    types: [
      { type: 'condition', label: 'Condition' },
      { type: 'loop', label: 'Loop' },
      { type: 'parallel', label: 'Parallel' },
      { type: 'merge', label: 'Merge' },
    ]
  },
  {
    label: 'Data & Transform',
    types: [
      { type: 'transformer', label: 'Transform' },
      { type: 'code', label: 'Code' },
      { type: 'memory', label: 'Memory' },
      { type: 'api', label: 'API' },
    ]
  },
  {
    label: 'Interaction',
    types: [
      { type: 'user-input', label: 'User Input' },
      { type: 'callback', label: 'Callback' },
      { type: 'guardrail', label: 'Guardrail' },
    ]
  },
  {
    label: 'Execution',
    types: [
      { type: 'command', label: 'Command' },
      { type: 'workflow', label: 'Workflow' },
      { type: 'error-handler', label: 'Error Handler' },
    ]
  },
]

// ============================================================================
// Context Menu Component
// ============================================================================

export const ContextMenu = memo((props: ContextMenuProps) => {
  const {
    type,
    position,
    onClose,
    nodeId,
    isNodeDisabled,
    isNodeDocked,
    canPaste,
    onCopy,
    onCut,
    onPaste,
    onDuplicate,
    onToggleDisabled,
    onDelete,
    onUndock,
    onAddNode,
    onHighlightPath,
    onWorkflowSettings,
  } = props

  const menuRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  // Build menu items based on context type
  const menuItems: MenuItem[] = []

  if (type === 'node') {
    menuItems.push(
      { id: 'copy', label: 'Copy', icon: Copy, onClick: onCopy, shortcut: 'Ctrl+C' },
      { id: 'cut', label: 'Cut', icon: Scissors, onClick: onCut, shortcut: 'Ctrl+X' },
      { id: 'paste', label: 'Paste', icon: Clipboard, onClick: onPaste, shortcut: 'Ctrl+V' },
      { id: 'duplicate', label: 'Duplicate', icon: Files, onClick: onDuplicate, shortcut: 'Ctrl+D' },
      { id: 'sep1', label: '', separator: true },
      {
        id: 'toggle-disabled',
        label: isNodeDisabled ? 'Enable' : 'Disable',
        icon: isNodeDisabled ? Power : PowerOff,
        onClick: onToggleDisabled,
        shortcut: 'Ctrl+E'
      },
      { id: 'sep2', label: '', separator: true },
      { id: 'delete', label: 'Delete', icon: Trash2, onClick: onDelete, shortcut: 'Del', danger: true }
    )

    if (isNodeDocked && onUndock) {
      menuItems.splice(menuItems.length - 1, 0, {
        id: 'undock',
        label: 'Undock',
        icon: Unlink,
        onClick: onUndock
      })
    }
  } else if (type === 'edge') {
    menuItems.push(
      { id: 'delete', label: 'Delete Connection', icon: Trash2, onClick: onDelete, danger: true }
    )

    if (onHighlightPath) {
      menuItems.splice(0, 0, {
        id: 'highlight',
        label: 'Highlight Path',
        icon: Zap,
        onClick: onHighlightPath
      })
      menuItems.splice(1, 0, { id: 'sep1', label: '', separator: true })
    }
  } else if (type === 'canvas') {
    if (canPaste && onPaste) {
      menuItems.push({ id: 'paste', label: 'Paste', icon: Clipboard, onClick: onPaste, shortcut: 'Ctrl+V' })
      menuItems.push({ id: 'sep1', label: '', separator: true })
    }

    // Workflow Settings
    if (onWorkflowSettings) {
      menuItems.push({
        id: 'workflow-settings',
        label: 'Workflow Settings',
        icon: Settings,
        onClick: onWorkflowSettings
      })
      menuItems.push({ id: 'sep2', label: '', separator: true })
    }

    // Add node submenu
    const submenu: MenuItem[] = []
    NODE_TYPE_GROUPS.forEach((group, groupIdx) => {
      group.types.forEach((nodeType, typeIdx) => {
        submenu.push({
          id: `add-${nodeType.type}`,
          label: nodeType.label,
          onClick: () => onAddNode?.(nodeType.type)
        })
      })
      // Add separator between groups (except after last group)
      if (groupIdx < NODE_TYPE_GROUPS.length - 1) {
        submenu.push({ id: `sep-${groupIdx}`, label: '', separator: true })
      }
    })

    menuItems.push({
      id: 'add-node',
      label: 'Add Node',
      icon: Plus,
      submenu
    })
  }

  // Position menu to stay within viewport
  const adjustedPosition = { ...position }
  if (menuRef.current) {
    const rect = menuRef.current.getBoundingClientRect()
    if (rect.right > window.innerWidth) {
      adjustedPosition.x = window.innerWidth - rect.width - 10
    }
    if (rect.bottom > window.innerHeight) {
      adjustedPosition.y = window.innerHeight - rect.height - 10
    }
  }

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        zIndex: 10000,
        minWidth: 180,
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        padding: '4px',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {menuItems.map((item) => {
        if (item.separator) {
          return (
            <div
              key={item.id}
              style={{
                height: 1,
                background: 'var(--border)',
                margin: '4px 0',
              }}
            />
          )
        }

        const Icon = item.icon

        return (
          <button
            key={item.id}
            onClick={() => {
              item.onClick?.()
              onClose()
            }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              background: 'none',
              border: 'none',
              borderRadius: 4,
              color: item.danger ? 'var(--error)' : 'var(--text)',
              fontSize: '13px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = item.danger
                ? 'color-mix(in srgb, var(--error) 10%, transparent)'
                : 'var(--panel-2)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none'
            }}
          >
            {Icon && <Icon style={{ width: 14, height: 14, flexShrink: 0 }} />}
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.shortcut && (
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--muted)',
                  opacity: 0.7,
                }}
              >
                {item.shortcut}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
})

ContextMenu.displayName = 'ContextMenu'

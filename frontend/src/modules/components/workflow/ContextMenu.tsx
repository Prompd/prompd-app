/**
 * ContextMenu - Right-click context menu for workflow canvas
 *
 * Supports three contexts:
 * - Node: Copy, Cut, Paste, Duplicate, Enable/Disable, Delete, Undock
 * - Edge: Delete Connection, Highlight Path
 * - Canvas: Paste, Add Node (submenu)
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  Copy, Scissors, Clipboard, Files, Power, PowerOff, Trash2,
  Unlink, Plus, Zap, Settings, ChevronRight, Save, Group,
} from 'lucide-react'
import type { WorkflowNodeType } from '../../services/workflowTypes'
import type { TemplateListItem, TemplateScope } from '../../services/nodeTemplateTypes'
import { getNodeColor } from './nodeColors'
import { NODE_TYPE_CATEGORIES, NODE_TYPE_REGISTRY } from '../../services/nodeTypeRegistry'

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

  // Templates
  templates?: TemplateListItem[]

  // Multi-selection context
  selectedNodeCount?: number

  // Actions
  onCopy?: () => void
  onCut?: () => void
  onPaste?: () => void
  onDuplicate?: () => void
  onToggleDisabled?: () => void
  onDelete?: () => void
  onUndock?: () => void
  onSaveAsTemplate?: () => void
  onGroupSelected?: () => void
  onAddNode?: (nodeType: WorkflowNodeType) => void
  onInsertTemplate?: (fileName: string, scope: TemplateScope) => void
  onHighlightPath?: () => void
  onWorkflowSettings?: () => void
}

interface MenuItem {
  id: string
  label: string
  icon?: React.ComponentType<{ style?: React.CSSProperties }>
  nodeType?: WorkflowNodeType
  onClick?: () => void
  shortcut?: string
  separator?: boolean
  danger?: boolean
  submenu?: MenuItem[]
}

// ============================================================================
// Node type groups for "Add Node" submenu — derived from registry
// ============================================================================

const NODE_TYPE_GROUPS = NODE_TYPE_CATEGORIES.map(cat => ({
  label: cat.label,
  types: cat.types.map(t => {
    const entry = NODE_TYPE_REGISTRY[t]
    return { type: t, label: entry.label, icon: entry.icon }
  }),
}))

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
    selectedNodeCount,
    onCopy,
    onCut,
    onPaste,
    onDuplicate,
    onToggleDisabled,
    onDelete,
    onUndock,
    onSaveAsTemplate,
    onGroupSelected,
    onAddNode,
    onInsertTemplate,
    onHighlightPath,
    onWorkflowSettings,
    templates,
  } = props

  const menuRef = useRef<HTMLDivElement>(null)
  const [expandedSubmenu, setExpandedSubmenu] = useState<string | null>(null)

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
      { id: 'save-template', label: 'Save as Template', icon: Save, onClick: onSaveAsTemplate },
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

    // Group selected nodes
    if (selectedNodeCount && selectedNodeCount > 1 && onGroupSelected) {
      menuItems.push({
        id: 'group-selected',
        label: `Group ${selectedNodeCount} Nodes`,
        icon: Group,
        onClick: onGroupSelected,
      })
      menuItems.push({ id: 'sep-group', label: '', separator: true })
    }

    // Add node submenu
    const submenu: MenuItem[] = []
    NODE_TYPE_GROUPS.forEach((group, groupIdx) => {
      group.types.forEach((nodeType) => {
        submenu.push({
          id: `add-${nodeType.type}`,
          label: nodeType.label,
          icon: nodeType.icon,
          nodeType: nodeType.type,
          onClick: () => onAddNode?.(nodeType.type)
        })
      })
      // Add separator between groups (except after last group)
      if (groupIdx < NODE_TYPE_GROUPS.length - 1) {
        submenu.push({ id: `sep-${groupIdx}`, label: '', separator: true })
      }
    })

    // Append saved templates
    if (templates && templates.length > 0) {
      submenu.push({ id: 'sep-templates', label: '', separator: true })
      for (const tpl of templates) {
        const regEntry = NODE_TYPE_REGISTRY[tpl.nodeType as WorkflowNodeType]
        submenu.push({
          id: `tpl-${tpl.scope}-${tpl.fileName}`,
          label: tpl.name,
          icon: regEntry?.icon,
          nodeType: tpl.nodeType as WorkflowNodeType,
          onClick: () => onInsertTemplate?.(tpl.fileName, tpl.scope),
        })
      }
    }

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
        const hasSubmenu = item.submenu && item.submenu.length > 0
        const isExpanded = expandedSubmenu === item.id

        return (
          <div key={item.id}>
            <button
              onClick={() => {
                if (hasSubmenu) {
                  setExpandedSubmenu(isExpanded ? null : item.id)
                } else {
                  item.onClick?.()
                  onClose()
                }
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                background: isExpanded ? 'var(--panel-2)' : 'none',
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
                if (!isExpanded) {
                  e.currentTarget.style.background = 'none'
                }
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
              {hasSubmenu && (
                <ChevronRight style={{
                  width: 12,
                  height: 12,
                  flexShrink: 0,
                  color: 'var(--muted)',
                  transform: isExpanded ? 'rotate(90deg)' : 'none',
                  transition: 'transform 0.15s',
                }} />
              )}
            </button>
            {hasSubmenu && isExpanded && (
              <div style={{
                maxHeight: 280,
                overflowY: 'auto',
                borderLeft: '2px solid var(--border)',
                marginLeft: 16,
                paddingLeft: 4,
              }}>
                {item.submenu!.map((sub) => {
                  if (sub.separator) {
                    return (
                      <div
                        key={sub.id}
                        style={{
                          height: 1,
                          background: 'var(--border)',
                          margin: '2px 0',
                        }}
                      />
                    )
                  }
                  const SubIcon = sub.icon
                  const nodeColor = sub.nodeType ? getNodeColor(sub.nodeType) : undefined
                  return (
                    <button
                      key={sub.id}
                      onClick={() => {
                        sub.onClick?.()
                        onClose()
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 10px',
                        background: 'none',
                        border: 'none',
                        borderRadius: 4,
                        color: 'var(--text)',
                        fontSize: '12px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--panel-2)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'none'
                      }}
                    >
                      {SubIcon && <SubIcon style={{ width: 12, height: 12, flexShrink: 0, color: nodeColor }} />}
                      <span>{sub.label}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
})

ContextMenu.displayName = 'ContextMenu'

/**
 * ActionEdge - Custom edge with hover-reveal action buttons
 *
 * Replaces the default XYFlow edge. On hover, shows two circular buttons
 * at the edge midpoint: delete (trash) and insert node (plus).
 * The plus button opens a flat node-type dropdown rendered as a portal,
 * matching the ContextMenu "Add Node" submenu look and behavior.
 */

import { memo, useState, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react'
import { Trash2, Plus } from 'lucide-react'
import { useWorkflowStore } from '../../../../stores/workflowStore'
import { useEditorStore } from '../../../../stores/editorStore'
import { useUIStore } from '../../../../stores/uiStore'
import { NODE_TYPE_CATEGORIES, NODE_TYPE_REGISTRY } from '../../../services/nodeTypeRegistry'
import { getNodeColor } from '../nodeColors'
import type { WorkflowNodeType } from '../../../services/workflowTypes'
import type { TemplateListItem } from '../../../services/nodeTemplateTypes'

// Build grouped node types (same pattern as ContextMenu.tsx)
const NODE_TYPE_GROUPS = NODE_TYPE_CATEGORIES.map(cat => ({
  key: cat.key,
  label: cat.label,
  types: cat.types.map(t => {
    const entry = NODE_TYPE_REGISTRY[t]
    return { type: t, label: entry.label, icon: entry.icon }
  }),
}))

export const ActionEdge = memo(({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerStart,
  markerEnd,
  data,
}: EdgeProps) => {
  const [isHovered, setIsHovered] = useState(false)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [templates, setTemplates] = useState<TemplateListItem[]>([])
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const portalRef = useRef<HTMLDivElement>(null)
  const addBtnRef = useRef<HTMLButtonElement>(null)

  const deleteEdge = useWorkflowStore(state => state.deleteEdge)
  const addNodeOnEdge = useWorkflowStore(state => state.addNodeOnEdge)
  const addNodeFromTemplate = useWorkflowStore(state => state.addNodeFromTemplate)

  const readOnly = (data as Record<string, unknown> | undefined)?.readOnly === true

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  // Hover bridging between SVG path and HTML toolbar
  const handleMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    setIsHovered(true)
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (showAddMenu) return
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false)
    }, 150)
  }, [showAddMenu])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
      }
    }
  }, [])

  // Load templates when menu opens
  useEffect(() => {
    if (!showAddMenu) return
    if (!window.electronAPI?.templates) return
    let cancelled = false
    window.electronAPI.getWorkspacePath().then(ws => {
      if (cancelled) return
      window.electronAPI!.templates!.list(ws || '').then(res => {
        if (!cancelled && res.success) setTemplates(res.templates as TemplateListItem[])
      })
    })
    return () => { cancelled = true }
  }, [showAddMenu])

  // Close dropdown on outside click or Escape
  useEffect(() => {
    if (!showAddMenu) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        portalRef.current && !portalRef.current.contains(target) &&
        toolbarRef.current && !toolbarRef.current.contains(target)
      ) {
        setShowAddMenu(false)
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowAddMenu(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [showAddMenu])

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    deleteEdge(id)
  }, [deleteEdge, id])

  const toggleAddMenu = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setShowAddMenu(prev => {
      if (!prev && addBtnRef.current) {
        const rect = addBtnRef.current.getBoundingClientRect()
        setMenuPos({ x: rect.left + rect.width / 2, y: rect.bottom + 6 })
      }
      return !prev
    })
  }, [])

  const closeMenu = useCallback(() => {
    setShowAddMenu(false)
    setIsHovered(false)
  }, [])

  const handleAddNode = useCallback((nodeType: WorkflowNodeType) => {
    addNodeOnEdge(id, nodeType)
    closeMenu()
  }, [addNodeOnEdge, id, closeMenu])

  const handleInsertTemplate = useCallback(async (fileName: string, scope: 'workspace' | 'user') => {
    if (!window.electronAPI?.templates) return
    try {
      const workspacePath = await window.electronAPI.getWorkspacePath()
      if (!workspacePath) return

      const activeTab = useEditorStore.getState().tabs.find(
        t => t.id === useEditorStore.getState().activeTabId
      )
      const workflowFilePath = activeTab?.filePath

      const result = await window.electronAPI.templates.insert(workspacePath, fileName, scope, workflowFilePath)
      if (!result.success || !result.template) {
        useUIStore.getState().addToast(result.error || 'Failed to insert template', 'error')
        return
      }

      addNodeFromTemplate(result.template, { x: 0, y: 0 }, id)

      if (result.skippedFiles && result.skippedFiles.length > 0) {
        useUIStore.getState().addToast(
          `Template inserted. ${result.skippedFiles.length} file(s) already exist.`,
          'info'
        )
      }
    } catch (err) {
      console.error('[ActionEdge] Failed to insert template:', err)
      useUIStore.getState().addToast('Failed to insert template', 'error')
    }
    closeMenu()
  }, [addNodeFromTemplate, id, closeMenu])

  // Build flat menu items with separators (matching ContextMenu style)
  const menuItems: Array<{
    id: string
    label: string
    icon?: React.ComponentType<{ size?: number | string; style?: React.CSSProperties }>
    nodeType?: WorkflowNodeType
    onClick: () => void
    separator?: boolean
  }> = []

  NODE_TYPE_GROUPS.forEach((group, groupIdx) => {
    group.types.forEach(nodeType => {
      menuItems.push({
        id: `add-${nodeType.type}`,
        label: nodeType.label,
        icon: nodeType.icon,
        nodeType: nodeType.type,
        onClick: () => handleAddNode(nodeType.type),
      })
    })
    if (groupIdx < NODE_TYPE_GROUPS.length - 1) {
      menuItems.push({ id: `sep-${groupIdx}`, label: '', onClick: () => {}, separator: true })
    }
  })

  if (templates.length > 0) {
    menuItems.push({ id: 'sep-templates', label: '', onClick: () => {}, separator: true })
    for (const tpl of templates) {
      const regEntry = NODE_TYPE_REGISTRY[tpl.nodeType as WorkflowNodeType]
      menuItems.push({
        id: `tpl-${tpl.scope}-${tpl.fileName}`,
        label: tpl.name,
        icon: regEntry?.icon,
        nodeType: tpl.nodeType as WorkflowNodeType,
        onClick: () => handleInsertTemplate(tpl.fileName, tpl.scope),
      })
    }
  }

  return (
    <>
      {/* Visible edge path */}
      <BaseEdge path={edgePath} markerStart={markerStart} markerEnd={markerEnd} style={style} />

      {/* Invisible wider path for hover detection */}
      {!readOnly && (
        <path
          d={edgePath}
          fill="none"
          stroke="transparent"
          strokeWidth={20}
          style={{ pointerEvents: 'stroke' }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        />
      )}

      {/* Action buttons at midpoint */}
      {!readOnly && (isHovered || showAddMenu) && (
        <EdgeLabelRenderer>
          <div
            ref={toolbarRef}
            className="action-edge-toolbar"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <div className="action-edge-buttons">
              <button
                className="action-edge-btn action-edge-btn-delete"
                onClick={handleDelete}
                title="Delete connection"
              >
                <Trash2 size={12} />
              </button>
              <button
                ref={addBtnRef}
                className="action-edge-btn action-edge-btn-add"
                onClick={toggleAddMenu}
                title="Insert node"
              >
                <Plus size={12} />
              </button>
            </div>
          </div>
        </EdgeLabelRenderer>
      )}

      {/* Portal dropdown — same look as ContextMenu */}
      {showAddMenu && menuPos && createPortal(
        <div
          ref={portalRef}
          style={{
            position: 'fixed',
            left: menuPos.x,
            top: menuPos.y,
            transform: 'translateX(-50%)',
            zIndex: 10000,
            minWidth: 180,
            maxHeight: 320,
            overflowY: 'auto',
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            padding: '4px',
          }}
        >
          {menuItems.map(item => {
            if (item.separator) {
              return (
                <div
                  key={item.id}
                  style={{ height: 1, background: 'var(--border)', margin: '4px 0' }}
                />
              )
            }
            const Icon = item.icon
            const nodeColor = item.nodeType ? getNodeColor(item.nodeType) : undefined
            return (
              <button
                key={item.id}
                onClick={() => {
                  item.onClick()
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
                  textAlign: 'left' as const,
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--panel-2)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
              >
                {Icon && <Icon size={12} style={{ flexShrink: 0, color: nodeColor }} />}
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>,
        document.body
      )}
    </>
  )
})

ActionEdge.displayName = 'ActionEdge'

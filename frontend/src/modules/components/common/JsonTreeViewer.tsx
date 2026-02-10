/**
 * JsonTreeViewer - Interactive JSON tree explorer with click-to-copy and context menu
 *
 * Renders any JSON value as a collapsible tree with:
 * - Type badges (str, num, bool, null, arr, obj)
 * - Click to copy field path to clipboard
 * - Right-click context menu (Copy Path, Copy Value, Copy as Variable)
 * - Expand/collapse all toggle
 */

import { memo, useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronRight,
  ChevronDown,
  Copy,
  Braces,
  ChevronsUpDown,
  ChevronsDownUp,
} from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

export interface JsonTreeViewerProps {
  /** The JSON data to render */
  data: unknown
  /** Optional prefix for copied paths (e.g., "response" or "nodeId.output") */
  rootPath?: string
  /** Auto-expand depth (default: 2) */
  defaultExpandDepth?: number
  /** Max chars for string value preview (default: 80) */
  maxStringPreview?: number
  /** Callback when a path is copied */
  onCopyPath?: (path: string) => void
}

interface ContextMenuState {
  x: number
  y: number
  path: string
  value: unknown
}

// ============================================================================
// Type Detection & Formatting
// ============================================================================

type JsonType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null'

function getJsonType(value: unknown): JsonType {
  if (value === null || value === undefined) return 'null'
  if (Array.isArray(value)) return 'array'
  const t = typeof value
  if (t === 'string') return 'string'
  if (t === 'number' || t === 'bigint') return 'number'
  if (t === 'boolean') return 'boolean'
  if (t === 'object') return 'object'
  return 'string' // functions, symbols — render as string
}

const TYPE_BADGES: Record<JsonType, { label: string; color: string }> = {
  string:  { label: 'str',  color: '#a5d6a7' },
  number:  { label: 'num',  color: '#90caf9' },
  boolean: { label: 'bool', color: '#ffcc80' },
  null:    { label: 'null', color: '#ef9a9a' },
  array:   { label: 'arr',  color: '#ce93d8' },
  object:  { label: 'obj',  color: '#80cbc4' },
}

function formatPreview(value: unknown, maxLen: number): string {
  const type = getJsonType(value)
  switch (type) {
    case 'string': {
      const str = value as string
      return str.length > maxLen ? `"${str.slice(0, maxLen)}..."` : `"${str}"`
    }
    case 'number':
    case 'boolean':
      return String(value)
    case 'null':
      return 'null'
    case 'array':
      return `[${(value as unknown[]).length} items]`
    case 'object':
      return `{${Object.keys(value as object).length} keys}`
    default:
      return String(value)
  }
}

function buildPath(parentPath: string, key: string | number): string {
  if (!parentPath) {
    return typeof key === 'number' ? `[${key}]` : key
  }
  if (typeof key === 'number') {
    return `${parentPath}[${key}]`
  }
  // Use bracket notation if key has special characters
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) {
    return `${parentPath}.${key}`
  }
  return `${parentPath}["${key}"]`
}

// ============================================================================
// Context Menu (internal)
// ============================================================================

const TreeContextMenu = memo(function TreeContextMenu({
  x, y, path, value, onClose, onCopyPath,
}: ContextMenuState & { onClose: () => void; onCopyPath?: (path: string) => void }) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [copiedItem, setCopiedItem] = useState<string | null>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  // Adjust position to stay within viewport
  const adjustedPos = useMemo(() => {
    const pos = { x, y }
    const menuWidth = 200
    const menuHeight = 120
    if (pos.x + menuWidth > window.innerWidth) pos.x = window.innerWidth - menuWidth - 8
    if (pos.y + menuHeight > window.innerHeight) pos.y = window.innerHeight - menuHeight - 8
    return pos
  }, [x, y])

  const copyToClipboard = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopiedItem(label)
    onCopyPath?.(text)
    setTimeout(() => {
      onClose()
    }, 600)
  }, [onClose, onCopyPath])

  const valueStr = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? 'null')

  const items = [
    { id: 'path', label: copiedItem === 'path' ? 'Copied!' : 'Copy Path', icon: Copy, action: () => copyToClipboard(path, 'path') },
    { id: 'value', label: copiedItem === 'value' ? 'Copied!' : 'Copy Value', icon: Copy, action: () => copyToClipboard(valueStr, 'value') },
    { id: 'variable', label: copiedItem === 'variable' ? 'Copied!' : 'Copy as Variable', icon: Braces, action: () => copyToClipboard(`{{ ${path} }}`, 'variable') },
  ]

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: adjustedPos.x,
        top: adjustedPos.y,
        zIndex: 10001,
        minWidth: 180,
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        padding: '4px',
      }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.id}
            onClick={item.action}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 12px',
              background: 'none',
              border: 'none',
              borderRadius: 4,
              color: copiedItem === item.id ? 'var(--success, #22c55e)' : 'var(--foreground)',
              fontSize: '12px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--panel-2, rgba(255,255,255,0.05))' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
          >
            <Icon style={{ width: 13, height: 13, flexShrink: 0 }} />
            <span>{item.label}</span>
          </button>
        )
      })}
      <div style={{ padding: '4px 12px', borderTop: '1px solid var(--border)', marginTop: 2 }}>
        <div style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {path}
        </div>
      </div>
    </div>,
    document.body
  )
})

// ============================================================================
// Tree Node (recursive)
// ============================================================================

interface TreeNodeProps {
  keyName: string | number | null
  value: unknown
  path: string
  depth: number
  defaultExpandDepth: number
  maxStringPreview: number
  onContextMenu: (e: React.MouseEvent, path: string, value: unknown) => void
  onClickPath: (path: string) => void
}

const TreeNode = memo(function TreeNode({
  keyName,
  value,
  path,
  depth,
  defaultExpandDepth,
  maxStringPreview,
  onContextMenu,
  onClickPath,
}: TreeNodeProps) {
  const type = getJsonType(value)
  const isExpandable = type === 'object' || type === 'array'
  const isLongString = type === 'string' && (value as string).length > maxStringPreview
  const [isExpanded, setIsExpanded] = useState(depth < defaultExpandDepth)
  const [stringExpanded, setStringExpanded] = useState(false)
  const badge = TYPE_BADGES[type]
  const [flashCopied, setFlashCopied] = useState(false)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout>>()

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    }
  }, [])

  const childEntries = useMemo(() => {
    if (!isExpandable || !isExpanded) return []
    if (type === 'array') {
      return (value as unknown[]).map((v, i) => ({ key: i, value: v }))
    }
    return Object.entries(value as Record<string, unknown>).map(([k, v]) => ({ key: k, value: v }))
  }, [isExpandable, isExpanded, value, type])

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (isExpandable) {
      setIsExpanded(!isExpanded)
    } else if (isLongString) {
      setStringExpanded(!stringExpanded)
    } else {
      // Copy path for leaf nodes
      navigator.clipboard.writeText(path)
      onClickPath(path)
      setFlashCopied(true)
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
      flashTimerRef.current = setTimeout(() => setFlashCopied(false), 1200)
    }
  }, [isExpandable, isExpanded, isLongString, stringExpanded, path, onClickPath])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onContextMenu(e, path, value)
  }, [onContextMenu, path, value])

  return (
    <div style={{ marginLeft: depth > 0 ? 16 : 0 }}>
      {/* Node row */}
      <div
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 6px',
          borderRadius: 4,
          cursor: 'pointer',
          background: flashCopied ? 'color-mix(in srgb, var(--success, #22c55e) 15%, transparent)' : 'transparent',
          transition: 'background 0.15s',
          minHeight: 24,
        }}
        onMouseEnter={(e) => {
          if (!flashCopied) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
        }}
        onMouseLeave={(e) => {
          if (!flashCopied) e.currentTarget.style.background = 'transparent'
        }}
      >
        {/* Expand/collapse toggle */}
        {isExpandable || isLongString ? (
          <span style={{ width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {(isExpandable ? isExpanded : stringExpanded)
              ? <ChevronDown style={{ width: 12, height: 12, color: 'var(--muted)' }} />
              : <ChevronRight style={{ width: 12, height: 12, color: 'var(--muted)' }} />
            }
          </span>
        ) : (
          <span style={{ width: 14, flexShrink: 0 }} />
        )}

        {/* Key name */}
        {keyName !== null && (
          <span style={{
            color: 'var(--prompd-accent, #a5b4fc)',
            fontSize: '12px',
            fontFamily: 'var(--font-mono, monospace)',
            flexShrink: 0,
          }}>
            {typeof keyName === 'number' ? keyName : `"${keyName}"`}
            <span style={{ color: 'var(--muted)', margin: '0 2px' }}>:</span>
          </span>
        )}

        {/* Type badge */}
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '0 4px',
          borderRadius: 3,
          fontSize: '9px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          background: `${badge.color}20`,
          color: badge.color,
          flexShrink: 0,
          lineHeight: '16px',
        }}>
          {badge.label}
        </span>

        {/* Value preview (inline — for collapsed containers and non-expanded strings) */}
        {(!isExpandable || !isExpanded) && !(isLongString && stringExpanded) && (
          <span style={{
            color: type === 'string' ? '#a5d6a7'
              : type === 'number' ? '#90caf9'
              : type === 'boolean' ? '#ffcc80'
              : type === 'null' ? '#ef9a9a'
              : 'var(--muted)',
            fontSize: '12px',
            fontFamily: 'var(--font-mono, monospace)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            minWidth: 0,
          }}>
            {formatPreview(value, maxStringPreview)}
          </span>
        )}

        {/* Copy flash indicator */}
        {flashCopied && (
          <span style={{
            fontSize: '10px',
            color: 'var(--success, #22c55e)',
            flexShrink: 0,
            marginLeft: 'auto',
          }}>
            Copied!
          </span>
        )}
      </div>

      {/* Expanded string value */}
      {isLongString && stringExpanded && (
        <div
          style={{
            marginLeft: 22,
            marginTop: 2,
            marginBottom: 2,
            padding: '6px 10px',
            background: 'color-mix(in srgb, #a5d6a7 8%, transparent)',
            borderRadius: 4,
            borderLeft: '2px solid #a5d6a740',
            fontSize: '12px',
            fontFamily: 'var(--font-mono, monospace)',
            color: '#a5d6a7',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            lineHeight: 1.5,
            cursor: 'text',
            userSelect: 'text',
          }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={handleContextMenu}
        >
          {String(value)}
        </div>
      )}

      {/* Children */}
      {isExpandable && isExpanded && childEntries.length > 0 && (
        <div style={{ borderLeft: '1px solid var(--border)', marginLeft: 7 }}>
          {childEntries.map((entry) => (
            <TreeNode
              key={String(entry.key)}
              keyName={entry.key}
              value={entry.value}
              path={buildPath(path, entry.key)}
              depth={depth + 1}
              defaultExpandDepth={defaultExpandDepth}
              maxStringPreview={maxStringPreview}
              onContextMenu={onContextMenu}
              onClickPath={onClickPath}
            />
          ))}
        </div>
      )}
    </div>
  )
})

// ============================================================================
// Main JsonTreeViewer
// ============================================================================

export const JsonTreeViewer = memo(function JsonTreeViewer({
  data,
  rootPath = '',
  defaultExpandDepth = 2,
  maxStringPreview = 80,
  onCopyPath,
}: JsonTreeViewerProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [allExpanded, setAllExpanded] = useState(true)
  const [expandKey, setExpandKey] = useState(0)

  const handleContextMenu = useCallback((e: React.MouseEvent, path: string, value: unknown) => {
    setContextMenu({ x: e.clientX, y: e.clientY, path, value })
  }, [])

  const handleClickPath = useCallback((path: string) => {
    onCopyPath?.(path)
  }, [onCopyPath])

  const handleToggleAll = useCallback(() => {
    setAllExpanded(!allExpanded)
    setExpandKey(k => k + 1)
  }, [allExpanded])

  const type = getJsonType(data)

  return (
    <div style={{ fontSize: '13px', fontFamily: 'var(--font-mono, monospace)' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginBottom: 6,
        paddingBottom: 6,
        borderBottom: '1px solid var(--border)',
      }}>
        <button
          onClick={handleToggleAll}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 8px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            color: 'var(--muted)',
            fontSize: '11px',
            cursor: 'pointer',
          }}
          title={allExpanded ? 'Collapse all' : 'Expand all'}
        >
          {allExpanded
            ? <ChevronsDownUp style={{ width: 12, height: 12 }} />
            : <ChevronsUpDown style={{ width: 12, height: 12 }} />
          }
          {allExpanded ? 'Collapse All' : 'Expand All'}
        </button>
        <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
          {type === 'object' && `${Object.keys(data as object).length} keys`}
          {type === 'array' && `${(data as unknown[]).length} items`}
        </span>
        <span style={{ fontSize: '10px', color: 'var(--muted)', marginLeft: 'auto' }}>
          Click to copy path / Right-click for options
        </span>
      </div>

      {/* Tree */}
      <TreeNode
        key={expandKey}
        keyName={null}
        value={data}
        path={rootPath}
        depth={0}
        defaultExpandDepth={allExpanded ? 100 : 0}
        maxStringPreview={maxStringPreview}
        onContextMenu={handleContextMenu}
        onClickPath={handleClickPath}
      />

      {/* Context menu portal */}
      {contextMenu && (
        <TreeContextMenu
          {...contextMenu}
          onClose={() => setContextMenu(null)}
          onCopyPath={onCopyPath}
        />
      )}
    </div>
  )
})

// ============================================================================
// JSON Detection Utility
// ============================================================================

/**
 * Try to extract JSON from a response string.
 * Handles:
 * - Pure JSON responses
 * - JSON inside markdown code blocks (```json ... ```)
 */
export function extractJson(text: string): { parsed: unknown; isFullJson: boolean } | null {
  // Try parsing the entire string as JSON
  const trimmed = text.trim()
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      const parsed = JSON.parse(trimmed)
      return { parsed, isFullJson: true }
    } catch {
      // Not valid JSON, continue
    }
  }

  // Try extracting from markdown code block
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/)
  if (codeBlockMatch) {
    const content = codeBlockMatch[1].trim()
    try {
      const parsed = JSON.parse(content)
      return { parsed, isFullJson: false }
    } catch {
      // Not valid JSON in code block
    }
  }

  return null
}

/**
 * Try to resolve a value to a JSON-viewable object/array.
 * Returns the value directly if it's already an object/array,
 * or tries JSON.parse if it's a string that looks like JSON.
 * Returns null if the value isn't structured data.
 */
export function tryParseJsonValue(value: unknown): object | unknown[] | null {
  if (value !== null && value !== undefined && typeof value === 'object') {
    return value as object
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try { return JSON.parse(trimmed) } catch { /* not JSON */ }
    }
  }
  return null
}

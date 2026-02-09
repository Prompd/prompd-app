/**
 * NodePalette - Draggable sidebar for adding nodes to the workflow canvas
 *
 * All node metadata (labels, descriptions, icons, colors, categories) is
 * derived from the single-source-of-truth nodeTypeRegistry.
 */

import { useState, useMemo, useCallback } from 'react'
import { ChevronDown, ChevronRight, Search, X, Star } from 'lucide-react'
import type { WorkflowNodeType } from '../../services/workflowTypes'
import {
  NODE_TYPE_CATEGORIES,
  PALETTE_NODE_TYPES,
  NODE_TYPE_REGISTRY,
  type NodeTypeEntry,
} from '../../services/nodeTypeRegistry'

// Local storage key for favorites
const FAVORITES_STORAGE_KEY = 'workflow-node-favorites'

// Load favorites from localStorage
function loadFavorites(): WorkflowNodeType[] {
  try {
    const stored = localStorage.getItem(FAVORITES_STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

// Save favorites to localStorage
function saveFavorites(favorites: WorkflowNodeType[]): void {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites))
  } catch {
    // Ignore storage errors
  }
}

// Palette item type — same shape as NodeTypeEntry from the registry
type NodePaletteItem = NodeTypeEntry

// Derive palette items from the registry (only types that belong to a category)
const PALETTE_ITEMS: NodePaletteItem[] = PALETTE_NODE_TYPES
  .map(t => NODE_TYPE_REGISTRY[t])
  .filter((e): e is NodeTypeEntry => !!e)

interface PaletteItemProps {
  item: NodePaletteItem
  isFavorite: boolean
  onToggleFavorite: (type: WorkflowNodeType) => void
}

function PaletteItem({ item, isFavorite, onToggleFavorite }: PaletteItemProps) {
  const Icon = item.icon

  const handleDragStart = (event: React.DragEvent) => {
    event.dataTransfer.setData('application/workflow-node', item.type)
    event.dataTransfer.effectAllowed = 'move'
  }

  const handleDragEnd = () => {
    // Drag operation completed
  }

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    onToggleFavorite(item.type)
  }

  return (
    <div
      draggable={true}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className="palette-node"
      data-node-type={item.colorVar}
      style={{
        padding: '10px 12px',
        borderRadius: '6px',
        border: '1px solid var(--border)',
        background: 'var(--panel)',
        cursor: 'grab',
        transition: 'box-shadow 0.2s, transform 0.1s',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <Icon style={{ width: '16px', height: '16px', color: `var(--node-${item.colorVar}, var(--accent))` }} />
        <span style={{ fontWeight: 500, fontSize: '13px', color: 'var(--text)', flex: 1 }}>
          {item.label}
        </span>
        <button
          onClick={handleFavoriteClick}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: isFavorite ? 'var(--warning, #f59e0b)' : 'var(--muted)',
            opacity: isFavorite ? 1 : 0.5,
            transition: 'opacity 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = isFavorite ? '1' : '0.5' }}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Star style={{ width: 12, height: 12, fill: isFavorite ? 'currentColor' : 'none' }} />
        </button>
      </div>
      <p style={{ fontSize: '11px', color: 'var(--muted)', margin: 0 }}>
        {item.description}
      </p>
    </div>
  )
}

interface CollapsibleSectionProps {
  title: string
  nodeTypes: WorkflowNodeType[]
  defaultExpanded?: boolean
  filter?: string
  favorites: WorkflowNodeType[]
  onToggleFavorite: (type: WorkflowNodeType) => void
}

function CollapsibleSection({ title, nodeTypes, defaultExpanded = false, filter = '', favorites, onToggleFavorite }: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  // Filter items based on search term
  const items = useMemo(() => {
    const typeFiltered = PALETTE_ITEMS.filter(i => nodeTypes.includes(i.type))
    if (!filter) return typeFiltered
    const lowerFilter = filter.toLowerCase()
    return typeFiltered.filter(i =>
      i.label.toLowerCase().includes(lowerFilter) ||
      i.description.toLowerCase().includes(lowerFilter) ||
      i.type.toLowerCase().includes(lowerFilter)
    )
  }, [nodeTypes, filter])

  // Auto-expand when filtering and there are matches
  const shouldShow = filter ? items.length > 0 : true
  const effectiveExpanded = filter ? items.length > 0 : isExpanded

  if (!shouldShow) return null

  return (
    <div style={{ marginBottom: '8px' }}>
      <button
        onClick={() => !filter && setIsExpanded(!isExpanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          width: '100%',
          padding: '4px 0',
          border: 'none',
          background: 'transparent',
          cursor: filter ? 'default' : 'pointer',
          marginBottom: effectiveExpanded ? '8px' : '0',
        }}
      >
        {!filter && (
          effectiveExpanded ? (
            <ChevronDown style={{ width: 12, height: 12, color: 'var(--muted)' }} />
          ) : (
            <ChevronRight style={{ width: 12, height: 12, color: 'var(--muted)' }} />
          )
        )}
        <h4 style={{
          fontSize: '10px',
          fontWeight: 600,
          color: 'var(--muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          margin: 0,
          marginLeft: filter ? '16px' : 0,
        }}>
          {title}
        </h4>
        <span style={{
          fontSize: '9px',
          color: 'var(--muted)',
          marginLeft: 'auto',
          opacity: 0.7,
        }}>
          {items.length}
        </span>
      </button>
      {effectiveExpanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {items.map(item => (
            <PaletteItem
              key={item.type}
              item={item}
              isFavorite={favorites.includes(item.type)}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function NodePalette() {
  const [filter, setFilter] = useState('')
  const [favorites, setFavorites] = useState<WorkflowNodeType[]>(() => loadFavorites())

  const toggleFavorite = useCallback((type: WorkflowNodeType) => {
    setFavorites(prev => {
      const newFavorites = prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
      saveFavorites(newFavorites)
      return newFavorites
    })
  }, [])

  // Get favorite items for the Favorites section
  const favoriteItems = useMemo(() => {
    return PALETTE_ITEMS.filter(i => favorites.includes(i.type))
  }, [favorites])

  // Filter favorite items based on search
  const filteredFavoriteItems = useMemo(() => {
    if (!filter) return favoriteItems
    const lowerFilter = filter.toLowerCase()
    return favoriteItems.filter(i =>
      i.label.toLowerCase().includes(lowerFilter) ||
      i.description.toLowerCase().includes(lowerFilter) ||
      i.type.toLowerCase().includes(lowerFilter)
    )
  }, [favoriteItems, filter])

  return (
    <div
      className="node-palette"
      style={{
        width: '250px',
        height: '100%',
        borderRight: '1px solid var(--border)',
        background: 'var(--panel-2)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{
        padding: '12px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <h3 style={{
          fontWeight: 600,
          fontSize: '13px',
          color: 'var(--text)',
          margin: 0,
        }}>
          Node Palette
        </h3>
        <p style={{
          fontSize: '11px',
          color: 'var(--muted)',
          marginTop: '4px',
          marginBottom: 0,
        }}>
          Drag nodes onto the canvas
        </p>
      </div>

      {/* Search filter */}
      <div style={{
        padding: '8px 12px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 10px',
          background: 'var(--bg)',
          borderRadius: '6px',
          border: '1px solid var(--border)',
        }}>
          <Search style={{ width: 14, height: 14, color: 'var(--muted)', flexShrink: 0 }} />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter nodes..."
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              outline: 'none',
              fontSize: '12px',
              color: 'var(--text)',
            }}
          />
          {filter && (
            <button
              onClick={() => setFilter('')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--muted)',
              }}
            >
              <X style={{ width: 14, height: 14 }} />
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto', flex: 1 }}>
        {/* Favorites section - only show if there are favorites */}
        {filteredFavoriteItems.length > 0 && (
          <div style={{ marginBottom: '8px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 0',
                marginBottom: '8px',
              }}
            >
              <Star style={{ width: 12, height: 12, color: 'var(--warning, #f59e0b)' }} />
              <h4 style={{
                fontSize: '10px',
                fontWeight: 600,
                color: 'var(--warning, #f59e0b)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                margin: 0,
              }}>
                Favorites
              </h4>
              <span style={{
                fontSize: '9px',
                color: 'var(--muted)',
                marginLeft: 'auto',
                opacity: 0.7,
              }}>
                {filteredFavoriteItems.length}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {filteredFavoriteItems.map(item => (
                <PaletteItem
                  key={`fav-${item.type}`}
                  item={item}
                  isFavorite={true}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
            </div>
          </div>
        )}

        {/* Separator if we have favorites */}
        {filteredFavoriteItems.length > 0 && !filter && (
          <div style={{
            height: '1px',
            background: 'var(--border)',
            margin: '4px 0 8px 0',
          }} />
        )}

        {NODE_TYPE_CATEGORIES.map(cat => (
          <CollapsibleSection
            key={cat.key}
            title={cat.paletteLabel}
            nodeTypes={cat.types}
            filter={filter}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
          />
        ))}
      </div>
    </div>
  )
}

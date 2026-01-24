/**
 * NodePalette - Draggable sidebar for adding nodes to the workflow canvas
 */

import { useState, useMemo, useCallback } from 'react'
import type { LucideIcon } from 'lucide-react'
import { MessageSquare, GitBranch, Repeat, GitFork, Combine, Wand2, Globe, Flag, Eye, Cpu, UserCircle, Wrench, ScanSearch, Bot, Play, Route, AlertTriangle, Terminal, Server, Workflow, Plug, ChevronDown, ChevronRight, Search, X, Star, FileCode, ShieldCheck, MessagesSquare, Database } from 'lucide-react'
import type { WorkflowNodeType } from '../../services/workflowTypes'

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

interface NodePaletteItem {
  type: WorkflowNodeType
  label: string
  description: string
  icon: LucideIcon
  colorVar: string // CSS variable suffix for theming
}

const PALETTE_ITEMS: NodePaletteItem[] = [
  // === Entry & Exit ===
  {
    type: 'trigger',
    label: 'Trigger',
    description: 'Workflow entry point',
    icon: Play,
    colorVar: 'green',
  },
  {
    type: 'output',
    label: 'Output',
    description: 'Workflow final output',
    icon: Flag,
    colorVar: 'green',
  },

  // === AI & Prompts ===
  {
    type: 'prompt',
    label: 'Prompt',
    description: 'Execute a .prmd file',
    icon: MessageSquare,
    colorVar: 'purple',
  },
  {
    type: 'provider',
    label: 'Provider',
    description: 'LLM provider & model config',
    icon: Cpu,
    colorVar: 'rose',
  },
  {
    type: 'agent',
    label: 'AI Agent',
    description: 'Autonomous agent with tools',
    icon: Bot,
    colorVar: 'indigo',
  },
  {
    type: 'chat-agent',
    label: 'Chat Agent',
    description: 'Input + Guard + Agent + Tools',
    icon: MessagesSquare,
    colorVar: 'indigo',
  },
  {
    type: 'claude-code',
    label: 'Claude Code',
    description: 'Claude Code agent (local/SSH)',
    icon: Server,
    colorVar: 'violet',
  },
  {
    type: 'guardrail',
    label: 'Guardrail',
    description: 'Validate input with pass/reject',
    icon: ShieldCheck,
    colorVar: 'amber',
  },

  // === Tools & Execution ===
  {
    type: 'tool',
    label: 'Tool',
    description: 'Unified tool execution',
    icon: Wrench,
    colorVar: 'orange',
  },
  {
    type: 'command',
    label: 'Command',
    description: 'Execute shell commands',
    icon: Terminal,
    colorVar: 'slate',
  },
  {
    type: 'code',
    label: 'Code',
    description: 'Run TS/Python/C# snippets',
    icon: FileCode,
    colorVar: 'blue',
  },
  {
    type: 'api',
    label: 'HTTP Request',
    description: 'Make REST API calls',
    icon: Globe,
    colorVar: 'blue',
  },
  {
    type: 'mcp-tool',
    label: 'MCP Tool',
    description: 'External MCP server tool',
    icon: Plug,
    colorVar: 'cyan',
  },

  // === Tool Utilities (for Agent tool routing) ===
  {
    type: 'tool-call-parser',
    label: 'Tool Parser',
    description: 'Parse LLM tool call output',
    icon: ScanSearch,
    colorVar: 'cyan',
  },
  {
    type: 'tool-call-router',
    label: 'Tool Router',
    description: 'Route tool calls to handlers',
    icon: Route,
    colorVar: 'teal',
  },

  // === Control Flow ===
  {
    type: 'condition',
    label: 'Condition',
    description: 'Branch based on expression',
    icon: GitBranch,
    colorVar: 'amber',
  },
  {
    type: 'loop',
    label: 'Loop',
    description: 'Iterate over items or count',
    icon: Repeat,
    colorVar: 'cyan',
  },
  {
    type: 'parallel',
    label: 'Parallel',
    description: 'Execute branches concurrently',
    icon: GitFork,
    colorVar: 'indigo',
  },
  {
    type: 'merge',
    label: 'Merge',
    description: 'Combine parallel results',
    icon: Combine,
    colorVar: 'emerald',
  },

  // === Data Transform ===
  {
    type: 'transformer',
    label: 'Transform',
    description: 'Transform data with template',
    icon: Wand2,
    colorVar: 'orange',
  },
  {
    type: 'memory',
    label: 'Memory',
    description: 'KV store, conversation, or cache',
    icon: Database,
    colorVar: 'emerald',
  },

  // === Interaction & Debug ===
  {
    type: 'user-input',
    label: 'User Input',
    description: 'Pause for user input',
    icon: UserCircle,
    colorVar: 'violet',
  },
  {
    type: 'callback',
    label: 'Checkpoint',
    description: 'Log, pause, approve, or notify',
    icon: Eye,
    colorVar: 'amber',
  },
  {
    type: 'error-handler',
    label: 'Error Handler',
    description: 'Configure error handling',
    icon: AlertTriangle,
    colorVar: 'rose',
  },

  // === Composition ===
  {
    type: 'workflow',
    label: 'Sub-Workflow',
    description: 'Invoke another .pdflow',
    icon: Workflow,
    colorVar: 'teal',
  },
]

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

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleFavorite(item.type)
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
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
        userSelect: 'none',
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
        <span style={{ fontWeight: 500, fontSize: '13px', color: 'var(--text)', flex: 1, userSelect: 'none' }}>
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
      <p style={{ fontSize: '11px', color: 'var(--muted)', margin: 0, userSelect: 'none' }}>
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
        width: '220px',
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

        <CollapsibleSection
          title="Entry & Exit"
          nodeTypes={['trigger', 'output']}
          filter={filter}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
        />

        <CollapsibleSection
          title="AI & Prompts"
          nodeTypes={['prompt', 'provider', 'agent', 'chat-agent', 'claude-code', 'guardrail']}
          filter={filter}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
        />

        <CollapsibleSection
          title="Tools & Execution"
          nodeTypes={['tool', 'command', 'code', 'api', 'mcp-tool']}
          filter={filter}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
        />

        <CollapsibleSection
          title="Tool Routing"
          nodeTypes={['tool-call-parser', 'tool-call-router']}
          filter={filter}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
        />

        <CollapsibleSection
          title="Control Flow"
          nodeTypes={['condition', 'loop', 'parallel', 'merge']}
          filter={filter}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
        />

        <CollapsibleSection
          title="Data"
          nodeTypes={['transformer', 'memory']}
          filter={filter}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
        />

        <CollapsibleSection
          title="Interaction & Debug"
          nodeTypes={['user-input', 'callback', 'error-handler']}
          filter={filter}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
        />

        <CollapsibleSection
          title="Composition"
          nodeTypes={['workflow']}
          filter={filter}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
        />
      </div>
    </div>
  )
}

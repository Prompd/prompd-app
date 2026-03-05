import { Tab } from '../types'
import { Sparkles, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState, useEffect, useRef, useCallback } from 'react'

type Props = {
  tabs: Tab[]
  activeTabId: string | null
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onCloseAll?: () => void
  onSave?: (id: string) => void
  onSaveAs?: (id: string) => void
  onReorder?: (fromIndex: number, toIndex: number) => void
}

export default function TabsBar({ tabs, activeTabId, onActivate, onClose, onCloseAll, onSave, onSaveAs, onReorder }: Props) {
  const [showDetailsFor, setShowDetailsFor] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tabId: string } | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const draggedIndexRef = useRef<number | null>(null)
  const tabsRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  // Close context menu when clicking outside
  useEffect(() => {
    if (!contextMenu) return

    const handleClickOutside = (e: MouseEvent) => {
      setContextMenu(null)
    }

    // Add listener on next tick to avoid closing immediately
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('click', handleClickOutside)
    }
  }, [contextMenu])

  // Check if tabs overflow and update scroll button visibility
  const updateScrollButtons = useCallback(() => {
    const container = tabsRef.current
    if (!container) return

    const { scrollLeft, scrollWidth, clientWidth } = container
    setCanScrollLeft(scrollLeft > 0)
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1)
  }, [])

  // Update scroll buttons on mount, resize, and tab changes
  useEffect(() => {
    updateScrollButtons()

    const container = tabsRef.current
    if (!container) return

    container.addEventListener('scroll', updateScrollButtons)
    window.addEventListener('resize', updateScrollButtons)

    return () => {
      container.removeEventListener('scroll', updateScrollButtons)
      window.removeEventListener('resize', updateScrollButtons)
    }
  }, [tabs, updateScrollButtons])

  // Scroll active tab into view when it changes
  useEffect(() => {
    if (!activeTabId || !tabsRef.current) return

    const activeTabElement = tabsRef.current.querySelector(`[data-tab-id="${activeTabId}"]`) as HTMLElement
    if (activeTabElement) {
      activeTabElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    }
  }, [activeTabId])

  const scrollTabs = useCallback((direction: 'left' | 'right') => {
    const container = tabsRef.current
    if (!container) return

    const scrollAmount = 200
    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    })
  }, [])

  if (!tabs || tabs.length === 0) {
    return <div className="tabs-container"><div className="tabs" /></div>
  }

  // Extract just the filename from a path
  const getFileName = (path: string) => {
    const parts = path.split('/')
    return parts[parts.length - 1] || path
  }

  const handleAiIconClick = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation()
    setShowDetailsFor(tabId)
  }

  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, tabId })
  }

  const handleContextMenuAction = (action: 'save' | 'saveAs' | 'close' | 'closeAll', tabId: string) => {
    setContextMenu(null)
    switch (action) {
      case 'save':
        onSave?.(tabId)
        break
      case 'saveAs':
        onSaveAs?.(tabId)
        break
      case 'close':
        onClose(tabId)
        break
      case 'closeAll':
        onCloseAll?.()
        break
    }
  }

  return (
    <>
      <div className="tabs-container">
        <button
          className={`tabs-scroll-btn ${canScrollLeft ? 'visible' : ''}`}
          onClick={() => scrollTabs('left')}
          title="Scroll tabs left"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="tabs" ref={tabsRef}>
          {tabs.map((t, index) => (
            <div
              key={t.id}
              data-tab-id={t.id}
              className={'tab ' + (t.id === activeTabId ? 'active' : '') + (dragOverIndex === index ? ' drag-over' : '')}
              onClick={() => onActivate(t.id)}
              onContextMenu={(e) => handleContextMenu(e, t.id)}
              draggable={!!onReorder}
              onDragStart={(e) => {
                if (!onReorder) return
                draggedIndexRef.current = index
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', String(index))
                // Add dragging class after a short delay to avoid visual glitch
                setTimeout(() => {
                  e.currentTarget.classList.add('dragging')
                }, 0)
              }}
              onDragEnd={(e) => {
                e.currentTarget.classList.remove('dragging')
                draggedIndexRef.current = null
                setDragOverIndex(null)
              }}
              onDragOver={(e) => {
                if (!onReorder || draggedIndexRef.current === null) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (dragOverIndex !== index) {
                  setDragOverIndex(index)
                }
              }}
              onDragLeave={() => {
                setDragOverIndex(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (!onReorder || draggedIndexRef.current === null) return
                const fromIndex = draggedIndexRef.current
                const toIndex = index
                if (fromIndex !== toIndex) {
                  onReorder(fromIndex, toIndex)
                }
                draggedIndexRef.current = null
                setDragOverIndex(null)
              }}
            >
              <span className="name" title={t.name}>
                {getFileName(t.name)}
                {t.readOnly && <span style={{ marginLeft: '4px', fontSize: '10px', opacity: 0.6 }}>(readonly)</span>}
              </span>
              {t.aiGeneration && (
                <span
                  className="ai-indicator"
                  title="Generated with AI - Click for details"
                  onClick={(e) => handleAiIconClick(e, t.id)}
                  style={{
                    marginLeft: '6px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    cursor: 'pointer',
                    opacity: 0.7,
                    transition: 'opacity 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                >
                  <Sparkles size={14} style={{ color: 'var(--accent)' }} />
                </span>
              )}
              {t.dirty ? <span className="dirty" title="Unsaved changes">•</span> : null}
              <button className="close" title="Close tab" aria-label={`Close ${getFileName(t.name)}`} onClick={(e) => { e.stopPropagation(); onClose(t.id) }}>✕</button>
            </div>
          ))}
        </div>
        <button
          className={`tabs-scroll-btn ${canScrollRight ? 'visible' : ''}`}
          onClick={() => scrollTabs('right')}
          title="Scroll tabs right"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {showDetailsFor && (() => {
        const tab = tabs.find(t => t.id === showDetailsFor)
        if (!tab || !tab.aiGeneration) return null

        return (
          <AiGenerationDetailsModal
            metadata={tab.aiGeneration}
            onClose={() => setShowDetailsFor(null)}
          />
        )
      })()}

      {contextMenu && (() => {
        // Find the tab to check its type
        const contextTab = tabs.find(t => t.id === contextMenu.tabId)
        const isNonSaveableTab = contextTab?.type === 'chat' || contextTab?.type === 'execution' || contextTab?.type === 'brainstorm'

        return (
        <div
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            background: 'var(--panel)',
            border: '1px solid rgba(71, 85, 105, 0.3)', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15), 0 0 12px rgba(99, 102, 241, 0.15)',
            zIndex: 10000,
            minWidth: '140px',
            padding: '4px 0'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {onSave && !isNonSaveableTab && (
            <button
              onClick={() => handleContextMenuAction('save', contextMenu.tabId)}
              style={{
                width: '100%',
                padding: '8px 16px',
                background: 'none',
                border: 'none',
                borderTop: '1px solid transparent',
                borderBottom: '1px solid transparent',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: '13px',
                color: 'var(--text)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--hover)'
                e.currentTarget.style.borderTopColor = 'var(--accent)'
                e.currentTarget.style.borderBottomColor = 'var(--accent)'
                e.currentTarget.style.color = 'var(--accent)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none'
                e.currentTarget.style.borderTopColor = 'transparent'
                e.currentTarget.style.borderBottomColor = 'transparent'
                e.currentTarget.style.color = 'var(--text)'
              }}
            >
              Save
              <span style={{ marginLeft: 'auto', fontSize: '11px', opacity: 0.6 }}>Ctrl+S</span>
            </button>
          )}
          {onSaveAs && !isNonSaveableTab && (
            <button
              onClick={() => handleContextMenuAction('saveAs', contextMenu.tabId)}
              style={{
                width: '100%',
                padding: '8px 16px',
                background: 'none',
                border: 'none',
                borderTop: '1px solid transparent',
                borderBottom: '1px solid transparent',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: '13px',
                color: 'var(--text)',
                display: 'flex',
                alignItems: 'center',
                transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--hover)'
                e.currentTarget.style.borderTopColor = 'var(--accent)'
                e.currentTarget.style.borderBottomColor = 'var(--accent)'
                e.currentTarget.style.color = 'var(--accent)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none'
                e.currentTarget.style.borderTopColor = 'transparent'
                e.currentTarget.style.borderBottomColor = 'transparent'
                e.currentTarget.style.color = 'var(--text)'
              }}
            >
              Save As...
            </button>
          )}
          {/* Only show divider if save options were shown */}
          {!isNonSaveableTab && <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }} />}
          <button
            onClick={() => handleContextMenuAction('close', contextMenu.tabId)}
            style={{
              width: '100%',
              padding: '8px 16px',
              background: 'none',
              border: 'none',
              borderTop: '1px solid transparent',
              borderBottom: '1px solid transparent',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: '13px',
              color: 'var(--text)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--hover)'
              e.currentTarget.style.borderTopColor = 'var(--accent)'
              e.currentTarget.style.borderBottomColor = 'var(--accent)'
              e.currentTarget.style.color = 'var(--accent)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none'
              e.currentTarget.style.borderTopColor = 'transparent'
              e.currentTarget.style.borderBottomColor = 'transparent'
              e.currentTarget.style.color = 'var(--text)'
            }}
          >
            Close
            <span style={{ marginLeft: 'auto', fontSize: '11px', opacity: 0.6 }}>Ctrl+W</span>
          </button>
          {onCloseAll && tabs.length > 1 && (
            <button
              onClick={() => handleContextMenuAction('closeAll', contextMenu.tabId)}
              style={{
                width: '100%',
                padding: '8px 16px',
                background: 'none',
                border: 'none',
                borderTop: '1px solid transparent',
                borderBottom: '1px solid transparent',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: '13px',
                color: 'var(--text)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--hover)'
                e.currentTarget.style.borderTopColor = 'var(--accent)'
                e.currentTarget.style.borderBottomColor = 'var(--accent)'
                e.currentTarget.style.color = 'var(--accent)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none'
                e.currentTarget.style.borderTopColor = 'transparent'
                e.currentTarget.style.borderBottomColor = 'transparent'
                e.currentTarget.style.color = 'var(--text)'
              }}
            >
              Close All
            </button>
          )}
        </div>
        )
      })()}
    </>
  )
}

function AiGenerationDetailsModal({ metadata, onClose }: { metadata: any; onClose: () => void }) {
  const formatDate = (isoString: string) => {
    const date = new Date(isoString)
    return date.toLocaleString()
  }

  const formatCost = (cost: number | undefined) => {
    if (!cost) return 'N/A'
    return `$${cost.toFixed(4)}`
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        backdropFilter: 'blur(4px)'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          width: '90%',
          maxWidth: '600px',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: '1px solid var(--border)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Sparkles size={24} style={{ color: 'var(--accent)' }} />
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>AI Generation Details</h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              color: 'var(--text-secondary)',
              fontSize: '20px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px' }}>
          {/* Request Details */}
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600 }}>Request</h3>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Description
              </label>
              <div style={{ padding: '8px 12px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '14px' }}>
                {metadata.description}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Complexity
                </label>
                <div style={{ padding: '8px 12px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '14px', textTransform: 'capitalize' }}>
                  {metadata.complexity}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Include Examples
                </label>
                <div style={{ padding: '8px 12px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '14px' }}>
                  {metadata.includeExamples ? 'Yes' : 'No'}
                </div>
              </div>
            </div>

            <div style={{ marginTop: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Generated At
              </label>
              <div style={{ padding: '8px 12px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '14px' }}>
                {formatDate(metadata.timestamp)}
              </div>
            </div>
          </div>

          {/* Response Metadata */}
          {metadata.responseMetadata && (
            <div>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 600 }}>Response</h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Model
                  </label>
                  <div style={{ padding: '8px 12px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '14px' }}>
                    {metadata.responseMetadata.model || 'N/A'}
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Duration
                  </label>
                  <div style={{ padding: '8px 12px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '14px' }}>
                    {metadata.responseMetadata.durationMs ? `${(metadata.responseMetadata.durationMs / 1000).toFixed(2)}s` : 'N/A'}
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Tokens Used
                  </label>
                  <div style={{ padding: '8px 12px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '14px' }}>
                    {metadata.responseMetadata.tokensUsed?.total?.toLocaleString() || 'N/A'}
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Estimated Cost
                  </label>
                  <div style={{ padding: '8px 12px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '14px' }}>
                    {formatCost(metadata.responseMetadata.estimatedCost)}
                  </div>
                </div>
              </div>

              {metadata.responseMetadata.tokensUsed && (
                <div style={{ marginTop: '12px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Token Breakdown
                  </label>
                  <div style={{ padding: '8px 12px', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px' }}>
                    Input: {metadata.responseMetadata.tokensUsed.input?.toLocaleString() || 0} •
                    Output: {metadata.responseMetadata.tokensUsed.output?.toLocaleString() || 0}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

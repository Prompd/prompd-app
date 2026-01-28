import React, { useRef, useState, useEffect, useCallback } from 'react'

/**
 * ContentMinimap - A Monaco-style minimap showing visual overview of content
 * Shows colored bars representing different content sections with click-to-scroll
 * Positioned next to the scrollbar, wider like a code minimap
 *
 * Used by:
 * - CompiledPreview: Shows parameters, XML elements, markdown headings
 * - DesignView: Shows metadata fields, parameters, content sections
 */

export interface MinimapSection {
  id: string
  type: 'metadata' | 'params' | 'content' | 'heading' | 'element' | 'text' | 'comment'
  label: string
  depth?: number
}

interface ContentMinimapProps {
  /** Sections to display in the minimap */
  sections: MinimapSection[]
  /** Theme for styling */
  theme: 'light' | 'dark'
  /** Container ref for height tracking - the element that contains the minimap */
  containerRef: React.RefObject<HTMLDivElement>
  /** Callback when a section is clicked - should scroll to that section */
  onScrollToSection: (sectionId: string) => void
}

export function ContentMinimap({ sections, theme, containerRef, onScrollToSection }: ContentMinimapProps) {
  const isDark = theme === 'dark'
  const minimapRef = useRef<HTMLDivElement>(null)
  const [containerHeight, setContainerHeight] = useState(200)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Track container height
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateHeight = () => {
      setContainerHeight(container.clientHeight)
    }

    updateHeight()
    const resizeObserver = new ResizeObserver(updateHeight)
    resizeObserver.observe(container)

    return () => resizeObserver.disconnect()
  }, [containerRef])

  // Calculate dimensions - scale to fit available height
  const availableHeight = Math.max(100, containerHeight - 16)
  const baseLineHeight = 7   // Moderate height
  const baseGap = 2          // Gap between items
  const naturalHeight = sections.length * (baseLineHeight + baseGap)
  const scale = naturalHeight > availableHeight ? availableHeight / naturalHeight : 1
  const lineHeight = Math.max(4, baseLineHeight * scale)
  const gap = Math.max(1, baseGap * scale)

  const handleSectionClick = useCallback((e: React.MouseEvent, sectionId: string) => {
    e.stopPropagation()
    onScrollToSection(sectionId)
  }, [onScrollToSection])

  if (sections.length === 0) return null

  // Color scheme based on section type - matching Monaco minimap style
  const getColor = (type: MinimapSection['type']) => {
    switch (type) {
      case 'metadata':
        return isDark ? '#60a5fa' : '#3b82f6' // blue
      case 'params':
        return isDark ? '#fbbf24' : '#d97706' // amber/yellow
      case 'heading':
        return isDark ? '#4ade80' : '#16a34a' // green
      case 'element':
        return isDark ? '#c084fc' : '#9333ea' // purple
      case 'text':
        return isDark ? '#64748b' : '#94a3b8' // gray
      case 'comment':
        return isDark ? '#475569' : '#cbd5e1' // muted gray
      case 'content':
      default:
        return isDark ? '#94a3b8' : '#64748b' // gray
    }
  }

  // Width based on depth - root items span full width, nested items get smaller
  const getWidth = (type: MinimapSection['type'], depth: number) => {
    // Main headers (metadata, params, content) at depth 0 get full width (~92px to leave room for glow)
    if (depth === 0 && (type === 'params' || type === 'metadata' || type === 'content')) {
      return 92
    }
    // Other root items get slightly less
    if (depth === 0) {
      return 88
    }
    // Nested items get progressively smaller (min 20px)
    // depth 1: 70px, depth 2: 55px, depth 3: 40px, depth 4+: 28px
    const nestedWidth = 85 - depth * 15
    return Math.max(28, nestedWidth)
  }

  const getOpacity = (type: MinimapSection['type'], isHovered: boolean) => {
    if (isHovered) return 1
    switch (type) {
      case 'metadata':
      case 'params':
      case 'element':
      case 'content':
        return 0.85
      case 'heading':
        return 0.75
      default:
        return 0.5
    }
  }

  return (
    <div
      ref={minimapRef}
      style={{
        position: 'absolute',
        top: 0,
        right: '14px',  // Leave room for scrollbar
        bottom: 0,
        width: '110px',  // Wider minimap
        background: 'var(--bg)',
        borderLeft: '1px solid var(--border)',
        padding: '8px 8px',
        overflowY: 'auto',
        overflowX: 'hidden',
        zIndex: 10,
        backdropFilter: 'blur(2px)'
      }}
      className="content-minimap-scroll"
    >
      {/* Section bars - aligned to the right */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: `${gap}px`, width: '100%' }}>
        {sections.map((section) => {
          const depth = section.depth || 0
          const width = getWidth(section.type, depth)
          const color = getColor(section.type)
          const isHovered = hoveredId === section.id
          const opacity = getOpacity(section.type, isHovered)

          return (
            <div
              key={section.id}
              onClick={(e) => handleSectionClick(e, section.id)}
              onMouseEnter={() => setHoveredId(section.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                height: `${lineHeight}px`,
                width: `${width}px`,
                background: color,
                opacity,
                borderRadius: '2px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                flexShrink: 0,
                boxShadow: isHovered ? `0 0 0 1px ${color}` : 'none',
                transform: isHovered ? 'scaleY(1.3)' : 'scaleY(1)'
              }}
              title={section.label}
            />
          )
        })}
      </div>

      {/* Tooltip for hovered item */}
      {hoveredId && (
        <div
          style={{
            position: 'fixed',
            right: '100px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: isDark ? '#1e293b' : '#ffffff',
            border: `1px solid ${isDark ? 'rgba(71, 85, 105, 0.4)' : '#e2e8f0'}`,
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '11px',
            color: isDark ? '#e2e8f0' : '#334155',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 1000,
            boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.1)',
            display: 'none' // Hide for now, can enable later
          }}
        >
          {sections.find(s => s.id === hoveredId)?.label}
        </div>
      )}

      {/* Hide scrollbar but keep functionality */}
      <style>{`
        .content-minimap-scroll::-webkit-scrollbar {
          width: 4px;
        }
        .content-minimap-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .content-minimap-scroll::-webkit-scrollbar-thumb {
          background: ${isDark ? 'rgba(71, 85, 105, 0.3)' : 'rgba(203, 213, 225, 0.5)'};
          border-radius: 2px;
        }
        .content-minimap-scroll::-webkit-scrollbar-thumb:hover {
          background: ${isDark ? 'rgba(71, 85, 105, 0.5)' : 'rgba(203, 213, 225, 0.8)'};
        }
        .content-minimap-scroll {
          scrollbar-width: thin;
          scrollbar-color: ${isDark ? 'rgba(71, 85, 105, 0.3) transparent' : 'rgba(203, 213, 225, 0.5) transparent'};
        }
      `}</style>
    </div>
  )
}

export default ContentMinimap

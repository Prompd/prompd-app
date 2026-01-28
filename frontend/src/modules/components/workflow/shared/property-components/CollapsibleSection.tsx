/**
 * CollapsibleSection - Reusable expandable/collapsible section with header
 * Used throughout property panels for organizing related fields
 */

import { ReactNode } from 'react'
import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react'

export interface CollapsibleSectionProps {
  /** Unique identifier for this section */
  id: string
  /** Section title */
  title: string
  /** Icon component to display */
  icon: LucideIcon
  /** Whether this section is currently expanded */
  isExpanded: boolean
  /** Called when header is clicked */
  onToggle: () => void
  /** Optional badge content (e.g., count badge) */
  badge?: ReactNode
  /** Section content (only rendered when expanded) */
  children: ReactNode
  /** Optional icon color (defaults to var(--node-indigo)) */
  iconColor?: string
}

/**
 * Collapsible section with header and expand/collapse functionality
 * Commonly used pattern in complex property panels
 */
export function CollapsibleSection({
  id,
  title,
  icon: Icon,
  isExpanded,
  onToggle,
  badge,
  children,
  iconColor = 'var(--node-indigo)',
}: CollapsibleSectionProps) {
  return (
    <div>
      {/* Section Header */}
      <button
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
          padding: '8px',
          background: 'var(--panel-2)',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 500,
          color: 'var(--text)',
          marginBottom: isExpanded ? '8px' : '0',
          textAlign: 'left',
        }}
      >
        {isExpanded ? (
          <ChevronDown style={{ width: 14, height: 14, color: 'var(--muted)' }} />
        ) : (
          <ChevronRight style={{ width: 14, height: 14, color: 'var(--muted)' }} />
        )}
        <Icon style={{ width: 14, height: 14, color: iconColor }} />
        <span style={{ flex: 1 }}>{title}</span>
        {badge}
      </button>

      {/* Section Content (conditionally rendered) */}
      {isExpanded && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          padding: '12px',
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          marginBottom: '12px',
        }}>
          {children}
        </div>
      )}
    </div>
  )
}

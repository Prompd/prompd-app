import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'

interface SidebarPanelHeaderProps {
  title: string
  onCollapse?: () => void
  children?: ReactNode  // Additional buttons/content for the right side
}

export function SidebarPanelHeader({ title, onCollapse, children }: SidebarPanelHeaderProps) {
  return (
    <div style={{
      padding: '8px 12px',
      borderBottom: '1px solid var(--border)',
      fontWeight: 500,
      fontSize: '13px',
      color: 'var(--foreground)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '8px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flexShrink: 1 }}>
        {onCollapse && (
          <button
            onClick={onCollapse}
            title="Collapse panel"
            style={{
              background: 'none',
              border: 'none',
              borderRadius: '4px',
              padding: '4px',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--panel-2)'
              e.currentTarget.style.color = 'var(--foreground)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none'
              e.currentTarget.style.color = 'var(--text-muted)'
            }}
          >
            <ChevronLeft size={16} />
          </button>
        )}
        <span>{title}</span>
      </div>
      {children && (
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
          {children}
        </div>
      )}
    </div>
  )
}

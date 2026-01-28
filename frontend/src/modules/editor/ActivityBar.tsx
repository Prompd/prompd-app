import { Files, Package, GitBranch, History, Clock } from 'lucide-react'
import { PrompdIcon } from '../components/PrompdIcon'

type SideKey = 'explorer' | 'packages' | 'ai' | 'git' | 'history' | 'scheduler'

type Props = {
  showSidebar: boolean
  active: SideKey
  onSelect: (k: SideKey) => void
  onToggleSidebar: () => void
}

export default function ActivityBar({ showSidebar, active, onSelect, onToggleSidebar }: Props) {
  const iconSize = 22
  const iconColor = 'var(--accent)'
  const inactiveIconColor = 'var(--muted)'

  // Handle click: if clicking the active panel and sidebar is open, toggle it closed
  // Otherwise, select the panel (which also opens the sidebar via setActiveSide)
  const handleClick = (side: SideKey) => {
    if (active === side && showSidebar) {
      // Clicking the same active panel - toggle sidebar closed
      onToggleSidebar()
    } else {
      // Selecting a different panel or sidebar is closed - open it
      onSelect(side)
    }
  }

  return (
    <div className="activity">
      <div className="ab-items">
        <button
          className={`ab-item ${active === 'explorer' && showSidebar ? 'active' : ''}`}
          title="Explorer"
          onClick={() => handleClick('explorer')}
          data-hint-target="file-explorer"
        >
          <Files
            size={iconSize}
            color={active === 'explorer' && showSidebar ? iconColor : inactiveIconColor}
          />
        </button>
        <button
          className={`ab-item ${active === 'packages' && showSidebar ? 'active' : ''}`}
          title="Packages"
          onClick={() => handleClick('packages')}
        >
          <Package
            size={iconSize}
            color={active === 'packages' && showSidebar ? iconColor : inactiveIconColor}
          />
        </button>
        <button
          className={`ab-item ${active === 'ai' && showSidebar ? 'active' : ''}`}
          title="AI Assistant"
          onClick={() => handleClick('ai')}
          data-hint-target="ai-assistant"
        >
          <PrompdIcon
            size={iconSize}
            color={active === 'ai' && showSidebar ? iconColor : inactiveIconColor}
          />
        </button>
        <button
          className={`ab-item ${active === 'git' && showSidebar ? 'active' : ''}`}
          title="Source Control"
          onClick={() => handleClick('git')}
        >
          <GitBranch
            size={iconSize}
            color={active === 'git' && showSidebar ? iconColor : inactiveIconColor}
          />
        </button>
        <button
          className={`ab-item ${active === 'history' && showSidebar ? 'active' : ''}`}
          title="Execution History"
          onClick={() => handleClick('history')}
          data-hint-target="execution-history"
        >
          <History
            size={iconSize}
            color={active === 'history' && showSidebar ? iconColor : inactiveIconColor}
          />
        </button>
        <button
          className={`ab-item ${active === 'scheduler' && showSidebar ? 'active' : ''}`}
          title="Scheduler"
          onClick={() => handleClick('scheduler')}
        >
          <Clock
            size={iconSize}
            color={active === 'scheduler' && showSidebar ? iconColor : inactiveIconColor}
          />
        </button>
      </div>
    </div>
  )
}

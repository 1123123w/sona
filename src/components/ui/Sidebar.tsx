import { type ReactNode } from 'react'
import { MusicIcon, ChevronLeftIcon, ChevronRightIcon } from '@/components/ui/icons'
import { useI18n } from '@/lib/i18n'
import '@/styles/Sidebar.css'

export interface SidebarItem {
  id: string
  icon: ReactNode
  label: string
}

export interface SidebarProps {
  items: SidebarItem[]
  activeId: string
  onSelect: (id: string) => void
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ items, activeId, onSelect, collapsed, onToggle }: SidebarProps) {
  const { t } = useI18n()
  return (
    <div className={`sonaenhance-sidebar${collapsed ? ' sonaenhance-sidebar--collapsed' : ''}`}>
      {/* Logo area */}
      <div className="sonaenhance-sidebar-logo">
        <span className="sonaenhance-sidebar-logo-icon"><MusicIcon /></span>
        {!collapsed && <span className="sonaenhance-sidebar-logo-text">Sona-E</span>}
      </div>

      {/* Navigation items */}
      <nav className="sonaenhance-sidebar-nav">
        {items.map((item) => (
          <button
            key={item.id}
            className={`sonaenhance-sidebar-item${activeId === item.id ? ' sonaenhance-sidebar-item--active' : ''}`}
            onClick={() => onSelect(item.id)}
            title={collapsed ? item.label : undefined}
          >
            <span className="sonaenhance-sidebar-item-icon">{item.icon}</span>
            {!collapsed && <span className="sonaenhance-sidebar-item-label">{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* Bottom expand/collapse button */}
      <div className="sonaenhance-sidebar-footer">
        <button className="sonaenhance-sidebar-toggle" onClick={onToggle} title={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}>
          {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
        </button>
      </div>
    </div>
  )
}

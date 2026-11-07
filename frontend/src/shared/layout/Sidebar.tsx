import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, Globe, Bot, Blocks, ScrollText, BookOpenText, Settings, PanelLeftClose, PanelLeftOpen, ArrowUpRight } from 'lucide-react'
import { useLayoutStore } from '../../store/layoutStore'
import { tr, useLocale, type MessageKey } from '../i18n'
import { LatitudeField } from './LatitudeField'

const items: { key: MessageKey; path: string; icon: typeof Globe }[] = [
  { key: 'nav.instances', path: '/browser/list', icon: LayoutDashboard },
  { key: 'nav.proxies', path: '/browser/proxy-pool', icon: Globe },
  { key: 'nav.automation', path: '/browser/automation', icon: Bot },
  { key: 'nav.assets', path: '/browser/cores', icon: Blocks },
  { key: 'nav.logs', path: '/browser/logs', icon: ScrollText },
  { key: 'nav.docs', path: '/system/docs', icon: BookOpenText },
  { key: 'nav.settings', path: '/settings', icon: Settings },
]

export function Sidebar() {
  useLocale()
  const location = useLocation()
  const { sidebarCollapsed, toggleSidebar } = useLayoutStore()
  const [compact, setCompact] = useState(() => matchMedia('(max-width: 1100px)').matches)
  useEffect(() => {
    const media = matchMedia('(max-width: 1100px)')
    const change = () => setCompact(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  const collapsed = compact || sidebarCollapsed
  return <aside className="terminal-sidebar" data-collapsed={collapsed}>
    <NavLink to="/browser/list" className="latitude-brand" aria-label="Latitude Browser">
      <LatitudeField variant="mark" />{!collapsed && <span>Latitude<span className="latitude-brand-sub">Browser</span></span>}
    </NavLink>
    {!collapsed && <div className="latitude-nav-caption">{tr('shell.workspace')}</div>}
    <nav aria-label={tr('shell.workspace')}>
      {items.map(({ key, path, icon: Icon }, index) => <NavLink key={key} to={path} title={tr(key)} aria-label={collapsed ? tr(key) : undefined} className={({ isActive }) => `terminal-nav-item ${index === 5 ? 'terminal-nav-bottom' : ''} ${isActive || (key === 'nav.assets' && ['/browser/extensions','/browser/bookmarks','/browser/tags'].includes(location.pathname)) ? 'is-active' : ''}`}>
        <Icon size={18} strokeWidth={1.5} aria-hidden="true" />{!collapsed && <><span>{tr(key)}</span><span className="latitude-nav-indicator" aria-hidden="true" /></>}
      </NavLink>)}
    </nav>
    {!collapsed && <NavLink to="/settings?section=storage" className="latitude-local-note"><span className="latitude-local-dot" /><span>{tr('shell.localWorkspace')}</span><ArrowUpRight size={13} aria-hidden="true" /></NavLink>}
    <button className="terminal-sidebar-toggle" type="button" onClick={toggleSidebar} disabled={compact} title={tr(collapsed ? 'nav.expand' : 'nav.collapse')} aria-label={tr(collapsed ? 'nav.expand' : 'nav.collapse')}>
      {collapsed ? <PanelLeftOpen size={16} /> : <><PanelLeftClose size={16} /><span>{tr('nav.collapse')}</span></>}
    </button>
  </aside>
}

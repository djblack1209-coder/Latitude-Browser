import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Activity,
  Blocks,
  BookOpenText,
  Bookmark,
  Bot,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Cpu,
  FileText,
  Fingerprint,
  Globe,
  LayoutDashboard,
  MoreHorizontal,
  Network,
  Radar,
  ScrollText,
  Settings,
  AlertTriangle,
  Wand2,
  type LucideIcon,
} from 'lucide-react'
import clsx from 'clsx'
import { useLayoutStore } from '../../store/layoutStore'
import { projectConfig, navigationConfig, type NavItem } from '../../config'
import logoImage from '../../resources/images/logo.png'

const iconMap: Record<string, LucideIcon> = {
  Activity,
  Blocks,
  BookOpenText,
  Bookmark,
  Bot,
  Clock3,
  Cpu,
  FileText,
  Fingerprint,
  Globe,
  LayoutDashboard,
  Network,
  Radar,
  ScrollText,
  Settings,
  AlertTriangle,
  Wand2,
}

function getIcon(iconName: string): LucideIcon {
  return iconMap[iconName] || LayoutDashboard
}

function getRouteTarget(path: string) {
  const [pathname, search = ''] = path.split('?')
  return { pathname, search: search ? `?${search}` : '' }
}

const allNavItems = navigationConfig.flatMap((section) => section.items)
const findNavItem = (path: string, fallbackName: string): NavItem => {
  return allNavItems.find((item) => item.path === path) || {
    name: fallbackName,
    path,
    icon: 'LayoutDashboard',
  }
}

// Keep the shell quiet: the four destinations users visit most often stay visible,
// while specialist tools remain one deliberate step away under “更多”.
const primaryItems: NavItem[] = [
  { ...findNavItem('/browser/list', '实例'), name: '实例' },
  { ...findNavItem('/browser/proxy-pool', '代理池') },
  { ...findNavItem('/browser/automation', '自动化'), name: '自动化' },
]

const setupItem = { ...findNavItem('/browser/auto-config', '自动配置') }
const settingsItem = { ...findNavItem('/settings', '设置') }
const primaryPaths = new Set(primaryItems.map((item) => item.path))
const secondaryItems = allNavItems.filter((item) => (
  !primaryPaths.has(item.path) && item.path !== setupItem.path && item.path !== settingsItem.path
))

function isItemActive(location: ReturnType<typeof useLocation>, item: NavItem) {
  const { pathname: itemPath, search: itemSearch } = getRouteTarget(item.path)
  const isPathActive = location.pathname === itemPath || (itemPath !== '/' && location.pathname.startsWith(`${itemPath}/`))
  return isPathActive && (itemSearch ? location.search === itemSearch : location.search === '')
}

function SidebarItem({ item, active, collapsed, emphasized }: { item: NavItem; active: boolean; collapsed: boolean; emphasized?: boolean }) {
  const Icon = getIcon(item.icon)

  return (
    <Link
      to={item.path}
      title={collapsed ? item.name : item.description || item.name}
      className={clsx(
        'group flex h-9 items-center rounded-md text-[13px] transition-[background-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]',
        collapsed ? 'justify-center px-2' : 'gap-3 px-3',
        active
          ? 'bg-[var(--color-accent-muted)] font-medium text-[var(--color-text-primary)]'
          : emphasized
            ? 'bg-[var(--color-bg-muted)]/60 text-[var(--color-text-primary)] hover:bg-[var(--color-accent-muted)]'
            : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)]',
      )}
      aria-current={active ? 'page' : undefined}
    >
      <Icon
        className={clsx(
          'h-4 w-4 shrink-0',
          active || emphasized ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)] group-hover:text-[var(--color-text-secondary)]',
        )}
        strokeWidth={active || emphasized ? 2 : 1.7}
        aria-hidden="true"
      />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.name}</span>}
    </Link>
  )
}

export function Sidebar() {
  const location = useLocation()
  const { sidebarCollapsed, toggleSidebar } = useLayoutStore()
  const hasActiveSecondary = secondaryItems.some((item) => isItemActive(location, item))
  const [moreOpen, setMoreOpen] = useState(hasActiveSecondary)

  useEffect(() => {
    if (hasActiveSecondary) setMoreOpen(true)
  }, [hasActiveSecondary])

  return (
    <aside
      className={clsx(
        'flex h-screen shrink-0 flex-col border-r border-[var(--color-border-default)] bg-[var(--color-bg-surface)] transition-[width] duration-200',
        sidebarCollapsed ? 'w-16' : 'w-[220px]',
      )}
    >
      <div className={clsx('flex h-14 shrink-0 items-center', sidebarCollapsed ? 'justify-center px-2' : 'px-4')}>
        <Link
          to="/browser/list"
          className={clsx(
            'group flex min-w-0 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]',
            sidebarCollapsed ? 'justify-center' : 'gap-2.5',
          )}
          aria-label="返回实例总览"
        >
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)]">
            <img
              src={logoImage}
              alt="Latitude Browser"
              className="h-full w-full object-cover"
              onError={(event) => {
                event.currentTarget.style.display = 'none'
                event.currentTarget.parentElement?.classList.add('fallback-logo')
              }}
            />
            <span className="fallback-content hidden text-xs font-semibold text-[var(--color-accent)]">
              {projectConfig.shortName.charAt(0)}
            </span>
          </span>
          {!sidebarCollapsed && (
            <span className="min-w-0 truncate text-[13px] font-semibold tracking-[-0.01em] text-[var(--color-text-primary)]">
              {projectConfig.name}
            </span>
          )}
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 py-3" aria-label="主导航">
        <div className="space-y-1">
          <SidebarItem item={setupItem} active={isItemActive(location, setupItem)} collapsed={sidebarCollapsed} emphasized />
          <div className="my-3 h-px bg-[var(--color-border-muted)]" aria-hidden="true" />
          {primaryItems.map((item) => (
            <SidebarItem key={item.path} item={item} active={isItemActive(location, item)} collapsed={sidebarCollapsed} />
          ))}
        </div>

        <div className="mt-4">
          <button
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            className={clsx(
              'flex h-8 w-full items-center rounded-md text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-text-muted)] transition-[background-color,color] duration-150 hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]',
              sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-3',
            )}
            aria-expanded={moreOpen}
            aria-controls="sidebar-secondary-nav"
            title={moreOpen ? '收起更多入口' : '展开更多入口'}
          >
            <MoreHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" />
            {!sidebarCollapsed && <span>更多</span>}
          </button>
          {moreOpen && (
            <div id="sidebar-secondary-nav" className="mt-1 space-y-1">
              {secondaryItems.map((item) => (
                <SidebarItem key={item.path} item={item} active={isItemActive(location, item)} collapsed={sidebarCollapsed} />
              ))}
            </div>
          )}
        </div>
      </nav>

      <div className="shrink-0 border-t border-[var(--color-border-muted)] px-2.5 py-2">
        <SidebarItem item={settingsItem} active={isItemActive(location, settingsItem)} collapsed={sidebarCollapsed} />
        <button
          type="button"
          onClick={toggleSidebar}
          className={clsx(
            'mt-1 flex h-8 items-center rounded-md text-[var(--color-text-muted)] transition-[background-color,color] duration-150 hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]',
            sidebarCollapsed ? 'w-full justify-center' : 'w-full gap-3 px-3',
          )}
          title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
          aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <><ChevronLeft className="h-4 w-4" /><span className="text-xs">收起</span></>}
        </button>
      </div>
    </aside>
  )
}

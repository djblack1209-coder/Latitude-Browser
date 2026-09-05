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
import { projectConfig, navigationConfig } from '../../config'
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

export function Sidebar() {
  const location = useLocation()
  const { sidebarCollapsed, toggleSidebar } = useLayoutStore()

  return (
    <aside
      className={clsx(
        'flex h-screen shrink-0 flex-col border-r border-[var(--color-border-default)] bg-[var(--color-bg-surface)] transition-[width] duration-200',
        sidebarCollapsed ? 'w-[72px]' : 'w-64',
      )}
    >
      <div
        className={clsx(
          'flex h-[68px] shrink-0 items-center border-b border-[var(--color-border-muted)]',
          sidebarCollapsed ? 'justify-center px-2' : 'px-4',
        )}
      >
        <Link
          to="/browser/list"
          className={clsx(
            'group flex min-w-0 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]',
            sidebarCollapsed ? 'justify-center' : 'gap-3',
          )}
          aria-label="返回实例总览"
        >
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)]">
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
            <span className="min-w-0 truncate text-sm font-semibold tracking-tight text-[var(--color-text-primary)]">
              {projectConfig.name}
            </span>
          )}
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="主导航">
        {navigationConfig.map((section) => (
          <section key={section.title} className="mb-5 last:mb-0">
            {!sidebarCollapsed && (
              <h2 className="mb-2 px-2 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                {section.title}
              </h2>
            )}
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = getIcon(item.icon)
                const { pathname: itemPath, search: itemSearch } = getRouteTarget(item.path)
                const isPathActive =
                  location.pathname === itemPath ||
                  (itemPath !== '/' && location.pathname.startsWith(`${itemPath}/`))
                const isActive = isPathActive && (itemSearch ? location.search === itemSearch : location.search === '')
                const isQuickEntry = section.title === '置顶入口'

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    title={sidebarCollapsed ? item.name : item.description || item.name}
                    className={clsx(
                      'group flex min-h-10 items-center rounded-md border text-sm transition-[background-color,color,border-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]',
                      sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-3',
                      isActive
                        ? 'border-[var(--color-accent-border)] bg-[var(--color-accent-muted)] text-[var(--color-accent)]'
                        : isQuickEntry
                          ? 'border-[var(--color-accent-border)] bg-[var(--color-bg-subtle)] text-[var(--color-text-primary)] hover:border-[var(--color-accent-border)] hover:bg-[var(--color-accent-muted)]'
                          : 'border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)]',
                    )}
                  >
                    <Icon
                      className={clsx(
                        'h-[17px] w-[17px] shrink-0',
                        isQuickEntry && 'text-[var(--color-accent)]',
                      )}
                      strokeWidth={isActive || isQuickEntry ? 2 : 1.7}
                    />
                    {!sidebarCollapsed && (
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {item.name}
                      </span>
                    )}
                    {!sidebarCollapsed && isQuickEntry && (
                      <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-accent)]/70">
                        start
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </section>
        ))}
      </nav>

      <div className="shrink-0 border-t border-[var(--color-border-muted)] p-3">
        <button
          type="button"
          onClick={toggleSidebar}
          className={clsx(
            'flex min-h-9 items-center rounded-md text-[var(--color-text-muted)] transition-[background-color,color] duration-150 hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]',
            sidebarCollapsed ? 'w-full justify-center' : 'w-full gap-3 px-3',
          )}
          title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
          aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-[17px] w-[17px]" />
          ) : (
            <>
              <ChevronLeft className="h-[17px] w-[17px]" />
              <span className="text-xs">收起侧边栏</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}

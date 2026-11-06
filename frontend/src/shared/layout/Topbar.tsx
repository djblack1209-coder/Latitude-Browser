import { translateMessage } from '../i18n'
import { tr, useLocale, localized } from '../i18n'
import { useState, useRef, useEffect } from 'react'
import { Bell, Check, Trash2, Info, AlertCircle, CheckCircle, Search } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import clsx from 'clsx'
import { useNotificationStore, type Notification } from '../../store/notificationStore'

function NotificationDropdown({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onClear
}: {
  notifications: Notification[]
  onMarkAsRead: (id: string) => void
  onMarkAllAsRead: () => void
  onClear: () => void
}) {
  useLocale()

  const unreadCount = notifications.filter(n => !n.read).length

  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'success': return <CheckCircle className="w-4 h-4 text-[var(--color-success)]" />
      case 'warning': return <AlertCircle className="w-4 h-4 text-[var(--color-warning)]" />
      case 'error': return <AlertCircle className="w-4 h-4 text-[var(--color-error)]" />
      default: return <Info className="w-4 h-4 text-[var(--color-accent)]" />
    }
  }

  return (
    <div
      id="notifications-dropdown"
      role="dialog"
      aria-labelledby="notifications-heading"
      className="absolute right-0 top-full z-50 mt-2 w-84 max-w-[calc(100vw-5rem)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]/95  shadow-[var(--shadow-dropdown)] animate-dropdown"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--color-border-muted)] flex items-center justify-between bg-[var(--color-bg-subtle)]/50">
        <div className="flex items-center gap-2">
          <span id="notifications-heading" className="text-sm font-semibold  text-[var(--color-text-primary)]">{tr("ui.layout.Topbar.text.f6565ae")}</span>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.2 text-[10px] font-mono font-medium bg-[var(--color-accent)] text-[var(--color-text-inverse)] rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={onMarkAllAsRead}
              className="p-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:bg-[var(--color-bg-muted)] rounded transition-colors"
              title={tr("ui.layout.Topbar.title.203c3fc")} aria-label={tr("ui.layout.Topbar.title.203c3fc")}
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onClear}
            className="p-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:bg-[var(--color-bg-muted)] rounded transition-colors"
            title={tr("ui.layout.Topbar.title.446e37a")} aria-label={tr("ui.layout.Topbar.title.446e37a")}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Notification List */}
      <div className="max-h-80 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="py-8 text-center text-[var(--color-text-muted)]">
            <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{tr("ui.layout.Topbar.text.1d45ccb")}</p>
          </div>
        ) : (
          notifications.map((notification) => (
            <button
              type="button"
              key={notification.id}
              onClick={() => onMarkAsRead(notification.id)}
              className={clsx(
                'w-full text-left px-4 py-3 border-b border-[var(--color-border-muted)] last:border-0 cursor-pointer transition-colors hover:bg-[var(--color-bg-muted)]',
                !notification.read && 'bg-[var(--color-accent)]/5'
              )}
            >
              <div className="flex gap-3">
                <div className="shrink-0 mt-0.5">
                  {getIcon(notification.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={clsx(
                      'text-sm truncate',
                      notification.read ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-primary)] font-medium'
                    )}>
                      {translateMessage(notification.title)}
                    </p>
                    {!notification.read && (
                      <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] shrink-0 mt-1.5" />
                    )}
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5 line-clamp-2">
                    {translateMessage(notification.message)}
                  </p>
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-1">
                    {notification.time}
                  </p>
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div className="px-4 py-2 border-t border-[var(--color-border-muted)] bg-[var(--color-bg-muted)]/50">
          <Link to="/browser/logs" className="block w-full text-xs text-center text-[var(--color-accent)] hover:underline">{tr("ui.layout.Topbar.text.048cfa4")}</Link>
        </div>
      )}
    </div>
  )
}

const pageLabels: Array<{ prefix: string; label: string }> = localized(() => ([
  { prefix: '/browser/auto-config', label: tr("config.navigation.config.name.716e01f") },
  { prefix: '/browser/list', label: tr("config.navigation.config.name.69fffaf") },
  { prefix: '/browser/proxy-pool', label: tr("config.navigation.config.name.9830ee8") },
  { prefix: '/browser/cores', label: tr("config.navigation.config.name.a709cd9") },
  { prefix: '/browser/extensions', label: tr("config.navigation.config.name.09440f1") },
  { prefix: '/browser/bookmarks', label: tr("config.navigation.config.name.9d1d2a1") },
  { prefix: '/browser/automation', label: tr("config.navigation.config.name.b9a14be") },
  { prefix: '/browser/logs', label: tr("config.navigation.config.name.53a41da") },
  { prefix: '/settings', label: tr("config.navigation.config.name.7debf9c") },
  { prefix: '/system/docs', label: tr("config.navigation.config.name.4bdf236") },
  { prefix: '/profile', label: tr("ui.layout.Topbar.label.9a0ba59") },
]))

function getPageLabel(pathname: string, search: string) {
  const query = new URLSearchParams(search)
  if (pathname.startsWith('/browser/detail/') || pathname.startsWith('/browser/edit/') || pathname.startsWith('/browser/copy/')) return tr('nav.instances')
  if (pathname === '/browser/list') {
    if (query.get('view') === 'templates') return tr("config.navigation.config.name.eab679e")
    if (query.get('status') === 'attention') return tr("ui.layout.Topbar.getPageLabel.0023186")
    if (query.get('sort') === 'recent') return tr("config.navigation.config.name.8764fbc")
  }
  if (pathname === '/browser/logs') {
    if (query.get('view') === 'network') return tr("config.navigation.config.name.afddb5c")
    if (query.get('view') === 'runs') return tr("config.navigation.config.name.24fb424")
  }
  if (pathname === '/settings') {
    if (query.get('section') === 'connectors') return tr("config.navigation.config.name.624647e")
    if (query.get('section') === 'tor') return tr("ui.layout.Topbar.getPageLabel.5d04c6e")
    if (query.get('section') === 'runtime') return tr("ui.layout.Topbar.getPageLabel.dcc5801")
    if (query.get('section') === 'storage') return tr("ui.layout.Topbar.getPageLabel.ac9b001")
  }
  return pageLabels.find(({ prefix }) => pathname.startsWith(prefix))?.label ?? tr("config.navigation.config.title.8483cd2")
}

export function Topbar() {
  useLocale()

  const [showNotifications, setShowNotifications] = useState(false)
  const { notifications, markAsRead, markAllAsRead, clearNotifications } = useNotificationStore()
  const dropdownRef = useRef<HTMLDivElement>(null)
  const notificationTriggerRef = useRef<HTMLButtonElement>(null)
  const location = useLocation()

  const unreadCount = notifications.filter(n => !n.read).length

  // 点击外部关闭；只在面板打开时注册，避免 Escape 处理器捕获过期状态。
  useEffect(() => {
    if (!showNotifications) return

    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowNotifications(false)
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setShowNotifications(false)
        notificationTriggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [showNotifications])

  useEffect(() => { setShowNotifications(false) }, [location.pathname, location.search])

  return (
    <header className="terminal-titlebar">
      <div className="flex min-w-0 items-center gap-3">
        <span className="latitude-breadcrumb">{tr('shell.workspace')}</span><span className="latitude-breadcrumb-divider" aria-hidden="true">/</span>
        <span className="truncate text-[12px] font-medium text-[var(--color-text-primary)]">{getPageLabel(location.pathname, location.search)}</span>
      </div>

      <div className="flex items-center gap-1">
        <button type="button" className="terminal-quick-launch" onClick={() => window.dispatchEvent(new Event('latitude:quick-launch'))} aria-label={tr("ui.layout.Topbar.aria_label.f5f6dc9")}>
          <Search size={15} aria-hidden="true" />
          <span>{tr("ui.layout.Topbar.text.3875222")}</span>
          <kbd>{/Mac/.test(navigator.platform) ? '⌘' : tr("ui.shared.layout.Topbar.label.dd6a02a")} K</kbd>
        </button>
        {/* 通知按钮 */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            ref={notificationTriggerRef}
            onClick={() => setShowNotifications(!showNotifications)}
            className={clsx(
              'relative w-8 h-8 flex items-center justify-center rounded-md transition-colors duration-150',
              showNotifications
                ? 'text-[var(--color-accent)] bg-[var(--color-accent-muted)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-accent-muted)]'
            )}
            title={tr("ui.layout.Topbar.title.7a66c0d")}
            aria-label={unreadCount ? tr("ui.layout.Topbar.Topbar.6fb1198", [unreadCount]) : tr("ui.layout.Topbar.title.7a66c0d")}
            aria-expanded={showNotifications}
            aria-controls="notifications-dropdown"
            aria-haspopup="dialog"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 text-[10px] font-medium bg-[var(--color-error)] text-white rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <NotificationDropdown
              notifications={notifications}
              onMarkAsRead={markAsRead}
              onMarkAllAsRead={markAllAsRead}
              onClear={() => {
                clearNotifications()
                setShowNotifications(false)
              }}
            />
          )}
        </div>


      </div>
    </header>
  )
}

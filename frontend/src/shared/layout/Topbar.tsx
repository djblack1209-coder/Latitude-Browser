import { useState, useRef, useEffect } from 'react'
import { Bell, User, Check, Trash2, Info, AlertCircle, CheckCircle } from 'lucide-react'
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
    <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] shadow-[var(--shadow-lg)] animate-fade-in">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--color-border-muted)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">异常与通知</span>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-medium bg-[var(--color-accent)] text-white rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={onMarkAllAsRead}
              className="p-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:bg-[var(--color-bg-muted)] rounded transition-colors"
              title="全部标为已读"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onClear}
            className="p-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:bg-[var(--color-bg-muted)] rounded transition-colors"
            title="清空通知"
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
            <p className="text-sm">暂无异常记录</p>
          </div>
        ) : (
          notifications.map((notification) => (
            <div
              key={notification.id}
              onClick={() => onMarkAsRead(notification.id)}
              className={clsx(
                'px-4 py-3 border-b border-[var(--color-border-muted)] last:border-0 cursor-pointer transition-colors hover:bg-[var(--color-bg-muted)]',
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
                      {notification.title}
                    </p>
                    {!notification.read && (
                      <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] shrink-0 mt-1.5" />
                    )}
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5 line-clamp-2">
                    {notification.message}
                  </p>
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-1">
                    {notification.time}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div className="px-4 py-2 border-t border-[var(--color-border-muted)] bg-[var(--color-bg-muted)]/50">
          <button className="w-full text-xs text-center text-[var(--color-accent)] hover:underline">
            查看全部通知
          </button>
        </div>
      )}
    </div>
  )
}

const pageLabels: Array<{ prefix: string; label: string }> = [
  { prefix: '/browser/auto-config', label: '自动配置' },
  { prefix: '/browser/list', label: '实例' },
  { prefix: '/browser/proxy-pool', label: '代理池' },
  { prefix: '/browser/cores', label: '浏览器内核' },
  { prefix: '/browser/extensions', label: '插件包' },
  { prefix: '/browser/bookmarks', label: '书签与标签' },
  { prefix: '/browser/automation', label: '自动化脚本' },
  { prefix: '/browser/logs', label: '日志与诊断' },
  { prefix: '/settings', label: '设置' },
  { prefix: '/system/docs', label: '文档中心' },
  { prefix: '/profile', label: '工作区资料' },
]

function getPageLabel(pathname: string) {
  return pageLabels.find(({ prefix }) => pathname.startsWith(prefix))?.label ?? '工作台'
}

export function Topbar() {
  const [showNotifications, setShowNotifications] = useState(false)
  const { notifications, markAsRead, markAllAsRead, clearNotifications } = useNotificationStore()
  const dropdownRef = useRef<HTMLDivElement>(null)
  const location = useLocation()

  const unreadCount = notifications.filter(n => !n.read).length

  // 点击外部关闭
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowNotifications(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <header className="flex h-12 items-center justify-between gap-4 border-b border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-5">
      <div className="flex min-w-0 items-center">
        <span className="truncate text-[15px] font-medium tracking-[-0.01em] text-[var(--color-text-primary)]">{getPageLabel(location.pathname)}</span>
      </div>

      <div className="flex items-center gap-1">
        {/* 通知按钮 */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className={clsx(
              'relative w-8 h-8 flex items-center justify-center rounded-md transition-colors duration-150',
              showNotifications
                ? 'text-[var(--color-accent)] bg-[var(--color-accent-muted)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-accent-muted)]'
            )}
            title="通知"
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

        <div className="mx-1.5 h-5 w-px bg-[var(--color-border-default)]" aria-hidden="true" />

        <Link
          to="/profile"
          className="flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors duration-150 hover:bg-[var(--color-bg-muted)]"
          title="工作区资料"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-muted)]">
            <User className="h-3.5 w-3.5 text-[var(--color-text-secondary)]" />
          </div>
          <span className="hidden text-sm font-medium text-[var(--color-text-secondary)] sm:inline">Admin</span>
        </Link>
      </div>
    </header>
  )
}

import { Bookmark, Tags } from 'lucide-react'
import { NavLink } from 'react-router-dom'

const items = [
  { to: '/browser/bookmarks', label: '默认书签', icon: Bookmark },
  { to: '/browser/tags', label: '实例标签', icon: Tags },
]

export function AssetScopeTabs() {
  return (
    <nav
      aria-label="书签与标签页面"
      className="inline-flex w-fit items-center gap-1 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-1"
    >
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => [
            'inline-flex h-8 items-center gap-2 rounded-sm px-3 text-xs font-medium transition-[background-color,color] duration-150 active:translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]',
            isActive
              ? 'bg-[var(--color-accent-muted)] text-[var(--color-text-primary)]'
              : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-secondary)]',
          ].join(' ')}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

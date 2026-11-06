import { tr, useLocale, localized } from '../../../shared/i18n'
import { Bookmark, Tags, Cpu, Puzzle } from 'lucide-react'
import { NavLink } from 'react-router-dom'

const items = localized(() => ([
  { to: '/browser/cores', label: tr('assets.cores'), icon: Cpu },
  { to: '/browser/extensions', label: tr('assets.extensions'), icon: Puzzle },
  { to: '/browser/bookmarks', label: tr("browser.pages.AssetScopeTabs.label.c4581d1"), icon: Bookmark },
  { to: '/browser/tags', label: tr("browser.pages.AssetScopeTabs.label.d620218"), icon: Tags },
]))

export function AssetScopeTabs() {
  useLocale()

  return (
    <nav
      aria-label={tr("browser.pages.AssetScopeTabs.aria_label.8029357")}
      className="remit-section-tabs inline-flex max-w-full w-fit items-center gap-1"
    >
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => [
            'inline-flex h-8 items-center gap-2 rounded-sm px-3 text-xs font-medium transition-[background-color,color] duration-150 active:translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]',
            isActive
              ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent)]'
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

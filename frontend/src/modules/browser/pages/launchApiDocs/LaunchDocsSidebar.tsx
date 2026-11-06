import { tr, useLocale } from '../../../../shared/i18n'
import { FileText } from 'lucide-react'
import type { LaunchDocGroup } from './catalog'

interface LaunchDocsSidebarProps {
  groups: LaunchDocGroup[]
  activeId: string
  onSelect: (id: string) => void
  onHome?: () => void
}

export function LaunchDocsSidebar({ groups, activeId, onSelect, onHome }: LaunchDocsSidebarProps) {
  useLocale()

  return (
    <div className="space-y-5">
      <nav className="space-y-5" aria-label={tr("browser.pages.launchApiDocs.LaunchDocsSidebar.aria_label.863a334")}>
        {onHome ? (
          <button
            type="button"
            onClick={onHome}
            aria-current={!activeId ? "page" : undefined}
            className={[
              'flex w-full items-start gap-2 border-l px-2.5 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]',
              !activeId
                ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-[var(--color-text-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)]',
            ].join(' ')}
          >
            <FileText className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${!activeId ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}`} aria-hidden="true" />
            <span className="min-w-0 text-[13px] font-medium leading-5">{tr("browser.pages.launchApiDocs.LaunchDocsSidebar.text.d59fefd")}</span>
          </button>
        ) : null}
        {groups.map((group) => (
          <section key={group.id} className="space-y-1" aria-labelledby={`docs-group-${group.id}`}>
            <p id={`docs-group-${group.id}`} className="px-2 pb-1 font-mono text-[10px] font-semibold   text-[var(--color-text-muted)]">
              {group.label}
            </p>
            {group.items.map((item) => {
              const isActive = activeId === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={[
                    'flex w-full items-start gap-2 border-l px-2.5 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]',
                    isActive
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-[var(--color-text-primary)]'
                      : 'border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)]',
                  ].join(' ')}
                >
                  <FileText className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isActive ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}`} aria-hidden="true" />
                  <span className="min-w-0 text-[13px] font-medium leading-5">{item.label}</span>
                </button>
              )
            })}
          </section>
        ))}
      </nav>
    </div>
  )
}

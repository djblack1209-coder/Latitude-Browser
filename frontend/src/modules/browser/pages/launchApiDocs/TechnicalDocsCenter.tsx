import { tr, useLocale } from '../../../../shared/i18n'
import { ChevronRight } from 'lucide-react'
import type { LaunchDocGroup } from './catalog'

interface TechnicalDocsCenterProps {
  groups: LaunchDocGroup[]
  onOpenDoc: (id: string) => void
}

export function TechnicalDocsCenter({ groups, onOpenDoc }: TechnicalDocsCenterProps) {
  useLocale()

  return (
    <article className="space-y-6">
      <h1 className="remit-doc-title text-lg font-semibold text-[var(--color-text-primary)]">
        {tr('browser.pages.launchApiDocs.LaunchDocsSidebar.text.d59fefd')}
      </h1>
      <div className="divide-y divide-[var(--color-border-muted)] border-y border-[var(--color-border-default)]">
        {groups.map(group => (
          <section key={group.id} className="grid gap-3 py-4 md:grid-cols-[minmax(160px,0.7fr)_minmax(0,1.3fr)] md:gap-6">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{group.label}</h2>
            <div className="grid min-w-0 gap-1 sm:grid-cols-2">
              {group.items.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpenDoc(item.id)}
                  className="flex min-w-0 items-center gap-2 rounded-sm px-2 py-2 text-left text-[13px] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--color-accent)]"
                >
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  )
}

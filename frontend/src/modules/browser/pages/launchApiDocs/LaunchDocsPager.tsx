import { tr, useLocale } from '../../../../shared/i18n'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import clsx from 'clsx'
import { Button } from '../../../../shared/components'
import type { LaunchDocItem } from './catalog'

interface LaunchDocsPagerProps {
  previous: LaunchDocItem | null
  next: LaunchDocItem | null
  onSelect: (id: string) => void
}

export function LaunchDocsPager({
  previous,
  next,
  onSelect,
}: LaunchDocsPagerProps) {
  useLocale()

  if (!previous && !next) {
    return null
  }

  return (
    <nav className="border-t border-[var(--color-border-default)] pt-4">
      <div className="flex flex-wrap items-center gap-2">
        {previous && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSelect(previous.id)}
            aria-label={tr("browser.pages.launchApiDocs.LaunchDocsPager.LaunchDocsPager.09f7f07", [previous.label])}
            title={tr("browser.pages.launchApiDocs.LaunchDocsPager.LaunchDocsPager.09f7f07", [previous.label])}
            className="min-w-0 justify-start px-2 text-[var(--color-text-secondary)]"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span className="truncate">{tr("browser.pages.launchApiDocs.LaunchDocsPager.text.1f2643c")}{previous.label}</span>
          </Button>
        )}

        {next && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSelect(next.id)}
            aria-label={tr("browser.pages.launchApiDocs.LaunchDocsPager.LaunchDocsPager.4ea8566", [next.label])}
            title={tr("browser.pages.launchApiDocs.LaunchDocsPager.LaunchDocsPager.4ea8566", [next.label])}
            className={clsx(
              'min-w-0 justify-end px-2 text-[var(--color-text-secondary)]',
              previous && 'ml-auto',
            )}
          >
            <span className="truncate">{tr("browser.pages.launchApiDocs.LaunchDocsPager.text.14e2366")}{next.label}</span>
            <ArrowRight className="h-4 w-4 shrink-0" />
          </Button>
        )}
      </div>
    </nav>
  )
}

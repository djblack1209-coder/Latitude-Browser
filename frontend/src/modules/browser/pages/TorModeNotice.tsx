import { tr, useLocale } from '../../../shared/i18n'
import { Link } from 'react-router-dom'
import { ArrowUpRight, FlaskConical, ShieldAlert } from 'lucide-react'

interface TorModeNoticeProps {
  compact?: boolean
  className?: string
}

export function TorModeNotice({ compact = false, className = '' }: TorModeNoticeProps) {
  useLocale()

  return (
    <section
      role="note"
      aria-label={tr("browser.pages.TorModeNotice.aria_label.0cd4190")}
      className={`rounded-sm border border-[var(--color-warning)]/45 bg-[var(--color-warning)]/5 ${compact ? 'px-3 py-2.5' : 'p-4'} ${className}`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-[var(--color-warning)]/45 text-[var(--color-warning)]">
          {compact ? <FlaskConical className="h-4 w-4" aria-hidden="true" /> : <ShieldAlert className="h-4 w-4" aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{tr("browser.pages.BrowserEditPage.text.0369caf")}</h3>
            <span className="rounded-sm border border-[var(--color-warning)]/45 px-1.5 py-0.5 font-mono text-[10px]   text-[var(--color-warning)]">{tr("browser.components.BrowserProfilesPanel.text.2600d79")}</span>
          </div>
          <p className="mt-1.5 text-xs leading-5 text-[var(--color-text-secondary)]">{tr("browser.pages.TorModeNotice.text.da6e700")}</p>
          {!compact && (
            <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">{tr("browser.pages.TorModeNotice.text.c411832")}</p>
          )}
          <Link
            to="/settings?section=tor"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--color-accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          >{tr("browser.pages.TorModeNotice.text.e3473b8")}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  )
}

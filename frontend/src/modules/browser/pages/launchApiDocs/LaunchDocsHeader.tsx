import { tr, useLocale } from '../../../../shared/i18n'
import { ArrowLeft } from 'lucide-react'
import { Button } from '../../../../shared/components'

interface LaunchDocsHeaderProps {
  activeGroupLabel: string
  activeDocLabel: string
  onBack: () => void
  onJumpTutorial: () => void
  onJumpCoreIntro: () => void
  onJumpProxyIntro: () => void
  onJumpApiOverview: () => void
}

export function LaunchDocsHeader({
  activeGroupLabel,
  activeDocLabel,
  onBack,
  onJumpTutorial,
  onJumpCoreIntro,
  onJumpProxyIntro,
  onJumpApiOverview,
}: LaunchDocsHeaderProps) {
  useLocale()

  const quickLinks = [
    { label: tr("browser.pages.launchApiDocs.LaunchDocsHeader.label.e63e0a7"), onClick: onJumpTutorial },
    { label: tr("browser.pages.launchApiDocs.LaunchDocsHeader.label.aa4fbf4"), onClick: onJumpCoreIntro },
    { label: tr("browser.pages.launchApiDocs.LaunchDocsHeader.label.58933ad"), onClick: onJumpProxyIntro },
    { label: tr("browser.pages.launchApiDocs.LaunchDocsHeader.label.9421c6f"), onClick: onJumpApiOverview },
  ]

  return (
    <section className="rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] px-4 py-4 shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold   text-[var(--color-text-muted)]">{tr("config.navigation.config.name.4bdf236")}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-[var(--color-text-secondary)]">{activeGroupLabel}</span>
            <span className="text-[var(--color-text-muted)]">/</span>
            <span className="font-medium text-[var(--color-text-primary)]">{activeDocLabel}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />{tr("browser.pages.launchApiDocs.LaunchDocsHeader.text.182768e")}</Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--color-border-muted)] pt-3">
        <span className="text-xs font-medium text-[var(--color-text-muted)]">{tr("browser.pages.launchApiDocs.LaunchDocsHeader.text.73f3342")}</span>
        {quickLinks.map((link) => (
          <button
            key={link.label}
            onClick={link.onClick}
            className="rounded-full border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]"
          >
            {link.label}
          </button>
        ))}
      </div>
    </section>
  )
}

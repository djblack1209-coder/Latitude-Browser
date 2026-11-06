import { tr, useLocale, localized } from '../../../shared/i18n'
import { Link } from 'react-router-dom'
import clsx from 'clsx'

const sections = localized(() => ([
  { key: 'general', label: tr("settings.components.SettingsSectionNav.label.f1484fa"), to: '/settings' },
  { key: 'connectors', label: tr("settings.components.SettingsSectionNav.label.0cbda6b"), to: '/settings?section=connectors' },
  { key: 'runtime', label: tr("config.navigation.config.title.90e4e9b"), to: '/settings?section=runtime' },
  { key: 'storage', label: tr("settings.components.SettingsSectionNav.label.54b8a90"), to: '/settings?section=storage' },
  { key: 'about', label: tr("settings.components.SettingsSectionNav.label.bed172e"), to: '/settings?section=about' },
]))

export function SettingsSectionNav({ current }: { current: string }) {
  useLocale()

  return (
    <nav aria-label={tr("settings.components.SettingsSectionNav.aria_label.fb38490")} className="remit-section-tabs flex flex-wrap gap-1">
      {sections.map(section => (
        <Link key={section.key} to={section.to} aria-current={section.key === current ? "page" : undefined}
          className={clsx('rounded-md px-3 py-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]', section.key === current ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent)]' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)]')}>
          {section.label}
        </Link>
      ))}
    </nav>
  )
}

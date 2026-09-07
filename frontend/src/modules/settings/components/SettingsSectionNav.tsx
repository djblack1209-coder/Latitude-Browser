import { Link } from 'react-router-dom'
import clsx from 'clsx'

const sections = [
  { key: 'general', label: '常规与外观', to: '/settings' },
  { key: 'connectors', label: '连接栈', to: '/settings?section=connectors' },
  { key: 'tor', label: 'Tor', to: '/settings?section=tor' },
  { key: 'runtime', label: '自动化运行时', to: '/settings?section=runtime' },
  { key: 'storage', label: '备份与数据', to: '/settings?section=storage' },
]

export function SettingsSectionNav({ current }: { current: string }) {
  return (
    <nav aria-label="设置分区" className="flex flex-wrap gap-1 border-b border-[var(--color-border-muted)] pb-3">
      {sections.map(section => (
        <Link key={section.key} to={section.to} aria-current={section.key === current ? 'page' : undefined}
          className={clsx('rounded-md px-3 py-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]', section.key === current ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent)]' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)]')}>
          {section.label}
        </Link>
      ))}
    </nav>
  )
}

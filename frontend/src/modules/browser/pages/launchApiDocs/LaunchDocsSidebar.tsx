import { FileText } from 'lucide-react'
import type { LaunchDocGroup } from './catalog'

interface LaunchDocsSidebarProps {
  groups: LaunchDocGroup[]
  activeId: string
  onSelect: (id: string) => void
  onHome?: () => void
}

export function LaunchDocsSidebar({ groups, activeId, onSelect, onHome }: LaunchDocsSidebarProps) {
  return (
    <div className="space-y-5">
      <div className="border-b border-[var(--color-border-muted)] px-1 pb-3">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">LAUNCH API</p>
        <p className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">开发文档</p>
      </div>

      <nav className="space-y-5" aria-label="文档目录">
        {onHome ? (
          <button
            type="button"
            onClick={onHome}
            aria-current={!activeId ? 'page' : undefined}
            className={[
              'flex w-full items-start gap-2 border-l px-2.5 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]',
              !activeId
                ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-[var(--color-text-primary)]'
                : 'border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)]',
            ].join(' ')}
          >
            <FileText className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${!activeId ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'}`} aria-hidden="true" />
            <span className="min-w-0 text-[13px] font-medium leading-5">技术文档中心</span>
          </button>
        ) : null}
        {groups.map((group) => (
          <section key={group.id} className="space-y-1" aria-labelledby={`docs-group-${group.id}`}>
            <p id={`docs-group-${group.id}`} className="px-2 pb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
              {group.label}
            </p>
            {group.items.map((item) => {
              const isActive = activeId === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  aria-current={isActive ? 'page' : undefined}
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

import type { ReactNode } from 'react'
import { FileCode2, Fingerprint, FolderOpen, Network, Terminal } from 'lucide-react'
import clsx from 'clsx'

export type SignalTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

interface WorkspaceHeaderProps {
  eyebrow: string
  title: string
  description?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  className?: string
}

/** Shared page grammar: orient, show state, then offer an action. */
export function WorkspaceHeader({ eyebrow, title, description, actions, children, className }: WorkspaceHeaderProps) {
  return (
    <header className={clsx('signal-page-header', className)}>
      <div className="signal-page-heading">
        <div className="min-w-0">
          <p className="signal-eyebrow"><span aria-hidden="true">/</span> {eyebrow}</p>
          <h1>{title}</h1>
          {description && <div className="signal-page-description">{description}</div>}
        </div>
        {actions && <div className="signal-page-actions">{actions}</div>}
      </div>
      {children}
    </header>
  )
}

export interface TelemetryItem {
  label: string
  value: ReactNode
  detail?: string
  tone?: SignalTone
}

/** Only accepts the caller's measurements; never invents samples or percentages. */
export function TelemetryStrip({ items, className }: { items: TelemetryItem[]; className?: string }) {
  return (
    <dl className={clsx('signal-telemetry', className)}>
      {items.map(({ label, value, detail, tone = 'neutral' }) => (
        <div key={label} className="signal-telemetry-item" data-tone={tone}>
          <dt>{label}</dt>
          <dd>
            {value}
            {detail && <p>{detail}</p>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

const emptyIcons = {
  network: Network,
  files: FolderOpen,
  code: FileCode2,
  logs: Terminal,
  fingerprint: Fingerprint,
}

export function SignalEmptyState({
  title,
  description,
  action,
  symbol = 'files',
}: {
  title: string
  description?: string
  action?: ReactNode
  symbol?: keyof typeof emptyIcons
}) {
  const Icon = emptyIcons[symbol]
  return (
    <div className="signal-empty-state">
      <div className="signal-empty-glyph" aria-hidden="true">
        <span>[</span><Icon size={26} strokeWidth={1.25} /><span>]</span>
      </div>
      <div className="min-w-0">
        <h3>{title}</h3>
        {description && <p>{description}</p>}
        {action && <div className="mt-4 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  )
}

/** Terminal chrome without fake controls, traffic, or successful security states. */
export function TerminalPanel({ title, meta, children, className }: {
  title: string
  meta?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={clsx('signal-terminal', className)} aria-label={title}>
      <div className="signal-terminal-heading">
        <div className="flex min-w-0 items-center gap-2">
          <Terminal size={14} aria-hidden="true" />
          <h2>{title}</h2>
        </div>
        {meta && <div className="signal-terminal-meta">{meta}</div>}
      </div>
      {children}
    </section>
  )
}

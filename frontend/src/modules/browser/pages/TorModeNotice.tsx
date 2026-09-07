import { Link } from 'react-router-dom'
import { ArrowUpRight, FlaskConical, ShieldAlert } from 'lucide-react'

interface TorModeNoticeProps {
  compact?: boolean
  className?: string
}

export function TorModeNotice({ compact = false, className = '' }: TorModeNoticeProps) {
  return (
    <section
      role="note"
      aria-label="Tor 实验性模式说明"
      className={`rounded-sm border border-[var(--color-warning)]/45 bg-[var(--color-warning)]/5 ${compact ? 'px-3 py-2.5' : 'p-4'} ${className}`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-[var(--color-warning)]/45 text-[var(--color-warning)]">
          {compact ? <FlaskConical className="h-4 w-4" aria-hidden="true" /> : <ShieldAlert className="h-4 w-4" aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Tor TCP 路由</h3>
            <span className="rounded-sm border border-[var(--color-warning)]/45 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-warning)]">实验性</span>
          </div>
          <p className="mt-1.5 text-xs leading-5 text-[var(--color-text-secondary)]">
            这里只提供应用受管的 Tor TCP 传输，不是 Tor Browser，也不提供匿名身份或无泄漏保证。真实指纹配置仍不是独立的匿名层。
          </p>
          {!compact && (
            <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">
              启动时会停用扩展，并由后端接管代理、DNS、QUIC 与 WebRTC 相关参数。与这些规则冲突的自定义参数不会按原值生效。
            </p>
          )}
          <Link
            to="/settings?section=tor"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--color-accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          >
            前往 Tor 实验室配置已签名运行时路径
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  )
}

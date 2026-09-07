import { Edit2 } from 'lucide-react'
import { Button } from '../../../../shared/components'
import { TerminalPanel } from '../../../../shared/components/SignalPrimitives'
import type { BrowserSettings } from '../../types'

interface CoreSettingsCardProps {
  settings: BrowserSettings
  onEdit: () => void
}

const settingsValueClass = 'min-h-8 break-all font-mono text-xs leading-5 text-[var(--color-text-primary)]'

export function CoreSettingsCard({ settings, onEdit }: CoreSettingsCardProps) {
  return (
    <TerminalPanel
      title="GLOBAL BOOT PROFILE"
      meta={(
        <Button size="sm" variant="ghost" onClick={onEdit} aria-label="编辑全局启动设置">
          <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
          编辑设置
        </Button>
      )}
    >
      <div className="grid divide-y divide-[var(--color-border-muted)] lg:grid-cols-12 lg:divide-x lg:divide-y-0">
        <SettingsValue className="lg:col-span-4" label="用户数据根目录" value={settings.userDataRoot || '未指定'} />
        <SettingsValue className="lg:col-span-2" label="会话恢复" value={settings.restoreLastSession ? 'ENABLED' : 'DISABLED'} />
        <SettingsValue className="lg:col-span-2" label="轻启动" value={settings.lightStartEnabled ? 'ENABLED' : 'DISABLED'} />
        <SettingsValue className="lg:col-span-2" label="就绪超时" value={`${settings.startReadyTimeoutMs} ms`} />
        <SettingsValue className="lg:col-span-2" label="稳定窗口" value={`${settings.startStableWindowMs} ms`} />
      </div>
      <div className="grid border-t border-[var(--color-border-muted)] lg:grid-cols-3 lg:divide-x lg:divide-[var(--color-border-muted)]">
        <SettingsList label="默认启动页面" values={settings.defaultStartUrls} />
        <SettingsList label="默认指纹参数" values={settings.defaultFingerprintArgs} />
        <SettingsList label="默认启动参数" values={settings.defaultLaunchArgs} />
      </div>
    </TerminalPanel>
  )
}

function SettingsValue({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={`min-w-0 px-4 py-3 ${className}`}>
      <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{label}</p>
      <div className={settingsValueClass}>{value}</div>
    </div>
  )
}

function SettingsList({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">{label}</p>
      {values.length > 0 ? (
        <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-all font-mono text-xs leading-5 text-[var(--color-text-secondary)]">
          {values.join('\n')}
        </pre>
      ) : (
        <div className="font-mono text-xs text-[var(--color-text-muted)]">EMPTY</div>
      )}
    </div>
  )
}

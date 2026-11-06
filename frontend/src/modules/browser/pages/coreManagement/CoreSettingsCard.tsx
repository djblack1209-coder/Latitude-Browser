import { tr, useLocale } from '../../../../shared/i18n'
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
  useLocale()

  return (
    <TerminalPanel
      title={tr("ui.modules.browser.pages.coreManagement.CoreSettingsCard.label.bb55728")}
      meta={(
        <Button size="sm" variant="ghost" onClick={onEdit} aria-label={tr("browser.pages.coreManagement.CoreSettingsCard.aria_label.33f0362")}>
          <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />{tr("browser.pages.coreManagement.CoreSettingsCard.text.5c87c61")}</Button>
      )}
    >
      <div className="grid divide-y divide-[var(--color-border-muted)] lg:grid-cols-12 lg:divide-x lg:divide-y-0">
        <SettingsValue className="lg:col-span-4" label={tr("browser.components.BrowserListLayout.label.5b23d25")} value={settings.userDataRoot || tr("browser.pages.coreManagement.CoreSettingsCard.CoreSettingsCard.8c577dc")} />
        <SettingsValue className="lg:col-span-2" label={tr("browser.pages.coreManagement.CoreSettingsCard.label.65e3f3b")} value={settings.restoreLastSession ? tr("ui.modules.browser.pages.coreManagement.CoreSettingsCard.label.e22fb09") : tr("ui.modules.browser.pages.coreManagement.CoreSettingsCard.label.bb2d06e")} />
        <SettingsValue className="lg:col-span-2" label={tr("browser.pages.coreManagement.CoreSettingsCard.label.7181ecd")} value={settings.lightStartEnabled ? tr("ui.modules.browser.pages.coreManagement.CoreSettingsCard.label.e22fb09") : tr("ui.modules.browser.pages.coreManagement.CoreSettingsCard.label.bb2d06e")} />
        <SettingsValue className="lg:col-span-2" label={tr("browser.pages.coreManagement.CoreSettingsCard.label.1782bee")} value={`${settings.startReadyTimeoutMs} ms`} />
        <SettingsValue className="lg:col-span-2" label={tr("browser.pages.coreManagement.CoreSettingsCard.label.57921ae")} value={`${settings.startStableWindowMs} ms`} />
      </div>
      <div className="grid border-t border-[var(--color-border-muted)] lg:grid-cols-3 lg:divide-x lg:divide-[var(--color-border-muted)]">
        <SettingsList label={tr("browser.components.BrowserListLayout.label.d97e30a")} values={settings.defaultStartUrls} />
        <SettingsList label={tr("browser.components.BrowserListLayout.label.51c2e53")} values={settings.defaultFingerprintArgs} />
        <SettingsList label={tr("browser.components.BrowserListLayout.label.0b1e606")} values={settings.defaultLaunchArgs} />
      </div>
    </TerminalPanel>
  )
}

function SettingsValue({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  useLocale()

  return (
    <div className={`min-w-0 px-4 py-3 ${className}`}>
      <p className="mb-1 font-mono text-[10px] font-semibold   text-[var(--color-text-muted)]">{label}</p>
      <div className={settingsValueClass}>{value}</div>
    </div>
  )
}

function SettingsList({ label, values }: { label: string; values: string[] }) {
  useLocale()

  return (
    <div className="min-w-0 px-4 py-3">
      <p className="mb-1 font-mono text-[10px] font-semibold   text-[var(--color-text-muted)]">{label}</p>
      {values.length > 0 ? (
        <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-all font-mono text-xs leading-5 text-[var(--color-text-secondary)]">
          {values.join('\n')}
        </pre>
      ) : (
        <div className="font-mono text-xs text-[var(--color-text-muted)]">{tr("ui.modules.browser.pages.coreManagement.CoreSettingsCard.label.5bc6047")}</div>
      )}
    </div>
  )
}

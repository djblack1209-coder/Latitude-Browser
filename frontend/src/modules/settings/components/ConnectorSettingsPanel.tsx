import { translateMessage } from '../../../shared/i18n'
import { tr, useLocale } from '../../../shared/i18n'
import { useEffect, useState } from 'react'
import { ArrowRight, Check, Network, RefreshCw, Save } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button, Modal, toast } from '../../../shared/components'
import { WorkspaceHeader, TerminalPanel } from '../../../shared/components/SignalPrimitives'
import { AsciiMeter } from '../../../shared/components/AsciiMeter'
import { fetchBrowserSettings, saveBrowserSettings, browserProxyConnectorPreflight, browserProxyCoreStatus, fetchBrowserProfiles } from '../../browser/api'
import { getGoApp } from '../../browser/api/runtime'
import type { BrowserSettings, ProxyCoreStatusResult } from '../../browser/types'
import { normalizeProxyCoreStatus } from '../../browser/utils/proxyCoreStatus'

type Stack = 'xray' | 'mihomo'
const stacks = {
  xray: { label: tr("ui.modules.settings.components.ConnectorSettingsPanel.label.702882d"), description: tr("settings.components.ConnectorSettingsPanel.description.c172867"), cores: ['xray', 'sing-box'], protocols: [tr("settings.components.ConnectorSettingsPanel.message.f451844"), 'sing-box · Hysteria2 / TUIC / AnyTLS'] },
  mihomo: { label: tr("ui.modules.settings.components.ConnectorSettingsPanel.label.39d7201"), description: tr("settings.components.ConnectorSettingsPanel.description.8a04395"), cores: ['mihomo'], protocols: [tr("settings.components.ConnectorSettingsPanel.message.df36c3e"), tr("settings.components.ConnectorSettingsPanel.message.92fbca5")] },
} as const

const normalizeStack = (connectorType?: string): Stack => connectorType === 'mihomo' ? 'mihomo' : 'xray'

export function ConnectorSettingsPanel({ active: visible = true, onDirtyChange }: { active?: boolean; onDirtyChange?: (dirty: boolean) => void }) {
  useLocale()

  const [settings, setSettings] = useState<BrowserSettings | null>(null)
  const [selected, setSelected] = useState<Stack>('xray')
  const [statuses, setStatuses] = useState<ProxyCoreStatusResult[]>([])
  const [preflight, setPreflight] = useState<Awaited<ReturnType<typeof browserProxyConnectorPreflight>> | null>(null)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const desktop = !!getGoApp()
  const active = settings?.defaultConnectorType === 'mihomo' ? 'mihomo' : 'xray'
  const dirty = !!settings && selected !== active

  const load = async () => {
    setBusy(true)
    setError('')
    const preserveSelection = !!settings && selected !== normalizeStack(settings.defaultConnectorType)
    try {
      const next = await fetchBrowserSettings()
      setSettings(next)
      // A refresh must not discard a radio choice that has not been saved yet.
      // Keep clean selections in sync with the persisted policy.
      if (!preserveSelection) setSelected(normalizeStack(next.defaultConnectorType))
      if (desktop) {
        // Empty platform/arch asks the backend for its actual native target.
        // A macOS WebView may advertise MacIntel even on Apple Silicon.
        const [nextStatuses, nextPreflight] = await Promise.all([
          Promise.all(['xray', 'sing-box', 'mihomo'].map(core => browserProxyCoreStatus(core, '', ''))),
          browserProxyConnectorPreflight(next.defaultConnectorType || '', '', ''),
        ])
        setStatuses(nextStatuses)
        setPreflight(nextPreflight)
      } else {
        setStatuses([])
        setPreflight(null)
      }
    } catch (cause) {
      setPreflight(null)
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally { setBusy(false) }
  }
  useEffect(() => { if (visible) void load() }, [visible])
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])

  const save = async () => {
    if (!settings || !desktop) return
    setSaving(true)
    try {
      const profiles = await fetchBrowserProfiles()
      if (profiles.some(profile => profile.running)) throw new Error(tr("settings.components.ConnectorSettingsPanel.ConnectorSettingsPanel.d8356db"))
      // Re-read before saving so unrelated browser settings aren't overwritten.
      const current = await fetchBrowserSettings()
      const next = { ...current, defaultConnectorType: selected }
      await saveBrowserSettings(next)
      setSettings(next)
      // Explicitly reconcile the local selection only after persistence succeeds.
      setSelected(normalizeStack(next.defaultConnectorType))
      setConfirmOpen(false)
      toast.success(tr("settings.components.ConnectorSettingsPanel.ConnectorSettingsPanel.1d11aac", [stacks[selected].label]))
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause))
    } finally { setSaving(false) }
  }

  const normalizedStatuses = statuses.map(normalizeProxyCoreStatus)
  const required = stacks[active].cores
  const installed = preflight?.cores.filter(status => required.some(core => core === status.core) && status.installed).length
    ?? normalizedStatuses.filter(status => required.some(core => core === status.core) && status.installed).length

  return (
    <div className="space-y-5">
      <WorkspaceHeader  title={tr("config.navigation.config.name.624647e")}
        actions={<><Button variant="secondary" size="sm" onClick={() => void load()} loading={busy}><RefreshCw size={14} />{tr("settings.components.ConnectorSettingsPanel.text.7cc7f07")}</Button><Button size="sm" disabled={!dirty || !desktop || busy} onClick={() => setConfirmOpen(true)}><Save size={14} />{tr("settings.components.ConnectorSettingsPanel.text.e3d59bf")}</Button></>} />
      {error && <div role="alert" className="rounded-md border border-[var(--color-error)]/40 p-4 text-sm text-[var(--color-error)]">{tr("settings.components.ConnectorSettingsPanel.text.ca3d427")}{translateMessage(error)}{tr("settings.components.ConnectorSettingsPanel.text.c98bb6d")}</div>}

      <fieldset disabled={busy || saving || !!error || !desktop} className="space-y-3">
        <legend className="mb-3 text-xs font-medium text-[var(--color-text-secondary)]">{tr("settings.components.ConnectorSettingsPanel.text.705f345")}</legend>
        {(Object.entries(stacks) as Array<[Stack, typeof stacks[Stack]]>).map(([key, stack]) => (
          <label key={key} className={`flex cursor-pointer items-start gap-4 rounded-lg border p-5 transition-colors ${selected === key ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)]' : 'border-[var(--color-border-default)] bg-[var(--color-bg-surface)]'}`}>
            <input type="radio" name="connector-stack" value={key} checked={selected === key} onChange={() => setSelected(key)} className="mt-1 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3"><span className="text-sm font-semibold">{stack.label}</span><span className="text-[10px] text-[var(--color-text-muted)]">{stack.description}</span>{active === key && <span className="inline-flex items-center gap-1 text-[10px] text-[var(--color-accent)]"><Check size={12} />{tr("settings.components.ConnectorSettingsPanel.text.cdfab96")}</span>}</div>
              <ul className="mt-3 space-y-1.5 text-xs leading-6 text-[var(--color-text-secondary)]">{stack.protocols.map(protocol => <li key={protocol}>{protocol}</li>)}</ul>
            </div>
          </label>
        ))}
      </fieldset>
      <TerminalPanel title={tr("ui.modules.settings.components.ConnectorSettingsPanel.label.a5902c9")} meta={desktop ? tr("settings.components.ConnectorSettingsPanel.ConnectorSettingsPanel.386cda9") : "DESKTOP BRIDGE UNAVAILABLE"}>
        <div className="divide-y divide-[var(--color-border-muted)] px-4">
          {['xray', 'sing-box', 'mihomo'].map(core => {
            const status = normalizedStatuses.find(item => item.core === core)
            return <div key={core} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="min-w-0"><h3 className="text-sm font-medium">{core}</h3><p className="mt-1 break-all font-mono text-[10px] text-[var(--color-text-muted)]">{status?.binaryPath || (desktop ? tr("settings.components.ConnectorSettingsPanel.ConnectorSettingsPanel.59fbf35") : tr("settings.components.ConnectorSettingsPanel.ConnectorSettingsPanel.351d411"))}</p></div><span className={`text-xs ${status?.installed ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)]'}`}>{busy ? tr("browser.pages.AutoConfigPage.AutoConfigPage.9908c92") : status?.installed ? tr("browser.automationRuntime.getAutomationRuntimeBadgeText.eb88ff5") : desktop && !error ? tr("settings.components.ConnectorSettingsPanel.ConnectorSettingsPanel.df5ccaf") : tr("browser.pages.AutoConfigPage.AutoConfigPage.ed9ec81")}</span></div>
          })}
        </div>
        <div className="flex flex-wrap items-center gap-4 border-t border-[var(--color-border-muted)] px-4 py-3"><AsciiMeter value={desktop && !busy && !error ? installed / required.length * 100 : null} label={tr("settings.components.ConnectorSettingsPanel.label.44b8647")} className="w-36" /><Link to="/browser/proxy-pool" className="inline-flex items-center gap-2 text-xs text-[var(--color-accent)]">{tr("settings.components.ConnectorSettingsPanel.text.e26e012")}<ArrowRight size={13} /></Link></div>
      </TerminalPanel>
      <div className="flex items-start gap-3 text-xs leading-6 text-[var(--color-text-muted)]"><Network size={16} className="mt-1 shrink-0" /><p>{tr("settings.components.ConnectorSettingsPanel.text.9e36f52")}</p></div>
      <Modal open={confirmOpen} onClose={() => { if (!saving) setConfirmOpen(false) }} title={tr("settings.components.ConnectorSettingsPanel.title.71ebd2a")} closable={!saving} footer={<><Button variant="secondary" disabled={saving} onClick={() => setConfirmOpen(false)}>{tr("App.CloseConfirmModal.4d0b468")}</Button><Button loading={saving} onClick={() => void save()}>{tr("settings.components.ConnectorSettingsPanel.text.706df27")}</Button></>}>
        <div className="space-y-4 text-sm leading-7"><p className="font-mono">{stacks[active].label} → {stacks[selected].label}</p><p className="text-[var(--color-text-secondary)]">{tr("settings.components.ConnectorSettingsPanel.text.42099af")}</p><p className="text-xs text-[var(--color-text-muted)]">{tr("settings.components.ConnectorSettingsPanel.text.63f727d")}</p></div>
      </Modal>
    </div>
  )
}

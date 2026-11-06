import { translateMessage } from '../../../shared/i18n'
import { tr, useLocale } from '../../../shared/i18n'
import { useEffect, useState } from 'react'
import { ArrowRight, FlaskConical, RefreshCw, Save, ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button, FormItem, Input, Modal, toast } from '../../../shared/components'
import { AsciiMeter } from '../../../shared/components/AsciiMeter'
import { WorkspaceHeader, TerminalPanel } from '../../../shared/components/SignalPrimitives'
import { fetchTorStatus, setTorRuntimePath, type TorRuntimeStatus } from '../../browser/api/tor'
import './tor-lab.css'

export function TorLabPanel({ active = true, onDirtyChange }: { active?: boolean; onDirtyChange?: (dirty: boolean) => void }) {
  useLocale()

  const [status, setStatus] = useState<TorRuntimeStatus | null>(null)
  const [path, setPath] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [poll, setPoll] = useState(true)
  const dirty = !!status && path.trim() !== status.binaryPath

  const refresh = async (initial = false) => {
    setLoading(true)
    try {
      const next = await fetchTorStatus()
      setStatus(next)
      if (initial) setPath(next.binaryPath)
      setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setLoading(false) }
  }
  useEffect(() => { if (active) void refresh(status === null) }, [active])
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  useEffect(() => {
    if (!active || !poll || !status?.available) return
    let pending = false
    const timer = setInterval(() => {
      if (document.hidden || pending || saving) return
      pending = true
      void refresh().finally(() => { pending = false })
    }, 3000)
    return () => clearInterval(timer)
  }, [active, poll, status?.available, saving])

  const save = async () => {
    setSaving(true)
    try {
      const next = await setTorRuntimePath(path.trim())
      setStatus(next)
      setPath(next.binaryPath)
      setShowConfirm(false)
      setConfirmed(false)
      toast.success(path.trim() ? tr("settings.components.TorLabPanel.TorLabPanel.da6c78b") : tr("settings.components.TorLabPanel.TorLabPanel.b627773"))
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : String(cause)) }
    finally { setSaving(false) }
  }

  const sessions = status?.activeProfiles || []
  return (
    <div className="space-y-5">
      <WorkspaceHeader  title={tr("ui.layout.Topbar.getPageLabel.5d04c6e")}
        actions={<Button size="sm" variant="secondary" onClick={() => void refresh()} loading={loading}><RefreshCw size={14} />{tr("settings.components.TorLabPanel.text.c895af6")}</Button>} />
      <p className="inline-flex items-center gap-2 text-xs text-[var(--warn)]"><FlaskConical size={13} aria-hidden="true" />{tr("settings.components.TorLabPanel.text.fd5231b")}</p>

      {(error || !status?.available) && <p role={error ? "alert" : "note"} className="rounded-md border border-[var(--color-border-default)] p-4 text-xs leading-6 text-[var(--color-text-secondary)]">{error || status?.message || tr("settings.components.TorLabPanel.TorLabPanel.e3207a5")}</p>}
      <section className="space-y-4 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-5" aria-labelledby="tor-runtime-heading">
        <div><h2 id="tor-runtime-heading" className="text-sm font-medium">{tr("settings.components.TorLabPanel.text.9e88371")}</h2><p className="mt-2 text-xs leading-6 text-[var(--color-text-muted)]">{tr("settings.components.TorLabPanel.text.2c24c24")}</p></div>
        <FormItem label={tr("settings.components.TorLabPanel.label.269a55e")} consequence={tr("settings.components.TorLabPanel.hint.57b941c")}>
          <Input value={path} onChange={event => { setPath(event.target.value); setConfirmed(false) }} disabled={!status?.available || saving} placeholder={tr("settings.components.TorLabPanel.placeholder.59a84da")} spellCheck={false} className="font-mono text-xs" />
        </FormItem>
        <label className="flex items-start gap-2 text-xs leading-6 text-[var(--color-text-secondary)]"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={!status?.available || saving} className="mt-1.5" /><span>{tr("settings.components.TorLabPanel.text.17bfc27")}</span></label>
        <div className="flex flex-wrap items-center gap-3"><Button size="sm" disabled={!status?.available || !dirty || (path.trim() !== '' && !confirmed) || saving || sessions.length > 0} onClick={() => setShowConfirm(true)}><Save size={14} />{tr("settings.components.TorLabPanel.text.a2b6878")}</Button><span className="text-[10px] text-[var(--color-text-muted)]">{sessions.length > 0 ? tr("settings.components.TorLabPanel.TorLabPanel.a45f63a") : tr("settings.components.TorLabPanel.TorLabPanel.d7deda6")}</span></div>
      </section>
      <TerminalPanel title={tr("settings.components.TorLabPanel.title.cf0614e")} meta={<label className="inline-flex items-center gap-2"><input type="checkbox" checked={poll} onChange={event => setPoll(event.target.checked)} />{tr("browser.pages.BrowserLogsPage.text.297a7ec")}</label>}>
        {sessions.length === 0 ? <p className="px-5 py-7 text-xs leading-6 text-[var(--color-text-muted)]">{tr("settings.components.TorLabPanel.text.8e159fa")}</p> : <ul className="divide-y divide-[var(--color-border-muted)]">{sessions.map(session => <li key={session.profileId} className="space-y-3 px-5 py-4"><div className="flex flex-wrap items-center justify-between gap-3"><span className="break-all font-mono text-xs">{session.profileId}</span><span className="font-mono text-[10px] text-[var(--color-text-muted)]">{session.ready ? tr("ui.modules.settings.components.TorLabPanel.label.262b8ec") : session.state.toUpperCase()}</span></div><AsciiMeter value={session.bootstrapPercent} label={tr("settings.components.TorLabPanel.TorLabPanel.46069c9", [session.profileId])} /><p className="font-mono text-[10px] text-[var(--color-text-muted)]">{tr("ui.modules.settings.components.TorLabPanel.label.040be7a")}{session.socksAddress}{tr("ui.modules.settings.components.TorLabPanel.label.083234b")}{session.pid}</p>{session.lastError && <p role="alert" className="text-xs text-[var(--color-error)]">{translateMessage(session.lastError)}</p>}</li>)}</ul>}
      </TerminalPanel>
      <section className="grid gap-5 text-xs leading-6 md:grid-cols-2" aria-label={tr("settings.components.TorLabPanel.aria_label.02a7c96")}>
        <div><h2 className="mb-2 text-xs font-medium text-[var(--color-text-secondary)]">{tr("settings.components.TorLabPanel.text.38b08ed")}</h2><ul className="list-inside list-disc space-y-1 text-[var(--color-text-muted)]"><li>{tr("settings.components.TorLabPanel.text.b70247d")}</li><li>{tr("settings.components.TorLabPanel.text.82a1d4e")}</li><li>{tr("settings.components.TorLabPanel.text.476843f")}</li><li>{tr("settings.components.TorLabPanel.text.e8f2663")}</li></ul></div>
        <div><h2 className="mb-2 inline-flex items-center gap-2 text-xs font-medium text-[var(--color-warning)]"><ShieldAlert size={13} />{tr("settings.components.TorLabPanel.text.b273692")}</h2><p className="text-[var(--color-text-muted)]">{tr("settings.components.TorLabPanel.text.c4c6c2e")}</p></div>
      </section>
      <Link to="/browser/list" className="inline-flex items-center gap-2 text-xs text-[var(--color-accent)]">{tr("settings.components.TorLabPanel.text.c2bf1bc")}<ArrowRight size={13} /></Link>
      <Modal open={showConfirm} onClose={() => { if (!saving) setShowConfirm(false) }} title={path.trim() ? tr("settings.components.TorLabPanel.TorLabPanel.2eb99d2") : tr("settings.components.TorLabPanel.TorLabPanel.e4a9388")} closable={!saving}
        footer={<><Button variant="secondary" disabled={saving} onClick={() => setShowConfirm(false)}>{tr("App.CloseConfirmModal.4d0b468")}</Button><Button loading={saving} onClick={() => void save()}>{tr("settings.components.ConnectorSettingsPanel.text.706df27")}</Button></>}>
        <p className="break-all font-mono text-xs leading-7">{path.trim() || tr("settings.components.TorLabPanel.TorLabPanel.5ec5387")}</p><p className="mt-3 text-xs leading-6 text-[var(--color-text-secondary)]">{path.trim() ? tr("settings.components.TorLabPanel.TorLabPanel.02da1ef") : tr("settings.components.TorLabPanel.TorLabPanel.c871f1d")}</p>
      </Modal>
    </div>
  )
}

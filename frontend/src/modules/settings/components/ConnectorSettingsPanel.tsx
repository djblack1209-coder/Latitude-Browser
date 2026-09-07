import { useEffect, useState } from 'react'
import { ArrowRight, Check, Network, RefreshCw, Save } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button, Modal, toast } from '../../../shared/components'
import { WorkspaceHeader, TelemetryStrip, TerminalPanel } from '../../../shared/components/SignalPrimitives'
import { AsciiMeter } from '../../../shared/components/AsciiMeter'
import { fetchBrowserSettings, saveBrowserSettings, browserProxyConnectorPreflight, browserProxyCoreStatus, fetchBrowserProfiles } from '../../browser/api'
import { getGoApp } from '../../browser/api/runtime'
import type { BrowserSettings, ProxyCoreStatusResult } from '../../browser/types'
import { normalizeProxyCoreStatus } from '../../browser/utils/proxyCoreStatus'
import { SettingsSectionNav } from './SettingsSectionNav'

type Stack = 'xray' | 'mihomo'
const stacks = {
  xray: { label: 'Xray + sing-box', description: '组合连接栈', cores: ['xray', 'sing-box'], protocols: ['Xray · VMess / VLESS / Trojan / Shadowsocks / 链式代理', 'sing-box · Hysteria2 / TUIC / AnyTLS'] },
  mihomo: { label: 'Mihomo', description: '独立连接栈', cores: ['mihomo'], protocols: ['所有受支持的代理与规则均交给 Mihomo', '不调用 Xray 或 sing-box 作为备用内核'] },
} as const

const normalizeStack = (connectorType?: string): Stack => connectorType === 'mihomo' ? 'mihomo' : 'xray'

export function ConnectorSettingsPanel({ active: visible = true, onDirtyChange }: { active?: boolean; onDirtyChange?: (dirty: boolean) => void }) {
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
      if (profiles.some(profile => profile.running)) throw new Error('请先停止运行中的实例，再切换连接栈。')
      // Re-read before saving so unrelated browser settings aren't overwritten.
      const current = await fetchBrowserSettings()
      const next = { ...current, defaultConnectorType: selected }
      await saveBrowserSettings(next)
      setSettings(next)
      // Explicitly reconcile the local selection only after persistence succeeds.
      setSelected(normalizeStack(next.defaultConnectorType))
      setConfirmOpen(false)
      toast.success(`连接栈已保存：${stacks[selected].label}`)
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
      <WorkspaceHeader eyebrow="NETWORK / CONNECTOR POLICY" title="连接栈" description="选择默认连接栈，约束启动、测速与出口检查。"
        actions={<><Button variant="secondary" size="sm" onClick={() => void load()} loading={busy}><RefreshCw size={14} />刷新状态</Button><Button size="sm" disabled={!dirty || !desktop || busy} onClick={() => setConfirmOpen(true)}><Save size={14} />保存连接栈</Button></>} />
      <SettingsSectionNav current="connectors" />
      {error && <div role="alert" className="rounded-md border border-[var(--color-error)]/40 p-4 text-sm text-[var(--color-error)]">状态读取失败：{error}。请刷新后再试。</div>}
      <TelemetryStrip items={[
        { label: '当前策略', value: settings ? stacks[active].label : '—', detail: desktop ? '来自已保存的桌面配置' : '预览默认值，未连接桌面' },
        { label: '跨栈回退', value: 'OFF', detail: '不混用组合栈与独立栈' },
        { label: '本机必需内核', value: desktop && !busy && !error ? `${installed} / ${required.length}` : '—', detail: preflight?.message || '文件存在不代表出口已经连通' },
      ]} />
      <fieldset disabled={busy || saving || !!error || !desktop} className="space-y-3">
        <legend className="mb-3 text-xs font-medium text-[var(--color-text-secondary)]">选择连接策略</legend>
        {(Object.entries(stacks) as Array<[Stack, typeof stacks[Stack]]>).map(([key, stack]) => (
          <label key={key} className={`flex cursor-pointer items-start gap-4 rounded-lg border p-5 transition-colors ${selected === key ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)]' : 'border-[var(--color-border-default)] bg-[var(--color-bg-surface)]'}`}>
            <input type="radio" name="connector-stack" value={key} checked={selected === key} onChange={() => setSelected(key)} className="mt-1 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3"><span className="font-mono text-sm font-medium">{stack.label}</span><span className="text-[10px] text-[var(--color-text-muted)]">{stack.description}</span>{active === key && <span className="inline-flex items-center gap-1 text-[10px] text-[var(--color-accent)]"><Check size={12} />已保存</span>}</div>
              <ul className="mt-3 space-y-1.5 text-xs leading-6 text-[var(--color-text-secondary)]">{stack.protocols.map(protocol => <li key={protocol}>{protocol}</li>)}</ul>
            </div>
          </label>
        ))}
      </fieldset>
      <TerminalPanel title="LOCAL KERNELS" meta={desktop ? '本机文件检查 · 非连通性结论' : 'DESKTOP BRIDGE UNAVAILABLE'}>
        <div className="divide-y divide-[var(--color-border-muted)] px-4">
          {['xray', 'sing-box', 'mihomo'].map(core => {
            const status = normalizedStatuses.find(item => item.core === core)
            return <div key={core} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="min-w-0"><h3 className="font-mono text-xs">{core}</h3><p className="mt-1 break-all font-mono text-[10px] text-[var(--color-text-muted)]">{status?.binaryPath || (desktop ? '未找到本机路径' : '请在桌面应用中检查')}</p></div><span className={`font-mono text-xs ${status?.installed ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)]'}`}>{busy ? 'CHECKING' : status?.installed ? 'INSTALLED' : desktop && !error ? 'MISSING' : 'NOT CHECKED'}</span></div>
          })}
        </div>
        <div className="flex flex-wrap items-center gap-4 border-t border-[var(--color-border-muted)] px-4 py-3"><AsciiMeter value={desktop && !busy && !error ? installed / required.length * 100 : null} label="当前栈必需内核安装比例" className="w-36" /><Link to="/browser/proxy-pool" className="inline-flex items-center gap-2 text-xs text-[var(--color-accent)]">前往代理池管理内核<ArrowRight size={13} /></Link></div>
      </TerminalPanel>
      <div className="flex items-start gap-3 text-xs leading-6 text-[var(--color-text-muted)]"><Network size={16} className="mt-1 shrink-0" /><p>节点内核必须匹配当前连接栈，不自动跨栈回退。</p></div>
      <Modal open={confirmOpen} onClose={() => { if (!saving) setConfirmOpen(false) }} title="确认切换连接栈" closable={!saving} footer={<><Button variant="secondary" disabled={saving} onClick={() => setConfirmOpen(false)}>取消</Button><Button loading={saving} onClick={() => void save()}>确认保存</Button></>}>
        <div className="space-y-4 text-sm leading-7"><p className="font-mono">{stacks[active].label} → {stacks[selected].label}</p><p className="text-[var(--color-text-secondary)]">新的启动和网络检查将严格遵循所选栈。已有节点若固定为另一套内核，将拒绝执行，不会自动改写节点配置。</p><p className="text-xs text-[var(--color-text-muted)]">请先停止所有实例。保存不会自动下载内核或验证代理出口。</p></div>
      </Modal>
    </div>
  )
}

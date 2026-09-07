import { useEffect, useState } from 'react'
import { ArrowRight, FlaskConical, LockKeyhole, RefreshCw, Save, ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button, FormItem, Input, Modal, toast } from '../../../shared/components'
import { AsciiMeter } from '../../../shared/components/AsciiMeter'
import { WorkspaceHeader, TelemetryStrip, TerminalPanel } from '../../../shared/components/SignalPrimitives'
import { fetchTorStatus, setTorRuntimePath, type TorRuntimeStatus } from '../../browser/api/tor'
import { SettingsSectionNav } from './SettingsSectionNav'
import './tor-lab.css'

export function TorLabPanel({ active = true, onDirtyChange }: { active?: boolean; onDirtyChange?: (dirty: boolean) => void }) {
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
      toast.success(path.trim() ? 'Tor 运行时路径已保存；尚未连接 Tor 网络' : 'Tor 运行时已解除配置')
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : String(cause)) }
    finally { setSaving(false) }
  }

  const sessions = status?.activeProfiles || []
  return (
    <div className="space-y-5">
      <WorkspaceHeader eyebrow="PRIVACY / EXPERIMENTAL TRANSPORT" title="Tor 实验室" description="配置 Tor 运行时与实例路由。"
        actions={<Button size="sm" variant="secondary" onClick={() => void refresh()} loading={loading}><RefreshCw size={14} />刷新运行时</Button>} />
      <SettingsSectionNav current="tor" />
      <section className="tor-boundary" aria-labelledby="tor-boundary-heading">
        <div className="tor-boundary-copy">
          <p className="inline-flex items-center gap-2 font-mono text-[10px] tracking-wider text-[var(--color-warning)]"><FlaskConical size={13} aria-hidden="true" />EXPERIMENTAL · 默认关闭</p>
          <h2 id="tor-boundary-heading">保护网络路径，不承诺匿名身份。</h2>
          <p>Tor 路由可以改变网站看到的网络出口，但普通 Chromium 不具备 Tor Browser 的完整反指纹补丁。稳定的设备指纹、登录账号和 Cookie 仍可能关联身份。</p>
          <p className="tor-boundary-emphasis">逼真指纹 ≠ 第二重匿名保护。高风险匿名浏览应使用官方 Tor Browser。</p>
        </div>
        <div className="tor-layer-map" aria-label="保护边界示意：浏览器身份与 Tor 网络路径是不同问题，不代表两层匿名保证">
          <span className="tor-layer-orbit tor-layer-orbit-outer" aria-hidden="true" />
          <span className="tor-layer-orbit tor-layer-orbit-inner" aria-hidden="true" />
          <span className="tor-layer-node"><LockKeyhole size={22} strokeWidth={1.2} aria-hidden="true" /></span>
          <span className="tor-layer-tag tor-layer-tag-top">NETWORK / TOR</span>
          <span className="tor-layer-tag tor-layer-tag-bottom">IDENTITY / SEPARATE</span>
        </div>
      </section>
      <TelemetryStrip items={[
        { label: '运行时文件', value: !status?.available ? '—' : status.binaryValid ? '已配置' : '未就绪', detail: '仅路径检查，不等于签名验证或连接成功' },
        { label: '受管 Tor 进程', value: status?.available ? String(sessions.length).padStart(2, '0') : '—', detail: '每个实例独立进程与数据目录' },
        { label: '生产匿名准入', value: '未通过', tone: 'warning', detail: '实验性传输，不作无泄漏认证' },
      ]} />
      {(error || !status?.available) && <p role={error ? 'alert' : 'note'} className="rounded-md border border-[var(--color-border-default)] p-4 text-xs leading-6 text-[var(--color-text-secondary)]">{error || status?.message || '正在读取运行时状态…'}</p>}
      <section className="space-y-4 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-5" aria-labelledby="tor-runtime-heading">
        <div><h2 id="tor-runtime-heading" className="text-sm font-medium">受信任的 Tor 可执行文件</h2><p className="mt-2 text-xs leading-6 text-[var(--color-text-muted)]">使用已核验官方签名的 Tor Expert Bundle。保留随附依赖文件；此处不会下载、执行版本探测或替你验证发行签名。</p></div>
        <FormItem label="Tor 二进制绝对路径" hint="选择文件意味着信任该本地程序；仅允许普通可执行文件。">
          <Input value={path} onChange={event => { setPath(event.target.value); setConfirmed(false) }} disabled={!status?.available || saving} placeholder="/绝对路径/tor/tor" spellCheck={false} className="font-mono text-xs" />
        </FormItem>
        <label className="flex items-start gap-2 text-xs leading-6 text-[var(--color-text-secondary)]"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={!status?.available || saving} className="mt-1.5" /><span>我已验证来源与签名，理解这只启用实验性网络传输，不等同于 Tor Browser 或匿名保证。</span></label>
        <div className="flex flex-wrap items-center gap-3"><Button size="sm" disabled={!status?.available || !dirty || (path.trim() !== '' && !confirmed) || saving || sessions.length > 0} onClick={() => setShowConfirm(true)}><Save size={14} />保存运行时路径</Button><span className="text-[10px] text-[var(--color-text-muted)]">{sessions.length > 0 ? '请先停止 Tor 实例再修改路径' : '保存路径不会启动 Tor，也不会更改已有实例'}</span></div>
      </section>
      <TerminalPanel title="MANAGED SESSIONS" meta={<label className="inline-flex items-center gap-2"><input type="checkbox" checked={poll} onChange={event => setPoll(event.target.checked)} />自动刷新</label>}>
        {sessions.length === 0 ? <p className="px-5 py-7 text-xs leading-6 text-[var(--color-text-muted)]">当前没有受管 Tor 会话。先配置运行时，再在实例编辑页选择「Tor 路由（实验性）」。</p> : <ul className="divide-y divide-[var(--color-border-muted)]">{sessions.map(session => <li key={session.profileId} className="space-y-3 px-5 py-4"><div className="flex flex-wrap items-center justify-between gap-3"><span className="break-all font-mono text-xs">{session.profileId}</span><span className="font-mono text-[10px] text-[var(--color-text-muted)]">{session.ready ? 'TOR BOOTSTRAPPED' : session.state.toUpperCase()}</span></div><AsciiMeter value={session.bootstrapPercent} label={`实例 ${session.profileId} Tor 引导进度`} /><p className="font-mono text-[10px] text-[var(--color-text-muted)]">SOCKS {session.socksAddress} · PID {session.pid}</p>{session.lastError && <p role="alert" className="text-xs text-[var(--color-error)]">{session.lastError}</p>}</li>)}</ul>}
      </TerminalPanel>
      <section className="grid gap-5 text-xs leading-6 md:grid-cols-2" aria-label="当前安全边界">
        <div><h2 className="mb-2 font-mono text-[10px] tracking-wider text-[var(--color-text-secondary)]">FAIL CLOSED</h2><ul className="list-inside list-disc space-y-1 text-[var(--color-text-muted)]"><li>引导未完成或进程失败，不启动浏览器。</li><li>Tor 退出后停止依赖实例，不回退直连。</li><li>锁定代理与 DNS 参数，限制 WebRTC / QUIC。</li><li>不混用普通代理栈，禁用加载扩展；本地 CDP 仍保留。</li></ul></div>
        <div><h2 className="mb-2 inline-flex items-center gap-2 font-mono text-[10px] tracking-wider text-[var(--color-warning)]"><ShieldAlert size={13} />OUT OF SCOPE</h2><p className="text-[var(--color-text-muted)]">不抵御终端失陷、浏览器漏洞、全局时序关联或账号泄漏。未完成跨平台抓包与 DNS / IPv6 / WebRTC 泄漏验证前，不作为生产匿名功能发布。</p></div>
      </section>
      <Link to="/browser/list" className="inline-flex items-center gap-2 text-xs text-[var(--color-accent)]">返回实例管理<ArrowRight size={13} /></Link>
      <Modal open={showConfirm} onClose={() => { if (!saving) setShowConfirm(false) }} title={path.trim() ? '信任并配置 Tor 运行时' : '解除 Tor 运行时配置'} closable={!saving}
        footer={<><Button variant="secondary" disabled={saving} onClick={() => setShowConfirm(false)}>取消</Button><Button loading={saving} onClick={() => void save()}>确认保存</Button></>}>
        <p className="break-all font-mono text-xs leading-7">{path.trim() || '清空可执行文件路径'}</p><p className="mt-3 text-xs leading-6 text-[var(--color-text-secondary)]">{path.trim() ? '该程序将在你明确启动 Tor 实例时执行。保存只验证文件路径及权限，不验证来源、签名、网络或匿名性。' : '之后 Tor 模式实例会拒绝启动，直到重新配置有效运行时。现有普通实例不受影响。'}</p>
      </Modal>
    </div>
  )
}

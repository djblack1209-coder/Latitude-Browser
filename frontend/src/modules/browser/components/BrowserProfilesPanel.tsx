import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Copy, Download, FolderOpen, Key, Loader2, MoreHorizontal, Play, Puzzle, RadioTower, Repeat2, RotateCcw, Settings, Square, Trash2, Wifi } from 'lucide-react'

import { Badge, Button, Card, Table } from '../../../shared/components'
import { SignalEmptyState } from '../../../shared/components/SignalPrimitives'
import type { TableColumn } from '../../../shared/components/Table'

import type { BrowserCore, BrowserProfile, BrowserProxy, ProxySpeedTestResult } from '../types'
import { browserProxyTestSpeed, testProxyConnectivity } from '../api'
import type { BrowserViewMode } from './BrowserListLayout'
import { LaunchCodeCell } from './BrowserListWidgets'
import {
  formatBrowserProfileActivity,
  getBrowserProfileAttentionReasons,
  type BrowserWorkspaceMode,
} from '../pages/browserList/workspaceMode'

type ProfileStatusVariant = 'default' | 'success' | 'error' | 'warning' | 'info'

interface ProfileStatus {
  variant: ProfileStatusVariant
  label: string
}

interface BrowserProfilesPanelProps {
  workspaceMode: BrowserWorkspaceMode
  loading: boolean
  totalProfileCount: number
  hasActiveFilters: boolean
  onClearFilters: () => void
  viewMode: BrowserViewMode
  profiles: BrowserProfile[]
  proxies: BrowserProxy[]
  selectedIds: Set<string>
  resolveProfileCore: (profile: BrowserProfile) => BrowserCore | null
  getProfileCoreLabel: (profile: BrowserProfile) => string
  getProfileStatus: (profile: BrowserProfile) => ProfileStatus
  isProfileStarting: (profileId: string) => boolean
  isProfileStopping: (profileId: string) => boolean
  isProfileBusy: (profileId: string) => boolean
  onToggleSelect: (profileId: string) => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onRefreshProfiles: () => void
  onStart: (profileId: string) => void
  onStop: (profileId: string) => void
  onRestart: (profileId: string) => void
  onOpenKeywords: (profile: BrowserProfile) => void
  onOpenExtensions: (profile: BrowserProfile) => void
  onOpenDataDir: (profile: BrowserProfile) => void
  onExport: (profile: BrowserProfile) => void
  onOpenCopy: (profile: BrowserProfile) => void
  onOpenProxyPicker: (profile: BrowserProfile) => void
  onDelete: (profileId: string) => void
}


function formatProxyLabel(profile: BrowserProfile, proxy?: BrowserProxy): string {
  if (profile.networkMode === 'tor') {
    return 'Tor TCP（实验性）'
  }
  if (proxy?.proxyName) {
    return proxy.proxyName
  }
  if (profile.proxyId) {
    return profile.proxyId
  }
  const customProxy = (profile.proxyConfig || '').trim()
  if (customProxy) {
    return `自定义: ${customProxy}`
  }
  return '-'
}

function ProxyLatency({ result }: { result?: ProxySpeedTestResult | null }) {
  if (!result) return null
  if (!result.ok) return <span className="text-xs text-[var(--color-error)]">失败</span>
  const color = result.latencyMs < 200
    ? 'text-[var(--color-success)]'
    : result.latencyMs < 500
      ? 'text-[var(--color-warning)]'
      : 'text-[var(--color-error)]'
  return <span className={`text-xs font-medium ${color}`}>{result.latencyMs}ms</span>
}

function ProxyInlineActions({
  profile,
  proxy,
  isBusy,
  onOpenProxyPicker,
  maxWidthClass = 'max-w-[220px]',
}: {
  profile: BrowserProfile
  proxy?: BrowserProxy
  isBusy: boolean
  onOpenProxyPicker: (profile: BrowserProfile) => void
  maxWidthClass?: string
}) {
  const [testing, setTesting] = useState(false)
  const [speedResult, setSpeedResult] = useState<ProxySpeedTestResult | null>(null)

  if (profile.networkMode === 'tor') {
    return (
      <div
        className={`inline-flex ${maxWidthClass} items-center gap-1.5 text-xs text-[var(--color-warning)]`}
        title="Tor TCP 路由（实验性），常规代理切换与测速不适用"
      >
        <RadioTower className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 truncate">Tor TCP</span>
        <span className="shrink-0 rounded-sm border border-[color:color-mix(in_srgb,var(--color-warning)_45%,transparent)] px-1 py-0.5 text-[10px] leading-none">
          实验性
        </span>
      </div>
    )
  }
  const historyResult = proxy?.lastTestedAt
    ? {
        proxyId: proxy.proxyId,
        ok: proxy.lastTestOk ?? false,
        latencyMs: proxy.lastLatencyMs ?? -1,
        error: '',
      }
    : null
  const displayResult = speedResult || historyResult
  const canTest = !!profile.proxyId || !!profile.proxyConfig.trim()

  const handleTest = async () => {
    if (testing || !canTest) return
    setTesting(true)
    try {
      const result = profile.proxyId
        ? await browserProxyTestSpeed(profile.proxyId)
        : await testProxyConnectivity(profile.profileId, profile.proxyConfig)
      setSpeedResult(result)
    } catch (error: any) {
      setSpeedResult({
        proxyId: profile.proxyId || profile.profileId,
        ok: false,
        latencyMs: -1,
        error: error?.message || '测速失败',
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className={`inline-flex ${maxWidthClass} items-center gap-1.5 text-xs`} title={formatProxyLabel(profile, proxy)}>
      <span className="min-w-0 truncate text-[var(--color-text-primary)]">{formatProxyLabel(profile, proxy)}</span>
      <button
        type="button"
        className="shrink-0 rounded-sm p-0.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={isBusy ? '实例操作中，暂不可切换代理' : `切换代理：${profile.profileName}`}
        title={isBusy ? '实例操作中，暂不可切换代理' : '切换代理'}
        disabled={isBusy}
        onClick={() => onOpenProxyPicker(profile)}
      >
        <Repeat2 className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className="shrink-0 rounded-sm p-0.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={canTest ? `测速代理：${profile.profileName}` : '无可测速代理'}
        title={canTest ? '测速' : '无可测速代理'}
        disabled={testing || !canTest}
        onClick={handleTest}
      >
        {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
      </button>
      <ProxyLatency result={displayResult} />
    </div>
  )
}

function ProfileMoreActions({
  label,
  open,
  disabled,
  onToggle,
  onClose,
  onRestart,
  onOpenKeywords,
  onOpenExtensions,
  onOpenDataDir,
  onOpenCopy,
  onExport,
  onDelete,
}: {
  label?: string
  open: boolean
  disabled: boolean
  onToggle: () => void
  onClose: () => void
  onRestart: () => void
  onOpenKeywords: () => void
  onOpenExtensions: () => void
  onOpenDataDir: () => void
  onOpenCopy: () => void
  onExport: () => void
  onDelete: () => void
}) {
  const triggerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (!open) return
    const updateMenuPosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      const menuWidth = 128
      const menuHeight = 304
      const gap = 8
      const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8))
      const belowTop = rect.bottom + gap
      const top = belowTop + menuHeight > window.innerHeight
        ? Math.max(8, rect.top - menuHeight - gap)
        : belowTop
      setMenuPosition({ top, left })
    }
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        onClose()
      }
    }
    updateMenuPosition()
    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [open, onClose])

  const runAndClose = (handler: () => void) => {
    handler()
    onClose()
  }

  return (
    <>
    <div ref={triggerRef} className="inline-flex">
      <Button
        size="sm"
        variant="ghost"
        onClick={onToggle}
        aria-label={label ? `更多操作：${label}` : '更多操作'}
        aria-expanded={open}
        aria-haspopup="menu"
        title="更多"
        disabled={disabled}
        className="px-2"
      >
        <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
    </div>
      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={label ? `${label}更多操作` : '实例更多操作'}
          className="fixed z-[9999] w-32 rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] p-1 shadow-[var(--shadow-lg)]"
          style={{ top: menuPosition.top, left: menuPosition.left }}
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            onClick={() => runAndClose(onRestart)}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            重启
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            onClick={() => runAndClose(onOpenKeywords)}
          >
            <Key className="w-3.5 h-3.5" />
            关键字
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            onClick={() => runAndClose(onOpenExtensions)}
          >
            <Puzzle className="w-3.5 h-3.5" />
            插件
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            onClick={() => runAndClose(onOpenDataDir)}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            数据目录
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            onClick={() => runAndClose(onOpenCopy)}
          >
            <Copy className="w-3.5 h-3.5" />
            克隆
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            onClick={() => runAndClose(onExport)}
          >
            <Download className="w-3.5 h-3.5" />
            导出
          </button>
          <button
            type="button"
            role="menuitem"
            className="mt-1 flex w-full items-center gap-2 border-t border-[var(--color-border-muted)] px-2.5 py-2 pt-2 text-left text-xs text-[var(--color-error)] transition-colors hover:bg-[var(--color-error)]/10 focus:outline-none focus:ring-1 focus:ring-[var(--color-error)]"
            onClick={() => runAndClose(onDelete)}
          >
            <Trash2 className="w-3.5 h-3.5" />
            删除
          </button>
        </div>,
        document.body
      )}
    </>
  )
}

function BrowserProfileWorkspaceContext({
  profile,
  workspaceMode,
  hasResolvedCore,
  compact = false,
  onOpenCopy,
}: {
  profile: BrowserProfile
  workspaceMode: BrowserWorkspaceMode
  hasResolvedCore: boolean
  compact?: boolean
  onOpenCopy: (profile: BrowserProfile) => void
}) {
  if (workspaceMode === 'all') return null

  if (workspaceMode === 'recent') {
    return (
      <span className="font-mono text-[11px] tabular-nums text-[var(--color-text-muted)]">
        {formatBrowserProfileActivity(profile)}
      </span>
    )
  }

  if (workspaceMode === 'attention') {
    const reasons = getBrowserProfileAttentionReasons(profile, hasResolvedCore)
    const fullText = reasons.join('；')
    return (
      <span className="block min-w-0 text-xs leading-5 text-[var(--color-warning)]" title={fullText}>
        {compact ? reasons[0] : fullText}
        {compact && reasons.length > 1 ? `，另有 ${reasons.length - 1} 项` : ''}
      </span>
    )
  }

  const argumentCount = profile.fingerprintArgs.filter((argument) => argument.trim()).length
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      <div className="min-w-0">
        <span className="block text-xs font-medium text-[var(--color-text-primary)]">来源：现有实例配置</span>
        <span className="mt-0.5 block font-mono text-[11px] tabular-nums text-[var(--color-text-muted)]">
          {argumentCount} 条显式指纹参数
        </span>
      </div>
      <Button size="sm" variant="secondary" onClick={() => onOpenCopy(profile)} className="shrink-0">
        <Copy className="h-3.5 w-3.5" />按原配置克隆
      </Button>
    </div>
  )
}

function BrowserProfileCard({
  profile,
  workspaceMode,
  proxy,
  isSelected,
  status,
  coreLabel,
  hasResolvedCore,
  isStarting,
  isStopping,
  isBusy,
  onToggleSelect,
  onRefreshProfiles,
  onStart,
  onStop,
  onRestart,
  onOpenKeywords,
  onOpenExtensions,
  onOpenDataDir,
  onExport,
  onOpenCopy,
  onOpenProxyPicker,
  onDelete,
}: {
  profile: BrowserProfile
  workspaceMode: BrowserWorkspaceMode
  proxy: BrowserProxy | undefined
  isSelected: boolean
  status: ProfileStatus
  coreLabel: string
  hasResolvedCore: boolean
  isStarting: boolean
  isStopping: boolean
  isBusy: boolean
  onToggleSelect: (profileId: string) => void
  onRefreshProfiles: () => void
  onStart: (profileId: string) => void
  onStop: (profileId: string) => void
  onRestart: (profileId: string) => void
  onOpenKeywords: (profile: BrowserProfile) => void
  onOpenExtensions: (profile: BrowserProfile) => void
  onOpenDataDir: (profile: BrowserProfile) => void
  onExport: (profile: BrowserProfile) => void
  onOpenCopy: (profile: BrowserProfile) => void
  onOpenProxyPicker: (profile: BrowserProfile) => void
  onDelete: (profileId: string) => void
}) {
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <div
      className={`browser-profile-card relative flex min-h-[176px] flex-col overflow-visible rounded-sm border bg-[var(--color-bg-surface)] p-4 shadow-none transition-[border-color,background-color] duration-150
        ${isSelected ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)]/35' : 'border-[var(--color-border-default)] hover:border-[var(--color-border-strong)]'}
      `}
    >
      <div className="flex items-start gap-3">
        {profile.running ? (
          <Button size="sm" variant="secondary" onClick={() => onStop(profile.profileId)} aria-label={isStopping ? `停止实例中：${profile.profileName}` : `停止实例：${profile.profileName}`} title={isStopping ? '停止中' : '停止'} loading={isStopping} className="shrink-0">
            {!isStopping && <Square className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isStopping ? '停止中' : '停止'}</span>
          </Button>
        ) : (
          <Button size="sm" onClick={() => onStart(profile.profileId)} aria-label={isStarting ? `启动实例中：${profile.profileName}` : `启动实例：${profile.profileName}`} title={isStarting ? '启动中' : '启动'} loading={isStarting} className="shrink-0">
            {!isStarting && <Play className="w-3.5 h-3.5 fill-current" />}
            <span className="hidden sm:inline">{isStarting ? '启动中' : '启动'}</span>
          </Button>
        )}
        <input
          type="checkbox"
          className="h-4 w-4 shrink-0 cursor-pointer rounded-sm accent-[var(--color-accent)]"
          checked={isSelected}
          aria-label={`选择实例：${profile.profileName}`}
          onChange={() => onToggleSelect(profile.profileId)}
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <Link className="truncate text-sm font-medium text-[var(--color-accent)] transition-colors hover:underline" to={`/browser/detail/${profile.profileId}`}>
              {profile.profileName}
            </Link>
            <Badge variant={status.variant} dot dotClassName="h-1.5 w-1.5 shrink-0">{status.label}</Badge>
          </div>
          <p className="mt-1 truncate text-xs text-[var(--color-text-muted)]">{coreLabel}</p>
          {workspaceMode !== 'all' && (
            <div className="mt-2 border-t border-[var(--color-border-muted)] pt-2">
              <BrowserProfileWorkspaceContext
                profile={profile}
                workspaceMode={workspaceMode}
                hasResolvedCore={hasResolvedCore}
                compact
                onOpenCopy={onOpenCopy}
              />
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Link to={`/browser/edit/${profile.profileId}`}><Button size="sm" variant="ghost" aria-label={`配置实例：${profile.profileName}`} title="配置" className="px-2" disabled={isBusy}><Settings className="w-3.5 h-3.5" /></Button></Link>
          <ProfileMoreActions
            label={profile.profileName}
            open={moreOpen}
            disabled={isBusy}
            onToggle={() => setMoreOpen((open) => !open)}
            onClose={() => setMoreOpen(false)}
            onRestart={() => onRestart(profile.profileId)}
            onOpenKeywords={() => onOpenKeywords(profile)}
            onOpenExtensions={() => onOpenExtensions(profile)}
            onOpenDataDir={() => onOpenDataDir(profile)}
            onOpenCopy={() => onOpenCopy(profile)}
            onExport={() => onExport(profile)}
            onDelete={() => onDelete(profile.profileId)}
          />
        </div>
      </div>

      <div className="mt-auto flex min-w-0 items-center justify-between gap-3 border-t border-[var(--color-border-muted)] pt-3 text-xs">
        <ProxyInlineActions
          profile={profile}
          proxy={proxy}
          isBusy={isBusy}
          onOpenProxyPicker={onOpenProxyPicker}
          maxWidthClass="min-w-0 max-w-full"
        />
        {profile.launchCode && (
          <div className="hidden shrink-0 items-center gap-1.5 text-[var(--color-text-muted)] md:flex">
            <span className="sr-only">快捷码</span>
            <LaunchCodeCell profileId={profile.profileId} code={profile.launchCode} onRefresh={onRefreshProfiles} />
          </div>
        )}
      </div>
    </div>
  )
}

export function BrowserProfilesPanel({
  workspaceMode,
  loading,
  totalProfileCount,
  hasActiveFilters,
  onClearFilters,
  viewMode,
  profiles,
  proxies,
  selectedIds,
  resolveProfileCore,
  getProfileCoreLabel,
  getProfileStatus,
  isProfileStarting,
  isProfileStopping,
  isProfileBusy,
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
  onRefreshProfiles,
  onStart,
  onStop,
  onRestart,
  onOpenKeywords,
  onOpenExtensions,
  onOpenDataDir,
  onExport,
  onOpenCopy,
  onOpenProxyPicker,
  onDelete,
}: BrowserProfilesPanelProps) {
  const allSelected = profiles.length > 0 && selectedIds.size === profiles.length
  const partiallySelected = selectedIds.size > 0 && selectedIds.size < profiles.length
  const [openMoreProfileId, setOpenMoreProfileId] = useState<string | null>(null)

  const columns: TableColumn<BrowserProfile>[] = [
    {
      key: 'primaryAction',
      title: '启动',
      width: 86,
      render: (_, record) => {
        const isStarting = isProfileStarting(record.profileId)
        const isStopping = isProfileStopping(record.profileId)
        const isBusy = isProfileBusy(record.profileId)
        return record.running ? (
          <Button size="sm" variant="secondary" onClick={() => onStop(record.profileId)} aria-label={isStopping ? `停止实例中：${record.profileName}` : `停止实例：${record.profileName}`} title={isStopping ? '停止中' : '停止'} loading={isStopping} className="min-w-[68px]">
            {!isStopping && <Square className="w-3.5 h-3.5" />}
            <span>{isStopping ? '停止中' : '停止'}</span>
          </Button>
        ) : (
          <Button size="sm" onClick={() => onStart(record.profileId)} aria-label={isStarting ? `启动实例中：${record.profileName}` : `启动实例：${record.profileName}`} title={isStarting ? '启动中' : '启动'} loading={isStarting} disabled={isBusy} className="min-w-[68px]">
            {!isStarting && <Play className="w-3.5 h-3.5 fill-current" />}
            <span>{isStarting ? '启动中' : '启动'}</span>
          </Button>
        )
      },
    },
    {
      key: 'selection',
      title: (
        <input
          type="checkbox"
          className="h-4 w-4 cursor-pointer rounded-sm accent-[var(--color-accent)]"
          checked={allSelected}
          aria-label={allSelected ? '取消选择全部实例' : '选择全部实例'}
          ref={(input) => {
            if (input) {
              input.indeterminate = partiallySelected
            }
          }}
          onChange={(event) => {
            if (event.target.checked) {
              onSelectAll()
            } else {
              onDeselectAll()
            }
          }}
        />
      ),
      width: 40,
      render: (_, record) => (
        <input
          type="checkbox"
          className="h-4 w-4 cursor-pointer rounded-sm accent-[var(--color-accent)]"
          checked={selectedIds.has(record.profileId)}
          aria-label={`选择实例：${record.profileName}`}
          onChange={() => onToggleSelect(record.profileId)}
        />
      ),
    },
    {
      key: 'profileName',
      title: '实例名称',
      width: 280,
      render: (value, record) => (
        <div className="min-w-0 max-w-[280px]">
          <Link className="block truncate text-sm font-medium text-[var(--color-text-primary)] hover:text-[var(--color-accent)]" to={`/browser/detail/${record.profileId}`} title={String(value || '')}>
            {value}
          </Link>
          <span className="mt-0.5 block truncate text-xs text-[var(--color-text-muted)]">{getProfileCoreLabel(record)}</span>
        </div>
      ),
    },
    {
      key: 'running',
      title: '状态',
      width: 100,
      render: (_, record) => {
        const status = getProfileStatus(record)
        return <Badge variant={status.variant} dot>{status.label}</Badge>
      },
    },
    {
      key: 'proxyId',
      title: '代理',
      width: 210,
      render: (value, record) => {
        const proxy = proxies.find(item => item.proxyId === value)
        const isBusy = isProfileBusy(record.profileId)
        return <ProxyInlineActions profile={record} proxy={proxy} isBusy={isBusy} onOpenProxyPicker={onOpenProxyPicker} />
      },
    },
    ...(workspaceMode === 'all' ? [] : [{
      key: 'workspaceContext',
      title: workspaceMode === 'recent' ? '最近记录' : workspaceMode === 'attention' ? '诊断依据' : '配置来源',
      width: workspaceMode === 'templates' ? 260 : 240,
      render: (_: unknown, record: BrowserProfile) => (
        <BrowserProfileWorkspaceContext
          profile={record}
          workspaceMode={workspaceMode}
          hasResolvedCore={Boolean(resolveProfileCore(record))}
          onOpenCopy={onOpenCopy}
        />
      ),
    } satisfies TableColumn<BrowserProfile>]),
    {
      key: 'actions',
      title: '操作',
      width: 120,
      align: 'right',
      render: (_, record) => {
        const isBusy = isProfileBusy(record.profileId)
        const isMoreOpen = openMoreProfileId === record.profileId

        return (
          <div className="flex justify-end gap-1 whitespace-nowrap">
            <Link to={`/browser/edit/${record.profileId}`}><Button size="sm" variant="ghost" aria-label={`配置实例：${record.profileName}`} title="配置" disabled={isBusy}><Settings className="w-3.5 h-3.5" /></Button></Link>
            <ProfileMoreActions
              label={record.profileName}
              open={isMoreOpen}
              disabled={isBusy}
              onToggle={() => setOpenMoreProfileId(isMoreOpen ? null : record.profileId)}
              onClose={() => setOpenMoreProfileId(null)}
              onRestart={() => onRestart(record.profileId)}
              onOpenKeywords={() => onOpenKeywords(record)}
              onOpenExtensions={() => onOpenExtensions(record)}
              onOpenDataDir={() => onOpenDataDir(record)}
              onOpenCopy={() => onOpenCopy(record)}
              onExport={() => onExport(record)}
              onDelete={() => onDelete(record.profileId)}
            />
          </div>
        )
      },
    },
  ]

  return (
    <Card padding="none" className="browser-instance-panel">
      <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 250px)' }}>
        {loading ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-2 py-16 text-sm text-[var(--color-text-muted)]" role="status" aria-live="polite">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--color-accent)]" aria-hidden="true" />
            <span>正在加载实例</span>
          </div>
        ) : profiles.length === 0 ? (
          <div className="flex min-h-64 items-center justify-center px-6 py-12" role="status" aria-live="polite">
            <SignalEmptyState
              symbol={workspaceMode === 'templates' ? 'fingerprint' : 'logs'}
              title={
                hasActiveFilters && totalProfileCount > 0
                  ? '没有匹配的实例'
                  : workspaceMode === 'attention'
                    ? '当前没有需要处理的实例'
                    : workspaceMode === 'templates'
                      ? '没有可复用的指纹配置'
                      : '还没有实例配置'
              }
              description={
                hasActiveFilters && totalProfileCount > 0
                  ? '当前筛选条件没有结果，调整条件或清除筛选后重试。'
                  : workspaceMode === 'attention'
                    ? '没有检测到运行错误、运行警告、缺失数据目录或缺失可用内核。'
                    : workspaceMode === 'templates'
                      ? '现有实例没有显式指纹参数。保存一份实例配置后，才会在这里作为复用来源出现。'
                      : '创建一个实例后，它会出现在这里。'
              }
              action={hasActiveFilters && totalProfileCount > 0 ? (
                <Button size="sm" variant="secondary" onClick={onClearFilters}>
                  清除筛选
                </Button>
              ) : undefined}
            />
          </div>
        ) : viewMode === 'table' ? (
          <Table
            className="browser-instance-table"
            columns={columns}
            data={profiles}
            rowKey="profileId"
          />
        ) : (
          <div className="browser-profile-grid flex flex-wrap items-start content-start gap-4 p-4">
            {profiles.map((profile) => (
              <div key={profile.profileId} className="min-w-[320px] max-w-[620px] flex-[1_1_420px]">
                <BrowserProfileCard
                  profile={profile}
                  workspaceMode={workspaceMode}
                  proxy={proxies.find(item => item.proxyId === profile.proxyId)}
                  isSelected={selectedIds.has(profile.profileId)}
                  status={getProfileStatus(profile)}
                  coreLabel={resolveProfileCore(profile)?.coreName || getProfileCoreLabel(profile)}
                  hasResolvedCore={Boolean(resolveProfileCore(profile))}
                  isStarting={isProfileStarting(profile.profileId)}
                  isStopping={isProfileStopping(profile.profileId)}
                  isBusy={isProfileBusy(profile.profileId)}
                  onToggleSelect={onToggleSelect}
                  onRefreshProfiles={onRefreshProfiles}
                  onStart={onStart}
                  onStop={onStop}
                  onRestart={onRestart}
                  onOpenKeywords={onOpenKeywords}
                  onOpenExtensions={onOpenExtensions}
                  onOpenDataDir={onOpenDataDir}
                  onExport={onExport}
                  onOpenCopy={onOpenCopy}
                  onOpenProxyPicker={onOpenProxyPicker}
                  onDelete={onDelete}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

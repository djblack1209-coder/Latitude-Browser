import { relativeTime, formatDate } from '../../../shared/i18n'
import { tr, useLocale } from '../../../shared/i18n'
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
  getBrowserProfileActivity,
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
    return tr("browser.components.BrowserProfilesPanel.formatProxyLabel.a4fc731")
  }
  if (proxy?.proxyName) {
    return proxy.proxyName
  }
  if (profile.proxyId) {
    return profile.proxyId
  }
  const customProxy = (profile.proxyConfig || '').trim()
  if (customProxy) {
    return tr("browser.components.BrowserProfilesPanel.formatProxyLabel.9862d87", [customProxy])
  }
  return '-'
}

function ProxyLatency({ result }: { result?: ProxySpeedTestResult | null }) {
  useLocale()

  if (!result) return null
  if (!result.ok) return <span className="text-xs text-[var(--color-error)]">{tr("browser.components.AutomationScriptHistoryModal.getRunStatusLabel.3e3c806")}</span>
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
  useLocale()

  const [testing, setTesting] = useState(false)
  const [speedResult, setSpeedResult] = useState<ProxySpeedTestResult | null>(null)

  if (profile.networkMode === 'tor') {
    return (
      <div
        className={`inline-flex ${maxWidthClass} items-center gap-1.5 text-xs text-[var(--color-warning)]`}
        title={tr("browser.components.BrowserProfilesPanel.title.59862d5")}
      >
        <RadioTower className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 truncate">{tr("ui.modules.browser.components.BrowserProfilesPanel.label.3667792")}</span>
        <span className="shrink-0 rounded-sm border border-[color:color-mix(in_srgb,var(--color-warning)_45%,transparent)] px-1 py-0.5 text-[10px] leading-none">{tr("browser.components.BrowserProfilesPanel.text.2600d79")}</span>
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
        error: error?.message || tr("browser.components.BrowserProfilesPanel.ProxyInlineActions.efe2c8c"),
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
        aria-label={isBusy ? tr("browser.components.BrowserProfilesPanel.ProxyInlineActions.e8bf256") : tr("browser.components.BrowserProfilesPanel.ProxyInlineActions.8dfa43b", [profile.profileName])}
        title={isBusy ? tr("browser.components.BrowserProfilesPanel.ProxyInlineActions.e8bf256") : tr("browser.components.BrowserProfilesPanel.ProxyInlineActions.a466de9")}
        disabled={isBusy}
        onClick={() => onOpenProxyPicker(profile)}
      >
        <Repeat2 className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className="shrink-0 rounded-sm p-0.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={canTest ? tr("browser.components.BrowserProfilesPanel.ProxyInlineActions.93c0db1", [profile.profileName]) : tr("browser.components.BrowserProfilesPanel.ProxyInlineActions.f2b5254")}
        title={canTest ? tr("browser.api.proxies.unavailableSpeedResult.304d8c0") : tr("browser.components.BrowserProfilesPanel.ProxyInlineActions.f2b5254")}
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
  useLocale()

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
        aria-label={label ? tr("browser.components.BrowserProfilesPanel.ProfileMoreActions.205e012", [label]) : tr("browser.components.BrowserProfilesPanel.ProfileMoreActions.77836d3")}
        aria-expanded={open}
        aria-haspopup="menu"
        title={tr("browser.components.BrowserProfilesPanel.title.9b0c6c7")}
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
          aria-label={label ? tr("browser.components.BrowserProfilesPanel.ProfileMoreActions.4aa1074", [label]) : tr("browser.components.BrowserProfilesPanel.ProfileMoreActions.251ea39")}
          className="fixed z-[9999] w-32 rounded-sm border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] p-1 shadow-[var(--shadow-lg)]"
          style={{ top: menuPosition.top, left: menuPosition.left }}
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            onClick={() => runAndClose(onRestart)}
          >
            <RotateCcw className="w-3.5 h-3.5" />{tr("browser.components.BrowserProfilesPanel.text.385c272")}</button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            onClick={() => runAndClose(onOpenKeywords)}
          >
            <Key className="w-3.5 h-3.5" />{tr("browser.components.BrowserProfilesPanel.text.621219f")}</button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            onClick={() => runAndClose(onOpenExtensions)}
          >
            <Puzzle className="w-3.5 h-3.5" />{tr("browser.components.BrowserProfilesPanel.text.76fcd73")}</button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            onClick={() => runAndClose(onOpenDataDir)}
          >
            <FolderOpen className="w-3.5 h-3.5" />{tr("browser.components.BrowserProfilesPanel.text.9742cd9")}</button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            onClick={() => runAndClose(onOpenCopy)}
          >
            <Copy className="w-3.5 h-3.5" />{tr("browser.components.BrowserProfilesPanel.text.6e60458")}</button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            onClick={() => runAndClose(onExport)}
          >
            <Download className="w-3.5 h-3.5" />{tr("browser.components.AutomationScriptExportModal.text.1888967")}</button>
          <button
            type="button"
            role="menuitem"
            className="mt-1 flex w-full items-center gap-2 border-t border-[var(--color-border-muted)] px-2.5 py-2 pt-2 text-left text-xs text-[var(--color-error)] transition-colors hover:bg-[var(--color-error)]/10 focus:outline-none focus:ring-1 focus:ring-[var(--color-error)]"
            onClick={() => runAndClose(onDelete)}
          >
            <Trash2 className="w-3.5 h-3.5" />{tr("browser.components.BrowserListLayout.title.3755f56")}</button>
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
  useLocale()

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
        {compact && reasons.length > 1 ? tr("browser.components.BrowserProfilesPanel.BrowserProfileWorkspaceContext.fac15c8", [reasons.length - 1]) : ''}
      </span>
    )
  }

  const argumentCount = profile.fingerprintArgs.filter((argument) => argument.trim()).length
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      <div className="min-w-0">
        <span className="block text-xs font-medium text-[var(--color-text-primary)]">{tr("browser.components.BrowserProfilesPanel.text.3c1c17f")}</span>
        <span className="mt-0.5 block font-mono text-[11px] tabular-nums text-[var(--color-text-muted)]">
          {argumentCount}{tr("browser.components.BrowserProfilesPanel.text.5f21c95")}</span>
      </div>
      <Button size="sm" variant="secondary" onClick={() => onOpenCopy(profile)} className="shrink-0">
        <Copy className="h-3.5 w-3.5" />{tr("browser.components.BrowserProfilesPanel.text.f0c93f4")}</Button>
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
  useLocale()

  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <div
      className={`browser-profile-card relative flex min-h-[176px] flex-col overflow-visible rounded-sm border bg-[var(--color-bg-surface)] p-4 shadow-none transition-[border-color,background-color] duration-150
        ${isSelected ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)]/35' : 'border-[var(--color-border-default)] hover:border-[var(--color-border-strong)]'}
      `}
    >
      <div className="flex items-start gap-3">
        {profile.running ? (
          <Button size="sm" variant="secondary" onClick={() => onStop(profile.profileId)} aria-label={isStopping ? tr("browser.components.BrowserProfilesPanel.BrowserProfileCard.ad62a97", [profile.profileName]) : tr("browser.components.BrowserProfilesPanel.BrowserProfileCard.ea36e55", [profile.profileName])} title={isStopping ? tr("browser.components.BrowserProfilesPanel.BrowserProfileCard.434eb8e") : tr("browser.components.BrowserListWidgets.text.a17f70a")} loading={isStopping} className="shrink-0">
            {!isStopping && <Square className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isStopping ? tr("browser.components.BrowserProfilesPanel.BrowserProfileCard.434eb8e") : tr("browser.components.BrowserListWidgets.text.a17f70a")}</span>
          </Button>
        ) : (
          <Button size="sm" onClick={() => onStart(profile.profileId)} aria-label={isStarting ? tr("browser.components.BrowserProfilesPanel.BrowserProfileCard.1d03856", [profile.profileName]) : tr("browser.components.BrowserProfilesPanel.BrowserProfileCard.5712bda", [profile.profileName])} title={isStarting ? tr("browser.components.AutomationScriptRunModal.helpers.formatSelectableProfileStatus.7e0798c") : tr("browser.components.BrowserListWidgets.text.ebd26da")} loading={isStarting} className="shrink-0">
            {!isStarting && <Play className="w-3.5 h-3.5 fill-current" />}
            <span className="hidden sm:inline">{isStarting ? tr("browser.components.AutomationScriptRunModal.helpers.formatSelectableProfileStatus.7e0798c") : tr("browser.components.BrowserListWidgets.text.ebd26da")}</span>
          </Button>
        )}
        <input
          type="checkbox"
          className="h-4 w-4 shrink-0 cursor-pointer rounded-sm accent-[var(--color-accent)]"
          checked={isSelected}
          aria-label={tr("browser.components.BrowserProfilesPanel.BrowserProfileCard.a647d70", [profile.profileName])}
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
          <Link to={`/browser/edit/${profile.profileId}`}><Button size="sm" variant="ghost" aria-label={tr("browser.components.BrowserProfilesPanel.BrowserProfileCard.ff015d0", [profile.profileName])} title={tr("browser.components.BrowserProfilesPanel.title.d7d7ce7")} className="px-2" disabled={isBusy}><Settings className="w-3.5 h-3.5" /></Button></Link>
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
            <span className="sr-only">{tr("browser.components.BrowserProfilesPanel.text.f8f5047")}</span>
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
  useLocale()

  const allSelected = profiles.length > 0 && selectedIds.size === profiles.length
  const partiallySelected = selectedIds.size > 0 && selectedIds.size < profiles.length
  const [openMoreProfileId, setOpenMoreProfileId] = useState<string | null>(null)

  const columns: TableColumn<BrowserProfile>[] = [
    {
      key: 'primaryAction',
      title: tr("browser.components.BrowserListWidgets.text.ebd26da"),
      width: 90,
      render: (_, record) => {
        const isStarting = isProfileStarting(record.profileId)
        const isStopping = isProfileStopping(record.profileId)
        const isBusy = isProfileBusy(record.profileId)
        return record.running ? (
          <Button size="sm" variant="secondary" onClick={() => onStop(record.profileId)} aria-label={isStopping ? tr("browser.components.BrowserProfilesPanel.BrowserProfileCard.ad62a97", [record.profileName]) : tr("browser.components.BrowserProfilesPanel.BrowserProfileCard.ea36e55", [record.profileName])} title={isStopping ? tr("browser.components.BrowserProfilesPanel.BrowserProfileCard.434eb8e") : tr("browser.components.BrowserListWidgets.text.a17f70a")} loading={isStopping} className="min-w-[68px]">
            {!isStopping && <Square className="w-3.5 h-3.5" />}
            <span>{isStopping ? tr("browser.components.BrowserProfilesPanel.BrowserProfileCard.434eb8e") : tr("browser.components.BrowserListWidgets.text.a17f70a")}</span>
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => onStart(record.profileId)} aria-label={isStarting ? tr("browser.components.BrowserProfilesPanel.BrowserProfileCard.1d03856", [record.profileName]) : tr("browser.components.BrowserProfilesPanel.BrowserProfileCard.5712bda", [record.profileName])} title={isStarting ? tr("browser.components.AutomationScriptRunModal.helpers.formatSelectableProfileStatus.7e0798c") : tr("browser.components.BrowserListWidgets.text.ebd26da")} loading={isStarting} disabled={isBusy} className="min-w-[68px]">
            {!isStarting && <Play className="w-3.5 h-3.5 fill-current" />}
            <span>{isStarting ? tr("browser.components.AutomationScriptRunModal.helpers.formatSelectableProfileStatus.7e0798c") : tr("browser.components.BrowserListWidgets.text.ebd26da")}</span>
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
          aria-label={allSelected ? tr("browser.components.BrowserProfilesPanel.BrowserProfilesPanel.70c145b") : tr("browser.components.BrowserProfilesPanel.BrowserProfilesPanel.2fb7fc3")}
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
      width: 32,
      render: (_, record) => (
        <input
          type="checkbox"
          className="h-4 w-4 cursor-pointer rounded-sm accent-[var(--color-accent)]"
          checked={selectedIds.has(record.profileId)}
          aria-label={tr("browser.components.BrowserProfilesPanel.BrowserProfileCard.a647d70", [record.profileName])}
          onChange={() => onToggleSelect(record.profileId)}
        />
      ),
    },
    {
      key: 'profileName',
      title: tr("browser.components.AutomationInstanceSelector.AutomationInstanceSelector.9c0531d"),
      width: 190,
      render: (value, record) => (
        <div className="min-w-0">
          <Link className="block truncate text-sm font-medium text-[var(--color-text-primary)] hover:text-[var(--color-accent)]" to={`/browser/detail/${record.profileId}`} title={String(value || '')}>
            {value}
          </Link>

        </div>
      ),
    },
    {
      key: 'running',
      title: tr("browser.components.AutomationScriptHistoryModal.text.62e951a"),
      width: 86,
      render: (_, record) => {
        const status = getProfileStatus(record)
        return <Badge variant={status.variant} dot>{status.label}</Badge>
      },
    },
    {
      key: 'proxyId',
      title: tr("browser.components.BrowserProfilesPanel.title.9c66e33"),
      width: 145,
      render: (value, record) => {
        const proxy = proxies.find(item => item.proxyId === value)
        const isBusy = isProfileBusy(record.profileId)
        const config = (proxy?.proxyConfig || record.proxyConfig || '').trim()
        let label = config === 'direct://' || config === 'direct' || (!config && !value) ? tr('network.direct') : proxy?.proxyName || tr('network.customProxy')
        try { const endpoint = new URL(config); if (endpoint.hostname) label = endpoint.host } catch { /* structured proxy configs retain their name */ }
        if (record.networkMode === 'tor') label = 'Tor'
        return <button type="button" className="block w-full truncate text-left font-mono text-xs hover:text-[var(--accent)] disabled:opacity-50" title={label} disabled={isBusy} onClick={() => onOpenProxyPicker(record)}>{label}</button>
      },
    },
    {
      key: 'workspaceContext',
      title: tr('assets.tags'),
      width: 120,
      render: (_, record) => <span className="block max-w-[120px] truncate" title={(record.tags || []).join(', ')}>{record.tags?.join(', ') || '—'}</span>,
    },
    {
      key: 'actions',
      title: tr("browser.components.AutomationScriptHistoryModal.text.f3ea6d3"),
      width: 80,
      align: 'right',
      render: (_, record) => {
        const isBusy = isProfileBusy(record.profileId)
        const isMoreOpen = openMoreProfileId === record.profileId

        return (
          <div className="flex justify-end gap-1 whitespace-nowrap">
            <Link to={`/browser/edit/${record.profileId}`}><Button size="sm" variant="ghost" aria-label={tr("browser.components.BrowserProfilesPanel.BrowserProfileCard.ff015d0", [record.profileName])} title={tr("browser.components.BrowserProfilesPanel.title.d7d7ce7")} disabled={isBusy}><Settings className="w-3.5 h-3.5" /></Button></Link>
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

  const startColumn = { ...columns.shift()!, title: '' }
  columns.splice(columns.findIndex(column => column.key === 'workspaceContext'), 0,
    { key: 'browserCore', title: tr('assets.core'), width: 142, render: (_, record) => <span className="block truncate font-mono text-xs" title={getProfileCoreLabel(record)}>{resolveProfileCore(record)?.chromeVersion || '—'}</span> })
  columns.splice(columns.length - 1, 0,
    { key: 'lastActive', title: tr('instances.lastActive'), width: 110, render: (_, record) => { const activity = getBrowserProfileActivity(record); return <span className="block truncate font-mono text-xs" title={activity ? formatDate(activity.timestamp, { dateStyle: 'medium', timeStyle: 'medium' }) : undefined}>{relativeTime(activity?.timestamp)}</span> } }, startColumn)

  return (
    <Card padding="none" className="browser-instance-panel">
      <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 250px)' }}>
        {loading ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-2 py-16 text-sm text-[var(--color-text-muted)]" role="status" aria-live="polite">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--color-accent)]" aria-hidden="true" />
            <span>{tr("browser.components.BrowserProfilesPanel.text.fb759fd")}</span>
          </div>
        ) : profiles.length === 0 ? (
          <div className="flex min-h-64 items-center justify-center px-6 py-12" role="status" aria-live="polite">
            <SignalEmptyState
              symbol={workspaceMode === 'templates' ? "fingerprint" : "logs"}
              title={
                hasActiveFilters && totalProfileCount > 0
                  ? tr("browser.components.BrowserProfilesPanel.BrowserProfilesPanel.8e009f6")
                  : workspaceMode === 'attention'
                    ? tr("browser.components.BrowserProfilesPanel.BrowserProfilesPanel.0706da9")
                    : workspaceMode === 'templates'
                      ? tr("browser.components.BrowserProfilesPanel.BrowserProfilesPanel.7abd0aa")
                      : tr("browser.components.BrowserProfilesPanel.BrowserProfilesPanel.134d2e4")
              }

              action={hasActiveFilters && totalProfileCount > 0 ? (
                <Button size="sm" variant="secondary" onClick={onClearFilters}>{tr("browser.components.BrowserProfilesPanel.text.4bbc4e5")}</Button>
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

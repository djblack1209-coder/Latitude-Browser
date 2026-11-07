import { getLocale, translateMessage } from '../../../shared/i18n'
import { tr, useLocale, localized } from '../../../shared/i18n'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Copy, Globe, Play, RefreshCw, RotateCcw, Square } from 'lucide-react'
import { Badge, Button, Card, Input, Table, toast } from '../../../shared/components'
import { WorkspaceHeader } from '../../../shared/components/SignalPrimitives'
import type { TableColumn } from '../../../shared/components/Table'
import type { BrowserProfile, BrowserTab } from '../types'
import { EventsOn } from '../../../wailsjs/runtime/runtime'
import {
  fetchBrowserProfiles,
  fetchBrowserTabs,
  openBrowserUrl,
  regenerateBrowserProfileCode,
  restartBrowserInstance,
  startBrowserInstance,
  stopBrowserInstance,
} from '../api'
import { CookieManagerCard } from '../components/CookieManagerCard'
import { SnapshotTab } from '../components/SnapshotTab'
import { resolveActionErrorMessage, resolveActionFeedback } from '../utils/actionErrors'
import { warmupProfileProxyBeforeStart } from '../utils/proxyWarmup'
import { TorModeNotice } from './TorModeNotice'
import { useFieldScene } from '../../../shared/layout/LatitudeField'

const resolveRuntimeStatus = (running: boolean, debugReady: boolean) => {
  if (!running) return { variant: 'warning' as const, label: tr("browser.components.InstanceFilterBar.label.75dddf5") }
  if (!debugReady) return { variant: 'info' as const, label: tr("browser.pages.BrowserDetailPage.label.ba3cd6f") }
  return { variant: 'success' as const, label: tr("browser.components.AutomationScriptHistoryModal.getRunStatusLabel.5942497") }
}

const formatTime = (value?: string) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString(getLocale())
}

type TabKey = 'overview' | 'snapshot'

const TABS: { key: TabKey; label: string }[] = localized(() => ([
  { key: 'overview', label: tr("browser.pages.BrowserDetailPage.label.5060421") },
  { key: 'snapshot', label: tr("browser.pages.BrowserDetailPage.label.ff173de") },
]))

export function BrowserDetailPage() {
  useLocale()

  const { id } = useParams()
  const [profile, setProfile] = useState<BrowserProfile | null>(null)
  const [tabs, setTabs] = useState<BrowserTab[]>([])
  const [tabsError, setTabsError] = useState('')
  const [targetUrl, setTargetUrl] = useState('https://example.com')
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [pendingAction, setPendingAction] = useState<'starting' | 'stopping' | 'restarting' | null>(null)
  useFieldScene({ id: id || 'workspace', view: 'table', status: profile?.lastError ? 'error' : profile?.running ? (profile.debugReady ? 'running' : 'pending') : 'idle' })

  const loadProfile = async () => {
    const list = await fetchBrowserProfiles()
    const current = list.find(item => item.profileId === id) || null
    setProfile(current)
    return current
  }

  const loadTabs = async () => {
    if (!id) return
    try {
      const list = await fetchBrowserTabs(id)
      setTabs(list)
      setTabsError('')
    } catch (error) {
      setTabs([])
      setTabsError(error instanceof Error ? error.message : String(error))
    }
  }

  useEffect(() => { void loadProfile() }, [id])
  useEffect(() => { void loadTabs() }, [id])

  useEffect(() => {
    if (!id) return

    const handleRuntimeChange = (payload: any) => {
      const profileId = typeof payload === 'string' ? payload : payload?.profileId
      if (profileId !== id) return

      setPendingAction(null)
      void loadProfile()

      if (typeof payload === 'string' || payload?.error) {
        setTabs([])
        return
      }

      void loadTabs()
    }

    // Browser preview pages run outside Wails, so the injected runtime may not exist.
    // Skip event subscriptions there while keeping the desktop event behavior intact.
    const runtime = typeof window !== 'undefined' ? (window as any).runtime : undefined
    if (typeof runtime?.EventsOn !== 'function') return

    const offStarted = EventsOn('browser:instance:started', handleRuntimeChange)
    const offUpdated = EventsOn('browser:instance:updated', handleRuntimeChange)
    const offStopped = EventsOn('browser:instance:stopped', handleRuntimeChange)
    const offCrashed = EventsOn('browser:instance:crashed', handleRuntimeChange)

    return () => {
      offStarted?.()
      offUpdated?.()
      offStopped?.()
      offCrashed?.()
    }
  }, [id])

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-[var(--color-text-muted)]">{tr("browser.pages.BrowserDetailPage.text.b30d600")}</div>
    )
  }

  const isTorMode = profile.networkMode === 'tor'

  const handleOpenUrl = async () => {
    const normalizedTargetUrl = targetUrl.trim()
    if (!normalizedTargetUrl) {
      toast.warning(tr("browser.pages.BrowserDetailPage.BrowserDetailPage.ebc866e"))
      return
    }

    try {
      const opened = await openBrowserUrl(profile.profileId, normalizedTargetUrl)
      if (!opened) {
        toast.warning(tr("browser.pages.BrowserDetailPage.BrowserDetailPage.2371eed"))
        return
      }
      toast.success(tr("browser.pages.BrowserDetailPage.BrowserDetailPage.70e8c1f"))
    } catch (error: any) {
      const feedback = resolveActionFeedback(error, tr("browser.pages.BrowserDetailPage.BrowserDetailPage.4807381"))
      if (feedback.tone === 'warning') {
        toast.warning(feedback.message)
      } else {
        toast.error(feedback.message)
      }
    }
  }

  const handleStart = async () => {
    setPendingAction('starting')
    try {
      if (!isTorMode) await warmupProfileProxyBeforeStart(profile)
      const startedProfile = await startBrowserInstance(profile.profileId)
      if (startedProfile) {
        setProfile(startedProfile)
      }
      if (startedProfile?.running && !startedProfile.debugReady && startedProfile.runtimeWarning) {
        toast.warning(startedProfile.runtimeWarning)
      } else {
        toast.success(tr("browser.pages.BrowserDetailPage.BrowserDetailPage.1df0cd8"))
      }
    } catch (error: any) {
      const feedback = resolveActionFeedback(error, tr("browser.pages.AutoConfigPage.AutoConfigPage.176529e"))
      if (feedback.tone === 'warning') {
        toast.warning(feedback.message)
      } else {
        toast.error(feedback.message)
      }
    } finally {
      await loadProfile()
      setPendingAction(null)
    }
  }

  const handleStop = async () => {
    setPendingAction('stopping')
    try {
      const stoppedProfile = await stopBrowserInstance(profile.profileId)
      if (stoppedProfile) {
        setProfile(stoppedProfile)
      }
      toast.success(tr("browser.pages.BrowserDetailPage.BrowserDetailPage.361960e"))
    } catch (error: any) {
      toast.error(resolveActionErrorMessage(error, tr("browser.pages.BrowserDetailPage.BrowserDetailPage.531cbdd")))
    } finally {
      await loadProfile()
      setPendingAction(null)
    }
  }

  const handleRestart = async () => {
    setPendingAction('restarting')
    try {
      if (!isTorMode) await warmupProfileProxyBeforeStart(profile)
      const restartedProfile = await restartBrowserInstance(profile.profileId)
      if (restartedProfile) {
        setProfile(restartedProfile)
      }
      toast.success(tr("browser.pages.BrowserDetailPage.BrowserDetailPage.feffaa2"))
    } catch (error: any) {
      const feedback = resolveActionFeedback(error, tr("browser.pages.BrowserDetailPage.BrowserDetailPage.201d96f"))
      if (feedback.tone === 'warning') {
        toast.warning(feedback.message)
      } else {
        toast.error(feedback.message)
      }
    } finally {
      await loadProfile()
      setPendingAction(null)
    }
  }

  const tabsColumns: TableColumn<BrowserTab>[] = [
    { key: 'title', title: tr("browser.pages.BrowserDetailPage.title.748d7dc") },
    { key: 'url', title: tr("browser.pages.BrowserDetailPage.title.67d2d79") },
  ]

  const isStarting = pendingAction === 'starting'
  const isStopping = pendingAction === 'stopping'
  const isRestarting = pendingAction === 'restarting'
  const isBusy = pendingAction !== null
  const runtimeStatus = resolveRuntimeStatus(profile.running, profile.debugReady)

  return (
    <div className="space-y-5 animate-fade-in">
      <WorkspaceHeader

        title={profile.profileName}

        actions={(
          <>
            <Link to={`/browser/edit/${profile.profileId}`}>
              <Button variant="secondary" size="sm">{tr("browser.pages.BrowserDetailPage.text.bb81078")}</Button>
            </Link>
            <Link to="/browser/list">
              <Button variant="ghost" size="sm">{tr("browser.pages.AutomationScriptDetailPage.text.53505b1")}</Button>
            </Link>
          </>
        )}
      ><p className="latitude-detail-caption">{tr("browser.pages.BrowserDetailPage.title.53d9738")}</p></WorkspaceHeader>

      {/* Tab 导航 */}
      <div className="flex border-b border-[var(--color-border)]">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={[
              'px-4 py-2 text-sm font-medium transition-colors',
              activeTab === tab.key
                ? 'border-b-2 border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 概览 Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title={tr("browser.pages.BrowserDetailPage.title.b73b67a")} >
              <div className="space-y-3 text-sm text-[var(--color-text-secondary)]">
                <div className="flex justify-between">
                  <span>{tr("browser.components.AutomationScriptHistoryModal.text.62e951a")}</span>
                  <Badge variant={runtimeStatus.variant} dot>{runtimeStatus.label}</Badge>
                </div>
                <div className="flex justify-between">
                  <span>{tr("browser.pages.BrowserDetailPage.text.b31aa4b")}</span>
                  <span>{profile.pid || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span>{tr("browser.pages.BrowserDetailPage.text.8e41f20")}</span>
                  <span>{profile.debugPort || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span>{tr("browser.pages.BrowserDetailPage.text.ae9e76b")}</span>
                  <span>{profile.debugReady ? tr("browser.automationRuntime.getAutomationRuntimeBadgeText.f2afde8") : (profile.running ? tr("browser.pages.BrowserDetailPage.BrowserDetailPage.5456ad8") : '-')}</span>
                </div>
                <div className="flex justify-between">
                  <span>{tr("browser.pages.BrowserDetailPage.text.3a82007")}</span>
                  <span>{formatTime(profile.lastStartAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{tr("browser.pages.BrowserDetailPage.text.ad1d579")}</span>
                  <span>{formatTime(profile.lastStopAt)}</span>
                </div>
              </div>
            </Card>

            <Card title={tr("browser.pages.BrowserDetailPage.title.86a20b5")} >
              <div className="space-y-3 text-sm text-[var(--color-text-secondary)]">
                <div className="flex justify-between">
                  <span>{tr("browser.pages.BrowserDetailPage.text.4786f7a")}</span>
                  <span>{profile.userDataDir}</span>
                </div>
                <div className="flex justify-between">
                  <span>{tr("browser.pages.BrowserDetailPage.text.8f190c5")}</span>
                  <span>{profile.coreId || tr("browser.api.runtime.message.c8d09cf")}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>{tr("browser.pages.BrowserDetailPage.text.8f26543")}</span>
                  <span className={isTorMode ? 'font-medium text-[var(--color-warning)]' : ''}>
                    {isTorMode ? tr("browser.pages.BrowserDetailPage.BrowserDetailPage.9f61ea7") : tr("browser.pages.BrowserDetailPage.BrowserDetailPage.e4d38f8")}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>{tr("browser.pages.AutoConfigPage.label.5d8cb1f")}</span>
                  <span className="max-w-[65%] break-all text-right">
                    {isTorMode ? tr("browser.pages.BrowserDetailPage.BrowserDetailPage.62b7b0a") : profile.proxyConfig || profile.proxyBindName || profile.proxyId || '-'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{tr("browser.pages.BrowserDetailPage.text.ac2d2f2")}</span>
                  <span>{profile.fingerprintArgs?.length || 0}{tr("browser.components.BrowserProfileCopyForm.text.12de8e1")}</span>
                </div>
                <div className="flex justify-between">
                  <span>{tr("browser.pages.BrowserDetailPage.text.d60b73d")}</span>
                  <span>{profile.launchArgs?.length || 0}{tr("browser.components.BrowserProfileCopyForm.text.12de8e1")}</span>
                </div>
                <div className="flex justify-between">
                  <span>{tr("browser.pages.BrowserDetailPage.text.ae0a7af")}</span>
                  <span>{profile.tags?.join(', ') || '-'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>{tr("browser.components.BrowserProfilesPanel.text.f8f5047")}</span>
                  <div className="flex items-center gap-1">
                    {profile.launchCode ? (
                      <>
                        <code className="text-xs font-mono bg-[var(--color-bg-secondary)] px-1.5 py-0.5 rounded text-[var(--color-accent)]">{profile.launchCode}</code>
                        <button
                          onClick={() => navigator.clipboard.writeText(profile.launchCode!).then(() => toast.success(tr("browser.components.BrowserListWidgets.LaunchCodeCell.169ec47")))}
                          className="p-0.5 hover:text-[var(--color-accent)] text-[var(--color-text-muted)] transition-colors"
                          title={tr("browser.components.AutomationScriptPublicApiBodyExamples.text.4edd1d0")}
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        <button
                          onClick={async () => {
                            await regenerateBrowserProfileCode(profile.profileId)
                            loadProfile()
                            toast.success(tr("browser.components.BrowserListWidgets.LaunchCodeCell.69c7e21"))
                          }}
                          className="p-0.5 hover:text-[var(--color-accent)] text-[var(--color-text-muted)] transition-colors"
                          title={tr("browser.components.BrowserListWidgets.title.2e19057")}
                        >
                          <RefreshCw className="w-3 h-3" />
                        </button>
                      </>
                    ) : (
                      <span className="text-[var(--color-text-muted)]">-</span>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {isTorMode && <TorModeNotice />}

          <Card title={tr("browser.pages.BrowserDetailPage.title.309c0a9")} >
            <div className="flex flex-wrap items-center gap-2">
              {profile.running ? (
                <Button size="sm" variant="danger" onClick={handleStop} loading={isStopping} disabled={isBusy && !isStopping}>
                  {!isStopping && <Square className="w-4 h-4" />}
                  {isStopping ? tr("browser.components.BrowserProfilesPanel.BrowserProfileCard.434eb8e") : tr("browser.components.BrowserListWidgets.text.a17f70a")}
                </Button>
              ) : (
                <Button size="sm" onClick={handleStart} loading={isStarting} disabled={isBusy && !isStarting}>
                  {!isStarting && <Play className="w-4 h-4" />}
                  {isStarting ? tr("browser.components.AutomationScriptRunModal.helpers.formatSelectableProfileStatus.7e0798c") : tr("browser.components.BrowserListWidgets.text.ebd26da")}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={handleRestart} loading={isRestarting} disabled={isBusy && !isRestarting}>
                {!isRestarting && <RotateCcw className="w-4 h-4" />}
                {isRestarting ? tr("browser.pages.BrowserDetailPage.BrowserDetailPage.60c273c") : tr("browser.components.BrowserProfilesPanel.text.385c272")}
              </Button>
            </div>
          </Card>

          {profile.lastError && (
            <Card title={tr("browser.pages.BrowserDetailPage.title.5e8913a")} >
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 whitespace-pre-line">
                {translateMessage(profile.lastError)}
              </div>
            </Card>
          )}

          {profile.runtimeWarning && (
            <Card title={tr("browser.pages.BrowserDetailPage.title.ac12c48")} >
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 whitespace-pre-line">
                {profile.runtimeWarning}
              </div>
            </Card>
          )}

          <Card title={tr("browser.pages.BrowserDetailPage.title.8923d89")} >
            <div className="flex flex-col md:flex-row gap-3">
              <Input value={targetUrl} onChange={e => setTargetUrl(e.target.value)} placeholder={tr("browser.pages.BrowserDetailPage.BrowserDetailPage.ebc866e")} />
              <Button onClick={handleOpenUrl}>
                <Globe className="w-4 h-4" />{tr("browser.pages.BrowserDetailPage.text.65fc81e")}</Button>
            </div>
          </Card>

          <Card title={tr("browser.pages.BrowserDetailPage.title.a575a76")} >
            <div className="mb-2 flex items-center justify-end"><Button size="sm" variant="ghost" onClick={() => void loadTabs()}>{tr('common.refresh')}</Button></div>
            {tabsError && <p role="alert" className="mb-2 text-xs text-[var(--warn)]">{translateMessage(tabsError)}</p>}
            <Table columns={tabsColumns} data={tabs} rowKey="tabId" />
          </Card>

          <CookieManagerCard
            profileId={profile.profileId}
            profileName={profile.profileName}
            running={profile.running}
            ready={profile.running && profile.debugReady}
          />
        </div>
      )}

      {/* 快照管理 Tab */}
      {activeTab === 'snapshot' && (
        <SnapshotTab profileId={profile.profileId} running={profile.running} />
      )}
    </div>
  )
}

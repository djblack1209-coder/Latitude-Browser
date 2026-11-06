import { getLocale, translateMessage } from '../../shared/i18n'
import { tr, useLocale } from '../../shared/i18n'
import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { WorkspaceHeader } from '../../shared/components/SignalPrimitives'
import { TextSpinner } from '../../shared/components/TextSpinner'
import { SettingsSectionNav } from './components/SettingsSectionNav'
import { ConnectorSettingsPanel } from './components/ConnectorSettingsPanel'
import { TorLabPanel } from './components/TorLabPanel'
import { Button, toast } from '../../shared/components'
import {
  initializeSystemData,
  exportSystemConfig,
  importSystemConfig,
  fetchAutomationState,
  saveAutomationScriptPackageSettings,
  saveAutomationSettings,
  saveAutomationRuntimeSettings,
  installAutomationRuntime,
  automationProbeSystemNode,
  automationRuntimeSelfCheck,
  fetchLaunchServerSettings,
  saveLaunchServerSettings,
  defaultAutomationState,
} from './api'
import type { AutomationNodeSource, AutomationRuntimeCheck, AutomationState, AutomationSystemNodeProbe } from './api'
import { AutomationSettingsCard } from './components/AutomationSettingsCard'
import { BackupImportModal, BackupSettingsCard } from './components/BackupSettingsCard'
import { LanguageSettings, AboutSettings } from './components/LanguageSettings'
import type { AutomationRuntimeProgress, BackupExportLogItem, BackupExportProgress } from './progress'
import { useSettingsProgressEffects } from './hooks/useSettingsProgressEffects'

export function SettingsPage() {
  useLocale()

  const [query] = useSearchParams()
  const rawSection = query.get('section') || 'general'
  const section = rawSection === 'tor' ? 'connectors' : rawSection
  const separateSection = section === 'connectors'
  const [connectorVisited, setConnectorVisited] = useState(section === 'connectors')
  const [torVisited, setTorVisited] = useState(section === 'connectors')
  const [generalDirty, setGeneralDirty] = useState(false)
  const [connectorDirty, setConnectorDirty] = useState(false)
  const [torDirty, setTorDirty] = useState(false)
  const hasDrafts = generalDirty || connectorDirty || torDirty

  useEffect(() => {
    if (section === 'connectors') setConnectorVisited(true)
    if (section === 'connectors') setTorVisited(true)
  }, [section])

  useEffect(() => {
    if (!hasDrafts) return
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const confirmNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null
      if (!target || target.target === '_blank' || target.hasAttribute('download')) return
      const destination = new URL(target.href, window.location.href)
      // All settings partitions preserve their drafts, including Sidebar links.
      if (destination.origin === window.location.origin && destination.pathname === '/settings') return
      if (!window.confirm(tr("settings.SettingsPage.SettingsPage.32f86a1"))) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    // Native quit is unconditional; retain this guard only in web previews.
    const webPreview = !(window as any).go?.main?.App
    if (webPreview) window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', confirmNavigation, true)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('click', confirmNavigation, true)
    }
  }, [hasDrafts])

  // Mount specialist sections on first visit, then keep their drafts alive.
  // Hidden Tor panels do not poll; switching partitions never executes Tor.
  return (
    <div className="terminal-settings-layout"><SettingsSectionNav current={section} /><div>
      <div hidden={separateSection}>
        <GeneralSettingsPage section={separateSection ? "general" : section} onDirtyChange={setGeneralDirty} />
      </div>
      {(connectorVisited || section === 'connectors') && <div hidden={section !== 'connectors'}><ConnectorSettingsPanel active={section === 'connectors'} onDirtyChange={setConnectorDirty} /></div>}
      {(torVisited || section === 'connectors') && <div hidden={section !== 'connectors'}><TorLabPanel active={section === 'connectors'} onDirtyChange={setTorDirty} /></div>}
    </div></div>
  )
}

function GeneralSettingsPage({ section, onDirtyChange }: { section: string; onDirtyChange: (dirty: boolean) => void }) {
  useLocale()

  const [automationState, setAutomationState] = useState<AutomationState>(defaultAutomationState)
  const [automationProgress, setAutomationProgress] = useState<AutomationRuntimeProgress | null>(null)
  const [automationBusy, setAutomationBusy] = useState<'none' | 'toggle' | 'probe' | 'runtime' | 'package' | 'install' | 'check'>('none')
  const [automationCheck, setAutomationCheck] = useState<AutomationRuntimeCheck | null>(null)
  const [automationProbe, setAutomationProbe] = useState<AutomationSystemNodeProbe | null>(null)
  const [automationNodeSourceDraft, setAutomationNodeSourceDraft] = useState<AutomationNodeSource>('auto')
  const [automationSystemNodePathDraft, setAutomationSystemNodePathDraft] = useState('')
  const [automationRuntimeDirty, setAutomationRuntimeDirty] = useState(false)
  const [launchServerPortDraft, setLaunchServerPortDraft] = useState('19876')
  const [launchServerBaseUrl, setLaunchServerBaseUrl] = useState('')
  const [launchServerReady, setLaunchServerReady] = useState(false)
  const [launchServerSaving, setLaunchServerSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState<'none' | 'init' | 'export' | 'import-reset' | 'import-merge'>('none')
  const [exportProgress, setExportProgress] = useState<BackupExportProgress | null>(null)
  const [importProgress, setImportProgress] = useState<BackupExportProgress | null>(null)
  const [exportLogs, setExportLogs] = useState<BackupExportLogItem[]>([])
  const exportLogsRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    void loadSettings()
  }, [])

  useEffect(() => { onDirtyChange(automationRuntimeDirty) }, [automationRuntimeDirty, onDirtyChange])

  useSettingsProgressEffects({
    actionLoading,
    exportLogs,
    exportLogsRef,
    importProgress,
    setAutomationProgress,
    setAutomationState,
    setExportLogs,
    setExportProgress,
    setImportProgress,
  })

  useEffect(() => {
    setAutomationNodeSourceDraft((automationState.settings.nodeSource || 'auto') as AutomationNodeSource)
    setAutomationSystemNodePathDraft(automationState.settings.systemNodePath || '')
    setAutomationProbe(null)
    setAutomationRuntimeDirty(false)
  }, [automationState.settings.nodeSource, automationState.settings.systemNodePath])

  const loadSettings = async () => {
    setLoading(true)
    setLoadError('')
    try {
      const [automation, launchServer] = await Promise.all([
        fetchAutomationState(),
        fetchLaunchServerSettings(),
      ])
      setAutomationState(automation)
      setLaunchServerPortDraft(String(launchServer.preferredPort || launchServer.port || 19876))
      setLaunchServerBaseUrl(launchServer.baseUrl)
      setLaunchServerReady(launchServer.ready)
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }

  const handleAutomationEnabledChange = async (enabled: boolean) => {
    setAutomationBusy('toggle')
    setAutomationCheck(null)
    try {
      const next = await saveAutomationSettings(enabled, automationState.settings.headlessDefault)
      setAutomationState(next)
      if (!enabled) {
        setAutomationProgress(null)
        toast.success(tr("settings.SettingsPage.GeneralSettingsPage.baaba03"))
        return
      }
      if (!next.status.ready) {
        setAutomationProgress({
          phase: 'checking',
          progress: 0,
          message: tr("settings.SettingsPage.message.600d9f4"),
        })
        toast.success(tr("settings.SettingsPage.GeneralSettingsPage.e976e0d"))
        return
      }
      toast.success(tr("settings.SettingsPage.GeneralSettingsPage.937647b"))
    } catch (error: any) {
      toast.error(error?.message || tr("settings.SettingsPage.GeneralSettingsPage.2c7e141"))
    } finally {
      setAutomationBusy('none')
    }
  }

  const handleAutomationHeadlessChange = async (headlessDefault: boolean) => {
    setAutomationBusy('toggle')
    try {
      const next = await saveAutomationSettings(automationState.settings.enabled, headlessDefault)
      setAutomationState(next)
      toast.success(headlessDefault ? tr("settings.SettingsPage.GeneralSettingsPage.fcf67c6") : tr("settings.SettingsPage.GeneralSettingsPage.008b98a"))
    } catch (error: any) {
      toast.error(error?.message || tr("settings.SettingsPage.GeneralSettingsPage.2c7e141"))
    } finally {
      setAutomationBusy('none')
    }
  }

  const handleAutomationRuntimeSettingsSave = async () => {
    setAutomationBusy('runtime')
    setAutomationCheck(null)
    try {
      const next = await saveAutomationRuntimeSettings(automationNodeSourceDraft, automationSystemNodePathDraft)
      setAutomationState(next)
      setAutomationRuntimeDirty(false)

      if (next.settings.enabled && next.status.installing) {
        setAutomationProgress({
          phase: 'checking',
          progress: 0,
          message: tr("settings.SettingsPage.message.924c9dc"),
        })
        toast.success(tr("settings.SettingsPage.GeneralSettingsPage.84656e1"))
        return
      }

      toast.success(tr("settings.SettingsPage.GeneralSettingsPage.f26ded1"))
    } catch (error: any) {
      toast.error(error?.message || tr("settings.SettingsPage.GeneralSettingsPage.b448bda"))
    } finally {
      setAutomationBusy('none')
    }
  }

  const handleAutomationTypeScriptBuildChange = async (allowTypeScriptBuild: boolean) => {
    setAutomationBusy('package')
    try {
      const next = await saveAutomationScriptPackageSettings(allowTypeScriptBuild)
      setAutomationState(next)
      toast.success(allowTypeScriptBuild ? tr("settings.SettingsPage.GeneralSettingsPage.05278c0") : tr("settings.SettingsPage.GeneralSettingsPage.f2a9f7e"))
    } catch (error: any) {
      toast.error(error?.message || tr("settings.SettingsPage.GeneralSettingsPage.530e4e2"))
    } finally {
      setAutomationBusy('none')
    }
  }

  const handleAutomationProbeSystemNode = async () => {
    setAutomationBusy('probe')
    try {
      const result = await automationProbeSystemNode(automationSystemNodePathDraft)
      setAutomationProbe(result)
      toast.success(tr("settings.SettingsPage.GeneralSettingsPage.89a00c3", [result.version]))
    } catch (error: any) {
      setAutomationProbe(null)
      toast.error(error?.message || tr("settings.SettingsPage.GeneralSettingsPage.f1fff12"))
    } finally {
      setAutomationBusy('none')
    }
  }

  const handleAutomationInstall = async () => {
    setAutomationBusy('install')
    try {
      const next = await installAutomationRuntime()
      setAutomationState(next)
      setAutomationProgress({
        phase: 'checking',
        progress: 0,
        message: tr("settings.SettingsPage.message.3c30c96"),
      })
      toast.success(tr("settings.SettingsPage.GeneralSettingsPage.2c42333"))
    } catch (error: any) {
      toast.error(error?.message || tr("settings.SettingsPage.GeneralSettingsPage.247d22d"))
    } finally {
      setAutomationBusy('none')
    }
  }

  const handleAutomationSelfCheck = async () => {
    setAutomationBusy('check')
    try {
      const result = await automationRuntimeSelfCheck()
      setAutomationCheck(result)
      if (result.ok) {
        toast.success(tr("settings.SettingsPage.GeneralSettingsPage.35ea139", [result.nodeVersion, result.playwrightVersion]))
      } else {
        toast.warning(tr("settings.SettingsPage.GeneralSettingsPage.6521233"))
      }
    } catch (error: any) {
      setAutomationCheck(null)
      toast.error(error?.message || tr("settings.SettingsPage.GeneralSettingsPage.2df3a27"))
    } finally {
      setAutomationBusy('none')
    }
  }

  const handleLaunchServerPortSave = async () => {
    const port = Number(launchServerPortDraft)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      toast.error(tr("settings.SettingsPage.GeneralSettingsPage.8f1a752"))
      return
    }

    setLaunchServerSaving(true)
    try {
      const next = await saveLaunchServerSettings(port)
      setLaunchServerPortDraft(String(next.preferredPort || next.port || port))
      setLaunchServerBaseUrl(next.baseUrl)
      setLaunchServerReady(next.ready)
      toast.success(tr("settings.SettingsPage.GeneralSettingsPage.6506175", [next.port]))
    } catch (error: any) {
      toast.error(error?.message || tr("settings.SettingsPage.GeneralSettingsPage.f482012"))
    } finally {
      setLaunchServerSaving(false)
    }
  }

  const handleInitializeSystem = async () => {
    setActionLoading('init')
    try {
      const res = await initializeSystemData()
      if (res.cancelled) {
        toast.info(tr("settings.SettingsPage.GeneralSettingsPage.d2dc93d"))
        return
      }
      toast.success(res.message || tr("settings.SettingsPage.GeneralSettingsPage.2f4917a"))
    } catch (error: any) {
      toast.error(error?.message || tr("settings.SettingsPage.GeneralSettingsPage.e2d656f"))
    } finally {
      setActionLoading('none')
    }
  }

  const handleExportSystem = async () => {
    setActionLoading('export')
    setExportLogs([])
    setExportProgress({ phase: 'starting', progress: 0, message: tr("settings.SettingsPage.message.07f94de") })
    try {
      const res = await exportSystemConfig()
      if (res.cancelled) {
        setExportProgress(null)
        setExportLogs([])
        toast.info(tr("settings.SettingsPage.GeneralSettingsPage.c8feb7b"))
        return
      }
      setExportProgress(prev => prev?.phase === 'done'
        ? prev
        : { phase: 'done', progress: 100, message: res.message || tr("settings.SettingsPage.GeneralSettingsPage.a117aac") })
      toast.success(res.message || tr("settings.SettingsPage.GeneralSettingsPage.a117aac"))
    } catch (error: any) {
      setExportProgress(prev => ({
        phase: 'error',
        progress: prev?.progress ?? 0,
        message: error?.message || tr("settings.SettingsPage.GeneralSettingsPage.6753381"),
      }))
      setExportLogs(prev => {
        const timestamp = new Date().toLocaleTimeString(getLocale(), { hour12: false })
        const text = error?.message || tr("settings.SettingsPage.GeneralSettingsPage.6753381")
        const next = [...prev, { id: Date.now() + Math.floor(Math.random() * 1000), phase: 'error', time: timestamp, text }]
        return next.length > 120 ? next.slice(next.length - 120) : next
      })
      toast.error(error?.message || tr("settings.SettingsPage.GeneralSettingsPage.6753381"))
    } finally {
      setActionLoading('none')
    }
  }

  const handleImportSystem = async (resetFirst: boolean) => {
    setActionLoading(resetFirst ? 'import-reset' : 'import-merge')
    setImportProgress({
      phase: 'starting',
      progress: 0,
      message: resetFirst ? tr("settings.SettingsPage.GeneralSettingsPage.4272a6a") : tr("settings.SettingsPage.GeneralSettingsPage.c73259d"),
    })
    try {
      const res = await importSystemConfig(resetFirst)
      if (res.cancelled) {
        setImportProgress(null)
        toast.info(tr("settings.SettingsPage.GeneralSettingsPage.a4d5fd7"))
        return
      }
      const imported = res.imported ?? 0
      const skipped = res.skipped ?? 0
      const conflicts = res.conflicts ?? 0
      const componentFailed = Number.isFinite(res.componentFailed) ? Math.max(0, Math.round(res.componentFailed || 0)) : 0
      const componentTotal = Number.isFinite(res.componentTotal) ? Math.max(0, Math.round(res.componentTotal || 0)) : 0
      const failedComponents = Array.isArray(res.failedComponents) ? res.failedComponents : []

      if (res.partial || componentFailed > 0) {
        const moduleNames = failedComponents
          .map(item => (item?.componentName || item?.componentId || '').trim())
          .filter(Boolean)
        const moduleHint = moduleNames.length > 0
          ? `：${moduleNames.slice(0, 3).join('、')}${moduleNames.length > 3 ? tr("settings.SettingsPage.GeneralSettingsPage.c9d9155", [moduleNames.length]) : ''}`
          : ''
        if (componentTotal > 0) {
          const componentSuccess = Math.max(0, componentTotal - componentFailed)
          toast.warning(tr("settings.SettingsPage.GeneralSettingsPage.76780e1", [componentSuccess, componentTotal, componentFailed, moduleHint]))
        } else {
          toast.warning(tr("settings.SettingsPage.GeneralSettingsPage.c5eaf6e", [componentFailed, moduleHint]))
        }
      } else {
        toast.success(tr("settings.SettingsPage.GeneralSettingsPage.0e4e8a2", [imported, skipped, conflicts]))
      }
      setImportModalOpen(false)
      setImportProgress(null)
    } catch (error: any) {
      setImportProgress(prev => ({
        phase: 'error',
        progress: prev?.progress ?? 0,
        message: error?.message || tr("settings.SettingsPage.GeneralSettingsPage.f6b7a41"),
      }))
      toast.error(error?.message || tr("settings.SettingsPage.GeneralSettingsPage.f6b7a41"))
    } finally {
      setActionLoading('none')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64"><TextSpinner size="lg" label={tr("settings.SettingsPage.label.262c835")} /></div>
    )
  }

  if (loadError) return (
    <div className="space-y-5">
      <WorkspaceHeader  title={tr("settings.SettingsPage.title.e976eab")} />
      <div role="alert" className="rounded-md border border-[var(--color-error)] p-5 text-sm text-[var(--color-error)]">{tr("settings.SettingsPage.text.f266341")}{translateMessage(loadError)}</div>
      <Button onClick={() => void loadSettings()}><RefreshCw size={14} />{tr("settings.SettingsPage.text.e2d53a6")}</Button>
    </div>
  )

  return (
    <div className="apple-page w-full space-y-5">
      <WorkspaceHeader title={tr("config.navigation.config.name.7debf9c")} />
      {section === 'general' && <LanguageSettings />}
      {section === 'about' && <AboutSettings />}
      {section === 'runtime' && <AutomationSettingsCard
        automationState={automationState}
        automationProgress={automationProgress}
        automationBusy={automationBusy}
        automationCheck={automationCheck}
        automationProbe={automationProbe}
        automationNodeSourceDraft={automationNodeSourceDraft}
        automationSystemNodePathDraft={automationSystemNodePathDraft}
        automationRuntimeDirty={automationRuntimeDirty}
        launchServerPortDraft={launchServerPortDraft}
        launchServerBaseUrl={launchServerBaseUrl}
        launchServerReady={launchServerReady}
        launchServerSaving={launchServerSaving}
        onEnabledChange={handleAutomationEnabledChange}
        onHeadlessChange={handleAutomationHeadlessChange}
        onNodeSourceDraftChange={(value) => {
          setAutomationNodeSourceDraft(value)
          setAutomationProbe(null)
          setAutomationRuntimeDirty(true)
        }}
        onSystemNodePathDraftChange={(value) => {
          setAutomationSystemNodePathDraft(value)
          setAutomationProbe(null)
          setAutomationRuntimeDirty(true)
        }}
        onLaunchServerPortDraftChange={setLaunchServerPortDraft}
        onSaveLaunchServerPort={() => { void handleLaunchServerPortSave() }}
        onTypeScriptBuildChange={handleAutomationTypeScriptBuildChange}
        onProbeSystemNode={() => { void handleAutomationProbeSystemNode() }}
        onSaveRuntimeSettings={() => { void handleAutomationRuntimeSettingsSave() }}
        onInstall={() => { void handleAutomationInstall() }}
        onSelfCheck={() => { void handleAutomationSelfCheck() }}
      />}

      {section === 'storage' && <BackupSettingsCard
        actionLoading={actionLoading}
        exportProgress={exportProgress}
        exportLogs={exportLogs}
        exportLogsRef={exportLogsRef}
        onInitialize={() => { void handleInitializeSystem() }}
        onExport={() => { void handleExportSystem() }}
        onOpenImport={() => {
          setImportProgress(null)
          setImportModalOpen(true)
        }}
      />}

      <BackupImportModal
        open={importModalOpen}
        actionLoading={actionLoading}
        importProgress={importProgress}
        onClose={() => {
          setImportModalOpen(false)
          setImportProgress(null)
        }}
        onImport={(resetFirst) => { void handleImportSystem(resetFirst) }}
      />

    </div>
  )
}

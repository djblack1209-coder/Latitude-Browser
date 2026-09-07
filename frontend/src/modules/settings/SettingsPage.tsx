import { useEffect, useRef, useState } from 'react'
import { Save, RotateCcw, RefreshCw } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { WorkspaceHeader } from '../../shared/components/SignalPrimitives'
import { RadarSpinner } from '../../shared/components/RadarSpinner'
import { SettingsSectionNav } from './components/SettingsSectionNav'
import { ConnectorSettingsPanel } from './components/ConnectorSettingsPanel'
import { TorLabPanel } from './components/TorLabPanel'
import { Card, Button, ThemeSwitcher, toast } from '../../shared/components'
import {
  fetchSettings,
  saveSettings,
  resetSettings,
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
import type { AppSettings } from './types'
import type { AutomationNodeSource, AutomationRuntimeCheck, AutomationState, AutomationSystemNodeProbe } from './api'
import { defaultSettings } from './types'
import { AutomationSettingsCard } from './components/AutomationSettingsCard'
import { BackupImportModal, BackupSettingsCard } from './components/BackupSettingsCard'
import { SettingsAdvancedCard, SettingsBasicFeatureCards } from './components/SettingsGeneralCards'
import type { AutomationRuntimeProgress, BackupExportLogItem, BackupExportProgress } from './progress'
import { useSettingsProgressEffects } from './hooks/useSettingsProgressEffects'

export function SettingsPage() {
  const [query] = useSearchParams()
  const section = query.get('section') || 'general'
  const separateSection = section === 'connectors' || section === 'tor'
  const [connectorVisited, setConnectorVisited] = useState(section === 'connectors')
  const [torVisited, setTorVisited] = useState(section === 'tor')
  const [generalDirty, setGeneralDirty] = useState(false)
  const [connectorDirty, setConnectorDirty] = useState(false)
  const [torDirty, setTorDirty] = useState(false)
  const hasDrafts = generalDirty || connectorDirty || torDirty

  useEffect(() => {
    if (section === 'connectors') setConnectorVisited(true)
    if (section === 'tor') setTorVisited(true)
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
      if (!window.confirm('有未保存的设置。确定离开设置页面并放弃这些更改？')) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', confirmNavigation, true)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('click', confirmNavigation, true)
    }
  }, [hasDrafts])

  // Mount specialist sections on first visit, then keep their drafts alive.
  // Hidden Tor panels do not poll; switching partitions never executes Tor.
  return (
    <>
      <div hidden={separateSection}>
        <GeneralSettingsPage section={separateSection ? 'general' : section} onDirtyChange={setGeneralDirty} />
      </div>
      {(connectorVisited || section === 'connectors') && <div hidden={section !== 'connectors'}><ConnectorSettingsPanel active={section === 'connectors'} onDirtyChange={setConnectorDirty} /></div>}
      {(torVisited || section === 'tor') && <div hidden={section !== 'tor'}><TorLabPanel active={section === 'tor'} onDirtyChange={setTorDirty} /></div>}
    </>
  )
}

function GeneralSettingsPage({ section, onDirtyChange }: { section: string; onDirtyChange: (dirty: boolean) => void }) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
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
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState<'none' | 'init' | 'export' | 'import-reset' | 'import-merge'>('none')
  const [exportProgress, setExportProgress] = useState<BackupExportProgress | null>(null)
  const [importProgress, setImportProgress] = useState<BackupExportProgress | null>(null)
  const [exportLogs, setExportLogs] = useState<BackupExportLogItem[]>([])
  const exportLogsRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    void loadSettings()
  }, [])

  useEffect(() => { onDirtyChange(hasChanges || automationRuntimeDirty) }, [hasChanges, automationRuntimeDirty, onDirtyChange])

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
      const [data, automation, launchServer] = await Promise.all([
        fetchSettings(),
        fetchAutomationState(),
        fetchLaunchServerSettings(),
      ])
      setSettings(data)
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

  const handleChange = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    setHasChanges(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const success = await saveSettings(settings)
      if (success) {
        setHasChanges(false)
        toast.success('设置已保存')
      }
    } catch (error: any) {
      toast.error(error?.message || '保存失败，请检查配置')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (confirm('确定要重置所有设置吗？')) {
      const data = await resetSettings()
      setSettings(data)
      setHasChanges(false)
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
        toast.success('自动化支持已关闭')
        return
      }
      if (!next.status.ready) {
        setAutomationProgress({
          phase: 'checking',
          progress: 0,
          message: '已开启自动化支持，正在准备运行时...',
        })
        toast.success('自动化支持已开启，正在准备运行时')
        return
      }
      toast.success('自动化支持已开启')
    } catch (error: any) {
      toast.error(error?.message || '自动化配置保存失败')
    } finally {
      setAutomationBusy('none')
    }
  }

  const handleAutomationHeadlessChange = async (headlessDefault: boolean) => {
    setAutomationBusy('toggle')
    try {
      const next = await saveAutomationSettings(automationState.settings.enabled, headlessDefault)
      setAutomationState(next)
      toast.success(headlessDefault ? '默认无头模式已开启' : '默认无头模式已关闭')
    } catch (error: any) {
      toast.error(error?.message || '自动化配置保存失败')
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
          message: '运行时策略已保存，正在重新检查自动化运行时...',
        })
        toast.success('运行时策略已保存，正在重新检查')
        return
      }

      toast.success('运行时策略已保存')
    } catch (error: any) {
      toast.error(error?.message || '运行时策略保存失败')
    } finally {
      setAutomationBusy('none')
    }
  }

  const handleAutomationTypeScriptBuildChange = async (allowTypeScriptBuild: boolean) => {
    setAutomationBusy('package')
    try {
      const next = await saveAutomationScriptPackageSettings(allowTypeScriptBuild)
      setAutomationState(next)
      toast.success(allowTypeScriptBuild ? 'TypeScript 导入构建已开启' : 'TypeScript 导入构建已关闭')
    } catch (error: any) {
      toast.error(error?.message || '脚本包配置保存失败')
    } finally {
      setAutomationBusy('none')
    }
  }

  const handleAutomationProbeSystemNode = async () => {
    setAutomationBusy('probe')
    try {
      const result = await automationProbeSystemNode(automationSystemNodePathDraft)
      setAutomationProbe(result)
      toast.success(`系统 Node 可用：${result.version}`)
    } catch (error: any) {
      setAutomationProbe(null)
      toast.error(error?.message || '系统 Node 检测失败')
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
        message: '正在准备自动化运行时...',
      })
      toast.success('已开始准备自动化运行时')
    } catch (error: any) {
      toast.error(error?.message || '启动自动化运行时安装失败')
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
        toast.success(`自检通过：Node ${result.nodeVersion} / playwright-core ${result.playwrightVersion}`)
      } else {
        toast.warning('自检未通过')
      }
    } catch (error: any) {
      setAutomationCheck(null)
      toast.error(error?.message || '自动化运行时自检失败')
    } finally {
      setAutomationBusy('none')
    }
  }

  const handleLaunchServerPortSave = async () => {
    const port = Number(launchServerPortDraft)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      toast.error('端口必须在 1-65535 之间')
      return
    }

    setLaunchServerSaving(true)
    try {
      const next = await saveLaunchServerSettings(port)
      setLaunchServerPortDraft(String(next.preferredPort || next.port || port))
      setLaunchServerBaseUrl(next.baseUrl)
      setLaunchServerReady(next.ready)
      toast.success(`本地 API 端口已保存：${next.port}`)
    } catch (error: any) {
      toast.error(error?.message || '本地 API 端口保存失败')
    } finally {
      setLaunchServerSaving(false)
    }
  }

  const handleInitializeSystem = async () => {
    if (!confirm('初始化会清空当前数据并恢复默认状态，是否继续？')) {
      return
    }
    setActionLoading('init')
    try {
      const res = await initializeSystemData()
      if (res.cancelled) {
        toast.info('已取消初始化')
        return
      }
      toast.success(res.message || '初始化完成')
    } catch (error: any) {
      toast.error(error?.message || '初始化失败')
    } finally {
      setActionLoading('none')
    }
  }

  const handleExportSystem = async () => {
    setActionLoading('export')
    setExportLogs([])
    setExportProgress({ phase: 'starting', progress: 0, message: '准备导出...' })
    try {
      const res = await exportSystemConfig()
      if (res.cancelled) {
        setExportProgress(null)
        setExportLogs([])
        toast.info('已取消导出')
        return
      }
      setExportProgress(prev => prev?.phase === 'done'
        ? prev
        : { phase: 'done', progress: 100, message: res.message || '导出完成' })
      toast.success(res.message || '导出完成')
    } catch (error: any) {
      setExportProgress(prev => ({
        phase: 'error',
        progress: prev?.progress ?? 0,
        message: error?.message || '导出失败',
      }))
      setExportLogs(prev => {
        const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
        const text = error?.message || '导出失败'
        const next = [...prev, { id: Date.now() + Math.floor(Math.random() * 1000), phase: 'error', time: timestamp, text }]
        return next.length > 120 ? next.slice(next.length - 120) : next
      })
      toast.error(error?.message || '导出失败')
    } finally {
      setActionLoading('none')
    }
  }

  const handleImportSystem = async (resetFirst: boolean) => {
    setActionLoading(resetFirst ? 'import-reset' : 'import-merge')
    setImportProgress({
      phase: 'starting',
      progress: 0,
      message: resetFirst ? '等待选择 ZIP 配置（先初始化后加载）...' : '等待选择 ZIP 配置（判重合并）...',
    })
    try {
      const res = await importSystemConfig(resetFirst)
      if (res.cancelled) {
        setImportProgress(null)
        toast.info('已取消加载')
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
          ? `：${moduleNames.slice(0, 3).join('、')}${moduleNames.length > 3 ? ` 等 ${moduleNames.length} 个模块` : ''}`
          : ''
        if (componentTotal > 0) {
          const componentSuccess = Math.max(0, componentTotal - componentFailed)
          toast.warning(`加载完成（部分成功）：模块成功 ${componentSuccess}/${componentTotal}，异常 ${componentFailed}${moduleHint}`)
        } else {
          toast.warning(`加载完成（部分成功）：异常模块 ${componentFailed}${moduleHint}`)
        }
      } else {
        toast.success(`加载完成：导入 ${imported}，跳过 ${skipped}，冲突 ${conflicts}`)
      }
      setImportModalOpen(false)
      setImportProgress(null)
    } catch (error: any) {
      setImportProgress(prev => ({
        phase: 'error',
        progress: prev?.progress ?? 0,
        message: error?.message || '加载失败',
      }))
      toast.error(error?.message || '加载失败')
    } finally {
      setActionLoading('none')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64"><RadarSpinner size="lg" label="正在读取本地设置" /></div>
    )
  }

  if (loadError) return (
    <div className="space-y-5">
      <WorkspaceHeader eyebrow="SYSTEM / PREFERENCES" title="系统设置" />
      <SettingsSectionNav current={section} />
      <div role="alert" className="rounded-md border border-[var(--color-error)] p-5 text-sm text-[var(--color-error)]">无法读取设置：{loadError}</div>
      <Button onClick={() => void loadSettings()}><RefreshCw size={14} />重试</Button>
    </div>
  )

  return (
    <div className="apple-page w-full space-y-5">
      <WorkspaceHeader eyebrow="SYSTEM / PREFERENCES" title={section === 'runtime' ? '自动化运行时' : section === 'storage' ? '备份与数据' : '系统设置'}
        description={section === 'runtime' ? 'Node、脚本和本地 API。' : section === 'storage' ? '备份、恢复与初始化。' : '界面与本地工作区设置。'}
        actions={(section === 'general' || hasChanges) && <><Button variant="secondary" size="sm" onClick={() => void handleReset()}><RotateCcw size={14} />重置常规设置</Button><Button size="sm" onClick={() => void handleSave()} loading={saving} disabled={!hasChanges}><Save size={14} />保存设置</Button></>} />
      <SettingsSectionNav current={section} />
      {hasChanges && <p role="status" className="text-xs text-[var(--color-warning)]">有未保存的常规设置。</p>}
      {(section === 'general' || !['runtime', 'storage'].includes(section)) && <>
      {/* 主题设置 */}
      <Card title="界面主题" subtitle="不改变浏览器实例或网络策略" className="apple-section">
        <ThemeSwitcher />
      </Card>

      {/* 基础设置 */}
      <SettingsBasicFeatureCards settings={settings} onChange={handleChange} />
      <SettingsAdvancedCard settings={settings} onChange={handleChange} />
      </>}
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

import { translateMessage } from '../../../shared/i18n'
import { tr, useLocale } from '../../../shared/i18n'
﻿import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from '../../../shared/components'
import type { BrowserProfile, BrowserProfileCopyOptions, BrowserProxy } from '../types'
import { BrowserCoreEditorModal, BrowserListHeader, BrowserListSettingsModal } from '../components/BrowserListLayout'
import { BatchToolbar } from '../components/BrowserListWidgets'
import { BrowserProfilesPanel } from '../components/BrowserProfilesPanel'
import { EMPTY_FILTERS, isFiltersEmpty } from '../components/InstanceFilterBar'
import { BrowserBackupModal } from '../components/BrowserBackupModal'
import { ProxyPickerModal } from '../components/ProxyPickerModal'
import { ProfileExtensionModal } from '../components/ProfileExtensionModal'
import { createBrowserProfileCopyOptions, isBrowserProfileCopyOptionsValid } from '../copyOptions'
import { buildBrowserProfileCopyName } from '../copyName'
import { resolveActionFeedback } from '../utils/actionErrors'
import { BrowserListDialogs } from './browserList/BrowserListDialogs'
import { useBrowserListDerived, useBrowserListViewState } from './browserList/useBrowserListViewState'
import { useBrowserListSettings } from './browserList/useBrowserListSettings'
import { useBrowserListData } from './browserList/useBrowserListData'
import { useBrowserProfileActions } from './browserList/useBrowserProfileActions'
import { warmupProfileProxyBeforeStart } from '../utils/proxyWarmup'
import {
  compareBrowserProfilesByRecent,
  getBrowserProfileActivity,
  getBrowserProfileAttentionReasons,
  hasReusableFingerprintConfig,
  resolveBrowserWorkspaceMode,
} from './browserList/workspaceMode'
import {
  copyBrowserProfile,
  deleteBrowserProfile,
  exportBrowserProfilePackage,
  fetchBrowserProfileTrash,
  importBrowserProfilePackage,
  permanentlyDeleteBrowserProfile,
  restoreBrowserProfile,
  startBrowserInstance,
  stopBrowserInstance,
  updateBrowserProfile,
  openUserDataDir,
  exportFullBrowserBackup,
  importFullBrowserBackup,
} from '../api'

type BackupLoadingMode = 'none' | 'export' | 'import-merge' | 'import-reset'

const directProxyID = '__direct__'

export function BrowserListPage() {
  const uiLocale = useLocale()

  const [searchParams] = useSearchParams()
  const workspaceMode = resolveBrowserWorkspaceMode(searchParams)
  const {
    viewMode,
    setViewMode,
    filters,
    setFilters,
    headerCollapsed,
    setHeaderCollapsed,
  } = useBrowserListViewState()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchLoading, setBatchLoading] = useState(false)
  const [profilePackageBusy, setProfilePackageBusy] = useState(false)
  const [backupModalOpen, setBackupModalOpen] = useState(false)
  const [backupLoadingMode, setBackupLoadingMode] = useState<BackupLoadingMode>('none')
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean
    mode: 'single' | 'batch'
    profileId?: string
    profileName?: string
    count: number
  }>({ open: false, mode: 'single', count: 0 })

  // 代理不支持弹窗
  const [proxyErrorModal, setProxyErrorModal] = useState(false)
  const [proxyErrorMsg, setProxyErrorMsg] = useState('')
  const [opError, setOpError] = useState('')
  const [pendingStartId, setPendingStartId] = useState<string | null>(null)

  // 关键字弹窗
  const [kwModal, setKwModal] = useState<{ open: boolean; profile: BrowserProfile | null }>({ open: false, profile: null })

  const openKwModal = (profile: BrowserProfile) => setKwModal({ open: true, profile })
  const closeKwModal = () => setKwModal({ open: false, profile: null })

  const [extensionModal, setExtensionModal] = useState<{ open: boolean; profile: BrowserProfile | null }>({ open: false, profile: null })
  const openExtensionModal = (profile: BrowserProfile) => setExtensionModal({ open: true, profile })
  const closeExtensionModal = () => setExtensionModal({ open: false, profile: null })

  const [proxyPickerProfile, setProxyPickerProfile] = useState<BrowserProfile | null>(null)

  // 复制弹窗
  const [copyModal, setCopyModal] = useState<{ open: boolean; profile: BrowserProfile | null }>({ open: false, profile: null })
  const [copyName, setCopyName] = useState('')
  const [copyOptions, setCopyOptions] = useState<BrowserProfileCopyOptions>(() => createBrowserProfileCopyOptions())
  const [copying, setCopying] = useState(false)
  const [trashModalOpen, setTrashModalOpen] = useState(false)
  const [trashProfiles, setTrashProfiles] = useState<BrowserProfile[]>([])
  const [trashLoading, setTrashLoading] = useState(false)
  const [restoringId, setRestoringId] = useState('')
  const [permanentlyDeletingId, setPermanentlyDeletingId] = useState('')
  const [permanentDeleteConfirm, setPermanentDeleteConfirm] = useState<{ open: boolean; profile: BrowserProfile | null }>({
    open: false,
    profile: null,
  })

  const openCopyModal = (profile: BrowserProfile) => {
    setCopyName(buildBrowserProfileCopyName(profile.profileName))
    setCopyOptions(createBrowserProfileCopyOptions(workspaceMode === 'templates' ? 'regular' : 'auto_fingerprint'))
    setCopyModal({ open: true, profile })
  }
  const closeCopyModal = () => {
    setCopyModal({ open: false, profile: null })
    setCopyName('')
    setCopyOptions(createBrowserProfileCopyOptions())
  }
  const {
    settingsModalOpen,
    setSettingsModalOpen,
    settings,
    setSettings,
    fingerprintText,
    setFingerprintText,
    launchText,
    setLaunchText,
    startUrlsText,
    setStartUrlsText,
    savingSettings,
    cores,
    coreModalOpen,
    setCoreModalOpen,
    coreForm,
    setCoreForm,
    coreValidation,
    setCoreValidation,
    savingCore,
    loadCores,
    handleOpenSettings,
    handleSaveSettings,
    handleOpenCoreModal,
    handleValidateCorePath,
    handleSaveCore,
    handleDeleteCore,
    handleSetDefaultCore,
  } = useBrowserListSettings()
  const {
    profiles,
    loading,
    proxies,
    groups,
    startingIds,
    stoppingIds,
    setStartingIds,
    setStoppingIds,
    updatePendingIds,
    updateProfilesState,
    mergeProfileState,
    updateProxiesState,
    loadProfiles,
  } = useBrowserListData({ loadCores })
  const {
    runningCount,
    allTags,
    filteredProfiles,
    resolveProfileCore,
    getProfileCoreLabel,
    isProfileStarting,
    isProfileStopping,
    isProfileBusy,
    getProfileStatus,
  } = useBrowserListDerived(profiles, cores, filters, startingIds, stoppingIds)
  const {
    handleStart,
    handleStartDirect,
    handleStop,
    handleRestart,
  } = useBrowserProfileActions({
    profiles,
    setProxyErrorModal,
    setProxyErrorMsg,
    setPendingStartId,
    setOpError,
    setStartingIds,
    setStoppingIds,
    updatePendingIds,
    mergeProfileState,
    loadProfiles,
  })
  // 批量操作
  const toggleSelect = (profileId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(profileId) ? next.delete(profileId) : next.add(profileId)
      return next
    })
  }



  const handleSelectAll = () => {
    setSelectedIds(new Set(workspaceProfiles.map(p => p.profileId)))
  }

  const handleDeselectAll = () => {
    setSelectedIds(new Set())
  }

  const handleBatchStart = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setBatchLoading(true)
    let success = 0, pending = 0, failed = 0
    const pendingMessages: string[] = []
    const failureMessages: string[] = []
    for (const id of ids) {
      const profile = profiles.find(p => p.profileId === id)
      if (!profile || profile.running) continue
      updatePendingIds(setStartingIds, id, true)
      try {
        await warmupProfileProxyBeforeStart(profile)
        const startedProfile = await startBrowserInstance(id)
        mergeProfileState(startedProfile)
        success++
      } catch (error: any) {
        const feedback = resolveActionFeedback(error, tr("browser.pages.AutoConfigPage.AutoConfigPage.176529e"))
        if (feedback.pendingAttach) {
          pending++
          pendingMessages.push(`${profile.profileName}：${feedback.message}`)
        } else {
          failed++
          failureMessages.push(`${profile.profileName}：${feedback.message}`)
        }
      } finally {
        updatePendingIds(setStartingIds, id, false)
      }
    }
    setBatchLoading(false)
    const summary = [tr("browser.pages.BrowserListPage.BrowserListPage.1b8ffa0", [success])]
    if (pending > 0) summary.push(tr("browser.pages.BrowserListPage.BrowserListPage.681d67d", [pending]))
    if (failed > 0) summary.push(tr("browser.pages.BrowserListPage.BrowserListPage.d67dcc0", [failed]))
    toast.success(tr("browser.pages.BrowserListPage.BrowserListPage.b5bdd5a", [summary.join('，')]))
    if (pendingMessages.length > 0) {
      const preview = pendingMessages.slice(0, 3)
      const more = pendingMessages.length > preview.length ? tr("browser.pages.BrowserListPage.BrowserListPage.ddda70f", [pendingMessages.length - preview.length]) : ''
      toast.warning(tr("browser.pages.BrowserListPage.BrowserListPage.c7edbe2", [preview.join('\n'), more]))
    }
    if (failureMessages.length > 0) {
      const preview = failureMessages.slice(0, 3)
      const more = failureMessages.length > preview.length ? tr("browser.pages.BrowserListPage.BrowserListPage.21e281a", [failureMessages.length - preview.length]) : ''
      toast.error(tr("browser.pages.BrowserListPage.BrowserListPage.71ba33a", [preview.join('\n'), more]))
    }
    loadProfiles()
  }

  const handleBatchStop = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setBatchLoading(true)
    let success = 0, failed = 0
    for (const id of ids) {
      const profile = profiles.find(p => p.profileId === id)
      if (!profile || !profile.running) continue
      updatePendingIds(setStoppingIds, id, true)
      try {
        const stoppedProfile = await stopBrowserInstance(id)
        mergeProfileState(stoppedProfile)
        success++
      } catch {
        failed++
      } finally {
        updatePendingIds(setStoppingIds, id, false)
      }
    }
    setBatchLoading(false)
    toast.success(tr("browser.pages.BrowserListPage.BrowserListPage.fef7fd9", [success, failed > 0 ? tr("browser.pages.BrowserListPage.BrowserListPage.a40fdfb", [failed]) : '']))
    loadProfiles()
  }

  const handleBatchExport = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0 || profilePackageBusy) return
    const runningNames = profiles
      .filter(profile => ids.includes(profile.profileId) && profile.running)
      .map(profile => profile.profileName)
    if (runningNames.length > 0) {
      toast.error(tr("browser.pages.BrowserListPage.BrowserListPage.39bd913", [runningNames.slice(0, 3).join('、'), runningNames.length > 3 ? tr("browser.pages.BrowserListPage.BrowserListPage.93ac7be") : '']))
      return
    }
    setProfilePackageBusy(true)
    try {
      const result = await exportBrowserProfilePackage(ids)
      if (result.cancelled) return
      toast.success(tr("browser.pages.BrowserListPage.BrowserListPage.cffe067", [result.profileCount]))
    } catch (error: any) {
      toast.error(error?.message || tr("browser.pages.BrowserListPage.BrowserListPage.5e62c2a"))
    } finally {
      setProfilePackageBusy(false)
    }
  }

  const handleExportProfile = async (profile: BrowserProfile) => {
    if (profilePackageBusy) return
    if (profile.running) {
      toast.error(tr("browser.pages.BrowserListPage.BrowserListPage.1ec6c93", [profile.profileName]))
      return
    }
    setProfilePackageBusy(true)
    try {
      const result = await exportBrowserProfilePackage([profile.profileId])
      if (result.cancelled) return
      toast.success(tr("browser.pages.BrowserListPage.BrowserListPage.7c25866", [profile.profileName]))
    } catch (error: any) {
      toast.error(error?.message || tr("browser.pages.BrowserListPage.BrowserListPage.5e62c2a"))
    } finally {
      setProfilePackageBusy(false)
    }
  }

  const handleOpenUserDataDir = async (profile: BrowserProfile) => {
    try {
      if (!profile.userDataDir.trim()) {
        toast.warning(tr("browser.pages.BrowserListPage.BrowserListPage.5eec764"))
        return
      }
      const opened = await openUserDataDir(profile.userDataDir)
      if (!opened) {
        toast.warning(tr("browser.pages.BrowserListPage.BrowserListPage.a27e0b4"))
      }
    } catch (error: any) {
      toast.error(error?.message || tr("browser.pages.BrowserListPage.BrowserListPage.ec82ab3"))
    }
  }

  const handleImportProfiles = async () => {
    if (profilePackageBusy) return
    setProfilePackageBusy(true)
    try {
      const result = await importBrowserProfilePackage()
      if (result.cancelled) return
      const warnings = result.warnings || []
      if (warnings.length > 0) {
        toast.warning(tr("browser.pages.BrowserListPage.BrowserListPage.9b133a5", [result.importedCount, warnings.length, warnings[0]]))
      } else {
        toast.success(tr("browser.pages.BrowserListPage.BrowserListPage.bd1d7c2", [result.importedCount]))
      }
      setSelectedIds(new Set())
      await loadProfiles()
    } catch (error: any) {
      toast.error(error?.message || tr("browser.pages.BrowserListPage.BrowserListPage.b7f2bec"))
    } finally {
      setProfilePackageBusy(false)
    }
  }

  const handleExportFullBackup = async () => {
    if (backupLoadingMode !== 'none') return
    if (runningCount > 0) {
      toast.warning(tr("browser.pages.BrowserListPage.BrowserListPage.1a87e5e", [runningCount]))
    }
    setBackupLoadingMode('export')
    try {
      const result = await exportFullBrowserBackup()
      if (result.cancelled) return
      toast.success(result.zipPath ? tr("browser.pages.BrowserListPage.BrowserListPage.3b0236c", [result.zipPath]) : (result.message || tr("browser.pages.BrowserListPage.BrowserListPage.ce3605f")))
    } catch (error: any) {
      toast.error(error?.message || tr("browser.pages.BrowserListPage.BrowserListPage.dee1541"))
    } finally {
      setBackupLoadingMode('none')
    }
  }

  const handleImportFullBackup = async (resetFirst: boolean) => {
    if (backupLoadingMode !== 'none') return
    const mode: BackupLoadingMode = resetFirst ? 'import-reset' : 'import-merge'
    setBackupLoadingMode(mode)
    try {
      const result = await importFullBrowserBackup(resetFirst)
      if (result.cancelled) return
      toast.success(result.message || (resetFirst ? tr("browser.pages.BrowserListPage.BrowserListPage.8e990e6") : tr("browser.pages.BrowserListPage.BrowserListPage.eaabd0a")))
      setSelectedIds(new Set())
      setBackupModalOpen(false)
      await loadProfiles()
    } catch (error: any) {
      toast.error(error?.message || tr("browser.pages.BrowserListPage.BrowserListPage.58a6a06"))
    } finally {
      setBackupLoadingMode('none')
    }
  }

  const openDeleteConfirm = (profileId: string) => {
    const profile = profiles.find(item => item.profileId === profileId)
    setDeleteConfirm({
      open: true,
      mode: 'single',
      profileId,
      profileName: profile?.profileName,
      count: 1,
    })
  }

  const loadTrashProfiles = async () => {
    setTrashLoading(true)
    try {
      setTrashProfiles(await fetchBrowserProfileTrash())
    } catch (error: any) {
      toast.error(error?.message || tr("browser.pages.BrowserListPage.BrowserListPage.9233e57"))
    } finally {
      setTrashLoading(false)
    }
  }

  const openTrashModal = () => {
    setTrashModalOpen(true)
    void loadTrashProfiles()
  }

  const handleRestoreProfile = async (profileId: string) => {
    setRestoringId(profileId)
    try {
      await restoreBrowserProfile(profileId)
      toast.success(tr("browser.pages.BrowserListPage.BrowserListPage.6c38243"))
      await loadTrashProfiles()
      await loadProfiles()
    } catch (error: any) {
      toast.error(error?.message || tr("browser.pages.BrowserListPage.BrowserListPage.76842a0"))
    } finally {
      setRestoringId('')
    }
  }

  const handleConfirmPermanentDelete = async () => {
    const profile = permanentDeleteConfirm.profile
    if (!profile) return
    setPermanentlyDeletingId(profile.profileId)
    try {
      await permanentlyDeleteBrowserProfile(profile.profileId)
      toast.success(tr("browser.pages.BrowserListPage.BrowserListPage.b4a10f2"))
      setPermanentDeleteConfirm({ open: false, profile: null })
      await loadTrashProfiles()
    } catch (error: any) {
      toast.error(error?.message || tr("browser.pages.BrowserListPage.BrowserListPage.6a92447"))
    } finally {
      setPermanentlyDeletingId('')
    }
  }

  const openBatchDeleteConfirm = () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setDeleteConfirm({ open: true, mode: 'batch', count: ids.length })
  }

  const closeDeleteConfirm = () => {
    if (batchLoading) return
    setDeleteConfirm({ open: false, mode: 'single', count: 0 })
  }

  const handleConfirmDelete = async () => {
    const ids = deleteConfirm.mode === 'batch'
      ? Array.from(selectedIds)
      : deleteConfirm.profileId ? [deleteConfirm.profileId] : []
    if (ids.length === 0) return
    setBatchLoading(true)
    try {
      for (const id of ids) {
        await deleteBrowserProfile(id)
      }
      setSelectedIds(prev => {
        const next = new Set(prev)
        ids.forEach(id => next.delete(id))
        return next
      })
      toast.success(ids.length > 1 ? tr("browser.pages.BrowserListPage.BrowserListPage.fc78416", [ids.length]) : tr("browser.pages.BrowserListPage.BrowserListPage.f9c34f0"))
      setDeleteConfirm({ open: false, mode: 'single', count: 0 })
      loadProfiles()
    } catch (error: any) {
      toast.error(error?.message || tr("browser.components.ProxyPickerModal.ProxyPickerModal.72250c5"))
    } finally {
      setBatchLoading(false)
    }
  }

  const handleCopy = async (profileId: string) => {
    if (!copyModal.profile) return
    setCopying(true)
    try {
      await copyBrowserProfile(profileId, copyName.trim(), copyOptions)
      toast.success(tr("browser.pages.BrowserListPage.BrowserListPage.bbaf4de"))
      closeCopyModal()
      loadProfiles()
    } catch (error: any) {
      setOpError(typeof error === 'string' ? error : error?.message || tr("browser.components.AutomationScriptPublicApiModal.helpers.copyText.f2c6b51"))
    } finally {
      setCopying(false)
    }
  }

  const copyConfirmDisabled =
    !copyName.trim() || !isBrowserProfileCopyOptionsValid(copyOptions)

  const attentionProfiles = useMemo(
    () => profiles.filter((profile) => (
      getBrowserProfileAttentionReasons(profile, Boolean(resolveProfileCore(profile))).length > 0
    )),
    [profiles, cores, uiLocale],
  )
  const fingerprintSourceProfiles = useMemo(
    () => profiles.filter(hasReusableFingerprintConfig),
    [profiles, uiLocale],
  )
  const recentRecordedCount = useMemo(
    () => profiles.filter((profile) => getBrowserProfileActivity(profile) !== null).length,
    [profiles, uiLocale],
  )
  const workspaceProfiles = useMemo(() => {
    if (workspaceMode === 'recent') {
      return [...filteredProfiles].sort(compareBrowserProfilesByRecent)
    }
    if (workspaceMode === 'attention') {
      const attentionIds = new Set(attentionProfiles.map((profile) => profile.profileId))
      return filteredProfiles.filter((profile) => attentionIds.has(profile.profileId))
    }
    if (workspaceMode === 'templates') {
      const sourceIds = new Set(fingerprintSourceProfiles.map((profile) => profile.profileId))
      return filteredProfiles.filter((profile) => sourceIds.has(profile.profileId))
    }
    return filteredProfiles
  }, [attentionProfiles, filteredProfiles, fingerprintSourceProfiles, workspaceMode, uiLocale])

  useEffect(() => {
    setSelectedIds(new Set())
  }, [workspaceMode])

  const hasActiveFilters = !isFiltersEmpty(filters)
  const clearFilters = () => setFilters({ ...EMPTY_FILTERS, tags: new Set() })

  const saveProfileProxy = async (profile: BrowserProfile, proxy: BrowserProxy) => {
    try {
      const updated = await updateBrowserProfile(profile.profileId, {
        profileName: profile.profileName,
        userDataDir: profile.userDataDir,
        coreId: profile.coreId,
        fingerprintArgs: profile.fingerprintArgs,
        proxyId: proxy.proxyId,
        proxyConfig: '',
        memoryLimitMb: profile.memoryLimitMb || 0,
        launchArgs: profile.launchArgs,
        tags: profile.tags,
        keywords: profile.keywords || [],
        groupId: profile.groupId || '',
      })
      mergeProfileState(updated || { ...profile, proxyId: proxy.proxyId, proxyConfig: '' })
      toast.success(tr("browser.pages.BrowserListPage.BrowserListPage.7f57dda"))
    } catch (error: any) {
      toast.error(error?.message || tr("browser.pages.BrowserListPage.BrowserListPage.676bcaa"))
    }
  }

  const handleProxyDeletedFromPicker = (deletedProxyId: string, nextProxies: BrowserProxy[]) => {
    updateProxiesState(nextProxies)
    if (!proxyPickerProfile || proxyPickerProfile.proxyId !== deletedProxyId) return
    const fallbackProxy = nextProxies.find(proxy => proxy.proxyId === directProxyID || proxy.proxyConfig === 'direct://')
    if (fallbackProxy) {
      void saveProfileProxy(proxyPickerProfile, fallbackProxy)
    }
  }


  return (
    <div className="apple-page flex min-h-full flex-col gap-4">
      <BrowserListHeader
        workspaceMode={workspaceMode}
        profileCount={profiles.length}
        filteredProfileCount={workspaceProfiles.length}
        hasActiveFilters={hasActiveFilters}
        runningCount={runningCount}
        attentionCount={attentionProfiles.length}
        fingerprintSourceCount={fingerprintSourceProfiles.length}
        recentRecordedCount={recentRecordedCount}
        headerCollapsed={headerCollapsed}
        viewMode={viewMode}
        proxies={proxies}
        cores={cores}
        groups={groups}
        allTags={allTags}
        filters={filters}
        onFiltersChange={setFilters}
        onToggleHeaderCollapsed={() => setHeaderCollapsed((prev) => !prev)}
        onRefresh={() => { void loadProfiles() }}
        onOpenSettings={handleOpenSettings}
        onOpenTrash={openTrashModal}
        onImportProfiles={handleImportProfiles}
        onOpenBackup={() => setBackupModalOpen(true)}
        importingProfiles={profilePackageBusy}
        onViewModeChange={setViewMode}
      />

      {/* 批量操作工具栏 */}
      <BatchToolbar
        selectedCount={selectedIds.size}
        totalCount={workspaceProfiles.length}
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
        onBatchStart={handleBatchStart}
        onBatchStop={handleBatchStop}
        onBatchExport={handleBatchExport}
        onOpenBackup={() => setBackupModalOpen(true)}
        onBatchDelete={openBatchDeleteConfirm}
        batchLoading={batchLoading}
        exporting={profilePackageBusy}
      />

      <BrowserBackupModal
        open={backupModalOpen}
        runningCount={runningCount}
        selectedCount={selectedIds.size}
        selectedExporting={profilePackageBusy}
        loadingMode={backupLoadingMode}
        onClose={() => setBackupModalOpen(false)}
        onExportSelected={() => { void handleBatchExport() }}
        onExportFull={() => { void handleExportFullBackup() }}
        onImportMerge={() => { void handleImportFullBackup(false) }}
        onImportReset={() => { void handleImportFullBackup(true) }}
      />

      <BrowserProfilesPanel
        loading={loading}
        totalProfileCount={profiles.length}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
        workspaceMode={workspaceMode}
        viewMode={viewMode}
        profiles={workspaceProfiles}
        proxies={proxies}
        selectedIds={selectedIds}
        resolveProfileCore={resolveProfileCore}
        getProfileCoreLabel={getProfileCoreLabel}
        getProfileStatus={getProfileStatus}
        isProfileStarting={isProfileStarting}
        isProfileStopping={isProfileStopping}
        isProfileBusy={isProfileBusy}
        onToggleSelect={toggleSelect}
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
        onRefreshProfiles={() => { void loadProfiles() }}
        onStart={(profileId) => { void handleStart(profileId) }}
        onStop={(profileId) => { void handleStop(profileId) }}
        onRestart={(profileId) => { void handleRestart(profileId) }}
        onOpenKeywords={openKwModal}
        onOpenExtensions={openExtensionModal}
        onOpenDataDir={(profile) => { void handleOpenUserDataDir(profile) }}
        onExport={(profile) => { void handleExportProfile(profile) }}
        onOpenCopy={openCopyModal}
        onOpenProxyPicker={setProxyPickerProfile}
        onDelete={openDeleteConfirm}
      />

      <ProxyPickerModal
        open={!!proxyPickerProfile}
        currentProxyId={proxyPickerProfile?.proxyId || directProxyID}
        title={proxyPickerProfile ? tr("browser.components.BrowserProfilesPanel.ProxyInlineActions.8dfa43b", [proxyPickerProfile.profileName]) : tr("browser.components.BrowserProfilesPanel.ProxyInlineActions.a466de9")}
        onSelect={(proxy) => {
          if (proxyPickerProfile) {
            void saveProfileProxy(proxyPickerProfile, proxy)
          }
        }}
        onProxyListUpdated={updateProxiesState}
        onProxyDeleted={handleProxyDeletedFromPicker}
        onClose={() => setProxyPickerProfile(null)}
      />

      <ProfileExtensionModal
        open={extensionModal.open}
        profile={extensionModal.profile}
        onClose={closeExtensionModal}
      />

      <BrowserListSettingsModal
        open={settingsModalOpen}
        settings={settings}
        fingerprintText={fingerprintText}
        launchText={launchText}
        startUrlsText={startUrlsText}
        savingSettings={savingSettings}
        cores={cores}
        onClose={() => setSettingsModalOpen(false)}
        onSave={handleSaveSettings}
        onSettingsChange={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
        onFingerprintTextChange={setFingerprintText}
        onLaunchTextChange={setLaunchText}
        onStartUrlsTextChange={setStartUrlsText}
        onAddCore={() => handleOpenCoreModal()}
        onEditCore={handleOpenCoreModal}
        onDeleteCore={handleDeleteCore}
        onSetDefaultCore={handleSetDefaultCore}
      />

      <BrowserCoreEditorModal
        open={coreModalOpen}
        coreForm={coreForm}
        coreValidation={coreValidation}
        savingCore={savingCore}
        onClose={() => setCoreModalOpen(false)}
        onSave={handleSaveCore}
        onValidate={handleValidateCorePath}
        onCoreFormChange={(patch) => {
          setCoreForm((prev) => ({ ...prev, ...patch }))
          if (Object.prototype.hasOwnProperty.call(patch, 'corePath')) {
            setCoreValidation(null)
          }
        }}
      />

      <BrowserListDialogs
        proxyErrorModal={proxyErrorModal}
        pendingStartId={pendingStartId}
        proxyErrorMsg={proxyErrorMsg}
        onCloseProxyError={() => {
          setProxyErrorModal(false)
          setPendingStartId(null)
        }}
        onStartDirect={() => {
          if (pendingStartId) {
            void handleStartDirect(pendingStartId)
          }
        }}
        startingDirect={pendingStartId ? startingIds.has(pendingStartId) : false}
        kwModal={kwModal}
        onCloseKeywords={closeKwModal}
        onKeywordsSaved={(keywords) => {
          updateProfilesState(prev => prev.map(p =>
            p.profileId === kwModal.profile!.profileId ? { ...p, keywords } : p
          ))
        }}
        copyModal={copyModal}
        copyName={copyName}
        copyOptions={copyOptions}
        onCopyNameChange={setCopyName}
        onCopyOptionsChange={setCopyOptions}
        onCloseCopy={closeCopyModal}
        onConfirmCopy={() => copyModal.profile && handleCopy(copyModal.profile.profileId)}
        copyConfirmDisabled={copyConfirmDisabled}
        copying={copying}
        deleteConfirm={deleteConfirm}
        deleting={batchLoading}
        onCloseDeleteConfirm={closeDeleteConfirm}
        onConfirmDelete={() => { void handleConfirmDelete() }}
        trashModalOpen={trashModalOpen}
        trashProfiles={trashProfiles}
        trashLoading={trashLoading}
        restoringId={restoringId}
        permanentlyDeletingId={permanentlyDeletingId}
        permanentDeleteConfirm={permanentDeleteConfirm}
        onCloseTrash={() => setTrashModalOpen(false)}
        onRestoreProfile={(profileId) => { void handleRestoreProfile(profileId) }}
        onOpenPermanentDelete={(profile) => setPermanentDeleteConfirm({ open: true, profile })}
        onClosePermanentDelete={() => setPermanentDeleteConfirm({ open: false, profile: null })}
        onConfirmPermanentDelete={() => { void handleConfirmPermanentDelete() }}
        opError={translateMessage(opError)}
        onCloseOpError={() => setOpError('')}
      />
    </div>
  )
}

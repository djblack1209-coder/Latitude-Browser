import { AssetScopeTabs } from './AssetScopeTabs'
import { tr, sourceText, useLocale } from '../../../shared/i18n'
import { useEffect, useMemo, useState } from 'react'
import { Modal, toast } from '../../../shared/components'
import type { BrowserExtension, BrowserExtensionLookupResult, BrowserProxy } from '../types'
import {
  deleteBrowserExtension,
  fetchBrowserExtensions,
  getBrowserExtensionManualInstallGuide,
  installBrowserExtension,
  installBrowserExtensionLocalDirectory,
  installBrowserExtensionLocalFile,
  installBrowserExtensionManualDownloadFile,
  listBrowserExtensionManualDownloadFiles,
  lookupBrowserExtension,
  openBrowserExtensionManualDownloadDir,
  setBrowserExtensionEnabled,
  type BrowserExtensionManualDownloadFile,
  type BrowserExtensionManualInstallGuide,
} from '../api/extensions'
import { fetchBrowserProxies } from '../api/proxies'
import { ProxyPickerModal } from '../components/ProxyPickerModal'
import { ExtensionInstallCard, ExtensionManagementHeader, InstalledExtensionsList } from './ExtensionManagementCards'
import { DownloadDirectoryInstallModal, ExtensionHistoryModal, ExtensionProfileLimitModal, ManualInstallModal } from './ExtensionManagementModals'
import { EXTENSION_HISTORY_LIMIT, buildChromeWebStoreQueryURL, createExtensionHistoryRecord, extensionStoreURL, loadExtensionDownloadProxyPreference, loadExtensionHistory, saveExtensionDownloadProxyPreference, saveExtensionHistory, type ExtensionHistoryRecord } from './extensionManagementUtils'

export function ExtensionManagementPage() {
  const uiLocale = useLocale()

  const [items, setItems] = useState<BrowserExtension[]>([])
  const [query, setQuery] = useState('')
  const [installOpen, setInstallOpen] = useState(false)
  const [lookup, setLookup] = useState<BrowserExtensionLookupResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [querying, setQuerying] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [importing, setImporting] = useState<'none' | 'file' | 'directory'>('none')
  const [updatingId, setUpdatingId] = useState('')
  const [busyId, setBusyId] = useState('')
  const [busyAction, setBusyAction] = useState<'toggle' | 'delete' | ''>('')
  const [proxies, setProxies] = useState<BrowserProxy[]>([])
  const [useProxy, setUseProxy] = useState(false)
  const [selectedProxyId, setSelectedProxyId] = useState('')
  const [proxyModalOpen, setProxyModalOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyRecords, setHistoryRecords] = useState<ExtensionHistoryRecord[]>([])
  const [manualOpen, setManualOpen] = useState(false)
  const [manualLoading, setManualLoading] = useState(false)
  const [manualGuide, setManualGuide] = useState<BrowserExtensionManualInstallGuide | null>(null)
  const [manualFiles, setManualFiles] = useState<BrowserExtensionManualDownloadFile[]>([])
  const [manualFileLoading, setManualFileLoading] = useState(false)
  const [manualImportingFileName, setManualImportingFileName] = useState('')
  const [downloadDirOpen, setDownloadDirOpen] = useState(false)
  const [lastLookupProxyLabel, setLastLookupProxyLabel] = useState('')
  const [limitExtension, setLimitExtension] = useState<BrowserExtension | null>(null)

  const installedIds = useMemo(() => new Set(items.map((item) => item.extensionId)), [items, uiLocale])
  const selectedProxy = useMemo(
    () => proxies.find((proxy) => proxy.proxyId === selectedProxyId),
    [proxies, selectedProxyId, uiLocale],
  )
  const downloadProxyConfig = useProxy ? selectedProxy?.proxyConfig || '' : ''

  const refresh = async () => {
    setLoading(true)
    try {
      setItems(await fetchBrowserExtensions())
    } catch (error: any) {
      toast.error(error?.message || tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.4e73dc6"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    setHistoryRecords(loadExtensionHistory())
  }, [])

  useEffect(() => {
    fetchBrowserProxies().then((items) => {
      const preference = loadExtensionDownloadProxyPreference()
      const directProxyId = items.find((item) => item.proxyConfig === 'direct://')?.proxyId || ''
      const restoredProxy = preference.proxyId ? items.find((item) => item.proxyId === preference.proxyId) : undefined
      setProxies(items)
      if (preference.useProxy && restoredProxy && restoredProxy.proxyConfig !== 'direct://') {
        setUseProxy(true)
        setSelectedProxyId(restoredProxy.proxyId)
      } else {
        setUseProxy(false)
        setSelectedProxyId(directProxyId)
      }
    }).catch(() => {
      setProxies([])
    })
  }, [])

  const appendHistory = (input: Omit<ExtensionHistoryRecord, 'id' | 'createdAt'>) => {
    const record = createExtensionHistoryRecord(input)
    setHistoryRecords((current) => {
      const next = [record, ...current].slice(0, EXTENSION_HISTORY_LIMIT)
      saveExtensionHistory(next)
      return next
    })
  }

  const currentProxyLabel = () => (useProxy && selectedProxy ? tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.9e48cf8", [selectedProxy.proxyName || selectedProxy.proxyId]) : tr("browser.pages.AutoConfigPage.direct.a7dd3b6"))

  const handleLookup = async () => {
    const value = query.trim()
    if (!value) {
      toast.warning(tr("browser.pages.ExtensionManagementModals.text.272faaf"))
      return
    }
    if (useProxy && !downloadProxyConfig) {
      toast.warning(tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.dd04af3"))
      return
    }
    setQuerying(true)
    try {
      const result = await lookupBrowserExtension(value, downloadProxyConfig, useProxy)
      setLookup(result)
      const proxyLabel = currentProxyLabel()
      setLastLookupProxyLabel(useProxy && selectedProxy ? proxyLabel : tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.c6e00ec"))
      appendHistory({
        action: 'lookup',
        query: value,
        extensionId: result.extensionId || '',
        name: result.name || '',
        version: result.version || '',
        storeUrl: result.storeUrl || '',
        proxyLabel,
        ok: result.installable,
        message: result.message || '',
      })
    } catch (error: any) {
      setLookup(null)
      appendHistory({
        action: 'lookup',
        query: value,
        extensionId: '',
        name: '',
        version: '',
        storeUrl: buildChromeWebStoreQueryURL(value),
        proxyLabel: currentProxyLabel(),
        ok: false,
        message: error?.message || tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.cd476e7"),
      })
      toast.error(error?.message || tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.cd476e7"))
    } finally {
      setQuerying(false)
    }
  }

  const handleOpenWebStoreQuery = () => {
    window.open(buildChromeWebStoreQueryURL(query), '_blank', 'noopener,noreferrer')
  }

  const refreshManualFiles = async () => {
    setManualFileLoading(true)
    try {
      setManualFiles(await listBrowserExtensionManualDownloadFiles())
    } catch (error: any) {
      toast.error(error?.message || tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.d92acd7"))
    } finally {
      setManualFileLoading(false)
    }
  }

  const handleOpenManualInstall = async () => {
    const target = lookup?.extensionId || query.trim()
    if (!target) {
      toast.warning(tr("browser.pages.ExtensionManagementModals.text.272faaf"))
      return
    }
    setManualOpen(true)
    setManualLoading(true)
    try {
      setManualGuide(await getBrowserExtensionManualInstallGuide(target))
      void refreshManualFiles()
    } catch (error: any) {
      setManualGuide(null)
      toast.error(error?.message || tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.facb340"))
    } finally {
      setManualLoading(false)
    }
  }

  const handleOpenManualDownloadDir = async () => {
    try {
      await openBrowserExtensionManualDownloadDir()
    } catch (error: any) {
      toast.error(error?.message || tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.163a5e9"))
    }
  }

  const handleOpenDownloadDirectoryInstall = async () => {
    setDownloadDirOpen(true)
    try {
      await openBrowserExtensionManualDownloadDir()
      await refreshManualFiles()
    } catch (error: any) {
      toast.error(error?.message || tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.163a5e9"))
    }
  }

  const handleImportManualFile = async (fileName: string) => {
    setManualImportingFileName(fileName)
    try {
      const installed = await installBrowserExtensionManualDownloadFile(fileName)
      appendHistory({
        action: 'import',
        query: fileName,
        extensionId: installed.extensionId || '',
        name: installed.name || '',
        version: installed.version || '',
        storeUrl: installed.sourceUrl || '',
        proxyLabel: tr("browser.pages.ExtensionManagementPage.proxyLabel.c80e854"),
        ok: true,
        message: tr("browser.pages.ExtensionManagementPage.message.425516b"),
      })
      toast.success(tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.34e9481", [installed.name || installed.extensionId]))
      setManualOpen(false)
      setDownloadDirOpen(false)
      await refresh()
    } catch (error: any) {
      appendHistory({
        action: 'import',
        query: fileName,
        extensionId: '',
        name: '',
        version: '',
        storeUrl: '',
        proxyLabel: tr("browser.pages.ExtensionManagementPage.proxyLabel.c80e854"),
        ok: false,
        message: error?.message || tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.fff89eb"),
      })
      toast.error(error?.message || tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.fff89eb"))
    } finally {
      setManualImportingFileName('')
    }
  }

  const handleInstall = async () => {
    const target = lookup?.extensionId || query.trim()
    if (!target) return
    if (useProxy && !downloadProxyConfig) {
      toast.warning(tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.dd04af3"))
      return
    }
    setInstalling(true)
    try {
      const installed = await installBrowserExtension(target, downloadProxyConfig, useProxy)
      appendHistory({
        action: 'install',
        query: target,
        extensionId: installed.extensionId || target,
        name: installed.name || '',
        version: installed.version || '',
        storeUrl: installed.sourceUrl || buildChromeWebStoreQueryURL(target),
        proxyLabel: currentProxyLabel(),
        ok: true,
        message: tr("browser.pages.ExtensionManagementPage.message.055c684"),
      })
      toast.success(tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.78f32ce", [installed.name || installed.extensionId]))
      setLookup(null)
      setLastLookupProxyLabel('')
      setQuery('')
      await refresh()
    } catch (error: any) {
      appendHistory({
        action: 'install',
        query: target,
        extensionId: lookup?.extensionId || '',
        name: lookup?.name || '',
        version: lookup?.version || '',
        storeUrl: lookup?.storeUrl || buildChromeWebStoreQueryURL(target),
        proxyLabel: currentProxyLabel(),
        ok: false,
        message: error?.message || tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.bccf98b"),
      })
      toast.error(error?.message || tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.bccf98b"))
    } finally {
      setInstalling(false)
    }
  }

  const handleImportLocal = async (mode: 'file' | 'directory') => {
    setImporting(mode)
    try {
      const installed = mode === 'file'
        ? await installBrowserExtensionLocalFile()
        : await installBrowserExtensionLocalDirectory()
      appendHistory({
        action: 'import',
        query: mode === 'file' ? tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.845e892") : tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.023baed"),
        extensionId: installed.extensionId || '',
        name: installed.name || '',
        version: installed.version || '',
        storeUrl: installed.sourceUrl || '',
        proxyLabel: tr("browser.pages.ExtensionManagementPage.proxyLabel.8d9d869"),
        ok: true,
        message: tr("browser.pages.ExtensionManagementPage.message.425516b"),
      })
      toast.success(tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.34e9481", [installed.name || installed.extensionId]))
      await refresh()
    } catch (error: any) {
      const message = error?.message || tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.fff89eb")
      if (!message.includes(sourceText("browser.pages.ExtensionManagementPage.ExtensionManagementPage.a5ffdc9"))) {
        appendHistory({
          action: 'import',
          query: mode === 'file' ? tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.845e892") : tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.023baed"),
          extensionId: '',
          name: '',
          version: '',
          storeUrl: '',
          proxyLabel: tr("browser.pages.ExtensionManagementPage.proxyLabel.8d9d869"),
          ok: false,
          message,
        })
      }
      if (!message.includes(sourceText("browser.pages.ExtensionManagementPage.ExtensionManagementPage.a5ffdc9"))) toast.error(message)
    } finally {
      setImporting('none')
    }
  }

  const handleUpdateExtension = async (item: BrowserExtension) => {
    if (useProxy && !downloadProxyConfig) {
      toast.warning(tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.dd04af3"))
      return
    }
    setUpdatingId(item.extensionId)
    try {
      const installed = await installBrowserExtension(item.extensionId, downloadProxyConfig, useProxy)
      appendHistory({
        action: 'install',
        query: item.extensionId,
        extensionId: installed.extensionId || item.extensionId,
        name: installed.name || item.name || '',
        version: installed.version || '',
        storeUrl: installed.sourceUrl || buildChromeWebStoreQueryURL(item.extensionId),
        proxyLabel: currentProxyLabel(),
        ok: true,
        message: item.version && installed.version && item.version !== installed.version ? tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.1c6d6cd", [item.version, installed.version]) : tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.1304c2e"),
      })
      toast.success(item.version && installed.version && item.version !== installed.version
        ? tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.59936ff", [installed.version])
        : tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.49710f1"))
      await refresh()
    } catch (error: any) {
      appendHistory({
        action: 'install',
        query: item.extensionId,
        extensionId: item.extensionId,
        name: item.name || '',
        version: item.version || '',
        storeUrl: extensionStoreURL(item) || buildChromeWebStoreQueryURL(item.extensionId),
        proxyLabel: currentProxyLabel(),
        ok: false,
        message: error?.message || tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.530519d"),
      })
      toast.error(error?.message || tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.530519d"))
    } finally {
      setUpdatingId('')
    }
  }

  const handleToggle = async (item: BrowserExtension) => {
    setBusyId(item.extensionId)
    setBusyAction('toggle')
    try {
      const updated = await setBrowserExtensionEnabled(item.extensionId, !item.enabled)
      setItems((current) => current.map((entry) => entry.extensionId === updated.extensionId ? updated : entry))
    } catch (error: any) {
      toast.error(error?.message || tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.14aa4dd"))
    } finally {
      setBusyId('')
      setBusyAction('')
    }
  }

  const handleDelete = async (item: BrowserExtension) => {
    if (!window.confirm(tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.050a22b", [item.name || item.extensionId]))) return
    setBusyId(item.extensionId)
    setBusyAction('delete')
    try {
      await deleteBrowserExtension(item.extensionId)
      setItems((current) => current.filter((entry) => entry.extensionId !== item.extensionId))
      toast.success(tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.c447f39"))
    } catch (error: any) {
      toast.error(error?.message || tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.9b1eab6"))
    } finally {
      setBusyId('')
      setBusyAction('')
    }
  }

  const handlePickHistory = (record: ExtensionHistoryRecord) => {
    setQuery(record.extensionId || record.query)
    setLookup(null)
    setLastLookupProxyLabel('')
    setHistoryOpen(false)
  }

  const handleClearHistory = () => {
    setHistoryRecords([])
    saveExtensionHistory([])
    toast.success(tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.a4a8f9c"))
  }

  const proxyButtonText = useProxy
    ? tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.e1b65c9", [selectedProxy?.proxyName || selectedProxyId || tr("browser.pages.ExtensionManagementPage.ExtensionManagementPage.53e2db7")])
    : tr("browser.pages.ExtensionManagementCards.text.22eff2b")

  return (
    <div className="apple-page space-y-4">
      <ExtensionManagementHeader
        proxyButtonText={proxyButtonText}
        loading={loading}
        importing={importing}
        downloadDirectoryLoading={manualFileLoading && downloadDirOpen}
        installedCount={items.length}
        enabledCount={items.filter((item) => item.enabled).length}
        historyCount={historyRecords.length}
        useProxy={useProxy}
        selectedProxy={selectedProxy}
        onOpenProxy={() => setProxyModalOpen(true)}
        onOpenHistory={() => setHistoryOpen(true)}
        onImportFile={() => void handleImportLocal('file')}
        onImportDirectory={() => void handleImportLocal('directory')}
        onOpenDownloadDirectory={() => void handleOpenDownloadDirectoryInstall()}
        onRefresh={refresh}
        onOpenInstall={() => setInstallOpen(true)}
      />

      <ProxyPickerModal
        open={proxyModalOpen}
        title={tr("browser.pages.ExtensionManagementPage.title.c8407e1")}
        currentProxyId={useProxy ? selectedProxyId : proxies.find((item) => item.proxyConfig === 'direct://')?.proxyId || ''}
        onClose={() => setProxyModalOpen(false)}
        onSelect={(proxy) => {
          setProxies((current) => {
            if (current.some((item) => item.proxyId === proxy.proxyId)) return current
            return [...current, proxy]
          })
          setSelectedProxyId(proxy.proxyId)
          const nextUseProxy = proxy.proxyConfig !== 'direct://'
          setUseProxy(nextUseProxy)
          saveExtensionDownloadProxyPreference({ useProxy: nextUseProxy, proxyId: proxy.proxyId })
        }}
        onProxyListUpdated={(nextProxies) => {
          setProxies(nextProxies)
        }}
        onProxyDeleted={(deletedProxyId, nextProxies) => {
          setProxies(nextProxies)
          if (deletedProxyId === selectedProxyId) {
            const directProxyId = nextProxies.find((item) => item.proxyConfig === 'direct://')?.proxyId || ''
            setUseProxy(false)
            setSelectedProxyId(directProxyId)
            saveExtensionDownloadProxyPreference({ useProxy: false, proxyId: directProxyId })
          }
        }}
        onProxyTested={(proxyId, result) => {
          const testedAt = new Date().toISOString()
          setProxies((current) => current.map((proxy) => (
            proxy.proxyId === proxyId
              ? { ...proxy, lastTestOk: result.ok, lastLatencyMs: result.ok ? result.latencyMs : -1, lastTestedAt: testedAt }
              : proxy
          )))
        }}
      />

      <ExtensionHistoryModal
        open={historyOpen}
        records={historyRecords}
        onClose={() => setHistoryOpen(false)}
        onPick={handlePickHistory}
        onClear={handleClearHistory}
      />

      <ExtensionProfileLimitModal
        open={!!limitExtension}
        extension={limitExtension}
        allExtensions={items}
        onClose={() => setLimitExtension(null)}
      />

      <ManualInstallModal
        open={manualOpen}
        guide={manualGuide}
        files={manualFiles}
        loading={manualLoading}
        fileLoading={manualFileLoading}
        importingFileName={manualImportingFileName}
        onClose={() => setManualOpen(false)}
        onOpenDownloadDir={handleOpenManualDownloadDir}
        onRefreshFiles={() => void refreshManualFiles()}
        onImportFile={(fileName) => void handleImportManualFile(fileName)}
        onImportDirectory={() => {
          setManualOpen(false)
          void handleImportLocal('directory')
        }}
      />

      <DownloadDirectoryInstallModal
        open={downloadDirOpen}
        files={manualFiles}
        fileLoading={manualFileLoading}
        importingFileName={manualImportingFileName}
        onClose={() => setDownloadDirOpen(false)}
        onOpenDownloadDir={handleOpenManualDownloadDir}
        onRefreshFiles={() => void refreshManualFiles()}
        onImportFile={(fileName) => void handleImportManualFile(fileName)}
      />

      <AssetScopeTabs />
      <Modal open={installOpen} onClose={() => setInstallOpen(false)} title={tr("extensions.install")} width="840px">
      <ExtensionInstallCard
        query={query}
        lookup={lookup}
        querying={querying}
        installing={installing}
        useProxy={useProxy}
        selectedProxy={selectedProxy}
        installedIds={installedIds}
        lastLookupProxyLabel={lastLookupProxyLabel}
        onQueryChange={setQuery}
        onLookup={() => void handleLookup()}
        onOpenWebStoreQuery={handleOpenWebStoreQuery}
        onOpenManualInstall={handleOpenManualInstall}
        onOpenProxy={() => setProxyModalOpen(true)}
        onInstall={() => void handleInstall()}
      />
      </Modal>

      <InstalledExtensionsList
        items={items}
        busyId={busyId}
        busyAction={busyAction}
        updatingId={updatingId}
        onRestrictProfiles={setLimitExtension}
        onUpdate={(target) => void handleUpdateExtension(target)}
        onToggle={(target) => void handleToggle(target)}
        onDelete={(target) => void handleDelete(target)}
      />
    </div>

  )
}

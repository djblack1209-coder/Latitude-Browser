import { tr, useLocale } from '../../../shared/i18n'
import { useEffect, useMemo, useState } from 'react'
import { Button, toast } from '../../../shared/components'
import type { TableColumn } from '../../../shared/components/Table'
import type { BrowserProxy } from '../types'
import { fetchClashImportFromURL, saveBrowserProxies } from '../api'
import { DIRECT_QUICK_IMPORT_TEMPLATE, buildDirectImportCandidatesFromText, parseDirectImportText } from '../pages/proxyPool/helpers'
import {
  INITIAL_CHAIN_IMPORT_FORM,
  INITIAL_DIRECT_IMPORT_FORM,
  type ChainHopForm,
  type ChainImportForm,
  type DirectImportForm,
  type ProxyDisplayInfo,
  type ProxyImportModalProps,
  type ProxyImportMode,
} from './ProxyImportModal.types'
import {
  buildChainImportCandidate,
  buildDirectImportCandidate,
  buildImportCandidatesFromClash,
  buildImportPreview,
  createExistingProxyPicker,
  parseClashImportText,
  nextProxyID,
  normalizeRefreshIntervalM,
  resolveImportSourceID,
} from './ProxyImportModal.helpers'
import { ProxyImportModalView } from './ProxyImportModalView'

export function ProxyImportModal({
  open,
  onClose,
  existingProxies,
  groups,
  globalAutoRefreshEnabled = false,
  globalRefreshIntervalM = 60,
  onImported,
}: ProxyImportModalProps) {
  const uiLocale = useLocale()

  const [importMode, setImportMode] = useState<ProxyImportMode>('clash')
  const [importUrl, setImportUrl] = useState('')
  const [importFetchProxyId, setImportFetchProxyId] = useState('')
  const [importResolvedUrl, setImportResolvedUrl] = useState('')
  const [importText, setImportText] = useState('')
  const [importDnsServers, setImportDnsServers] = useState('')
  const [importNamePrefix, setImportNamePrefix] = useState('')
  const [importGroupName, setImportGroupName] = useState('')
  const [directImportText, setDirectImportText] = useState('')
  const [directImportForm, setDirectImportForm] = useState<DirectImportForm>(() => ({ ...INITIAL_DIRECT_IMPORT_FORM }))
  const [chainImportForm, setChainImportForm] = useState<ChainImportForm>(() => ({ ...INITIAL_CHAIN_IMPORT_FORM }))
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [previewList, setPreviewList] = useState<ProxyDisplayInfo[]>([])
  const [importing, setImporting] = useState(false)
  const [fetchingImportUrl, setFetchingImportUrl] = useState(false)

  useEffect(() => {
    if (open) return
    setPreviewModalOpen(false)
  }, [open])

  const resetImportState = () => {
    setImportMode('clash')
    setImportUrl('')
    setImportFetchProxyId('')
    setImportResolvedUrl('')
    setImportText('')
    setImportDnsServers('')
    setImportNamePrefix('')
    setImportGroupName('')
    setDirectImportText('')
    setDirectImportForm({ ...INITIAL_DIRECT_IMPORT_FORM })
    setChainImportForm({ ...INITIAL_CHAIN_IMPORT_FORM })
    setPreviewList([])
  }

  const handleImportModeChange = (nextMode: ProxyImportMode) => {
    setImportMode(nextMode)
    setImportResolvedUrl('')
    if (nextMode !== 'clash') {
      setImportUrl('')
      setImportFetchProxyId('')
      setImportDnsServers('')
    }
  }

  const updateChainHop = (hop: 'first' | 'second', field: keyof ChainHopForm, value: string) => {
    setChainImportForm(prev => ({
      ...prev,
      [hop]: {
        ...prev[hop],
        [field]: value,
      },
    }))
  }

  const handleFetchImportURL = async () => {
    const targetURL = importUrl.trim()
    if (!targetURL) {
      toast.error(tr("browser.components.ProxyImportModal.ProxyImportModal.d82fc08"))
      return
    }

    setFetchingImportUrl(true)
    try {
      const result = await fetchClashImportFromURL(targetURL, importFetchProxyId)
      const content = (result?.content || '').trim()
      if (!content) {
        throw new Error(tr("browser.components.ProxyImportModal.ProxyImportModal.f9bf09d"))
      }

      setImportResolvedUrl((result?.url || targetURL).trim())
      setImportText(content)

      if (!importDnsServers.trim() && typeof result?.dnsServers === 'string' && result.dnsServers.trim()) {
        setImportDnsServers(result.dnsServers.trim())
      }
      if (!importGroupName.trim() && typeof result?.suggestedGroup === 'string' && result.suggestedGroup.trim()) {
        setImportGroupName(result.suggestedGroup.trim())
      }

      toast.success(tr("browser.components.ProxyImportModal.ProxyImportModal.72bfa26", [Math.max(0, Number(result?.proxyCount || 0))]))
    } catch (error: any) {
      setImportResolvedUrl('')
      toast.error(error?.message || tr("browser.components.ProxyImportModal.ProxyImportModal.55d56eb"))
    } finally {
      setFetchingImportUrl(false)
    }
  }

  const handleParseImport = () => {
    try {
      const prefix = importNamePrefix.trim()
      let candidates
      let previewGroupName = importGroupName.trim()
      if (importMode === 'clash') {
        candidates = buildImportCandidatesFromClash(parseClashImportText(importText), prefix)
      } else if (importMode === 'direct') {
        if (directImportText.trim()) {
          const parsed = buildDirectImportCandidatesFromText(directImportText)
          candidates = parsed.candidates
          if (!previewGroupName) {
            previewGroupName = parsed.defaultGroupName
          }
        } else {
          candidates = [buildDirectImportCandidate(directImportForm)]
        }
      } else {
        candidates = [buildChainImportCandidate(chainImportForm)]
      }
      if (!candidates.length) {
        toast.error(tr("browser.components.ProxyImportModal.ProxyImportModal.29a6e8f"))
        return
      }
      const preview = buildImportPreview(candidates, previewGroupName)
      setPreviewList(preview)
      setPreviewModalOpen(true)
    } catch (error: any) {
      toast.error(tr("browser.components.ProxyImportModal.ProxyImportModal.a02c61c", [error?.message || tr("browser.components.ProxyImportModal.ProxyImportModal.5f76edc")]))
    }
  }

  const handleFillDirectTemplate = () => {
    setDirectImportText(DIRECT_QUICK_IMPORT_TEMPLATE)
  }

  const handleCopyDirectTemplate = async () => {
    try {
      if (!navigator?.clipboard?.writeText) {
        throw new Error(tr("browser.components.ProxyImportModal.ProxyImportModal.2712dc6"))
      }
      await navigator.clipboard.writeText(DIRECT_QUICK_IMPORT_TEMPLATE)
      toast.success(tr("browser.components.ProxyImportModal.ProxyImportModal.e738c80"))
    } catch (error: any) {
      toast.error(error?.message || tr("browser.components.ProxyImportModal.ProxyImportModal.8403a27"))
    }
  }

  const handleApplyDirectText = () => {
    try {
      const { form, groupName } = parseDirectImportText(directImportText)
      setDirectImportForm(form)
      if (groupName) {
        setImportGroupName(groupName)
      }
      setDirectImportText('')
      toast.success(tr("browser.components.ProxyImportModal.ProxyImportModal.fbeaa69"))
    } catch (error: any) {
      toast.error(error?.message || tr("browser.components.ProxyImportModal.ProxyImportModal.65190b0"))
    }
  }

  const handleConfirmImport = async () => {
    if (previewList.length === 0) {
      toast.error(tr("browser.components.ProxyImportModal.ProxyImportModal.376ad66"))
      return
    }
    setImporting(true)
    try {
      const sourceURL = importMode === 'clash' ? importResolvedUrl.trim() : ''
      const isURLImport = !!sourceURL
      const sourceNamePrefix = importMode === 'clash' ? importNamePrefix.trim() : ''
      const sourceID = isURLImport ? resolveImportSourceID(existingProxies, sourceURL, sourceNamePrefix) : ''
      const sourceAutoRefresh = isURLImport ? !!globalAutoRefreshEnabled : false
      const sourceRefreshIntervalM = sourceAutoRefresh
        ? normalizeRefreshIntervalM(Number(globalRefreshIntervalM || 0))
        : 0
      const sourceLastRefreshAt = isURLImport ? new Date().toISOString() : ''
      const oldSourceProxies = isURLImport
        ? existingProxies.filter(item => (item.sourceId || '').trim() === sourceID)
        : []
      const pickExisting = createExistingProxyPicker(oldSourceProxies)

      const newProxies: BrowserProxy[] = previewList.map((p) => {
        const existingProxy = pickExisting(p.proxyName, p.proxyConfig)
        return {
        proxyId: existingProxy?.proxyId || nextProxyID(),
        proxyName: p.proxyName,
        proxyConfig: p.proxyConfig,
        preferredKernel: existingProxy?.preferredKernel || undefined,
        dnsServers: importMode === 'clash' ? importDnsServers.trim() || undefined : undefined,
        groupName: p.groupName.trim() || undefined,
        sourceId: sourceID || undefined,
        sourceUrl: sourceURL || undefined,
        sourceNamePrefix: sourceNamePrefix || undefined,
        sourceAutoRefresh,
        sourceRefreshIntervalM,
        sourceLastRefreshAt: sourceLastRefreshAt || undefined,
        }
      })
      const allProxies = isURLImport
        ? existingProxies.filter(item => (item.sourceId || '').trim() !== sourceID).concat(newProxies)
        : [...existingProxies, ...newProxies]

      await saveBrowserProxies(allProxies)
      await onImported?.(newProxies)
      toast.success(tr("browser.components.ProxyImportModal.ProxyImportModal.cf0eb8b", [newProxies.length]))
      setPreviewModalOpen(false)
      resetImportState()
      onClose()
    } catch (error: any) {
      toast.error(error?.message || tr("browser.components.ProxyImportModal.ProxyImportModal.a01a8d5"))
    } finally {
      setImporting(false)
    }
  }

  const handleRemovePreviewProxy = (proxyId: string) => {
    setPreviewList(prev => prev.filter(item => item.proxyId !== proxyId))
  }

  const canParseImport = importMode === 'clash'
    ? !!importText.trim()
    : importMode === 'direct'
      ? !!directImportText.trim() || (!!directImportForm.server.trim() && !!directImportForm.port.trim())
      : !!chainImportForm.first.server.trim()
        && !!chainImportForm.first.port.trim()
        && !!chainImportForm.second.server.trim()
        && !!chainImportForm.second.port.trim()

  const previewColumns = useMemo<TableColumn<ProxyDisplayInfo>[]>(() => [
    { key: 'proxyName', title: tr("browser.components.ProxyImportModal.title.c617e8e"), width: '200px' },
    { key: 'type', title: tr("browser.components.AutomationScriptHistoryModal.text.e4e46c7"), width: '100px' },
    { key: 'server', title: tr("browser.components.ProxyImportModal.title.30d94cb"), width: '200px' },
    { key: 'port', title: tr("browser.components.ProxyImportModal.title.6cbb733"), width: '100px', render: (val) => val || '-' },
    {
      key: 'actions',
      title: tr("browser.components.AutomationScriptHistoryModal.text.f3ea6d3"),
      width: '96px',
      render: (_, record) => (
        <Button
          size="sm"
          variant="danger"
          onClick={() => handleRemovePreviewProxy(record.proxyId)}
        >{tr("browser.components.BrowserListLayout.title.3755f56")}</Button>
      ),
    },
  ], [uiLocale])

  return (
    <ProxyImportModalView
      open={open}
      onClose={onClose}
      fetchingImportUrl={fetchingImportUrl}
      canParseImport={canParseImport}
      importMode={importMode}
      importUrl={importUrl}
      importFetchProxyId={importFetchProxyId}
      importResolvedUrl={importResolvedUrl}
      importText={importText}
      importDnsServers={importDnsServers}
      importNamePrefix={importNamePrefix}
      importGroupName={importGroupName}
      directImportText={directImportText}
      directImportForm={directImportForm}
      chainImportForm={chainImportForm}
      groups={groups}
      fetchProxyOptions={existingProxies.filter(proxy => proxy.proxyConfig.trim() && !proxy.proxyConfig.trim().toLowerCase().startsWith('direct://'))}
      previewModalOpen={previewModalOpen}
      previewList={previewList}
      importing={importing}
      previewColumns={previewColumns}
      onParseImport={handleParseImport}
      onImportModeChange={handleImportModeChange}
      onImportUrlChange={setImportUrl}
      onImportFetchProxyIdChange={setImportFetchProxyId}
      onImportResolvedUrlChange={setImportResolvedUrl}
      onFetchImportURL={handleFetchImportURL}
      onImportTextChange={setImportText}
      onImportDnsServersChange={setImportDnsServers}
      onImportNamePrefixChange={setImportNamePrefix}
      onImportGroupNameChange={setImportGroupName}
      onDirectImportTextChange={setDirectImportText}
      onDirectImportFormChange={setDirectImportForm}
      onChainImportFormChange={setChainImportForm}
      onUpdateChainHop={updateChainHop}
      onFillDirectTemplate={handleFillDirectTemplate}
      onCopyDirectTemplate={handleCopyDirectTemplate}
      onApplyDirectText={handleApplyDirectText}
      onPreviewModalOpenChange={setPreviewModalOpen}
      onConfirmImport={handleConfirmImport}
    />
  )
}

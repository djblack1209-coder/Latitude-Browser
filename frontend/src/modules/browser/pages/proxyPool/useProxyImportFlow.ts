import { tr } from '../../../../shared/i18n'
import { useState } from 'react'
import { toast } from '../../../../shared/components'
import type { BrowserProxy } from '../../types'
import { fetchClashImportFromURL } from '../../api'
import {
  CHAIN_QUICK_IMPORT_TEMPLATE,
  DIRECT_QUICK_IMPORT_TEMPLATE,
  INITIAL_CHAIN_IMPORT_FORM,
  INITIAL_DIRECT_IMPORT_FORM,
  buildChainImportCandidate,
  buildDirectImportCandidate,
  buildDirectImportCandidatesFromText,
  buildImportCandidatesFromClash,
  buildImportPreview,
  createExistingProxyPicker,
  nextProxyID,
  parseChainImportJSON,
  parseClashImportText,
  parseDirectImportText,
  resolveImportSourceID,
  type ChainImportForm,
  type DirectImportForm,
  type ProxyDisplayInfo,
  type ProxyImportMode,
} from './helpers'
import { appendSourceIgnoredProxyNames } from './storage'

interface UseProxyImportFlowOptions {
  proxies: BrowserProxy[]
  globalAutoRefreshEnabled: boolean
  globalRefreshInterval: number
  saveProxies: (list: BrowserProxy[]) => Promise<void>
}

function createInitialChainImportForm(): ChainImportForm {
  return {
    ...INITIAL_CHAIN_IMPORT_FORM,
    first: { ...INITIAL_CHAIN_IMPORT_FORM.first },
    second: { ...INITIAL_CHAIN_IMPORT_FORM.second },
  }
}

export function useProxyImportFlow({
  proxies,
  globalAutoRefreshEnabled,
  globalRefreshInterval,
  saveProxies,
}: UseProxyImportFlowOptions) {
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importMode, setImportMode] = useState<ProxyImportMode>('clash')
  const [importUrl, setImportUrl] = useState('')
  const [importFetchProxyId, setImportFetchProxyId] = useState('')
  const [importResolvedUrl, setImportResolvedUrl] = useState('')
  const [importText, setImportText] = useState('')
  const [importDnsServers, setImportDnsServers] = useState('')
  const [importNamePrefix, setImportNamePrefix] = useState('')
  const [importGroupName, setImportGroupName] = useState('')
  const [chainImportText, setChainImportText] = useState('')
  const [directImportText, setDirectImportText] = useState('')
  const [chainImportForm, setChainImportForm] = useState<ChainImportForm>(() => createInitialChainImportForm())
  const [directImportForm, setDirectImportForm] = useState<DirectImportForm>(() => ({ ...INITIAL_DIRECT_IMPORT_FORM }))
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [previewList, setPreviewList] = useState<ProxyDisplayInfo[]>([])
  const [removedPreviewProxyNames, setRemovedPreviewProxyNames] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [fetchingImportUrl, setFetchingImportUrl] = useState(false)

  const handleRemovePreviewProxy = (proxyId: string) => {
    const target = previewList.find(item => item.proxyId === proxyId)
    if (target) {
      setRemovedPreviewProxyNames(prev => prev.includes(target.proxyName) ? prev : [...prev, target.proxyName])
    }
    setPreviewList(prev => prev.filter(item => item.proxyId !== proxyId))
  }

  const updateChainImportHop = (hop: 'first' | 'second', field: keyof ChainImportForm['first'], value: string) => {
    setChainImportForm(prev => ({
      ...prev,
      [hop]: {
        ...prev[hop],
        [field]: value,
      },
    }))
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

  const handleFillChainTemplate = () => {
    setChainImportText(CHAIN_QUICK_IMPORT_TEMPLATE)
  }

  const handleFillDirectTemplate = () => {
    setDirectImportText(DIRECT_QUICK_IMPORT_TEMPLATE)
  }

  const handleCopyChainTemplate = async () => {
    try {
      if (!navigator?.clipboard?.writeText) throw new Error(tr("browser.components.ProxyImportModal.ProxyImportModal.2712dc6"))
      await navigator.clipboard.writeText(CHAIN_QUICK_IMPORT_TEMPLATE)
      toast.success(tr("browser.components.ProxyImportModal.ProxyImportModal.e738c80"))
    } catch (error: any) {
      toast.error(error?.message || tr("browser.components.ProxyImportModal.ProxyImportModal.8403a27"))
    }
  }

  const handleCopyDirectTemplate = async () => {
    try {
      if (!navigator?.clipboard?.writeText) throw new Error(tr("browser.components.ProxyImportModal.ProxyImportModal.2712dc6"))
      await navigator.clipboard.writeText(DIRECT_QUICK_IMPORT_TEMPLATE)
      toast.success(tr("browser.components.ProxyImportModal.ProxyImportModal.e738c80"))
    } catch (error: any) {
      toast.error(error?.message || tr("browser.components.ProxyImportModal.ProxyImportModal.8403a27"))
    }
  }

  const handleApplyChainJSON = () => {
    try {
      const { form, groupName } = parseChainImportJSON(chainImportText)
      setChainImportForm(form)
      setImportGroupName(groupName)
      toast.success(tr("browser.pages.proxyPool.useProxyImportFlow.useProxyImportFlow.0ccf2b3"))
    } catch (error: any) {
      toast.error(error?.message || tr("browser.pages.proxyPool.useProxyImportFlow.useProxyImportFlow.f26b8d8"))
    }
  }

  const handleApplyDirectText = () => {
    try {
      const { form, groupName } = parseDirectImportText(directImportText)
      setDirectImportForm(form)
      if (groupName) setImportGroupName(groupName)
      setDirectImportText('')
      toast.success(tr("browser.components.ProxyImportModal.ProxyImportModal.fbeaa69"))
    } catch (error: any) {
      toast.error(error?.message || tr("browser.components.ProxyImportModal.ProxyImportModal.65190b0"))
    }
  }

  const handleImportUrlChange = (nextValue: string) => {
    setImportUrl(nextValue)
    if (importResolvedUrl.trim() && nextValue.trim() !== importResolvedUrl.trim()) {
      setImportResolvedUrl('')
    }
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
      if (!content) throw new Error(tr("browser.components.ProxyImportModal.ProxyImportModal.f9bf09d"))

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
          if (!previewGroupName) previewGroupName = parsed.defaultGroupName
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
      setRemovedPreviewProxyNames([])
      setPreviewList(preview)
      setImportModalOpen(false)
      setPreviewModalOpen(true)
    } catch (error: any) {
      toast.error(tr("browser.components.ProxyImportModal.ProxyImportModal.a02c61c", [error?.message || tr("browser.components.ProxyImportModal.ProxyImportModal.5f76edc")]))
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
      const sourceID = isURLImport ? resolveImportSourceID(proxies, sourceURL, sourceNamePrefix) : ''
      const sourceAutoRefresh = isURLImport ? globalAutoRefreshEnabled : false
      const sourceRefreshIntervalM = sourceAutoRefresh ? globalRefreshInterval : 0
      const sourceLastRefreshAt = isURLImport ? new Date().toISOString() : ''
      const oldSourceProxies = isURLImport
        ? proxies.filter(item => (item.sourceId || '').trim() === sourceID)
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
        ? proxies.filter(item => (item.sourceId || '').trim() !== sourceID).concat(newProxies)
        : [...proxies, ...newProxies]
      await saveProxies(allProxies)
      if (isURLImport && removedPreviewProxyNames.length > 0) {
        appendSourceIgnoredProxyNames(sourceID, removedPreviewProxyNames)
      }
      setPreviewModalOpen(false)
      setImportUrl('')
      setImportFetchProxyId('')
      setImportResolvedUrl('')
      setImportText('')
      setImportDnsServers('')
      setImportNamePrefix('')
      setImportGroupName('')
      setChainImportText('')
      setDirectImportText('')
      setChainImportForm(createInitialChainImportForm())
      setDirectImportForm({ ...INITIAL_DIRECT_IMPORT_FORM })
      setPreviewList([])
      setRemovedPreviewProxyNames([])
      toast.success(tr("browser.components.ProxyImportModal.ProxyImportModal.cf0eb8b", [newProxies.length]))
    } catch (error: any) {
      toast.error(error?.message || tr("browser.components.ProxyImportModal.ProxyImportModal.a01a8d5"))
    } finally {
      setImporting(false)
    }
  }

  const canParseImport = importMode === 'clash'
    ? !!importText.trim()
    : importMode === 'direct'
      ? !!directImportText.trim() || (!!directImportForm.server.trim() && !!directImportForm.port.trim())
      : !!chainImportForm.first.server.trim()
        && !!chainImportForm.first.port.trim()
        && !!chainImportForm.second.server.trim()
        && !!chainImportForm.second.port.trim()

  return {
    importModalOpen, setImportModalOpen, importMode, importUrl, importFetchProxyId, importResolvedUrl, importText,
    importDnsServers, importNamePrefix, importGroupName, chainImportText, directImportText,
    chainImportForm, directImportForm, previewModalOpen, setPreviewModalOpen, previewList, removedPreviewProxyNames,
    importing, fetchingImportUrl, canParseImport, setImportText, setImportDnsServers,
    setImportNamePrefix, setImportGroupName, setImportFetchProxyId, setChainImportText, setDirectImportText,
    setChainImportForm, setDirectImportForm, handleRemovePreviewProxy, updateChainImportHop,
    handleImportModeChange, handleFillChainTemplate, handleFillDirectTemplate, handleCopyChainTemplate,
    handleCopyDirectTemplate, handleApplyChainJSON, handleApplyDirectText, handleImportUrlChange,
    handleFetchImportURL, handleParseImport, handleConfirmImport,
  }
}

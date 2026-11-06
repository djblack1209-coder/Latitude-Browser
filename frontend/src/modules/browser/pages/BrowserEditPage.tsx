import { translateMessage } from '../../../shared/i18n'
import { tr, useLocale, localized } from '../../../shared/i18n'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronDown, ChevronUp, FolderOpen, HelpCircle, Layers, Network, RadioTower, ShieldCheck } from 'lucide-react'
import { Button, Card, ConfirmModal, FormItem, Input, Modal, Select, Textarea, toast } from '../../../shared/components'
import { WorkspaceHeader } from '../../../shared/components/SignalPrimitives'
import type { BrowserCore, BrowserFingerprintCapabilityReport, BrowserFingerprintCapabilityRow, BrowserFingerprintCheckResult, BrowserProfileInput, BrowserProxy, BrowserGroup, ProxyLocationResolveResult } from '../types'
import { browserProxyResolveLocation, checkBrowserProfileFingerprint, createBrowserProfile, fetchAllTags, fetchBrowserCores, fetchBrowserProfileFingerprintMatrix, fetchBrowserProfiles, fetchBrowserProxies, fetchBrowserSettings, fetchGroups, openBrowserFingerprintCheck, openUserDataDir, updateBrowserProfile, validateProxyConfig } from '../api'
import { FingerprintPanel } from '../components/FingerprintPanel'
import { applyLocaleToFingerprintArgs, validateFingerprintArgs, withAdaptiveDefaultWindowSize } from '../utils/fingerprintSerializer'
import { TagInput } from '../components/TagInput'
import { GroupSelector } from '../components/GroupSelector'
import { ProxyPickerModal } from '../components/ProxyPickerModal'
import { TorModeNotice } from './TorModeNotice'
import { fetchBrowserPlatformCapabilities, type BrowserPlatformCapabilities } from '../api/platform'

const fallbackLowLaunchArgs = ['--disable-sync', '--no-first-run']
const directProxyID = '__direct__'
const RESTORE_LAST_SESSION_OPTIONS = localized(() => ([
  { value: '', label: tr("browser.pages.BrowserEditPage.label.783deb6") },
  { value: 'enabled', label: tr("browser.pages.BrowserEditPage.label.8cf2e69") },
  { value: 'disabled', label: tr("browser.pages.BrowserEditPage.label.c58f7b0") },
]))
type ProxySourceMode = 'pool' | 'local'
type BrowserNetworkMode = NonNullable<BrowserProfileInput['networkMode']>
type BrowserProfileEditForm = BrowserProfileInput & { networkMode: BrowserNetworkMode; lastLaunchArgs?: string[] }

function normalizeLaunchArgs(args: string[]): string[] {
  return (args || []).map(item => item.trim()).filter(Boolean)
}

function resolveDefaultLaunchArgs(args: string[]): string[] {
  const normalized = normalizeLaunchArgs(args)
  return normalized.length > 0 ? normalized : fallbackLowLaunchArgs
}

function joinValues(values?: string[]): string {
  return values?.length ? values.join(', ') : '-'
}

function displayValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '-'
  if (Array.isArray(value)) return joinValues(value)
  return String(value)
}

type FingerprintMatchMode = 'exact' | 'contains' | 'platform' | 'browser-version' | 'platform-version' | 'display'
type FingerprintMatchStatus = 'match' | 'version_compatible' | 'mismatch' | 'not_configured' | 'observe'

function normalizeFingerprintPlatformForMatch(value: unknown): string {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return ''
  if (['windows', 'win', 'win32', 'win64', 'wince'].includes(normalized)) return 'windows'
  if (normalized.startsWith('linux') || normalized === 'x11') return 'linux'
  if (normalized === 'mac' || normalized === 'macos' || normalized.includes('mac')) return 'macos'
  return normalized
}

function versionParts(value: unknown): number[] {
  const match = String(value ?? '').replace(/_/g, '.').match(/\d+(?:\.\d+)*/)
  return match ? match[0].split('.').map(item => Number.parseInt(item, 10)).filter(Number.isFinite) : []
}

function versionList(value: unknown, patterns: RegExp[]): number[][] {
  const text = String(value ?? '').replace(/_/g, '.')
  return patterns.flatMap(pattern => Array.from(text.matchAll(pattern), match => versionParts(match[1])).filter(parts => parts.length > 0))
}

function sameVersionPrefix(left: number[], right: number[]): boolean {
  if (!left.length || !right.length) return false
  const size = Math.min(left.length, right.length)
  return left.slice(0, size).every((part, index) => part === right[index])
}

function matchBrowserVersionStatus(expected: unknown, actual: unknown): FingerprintMatchStatus {
  if (String(actual ?? '').includes(String(expected))) return 'match'
  const expectedParts = versionParts(expected)
  if (!expectedParts.length) return 'mismatch'
  const versions = versionList(actual, [/(?:Chrome|Chromium|Edg|OPR|Vivaldi)\/([0-9]+(?:[._][0-9]+)*)/g, /"version"\s*:\s*"([0-9]+(?:[._][0-9]+)*)"/g])
  return versions.some(actualParts => actualParts[0] === expectedParts[0]) ? 'version_compatible' : 'mismatch'
}

function matchPlatformVersionStatus(expected: unknown, actual: unknown): FingerprintMatchStatus {
  if (String(actual ?? '').includes(String(expected))) return 'match'
  const expectedParts = versionParts(expected)
  if (!expectedParts.length) return 'mismatch'
  const versions = versionList(actual, [/Windows NT\s+([0-9]+(?:[._][0-9]+)*)/g, /Mac OS X\s+([0-9]+(?:[._][0-9]+)*)/g, /Android\s+([0-9]+(?:[._][0-9]+)*)/g, /(?:CPU (?:iPhone )?OS|iPhone OS)\s+([0-9]+(?:[._][0-9]+)*)/g, /"platformVersion"\s*:\s*"([0-9]+(?:[._][0-9]+)*)"/g])
  return versions.some(actualParts => sameVersionPrefix(expectedParts, actualParts)) ? 'version_compatible' : 'mismatch'
}

function matchStatus(expected: unknown, actual: unknown, mode: FingerprintMatchMode = 'exact'): FingerprintMatchStatus {
  if (mode === 'display') return 'observe'
  if (expected === undefined || expected === null || expected === '') return 'not_configured'
  if (mode === 'platform') {
    const expectedPlatform = normalizeFingerprintPlatformForMatch(expected)
    const actualPlatform = normalizeFingerprintPlatformForMatch(actual)
    return expectedPlatform && expectedPlatform === actualPlatform ? 'match' : 'mismatch'
  }
  if (mode === 'browser-version') return matchBrowserVersionStatus(expected, actual)
  if (mode === 'platform-version') return matchPlatformVersionStatus(expected, actual)
  if (Array.isArray(actual)) {
    const expectedItems = String(expected).split(',').map(item => item.trim()).filter(Boolean)
    const actualItems = actual.map(item => String(item).trim()).filter(Boolean)
    return expectedItems.length > 0 && expectedItems.every((item, index) => actualItems[index] === item) ? 'match' : 'mismatch'
  }
  if (mode === 'contains') return String(actual).includes(String(expected)) ? 'match' : 'mismatch'
  return String(expected) === String(actual) ? 'match' : 'mismatch'
}

function FingerprintCheckRow({ label, expected, actual, mode }: { label: string; expected?: unknown; actual: unknown; mode?: FingerprintMatchMode }) {
  useLocale()

  const status = matchStatus(expected, actual, mode)
  const statusText = status === 'match' ? tr("browser.pages.BrowserEditPage.FingerprintCheckRow.5ab754e") : status === 'version_compatible' ? tr("browser.pages.BrowserEditPage.FingerprintCheckRow.cafdc76") : status === 'mismatch' ? tr("browser.pages.BrowserEditPage.FingerprintCheckRow.ea88dc5") : status === 'not_configured' ? tr("browser.pages.BrowserEditPage.FingerprintCheckRow.afab75a") : tr("browser.pages.BrowserEditPage.FingerprintCheckRow.362f77b")
  const statusClass = status === 'match' || status === 'version_compatible'
    ? 'bg-[var(--color-success)]/10 text-[var(--color-success)] border-[var(--color-success)]/30'
    : status === 'mismatch'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-slate-50 text-slate-600 border-slate-200'
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)_70px] gap-3 items-start py-2 border-b border-[var(--color-border)] last:border-b-0 text-sm">
      <div className="text-[var(--color-text-muted)]">{label}</div>
      <div className="font-mono text-xs break-all text-[var(--color-text-secondary)]">{displayValue(expected)}</div>
      <div className="font-mono text-xs break-all text-[var(--color-text-primary)]">{displayValue(actual)}</div>
      <div><span className={`inline-flex px-2 py-0.5 rounded border text-xs ${statusClass}`}>{statusText}</span></div>
    </div>
  )
}

function FingerprintDisplayRow({ label, actual }: { label: string; actual: unknown }) {
  useLocale()

  return <FingerprintCheckRow label={label} actual={actual} mode="display" />
}


const matrixStatusLabels: Record<string, string> = localized(() => ({
  kept: tr("browser.api.profiles.action.d046ac7"),
  injected: tr("browser.pages.BrowserEditPage.injected.c7fc56b"),
  inferred: tr("browser.pages.BrowserEditPage.injected.c7fc56b"),
  converted: tr("browser.pages.BrowserEditPage.converted.8b7977d"),
  removed: tr("browser.pages.BrowserEditPage.removed.907c394"),
  disabled: tr("ui.components.Modal.aria_label.6c14bd7"),
  overridden: tr("browser.pages.BrowserEditPage.overridden.8c3a268"),
  not_effective: tr("browser.pages.BrowserEditPage.not_effective.01516e9"),
  pending: tr("browser.pages.BrowserEditPage.pending.57a71e9"),
  kept_legacy: tr("browser.pages.BrowserEditPage.kept_legacy.02caa5c"),
  kept_unconfirmed: tr("browser.pages.BrowserEditPage.kept_unconfirmed.115395e"),
  kept_unknown: tr("browser.pages.BrowserEditPage.kept_unknown.419ee42"),
}))

function matrixStatusClass(status: string): string {
  if (status === 'removed' || status === 'not_effective') return 'bg-red-50 text-red-700 border-red-200'
  if (status === 'disabled') return 'bg-slate-50 text-slate-600 border-slate-200'
  if (status === 'overridden') return 'bg-slate-50 text-slate-600 border-slate-200'
  if (status === 'converted' || status === 'injected' || status === 'inferred') return 'bg-[var(--color-accent-muted)] text-[var(--color-accent)] border-[var(--color-accent-border)]'
  if (status === 'kept_unconfirmed' || status === 'kept_unknown' || status === 'pending') return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-[var(--color-success)]/10 text-[var(--color-success)] border-[var(--color-success)]/30'
}

function FingerprintMatrixRow({ row }: { row: BrowserFingerprintCapabilityRow }) {
  useLocale()

  return (
    <div className="grid grid-cols-1 md:grid-cols-[120px_88px_minmax(0,1fr)] gap-2 px-3 py-2 border-b border-[var(--color-border)] last:border-b-0 text-sm">
      <div className="font-medium text-[var(--color-text-primary)]">{row.capability}</div>
      <div>
        <span className={`inline-flex px-2 py-0.5 rounded border text-xs ${matrixStatusClass(row.status)}`}>
          {matrixStatusLabels[row.status] || row.status}
        </span>
      </div>
      <div className="min-w-0 space-y-1">
        <div className="text-xs text-[var(--color-text-secondary)]">{row.action || '-'}</div>
        {(row.inputArg || row.runtimeArg) && (
          <div className="font-mono text-xs break-all text-[var(--color-text-muted)]">
            {row.inputArg && <span>{tr("browser.pages.BrowserEditPage.text.8cfa741")}{row.inputArg}</span>}
            {row.inputArg && row.runtimeArg && row.inputArg !== row.runtimeArg && <span className="mx-1">→</span>}
            {row.runtimeArg && row.inputArg !== row.runtimeArg && <span>{tr("browser.pages.BrowserEditPage.text.c070e2e")}{row.runtimeArg}</span>}
          </div>
        )}
        {row.note && <div className="text-xs text-[var(--color-text-muted)]">{row.note}</div>}
      </div>
    </div>
  )
}

function FingerprintMatrixReport({ report }: { report: BrowserFingerprintCapabilityReport | null }) {
  useLocale()

  if (!report) {
    return (
      <div className="mt-4 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-muted)]">{tr("browser.pages.BrowserEditPage.text.23f30c4")}</div>
    )
  }
  const versionText = report.chromeVersion ? `Chrome ${report.chromeVersion}` : tr("browser.pages.BrowserEditPage.FingerprintMatrixReport.f0a805d")
  const rows = report.rows || []
  return (
    <div className="mt-4 rounded-lg border border-[var(--color-border)] overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1 px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-bg-hover)]">
        <div className="text-sm font-medium text-[var(--color-text-primary)]">{tr("browser.pages.BrowserEditPage.text.626994d")}</div>
        <div className="text-xs text-[var(--color-text-muted)]">
          {versionText}{tr("browser.pages.BrowserEditPage.text.f779c1e")}{report.rawArgs?.length || 0}{tr("browser.pages.BrowserEditPage.text.44367fd")}{report.launchArgs?.length || 0}{tr("browser.components.BrowserProfileCopyForm.text.12de8e1")}</div>
      </div>
      {report.warnings?.length > 0 && (
        <div className="px-3 py-2 border-b border-[var(--color-border)] bg-amber-50 text-xs text-amber-700 space-y-1">
          {report.warnings.map((warning, index) => <div key={`${warning}-${index}`}>{warning}</div>)}
        </div>
      )}
      {rows.length > 0 ? (
        <div>
          {rows.map((row, index) => <FingerprintMatrixRow key={`${row.capability}-${row.inputArg}-${index}`} row={row} />)}
        </div>
      ) : (
        <div className="px-3 py-2 text-sm text-[var(--color-text-muted)]">{tr("browser.pages.BrowserEditPage.text.5020125")}</div>
      )}
    </div>
  )
}

function resolvePoolProxySelection(
  proxyId: string,
  proxyConfig: string,
  proxies: BrowserProxy[],
): { mode: ProxySourceMode; proxyId: string; proxyConfig: string } {
  const normalizedProxyId = proxyId.trim()
  if (normalizedProxyId) {
    const matchedByID = proxies.find((proxy) => proxy.proxyId.trim() === normalizedProxyId)
    if (matchedByID?.proxyId) {
      return { mode: 'pool', proxyId: matchedByID.proxyId, proxyConfig: '' }
    }
  }

  const rawProxyConfig = proxyConfig.trim()
  const normalizedConfig = rawProxyConfig.toLowerCase()
  if (normalizedConfig) {
    const matchedByConfig = proxies.find((proxy) => (proxy.proxyConfig || '').trim().toLowerCase() === normalizedConfig)
    if (matchedByConfig?.proxyId) {
      return { mode: 'pool', proxyId: matchedByConfig.proxyId, proxyConfig: '' }
    }
    return { mode: 'local', proxyId: '', proxyConfig: rawProxyConfig }
  }

  const directProxy = proxies.find((proxy) => proxy.proxyId === directProxyID)
  return { mode: 'pool', proxyId: directProxy?.proxyId || '', proxyConfig: '' }
}

export function BrowserEditPage() {
  useLocale()

  const { id } = useParams()
  const navigate = useNavigate()
  const isCreate = id === 'new'
  const [formData, setFormData] = useState<BrowserProfileEditForm>({
    profileName: '',
    userDataDir: '',
    coreId: '',
    restoreLastSession: '',
    fingerprintArgs: [],
    networkMode: 'proxy',
    proxyId: directProxyID,
    proxyConfig: '',
    memoryLimitMb: 0,
    launchArgs: [],
    lastLaunchArgs: [],
    tags: [],
    keywords: [],
    groupId: '',
  })
  const [cores, setCores] = useState<BrowserCore[]>([])
  const [proxies, setProxies] = useState<BrowserProxy[]>([])
  const [groups, setGroups] = useState<BrowserGroup[]>([])
  const [launchArgsText, setLaunchArgsText] = useState('')
  const [allTags, setAllTags] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [platformCapabilities, setPlatformCapabilities] = useState<BrowserPlatformCapabilities | null>(null)
  useEffect(() => {
    let cancelled = false
    fetchBrowserPlatformCapabilities()
      .then(value => { if (!cancelled) setPlatformCapabilities(value) })
      .catch(error => { if (!cancelled) toast.error(String(error)) })
    return () => { cancelled = true }
  }, [])
  const [proxyPickerOpen, setProxyPickerOpen] = useState(false)
  const [proxyMode, setProxyMode] = useState<ProxySourceMode>('pool')
  const [profileRunning, setProfileRunning] = useState(false)
  const [torSwitchConfirmOpen, setTorSwitchConfirmOpen] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [leaveConfirm, setLeaveConfirm] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [locationResolving, setLocationResolving] = useState(false)
  const [locationResult, setLocationResult] = useState<ProxyLocationResolveResult | null>(null)
  const [fingerprintChecking, setFingerprintChecking] = useState(false)
  const [fingerprintPageOpening, setFingerprintPageOpening] = useState(false)
  const [fingerprintCheckResult, setFingerprintCheckResult] = useState<BrowserFingerprintCheckResult | null>(null)
  const [fingerprintCheckOpen, setFingerprintCheckOpen] = useState(false)
  const [fingerprintMatrix, setFingerprintMatrix] = useState<BrowserFingerprintCapabilityReport | null>(null)
  const [fingerprintMatrixOpen, setFingerprintMatrixOpen] = useState(false)
  const [launchArgsOpen, setLaunchArgsOpen] = useState(false)
  const [launchArgsHelpOpen, setLaunchArgsHelpOpen] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      const [coreList, proxyList, tagList, groupList, settings] = await Promise.all([
        fetchBrowserCores(),
        fetchBrowserProxies(),
        fetchAllTags(),
        fetchGroups(),
        fetchBrowserSettings(),
      ])
      const resolvedDefaultLaunchArgs = resolveDefaultLaunchArgs(settings.defaultLaunchArgs || [])
      setCores(coreList)
      setProxies(proxyList)
      setAllTags(tagList)
      setGroups(groupList)

      if (isCreate) {
        const resolved = resolvePoolProxySelection('', '', proxyList)
        setProfileRunning(false)
        setProxyMode('pool')
        setFormData((prev) => ({
          ...prev,
          networkMode: 'proxy',
          proxyId: resolved.proxyId || directProxyID,
          proxyConfig: '',
          restoreLastSession: '',
          fingerprintArgs: withAdaptiveDefaultWindowSize(settings.defaultFingerprintArgs || []),
        }))
        setLaunchArgsText(resolvedDefaultLaunchArgs.join('\n'))
        return
      }
      const list = await fetchBrowserProfiles()
      const current = list.find(item => item.profileId === id)
      if (!current) return
      const currentLaunchArgs = normalizeLaunchArgs(current.launchArgs)
      const normalizedCoreId = !current.coreId || current.coreId.toLowerCase() === 'default'
        ? ''
        : current.coreId
      const currentNetworkMode: BrowserNetworkMode = current.networkMode === 'tor' ? 'tor' : 'proxy'
      const resolvedProxy = currentNetworkMode === 'tor'
        ? { mode: 'pool' as const, proxyId: '', proxyConfig: '' }
        : resolvePoolProxySelection(current.proxyId || '', current.proxyConfig || '', proxyList)
      setProfileRunning(Boolean(current.running))
      setProxyMode(resolvedProxy.mode)
      setFormData({
        profileName: current.profileName,
        userDataDir: current.userDataDir,
        coreId: normalizedCoreId,
        restoreLastSession: current.restoreLastSession || '',
        fingerprintArgs: current.fingerprintArgs,
        networkMode: currentNetworkMode,
        proxyId: resolvedProxy.proxyId,
        proxyConfig: resolvedProxy.proxyConfig,
        memoryLimitMb: current.memoryLimitMb || 0,
        launchArgs: currentLaunchArgs,
        lastLaunchArgs: current.lastLaunchArgs || [],
        tags: current.tags,
        keywords: current.keywords || [],
        groupId: current.groupId || '',
      })
      setLaunchArgsText(currentLaunchArgs.join('\n'))
    }
    loadData()
  }, [id, isCreate])

  const fingerprintArgsKey = formData.fingerprintArgs.join('\n')

  useEffect(() => {
    let cancelled = false
    const loadMatrix = async () => {
      try {
        const report = await fetchBrowserProfileFingerprintMatrix(isCreate ? '' : id || '', formData.coreId, formData.fingerprintArgs)
        if (!cancelled) setFingerprintMatrix(report)
      } catch {
        if (!cancelled) setFingerprintMatrix(null)
      }
    }
    loadMatrix()
    return () => { cancelled = true }
  }, [id, isCreate, formData.coreId, fingerprintArgsKey])

  const handleChange = (field: keyof BrowserProfileInput, value: string | string[] | number) => {
    setIsDirty(true)
    setFormData(prev => {
      if (field === 'proxyId') {
        return { ...prev, proxyId: typeof value === 'string' ? value : '' }
      }
      return { ...prev, [field]: value }
    })
  }

  const isTorMode = formData.networkMode === 'tor'
  const hasConfiguredProxy = Boolean(formData.proxyId.trim() || formData.proxyConfig.trim())

  const applyNetworkMode = (mode: BrowserNetworkMode) => {
    setIsDirty(true)
    setLocationResult(null)
    setProxyPickerOpen(false)
    setProxyMode('pool')
    setFormData((prev) => {
      if (mode === 'tor') {
        return { ...prev, networkMode: 'tor', proxyId: '', proxyConfig: '' }
      }
      const directProxy = proxies.find((proxy) => proxy.proxyId === directProxyID)
      return {
        ...prev,
        networkMode: 'proxy',
        proxyId: prev.proxyId.trim() || directProxy?.proxyId || directProxyID,
        proxyConfig: '',
      }
    })
  }

  const handleNetworkModeChange = (mode: BrowserNetworkMode) => {
    if (mode === formData.networkMode) return
    if (profileRunning) {
      toast.warning(tr("browser.pages.BrowserEditPage.BrowserEditPage.4a567d6"))
      return
    }
    if (mode === 'tor' && hasConfiguredProxy) {
      setTorSwitchConfirmOpen(true)
      return
    }
    applyNetworkMode(mode)
  }

  const handleProxyModeChange = (mode: ProxySourceMode) => {
    if (isTorMode) return
    setIsDirty(true)
    setProxyMode(mode)
    if (mode === 'pool') {
      setFormData((prev) => {
        if (prev.proxyId.trim()) {
          return prev
        }
        const directProxy = proxies.find((proxy) => proxy.proxyId === directProxyID)
        return {
          ...prev,
          proxyId: directProxy?.proxyId || '',
        }
      })
    }
  }

  const handleSave = async () => {
    if (!platformCapabilities) { toast.error(tr("browser.pages.BrowserEditPage.BrowserEditPage.42a569e")); return }
    if (!platformCapabilities.memoryHardLimit && (formData.memoryLimitMb || 0) > 0) {
      toast.error(tr("browser.pages.BrowserEditPage.BrowserEditPage.4c970c3")); return
    }
    const resolvedProxyId = isTorMode ? '' : proxyMode === 'pool' ? (formData.proxyId || '').trim() : ''
    const resolvedProxyConfig = isTorMode ? '' : proxyMode === 'local' ? (formData.proxyConfig || '').trim() : ''
    if (!isTorMode && proxyMode === 'local' && !resolvedProxyConfig) {
      setSaveError(tr("browser.pages.BrowserEditPage.BrowserEditPage.6b9edac"))
      return
    }

    const payload: BrowserProfileInput = {
      profileName: formData.profileName,
      userDataDir: formData.userDataDir,
      coreId: formData.coreId,
      restoreLastSession: formData.restoreLastSession || '',
      fingerprintArgs: formData.fingerprintArgs,
      networkMode: formData.networkMode,
      tags: formData.tags,
      keywords: formData.keywords,
      groupId: formData.groupId,
      proxyId: resolvedProxyId,
      proxyConfig: resolvedProxyConfig,
      memoryLimitMb: Math.max(0, Math.floor(Number(formData.memoryLimitMb) || 0)),
      launchArgs: normalizeLaunchArgs(launchArgsText.split('\n')),
    }
    const fingerprintValidation = validateFingerprintArgs(payload.fingerprintArgs)
    if (!fingerprintValidation.valid) {
      setSaveError(fingerprintValidation.issues.filter(issue => issue.level === 'error').map(issue => issue.message).join('\n'))
      return
    }
    if (!isTorMode && proxyMode === 'pool' && !resolvedProxyId) {
      payload.proxyId = directProxyID
      payload.proxyConfig = ''
    }

    setSaving(true)
    try {
      if (!isTorMode) {
        const validation = await validateProxyConfig(payload.proxyConfig, payload.proxyId)
        if (!validation.supported) {
          setSaveError(validation.errorMsg || tr("browser.pages.AutoConfigPage.AutoConfigPage.3adabf7"))
          return
        }
      }
      if (isCreate) {
        await createBrowserProfile(payload)
        toast.success(tr("browser.pages.BrowserEditPage.BrowserEditPage.34c0d9d"))
      } else if (id) {
        await updateBrowserProfile(id, payload)
        toast.success(tr("browser.pages.BrowserEditPage.BrowserEditPage.712f66a"))
      }
      setIsDirty(false)
      navigate('/browser/list')
    } catch (error: any) {
      setSaveError(typeof error === 'string' ? error : error?.message || tr("browser.components.BrowserSettingsModal.BrowserSettingsModal.40525a7"))
    } finally {
      setSaving(false)
    }
  }

  const handleBack = () => {
    if (isDirty) { setLeaveConfirm(true) } else { navigate('/browser/list') }
  }

  const handleApplyProxyLocation = async () => {
    if (isTorMode || proxyMode !== 'pool' || !formData.proxyId || formData.proxyId === directProxyID) {
      toast.error(tr("browser.pages.BrowserEditPage.BrowserEditPage.a1fe0e7"))
      return
    }
    setLocationResolving(true)
    setLocationResult(null)
    try {
      const result = await browserProxyResolveLocation(formData.proxyId)
      setLocationResult(result)
      if (!result.ok || !result.lang || !result.timezone) {
        toast.error(result.error || tr("browser.pages.BrowserEditPage.BrowserEditPage.11071a6"))
        return
      }
      const nextArgs = applyLocaleToFingerprintArgs(formData.fingerprintArgs, result.lang, result.timezone)
      handleChange('fingerprintArgs', nextArgs)
      toast.success(tr("browser.pages.BrowserEditPage.BrowserEditPage.c44178f", [result.lang, result.timezone]))
    } catch (error: unknown) {
      toast.error((error as Error)?.message || tr("browser.pages.BrowserEditPage.BrowserEditPage.ccd3ab8"))
    } finally {
      setLocationResolving(false)
    }
  }

  const handleFingerprintCheck = async () => {
    if (isCreate || !id) {
      toast.warning(tr("browser.pages.BrowserEditPage.BrowserEditPage.780757e"))
      return
    }
    if (isDirty) {
      toast.warning(tr("browser.pages.BrowserEditPage.BrowserEditPage.cb733b2"))
      return
    }
    setFingerprintChecking(true)
    try {
      const result = await checkBrowserProfileFingerprint(id)
      setFingerprintCheckResult(result)
      setFingerprintCheckOpen(true)
    } catch (error: unknown) {
      toast.error((error as Error)?.message || tr("browser.pages.BrowserEditPage.BrowserEditPage.b4d626c"))
    } finally {
      setFingerprintChecking(false)
    }
  }

  const handleOpenFingerprintPage = async () => {
    if (isCreate || !id) {
      toast.warning(tr("browser.pages.BrowserEditPage.BrowserEditPage.66c7747"))
      return
    }
    if (isDirty) {
      toast.warning(tr("browser.pages.BrowserEditPage.BrowserEditPage.9f48e7d"))
      return
    }
    setFingerprintPageOpening(true)
    try {
      const profile = await openBrowserFingerprintCheck(id)
      if (profile?.lastLaunchArgs) {
        setFormData(prev => ({ ...prev, lastLaunchArgs: profile.lastLaunchArgs || [] }))
      }
      toast.success(tr("browser.pages.BrowserEditPage.BrowserEditPage.dab724a"))
    } catch (error: unknown) {
      toast.error((error as Error)?.message || tr("browser.pages.BrowserEditPage.BrowserEditPage.32f438c"))
    } finally {
      setFingerprintPageOpening(false)
    }
  }

  const defaultCore = cores.find(c => c.isDefault)
  const selectedPoolProxy = proxies.find((proxy) => proxy.proxyId === formData.proxyId)

  const handleOpenUserDataDir = async () => {
    if (!formData.userDataDir.trim()) {
      toast.error(tr("browser.pages.BrowserEditPage.BrowserEditPage.0e4d872"))
      return
    }
    try {
      await openUserDataDir(formData.userDataDir)
    } catch (error: unknown) {
      toast.error((error as Error)?.message || tr("browser.components.AutomationScriptPublicApiModal.AutomationScriptPublicApiModal.6651d08"))
    }
  }

  const handleProxyListUpdated = (nextProxies: BrowserProxy[]) => {
    setProxies(nextProxies)
  }

  const handleProxyDeleted = (deletedProxyId: string, nextProxies: BrowserProxy[]) => {
    setProxies(nextProxies)
    if (formData.proxyId !== deletedProxyId) {
      return
    }

    const fallbackProxy = nextProxies.find((proxy) => proxy.proxyId === directProxyID)
    if (fallbackProxy) {
      handleChange('proxyId', fallbackProxy.proxyId)
      return
    }

    handleChange('proxyId', '')
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <WorkspaceHeader

        title={isCreate ? tr("browser.components.BrowserListLayout.text.9c614ae") : tr("browser.pages.BrowserEditPage.BrowserEditPage.f2885b7")}

        actions={(
          <>
            <Button variant="secondary" size="sm" onClick={handleBack}>{tr("browser.pages.AutomationScriptDetailPage.text.53505b1")}</Button>
            <Button size="sm" onClick={handleSave} loading={saving} disabled={!platformCapabilities || (!platformCapabilities.memoryHardLimit && (formData.memoryLimitMb || 0) > 0)}>{tr("browser.pages.BrowserEditPage.text.817af18")}</Button>
          </>
        )}
      />

      <Card title={tr("browser.components.BrowserListLayout.aria_label.5095009")}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormItem label={tr("browser.pages.BrowserEditPage.label.a5f08c1")} required>
            <Input value={formData.profileName} onChange={e => handleChange('profileName', e.target.value)} placeholder={tr("browser.pages.BrowserEditPage.placeholder.10729fa")} />
          </FormItem>
          <FormItem label={tr("browser.pages.BrowserEditPage.label.1f69ba0")}>
            <div className="flex gap-2">
              <Input
                value={formData.userDataDir}
                onChange={e => handleChange('userDataDir', e.target.value)}
                placeholder={tr("browser.pages.BrowserEditPage.placeholder.a0c413a")}
                className="flex-1"
              />
              <Button variant="secondary" size="sm" onClick={handleOpenUserDataDir} title={tr("browser.pages.BrowserEditPage.title.4a23c68")}>
                <FolderOpen className="w-4 h-4" />
              </Button>
            </div>
          </FormItem>
          <FormItem label={tr("browser.pages.BrowserDetailPage.text.8f190c5")}>
            <Select
              value={formData.coreId}
              onChange={e => handleChange('coreId', e.target.value)}
              options={
                cores.length > 0 ? [
                  { value: '', label: defaultCore ? tr("browser.pages.BrowserEditPage.BrowserEditPage.a14b9f8", [defaultCore.coreName]) : tr("browser.pages.BrowserEditPage.BrowserEditPage.4aa12fc") },
                  ...cores.map(c => ({ value: c.coreId, label: c.coreName })),
                ] : [
                  { value: '', label: tr("browser.pages.BrowserEditPage.label.9a115eb") }
                ]
              }
            />
          </FormItem>
          <FormItem label={tr("browser.pages.BrowserEditPage.label.9206210")}>
            <Select
              value={formData.restoreLastSession || ''}
              onChange={e => handleChange('restoreLastSession', e.target.value)}
              options={RESTORE_LAST_SESSION_OPTIONS}
            />
          </FormItem>
          <FormItem label={tr("browser.pages.BrowserEditPage.label.22baeee")}>
            <Input
              type="number"
              min="0"
              step="128"
              value={String(formData.memoryLimitMb || 0)}
              onChange={e => handleChange('memoryLimitMb', Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              placeholder={tr("browser.pages.BrowserEditPage.placeholder.19b148c")}
              disabled={!platformCapabilities?.memoryHardLimit}
            />
            {!platformCapabilities?.memoryHardLimit && <p className="mt-1 text-xs text-[var(--color-text-muted)]">{translateMessage(platformCapabilities?.memoryHardLimitReason) || tr("browser.pages.BrowserEditPage.BrowserEditPage.b3b7da7")}</p>}
            {platformCapabilities && !platformCapabilities.memoryHardLimit && (formData.memoryLimitMb || 0) > 0 && (
              <div className="mt-2 text-sm text-[var(--color-warning)]">
                <p>{tr("browser.pages.BrowserEditPage.text.484e72e")}{formData.memoryLimitMb}{tr("browser.pages.BrowserEditPage.text.8980ddb")}</p>
                <Button size="sm" variant="secondary" onClick={() => handleChange('memoryLimitMb', 0)}>{tr("browser.pages.BrowserEditPage.text.e30b290")}</Button>
              </div>
            )}
          </FormItem>
          <FormItem label={tr("browser.pages.BrowserDetailPage.text.ae0a7af")}>
            <TagInput
              value={formData.tags}
              onChange={tags => handleChange('tags', tags)}
              suggestions={allTags}
              placeholder={tr("browser.pages.BrowserEditPage.placeholder.9b3a85f")}
            />
          </FormItem>
          <FormItem label={tr("browser.components.GroupTreeNav.text.97d8a6c")}>
            <GroupSelector
              groups={groups}
              value={formData.groupId || ''}
              onChange={groupId => handleChange('groupId', groupId)}
              placeholder={tr("browser.components.GroupTreeNav.text.8de957a")}
              className="w-full"
            />
          </FormItem>
        </div>
      </Card>

      <Card title={tr("browser.pages.BrowserDetailPage.text.8f26543")} >
        <div className="grid gap-3 md:grid-cols-2" role="radiogroup" aria-label={tr("browser.pages.BrowserEditPage.aria_label.261ff01")}>
          <button
            type="button"
            role="radio"
            aria-checked={!isTorMode}
            disabled={profileRunning}
            onClick={() => handleNetworkModeChange('proxy')}
            className={`flex min-h-[92px] items-start gap-3 rounded-sm border p-4 text-left transition-[border-color,background-color,color,transform] duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 ${
              !isTorMode
                ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)]/30'
                : 'border-[var(--color-border-default)] hover:border-[var(--color-border-strong)]'
            }`}
          >
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border ${!isTorMode ? 'border-[var(--color-accent)] text-[var(--color-accent)]' : 'border-[var(--color-border-default)] text-[var(--color-text-muted)]'}`}>
              <Network className="h-4 w-4" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-[var(--color-text-primary)]">{tr("browser.pages.BrowserDetailPage.BrowserDetailPage.e4d38f8")}</span>
              <span className="mt-1 block text-xs leading-5 text-[var(--color-text-muted)]">{tr("browser.pages.BrowserEditPage.text.6367acc")}</span>
            </span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={isTorMode}
            disabled={profileRunning}
            onClick={() => handleNetworkModeChange('tor')}
            className={`flex min-h-[92px] items-start gap-3 rounded-sm border p-4 text-left transition-[border-color,background-color,color,transform] duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 ${
              isTorMode
                ? 'border-[var(--color-warning)] bg-[var(--color-warning)]/5'
                : 'border-[var(--color-border-default)] hover:border-[var(--color-border-strong)]'
            }`}
          >
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border ${isTorMode ? 'border-[var(--color-warning)] text-[var(--color-warning)]' : 'border-[var(--color-border-default)] text-[var(--color-text-muted)]'}`}>
              <RadioTower className="h-4 w-4" aria-hidden="true" />
            </span>
            <span>
              <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">{tr("browser.pages.BrowserEditPage.text.0369caf")}<span className="font-mono text-[10px]   text-[var(--color-warning)]">{tr("browser.components.BrowserProfilesPanel.text.2600d79")}</span>
              </span>
              <span className="mt-1 block text-xs leading-5 text-[var(--color-text-muted)]">{tr("browser.pages.BrowserEditPage.text.7934418")}</span>
            </span>
          </button>
        </div>
        {isTorMode && <TorModeNotice className="mt-4" />}
      </Card>

      <Card title={tr("browser.pages.BrowserEditPage.title.43833da")} >
        <div className={`grid grid-cols-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start ${isTorMode ? 'opacity-55' : ''}`}>
          <FormItem label={tr("browser.pages.AutoConfigPage.aria_label.d03acac")}>
            <Select
              value={proxyMode}
              onChange={e => handleProxyModeChange(e.target.value as ProxySourceMode)}
              disabled={isTorMode}
              options={[
                { value: 'pool', label: tr("config.navigation.config.name.9830ee8") },
                { value: 'local', label: tr("browser.pages.BrowserEditPage.label.f268438") },
              ]}
            />
          </FormItem>
          {proxyMode === 'pool' ? (
            <FormItem label={tr("browser.pages.BrowserEditPage.label.67007e6")}>
              <div className="flex flex-col sm:flex-row gap-2">
                <Select
                  value={formData.proxyId}
                  onChange={e => { handleChange('proxyId', e.target.value); setLocationResult(null) }}
                  disabled={isTorMode}
                  options={
                    proxies.length > 0
                      ? proxies.map(p => ({ value: p.proxyId, label: p.proxyName || p.proxyId }))
                      : [{ value: '', label: tr("browser.pages.BrowserEditPage.label.5e6e538") }]
                  }
                  className="flex-1 min-w-0"
                />
                <Button variant="secondary" size="sm" className="shrink-0" onClick={() => setProxyPickerOpen(true)} title={tr("browser.pages.BrowserEditPage.title.6644e64")} disabled={isTorMode}>
                  <Layers className="w-4 h-4" />
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  onClick={handleApplyProxyLocation}
                  loading={locationResolving}
                  disabled={isTorMode || !formData.proxyId || formData.proxyId === directProxyID}
                >{tr("browser.pages.BrowserEditPage.text.55742d3")}</Button>
              </div>
              {locationResult && (
                <div className="mt-2 text-xs text-[var(--color-text-muted)]">
                  {locationResult.ok
                    ? tr("browser.pages.BrowserEditPage.BrowserEditPage.2d92340", [locationResult.ip || '-', [locationResult.country, locationResult.region, locationResult.city].filter(Boolean).join(' / ') || '-', locationResult.lang, locationResult.timezone])
                    : locationResult.error || tr("browser.pages.BrowserEditPage.BrowserEditPage.a03e302")}
                </div>
              )}
            </FormItem>
          ) : (
            <FormItem label={tr("browser.pages.BrowserEditPage.label.553a8c2")}>
              <Input
                value={formData.proxyConfig}
                onChange={e => handleChange('proxyConfig', e.target.value)}
                placeholder="http://127.0.0.1:7890"
                disabled={isTorMode}
              />
            </FormItem>
          )}
        </div>
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">
          {isTorMode
            ? tr("browser.pages.BrowserEditPage.BrowserEditPage.93d494b")
            : proxyMode === 'pool'
              ? tr("browser.pages.BrowserEditPage.BrowserEditPage.dcdd703", [selectedPoolProxy?.proxyName ? `：${selectedPoolProxy.proxyName}` : '。'])
              : tr("browser.pages.BrowserEditPage.BrowserEditPage.7554300")}
        </p>
      </Card>

      <ProxyPickerModal
        open={proxyPickerOpen && !isTorMode}
        currentProxyId={formData.proxyId}
        onSelect={proxy => { handleChange('proxyId', proxy.proxyId); setLocationResult(null) }}
        onProxyListUpdated={handleProxyListUpdated}
        onProxyDeleted={handleProxyDeleted}
        onClose={() => setProxyPickerOpen(false)}
      />

      <Card
        title={tr("browser.pages.BrowserEditPage.title.ae00ea3")}
        actions={(
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setFingerprintMatrixOpen(true)}
              title={tr("browser.pages.BrowserEditPage.title.ed6ff23")}
              aria-label={tr("browser.pages.BrowserEditPage.title.ed6ff23")}
            >
              <HelpCircle className="w-4 h-4" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleOpenFingerprintPage}
              loading={fingerprintPageOpening}
              disabled={isCreate}
            >{tr("browser.pages.BrowserEditPage.text.5522fdc")}</Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleFingerprintCheck}
              loading={fingerprintChecking}
              disabled={isCreate}
            >
              <ShieldCheck className="w-4 h-4" />{tr("browser.pages.BrowserEditPage.text.1440787")}</Button>
          </>
        )}
      >
        <FingerprintPanel
          value={formData.fingerprintArgs}
          onChange={args => handleChange('fingerprintArgs', args)}
        />
      </Card>

      <Card padding="none">
        <button
          type="button"
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[var(--color-bg-hover)] transition-colors"
          onClick={() => setLaunchArgsOpen(current => !current)}
        >
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
            <span>{tr("browser.pages.BrowserEditPage.text.5f7a0a1")}</span>
            <span
              role="button"
              tabIndex={0}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)]"
              onClick={event => {
                event.stopPropagation()
                setLaunchArgsHelpOpen(true)
              }}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  event.stopPropagation()
                  setLaunchArgsHelpOpen(true)
                }
              }}
              aria-label={tr("browser.pages.BrowserEditPage.aria_label.5539328")}
            >
              <HelpCircle className="h-4 w-4" />
            </span>
          </span>
          {launchArgsOpen ? <ChevronUp className="w-4 h-4 text-[var(--color-text-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)]" />}
        </button>
        {launchArgsOpen && (
          <div className="space-y-3 border-t border-[var(--color-border-muted)] px-5 pb-5 pt-4">
            {isTorMode && (
              <p className="rounded-sm border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/5 px-3 py-2 text-xs leading-5 text-[var(--color-text-secondary)]">{tr("browser.pages.BrowserEditPage.text.1f933ae")}</p>
            )}
            <Textarea
              value={launchArgsText}
              onChange={e => { setLaunchArgsText(e.target.value); setIsDirty(true) }}
              rows={6}
              placeholder="--disable-sync"
            />
            {!isCreate && formData.lastLaunchArgs && formData.lastLaunchArgs.length > 0 && (
              <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
                <div className="px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] border-b border-[var(--color-border)]">{tr("browser.pages.BrowserEditPage.text.c16ed5d")}</div>
                <Textarea
                  value={formData.lastLaunchArgs.join('\n')}
                  readOnly
                  rows={6}
                  className="border-0 rounded-none bg-[var(--color-bg-hover)] font-mono text-xs"
                />
              </div>
            )}
          </div>
        )}
      </Card>

      <Modal
        open={launchArgsHelpOpen}
        onClose={() => setLaunchArgsHelpOpen(false)}
        title={tr("browser.pages.BrowserEditPage.title.23e6109")}
        width="920px"
        footer={<Button variant="secondary" onClick={() => setLaunchArgsHelpOpen(false)}>{tr("ui.components.Modal.aria_label.6c14bd7")}</Button>}
      >
        <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
          <div className="grid grid-cols-[220px_minmax(0,1fr)_minmax(180px,0.7fr)] gap-3 px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] border-b border-[var(--color-border)] bg-[var(--color-bg-hover)]">
            <div>{tr("browser.components.FingerprintPanel.text.749d765")}</div>
            <div>{tr("browser.pages.BrowserEditPage.text.104d11e")}</div>
            <div>{tr("browser.automationScripts.createAutomationScriptDraft.30fd4ed")}</div>
          </div>
          {[
            ['--disable-sync', tr("browser.pages.BrowserEditPage.BrowserEditPage.8cf3d25"), '--disable-sync'],
            ['--no-first-run', tr("browser.pages.BrowserEditPage.BrowserEditPage.9527aa0"), '--no-first-run'],
            ['--start-maximized', tr("browser.pages.BrowserEditPage.BrowserEditPage.e9a1c6f"), '--start-maximized'],
            ['--disable-background-networking', tr("browser.pages.BrowserEditPage.BrowserEditPage.e1c2b04"), '--disable-background-networking'],
            ['--disable-features=<list>', tr("browser.pages.BrowserEditPage.BrowserEditPage.876c06c"), '--disable-features=Translate'],
            ['--enable-features=<list>', tr("browser.pages.BrowserEditPage.BrowserEditPage.b13b3e7"), '--enable-features=NetworkService'],
            [tr("browser.pages.BrowserEditPage.BrowserEditPage.06c23c1"), tr("browser.pages.BrowserEditPage.BrowserEditPage.6c885b1"), '--user-data-dir / --proxy-server / --remote-debugging-port'],
            [tr("browser.pages.BrowserEditPage.text.c16ed5d"), tr("browser.pages.BrowserEditPage.BrowserEditPage.3101354"), tr("browser.pages.BrowserEditPage.BrowserEditPage.cdc8728")],
          ].map(([arg, meaning, example]) => (
            <div key={arg} className="grid grid-cols-[220px_minmax(0,1fr)_minmax(180px,0.7fr)] gap-3 px-3 py-2 text-xs border-b last:border-b-0 border-[var(--color-border)]">
              <code className="break-all text-[var(--color-text-primary)]">{arg}</code>
              <div className="text-[var(--color-text-secondary)]">{meaning}</div>
              <code className="break-all text-[var(--color-text-muted)]">{example}</code>
            </div>
          ))}
        </div>
      </Modal>

      <ConfirmModal
        open={torSwitchConfirmOpen}
        onClose={() => setTorSwitchConfirmOpen(false)}
        onConfirm={() => applyNetworkMode('tor')}
        title={tr("browser.pages.BrowserEditPage.title.5a89a98")}
        content={(
          <div className="space-y-2 text-sm leading-6">
            <p>{tr("browser.pages.BrowserEditPage.text.e3743bf")}</p>
            <p className="text-[var(--color-text-muted)]">{tr("browser.pages.BrowserEditPage.text.4396d3b")}</p>
          </div>
        )}
        confirmText={tr("browser.pages.BrowserEditPage.confirmText.ba71e4b")}
        cancelText={tr("browser.pages.BrowserEditPage.cancelText.34e7a9c")}
        danger
      />

      <ConfirmModal
        open={leaveConfirm}
        onClose={() => setLeaveConfirm(false)}
        onConfirm={() => navigate('/browser/list')}
        title={tr("browser.pages.BrowserEditPage.title.dcd163d")}
        content={tr("browser.pages.BrowserEditPage.content.1ddd52b")}
        confirmText={tr("browser.pages.BrowserEditPage.confirmText.af75487")}
        cancelText={tr("browser.pages.BrowserEditPage.cancelText.3a481bc")}
        danger
      />

      <Modal
        open={fingerprintCheckOpen}
        onClose={() => setFingerprintCheckOpen(false)}
        title={tr("browser.pages.BrowserEditPage.title.5cf071c")}
        width="860px"
      >
        {fingerprintCheckResult ? (
          <div className="space-y-4">
            <div className="grid grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)_70px] gap-3 text-xs font-medium text-[var(--color-text-muted)] border-b border-[var(--color-border)] pb-2">
              <div>{tr("browser.pages.BrowserEditPage.text.22336e6")}</div>
              <div>{tr("browser.pages.BrowserEditPage.text.73de586")}</div>
              <div>{tr("browser.pages.BrowserEditPage.text.336e5c7")}</div>
              <div>{tr("browser.components.AutomationScriptHistoryModal.text.62e951a")}</div>
            </div>
            <div>
              <FingerprintCheckRow label={tr("browser.components.FingerprintPanel.label.cd99b22")} expected={fingerprintCheckResult.expected.language} actual={fingerprintCheckResult.runtime.language} />
              <FingerprintCheckRow label={tr("browser.components.FingerprintPanel.label.0778870")} expected={fingerprintCheckResult.expected.acceptLanguage} actual={fingerprintCheckResult.runtime.languages} />
              <FingerprintCheckRow label={tr("browser.components.FingerprintPanel.label.fb2a23d")} expected={fingerprintCheckResult.expected.timezone} actual={fingerprintCheckResult.runtime.timezone} />
              <FingerprintCheckRow label={tr("browser.pages.BrowserEditPage.label.dfa837e")} expected={fingerprintCheckResult.expected.hardwareConcurrency} actual={fingerprintCheckResult.runtime.hardwareConcurrency} />
              <FingerprintDisplayRow label={tr("browser.pages.AutoConfigPage.label.063c974")} actual={fingerprintCheckResult.runtime.deviceMemory} />
              <FingerprintDisplayRow label={tr("browser.pages.BrowserEditPage.label.6063a04")} actual={fingerprintCheckResult.runtime.colorDepth} />
              <FingerprintDisplayRow label={tr("browser.pages.AutoConfigPage.label.e8e82c9")} actual={fingerprintCheckResult.runtime.maxTouchPoints} />
              <FingerprintDisplayRow label={tr("ui.modules.browser.pages.BrowserEditPage.label.2c25376")} actual={fingerprintCheckResult.runtime.doNotTrack} />
              <FingerprintCheckRow label={tr("browser.copyOptions.label.a599946")} expected={fingerprintCheckResult.expected.windowSize} actual={`${fingerprintCheckResult.runtime.outerWidth},${fingerprintCheckResult.runtime.outerHeight}`} />
              <FingerprintCheckRow label={tr("browser.components.FingerprintPanel.label.e4b9d69")} expected={fingerprintCheckResult.expected.platform} actual={fingerprintCheckResult.runtime.platform} mode="platform" />
              <FingerprintCheckRow label={tr("browser.components.FingerprintPanel.label.7fc28d3")} expected={fingerprintCheckResult.expected.brandVersion} actual={fingerprintCheckResult.runtime.userAgent} mode="browser-version" />
              <FingerprintCheckRow label={tr("browser.components.FingerprintPanel.label.735f889")} expected={fingerprintCheckResult.expected.platformVersion} actual={fingerprintCheckResult.runtime.userAgent} mode="platform-version" />
              <FingerprintCheckRow label="UA" expected={fingerprintCheckResult.expected.brand} actual={fingerprintCheckResult.runtime.userAgent} mode="contains" />
              <FingerprintDisplayRow label={tr("ui.modules.browser.pages.BrowserEditPage.label.3785547")} actual={fingerprintCheckResult.runtime.userAgentData} />
              <FingerprintCheckRow label={tr("ui.modules.browser.pages.BrowserEditPage.label.9b5a6b0")} expected={false} actual={fingerprintCheckResult.runtime.webdriver} />
              <FingerprintDisplayRow label={tr("browser.pages.AutoConfigPage.label.c68cb70")} actual={`${fingerprintCheckResult.runtime.screenWidth}x${fingerprintCheckResult.runtime.screenHeight} depth ${fingerprintCheckResult.runtime.colorDepth} @ ${fingerprintCheckResult.runtime.devicePixelRatio}`} />
              <FingerprintDisplayRow label={tr("ui.modules.browser.pages.BrowserEditPage.label.ee034e1")} actual={fingerprintCheckResult.runtime.webglVendor} />
              <FingerprintDisplayRow label={tr("ui.modules.browser.pages.BrowserEditPage.label.2c5168f")} actual={fingerprintCheckResult.runtime.webglRenderer} />
              <FingerprintDisplayRow label={tr("ui.modules.browser.pages.BrowserEditPage.label.ee69145")} actual={fingerprintCheckResult.runtime.canvasHash} />
              <FingerprintDisplayRow label={tr("ui.modules.browser.pages.BrowserEditPage.label.e032078")} actual={fingerprintCheckResult.runtime.audioHash} />
              <FingerprintDisplayRow label={tr("ui.modules.browser.pages.BrowserEditPage.label.ca96076")} actual={fingerprintCheckResult.runtime.clientRectsHash} />
              <FingerprintDisplayRow label={tr("browser.pages.BrowserEditPage.label.6a9c87c")} actual={fingerprintCheckResult.runtime.mediaDeviceCount} />
              <FingerprintDisplayRow label={tr("browser.components.FingerprintPanel.label.cc178ca")} actual={fingerprintCheckResult.expected.canvasNoise ? tr("browser.pages.BrowserEditPage.BrowserEditPage.dc7cd22") : tr("browser.pages.BrowserEditPage.BrowserEditPage.63595e9")} />
              <FingerprintDisplayRow label={tr("browser.pages.BrowserEditPage.label.5201834")} actual={tr("browser.pages.BrowserEditPage.actual.c5e4129")} />
              <FingerprintDisplayRow label={tr("browser.components.FingerprintPanel.label.df61775")} actual={fingerprintCheckResult.expected.clientRectsNoise ? tr("browser.pages.BrowserEditPage.BrowserEditPage.dc7cd22") : tr("browser.pages.BrowserEditPage.BrowserEditPage.63595e9")} />
              <FingerprintDisplayRow label={tr("browser.pages.BrowserEditPage.label.96ff7b7")} actual={tr("browser.pages.BrowserEditPage.actual.c5e4129")} />
              <FingerprintDisplayRow label={tr("browser.components.BrowserProfilesPanel.text.76fcd73")} actual={fingerprintCheckResult.runtime.plugins} />
              <FingerprintDisplayRow label={tr("browser.pages.BrowserEditPage.label.49e8096")} actual={fingerprintCheckResult.expected.seed || tr("browser.pages.BrowserEditPage.BrowserEditPage.1e69a15")} />
              <FingerprintDisplayRow label={tr("browser.pages.BrowserEditPage.label.c7a9c28")} actual={fingerprintCheckResult.expected.disableSpoofing || tr("browser.pages.BrowserEditPage.BrowserEditPage.7207774")} />
              <FingerprintDisplayRow label={tr("ui.modules.browser.pages.BrowserEditPage.label.d45467f")} actual={fingerprintCheckResult.expected.webrtcPolicy || tr("browser.pages.BrowserEditPage.BrowserEditPage.1e69a15")} />
            </div>
          </div>
        ) : (
          <div className="text-sm text-[var(--color-text-muted)]">{tr("browser.pages.BrowserEditPage.text.d014c55")}</div>
        )}
      </Modal>

      <Modal
        open={fingerprintMatrixOpen}
        onClose={() => setFingerprintMatrixOpen(false)}
        title={tr("browser.pages.BrowserEditPage.text.626994d")}
        width="980px"
        footer={<Button variant="secondary" onClick={() => setFingerprintMatrixOpen(false)}>{tr("ui.components.Modal.aria_label.6c14bd7")}</Button>}
      >
        <FingerprintMatrixReport report={fingerprintMatrix} />
      </Modal>

      <Modal
        open={!!saveError}
        onClose={() => setSaveError('')}
        title={tr("browser.components.BrowserSettingsModal.BrowserSettingsModal.40525a7")}
        width="420px"
        footer={<Button onClick={() => setSaveError('')}>{tr("browser.pages.BrowserEditPage.text.cb63c62")}</Button>}
      >
        <div className="text-[var(--color-text-secondary)]">{translateMessage(saveError)}</div>
      </Modal>
    </div>
  )
}

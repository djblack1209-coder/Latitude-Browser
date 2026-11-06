import { getLocale, translateMessage } from '../../../shared/i18n'
import { tr, useLocale, localized } from '../../../shared/i18n'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  HelpCircle,
  Fingerprint,
  LockKeyhole,
  Monitor,
  Network,
  RefreshCw,
  Wand2,
  Wifi,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Badge, Button, ConfirmModal, toast } from '../../../shared/components'
import { TerminalPanel, WorkspaceHeader } from '../../../shared/components/SignalPrimitives'
import type { BrowserProfile, BrowserProxy, BrowserSettings } from '../types'
import { checkBrowserProfileFingerprint, createBrowserProfile, fetchBrowserProxies, fetchBrowserSettings, startBrowserInstance, testProxyRealConnectivity, testProxyRealConnectivityWithConfig, validateProxyConfig } from '../api'
import { buildAutoConfigProfileInput, isAutoConfigProxyReady, sanitizeAutoConfigDraft } from '../utils/autoConfig'
import { evaluateFingerprintCheck } from '../utils/fingerprintCheck'
import { validateFingerprintArgs } from '../utils/fingerprintSerializer'

type NetworkMode = 'proxy' | 'direct'
type FingerprintMode = 'fixed' | 'constrained-random'
type ConnectorStack = 'xray' | 'mihomo' | 'none'
type ProxySource = 'pool' | 'custom'
type OperationStatus = 'idle' | 'loading' | 'success' | 'error'

type DeviceBaseline = {
  capturedAt: string
  userAgent: string
  browserFamily: string
  language: string
  languages: string[]
  timezone: string
  platform: string
  screenWidth: number
  screenHeight: number
  viewportWidth: number
  viewportHeight: number
  pixelRatio: number
  colorDepth: number
  hardwareConcurrency: number | null
  deviceMemory: number | null
  touchPoints: number
}

type FingerprintRecommendation = {
  profileName: string
  signature: string
  browserFamily: string
  osFamily: string
  locale: string
  timezone: string
  viewport: string
  hardwareClass: string
  consistencyChecks: string[]
  connectorStack: ConnectorStack
}

type AutoConfigDraft = {
  version: 1
  savedAt: string
  networkMode: NetworkMode
  connectorStack: ConnectorStack
  fingerprintMode: FingerprintMode
  baseline: DeviceBaseline
  recommendation: FingerprintRecommendation
  proxyId?: string
  proxyName?: string
  proxyConfig?: string
  proxySource?: ProxySource
  proxyConfigRedacted?: boolean
}

const STORAGE_KEY = 'latitude-browser:auto-config-draft'

const STEPS = localized(() => ([
  { eyebrow: '01', label: tr("browser.pages.AutoConfigPage.label.5d8cb1f") },
  { eyebrow: '02', label: tr("browser.pages.AutoConfigPage.label.382aa54") },
  { eyebrow: '03', label: tr("browser.pages.AutoConfigPage.label.a03c568") },
  { eyebrow: '04', label: tr("browser.pages.AutoConfigPage.label.6d55107") },
]))

const clearStoredDraft = () => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage may be unavailable or read-only.
  }
}

const readStoredDraft = (): AutoConfigDraft | null => {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const draft = parsed as Partial<AutoConfigDraft>
    if (
      draft.version !== 1 ||
      !draft.savedAt ||
      (draft.networkMode !== 'proxy' && draft.networkMode !== 'direct') ||
      (draft.fingerprintMode !== 'fixed' && draft.fingerprintMode !== 'constrained-random') ||
      !draft.baseline ||
      !draft.recommendation
    ) {
      // This key is dedicated to auto-config drafts; clear invalid legacy
      // content instead of leaving possible credentials behind.
      clearStoredDraft()
      return null
    }

    // Migrate legacy drafts in place. Older versions could have persisted a
    // custom proxy URI containing credentials. Keep the non-sensitive fields,
    // clear the secret, and write back only the sanitized copy.
    const legacyProxySource: ProxySource = draft.proxySource === 'custom'
      || (!draft.proxySource && Boolean(draft.proxyConfig?.trim()))
      ? 'custom'
      : 'pool'
    const sanitizedDraft = sanitizeAutoConfigDraft({
      ...(parsed as AutoConfigDraft),
      proxySource: legacyProxySource,
    })
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizedDraft))
    } catch {
      // Storage may be read-only; returning the sanitized in-memory copy is safe.
    }
    return sanitizedDraft
  } catch {
    // Malformed or inaccessible draft data is not useful and must not remain
    // in the dedicated storage slot.
    clearStoredDraft()
    return null
  }
}

const getConnectorStack = (defaultConnectorType?: string): ConnectorStack => (
  defaultConnectorType?.trim().toLowerCase() === 'mihomo' ? 'mihomo' : 'xray'
)

const safeNumber = (value: number | undefined, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const detectBrowserFamily = (userAgent: string) => {
  if (/edg\//i.test(userAgent)) return 'Edge'
  if (/firefox\//i.test(userAgent)) return 'Firefox'
  if (/opr\//i.test(userAgent) || /opera/i.test(userAgent)) return 'Opera'
  if (/chrome\//i.test(userAgent) && !/edg\//i.test(userAgent)) return 'Chromium'
  if (/safari\//i.test(userAgent) && !/chrome\//i.test(userAgent)) return 'Safari'
  return 'Browser'
}

const detectOsFamily = (baseline: Pick<DeviceBaseline, 'platform' | 'userAgent'>) => {
  const value = `${baseline.platform} ${baseline.userAgent}`
  if (/macintosh|mac os|macintel/i.test(value)) return 'macOS'
  if (/windows/i.test(value)) return 'Windows'
  if (/android/i.test(value)) return 'Android'
  if (/iphone|ipad|ios/i.test(value)) return 'iOS'
  if (/linux/i.test(value)) return 'Linux'
  return 'Unknown OS'
}

const stableHash = (value: string) => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0').toUpperCase()
}

const captureDeviceBaseline = (): DeviceBaseline => {
  const hasWindow = typeof window !== 'undefined'
  const hasNavigator = typeof navigator !== 'undefined'
  const currentNavigator = hasNavigator ? navigator : undefined
  const currentScreen = hasWindow ? window.screen : undefined
  const userAgent = currentNavigator?.userAgent || 'unknown'
  const language = currentNavigator?.language || 'unknown'
  const languages = currentNavigator?.languages ? Array.from(currentNavigator.languages).slice(0, 3) : []
  const extendedNavigator = currentNavigator as (Navigator & {
    deviceMemory?: number
    userAgentData?: { platform?: string }
  }) | undefined
  let timezone = 'unknown'

  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'
  } catch {
    timezone = 'unknown'
  }

  return {
    capturedAt: new Date().toISOString(),
    userAgent,
    browserFamily: detectBrowserFamily(userAgent),
    language,
    languages,
    timezone,
    platform: extendedNavigator?.userAgentData?.platform || currentNavigator?.platform || 'unknown',
    screenWidth: safeNumber(currentScreen?.width),
    screenHeight: safeNumber(currentScreen?.height),
    viewportWidth: safeNumber(hasWindow ? window.innerWidth : undefined),
    viewportHeight: safeNumber(hasWindow ? window.innerHeight : undefined),
    pixelRatio: safeNumber(hasWindow ? window.devicePixelRatio : undefined, 1),
    colorDepth: safeNumber(currentScreen?.colorDepth),
    hardwareConcurrency: safeNumber(currentNavigator?.hardwareConcurrency, 0) || null,
    deviceMemory: safeNumber(extendedNavigator?.deviceMemory, 0) || null,
    touchPoints: safeNumber(currentNavigator?.maxTouchPoints),
  }
}

const buildFingerprintRecommendation = (
  baseline: DeviceBaseline,
  networkMode: NetworkMode,
  defaultConnectorType?: string,
): FingerprintRecommendation => {
  const connectorStack = networkMode === 'direct' ? 'none' : getConnectorStack(defaultConnectorType)
  const osFamily = detectOsFamily(baseline)
  const locale = baseline.language === 'unknown' ? 'en-US' : baseline.language
  const viewport = `${baseline.viewportWidth || baseline.screenWidth} × ${baseline.viewportHeight || baseline.screenHeight}`
  const hardwareClass = baseline.hardwareConcurrency
    ? baseline.hardwareConcurrency >= 8
      ? tr("browser.pages.AutoConfigPage.message.ff6e700")
      : baseline.hardwareConcurrency >= 4
        ? tr("browser.pages.AutoConfigPage.message.8467f26")
        : tr("browser.pages.AutoConfigPage.message.2b1dacc")
    : tr("browser.pages.AutoConfigPage.message.24402fb")
  const signature = stableHash(
    [
      baseline.browserFamily,
      osFamily,
      locale,
      baseline.timezone,
      baseline.screenWidth,
      baseline.screenHeight,
      baseline.pixelRatio,
      baseline.hardwareConcurrency,
      connectorStack,
    ].join('|'),
  )

  return {
    profileName: `${osFamily} / ${baseline.browserFamily} / ${locale}`,
    signature,
    browserFamily: baseline.browserFamily,
    osFamily,
    locale,
    timezone: baseline.timezone,
    viewport,
    hardwareClass,
    connectorStack,
    consistencyChecks: [
      tr("browser.pages.AutoConfigPage.message.b54153a", [locale, baseline.timezone]),
      tr("browser.pages.AutoConfigPage.message.0ddf859", [viewport, baseline.screenWidth, baseline.screenHeight]),
      tr("browser.pages.AutoConfigPage.message.9a13d3f", [baseline.browserFamily, osFamily]),
    ],
  }
}

const connectorLabel: Record<ConnectorStack, string> = localized(() => ({
  xray: tr("browser.pages.AutoConfigPage.xray.11aa47e"),
  mihomo: tr("browser.pages.AutoConfigPage.mihomo.900e4dc"),
  none: tr("browser.pages.AutoConfigPage.none.6a55d11"),
}))

const networkLabel: Record<NetworkMode, string> = localized(() => ({
  proxy: tr("browser.pages.AutoConfigPage.proxy.b168ef4"),
  direct: tr("browser.pages.AutoConfigPage.direct.a7dd3b6"),
}))

const fingerprintLabel: Record<FingerprintMode, string> = localized(() => ({
  fixed: tr("browser.pages.AutoConfigPage.fixed.0467103"),
  'constrained-random': tr("browser.pages.AutoConfigPage.option.a74c567"),
}))

const formatCapturedAt = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(getLocale())
}

function SelectionOption({
  title,
  description,
  icon: Icon,
  selected,
  onSelect,
  badge,
}: {
  title: string
  description: string
  icon: LucideIcon
  selected: boolean
  onSelect: () => void
  badge?: string
}) {
  useLocale()

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={[
        'remit-choice group w-full rounded-[var(--radius-md)] border p-4 text-left transition-[background-color,border-color,color,transform] duration-150 active:translate-y-px',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]',

        selected
          ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)]'
          : 'border-[var(--color-border-default)] bg-[var(--color-bg-surface)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-elevated)]',
      ].join(' ')}
    >
      <span className="flex items-start justify-between gap-4">
        <span
          className={[
            'flex h-9 w-9 items-center justify-center rounded-full border',
            selected
              ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
              : 'border-[var(--color-border-default)] text-[var(--color-text-secondary)] group-hover:text-[var(--color-text-primary)]',
          ].join(' ')}
        >
          <Icon className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <span
          aria-hidden="true"
          className={[
            'mt-1 flex h-4 w-4 items-center justify-center rounded-full border',
            selected
              ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-text-inverse)]'
              : 'border-[var(--color-border-strong)] text-transparent',
          ].join(' ')}
        >
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      </span>
      <span className="mt-3 block">
        <span className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
          {title}
          {badge && <Badge variant="info" size="sm">{badge}</Badge>}
        </span>
        {description && <span className="mt-2 block text-xs leading-5 text-[var(--color-text-secondary)]">{description}</span>}
      </span>
    </button>
  )
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  useLocale()

  return (
    <div className="flex items-start justify-between gap-6 border-b border-[var(--color-border-muted)] py-3 last:border-b-0">
      <dt className="shrink-0 text-xs   text-[var(--color-text-muted)]">{label}</dt>
      <dd className={mono ? 'max-w-[70%] break-words text-right font-mono text-xs text-[var(--color-text-secondary)]' : 'max-w-[70%] text-right text-sm text-[var(--color-text-primary)]'}>
        {value}
      </dd>
    </div>
  )
}

export function AutoConfigPage() {
  const uiLocale = useLocale()

  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [networkMode, setNetworkMode] = useState<NetworkMode | null>(null)
  const [baseline, setBaseline] = useState<DeviceBaseline | null>(null)
  const [fingerprintMode, setFingerprintMode] = useState<FingerprintMode | null>(null)
  const [savedDraft, setSavedDraft] = useState<AutoConfigDraft | null>(() => readStoredDraft())
  const [settings, setSettings] = useState<BrowserSettings | null>(null)
  const [proxies, setProxies] = useState<BrowserProxy[]>([])
  const [proxySource, setProxySource] = useState<ProxySource>('pool')
  const [proxyId, setProxyId] = useState('')
  const [proxyConfig, setProxyConfig] = useState('')
  const [proxyLoading, setProxyLoading] = useState(false)
  const [proxyLoadError, setProxyLoadError] = useState('')
  const [settingsLoadError, setSettingsLoadError] = useState('')
  const [operationStatus, setOperationStatus] = useState<OperationStatus>('idle')
  const [operationMessage, setOperationMessage] = useState('')
  const [createdProfile, setCreatedProfile] = useState<BrowserProfile | null>(null)
  const [fingerprintCheckStatus, setFingerprintCheckStatus] = useState<'idle' | 'checking' | 'passed' | 'failed' | 'unavailable'>('idle')
  const [fingerprintCheckMessage, setFingerprintCheckMessage] = useState('')

  const recommendation = useMemo(
    () => (baseline && networkMode
      ? buildFingerprintRecommendation(baseline, networkMode, settings?.defaultConnectorType)
      : null),
    [baseline, networkMode, settings?.defaultConnectorType, uiLocale],
  )

  useEffect(() => {
    if (step === 1 && !baseline) {
      setBaseline(captureDeviceBaseline())
    }
  }, [baseline, step])

  useEffect(() => {
    let disposed = false
    setProxyLoading(true)
    setProxyLoadError('')

    void Promise.allSettled([fetchBrowserSettings(), fetchBrowserProxies()])
      .then(([settingsResult, proxiesResult]) => {
        if (disposed) return

        if (settingsResult.status === 'fulfilled') {
          setSettings(settingsResult.value)
          setSettingsLoadError('')
        } else {
          setSettingsLoadError(tr("browser.pages.AutoConfigPage.AutoConfigPage.949925d"))
        }

        if (proxiesResult.status === 'fulfilled') {
          const usableProxies = (proxiesResult.value || []).filter((proxy) => {
            const config = proxy.proxyConfig.trim().toLowerCase()
            return proxy.proxyId.trim() && config && config !== 'direct://'
          })
          setProxies(usableProxies)
          if (usableProxies[0]) {
            setProxyId((current) => current || usableProxies[0].proxyId)
          }
        } else {
          const error = proxiesResult.reason
          setProxyLoadError(error instanceof Error ? error.message : tr("browser.pages.AutoConfigPage.AutoConfigPage.bae3f53"))
        }
      })
      .finally(() => {
        if (!disposed) setProxyLoading(false)
      })

    return () => {
      disposed = true
    }
  }, [])

  const canContinue =
    (step === 0 && isAutoConfigProxyReady(networkMode, proxySource, proxyId, proxyConfig)) ||
    (step === 1 && baseline !== null) ||
    (step === 2 && fingerprintMode !== null) ||
    step === 3

  const buildDraft = (): AutoConfigDraft | null => {
    if (!networkMode || !baseline || !fingerprintMode || !recommendation) return null
    const selectedProxy = proxies.find((proxy) => proxy.proxyId === proxyId)
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      networkMode,
      connectorStack: recommendation.connectorStack,
      fingerprintMode,
      baseline,
      recommendation,
      proxyId: networkMode === 'proxy' && proxySource === 'pool' ? proxyId : '',
      proxyName: networkMode === 'proxy' && proxySource === 'pool' ? selectedProxy?.proxyName : '',
      proxyConfig: networkMode === 'proxy' && proxySource === 'custom' ? proxyConfig.trim() : '',
      proxySource,
    }
  }

  const persistDraft = (draft: AutoConfigDraft): boolean => {
    if (typeof window === 'undefined') return false

    // Keep the live proxy config in component state for the current create
    // flow, but only write a sanitized copy to localStorage.
    const sanitizedDraft = sanitizeAutoConfigDraft(draft)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizedDraft))
      setSavedDraft(sanitizedDraft)
      return true
    } catch {
      // Private browsing or a locked-down webview may deny storage. The operation can still continue.
      return false
    }
  }

  const handleSaveDraft = () => {
    const draft = buildDraft()
    if (!draft) return
    if (persistDraft(draft)) {
      toast.success(
        draft.proxyConfig?.trim()
          ? tr("browser.pages.AutoConfigPage.AutoConfigPage.c2c2b02")
          : tr("browser.pages.AutoConfigPage.AutoConfigPage.366efa9"),
      )
    } else {
      toast.warning(tr("browser.pages.AutoConfigPage.AutoConfigPage.5d25e09"))
    }
  }

  const handleRestoreDraft = () => {
    if (!savedDraft) return

    const requiresProxyEntry = savedDraft.networkMode === 'proxy' && savedDraft.proxyConfigRedacted
    setNetworkMode(savedDraft.networkMode)
    setBaseline(savedDraft.baseline)
    setFingerprintMode('fixed')
    setProxySource(savedDraft.proxySource === 'custom' ? 'custom' : 'pool')
    setProxyId(savedDraft.proxyId || '')
    setProxyConfig('')
    setCreatedProfile(null)
    setOperationStatus('idle')
    setOperationMessage('')
    setFingerprintCheckStatus('idle')
    setFingerprintCheckMessage('')
    setStep(requiresProxyEntry ? 0 : 3)

    toast.info(
      requiresProxyEntry
        ? tr("browser.pages.AutoConfigPage.AutoConfigPage.852504a")
        : tr("browser.pages.AutoConfigPage.AutoConfigPage.d0e14b7"),
    )
  }

  const handleClearDraft = () => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.removeItem(STORAGE_KEY)
      setSavedDraft(null)
      toast.success(tr("browser.pages.AutoConfigPage.AutoConfigPage.b0919a6"))
    } catch {
      toast.warning(tr("browser.pages.AutoConfigPage.AutoConfigPage.6980e65"))
    }
  }

  const resolveErrorMessage = (error: unknown, fallback: string) => (
    error instanceof Error && error.message ? error.message : typeof error === 'string' ? error : fallback
  )

  const handleStartCreatedProfile = async (profileId: string) => {
    setOperationStatus('loading')
    setOperationMessage(tr("browser.pages.AutoConfigPage.AutoConfigPage.fa514bb"))
    setFingerprintCheckStatus('checking')
    setFingerprintCheckMessage('')

    try {
      const started = await startBrowserInstance(profileId)
      if (!started) throw new Error(tr("browser.pages.AutoConfigPage.AutoConfigPage.ddf18b9"))
      setCreatedProfile(started)

      let fingerprintOutcome: 'passed' | 'failed' | 'unavailable' = 'unavailable'
      try {
        const check = await checkBrowserProfileFingerprint(profileId)
        const evaluation = evaluateFingerprintCheck(check)
        fingerprintOutcome = evaluation.status

        if (evaluation.status === 'failed') {
          const mismatchLabels = evaluation.rows
            .filter((row) => row.blocking && row.status === 'mismatch')
            .slice(0, 3)
            .map((row) => row.label)
          setFingerprintCheckStatus('failed')
          setFingerprintCheckMessage(
            mismatchLabels.length
              ? tr("browser.pages.AutoConfigPage.AutoConfigPage.f78be0f", [mismatchLabels.join('、')])
              : tr("browser.pages.AutoConfigPage.AutoConfigPage.c43ccf9"),
          )
        } else if (evaluation.status === 'unavailable') {
          setFingerprintCheckStatus('unavailable')
          setFingerprintCheckMessage(
            evaluation.summary.isComparable
              ? tr("browser.pages.AutoConfigPage.AutoConfigPage.4ff0eb2")
              : tr("browser.pages.AutoConfigPage.AutoConfigPage.c82eda2"),
          )
        } else {
          setFingerprintCheckStatus('passed')
          setFingerprintCheckMessage(
            tr("browser.pages.AutoConfigPage.AutoConfigPage.cbc7268", [evaluation.summary.matchCount, evaluation.summary.compatibleCount ? tr("browser.pages.AutoConfigPage.AutoConfigPage.9359f5f", [evaluation.summary.compatibleCount]) : '']),
          )
        }
      } catch (error: unknown) {
        setFingerprintCheckStatus('unavailable')
        setFingerprintCheckMessage(tr("browser.pages.AutoConfigPage.AutoConfigPage.ae76fc9", [resolveErrorMessage(error, tr("browser.pages.AutoConfigPage.AutoConfigPage.1fcce77"))]))
      }

      setOperationStatus('success')
      setOperationMessage(
        fingerprintOutcome === 'failed'
          ? tr("browser.pages.AutoConfigPage.AutoConfigPage.b44fb99")
          : fingerprintOutcome === 'unavailable'
            ? tr("browser.pages.AutoConfigPage.AutoConfigPage.0b3a45a")
            : tr("browser.pages.AutoConfigPage.AutoConfigPage.e9c604b"),
      )
      toast.success(tr("browser.pages.AutoConfigPage.AutoConfigPage.8b5a5ce", [started.profileName ? `：${started.profileName}` : '']))
    } catch (error: unknown) {
      setFingerprintCheckStatus('idle')
      setOperationStatus('error')
      setOperationMessage(resolveErrorMessage(error, tr("browser.pages.AutoConfigPage.AutoConfigPage.bc8c176")))
      toast.error(resolveErrorMessage(error, tr("browser.pages.AutoConfigPage.AutoConfigPage.176529e")))
    }
  }

  const handleCreateAndLaunch = async () => {
    const draft = buildDraft()
    if (!draft || !fingerprintMode || !baseline || !recommendation || !networkMode) return
    if (networkMode === 'proxy' && !settings) {
      setOperationStatus('error')
      setOperationMessage(settingsLoadError || tr("browser.pages.AutoConfigPage.AutoConfigPage.139115d"))
      return
    }
    if (!isAutoConfigProxyReady(networkMode, proxySource, proxyId, proxyConfig)) {
      setOperationStatus('error')
      setOperationMessage(proxySource === 'pool' ? tr("browser.pages.AutoConfigPage.AutoConfigPage.9c840d3") : tr("browser.pages.AutoConfigPage.AutoConfigPage.f2a14c9"))
      return
    }

    setOperationStatus('loading')
    setOperationMessage(tr("browser.pages.AutoConfigPage.AutoConfigPage.b32fcb3"))
    setFingerprintCheckStatus('idle')
    setFingerprintCheckMessage('')

    try {
      const input = buildAutoConfigProfileInput({
        baseline,
        fingerprintMode,
        networkMode,
        recommendation,
        settings: settings || {
          userDataRoot: 'data',
          defaultFingerprintArgs: [],
          defaultLaunchArgs: [],
          defaultStartUrls: [],
          lightStartEnabled: true,
          restoreLastSession: false,
          startReadyTimeoutMs: 3000,
          startStableWindowMs: 1200,
          defaultConnectorType: 'xray',
        },
        proxyId: proxySource === 'pool' ? proxyId : '',
        proxyConfig: proxySource === 'custom' ? proxyConfig : '',
      })
      const fingerprintValidation = validateFingerprintArgs(input.fingerprintArgs)
      const fingerprintErrors = fingerprintValidation.issues
        .filter((issue) => issue.level === 'error')
        .map((issue) => issue.message)
      if (fingerprintErrors.length > 0) {
        throw new Error(fingerprintErrors.join('\n'))
      }

      const proxyValidation = await validateProxyConfig(input.proxyConfig, input.proxyId)
      if (!proxyValidation.supported) {
        throw new Error(proxyValidation.errorMsg || tr("browser.pages.AutoConfigPage.AutoConfigPage.3adabf7"))
      }

      if (networkMode === 'proxy') {
        setOperationMessage(tr("browser.pages.AutoConfigPage.AutoConfigPage.4275964"))
        const connectivity = proxySource === 'pool'
          ? await testProxyRealConnectivity(input.proxyId)
          : await testProxyRealConnectivityWithConfig('', input.proxyConfig)
        if (!connectivity.ok) {
          throw new Error(connectivity.error || tr("browser.pages.AutoConfigPage.AutoConfigPage.916996b"))
        }
      }

      setOperationMessage(tr("browser.pages.AutoConfigPage.AutoConfigPage.cd6bad9"))
      const created = await createBrowserProfile(input)
      if (!created?.profileId) throw new Error(tr("browser.pages.AutoConfigPage.AutoConfigPage.13fe974"))
      setCreatedProfile(created)
      persistDraft(draft)
      await handleStartCreatedProfile(created.profileId)
    } catch (error: unknown) {
      setFingerprintCheckStatus('idle')
      setOperationStatus('error')
      setOperationMessage(resolveErrorMessage(error, tr("browser.pages.AutoConfigPage.AutoConfigPage.a2cb055")))
      toast.error(resolveErrorMessage(error, tr("browser.pages.AutoConfigPage.AutoConfigPage.a2cb055")))
    }
  }

  const handleReset = () => {
    setStep(0)
    setNetworkMode(null)
    setBaseline(null)
    setFingerprintMode(null)
    setProxySource('pool')
    setProxyId(proxies[0]?.proxyId || '')
    setProxyConfig('')
    setCreatedProfile(null)
    setOperationStatus('idle')
    setOperationMessage('')
    setFingerprintCheckStatus('idle')
    setFingerprintCheckMessage('')
  }

  const currentSavedAt = savedDraft?.savedAt ? formatCapturedAt(savedDraft.savedAt) : ''
  const selectedProxy = proxies.find((proxy) => proxy.proxyId === proxyId)
  const proxySummary = networkMode === 'direct'
    ? tr("browser.pages.AutoConfigPage.AutoConfigPage.4f18702")
    : proxySource === 'pool'
      ? selectedProxy?.proxyName || tr("browser.pages.AutoConfigPage.AutoConfigPage.7a15f6d")
      : tr("browser.pages.AutoConfigPage.AutoConfigPage.f251e47")
  const operationBusy = operationStatus === 'loading'
  const [discardOpen, setDiscardOpen] = useState(false)
  const handleCancel = () => {
    if (operationBusy) return
    const draft = buildDraft()
    const comparable = (value: AutoConfigDraft) => JSON.stringify({ ...value, savedAt: '' })
    const matchesSaved = draft && savedDraft && !proxyConfig.trim() && comparable(sanitizeAutoConfigDraft(draft)) === comparable(savedDraft)
    const entered = Boolean(networkMode || baseline || fingerprintMode || proxyConfig.trim())
    if (!createdProfile && entered && !matchesSaved) setDiscardOpen(true)
    else navigate('/browser/list')
  }
  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('[role="dialog"]')) {
        event.preventDefault()
        handleCancel()
      }
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [handleCancel])


  return (
    <div className="apple-page mx-auto w-full max-w-5xl pb-12">
      <WorkspaceHeader

        title={tr("browser.components.BrowserListLayout.text.9c614ae")}

        actions={(
          <Button type="button" variant="ghost" size="sm" onClick={handleCancel} disabled={operationBusy}>
            <X className="h-4 w-4" />{tr("App.CloseConfirmModal.4d0b468")}</Button>
        )}
      />


      {savedDraft && operationStatus === 'idle' && !createdProfile && (
        <section
          aria-labelledby="auto-config-draft-title"
          className="mt-5 flex flex-col gap-4 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-accent)]" />
            <div>
              <h2 id="auto-config-draft-title" className="text-sm font-semibold text-[var(--color-text-primary)]">{tr("browser.pages.AutoConfigPage.text.adcea34")}</h2>
              <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
                {currentSavedAt ? tr("browser.pages.AutoConfigPage.AutoConfigPage.83f9682", [currentSavedAt]) : ''}
                {savedDraft.proxyConfigRedacted
                  ? tr("browser.pages.AutoConfigPage.AutoConfigPage.ff06fd1")
                  : tr("browser.pages.AutoConfigPage.AutoConfigPage.b673fec")}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={handleRestoreDraft} disabled={operationBusy}>{tr("browser.pages.AutoConfigPage.text.95ba071")}</Button>
            <Button type="button" variant="ghost" size="sm" onClick={handleClearDraft} disabled={operationBusy}>{tr("browser.components.InstanceFilterBar.text.7b15e5e")}</Button>
          </div>
        </section>
      )}

      <nav aria-label={tr("browser.pages.AutoConfigPage.aria_label.9d1880b")} className="mb-8 mt-6">
        <ol className="grid grid-cols-4 gap-2 font-mono">
          {STEPS.map((item, index) => {
            const isCurrent = index === step
            const isComplete = index < step
            return (
              <li key={item.eyebrow}>
                <button
                  type="button"
                  onClick={() => index <= step && setStep(index)}
                  disabled={index > step || operationBusy}
                  className="flex w-full items-center gap-3 rounded-full px-2 py-2 text-left disabled:cursor-default disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                  aria-current={isCurrent ? "step" : undefined}
                >
                  <span
                    className={[
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs',
                      isComplete || isCurrent
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-[var(--color-accent)]'
                        : 'border-[var(--color-border-default)] text-[var(--color-text-muted)]',
                    ].join(' ')}
                  >
                    {isComplete ? <Check className="h-3.5 w-3.5" /> : item.eyebrow}
                  </span>
                  <span className={isCurrent ? 'text-xs font-semibold text-[var(--color-text-primary)]' : 'text-xs text-[var(--color-text-muted)]'}>
                    {item.label}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>

      </nav>

      {step === 0 && (
        <section aria-label={tr("browser.pages.AutoConfigPage.label.5d8cb1f")}>
          <div className="grid gap-4 md:grid-cols-2" role="radiogroup" aria-label={tr("browser.pages.AutoConfigPage.label.5d8cb1f")}>
            <SelectionOption
              title={tr("browser.pages.AutoConfigPage.proxy.b168ef4")}
              description=""
              icon={Network}
              selected={networkMode === 'proxy'}
              onSelect={() => setNetworkMode('proxy')}

            />
            <SelectionOption
              title={tr("browser.pages.AutoConfigPage.direct.a7dd3b6")}
              description={tr("browser.pages.AutoConfigPage.description.dab36cd")}
              icon={Wifi}
              selected={networkMode === 'direct'}
              onSelect={() => setNetworkMode('direct')}
            />
          </div>
          {networkMode === 'proxy' && (
            <div className="mt-5 rounded-sm border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-4" aria-label={tr("browser.pages.AutoConfigPage.aria_label.d03acac")}>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={tr("browser.pages.AutoConfigPage.aria_label.bf9181d")}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={proxySource === 'pool'}
                  onClick={() => setProxySource('pool')}
                  className={[
                    'rounded-full border px-3 py-2 text-xs font-medium transition-[background-color,border-color,color] duration-150',
                    proxySource === 'pool'
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-[var(--color-accent)]'
                      : 'border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]',
                  ].join(' ')}
                >{tr("browser.pages.AutoConfigPage.text.8fcd5eb")}</button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={proxySource === 'custom'}
                  onClick={() => setProxySource('custom')}
                  className={[
                    'rounded-full border px-3 py-2 text-xs font-medium transition-[background-color,border-color,color] duration-150',
                    proxySource === 'custom'
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-[var(--color-accent)]'
                      : 'border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]',
                  ].join(' ')}
                >{tr("browser.pages.AutoConfigPage.text.c4a8bbd")}</button>
              </div>
              {proxySource === 'pool' ? (
                <div className="mt-4">
                  <label htmlFor="auto-config-proxy" className="mb-2 block text-xs font-medium text-[var(--color-text-secondary)]">{tr("browser.pages.AutoConfigPage.text.313f10d")}</label>
                  <select
                    id="auto-config-proxy"
                    value={proxyId}
                    onChange={(event) => setProxyId(event.target.value)}
                    disabled={proxyLoading || proxies.length === 0}
                    className="h-10 w-full rounded-sm border border-[var(--color-border-default)] bg-[var(--color-bg-base)] px-3 text-sm text-[var(--color-text-primary)] outline-none transition-[border-color,box-shadow] focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="">{proxyLoading ? tr("browser.pages.AutoConfigPage.AutoConfigPage.2cac33e") : proxies.length ? tr("browser.pages.AutoConfigPage.AutoConfigPage.1f5e069") : tr("browser.pages.AutoConfigPage.AutoConfigPage.bfceb3d")}</option>
                    {proxies.map((proxy) => (
                      <option key={proxy.proxyId} value={proxy.proxyId}>
                        {proxy.proxyName || proxy.proxyId}{proxy.groupName ? ` · ${proxy.groupName}` : ''}
                      </option>
                    ))}
                  </select>
                  {proxyLoadError && <p className="mt-2 text-xs text-[var(--color-warning)]">{translateMessage(proxyLoadError)}</p>}
                  {!proxyLoading && !proxies.length && !proxyLoadError && (
                    <p className="mt-2 text-xs text-[var(--color-text-muted)]">{tr("browser.pages.AutoConfigPage.text.9fb43d1")}</p>
                  )}
                </div>
              ) : (
                <div className="mt-4">
                  <label htmlFor="auto-config-proxy-config" className="mb-2 block text-xs font-medium text-[var(--color-text-secondary)]">{tr("browser.components.ProxyPickerModal.edit.label.6c9e697")}</label>
                  <textarea
                    id="auto-config-proxy-config"
                    value={proxyConfig}
                    onChange={(event) => setProxyConfig(event.target.value)}
                    rows={4}
                    placeholder={tr("browser.pages.AutoConfigPage.placeholder.1c709e6")}
                    className="w-full resize-y rounded-sm border border-[var(--color-border-default)] bg-[var(--color-bg-base)] px-3 py-2 font-mono text-xs leading-5 text-[var(--color-text-primary)] outline-none transition-[border-color,box-shadow] focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
                  />
                </div>
              )}
            </div>
          )}
          {settingsLoadError && (
            <div className="mt-4 flex items-start gap-3 rounded-sm border border-[var(--color-warning)]/45 bg-[var(--color-bg-subtle)] px-4 py-3 text-xs leading-5 text-[var(--color-text-secondary)]" role="status">
              <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning)]" />
              <span>{translateMessage(settingsLoadError)}</span>
            </div>
          )}
        </section>
      )}

      {step === 1 && (
        <section aria-label={tr("browser.pages.AutoConfigPage.label.382aa54")}>
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <Button type="button" variant="secondary" size="sm" onClick={() => setBaseline(captureDeviceBaseline())}>
              <RefreshCw className="h-4 w-4" />{tr("browser.pages.AutoConfigPage.text.7784972")}</Button>
          </div>
          {!baseline ? (
            <TerminalPanel title={tr("browser.pages.AutoConfigPage.label.382aa54")} meta={tr("browser.pages.AutoConfigPage.meta.62e5156")}>
              <div className="flex items-center gap-3 p-4 text-sm text-[var(--color-text-secondary)]">
                <Monitor className="h-5 w-5 text-[var(--color-accent)]" />{tr("browser.pages.AutoConfigPage.text.a959603")}</div>
            </TerminalPanel>
          ) : (
            <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
              <TerminalPanel title={tr("browser.pages.AutoConfigPage.title.5c8b1d4")} meta={tr("browser.pages.AutoConfigPage.AutoConfigPage.c10194d", [formatCapturedAt(baseline.capturedAt)])}>
                <dl className="px-4">
                  <DetailRow label={tr("browser.pages.AutoConfigPage.label.88d650d")} value={baseline.browserFamily} />
                  <DetailRow label={tr("browser.components.FingerprintPanel.label.e4b9d69")} value={baseline.platform} />
                  <DetailRow label={tr("browser.components.FingerprintPanel.label.cd99b22")} value={baseline.languages.length ? baseline.languages.join(', ') : baseline.language} />
                  <DetailRow label={tr("browser.components.FingerprintPanel.label.fb2a23d")} value={baseline.timezone} />
                  <DetailRow label={tr("browser.pages.AutoConfigPage.label.c68cb70")} value={`${baseline.screenWidth} × ${baseline.screenHeight} / DPR ${baseline.pixelRatio}`} mono />
                  <DetailRow label={tr("browser.pages.AutoConfigPage.label.23a42e6")} value={`${baseline.viewportWidth} × ${baseline.viewportHeight}`} mono />
                </dl>
              </TerminalPanel>
              <TerminalPanel title={tr("browser.pages.AutoConfigPage.title.93a85c0")} meta={tr("browser.pages.AutoConfigPage.meta.29935be")}>
                <dl className="px-4">
                  <DetailRow label={tr("browser.pages.AutoConfigPage.label.fe5e640")} value={baseline.hardwareConcurrency ? `${baseline.hardwareConcurrency}` : tr("browser.pages.AutoConfigPage.AutoConfigPage.071fb24")} mono />
                  <DetailRow label={tr("browser.pages.AutoConfigPage.label.063c974")} value={baseline.deviceMemory ? `${baseline.deviceMemory} GB` : tr("browser.pages.AutoConfigPage.AutoConfigPage.071fb24")} mono />
                  <DetailRow label={tr("browser.pages.AutoConfigPage.label.f79e991")} value={baseline.colorDepth ? `${baseline.colorDepth} bit` : tr("browser.pages.AutoConfigPage.AutoConfigPage.071fb24")} mono />
                  <DetailRow label={tr("browser.pages.AutoConfigPage.label.e8e82c9")} value={`${baseline.touchPoints}`} mono />
                  <DetailRow label={tr("browser.pages.AutoConfigPage.label.709e0b2")} value={baseline.userAgent} mono />
                </dl>
              </TerminalPanel>
            </div>
          )}
        </section>
      )}

      {step === 2 && (
        <section aria-label={tr("browser.pages.AutoConfigPage.label.a03c568")}>
          <div className="space-y-3" role="radiogroup" aria-label={tr("browser.pages.AutoConfigPage.label.a03c568")}>
            <SelectionOption
              title={tr("browser.pages.AutoConfigPage.fixed.0467103")}
              description={tr('fingerprint.compatibility')}
              icon={LockKeyhole}
              selected={fingerprintMode === 'fixed'}
              onSelect={() => setFingerprintMode('fixed')}

            />

          </div>

        </section>
      )}

      {step === 3 && baseline && networkMode && fingerprintMode && recommendation && (
        <section aria-label={tr("browser.pages.AutoConfigPage.label.6d55107")}>
          <TerminalPanel
            title={tr("browser.pages.AutoConfigPage.title.35f1dd1")}
            meta={<Badge variant="warning" dot>{tr("browser.pages.AutoConfigPage.text.e0ecb79")}</Badge>}
          >
            <div className="px-4">
              <div className="border-b border-[var(--color-border-muted)] py-4">
                <Badge variant="default">{tr("browser.pages.AutoConfigPage.text.804f3f7")}{recommendation.signature}</Badge>
                <h3 className="mt-3 text-base font-semibold text-[var(--color-text-primary)]">{recommendation.profileName}</h3>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{fingerprintLabel[fingerprintMode]} · {networkLabel[networkMode]}</p>
              </div>
              <dl>
                <DetailRow label={tr("browser.pages.AutoConfigPage.label.5d8cb1f")} value={networkLabel[networkMode]} />
                <DetailRow label={tr("browser.pages.AutoConfigPage.aria_label.d03acac")} value={proxySummary} />
                <DetailRow label={tr("config.navigation.config.name.624647e")} value={connectorLabel[recommendation.connectorStack]} />
                <DetailRow label={tr("browser.pages.AutoConfigPage.label.a03c568")} value={fingerprintLabel[fingerprintMode]} />
                <DetailRow label={tr("browser.pages.AutoConfigPage.label.47a991d")} value={`${recommendation.osFamily} · ${recommendation.hardwareClass}`} />
                <DetailRow label={tr("browser.copyOptions.detail.85653bc")} value={`${recommendation.locale} · ${recommendation.timezone}`} mono />
                <DetailRow label={tr("browser.pages.AutoConfigPage.label.23a42e6")} value={recommendation.viewport} mono />
              </dl>
            </div>
          </TerminalPanel>
          <details className="mt-4 rounded-sm border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
            <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]">{tr("browser.pages.AutoConfigPage.text.d28c05e")}<span className="ml-2 text-xs font-normal text-[var(--color-text-muted)]">{tr("browser.pages.AutoConfigPage.text.6c8aa43")}</span>
            </summary>
            <div className="border-t border-[var(--color-border-muted)] px-5 py-4">
              <ul className="space-y-2 text-sm leading-6 text-[var(--color-text-secondary)]">
                {recommendation.consistencyChecks.map((check) => (
                  <li key={check} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[var(--color-success)]" />
                    <span>{check}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 flex items-start gap-2 border-t border-[var(--color-border-muted)] pt-4 text-xs leading-5 text-[var(--color-text-muted)]">
                <Fingerprint className="mt-0.5 h-4 w-4 shrink-0" />{tr("browser.pages.AutoConfigPage.text.fc5fc1c")}</p>
            </div>
          </details>
          {operationStatus !== 'idle' && (
            <div
              className={[
                'mt-4 flex items-start gap-3 rounded-sm border px-4 py-3 text-sm leading-6',
                operationStatus === 'success'
                  ? 'border-[var(--color-success)] bg-[var(--color-success)]/10 text-[var(--color-text-secondary)]'
                  : operationStatus === 'error'
                    ? 'border-[var(--color-error)] bg-[var(--color-error)]/10 text-[var(--color-text-secondary)]'
                    : 'border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-[var(--color-text-secondary)]',
              ].join(' ')}
              role={operationStatus === 'error' ? "alert" : "status"}
            >
              {operationStatus === 'success' ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-success)]" />
              ) : operationStatus === 'error' ? (
                <X className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-error)]" />
              ) : (
                <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[var(--color-accent)]" />
              )}
              <div className="min-w-0 flex-1">
                <p>{translateMessage(operationMessage)}</p>
                {createdProfile && operationStatus === 'success' && (
                  <p className="mt-1 font-mono text-xs text-[var(--color-text-muted)]">{tr("browser.pages.AutoConfigPage.text.054f435")}{createdProfile.profileId}</p>
                )}
                {fingerprintCheckMessage && (
                  <p className="mt-2 text-xs text-[var(--color-text-muted)]">{tr("browser.pages.AutoConfigPage.text.8703cc2")}<span
                      className={[
                        'ml-1 font-medium',
                        fingerprintCheckStatus === 'passed'
                          ? 'text-[var(--color-success)]'
                          : fingerprintCheckStatus === 'failed'
                            ? 'text-[var(--color-error)]'
                            : fingerprintCheckStatus === 'checking'
                              ? 'text-[var(--color-accent)]'
                              : 'text-[var(--color-text-secondary)]',
                      ].join(' ')}
                    >
                      {fingerprintCheckStatus === 'passed'
                        ? tr("browser.pages.AutoConfigPage.AutoConfigPage.4b3c965")
                        : fingerprintCheckStatus === 'failed'
                          ? tr("browser.pages.AutoConfigPage.AutoConfigPage.eaae113")
                          : fingerprintCheckStatus === 'checking'
                            ? tr("browser.pages.AutoConfigPage.AutoConfigPage.9908c92")
                            : fingerprintCheckStatus === 'unavailable'
                              ? tr("browser.pages.AutoConfigPage.AutoConfigPage.beff4a1")
                              : tr("browser.pages.AutoConfigPage.AutoConfigPage.ed9ec81")}
                    </span>
                    {' · '}
                    {translateMessage(fingerprintCheckMessage)}
                    <span className="mt-1 block">{tr("browser.pages.AutoConfigPage.text.87e43b2")}</span>
                  </p>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      <footer className="mt-8 flex flex-col-reverse gap-3 border-t border-[var(--color-border-muted)] pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {step > 0 ? (
            <Button type="button" variant="ghost" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={operationBusy}>
              <ArrowLeft className="h-4 w-4" />{tr("browser.pages.AutoConfigPage.text.75ef124")}</Button>
          ) : (
            <Button type="button" variant="ghost" onClick={handleCancel} disabled={operationBusy}>{tr("browser.pages.AutoConfigPage.text.82a0afa")}</Button>
          )}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          {step === 3 && (savedDraft || createdProfile) ? (
            <Button type="button" variant="secondary" onClick={handleReset} disabled={operationBusy}>{tr("browser.pages.AutoConfigPage.text.737d065")}</Button>
          ) : null}
          {step < 3 ? (
            <Button type="button" onClick={() => setStep((current) => Math.min(STEPS.length - 1, current + 1))} disabled={!canContinue}>{tr("browser.pages.AutoConfigPage.text.1fc1afc")}<ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <>
              <Button type="button" variant="secondary" onClick={handleSaveDraft} disabled={!canContinue || operationBusy}>
                <Check className="h-4 w-4" />
                {savedDraft ? tr("browser.pages.AutoConfigPage.AutoConfigPage.b8bd077") : tr("browser.pages.AutoConfigPage.AutoConfigPage.4cd30ef")}
              </Button>
              {createdProfile && operationStatus === 'error' ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleStartCreatedProfile(createdProfile.profileId)}
                  loading={operationBusy}
                >
                  <RefreshCw className="h-4 w-4" />{tr("browser.pages.AutoConfigPage.text.aa4d0c9")}</Button>
              ) : null}
              <Button
                type="button"
                onClick={() => void handleCreateAndLaunch()}
                disabled={!canContinue || operationBusy || operationStatus === 'success' || (networkMode === 'proxy' && !settings)}
                loading={operationBusy}
              >
                <Wand2 className="h-4 w-4" />{tr("browser.pages.AutoConfigPage.text.86fa54f")}</Button>
              {createdProfile && operationStatus === 'success' ? (
                <Button type="button" variant="primary" onClick={handleCancel} disabled={operationBusy}>{tr("browser.pages.AutoConfigPage.text.02f5287")}<ArrowRight className="h-4 w-4" />
                </Button>
              ) : null}
            </>
          )}
        </div>
      </footer>


      <ConfirmModal open={discardOpen} onClose={() => setDiscardOpen(false)} onConfirm={() => navigate('/browser/list')} title={tr('setup.discardTitle')} content={tr('setup.discardBody')} confirmText={tr('setup.discard')} />

    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  HelpCircle,
  Fingerprint,
  Globe2,
  LockKeyhole,
  Monitor,
  Network,
  RefreshCw,
  ShieldCheck,
  Shuffle,
  Wand2,
  Wifi,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Badge, Button, Progress, toast } from '../../../shared/components'
import { TelemetryStrip, TerminalPanel, WorkspaceHeader } from '../../../shared/components/SignalPrimitives'
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

const STEPS = [
  { eyebrow: '01', label: '网络入口' },
  { eyebrow: '02', label: '设备基线' },
  { eyebrow: '03', label: '指纹策略' },
  { eyebrow: '04', label: '确认并创建' },
]

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
      ? '高性能桌面'
      : baseline.hardwareConcurrency >= 4
        ? '标准桌面'
        : '轻量设备'
    : '保守兼容'
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
      `语言 ${locale} 与时区 ${baseline.timezone} 保持同一地区逻辑`,
      `视口 ${viewport} 与屏幕 ${baseline.screenWidth} × ${baseline.screenHeight} 对齐`,
      `${baseline.browserFamily} 与 ${osFamily} 的 UA 组合保持一致`,
    ],
  }
}

const connectorLabel: Record<ConnectorStack, string> = {
  xray: 'Xray + sing-box 组合栈',
  mihomo: '独立 Mihomo 栈',
  none: '直连，不启用代理内核',
}

const networkLabel: Record<NetworkMode, string> = {
  proxy: '使用代理',
  direct: '直连',
}

const fingerprintLabel: Record<FingerprintMode, string> = {
  fixed: '固定指纹',
  'constrained-random': '约束随机（预览）',
}

const formatCapturedAt = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN')
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
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={[
        'group w-full rounded-sm border p-4 text-left transition-[background-color,border-color,color,transform] duration-150 active:translate-y-px',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]',

        selected
          ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)]'
          : 'border-[var(--color-border-default)] bg-[var(--color-bg-surface)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-elevated)]',
      ].join(' ')}
    >
      <span className="flex items-start justify-between gap-4">
        <span
          className={[
            'flex h-9 w-9 items-center justify-center rounded-sm border',
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
            'mt-1 flex h-4 w-4 items-center justify-center rounded-sm border',
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
        <span className="mt-2 block text-sm leading-6 text-[var(--color-text-secondary)]">{description}</span>
      </span>
    </button>
  )
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-[var(--color-border-muted)] py-3 last:border-b-0">
      <dt className="shrink-0 text-xs uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{label}</dt>
      <dd className={mono ? 'max-w-[70%] break-words text-right font-mono text-xs text-[var(--color-text-secondary)]' : 'max-w-[70%] text-right text-sm text-[var(--color-text-primary)]'}>
        {value}
      </dd>
    </div>
  )
}

export function AutoConfigPage() {
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
    [baseline, networkMode, settings?.defaultConnectorType],
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
          setSettingsLoadError('全局连接栈读取失败。直连仍可继续；代理模式需要先确认后端设置。')
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
          setProxyLoadError(error instanceof Error ? error.message : '代理池加载失败，可改用自定义配置')
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
          ? '自动配置草稿已保存；自定义代理内容不会写入本地存储，恢复后需要重新输入'
          : '自动配置草稿已保存',
      )
    } else {
      toast.warning('当前环境不允许本地存储，配置仍可继续创建')
    }
  }

  const handleRestoreDraft = () => {
    if (!savedDraft) return

    const requiresProxyEntry = savedDraft.networkMode === 'proxy' && savedDraft.proxyConfigRedacted
    setNetworkMode(savedDraft.networkMode)
    setBaseline(savedDraft.baseline)
    setFingerprintMode(savedDraft.fingerprintMode)
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
        ? '草稿已恢复；为保护代理凭据，请重新输入自定义代理配置'
        : '自动配置草稿已恢复',
    )
  }

  const handleClearDraft = () => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.removeItem(STORAGE_KEY)
      setSavedDraft(null)
      toast.success('自动配置草稿已清除')
    } catch {
      toast.warning('当前环境不允许清除本地草稿，请稍后重试')
    }
  }

  const resolveErrorMessage = (error: unknown, fallback: string) => (
    error instanceof Error && error.message ? error.message : typeof error === 'string' ? error : fallback
  )

  const handleStartCreatedProfile = async (profileId: string) => {
    setOperationStatus('loading')
    setOperationMessage('正在启动实例并等待调试端口就绪…')
    setFingerprintCheckStatus('checking')
    setFingerprintCheckMessage('')

    try {
      const started = await startBrowserInstance(profileId)
      if (!started) throw new Error('实例启动后没有返回运行状态')
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
              ? `发现不一致：${mismatchLabels.join('、')}`
              : '运行时检查发现需要复核的指纹项',
          )
        } else if (evaluation.status === 'unavailable') {
          setFingerprintCheckStatus('unavailable')
          setFingerprintCheckMessage(
            evaluation.summary.isComparable
              ? '运行时已采集，但部分配置项无法读取，请进入实例详情复核。'
              : '运行时已采集，但当前环境没有足够的配置期望值可比较。',
          )
        } else {
          setFingerprintCheckStatus('passed')
          setFingerprintCheckMessage(
            `快速字段检查通过：${evaluation.summary.matchCount} 项一致${evaluation.summary.compatibleCount ? `，${evaluation.summary.compatibleCount} 项兼容` : ''}`,
          )
        }
      } catch (error: unknown) {
        setFingerprintCheckStatus('unavailable')
        setFingerprintCheckMessage(`实例已启动，指纹自测暂不可用：${resolveErrorMessage(error, '稍后可在实例详情中重试')}`)
      }

      setOperationStatus('success')
      setOperationMessage(
        fingerprintOutcome === 'failed'
          ? '实例已创建并启动，但指纹自测发现不一致，请进入实例详情复核。'
          : fingerprintOutcome === 'unavailable'
            ? '实例已创建并启动；快速检查未完成，请稍后在实例详情复核。'
            : '实例已创建并启动，可以开始使用。',
      )
      toast.success(`实例已启动${started.profileName ? `：${started.profileName}` : ''}`)
    } catch (error: unknown) {
      setFingerprintCheckStatus('idle')
      setOperationStatus('error')
      setOperationMessage(resolveErrorMessage(error, '实例启动失败；配置已保留，可稍后重试'))
      toast.error(resolveErrorMessage(error, '实例启动失败'))
    }
  }

  const handleCreateAndLaunch = async () => {
    const draft = buildDraft()
    if (!draft || !fingerprintMode || !baseline || !recommendation || !networkMode) return
    if (networkMode === 'proxy' && !settings) {
      setOperationStatus('error')
      setOperationMessage(settingsLoadError || '无法读取全局连接栈设置，暂不创建代理实例。')
      return
    }
    if (!isAutoConfigProxyReady(networkMode, proxySource, proxyId, proxyConfig)) {
      setOperationStatus('error')
      setOperationMessage(proxySource === 'pool' ? '请选择一个代理池节点后再创建。' : '请输入代理配置后再创建。')
      return
    }

    setOperationStatus('loading')
    setOperationMessage('正在校验指纹与代理配置…')
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
        throw new Error(proxyValidation.errorMsg || '代理配置无效')
      }

      if (networkMode === 'proxy') {
        setOperationMessage('正在测试代理连通性…')
        const connectivity = proxySource === 'pool'
          ? await testProxyRealConnectivity(input.proxyId)
          : await testProxyRealConnectivityWithConfig('', input.proxyConfig)
        if (!connectivity.ok) {
          throw new Error(connectivity.error || '代理连通性检查失败，请检查节点或配置')
        }
      }

      setOperationMessage('正在创建浏览器实例…')
      const created = await createBrowserProfile(input)
      if (!created?.profileId) throw new Error('后端没有返回新实例 ID')
      setCreatedProfile(created)
      persistDraft(draft)
      await handleStartCreatedProfile(created.profileId)
    } catch (error: unknown) {
      setFingerprintCheckStatus('idle')
      setOperationStatus('error')
      setOperationMessage(resolveErrorMessage(error, '自动配置创建失败'))
      toast.error(resolveErrorMessage(error, '自动配置创建失败'))
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
    ? '不使用代理'
    : proxySource === 'pool'
      ? selectedProxy?.proxyName || '代理池节点未选择'
      : '自定义配置（内容已隐藏）'
  const operationBusy = operationStatus === 'loading'

  const telemetryItems = [
    { label: '当前步骤', value: `${step + 1} / ${STEPS.length}`, detail: STEPS[step].label, tone: 'accent' as const },
    { label: '网络入口', value: networkMode ? networkLabel[networkMode] : '待选择' },
    {
      label: '连接栈',
      value: networkMode === 'direct' ? connectorLabel.none : settingsLoadError ? '读取失败' : recommendation ? connectorLabel[recommendation.connectorStack] : settings ? connectorLabel[getConnectorStack(settings.defaultConnectorType)] : '读取中',
      tone: settingsLoadError ? 'warning' as const : 'neutral' as const,
    },
    { label: '指纹策略', value: fingerprintMode ? fingerprintLabel[fingerprintMode] : '待选择' },
  ]

  return (
    <div className="apple-page mx-auto w-full max-w-5xl pb-12">
      <WorkspaceHeader
        eyebrow="INSTANCE / SETUP"
        title="自动配置实例"
        description="按网络、设备、指纹和确认四步完成。"
        actions={(
          <Button type="button" variant="ghost" size="sm" onClick={() => navigate('/browser/list')}>
            <X className="h-4 w-4" />
            取消
          </Button>
        )}
      />
      <TelemetryStrip items={telemetryItems} className="mt-4" />

      {savedDraft && (
        <section
          aria-labelledby="auto-config-draft-title"
          className="mt-5 flex flex-col gap-4 rounded-sm border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-accent)]" />
            <div>
              <h2 id="auto-config-draft-title" className="text-sm font-semibold text-[var(--color-text-primary)]">
                已找到自动配置草稿
              </h2>
              <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
                {currentSavedAt ? `保存于 ${currentSavedAt}。` : ''}
                {savedDraft.proxyConfigRedacted
                  ? ' 自定义代理内容未保存，恢复后需要重新输入。'
                  : ' 可以恢复到确认步骤继续。'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={handleRestoreDraft} disabled={operationBusy}>
              恢复草稿
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={handleClearDraft} disabled={operationBusy}>
              清除
            </Button>
          </div>
        </section>
      )}

      <nav aria-label="自动配置步骤" className="mb-8 mt-6">
        <ol className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {STEPS.map((item, index) => {
            const isCurrent = index === step
            const isComplete = index < step
            return (
              <li key={item.eyebrow}>
                <button
                  type="button"
                  onClick={() => index <= step && setStep(index)}
                  disabled={index > step}
                  className="flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left disabled:cursor-default disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  <span
                    className={[
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border font-mono text-[10px]',
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
        <Progress percent={((step + 1) / STEPS.length) * 100} showInfo={false} size="sm" className="mt-3" />
      </nav>

      {step === 0 && (
        <section aria-labelledby="network-choice-title">
          <div className="mb-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">网络 / 入口</p>
            <h2 id="network-choice-title" className="mt-2 text-lg font-semibold text-[var(--color-text-primary)]">网络入口</h2>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">选择代理或直连。代理模式需先选节点或填写配置。</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2" role="radiogroup" aria-label="网络入口">
            <SelectionOption
              title="使用代理"
              description="从代理池或自定义配置接入。"
              icon={Network}
              selected={networkMode === 'proxy'}
              onSelect={() => setNetworkMode('proxy')}
              badge="推荐给多实例"
            />
            <SelectionOption
              title="直连"
              description="使用当前网络，不启动代理内核。"
              icon={Wifi}
              selected={networkMode === 'direct'}
              onSelect={() => setNetworkMode('direct')}
            />
          </div>
          {networkMode === 'proxy' && (
            <div className="mt-5 rounded-sm border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-4" aria-label="代理来源">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">代理来源</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">先选一个真实来源，创建前会执行代理格式与连通性检查。</p>
                </div>
                <Badge variant={recommendation?.connectorStack === 'mihomo' ? 'warning' : 'info'} size="sm">
                  {connectorLabel[recommendation?.connectorStack || 'xray']}
                </Badge>
              </div>
              <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="代理来源类型">
                <button
                  type="button"
                  role="radio"
                  aria-checked={proxySource === 'pool'}
                  onClick={() => setProxySource('pool')}
                  className={[
                    'rounded-sm border px-3 py-2 text-xs font-medium transition-[background-color,border-color,color] duration-150',
                    proxySource === 'pool'
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-[var(--color-accent)]'
                      : 'border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]',
                  ].join(' ')}
                >
                  代理池节点
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={proxySource === 'custom'}
                  onClick={() => setProxySource('custom')}
                  className={[
                    'rounded-sm border px-3 py-2 text-xs font-medium transition-[background-color,border-color,color] duration-150',
                    proxySource === 'custom'
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-[var(--color-accent)]'
                      : 'border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]',
                  ].join(' ')}
                >
                  自定义配置
                </button>
              </div>
              {proxySource === 'pool' ? (
                <div className="mt-4">
                  <label htmlFor="auto-config-proxy" className="mb-2 block text-xs font-medium text-[var(--color-text-secondary)]">选择代理池节点</label>
                  <select
                    id="auto-config-proxy"
                    value={proxyId}
                    onChange={(event) => setProxyId(event.target.value)}
                    disabled={proxyLoading || proxies.length === 0}
                    className="h-10 w-full rounded-sm border border-[var(--color-border-default)] bg-[var(--color-bg-base)] px-3 text-sm text-[var(--color-text-primary)] outline-none transition-[border-color,box-shadow] focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="">{proxyLoading ? '正在读取代理池…' : proxies.length ? '请选择节点' : '暂无可用代理池节点'}</option>
                    {proxies.map((proxy) => (
                      <option key={proxy.proxyId} value={proxy.proxyId}>
                        {proxy.proxyName || proxy.proxyId}{proxy.groupName ? ` · ${proxy.groupName}` : ''}
                      </option>
                    ))}
                  </select>
                  {proxyLoadError && <p className="mt-2 text-xs text-[var(--color-warning)]">{proxyLoadError}</p>}
                  {!proxyLoading && !proxies.length && !proxyLoadError && (
                    <p className="mt-2 text-xs text-[var(--color-text-muted)]">还没有可用节点，可以切换到“自定义配置”。</p>
                  )}
                </div>
              ) : (
                <div className="mt-4">
                  <label htmlFor="auto-config-proxy-config" className="mb-2 block text-xs font-medium text-[var(--color-text-secondary)]">代理配置</label>
                  <textarea
                    id="auto-config-proxy-config"
                    value={proxyConfig}
                    onChange={(event) => setProxyConfig(event.target.value)}
                    rows={4}
                    placeholder="例如 socks5://user:password@host:port，或项目支持的代理配置格式"
                    className="w-full resize-y rounded-sm border border-[var(--color-border-default)] bg-[var(--color-bg-base)] px-3 py-2 font-mono text-xs leading-5 text-[var(--color-text-primary)] outline-none transition-[border-color,box-shadow] focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
                  />
                  <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-[var(--color-text-muted)]">
                    <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" />
                    <span>仅用于本次创建，不写入页面文案或指纹签名。</span>
                  </p>
                </div>
              )}
            </div>
          )}
          {settingsLoadError && (
            <div className="mt-4 flex items-start gap-3 rounded-sm border border-[var(--color-warning)]/45 bg-[var(--color-bg-subtle)] px-4 py-3 text-xs leading-5 text-[var(--color-text-secondary)]" role="status">
              <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning)]" />
              <span>{settingsLoadError}</span>
            </div>
          )}
          {networkMode !== 'proxy' && (
            <div className="mt-5 flex items-start gap-3 rounded-sm border border-[var(--color-accent)]/40 bg-[var(--color-bg-subtle)] px-4 py-3 text-sm leading-6 text-[var(--color-text-secondary)]">
              <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-accent)]" />
              <span>直连不启动代理内核；需要代理时在实例设置中切换。</span>
            </div>
          )}
        </section>
      )}

      {step === 1 && (
        <section aria-labelledby="baseline-title">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">设备 / 基线</p>
              <h2 id="baseline-title" className="mt-2 text-lg font-semibold text-[var(--color-text-primary)]">设备基线</h2>
              <p className="mt-2 text-sm text-[var(--color-text-secondary)]">读取桌面环境参数，用于生成初始指纹。</p>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={() => setBaseline(captureDeviceBaseline())}>
              <RefreshCw className="h-4 w-4" />
              重新读取
            </Button>
          </div>
          {!baseline ? (
            <TerminalPanel title="设备基线" meta="正在读取">
              <div className="flex items-center gap-3 p-4 text-sm text-[var(--color-text-secondary)]">
                <Monitor className="h-5 w-5 text-[var(--color-accent)]" />
                正在读取本机基线…
              </div>
            </TerminalPanel>
          ) : (
            <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
              <TerminalPanel title="环境摘要" meta={`读取于 ${formatCapturedAt(baseline.capturedAt)}`}>
                <dl className="px-4">
                  <DetailRow label="浏览器" value={baseline.browserFamily} />
                  <DetailRow label="平台" value={baseline.platform} />
                  <DetailRow label="语言" value={baseline.languages.length ? baseline.languages.join(', ') : baseline.language} />
                  <DetailRow label="时区" value={baseline.timezone} />
                  <DetailRow label="屏幕" value={`${baseline.screenWidth} × ${baseline.screenHeight} / DPR ${baseline.pixelRatio}`} mono />
                  <DetailRow label="视口" value={`${baseline.viewportWidth} × ${baseline.viewportHeight}`} mono />
                </dl>
              </TerminalPanel>
              <TerminalPanel title="硬件线索" meta="缺失项保持为空">
                <dl className="px-4">
                  <DetailRow label="并发线程" value={baseline.hardwareConcurrency ? `${baseline.hardwareConcurrency}` : '未提供'} mono />
                  <DetailRow label="设备内存" value={baseline.deviceMemory ? `${baseline.deviceMemory} GB` : '未提供'} mono />
                  <DetailRow label="色深" value={baseline.colorDepth ? `${baseline.colorDepth} bit` : '未提供'} mono />
                  <DetailRow label="触控点" value={`${baseline.touchPoints}`} mono />
                  <DetailRow label="UA 摘要" value={baseline.userAgent} mono />
                </dl>
              </TerminalPanel>
            </div>
          )}
        </section>
      )}

      {step === 2 && (
        <section aria-labelledby="fingerprint-title">
          <div className="mb-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">指纹 / 策略</p>
            <h2 id="fingerprint-title" className="mt-2 text-lg font-semibold text-[var(--color-text-primary)]">指纹策略</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">固定指纹，或预览约束随机策略。</p>
          </div>
          <div className="space-y-3" role="radiogroup" aria-label="指纹策略">
            <SelectionOption
              title="固定指纹"
              description="为实例保留同一套设备特征。"
              icon={LockKeyhole}
              selected={fingerprintMode === 'fixed'}
              onSelect={() => setFingerprintMode('fixed')}
              badge="稳定"
            />
            <SelectionOption
              title="约束随机（预览）"
              description="策略预览；当前仍使用已验证的默认参数。"
              icon={Shuffle}
              selected={fingerprintMode === 'constrained-random'}
              onSelect={() => setFingerprintMode('constrained-random')}
              badge="策略预览"
            />
          </div>
          <div className="mt-5 flex items-start gap-3 rounded-sm border border-[var(--color-warning)]/45 bg-[var(--color-bg-subtle)] px-4 py-3 text-sm leading-6 text-[var(--color-text-secondary)]">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning)]" />
            <span>固定指纹会直接使用一致参数；约束随机目前保留为策略标签，并沿用同一套已验证的默认参数，避免首次创建时产生未验证的随机字段。</span>
          </div>
        </section>
      )}

      {step === 3 && baseline && networkMode && fingerprintMode && recommendation && (
        <section aria-labelledby="review-title">
          <div className="mb-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">确认 / 创建</p>
            <h2 id="review-title" className="mt-2 text-lg font-semibold text-[var(--color-text-primary)]">确认实例</h2>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">写入配置，执行检查并启动。</p>
          </div>
          <TerminalPanel
            title="创建预览"
            meta={<Badge variant="warning" dot>待创建前校验</Badge>}
          >
            <div className="px-4">
              <div className="border-b border-[var(--color-border-muted)] py-4">
                <Badge variant="default">指纹签名 {recommendation.signature}</Badge>
                <h3 className="mt-3 text-base font-semibold text-[var(--color-text-primary)]">{recommendation.profileName}</h3>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{fingerprintLabel[fingerprintMode]} · {networkLabel[networkMode]}</p>
              </div>
              <dl>
                <DetailRow label="网络入口" value={networkLabel[networkMode]} />
                <DetailRow label="代理来源" value={proxySummary} />
                <DetailRow label="连接栈" value={connectorLabel[recommendation.connectorStack]} />
                <DetailRow label="指纹策略" value={fingerprintLabel[fingerprintMode]} />
                <DetailRow label="设备类型" value={`${recommendation.osFamily} · ${recommendation.hardwareClass}`} />
                <DetailRow label="语言 / 时区" value={`${recommendation.locale} · ${recommendation.timezone}`} mono />
                <DetailRow label="视口" value={recommendation.viewport} mono />
              </dl>
            </div>
          </TerminalPanel>
          <details className="mt-4 rounded-sm border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
            <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)]">
              高级设置预览
              <span className="ml-2 text-xs font-normal text-[var(--color-text-muted)]">不改也能直接使用</span>
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
                <Fingerprint className="mt-0.5 h-4 w-4 shrink-0" />
                首次创建只写入已验证的语言、时区和窗口参数；更复杂的指纹字段继续收纳在实例设置的“高级设置”中。
              </p>
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
              role={operationStatus === 'error' ? 'alert' : 'status'}
            >
              {operationStatus === 'success' ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-success)]" />
              ) : operationStatus === 'error' ? (
                <X className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-error)]" />
              ) : (
                <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[var(--color-accent)]" />
              )}
              <div className="min-w-0 flex-1">
                <p>{operationMessage}</p>
                {createdProfile && operationStatus === 'success' && (
                  <p className="mt-1 font-mono text-xs text-[var(--color-text-muted)]">实例 ID：{createdProfile.profileId}</p>
                )}
                {fingerprintCheckMessage && (
                  <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                    指纹快速检查：
                    <span
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
                        ? '已通过'
                        : fingerprintCheckStatus === 'failed'
                          ? '需复核'
                          : fingerprintCheckStatus === 'checking'
                            ? '检查中'
                            : fingerprintCheckStatus === 'unavailable'
                              ? '不可用'
                              : '未检查'}
                    </span>
                    {' · '}
                    {fingerprintCheckMessage}
                    <span className="mt-1 block">此检查仅比较可读取的基础字段，不代表 WebRTC 无泄漏或 Canvas、字体等效果已验证；这些项目需在浏览器内检测页复核。</span>
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
            <Button type="button" variant="ghost" onClick={() => setStep((current) => Math.max(0, current - 1))}>
              <ArrowLeft className="h-4 w-4" />
              上一步
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={() => navigate('/browser/list')}>
              返回实例总览
            </Button>
          )}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          {step === 3 && (savedDraft || createdProfile) ? (
            <Button type="button" variant="secondary" onClick={handleReset} disabled={operationBusy}>
              重新配置
            </Button>
          ) : null}
          {step < 3 ? (
            <Button type="button" onClick={() => setStep((current) => Math.min(STEPS.length - 1, current + 1))} disabled={!canContinue}>
              继续
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <>
              <Button type="button" variant="secondary" onClick={handleSaveDraft} disabled={!canContinue || operationBusy}>
                <Check className="h-4 w-4" />
                {savedDraft ? '再次保存草稿' : '保存草稿'}
              </Button>
              {createdProfile && operationStatus === 'error' ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleStartCreatedProfile(createdProfile.profileId)}
                  loading={operationBusy}
                >
                  <RefreshCw className="h-4 w-4" />
                  重试启动
                </Button>
              ) : null}
              <Button
                type="button"
                onClick={() => void handleCreateAndLaunch()}
                disabled={!canContinue || operationBusy || operationStatus === 'success' || (networkMode === 'proxy' && !settings)}
                loading={operationBusy}
              >
                <Wand2 className="h-4 w-4" />
                创建并启动实例
              </Button>
              {createdProfile && operationStatus === 'success' ? (
                <Button type="button" variant="primary" onClick={() => navigate('/browser/list')}>
                  进入实例总览
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : null}
            </>
          )}
        </div>
      </footer>

      <p className="mt-6 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
        <Globe2 className="h-3.5 w-3.5" />
        本地草稿 · 按当前连接栈创建
      </p>
    </div>
  )
}

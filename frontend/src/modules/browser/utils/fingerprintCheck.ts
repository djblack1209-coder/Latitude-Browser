import type {
  BrowserFingerprintCheckResult,
  BrowserFingerprintExpectedInfo,
  BrowserFingerprintRuntimeInfo,
} from '../types'

export type FingerprintCheckRowStatus =
  | 'match'
  | 'compatible'
  | 'mismatch'
  | 'not_configured'
  | 'observe'
  | 'unreadable'

export type FingerprintCheckRow = {
  key: string
  label: string
  expected: string
  actual: string
  status: FingerprintCheckRowStatus
  blocking: boolean
  note?: string
}

export type FingerprintEvaluation = {
  status: 'passed' | 'failed' | 'unavailable'
  rows: FingerprintCheckRow[]
  summary: {
    matchCount: number
    compatibleCount: number
    mismatchCount: number
    notConfiguredCount: number
    unreadableCount: number
    observationCount: number
    hasBlockingMismatch: boolean
    isComparable: boolean
  }
}

type ComparisonMode =
  | 'exact'
  | 'contains'
  | 'platform'
  | 'browser-version'
  | 'platform-version'
  | 'accept-language'

const valueToString = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.map((item) => valueToString(item)).filter(Boolean).join(',')
  return String(value).trim()
}

const normalized = (value: unknown) => valueToString(value).toLocaleLowerCase()

const isBlank = (value: unknown) => valueToString(value) === ''

const parseVersion = (value: string): number[] | null => {
  const match = value.match(/\d+(?:\.\d+){0,3}/)
  if (!match) return null
  return match[0].split('.').map((part) => Number(part))
}

const versionEquals = (expected: number[], actual: number[]) => (
  expected.length === actual.length && expected.every((part, index) => part === actual[index])
)

const versionMajorEquals = (expected: number[], actual: number[]) => expected[0] === actual[0]

const parseAcceptLanguage = (value: unknown): string[] => valueToString(value)
  .split(',')
  .map((part) => part.split(';', 1)[0].trim().toLocaleLowerCase())
  .filter(Boolean)

const normalizePlatform = (value: string): string => {
  const lower = value.toLocaleLowerCase()
  if (/mac|darwin|os x|macintel/.test(lower)) return 'macos'
  if (/win/.test(lower)) return 'windows'
  if (/android/.test(lower)) return 'android'
  if (/ios|iphone|ipad|ipod/.test(lower)) return 'ios'
  if (/linux|x11|ubuntu|debian/.test(lower)) return 'linux'
  if (/chromeos|cros/.test(lower)) return 'chromeos'
  return lower.replace(/[^a-z0-9]+/g, '')
}

type RuntimeBrand = { name: string; version: string }

const normalizeBrand = (brand: string): string => {
  const value = normalized(brand)
  if (['chrome', 'google chrome', 'crios'].includes(value)) return 'chrome'
  if (['edge', 'microsoft edge', 'edg', 'edga', 'edgios'].includes(value)) return 'edge'
  if (['firefox', 'fxios'].includes(value)) return 'firefox'
  if (['opera', 'opr'].includes(value)) return 'opera'
  return value
}

const readRuntimeBrands = (runtime: BrowserFingerprintRuntimeInfo): RuntimeBrand[] => {
  let hints: RuntimeBrand[] = []
  try {
    const data = JSON.parse(runtime.userAgentData || '{}')
    if (Array.isArray(data?.brands)) {
      hints = data.brands.flatMap((item: { brand?: unknown; version?: unknown }) => (
        item && typeof item.brand === 'string' && typeof item.version === 'string'
          ? [{ name: normalizeBrand(item.brand), version: item.version }]
          : []
      ))
    }
  } catch {
    // UAData is optional; a malformed value cannot supply evidence of a match.
  }
  const ua = runtime.userAgent || ''
  // Prefer product-specific tokens to compatibility tokens such as Chrome and Safari.
  const identity = ua.match(/\b(Edg|Edge|EdgA|EdgiOS|OPR|Opera|Firefox|FxiOS)\/(\d+(?:\.\d+){0,3})/i)
    || ua.match(/\b(Chrome|Chromium|CriOS)\/(\d+(?:\.\d+){0,3})/i)
    || (/\bSafari\//i.test(ua) ? ua.match(/\b(Version)\/(\d+(?:\.\d+){0,3})/i) : null)
  if (identity) {
    return [{ name: identity[1].toLowerCase() === 'version' ? 'safari' : normalizeBrand(identity[1]), version: identity[2] }, ...hints]
  }
  return hints
}

const extractBrowserVersion = (value: string): number[] | null => {
  const identity = readRuntimeBrands({ userAgent: value, userAgentData: '' } as BrowserFingerprintRuntimeInfo)[0]
  // Never mistake Mozilla/5.0 or a WebKit compatibility version for the browser version.
  return identity ? parseVersion(identity.version) : /^\d+(?:\.\d+){0,3}$/.test(value.trim()) ? parseVersion(value) : null
}

const extractPlatformVersion = (value: string): number[] | null => {
  const match = value.match(/(?:mac os x|macos)[\s_/:-]*(\d+(?:[._]\d+){0,3})/i)
    || value.match(/windows nt[\s_/:-]*(\d+(?:\.\d+){0,3})/i)
    || value.match(/android[\s_/:-]*(\d+(?:\.\d+){0,3})/i)
    || value.match(/cpu (?:iphone )?os[\s_/:-]*(\d+(?:[._]\d+){0,3})/i)
  return match ? parseVersion(match[1].replace(/_/g, '.')) : /^\d+(?:[._]\d+){0,3}$/.test(value.trim()) ? parseVersion(value.replace(/_/g, '.')) : null
}

/**
 * Compare one configured fingerprint value with a runtime value. The function
 * is deliberately browser-independent so it can be covered by the Node test
 * runner and reused by the automatic configuration flow.
 */
export function compareFingerprintValue(
  expectedValue: unknown,
  actualValue: unknown,
  mode: ComparisonMode = 'exact',
): FingerprintCheckRowStatus {
  if (isBlank(expectedValue)) return 'not_configured'
  if (isBlank(actualValue)) return 'unreadable'

  const expected = valueToString(expectedValue)
  const actual = valueToString(actualValue)
  const expectedNormalized = normalized(expected)
  const actualNormalized = normalized(actual)

  if (mode === 'contains') {
    return actualNormalized.includes(expectedNormalized) ? 'match' : 'mismatch'
  }

  if (mode === 'platform') {
    return normalizePlatform(expected) === normalizePlatform(actual) ? 'match' : 'mismatch'
  }

  if (mode === 'accept-language') {
    const expectedLanguages = parseAcceptLanguage(expected)
    const actualLanguages = Array.isArray(actualValue)
      ? actualValue.map((item) => normalized(item)).filter(Boolean)
      : parseAcceptLanguage(actual)
    if (!actualLanguages.length) return 'unreadable'
    if (expectedLanguages.every((language, index) => actualLanguages[index] === language)
      && actualLanguages.length === expectedLanguages.length) {
      return 'match'
    }
    if (expectedLanguages.every((language, index) => actualLanguages[index] === language)) {
      return 'compatible'
    }
    return 'mismatch'
  }

  if (mode === 'browser-version') {
    const expectedVersion = parseVersion(expected)
    const actualVersion = extractBrowserVersion(actual)
    if (!expectedVersion || !actualVersion) return 'unreadable'
    if (versionEquals(expectedVersion, actualVersion)) return 'match'
    return versionMajorEquals(expectedVersion, actualVersion) ? 'compatible' : 'mismatch'
  }

  if (mode === 'platform-version') {
    const expectedVersion = parseVersion(expected)
    const actualVersion = extractPlatformVersion(actual)
    if (!expectedVersion || !actualVersion) return 'unreadable'
    if (versionEquals(expectedVersion, actualVersion)) return 'match'
    return versionMajorEquals(expectedVersion, actualVersion) ? 'compatible' : 'mismatch'
  }

  return expectedNormalized === actualNormalized ? 'match' : 'mismatch'
}

const matchingRuntimeBrand = (expected: string, runtime: BrowserFingerprintRuntimeInfo): RuntimeBrand | undefined => {
  const brands = readRuntimeBrands(runtime)
  const name = normalizeBrand(expected)
  const exact = brands.find((brand) => brand.name === name)
  if (exact || !name) return exact || brands[0]
  // Chromium and Chrome share an engine but are only compatible, not identical brands.
  if (name === 'chrome' || name === 'chromium') {
    return brands.find((brand) => brand.name === 'chrome' || brand.name === 'chromium')
  }
  return undefined
}

const compareBrand = (expected: string, runtime: BrowserFingerprintRuntimeInfo): FingerprintCheckRowStatus => {
  if (isBlank(expected)) return 'not_configured'
  if (!readRuntimeBrands(runtime).length) return 'unreadable'
  const brand = matchingRuntimeBrand(expected, runtime)
  if (!brand) return 'mismatch'
  return brand.name === normalizeBrand(expected) ? 'match' : 'compatible'
}

const formatWindowRuntimeSize = (runtime: BrowserFingerprintRuntimeInfo): string => {
  const hasInner = runtime.innerWidth > 0 && runtime.innerHeight > 0
  const hasOuter = runtime.outerWidth > 0 && runtime.outerHeight > 0
  if (hasInner && hasOuter && (runtime.innerWidth !== runtime.outerWidth || runtime.innerHeight !== runtime.outerHeight)) {
    return `inner ${runtime.innerWidth},${runtime.innerHeight} / outer ${runtime.outerWidth},${runtime.outerHeight}`
  }
  if (hasInner) return `${runtime.innerWidth},${runtime.innerHeight}`
  if (hasOuter) return `${runtime.outerWidth},${runtime.outerHeight} (outer)`
  return ''
}

const compareWindowSize = (expected: string, runtime: BrowserFingerprintRuntimeInfo): FingerprintCheckRowStatus => {
  if (isBlank(expected)) return 'not_configured'
  const dimensions = expected.split(/[x,×\s]+/).map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
  if (dimensions.length < 2) return 'unreadable'
  const [expectedWidth, expectedHeight] = dimensions
  const hasInner = runtime.innerWidth > 0 && runtime.innerHeight > 0
  const hasOuter = runtime.outerWidth > 0 && runtime.outerHeight > 0
  if (!hasInner && !hasOuter) return 'unreadable'
  if (hasInner && runtime.innerWidth === expectedWidth && runtime.innerHeight === expectedHeight) return 'match'
  if (hasOuter && runtime.outerWidth === expectedWidth && runtime.outerHeight === expectedHeight) return 'compatible'
  return 'mismatch'
}

const addRow = (
  rows: FingerprintCheckRow[],
  row: Omit<FingerprintCheckRow, 'status'> & { status: FingerprintCheckRowStatus },
) => {
  rows.push(row)
}

const addConfiguredRow = (
  rows: FingerprintCheckRow[],
  key: string,
  label: string,
  expected: unknown,
  actual: unknown,
  mode: ComparisonMode,
  note?: string,
) => {
  const expectedText = valueToString(expected)
  const actualText = valueToString(actual)
  addRow(rows, {
    key,
    label,
    expected: expectedText,
    actual: actualText,
    status: compareFingerprintValue(expected, actual, mode),
    blocking: true,
    note,
  })
}

const addObservationRow = (
  rows: FingerprintCheckRow[],
  key: string,
  label: string,
  expected: unknown,
  actual: unknown,
  note = '观察项，不作为自动配置失败依据',
) => {
  if (isBlank(expected)) return
  addRow(rows, {
    key,
    label,
    expected: valueToString(expected),
    actual: valueToString(actual),
    status: isBlank(actual) ? 'unreadable' : 'observe',
    blocking: false,
    note,
  })
}

const configuredExpectedKeys: Array<keyof BrowserFingerprintExpectedInfo> = [
  'language',
  'acceptLanguage',
  'timezone',
  'hardwareConcurrency',
  'windowSize',
  'brand',
  'brandVersion',
  'platform',
  'platformVersion',
]

/**
 * Evaluate the backend's expected/runtime snapshot without changing launch
 * behavior. Only fields that the backend explicitly configures are blocking;
 * optional render and hardware observations remain visible but non-blocking.
 */
export function evaluateFingerprintCheck(result: BrowserFingerprintCheckResult): FingerprintEvaluation {
  const runtime = result?.runtime || ({} as BrowserFingerprintRuntimeInfo)
  const expected = result?.expected || ({} as BrowserFingerprintExpectedInfo)
  const rows: FingerprintCheckRow[] = []

  addConfiguredRow(rows, 'language', '语言', expected.language, runtime.language, 'exact')
  addConfiguredRow(
    rows,
    'acceptLanguage',
    '语言列表',
    expected.acceptLanguage,
    runtime.languages?.length ? runtime.languages : runtime.language,
    'accept-language',
  )
  addConfiguredRow(rows, 'timezone', '时区', expected.timezone, runtime.timezone, 'exact')
  addConfiguredRow(rows, 'hardwareConcurrency', 'CPU 并发数', expected.hardwareConcurrency, runtime.hardwareConcurrency, 'exact')
  addConfiguredRow(rows, 'windowSize', '窗口尺寸', expected.windowSize, formatWindowRuntimeSize(runtime), 'exact',
    runtime.innerWidth > 0 && runtime.innerHeight > 0 ? undefined : '窗口内尺寸不可读时会回退检查 outerWidth / outerHeight')
  rows[rows.length - 1].status = compareWindowSize(expected.windowSize, runtime)
  addConfiguredRow(rows, 'brand', '浏览器品牌', expected.brand, `${runtime.userAgent} ${runtime.userAgentData}`, 'contains')
  rows[rows.length - 1].status = compareBrand(expected.brand, runtime)
  addConfiguredRow(rows, 'brandVersion', '浏览器版本', expected.brandVersion, matchingRuntimeBrand(expected.brand || '', runtime)?.version, 'browser-version')
  addConfiguredRow(rows, 'platform', '系统平台', expected.platform, runtime.platform || runtime.userAgent, 'platform')
  addConfiguredRow(rows, 'platformVersion', '系统版本', expected.platformVersion, `${runtime.platform} ${runtime.userAgent} ${runtime.userAgentData}`, 'platform-version')

  // webdriver is an invariant rather than an expected launch argument. A
  // true value is always a blocking failure, while false does not make an
  // otherwise unconfigured snapshot look like a successful comparison.
  addRow(rows, {
    key: 'webdriver',
    label: '自动化标记',
    expected: 'false',
    actual: typeof runtime.webdriver === 'boolean' ? String(runtime.webdriver) : '',
    status: runtime.webdriver === true ? 'mismatch' : runtime.webdriver === false ? 'match' : 'unreadable',
    blocking: true,
    note: runtime.webdriver ? '运行时暴露 webdriver=true，需要进入实例详情复核' : undefined,
  })

  addObservationRow(rows, 'deviceMemory', '设备内存', expected.deviceMemory, runtime.deviceMemory)
  addObservationRow(rows, 'colorDepth', '色深', expected.colorDepth, runtime.colorDepth)
  addObservationRow(rows, 'touchPoints', '触摸点数量', expected.touchPoints, runtime.maxTouchPoints)
  addObservationRow(rows, 'doNotTrack', 'Do Not Track', expected.doNotTrack, runtime.doNotTrack)
  addObservationRow(rows, 'mediaDevices', '媒体设备数量', expected.mediaDevices, runtime.mediaDeviceCount)
  addObservationRow(rows, 'canvasNoise', 'Canvas 噪声', expected.canvasNoise, runtime.canvasHash)
  addObservationRow(rows, 'audioNoise', 'Audio 噪声', expected.audioNoise, runtime.audioHash)
  addObservationRow(rows, 'clientRectsNoise', 'ClientRects 噪声', expected.clientRectsNoise, runtime.clientRectsHash)
  addObservationRow(rows, 'fontList', '字体列表', expected.fontList, '', '当前快速自测未采集字体列表，不能使用插件列表代替')
  addObservationRow(rows, 'webglVendor', 'WebGL 厂商', expected.webglVendor, runtime.webglVendor)
  addObservationRow(rows, 'webglRenderer', 'WebGL 渲染器', expected.webglRenderer, runtime.webglRenderer)
  addObservationRow(rows, 'seed', '指纹种子', expected.seed, '', '种子只用于生成噪声，当前运行时不会直接回传')
  addObservationRow(rows, 'webrtcPolicy', 'WebRTC 策略', expected.webrtcPolicy, '', '当前快速自测未直接暴露 WebRTC 策略；请在实例详情复核')
  addObservationRow(rows, 'disableSpoofing', '禁用伪装项', expected.disableSpoofing, '', '当前快速自测未直接回传伪装开关；请在实例详情复核')

  const explicitRows = rows.filter((row) => row.blocking && row.key !== 'webdriver' && configuredExpectedKeys.includes(row.key as keyof BrowserFingerprintExpectedInfo) && row.expected !== '')
  const comparableRows = explicitRows.filter((row) => row.status === 'match' || row.status === 'compatible' || row.status === 'mismatch')
  const hasBlockingMismatch = rows.some((row) => row.blocking && row.status === 'mismatch')
  const hasBlockingUnreadable = rows.some((row) => row.blocking && row.status === 'unreadable')
  const hasUnverifiedSecurityConfig = rows.some((row) => (
    (row.key === 'webrtcPolicy' || row.key === 'disableSpoofing')
      && row.status === 'unreadable'
      && row.expected !== ''
  ))
  const summary = {
    matchCount: rows.filter((row) => row.status === 'match').length,
    compatibleCount: rows.filter((row) => row.status === 'compatible').length,
    mismatchCount: rows.filter((row) => row.status === 'mismatch').length,
    notConfiguredCount: rows.filter((row) => row.status === 'not_configured').length,
    unreadableCount: rows.filter((row) => row.status === 'unreadable').length,
    observationCount: rows.filter((row) => !row.blocking).length,
    hasBlockingMismatch,
    isComparable: comparableRows.length > 0,
  }

  const status = hasBlockingMismatch
    ? 'failed'
    : !summary.isComparable || hasBlockingUnreadable || hasUnverifiedSecurityConfig
      ? 'unavailable'
      : 'passed'

  return { status, rows, summary }
}

import { tr } from '../../../shared/i18n'
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
  note = tr("browser.utils.fingerprintCheck.message.0a3d18d"),
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

  addConfiguredRow(rows, 'language', tr("browser.components.FingerprintPanel.label.cd99b22"), expected.language, runtime.language, 'exact')
  addConfiguredRow(
    rows,
    'acceptLanguage',
    tr("browser.components.FingerprintPanel.label.0778870"),
    expected.acceptLanguage,
    runtime.languages?.length ? runtime.languages : runtime.language,
    'accept-language',
  )
  addConfiguredRow(rows, 'timezone', tr("browser.components.FingerprintPanel.label.fb2a23d"), expected.timezone, runtime.timezone, 'exact')
  addConfiguredRow(rows, 'hardwareConcurrency', tr("browser.utils.fingerprintCheck.evaluateFingerprintCheck.de0d65d"), expected.hardwareConcurrency, runtime.hardwareConcurrency, 'exact')
  addConfiguredRow(rows, 'windowSize', tr("browser.utils.fingerprintCheck.evaluateFingerprintCheck.3b932f3"), expected.windowSize, formatWindowRuntimeSize(runtime), 'exact',
    runtime.innerWidth > 0 && runtime.innerHeight > 0 ? undefined : tr("browser.utils.fingerprintCheck.evaluateFingerprintCheck.04b7be0"))
  rows[rows.length - 1].status = compareWindowSize(expected.windowSize, runtime)
  addConfiguredRow(rows, 'brand', tr("browser.components.FingerprintPanel.label.363116d"), expected.brand, `${runtime.userAgent} ${runtime.userAgentData}`, 'contains')
  rows[rows.length - 1].status = compareBrand(expected.brand, runtime)
  addConfiguredRow(rows, 'brandVersion', tr("browser.utils.fingerprintCheck.evaluateFingerprintCheck.38456f7"), expected.brandVersion, matchingRuntimeBrand(expected.brand || '', runtime)?.version, 'browser-version')
  addConfiguredRow(rows, 'platform', tr("browser.utils.fingerprintCheck.evaluateFingerprintCheck.c5f9c5c"), expected.platform, runtime.platform || runtime.userAgent, 'platform')
  addConfiguredRow(rows, 'platformVersion', tr("browser.components.FingerprintPanel.label.735f889"), expected.platformVersion, `${runtime.platform} ${runtime.userAgent} ${runtime.userAgentData}`, 'platform-version')

  // webdriver is an invariant rather than an expected launch argument. A
  // true value is always a blocking failure, while false does not make an
  // otherwise unconfigured snapshot look like a successful comparison.
  addRow(rows, {
    key: 'webdriver',
    label: tr("browser.utils.fingerprintCheck.label.3e11b3a"),
    expected: 'false',
    actual: typeof runtime.webdriver === 'boolean' ? String(runtime.webdriver) : '',
    status: runtime.webdriver === true ? 'mismatch' : runtime.webdriver === false ? 'match' : 'unreadable',
    blocking: true,
    note: runtime.webdriver ? tr("browser.utils.fingerprintCheck.evaluateFingerprintCheck.622e736") : undefined,
  })

  addObservationRow(rows, 'deviceMemory', tr("browser.pages.AutoConfigPage.label.063c974"), expected.deviceMemory, runtime.deviceMemory)
  addObservationRow(rows, 'colorDepth', tr("browser.pages.AutoConfigPage.label.f79e991"), expected.colorDepth, runtime.colorDepth)
  addObservationRow(rows, 'touchPoints', tr("browser.utils.fingerprintCheck.evaluateFingerprintCheck.8486dd4"), expected.touchPoints, runtime.maxTouchPoints)
  addObservationRow(rows, 'doNotTrack', 'Do Not Track', expected.doNotTrack, runtime.doNotTrack)
  addObservationRow(rows, 'mediaDevices', tr("browser.pages.BrowserEditPage.label.6a9c87c"), expected.mediaDevices, runtime.mediaDeviceCount)
  addObservationRow(rows, 'canvasNoise', tr("browser.components.FingerprintPanel.label.cc178ca"), expected.canvasNoise, runtime.canvasHash)
  addObservationRow(rows, 'audioNoise', tr("browser.pages.BrowserEditPage.label.5201834"), expected.audioNoise, runtime.audioHash)
  addObservationRow(rows, 'clientRectsNoise', tr("browser.components.FingerprintPanel.label.df61775"), expected.clientRectsNoise, runtime.clientRectsHash)
  addObservationRow(rows, 'fontList', tr("browser.pages.BrowserEditPage.label.96ff7b7"), expected.fontList, '', tr("browser.utils.fingerprintCheck.evaluateFingerprintCheck.10d009c"))
  addObservationRow(rows, 'webglVendor', tr("browser.utils.fingerprintCheck.evaluateFingerprintCheck.5a2619d"), expected.webglVendor, runtime.webglVendor)
  addObservationRow(rows, 'webglRenderer', tr("browser.utils.fingerprintCheck.evaluateFingerprintCheck.af1680a"), expected.webglRenderer, runtime.webglRenderer)
  addObservationRow(rows, 'seed', tr("browser.copyOptions.label.8e9fa06"), expected.seed, '', tr("browser.utils.fingerprintCheck.evaluateFingerprintCheck.49cdd4f"))
  addObservationRow(rows, 'webrtcPolicy', tr("browser.components.FingerprintPanel.label.caac8ad"), expected.webrtcPolicy, '', tr("browser.utils.fingerprintCheck.evaluateFingerprintCheck.024e871"))
  addObservationRow(rows, 'disableSpoofing', tr("browser.utils.fingerprintCheck.evaluateFingerprintCheck.fb82afe"), expected.disableSpoofing, '', tr("browser.utils.fingerprintCheck.evaluateFingerprintCheck.ad7893e"))

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

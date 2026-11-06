import { tr, localized } from '../../../shared/i18n'
// 指纹参数序列化/反序列化工具

import type { FingerprintPersona } from './fingerprintCapabilities'

/**
 * 获取系统当前时区
 * @returns IANA 时区标识符，如 "Asia/Shanghai"
 */
export function getSystemTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

export interface FingerprintConfig {
  // 指纹种子（核心）
  seed?: string            // --fingerprint=<seed>  控制所有随机噪声的根种子

  // 基础身份
  brand?: string           // --fingerprint-brand=
  brandVersion?: string    // --fingerprint-brand-version=
  platform?: string        // --fingerprint-platform=
  platformVersion?: string // --fingerprint-platform-version=
  lang?: string            // --lang=
  acceptLang?: string      // --accept-lang=
  timezone?: string        // --timezone=

  // 屏幕与窗口
  resolution?: string      // --window-size=
  customResolution?: string // 当 resolution === 'custom' 时使用

  // 硬件信息
  hardwareConcurrency?: string  // --fingerprint-hardware-concurrency=
  colorDepth?: string           // 兼容解析：本地 Chrom-144 实测无效，保存时不再输出
  deviceMemory?: string         // 兼容解析：本地 Chrom-144 实测无效，保存时不再输出
  touchPoints?: string          // 兼容解析：本地 Chrom-144 实测无效，保存时不再输出

  // 网络与隐私
  webrtcPolicy?: string         // --disable-non-proxied-udp 或 --webrtc-ip-handling-policy=
  disableSpoofing?: string[]    // --disable-spoofing=font,audio,canvas,clientrects,gpu
  doNotTrack?: string           // 兼容解析：本地 Chrom-144 实测无效，保存时不再输出
  mediaDevices?: string         // 兼容解析：本地 Chrom-144 实测无效，保存时不再输出

  // 兼容细项：已验证噪声项会转换到 Chrom-144 真实开关，其余原样保留
  canvasNoise?: string          // 1 -> --fingerprinting-canvas-image-data-noise
  audioNoise?: string           // 兼容解析：本地 Chrom-144 实测无效，保存时不再输出
  clientRectsNoise?: string     // 1 -> --fingerprinting-client-rects-noise
  fontList?: string             // 兼容解析：本地 Chrom-144 实测无效，保存时不再输出
  webglVendor?: string          // 兼容解析：本地 Chrom-144 实测无效，保存时不再输出
  webglRenderer?: string        // 兼容解析：本地 Chrom-144 实测无效，保存时不再输出

  unknownArgs?: string[]        // 无法识别的原始参数，原样保留
}

export const PRESET_RESOLUTIONS = ['1920,1080', '1440,900', '1366,768', '2560,1440', '1280,800', '1600,900']

const DEFAULT_WINDOW_WIDTH_RATIO = 0.42
const DEFAULT_WINDOW_MAX_WIDTH = 1440
const DEFAULT_WINDOW_MIN_WIDTH = 960
const DEFAULT_WINDOW_MIN_HEIGHT = 540
const DEFAULT_WINDOW_FALLBACK_SCREEN_WIDTH = 1920
const DEFAULT_WINDOW_FALLBACK_SCREEN_HEIGHT = 1080

type WindowSizeScreenLike = Partial<Pick<Screen, 'availWidth' | 'availHeight' | 'width' | 'height'>>

function positiveNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function buildAdaptiveDefaultWindowSize(screenInfo?: WindowSizeScreenLike): string {
  const resolvedScreen = screenInfo ?? (typeof window !== 'undefined' ? window.screen : undefined)
  const availableWidth = positiveNumber(resolvedScreen?.availWidth) || positiveNumber(resolvedScreen?.width) || DEFAULT_WINDOW_FALLBACK_SCREEN_WIDTH
  const availableHeight = positiveNumber(resolvedScreen?.availHeight) || positiveNumber(resolvedScreen?.height) || DEFAULT_WINDOW_FALLBACK_SCREEN_HEIGHT
  const width = Math.round(clampNumber(availableWidth * DEFAULT_WINDOW_WIDTH_RATIO, DEFAULT_WINDOW_MIN_WIDTH, DEFAULT_WINDOW_MAX_WIDTH))
  const maxHeight = Math.max(DEFAULT_WINDOW_MIN_HEIGHT, Math.floor(availableHeight * 0.82))
  const height = Math.round(clampNumber(width * 9 / 16, DEFAULT_WINDOW_MIN_HEIGHT, maxHeight))
  return `${width},${height}`
}

export function withAdaptiveDefaultWindowSize(args: string[]): string[] {
  const normalizedArgs = (args || []).map(item => item.trim()).filter(Boolean)
  if (normalizedArgs.some(arg => arg.toLowerCase().startsWith('--window-size='))) return normalizedArgs
  return [...normalizedArgs, `--window-size=${buildAdaptiveDefaultWindowSize()}`]
}

// CLI 参数前缀 → FingerprintConfig 字段映射
export const KEY_MAP: Record<string, keyof FingerprintConfig> = {
  '--fingerprint': 'seed',
  '--fingerprint-brand': 'brand',
  '--fingerprint-brand-version': 'brandVersion',
  '--fingerprint-platform': 'platform',
  '--fingerprint-platform-version': 'platformVersion',
  '--lang': 'lang',
  '--accept-lang': 'acceptLang',
  '--timezone': 'timezone',
  '--window-size': 'resolution',
  '--fingerprint-hardware-concurrency': 'hardwareConcurrency',
  '--fingerprint-color-depth': 'colorDepth',
  '--fingerprint-device-memory': 'deviceMemory',
  '--fingerprint-touch-points': 'touchPoints',
  '--webrtc-ip-handling-policy': 'webrtcPolicy',
  '--disable-spoofing': 'disableSpoofing',
  '--fingerprint-do-not-track': 'doNotTrack',
  '--fingerprint-media-devices': 'mediaDevices',
  '--fingerprint-canvas-noise': 'canvasNoise',
  '--fingerprinting-canvas-image-data-noise': 'canvasNoise',
  '--fingerprint-audio-noise': 'audioNoise',
  '--fingerprint-client-rects-noise': 'clientRectsNoise',
  '--fingerprinting-client-rects-noise': 'clientRectsNoise',
  '--fingerprint-font-list': 'fontList',
  '--fingerprint-fonts': 'fontList',
  '--fingerprint-webgl-vendor': 'webglVendor',
  '--fingerprint-webgl-renderer': 'webglRenderer',
}

export interface FingerprintValidationIssue {
  level: 'error' | 'warning' | 'info'
  message: string
}

export interface FingerprintValidationResult {
  valid: boolean
  issues: FingerprintValidationIssue[]
}

const FLAG_MAP: Record<string, keyof FingerprintConfig> = {
  '--disable-non-proxied-udp': 'webrtcPolicy',
  '--fingerprinting-canvas-image-data-noise': 'canvasNoise',
  '--fingerprinting-client-rects-noise': 'clientRectsNoise',
}

const KERNEL_SPOOFING_KEYS = new Set(['font', 'audio', 'canvas', 'clientrects', 'gpu'])
const KERNEL_BRANDS = new Set(['Chrome', 'Edge', 'Opera', 'Vivaldi'])
const KERNEL_PLATFORMS = new Set(['windows', 'linux', 'macos'])
const KERNEL_WEBRTC_POLICIES = new Set(['disable_non_proxied_udp', 'default_public_interface_only', 'default_public_and_private_interfaces'])
const KERNEL_SUPPORTED_ARG_KEYS = new Set([
  '--fingerprint',
  '--fingerprint-brand',
  '--fingerprint-brand-version',
  '--fingerprint-platform',
  '--fingerprint-platform-version',
  '--fingerprint-hardware-concurrency',
  '--fingerprinting-canvas-image-data-noise',
  '--fingerprinting-client-rects-noise',
  '--disable-non-proxied-udp',
  '--disable-spoofing',
  '--lang',
  '--accept-lang',
  '--timezone',
  '--window-size',
  '--webrtc-ip-handling-policy',
])


const LEGACY_FINGERPRINT_ARG_KEYS = new Set([
  '--fingerprint-gpu-vendor',
  '--fingerprint-gpu-renderer',
  '--disable-gpu-fingerprint',
])

const CONVERTED_FINGERPRINT_ARG_KEYS = new Set([
  '--fingerprint-canvas-noise',
  '--fingerprint-client-rects-noise',
])

const NO_EFFECT_FINGERPRINT_ARG_KEYS = new Set([
  '--fingerprint-color-depth',
  '--fingerprint-device-memory',
  '--fingerprint-touch-points',
  '--fingerprint-do-not-track',
  '--fingerprint-media-devices',
  '--fingerprint-audio-noise',
  '--fingerprint-font-list',
  '--fingerprint-fonts',
  '--fingerprint-webgl-vendor',
  '--fingerprint-webgl-renderer',
  '--fingerprint-screen-width',
  '--fingerprint-screen-height',
  '--fingerprint-device-scale-factor',
  '--fingerprint-location',
  '--fingerprinting-canvas-measuretext-noise',
])

// FingerprintConfig → string[]
export function serialize(config: FingerprintConfig): string[] {
  const args: string[] = []
  if (config.seed) args.push(`--fingerprint=${config.seed}`)
  if (config.brand) args.push(`--fingerprint-brand=${config.brand}`)
  if (config.brandVersion) args.push(`--fingerprint-brand-version=${config.brandVersion}`)
  if (config.platform) args.push(`--fingerprint-platform=${normalizeFingerprintPlatform(config.platform)}`)
  if (config.platformVersion) args.push(`--fingerprint-platform-version=${config.platformVersion}`)
  if (config.lang) {
    args.push(`--lang=${config.lang}`)
    args.push(`--accept-lang=${config.acceptLang || buildAcceptLanguage(config.lang)}`)
  } else if (config.acceptLang) {
    args.push(`--accept-lang=${config.acceptLang}`)
  }
  if (config.timezone) {
    // 如果是 system，替换为实际系统时区
    const tz = config.timezone === 'system' ? getSystemTimezone() : config.timezone
    args.push(`--timezone=${tz}`)
  }

  const res = config.resolution === 'custom' ? config.customResolution : config.resolution
  if (res) args.push(`--window-size=${res}`)

  if (config.hardwareConcurrency) args.push(`--fingerprint-hardware-concurrency=${config.hardwareConcurrency}`)
  if (config.webrtcPolicy === 'disable_non_proxied_udp') {
    args.push('--disable-non-proxied-udp')
  } else if (config.webrtcPolicy) {
    args.push(`--webrtc-ip-handling-policy=${config.webrtcPolicy}`)
  }
  if (isEnabledFlagValue(config.canvasNoise)) {
    args.push('--fingerprinting-canvas-image-data-noise')
  } else if (isDisabledFlagValue(config.canvasNoise)) {
    args.push('--fingerprinting-canvas-image-data-noise=0')
  }
  if (isEnabledFlagValue(config.clientRectsNoise)) {
    args.push('--fingerprinting-client-rects-noise')
  } else if (isDisabledFlagValue(config.clientRectsNoise)) {
    args.push('--fingerprinting-client-rects-noise=0')
  }
  const disableSpoofing = normalizeDisableSpoofing(config.disableSpoofing)
  if (disableSpoofing.length) args.push(`--disable-spoofing=${disableSpoofing.join(',')}`)

  return [...args, ...(config.unknownArgs ?? [])]
}

// string[] → FingerprintConfig
export function deserialize(args: string[]): FingerprintConfig {
  const config: FingerprintConfig = { unknownArgs: [] }

  for (const arg of args) {
    const eqIdx = arg.indexOf('=')
    if (eqIdx === -1) {
      const field = FLAG_MAP[arg]
      if (field === 'webrtcPolicy') {
        config.webrtcPolicy = 'disable_non_proxied_udp'
      } else if (field === 'canvasNoise' || field === 'clientRectsNoise') {
        ;(config as Record<string, unknown>)[field] = '1'
      } else {
        config.unknownArgs!.push(arg)
      }
      continue
    }
    const key = arg.slice(0, eqIdx)
    const val = arg.slice(eqIdx + 1)
    const field = KEY_MAP[key]

    if (!field) {
      config.unknownArgs!.push(arg)
      continue
    }

    if (field === 'resolution') {
      if (PRESET_RESOLUTIONS.includes(val)) {
        config.resolution = val
      } else {
        config.resolution = 'custom'
        config.customResolution = val
      }
    } else if (field === 'platform') {
      config.platform = normalizeFingerprintPlatform(val)
    } else if (field === 'disableSpoofing') {
      config.disableSpoofing = normalizeDisableSpoofing(val.split(','))
    } else {
      (config as Record<string, unknown>)[field] = val
    }
  }

  return config
}

export function normalizeFingerprintPlatform(platform: string): string {
  const normalized = platform.trim().toLowerCase()
  return normalized === 'mac' ? 'macos' : normalized
}

export function normalizeDisableSpoofing(values?: string[]): string[] {
  const result: string[] = []
  for (const value of values || []) {
    const normalized = value.trim().toLowerCase()
    if (KERNEL_SPOOFING_KEYS.has(normalized) && !result.includes(normalized)) result.push(normalized)
  }
  return result
}

export function validateFingerprintArgs(rawArgs: string[]): FingerprintValidationResult {
  const config = deserialize(rawArgs || [])
  const issues: FingerprintValidationIssue[] = []

  for (const arg of rawArgs || []) {
    const trimmed = arg.trim()
    if (!trimmed.startsWith('--')) continue
    const key = argKey(trimmed)
    if (LEGACY_FINGERPRINT_ARG_KEYS.has(key)) {
      issues.push({ level: 'warning', message: tr("browser.utils.fingerprintSerializer.message.049a198", [key]) })
    } else if (CONVERTED_FINGERPRINT_ARG_KEYS.has(key)) {
      issues.push({ level: 'info', message: tr("browser.utils.fingerprintSerializer.message.8723502", [key]) })
    } else if (NO_EFFECT_FINGERPRINT_ARG_KEYS.has(key)) {
      issues.push({ level: 'warning', message: tr("browser.utils.fingerprintSerializer.message.b371371", [key]) })
    } else if (!KERNEL_SUPPORTED_ARG_KEYS.has(key)) {
      issues.push({ level: 'info', message: tr("browser.utils.fingerprintSerializer.message.1fff1a1", [key]) })
    }
  }

  if (config.seed && !isUint32Seed(config.seed)) {
    issues.push({ level: 'error', message: tr("browser.utils.fingerprintSerializer.message.3a246db") })
  }
  if (!config.seed) {
    issues.push({ level: 'info', message: tr("browser.utils.fingerprintSerializer.message.288f42d") })
  }
  if (config.brand && !KERNEL_BRANDS.has(config.brand)) {
    issues.push({ level: 'error', message: tr("browser.utils.fingerprintSerializer.message.e9cb8e4", [Array.from(KERNEL_BRANDS).join(' / ')]) })
  }
  if (config.brandVersion && !isDottedVersion(config.brandVersion)) {
    issues.push({ level: 'warning', message: tr("browser.utils.fingerprintSerializer.message.491aa7b") })
  }
  if (config.platform && !KERNEL_PLATFORMS.has(normalizeFingerprintPlatform(config.platform))) {
    issues.push({ level: 'error', message: tr("browser.utils.fingerprintSerializer.message.16fb16f") })
  }
  if (config.platformVersion && !isSafeVersionText(config.platformVersion)) {
    issues.push({ level: 'warning', message: tr("browser.utils.fingerprintSerializer.message.65d3672") })
  }
  if (config.lang && !isLanguageTag(config.lang)) {
    issues.push({ level: 'error', message: tr("browser.utils.fingerprintSerializer.message.20678ef") })
  }
  if (config.acceptLang && !isAcceptLanguage(config.acceptLang)) {
    issues.push({ level: 'error', message: tr("browser.utils.fingerprintSerializer.message.c801b1a") })
  }
  if (config.timezone && config.timezone !== 'system' && !isKnownTimezone(config.timezone)) {
    issues.push({ level: 'warning', message: tr("browser.utils.fingerprintSerializer.message.4a94ec1") })
  }
  if (config.resolution === 'custom' && !isWindowSize(config.customResolution || '')) {
    issues.push({ level: 'error', message: tr("browser.utils.fingerprintSerializer.message.ab9106e") })
  } else if (config.resolution && config.resolution !== 'custom' && !isWindowSize(config.resolution)) {
    issues.push({ level: 'error', message: tr("browser.utils.fingerprintSerializer.message.23a63a7") })
  }
  if (config.hardwareConcurrency && !isPositiveIntInRange(config.hardwareConcurrency, 1, 128)) {
    issues.push({ level: 'error', message: tr("browser.utils.fingerprintSerializer.message.fe4665d") })
  }
  if (config.webrtcPolicy && !KERNEL_WEBRTC_POLICIES.has(config.webrtcPolicy)) {
    issues.push({ level: 'warning', message: tr("browser.utils.fingerprintSerializer.message.d628620") })
  }
  if (normalizeDisableSpoofing(config.disableSpoofing).length !== (config.disableSpoofing || []).length) {
    issues.push({ level: 'warning', message: tr("browser.utils.fingerprintSerializer.message.cef6cd3") })
  }

  return {
    valid: !issues.some(issue => issue.level === 'error'),
    issues,
  }
}

function isEnabledFlagValue(value?: string): boolean {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

function isDisabledFlagValue(value?: string): boolean {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off'
}

function argKey(arg: string): string {
  const eqIndex = arg.indexOf('=')
  return (eqIndex > 0 ? arg.slice(0, eqIndex) : arg).toLowerCase()
}

function isUint32Seed(value: string): boolean {
  if (!/^\d+$/.test(value.trim())) return false
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 2147483647
}

function isDottedVersion(value: string): boolean {
  return /^\d+(?:\.\d+){0,4}$/.test(value.trim())
}

function isSafeVersionText(value: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(value.trim())
}

function isLanguageTag(value: string): boolean {
  return /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8}){0,2}$/.test(value.trim())
}

function isAcceptLanguage(value: string): boolean {
  return value.split(',').map(item => item.trim()).filter(Boolean).every(isLanguageTag)
}

function isWindowSize(value: string): boolean {
  const match = value.trim().match(/^(\d{3,5}),(\d{3,5})$/)
  if (!match) return false
  const width = Number(match[1])
  const height = Number(match[2])
  return width >= 200 && height >= 200
}

function isPositiveIntInRange(value: string, min: number, max: number): boolean {
  if (!/^\d+$/.test(value.trim())) return false
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max
}

function isKnownTimezone(value: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value.trim() })
    return true
  } catch {
    return false
  }
}

// 生成随机指纹种子（32位正整数）
export function randomFingerprintSeed(): string {
  return String(Math.floor(Math.random() * 2147483647) + 1)
}

export function buildFingerprintConfigFromPersona(persona: FingerprintPersona): FingerprintConfig {
  return {
    seed: randomFingerprintSeed(),
    brand: persona.brand,
    brandVersion: persona.brandVersion,
    platform: persona.platform,
    platformVersion: persona.platformVersion,
    lang: persona.lang,
    acceptLang: buildAcceptLanguage(persona.lang),
    timezone: persona.timezone,
    resolution: persona.resolution,
    hardwareConcurrency: persona.hardwareConcurrency,
    webrtcPolicy: 'disable_non_proxied_udp',
    canvasNoise: '1',
    clientRectsNoise: '1',
  }
}

const EFFECTIVE_RUNTIME_NOISE_CONFIG: Pick<FingerprintConfig, 'canvasNoise' | 'clientRectsNoise'> = {
  canvasNoise: '1',
  clientRectsNoise: '1',
}

// ─── 预设指纹配置 ────────────────────────────────────────────────────────────

export interface FingerprintPreset {
  id: string
  name: string
  description: string
  config: Partial<FingerprintConfig>
}

export const FINGERPRINT_PRESETS: FingerprintPreset[] = localized(() => ([
  {
    id: 'win-chrome-office',
    name: tr("browser.utils.fingerprintSerializer.name.cfb98f2"),
    description: tr("browser.utils.fingerprintSerializer.description.dc426a1"),
    config: {
      brand: 'Chrome',
      platform: 'windows',
      lang: 'zh-CN',
      timezone: 'Asia/Shanghai',
      resolution: '1920,1080',
      hardwareConcurrency: '8',
      webrtcPolicy: 'disable_non_proxied_udp',
      ...EFFECTIVE_RUNTIME_NOISE_CONFIG,
    },
  },
  {
    id: 'win-chrome-gaming',
    name: tr("browser.utils.fingerprintSerializer.name.68939f5"),
    description: tr("browser.utils.fingerprintSerializer.description.e02cf9d"),
    config: {
      brand: 'Chrome',
      platform: 'windows',
      lang: 'en-US',
      timezone: 'America/New_York',
      resolution: '2560,1440',
      hardwareConcurrency: '16',
      webrtcPolicy: 'disable_non_proxied_udp',
      ...EFFECTIVE_RUNTIME_NOISE_CONFIG,
    },
  },
  {
    id: 'mac-chrome-designer',
    name: tr("browser.utils.fingerprintSerializer.name.b69ebf9"),
    description: tr("browser.utils.fingerprintSerializer.description.3fcf350"),
    config: {
      brand: 'Chrome',
      platform: 'macos',
      lang: 'zh-CN',
      timezone: 'Asia/Shanghai',
      resolution: '2560,1440',
      hardwareConcurrency: '10',
      webrtcPolicy: 'disable_non_proxied_udp',
      ...EFFECTIVE_RUNTIME_NOISE_CONFIG,
    },
  },
  {
    id: 'win-edge-enterprise',
    name: tr("browser.utils.fingerprintSerializer.name.38675ac"),
    description: tr("browser.utils.fingerprintSerializer.description.9e6f5a6"),
    config: {
      brand: 'Edge',
      platform: 'windows',
      lang: 'zh-CN',
      timezone: 'Asia/Shanghai',
      resolution: '1366,768',
      hardwareConcurrency: '4',
      webrtcPolicy: 'default_public_interface_only',
      ...EFFECTIVE_RUNTIME_NOISE_CONFIG,
    },
  },
  {
    id: 'win-chrome-us-user',
    name: tr("browser.utils.fingerprintSerializer.name.005924c"),
    description: tr("browser.utils.fingerprintSerializer.description.09c42d8"),
    config: {
      brand: 'Chrome',
      platform: 'windows',
      lang: 'en-US',
      timezone: 'America/Los_Angeles',
      resolution: '1920,1080',
      hardwareConcurrency: '8',
      webrtcPolicy: 'disable_non_proxied_udp',
      ...EFFECTIVE_RUNTIME_NOISE_CONFIG,
    },
  },
  {
    id: 'mac-chrome-jp',
    name: tr("browser.utils.fingerprintSerializer.name.7d801e8"),
    description: tr("browser.utils.fingerprintSerializer.description.c77c191"),
    config: {
      brand: 'Chrome',
      platform: 'macos',
      lang: 'ja-JP',
      timezone: 'Asia/Tokyo',
      resolution: '1440,900',
      hardwareConcurrency: '8',
      webrtcPolicy: 'disable_non_proxied_udp',
      ...EFFECTIVE_RUNTIME_NOISE_CONFIG,
    },
  },
  {
    id: 'win-chrome-uk-office',
    name: tr("browser.utils.fingerprintSerializer.name.d091129"),
    description: tr("browser.utils.fingerprintSerializer.description.0f59ecf"),
    config: {
      brand: 'Chrome',
      platform: 'windows',
      lang: 'en-GB',
      timezone: 'Europe/London',
      resolution: '1920,1080',
      hardwareConcurrency: '8',
      webrtcPolicy: 'disable_non_proxied_udp',
      ...EFFECTIVE_RUNTIME_NOISE_CONFIG,
    },
  },
  {
    id: 'mac-chrome-us-edu',
    name: tr("browser.utils.fingerprintSerializer.name.f953b21"),
    description: tr("browser.utils.fingerprintSerializer.description.305028b"),
    config: {
      brand: 'Chrome',
      platform: 'macos',
      lang: 'en-US',
      timezone: 'America/New_York',
      resolution: '1440,900',
      hardwareConcurrency: '8',
      webrtcPolicy: 'disable_non_proxied_udp',
      ...EFFECTIVE_RUNTIME_NOISE_CONFIG,
    },
  },
]))

export function applyLocaleToFingerprintArgs(args: string[], lang: string, timezone: string): string[] {
  const nextConfig = deserialize(args || [])
  if (lang) {
    nextConfig.lang = lang
    nextConfig.acceptLang = buildAcceptLanguage(lang)
  }
  if (timezone) nextConfig.timezone = timezone
  return serialize(nextConfig)
}

export function buildAcceptLanguage(lang: string): string {
  const normalized = lang.trim()
  if (!normalized) return ''
  const base = normalized.split(/[-_]/)[0]
  if (!base || base.toLowerCase() === normalized.toLowerCase()) return normalized
  return `${normalized},${base}`
}

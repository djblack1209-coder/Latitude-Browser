import type { BrowserProfileInput, BrowserSettings } from '../types'
import {
  applyLocaleToFingerprintArgs,
  buildAdaptiveDefaultWindowSize,
} from './fingerprintSerializer.ts'

export type AutoConfigNetworkMode = 'proxy' | 'direct'
export type AutoConfigFingerprintMode = 'fixed' | 'constrained-random'

export interface AutoConfigDraftProxyFields {
  networkMode: AutoConfigNetworkMode
  proxyConfig?: string
  proxyConfigRedacted?: boolean
}

/**
 * Local drafts are convenience state, not a secret store. Custom proxy URIs
 * may contain usernames, passwords, tokens, or encoded chain credentials, so
 * never persist their value in localStorage. The returned copy is safe to
 * serialize and leaves the caller's live draft untouched.
 */
export function sanitizeAutoConfigDraft<T extends AutoConfigDraftProxyFields>(draft: T): T & {
  proxyConfig: string
  proxyConfigRedacted: boolean
} {
  const hadProxyConfig = Boolean(draft.proxyConfig?.trim()) || draft.proxyConfigRedacted === true

  return {
    ...draft,
    proxyConfig: '',
    proxyConfigRedacted: draft.networkMode === 'proxy' && hadProxyConfig,
  }
}

export interface AutoConfigBaselineLike {
  screenWidth: number
  screenHeight: number
}

export interface AutoConfigRecommendationLike {
  profileName: string
  locale: string
  timezone: string
}

export interface BuildAutoConfigProfileInputOptions {
  baseline: AutoConfigBaselineLike
  fingerprintMode: AutoConfigFingerprintMode
  networkMode: AutoConfigNetworkMode
  recommendation: AutoConfigRecommendationLike
  settings: BrowserSettings
  proxyConfig?: string
  proxyId?: string
}

const fallbackLaunchArgs = ['--disable-sync', '--no-first-run']

function normalizeArgs(args: string[] | undefined): string[] {
  return (args || []).map((arg) => arg.trim()).filter(Boolean)
}

function hasWindowSize(args: string[]): boolean {
  return args.some((arg) => arg.toLowerCase().startsWith('--window-size='))
}

function resolveFingerprintArgs(
  settings: BrowserSettings,
  recommendation: AutoConfigRecommendationLike,
  baseline: AutoConfigBaselineLike,
): string[] {
  const baseArgs = normalizeArgs(settings.defaultFingerprintArgs)
  const locale = recommendation.locale.trim()
  const timezone = recommendation.timezone.trim().toLowerCase() === 'unknown'
    ? ''
    : recommendation.timezone.trim()
  const localizedArgs = applyLocaleToFingerprintArgs(baseArgs, locale, timezone)

  if (hasWindowSize(localizedArgs)) {
    return localizedArgs
  }

  return [
    ...localizedArgs,
    `--window-size=${buildAdaptiveDefaultWindowSize({
      width: baseline.screenWidth,
      height: baseline.screenHeight,
    })}`,
  ]
}

export function buildAutoConfigProfileInput({
  baseline,
  fingerprintMode,
  networkMode,
  recommendation,
  settings,
  proxyConfig = '',
  proxyId = '',
}: BuildAutoConfigProfileInputOptions): BrowserProfileInput {
  const resolvedProxyId = networkMode === 'proxy' ? proxyId.trim() : ''
  const resolvedProxyConfig = networkMode === 'proxy' ? proxyConfig.trim() : ''
  const configuredLaunchArgs = normalizeArgs(settings.defaultLaunchArgs)

  return {
    profileName: recommendation.profileName,
    userDataDir: '',
    coreId: '',
    restoreLastSession: 'disabled',
    fingerprintArgs: resolveFingerprintArgs(settings, recommendation, baseline),
    proxyId: resolvedProxyId,
    proxyConfig: resolvedProxyConfig,
    memoryLimitMb: 0,
    launchArgs: configuredLaunchArgs.length ? configuredLaunchArgs : fallbackLaunchArgs,
    tags: ['自动配置', fingerprintMode === 'fixed' ? '固定指纹' : '约束随机指纹'],
    keywords: [],
    groupId: '',
  }
}

export function isAutoConfigProxyReady(
  networkMode: AutoConfigNetworkMode | null,
  proxySource: 'pool' | 'custom',
  proxyId: string,
  proxyConfig: string,
): boolean {
  if (!networkMode) return false
  if (networkMode !== 'proxy') return true
  return proxySource === 'pool' ? Boolean(proxyId.trim()) : Boolean(proxyConfig.trim())
}

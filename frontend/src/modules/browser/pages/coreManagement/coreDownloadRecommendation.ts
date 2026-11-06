import { tr } from '../../../../shared/i18n'
export const FINGERPRINT_CHROMIUM_RELEASES_URL = 'https://github.com/adryfish/fingerprint-chromium/releases'

const FINGERPRINT_CHROMIUM_LATEST_RELEASE_API_URL = 'https://api.github.com/repos/adryfish/fingerprint-chromium/releases/latest'
export const CHROME_STABLE_RELEASES_URL = 'https://googlechromelabs.github.io/chrome-for-testing/'
const CHROME_STABLE_API_URL = 'https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json'

type CoreDownloadPlatform = 'windows' | 'linux' | 'darwin' | ''
type CoreDownloadArch = 'amd64' | 'arm64' | ''

export interface CoreDownloadRuntimeEnvironment {
  platform?: string
  arch?: string
}

export interface CoreDownloadTarget {
  platform: CoreDownloadPlatform
  arch: CoreDownloadArch
  label: string
}

export interface CoreDownloadRecommendation {
  target: CoreDownloadTarget
  releaseTag: string
  assetName: string
  downloadUrl: string
  releasesUrl: string
  namePlaceholder: string
}

interface GitHubReleaseAsset {
  name?: string
  browser_download_url?: string
}

interface GitHubReleaseResponse {
  tag_name?: string
  html_url?: string
  assets?: GitHubReleaseAsset[]
}

const archiveSuffixes = ['.zip', '.tar.xz', '.txz', '.tar.gz', '.tgz', '.tar.bz2', '.tbz2', '.tar']

function normalizePlatform(value: string | undefined): CoreDownloadPlatform {
  const text = (value || '').trim().toLowerCase()
  if (text.includes('darwin') || text.includes('mac')) return 'darwin'
  if (text.includes('win')) return 'windows'
  if (text.includes('linux')) return 'linux'
  return ''
}

function normalizeArch(value: string | undefined): CoreDownloadArch {
  const text = (value || '').trim().toLowerCase()
  if (text === 'amd64' || text === 'x64' || text === 'x86_64') return 'amd64'
  if (text === 'arm64' || text === 'aarch64') return 'arm64'
  if (hasAny(text, ['arm64', 'aarch64'])) return 'arm64'
  if (hasAny(text, ['amd64', 'x64', 'x86_64', 'win64', 'wow64'])) return 'amd64'
  return ''
}

function inferNavigatorEnvironment(): CoreDownloadRuntimeEnvironment {
  if (typeof navigator === 'undefined') return {}
  const nav = navigator as Navigator & { userAgentData?: { platform?: string; architecture?: string } }
  const platform = nav.userAgentData?.platform || navigator.platform || ''
  const userAgent = navigator.userAgent || ''
  const archSource = `${nav.userAgentData?.architecture || ''} ${navigator.platform || ''} ${userAgent}`
  return { platform, arch: archSource }
}

export function resolveCoreDownloadTarget(env: CoreDownloadRuntimeEnvironment | null | undefined): CoreDownloadTarget {
  const fallback = inferNavigatorEnvironment()
  const platform = normalizePlatform(env?.platform || fallback.platform)
  const arch = normalizeArch(env?.arch || fallback.arch)
  return { platform, arch, label: formatTargetLabel(platform, arch) }
}

function formatTargetLabel(platform: CoreDownloadPlatform, arch: CoreDownloadArch): string {
  const platformLabel = platform === 'windows' ? 'Windows' : platform === 'linux' ? 'Linux' : platform === 'darwin' ? 'macOS' : tr("browser.pages.coreManagement.coreDownloadRecommendation.formatTargetLabel.4cac14f")
  const archLabel = arch || tr("browser.pages.coreManagement.coreDownloadRecommendation.formatTargetLabel.b130e8c")
  return `${platformLabel} / ${archLabel}`
}

function hasSupportedArchiveSuffix(name: string): boolean {
  const lowerName = name.toLowerCase()
  return archiveSuffixes.some(suffix => lowerName.endsWith(suffix))
}

function hasAny(text: string, keywords: string[]): boolean {
  return keywords.some(keyword => text.includes(keyword))
}

function matchesArch(name: string, arch: CoreDownloadArch): boolean {
  if (arch === 'amd64') return hasAny(name, ['amd64', 'x64', 'x86_64'])
  if (arch === 'arm64') return hasAny(name, ['arm64', 'aarch64'])
  return false
}

function scoreAsset(asset: GitHubReleaseAsset, target: CoreDownloadTarget): number {
  const name = (asset.name || '').toLowerCase()
  if (!name || !asset.browser_download_url || !hasSupportedArchiveSuffix(name)) return -1
  if (!target.platform || !target.arch) return -1

  let score = 0
  if (target.platform === 'windows') {
    if (!name.includes('windows') || !matchesArch(name, target.arch)) return -1
    score += 100
    if (name.endsWith('.zip')) score += 20
  } else if (target.platform === 'linux') {
    if (!name.includes('linux') || !matchesArch(name, target.arch)) return -1
    score += 100
    if (name.endsWith('.tar.xz')) score += 20
  } else if (target.platform === 'darwin') {
    if (!hasAny(name, ['macos', 'darwin'])) return -1
    if (hasAny(name, ['amd64', 'x64', 'x86_64', 'arm64', 'aarch64']) && !matchesArch(name, target.arch)) return -1
    score += 100
  }

  return score
}

function pickReleaseAsset(assets: GitHubReleaseAsset[], target: CoreDownloadTarget): GitHubReleaseAsset | null {
  return assets
    .map(asset => ({ asset, score: scoreAsset(asset, target) }))
    .filter(item => item.score >= 0)
    .sort((left, right) => right.score - left.score || (left.asset.name || '').localeCompare(right.asset.name || ''))[0]?.asset || null
}

export async function fetchCoreDownloadRecommendation(
  env: CoreDownloadRuntimeEnvironment | null | undefined,
  signal?: AbortSignal,
): Promise<CoreDownloadRecommendation | null> {
  const target = resolveCoreDownloadTarget(env)
  // The patched upstream has no macOS assets. macOS uses Google's stable
  // engine explicitly; its stock Chromium does not implement fingerprint flags.
  if (target.platform === 'darwin') {
    const response = await fetch(CHROME_STABLE_API_URL, { signal })
    if (!response.ok) throw new Error(tr("browser.pages.coreManagement.coreDownloadRecommendation.fetchCoreDownloadRecommendation.658a223", [response.status]))
    const data = await response.json() as { channels: { Stable: { version: string; downloads: { chrome: { platform: string; url: string }[] } } } }
    const stable = data.channels.Stable
    const platform = target.arch === 'arm64' ? 'mac-arm64' : target.arch === 'amd64' ? 'mac-x64' : ''
    const asset = stable.downloads.chrome.find(item => item.platform === platform)
    if (!asset) return null
    return { target, releaseTag: stable.version, assetName: `Chrome Stable ${stable.version}`, downloadUrl: asset.url, releasesUrl: CHROME_STABLE_RELEASES_URL, namePlaceholder: `chrome-${stable.version.split('.')[0]}` }
  }
  const response = await fetch(FINGERPRINT_CHROMIUM_LATEST_RELEASE_API_URL, {
    headers: { Accept: 'application/vnd.github+json' },
    signal,
  })
  if (!response.ok) {
    throw new Error(tr("browser.pages.coreManagement.coreDownloadRecommendation.fetchCoreDownloadRecommendation.53b2e94", [response.status]))
  }
  const release = await response.json() as GitHubReleaseResponse
  const asset = pickReleaseAsset(release.assets || [], target)
  if (!asset?.name || !asset.browser_download_url) return null

  const releaseTag = (release.tag_name || '').trim()
  const majorVersion = releaseTag.split('.')[0] || ''
  return {
    target,
    releaseTag,
    assetName: asset.name,
    downloadUrl: asset.browser_download_url,
    releasesUrl: release.html_url || FINGERPRINT_CHROMIUM_RELEASES_URL,
    namePlaceholder: majorVersion ? tr("browser.pages.coreManagement.coreDownloadRecommendation.fetchCoreDownloadRecommendation.e0b3450", [majorVersion]) : tr("browser.pages.coreManagement.CoreDownloadModal.CoreDownloadModal.eff6f43"),
  }
}

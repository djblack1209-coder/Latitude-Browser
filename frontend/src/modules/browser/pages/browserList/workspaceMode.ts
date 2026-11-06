import { getLocale } from '../../../../shared/i18n'
import { tr } from '../../../../shared/i18n'
import type { BrowserProfile } from '../../types'

export type BrowserWorkspaceMode = 'all' | 'recent' | 'attention' | 'templates'

export interface BrowserProfileActivity {
  label: string
  timestamp: string
  time: number
}

export function resolveBrowserWorkspaceMode(searchParams: URLSearchParams): BrowserWorkspaceMode {
  if (searchParams.get('view') === 'templates') return 'templates'
  if (searchParams.get('status') === 'attention') return 'attention'
  if (searchParams.get('sort') === 'recent') return 'recent'
  return 'all'
}

function parseActivityTime(value?: string): number | null {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}

export function getBrowserProfileActivity(profile: BrowserProfile): BrowserProfileActivity | null {
  const candidates: BrowserProfileActivity[] = []
  const startTime = parseActivityTime(profile.lastStartAt)
  const stopTime = parseActivityTime(profile.lastStopAt)

  if (startTime !== null && profile.lastStartAt) {
    candidates.push({ label: tr("browser.pages.BrowserDetailPage.text.3a82007"), timestamp: profile.lastStartAt, time: startTime })
  }
  if (stopTime !== null && profile.lastStopAt) {
    candidates.push({ label: tr("browser.pages.BrowserDetailPage.text.ad1d579"), timestamp: profile.lastStopAt, time: stopTime })
  }

  return candidates.sort((a, b) => b.time - a.time)[0] || null
}

export function compareBrowserProfilesByRecent(a: BrowserProfile, b: BrowserProfile): number {
  const activityA = getBrowserProfileActivity(a)
  const activityB = getBrowserProfileActivity(b)

  if (activityA && activityB && activityA.time !== activityB.time) {
    return activityB.time - activityA.time
  }
  if (activityA && !activityB) return -1
  if (!activityA && activityB) return 1
  return a.profileName.localeCompare(b.profileName, getLocale(), { numeric: true })
}

export function formatBrowserProfileActivity(profile: BrowserProfile): string {
  const activity = getBrowserProfileActivity(profile)
  if (!activity) return tr("browser.pages.browserList.workspaceMode.formatBrowserProfileActivity.d07b04f")

  const date = new Date(activity.timestamp)
  return `${activity.label} ${date.toLocaleString(getLocale())}`
}

export function getBrowserProfileAttentionReasons(
  profile: BrowserProfile,
  hasResolvedCore: boolean,
): string[] {
  const reasons: string[] = []
  const lastError = profile.lastError?.trim()
  const runtimeWarning = profile.runtimeWarning?.trim()

  if (lastError) reasons.push(tr("browser.pages.browserList.workspaceMode.getBrowserProfileAttentionReasons.ff9d961", [lastError]))
  if (runtimeWarning) reasons.push(tr("browser.pages.browserList.workspaceMode.getBrowserProfileAttentionReasons.4594a36", [runtimeWarning]))
  if (!profile.userDataDir?.trim()) reasons.push(tr("browser.pages.browserList.workspaceMode.getBrowserProfileAttentionReasons.85c4099"))
  if (!hasResolvedCore) reasons.push(tr("browser.pages.browserList.workspaceMode.getBrowserProfileAttentionReasons.7557b87"))

  return reasons
}

export function hasReusableFingerprintConfig(profile: BrowserProfile): boolean {
  return (profile.fingerprintArgs || []).some((argument) => argument.trim().length > 0)
}

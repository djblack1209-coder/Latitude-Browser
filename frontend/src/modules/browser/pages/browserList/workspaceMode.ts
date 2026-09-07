import type { BrowserProfile } from '../../types'

export type BrowserWorkspaceMode = 'all' | 'recent' | 'attention' | 'templates'

export interface BrowserProfileActivity {
  label: '最近启动' | '最近停止'
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
    candidates.push({ label: '最近启动', timestamp: profile.lastStartAt, time: startTime })
  }
  if (stopTime !== null && profile.lastStopAt) {
    candidates.push({ label: '最近停止', timestamp: profile.lastStopAt, time: stopTime })
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
  return a.profileName.localeCompare(b.profileName, 'zh-CN', { numeric: true })
}

export function formatBrowserProfileActivity(profile: BrowserProfile): string {
  const activity = getBrowserProfileActivity(profile)
  if (!activity) return '暂无启动或停止记录'

  const date = new Date(activity.timestamp)
  return `${activity.label} ${date.toLocaleString('zh-CN')}`
}

export function getBrowserProfileAttentionReasons(
  profile: BrowserProfile,
  hasResolvedCore: boolean,
): string[] {
  const reasons: string[] = []
  const lastError = profile.lastError?.trim()
  const runtimeWarning = profile.runtimeWarning?.trim()

  if (lastError) reasons.push(`错误：${lastError}`)
  if (runtimeWarning) reasons.push(`运行警告：${runtimeWarning}`)
  if (!profile.userDataDir?.trim()) reasons.push('用户数据目录缺失')
  if (!hasResolvedCore) reasons.push('未找到可用浏览器内核')

  return reasons
}

export function hasReusableFingerprintConfig(profile: BrowserProfile): boolean {
  return profile.fingerprintArgs.some((argument) => argument.trim().length > 0)
}

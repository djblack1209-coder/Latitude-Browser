import type { ProxyCoreState, ProxyCoreStatusResult } from '../types'

/**
 * Canonical names used by the proxy-core status UI.
 *
 * Older configs and mocked bridges can still return aliases such as `singbox`
 * or `clash-meta`; status rows should never expose those as a second core.
 */
export function normalizeProxyCoreName(value?: string): string {
  const normalized = value?.trim().toLowerCase().replace(/_/g, '-') || ''
  switch (normalized) {
    case 'singbox':
    case 'sing-box':
      return 'sing-box'
    case 'clash':
    case 'clash-meta':
    case 'mihomo':
      return 'mihomo'
    case 'xray':
      return 'xray'
    default:
      return value?.trim() || 'unknown'
  }
}

function normalizeProxyCoreState(value?: string): ProxyCoreState | undefined {
  switch (value?.trim().toLowerCase()) {
    case 'ready': return 'ready'
    case 'installed': return 'installed'
    case 'downloaded': return 'downloaded'
    case 'missing': return 'missing'
    case 'unavailable': return 'unavailable'
    default: return undefined
  }
}

/**
 * Normalize bridge responses before deriving labels. Wails responses from old
 * desktop builds do not contain `available`, so absence means available here;
 * only the explicit false value indicates a missing desktop bridge.
 */
export function normalizeProxyCoreStatus(status: Partial<ProxyCoreStatusResult> | null | undefined): ProxyCoreStatusResult {
  const result = status || {}
  return {
    core: normalizeProxyCoreName(result.core),
    goos: result.goos?.trim() || '',
    goarch: result.goarch?.trim() || '',
    installed: result.installed === true || Boolean(result.binaryPath?.trim()),
    configured: result.configured === true,
    active: result.active === true,
    state: normalizeProxyCoreState(result.state),
    binaryPath: result.binaryPath?.trim() || '',
    source: result.source?.trim() || '',
    message: result.message?.trim() || '',
    available: result.available !== false,
  }
}

export type ProxyCoreStatusKind = ProxyCoreState

const GENERIC_PROXY_CORE_STATUS_MESSAGES = new Set([
  '已启用', '已配置', '已安装', '已下载', '已就绪',
  '未安装', '未下载', '当前内核未找到',
  '状态不可用', '未连接后端',
])

export function proxyCoreStatusKind(status: Partial<ProxyCoreStatusResult> | null | undefined): ProxyCoreStatusKind {
  const normalized = normalizeProxyCoreStatus(status)
  if (!normalized.available) return 'unavailable'
  if (normalized.state && normalized.state !== 'unavailable') return normalized.state
  if (normalized.active && !normalized.installed) return 'missing'
  if (normalized.active) return 'ready'
  if (normalized.configured) return 'installed'
  if (normalized.installed && normalized.source.toLowerCase() === 'downloaded') return 'downloaded'
  if (normalized.installed) return 'installed'
  return 'missing'
}

export function proxyCoreStatusLabel(status: Partial<ProxyCoreStatusResult> | null | undefined): string {
  switch (proxyCoreStatusKind(status)) {
    case 'ready': return '已就绪'
    case 'installed': return '已安装'
    case 'downloaded': return '已下载'
    case 'missing': return '缺失'
    case 'unavailable': return '状态不可用'
  }
}

/**
 * Message is a detail, not a second status label. Suppress legacy generic
 * messages that otherwise render as `已安装已下载` or
 * `已启用 · 缺失当前内核未找到` beside the canonical label.
 */
export function proxyCoreStatusDetail(status: Partial<ProxyCoreStatusResult> | null | undefined): string {
  const normalized = normalizeProxyCoreStatus(status)
  const kind = proxyCoreStatusKind(normalized)
  const message = normalized.message
  if (!message) {
    return kind === 'missing' && normalized.active ? '当前连接栈需要该内核' : ''
  }

  // A bridge can pair any of these generic state messages with the boolean
  // fields. They are never useful as a second detail column, regardless of
  // which field won during normalization.
  if (GENERIC_PROXY_CORE_STATUS_MESSAGES.has(message)) {
    return kind === 'missing' && normalized.active ? '当前连接栈需要该内核' : ''
  }
  return message
}

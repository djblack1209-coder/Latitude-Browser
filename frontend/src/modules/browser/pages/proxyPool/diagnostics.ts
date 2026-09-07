import type {
  BrowserProxy,
  ProxyCheckDiagnostic,
  ProxyDiagnosticStage,
  ProxySpeedTestResult,
} from '../../types'

/** A local result is considered stale after the same TTL used by the proxy cache. */
export const PROXY_DIAGNOSTIC_TTL_MS = 12 * 60 * 60 * 1000

export const PROXY_DIAGNOSTIC_STAGES = [
  'not_tested',
  'queued',
  'testing',
  'config_invalid',
  'core_missing',
  'bridge_failed',
  'network_failed',
  'target_failed',
  'unsupported',
  'timeout',
  'stale',
  'expired',
  'success',
  'failed',
] as const

const STAGE_ALIASES: Record<string, ProxyDiagnosticStage> = {
  nottested: 'not_tested',
  'not-tested': 'not_tested',
  pending: 'queued',
  running: 'testing',
  invalid_config: 'config_invalid',
  config: 'config_invalid',
  missing_core: 'core_missing',
  core: 'core_missing',
  bridge: 'bridge_failed',
  network: 'network_failed',
  target: 'target_failed',
  unsupported_protocol: 'unsupported',
  unsupported_protocols: 'unsupported',
  expired_result: 'expired',
  stale_result: 'stale',
  // Backend health-contract stages are intentionally normalized into the
  // compact UI vocabulary so operators see a meaningful phase instead of an
  // opaque implementation enum.
  resolve_config: 'config_invalid',
  resolve_kernel: 'core_missing',
  prepare_bridge: 'bridge_failed',
  request: 'network_failed',
  validate_result: 'target_failed',
  complete: 'success',
  ok: 'success',
  passed: 'success',
  error: 'failed',
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeStage(value: unknown): ProxyDiagnosticStage | undefined {
  const raw = clean(value).toLowerCase()
  if (!raw) return undefined
  const normalized = raw.replace(/\s+/g, '_')
  return STAGE_ALIASES[normalized] || normalized
}

function inferFailureStage(error: string): ProxyDiagnosticStage {
  const value = error.toLowerCase()
  if (!value) return 'failed'
  if (
    value.includes('不支持') ||
    value.includes('unsupported') ||
    value.includes('不可由当前') ||
    value.includes('connector') ||
    value.includes('连接栈') ||
    value.includes('mihomo-only') ||
    value.includes('xray-only')
  ) return 'unsupported'
  if (
    value.includes('内核') ||
    value.includes('core') ||
    value.includes('xray') && (value.includes('not found') || value.includes('missing')) ||
    value.includes('sing-box') && (value.includes('not found') || value.includes('missing')) ||
    value.includes('mihomo') && (value.includes('not found') || value.includes('missing'))
  ) return 'core_missing'
  if (
    value.includes('配置') ||
    value.includes('config') ||
    value.includes('解析') ||
    value.includes('parse') ||
    value.includes('为空') ||
    value.includes('empty')
  ) return 'config_invalid'
  if (value.includes('桥接') || value.includes('bridge') || value.includes('端口') || value.includes('listen')) return 'bridge_failed'
  if (value.includes('timeout') || value.includes('超时') || value.includes('deadline exceeded') || value.includes('i/o timeout')) return 'timeout'
  if (value.includes('目标') || value.includes('target') || value.includes('http status')) return 'target_failed'
  if (value.includes('网络') || value.includes('network') || value.includes('connection refused') || value.includes('dns')) return 'network_failed'
  return 'failed'
}

function inferCode(stage: ProxyDiagnosticStage, error: string): string {
  const value = error.toLowerCase()
  if (stage === 'success') return 'OK'
  if (stage === 'not_tested') return 'NOT_TESTED'
  if (stage === 'queued') return 'QUEUED'
  if (stage === 'testing') return 'TESTING'
  if (stage === 'expired') return 'RESULT_EXPIRED'
  if (stage === 'stale') return 'RESULT_STALE'
  if (stage === 'unsupported') return 'CONNECTOR_UNSUPPORTED'
  if (stage === 'core_missing') return 'CORE_MISSING'
  if (stage === 'config_invalid') return 'CONFIG_INVALID'
  if (stage === 'bridge_failed') return 'BRIDGE_FAILED'
  if (stage === 'timeout') return 'TIMEOUT'
  if (stage === 'target_failed') return 'TARGET_FAILED'
  if (stage === 'network_failed') return 'NETWORK_FAILED'
  if (value.includes('eof')) return 'CONNECTION_EOF'
  if (value.includes('refused') || value.includes('拒绝')) return 'CONNECTION_REFUSED'
  return 'CHECK_FAILED'
}

function normalizeCheckedAt(value: unknown): string | undefined {
  const text = clean(value)
  if (!text) return undefined
  const time = Date.parse(text)
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined
}

function shortMessage(message: string, fallback: string): string {
  const value = message.trim() || fallback
  return value.length > 180 ? `${value.slice(0, 177)}…` : value
}

/**
 * Normalizes both the current Wails payload and newer diagnostic-aware payloads.
 * This intentionally accepts `unknown` so old generated bindings remain usable.
 */
export function normalizeProxyDiagnostic(
  input: Partial<ProxySpeedTestResult> | ProxyCheckDiagnostic | Record<string, unknown> | null | undefined,
  fallback: { proxyId?: string; checkedAt?: string; engine?: string; source?: string } = {},
): ProxyCheckDiagnostic {
  const payload = (input || {}) as Record<string, unknown>
  const nested = payload.diagnostic && typeof payload.diagnostic === 'object'
    ? payload.diagnostic as Record<string, unknown>
    : {}
  const error = clean(payload.error) || clean(payload.message) || clean(nested.error) || clean(nested.message)
  const explicitStage = normalizeStage(payload.stage) || normalizeStage(payload.status) || normalizeStage(nested.stage)
  const ok = payload.ok === true || explicitStage === 'success'
  const checkedAt = normalizeCheckedAt(
    payload.checkedAt || payload.testedAt || payload.timestamp || nested.checkedAt || fallback.checkedAt,
  )
  const stage = explicitStage || (ok ? 'success' : inferFailureStage(error))
  const code = clean(payload.code) || clean(payload.errorCode) || clean(nested.code) || inferCode(stage, error)
  const engine = clean(payload.engine) || clean(nested.engine) || fallback.engine
  const targetUrl = clean(payload.targetUrl) || clean(payload.target) || clean(nested.targetUrl) || clean(nested.target)
  const source = clean(payload.source) || clean(nested.source) || fallback.source

  return {
    proxyId: clean(payload.proxyId) || clean(nested.proxyId) || fallback.proxyId,
    stage,
    code,
    message: stage === 'success' ? '测速通过' : shortMessage(error, failureMessage(stage)),
    error,
    engine: engine || undefined,
    targetUrl: targetUrl || undefined,
    checkedAt,
    stale: payload.stale === true || nested.stale === true,
    expired: payload.expired === true || nested.expired === true,
    source: source || undefined,
  }
}

function failureMessage(stage: ProxyDiagnosticStage): string {
  switch (stage) {
    case 'not_tested': return '尚未执行测速'
    case 'queued': return '等待测速任务'
    case 'testing': return '正在执行测速'
    case 'config_invalid': return '代理配置无法解析'
    case 'core_missing': return '当前连接栈缺少所需内核'
    case 'bridge_failed': return '本地代理桥接未建立'
    case 'network_failed': return '代理网络连接失败'
    case 'target_failed': return '测速目标未返回有效响应'
    case 'unsupported': return '当前连接栈不支持该节点协议'
    case 'timeout': return '测速请求超时'
    case 'stale': return '结果来自旧连接栈或旧配置'
    case 'expired': return '结果已超过有效期'
    case 'success': return '测速通过'
    default: return '测速失败'
  }
}

export function diagnosticForProxy(
  proxy: BrowserProxy,
  local?: ProxyCheckDiagnostic,
): ProxyCheckDiagnostic {
  const backendDiagnostic = proxy.lastTestDiagnostic
  if (backendDiagnostic) {
    return normalizeProxyDiagnostic(backendDiagnostic, {
      proxyId: proxy.proxyId,
      checkedAt: proxy.lastTestedAt,
      engine: proxy.lastTestEngine,
      source: 'backend',
    })
  }
  if (proxy.lastTestedAt) {
    return normalizeProxyDiagnostic({
      proxyId: proxy.proxyId,
      ok: proxy.lastTestOk === true,
      latencyMs: proxy.lastLatencyMs,
      engine: proxy.lastTestEngine,
      stage: proxy.lastTestStage,
      code: proxy.lastTestCode,
      error: proxy.lastTestError,
      targetUrl: proxy.lastTestTargetUrl || proxy.lastTestTarget,
      checkedAt: proxy.lastTestedAt,
    }, { proxyId: proxy.proxyId, source: 'backend' })
  }
  if (local) return local
  return normalizeProxyDiagnostic({ proxyId: proxy.proxyId, stage: 'not_tested' }, { proxyId: proxy.proxyId, source: 'local' })
}

export function applyDiagnosticFreshness(
  diagnostic: ProxyCheckDiagnostic | undefined,
  now = Date.now(),
): ProxyCheckDiagnostic | undefined {
  if (!diagnostic) return undefined
  if (diagnostic.stage === 'not_tested' || diagnostic.stage === 'testing' || diagnostic.stage === 'queued') return diagnostic
  if (diagnostic.expired || diagnostic.stage === 'expired') {
    return { ...diagnostic, stage: 'expired', code: diagnostic.code || 'RESULT_EXPIRED', expired: true }
  }
  if (diagnostic.stale || diagnostic.stage === 'stale') {
    return { ...diagnostic, stage: 'stale', code: diagnostic.code || 'RESULT_STALE', stale: true }
  }
  const checkedAt = diagnostic.checkedAt ? Date.parse(diagnostic.checkedAt) : NaN
  if (!Number.isFinite(checkedAt)) return diagnostic
  if (now - checkedAt >= PROXY_DIAGNOSTIC_TTL_MS) {
    return {
      ...diagnostic,
      stage: 'expired',
      code: 'RESULT_EXPIRED',
      expired: true,
      message: '结果已超过 12 小时有效期',
    }
  }
  return diagnostic
}

export function diagnosticStageLabel(stage?: ProxyDiagnosticStage): string {
  switch (stage) {
    case 'not_tested': return '未检测'
    case 'queued': return '排队中'
    case 'testing': return '检测中'
    case 'config_invalid': return '配置无效'
    case 'core_missing': return '缺少内核'
    case 'bridge_failed': return '桥接失败'
    case 'network_failed': return '网络失败'
    case 'target_failed': return '目标失败'
    case 'unsupported': return '不支持'
    case 'timeout': return '超时'
    case 'stale': return '旧结果'
    case 'expired': return '已过期'
    case 'success': return '通过'
    default: return '失败'
  }
}

export function diagnosticTone(stage?: ProxyDiagnosticStage): 'neutral' | 'success' | 'warning' | 'danger' {
  switch (stage) {
    case 'success': return 'success'
    case 'testing':
    case 'queued': return 'warning'
    case 'not_tested': return 'neutral'
    case 'unsupported':
    case 'core_missing':
    case 'timeout':
    case 'expired':
    case 'stale': return 'warning'
    default: return 'danger'
  }
}

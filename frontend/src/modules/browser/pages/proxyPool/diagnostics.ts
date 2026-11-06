import { sourceText, tr } from '../../../../shared/i18n'
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
    value.includes(sourceText("browser.pages.proxyPool.ProxyPoolTableCard.text.ef8274b")) ||
    value.includes('unsupported') ||
    value.includes(sourceText("browser.pages.proxyPool.diagnostics.inferFailureStage.3835406")) ||
    value.includes('connector') ||
    value.includes(sourceText("config.navigation.config.name.624647e")) ||
    value.includes('mihomo-only') ||
    value.includes('xray-only')
  ) return 'unsupported'
  if (
    value.includes(sourceText("browser.pages.BrowserDetailPage.text.8f190c5")) ||
    value.includes('core') ||
    value.includes('xray') && (value.includes('not found') || value.includes('missing')) ||
    value.includes('sing-box') && (value.includes('not found') || value.includes('missing')) ||
    value.includes('mihomo') && (value.includes('not found') || value.includes('missing'))
  ) return 'core_missing'
  if (
    value.includes(sourceText("browser.components.BrowserProfilesPanel.title.d7d7ce7")) ||
    value.includes('config') ||
    value.includes(sourceText("browser.components.ProxyImportModalView.text.af57b02")) ||
    value.includes('parse') ||
    value.includes(sourceText("browser.pages.proxyPool.diagnostics.inferFailureStage.c7478bb")) ||
    value.includes('empty')
  ) return 'config_invalid'
  if (value.includes(sourceText("browser.pages.proxyPool.diagnostics.inferFailureStage.a76b678")) || value.includes('bridge') || value.includes(sourceText("browser.components.ProxyImportModal.title.6cbb733")) || value.includes('listen')) return 'bridge_failed'
  if (value.includes('timeout') || value.includes(sourceText("browser.pages.proxyPool.ProxyPoolTableCard.text.ff06c24")) || value.includes('deadline exceeded') || value.includes('i/o timeout')) return 'timeout'
  if (value.includes(sourceText("browser.pages.proxyPool.ProxyPoolModals.text.941f083")) || value.includes('target') || value.includes('http status')) return 'target_failed'
  if (value.includes(sourceText("settings.components.SettingsSectionNav.label.0cbda6b")) || value.includes('network') || value.includes('connection refused') || value.includes('dns')) return 'network_failed'
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
  if (value.includes('refused') || value.includes(sourceText("browser.pages.proxyPool.diagnostics.inferCode.03e210a"))) return 'CONNECTION_REFUSED'
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
    message: stage === 'success' ? tr("browser.pages.proxyPool.diagnostics.normalizeProxyDiagnostic.0617254") : shortMessage(error, failureMessage(stage)),
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
    case 'not_tested': return tr("browser.pages.proxyPool.diagnostics.failureMessage.2aed42c")
    case 'queued': return tr("browser.pages.proxyPool.diagnostics.failureMessage.dfad5e3")
    case 'testing': return tr("browser.pages.proxyPool.diagnostics.failureMessage.0aff467")
    case 'config_invalid': return tr("browser.pages.proxyPool.diagnostics.failureMessage.0330dcb")
    case 'core_missing': return tr("browser.pages.proxyPool.diagnostics.failureMessage.5d551b9")
    case 'bridge_failed': return tr("browser.pages.proxyPool.diagnostics.failureMessage.eeef3ae")
    case 'network_failed': return tr("browser.pages.proxyPool.diagnostics.failureMessage.12a0c11")
    case 'target_failed': return tr("browser.pages.proxyPool.diagnostics.failureMessage.47958c8")
    case 'unsupported': return tr("browser.pages.proxyPool.diagnostics.failureMessage.4c7ee7f")
    case 'timeout': return tr("browser.pages.proxyPool.diagnostics.failureMessage.c046795")
    case 'stale': return tr("browser.pages.proxyPool.diagnostics.failureMessage.475b74b")
    case 'expired': return tr("browser.pages.proxyPool.diagnostics.failureMessage.b92523d")
    case 'success': return tr("browser.pages.proxyPool.diagnostics.normalizeProxyDiagnostic.0617254")
    default: return tr("browser.components.BrowserProfilesPanel.ProxyInlineActions.efe2c8c")
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
      message: tr("browser.pages.proxyPool.diagnostics.message.23781ba"),
    }
  }
  return diagnostic
}

export function diagnosticStageLabel(stage?: ProxyDiagnosticStage): string {
  switch (stage) {
    case 'not_tested': return tr("browser.pages.proxyPool.diagnostics.diagnosticStageLabel.90b7498")
    case 'queued': return tr("browser.pages.proxyPool.diagnostics.diagnosticStageLabel.4dcbbcf")
    case 'testing': return tr("browser.pages.proxyPool.diagnostics.diagnosticStageLabel.769ff6f")
    case 'config_invalid': return tr("browser.pages.proxyPool.diagnostics.diagnosticStageLabel.5572391")
    case 'core_missing': return tr("browser.pages.proxyPool.diagnostics.diagnosticStageLabel.885d934")
    case 'bridge_failed': return tr("browser.pages.proxyPool.diagnostics.diagnosticStageLabel.149c7cc")
    case 'network_failed': return tr("browser.pages.proxyPool.diagnostics.diagnosticStageLabel.928299b")
    case 'target_failed': return tr("browser.pages.proxyPool.diagnostics.diagnosticStageLabel.9cc0778")
    case 'unsupported': return tr("browser.pages.proxyPool.ProxyPoolTableCard.text.ef8274b")
    case 'timeout': return tr("browser.pages.proxyPool.ProxyPoolTableCard.text.ff06c24")
    case 'stale': return tr("browser.pages.proxyPool.diagnostics.diagnosticStageLabel.f4c9e96")
    case 'expired': return tr("browser.pages.proxyPool.diagnostics.diagnosticStageLabel.1354374")
    case 'success': return tr("browser.pages.proxyPool.diagnostics.diagnosticStageLabel.dcc4233")
    default: return tr("browser.components.AutomationScriptHistoryModal.getRunStatusLabel.3e3c806")
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

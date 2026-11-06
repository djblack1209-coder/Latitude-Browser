import { tr } from '../../../shared/i18n'
import type { BrowserProxy, ProxyBridgeWarmupResult, ProxyConnectorPreflightResult, ProxyCoreDownloadInfoResult, ProxyCoreStatusResult, ProxyIPHealthResult, ProxyLocationResolveResult, ProxySpeedTestResult } from '../types'
import { normalizeProxyCoreStatus } from '../utils/proxyCoreStatus'
import { getBindings, getGoApp, getMockProxies, nowISOString, setMockProxies } from './runtime'

export interface ClashImportURLResult {
  url: string
  content: string
  proxyCount: number
  dnsServers?: string
  suggestedGroup?: string
}

const DESKTOP_BRIDGE_UNAVAILABLE_CODE = 'DESKTOP_BRIDGE_UNAVAILABLE'
const DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE = tr("browser.api.proxies.message.f8c99a1")

function unavailableSpeedResult(proxyId: string, operation = tr("browser.api.proxies.unavailableSpeedResult.304d8c0")): ProxySpeedTestResult {
  return {
    proxyId,
    ok: false,
    latencyMs: 0,
    engine: 'preview',
    error: tr("browser.api.proxies.error.4a889cc", [operation]),
    stage: 'bridge_failed',
    code: DESKTOP_BRIDGE_UNAVAILABLE_CODE,
    targetUrl: '',
    checkedAt: nowISOString(),
    available: false,
    diagnostic: {
      proxyId,
      stage: 'bridge_failed',
      code: DESKTOP_BRIDGE_UNAVAILABLE_CODE,
      message: DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE,
      error: DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE,
      engine: 'preview',
      checkedAt: nowISOString(),
      source: 'local',
    },
  }
}

function unavailableWarmupResult(proxyId: string): ProxyBridgeWarmupResult {
  return {
    proxyId,
    ok: false,
    engine: 'preview',
    socksUrl: '',
    latencyMs: 0,
    error: DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE,
    stage: 'bridge_failed',
    code: DESKTOP_BRIDGE_UNAVAILABLE_CODE,
    attempted: 0,
    available: false,
  }
}

function unavailableIPHealthResult(proxyId: string): ProxyIPHealthResult {
  const updatedAt = nowISOString()
  return {
    proxyId,
    ok: false,
    source: 'preview',
    error: DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE,
    ip: '',
    fraudScore: 0,
    isResidential: false,
    isBroadcast: false,
    country: '',
    region: '',
    city: '',
    asOrganization: '',
    rawData: {
      _stage: 'bridge_failed',
      _code: DESKTOP_BRIDGE_UNAVAILABLE_CODE,
      _message: DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE,
    },
    updatedAt,
    engine: 'preview',
    stage: 'bridge_failed',
    code: DESKTOP_BRIDGE_UNAVAILABLE_CODE,
    targetUrl: '',
    available: false,
  }
}

export async function fetchBrowserProxies(): Promise<BrowserProxy[]> {
  const bindings: any = await getBindings()
  if (bindings?.BrowserProxyList) {
    return (await bindings.BrowserProxyList()) || []
  }
  return getMockProxies()
}

export async function fetchBrowserProxyGroups(): Promise<string[]> {
  const bindings: any = await getBindings()
  if (bindings?.BrowserProxyListGroups) {
    return (await bindings.BrowserProxyListGroups()) || []
  }
  return []
}

export async function fetchBrowserProxiesByGroup(groupName: string): Promise<BrowserProxy[]> {
  const bindings: any = await getBindings()
  if (bindings?.BrowserProxyListByGroup) {
    return (await bindings.BrowserProxyListByGroup(groupName)) || []
  }
  return getMockProxies().filter((proxy) => proxy.groupName === groupName)
}

export async function fetchClashImportFromURL(targetURL: string, proxyId = ''): Promise<ClashImportURLResult> {
  const bindings: any = await getBindings()
  const trimmedProxyId = proxyId.trim()
  if (trimmedProxyId && bindings?.BrowserProxyFetchClashByURLWithProxy) {
    return (
      (await bindings.BrowserProxyFetchClashByURLWithProxy(targetURL, trimmedProxyId)) || {
        url: targetURL,
        content: '',
        proxyCount: 0,
      }
    )
  }
  if (bindings?.BrowserProxyFetchClashByURL) {
    return (
      (await bindings.BrowserProxyFetchClashByURL(targetURL)) || {
        url: targetURL,
        content: '',
        proxyCount: 0,
      }
    )
  }

  const goApp = getGoApp()
  if (trimmedProxyId && goApp?.BrowserProxyFetchClashByURLWithProxy) {
    return (
      (await goApp.BrowserProxyFetchClashByURLWithProxy(targetURL, trimmedProxyId)) || {
        url: targetURL,
        content: '',
        proxyCount: 0,
      }
    )
  }
  if (goApp?.BrowserProxyFetchClashByURL) {
    return (
      (await goApp.BrowserProxyFetchClashByURL(targetURL)) || {
        url: targetURL,
        content: '',
        proxyCount: 0,
      }
    )
  }

  throw new Error(tr("browser.api.proxies.fetchClashImportFromURL.091e9d5"))
}

export async function saveBrowserProxies(proxies: BrowserProxy[]): Promise<boolean> {
  const bindings: any = await getBindings()
  if (bindings?.SaveBrowserProxies) {
    await bindings.SaveBrowserProxies(proxies)
    return true
  }
  setMockProxies(proxies)
  return true
}

export async function validateProxyConfig(proxyConfig: string, proxyId: string): Promise<{ supported: boolean; errorMsg: string }> {
  const bindings: any = await getBindings()
  if (bindings?.ValidateProxyConfig) {
    return (await bindings.ValidateProxyConfig(proxyConfig, proxyId)) || { supported: true, errorMsg: '' }
  }
  return { supported: true, errorMsg: '' }
}

export async function testProxyConnectivity(proxyId: string, proxyConfig: string): Promise<ProxySpeedTestResult> {
  const bindings: any = await getBindings()
  if (bindings?.TestProxyConnectivity) {
    return (await bindings.TestProxyConnectivity(proxyId, proxyConfig)) || { proxyId, ok: false, latencyMs: 0, engine: 'unknown', error: tr("browser.api.proxies.error.1d1d877") }
  }
  return unavailableSpeedResult(proxyId, tr("browser.api.proxies.testProxyConnectivity.8d9abd7"))
}

export async function testProxyRealConnectivity(proxyId: string): Promise<ProxySpeedTestResult> {
  const bindings: any = await getBindings()
  if (bindings?.TestProxyRealConnectivity) {
    return (await bindings.TestProxyRealConnectivity(proxyId)) || { proxyId, ok: false, latencyMs: 0, engine: 'unknown', error: tr("browser.api.proxies.error.1d1d877") }
  }
  return unavailableSpeedResult(proxyId, tr("browser.api.proxies.testProxyRealConnectivity.5701480"))
}

export async function testProxyRealConnectivityWithConfig(proxyId: string, proxyConfig: string): Promise<ProxySpeedTestResult> {
  const bindings: any = await getBindings()
  if (bindings?.TestProxyRealConnectivityWithConfig) {
    return (await bindings.TestProxyRealConnectivityWithConfig(proxyId, proxyConfig)) || { proxyId, ok: false, latencyMs: 0, engine: 'unknown', error: tr("browser.api.proxies.error.1d1d877") }
  }

  // Keep compatibility with a desktop runtime whose generated App.js has not yet
  // been regenerated after the backend binding was added.
  const goApp = getGoApp()
  if (goApp?.TestProxyRealConnectivityWithConfig) {
    return (await goApp.TestProxyRealConnectivityWithConfig(proxyId, proxyConfig)) || { proxyId, ok: false, latencyMs: 0, engine: 'unknown', error: tr("browser.api.proxies.error.1d1d877") }
  }

  return unavailableSpeedResult(proxyId, tr("browser.api.proxies.testProxyRealConnectivity.5701480"))
}

export async function browserProxyTestSpeed(proxyId: string): Promise<ProxySpeedTestResult> {
  const bindings: any = await getBindings()
  if (bindings?.BrowserProxyTestSpeed) {
    return (await bindings.BrowserProxyTestSpeed(proxyId)) || { proxyId, ok: false, latencyMs: 0, engine: 'unknown', error: tr("browser.api.proxies.error.1d1d877") }
  }
  return unavailableSpeedResult(proxyId)
}

export async function browserProxyBatchTestSpeed(proxyIds: string[], concurrency: number = 20): Promise<ProxySpeedTestResult[]> {
  const bindings: any = await getBindings()
  if (bindings?.BrowserProxyBatchTestSpeed) {
    return (await bindings.BrowserProxyBatchTestSpeed(proxyIds, concurrency)) || []
  }
  return proxyIds.map((proxyId) => unavailableSpeedResult(proxyId))
}

/** Clear the persisted speed result so a refresh cannot resurrect stale diagnostics. */
export async function browserProxyClearSpeedDiagnostic(proxyId: string): Promise<boolean> {
  const bindings: any = await getBindings()
  if (bindings?.BrowserProxyClearSpeedDiagnostic) {
    return (await bindings.BrowserProxyClearSpeedDiagnostic(proxyId)) === true
  }

  // Keep compatibility with a desktop runtime whose generated App.js predates
  // this binding. In browser preview there is no persistence layer to mutate.
  const goApp = getGoApp()
  if (goApp?.BrowserProxyClearSpeedDiagnostic) {
    return (await goApp.BrowserProxyClearSpeedDiagnostic(proxyId)) === true
  }
  return false
}

export async function browserProxyWarmupBridge(proxyId: string): Promise<ProxyBridgeWarmupResult> {
  const bindings: any = await getBindings()
  if (bindings?.BrowserProxyWarmupBridge) {
    return (await bindings.BrowserProxyWarmupBridge(proxyId)) || {
      proxyId,
      ok: false,
      engine: '',
      socksUrl: '',
      latencyMs: 0,
      error: tr("browser.api.proxies.error.1d1d877"),
    }
  }
  return unavailableWarmupResult(proxyId)
}

export async function browserProxyWarmupBridgeWithConfig(proxyId: string, proxyConfig: string): Promise<ProxyBridgeWarmupResult> {
  const bindings: any = await getBindings()
  if (bindings?.BrowserProxyWarmupBridgeWithConfig) {
    return (await bindings.BrowserProxyWarmupBridgeWithConfig(proxyId, proxyConfig)) || {
      proxyId,
      ok: false,
      engine: '',
      socksUrl: '',
      latencyMs: 0,
      error: tr("browser.api.proxies.error.1d1d877"),
    }
  }
  return browserProxyWarmupBridge(proxyId)
}

export async function browserProxyBatchWarmupBridge(proxyIds: string[], concurrency: number = 5): Promise<ProxyBridgeWarmupResult[]> {
  const bindings: any = await getBindings()
  if (bindings?.BrowserProxyBatchWarmupBridge) {
    return (await bindings.BrowserProxyBatchWarmupBridge(proxyIds, concurrency)) || []
  }
  return proxyIds.map((proxyId) => unavailableWarmupResult(proxyId))
}

export async function browserProxyCheckIPHealth(proxyId: string): Promise<ProxyIPHealthResult> {
  const bindings: any = await getBindings()
  if (bindings?.BrowserProxyCheckIPHealth) {
    return (
      (await bindings.BrowserProxyCheckIPHealth(proxyId)) || {
        proxyId,
        ok: false,
        source: 'ip_health',
        error: tr("browser.api.proxies.error.1d1d877"),
        ip: '',
        fraudScore: 0,
        isResidential: false,
        isBroadcast: false,
        country: '',
        region: '',
        city: '',
        asOrganization: '',
        rawData: {},
        updatedAt: nowISOString(),
      }
    )
  }

  return unavailableIPHealthResult(proxyId)
}

export async function browserProxyResolveLocation(proxyId: string): Promise<ProxyLocationResolveResult> {
  const bindings: any = await getBindings()
  if (bindings?.BrowserProxyResolveLocation) {
    return (await bindings.BrowserProxyResolveLocation(proxyId)) || {
      proxyId,
      ok: false,
      auto: false,
      source: 'location',
      error: tr("browser.api.proxies.error.1d1d877"),
      ip: '',
      country: '',
      region: '',
      city: '',
      timezone: '',
      lang: '',
      resolvedAt: nowISOString(),
    }
  }

  return {
    proxyId,
    ok: false,
    auto: false,
    source: 'preview',
    error: DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE,
    ip: '',
    country: '',
    region: '',
    city: '',
    timezone: '',
    lang: '',
    resolvedAt: nowISOString(),
    available: false,
  }
}

export async function browserProxyBatchCheckIPHealth(proxyIds: string[], concurrency: number = 10): Promise<ProxyIPHealthResult[]> {
  const bindings: any = await getBindings()
  if (bindings?.BrowserProxyBatchCheckIPHealth) {
    return (await bindings.BrowserProxyBatchCheckIPHealth(proxyIds, concurrency)) || []
  }

  return proxyIds.map((proxyId) => unavailableIPHealthResult(proxyId))
}

export async function browserProxyConnectorPreflight(connectorType = '', goos = '', goarch = ''): Promise<ProxyConnectorPreflightResult> {
  const fallback: ProxyConnectorPreflightResult = {
    connectorType: connectorType.trim() || 'xray',
    goos,
    goarch,
    ready: false,
    state: 'unavailable',
    requiredCores: connectorType.trim().toLowerCase() === 'mihomo' ? ['mihomo'] : ['xray', 'sing-box'],
    missingCores: [],
    cores: [],
    message: tr("browser.api.proxies.message.2de16c7"),
    available: false,
  }
  const bindings: any = await getBindings()
  if (bindings?.BrowserProxyConnectorPreflight) {
    const result = await bindings.BrowserProxyConnectorPreflight({ connectorType, goos, goarch })
    if (!result) return fallback
    return { ...result, available: result.available !== false }
  }
  return fallback
}

export async function browserProxyCoreDownload(core: string, goos: string, goarch: string, proxyConfig = ''): Promise<boolean> {
  const bindings: any = await getBindings()
  if (bindings?.BrowserProxyCoreDownload) {
    await bindings.BrowserProxyCoreDownload({ core, goos, goarch, proxyConfig })
    return true
  }
  return false
}

export async function browserProxyCoreStatus(core: string, goos: string, goarch: string): Promise<ProxyCoreStatusResult> {
  const fallback = (message: string, available = false): ProxyCoreStatusResult => normalizeProxyCoreStatus({
    core, goos, goarch, installed: false, configured: false, active: false, binaryPath: '', source: '', message, available,
  })
  const bindings: any = await getBindings()
  if (bindings?.BrowserProxyCoreStatus) {
    const result = await bindings.BrowserProxyCoreStatus({ core, goos, goarch })
    if (!result) return fallback(tr("browser.api.proxies.browserProxyCoreStatus.64e9487"))
    return { ...normalizeProxyCoreStatus(result), available: result.available !== false }
  }
  return fallback(tr("browser.api.proxies.message.2de16c7"))
}

export async function browserProxyCoreDownloadInfo(core: string, goos: string, goarch: string, proxyConfig = ''): Promise<ProxyCoreDownloadInfoResult> {
  const bindings: any = await getBindings()
  if (bindings?.BrowserProxyCoreDownloadInfo) {
    return (await bindings.BrowserProxyCoreDownloadInfo({ core, goos, goarch, proxyConfig })) || {
      core, goos, goarch, version: '', repo: '', releaseUrl: '', downloadUrl: '', assetName: '', installDir: '', binaryName: '', message: tr("browser.api.proxies.message.9cafc85"),
    }
  }
  return { core, goos, goarch, version: '', repo: '', releaseUrl: '', downloadUrl: '', assetName: '', installDir: '', binaryName: '', message: tr("browser.api.proxies.message.2de16c7") }
}

export async function browserProxyCoreOpenLocal(core: string, goos: string, goarch: string): Promise<boolean> {
  const bindings: any = await getBindings()
  if (bindings?.BrowserProxyCoreOpenLocal) {
    await bindings.BrowserProxyCoreOpenLocal({ core, goos, goarch })
    return true
  }
  return false
}

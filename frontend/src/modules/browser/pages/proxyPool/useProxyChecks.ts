import { useEffect, useState } from 'react'
import { toast } from '../../../../shared/components'
import { EventsOn } from '../../../../wailsjs/runtime/runtime'
import {
  browserProxyBatchCheckIPHealth,
  browserProxyBatchTestSpeed,
  browserProxyBatchWarmupBridge,
  browserProxyCheckIPHealth,
  browserProxyClearSpeedDiagnostic,
  browserProxyTestSpeed,
  browserProxyWarmupBridge,
} from '../../api'
import type { BrowserProxy, ProxyCheckDiagnostic, ProxyIPHealthResult, ProxySpeedTestResult } from '../../types'
import type { ProxyDisplayInfo } from './helpers'
import {
  applyDiagnosticFreshness,
  diagnosticForProxy,
  normalizeProxyDiagnostic,
} from './diagnostics'
import { toLatencyValue, type ProxyConnectorStack } from './storage'
import {
  readIPHealthCache,
  readLatencyCache,
  readLatencyDiagnosticCache,
  readLatencyEngineCache,
  writeIPHealthCache,
  writeLatencyCache,
  writeLatencyDiagnosticCache,
  writeLatencyEngineCache,
} from './storage'

interface UseProxyChecksOptions {
  connectorType?: string | null
  proxies: BrowserProxy[]
}

function diagnosticTimestamp(diagnostic?: ProxyCheckDiagnostic): number {
  const value = diagnostic?.checkedAt ? Date.parse(diagnostic.checkedAt) : NaN
  return Number.isFinite(value) ? value : 0
}

function isNewerDiagnostic(candidate: ProxyCheckDiagnostic, current?: ProxyCheckDiagnostic): boolean {
  if (!current) return true
  if (current.source === 'local' && (current.stage === 'testing' || current.stage === 'queued')) return false
  const candidateTime = diagnosticTimestamp(candidate)
  const currentTime = diagnosticTimestamp(current)
  if (candidateTime === 0 || currentTime === 0) return candidate.source === 'backend' && current.source !== 'backend'
  if (candidateTime === currentTime) return candidate.source === 'backend' && current.source !== 'backend'
  return candidateTime > currentTime
}

function ipHealthTimestamp(result?: ProxyIPHealthResult): number {
  const value = result?.updatedAt ? Date.parse(result.updatedAt) : NaN
  return Number.isFinite(value) ? value : 0
}

function isNewerIPHealth(candidate: ProxyIPHealthResult, current?: ProxyIPHealthResult): boolean {
  if (!current) return true
  const candidateTime = ipHealthTimestamp(candidate)
  const currentTime = ipHealthTimestamp(current)
  if (candidateTime === 0 || currentTime === 0) return candidateTime > 0 && currentTime === 0
  return candidateTime >= currentTime
}

/**
 * Hydrates the backend's persisted JSON payload without trusting it to carry
 * a valid proxy id. This keeps IP-health failures visible after reload while
 * preserving a newer in-memory result from the current session.
 */
function parsePersistedIPHealth(proxy: BrowserProxy): ProxyIPHealthResult | null {
  const raw = proxy.lastIPHealthJson?.trim()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const value = parsed as Partial<ProxyIPHealthResult>
    const numberValue = (candidate: unknown) => {
      const numeric = Number(candidate)
      return Number.isFinite(numeric) ? numeric : 0
    }
    const textValue = (candidate: unknown) => typeof candidate === 'string' ? candidate : ''
    return {
      proxyId: proxy.proxyId,
      ok: value.ok === true,
      source: textValue(value.source) || 'ip_health',
      error: textValue(value.error),
      ip: textValue(value.ip),
      fraudScore: numberValue(value.fraudScore),
      isResidential: value.isResidential === true,
      isBroadcast: value.isBroadcast === true,
      country: textValue(value.country),
      region: textValue(value.region),
      city: textValue(value.city),
      asOrganization: textValue(value.asOrganization),
      rawData: value.rawData && typeof value.rawData === 'object' ? value.rawData as Record<string, any> : {},
      updatedAt: textValue(value.updatedAt),
      engine: textValue(value.engine) || undefined,
      stage: textValue(value.stage) || undefined,
      code: textValue(value.code) || undefined,
      targetUrl: textValue(value.targetUrl) || undefined,
      available: value.available,
    }
  } catch {
    return null
  }
}

export function useProxyChecks({ proxies, connectorType }: UseProxyChecksOptions) {
  const stack: ProxyConnectorStack = connectorType?.trim().toLowerCase() === 'mihomo' ? 'mihomo' : 'xray'
  const [latencyMap, setLatencyMap] = useState<Record<string, number>>({})
  const [latencyEngineMap, setLatencyEngineMap] = useState<Record<string, string>>({})
  const [latencyErrorMap, setLatencyErrorMap] = useState<Record<string, string>>({})
  const [latencyDiagnosticMap, setLatencyDiagnosticMap] = useState<Record<string, ProxyCheckDiagnostic>>({})
  const [testingAll, setTestingAll] = useState(false)
  const [ipHealthMap, setIPHealthMap] = useState<Record<string, ProxyIPHealthResult>>({})
  const [checkingIPHealthIds, setCheckingIPHealthIds] = useState<Set<string>>(new Set())
  const [checkingAllIPHealth, setCheckingAllIPHealth] = useState(false)
  const [warmingBridgeIds, setWarmingBridgeIds] = useState<Set<string>>(new Set())
  const [warmingAllBridges, setWarmingAllBridges] = useState(false)
  const [ipHealthDetailOpen, setIPHealthDetailOpen] = useState(false)
  const [currentIPHealthDetail, setCurrentIPHealthDetail] = useState<ProxyIPHealthResult | null>(null)

  useEffect(() => {
    setLatencyMap(readLatencyCache(stack))
    setLatencyEngineMap(readLatencyEngineCache(stack))
    setLatencyDiagnosticMap(readLatencyDiagnosticCache(stack))
    setIPHealthMap(readIPHealthCache(stack))
  }, [stack])

  useEffect(() => {
    writeLatencyCache(latencyMap, stack)
  }, [latencyMap, stack])

  useEffect(() => {
    writeLatencyEngineCache(latencyEngineMap, stack)
  }, [latencyEngineMap, stack])

  useEffect(() => {
    writeLatencyDiagnosticCache(latencyDiagnosticMap, stack)
  }, [latencyDiagnosticMap, stack])

  useEffect(() => {
    writeIPHealthCache(ipHealthMap, stack)
  }, [ipHealthMap, stack])

  useEffect(() => {
    if (!proxies.length) return
    const validIds = new Set(proxies.map(p => p.proxyId))
    const backendDiagnostics = proxies.reduce<Record<string, ProxyCheckDiagnostic>>((next, proxy) => {
      if (proxy.proxyConfig === 'direct://') return next
      if (proxy.lastTestedAt || proxy.lastTestDiagnostic) {
        next[proxy.proxyId] = applyDiagnosticFreshness(diagnosticForProxy(proxy)) || diagnosticForProxy(proxy)
      }
      return next
    }, {})

    const backendIPHealth = proxies.reduce<Record<string, ProxyIPHealthResult>>((next, proxy) => {
      if (proxy.proxyConfig === 'direct://') return next
      const result = parsePersistedIPHealth(proxy)
      if (result) next[proxy.proxyId] = result
      return next
    }, {})

    setLatencyDiagnosticMap(prev => {
      let changed = false
      const next: Record<string, ProxyCheckDiagnostic> = {}
      Object.entries(prev).forEach(([proxyId, diagnostic]) => {
        if (validIds.has(proxyId)) next[proxyId] = diagnostic
        else changed = true
      })
      Object.entries(backendDiagnostics).forEach(([proxyId, diagnostic]) => {
        if (isNewerDiagnostic(diagnostic, next[proxyId])) {
          next[proxyId] = diagnostic
          changed = true
        }
      })
      return changed ? next : prev
    })

    setLatencyMap(prev => {
      let changed = false
      const next: Record<string, number> = {}
      Object.entries(prev).forEach(([proxyId, latency]) => {
        if (validIds.has(proxyId)) next[proxyId] = latency
        else changed = true
      })
      // The backend persists the latest check result. Prefer it over an older
      // browser-local failure, while retaining the local result when it is newer.
      proxies.forEach(proxy => {
        if (!proxy.lastTestedAt || proxy.proxyConfig === 'direct://') return
        const latency = Number(proxy.lastLatencyMs)
        const local = latencyDiagnosticMap[proxy.proxyId]
        const backend = backendDiagnostics[proxy.proxyId]
        if (local && backend && !isNewerDiagnostic(backend, local)) return
        const nextLatency = proxy.lastTestOk === true && Number.isFinite(latency) && latency >= 0
          ? latency
          : toLatencyValue(false, 0, proxy.lastTestError || backend?.error || '最近一次测速失败')
        if (next[proxy.proxyId] !== nextLatency) {
          next[proxy.proxyId] = nextLatency
          changed = true
        }
      })
      return changed ? next : prev
    })

    setLatencyEngineMap(prev => {
      let changed = false
      const next: Record<string, string> = {}
      Object.entries(prev).forEach(([proxyId, engine]) => {
        if (validIds.has(proxyId)) next[proxyId] = engine
        else changed = true
      })
      proxies.forEach(proxy => {
        const engine = proxy.lastTestEngine || backendDiagnostics[proxy.proxyId]?.engine
        if (engine && next[proxy.proxyId] !== engine) {
          next[proxy.proxyId] = engine
          changed = true
        }
      })
      return changed ? next : prev
    })

    setLatencyErrorMap(prev => {
      let changed = false
      const next: Record<string, string> = {}
      Object.entries(prev).forEach(([proxyId, error]) => {
        if (validIds.has(proxyId)) next[proxyId] = error
        else changed = true
      })
      Object.entries(backendDiagnostics).forEach(([proxyId, diagnostic]) => {
        if (diagnostic.error || (diagnostic.stage && diagnostic.stage !== 'success')) {
          const message = diagnostic.error || diagnostic.message || '最近一次测速失败'
          if (next[proxyId] !== message) {
            next[proxyId] = message
            changed = true
          }
        } else if (next[proxyId]) {
          delete next[proxyId]
          changed = true
        }
      })
      return changed ? next : prev
    })

    setIPHealthMap(prev => {
      let changed = false
      const next: Record<string, ProxyIPHealthResult> = {}
      Object.entries(prev).forEach(([proxyId, health]) => {
        if (validIds.has(proxyId)) next[proxyId] = health
        else changed = true
      })
      Object.entries(backendIPHealth).forEach(([proxyId, health]) => {
        if (isNewerIPHealth(health, next[proxyId])) {
          next[proxyId] = health
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [latencyDiagnosticMap, proxies])

  const applySpeedResult = (result: ProxySpeedTestResult) => {
    const checkedAt = result.checkedAt || new Date().toISOString()
    const diagnostic = applyDiagnosticFreshness(normalizeProxyDiagnostic(result, {
      proxyId: result.proxyId,
      checkedAt,
      engine: result.engine,
      source: 'backend',
    })) || normalizeProxyDiagnostic(result, { proxyId: result.proxyId, checkedAt, source: 'backend' })
    const val = toLatencyValue(result.ok, result.latencyMs, result.error)
    setLatencyMap(prev => ({ ...prev, [result.proxyId]: val }))
    setLatencyDiagnosticMap(prev => ({ ...prev, [result.proxyId]: diagnostic }))
    setLatencyErrorMap(prev => {
      const next = { ...prev }
      if (result.error) next[result.proxyId] = result.error
      else delete next[result.proxyId]
      return next
    })
    setLatencyEngineMap(prev => {
      const next = { ...prev }
      if (result.engine) next[result.proxyId] = result.engine
      else delete next[result.proxyId]
      return next
    })
  }

  const handleTestOne = async (record: ProxyDisplayInfo) => {
    if (record.proxyConfig === 'direct://') {
      toast.info('直连模式无需测速')
      return
    }
    setLatencyMap(prev => ({ ...prev, [record.proxyId]: -1 }))
    setLatencyDiagnosticMap(prev => ({
      ...prev,
      [record.proxyId]: normalizeProxyDiagnostic({ proxyId: record.proxyId, stage: 'testing' }, { source: 'local' }),
    }))
    setLatencyEngineMap(prev => {
      const next = { ...prev }
      delete next[record.proxyId]
      return next
    })
    setLatencyErrorMap(prev => {
      const next = { ...prev }
      delete next[record.proxyId]
      return next
    })
    try {
      const result = await browserProxyTestSpeed(record.proxyId)
      applySpeedResult(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '测速失败')
      applySpeedResult({
        proxyId: record.proxyId,
        ok: false,
        latencyMs: 0,
        engine: '',
        error: message,
        stage: 'failed',
        code: 'CHECK_REQUEST_FAILED',
      })
      toast.error(`${record.proxyName}：${message}`)
    }
  }

  const handleTestAll = async (items: ProxyDisplayInfo[]) => {
    const testable = items.filter(p => p.proxyConfig !== 'direct://')
    if (testable.length === 0) return
    setTestingAll(true)
    const init: Record<string, number> = {}
    const initDiagnostics: Record<string, ProxyCheckDiagnostic> = {}
    testable.forEach(p => {
      init[p.proxyId] = -1
      initDiagnostics[p.proxyId] = normalizeProxyDiagnostic({ proxyId: p.proxyId, stage: 'testing' }, { source: 'local' })
    })
    setLatencyMap(prev => ({ ...prev, ...init }))
    setLatencyDiagnosticMap(prev => ({ ...prev, ...initDiagnostics }))
    setLatencyEngineMap(prev => {
      const next = { ...prev }
      testable.forEach(p => { delete next[p.proxyId] })
      return next
    })
    setLatencyErrorMap(prev => {
      const next = { ...prev }
      testable.forEach(p => { delete next[p.proxyId] })
      return next
    })

    const runtime = typeof window !== 'undefined' ? (window as any).runtime : undefined
    const off = typeof runtime?.EventsOnMultiple === 'function'
      ? EventsOn('proxy:speed:result', (data: ProxySpeedTestResult) => {
          if (!data?.proxyId || !testable.some(item => item.proxyId === data.proxyId)) return
          applySpeedResult(data)
        })
      : undefined

    try {
      const proxyIds = testable.map(p => p.proxyId)
      const results = await browserProxyBatchTestSpeed(proxyIds, 0)
      results.forEach(applySpeedResult)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '批量测速失败')
      testable.forEach(proxy => applySpeedResult({
        proxyId: proxy.proxyId,
        ok: false,
        latencyMs: 0,
        engine: '',
        error: message,
        stage: 'failed',
        code: 'BATCH_CHECK_FAILED',
      }))
      toast.error(`批量测速失败：${message}`)
    } finally {
      off?.()
      setTestingAll(false)
    }
  }

  const handleClearDiagnostic = async (proxyId: string) => {
    // Clear the durable desktop result first. Local state is cleared even when
    // an older runtime does not expose the new binding, so the action remains
    // useful during rolling upgrades.
    try {
      await browserProxyClearSpeedDiagnostic(proxyId)
    } catch {
      // Keep the local clear path deterministic; the next desktop refresh will
      // expose whether the persisted result could be cleared.
    }
    setLatencyMap(prev => {
      const next = { ...prev }
      delete next[proxyId]
      return next
    })
    setLatencyEngineMap(prev => {
      const next = { ...prev }
      delete next[proxyId]
      return next
    })
    setLatencyErrorMap(prev => {
      const next = { ...prev }
      delete next[proxyId]
      return next
    })
    setLatencyDiagnosticMap(prev => ({
      ...prev,
      [proxyId]: normalizeProxyDiagnostic({
        proxyId,
        stage: 'not_tested',
        code: 'CLEARED',
        message: '已清除旧结果，等待重新检测',
        checkedAt: new Date().toISOString(),
      }, { source: 'local' }),
    }))
  }

  const handleWarmupOne = async (record: ProxyDisplayInfo) => {
    if (record.proxyConfig === 'direct://') {
      toast.info('直连模式无需预热')
      return
    }
    if (warmingBridgeIds.has(record.proxyId)) return

    setWarmingBridgeIds(prev => new Set(prev).add(record.proxyId))
    try {
      const result = await browserProxyWarmupBridge(record.proxyId)
      if (result.ok) toast.success(`${record.proxyName} 已预热`)
      else toast.error(result.error || `${record.proxyName} 预热失败`)
    } finally {
      setWarmingBridgeIds(prev => {
        const next = new Set(prev)
        next.delete(record.proxyId)
        return next
      })
    }
  }

  const handleWarmupAll = async (items: ProxyDisplayInfo[]) => {
    const testable = items.filter(p => p.proxyConfig !== 'direct://')
    if (testable.length === 0) return
    setWarmingAllBridges(true)
    const ids = testable.map(p => p.proxyId)
    setWarmingBridgeIds(prev => new Set([...Array.from(prev), ...ids]))
    try {
      const results = await browserProxyBatchWarmupBridge(ids, 5)
      const failed = results.filter(r => !r.ok).length
      if (failed > 0) toast.info(`预热完成：成功 ${results.length - failed}，失败 ${failed}`)
      else toast.success(`预热完成：共 ${results.length} 条`)
    } finally {
      setWarmingBridgeIds(prev => {
        const next = new Set(prev)
        ids.forEach(id => next.delete(id))
        return next
      })
      setWarmingAllBridges(false)
    }
  }

  const handleCheckOneIPHealth = async (record: ProxyDisplayInfo) => {
    if (record.proxyConfig === 'direct://') {
      toast.info('直连模式无需检测')
      return
    }
    if (checkingIPHealthIds.has(record.proxyId)) return

    setCheckingIPHealthIds(prev => new Set(prev).add(record.proxyId))
    try {
      const result = await browserProxyCheckIPHealth(record.proxyId)
      setIPHealthMap(prev => ({ ...prev, [record.proxyId]: result }))
      if (!result.ok) toast.error(result.error || `${record.proxyName} 检测失败`)
    } finally {
      setCheckingIPHealthIds(prev => {
        const next = new Set(prev)
        next.delete(record.proxyId)
        return next
      })
    }
  }

  const handleCheckAllIPHealth = async (items: ProxyDisplayInfo[]) => {
    const testable = items.filter(p => p.proxyConfig !== 'direct://')
    if (testable.length === 0) return
    setCheckingAllIPHealth(true)

    const ids = testable.map(p => p.proxyId)
    const idSet = new Set(ids)
    setCheckingIPHealthIds(prev => new Set([...Array.from(prev), ...ids]))

    const runtime = typeof window !== 'undefined' ? (window as any).runtime : undefined
    const off = typeof runtime?.EventsOnMultiple === 'function'
      ? EventsOn('proxy:iphealth:result', (data: ProxyIPHealthResult) => {
          if (!data?.proxyId || !idSet.has(data.proxyId)) return
          setIPHealthMap(prev => ({ ...prev, [data.proxyId]: data }))
          setCheckingIPHealthIds(prev => {
            const next = new Set(prev)
            next.delete(data.proxyId)
            return next
          })
        })
      : undefined

    try {
      const results = await browserProxyBatchCheckIPHealth(ids, 10)
      setIPHealthMap(prev => {
        const next = { ...prev }
        results.forEach(result => {
          if (result?.proxyId && idSet.has(result.proxyId)) next[result.proxyId] = result
        })
        return next
      })
      const failed = results.filter(r => !r.ok).length
      if (failed > 0) toast.info(`IP 健康检测完成：成功 ${results.length - failed}，失败 ${failed}`)
      else toast.success(`IP 健康检测完成：共 ${results.length} 条`)
    } finally {
      off?.()
      setCheckingIPHealthIds(prev => {
        const next = new Set(prev)
        ids.forEach(id => next.delete(id))
        return next
      })
      setCheckingAllIPHealth(false)
    }
  }

  const openIPHealthDetail = (proxyId: string) => {
    const result = ipHealthMap[proxyId]
    if (!result) return
    setCurrentIPHealthDetail(result)
    setIPHealthDetailOpen(true)
  }

  return {
    latencyMap,
    latencyEngineMap,
    latencyErrorMap,
    latencyDiagnosticMap,
    testingAll,
    ipHealthMap,
    checkingIPHealthIds,
    checkingAllIPHealth,
    warmingBridgeIds,
    warmingAllBridges,
    ipHealthDetailOpen,
    setIPHealthDetailOpen,
    currentIPHealthDetail,
    setLatencyMap,
    setLatencyEngineMap,
    setLatencyDiagnosticMap,
    setIPHealthMap,
    handleTestOne,
    handleTestAll,
    handleClearDiagnostic,
    handleWarmupOne,
    handleWarmupAll,
    handleCheckOneIPHealth,
    handleCheckAllIPHealth,
    openIPHealthDetail,
  }
}

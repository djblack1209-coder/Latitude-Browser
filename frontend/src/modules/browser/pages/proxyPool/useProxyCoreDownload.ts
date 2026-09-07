import { useCallback, useEffect, useState } from 'react'
import { toast } from '../../../../shared/components'
import { browserProxyConnectorPreflight, browserProxyCoreDownload, browserProxyCoreStatus, fetchBrowserSettings } from '../../api'
import type { ProxyConnectorPreflightResult, ProxyCoreDownloadProgress, ProxyCoreStatusResult } from '../../types'
import { EventsOff, EventsOn } from '../../../../wailsjs/runtime/runtime'

type ConnectorStack = 'xray' | 'mihomo'

function defaultProxyCoreTarget(): { goos: string; goarch: string } {
  const platform = navigator.platform.toLowerCase()
  const userAgent = navigator.userAgent.toLowerCase()
  const goos = platform.includes('mac') ? 'darwin' : platform.includes('linux') ? 'linux' : 'windows'
  const goarch = platform.includes('arm') || userAgent.includes('arm64') || userAgent.includes('aarch64') ? 'arm64' : 'amd64'
  return { goos, goarch }
}

function normalizeConnectorStack(value?: string): ConnectorStack {
  return value?.trim().toLowerCase() === 'mihomo' ? 'mihomo' : 'xray'
}

function connectorStackCores(stack: ConnectorStack): string[] {
  // The xray setting names the combined Xray + sing-box stack. Mihomo is a
  // separate stack and must never be silently mixed into the status query.
  return stack === 'mihomo' ? ['mihomo'] : ['xray', 'sing-box']
}

export function useProxyCoreDownload() {
  const defaultTarget = defaultProxyCoreTarget()
  const [coreDownloadOpen, setCoreDownloadOpen] = useState(false)
  const [coreDownloadType, setCoreDownloadType] = useState('xray')
  const [coreDownloadGOOS, setCoreDownloadGOOS] = useState(defaultTarget.goos)
  const [coreDownloadGOARCH, setCoreDownloadGOARCH] = useState(defaultTarget.goarch)
  const [coreDownloadProxy, setCoreDownloadProxy] = useState('')
  const [coreDownloadProgress, setCoreDownloadProgress] = useState<ProxyCoreDownloadProgress | null>(null)
  const [currentConnectorType, setCurrentConnectorType] = useState<ConnectorStack | null>(null)
  const [currentConnectorStatuses, setCurrentConnectorStatuses] = useState<ProxyCoreStatusResult[]>([])
  const [currentConnectorPreflight, setCurrentConnectorPreflight] = useState<ProxyConnectorPreflightResult | null>(null)
  const [currentConnectorStatusLoading, setCurrentConnectorStatusLoading] = useState(false)
  const [downloadCoreStatus, setDownloadCoreStatus] = useState<ProxyCoreStatusResult | null>(null)
  const [downloadCoreStatusLoading, setDownloadCoreStatusLoading] = useState(false)

  const refreshCurrentConnectorStatus = useCallback(async (stack: ConnectorStack) => {
    setCurrentConnectorStatusLoading(true)
    try {
      const [statuses, preflight] = await Promise.all([
        Promise.all(connectorStackCores(stack).map(core => browserProxyCoreStatus(core, '', ''))),
        browserProxyConnectorPreflight(stack, '', ''),
      ])
      setCurrentConnectorStatuses(statuses)
      setCurrentConnectorPreflight(preflight)
      return statuses
    } catch (error) {
      // Never keep previously successful component counts when the current
      // desktop bridge/status read failed.
      setCurrentConnectorStatuses([])
      setCurrentConnectorPreflight(null)
      throw error
    } finally {
      setCurrentConnectorStatusLoading(false)
    }
  }, [])

  const refreshDownloadCoreStatus = useCallback(async (
    core = coreDownloadType,
    goos = coreDownloadGOOS,
    goarch = coreDownloadGOARCH,
  ) => {
    setDownloadCoreStatusLoading(true)
    try {
      const status = await browserProxyCoreStatus(core, goos, goarch)
      setDownloadCoreStatus(status)
      return status
    } catch (error) {
      setDownloadCoreStatus(null)
      throw error
    } finally {
      setDownloadCoreStatusLoading(false)
    }
  }, [coreDownloadType, coreDownloadGOOS, coreDownloadGOARCH])

  const loadBrowserSettings = useCallback(async () => {
    try {
      const settings = await fetchBrowserSettings()
      const stack = normalizeConnectorStack(settings.defaultConnectorType)
      setCurrentConnectorType(stack)
      await refreshCurrentConnectorStatus(stack)
    } catch (error: any) {
      setCurrentConnectorType(null)
      setCurrentConnectorStatuses([])
      setCurrentConnectorPreflight(null)
      toast.error(error?.message || '读取代理连接栈状态失败')
    }
  }, [refreshCurrentConnectorStatus])

  useEffect(() => {
    let cancelled = false
    const runtime = typeof window !== 'undefined' ? (window as any).runtime : undefined

    // Vite/browser previews do not install the Wails runtime. Calling the
    // generated Environment wrapper there throws synchronously before a
    // Promise exists, so guard the native capability first.
    if (typeof runtime?.Environment !== 'function') return

    void Promise.resolve()
      .then(() => runtime.Environment())
      .then(environment => {
        if (cancelled) return
        const goos = ['windows', 'linux', 'darwin'].includes(environment.platform) ? environment.platform : ''
        const goarch = ['amd64', 'arm64', '386'].includes(environment.arch) ? environment.arch : ''
        if (goos) setCoreDownloadGOOS(goos)
        if (goarch) setCoreDownloadGOARCH(goarch)
      })
      .catch(() => {
        // Keep the navigator-based download fallback when Wails runtime details are unavailable.
      })

    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const onProgress = (data: ProxyCoreDownloadProgress) => {
      setCoreDownloadProgress(data)
      if (data.phase === 'done') {
        toast.success(data.message || '代理内核已安装')
        void refreshDownloadCoreStatus(data.core, data.goos, data.goarch)
        if (currentConnectorType && connectorStackCores(currentConnectorType).includes(data.core)) {
          void refreshCurrentConnectorStatus(currentConnectorType)
        }
      }
      if (data.phase === 'error') toast.error(data.message || '代理内核下载失败')
    }

    const runtime = typeof window !== 'undefined' ? (window as any).runtime : undefined
    if (typeof runtime?.EventsOnMultiple !== 'function') return

    EventsOn('proxy-core:download:progress', onProgress)
    return () => EventsOff('proxy-core:download:progress')
  }, [currentConnectorType, refreshCurrentConnectorStatus, refreshDownloadCoreStatus])

  useEffect(() => {
    if (coreDownloadOpen) void refreshDownloadCoreStatus(coreDownloadType, coreDownloadGOOS, coreDownloadGOARCH)
  }, [coreDownloadOpen, coreDownloadType, coreDownloadGOOS, coreDownloadGOARCH, refreshDownloadCoreStatus])

  const handleStartCoreDownload = useCallback(async () => {
    const downloadProxy = coreDownloadProxy.trim()
    setCoreDownloadProgress({ core: coreDownloadType, goos: coreDownloadGOOS, goarch: coreDownloadGOARCH, phase: 'starting', progress: 0, message: downloadProxy ? `准备下载（指定代理：${downloadProxy}）` : '准备下载（直连）' })
    try {
      const started = await browserProxyCoreDownload(coreDownloadType, coreDownloadGOOS, coreDownloadGOARCH, downloadProxy)
      if (!started) throw new Error('下载服务未连接后端；请在 Latitude Browser 桌面应用中重试')
    } catch (error: any) {
      const message = error?.message || '启动下载失败'
      setCoreDownloadProgress({ core: coreDownloadType, goos: coreDownloadGOOS, goarch: coreDownloadGOARCH, phase: 'error', progress: 0, message })
      toast.error(message)
    }
  }, [coreDownloadProxy, coreDownloadType, coreDownloadGOOS, coreDownloadGOARCH])

  const openCoreDownload = useCallback(() => {
    setCoreDownloadProgress(null)
    setCoreDownloadOpen(true)
    void refreshDownloadCoreStatus()
  }, [refreshDownloadCoreStatus])

  const closeCoreDownload = useCallback(() => {
    setCoreDownloadOpen(false)
    setCoreDownloadProgress(null)
  }, [])

  return {
    coreDownloadOpen,
    setCoreDownloadOpen,
    coreDownloadType,
    setCoreDownloadType,
    coreDownloadGOOS,
    setCoreDownloadGOOS,
    coreDownloadGOARCH,
    setCoreDownloadGOARCH,
    coreDownloadProxy,
    setCoreDownloadProxy,
    coreDownloadProgress,
    currentConnectorType,
    currentConnectorStatuses,
    currentConnectorPreflight,
    currentConnectorStatusLoading,
    downloadCoreStatus,
    downloadCoreStatusLoading,
    loadBrowserSettings,
    handleStartCoreDownload,
    openCoreDownload,
    closeCoreDownload,
  }
}

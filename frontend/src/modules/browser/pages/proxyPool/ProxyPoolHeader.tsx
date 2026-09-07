import { BookOpen, Download, Gauge, HeartPulse, Plus, RefreshCw, Settings2 } from 'lucide-react'
import { Button } from '../../../../shared/components'
import { NetworkGlobe } from '../../../../shared/components/NetworkGlobe'
import { TelemetryStrip, WorkspaceHeader } from '../../../../shared/components/SignalPrimitives'
import type { ProxyConnectorPreflightResult, ProxyCoreStatusResult } from '../../types'
import { normalizeProxyCoreStatus, proxyCoreStatusDetail, proxyCoreStatusKind, proxyCoreStatusLabel } from '../../utils/proxyCoreStatus'

interface ProxyPoolHeaderProps {
  checkingAllIPHealth: boolean
  configuredCount: number
  currentConnectorStatuses: ProxyCoreStatusResult[]
  currentConnectorPreflight?: ProxyConnectorPreflightResult | null
  currentConnectorStatusLoading: boolean
  currentConnectorType: string | null
  hasURLImportSources: boolean
  ipCheckedCount: number
  ipFailedCount: number
  ipPassedCount: number
  measuredCount: number
  measuredFailedCount: number
  measuredPassedCount: number
  nodeCount: number
  onCheckAllIPHealth: () => void
  onOpenImport: () => void
  onOpenCoreDownload: () => void
  onOpenSettings: () => void
  onOpenUsageGuide: () => void
  onRefreshAllSources: () => void
  onTestAll: () => void
  refreshingAllSources: boolean
  testingAll: boolean
  visibleCount: number
  visibleNodeCount: number
}

const CORE_LABELS: Record<string, string> = {
  xray: 'Xray',
  'sing-box': 'sing-box',
  mihomo: 'Mihomo',
}

function stackLabel(connectorType: string | null) {
  if (!connectorType) return '未读取'
  return connectorType === 'mihomo' ? 'Mihomo' : 'Xray + sing-box'
}

function stackDescription(connectorType: string | null) {
  if (!connectorType) return '连接栈设置尚未成功读取'
  return connectorType === 'mihomo'
    ? '独立 Mihomo 栈'
    : 'Xray + sing-box 按协议分工'
}

export function ProxyPoolHeader({
  checkingAllIPHealth,
  configuredCount,
  currentConnectorStatuses,
  currentConnectorPreflight,
  currentConnectorStatusLoading,
  currentConnectorType,
  hasURLImportSources,
  ipCheckedCount,
  ipFailedCount,
  ipPassedCount,
  measuredCount,
  measuredFailedCount,
  measuredPassedCount,
  nodeCount,
  onCheckAllIPHealth,
  onOpenImport,
  onOpenCoreDownload,
  onOpenSettings,
  onOpenUsageGuide,
  onRefreshAllSources,
  onTestAll,
  refreshingAllSources,
  testingAll,
  visibleCount,
  visibleNodeCount,
}: ProxyPoolHeaderProps) {
  const normalizedConnectorStatuses = currentConnectorStatuses.map(normalizeProxyCoreStatus)
  const anyStackComponentActive = normalizedConnectorStatuses.some(status => status.installed && status.active)
  const installedCount = normalizedConnectorStatuses.filter(status => status.installed).length
  const expectedCoreCount = currentConnectorType ? (currentConnectorType === 'mihomo' ? 1 : 2) : 0
  const statusUnavailable = normalizedConnectorStatuses.some(status => status.available === false)
  const preflightUnavailable = currentConnectorPreflight?.available === false
  const preflightBlocked = Boolean(currentConnectorPreflight && !currentConnectorPreflight.ready)
  const checksBlocked = preflightUnavailable || preflightBlocked
  const missingCoreNames = (currentConnectorPreflight?.missingCores || []).map(core => CORE_LABELS[core] || core)
  const preflightSummary = preflightUnavailable
    ? '桌面桥接不可用'
    : preflightBlocked
      ? missingCoreNames.length > 0
        ? `缺少 ${missingCoreNames.join('、')}`
        : currentConnectorPreflight?.message || '连接栈未就绪'
      : ''
  const checksBlockedReason = preflightSummary || '当前连接栈未就绪'
  const statusSummary = preflightSummary || (currentConnectorStatusLoading
    ? '正在读取组件状态'
    : statusUnavailable
      ? '组件状态无法读取'
      : normalizedConnectorStatuses.length === 0
        ? '组件状态未读取'
        : `${installedCount}/${expectedCoreCount} 个组件已安装`)

  return (
    <WorkspaceHeader
      eyebrow="NETWORK / PROXY POOL"
      title="代理池"
      description="管理代理节点，按当前连接栈执行测速与出口 IP 检查。"
      className="network-workspace-header"
      actions={(
        <>
          <Button size="sm" variant="ghost" onClick={onOpenUsageGuide} className="gap-1.5">
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
            使用说明
          </Button>
          <Button size="sm" variant="secondary" onClick={onOpenCoreDownload} className="gap-1.5">
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            内核管理
          </Button>
          <Button size="sm" variant="secondary" onClick={onOpenSettings} className="gap-1.5">
            <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
            检测参数
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={onRefreshAllSources}
            loading={refreshingAllSources}
            disabled={!hasURLImportSources}
            title={hasURLImportSources ? '刷新所有订阅来源' : '暂无订阅来源'}
            className="gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            刷新订阅
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={onCheckAllIPHealth}
            loading={checkingAllIPHealth}
            disabled={visibleNodeCount === 0 || checksBlocked}
            title={checksBlocked ? checksBlockedReason : visibleNodeCount === 0 ? '暂无可检测的代理节点' : '检测代理出口 IP'}
            className="gap-1.5"
          >
            <HeartPulse className="h-3.5 w-3.5" aria-hidden="true" />
            IP 检测
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={onTestAll}
            loading={testingAll}
            disabled={visibleNodeCount === 0 || checksBlocked}
            title={checksBlocked ? checksBlockedReason : visibleNodeCount === 0 ? '暂无可测速的代理节点' : '测试代理延迟'}
            className="gap-1.5"
          >
            <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
            全部测速
          </Button>
          <Button size="sm" onClick={onOpenImport} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            导入代理
          </Button>
        </>
      )}
    >
      <div className="network-stack-overview">
        <div className="network-stack-copy">
          <div className="network-stack-heading">
            <div>
              <span className="network-stack-label">当前连接栈</span>
              <strong>{stackLabel(currentConnectorType)}</strong>
            </div>
            <span className="network-stack-summary" data-active={!checksBlocked && anyStackComponentActive ? 'true' : 'false'}>
              <span aria-hidden="true" />
              {statusSummary}
            </span>
          </div>
          <p>{stackDescription(currentConnectorType)}</p>
          {checksBlocked && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--color-warning)]" role="status">
              <span>{checksBlockedReason}</span>
              {preflightBlocked && !preflightUnavailable && (
                <Button size="sm" variant="ghost" onClick={onOpenCoreDownload} className="h-7 px-2 text-xs">
                  管理内核
                </Button>
              )}
            </div>
          )}
          <div className="network-core-status-list" aria-live="polite">
            {currentConnectorStatusLoading && normalizedConnectorStatuses.length === 0 ? (
              <span className="network-core-status-placeholder">正在读取本机组件状态…</span>
            ) : normalizedConnectorStatuses.length === 0 ? (
              <span className="network-core-status-placeholder">暂无可显示的组件状态</span>
            ) : normalizedConnectorStatuses.map(status => {
              const detail = proxyCoreStatusDetail(status)
              return (
                <div className="network-core-status" key={status.core}>
                  <span className="network-core-name">{CORE_LABELS[status.core] || status.core}</span>
                  <span className="network-core-state" data-state={proxyCoreStatusKind(status)}>
                    {proxyCoreStatusLabel(status)}
                  </span>
                  {detail ? <span className="network-core-message" title={detail}>{detail}</span> : <span className="network-core-message" aria-hidden="true" />}
                </div>
              )
            })}
          </div>
          <TelemetryStrip
            className="network-telemetry-strip"
            items={[
              {
                label: '配置项',
                value: configuredCount,
                detail: visibleCount === configuredCount ? '当前全部可见' : `当前筛选显示 ${visibleCount}`,
              },
              {
                label: '代理节点',
                value: nodeCount,
                detail: '不含直连配置',
                tone: nodeCount > 0 ? 'accent' : 'neutral',
              },
              {
                label: '已测速',
                value: `${measuredCount} / ${nodeCount}`,
                detail: measuredCount > 0 ? `成功 ${measuredPassedCount}，未通过 ${measuredFailedCount}` : '尚未执行节点测速',
                tone: measuredFailedCount > 0 ? 'warning' : measuredPassedCount > 0 ? 'success' : 'neutral',
              },
              {
                label: 'IP 检测',
                value: `${ipCheckedCount} / ${nodeCount}`,
                detail: ipCheckedCount > 0 ? `通过 ${ipPassedCount}，失败 ${ipFailedCount}` : '尚未执行 IP 检测',
                tone: ipFailedCount > 0 ? 'warning' : ipPassedCount > 0 ? 'success' : 'neutral',
              },
            ]}
          />
        </div>
        <div className="network-globe-figure">
          <NetworkGlobe
            className="network-globe"
            label="网络示意 · 不代表实时路由"
            active={anyStackComponentActive}
          />
        </div>
      </div>

    </WorkspaceHeader>
  )
}

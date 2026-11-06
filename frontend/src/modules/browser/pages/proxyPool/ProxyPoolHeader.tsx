import { translateMessage } from '../../../../shared/i18n'
import { tr, useLocale } from '../../../../shared/i18n'
import { BookOpen, Download, Gauge, HeartPulse, Plus, RefreshCw, Settings2 } from 'lucide-react'
import { Button } from '../../../../shared/components'
import { WorkspaceHeader } from '../../../../shared/components/SignalPrimitives'
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

export function ProxyPoolHeader({
  checkingAllIPHealth,
  currentConnectorStatuses,
  currentConnectorPreflight,
  currentConnectorStatusLoading,
  hasURLImportSources,
  onCheckAllIPHealth,
  onOpenImport,
  onOpenCoreDownload,
  onOpenSettings,
  onOpenUsageGuide,
  onRefreshAllSources,
  onTestAll,
  refreshingAllSources,
  testingAll,
  visibleNodeCount,
}: ProxyPoolHeaderProps) {
  useLocale()

  const normalizedConnectorStatuses = currentConnectorStatuses.map(normalizeProxyCoreStatus)
  const preflightUnavailable = currentConnectorPreflight?.available === false
  const preflightBlocked = Boolean(currentConnectorPreflight && !currentConnectorPreflight.ready)
  const checksBlocked = preflightUnavailable || preflightBlocked
  const missingCoreNames = (currentConnectorPreflight?.missingCores || []).map(core => CORE_LABELS[core] || core)
  const preflightSummary = preflightUnavailable
    ? tr("browser.pages.proxyPool.ProxyPoolHeader.ProxyPoolHeader.f6c202a")
    : preflightBlocked
      ? missingCoreNames.length > 0
        ? tr("browser.pages.proxyPool.ProxyPoolHeader.ProxyPoolHeader.b0f1e76", [missingCoreNames.join('、')])
        : currentConnectorPreflight?.message || tr("browser.pages.proxyPool.ProxyPoolHeader.ProxyPoolHeader.28e4331")
      : ''
  const checksBlockedReason = preflightSummary || tr("browser.pages.proxyPool.ProxyPoolHeader.ProxyPoolHeader.e73d75c")


  return (
    <WorkspaceHeader

      title={tr("config.navigation.config.name.9830ee8")}

      className="network-workspace-header"
      actions={(
        <>
          <Button size="sm" variant="ghost" onClick={onOpenUsageGuide} className="gap-1.5">
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />{tr("browser.pages.proxyPool.ProxyPoolHeader.text.15683f6")}</Button>
          <Button size="sm" variant="secondary" onClick={onOpenCoreDownload} className="gap-1.5">
            <Download className="h-3.5 w-3.5" aria-hidden="true" />{tr("browser.components.BrowserListLayout.text.6de3e8f")}</Button>
          <Button size="sm" variant="secondary" onClick={onOpenSettings} className="gap-1.5">
            <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />{tr("browser.pages.proxyPool.ProxyPoolHeader.text.51bfd61")}</Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={onRefreshAllSources}
            loading={refreshingAllSources}
            disabled={!hasURLImportSources}
            title={hasURLImportSources ? tr("browser.pages.proxyPool.ProxyPoolHeader.ProxyPoolHeader.4a75ec8") : tr("browser.pages.proxyPool.ProxyPoolHeader.ProxyPoolHeader.3b24329")}
            className="gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />{tr("browser.pages.proxyPool.ProxyPoolHeader.text.dd92fb9")}</Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={onCheckAllIPHealth}
            loading={checkingAllIPHealth}
            disabled={visibleNodeCount === 0 || checksBlocked}
            title={checksBlocked ? checksBlockedReason : visibleNodeCount === 0 ? tr("browser.pages.proxyPool.ProxyPoolHeader.ProxyPoolHeader.2c2ae62") : tr("browser.pages.proxyPool.ProxyPoolHeader.ProxyPoolHeader.df88849")}
            className="gap-1.5"
          >
            <HeartPulse className="h-3.5 w-3.5" aria-hidden="true" />{tr("browser.pages.proxyPool.ProxyPoolHeader.text.b89cad2")}</Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={onTestAll}
            loading={testingAll}
            disabled={visibleNodeCount === 0 || checksBlocked}
            title={checksBlocked ? checksBlockedReason : visibleNodeCount === 0 ? tr("browser.pages.proxyPool.ProxyPoolHeader.ProxyPoolHeader.ab93c24") : tr("browser.pages.proxyPool.ProxyPoolHeader.ProxyPoolHeader.ce322bd")}
            className="gap-1.5"
          >
            <Gauge className="h-3.5 w-3.5" aria-hidden="true" />{tr("browser.components.ProxyPickerModal.text.5413b89")}</Button>
          <Button size="sm" onClick={onOpenImport} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />{tr("browser.components.ProxyPickerModal.text.3d5c1ee")}</Button>
        </>
      )}
    >
      <div className="network-stack-overview">
        <div className="network-stack-copy">
          {checksBlocked && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--color-warning)]" role="status">
              <span>{translateMessage(checksBlockedReason)}</span>
              {preflightBlocked && !preflightUnavailable && (
                <Button size="sm" variant="ghost" onClick={onOpenCoreDownload} className="h-7 px-2 text-xs">{tr("browser.pages.proxyPool.ProxyPoolHeader.text.0f0ae97")}</Button>
              )}
            </div>
          )}
          <div className="network-core-status-list" aria-live="polite">
            {currentConnectorStatusLoading && normalizedConnectorStatuses.length === 0 ? (
              <span className="network-core-status-placeholder">{tr("browser.pages.proxyPool.ProxyPoolHeader.text.05bb6a4")}</span>
            ) : normalizedConnectorStatuses.length === 0 ? (
              <span className="network-core-status-placeholder">{tr("browser.pages.proxyPool.ProxyPoolHeader.text.f7a146e")}</span>
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

        </div>
      </div>

    </WorkspaceHeader>
  )
}

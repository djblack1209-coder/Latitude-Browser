import { Activity, BookOpen, Download, Gauge, HeartPulse, Plus, RefreshCw, Settings2 } from 'lucide-react'
import { Button } from '../../../../shared/components'

interface ProxyPoolHeaderProps {
  checkingAllIPHealth: boolean
  currentConnectorStatus: string
  hasURLImportSources: boolean
  onCheckAllIPHealth: () => void
  onOpenImport: () => void
  onOpenCoreDownload: () => void
  onOpenSettings: () => void
  onOpenUsageGuide: () => void
  onRefreshAllSources: () => void
  onTestAll: () => void
  refreshingAllSources: boolean
  testingAll: boolean
  totalCount: number
}

export function ProxyPoolHeader({
  checkingAllIPHealth,
  currentConnectorStatus,
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
  totalCount,
}: ProxyPoolHeaderProps) {
  const connectorReady = currentConnectorStatus && !/未知|未安装|不可用|失败/i.test(currentConnectorStatus)

  return (
    <header className="flex flex-col gap-4 border-b border-[var(--color-border-default)] pb-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
          <Activity className="h-3.5 w-3.5 text-[var(--color-accent)]" aria-hidden="true" />
          Network / Proxy pool
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-[var(--color-text-primary)]">代理池配置</h1>
          <span className="font-mono text-xs text-[var(--color-text-muted)]">{totalCount} 个代理</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        <div className="flex h-8 items-center gap-2 border-r border-[var(--color-border-default)] pr-2 text-xs text-[var(--color-text-muted)]">
          <span className={`h-1.5 w-1.5 rounded-full ${connectorReady ? 'bg-[var(--color-success)]' : 'bg-[var(--color-warning)]'}`} aria-hidden="true" />
          <span className="max-w-[150px] truncate" title={currentConnectorStatus || '未知'}>
            {currentConnectorStatus || '内核状态未知'}
          </span>
          <Button size="sm" variant="ghost" onClick={onOpenCoreDownload} title="下载或更新代理内核" className="gap-1.5 px-2">
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            内核
          </Button>
        </div>

        <Button size="sm" variant="secondary" onClick={onOpenSettings} className="gap-1.5">
          <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
          检测设置
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
          disabled={totalCount === 0}
          className="gap-1.5"
        >
          <HeartPulse className="h-3.5 w-3.5" aria-hidden="true" />
          IP 健康
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={onTestAll}
          loading={testingAll}
          disabled={totalCount === 0}
          className="gap-1.5"
        >
          <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
          测试全部
        </Button>
        <Button size="sm" variant="ghost" onClick={onOpenUsageGuide} className="gap-1.5">
          <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
          使用说明
        </Button>
        <Button size="sm" onClick={onOpenImport} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          导入代理
        </Button>
      </div>
    </header>
  )
}

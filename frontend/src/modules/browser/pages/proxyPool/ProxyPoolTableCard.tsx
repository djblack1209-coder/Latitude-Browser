import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Search, Trash2, X } from 'lucide-react'

import { Button, Input, Switch, Table } from '../../../../shared/components'
import { SignalEmptyState } from '../../../../shared/components/SignalPrimitives'
import type { SortOrder, TableColumn } from '../../../../shared/components/Table'
import type { ProxyCheckDiagnostic, ProxyIPHealthResult, ProxyDiagnosticStage } from '../../types'
import { diagnosticStageLabel, diagnosticTone, normalizeProxyDiagnostic } from './diagnostics'

import { BUILTIN_PROXY_IDS, sourceHostLabel, type ProxyDisplayInfo } from './helpers'

interface ProxyPoolTableCardProps {
  allFilteredSelected: boolean
  checkingIPHealthIds: Set<string>
  data: ProxyDisplayInfo[]
  filterGroup: string
  filterKeyword: string
  filterProtocol: string
  filterAvailableOnly: boolean
  globalAutoRefreshEnabled: boolean
  globalRefreshInterval: number
  globalRefreshIntervalM: string
  groups: string[]
  ipHealthMap: Record<string, ProxyIPHealthResult>
  loading: boolean
  onCheckOneIPHealth: (record: ProxyDisplayInfo) => void
  onClearDiagnostic: (proxyId: string) => void
  onClearFilters: () => void
  onDelete: (proxyId: string) => void
  onEdit: (record: ProxyDisplayInfo) => void
  onFilterGroupChange: (nextValue: string) => void
  onFilterKeywordChange: (nextValue: string) => void
  onFilterProtocolChange: (nextValue: string) => void
  onFilterAvailableOnlyChange: (checked: boolean) => void
  onGlobalAutoRefreshEnabledChange: (checked: boolean) => void
  onGlobalRefreshIntervalMChange: (nextValue: string) => void
  onOpenBatchDelete: () => void
  onOpenIPHealthDetail: (proxyId: string) => void
  onRefreshSingleSource: (sourceId: string) => void
  onSort: (next: { column: string; order: SortOrder }) => void
  onTestOne: (record: ProxyDisplayInfo) => void
  onToggleAll: () => void
  onToggleOne: (proxyId: string) => void
  protocolOptions: string[]
  refreshingSourceIds: Set<string>
  selectedCount: number
  selectedIds: Set<string>
  someFilteredSelected: boolean
  sortColumn: string
  sortOrder: SortOrder
  latencyMap: Record<string, number>
  latencyEngineMap: Record<string, string>
  latencyErrorMap: Record<string, string>
  latencyDiagnosticMap: Record<string, ProxyCheckDiagnostic>
}

export function ProxyPoolTableCard({
  allFilteredSelected,
  checkingIPHealthIds,
  data,
  filterGroup,
  filterKeyword,
  filterProtocol,
  filterAvailableOnly,
  globalAutoRefreshEnabled,
  globalRefreshInterval,
  globalRefreshIntervalM,
  groups,
  ipHealthMap,
  loading,
  onCheckOneIPHealth,
  onClearDiagnostic,
  onClearFilters,
  onDelete,
  onEdit,
  onFilterGroupChange,
  onFilterKeywordChange,
  onFilterProtocolChange,
  onFilterAvailableOnlyChange,
  onGlobalAutoRefreshEnabledChange,
  onGlobalRefreshIntervalMChange,
  onOpenBatchDelete,
  onOpenIPHealthDetail,
  onRefreshSingleSource,
  onSort,
  onTestOne,
  onToggleAll,
  onToggleOne,
  protocolOptions,
  refreshingSourceIds,
  selectedCount,
  selectedIds,
  someFilteredSelected,
  sortColumn,
  sortOrder,
  latencyMap,
  latencyEngineMap,
  latencyErrorMap,
  latencyDiagnosticMap,
}: ProxyPoolTableCardProps) {
  const hasActiveFilters = filterProtocol !== 'all' || !!filterKeyword || filterGroup !== 'all' || filterAvailableOnly
  const [openMoreProxyId, setOpenMoreProxyId] = useState<string | null>(null)
  const [moreMenuPlacement, setMoreMenuPlacement] = useState<'up' | 'down'>('down')

  useEffect(() => {
    const closeMoreMenu = () => {
      setOpenMoreProxyId(null)
      setMoreMenuPlacement('down')
    }
    document.addEventListener('click', closeMoreMenu)
    return () => document.removeEventListener('click', closeMoreMenu)
  }, [])

  const resolveMoreMenuPlacement = (button: HTMLElement, menuHeight: number) => {
    const buttonRect = button.getBoundingClientRect()
    const scrollParent = button.closest('.overflow-auto')
    const scrollParentRect = scrollParent?.getBoundingClientRect()
    const boundaryTop = Math.max(0, scrollParentRect?.top ?? 0)
    const boundaryBottom = Math.min(window.innerHeight, scrollParentRect?.bottom ?? window.innerHeight)
    const availableAbove = buttonRect.top - boundaryTop
    const availableBelow = boundaryBottom - buttonRect.bottom
    return availableBelow < menuHeight && availableAbove > availableBelow ? 'up' : 'down'
  }

  const renderLatency = (record: ProxyDisplayInfo) => {
    if (record.proxyConfig === 'direct://') {
      return <span className="text-[var(--color-text-muted)] text-xs">不适用</span>
    }
    const value = latencyMap[record.proxyId]
    if (value === undefined) return <span className="text-[var(--color-text-muted)] text-xs">-</span>
    if (value === -1) return <span className="text-[var(--color-text-muted)] text-xs animate-pulse">测试中...</span>
    const error = latencyErrorMap[record.proxyId] || ''
    if (value === -2) return <span className="text-[var(--color-error)] text-xs" title={error || '测速超时'}>超时</span>
    if (value === -3) return <span className="text-gray-400 text-xs" title={error || '协议不支持'}>不支持</span>
    if (value === -4) return <span className="text-[var(--color-error)] text-xs" title={error || '测速失败'}>失败</span>
    const color = value < 200
      ? 'text-[var(--color-success)]'
      : value < 500
        ? 'text-[var(--color-warning)]'
        : 'text-[var(--color-error)]'
    return <span className={`font-mono text-xs font-semibold tabular-nums ${color}`}>{value} ms</span>
  }

  const renderLatencyEngine = (record: ProxyDisplayInfo) => {
    if (record.proxyConfig === 'direct://') {
      return <span className="text-[var(--color-text-muted)] text-xs">不适用</span>
    }
    const value = latencyMap[record.proxyId]
    if (value === undefined) return <span className="text-[var(--color-text-muted)] text-xs">-</span>
    if (value === -1) return <span className="text-[var(--color-text-muted)] text-xs animate-pulse">-</span>
    return latencyEngineMap[record.proxyId]
      ? <span className="text-xs text-[var(--color-text-secondary)] whitespace-nowrap">{latencyEngineMap[record.proxyId]}</span>
      : <span className="text-[var(--color-text-muted)] text-xs">-</span>
  }

  const renderDiagnostic = (record: ProxyDisplayInfo) => {
    if (record.proxyConfig === 'direct://') {
      return <span className="text-[var(--color-text-muted)] text-xs">不适用</span>
    }
    const value = latencyMap[record.proxyId]
    const diagnostic = latencyDiagnosticMap[record.proxyId]
    const inferredStage: ProxyDiagnosticStage = diagnostic?.stage
      || (value === undefined ? 'not_tested' : value === -1 ? 'testing' : value >= 0 ? 'success' : value === -2 ? 'timeout' : value === -3 ? 'unsupported' : 'failed')
    const tone = diagnosticTone(inferredStage)
    const toneClass = tone === 'success'
      ? 'border-[var(--color-success-border)] bg-[var(--color-success-muted)] text-[var(--color-success)]'
      : tone === 'warning'
        ? 'border-[var(--color-warning-border)] bg-[var(--color-warning-muted)] text-[var(--color-warning)]'
        : tone === 'danger'
          ? 'border-[var(--color-error-border)] bg-[var(--color-error-muted)] text-[var(--color-error)]'
          : 'border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)]'
    const code = diagnostic?.code || (inferredStage === 'success' ? 'OK' : '')
    const message = diagnostic?.message || latencyErrorMap[record.proxyId] || (inferredStage === 'not_tested' ? '等待执行测速' : '')
    return (
      <div className="min-w-0 max-w-[190px]" title={[code, diagnostic?.error || message].filter(Boolean).join(' · ')}>
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={`inline-flex shrink-0 items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-medium ${toneClass}`}>
            {diagnosticStageLabel(inferredStage)}
          </span>
          {code && <code className="truncate font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-muted)]">{code}</code>}
        </div>
        {message && <div className="mt-1 truncate text-[11px] text-[var(--color-text-muted)]">{message}</div>}
      </div>
    )
  }

  const renderIPHealth = (record: ProxyDisplayInfo) => {
    if (record.proxyConfig === 'direct://') {
      return <span className="text-[var(--color-text-muted)] text-xs">不适用</span>
    }
    if (checkingIPHealthIds.has(record.proxyId)) {
      return <span className="text-[var(--color-text-muted)] text-xs animate-pulse">检测中...</span>
    }

    const result = ipHealthMap[record.proxyId]
    if (!result) return <span className="text-[var(--color-text-muted)] text-xs">-</span>
    if (!result.ok) {
      const diagnostic = normalizeProxyDiagnostic(result as unknown as Record<string, unknown>, {
        proxyId: record.proxyId,
        checkedAt: result.updatedAt,
        engine: result.engine,
        source: result.source,
      })
      const tone = diagnosticTone(diagnostic.stage)
      const toneClass = tone === 'warning'
        ? 'border-[var(--color-warning-border)] bg-[var(--color-warning-muted)] text-[var(--color-warning)]'
        : 'border-[var(--color-error-border)] bg-[var(--color-error-muted)] text-[var(--color-error)]'
      const message = diagnostic.error || diagnostic.message || result.error || '检测失败'
      return (
        <div className="min-w-0 max-w-[250px]" title={[diagnostic.code, diagnostic.engine, diagnostic.targetUrl, message].filter(Boolean).join(' · ')}>
          <div className="flex min-w-0 items-center gap-1.5">
            <span className={`inline-flex shrink-0 items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-medium ${toneClass}`}>
              {diagnosticStageLabel(diagnostic.stage)}
            </span>
            {diagnostic.code && <code className="truncate font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-muted)]">{diagnostic.code}</code>}
            <Button size="sm" variant="ghost" onClick={(event) => { event.stopPropagation(); onOpenIPHealthDetail(record.proxyId) }}>原始</Button>
          </div>
          <div className="mt-1 truncate text-[11px] text-[var(--color-text-muted)]">{message}</div>
        </div>
      )
    }

    const location = [result.country, result.region, result.city].filter(Boolean).join(' / ')
    return (
      <div className="flex items-center gap-2 min-w-0">
        <div className="min-w-0">
          <div className="text-xs text-[var(--color-text-primary)] truncate">{result.ip || '-'}</div>
          <div className="text-[11px] text-[var(--color-text-muted)] truncate">
            {`fraud ${result.fraudScore} | ${result.isResidential ? '住宅' : '机房'}${location ? ` | ${location}` : ''}`}
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={(event) => { event.stopPropagation(); onOpenIPHealthDetail(record.proxyId) }}>原始</Button>
      </div>
    )
  }

  const columns = useMemo<TableColumn<ProxyDisplayInfo>[]>(() => [
    {
      key: 'checkbox',
      title: '',
      width: '40px',
      render: (_, record) => (
        <input
          type="checkbox"
          aria-label={`选择代理 ${record.proxyName}`}
          checked={selectedIds.has(record.proxyId)}
          disabled={BUILTIN_PROXY_IDS.has(record.proxyId)}
          onChange={() => onToggleOne(record.proxyId)}
          onClick={event => event.stopPropagation()}
          className="h-4 w-4 cursor-pointer rounded-sm border-[var(--color-border-default)] accent-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-30"
        />
      ),
    },
    { key: 'proxyName', title: '代理名称', width: '180px', sortable: true },
    {
      key: 'groupName',
      title: '分组',
      width: '100px',
      sortable: true,
      render: (value) => value ? <span className="inline-flex rounded-sm border border-[var(--color-accent-border)] bg-[var(--color-accent-muted)] px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-[var(--color-accent)]">{value}</span> : '-',
    },
    {
      key: 'source',
      title: '来源',
      width: '180px',
      render: (_, record) => {
        if (!record.sourceUrl) return '-'
        const host = sourceHostLabel(record.sourceUrl)
        return (
          <div className="text-xs leading-5">
            <div className="text-[var(--color-text-primary)] truncate" title={record.sourceUrl}>{host}</div>
            <div className="text-[var(--color-text-muted)]">
              {globalAutoRefreshEnabled ? `自动刷新 ${globalRefreshInterval} 分钟（全局）` : '手动刷新'}
            </div>
          </div>
        )
      },
    },
    { key: 'type', title: '类型', width: '90px', sortable: true },
    { key: 'server', title: '服务器', width: '180px', sortable: true },
    { key: 'port', title: '端口', width: '80px', sortable: true, render: (value) => value || '-' },
    {
      key: 'latency',
      title: '延迟',
      width: '90px',
      sortable: true,
      render: (_, record) => renderLatency(record),
    },
    {
      key: 'latencyEngine',
      title: '测速类型',
      width: '90px',
      render: (_, record) => renderLatencyEngine(record),
    },
    {
      key: 'diagnostic',
      title: '诊断',
      width: '210px',
      render: (_, record) => renderDiagnostic(record),
    },
    {
      key: 'ipHealth',
      title: (
        <div className="leading-tight">
          <div>IP 健康</div>
          <div className="mt-0.5 text-[10px] font-normal text-[var(--color-text-muted)]">
            仅供参考
          </div>
        </div>
      ),
      width: '280px',
      render: (_, record) => renderIPHealth(record),
    },
    {
      key: 'actions',
      title: '操作',
      width: '190px',
      render: (_, record) => {
        const isBuiltin = BUILTIN_PROXY_IDS.has(record.proxyId)
        const sourceId = record.sourceId || ''
        const hasSource = !!sourceId && !!record.sourceUrl
        const moreOpen = openMoreProxyId === record.proxyId
        const closeMore = () => setOpenMoreProxyId(null)
        return (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={(event) => { event.stopPropagation(); closeMore(); onTestOne(record) }}
              loading={latencyMap[record.proxyId] === -1}
              disabled={record.proxyConfig === 'direct://'}
            >
              测速
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={isBuiltin}
              title={isBuiltin ? '内置代理不可编辑' : undefined}
              onClick={(event) => {
                event.stopPropagation()
                closeMore()
                if (!isBuiltin) onEdit(record)
              }}
            >
              编辑
            </Button>
            <div className="relative" onClick={(event) => event.stopPropagation()}>
              <Button
                size="sm"
                variant="secondary"
                aria-expanded={moreOpen}
                aria-label="更多代理操作"
                className="px-2"
                onClick={(event) => {
                  event.stopPropagation()
                  if (moreOpen) {
                    closeMore()
                    return
                  }
                  setMoreMenuPlacement(resolveMoreMenuPlacement(event.currentTarget, hasSource ? 132 : 96))
                  setOpenMoreProxyId(record.proxyId)
                }}
              >
                <span className="sr-only">更多</span>
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              {moreOpen && (
                <div className={`absolute right-0 z-30 w-32 border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] p-1 shadow-[var(--shadow-md)] ${moreMenuPlacement === 'up' ? 'bottom-9' : 'top-9'}`}>
                  {hasSource && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={(event) => { event.stopPropagation(); closeMore(); onRefreshSingleSource(sourceId) }}
                      loading={refreshingSourceIds.has(sourceId)}
                    >
                      刷新订阅
                    </Button>
                  )}
                  {latencyDiagnosticMap[record.proxyId] && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={(event) => { event.stopPropagation(); closeMore(); onClearDiagnostic(record.proxyId) }}
                    >
                      清除结果
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={(event) => { event.stopPropagation(); closeMore(); onCheckOneIPHealth(record) }}
                    loading={checkingIPHealthIds.has(record.proxyId)}
                    disabled={record.proxyConfig === 'direct://'}
                  >
                    IP 健康
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    className="w-full justify-start"
                    disabled={isBuiltin}
                    title={isBuiltin ? '内置代理不可删除' : undefined}
                    onClick={(event) => {
                      event.stopPropagation()
                      closeMore()
                      if (!isBuiltin) onDelete(record.proxyId)
                    }}
                  >
                    删除
                  </Button>
                </div>
              )}
            </div>
          </div>
        )
      },
    },
  ], [
    checkingIPHealthIds,
    globalAutoRefreshEnabled,
    globalRefreshInterval,
    ipHealthMap,
    latencyMap,
    latencyEngineMap,
    latencyErrorMap,
    latencyDiagnosticMap,
    onCheckOneIPHealth,
    onClearDiagnostic,
    onDelete,
    onEdit,
    onOpenIPHealthDetail,
    onRefreshSingleSource,
    openMoreProxyId,
    moreMenuPlacement,
    onTestOne,
    onToggleOne,
    refreshingSourceIds,
    selectedIds,
  ])

  return (
    <section className="network-proxy-table overflow-hidden border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
      <div className="network-proxy-toolbar flex flex-col gap-3 border-b border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] px-4 py-3 xl:flex-row xl:items-center">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]" aria-hidden="true" />
          <Input
            value={filterKeyword}
            onChange={event => onFilterKeywordChange(event.target.value)}
            placeholder="搜索名称或服务器"
            className="pl-8"
          />
        </div>
        <select
          aria-label="按代理协议筛选"
          value={filterProtocol}
          onChange={event => onFilterProtocolChange(event.target.value)}
          className="h-9 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 text-sm text-[var(--color-text-primary)] transition-colors duration-150 focus:border-[var(--color-border-strong)] focus:outline-none focus:ring-1 focus:ring-[var(--color-border-strong)]"
        >
          {protocolOptions.map(protocol => (
            <option key={protocol} value={protocol}>{protocol === 'all' ? '全部协议' : protocol.toUpperCase()}</option>
          ))}
        </select>
        <select
          aria-label="按代理分组筛选"
          value={filterGroup}
          onChange={event => onFilterGroupChange(event.target.value)}
          className="h-9 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 text-sm text-[var(--color-text-primary)] transition-colors duration-150 focus:border-[var(--color-border-strong)] focus:outline-none focus:ring-1 focus:ring-[var(--color-border-strong)]"
        >
          <option value="all">全部分组</option>
          {groups.map(group => <option key={group} value={group}>{group}</option>)}
        </select>
        {hasActiveFilters && (
          <Button size="sm" variant="ghost" onClick={onClearFilters} className="gap-1.5 px-2">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            清除
          </Button>
        )}
        <label className="flex h-9 items-center gap-1.5 px-1.5 text-xs text-[var(--color-text-secondary)] cursor-pointer select-none">
          <input
            type="checkbox"
            aria-label="仅显示已有成功测速或通过 IP 检测的代理"
            checked={filterAvailableOnly}
            onChange={event => onFilterAvailableOnlyChange(event.target.checked)}
            className="h-4 w-4 cursor-pointer rounded-sm border-[var(--color-border-default)] accent-[var(--color-accent)]"
          />
          <span title="需有成功测速或通过 IP 检测">仅已验证</span>
        </label>
        <div className="flex h-9 items-center gap-2 border-l border-[var(--color-border-default)] pl-3" role="group" aria-label="订阅源自动刷新">
          <span className="whitespace-nowrap text-xs text-[var(--color-text-muted)]">自动刷新</span>
          <Switch
            checked={globalAutoRefreshEnabled}
            onChange={onGlobalAutoRefreshEnabledChange}
          />
          <Input
            type="number"
            min={5}
            max={1440}
            value={globalRefreshIntervalM}
            onChange={event => onGlobalRefreshIntervalMChange(event.target.value)}
            className="h-8 w-20"
            disabled={!globalAutoRefreshEnabled}
          />
          <span className="text-xs text-[var(--color-text-muted)]">分钟</span>
        </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
        {data.length > 0 && (
          <label className="flex h-9 items-center gap-1.5 px-1.5 text-xs text-[var(--color-text-muted)] cursor-pointer select-none">
            <input
              type="checkbox"
              aria-label="选择当前筛选结果中的全部代理"
              checked={allFilteredSelected}
              ref={(element) => {
                if (element) {
                  element.indeterminate = someFilteredSelected && !allFilteredSelected
                }
              }}
              onChange={onToggleAll}
              className="h-4 w-4 cursor-pointer rounded-sm border-[var(--color-border-default)] accent-[var(--color-accent)]"
            />
            全选
          </label>
        )}
        {selectedCount > 0 && (
          <Button size="sm" variant="danger" onClick={onOpenBatchDelete} className="gap-1.5">
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            删除所选 ({selectedCount})
          </Button>
        )}
        </div>
      </div>
      <div className="px-0 py-0">
        {loading || data.length > 0 ? (
          <Table
            columns={columns}
            data={data}
            rowKey="proxyId"
            loading={loading}
            emptyText="暂无代理配置"
            sortColumn={sortColumn}
            sortOrder={sortOrder}
            onSort={onSort}
            className="proxy-pool-table"
          />
        ) : (
          <SignalEmptyState
            symbol="network"
            title={hasActiveFilters ? '没有匹配的代理配置' : '代理池尚无配置'}
            description={hasActiveFilters ? '调整协议、分组、关键词或验证状态后再试。' : '通过页面顶部的导入操作添加代理节点。'}
            action={hasActiveFilters ? <Button size="sm" variant="secondary" onClick={onClearFilters}>清除筛选</Button> : undefined}
          />
        )}
      </div>
    </section>
  )
}

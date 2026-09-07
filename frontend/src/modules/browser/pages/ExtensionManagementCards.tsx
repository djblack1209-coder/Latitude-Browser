import { Download, ExternalLink, FolderOpen, History, Power, Puzzle, RefreshCw, RotateCw, Search, Settings, Trash2, Users } from 'lucide-react'
import { Badge, Button, Input } from '../../../shared/components'
import { SignalEmptyState, TelemetryStrip, TerminalPanel, WorkspaceHeader } from '../../../shared/components/SignalPrimitives'
import type { BrowserExtension, BrowserExtensionLookupResult, BrowserProxy } from '../types'
import { extensionStoreURL, formatExtensionSource, formatExtensionTime, getExtensionManifestMeta, getProxySpeedState } from './extensionManagementUtils'

export function ProxyStatePill({ useProxy, proxy }: { useProxy: boolean; proxy?: BrowserProxy }) {
  if (!useProxy) {
    return <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]"><span className="h-1.5 w-1.5 rounded-full bg-[var(--color-text-muted)]" aria-hidden="true" />Direct</span>
  }
  if (!proxy) {
    return <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-error)]"><span className="h-1.5 w-1.5 rounded-full bg-[var(--color-error)]" aria-hidden="true" />Proxy missing</span>
  }
  const state = getProxySpeedState(proxy)
  const status = state?.ok ? `${state.latencyMs}ms` : state ? 'unavailable' : 'untested'
  const toneClass = state?.ok
    ? 'text-[var(--color-success)]'
    : state
      ? 'text-[var(--color-error)]'
      : 'text-[var(--color-text-muted)]'
  const dotClass = state?.ok
    ? 'bg-[var(--color-success)]'
    : state
      ? 'bg-[var(--color-error)]'
      : 'bg-[var(--color-text-muted)]'
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] ${toneClass}`} title={proxy.proxyName || proxy.proxyId}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden="true" />
      Proxy · {status}
    </span>
  )
}

export interface ExtensionManagementHeaderProps {
  proxyButtonText: string
  loading: boolean
  importing: 'none' | 'file' | 'directory'
  downloadDirectoryLoading: boolean
  installedCount: number
  enabledCount: number
  historyCount: number
  useProxy: boolean
  selectedProxy?: BrowserProxy
  onOpenProxy: () => void
  onOpenHistory: () => void
  onImportFile: () => void
  onImportDirectory: () => void
  onOpenDownloadDirectory: () => void
  onRefresh: () => void
}

export function ExtensionManagementHeader({
  proxyButtonText,
  loading,
  importing,
  downloadDirectoryLoading,
  installedCount,
  enabledCount,
  historyCount,
  useProxy,
  selectedProxy,
  onOpenProxy,
  onOpenHistory,
  onImportFile,
  onImportDirectory,
  onOpenDownloadDirectory,
  onRefresh,
}: ExtensionManagementHeaderProps) {
  const proxyState = useProxy ? (selectedProxy ? '代理下载' : '待选择') : '直连下载'

  return (
    <div className="space-y-4">
      <WorkspaceHeader
        eyebrow="FINGERPRINT / EXTENSIONS"
        title="插件包"
        description="安装并维护共享 Chrome 扩展。"
        actions={(
          <>
            <Button size="sm" variant="secondary" onClick={onOpenProxy} title={proxyButtonText}>
              <Settings className="h-4 w-4" aria-hidden="true" />
              下载代理
            </Button>
            <Button size="sm" variant="secondary" onClick={onOpenHistory}>
              <History className="h-4 w-4" aria-hidden="true" />
              查询历史
            </Button>
            <Button size="sm" variant="secondary" onClick={onImportFile} loading={importing === 'file'}>
              <Download className="h-4 w-4" aria-hidden="true" />
              导入包
            </Button>
            <Button size="sm" variant="secondary" onClick={onImportDirectory} loading={importing === 'directory'}>
              <Download className="h-4 w-4" aria-hidden="true" />
              导入目录
            </Button>
            <Button size="sm" variant="secondary" onClick={onOpenDownloadDirectory} loading={downloadDirectoryLoading}>
              <FolderOpen className="h-4 w-4" aria-hidden="true" />
              下载目录
            </Button>
            <Button size="sm" onClick={onRefresh} loading={loading}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              刷新
            </Button>
          </>
        )}
      />
      <TelemetryStrip
        items={[
          { label: '已安装', value: installedCount, detail: '共享插件包' },
          {
            label: '已启用',
            value: `${enabledCount}/${installedCount}`,
            detail: '全局可加载',
            tone: enabledCount > 0 ? 'success' : 'neutral',
          },
          { label: '下载链路', value: proxyState, detail: useProxy && selectedProxy ? selectedProxy.proxyName || selectedProxy.proxyId : '未经过节点', tone: useProxy && !selectedProxy ? 'warning' : 'accent' },
          { label: '历史记录', value: historyCount, detail: '查询与安装事件' },
        ]}
      />
    </div>
  )
}

export interface ExtensionInstallCardProps {
  query: string
  lookup: BrowserExtensionLookupResult | null
  querying: boolean
  installing: boolean
  useProxy: boolean
  selectedProxy?: BrowserProxy
  installedIds: Set<string>
  lastLookupProxyLabel: string
  onQueryChange: (value: string) => void
  onLookup: () => void
  onOpenWebStoreQuery: () => void
  onOpenManualInstall: () => void
  onOpenProxy: () => void
  onInstall: () => void
}

export function ExtensionInstallCard({
  query,
  lookup,
  querying,
  installing,
  useProxy,
  selectedProxy,
  installedIds,
  lastLookupProxyLabel,
  onQueryChange,
  onLookup,
  onOpenWebStoreQuery,
  onOpenManualInstall,
  onOpenProxy,
  onInstall,
}: ExtensionInstallCardProps) {
  return (
    <TerminalPanel
      title="PACKAGE RESOLVER"
      meta={<ProxyStatePill useProxy={useProxy} proxy={selectedProxy} />}
    >
      <div className="p-4">
        <div className="flex flex-col gap-2 md:flex-row">
          <label htmlFor="extension-query" className="sr-only">Chrome Web Store 链接或插件 ID</label>
          <Input
            id="extension-query"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onLookup()
            }}
            placeholder="Chrome Web Store 链接或 32 位插件 ID"
            className="min-w-0 flex-1 font-mono"
            spellCheck={false}
          />
          <Button type="button" onClick={onLookup} loading={querying}>
            <Search className="h-4 w-4" aria-hidden="true" />
            解析插件
          </Button>
          <Button type="button" variant="secondary" onClick={onOpenWebStoreQuery}>
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            打开商店
          </Button>
          <Button type="button" variant="secondary" onClick={onOpenManualInstall}>
            <Download className="h-4 w-4" aria-hidden="true" />
            手动安装
          </Button>
        </div>

        <div className="mt-3 flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
          <span>查询与下载使用当前链路</span>
          <button type="button" className="font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]" onClick={onOpenProxy}>
            切换代理
          </button>
        </div>

        {lookup ? (
          <div className="mt-4 border-t border-[var(--color-border-muted)] pt-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 font-medium text-[var(--color-text-primary)]">
                  <span>{lookup.name || lookup.extensionId}</span>
                  {lookup.version ? <span className="font-mono text-[10px] text-[var(--color-text-muted)]">v{lookup.version}</span> : null}
                  <Badge variant={lookup.installable ? 'success' : 'error'} size="sm">{lookup.installable ? '可安装' : '不可安装'}</Badge>
                </div>
                <div className="mt-1 break-all font-mono text-xs text-[var(--color-text-secondary)]">{lookup.extensionId}</div>
                {lastLookupProxyLabel ? <div className="mt-1 text-xs text-[var(--color-text-muted)]">本次查询：{lastLookupProxyLabel}</div> : null}
                {lookup.description ? <div className="mt-2 max-w-3xl text-sm leading-6 text-[var(--color-text-secondary)]">{lookup.description}</div> : null}
                {lookup.message ? <div className="mt-2 text-xs text-[var(--color-text-muted)]">{lookup.message}</div> : null}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {lookup.storeUrl ? (
                  <Button type="button" size="sm" variant="secondary" onClick={() => window.open(lookup.storeUrl, '_blank', 'noopener,noreferrer')}>
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    商店详情
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  onClick={onInstall}
                  loading={installing}
                  disabled={!lookup.installable || installedIds.has(lookup.extensionId)}
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {installedIds.has(lookup.extensionId) ? '已安装' : '安装插件'}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </TerminalPanel>
  )
}

export interface InstalledExtensionsListProps {
  items: BrowserExtension[]
  busyId: string
  busyAction: 'toggle' | 'delete' | ''
  updatingId: string
  onRestrictProfiles: (item: BrowserExtension) => void
  onUpdate: (item: BrowserExtension) => void
  onToggle: (item: BrowserExtension) => void
  onDelete: (item: BrowserExtension) => void
}

export function InstalledExtensionsList({ items, busyId, busyAction, updatingId, onRestrictProfiles, onUpdate, onToggle, onDelete }: InstalledExtensionsListProps) {
  const enabledCount = items.filter((item) => item.enabled).length
  return (
    <TerminalPanel
      title="EXTENSION REGISTRY"
      meta={<span className="font-mono tabular-nums">{enabledCount} ENABLED / {items.length} TOTAL</span>}
    >
      {items.length === 0 ? (
        <SignalEmptyState
          symbol="files"
          title="尚未安装插件"
          description="在上方输入 Chrome Web Store 链接或插件 ID，解析后即可安装。"
        />
      ) : (
        <div className="divide-y divide-[var(--color-border-muted)]">
          {items.map((item) => (
            <InstalledExtensionCard
              key={item.extensionId}
              item={item}
              busy={busyId === item.extensionId}
              busyAction={busyId === item.extensionId ? busyAction : ''}
              updating={updatingId === item.extensionId}
              onRestrictProfiles={onRestrictProfiles}
              onUpdate={onUpdate}
              onToggle={onToggle}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </TerminalPanel>
  )
}

export interface InstalledExtensionCardProps {
  item: BrowserExtension
  busy: boolean
  busyAction: 'toggle' | 'delete' | ''
  updating: boolean
  onRestrictProfiles: (item: BrowserExtension) => void
  onUpdate: (item: BrowserExtension) => void
  onToggle: (item: BrowserExtension) => void
  onDelete: (item: BrowserExtension) => void
}

export function InstalledExtensionCard({ item, busy, busyAction, updating, onRestrictProfiles, onUpdate, onToggle, onDelete }: InstalledExtensionCardProps) {
  const meta = getExtensionManifestMeta(item)
  const storeUrl = extensionStoreURL(item)
  const label = item.name || item.extensionId

  return (
    <article className="px-4 py-4 transition-colors duration-150 hover:bg-[var(--color-bg-subtle)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-muted)]">
            {item.iconDataUrl ? (
              <img src={item.iconDataUrl} alt={`${label} 图标`} className="h-9 w-9 object-contain" />
            ) : (
              <Puzzle className="h-5 w-5 text-[var(--color-text-muted)]" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium text-[var(--color-text-primary)]">{label}</h3>
              <Badge variant={item.enabled ? 'success' : 'error'} size="sm" dot>
                {item.enabled ? '已启用' : '已停用'}
              </Badge>
              {item.version ? <span className="font-mono text-[10px] text-[var(--color-text-muted)]">v{item.version}</span> : null}
              {meta.manifestVersion ? <span className="font-mono text-[10px] text-[var(--color-text-muted)]">MV{meta.manifestVersion}</span> : null}
            </div>
            {item.description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--color-text-secondary)]">{item.description}</p> : null}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
              <span className="break-all normal-case tracking-normal">{item.extensionId}</span>
              <span>{formatExtensionSource(item.sourceUrl)}</span>
              <span>Installed {formatExtensionTime(item.installedAt)}</span>
              {item.updatedAt ? <span>Updated {formatExtensionTime(item.updatedAt)}</span> : null}
            </div>
            {meta.permissions.length > 0 || meta.hostPermissionCount > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {meta.permissions.map((permission) => (
                  <span key={permission} className="rounded-sm border border-[var(--color-border-muted)] px-2 py-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">{permission}</span>
                ))}
                {meta.hostPermissionCount > 0 ? <span className="rounded-sm border border-[var(--color-border-muted)] px-2 py-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">hosts:{meta.hostPermissionCount}</span> : null}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {storeUrl ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => window.open(storeUrl, '_blank', 'noopener,noreferrer')} title={`打开 ${label} 的商店页面`}>
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              商店
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="secondary" onClick={() => onRestrictProfiles(item)} title={`设置 ${label} 可用实例`}>
            <Users className="h-4 w-4" aria-hidden="true" />
            限制实例
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => onUpdate(item)} disabled={updating} title={`重新下载并更新 ${label}`}>
            <RotateCw className={`h-4 w-4 ${updating ? 'animate-spin' : ''}`} aria-hidden="true" />
            更新
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => onToggle(item)} disabled={busy} title={`${item.enabled ? '停用' : '启用'} ${label}`}>
            <Power className={`h-4 w-4 ${busy && busyAction === 'toggle' ? 'animate-pulse' : ''}`} aria-hidden="true" />
            {item.enabled ? '停用' : '启用'}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => onDelete(item)} disabled={busy} className="text-[var(--color-error)]" title={`删除 ${label}`}>
            <Trash2 className={`h-4 w-4 ${busy && busyAction === 'delete' ? 'animate-pulse' : ''}`} aria-hidden="true" />
            删除
          </Button>
        </div>
      </div>
    </article>
  )
}

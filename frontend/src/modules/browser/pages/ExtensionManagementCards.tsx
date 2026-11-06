import { translateMessage } from '../../../shared/i18n'
import { tr, useLocale } from '../../../shared/i18n'
import { Download, ExternalLink, FolderOpen, History, Power, Puzzle, RefreshCw, RotateCw, Search, Settings, Trash2, Users } from 'lucide-react'
import { Badge, Button, Input } from '../../../shared/components'
import { SignalEmptyState, TerminalPanel, WorkspaceHeader } from '../../../shared/components/SignalPrimitives'
import type { BrowserExtension, BrowserExtensionLookupResult, BrowserProxy } from '../types'
import { extensionStoreURL, formatExtensionSource, formatExtensionTime, getExtensionManifestMeta, getProxySpeedState } from './extensionManagementUtils'

export function ProxyStatePill({ useProxy, proxy }: { useProxy: boolean; proxy?: BrowserProxy }) {
  useLocale()

  if (!useProxy) {
    return <span className="inline-flex items-center gap-1.5 font-mono text-[10px]   text-[var(--color-text-muted)]"><span className="h-1.5 w-1.5 rounded-full bg-[var(--color-text-muted)]" aria-hidden="true" />{tr("ui.modules.browser.pages.ExtensionManagementCards.label.bc81524")}</span>
  }
  if (!proxy) {
    return <span className="inline-flex items-center gap-1.5 font-mono text-[10px]   text-[var(--color-error)]"><span className="h-1.5 w-1.5 rounded-full bg-[var(--color-error)]" aria-hidden="true" />{tr("ui.modules.browser.pages.ExtensionManagementCards.label.acc2e18")}</span>
  }
  const state = getProxySpeedState(proxy)
  const status = state?.ok ? `${state.latencyMs}ms` : state ? tr('common.unavailable') : tr('common.untested')
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
    <span className={`inline-flex items-center gap-1.5 font-mono text-[10px]   ${toneClass}`} title={proxy.proxyName || proxy.proxyId}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden="true" />{tr("ui.modules.browser.pages.ExtensionManagementCards.label.9ba7ae1")}{status}
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
  onOpenInstall: () => void
}

export function ExtensionManagementHeader({
  proxyButtonText,
  loading,
  importing,
  downloadDirectoryLoading,
  onOpenProxy,
  onOpenHistory,
  onImportFile,
  onImportDirectory,
  onOpenDownloadDirectory,
  onRefresh,
  onOpenInstall,
}: ExtensionManagementHeaderProps) {
  useLocale()


  return (
    <div className="space-y-4">
      <WorkspaceHeader

        title={tr("config.navigation.config.name.09440f1")}

        actions={(
          <>
            <Button size="sm" variant="secondary" onClick={onOpenProxy} title={proxyButtonText}>
              <Settings className="h-4 w-4" aria-hidden="true" />{tr("browser.pages.ExtensionManagementCards.text.22eff2b")}</Button>
            <Button size="sm" variant="secondary" onClick={onOpenHistory}>
              <History className="h-4 w-4" aria-hidden="true" />{tr("browser.pages.ExtensionManagementCards.text.6079f66")}</Button>
            <Button size="sm" variant="secondary" onClick={onImportFile} loading={importing === 'file'}>
              <Download className="h-4 w-4" aria-hidden="true" />{tr("browser.pages.ExtensionManagementCards.text.f1ebcb7")}</Button>
            <Button size="sm" variant="secondary" onClick={onImportDirectory} loading={importing === 'directory'}>
              <Download className="h-4 w-4" aria-hidden="true" />{tr("browser.pages.ExtensionManagementCards.text.6dd6ef4")}</Button>
            <Button size="sm" variant="secondary" onClick={onOpenDownloadDirectory} loading={downloadDirectoryLoading}>
              <FolderOpen className="h-4 w-4" aria-hidden="true" />{tr("browser.pages.ExtensionManagementCards.text.4cd5da4")}</Button>
            <Button size="sm" variant="secondary" onClick={onRefresh} loading={loading}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />{tr("browser.components.AutomationRuntimeSnapshot.text.38108ea")}</Button>
            <Button size="sm" onClick={onOpenInstall}><Puzzle className="h-4 w-4" />{tr("extensions.install")}</Button>
          </>
        )}
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
  useLocale()

  return (
    <TerminalPanel
      title={tr("ui.modules.browser.pages.ExtensionManagementCards.label.4d5a92e")}
      meta={<ProxyStatePill useProxy={useProxy} proxy={selectedProxy} />}
    >
      <div className="p-4">
        <div className="flex flex-col gap-2 md:flex-row">
          <label htmlFor="extension-query" className="sr-only">{tr("browser.pages.ExtensionManagementCards.text.242508c")}</label>
          <Input
            id="extension-query"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onLookup()
            }}
            placeholder={tr("browser.pages.ExtensionManagementCards.placeholder.8929015")}
            className="min-w-0 flex-1 font-mono"
            spellCheck={false}
          />
          <Button type="button" onClick={onLookup} loading={querying}>
            <Search className="h-4 w-4" aria-hidden="true" />{tr("browser.pages.ExtensionManagementCards.text.6e99c9a")}</Button>
          <Button type="button" variant="secondary" onClick={onOpenWebStoreQuery}>
            <ExternalLink className="h-4 w-4" aria-hidden="true" />{tr("browser.pages.ExtensionManagementCards.text.1f11e2b")}</Button>
          <Button type="button" variant="secondary" onClick={onOpenManualInstall}>
            <Download className="h-4 w-4" aria-hidden="true" />{tr("browser.pages.ExtensionManagementCards.text.a5c438a")}</Button>
        </div>

        <div className="mt-3 flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
          <span>{tr("browser.pages.ExtensionManagementCards.text.994f65f")}</span>
          <button type="button" className="font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]" onClick={onOpenProxy}>{tr("browser.components.BrowserProfilesPanel.ProxyInlineActions.a466de9")}</button>
        </div>

        {lookup ? (
          <div className="mt-4 border-t border-[var(--color-border-muted)] pt-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 font-medium text-[var(--color-text-primary)]">
                  <span>{lookup.name || lookup.extensionId}</span>
                  {lookup.version ? <span className="font-mono text-[10px] text-[var(--color-text-muted)]">v{lookup.version}</span> : null}
                  <Badge variant={lookup.installable ? "success" : "error"} size="sm">{lookup.installable ? tr("browser.pages.ExtensionManagementCards.ExtensionInstallCard.cee8815") : tr("browser.pages.ExtensionManagementCards.ExtensionInstallCard.19a3734")}</Badge>
                </div>
                <div className="mt-1 break-all font-mono text-xs text-[var(--color-text-secondary)]">{lookup.extensionId}</div>
                {lastLookupProxyLabel ? <div className="mt-1 text-xs text-[var(--color-text-muted)]">{tr("browser.pages.ExtensionManagementCards.text.d16d406")}{lastLookupProxyLabel}</div> : null}
                {lookup.description ? <div className="mt-2 max-w-3xl text-sm leading-6 text-[var(--color-text-secondary)]">{lookup.description}</div> : null}
                {lookup.message ? <div className="mt-2 text-xs text-[var(--color-text-muted)]">{translateMessage(lookup.message)}</div> : null}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {lookup.storeUrl ? (
                  <Button type="button" size="sm" variant="secondary" onClick={() => window.open(lookup.storeUrl, '_blank', 'noopener,noreferrer')}>
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />{tr("browser.pages.ExtensionManagementCards.text.614ead8")}</Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  onClick={onInstall}
                  loading={installing}
                  disabled={!lookup.installable || installedIds.has(lookup.extensionId)}
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {installedIds.has(lookup.extensionId) ? tr("browser.automationRuntime.getAutomationRuntimeBadgeText.eb88ff5") : tr("browser.pages.ExtensionManagementCards.ExtensionInstallCard.76a38f0")}
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
  useLocale()

  const enabledCount = items.filter((item) => item.enabled).length
  return (
    <TerminalPanel
      title={tr("ui.modules.browser.pages.ExtensionManagementCards.label.ed311e8")}
      meta={<span className="font-mono tabular-nums">{enabledCount} / {items.length}</span>}
    >
      {items.length === 0 ? (
        <SignalEmptyState
          symbol="files"
          title={tr("browser.pages.ExtensionManagementCards.title.591c7ea")}

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
  useLocale()

  const meta = getExtensionManifestMeta(item)
  const storeUrl = extensionStoreURL(item)
  const label = item.name || item.extensionId

  return (
    <article className="px-4 py-4 transition-colors duration-150 hover:bg-[var(--color-bg-subtle)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-muted)]">
            {item.iconDataUrl ? (
              <img src={item.iconDataUrl} alt={tr("browser.pages.ExtensionManagementCards.InstalledExtensionCard.ae4a56b", [label])} className="h-9 w-9 object-contain" />
            ) : (
              <Puzzle className="h-5 w-5 text-[var(--color-text-muted)]" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium text-[var(--color-text-primary)]">{label}</h3>
              <Badge variant={item.enabled ? "success" : "error"} size="sm" dot>
                {item.enabled ? tr("browser.components.AutomationScriptPublicApiModalView.AutomationScriptPublicApiModalView.25d2843") : tr("browser.pages.ExtensionManagementCards.InstalledExtensionCard.6c7dcbb")}
              </Badge>
              {item.version ? <span className="font-mono text-[10px] text-[var(--color-text-muted)]">v{item.version}</span> : null}
              {meta.manifestVersion ? <span className="font-mono text-[10px] text-[var(--color-text-muted)]">MV{meta.manifestVersion}</span> : null}
            </div>
            {item.description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--color-text-secondary)]">{item.description}</p> : null}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px]   text-[var(--color-text-muted)]">
              <span className="break-all normal-case tracking-normal">{item.extensionId}</span>
              <span>{formatExtensionSource(item.sourceUrl)}</span>
              <span>{tr("ui.modules.browser.pages.ExtensionManagementCards.label.7bb4405")}{formatExtensionTime(item.installedAt)}</span>
              {item.updatedAt ? <span>{tr("ui.modules.browser.pages.ExtensionManagementCards.label.f2f8570")}{formatExtensionTime(item.updatedAt)}</span> : null}
            </div>
            {meta.permissions.length > 0 || meta.hostPermissionCount > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {meta.permissions.map((permission) => (
                  <span key={permission} className="rounded-sm border border-[var(--color-border-muted)] px-2 py-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">{permission}</span>
                ))}
                {meta.hostPermissionCount > 0 ? <span className="rounded-sm border border-[var(--color-border-muted)] px-2 py-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">{tr("ui.modules.browser.pages.ExtensionManagementCards.label.48f322d")}{meta.hostPermissionCount}</span> : null}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {storeUrl ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => window.open(storeUrl, '_blank', 'noopener,noreferrer')} title={tr("browser.pages.ExtensionManagementCards.InstalledExtensionCard.9c84db3", [label])}>
              <ExternalLink className="h-4 w-4" aria-hidden="true" />{tr("browser.pages.ExtensionManagementCards.text.83eff41")}</Button>
          ) : null}
          <Button type="button" size="sm" variant="secondary" onClick={() => onRestrictProfiles(item)} title={tr("browser.pages.ExtensionManagementCards.InstalledExtensionCard.e9f5c3c", [label])}>
            <Users className="h-4 w-4" aria-hidden="true" />{tr("browser.pages.ExtensionManagementCards.text.ebf4c12")}</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => onUpdate(item)} disabled={updating} title={tr("browser.pages.ExtensionManagementCards.InstalledExtensionCard.cdda991", [label])}>
            <RotateCw className={`h-4 w-4 ${updating ? 'animate-spin' : ''}`} aria-hidden="true" />{tr("browser.pages.ExtensionManagementCards.text.d9db02d")}</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => onToggle(item)} disabled={busy} title={`${item.enabled ? tr("browser.automationScripts.definitions.label.d989e55") : tr("browser.pages.ExtensionManagementCards.InstalledExtensionCard.d4e9ca3")} ${label}`}>
            <Power className={`h-4 w-4 ${busy && busyAction === 'toggle' ? 'animate-pulse' : ''}`} aria-hidden="true" />
            {item.enabled ? tr("browser.automationScripts.definitions.label.d989e55") : tr("browser.pages.ExtensionManagementCards.InstalledExtensionCard.d4e9ca3")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => onDelete(item)} disabled={busy} className="text-[var(--color-error)]" title={tr("browser.pages.ExtensionManagementCards.InstalledExtensionCard.a9de734", [label])}>
            <Trash2 className={`h-4 w-4 ${busy && busyAction === 'delete' ? 'animate-pulse' : ''}`} aria-hidden="true" />{tr("browser.components.BrowserListLayout.title.3755f56")}</Button>
        </div>
      </div>
    </article>
  )
}

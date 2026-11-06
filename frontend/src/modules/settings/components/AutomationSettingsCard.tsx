import { translateMessage } from '../../../shared/i18n'
import { tr, useLocale, localized } from '../../../shared/i18n'

import { Badge, Button, Card, FormItem, Input, Progress, Select, Switch } from '../../../shared/components'

import type { AutomationNodeSource, AutomationRuntimeCheck, AutomationState, AutomationSystemNodeProbe } from '../api'
import type { AutomationRuntimeProgress } from '../progress'

type AutomationBusyState = 'none' | 'toggle' | 'probe' | 'runtime' | 'package' | 'install' | 'check'
type AutomationStatusVariant = 'default' | 'success' | 'error' | 'warning' | 'info'

const AUTOMATION_NODE_SOURCE_OPTIONS: Array<{ value: AutomationNodeSource; label: string }> = localized(() => ([
  { value: 'auto', label: tr("settings.components.AutomationSettingsCard.label.eda60da") },
  { value: 'system', label: tr("settings.components.AutomationSettingsCard.label.bfd5cff") },
  { value: 'bundled', label: tr("settings.components.AutomationSettingsCard.label.d6c713c") },
]))

interface AutomationSettingsCardProps {
  automationState: AutomationState
  automationProgress: AutomationRuntimeProgress | null
  automationBusy: AutomationBusyState
  automationCheck: AutomationRuntimeCheck | null
  automationProbe: AutomationSystemNodeProbe | null
  automationNodeSourceDraft: AutomationNodeSource
  automationSystemNodePathDraft: string
  automationRuntimeDirty: boolean
  launchServerPortDraft: string
  launchServerBaseUrl: string
  launchServerReady: boolean
  launchServerSaving: boolean
  onEnabledChange: (enabled: boolean) => void
  onHeadlessChange: (headlessDefault: boolean) => void
  onNodeSourceDraftChange: (value: AutomationNodeSource) => void
  onSystemNodePathDraftChange: (value: string) => void
  onLaunchServerPortDraftChange: (value: string) => void
  onSaveLaunchServerPort: () => void
  onTypeScriptBuildChange: (allowTypeScriptBuild: boolean) => void
  onProbeSystemNode: () => void
  onSaveRuntimeSettings: () => void
  onInstall: () => void
  onSelfCheck: () => void
}

function joinDetails(items: Array<[string, string | number | boolean | undefined]>) {
  return items
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n')
}

function resolveAutomationStatus(state: AutomationState): {
  enabled: boolean
  ready: boolean
  installing: boolean
  statusLabel: string
  statusVariant: AutomationStatusVariant
  nodeSource: string
  nodeSourceLabel: string
  systemNodePath: string
  systemNodeLabel: string
} {
  const enabled = state.settings.enabled
  const ready = state.status.ready
  const installing = state.status.installing
  const statusLabel = installing
    ? tr("browser.automationRuntime.getAutomationRuntimeBadgeText.4f1f8aa")
    : ready
      ? tr("browser.automationRuntime.getAutomationRuntimeBadgeText.f2afde8")
      : state.status.installed
        ? tr("browser.automationRuntime.getAutomationRuntimeBadgeText.eb88ff5")
        : state.status.lastError
          ? tr("browser.automationRuntime.getAutomationRuntimeBadgeText.5caf279")
          : tr("browser.utils.proxyCoreStatus.message.6f7dc94")
  const statusVariant = installing
    ? 'warning'
    : ready
      ? 'success'
      : state.status.lastError
        ? 'error'
        : 'default'
  const nodeSource = state.status.nodeSource || state.settings.nodeSource || 'auto'
  const nodeSourceLabel = nodeSource === 'system'
    ? tr("settings.components.AutomationSettingsCard.resolveAutomationStatus.2c4c8c5")
    : nodeSource === 'bundled'
      ? tr("settings.components.AutomationSettingsCard.resolveAutomationStatus.47b40c2")
      : tr("settings.components.AutomationSettingsCard.resolveAutomationStatus.fe09f0c")
  const systemNodePath = state.status.systemNodePath || state.settings.systemNodePath
  const systemNodeLabel = state.status.systemNodeDetected
    ? tr("settings.components.AutomationSettingsCard.resolveAutomationStatus.6bc4d9c")
    : systemNodePath
      ? tr("settings.components.AutomationSettingsCard.resolveAutomationStatus.b4b5e72")
      : tr("settings.components.AutomationSettingsCard.resolveAutomationStatus.6b23a28")

  return {
    enabled,
    ready,
    installing,
    statusLabel,
    statusVariant,
    nodeSource,
    nodeSourceLabel,
    systemNodePath,
    systemNodeLabel,
  }
}

export function AutomationSettingsCard({
  automationState,
  automationProgress,
  automationBusy,
  automationCheck,
  automationProbe,
  automationNodeSourceDraft,
  automationSystemNodePathDraft,
  automationRuntimeDirty,
  launchServerPortDraft,
  launchServerBaseUrl,
  launchServerReady,
  launchServerSaving,
  onEnabledChange,
  onNodeSourceDraftChange,
  onSystemNodePathDraftChange,
  onLaunchServerPortDraftChange,
  onSaveLaunchServerPort,
  onTypeScriptBuildChange,
  onProbeSystemNode,
  onSaveRuntimeSettings,
  onInstall,
  onSelfCheck,
}: AutomationSettingsCardProps) {
  useLocale()

  const {
    enabled,
    ready,
    installing,
    statusLabel,
    statusVariant,
    nodeSource,
    nodeSourceLabel,
    systemNodePath,
    systemNodeLabel,
  } = resolveAutomationStatus(automationState)
  const runtimeDetails = joinDetails([
    [tr("settings.components.AutomationSettingsCard.AutomationSettingsCard.37ce3ad"), automationState.settings.installPolicy],
    ['Runtime', automationState.settings.runtimeVersion],
    [tr("settings.components.AutomationSettingsCard.AutomationSettingsCard.5c39b1f"), nodeSourceLabel],
    ['Node', automationState.status.nodeVersion || automationState.settings.nodeVersion],
    ['playwright-core', automationState.status.playwrightVersion || automationState.settings.playwrightVersion],
    [tr("settings.components.AutomationSettingsCard.AutomationSettingsCard.b0d3530"), automationState.settings.allowTypeScriptBuild ? 'enabled' : 'disabled'],
    [tr("browser.automationRuntime.getAutomationNodeSourceLabel.7bd4748"), systemNodeLabel],
    [tr("settings.components.AutomationSettingsCard.AutomationSettingsCard.4a774a4"), automationState.status.nodeResolution],
    [tr("settings.components.AutomationSettingsCard.AutomationSettingsCard.ef0fbdf"), automationState.status.runtimeDir],
    [tr("settings.components.AutomationSettingsCard.AutomationSettingsCard.8a2fb2d"), automationState.status.nodePath],
    [tr("settings.components.AutomationSettingsCard.AutomationSettingsCard.b9f53da"), systemNodePath],
    [tr("settings.components.AutomationSettingsCard.AutomationSettingsCard.785df3a"), automationState.status.systemNodeError],
    [tr("browser.pages.BrowserDetailPage.title.5e8913a"), automationState.status.lastError],
  ])
  const probeDetails = automationProbe
    ? joinDetails([
      [tr("settings.components.AutomationSettingsCard.AutomationSettingsCard.989d1af"), automationProbe.version],
      [tr("browser.components.BrowserListLayout.title.9132e08"), automationProbe.path],
    ])
    : ''

  return (
    <Card
      className="apple-section"
      title={(
        <div className="flex items-center gap-2">
          <span>{tr("settings.components.AutomationSettingsCard.text.6238384")}</span>

        </div>
      )}
    >
      <div className="space-y-5">
        <p className="text-xs text-[var(--warn)]">{tr("automation.trust")}</p>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">{tr("settings.components.AutomationSettingsCard.text.34ed34a")}</p>

              </div>
              <Badge variant={statusVariant} size="sm" dot>{statusLabel}</Badge>
            </div>
          </div>
          <Switch
            checked={enabled}
            onChange={onEnabledChange}
            disabled={automationBusy === 'toggle'}
          />
        </div>

        <div className="h-px bg-[var(--color-border-muted)]" />



        <div className="h-px bg-[var(--color-border-muted)]" />

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)] gap-4 items-end">
          <FormItem
            label={(
              <div className="flex items-center gap-2">
                <span>{tr("settings.components.AutomationSettingsCard.text.bd40ba9")}</span>

              </div>
            )}
          >
            <Input
              type="number"
              value={launchServerPortDraft}
              onChange={event => onLaunchServerPortDraftChange(event.target.value)}
              min={1}
              max={65535}
              step={1}
              disabled={launchServerSaving}
            />
          </FormItem>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={onSaveLaunchServerPort}
              loading={launchServerSaving}
            >{tr("settings.components.AutomationSettingsCard.text.e9b15e9")}</Button>
            <span className="text-xs text-[var(--color-text-muted)]">
              {launchServerReady ? launchServerBaseUrl : tr("settings.components.AutomationSettingsCard.AutomationSettingsCard.207e5b2")}
            </span>
          </div>
        </div>

        <div className="h-px bg-[var(--color-border-muted)]" />

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)] gap-4">
          <FormItem
            label={(
              <div className="flex items-center gap-2">
                <span>{tr("settings.components.AutomationSettingsCard.text.e385376")}</span>

              </div>
            )}
          >
            <Select
              value={automationNodeSourceDraft}
              onChange={event => onNodeSourceDraftChange(event.target.value as AutomationNodeSource)}
              disabled={automationBusy !== 'none'}
              options={AUTOMATION_NODE_SOURCE_OPTIONS}
            />
          </FormItem>
          <FormItem
            label={(
              <div className="flex items-center gap-2">
                <span>{tr("settings.components.AutomationSettingsCard.AutomationSettingsCard.b9f53da")}</span>

              </div>
            )}
          >
            <Input
              value={automationSystemNodePathDraft}
              onChange={event => onSystemNodePathDraftChange(event.target.value)}
              placeholder={tr("settings.components.AutomationSettingsCard.placeholder.75190ec")}
              disabled={automationBusy !== 'none' || automationNodeSourceDraft === 'bundled'}
            />
          </FormItem>
        </div>

        <div className="h-px bg-[var(--color-border-muted)]" />

        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-[var(--color-text-primary)]">{tr("settings.components.AutomationSettingsCard.text.d12b9a8")}</p>

            </div>
          </div>
          <Switch
            checked={automationState.settings.allowTypeScriptBuild}
            onChange={onTypeScriptBuildChange}
            disabled={automationBusy !== 'none'}
          />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-3 py-3">

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={onProbeSystemNode}
              loading={automationBusy === 'probe'}
              disabled={automationBusy !== 'none' || automationNodeSourceDraft === 'bundled'}
            >{tr("settings.components.AutomationSettingsCard.text.15c97c5")}</Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={onSaveRuntimeSettings}
              loading={automationBusy === 'runtime' && automationRuntimeDirty}
              disabled={!automationRuntimeDirty || automationBusy !== 'none'}
            >{tr("settings.components.AutomationSettingsCard.text.785449d")}</Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">
          <span>{tr("ui.modules.settings.components.AutomationSettingsCard.label.1a67a8e")}<code>{automationState.settings.runtimeVersion}</code></span>
          <span>{tr("ui.modules.settings.components.AutomationSettingsCard.label.3717919")}<code>{automationState.status.nodeVersion || automationState.settings.nodeVersion}</code></span>
          <details><summary className="cursor-pointer">{tr("settings.components.AutomationSettingsCard.label.11a6864")}</summary><pre className="mt-2 whitespace-pre-wrap break-all font-mono text-xs">{runtimeDetails}</pre></details>
          {probeDetails && <details><summary className="cursor-pointer">{tr("settings.components.AutomationSettingsCard.label.cf95b89")}</summary><pre className="mt-2 whitespace-pre-wrap break-all font-mono text-xs">{probeDetails}</pre></details>}
        </div>

        {automationProgress && (
          <div className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-3 py-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--color-text-secondary)]">{translateMessage(automationProgress.message)}</span>
              <span className="text-[var(--color-text-muted)]">
                {automationProgress.component ? `${automationProgress.component} · ` : ''}
                {automationProgress.phase}
              </span>
            </div>
            <Progress
              percent={automationProgress.progress}
              size="sm"
              status={automationProgress.phase === 'error' ? "error" : automationProgress.phase === 'done' ? "success" : "normal"}
            />
          </div>
        )}

        {automationCheck && (
          <div className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">{tr("settings.components.AutomationSettingsCard.text.640571e")}<code>{automationCheck.nodeSource || nodeSource}</code> / Node <code>{automationCheck.nodeVersion}</code> / playwright-core <code>{automationCheck.playwrightVersion}</code>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={onInstall}
            loading={automationBusy === 'install'}
            disabled={installing}
          >
            {automationState.status.installed ? tr("settings.components.AutomationSettingsCard.AutomationSettingsCard.dc2db21") : tr("settings.components.AutomationSettingsCard.AutomationSettingsCard.7ac3ac2")}
          </Button>
          <Button
            size="sm"
            onClick={onSelfCheck}
            loading={automationBusy === 'check'}
            disabled={!ready}
          >{tr("settings.components.AutomationSettingsCard.text.ff8db1f")}</Button>
        </div>
      </div>
    </Card>
  )
}

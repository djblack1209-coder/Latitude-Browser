import { tr, useLocale } from '../../../../../shared/i18n'
import { Play, Trash2 } from 'lucide-react'
import { Badge, Button, Card } from '../../../../../shared/components'
import type { AutomationDemoActionKey, AutomationDemoSession } from '../../../demoSession'
import type { LaunchDocDemoConfig } from '../catalog'

interface LaunchDemoPanelProps {
  config: LaunchDocDemoConfig
  launchServerReady: boolean
  demoSession: AutomationDemoSession
  demoBusyAction: AutomationDemoActionKey
  demoBusy: boolean
  onHealth: () => void
  onCreate: () => void
  onLaunch: () => void
  onDelete: () => void
}

export function LaunchDemoPanel({
  config,
  launchServerReady,
  demoSession,
  demoBusyAction,
  demoBusy,
  onHealth,
  onCreate,
  onLaunch,
  onDelete,
}: LaunchDemoPanelProps) {
  useLocale()

  return (
    <Card
      title={config.title}

      className="bg-[var(--color-bg-elevated)] shadow-[var(--shadow-sm)]"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={launchServerReady ? "success" : "warning"} size="sm" dot>{tr("ui.modules.browser.pages.launchApiDocs.panels.LaunchDemoPanel.label.6c42827")}{launchServerReady ? tr("browser.automationRuntime.getAutomationRuntimeBadgeText.f2afde8") : tr("browser.components.LaunchServerStatusBlock.LaunchServerStatusBlock.a4a7017")}
          </Badge>
          <Badge variant={demoSession.profileId ? "success" : "default"} size="sm">{tr("ui.modules.browser.pages.launchApiDocs.panels.LaunchDemoPanel.label.ff4fc02")}{demoSession.profileId || '-'}
          </Badge>
          <Badge variant={demoSession.launchCode ? "info" : "default"} size="sm">{tr("ui.modules.browser.pages.launchApiDocs.panels.LaunchDemoPanel.label.92f7d06")}{demoSession.launchCode || '-'}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          {config.actionKeys.includes('health') && (
            <Button
              size="sm"
              onClick={onHealth}
              loading={demoBusyAction === 'health'}
              disabled={demoBusy}
            >
              <Play className="w-4 h-4" />{tr("browser.pages.launchApiDocs.panels.LaunchDemoPanel.text.9c58842")}</Button>
          )}
          {config.actionKeys.includes('create') && (
            <Button
              size="sm"
              onClick={onCreate}
              loading={demoBusyAction === 'create'}
              disabled={demoBusy}
            >
              <Play className="w-4 h-4" />{tr("browser.pages.launchApiDocs.panels.LaunchDemoPanel.text.64093f7")}</Button>
          )}
          {config.actionKeys.includes('launch') && (
            <Button
              size="sm"
              onClick={onLaunch}
              loading={demoBusyAction === 'launch'}
              disabled={demoBusy || !demoSession.launchCode}
            >
              <Play className="w-4 h-4" />{tr("browser.pages.launchApiDocs.panels.LaunchDemoPanel.text.2f3fe76")}</Button>
          )}
          <Button
            size="sm"
            variant="danger"
            onClick={onDelete}
            loading={demoBusyAction === 'delete'}
            disabled={demoBusy || !demoSession.profileId}
          >
            <Trash2 className="w-4 h-4" />{tr("browser.pages.launchApiDocs.panels.LaunchDemoPanel.text.1019ebd")}</Button>
        </div>

        <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] px-4 py-3 space-y-2 text-sm text-[var(--color-text-secondary)]">
          <div className="text-[var(--color-text-primary)] font-medium">{tr("browser.pages.launchApiDocs.panels.LaunchDemoPanel.text.ca7e376")}</div>
          <div>{tr("browser.pages.launchApiDocs.panels.LaunchDemoPanel.text.472abb7")}<code>{config.primaryDocLabel}</code></div>
          <div>{tr("browser.pages.launchApiDocs.panels.LaunchDemoPanel.text.fe16099")}<code>{demoSession.lastAction || '-'}</code></div>
          <div>{tr("ui.modules.browser.pages.launchApiDocs.panels.LaunchDemoPanel.label.59a3988")}<code>{demoSession.profileId || '-'}</code></div>
          <div>{tr("ui.modules.browser.pages.launchApiDocs.panels.LaunchDemoPanel.label.51869ac")}<code>{demoSession.launchCode || '-'}</code></div>
          <div className="break-all">{tr("ui.modules.browser.pages.launchApiDocs.panels.LaunchDemoPanel.label.1183cd9")}<code>{demoSession.cdpUrl || '-'}</code></div>
        </div>
      </div>
    </Card>
  )
}

import { tr, useLocale } from '../../../../../shared/i18n'
import type { LaunchServerInfo } from '../../../api'
import { Card } from '../../../../../shared/components'
import { LaunchServerStatusBlock } from '../../../components/LaunchServerStatusBlock'

interface LaunchStatusPanelProps {
  currentGroupLabel: string
  currentDocLabel: string
  launchBaseUrl: string
  launchServerReady: boolean
  apiAuth: LaunchServerInfo['apiAuth']
}

export function LaunchStatusPanel({
  currentGroupLabel,
  currentDocLabel,
  launchBaseUrl,
  launchServerReady,
  apiAuth,
}: LaunchStatusPanelProps) {
  useLocale()

  return (
    <Card
      title={tr("browser.pages.launchApiDocs.panels.LaunchStatusPanel.title.03d3f48")}

      className="bg-[var(--color-bg-elevated)] shadow-[var(--shadow-sm)]"
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-text-secondary)]">
          <span>{tr("browser.pages.launchApiDocs.panels.LaunchStatusPanel.text.63cec38")}<code>{currentGroupLabel}</code></span>
          <span>{tr("browser.pages.launchApiDocs.panels.LaunchStatusPanel.text.187bfb2")}<code>{currentDocLabel}</code></span>
        </div>

        <LaunchServerStatusBlock
          launchBaseUrl={launchBaseUrl}
          launchServerReady={launchServerReady}
          apiAuth={apiAuth}
        />
      </div>
    </Card>
  )
}

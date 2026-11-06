import { tr, useLocale } from '../../../shared/i18n'
import type { ReactNode } from 'react'
import { Badge } from '../../../shared/components'
import type { LaunchServerInfo } from '../api'

interface LaunchServerStatusBlockProps {
  launchBaseUrl: string
  launchServerReady: boolean
  apiAuth: LaunchServerInfo['apiAuth']
  children?: ReactNode
}

export function LaunchServerStatusBlock({
  launchBaseUrl,
  launchServerReady,
  apiAuth,
  children,
}: LaunchServerStatusBlockProps) {
  useLocale()

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={launchServerReady ? "success" : "warning"} size="sm" dot>{tr("ui.modules.browser.components.LaunchServerStatusBlock.label.6c42827")}{launchServerReady ? tr("browser.automationRuntime.getAutomationRuntimeBadgeText.f2afde8") : tr("browser.components.LaunchServerStatusBlock.LaunchServerStatusBlock.a4a7017")}
        </Badge>
        <Badge variant="default" size="sm">{tr("ui.modules.browser.components.LaunchServerStatusBlock.label.1dbd61f")}{launchBaseUrl}
        </Badge>
        {apiAuth.enabled && (
          <Badge variant="warning" size="sm">{tr("browser.components.LaunchServerStatusBlock.text.f3fcb57")}{apiAuth.header}
          </Badge>
        )}
      </div>

      <div className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
        <p>{tr("browser.components.LaunchServerStatusBlock.text.08e13d8")}<code>{launchBaseUrl}</code>
          {!launchServerReady ? tr("browser.components.LaunchServerStatusBlock.LaunchServerStatusBlock.1414ebc") : ''}
        </p>
        <p className="mt-2">
          {apiAuth.enabled
            ? <>{tr("browser.components.LaunchServerStatusBlock.text.25b1755")}<code>/api/*</code>{tr("browser.components.LaunchServerStatusBlock.text.e5887a9")}<code>{apiAuth.header}{tr("ui.modules.browser.components.LaunchServerStatusBlock.label.ba16ec3")}</code>。</>
            : apiAuth.requested && !apiAuth.configured
              ? <>{tr("browser.components.LaunchServerStatusBlock.text.56244c9")}<code>api_key</code>{tr("browser.components.LaunchServerStatusBlock.text.158ce2f")}</>
              : <>{tr("browser.components.LaunchServerStatusBlock.text.ffd0fdd")}<code>{tr("ui.modules.browser.components.LaunchServerStatusBlock.label.b5106b5")}</code>{tr("browser.components.LaunchServerStatusBlock.text.246cfa4")}<code>{tr("ui.modules.browser.components.LaunchServerStatusBlock.label.5fe8ff2")}</code>{tr("browser.components.LaunchServerStatusBlock.text.c7cda9b")}</>}
        </p>
      </div>

      {children}
    </div>
  )
}

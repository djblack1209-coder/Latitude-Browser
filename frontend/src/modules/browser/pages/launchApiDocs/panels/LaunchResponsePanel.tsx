import { tr, useLocale } from '../../../../../shared/i18n'
import { Copy } from 'lucide-react'
import { Badge, Button, Card } from '../../../../../shared/components'
import type { AutomationDemoSession } from '../../../demoSession'
import { LaunchDocsCodeBlock } from '../LaunchDocsCodeBlock'

interface LaunchResponsePanelProps {
  demoSession: AutomationDemoSession
  demoResponseText: string
  onCopyResponse: () => void
}

export function LaunchResponsePanel({
  demoSession,
  demoResponseText,
  onCopyResponse,
}: LaunchResponsePanelProps) {
  useLocale()

  const displayResponseText = demoResponseText || tr("browser.pages.launchApiDocs.panels.LaunchResponsePanel.LaunchResponsePanel.584367b")

  return (
    <Card
      title={tr("browser.pages.launchApiDocs.panels.LaunchResponsePanel.title.132ea49")}

      className="bg-[var(--color-bg-elevated)] shadow-[var(--shadow-sm)]"
      actions={(
        <Button
          size="sm"
          variant="secondary"
          onClick={onCopyResponse}
          disabled={!demoResponseText}
        >
          <Copy className="w-3.5 h-3.5" />{tr("browser.pages.launchApiDocs.panels.LaunchResponsePanel.text.651cff2")}</Button>
      )}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-[var(--color-text-primary)]">{tr("browser.pages.launchApiDocs.panels.LaunchResponsePanel.text.d4a9222")}</p>
          {demoSession.lastResult && (
            <Badge variant={demoSession.lastResult.ok ? "success" : "error"} size="sm" dot>{tr("ui.modules.browser.pages.launchApiDocs.panels.LaunchResponsePanel.label.f40b27d")}{demoSession.lastResult.status || '-'}
            </Badge>
          )}
        </div>

        <LaunchDocsCodeBlock
          language="json"
          code={displayResponseText}
          maxHeightClassName="max-h-[320px] overflow-y-auto"
          showCopyButton={false}
          className="my-0"
        />
      </div>
    </Card>
  )
}

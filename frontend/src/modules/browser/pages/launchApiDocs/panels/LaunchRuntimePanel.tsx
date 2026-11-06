import { tr, useLocale } from '../../../../../shared/i18n'
import { AutomationRuntimeSnapshot } from '../../../components/AutomationRuntimeSnapshot'

export function LaunchRuntimePanel() {
  useLocale()

  return (
    <AutomationRuntimeSnapshot
      title={tr("browser.pages.launchApiDocs.panels.LaunchRuntimePanel.title.daa1f41")}
      className="bg-[var(--color-bg-elevated)] shadow-[var(--shadow-sm)]"
      showSettingsAction={false}
    />
  )
}

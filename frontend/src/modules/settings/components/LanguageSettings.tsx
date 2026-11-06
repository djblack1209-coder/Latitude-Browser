import { useState } from 'react'
import { tr, useLocale, getLanguagePreference, setLanguage, type LanguagePreference } from '../../../shared/i18n'
import { toast } from '../../../shared/components'

export function LanguageSettings() {
  useLocale()
  const [busy, setBusy] = useState(false)
  const change = async (value: LanguagePreference) => { setBusy(true); try { await setLanguage(value) } catch { toast.error(tr('settings.languageFailed')) } finally { setBusy(false) } }
  return <section className="terminal-settings-section"><div className="terminal-setting-row"><label id="language-label">{tr('settings.language')}</label><div role="group" aria-labelledby="language-label" className="terminal-segments">{(['system', 'zh-CN', 'en-US'] as const).map(value => <button type="button" key={value} aria-pressed={getLanguagePreference() === value} disabled={busy} onClick={() => void change(value)}>{value === 'system' ? tr('settings.system') : value === 'zh-CN' ? tr("settings.components.LanguageSettings.LanguageSettings.9365915") : tr("ui.modules.settings.components.LanguageSettings.label.649df08")}</button>)}</div></div></section>
}
export function AboutSettings() {
  useLocale()
  return <section className="terminal-settings-section"><h2>{tr("ui.modules.settings.components.LanguageSettings.label.e13b6c4")}</h2><dl className="terminal-definition-list"><dt>{tr('settings.version')}</dt><dd className="font-mono">{__APP_VERSION__}</dd><dt>{tr('settings.license')}</dt><dd>{tr("ui.modules.settings.components.LanguageSettings.label.24acbae")}</dd><dt>{tr('settings.source')}</dt><dd><a href="https://github.com/djblack1209-coder/Latitude-Browser" target="_blank" rel="noreferrer">{tr("ui.modules.settings.components.LanguageSettings.label.548b068")}</a></dd><dt>{tr('settings.notices')}</dt><dd><a href="https://github.com/djblack1209-coder/Latitude-Browser/blob/main/third_party/NOTICE.md" target="_blank" rel="noreferrer">{tr("ui.modules.settings.components.LanguageSettings.label.b1641d2")}</a></dd></dl></section>
}

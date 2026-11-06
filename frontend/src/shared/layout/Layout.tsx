import { useLocale } from '../i18n'
import { type ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { Statusbar } from './Statusbar'
import { tr } from '../i18n'

export function Layout({ children }: { children: ReactNode }) {
  useLocale()

  return <div className="terminal-shell"><a href="#workspace-content" className="signal-skip-link">{tr('nav.instances')}</a><Topbar /><div className="terminal-workspace"><Sidebar /><main id="workspace-content" tabIndex={-1} className="signal-main"><div className="signal-page-content">{children}</div></main></div><Statusbar /></div>
}

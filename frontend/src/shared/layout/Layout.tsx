import { useLocale } from '../i18n'
import { useEffect, useState, type ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { Statusbar } from './Statusbar'
import { tr } from '../i18n'
import { FieldworkProvider } from './LatitudeField'

export function Layout({ children }: { children: ReactNode }) {
  useLocale()
  const [entry, setEntry] = useState(true)
  useEffect(() => { const timer = setTimeout(() => setEntry(false), 600); return () => clearTimeout(timer) }, [])

  return <FieldworkProvider><div className="terminal-shell fieldwork-entry" data-entry={entry}><a href="#workspace-content" className="signal-skip-link">{tr('nav.instances')}</a><Topbar /><div className="terminal-workspace"><Sidebar /><main id="workspace-content" tabIndex={-1} className="signal-main"><div className="signal-page-content">{children}</div></main></div><Statusbar /></div></FieldworkProvider>
}

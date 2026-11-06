import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { tr, useLocale, formatNumber } from '../i18n'

export function Statusbar() {
  useLocale()
  const [facts, setFacts] = useState<{ stack: string; running: number | null; port: number | null }>({ stack: '—', running: null, port: null })
  useEffect(() => {
    let disposed = false
    const refresh = async () => {
      const app = (window as any).go?.main?.App
      if (!app) return
      try { const [settings, stats, api] = await Promise.all([app.GetBrowserSettings(), app.GetDashboardStats(), app.GetLaunchServerInfo()]); if (!disposed) setFacts({ stack: settings.defaultConnectorType === 'mihomo' ? 'mihomo' : 'xray+sing-box', running: typeof stats.runningInstances === 'number' ? stats.runningInstances : typeof stats.running === 'number' ? stats.running : null, port: api.ready && api.port ? api.port : null }) } catch { /* unknown facts remain explicit */ }
    }
    void refresh(); const timer = setInterval(() => { if (!document.hidden) void refresh() }, 10000)
    return () => { disposed = true; clearInterval(timer) }
  }, [])
  return <footer className="terminal-statusbar"><Link to="/settings?section=connectors">{facts.stack}</Link><span>{facts.running === null ? '—' : tr('shell.running', [formatNumber(facts.running)])}</span>{facts.port && <Link to="/settings?section=runtime">{tr("ui.shared.layout.Statusbar.label.f74f3ae")}{facts.port}</Link>}<span className="ml-auto">v{__APP_VERSION__}</span></footer>
}

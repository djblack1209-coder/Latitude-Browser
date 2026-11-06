import { tr, useLocale } from '../i18n'
import { useEffect, useState, type ReactNode } from 'react'
import { desktopBridgeAvailable, isDevelopmentMockEnabled } from '../../modules/browser/api/runtime'

// The desktop bridge may arrive after the initial document. Keep business
// routes unmounted until it exists, and recover automatically when it arrives.
export function DesktopServiceBoundary({ children }: { children: ReactNode }) {
  useLocale()

  const [ready, setReady] = useState(desktopBridgeAvailable)
  const developmentMock = isDevelopmentMockEnabled()
  useEffect(() => {
    const timer = window.setInterval(() => setReady(desktopBridgeAvailable()), 500)
    return () => window.clearInterval(timer)
  }, [])
  if (!ready && !developmentMock) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg-base)] p-6">
        <div className="max-w-md text-center" role="status">
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">{tr("ui.components.DesktopServiceBoundary.text.93ec2e2")}</h1>
          <p className="mt-3 text-sm text-[var(--color-text-secondary)]">{tr("ui.components.DesktopServiceBoundary.text.a8287df")}</p>
          <button className="signal-button mt-5 rounded-full border border-[var(--color-accent-border)] px-4 py-2 text-sm text-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]" onClick={() => window.location.reload()}>{tr("ui.components.DesktopServiceBoundary.text.5982c44")}</button>
        </div>
      </main>
    )
  }
  return <>{!ready && developmentMock && <div role="status" className="px-4 py-2 text-center text-sm bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]">{tr("ui.components.DesktopServiceBoundary.text.af50e60")}</div>}{children}</>
}

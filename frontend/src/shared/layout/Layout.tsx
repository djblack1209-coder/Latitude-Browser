import { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="flex h-screen min-h-0 overflow-hidden bg-[var(--color-bg-base)] text-[var(--color-text-primary)]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="min-h-0 min-w-0 flex-1 overflow-auto bg-[var(--color-bg-base)] p-5">
          {children}
        </main>
      </div>
    </div>
  )
}

import { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { getGoApp } from '../../modules/browser/api/runtime'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="signal-shell flex h-screen min-h-0 overflow-hidden text-[var(--color-text-primary)]">
      <a href="#workspace-content" className="signal-skip-link">跳到页面内容</a>
      <Sidebar />
      <div className="signal-shell-main flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar />
        {!getGoApp() && <div className="signal-preview-notice" role="note"><span>UI PREVIEW</span>本地界面预览 · 示例数据不代表桌面运行状态</div>}
        <main id="workspace-content" tabIndex={-1} className="signal-main min-h-0 min-w-0 flex-1 overflow-auto p-4 outline-none sm:p-6 lg:p-8">
          <div className="signal-page-content">{children}</div>
        </main>
      </div>
    </div>
  )
}

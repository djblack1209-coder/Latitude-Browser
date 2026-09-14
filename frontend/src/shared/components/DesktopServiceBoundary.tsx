import { useEffect, useState, type ReactNode } from 'react'
import { desktopBridgeAvailable, isDevelopmentMockEnabled } from '../../modules/browser/api/runtime'

// The desktop bridge may arrive after the initial document. Keep business
// routes unmounted until it exists, and recover automatically when it arrives.
export function DesktopServiceBoundary({ children }: { children: ReactNode }) {
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
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">桌面服务尚未就绪</h1>
          <p className="mt-3 text-sm text-[var(--color-text-secondary)]">请从 Latitude Browser 应用打开。连接恢复后会自动进入，当前未执行任何业务操作。</p>
          <button className="mt-5 rounded-md border px-4 py-2 text-sm" onClick={() => window.location.reload()}>重新加载</button>
        </div>
      </main>
    )
  }
  return <>{!ready && developmentMock && <div role="status" className="px-4 py-2 text-center text-sm bg-amber-100 text-amber-950">开发模拟模式：示例数据与操作不会保存到桌面服务。</div>}{children}</>
}

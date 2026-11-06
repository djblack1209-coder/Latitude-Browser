import { Component, type ErrorInfo, type ReactNode } from 'react'
import { tr } from '../i18n'

export function reportFrontendError(message: string) {
  const logger = (window as any).go?.main?.App?.FrontendOperationLog
  if (typeof logger !== 'function') return
  try { void Promise.resolve(logger('error', 'frontend.render', false, 0, message.slice(0, 1200))).catch(() => {}) } catch { /* preserve the recovery UI */ }
}

/** Keep a route failure recoverable instead of leaving an empty native window. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { reportFrontendError(`${error.message}\n${info.componentStack || ''}`) }
  render() {
    if (!this.state.error) return this.props.children
    return <main className="flex min-h-full items-center justify-center p-8">
      <div className="max-w-lg space-y-5">
        <h1>{tr('common.error')}</h1>
        <button className="signal-button signal-button--primary px-5 py-2" onClick={() => window.location.reload()}>{tr('common.retry')}</button>
        <details className="text-[var(--text-2)]"><summary>{tr('common.details')}</summary><pre className="mt-3 whitespace-pre-wrap break-words text-xs">{this.state.error.message}</pre></details>
      </div>
    </main>
  }
}

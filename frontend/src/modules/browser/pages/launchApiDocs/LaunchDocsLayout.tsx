import type { ReactNode } from 'react'

interface LaunchDocsLayoutProps {
  sidebar: ReactNode
  header: ReactNode
  content: ReactNode
  contextRail?: ReactNode
}

export function LaunchDocsLayout({ sidebar, header, content, contextRail }: LaunchDocsLayoutProps) {
  const hasContextRail = Boolean(contextRail)

  return (
    <div className="apple-page -m-5 min-h-full bg-[var(--color-bg-subtle)]">
      <div className={hasContextRail
        ? 'xl:grid xl:min-h-full xl:grid-cols-[248px_minmax(0,1fr)_336px]'
        : 'xl:grid xl:min-h-full xl:grid-cols-[248px_minmax(0,1fr)]'}
      >
        <aside className="border-b border-[var(--color-border-default)] bg-[var(--color-bg-surface)] xl:border-b-0 xl:border-r" aria-label="Launch API 文档导航">
          <div className="px-4 py-4 xl:sticky xl:top-0 xl:h-screen xl:overflow-y-auto xl:px-3 xl:py-6">
            {sidebar}
          </div>
        </aside>

        <main className="min-w-0">
          <div className={hasContextRail
            ? 'mx-auto max-w-[1040px] px-4 py-5 md:px-6 xl:max-w-none xl:px-8 xl:py-8'
            : 'mx-auto max-w-[980px] px-4 py-5 md:px-7 xl:px-10 xl:py-8'}
          >
            <div className="space-y-5">
              {header}
              {content}
            </div>
          </div>
        </main>

        {hasContextRail ? (
          <aside className="border-t border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] xl:border-l xl:border-t-0" aria-label="Launch API 上下文">
            <div className="space-y-4 px-4 py-5 md:px-6 xl:sticky xl:top-0 xl:h-screen xl:overflow-y-auto xl:px-5 xl:py-8">
              {contextRail}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  )
}

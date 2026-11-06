import { tr, useLocale } from '../../../../shared/i18n'
import type { ReactNode } from 'react'

interface LaunchDocsLayoutProps {
  sidebar: ReactNode
  header: ReactNode
  content: ReactNode
  contextRail?: ReactNode
}

export function LaunchDocsLayout({ sidebar, header, content, contextRail }: LaunchDocsLayoutProps) {
  useLocale()

  const hasContextRail = Boolean(contextRail)

  return (
    <div className="apple-page -m-5 min-h-full bg-[var(--color-bg-subtle)]">
      <div className={hasContextRail
        ? 'lg:grid lg:min-h-full lg:grid-cols-[208px_minmax(0,1fr)] 2xl:grid-cols-[208px_minmax(0,1fr)_288px]'
        : 'lg:grid lg:min-h-full lg:grid-cols-[208px_minmax(0,1fr)]'}
      >
        <aside className="border-b border-[var(--color-border-default)] bg-[var(--color-bg-surface)] lg:border-b-0 lg:border-r" aria-label={tr("browser.pages.launchApiDocs.LaunchDocsLayout.aria_label.9686db9")}>
          <div className="px-4 py-4 lg:sticky lg:top-0 lg:h-[calc(100vh-92px)] lg:overflow-y-auto lg:px-3 lg:py-6">
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
          <aside className="border-t border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] lg:col-span-2 2xl:col-span-1 2xl:border-l 2xl:border-t-0" aria-label={tr("browser.pages.launchApiDocs.LaunchDocsLayout.aria_label.d0ce525")}>
            <div className="space-y-4 px-4 py-5 md:px-6 2xl:sticky 2xl:top-0 2xl:h-[calc(100vh-92px)] 2xl:overflow-y-auto 2xl:px-5 2xl:py-8">
              {contextRail}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  )
}

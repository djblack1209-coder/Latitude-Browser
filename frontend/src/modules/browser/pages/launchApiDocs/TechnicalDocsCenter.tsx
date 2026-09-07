import { ArrowRight, BookOpenText, ChevronRight } from 'lucide-react'
import { Button } from '../../../../shared/components'
import type { LaunchDocGroup } from './catalog'

interface TechnicalDocsCenterProps {
  groups: LaunchDocGroup[]
  onOpenDoc: (id: string) => void
}

const GROUP_DESCRIPTIONS: Record<string, string> = {
  tutorial: '从启动到外部接管。',
  changelog: '查看版本变化与迁移提示。',
  core: '准备并绑定可用浏览器内核。',
  proxy: '导入、绑定并验证代理。',
  extension: '管理插件包与实例例外。',
  api: '查看请求字段、响应与运行态入口。',
}

function getGroupDescription(group: LaunchDocGroup) {
  return GROUP_DESCRIPTIONS[group.id] || group.items[0]?.summary || '查看本章节操作。'
}

export function TechnicalDocsCenter({ groups, onOpenDoc }: TechnicalDocsCenterProps) {
  const docCount = groups.reduce((count, group) => count + group.items.length, 0)
  const firstDocId = groups[0]?.items[0]?.id
  const apiGroup = groups.find((group) => group.id === 'api')
  const apiOverviewId = apiGroup?.items.find((item) => item.id === 'api-overview')?.id

  return (
    <article className="space-y-6">
      <header className="border-b border-[var(--color-border-default)] pb-5">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
              SYSTEM / DOCS
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">技术文档中心</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">
              按章节查看配置、接口与运行说明。
            </p>
          </div>
          {firstDocId ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onOpenDoc(firstDocId)}
              title="打开基础使用文档"
            >
              <BookOpenText className="h-4 w-4" aria-hidden="true" />
              开始阅读
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--color-border-muted)] pt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
          <span><strong className="text-[var(--color-text-primary)]">{groups.length}</strong> 个章节</span>
          <span><strong className="text-[var(--color-text-primary)]">{docCount}</strong> 个文档节点</span>
          <span>LOCAL / LAUNCH API</span>
        </div>
      </header>

      <section className="space-y-3" aria-labelledby="technical-docs-chapters">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">CHAPTERS</p>
            <h2 id="technical-docs-chapters" className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">章节导航</h2>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">选择文档继续</p>
        </div>

        <div className="divide-y divide-[var(--color-border-muted)] border-y border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
          {groups.map((group, groupIndex) => (
            <section key={group.id} className="grid gap-3 px-3 py-4 md:grid-cols-[minmax(190px,0.7fr)_minmax(0,1.3fr)] md:gap-6 md:px-4">
              <div className="min-w-0">
                <div className="flex items-start gap-3">
                  <span className="font-mono text-[10px] font-semibold tracking-[0.16em] text-[var(--color-accent)]" aria-hidden="true">
                    {String(groupIndex + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{group.label}</h3>
                    <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">{getGroupDescription(group)}</p>
                  </div>
                </div>
              </div>

              <div className="grid min-w-0 gap-1 sm:grid-cols-2">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onOpenDoc(item.id)}
                    className="group flex min-w-0 items-start gap-2 rounded-sm border border-transparent px-2.5 py-2 text-left transition-colors hover:border-[var(--color-border-default)] hover:bg-[var(--color-bg-muted)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent)]"
                    title={`打开${item.label}`}
                  >
                    <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-accent)]" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium leading-5 text-[var(--color-text-primary)]">{item.label}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-[var(--color-text-muted)]">{item.summary}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      {apiOverviewId ? (
        <section className="flex flex-wrap items-center justify-between gap-3 border-y border-[var(--color-accent-border)] bg-[var(--color-accent-muted)] px-4 py-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">INTEGRATION PATH</p>
            <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">
              需要脚本接入时，从接口总览开始。
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => onOpenDoc(apiOverviewId)} title="打开接口总览">
            查看接口总览
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </section>
      ) : null}
    </article>
  )
}

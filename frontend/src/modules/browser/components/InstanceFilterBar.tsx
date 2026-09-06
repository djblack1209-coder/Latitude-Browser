import { Filter, X } from 'lucide-react'
import { Input, Select } from '../../../shared/components'
import { TagFilterBar } from './TagFilterBar'
import type { BrowserCore, BrowserProxy, BrowserGroupWithCount } from '../types'

export interface InstanceFilters {
  keyword: string
  status: '' | 'running' | 'stopped'
  proxyId: string
  coreId: string
  tags: Set<string>
  kwSearch: string
  groupId: string   // '' = 全部, '__ungrouped__' = 未分组, 其他 = 具体分组ID
}

export const EMPTY_FILTERS: InstanceFilters = {
  keyword: '',
  status: '',
  proxyId: '',
  coreId: '',
  tags: new Set(),
  kwSearch: '',
  groupId: '',
}

export function isFiltersEmpty(f: InstanceFilters) {
  return !f.keyword && !f.status && !f.proxyId && !f.coreId && f.tags.size === 0 && !f.kwSearch && !f.groupId
}

interface Props {
  filters: InstanceFilters
  onChange: (f: InstanceFilters) => void
  proxies: BrowserProxy[]
  cores: BrowserCore[]
  allTags: string[]
  groups: BrowserGroupWithCount[]
}

export function InstanceFilterBar({ filters, onChange, proxies, cores, allTags, groups }: Props) {
  const set = <K extends keyof InstanceFilters>(key: K, value: InstanceFilters[K]) =>
    onChange({ ...filters, [key]: value })

  const hasFilter = !isFiltersEmpty(filters)
  const searchValue = filters.keyword || filters.kwSearch
  const activeCount = [searchValue, filters.status, filters.proxyId, filters.coreId, filters.groupId].filter(Boolean).length + filters.tags.size

  return (
    <section className="browser-list-filter border-y border-[var(--color-border-muted)] py-2.5" aria-label="实例筛选">
      <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
        <Filter className="h-3.5 w-3.5" aria-hidden="true" />
        <span>筛选条件</span>
        {activeCount > 0 && (
          <span className="rounded-sm border border-[var(--color-accent)]/25 bg-[var(--color-accent)]/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--color-accent)]">
            {activeCount}
          </span>
        )}
      </div>

      <div className="mt-2.5 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={searchValue}
              onChange={e => onChange({ ...filters, keyword: e.target.value, kwSearch: '' })}
              placeholder="搜索名称、快捷码或关键字"
              className="min-w-[220px] flex-1"
            />
            <Select
              value={filters.status}
              onChange={e => set('status', e.target.value as InstanceFilters['status'])}
              options={[
                { value: '', label: '全部状态' },
                { value: 'running', label: '运行中' },
                { value: 'stopped', label: '已停止' },
              ]}
              style={{ width: '120px' }}
            />
            <Select
              value={filters.proxyId}
              onChange={e => set('proxyId', e.target.value)}
              options={[
                { value: '', label: '全部代理' },
                { value: '__none__', label: '无代理' },
                ...proxies.map(p => ({ value: p.proxyId, label: p.proxyName || p.proxyId })),
              ]}
              style={{ width: '150px' }}
            />
            <Select
              value={filters.coreId}
              onChange={e => set('coreId', e.target.value)}
              options={[
                { value: '', label: '全部内核' },
                ...cores.map(c => ({ value: c.coreId, label: c.coreName })),
              ]}
              style={{ width: '140px' }}
            />
            <Select
              value={filters.groupId}
              onChange={e => set('groupId', e.target.value)}
              options={[
                { value: '', label: '全部分组' },
                { value: '__ungrouped__', label: '未分组' },
                ...groups.map(g => ({ value: g.groupId, label: g.groupName })),
              ]}
              style={{ width: '140px' }}
            />
            {hasFilter && (
              <button
                type="button"
                onClick={() => onChange({ ...EMPTY_FILTERS, tags: new Set() })}
                className="flex h-8 items-center gap-1 rounded-sm border border-transparent px-2 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-default)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-error)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent)]"
              >
                <X className="w-3.5 h-3.5" />
                清除
              </button>
            )}
          </div>
          <TagFilterBar
            tags={allTags}
            selected={filters.tags}
            onChange={tags => set('tags', tags)}
          />
        </div>
    </section>
  )

}

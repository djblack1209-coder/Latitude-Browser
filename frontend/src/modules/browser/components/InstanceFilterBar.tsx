import { tr, useLocale } from '../../../shared/i18n'
import { X } from 'lucide-react'
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
  hideSearch?: boolean
  filters: InstanceFilters
  onChange: (f: InstanceFilters) => void
  proxies: BrowserProxy[]
  cores: BrowserCore[]
  allTags: string[]
  groups: BrowserGroupWithCount[]
}

export function InstanceFilterBar({ filters, onChange, proxies, cores, allTags, groups, hideSearch = false }: Props) {
  useLocale()

  const set = <K extends keyof InstanceFilters>(key: K, value: InstanceFilters[K]) =>
    onChange({ ...filters, [key]: value })

  const hasFilter = !isFiltersEmpty(filters)
  const searchValue = filters.keyword || filters.kwSearch

  return (
    <section className="browser-list-filter border-y border-[var(--color-border-muted)] py-2.5" aria-label={tr("browser.components.InstanceFilterBar.aria_label.8a05c8a")}>
      <div className="mt-2.5 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {!hideSearch && <Input
              aria-label={tr("browser.components.BrowserListLayout.aria_label.9bf64db")}
              value={searchValue}
              onChange={e => onChange({ ...filters, keyword: e.target.value, kwSearch: '' })}
              placeholder={tr("browser.components.InstanceFilterBar.placeholder.2598a30")}
              className="min-w-[220px] flex-1"
            />}
            <Select
              aria-label={tr("browser.components.InstanceFilterBar.aria_label.7673ef4")}
              value={filters.status}
              onChange={e => set('status', e.target.value as InstanceFilters['status'])}
              options={[
                { value: '', label: tr("browser.components.InstanceFilterBar.label.1a4c26d") },
                { value: 'running', label: tr("browser.components.AutomationScriptHistoryModal.getRunStatusLabel.5942497") },
                { value: 'stopped', label: tr("browser.components.InstanceFilterBar.label.75dddf5") },
              ]}
              style={{ width: '120px' }}
            />
            <Select
              aria-label={tr("browser.components.InstanceFilterBar.aria_label.dbebc40")}
              value={filters.proxyId}
              onChange={e => set('proxyId', e.target.value)}
              options={[
                { value: '', label: tr("browser.components.InstanceFilterBar.label.962d4e4") },
                { value: '__none__', label: tr("browser.components.InstanceFilterBar.label.9603143") },
                ...proxies.map(p => ({ value: p.proxyId, label: p.proxyName || p.proxyId })),
              ]}
              style={{ width: '150px' }}
            />
            <Select
              aria-label={tr("browser.components.InstanceFilterBar.aria_label.4a87411")}
              value={filters.coreId}
              onChange={e => set('coreId', e.target.value)}
              options={[
                { value: '', label: tr("browser.components.InstanceFilterBar.label.ac1cae4") },
                ...cores.map(c => ({ value: c.coreId, label: c.coreName })),
              ]}
              style={{ width: '140px' }}
            />
            <Select
              aria-label={tr("browser.components.InstanceFilterBar.aria_label.ea17a64")}
              value={filters.groupId}
              onChange={e => set('groupId', e.target.value)}
              options={[
                { value: '', label: tr("browser.components.InstanceFilterBar.label.eb8d23f") },
                { value: '__ungrouped__', label: tr("browser.components.GroupTreeNav.text.8de957a") },
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
                <X className="w-3.5 h-3.5" />{tr("browser.components.InstanceFilterBar.text.7b15e5e")}</button>
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

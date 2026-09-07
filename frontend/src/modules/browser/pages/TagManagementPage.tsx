import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Tag, Trash2, X } from 'lucide-react'
import { Badge, Button, toast } from '../../../shared/components'
import { SignalEmptyState, TelemetryStrip, TerminalPanel, WorkspaceHeader } from '../../../shared/components/SignalPrimitives'
import type { BrowserProfile } from '../types'
import { batchRemoveProfileTags, batchSetProfileTags, fetchBrowserProfiles, renameBrowserTag } from '../api'
import { AssetScopeTabs } from './AssetScopeTabs'

interface TagPanelProps {
  tags: string[]
  selected: string | null
  profilesByTag: Record<string, number>
  totalCount: number
  onSelect: (tag: string | null) => void
  onCreateTag: (tag: string) => void
  onRenameTag: (oldName: string, newName: string) => void
}

function TagPanel({ tags, selected, profilesByTag, totalCount, onSelect, onCreateTag, onRenameTag }: TagPanelProps) {
  const [creating, setCreating] = useState(false)
  const [newTag, setNewTag] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [editingTag, setEditingTag] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const commit = () => {
    const tag = newTag.trim()
    if (tag && !tags.includes(tag)) {
      onCreateTag(tag)
      onSelect(tag)
    }
    setNewTag('')
    setCreating(false)
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') commit()
    if (event.key === 'Escape') {
      setNewTag('')
      setCreating(false)
    }
  }

  const startEdit = (tag: string) => {
    setEditingTag(tag)
    setEditValue(tag)
  }

  const commitEdit = () => {
    const newValue = editValue.trim()
    if (newValue && editingTag && newValue !== editingTag) {
      onRenameTag(editingTag, newValue)
    }
    setEditingTag(null)
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-surface)]" aria-label="实例标签列表">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2.5">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">TAG INDEX</span>
        <button
          type="button"
          onClick={() => {
            setCreating(true)
            setTimeout(() => inputRef.current?.focus(), 50)
          }}
          title="新建标签"
          aria-label="新建标签"
          className="rounded-sm p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-accent-muted)] hover:text-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent)]"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        <button
          type="button"
          onClick={() => onSelect(null)}
          aria-pressed={selected === null}
          className={`flex w-full items-center justify-between border-l px-3 py-2 text-left text-sm transition-colors ${selected === null
            ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-[var(--color-text-primary)]'
            : 'border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
            }`}
        >
          <span>全部实例</span>
          <span className="font-mono text-xs text-[var(--color-text-muted)]">{totalCount}</span>
        </button>

        {tags.map((tag) => (
          <div key={tag} className="min-w-0">
            {editingTag === tag ? (
              <div className="px-3 py-1.5">
                <label htmlFor={`rename-tag-${tag}`} className="sr-only">重命名标签 {tag}</label>
                <input
                  id={`rename-tag-${tag}`}
                  autoFocus
                  value={editValue}
                  onChange={(event) => setEditValue(event.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') commitEdit()
                    if (event.key === 'Escape') setEditingTag(null)
                  }}
                  className="w-full min-w-0 rounded-sm border border-[var(--color-accent)] bg-[var(--color-bg-input)] px-2 py-1 text-xs text-[var(--color-text-primary)] focus:outline-none"
                />
              </div>
            ) : (
              <button
                type="button"
                onContextMenu={(event) => {
                  event.preventDefault()
                  startEdit(tag)
                }}
                onClick={() => onSelect(tag)}
                aria-pressed={selected === tag}
                className={`group flex w-full items-center justify-between gap-2 border-l px-3 py-2 text-left text-sm transition-colors ${selected === tag
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-[var(--color-text-primary)]'
                  : 'border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
                  }`}
                title="选择标签，右键重命名"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" aria-hidden="true" />
                  <span className="truncate">{tag}</span>
                </span>
                <span className="shrink-0 font-mono text-xs text-[var(--color-text-muted)]">{profilesByTag[tag] ?? 0}</span>
              </button>
            )}
          </div>
        ))}

        {tags.length === 0 && !creating ? (
          <p className="px-3 py-3 text-xs leading-5 text-[var(--color-text-muted)]">暂无标签。使用上方 + 创建标签。</p>
        ) : null}

        {creating ? (
          <div className="px-3 py-2">
            <label htmlFor="new-profile-tag" className="sr-only">新标签名称</label>
            <input
              id="new-profile-tag"
              ref={inputRef}
              value={newTag}
              onChange={(event) => setNewTag(event.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={commit}
              placeholder="标签名称"
              className="w-full min-w-0 rounded-sm border border-[var(--color-accent)] bg-[var(--color-bg-input)] px-2 py-1.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
            />
          </div>
        ) : null}
      </div>
    </aside>
  )
}

interface ActionBarProps {
  selectedCount: number
  allTags: string[]
  onAddTags: (tags: string[]) => void
  onRemoveTags: (tags: string[]) => void
  onClear: () => void
}

function ActionBar({ selectedCount, allTags, onAddTags, onRemoveTags, onClear }: ActionBarProps) {
  const [addInput, setAddInput] = useState('')
  const [removeTag, setRemoveTag] = useState('')

  if (selectedCount === 0) return null

  const handleAdd = () => {
    const tags = addInput.split(/[,，\s]+/).map((tag) => tag.trim()).filter(Boolean)
    if (!tags.length) return
    onAddTags(tags)
    setAddInput('')
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border-default)] bg-[var(--color-accent-muted)] px-3 py-2 text-sm">
      <span className="shrink-0 font-mono text-xs text-[var(--color-accent)]">SELECTED {selectedCount}</span>
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <label htmlFor="batch-add-tags" className="sr-only">批量添加标签</label>
          <input
            id="batch-add-tags"
            value={addInput}
            onChange={(event) => setAddInput(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && handleAdd()}
            placeholder="标签，逗号分隔"
            className="w-40 rounded-sm border border-[var(--color-border)] bg-[var(--color-bg-input)] px-2 py-1 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
          />
          <Button size="sm" onClick={handleAdd} disabled={!addInput.trim()} title="为所选实例添加标签">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />添加
          </Button>
        </div>

        {allTags.length > 0 ? (
          <div className="flex items-center gap-1">
            <label htmlFor="batch-remove-tag" className="sr-only">选择要批量移除的标签</label>
            <select
              id="batch-remove-tag"
              value={removeTag}
              onChange={(event) => setRemoveTag(event.target.value)}
              className="rounded-sm border border-[var(--color-border)] bg-[var(--color-bg-input)] px-2 py-1 text-xs text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
            >
              <option value="">移除标签...</option>
              {allTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
            </select>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                if (removeTag) {
                  onRemoveTags([removeTag])
                  setRemoveTag('')
                }
              }}
              disabled={!removeTag}
              title="从所选实例移除标签"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />移除
            </Button>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onClear}
        aria-label="清除所选实例"
        title="清除选择"
        className="shrink-0 rounded-sm p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}

export function TagManagementPage() {
  const [profiles, setProfiles] = useState<BrowserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [pendingTags, setPendingTags] = useState<string[]>([])

  const allTagsWithPending = useMemo(() => {
    const tags = new Set<string>()
    profiles.forEach((profile) => profile.tags?.forEach((tag) => tags.add(tag)))
    pendingTags.forEach((tag) => tags.add(tag))
    return Array.from(tags).sort()
  }, [profiles, pendingTags])

  const handleCreateTag = (tag: string) => {
    if (!allTagsWithPending.includes(tag)) {
      setPendingTags((previous) => [...previous, tag])
    }
  }

  const load = async () => {
    setLoading(true)
    try {
      const data = await fetchBrowserProfiles()
      setProfiles(data)
      const usedTags = new Set<string>()
      data.forEach((profile) => profile.tags?.forEach((tag) => usedTags.add(tag)))
      setPendingTags((previous) => previous.filter((tag) => !usedTags.has(tag)))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])
  useEffect(() => { setSelectedIds(new Set()) }, [selectedTag])

  const allTags = allTagsWithPending
  const profilesByTag = useMemo(() => {
    const map: Record<string, number> = {}
    profiles.forEach((profile) => profile.tags?.forEach((tag) => { map[tag] = (map[tag] || 0) + 1 }))
    return map
  }, [profiles])

  const displayProfiles = useMemo(() => {
    if (selectedTag === null) return profiles
    return profiles.filter((profile) => profile.tags?.includes(selectedTag))
  }, [profiles, selectedTag])

  const isAllSelected = displayProfiles.length > 0 && displayProfiles.every((profile) => selectedIds.has(profile.profileId))
  const isIndeterminate = !isAllSelected && displayProfiles.some((profile) => selectedIds.has(profile.profileId))
  const toggleAll = () => {
    if (isAllSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(displayProfiles.map((profile) => profile.profileId)))
  }
  const toggleOne = (id: string) => setSelectedIds((previous) => {
    const next = new Set(previous)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const handleAddTags = async (tags: string[]) => {
    const ids = Array.from(selectedIds)
    setSaving(true)
    try {
      await batchSetProfileTags(ids, tags, false)
      toast.success(`已为 ${ids.length} 个实例添加标签`)
      await load()
    } catch (error: any) {
      toast.error(error?.message || '操作失败')
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveTags = async (tags: string[]) => {
    const ids = Array.from(selectedIds)
    setSaving(true)
    try {
      await batchRemoveProfileTags(ids, tags)
      toast.success(`已从 ${ids.length} 个实例移除标签`)
      await load()
    } catch (error: any) {
      toast.error(error?.message || '操作失败')
    } finally {
      setSaving(false)
    }
  }

  const handleRenameTag = async (oldName: string, newName: string) => {
    if (oldName === newName || !newName.trim()) return
    if (allTags.includes(newName.trim())) {
      toast.error('标签名称已存在')
      return
    }
    setSaving(true)
    try {
      await renameBrowserTag(oldName, newName.trim())
      toast.success('标签重命名成功')
      if (pendingTags.includes(oldName)) {
        setPendingTags((previous) => previous.map((tag) => tag === oldName ? newName.trim() : tag))
      }
      if (selectedTag === oldName) {
        setSelectedTag(newName.trim())
      }
      await load()
    } catch (error: any) {
      toast.error(error?.message || '重命名失败')
    } finally {
      setSaving(false)
    }
  }

  const runningCount = profiles.filter((profile) => profile.running).length

  return (
    <div className="apple-page flex h-full min-h-0 flex-col gap-4 animate-fade-in">
      <WorkspaceHeader
        eyebrow="FINGERPRINT / TAGS"
        title="实例标签"
        description="筛选实例并批量添加或移除标签。"
      />

      <AssetScopeTabs />

      <TelemetryStrip items={[
        { label: '标签', value: allTags.length, detail: `${pendingTags.length} 个待首次分配`, tone: pendingTags.length ? 'warning' : 'neutral' },
        { label: '实例', value: profiles.length, detail: `${runningCount} 个运行中`, tone: runningCount ? 'success' : 'neutral' },
        { label: '当前视图', value: displayProfiles.length, detail: selectedTag ? `标签: ${selectedTag}` : '全部实例', tone: selectedTag ? 'accent' : 'neutral' },
        { label: '已选择', value: selectedIds.size, detail: '可批量更新标签', tone: selectedIds.size ? 'accent' : 'neutral' },
      ]} />

      <TerminalPanel
        title="INSTANCE TAG MAP"
        meta={<span className="font-mono text-[10px] uppercase tracking-[0.14em]">{selectedTag ?? 'ALL PROFILES'}</span>}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <TagPanel
            tags={allTags}
            selected={selectedTag}
            profilesByTag={profilesByTag}
            totalCount={profiles.length}
            onSelect={setSelectedTag}
            onCreateTag={handleCreateTag}
            onRenameTag={handleRenameTag}
          />

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <ActionBar
              selectedCount={selectedIds.size}
              allTags={allTags}
              onAddTags={handleAddTags}
              onRemoveTags={handleRemoveTags}
              onClear={() => setSelectedIds(new Set())}
            />

            {loading ? (
              <div className="flex flex-1 items-center justify-center font-mono text-xs uppercase tracking-[0.14em] text-[var(--color-text-muted)]" role="status" aria-live="polite">
                Loading profile registry...
              </div>
            ) : displayProfiles.length === 0 ? (
              <div className="flex flex-1 items-center justify-center p-6">
                <SignalEmptyState
                  symbol="fingerprint"
                  title={selectedTag ? '此标签还没有关联实例' : '暂无浏览器实例'}
                  description={selectedTag ? '先在全部实例中分配此标签。' : '创建实例后即可维护标签。'}
                />
              </div>
            ) : (
              <div className="h-full overflow-auto">
                <table className="min-w-full">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th className="w-10 bg-[var(--color-bg-muted)] px-4 py-2.5">
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer accent-[var(--color-accent)]"
                          checked={isAllSelected}
                          ref={(element) => { if (element) element.indeterminate = isIndeterminate }}
                          onChange={toggleAll}
                          aria-label="选择当前视图中的全部实例"
                        />
                      </th>
                      <th className="bg-[var(--color-bg-muted)] px-4 py-2.5 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">实例名称</th>
                      <th className="bg-[var(--color-bg-muted)] px-4 py-2.5 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">当前标签</th>
                      <th className="bg-[var(--color-bg-muted)] px-4 py-2.5 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">状态</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border-muted)] bg-[var(--color-bg-surface)]">
                    {displayProfiles.map((profile) => {
                      const isSelected = selectedIds.has(profile.profileId)
                      return (
                        <tr
                          key={profile.profileId}
                          tabIndex={0}
                          role="checkbox"
                          aria-checked={isSelected}
                          aria-label={`选择实例 ${profile.profileName}`}
                          className={`cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--color-accent)] ${isSelected ? 'bg-[var(--color-accent-muted)]' : 'hover:bg-[var(--color-bg-muted)]/50'}`}
                          onClick={() => toggleOne(profile.profileId)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              toggleOne(profile.profileId)
                            }
                          }}
                        >
                          <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                            <input
                              type="checkbox"
                              className="h-4 w-4 cursor-pointer accent-[var(--color-accent)]"
                              checked={isSelected}
                              onChange={() => toggleOne(profile.profileId)}
                              aria-label={`选择 ${profile.profileName}`}
                            />
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-[var(--color-text-primary)]">{profile.profileName}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {profile.tags?.length
                                ? profile.tags.map((tag) => <Badge key={tag} variant={tag === selectedTag ? 'info' : 'default'}>{tag}</Badge>)
                                : <span className="text-xs text-[var(--color-text-muted)]">无标签</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={profile.running ? 'success' : 'warning'} dot>{profile.running ? '运行中' : '已停止'}</Badge>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </TerminalPanel>

      {saving ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" role="status" aria-live="assertive" aria-label="正在保存标签变更">
          <div className="rounded-sm border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] px-5 py-3 font-mono text-xs uppercase tracking-[0.14em] text-[var(--color-text-primary)] shadow-lg">
            Writing tag changes...
          </div>
        </div>
      ) : null}
    </div>
  )
}

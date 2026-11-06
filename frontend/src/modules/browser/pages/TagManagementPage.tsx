import { tr, useLocale } from '../../../shared/i18n'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Tag, Trash2, X } from 'lucide-react'
import { Badge, Button, toast } from '../../../shared/components'
import { SignalEmptyState, TerminalPanel, WorkspaceHeader } from '../../../shared/components/SignalPrimitives'
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
  useLocale()

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
    <aside className="flex w-56 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-surface)]" aria-label={tr("browser.pages.TagManagementPage.aria_label.5496292")}>
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2.5">
        <span className="font-mono text-[10px] font-semibold   text-[var(--color-text-muted)]">{tr("ui.modules.browser.pages.TagManagementPage.label.8e56d81")}</span>
        <button
          type="button"
          onClick={() => {
            setCreating(true)
            setTimeout(() => inputRef.current?.focus(), 50)
          }}
          title={tr("browser.pages.TagManagementPage.title.616054b")}
          aria-label={tr("browser.pages.TagManagementPage.title.616054b")}
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
          <span>{tr("browser.pages.TagManagementPage.text.9d2dba1")}</span>
          <span className="font-mono text-xs text-[var(--color-text-muted)]">{totalCount}</span>
        </button>

        {tags.map((tag) => (
          <div key={tag} className="min-w-0">
            {editingTag === tag ? (
              <div className="px-3 py-1.5">
                <label htmlFor={`rename-tag-${tag}`} className="sr-only">{tr("browser.pages.TagManagementPage.text.82b3fec")}{tag}</label>
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
                title={tr("browser.pages.TagManagementPage.title.0358495")}
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
          <p className="px-3 py-3 text-xs leading-5 text-[var(--color-text-muted)]">{tr("browser.pages.TagManagementPage.text.fffc9e7")}</p>
        ) : null}

        {creating ? (
          <div className="px-3 py-2">
            <label htmlFor="new-profile-tag" className="sr-only">{tr("browser.pages.TagManagementPage.text.b4240a6")}</label>
            <input
              id="new-profile-tag"
              ref={inputRef}
              value={newTag}
              onChange={(event) => setNewTag(event.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={commit}
              placeholder={tr("browser.pages.TagManagementPage.placeholder.182295d")}
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
  useLocale()

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
      <span className="shrink-0 font-mono text-xs text-[var(--color-accent)]">{tr("ui.modules.browser.pages.TagManagementPage.label.9106ca2")}{selectedCount}</span>
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <label htmlFor="batch-add-tags" className="sr-only">{tr("browser.pages.TagManagementPage.text.3b50994")}</label>
          <input
            id="batch-add-tags"
            value={addInput}
            onChange={(event) => setAddInput(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && handleAdd()}
            placeholder={tr("browser.pages.TagManagementPage.placeholder.ddc19cc")}
            className="w-40 rounded-sm border border-[var(--color-border)] bg-[var(--color-bg-input)] px-2 py-1 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
          />
          <Button size="sm" onClick={handleAdd} disabled={!addInput.trim()} title={tr("browser.pages.TagManagementPage.title.1762711")}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />{tr("browser.pages.TagManagementPage.text.94191ce")}</Button>
        </div>

        {allTags.length > 0 ? (
          <div className="flex items-center gap-1">
            <label htmlFor="batch-remove-tag" className="sr-only">{tr("browser.pages.TagManagementPage.text.68486da")}</label>
            <select
              id="batch-remove-tag"
              value={removeTag}
              onChange={(event) => setRemoveTag(event.target.value)}
              className="rounded-sm border border-[var(--color-border)] bg-[var(--color-bg-input)] px-2 py-1 text-xs text-[var(--color-text-primary)] focus:border-[var(--color-accent)] focus:outline-none"
            >
              <option value="">{tr("browser.pages.TagManagementPage.text.cc409a2")}</option>
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
              title={tr("browser.pages.TagManagementPage.title.c7612de")}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />{tr("browser.pages.TagManagementPage.text.2f752c0")}</Button>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onClear}
        aria-label={tr("browser.pages.TagManagementPage.aria_label.43db622")}
        title={tr("browser.pages.TagManagementPage.title.1955f6f")}
        className="shrink-0 rounded-sm p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}

export function TagManagementPage() {
  const uiLocale = useLocale()

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
  }, [profiles, pendingTags, uiLocale])

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
  }, [profiles, uiLocale])

  const displayProfiles = useMemo(() => {
    if (selectedTag === null) return profiles
    return profiles.filter((profile) => profile.tags?.includes(selectedTag))
  }, [profiles, selectedTag, uiLocale])

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
      toast.success(tr("browser.pages.TagManagementPage.TagManagementPage.bf8743b", [ids.length]))
      await load()
    } catch (error: any) {
      toast.error(error?.message || tr("browser.pages.TagManagementPage.TagManagementPage.09e424b"))
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveTags = async (tags: string[]) => {
    const ids = Array.from(selectedIds)
    setSaving(true)
    try {
      await batchRemoveProfileTags(ids, tags)
      toast.success(tr("browser.pages.TagManagementPage.TagManagementPage.350dc2c", [ids.length]))
      await load()
    } catch (error: any) {
      toast.error(error?.message || tr("browser.pages.TagManagementPage.TagManagementPage.09e424b"))
    } finally {
      setSaving(false)
    }
  }

  const handleRenameTag = async (oldName: string, newName: string) => {
    if (oldName === newName || !newName.trim()) return
    if (allTags.includes(newName.trim())) {
      toast.error(tr("browser.pages.TagManagementPage.TagManagementPage.3151bfe"))
      return
    }
    setSaving(true)
    try {
      await renameBrowserTag(oldName, newName.trim())
      toast.success(tr("browser.pages.TagManagementPage.TagManagementPage.0add426"))
      if (pendingTags.includes(oldName)) {
        setPendingTags((previous) => previous.map((tag) => tag === oldName ? newName.trim() : tag))
      }
      if (selectedTag === oldName) {
        setSelectedTag(newName.trim())
      }
      await load()
    } catch (error: any) {
      toast.error(error?.message || tr("browser.pages.TagManagementPage.TagManagementPage.1664ff6"))
    } finally {
      setSaving(false)
    }
  }


  return (
    <div className="apple-page flex h-full min-h-0 flex-col gap-4 animate-fade-in">
      <WorkspaceHeader

        title={tr("browser.pages.AssetScopeTabs.label.d620218")}

      />

      <AssetScopeTabs />



      <TerminalPanel
        title={tr("ui.modules.browser.pages.TagManagementPage.label.63d9a00")}
        meta={<span className="font-mono text-[10px]  ">{selectedTag ?? tr("browser.components.GroupTreeNav.text.778fc8f")}</span>}
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
              <div className="flex flex-1 items-center justify-center font-mono text-xs   text-[var(--color-text-muted)]" role="status" aria-live="polite">{tr("ui.modules.browser.pages.TagManagementPage.label.80a1cfe")}</div>
            ) : displayProfiles.length === 0 ? (
              <div className="flex flex-1 items-center justify-center p-6">
                <SignalEmptyState
                  symbol="fingerprint"
                  title={selectedTag ? tr("browser.pages.TagManagementPage.TagManagementPage.f59b331") : tr("browser.pages.TagManagementPage.TagManagementPage.a566cb1")}

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
                          aria-label={tr("browser.pages.TagManagementPage.aria_label.b4eebd6")}
                        />
                      </th>
                      <th className="bg-[var(--color-bg-muted)] px-4 py-2.5 text-left font-mono text-[10px] font-semibold   text-[var(--color-text-muted)]">{tr("browser.components.AutomationInstanceSelector.AutomationInstanceSelector.9c0531d")}</th>
                      <th className="bg-[var(--color-bg-muted)] px-4 py-2.5 text-left font-mono text-[10px] font-semibold   text-[var(--color-text-muted)]">{tr("browser.pages.TagManagementPage.text.7f0e5a8")}</th>
                      <th className="bg-[var(--color-bg-muted)] px-4 py-2.5 text-left font-mono text-[10px] font-semibold   text-[var(--color-text-muted)]">{tr("browser.components.AutomationScriptHistoryModal.text.62e951a")}</th>
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
                          aria-label={tr("browser.pages.TagManagementPage.TagManagementPage.8756384", [profile.profileName])}
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
                              aria-label={tr("browser.pages.AutomationScriptSummaryCard.AutomationScriptSummaryCard.f49303a", [profile.profileName])}
                            />
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-[var(--color-text-primary)]">{profile.profileName}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {profile.tags?.length
                                ? profile.tags.map((tag) => <Badge key={tag} variant={tag === selectedTag ? "info" : "default"}>{tag}</Badge>)
                                : <span className="text-xs text-[var(--color-text-muted)]">{tr("browser.pages.TagManagementPage.text.3a8bc2a")}</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={profile.running ? "success" : "warning"} dot>{profile.running ? tr("browser.components.AutomationScriptHistoryModal.getRunStatusLabel.5942497") : tr("browser.components.InstanceFilterBar.label.75dddf5")}</Badge>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" role="status" aria-live="assertive" aria-label={tr("browser.pages.TagManagementPage.aria_label.ca77669")}>
          <div className="rounded-sm border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] px-5 py-3 font-mono text-xs   text-[var(--color-text-primary)] shadow-lg">{tr("ui.modules.browser.pages.TagManagementPage.label.4fa8509")}</div>
        </div>
      ) : null}
    </div>
  )
}

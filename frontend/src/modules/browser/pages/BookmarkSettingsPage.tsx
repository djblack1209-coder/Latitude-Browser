import { tr, useLocale } from '../../../shared/i18n'
import { useEffect, useState } from 'react'
import { Plus, Trash2, RotateCcw, GripVertical, RefreshCw } from 'lucide-react'
import { Badge, Button, ConfirmModal, Input, toast } from '../../../shared/components'
import { SignalEmptyState, TerminalPanel, WorkspaceHeader } from '../../../shared/components/SignalPrimitives'
import { AssetScopeTabs } from './AssetScopeTabs'
import type { BrowserBookmark } from '../types'
import { fetchBookmarks, resetBookmarks, saveBookmarks, syncBookmarksToProfiles } from '../api'

const fingerprintCheckBookmarkUrl = 'ant://fingerprint-check'

const isProtectedBookmark = (item: BrowserBookmark) =>
  item.url.trim().toLowerCase() === fingerprintCheckBookmarkUrl

export function BookmarkSettingsPage() {
  useLocale()

  const [items, setItems] = useState<BrowserBookmark[]>([])
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [syncOpen, setSyncOpen] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  useEffect(() => {
    fetchBookmarks().then(setItems)
  }, [])

  const protectedItems = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => isProtectedBookmark(item))
  const regularItems = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !isProtectedBookmark(item))

  const handleChange = (index: number, field: keyof BrowserBookmark, value: string) => {
    if (field !== 'openOnStart' && isProtectedBookmark(items[index])) return
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }

  const handleAdd = () => {
    setItems(prev => [...prev, { name: '', url: '', openOnStart: false }])
  }

  const handleDelete = (index: number) => {
    if (isProtectedBookmark(items[index])) return
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  const handleOpenOnStartChange = (index: number, checked: boolean) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, openOnStart: checked } : item))
  }

  const handleSave = async () => {
    const valid = items.filter(i => i.name.trim() && i.url.trim())
    if (valid.length !== items.length) {
      toast.error(tr("browser.pages.BookmarkSettingsPage.BookmarkSettingsPage.414d6c5"))
      return
    }
    setSaving(true)
    try {
      await saveBookmarks(items)
      const result = await syncBookmarksToProfiles()
      const parts = [tr("browser.pages.BookmarkSettingsPage.BookmarkSettingsPage.0fda25a")]
      if (result.synced > 0) parts.push(tr("browser.pages.BookmarkSettingsPage.BookmarkSettingsPage.e5ca50a", [result.synced]))
      if (result.skipped > 0) parts.push(tr("browser.pages.BookmarkSettingsPage.BookmarkSettingsPage.effa75d", [result.skipped]))
      if (result.failed > 0) parts.push(tr("browser.pages.BookmarkSettingsPage.BookmarkSettingsPage.1b920db", [result.failed]))
      const message = parts.join('，')
      if (result.failed > 0 || result.skipped > 0) {
        toast.warning(message)
      } else {
        toast.success(message)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    await resetBookmarks()
    const fresh = await fetchBookmarks()
    setItems(fresh)
    toast.success(tr("browser.pages.BookmarkSettingsPage.BookmarkSettingsPage.77d361f"))
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const result = await syncBookmarksToProfiles()
      const parts = [tr("browser.pages.BookmarkSettingsPage.BookmarkSettingsPage.b46c4ec", [result.synced])]
      if (result.skipped > 0) parts.push(tr("browser.pages.BookmarkSettingsPage.BookmarkSettingsPage.effa75d", [result.skipped]))
      if (result.failed > 0) parts.push(tr("browser.pages.BookmarkSettingsPage.BookmarkSettingsPage.1b920db", [result.failed]))
      const message = parts.join('，')
      if (result.failed > 0 || result.skipped > 0) {
        toast.warning(message)
      } else {
        toast.success(message)
      }
      setSyncOpen(false)
    } catch (error: any) {
      toast.error(error?.message || tr("browser.pages.BookmarkSettingsPage.BookmarkSettingsPage.a8f14c9"))
    } finally {
      setSyncing(false)
    }
  }

  // 拖拽排序
  const handleDragStart = (index: number) => {
    if (isProtectedBookmark(items[index])) return
    setDragIndex(index)
  }
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) return
    if (isProtectedBookmark(items[dragIndex]) || isProtectedBookmark(items[index])) return
    setItems(prev => {
      const next = [...prev]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(index, 0, moved)
      return next
    })
    setDragIndex(index)
  }
  const handleDragEnd = () => setDragIndex(null)


  return (
    <div className="apple-page space-y-4">
      <WorkspaceHeader

        title={tr("browser.pages.AssetScopeTabs.label.c4581d1")}

        actions={(
          <>
            <Button variant="secondary" size="sm" onClick={() => setSyncOpen(true)} loading={syncing}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />{tr("browser.pages.BookmarkSettingsPage.text.ce45106")}</Button>
            <Button variant="secondary" size="sm" onClick={() => setResetOpen(true)}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />{tr("browser.pages.BookmarkSettingsPage.text.a191935")}</Button>
            <Button size="sm" onClick={handleSave} loading={saving}>{tr("browser.pages.BookmarkSettingsPage.text.6f07f00")}</Button>
          </>
        )}
      />

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <AssetScopeTabs />
        <div className="min-w-0 flex-1 xl:max-w-3xl">

        </div>
      </div>

      <TerminalPanel
        title={tr("ui.modules.browser.pages.BookmarkSettingsPage.label.bee4eca")}
        meta={<span className="font-mono tabular-nums">{protectedItems.length}</span>}
      >
        <div className="divide-y divide-[var(--color-border-muted)]">
          {protectedItems.map(({ item, index }) => (
            <div key={`${item.url}-${index}`} className="flex items-start gap-3 px-4 py-3">
              <GripVertical className="mt-2.5 h-4 w-4 shrink-0 text-[var(--color-text-muted)] opacity-40" aria-hidden="true" />
              <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-[9rem_minmax(0,1fr)]">
                <label className="sr-only" htmlFor={`protected-bookmark-name-${index}`}>{tr("browser.pages.BookmarkSettingsPage.text.2a1a801")}</label>
                <Input id={`protected-bookmark-name-${index}`} value={item.name} readOnly className="font-medium" />
                <label className="sr-only" htmlFor={`protected-bookmark-url-${index}`}>{tr("browser.pages.BookmarkSettingsPage.text.637b583")}</label>
                <Input id={`protected-bookmark-url-${index}`} value={item.url} readOnly className="font-mono text-xs" />
              </div>
              <label className="mt-2 flex shrink-0 items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                <input
                  type="checkbox"
                  checked={Boolean(item.openOnStart)}
                  onChange={event => handleOpenOnStartChange(index, event.target.checked)}
                  className="h-4 w-4 rounded border-[var(--color-border-default)] accent-[var(--color-accent)]"
                />{tr("browser.pages.BookmarkSettingsPage.text.4cc9132")}</label>
              <Badge variant="default" size="sm">{tr("browser.pages.BookmarkSettingsPage.text.09ceea7")}</Badge>
            </div>
          ))}
        </div>
      </TerminalPanel>

      <TerminalPanel
        title={tr("ui.modules.browser.pages.BookmarkSettingsPage.label.edc284a")}
        meta={<span className="font-mono tabular-nums">{regularItems.length}</span>}
      >
        {regularItems.length === 0 ? (
          <SignalEmptyState
            symbol="files"
            title={tr("browser.pages.BookmarkSettingsPage.title.0888b59")}

            action={(
              <Button size="sm" onClick={handleAdd}>
                <Plus className="h-4 w-4" aria-hidden="true" />{tr("browser.pages.BookmarkSettingsPage.text.9dbbfd0")}</Button>
            )}
          />
        ) : (
          <div className="divide-y divide-[var(--color-border-muted)]">
            {regularItems.map(({ item, index }) => (
              <div
                key={`${item.url}-${index}`}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={event => handleDragOver(event, index)}
                onDragEnd={handleDragEnd}
                className={`flex items-start gap-3 px-4 py-3 transition-[background-color,opacity] duration-150 ${
                  dragIndex === index ? 'bg-[var(--color-accent-muted)] opacity-80' : 'hover:bg-[var(--color-bg-subtle)]'
                }`}
              >
                <GripVertical className="mt-2.5 h-4 w-4 shrink-0 cursor-grab text-[var(--color-text-muted)]" aria-label={tr("browser.pages.BookmarkSettingsPage.aria_label.7c5da1d")} />
                <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-[9rem_minmax(0,1fr)]">
                  <label className="sr-only" htmlFor={`bookmark-name-${index}`}>{tr("browser.pages.BookmarkSettingsPage.text.6953a34")}</label>
                  <Input
                    id={`bookmark-name-${index}`}
                    value={item.name}
                    onChange={event => handleChange(index, 'name', event.target.value)}
                    placeholder={tr("browser.pages.BookmarkSettingsPage.placeholder.5bf2e16")}
                    autoComplete="off"
                  />
                  <label className="sr-only" htmlFor={`bookmark-url-${index}`}>{tr("browser.pages.BookmarkSettingsPage.text.af60e80")}</label>
                  <Input
                    id={`bookmark-url-${index}`}
                    value={item.url}
                    onChange={event => handleChange(index, 'url', event.target.value)}
                    placeholder="https://..."
                    className="font-mono text-xs"
                    inputMode="url"
                    autoComplete="url"
                    spellCheck={false}
                  />
                </div>
                <label className="mt-2 flex shrink-0 items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                  <input
                    type="checkbox"
                    checked={Boolean(item.openOnStart)}
                    onChange={event => handleOpenOnStartChange(index, event.target.checked)}
                    className="h-4 w-4 rounded border-[var(--color-border-default)] accent-[var(--color-accent)]"
                  />{tr("browser.pages.BookmarkSettingsPage.text.4cc9132")}</label>
                <button
                  type="button"
                  onClick={() => handleDelete(index)}
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--color-text-muted)] transition-[background-color,color,transform] duration-150 hover:bg-[var(--color-error)]/10 hover:text-[var(--color-error)] active:translate-y-px"
                  aria-label={tr("browser.pages.BookmarkSettingsPage.BookmarkSettingsPage.0f16f75", [item.name || index + 1])}
                  title={tr("browser.pages.BookmarkSettingsPage.title.023b5a0")}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
            <div className="px-4 py-3">
              <Button size="sm" variant="secondary" onClick={handleAdd}>
                <Plus className="h-4 w-4" aria-hidden="true" />{tr("browser.pages.BookmarkSettingsPage.text.9dbbfd0")}</Button>
            </div>
          </div>
        )}
      </TerminalPanel>
      <ConfirmModal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={handleReset}
        title={tr("browser.pages.BookmarkSettingsPage.title.3b3c546")}
        content={tr("browser.pages.BookmarkSettingsPage.content.a8c3701")}
        confirmText={tr("browser.pages.BookmarkSettingsPage.confirmText.447ea9c")}
        danger
      />

      <ConfirmModal
        open={syncOpen}
        onClose={() => setSyncOpen(false)}
        onConfirm={handleSync}
        title={tr("browser.pages.BookmarkSettingsPage.title.90fb20e")}
        content={tr("browser.pages.BookmarkSettingsPage.content.52b9d48")}
        confirmText={tr("browser.pages.BookmarkSettingsPage.confirmText.b9eb7c2")}
      />
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Plus, Trash2, RotateCcw, GripVertical, RefreshCw } from 'lucide-react'
import { Badge, Button, ConfirmModal, Input, toast } from '../../../shared/components'
import { SignalEmptyState, TelemetryStrip, TerminalPanel, WorkspaceHeader } from '../../../shared/components/SignalPrimitives'
import { AssetScopeTabs } from './AssetScopeTabs'
import type { BrowserBookmark } from '../types'
import { fetchBookmarks, resetBookmarks, saveBookmarks, syncBookmarksToProfiles } from '../api'

const fingerprintCheckBookmarkUrl = 'ant://fingerprint-check'

const isProtectedBookmark = (item: BrowserBookmark) =>
  item.url.trim().toLowerCase() === fingerprintCheckBookmarkUrl

export function BookmarkSettingsPage() {
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
      toast.error('存在空的名称或 URL，请填写完整后保存')
      return
    }
    setSaving(true)
    try {
      await saveBookmarks(items)
      const result = await syncBookmarksToProfiles()
      const parts = ['书签已保存']
      if (result.synced > 0) parts.push(`已同步 ${result.synced} 个已有实例`)
      if (result.skipped > 0) parts.push(`跳过运行中 ${result.skipped} 个，停止后再同步`)
      if (result.failed > 0) parts.push(`失败 ${result.failed} 个`)
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
    toast.success('已恢复默认书签')
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const result = await syncBookmarksToProfiles()
      const parts = [`已同步 ${result.synced} 个实例`]
      if (result.skipped > 0) parts.push(`跳过运行中 ${result.skipped} 个，停止后再同步`)
      if (result.failed > 0) parts.push(`失败 ${result.failed} 个`)
      const message = parts.join('，')
      if (result.failed > 0 || result.skipped > 0) {
        toast.warning(message)
      } else {
        toast.success(message)
      }
      setSyncOpen(false)
    } catch (error: any) {
      toast.error(error?.message || '同步失败')
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

  const startupCount = items.filter((item) => item.openOnStart).length

  return (
    <div className="apple-page space-y-4">
      <WorkspaceHeader
        eyebrow="FINGERPRINT / BOOKMARKS"
        title="默认书签"
        description="维护新实例书签；可增量同步到已停止实例。"
        actions={(
          <>
            <Button variant="secondary" size="sm" onClick={() => setSyncOpen(true)} loading={syncing}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              同步实例
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setResetOpen(true)}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              恢复默认
            </Button>
            <Button size="sm" onClick={handleSave} loading={saving}>保存书签</Button>
          </>
        )}
      />

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <AssetScopeTabs />
        <div className="min-w-0 flex-1 xl:max-w-3xl">
          <TelemetryStrip
            items={[
              { label: '书签总数', value: items.length, detail: '新实例默认写入' },
              { label: '内置检测', value: protectedItems.length, detail: '受保护条目', tone: 'accent' },
              { label: '自定义', value: regularItems.length, detail: '可排序与编辑' },
              { label: '启动时打开', value: startupCount, detail: '随实例启动', tone: startupCount > 0 ? 'success' : 'neutral' },
            ]}
          />
        </div>
      </div>

      <TerminalPanel
        title="SYSTEM BOOKMARKS"
        meta={<span className="font-mono tabular-nums">{protectedItems.length} PROTECTED</span>}
      >
        <div className="divide-y divide-[var(--color-border-muted)]">
          {protectedItems.map(({ item, index }) => (
            <div key={`${item.url}-${index}`} className="flex items-start gap-3 px-4 py-3">
              <GripVertical className="mt-2.5 h-4 w-4 shrink-0 text-[var(--color-text-muted)] opacity-40" aria-hidden="true" />
              <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-[9rem_minmax(0,1fr)]">
                <label className="sr-only" htmlFor={`protected-bookmark-name-${index}`}>内置书签名称</label>
                <Input id={`protected-bookmark-name-${index}`} value={item.name} readOnly className="font-medium" />
                <label className="sr-only" htmlFor={`protected-bookmark-url-${index}`}>内置书签地址</label>
                <Input id={`protected-bookmark-url-${index}`} value={item.url} readOnly className="font-mono text-xs" />
              </div>
              <label className="mt-2 flex shrink-0 items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                <input
                  type="checkbox"
                  checked={Boolean(item.openOnStart)}
                  onChange={event => handleOpenOnStartChange(index, event.target.checked)}
                  className="h-4 w-4 rounded border-[var(--color-border-default)] accent-[var(--color-accent)]"
                />
                启动打开
              </label>
              <Badge variant="default" size="sm">内置</Badge>
            </div>
          ))}
        </div>
      </TerminalPanel>

      <TerminalPanel
        title="BOOKMARK MANIFEST"
        meta={<span className="font-mono tabular-nums">{regularItems.length} EDITABLE</span>}
      >
        {regularItems.length === 0 ? (
          <SignalEmptyState
            symbol="files"
            title="暂无自定义书签"
            description="添加书签后，可拖动排序并设置是否随实例启动打开。"
            action={(
              <Button size="sm" onClick={handleAdd}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                添加书签
              </Button>
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
                <GripVertical className="mt-2.5 h-4 w-4 shrink-0 cursor-grab text-[var(--color-text-muted)]" aria-label="拖动调整顺序" />
                <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-[9rem_minmax(0,1fr)]">
                  <label className="sr-only" htmlFor={`bookmark-name-${index}`}>书签名称</label>
                  <Input
                    id={`bookmark-name-${index}`}
                    value={item.name}
                    onChange={event => handleChange(index, 'name', event.target.value)}
                    placeholder="名称，如 Google"
                    autoComplete="off"
                  />
                  <label className="sr-only" htmlFor={`bookmark-url-${index}`}>书签地址</label>
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
                  />
                  启动打开
                </label>
                <button
                  type="button"
                  onClick={() => handleDelete(index)}
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--color-text-muted)] transition-[background-color,color,transform] duration-150 hover:bg-[var(--color-error)]/10 hover:text-[var(--color-error)] active:translate-y-px"
                  aria-label={`删除书签 ${item.name || index + 1}`}
                  title="删除书签"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
            <div className="px-4 py-3">
              <Button size="sm" variant="secondary" onClick={handleAdd}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                添加书签
              </Button>
            </div>
          </div>
        )}
      </TerminalPanel>
      <ConfirmModal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={handleReset}
        title="恢复默认书签"
        content="将清除当前所有自定义书签，恢复为内置默认列表。确定继续？"
        confirmText="确定恢复"
        danger
      />

      <ConfirmModal
        open={syncOpen}
        onClose={() => setSyncOpen(false)}
        onConfirm={handleSync}
        title="手动同步已有实例"
        content="只会增量追加缺失的默认书签，不会删除、改名或移动用户已有书签。运行中的实例会跳过。"
        confirmText="开始同步"
      />
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Archive, ChevronDown, ChevronUp, Copy, Download, Pencil, Play, RefreshCw, Square, Trash2 } from 'lucide-react'

import { Button, toast } from '../../../shared/components'
import { regenerateBrowserProfileCode, setBrowserProfileCode } from '../api'

interface BatchToolbarProps {
  selectedCount: number
  totalCount: number
  onSelectAll: () => void
  onDeselectAll: () => void
  onBatchStart: () => void
  onBatchStop: () => void
  onBatchExport: () => void
  onOpenBackup: () => void
  onBatchDelete: () => void
  batchLoading: boolean
  exporting?: boolean
}

export function BatchToolbar({
  selectedCount,
  totalCount,
  onSelectAll,
  onDeselectAll,
  onBatchStart,
  onBatchStop,
  onBatchExport,
  onOpenBackup,
  onBatchDelete,
  batchLoading,
  exporting = false,
}: BatchToolbarProps) {
  if (selectedCount === 0) return null

  return (
    <div className="browser-batch-toolbar flex flex-wrap items-center gap-2 rounded-sm border border-[var(--color-accent)]/20 bg-[var(--color-accent)]/10 px-3 py-2">
      <span className="text-sm font-medium text-[var(--color-accent)]">已选 {selectedCount} / {totalCount}</span>
      <div className="ml-auto flex w-full flex-wrap items-center justify-end gap-1.5 sm:w-auto">
        <Button size="sm" variant="ghost" onClick={onSelectAll}>全选</Button>
        <Button size="sm" variant="ghost" onClick={onDeselectAll}>取消</Button>
        <Button size="sm" onClick={onBatchStart} loading={batchLoading} title="批量启动">
          <Play className="w-3.5 h-3.5" />启动
        </Button>
        <Button size="sm" variant="secondary" onClick={onBatchStop} loading={batchLoading} title="批量停止">
          <Square className="w-3.5 h-3.5" />停止
        </Button>
        <Button size="sm" variant="secondary" onClick={onBatchExport} loading={exporting} title="导出实例">
          <Download className="w-3.5 h-3.5" />导出
        </Button>
        <Button size="sm" variant="secondary" onClick={onOpenBackup} title="全量备份与导入">
          <Archive className="w-3.5 h-3.5" />备份
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onBatchDelete}
          title="批量删除"
          className="text-[var(--color-error)] hover:text-[var(--color-error-hover)]"
        >
          <Trash2 className="w-3.5 h-3.5" />删除
        </Button>
      </div>
    </div>
  )
}

interface LaunchCodeCellProps {
  profileId: string
  code: string
  onRefresh: () => void
}

export function LaunchCodeCell({ profileId, code, onRefresh }: LaunchCodeCellProps) {
  const [loading, setLoading] = useState(false)

  const handleCopy = () => {
    if (!code) return
    navigator.clipboard.writeText(code).then(() => toast.success('已复制快捷码'))
  }

  const handleRegenerate = async () => {
    setLoading(true)
    try {
      await regenerateBrowserProfileCode(profileId)
      onRefresh()
      toast.success('快捷码已重新生成')
    } catch {
      toast.error('重新生成失败')
    } finally {
      setLoading(false)
    }
  }

  const handleCustomCode = async () => {
    const next = prompt('请输入自定义快捷码（4-32 位，仅支持字母、数字、下划线或连字符）', code || '')
    if (next == null) return

    const value = next.trim()
    if (!value) {
      toast.error('快捷码不能为空')
      return
    }

    setLoading(true)
    try {
      const applied = await setBrowserProfileCode(profileId, value)
      onRefresh()
      toast.success(`快捷码已更新为 ${applied}`)
    } catch (error: any) {
      toast.error(error?.message || '设置自定义快捷码失败')
    } finally {
      setLoading(false)
    }
  }

  if (!code) {
    return <span className="text-[var(--color-text-muted)] text-xs">-</span>
  }

  return (
    <div className="flex items-center gap-1">
      <code className="rounded-sm border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-1.5 py-0.5 text-xs font-mono text-[var(--color-accent)]">{code}</code>
      <button type="button" aria-label="复制快捷码" onClick={handleCopy} className="rounded-sm p-0.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]" title="复制">
        <Copy className="w-3 h-3" />
      </button>
      <button type="button" aria-label="重新生成快捷码" onClick={handleRegenerate} disabled={loading} className="rounded-sm p-0.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] disabled:opacity-50" title="重新生成">
        <RefreshCw className="w-3 h-3" />
      </button>
      <button type="button" aria-label="自定义快捷码" onClick={handleCustomCode} disabled={loading} className="rounded-sm p-0.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] disabled:opacity-50" title="自定义">
        <Pencil className="w-3 h-3" />
      </button>
    </div>
  )
}

interface KeywordInlineRowProps {
  keywords: string[]
}

export function KeywordInlineRow({ keywords }: KeywordInlineRowProps) {
  const [expanded, setExpanded] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)

  const handleCopyKeyword = async (keyword: string) => {
    try {
      await navigator.clipboard.writeText(keyword)
      toast.success('关键字已复制')
    } catch {
      toast.error('复制失败')
    }
  }

  useEffect(() => {
    if (containerRef.current) {
      setIsOverflowing(containerRef.current.scrollHeight > 36)
    }
  }, [keywords])

  if (!keywords?.length) {
    return <span className="text-xs text-[var(--color-text-muted)]">-</span>
  }

  return (
    <div className="flex items-start gap-4 w-full min-w-0">
      <div
        ref={containerRef}
        className={`flex min-w-0 flex-1 flex-wrap gap-1.5 ${expanded ? '' : 'max-h-[32px] overflow-hidden'}`}
      >
        {keywords.map((keyword, index) => (
          <button
            type="button"
            key={index}
            className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-sm border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-2 py-0.5 text-left text-xs text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            title={`点击复制：${keyword}`}
            onClick={() => { void handleCopyKeyword(keyword) }}
          >
            <span className="text-[var(--color-text-muted)] font-mono shrink-0">{index + 1}.</span>
            <span className="truncate">{keyword}</span>
          </button>
        ))}
      </div>
      {isOverflowing && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? '收起关键字详情' : '展开关键字详情'}
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-1 flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        >
          {expanded ? (
            <>收回 <ChevronUp className="w-3.5 h-3.5" /></>
          ) : (
            <>展开详情 <ChevronDown className="w-3.5 h-3.5" /></>
          )}
        </button>
      )}
    </div>
  )
}

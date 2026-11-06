import { tr, useLocale } from '../../../shared/i18n'
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
  useLocale()

  if (selectedCount === 0) return null

  return (
    <div className="browser-batch-toolbar flex flex-wrap items-center gap-2 rounded-sm border border-[var(--color-accent)]/20 bg-[var(--color-accent)]/10 px-3 py-2">
      <span className="text-sm font-medium text-[var(--color-accent)]">{tr("browser.components.BrowserListWidgets.text.17f3287")}{selectedCount} / {totalCount}</span>
      <div className="ml-auto flex w-full flex-wrap items-center justify-end gap-1.5 sm:w-auto">
        <Button size="sm" variant="ghost" onClick={onSelectAll}>{tr("browser.components.BrowserListWidgets.text.3e44b2a")}</Button>
        <Button size="sm" variant="ghost" onClick={onDeselectAll}>{tr("App.CloseConfirmModal.4d0b468")}</Button>
        <Button size="sm" onClick={onBatchStart} loading={batchLoading} title={tr("browser.components.BrowserListWidgets.title.e85077e")}>
          <Play className="w-3.5 h-3.5" />{tr("browser.components.BrowserListWidgets.text.ebd26da")}</Button>
        <Button size="sm" variant="secondary" onClick={onBatchStop} loading={batchLoading} title={tr("browser.components.BrowserListWidgets.title.4e683b5")}>
          <Square className="w-3.5 h-3.5" />{tr("browser.components.BrowserListWidgets.text.a17f70a")}</Button>
        <Button size="sm" variant="secondary" onClick={onBatchExport} loading={exporting} title={tr("browser.components.BrowserListWidgets.title.ad092ee")}>
          <Download className="w-3.5 h-3.5" />{tr("browser.components.AutomationScriptExportModal.text.1888967")}</Button>
        <Button size="sm" variant="secondary" onClick={onOpenBackup} title={tr("browser.components.BrowserListWidgets.title.b9c023b")}>
          <Archive className="w-3.5 h-3.5" />{tr("browser.components.BrowserListWidgets.text.2aadd3e")}</Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onBatchDelete}
          title={tr("browser.components.BrowserListWidgets.title.362aedc")}
          className="text-[var(--color-error)] hover:text-[var(--color-error-hover)]"
        >
          <Trash2 className="w-3.5 h-3.5" />{tr("browser.components.BrowserListLayout.title.3755f56")}</Button>
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
  useLocale()

  const [loading, setLoading] = useState(false)

  const handleCopy = () => {
    if (!code) return
    navigator.clipboard.writeText(code).then(() => toast.success(tr("browser.components.BrowserListWidgets.LaunchCodeCell.169ec47")))
  }

  const handleRegenerate = async () => {
    setLoading(true)
    try {
      await regenerateBrowserProfileCode(profileId)
      onRefresh()
      toast.success(tr("browser.components.BrowserListWidgets.LaunchCodeCell.69c7e21"))
    } catch {
      toast.error(tr("browser.components.BrowserListWidgets.LaunchCodeCell.49963d8"))
    } finally {
      setLoading(false)
    }
  }

  const handleCustomCode = async () => {
    const next = prompt(tr("browser.components.BrowserListWidgets.LaunchCodeCell.89780d2"), code || '')
    if (next == null) return

    const value = next.trim()
    if (!value) {
      toast.error(tr("browser.components.BrowserListWidgets.LaunchCodeCell.f24b829"))
      return
    }

    setLoading(true)
    try {
      const applied = await setBrowserProfileCode(profileId, value)
      onRefresh()
      toast.success(tr("browser.components.BrowserListWidgets.LaunchCodeCell.048e6fa", [applied]))
    } catch (error: any) {
      toast.error(error?.message || tr("browser.components.BrowserListWidgets.LaunchCodeCell.fc7cb1c"))
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
      <button type="button" aria-label={tr("browser.components.BrowserListWidgets.aria_label.c63c5ae")} onClick={handleCopy} className="rounded-sm p-0.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]" title={tr("browser.components.AutomationScriptPublicApiBodyExamples.text.4edd1d0")}>
        <Copy className="w-3 h-3" />
      </button>
      <button type="button" aria-label={tr("browser.components.BrowserListWidgets.aria_label.4995274")} onClick={handleRegenerate} disabled={loading} className="rounded-sm p-0.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] disabled:opacity-50" title={tr("browser.components.BrowserListWidgets.title.2e19057")}>
        <RefreshCw className="w-3 h-3" />
      </button>
      <button type="button" aria-label={tr("browser.components.BrowserListWidgets.aria_label.64c8057")} onClick={handleCustomCode} disabled={loading} className="rounded-sm p-0.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] disabled:opacity-50" title={tr("browser.components.BrowserListWidgets.title.c493338")}>
        <Pencil className="w-3 h-3" />
      </button>
    </div>
  )
}

interface KeywordInlineRowProps {
  keywords: string[]
}

export function KeywordInlineRow({ keywords }: KeywordInlineRowProps) {
  useLocale()

  const [expanded, setExpanded] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)

  const handleCopyKeyword = async (keyword: string) => {
    try {
      await navigator.clipboard.writeText(keyword)
      toast.success(tr("browser.components.BrowserListWidgets.KeywordInlineRow.0224d76"))
    } catch {
      toast.error(tr("browser.components.AutomationScriptPublicApiModal.helpers.copyText.f2c6b51"))
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
            title={tr("browser.components.BrowserListWidgets.KeywordInlineRow.e2295c7", [keyword])}
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
          aria-label={expanded ? tr("browser.components.BrowserListWidgets.KeywordInlineRow.c0258cf") : tr("browser.components.BrowserListWidgets.KeywordInlineRow.996e95c")}
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-1 flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        >
          {expanded ? (
            <>{tr("browser.components.BrowserListWidgets.text.77cd3ee")}<ChevronUp className="w-3.5 h-3.5" /></>
          ) : (
            <>{tr("browser.components.BrowserListWidgets.text.d8647fe")}<ChevronDown className="w-3.5 h-3.5" /></>
          )}
        </button>
      )}
    </div>
  )
}

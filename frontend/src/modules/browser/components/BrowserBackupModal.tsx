import { tr, useLocale } from '../../../shared/i18n'
import { AlertTriangle, DatabaseBackup, Download, Upload } from 'lucide-react'

import { Button, Modal } from '../../../shared/components'

type BackupMode = 'export' | 'import-merge' | 'import-reset' | 'none'

const footerButtonClassName = 'shrink-0 whitespace-nowrap'

interface BrowserBackupModalProps {
  open: boolean
  runningCount: number
  selectedCount: number
  selectedExporting: boolean
  loadingMode: BackupMode
  onClose: () => void
  onExportSelected: () => void
  onExportFull: () => void
  onImportMerge: () => void
  onImportReset: () => void
}

export function BrowserBackupModal({
  open,
  runningCount,
  selectedCount,
  selectedExporting,
  loadingMode,
  onClose,
  onExportSelected,
  onExportFull,
  onImportMerge,
  onImportReset,
}: BrowserBackupModalProps) {
  useLocale()

  const busy = loadingMode !== 'none' || selectedExporting

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose()
      }}
      title={tr("browser.components.BrowserBackupModal.title.94d76a3")}
      width="720px"
      closable={!busy}
      footer={(
        <>
          <Button className={footerButtonClassName} variant="secondary" onClick={onClose} disabled={busy}>{tr("ui.components.Modal.aria_label.6c14bd7")}</Button>
          <Button className={footerButtonClassName} variant="secondary" onClick={onImportMerge} loading={loadingMode === 'import-merge'} disabled={busy && loadingMode !== 'import-merge'}>
            <Upload className="w-4 h-4" />{tr("browser.components.BrowserBackupModal.text.93418b3")}</Button>
          <Button className={footerButtonClassName} variant="danger" onClick={onImportReset} loading={loadingMode === 'import-reset'} disabled={busy && loadingMode !== 'import-reset'}>{tr("browser.components.BrowserBackupModal.text.9745ff7")}</Button>
          <Button className={footerButtonClassName} variant="secondary" onClick={onExportSelected} loading={selectedExporting} disabled={selectedCount === 0 || (busy && !selectedExporting)}>
            <Download className="w-4 h-4" />{tr("browser.components.BrowserBackupModal.text.95ba41c")}</Button>
          <Button className={footerButtonClassName} onClick={onExportFull} loading={loadingMode === 'export'} disabled={busy && loadingMode !== 'export'}>
            <Download className="w-4 h-4" />{tr("browser.components.BrowserBackupModal.text.656cd58")}</Button>
        </>
      )}
    >
      <div className="space-y-4 text-sm text-[var(--color-text-secondary)]">
        <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-3">
          <div className="flex items-center gap-2 font-medium text-[var(--color-text-primary)]">
            <DatabaseBackup className="w-4 h-4" />
            <span>{tr("browser.components.BrowserBackupModal.text.7773df2")}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[var(--color-text-muted)]">
            <span>{tr("browser.components.BrowserBackupModal.text.dcdef2e")}</span>
            <span>{tr("browser.components.BrowserBackupModal.text.5876abb")}</span>
            <span>{tr("browser.components.BrowserBackupModal.text.ee1f732")}</span>
            <span>{tr("browser.components.BrowserBackupModal.text.587cfbe")}</span>
            <span>{tr("browser.components.BrowserBackupModal.text.6d3f0a6")}</span>
            <span>{tr("ui.modules.browser.components.BrowserBackupModal.label.7e83925")}</span>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--color-border-default)] p-3 text-xs leading-5 text-[var(--color-text-muted)]">
          <p><span className="font-medium text-[var(--color-text-secondary)]">{tr("browser.components.BrowserBackupModal.text.635564b")}</span>{tr("browser.components.BrowserBackupModal.text.7718ec1")}{selectedCount}{tr("browser.components.BrowserBackupModal.text.ead5b24")}</p>
          <p>{tr("browser.components.BrowserBackupModal.text.5252b0f")}</p>
        </div>

        {runningCount > 0 && (
          <div className="flex gap-2 rounded-lg border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-3 text-xs text-[var(--color-warning)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{tr("browser.components.BrowserBackupModal.text.b49934b")}{runningCount}{tr("browser.components.BrowserBackupModal.text.3f8c8a7")}</span>
          </div>
        )}

        <div className="rounded-lg border border-[var(--color-border-default)] p-3 text-xs leading-5 text-[var(--color-text-muted)]">
          <p>{tr("browser.components.BrowserBackupModal.text.80257f3")}</p>
          <p>{tr("browser.components.BrowserBackupModal.text.4616680")}</p>
        </div>

        <div className="grid grid-cols-1 gap-2 text-xs text-[var(--color-text-muted)]">
          <p><span className="font-medium text-[var(--color-text-secondary)]">{tr("browser.components.BrowserBackupModal.text.9f425b7")}</span>{tr("browser.components.BrowserBackupModal.text.8444fff")}</p>
          <p><span className="font-medium text-[var(--color-text-secondary)]">{tr("browser.components.BrowserBackupModal.text.6294d4a")}</span>{tr("browser.components.BrowserBackupModal.text.bc2038a")}</p>
          <p><span className="font-medium text-[var(--color-text-secondary)]">{tr("browser.components.BrowserBackupModal.text.688848b")}</span>{tr("browser.components.BrowserBackupModal.text.356bf86")}</p>
        </div>
      </div>
    </Modal>
  )
}

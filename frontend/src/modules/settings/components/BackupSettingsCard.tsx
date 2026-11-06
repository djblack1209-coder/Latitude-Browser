import { translateMessage } from '../../../shared/i18n'
import { tr, useLocale } from '../../../shared/i18n'
import { useState, type RefObject } from 'react'
import { Download, RotateCcw, Upload } from 'lucide-react'

import { Button, Card, Input, Modal, Progress } from '../../../shared/components'

import type { BackupExportLogItem, BackupExportProgress } from '../progress'

type BackupActionLoading = 'none' | 'init' | 'export' | 'import-reset' | 'import-merge'

interface BackupProgressPanelProps {
  progress: BackupExportProgress
  loadingLabel: string
  logs?: BackupExportLogItem[]
  logsRef?: RefObject<HTMLDivElement | null>
}

interface BackupSettingsCardProps {
  actionLoading: BackupActionLoading
  exportProgress: BackupExportProgress | null
  exportLogs: BackupExportLogItem[]
  exportLogsRef: RefObject<HTMLDivElement | null>
  onInitialize: () => void
  onExport: () => void
  onOpenImport: () => void
}

interface BackupImportModalProps {
  open: boolean
  actionLoading: BackupActionLoading
  importProgress: BackupExportProgress | null
  onClose: () => void
  onImport: (resetFirst: boolean) => void
}

function BackupProgressPanel({ progress, loadingLabel, logs = [], logsRef }: BackupProgressPanelProps) {
  useLocale()

  return (
    <div className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-3 py-2 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--color-text-secondary)]">{translateMessage(progress.message)}</span>
        {progress.phase === 'error' && <span className="text-[var(--color-error)]">{tr("browser.components.AutomationScriptHistoryModal.getRunStatusLabel.3e3c806")}</span>}
        {progress.phase === 'done' && <span className="text-[var(--color-success)]">{tr("settings.components.BackupSettingsCard.text.33246f6")}</span>}
        {progress.phase !== 'done' && progress.phase !== 'error' && (
          <span className="text-[var(--color-text-muted)]">{loadingLabel}</span>
        )}
      </div>
      {(progress.componentName || progress.componentId || logsRef) && (
        <div className="text-xs text-[var(--color-text-muted)]">{tr("settings.components.BackupSettingsCard.text.fe4b83a")}{' '}
          {progress.componentName || progress.componentId || tr("browser.automationRuntime.getAutomationRuntimeBadgeText.4f1f8aa")}
          {progress.entryIndex && progress.entryTotal
            ? `（${progress.entryIndex}/${progress.entryTotal}）`
            : ''}
        </div>
      )}
      <Progress
        percent={progress.progress}
        size="sm"
        status={progress.phase === 'error' ? "error" : progress.phase === 'done' ? "success" : "normal"}
      />
      {logsRef && (
        <div className="rounded border border-[var(--color-border-muted)] bg-[var(--color-bg-primary)] px-2 py-2">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-[var(--color-text-secondary)]">{tr("settings.components.BackupSettingsCard.text.252fed9")}</span>
            <span className="text-[var(--color-text-muted)]">{logs.length}{tr("browser.pages.BrowserLogsPage.text.eb8c2d5")}</span>
          </div>
          <div ref={logsRef} className="max-h-36 overflow-y-auto pr-1 space-y-1">
            {logs.length === 0 && (
              <p className="text-xs text-[var(--color-text-muted)]">{tr("settings.components.BackupSettingsCard.text.cd440ac")}</p>
            )}
            {logs.map(item => (
              <div key={item.id} className="text-xs leading-5 font-mono">
                <span className="text-[var(--color-text-muted)] mr-2">{item.time}</span>
                <span className={item.phase === 'error' ? 'text-[var(--color-error)]' : item.phase === 'done' ? 'text-[var(--color-success)]' : 'text-[var(--color-text-secondary)]'}>
                  {item.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function BackupSettingsCard({
  actionLoading,
  exportProgress,
  exportLogs,
  exportLogsRef,
  onInitialize,
  onExport,
  onOpenImport,
}: BackupSettingsCardProps) {
  useLocale()
  const [resetOpen, setResetOpen] = useState(false)
  const [resetInput, setResetInput] = useState('')
  const resetWord = tr('settings.resetWord')


  return (
    <Card title={tr("settings.components.BackupSettingsCard.title.2052e44")}  className="apple-section">
      <div className="space-y-3">
        <p className="text-xs text-[var(--color-text-muted)]">{tr("settings.components.BackupSettingsCard.text.a88f6ff")}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="danger"
            size="sm"
            onClick={() => { setResetInput(''); setResetOpen(true) }}
            loading={actionLoading === 'init'}
          >
            <RotateCcw className="w-4 h-4" />{tr('settings.resetTitle')}</Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onExport}
            loading={actionLoading === 'export'}
          >
            <Download className="w-4 h-4" />{tr("settings.components.BackupSettingsCard.text.3d05c8a")}</Button>
          <Button size="sm" onClick={onOpenImport}>
            <Upload className="w-4 h-4" />{tr("settings.components.BackupSettingsCard.text.3468706")}</Button>
        </div>
        {exportProgress && (
          <BackupProgressPanel
            progress={exportProgress}
            loadingLabel={tr("settings.components.BackupSettingsCard.loadingLabel.fcb979e")}
            logs={exportLogs}
            logsRef={exportLogsRef}
          />
        )}
      </div>
      <Modal open={resetOpen} onClose={() => { setResetOpen(false); setResetInput('') }} title={tr('settings.resetTitle')} footer={<><Button variant="secondary" onClick={() => setResetOpen(false)}>{tr('common.cancel')}</Button><Button variant="danger" disabled={resetInput !== resetWord || actionLoading !== 'none'} onClick={() => { if (resetInput === resetWord) { setResetOpen(false); setResetInput(''); onInitialize() } }}>{tr('settings.resetTitle')}</Button></>}>
        <p className="mb-4 text-sm text-[var(--warn)]">{tr('settings.SettingsPage.GeneralSettingsPage.88bc6c9')}</p>
        <label className="mb-2 block text-sm" htmlFor="reset-confirmation">{tr('settings.resetConfirm', [resetWord])}</label>
        <Input id="reset-confirmation" value={resetInput} onChange={event => setResetInput(event.target.value)} autoComplete="off" spellCheck={false} />
      </Modal>
    </Card>
  )
}

export function BackupImportModal({
  open,
  actionLoading,
  importProgress,
  onClose,
  onImport,
}: BackupImportModalProps) {
  useLocale()

  const importRunning = actionLoading === 'import-reset' || actionLoading === 'import-merge'

  return (
    <Modal
      open={open}
      onClose={() => {
        if (actionLoading !== 'none') {
          return
        }
        onClose()
      }}
      title={tr("settings.components.BackupSettingsCard.text.3468706")}
      width="520px"
      closable={!importRunning}
      footer={(
        <>
          {!importRunning && (
            <Button variant="secondary" onClick={onClose}>{tr("App.CloseConfirmModal.4d0b468")}</Button>
          )}
          <Button
            variant="danger"
            onClick={() => onImport(true)}
            loading={actionLoading === 'import-reset'}
            disabled={actionLoading !== 'none' && actionLoading !== 'import-reset'}
          >{tr("settings.components.BackupSettingsCard.text.db0461c")}</Button>
          <Button
            onClick={() => onImport(false)}
            loading={actionLoading === 'import-merge'}
            disabled={actionLoading !== 'none' && actionLoading !== 'import-merge'}
          >{tr("settings.components.BackupSettingsCard.text.2cf70c2")}</Button>
        </>
      )}
    >
      <div className="space-y-3 text-sm text-[var(--color-text-secondary)]">
        <p>{tr("settings.components.BackupSettingsCard.text.2dcd5b6")}</p>
        <p className="text-xs text-[var(--color-text-muted)]">{tr("settings.components.BackupSettingsCard.text.9bf782d")}</p>
        {importProgress && (
          <BackupProgressPanel progress={importProgress} loadingLabel={tr("ui.components.Loading.Loading.ce56f61")} />
        )}
        {importRunning && (
          <p className="text-xs text-[var(--color-warning)]">{tr("settings.components.BackupSettingsCard.text.7bae2dd")}</p>
        )}
      </div>
    </Modal>
  )
}

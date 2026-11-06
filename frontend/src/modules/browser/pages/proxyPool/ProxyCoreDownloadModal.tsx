import { translateMessage } from '../../../../shared/i18n'
import { tr, useLocale } from '../../../../shared/i18n'
﻿import { useState } from 'react'
import { BrowserOpenURL } from '../../../../wailsjs/runtime/runtime'
import { Button, FormItem, Input, Modal, Select, toast } from '../../../../shared/components'
import { browserProxyCoreDownloadInfo, browserProxyCoreOpenLocal } from '../../api'
import type { ProxyCoreDownloadInfoResult, ProxyCoreDownloadProgress, ProxyCoreStatusResult } from '../../types'

interface ProxyCoreDownloadModalProps {
  open: boolean
  core: string
  goos: string
  goarch: string
  downloadProxy: string
  progress: ProxyCoreDownloadProgress | null
  status: ProxyCoreStatusResult | null
  statusLoading: boolean
  onCoreChange: (core: string) => void
  onGOOSChange: (goos: string) => void
  onGOARCHChange: (goarch: string) => void
  onDownloadProxyChange: (proxy: string) => void
  onClose: () => void
  onStart: () => void
}

export function ProxyCoreDownloadModal({
  open,
  core,
  goos,
  goarch,
  downloadProxy,
  progress,
  status,
  statusLoading,
  onCoreChange,
  onGOOSChange,
  onGOARCHChange,
  onDownloadProxyChange,
  onClose,
  onStart,
}: ProxyCoreDownloadModalProps) {
  useLocale()

  const downloading = !!progress && !['done', 'error'].includes(progress.phase)
  const [manualInfo, setManualInfo] = useState<ProxyCoreDownloadInfoResult | null>(null)
  const [manualLoading, setManualLoading] = useState(false)

  const loadManualInfo = async () => {
    const info = await browserProxyCoreDownloadInfo(core, goos, goarch, downloadProxy)
    setManualInfo(info)
    return info
  }

  const handleOpenRemote = async () => {
    try {
      setManualLoading(true)
      const info = await loadManualInfo()
      const url = info.downloadUrl || info.releaseUrl
      if (!url) {
        toast.error(info.message || tr("browser.pages.proxyPool.ProxyCoreDownloadModal.ProxyCoreDownloadModal.61963a1"))
        return
      }
      BrowserOpenURL(url)
      if (!info.downloadUrl && info.message) toast.info(info.message)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("browser.pages.proxyPool.ProxyCoreDownloadModal.ProxyCoreDownloadModal.8f0efcc"))
    } finally {
      setManualLoading(false)
    }
  }

  const handleOpenLocal = async () => {
    try {
      const ok = await browserProxyCoreOpenLocal(core, goos, goarch)
      if (!ok) toast.error(tr("browser.api.proxies.message.2de16c7"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("browser.pages.proxyPool.ProxyCoreDownloadModal.ProxyCoreDownloadModal.bcd5d4d"))
    }
  }

  const handleClose = () => {
    if (downloading) {
      toast.warning(tr("browser.pages.proxyPool.ProxyCoreDownloadModal.ProxyCoreDownloadModal.f649ee6"))
      return
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={tr("browser.pages.proxyPool.ProxyCoreDownloadModal.title.76a9301")}
      width="460px"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={downloading}>{tr("ui.components.Modal.aria_label.6c14bd7")}</Button>
          <Button onClick={onStart} loading={downloading}>{tr("browser.pages.coreManagement.CoreDownloadModal.CoreDownloadModal.92f3559")}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormItem label={tr("browser.pages.proxyPool.ProxyCoreDownloadModal.label.0d1f972")}>
          <Select
            value={core}
            onChange={e => onCoreChange(e.target.value)}
            disabled={downloading}
            options={[
              { value: 'xray', label: tr("browser.pages.proxyPool.ProxyCoreDownloadModal.label.0fe79be") },
              { value: 'sing-box', label: tr("browser.pages.proxyPool.ProxyCoreDownloadModal.label.fe952e4") },
              { value: 'mihomo', label: tr("browser.pages.proxyPool.ProxyCoreDownloadModal.label.4ab257f") },
            ]}
          />
        </FormItem>

        <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[var(--color-text-muted)]">{tr("browser.pages.proxyPool.ProxyCoreDownloadModal.text.634489d")}</span>
            <span className={status?.installed ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}>
              {statusLoading ? tr("browser.pages.proxyPool.ProxyCoreDownloadModal.ProxyCoreDownloadModal.d3c8f2e") : status?.message || tr("browser.pages.proxyPool.ProxyCoreDownloadModal.ProxyCoreDownloadModal.d9c32a4")}
            </span>
          </div>
          {status?.binaryPath && (
            <div className="mt-1 truncate text-xs text-[var(--color-text-muted)]" title={status.binaryPath}>
              {status.binaryPath}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormItem label={tr("browser.pages.proxyPool.ProxyCoreDownloadModal.label.a1181ad")}>
            <Select
              value={goos}
              onChange={e => onGOOSChange(e.target.value)}
              disabled={downloading}
              options={[
                { value: 'windows', label: "Windows" },
                { value: 'linux', label: "Linux" },
                { value: 'darwin', label: "macOS" },
              ]}
            />
          </FormItem>
          <FormItem label={tr("browser.pages.proxyPool.ProxyCoreDownloadModal.label.395bd28")}>
            <Select
              value={goarch}
              onChange={e => onGOARCHChange(e.target.value)}
              disabled={downloading}
              options={[
                { value: 'amd64', label: "amd64 / x64" },
                { value: 'arm64', label: "arm64" },
                { value: '386', label: '386 / x86' },
              ]}
            />
          </FormItem>
        </div>

        <FormItem label={tr("browser.pages.proxyPool.ProxyCoreDownloadModal.label.f9a640b")}>
          <Input
            value={downloadProxy}
            onChange={e => onDownloadProxyChange(e.target.value)}
            disabled={downloading}
            placeholder={tr("browser.pages.proxyPool.ProxyCoreDownloadModal.placeholder.6343daa")}
          />
        </FormItem>

        {progress && (
          <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] p-3">
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <span className={progress.phase === 'error' ? 'text-[var(--color-error)]' : 'text-[var(--color-text-primary)]'}>
                {translateMessage(progress.message)}
              </span>
              <span className="text-[var(--color-text-muted)]">{progress.progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full border border-[var(--color-border-muted)] bg-[var(--color-bg-surface)]">
              <div
                className={progress.phase === 'error' ? 'h-2 bg-red-500' : 'h-2 bg-[var(--color-accent)]'}
                style={{ width: `${Math.max(0, Math.min(100, progress.progress))}%` }}
              />
            </div>
          </div>
        )}

        <div className="rounded-lg border border-[var(--color-border-default)] p-3 text-sm">
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleOpenLocal} disabled={downloading}>{tr("browser.pages.proxyPool.ProxyCoreDownloadModal.text.6e08dd7")}</Button>
            <Button variant="secondary" onClick={handleOpenRemote} loading={manualLoading} disabled={downloading}>{tr("browser.pages.proxyPool.ProxyCoreDownloadModal.text.d20787a")}</Button>
          </div>
          {(manualInfo || progress?.phase === 'error') && (
            <div className="mt-2 space-y-1 text-xs text-[var(--color-text-muted)]">
              <div>{manualInfo?.message || tr("browser.pages.proxyPool.ProxyCoreDownloadModal.ProxyCoreDownloadModal.171ce05")}</div>
              {manualInfo?.version && <div>{tr("browser.pages.proxyPool.ProxyCoreDownloadModal.text.bfc2c79")}{manualInfo.version}</div>}
              <div>{tr("browser.pages.proxyPool.ProxyCoreDownloadModal.text.201b002")}{manualInfo?.installDir || tr("browser.pages.proxyPool.ProxyCoreDownloadModal.ProxyCoreDownloadModal.78e0848")}</div>
              {manualInfo?.assetName && <div>{tr("browser.pages.proxyPool.ProxyCoreDownloadModal.text.c76c54e")}{manualInfo.assetName}</div>}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

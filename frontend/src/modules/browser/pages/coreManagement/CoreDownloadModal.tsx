import { translateMessage } from '../../../../shared/i18n'
import { tr, useLocale } from '../../../../shared/i18n'
import type { Dispatch, SetStateAction } from 'react'
import { Button, FormItem, Input, Modal, toast } from '../../../../shared/components'
import { BrowserOpenURL } from '../../../../wailsjs/runtime/runtime'
import type { BrowserProxy } from '../../types'
import type { CoreDownloadForm, CoreDownloadProgress } from '../coreManagement.types'
import { FINGERPRINT_CHROMIUM_RELEASES_URL } from './coreDownloadRecommendation'
import type { CoreDownloadRecommendation } from './coreDownloadRecommendation'

interface CoreDownloadModalProps {
  open: boolean
  form: CoreDownloadForm
  progress: CoreDownloadProgress | null
  recommendation: CoreDownloadRecommendation | null
  recommendationLoading: boolean
  recommendationError: string
  proxies: BrowserProxy[]
  setForm: Dispatch<SetStateAction<CoreDownloadForm>>
  setProgress: Dispatch<SetStateAction<CoreDownloadProgress | null>>
  onRefreshRecommendation: () => void
  onClose: () => void
  onStart: () => void
}

export function CoreDownloadModal({
  open,
  form,
  progress,
  recommendation,
  recommendationLoading,
  recommendationError,
  proxies,
  setForm,
  setProgress,
  onRefreshRecommendation,
  onClose,
  onStart,
}: CoreDownloadModalProps) {
  useLocale()

  const downloading = progress !== null && progress.phase !== 'error'
  const isRedownload = form.mode === 'redownload'

  const handleClose = () => {
    if (progress && progress.phase !== 'done' && progress.phase !== 'error') {
      toast.warning(tr("browser.pages.coreManagement.CoreDownloadModal.CoreDownloadModal.3be57ef"))
      return
    }
    onClose()
    setProgress(null)
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={isRedownload ? tr("browser.pages.coreManagement.CoreDownloadModal.CoreDownloadModal.7af1133") : tr("browser.pages.CoreManagementPage.text.ee587b7")}
      width="480px"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={downloading}>{tr("App.CloseConfirmModal.4d0b468")}</Button>
          <Button onClick={onStart} loading={downloading}>{isRedownload ? tr("browser.pages.coreManagement.CoreDownloadModal.CoreDownloadModal.d230290") : tr("browser.pages.coreManagement.CoreDownloadModal.CoreDownloadModal.92f3559")}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormItem label={tr("browser.components.BrowserListLayout.label.01e4c4a")} required>
          <Input
            value={form.name}
            onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            placeholder={recommendation?.namePlaceholder || tr("browser.pages.coreManagement.CoreDownloadModal.CoreDownloadModal.eff6f43")}
            disabled={progress !== null || isRedownload}
          />
          {!isRedownload && (
            <p className="text-xs text-[var(--color-text-muted)] mt-1">{tr("browser.pages.coreManagement.CoreDownloadModal.text.8d1527d")}</p>
          )}
        </FormItem>

        {isRedownload && (
          <div className="rounded-lg border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-3 text-xs leading-5 text-[var(--color-warning)]">{tr("browser.pages.coreManagement.CoreDownloadModal.text.58f8416")}</div>
        )}
        {recommendation?.target.platform === 'darwin' && <p role="note" className="text-xs text-[var(--color-warning)]">{tr("browser.pages.coreManagement.CoreDownloadModal.text.a546fb1")}</p>}

        <FormItem label={tr("browser.pages.ExtensionManagementModals.ManualInstallModal.581bbd6")} required>
          <Input
            value={form.url}
            onChange={e => setForm(prev => ({ ...prev, url: e.target.value }))}
            placeholder={recommendationLoading ? tr("browser.pages.coreManagement.CoreDownloadModal.CoreDownloadModal.a04ea66") : 'https://github.com/.../chromium.zip'}
            disabled={progress !== null}
          />
          <div className="text-xs text-[var(--color-text-muted)] mt-2 flex items-center justify-between gap-3 bg-[var(--color-bg-muted)] p-2 rounded">
            <span className="min-w-0 truncate">
              {recommendation
                ? tr("browser.pages.coreManagement.CoreDownloadModal.CoreDownloadModal.ff50b03", [recommendation.target.label, recommendation.assetName])
                : recommendationLoading
                  ? tr("browser.pages.coreManagement.CoreDownloadModal.CoreDownloadModal.686f54a")
                  : recommendationError || tr("browser.pages.coreManagement.CoreDownloadModal.CoreDownloadModal.dacc526")}
            </span>
            {recommendation && (
              <button
                type="button"
                onClick={() => setForm(prev => ({ ...prev, url: recommendation.downloadUrl }))}
                className="shrink-0 text-[var(--color-accent)] hover:underline cursor-pointer font-medium"
                disabled={progress !== null}
              >{tr("browser.pages.coreManagement.CoreDownloadModal.text.8128094")}</button>
            )}
            <button
              type="button"
              onClick={() => BrowserOpenURL(recommendation?.releasesUrl || FINGERPRINT_CHROMIUM_RELEASES_URL)}
              className="shrink-0 text-[var(--color-accent)] hover:underline cursor-pointer font-medium"
            >{tr("browser.pages.coreManagement.CoreDownloadModal.text.62d152a")}</button>
            {!recommendationLoading && !recommendation && (
              <button
                type="button"
                onClick={onRefreshRecommendation}
                className="shrink-0 text-[var(--color-accent)] hover:underline cursor-pointer font-medium"
              >{tr("settings.SettingsPage.text.e2d53a6")}</button>
            )}
          </div>
        </FormItem>

        <FormItem label={tr("browser.pages.coreManagement.CoreDownloadModal.label.0f3e47e")}>
          <select
            value={form.proxyMode}
            onChange={e => {
              const mode = e.target.value
              setForm(prev => ({
                ...prev,
                proxyMode: mode,
                proxyId: mode === 'custom' && proxies.length > 0 ? proxies[0].proxyId : '',
              }))
            }}
            className="w-full h-9 px-3 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] focus:border-[var(--color-accent)]"
            disabled={progress !== null}
          >
            <option value="system">{tr("browser.pages.coreManagement.CoreDownloadModal.text.1e21cc1")}</option>
            <option value="direct">{tr("browser.pages.coreManagement.CoreDownloadModal.text.08c13c3")}</option>
            {proxies.length > 0 && <option value={tr("ui.modules.browser.pages.coreManagement.CoreDownloadModal.label.f9ac14b")}>{tr("browser.pages.coreManagement.CoreDownloadModal.text.305690e")}</option>}
          </select>
        </FormItem>

        {form.proxyMode === 'custom' && (
          <FormItem label={tr("browser.pages.AutoConfigPage.text.313f10d")} required>
            <select
              value={form.proxyId}
              onChange={e => setForm(prev => ({ ...prev, proxyId: e.target.value }))}
              className="w-full h-9 px-3 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] focus:border-[var(--color-accent)]"
              disabled={progress !== null}
            >
              {proxies.map(proxy => (
                <option key={proxy.proxyId} value={proxy.proxyId}>
                  {proxy.proxyName} ({proxy.proxyConfig})
                </option>
              ))}
            </select>
          </FormItem>
        )}

        {progress && (
          <div className="mt-4 p-4 border border-[var(--color-border-default)] rounded-lg bg-[var(--color-bg-secondary)]">
            <div className="flex justify-between text-sm mb-2">
              <span className="font-medium text-[var(--color-text-primary)]">{translateMessage(progress.message)}</span>
              <span className="text-[var(--color-text-muted)]">{progress.progress}%</span>
            </div>
            <div className="w-full bg-[var(--color-bg-surface)] rounded-full h-2 overflow-hidden border border-[var(--color-border-muted)]">
              <div
                className="bg-[var(--color-accent)] h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.max(0, Math.min(100, progress.progress))}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

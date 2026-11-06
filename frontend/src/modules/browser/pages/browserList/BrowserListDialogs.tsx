import { getLocale, translateMessage } from '../../../../shared/i18n'
import { tr, useLocale } from '../../../../shared/i18n'
import { Link } from 'react-router-dom'
import { XCircle } from 'lucide-react'
import { Button, Modal } from '../../../../shared/components'
import { BrowserProfileCopyForm } from '../../components/BrowserProfileCopyForm'
import { KeywordsModal } from '../../components/KeywordsModal'
import type { BrowserProfile, BrowserProfileCopyOptions } from '../../types'

interface BrowserListDialogsProps {
  proxyErrorModal: boolean
  pendingStartId: string | null
  proxyErrorMsg: string
  onCloseProxyError: () => void
  onStartDirect: () => void
  startingDirect: boolean
  kwModal: { open: boolean; profile: BrowserProfile | null }
  onCloseKeywords: () => void
  onKeywordsSaved: (keywords: string[]) => void
  copyModal: { open: boolean; profile: BrowserProfile | null }
  copyName: string
  copyOptions: BrowserProfileCopyOptions
  onCopyNameChange: (value: string) => void
  onCopyOptionsChange: (value: BrowserProfileCopyOptions) => void
  onCloseCopy: () => void
  onConfirmCopy: () => void
  copyConfirmDisabled: boolean
  copying: boolean
  deleteConfirm: { open: boolean; mode: 'single' | 'batch'; profileName?: string; count: number }
  deleting: boolean
  onCloseDeleteConfirm: () => void
  onConfirmDelete: () => void
  trashModalOpen: boolean
  trashProfiles: BrowserProfile[]
  trashLoading: boolean
  restoringId: string
  permanentlyDeletingId: string
  permanentDeleteConfirm: { open: boolean; profile: BrowserProfile | null }
  onCloseTrash: () => void
  onRestoreProfile: (profileId: string) => void
  onOpenPermanentDelete: (profile: BrowserProfile) => void
  onClosePermanentDelete: () => void
  onConfirmPermanentDelete: () => void
  opError: string
  onCloseOpError: () => void
}

export function BrowserListDialogs({
  proxyErrorModal,
  pendingStartId,
  proxyErrorMsg,
  onCloseProxyError,
  onStartDirect,
  startingDirect,
  kwModal,
  onCloseKeywords,
  onKeywordsSaved,
  copyModal,
  copyName,
  copyOptions,
  onCopyNameChange,
  onCopyOptionsChange,
  onCloseCopy,
  onConfirmCopy,
  copyConfirmDisabled,
  copying,
  deleteConfirm,
  deleting,
  onCloseDeleteConfirm,
  onConfirmDelete,
  trashModalOpen,
  trashProfiles,
  trashLoading,
  restoringId,
  permanentlyDeletingId,
  permanentDeleteConfirm,
  onCloseTrash,
  onRestoreProfile,
  onOpenPermanentDelete,
  onClosePermanentDelete,
  onConfirmPermanentDelete,
  opError,
  onCloseOpError,
}: BrowserListDialogsProps) {
  useLocale()

  const formatTime = (value?: string) => {
    if (!value) return '-'
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString(getLocale())
  }

  const formatExpireTime = (value?: string) => {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    date.setDate(date.getDate() + 3)
    return date.toLocaleString(getLocale())
  }

  return (
    <>
      <Modal
        open={proxyErrorModal}
        onClose={translateMessage(onCloseProxyError)}
        title={tr("browser.pages.browserList.BrowserListDialogs.title.ebdf8d8")}
        width="420px"
        footer={
          <>
            <Button variant="secondary" onClick={translateMessage(onCloseProxyError)} disabled={startingDirect}>{tr("App.CloseConfirmModal.4d0b468")}</Button>
            {pendingStartId && (
              <Button variant="secondary" onClick={onStartDirect} loading={startingDirect}>{tr("browser.pages.browserList.BrowserListDialogs.text.215da23")}</Button>
            )}
            {pendingStartId && (
              <Link to={`/browser/edit/${pendingStartId}`}>
                <Button onClick={translateMessage(onCloseProxyError)} disabled={startingDirect}>{tr("browser.pages.browserList.BrowserListDialogs.text.2dc6d88")}</Button>
              </Link>
            )}
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--color-bg-secondary)]">
            <XCircle className="w-5 h-5 text-[var(--color-error)] mt-0.5 shrink-0" />
            <p className="text-sm text-[var(--color-text-primary)]">{proxyErrorMsg}</p>
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">{tr("browser.pages.browserList.BrowserListDialogs.text.7712716")}</p>
        </div>
      </Modal>

      {kwModal.profile && (
        <KeywordsModal
          open={kwModal.open}
          profileId={kwModal.profile.profileId}
          profileName={kwModal.profile.profileName}
          initialKeywords={kwModal.profile.keywords || []}
          onClose={onCloseKeywords}
          onSaved={onKeywordsSaved}
        />
      )}

      <Modal
        open={copyModal.open}
        onClose={onCloseCopy}
        title={tr("browser.pages.BrowserCopyPage.title.7d46ab5")}
        width="720px"
        footer={
          <>
            <Button variant="secondary" onClick={onCloseCopy}>{tr("App.CloseConfirmModal.4d0b468")}</Button>
            <Button onClick={onConfirmCopy} loading={copying} disabled={copyConfirmDisabled}>{tr("browser.pages.browserList.BrowserListDialogs.text.25654ca")}</Button>
          </>
        }
      >
        <BrowserProfileCopyForm
          sourceName={copyModal.profile?.profileName}
          copyName={copyName}
          copyOptions={copyOptions}
          onCopyNameChange={onCopyNameChange}
          onCopyOptionsChange={onCopyOptionsChange}
          autoFocusName
        />
      </Modal>

      <Modal
        open={deleteConfirm.open}
        onClose={onCloseDeleteConfirm}
        title={tr("browser.pages.browserList.BrowserListDialogs.title.6e73a5f")}
        width="400px"
        footer={
          <>
            <Button variant="secondary" onClick={onCloseDeleteConfirm} disabled={deleting}>{tr("App.CloseConfirmModal.4d0b468")}</Button>
            <Button variant="danger" onClick={onConfirmDelete} loading={deleting}>{tr("browser.pages.browserList.BrowserListDialogs.text.56e90a3")}</Button>
          </>
        }
      >
        <div className="text-sm text-[var(--color-text-secondary)]">
          {deleteConfirm.mode === 'batch'
            ? tr("browser.pages.browserList.BrowserListDialogs.BrowserListDialogs.ca2aebb", [deleteConfirm.count])
            : tr("browser.pages.browserList.BrowserListDialogs.BrowserListDialogs.f7c8232", [deleteConfirm.profileName || tr("browser.copyName.buildBrowserProfileCopyName.11a8063")])}
        </div>
      </Modal>

      <Modal
        open={trashModalOpen}
        onClose={onCloseTrash}
        title={tr("browser.pages.browserList.BrowserListDialogs.title.ecc12f2")}
        width="720px"
        footer={<Button variant="secondary" onClick={onCloseTrash}>{tr("ui.components.Modal.aria_label.6c14bd7")}</Button>}
      >
        {trashLoading ? (
          <div className="py-10 text-center text-sm text-[var(--color-text-muted)]">{tr("ui.components.Table.text.514c33a")}</div>
        ) : trashProfiles.length === 0 ? (
          <div className="py-10 text-center text-sm text-[var(--color-text-muted)]">{tr("browser.pages.browserList.BrowserListDialogs.text.fecda03")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border-default)] text-left text-xs text-[var(--color-text-muted)]">
                  <th className="py-2 pr-3 font-medium">{tr("config.navigation.config.name.69fffaf")}</th>
                  <th className="py-2 pr-3 font-medium">{tr("browser.pages.browserList.BrowserListDialogs.text.8d55c8d")}</th>
                  <th className="py-2 pr-3 font-medium">{tr("browser.pages.browserList.BrowserListDialogs.text.c010eec")}</th>
                  <th className="py-2 text-right font-medium">{tr("browser.components.AutomationScriptHistoryModal.text.f3ea6d3")}</th>
                </tr>
              </thead>
              <tbody>
                {trashProfiles.map((profile) => (
                  <tr key={profile.profileId} className="border-b border-[var(--color-border-muted)] last:border-0">
                    <td className="py-3 pr-3 text-[var(--color-text-primary)]">{profile.profileName || tr("browser.copyName.buildBrowserProfileCopyName.11a8063")}</td>
                    <td className="py-3 pr-3 text-[var(--color-text-secondary)]">{formatTime(profile.deletedAt)}</td>
                    <td className="py-3 pr-3 text-[var(--color-text-secondary)]">{formatExpireTime(profile.deletedAt)}</td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => onRestoreProfile(profile.profileId)}
                          loading={restoringId === profile.profileId}
                          disabled={!!permanentlyDeletingId}
                        >{tr("browser.components.SnapshotTab.text.79748ca")}</Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => onOpenPermanentDelete(profile)}
                          loading={permanentlyDeletingId === profile.profileId}
                          disabled={!!restoringId}
                        >{tr("browser.pages.browserList.BrowserListDialogs.text.8c0b37b")}</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      <Modal
        open={permanentDeleteConfirm.open}
        onClose={onClosePermanentDelete}
        title={tr("browser.pages.browserList.BrowserListDialogs.title.02d602b")}
        width="420px"
        footer={
          <>
            <Button variant="secondary" onClick={onClosePermanentDelete} disabled={!!permanentlyDeletingId}>{tr("App.CloseConfirmModal.4d0b468")}</Button>
            <Button variant="danger" onClick={onConfirmPermanentDelete} loading={!!permanentlyDeletingId}>{tr("browser.pages.browserList.BrowserListDialogs.text.8c0b37b")}</Button>
          </>
        }
      >
        <div className="space-y-2 text-sm text-[var(--color-text-secondary)]">
          <p>{tr("browser.pages.browserList.BrowserListDialogs.text.44e64c4")}{permanentDeleteConfirm.profile?.profileName || tr("browser.copyName.buildBrowserProfileCopyName.11a8063")}」？</p>
          <p className="text-[var(--color-error)]">{tr("browser.pages.browserList.BrowserListDialogs.text.4f6640a")}</p>
        </div>
      </Modal>

      <Modal
        open={!!opError}
        onClose={translateMessage(onCloseOpError)}
        title={tr("browser.pages.TagManagementPage.TagManagementPage.09e424b")}
        width="420px"
        footer={<Button onClick={translateMessage(onCloseOpError)}>{tr("browser.pages.BrowserEditPage.text.cb63c62")}</Button>}
      >
        <div className="text-[var(--color-text-secondary)] whitespace-pre-line">{translateMessage(opError)}</div>
      </Modal>
    </>
  )
}

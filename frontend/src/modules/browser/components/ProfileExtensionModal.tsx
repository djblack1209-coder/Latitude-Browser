import { tr, useLocale } from '../../../shared/i18n'
import { useEffect, useMemo, useState } from 'react'
import { Button, Modal, toast } from '../../../shared/components'
import type { BrowserExtension, BrowserProfile } from '../types'
import {
  fetchBrowserExtensions,
  fetchBrowserProfileExtensionSettings,
  saveBrowserProfileExtensionSettings,
} from '../api/extensions'

interface ProfileExtensionModalProps {
  open: boolean
  profile: BrowserProfile | null
  onClose: () => void
}

export function ProfileExtensionModal({ open, profile, onClose }: ProfileExtensionModalProps) {
  const uiLocale = useLocale()

  const [extensions, setExtensions] = useState<BrowserExtension[]>([])
  const [configured, setConfigured] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds, uiLocale])

  useEffect(() => {
    if (!open || !profile) return
    setLoading(true)
    Promise.all([
      fetchBrowserExtensions(),
      fetchBrowserProfileExtensionSettings(profile.profileId),
    ]).then(([extensionItems, settings]) => {
      setExtensions(extensionItems)
      setConfigured(settings.configured)
      setSelectedIds(settings.extensionIds)
    }).catch((error: any) => {
      toast.error(error?.message || tr("browser.components.ProfileExtensionModal.ProfileExtensionModal.0a6befa"))
    }).finally(() => setLoading(false))
  }, [open, profile])

  const toggleExtension = (extensionId: string, checked: boolean) => {
    setSelectedIds((current) => {
      if (checked) return current.includes(extensionId) ? current : [...current, extensionId]
      return current.filter((item) => item !== extensionId)
    })
  }

  const handleSave = async () => {
    if (!profile) return
    setSaving(true)
    try {
      await saveBrowserProfileExtensionSettings(profile.profileId, selectedIds, configured)
      toast.success(tr("browser.components.ProfileExtensionModal.ProfileExtensionModal.94da314"))
      onClose()
    } catch (error: any) {
      toast.error(error?.message || tr("browser.components.ProfileExtensionModal.ProfileExtensionModal.4a992fe"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={profile ? tr("browser.components.ProfileExtensionModal.ProfileExtensionModal.c9bb3af", [profile.profileName]) : tr("browser.components.ProfileExtensionModal.ProfileExtensionModal.3a36815")}
      width="640px"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{tr("App.CloseConfirmModal.4d0b468")}</Button>
          <Button onClick={handleSave} loading={saving} disabled={loading}>{tr("browser.components.BrowserListLayout.text.fadf24d")}</Button>
        </>
      )}
    >
      <div className="space-y-3">
        <label className="flex items-center justify-between rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-muted)] px-3 py-2">
          <span className="text-sm text-[var(--color-text-primary)]">{tr("browser.components.ProfileExtensionModal.text.a2b75bc")}</span>
          <input
            type="checkbox"
            checked={configured}
            onChange={(event) => setConfigured(event.target.checked)}
            className="h-4 w-4 rounded accent-[var(--color-accent)]"
          />
        </label>

        {!configured ? (
          <div className="rounded-xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-bg-muted)] px-4 py-5 text-sm text-[var(--color-text-muted)]">{tr("browser.components.ProfileExtensionModal.text.d9efae8")}</div>
        ) : null}

        <div className="max-h-[360px] space-y-2 overflow-auto pr-1">
          {extensions.map((extension) => (
            <label key={extension.extensionId} className={`flex items-start gap-3 rounded-xl border border-[var(--color-border-default)] px-3 py-2 ${configured ? 'bg-[var(--color-bg-surface)]' : 'bg-[var(--color-bg-muted)] opacity-70'}`}>
              <input
                type="checkbox"
                disabled={!configured}
                checked={selectedSet.has(extension.extensionId)}
                onChange={(event) => toggleExtension(extension.extensionId, event.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 rounded accent-[var(--color-accent)]"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-[var(--color-text-primary)]">
                  <span>{extension.name || extension.extensionId}</span>
                  {extension.version ? <span className="text-xs font-normal text-[var(--color-text-muted)]">v{extension.version}</span> : null}
                  {!extension.enabled ? <span className="rounded bg-[var(--color-bg-muted)] px-1.5 py-0.5 text-xs text-[var(--color-text-muted)]">{tr("browser.components.ProfileExtensionModal.text.082afa3")}</span> : null}
                </div>
                <div className="mt-1 break-all font-mono text-xs text-[var(--color-text-muted)]">{extension.extensionId}</div>
              </div>
            </label>
          ))}

          {extensions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-bg-muted)] px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">{tr("browser.components.ProfileExtensionModal.text.9b8d74c")}</div>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}

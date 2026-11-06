import { tr, useLocale } from '../../../../shared/i18n'
﻿import { Button, FormItem, Input, Modal, Textarea } from '../../../../shared/components'
import type { ProxyCheckSettings } from '../../types'

interface ProxyPoolCheckSettingsModalProps {
  open: boolean
  checkSettings: ProxyCheckSettings
  checkTargetsText: string
  saving: boolean
  onClose: () => void
  onSave: () => void
  onCheckSettingsChange: (updater: (current: ProxyCheckSettings) => ProxyCheckSettings) => void
  onCheckTargetsTextChange: (value: string) => void
}

export function ProxyPoolCheckSettingsModal({
  open,
  checkSettings,
  checkTargetsText,
  saving,
  onClose,
  onSave,
  onCheckSettingsChange,
  onCheckTargetsTextChange,
}: ProxyPoolCheckSettingsModalProps) {
  useLocale()

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tr("browser.pages.proxyPool.ProxyPoolCheckSettingsModal.title.a99f37b")}
      width="760px"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{tr("App.CloseConfirmModal.4d0b468")}</Button>
          <Button onClick={onSave} loading={saving}>{tr("browser.components.BrowserListLayout.text.fadf24d")}</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <FormItem label={tr("browser.pages.proxyPool.ProxyPoolCheckSettingsModal.label.f906b02")} >
          <Input
            type="number"
            value={checkSettings.bridgeStartTimeoutMs}
            onChange={(e) => onCheckSettingsChange(prev => ({ ...prev, bridgeStartTimeoutMs: Number(e.target.value) || 15000 }))}
          />
        </FormItem>
        <FormItem label={tr("browser.pages.proxyPool.ProxyPoolCheckSettingsModal.label.be4e12f")}>
          <Input
            value={checkSettings.speedTargetId}
            onChange={(e) => onCheckSettingsChange(prev => ({ ...prev, speedTargetId: e.target.value }))}
          />
        </FormItem>
        <FormItem label={tr("browser.pages.proxyPool.ProxyPoolCheckSettingsModal.label.4b33e16")}>
          <Input
            value={checkSettings.ipHealthTargetId}
            onChange={(e) => onCheckSettingsChange(prev => ({ ...prev, ipHealthTargetId: e.target.value }))}
          />
        </FormItem>
        <FormItem label={tr("browser.pages.proxyPool.ProxyPoolCheckSettingsModal.label.87c41bb")}>
          <Textarea
            value={checkTargetsText}
            onChange={(e) => onCheckTargetsTextChange(e.target.value)}
            rows={14}
          />
        </FormItem>
      </div>
    </Modal>
  )
}

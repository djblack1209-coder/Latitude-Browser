import { tr, useLocale } from '../../../../shared/i18n'
import type { Dispatch, SetStateAction } from 'react'
import { Button, FormItem, Input, Modal, Switch, Textarea } from '../../../../shared/components'
import type { CoreSettingsForm } from '../coreManagement.types'

interface CoreSettingsModalProps {
  open: boolean
  form: CoreSettingsForm
  saving: boolean
  setForm: Dispatch<SetStateAction<CoreSettingsForm>>
  onClose: () => void
  onSave: () => void
}

export function CoreSettingsModal({ open, form, saving, setForm, onClose, onSave }: CoreSettingsModalProps) {
  useLocale()

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tr("browser.pages.coreManagement.CoreSettingsModal.title.1436e9a")}
      width="550px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{tr("App.CloseConfirmModal.4d0b468")}</Button>
          <Button onClick={onSave} loading={saving}>{tr("browser.components.BrowserListLayout.text.fadf24d")}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormItem label={tr("browser.components.BrowserListLayout.label.5b23d25")}>
          <Input
            value={form.userDataRoot}
            onChange={e => setForm(prev => ({ ...prev, userDataRoot: e.target.value }))}
            placeholder={tr("browser.pages.coreManagement.CoreSettingsModal.placeholder.ab3ee0f")}
          />
        </FormItem>
        <FormItem label={tr("browser.components.BrowserListLayout.label.51c2e53")}>
          <Textarea
            value={form.defaultFingerprintArgs}
            onChange={e => setForm(prev => ({ ...prev, defaultFingerprintArgs: e.target.value }))}
            rows={4}
            placeholder={tr("browser.pages.coreManagement.CoreSettingsModal.placeholder.cd72308")}
          />
        </FormItem>
        <FormItem label={tr("browser.components.BrowserListLayout.label.0b1e606")}>
          <Textarea
            value={form.defaultLaunchArgs}
            onChange={e => setForm(prev => ({ ...prev, defaultLaunchArgs: e.target.value }))}
            rows={4}
            placeholder={tr("browser.pages.coreManagement.CoreSettingsModal.placeholder.d66ec18")}
          />
        </FormItem>
        <FormItem label={tr("browser.components.BrowserListLayout.label.d97e30a")} consequence={tr("browser.components.BrowserSettingsModal.hint.c8e2f04")}>
          <Textarea
            value={form.defaultStartUrls}
            onChange={e => setForm(prev => ({ ...prev, defaultStartUrls: e.target.value }))}
            rows={4}
            placeholder={tr("browser.components.BrowserListLayout.placeholder.64515b5")}
          />
        </FormItem>
        <FormItem label={tr("browser.components.BrowserListLayout.label.e6ab791")}>
          <div className="flex items-center justify-between rounded-lg border border-[var(--color-border-default)] px-3 py-2">
            <span className="text-sm text-[var(--color-text-primary)]">{tr("browser.components.BrowserListLayout.text.2d1a8ea")}</span>
            <Switch
              checked={form.lightStartEnabled}
              onChange={checked => setForm(prev => ({ ...prev, lightStartEnabled: checked }))}
            />
          </div>
        </FormItem>
        <FormItem label={tr("browser.components.BrowserListLayout.label.48e49d9")}>
          <div className="flex items-center justify-between rounded-lg border border-[var(--color-border-default)] px-3 py-2">
            <div>
              <p className="text-sm text-[var(--color-text-primary)]">{tr("browser.components.BrowserListLayout.text.1fe4dd2")}</p>
            </div>
            <Switch
              checked={form.restoreLastSession}
              onChange={checked => setForm(prev => ({ ...prev, restoreLastSession: checked }))}
            />
          </div>
        </FormItem>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
          <FormItem label={tr("browser.components.BrowserListLayout.label.1d9b89e")}>
            <Input
              type="number"
              min={1000}
              step={500}
              value={form.startReadyTimeoutMs}
              onChange={e => setForm(prev => ({ ...prev, startReadyTimeoutMs: Math.max(1000, Number(e.target.value) || 3000) }))}
              placeholder="3000"
            />
          </FormItem>
          <FormItem label={tr("browser.components.BrowserListLayout.label.adb3f5b")}>
            <Input
              type="number"
              min={0}
              step={100}
              value={form.startStableWindowMs}
              onChange={e => setForm(prev => ({ ...prev, startStableWindowMs: Math.max(0, Number(e.target.value) || 1200) }))}
              placeholder="1200"
            />
          </FormItem>
        </div>
      </div>
    </Modal>
  )
}

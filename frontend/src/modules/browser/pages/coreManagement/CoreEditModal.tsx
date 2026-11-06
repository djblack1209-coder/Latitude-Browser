import { translateMessage } from '../../../../shared/i18n'
import { tr, useLocale } from '../../../../shared/i18n'
import type { Dispatch, SetStateAction } from 'react'
import { Button, FormItem, Input, Modal } from '../../../../shared/components'
import type { BrowserCoreValidateResult } from '../../types'
import type { CoreEditForm } from '../coreManagement.types'

interface CoreEditModalProps {
  open: boolean
  isEditing: boolean
  form: CoreEditForm
  saving: boolean
  pathValidating: boolean
  pathValidResult: BrowserCoreValidateResult | null
  setForm: Dispatch<SetStateAction<CoreEditForm>>
  onClose: () => void
  onSave: () => void
}

export function CoreEditModal({
  open,
  isEditing,
  form,
  saving,
  pathValidating,
  pathValidResult,
  setForm,
  onClose,
  onSave,
}: CoreEditModalProps) {
  useLocale()

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? tr("browser.components.BrowserListLayout.BrowserCoreEditorModal.7863964") : tr("browser.components.BrowserListLayout.text.c5ae8df")}
      width="500px"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{tr("App.CloseConfirmModal.4d0b468")}</Button>
          <Button onClick={onSave} loading={saving}>{tr("browser.components.BrowserListLayout.text.fadf24d")}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormItem label={tr("browser.components.BrowserListLayout.label.01e4c4a")} required>
          <Input
            value={form.coreName}
            onChange={e => setForm(prev => ({ ...prev, coreName: e.target.value }))}
            placeholder={tr("browser.pages.coreManagement.CoreEditModal.placeholder.3103744")}
          />
        </FormItem>
        <FormItem label={tr("browser.components.BrowserListLayout.label.a1d450e")} required>
          <Input
            value={form.corePath}
            onChange={e => setForm(prev => ({ ...prev, corePath: e.target.value }))}
            placeholder={tr("browser.pages.coreManagement.CoreEditModal.placeholder.4bfe401")}
          />
          {pathValidating && (
            <p className="text-xs text-[var(--color-text-muted)] mt-1">{tr("browser.pages.coreManagement.CoreEditModal.text.efafa93")}</p>
          )}
          {!pathValidating && pathValidResult && (
            <p className={`text-xs mt-1 ${pathValidResult.valid ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
              {translateMessage(pathValidResult.message)}
            </p>
          )}
        </FormItem>
      </div>
    </Modal>
  )
}

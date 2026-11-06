import { translateMessage } from '../../../shared/i18n'
import { tr, useLocale } from '../../../shared/i18n'
﻿import { useState } from 'react'
import { CheckCircle, Edit2, Plus, Star, Trash2, XCircle } from 'lucide-react'
import { Button, Card, FormItem, Input, Modal, Switch, Table, Textarea, toast } from '../../../shared/components'
import type { TableColumn } from '../../../shared/components/Table'
import type { BrowserCore, BrowserCoreInput, BrowserSettings } from '../types'
import {
  deleteBrowserCore,
  saveBrowserCore,
  saveBrowserSettings,
  setDefaultBrowserCore,
  validateBrowserCorePath,
} from '../api'

interface BrowserSettingsModalProps {
  open: boolean
  onClose: () => void
  settings: BrowserSettings
  cores: BrowserCore[]
  onCoresChange: (cores: BrowserCore[]) => void
}

export function BrowserSettingsModal({ open, onClose, settings: initSettings, cores, onCoresChange }: BrowserSettingsModalProps) {
  useLocale()

  const [settings, setSettings] = useState<BrowserSettings>(initSettings)
  const [fingerprintText, setFingerprintText] = useState((initSettings.defaultFingerprintArgs || []).join('\n'))
  const [launchText, setLaunchText] = useState((initSettings.defaultLaunchArgs || []).join('\n'))
  const [startUrlsText, setStartUrlsText] = useState((initSettings.defaultStartUrls || []).join('\n'))
  const [saving, setSaving] = useState(false)

  // 内核编辑弹窗
  const [coreModalOpen, setCoreModalOpen] = useState(false)
  const [coreForm, setCoreForm] = useState<BrowserCoreInput>({ coreId: '', coreName: '', corePath: '', isDefault: false })
  const [coreValidation, setCoreValidation] = useState<{ valid: boolean; message: string } | null>(null)
  const [savingCore, setSavingCore] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveBrowserSettings({
        ...settings,
        defaultFingerprintArgs: fingerprintText.split('\n').map(s => s.trim()).filter(Boolean),
        defaultLaunchArgs: launchText.split('\n').map(s => s.trim()).filter(Boolean),
        defaultStartUrls: startUrlsText.split('\n').map(s => s.trim()).filter(Boolean),
      })
      toast.success(tr("browser.components.BrowserSettingsModal.BrowserSettingsModal.c4e4c1a"))
      onClose()
    } catch (error: any) {
      toast.error(error?.message || tr("browser.components.BrowserSettingsModal.BrowserSettingsModal.40525a7"))
    } finally {
      setSaving(false)
    }
  }

  const handleOpenCoreModal = (core?: BrowserCore) => {
    setCoreForm(core ? { ...core } : { coreId: '', coreName: '', corePath: '', isDefault: false })
    setCoreValidation(null)
    setCoreModalOpen(true)
  }

  const handleValidateCorePath = async () => {
    if (!coreForm.corePath.trim()) { setCoreValidation({ valid: false, message: tr("browser.components.BrowserSettingsModal.message.58a1f84") }); return }
    setCoreValidation(await validateBrowserCorePath(coreForm.corePath))
  }

  const handleSaveCore = async () => {
    if (!coreForm.coreName.trim()) { toast.error(tr("browser.components.BrowserSettingsModal.BrowserSettingsModal.51faa0a")); return }
    if (!coreForm.corePath.trim()) { toast.error(tr("browser.components.BrowserSettingsModal.BrowserSettingsModal.c345da5")); return }
    setSavingCore(true)
    try {
      await saveBrowserCore(coreForm)
      toast.success(tr("browser.components.BrowserSettingsModal.BrowserSettingsModal.d59ee15"))
      setCoreModalOpen(false)
      // 刷新 cores 列表
      const { fetchBrowserCores } = await import('../api')
      onCoresChange(await fetchBrowserCores())
    } catch (error: any) {
      toast.error(error?.message || tr("browser.components.BrowserSettingsModal.BrowserSettingsModal.40525a7"))
    } finally {
      setSavingCore(false)
    }
  }

  const handleDeleteCore = async (coreId: string) => {
    if (cores.length <= 1) { toast.error(tr("browser.components.BrowserSettingsModal.BrowserSettingsModal.10c60f2")); return }
    await deleteBrowserCore(coreId)
    toast.success(tr("browser.components.BrowserSettingsModal.BrowserSettingsModal.ad82a94"))
    const { fetchBrowserCores } = await import('../api')
    onCoresChange(await fetchBrowserCores())
  }

  const handleSetDefaultCore = async (coreId: string) => {
    await setDefaultBrowserCore(coreId)
    toast.success(tr("browser.components.BrowserSettingsModal.BrowserSettingsModal.3b96c80"))
    const { fetchBrowserCores } = await import('../api')
    onCoresChange(await fetchBrowserCores())
  }

  const coreColumns: TableColumn<BrowserCore>[] = [
    { key: 'coreName', title: tr("browser.components.BrowserListLayout.title.1be7ae4") },
    { key: 'corePath', title: tr("browser.components.BrowserListLayout.title.9132e08") },
    { key: 'isDefault', title: tr("browser.api.runtime.message.c8d09cf"), render: (v) => v ? <Star className="w-4 h-4 text-[var(--color-warning)] fill-yellow-500" /> : null },
    {
      key: 'actions', title: tr("browser.components.AutomationScriptHistoryModal.text.f3ea6d3"), align: 'right',
      render: (_, record) => (
        <div className="flex justify-end gap-1">
          {!record.isDefault && <Button size="sm" variant="ghost" onClick={() => handleSetDefaultCore(record.coreId)} title={tr("browser.components.BrowserListLayout.title.536a009")}><Star className="w-4 h-4" /></Button>}
          <Button size="sm" variant="ghost" onClick={() => handleOpenCoreModal(record)} title={tr("browser.components.BrowserListLayout.title.a7f814c")}><Edit2 className="w-4 h-4" /></Button>
          <Button size="sm" variant="ghost" onClick={() => handleDeleteCore(record.coreId)} title={tr("browser.components.BrowserListLayout.title.3755f56")}><Trash2 className="w-4 h-4" /></Button>
        </div>
      ),
    },
  ]

  return (
    <>
      <Modal open={open} onClose={onClose} title={tr("browser.components.BrowserListLayout.aria_label.5095009")} width="700px"
        footer={<><Button variant="secondary" onClick={onClose}>{tr("App.CloseConfirmModal.4d0b468")}</Button><Button onClick={handleSave} loading={saving}>{tr("browser.components.BrowserListLayout.text.fadf24d")}</Button></>}>
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-[var(--color-text-primary)]">{tr("browser.components.BrowserListLayout.text.6de3e8f")}</span>
              <Button size="sm" onClick={() => handleOpenCoreModal()}><Plus className="w-4 h-4" />{tr("browser.components.BrowserListLayout.text.c5ae8df")}</Button>
            </div>
            <Card padding="none"><Table columns={coreColumns} data={cores} rowKey="coreId" /></Card>
          </div>
          <FormItem label={tr("browser.components.BrowserListLayout.label.5b23d25")}>
            <Input value={settings.userDataRoot} onChange={e => setSettings(p => ({ ...p, userDataRoot: e.target.value }))} placeholder={tr("ui.modules.browser.components.BrowserSettingsModal.label.a17c9aa")} />
          </FormItem>
          <FormItem label={tr("browser.components.BrowserListLayout.label.51c2e53")}>
            <Textarea value={fingerprintText} onChange={e => setFingerprintText(e.target.value)} rows={3} placeholder="--fingerprint-brand=Chrome" />
          </FormItem>
          <FormItem label={tr("browser.components.BrowserListLayout.label.0b1e606")}>
            <Textarea value={launchText} onChange={e => setLaunchText(e.target.value)} rows={3} placeholder="--disable-sync" />
          </FormItem>
          <FormItem label={tr("browser.components.BrowserListLayout.label.d97e30a")} consequence={tr("browser.components.BrowserSettingsModal.hint.c8e2f04")}>
            <Textarea value={startUrlsText} onChange={e => setStartUrlsText(e.target.value)} rows={4} placeholder={tr("browser.components.BrowserListLayout.placeholder.64515b5")} />
          </FormItem>
          <FormItem label={tr("browser.components.BrowserListLayout.label.e6ab791")}>
            <div className="flex items-center justify-between rounded-lg border border-[var(--color-border-default)] px-3 py-2">
              <span className="text-sm text-[var(--color-text-primary)]">{tr("browser.components.BrowserListLayout.text.2d1a8ea")}</span>
              <Switch checked={settings.lightStartEnabled} onChange={checked => setSettings(prev => ({ ...prev, lightStartEnabled: checked }))} />
            </div>
          </FormItem>
          <FormItem label={tr("browser.components.BrowserListLayout.label.48e49d9")}>
            <div className="flex items-center justify-between rounded-lg border border-[var(--color-border-default)] px-3 py-2">
              <div>
                <p className="text-sm text-[var(--color-text-primary)]">{tr("browser.components.BrowserListLayout.text.1fe4dd2")}</p>
              </div>
              <Switch checked={settings.restoreLastSession} onChange={checked => setSettings(prev => ({ ...prev, restoreLastSession: checked }))} />
            </div>
          </FormItem>
        </div>
      </Modal>

      <Modal open={coreModalOpen} onClose={() => setCoreModalOpen(false)} title={coreForm.coreId ? tr("browser.components.BrowserListLayout.BrowserCoreEditorModal.7863964") : tr("browser.components.BrowserListLayout.text.c5ae8df")} width="500px"
        footer={<><Button variant="secondary" onClick={() => setCoreModalOpen(false)}>{tr("App.CloseConfirmModal.4d0b468")}</Button><Button onClick={handleSaveCore} loading={savingCore}>{tr("browser.components.BrowserListLayout.text.fadf24d")}</Button></>}>
        <div className="space-y-4">
          <FormItem label={tr("browser.components.BrowserListLayout.label.01e4c4a")} required>
            <Input value={coreForm.coreName} onChange={e => setCoreForm(p => ({ ...p, coreName: e.target.value }))} placeholder={tr("ui.modules.browser.components.BrowserSettingsModal.label.88e29b5")} />
          </FormItem>
          <FormItem label={tr("browser.components.BrowserListLayout.label.a1d450e")} required>
            <div className="flex gap-2">
              <Input value={coreForm.corePath} onChange={e => { setCoreForm(p => ({ ...p, corePath: e.target.value })); setCoreValidation(null) }} placeholder={tr("browser.components.BrowserListLayout.placeholder.a5c344f")} className="flex-1" />
              <Button variant="secondary" onClick={handleValidateCorePath}>{tr("browser.components.BrowserListLayout.text.80144e2")}</Button>
            </div>
            {coreValidation && (
              <div className={`flex items-center gap-1 mt-1 text-sm ${coreValidation.valid ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
                {coreValidation.valid ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {translateMessage(coreValidation.message)}
              </div>
            )}
          </FormItem>
        </div>
      </Modal>
    </>
  )
}

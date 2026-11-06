import { tr } from '../../../../shared/i18n'
﻿import { useState } from 'react'
import { toast } from '../../../../shared/components'
import type { BrowserCore, BrowserCoreInput, BrowserSettings } from '../../types'
import {
  deleteBrowserCore,
  fetchBrowserCores,
  fetchCoreExtendedInfo,
  fetchBrowserSettings,
  saveBrowserCore,
  saveBrowserSettings,
  setDefaultBrowserCore,
  validateBrowserCorePath,
} from '../../api'

const DEFAULT_BROWSER_SETTINGS: BrowserSettings = {
  userDataRoot: 'data',
  defaultFingerprintArgs: [],
  defaultLaunchArgs: [],
  defaultStartUrls: [],
  lightStartEnabled: true,
  restoreLastSession: false,
  startReadyTimeoutMs: 3000,
  startStableWindowMs: 1200,
  defaultConnectorType: 'xray',
}

export function useBrowserListSettings() {
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [settings, setSettings] = useState<BrowserSettings>(DEFAULT_BROWSER_SETTINGS)
  const [fingerprintText, setFingerprintText] = useState('')
  const [launchText, setLaunchText] = useState('')
  const [startUrlsText, setStartUrlsText] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)

  const [cores, setCores] = useState<BrowserCore[]>([])
  const [coreModalOpen, setCoreModalOpen] = useState(false)
  const [coreForm, setCoreForm] = useState<BrowserCoreInput>({ coreId: '', coreName: '', corePath: '', isDefault: false })
  const [coreValidation, setCoreValidation] = useState<{ valid: boolean; message: string } | null>(null)
  const [savingCore, setSavingCore] = useState(false)

  const loadSettings = async () => {
    const data = await fetchBrowserSettings()
    setSettings(data)
    setFingerprintText((data.defaultFingerprintArgs || []).join('\n'))
    setLaunchText((data.defaultLaunchArgs || []).join('\n'))
    setStartUrlsText((data.defaultStartUrls || []).join('\n'))
  }

  const loadCores = async () => {
    const [items, details] = await Promise.all([fetchBrowserCores(), fetchCoreExtendedInfo().catch(() => [])])
    const versions = new Map(details.map(item => [item.coreId, item.chromeVersion]))
    setCores(items.map(item => ({ ...item, chromeVersion: versions.get(item.coreId) })))
  }

  const handleOpenSettings = async () => {
    await Promise.all([loadSettings(), loadCores()])
    setSettingsModalOpen(true)
  }

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      await saveBrowserSettings({
        ...settings,
        defaultFingerprintArgs: fingerprintText.split('\n').map(s => s.trim()).filter(Boolean),
        defaultLaunchArgs: launchText.split('\n').map(s => s.trim()).filter(Boolean),
        defaultStartUrls: startUrlsText.split('\n').map(s => s.trim()).filter(Boolean),
      })
      toast.success(tr("browser.components.BrowserSettingsModal.BrowserSettingsModal.c4e4c1a"))
      setSettingsModalOpen(false)
    } catch (error: any) {
      toast.error(error?.message || tr("browser.components.BrowserSettingsModal.BrowserSettingsModal.40525a7"))
    } finally {
      setSavingSettings(false)
    }
  }

  const handleOpenCoreModal = (core?: BrowserCore) => {
    setCoreForm(core ? { ...core } : { coreId: '', coreName: '', corePath: '', isDefault: false })
    setCoreValidation(null)
    setCoreModalOpen(true)
  }

  const handleValidateCorePath = async () => {
    if (!coreForm.corePath.trim()) {
      setCoreValidation({ valid: false, message: tr("browser.components.BrowserSettingsModal.message.58a1f84") })
      return
    }
    const result = await validateBrowserCorePath(coreForm.corePath)
    setCoreValidation(result)
  }

  const handleSaveCore = async () => {
    if (!coreForm.coreName.trim()) {
      toast.error(tr("browser.components.BrowserSettingsModal.BrowserSettingsModal.51faa0a"))
      return
    }
    if (!coreForm.corePath.trim()) {
      toast.error(tr("browser.components.BrowserSettingsModal.BrowserSettingsModal.c345da5"))
      return
    }
    setSavingCore(true)
    try {
      await saveBrowserCore(coreForm)
      toast.success(tr("browser.components.BrowserSettingsModal.BrowserSettingsModal.d59ee15"))
      setCoreModalOpen(false)
      loadCores()
    } catch (error: any) {
      toast.error(error?.message || tr("browser.components.BrowserSettingsModal.BrowserSettingsModal.40525a7"))
    } finally {
      setSavingCore(false)
    }
  }

  const handleDeleteCore = async (coreId: string) => {
    if (cores.length <= 1) {
      toast.error(tr("browser.components.BrowserSettingsModal.BrowserSettingsModal.10c60f2"))
      return
    }
    await deleteBrowserCore(coreId)
    toast.success(tr("browser.components.BrowserSettingsModal.BrowserSettingsModal.ad82a94"))
    loadCores()
  }

  const handleSetDefaultCore = async (coreId: string) => {
    await setDefaultBrowserCore(coreId)
    toast.success(tr("browser.components.BrowserSettingsModal.BrowserSettingsModal.3b96c80"))
    loadCores()
  }

  return {
    settingsModalOpen,
    setSettingsModalOpen,
    settings,
    setSettings,
    fingerprintText,
    setFingerprintText,
    launchText,
    setLaunchText,
    startUrlsText,
    setStartUrlsText,
    savingSettings,
    cores,
    coreModalOpen,
    setCoreModalOpen,
    coreForm,
    setCoreForm,
    coreValidation,
    setCoreValidation,
    savingCore,
    loadCores,
    handleOpenSettings,
    handleSaveSettings,
    handleOpenCoreModal,
    handleValidateCorePath,
    handleSaveCore,
    handleDeleteCore,
    handleSetDefaultCore,
  }
}
